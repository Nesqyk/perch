/**
 * tests/unit/roomRange.test.js
 *
 * Unit tests for src/utils/roomRange.js.
 */

import { describe, expect, it } from 'vitest';

import { parseRoomRange } from '../../src/utils/roomRange.js';

describe('parseRoomRange', () => {
  it('creates exact numeric names for a valid range', () => {
    expect(parseRoomRange('101-105')).toEqual({
      names: ['101', '102', '103', '104', '105'],
      error: null,
    });
  });

  it('preserves leading zero width across the range', () => {
    expect(parseRoomRange('001-003')).toEqual({
      names: ['001', '002', '003'],
      error: null,
    });
  });

  it('rejects reversed ranges', () => {
    expect(parseRoomRange('110-101')).toEqual({
      names: [],
      error: 'The room range must start before it ends.',
    });
  });

  it('rejects non-numeric formats', () => {
    expect(parseRoomRange('Lab A - Lab D')).toEqual({
      names: [],
      error: 'Use a numeric range like 101-110.',
    });
  });

  it('rejects ranges above the batch cap', () => {
    expect(parseRoomRange('1-60', { maxCount: 50 })).toEqual({
      names: [],
      error: 'You can add up to 50 rooms at once.',
    });
  });
});
