/**
 * src/ui/sharedSpotPage.js
 *
 * Route-level shared spot destination for #/spot.
 *
 * This page is the deep-linkable version of a single Perch spot so a copied
 * share URL can open a focused summary before the user jumps into the live map.
 */

import { Clock3, LogIn, MapPinned, Navigation, Share2, Sparkles, Users, Wifi } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { dispatch, getState } from '../core/store.js';
import { buildSpotShareUrl, navigateTo, readUrlParams } from '../core/router.js';
import { formatConfidence } from '../utils/confidence.js';
import { calcRemainingCapacity } from '../utils/capacity.js';
import { timeAgo } from '../utils/time.js';
import { deriveSpotStatus, getActiveClaimsForSpot } from '../state/spotState.js';
import { iconSvg } from './icons.js';
import { showToast } from './toast.js';

const VIEW_ID = 'view-spot';

/**
 * Initialise the shared spot page renderer.
 *
 * @returns {void}
 */
export function initSharedSpotPage() {
  const rerender = () => _renderSharedSpotPage();

  on(EVENTS.ROUTE_CHANGED, rerender);
  on(EVENTS.SPOTS_LOADED, rerender);
  on(EVENTS.CLAIM_UPDATED, rerender);
  on(EVENTS.CLAIM_REMOVED, rerender);
  on(EVENTS.CAMPUSES_LOADED, rerender);
  on(EVENTS.AUTH_STATE_CHANGED, rerender);

  _renderSharedSpotPage();
}

function _renderSharedSpotPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentRoute, spots, campuses, confidence, claims, currentUser, status } = getState();
  const { selectedSpotId } = readUrlParams();

  view.innerHTML = '';
  if (currentRoute !== '/spot') return;

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  if (!selectedSpotId) {
    shell.appendChild(_buildEmptyState('No shared spot selected yet.', 'Open a Perch share link with a spot id to see the location summary here.'));
    view.appendChild(shell);
    return;
  }

  const spot = spots.find((entry) => entry.id === selectedSpotId) ?? null;
  if (!spot) {
    if (status.spotsLoading) {
      shell.appendChild(_buildEmptyState('Loading shared spot.', 'Pulling the latest spot availability, walk time, and live claim data.'));
    } else {
      shell.appendChild(_buildEmptyState('That shared spot is unavailable.', 'It may have been removed or is not active anymore. Try returning to the map and choosing another spot.'));
    }
    view.appendChild(shell);
    return;
  }

  const spotClaims = getActiveClaimsForSpot(spot.id, claims);
  const statusKey = deriveSpotStatus(spot.id);
  const confDisplay = formatConfidence(confidence[spot.id]?.score);
  const capacity = calcRemainingCapacity(spot.rough_capacity, spotClaims);
  const campus = campuses.find((entry) => entry.id === spot.campus_id) ?? null;

  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch shared spot</p>
      <h1 class="page-shell__title">${_escapeHtml(spot.name)}</h1>
      <p class="page-shell__subtitle">${_escapeHtml(_subtitle(spot, campus))}</p>
    </div>
  `;

  shell.appendChild(_buildHeroCard(spot, campus, statusKey, confDisplay, capacity, spotClaims.length, currentUser));

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two shared-spot-page__grid';
  grid.appendChild(_buildFactsCard(spot, confDisplay, capacity, spotClaims));
  grid.appendChild(_buildAmenitiesCard(spot, statusKey, confDisplay, spotClaims));
  shell.appendChild(grid);

  view.appendChild(shell);
}

function _buildHeroCard(spot, campus, statusKey, confDisplay, capacity, claimCount, currentUser) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--hero';
  card.innerHTML = /* html */`
    <div class="shared-spot-page__hero-head">
      <div>
        <div class="page-card__eyebrow">Live status</div>
        <h2 class="page-card__title">${_escapeHtml(confDisplay.label)}</h2>
        <p class="page-card__copy">${_escapeHtml(campus?.name || 'Campus location')} • ${claimCount} active claim${claimCount === 1 ? '' : 's'} right now</p>
      </div>
      <div class="settings-page__cta-row">
        <button type="button" class="btn btn-primary" id="shared-spot-open-map">${iconSvg(MapPinned, 16)} Open in live map</button>
        <button type="button" class="btn btn-ghost" id="shared-spot-copy-link">${iconSvg(Share2, 16)} Copy share link</button>
      </div>
    </div>
    <div class="shared-spot-page__stats">
      ${_statMarkup('Confidence', `${confDisplay.percent}%`)}
      ${_statMarkup('Walk time', spot.walk_time_min ? `${spot.walk_time_min} min` : 'Unknown')}
      ${_statMarkup('Capacity', capacity.remaining === null ? 'Unknown' : `${capacity.remaining} left`)}
      ${_statMarkup('Status', _capitalize(statusKey))}
    </div>
    <div class="settings-page__cta-row">
      ${currentUser
        ? `<button type="button" class="btn btn-primary" id="shared-spot-claim">${iconSvg(Sparkles, 16)} I'm going here</button>`
        : `<button type="button" class="btn btn-primary" id="shared-spot-login">${iconSvg(LogIn, 16)} Sign in to claim</button>`}
      <button type="button" class="btn btn-ghost" id="shared-spot-back">Back to map</button>
    </div>
  `;

  card.querySelector('#shared-spot-open-map')?.addEventListener('click', () => _openInMap(spot.id, spot.campus_id));
  card.querySelector('#shared-spot-copy-link')?.addEventListener('click', async () => {
    const url = buildSpotShareUrl(spot.id);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Spot link copied!', 'success');
    } catch {
      showToast(`Share this link: ${url}`, 'success');
    }
  });
  card.querySelector('#shared-spot-claim')?.addEventListener('click', () => emit(EVENTS.UI_CLAIM_REQUESTED, { spotId: spot.id }));
  card.querySelector('#shared-spot-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  card.querySelector('#shared-spot-back')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildFactsCard(spot, confDisplay, capacity, spotClaims) {
  const latestClaim = spotClaims.reduce((latest, claim) => {
    const claimedAt = new Date(claim.claimed_at).getTime();
    return claimedAt > latest ? claimedAt : latest;
  }, 0);

  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Why this page matters</div>
    <h2 class="page-card__title page-card__title--sm">Quick decision info</h2>
    <div class="shared-spot-page__fact-list">
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Clock3, 16)}</span>
        <div>
          <span class="profile-meta__title">Latest live signal</span>
          <span class="profile-meta__copy">${latestClaim ? `Someone reported this free ${timeAgo(new Date(latestClaim).toISOString())}.` : 'No active claim timing signal yet.'}</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Users, 16)}</span>
        <div>
          <span class="profile-meta__title">Estimated remaining capacity</span>
          <span class="profile-meta__copy">${_escapeHtml(capacity.label)}</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Navigation, 16)}</span>
        <div>
          <span class="profile-meta__title">Location context</span>
          <span class="profile-meta__copy">${_escapeHtml([spot.floor || null, spot.building || null].filter(Boolean).join(' • ') || 'Campus spot')}</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Sparkles, 16)}</span>
        <div>
          <span class="profile-meta__title">Confidence read</span>
          <span class="profile-meta__copy">${_escapeHtml(`${confDisplay.label} with ${confDisplay.percent}% confidence.`)}</span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function _buildAmenitiesCard(spot, statusKey, confDisplay, spotClaims) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--subtle';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Amenities</div>
    <h2 class="page-card__title page-card__title--sm">What you can expect here</h2>
    <div class="shared-spot-page__amenity-grid">
      ${_amenityCard('WiFi', spot.wifi_strength && spot.wifi_strength !== 'none' ? 'Available' : 'Unknown', iconSvg(Wifi, 16))}
      ${_amenityCard('Outlets', spot.has_outlets ? 'Likely available' : 'Not confirmed', iconSvg(Sparkles, 16))}
      ${_amenityCard('Noise', _noiseLabel(spot.noise_baseline), iconSvg(Share2, 16))}
      ${_amenityCard('Food nearby', spot.has_food ? 'Yes' : 'No signal yet', iconSvg(MapPinned, 16))}
    </div>
    <div class="shared-spot-page__status-panel shared-spot-page__status-panel--${statusKey}">
      <span class="shared-spot-page__status-title">Current call</span>
      <span class="shared-spot-page__status-copy">${_escapeHtml(`${confDisplay.label}. ${spotClaims.length} active claim${spotClaims.length === 1 ? '' : 's'} are attached to this space.`)}</span>
    </div>
  `;
  return card;
}

