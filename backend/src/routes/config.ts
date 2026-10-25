import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import type { ConfigResponse } from '../../../shared/api.js';

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ConfigResponse }>('/api/config', async () => {
    const institutions = [
      {
        name: 'IIT Bombay',
        did: 'did:trustmesh:iit-bombay',
        id: '0x323533967341ea22aa0db8e348f57270d1a49df3b6807804ee93a40871d31980',
        type: 'university' as const,
      },
      {
        name: 'NIT Trichy',
        did: 'did:trustmesh:nit-trichy',
        id: '0x9d724940562e811c750ba516da10c85c010a3003058862efdaea394fa521f37e',
        type: 'university' as const,
      },
      {
        name: 'BITS Pilani',
        did: 'did:trustmesh:bits-pilani',
        id: '0x7dcbc7c7fe40ec9e7a2b9e69c10f8a846a89c92e92c68efb8b20d39e24749f7e',
        type: 'university' as const,
      },
      {
        name: 'VIT Vellore',
        did: 'did:trustmesh:vit-vellore',
        id: '0x5e56e077a5b3a886f4a7c0f1659938eb52b7ba5fbf8ef68a5c68f237f374784e',
        type: 'university' as const,
      },
      {
        name: 'Acme Corp',
        did: 'did:trustmesh:acme-corp',
        id: '0xcfa0753a3eb1ad88fe928b9487c5eb87157a9f939e60ea9b49b99684cb84e727',
        type: 'employer' as const,
      },
    ];

    return {
      mode: config.mode,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      registry: config.registryAddress,
      snapshotPublisher: config.snapshotPublisherAddress,
      explorerBaseUrl: config.explorerBaseUrl,
      institutions,
      accreditorCount: 3 as const,
    };
  });
}
