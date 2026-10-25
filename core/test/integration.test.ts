import { describe, it, expect, beforeAll } from 'vitest';
import { JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import { issueCredential } from '../src/issuance.js';
import { verify } from '../src/verify.js';
import { OnChainSource } from '../src/onChainSource.js';
import { RegistryClient } from '../src/registryClient.js';
import { buildSnapshot, SnapshotSource } from '../src/snapshot.js';
import { computeInstitutionId } from '../src/crypto.js';
import { ReasonCode } from '../src/types.js';

describe('Live Node Integration Test', () => {
  const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
  const registryAddress =
    process.env.REGISTRY_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  let provider: JsonRpcProvider;
  let isNodeRunning = false;

  beforeAll(async () => {
    provider = new JsonRpcProvider(rpcUrl);
    try {
      await provider.getBlockNumber();
      isNodeRunning = true;
    } catch {
      isNodeRunning = false;
    }
  });

  it('lifecycle test: issue -> anchor -> verify -> revoke -> verify -> time travel -> snapshot verify', async () => {
    if (!isNodeRunning) {
      console.log(`Skipping integration test: Hardhat node unreachable at ${rpcUrl}`);
      return;
    }

    const deployer = new Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    );
    const client = new RegistryClient(deployer, registryAddress);
    const source = new OnChainSource(provider, registryAddress);

    const rand = Math.random().toString(36).substring(2, 8);
    const instDid = `did:trustmesh:integration-${rand}`;
    const instId = computeInstitutionId(instDid);
    const admin = Wallet.createRandom(provider);
    const key = Wallet.createRandom(provider);
    const holder = Wallet.createRandom();

    // Fund admin and key
    await (
      await deployer.sendTransaction({
        to: admin.address,
        value: 1000000000000000000n, // 1 ETH
      })
    ).wait();
    await (
      await deployer.sendTransaction({
        to: key.address,
        value: 1000000000000000000n,
      })
    ).wait();

    // 1. Register institution
    await (
      await client
        .connect(admin)
        .registerInstitution(instDid, keccak256(toUtf8Bytes(instDid)), admin.address)
    ).wait();

    // 2. Accreditor approvals (using deployer or accreditor accounts)
    try {
      await (await client.approveInstitution(instId)).wait();
    } catch {
      // Continue
    }

    // 3. Add key
    await (await client.connect(admin).addKey(instId, key.address)).wait();

    // 4. Issue credential
    const cred = await issueCredential({
      issuerWallet: key,
      issuerDid: instDid,
      holderDid: `did:pkh:eip155:1:${holder.address}`,
      schema: 'DegreeCredential',
      fields: {
        student: 'Integration Alice',
        cgpa: 9.8,
      },
    });

    // 5. Anchor credential
    const anchorTx = await client
      .connect(key)
      .anchorCredential(
        cred.id,
        cred.merkleRoot,
        keccak256(toUtf8Bytes(cred.schema))
      );
    const anchorReceipt = await anchorTx.wait();
    const anchorBlock = await provider.getBlock(anchorReceipt!.blockNumber);
    const anchorTime = Number(anchorBlock!.timestamp);

    // 6. Verify (should be VALID)
    const validRes = await verify(cred, source);
    expect(validRes.verdict).toBe('VALID');

    // 7. Revoke credential
    const revokeTx = await client
      .connect(admin)
      .revokeCredential(cred.id, ReasonCode.Fraud);
    await revokeTx.wait();

    // 8. Verify again (should be INVALID due to revocation)
    const revokedRes = await verify(cred, source);
    expect(revokedRes.verdict).toBe('INVALID');

    // 9. Time travel (verify with asOfTimestamp before revocation -> VALID)
    const timeTravelRes = await verify(cred, source, {
      asOfTimestamp: anchorTime,
    });
    expect(timeTravelRes.verdict).toBe('VALID');

    // 10. Build Snapshot and offline verify
    const snapshotPublisher = deployer;
    const snapshot = await buildSnapshot(source, snapshotPublisher);
    const snapshotSource = new SnapshotSource(
      snapshot,
      snapshotPublisher.address
    );

    const snapshotRes = await verify(cred, snapshotSource, {
      asOfTimestamp: anchorTime,
    });
    expect(snapshotRes.verdict).toBe('VALID');
  });
});
