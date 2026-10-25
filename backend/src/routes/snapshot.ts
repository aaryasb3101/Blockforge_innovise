import { FastifyInstance } from 'fastify';
import { snapshotService } from '../services/snapshot.js';

export async function snapshotRoutes(fastify: FastifyInstance) {
  // GET /api/snapshot
  fastify.get('/api/snapshot', async () => {
    return snapshotService.getLatestSnapshot();
  });

  // POST /api/snapshot/publish
  fastify.post('/api/snapshot/publish', async () => {
    return snapshotService.publishSnapshotOnChain();
  });
}
