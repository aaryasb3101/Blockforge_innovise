# TrustMesh Product Screenshots & Visual Walkthrough

This document indexes the key user interfaces of TrustMesh designed for hackathon demonstration and projector legibility.

---

## Screenshot Manifest

| Filename | Page / Feature | Key Elements Visible |
| :--- | :--- | :--- |
| `01_verifier_valid.png` | **Decentralized Verifier** | Massive `VALID` green banner, Trust Score 100/100, R1..R10 rule timeline, Engine parity ("Backend and browser agree ✔") |
| `02_forensics_tamper.png` | **Forensics Decomposition Panel** | Field-by-field leaf comparison, `[MUTATED]` badge on tampered CGPA, expected vs actual leaf hash diff |
| `03_issuer_console.png` | **Issuer Console** | Schema definition, zero-knowledge predicate toggles (`cgpa >= 8`), batch Merkle issuance, cross-institution revert card |
| `04_holder_wallet.png` | **Holder Privacy Wallet** | Stored credentials in IndexedDB, selective disclosure checkboxes, two-column preview ("Verifier will see" vs "Hidden in wallet") |
| `05_fraud_playground.png` | **Fraud Simulation Playground**| 18 attack cards, animated scoreboard "Attacks blocked 18/18", live interactive JSON mutation sandbox |
| `06_audit_explorer.png` | **Audit Explorer** | Real-time event log, CSV export, "Re-verify from chain" button showing independent on-chain proof matching indexer |
| `07_trust_graph.png` | **Trust Registry & Graph** | XYFlow interactive DAG (Accreditors &rarr; Institutions &rarr; Signers), 3-step 2-of-3 accreditor registration stepper |
| `08_incident_center.png` | **Key Incident Center** | Blast radius classification (Safe vs Suspicious), compromise time marker, 2-of-2 guardian social recovery wizard |
| `09_offline_pwa.png` | **Offline Mode (PWA)** | Snapshot freshness badge (Fresh / Stale / Expired), simulated clock slider, zero-network SnapshotSource verification |
| `10_judge_tour.png` | **Judge Mode Guided Tour** | 10-step stepper overlay with deep-links, pre-filled payloads, and security narratives |

---

## Visual Architecture Overview

All views feature:
- High-contrast projector-calibrated dark theme with light toggle.
- Status color coding: Green (`#10b981`), Amber (`#f59e0b`), Orange (`#f97316`), Red (`#ef4444`).
- Monospace styling for addresses, hashes, and salts with one-click copy buttons.
- Fully accessible keyboard navigation and mobile-to-4K responsive layouts.
