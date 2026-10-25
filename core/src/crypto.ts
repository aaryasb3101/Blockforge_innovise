import canonicalize from 'canonicalize';
import {
  hexlify,
  keccak256,
  randomBytes,
  toUtf8Bytes,
  concat,
  getAddress,
} from 'ethers';
import { MerkleTree } from 'merkletreejs';

/**
 * Returns RFC 8785 canonical JSON representation of any primitive value.
 */
export function canonicalValue(value: string | number | boolean): string {
  const c = canonicalize(value);
  if (c === undefined) {
    return JSON.stringify(value);
  }
  return c;
}

/**
 * Computes a salted Merkle leaf for a credential field.
 * Formula: leaf = keccak256(utf8(`${salt}|${fieldName}|${canonicalize(value)}`))
 */
export function computeSaltedLeaf(
  salt: string,
  fieldName: string,
  value: string | number | boolean
): string {
  const cVal = canonicalValue(value);
  const data = `${salt}|${fieldName}|${cVal}`;
  return keccak256(toUtf8Bytes(data));
}

/**
 * Generates a random 32-byte hex salt (0x-prefixed).
 */
export function generateSalt(): string {
  return hexlify(randomBytes(32));
}

/**
 * Computes institutionId = keccak256(utf8(did))
 */
export function computeInstitutionId(did: string): string {
  return keccak256(toUtf8Bytes(did));
}

/**
 * Computes signedDigest:
 * signedDigest = keccak256(utf8(canonicalize({root, issuerDid, issuanceDate, expirationDate, holderDid, schema})))
 */
export function computeSignedDigest(params: {
  root: string;
  issuerDid: string;
  issuanceDate: number;
  expirationDate: number;
  holderDid: string;
  schema: string;
}): string {
  const canonicalObj = {
    root: params.root,
    issuerDid: params.issuerDid,
    issuanceDate: params.issuanceDate,
    expirationDate: params.expirationDate,
    holderDid: params.holderDid,
    schema: params.schema,
  };
  const canonicalStr = canonicalize(canonicalObj);
  if (!canonicalStr) {
    throw new Error('Failed to canonicalize signed digest payload');
  }
  return keccak256(toUtf8Bytes(canonicalStr));
}

/**
 * Computes credentialId:
 * credentialId = keccak256(utf8(canonicalize({root, issuerDid, issuanceDate})))
 */
export function computeCredentialId(params: {
  root: string;
  issuerDid: string;
  issuanceDate: number;
}): string {
  const canonicalObj = {
    root: params.root,
    issuerDid: params.issuerDid,
    issuanceDate: params.issuanceDate,
  };
  const canonicalStr = canonicalize(canonicalObj);
  if (!canonicalStr) {
    throw new Error('Failed to canonicalize credential ID payload');
  }
  return keccak256(toUtf8Bytes(canonicalStr));
}

/**
 * Computes batchId:
 * batchId = keccak256(utf8(batchRoot + issuerDid + timestamp))
 */
export function computeBatchId(
  batchRoot: string,
  issuerDid: string,
  timestamp: number
): string {
  const str = `${batchRoot}${issuerDid}${timestamp}`;
  return keccak256(toUtf8Bytes(str));
}

/**
 * Recovers Ethereum address from holder DID: did:pkh:eip155:<chainId>:<address>
 */
export function recoverHolderAddress(holderDid: string): string {
  const match = holderDid.match(/^did:pkh:eip155:\d+:(0x[a-fA-F0-9]{40})$/);
  if (!match) {
    throw new Error(
      `Invalid holderDid format: "${holderDid}". Expected format: did:pkh:eip155:<chainId>:<0xAddress>`
    );
  }
  return getAddress(match[1]);
}

/**
 * Builds a deterministic Merkle Tree for credential fields.
 * Leaves are ordered by SORTED field name.
 */
export function buildCredentialTree(
  fields: Record<string, string | number | boolean>,
  salts: Record<string, string>
): {
  tree: MerkleTree;
  leaves: Record<string, string>;
  sortedFieldNames: string[];
  orderedLeaves: string[];
  root: string;
} {
  const sortedFieldNames = Object.keys(fields).sort();
  const leaves: Record<string, string> = {};
  const orderedLeaves: string[] = [];

  for (const field of sortedFieldNames) {
    const salt = salts[field];
    if (!salt) {
      throw new Error(`Missing salt for field "${field}"`);
    }
    const leaf = computeSaltedLeaf(salt, field, fields[field]);
    leaves[field] = leaf;
    orderedLeaves.push(leaf);
  }

  const hashFn = (val: string | Uint8Array) => keccak256(val);
  const tree = new MerkleTree(orderedLeaves, hashFn, {
    sortPairs: true,
    hashLeaves: false,
  });

  const root = tree.getHexRoot();
  return { tree, leaves, sortedFieldNames, orderedLeaves, root };
}

/**
 * Builds a deterministic Merkle Tree over batch credentialIds.
 */
export function buildBatchTree(credentialIds: string[]): {
  tree: MerkleTree;
  root: string;
  proofs: Record<string, string[]>;
} {
  if (credentialIds.length === 0) {
    throw new Error('Cannot build batch tree with 0 credentials');
  }

  const hashFn = (val: string | Uint8Array) => keccak256(val);
  const tree = new MerkleTree(credentialIds, hashFn, {
    sortPairs: true,
    hashLeaves: false,
  });

  const root = tree.getHexRoot();
  const proofs: Record<string, string[]> = {};
  for (const id of credentialIds) {
    proofs[id] = tree.getHexProof(id);
  }

  return { tree, root, proofs };
}

/**
 * Pure OpenZeppelin MerkleProof.verify compatible verification.
 * Does not depend on Buffer, works in Node and Browser environments.
 */
export function verifyMerkleProof(
  proof: string[],
  leaf: string,
  root: string
): boolean {
  if (!root || !leaf || !proof) return false;
  let computedHash = leaf.toLowerCase();
  for (const proofElement of proof) {
    const el = proofElement.toLowerCase();
    if (computedHash <= el) {
      computedHash = keccak256(concat([computedHash, el]));
    } else {
      computedHash = keccak256(concat([el, computedHash]));
    }
  }
  return computedHash.toLowerCase() === root.toLowerCase();
}
