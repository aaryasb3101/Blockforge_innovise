/**
 * TRUSTMESH SHARED SPEC - Types
 * Frozen shared specification types for TrustMesh decentralized trust infrastructure.
 */

// ============================================================================
// 1. Enums (numeric)
// ============================================================================

export enum InstitutionStatus {
  Pending = 0,
  Active = 1,
  Suspended = 2,
  Revoked = 3,
}

export enum KeyStatus {
  None = 0,
  Active = 1,
  Suspended = 2,
  Revoked = 3, // compromised
  Retired = 4, // rotated, no compromise
}

export enum CredState {
  Good = 0,
  Suspended = 1,
  Revoked = 2,
}

export enum ReasonCode {
  Superseded = 1,
  Fraud = 2,
  Error = 3,
  KeyCompromise = 4,
  Other = 5,
}

// ============================================================================
// 2. Hex and Address Types
// ============================================================================

export type Hex32 = `0x${string}`;
export type Hex = `0x${string}`;
export type Address = `0x${string}`;

// ============================================================================
// 3. Credential Model & Presentation
// ============================================================================

export interface BatchInclusionProof {
  batchId: string; // hex32
  proof: string[]; // hex32[]
}

export interface Credential {
  id: string; // hex32
  schema: string;
  issuerDid: string;
  issuerKey: string; // address
  holderDid: string; // did:pkh:eip155:<chainId>:<address>
  issuanceDate: number; // unix sec
  expirationDate: number; // unix sec (0=none)
  fields: Record<string, string | number | boolean>;
  salts: Record<string, string>; // hex32
  leaves: Record<string, string>; // hex32
  merkleRoot: string; // hex32
  signature: string; // hex (EIP-191)
  batch?: BatchInclusionProof;
}

export interface RevealedField {
  value: string | number | boolean;
  salt: string; // hex32
  proof: string[]; // hex32[]
}

export interface Presentation {
  credentialId: string; // hex32
  schema: string;
  issuerDid: string;
  issuerKey: string; // address
  holderDid: string;
  issuanceDate: number;
  expirationDate: number;
  merkleRoot: string; // hex32
  signature: string;
  batch?: BatchInclusionProof;
  revealed: Record<string, RevealedField>;
  nonce?: string;
  holderSignature?: string;
}

// ============================================================================
// 4. Snapshot Model
// ============================================================================

export interface SnapshotInstitution {
  id: string; // hex32
  did: string;
  admin: string; // address
  status: InstitutionStatus;
}

export interface SnapshotKey {
  addr: string; // address
  institutionId: string; // hex32
  status: KeyStatus;
  validFrom: number;
  compromisedAt: number;
}

export interface SnapshotAnchor {
  credentialId: string; // hex32
  institutionId: string; // hex32
  keyAddr: string; // address
  merkleRoot: string; // hex32
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface SnapshotBatch {
  batchId: string; // hex32
  institutionId: string; // hex32
  keyAddr: string; // address
  batchRoot: string; // hex32
  count: number;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface SnapshotStatus {
  credentialId: string; // hex32
  state: CredState;
  reasonCode: ReasonCode;
  timestamp: number;
  txHash: string;
}

export interface Snapshot {
  version: 1;
  chainId: number;
  registry: string;
  blockNumber: number;
  timestamp: number;
  institutions: SnapshotInstitution[];
  keys: SnapshotKey[];
  anchors: SnapshotAnchor[];
  batches: SnapshotBatch[];
  statuses: SnapshotStatus[];
  publisher: string; // address
  signature: string; // hex
}

// ============================================================================
// 5. TrustSource Interface
// ============================================================================

export interface TrustSourceMeta {
  blockNumber: number;
  timestamp: number;
  source: 'chain' | 'snapshot';
  fetchedAt: number;
  publisherVerified?: boolean;
}

export interface TrustSource {
  getInstitution(id: string): Promise<{
    did: string;
    nameHash: string;
    admin: string;
    status: InstitutionStatus;
  } | null>;

  getKey(addr: string): Promise<{
    institutionId: string;
    status: KeyStatus;
    validFrom: number;
    compromisedAt: number;
  } | null>;

  getAnchor(credId: string): Promise<{
    institutionId: string;
    keyAddr: string;
    merkleRoot: string;
    schemaHash: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null>;

  getBatch(batchId: string): Promise<{
    institutionId: string;
    keyAddr: string;
    batchRoot: string;
    count: number;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null>;

  getCredentialStatus(credId: string): Promise<{
    state: CredState;
    reasonCode: ReasonCode;
    timestamp: number;
    by: string;
    txHash: string;
  } | null>;

  meta(): Promise<TrustSourceMeta>;
}

// ============================================================================
// 6. Rules & Verification Result
// ============================================================================

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10';
export type RuleStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface RuleResult {
  id: RuleId;
  name: string;
  status: RuleStatus;
  reason: string;
  evidence: Record<string, any>;
}

export type Verdict = 'VALID' | 'VALID_WITH_WARNINGS' | 'SUSPICIOUS' | 'INVALID';

export interface Forensics {
  tamperedFields: { field: string; expectedLeaf: string; actualLeaf: string }[];
  invalidProofs: string[];
}

export interface VerificationReceipt {
  hash: string;
  verifiedAt: number;
  source: 'chain' | 'snapshot';
  blockNumber: number;
  asOf?: number;
}

export interface VerificationResult {
  verdict: Verdict;
  trustScore: number; // 0-100
  rules: RuleResult[];
  explanation: string;
  forensics?: Forensics;
  receipt: VerificationReceipt;
}

export interface VerificationOptions {
  nonce?: string;
  asOfTimestamp?: number;
  now?: number;
}

// ============================================================================
// 7. Security, Blast Radius & Attacks
// ============================================================================

export interface BlastRadiusResult {
  safe: string[];
  suspicious: string[];
  afterRevoke: string[];
  holdersHashed: string[];
  recommendedActions: string[];
}

export interface AttackOutcome {
  narrative: string;
  input?: Credential | Presentation;
  opts?: VerificationOptions;
  verification?: VerificationResult;
  chainRevert?: { errorName: string };
  blocked: boolean;
  caughtBy: string[];
}

export interface Attack {
  id: string;
  name: string;
  description: string;
  expectedRule: string;
  run(ctx: any): Promise<AttackOutcome>;
}
