/**
 * @vitest-environment jsdom
 *
 * tests/unit/auth.test.js
 *
 * Unit tests for passwordless email auth helpers and API calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../src/api/supabaseClient.js';

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('../../src/core/store.js', () => ({
  dispatch: vi.fn(),
}));

import {
  authErrorMessage,
  fallbackNameFromEmail,
  isValidEmail,
  normalizeEmail,
  signInWithEmailOtp,
} from '../../src/api/auth.js';

describe('auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '#/settings';
  });

  it('normalizes and validates email addresses', () => {
    expect(normalizeEmail('  Student.Name@School.EDU  ')).toBe('student.name@school.edu');
    expect(isValidEmail('student.name@school.edu')).toBe(true);
    expect(isValidEmail('student.name')).toBe(false);
  });

  it('derives a readable fallback name from email', () => {
    expect(fallbackNameFromEmail('alex.chen@school.edu')).toBe('Alex Chen');
    expect(fallbackNameFromEmail('')).toBe('Perch member');
  });

  it('does not call Supabase for invalid email', async () => {
    const result = await signInWithEmailOtp('not-an-email');

    expect(result.error).toBe('Enter a valid email address.');
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('calls Supabase passwordless email auth with the current redirect URL', async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: null });

    const result = await signInWithEmailOtp('  Student@School.EDU ');

    expect(result.error).toBeNull();
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'student@school.edu',
      options: {
        emailRedirectTo: 'http://localhost:3000/#/settings',
      },
    });
  });

  it('maps common auth errors to user-friendly messages', () => {
    expect(authErrorMessage({ status: 429, message: 'rate limit exceeded' }))
      .toBe('Too many attempts. Please wait a bit before trying again.');
    expect(authErrorMessage({ message: 'Signups not allowed for this instance' }))
      .toBe('Email sign-in is not enabled for this project yet.');
    expect(authErrorMessage({ message: 'Failed to fetch' }))
      .toBe('Could not reach Perch auth. Check your connection and try again.');
  });
});
