/**
 * src/ui/featuredSpotDetails.js
 *
 * Curated presentation content for selected spots that should render with the
 * richer full-detail modal treatment. These entries complement the live spot
 * data already fetched from Supabase; they do not replace it.
 */

const FEATURED_SPOT_DETAILS = {
  'a1b2c3d4-0001-4000-8000-000000000001': {
    eyebrow: 'Featured study pick',
    vibe: 'Quiet focus zone with strong campus WiFi and the most dependable free-seat signal.',
    bestFor: 'Solo deep work, reading sprints, and low-noise review sessions.',
    accessNote: 'Best when you need a calm reset between classes. Usually easiest to settle in away from the orientation window.',
    busyWindow: 'Busiest around 8-10 AM on orientation mornings.',
    landmark: 'Inside Main Library, 2F reading wing.',
    highlightLabel: 'Reliable',
    accent: 'var(--color-brand)',
    accentStrong: 'var(--color-green-700)',
    accentSoft: 'var(--color-brand-light)',
    accentContrast: 'var(--color-white)',
  },
  'a1b2c3d4-0001-4000-8000-000000000003': {
    eyebrow: 'Featured group-friendly spot',
    vibe: 'A bright lobby setup that stays practical when you need outlets, movement, and quick meetups.',
    bestFor: 'Laptop work, pair sessions, and waiting between classes without leaving the building.',
    accessNote: 'Works well for quick resets and catch-ups, especially if your group needs power nearby.',
    busyWindow: 'Most active in the late morning when IT classes rotate.',
    landmark: 'Ground floor lobby of the IT Building.',
    highlightLabel: 'Power-friendly',
    accent: 'var(--color-blue-500)',
    accentStrong: 'var(--color-blue-700)',
    accentSoft: 'color-mix(in srgb, var(--color-blue-500) 12%, var(--color-white))',
    accentContrast: 'var(--color-white)',
  },
  'a1b2c3d4-0001-4000-8000-000000000006': {
    eyebrow: 'Featured social perch',
    vibe: 'Livelier than the library, but useful when your group wants food nearby and enough room to spread out.',
    bestFor: 'Casual reviews, snack breaks, and larger groups that do not need a silent room.',
    accessNote: 'Great fallback when you want energy and convenience more than quiet.',
    busyWindow: 'Fills up fastest around meal breaks and lunch rush.',
    landmark: 'Far-side study corner near the campus canteen seating.',
    highlightLabel: 'Food nearby',
    accent: 'var(--color-yellow-400)',
    accentStrong: 'var(--color-yellow-700)',
    accentSoft: 'color-mix(in srgb, var(--color-yellow-100) 76%, var(--color-white))',
    accentContrast: 'var(--color-gray-900)',
  },
  'a1b2c3d4-0001-4000-8000-000000000008': {
    eyebrow: 'Featured quiet backup',
    vibe: 'A tucked-away lounge feel that usually rewards you with low noise and a calmer pace.',
    bestFor: 'Focused catch-up work, small study duos, and avoiding the rushier campus core.',
    accessNote: 'A strong backup when the library is full but you still want a quieter environment.',
    busyWindow: 'Usually steadier through the day, with smaller spikes before afternoon classes.',
    landmark: 'Second-floor lounge in the Graduate School Building.',
    highlightLabel: 'Low noise',
    accent: 'var(--color-green-500)',
    accentStrong: 'var(--color-green-700)',
    accentSoft: 'var(--color-green-100)',
    accentContrast: 'var(--color-white)',
  },
};

/**
 * Return curated modal content for a selected featured spot.
 *
 * @param {string} spotId
 * @returns {object | null}
 */
export function getFeaturedSpotDetails(spotId) {
  return FEATURED_SPOT_DETAILS[spotId] ?? null;
}
