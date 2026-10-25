import { FastifyInstance } from 'fastify';
import { incidentService } from '../services/incident.js';
import {
  incidentAnalyzeRequestSchema,
  suspendKeyRequestSchema,
  revokeKeyRequestSchema,
  rotateKeyRequestSchema,
  setGuardiansRequestSchema,
  proposeRecoveryRequestSchema,
  approveRecoveryRequestSchema,
  executeRecoveryRequestSchema,
} from '../../../shared/api.js';

export async function incidentRoutes(fastify: FastifyInstance) {
  // POST /api/incident/analyze
  fastify.post('/api/incident/analyze', async (req) => {
    const parsed = incidentAnalyzeRequestSchema.parse(req.body);
    return incidentService.analyzeBlastRadius(parsed.keyAddress, parsed.compromisedAt);
  });

  // POST /api/incident/suspend-key
  fastify.post('/api/incident/suspend-key', async (req) => {
    const parsed = suspendKeyRequestSchema.parse(req.body);
    const txHash = await incidentService.suspendKey(parsed.keyAddress);
    return { txHash };
  });

  // POST /api/incident/revoke-key
  fastify.post('/api/incident/revoke-key', async (req) => {
    const parsed = revokeKeyRequestSchema.parse(req.body);
    const txHash = await incidentService.revokeKey(parsed.keyAddress, parsed.compromisedAt);
    return { txHash };
  });

  // POST /api/incident/rotate-key
  fastify.post('/api/incident/rotate-key', async (req) => {
    const parsed = rotateKeyRequestSchema.parse(req.body);
    return incidentService.rotateKey(parsed.oldKey);
  });

  // POST /api/incident/guardians
  fastify.post('/api/incident/guardians', async (req) => {
    const parsed = setGuardiansRequestSchema.parse(req.body);
    return incidentService.setDemoGuardians(parsed.institutionId);
  });

  // POST /api/incident/recovery/propose
  fastify.post('/api/incident/recovery/propose', async (req) => {
    const parsed = proposeRecoveryRequestSchema.parse(req.body);
    return incidentService.proposeRecovery(parsed.institutionId);
  });

  // POST /api/incident/recovery/approve
  fastify.post('/api/incident/recovery/approve', async (req) => {
    const parsed = approveRecoveryRequestSchema.parse(req.body);
    return incidentService.approveRecovery(parsed.proposalId, parsed.guardianIndex);
  });

  // POST /api/incident/recovery/execute
  fastify.post('/api/incident/recovery/execute', async (req) => {
    const parsed = executeRecoveryRequestSchema.parse(req.body);
    const txHash = await incidentService.executeRecovery(parsed.proposalId);
    return { txHash };
  });
}
