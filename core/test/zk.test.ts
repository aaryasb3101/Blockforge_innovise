import { describe, it, expect } from 'vitest';
import { createZkPredicateProof, verifyZkPredicateProof } from '../src/zk.js';
import { generateSalt, computeSaltedLeaf } from '../src/crypto.js';

describe('Zero-Knowledge Predicate Module', () => {
  it('creates and verifies a ZK range predicate proof without revealing actual value', () => {
    const salt = generateSalt();
    const field = 'cgpa';
    const actualGpa = 9.4;
    const threshold = 8.0;

    const leafCommitment = computeSaltedLeaf(salt, field, actualGpa);

    const proof = createZkPredicateProof(
      salt,
      field,
      actualGpa,
      'gte',
      threshold
    );

    expect(proof.field).toBe('cgpa');
    expect(proof.operator).toBe('gte');
    expect(proof.threshold).toBe(8.0);
    expect(proof.commitment).toBe(leafCommitment);

    // Verify
    const isValid = verifyZkPredicateProof(proof, leafCommitment);
    expect(isValid).toBe(true);

    // Mismatched leaf commitment fails
    const fakeCommitment = '0x1111111111111111111111111111111111111111111111111111111111111111';
    expect(verifyZkPredicateProof(proof, fakeCommitment)).toBe(false);
  });

  it('throws when actual value does not satisfy predicate', () => {
    const salt = generateSalt();
    expect(() =>
      createZkPredicateProof(salt, 'cgpa', 7.2, 'gte', 8.5)
    ).toThrow(/does not satisfy/);
  });
});
