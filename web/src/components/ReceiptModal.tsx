import React from 'react';
import { VerificationResult, Verdict } from '@shared/types';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  Printer,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: VerificationResult;
  credentialData?: any;
  engineName?: string;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  result,
  credentialData,
  engineName = 'Browser Direct RPC Engine',
}) => {
  if (!isOpen) return null;

  const receiptData = {
    receiptId: `REC-${Date.now()}`,
    verifiedAt: new Date().toISOString(),
    verdict: result.verdict,
    trustScore: result.trustScore,
    engine: engineName,
    credentialId: credentialData?.id || 'N/A',
    schema: credentialData?.schema || 'DegreeCredential',
    issuerDid: credentialData?.issuerDid || 'N/A',
    merkleRoot: credentialData?.merkleProof?.root || 'N/A',
    rules: result.rules,
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(receiptData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trustmesh-receipt-${receiptData.receiptId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Verification receipt downloaded');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(receiptData, null, 2));
    toast.success('Receipt JSON copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-card p-6 shadow-2xl transition-all my-8">
        {/* Action Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-6 w-6 text-brand-400" />
            <h3 className="text-lg font-bold text-surface-text">
              Cryptographic Verification Receipt
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1 rounded-lg border border-surface-border bg-surface-base px-2.5 py-1.5 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors"
              title="Print Receipt"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1 rounded-lg border border-surface-border bg-surface-base px-2.5 py-1.5 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors"
              title="Download JSON"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-surface-muted hover:text-surface-text hover:bg-surface-elevated transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div id="printable-receipt" className="py-6 space-y-6 text-xs font-sans">
          {/* Verdict Banner */}
          <div
            className={`flex items-center justify-between p-4 rounded-xl border ${
              result.verdict === Verdict.VALID
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : result.verdict === Verdict.VALID_WITH_WARNINGS
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : result.verdict === Verdict.SUSPICIOUS
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
            }`}
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Official Verdict
              </span>
              <h2 className="text-2xl font-black">{result.verdict}</h2>
              <p className="text-xs opacity-90">
                Verified via {engineName} on {new Date().toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Trust Score
              </span>
              <div className="text-3xl font-black font-mono">
                {result.trustScore}/100
              </div>
            </div>
          </div>

          {/* Key Identifiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-base p-4 rounded-xl border border-surface-border font-mono text-[11px]">
            <div>
              <span className="text-surface-muted block font-sans text-[10px] uppercase">
                Credential ID
              </span>
              <span className="text-surface-text break-all">
                {credentialData?.id || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-surface-muted block font-sans text-[10px] uppercase">
                Schema
              </span>
              <span className="text-surface-text">
                {credentialData?.schema || 'DegreeCredential'}
              </span>
            </div>
            <div>
              <span className="text-surface-muted block font-sans text-[10px] uppercase">
                Issuer DID
              </span>
              <span className="text-surface-text break-all">
                {credentialData?.issuerDid || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-surface-muted block font-sans text-[10px] uppercase">
                Merkle Root
              </span>
              <span className="text-surface-text break-all">
                {credentialData?.merkleProof?.root || 'N/A'}
              </span>
            </div>
          </div>

          {/* Rule Timeline Summary */}
          <div>
            <h4 className="font-bold text-surface-text mb-2 text-xs uppercase tracking-wider">
              Rule Evaluations (R1 - R10)
            </h4>
            <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden">
              {result.rules.map((rule) => (
                <div
                  key={rule.ruleId}
                  className="flex items-center justify-between px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-surface-text">
                      {rule.ruleId}
                    </span>
                    <span className="text-surface-muted">{rule.reason}</span>
                  </div>
                  <span
                    className={`font-mono font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                      rule.status === 'PASS'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : rule.status === 'WARN'
                        ? 'bg-amber-500/10 text-amber-400'
                        : rule.status === 'FAIL'
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-surface-base text-surface-muted'
                    }`}
                  >
                    {rule.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* QR Code and Cryptographic Seal */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-surface-border bg-surface-base">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-surface-muted">
                Receipt Verification QR
              </span>
              <p className="text-[11px] text-surface-muted max-w-sm">
                Scan with any standard verifier to inspect the cryptographic
                attestation and proof tree offline.
              </p>
              <div className="text-[10px] font-mono text-brand-400 pt-1">
                Receipt #{receiptData.receiptId}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <QRCodeSVG
                value={JSON.stringify({
                  id: receiptData.receiptId,
                  verdict: receiptData.verdict,
                  root: receiptData.merkleRoot,
                })}
                size={80}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end space-x-3 border-t border-surface-border pt-4">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 rounded-xl border border-surface-border bg-surface-base px-4 py-2 text-xs font-semibold text-surface-text hover:bg-surface-elevated transition-colors"
          >
            <Copy className="h-4 w-4" />
            <span>Copy JSON</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-brand-500 px-5 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
