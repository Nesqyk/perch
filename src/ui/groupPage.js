/**
 * src/ui/groupPage.js
 *
 * Route-level squad dashboard for #/group.
 *
 * This module renders the persisted group dashboard and emits UI events for
 * all writes. It does not call Supabase directly and it does not mutate store
 * state outside dispatch-driven navigation helpers.
 */

import {
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CirclePlus,
  Coffee,
  Copy,
  Image,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Share2,
  ShieldCheck,
  Tag,
  TerminalSquare,
  UserRound,
  Users,
  Volume2,
  Wifi,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import {
  buildMeetupIcs,
  deriveSpotOccupancy,
  getAvailabilityLabel,
  getPlugsLabel,
  getSquadRoleLabel,
  sortSquadMembers,
} from '../state/groupDashboardState.js';
import { buildGroupJoinUrl, leaveGroup } from '../features/groups.js';
import { iconSvg } from './icons.js';
import { closeModal, openModal, openModalWithElement } from './modal.js';
import { showToast } from './toast.js';

const VIEW_ID = 'view-group';
const FOCUS_OPTIONS = [
  'Optimizing SQL',
  'Enhancing UX Design',
  'Creating Wireframes',
  'Implementing User Testing',
  'Developing Prototypes',
  'Conducting Surveys',
  'Analyzing Data',
];

/**
 * Initialise the route-level squad page.
 *
 * @returns {void}
 */
export function initGroupPage() {
  const rerender = () => _renderGroupPage();

  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);
  on(EVENTS.GROUP_UPDATED, rerender);
  on(EVENTS.GROUP_DASHBOARD_UPDATED, rerender);
  on(EVENTS.GROUP_MEMBERS_UPDATED, rerender);
  on(EVENTS.GROUP_MEETUP_UPDATED, rerender);
  on(EVENTS.GROUP_PERK_UPDATED, rerender);
  on(EVENTS.CLAIM_UPDATED, rerender);
  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);

  _renderGroupPage();
}

function _renderGroupPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser, group } = getState();
  view.innerHTML = '';

  if (!currentUser) {
    view.appendChild(_buildSignedOutState());
    return;
  }

  if (!group) {
    view.appendChild(_buildJoinCreateState());
    return;
  }

  view.appendChild(_buildSquadDashboard());
}

