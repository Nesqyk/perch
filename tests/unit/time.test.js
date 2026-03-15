/**
 * tests/unit/time.test.js
 *
 * Unit tests for src/utils/time.js
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo, formatTime, claimExpiresIn, formatWalkTime } from '../../src/utils/time.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('timeAgo', () => {
  it('returns "just now" for timestamps < 30s ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    const ts = new Date(now.getTime() - 10_000); // 10s ago
    expect(timeAgo(ts)).toBe('just now');
  });

  it('returns "1m ago" for 30–89s ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    expect(timeAgo(new Date(now.getTime() - 60_000))).toBe('1m ago');
  });

  it('returns "Xm ago" for 90s–59m', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    expect(timeAgo(new Date(now.getTime() - 5 * 60_000))).toBe('5m ago');
  });

  it('returns "Xh ago" for >=60m and < 24h', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    expect(timeAgo(new Date(now.getTime() - 2 * 3600_000))).toBe('2h ago');
  });

  it('returns a date string for timestamps >= 24h ago', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    const old = new Date(now.getTime() - 48 * 3600_000);
    const result = timeAgo(old);
    // Should be a date string, not "Xh ago"
    expect(result).not.toMatch(/ago/);
  });
});

describe('formatTime', () => {
  it('returns empty string for falsy input', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime(null)).toBe('');
  });

  it('formats midnight correctly', () => {
    expect(formatTime('00:00:00')).toBe('12:00 AM');
  });

  it('formats noon correctly', () => {
    expect(formatTime('12:00:00')).toBe('12:00 PM');
  });

  it('formats 1 PM correctly', () => {
    expect(formatTime('13:00:00')).toBe('1:00 PM');
  });

  it('formats 9 AM correctly', () => {
    expect(formatTime('09:30:00')).toBe('9:30 AM');
  });

  it('formats 11:59 PM correctly', () => {
    expect(formatTime('23:59:00')).toBe('11:59 PM');
  });
});

describe('claimExpiresIn', () => {
  it('returns "expired" for past timestamps', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    const past = new Date(now.getTime() - 60_000);
    expect(claimExpiresIn(past)).toBe('expired');
  });

  it('returns "expires in Xm" for future timestamps', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    const future = new Date(now.getTime() + 18 * 60_000);
    expect(claimExpiresIn(future)).toBe('expires in 18m');
  });

  it('rounds up partial minutes', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-10T10:00:00Z');
    vi.setSystemTime(now);
    // 18m 30s in the future → ceil to 19m
    const future = new Date(now.getTime() + 18 * 60_000 + 30_000);
    expect(claimExpiresIn(future)).toBe('expires in 19m');
  });
});

describe('formatWalkTime', () => {
  it('returns "< 1 min walk" for distances < 84m', () => {
    expect(formatWalkTime(0)).toBe('< 1 min walk');
    expect(formatWalkTime(42)).toBe('< 1 min walk');
    expect(formatWalkTime(83)).toBe('< 1 min walk');
  });

  it('returns "X min walk" for distances >= 84m', () => {
    expect(formatWalkTime(84)).toBe('1 min walk');
    expect(formatWalkTime(168)).toBe('2 min walk');
    expect(formatWalkTime(840)).toBe('10 min walk');
  });
});
