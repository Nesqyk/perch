/**
 * src/ui/groupPage.js
 *
 * Route-level group destination for #/group.
 *
 * This page consolidates group membership, invite tools, and live pin activity
 * into one place so the filter panel and spot card only need lightweight
 * summaries or entry points.
 */

import { Users, Share2, LogOut, MapPinned, Footprints, Sparkles, ChevronRight } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { dispatch, getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { buildGroupJoinUrl, leaveGroup } from '../features/groups.js';
import { GROUP_PIN_EVENTS } from '../features/groupPins.js';
import { iconSvg } from './icons.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';

const VIEW_ID = 'view-group';

/**
 * Initialise the route-level group page.
 *
 * @returns {void}
 */
export function initGroupPage() {
  const rerender = () => _renderGroupPage();

  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);
  on(EVENTS.GROUP_MEMBERS_UPDATED, rerender);
  on(EVENTS.GROUP_PINS_UPDATED, rerender);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED, rerender);
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

  view.appendChild(_buildGroupDashboard());
}

function _buildSignedOutState() {
  const shell = _pageShell('Squad Space', 'Sign in to manage your study crew, share invite links, and track who is heading where.');
  const empty = document.createElement('section');
  empty.className = 'page-card page-card--empty';
  empty.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Users, 28)}</div>
    <h2 class="page-empty__title">Your group tools live here.</h2>
    <p class="page-empty__copy">Perch keeps map browsing open for everyone, but squad coordination needs an account.</p>
    <button type="button" class="btn btn-primary" id="group-page-signin">Sign in with Google</button>
  `;
  empty.querySelector('#group-page-signin')?.addEventListener('click', () => {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
  });
  shell.appendChild(empty);
  return shell;
}

function _buildJoinCreateState() {
  const shell = _pageShell('Squad Space', 'Create a group for your table hunt or join one with a four-character code.');
  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two';

  const createCard = document.createElement('section');
  createCard.className = 'page-card';
  createCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Create</div>
    <h2 class="page-card__title">Start a new study crew.</h2>
    <p class="page-card__copy">Set the crew name once, share the code, and coordinate live without leaving the map.</p>
    <label class="page-field">
      <span class="page-field__label">Crew name</span>
      <input class="input" id="group-page-create-name" maxlength="40" placeholder="e.g. Library Sprinters">
    </label>
    <button type="button" class="btn btn-primary" id="group-page-create-btn">Create group</button>
  `;
  createCard.querySelector('#group-page-create-btn')?.addEventListener('click', () => {
    const input = createCard.querySelector('#group-page-create-name');
    const name = input?.value.trim();
    if (!name) {
      input?.focus();
      return;
    }
    emit(EVENTS.UI_GROUP_CREATE, { name, displayName: name, color: '#3b82f6', context: 'campus' });
  });

  const joinCard = document.createElement('section');
  joinCard.className = 'page-card';
  joinCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Join</div>
    <h2 class="page-card__title">Enter an invite code.</h2>
    <p class="page-card__copy">Jump straight into your group and see who has already pinned a spot.</p>
    <label class="page-field">
      <span class="page-field__label">Invite code</span>
      <input class="input" id="group-page-join-code" maxlength="4" placeholder="AB12">
    </label>
    <label class="page-field">
      <span class="page-field__label">Display name</span>
      <input class="input" id="group-page-join-name" maxlength="30" placeholder="How your group sees you">
    </label>
    <button type="button" class="btn btn-outline" id="group-page-join-btn">Join group</button>
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

