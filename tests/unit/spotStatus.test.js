import { describe, expect, it, vi } from 'vitest';

const stateRef = vi.hoisted(() => ({ current: null }));

vi.mock('../../src/core/store.js', () => ({
  getState: () => stateRef.current,
}));

function baseState(overrides = {}) {
  return {
    spots: [],
    claims: {},
    confidence: {},
    ...overrides,
  };
}

function activeClaim(overrides = {}) {
  return {
    id: 'claim-1',
    cancelled_at: null,
    expires_at: '2999-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('deriveSpotStatus', () => {
  it('keeps active claims above a manual available report', async () => {
    stateRef.current = baseState({
      spots: [{ id: 'spot-1', availability_status: 'available' }],
      claims: { 'spot-1': [activeClaim()] },
      confidence: { 'spot-1': { score: 0.95 } },
    });

    const { deriveSpotStatus } = await import('../../src/state/spotState.js');

    expect(deriveSpotStatus('spot-1')).toBe('claimed');
  });

  it('treats a manual occupied report as full', async () => {
    stateRef.current = baseState({
      spots: [{ id: 'spot-1', availability_status: 'occupied' }],
      claims: {},
      confidence: { 'spot-1': { score: 0.95 } },
    });

    const { deriveSpotStatus } = await import('../../src/state/spotState.js');

    expect(deriveSpotStatus('spot-1')).toBe('full');
  });
});
