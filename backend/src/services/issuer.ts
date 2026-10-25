import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import { chainService } from './chain.js';
import { keystore } from './keystore.js';
import { canonicalize } from './snapshot.js';
import { getDb } from '../db/index.js';
import type { Credential } from '../../../shared/types.js';

export class IssuerService {
  public async getIssuerWalletForInstitution(institutionId: string): Promise<{ wallet: ethers.Wallet; did: string; slug: string }> {
    const inst = await chainService.registry.getInstitution(institutionId);
    if (!inst.did) {
      throw new Error(`Institution ${institutionId} not found`);
    }

    const slug = inst.did.replace('did:trustmesh:', '');
    const keyWallet = await keystore.getOrCreateWallet('institution-key', `${slug}-1`, chainService.provider);
    return {
      wallet: keyWallet,
      did: inst.did,
      slug,
    };
  }

  public async issueCredential(params: {
    institutionId: string;
    schema: string;
    holderDid: string;
    fields: Record<string, string | number | boolean>;
    expirationDate?: number;
    predicates?: Record<string, boolean>;
    issuanceDate?: number;
  }): Promise<{ credential: Credential; txHash: string; blockNumber: number }> {
    const { wallet: issuerWallet, did: issuerDid } = await this.getIssuerWalletForInstitution(params.institutionId);

    const issuanceDate = params.issuanceDate || Math.floor(Date.now() / 1000);
    const expirationDate = params.expirationDate || 0;

    const allFields: Record<string, string | number | boolean> = {
      ...params.fields,
      ...(params.predicates || {}),
    };

    const sortedFieldNames = Object.keys(allFields).sort();
    const salts: Record<string, string> = {};
    const leaves: Record<string, string> = {};
    const leafArray: string[] = [];

    for (const name of sortedFieldNames) {
      const salt = ethers.hexlify(ethers.randomBytes(32));
      salts[name] = salt;
      const canonVal = canonicalize(allFields[name]);
      const leaf = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|${name}|${canonVal}`));
      leaves[name] = leaf;
      leafArray.push(leaf);
    }

    const tree = new MerkleTree(leafArray, ethers.keccak256, { sortPairs: true, hashLeaves: false });
    const merkleRoot = tree.getHexRoot();

    const signedDigest = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: merkleRoot,
          issuerDid,
          issuanceDate,
          expirationDate,
          holderDid: params.holderDid,
          schema: params.schema,
        })
      )
    );

    const signature = await issuerWallet.signMessage(ethers.getBytes(signedDigest));
    const credentialId = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: merkleRoot,
          issuerDid,
          issuanceDate,
        })
      )
    );

    const credential: Credential = {
      id: credentialId,
      schema: params.schema,
      issuerDid,
      issuerKey: issuerWallet.address,
      holderDid: params.holderDid,
      issuanceDate,
      expirationDate,
      fields: allFields,
      salts,
      leaves,
      merkleRoot,
      signature,
    };

    // Anchor on-chain
    const schemaHash = ethers.keccak256(ethers.toUtf8Bytes(params.schema));
    const registryWithSigner = chainService.getContractWithSigner(issuerWallet);
    const tx = await registryWithSigner.anchorCredential(credentialId, merkleRoot, schemaHash);
    const receipt = await tx.wait(1);

    // Save metadata
    const db = getDb();
    db.prepare(`
      INSERT INTO credentials_metadata
      (credential_id, institution_id, issuer_did, holder_did, schema, issuance_date, expiration_date, merkle_root, state, reason_code, batch_id, anchored_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)
      ON CONFLICT(credential_id) DO NOTHING
    `).run(
      credentialId,
      params.institutionId,
      issuerDid,
      params.holderDid,
      params.schema,
      issuanceDate,
      expirationDate,
      merkleRoot,
      issuanceDate,
      receipt.hash
    );

    return {
      credential,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  public async issueBatch(params: {
    institutionId: string;
    items: {
      holderDid: string;
      schema: string;
      fields: Record<string, string | number | boolean>;
      expirationDate?: number;
      predicates?: Record<string, boolean>;
    }[];
  }): Promise<{ batchId: string; batchRoot: string; credentials: Credential[]; txHash: string }> {
    const { wallet: issuerWallet, did: issuerDid } = await this.getIssuerWalletForInstitution(params.institutionId);
    const timestamp = Math.floor(Date.now() / 1000);

    const unbatchedCreds: Credential[] = [];

    for (const item of params.items) {
      const allFields: Record<string, string | number | boolean> = {
        ...item.fields,
        ...(item.predicates || {}),
      };

      const sortedFieldNames = Object.keys(allFields).sort();
      const salts: Record<string, string> = {};
      const leaves: Record<string, string> = {};
      const leafArray: string[] = [];

      for (const name of sortedFieldNames) {
        const salt = ethers.hexlify(ethers.randomBytes(32));
        salts[name] = salt;
        const canonVal = canonicalize(allFields[name]);
        const leaf = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|${name}|${canonVal}`));
        leaves[name] = leaf;
        leafArray.push(leaf);
      }

      const tree = new MerkleTree(leafArray, ethers.keccak256, { sortPairs: true, hashLeaves: false });
      const merkleRoot = tree.getHexRoot();

      const signedDigest = ethers.keccak256(
        ethers.toUtf8Bytes(
          canonicalize({
            root: merkleRoot,
            issuerDid,
            issuanceDate: timestamp,
            expirationDate: item.expirationDate || 0,
            holderDid: item.holderDid,
            schema: item.schema,
          })
        )
      );

      const signature = await issuerWallet.signMessage(ethers.getBytes(signedDigest));
      const credentialId = ethers.keccak256(
        ethers.toUtf8Bytes(
          canonicalize({
            root: merkleRoot,
            issuerDid,
            issuanceDate: timestamp,
          })
        )
      );

      unbatchedCreds.push({
        id: credentialId,
        schema: item.schema,
        issuerDid,
        issuerKey: issuerWallet.address,
        holderDid: item.holderDid,
        issuanceDate: timestamp,
        expirationDate: item.expirationDate || 0,
        fields: allFields,
        salts,
        leaves,
        merkleRoot,
        signature,
      });
    }

    const credIds = unbatchedCreds.map((c) => c.id);
    const batchTree = new MerkleTree(credIds, ethers.keccak256, { sortPairs: true, hashLeaves: false });
    const batchRoot = batchTree.getHexRoot();

    const batchId = ethers.keccak256(
      ethers.concat([batchRoot, ethers.toUtf8Bytes(issuerDid), ethers.toBeHex(timestamp, 32)])
    );

    const batchedCreds = unbatchedCreds.map((c) => {
      const proof = batchTree.getHexProof(c.id);
      return {
        ...c,
        batch: {
          batchId,
          proof,
        },
      };
    });

    // Anchor batch on chain
    const registryWithSigner = chainService.getContractWithSigner(issuerWallet);
    const tx = await registryWithSigner.anchorBatch(batchId, batchRoot, batchedCreds.length);
    const receipt = await tx.wait(1);

    // Save credentials metadata
    const db = getDb();
    const insertMeta = db.prepare(`
      INSERT INTO credentials_metadata
      (credential_id, institution_id, issuer_did, holder_did, schema, issuance_date, expiration_date, merkle_root, state, reason_code, batch_id, anchored_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      ON CONFLICT(credential_id) DO NOTHING
    `);

    for (const c of batchedCreds) {
      insertMeta.run(
        c.id,
        params.institutionId,
        c.issuerDid,
        c.holderDid,
        c.schema,
        c.issuanceDate,
        c.expirationDate,
        c.merkleRoot,
        batchId,
        timestamp,
        receipt.hash
      );
    }

    return {
      batchId,
      batchRoot,
      credentials: batchedCreds,
      txHash: receipt.hash,
    };
  }

  public async revokeCredential(
    credentialId: string,
    reasonCode: number,
    actingInstitutionId?: string
  ): Promise<{ txHash?: string; reverted?: boolean; errorName?: string }> {
    try {
      // Find issuing institution
      let instId = actingInstitutionId;
      if (!instId) {
        const anchor = await chainService.registry.getAnchor(credentialId);
        if (anchor.institutionId && anchor.institutionId !== ethers.ZeroHash) {
          instId = anchor.institutionId;
        } else {
          const db = getDb();
          const row = db.prepare('SELECT institution_id FROM credentials_metadata WHERE credential_id = ?').get(credentialId) as any;
          if (row) instId = row.institution_id;
        }
      }

      if (!instId) {
        return { reverted: true, errorName: 'UnknownCredential' };
      }

      const { wallet } = await this.getIssuerWalletForInstitution(instId);
      const registryWithSigner = chainService.getContractWithSigner(wallet);

      const tx = await registryWithSigner.revokeCredential(credentialId, reasonCode);
      const receipt = await tx.wait(1);
      return { txHash: receipt.hash };
    } catch (err: any) {
      const decoded = chainService.decodeRevert(err);
      if (decoded) {
        return { reverted: true, errorName: decoded.errorName };
      }
      throw err;
    }
  }

  public async suspendCredential(
    credentialId: string,
    actingInstitutionId?: string
  ): Promise<{ txHash?: string; reverted?: boolean; errorName?: string }> {
    try {
      let instId = actingInstitutionId;
      if (!instId) {
        const anchor = await chainService.registry.getAnchor(credentialId);
        instId = anchor.institutionId;
      }

      if (!instId || instId === ethers.ZeroHash) {
        return { reverted: true, errorName: 'UnknownCredential' };
      }

      const { wallet } = await this.getIssuerWalletForInstitution(instId);
      const registryWithSigner = chainService.getContractWithSigner(wallet);

      const tx = await registryWithSigner.suspendCredential(credentialId);
      const receipt = await tx.wait(1);
      return { txHash: receipt.hash };
    } catch (err: any) {
      const decoded = chainService.decodeRevert(err);
      if (decoded) {
        return { reverted: true, errorName: decoded.errorName };
      }
      throw err;
    }
  }

  public async reinstateCredential(
    credentialId: string,
    actingInstitutionId?: string
  ): Promise<{ txHash?: string; reverted?: boolean; errorName?: string }> {
    try {
      let instId = actingInstitutionId;
      if (!instId) {
        const anchor = await chainService.registry.getAnchor(credentialId);
        instId = anchor.institutionId;
      }

      if (!instId || instId === ethers.ZeroHash) {
        return { reverted: true, errorName: 'UnknownCredential' };
      }

      const { wallet } = await this.getIssuerWalletForInstitution(instId);
      const registryWithSigner = chainService.getContractWithSigner(wallet);

      const tx = await registryWithSigner.reinstateCredential(credentialId);
      const receipt = await tx.wait(1);
      return { txHash: receipt.hash };
    } catch (err: any) {
      const decoded = chainService.decodeRevert(err);
      if (decoded) {
        return { reverted: true, errorName: decoded.errorName };
      }
      throw err;
    }
  }
}

export const issuerService = new IssuerService();
