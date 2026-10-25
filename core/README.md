# @trustmesh/core

TrustMesh decentralized institutional trust infrastructure — core cryptographic issuance, selective disclosure, pure verification engine, offline trust anchor snapshots, key compromise incident analysis, and attack simulation suite.

Works seamlessly in both **Node.js** and **modern browsers** (zero reliance on `fs`, `path`, or `Buffer` primitives; fully bundlable by Vite/Webpack/Rollup/tsup).

---

## Architecture & Features

- **Merkle Commitments & Selective Disclosure**: Deterministic, RFC 8785 canonical value leaf hashing with EIP-191 signatures and OpenZeppelin-compatible Merkle proofs.
- **Pure Verification Engine (`verify`)**: Strictly evaluates rules **R1 through R10** over any `TrustSource` (`OnChainSource` or `SnapshotSource`). **NEVER throws**; any anomalous state is captured as a rule result with forensic diffs.
- **Time-Travel Verification**: Query historical trust state via `opts.asOfTimestamp` to verify credentials against prior on-chain states or audit historical revocations.
- **Tamper Forensics**: Pinpoints and names the exact modified fields and invalid Merkle proofs.
- **Incident Analysis (`computeBlastRadius`)**: Evaluates compromised keys, categorizes credentials into `safe`, `suspicious`, and `afterRevoke`, computes privacy-preserving holder hashes (`keccak256`), and recommends plain-English recovery steps.
- **W3C JSON-LD Interoperability**: Bi-directional conversion between internal models and W3C Verifiable Credentials with custom `TrustMeshMerkleSignature2026` proof suites.
- **Ultra-Compact QR Encoding**: URL-safe base64url deflation via `fflate` for dense QR code generation and instant air-gapped scanning.
- **Attack Simulation Suite (`ATTACKS`)**: 18 isolated, repeatable attack vectors validating cryptographic, temporal, and on-chain security boundaries.

---

## Verification Rules (R1 .. R10)

| Rule ID | Rule Name | What It Checks | Status Conditions | Evidence Keys |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | **Schema Validation** | Input structure conforms to Zod schema specification. | **pass**: Valid schema<br>**fail**: Missing/malformed fields | `schema`, `format`, `errors` |
| **R2** | **Merkle Integrity & Proofs** | Recomputes leaves and root; verifies selective disclosure proofs. | **pass**: Root & proofs match<br>**fail**: Tampered fields/proofs | `tamperedFields`, `invalidProofs`, `declaredRoot`, `recomputedRoot` |
| **R3** | **Issuer Accreditation Status** | Checks issuer DID registration and active governance status. | **pass**: Status 1 (Active)<br>**fail**: 0 (Pending), 2 (Suspended), 3 (Revoked), or Unregistered | `institutionId`, `did`, `status`, `statusName` |
| **R4** | **Signing Key & Timeline** | Evaluates signing key validity at anchor time; checks compromise timestamps and backdating. | **pass**: Valid key at anchor<br>**fail** (suspicious): Anchored $\ge$ `compromisedAt`<br>**fail** (suspicious): Backdated $>3600\text{s}$ before anchor<br>**fail**: Key suspended, unregistered, or foreign | `issuerKey`, `validFrom`, `anchorTimestamp`, `compromisedAt`, `driftSeconds`, `suspicious` |
| **R5** | **Signature & Issuer Binding** | Recovers EIP-191 signer address and verifies key belongs to issuer institution. | **pass**: Signer matches issuer key<br>**fail**: Signature mismatch or key not belonging to issuer | `signer`, `institutionId`, `recoveredSigner`, `declaredIssuerKey` |
| **R6** | **On-Chain Anchor Verification** | Confirms direct root anchor or batch Merkle inclusion on-chain. | **pass**: On-chain root/batch match<br>**fail**: Not anchored, root mismatch, or invalid batch proof | `credentialId`, `blockNumber`, `txHash`, `merkleRoot`, `batchId`, `batchRoot` |
| **R7** | **Revocation & Suspension** | Checks on-chain credential status (respects `asOfTimestamp` for time-travel). | **pass**: State 0 (Good)<br>**fail**: State 1 (Suspended)<br>**fail**: State 2 (Revoked) | `state`, `stateName`, `reasonCode`, `reason`, `timestamp`, `txHash`, `by` |
| **R8** | **Credential Expiration** | Compares current or evaluation timestamp against `expirationDate`. | **pass**: Unexpired or perpetual (0)<br>**fail**: `now > expirationDate` | `expirationDate`, `now` |
| **R9** | **Holder Binding & Nonce** | For presentations, recovers holder signature and checks nonce challenge. | **pass**: Signer matches holder DID<br>**skip**: Raw credential<br>**fail**: Nonce mismatch or wrong signer | `holderAddress`, `nonce`, `expectedNonce`, `actualNonce` |
| **R10** | **Snapshot Freshness & Trust** | For offline snapshots, validates publisher signature and checks age tiers. | **pass**: $<1\text{h}$ old<br>**warn**: $1\text{h}-24\text{h}$ old<br>**fail**: $>24\text{h}$ old or unverified publisher<br>**skip**: On-chain verification | `ageSeconds`, `snapshotTimestamp`, `publisherVerified` |

---

## Verdicts & Trust Score Bands

