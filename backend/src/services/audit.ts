import { getDb } from '../db/index.js';
import { chainService } from './chain.js';

export interface AuditQueryParams {
  type?: string;
  institutionId?: string;
  limit?: number;
  cursor?: string;
}

export class AuditService {
  public getEvents(params: AuditQueryParams): { events: any[]; nextCursor?: string } {
    const db = getDb();
    const limit = Math.min(params.limit || 50, 200);

    let query = 'SELECT * FROM audit_events WHERE 1=1';
    const sqlParams: any[] = [];

    if (params.type) {
      query += ' AND event_type = ?';
      sqlParams.push(params.type);
    }

    if (params.institutionId) {
      query += ' AND institution_id = ?';
      sqlParams.push(params.institutionId);
    }

    if (params.cursor) {
      const cursorId = Number(params.cursor);
      if (!isNaN(cursorId)) {
        query += ' AND id < ?';
        sqlParams.push(cursorId);
      }
    }

    query += ' ORDER BY id DESC LIMIT ?';
    sqlParams.push(limit + 1);

    const rows = db.prepare(query).all(...sqlParams) as any[];
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    const events = pageRows.map((r) => ({
      type: r.event_type,
      block: r.block_number,
      timestamp: r.block_timestamp,
      txHash: r.tx_hash,
      logIndex: r.log_index,
      actor: r.actor,
      institutionId: r.institution_id,
      args: JSON.parse(r.args_json),
    }));

    const nextCursor = hasNext ? String(pageRows[pageRows.length - 1].id) : undefined;

    return { events, nextCursor };
  }

  public async verifyTx(txHash: string): Promise<{ matches: boolean; onChain: any; indexed: any }> {
    const db = getDb();
    const indexedRows = db.prepare('SELECT * FROM audit_events WHERE tx_hash = ?').all(txHash) as any[];

    // Fetch on-chain receipt and logs
    let receipt: any = null;
    try {
      receipt = await chainService.provider.getTransactionReceipt(txHash);
    } catch {
      // Chain offline or unreachable
    }
    if (!receipt) {
      return {
        matches: false,
        onChain: null,
        indexed: indexedRows.map((r) => ({
          type: r.event_type,
          logIndex: r.log_index,
          args: JSON.parse(r.args_json),
        })),
      };
    }

    const onChainLogs: any[] = [];
    for (const log of receipt.logs) {
      try {
        const parsed = chainService.registryInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed) {
          const argsObj: Record<string, any> = {};
          for (const [k, v] of Object.entries(parsed.args.toObject ? parsed.args.toObject() : parsed.args)) {
            if (isNaN(Number(k))) {
              argsObj[k] = typeof v === 'bigint' ? v.toString() : v;
            }
          }
          onChainLogs.push({
            type: parsed.name,
            logIndex: log.index,
            args: argsObj,
          });
        }
      } catch {
        // Log from another contract or unparseable
      }
    }

    const indexedFormatted = indexedRows.map((r) => ({
      type: r.event_type,
      logIndex: r.log_index,
      args: JSON.parse(r.args_json),
    }));

    const matches =
      onChainLogs.length === indexedFormatted.length &&
      onChainLogs.every((ol, i) => ol.type === indexedFormatted[i]?.type && ol.logIndex === indexedFormatted[i]?.logIndex);

    return {
      matches,
      onChain: {
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'reverted',
        events: onChainLogs,
      },
      indexed: {
        count: indexedFormatted.length,
        events: indexedFormatted,
      },
    };
  }
}

export const auditService = new AuditService();
