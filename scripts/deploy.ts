import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { REGISTRY_ABI } from '../shared/abi.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_LOCAL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

interface InstitutionBootstrapConfig {
  slug: string;
  name: string;
  did: string;
  type: 'university' | 'employer';
}

const INSTITUTIONS: InstitutionBootstrapConfig[] = [
  { slug: 'iit-bombay', name: 'IIT Bombay', did: 'did:trustmesh:iit-bombay', type: 'university' },
  { slug: 'nit-trichy', name: 'NIT Trichy', did: 'did:trustmesh:nit-trichy', type: 'university' },
  { slug: 'bits-pilani', name: 'BITS Pilani', did: 'did:trustmesh:bits-pilani', type: 'university' },
  { slug: 'vit-vellore', name: 'VIT Vellore', did: 'did:trustmesh:vit-vellore', type: 'university' },
  { slug: 'acme-corp', name: 'Acme Corp', did: 'did:trustmesh:acme-corp', type: 'employer' },
];

async function main() {
  console.log('====================================================');
  console.log('    TrustMesh Deployment & Bootstrap Orchestrator   ');
  console.log('====================================================');

  const args = process.argv.slice(2);
  let networkName = 'localhost';
  const netArgIdx = args.indexOf('--network');
  if (netArgIdx !== -1 && args[netArgIdx + 1]) {
    networkName = args[netArgIdx + 1];
  } else if (process.env.NETWORK) {
    networkName = process.env.NETWORK;
  }

  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const deployerKey = process.env.DEPLOYER_KEY || DEFAULT_LOCAL_KEY;
  const keystorePassword = process.env.KEYSTORE_PASSWORD || 'trustmesh-secret-key-password-2026';
  const keystoreDir = path.resolve(rootDir, process.env.KEYSTORE_DIR || 'backend/keystore');

  fs.mkdirSync(keystoreDir, { recursive: true });

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`Connected to network: ${networkName} (Chain ID: ${chainId}) via ${rpcUrl}`);

  const deployer = new ethers.Wallet(deployerKey, provider);
  const deployerBal = await provider.getBalance(deployer.address);
  console.log(`Deployer address: ${deployer.address} (Balance: ${ethers.formatEther(deployerBal)} ETH)`);

  const isLocal = networkName === 'localhost' || networkName === 'hardhat' || chainId === 31337;
  const fundAmount = isLocal ? ethers.parseEther('1.0') : ethers.parseEther('0.005');

  const nonces: Record<string, number> = {};
  async function getNextNonce(address: string): Promise<number> {
    if (nonces[address] === undefined) {
      nonces[address] = await provider.getTransactionCount(address, 'latest');
    }
    return nonces[address]++;
  }

  async function getOrCreateWallet(role: string, id: string): Promise<ethers.Wallet> {
    const filename = `${role}_${id}.json`;
    const filepath = path.join(keystoreDir, filename);

    if (fs.existsSync(filepath)) {
      const json = fs.readFileSync(filepath, 'utf8');
      const w = await ethers.Wallet.fromEncryptedJson(json, keystorePassword);
      const connected = w.connect(provider);
      const bal = await provider.getBalance(connected.address);
      if (bal < fundAmount / 2n) {
        const tx = await deployer.sendTransaction({
          to: connected.address,
          value: fundAmount,
          nonce: await getNextNonce(deployer.address),
        });
        await tx.wait(1);
      }
      return connected;
    }

    const randomWallet = ethers.Wallet.createRandom();
    const encrypted = await randomWallet.encrypt(keystorePassword);
    fs.writeFileSync(filepath, encrypted, 'utf8');

    // Fund new wallet
    const tx = await deployer.sendTransaction({
      to: randomWallet.address,
      value: fundAmount,
      nonce: await getNextNonce(deployer.address),
    });
    await tx.wait(1);

    return randomWallet.connect(provider);
  }

  // 1. Accreditors
  console.log('\n[1/6] Bootstrapping 3 Accreditors...');
  const accreditorWallets: ethers.Wallet[] = [];
  for (let i = 0; i < 3; i++) {
    const w = await getOrCreateWallet('accreditor', `idx-${i}`);
    accreditorWallets.push(w);
    console.log(`  Accreditor ${i + 1}: ${w.address}`);
  }

  // 2. Snapshot Publisher
  console.log('\n[2/6] Bootstrapping Snapshot Publisher...');
  const publisherWallet = await getOrCreateWallet('service', 'snapshot-publisher');
  console.log(`  Publisher: ${publisherWallet.address}`);

  // 3. Rogue Actor
  console.log('\n[3/6] Bootstrapping Rogue Unregistered Actor...');
  const rogueAdmin = await getOrCreateWallet('rogue', 'admin');
  const rogueKey = await getOrCreateWallet('rogue', 'key');
  console.log(`  Rogue Key: ${rogueKey.address}`);

  // 4. Demo Holders
  console.log('\n[4/6] Bootstrapping Demo Holders...');
  const holders = ['alice', 'bob', 'carol'];
  for (const h of holders) {
    const hw = await getOrCreateWallet('holder', h);
    console.log(`  Holder ${h}: ${hw.address} (did:pkh:eip155:${chainId}:${hw.address})`);
  }

  // 5. Deploy TrustRegistry
  console.log('\n[5/6] Deploying TrustRegistry.sol...');
  const artifactPath = path.resolve(rootDir, 'contracts/artifacts/contracts/TrustRegistry.sol/TrustRegistry.json');
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Please run hardhat compile first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

  const recoveryDelay = isLocal ? 60 : 86400; // 60s local, 1 day testnet
  const accreditorAddrs: [string, string, string] = [
    accreditorWallets[0].address,
    accreditorWallets[1].address,
    accreditorWallets[2].address,
  ];

  const registryContract = await factory.deploy(accreditorAddrs, recoveryDelay, {
    nonce: await getNextNonce(deployer.address),
  });
  await registryContract.waitForDeployment();
  const registryAddress = await registryContract.getAddress();
  console.log(`  TrustRegistry deployed to: ${registryAddress}`);

  // Set snapshot publisher
  const registryAsAccreditor0 = new ethers.Contract(registryAddress, REGISTRY_ABI, accreditorWallets[0]);
  const pubTx = await registryAsAccreditor0.setSnapshotPublisher(publisherWallet.address, {
    nonce: await getNextNonce(accreditorWallets[0].address),
  });
  await pubTx.wait(1);
  console.log(`  Snapshot publisher configured on-chain.`);

  // 6. Bootstrap Institutions
  console.log('\n[6/6] Bootstrapping Institutions...');
  const deployedInstitutions: any[] = [];

  const registryAsAccreditor1 = new ethers.Contract(registryAddress, REGISTRY_ABI, accreditorWallets[1]);

  for (const inst of INSTITUTIONS) {
    console.log(`\n  >>> Bootstrapping: ${inst.name} (${inst.did})`);
    const adminWallet = await getOrCreateWallet('institution-admin', inst.slug);
    const keyWallet = await getOrCreateWallet('institution-key', `${inst.slug}-1`);

    const gWallets: ethers.Wallet[] = [];
    for (let g = 1; g <= 3; g++) {
      const gw = await getOrCreateWallet('institution-guardian', `${inst.slug}-${g}`);
      gWallets.push(gw);
    }

    const instId = ethers.keccak256(ethers.toUtf8Bytes(inst.did));
    const nameHash = ethers.keccak256(ethers.toUtf8Bytes(inst.name));

    // Register institution
    const regTx = await registryContract.registerInstitution(inst.did, nameHash, adminWallet.address, {
      nonce: await getNextNonce(deployer.address),
    });
    await regTx.wait(1);

    // Accreditor 1 approves
    const app1Tx = await registryAsAccreditor0.approveInstitution(instId, {
      nonce: await getNextNonce(accreditorWallets[0].address),
    });
    await app1Tx.wait(1);

    // Accreditor 2 approves -> becomes Active
    const app2Tx = await registryAsAccreditor1.approveInstitution(instId, {
      nonce: await getNextNonce(accreditorWallets[1].address),
    });
    await app2Tx.wait(1);

    // Admin adds active key
    const registryAsAdmin = new ethers.Contract(registryAddress, REGISTRY_ABI, adminWallet);
    const addKeyTx = await registryAsAdmin.addKey(instId, keyWallet.address, {
      nonce: await getNextNonce(adminWallet.address),
    });
    await addKeyTx.wait(1);

    // Admin sets guardians (3 guardians, threshold 2)
    const setGTx = await registryAsAdmin.setGuardians(
      instId,
      gWallets.map((w) => w.address),
      2,
      {
        nonce: await getNextNonce(adminWallet.address),
      }
    );
    await setGTx.wait(1);


    console.log(`      ID: ${instId}`);
    console.log(`      Admin: ${adminWallet.address}`);
    console.log(`      Key: ${keyWallet.address} (Active)`);
    console.log(`      Guardians: [${gWallets.map((w) => w.address).join(', ')}] (Threshold: 2)`);

    deployedInstitutions.push({
      id: instId,
      slug: inst.slug,
      name: inst.name,
      did: inst.did,
      type: inst.type,
      admin: adminWallet.address,
      keys: [keyWallet.address],
      guardians: gWallets.map((w) => w.address),
      threshold: 2,
    });
  }

  // Write deployment record
  const deploymentsDir = path.resolve(rootDir, 'shared/deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);

  const record = {
    network: networkName,
    chainId,
    registry: registryAddress,
    snapshotPublisher: publisherWallet.address,
    accreditors: accreditorAddrs,
    recoveryDelay,
    institutions: deployedInstitutions,
    rogue: {
      did: 'did:trustmesh:rogue-academy',
      admin: rogueAdmin.address,
      key: rogueKey.address,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(record, null, 2), 'utf8');
  console.log(`\nDeployment manifest written to: ${deploymentFile}`);

  console.log('\n====================================================');
  console.log('            DEPLOYMENT SUMMARY TABLE                ');
  console.log('====================================================');
  console.table([
    { Component: 'TrustRegistry', Address: registryAddress },
    { Component: 'Accreditor 1', Address: accreditorAddrs[0] },
    { Component: 'Accreditor 2', Address: accreditorAddrs[1] },
    { Component: 'Accreditor 3', Address: accreditorAddrs[2] },
    { Component: 'Snapshot Publisher', Address: publisherWallet.address },
    { Component: 'Rogue Key', Address: rogueKey.address },
    ...deployedInstitutions.map((i) => ({
      Component: `${i.name} (Key)`,
      Address: i.keys[0],
    })),
  ]);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Fatal deployment error:', err);
  process.exit(1);
});
