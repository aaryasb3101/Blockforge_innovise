import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TrustRegistry } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('TrustRegistry', () => {
  let registry: TrustRegistry;
  let deployer: SignerWithAddress;
  let accreditor1: SignerWithAddress;
  let accreditor2: SignerWithAddress;
  let accreditor3: SignerWithAddress;
  let instAdmin: SignerWithAddress;
  let issuerKey1: SignerWithAddress;
  let issuerKey2: SignerWithAddress;
  let guardian1: SignerWithAddress;
  let guardian2: SignerWithAddress;
  let guardian3: SignerWithAddress;
  let stranger: SignerWithAddress;
  let snapshotPub: SignerWithAddress;

  const RECOVERY_DELAY = 60; // 60 seconds for testing
  const sampleDid = 'did:trustmesh:iit-bombay';
  let instId: string;
  const nameHash = ethers.keccak256(ethers.toUtf8Bytes('IIT Bombay'));

  beforeEach(async () => {
    [
      deployer,
      accreditor1,
      accreditor2,
      accreditor3,
      instAdmin,
      issuerKey1,
      issuerKey2,
      guardian1,
      guardian2,
      guardian3,
      stranger,
      snapshotPub,
    ] = await ethers.getSigners();

    const TrustRegistryFactory = await ethers.getContractFactory('TrustRegistry');
    registry = await TrustRegistryFactory.deploy(
      [accreditor1.address, accreditor2.address, accreditor3.address],
      RECOVERY_DELAY
    );
    await registry.waitForDeployment();

    instId = ethers.keccak256(ethers.toUtf8Bytes(sampleDid));
  });

  describe('Constructor & Initial State', () => {
    it('initializes accreditors and recovery delay correctly', async () => {
      const accreditors = await registry.accreditors();
      expect(accreditors[0]).to.equal(accreditor1.address);
      expect(accreditors[1]).to.equal(accreditor2.address);
      expect(accreditors[2]).to.equal(accreditor3.address);
      expect(await registry.recoveryDelay()).to.equal(RECOVERY_DELAY);
    });

    it('reverts if any accreditor address is zero', async () => {
      const TrustRegistryFactory = await ethers.getContractFactory('TrustRegistry');
      await expect(
        TrustRegistryFactory.deploy(
          [ethers.ZeroAddress, accreditor2.address, accreditor3.address],
          RECOVERY_DELAY
        )
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });
  });

  describe('Institution Registration & Accreditation', () => {
    it('registers institution in Pending state and emits InstitutionRegistered', async () => {
      await expect(registry.connect(stranger).registerInstitution(sampleDid, nameHash, instAdmin.address))
        .to.emit(registry, 'InstitutionRegistered')
        .withArgs(instId, sampleDid, instAdmin.address);

      expect(await registry.institutionCount()).to.equal(1);
      expect(await registry.institutionIdAt(0)).to.equal(instId);

      const inst = await registry.getInstitution(instId);
      expect(inst.did).to.equal(sampleDid);
      expect(inst.nameHash).to.equal(nameHash);
      expect(inst.admin).to.equal(instAdmin.address);
      expect(inst.status).to.equal(0); // Pending
      expect(inst.approvals).to.equal(0);
    });

    it('reverts on duplicate registration or empty fields', async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await expect(
        registry.registerInstitution(sampleDid, nameHash, instAdmin.address)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      await expect(
        registry.registerInstitution('', nameHash, instAdmin.address)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      await expect(
        registry.registerInstitution('did:trustmesh:other', nameHash, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });

    it('requires accreditor to approve', async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await expect(
        registry.connect(stranger).approveInstitution(instId)
      ).to.be.revertedWithCustomError(registry, 'NotAccreditor');
    });

    it('reverts approving unknown institution', async () => {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes('did:trustmesh:unknown'));
      await expect(
        registry.connect(accreditor1).approveInstitution(fakeId)
      ).to.be.revertedWithCustomError(registry, 'UnknownInstitution');
    });

    it('requires 2 distinct accreditor approvals to activate institution', async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);

      // First approval
      await expect(registry.connect(accreditor1).approveInstitution(instId))
        .to.emit(registry, 'InstitutionApproved')
        .withArgs(instId, accreditor1.address, 1);

      let inst = await registry.getInstitution(instId);
      expect(inst.status).to.equal(0); // Still Pending
      expect(inst.approvals).to.equal(1);

      // Repeat approval from same accreditor
      await expect(
        registry.connect(accreditor1).approveInstitution(instId)
      ).to.be.revertedWithCustomError(registry, 'AlreadyApproved');

      // Second approval from distinct accreditor -> transitions to Active
      await expect(registry.connect(accreditor2).approveInstitution(instId))
        .to.emit(registry, 'InstitutionApproved')
        .withArgs(instId, accreditor2.address, 2)
        .and.to.emit(registry, 'InstitutionStatusChanged')
        .withArgs(instId, 1); // Active

      inst = await registry.getInstitution(instId);
      expect(inst.status).to.equal(1); // Active
      expect(inst.approvals).to.equal(2);
    });

    it('handles institution suspension, reinstatement, and revocation', async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await registry.connect(accreditor1).approveInstitution(instId);
      await registry.connect(accreditor2).approveInstitution(instId);

      // Suspend
      await expect(registry.connect(accreditor1).suspendInstitution(instId))
        .to.emit(registry, 'InstitutionStatusChanged')
        .withArgs(instId, 2); // Suspended

      let inst = await registry.getInstitution(instId);
      expect(inst.status).to.equal(2);

      // Reinstate
      await expect(registry.connect(accreditor3).reinstateInstitution(instId))
        .to.emit(registry, 'InstitutionStatusChanged')
        .withArgs(instId, 1); // Active

      inst = await registry.getInstitution(instId);
      expect(inst.status).to.equal(1);

      // Revoke
      await expect(registry.connect(accreditor2).revokeInstitution(instId))
        .to.emit(registry, 'InstitutionStatusChanged')
        .withArgs(instId, 3); // Revoked

      inst = await registry.getInstitution(instId);
      expect(inst.status).to.equal(3);

      // Cannot revoke again
      await expect(
        registry.connect(accreditor1).revokeInstitution(instId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });

    it('rejects invalid state transitions on institutions', async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);

      // Cannot suspend pending institution
      await expect(
        registry.connect(accreditor1).suspendInstitution(instId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      // Cannot reinstate pending institution
      await expect(
        registry.connect(accreditor1).reinstateInstitution(instId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });
  });

  describe('Key Management & Lifecycle', () => {
    beforeEach(async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await registry.connect(accreditor1).approveInstitution(instId);
      await registry.connect(accreditor2).approveInstitution(instId);
    });

    it('allows admin to add key to active institution and view key details', async () => {
      await expect(registry.connect(instAdmin).addKey(instId, issuerKey1.address))
        .to.emit(registry, 'KeyAdded')
        .withArgs(instId, issuerKey1.address);

      expect(await registry.keyCount(instId)).to.equal(1);
      expect(await registry.keyAt(instId, 0)).to.equal(issuerKey1.address);

      const keyInfo = await registry.getKey(issuerKey1.address);
      expect(keyInfo.institutionId).to.equal(instId);
      expect(keyInfo.status).to.equal(1); // Active
      expect(keyInfo.validFrom).to.be.gt(0);
      expect(keyInfo.compromisedAt).to.equal(0);
    });

    it('prevents non-admin from adding key', async () => {
      await expect(
        registry.connect(stranger).addKey(instId, issuerKey1.address)
      ).to.be.revertedWithCustomError(registry, 'NotInstitutionAdmin');
    });

    it('prevents adding key to non-active institution', async () => {
      await registry.connect(accreditor1).suspendInstitution(instId);
      await expect(
        registry.connect(instAdmin).addKey(instId, issuerKey1.address)
      ).to.be.revertedWithCustomError(registry, 'InstitutionNotActive');
    });

    it('prevents duplicate key registration or zero address key', async () => {
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);
      await expect(
        registry.connect(instAdmin).addKey(instId, issuerKey1.address)
      ).to.be.revertedWithCustomError(registry, 'KeyAlreadyExists');

      await expect(
        registry.connect(instAdmin).addKey(instId, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, 'KeyAlreadyExists');
    });

    it('supports suspend and reinstate key lifecycle', async () => {
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);

      // Suspend
      await expect(registry.connect(instAdmin).suspendKey(issuerKey1.address))
        .to.emit(registry, 'KeyStatusChanged')
        .withArgs(issuerKey1.address, 2, 0); // Suspended

      let keyInfo = await registry.getKey(issuerKey1.address);
      expect(keyInfo.status).to.equal(2);

      // Cannot suspend again
      await expect(
        registry.connect(instAdmin).suspendKey(issuerKey1.address)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      // Reinstate
      await expect(registry.connect(instAdmin).reinstateKey(issuerKey1.address))
        .to.emit(registry, 'KeyStatusChanged')
        .withArgs(issuerKey1.address, 1, 0); // Active

      keyInfo = await registry.getKey(issuerKey1.address);
      expect(keyInfo.status).to.equal(1);
    });

    it('supports revoking key with compromisedAt timestamp', async () => {
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);
      const now = await time.latest();

      await expect(
        registry.connect(instAdmin).revokeKey(issuerKey1.address, 0)
      ).to.be.revertedWithCustomError(registry, 'InvalidCompromiseTime');

      await expect(
        registry.connect(instAdmin).revokeKey(issuerKey1.address, now + 1000)
      ).to.be.revertedWithCustomError(registry, 'InvalidCompromiseTime');

      await expect(registry.connect(instAdmin).revokeKey(issuerKey1.address, now))
        .to.emit(registry, 'KeyStatusChanged')
        .withArgs(issuerKey1.address, 3, now); // Revoked

      const keyInfo = await registry.getKey(issuerKey1.address);
      expect(keyInfo.status).to.equal(3);
      expect(keyInfo.compromisedAt).to.equal(now);

      // Cannot revoke again
      await expect(
        registry.connect(instAdmin).revokeKey(issuerKey1.address, now)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });

    it('supports rotating active key to retired and new key to active', async () => {
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);

      await expect(registry.connect(instAdmin).rotateKey(issuerKey1.address, issuerKey2.address))
        .to.emit(registry, 'KeyStatusChanged')
        .withArgs(issuerKey1.address, 4, 0) // Retired
        .and.to.emit(registry, 'KeyAdded')
        .withArgs(instId, issuerKey2.address)
        .and.to.emit(registry, 'KeyRotated')
        .withArgs(instId, issuerKey1.address, issuerKey2.address);

      const oldKey = await registry.getKey(issuerKey1.address);
      expect(oldKey.status).to.equal(4); // Retired

      const newKey = await registry.getKey(issuerKey2.address);
      expect(newKey.status).to.equal(1); // Active
    });

    it('verifies isKeyValidAt timestamp semantics accurately', async () => {
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);
      const addedTime = await time.latest();

      // Before validFrom -> false
      expect(await registry.isKeyValidAt(issuerKey1.address, addedTime - 10)).to.be.false;

      // At or after validFrom -> true
      expect(await registry.isKeyValidAt(issuerKey1.address, addedTime + 10)).to.be.true;

      // Unknown key -> false
      expect(await registry.isKeyValidAt(stranger.address, addedTime)).to.be.false;

      // Revoke with compromise time = addedTime + 20
      const compTime = addedTime + 20;
      await time.setNextBlockTimestamp(addedTime + 30);
      await registry.connect(instAdmin).revokeKey(issuerKey1.address, compTime);

      // Before compromise time -> still valid historically!
      expect(await registry.isKeyValidAt(issuerKey1.address, compTime - 1)).to.be.true;

      // At or after compromise time -> invalid!
      expect(await registry.isKeyValidAt(issuerKey1.address, compTime)).to.be.false;
      expect(await registry.isKeyValidAt(issuerKey1.address, compTime + 10)).to.be.false;
    });
  });

  describe('Credential Anchoring & Lifecycle', () => {
    const credId = ethers.keccak256(ethers.toUtf8Bytes('credential-1'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkle-root-1'));
    const schemaHash = ethers.keccak256(ethers.toUtf8Bytes('schema-hash-degree'));

    beforeEach(async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await registry.connect(accreditor1).approveInstitution(instId);
      await registry.connect(accreditor2).approveInstitution(instId);
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);
    });

    it('anchors credential successfully and emits CredentialAnchored', async () => {
      await expect(
        registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash)
      )
        .to.emit(registry, 'CredentialAnchored')
        .withArgs(credId, instId, issuerKey1.address, merkleRoot, schemaHash);

      const anchor = await registry.getAnchor(credId);
      expect(anchor.institutionId).to.equal(instId);
      expect(anchor.keyAddr).to.equal(issuerKey1.address);
      expect(anchor.merkleRoot).to.equal(merkleRoot);
      expect(anchor.schemaHash).to.equal(schemaHash);
      expect(anchor.timestamp).to.be.gt(0);

      const status = await registry.getCredentialStatus(credId);
      expect(status.state).to.equal(0); // Good
      expect(status.reasonCode).to.equal(0);
      expect(status.by).to.equal(issuerKey1.address);
    });

    it('prevents unauthorized or rogue key from anchoring', async () => {
      await expect(
        registry.connect(stranger).anchorCredential(credId, merkleRoot, schemaHash)
      ).to.be.revertedWithCustomError(registry, 'NotAuthorizedIssuer');
    });

    it('prevents suspended key or key from suspended institution from anchoring', async () => {
      await registry.connect(instAdmin).suspendKey(issuerKey1.address);
      await expect(
        registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash)
      ).to.be.revertedWithCustomError(registry, 'KeyNotActive');

      await registry.connect(instAdmin).reinstateKey(issuerKey1.address);
      await registry.connect(accreditor1).suspendInstitution(instId);
      await expect(
        registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash)
      ).to.be.revertedWithCustomError(registry, 'InstitutionNotActive');
    });

    it('prevents duplicate anchoring', async () => {
      await registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash);
      await expect(
        registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash)
      ).to.be.revertedWithCustomError(registry, 'AlreadyAnchored');
    });

    it('supports suspend and reinstate credential lifecycle', async () => {
      await registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash);

      // Suspend
      await expect(registry.connect(issuerKey1).suspendCredential(credId))
        .to.emit(registry, 'CredentialStatusChanged')
        .withArgs(credId, instId, 1, 0, issuerKey1.address); // Suspended

      let status = await registry.getCredentialStatus(credId);
      expect(status.state).to.equal(1); // Suspended

      // Cannot suspend if already suspended
      await expect(
        registry.connect(issuerKey1).suspendCredential(credId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      // Admin can reinstate
      await expect(registry.connect(instAdmin).reinstateCredential(credId))
        .to.emit(registry, 'CredentialStatusChanged')
        .withArgs(credId, instId, 0, 0, instAdmin.address); // Good

      status = await registry.getCredentialStatus(credId);
      expect(status.state).to.equal(0); // Good
    });

    it('supports revocation and ensures Revoked is final', async () => {
      await registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash);

      // Revoke with reason code 2 (Fraud)
      await expect(registry.connect(instAdmin).revokeCredential(credId, 2))
        .to.emit(registry, 'CredentialStatusChanged')
        .withArgs(credId, instId, 2, 2, instAdmin.address); // Revoked

      const status = await registry.getCredentialStatus(credId);
      expect(status.state).to.equal(2); // Revoked
      expect(status.reasonCode).to.equal(2);

      // Cannot revoke again
      await expect(
        registry.connect(instAdmin).revokeCredential(credId, 2)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      // Cannot suspend when revoked
      await expect(
        registry.connect(instAdmin).suspendCredential(credId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      // Cannot reinstate when revoked
      await expect(
        registry.connect(instAdmin).reinstateCredential(credId)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });

    it('prevents non-issuer from modifying credential status', async () => {
      await registry.connect(issuerKey1).anchorCredential(credId, merkleRoot, schemaHash);
      await expect(
        registry.connect(stranger).revokeCredential(credId, 1)
      ).to.be.revertedWithCustomError(registry, 'NotIssuerOfCredential');

      await expect(
        registry.connect(stranger).suspendCredential(credId)
      ).to.be.revertedWithCustomError(registry, 'NotIssuerOfCredential');
    });
  });

  describe('Batch Anchoring & Batch Revocation', () => {
    const batchId = ethers.keccak256(ethers.toUtf8Bytes('batch-1'));
    const credId0 = ethers.keccak256(ethers.toUtf8Bytes('batch-cred-0'));
    const credId1 = ethers.keccak256(ethers.toUtf8Bytes('batch-cred-1'));

    let batchRoot: string;
    let proof0: string[];

    beforeEach(async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await registry.connect(accreditor1).approveInstitution(instId);
      await registry.connect(accreditor2).approveInstitution(instId);
      await registry.connect(instAdmin).addKey(instId, issuerKey1.address);

      // Build 2-leaf Merkle tree sorted pairs
      const [left, right] = BigInt(credId0) < BigInt(credId1) ? [credId0, credId1] : [credId1, credId0];
      batchRoot = ethers.keccak256(ethers.concat([left, right]));
      proof0 = [credId1];
    });

    it('anchors batch and allows selective revocation with Merkle proof', async () => {
      await expect(registry.connect(issuerKey1).anchorBatch(batchId, batchRoot, 2))
        .to.emit(registry, 'BatchAnchored')
        .withArgs(batchId, instId, issuerKey1.address, batchRoot, 2);

      const batch = await registry.getBatch(batchId);
      expect(batch.batchRoot).to.equal(batchRoot);
      expect(batch.count).to.equal(2);

      // Revoke credId0 with valid proof
      await expect(
        registry.connect(issuerKey1).revokeBatchCredential(batchId, credId0, proof0, 1)
      )
        .to.emit(registry, 'CredentialStatusChanged')
        .withArgs(credId0, instId, 2, 1, issuerKey1.address);

      const status = await registry.getCredentialStatus(credId0);
      expect(status.state).to.equal(2); // Revoked

      // Revoking with invalid proof fails
      const fakeProof = [ethers.ZeroHash];
      await expect(
        registry.connect(issuerKey1).revokeBatchCredential(batchId, credId1, fakeProof, 1)
      ).to.be.revertedWithCustomError(registry, 'InvalidProof');

      // Attempting to suspend or reinstate already revoked batch credential
      await expect(
        registry.connect(issuerKey1).suspendCredential(credId0)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      await expect(
        registry.connect(issuerKey1).reinstateCredential(credId0)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });

    it('rejects duplicate batch anchor or invalid batch params', async () => {
      await registry.connect(issuerKey1).anchorBatch(batchId, batchRoot, 2);
      await expect(
        registry.connect(issuerKey1).anchorBatch(batchId, batchRoot, 2)
      ).to.be.revertedWithCustomError(registry, 'AlreadyAnchored');

      await expect(
        registry.connect(issuerKey1).anchorBatch(ethers.ZeroHash, batchRoot, 2)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');

      await expect(
        registry.connect(issuerKey1).anchorBatch(batchId, batchRoot, 0)
      ).to.be.revertedWithCustomError(registry, 'InvalidState');
    });
  });

  describe('Guardian Recovery (M-of-N + Timelock)', () => {
    const newAdmin = ethers.Wallet.createRandom().address;
    const newKey = ethers.Wallet.createRandom().address;

    beforeEach(async () => {
      await registry.registerInstitution(sampleDid, nameHash, instAdmin.address);
      await registry.connect(accreditor1).approveInstitution(instId);
      await registry.connect(accreditor2).approveInstitution(instId);

      // Set 3 guardians with threshold 2
      await expect(
        registry
          .connect(instAdmin)
          .setGuardians(instId, [guardian1.address, guardian2.address, guardian3.address], 2)
      )
        .to.emit(registry, 'GuardiansSet')
        .withArgs(instId, 2, 3);

      const gInfo = await registry.getGuardians(instId);
      expect(gInfo.guardians.length).to.equal(3);
      expect(gInfo.threshold).to.equal(2);
    });

    it('follows full guardian recovery happy path with timelock', async () => {
      // Guardian 1 proposes recovery
      const tx = await registry.connect(guardian1).proposeRecovery(instId, newAdmin, newKey);
      await expect(tx)
        .to.emit(registry, 'RecoveryProposed')
        .and.to.emit(registry, 'RecoveryApproved')
        .withArgs(1, guardian1.address, 1);

      let prop = await registry.getRecovery(1);
      expect(prop.institutionId).to.equal(instId);
      expect(prop.newAdmin).to.equal(newAdmin);
      expect(prop.newKey).to.equal(newKey);
      expect(prop.approvals).to.equal(1);
      expect(prop.executed).to.be.false;

      // Guardian 2 approves recovery -> reaches threshold 2
      await expect(registry.connect(guardian2).approveRecovery(1))
        .to.emit(registry, 'RecoveryApproved')
        .withArgs(1, guardian2.address, 2);

      // Execution before timelock elapses fails
      await expect(registry.connect(stranger).executeRecovery(1)).to.be.revertedWithCustomError(
        registry,
        'TimelockNotElapsed'
      );

      // Fast forward past recoveryDelay
      await time.increase(RECOVERY_DELAY + 1);

      // Execution succeeds
      await expect(registry.connect(stranger).executeRecovery(1))
        .to.emit(registry, 'RecoveryExecuted')
        .withArgs(1, instId)
        .and.to.emit(registry, 'KeyAdded')
        .withArgs(instId, newKey);

      // Admin is updated
      const inst = await registry.getInstitution(instId);
      expect(inst.admin).to.equal(newAdmin);

      // Key is activated
      const keyInfo = await registry.getKey(newKey);
      expect(keyInfo.status).to.equal(1); // Active
    });

    it('rejects proposal without quorum', async () => {
      await registry.connect(guardian1).proposeRecovery(instId, newAdmin, newKey);
      await time.increase(RECOVERY_DELAY + 1);

      await expect(registry.connect(stranger).executeRecovery(1)).to.be.revertedWithCustomError(
        registry,
        'QuorumNotReached'
      );
    });

    it('allows admin to cancel recovery proposal', async () => {
      await registry.connect(guardian1).proposeRecovery(instId, newAdmin, newKey);
      await registry.connect(guardian2).approveRecovery(1);

      // Admin cancels
      await expect(registry.connect(instAdmin).cancelRecovery(1))
        .to.emit(registry, 'RecoveryCancelled')
        .withArgs(1);

      await time.increase(RECOVERY_DELAY + 1);

      // Cannot execute cancelled recovery
      await expect(registry.connect(stranger).executeRecovery(1)).to.be.revertedWithCustomError(
        registry,
        'InvalidState'
      );
    });

    it('rejects recovery proposal or approval from non-guardians', async () => {
      await expect(
        registry.connect(stranger).proposeRecovery(instId, newAdmin, newKey)
      ).to.be.revertedWithCustomError(registry, 'NotGuardian');

      await registry.connect(guardian1).proposeRecovery(instId, newAdmin, newKey);
      await expect(
        registry.connect(stranger).approveRecovery(1)
      ).to.be.revertedWithCustomError(registry, 'NotGuardian');
    });
  });

  describe('Snapshot Trust Anchor', () => {
    it('allows accreditor to set snapshot publisher and publisher to anchor snapshots', async () => {
      await expect(registry.connect(accreditor1).setSnapshotPublisher(snapshotPub.address))
        .to.emit(registry, 'SnapshotPublisherSet')
        .withArgs(snapshotPub.address);

      expect(await registry.snapshotPublisher()).to.equal(snapshotPub.address);

      const snapHash = ethers.keccak256(ethers.toUtf8Bytes('snapshot-1'));
      await expect(registry.connect(snapshotPub).publishSnapshot(snapHash, 100))
        .to.emit(registry, 'SnapshotPublished')
        .withArgs(snapHash, 100, snapshotPub.address);
    });

    it('rejects non-accreditor setting publisher and non-publisher publishing snapshot', async () => {
      await expect(
        registry.connect(stranger).setSnapshotPublisher(snapshotPub.address)
      ).to.be.revertedWithCustomError(registry, 'NotAccreditor');

      const snapHash = ethers.keccak256(ethers.toUtf8Bytes('snapshot-1'));
      await expect(
        registry.connect(stranger).publishSnapshot(snapHash, 100)
      ).to.be.revertedWithCustomError(registry, 'NotSnapshotPublisher');
    });
  });
});
