/**
 * src/ui/buildingPanel.js
 *
 * Building-first campus modal.
 *
 * Clicking a building marker opens a room directory with search, status
 * filters, pending peer-review cards, and an inline add-room flow.
 * Clicking an empty campus area opens the add-building flow.
 *
 * Self-confirm guard: users cannot confirm a building or room submission
 * that they created in the current session. The sets below track IDs
 * created this session so the "Confirm" UI is hidden for the submitter.
 * (A future DB column `submitted_by_user_id` would make this persistent.)
 */

import { on, emit, EVENTS } from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import {
  createBuilding,
  confirmBuilding,
  confirmSpotSubmission,
  fetchBuildings,
  fetchPendingSpotSubmissions,
  submitSpot,
} from '../api/campuses.js';
import { fetchSpots } from '../api/spots.js';
import { getVisibleRooms, summarizeBuildingInventory } from '../state/buildingState.js';
import { buildBuildingShareUrl } from '../core/router.js';
import { iconSvg } from './icons.js';
import { showToast } from './toast.js';

import { Link } from 'lucide';

const OVERLAY_ID = 'submit-modal-overlay';
const CONTENT_ID = 'submit-modal-content';

/**
 * Building IDs created by this browser session.
 * Used to hide the "Confirm Building" button for the submitter.
 *
 * @type {Set<string>}
 */
const _myCreatedBuildingIds = new Set();

/**
 * Spot-submission IDs created by this browser session.
 * Used to hide per-row "Confirm" buttons for the submitter.
 *
 * @type {Set<string>}
 */
const _myCreatedSubmissionIds = new Set();

/**
 * Wire the building-first campus listeners.
 *
 * @returns {void}
 */
export function initBuildingPanel() {
  on(EVENTS.MAP_BUILDING_CLICKED, _onBuildingClicked);
  on(EVENTS.UI_SUBMIT_SPOT_REQUESTED, _onCampusMapClicked);
}

async function _onBuildingClicked(e) {
  const buildingId = e.detail.buildingId;
  if (!buildingId || getState().viewMode !== 'campus') return;

  await openBuildingPanel(buildingId);
}

async function _onCampusMapClicked(e) {
  const { viewMode, currentUser } = getState();
  if (viewMode !== 'campus') return;

  if (!currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  _renderIntoModal(_buildAddBuildingForm(e.detail.lat, e.detail.lng));
  _openModal();
}

/**
 * Open the room directory for a building.
 *
 * @param {string} buildingId
 * @returns {Promise<void>}
 */
export async function openBuildingPanel(buildingId) {
  const { buildings } = getState();
  const building = buildings.find((entry) => entry.id === buildingId);
  if (!building) return;

  const pendingSubmissions = await fetchPendingSpotSubmissions({
    campusId: building.campus_id,
    buildingName: building.name,
  });

  _renderIntoModal(_buildBuildingPanel(building, pendingSubmissions));
  _openModal();
}

function _renderIntoModal(node) {
  const content = document.getElementById(CONTENT_ID);
  if (!content) return;
  content.innerHTML = '';
  content.appendChild(node);
}

function _openModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  overlay.hidden = false;
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
}

function _closeModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  overlay.hidden = true;
  overlay.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleKeyDown);
  emit(EVENTS.UI_PANEL_CLOSED, {});
}

function _handleOverlayClick(e) {
  if (e.target.id === OVERLAY_ID) _closeModal();
}

function _handleKeyDown(e) {
  if (e.key === 'Escape') _closeModal();
}

function _buildAddBuildingForm(lat, lng) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel campus-building-panel';

  wrap.innerHTML = /* html */`
    <div class="submit-spot-panel__header">
      <div class="submit-spot-panel__pin-badge">🏢</div>
      <div>
        <h2 class="submit-spot-panel__title">Add a Building</h2>
        <p class="submit-spot-panel__coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
      </div>
    </div>
    <p class="submit-spot-panel__desc">Drop a building marker first. Once it exists, people can map rooms inside it and peer-confirm what is real.</p>
  `;

  const form = document.createElement('div');
  form.className = 'submit-spot-panel__form';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'filter-label';
  nameLabel.htmlFor = 'campus-building-name';
  nameLabel.textContent = 'Building name';
  form.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.id = 'campus-building-name';
  nameInput.className = 'input';
  nameInput.maxLength = 80;
  nameInput.placeholder = 'e.g. IT Building';
  form.appendChild(nameInput);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add Building';
  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    const { selectedCampusId } = getState();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    const { data, error } = await createBuilding({
      campusId: selectedCampusId,
      name,
      lat,
      lng,
    });

    if (error || !data) {
      showToast(error ?? 'Could not create building.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Building';
      return;
    }

    await confirmBuilding(data.id);
    _myCreatedBuildingIds.add(data.id);
    await _refreshBuildings(selectedCampusId);
    showToast(`"${name}" added. One more confirmation will verify it.`, 'success');
    _closeModal();
    await openBuildingPanel(data.id);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost btn-full';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', _closeModal);

  buttonRow.appendChild(submitBtn);
  buttonRow.appendChild(cancelBtn);

  wrap.appendChild(form);
  wrap.appendChild(buttonRow);
  return wrap;
}

