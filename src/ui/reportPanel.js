/**
 * src/ui/reportPanel.js
 *
 * Renders the "It's Full" panel as a modal dialog (#report-modal-overlay).
 * Displays the optional reason chips and immediately shows alternative spots.
 *
 * Design principle: never a dead end.
 * The alternatives list is rendered before the user even picks a reason
 * so they can immediately move on to the next spot.
 */

import { emit, EVENTS }          from '../core/events.js';
import { getState, dispatch }     from '../core/store.js';
import { formatConfidence }       from '../utils/confidence.js';
import { deriveSpotStatus }       from '../state/spotState.js';
import {
  AlertCircle,
  Lock, Users, Package, Calendar,
  X,
  Volume2, Sun, Wifi,
} from 'lucide';
import { iconSvg } from './icons.js';

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Open the report modal for the given spot.
 * The container param is accepted for API compatibility but is not used.
 *
 * @param {HTMLElement} _container - ignored; kept for API compatibility
 * @param {string}      spotId    - the spot that was just reported full
 * @returns {void}
 */
export function renderReportPanel(_container, spotId) {
  const { spots, confidence, filters } = getState();
  const spot         = spots.find(s => s.id === spotId);
  if (!spot) return;

  const alternatives = _pickAlternatives(spotId, spots, confidence, filters);

  const overlay = document.getElementById('report-modal-overlay');
  const content = document.getElementById('report-modal-content');
  if (!overlay || !content) return;

  content.innerHTML = '';
  content.appendChild(_buildReportCard(spot, spotId, alternatives));
  overlay.hidden = false;

  // Wire close handlers.
  overlay.addEventListener('click', _onBackdropClick);
  document.addEventListener('keydown', _onKeyDown);
}

/**
 * Close the report modal.
 *
 * @returns {void}
 */
