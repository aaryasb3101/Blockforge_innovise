import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { realConsensusEngine, NodeStatus } from '../services/consensusService.js';

export async function consensusRoutes(fastify: FastifyInstance) {
  // 1. Get Live Network Status, Validator Topology & Metrics
  fastify.get('/api/consensus/status', async (_request, reply) => {
    const status = realConsensusEngine.getNetworkStatus();
    return reply.send(status);
  });

  // 2. Submit a Synthetic Transaction
  fastify.post('/api/consensus/tx', async (request, reply) => {
    const schema = z.object({
      from: z.string().default('0xAlice'),
      to: z.string().default('0xBob'),
      amount: z.number().positive().default(10),
      payload: z.string().default('Synthetic Payment'),
    });

    const parsed = schema.parse(request.body || {});
    const tx = realConsensusEngine.submitTransaction(parsed.from, parsed.to, parsed.amount, parsed.payload);
    return reply.status(201).send({ ok: true, tx });
  });

  // 3. Submit a Batch of Synthetic Transactions
  fastify.post('/api/consensus/tx/batch', async (request, reply) => {
    const schema = z.object({
      count: z.number().min(1).max(100).default(10),
    });

    const parsed = schema.parse(request.body || {});
    const txs = realConsensusEngine.submitBatchTransactions(parsed.count);
    return reply.status(201).send({ ok: true, count: txs.length, txs });
  });

  // 4. Manually Step 1 Consensus Round
  fastify.post('/api/consensus/step', async (_request, reply) => {
    const success = await realConsensusEngine.executeConsensusRound();
    const status = realConsensusEngine.getNetworkStatus();
    return reply.send({ ok: success, status });
  });

  // 5. Update Validator Node Status (Crash, Recover, Byzantine)
  fastify.post('/api/consensus/node/:id/status', async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
    });
    const bodySchema = z.object({
      status: z.enum(['active', 'crashed', 'delayed', 'byzantine']),
    });

    const { id } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);

    const updatedNode = realConsensusEngine.setNodeStatus(id, status as NodeStatus);
    return reply.send({ ok: true, node: { id: updatedNode.id, status: updatedNode.status, height: updatedNode.height } });
  });

  // 6. Update Network Disruption Parameters (Latency & Loss)
  fastify.post('/api/consensus/disruptions', async (request, reply) => {
    const schema = z.object({
      latencyMs: z.number().min(0).max(2000),
      packetLossPercent: z.number().min(0).max(100),
    });

    const { latencyMs, packetLossPercent } = schema.parse(request.body);
    realConsensusEngine.setDisruptions(latencyMs, packetLossPercent);
    return reply.send({ ok: true, disruptions: { latencyMs, packetLossPercent } });
  });

  // 7. Apply Disruption Preset Scenario
  fastify.post('/api/consensus/preset', async (request, reply) => {
    const schema = z.object({
      preset: z.enum(['normal', 'single-crash', 'high-lag', 'quorum-loss', 'byzantine']),
    });

    const { preset } = schema.parse(request.body);
    realConsensusEngine.applyPresetScenario(preset);
    return reply.send({ ok: true, preset });
  });

  // 8. Sync Lagged or Divergent Node with Peers
  fastify.post('/api/consensus/node/:id/sync', async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    realConsensusEngine.syncNodeWithPeers(id);
    return reply.send({ ok: true, message: `Node ${id} synchronized with peers` });
  });

  // 9. Consistency Verification (Cross-Validator Local Ledger Audit)
  fastify.get('/api/consensus/verify-consistency', async (_request, reply) => {
    const audit = realConsensusEngine.verifyLedgerConsistency();
    return reply.send(audit);
  });

  // 10. Performance Metrics & Benchmark Comparison
  fastify.get('/api/consensus/metrics', async (_request, reply) => {
    const metrics = realConsensusEngine.getPerformanceMetrics();
    return reply.send(metrics);
  });

  // 11. Retrieve Full Local Ledger of a Specific Validator
  fastify.get('/api/consensus/ledger/:id', async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    const ledger = realConsensusEngine.getValidatorLedger(id);
    return reply.send(ledger);
  });

  // 12. Toggle Auto-running consensus engine
  fastify.post('/api/consensus/toggle-autorun', async (request, reply) => {
    const schema = z.object({
      enable: z.boolean().optional(),
    });

    const body = schema.parse(request.body || {});
    const isRunning = realConsensusEngine.toggleAutoRun(body.enable);
    return reply.send({ ok: true, isRunning });
  });

  // 13. Update Block Interval
  fastify.post('/api/consensus/interval', async (request, reply) => {
    const schema = z.object({
      intervalMs: z.number().min(500).max(10000),
    });

    const { intervalMs } = schema.parse(request.body);
    realConsensusEngine.setBlockInterval(intervalMs);
    return reply.send({ ok: true, intervalMs });
  });
}
