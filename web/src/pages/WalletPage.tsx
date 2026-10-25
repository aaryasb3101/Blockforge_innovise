import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchDemoHolders,
  fetchDemoSamples,
  createPresentation,
  encodeForQr,
} from '../lib/api';
import {
  saveCredential,
  getCredentials,
  CredentialRecord,
} from '../lib/storage';
import { QRCodeSVG } from 'qrcode.react';
import { Wallet as EthersWallet, hexlify, randomBytes } from 'ethers';
import {
  Wallet,
  Eye,
  EyeOff,
  ShieldCheck,
  QrCode,
  Copy,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  Download,
  PlusCircle,
  FileCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [holders, setHolders] = useState<any[]>([]);
  const [selectedHolderIndex, setSelectedHolderIndex] = useState<number>(0);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [selectedCred, setSelectedCred] = useState<any | null>(null);

  // Selective Disclosure State
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const [nonce, setNonce] = useState<string>('');
  const [presentation, setPresentation] = useState<any | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);

  useEffect(() => {
    // Load holders and seed credentials into IndexedDB if empty
    fetchDemoHolders().then(async (data) => {
      setHolders(data);
      const stored = await getCredentials();
      if (stored.length === 0) {
        const samples = await fetchDemoSamples();
        if (samples.valid) {
          await saveCredential(samples.valid);
          const updated = await getCredentials();
          setCredentials(updated);
          if (updated.length > 0) {
            handleSelectCredential(updated[0].credential);
          }
        }
      } else {
        setCredentials(stored);
        if (stored.length > 0) {
          handleSelectCredential(stored[0].credential);
        }
      }
    });

    generateNonce();
  }, []);

  const generateNonce = () => {
    const randomHex = hexlify(randomBytes(16));
    setNonce(randomHex);
  };

  const handleSelectCredential = (cred: any) => {
    setSelectedCred(cred);
    // By default, reveal degree/schema but hide sensitive fields like cgpa
    const initialRevealed: Record<string, boolean> = {};
    if (cred.fields) {
      Object.keys(cred.fields).forEach((k) => {
        initialRevealed[k] = k !== 'cgpa';
      });
    }
    setRevealedFields(initialRevealed);
    buildPresentation(cred, initialRevealed, nonce);
  };

  const toggleFieldReveal = (field: string) => {
    const updated = { ...revealedFields, [field]: !revealedFields[field] };
    setRevealedFields(updated);
    if (selectedCred) {
      buildPresentation(selectedCred, updated, nonce);
    }
  };

  const buildPresentation = async (
    cred: any,
    revealMap: Record<string, boolean>,
    nonceVal: string
  ) => {
    if (!cred) return;
    setGenerating(true);
    try {
      const activeHolder = holders[selectedHolderIndex];
      const holderWallet = activeHolder
        ? new EthersWallet(activeHolder.privateKey)
        : EthersWallet.createRandom();

      const fieldsToReveal = Object.keys(revealMap).filter((k) => revealMap[k]);

      const pres = await createPresentation({
        credential: cred,
        holderWallet,
        revealedFields: fieldsToReveal,
        nonce: nonceVal || hexlify(randomBytes(16)),
      });

      setPresentation(pres);
    } catch (err: any) {
      console.warn('Presentation creation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handlePresentToVerifier = () => {
    if (!presentation) {
      toast.error('Generate presentation first');
      return;
    }
    const jsonStr = JSON.stringify(presentation);
    sessionStorage.setItem('trustmesh_pending_presentation', jsonStr);
    navigate(`/verifier?sample=presentation`);
  };

  const currentHolder = holders[selectedHolderIndex] || {
    name: 'Alice Sharma (Alumni)',
    did: 'did:pkh:eip155:31337:0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="border-b border-surface-border pb-6">
        <div className="flex items-center space-x-2">
          <Wallet className="h-7 w-7 text-brand-400" />
          <h1 className="text-3xl font-black tracking-tight text-surface-text">
            Holder Privacy Wallet
          </h1>
        </div>
        <p className="mt-1 text-sm text-surface-muted max-w-2xl">
          Store credentials in local IndexedDB. Generate zero-knowledge selective
          disclosure presentations with cryptographic nonces to prevent replay
          attacks.
        </p>
      </div>

      {/* Holder Identity Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {holders.map((holder, idx) => (
          <div
            key={holder.did}
            onClick={() => {
              setSelectedHolderIndex(idx);
              if (selectedCred) {
                buildPresentation(selectedCred, revealedFields, nonce);
              }
            }}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              selectedHolderIndex === idx
                ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10'
                : 'border-surface-border bg-surface-card hover:bg-surface-elevated'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-surface-text">
                {holder.name}
              </span>
              <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-brand-400">
                Holder #{idx + 1}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-surface-muted truncate">
              {holder.did}
            </p>
          </div>
        ))}
      </div>

      {/* Credential Selector & Disclosure Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Credential List & Disclosure Checkboxes */}
        <div className="lg:col-span-5 space-y-6">
          {/* Stored Credentials Card */}
          <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h3 className="text-sm font-bold text-surface-text">
                Stored Credentials ({credentials.length})
              </h3>
              <span className="text-[11px] font-mono text-surface-muted">
                IndexedDB
              </span>
            </div>

            <div className="space-y-2">
              {credentials.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => handleSelectCredential(rec.credential)}
                  className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                    selectedCred?.id === rec.id
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-surface-border bg-surface-base hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-surface-text">
                      {rec.credential.schema || 'DegreeCredential'}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      Anchored
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-surface-muted truncate">
                    Issuer: {rec.credential.issuerDid}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Selective Disclosure Controls */}
          {selectedCred && (
            <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-surface-text">
                    Selective Disclosure Controls
                  </h3>
                  <p className="text-xs text-surface-muted">
                    Toggle which attributes are disclosed to the verifier.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {Object.keys(selectedCred.fields || {}).map((field) => {
                  const val = selectedCred.fields[field];
                  const isRevealed = revealedFields[field];
                  return (
                    <div
                      key={field}
                      onClick={() => toggleFieldReveal(field)}
                      className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-colors ${
                        isRevealed
                          ? 'border-brand-500/40 bg-brand-500/5'
                          : 'border-surface-border bg-surface-base opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {isRevealed ? (
                          <Eye className="h-4 w-4 text-brand-400" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-surface-muted" />
                        )}
                        <div>
                          <div className="text-xs font-bold text-surface-text">
                            {field}
                          </div>
                          <div className="text-[11px] font-mono text-surface-muted">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          isRevealed
                            ? 'bg-brand-500/10 text-brand-400'
                            : 'bg-surface-card text-surface-muted'
                        }`}
                      >
                        {isRevealed ? 'Disclosed' : 'Hidden'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Zero-Knowledge Predicate Highlight Card */}
              {selectedCred.predicates && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold">
                    <Sparkles className="h-4 w-4" />
                    <span>Active Predicate Claim (Zero Knowledge)</span>
                  </div>
                  <p className="text-xs text-amber-200">
                    Prove you scored honors (&ge; 8.0 CGPA) without revealing your exact CGPA score to the verifier!
                  </p>
                  <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-surface-base/80 p-2 rounded-lg">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>cgpa_gte_8: TRUE (Cryptographically Attested)</span>
                  </div>
                </div>
              )}

              {/* Nonce Generator */}
              <div className="pt-2">
                <label className="block text-xs font-bold uppercase text-surface-muted mb-1">
                  Presentation Challenge Nonce
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={nonce}
                    onChange={(e) => {
                      setNonce(e.target.value);
                      buildPresentation(selectedCred, revealedFields, e.target.value);
                    }}
                    className="flex-1 rounded-xl border border-surface-border bg-surface-base px-3 py-1.5 font-mono text-xs text-surface-text focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => {
                      generateNonce();
                      buildPresentation(selectedCred, revealedFields, nonce);
                    }}
                    className="rounded-xl border border-surface-border bg-surface-base px-3 py-1.5 text-xs font-semibold text-surface-text hover:bg-surface-elevated"
                  >
                    Random
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Two-Column Live Comparison & Presentation Output */}
        <div className="lg:col-span-7 space-y-6">
          {selectedCred ? (
            <div className="rounded-3xl border border-surface-border bg-surface-card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-surface-border pb-4">
                <div>
                  <h3 className="text-base font-bold text-surface-text">
                    Presentation Privacy Breakdown
                  </h3>
                  <p className="text-xs text-surface-muted">
                    Live comparison: attributes disclosed to verifier vs attributes kept secure in your wallet.
                  </p>
                </div>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center space-x-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-400 hover:bg-brand-500/20 transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span>Show QR</span>
                </button>
              </div>

              {/* Two-Column Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Column 1: Verifier Will See */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Eye className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Verifier Will See
                    </span>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    {Object.keys(selectedCred.fields || {})
                      .filter((k) => revealedFields[k])
                      .map((k) => (
                        <div
                          key={k}
                          className="flex justify-between border-b border-emerald-500/10 pb-1"
                        >
                          <span className="text-surface-muted">{k}:</span>
                          <span className="text-emerald-300 font-bold">
                            {String(selectedCred.fields[k])}
                          </span>
                        </div>
                      ))}

                    {/* Predicates in revealed */}
                    {selectedCred.predicates && (
                      <div className="flex justify-between border-b border-emerald-500/10 pb-1">
                        <span className="text-surface-muted">cgpa_gte_8:</span>
                        <span className="text-emerald-300 font-bold">true</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Hidden in Wallet */}
                <div className="rounded-2xl border border-surface-border bg-surface-base p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-surface-muted">
                    <Lock className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Hidden in Wallet
                    </span>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    {Object.keys(selectedCred.fields || {})
                      .filter((k) => !revealedFields[k])
                      .map((k) => (
                        <div
                          key={k}
                          className="flex justify-between border-b border-surface-border pb-1"
                        >
                          <span className="text-surface-muted">{k}:</span>
                          <span className="text-rose-400 font-bold">
                            [NEVER LEAVES WALLET]
                          </span>
                        </div>
                      ))}
                    {Object.keys(selectedCred.fields || {}).filter(
                      (k) => !revealedFields[k]
                    ).length === 0 && (
                      <div className="text-xs text-surface-muted italic">
                        All attributes currently revealed.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action: Present to Verifier */}
              <div className="pt-2">
                <button
                  onClick={handlePresentToVerifier}
                  className="w-full flex items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-500 py-3.5 text-xs font-bold text-white shadow-xl shadow-brand-500/20 hover:from-brand-500 hover:to-emerald-400 active:scale-[0.99] transition-all"
                >
                  <span>Present to Decentralized Verifier</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Presentation JSON payload */}
              {presentation && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-surface-muted">
                      Presentation Payload (RFC 8785 Canonicalized)
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          JSON.stringify(presentation, null, 2)
                        );
                        toast.success('Presentation JSON copied');
                      }}
                      className="text-xs text-brand-400 hover:underline flex items-center space-x-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="max-h-52 overflow-y-auto rounded-2xl bg-surface-base p-4 font-mono text-[11px] text-surface-muted border border-surface-border whitespace-pre-wrap">
                    {JSON.stringify(presentation, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-surface-border bg-surface-card/40 p-12 text-center h-full min-h-[380px]">
              <FileCheck className="h-16 w-16 text-surface-muted/40 mb-3" />
              <h3 className="text-base font-bold text-surface-text">
                No Credential Selected
              </h3>
              <p className="mt-1 text-xs text-surface-muted max-w-xs">
                Select a credential from the list to preview privacy controls and generate presentations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Presentation QR Modal */}
      {showQrModal && presentation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-surface-border bg-surface-card p-6 text-center space-y-4">
            <h3 className="text-base font-bold text-surface-text">
              Presentation QR Code
            </h3>
            <p className="text-xs text-surface-muted">
              Point the Verifier camera at this QR code for instant zero-knowledge verification.
            </p>
            <div className="flex justify-center p-4 bg-white rounded-2xl">
              <QRCodeSVG value={encodeForQr(presentation)} size={220} />
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