function _buildGroupDashboard() {
  const { group, groupMembers, groupPins, groupPinJoins, currentUser } = getState();
  const shell = _pageShell(group.name, 'Live crew status, invite tools, and route-to-spot actions in one place.');
  const pins = Object.values(groupPins).filter((pin) => pin.pin_type === 'live' && !pin.ended_at);
  const transitCount = Object.values(groupPinJoins)
    .flat()
    .filter((join) => join.status === 'heading').length;

  const hero = document.createElement('section');
  hero.className = 'page-card page-card--hero';
  hero.innerHTML = /* html */`
    <div class="group-page__hero-head">
      <div>
        <div class="page-card__eyebrow">Active crew</div>
        <h2 class="page-card__title">${_escapeHtml(group.name)}</h2>
        <p class="page-card__copy">Invite classmates, check live movement, and jump back to the map with context.</p>
      </div>
      <div class="group-page__hero-actions">
        <button type="button" class="btn btn-primary" id="group-page-copy-link">${iconSvg(Share2, 16)} Share invite</button>
        <button type="button" class="btn btn-ghost" id="group-page-leave">${iconSvg(LogOut, 16)} Leave</button>
      </div>
    </div>
    <div class="group-page__stats">
      <div class="group-stat">
        <span class="group-stat__value">${groupMembers.length || 1}</span>
        <span class="group-stat__label">Members</span>
      </div>
      <div class="group-stat">
        <span class="group-stat__value">${pins.length}</span>
        <span class="group-stat__label">Live pins</span>
      </div>
      <div class="group-stat">
        <span class="group-stat__value">${transitCount}</span>
        <span class="group-stat__label">Heading</span>
      </div>
      <div class="group-stat">
        <span class="group-stat__value">${_escapeHtml(group.code)}</span>
        <span class="group-stat__label">Invite code</span>
      </div>
    </div>
  `;

  hero.querySelector('#group-page-copy-link')?.addEventListener('click', async () => {
    const url = buildGroupJoinUrl(group.code);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied! Share it with your crew.', 'success');
    } catch {
      showToast(`Share this code: ${group.code}`, 'success');
    }
  });

  hero.querySelector('#group-page-leave')?.addEventListener('click', () => {
    openModal({
      title: 'Leave group?',
      body: `You will be removed from "${group.name}". Your pins stay visible until they expire.`,
      confirm: { label: 'Leave group', onConfirm: () => leaveGroup() },
      cancel: { label: 'Stay' },
    });
  });

  shell.appendChild(hero);

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two';

  const membersCard = document.createElement('section');
  membersCard.className = 'page-card';
  membersCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Members</div>
    <h3 class="page-card__title page-card__title--sm">Who is in the crew right now</h3>
    <div class="group-member-list"></div>
  `;
  const membersList = membersCard.querySelector('.group-member-list');
  if (groupMembers.length) {
    groupMembers.forEach((member) => {
      const row = document.createElement('div');
      row.className = 'group-member-row';
      const isMe = member.user_id === currentUser?.id;
      const userPins = pins.filter((pin) => pin.user_id === member.user_id);
      row.innerHTML = /* html */`
        <span class="group-member-row__avatar" style="background:${group.color ?? 'var(--color-brand)'}">${_initials(member.display_name)}</span>
        <div class="group-member-row__body">
          <span class="group-member-row__name">${_escapeHtml(member.display_name ?? 'Member')}${isMe ? ' <em>(you)</em>' : ''}</span>
          <span class="group-member-row__meta">${userPins.length ? `${userPins.length} live pin${userPins.length > 1 ? 's' : ''}` : 'Browsing the map'}</span>
        </div>
        <span class="group-member-row__score">${member.scout_points ?? 0}pt</span>
      `;
      membersList?.appendChild(row);
    });
  } else {
    membersList?.appendChild(_emptyBlock('Members are loading from the server.'));
  }

  const activityCard = document.createElement('section');
  activityCard.className = 'page-card';
  activityCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Live activity</div>
    <h3 class="page-card__title page-card__title--sm">Current destinations</h3>
    <div class="group-activity-list"></div>
  `;
  const activityList = activityCard.querySelector('.group-activity-list');

  if (pins.length) {
    pins
      .sort((a, b) => new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime())
      .forEach((pin) => {
        const row = document.createElement('div');
        row.className = 'group-activity-row';
        const joiners = (groupPinJoins[pin.id] ?? []).filter((join) => join.status === 'heading');
        const isMine = pin.user_id === currentUser?.id;
        row.innerHTML = /* html */`
          <div class="group-activity-row__summary">
            <span class="group-activity-row__badge">${iconSvg(MapPinned, 14)}</span>
            <div class="group-activity-row__body">
              <span class="group-activity-row__title">${_escapeHtml(pin.display_name ?? 'Member')} pinned ${_escapeHtml(pin.spot_name ?? 'a study spot')}</span>
              <span class="group-activity-row__meta">${joiners.length} heading there</span>
            </div>
          </div>
          <div class="group-activity-row__actions">
            <button type="button" class="btn btn-ghost group-activity-row__btn" data-pin-spot="${pin.spot_id ?? ''}">
              ${iconSvg(ChevronRight, 14)} Open on map
            </button>
            ${isMine ? '' : `<button type="button" class="btn btn-outline group-activity-row__btn" data-join-pin="${pin.id}">${iconSvg(Footprints, 14)} I'm heading</button>`}
          </div>
        `;

        row.querySelector('[data-pin-spot]')?.addEventListener('click', () => {
          if (pin.spot_id) {
            navigateTo('/');
            dispatch('SELECT_SPOT', { spotId: pin.spot_id });
          }
        });

        row.querySelector('[data-join-pin]')?.addEventListener('click', () => {
          emit(GROUP_PIN_EVENTS.JOIN_REQUESTED, { pinId: pin.id, status: 'heading' });
        });

        activityList?.appendChild(row);
      });
  } else {
    activityList?.appendChild(_emptyBlock('No live pins yet. Ask someone to pin a spot from the map.'));
  }

  grid.appendChild(membersCard);
  grid.appendChild(activityCard);
  shell.appendChild(grid);

  const footerCard = document.createElement('section');
  footerCard.className = 'page-card page-card--subtle';
  footerCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Back to discovery</div>
    <h3 class="page-card__title page-card__title--sm">Need another place to sit?</h3>
    <p class="page-card__copy">Jump back to the map, run the filters again, and use this page as the coordination layer.</p>
    <button type="button" class="btn btn-primary" id="group-page-map">${iconSvg(Sparkles, 16)} Open the map</button>
  `;
  footerCard.querySelector('#group-page-map')?.addEventListener('click', () => navigateTo('/'));
  shell.appendChild(footerCard);

  return shell;
}

function _pageShell(title, subtitle) {
  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">${_escapeHtml(title)}</h1>
      <p class="page-shell__subtitle">${_escapeHtml(subtitle)}</p>
    </div>
  `;
  return shell;
}

function _emptyBlock(text) {
  const empty = document.createElement('div');
  empty.className = 'page-empty-inline';
  empty.textContent = text;
  return empty;
}

function _initials(name) {
  return String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
