import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { issueCredential, createPresentation } from '../src/issuance.js';
import { toVerifiableCredential, fromVerifiableCredential } from '../src/w3c.js';
import { encodeForQr, decodeFromQr } from '../src/qr.js';

describe('W3C VC & QR Code Utilities', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:w3c-inst';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;

  it('toVerifiableCredential and fromVerifiableCredential round-trip preserve all credential data', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'BachelorDegreeCredential',
      fields: {
        studentName: 'Alice',
        cgpa: 9.2,
        graduated: true,
      },
      issuanceDate: 1700000000,
      expirationDate: 1800000000,
    });

    const vc = toVerifiableCredential(cred);
    expect(vc['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    expect(vc.type).toContain('BachelorDegreeCredential');
    expect(vc.proof.type).toBe('TrustMeshMerkleSignature2026');
    expect(vc.proof.merkleRoot).toBe(cred.merkleRoot);
    expect(vc.proof.signatureValue).toBe(cred.signature);

    const reconstructed = fromVerifiableCredential(vc);
    expect(reconstructed.id).toBe(cred.id);
    expect(reconstructed.schema).toBe(cred.schema);
    expect(reconstructed.issuerDid).toBe(cred.issuerDid);
    expect(reconstructed.holderDid).toBe(cred.holderDid);
    expect(reconstructed.issuanceDate).toBe(cred.issuanceDate);
    expect(reconstructed.expirationDate).toBe(cred.expirationDate);
    expect(reconstructed.fields).toEqual(cred.fields);
    expect(reconstructed.salts).toEqual(cred.salts);
    expect(reconstructed.leaves).toEqual(cred.leaves);
    expect(reconstructed.merkleRoot).toBe(cred.merkleRoot);
    expect(reconstructed.signature).toBe(cred.signature);
  });

  it('encodeForQr and decodeFromQr compress and decompress credential and presentation objects', async () => {
    const cred = await issueCredential({
      issuerWallet,
      issuerDid,
      holderDid,
      schema: 'TranscriptCredential',
      fields: {
        courses: 10,
        cgpa: 9.8,
      },
    });

    const qrStr = encodeForQr(cred);
    expect(typeof qrStr).toBe('string');
    expect(qrStr).not.toContain('+');
    expect(qrStr).not.toContain('/');
    expect(qrStr).not.toContain('=');

    const decodedCred = decodeFromQr(qrStr);
    expect(decodedCred).toEqual(cred);

    // Presentation
    const presentation = await createPresentation(
      cred,
      ['cgpa'],
      'qr-nonce-challenge',
      holderWallet
    );

    const qrPresStr = encodeForQr(presentation);
    const decodedPres = decodeFromQr(qrPresStr);
    expect(decodedPres).toEqual(presentation);
  });
});
