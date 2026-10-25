import { ethers } from 'ethers';
import { getDb } from '../db/index.js';
import { chainService } from './chain.js';
import { keystore } from './keystore.js';
import type { BlastRadiusResult } from '../../../shared/types.js';

export class IncidentService {
  public async analyzeBlastRadius(keyAddress: string, compromisedAt: number): Promise<BlastRadiusResult> {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT block_timestamp, args_json FROM audit_events WHERE event_type = 'CredentialAnchored'`
      )
      .all() as any[];

    const safe: string[] = [];
    const suspicious: string[] = [];
    const afterRevoke: string[] = [];
    const holdersHashedSet = new Set<string>();

    let keyStatus = 0;
    let validFrom = 0;
    try {
      const keyInfo = await chainService.registry.getKey(keyAddress);
      keyStatus = Number(keyInfo.status);
      validFrom = Number(keyInfo.validFrom);
    } catch {
      // Chain offline
    }

    for (const r of rows) {
      const args = JSON.parse(r.args_json);
      if (args.key?.toLowerCase() === keyAddress.toLowerCase()) {
        const credId = args.credentialId;
        const ts = r.block_timestamp;

        if (ts < compromisedAt) {
          safe.push(credId);
        } else {
          suspicious.push(credId);
          if (keyStatus === 3 && ts >= Number(keyInfo.compromisedAt)) {
            afterRevoke.push(credId);
          }
          // Hash affected credential ID as placeholder for holder identifier if not explicit
          holdersHashedSet.add(ethers.keccak256(ethers.toUtf8Bytes(credId)));
        }
      }
    }

    const recommendedActions: string[] = [
      'Call /api/incident/revoke-key to mark this key permanently compromised on-chain.',
      'Notify affected credential holders regarding suspected compromise window.',
      'Re-anchor and reissue all affected credentials using a fresh institutional key.',
      'Rotate institution administrator key if guardian threshold compromise is suspected.',
    ];

    return {
      safe,
      suspicious,
      afterRevoke,
      holdersHashed: Array.from(holdersHashedSet),
      recommendedActions,
    };
  }

  public async suspendKey(keyAddress: string): Promise<string> {
    const keyInfo = await chainService.registry.getKey(keyAddress);
    const instId = keyInfo.institutionId;
    const inst = await chainService.registry.getInstitution(instId);

    // Look for institution admin wallet in keystore
    const slug = inst.did.replace('did:trustmesh:', '');
    const adminWallet = await keystore.getWallet('institution-admin', slug, chainService.provider);

    const registryAsAdmin = chainService.getContractWithSigner(adminWallet);
    const tx = await registryAsAdmin.suspendKey(keyAddress);
    const receipt = await tx.wait(1);
    return receipt.hash;
  }

  public async revokeKey(keyAddress: string, compromisedAt?: number): Promise<string> {
    const keyInfo = await chainService.registry.getKey(keyAddress);
    const instId = keyInfo.institutionId;
    const inst = await chainService.registry.getInstitution(instId);

    const slug = inst.did.replace('did:trustmesh:', '');
    const adminWallet = await keystore.getWallet('institution-admin', slug, chainService.provider);

    const compTime = compromisedAt || Math.floor(Date.now() / 1000);
    const registryAsAdmin = chainService.getContractWithSigner(adminWallet);
    const tx = await registryAsAdmin.revokeKey(keyAddress, compTime);
    const receipt = await tx.wait(1);
    return receipt.hash;
  }

  public async rotateKey(oldKey: string): Promise<{ txHash: string; newKey: string }> {
    const keyInfo = await chainService.registry.getKey(oldKey);
    const instId = keyInfo.institutionId;
    const inst = await chainService.registry.getInstitution(instId);

    const slug = inst.did.replace('did:trustmesh:', '');
    const adminWallet = await keystore.getWallet('institution-admin', slug, chainService.provider);

    const newKeyWallet = await keystore.getOrCreateWallet('institution-key', `${slug}-rotated-${Date.now()}`);

    const registryAsAdmin = chainService.getContractWithSigner(adminWallet);
    const tx = await registryAsAdmin.rotateKey(oldKey, newKeyWallet.address);
    const receipt = await tx.wait(1);

    return {
      txHash: receipt.hash,
      newKey: newKeyWallet.address,
    };
  }

  public async setDemoGuardians(institutionId: string): Promise<{ txHash: string; guardians: string[]; threshold: number }> {
    const inst = await chainService.registry.getInstitution(institutionId);
    const slug = inst.did.replace('did:trustmesh:', '');
    const adminWallet = await keystore.getWallet('institution-admin', slug, chainService.provider);

    const guardians: string[] = [];
    for (let g = 1; g <= 3; g++) {
      const gw = await keystore.getOrCreateWallet('institution-guardian', `${slug}-${g}`);
      guardians.push(gw.address);
    }

    const registryAsAdmin = chainService.getContractWithSigner(adminWallet);
    const tx = await registryAsAdmin.setGuardians(institutionId, guardians, 2);
    const receipt = await tx.wait(1);

    return {
      txHash: receipt.hash,
      guardians,
      threshold: 2,
    };
  }

  public async proposeRecovery(institutionId: string): Promise<{ proposalId: string; txHash: string; executeAfter: number }> {
    const inst = await chainService.registry.getInstitution(institutionId);
    const slug = inst.did.replace('did:trustmesh:', '');

    const guardian1 = await keystore.getOrCreateWallet('institution-guardian', `${slug}-1`, chainService.provider);
    const newAdmin = ethers.Wallet.createRandom().address;
    const newKey = ethers.Wallet.createRandom().address;

    const registryAsGuardian = chainService.getContractWithSigner(guardian1);
    const tx = await registryAsGuardian.proposeRecovery(institutionId, newAdmin, newKey);
    const receipt = await tx.wait(1);

    const delay = Number(await chainService.registry.recoveryDelay());
    const block = await chainService.provider.getBlock(receipt.blockNumber);
    const executeAfter = Number(block?.timestamp || Math.floor(Date.now() / 1000)) + delay;

    // Read proposal id from event
    let propId = '1';
    for (const log of receipt.logs) {
      try {
        const parsed = chainService.registryInterface.parseLog(log);
        if (parsed?.name === 'RecoveryProposed') {
          propId = parsed.args.proposalId.toString();
          break;
        }
      } catch {}
    }

    return {
      proposalId: propId,
      txHash: receipt.hash,
      executeAfter,
    };
  }

  public async approveRecovery(proposalId: string, guardianIndex: number): Promise<{ txHash: string; approvals: number }> {
    const prop = await chainService.registry.getRecovery(proposalId);
    const inst = await chainService.registry.getInstitution(prop.institutionId);
    const slug = inst.did.replace('did:trustmesh:', '');

    const gIndex = Math.max(1, guardianIndex + 1);
    const guardian = await keystore.getOrCreateWallet('institution-guardian', `${slug}-${gIndex}`, chainService.provider);

    const registryAsGuardian = chainService.getContractWithSigner(guardian);
    const tx = await registryAsGuardian.approveRecovery(proposalId);
    const receipt = await tx.wait(1);

    const updatedProp = await chainService.registry.getRecovery(proposalId);
    return {
      txHash: receipt.hash,
      approvals: Number(updatedProp.approvals),
    };
  }

  public async executeRecovery(proposalId: string): Promise<string> {
    const tx = await chainService.registry.executeRecovery(proposalId);
    const receipt = await tx.wait(1);
    return receipt.hash;
  }
}

export const incidentService = new IncidentService();