function _buildEmptyState(title, copy) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(MapPinned, 28)}</div>
    <h2 class="page-empty__title">${_escapeHtml(title)}</h2>
    <p class="page-empty__copy">${_escapeHtml(copy)}</p>
    <button type="button" class="btn btn-primary" id="shared-spot-empty-back">Back to map</button>
  `;
  card.querySelector('#shared-spot-empty-back')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _amenityCard(label, value, icon) {
  return /* html */`
    <div class="shared-spot-page__amenity-card">
      <span class="shared-spot-page__amenity-icon">${icon}</span>
      <span class="shared-spot-page__amenity-label">${_escapeHtml(label)}</span>
      <span class="shared-spot-page__amenity-value">${_escapeHtml(value)}</span>
    </div>
  `;
}

function _subtitle(spot, campus) {
  return [spot.floor || null, spot.building || null, campus?.name || null].filter(Boolean).join(' • ') || 'Shared Perch location';
}

function _statMarkup(label, value) {
  return /* html */`
    <div class="group-stat">
      <span class="group-stat__value">${_escapeHtml(value)}</span>
      <span class="group-stat__label">${_escapeHtml(label)}</span>
    </div>
  `;
}

function _noiseLabel(value) {
  if (!value) return 'Unknown';
  return _capitalize(String(value));
}

function _capitalize(value) {
  const text = String(value ?? '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
}

function _openInMap(spotId, campusId) {
  if (campusId) {
    dispatch('CAMPUS_SELECTED', { campusId });
  }
  navigateTo('/');
  dispatch('SELECT_SPOT', { spotId, navigate: true });
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
