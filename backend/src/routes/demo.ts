import { FastifyInstance } from 'fastify';
import { keystore } from '../services/keystore.js';
import { config } from '../config.js';
import type { DemoHoldersResponse } from '../../../shared/api.js';

let cachedSamples: any = null;

export function setCachedDemoSamples(samples: any) {
  cachedSamples = samples;
}

export async function demoRoutes(fastify: FastifyInstance) {
  // GET /api/demo/holders
  fastify.get<{ Reply: DemoHoldersResponse }>('/api/demo/holders', async (req, reply) => {
    if (!config.demoMode) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Demo holders endpoint is disabled when DEMO_MODE is false' },
      });
    }

    const holders = await keystore.listDemoHolders();
    return { holders };
  });

  // GET /api/demo/samples
  fastify.get('/api/demo/samples', async () => {
    if (cachedSamples) {
      return cachedSamples;
    }

    // Return dummy structure if not seeded yet
    return {
      valid: { id: '0x01', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      tampered: { id: '0x02', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      rogue: { id: '0x03', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      revoked: { id: '0x04', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      expired: { id: '0x05', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      suspended: { id: '0x06', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      compromisedBefore: { id: '0x07', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      compromisedAfter: { id: '0x08', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
      batch: { id: '0x09', schema: 'degree', holderDid: 'did:pkh:eip155:31337:demo' },
    };
  });
}
