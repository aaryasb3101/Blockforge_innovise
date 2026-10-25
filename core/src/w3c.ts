import { Credential } from './types.js';

export interface W3CVerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    key: string;
  };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: any;
  };
  proof: {
    type: 'TrustMeshMerkleSignature2026';
    created: string;
    verificationMethod: string;
    proofPurpose: 'assertionMethod';
    merkleRoot: string;
    salts: Record<string, string>;
    leaves: Record<string, string>;
    signatureValue: string;
    batch?: {
      batchId: string;
      proof: string[];
    };
  };
}

/**
 * Converts internal Credential model to standard W3C Verifiable Credential JSON-LD format.
 */
export function toVerifiableCredential(
  cred: Credential
): W3CVerifiableCredential {
  const issuanceISO = new Date(cred.issuanceDate * 1000).toISOString();
  const vc: W3CVerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://schema.org',
      'https://trustmesh.network/contexts/v1',
    ],
    id: `urn:trustmesh:${cred.id}`,
    type: ['VerifiableCredential', cred.schema],
    issuer: {
      id: cred.issuerDid,
      key: cred.issuerKey,
    },
    issuanceDate: issuanceISO,
    credentialSubject: {
      id: cred.holderDid,
      ...cred.fields,
    },
    proof: {
      type: 'TrustMeshMerkleSignature2026',
      created: issuanceISO,
      verificationMethod: cred.issuerKey,
      proofPurpose: 'assertionMethod',
      merkleRoot: cred.merkleRoot,
      salts: cred.salts,
      leaves: cred.leaves,
      signatureValue: cred.signature,
      batch: cred.batch,
    },
  };

  if (cred.expirationDate > 0) {
    vc.expirationDate = new Date(cred.expirationDate * 1000).toISOString();
  }

  return vc;
}

/**
 * Reconstructs internal Credential model from a W3C Verifiable Credential.
 */
export function fromVerifiableCredential(
  vc: W3CVerifiableCredential
): Credential {
  const id = vc.id.startsWith('urn:trustmesh:')
    ? vc.id.replace('urn:trustmesh:', '')
    : vc.id;

  const schema =
    vc.type.find((t) => t !== 'VerifiableCredential') ?? 'TrustMeshCredential';

  const issuerDid = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;
  const issuerKey =
    vc.proof.verificationMethod ??
    (typeof vc.issuer === 'object' ? vc.issuer.key : '');

  const holderDid = vc.credentialSubject.id;
  const { id: _subId, ...fields } = vc.credentialSubject;

  const issuanceDate = Math.floor(new Date(vc.issuanceDate).getTime() / 1000);
  const expirationDate = vc.expirationDate
    ? Math.floor(new Date(vc.expirationDate).getTime() / 1000)
    : 0;

  return {
    id,
    schema,
    issuerDid,
    issuerKey,
    holderDid,
    issuanceDate,
    expirationDate,
    fields,
    salts: vc.proof.salts,
    leaves: vc.proof.leaves,
    merkleRoot: vc.proof.merkleRoot,
    signature: vc.proof.signatureValue,
    batch: vc.proof.batch,
  };
}
