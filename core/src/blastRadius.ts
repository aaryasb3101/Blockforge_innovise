import {
  Contract,
  Provider,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
import { REGISTRY_ABI } from './abi.js';

export interface BlastRadiusResult {
  safe: string[];
  suspicious: string[];
  afterRevoke: string[];
  holdersHashed: string[];
  recommendedActions: string[];
}

export interface KnownCredentialMetadata {
  id: string;
  holderDid: string;
}

/**
 * Computes blast radius of a compromised key by scanning on-chain CredentialAnchored and BatchAnchored events.
 */
export async function computeBlastRadius(
  provider: Provider,
  registryAddress: string,
  keyAddr: string,
  compromisedAt: number | bigint,
  knownCredentials?: KnownCredentialMetadata[]
): Promise<BlastRadiusResult> {
  const contract = new Contract(registryAddress, REGISTRY_ABI, provider);
  const compTime = Number(compromisedAt);

  // Check current key status on-chain
  let keyStatus = 0;
  let onChainCompromisedAt = 0;
  try {
    const keyData = await contract.getKey(keyAddr);
    keyStatus = Number(keyData[1]);
    onChainCompromisedAt = Number(keyData[3]);
  } catch {
    // Continue
  }

  // Scan CredentialAnchored events for this key
  const safe: string[] = [];
  const suspicious: string[] = [];
  const afterRevoke: string[] = [];
  const holderDidsToHash: string[] = [];

  const holderMap = new Map<string, string>();
  if (knownCredentials) {
    for (const c of knownCredentials) {
      holderMap.set(c.id.toLowerCase(), c.holderDid);
    }
  }

  try {
    const credFilter = contract.filters.CredentialAnchored(null, null, keyAddr);
    const credEvents = await contract.queryFilter(credFilter);

    for (const ev of credEvents) {
      const anyEv = ev as any;
      if (!anyEv.args) continue;
      const credId = anyEv.args[0];
      const block = anyEv.getBlock ? await anyEv.getBlock() : await provider.getBlock(ev.blockNumber);
      const timestamp = Number(block?.timestamp ?? 0);

      // Check if anchored after key revocation was executed on-chain
      if (
        keyStatus === 3 &&
        onChainCompromisedAt > 0 &&
        timestamp > onChainCompromisedAt
      ) {
        afterRevoke.push(credId);
      }

      if (timestamp < compTime) {
        safe.push(credId);
      } else {
        suspicious.push(credId);
        const holderDid = holderMap.get(credId.toLowerCase());
        if (holderDid) {
          holderDidsToHash.push(holderDid);
        } else {
          holderDidsToHash.push(`holder:anon:${credId}`);
        }
      }
    }
  } catch {
    // Continue
  }

  // Scan BatchAnchored events for this key
  try {
    const batchFilter = contract.filters.BatchAnchored(null, null, keyAddr);
    const batchEvents = await contract.queryFilter(batchFilter);

    for (const ev of batchEvents) {
      const anyEv = ev as any;
      if (!anyEv.args) continue;
      const batchId = anyEv.args[0];
      const block = anyEv.getBlock ? await anyEv.getBlock() : await provider.getBlock(ev.blockNumber);
      const timestamp = Number(block?.timestamp ?? 0);

      if (
        keyStatus === 3 &&
        onChainCompromisedAt > 0 &&
        timestamp > onChainCompromisedAt
      ) {
        afterRevoke.push(batchId);
      }

      if (timestamp < compTime) {
        safe.push(batchId);
      } else {
        suspicious.push(batchId);
        holderDidsToHash.push(`holder:batch:${batchId}`);
      }
    }
  } catch {
    // Continue
  }

  // Hash holder DIDs (NO personal data or raw DIDs exposed)
  const holdersHashed = Array.from(
    new Set(holderDidsToHash.map((did) => keccak256(toUtf8Bytes(did))))
  );

  // Generate plain English recommended actions
  const recommendedActions: string[] = [];

  if (keyStatus !== 3) {
    recommendedActions.push(
      `Immediately invoke revokeKey('${keyAddr}', ${compTime}) from the institution admin wallet.`
    );
  }

  recommendedActions.push(
    `Rotate the institution's signing key via rotateKey('${keyAddr}', <newKeyAddress>) to restore authorized issuance.`
  );

  if (suspicious.length > 0) {
    recommendedActions.push(
      `Notify the ${holdersHashed.length} affected holders that credentials issued or anchored after ${new Date(compTime * 1000).toISOString()} are under security review.`
    );
    recommendedActions.push(
      `Re-issue all ${suspicious.length} suspicious credentials under the newly registered key and publish updated anchors.`
    );
  }

  if (afterRevoke.length > 0) {
    recommendedActions.push(
      `CRITICAL ANOMALY: ${afterRevoke.length} credentials appear anchored after key revocation. Investigate registry consensus or contract state consistency.`
    );
  }

  recommendedActions.push(
    'Publish a fresh signed snapshot using publishSnapshot() to synchronize offline verifiers.'
  );

  return {
    safe,
    suspicious,
    afterRevoke,
    holdersHashed,
    recommendedActions,
  };
}
