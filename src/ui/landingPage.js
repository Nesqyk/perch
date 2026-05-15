/**
 * src/ui/landingPage.js
 *
 * Public marketing landing page for Perch. The page is route-driven so it
 * stays inside the existing shell while remaining available before sign-in.
 */

import { Play, Sparkles, Users } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-landing';

let _hasBoundEvents = false;

/**
 * Mount the landing page route view.
 *
 * @returns {void}
 */
export function initLandingPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  if (!_hasBoundEvents) {
    view.addEventListener('click', _onLandingClick);
    _hasBoundEvents = true;
  }

  on(EVENTS.ROUTE_CHANGED, _render);
  on(EVENTS.AUTH_STATE_CHANGED, _render);
  _render();
}

function _render() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser } = getState();
  view.innerHTML = /* html */`
    <div class="landing-page">
      <nav class="landing-nav" aria-label="Perch landing navigation">
        <div class="landing-nav__pill">
          <button class="landing-nav__brand" data-landing-action="map" type="button" aria-label="Open Perch map">
            <img src="/logo.svg" alt="" class="landing-nav__logo" width="42" height="42" />
            <span class="landing-nav__wordmark">Perch</span>
            <span class="landing-nav__badge">Beta</span>
          </button>

          <div class="landing-nav__links">
            <a href="#landing-demo">Feature</a>
            <a href="#landing-cta">Pricing</a>
            <a href="#landing-footer">FAQ</a>
            <button type="button" data-landing-action="map">Install</button>
          </div>
        </div>

        <button class="landing-nav__avatar" data-landing-action="profile" type="button" aria-label="${currentUser ? 'Open profile' : 'Sign in'}">
          ${_avatarMarkup(currentUser)}
        </button>
      </nav>

      <header class="landing-hero">
        <p class="landing-hero__eyebrow">${iconSvg(Sparkles, 16)} Live campus presence</p>
        <h1>Finding your friends shouldn't be a scavenger hunt.</h1>
        <p class="landing-hero__copy">
          Gatekeep the best spots, bypass the group chat spam, and get your crew on the grid in seconds. No downloads required.
        </p>
        <div class="landing-hero__actions">
          <button class="landing-btn landing-btn--primary" data-landing-action="map" type="button">Start Perching</button>
          <a class="landing-btn landing-btn--ghost" href="#landing-demo">How it works</a>
        </div>
      </header>

      <section id="landing-demo" class="landing-demo" aria-label="Perch app preview">
        <div class="landing-demo__frame">
          <div class="landing-demo__map">
            <img src="/github_banner.png" alt="Perch live map preview with study spot pins" />
            <span class="landing-pin landing-pin--free landing-pin--one"></span>
            <span class="landing-pin landing-pin--free landing-pin--two"></span>
            <span class="landing-pin landing-pin--maybe landing-pin--three"></span>
            <span class="landing-pin landing-pin--full landing-pin--four"></span>
            <button class="landing-demo__play" data-landing-action="map" type="button" aria-label="Open Perch map">
              ${iconSvg(Play, 42)}
            </button>
          </div>

          <aside class="landing-demo__panel" aria-label="Room availability preview">
            <div class="landing-demo__panel-head">
              <div>
                <strong>Room 301</strong>
                <span>3rd Flr, Main</span>
              </div>
              <span aria-hidden="true">&times;</span>
            </div>
            <div class="landing-status-row">
              <span>Likely Free</span>
              <span>80%</span>
            </div>
            <img src="/notification-sanctuary.jpg" alt="Quiet study room preview" class="landing-demo__photo" />
            <div class="landing-demo__people">
              <span>${iconSvg(Users, 16)} 20</span>
              <span>Reported Free: <strong>14 min ago</strong></span>
            </div>
            <div class="landing-demo__choices">
              <button type="button">I'm going here</button>
              <button type="button">It's full</button>
            </div>
            <div class="landing-squad">
              <strong>Gwapo Squad</strong>
              <span>4 Members</span>
              <div><b>TY</b><span>Room 301</span><em>2</em></div>
              <div><b>MK</b><span>En Route</span><em>0</em></div>
            </div>
          </aside>
        </div>
        <div class="landing-demo__emoji landing-demo__emoji--palm" aria-hidden="true">🌴</div>
        <div class="landing-demo__emoji landing-demo__emoji--car" aria-hidden="true">🚗</div>
      </section>

      <section id="landing-cta" class="landing-cta">
        <h2>Your spot is waiting.</h2>
        <p>Join 15,000+ students reclaiming their study time and finding peace of mind.</p>
        <div class="landing-cta__actions">
          <button class="landing-btn landing-btn--light" data-landing-action="map" type="button">Open Perch Now</button>
          <a class="landing-btn landing-btn--soft" href="#landing-demo">Learn More</a>
        </div>
      </section>

      <footer id="landing-footer" class="landing-footer">
        <div class="landing-footer__brand">
          <div class="landing-footer__lockup">
            <img src="/logo.svg" alt="" width="44" height="44" />
            <span>Perch</span>
          </div>
          <p>Building the digital commons for modern students, one study spot at a time.</p>
          <div class="landing-footer__socials" aria-label="Perch social links">
            <span>◌</span>
            <span>@</span>
          </div>
        </div>

        <div class="landing-footer__links">
          <div>
            <strong>Product</strong>
            <button type="button" data-landing-action="map">Live Map</button>
            <button type="button" data-landing-action="map">Squads</button>
            <a href="#landing-demo">Contributions</a>
            <button type="button" data-landing-action="map">Campus List</button>
          </div>
          <div>
            <strong>Company</strong>
            <a href="#landing-footer">About</a>
            <a href="#landing-footer">Privacy</a>
            <a href="#landing-footer">Terms</a>
            <a href="#landing-footer">Support</a>
          </div>
        </div>
      </footer>
    </div>
  `;
}

function _onLandingClick(e) {
  const trigger = e.target.closest('[data-landing-action]');
  if (!trigger) return;

  const action = trigger.dataset.landingAction;
  if (action === 'map') {
    navigateTo('/');
    return;
  }

  if (action === 'profile') {
    if (getState().currentUser) {
      navigateTo('/profile');
    } else {
      emit(EVENTS.UI_LOGIN_REQUESTED);
    }
  }
}

function _avatarMarkup(user) {
  const image = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  if (image) {
    return `<img src="${_escapeHtml(image)}" alt="" />`;
  }

  const initials = _initials(user);
  if (initials) {
    return `<span class="landing-nav__initials">${_escapeHtml(initials)}</span>`;
  }

  return '<img src="/logo.svg" alt="" />';
}

function _initials(user) {
  if (!user) return '';
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || '';
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
