import { describe, it, expect } from 'vitest';
import {
  canonicalValue,
  computeSaltedLeaf,
  generateSalt,
  computeInstitutionId,
  computeSignedDigest,
  computeCredentialId,
  computeBatchId,
  recoverHolderAddress,
  buildCredentialTree,
  buildBatchTree,
  verifyMerkleProof,
} from '../src/crypto.js';
import { keccak256, toUtf8Bytes } from 'ethers';

describe('Crypto Utilities', () => {
  it('canonicalValue serializes primitives canonically', () => {
    expect(canonicalValue(100)).toBe('100');
    expect(canonicalValue('alice')).toBe('"alice"');
    expect(canonicalValue(true)).toBe('true');
  });

  it('computeSaltedLeaf generates keccak256(utf8(salt|field|canonicalVal))', () => {
    const salt = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const field = 'cgpa';
    const val = 9.5;
    const expected = keccak256(toUtf8Bytes(`${salt}|${field}|9.5`));
    const leaf = computeSaltedLeaf(salt, field, val);
    expect(leaf).toBe(expected);
  });

  it('generateSalt returns 32-byte hex string', () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('computeInstitutionId returns keccak256 of utf8 did', () => {
    const did = 'did:trustmesh:iit-bombay';
    expect(computeInstitutionId(did)).toBe(keccak256(toUtf8Bytes(did)));
  });

  it('computeSignedDigest produces deterministic digest', () => {
    const d1 = computeSignedDigest({
      root: '0x1234567890123456789012345678901234567890123456789012345678901234',
      issuerDid: 'did:trustmesh:iit-bombay',
      issuanceDate: 1700000000,
      expirationDate: 0,
      holderDid: 'did:pkh:eip155:1:0x1234567890123456789012345678901234567890',
      schema: 'DegreeCredential',
    });
    expect(d1).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('computeCredentialId produces deterministic id', () => {
    const id = computeCredentialId({
      root: '0x1234567890123456789012345678901234567890123456789012345678901234',
      issuerDid: 'did:trustmesh:iit-bombay',
      issuanceDate: 1700000000,
    });
    expect(id).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('recoverHolderAddress extracts and checksums address from did:pkh', () => {
    const rawAddr = '0x1234567890123456789012345678901234567890';
    const did = `did:pkh:eip155:1:${rawAddr}`;
    const recovered = recoverHolderAddress(did);
    expect(recovered.toLowerCase()).toBe(rawAddr.toLowerCase());
  });

  it('buildCredentialTree sorts fields and verifies proofs with verifyMerkleProof', () => {
    const fields = {
      cgpa: 9.2,
      major: 'Computer Science',
      degree: 'B.Tech',
      studentName: 'Alice',
    };
    const salts = {
      cgpa: generateSalt(),
      major: generateSalt(),
      degree: generateSalt(),
      studentName: generateSalt(),
    };

    const { tree, leaves, sortedFieldNames, root } = buildCredentialTree(fields, salts);
    expect(sortedFieldNames).toEqual(['cgpa', 'degree', 'major', 'studentName']);

    for (const field of sortedFieldNames) {
      const proof = tree.getHexProof(leaves[field]);
      const valid = verifyMerkleProof(proof, leaves[field], root);
      expect(valid).toBe(true);

      // Tampered leaf should fail
      const tamperedLeaf = '0x9999999999999999999999999999999999999999999999999999999999999999';
      expect(verifyMerkleProof(proof, tamperedLeaf, root)).toBe(false);
    }
  });

  it('buildBatchTree creates batch tree over credential IDs and verifies proofs', () => {
    const ids = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
    ];
    const { root, proofs } = buildBatchTree(ids);
    for (const id of ids) {
      expect(verifyMerkleProof(proofs[id], id, root)).toBe(true);
    }
    const fakeId = '0x4444444444444444444444444444444444444444444444444444444444444444';
    expect(verifyMerkleProof(proofs[ids[0]], fakeId, root)).toBe(false);
  });
});
