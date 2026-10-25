import {
  Contract,
  Provider,
  ZeroHash,
} from 'ethers';
import { REGISTRY_ABI } from './abi.js';
import { TrustSource } from './types.js';

export class OnChainSource implements TrustSource {
  private contract: Contract;
  private provider: Provider;
  private registryAddress: string;

  // Simple block-aware caches to be gentle with the RPC
  private institutionCache = new Map<string, { block: number; data: any }>();
  private keyCache = new Map<string, { block: number; data: any }>();
  private anchorCache = new Map<string, { block: number; data: any }>();
  private batchCache = new Map<string, { block: number; data: any }>();
  private statusCache = new Map<string, { block: number; data: any }>();

  constructor(provider: Provider, registryAddress: string) {
    this.provider = provider;
    this.registryAddress = registryAddress;
    this.contract = new Contract(registryAddress, REGISTRY_ABI, provider);
  }

  async getInstitution(
    id: string
  ): Promise<{ did: string; nameHash: string; admin: string; status: number } | null> {
    const key = id.toLowerCase();
    const currentBlock = await this.getCurrentBlock();
    const cached = this.institutionCache.get(key);
    if (cached && cached.block === currentBlock) {
      return cached.data;
    }

    try {
      const res = await this.contract.getInstitution(id);
      // res: [did, nameHash, admin, status, approvals]
      const status = Number(res[3]);
      if (status === 0 && (!res[0] || res[0] === '')) {
        this.institutionCache.set(key, { block: currentBlock, data: null });
        return null;
      }
      const data = {
        did: res[0],
        nameHash: res[1],
        admin: res[2],
        status,
      };
      this.institutionCache.set(key, { block: currentBlock, data });
      return data;
    } catch {
      return null;
    }
  }

  async getKey(
    addr: string
  ): Promise<{
    institutionId: string;
    status: number;
    validFrom: number;
    compromisedAt: number;
  } | null> {
    const key = addr.toLowerCase();
    const currentBlock = await this.getCurrentBlock();
    const cached = this.keyCache.get(key);
    if (cached && cached.block === currentBlock) {
      return cached.data;
    }

    try {
      const res = await this.contract.getKey(addr);
      // res: [institutionId, status, validFrom, compromisedAt]
      const status = Number(res[1]);
      if (status === 0 && (!res[0] || res[0] === ZeroHash)) {
        this.keyCache.set(key, { block: currentBlock, data: null });
        return null;
      }
      const data = {
        institutionId: res[0],
        status,
        validFrom: Number(res[2]),
        compromisedAt: Number(res[3]),
      };
      this.keyCache.set(key, { block: currentBlock, data });
      return data;
    } catch {
      return null;
    }
  }

  async getAnchor(
    credId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    merkleRoot: string;
    schemaHash: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null> {
    const key = credId.toLowerCase();
    const currentBlock = await this.getCurrentBlock();
    const cached = this.anchorCache.get(key);
    if (cached && cached.block === currentBlock) {
      return cached.data;
    }

    try {
      const res = await this.contract.getAnchor(credId);
      // res: [institutionId, keyAddr, merkleRoot, schemaHash, timestamp]
      const timestamp = Number(res[4]);
      if (timestamp === 0 || !res[0] || res[0] === ZeroHash) {
        this.anchorCache.set(key, { block: currentBlock, data: null });
        return null;
      }

      // Query event log to retrieve blockNumber and txHash
      let blockNumber = currentBlock;
      let txHash = '';
      try {
        const filter = this.contract.filters.CredentialAnchored(credId);
        const events = await this.contract.queryFilter(filter);
        if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          blockNumber = lastEvent.blockNumber;
          txHash = lastEvent.transactionHash;
        }
      } catch {
        // Fallback if logs or filter creation fails
        txHash = '';
      }

      const data = {
        institutionId: res[0],
        keyAddr: res[1],
        merkleRoot: res[2],
        schemaHash: res[3],
        timestamp,
        blockNumber,
        txHash,
      };
      this.anchorCache.set(key, { block: currentBlock, data });
      return data;
    } catch {
      return null;
    }
  }

  async getBatch(
    batchId: string
  ): Promise<{
    institutionId: string;
    keyAddr: string;
    batchRoot: string;
    count: number;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  } | null> {
    const key = batchId.toLowerCase();
    const currentBlock = await this.getCurrentBlock();
    const cached = this.batchCache.get(key);
    if (cached && cached.block === currentBlock) {
      return cached.data;
    }

    try {
      const res = await this.contract.getBatch(batchId);
      // res: [institutionId, keyAddr, batchRoot, count, timestamp]
      const timestamp = Number(res[4]);
      if (timestamp === 0 || !res[0] || res[0] === ZeroHash) {
        this.batchCache.set(key, { block: currentBlock, data: null });
        return null;
      }

      let blockNumber = currentBlock;
      let txHash = '';
      try {
        const filter = this.contract.filters.BatchAnchored(batchId);
        const events = await this.contract.queryFilter(filter);
        if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          blockNumber = lastEvent.blockNumber;
          txHash = lastEvent.transactionHash;
        }
      } catch {
        txHash = '';
      }

      const data = {
        institutionId: res[0],
        keyAddr: res[1],
        batchRoot: res[2],
        count: Number(res[3]),
        timestamp,
        blockNumber,
        txHash,
      };
      this.batchCache.set(key, { block: currentBlock, data });
      return data;
    } catch {
      return null;
    }
  }

  async getCredentialStatus(
    credId: string
  ): Promise<{
    state: number;
    reasonCode: number;
    timestamp: number;
    by: string;
    txHash: string;
  } | null> {
    const key = credId.toLowerCase();
    const currentBlock = await this.getCurrentBlock();
    const cached = this.statusCache.get(key);
    if (cached && cached.block === currentBlock) {
      return cached.data;
    }

    try {
      const res = await this.contract.getCredentialStatus(credId);
      // res: [state, reasonCode, timestamp, by]
      const state = Number(res[0]);
      const reasonCode = Number(res[1]);
      const timestamp = Number(res[2]);
      const by = res[3];

      let txHash = '';
      if (state > 0) {
        try {
          const filter = this.contract.filters.CredentialStatusChanged(credId);
          const events = await this.contract.queryFilter(filter);
          if (events.length > 0) {
            txHash = events[events.length - 1].transactionHash;
          }
        } catch {
          txHash = '';
        }
      }

      const data = {
        state,
        reasonCode,
        timestamp,
        by,
        txHash,
      };
      this.statusCache.set(key, { block: currentBlock, data });
      return data;
    } catch {
      return null;
    }
  }

  async meta(): Promise<{
    blockNumber: number;
    timestamp: number;
    source: 'chain';
    fetchedAt: number;
  }> {
    const blockNumber = await this.getCurrentBlock();
    let timestamp = Math.floor(Date.now() / 1000);
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (block) {
        timestamp = Number(block.timestamp);
      }
    } catch {
      // Fallback
    }

    return {
      blockNumber,
      timestamp,
      source: 'chain',
      fetchedAt: Date.now(),
    };
  }

  private async getCurrentBlock(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch {
      return 0;
    }
  }
}
