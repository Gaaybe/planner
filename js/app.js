import * as store from './store.js';
import * as sync from './sync.js';
import { h, clear, today } from './util.js';
import { icon } from './icons.js';
import { closePopover } from './components.js';
import { INBOX_ID, go, setRouter } from './nav.js';
import { flushAllEditors } from './editor.js';
import tasksView from './views/tasks.js';
import notesView from './views/notes.js';
import dailyView from './views/daily.js';
import calendarView from './views/calendar.js';
import { boardsView, boardView } from './views/whiteboard.js';
import { tagsView, tagView } from './views/tags.js';
import settingsView from './views/settings.js';

// ---------- Routing ----------
function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').map(decodeURIComponent).filter(Boolean);
  return parts;
}

let current = null;   // { name, view }
const appEl = document.getElementById('app');
const viewEl = document.getElementById('view');
const sidebarEl = document.getElementById('sidebar');
function route() {
  closePopover();
  flushAllEditors();
  const p = parse();
  const [section] = p;
  let name, factory, params;
  switch (section) {
    case 'tasks': name = 'tasks'; factory = tasksView; params = { listId: p[1] || INBOX_ID }; break;
    case 'notes': name = 'notes'; factory = notesView; params = { scope: p[1] || 'all', noteId: p[2] || null }; break;
    case 'daily': name = 'daily'; factory = dailyView; params = { date: p[1] || today() }; break;
    case 'boards': name = 'boards'; factory = boardsView; params = {}; break;
    case 'board': name = 'board'; factory = boardView; params = { id: p[1], focus: p[2] || null }; break;
    case 'tags': name = 'tags'; factory = tagsView; params = {}; break;
    case 'tag': name = 'tag'; factory = tagView; params = { id: p[1] }; break;
    case 'settings': name = 'settings'; factory = settingsView; params = {}; break;
    case 'calendar': name = 'calendar'; factory = calendarView; params = { mode: p[1] || 'week', date: p[2] || today() }; break;
    default: location.replace('#/calendar/week/' + today()); return;
  }
  // Same view with new params: let it update in place if it can.
  if (current && current.name === name && current.view.update && current.view.update(params) !== false) {
    renderSidebar();
    return;
  }
  if (current && current.view.destroy) current.view.destroy();
  clear(viewEl);
  current = { name, view: factory(viewEl, params) || {} };
  appEl.classList.remove('drawer-open');
  document.getElementById('scrim').hidden = true;
  renderSidebar();
}

// ---------- Sidebar ----------
function navItem(label, ic, href, opts = {}) {
  const active = opts.active != null ? opts.active : ('#' + href === location.hash);
  return h('a', { class: 'nav-item' + (active ? ' active' : ''), href: '#' + href, onclick: () => closeDrawer() },
    opts.swatch ? h('span', { class: 'swatch', style: { background: opts.swatch } }) : icon(ic, 18),
    h('span', { class: 'label' }, label),
    opts.count ? h('span', { class: 'count' }, opts.count) : null);
}