function _buildBuildingPanel(building, pendingSubmissions) {
  const wrap = document.createElement('div');
  wrap.className = 'campus-building-panel';

  const { spots, claims, confidence } = getState();
  const canonicalRooms = getVisibleRooms(
    spots.filter((spot) => spot.campus_id === building.campus_id),
    claims,
    confidence,
    { status: 'all', search: '' },
  ).filter((room) => String(room.building_id ?? '').toLowerCase() === String(building.id).toLowerCase()
    || String(room.building ?? '').trim().toLowerCase() === String(building.name).trim().toLowerCase());

  const inventory = summarizeBuildingInventory(canonicalRooms, pendingSubmissions);

  wrap.innerHTML = /* html */`
    <div class="campus-building-panel__hero">
      <div>
        <p class="campus-building-panel__eyebrow">${building.verification_status === 'pending' ? 'Community review' : 'Campus building'}</p>
        <h2 class="campus-building-panel__title">${_escapeHtml(building.name)}</h2>
        <p class="campus-building-panel__meta">${inventory.rooms} mapped room${inventory.rooms === 1 ? '' : 's'} • ${inventory.pending} pending</p>
      </div>
      <div class="campus-building-panel__hero-actions">
        <button type="button" class="btn btn-icon campus-building-panel__copy-link" aria-label="Copy building link">${iconSvg(Link, 16)}</button>
        <button type="button" class="spot-card__close" aria-label="Close building panel">×</button>
      </div>
    </div>
  `;

  wrap.querySelector('.campus-building-panel__copy-link')?.addEventListener('click', async () => {
    const { selectedCampusId } = getState();
    const shareUrl = buildBuildingShareUrl(selectedCampusId, building.id);
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Building link copied!', 'success');
    } catch {
      showToast(`Share this link: ${shareUrl}`, 'success');
    }
  });

  wrap.querySelector('.spot-card__close')?.addEventListener('click', _closeModal);

  if (building.verification_status === 'pending' && !_myCreatedBuildingIds.has(building.id)) {
    const verifyRow = document.createElement('div');
    verifyRow.className = 'campus-building-panel__verify';
    verifyRow.innerHTML = /* html */`
      <span>This building needs one more peer confirmation.</span>
      <button type="button" class="btn btn-outline">Confirm Building</button>
    `;
    verifyRow.querySelector('button')?.addEventListener('click', async () => {
      const { error } = await confirmBuilding(building.id);
      if (error) {
        showToast('Could not confirm this building yet.', 'error');
        return;
      }
      await _refreshBuildings(building.campus_id);
      showToast('Building confirmation recorded.', 'success');
      _closeModal();
      await openBuildingPanel(building.id);
    });
    wrap.appendChild(verifyRow);
  }

  const controls = document.createElement('div');
  controls.className = 'campus-building-panel__controls';
  controls.innerHTML = /* html */`
    <input class="input" id="building-room-search" type="text" placeholder="Search rooms, floors, labels" />
    <select class="select" id="building-room-status">
      <option value="all">All statuses</option>
      <option value="free">Free</option>
      <option value="claimed">Claimed</option>
      <option value="maybe">Maybe</option>
      <option value="full">Full</option>
    </select>
  `;
  wrap.appendChild(controls);

  const roomsContainer = document.createElement('div');
  roomsContainer.className = 'campus-building-panel__rooms';
  wrap.appendChild(roomsContainer);

  const pendingContainer = document.createElement('div');
  pendingContainer.className = 'campus-building-panel__pending';
  wrap.appendChild(pendingContainer);

  const addRoom = _buildAddRoomComposer(building);
  wrap.appendChild(addRoom);

  const renderRooms = () => {
    const search = /** @type {HTMLInputElement} */(controls.querySelector('#building-room-search'))?.value ?? '';
    const status = /** @type {HTMLSelectElement} */(controls.querySelector('#building-room-status'))?.value ?? 'all';
    const visibleRooms = getVisibleRooms(canonicalRooms, claims, confidence, { search, status });

    if (!visibleRooms.length) {
      roomsContainer.innerHTML = '<div class="campus-building-panel__empty">No canonical rooms match this filter yet.</div>';
    } else {
      roomsContainer.innerHTML = visibleRooms.map((room) => /* html */`
        <button type="button" class="campus-room-card" data-room-id="${room.id}">
          <div>
            <strong>${_escapeHtml(room.name)}</strong>
            <div class="campus-room-card__meta">${_escapeHtml(room.floor || 'Floor not set')}</div>
          </div>
          <span class="campus-room-card__status campus-room-card__status--${room.derivedStatus}">${room.derivedStatus}</span>
        </button>
      `).join('');

      roomsContainer.querySelectorAll('[data-room-id]').forEach((button) => {
        button.addEventListener('click', () => {
          dispatch('SELECT_SPOT', { spotId: button.dataset.roomId, navigate: true });
          _closeModal();
        });
      });
    }

    if (!pendingSubmissions.length) {
      pendingContainer.innerHTML = '';
      return;
    }

    pendingContainer.innerHTML = /* html */`
      <div class="campus-building-panel__pending-header">Pending room confirmations</div>
      ${pendingSubmissions.map((submission) => /* html */`
        <div class="campus-room-card campus-room-card--pending">
          <div>
            <strong>${_escapeHtml(submission.spot_name)}</strong>
            <div class="campus-room-card__meta">${_escapeHtml(submission.floor || 'Floor not set')} • ${submission.confirmation_count ?? 0}/2 confirmations</div>
          </div>
          ${_myCreatedSubmissionIds.has(submission.id)
            ? '<span class="campus-room-card__own-badge">Awaiting peer confirmation</span>'
            : `<button type="button" class="btn btn-outline" data-confirm-submission="${submission.id}">Confirm</button>`
          }
        </div>
      `).join('')}
    `;

    pendingContainer.querySelectorAll('[data-confirm-submission]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { data, error } = await confirmSpotSubmission(button.dataset.confirmSubmission);
        if (error) {
          showToast('Could not confirm this room yet.', 'error');
          return;
        }

        await _refreshCampusCatalogue(building.campus_id);
        showToast(
          data?.status === 'approved'
            ? 'Room verified and added to the campus map.'
            : 'Room confirmation recorded.',
          'success',
        );
        _closeModal();
        await openBuildingPanel(building.id);
      });
    });
  };

  controls.querySelector('#building-room-search')?.addEventListener('input', renderRooms);
  controls.querySelector('#building-room-status')?.addEventListener('change', renderRooms);
  renderRooms();

  return wrap;
}

