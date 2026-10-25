# TrustMesh Deployment & Operations Guide

TrustMesh is a decentralized institutional trust infrastructure allowing institutions to issue signed, Merkle-committed credentials that verifiers evaluate against on-chain registry state with zero personally identifiable information (PII) on-chain.

This guide details three production and evaluation deployment paths:
1. **Local Development** (Hardhat node + local backend + Vite web)
2. **Hosted Cloud Deployment** (Chain & Backend on Render/Railway + Web on Vercel/Netlify)
3. **Public Testnets** (Ethereum Sepolia or Base Sepolia)

---

## 1. Environment Variable Reference

### Backend (`/backend`)
| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `PORT` | HTTP server listening port | `4000` | No |
| `HOST` | Bind address | `0.0.0.0` | No |
| `MODE` | Deployment mode (`local`, `hosted`, `testnet`) | `local` | Yes |
| `RPC_URL` | EVM JSON-RPC provider endpoint | `http://127.0.0.1:8545` | Yes |
| `CHAIN_ID` | Network Chain ID | `31337` (local), `11155111` (Sepolia) | Yes |
| `REGISTRY_ADDRESS` | Deployed `TrustRegistry` contract address | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | Optional (auto-detected) |
| `KEYSTORE_PASSWORD` | AES-256 encryption passphrase for local keystores | `trustmesh-secret-key-password-2026` | Yes |
| `KEYSTORE_DIR` | Filesystem path storing encrypted wallet JSONs | `backend/keystore` | Yes |
| `DB_PATH` | SQLite database file location | `backend/data/trustmesh.db` | Yes |
| `CORS_ORIGIN` | Allowed CORS origins for frontend web access | `*` or `https://app.trustmesh.io` | Yes |
| `DEMO_MODE` | Exposes demo holder private keys via `/api/demo/holders` | `true` (set `false` in production) | Yes |
| `DEPLOYER_KEY` | Hex private key for testnet deployments | `0x...` | Testnet only |
| `CONFIRMATIONS` | Block confirmations required before indexing | `1` (local), `2` (testnet) | No |
| `SNAPSHOT_INTERVAL_SEC` | Cadence in seconds for periodic trust snapshots | `300` | No |
| `EXPLORER_BASE_URL` | Block explorer URL for transaction links | `https://sepolia.etherscan.io` | No |

### Frontend Web (`/web`)
| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `VITE_API_URL` | Backend REST API endpoint | `http://localhost:4000` | Yes |
| `VITE_RPC_URL` | Public RPC URL override (defaults from `/api/config`) | `http://127.0.0.1:8545` | No |

---

## 2. Path 1: Local Development (Docker-less)

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Step-by-Step
1. **Install all packages:**
   ```bash
   npm run install:all
   ```
2. **Launch full stack dev environment:**
   ```bash
   npm run dev
   ```
   This orchestrates:
   - Hardhat local node on port `8545`
   - Automated deployment of `TrustRegistry.sol`
   - Bootstrapping of 5 institutional entities (4 universities + 1 employer)
   - Encrypted wallet generation in `backend/keystore`
   - Seeding of 16 demo credentials (revoked, suspended, expired, batch proof)
   - Fastify backend on `http://localhost:4000` (Docs at `/docs`)
   - Web frontend dev server on `http://localhost:5173`

3. **Run Tests & Validation:**
   ```bash
   npm run test:contracts   # Contract tests with gas reporter (>95% coverage)
   npm run test:backend     # REST API & route integration tests
   npm run demo:attacks     # Execute 4 must-demo vectors and 18 core security attacks
   ```

---

## 3. Path 2: Hosted Cloud (Render / Railway + Vercel)

### Backend on Render
1. Push your repository to GitHub.
2. In the Render Dashboard, select **New Blueprint Instance** and connect the repo (uses `infra/render.yaml`).
3. Render creates:
   - `trustmesh-backend`: Web service with a 10GB persistent disk mounted at `/app/backend/data`.
   - `trustmesh-chain`: Standalone hosted node container with deploy-on-boot.
4. Set `CORS_ORIGIN` on `trustmesh-backend` to your Vercel deployment URL.

### Web Frontend on Vercel
1. In Vercel, import the repository and set **Root Directory** to `web`.
2. Configure Environment Variable:
   - `VITE_API_URL`: Your deployed Render backend URL (e.g. `https://trustmesh-backend.onrender.com`).
3. **Note for Person C (Web Owner):**
   Add `web/vercel.json` to handle client-side Single Page Application (SPA) rewrites:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```

---

## 4. Path 3: Public Testnet (Sepolia or Base Sepolia)

### 1. Faucet Funding
Fund your deployer address with testnet ETH:
- Sepolia: [Sepolia Faucet](https://sepoliafaucet.com) or [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
- Base Sepolia: [Base Faucet](https://faucets.chain.link/base-sepolia)

### 2. Configure Environment
Create `.env` in the repository root:
```env
NETWORK=sepolia
RPC_URL=https://rpc.sepolia.org
CHAIN_ID=11155111
DEPLOYER_KEY=0x<YOUR_PRIVATE_KEY>
KEYSTORE_PASSWORD=super-secure-production-passphrase
CONFIRMATIONS=2
DEMO_MODE=false
```

### 3. Deploy and Bootstrap
```bash
npm run deploy:testnet
```
This deploys `TrustRegistry.sol` to Sepolia, registers 3 accreditors, bootstraps the 5 institutions, generates encrypted keystores, and writes `shared/deployments/sepolia.json`.

### 4. Verify on Etherscan
```bash
npx --prefix contracts hardhat verify --network sepolia <DEPLOYED_REGISTRY_ADDRESS> "[\"0xAccreditor1\",\"0xAccreditor2\",\"0xAccreditor3\"]" 86400
```

---

## 5. Operations & Troubleshooting

### Common Questions
- **"JsonRpcProvider connection refused":** Ensure the chain node is running (`npm run chain`) before launching backend or deployment scripts.
- **"AlreadyAnchored":** Credential IDs are deterministic hashes. If you retry issuing an identical credential, the registry prevents duplicate anchors.
- **"NotAuthorizedIssuer":** Only active keys belonging to an active institution can anchor credentials. Rogue keys or keys of suspended institutions are rejected by smart contract modifiers.
