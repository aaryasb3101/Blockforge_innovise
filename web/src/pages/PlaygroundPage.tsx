import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchAttacks,
  runAttack,
  verifyWithBrowser,
  FALLBACK_CONFIG,
  fetchDemoSamples,
} from '../lib/api';
import { AttackOutcome } from '@shared/types';
import {
  Skull,
  Play,
  CheckCircle2,
  XCircle,
  Flame,
  Share2,
  Code2,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const PlaygroundPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [attacks, setAttacks] = useState<any[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, AttackOutcome>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState<boolean>(false);

  // Free-edit JSON Sandbox
  const [customJson, setCustomJson] = useState<string>('');
  const [sandboxResult, setSandboxResult] = useState<any | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchAttacks().then(setAttacks);
    fetchDemoSamples().then((samples) => {
      // Check query param for shareable attack link
      const encodedAttack = searchParams.get('payload');
      if (encodedAttack) {
        try {
          const decoded = decodeURIComponent(atob(encodedAttack));
          setCustomJson(decoded);
          toast.success('Loaded shareable attack payload');
        } catch {
          setCustomJson(JSON.stringify(samples.tampered || samples.valid, null, 2));
        }
      } else {
        setCustomJson(JSON.stringify(samples.tampered || samples.valid, null, 2));
      }
    });
  }, [searchParams]);

  const handleRunSingle = async (attackId: string) => {
    setRunningId(attackId);
    try {
      const outcome = await runAttack(attackId);
      setOutcomes((prev) => ({ ...prev, [attackId]: outcome }));
      if (outcome.blocked) {
        toast.success(`Attack blocked by ${outcome.caughtBy?.join(', ') || 'Core Rules'}`);
      } else {
        toast.error(`Attack was NOT blocked!`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Execution error');
    } finally {
      setRunningId(null);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    toast('Running all 18 fraud attacks against TrustMesh...', { icon: '🛡️' });
    const results: Record<string, AttackOutcome> = {};
    for (const a of attacks) {
      try {
        const out = await runAttack(a.id);
        results[a.id] = out;
        setOutcomes({ ...results });
      } catch (err) {
        console.warn(`Attack ${a.id} run error:`, err);
      }
    }
    setRunningAll(false);
    toast.success('All attack vectors simulated!');
  };

  const handleVerifySandbox = async () => {
    if (!customJson.trim()) return;
    setSandboxLoading(true);
    setSandboxResult(null);
    try {
      const parsed = JSON.parse(customJson);
      const res = await verifyWithBrowser(
        parsed,
        FALLBACK_CONFIG.rpcUrl,
        FALLBACK_CONFIG.registry
      );
      setSandboxResult(res);
      toast.success(`Evaluated: ${res.verdict}`);
    } catch (err: any) {
      toast.error(err.message || 'Verification error');
    } finally {
      setSandboxLoading(false);
    }
  };

  const handleShareAttack = () => {
    try {
      const b64 = btoa(encodeURIComponent(customJson));
      const url = `${window.location.origin}/playground?payload=${b64}`;
      navigator.clipboard.writeText(url);
      toast.success('Shareable attack link copied to clipboard!');
    } catch {
      toast.error('Failed to create shareable link');
    }
  };

  const blockedCount = Object.values(outcomes).filter((o) => o.blocked).length;

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Skull className="h-7 w-7 text-rose-500" />
            <h1 className="text-3xl font-black tracking-tight text-surface-text">
              Fraud Simulation Playground
            </h1>
          </div>
          <p className="mt-1 text-sm text-surface-muted max-w-2xl">
            Adversarial attack laboratory with 18 automated threat scenarios.
            Simulate signature forgeries, replay exploits, Merkle extensions,
            and key leakages.
          </p>
        </div>

        {/* Global Action & Scoreboard */}
        <div className="flex items-center space-x-4">
          <div className="rounded-2xl border border-surface-border bg-surface-card px-4 py-2 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted block">
              Attacks Blocked
            </span>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {blockedCount} / {attacks.length || 18}
            </div>
          </div>

          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="flex items-center space-x-2 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-rose-500/20 hover:from-rose-500 hover:to-orange-400 active:scale-95 transition-all disabled:opacity-50"
          >
            {runningAll ? (
              <span className="flex items-center space-x-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Simulating Attacks...</span>
              </span>
            ) : (
              <>
                <Flame className="h-4 w-4 fill-current" />
                <span>Run All 18 Attacks</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Free-Edit Mutation Sandbox */}
      <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-border pb-4">
          <div className="flex items-center space-x-2">
            <Code2 className="h-5 w-5 text-brand-400" />
            <div>
              <h3 className="text-base font-bold text-surface-text">
                Live Mutator Sandbox (Judge Interactive Edit)
              </h3>
              <p className="text-xs text-surface-muted">
                Judges: edit any field below (change CGPA, tamper issuer DID, modify signature) and click "Verify Mutated" to inspect the security reaction.
              </p>
            </div>
          </div>

          <button
            onClick={handleShareAttack}
            className="flex items-center space-x-1.5 self-start sm:self-auto rounded-xl border border-surface-border bg-surface-base px-3 py-1.5 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-brand-400" />
            <span>Shareable Attack Link</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-2">
            <textarea
              value={customJson}
              onChange={(e) => setCustomJson(e.target.value)}
              rows={10}
              className="w-full rounded-2xl border border-surface-border bg-surface-base p-4 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              onClick={handleVerifySandbox}
              disabled={sandboxLoading}
              className="w-full rounded-2xl bg-brand-500 py-3 text-xs font-bold text-white shadow-md hover:bg-brand-600 transition-colors"
            >
              {sandboxLoading ? 'Evaluating Rules...' : 'Verify Mutated Payload in Core Engine'}
            </button>
          </div>

          <div className="lg:col-span-4">
            {sandboxResult ? (
              <div
                className={`h-full rounded-2xl border p-4 space-y-3 ${
                  sandboxResult.verdict === 'VALID'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Verdict
                  </span>
                  <span className="text-xl font-black font-mono">
                    {sandboxResult.verdict}
                  </span>
                </div>
                <div className="text-xs font-mono">
                  Trust Score: {sandboxResult.trustScore}/100
                </div>

                <div className="text-[11px] font-sans text-surface-text pt-2 border-t border-current/20 space-y-1">
                  <div className="font-bold">Failed Rules:</div>
                  {sandboxResult.rules
                    .filter((r: any) => r.status === 'fail')
                    .map((r: any) => (
                      <div
                        key={r.id}
                        className="rounded bg-black/30 p-1.5 font-mono text-xs text-rose-300"
                      >
                        {r.id}: {r.reason}
                      </div>
                    ))}
                  {sandboxResult.rules.filter((r: any) => r.status === 'fail').length ===
                    0 && (
                    <div className="text-emerald-300">
                      No rules failed. Payload is authentic.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border bg-surface-base/50 p-6 text-center h-full text-xs text-surface-muted">
                Mutate JSON and click verify to see real-time rule triage.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 18 Attack Scenario Cards Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-surface-text">
          18 Automated Adversarial Vectors
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attacks.map((a) => {
            const outcome = outcomes[a.id];
            const isRunning = runningId === a.id;

            return (
              <div
                key={a.id}
                className="flex flex-col justify-between rounded-3xl border border-surface-border bg-surface-card p-5 transition-all hover:border-surface-border/80"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-surface-muted">
                      {a.id}
                    </span>

                    {outcome ? (
                      outcome.blocked ? (
                        <span className="flex items-center space-x-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 font-mono">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>BLOCKED</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20 font-mono">
                          <XCircle className="h-3 w-3" />
                          <span>NOT BLOCKED</span>
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-surface-base px-2 py-0.5 text-[10px] font-mono text-surface-muted">
                        READY
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-surface-text">{a.name}</h4>
                  <p className="text-xs text-surface-muted leading-relaxed line-clamp-3">
                    {a.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-surface-border space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-surface-muted">Target Rule:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {a.expectedRule}
                    </span>
                  </div>

                  {outcome && (
                    <div className="rounded-xl bg-surface-base p-2 text-[10px] font-mono space-y-0.5 border border-surface-border">
                      <div className="text-surface-muted">
                        Caught By: <span className="text-surface-text">{outcome.caughtBy?.join(', ')}</span>
                      </div>
                      <div className="text-surface-muted">
                        Verdict: <span className="text-rose-400 font-bold">{outcome.verification?.verdict || 'BLOCKED'}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleRunSingle(a.id)}
                    disabled={isRunning}
                    className="w-full flex items-center justify-center space-x-1 rounded-xl border border-surface-border bg-surface-base py-2 text-xs font-bold text-surface-text hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    {isRunning ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current text-rose-400" />
                        <span>Simulate Attack</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
