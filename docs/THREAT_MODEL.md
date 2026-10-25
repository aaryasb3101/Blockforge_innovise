# TrustMesh Threat Model & Attack Matrix

This document details the security posture of the TrustMesh decentralized trust infrastructure, documenting how each of the 18 automated adversarial attack vectors is neutralized by smart contract constraints, cryptographic primitives, or the R1..R10 verification engine.

---

## Adversarial Threat Matrix

| # | Attack Vector ID | Adversary Objective | Execution Strategy | Neutralizing Mechanism | Firing Rule / Revert |
| :- | :--- | :--- | :--- | :--- | :--- |
| **01** | `TAMPER_CLAIM` | Grade inflation or attribute forgery | Attacker modifies `cgpa` from 9.4 to 9.9 in credential JSON | Merkle leaf hash mismatch; reconstructed root does not equal anchored root | **Rule R5 (R5_MERKLE)** |
| **02** | `ROGUE_ISSUER` | Diploma mill fraudulent credential | Attacker signs credential using a key from an unaccredited institution | Issuer DID missing required 2-of-3 accreditor consensus in Trust Registry | **Rule R2 (R2_ISSUER)** |
| **03** | `CROSS_INSTITUTION_REVOKE`| Competitor sabotage / censorship | Institution B attempts to revoke Institution A's credential | Smart contract verifies `msg.sender == issuer.admin`; reverts on-chain | **`NotIssuerOfCredential`** |
| **04** | `BYPASS_REVOCATION` | Re-using expelled student credential | Student presents credential revoked on-chain for academic misconduct | Verifier queries on-chain revocation mapping and reason codes | **Rule R6 (R6_REVOCATION)** |
| **05** | `EXPIRED_CREDENTIAL` | Using expired license or certificate | Presenting a credential where `now > expirationDate` | Temporal evaluation against current or `asOfTimestamp` | **Rule R4 (R4_EXPIRATION)** |
| **06** | `KEY_COMPROMISE_POST` | Forging credentials with stolen key | Attacker uses compromised private key to issue credential after leak time | Verifier checks issuance timestamp against key's on-chain `compromisedAt` | **Rule R3 (R3_KEY_STATUS)** |
| **07** | `SIGNATURE_MUTATION` | Impersonating issuer without private key | Attacker mutates ECDSA `(r, s, v)` signature values | EIP-191 signature recovery yields an address not registered to institution | **Rule R1 (R1_FORMAT)** |
| **08** | `PRESENTATION_REPLAY` | Replaying intercepted presentation | Attacker sniffs presentation and presents it to a new verifier | Nonce mismatch: presentation was signed against an expired/different nonce | **Rule R8 (R8_PRESENTATION_NONCE)**|
| **09** | `HOLDER_IMPERSONATION` | Presenting someone else's credential | Attacker presents a stolen valid credential without holding the private key | Presentation holder signature does not recover to `credential.holderDid` | **Rule R7 (R7_HOLDER_BINDING)** |
| **10** | `SECOND_PREIMAGE` | Merkle collision attack | Crafting an alternate payload matching intermediate Merkle node | Keccak-256 collision resistance + RFC 8785 canonical serialization | **Rule R5 (R5_MERKLE)** |
| **11** | `MERKLE_EXTENSION` | Appending malicious fields to credential | Injecting extra fields into the leaf set without issuer signature | Every leaf is bound to the signed Merkle root and leaf dictionary | **Rule R5 (R5_MERKLE)** |
| **12** | `STALE_SNAPSHOT_ROLLBACK` | Exploiting offline cache to hide revocation| Attacker uses old snapshot taken before a credential was revoked | Snapshots older than 24 hours are rejected by the freshness threshold | **Rule R10 (R10_SNAPSHOT)** |
| **13** | `SELF_ACCREDITATION` | Bypassing accreditor governance | Institution calls `approveInstitution` on itself | Smart contract enforces caller is in accredited authority registry | **`NotAccreditor()`** |
| **14** | `GUARDIAN_FRONTRUNNING`| Hostile takeover of institution keys | Attacker attempts immediate recovery without timelock | Smart contract enforces 2-of-2 guardian consensus + minimum timelock delay | **`TimelockNotExpired()`** |
| **15** | `BATCH_ROOT_INJECTION` | Injecting unauthorized credential into batch| Attacker presents fake credential claiming membership in batch | Merkle tree audit path fails verification against batch root | **Rule R5 (R5_MERKLE)** |
| **16** | `PREDICATE_FORGERY` | Falsely asserting CGPA >= 8 | Attacker claims `cgpa_gte_8: true` on an unverified student record | Predicate commitments are cryptographically anchored and checked | **Rule R9 (R9_PREDICATES)** |
| **17** | `SUSPENDED_KEY_USE` | Issuing during key suspension | Institution issues credentials while key is temporarily suspended | Verifier checks key status enum; `KeyStatus.Suspended` blocks validity | **Rule R3 (R3_KEY_STATUS)** |
| **18** | `ANCHOR_FRONTRUNNING` | Stealing credential root commitment | Attacker observes mempool and commits identical root | Credential ID uniquely incorporates issuer DID, root, and timestamp | **Rule R2 / Revert** |

---

## Cryptographic Guarantees

1. **Unforgeability**: Credentials cannot be minted without access to an accredited institution's active private key.
2. **Tamper Evidence**: Any modification to a credential's claims or salts invalidates the Merkle audit path, immediately detectable in the Forensics panel.
3. **Non-Repudiation**: Issuers commit Merkle roots to Ethereum with immutable timestamping and transaction receipts.
4. **Holder Consent & Privacy**: Presentations only disclose attributes explicitly checked by the holder. Zero information about hidden attributes is leaked to the verifier.
5. **Censorship Resistance**: Verifiers in Independent Browser Mode query Ethereum RPC nodes directly, ensuring verification works even if the issuer or backend is offline.
