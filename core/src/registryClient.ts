import {
  Contract,
  ContractRunner,
  ContractTransactionResponse,
  Interface,
} from 'ethers';
import { REGISTRY_ABI } from './abi.js';

export interface DecodedRevert {
  errorName: string;
  args: any[];
}

const registryInterface = new Interface(REGISTRY_ABI);

const KNOWN_CUSTOM_ERRORS = [
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

/**
 * Robust revert error decoder for ethers v6 supporting both Hardhat and public RPC error structures.
 */
export function decodeRevert(err: any): DecodedRevert | null {
  if (!err) return null;

  // Direct parsed error on ethers ErrorDescription
  if (err.errorName) {
    return {
      errorName: err.errorName,
      args: err.args ? Array.from(err.args) : [],
    };
  }

  // Check error revert property in ethers v6
  if (err.revert?.name) {
    return {
      errorName: err.revert.name,
      args: err.revert.args ? Array.from(err.revert.args) : [],
    };
  }

  // Extract raw error data hex string from common error nesting structures
  const candidates: Array<string | undefined> = [
    err.data,
    err.error?.data,
    err.info?.error?.data,
    err.error?.data?.data,
    err.info?.data,
    err.response?.data,
    err.cause?.data,
    err.transactionExecutionError?.cause?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('0x') && candidate.length >= 10) {
      try {
        const parsed = registryInterface.parseError(candidate);
        if (parsed) {
          return {
            errorName: parsed.name,
            args: Array.from(parsed.args),
          };
        }
      } catch {
        // Continue looking
      }
    }
  }

  // Parse string error messages from Hardhat or Ganache
  const fullMessage = `${err.shortMessage ?? ''} ${err.message ?? ''} ${err.reason ?? ''}`;

  for (const known of KNOWN_CUSTOM_ERRORS) {
    if (fullMessage.includes(known)) {
      return {
        errorName: known,
        args: [],
      };
    }
  }

  return null;
}

/**
 * Typed client wrapper over every ABI function of TrustRegistry.sol
 */
export class RegistryClient {
  public contract: Contract;
  public address: string;
  public runner: ContractRunner;

  constructor(signerOrProvider: ContractRunner, registryAddress: string) {
    this.runner = signerOrProvider;
    this.address = registryAddress;
    this.contract = new Contract(registryAddress, REGISTRY_ABI, signerOrProvider);
  }

  connect(newRunner: ContractRunner): RegistryClient {
    return new RegistryClient(newRunner, this.address);
  }

  // --- Institutions ---

  async registerInstitution(
    did: string,
    nameHash: string,
    admin: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.registerInstitution(did, nameHash, admin);
  }

  async approveInstitution(id: string): Promise<ContractTransactionResponse> {
    return this.contract.approveInstitution(id);
  }

  async suspendInstitution(id: string): Promise<ContractTransactionResponse> {
    return this.contract.suspendInstitution(id);
  }

  async reinstateInstitution(id: string): Promise<ContractTransactionResponse> {
    return this.contract.reinstateInstitution(id);
  }

  async revokeInstitution(id: string): Promise<ContractTransactionResponse> {
    return this.contract.revokeInstitution(id);
  }

  // --- Keys ---

  async addKey(
    institutionId: string,
    key: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.addKey(institutionId, key);
  }

  async suspendKey(key: string): Promise<ContractTransactionResponse> {
    return this.contract.suspendKey(key);
  }

  async reinstateKey(key: string): Promise<ContractTransactionResponse> {
    return this.contract.reinstateKey(key);
  }

  async revokeKey(
    key: string,
    compromisedAt: number | bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.revokeKey(key, compromisedAt);
  }

  async rotateKey(
    oldKey: string,
    newKey: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.rotateKey(oldKey, newKey);
  }

  // --- Guardian Recovery ---

  async setGuardians(
    institutionId: string,
    guardians: string[],
    threshold: number
  ): Promise<ContractTransactionResponse> {
    return this.contract.setGuardians(institutionId, guardians, threshold);
  }

  async proposeRecovery(
    institutionId: string,
    newAdmin: string,
    newKey: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.proposeRecovery(institutionId, newAdmin, newKey);
  }

  async approveRecovery(
    proposalId: number | bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.approveRecovery(proposalId);
  }