function _buildSignedOutState() {
  const shell = _pageShell('Squad Space', 'Sign in to manage your study crew, share invite links, and keep the group in sync.');
  const empty = document.createElement('section');
  empty.className = 'page-card page-card--empty';
  empty.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Users, 28)}</div>
    <h2 class="page-empty__title">Your squad tools live here.</h2>
    <p class="page-empty__copy">Map browsing stays open for everyone, but squad coordination needs an account.</p>
    <button type="button" class="btn btn-primary" id="group-page-signin">Sign in</button>
  `;
  empty.querySelector('#group-page-signin')?.addEventListener('click', () => {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
  });
  shell.appendChild(empty);
  return shell;
}

function _buildJoinCreateState() {
  const shell = document.createElement('section');
  shell.className = 'squad-empty';
  shell.innerHTML = /* html */`
    <header class="squad-empty__header">
      <div class="squad-empty__symbol" aria-hidden="true">${iconSvg(Users, 66)}</div>
      <div>
        <h1>Squad Space</h1>
        <p>Create a group for your table hunt or join one with a four-character code.</p>
      </div>
    </header>
  `;

  const grid = document.createElement('div');
  grid.className = 'squad-empty__cards';

  const createCard = document.createElement('section');
  createCard.className = 'squad-empty-card';
  createCard.innerHTML = /* html */`
    <div class="squad-empty-card__intro">
      <div class="squad-empty-card__icon" aria-hidden="true">${iconSvg(CirclePlus, 34)}</div>
      <div>
        <p class="squad-empty-card__eyebrow">Create</p>
        <h2>Start a new study crew.</h2>
        <p>Set the crew name once, share the code, and coordinate live without leaving the map.</p>
      </div>
    </div>
    <label class="squad-empty-field">
      <span>Crew name</span>
      <span class="squad-empty-field__control">
        <input id="group-page-create-name" maxlength="40" placeholder="e.g. BSIT 2-A">
        ${iconSvg(Users, 22)}
      </span>
    </label>
    <button type="button" class="squad-empty-button squad-empty-button--primary" id="group-page-create-btn">
      <span>Create squad</span>
      ${iconSvg(ArrowRight, 22)}
    </button>
    <div class="squad-empty-note">${iconSvg(ShieldCheck, 22)} <span>You'll get a unique invite code to share with your crew.</span></div>
  `;
  createCard.querySelector('#group-page-create-btn')?.addEventListener('click', () => {
    const input = createCard.querySelector('#group-page-create-name');
    const name = input?.value.trim();
    if (!name) {
      input?.focus();
      return;
    }
    emit(EVENTS.UI_GROUP_CREATE, { name, displayName: name, context: 'campus' });
  });

  const joinCard = document.createElement('section');
  joinCard.className = 'squad-empty-card';
  joinCard.innerHTML = /* html */`
    <div class="squad-empty-card__intro">
      <div class="squad-empty-card__icon" aria-hidden="true">${iconSvg(LogIn, 34)}</div>
      <div>
        <p class="squad-empty-card__eyebrow">Join</p>
        <h2>Enter an invite code.</h2>
        <p>Jump straight into your squad dashboard and see who is already settled.</p>
      </div>
    </div>
    <label class="squad-empty-field">
      <span>Invite code</span>
      <span class="squad-empty-field__control">
        <input id="group-page-join-code" maxlength="4" placeholder="AB12" autocomplete="off">
      </span>
    </label>
    <label class="squad-empty-field">
      <span>Display name</span>
      <span class="squad-empty-field__control">
        <input id="group-page-join-name" maxlength="30" placeholder="How your group sees you">
        ${iconSvg(UserRound, 22)}
      </span>
    </label>
    <button type="button" class="squad-empty-button squad-empty-button--outline" id="group-page-join-btn">
      <span>Join squad</span>
      ${iconSvg(ArrowRight, 22)}
    </button>
    <div class="squad-empty-note">${iconSvg(Users, 22)} <span>Make sure the code is correct and valid to join your crew.</span></div>
  `;
  joinCard.querySelector('#group-page-join-btn')?.addEventListener('click', () => {
    const codeInput = joinCard.querySelector('#group-page-join-code');
    const nameInput = joinCard.querySelector('#group-page-join-name');
    const code = codeInput?.value.trim().toUpperCase();
    const displayName = nameInput?.value.trim();
    if (!code) {
      codeInput?.focus();
      return;
    }
    if (!displayName) {
      nameInput?.focus();
      return;
    }
    emit(EVENTS.UI_GROUP_JOIN, { code, displayName });
  });

  grid.appendChild(createCard);
  grid.appendChild(joinCard);
  shell.appendChild(grid);
  return shell;
}

function _buildSquadDashboard() {
  const state = getState();
  const { group, groupMembers, groupMember, currentUser } = state;
  const canManage = _canManageSquad(state);
  const members = sortSquadMembers(groupMembers);

  const shell = document.createElement('div');
  shell.className = 'squad-page';
  shell.style.setProperty('--squad-accent', group.color ?? 'var(--color-brand)');

  const main = document.createElement('main');
  main.className = 'squad-page__main';
  main.appendChild(_buildSquadHeader(state, canManage));
  main.appendChild(_buildRosterCard({ members, groupMember, currentUser }));
  shell.appendChild(main);

  const aside = document.createElement('aside');
  aside.className = 'squad-page__aside';
  aside.appendChild(_buildVenueCard(state, canManage));
  aside.appendChild(_buildMeetupCard(state, canManage));
  aside.appendChild(_buildPerkCard(state, canManage));
  shell.appendChild(aside);

  return shell;
}

function _buildSquadHeader(state, canManage) {
  const { group, groupMembers } = state;
  const card = document.createElement('section');
  card.className = 'squad-header-card';
  const progressCurrent = group.progress_current ?? groupMembers.length;
  const progressTarget = group.progress_target;
  const startedAt = _formatTime(group.started_at ?? group.created_at);
  card.innerHTML = /* html */`
    <div class="squad-cover-stack">
      ${group.cover_image_url
        ? `<img class="squad-cover-stack__image" src="${_escapeAttr(group.cover_image_url)}" alt="">`
        : `<div class="squad-avatar-stack" aria-hidden="true">
            ${_avatarMarkup(groupMembers[0], 'squad-avatar-stack__face squad-avatar-stack__face--one')}
            ${_avatarMarkup(groupMembers[1], 'squad-avatar-stack__face squad-avatar-stack__face--two')}
            ${_avatarMarkup(groupMembers[2], 'squad-avatar-stack__face squad-avatar-stack__face--three')}
          </div>`}
      ${canManage ? `
        <label class="squad-image-upload" aria-label="Upload squad image">
          ${iconSvg(Camera, 16)}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-cover-upload>
        </label>
      ` : ''}
    </div>
    <div class="squad-header-card__copy">
      <h1>${_escapeHtml(group.name)}</h1>
      <p><span aria-hidden="true">○</span> ${_escapeHtml(group.purpose || 'Study crew')} • Since ${startedAt}</p>
      ${progressTarget ? `<span class="squad-progress-pill">${progressCurrent}/${progressTarget}</span>` : ''}
    </div>
    <div class="squad-header-card__actions">
      <button type="button" class="squad-icon-action squad-icon-action--danger" id="squad-leave" aria-label="Leave squad">${iconSvg(LogOut, 24)}</button>
      <button type="button" class="squad-action-button squad-action-button--soft" id="squad-share">${iconSvg(Share2, 17)} Share Link</button>
      <button type="button" class="squad-action-button" id="squad-change">${iconSvg(ShieldCheck, 17)} Change Spot</button>
    </div>
  `;

  card.querySelector('[data-cover-upload]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    emit(EVENTS.UI_GROUP_COVER_UPLOAD, { groupId: group.id, file });
    event.target.value = '';
  });
  card.querySelector('#squad-share')?.addEventListener('click', () => _copyShareLink(group.code));
  card.querySelector('#squad-change')?.addEventListener('click', () => {
    if (!canManage) {
      showToast('Only the mayor can change the current venue.', 'info');
      return;
    }
    navigateTo('/');
    showToast('Pick a spot from the squad panel when ready.', 'info');
  });
  card.querySelector('#squad-leave')?.addEventListener('click', () => {
    openModal({
      title: 'Leave squad?',
      body: `You will leave "${group.name}" and lose access to this dashboard.`,
      confirm: { label: 'Leave squad', onConfirm: () => leaveGroup() },
      cancel: { label: 'Stay' },
    });
  });

  return card;
}

function _buildRosterCard({ members, groupMember, currentUser }) {
  const card = document.createElement('section');
  card.className = 'squad-roster-card';
  card.innerHTML = /* html */`
    <div class="squad-roster-table">
      <div class="squad-roster-row squad-roster-row--head">
        <span>Member</span>
        <span>Role</span>
        <span>Focus Mode</span>
        <span>Status</span>
      </div>
    </div>
    <div class="squad-roster-footer">
      <strong>${members.length} ${members.length === 1 ? 'member' : 'members'}</strong>
    </div>
  `;

  const table = card.querySelector('.squad-roster-table');
  members.forEach((member) => {
    const isMe = member.id === groupMember?.id || member.user_id === currentUser?.id;
    table?.appendChild(_buildRosterRow(member, isMe));
  });
  if (!members.length) {
    table?.appendChild(_emptyInline('Members are loading from the server.'));
  }
  return card;
}

function _buildRosterRow(member, isMe) {
  const row = document.createElement('div');
  row.className = 'squad-roster-row';
  row.innerHTML = /* html */`
    <div class="squad-member-cell">
      <span class="squad-member-cell__avatar-wrap">
        ${_avatarMarkup(member, 'squad-member-cell__avatar')}
        ${isMe ? `
          <label class="squad-member-avatar-upload" aria-label="Upload your avatar">
            ${iconSvg(Camera, 13)}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-upload>
          </label>
        ` : ''}
      </span>
      <div>
        <strong>${_escapeHtml(member.display_name ?? 'Member')}</strong>
        <span>${_escapeHtml(_memberHandle(member.display_name))}</span>
      </div>
    </div>
    <span class="squad-pill squad-pill--role">${getSquadRoleLabel(member.role)}</span>
    <div class="squad-focus-cell">
      ${isMe ? _focusSelectMarkup(member.focus_mode) : `${iconSvg(TerminalSquare, 15)} <span>${_escapeHtml(member.focus_mode ?? 'Finding a table')}</span>`}
    </div>
    <div class="squad-status-cell">
      ${isMe ? _statusSelectMarkup(member.availability_status) : `<span class="squad-pill squad-pill--${member.availability_status === 'busy' ? 'busy' : 'available'}">${getAvailabilityLabel(member.availability_status)}</span>`}
    </div>
  `;

  row.querySelector('[data-avatar-upload]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    emit(EVENTS.UI_GROUP_AVATAR_UPLOAD, {
      groupId: member.group_id,
      memberId: member.id,
      file,
    });
    event.target.value = '';
  });
  row.querySelector('[data-focus-select]')?.addEventListener('change', (event) => {
    emit(EVENTS.UI_GROUP_PRESENCE_UPDATE, {
      memberId: member.id,
      focusMode: event.target.value,
    });
  });
  row.querySelector('[data-status-select]')?.addEventListener('change', (event) => {
    emit(EVENTS.UI_GROUP_PRESENCE_UPDATE, {
      memberId: member.id,
      availabilityStatus: event.target.value,
    });
  });

  return row;
}

function _buildVenueCard(state, canManage) {
  const { group, groupCurrentSpot, claims, spots } = state;
  const occupancy = deriveSpotOccupancy(groupCurrentSpot, claims);
  const card = document.createElement('section');
  card.className = 'squad-side-card squad-venue-card';
  card.innerHTML = /* html */`
    <div class="squad-side-card__eyebrow">Current Venue <span>${iconSvg(Coffee, 19)}</span></div>
    <div class="squad-venue-image">
      ${groupCurrentSpot
        ? `<div class="squad-venue-placeholder squad-venue-placeholder--active">${iconSvg(Image, 24)} <span>${_escapeHtml(groupCurrentSpot.name)}</span></div>`
        : `<div class="squad-venue-placeholder">${canManage ? 'Choose a current venue for your squad.' : 'No current venue yet.'}</div>`}
      ${groupCurrentSpot ? `
        <div class="squad-venue-badges">
          <span>${iconSvg(Wifi, 13)} ${_escapeHtml(groupCurrentSpot.wifi_strength ?? 'WiFi')}</span>
          <span>${iconSvg(Volume2, 13)} ${_escapeHtml(groupCurrentSpot.noise_baseline ?? 'Noise')}</span>
        </div>
      ` : ''}
    </div>
    <div class="squad-venue-metric">
      <span>Occupancy</span>
      <div class="squad-meter"><span style="inline-size:${occupancy.percent}%"></span></div>
      <strong>${occupancy.percent}%</strong>
    </div>
    <div class="squad-venue-metric">
      <span>Plugs Available</span>
      <strong>${_escapeHtml(getPlugsLabel(groupCurrentSpot))}</strong>
    </div>
    ${canManage ? _venueSelectMarkup(groupCurrentSpot, spots) : ''}
  `;

  card.querySelector('[data-venue-select]')?.addEventListener('change', (event) => {
    emit(EVENTS.UI_GROUP_CURRENT_SPOT_UPDATE, {
      groupId: group.id,
      spotId: event.target.value || null,
    });
  });
  return card;
}

function _buildMeetupCard(state, canManage) {
  const { group, groupMeetup, groupCurrentSpot } = state;
  const card = document.createElement('section');
  card.className = `squad-meetup-card${groupMeetup ? '' : ' squad-meetup-card--empty'}`;
  card.innerHTML = /* html */`
    <div class="squad-meetup-card__content">
      <span>Next Meetup</span>
      ${groupMeetup ? `
        <h2>${_escapeHtml(groupMeetup.title)}</h2>
        <p>${iconSvg(Calendar, 15)} ${_escapeHtml(_formatMeetupTime(groupMeetup.starts_at))}</p>
        <button type="button" id="squad-calendar">Add to Calendar</button>
        ${canManage ? `<button type="button" class="squad-link-button" id="squad-edit-meetup">${iconSvg(Pencil, 14)} Edit meetup</button>` : ''}
      ` : `
        <h2>No meetup planned</h2>
        <p>${canManage ? 'Create the next squad session when your plan is ready.' : 'The mayor has not planned the next squad session yet.'}</p>
        ${canManage ? `<button type="button" id="squad-edit-meetup">${iconSvg(Plus, 16)} Create meetup</button>` : ''}
      `}
    </div>
  `;

  card.querySelector('#squad-calendar')?.addEventListener('click', () => {
    _downloadMeetupIcs({
      title: groupMeetup.title,
      starts_at: groupMeetup.starts_at,
      location_label: groupMeetup?.location_label ?? groupCurrentSpot?.name ?? group.name,
    });
  });
  card.querySelector('#squad-edit-meetup')?.addEventListener('click', () => {
    _openMeetupEditor({ group, meetup: groupMeetup, groupCurrentSpot });
  });
  return card;
}

function _buildPerkCard(state, canManage) {
  const { group, groupPerk } = state;
  const card = document.createElement('section');
  card.className = `squad-perk-card${groupPerk ? '' : ' squad-perk-card--empty'}`;
  card.innerHTML = /* html */`
    <div class="squad-perk-card__head">
      <div>${iconSvg(Tag, 22)} <span>Squad Perks</span></div>
      ${groupPerk ? `<button type="button" id="squad-redeem" aria-label="Mark perk redeemed">${iconSvg(Check, 14)}</button>` : ''}
    </div>
    ${groupPerk ? `
      <h3>${_escapeHtml(groupPerk.title)}</h3>
      <button type="button" class="squad-code-copy" id="squad-copy-perk">
        <span>${_escapeHtml(groupPerk.code)}</span>
        ${iconSvg(Copy, 15)}
      </button>
      ${canManage ? `<button type="button" class="squad-link-button" id="squad-edit-perk">${iconSvg(Pencil, 14)} Edit perk</button>` : ''}
    ` : `
      <h3>No squad perk yet</h3>
      <p>${canManage ? 'Add a real code or discount when one is available.' : 'No active squad perk has been added.'}</p>
      ${canManage ? `<button type="button" class="squad-code-copy" id="squad-edit-perk">${iconSvg(Plus, 15)} Create perk</button>` : ''}
    `}
  `;

  card.querySelector('#squad-copy-perk')?.addEventListener('click', async () => {
    await _copyText(groupPerk.code, 'Perk code copied.');
  });
  card.querySelector('#squad-redeem')?.addEventListener('click', () => {
    emit(EVENTS.UI_GROUP_PERK_REDEEM, { perkId: groupPerk.id });
  });
  card.querySelector('#squad-edit-perk')?.addEventListener('click', () => {
    _openPerkEditor({ group, perk: groupPerk });
  });
  return card;
}

function _pageShell(title, subtitle) {
  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <h1 class="page-shell__title">${_escapeHtml(title)}</h1>
      <p class="page-shell__subtitle">${_escapeHtml(subtitle)}</p>
    </div>
  `;
  return shell;
}

