// Navigation and per-device preferences, shared by the shell and the views.
import { lsGet, lsSet } from './util.js';

export const INBOX_ID = 'list-inbox';

export const prefs = Object.assign({ weekStart: 0 }, lsGet('planner.prefs', {}));
export function setPref(k, v) { prefs[k] = v; lsSet('planner.prefs', prefs); }

export function getTheme() { return lsGet('planner.theme', 'system'); }
export function setTheme(t) {
  lsSet('planner.theme', t);
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

let router = null;
export function setRouter(fn) { router = fn; }
export function go(path) {
  if (location.hash !== '#' + path) location.hash = path;
  else if (router) router();
}

export function setTitle(t) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = t || '';
  document.title = t ? `${t} · Planner` : 'Planner';
}
