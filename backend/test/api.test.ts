import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { closeDb } from '../src/db/index.js';

describe('Backend REST API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  describe('GET /api/health', () => {
    it('returns ok, chainId, block, and indexer lag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.ok).toBe(true);
      expect(typeof json.chainId).toBe('number');
      expect(typeof json.block).toBe('number');
      expect(typeof json.indexerLagBlocks).toBe('number');
    });
  });

  describe('GET /api/config', () => {
    it('returns network configuration, registry address, and institutions list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/config',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.mode).toBeDefined();
      expect(json.chainId).toBeDefined();
      expect(json.accreditorCount).toBe(3);
      expect(Array.isArray(json.institutions)).toBe(true);
      expect(json.institutions.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('GET /api/institutions & /api/institutions/:id', () => {
    it('returns institutions list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/institutions',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.institutions)).toBe(true);
    });

    it('returns 404 for unknown institution id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/institutions/0x1111111111111111111111111111111111111111111111111111111111111111',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });

    it('returns validation error on invalid register payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/institutions/register',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/credentials', () => {
    it('returns credentials list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/credentials',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.credentials)).toBe(true);
    });
  });

  describe('POST /api/verify', () => {
    it('rejects invalid or empty verification payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('processes verification request and returns structured verdict and rules', async () => {
      const dummyCred = {
        id: '0x' + '1'.repeat(64),
        schema: 'degree-schema-v1',
        issuerDid: 'did:trustmesh:iit-bombay',
        issuerKey: '0x' + '2'.repeat(40),
        holderDid: 'did:pkh:eip155:31337:0x' + '3'.repeat(40),
        issuanceDate: 1700000000,
        expirationDate: 0,
        fields: { cgpa: '9.5', degree: 'Computer Science' },
        salts: { cgpa: '0x' + '4'.repeat(64), degree: '0x' + '5'.repeat(64) },
        leaves: { cgpa: '0x' + '6'.repeat(64), degree: '0x' + '7'.repeat(64) },
        merkleRoot: '0x' + '8'.repeat(64),
        signature: '0x' + '9'.repeat(130),
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/verify',
        payload: { input: dummyCred },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.verdict).toBeDefined();
      expect(typeof json.trustScore).toBe('number');
      expect(Array.isArray(json.rules)).toBe(true);
      expect(json.receipt).toBeDefined();
    });
  });

  describe('Demo Endpoints', () => {
    it('GET /api/demo/samples returns demo samples structure', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/demo/samples',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.valid).toBeDefined();
    });

    it('GET /api/demo/holders returns demo wallets with private keys in demo mode', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/demo/holders',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.holders)).toBe(true);
      expect(json.holders.length).toBeGreaterThanOrEqual(1);
      expect(json.holders[0].privateKey).toBeDefined();
      expect(json.holders[0].did).toContain('did:pkh:');
    });
  });

  describe('Audit Endpoints', () => {
    it('GET /api/audit/events returns indexed events and supports query parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/audit/events?limit=10',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.events)).toBe(true);
    });

    it('GET /api/audit/verify/:txHash checks transaction consistency', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/audit/verify/0x0000000000000000000000000000000000000000000000000000000000000000',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.matches).toBe(false);
    });
  });

  describe('Incident Response Endpoints', () => {
    it('POST /api/incident/analyze calculates blast radius', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/incident/analyze',
        payload: {
          keyAddress: '0x' + '2'.repeat(40),
          compromisedAt: 1700000000,
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.safe)).toBe(true);
      expect(Array.isArray(json.suspicious)).toBe(true);
      expect(Array.isArray(json.recommendedActions)).toBe(true);
    });
  });

  describe('Snapshot Endpoints', () => {
    it('GET /api/snapshot returns signed snapshot structure', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/snapshot',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.version).toBe(1);
      expect(json.chainId).toBeDefined();
      expect(json.publisher).toBeDefined();
      expect(json.signature).toBeDefined();
    });
  });

  describe('Attacks Simulation Endpoints', () => {
    it('GET /api/attacks lists all supported attack scenarios', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/attacks',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.attacks)).toBe(true);
      expect(json.attacks.length).toBeGreaterThanOrEqual(14);
    });

    it('POST /api/attacks/:id/run executes attack scenario and returns blocked outcome', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/attacks/tamper-field/run',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.blocked).toBe(true);
      expect(json.caughtBy).toBeDefined();
    });

    it('POST /api/attacks/run-all executes the entire attack suite', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/attacks/run-all',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.total).toBeGreaterThanOrEqual(14);
      expect(json.blocked).toBe(json.total);
      expect(Array.isArray(json.outcomes)).toBe(true);
    });
  });

  describe('Trust Graph & Stats Endpoints', () => {
    it('GET /api/trust-graph returns nodes and edges', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/trust-graph',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.nodes)).toBe(true);
      expect(Array.isArray(json.edges)).toBe(true);
      expect(json.nodes.some((n: any) => n.kind === 'registry')).toBe(true);
    });

    it('GET /api/stats returns system statistics counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/stats',
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(typeof json.institutionsCount).toBe('number');
      expect(typeof json.credentialsCount).toBe('number');
      expect(typeof json.auditEventsCount).toBe('number');
    });
  });

  describe('OpenAPI Swagger Documentation', () => {
    it('GET /docs returns Swagger redirect or UI and /docs/json returns OpenAPI spec', async () => {
      const resDocs = await app.inject({
        method: 'GET',
        url: '/docs',
      });
      expect([200, 302]).toContain(resDocs.statusCode);

      const resJson = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });
      expect(resJson.statusCode).toBe(200);
      expect(resJson.json().swagger || resJson.json().openapi).toBeDefined();
    });
  });
});
