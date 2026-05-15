import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.hoisted(() => vi.fn());
const builder = vi.hoisted(() => ({
  select: vi.fn(() => builder),
  eq: vi.fn(() => builder),
  is: vi.fn(() => builder),
  order: vi.fn(() => builder),
  limit: vi.fn(),
  insert: vi.fn(() => builder),
  single: vi.fn(),
}));

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from: fromMock,
  },
}));

describe('findOrCreateArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue(builder);
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.is.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.insert.mockReturnValue(builder);
  });

  it('reuses the oldest matching area when duplicates already exist', async () => {
    const existing = { id: 'area-1', barangay: 'Sambag II', city_municipality: 'Cebu City' };
    builder.limit.mockResolvedValue({ data: [existing], error: null });

    const { findOrCreateArea } = await import('../../src/api/areas.js');
    const result = await findOrCreateArea({
      barangay: 'Sambag II',
      cityMunicipality: 'Cebu City',
    });

    expect(result).toEqual({ area: existing, error: null });
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('creates an area when no matching row exists', async () => {
    builder.limit.mockResolvedValue({ data: [], error: null });
    builder.single.mockResolvedValue({
      data: { id: 'area-2', barangay: 'Sambag II', city_municipality: 'Cebu City' },
      error: null,
    });

    const { findOrCreateArea } = await import('../../src/api/areas.js');
    const result = await findOrCreateArea({
      sitio: ' Sitio  San Jose ',
      barangay: ' Sambag II ',
      cityMunicipality: ' Cebu City ',
      lat: 10.3,
      lng: 123.9,
    });

    expect(builder.insert).toHaveBeenCalledWith({
      sitio: 'Sitio San Jose',
      barangay: 'Sambag II',
      city_municipality: 'Cebu City',
      lat: 10.3,
      lng: 123.9,
    });
    expect(result.error).toBeNull();
  });
});
