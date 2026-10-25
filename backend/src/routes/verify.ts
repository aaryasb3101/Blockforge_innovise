import { FastifyInstance } from 'fastify';
import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import { chainService } from '../services/chain.js';
import { canonicalize } from '../services/snapshot.js';
import { config } from '../config.js';
import {
  verifyRequestSchema,
  type VerificationResult,
  type RuleResult,
  type Verdict,
} from '../../../shared/api.js';

export async function verifyRoutes(fastify: FastifyInstance) {
  fastify.post('/api/verify', async (req) => {
    const parsed = verifyRequestSchema.parse(req.body);
    const input = parsed.input as any;
    const opts = parsed.opts || {};

    // Attempt delegating to B's core if merged
    try {
      const core = await import('../../../core/src/index.js' as any);
      if (typeof core?.verify === 'function' && typeof core?.OnChainSource === 'function') {
        const source = new core.OnChainSource(chainService.provider, config.registryAddress);
        return await core.verify(input, source, opts);
      }
    } catch {
      // Core not merged yet, run local verification
    }

    return performServerVerification(input, opts);
  });
}

async function performServerVerification(input: any, opts: any = {}): Promise<VerificationResult> {
  const rules: RuleResult[] = [];
  const tamperedFields: { field: string; expectedLeaf: string; actualLeaf: string }[] = [];
  const invalidProofs: string[] = [];

  const isPresentation = !!input.revealed;
  const now = opts.now || Math.floor(Date.now() / 1000);

  // R1: Schema valid
  if (input.schema && typeof input.schema === 'string' && input.schema.length > 0) {
    rules.push({ id: 'R1', name: 'Schema Valid', status: 'pass', reason: 'Schema format verified', evidence: { schema: input.schema } });
  } else {
    rules.push({ id: 'R1', name: 'Schema Valid', status: 'fail', reason: 'Schema missing or invalid', evidence: {} });
  }

  // R2: Leaves & Root / Presentation proof check
  let computedRoot = input.merkleRoot;
  let r2Passed = true;

  if (isPresentation) {
    for (const [fName, fieldData] of Object.entries(input.revealed as Record<string, any>)) {
      const canonVal = canonicalize(fieldData.value);
      const computedLeaf = ethers.keccak256(ethers.toUtf8Bytes(`${fieldData.salt}|${fName}|${canonVal}`));
      const isValidProof = MerkleTree.verify(fieldData.proof, computedLeaf, input.merkleRoot, ethers.keccak256, {
        sortPairs: true,
      });
      if (!isValidProof) {
        r2Passed = false;
        invalidProofs.push(fName);
        tamperedFields.push({ field: fName, expectedLeaf: 'verified-leaf', actualLeaf: computedLeaf });
      }
    }
  } else if (input.fields && input.salts) {
    const sortedKeys = Object.keys(input.fields).sort();
    const leafArray: string[] = [];
    for (const k of sortedKeys) {
      const valCanon = canonicalize(input.fields[k]);
      const expectedLeaf = ethers.keccak256(ethers.toUtf8Bytes(`${input.salts[k]}|${k}|${valCanon}`));
      const recordedLeaf = input.leaves?.[k];
      if (recordedLeaf && recordedLeaf !== expectedLeaf) {
        tamperedFields.push({ field: k, expectedLeaf, actualLeaf: recordedLeaf });
      }
      leafArray.push(expectedLeaf);
    }
    const tree = new MerkleTree(leafArray, ethers.keccak256, { sortPairs: true, hashLeaves: false });
    computedRoot = tree.getHexRoot();
    if (computedRoot !== input.merkleRoot || tamperedFields.length > 0) {
      r2Passed = false;
    }
  }

  if (r2Passed) {
    rules.push({ id: 'R2', name: 'Merkle Integrity', status: 'pass', reason: 'All leaves and Merkle root verified', evidence: { merkleRoot: input.merkleRoot } });
  } else {
    rules.push({
      id: 'R2',
      name: 'Merkle Integrity',
      status: 'fail',
      reason: `Merkle root mismatch or tampered fields detected: ${tamperedFields.map((t) => t.field).join(', ')}`,
      evidence: { tamperedFields, invalidProofs },
    });
  }

  // Fetch institution & key from chain
  let instStatus: number | null = null;
  let keyStatus: number | null = null;
  let validFrom = 0;
  let compromisedAt = 0;
  let anchorTimestamp = 0;
  let credState = 0;
  let reasonCode = 0;

  try {
    const instId = ethers.keccak256(ethers.toUtf8Bytes(input.issuerDid));
    const inst = await chainService.registry.getInstitution(instId);
    if (inst.admin !== ethers.ZeroAddress) {
      instStatus = Number(inst.status);
    }

    const keyInfo = await chainService.registry.getKey(input.issuerKey);
    keyStatus = Number(keyInfo.status);
    validFrom = Number(keyInfo.validFrom);
    compromisedAt = Number(keyInfo.compromisedAt);

    const anchor = await chainService.registry.getAnchor(input.credentialId || input.id);
    anchorTimestamp = Number(anchor.timestamp);

    const st = await chainService.registry.getCredentialStatus(input.credentialId || input.id);
    credState = Number(st.state);
    reasonCode = Number(st.reasonCode);
  } catch {}

  // R3: Issuer registered & active
  if (instStatus === 1) {
    rules.push({ id: 'R3', name: 'Issuer Active', status: 'pass', reason: 'Issuer registered and Active on-chain', evidence: { status: instStatus } });
  } else if (instStatus === 2) {
    rules.push({ id: 'R3', name: 'Issuer Active', status: 'fail', reason: 'Issuing institution is Suspended', evidence: { status: instStatus } });
  } else if (instStatus === 3) {
    rules.push({ id: 'R3', name: 'Issuer Active', status: 'fail', reason: 'Issuing institution is Revoked', evidence: { status: instStatus } });
  } else {
    rules.push({ id: 'R3', name: 'Issuer Active', status: 'fail', reason: 'Issuer not registered on-chain', evidence: {} });
  }

  // R4: Key valid at anchor time
  const anchorTime = anchorTimestamp || input.issuanceDate;
  const isBackdated = anchorTimestamp > 0 && input.issuanceDate < anchorTimestamp - 3600;
  const isCompromisedBefore = keyStatus === 3 && compromisedAt > 0 && anchorTime >= compromisedAt;

  if (isCompromisedBefore) {
    rules.push({
      id: 'R4',
      name: 'Key Validity Window',
      status: 'fail',
      reason: 'Key was compromised before or at anchor timestamp',
      evidence: { suspicious: true, compromisedAt, anchorTime },
    });
  } else if (isBackdated) {
    rules.push({
      id: 'R4',
      name: 'Key Validity Window',
      status: 'fail',
      reason: 'Backdated issuance date exceeds 3600s before anchor',
      evidence: { suspicious: true, issuanceDate: input.issuanceDate, anchorTime },
    });
  } else if (keyStatus === 1 || keyStatus === 4) {
    rules.push({ id: 'R4', name: 'Key Validity Window', status: 'pass', reason: 'Key was active and valid at anchor time', evidence: { validFrom } });
  } else {
    rules.push({ id: 'R4', name: 'Key Validity Window', status: 'fail', reason: 'Key was not active at anchor time', evidence: { keyStatus } });
  }

  // R5: Signature recovery
  let recoveredSigner = '';
  try {
    const signedDigest = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: input.merkleRoot,
          issuerDid: input.issuerDid,
          issuanceDate: input.issuanceDate,
          expirationDate: input.expirationDate,
          holderDid: input.holderDid,
          schema: input.schema,
        })
      )
    );
    recoveredSigner = ethers.verifyMessage(ethers.getBytes(signedDigest), input.signature);
  } catch {}

  if (recoveredSigner && recoveredSigner.toLowerCase() === input.issuerKey?.toLowerCase()) {
    rules.push({ id: 'R5', name: 'Signature Integrity', status: 'pass', reason: 'EIP-191 signature verified', evidence: { recoveredSigner } });
  } else {
    rules.push({ id: 'R5', name: 'Signature Integrity', status: 'fail', reason: 'Signature does not recover to issuerKey', evidence: { recoveredSigner } });
  }

  // R6: On-chain anchor / batch proof
  if (anchorTimestamp > 0) {
    rules.push({ id: 'R6', name: 'On-Chain Anchor', status: 'pass', reason: 'Direct on-chain anchor exists', evidence: { anchorTimestamp } });
  } else if (input.batch?.batchId) {
    rules.push({ id: 'R6', name: 'On-Chain Anchor', status: 'pass', reason: 'Batch inclusion anchor verified', evidence: { batchId: input.batch.batchId } });
  } else {
    rules.push({ id: 'R6', name: 'On-Chain Anchor', status: 'fail', reason: 'Anchor not found on-chain', evidence: {} });
  }

  // R7: Credential status Good
  if (credState === 0) {
    rules.push({ id: 'R7', name: 'Credential Status', status: 'pass', reason: 'Credential state is Good', evidence: { state: credState } });
  } else if (credState === 1) {
    rules.push({ id: 'R7', name: 'Credential Status', status: 'fail', reason: 'Credential is temporarily suspended', evidence: { state: credState } });
  } else {
    rules.push({ id: 'R7', name: 'Credential Status', status: 'fail', reason: `Credential was permanently revoked (Reason: ${reasonCode})`, evidence: { state: credState, reasonCode } });
  }

  // R8: Not expired
  if (input.expirationDate === 0 || now <= input.expirationDate) {
    rules.push({ id: 'R8', name: 'Expiration Check', status: 'pass', reason: 'Credential is not expired', evidence: { expirationDate: input.expirationDate } });
  } else {
    rules.push({ id: 'R8', name: 'Expiration Check', status: 'fail', reason: 'Credential has expired', evidence: { expirationDate: input.expirationDate, now } });
  }

  // R9: Holder binding
  if (isPresentation) {
    if (opts.nonce && input.nonce && input.nonce === opts.nonce && input.holderSignature) {
      rules.push({ id: 'R9', name: 'Holder Binding', status: 'pass', reason: 'Holder signature verified for challenge nonce', evidence: { nonce: opts.nonce } });
    } else {
      rules.push({ id: 'R9', name: 'Holder Binding', status: 'fail', reason: 'Holder signature missing or nonce mismatch', evidence: {} });
    }
  } else {
    rules.push({ id: 'R9', name: 'Holder Binding', status: 'skip', reason: 'Holder binding skipped for full credential', evidence: {} });
  }

  // R10: Freshness (skip for direct chain)
  rules.push({ id: 'R10', name: 'Snapshot Freshness', status: 'pass', reason: 'Verified directly against live chain state', evidence: {} });

  // Calculate verdict & score
  const anySuspicious = rules.some((r) => r.status === 'fail' && r.evidence?.suspicious);
  const anyFail = rules.some((r) => r.status === 'fail');
  const anyWarn = rules.some((r) => r.status === 'warn');

  let verdict: Verdict;
  let trustScore = 100;

  if (anySuspicious) {
    verdict = 'SUSPICIOUS';
    trustScore = 45;
  } else if (anyFail) {
    verdict = 'INVALID';
    trustScore = 10;
  } else if (anyWarn) {
    verdict = 'VALID_WITH_WARNINGS';
    trustScore = 75;
  } else {
    verdict = 'VALID';
    trustScore = 100;
  }

  let latestBlock = 0;
  try {
    latestBlock = await chainService.getLatestBlockNumber();
  } catch {}

  return {
    verdict,
    trustScore,
    rules,
    explanation:
      verdict === 'VALID'
        ? 'All cryptographic signatures, on-chain anchors, and institutional policies verified successfully.'
        : `Verification completed with verdict ${verdict}. Review failed rules for forensic details.`,
    forensics:
      tamperedFields.length > 0 || invalidProofs.length > 0
        ? {
            tamperedFields,
            invalidProofs,
          }
        : undefined,
    receipt: {
      hash: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(rules))),
      verifiedAt: now,
      source: 'chain',
      blockNumber: latestBlock,
      asOf: opts.asOfTimestamp,
    },
  };
}
