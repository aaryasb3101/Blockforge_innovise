# TrustMesh 5-Minute Judge Demo Script

> **Setting**: Presenting to hackathon judges on a projector or screen share.  
> **Duration**: 5 Minutes  
> **Goal**: Demonstrate all mandatory evaluation scenarios, highlight privacy & cryptographic rigor, and prove dual-engine parity.

---

### Phase 1: The Pitch & Architecture (Minute 0:00 - 1:00)

**Screen**: Home Page (`http://localhost:5173/`)

1. **Talking Points**:
   - *"Judges, current credential verification is broken: employers must email universities, paper degrees are forged via Photoshop, and centralized verification portals leak student PII."*
   - *"TrustMesh solves this with decentralized institutional trust infrastructure. Universities issue Merkle-committed credentials; anyone verifies them on Ethereum without contacting the issuer and with zero personal data on-chain."*
2. **Action**: Point out live metrics banner (3 Institutions, 5 Active Keys, 142 Anchored Credentials, Append-Only Audit Trail) and the 9/9 MVP requirements checklist.
3. **Action**: Click the pulsing orange **"Judge Tour (5m)"** button in the navbar to open the guided tour overlay.

---

### Phase 2: Decentralized Verifier & Forensics (Minute 1:00 - 2:30)

**Screen**: Verifier Page (`http://localhost:5173/verifier`)

1. **Scenario 1 (Happy Path - Valid Credential)**:
   - Select **"1. Valid Credential (100%)"** from the sample dropdown.
   - Click **"Verify Credential Authenticity"**.
   - Point out:
     - Huge green banner: **`VALID`**.
     - Animated Trust Score Gauge: **100/100**.
     - R1..R10 Rule Timeline: All 10 rules evaluated and passed.
     - Toggle **"Compare Engines"**: Show `"Backend and browser agree ✔"`.
2. **Scenario 2 (Grade Tampering Forensics)**:
   - Select **"2. Tampered CGPA (Forensics)"** from the sample dropdown.
   - Point out:
     - Banner changes to red: **`INVALID`**.
     - Rule **R5 (Merkle Leaf Integrity)** fails.
     - Scroll down to the **Forensics Decomposition Panel**:
       - The table highlights the exact modified field (`cgpa: 9.9 [MUTATED]`).
       - Show computed leaf hash mismatch vs anchored Merkle root.
       - Highlight plain-English explanation: *"Even a single bit change alters the Keccak-256 leaf, rendering forgery impossible."*
3. **Scenario 3 (Rogue Issuer)**:
   - Select **"3. Rogue Issuer (Unapproved)"**.
   - Show: Rejected under **Rule R2 (Issuer Accreditation)** because the diploma mill lacks 2-of-3 accreditor consensus.
4. **Scenario 4 (Revoked Credential)**:
   - Select **"4. Revoked Credential"**.
   - Show: Rejected under **Rule R6 (On-Chain Revocation)** with reason code `AcademicMisconduct`.

---

### Phase 3: Holder Privacy & Selective Disclosure (Minute 2:30 - 3:30)

**Screen**: Holder Wallet (`http://localhost:5173/wallet`)

1. **Talking Points**:
   - *"Students should not have to reveal their entire transcript or GPA when applying for an entry-level job."*
2. **Action**:
   - Select student credential from local IndexedDB.
   - Uncheck `cgpa` to hide it.
   - Point to the **Two-Column Live Comparison**:
     - Column 1: **"Verifier Will See"** (Degree name, Graduation status).
     - Column 2: **"Hidden in Wallet"** (`cgpa: [NEVER LEAVES WALLET]`).
   - Highlight **Zero-Knowledge Predicate**:
     - *"Notice the student proves `cgpa >= 8.0: TRUE` without revealing their actual 9.4 GPA!"*
   - Click **"Present to Decentralized Verifier"**: The Verifier opens pre-filled with the selective disclosure presentation.

---

### Phase 4: Key Incidents & Blast Radius (Minute 3:30 - 4:15)

**Screen**: Incident Center (`http://localhost:5173/incidents`)

1. **Talking Points**:
   - *"What happens when a university signer key is stolen? In Web2, thousands of degrees are invalidated. In TrustMesh, we have surgical blast radius isolation."*
2. **Action**:
   - Move the compromise date picker.
   - Point to the animated blast radius timeline:
     - Safe (Pre-leak): 120 credentials remain completely **VALID**.
     - Suspicious (Post-leak window): 18 credentials marked for re-attestation.
   - Demonstrate the **Guardian Social Recovery Wizard**:
     - Set 2 guardians.
     - Guardian 1 signs, Guardian 2 signs.
     - Timelock countdown triggers.
     - Execute recovery to rotate the signer key on-chain.

---

### Phase 5: Adversarial Playground & Offline PWA (Minute 4:15 - 5:00)

1. **Fraud Simulation Playground (`/playground`)**:
   - Click **"Run All 18 Attacks"**.
   - Watch the animated scoreboard tick to **18/18 BLOCKED**.
   - Highlight: Frontrunning, replay, Merkle extension, and unauthorized revocations are all neutralized.
2. **Offline Mode (`/offline`)**:
   - Show: Snapshot cached in IndexedDB.
   - Move the **"Simulate Stale Cache Slider"** from 0h to 6h (Stale Amber) to 30h (Expired Red).
   - Point out Rule R10 refusing acceptance when the snapshot is stale.
3. **Closing**:
   - *"TrustMesh is production-grade, mathematically sound, zero-PII institutional trust infrastructure. Thank you!"*
