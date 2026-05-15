/**
 * src/ui/sharedSpotPage.js
 *
 * Route-level public spot detail page for #/spot.
 *
 * This is the deep-linkable, full-detail presentation of one Perch location.
 * The route keeps the existing ?spot=<uuid>#/spot shape while curated metadata
 * fills fields that are not yet stored in Supabase.
 */

import {
  ArrowLeft,
  ImagePlus,
  Clock,
  LogIn,
  MapPin,
  PlugZap,
  Share2,
  TrendingUp,
  UserRound,
  Users,
  Utensils,
  Volume2,
  Wifi,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { dispatch, getState } from '../core/store.js';
import { buildSpotShareUrl, navigateTo, readUrlParams } from '../core/router.js';
import { calcRemainingCapacity } from '../utils/capacity.js';
import { formatConfidence } from '../utils/confidence.js';
import { attachSpotImage, fetchSpots, uploadSpotImage } from '../api/spots.js';
import { deriveSpotStatus, getActiveClaimsForSpot } from '../state/spotState.js';
import { iconSvg } from './icons.js';
import { getSharedSpotDetail } from './sharedSpotDetails.js';
import { showToast } from './toast.js';
import { createAvailabilityControls } from './availabilityControls.js';

const VIEW_ID = 'view-spot';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Initialise the shared spot page renderer.
 *
 * @returns {void}
 */
export function initSharedSpotPage() {
  const rerender = () => _renderSharedSpotPage();

  on(EVENTS.ROUTE_CHANGED, rerender);
  on(EVENTS.SPOTS_LOADED, rerender);
  on(EVENTS.SPOT_WATCHERS_UPDATED, rerender);
  on(EVENTS.CLAIM_UPDATED, rerender);
  on(EVENTS.CLAIM_REMOVED, rerender);
  on(EVENTS.CAMPUSES_LOADED, rerender);
  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.NICKNAME_UPDATED, rerender);

  _renderSharedSpotPage();
}

