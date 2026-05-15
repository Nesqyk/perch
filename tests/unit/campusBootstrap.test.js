/**
 * tests/unit/campusBootstrap.test.js
 *
 * Unit tests for src/utils/campusBootstrap.js — pure helpers for campus-name
 * normalisation and starter-campus bootstrapping.
 */

import { describe, it, expect } from 'vitest';
import {
  CAMPUS_BOOTSTRAP_TEMPLATES,
  normalizeCampusName,
  findCampusTemplate,
  deriveCampusShell,
  deriveCampusShortName,
  buildStarterBuildings,
  buildStarterSpots,
} from '../../src/utils/campusBootstrap.js';

// ─── CAMPUS_BOOTSTRAP_TEMPLATES ──────────────────────────────────────────────

describe('CAMPUS_BOOTSTRAP_TEMPLATES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(CAMPUS_BOOTSTRAP_TEMPLATES)).toBe(true);
  });

  it('contains the CTU Main template', () => {
    const ctu = CAMPUS_BOOTSTRAP_TEMPLATES[0];
    expect(ctu.aliases).toContain('ctu main campus');
    expect(ctu.campus.short_name).toBe('CTU Main');
    expect(ctu.buildings).toHaveLength(4);
    expect(ctu.starterSpots).toHaveLength(4);
  });

  it('contains the USC template', () => {
    const usc = CAMPUS_BOOTSTRAP_TEMPLATES[1];
    expect(usc.aliases).toContain('university of san carlos');
    expect(usc.campus.short_name).toBe('USC');
    expect(usc.buildings).toHaveLength(4);
    expect(usc.starterSpots).toHaveLength(3);
  });

  it('each template has required fields', () => {
    for (const tmpl of CAMPUS_BOOTSTRAP_TEMPLATES) {
      expect(tmpl.aliases.length).toBeGreaterThan(0);
      expect(tmpl.campus.name).toBeTruthy();
      expect(typeof tmpl.campus.lat).toBe('number');
      expect(typeof tmpl.campus.lng).toBe('number');
      expect(Array.isArray(tmpl.buildings)).toBe(true);
      expect(Array.isArray(tmpl.starterSpots)).toBe(true);
    }
  });
});

// ─── normalizeCampusName ─────────────────────────────────────────────────────

describe('normalizeCampusName', () => {
  it('lowercases and trims the input', () => {
    expect(normalizeCampusName('  CTU Main Campus  ')).toBe('ctu-main-campus');
  });

  it('replaces non-alphanumeric characters with hyphens, keeping letters', () => {
    expect(normalizeCampusName("UCSD's Campus!")).toBe('ucsd-s-campus');
  });

  it('removes leading and trailing hyphens', () => {
    expect(normalizeCampusName('--hello--')).toBe('hello');
  });

  it('collapses multiple spaces/hyphens into one', () => {
    expect(normalizeCampusName('CTU   Main   Campus')).toBe('ctu-main-campus');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeCampusName('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeCampusName(null)).toBe('');
    expect(normalizeCampusName(undefined)).toBe('');
  });
});

// ─── findCampusTemplate ──────────────────────────────────────────────────────

describe('findCampusTemplate', () => {
  it('returns the CTU template when given a matching alias', () => {
    const result = findCampusTemplate('CTU Main Campus');
    expect(result).not.toBeNull();
    expect(result.campus.short_name).toBe('CTU Main');
  });

  it('is case-insensitive', () => {
    expect(findCampusTemplate('CTU MAIN')).not.toBeNull();
    expect(findCampusTemplate('ctu main')).not.toBeNull();
  });

  it('returns null for an unknown campus name', () => {
    expect(findCampusTemplate('University of Nowhere')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findCampusTemplate('')).toBeNull();
    expect(findCampusTemplate(null)).toBeNull();
  });
});

// ─── deriveCampusShell ──────────────────────────────────────────────────────

describe('deriveCampusShell', () => {
  it('returns template data for a known campus', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    expect(shell.name).toBe('CTU Main Campus');
    expect(shell.short_name).toBe('CTU Main');
    expect(shell.bootstrap_source).toBe('template');
    expect(shell.bootstrap_status).toBe('ready');
  });

  it('includes normalized_name', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    expect(shell.normalized_name).toBe('ctu-main-campus');
  });

  it('returns fallback data for an unknown campus', () => {
    const shell = deriveCampusShell('Brand New University');
    expect(shell.name).toBe('Brand New University');
    expect(shell.bootstrap_source).toBe('manual');
    expect(shell.bootstrap_status).toBe('needs_review');
  });

  it('generates a short_name from the first letters of the unknown name', () => {
    const shell = deriveCampusShell('University of Technology');
    expect(shell.short_name).toBe('UOT');
  });

  it('uses "New Campus" when the name is empty', () => {
    const shell = deriveCampusShell('');
    expect(shell.name).toBe('New Campus');
    expect(shell.normalized_name).toBe('new-campus');
  });

  it('uses "New Campus" when the name is null', () => {
    const shell = deriveCampusShell(null);
    expect(shell.name).toBe('New Campus');
  });

  it('fallback includes default coordinates', () => {
    const shell = deriveCampusShell('Unknown');
    expect(shell.lat).toBe(10.2936);
    expect(shell.lng).toBe(123.8809);
  });
});

