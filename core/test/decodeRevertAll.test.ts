import { describe, it, expect } from 'vitest';
import { Interface } from 'ethers';
import { REGISTRY_ABI } from '../src/abi.js';
import { decodeRevert } from '../src/registryClient.js';

describe('decodeRevert Custom Error Coverage', () => {
  const iface = new Interface(REGISTRY_ABI);

  const customErrors = [
    'NotAccreditor',
    'NotInstitutionAdmin',
    'NotGuardian',
    'NotAuthorizedIssuer',
    'InstitutionNotActive',
    'KeyNotActive',
    'KeyAlreadyExists',
    'AlreadyAnchored',
    'AlreadyApproved',
    'NotIssuerOfCredential',
    'UnknownInstitution',
    'UnknownCredential',
    'InvalidProof',
    'InvalidState',
    'TimelockNotElapsed',
    'QuorumNotReached',
    'InvalidCompromiseTime',
    'NotSnapshotPublisher',
  ];

  for (const errorName of customErrors) {
    it(`decodes ${errorName} from encoded error data`, () => {
      const encoded = iface.encodeErrorResult(errorName, []);
      const res = decodeRevert({ data: encoded });
      expect(res).not.toBeNull();
      expect(res?.errorName).toBe(errorName);
    });

    it(`decodes ${errorName} from textual error message`, () => {
      const res = decodeRevert({
        message: `execution reverted: custom error '${errorName}()'`,
      });
      expect(res).not.toBeNull();
      expect(res?.errorName).toBe(errorName);
    });
  }
});
