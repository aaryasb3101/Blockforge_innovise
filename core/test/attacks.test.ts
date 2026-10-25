import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { ATTACKS, AttackContext } from '../src/attacks.js';
import { MockTrustSource } from './mockTrustSource.js';

describe('Attack Simulation Suite', () => {
  it('contains at least 18 attacks', () => {
    expect(ATTACKS.length).toBeGreaterThanOrEqual(18);
  });

  it('runs all 18 attacks and verifies each is blocked by the expected rule or contract revert', async () => {
    const accreditors: [Wallet, Wallet, Wallet] = [
      Wallet.createRandom(),
      Wallet.createRandom(),
      Wallet.createRandom(),
    ];
    const snapshotPublisher = Wallet.createRandom();
    const rogue = {
      did: 'did:trustmesh:rogue-attacker',
      key: Wallet.createRandom(),
    };

    const mockSource = new MockTrustSource();

    const ctx: AttackContext = {
      provider: {} as any,
      registryAddress: '0x1234567890123456789012345678901234567890',
      actors: {
        accreditors,
        institutions: [],
        rogue,
        snapshotPublisher,
      },
      newFundedWallet: async () => Wallet.createRandom(),
      trustSource: mockSource,
    };

    for (const attack of ATTACKS) {
      const outcome = await attack.run(ctx);
      expect(outcome.blocked, `Attack ${attack.id} was not blocked!`).toBe(true);
      expect(
        outcome.caughtBy,
        `Attack ${attack.id} expected caughtBy to include ${attack.expectedRule}`
      ).toContain(attack.expectedRule);
      expect(outcome.narrative).toBeDefined();
    }
  });
});
