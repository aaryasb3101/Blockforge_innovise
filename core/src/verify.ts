import canonicalize from 'canonicalize';
import {
  getBytes,
  keccak256,
  toUtf8Bytes,
  verifyMessage,
} from 'ethers';
import { z } from 'zod';
import {
  Credential,
  Presentation,
  ReasonName,
  RuleResult,
  TrustSource,
  VerificationResult,
  VerifyOptions,
  Verdict,
} from './types.js';
import {
  buildCredentialTree,
  computeCredentialId,
  computeInstitutionId,
  computeSaltedLeaf,
  computeSignedDigest,
  recoverHolderAddress,
  verifyMerkleProof,
} from './crypto.js';

// Schemas for structural / schema validation (R1)
const CredentialZod = z.object({
  id: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  schema: z.string().min(1),
  issuerDid: z.string().startsWith('did:'),
  issuerKey: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  holderDid: z.string().startsWith('did:'),
  issuanceDate: z.number().int().positive(),
  expirationDate: z.number().int().nonnegative(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  salts: z.record(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
  leaves: z.record(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
  merkleRoot: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  batch: z
    .object({
      batchId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      proof: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
    })
    .optional(),
});

const PresentationZod = z.object({
  credentialId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  schema: z.string().min(1),
  issuerDid: z.string().startsWith('did:'),
  issuerKey: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  holderDid: z.string().startsWith('did:'),
  issuanceDate: z.number().int().positive(),
  expirationDate: z.number().int().nonnegative(),
  merkleRoot: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  batch: z
    .object({
      batchId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      proof: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
    })
    .optional(),
  revealed: z.record(
    z.object({
      value: z.union([z.string(), z.number(), z.boolean()]),
      salt: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      proof: z.array(z.string().regex(/^0x[a-fA-F0-9]{64}$/)),
    })
  ),
  nonce: z.string().optional(),
  holderSignature: z.string().optional(),
});

/**
 * Pure verification engine over any TrustSource.
 * Verifies rules R1 through R10, constructs forensics, trustScore, explanation, and receipt.
 * NEVER throws: any error results in an INVALID or failed rule.
 */
export async function verify(
  input: Credential | Presentation,
  source: TrustSource,
  opts?: VerifyOptions
): Promise<VerificationResult> {
  const verifiedAt = Math.floor(Date.now() / 1000);
  const now = opts?.now ?? verifiedAt;
  const asOf = opts?.asOfTimestamp;

  const rules: RuleResult[] = [];
  const tamperedFields: Array<{
    field: string;
    expectedLeaf: string;
    actualLeaf: string;
  }> = [];
  const invalidProofs: string[] = [];

  let sourceMeta: {
    blockNumber: number;
    timestamp: number;
    source: 'chain' | 'snapshot';
    fetchedAt: number;
    publisherVerified?: boolean;
  } = {
    blockNumber: 0,
    timestamp: now,
    source: 'chain',
    fetchedAt: Date.now(),
  };

  try {
    sourceMeta = await source.meta();
  } catch (err: any) {
    sourceMeta = {
      blockNumber: 0,
      timestamp: now,
      source: 'chain',
      fetchedAt: Date.now(),
    };
  }

  try {
    const isPresentation = 'revealed' in input;
    const credentialId = isPresentation ? input.credentialId : input.id;

    // -------------------------------------------------------------
    // R1: Schema valid
    // -------------------------------------------------------------
    const schemaValidation = isPresentation
      ? PresentationZod.safeParse(input)
      : CredentialZod.safeParse(input);

    if (!schemaValidation.success) {
      rules.push({
        id: 'R1',
        name: 'Schema Validation',
        status: 'fail',
        reason: `Schema validation failed: ${schemaValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        evidence: {
          errors: schemaValidation.error.issues,
        },
      });
    } else {
      rules.push({
        id: 'R1',
        name: 'Schema Validation',
        status: 'pass',
        reason: 'Credential structure and schema conform to specification',
        evidence: {
          schema: input.schema,
          format: isPresentation ? 'presentation' : 'credential',
        },
      });
    }

    // -------------------------------------------------------------
    // R2: Recompute leaves/root, name EXACT tampered fields, verify proofs
    // -------------------------------------------------------------
    if (!isPresentation) {
      const cred = input as Credential;
      const sortedFields = Object.keys(cred.fields ?? {}).sort();

      for (const field of sortedFields) {
        const val = cred.fields[field];
        const salt = cred.salts?.[field];
        if (!salt) {
          tamperedFields.push({
            field,
            expectedLeaf: 'salt-missing',
            actualLeaf: cred.leaves?.[field] ?? '',
          });
          continue;
        }
        const expectedLeaf = computeSaltedLeaf(salt, field, val);
        const actualLeaf = cred.leaves?.[field];
        if (
          !actualLeaf ||
          actualLeaf.toLowerCase() !== expectedLeaf.toLowerCase()
        ) {
          tamperedFields.push({
            field,
            expectedLeaf,
            actualLeaf: actualLeaf ?? 'missing',
          });
        }
      }

      // Check if declared root matches recomputed root
      let rootMatches = false;
      let recomputedRoot = '';
      if (tamperedFields.length === 0) {
        try {
          const { root } = buildCredentialTree(cred.fields, cred.salts);
          recomputedRoot = root;
          rootMatches = root.toLowerCase() === cred.merkleRoot.toLowerCase();
        } catch {
          rootMatches = false;
        }
      }

      // Check credential ID matches
      let idMatches = false;
      try {
        const recomputedId = computeCredentialId({
          root: cred.merkleRoot,
          issuerDid: cred.issuerDid,
          issuanceDate: cred.issuanceDate,
        });
        idMatches = recomputedId.toLowerCase() === cred.id.toLowerCase();
      } catch {
        idMatches = false;
      }

      if (tamperedFields.length > 0) {
        const names = tamperedFields.map((t) => `'${t.field}'`).join(', ');
        const first = tamperedFields[0];
        const singleReason = `Field '${first.field}' was modified after issuance: expected leaf ${first.expectedLeaf.slice(0, 10)}.. but found ${first.actualLeaf.slice(0, 10)}..`;
        const multiReason = `Multiple fields were modified after issuance: ${names}`;
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'fail',
          reason: tamperedFields.length === 1 ? singleReason : multiReason,
          evidence: {
            tamperedFields,
          },
        });
      } else if (!rootMatches) {
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'fail',
          reason: `Merkle root mismatch: declared root ${cred.merkleRoot} does not match recomputed tree root ${recomputedRoot}`,
          evidence: {
            declaredRoot: cred.merkleRoot,
            recomputedRoot,
          },
        });
      } else if (!idMatches) {
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'fail',
          reason: 'Credential ID does not match cryptographic commitment of root, issuerDid, and issuanceDate',
          evidence: {
            declaredId: cred.id,
          },
        });
      } else {
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'pass',
          reason: 'All cryptographic commitments and Merkle leaves verified successfully',
          evidence: {
            fieldCount: sortedFields.length,
            merkleRoot: cred.merkleRoot,
          },
        });
      }
    } else {
      // Presentation verification
      const pres = input as Presentation;
      const revealedFields = Object.keys(pres.revealed ?? {});

      for (const field of revealedFields) {
        const rev = pres.revealed[field];
        const leaf = computeSaltedLeaf(rev.salt, field, rev.value);
        const valid = verifyMerkleProof(rev.proof, leaf, pres.merkleRoot);
        if (!valid) {
          invalidProofs.push(field);
          tamperedFields.push({
            field,
            expectedLeaf: leaf,
            actualLeaf: 'invalid-proof',
          });
        }
      }

      if (invalidProofs.length > 0) {
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'fail',
          reason: `Revealed field '${invalidProofs[0]}' Merkle inclusion proof does not verify against declared root`,
          evidence: {
            invalidProofs,
            tamperedFields,
          },
        });
      } else {
        rules.push({
          id: 'R2',
          name: 'Merkle Integrity & Field Proofs',
          status: 'pass',
          reason: 'All selective-disclosure Merkle inclusion proofs verified against declared root',
          evidence: {
            revealedCount: revealedFields.length,
            merkleRoot: pres.merkleRoot,
          },
        });
      }
    }

    // -------------------------------------------------------------
    // R3: Issuer registered + Active
    // -------------------------------------------------------------
    const institutionId = computeInstitutionId(input.issuerDid);
    let institution: {
      did: string;
      nameHash: string;
      admin: string;
      status: number;
    } | null = null;

    try {
      institution = await source.getInstitution(institutionId);
    } catch {
      institution = null;
    }

    if (!institution) {
      rules.push({
        id: 'R3',
        name: 'Issuer Accreditation Status',
        status: 'fail',
        reason: `Issuer ${input.issuerDid} is not registered in the on-chain registry`,
        evidence: {
          issuerDid: input.issuerDid,
          institutionId,
        },
      });
    } else if (institution.status === 0) {
      rules.push({
        id: 'R3',
        name: 'Issuer Accreditation Status',
        status: 'fail',
        reason: `Issuer ${input.issuerDid} is pending accreditation and not yet active`,
        evidence: {
          status: 0,
          statusName: 'Pending',
        },
      });
    } else if (institution.status === 2) {
      rules.push({
        id: 'R3',
        name: 'Issuer Accreditation Status',
        status: 'fail',
        reason: `Issuer institution ${input.issuerDid} is currently suspended`,
        evidence: {
          status: 2,
          statusName: 'Suspended',
        },
      });
    } else if (institution.status === 3) {
      rules.push({
        id: 'R3',
        name: 'Issuer Accreditation Status',
        status: 'fail',
        reason: `Issuer institution ${input.issuerDid} accreditation has been revoked`,
        evidence: {
          status: 3,
          statusName: 'Revoked',
        },
      });
    } else {
      rules.push({
        id: 'R3',
        name: 'Issuer Accreditation Status',
        status: 'pass',
        reason: 'Issuer is accredited and currently active in the registry',
        evidence: {
          institutionId,
          did: institution.did,
          status: 1,
        },
      });
    }

    // -------------------------------------------------------------
    // R4: Key valid AT anchor time (compromised key / anchored after compromisedAt / backdated issuanceDate)
    // -------------------------------------------------------------
    let keyRecord: {
      institutionId: string;
      status: number;
      validFrom: number;
      compromisedAt: number;
    } | null = null;

    try {
      keyRecord = await source.getKey(input.issuerKey);
    } catch {
      keyRecord = null;
    }

    // Fetch anchor or batch to obtain anchor timestamp
    let anchorRecord: {
      institutionId: string;
      keyAddr: string;
      merkleRoot: string;
      schemaHash: string;
      timestamp: number;
      blockNumber: number;
      txHash: string;
    } | null = null;

    let batchRecord: {
      institutionId: string;
      keyAddr: string;
      batchRoot: string;
      count: number;
      timestamp: number;
      blockNumber: number;
      txHash: string;
    } | null = null;

    try {
      if (input.batch) {
        batchRecord = await source.getBatch(input.batch.batchId);
        // Time travel check
        if (asOf && batchRecord && batchRecord.timestamp > asOf) {
          batchRecord = null;
        }
      } else {
        anchorRecord = await source.getAnchor(credentialId);
        // Time travel check
        if (asOf && anchorRecord && anchorRecord.timestamp > asOf) {
          anchorRecord = null;
        }
      }
    } catch {
      anchorRecord = null;
      batchRecord = null;
    }

    const anchorTime = batchRecord
      ? batchRecord.timestamp
      : anchorRecord
        ? anchorRecord.timestamp
        : input.issuanceDate;

    if (!keyRecord || keyRecord.status === 0) {
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Signing key ${input.issuerKey} is not registered in the trust registry`,
        evidence: {
          issuerKey: input.issuerKey,
        },
      });
    } else if (
      keyRecord.institutionId.toLowerCase() !== institutionId.toLowerCase()
    ) {
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Signing key ${input.issuerKey} does not belong to issuing institution ${input.issuerDid}`,
        evidence: {
          keyInstitution: keyRecord.institutionId,
          expectedInstitution: institutionId,
        },
      });
    } else if (anchorTime < keyRecord.validFrom) {
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Signing key was not yet valid at anchor time (validFrom: ${keyRecord.validFrom}, anchor: ${anchorTime})`,
        evidence: {
          validFrom: keyRecord.validFrom,
          anchorTimestamp: anchorTime,
        },
      });
    } else if (
      keyRecord.status === 3 &&
      keyRecord.compromisedAt > 0 &&
      anchorTime >= keyRecord.compromisedAt
    ) {
      const diffMinutes = Math.round(
        (anchorTime - keyRecord.compromisedAt) / 60
      );
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Signing key was reported compromised at ${keyRecord.compromisedAt}; this credential was anchored ${diffMinutes} minutes after that`,
        evidence: {
          suspicious: true,
          compromisedAt: keyRecord.compromisedAt,
          anchorTimestamp: anchorTime,
          diffMinutes,
        },
      });
    } else if (
      (anchorRecord || batchRecord) &&
      anchorTime - input.issuanceDate > 3600
    ) {
      const driftSeconds = anchorTime - input.issuanceDate;
      const driftHours = (driftSeconds / 3600).toFixed(1);
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Issuance date is backdated by more than 1 hour (${driftHours}h) prior to on-chain anchor`,
        evidence: {
          suspicious: true,
          issuanceDate: input.issuanceDate,
          anchorTimestamp: anchorTime,
          driftSeconds,
        },
      });
    } else if (keyRecord.status === 2) {
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'fail',
        reason: `Signing key ${input.issuerKey} is currently suspended`,
        evidence: {
          status: 'Suspended',
        },
      });
    } else {
      rules.push({
        id: 'R4',
        name: 'Signing Key Validity & Issuance Window',
        status: 'pass',
        reason: 'Signing key was active and valid at the time of anchoring',
        evidence: {
          issuerKey: input.issuerKey,
          validFrom: keyRecord.validFrom,
          anchorTimestamp: anchorTime,
          isRetired: keyRecord.status === 4,
        },
      });
    }

    // -------------------------------------------------------------
    // R5: Signature recovers to issuerKey AND key belongs to issuer institution
    // -------------------------------------------------------------
    let recoveredSigner = '';
    let signatureMatches = false;
    try {
      const digest = computeSignedDigest({
        root: input.merkleRoot,
        issuerDid: input.issuerDid,
        issuanceDate: input.issuanceDate,
        expirationDate: input.expirationDate,
        holderDid: input.holderDid,
        schema: input.schema,
      });
      recoveredSigner = verifyMessage(getBytes(digest), input.signature);
      signatureMatches =
        recoveredSigner.toLowerCase() === input.issuerKey.toLowerCase();
    } catch {
      signatureMatches = false;
    }

    if (!signatureMatches) {
      rules.push({
        id: 'R5',
        name: 'Signature Verification & Issuer Binding',
        status: 'fail',
        reason: `Signature verification failed: recovered signer ${recoveredSigner} does not match declared issuerKey ${input.issuerKey}`,
        evidence: {
          recoveredSigner,
          declaredIssuerKey: input.issuerKey,
        },
      });
    } else if (
      !keyRecord ||
      keyRecord.institutionId.toLowerCase() !== institutionId.toLowerCase()
    ) {
      rules.push({
        id: 'R5',
        name: 'Signature Verification & Issuer Binding',
        status: 'fail',
        reason: `Signing key ${input.issuerKey} does not belong to the issuing institution ${input.issuerDid}`,
        evidence: {
          keyInstitution: keyRecord?.institutionId,
          expectedInstitution: institutionId,
        },
      });
    } else {
      rules.push({
        id: 'R5',
        name: 'Signature Verification & Issuer Binding',
        status: 'pass',
        reason: 'Signature is authentic and cryptographically bound to an authorized key of the institution',
        evidence: {
          signer: recoveredSigner,
          institutionId,
        },
      });
    }

    // -------------------------------------------------------------
    // R6: On-chain anchor (direct or batch inclusion proof) exists and root matches
    // -------------------------------------------------------------
    if (input.batch) {
      if (!batchRecord) {
        rules.push({
          id: 'R6',
          name: 'On-Chain Anchor Verification',
          status: 'fail',
          reason: `Batch anchor record ${input.batch.batchId} not found on-chain`,
          evidence: {
            batchId: input.batch.batchId,
          },
        });
      } else {
        const batchProofValid = verifyMerkleProof(
          input.batch.proof,
          credentialId,
          batchRecord.batchRoot
        );
        if (!batchProofValid) {
          rules.push({
            id: 'R6',
            name: 'On-Chain Anchor Verification',
            status: 'fail',
            reason: `Batch Merkle inclusion proof is invalid for credential ${credentialId}`,
            evidence: {
              batchId: input.batch.batchId,
              credentialId,
              batchRoot: batchRecord.batchRoot,
            },
          });
        } else {
          rules.push({
            id: 'R6',
            name: 'On-Chain Anchor Verification',
            status: 'pass',
            reason: `Credential confirmed in batch ${input.batch.batchId} anchored in block ${batchRecord.blockNumber} (tx: ${batchRecord.txHash})`,
            evidence: {
              batchId: input.batch.batchId,
              blockNumber: batchRecord.blockNumber,
              txHash: batchRecord.txHash,
              batchRoot: batchRecord.batchRoot,
            },
          });
        }
      }
    } else {
      if (!anchorRecord) {
        rules.push({
          id: 'R6',
          name: 'On-Chain Anchor Verification',
          status: 'fail',
          reason: `Credential ${credentialId} has not been anchored on-chain`,
          evidence: {
            credentialId,
          },
        });
      } else if (
        anchorRecord.merkleRoot.toLowerCase() !==
        input.merkleRoot.toLowerCase()
      ) {
        rules.push({
          id: 'R6',
          name: 'On-Chain Anchor Verification',
          status: 'fail',
          reason: `On-chain Merkle root does not match credential root`,
          evidence: {
            onChainRoot: anchorRecord.merkleRoot,
            credentialRoot: input.merkleRoot,
            blockNumber: anchorRecord.blockNumber,
            txHash: anchorRecord.txHash,
          },
        });
      } else {
        rules.push({
          id: 'R6',
          name: 'On-Chain Anchor Verification',
          status: 'pass',
          reason: `Credential root confirmed anchored on-chain in block ${anchorRecord.blockNumber} (tx: ${anchorRecord.txHash})`,
          evidence: {
            blockNumber: anchorRecord.blockNumber,
            txHash: anchorRecord.txHash,
            merkleRoot: anchorRecord.merkleRoot,
          },
        });
      }
    }

    // -------------------------------------------------------------
    // R7: Status Good (Suspended -> fail; Revoked -> fail with reasonCode + txHash)
    // -------------------------------------------------------------
    let statusRecord: {
      state: number;
      reasonCode: number;
      timestamp: number;
      by: string;
      txHash: string;
    } | null = null;

    try {
      statusRecord = await source.getCredentialStatus(credentialId);
      // Time travel check
      if (asOf && statusRecord && statusRecord.timestamp > asOf) {
        statusRecord = null;
      }
    } catch {
      statusRecord = null;
    }

    if (!statusRecord || statusRecord.state === 0) {
      rules.push({
        id: 'R7',
        name: 'Credential Revocation & Suspension Status',
        status: 'pass',
        reason: 'Credential status is in good standing (not suspended or revoked)',
        evidence: {
          state: 0,
          stateName: 'Good',
        },
      });
    } else if (statusRecord.state === 1) {
      rules.push({
        id: 'R7',
        name: 'Credential Revocation & Suspension Status',
        status: 'fail',
        reason: 'Credential is temporarily suspended',
        evidence: {
          state: 1,
          stateName: 'Suspended',
          timestamp: statusRecord.timestamp,
          by: statusRecord.by,
          txHash: statusRecord.txHash,
        },
      });
    } else if (statusRecord.state === 2) {
      const reasonName =
        ReasonName[statusRecord.reasonCode] ?? `Code ${statusRecord.reasonCode}`;
      rules.push({
        id: 'R7',
        name: 'Credential Revocation & Suspension Status',
        status: 'fail',
        reason: `Credential revoked in block (tx ${statusRecord.txHash}), reason: ${reasonName}`,
        evidence: {
          state: 2,
          stateName: 'Revoked',
          reasonCode: statusRecord.reasonCode,
          reason: reasonName,
          timestamp: statusRecord.timestamp,
          by: statusRecord.by,
          txHash: statusRecord.txHash,
        },
      });
    }

    // -------------------------------------------------------------
    // R8: Not expired
    // -------------------------------------------------------------
    if (input.expirationDate === 0) {
      rules.push({
        id: 'R8',
        name: 'Credential Expiration',
        status: 'pass',
        reason: 'Credential has no expiration date (perpetual validity)',
        evidence: {
          expirationDate: 0,
        },
      });
    } else if (now > input.expirationDate) {
      const expStr = new Date(input.expirationDate * 1000).toISOString();
      rules.push({
        id: 'R8',
        name: 'Credential Expiration',
        status: 'fail',
        reason: `Credential expired on ${expStr}`,
        evidence: {
          expirationDate: input.expirationDate,
          now,
        },
      });
    } else {
      const expStr = new Date(input.expirationDate * 1000).toISOString();
      rules.push({
        id: 'R8',
        name: 'Credential Expiration',
        status: 'pass',
        reason: `Credential is unexpired (valid until ${expStr})`,
        evidence: {
          expirationDate: input.expirationDate,
          now,
        },
      });
    }

    // -------------------------------------------------------------
    // R9: Holder binding via nonce (presentations only, else skip)
    // -------------------------------------------------------------
    if (!isPresentation) {
      rules.push({
        id: 'R9',
        name: 'Holder Identity & Nonce Verification',
        status: 'skip',
        reason: 'Holder binding check skipped for raw credential (presentation required)',
        evidence: {},
      });
    } else {
      const pres = input as Presentation;
      let expectedHolder = '';
      try {
        expectedHolder = recoverHolderAddress(pres.holderDid);
      } catch (e: any) {
        expectedHolder = '';
      }

      if (!expectedHolder) {
        rules.push({
          id: 'R9',
          name: 'Holder Identity & Nonce Verification',
          status: 'fail',
          reason: `Invalid holderDid format in presentation: "${pres.holderDid}"`,
          evidence: {
            holderDid: pres.holderDid,
          },
        });
      } else if (opts?.nonce && pres.nonce !== opts.nonce) {
        rules.push({
          id: 'R9',
          name: 'Holder Identity & Nonce Verification',
          status: 'fail',
          reason: 'Presentation nonce does not match verifier challenge nonce',
          evidence: {
            expectedNonce: opts.nonce,
            actualNonce: pres.nonce,
          },
        });
      } else if (!pres.holderSignature) {
        rules.push({
          id: 'R9',
          name: 'Holder Identity & Nonce Verification',
          status: 'fail',
          reason: 'Presentation is missing holder cryptographic signature',
          evidence: {},
        });
      } else {
        let recoveredHolder = '';
        try {
          recoveredHolder = verifyMessage(
            pres.nonce ?? '',
            pres.holderSignature
          );
        } catch {
          recoveredHolder = '';
        }

        if (
          !recoveredHolder ||
          recoveredHolder.toLowerCase() !== expectedHolder.toLowerCase()
        ) {
          rules.push({
            id: 'R9',
            name: 'Holder Identity & Nonce Verification',
            status: 'fail',
            reason: `Holder signature does not match holder DID address (recovered: ${recoveredHolder}, expected: ${expectedHolder})`,
            evidence: {
              recoveredHolder,
              expectedHolder,
            },
          });
        } else {
          rules.push({
            id: 'R9',
            name: 'Holder Identity & Nonce Verification',
            status: 'pass',
            reason: 'Holder identity verified: signature matches holder DID address with valid nonce challenge',
            evidence: {
              holderAddress: recoveredHolder,
              nonce: pres.nonce,
            },
          });
        }
      }
    }

    // -------------------------------------------------------------
    // R10: Snapshot freshness (only when source=snapshot)
    // -------------------------------------------------------------
    if (sourceMeta.source !== 'snapshot') {
      rules.push({
        id: 'R10',
        name: 'Snapshot Freshness & Publisher Verification',
        status: 'skip',
        reason: 'Snapshot freshness check skipped (verifying directly against on-chain source)',
        evidence: {
          source: sourceMeta.source,
        },
      });
    } else {
      if (sourceMeta.publisherVerified === false) {
        rules.push({
          id: 'R10',
          name: 'Snapshot Freshness & Publisher Verification',
          status: 'fail',
          reason: 'Snapshot signature was not verified by trusted on-chain publisher',
          evidence: {
            publisherVerified: false,
          },
        });
      } else {
        const ageSeconds = now - sourceMeta.timestamp;
        if (ageSeconds < 3600) {
          rules.push({
            id: 'R10',
            name: 'Snapshot Freshness & Publisher Verification',
            status: 'pass',
            reason: `Snapshot is fresh (< 1 hour old: ${ageSeconds}s)`,
            evidence: {
              ageSeconds,
              snapshotTimestamp: sourceMeta.timestamp,
            },
          });
        } else if (ageSeconds < 86400) {
          const hours = (ageSeconds / 3600).toFixed(1);
          rules.push({
            id: 'R10',
            name: 'Snapshot Freshness & Publisher Verification',
            status: 'warn',
            reason: `Snapshot is between 1h and 24h old (${hours} hours)`,
            evidence: {
              ageSeconds,
              snapshotTimestamp: sourceMeta.timestamp,
            },
          });
        } else {
          const hours = (ageSeconds / 3600).toFixed(1);
          rules.push({
            id: 'R10',
            name: 'Snapshot Freshness & Publisher Verification',
            status: 'fail',
            reason: `Snapshot is older than 24 hours (${hours} hours); refusing to accept stale trust anchor`,
            evidence: {
              ageSeconds,
              snapshotTimestamp: sourceMeta.timestamp,
            },
          });
        }
      }
    }
  } catch (fatalErr: any) {
    // If any unforeseen error occurs, add an R1 failure so verify never throws
    rules.push({
      id: 'R1',
      name: 'Schema Validation',
      status: 'fail',
      reason: `Unexpected verification processing error: ${fatalErr?.message ?? 'unknown'}`,
      evidence: { error: String(fatalErr) },
    });
  }

  // -------------------------------------------------------------
  // Compute Verdict and Trust Score
  // Verdict rule:
  // any fail with evidence.suspicious -> SUSPICIOUS;
  // else any fail -> INVALID;
  // else any warn -> VALID_WITH_WARNINGS;
  // else VALID.
  // Bands: INVALID <= 30, SUSPICIOUS 31-60, VALID_WITH_WARNINGS 61-89, VALID 90-100.
  // -------------------------------------------------------------
  const failures = rules.filter((r) => r.status === 'fail');
  const warnings = rules.filter((r) => r.status === 'warn');
  const hasSuspicious = failures.some((r) => r.evidence?.suspicious === true);

  let verdict: Verdict;
  let trustScore: number;

  if (hasSuspicious) {
    verdict = 'SUSPICIOUS';
    trustScore = 45;
  } else if (failures.length > 0) {
    verdict = 'INVALID';
    trustScore = failures.length === 1 ? 25 : 10;
  } else if (warnings.length > 0) {
    verdict = 'VALID_WITH_WARNINGS';
    trustScore = Math.max(65, 85 - (warnings.length - 1) * 10);
  } else {
    verdict = 'VALID';
    trustScore = 100;
  }

  // Generate plain English human-readable explanation
  let explanation = '';
  if (verdict === 'VALID') {
    explanation =
      'Credential is fully verified: active accredited issuer, valid cryptographic commitments, confirmed on-chain anchor, and good standing.';
  } else if (verdict === 'VALID_WITH_WARNINGS') {
    const warnMsgs = warnings.map((w) => w.reason).join('; ');
    explanation = `Credential is cryptographically authentic, but warnings were detected: ${warnMsgs}`;
  } else if (verdict === 'SUSPICIOUS') {
    const susRule = failures.find((r) => r.evidence?.suspicious);
    explanation = `SUSPICIOUS ACTIVITY DETECTED: ${susRule?.reason ?? 'Anomalous key or issuance timeline detected.'}`;
  } else {
    const failMsgs = failures.map((f) => f.reason).join('; ');
    explanation = `Verification failed: ${failMsgs}`;
  }

  // Compute receipt
  const receiptPayload = {
    verdict,
    trustScore,
    rules: rules.map((r) => ({ id: r.id, status: r.status, reason: r.reason })),
    verifiedAt,
    source: sourceMeta.source,
    blockNumber: sourceMeta.blockNumber,
    asOf,
  };
  const receiptCanonical = canonicalize(receiptPayload) ?? JSON.stringify(receiptPayload);
  const receiptHash = keccak256(toUtf8Bytes(receiptCanonical));

  const result: VerificationResult = {
    verdict,
    trustScore,
    rules,
    explanation,
    receipt: {
      hash: receiptHash,
      verifiedAt,
      source: sourceMeta.source,
      blockNumber: sourceMeta.blockNumber,
      asOf,
    },
  };

  if (tamperedFields.length > 0 || invalidProofs.length > 0) {
    result.forensics = {
      tamperedFields,
      invalidProofs,
    };
  }

  return result;
}
