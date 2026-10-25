import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Flame,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface JudgeTourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteDemoStep: (stepIndex: number) => void;
}

export const JUDGE_STEPS = [
  {
    title: '1. Happy Path: Valid Credential',
    path: '/verifier?sample=valid',
    narrative:
      'A top university (IIT Bombay) issues a degree. The credential Merkle root is anchored on-chain. Verifier checks R1 through R10: all pass with 100/100 trust score.',
    expectedRule: 'R1..R10 ALL PASS',
    verdict: 'VALID',
    color: 'emerald',
  },
  {
    title: '2. Field Tampering: CGPA 9.4 -> 9.9',
    path: '/verifier?sample=tampered',
    narrative:
      'A fraudulent applicant modifies their CGPA from 9.4 to 9.9. The leaf hash changes; Merkle proof fails. The Forensics panel pinpoints the exact mutated leaf.',
    expectedRule: 'R5_MERKLE (Rule 5)',
    verdict: 'INVALID',
    color: 'rose',
  },
  {
    title: '3. Rogue Issuer: Unaccredited Mill',
    path: '/verifier?sample=rogue',
    narrative:
      'A diploma mill issues a credential with a self-signed key. The Verifier looks up the issuer DID on-chain: missing 2-of-3 accreditor approvals or not registered.',
    expectedRule: 'R2_ISSUER (Rule 2)',
    verdict: 'INVALID',
    color: 'rose',
  },
  {
    title: '4. Revocation: Expelled Student',
    path: '/verifier?sample=revoked',
    narrative:
      'Institution revokes a credential with reason AcademicMisconduct. Verifier queries the on-chain revocation mapping and immediately rejects it.',
    expectedRule: 'R6_REVOCATION (Rule 6)',
    verdict: 'INVALID',
    color: 'rose',
  },
  {
    title: '5. Holder Privacy: Selective Disclosure',
    path: '/wallet',
    narrative:
      'Student presents their degree to an employer revealing only degree name, while cryptographically proving "cgpa >= 8" without disclosing the actual CGPA value.',
    expectedRule: 'Selective Disclosure & Predicates',
    verdict: 'PRIVACY PRESERVED',
    color: 'blue',
  },
  {
    title: '6. Key Compromise & Blast Radius',
    path: '/incidents',
    narrative:
      'An institution signer key is leaked. The incident center classifies credentials into Safe (anchored before compromise) vs Suspicious (after) and coordinates recovery.',
    expectedRule: 'R3_KEY_STATUS & Blast Radius',
    verdict: 'INCIDENT ISOLATION',
    color: 'amber',
  },
  {
    title: '7. True Offline Mode (Airplane / PWA)',
    path: '/offline',
    narrative:
      'Inspect credentials with zero network connectivity using cryptographic snapshot cache. Freshness badge warns if snapshot is stale or expired.',
    expectedRule: 'SnapshotSource Engine',
    verdict: 'OFFLINE VERIFIED',
    color: 'indigo',
  },
  {
    title: '8. Fraud Simulation Playground (18 Attacks)',
    path: '/playground',
    narrative:
      'Run 18 adversarial attack vectors including signature forgery, replay, frontrunning, and Merkle extension. Animated scoreboard proves 18/18 blocked.',
    expectedRule: '18 Security Properties',
    verdict: '18/18 BLOCKED',
    color: 'purple',
  },
  {
    title: '9. Audit Explorer & Direct RPC Re-Verify',
    path: '/audit',
    narrative:
      'Inspect the immutable append-only event stream and click "Re-verify from chain" to prove the frontend queries the RPC directly without trusting any indexer.',
    expectedRule: 'Trustless Independent RPC Query',
    verdict: 'PROOF MATCHES INDEX',
    color: 'cyan',
  },
  {
    title: '10. Cross-Institution Revocation Revert',
    path: '/issuer?revert=demo',
    narrative:
      'Institution B attempts to revoke Institution A’s credential. The smart contract strictly checks ownership and reverts on-chain with NotIssuerOfCredential.',
    expectedRule: 'On-chain Revert: NotIssuerOfCredential',
    verdict: 'CHAIN REVERT',
    color: 'rose',
  },
];

export const JudgeTourOverlay: React.FC<JudgeTourOverlayProps> = ({
  isOpen,
  onClose,
  onExecuteDemoStep,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const step = JUDGE_STEPS[currentStep];

  const handleRun = () => {
    onExecuteDemoStep(currentStep);
    navigate(step.path);
  };

  const handleNext = () => {
    if (currentStep < JUDGE_STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      onExecuteDemoStep(next);
      navigate(JUDGE_STEPS[next].path);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      onExecuteDemoStep(prev);
      navigate(JUDGE_STEPS[prev].path);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-lg rounded-2xl border-2 border-brand-500/50 bg-surface-card/95 p-5 shadow-2xl backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center space-x-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-md">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-surface-text">
              Judge Mode: 5-Minute Interactive Tour
            </h3>
            <p className="text-[10px] text-surface-muted font-mono">
              Step {currentStep + 1} of {JUDGE_STEPS.length}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-surface-muted hover:text-surface-text hover:bg-surface-elevated transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-surface-text">{step.title}</h4>
          <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-400 border border-brand-500/20 font-mono">
            {step.verdict}
          </span>
        </div>

        <p className="text-xs text-surface-muted leading-relaxed">
          {step.narrative}
        </p>

        <div className="flex items-center justify-between rounded-xl bg-surface-base p-2.5 border border-surface-border text-xs">
          <span className="text-surface-muted font-sans text-[11px]">
            Security Mechanism:
          </span>
          <span className="font-mono font-bold text-amber-400">
            {step.expectedRule}
          </span>
        </div>
      </div>

      {/* Stepper Controls */}
      <div className="flex items-center justify-between border-t border-surface-border pt-3">
        <div className="flex space-x-1">
          {JUDGE_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentStep(idx);
                onExecuteDemoStep(idx);
                navigate(JUDGE_STEPS[idx].path);
              }}
              className={`h-1.5 rounded-full transition-all ${
                idx === currentStep
                  ? 'w-6 bg-brand-400'
                  : 'w-2 bg-surface-border hover:bg-surface-muted'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="rounded-lg border border-surface-border p-1.5 text-surface-muted hover:text-surface-text disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={handleRun}
            className="flex items-center space-x-1 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-500/25 hover:bg-brand-600 active:scale-95 transition-all"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Pre-fill & Verify</span>
          </button>

          <button
            onClick={handleNext}
            disabled={currentStep === JUDGE_STEPS.length - 1}
            className="rounded-lg border border-surface-border p-1.5 text-surface-muted hover:text-surface-text disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
