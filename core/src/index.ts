// Enums & Types
export * from './types.js';

// Human-readable ABI
export * from './abi.js';

// Crypto primitives and Merkle utilities
export {
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
} from './crypto.js';

// Credential Issuance & Presentation Creation
export {
  issueCredential,
  issueBatch,
  createPresentation,
  type WalletSigner,
  type IssueCredentialParams,
  type IssueBatchItem,
  type IssueBatchParams,
} from './issuance.js';

// Pure Verification Engine (R1..R10)
export { verify } from './verify.js';

// On-Chain TrustSource implementation
export { OnChainSource } from './onChainSource.js';

// RegistryClient typed wrapper and decodeRevert helper
export {
  RegistryClient,
  decodeRevert,
  type DecodedRevert,
} from './registryClient.js';

// SnapshotSource and offline verification utilities
export {
  SnapshotSource,
  buildSnapshot,
  verifySnapshotSignature,
  snapshotHash,
} from './snapshot.js';

// Incident Analysis & Blast Radius
export {
  computeBlastRadius,
  type BlastRadiusResult,
  type KnownCredentialMetadata,
} from './blastRadius.js';

// W3C Verifiable Credential Interop
export {
  toVerifiableCredential,
  fromVerifiableCredential,
  type W3CVerifiableCredential,
} from './w3c.js';

// QR Code Compression & Decompression
export {
  encodeForQr,
  decodeFromQr,
} from './qr.js';

// Attack Simulation Suite
export {
  ATTACKS,
  type Attack,
  type AttackContext,
  type AttackOutcome,
} from './attacks.js';

// Optional Zero-Knowledge Predicate Module (Bonus)
export {
  createZkPredicateProof,
  verifyZkPredicateProof,
  type ZkPredicateProof,
} from './zk.js';
