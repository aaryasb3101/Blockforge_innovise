import { getBytes } from 'ethers';
import {
  Credential,
  Presentation,
} from './types.js';
import {
  buildCredentialTree,
  buildBatchTree,
  computeSignedDigest,
  computeCredentialId,
  computeBatchId,
  generateSalt,
  recoverHolderAddress,
} from './crypto.js';

export interface WalletSigner {
  address: string;
  signMessage: (message: string | Uint8Array) => Promise<string>;
}

export interface IssueCredentialParams {
  issuerWallet: WalletSigner;
  issuerDid: string;
  holderDid: string;
  schema: string;
  fields: Record<string, string | number | boolean>;
  issuanceDate?: number;
  expirationDate?: number;
  predicates?: Record<string, boolean>;
}

export interface IssueBatchItem {
  holderDid: string;
  schema: string;
  fields: Record<string, string | number | boolean>;
  issuanceDate?: number;
  expirationDate?: number;
  predicates?: Record<string, boolean>;
}

export interface IssueBatchParams {
  issuerWallet: WalletSigner;
  issuerDid: string;
  items: IssueBatchItem[];
  timestamp?: number;
}

/**
 * Issues a Merkle-committed, EIP-191 signed credential.
 */
export async function issueCredential(
  params: IssueCredentialParams
): Promise<Credential> {
  const issuanceDate = params.issuanceDate ?? Math.floor(Date.now() / 1000);
  const expirationDate = params.expirationDate ?? 0;

  // Merge fields with predicates (if provided)
  const combinedFields: Record<string, string | number | boolean> = {
    ...params.fields,
    ...(params.predicates ?? {}),
  };

  // Generate salts for each field
  const salts: Record<string, string> = {};
  for (const field of Object.keys(combinedFields)) {
    salts[field] = generateSalt();
  }

  // Build deterministic Merkle tree (ordered by sorted field name)
  const { root, leaves } = buildCredentialTree(combinedFields, salts);

  // Compute signed digest & EIP-191 signature
  const signedDigest = computeSignedDigest({
    root,
    issuerDid: params.issuerDid,
    issuanceDate,
    expirationDate,
    holderDid: params.holderDid,
    schema: params.schema,
  });

  const signature = await params.issuerWallet.signMessage(
    getBytes(signedDigest)
  );

  // Compute credential ID
  const credentialId = computeCredentialId({
    root,
    issuerDid: params.issuerDid,
    issuanceDate,
  });

  return {
    id: credentialId,
    schema: params.schema,
    issuerDid: params.issuerDid,
    issuerKey: params.issuerWallet.address,
    holderDid: params.holderDid,
    issuanceDate,
    expirationDate,
    fields: combinedFields,
    salts,
    leaves,
    merkleRoot: root,
    signature,
  };
}

/**
 * Issues a batch of credentials committed to a batch Merkle tree.
 */
export async function issueBatch(
  params: IssueBatchParams
): Promise<{
  batchId: string;
  batchRoot: string;
  credentials: Credential[];
}> {
  if (params.items.length === 0) {
    throw new Error('Batch items cannot be empty');
  }

  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const credentials: Credential[] = [];

  for (const item of params.items) {
    const cred = await issueCredential({
      issuerWallet: params.issuerWallet,
      issuerDid: params.issuerDid,
      holderDid: item.holderDid,
      schema: item.schema,
      fields: item.fields,
      issuanceDate: item.issuanceDate ?? timestamp,
      expirationDate: item.expirationDate ?? 0,
      predicates: item.predicates,
    });
    credentials.push(cred);
  }

  const credentialIds = credentials.map((c) => c.id);
  const { root: batchRoot, proofs } = buildBatchTree(credentialIds);
  const batchId = computeBatchId(batchRoot, params.issuerDid, timestamp);

  for (const cred of credentials) {
    cred.batch = {
      batchId,
      proof: proofs[cred.id],
    };
  }

  return {
    batchId,
    batchRoot,
    credentials,
  };
}

/**
 * Creates a selective-disclosure presentation revealing only specified fields,
 * signed by the holder against a verifier nonce.
 */
export async function createPresentation(
  credential: Credential,
  revealFields: string[],
  nonce: string,
  holderWallet: WalletSigner
): Promise<Presentation> {
  const expectedHolderAddress = recoverHolderAddress(credential.holderDid);
  if (
    holderWallet.address.toLowerCase() !== expectedHolderAddress.toLowerCase()
  ) {
    throw new Error(
      `Holder wallet address (${holderWallet.address}) does not match credential holderDid address (${expectedHolderAddress})`
    );
  }

  // Rebuild the credential tree to obtain leaf proofs
  const { tree } = buildCredentialTree(credential.fields, credential.salts);

  const revealed: Record<
    string,
    {
      value: string | number | boolean;
      salt: string;
      proof: string[];
    }
  > = {};

  for (const field of revealFields) {
    if (!(field in credential.fields)) {
      throw new Error(`Cannot reveal non-existent field: "${field}"`);
    }
    const leaf = credential.leaves[field];
    const proof = tree.getHexProof(leaf);
    revealed[field] = {
      value: credential.fields[field],
      salt: credential.salts[field],
      proof,
    };
  }

  // Sign nonce with holder wallet
  const holderSignature = await holderWallet.signMessage(nonce);

  return {
    credentialId: credential.id,
    schema: credential.schema,
    issuerDid: credential.issuerDid,
    issuerKey: credential.issuerKey,
    holderDid: credential.holderDid,
    issuanceDate: credential.issuanceDate,
    expirationDate: credential.expirationDate,
    merkleRoot: credential.merkleRoot,
    signature: credential.signature,
    batch: credential.batch,
    revealed,
    nonce,
    holderSignature,
  };
}
