// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title TrustRegistry
 * @notice Decentralized institutional trust infrastructure registry for TrustMesh.
 * Institutions register and are accredited; institutions manage keys and guardians;
 * authorized keys anchor credential roots; institutions may suspend/reinstate/revoke credentials;
 * accreditors anchor trusted snapshot publisher addresses.
 */
contract TrustRegistry {
    // ========================================================================
    // Enums
    // ========================================================================

    enum InstitutionStatus {
        Pending,
        Active,
        Suspended,
        Revoked
    }

    enum KeyStatus {
        None,
        Active,
        Suspended,
        Revoked, // compromised
        Retired  // rotated, no compromise
    }

    enum CredState {
        Good,
        Suspended,
        Revoked
    }

    // ========================================================================
    // Custom Errors
    // ========================================================================

    error NotAccreditor();
    error NotInstitutionAdmin();
    error NotGuardian();
    error NotAuthorizedIssuer();
    error InstitutionNotActive();
    error KeyNotActive();
    error KeyAlreadyExists();
    error AlreadyAnchored();
    error AlreadyApproved();
    error NotIssuerOfCredential();
    error UnknownInstitution();
    error UnknownCredential();
    error InvalidProof();
    error InvalidState();
    error TimelockNotElapsed();
    error QuorumNotReached();
    error InvalidCompromiseTime();
    error NotSnapshotPublisher();

    // ========================================================================
    // Events
    // ========================================================================

    event InstitutionRegistered(bytes32 indexed id, string did, address admin);
    event InstitutionApproved(bytes32 indexed id, address approver, uint8 approvals);
    event InstitutionStatusChanged(bytes32 indexed id, uint8 status);
    event KeyAdded(bytes32 indexed institutionId, address indexed key);
    event KeyStatusChanged(address indexed key, uint8 status, uint64 compromisedAt);
    event KeyRotated(bytes32 indexed institutionId, address indexed oldKey, address indexed newKey);
    event GuardiansSet(bytes32 indexed institutionId, uint8 threshold, uint256 count);
    event RecoveryProposed(uint256 indexed proposalId, bytes32 indexed institutionId, address newAdmin, address newKey, uint64 executeAfter);
    event RecoveryApproved(uint256 indexed proposalId, address guardian, uint8 approvals);
    event RecoveryExecuted(uint256 indexed proposalId, bytes32 indexed institutionId);
    event RecoveryCancelled(uint256 indexed proposalId);
    event CredentialAnchored(bytes32 indexed credentialId, bytes32 indexed institutionId, address indexed key, bytes32 merkleRoot, bytes32 schemaHash);
    event BatchAnchored(bytes32 indexed batchId, bytes32 indexed institutionId, address indexed key, bytes32 batchRoot, uint32 count);
    event CredentialStatusChanged(bytes32 indexed credentialId, bytes32 indexed institutionId, uint8 state, uint8 reasonCode, address by);
    event SnapshotPublisherSet(address publisher);
    event SnapshotPublished(bytes32 indexed snapshotHash, uint64 blockNumber, address publisher);

    // ========================================================================
    // Structs
    // ========================================================================

    struct Institution {
        string did;
        bytes32 nameHash;
        address admin;
        InstitutionStatus status;
        uint8 approvals;
    }

    struct KeyInfo {
        bytes32 institutionId;
        KeyStatus status;
        uint64 validFrom;
        uint64 compromisedAt;
    }

    struct AnchorInfo {
        bytes32 institutionId;
        address keyAddr;
        bytes32 merkleRoot;
        bytes32 schemaHash;
        uint64 timestamp;
    }

    struct BatchInfo {
        bytes32 institutionId;
        address keyAddr;
        bytes32 batchRoot;
        uint32 count;
        uint64 timestamp;
    }

    struct CredentialStatusInfo {
        CredState state;
        uint8 reasonCode;
        uint64 timestamp;
        address by;
        bytes32 institutionId;
    }

    struct RecoveryProposal {
        bytes32 institutionId;
        address newAdmin;
        address newKey;
        uint8 approvals;
        uint64 executeAfter;
        bool executed;
        bool cancelled;
    }

    // ========================================================================
    // State Variables
    // ========================================================================

    address[3] private _accreditors;
    uint64 private _recoveryDelay;
    address public snapshotPublisher;

    mapping(bytes32 => Institution) private _institutions;
    bytes32[] private _institutionIds;
    mapping(bytes32 => mapping(address => bool)) private _institutionApprovals;

    mapping(address => KeyInfo) private _keys;
    mapping(bytes32 => address[]) private _institutionKeys;

    mapping(bytes32 => address[]) private _guardians;
    mapping(bytes32 => uint8) private _guardianThreshold;
    mapping(bytes32 => mapping(address => bool)) private _isGuardian;

    uint256 public recoveryProposalCount;
    mapping(uint256 => RecoveryProposal) private _recoveryProposals;
    mapping(uint256 => mapping(address => bool)) private _recoveryApprovals;

    mapping(bytes32 => AnchorInfo) private _anchors;
    mapping(bytes32 => BatchInfo) private _batches;
    mapping(bytes32 => CredentialStatusInfo) private _credentialStatuses;

    // ========================================================================
    // Constructor
    // ========================================================================

    /**
     * @notice Deploy TrustRegistry with 3 accreditors and a recovery timelock delay.
     * @param accreditors_ Array of exactly 3 accreditor addresses
     * @param recoveryDelay_ Delay in seconds before an approved recovery proposal can be executed
     */
    constructor(address[3] memory accreditors_, uint64 recoveryDelay_) {
        for (uint256 i = 0; i < 3; i++) {
            if (accreditors_[i] == address(0)) revert InvalidState();
        }
        _accreditors = accreditors_;
        _recoveryDelay = recoveryDelay_;
    }

    // ========================================================================
    // Modifiers & Helpers
    // ========================================================================

    function _isAccreditor(address account) internal view returns (bool) {
        return (account == _accreditors[0] || account == _accreditors[1] || account == _accreditors[2]);
    }

    function _isAuthorizedCredentialManager(bytes32 institutionId, address account) internal view returns (bool) {
        if (account == _institutions[institutionId].admin) {
            return true;
        }
        if (_keys[account].institutionId == institutionId && _keys[account].status != KeyStatus.None) {
            return true;
        }
        return false;
    }

    modifier onlyActiveIssuerKey() {
        KeyInfo storage k = _keys[msg.sender];
        if (k.status == KeyStatus.None) revert NotAuthorizedIssuer();
        if (k.status != KeyStatus.Active) revert KeyNotActive();
        if (_institutions[k.institutionId].status != InstitutionStatus.Active) revert InstitutionNotActive();
        _;
    }

    // ========================================================================
    // Institutions
    // ========================================================================

    /**
     * @notice Register a new institution in Pending status. Anyone can call.
     * @param did The decentralized identifier string for the institution (e.g. did:trustmesh:iit-bombay)
     * @param nameHash keccak256 hash of the institution name
     * @param admin Initial administrator address
     * @return id The generated institution ID (keccak256(utf8(did)))
     */
    function registerInstitution(
        string calldata did,
        bytes32 nameHash,
        address admin
    ) external returns (bytes32 id) {
        if (admin == address(0) || bytes(did).length == 0) revert InvalidState();
        id = keccak256(bytes(did));
        if (_institutions[id].admin != address(0)) revert InvalidState();

        _institutions[id] = Institution({
            did: did,
            nameHash: nameHash,
            admin: admin,
            status: InstitutionStatus.Pending,
            approvals: 0
        });

        _institutionIds.push(id);
        emit InstitutionRegistered(id, did, admin);
    }

    /**
     * @notice Accreditor approval for a pending institution. 2 distinct approvals transition to Active.
     * @param id The institution ID
     */
    function approveInstitution(bytes32 id) external {
        if (!_isAccreditor(msg.sender)) revert NotAccreditor();
        if (_institutions[id].admin == address(0)) revert UnknownInstitution();
        if (_institutionApprovals[id][msg.sender]) revert AlreadyApproved();

        _institutionApprovals[id][msg.sender] = true;
        _institutions[id].approvals += 1;
        emit InstitutionApproved(id, msg.sender, _institutions[id].approvals);

        if (_institutions[id].approvals >= 2 && _institutions[id].status == InstitutionStatus.Pending) {
            _institutions[id].status = InstitutionStatus.Active;
            emit InstitutionStatusChanged(id, uint8(InstitutionStatus.Active));
        }
    }

    /**
     * @notice Accreditor suspends an active institution.
     * @param id The institution ID
     */
    function suspendInstitution(bytes32 id) external {
        if (!_isAccreditor(msg.sender)) revert NotAccreditor();
        if (_institutions[id].admin == address(0)) revert UnknownInstitution();
        if (_institutions[id].status != InstitutionStatus.Active) revert InvalidState();

        _institutions[id].status = InstitutionStatus.Suspended;
        emit InstitutionStatusChanged(id, uint8(InstitutionStatus.Suspended));
    }

    /**
     * @notice Accreditor reinstates a suspended institution back to Active.
     * @param id The institution ID
     */
    function reinstateInstitution(bytes32 id) external {
        if (!_isAccreditor(msg.sender)) revert NotAccreditor();
        if (_institutions[id].admin == address(0)) revert UnknownInstitution();
        if (_institutions[id].status != InstitutionStatus.Suspended) revert InvalidState();

        _institutions[id].status = InstitutionStatus.Active;
        emit InstitutionStatusChanged(id, uint8(InstitutionStatus.Active));
    }

    /**
     * @notice Accreditor permanently revokes an institution.
     * @param id The institution ID
     */
    function revokeInstitution(bytes32 id) external {
        if (!_isAccreditor(msg.sender)) revert NotAccreditor();
        if (_institutions[id].admin == address(0)) revert UnknownInstitution();
        if (_institutions[id].status == InstitutionStatus.Revoked) revert InvalidState();

        _institutions[id].status = InstitutionStatus.Revoked;
        emit InstitutionStatusChanged(id, uint8(InstitutionStatus.Revoked));
    }

    // ========================================================================
    // Keys
    // ========================================================================

    /**
     * @notice Institution admin adds an active signing key.
     * @param institutionId The institution ID
     * @param key The key address to add
     */
    function addKey(bytes32 institutionId, address key) external {
        if (_institutions[institutionId].admin == address(0)) revert UnknownInstitution();
        if (msg.sender != _institutions[institutionId].admin) revert NotInstitutionAdmin();
        if (_institutions[institutionId].status != InstitutionStatus.Active) revert InstitutionNotActive();
        if (key == address(0) || _keys[key].status != KeyStatus.None) revert KeyAlreadyExists();

        _keys[key] = KeyInfo({
            institutionId: institutionId,
            status: KeyStatus.Active,
            validFrom: uint64(block.timestamp),
            compromisedAt: 0
        });

        _institutionKeys[institutionId].push(key);
        emit KeyAdded(institutionId, key);
    }

    /**
     * @notice Institution admin suspends an active key.
     * @param key The key address
     */
    function suspendKey(address key) external {
        KeyInfo storage keyInfo = _keys[key];
        if (keyInfo.status == KeyStatus.None) revert KeyNotActive();
        if (msg.sender != _institutions[keyInfo.institutionId].admin) revert NotInstitutionAdmin();
        if (keyInfo.status != KeyStatus.Active) revert InvalidState();

        keyInfo.status = KeyStatus.Suspended;
        emit KeyStatusChanged(key, uint8(KeyStatus.Suspended), keyInfo.compromisedAt);
    }

    /**
     * @notice Institution admin reinstates a suspended key back to Active.
     * @param key The key address
     */
    function reinstateKey(address key) external {
        KeyInfo storage keyInfo = _keys[key];
        if (keyInfo.status == KeyStatus.None) revert KeyNotActive();
        if (msg.sender != _institutions[keyInfo.institutionId].admin) revert NotInstitutionAdmin();
        if (keyInfo.status != KeyStatus.Suspended) revert InvalidState();

        keyInfo.status = KeyStatus.Active;
        emit KeyStatusChanged(key, uint8(KeyStatus.Active), keyInfo.compromisedAt);
    }

    /**
     * @notice Institution admin permanently revokes a compromised key with a compromise timestamp.
     * @param key The key address
     * @param compromisedAt The unix timestamp when compromise occurred (0 < compromisedAt <= block.timestamp)
     */
    function revokeKey(address key, uint64 compromisedAt) external {
        KeyInfo storage keyInfo = _keys[key];
        if (keyInfo.status == KeyStatus.None) revert KeyNotActive();
        if (msg.sender != _institutions[keyInfo.institutionId].admin) revert NotInstitutionAdmin();
        if (compromisedAt == 0 || compromisedAt > block.timestamp) revert InvalidCompromiseTime();
        if (keyInfo.status == KeyStatus.Revoked) revert InvalidState();

        keyInfo.status = KeyStatus.Revoked;
        keyInfo.compromisedAt = compromisedAt;
        emit KeyStatusChanged(key, uint8(KeyStatus.Revoked), compromisedAt);
    }

    /**
     * @notice Institution admin rotates an active key to a new key. Old key transitions to Retired; new key becomes Active.
     * @param oldKey The current active key
     * @param newKey The fresh key address to activate
     */
    function rotateKey(address oldKey, address newKey) external {
        KeyInfo storage oldKeyInfo = _keys[oldKey];
        if (oldKeyInfo.status == KeyStatus.None) revert KeyNotActive();
        bytes32 instId = oldKeyInfo.institutionId;
        if (msg.sender != _institutions[instId].admin) revert NotInstitutionAdmin();
        if (_institutions[instId].status != InstitutionStatus.Active) revert InstitutionNotActive();
        if (oldKeyInfo.status != KeyStatus.Active) revert KeyNotActive();
        if (newKey == address(0) || _keys[newKey].status != KeyStatus.None) revert KeyAlreadyExists();

        oldKeyInfo.status = KeyStatus.Retired;
        emit KeyStatusChanged(oldKey, uint8(KeyStatus.Retired), oldKeyInfo.compromisedAt);

        _keys[newKey] = KeyInfo({
            institutionId: instId,
            status: KeyStatus.Active,
            validFrom: uint64(block.timestamp),
            compromisedAt: 0
        });

        _institutionKeys[instId].push(newKey);
        emit KeyAdded(instId, newKey);
        emit KeyRotated(instId, oldKey, newKey);
    }

    // ========================================================================
    // Guardian Recovery (M-of-N + Timelock)
    // ========================================================================

    /**
     * @notice Admin sets guardian addresses and signature threshold for recovery.
     * @param institutionId The institution ID
     * @param guardians Array of distinct guardian addresses
     * @param threshold M-of-N threshold required to execute recovery
     */
    function setGuardians(
        bytes32 institutionId,
        address[] calldata guardians,
        uint8 threshold
    ) external {
        if (_institutions[institutionId].admin == address(0)) revert UnknownInstitution();
        if (msg.sender != _institutions[institutionId].admin) revert NotInstitutionAdmin();
        if (guardians.length == 0 || threshold == 0 || threshold > guardians.length) revert InvalidState();

        // Clear existing guardians
        for (uint256 i = 0; i < _guardians[institutionId].length; i++) {
            _isGuardian[institutionId][_guardians[institutionId][i]] = false;
        }
        delete _guardians[institutionId];

        for (uint256 i = 0; i < guardians.length; i++) {
            if (guardians[i] == address(0) || _isGuardian[institutionId][guardians[i]]) revert InvalidState();
            _isGuardian[institutionId][guardians[i]] = true;
            _guardians[institutionId].push(guardians[i]);
        }

        _guardianThreshold[institutionId] = threshold;
        emit GuardiansSet(institutionId, threshold, guardians.length);
    }

    /**
     * @notice Guardian proposes recovery to appoint a new admin and new active key.
     * @param institutionId The institution ID
     * @param newAdmin Proposed new administrator address
     * @param newKey Proposed new issuer key
     * @return proposalId The generated proposal ID
     */
    function proposeRecovery(
        bytes32 institutionId,
        address newAdmin,
        address newKey
    ) external returns (uint256 proposalId) {
        if (!_isGuardian[institutionId][msg.sender]) revert NotGuardian();
        if (newAdmin == address(0) || newKey == address(0)) revert InvalidState();

        proposalId = ++recoveryProposalCount;
        uint64 executeAfter = uint64(block.timestamp + _recoveryDelay);

        _recoveryProposals[proposalId] = RecoveryProposal({
            institutionId: institutionId,
            newAdmin: newAdmin,
            newKey: newKey,
            approvals: 1,
            executeAfter: executeAfter,
            executed: false,
            cancelled: false
        });

        _recoveryApprovals[proposalId][msg.sender] = true;
        emit RecoveryProposed(proposalId, institutionId, newAdmin, newKey, executeAfter);
        emit RecoveryApproved(proposalId, msg.sender, 1);
    }

    /**
     * @notice Guardian approves a pending recovery proposal.
     * @param proposalId The recovery proposal ID
     */
    function approveRecovery(uint256 proposalId) external {
        RecoveryProposal storage prop = _recoveryProposals[proposalId];
        if (prop.institutionId == bytes32(0) || prop.executed || prop.cancelled) revert InvalidState();
        if (!_isGuardian[prop.institutionId][msg.sender]) revert NotGuardian();
        if (_recoveryApprovals[proposalId][msg.sender]) revert AlreadyApproved();

        _recoveryApprovals[proposalId][msg.sender] = true;
        prop.approvals += 1;
        emit RecoveryApproved(proposalId, msg.sender, prop.approvals);
    }

    /**
     * @notice Anyone can execute recovery once M-of-N threshold is reached and timelock has elapsed.
     * @param proposalId The recovery proposal ID
     */
    function executeRecovery(uint256 proposalId) external {
        RecoveryProposal storage prop = _recoveryProposals[proposalId];
        if (prop.institutionId == bytes32(0) || prop.executed || prop.cancelled) revert InvalidState();
        if (prop.approvals < _guardianThreshold[prop.institutionId]) revert QuorumNotReached();
        if (block.timestamp < prop.executeAfter) revert TimelockNotElapsed();

        prop.executed = true;
        _institutions[prop.institutionId].admin = prop.newAdmin;

        if (_keys[prop.newKey].status == KeyStatus.None) {
            _keys[prop.newKey] = KeyInfo({
                institutionId: prop.institutionId,
                status: KeyStatus.Active,
                validFrom: uint64(block.timestamp),
                compromisedAt: 0
            });
            _institutionKeys[prop.institutionId].push(prop.newKey);
            emit KeyAdded(prop.institutionId, prop.newKey);
        }

        emit RecoveryExecuted(proposalId, prop.institutionId);
    }

    /**
     * @notice Current institution admin cancels a pending recovery proposal.
     * @param proposalId The recovery proposal ID
     */
    function cancelRecovery(uint256 proposalId) external {
        RecoveryProposal storage prop = _recoveryProposals[proposalId];
        if (prop.institutionId == bytes32(0) || prop.executed || prop.cancelled) revert InvalidState();
        if (msg.sender != _institutions[prop.institutionId].admin) revert NotInstitutionAdmin();

        prop.cancelled = true;
        emit RecoveryCancelled(proposalId);
    }

    // ========================================================================
    // Credentials
    // ========================================================================

    /**
     * @notice Active key of an active institution anchors a credential root on-chain.
     * @param credentialId The credential identifier
     * @param merkleRoot The Merkle root of the credential field leaves
     * @param schemaHash keccak256 hash of the schema identifier
     */
    function anchorCredential(
        bytes32 credentialId,
        bytes32 merkleRoot,
        bytes32 schemaHash
    ) external onlyActiveIssuerKey {
        if (credentialId == bytes32(0) || merkleRoot == bytes32(0)) revert InvalidState();
        if (_anchors[credentialId].timestamp != 0) revert AlreadyAnchored();

        bytes32 instId = _keys[msg.sender].institutionId;

        _anchors[credentialId] = AnchorInfo({
            institutionId: instId,
            keyAddr: msg.sender,
            merkleRoot: merkleRoot,
            schemaHash: schemaHash,
            timestamp: uint64(block.timestamp)
        });

        _credentialStatuses[credentialId] = CredentialStatusInfo({
            state: CredState.Good,
            reasonCode: 0,
            timestamp: uint64(block.timestamp),
            by: msg.sender,
            institutionId: instId
        });

        emit CredentialAnchored(credentialId, instId, msg.sender, merkleRoot, schemaHash);
    }

    /**
     * @notice Active key of an active institution anchors a batch root on-chain.
     * @param batchId The batch identifier
     * @param batchRoot The Merkle root over all credential IDs in the batch
     * @param count Total number of credentials in this batch
     */
    function anchorBatch(
        bytes32 batchId,
        bytes32 batchRoot,
        uint32 count
    ) external onlyActiveIssuerKey {
        if (batchId == bytes32(0) || batchRoot == bytes32(0) || count == 0) revert InvalidState();
        if (_batches[batchId].timestamp != 0) revert AlreadyAnchored();

        bytes32 instId = _keys[msg.sender].institutionId;

        _batches[batchId] = BatchInfo({
            institutionId: instId,
            keyAddr: msg.sender,
            batchRoot: batchRoot,
            count: count,
            timestamp: uint64(block.timestamp)
        });

        emit BatchAnchored(batchId, instId, msg.sender, batchRoot, count);
    }

    /**
     * @notice Admin or key of issuing institution permanently revokes a credential.
     * @param credentialId The credential identifier
     * @param reasonCode Revocation reason code (1 Superseded, 2 Fraud, 3 Error, 4 KeyCompromise, 5 Other)
     */
    function revokeCredential(bytes32 credentialId, uint8 reasonCode) external {
        if (_anchors[credentialId].timestamp == 0 && _credentialStatuses[credentialId].timestamp == 0) {
            revert UnknownCredential();
        }

        bytes32 instId = _anchors[credentialId].institutionId;
        if (instId == bytes32(0)) {
            instId = _credentialStatuses[credentialId].institutionId;
        }

        if (!_isAuthorizedCredentialManager(instId, msg.sender)) revert NotIssuerOfCredential();
        if (_credentialStatuses[credentialId].state == CredState.Revoked) revert InvalidState();

        _credentialStatuses[credentialId] = CredentialStatusInfo({
            state: CredState.Revoked,
            reasonCode: reasonCode,
            timestamp: uint64(block.timestamp),
            by: msg.sender,
            institutionId: instId
        });

        emit CredentialStatusChanged(credentialId, instId, uint8(CredState.Revoked), reasonCode, msg.sender);
    }

    /**
     * @notice Admin or key of issuing institution revokes a credential from a batch via Merkle inclusion proof.
     * @param batchId The batch identifier
     * @param credentialId The credential identifier
     * @param proof Merkle inclusion proof verifying credentialId is in batchRoot
     * @param reasonCode Revocation reason code
     */
    function revokeBatchCredential(
        bytes32 batchId,
        bytes32 credentialId,
        bytes32[] calldata proof,
        uint8 reasonCode
    ) external {
        if (_batches[batchId].timestamp == 0) revert UnknownCredential();

        bytes32 instId = _batches[batchId].institutionId;
        if (!_isAuthorizedCredentialManager(instId, msg.sender)) revert NotIssuerOfCredential();

        if (!MerkleProof.verify(proof, _batches[batchId].batchRoot, credentialId)) {
            revert InvalidProof();
        }

        if (_credentialStatuses[credentialId].state == CredState.Revoked) revert InvalidState();

        _credentialStatuses[credentialId] = CredentialStatusInfo({
            state: CredState.Revoked,
            reasonCode: reasonCode,
            timestamp: uint64(block.timestamp),
            by: msg.sender,
            institutionId: instId
        });

        emit CredentialStatusChanged(credentialId, instId, uint8(CredState.Revoked), reasonCode, msg.sender);
    }

    /**
     * @notice Admin or key of issuing institution suspends a credential. Can only suspend from Good state.
     * @param credentialId The credential identifier
     */
    function suspendCredential(bytes32 credentialId) external {
        if (_anchors[credentialId].timestamp == 0 && _credentialStatuses[credentialId].timestamp == 0) {
            revert UnknownCredential();
        }

        bytes32 instId = _anchors[credentialId].institutionId;
        if (instId == bytes32(0)) {
            instId = _credentialStatuses[credentialId].institutionId;
        }

        if (!_isAuthorizedCredentialManager(instId, msg.sender)) revert NotIssuerOfCredential();
        if (_credentialStatuses[credentialId].state != CredState.Good) revert InvalidState();

        _credentialStatuses[credentialId] = CredentialStatusInfo({
            state: CredState.Suspended,
            reasonCode: 0,
            timestamp: uint64(block.timestamp),
            by: msg.sender,
            institutionId: instId
        });

        emit CredentialStatusChanged(credentialId, instId, uint8(CredState.Suspended), 0, msg.sender);
    }

    /**
     * @notice Admin or key of issuing institution reinstates a suspended credential back to Good state.
     * @param credentialId The credential identifier
     */
    function reinstateCredential(bytes32 credentialId) external {
        if (_anchors[credentialId].timestamp == 0 && _credentialStatuses[credentialId].timestamp == 0) {
            revert UnknownCredential();
        }

        bytes32 instId = _anchors[credentialId].institutionId;
        if (instId == bytes32(0)) {
            instId = _credentialStatuses[credentialId].institutionId;
        }

        if (!_isAuthorizedCredentialManager(instId, msg.sender)) revert NotIssuerOfCredential();
        if (_credentialStatuses[credentialId].state != CredState.Suspended) revert InvalidState();

        _credentialStatuses[credentialId] = CredentialStatusInfo({
            state: CredState.Good,
            reasonCode: 0,
            timestamp: uint64(block.timestamp),
            by: msg.sender,
            institutionId: instId
        });

        emit CredentialStatusChanged(credentialId, instId, uint8(CredState.Good), 0, msg.sender);
    }

    // ========================================================================
    // Snapshot Trust Anchor
    // ========================================================================

    /**
     * @notice Accreditor sets the authorized snapshot publisher address.
     * @param publisher The address authorized to sign and publish snapshots
     */
    function setSnapshotPublisher(address publisher) external {
        if (!_isAccreditor(msg.sender)) revert NotAccreditor();
        if (publisher == address(0)) revert InvalidState();

        snapshotPublisher = publisher;
        emit SnapshotPublisherSet(publisher);
    }

    /**
     * @notice Authorized snapshot publisher publishes a snapshot anchor on-chain.
     * @param snapshotHash keccak256 hash of the canonicalized snapshot
     * @param blockNumber Block number captured by the snapshot
     */
    function publishSnapshot(bytes32 snapshotHash, uint64 blockNumber) external {
        if (msg.sender != snapshotPublisher) revert NotSnapshotPublisher();
        if (snapshotHash == bytes32(0)) revert InvalidState();

        emit SnapshotPublished(snapshotHash, blockNumber, msg.sender);
    }

    // ========================================================================
    // Views
    // ========================================================================

    function getInstitution(bytes32 id)
        external
        view
        returns (
            string memory did,
            bytes32 nameHash,
            address admin,
            uint8 status,
            uint8 approvals
        )
    {
        Institution storage inst = _institutions[id];
        return (inst.did, inst.nameHash, inst.admin, uint8(inst.status), inst.approvals);
    }

    function getKey(address key)
        external
        view
        returns (
            bytes32 institutionId,
            uint8 status,
            uint64 validFrom,
            uint64 compromisedAt
        )
    {
        KeyInfo storage k = _keys[key];
        return (k.institutionId, uint8(k.status), k.validFrom, k.compromisedAt);
    }

    function getAnchor(bytes32 credentialId)
        external
        view
        returns (
            bytes32 institutionId,
            address keyAddr,
            bytes32 merkleRoot,
            bytes32 schemaHash,
            uint64 timestamp
        )
    {
        AnchorInfo storage a = _anchors[credentialId];
        return (a.institutionId, a.keyAddr, a.merkleRoot, a.schemaHash, a.timestamp);
    }

    function getBatch(bytes32 batchId)
        external
        view
        returns (
            bytes32 institutionId,
            address keyAddr,
            bytes32 batchRoot,
            uint32 count,
            uint64 timestamp
        )
    {
        BatchInfo storage b = _batches[batchId];
        return (b.institutionId, b.keyAddr, b.batchRoot, b.count, b.timestamp);
    }

    function getCredentialStatus(bytes32 credentialId)
        external
        view
        returns (
            uint8 state,
            uint8 reasonCode,
            uint64 timestamp,
            address by
        )
    {
        CredentialStatusInfo storage s = _credentialStatuses[credentialId];
        return (uint8(s.state), s.reasonCode, s.timestamp, s.by);
    }

    /**
     * @notice Checks if a key was valid at timestamp ts.
     * @dev ts >= validFrom && !(status == Revoked && ts >= compromisedAt)
     */
    function isKeyValidAt(address key, uint64 ts) external view returns (bool) {
        KeyInfo storage k = _keys[key];
        if (k.status == KeyStatus.None) return false;
        if (ts < k.validFrom) return false;
        if (k.status == KeyStatus.Revoked && ts >= k.compromisedAt) return false;
        return true;
    }

    function getGuardians(bytes32 institutionId)
        external
        view
        returns (address[] memory guardians, uint8 threshold)
    {
        return (_guardians[institutionId], _guardianThreshold[institutionId]);
    }

    function getRecovery(uint256 proposalId)
        external
        view
        returns (
            bytes32 institutionId,
            address newAdmin,
            address newKey,
            uint8 approvals,
            uint64 executeAfter,
            bool executed,
            bool cancelled
        )
    {
        RecoveryProposal storage p = _recoveryProposals[proposalId];
        return (
            p.institutionId,
            p.newAdmin,
            p.newKey,
            p.approvals,
            p.executeAfter,
            p.executed,
            p.cancelled
        );
    }

    function institutionCount() external view returns (uint256) {
        return _institutionIds.length;
    }

    function institutionIdAt(uint256 index) external view returns (bytes32) {
        return _institutionIds[index];
    }

    function keyCount(bytes32 institutionId) external view returns (uint256) {
        return _institutionKeys[institutionId].length;
    }

    function keyAt(bytes32 institutionId, uint256 index) external view returns (address) {
        return _institutionKeys[institutionId][index];
    }

    function accreditors() external view returns (address[3] memory) {
        return _accreditors;
    }

    function recoveryDelay() external view returns (uint64) {
        return _recoveryDelay;
    }
}
