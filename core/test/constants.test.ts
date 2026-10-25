import { describe, it, expect } from 'vitest';
import {
  TRUSTMESH_VERSION,
  TRUSTMESH_SPEC_REVISION,
  TRUST_SCORE_BANDS,
  BACKDATED_WINDOW_SECONDS,
  SNAPSHOT_FRESH_THRESHOLD_SECONDS,
  SNAPSHOT_MAX_AGE_SECONDS,
} from '../src/constants.js';

describe('Specification Constants', () => {
  it('exposes accurate frozen spec thresholds and metadata', () => {
    expect(TRUSTMESH_VERSION).toBe('1.0.0');
    expect(TRUSTMESH_SPEC_REVISION).toBe('FROZEN');

    expect(TRUST_SCORE_BANDS.VALID.min).toBe(90);
    expect(TRUST_SCORE_BANDS.VALID.max).toBe(100);

    expect(TRUST_SCORE_BANDS.VALID_WITH_WARNINGS.min).toBe(61);
    expect(TRUST_SCORE_BANDS.VALID_WITH_WARNINGS.max).toBe(89);

    expect(TRUST_SCORE_BANDS.SUSPICIOUS.min).toBe(31);
    expect(TRUST_SCORE_BANDS.SUSPICIOUS.max).toBe(60);

    expect(TRUST_SCORE_BANDS.INVALID.min).toBe(0);
    expect(TRUST_SCORE_BANDS.INVALID.max).toBe(30);

    expect(BACKDATED_WINDOW_SECONDS).toBe(3600);
    expect(SNAPSHOT_FRESH_THRESHOLD_SECONDS).toBe(3600);
    expect(SNAPSHOT_MAX_AGE_SECONDS).toBe(86400);
  });
});
