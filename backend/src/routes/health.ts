import { FastifyInstance } from 'fastify';
import { chainService } from '../services/chain.js';
import { indexer } from '../services/indexer.js';
import { config } from '../config.js';
import type { HealthResponse } from '../../../shared/api.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/api/health', async () => {
    let blockNumber = 0;
    try {
      blockNumber = await chainService.getLatestBlockNumber();
    } catch {
      // chain might be unreachable
    }

    const lag = indexer.getLagBlocks(blockNumber);

    return {
      ok: true,
      chainId: config.chainId,
      block: blockNumber,
      indexerLagBlocks: lag,
    };
  });
}