describe('deriveCampusShortName', () => {
  it('uses the first letters from up to three words', () => {
    expect(deriveCampusShortName('University of Technology')).toBe('UOT');
  });

  it('falls back to CMP for blank names', () => {
    expect(deriveCampusShortName('')).toBe('CMP');
    expect(deriveCampusShortName(null)).toBe('CMP');
  });
});

// ─── buildStarterBuildings ───────────────────────────────────────────────────

describe('buildStarterBuildings', () => {
  it('returns buildings from the matching template', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const buildings = buildStarterBuildings('campus-id-123', shell);
    expect(buildings).toHaveLength(4);
    expect(buildings[0].name).toBe('Main Library');
    expect(buildings[0].campus_id).toBe('campus-id-123');
    expect(buildings[0].slug).toBe('main-library');
    expect(typeof buildings[0].lat).toBe('number');
    expect(typeof buildings[0].lng).toBe('number');
  });

  it('lat/lng are offset from campus center', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const buildings = buildStarterBuildings('x', shell);
    // Main Library latOffset: 0.00055, so lat = 10.2936 + 0.00055
    expect(buildings[0].lat).toBeCloseTo(10.29415, 7);
    expect(buildings[0].lng).toBeCloseTo(123.8806, 7);
  });

  it('returns empty array for an unknown campus', () => {
    const shell = deriveCampusShell('Unknown');
    const buildings = buildStarterBuildings('campus-id', shell);
    expect(buildings).toEqual([]);
  });

  it('each building has required fields', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const buildings = buildStarterBuildings('c-id', shell);
    for (const b of buildings) {
      expect(b.campus_id).toBe('c-id');
      expect(b.name).toBeTruthy();
      expect(b.slug).toBeTruthy();
    }
  });
});

// ─── buildStarterSpots ──────────────────────────────────────────────────────

describe('buildStarterSpots', () => {
  it('returns starter spots linked to buildings', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const buildings = buildStarterBuildings('campus-id-123', shell);
    const bySlug = Object.fromEntries(
      buildings.map((b) => [b.slug, { ...b, id: b.slug + '-id' }]),
    );

    const spots = buildStarterSpots('campus-id-123', shell, bySlug);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    expect(spots[0].campus_id).toBe('campus-id-123');
    expect(spots[0].building_id).toBe('main-library-id');
    expect(spots[0].name).toBe('Library Reading Room');
  });

  it('skips spots whose building name is not found in buildingBySlug', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const spots = buildStarterSpots('campus-id', shell, {});
    expect(spots).toEqual([]);
  });

  it('returns empty array for an unknown campus', () => {
    const shell = deriveCampusShell('Unknown');
    const spots = buildStarterSpots('campus-id', shell, {});
    expect(spots).toEqual([]);
  });

  it('each spot has required fields', () => {
    const shell = deriveCampusShell('CTU Main Campus');
    const buildings = buildStarterBuildings('c-id', shell);
    const bySlug = Object.fromEntries(
      buildings.map((b) => [b.slug, { ...b, id: b.slug + '-id' }]),
    );
    const spots = buildStarterSpots('c-id', shell, bySlug);
    for (const s of spots) {
      expect(s.campus_id).toBe('c-id');
      expect(s.building_id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.on_campus).toBe(true);
    }
  });
});
