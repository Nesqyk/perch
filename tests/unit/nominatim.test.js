/**
 * tests/unit/nominatim.test.js
 *
 * Pure unit tests for reverse-geocode area extraction helpers.
 */

import { describe, expect, it } from 'vitest';

import { extractAreaPrefill, extractCity } from '../../src/utils/nominatim.js';

describe('nominatim helpers', () => {
  it('extracts sitio, barangay, and city from a reverse-geocode address', () => {
    const result = extractAreaPrefill({
      suburb: 'Sitio Riverside',
      barangay: 'Tinago',
      city: 'Cebu City',
    }, 'Sitio Riverside, Tinago, Cebu City');

    expect(result).toEqual({
      sitio: 'Sitio Riverside',
      barangay: 'Tinago',
      cityMunicipality: 'Cebu City',
      displayLabel: 'Sitio Riverside, Tinago, Cebu City',
    });
  });

  it('falls back through alternative locality fields', () => {
    expect(extractCity({
      municipality: 'Liloan',
    })).toBe('Liloan');

    const result = extractAreaPrefill({
      neighbourhood: 'Purok 4',
      barangay: 'Poblacion',
      town: 'Minglanilla',
    });

    expect(result).toMatchObject({
      sitio: 'Purok 4',
      barangay: 'Poblacion',
      cityMunicipality: 'Minglanilla',
    });
  });

  it('returns empty strings for unusable address objects', () => {
    expect(extractAreaPrefill(null, '')).toEqual({
      sitio: '',
      barangay: '',
      cityMunicipality: '',
      displayLabel: '',
    });
  });
});
