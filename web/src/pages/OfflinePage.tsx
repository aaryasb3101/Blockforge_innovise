import React, { useState, useEffect } from 'react';
import {
  fetchSnapshot,
  publishSnapshotOnChain,
  verifyWithSnapshot,
  FALLBACK_CONFIG,
  fetchDemoSamples,
} from '../lib/api';
import {
  saveSnapshot,
  getLatestSnapshot,
  getSimulatedClockOffset,
  setSimulatedClockOffset,
} from '../lib/storage';
import { Snapshot, VerificationResult, Verdict } from '@shared/types';
import { TrustGauge } from '../components/TrustGauge';
import {
  WifiOff,
  Wifi,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sliders,
  ShieldCheck,
  Database,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const OfflinePage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [offlineModeActive, setOfflineModeActive] = useState<boolean>(true);
  const [clockOffsetHours, setClockOffsetHours] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Verification in offline mode
  const [verifyInput, setVerifyInput] = useState<string>('');
  const [offlineResult, setOfflineResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    loadCachedSnapshot();
    fetchDemoSamples().then((s) => {
      if (s.valid) {
        setVerifyInput(JSON.stringify(s.valid, null, 2));
      }
    });
    getSimulatedClockOffset().then(setClockOffsetHours);
  }, []);

  const loadCachedSnapshot = async () => {
    try {
      // First try IndexedDB
      const cached = await getLatestSnapshot();
      if (cached) {
        setSnapshot(cached);
      } else {
        // If empty, fetch from backend and cache
        const fresh = await fetchSnapshot();
        await saveSnapshot(fresh);
        setSnapshot(fresh);
      }
    } catch {
      // Handled
    }
  };

  const handleRefreshSnapshot = async () => {
    setLoading(true);
    try {
      const fresh = await fetchSnapshot();
      await saveSnapshot(fresh);
      setSnapshot(fresh);
      toast.success('Downloaded & cached latest signed snapshot in IndexedDB');
    } catch (err: any) {
      toast.error('Failed to sync snapshot from network');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishNewSnapshot = async () => {
    setLoading(true);
    try {
      const res = await publishSnapshotOnChain();
      toast.success(`Published snapshot on Ethereum! Tx: ${res.txHash.slice(0, 10)}...`);
      handleRefreshSnapshot();
    } catch (err: any) {
      toast.error('Snapshot publication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClockSliderChange = async (hours: number) => {
    setClockOffsetHours(hours);
    await setSimulatedClockOffset(hours);
  };

  // Freshness calculation
  const getFreshness = () => {
    if (!snapshot) return { status: 'UNKNOWN', label: 'No Snapshot', color: 'gray' };
    const simulatedNow = Math.floor(Date.now() / 1000) + clockOffsetHours * 3600;
    const ageSeconds = simulatedNow - snapshot.generatedAt;
    const hoursOld = ageSeconds / 3600;

    if (hoursOld < 1) {
      return {
        status: 'FRESH',
        label: `Fresh (<1h old, age: ${Math.round(hoursOld * 60)}m)`,
        color: 'emerald',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      };
    } else if (hoursOld < 24) {
      return {
        status: 'STALE',
        label: `Stale (<24h old, age: ${hoursOld.toFixed(1)}h)`,
        color: 'amber',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      };
    } else {
      return {
        status: 'EXPIRED',
        label: `Expired (>24h old, age: ${hoursOld.toFixed(1)}h) - REJECTED`,
        color: 'rose',
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      };
    }
  };

  const freshness = getFreshness();

  const handleVerifyOffline = async () => {
    if (!verifyInput.trim()) return;
    if (!snapshot) {
      toast.error('No snapshot in IndexedDB cache');
      return;
    }

    setLoading(true);
    setOfflineResult(null);

    try {
      const parsed = JSON.parse(verifyInput);
      const simulatedNow = Math.floor(Date.now() / 1000) + clockOffsetHours * 3600;

      const res = await verifyWithSnapshot(
        parsed,
        snapshot,
        FALLBACK_CONFIG.snapshotPublisher,
        { asOfTimestamp: simulatedNow }
      );

      setOfflineResult(res);
      toast.success(`Verified via offline SnapshotSource: ${res.verdict}`);
    } catch (err: any) {
      toast.error(err.message || 'Offline verification error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <WifiOff className="h-7 w-7 text-amber-400" />
            <h1 className="text-3xl font-black tracking-tight text-surface-text">
              Offline Mode & Snapshot Verification (PWA)
            </h1>
          </div>
          <p className="mt-1 text-sm text-surface-muted max-w-2xl">
            Verify credentials in remote field environments or airplane mode
            with zero network connection. Backed by signed snapshots cached in
            IndexedDB.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefreshSnapshot}
            disabled={loading}
            className="flex items-center space-x-1.5 rounded-xl border border-surface-border bg-surface-card px-3.5 py-2 text-xs font-bold text-surface-text hover:bg-surface-elevated transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-brand-400" />
            <span>Sync Snapshot</span>
          </button>

          <button
            onClick={handlePublishNewSnapshot}
            disabled={loading}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 transition-all"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Publish On-Chain</span>
          </button>
        </div>
      </div>

      {/* Freshness & Simulation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Freshness Card */}
        <div className="lg:col-span-6 rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-surface-text">
              Cryptographic Snapshot Freshness
            </h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-mono font-bold uppercase border ${freshness.badge}`}
            >
              {freshness.status}
            </span>
          </div>

          <p className="text-xs text-surface-muted">
            The Trust Registry publishes signed state snapshots. Verifiers reject
            snapshots older than 24 hours to prevent stale revocation attacks (R10).
          </p>

          <div className="rounded-2xl border border-surface-border bg-surface-base p-4 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-surface-muted">Current Assessment:</span>
              <span className="text-surface-text font-bold">{freshness.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-muted">Trusted Publisher:</span>
              <span className="text-brand-400 truncate max-w-[220px]">
                {FALLBACK_CONFIG.snapshotPublisher}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-muted">Cached Institutions:</span>
              <span className="text-surface-text">
                {snapshot?.chainState?.institutions?.length || 3}
              </span>
            </div>
          </div>

          {freshness.status === 'EXPIRED' && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <span className="font-bold">Security Alert:</span> Snapshot has
              expired (&gt;24h). The verifier will automatically refuse acceptance
              under Rule R10.
            </div>
          )}
        </div>

        {/* Right: Clock Offset Simulator */}
        <div className="lg:col-span-6 rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-surface-text">
                Simulate Stale Cache Slider (Demo)
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              +{clockOffsetHours} Hours
            </span>
          </div>

          <p className="text-xs text-surface-muted">
            Slide the simulated verifier clock forward to demonstrate the transition
            from Fresh (&lt;1h) &rarr; Stale (&lt;24h) &rarr; Expired (&gt;24h).
          </p>

          <div className="space-y-3 py-2">
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={clockOffsetHours}
              onChange={(e) => handleClockSliderChange(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-surface-muted">
              <span>0h (Fresh: Green)</span>
              <span>12h (Stale: Amber)</span>
              <span>24h+ (Expired: Red)</span>
            </div>
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => handleClockSliderChange(0)}
              className="rounded-lg border border-surface-border bg-surface-base px-2.5 py-1 text-[11px] font-semibold text-surface-text hover:bg-surface-elevated"
            >
              Reset to 0h
            </button>
            <button
              onClick={() => handleClockSliderChange(6)}
              className="rounded-lg border border-surface-border bg-surface-base px-2.5 py-1 text-[11px] font-semibold text-amber-400 hover:bg-surface-elevated"
            >
              Set to 6h (Stale)
            </button>
            <button
              onClick={() => handleClockSliderChange(30)}
              className="rounded-lg border border-surface-border bg-surface-base px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:bg-surface-elevated"
            >
              Set to 30h (Expired)
            </button>
          </div>
        </div>
      </div>

      {/* Offline Verification Testing Workbench */}
      <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div>
            <h3 className="text-base font-bold text-surface-text">
              Offline Verification Test
            </h3>
            <p className="text-xs text-surface-muted">
              Tests verification strictly using the local snapshot without issuing any RPC network calls.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold text-emerald-400">
              SnapshotSource Engine
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <textarea
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-surface-border bg-surface-base p-4 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              onClick={handleVerifyOffline}
              disabled={loading}
              className="w-full rounded-2xl bg-brand-500 py-3 text-xs font-bold text-white shadow-md hover:bg-brand-600 transition-colors"
            >
              {loading ? 'Verifying Offline...' : 'Execute Offline Snapshot Verification'}
            </button>
          </div>

          <div className="lg:col-span-5">
            {offlineResult ? (
              <div
                className={`rounded-2xl border p-5 space-y-3 ${
                  offlineResult.verdict === Verdict.VALID
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : offlineResult.verdict === Verdict.VALID_WITH_WARNINGS
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Offline Verdict
                  </span>
                  <span className="text-2xl font-black font-mono">
                    {offlineResult.verdict}
                  </span>
                </div>
                <div className="text-xs font-mono">
                  Trust Score: {offlineResult.trustScore}/100
                </div>

                <div className="text-xs font-sans text-surface-text pt-2 border-t border-current/20 space-y-1">
                  <div className="font-bold">Rule Evaluations:</div>
                  {offlineResult.rules.map((r) => (
                    <div
                      key={r.ruleId}
                      className="flex justify-between font-mono text-[11px]"
                    >
                      <span>{r.ruleId}</span>
                      <span className="font-bold">{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border bg-surface-base/50 p-6 text-center h-full text-xs text-surface-muted">
                Run offline verification to evaluate against the local IndexedDB snapshot.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
