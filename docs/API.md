# TrustMesh REST API & Core SDK Reference

This document provides the canonical interface specifications for the TrustMesh ecosystem, covering the backend Fastify REST API endpoints and the `@trustmesh/core` TypeScript cryptographic functions.

---

## 1. Backend REST API Endpoints

The backend server runs by default on `http://localhost:8787`. All responses follow standard HTTP semantics with JSON payloads.

### 1.1 System & Diagnostics

#### `GET /api/health`
Returns the operational health and sync status of the service.
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "blockNumber": 1042,
  "syncLag": 0,
  "dbConnected": true,
  "timestamp": 1729851600
}
```

#### `GET /api/config`
Retrieves public network configuration and contract addresses.
- **Response `200 OK`**:
```json
{
  "network": "Hardhat Local",
  "chainId": 31337,
  "rpcUrl": "http://127.0.0.1:8545",
  "registryAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "accreditorThreshold": "2-of-3",
  "snapshotPublisher": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

#### `GET /api/stats`
Aggregates live network-wide metrics for the landing page and monitoring.
- **Response `200 OK`**:
```json
{
  "totalCredentialsAnchored": 1420,
  "activeInstitutions": 12,
  "totalVerifications": 9850,
  "revokedCount": 18,
  "currentBlockHeight": 1042,
  "cacheHitRatio": 0.94
}
```

---

### 1.2 Verification Engine

#### `POST /api/verify`
Performs full R1..R10 deterministic cryptographic verification against the indexed on-chain state.
- **Request Body**:
```json
{
  "credential": { ... },       // Full credential or presentation object
  "options": {
    "asOf": 1729850000,        // Optional: time-travel unix timestamp
    "expectedNonce": "xyz789", // Optional: replay protection nonce
    "strictFreshness": true    // Optional: enforce R10 snapshot limit
  }
}
```
- **Response `200 OK`**:
```json
{
  "verdict": "VALID",
  "trustScore": 100,
  "rules": [
    {
      "id": "R1_SCHEMA",
      "status": "pass",
      "reason": "Credential schema conforms to W3C VC specification",
      "evidence": { "schema": "DegreeCredential", "fieldsCount": 7 }
    },
    {
      "id": "R2_ISSUER_STATUS",
      "status": "pass",
      "reason": "Issuer is accredited by 2-of-3 consensus",
      "evidence": { "issuerDid": "did:trustmesh:apex-university", "status": "Active" }
    }
  ],
  "forensics": [
    {
      "key": "cgpa",
      "value": 9.4,
      "expectedHash": "0x4a9b...72e1",
      "actualHash": "0x4a9b...72e1",
      "isMatch": true,
      "isRevealed": true
    }
  ],
  "receipt": {
    "receiptId": "rec_018f...392",
    "timestamp": 1729851610,
    "blockNumber": 1042,
    "verdict": "VALID",
    "engine": "backend-fastify"
  }
}
```

---

### 1.3 Audit & Forensics

#### `GET /api/audit/events`
Queries indexed on-chain events with filtering and pagination.
- **Query Parameters**:
  - `limit` (default: 50, max: 200)
  - `offset` (default: 0)
  - `type` (`MerkleRootAnchored`, `CredentialRevoked`, `InstitutionStatusChanged`, `KeyRotated`, `SnapshotPublished`)
  - `institution` (filter by DID or Ethereum address)
- **Response `200 OK`**:
```json
{
  "events": [
    {
      "id": "evt_1042_0",
      "type": "MerkleRootAnchored",
      "blockNumber": 1042,
      "txHash": "0x39a1...ff80",
      "timestamp": 1729851500,
      "institution": "did:trustmesh:apex-university",
      "actor": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "args": {
        "root": "0x892a...c014",
        "batchSize": 1,
        "schema": "DegreeCredential"
      }
    }
  ],
  "total": 1
}
```

#### `GET /api/audit/verify/:txHash`
Fetches the raw Ethereum receipt and compares the on-chain event log against the indexer SQLite cache.
- **Response `200 OK`**:
```json
{
  "txHash": "0x39a1...ff80",
  "blockNumber": 1042,
  "gasUsed": "48210",
  "isConfirmed": true,
  "chainLogMatchesIndex": true,
  "event": "MerkleRootAnchored"
}
```

---

### 1.4 Incident & Offline Services

#### `POST /api/incident/analyze`
Computes the blast radius of a private key compromise.
- **Request Body**:
```json
{
  "institutionDid": "did:trustmesh:apex-university",
  "keyId": "key-2024-alpha",
  "compromiseTimestamp": 1729840000
}
```
- **Response `200 OK`**:
```json
{
  "totalAnchors": 45,
  "safeCount": 38,
  "suspiciousCount": 7,
  "revokedCount": 0,
  "affectedHoldersHashedCount": 142,
  "timeline": [
    {
      "timestamp": 1729835000,
      "root": "0x111...aaa",
      "status": "SAFE"
    },
    {
      "timestamp": 1729845000,
      "root": "0x222...bbb",
      "status": "SUSPICIOUS"
    }
  ],
  "recommendedActions": [
    "Execute immediate on-chain key rotation",
    "Re-issue 7 compromised batch credentials",
    "Notify affected relying parties via TrustMesh RSS feed"
  ]
}
```

#### `GET /api/snapshot`
Returns the latest canonical state snapshot signed by the authorized SnapshotPublisher.
- **Response `200 OK`**:
```json
{
  "snapshotId": "snap_1042",
  "blockNumber": 1042,
  "timestamp": 1729851600,
  "publisherSignature": "0x98ef...001c",
  "publisherAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "institutions": {
    "did:trustmesh:apex-university": {
      "status": "Active",
      "keys": ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
      "roots": ["0x892a...c014"],
      "revokedRoots": []
    }
  }
}
```

---

## 2. Core Cryptographic SDK Functions (`@trustmesh/core`)

All cryptographic calculations are implemented in `@trustmesh/core` using strictly deterministic standards:
- **Canonicalization**: RFC 8785 JSON canonicalization.
- **Hashing**: Keccak-256 (`ethers.keccak256`).
- **Merkle Trees**: `merkletreejs` with `sortPairs: true, hashLeaves: false`.

### 2.1 Credential & Tree Operations

#### `canonicalizeCredential(credential: any): string`
Produces deterministic UTF-8 bytes for any arbitrary JavaScript object per RFC 8785.

#### `hashLeaf(key: string, value: any, salt: string): string`
Computes the salted leaf hash:
$$\text{leaf} = \text{keccak256}(\text{key} \parallel \text{canonicalize}(value) \parallel salt)$$

#### `buildCredentialMerkleTree(fields: Record<string, any>, salts: Record<string, string>): MerkleTree`
Constructs the sorted Keccak-256 Merkle tree from credential claims and returns the root hash.

### 2.2 Verification Engine API

#### `verifyCredential(credential: any, source: TrustSource, options?: VerifyOptions): Promise<VerificationResult>`
Executes the full R1..R10 deterministic rule suite against either:
- **`OnChainSource`**: Queries Ethereum JSON-RPC directly via `ethers.Contract`.
- **`SnapshotSource`**: Validates against a local signed snapshot (used in true offline mode).

### 2.3 Presentation & Privacy

#### `createPresentation(credential: any, revealFields: string[], nonce: string, holderWallet: Wallet): Promise<Presentation>`
Constructs a selective disclosure presentation:
1. Strips unrevealed claim values and salts.
2. Injects Merkle inclusion proofs for each revealed leaf.
3. Appends holder signature over the presentation header and challenger nonce.

#### `encodeForQr(presentation: Presentation): string`
Compresses the presentation JSON using `fflate` raw Deflate and prefixes it with the URI identifier `trustmesh:v1:...` for dense high-speed camera scanning.
