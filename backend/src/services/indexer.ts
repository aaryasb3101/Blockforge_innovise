import { ethers } from 'ethers';
import { getDb } from '../db/index.js';
import { chainService } from './chain.js';
import { config } from '../config.js';

export class IndexerService {
  private isRunning: boolean = false;
  private pollIntervalMs: number = 3000;
  private timeoutId: NodeJS.Timeout | null = null;
  private lastProcessedBlock: number = 0;
  private cursorId: string = 'main_cursor';

  constructor() {
    this.initCursor();
  }

  private initCursor(): void {
    const db = getDb();
    const row = db.prepare('SELECT last_processed_block FROM indexer_cursor WHERE id = ?').get(this.cursorId) as
      | { last_processed_block: number }
      | undefined;

    if (row) {
      this.lastProcessedBlock = row.last_processed_block;
    } else {
      this.lastProcessedBlock = 0;
      db.prepare('INSERT INTO indexer_cursor (id, last_processed_block, updated_at) VALUES (?, ?, ?)').run(
        this.cursorId,
        0,
        Date.now()
      );
    }
  }

  public getLagBlocks(latestBlock: number): number {
    return Math.max(0, latestBlock - this.lastProcessedBlock);
  }

  public getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Indexer] Starting indexer from block ${this.lastProcessedBlock}...`);
    this.pollLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log('[Indexer] Stopped.');
  }

  private async pollLoop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processNextBatch();
    } catch (err: any) {
      console.warn('[Indexer] Poll error:', err?.message || err);
    }

    if (this.isRunning) {
      this.timeoutId = setTimeout(() => this.pollLoop(), this.pollIntervalMs);
    }
  }

  public async processNextBatch(): Promise<void> {
    if (config.registryAddress === ethers.ZeroAddress) {
      return;
    }

    const currentBlock = await chainService.getLatestBlockNumber();
    const safeBlock = Math.max(0, currentBlock - (config.confirmations - 1));

    if (safeBlock <= this.lastProcessedBlock) {
      return;
    }

    const fromBlock = this.lastProcessedBlock === 0 ? 0 : this.lastProcessedBlock + 1;
    const toBlock = Math.min(fromBlock + 1000, safeBlock);

    await this.indexBlockRange(fromBlock, toBlock);

    this.lastProcessedBlock = toBlock;
    const db = getDb();
    db.prepare('UPDATE indexer_cursor SET last_processed_block = ?, updated_at = ? WHERE id = ?').run(
      toBlock,
      Date.now(),
      this.cursorId
    );
  }

  public async indexBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const filter = {
      address: config.registryAddress,
      fromBlock,
      toBlock,
    };

    const logs = await chainService.provider.getLogs(filter);
    if (logs.length === 0) return;

    const db = getDb();
    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO audit_events 
      (event_type, block_number, block_timestamp, tx_hash, log_index, actor, institution_id, args_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertCredential = db.prepare(`
      INSERT INTO credentials_metadata 
      (credential_id, institution_id, issuer_did, holder_did, schema, issuance_date, expiration_date, merkle_root, state, reason_code, batch_id, anchored_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(credential_id) DO UPDATE SET
        state = excluded.state,
        reason_code = excluded.reason_code
    `);

    const updateCredStatus = db.prepare(`
      UPDATE credentials_metadata
      SET state = ?, reason_code = ?
      WHERE credential_id = ?
    `);

    // Cache block timestamps
    const blockTimestamps = new Map<number, number>();

    for (const log of logs) {
      let blockTime = blockTimestamps.get(log.blockNumber);
      if (!blockTime) {
        const blk = await chainService.provider.getBlock(log.blockNumber);
        blockTime = blk ? Number(blk.timestamp) : Math.floor(Date.now() / 1000);
        blockTimestamps.set(log.blockNumber, blockTime);
      }

      try {
        const parsed = chainService.registryInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (!parsed) continue;

        const eventType = parsed.name;
        const argsObj: Record<string, any> = {};
        for (const [key, val] of Object.entries(parsed.args.toObject ? parsed.args.toObject() : parsed.args)) {
          if (isNaN(Number(key))) {
            argsObj[key] = typeof val === 'bigint' ? val.toString() : val;
          }
        }

        // Determine institution ID & actor
        let instId: string | null = (argsObj.id || argsObj.institutionId || null) as string | null;
        let actor: string = (argsObj.key || argsObj.admin || argsObj.approver || argsObj.by || argsObj.publisher || ethers.ZeroAddress) as string;

        insertEvent.run(
          eventType,
          log.blockNumber,
          blockTime,
          log.transactionHash,
          log.index,
          actor,
          instId,
          JSON.stringify(argsObj)
        );

        // Normalize credential state changes
        if (eventType === 'CredentialAnchored') {
          const credId = argsObj.credentialId;
          const root = argsObj.merkleRoot;
          upsertCredential.run(
            credId,
            instId || ethers.ZeroHash,
            '', // issuer_did (resolved if cached)
            '', // holder_did
            argsObj.schemaHash || '',
            blockTime,
            0,
            root,
            0, // Good
            0,
            null,
            blockTime,
            log.transactionHash
          );
        } else if (eventType === 'CredentialStatusChanged') {
          const credId = argsObj.credentialId;
          const state = Number(argsObj.state);
          const reasonCode = Number(argsObj.reasonCode || 0);
          updateCredStatus.run(state, reasonCode, credId);
        }
      } catch (err) {
        // Not a registry event or unparseable
      }
    }
  }
}

export const indexer = new IndexerService();
