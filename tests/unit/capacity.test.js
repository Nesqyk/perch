/**
 * tests/unit/capacity.test.js
 *
 * Unit tests for src/utils/capacity.js
 */

import { describe, it, expect } from 'vitest';
import {
  ROUGH_CAPACITY_MAX,
  ROUGH_CAPACITY_LABEL,
  GROUP_SIZE_CONFIG,
  calcRemainingCapacity,
} from '../../src/utils/capacity.js';

describe('ROUGH_CAPACITY_MAX', () => {
  it('defines expected maximums', () => {
    expect(ROUGH_CAPACITY_MAX.small).toBe(8);
    expect(ROUGH_CAPACITY_MAX.medium).toBe(20);
    expect(ROUGH_CAPACITY_MAX.large).toBe(40);
  });
});

describe('ROUGH_CAPACITY_LABEL', () => {
  it('has labels for all tiers', () => {
    expect(ROUGH_CAPACITY_LABEL.small).toBe('~8 people');
    expect(ROUGH_CAPACITY_LABEL.medium).toBe('~20 people');
    expect(ROUGH_CAPACITY_LABEL.large).toBe('~40 people');
  });
});

describe('GROUP_SIZE_CONFIG', () => {
  it('solo config is correct', () => {
    expect(GROUP_SIZE_CONFIG.solo.min).toBe(1);
    expect(GROUP_SIZE_CONFIG.solo.max).toBe(1);
  });

  it('large group has null max', () => {
    expect(GROUP_SIZE_CONFIG.large.max).toBeNull();
  });
});

describe('calcRemainingCapacity', () => {
  it('returns null for unknown capacity tier', () => {
    const r = calcRemainingCapacity('giant', []);
    expect(r.remaining).toBeNull();
    expect(r.label).toBe('Capacity unknown');
  });

  it('returns max when there are no claims', () => {
    const r = calcRemainingCapacity('small', []);
    expect(r.remaining).toBe(8);
    expect(r.label).toBe('~8 people can still fit');
  });

  it('subtracts claim group_size_min from max', () => {
    const claims = [{ group_size_min: 3 }, { group_size_min: 2 }];
    const r = calcRemainingCapacity('medium', claims);
    expect(r.remaining).toBe(15); // 20 - 5
    expect(r.label).toBe('~15 people can still fit');
  });

  it('defaults to 1 per claim when group_size_min is missing', () => {
    const claims = [{ group_size_min: null }, {}];
    const r = calcRemainingCapacity('small', claims);
    expect(r.remaining).toBe(6); // 8 - 1 - 1
  });

  it('does not go below 0 remaining', () => {
    const claims = Array.from({ length: 15 }, () => ({ group_size_min: 3 }));
    const r = calcRemainingCapacity('small', claims);
    expect(r.remaining).toBe(0);
    expect(r.label).toBe('Likely full');
  });

  it('uses singular "person" when only 1 remaining', () => {
    const claims = [{ group_size_min: 7 }];
    const r = calcRemainingCapacity('small', claims);
    expect(r.remaining).toBe(1);
    expect(r.label).toBe('~1 person can still fit');
  });
});
