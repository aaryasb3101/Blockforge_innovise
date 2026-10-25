/**
 * TRUSTMESH SHARED SPEC - API
 * Request/response TypeScript types and Zod validation schemas for all backend endpoints.
 */

import { z } from 'zod';
import {
  InstitutionStatus,
  KeyStatus,
  CredState,
  ReasonCode,
  type Credential,
  type Presentation,
  type Snapshot,
  type VerificationResult,
  type BlastRadiusResult,
  type AttackOutcome,
} from './types.js';

// ============================================================================
// Primitives & Shared Schemas
// ============================================================================

export const hex32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a 32-byte hex string (0x-prefixed)');
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address');
export const hexSchema = z.string().regex(/^0x[a-fA-F0-9]*$/, 'Must be a hex string');

export const institutionStatusSchema = z.nativeEnum(InstitutionStatus);
export const keyStatusSchema = z.nativeEnum(KeyStatus);
export const credStateSchema = z.nativeEnum(CredState);
export const reasonCodeSchema = z.nativeEnum(ReasonCode);

// Credential schema
export const credentialBatchInfoSchema = z.object({
  batchId: hex32Schema,
  proof: z.array(hex32Schema),
});

export const credentialSchema = z.object({
  id: hex32Schema,
  schema: z.string(),
  issuerDid: z.string(),
  issuerKey: addressSchema,
  holderDid: z.string(),
  issuanceDate: z.number().int().nonnegative(),
  expirationDate: z.number().int().nonnegative(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  salts: z.record(hex32Schema),
  leaves: z.record(hex32Schema),
  merkleRoot: hex32Schema,
  signature: hexSchema,
  batch: credentialBatchInfoSchema.optional(),
});

export const revealedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  salt: hex32Schema,
  proof: z.array(hex32Schema),
});

export const presentationSchema = z.object({
  credentialId: hex32Schema,
  schema: z.string(),
  issuerDid: z.string(),
  issuerKey: addressSchema,
  holderDid: z.string(),
  issuanceDate: z.number().int().nonnegative(),
  expirationDate: z.number().int().nonnegative(),
  merkleRoot: hex32Schema,
  signature: hexSchema,
  batch: credentialBatchInfoSchema.optional(),
  revealed: z.record(revealedFieldSchema),
  nonce: z.string().optional(),
  holderSignature: hexSchema.optional(),
});

// Snapshot schema
export const snapshotInstitutionSchema = z.object({
  id: hex32Schema,
  did: z.string(),
  admin: addressSchema,
  status: institutionStatusSchema,
});

export const snapshotKeySchema = z.object({
  addr: addressSchema,
  institutionId: hex32Schema,
  status: keyStatusSchema,
  validFrom: z.number().int().nonnegative(),
  compromisedAt: z.number().int().nonnegative(),
});

export const snapshotAnchorSchema = z.object({
  credentialId: hex32Schema,
  institutionId: hex32Schema,
  keyAddr: addressSchema,
  merkleRoot: hex32Schema,
  timestamp: z.number().int().nonnegative(),
  blockNumber: z.number().int().nonnegative(),
  txHash: hexSchema,
});

export const snapshotBatchSchema = z.object({
  batchId: hex32Schema,
  institutionId: hex32Schema,
  keyAddr: addressSchema,
  batchRoot: hex32Schema,
  count: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  blockNumber: z.number().int().nonnegative(),
  txHash: hexSchema,
});

export const snapshotStatusSchema = z.object({
  credentialId: hex32Schema,
  state: credStateSchema,
  reasonCode: reasonCodeSchema,
  timestamp: z.number().int().nonnegative(),
  txHash: hexSchema,
});

export const snapshotSchema = z.object({
  version: z.literal(1),
  chainId: z.number().int().positive(),
  registry: addressSchema,
  blockNumber: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  institutions: z.array(snapshotInstitutionSchema),
  keys: z.array(snapshotKeySchema),
  anchors: z.array(snapshotAnchorSchema),
  batches: z.array(snapshotBatchSchema),
  statuses: z.array(snapshotStatusSchema),
  publisher: addressSchema,
  signature: hexSchema,
});

