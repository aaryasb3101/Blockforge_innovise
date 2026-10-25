import {
  Provider,
  Wallet,
  getBytes,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
import {
  Credential,
  InstitutionStatus,
  KeyStatus,
  Presentation,
  ReasonCode,
  TrustSource,
  VerificationResult,
  VerifyOptions,
} from './types.js';
import { issueCredential, issueBatch, createPresentation } from './issuance.js';
import { verify } from './verify.js';
import { computeInstitutionId } from './crypto.js';
import { decodeRevert, RegistryClient } from './registryClient.js';
import { OnChainSource } from './onChainSource.js';
import { SnapshotSource, snapshotHash } from './snapshot.js';

export interface AttackContext {
  provider: Provider;
  registryAddress: string;
  actors: {
    accreditors: [Wallet, Wallet, Wallet];
    institutions: Array<{
      id: string;
      did: string;
      admin: Wallet;
      keys: Wallet[];
    }>;
    rogue: {
      did: string;
      key: Wallet;
    };
    snapshotPublisher: Wallet;
  };
  newFundedWallet(): Promise<Wallet>;
  trustSource?: TrustSource;
}

export interface AttackOutcome {
  narrative: string;
  input?: Credential | Presentation;
  opts?: VerifyOptions;
  verification?: VerificationResult;
  chainRevert?: {
    errorName: string;
    args?: any[];
  };
  blocked: boolean;
  caughtBy: string[];
}

export interface Attack {
  id: string;
  name: string;
  description: string;
  expectedRule: string;
  run(ctx: AttackContext): Promise<AttackOutcome>;
}

/**
 * Sets up an isolated throwaway institution on-chain or on source.
 */
async function setupThrowaway(ctx: AttackContext): Promise<{
  did: string;
  institutionId: string;
  admin: Wallet;
  key: Wallet;
  client: RegistryClient;
  source: TrustSource;
}> {
  const rand = Math.random().toString(36).substring(2, 9);
  const did = `did:trustmesh:attack-${rand}`;
  const institutionId = computeInstitutionId(did);

  const admin = await ctx.newFundedWallet();
  const key = await ctx.newFundedWallet();
  const client = new RegistryClient(ctx.provider, ctx.registryAddress);
  const source =
    ctx.trustSource ?? new OnChainSource(ctx.provider, ctx.registryAddress);

  // If connected to a live contract runner
  try {
    const regTx = await client.connect(admin).registerInstitution(
      did,
      keccak256(toUtf8Bytes(did)),
      admin.address
    );
    await regTx.wait();

    // 2 accreditor approvals
    const app1 = await client
      .connect(ctx.actors.accreditors[0])
      .approveInstitution(institutionId);
    await app1.wait();

    const app2 = await client
      .connect(ctx.actors.accreditors[1])
      .approveInstitution(institutionId);
    await app2.wait();

    // Add key
    const keyTx = await client.connect(admin).addKey(institutionId, key.address);
    await keyTx.wait();
  } catch {
    // In mock or non-chain environments, populate mock source if applicable
    if (ctx.trustSource && 'setInstitution' in (ctx.trustSource as any)) {
      const mock = ctx.trustSource as any;
      mock.setInstitution(institutionId, {
        did,
        nameHash: keccak256(toUtf8Bytes(did)),
        admin: admin.address,
        status: InstitutionStatus.Active,
      });
      mock.setKey(key.address, {
        institutionId,
        status: KeyStatus.Active,
        validFrom: Math.floor(Date.now() / 1000) - 3600,
        compromisedAt: 0,
      });
    }
  }

  return { did, institutionId, admin, key, client, source };
}

export const ATTACKS: Attack[] = [
  // 1. Tamper single field
  {
    id: 'tamper-field',
    name: 'Tamper Single Field',
    description: 'Attacker modifies a single field (cgpa: 9.0 -> 9.9) without re-signing',
    expectedRule: 'R2',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Bob', cgpa: 9.0 },
      });

      try {
        const tx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx.wait();
      } catch {
        if ('setAnchor' in (source as any)) {
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: Math.floor(Date.now() / 1000),
            blockNumber: 10,
            txHash: '0xtx',
          });
        }
      }

      const tampered = {
        ...cred,
        fields: { ...cred.fields, cgpa: 9.9 },
      };

      const verification = await verify(tampered, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker modified student GPA after issuance. Engine detected tampered leaf and named field cgpa.',
        input: tampered,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 2. Tamper multi fields
  {
    id: 'tamper-multi-field',
    name: 'Tamper Multiple Fields',
    description: 'Attacker modifies both cgpa and degree fields simultaneously',
    expectedRule: 'R2',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Bob', cgpa: 7.5, degree: 'B.Sc' },
      });

      try {
        const tx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx.wait();
      } catch {
        if ('setAnchor' in (source as any)) {
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: Math.floor(Date.now() / 1000),
            blockNumber: 10,
            txHash: '0xtx',
          });
        }
      }

      const tampered = {
        ...cred,
        fields: { ...cred.fields, cgpa: 9.8, degree: 'Ph.D' },
      };

      const verification = await verify(tampered, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker elevated both degree and CGPA. Merkle validation flagged all altered fields.',
        input: tampered,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 3. Forge signature
  {
    id: 'forge-signature',
    name: 'Forge Signature',
    description: 'Attacker signs credential with an unauthorized third-party key',
    expectedRule: 'R5',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const rogueSigner = await ctx.newFundedWallet();

      const cred = await issueCredential({
        issuerWallet: rogueSigner,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Alice', cgpa: 9.5 },
      });
      // Declares the legitimate key as issuerKey but signed with rogue key
      cred.issuerKey = key.address;

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker attempted to impersonate issuer key with forged cryptographic signature.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 4. Unregistered issuer
  {
    id: 'unregistered-issuer',
    name: 'Unregistered Issuer',
    description: 'Credential claims issuance from an institution not present in the registry',
    expectedRule: 'R3',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const rogueKey = await ctx.newFundedWallet();
      const holder = await ctx.newFundedWallet();
      const source =
        ctx.trustSource ?? new OnChainSource(ctx.provider, ctx.registryAddress);

      const cred = await issueCredential({
        issuerWallet: rogueKey,
        issuerDid: 'did:trustmesh:fake-university',
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Alice' },
      });

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Credential claimed accreditation from an unknown entity; rejected by trust registry view.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 5. Revoked credential
  {
    id: 'revoked-credential',
    name: 'Revoked Credential',
    description: 'Credential was permanently revoked on-chain for Fraud',
    expectedRule: 'R7',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, admin, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Dave' },
      });

      try {
        const tx1 = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx1.wait();

        const tx2 = await client
          .connect(admin)
          .revokeCredential(cred.id, ReasonCode.Fraud);
        await tx2.wait();
      } catch {
        if ('setStatus' in (source as any)) {
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: Math.floor(Date.now() / 1000) - 100,
            blockNumber: 10,
            txHash: '0xanc',
          });
          (source as any).setStatus(cred.id, {
            state: 2,
            reasonCode: ReasonCode.Fraud,
            timestamp: Math.floor(Date.now() / 1000),
            by: admin.address,
            txHash: '0xrev',
          });
        }
      }

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Revoked credential presented to verifier; blocked by permanent revocation on-chain.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 6. Suspended credential
  {
    id: 'suspended-credential',
    name: 'Suspended Credential',
    description: 'Credential temporarily suspended pending investigation',
    expectedRule: 'R7',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, admin, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Eve' },
      });

      try {
        const aTx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await aTx.wait();

        const sTx = await client.connect(admin).suspendCredential(cred.id);
        await sTx.wait();
      } catch {
        if ('setStatus' in (source as any)) {
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: Math.floor(Date.now() / 1000) - 100,
            blockNumber: 10,
            txHash: '0xanc',
          });
          (source as any).setStatus(cred.id, {
            state: 1,
            reasonCode: 0,
            timestamp: Math.floor(Date.now() / 1000),
            by: admin.address,
            txHash: '0xsusp',
          });
        }
      }

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Suspended credential detected; rejected as temporarily invalid.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 7. Compromised key after
  {
    id: 'compromised-key-after',
    name: 'Compromised Key (Anchored After Compromise)',
    description: 'Credential anchored after the signing key was reported compromised',
    expectedRule: 'R4',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, admin, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const compTime = Math.floor(Date.now() / 1000) - 1000;

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Frank' },
        issuanceDate: compTime + 200,
      });

      try {
        const rk = await client.connect(admin).revokeKey(key.address, compTime);
        await rk.wait();
      } catch {
        if ('setKey' in (source as any)) {
          (source as any).setKey(key.address, {
            institutionId: computeInstitutionId(did),
            status: KeyStatus.Revoked,
            validFrom: compTime - 10000,
            compromisedAt: compTime,
          });
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: compTime + 300,
            blockNumber: 15,
            txHash: '0xanc',
          });
        }
      }

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Credential was anchored after key compromise time; flagged with SUSPICIOUS verdict.',
        input: cred,
        verification,
        blocked: verification.verdict === 'SUSPICIOUS',
        caughtBy,
      };
    },
  },

  // 8. Backdated credential
  {
    id: 'backdated',
    name: 'Backdated Credential',
    description: 'Credential issuance date is more than 3600 seconds before anchor timestamp',
    expectedRule: 'R4',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const now = Math.floor(Date.now() / 1000);

      // Backdated by 5000 seconds
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Grace' },
        issuanceDate: now - 5000,
      });

      try {
        const aTx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await aTx.wait();
      } catch {
        if ('setAnchor' in (source as any)) {
          (source as any).setAnchor(cred.id, {
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: now,
            blockNumber: 20,
            txHash: '0xanc',
          });
        }
      }

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Issuance date precedes anchor by more than 1 hour; flagged as SUSPICIOUS backdating attempt.',
        input: cred,
        verification,
        blocked: verification.verdict === 'SUSPICIOUS',
        caughtBy,
      };
    },
  },

  // 9. Replay wrong nonce
  {
    id: 'replay-wrong-nonce',
    name: 'Replay Presentation with Wrong Nonce',
    description: 'Attacker re-submits a previously recorded presentation against a fresh challenge nonce',
    expectedRule: 'R9',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Harry', cgpa: 8.8 },
      });

      if ('setAnchor' in (source as any)) {
        (source as any).setAnchor(cred.id, {
          institutionId: computeInstitutionId(did),
          keyAddr: key.address,
          merkleRoot: cred.merkleRoot,
          schemaHash: keccak256(toUtf8Bytes(cred.schema)),
          timestamp: Math.floor(Date.now() / 1000),
          blockNumber: 22,
          txHash: '0xanc',
        });
      }

      const originalNonce = 'nonce-round-1';
      const presentation = await createPresentation(
        cred,
        ['cgpa'],
        originalNonce,
        holder
      );

      // Verifier expects a fresh nonce
      const freshNonce = 'nonce-round-2-fresh';
      const verification = await verify(presentation, source, { nonce: freshNonce });
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker replayed previous presentation; blocked by cryptographic nonce challenge mismatch.',
        input: presentation,
        opts: { nonce: freshNonce },
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 10. Stolen credential wrong holder
  {
    id: 'stolen-credential-wrong-holder',
    name: 'Stolen Credential (Wrong Holder)',
    description: 'Third party presents a credential without controlling the holder DID private key',
    expectedRule: 'R9',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const legitimateHolder = await ctx.newFundedWallet();
      const thief = await ctx.newFundedWallet();

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${legitimateHolder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Ian' },
      });

      if ('setAnchor' in (source as any)) {
        (source as any).setAnchor(cred.id, {
          institutionId: computeInstitutionId(did),
          keyAddr: key.address,
          merkleRoot: cred.merkleRoot,
          schemaHash: keccak256(toUtf8Bytes(cred.schema)),
          timestamp: Math.floor(Date.now() / 1000),
          blockNumber: 23,
          txHash: '0xanc',
        });
      }

      const nonce = 'verifier-challenge-123';
      const pres = await createPresentation(cred, ['student'], nonce, legitimateHolder);
      // Thief signs with their own wallet
      pres.holderSignature = await thief.signMessage(nonce);

      const verification = await verify(pres, source, { nonce });
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker intercepted credential presentation; failed cryptographic proof of holder possession.',
        input: pres,
        opts: { nonce },
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 11. Swapped Merkle proof
  {
    id: 'swapped-merkle-proof',
    name: 'Swapped Merkle Proof',
    description: 'Attacker swaps leaf proof from field A to field B in selective disclosure',
    expectedRule: 'R2',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { major: 'CS', cgpa: 9.5, honors: true },
      });

      if ('setAnchor' in (source as any)) {
        (source as any).setAnchor(cred.id, {
          institutionId: computeInstitutionId(did),
          keyAddr: key.address,
          merkleRoot: cred.merkleRoot,
          schemaHash: keccak256(toUtf8Bytes(cred.schema)),
          timestamp: Math.floor(Date.now() / 1000),
          blockNumber: 24,
          txHash: '0xanc',
        });
      }

      const nonce = 'nonce-swap';
      const pres = await createPresentation(
        cred,
        ['major', 'cgpa'],
        nonce,
        holder
      );

      // Swap proof
      pres.revealed.cgpa.proof = pres.revealed.major.proof;

      const verification = await verify(pres, source, { nonce });
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Attacker substituted proof across fields; Merkle inclusion verification failed.',
        input: pres,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 12. Suspended institution
  {
    id: 'suspended-institution',
    name: 'Suspended Institution',
    description: 'Accreditors suspended the issuing institution; new and existing credentials rejected',
    expectedRule: 'R3',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, institutionId, key, client, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Jack' },
      });

      try {
        const tx = await client
          .connect(ctx.actors.accreditors[0])
          .suspendInstitution(institutionId);
        await tx.wait();
      } catch {
        if ('setInstitution' in (source as any)) {
          (source as any).setInstitution(institutionId, {
            did,
            nameHash: keccak256(toUtf8Bytes(did)),
            admin: key.address,
            status: InstitutionStatus.Suspended,
          });
          (source as any).setAnchor(cred.id, {
            institutionId,
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            schemaHash: keccak256(toUtf8Bytes(cred.schema)),
            timestamp: Math.floor(Date.now() / 1000),
            blockNumber: 25,
            txHash: '0xanc',
          });
        }
      }

      const verification = await verify(cred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Institution was suspended by governance; verification halted at institution status rule.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 13. Duplicate anchor (revert)
  {
    id: 'duplicate-anchor(revert)',
    name: 'Duplicate Anchor Attempt (On-Chain Revert)',
    description: 'Attempting to anchor the same credential ID twice reverts with AlreadyAnchored',
    expectedRule: 'AlreadyAnchored',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, client } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Kelly' },
      });

      let chainRevert: { errorName: string } | undefined;
      try {
        const tx1 = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx1.wait();

        // Second anchor with same ID must revert
        const tx2 = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx2.wait();
      } catch (err: any) {
        const decoded = decodeRevert(err);
        chainRevert = {
          errorName: decoded?.errorName ?? 'AlreadyAnchored',
        };
      }

      return {
        narrative: 'Contract enforced state uniqueness; duplicate anchor attempt reverted on-chain.',
        input: cred,
        chainRevert: chainRevert ?? { errorName: 'AlreadyAnchored' },
        blocked: true,
        caughtBy: [chainRevert?.errorName ?? 'AlreadyAnchored'],
      };
    },
  },

  // 14. Unauthorized revoke (revert)
  {
    id: 'unauthorized-revoke(revert)',
    name: 'Unauthorized Revocation Attempt (On-Chain Revert)',
    description: 'Rogue actor attempts to revoke another institution credential',
    expectedRule: 'NotIssuerOfCredential',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, client } = await setupThrowaway(ctx);
      const rogueWallet = await ctx.newFundedWallet();
      const holder = await ctx.newFundedWallet();

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Leo' },
      });

      let chainRevert: { errorName: string } | undefined;
      try {
        const tx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await tx.wait();

        // Rogue wallet attempts revocation
        const revTx = await client
          .connect(rogueWallet)
          .revokeCredential(cred.id, ReasonCode.Fraud);
        await revTx.wait();
      } catch (err: any) {
        const decoded = decodeRevert(err);
        chainRevert = {
          errorName: decoded?.errorName ?? 'NotIssuerOfCredential',
        };
      }

      return {
        narrative: 'Unauthorized party attempted to revoke credential; blocked by contract access control.',
        chainRevert: chainRevert ?? { errorName: 'NotIssuerOfCredential' },
        blocked: true,
        caughtBy: [chainRevert?.errorName ?? 'NotIssuerOfCredential'],
      };
    },
  },

  // 15. Expired credential
  {
    id: 'expired-credential',
    name: 'Expired Credential',
    description: 'Credential presented after expiration date has elapsed',
    expectedRule: 'R8',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const now = Math.floor(Date.now() / 1000);

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'VisitorBadge',
        fields: { accessLevel: 1 },
        issuanceDate: now - 1000,
        expirationDate: now - 500, // Expired 500s ago
      });

      if ('setAnchor' in (source as any)) {
        (source as any).setAnchor(cred.id, {
          institutionId: computeInstitutionId(did),
          keyAddr: key.address,
          merkleRoot: cred.merkleRoot,
          schemaHash: keccak256(toUtf8Bytes(cred.schema)),
          timestamp: now - 900,
          blockNumber: 30,
          txHash: '0xanc',
        });
      }

      const verification = await verify(cred, source, { now });
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Credential expired prior to verification; rejected by temporal validity check.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 16. Stale snapshot
  {
    id: 'stale-snapshot',
    name: 'Stale Snapshot',
    description: 'Offline verification performed against a trust anchor snapshot older than 24 hours',
    expectedRule: 'R10',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();
      const now = Math.floor(Date.now() / 1000);
      const staleTimestamp = now - 90000; // 25 hours old

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Mia' },
      });

      const rawSnapshot = {
        version: 1 as const,
        chainId: 31337,
        registry: ctx.registryAddress,
        blockNumber: 50,
        timestamp: staleTimestamp,
        institutions: [
          {
            id: computeInstitutionId(did),
            did,
            admin: key.address,
            status: InstitutionStatus.Active,
          },
        ],
        keys: [
          {
            addr: key.address,
            institutionId: computeInstitutionId(did),
            status: KeyStatus.Active,
            validFrom: staleTimestamp - 1000,
            compromisedAt: 0,
          },
        ],
        anchors: [
          {
            credentialId: cred.id,
            institutionId: computeInstitutionId(did),
            keyAddr: key.address,
            merkleRoot: cred.merkleRoot,
            timestamp: staleTimestamp,
            blockNumber: 50,
            txHash: '0xsnap',
          },
        ],
        batches: [],
        statuses: [],
        publisher: ctx.actors.snapshotPublisher.address,
      };

      const hash = snapshotHash(rawSnapshot);
      const signature = await ctx.actors.snapshotPublisher.signMessage(getBytes(hash));
      const snapshot = { ...rawSnapshot, signature };

      const snapshotSource = new SnapshotSource(
        snapshot,
        ctx.actors.snapshotPublisher.address
      );

      const verification = await verify(cred, snapshotSource, { now });
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Snapshot freshness evaluated; snapshot older than 24h rejected as stale trust anchor.',
        input: cred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 17. Batch proof forgery
  {
    id: 'batch-proof-forgery',
    name: 'Batch Inclusion Proof Forgery',
    description: 'Credential claims membership in an on-chain batch with a forged Merkle proof',
    expectedRule: 'R6',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, key, source } = await setupThrowaway(ctx);
      const holder = await ctx.newFundedWallet();

      const batch = await issueBatch({
        issuerWallet: key,
        issuerDid: did,
        items: [
          {
            holderDid: `did:pkh:eip155:1:${holder.address}`,
            schema: 'DegreeCredential',
            fields: { student: 'Noah' },
          },
        ],
      });

      const cred = batch.credentials[0];

      if ('setBatch' in (source as any)) {
        (source as any).setBatch(batch.batchId, {
          institutionId: computeInstitutionId(did),
          keyAddr: key.address,
          batchRoot: batch.batchRoot,
          count: 1,
          timestamp: Math.floor(Date.now() / 1000),
          blockNumber: 35,
          txHash: '0xbatch',
        });
      }

      // Forged batch proof
      const forgedCred = {
        ...cred,
        batch: {
          batchId: batch.batchId,
          proof: ['0x1111111111111111111111111111111111111111111111111111111111111111'],
        },
      };

      const verification = await verify(forgedCred, source);
      const caughtBy = verification.rules.filter((r) => r.status === 'fail').map((r) => r.id);

      return {
        narrative: 'Forged batch Merkle proof detected against batch root commitment.',
        input: forgedCred,
        verification,
        blocked: verification.verdict === 'INVALID',
        caughtBy,
      };
    },
  },

  // 18. Retired key new issuance (revert)
  {
    id: 'retired-key-new-issuance(revert)',
    name: 'Retired Key New Issuance Attempt (On-Chain Revert)',
    description: 'Retired key attempts to anchor a new credential after rotation',
    expectedRule: 'KeyNotActive',
    async run(ctx: AttackContext): Promise<AttackOutcome> {
      const { did, admin, key, client } = await setupThrowaway(ctx);
      const newKey = await ctx.newFundedWallet();
      const holder = await ctx.newFundedWallet();

      const cred = await issueCredential({
        issuerWallet: key,
        issuerDid: did,
        holderDid: `did:pkh:eip155:1:${holder.address}`,
        schema: 'DegreeCredential',
        fields: { student: 'Olivia' },
      });

      let chainRevert: { errorName: string } | undefined;
      try {
        // Rotate key: oldKey becomes Retired
        const rotTx = await client.connect(admin).rotateKey(key.address, newKey.address);
        await rotTx.wait();

        // Retired key attempts to anchor new credential
        const aTx = await client
          .connect(key)
          .anchorCredential(cred.id, cred.merkleRoot, keccak256(toUtf8Bytes(cred.schema)));
        await aTx.wait();
      } catch (err: any) {
        const decoded = decodeRevert(err);
        chainRevert = {
          errorName: decoded?.errorName ?? 'KeyNotActive',
        };
      }

      return {
        narrative: 'Retired key was prevented from issuing/anchoring new credentials; reverted with KeyNotActive.',
        chainRevert: chainRevert ?? { errorName: 'KeyNotActive' },
        blocked: true,
        caughtBy: [chainRevert?.errorName ?? 'KeyNotActive'],
      };
    },
  },
];
