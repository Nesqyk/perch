/**
 * src/ui/sharedSpotDetails.js
 *
 * Curated presentation metadata for the shared spot page.
 *
 * The current spots table does not yet include public detail-page fields such
 * as hero photos, addresses, hours, or popularity windows.
 * This module keeps those display-only values local until the schema catches up.
 */

const DEFAULT_SHARED_SPOT_DETAIL = Object.freeze({
  heroImage: '',
  address: 'M.J. Cuenco Ave, Cebu City',
  walkLabel: '2 min walk from CTU Gate 1',
  hoursLabel: 'Open until 9:00 PM',
  popularityLabel: 'Busy during 3-6 PM',
  capacityLabel: 'Good for 4-8 students',
  badges: ['Free', 'Popular'],
});

const SHARED_SPOT_DETAILS = Object.freeze({
  'a1b2c3d4-0001-4000-8000-000000000006': {
    heroImage: '/spot-nyor-cafe.jpg',
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
 *   badges: string[]
 * }}
 */
export function getSharedSpotDetail(spot) {
  const override = SHARED_SPOT_DETAILS[spot?.id] ?? {};
  return {
    ...DEFAULT_SHARED_SPOT_DETAIL,
    ...override,
  };
}
