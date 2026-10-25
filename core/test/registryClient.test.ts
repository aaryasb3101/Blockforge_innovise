import { describe, it, expect, vi } from 'vitest';
import { decodeRevert, RegistryClient } from '../src/registryClient.js';
import { Interface } from 'ethers';
import { REGISTRY_ABI } from '../src/abi.js';

describe('RegistryClient & decodeRevert', () => {
  const iface = new Interface(REGISTRY_ABI);

  it('decodeRevert parses raw hex error data', () => {
    const errorData = iface.encodeErrorResult('NotAccreditor', []);
    const decoded = decodeRevert({ data: errorData });
    expect(decoded).not.toBeNull();
    expect(decoded?.errorName).toBe('NotAccreditor');
  });

  it('decodeRevert parses nested error data shapes from RPC responses', () => {
    const errorData = iface.encodeErrorResult('InstitutionNotActive', []);
    const decoded = decodeRevert({
      error: {
        data: errorData,
      },
    });
    expect(decoded?.errorName).toBe('InstitutionNotActive');
  });

  it('decodeRevert parses textual error messages', () => {
    const decoded = decodeRevert({
      message: "execution reverted: custom error 'KeyNotActive()'",
    });
    expect(decoded?.errorName).toBe('KeyNotActive');
  });

  it('decodeRevert returns null for unknown errors', () => {
    expect(decodeRevert(null)).toBeNull();
    expect(decodeRevert({ message: 'generic network timeout' })).toBeNull();
  });

  it('RegistryClient initializes and wraps contract methods', async () => {
    const mockRunner: any = {};
    const client = new RegistryClient(mockRunner, '0x1234567890123456789012345678901234567890');

    client.contract.getInstitution = vi.fn().mockResolvedValue([
      'did:trustmesh:test',
      '0xname',
      '0xadmin',
      1n,
      2n,
    ]);

    const res = await client.getInstitution('0xid');
    expect(res[0]).toBe('did:trustmesh:test');
    expect(res[3]).toBe(1);
  });
});
