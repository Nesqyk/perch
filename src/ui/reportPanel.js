/**
 * src/ui/reportPanel.js
 *
 * Renders the "It's Full" panel shown after a correction is filed.
 * Displays the optional reason chips and immediately shows alternative spots.
 *
 * Design principle: never a dead end.
 * The alternatives list is rendered before the user even picks a reason
 * so they can immediately move on to the next spot.
 */

import { on as _on, emit, EVENTS }    from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import { formatConfidence }    from '../utils/confidence.js';
import { deriveSpotStatus }    from '../state/spotState.js';

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the report panel into a container element.
 *
 * @param {HTMLElement} container
 * @param {string}      spotId   - the spot that was just reported full
 */
export function renderReportPanel(container, spotId) {
  const { spots, confidence, filters } = getState();
  const spot         = spots.find(s => s.id === spotId);
  if (!spot) return;

  const alternatives = _pickAlternatives(spotId, spots, confidence, filters);

  container.innerHTML = '';
  container.appendChild(_buildReportCard(spot, spotId, alternatives));
}

function _buildReportCard(spot, spotId, alternatives) {
  const card       = document.createElement('div');
  card.className   = 'report-card';

  // ── Full notice ──
  const notice     = document.createElement('div');
  notice.className = 'report-notice';
  notice.innerHTML = `<span class="report-icon">&#128308;</span>
                      <p><strong>${spot.name}</strong> is full.</p>`;
  card.appendChild(notice);

  // ── Optional reason chips ──
  const reasonSection  = document.createElement('div');
  reasonSection.className = 'reason-section';
  const reasonLabel    = document.createElement('p');
  reasonLabel.className = 'reason-label';
  reasonLabel.textContent = 'Why? (optional — helps future students)';
  reasonSection.appendChild(reasonLabel);

  const reasons = [
    { key: 'locked',      label: '🔒 Locked'    },
    { key: 'occupied',    label: '👥 Class using it' },
    { key: 'overcrowded', label: '📦 Too many people' },
    { key: 'event',       label: '📅 Event / reserved' },
    { key: null,          label: '⏭ Skip'       },
  ];

  const chipsRow       = document.createElement('div');
  chipsRow.className   = 'chip-row chip-row-column';

  reasons.forEach(({ key, label }) => {
    const btn        = document.createElement('button');
    btn.type         = 'button';
    btn.className    = 'chip chip-reason';
    btn.textContent  = label;
    btn.addEventListener('click', () => {
      // Fire the reason — feature/reportFull.js is listening.
      emit(EVENTS.UI_REPORT_REQUESTED, { spotId, reason: key, reasonProvided: true });
      // Dim reason section to show it was received.
      chipsRow.querySelectorAll('.chip-reason').forEach(c => c.disabled = true);
      btn.classList.add('chip-active');
    });
    chipsRow.appendChild(btn);
  });

  reasonSection.appendChild(chipsRow);
  card.appendChild(reasonSection);

  // ── Alternatives ──
  if (alternatives.length > 0) {
    const altHeading     = document.createElement('p');
    altHeading.className = 'alt-heading';
    altHeading.textContent = 'Try these instead:';
    card.appendChild(altHeading);

    alternatives.forEach(alt => {
      card.appendChild(_buildAlternativeRow(alt));
    });
  }

  return card;
}

function _buildAlternativeRow(spot) {
  const row        = document.createElement('div');
  row.className    = 'alt-spot-row';

  const { confidence } = getState();
  const conf       = confidence[spot.id];
  const display    = formatConfidence(conf?.score);

  row.innerHTML    = `
    <span class="alt-dot ${display.cssClass}">&#9679;</span>
    <div class="alt-info">
      <span class="alt-name">${spot.name}</span>
      <span class="alt-detail">${_capacityLabel(spot.rough_capacity)}</span>
    </div>
  `;

  row.style.cursor = 'pointer';
  row.addEventListener('click', () => {
    dispatch('SELECT_SPOT', { spotId: spot.id });
  });

  return row;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick up to 3 alternative spots, excluding the reported one.
 * Prefers spots with the highest confidence score.
 *
 * @param {string}   excludeId
 * @param {object[]} spots
 * @param {object}   confidence
 * @param {object}   filters    - current filter state to narrow alternatives
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

function _capacityLabel(rough) {
  const map = { small: '~8 ppl', medium: '~20 ppl', large: '~40 ppl' };
  return map[rough] ?? '';
}
