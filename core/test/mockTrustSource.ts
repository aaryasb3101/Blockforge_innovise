import { TrustSource } from '../src/types.js';

export interface MockInstitutionData {
  did: string;
  nameHash: string;
  admin: string;
  status: number;
}

export interface MockKeyData {
  institutionId: string;
  status: number;
  validFrom: number;
  compromisedAt: number;
}

export interface MockAnchorData {
  institutionId: string;
  keyAddr: string;
  merkleRoot: string;
  schemaHash: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface MockBatchData {
  institutionId: string;
  keyAddr: string;
  batchRoot: string;
  count: number;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export interface MockCredentialStatusData {
  state: number;
  reasonCode: number;
  timestamp: number;
  by: string;
  txHash: string;
}

export class MockTrustSource implements TrustSource {
  public institutions = new Map<string, MockInstitutionData>();
  public keys = new Map<string, MockKeyData>();
  public anchors = new Map<string, MockAnchorData>();
  public batches = new Map<string, MockBatchData>();
  public statuses = new Map<string, MockCredentialStatusData>();
  public currentBlock = 100;
  public currentTimestamp = Math.floor(Date.now() / 1000);
  public sourceKind: 'chain' | 'snapshot' = 'chain';
  public isPublisherVerified = true;

  async getInstitution(id: string): Promise<MockInstitutionData | null> {
    return this.institutions.get(id.toLowerCase()) ?? null;
  }

  async getKey(addr: string): Promise<MockKeyData | null> {
    return this.keys.get(addr.toLowerCase()) ?? null;
  }

  async getAnchor(credId: string): Promise<MockAnchorData | null> {
    return this.anchors.get(credId.toLowerCase()) ?? null;
  }

  async getBatch(batchId: string): Promise<MockBatchData | null> {
    return this.batches.get(batchId.toLowerCase()) ?? null;
  }

  async getCredentialStatus(
    credId: string
  ): Promise<MockCredentialStatusData | null> {
    return this.statuses.get(credId.toLowerCase()) ?? null;
  }

  async meta(): Promise<{
    blockNumber: number;
    timestamp: number;
    source: 'chain' | 'snapshot';
    fetchedAt: number;
    publisherVerified?: boolean;
  }> {
    return {
      blockNumber: this.currentBlock,
      timestamp: this.currentTimestamp,
      source: this.sourceKind,
      fetchedAt: Date.now(),
      publisherVerified: this.isPublisherVerified,
    };
  }

  // Convenience helper methods for tests
  setInstitution(id: string, data: MockInstitutionData) {
    this.institutions.set(id.toLowerCase(), data);
  }

  setKey(addr: string, data: MockKeyData) {
    this.keys.set(addr.toLowerCase(), data);
  }

  setAnchor(credId: string, data: MockAnchorData) {
    this.anchors.set(credId.toLowerCase(), data);
  }

  setBatch(batchId: string, data: MockBatchData) {
    this.batches.set(batchId.toLowerCase(), data);
  }

  setStatus(credId: string, data: MockCredentialStatusData) {
    this.statuses.set(credId.toLowerCase(), data);
  }
}