  async executeRecovery(
    proposalId: number | bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.executeRecovery(proposalId);
  }

  async cancelRecovery(
    proposalId: number | bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.cancelRecovery(proposalId);
  }

  // --- Credentials ---

  async anchorCredential(
    credentialId: string,
    merkleRoot: string,
    schemaHash: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.anchorCredential(credentialId, merkleRoot, schemaHash);
  }

  async anchorBatch(
    batchId: string,
    batchRoot: string,
    count: number
  ): Promise<ContractTransactionResponse> {
    return this.contract.anchorBatch(batchId, batchRoot, count);
  }

  async revokeCredential(
    credentialId: string,
    reasonCode: number
  ): Promise<ContractTransactionResponse> {
    return this.contract.revokeCredential(credentialId, reasonCode);
  }

  async revokeBatchCredential(
    batchId: string,
    credentialId: string,
    proof: string[],
    reasonCode: number
  ): Promise<ContractTransactionResponse> {
    return this.contract.revokeBatchCredential(
      batchId,
      credentialId,
      proof,
      reasonCode
    );
  }

  async suspendCredential(
    credentialId: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.suspendCredential(credentialId);
  }

  async reinstateCredential(
    credentialId: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.reinstateCredential(credentialId);
  }

  // --- Snapshot ---

  async setSnapshotPublisher(
    publisher: string
  ): Promise<ContractTransactionResponse> {
    return this.contract.setSnapshotPublisher(publisher);
  }

  async publishSnapshot(
    snapshotHash: string,
    blockNumber: number | bigint
  ): Promise<ContractTransactionResponse> {
    return this.contract.publishSnapshot(snapshotHash, blockNumber);
  }

  // --- Views ---

  async getInstitution(id: string): Promise<[string, string, string, number, number]> {
    const res = await this.contract.getInstitution(id);
    return [res[0], res[1], res[2], Number(res[3]), Number(res[4])];
  }

  async getKey(addr: string): Promise<[string, number, bigint, bigint]> {
    const res = await this.contract.getKey(addr);
    return [res[0], Number(res[1]), res[2], res[3]];
  }

  async getAnchor(credId: string): Promise<[string, string, string, string, bigint]> {
    const res = await this.contract.getAnchor(credId);
    return [res[0], res[1], res[2], res[3], res[4]];
  }

  async getBatch(batchId: string): Promise<[string, string, string, number, bigint]> {
    const res = await this.contract.getBatch(batchId);
    return [res[0], res[1], res[2], Number(res[3]), res[4]];
  }

  async getCredentialStatus(credId: string): Promise<[number, number, bigint, string]> {
    const res = await this.contract.getCredentialStatus(credId);
    return [Number(res[0]), Number(res[1]), res[2], res[3]];
  }

  async isKeyValidAt(key: string, ts: number | bigint): Promise<boolean> {
    return this.contract.isKeyValidAt(key, ts);
  }

  async getGuardians(institutionId: string): Promise<[string[], number]> {
    const res = await this.contract.getGuardians(institutionId);
    return [Array.from(res[0]), Number(res[1])];
  }

  async getRecovery(
    proposalId: number | bigint
  ): Promise<[string, string, string, number, bigint, boolean, boolean]> {
    const res = await this.contract.getRecovery(proposalId);
    return [res[0], res[1], res[2], Number(res[3]), res[4], res[5], res[6]];
  }

  async institutionCount(): Promise<bigint> {
    return this.contract.institutionCount();
  }

  async institutionIdAt(index: number | bigint): Promise<string> {
    return this.contract.institutionIdAt(index);
  }

  async keyCount(institutionId: string): Promise<bigint> {
    return this.contract.keyCount(institutionId);
  }

  async keyAt(institutionId: string, index: number | bigint): Promise<string> {
    return this.contract.keyAt(institutionId, index);
  }

  async snapshotPublisher(): Promise<string> {
    return this.contract.snapshotPublisher();
  }

  async accreditors(): Promise<[string, string, string]> {
    const res = await this.contract.accreditors();
    return [res[0], res[1], res[2]];
  }

  async recoveryDelay(): Promise<bigint> {
    return this.contract.recoveryDelay();
  }
}
