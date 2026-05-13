/**
 * src/ui/sharedSpotDetails.js
 *
 * Curated presentation metadata for the shared spot page.
 *
 * The current spots table does not yet include public detail-page fields such
 * as hero photos, addresses, hours, popularity windows, or recent check-ins.
 * This module keeps those display-only values local until the schema catches up.
 */

const DEFAULT_SHARED_SPOT_DETAIL = Object.freeze({
  heroImage: '/location-nyor-cafe.png',
  address: 'M.J. Cuenco Ave, Cebu City',
  walkLabel: '2 min walk from CTU Gate 1',
  hoursLabel: 'Open until 9:00 PM',
  popularityLabel: 'Busy during 3-6 PM',
  capacityLabel: 'Good for 4-8 students',
  badges: ['Free', 'Popular'],
  activity: [
    { name: 'Marc S.', initials: 'MS', meta: 'Checked in 5 mins ago', tag: 'Studying' },
    { name: 'Liza R.', initials: 'LR', meta: '15 mins ago', tag: 'Coffee' },
    { name: 'John K.', initials: 'JK', meta: '45 mins ago', tag: 'Studying' },
  ],
});

const SHARED_SPOT_DETAILS = Object.freeze({
  'a1b2c3d4-0001-4000-8000-000000000006': {
    address: 'Inside CTU Main Campus Canteen',
    walkLabel: 'Near the main student flow',
    popularityLabel: 'Busiest during lunch breaks',
    capacityLabel: 'Good for 8-20 students',
    badges: ['Food', 'Popular'],
  },
  'a1b2c3d4-0001-4000-8000-000000000003': {
    address: 'IT Building Lobby, CTU Main Campus',
    walkLabel: '1 min walk from IT classrooms',
    hoursLabel: 'Open during building hours',
    popularityLabel: 'Busy during 10 AM-12 PM',
    capacityLabel: 'Good for 8-20 students',
    badges: ['Free', 'Power'],
  },
  'a1b2c3d4-0001-4000-8000-000000000001': {
    address: 'Main Library, 2F Reading Wing',
    walkLabel: 'On campus',
    hoursLabel: 'Open during library hours',
    popularityLabel: 'Quietest after peak class changes',
    capacityLabel: 'Good for 20+ students',
    badges: ['Quiet', 'Reliable'],
  },
});

/**
 * Return curated public-page metadata for a shared spot.
 *
 * @param {object} spot
 * @returns {{
 *   heroImage: string,
 *   address: string,
 *   walkLabel: string,
 *   hoursLabel: string,
 *   popularityLabel: string,
 *   capacityLabel: string,
 *   badges: string[],
 *   activity: Array<{ name: string, initials: string, meta: string, tag: string }>
 * }}
 */
export function getSharedSpotDetail(spot) {
  const override = SHARED_SPOT_DETAILS[spot?.id] ?? {};
  return {
    ...DEFAULT_SHARED_SPOT_DETAIL,
    ...override,
    activity: override.activity ?? DEFAULT_SHARED_SPOT_DETAIL.activity,
  };
}