- **`VALID`** (`90 - 100`): All applicable rules pass with 0 warnings or failures.
- **`VALID_WITH_WARNINGS`** (`61 - 89`): Cryptographically authentic and active, but non-critical warnings detected (e.g. snapshot aged between 1h and 24h).
- **`SUSPICIOUS`** (`31 - 60`): Key compromise window anomaly detected or backdated issuance exceeding 1 hour.
- **`INVALID`** (`0 - 30`): Cryptographic tampering, unregistered issuer, revocation, suspension, expiration, or invalid proofs.

---

## API Usage Examples

### 1. Issue a Credential with Predicates

```typescript
import { issueCredential } from '@trustmesh/core';
import { Wallet } from 'ethers';

const issuerWallet = new Wallet('0x...');
const holderDid = 'did:pkh:eip155:1:0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const credential = await issueCredential({
  issuerWallet,
  issuerDid: 'did:trustmesh:iit-bombay',
  holderDid,
  schema: 'DegreeCredential',
  fields: {
    studentName: 'Alice Sharma',
    degree: 'B.Tech Computer Science',
    cgpa: 9.4,
  },
  predicates: {
    cgpa_gte_8: true,
    graduated: true,
  },
  issuanceDate: Math.floor(Date.now() / 1000),
  expirationDate: 0,
});
```

### 2. Selective Disclosure Presentation

```typescript
import { createPresentation } from '@trustmesh/core';

const holderWallet = new Wallet('0x...');
const verifierNonce = 'challenge-nonce-987654';

// Holder only reveals the predicate cgpa_gte_8 and degree, hiding actual CGPA and student name
const presentation = await createPresentation(
  credential,
  ['cgpa_gte_8', 'degree'],
  verifierNonce,
  holderWallet
);
```

### 3. Verification Engine (Pure & Safe)

```typescript
import { verify, OnChainSource } from '@trustmesh/core';
import { JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://...');
const source = new OnChainSource(provider, '0xRegistryAddress...');

// Verify presentation against live chain with verifier nonce challenge
const result = await verify(presentation, source, {
  nonce: verifierNonce,
});

console.log('Verdict:', result.verdict); // 'VALID'
console.log('Trust Score:', result.trustScore); // 100
console.log('Receipt Hash:', result.receipt.hash);
```

### 4. Time-Travel Verification

```typescript
// Verify credential status as of a historical block timestamp
const historicalResult = await verify(credential, source, {
  asOfTimestamp: 1695000000,
});
```

### 5. Offline Snapshot Verification

```typescript
import { SnapshotSource, verify } from '@trustmesh/core';

const snapshotSource = new SnapshotSource(snapshotData, trustedPublisherAddress);
const result = await verify(credential, snapshotSource);
```

### 6. Incident Analysis & Blast Radius

```typescript
import { computeBlastRadius } from '@trustmesh/core';

const analysis = await computeBlastRadius(
  provider,
  registryAddress,
  compromisedKeyAddress,
  compromisedAtTimestamp
);

console.log('Safe Credentials:', analysis.safe.length);
console.log('Suspicious Credentials:', analysis.suspicious.length);
console.log('Affected Holder Hashes:', analysis.holdersHashed);
console.log('Recommended Actions:', analysis.recommendedActions);
```

---

## Attack Simulation Suite (18 Vectors)

The core module includes 18 isolated, repeatable attack implementations:

1. `tamper-field`: Modifying a single credential field value (caught by `R2`).
2. `tamper-multi-field`: Modifying multiple fields simultaneously (caught by `R2`).
3. `forge-signature`: Impersonating issuer key with an unauthorized signature (caught by `R5`).
4. `unregistered-issuer`: Issuing from an unaccredited institution DID (caught by `R3`).
5. `revoked-credential`: Presenting an on-chain revoked credential (caught by `R7`).
6. `suspended-credential`: Presenting a suspended credential (caught by `R7`).
7. `compromised-key-after`: Anchoring after key compromise timestamp (caught by `R4` $\to$ `SUSPICIOUS`).
8. `backdated`: Issuance date backdated $>1\text{h}$ before anchor (caught by `R4` $\to$ `SUSPICIOUS`).
9. `replay-wrong-nonce`: Presentation replay against mismatched nonce (caught by `R9`).
10. `stolen-credential-wrong-holder`: Unauthorized holder signature (caught by `R9`).
11. `swapped-merkle-proof`: Swapping leaf proof across distinct fields (caught by `R2`).
12. `suspended-institution`: Issuing while institution is suspended (caught by `R3`).
13. `duplicate-anchor(revert)`: On-chain revert with `AlreadyAnchored` error.
14. `unauthorized-revoke(revert)`: On-chain revert with `NotIssuerOfCredential` error.
15. `expired-credential`: Verification after expiration date (caught by `R8`).
16. `stale-snapshot`: Offline verification against snapshot $>24\text{h}$ old (caught by `R10`).
17. `batch-proof-forgery`: Invalid batch inclusion proof (caught by `R6`).
18. `retired-key-new-issuance(revert)`: On-chain revert with `KeyNotActive` error.

---

## Build & Test

```bash
# Run all unit, property, and attack tests
npm test

# Build ESM & CJS distribution bundles + TypeScript declarations
npm run build
```
