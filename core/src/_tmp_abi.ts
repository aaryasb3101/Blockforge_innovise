export const REGISTRY_ABI = [
  // Constructor
  'constructor(address[3] accreditors, uint64 recoveryDelay)',

  // Institutions
  'function registerInstitution(string did, bytes32 nameHash, address admin) returns (bytes32 id)',
  'function approveInstitution(bytes32 id)',
  'function suspendInstitution(bytes32 id)',
  'function reinstateInstitution(bytes32 id)',
  'function revokeInstitution(bytes32 id)',

  // Keys
  'function addKey(bytes32 institutionId, address key)',
  'function suspendKey(address key)',
  'function reinstateKey(address key)',
  'function revokeKey(address key, uint64 compromisedAt)',
  'function rotateKey(address oldKey, address newKey)',

  // Guardian Recovery
  'function setGuardians(bytes32 institutionId, address[] guardians, uint8 threshold)',
  'function proposeRecovery(bytes32 institutionId, address newAdmin, address newKey) returns (uint256 proposalId)',
  'function approveRecovery(uint256 proposalId)',
  'function executeRecovery(uint256 proposalId)',
  'function cancelRecovery(uint256 proposalId)',

  // Credentials
  'function anchorCredential(bytes32 credentialId, bytes32 merkleRoot, bytes32 schemaHash)',
  'function anchorBatch(bytes32 batchId, bytes32 batchRoot, uint32 count)',
  'function revokeCredential(bytes32 credentialId, uint8 reasonCode)',
  'function revokeBatchCredential(bytes32 batchId, bytes32 credentialId, bytes32[] proof, uint8 reasonCode)',
  'function suspendCredential(bytes32 credentialId)',
  'function reinstateCredential(bytes32 credentialId)',

  // Snapshot
  'function setSnapshotPublisher(address publisher)',
  'function publishSnapshot(bytes32 snapshotHash, uint64 blockNumber)',

  // Views
  'function getInstitution(bytes32) view returns (string did, bytes32 nameHash, address admin, uint8 status, uint8 approvals)',
  'function getKey(address) view returns (bytes32 institutionId, uint8 status, uint64 validFrom, uint64 compromisedAt)',
  'function getAnchor(bytes32) view returns (bytes32 institutionId, address keyAddr, bytes32 merkleRoot, bytes32 schemaHash, uint64 timestamp)',
  'function getBatch(bytes32) view returns (bytes32 institutionId, address keyAddr, bytes32 batchRoot, uint32 count, uint64 timestamp)',
  'function getCredentialStatus(bytes32) view returns (uint8 state, uint8 reasonCode, uint64 timestamp, address by)',
  'function isKeyValidAt(address key, uint64 ts) view returns (bool)',
  'function getGuardians(bytes32) view returns (address[] guardians, uint8 threshold)',
  'function getRecovery(uint256) view returns (bytes32 institutionId, address newAdmin, address newKey, uint8 approvals, uint64 executeAfter, bool executed, bool cancelled)',
  'function institutionCount() view returns (uint256)',
  'function institutionIdAt(uint256) view returns (bytes32)',
  'function keyCount(bytes32) view returns (uint256)',
  'function keyAt(bytes32, uint256) view returns (address)',
  'function snapshotPublisher() view returns (address)',
  'function accreditors() view returns (address[3])',
  'function recoveryDelay() view returns (uint64)',

  // Events
  'event InstitutionRegistered(bytes32 indexed id, string did, address admin)',
  'event InstitutionApproved(bytes32 indexed id, address approver, uint8 approvals)',
  'event InstitutionStatusChanged(bytes32 indexed id, uint8 status)',
  'event KeyAdded(bytes32 indexed institutionId, address indexed key)',
  'event KeyStatusChanged(address indexed key, uint8 status, uint64 compromisedAt)',
  'event KeyRotated(bytes32 indexed institutionId, address indexed oldKey, address indexed newKey)',
  'event GuardiansSet(bytes32 indexed institutionId, uint8 threshold, uint256 count)',
  'event RecoveryProposed(uint256 indexed proposalId, bytes32 indexed institutionId, address newAdmin, address newKey, uint64 executeAfter)',
  'event RecoveryApproved(uint256 indexed proposalId, address guardian, uint8 approvals)',
  'event RecoveryExecuted(uint256 indexed proposalId, bytes32 indexed institutionId)',
  'event RecoveryCancelled(uint256 indexed proposalId)',
  'event CredentialAnchored(bytes32 indexed credentialId, bytes32 indexed institutionId, address indexed key, bytes32 merkleRoot, bytes32 schemaHash)',
  'event BatchAnchored(bytes32 indexed batchId, bytes32 indexed institutionId, address indexed key, bytes32 batchRoot, uint32 count)',
  'event CredentialStatusChanged(bytes32 indexed credentialId, bytes32 indexed institutionId, uint8 state, uint8 reasonCode, address by)',
  'event SnapshotPublisherSet(address publisher)',
  'event SnapshotPublished(bytes32 indexed snapshotHash, uint64 blockNumber, address publisher)',

  // Custom Errors
  'error NotAccreditor()',
  'error NotInstitutionAdmin()',
  'error NotGuardian()',
  'error NotAuthorizedIssuer()',
  'error InstitutionNotActive()',
  'error KeyNotActive()',
  'error KeyAlreadyExists()',
  'error AlreadyAnchored()',
  'error AlreadyApproved()',
  'error NotIssuerOfCredential()',
  'error UnknownInstitution()',
  'error UnknownCredential()',
  'error InvalidProof()',
  'error InvalidState()',
  'error TimelockNotElapsed()',
  'error QuorumNotReached()',
  'error InvalidCompromiseTime()',
  'error NotSnapshotPublisher()',
] as const;