function _buildAddRoomComposer(building) {
  const wrap = document.createElement('div');
  wrap.className = 'campus-building-panel__composer';
  wrap.innerHTML = /* html */`
    <h3 class="campus-building-panel__section-title">Add a missing room</h3>
    <div class="submit-spot-panel__form">
      <input id="composer-room-name" class="input" type="text" placeholder="Room 404" maxlength="60" />
      <input id="composer-room-floor" class="input" type="text" placeholder="4F (optional)" maxlength="12" />
      <textarea id="composer-room-notes" class="input submit-spot-panel__textarea" rows="3" placeholder="Quiet after 3pm, strong WiFi"></textarea>
      <button type="button" class="btn btn-primary btn-full" id="composer-add-room">Add Room for Peer Review</button>
    </div>
  `;

  wrap.querySelector('#composer-add-room')?.addEventListener('click', async () => {
    const roomName = /** @type {HTMLInputElement} */(wrap.querySelector('#composer-room-name'))?.value.trim() ?? '';
    const floor = /** @type {HTMLInputElement} */(wrap.querySelector('#composer-room-floor'))?.value.trim() ?? '';
    const notes = /** @type {HTMLTextAreaElement} */(wrap.querySelector('#composer-room-notes'))?.value.trim() ?? '';

    if (!roomName) {
      wrap.querySelector('#composer-room-name')?.focus();
      return;
    }

    const { nickname, currentUser } = getState();
    const discovererDisplayName =
      nickname ||
      currentUser?.user_metadata?.full_name ||
      currentUser?.email?.split('@')[0] ||
      'Perch member';

    const { data, error } = await submitSpot({
      campusId: building.campus_id,
      lat: Number(building.lat),
      lng: Number(building.lng),
      buildingName: building.name,
      floor,
      spotName: roomName,
      description: notes,
      discovererDisplayName,
    });

    if (error || !data?.id) {
      showToast(error ?? 'Could not queue this room.', 'error');
      return;
    }

    await confirmSpotSubmission(data.id);
    _myCreatedSubmissionIds.add(data.id);
    await _refreshCampusCatalogue(building.campus_id);
    showToast(`"${roomName}" added. One more confirmation will make it live.`, 'success');
    _closeModal();
    await openBuildingPanel(building.id);
  });

  return wrap;
}

async function _refreshBuildings(campusId) {
  const buildings = await fetchBuildings(campusId);
  dispatch('BUILDINGS_LOADED', { buildings });
}

async function _refreshCampusCatalogue(campusId) {
  await _refreshBuildings(campusId);
  const { spots, confidence } = await fetchSpots();
  dispatch('SPOTS_LOADED', { spots, confidence });
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