export function closeReportModal() {
  const overlay = document.getElementById('report-modal-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.removeEventListener('click', _onBackdropClick);
  document.removeEventListener('keydown', _onKeyDown);
}

function _onBackdropClick(e) {
  if (e.target.id === 'report-modal-overlay') closeReportModal();
}

function _onKeyDown(e) {
  if (e.key === 'Escape') closeReportModal();
}

// ─── Card builder ─────────────────────────────────────────────────────────────

/**
 * @param {object}   spot
 * @param {string}   spotId
 * @param {object[]} alternatives
 * @returns {HTMLElement}
 */
function _buildReportCard(spot, spotId, alternatives) {
  const card     = document.createElement('div');
  card.className = 'report-card';

  // ── Header: title row + close button ──────────────────────────────────────
  const header     = document.createElement('div');
  header.className = 'report-card__header';

  const titleCol     = document.createElement('div');
  titleCol.className = 'report-card__title-col';

  const title     = document.createElement('h2');
  title.className = 'report-card__title';
  title.textContent = `${spot.name} is Full`;
  titleCol.appendChild(title);

  // "Likely Full" badge — coral/pink, matching the screenshot pill
  const badge     = document.createElement('span');
  badge.className = 'report-card__badge';
  badge.innerHTML = `${iconSvg(AlertCircle, 12)} Likely Full`;
  titleCol.appendChild(badge);

  header.appendChild(titleCol);

  const closeBtn     = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'report-card__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = iconSvg(X, 20);
  closeBtn.addEventListener('click', closeReportModal);
  header.appendChild(closeBtn);

  card.appendChild(header);

  // ── Divider ───────────────────────────────────────────────────────────────
  const hr1 = document.createElement('hr');
  hr1.className = 'report-card__divider';
  hr1.setAttribute('aria-hidden', 'true');
  card.appendChild(hr1);

  // ── Optional reason chips ─────────────────────────────────────────────────
  const reasonSection  = document.createElement('div');
  reasonSection.className = 'report-card__reason-section';

  const reasonLabel    = document.createElement('p');
  reasonLabel.className = 'report-card__reason-label';
  reasonLabel.textContent = 'Why? (optional — helps future perchers)';
  reasonSection.appendChild(reasonLabel);

  const reasons = [
    { key: 'locked',      icon: Lock,     label: 'Locked' },
    { key: 'overcrowded', icon: Users,    label: 'Too many people' },
    { key: 'occupied',    icon: Package,  label: 'Class using it' },
    { key: 'event',       icon: Calendar, label: 'Event / reserved' },
  ];

  const chipsCol     = document.createElement('div');
  chipsCol.className = 'report-card__chips-col';

  const skipBtn     = document.createElement('button');
  skipBtn.type      = 'button';
  skipBtn.className = 'btn btn-outline report-card__skip';
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('click', () => {
    emit(EVENTS.UI_REPORT_REQUESTED, { spotId, reason: null, reasonProvided: true });
    chipsCol.querySelectorAll('.report-card__chip').forEach(c => { c.disabled = true; });
    skipBtn.disabled = true;
  });

  reasons.forEach(({ key, icon, label }) => {
    const btn     = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'report-card__chip';
    btn.innerHTML = /* html */`
      <span class="report-card__chip-icon">${iconSvg(icon, 18)}</span>
      <span class="report-card__chip-label">${label}</span>
    `;
    btn.addEventListener('click', () => {
      emit(EVENTS.UI_REPORT_REQUESTED, { spotId, reason: key, reasonProvided: true });
      chipsCol.querySelectorAll('.report-card__chip').forEach(c => { c.disabled = true; });
      skipBtn.disabled = true;
      btn.classList.add('report-card__chip--active');
    });
    chipsCol.appendChild(btn);
  });

  reasonSection.appendChild(chipsCol);
  reasonSection.appendChild(skipBtn);
  card.appendChild(reasonSection);

  // ── Alternatives ───────────────────────────────────────────────────────────
  if (alternatives.length > 0) {
    const hr2 = document.createElement('hr');
    hr2.className = 'report-card__divider';
    hr2.setAttribute('aria-hidden', 'true');
    card.appendChild(hr2);

    const altHeading     = document.createElement('p');
    altHeading.className = 'report-card__alt-heading';
    altHeading.textContent = 'Try these instead:';
    card.appendChild(altHeading);

    const altList     = document.createElement('div');
    altList.className = 'report-card__alt-list';

    alternatives.forEach(alt => {
      const row = _buildAlternativeCard(alt);
      row.addEventListener('click', closeReportModal, { once: true });
      altList.appendChild(row);
    });

    card.appendChild(altList);
  }

  return card;
}

// ─── Alternative card ─────────────────────────────────────────────────────────

/**
 * @param {object} spot
 * @returns {HTMLElement}
 */
function _buildAlternativeCard(spot) {
  const { confidence } = getState();
  const conf           = confidence[spot.id];
  const display        = formatConfidence(conf?.score);

  const card     = document.createElement('div');
  card.className = 'report-alt-card';
  card.style.cursor = 'pointer';

  // Top row: name + badge
  const topRow     = document.createElement('div');
  topRow.className = 'report-alt-card__top';

  const name     = document.createElement('span');
  name.className = 'report-alt-card__name';
  name.textContent = spot.name;
  topRow.appendChild(name);

  const badge     = document.createElement('span');
  badge.className = `report-alt-card__badge report-alt-card__badge--${display.cssClass}`;
  badge.textContent = display.label;
  topRow.appendChild(badge);

  card.appendChild(topRow);

  // Bottom row: capacity + feature icons
  const bottomRow     = document.createElement('div');
  bottomRow.className = 'report-alt-card__bottom';

  const capItem     = document.createElement('span');
  capItem.className = 'report-alt-card__cap';
  capItem.innerHTML = `${iconSvg(Users, 14)} ${_capacityLabel(spot.rough_capacity)}`;
  bottomRow.appendChild(capItem);

  // Feature icons (always show for visual richness — real data would come from spot metadata)
  const features     = document.createElement('span');
  features.className = 'report-alt-card__features';
  features.innerHTML = `
    ${iconSvg(Volume2, 16)}
    ${iconSvg(Sun, 16)}
    ${iconSvg(Wifi, 16)}
  `;
  bottomRow.appendChild(features);

  card.appendChild(bottomRow);

  card.addEventListener('click', () => {
    dispatch('SELECT_SPOT', { spotId: spot.id });
  });

  return card;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick up to 3 alternative spots, excluding the reported one.
 * Prefers spots with the highest confidence score.
 *
 * @param {string}   excludeId
 * @param {object[]} spots
 * @param {object}   confidence
 * @param {object}   _filters
 * @returns {object[]}
 */
function _pickAlternatives(excludeId, spots, confidence, _filters) {
  return spots
    .filter(s => s.id !== excludeId && deriveSpotStatus(s.id) !== 'full')
    .sort((a, b) => {
      const sa = confidence[a.id]?.score ?? 0.5;
      const sb = confidence[b.id]?.score ?? 0.5;
      return sb - sa;
    })
    .slice(0, 3);
}

/**
 * @param {string} rough
 * @returns {string}
 */
function _capacityLabel(rough) {
  const map = { small: '~8 ppl', medium: '~20 ppl', large: '~40 ppl' };
  return map[rough] ?? '';
}
