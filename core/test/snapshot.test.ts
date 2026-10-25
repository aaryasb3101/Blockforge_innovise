import { describe, it, expect } from 'vitest';
import { Wallet, getBytes } from 'ethers';
import {
  snapshotHash,
  verifySnapshotSignature,
  SnapshotSource,
} from '../src/snapshot.js';
import { Snapshot } from '../src/types.js';

describe('SnapshotSource and Snapshot utilities', () => {
  const publisherWallet = Wallet.createRandom();

  it('snapshotHash and verifySnapshotSignature work correctly', async () => {
    const rawSnapshot: Omit<Snapshot, 'signature'> = {
      version: 1,
      chainId: 31337,
      registry: '0x1234567890123456789012345678901234567890',
      blockNumber: 120,
      timestamp: 1700000000,
      institutions: [
        {
          id: '0xinst1',
          did: 'did:trustmesh:inst1',
          admin: '0xadmin1',
          status: 1,
        },
      ],
      keys: [
        {
          addr: '0xkey1',
          institutionId: '0xinst1',
          status: 1,
          validFrom: 1690000000,
          compromisedAt: 0,
        },
      ],
      anchors: [],
      batches: [],
      statuses: [],
      publisher: publisherWallet.address,
    };

    const hash = snapshotHash(rawSnapshot);
    expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const signature = await publisherWallet.signMessage(getBytes(hash));
    const fullSnapshot: Snapshot = {
      ...rawSnapshot,
      signature,
    };

    // Valid publisher
    const valid = verifySnapshotSignature(fullSnapshot, publisherWallet.address);
    expect(valid).toBe(true);

    // Mismatched trusted publisher
    const impostorWallet = Wallet.createRandom();
    const invalid = verifySnapshotSignature(fullSnapshot, impostorWallet.address);
    expect(invalid).toBe(false);
  });

  it('SnapshotSource serves institutions, keys, and meta', async () => {
    const rawSnapshot: Omit<Snapshot, 'signature'> = {
      version: 1,
      chainId: 31337,
      registry: '0x1234567890123456789012345678901234567890',
      blockNumber: 150,
      timestamp: 1700000000,
      institutions: [
        {
          id: '0xinst1',
          did: 'did:trustmesh:inst1',
          admin: '0xadmin1',
          status: 1,
        },
      ],
      keys: [
        {
          addr: '0xkey1',
          institutionId: '0xinst1',
          status: 1,
          validFrom: 1690000000,
          compromisedAt: 0,
        },
      ],
      anchors: [
        {
          credentialId: '0xcred1',
          institutionId: '0xinst1',
          keyAddr: '0xkey1',
          merkleRoot: '0xroot1',
          timestamp: 1700000000,
          blockNumber: 140,
          txHash: '0xtx1',
        },
      ],
      batches: [],
      statuses: [],
      publisher: publisherWallet.address,
    };

    const hash = snapshotHash(rawSnapshot);
    const signature = await publisherWallet.signMessage(getBytes(hash));
    const snapshot: Snapshot = {
      ...rawSnapshot,
      signature,
    };

    const source = new SnapshotSource(snapshot, publisherWallet.address);
    expect(source.isPublisherVerified).toBe(true);

    const inst = await source.getInstitution('0xinst1');
    expect(inst).not.toBeNull();
    expect(inst?.did).toBe('did:trustmesh:inst1');

    const key = await source.getKey('0xkey1');
    expect(key).not.toBeNull();
    expect(key?.status).toBe(1);

    const anchor = await source.getAnchor('0xcred1');
    expect(anchor).not.toBeNull();
    expect(anchor?.merkleRoot).toBe('0xroot1');

    const meta = await source.meta();
    expect(meta.source).toBe('snapshot');
    expect(meta.publisherVerified).toBe(true);
    expect(meta.blockNumber).toBe(150);
  });
});
