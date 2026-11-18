// Task details side panel. Opens from any task anywhere in the app and stays
// beside the content (on narrow screens it slides over it).
import * as store from './store.js';
import { h, clear, debounce, today, addDays, fmtDate, relDay } from './util.js';
import { icon } from './icons.js';
import { tagEditor } from './components.js';

let panel = null, scrim = null, appEl = null;
let currentId = null;

export function currentTask() { return currentId; }

export function initTaskPanel(app) {
  appEl = app;
  panel = h('aside', { class: 'task-panel', 'aria-label': 'Task details', hidden: true });
  scrim = h('div', { class: 'panel-scrim', hidden: true, onclick: () => closeTask() });
  app.append(scrim, panel);
  // A redraw in the middle of a click (e.g. notes saving as they lose focus)
  // would swallow that click, so redraws wait until the pointer is released.
  let pressing = false, pending = false;
  panel.addEventListener('pointerdown', () => { pressing = true; });
  document.addEventListener('pointerup', () => {
    if (!pressing) return;
    pressing = false;
    if (pending) setTimeout(() => { pending = false; if (currentId) safeRender(); }, 0);
  }, true);
  const safeRender = () => {
    const a = document.activeElement;
    const typing = a && panel.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.tagName === 'SELECT');
    if (!typing) render();
  };
  store.onChange((types) => {
    if (!currentId) return;
    if (!store.get(currentId)) { closeTask(); return; }
    if (types.has('task') || types.has('tag') || types.has('list')) {
      if (pressing) pending = true; else safeRender();
    }
    markSelected();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentId && !document.querySelector('.popover')) {
      const a = document.activeElement;
      if (a && panel.contains(a) && a.tagName !== 'BODY') a.blur();
      closeTask();
    }
  });
}

export function openTask(id) {
  if (!store.get(id)) return;
  currentId = id;
  render();
  panel.hidden = false;
  appEl.classList.add('panel-open');
  scrim.hidden = !window.matchMedia('(max-width: 900px)').matches;
  markSelected();
}

export function closeTask() {
  if (!currentId) return;
  const a = document.activeElement;
  if (a && panel.contains(a)) a.blur(); // saves pending edits via change/blur handlers
  currentId = null;
  panel.hidden = true;
  scrim.hidden = true;
  appEl.classList.remove('panel-open');
  clear(panel);
  markSelected();
}

// Highlights the open task wherever it appears in the current view.
export function markSelected() {
  document.querySelectorAll('[data-task-id]').forEach((el) => el.classList.toggle('selected', el.dataset.taskId === currentId));
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function render() {
  const rec = store.get(currentId);
  if (!rec) return;
  const d = rec.data;
  clear(panel);

  const lists = store.all('list').sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
  const list = store.get(d.listId);

  // Title
  const title = h('textarea', { class: 'tp-title', rows: 1, 'aria-label': 'Task title', placeholder: 'Task name' });
  title.value = d.title || '';
  const saveTitle = () => { const v = title.value.replace(/\n/g, ' ').trim(); if (v && v !== store.getData(rec.id)?.title) store.update(rec.id, { title: v }); else if (!v) title.value = store.getData(rec.id)?.title || ''; };
  title.addEventListener('input', () => autosize(title));
  title.addEventListener('blur', saveTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });

  const check = h('button', { class: 'check big' + (d.done ? ' done' : ''), 'aria-label': d.done ? 'Mark as not done' : 'Mark as done', onclick: () => { const done = !store.getData(rec.id).done; store.update(rec.id, { done, doneAt: done ? Date.now() : null }); } }, icon('check', 16));

  // Due date with quick picks
  const due = h('input', { class: 'input', type: 'date', value: d.due || '', 'aria-label': 'Due date' });
  due.addEventListener('change', () => store.update(rec.id, { due: due.value || null }));
  const quick = (label, value) => h('button', { class: 'chip-btn' + (d.due === value ? ' on' : ''), type: 'button', onclick: () => store.update(rec.id, { due: value }) }, label);
  const t = today();

  const listSel = h('select', { class: 'select', 'aria-label': 'List' }, lists.map((l) => h('option', { value: l.id, selected: l.id === d.listId }, l.data.name)));
  listSel.addEventListener('change', () => store.update(rec.id, { listId: listSel.value }));

  const notes = h('textarea', { class: 'tp-notes', placeholder: 'Add notes, links or details', 'aria-label': 'Task notes' });
  notes.value = d.notes || '';
  const saveNotes = debounce(() => store.update(rec.id, { notes: notes.value }), 400);
  notes.addEventListener('input', () => { autosize(notes); saveNotes(); });
  notes.addEventListener('blur', () => saveNotes.flush());

  const field = (ic, label, ...control) => h('div', { class: 'tp-field' }, h('div', { class: 'tp-label' }, icon(ic, 15), label), h('div', { class: 'tp-control' }, ...control));

  panel.append(
    h('div', { class: 'tp-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Close task details', title: 'Close', onclick: closeTask }, icon('x', 18)),
      h('span', { class: 'tp-crumb' }, icon('tasks', 15), list ? list.data.name : 'Task'),
      h('button', { class: 'icon-btn danger', 'aria-label': 'Delete task', title: 'Delete task', onclick: () => { store.remove(rec.id); closeTask(); } }, icon('trash', 17))),
    h('div', { class: 'tp-body' },
      h('div', { class: 'tp-title-row' + (d.done ? ' done' : '') }, check, title),
      h('div', { class: 'tp-fields' },
        field('calendar', 'Due date', due, h('div', { class: 'chip-row' }, quick('Today', t), quick('Tomorrow', addDays(t, 1)), quick('Next week', addDays(t, 7)), d.due ? h('button', { class: 'chip-btn', type: 'button', onclick: () => store.update(rec.id, { due: null }) }, 'Clear') : null)),
        field('check', 'List', listSel),
        field('tag', 'Tags', tagEditor(() => store.getData(rec.id)?.tags || [], (ids) => store.update(rec.id, { tags: ids }), { label: 'Add tag' }))),
      h('div', { class: 'tp-notes-wrap' }, h('div', { class: 'tp-label' }, icon('note', 15), 'Notes'), notes),
      h('div', { class: 'tp-meta' },
        `Created ${rel(d.createdAt)}`,
        d.done && d.doneAt ? ` · Completed ${rel(d.doneAt)}` : '',
        d.due ? ` · Due ${fmtDate(d.due, { weekday: 'long', month: 'long', day: 'numeric' })}` : '')));
  requestAnimationFrame(() => { autosize(title); autosize(notes); });
}

function rel(ms) {
  const r = relDay(fmtLocal(ms));
  return ['Today', 'Yesterday', 'Tomorrow'].includes(r) ? r.toLowerCase() : 'on ' + r;
}

function fmtLocal(ms) {
  const dt = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
