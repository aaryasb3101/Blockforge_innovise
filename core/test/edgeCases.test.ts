import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { issueCredential } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId } from '../src/crypto.js';
import { InstitutionStatus, KeyStatus } from '../src/types.js';

describe('Edge Cases & Special Characters', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:iit-bombay';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
  const institutionId = computeInstitutionId(issuerDid);
  const now = 1700000000;

  const source = new MockTrustSource();
  source.currentTimestamp = now + 100;
  source.currentBlock = 60;

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

  it('handles unicode, zero-values, negative numbers, and booleans correctly', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'InternationalCredential',
      fields: {
        '日本語': 'テスト',
        specialChars: '!@#$%^&*()_+-=[]{}|;:",.<>?/~`',
        zeroNumber: 0,
        negativeFloat: -3.14159,
        booleanFalse: false,
        booleanTrue: true,
        emptyString: '',
      },
      issuanceDate: now,
    });

    source.setAnchor(cred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: cred.merkleRoot,
      schemaHash: '0xschema',
      timestamp: now + 50,
      blockNumber: 60,
      txHash: '0xedge',
    });

    const res = await verify(cred, source);
    expect(res.verdict).toBe('VALID');
    expect(res.trustScore).toBe(100);
  });
});
