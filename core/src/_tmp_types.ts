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

export const ReasonName: Record<number, string> = {
  [ReasonCode.Superseded]: 'Superseded',
  [ReasonCode.Fraud]: 'Fraud',
  [ReasonCode.Error]: 'Error',
  [ReasonCode.KeyCompromise]: 'KeyCompromise',
  [ReasonCode.Other]: 'Other',
};

export type Hex32 = `0x${string}`;

export interface Credential {
  id: string; // hex32
  schema: string;
  issuerDid: string;
  issuerKey: string; // address
  holderDid: string;
  issuanceDate: number; // unix sec
  expirationDate: number; // unix sec (0=none)
  fields: Record<string, string | number | boolean>;
  salts: Record<string, string>; // hex32
  leaves: Record<string, string>; // hex32
  merkleRoot: string; // hex32
  signature: string; // hex (EIP-191)
  batch?: {
    batchId: string; // hex32
    proof: string[]; // hex32[]
  };
}

export interface Presentation {
  credentialId: string;
  schema: string;
  issuerDid: string;
  issuerKey: string;
  holderDid: string;
  issuanceDate: number;
  expirationDate: number;
  merkleRoot: string;
  signature: string;
  batch?: {
    batchId: string;
    proof: string[];
  };
  revealed: Record<
    string,
    {
      value: string | number | boolean;
      salt: string;
      proof: string[];
    }
  >;
  nonce?: string;
  holderSignature?: string;
}

export interface SnapshotInstitution {
  id: string;
  did: string;
  admin: string;
  status: number;
}

export interface SnapshotKey {
  addr: string;
  institutionId: string;
  status: number;
  validFrom: number;
  compromisedAt: number;
}

export interface SnapshotAnchor {
  credentialId: string;
  institutionId: string;
  keyAddr: string;
  merkleRoot: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface SnapshotBatch {
  batchId: string;
  institutionId: string;
  keyAddr: string;
  batchRoot: string;
  count: number;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface SnapshotStatus {
  credentialId: string;
  state: number;
  reasonCode: number;
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
  publisher: string;
  signature: string;
}

export interface TrustSource {
  getInstitution(
    id: string
  ): Promise<{ did: string; nameHash: string; admin: string; status: number } | null>;
  getKey(
    addr: string
  ): Promise<{ institutionId: string; status: number; validFrom: number; compromisedAt: number } | null>;
  getAnchor(
    credId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    merkleRoot: string;
    schemaHash: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null>;
  getBatch(
    batchId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    batchRoot: string;
    count: number;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null>;
  getCredentialStatus(
    credId: string
  ): Promise<{ state: number; reasonCode: number; timestamp: number; by: string; txHash: string } | null>;
  meta(): Promise<{
    blockNumber: number;
    timestamp: number;
    source: 'chain' | 'snapshot';
    fetchedAt: number;
    publisherVerified?: boolean;
  }>;
}

export type Verdict = 'VALID' | 'VALID_WITH_WARNINGS' | 'SUSPICIOUS' | 'INVALID';

export type RuleStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface RuleResult {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10';
  name: string;
  status: RuleStatus;
  reason: string;
  evidence: Record<string, any>;
}

export interface VerificationResult {
  verdict: Verdict;
  trustScore: number;
  rules: RuleResult[];
  explanation: string;
  forensics?: {
    tamperedFields: Array<{ field: string; expectedLeaf: string; actualLeaf: string }>;
    invalidProofs: string[];
  };
  receipt: {
    hash: string;
    verifiedAt: number;
    source: string;
    blockNumber: number;
    asOf?: number;
  };
}

export interface VerifyOptions {
  nonce?: string;
  asOfTimestamp?: number;
  now?: number;
}
