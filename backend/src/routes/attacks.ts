import { FastifyInstance } from 'fastify';
import { attackService } from '../services/attacks.js';

export async function attacksRoutes(fastify: FastifyInstance) {
  // GET /api/attacks
  fastify.get('/api/attacks', async () => {
    const attacks = attackService.listAttacks();
    return { attacks };
  });

  // POST /api/attacks/:id/run
  fastify.post<{ Params: { id: string } }>('/api/attacks/:id/run', async (req) => {
    const { id } = req.params;
    return attackService.runAttack(id);
  });

  // POST /api/attacks/run-all
  fastify.post('/api/attacks/run-all', async () => {
    return attackService.runAll();
  });
}
