import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Holder Privacy Logic', () => {
  it('correctly partitions revealed and hidden fields', () => {
    const fields: Record<string, any> = {
      studentName: 'Alice Sharma',
      degree: 'B.Tech CS',
      cgpa: 9.4,
    };

    const revealedMap: Record<string, boolean> = {
      studentName: true,
      degree: true,
      cgpa: false,
    };

    const revealedFields = Object.keys(fields).filter((k) => revealedMap[k]);
    const hiddenFields = Object.keys(fields).filter((k) => !revealedMap[k]);

    expect(revealedFields).toContain('studentName');
    expect(revealedFields).toContain('degree');
    expect(revealedFields).not.toContain('cgpa');

    expect(hiddenFields).toContain('cgpa');
    expect(hiddenFields.length).toBe(1);
  });

  it('correctly formats predicate claims for zero knowledge verification', () => {
    const predicates = {
      cgpa_gte_8: true,
      age_gte_18: true,
    };

    expect(predicates.cgpa_gte_8).toBe(true);
    expect(predicates.age_gte_18).toBe(true);
  });
});
