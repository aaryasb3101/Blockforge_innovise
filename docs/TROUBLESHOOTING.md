# TrustMesh Troubleshooting & Judge FAQ

This guide assists judges, evaluators, and developers during live hackathon demonstrations and local evaluations.

---

## 1. Quick Diagnostic Checklist

| Check | Expected State | How to Verify |
| :--- | :--- | :--- |
| **Backend REST API** | Running on port `8787` | Visit `http://localhost:8787/api/health` &rarr; `{"status":"ok"}` |
| **Hardhat RPC Node** | Running on port `8545` | `curl -X POST http://localhost:8545 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'` |
| **Frontend Web App** | Running on port `5173` | Visit `http://localhost:5173` & check top-right block indicator |
| **Mock Fallback** | Automatic | If backend is offline, the web adapter seamlessly uses built-in in-memory core mock data |

---

## 2. Common Scenarios & Solutions

### 2.1 "Backend and browser engines disagree" in Verifier
- **Root Cause**: The local Hardhat chain was restarted or reset, so the backend SQLite indexer and the on-chain contract state are out of sync.
- **Resolution**:
  1. Toggle to **Independent Browser Mode** in the Verifier header to verify directly against the RPC without the backend.
  2. To re-synchronize the backend indexer:
     ```bash
     cd backend && npm run indexer:resync
     ```

### 2.2 Offline PWA Mode says "SNAPSHOT_EXPIRED"
- **Root Cause**: Rule R10 strictly enforces a 24-hour maximum snapshot age for security. If the snapshot in IndexedDB was cached more than 24 hours ago (or the simulated time slider was pushed past 24 hours), R10 triggers `INVALID`.
- **Resolution**:
  1. Click **"Sync Latest Snapshot"** in the Offline PWA page (`/offline`).
  2. Reset the **Simulate Stale Cache** slider to `0 hours offset`.

### 2.3 On-Chain Revert: `NotIssuerOfCredential()`
- **Context**: Occurs in the Issuer Console (`/issuer`) when pressing **"Try revoking as another institution"**.
- **Explanation**: This is an intentional security demonstration. TrustRegistry.sol enforces that only the accredited institution that anchored the Merkle root can revoke or suspend credentials under that root. The UI catches this custom Solidity revert and displays an explanation.

### 2.4 QR Scanner Camera Permissions
- **Context**: Verifier or Wallet QR scanner fails to start camera.
- **Resolution**:
  1. Browser security requires `localhost` or `https://` for camera access (`navigator.mediaDevices`).
  2. If the browser blocks video streaming, click the **"Upload Image / QR File"** button in the QR modal to test image decoding.

---

## 3. Judge & Evaluator Frequently Asked Questions

### Q1: Why not just store the student's name and degree on Ethereum?
**Answer**:
1. **GDPR / FERPA Compliance**: The "Right to be Forgotten" cannot be honored on an immutable ledger. Once PII is on-chain, it remains permanently accessible.
2. **Gas Efficiency**: Storing arbitrary string data costs tens of thousands of gas per student. TrustMesh anchors an entire graduation batch (10,000+ graduates) in a single 32-byte Merkle root (`0x892a...c014`), costing less than $0.50 in gas.
3. **Privacy**: Personal details are retained exclusively in the student's local wallet.

### Q2: How does the Independent Browser Mode prevent censorship?
**Answer**:
Most Web3 frontends depend entirely on centralized indexer APIs. If the backend server is taken down, DDoSed, or censored, verification stops. In TrustMesh, selecting **"Independent Browser Mode"** activates `@trustmesh/core` directly inside the browser tab. The client parses the Merkle tree, reads the smart contract via `ethers.Contract`, and evaluates rules R1..R10 without sending any HTTP request to our backend.

### Q3: What happens if an issuer's private key is stolen?
**Answer**:
TrustMesh includes a dedicated **Key Incident Center** (`/incidents`):
1. The institution flags the compromise timestamp on-chain.
2. The blast-radius engine partitions all historical credentials into **SAFE** (anchored before the compromise) and **SUSPICIOUS** (anchored after the compromise).
3. The 2-of-2 **Guardian Recovery Wizard** enables multi-sig timelocked rotation to a new secure key.

### Q4: Does offline verification allow revoked credentials to pass?
**Answer**:
Rule R10 is designed specifically for this trade-off:
- A snapshot is signed by the on-chain Snapshot Publisher.
- If the snapshot is less than 1 hour old, it is treated as **FRESH**.
- If between 1 and 24 hours old, it produces **VALID_WITH_WARNINGS** (warning that a recent revocation might have occurred).
- If older than 24 hours, the engine **strictly refuses acceptance** (`INVALID`), preventing stale offline attack vectors.
