import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  VerificationResult,
  Verdict,
  RuleEvaluation,
  RuleStatus,
} from '@shared/types';
import {
  verifyWithBackend,
  verifyWithBrowser,
  fetchDemoSamples,
  fetchConfig,
  AppConfig,
  FALLBACK_CONFIG,
  decodeFromQr,
  fromVerifiableCredential,
} from '../lib/api';
import { TrustGauge } from '../components/TrustGauge';
import { ForensicsTable } from '../components/ForensicsTable';
import { ReceiptModal } from '../components/ReceiptModal';
import { QrScannerModal } from '../components/QrScannerModal';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Upload,
  Camera,
  Download,
  Copy,
  ExternalLink,
  Sliders,
  Check,
  ArrowRightLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const VerifierPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [rawInput, setRawInput] = useState<string>('');
  const [engine, setEngine] = useState<'backend' | 'browser'>('browser');
  const [compareEngines, setCompareEngines] = useState(false);
  const [nonce, setNonce] = useState<string>('');
  const [asOfTimestamp, setAsOfTimestamp] = useState<number | undefined>(undefined);
  const [enableTimeTravel, setEnableTimeTravel] = useState(false);

  // Results
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [backendResult, setBackendResult] = useState<VerificationResult | null>(null);
  const [browserResult, setBrowserResult] = useState<VerificationResult | null>(null);
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});

  // Modals
  const [showReceipt, setShowReceipt] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [samples, setSamples] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchConfig().then(setConfig);
    fetchDemoSamples().then((data) => {
      setSamples(data);
      const sampleParam = searchParams.get('sample');
      if (sampleParam && data[sampleParam]) {
        loadSample(sampleParam, data);
      } else if (data.valid) {
        setRawInput(JSON.stringify(data.valid, null, 2));
      }
    });
  }, [searchParams]);

  const loadSample = (key: string, sampleData = samples) => {
    const cred = sampleData[key];
    if (cred) {
      setRawInput(JSON.stringify(cred, null, 2));
      toast.success(`Loaded sample: ${key}`);
      // Auto run verify on sample selection for instant feedback
      setTimeout(() => {
        handleVerify(JSON.stringify(cred, null, 2));
      }, 50);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        JSON.parse(text); // validate JSON
        setRawInput(text);
        toast.success('Credential JSON loaded');
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleQrScanned = (decoded: string) => {
    try {
      if (decoded.startsWith('{')) {
        setRawInput(decoded);
      } else {
        const parsed = decodeFromQr(decoded);
        setRawInput(JSON.stringify(parsed, null, 2));
      }
      toast.success('Decoded QR credential payload');
      handleVerify();
    } catch {
      toast.error('Unrecognized QR payload format');
    }
  };

  const handleVerify = async (customInput?: string) => {
    const textToVerify = customInput || rawInput;
    if (!textToVerify.trim()) {
      toast.error('Please paste or upload a credential JSON first');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(textToVerify);
      if (parsed['@context'] && parsed.type) {
        // W3C format
        parsed = fromVerifiableCredential(parsed);
      }
    } catch {
      toast.error('Input is not valid JSON');
      return;
    }

    setLoading(true);
    const opts = {
      asOfTimestamp: enableTimeTravel ? asOfTimestamp : undefined,
      expectedNonce: nonce.trim() ? nonce.trim() : undefined,
    };

    try {
      if (compareEngines) {
        // Run both engines side-by-side
        const [backRes, browRes] = await Promise.allSettled([
          verifyWithBackend(parsed, opts),
          verifyWithBrowser(parsed, config.rpcUrl, config.registry, opts),
        ]);

        const bRes = backRes.status === 'fulfilled' ? backRes.value : null;
        const brRes = browRes.status === 'fulfilled' ? browRes.value : null;

        setBackendResult(bRes);
        setBrowserResult(brRes);
        setResult(engine === 'backend' ? bRes : brRes || bRes);
        toast.success('Dual verification complete');
      } else if (engine === 'backend') {
        const res = await verifyWithBackend(parsed, opts);
        setResult(res);
        setBackendResult(res);
      } else {
        const res = await verifyWithBrowser(
          parsed,
          config.rpcUrl,
          config.registry,
          opts
        );
        setResult(res);
        setBrowserResult(res);
      }
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleRuleExpand = (id: string) => {
    setExpandedRules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const parsedCred = React.useMemo(() => {
    try {
      return JSON.parse(rawInput);
    } catch {
      return null;
    }
  }, [rawInput]);

  return (
    <div className="space-y-8 pb-16">
      {/* Page Title & Mission */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-black tracking-tight text-surface-text">
              Decentralized Verifier
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-400 border border-emerald-500/20">
              R1 - R10 Engine
            </span>
          </div>
          <p className="mt-1 text-sm text-surface-muted max-w-2xl">
            Cryptographically verify credentials and presentations directly
            against the on-chain Trust Registry. Zero contact with the issuer.
            Zero personal data on-chain.
          </p>
        </div>

        {/* Sample Loader */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold uppercase text-surface-muted">
            Quick Sample:
          </label>
          <select
            onChange={(e) => loadSample(e.target.value)}
            defaultValue=""
            className="rounded-xl border border-surface-border bg-surface-card px-3 py-2 text-xs font-semibold text-surface-text focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="" disabled>
              Select scenario...
            </option>
            <option value="valid">1. Valid Credential (100%)</option>
            <option value="tampered">2. Tampered CGPA (Forensics)</option>
            <option value="rogue">3. Rogue Issuer (Unapproved)</option>
            <option value="revoked">4. Revoked Credential</option>
            <option value="expired">5. Expired Credential</option>
            <option value="suspended">6. Suspended Credential</option>
            <option value="compromised-before">7. Pre-Compromise (Valid)</option>
            <option value="compromised-after">8. Post-Compromise (Suspicious)</option>
            <option value="batch">9. Merkle Batch Proof</option>
          </select>
        </div>
      </div>

      {/* Input Section & Engine Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Payload */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-surface-muted">
              Credential or Presentation JSON
            </span>
            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-1 cursor-pointer rounded-lg border border-surface-border bg-surface-card px-2.5 py-1 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center space-x-1 rounded-lg border border-surface-border bg-surface-card px-2.5 py-1 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors"
              >
                <Camera className="h-3.5 w-3.5 text-brand-400" />
                <span>Scan QR</span>
              </button>

              <button
                onClick={() => setRawInput('')}
                className="rounded-lg p-1 text-surface-muted hover:text-surface-text transition-colors"
                title="Clear"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Paste credential JSON or presentation here..."
            rows={14}
            className="w-full rounded-2xl border border-surface-border bg-surface-card p-4 font-mono text-xs text-surface-text placeholder:text-surface-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          {/* Engine Selector & Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-surface-border bg-surface-card p-4">
            <div>
              <label className="block text-xs font-bold uppercase text-surface-muted mb-2">
                Verification Engine
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setEngine('browser')}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                    engine === 'browser'
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'border border-surface-border bg-surface-base text-surface-muted hover:text-surface-text'
                  }`}
                >
                  Browser Direct RPC
                </button>
                <button
                  type="button"
                  onClick={() => setEngine('backend')}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                    engine === 'backend'
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'border border-surface-border bg-surface-base text-surface-muted hover:text-surface-text'
                  }`}
                >
                  Backend Node
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-surface-muted mb-2">
                Dual-Engine Comparison
              </label>
              <button
                type="button"
                onClick={() => setCompareEngines(!compareEngines)}
                className={`w-full flex items-center justify-center space-x-2 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
                  compareEngines
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-surface-border bg-surface-base text-surface-muted hover:text-surface-text'
                }`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>
                  {compareEngines ? 'Compare Engines Active' : 'Enable Compare Mode'}
                </span>
              </button>
            </div>

            {/* Optional Nonce */}
            <div>
              <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                Expected Nonce (Optional)
              </label>
              <input
                type="text"
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                placeholder="0x... or session nonce"
                className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-1.5 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Time Travel Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase text-surface-muted">
                  Time-Travel Slider
                </label>
                <button
                  onClick={() => setEnableTimeTravel(!enableTimeTravel)}
                  className="text-[11px] font-bold text-brand-400 hover:underline"
                >
                  {enableTimeTravel ? 'Disable' : 'Enable'}
                </button>
              </div>
              {enableTimeTravel ? (
                <div className="space-y-1">
                  <input
                    type="range"
                    min={Math.floor(Date.now() / 1000) - 86400 * 30}
                    max={Math.floor(Date.now() / 1000) + 86400 * 30}
                    value={asOfTimestamp || Math.floor(Date.now() / 1000)}
                    onChange={(e) => setAsOfTimestamp(Number(e.target.value))}
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                  <div className="text-[10px] font-mono text-surface-muted text-right">
                    As of:{' '}
                    {new Date((asOfTimestamp || Date.now() / 1000) * 1000).toLocaleDateString()}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-surface-muted py-1">
                  Evaluating at current timestamp (Real-time)
                </div>
              )}
            </div>
          </div>

          {/* Big Action Button */}
          <button
            onClick={() => handleVerify()}
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3.5 text-sm font-black tracking-wide text-white shadow-xl shadow-brand-500/25 hover:from-brand-500 hover:to-emerald-400 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Cryptographically Verifying on Blockchain...</span>
              </span>
            ) : (
              'Verify Credential Authenticity'
            )}
          </button>
        </div>

        {/* Right Column: Verdict Banner & Trust Score */}
        <div className="lg:col-span-5 space-y-6">
          {result ? (
            <div className="space-y-6">
              {/* Massive Verdict Banner */}
              <div
                className={`rounded-3xl border p-6 shadow-xl transition-all ${
                  result.verdict === Verdict.VALID
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : result.verdict === Verdict.VALID_WITH_WARNINGS
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                    : result.verdict === Verdict.SUSPICIOUS
                    ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                      Blockchain Verdict
                    </span>
                    <h2 className="text-4xl font-black tracking-tight mt-1">
                      {result.verdict}
                    </h2>
                  </div>
                  {result.verdict === Verdict.VALID ? (
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                  ) : result.verdict === Verdict.VALID_WITH_WARNINGS ? (
                    <AlertTriangle className="h-10 w-10 text-amber-400" />
                  ) : result.verdict === Verdict.SUSPICIOUS ? (
                    <AlertOctagon className="h-10 w-10 text-orange-400" />
                  ) : (
                    <XCircle className="h-10 w-10 text-rose-500" />
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed opacity-90 text-surface-text">
                  {result.verdict === Verdict.VALID
                    ? 'All 10 cryptographic constraints satisfied. Signer key is authorized by accredited institution, Merkle root is anchored on-chain, and no revocation is recorded.'
                    : result.verdict === Verdict.VALID_WITH_WARNINGS
                    ? 'Credential is valid but non-fatal warnings were detected (e.g. credential near expiration date or historical key rotation).'
                    : result.verdict === Verdict.SUSPICIOUS
                    ? 'Suspicious activity detected! Signer key was reported compromised around issuance timestamp.'
                    : 'Credential verification failed. One or more mandatory cryptographic rules failed (tampered data, rogue issuer, or active revocation).'}
                </p>

                {/* Compare Result Pill */}
                {compareEngines && backendResult && browserResult && (
                  <div className="mt-4 pt-3 border-t border-current/20 flex items-center justify-between text-xs font-bold">
                    <span>Engine Parity Check:</span>
                    {backendResult.verdict === browserResult.verdict ? (
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <Check className="h-4 w-4" />
                        <span>Backend and browser agree ✔</span>
                      </span>
                    ) : (
                      <span className="text-rose-400">
                        Mismatch: Backend ({backendResult.verdict}) ≠ Browser (
                        {browserResult.verdict})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Gauge & Quick Actions */}
              <div className="rounded-3xl border border-surface-border bg-surface-card p-6 flex flex-col items-center">
                <TrustGauge
                  score={result.trustScore}
                  verdict={result.verdict}
                  size={190}
                />

                <div className="mt-4 flex w-full space-x-3">
                  <button
                    onClick={() => setShowReceipt(true)}
                    className="flex-1 flex items-center justify-center space-x-1.5 rounded-xl border border-surface-border bg-surface-base py-2.5 text-xs font-bold text-surface-text hover:bg-surface-elevated transition-colors"
                  >
                    <Download className="h-4 w-4 text-brand-400" />
                    <span>Export Receipt</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                      toast.success('Verification result copied');
                    }}
                    className="flex items-center justify-center space-x-1.5 rounded-xl border border-surface-border bg-surface-base px-3 py-2.5 text-xs font-semibold text-surface-muted hover:text-surface-text transition-colors"
                    title="Copy Result JSON"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-surface-border bg-surface-card/40 p-12 text-center h-full min-h-[360px]">
              <ShieldCheck className="h-16 w-16 text-surface-muted/40 mb-3" />
              <h3 className="text-base font-bold text-surface-text">
                No Verification Result Yet
              </h3>
              <p className="mt-1 text-xs text-surface-muted max-w-xs">
                Select a sample above or paste a credential payload to run the R1..R10 decentralized verification engine.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* R1 - R10 Rule Timeline */}
      {result && (
        <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-4">
            <div>
              <h3 className="text-lg font-bold text-surface-text">
                Cryptographic Rule Timeline (R1 - R10)
              </h3>
              <p className="text-xs text-surface-muted">
                Every rule is evaluated deterministically against on-chain smart contracts and Merkle proofs.
              </p>
            </div>
            <span className="text-xs font-mono text-surface-muted">
              {result.rules.filter((r) => r.status === RuleStatus.PASS).length}/
              {result.rules.length} Rules Passed
            </span>
          </div>

          <div className="divide-y divide-surface-border">
            {result.rules.map((rule) => {
              const isExpanded = expandedRules[rule.ruleId];
              return (
                <div key={rule.ruleId} className="py-3.5 space-y-2">
                  <div
                    onClick={() => toggleRuleExpand(rule.ruleId)}
                    className="flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-mono font-bold ${
                          rule.status === RuleStatus.PASS
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : rule.status === RuleStatus.WARN
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : rule.status === RuleStatus.FAIL
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-surface-base text-surface-muted'
                        }`}
                      >
                        {rule.status === RuleStatus.PASS ? (
                          <Check className="h-4 w-4" />
                        ) : rule.status === RuleStatus.FAIL ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-surface-text">
                            {rule.ruleId}
                          </span>
                          <span className="text-xs text-surface-muted font-sans">
                            {rule.reason}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                          rule.status === RuleStatus.PASS
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : rule.status === RuleStatus.WARN
                            ? 'bg-amber-500/10 text-amber-400'
                            : rule.status === RuleStatus.FAIL
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-surface-base text-surface-muted'
                        }`}
                      >
                        {rule.status}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-surface-muted" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-surface-muted group-hover:text-surface-text" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Evidence */}
                  {isExpanded && rule.evidence && (
                    <div className="mt-2 rounded-xl bg-surface-base p-4 font-mono text-xs text-surface-muted border border-surface-border">
                      <div className="text-[10px] uppercase font-bold text-surface-text mb-1">
                        Cryptographic Evidence Payload:
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(rule.evidence, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Forensics Decomposition Panel */}
      {parsedCred && (
        <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-surface-text">
              Forensics Decomposition Panel
            </h3>
            <p className="text-xs text-surface-muted">
              Inspect leaf hashes, salts, and verify tamper resistance at the individual field level.
            </p>
          </div>
          <ForensicsTable credential={parsedCred} rules={result?.rules} />
        </div>
      )}

      {/* Receipts & Scanner Modals */}
      {result && (
        <ReceiptModal
          isOpen={showReceipt}
          onClose={() => setShowReceipt(false)}
          result={result}
          credentialData={parsedCred}
          engineName={engine === 'browser' ? 'Browser Direct RPC' : 'Backend Node'}
        />
      )}

      <QrScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleQrScanned}
      />
    </div>
  );
};
