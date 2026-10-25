import canonicalize from 'canonicalize';
import {
  getBytes,
  keccak256,
  toUtf8Bytes,
  verifyMessage,
} from 'ethers';
import { OnChainSource } from './onChainSource.js';
import {
  Snapshot,
  SnapshotAnchor,
  SnapshotBatch,
  SnapshotInstitution,
  SnapshotKey,
  SnapshotStatus,
  TrustSource,
} from './types.js';
import { WalletSigner } from './issuance.js';

/**
 * Computes snapshotHash: keccak256(utf8(canonicalize(bodyWithoutSignature)))
 */
export function snapshotHash(
  snapshot: Snapshot | Omit<Snapshot, 'signature'>
): string {
  const { signature, ...bodyWithoutSignature } = snapshot as any;
  const canonicalStr = canonicalize(bodyWithoutSignature);
  if (!canonicalStr) {
    throw new Error('Failed to canonicalize snapshot body');
  }
  return keccak256(toUtf8Bytes(canonicalStr));
}

/**
 * Verifies that the snapshot signature recovers to the snapshot publisher
 * AND matches the on-chain trusted publisher address.
 */
export function verifySnapshotSignature(
  snapshot: Snapshot,
  trustedPublisher: string
): boolean {
  if (!snapshot.signature || !snapshot.publisher || !trustedPublisher) {
    return false;
  }
  try {
    const hash = snapshotHash(snapshot);
    const recovered = verifyMessage(getBytes(hash), snapshot.signature);
    return (
      recovered.toLowerCase() === snapshot.publisher.toLowerCase() &&
      recovered.toLowerCase() === trustedPublisher.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Builds and signs a complete Snapshot from an OnChainSource.
 */
export async function buildSnapshot(
  source: OnChainSource,
  publisherWallet: WalletSigner
): Promise<Snapshot> {
  const contract = (source as any).contract;
  const provider = (source as any).provider;
  const registryAddress = (source as any).registryAddress;

  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const timestamp = Number(block?.timestamp ?? Math.floor(Date.now() / 1000));
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  // 1. Gather institutions
  const institutions: SnapshotInstitution[] = [];
  const instCountBig = await contract.institutionCount();
  const instCount = Number(instCountBig);

  for (let i = 0; i < instCount; i++) {
    const id = await contract.institutionIdAt(i);
    const inst = await contract.getInstitution(id);
    institutions.push({
      id,
      did: inst[0],
      admin: inst[2],
      status: Number(inst[3]),
    });
  }

  // 2. Gather keys
  const keys: SnapshotKey[] = [];
  for (const inst of institutions) {
    const kCountBig = await contract.keyCount(inst.id);
    const kCount = Number(kCountBig);
    for (let k = 0; k < kCount; k++) {
      const addr = await contract.keyAt(inst.id, k);
      const keyData = await contract.getKey(addr);
      keys.push({
        addr,
        institutionId: keyData[0],
        status: Number(keyData[1]),
        validFrom: Number(keyData[2]),
        compromisedAt: Number(keyData[3]),
      });
    }
  }

  // 3. Gather anchors from event logs
  const anchors: SnapshotAnchor[] = [];
  try {
    const anchorFilter = contract.filters.CredentialAnchored();
    const anchorEvents = await contract.queryFilter(anchorFilter);
    for (const event of anchorEvents) {
      const ev = event as any;
      if (!ev.args) continue;
      const credId = ev.args[0];
      const instId = ev.args[1];
      const keyAddr = ev.args[2];
      const merkleRoot = ev.args[3];
      const evBlock = ev.getBlock ? await ev.getBlock() : await provider.getBlock(ev.blockNumber);
      anchors.push({
        credentialId: credId,
        institutionId: instId,
        keyAddr,
        merkleRoot,
        timestamp: Number(evBlock?.timestamp ?? 0),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      });
    }
  } catch {
    // If events unavailable, continue
  }

  // 4. Gather batches from event logs
  const batches: SnapshotBatch[] = [];
  try {
    const batchFilter = contract.filters.BatchAnchored();
    const batchEvents = await contract.queryFilter(batchFilter);
    for (const event of batchEvents) {
      const ev = event as any;
      if (!ev.args) continue;
      const batchId = ev.args[0];
      const instId = ev.args[1];
      const keyAddr = ev.args[2];
      const batchRoot = ev.args[3];
      const count = Number(ev.args[4]);
      const evBlock = ev.getBlock ? await ev.getBlock() : await provider.getBlock(ev.blockNumber);
      batches.push({
        batchId,
        institutionId: instId,
        keyAddr,
        batchRoot,
        count,
        timestamp: Number(evBlock?.timestamp ?? 0),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      });
    }
  } catch {
    // Continue
  }

  // 5. Gather statuses from event logs
  const statuses: SnapshotStatus[] = [];
  try {
    const statusFilter = contract.filters.CredentialStatusChanged();
    const statusEvents = await contract.queryFilter(statusFilter);
    for (const event of statusEvents) {
      const ev = event as any;
      if (!ev.args) continue;
      const credId = ev.args[0];
      const state = Number(ev.args[2]);
      const reasonCode = Number(ev.args[3]);
      const evBlock = ev.getBlock ? await ev.getBlock() : await provider.getBlock(ev.blockNumber);
      statuses.push({
        credentialId: credId,
        state,
        reasonCode,
        timestamp: Number(evBlock?.timestamp ?? 0),
        txHash: event.transactionHash,
      });
    }
  } catch {
    // Continue
  }

  const bodyWithoutSignature: Omit<Snapshot, 'signature'> = {
    version: 1,
    chainId,
    registry: registryAddress,
    blockNumber,
    timestamp,
    institutions,
    keys,
    anchors,
    batches,
    statuses,
    publisher: publisherWallet.address,
  };

  const hash = snapshotHash(bodyWithoutSignature);
  const signature = await publisherWallet.signMessage(getBytes(hash));

  return {
    ...bodyWithoutSignature,
    signature,
  };
}

/**
 * TrustSource implementation backed by an offline, publisher-signed Snapshot.
 */
export class SnapshotSource implements TrustSource {
  public snapshot: Snapshot;
  public trustedPublisher: string;
  public isPublisherVerified: boolean;
  public customNow?: number;

  private institutionMap = new Map<string, SnapshotInstitution>();
  private keyMap = new Map<string, SnapshotKey>();
  private anchorMap = new Map<string, SnapshotAnchor>();
  private batchMap = new Map<string, SnapshotBatch>();
  private statusMap = new Map<string, SnapshotStatus>();

  constructor(snapshot: Snapshot, trustedPublisher: string, now?: number) {
    this.snapshot = snapshot;
    this.trustedPublisher = trustedPublisher;
    this.customNow = now;
    this.isPublisherVerified = verifySnapshotSignature(
      snapshot,
      trustedPublisher
    );

    for (const inst of snapshot.institutions) {
      this.institutionMap.set(inst.id.toLowerCase(), inst);
    }
    for (const key of snapshot.keys) {
      this.keyMap.set(key.addr.toLowerCase(), key);
    }
    for (const anchor of snapshot.anchors) {
      this.anchorMap.set(anchor.credentialId.toLowerCase(), anchor);
    }
    for (const batch of snapshot.batches) {
      this.batchMap.set(batch.batchId.toLowerCase(), batch);
    }
    for (const status of snapshot.statuses) {
      this.statusMap.set(status.credentialId.toLowerCase(), status);
    }
  }

  async getInstitution(
    id: string
  ): Promise<{ did: string; nameHash: string; admin: string; status: number } | null> {
    const inst = this.institutionMap.get(id.toLowerCase());
    if (!inst) return null;
    return {
      did: inst.did,
      nameHash: '',
      admin: inst.admin,
      status: inst.status,
    };
  }

  async getKey(
    addr: string
  ): Promise<{
    institutionId: string;
    status: number;
    validFrom: number;
    compromisedAt: number;
  } | null> {
    const key = this.keyMap.get(addr.toLowerCase());
    if (!key) return null;
    return {
      institutionId: key.institutionId,
      status: key.status,
      validFrom: key.validFrom,
      compromisedAt: key.compromisedAt,
    };
  }

  async getAnchor(
    credId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    merkleRoot: string;
    schemaHash: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null> {
    const a = this.anchorMap.get(credId.toLowerCase());
    if (!a) return null;
    return {
      institutionId: a.institutionId,
      keyAddr: a.keyAddr,
      merkleRoot: a.merkleRoot,
      schemaHash: '',
      timestamp: a.timestamp,
      blockNumber: a.blockNumber,
      txHash: a.txHash,
    };
  }

  async getBatch(
    batchId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    batchRoot: string;
    count: number;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null> {
    const b = this.batchMap.get(batchId.toLowerCase());
    if (!b) return null;
    return {
      institutionId: b.institutionId,
      keyAddr: b.keyAddr,
      batchRoot: b.batchRoot,
      count: b.count,
      timestamp: b.timestamp,
      blockNumber: b.blockNumber,
      txHash: b.txHash,
    };
  }

  async getCredentialStatus(
    credId: string
  ): Promise<{
    state: number;
    reasonCode: number;
    timestamp: number;
    by: string;
    txHash: string;
  } | null> {
    const s = this.statusMap.get(credId.toLowerCase());
    if (!s) return null;
    return {
      state: s.state,
      reasonCode: s.reasonCode,
      timestamp: s.timestamp,
      by: '',
      txHash: s.txHash,
    };
  }

  async meta(): Promise<{
    blockNumber: number;
    timestamp: number;
    source: 'snapshot';
    fetchedAt: number;
    publisherVerified?: boolean;
  }> {
    return {
      blockNumber: this.snapshot.blockNumber,
      timestamp: this.snapshot.timestamp,
      source: 'snapshot',
      fetchedAt: Date.now(),
      publisherVerified: this.isPublisherVerified,
    };
  }
}