function _focusSelectMarkup(value) {
  return /* html */`
    <select class="squad-inline-select" data-focus-select aria-label="Focus mode">
      ${FOCUS_OPTIONS.map((option) => `<option value="${_escapeHtml(option)}" ${option === value ? 'selected' : ''}>${_escapeHtml(option)}</option>`).join('')}
    </select>
  `;
}

function _statusSelectMarkup(value) {
  return /* html */`
    <select class="squad-status-select squad-pill squad-pill--${value === 'busy' ? 'busy' : 'available'}" data-status-select aria-label="Availability status">
      <option value="available" ${value !== 'busy' ? 'selected' : ''}>Available</option>
      <option value="busy" ${value === 'busy' ? 'selected' : ''}>Busy</option>
    </select>
  `;
}

function _venueSelectMarkup(currentSpot, spots) {
  const options = spots.map((spot) => {
    const selected = spot.id === currentSpot?.id ? 'selected' : '';
    return `<option value="${spot.id}" ${selected}>${_escapeHtml(spot.name)}</option>`;
  }).join('');

  return /* html */`
    <label class="squad-venue-select">
      <span>Change Spot</span>
      <select data-venue-select>
        <option value="">No venue</option>
        ${options}
      </select>
    </label>
  `;
}

function _avatarMarkup(member, className) {
  const avatarUrl = member?.avatar_image_url || member?.avatar_url;
  if (avatarUrl) {
    return `<img class="${className}" src="${_escapeAttr(avatarUrl)}" alt="">`;
  }
  return `<span class="${className}">${_initials(member?.display_name)}</span>`;
}