// Verification Result Schema
export const ruleResultSchema = z.object({
  id: z.enum(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10']),
  name: z.string(),
  status: z.enum(['pass', 'warn', 'fail', 'skip']),
  reason: z.string(),
  evidence: z.record(z.any()),
});

export const verificationResultSchema = z.object({
  verdict: z.enum(['VALID', 'VALID_WITH_WARNINGS', 'SUSPICIOUS', 'INVALID']),
  trustScore: z.number().min(0).max(100),
  rules: z.array(ruleResultSchema),
  explanation: z.string(),
  forensics: z
    .object({
      tamperedFields: z.array(
        z.object({
          field: z.string(),
          expectedLeaf: hex32Schema,
          actualLeaf: hex32Schema,
        })
      ),
      invalidProofs: z.array(z.string()),
    })
    .optional(),
  receipt: z.object({
    hash: hexSchema,
    verifiedAt: z.number().int().nonnegative(),
    source: z.enum(['chain', 'snapshot']),
    blockNumber: z.number().int().nonnegative(),
    asOf: z.number().int().nonnegative().optional(),
  }),
});

// ============================================================================
// Endpoint 1: GET /api/health
// ============================================================================

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  chainId: z.number().int(),
  block: z.number().int().nonnegative(),
  indexerLagBlocks: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ============================================================================
// Endpoint 2: GET /api/config
// ============================================================================

export const configInstitutionSchema = z.object({
  name: z.string(),
  did: z.string(),
  id: hex32Schema,
  type: z.enum(['university', 'employer', 'rogue']),
});

export const configResponseSchema = z.object({
  mode: z.enum(['local', 'hosted', 'testnet']),
  chainId: z.number().int(),
  rpcUrl: z.string(),
  registry: addressSchema,
  snapshotPublisher: addressSchema,
  explorerBaseUrl: z.string().optional(),
  institutions: z.array(configInstitutionSchema),
  accreditorCount: z.literal(3),
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;

// ============================================================================
// Endpoint 3 & 4: GET /api/institutions & GET /api/institutions/:id
// ============================================================================

export const institutionKeyDetailSchema = z.object({
  addr: addressSchema,
  status: keyStatusSchema,
  validFrom: z.number().int().nonnegative(),
  compromisedAt: z.number().int().nonnegative(),
});

export const institutionDetailSchema = z.object({
  id: hex32Schema,
  did: z.string(),
  nameHash: hex32Schema,
  admin: addressSchema,
  status: institutionStatusSchema,
  approvals: z.number().int().nonnegative(),
  keys: z.array(institutionKeyDetailSchema),
});
export type InstitutionDetail = z.infer<typeof institutionDetailSchema>;

export const institutionsResponseSchema = z.object({
  institutions: z.array(institutionDetailSchema),
});
export type InstitutionsResponse = z.infer<typeof institutionsResponseSchema>;

// POST /api/institutions/register
export const registerInstitutionRequestSchema = z.object({
  name: z.string().min(1),
  did: z.string().min(1),
});
export type RegisterInstitutionRequest = z.infer<typeof registerInstitutionRequestSchema>;

export const registerInstitutionResponseSchema = z.object({
  id: hex32Schema,
  txHash: hexSchema,
});
export type RegisterInstitutionResponse = z.infer<typeof registerInstitutionResponseSchema>;

// POST /api/institutions/:id/approve
export const approveInstitutionRequestSchema = z.object({
  accreditorIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});
export type ApproveInstitutionRequest = z.infer<typeof approveInstitutionRequestSchema>;

export const approveInstitutionResponseSchema = z.object({
  txHash: hexSchema,
  approvals: z.number().int().nonnegative(),
  status: institutionStatusSchema,
});
export type ApproveInstitutionResponse = z.infer<typeof approveInstitutionResponseSchema>;

// POST /api/institutions/:id/status
export const institutionStatusRequestSchema = z.object({
  action: z.enum(['suspend', 'reinstate', 'revoke']),
});
export type InstitutionStatusRequest = z.infer<typeof institutionStatusRequestSchema>;

export const institutionStatusResponseSchema = z.object({
  txHash: hexSchema,
});
export type InstitutionStatusResponse = z.infer<typeof institutionStatusResponseSchema>;

// ============================================================================
// Endpoint 5 & 6: POST /api/issue & POST /api/issue/batch
// ============================================================================

export const issueCredentialRequestSchema = z.object({
  institutionId: hex32Schema,
  schema: z.string().min(1),
  holderDid: z.string().min(1),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  expirationDate: z.number().int().nonnegative().optional(),
  predicates: z.record(z.boolean()).optional(),
});
export type IssueCredentialRequest = z.infer<typeof issueCredentialRequestSchema>;

export const issueCredentialResponseSchema = z.object({
  credential: credentialSchema,
  txHash: hexSchema,
  blockNumber: z.number().int().nonnegative(),
});
export type IssueCredentialResponse = {
  credential: Credential;
  txHash: string;
  blockNumber: number;
};

export const issueBatchItemSchema = z.object({
  holderDid: z.string().min(1),
  schema: z.string().min(1),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  expirationDate: z.number().int().nonnegative().optional(),
  predicates: z.record(z.boolean()).optional(),
});
export type IssueBatchItem = z.infer<typeof issueBatchItemSchema>;

export const issueBatchRequestSchema = z.object({
  institutionId: hex32Schema,
  items: z.array(issueBatchItemSchema).min(1),
});
export type IssueBatchRequest = z.infer<typeof issueBatchRequestSchema>;

export const issueBatchResponseSchema = z.object({
  batchId: hex32Schema,
  batchRoot: hex32Schema,
  credentials: z.array(credentialSchema),
  txHash: hexSchema,
});
export type IssueBatchResponse = {
  batchId: string;
  batchRoot: string;
  credentials: Credential[];
  txHash: string;
};

// ============================================================================
// Endpoint 7 & 8: POST /api/revoke & /api/credentials/:id/suspend | reinstate
// ============================================================================

export const revokeCredentialRequestSchema = z.object({
  credentialId: hex32Schema,
  reasonCode: reasonCodeSchema,
  actingInstitutionId: hex32Schema.optional(),
});
export type RevokeCredentialRequest = z.infer<typeof revokeCredentialRequestSchema>;

export const revokeCredentialResponseSchema = z.union([
  z.object({
    txHash: hexSchema,
  }),
  z.object({
    reverted: z.literal(true),
    errorName: z.string(),
  }),
]);
export type RevokeCredentialResponse =
  | { txHash: string; reverted?: never }
  | { reverted: true; errorName: string; txHash?: never };

export const actingInstitutionRequestSchema = z.object({
  actingInstitutionId: hex32Schema.optional(),
});
export type ActingInstitutionRequest = z.infer<typeof actingInstitutionRequestSchema>;

export const credentialActionResponseSchema = z.union([
  z.object({
    txHash: hexSchema,
  }),
  z.object({
    reverted: z.literal(true),
    errorName: z.string(),
  }),
]);
export type CredentialActionResponse =
  | { txHash: string; reverted?: never }
  | { reverted: true; errorName: string; txHash?: never };

// ============================================================================
// Endpoint 9: POST /api/verify
// ============================================================================

export const verifyOptionsSchema = z.object({
  nonce: z.string().optional(),
  asOfTimestamp: z.number().int().nonnegative().optional(),
  now: z.number().int().nonnegative().optional(),
});

export const verifyRequestSchema = z.object({
  input: z.union([credentialSchema, presentationSchema]),
  opts: verifyOptionsSchema.optional(),
});
export type VerifyRequest = {
  input: Credential | Presentation;
  opts?: {
    nonce?: string;
    asOfTimestamp?: number;
    now?: number;
  };
};

export type VerifyResponse = VerificationResult;

// ============================================================================
// Endpoint 10 & 11: GET /api/demo/samples & GET /api/demo/holders
// ============================================================================

export const demoSamplesResponseSchema = z.object({
  valid: z.any(),
  tampered: z.any(),
  rogue: z.any(),
  revoked: z.any(),
  expired: z.any(),
  suspended: z.any(),
  compromisedBefore: z.any(),
  compromisedAfter: z.any(),
  batch: z.any(),
});
export type DemoSamplesResponse = {
  valid: Credential | Presentation;
  tampered: Credential | Presentation;
  rogue: Credential | Presentation;
  revoked: Credential | Presentation;
  expired: Credential | Presentation;
  suspended: Credential | Presentation;
  compromisedBefore: Credential | Presentation;
  compromisedAfter: Credential | Presentation;
  batch: Credential | Presentation;
};

export const demoHolderWalletSchema = z.object({
  did: z.string(),
  address: addressSchema,
  privateKey: hexSchema,
  label: z.string(),
});

export const demoHoldersResponseSchema = z.object({
  holders: z.array(demoHolderWalletSchema),
});
export type DemoHoldersResponse = z.infer<typeof demoHoldersResponseSchema>;

// ============================================================================
// Endpoint 12: GET /api/credentials?issuerId=&holderDid=
// ============================================================================

export const credentialMetadataSchema = z.object({
  credentialId: hex32Schema,
  institutionId: hex32Schema,
  issuerDid: z.string(),
  holderDid: z.string(),
  schema: z.string(),
  issuanceDate: z.number().int().nonnegative(),
  expirationDate: z.number().int().nonnegative(),
  merkleRoot: hex32Schema,
  state: credStateSchema,
  reasonCode: reasonCodeSchema.optional(),
  batchId: hex32Schema.optional(),
  anchoredAt: z.number().int().nonnegative(),
  txHash: hexSchema,
});
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;

export const getCredentialsResponseSchema = z.object({
  credentials: z.array(credentialMetadataSchema),
});
export type GetCredentialsResponse = z.infer<typeof getCredentialsResponseSchema>;

// ============================================================================
// Endpoint 13 & 14: GET /api/audit/events & GET /api/audit/verify/:txHash
// ============================================================================

export const auditEventSchema = z.object({
  type: z.string(),
  block: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  txHash: hexSchema,
  logIndex: z.number().int().nonnegative(),
  actor: addressSchema,
  args: z.record(z.any()),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsResponseSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z.string().optional(),
});
export type AuditEventsResponse = z.infer<typeof auditEventsResponseSchema>;

export const auditVerifyResponseSchema = z.object({
  matches: z.boolean(),
  onChain: z.any(),
  indexed: z.any(),
});
export type AuditVerifyResponse = z.infer<typeof auditVerifyResponseSchema>;

// ============================================================================
// Endpoint 15: Incident Response
// ============================================================================

export const incidentAnalyzeRequestSchema = z.object({
  keyAddress: addressSchema,
  compromisedAt: z.number().int().nonnegative(),
});
export type IncidentAnalyzeRequest = z.infer<typeof incidentAnalyzeRequestSchema>;

export const incidentAnalyzeResponseSchema = z.object({
  safe: z.array(hex32Schema),
  suspicious: z.array(hex32Schema),
  afterRevoke: z.array(hex32Schema),
  holdersHashed: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});
export type IncidentAnalyzeResponse = BlastRadiusResult;

export const suspendKeyRequestSchema = z.object({
  keyAddress: addressSchema,
});
export type SuspendKeyRequest = z.infer<typeof suspendKeyRequestSchema>;

export const revokeKeyRequestSchema = z.object({
  keyAddress: addressSchema,
  compromisedAt: z.number().int().nonnegative().optional(),
});
export type RevokeKeyRequest = z.infer<typeof revokeKeyRequestSchema>;

export const rotateKeyRequestSchema = z.object({
  oldKey: addressSchema,
});
export type RotateKeyRequest = z.infer<typeof rotateKeyRequestSchema>;

export const rotateKeyResponseSchema = z.object({
  txHash: hexSchema,
  newKey: addressSchema,
});
export type RotateKeyResponse = z.infer<typeof rotateKeyResponseSchema>;

export const setGuardiansRequestSchema = z.object({
  institutionId: hex32Schema,
});
export type SetGuardiansRequest = z.infer<typeof setGuardiansRequestSchema>;

export const setGuardiansResponseSchema = z.object({
  txHash: hexSchema,
  guardians: z.array(addressSchema),
  threshold: z.number().int().positive(),
});
export type SetGuardiansResponse = z.infer<typeof setGuardiansResponseSchema>;

export const proposeRecoveryRequestSchema = z.object({
  institutionId: hex32Schema,
});
export type ProposeRecoveryRequest = z.infer<typeof proposeRecoveryRequestSchema>;

export const proposeRecoveryResponseSchema = z.object({
  proposalId: z.string(),
  txHash: hexSchema,
  executeAfter: z.number().int().nonnegative(),
});
export type ProposeRecoveryResponse = z.infer<typeof proposeRecoveryResponseSchema>;

export const approveRecoveryRequestSchema = z.object({
  proposalId: z.string(),
  guardianIndex: z.number().int().nonnegative(),
});
export type ApproveRecoveryRequest = z.infer<typeof approveRecoveryRequestSchema>;

export const approveRecoveryResponseSchema = z.object({
  txHash: hexSchema,
  approvals: z.number().int().nonnegative(),
});
export type ApproveRecoveryResponse = z.infer<typeof approveRecoveryResponseSchema>;

export const executeRecoveryRequestSchema = z.object({
  proposalId: z.string(),
});
export type ExecuteRecoveryRequest = z.infer<typeof executeRecoveryRequestSchema>;

export const executeRecoveryResponseSchema = z.object({
  txHash: hexSchema,
});
export type ExecuteRecoveryResponse = z.infer<typeof executeRecoveryResponseSchema>;

// ============================================================================
// Endpoint 16: Snapshots
// ============================================================================

export const publishSnapshotResponseSchema = z.object({
  txHash: hexSchema,
  snapshotHash: hex32Schema,
});
export type PublishSnapshotResponse = z.infer<typeof publishSnapshotResponseSchema>;

// ============================================================================
// Endpoint 17: Attacks
// ============================================================================

export const attackInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  expectedRule: z.string(),
});
export type AttackInfo = z.infer<typeof attackInfoSchema>;

export const attacksListResponseSchema = z.object({
  attacks: z.array(attackInfoSchema),
});
export type AttacksListResponse = z.infer<typeof attacksListResponseSchema>;

export const attackOutcomeSchema = z.object({
  narrative: z.string(),
  input: z.union([credentialSchema, presentationSchema]).optional(),
  opts: verifyOptionsSchema.optional(),
  verification: verificationResultSchema.optional(),
  chainRevert: z.object({ errorName: z.string() }).optional(),
  blocked: z.boolean(),
  caughtBy: z.array(z.string()),
});

export const runAttackResponseSchema = attackOutcomeSchema;
export type RunAttackResponse = AttackOutcome;

export const runAllAttacksResponseSchema = z.object({
  outcomes: z.array(attackOutcomeSchema.extend({ id: z.string(), name: z.string() })),
  blocked: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type RunAllAttacksResponse = {
  outcomes: (AttackOutcome & { id: string; name: string })[];
  blocked: number;
  total: number;
};

// ============================================================================
// Endpoint 18: Trust Graph & Stats
// ============================================================================

export const trustGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
  status: z.string(),
});
export type TrustGraphNode = z.infer<typeof trustGraphNodeSchema>;

export const trustGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type TrustGraphEdge = z.infer<typeof trustGraphEdgeSchema>;

export const trustGraphResponseSchema = z.object({
  nodes: z.array(trustGraphNodeSchema),
  edges: z.array(trustGraphEdgeSchema),
});
export type TrustGraphResponse = z.infer<typeof trustGraphResponseSchema>;

export const statsResponseSchema = z.object({
  institutionsCount: z.number().int().nonnegative(),
  activeKeysCount: z.number().int().nonnegative(),
  credentialsCount: z.number().int().nonnegative(),
  batchesCount: z.number().int().nonnegative(),
  revocationsCount: z.number().int().nonnegative(),
  auditEventsCount: z.number().int().nonnegative(),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

// API Error Response
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    errorName: z.string().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// ============================================================================
// Schemas Namespace Export
// ============================================================================

export const schemas = {
  hex32: hex32Schema,
  address: addressSchema,
  hex: hexSchema,
  institutionStatus: institutionStatusSchema,
  keyStatus: keyStatusSchema,
  credState: credStateSchema,
  reasonCode: reasonCodeSchema,
  credential: credentialSchema,
  presentation: presentationSchema,
  snapshot: snapshotSchema,
  verificationResult: verificationResultSchema,
  healthResponse: healthResponseSchema,
  configResponse: configResponseSchema,
  institutionDetail: institutionDetailSchema,
  institutionsResponse: institutionsResponseSchema,
  registerInstitutionRequest: registerInstitutionRequestSchema,
  registerInstitutionResponse: registerInstitutionResponseSchema,
  approveInstitutionRequest: approveInstitutionRequestSchema,
  approveInstitutionResponse: approveInstitutionResponseSchema,
  institutionStatusRequest: institutionStatusRequestSchema,
  institutionStatusResponse: institutionStatusResponseSchema,
  issueCredentialRequest: issueCredentialRequestSchema,
  issueCredentialResponse: issueCredentialResponseSchema,
  issueBatchRequest: issueBatchRequestSchema,
  issueBatchResponse: issueBatchResponseSchema,
  revokeCredentialRequest: revokeCredentialRequestSchema,
  revokeCredentialResponse: revokeCredentialResponseSchema,
  actingInstitutionRequest: actingInstitutionRequestSchema,
  credentialActionResponse: credentialActionResponseSchema,
  verifyRequest: verifyRequestSchema,
  demoSamplesResponse: demoSamplesResponseSchema,
  demoHoldersResponse: demoHoldersResponseSchema,
  credentialMetadata: credentialMetadataSchema,
  getCredentialsResponse: getCredentialsResponseSchema,
  auditEvent: auditEventSchema,
  auditEventsResponse: auditEventsResponseSchema,
  auditVerifyResponse: auditVerifyResponseSchema,
  incidentAnalyzeRequest: incidentAnalyzeRequestSchema,
  incidentAnalyzeResponse: incidentAnalyzeResponseSchema,
  suspendKeyRequest: suspendKeyRequestSchema,
  revokeKeyRequest: revokeKeyRequestSchema,
  rotateKeyRequest: rotateKeyRequestSchema,
  rotateKeyResponse: rotateKeyResponseSchema,
  setGuardiansRequest: setGuardiansRequestSchema,
  setGuardiansResponse: setGuardiansResponseSchema,
  proposeRecoveryRequest: proposeRecoveryRequestSchema,
  proposeRecoveryResponse: proposeRecoveryResponseSchema,
  approveRecoveryRequest: approveRecoveryRequestSchema,
  approveRecoveryResponse: approveRecoveryResponseSchema,
  executeRecoveryRequest: executeRecoveryRequestSchema,
  executeRecoveryResponse: executeRecoveryResponseSchema,
  publishSnapshotResponse: publishSnapshotResponseSchema,
  attackInfo: attackInfoSchema,
  attacksListResponse: attacksListResponseSchema,
  runAttackResponse: runAttackResponseSchema,
  runAllAttacksResponse: runAllAttacksResponseSchema,
  trustGraphResponse: trustGraphResponseSchema,
  statsResponse: statsResponseSchema,
  apiErrorResponse: apiErrorResponseSchema,
};
