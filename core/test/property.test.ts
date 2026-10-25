import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Wallet, keccak256, toUtf8Bytes } from 'ethers';
import { issueCredential } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { MockTrustSource } from './mockTrustSource.js';
import { computeInstitutionId } from '../src/crypto.js';
import { InstitutionStatus, KeyStatus } from '../src/types.js';

describe('Property Tests (fast-check)', () => {
  const issuerWallet = Wallet.createRandom();
  const holderWallet = Wallet.createRandom();
  const issuerDid = 'did:trustmesh:property-inst';
  const holderDid = `did:pkh:eip155:1:${holderWallet.address}`;
  const institutionId = computeInstitutionId(issuerDid);
  const baseTimestamp = 1700000000;

  const source = new MockTrustSource();
  source.currentTimestamp = baseTimestamp + 100;
  source.currentBlock = 50;

  source.setInstitution(institutionId, {
    did: issuerDid,
    nameHash: keccak256(toUtf8Bytes('Property Inst')),
    admin: issuerWallet.address,
    status: InstitutionStatus.Active,
  });

  source.setKey(issuerWallet.address, {
    institutionId,
    status: KeyStatus.Active,
    validFrom: baseTimestamp - 3600,
    compromisedAt: 0,
  });

  it('property: modifying any single field value always yields INVALID naming that exact field', async () => {
    // Run property check across multiple iterations
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          fieldToTamper: fc.constantFrom('cgpa', 'major', 'degree', 'year', 'honors'),
          tamperedValue: fc.oneof(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.integer({ min: 1, max: 1000 }),
            fc.boolean()
          ),
        }),
        async ({ fieldToTamper, tamperedValue }) => {
          const originalFields = {
            cgpa: 8.5,
            major: 'Electrical Engineering',
            degree: 'B.Tech',
            year: 2024,
            honors: false,
          };

          // Ensure the tampered value is strictly different
          if (originalFields[fieldToTamper as keyof typeof originalFields] === tamperedValue) {
            return;
          }

          const cred = await issueCredential({
            issuerWallet,
            issuerDid,
            holderDid,
            schema: 'DegreeCredential',
            fields: originalFields,
            issuanceDate: baseTimestamp,
          });

          source.setAnchor(cred.id, {
            institutionId,
            keyAddr: issuerWallet.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: baseTimestamp + 30,
            blockNumber: 50,
            txHash: '0xprop',
          });

          // Tamper that specific field
          const tamperedCred = {
            ...cred,
            fields: {
              ...cred.fields,
              [fieldToTamper]: tamperedValue,
            },
          };

          const res = await verify(tamperedCred, source);

          expect(res.verdict).toBe('INVALID');
          const r2 = res.rules.find((r) => r.id === 'R2');
          expect(r2?.status).toBe('fail');
          expect(res.forensics?.tamperedFields).toBeDefined();

          const namedFields = res.forensics?.tamperedFields.map((f) => f.field);
          expect(namedFields).toContain(fieldToTamper);
        }
      ),
      { numRuns: 30 }
    );
  });
});