function _openMeetupEditor({ group, meetup, groupCurrentSpot }) {
  const form = document.createElement('form');
  form.className = 'squad-editor-form';
  form.innerHTML = /* html */`
    <label class="page-field">
      <span class="page-field__label">Title</span>
      <input class="input" name="title" maxlength="80" value="${_escapeAttr(meetup?.title ?? '')}" placeholder="Final review at the library" required>
    </label>
    <label class="page-field">
      <span class="page-field__label">Starts at</span>
      <input class="input" name="startsAt" type="datetime-local" value="${_escapeAttr(_datetimeLocalValue(meetup?.starts_at))}" required>
    </label>
    <label class="page-field">
      <span class="page-field__label">Location label</span>
      <input class="input" name="locationLabel" maxlength="80" value="${_escapeAttr(meetup?.location_label ?? groupCurrentSpot?.name ?? '')}" placeholder="Current venue or meeting place">
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
      <button type="submit" class="btn btn-primary">${meetup ? 'Save meetup' : 'Create meetup'}</button>
    </div>
  `;

  form.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new window.FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const startsAtValue = String(data.get('startsAt') ?? '');
    if (!title || !startsAtValue) return;

    emit(EVENTS.UI_GROUP_MEETUP_UPDATE, {
      groupId: group.id,
      meetupId: meetup?.id ?? null,
      title,
      startsAt: new Date(startsAtValue).toISOString(),
      locationLabel: String(data.get('locationLabel') ?? '').trim() || null,
    });
    closeModal();
  });

  openModalWithElement(form, { title: meetup ? 'Edit Meetup' : 'Create Meetup' });
}

