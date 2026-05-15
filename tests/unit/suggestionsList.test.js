/**
 * tests/unit/suggestionsList.test.js
 *
 * Tests for the logic within the SuggestionsList component.
 */

import { describe, it, expect } from 'vitest';
import { formatSuggestions } from '../../src/ui/suggestionsList.js';

describe('formatSuggestions', () => {
  it('returns all suggestions when more than 5 are provided (slicing is done by the renderer)', () => {
    const spots = [
      { id: '1', name: 'Spot 1', _distance: 100 },
      { id: '2', name: 'Spot 2', _distance: 200 },
      { id: '3', name: 'Spot 3', _distance: 300 },
      { id: '4', name: 'Spot 4', _distance: 400 },
      { id: '5', name: 'Spot 5', _distance: 500 },
      { id: '6', name: 'Spot 6', _distance: 600 },
    ];
    const result = formatSuggestions(spots);
    expect(result).toHaveLength(6);
    expect(result[0].id).toBe('1');
  });

  it('returns all suggestions if fewer than 3 are provided', () => {
    const spots = [
      { id: '1', name: 'Spot 1', _distance: 100 },
    ];
    const result = formatSuggestions(spots);
    expect(result).toHaveLength(1);
  });

  it('adds a formatted walk time label based on 84m/min speed', () => {
    const spots = [
      { id: '1', name: 'Spot 1', _distance: 84 }, // 1 min
      { id: '2', name: 'Spot 2', _distance: 42 }, // < 1 min (0 min)
      { id: '3', name: 'Spot 3', _distance: 840 }, // 10 min
    ];
    const result = formatSuggestions(spots);
    expect(result[0].walkTimeLabel).toBe('1 min walk');
    expect(result[1].walkTimeLabel).toBe('< 1 min walk');
    expect(result[2].walkTimeLabel).toBe('10 min walk');
  });

  it('handles spots without distance', () => {
    const spots = [{ id: '1', name: 'Spot 1' }];
    const result = formatSuggestions(spots);
    expect(result[0].walkTimeLabel).toBeUndefined();
  });
});
