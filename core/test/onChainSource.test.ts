import { describe, it, expect, vi } from 'vitest';
import { OnChainSource } from '../src/onChainSource.js';
import { ZeroAddress, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';

describe('OnChainSource', () => {
  it('instantiates and queries institution, key, anchor, and meta', async () => {
    const mockProvider: any = {
      getBlockNumber: vi.fn().mockResolvedValue(100),
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
    };

    const source = new OnChainSource(mockProvider, '0x1234567890123456789012345678901234567890');

    // Mock contract calls
    (source as any).contract.getInstitution = vi.fn().mockResolvedValue([
      'did:trustmesh:iit-bombay',
      keccak256(toUtf8Bytes('IIT Bombay')),
      '0xadmin',
      1n, // status Active
      2n, // approvals
    ]);

    (source as any).contract.getKey = vi.fn().mockResolvedValue([
      keccak256(toUtf8Bytes('did:trustmesh:iit-bombay')),
      1n, // status Active
      1690000000n, // validFrom
      0n, // compromisedAt
    ]);

    (source as any).contract.getAnchor = vi.fn().mockResolvedValue([
      keccak256(toUtf8Bytes('did:trustmesh:iit-bombay')),
      '0xkey',
      '0xroot',
      '0xschema',
      1699999999n,
    ]);

    (source as any).contract.queryFilter = vi.fn().mockResolvedValue([
      {
        blockNumber: 99,
        transactionHash: '0xtx123',
      },
    ]);

    const dummyBytes32 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const inst = await source.getInstitution(dummyBytes32);
    expect(inst).not.toBeNull();
    expect(inst?.did).toBe('did:trustmesh:iit-bombay');
    expect(inst?.status).toBe(1);

    const key = await source.getKey('0x1234567890123456789012345678901234567890');
    expect(key).not.toBeNull();
    expect(key?.status).toBe(1);
    expect(key?.validFrom).toBe(1690000000);

    const anchor = await source.getAnchor(dummyBytes32);
    expect(anchor).not.toBeNull();
    expect(anchor?.blockNumber).toBe(99);
    expect(anchor?.txHash).toBe('0xtx123');

    const meta = await source.meta();
    expect(meta.blockNumber).toBe(100);
    expect(meta.timestamp).toBe(1700000000);
    expect(meta.source).toBe('chain');

    // Test cache: calling again within same block does not re-invoke contract
    await source.getInstitution(dummyBytes32);
    expect((source as any).contract.getInstitution).toHaveBeenCalledTimes(1);
  });
});
