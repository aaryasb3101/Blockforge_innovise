import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MerkleTree } from 'merkletreejs';
import { REGISTRY_ABI } from '../shared/abi.js';
import { canonicalize } from '../backend/src/services/snapshot.js';
import type { Credential } from '../shared/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('====================================================');
  console.log('          TrustMesh Credential Seeder               ');
  console.log('====================================================');

  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const deploymentPath = path.resolve(rootDir, 'shared/deployments/localhost.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found at ${deploymentPath}. Please run deploy.ts first.`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const registryAddress = deployment.registry;
  const chainId = deployment.chainId;
  const password = process.env.KEYSTORE_PASSWORD || 'trustmesh-secret-key-password-2026';
  const keystoreDir = path.resolve(rootDir, process.env.KEYSTORE_DIR || 'backend/keystore');

  async function getWallet(role: string, id: string): Promise<ethers.Wallet> {
    const filename = `${role}_${id}.json`;
    const filepath = path.join(keystoreDir, filename);
    const json = fs.readFileSync(filepath, 'utf8');
    const w = await ethers.Wallet.fromEncryptedJson(json, password);
    return w.connect(provider);
  }

  const holderAlice = await getWallet('holder', 'alice');
  const holderBob = await getWallet('holder', 'bob');
  const holderCarol = await getWallet('holder', 'carol');

  const aliceDid = `did:pkh:eip155:${chainId}:${holderAlice.address}`;
  const bobDid = `did:pkh:eip155:${chainId}:${holderBob.address}`;
  const carolDid = `did:pkh:eip155:${chainId}:${holderCarol.address}`;

  const iitbAdmin = await getWallet('institution-admin', 'iit-bombay');
  const iitbKey = await getWallet('institution-key', 'iit-bombay-1');
  const iitbInstId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:iit-bombay'));

  const nitAdmin = await getWallet('institution-admin', 'nit-trichy');
  const nitKey = await getWallet('institution-key', 'nit-trichy-1');
  const nitInstId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:nit-trichy'));

  const bitsAdmin = await getWallet('institution-admin', 'bits-pilani');
  const bitsKey = await getWallet('institution-key', 'bits-pilani-1');
  const bitsInstId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:bits-pilani'));

  const vitAdmin = await getWallet('institution-admin', 'vit-vellore');
  const vitKey = await getWallet('institution-key', 'vit-vellore-1');
  const vitInstId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:vit-vellore'));

  const acmeAdmin = await getWallet('institution-admin', 'acme-corp');
  const acmeKey = await getWallet('institution-key', 'acme-corp-1');
  const acmeInstId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:acme-corp'));

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

  // Helper to issue + anchor a single credential
  async function createAndAnchor(
    issuerWallet: ethers.Wallet,
    issuerDid: string,
    holderDid: string,
    schema: string,
    fields: Record<string, string | number | boolean>,
    issuanceDate?: number,
    expirationDate: number = 0
  ): Promise<Credential> {
    const iDate = issuanceDate || Math.floor(Date.now() / 1000);
    const sortedKeys = Object.keys(fields).sort();
    const salts: Record<string, string> = {};
    const leaves: Record<string, string> = {};
    const leafArray: string[] = [];

    for (const k of sortedKeys) {
      const salt = ethers.hexlify(ethers.randomBytes(32));
      salts[k] = salt;
      const canonVal = canonicalize(fields[k]);
      const leaf = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|${k}|${canonVal}`));
      leaves[k] = leaf;
      leafArray.push(leaf);
    }

    const tree = new MerkleTree(leafArray, ethers.keccak256, { sortPairs: true, hashLeaves: false });
    const merkleRoot = tree.getHexRoot();

    const signedDigest = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: merkleRoot,
          issuerDid,
          issuanceDate: iDate,
          expirationDate,
          holderDid,
          schema,
        })
      )
    );

    const signature = await issuerWallet.signMessage(ethers.getBytes(signedDigest));
    const credentialId = ethers.keccak256(
      ethers.toUtf8Bytes(canonicalize({ root: merkleRoot, issuerDid, issuanceDate: iDate }))
    );

    const cred: Credential = {
      id: credentialId,
      schema,
      issuerDid,
      issuerKey: issuerWallet.address,
      holderDid,
      issuanceDate: iDate,
      expirationDate,
      fields,
      salts,
      leaves,
      merkleRoot,
      signature,
    };

    // Check if already anchored
    const existingAnchor = await registry.getAnchor(credentialId);
    if (existingAnchor.timestamp === 0n) {
      const schemaHash = ethers.keccak256(ethers.toUtf8Bytes(schema));
      const regWithSigner = registry.connect(issuerWallet) as any;
      const tx = await regWithSigner.anchorCredential(credentialId, merkleRoot, schemaHash);
      await tx.wait(1);
    }

    return cred;
  }

  const seededSamples: Record<string, any> = {};
  const now = Math.floor(Date.now() / 1000);

  console.log('\n[1/7] Seeding standard credentials across universities and employers...');

  // 1. Valid B.Tech Degree (IIT Bombay -> Alice)
  console.log('  1. Issuing IIT Bombay Degree to Alice...');
  const validCred = await createAndAnchor(
    iitbKey,
    'did:trustmesh:iit-bombay',
    aliceDid,
    'btech-degree-v1',
    {
      studentName: 'Alice Sharma',
      degree: 'Bachelor of Technology in Computer Science',
      cgpa: 9.2,
      cgpa_gte_8: true,
      graduated: true,
    }
  );
  seededSamples.valid = validCred;

  // 2. Transcript (IIT Bombay -> Alice)
  console.log('  2. Issuing Semester Transcript to Alice...');
  await createAndAnchor(iitbKey, 'did:trustmesh:iit-bombay', aliceDid, 'transcript-v1', {
    semester: 8,
    creditsCompleted: 160,
    distinction: true,
  });

  // 3. Internship Letter (Acme Corp -> Alice)
  console.log('  3. Issuing Acme Corp Internship to Alice...');
  await createAndAnchor(acmeKey, 'did:trustmesh:acme-corp', aliceDid, 'internship-v1', {
    role: 'Full Stack Engineering Intern',
    durationMonths: 6,
    performanceRating: 'Outstanding',
  });

  // 4. NIT Trichy Degree (Bob)
  console.log('  4. Issuing NIT Trichy Degree to Bob...');
  await createAndAnchor(nitKey, 'did:trustmesh:nit-trichy', bobDid, 'btech-degree-v1', {
    studentName: 'Bob Patel',
    degree: 'Bachelor of Technology in Electrical Engineering',
    cgpa: 8.4,
    cgpa_gte_8: true,
  });

  // 5. Acme Corp Offer Letter (Bob)
  console.log('  5. Issuing Acme Corp Offer Letter to Bob...');
  await createAndAnchor(acmeKey, 'did:trustmesh:acme-corp', bobDid, 'employment-offer-v1', {
    position: 'Systems Engineer',
    startDate: '2026-07-01',
    verifiedBackground: true,
  });

  // 6. BITS Pilani Degree (Carol)
  console.log('  6. Issuing BITS Pilani Degree to Carol...');
  await createAndAnchor(bitsKey, 'did:trustmesh:bits-pilani', carolDid, 'btech-degree-v1', {
    studentName: 'Carol Dsouza',
    degree: 'Bachelor of Engineering in Mechanical',
    cgpa: 8.9,
    cgpa_gte_8: true,
  });

  // 7. BITS Pilani Transcript (Carol)
  console.log('  7. Issuing BITS Pilani Transcript to Carol...');
  await createAndAnchor(bitsKey, 'did:trustmesh:bits-pilani', carolDid, 'transcript-v1', {
    honors: true,
  });

  // 8. VIT Vellore Certification (Alice)
  console.log('  8. Issuing VIT Vellore AI Certification to Alice...');
  await createAndAnchor(vitKey, 'did:trustmesh:vit-vellore', aliceDid, 'certificate-ai-v1', {
    course: 'Advanced Machine Learning & Cryptography',
    grade: 'A+',
  });

  console.log('\n[2/7] Seeding revoked credential (ReasonCode: Fraud)...');
  // 9. Revoked credential
  const revokedCred = await createAndAnchor(
    iitbKey,
    'did:trustmesh:iit-bombay',
    bobDid,
    'course-completion-v1',
    {
      course: 'Cybersecurity Fundamentals',
      forgedHours: true,
    }
  );
  const stRev = await registry.getCredentialStatus(revokedCred.id);
  if (stRev.state !== 2) {
    const regAsAdmin = registry.connect(iitbAdmin) as any;
    const tx = await regAsAdmin.revokeCredential(revokedCred.id, 2); // 2: Fraud
    await tx.wait(1);
    console.log(`     Revoked on-chain: tx=${tx.hash}`);
  }
  seededSamples.revoked = revokedCred;

  console.log('\n[3/7] Seeding suspended credential...');
  // 10. Suspended credential
  const suspendedCred = await createAndAnchor(
    iitbKey,
    'did:trustmesh:iit-bombay',
    carolDid,
    'library-clearance-v1',
    {
      clearanceStatus: 'Pending Fee Payment',
    }
  );
  const stSusp = await registry.getCredentialStatus(suspendedCred.id);
  if (stSusp.state !== 1 && stSusp.state !== 2) {
    const regAsAdmin = registry.connect(iitbAdmin) as any;
    const tx = await regAsAdmin.suspendCredential(suspendedCred.id);
    await tx.wait(1);
    console.log(`     Suspended on-chain: tx=${tx.hash}`);
  }
  seededSamples.suspended = suspendedCred;

  console.log('\n[4/7] Seeding expired credential...');
  // 11. Expired credential
  const expiredCred = await createAndAnchor(
    iitbKey,
    'did:trustmesh:iit-bombay',
    aliceDid,
    'campus-access-pass-v1',
    { passType: 'Visitor Student Access' },
    now - 86400 * 30, // 30 days ago
    now - 86400 * 2 // expired 2 days ago
  );
  seededSamples.expired = expiredCred;

  console.log('\n[5/7] Seeding batch of 5 credentials with 1 selective revocation...');
  // 12-16. Batch of 5
  const batchStudents = [
    { name: 'Student 1', did: aliceDid },
    { name: 'Student 2', did: bobDid },
    { name: 'Student 3', did: carolDid },
    { name: 'Student 4 (To Revoke)', did: bobDid },
    { name: 'Student 5', did: aliceDid },
  ];

  const unbatchedBatchCreds: Credential[] = [];
  const batchTime = now - 500;

  for (const stu of batchStudents) {
    const fields: Record<string, string | number | boolean> = {
      name: stu.name,
      department: 'Computer Science',
      graduatingClass: 2026,
    };
    const sortedK = Object.keys(fields).sort();
    const salts: Record<string, string> = {};
    const leaves: Record<string, string> = {};
    const leafArr: string[] = [];

    for (const k of sortedK) {
      const salt = ethers.hexlify(ethers.randomBytes(32));
      salts[k] = salt;
      const canonVal = canonicalize(fields[k]);
      const leaf = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|${k}|${canonVal}`));
      leaves[k] = leaf;
      leafArr.push(leaf);
    }
    const tree = new MerkleTree(leafArr, ethers.keccak256, { sortPairs: true, hashLeaves: false });
    const merkleRoot = tree.getHexRoot();

    const signedDigest = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: merkleRoot,
          issuerDid: 'did:trustmesh:iit-bombay',
          issuanceDate: batchTime,
          expirationDate: 0,
          holderDid: stu.did,
          schema: 'batch-diploma-v1',
        })
      )
    );
    const signature = await iitbKey.signMessage(ethers.getBytes(signedDigest));
    const credentialId = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalize({
          root: merkleRoot,
          issuerDid: 'did:trustmesh:iit-bombay',
          issuanceDate: batchTime,
        })
      )
    );

    unbatchedBatchCreds.push({
      id: credentialId,
      schema: 'batch-diploma-v1',
      issuerDid: 'did:trustmesh:iit-bombay',
      issuerKey: iitbKey.address,
      holderDid: stu.did,
      issuanceDate: batchTime,
      expirationDate: 0,
      fields,
      salts,
      leaves,
      merkleRoot,
      signature,
    });
  }

  const batchCredIds = unbatchedBatchCreds.map((c) => c.id);
  const batchTree = new MerkleTree(batchCredIds, ethers.keccak256, { sortPairs: true, hashLeaves: false });
  const batchRoot = batchTree.getHexRoot();
  const batchId = ethers.keccak256(
    ethers.concat([batchRoot, ethers.toUtf8Bytes('did:trustmesh:iit-bombay'), ethers.toBeHex(batchTime, 32)])
  );

  const batchedCreds = unbatchedBatchCreds.map((c) => ({
    ...c,
    batch: {
      batchId,
      proof: batchTree.getHexProof(c.id),
    },
  }));

  const existingBatch = await registry.getBatch(batchId);
  if (existingBatch.timestamp === 0n) {
    const regWithSigner = registry.connect(iitbKey) as any;
    const tx = await regWithSigner.anchorBatch(batchId, batchRoot, batchedCreds.length);
    await tx.wait(1);
    console.log(`     Anchored batch of 5: id=${batchId}, tx=${tx.hash}`);
  }

  // Revoke member #3 in batch
  const memberToRevoke = batchedCreds[3];
  const memberSt = await registry.getCredentialStatus(memberToRevoke.id);
  if (memberSt.state !== 2) {
    const regWithAdmin = registry.connect(iitbAdmin) as any;
    const proof = batchTree.getHexProof(memberToRevoke.id);
    const tx = await regWithAdmin.revokeBatchCredential(batchId, memberToRevoke.id, proof, 3); // 3: Error
    await tx.wait(1);
    console.log(`     Revoked batch credential ${memberToRevoke.id} with Merkle proof.`);
  }

  seededSamples.batch = batchedCreds[0];

  console.log('\n[6/7] Key rotation and key compromise window setup...');
  // Rotate NIT key to fresh key
  const nitKeyInfo = await registry.getKey(nitKey.address);
  if (nitKeyInfo.status === 1) {
    const freshKey = await getWallet('institution-key', 'nit-trichy-rotated');
    const nitAdminSigner = registry.connect(nitAdmin) as any;
    const tx = await nitAdminSigner.rotateKey(nitKey.address, freshKey.address);
    await tx.wait(1);
    console.log(`     Rotated NIT key to: ${freshKey.address}`);
  }

  // Compromised key window:
  // Credential 1 issued before compromise -> Valid
  // Credential 2 issued after compromise -> Suspicious
  const compKey = await getWallet('institution-key', 'bits-pilani-compromised');
  const bitsAdminSigner = registry.connect(bitsAdmin) as any;

  const compKeyInfo = await registry.getKey(compKey.address);
  if (compKeyInfo.status === 0) {
    const addTx = await bitsAdminSigner.addKey(bitsInstId, compKey.address);
    await addTx.wait(1);
  }

  const tBefore = now - 2000;
  const tCompromise = now - 1000;
  const tAfter = now - 100;

  const credCompBefore = await createAndAnchor(
    compKey,
    'did:trustmesh:bits-pilani',
    aliceDid,
    'lab-safety-certificate-v1',
    { labScore: 98 },
    tBefore
  );
  seededSamples.compromisedBefore = credCompBefore;

  const credCompAfter = await createAndAnchor(
    compKey,
    'did:trustmesh:bits-pilani',
    bobDid,
    'lab-safety-certificate-v1',
    { labScore: 72 },
    tAfter
  );
  seededSamples.compromisedAfter = credCompAfter;

  const updatedCompKey = await registry.getKey(compKey.address);
  if (updatedCompKey.status !== 3) {
    const revKeyTx = await bitsAdminSigner.revokeKey(compKey.address, tCompromise);
    await revKeyTx.wait(1);
    console.log(`     Key revoked with compromisedAt = ${tCompromise}`);
  }

  // Tampered sample
  const tamperedCred = JSON.parse(JSON.stringify(validCred));
  tamperedCred.fields.cgpa = 9.99; // Tampered CGPA without re-computing leaf or root!
  seededSamples.tampered = tamperedCred;

  // Rogue sample
  const rogueKey = await getWallet('rogue', 'key');
  const rogueCred = JSON.parse(JSON.stringify(validCred));
  rogueCred.issuerDid = 'did:trustmesh:rogue-academy';
  rogueCred.issuerKey = rogueKey.address;
  seededSamples.rogue = rogueCred;

  // Write demo samples to shared directory for backend and web
  const samplesFile = path.resolve(rootDir, 'shared/demo-samples.json');
  fs.writeFileSync(samplesFile, JSON.stringify(seededSamples, null, 2), 'utf8');
  console.log(`\nDemo sample credentials written to: ${samplesFile}`);

  console.log('\n====================================================');
  console.log('   All 16 Credentials Seeded Successfully!          ');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
