import { FastifyInstance } from 'fastify';
import { auditService } from '../services/audit.js';

export async function auditRoutes(fastify: FastifyInstance) {
  // GET /api/audit/events
  fastify.get<{ Querystring: { type?: string; institutionId?: string; limit?: number; cursor?: string } }>(
    '/api/audit/events',
    async (req) => {
      const { type, institutionId, limit, cursor } = req.query;
      return auditService.getEvents({ type, institutionId, limit: limit ? Number(limit) : undefined, cursor });
    }
  );

  // GET /api/audit/verify/:txHash
  fastify.get<{ Params: { txHash: string } }>('/api/audit/verify/:txHash', async (req) => {
    const { txHash } = req.params;
    return auditService.verifyTx(txHash);
  });
}
