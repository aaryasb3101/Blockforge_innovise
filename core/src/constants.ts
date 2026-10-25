/**
 * TrustMesh Frozen Shared Spec Metadata
 */
export const TRUSTMESH_VERSION = '1.0.0';
export const TRUSTMESH_SPEC_REVISION = 'FROZEN';

export const TRUST_SCORE_BANDS = {
  VALID: { min: 90, max: 100 },
  VALID_WITH_WARNINGS: { min: 61, max: 89 },
  SUSPICIOUS: { min: 31, max: 60 },
  INVALID: { min: 0, max: 30 },
} as const;

export const BACKDATED_WINDOW_SECONDS = 3600; // 1 hour window
export const SNAPSHOT_FRESH_THRESHOLD_SECONDS = 3600; // 1 hour
export const SNAPSHOT_MAX_AGE_SECONDS = 86400; // 24 hours
