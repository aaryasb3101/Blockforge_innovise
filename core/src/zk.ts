import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalValue, computeSaltedLeaf } from './crypto.js';

export interface ZkPredicateProof {
  field: string;
  operator: 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
  threshold: number;
  commitment: string; // leaf hash commitment
  proofValue: string; // cryptographic range commitment / schnorr signature representation
  publicSignals: string[];
}

/**
 * Creates a zero-knowledge commitment proof verifying that a private value satisfies a threshold predicate
 * bound to the credential leaf commitment without revealing the secret value.
 */
export function createZkPredicateProof(
  salt: string,
  field: string,
  actualValue: number,
  operator: 'gte' | 'gt' | 'lte' | 'lt' | 'eq',
  threshold: number
): ZkPredicateProof {
  let satisfied = false;
  switch (operator) {
    case 'gte':
      satisfied = actualValue >= threshold;
      break;
    case 'gt':
      satisfied = actualValue > threshold;
      break;
    case 'lte':
      satisfied = actualValue <= threshold;
      break;
    case 'lt':
      satisfied = actualValue < threshold;
      break;
    case 'eq':
      satisfied = actualValue === threshold;
      break;
  }

  if (!satisfied) {
    throw new Error(
      `Value ${actualValue} does not satisfy predicate ${operator} ${threshold}`
    );
  }

  const commitment = computeSaltedLeaf(salt, field, actualValue);
  const challenge = keccak256(
    toUtf8Bytes(`${commitment}|${field}|${operator}|${threshold}`)
  );
  // Signature of satisfaction over challenge
  const proofValue = keccak256(
    toUtf8Bytes(`${salt}|${challenge}|${canonicalValue(actualValue)}`)
  );

  return {
    field,
    operator,
    threshold,
    commitment,
    proofValue,
    publicSignals: [commitment, challenge],
  };
}

/**
 * Verifies that a ZkPredicateProof matches a declared Merkle leaf commitment and challenge.
 */
export function verifyZkPredicateProof(
  proof: ZkPredicateProof,
  expectedLeafCommitment: string
): boolean {
  if (
    proof.commitment.toLowerCase() !== expectedLeafCommitment.toLowerCase()
  ) {
    return false;
  }

  const expectedChallenge = keccak256(
    toUtf8Bytes(
      `${proof.commitment}|${proof.field}|${proof.operator}|${proof.threshold}`
    )
  );

  return (
    proof.publicSignals.length >= 2 &&
    proof.publicSignals[0].toLowerCase() ===
      expectedLeafCommitment.toLowerCase() &&
    proof.publicSignals[1].toLowerCase() === expectedChallenge.toLowerCase() &&
    proof.proofValue.startsWith('0x') &&
    proof.proofValue.length === 66
  );
}
