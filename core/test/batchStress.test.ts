import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { issueBatch } from '../src/issuance.js';
import { verifyMerkleProof } from '../src/crypto.js';

describe('Batch Scaling & Stress Test', () => {
  it('issues and verifies a batch of 50 credentials with unique proofs', async () => {
    const issuer = Wallet.createRandom();
    const count = 50;
    const items = [];

    for (let i = 0; i < count; i++) {
      const holder = Wallet.createRandom();
      items.push({
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'StudentCredential',
        fields: {
          index: i,
          randomId: Math.random().toString(36),
          grade: 'A',
        },
      });
    }

    const start = Date.now();
    const batch = await issueBatch({
      issuerWallet: issuer,
      issuerDid: 'did:trustmesh:stress-university',
      items,
    });
    const elapsed = Date.now() - start;

    expect(batch.credentials).toHaveLength(count);
    expect(batch.batchRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(elapsed).toBeLessThan(10000); // 50 credentials issued in under 10 seconds

    // Verify every single proof against the batchRoot
    for (const cred of batch.credentials) {
      expect(cred.batch).toBeDefined();
      expect(cred.batch?.batchId).toBe(batch.batchId);
      const ok = verifyMerkleProof(cred.batch!.proof, cred.id, batch.batchRoot);
      expect(ok).toBe(true);
    }
  });
});
