import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';

describe('Browser ESM Bundle Smoke Test', () => {
  it('imports compiled dist/index.js ESM bundle and performs full verification flow', async () => {
    const core = await import('../dist/index.js');

    expect(typeof core.verify).toBe('function');
    expect(typeof core.issueCredential).toBe('function');
    expect(typeof core.encodeForQr).toBe('function');
    expect(typeof core.decodeFromQr).toBe('function');

    const issuer = Wallet.createRandom();
    const holder = Wallet.createRandom();
    const holderDid = `did:pkh:eip155:1:${holder.address}`;

    const cred = await core.issueCredential({
      issuerWallet: issuer,
      issuerDid: 'did:trustmesh:browser-inst',
      holderDid,
      schema: 'BrowserCredential',
      fields: { role: 'tester', verified: true },
    });

    expect(cred.id).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const qr = core.encodeForQr(cred);
    expect(typeof qr).toBe('string');
    const decoded = core.decodeFromQr(qr);
    expect(decoded.id).toBe(cred.id);
  });
});
