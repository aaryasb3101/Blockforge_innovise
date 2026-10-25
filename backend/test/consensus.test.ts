import { describe, it, expect, beforeEach } from 'vitest';
import { RealConsensusEngine } from '../src/services/consensusService.js';

describe('Real Consensus & Validator Network Prototype', () => {
  let engine: RealConsensusEngine;

  beforeEach(() => {
    engine = new RealConsensusEngine();
    // Stop auto-timer during deterministic unit test runs
    engine.toggleAutoRun(false);
  });

  it('1. Validator Network: initializes 4 cryptographic validator nodes with distinct keys and local ledgers', () => {
    const status = engine.getNetworkStatus();
    expect(status.validators).toHaveLength(4);

    const leader = status.validators.find((v) => v.role === 'leader');
    expect(leader).toBeDefined();
    expect(leader?.id).toBe('val-1');
    expect(leader?.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Each validator maintains its own height and state root
    for (const v of status.validators) {
      expect(v.height).toBeGreaterThanOrEqual(0);
      expect(v.stateRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(v.status).toBe('active');
    }
  });

  it('2. Transaction Processing: submits synthetic transactions, computes Merkle roots, and commits via BFT consensus', async () => {
    const tx = engine.submitTransaction('0xAlice', '0xBob', 25, 'Payment');
    expect(tx.id).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(tx.amount).toBe(25);

    const initialHeight = engine.getNetworkStatus().round.height;
    const committed = await engine.executeConsensusRound();
    expect(committed).toBe(true);

    const afterStatus = engine.getNetworkStatus();
    expect(afterStatus.round.height).toBe(initialHeight + 1);

    // Verify ECDSA PreVote and PreCommit signatures collected from validators
    expect(afterStatus.round.preVotes.length).toBeGreaterThanOrEqual(3);
    expect(afterStatus.round.preCommits.length).toBeGreaterThanOrEqual(3);
  });

  it('3. Failure Simulation: handles single node unavailability without halting (3/4 >= 67%)', async () => {
    engine.setNodeStatus('val-3', 'crashed');
    const statusBefore = engine.getNetworkStatus();
    expect(statusBefore.validators.find((v) => v.id === 'val-3')?.status).toBe('crashed');

    // Consensus round must still succeed with 3 online nodes
    const committed = await engine.executeConsensusRound();
    expect(committed).toBe(true);

    const statusAfter = engine.getNetworkStatus();
    const crashedNode = statusAfter.validators.find((v) => v.id === 'val-3');
    const leaderNode = statusAfter.validators.find((v) => v.id === 'val-1');

    // Crashed node does NOT advance its local ledger; leader advances
    expect(crashedNode?.height).toBeLessThan(leaderNode!.height);
  });

  it('3b. Failure Simulation: consensus halts safely when quorum is lost (2/4 < 67%)', async () => {
    engine.setNodeStatus('val-3', 'crashed');
    engine.setNodeStatus('val-4', 'crashed');

    // Only 2 of 4 online -> below 2/3 threshold -> consensus must halt
    const committed = await engine.executeConsensusRound();
    expect(committed).toBe(false);

    const status = engine.getNetworkStatus();
    expect(status.round.isQuorumReached).toBe(false);
  });

  it('4. Ledger Consistency Checks: identifies matching vs conflicting/divergent local states', async () => {
    // Normal operation: all online nodes agree
    await engine.executeConsensusRound();
    const auditClean = engine.verifyLedgerConsistency();
    expect(auditClean.isConsistent).toBe(true);
    expect(auditClean.conflictingNodes).toHaveLength(0);

    // Byzantine fault injection
    engine.setNodeStatus('val-4', 'byzantine');
    const auditCorrupted = engine.verifyLedgerConsistency();
    expect(auditCorrupted.isConsistent).toBe(false);
    expect(auditCorrupted.conflictingNodes).toHaveLength(1);
    expect(auditCorrupted.conflictingNodes[0].id).toBe('val-4');
  });

  it('5. Performance Evaluation: computes real throughput, confirmation latency, and recovery', async () => {
    engine.submitBatchTransactions(20);
    await engine.executeConsensusRound();

    const metrics = engine.getPerformanceMetrics();
    expect(metrics.totalCommittedTxs).toBeGreaterThan(0);
    expect(metrics.avgConfirmationLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.currentTps).toBeGreaterThan(0);
    expect(metrics.baselineComparison.normalTps).toBe(465);
    expect(metrics.baselineComparison.disruptedTps).toBe(110);
  });
});
