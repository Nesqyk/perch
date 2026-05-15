import { describe, expect, it } from 'vitest';

import { isValidPhoneNumber, normalizePhoneNumber } from '../../src/utils/phone.js';

describe('normalizePhoneNumber', () => {
  it('normalizes local PH mobile numbers', () => {
    expect(normalizePhoneNumber('0917 123 4567')).toEqual({
      value: '+639171234567',
      error: null,
    });
  });

  it('keeps valid E.164 PH mobile numbers', () => {
    expect(normalizePhoneNumber('+639171234567')).toEqual({
      value: '+639171234567',
      error: null,
    });
  });

  it('rejects ambiguous non-PH formats', () => {
    expect(normalizePhoneNumber('555-1212').error).toBeTruthy();
  });
});

describe('isValidPhoneNumber', () => {
  it('accepts only normalized PH mobile numbers', () => {
    expect(isValidPhoneNumber('+639171234567')).toBe(true);
    expect(isValidPhoneNumber('09171234567')).toBe(false);
  });
});
