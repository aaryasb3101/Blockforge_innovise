import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import * as api from '../lib/api';

describe('App Routing & Navigation', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    vi.spyOn(api, 'fetchDemoSamples').mockResolvedValue({
      valid: {
        id: '0x1111',
        schema: 'DegreeCredential',
        issuerDid: 'did:trustmesh:iit-bombay',
        holderDid: 'did:pkh:eip155:31337:0x123',
        merkleRoot: '0xroot',
        fields: { studentName: 'Test Student', cgpa: 9.0 },
      },
    });
  });

  it('renders Consensus Monitoring Dashboard when path is /', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Consensus & Validator Network Monitor')).toBeInTheDocument();
  });

  it('renders Home page when path is /home', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/home']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Trust, Decentralized.')).toBeInTheDocument();
    expect(screen.getByText('Launch 5-Minute Judge Tour')).toBeInTheDocument();
  });

  it('renders Decentralized Verifier when path is /verifier', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/verifier']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Decentralized Verifier')).toBeInTheDocument();
    expect(screen.getByText('R1 - R10 Engine')).toBeInTheDocument();
  });

  it('renders Fraud Playground when path is /playground', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/playground']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Fraud Simulation Playground')).toBeInTheDocument();
    expect(screen.getByText('Attacks Blocked')).toBeInTheDocument();
  });
});
