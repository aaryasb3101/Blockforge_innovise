/**
 * TRUSTMESH SHARED SPEC - ABI
 * Human-readable ABI strings for TrustRegistry.sol
 */

export const REGISTRY_ABI = [
  // Constructor
  'constructor(address[3] accreditors, uint64 recoveryDelay)',

  // Institutions
  'function registerInstitution(string did, bytes32 nameHash, address admin) external returns (bytes32 id)',
  'function approveInstitution(bytes32 id) external',
  'function suspendInstitution(bytes32 id) external',
  'function reinstateInstitution(bytes32 id) external',
  'function revokeInstitution(bytes32 id) external',

  // Keys
  'function addKey(bytes32 institutionId, address key) external',
  'function suspendKey(address key) external',
  'function reinstateKey(address key) external',
  'function revokeKey(address key, uint64 compromisedAt) external',
  'function rotateKey(address oldKey, address newKey) external',

  // Guardian recovery
  'function setGuardians(bytes32 institutionId, address[] guardians, uint8 threshold) external',
  'function proposeRecovery(bytes32 institutionId, address newAdmin, address newKey) external returns (uint256 proposalId)',
  'function approveRecovery(uint256 proposalId) external',
  'function executeRecovery(uint256 proposalId) external',
  'function cancelRecovery(uint256 proposalId) external',

  // Credentials
  'function anchorCredential(bytes32 credentialId, bytes32 merkleRoot, bytes32 schemaHash) external',
  'function anchorBatch(bytes32 batchId, bytes32 batchRoot, uint32 count) external',
  'function revokeCredential(bytes32 credentialId, uint8 reasonCode) external',
  'function revokeBatchCredential(bytes32 batchId, bytes32 credentialId, bytes32[] proof, uint8 reasonCode) external',
  'function suspendCredential(bytes32 credentialId) external',
  'function reinstateCredential(bytes32 credentialId) external',

  // Snapshot trust anchor
  'function setSnapshotPublisher(address publisher) external',
  'function publishSnapshot(bytes32 snapshotHash, uint64 blockNumber) external',

  // Views
  'function getInstitution(bytes32 id) external view returns (string did, bytes32 nameHash, address admin, uint8 status, uint8 approvals)',
  'function getKey(address key) external view returns (bytes32 institutionId, uint8 status, uint64 validFrom, uint64 compromisedAt)',
  'function getAnchor(bytes32 credentialId) external view returns (bytes32 institutionId, address keyAddr, bytes32 merkleRoot, bytes32 schemaHash, uint64 timestamp)',
  'function getBatch(bytes32 batchId) external view returns (bytes32 institutionId, address keyAddr, bytes32 batchRoot, uint32 count, uint64 timestamp)',
  'function getCredentialStatus(bytes32 credentialId) external view returns (uint8 state, uint8 reasonCode, uint64 timestamp, address by)',
  'function isKeyValidAt(address key, uint64 ts) external view returns (bool)',
  'function getGuardians(bytes32 institutionId) external view returns (address[] guardians, uint8 threshold)',
  'function getRecovery(uint256 proposalId) external view returns (bytes32 institutionId, address newAdmin, address newKey, uint8 approvals, uint64 executeAfter, bool executed, bool cancelled)',
  'function institutionCount() external view returns (uint256)',
  'function institutionIdAt(uint256 index) external view returns (bytes32)',
  'function keyCount(bytes32 institutionId) external view returns (uint256)',
  'function keyAt(bytes32 institutionId, uint256 index) external view returns (address)',
  'function snapshotPublisher() external view returns (address)',
  'function accreditors() external view returns (address[3])',
  'function recoveryDelay() external view returns (uint64)',

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
