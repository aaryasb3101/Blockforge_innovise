import { FastifyInstance } from 'fastify';
import { ethers } from 'ethers';
import { chainService } from '../services/chain.js';
import { keystore } from '../services/keystore.js';
import { config } from '../config.js';
import {
  registerInstitutionRequestSchema,
  approveInstitutionRequestSchema,
  institutionStatusRequestSchema,
  type InstitutionDetail,
} from '../../../shared/api.js';

export async function institutionsRoutes(fastify: FastifyInstance) {
  // GET /api/institutions
  fastify.get('/api/institutions', async () => {
    const institutions: InstitutionDetail[] = [];
    if (config.registryAddress === ethers.ZeroAddress) {
      return { institutions: [] };
    }

    try {
      const count = Number(await chainService.registry.institutionCount());
      for (let i = 0; i < count; i++) {
        const id = await chainService.registry.institutionIdAt(i);
        const inst = await chainService.registry.getInstitution(id);
        const keyCount = Number(await chainService.registry.keyCount(id));
        const keys: any[] = [];
        for (let k = 0; k < keyCount; k++) {
          const keyAddr = await chainService.registry.keyAt(id, k);
          const keyInfo = await chainService.registry.getKey(keyAddr);
          keys.push({
            addr: keyAddr,
            status: Number(keyInfo.status),
            validFrom: Number(keyInfo.validFrom),
            compromisedAt: Number(keyInfo.compromisedAt),
          });
        }
        institutions.push({
          id,
          did: inst.did,
          nameHash: inst.nameHash,
          admin: inst.admin,
          status: Number(inst.status),
          approvals: Number(inst.approvals),
          keys,
        });
      }
    } catch (err) {
      console.warn('Error reading institutions from chain:', err);
    }

    return { institutions };
  });

  // GET /api/institutions/:id
  fastify.get<{ Params: { id: string } }>('/api/institutions/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const inst = await chainService.registry.getInstitution(id);
      if (!inst.did || inst.admin === ethers.ZeroAddress) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Institution not found' } });
      }

      const keyCount = Number(await chainService.registry.keyCount(id));
      const keys: any[] = [];
      for (let k = 0; k < keyCount; k++) {
        const keyAddr = await chainService.registry.keyAt(id, k);
        const keyInfo = await chainService.registry.getKey(keyAddr);
        keys.push({
          addr: keyAddr,
          status: Number(keyInfo.status),
          validFrom: Number(keyInfo.validFrom),
          compromisedAt: Number(keyInfo.compromisedAt),
        });
      }

      return {
        id,
        did: inst.did,
        nameHash: inst.nameHash,
        admin: inst.admin,
        status: Number(inst.status),
        approvals: Number(inst.approvals),
        keys,
      };
    } catch {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Institution not found' } });
    }
  });

  // POST /api/institutions/register
  fastify.post<{ Body: { name: string; did: string } }>('/api/institutions/register', async (req) => {
    const parsed = registerInstitutionRequestSchema.parse(req.body);
    const slug = parsed.did.replace('did:trustmesh:', '');
    const adminWallet = await keystore.getOrCreateWallet('institution-admin', slug, chainService.provider);

    const nameHash = ethers.keccak256(ethers.toUtf8Bytes(parsed.name));
    const deployer = await keystore.getWallet('accreditor', 'idx-0', chainService.provider);
    const registryWithSigner = chainService.getContractWithSigner(deployer);

    const tx = await registryWithSigner.registerInstitution(parsed.did, nameHash, adminWallet.address);
    const receipt = await tx.wait(1);
    const id = ethers.keccak256(ethers.toUtf8Bytes(parsed.did));

    return {
      id,
      txHash: receipt.hash,
    };
  });

  // POST /api/institutions/:id/approve
  fastify.post<{ Params: { id: string }; Body: { accreditorIndex: number } }>(
    '/api/institutions/:id/approve',
    async (req, reply) => {
      const { id } = req.params;
      const parsed = approveInstitutionRequestSchema.parse(req.body);

      try {
        const accreditorWallet = await keystore.getWallet(
          'accreditor',
          `idx-${parsed.accreditorIndex}`,
          chainService.provider
        );
        const registryWithSigner = chainService.getContractWithSigner(accreditorWallet);
        const tx = await registryWithSigner.approveInstitution(id);
        const receipt = await tx.wait(1);

        const updated = await chainService.registry.getInstitution(id);
        return {
          txHash: receipt.hash,
          approvals: Number(updated.approvals),
          status: Number(updated.status),
        };
      } catch (err: any) {
        const decoded = chainService.decodeRevert(err);
        return reply.status(400).send({
          error: {
            code: 'TRANSACTION_REVERTED',
            message: err.message,
            errorName: decoded?.errorName,
          },
        });
      }
    }
  );

  // POST /api/institutions/:id/status
  fastify.post<{ Params: { id: string }; Body: { action: 'suspend' | 'reinstate' | 'revoke' } }>(
    '/api/institutions/:id/status',
    async (req, reply) => {
      const { id } = req.params;
      const parsed = institutionStatusRequestSchema.parse(req.body);

      try {
        const accreditorWallet = await keystore.getWallet('accreditor', 'idx-0', chainService.provider);
        const registryWithSigner = chainService.getContractWithSigner(accreditorWallet);

        let tx: any;
        if (parsed.action === 'suspend') {
          tx = await registryWithSigner.suspendInstitution(id);
        } else if (parsed.action === 'reinstate') {
          tx = await registryWithSigner.reinstateInstitution(id);
        } else if (parsed.action === 'revoke') {
          tx = await registryWithSigner.revokeInstitution(id);
        }

        const receipt = await tx.wait(1);
        return { txHash: receipt.hash };
      } catch (err: any) {
        const decoded = chainService.decodeRevert(err);
        return reply.status(400).send({
          error: {
            code: 'ACTION_FAILED',
            message: err.message,
            errorName: decoded?.errorName,
          },
        });
      }
    }
  );
}
