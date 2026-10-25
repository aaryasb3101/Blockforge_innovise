import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForensicsTable } from '../components/ForensicsTable';
import { RuleResult } from '@shared/types';

describe('ForensicsTable Component', () => {
  const mockCredential = {
    id: '0x1234',
    schema: 'DegreeCredential',
    fields: {
      studentName: 'Apurva Sharma',
      cgpa: 9.9,
      degree: 'B.Tech CS',
    },
    salts: {
      studentName: '0x' + '11'.repeat(32),
      cgpa: '0x' + '22'.repeat(32),
      degree: '0x' + '33'.repeat(32),
    },
    merkleRoot: '0x' + 'aa'.repeat(32),
  };

  it('renders all field rows with claimed values', () => {
    render(<ForensicsTable credential={mockCredential} rules={[]} />);

    expect(screen.getByText('studentName')).toBeInTheDocument();
    expect(screen.getByText('Apurva Sharma')).toBeInTheDocument();
    expect(screen.getByText('cgpa')).toBeInTheDocument();
    expect(screen.getByText('9.9')).toBeInTheDocument();
    expect(screen.getByText('degree')).toBeInTheDocument();
  });

  it('highlights tampered field when R5 Merkle rule fails', () => {
    const rules: RuleResult[] = [
      {
        id: 'R5',
        name: 'Merkle Leaf Integrity',
        status: 'fail',
        reason: 'Merkle root mismatch',
        evidence: {},
      },
    ];

    render(<ForensicsTable credential={mockCredential} rules={rules} />);

    // Tampered field detection
    expect(screen.getAllByText('[MUTATED]').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leaf Mismatch').length).toBeGreaterThan(0);
    expect(screen.getByText(/Plain-English Forensic Assessment:/i)).toBeInTheDocument();
  });

  it('shows included status when all rules pass', () => {
    const rules: RuleResult[] = [
      {
        id: 'R5',
        name: 'Merkle Leaf Integrity',
        status: 'pass',
        reason: 'All leaves verified',
        evidence: {},
      },
    ];

    render(<ForensicsTable credential={mockCredential} rules={rules} />);

    expect(screen.queryByText('[MUTATED]')).not.toBeInTheDocument();
    expect(screen.queryByText('Leaf Mismatch')).not.toBeInTheDocument();
    const includedBadges = screen.getAllByText('Included');
    expect(includedBadges.length).toBeGreaterThan(0);
  });
});