function _renderSharedSpotPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentRoute, spots, campuses, confidence, claims, currentUser, nickname, status } = getState();
  const { selectedSpotId } = readUrlParams();

  view.innerHTML = '';
  if (currentRoute !== '/spot') return;

  const shell = document.createElement('div');
  shell.className = 'shared-location-page';

  if (!selectedSpotId) {
    shell.appendChild(_buildEmptyState('No shared spot selected yet.', 'Open a Perch share link with a spot id to see the location summary here.'));
    view.appendChild(shell);
    return;
  }

  const spot = spots.find((entry) => entry.id === selectedSpotId) ?? null;
  if (!spot) {
    if (status.spotsLoading) {
      shell.appendChild(_buildEmptyState('Loading shared spot.', 'Pulling the latest availability, walk time, and live claim data.'));
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
  const detail = getSharedSpotDetail(spot);

  shell.appendChild(_buildTopBar(currentUser, nickname));

  const layout = document.createElement('div');
  layout.className = 'shared-location-page__layout';
  layout.appendChild(_buildHeroPhoto(spot, detail, capacity, currentUser));
  layout.appendChild(_buildInfoColumn(spot, campus, detail, statusKey, confDisplay, spotClaims, currentUser));
  shell.appendChild(layout);

  view.appendChild(shell);
}

function _buildTopBar(currentUser, nickname) {
  const avatarUrl = currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture || '';
  const topBar = document.createElement('div');
  topBar.className = 'shared-location-page__topbar';
  topBar.innerHTML = /* html */`
    <button type="button" class="shared-location-page__circle-btn" id="shared-spot-back" aria-label="Back to map">
      ${iconSvg(ArrowLeft, 24)}
    </button>
    <button type="button" class="shared-location-page__avatar-btn" id="shared-spot-profile" aria-label="${currentUser ? 'Open profile' : 'Sign in'}">
      ${currentUser
        ? (avatarUrl
            ? `<img src="${_escapeAttribute(avatarUrl)}" alt="">`
            : `<span>${_escapeHtml(_initials(nickname || currentUser.email || 'Me'))}</span>`)
        : iconSvg(UserRound, 22)}
    </button>
  `;

  topBar.querySelector('#shared-spot-back')?.addEventListener('click', () => navigateTo('/'));
  topBar.querySelector('#shared-spot-profile')?.addEventListener('click', () => {
    if (currentUser) {
      navigateTo('/profile');
      return;
    }
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
  });

  return topBar;
}

function _buildHeroPhoto(spot, detail, capacity, currentUser) {
  const imageUrl = spot.image_url || detail.heroImage || '';
  const figure = document.createElement('section');
  figure.className = 'shared-location-hero';
  figure.setAttribute('aria-label', `${spot.name} photo and quick details`);
  figure.innerHTML = /* html */`
    ${imageUrl
      ? `<img class="shared-location-hero__image" src="${_escapeAttribute(imageUrl)}" alt="${_escapeHtml(spot.name)}" />`
      : _emptyHeroUploadMarkup(spot, Boolean(currentUser))}
    <div class="shared-location-hero__facts" aria-label="Location quick facts">
      ${_quickFact('Hours', detail.hoursLabel, iconSvg(Clock, 20))}
      ${_quickFact('Popularity', detail.popularityLabel, iconSvg(TrendingUp, 20))}
      ${_quickFact('Capacity', detail.capacityLabel || capacity.label, iconSvg(Users, 20))}
    </div>
  `;
  figure.querySelector('#shared-spot-upload-trigger')?.addEventListener('click', () => {
    if (!currentUser) {
      emit(EVENTS.UI_LOGIN_REQUESTED, {});
      return;
    }
    figure.querySelector('#shared-spot-image-input')?.click();
  });
  figure.querySelector('#shared-spot-image-input')?.addEventListener('change', (event) => {
    _handleSpotImageInput(event, spot.id);
  });
  return figure;
}

function _buildInfoColumn(spot, campus, detail, statusKey, confDisplay, spotClaims, currentUser) {
  const column = document.createElement('section');
  column.className = 'shared-location-detail';
  column.appendChild(_buildSummaryCard(spot, detail, statusKey, confDisplay));
  column.appendChild(createAvailabilityControls({ spot }));
  column.appendChild(_buildMapCard(spot, campus, detail));
  column.appendChild(_buildActivityCard(detail, spotClaims));
  column.appendChild(_buildActionRow(spot, currentUser));
  return column;
}

function _buildSummaryCard(spot, detail, statusKey, confDisplay) {
  const card = document.createElement('section');
  card.className = 'shared-location-card shared-location-card--summary';
  card.innerHTML = /* html */`
    <div class="shared-location-card__head">
      <h1 class="shared-location-card__title">${_escapeHtml(spot.name)}</h1>
      <div class="shared-location-badges">
        ${detail.badges.map((badge) => _badgeMarkup(badge, statusKey)).join('')}
      </div>
    </div>
    <div class="shared-location-card__rule"></div>
    <div class="shared-location-amenities" aria-label="Amenities">
      ${_amenityMarkup('Free WiFi', _hasWifi(spot), iconSvg(Wifi, 20))}
      ${_amenityMarkup('Power Outlets', Boolean(spot.has_outlets), iconSvg(PlugZap, 20))}
      ${_amenityMarkup('Food & Drinks', Boolean(spot.has_food), iconSvg(Utensils, 20))}
      ${_amenityMarkup(_noiseLabel(spot.noise_baseline), spot.noise_baseline === 'quiet', iconSvg(Volume2, 20))}
    </div>
    <p class="shared-location-card__confidence">${_escapeHtml(`${confDisplay.label} with ${confDisplay.percent}% confidence`)}</p>
  `;
  return card;
}

function _buildMapCard(spot, campus, detail) {
  const card = document.createElement('section');
  card.className = 'shared-location-card shared-location-card--map';
  card.innerHTML = /* html */`
    <div class="shared-location-map" aria-label="Map preview">
      <span class="shared-location-map__street shared-location-map__street--one"></span>
      <span class="shared-location-map__street shared-location-map__street--two"></span>
      <span class="shared-location-map__street shared-location-map__street--three"></span>
      <span class="shared-location-map__block shared-location-map__block--one"></span>
      <span class="shared-location-map__block shared-location-map__block--two"></span>
      <span class="shared-location-map__block shared-location-map__block--three"></span>
      <span class="shared-location-map__label shared-location-map__label--campus">${_escapeHtml(campus?.short_name || campus?.name || 'Campus')}</span>
      <span class="shared-location-map__label shared-location-map__label--spot">${_escapeHtml(spot.name)}</span>
      <span class="shared-location-map__pin">${iconSvg(MapPin, 20)}</span>
    </div>
    <div class="shared-location-address">
      <p class="shared-location-address__main">${_escapeHtml(detail.address)}</p>
      <p class="shared-location-address__sub">${_escapeHtml(detail.walkLabel)}</p>
    </div>
  `;
  return card;
}

function _buildActivityCard(detail, spotClaims) {
  const activity = spotClaims.slice(0, 3).map((claim, index) => ({
    name: `Visitor ${index + 1}`,
    initials: `V${index + 1}`,
    meta: 'Checked in just now',
    tag: _groupSizeLabel(claim.group_size_key),
  }));
  const rows = activity.length ? activity : detail.activity;

  const card = document.createElement('section');
  card.className = 'shared-location-card shared-location-card--activity';
  card.innerHTML = rows.map((row) => /* html */`
    <div class="shared-location-activity-row">
      <span class="shared-location-activity-row__avatar">${_escapeHtml(row.initials)}</span>
      <span class="shared-location-activity-row__body">
        <span class="shared-location-activity-row__name">${_escapeHtml(row.name)}</span>
        <span class="shared-location-activity-row__meta">${_escapeHtml(row.meta)}</span>
      </span>
      <span class="shared-location-activity-row__tag">${_escapeHtml(row.tag)}</span>
    </div>
  `).join('');
  return card;
}

function _buildActionRow(spot, currentUser) {
  const row = document.createElement('div');
  row.className = 'shared-location-actions';
  row.innerHTML = /* html */`
    ${currentUser
      ? `<button type="button" class="shared-location-actions__claim" id="shared-spot-claim">Claim Spot</button>`
      : `<button type="button" class="shared-location-actions__claim" id="shared-spot-login">${iconSvg(LogIn, 18)} Sign in to Claim</button>`}
    <button type="button" class="shared-location-actions__share" id="shared-spot-copy-link">
      ${iconSvg(Share2, 18)} <span>Share Link to Group Chat</span>
    </button>
  `;

  row.querySelector('#shared-spot-claim')?.addEventListener('click', () => emit(EVENTS.UI_CLAIM_REQUESTED, { spotId: spot.id }));
  row.querySelector('#shared-spot-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  row.querySelector('#shared-spot-copy-link')?.addEventListener('click', () => _copySpotLink(spot.id));
  return row;
}

function _buildEmptyState(title, copy) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty shared-location-page__empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(MapPin, 28)}</div>
    <h2 class="page-empty__title">${_escapeHtml(title)}</h2>
    <p class="page-empty__copy">${_escapeHtml(copy)}</p>
    <button type="button" class="btn btn-primary" id="shared-spot-empty-back">Back to map</button>
  `;
  card.querySelector('#shared-spot-empty-back')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _quickFact(label, value, icon) {
  return /* html */`
    <div class="shared-location-hero__fact">
      <span class="shared-location-hero__fact-icon">${icon}</span>
      <span class="shared-location-hero__fact-body">
        <span class="shared-location-hero__fact-label">${_escapeHtml(label)}</span>
        <span class="shared-location-hero__fact-value">${_escapeHtml(value)}</span>
      </span>
    </div>
  `;
}

function _badgeMarkup(label, statusKey) {
  const modifier = statusKey === 'free' && label.toLowerCase() === 'free' ? 'free' : 'warm';
  return /* html */`<span class="shared-location-badges__pill shared-location-badges__pill--${modifier}">${_escapeHtml(label)}</span>`;
}

function _amenityMarkup(label, isActive, icon) {
  return /* html */`
    <span class="shared-location-amenities__item${isActive ? ' shared-location-amenities__item--active' : ''}">
      <span class="shared-location-amenities__icon">${icon}</span>
      <span>${_escapeHtml(label)}</span>
    </span>
  `;
}

async function _copySpotLink(spotId) {
  const url = buildSpotShareUrl(spotId);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Spot link copied!', 'success');
  } catch {
    showToast(`Share this link: ${url}`, 'success');
  }
}

function _emptyHeroUploadMarkup(spot, canUpload) {
  return /* html */`
    <div class="shared-location-hero__empty">
      <div class="shared-location-hero__empty-icon">${iconSvg(ImagePlus, 30)}</div>
      <p class="shared-location-hero__empty-title">Add the first real photo</p>
      <p class="shared-location-hero__empty-copy">${_escapeHtml(spot.name)} does not have an image yet.</p>
      <button type="button" class="shared-location-hero__upload-btn" id="shared-spot-upload-trigger">
        ${canUpload ? 'Upload Image' : 'Sign in to Upload'}
      </button>
      ${canUpload
        ? '<input id="shared-spot-image-input" class="shared-location-hero__file-input" type="file" accept="image/jpeg,image/png,image/webp">'
        : ''}
    </div>
  `;
}

async function _handleSpotImageInput(event, spotId) {
  const input = /** @type {HTMLInputElement} */(event.target);
  const file = input.files?.[0] ?? null;
  if (!file) return;

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    showToast('Choose a JPEG, PNG, or WebP image.', 'error');
    input.value = '';
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    showToast('Choose an image under 5 MB.', 'error');
    input.value = '';
    return;
  }

  showToast('Uploading spot photo...', 'info');
  const uploaded = await uploadSpotImage({ spotId, file });
  if (uploaded.error) {
    showToast(uploaded.error, 'error');
    input.value = '';
    return;
  }

  const attached = await attachSpotImage({ spotId, imagePath: uploaded.path });
  if (attached.error) {
    showToast(attached.error, 'error');
    input.value = '';
    return;
  }

  const { spots, confidence } = await fetchSpots();
  dispatch('SPOTS_LOADED', { spots, confidence });
  showToast('Spot photo added.', 'success');
}

function _hasWifi(spot) {
  return Boolean(spot.wifi_strength && spot.wifi_strength !== 'none');
}

function _noiseLabel(value) {
  const map = {
    quiet: 'Semi-Quiet',
    moderate: 'Moderate',
    loud: 'Lively',
  };
  return map[value] ?? 'Noise Unknown';
}

function _groupSizeLabel(value) {
  const map = {
    solo: 'Solo',
    small: 'Small group',
    medium: 'Group',
    large: 'Large group',
  };
  return map[value] ?? 'Studying';
}

function _initials(value) {
  return String(value)
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'ME';
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttribute(value) {
  return _escapeHtml(value);
}
