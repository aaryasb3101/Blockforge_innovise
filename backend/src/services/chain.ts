import { ethers } from 'ethers';
import { config } from '../config.js';
import { REGISTRY_ABI } from '../../../shared/abi.js';

export class ChainService {
  public provider: ethers.JsonRpcProvider;
  public registry: ethers.Contract;
  public registryInterface: ethers.Interface;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.registryInterface = new ethers.Interface(REGISTRY_ABI);
    this.registry = new ethers.Contract(config.registryAddress, REGISTRY_ABI, this.provider);
  }

  public getContractWithSigner(signer: ethers.Signer): ethers.Contract {
    return new ethers.Contract(config.registryAddress, REGISTRY_ABI, signer);
  }

  public async getLatestBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  public decodeRevert(error: any): { errorName: string; args: any[] } | null {
    if (!error) return null;

    // Check data property in error or nested error
    const errorData =
      error.data ||
      error.error?.data ||
      error.info?.error?.data ||
      (typeof error.message === 'string' && error.message.match(/0x[a-fA-F0-9]{8,}/)?.[0]);

    if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
      try {
        const parsed = this.registryInterface.parseError(errorData);
        if (parsed) {
          return { errorName: parsed.name, args: Array.from(parsed.args) };
        }
      } catch {
        // Not a known registry error
      }
    }

    // Check message string for known custom error names
    const knownErrors = [
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

    const errString = error.message || String(error);
    for (const name of knownErrors) {
      if (errString.includes(name)) {
        return { errorName: name, args: [] };
      }
    }

    return null;
  }
}

export const chainService = new ChainService();
