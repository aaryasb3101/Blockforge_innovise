import { describe, it, expect } from 'vitest';
import { Wallet, keccak256, toUtf8Bytes } from 'ethers';
import canonicalize from 'canonicalize';
import { issueCredential } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId } from '../src/crypto.js';
import { InstitutionStatus, KeyStatus } from '../src/types.js';

describe('Receipt Generation and Verification Integrity', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:receipt-inst';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
  const institutionId = computeInstitutionId(issuerDid);
  const now = 1700000000;

  const source = new MockTrustSource();
  source.currentTimestamp = now + 100;
  source.currentBlock = 80;

  source.setInstitution(institutionId, {
    did: issuerDid,
    nameHash: '0x123',
    admin: issuerWallet.address,
    status: InstitutionStatus.Active,
  });

  source.setKey(issuerWallet.address, {
    institutionId,
    status: KeyStatus.Active,
    validFrom: now - 3600,
    compromisedAt: 0,
  });

  it('produces verifiable receipt with deterministic hash and matching metadata', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'ReceiptTestCredential',
      fields: { score: 98 },
      issuanceDate: now,
    });

    source.setAnchor(cred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: cred.merkleRoot,
      schemaHash: '0xschema',
      timestamp: now + 50,
      blockNumber: 80,
      txHash: '0xreceipttx',
    });

    const res = await verify(cred, source, { asOfTimestamp: now + 50 });

    expect(res.receipt).toBeDefined();
    expect(res.receipt.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(res.receipt.source).toBe('chain');
    expect(res.receipt.blockNumber).toBe(80);
    expect(res.receipt.asOf).toBe(now + 50);

    // Verify receipt hash construction
    const receiptPayload = {
      verdict: res.verdict,
      trustScore: res.trustScore,
      rules: res.rules.map((r) => ({ id: r.id, status: r.status, reason: r.reason })),
      verifiedAt: res.receipt.verifiedAt,
      source: 'chain',
      blockNumber: 80,
      asOf: now + 50,
    };
    const expectedHash = keccak256(toUtf8Bytes(canonicalize(receiptPayload)!));
    expect(res.receipt.hash).toBe(expectedHash);
  });
});