function _openPerkEditor({ group, perk }) {
  const form = document.createElement('form');
  form.className = 'squad-editor-form';
  form.innerHTML = /* html */`
    <label class="page-field">
      <span class="page-field__label">Perk title</span>
      <input class="input" name="title" maxlength="80" value="${_escapeAttr(perk?.title ?? '')}" placeholder="10% off drinks" required>
    </label>
    <label class="page-field">
      <span class="page-field__label">Code</span>
      <input class="input" name="code" maxlength="40" value="${_escapeAttr(perk?.code ?? '')}" placeholder="SQUAD-10" required>
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
      <button type="submit" class="btn btn-primary">${perk ? 'Save perk' : 'Create perk'}</button>
    </div>
  `;

  form.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new window.FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const code = String(data.get('code') ?? '').trim();
    if (!title || !code) return;

    emit(EVENTS.UI_GROUP_PERK_UPDATE, {
      groupId: group.id,
      perkId: perk?.id ?? null,
      title,
      code,
      isRedeemed: false,
    });
    closeModal();
  });

  openModalWithElement(form, { title: perk ? 'Edit Perk' : 'Create Perk' });
}

function _memberHandle(name) {
  const base = String(name ?? 'member').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `@${base || 'member'}`;
}

function _canManageSquad({ group, groupMember, currentUser }) {
  return groupMember?.role === 'mayor' || group?.created_by === currentUser?.id;
}

async function _copyShareLink(code) {
  await _copyText(buildGroupJoinUrl(code), 'Share link copied.');
}

async function _copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, 'success');
  } catch {
    showToast(text, 'info');
  }
}

function _downloadMeetupIcs(meetup) {
  const blob = new window.Blob([buildMeetupIcs(meetup)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'perch-squad-meetup.ics';
  link.click();
  URL.revokeObjectURL(url);
}

function _emptyInline(text) {
  const empty = document.createElement('div');
  empty.className = 'page-empty-inline';
  empty.textContent = text;
  return empty;
}

function _formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '09:00 AM';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _formatMeetupTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tomorrow, 9:00 AM';
  const day = _isTomorrow(date) ? 'Tomorrow' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function _isTomorrow(date) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toDateString() === tomorrow.toDateString();
}

function _datetimeLocalValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function _initials(name) {
  return String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttr(value) {
  return _escapeHtml(value).replace(/'/g, '&#039;');
}