function renderSidebar() {
  const p = parse();
  const s = p[0];
  clear(sidebarEl);
  const lists = store.all('list').sort((a, b) => (a.data.order || 0) - (b.data.order || 0) || a.data.createdAt - b.data.createdAt);
  const groups = store.all('group').sort((a, b) => (a.data.order || 0) - (b.data.order || 0) || a.data.createdAt - b.data.createdAt);
  const boards = store.all('board').sort((a, b) => b.updated_at - a.updated_at);
  const openCount = (listId) => store.all('task', (d) => !d.done && d.listId === listId).length;

  const addList = () => {
    const name = prompt('Name the new list');
    if (!name || !name.trim()) return;
    const rec = store.create('list', { name: name.trim(), order: Date.now() });
    go('/tasks/' + rec.id);
  };
  const addGroup = () => {
    const name = prompt('Name the new group');
    if (!name || !name.trim()) return;
    const rec = store.create('group', { name: name.trim(), color: ['#2B4ACB', '#15803D', '#C2410C', '#9333EA', '#0E7490', '#BE185D'][groups.length % 6], order: Date.now() });
    go('/notes/' + rec.id);
  };
  const addBoard = () => {
    const rec = store.create('board', { name: 'Untitled whiteboard' });
    go('/board/' + rec.id);
  };

  sidebarEl.append(
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-name' }, 'Planner')),
    navItem('Calendar', 'calendar', '/calendar/week/' + today(), { active: s === 'calendar' }),
    navItem('Daily notes', 'daily', '/daily/' + today(), { active: s === 'daily' }),

    h('div', { class: 'nav-section' },
      h('div', { class: 'nav-head' }, h('span', null, 'To-do lists'), h('button', { class: 'icon-btn', title: 'New list', 'aria-label': 'New list', onclick: addList }, icon('plus', 16))),
      navItem('All tasks', 'tasks', '/tasks/all', { active: s === 'tasks' && p[1] === 'all', count: store.all('task', (d) => !d.done).length || '' }),
      lists.map((l) => navItem(l.data.name, 'check', '/tasks/' + l.id, { active: s === 'tasks' && (p[1] || INBOX_ID) === l.id, count: openCount(l.id) || '' }))),

    h('div', { class: 'nav-section' },
      h('div', { class: 'nav-head' }, h('span', null, 'Notes'), h('button', { class: 'icon-btn', title: 'New group', 'aria-label': 'New group', onclick: addGroup }, icon('plus', 16))),
      navItem('All notes', 'note', '/notes/all', { active: s === 'notes' && (p[1] || 'all') === 'all' }),
      navItem('Ungrouped', 'note', '/notes/none', { active: s === 'notes' && p[1] === 'none' }),
      groups.map((g) => navItem(g.data.name, 'folder', '/notes/' + g.id, { active: s === 'notes' && p[1] === g.id, swatch: g.data.color, count: store.all('note', (d) => d.groupId === g.id).length || '' }))),

    h('div', { class: 'nav-section' },
      h('div', { class: 'nav-head' }, h('span', null, 'Whiteboards'), h('button', { class: 'icon-btn', title: 'New whiteboard', 'aria-label': 'New whiteboard', onclick: addBoard }, icon('plus', 16))),
      navItem('All whiteboards', 'board', '/boards', { active: s === 'boards' }),
      boards.slice(0, 8).map((b) => navItem(b.data.name || 'Untitled whiteboard', 'board', '/board/' + b.id, { active: s === 'board' && p[1] === b.id }))),

    h('div', { class: 'nav-section' },
      navItem('Tags', 'tag', '/tags', { active: s === 'tags' || s === 'tag' })),

    h('div', { class: 'nav-spacer' }),
    syncPill(),
    navItem('Settings', 'settings', '/settings', { active: s === 'settings' })
  );
}

let pillEl = null;
function syncPill() {
  pillEl = h('button', { class: 'sync-pill', onclick: () => { closeDrawer(); go('/settings'); } }, h('span', { class: 'dot' }), h('span', { class: 'label' }));
  paintPill(sync.getState());
  return pillEl;
}
function paintPill(st) {
  if (!pillEl) return;
  pillEl.dataset.status = st.status;
  pillEl.querySelector('.label').textContent = st.message;
}

// ---------- Drawer (tablet / phone) ----------
function closeDrawer() { appEl.classList.remove('drawer-open'); document.getElementById('scrim').hidden = true; }
document.getElementById('menu-btn').appendChild(icon('menu', 20));
document.getElementById('menu-btn').addEventListener('click', () => { appEl.classList.add('drawer-open'); document.getElementById('scrim').hidden = false; });
document.getElementById('scrim').addEventListener('click', closeDrawer);

// ---------- Boot ----------
async function boot() {
  try {
    await store.openStore();
  } catch (e) {
    viewEl.appendChild(h('div', { class: 'empty' }, h('strong', null, 'Storage is unavailable'), String(e.message || e)));
    return;
  }
  if (!store.get(INBOX_ID) && !store.allRaw().some((r) => r.id === INBOX_ID)) {
    store.create('list', { name: 'Inbox', order: 0 }, INBOX_ID);
  }
  let sidebarQueued = false;
  store.onChange((types, source) => {
    if (current && current.view.refresh) current.view.refresh(types, source);
    if (!sidebarQueued && ['list', 'group', 'board', 'task', 'note'].some((t) => types.has(t))) {
      sidebarQueued = true;
      requestAnimationFrame(() => { sidebarQueued = false; if (!sidebarEl.contains(document.activeElement)) renderSidebar(); });
    }
  });
  setRouter(route);
  window.addEventListener('hashchange', route);
  route();
  sync.onStatus(paintPill);
  sync.init();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
