/**
 * tests/unit/claimHistory.test.js
 *
 * Unit tests for the fetchClaimHistory function in src/api/claims.js.
 * Mocks Supabase to test pagination, error handling, and return shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Supabase ────────────────────────────────────────────────────────────

vi.mock('../../src/api/supabaseClient.js', () => {
  const mockRange  = vi.fn();
  const mockOrder  = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom   = vi.fn(() => ({
    select: mockSelect,
    order:  mockOrder,
    range:  mockRange,
  }));

  return {
    supabase: { from: mockFrom },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { supabase } from '../../src/api/supabaseClient.js';
import { fetchClaimHistory } from '../../src/api/claims.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function claimRow(overrides = {}) {
  return {
    id:             'claim-1',
    spot_id:        'spot-1',
    group_size_key: 'solo',
    claimed_at:     '2026-03-01T10:00:00Z',
    expires_at:     '2026-03-01T10:30:00Z',
    cancelled_at:   null,
    spots:          { name: 'Table 4', building: 'Engineering Hall' },
    ...overrides,
  };
}

describe('fetchClaimHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries claims table with select, order, and range', async () => {
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: [], error: null });

    await fetchClaimHistory();

    expect(supabase.from).toHaveBeenCalledWith('claims');
    expect(fromResult.select).toHaveBeenCalledWith(
      'id, spot_id, group_size_key, claimed_at, expires_at, cancelled_at, spots(name, building)',
    );
    expect(fromResult.order).toHaveBeenCalledWith('claimed_at', { ascending: false });
    // Supabase range() is inclusive: limit=20 → range(0, 19)
    expect(fromResult.range).toHaveBeenCalledWith(0, 19);
  });

  it('uses default limit of 20 rows (inclusive range 0–19)', async () => {
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: [], error: null });

    await fetchClaimHistory();

    expect(fromResult.range).toHaveBeenCalledWith(0, 19);
  });

  it('applies custom limit and offset to range', async () => {
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: [], error: null });

    // limit=5, offset=10 → range(10, 14)
    await fetchClaimHistory({ limit: 5, offset: 10 });

    expect(fromResult.range).toHaveBeenCalledWith(10, 14);
  });

  it('returns data array on success', async () => {
    const rows = [claimRow(), claimRow({ id: 'claim-2', spot_id: 'spot-2' })];
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: rows, error: null });

    const result = await fetchClaimHistory();

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('claim-1');
  });

  it('returns empty array when Supabase returns null data', async () => {
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: null, error: null });

    const result = await fetchClaimHistory();

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('returns empty array and the error object on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await fetchClaimHistory();

    expect(result.data).toEqual([]);
    expect(result.error).toEqual({ message: 'DB error' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('includes the nested spots object in each row', async () => {
    const row = claimRow({ spots: { name: 'Booth 2', building: 'Library' } });
    const fromResult = supabase.from('claims');
    fromResult.range.mockResolvedValue({ data: [row], error: null });

    const result = await fetchClaimHistory();

    expect(result.data[0].spots.name).toBe('Booth 2');
    expect(result.data[0].spots.building).toBe('Library');
  });
});
