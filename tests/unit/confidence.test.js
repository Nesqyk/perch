/**
 * tests/unit/confidence.test.js
 *
 * Unit tests for src/utils/confidence.js
 * Pure functions — no DOM, no network.
 */

import { describe, it, expect } from 'vitest';
import { formatConfidence, confidenceLabel } from '../../src/utils/confidence.js';

describe('formatConfidence', () => {
  it('returns Unknown for null', () => {
    const r = formatConfidence(null);
    expect(r.label).toBe('Unknown');
    expect(r.cssClass).toBe('confidence-unknown');
    expect(r.percent).toBe(0);
  });

  it('returns Unknown for undefined', () => {
    const r = formatConfidence(undefined);
    expect(r.label).toBe('Unknown');
    expect(r.cssClass).toBe('confidence-unknown');
  });

  it('returns Likely Free for score >= 0.75', () => {
    expect(formatConfidence(0.75).label).toBe('Likely Free');
    expect(formatConfidence(0.75).cssClass).toBe('confidence-free');
    expect(formatConfidence(1.0).label).toBe('Likely Free');
  });

  it('returns Maybe Free for 0.50 <= score < 0.75', () => {
    expect(formatConfidence(0.50).label).toBe('Maybe Free');
    expect(formatConfidence(0.50).cssClass).toBe('confidence-maybe');
    expect(formatConfidence(0.74).label).toBe('Maybe Free');
  });

  it('returns Probably Busy for 0.25 <= score < 0.50', () => {
    expect(formatConfidence(0.25).label).toBe('Probably Busy');
    expect(formatConfidence(0.25).cssClass).toBe('confidence-busy');
    expect(formatConfidence(0.49).label).toBe('Probably Busy');
  });

  it('returns Likely Full for score < 0.25', () => {
    expect(formatConfidence(0.0).label).toBe('Likely Full');
    expect(formatConfidence(0.0).cssClass).toBe('confidence-full');
    expect(formatConfidence(0.24).label).toBe('Likely Full');
  });

  it('rounds percent correctly', () => {
    expect(formatConfidence(0.756).percent).toBe(76);
    expect(formatConfidence(0.5).percent).toBe(50);
    expect(formatConfidence(0.0).percent).toBe(0);
  });
});

describe('confidenceLabel', () => {
  it('delegates to formatConfidence and returns just the label', () => {
    expect(confidenceLabel(0.9)).toBe('Likely Free');
    expect(confidenceLabel(0.6)).toBe('Maybe Free');
    expect(confidenceLabel(0.3)).toBe('Probably Busy');
    expect(confidenceLabel(0.1)).toBe('Likely Full');
    expect(confidenceLabel(null)).toBe('Unknown');
  });
});
