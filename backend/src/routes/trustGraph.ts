import { FastifyInstance } from 'fastify';
import { chainService } from '../services/chain.js';
import { config } from '../config.js';
import type { TrustGraphNode, TrustGraphEdge } from '../../../shared/api.js';

export async function trustGraphRoutes(fastify: FastifyInstance) {
  fastify.get('/api/trust-graph', async () => {
    const nodes: TrustGraphNode[] = [
      {
        id: 'registry',
        label: `TrustRegistry (${config.registryAddress.slice(0, 6)}...${config.registryAddress.slice(-4)})`,
        kind: 'registry',
        status: 'active',
      },
    ];
    const edges: TrustGraphEdge[] = [];

    // Accreditors
    for (let i = 0; i < 3; i++) {
      const accId = `accreditor-${i + 1}`;
      nodes.push({
        id: accId,
        label: `Accreditor ${i + 1}`,
        kind: 'accreditor',
        status: 'active',
      });
      edges.push({
        from: accId,
        to: 'registry',
      });
    }

    // Publisher
    if (config.snapshotPublisherAddress) {
      nodes.push({
        id: 'publisher',
        label: 'Snapshot Publisher',
        kind: 'publisher',
        status: 'active',
      });
      edges.push({
        from: 'publisher',
        to: 'registry',
      });
    }

    // Query on-chain institutions and keys
    try {
      const count = Number(await chainService.registry.institutionCount());
      for (let i = 0; i < count; i++) {
        const id = await chainService.registry.institutionIdAt(i);
        const inst = await chainService.registry.getInstitution(id);

        const statusNames = ['pending', 'active', 'suspended', 'revoked'];
        const instStatus = statusNames[Number(inst.status)] || 'unknown';

        const label = inst.did.replace('did:trustmesh:', '').toUpperCase();
        nodes.push({
          id,
          label,
          kind: 'institution',
          status: instStatus,
        });

        edges.push({
          from: id,
          to: 'registry',
        });

        const keyCount = Number(await chainService.registry.keyCount(id));
        for (let k = 0; k < keyCount; k++) {
          const keyAddr = await chainService.registry.keyAt(id, k);
          const keyInfo = await chainService.registry.getKey(keyAddr);
          const keyStatusNames = ['none', 'active', 'suspended', 'revoked', 'retired'];
          const kStatus = keyStatusNames[Number(keyInfo.status)] || 'unknown';

          nodes.push({
            id: keyAddr,
            label: `Key (${keyAddr.slice(0, 6)}...${keyAddr.slice(-4)})`,
            kind: 'key',
            status: kStatus,
          });

          edges.push({
            from: keyAddr,
            to: id,
          });
        }
      }
    } catch (err) {
      console.warn('Error building trust graph:', err);
    }

    return { nodes, edges };
  });
}
