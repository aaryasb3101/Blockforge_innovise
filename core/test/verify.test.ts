import { describe, it, expect, beforeEach } from 'vitest';
import { Wallet, ZeroAddress, keccak256, toUtf8Bytes } from 'ethers';
import { issueCredential, issueBatch, createPresentation } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId, generateSalt } from '../src/crypto.js';
import { Credential, InstitutionStatus, KeyStatus, ReasonCode } from '../src/types.js';

describe('Verification Engine (R1..R10)', () => {
  let issuerWallet: Wallet;
  let holderWallet: Wallet;
  let issuerDid: string;
  let holderDid: string;
  let institutionId: string;
  let source: MockTrustSource;
  let baseCredential: Credential;
  let baseTimestamp: number;

  beforeEach(async () => {
    issuerWallet = Wallet.createRandom();
    holderWallet = Wallet.createRandom();
    issuerDid = 'did:trustmesh:iit-bombay';
    holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
    institutionId = computeInstitutionId(issuerDid);
    baseTimestamp = 1700000000;

    source = new MockTrustSource();
    source.currentTimestamp = baseTimestamp + 300;
    source.currentBlock = 42;

    // Seed active institution
    source.setInstitution(institutionId, {
      did: issuerDid,
      nameHash: keccak256(toUtf8Bytes('IIT Bombay')),
      admin: issuerWallet.address,
      status: InstitutionStatus.Active,
    });

    // Seed active key
    source.setKey(issuerWallet.address, {
      institutionId,
      status: KeyStatus.Active,
      validFrom: baseTimestamp - 3600,
      compromisedAt: 0,
    });

    // Issue base credential
    baseCredential = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: {
        studentName: 'Alice',
        degree: 'B.Tech',
        cgpa: 9.2,
      },
      issuanceDate: baseTimestamp,
      expirationDate: 0,
    });

    // Anchor base credential
    source.setAnchor(baseCredential.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: baseCredential.merkleRoot,
      schemaHash: keccak256(toUtf8Bytes(baseCredential.schema)),
      timestamp: baseTimestamp + 60,
      blockNumber: 42,
      txHash: '0xaaa111222333444555666777888999000aaa111222333444555666777888999000',
    });
  });

  it('VALID path: verifies un-tampered anchored credential', async () => {
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('VALID');
    expect(res.trustScore).toBe(100);
    expect(res.rules.every((r) => r.status === 'pass' || r.status === 'skip')).toBe(true);
    expect(res.receipt.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('R1: fails if schema format is invalid', async () => {
    const malformed = { ...baseCredential, schema: '' };
    const res = await verify(malformed, source);
    expect(res.verdict).toBe('INVALID');
    const r1 = res.rules.find((r) => r.id === 'R1');
    expect(r1?.status).toBe('fail');
  });

  it('R2: single-field tamper detects and names the exact modified field', async () => {
    const tampered = {
      ...baseCredential,
      fields: {
        ...baseCredential.fields,
        cgpa: 9.9, // Modified from 9.2
      },
    };
    const res = await verify(tampered, source);
    expect(res.verdict).toBe('INVALID');
    const r2 = res.rules.find((r) => r.id === 'R2');
    expect(r2?.status).toBe('fail');
    expect(r2?.reason).toContain("Field 'cgpa' was modified after issuance");
    expect(res.forensics?.tamperedFields).toHaveLength(1);
    expect(res.forensics?.tamperedFields[0].field).toBe('cgpa');
  });

  it('R2: multi-field tamper names all modified fields', async () => {
    const tampered = {
      ...baseCredential,
      fields: {
        ...baseCredential.fields,
        cgpa: 9.9,
        degree: 'M.Tech',
      },
    };
    const res = await verify(tampered, source);
    expect(res.verdict).toBe('INVALID');
    const r2 = res.rules.find((r) => r.id === 'R2');
    expect(r2?.status).toBe('fail');
    expect(r2?.reason).toContain("'cgpa'");
    expect(r2?.reason).toContain("'degree'");
    expect(res.forensics?.tamperedFields).toHaveLength(2);
  });

  it('R3: unregistered issuer fails R3', async () => {
    const unregCred = {
      ...baseCredential,
      issuerDid: 'did:trustmesh:unregistered-university',
    };
    const res = await verify(unregCred, source);
    expect(res.verdict).toBe('INVALID');
    const r3 = res.rules.find((r) => r.id === 'R3');
    expect(r3?.status).toBe('fail');
    expect(r3?.reason).toContain('is not registered in the on-chain registry');
  });

  it('R3: suspended institution fails R3', async () => {
    source.setInstitution(institutionId, {
      did: issuerDid,
      nameHash: keccak256(toUtf8Bytes('IIT Bombay')),
      admin: issuerWallet.address,
      status: InstitutionStatus.Suspended,
    });
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r3 = res.rules.find((r) => r.id === 'R3');
    expect(r3?.status).toBe('fail');
    expect(r3?.reason).toContain('is currently suspended');
  });

  it('R3: revoked institution fails R3', async () => {
    source.setInstitution(institutionId, {
      did: issuerDid,
      nameHash: keccak256(toUtf8Bytes('IIT Bombay')),
      admin: issuerWallet.address,
      status: InstitutionStatus.Revoked,
    });
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r3 = res.rules.find((r) => r.id === 'R3');
    expect(r3?.status).toBe('fail');
    expect(r3?.reason).toContain('revoked');
  });

  it('R4: key not belonging to issuer institution fails R4 and R5', async () => {
    const otherInstId = keccak256(toUtf8Bytes('did:trustmesh:other-inst'));
    source.setKey(issuerWallet.address, {
      institutionId: otherInstId,
      status: KeyStatus.Active,
      validFrom: baseTimestamp - 3600,
      compromisedAt: 0,
    });
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r4 = res.rules.find((r) => r.id === 'R4');
    expect(r4?.status).toBe('fail');
    expect(r4?.reason).toContain('does not belong to issuing institution');
  });

  it('R4: compromised key anchored after compromise time yields SUSPICIOUS verdict', async () => {
    // Key compromised at baseTimestamp + 30; anchored at baseTimestamp + 60
    source.setKey(issuerWallet.address, {
      institutionId,
      status: KeyStatus.Revoked,
      validFrom: baseTimestamp - 3600,
      compromisedAt: baseTimestamp + 30,
    });

    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('SUSPICIOUS');
    expect(res.trustScore).toBeGreaterThanOrEqual(31);
    expect(res.trustScore).toBeLessThanOrEqual(60);
    const r4 = res.rules.find((r) => r.id === 'R4');
    expect(r4?.status).toBe('fail');
    expect(r4?.evidence.suspicious).toBe(true);
    expect(r4?.reason).toContain('Signing key was reported compromised at');
  });

  it('R4: compromised key anchored BEFORE compromise time remains valid for past cred', async () => {
    // Key compromised at baseTimestamp + 1000; anchored at baseTimestamp + 60
    source.setKey(issuerWallet.address, {
      institutionId,
      status: KeyStatus.Revoked,
      validFrom: baseTimestamp - 3600,
      compromisedAt: baseTimestamp + 1000,
    });

    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('VALID');
    const r4 = res.rules.find((r) => r.id === 'R4');
    expect(r4?.status).toBe('pass');
  });

  it('R4: backdated issuanceDate (>3600s prior to anchor) yields SUSPICIOUS', async () => {
    // issuanceDate 4000s before anchor
    const backdatedCred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: { cgpa: 9.0 },
      issuanceDate: baseTimestamp - 4000,
    });
    source.setAnchor(backdatedCred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: backdatedCred.merkleRoot,
      schemaHash: keccak256(toUtf8Bytes(backdatedCred.schema)),
      timestamp: baseTimestamp,
      blockNumber: 42,
      txHash: '0x1111',
    });

    const res = await verify(backdatedCred, source);
    expect(res.verdict).toBe('SUSPICIOUS');
    const r4 = res.rules.find((r) => r.id === 'R4');
    expect(r4?.evidence.suspicious).toBe(true);
    expect(r4?.reason).toContain('backdated by more than 1 hour');
  });

  it('R4: retired key (rotated, no compromise) keeps old credentials valid', async () => {
    source.setKey(issuerWallet.address, {
      institutionId,
      status: KeyStatus.Retired,
      validFrom: baseTimestamp - 3600,
      compromisedAt: 0,
    });

    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('VALID');
    const r4 = res.rules.find((r) => r.id === 'R4');
    expect(r4?.status).toBe('pass');
  });

  it('R5: forged signature fails R5', async () => {
    const rogueWallet = Wallet.createRandom();
    const rogueCred = {
      ...baseCredential,
      signature: await rogueWallet.signMessage(toUtf8Bytes('forged')),
    };
    const res = await verify(rogueCred, source);
    expect(res.verdict).toBe('INVALID');
    const r5 = res.rules.find((r) => r.id === 'R5');
    expect(r5?.status).toBe('fail');
    expect(r5?.reason).toContain('Signature verification failed');
  });

  it('R6: unanchored credential fails R6', async () => {
    source.anchors.delete(baseCredential.id.toLowerCase());
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r6 = res.rules.find((r) => r.id === 'R6');
    expect(r6?.status).toBe('fail');
    expect(r6?.reason).toContain('has not been anchored on-chain');
  });

  it('R6: anchor root mismatch fails R6', async () => {
    source.setAnchor(baseCredential.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: '0x9999999999999999999999999999999999999999999999999999999999999999',
      schemaHash: keccak256(toUtf8Bytes(baseCredential.schema)),
      timestamp: baseTimestamp + 60,
      blockNumber: 42,
      txHash: '0x123',
    });
    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r6 = res.rules.find((r) => r.id === 'R6');
    expect(r6?.status).toBe('fail');
    expect(r6?.reason).toContain('does not match credential root');
  });

  it('R6: batch anchored credential passes with valid batch proof; fails with forged proof', async () => {
    const batch = await issueBatch({
      issuerWallet,
      issuerDid,
      items: [
        {
          holderDid,
          schema: 'DegreeCredential',
          fields: { name: 'Alice', cgpa: 9.5 },
          issuanceDate: baseTimestamp,
        },
        {
          holderDid,
          schema: 'DegreeCredential',
          fields: { name: 'Bob', cgpa: 8.5 },
          issuanceDate: baseTimestamp,
        },
      ],
      timestamp: baseTimestamp,
    });

    const bCred = batch.credentials[0];

    // Seed batch on-chain
    source.setBatch(batch.batchId, {
      institutionId,
      keyAddr: issuerWallet.address,
      batchRoot: batch.batchRoot,
      count: 2,
      timestamp: baseTimestamp + 60,
      blockNumber: 43,
      txHash: '0xbatchtx',
    });

    const passRes = await verify(bCred, source);
    expect(passRes.verdict).toBe('VALID');
    const passR6 = passRes.rules.find((r) => r.id === 'R6');
    expect(passR6?.status).toBe('pass');

    // Forged batch proof
    const forgedBatchCred = {
      ...bCred,
      batch: {
        ...bCred.batch!,
        proof: ['0x1111111111111111111111111111111111111111111111111111111111111111'],
      },
    };
    const failRes = await verify(forgedBatchCred, source);
    expect(failRes.verdict).toBe('INVALID');
    const failR6 = failRes.rules.find((r) => r.id === 'R6');
    expect(failR6?.status).toBe('fail');
    expect(failR6?.reason).toContain('Batch Merkle inclusion proof is invalid');
  });

  it('R7: suspended credential fails with temporarily suspended', async () => {
    source.setStatus(baseCredential.id, {
      state: 1, // Suspended
      reasonCode: ReasonCode.Other,
      timestamp: baseTimestamp + 100,
      by: issuerWallet.address,
      txHash: '0xsuspendtx',
    });

    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r7 = res.rules.find((r) => r.id === 'R7');
    expect(r7?.status).toBe('fail');
    expect(r7?.reason).toContain('temporarily suspended');
  });

  it('R7: revoked credential fails with reasonCode and txHash', async () => {
    source.setStatus(baseCredential.id, {
      state: 2, // Revoked
      reasonCode: ReasonCode.Fraud,
      timestamp: baseTimestamp + 100,
      by: issuerWallet.address,
      txHash: '0xrevoketx123',
    });

    const res = await verify(baseCredential, source);
    expect(res.verdict).toBe('INVALID');
    const r7 = res.rules.find((r) => r.id === 'R7');
    expect(r7?.status).toBe('fail');
    expect(r7?.reason).toContain('revoked');
    expect(r7?.reason).toContain('Fraud');
    expect(r7?.evidence.txHash).toBe('0xrevoketx123');
  });

  it('R8: expired credential fails R8', async () => {
    const expiredCred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'ExpiringBadge',
      fields: { role: 'Auditor' },
      issuanceDate: baseTimestamp,
      expirationDate: baseTimestamp + 100,
    });
    source.setAnchor(expiredCred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: expiredCred.merkleRoot,
      schemaHash: keccak256(toUtf8Bytes(expiredCred.schema)),
      timestamp: baseTimestamp + 10,
      blockNumber: 42,
      txHash: '0xexp',
    });

    // Check with now > expirationDate
    const res = await verify(expiredCred, source, { now: baseTimestamp + 500 });
    expect(res.verdict).toBe('INVALID');
    const r8 = res.rules.find((r) => r.id === 'R8');
    expect(r8?.status).toBe('fail');
    expect(r8?.reason).toContain('expired');
  });

  it('R9: presentation valid, forged revealed value, swapped proof, wrong nonce, wrong holder', async () => {
    const nonce = 'verifier-challenge-12345';
    const presentation = await createPresentation(
      baseCredential,
      ['cgpa', 'degree'],
      nonce,
      holderWallet
    );

    // 1. Valid presentation
    const p1 = await verify(presentation, source, { nonce });
    expect(p1.verdict).toBe('VALID');
    const r9 = p1.rules.find((r) => r.id === 'R9');
    expect(r9?.status).toBe('pass');

    // 2. Forged revealed value fails R2
    const forgedValPres = {
      ...presentation,
      revealed: {
        ...presentation.revealed,
        cgpa: {
          ...presentation.revealed.cgpa,
          value: 10.0, // Modified
        },
      },
    };
    const p2 = await verify(forgedValPres, source, { nonce });
    expect(p2.verdict).toBe('INVALID');
    const r2 = p2.rules.find((r) => r.id === 'R2');
    expect(r2?.status).toBe('fail');
    expect(r2?.reason).toContain("Revealed field 'cgpa'");

    // 3. Swapped proof fails R2
    const swappedProofPres = {
      ...presentation,
      revealed: {
        ...presentation.revealed,
        cgpa: {
          ...presentation.revealed.cgpa,
          proof: presentation.revealed.degree.proof, // Swapped with degree proof
        },
      },
    };
    const p3 = await verify(swappedProofPres, source, { nonce });
    expect(p3.verdict).toBe('INVALID');
    expect(p3.rules.find((r) => r.id === 'R2')?.status).toBe('fail');

    // 4. Wrong nonce fails R9
    const p4 = await verify(presentation, source, { nonce: 'different-nonce' });
    expect(p4.verdict).toBe('INVALID');
    const r9Fail = p4.rules.find((r) => r.id === 'R9');
    expect(r9Fail?.status).toBe('fail');
    expect(r9Fail?.reason).toContain('Presentation nonce does not match');

    // 5. Wrong holder signature fails R9
    const impostorWallet = Wallet.createRandom();
    const impostorPres = {
      ...presentation,
      holderSignature: await impostorWallet.signMessage(nonce),
    };
    const p5 = await verify(impostorPres, source, { nonce });
    expect(p5.verdict).toBe('INVALID');
    expect(p5.rules.find((r) => r.id === 'R9')?.status).toBe('fail');
  });

  it('Time travel: opts.asOfTimestamp ignores status changes and anchors after asOfTimestamp', async () => {
    // Revoke credential at baseTimestamp + 200
    source.setStatus(baseCredential.id, {
      state: 2, // Revoked
      reasonCode: ReasonCode.Fraud,
      timestamp: baseTimestamp + 200,
      by: issuerWallet.address,
      txHash: '0xrevoketx',
    });

    // Verification currently fails
    const currentRes = await verify(baseCredential, source);
    expect(currentRes.verdict).toBe('INVALID');

    // Time travel to baseTimestamp + 100 (before revocation) -> VALID
    const timeTravelRes = await verify(baseCredential, source, {
      asOfTimestamp: baseTimestamp + 100,
    });
    expect(timeTravelRes.verdict).toBe('VALID');
    expect(timeTravelRes.receipt.asOf).toBe(baseTimestamp + 100);

    // Time travel to before anchor was registered -> fails R6 (not anchored yet)
    const beforeAnchorRes = await verify(baseCredential, source, {
      asOfTimestamp: baseTimestamp + 10, // Anchor was at baseTimestamp + 60
    });
    expect(beforeAnchorRes.verdict).toBe('INVALID');
    const r6 = beforeAnchorRes.rules.find((r) => r.id === 'R6');
    expect(r6?.status).toBe('fail');
    expect(r6?.reason).toContain('has not been anchored on-chain');
  });

  it('R10: snapshot freshness tiers (<1h pass, <24h warn, >24h fail, bad publisher fail)', async () => {
    source.sourceKind = 'snapshot';
    const snapshotTime = baseTimestamp;

    // 1. Fresh (<1h) -> VALID
    source.currentTimestamp = snapshotTime;
    const freshRes = await verify(baseCredential, source, {
      now: snapshotTime + 1800, // 30 mins
    });
    expect(freshRes.verdict).toBe('VALID');
    expect(freshRes.rules.find((r) => r.id === 'R10')?.status).toBe('pass');

    // 2. Warn (<24h) -> VALID_WITH_WARNINGS
    const warnRes = await verify(baseCredential, source, {
      now: snapshotTime + 7200, // 2 hours
    });
    expect(warnRes.verdict).toBe('VALID_WITH_WARNINGS');
    expect(warnRes.trustScore).toBeGreaterThanOrEqual(61);
    expect(warnRes.trustScore).toBeLessThanOrEqual(89);
    expect(warnRes.rules.find((r) => r.id === 'R10')?.status).toBe('warn');

    // 3. Stale (>24h) -> INVALID
    const staleRes = await verify(baseCredential, source, {
      now: snapshotTime + 90000, // 25 hours
    });
    expect(staleRes.verdict).toBe('INVALID');
    expect(staleRes.rules.find((r) => r.id === 'R10')?.status).toBe('fail');
    expect(staleRes.rules.find((r) => r.id === 'R10')?.reason).toContain('refusing to accept stale trust anchor');

    // 4. Publisher not verified -> INVALID
    source.isPublisherVerified = false;
    const unverifiedRes = await verify(baseCredential, source, {
      now: snapshotTime + 1800,
    });
    expect(unverifiedRes.verdict).toBe('INVALID');
    expect(unverifiedRes.rules.find((r) => r.id === 'R10')?.status).toBe('fail');
    expect(unverifiedRes.rules.find((r) => r.id === 'R10')?.reason).toContain('Snapshot signature was not verified');
  });
});
