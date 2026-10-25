# TrustMesh Pitch & Judge Q&A Guide

---

## 1. The 2-Minute Elevator Pitch

Every year, millions of academic credentials and professional licenses are issued worldwide. Yet our verification systems remain medieval: employers wait weeks for registrar emails, fake diploma mills run unchecked on Telegram, and centralized verification portals expose sensitive student records to catastrophic data breaches.

**TrustMesh is the decentralized trust layer for the institutional world.**

Using established cryptography — **RFC 8785 Canonical JSON**, **Keccak-256 Merkle trees**, and **OpenZeppelin EVM primitives** — universities and enterprises issue cryptographically signed, Merkle-committed credentials.

Anyone can verify these credentials on Ethereum in milliseconds:
- **Zero Issuer Dependency**: Verification queries the on-chain Trust Registry directly. The issuer never needs to be online or contacted.
- **Zero On-Chain PII**: Only cryptographic hashes, Merkle roots, status enums, and DIDs are stored on Ethereum. Personal student data never touches the mempool.
- **Zero-Knowledge Privacy**: Holders selectively reveal individual attributes (e.g. degree name) while proving mathematical claims (e.g. `cgpa >= 8.0` or `age >= 18`) without revealing the underlying values.
- **Dual-Engine Censorship Resistance**: Verifiers can run through an indexed backend or in independent browser mode querying Ethereum RPCs directly.
- **True Offline PWA**: Field workers verify credentials in airplane mode using cryptographically signed snapshots cached in IndexedDB.

TrustMesh bridges the gap between decentralized integrity and institutional compliance.

---

## 2. Pitch Deck Outline (10 Slides)

### Slide 1: Cover
- **Title**: TrustMesh — Decentralized Institutional Trust Infrastructure
- **Tagline**: Cryptographically committed. Privately held. Verifiable anywhere.

### Slide 2: The Problem
- 1.5M+ counterfeit degrees circulating globally each year.
- 3 to 6-week turnaround time for manual university registrar checks.
- Massive data breach liabilities for centralized educational platforms (FERPA / GDPR).

### Slide 3: The Solution
- Institutions commit Merkle roots to an on-chain Trust Registry governed by 2-of-3 accreditor multi-sig.
- Holders store credentials in local IndexedDB wallets.
- Verifiers mathematically check credentials directly against Ethereum without contacting issuers.

### Slide 4: Cryptographic Architecture & Zero PII
- No student names, birthdates, or grades ever go on-chain.
- RFC 8785 deterministic canonicalization + salted Keccak-256 Merkle trees.
- W3C Verifiable Credentials & Decoupled presentations.

### Slide 5: The R1..R10 Verification Engine
- 10 deterministic rules checking format, issuer accreditation, key status, expiration, Merkle proofs, revocation mappings, holder binding, replay nonces, predicates, and snapshot freshness.

### Slide 6: Holder Privacy & Selective Disclosure
- Holders selectively disclose attributes (Degree vs GPA).
- Zero-knowledge predicate proofs: "Prove honors without revealing GPA".

### Slide 7: Security & Threat Modeling
- Key incident center with blast radius isolation (Safe vs Suspicious).
- Timelocked guardian social recovery.
- 18 automated adversarial attacks tested and blocked on-chain.

### Slide 8: Dual-Engine & Offline Capabilities
- Independent Browser RPC Engine: 100% trustless direct-to-node queries.
- PWA with IndexedDB snapshot cache for true airplane-mode verifications.

### Slide 9: Market & Go-To-Market
- Target: Higher Education consortia, corporate background verifiers, government licensing authorities.
- Business model: Enterprise SaaS issuer gateway + on-chain verification SLAs.

### Slide 10: Conclusion & Call to Action
- TrustMesh is built, tested, and ready. 97 core unit tests, 18 automated attacks neutralized, 10-rule verification engine active.

---

## 3. Likely Judge Q&A & Technical Defenses

### Q1: "Why does this need a blockchain? Why not a traditional database or certificate authority (CA)?"
**Answer**:
A traditional database requires trusting a single central operator who can be hacked, subpoenaed, or shut down. If the university's server crashes, verification stops globally.
A certificate authority model suffers from revocation lag (CRLs are huge and OCSP leaks verifier metadata to the CA).
TrustMesh uses Ethereum as an **immutable, high-availability, append-only trust anchor**:
1. Merkle roots cannot be backdated or modified after anchoring.
2. Verification queries the blockchain directly without informing the issuer who is being verified (preventing surveillance).
3. The 2-of-3 accreditor consensus guarantees no single rogue administrator can grant themselves institutional issuance authority.

### Q2: "How do you comply with GDPR and privacy laws if Ethereum is immutable?"
**Answer**:
We strictly follow a **Zero On-Chain PII architecture**:
- Personal data NEVER touches Ethereum. Not even encrypted.
- The smart contract only sees 32-byte Keccak-256 Merkle roots, status integers (`Active`, `Revoked`), and DIDs.
- GDPR "Right to be Forgotten" is respected because personal data only resides in the holder's personal wallet. If the holder deletes their local credential from IndexedDB, the data ceases to exist; the on-chain root cannot be reversed to reveal the plaintext.

### Q3: "What happens if a university's private signing key is stolen or leaked?"
**Answer**:
In Web2, key theft creates chaos because all previously issued credentials are questioned. TrustMesh solves this with **Surgical Blast Radius Isolation**:
1. When revoking the key, the institution submits an on-chain transaction specifying the exact unix timestamp of the compromise (`compromisedAt`).
2. Our Verification Rule **R3** evaluates issuance dates relative to this timestamp:
   - Credentials issued **before** the leak remain **VALID**.
   - Credentials issued **after** the leak are flagged as **SUSPICIOUS**.
3. The institution then rotates keys or executes **Guardian Social Recovery** through a 2-of-2 multisig timelock to restore authority.

### Q4: "How does the offline mode work if the verifier has no internet?"
**Answer**:
Our PWA implements **SnapshotSource**:
1. Periodically, our authorized snapshot publisher signs an aggregated state snapshot (Merkle roots, revoked IDs, active keys) using an ECDSA key whose public address is committed on-chain.
2. The verifier caches this snapshot in browser IndexedDB.
3. When offline, Rule **R10** checks the snapshot signature and evaluates freshness:
   - Fresh (<1 hour): Full trust.
   - Stale (<24 hours): Valid with warnings.
   - Expired (>24 hours): The verifier refuses acceptance to prevent stale revocation attacks.

### Q5: "How do you protect against frontrunning or replay attacks?"
**Answer**:
- **Presentation Replay**: Rule **R8** checks an ephemeral verifier challenge nonce signed by the holder's private key. Replaying an intercepted presentation fails because the nonce does not match.
- **Anchor Frontrunning**: Credential IDs cryptographically bind the issuer's DID, issuance timestamp, and Merkle root. An adversary copying the root cannot claim ownership because the credential ID incorporates the authentic issuer's identity.
