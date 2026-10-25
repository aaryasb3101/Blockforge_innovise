-- TrustMesh SQLite Database Schema

CREATE TABLE IF NOT EXISTS indexer_cursor (
    id TEXT PRIMARY KEY,
    last_processed_block INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    block_timestamp INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    actor TEXT NOT NULL,
    institution_id TEXT,
    args_json TEXT NOT NULL,
    UNIQUE(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_inst ON audit_events(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_block ON audit_events(block_number);
CREATE INDEX IF NOT EXISTS idx_audit_events_tx ON audit_events(tx_hash);

CREATE TABLE IF NOT EXISTS credentials_metadata (
    credential_id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    issuer_did TEXT NOT NULL,
    holder_did TEXT NOT NULL,
    schema TEXT NOT NULL,
    issuance_date INTEGER NOT NULL,
    expiration_date INTEGER NOT NULL,
    merkle_root TEXT NOT NULL,
    state INTEGER NOT NULL DEFAULT 0,
    reason_code INTEGER DEFAULT 0,
    batch_id TEXT,
    anchored_at INTEGER NOT NULL,
    tx_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cred_issuer ON credentials_metadata(institution_id);
CREATE INDEX IF NOT EXISTS idx_cred_holder ON credentials_metadata(holder_did);

CREATE TABLE IF NOT EXISTS institutions_cache (
    id TEXT PRIMARY KEY,
    did TEXT NOT NULL,
    name TEXT NOT NULL,
    name_hash TEXT NOT NULL,
    admin TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    approvals INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'university'
);
