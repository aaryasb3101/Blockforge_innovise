import { describe, it, expect } from 'vitest';
import { Wallet, verifyMessage, getBytes } from 'ethers';
import { issueCredential, issueBatch, createPresentation } from '../src/issuance.js';
import { computeSignedDigest, verifyMerkleProof } from '../src/crypto.js';

describe('Issuance and Presentation', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:iit-bombay';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;

  it('issueCredential issues a valid signed credential with predicate fields', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: {
        studentName: 'Alice',
        degree: 'B.Tech',
        cgpa: 9.2,
      },
      predicates: {
        cgpa_gte_8: true,
      },
    });

    expect(cred.id).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(cred.issuerKey.toLowerCase()).toBe(issuerWallet.address.toLowerCase());
    expect(cred.fields.cgpa_gte_8).toBe(true);
    expect(cred.fields.cgpa).toBe(9.2);

    // Verify signature
    const digest = computeSignedDigest({
      root: cred.merkleRoot,
      issuerDid,
      issuanceDate: cred.issuanceDate,
      expirationDate: cred.expirationDate,
      holderDid,
      schema: cred.schema,
    });
    const recovered = verifyMessage(getBytes(digest), cred.signature);
    expect(recovered.toLowerCase()).toBe(issuerWallet.address.toLowerCase());
  });

  it('issueBatch issues batch credentials with valid batch proofs', async () => {
    const h1 = Wallet.createRandom();
    const h2 = Wallet.createRandom();

    const batch = await issueBatch({
      issuerWallet,
      issuerDid,
      items: [
        {
          holderDid: `did:pkh:eip155:1:${h1.address}`,
          schema: 'DegreeCredential',
          fields: { name: 'Bob', cgpa: 8.5 },
        },
        {
          holderDid: `did:pkh:eip155:1:${h2.address}`,
          schema: 'DegreeCredential',
          fields: { name: 'Charlie', cgpa: 7.9 },
        },
      ],
    });

    expect(batch.credentials).toHaveLength(2);
    expect(batch.batchId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(batch.batchRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);

    for (const cred of batch.credentials) {
      expect(cred.batch).toBeDefined();
      expect(cred.batch?.batchId).toBe(batch.batchId);
      const ok = verifyMerkleProof(cred.batch!.proof, cred.id, batch.batchRoot);
      expect(ok).toBe(true);
    }
  });

  it('createPresentation selectively reveals fields and signs nonce', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: {
        studentName: 'Alice',
        degree: 'B.Tech',
        cgpa: 9.2,
      },
      predicates: {
        cgpa_gte_8: true,
      },
    });

    const nonce = 'random-verifier-nonce-12345';
    const presentation = await createPresentation(
      cred,
      ['cgpa_gte_8', 'degree'],
      nonce,
      holderWallet
    );

    expect(presentation.credentialId).toBe(cred.id);
    expect(presentation.revealed).toHaveProperty('cgpa_gte_8');
    expect(presentation.revealed).toHaveProperty('degree');
    expect(presentation.revealed).not.toHaveProperty('studentName');
    expect(presentation.revealed).not.toHaveProperty('cgpa');

    // Verify holder signature
    const recoveredHolder = verifyMessage(nonce, presentation.holderSignature!);
    expect(recoveredHolder.toLowerCase()).toBe(holderWallet.address.toLowerCase());
  });

  it('createPresentation throws if holder wallet does not match holderDid', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: { studentName: 'Alice' },
    });

    const impostorWallet = Wallet.createRandom();
    await expect(
      createPresentation(cred, ['studentName'], 'nonce', impostorWallet)
    ).rejects.toThrow(/does not match/);
  });

  it('createPresentation throws if revealing non-existent field', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'DegreeCredential',
      fields: { studentName: 'Alice' },
    });

    await expect(
      createPresentation(cred, ['nonExistentField'], 'nonce', holderWallet)
    ).rejects.toThrow(/Cannot reveal non-existent field/);
  });
});
