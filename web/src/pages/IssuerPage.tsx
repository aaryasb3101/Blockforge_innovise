import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchConfig,
  fetchInstitutions,
  issueCredentialBackend,
  issueBatchBackend,
  revokeCredentialBackend,
  suspendCredentialBackend,
  reinstateCredentialBackend,
  tryRevokeAsRogue,
  AppConfig,
  FALLBACK_CONFIG,
  encodeForQr,
} from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  FileCheck,
  Layers,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Copy,
  Download,
  QrCode,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const IssuerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedInstDid, setSelectedInstDid] = useState<string>('did:trustmesh:iit-bombay');

  // Mode: single vs batch
  const [issueMode, setIssueMode] = useState<'single' | 'batch'>('single');

  // Single Form State
  const [schema, setSchema] = useState<string>('DegreeCredential');
  const [holderDid, setHolderDid] = useState<string>(
    'did:pkh:eip155:31337:0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  );
  const [studentName, setStudentName] = useState<string>('Apurva Sharma');
  const [degreeName, setDegreeName] = useState<string>('B.Tech Computer Science');
  const [cgpa, setCgpa] = useState<number>(9.4);
  const [cgpaGte8, setCgpaGte8] = useState<boolean>(true);
  const [ageGte18, setAgeGte18] = useState<boolean>(true);

  // Batch Form State
  const [batchCsv, setBatchCsv] = useState<string>(
    `studentName,degree,cgpa,holderDid\nAlice Sharma,B.Tech CS,9.2,did:pkh:eip155:31337:0x70997970C51812dc3A010C7d01b50e0d17dc79C8\nBob Verma,B.Tech EE,8.7,did:pkh:eip155:31337:0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC\nCharlie Kumar,B.Tech Mech,7.9,did:pkh:eip155:31337:0x90F79bf6EB2c4f870365E785982E1f101E93b906`
  );

  // Lifecycle State
  const [lifecycleCredId, setLifecycleCredId] = useState<string>('');
  const [revokeReason, setRevokeReason] = useState<number>(1); // 1 = Misconduct
  const [lifecycleLoading, setLifecycleLoading] = useState<boolean>(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  // Issued Output
  const [loading, setLoading] = useState<boolean>(false);
  const [issuedCred, setIssuedCred] = useState<any | null>(null);
  const [issuedBatch, setIssuedBatch] = useState<any | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  useEffect(() => {
    fetchConfig().then(setConfig);
    fetchInstitutions().then((data) => {
      setInstitutions(data);
      if (data.length > 0 && !selectedInstDid) {
        setSelectedInstDid(data[0].did);
      }
    });

    if (searchParams.get('revert') === 'demo') {
      // Pre-fill demo for cross-institution revert
      setLifecycleCredId('0x4b789120...active-degree-cred');
    }
  }, [searchParams]);

  const handleSingleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIssuedCred(null);
    setTxHash(null);

    const fields: Record<string, any> = {
      studentName,
      cgpa,
      issuanceDate: Math.floor(Date.now() / 1000),
    };

    if (schema === 'DegreeCredential') {
      fields.degree = degreeName;
      fields.graduated = true;
    } else if (schema === 'InternshipCredential') {
      fields.company = 'Acme Labs';
      fields.role = 'Software Research Fellow';
      fields.durationMonths = 6;
    } else {
      fields.transcriptCredits = 160;
      fields.honors = true;
    }

    const predicates: Record<string, boolean> = {};
    if (cgpaGte8) predicates['cgpa_gte_8'] = cgpa >= 8;
    if (ageGte18) predicates['age_gte_18'] = true;

    try {
      const res = await issueCredentialBackend({
        schema,
        holderDid,
        fields,
        predicates,
      });

      setIssuedCred(res.credential);
      setTxHash(res.txHash);
      setLifecycleCredId(res.credential.id);
      toast.success('Credential minted & anchored on-chain!');
    } catch (err: any) {
      toast.error(err.message || 'Issuance failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchGenerate = (count: number) => {
    const lines = ['studentName,degree,cgpa,holderDid'];
    for (let i = 1; i <= count; i++) {
      lines.push(
        `Student_${i},B.Tech Engineering,${(7.5 + (i % 25) * 0.1).toFixed(1)},did:pkh:eip155:31337:0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
      );
    }
    setBatchCsv(lines.join('\n'));
    toast.success(`Generated ${count} student credential records`);
  };

  const handleBatchIssue = async () => {
    setLoading(true);
    setIssuedBatch(null);
    setTxHash(null);

    try {
      const lines = batchCsv.trim().split('\n');
      if (lines.length <= 1) {
        toast.error('CSV must have a header line and at least one student record');
        return;
      }
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(',');
        return {
          holderDid: parts[3]?.trim() || holderDid,
          schema: 'DegreeCredential',
          fields: {
            studentName: parts[0]?.trim(),
            degree: parts[1]?.trim(),
            cgpa: parseFloat(parts[2]?.trim() || '8.0'),
          },
          predicates: {
            cgpa_gte_8: parseFloat(parts[2]?.trim() || '8.0') >= 8.0,
          },
        };
      });

      const res = await issueBatchBackend({ rows });
      setIssuedBatch(res);
      setTxHash(res.txHash);
      toast.success(
        `Batch anchored! Root committed to Trust Registry for ${res.credentials.length} credentials`
      );
    } catch (err: any) {
      toast.error(err.message || 'Batch issuance failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!lifecycleCredId.trim()) {
      toast.error('Enter credential ID to revoke');
      return;
    }
    setLifecycleLoading(true);
    setRevertError(null);
    try {
      const res = await revokeCredentialBackend({
        credentialId: lifecycleCredId,
        reasonCode: Number(revokeReason),
      });
      toast.success(`Credential revoked on-chain! Tx: ${res.txHash.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error(err.message || 'Revocation failed');
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!lifecycleCredId.trim()) return;
    setLifecycleLoading(true);
    setRevertError(null);
    try {
      const res = await suspendCredentialBackend(lifecycleCredId);
      toast.success(`Credential suspended! Tx: ${res.txHash.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error(err.message || 'Suspension failed');
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleReinstate = async () => {
    if (!lifecycleCredId.trim()) return;
    setLifecycleLoading(true);
    setRevertError(null);
    try {
      const res = await reinstateCredentialBackend(lifecycleCredId);
      toast.success(`Credential reinstated! Tx: ${res.txHash.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error(err.message || 'Reinstatement failed');
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleTryRevokeAsRogue = async () => {
    setLifecycleLoading(true);
    setRevertError(null);
    try {
      await tryRevokeAsRogue(
        lifecycleCredId || '0x4b78912065842839218392812938129381293812938129381293812938129381'
      );
    } catch (err: any) {
      const errName = err.errorName || 'NotIssuerOfCredential';
      setRevertError(
        `Smart contract reverted with custom error: ${errName}(credentialId, rogueCaller, authorizedIssuer)`
      );
      toast.error(`Blocked by chain! Revert: ${errName}`, {
        duration: 5000,
      });
    } finally {
      setLifecycleLoading(false);
    }
  };

  const copyCredJson = () => {
    navigator.clipboard.writeText(JSON.stringify(issuedCred, null, 2));
    toast.success('Credential JSON copied to clipboard');
  };

  const downloadCredJson = () => {
    const blob = new Blob([JSON.stringify(issuedCred, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credential-${issuedCred.id.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Credential JSON downloaded');
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6">
        <div className="flex items-center space-x-2">
          <Building2 className="h-7 w-7 text-brand-400" />
          <h1 className="text-3xl font-black tracking-tight text-surface-text">
            Institutional Issuer Console
          </h1>
        </div>
        <p className="mt-1 text-sm text-surface-muted max-w-2xl">
          Issue cryptographically signed, Merkle-committed credentials. Commit
          proof roots on-chain in single or batch modes without exposing student PII.
        </p>
      </div>

      {/* Institution Picker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {institutions.map((inst) => (
          <div
            key={inst.did}
            onClick={() => setSelectedInstDid(inst.did)}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              selectedInstDid === inst.did
                ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10'
                : 'border-surface-border bg-surface-card hover:bg-surface-elevated'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-surface-text">
                {inst.name || inst.did}
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-surface-muted truncate">
              {inst.did}
            </p>
            <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-surface-muted">
              <span>Approvals: 2/2</span>
              <span>Signer: 0xf39F...2266</span>
            </div>
          </div>
        ))}
      </div>

      {/* Issuance Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Mode Tabs & Forms */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex rounded-xl border border-surface-border bg-surface-card p-1">
            <button
              onClick={() => setIssueMode('single')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                issueMode === 'single'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              Single Credential Issuance
            </button>
            <button
              onClick={() => setIssueMode('batch')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                issueMode === 'batch'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              Batch Merkle Tree Issuance
            </button>
          </div>

          {issueMode === 'single' ? (
            <form
              onSubmit={handleSingleIssue}
              className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-surface-text">
                Credential Definition & Predicate Proofs
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Credential Schema
                  </label>
                  <select
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs font-semibold text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="DegreeCredential">DegreeCredential</option>
                    <option value="InternshipCredential">InternshipCredential</option>
                    <option value="TranscriptCredential">TranscriptCredential</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                  Holder DID (Recipient Public Key)
                </label>
                <input
                  type="text"
                  value={holderDid}
                  onChange={(e) => setHolderDid(e.target.value)}
                  className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Degree / Specialization
                  </label>
                  <input
                    type="text"
                    value={degreeName}
                    onChange={(e) => setDegreeName(e.target.value)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                    Cumulative GPA (CGPA)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={cgpa}
                    onChange={(e) => setCgpa(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Predicate Toggles */}
              <div className="rounded-2xl border border-surface-border bg-surface-base p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-surface-muted">
                  Zero-Knowledge Predicate Claims
                </span>
                <p className="text-xs text-surface-muted">
                  Embed verifiable mathematical predicates allowing holders to prove conditions without revealing the raw values.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-surface-text">
                    <input
                      type="checkbox"
                      checked={cgpaGte8}
                      onChange={(e) => setCgpaGte8(e.target.checked)}
                      className="rounded accent-brand-500"
                    />
                    <span>Prove CGPA &ge; 8.0 (Honors)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-surface-text">
                    <input
                      type="checkbox"
                      checked={ageGte18}
                      onChange={(e) => setAgeGte18(e.target.checked)}
                      className="rounded accent-brand-500"
                    />
                    <span>Prove Age &ge; 18 (Adult)</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 hover:to-emerald-400 transition-all disabled:opacity-50"
              >
                {loading ? 'Minting & Anchoring...' : 'Issue & Anchor Credential on Blockchain'}
              </button>
            </form>
          ) : (
            <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-surface-text">
                    Batch Merkle Tree Issuance
                  </h3>
                  <p className="text-xs text-surface-muted">
                    Paste CSV rows or generate test rows to compute a single Keccak-256 Merkle root.
                  </p>
                </div>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => handleBatchGenerate(5)}
                    className="rounded-lg border border-surface-border bg-surface-base px-2 py-1 text-[11px] font-semibold text-surface-text hover:bg-surface-elevated"
                  >
                    +5 Rows
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchGenerate(25)}
                    className="rounded-lg border border-surface-border bg-surface-base px-2 py-1 text-[11px] font-semibold text-surface-text hover:bg-surface-elevated"
                  >
                    +25 Rows
                  </button>
                </div>
              </div>

              <textarea
                value={batchCsv}
                onChange={(e) => setBatchCsv(e.target.value)}
                rows={8}
                className="w-full rounded-2xl border border-surface-border bg-surface-base p-4 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
              />

              <button
                type="button"
                onClick={handleBatchIssue}
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 hover:to-emerald-400 transition-all disabled:opacity-50"
              >
                {loading ? 'Committing Batch Root...' : 'Anchor Batch Merkle Root on Blockchain'}
              </button>
            </div>
          )}

          {/* Revoke / Suspend / Reinstate Section */}
          <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-surface-text">
                Credential Lifecycle Management
              </h3>
            </div>
            <p className="text-xs text-surface-muted">
              Revoke, suspend, or reinstate credentials. Smart contracts verify that only the authentic issuing institution can modify state.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-surface-muted mb-1">
                  Credential ID (Hash)
                </label>
                <input
                  type="text"
                  value={lifecycleCredId}
                  onChange={(e) => setLifecycleCredId(e.target.value)}
                  placeholder="0x... credential ID"
                  className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-surface-muted mb-1">
                  Revocation Reason
                </label>
                <select
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(Number(e.target.value))}
                  className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-xs font-semibold text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value={1}>1: Academic Misconduct</option>
                  <option value={2}>2: Administrative Error</option>
                  <option value={3}>3: Student Expelled</option>
                  <option value={4}>4: Key Compromise</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleRevoke}
                disabled={lifecycleLoading}
                className="flex items-center space-x-1 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                <span>Revoke Credential</span>
              </button>

              <button
                type="button"
                onClick={handleSuspend}
                disabled={lifecycleLoading}
                className="flex items-center space-x-1 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <span>Suspend (Reversible)</span>
              </button>

              <button
                type="button"
                onClick={handleReinstate}
                disabled={lifecycleLoading}
                className="flex items-center space-x-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <span>Reinstate</span>
              </button>
            </div>

            {/* Critical Revert Demonstration */}
            <div className="pt-4 border-t border-surface-border">
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-400">
                    <ShieldAlert className="h-4 w-4" />
                    <span>Attack Vector Simulation: Unauthorized Revocation</span>
                  </div>
                </div>
                <p className="text-xs text-surface-muted">
                  Simulate another institution attempting to revoke IIT Bombay's credential. The EVM contract enforces authorization and reverts on-chain.
                </p>
                <button
                  type="button"
                  onClick={handleTryRevokeAsRogue}
                  disabled={lifecycleLoading}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-500 active:scale-95 transition-all"
                >
                  ⚡ Try revoking as another institution (Simulate Revert)
                </button>

                {revertError && (
                  <div className="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/20 p-3 text-xs font-mono text-rose-200">
                    {revertError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Issued Credential Inspection & QR */}
        <div className="lg:col-span-5 space-y-6">
          {issuedCred || issuedBatch ? (
            <div className="space-y-4 rounded-3xl border border-surface-border bg-surface-card p-6">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-surface-text">
                    {issuedBatch ? 'Batch Successfully Anchored' : 'Credential Minted'}
                  </h3>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={copyCredJson}
                    className="p-1.5 rounded-lg border border-surface-border hover:bg-surface-elevated text-surface-muted hover:text-surface-text"
                    title="Copy JSON"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={downloadCredJson}
                    className="p-1.5 rounded-lg border border-surface-border hover:bg-surface-elevated text-surface-muted hover:text-surface-text"
                    title="Download JSON"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="p-1.5 rounded-lg border border-surface-border hover:bg-surface-elevated text-brand-400"
                    title="Display QR"
                  >
                    <QrCode className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* On-Chain Status Card */}
              <div className="rounded-2xl bg-surface-base p-4 border border-surface-border space-y-2 text-xs font-mono">
                <div>
                  <span className="text-surface-muted block text-[10px] uppercase font-sans">
                    On-Chain Tx Hash
                  </span>
                  <span className="text-emerald-400 break-all">{txHash}</span>
                </div>
                <div>
                  <span className="text-surface-muted block text-[10px] uppercase font-sans">
                    Anchored Merkle Root
                  </span>
                  <span className="text-surface-text break-all">
                    {issuedCred?.merkleRoot || issuedBatch?.merkleRoot}
                  </span>
                </div>
              </div>

              {/* JSON preview */}
              <pre className="max-h-80 overflow-y-auto rounded-2xl bg-surface-base p-4 font-mono text-[11px] text-surface-muted border border-surface-border whitespace-pre-wrap">
                {JSON.stringify(issuedCred || issuedBatch, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-surface-border bg-surface-card/40 p-12 text-center h-full min-h-[380px]">
              <FileCheck className="h-16 w-16 text-surface-muted/40 mb-3" />
              <h3 className="text-base font-bold text-surface-text">
                Ready to Mint Credentials
              </h3>
              <p className="mt-1 text-xs text-surface-muted max-w-xs">
                Fill the form on the left to sign and commit a credential or batch to the Trust Registry.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQrModal && issuedCred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-surface-border bg-surface-card p-6 text-center space-y-4">
            <h3 className="text-base font-bold text-surface-text">
              Credential QR Code
            </h3>
            <p className="text-xs text-surface-muted">
              Scan with the Verifier camera or any standard wallet.
            </p>
            <div className="flex justify-center p-4 bg-white rounded-2xl">
              <QRCodeSVG value={encodeForQr(issuedCred)} size={220} />
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white hover:bg-brand-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
