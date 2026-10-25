import { ethers } from 'ethers';
import { config } from '../config.js';
import { chainService } from './chain.js';
import { keystore } from './keystore.js';
import { getDb } from '../db/index.js';
import type { Snapshot } from '../../../shared/types.js';

export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalize(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(obj[key])).join(',') + '}';
}

export class SnapshotService {
  private timer: NodeJS.Timeout | null = null;
  private latestSnapshot: Snapshot | null = null;

  public async buildSnapshot(): Promise<Snapshot> {
    const publisherWallet = await keystore.getOrCreateWallet('service', 'snapshot-publisher');
    let blockNumber = 0;
    let timestamp = Math.floor(Date.now() / 1000);
    try {
      blockNumber = await chainService.getLatestBlockNumber();
      const block = await chainService.provider.getBlock(blockNumber);
      if (block) timestamp = Number(block.timestamp);
    } catch {
      // Chain offline
    }

    const db = getDb();

    // Query indexed events to build snapshot components
    const anchorRows = db
      .prepare(
        `SELECT block_number, tx_hash, block_timestamp, args_json FROM audit_events WHERE event_type = 'CredentialAnchored'`
      )
      .all() as any[];

    const anchors = anchorRows.map((r) => {
      const args = JSON.parse(r.args_json);
      return {
        credentialId: args.credentialId,
        institutionId: args.institutionId,
        keyAddr: args.key,
        merkleRoot: args.merkleRoot,
        timestamp: r.block_timestamp,
        blockNumber: r.block_number,
        txHash: r.tx_hash,
      };
    });

    const batchRows = db
      .prepare(`SELECT block_number, tx_hash, block_timestamp, args_json FROM audit_events WHERE event_type = 'BatchAnchored'`)
      .all() as any[];

    const batches = batchRows.map((r) => {
      const args = JSON.parse(r.args_json);
      return {
        batchId: args.batchId,
        institutionId: args.institutionId,
        keyAddr: args.key,
        batchRoot: args.batchRoot,
        count: Number(args.count),
        timestamp: r.block_timestamp,
        blockNumber: r.block_number,
        txHash: r.tx_hash,
      };
    });

    const statusRows = db
      .prepare(
        `SELECT tx_hash, block_timestamp, args_json FROM audit_events WHERE event_type = 'CredentialStatusChanged'`
      )
      .all() as any[];

    const statuses = statusRows.map((r) => {
      const args = JSON.parse(r.args_json);
      return {
        credentialId: args.credentialId,
        state: Number(args.state),
        reasonCode: Number(args.reasonCode || 0),
        timestamp: r.block_timestamp,
        txHash: r.tx_hash,
      };
    });

    // Query on-chain institutions and keys
    const institutions: any[] = [];
    const keys: any[] = [];

    if (config.registryAddress !== ethers.ZeroAddress) {
      try {
        const count = Number(await chainService.registry.institutionCount());
        for (let i = 0; i < count; i++) {
          const id = await chainService.registry.institutionIdAt(i);
          const instData = await chainService.registry.getInstitution(id);
          institutions.push({
            id,
            did: instData.did,
            admin: instData.admin,
            status: Number(instData.status),
          });

          const keyCount = Number(await chainService.registry.keyCount(id));
          for (let k = 0; k < keyCount; k++) {
            const keyAddr = await chainService.registry.keyAt(id, k);
            const keyInfo = await chainService.registry.getKey(keyAddr);
            keys.push({
              addr: keyAddr,
              institutionId: id,
              status: Number(keyInfo.status),
              validFrom: Number(keyInfo.validFrom),
              compromisedAt: Number(keyInfo.compromisedAt),
            });
          }
        }
      } catch (err) {
        console.warn('[Snapshot] Warning querying on-chain registry state:', err);
      }
    }

    const bodyWithoutSignature = {
      version: 1 as const,
      chainId: config.chainId,
      registry: config.registryAddress,
      blockNumber,
      timestamp,
      institutions,
      keys,
      anchors,
      batches,
      statuses,
      publisher: publisherWallet.address,
    };

    const canon = canonicalize(bodyWithoutSignature);
    const digest = ethers.keccak256(ethers.toUtf8Bytes(canon));
    const signature = await publisherWallet.signMessage(ethers.getBytes(digest));

    const fullSnapshot: Snapshot = {
      ...bodyWithoutSignature,
      signature,
    };

    this.latestSnapshot = fullSnapshot;
    return fullSnapshot;
  }

  public async getLatestSnapshot(): Promise<Snapshot> {
    if (this.latestSnapshot) return this.latestSnapshot;
    return this.buildSnapshot();
  }

  public async publishSnapshotOnChain(): Promise<{ txHash: string; snapshotHash: string }> {
    const snap = await this.buildSnapshot();
    const canon = canonicalize({ ...snap, signature: undefined });
    const snapHash = ethers.keccak256(ethers.toUtf8Bytes(canon));

    const publisherWallet = await keystore.getOrCreateWallet('service', 'snapshot-publisher', chainService.provider);
    const registryWithSigner = chainService.getContractWithSigner(publisherWallet);

    const tx = await registryWithSigner.publishSnapshot(snapHash, snap.blockNumber);
    const receipt = await tx.wait(1);

    return {
      txHash: receipt.hash,
      snapshotHash: snapHash,
    };
  }

  public startPeriodicPublisher(): void {
    if (this.timer) return;
    const intervalMs = config.snapshotIntervalSec * 1000;
    console.log(`[Snapshot] Starting periodic snapshot publisher (every ${config.snapshotIntervalSec}s)...`);
    this.timer = setInterval(async () => {
      try {
        await this.publishSnapshotOnChain();
      } catch (err: any) {
        console.warn('[Snapshot] Periodic publish attempt error:', err?.message || err);
      }
    }, intervalMs);
  }

  public stopPeriodicPublisher(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const snapshotService = new SnapshotService();
