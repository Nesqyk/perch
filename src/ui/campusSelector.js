/**
 * src/ui/campusSelector.js
 *
 * Renders the primary campus selector dropdown.
 * Listens to MAP_READY and CAMPUSES_LOADED to populate and wire the UI.
 * When the user selects a campus, it dispatches CAMPUS_SELECTED to the store.
 */

import { on, EVENTS }      from '../core/events.js';
import { getState, dispatch } from '../core/store.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Initializes the campus selector. Called from main.js or header.js.
 * @param {HTMLElement} container
 */
export function initCampusSelector(container) {
  if (!container) return;
  container.className = 'campus-selector-container';

  const select = document.createElement('select');
  select.className = 'select campus-selector';
  select.id = 'campus-selector';
  
  // Default disabled option while loading
  const loadingOpt = document.createElement('option');
  loadingOpt.textContent = 'Loading campuses...';
  loadingOpt.value = '';
  loadingOpt.disabled = true;
  loadingOpt.selected = true;
  select.appendChild(loadingOpt);

  container.appendChild(select);

  // Wire events
  on(EVENTS.CAMPUSES_LOADED, () => _renderOptions(select));
  
  select.addEventListener('change', (e) => {
    const campusId = e.target.value;
    if (campusId) {
      dispatch('CAMPUS_SELECTED', { campusId });
      // Reset the building filter automatically when switching campuses
      dispatch('SET_FILTERS', { nearBuilding: null });
    }
  });

  // Render immediately if campuses are already in store (rare, but good for race conditions).
  const { campuses } = getState();
  if (campuses && campuses.length > 0) {
    _renderOptions(select);
  }
}

/**
 * Populate the dropdown options based on the datastore.
 * @param {HTMLSelectElement} select
 */
function _renderOptions(select) {
  const { campuses, selectedCampusId, viewMode } = getState();

  select.innerHTML = ''; // clear loading state

  if (!campuses.length) {
    const emptyOpt = document.createElement('option');
    emptyOpt.textContent = 'No campuses available';
    emptyOpt.disabled = true;
    select.appendChild(emptyOpt);
    return;
  }

  campuses.forEach(campus => {
    const opt = document.createElement('option');
    opt.value = campus.id;
    opt.textContent = campus.name;
    if (campus.id === selectedCampusId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  // If in 'city' mode, arguably this dropdown has less or different meaning,
  // but we keep it enabled as 'Default Campus'.
  // Sync it with 'campus' vs 'city' mode in view:
  select.disabled = (viewMode === 'city');

  on(EVENTS.VIEW_MODE_CHANGED, (e) => {
    select.disabled = (e.detail.viewMode === 'city');
  });
}
