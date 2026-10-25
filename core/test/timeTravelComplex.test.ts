import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { issueCredential } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId } from '../src/crypto.js';
import { InstitutionStatus, KeyStatus, ReasonCode } from '../src/types.js';

describe('Time Travel Across Sequential Lifecycle Events', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:lifecycle-inst';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
  const institutionId = computeInstitutionId(issuerDid);

  const tAnchor = 1000;
  const tSuspended = 2000;
  const tReinstated = 3000;
  const tRevoked = 4000;

  const source = new MockTrustSource();
  source.currentTimestamp = 5000;
  source.currentBlock = 100;

  source.setInstitution(institutionId, {
    did: issuerDid,
    nameHash: '0x123',
    admin: issuerWallet.address,
    status: InstitutionStatus.Active,
  });

  source.setKey(issuerWallet.address, {
    institutionId,
    status: KeyStatus.Active,
    validFrom: 500,
    compromisedAt: 0,
  });

  it('correctly reports status based on asOfTimestamp query point', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: { student: 'Lifecycle Alice' },
      issuanceDate: tAnchor,
    });

    source.setAnchor(cred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: cred.merkleRoot,
      schemaHash: '0xschema',
      timestamp: tAnchor,
      blockNumber: 10,
      txHash: '0xanc',
    });

    // Currently revoked at tRevoked
    source.setStatus(cred.id, {
      state: 2,
      reasonCode: ReasonCode.Superseded,
      timestamp: tRevoked,
      by: issuerWallet.address,
      txHash: '0xrev',
    });

    // 1. Time travel to t = 1500 (before suspension / revocation) -> VALID
    const res1500 = await verify(cred, source, { asOfTimestamp: 1500 });
    expect(res1500.verdict).toBe('VALID');
    expect(res1500.rules.find((r) => r.id === 'R7')?.status).toBe('pass');

    // 2. Time travel to before anchoring (t = 800) -> INVALID (not anchored yet)
    const res800 = await verify(cred, source, { asOfTimestamp: 800 });
    expect(res800.verdict).toBe('INVALID');
    expect(res800.rules.find((r) => r.id === 'R6')?.status).toBe('fail');

    // 3. Current time evaluation (t = 5000) -> INVALID (revoked)
    const resNow = await verify(cred, source);
    expect(resNow.verdict).toBe('INVALID');
    expect(resNow.rules.find((r) => r.id === 'R7')?.status).toBe('fail');
  });
});
