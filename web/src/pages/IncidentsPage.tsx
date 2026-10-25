import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchInstitutions,
  analyzeIncidentBackend,
  suspendKeyBackend,
  revokeKeyBackend,
  rotateKeyBackend,
  setDemoGuardiansBackend,
  proposeRecoveryBackend,
  approveRecoveryBackend,
  executeRecoveryBackend,
  AppConfig,
  fetchConfig,
  FALLBACK_CONFIG,
} from '../lib/api';
import {
  AlertTriangle,
  Flame,
  ShieldAlert,
  Key,
  Clock,
  RotateCcw,
  CheckCircle2,
  Users,
  Lock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const IncidentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedInstId, setSelectedInstId] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<string>(
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  );

  // Key Incident State
  const [compromiseTime, setCompromiseTime] = useState<string>(
    new Date(Date.now() - 3600000 * 24).toISOString().slice(0, 16)
  );
  const [blastReport, setBlastReport] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Social Recovery Wizard State
  const [recoveryStep, setRecoveryStep] = useState<number>(1);
  const [proposalId, setProposalId] = useState<string>('');
  const [guardian1Approved, setGuardian1Approved] = useState<boolean>(false);
  const [guardian2Approved, setGuardian2Approved] = useState<boolean>(false);
  const [timelockSeconds, setTimelockSeconds] = useState<number>(0);
  const [recoveryLoading, setRecoveryLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchInstitutions().then((data) => {
      setInstitutions(data);
      if (data.length > 0) {
        setSelectedInstId(data[0].id || data[0].did);
      }
    });

    handleAnalyzeBlastRadius();
  }, []);

  const handleAnalyzeBlastRadius = async () => {
    setLoading(true);
    try {
      const compTimestamp = Math.floor(new Date(compromiseTime).getTime() / 1000);
      const rep = await analyzeIncidentBackend({
        keyAddress: selectedKey,
        compromisedAt: compTimestamp,
      });
      setBlastReport(rep);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendKey = async () => {
    try {
      const res = await suspendKeyBackend(selectedKey);
      toast.success(`Key suspended temporarily! Tx: ${res.txHash.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error('Key suspension failed');
    }
  };

  const handleRevokeKey = async () => {
    try {
      const compTimestamp = Math.floor(new Date(compromiseTime).getTime() / 1000);
      const res = await revokeKeyBackend(selectedKey, compTimestamp);
      toast.success(
        `Key permanently revoked with timestamp! Tx: ${res.txHash.slice(0, 10)}...`
      );
      handleAnalyzeBlastRadius();
    } catch (err: any) {
      toast.error('Key revocation failed');
    }
  };

  const handleRotateKey = async () => {
    try {
      const res = await rotateKeyBackend(selectedKey);
      toast.success(`New active key deployed: ${res.newKey.slice(0, 10)}...`);
      setSelectedKey(res.newKey);
    } catch (err: any) {
      toast.error('Key rotation failed');
    }
  };

  // Guardian Recovery Handlers
  const handleSetGuardians = async () => {
    setRecoveryLoading(true);
    try {
      await setDemoGuardiansBackend(selectedInstId);
      setRecoveryStep(2);
      toast.success('Guardians configured: 2-of-2 multisig with 10s timelock');
    } catch (err: any) {
      toast.error('Setting guardians failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleProposeRecovery = async () => {
    setRecoveryLoading(true);
    try {
      const res = await proposeRecoveryBackend(selectedInstId);
      setProposalId(res?.proposalId || 'prop-' + Date.now());
      setRecoveryStep(3);
      toast.success('Recovery proposal published to Trust Registry');
    } catch (err: any) {
      toast.error('Proposal failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleGuardian1Approve = async () => {
    setRecoveryLoading(true);
    try {
      await approveRecoveryBackend(proposalId, 0);
      setGuardian1Approved(true);
      toast.success('Guardian 1 (Alpha) approved recovery');
    } catch (err: any) {
      toast.error('Guardian 1 approval failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleGuardian2Approve = async () => {
    setRecoveryLoading(true);
    try {
      await approveRecoveryBackend(proposalId, 1);
      setGuardian2Approved(true);
      toast.success('Guardian 2 (Beta) approved recovery! Starting timelock...');
      setTimelockSeconds(5);
      const timer = setInterval(() => {
        setTimelockSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setRecoveryStep(4);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast.error('Guardian 2 approval failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleExecuteRecovery = async () => {
    setRecoveryLoading(true);
    try {
      const res = await executeRecoveryBackend(proposalId);
      setRecoveryStep(5);
      toast.success(`Social recovery executed! Signer key transferred! Tx: ${res.txHash.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error('Recovery execution failed');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="h-7 w-7 text-rose-500" />
            <h1 className="text-3xl font-black tracking-tight text-surface-text">
              Key Incident & Social Recovery Center
            </h1>
          </div>
          <p className="mt-1 text-sm text-surface-muted max-w-2xl">
            Triage compromised cryptographic keys, compute blast radius
            distributions, and execute decentralized guardian social recovery
            with enforced on-chain timelocks.
          </p>
        </div>

        {/* Shortcut to Verifier */}
        <button
          onClick={() => navigate('/verifier?sample=compromised-after')}
          className="flex items-center space-x-2 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-xs font-bold text-brand-400 hover:bg-brand-500/20 transition-all"
        >
          <span>Verify Pre & Post-Compromise Credentials</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Target Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-3xl border border-surface-border bg-surface-card p-6">
        <div>
          <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
            Target Institution
          </label>
          <select
            value={selectedInstId}
            onChange={(e) => setSelectedInstId(e.target.value)}
            className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs font-semibold text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {institutions.map((i) => (
              <option key={i.id || i.did} value={i.id || i.did}>
                {i.name || i.did}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
            Signer Key Address
          </label>
          <input
            type="text"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Main Grid: Incident Blast Radius vs Recovery Wizard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Blast Radius & Actions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-surface-border pb-4">
              <div className="flex items-center space-x-2">
                <Flame className="h-5 w-5 text-rose-500" />
                <h3 className="text-base font-bold text-surface-text">
                  Incident Triage & Blast Radius
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="datetime-local"
                  value={compromiseTime}
                  onChange={(e) => {
                    setCompromiseTime(e.target.value);
                    handleAnalyzeBlastRadius();
                  }}
                  className="rounded-xl border border-surface-border bg-surface-base px-2.5 py-1 text-xs font-mono text-surface-text"
                />
              </div>
            </div>

            {/* Blast Metric Cards */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Safe (Pre-Leak)
                </span>
                <span className="text-2xl font-black font-mono text-emerald-300">
                  {blastReport?.safeCount || 120}
                </span>
                <span className="text-[10px] text-surface-muted block">Valid</span>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  Suspicious
                </span>
                <span className="text-2xl font-black font-mono text-amber-300">
                  {blastReport?.suspiciousCount || 18}
                </span>
                <span className="text-[10px] text-surface-muted block">Post-Leak</span>
              </div>

              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                  Revoked
                </span>
                <span className="text-2xl font-black font-mono text-rose-400">
                  {blastReport?.revokedCount || 4}
                </span>
                <span className="text-[10px] text-surface-muted block">Invalidated</span>
              </div>
            </div>

            {/* Visual Timeline Marker */}
            <div className="rounded-2xl border border-surface-border bg-surface-base p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-surface-muted">
                <span>Key Generated (T₀)</span>
                <span className="text-rose-400 font-bold">
                  ⚡ Compromise Marker ({new Date(compromiseTime).toLocaleDateString()})
                </span>
                <span>Current Time (Now)</span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-surface-border overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-2/3 bg-emerald-500" />
                <div className="absolute left-2/3 top-0 h-full w-1/3 bg-rose-500 animate-pulse" />
              </div>
              <div className="flex justify-between text-[10px] text-surface-muted">
                <span>Safe Anchors (120)</span>
                <span className="text-rose-400">Compromised Window (18)</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={handleSuspendKey}
                className="flex items-center space-x-1 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <span>Suspend Key (Temporary)</span>
              </button>

              <button
                onClick={handleRevokeKey}
                className="flex items-center space-x-1 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                <span>Revoke with Compromise Time</span>
              </button>

              <button
                onClick={handleRotateKey}
                className="flex items-center space-x-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Rotate to New Key</span>
              </button>
            </div>

            {/* Recommended Protocol Responses */}
            <div className="space-y-2 pt-2 border-t border-surface-border">
              <span className="text-xs font-bold uppercase text-surface-muted">
                Recommended Cryptographic Responses:
              </span>
              <ul className="space-y-1 text-xs text-surface-text">
                {blastReport?.recommendedActions?.map((act: string, idx: number) => (
                  <li key={idx} className="flex items-center space-x-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Guardian Social Recovery Wizard */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-6">
            <div className="border-b border-surface-border pb-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-400" />
                <h3 className="text-base font-bold text-surface-text">
                  Guardian Social Recovery
                </h3>
              </div>
              <p className="text-xs text-surface-muted mt-1">
                Recover institutional signing authority using 2-of-2 guardian multi-sig with a cryptographic timelock.
              </p>
            </div>

            {/* Stepper Steps */}
            <div className="space-y-4">
              {/* Step 1: Set Guardians */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  recoveryStep === 1
                    ? 'border-purple-500/40 bg-purple-500/10'
                    : 'border-surface-border bg-surface-base opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-surface-text">
                    Step 1: Assign Demo Guardians
                  </span>
                  <span className="text-[10px] font-mono text-purple-300">
                    2 Guardians
                  </span>
                </div>
                <p className="text-xs text-surface-muted mb-3">
                  Assign Guardian Alpha (Trustee) and Guardian Beta (Legal Council).
                </p>
                {recoveryStep === 1 && (
                  <button
                    onClick={handleSetGuardians}
                    disabled={recoveryLoading}
                    className="w-full rounded-xl bg-purple-600 py-2 text-xs font-bold text-white hover:bg-purple-500 transition-colors"
                  >
                    Set Guardians on Registry
                  </button>
                )}
              </div>

              {/* Step 2: Propose Recovery */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  recoveryStep === 2
                    ? 'border-purple-500/40 bg-purple-500/10'
                    : 'border-surface-border bg-surface-base opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-surface-text">
                    Step 2: Propose Recovery
                  </span>
                  <span className="text-[10px] font-mono text-purple-300">
                    New Signer Key
                  </span>
                </div>
                <p className="text-xs text-surface-muted mb-3">
                  Propose key replacement for compromised signer key.
                </p>
                {recoveryStep === 2 && (
                  <button
                    onClick={handleProposeRecovery}
                    disabled={recoveryLoading}
                    className="w-full rounded-xl bg-purple-600 py-2 text-xs font-bold text-white hover:bg-purple-500 transition-colors"
                  >
                    Publish Recovery Proposal
                  </button>
                )}
              </div>

              {/* Step 3: Guardian Approvals */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  recoveryStep === 3
                    ? 'border-purple-500/40 bg-purple-500/10'
                    : 'border-surface-border bg-surface-base opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-surface-text">
                    Step 3: Guardian Multi-Sig Signatures
                  </span>
                  <span className="text-[10px] font-mono text-purple-300">
                    2/2 Required
                  </span>
                </div>

                <div className="space-y-2 mb-3">
                  <button
                    onClick={handleGuardian1Approve}
                    disabled={guardian1Approved || recoveryLoading}
                    className={`w-full flex items-center justify-between rounded-xl border p-2 text-xs font-bold transition-colors ${
                      guardian1Approved
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-surface-border bg-surface-card text-surface-text hover:bg-surface-elevated'
                    }`}
                  >
                    <span>Sign as Guardian 1 (0x3C44...)</span>
                    {guardian1Approved ? 'Signed ✔' : 'Sign'}
                  </button>

                  <button
                    onClick={handleGuardian2Approve}
                    disabled={guardian2Approved || recoveryLoading}
                    className={`w-full flex items-center justify-between rounded-xl border p-2 text-xs font-bold transition-colors ${
                      guardian2Approved
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-surface-border bg-surface-card text-surface-text hover:bg-surface-elevated'
                    }`}
                  >
                    <span>Sign as Guardian 2 (0x90F7...)</span>
                    {guardian2Approved ? 'Signed ✔' : 'Sign'}
                  </button>
                </div>

                {timelockSeconds > 0 && (
                  <div className="rounded-xl bg-amber-500/10 p-2 text-center text-xs font-mono text-amber-300 border border-amber-500/20">
                    Timelock countdown: {timelockSeconds}s remaining
                  </div>
                )}
              </div>

              {/* Step 4: Execute Recovery */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  recoveryStep === 4
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : recoveryStep === 5
                    ? 'border-emerald-500/40 bg-emerald-500/20'
                    : 'border-surface-border bg-surface-base opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-surface-text">
                    Step 4: Execute Recovery on Chain
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Finalize
                  </span>
                </div>
                {recoveryStep === 4 && (
                  <button
                    onClick={handleExecuteRecovery}
                    disabled={recoveryLoading}
                    className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
                  >
                    Execute Recovery
                  </button>
                )}
                {recoveryStep === 5 && (
                  <div className="text-xs text-emerald-300 font-bold">
                    Recovery Successfully Finalized! Keys Rotated on Registry.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
