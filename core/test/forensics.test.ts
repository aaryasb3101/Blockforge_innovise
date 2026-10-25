import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { issueCredential, createPresentation } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId } from '../src/crypto.js';
import { InstitutionStatus, KeyStatus } from '../src/types.js';

describe('Forensics & Tamper Reporting', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:forensics-inst';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
  const institutionId = computeInstitutionId(issuerDid);
  const now = 1700000000;

  const source = new MockTrustSource();
  source.currentTimestamp = now + 100;
  source.currentBlock = 70;

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

  it('reports exact forensic diffs for tampered fields in credentials', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: {
        cgpa: 8.5,
        major: 'Computer Science',
        degree: 'B.Tech',
      },
      issuanceDate: now,
    });

    source.setAnchor(cred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: cred.merkleRoot,
      schemaHash: '0xschema',
      timestamp: now + 20,
      blockNumber: 70,
      txHash: '0xanc',
    });

    const tampered = {
      ...cred,
      fields: {
        ...cred.fields,
        cgpa: 9.9,
        major: 'Economics',
      },
    };

    const res = await verify(tampered, source);
    expect(res.verdict).toBe('INVALID');
    expect(res.forensics).toBeDefined();
    expect(res.forensics?.tamperedFields).toHaveLength(2);

    const tamperedFieldNames = res.forensics?.tamperedFields.map((f) => f.field);
    expect(tamperedFieldNames).toContain('cgpa');
    expect(tamperedFieldNames).toContain('major');

    for (const tf of res.forensics!.tamperedFields) {
      expect(tf.expectedLeaf).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(tf.actualLeaf).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(tf.expectedLeaf).not.toBe(tf.actualLeaf);
    }
  });

  it('reports invalidProofs forensic list in selective disclosure presentations', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: {
        cgpa: 8.5,
        major: 'Computer Science',
      },
      issuanceDate: now,
    });

    source.setAnchor(cred.id, {
      institutionId,
      keyAddr: issuerWallet.address,
      merkleRoot: cred.merkleRoot,
      schemaHash: '0xschema',
      timestamp: now + 20,
      blockNumber: 70,
      txHash: '0xanc',
    });

    const pres = await createPresentation(
      cred,
      ['cgpa', 'major'],
      'nonce-123',
      holderWallet
    );

    // Corrupt proof for major
    pres.revealed.major.proof = ['0x1111111111111111111111111111111111111111111111111111111111111111'];

    const res = await verify(pres, source, { nonce: 'nonce-123' });
    expect(res.verdict).toBe('INVALID');
    expect(res.forensics?.invalidProofs).toContain('major');
    expect(res.forensics?.invalidProofs).not.toContain('cgpa');
  });
});
