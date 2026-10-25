import { describe, it, expect, vi } from 'vitest';
import { computeBlastRadius } from '../src/blastRadius.js';
import { Contract, keccak256, toUtf8Bytes } from 'ethers';

vi.mock('ethers', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Contract: vi.fn(),
  };
});

describe('computeBlastRadius', () => {
  it('classifies safe, suspicious, and afterRevoke credentials correctly', async () => {
    const compromisedAt = 1700000500;
    const keyAddr = '0x1234567890123456789012345678901234567890';

    const mockContract = {
      getKey: vi.fn().mockResolvedValue([
        '0xinst',
        3n, // Revoked
        1690000000n,
        BigInt(compromisedAt),
      ]),
      filters: {
        CredentialAnchored: vi.fn().mockReturnValue({ isBatch: false }),
        BatchAnchored: vi.fn().mockReturnValue({ isBatch: true }),
      },
      queryFilter: vi.fn().mockImplementation((filter) => {
        if (filter.isBatch) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            args: ['0xcred_safe', '0xinst', keyAddr, '0xroot1', '0xschema'],
            getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000100 }), // Before compromise -> safe
          },
          {
            args: ['0xcred_suspicious', '0xinst', keyAddr, '0xroot2', '0xschema'],
            getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000600 }), // After compromise -> suspicious
          },
          {
            args: ['0xcred_afterRevoke', '0xinst', keyAddr, '0xroot3', '0xschema'],
            getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000800 }), // After revocation -> afterRevoke
          },
        ]);
      }),
    };

    (Contract as any).mockImplementation(() => mockContract);

    const mockProvider: any = {};
    const result = await computeBlastRadius(
      mockProvider,
      '0xregistry',
      keyAddr,
      compromisedAt,
      [
        {
          id: '0xcred_suspicious',
          holderDid: 'did:pkh:eip155:1:0xholder1',
        },
        {
          id: '0xcred_afterRevoke',
          holderDid: 'did:pkh:eip155:1:0xholder2',
        },
      ]
    );

    expect(result.safe).toContain('0xcred_safe');
    expect(result.suspicious).toContain('0xcred_suspicious');
    expect(result.afterRevoke).toContain('0xcred_afterRevoke');
    expect(result.holdersHashed).toHaveLength(2);
    expect(result.holdersHashed).toContain(
      keccak256(toUtf8Bytes('did:pkh:eip155:1:0xholder1'))
    );
    expect(result.holdersHashed).toContain(
      keccak256(toUtf8Bytes('did:pkh:eip155:1:0xholder2'))
    );
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recommendedActions.some((a) => a.includes('Rotate'))).toBe(true);
  });
});
