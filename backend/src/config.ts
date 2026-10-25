import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('0.0.0.0'),
  MODE: z
    .enum(['local', 'hosted', 'testnet', 'test'])
    .default('local')
    .transform((val) => (val === 'test' ? 'local' : val)),
  RPC_URL: z.string().default('http://127.0.0.1:8545'),
  CHAIN_ID: z.coerce.number().default(31337),
  REGISTRY_ADDRESS: z.string().optional(),
  KEYSTORE_PASSWORD: z.string().default('trustmesh-secret-key-password-2026'),
  KEYSTORE_DIR: z.string().default('backend/keystore'),
  DB_PATH: z.string().default('backend/data/trustmesh.db'),
  CORS_ORIGIN: z.string().default('*'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((val) => val === undefined || val === 'true' || val === '1'),
  DEPLOYER_KEY: z.string().optional(),
  CONFIRMATIONS: z.coerce.number().default(1),
  SNAPSHOT_INTERVAL_SEC: z.coerce.number().default(300),
  EXPLORER_BASE_URL: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

// If REGISTRY_ADDRESS is not provided, try to auto-load from shared/deployments/<network>.json
let resolvedRegistryAddress = parsed.REGISTRY_ADDRESS;
let snapshotPublisherAddress = '0x0000000000000000000000000000000000000000';
let deployedInstitutions: any[] = [];

const networkName = parsed.MODE === 'testnet' ? 'sepolia' : 'localhost';
const deploymentPath = path.resolve(rootDir, `shared/deployments/${networkName}.json`);

if (!resolvedRegistryAddress && fs.existsSync(deploymentPath)) {
  try {
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    resolvedRegistryAddress = deploymentData.registry;
    snapshotPublisherAddress = deploymentData.snapshotPublisher || snapshotPublisherAddress;
    deployedInstitutions = deploymentData.institutions || [];
  } catch (err) {
    console.warn(`Could not read deployment at ${deploymentPath}:`, err);
  }
}

export const config = {
  port: parsed.PORT,
  host: parsed.HOST,
  mode: parsed.MODE,
  rpcUrl: parsed.RPC_URL,
  chainId: parsed.CHAIN_ID,
  registryAddress: resolvedRegistryAddress || '0x0000000000000000000000000000000000000000',
  snapshotPublisherAddress,
  keystorePassword: parsed.KEYSTORE_PASSWORD,
  keystoreDir: path.resolve(rootDir, parsed.KEYSTORE_DIR),
  dbPath: path.resolve(rootDir, parsed.DB_PATH),
  corsOrigin: parsed.CORS_ORIGIN,
  demoMode: parsed.DEMO_MODE,
  deployerKey: parsed.DEPLOYER_KEY,
  confirmations: parsed.CONFIRMATIONS,
  snapshotIntervalSec: parsed.SNAPSHOT_INTERVAL_SEC,
  explorerBaseUrl: parsed.EXPLORER_BASE_URL,
  deployedInstitutions,
  rootDir,
};
