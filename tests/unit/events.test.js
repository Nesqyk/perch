/**
 * tests/unit/events.test.js
 *
 * Unit tests for src/core/events.js — the shared pub/sub event bus
 * built on the native EventTarget API (Node 18+).
 */

import { describe, it, expect, vi } from 'vitest';
import { on, off, emit, once, EVENTS } from '../../src/core/events.js';

// ─── on / emit ────────────────────────────────────────────────────────────────

describe('on / emit', () => {
  it('calls the handler when the matching event is emitted', () => {
    const handler = vi.fn();
    on('test:emit', handler);
    emit('test:emit', { data: 42 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the payload as e.detail', () => {
    const handler = vi.fn();
    on('test:detail', handler);
    emit('test:detail', { msg: 'hello' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { msg: 'hello' } }),
    );
  });

  it('calls every handler registered on the same event', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('test:multi', a);
    on('test:multi', b);
    emit('test:multi');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not call handlers registered on a different event', () => {
    const handler = vi.fn();
    on('test:alpha', handler);
    emit('test:beta');
    expect(handler).not.toHaveBeenCalled();
  });

  it('works without a detail payload (detail is null by CustomEvent default)', () => {
    const handler = vi.fn();
    on('test:nodetail', handler);
    emit('test:nodetail');
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail).toBeNull();
  });

  it('emitting on a name with no subscribers does not throw', () => {
    expect(() => emit('test:ghost')).not.toThrow();
  });
});

// ─── off ─────────────────────────────────────────────────────────────────────

describe('off', () => {
  it('prevents the handler from being called after unsubscribing', () => {
    const handler = vi.fn();
    on('test:off', handler);
    off('test:off', handler);
    emit('test:off');
    expect(handler).not.toHaveBeenCalled();
  });

  it('only removes the specified handler when multiple are registered', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('test:off-multi', a);
    on('test:off-multi', b);
    off('test:off-multi', a);
    emit('test:off-multi');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('is safe to call on an event that was never subscribed', () => {
    expect(() => off('test:none', vi.fn())).not.toThrow();
  });

  it('only removes the exact handler reference', () => {
    const handler = vi.fn();
    const same = handler;
    const other = vi.fn();
    on('test:ref', handler);
    on('test:ref', other);
    off('test:ref', same);
    emit('test:ref');
    expect(handler).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });
});

// ─── once ─────────────────────────────────────────────────────────────────────

describe('once', () => {
  it('calls the handler only the first time the event fires', () => {
    const handler = vi.fn();
    once('test:once', handler);
    emit('test:once');
    emit('test:once');
    emit('test:once');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the detail payload', () => {
    const handler = vi.fn();
    once('test:once-detail', handler);
    emit('test:once-detail', { value: 7 });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { value: 7 } }),
    );
  });

  it('works alongside permanent subscribers without interference', () => {
    const onceHandler = vi.fn();
    const permHandler = vi.fn();
    once('test:mixed', onceHandler);
    on('test:mixed', permHandler);
    emit('test:mixed');
    emit('test:mixed');
    expect(onceHandler).toHaveBeenCalledTimes(1);
    expect(permHandler).toHaveBeenCalledTimes(2);
  });
});

// ─── EVENTS constant catalogue ────────────────────────────────────────────────

describe('EVENTS', () => {
  it('is frozen and cannot be extended', () => {
    expect(Object.isFrozen(EVENTS)).toBe(true);
    expect(() => { EVENTS.NEW_EVENT = 'state:new'; }).toThrow();
  });

  it('contains all expected well-known event keys', () => {
    expect(EVENTS.LOCATION_SET).toBe('state:locationSet');
    expect(EVENTS.FILTERS_CHANGED).toBe('state:filtersChanged');
    expect(EVENTS.SPOTS_LOADED).toBe('state:spotsLoaded');
    expect(EVENTS.SPOT_SELECTED).toBe('state:spotSelected');
    expect(EVENTS.CLAIM_UPDATED).toBe('state:claimUpdated');
    expect(EVENTS.CORRECTION_FILED).toBe('state:correctionFiled');
    expect(EVENTS.MAP_READY).toBe('map:ready');
    expect(EVENTS.UI_CLAIM_REQUESTED).toBe('ui:claimRequested');
    expect(EVENTS.ROUTE_CHANGED).toBe('state:routeChanged');
    expect(EVENTS.AUTH_STATE_CHANGED).toBe('state:authChanged');
  });

  it('all values follow the namespace:event pattern', () => {
    for (const key of Object.keys(EVENTS)) {
      expect(EVENTS[key]).toMatch(/^(state|map|ui):/);
    }
  });
});

// ─── emit — edge cases ───────────────────────────────────────────────────────

describe('emit — edge cases', () => {
  it('emitting with null detail does not throw', () => {
    const handler = vi.fn();
    on('test:null', handler);
    expect(() => emit('test:null', null)).not.toThrow();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: null }),
    );
  });

  it('emitting with undefined detail does not throw', () => {
    const handler = vi.fn();
    on('test:undefined', handler);
    expect(() => emit('test:undefined', undefined)).not.toThrow();
  });

  it('handles rapid successive emits without leaking', () => {
    const handler = vi.fn();
    on('test:rapid', handler);
    for (let i = 0; i < 100; i++) emit('test:rapid');
    expect(handler).toHaveBeenCalledTimes(100);
  });
});
