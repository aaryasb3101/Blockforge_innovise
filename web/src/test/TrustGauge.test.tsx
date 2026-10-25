import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustGauge } from '../components/TrustGauge';
import { ReceiptModal } from '../components/ReceiptModal';
import { VerificationResult } from '@shared/types';

describe('TrustGauge Component', () => {
  it('renders score text and trust score label', () => {
    render(<TrustGauge score={100} verdict="VALID" />);
    expect(screen.getByText('Trust Score')).toBeInTheDocument();
    expect(screen.getByText('/100')).toBeInTheDocument();
  });

  it('renders score for invalid verdict', () => {
    render(<TrustGauge score={0} verdict="INVALID" />);
    expect(screen.getByText('Trust Score')).toBeInTheDocument();
  });
});

describe('ReceiptModal Component', () => {
  const mockResult: VerificationResult = {
    verdict: 'VALID',
    trustScore: 100,
    rules: [
      {
        id: 'R1',
        name: 'Schema Check',
        status: 'pass',
        reason: 'Format is valid',
        evidence: {},
      },
    ],
    explanation: 'Everything verified',
    receipt: {
      hash: '0xabc',
      verifiedAt: Date.now(),
      source: 'chain',
      blockNumber: 12480,
    },
  };

  it('renders modal when isOpen is true', () => {
    render(
      <ReceiptModal
        isOpen={true}
        onClose={() => {}}
        result={mockResult}
        credentialData={{ id: '0xcred1', schema: 'DegreeCredential' }}
      />
    );

    expect(screen.getByText('Cryptographic Verification Receipt')).toBeInTheDocument();
    expect(screen.getByText('VALID')).toBeInTheDocument();
    expect(screen.getByText('100/100')).toBeInTheDocument();
    expect(screen.getByText('DegreeCredential')).toBeInTheDocument();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReceiptModal
        isOpen={false}
        onClose={() => {}}
        result={mockResult}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
