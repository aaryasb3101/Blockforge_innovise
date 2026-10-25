import { FastifyInstance } from 'fastify';
import { issuerService } from '../services/issuer.js';
import { getDb } from '../db/index.js';
import {
  issueCredentialRequestSchema,
  issueBatchRequestSchema,
  revokeCredentialRequestSchema,
  actingInstitutionRequestSchema,
  type CredentialMetadata,
} from '../../../shared/api.js';

export async function credentialsRoutes(fastify: FastifyInstance) {
  // POST /api/issue
  fastify.post('/api/issue', async (req) => {
    const parsed = issueCredentialRequestSchema.parse(req.body);
    const result = await issuerService.issueCredential(parsed);
    return result;
  });

  // POST /api/issue/batch
  fastify.post('/api/issue/batch', async (req) => {
    const parsed = issueBatchRequestSchema.parse(req.body);
    const result = await issuerService.issueBatch(parsed);
    return result;
  });

  // POST /api/revoke
  fastify.post('/api/revoke', async (req) => {
    const parsed = revokeCredentialRequestSchema.parse(req.body);
    const result = await issuerService.revokeCredential(
      parsed.credentialId,
      parsed.reasonCode,
      parsed.actingInstitutionId
    );
    return result;
  });

  // POST /api/credentials/:id/suspend
  fastify.post<{ Params: { id: string } }>('/api/credentials/:id/suspend', async (req) => {
    const { id } = req.params;
    const body = req.body ? actingInstitutionRequestSchema.parse(req.body) : {};
    const result = await issuerService.suspendCredential(id, body.actingInstitutionId);
    return result;
  });

  // POST /api/credentials/:id/reinstate
  fastify.post<{ Params: { id: string } }>('/api/credentials/:id/reinstate', async (req) => {
    const { id } = req.params;
    const body = req.body ? actingInstitutionRequestSchema.parse(req.body) : {};
    const result = await issuerService.reinstateCredential(id, body.actingInstitutionId);
    return result;
  });

  // GET /api/credentials?issuerId=&holderDid=
  fastify.get<{ Querystring: { issuerId?: string; holderDid?: string } }>('/api/credentials', async (req) => {
    const { issuerId, holderDid } = req.query;
    const db = getDb();

    let sql = 'SELECT * FROM credentials_metadata WHERE 1=1';
    const params: any[] = [];

    if (issuerId) {
      sql += ' AND institution_id = ?';
      params.push(issuerId);
    }
    if (holderDid) {
      sql += ' AND holder_did = ?';
      params.push(holderDid);
    }

    sql += ' ORDER BY anchored_at DESC LIMIT 100';
    const rows = db.prepare(sql).all(...params) as any[];

    const credentials: CredentialMetadata[] = rows.map((r) => ({
      credentialId: r.credential_id,
      institutionId: r.institution_id,
      issuerDid: r.issuer_did,
      holderDid: r.holder_did,
      schema: r.schema,
      issuanceDate: r.issuance_date,
      expirationDate: r.expiration_date,
      merkleRoot: r.merkle_root,
      state: r.state,
      reasonCode: r.reason_code || undefined,
      batchId: r.batch_id || undefined,
      anchoredAt: r.anchored_at,
      txHash: r.tx_hash,
    }));

    return { credentials };
  });
}
