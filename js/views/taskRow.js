import * as store from '../store.js';
import { h, debounce, today, relDay } from '../util.js';
import { icon } from '../icons.js';
import { tagEditor, tagChips } from '../components.js';
import { go } from '../nav.js';

export function sortTasks(a, b) {
  const ad = a.data.due || '9999', bd = b.data.due || '9999';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.data.createdAt || 0) - (b.data.createdAt || 0);
}

export function toggleDone(rec) {
  const done = !rec.data.done;
  store.update(rec.id, { done, doneAt: done ? Date.now() : null });
}

export function dueChip(due, done) {
  if (!due) return null;
  const t = today();
  const cls = done ? 'due' : due < t ? 'due overdue' : due === t ? 'due today' : 'due';
  return h('span', { class: cls }, relDay(due));
}

export function checkBox(rec) {
  return h('button', {
    class: 'check' + (rec.data.done ? ' done' : ''), type: 'button',
    'aria-label': rec.data.done ? 'Mark as not done' : 'Mark as done', 'aria-pressed': rec.data.done ? 'true' : 'false',
    onclick: (e) => { e.stopPropagation(); toggleDone(rec); }
  }, icon('check', 14));
}

// Full task row with an expandable detail panel.
// opts: { expanded:Set, showList:bool, showDue:bool, onToggleOpen }
export function taskRow(rec, opts = {}) {
  const d = rec.data;
  const open = opts.expanded && opts.expanded.has(rec.id);
  const wrap = h('div', { class: 'task' + (d.done ? ' done' : '') + (open ? ' open' : ''), dataset: { id: rec.id } });
  const title = h('input', { class: 'task-title', value: d.title || '', 'aria-label': 'Task title', type: 'text' });
  const commitTitle = () => { const v = title.value.trim(); if (v && v !== store.getData(rec.id)?.title) store.update(rec.id, { title: v }); else if (!v) title.value = store.getData(rec.id)?.title || ''; };
  title.addEventListener('change', commitTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { title.blur(); } });
  const list = opts.showList && d.listId ? store.get(d.listId) : null;
  const toggleOpen = () => {
    if (!opts.expanded) return;
    if (opts.expanded.has(rec.id)) opts.expanded.delete(rec.id); else opts.expanded.add(rec.id);
    if (opts.onToggleOpen) opts.onToggleOpen();
  };
  const row = h('div', { class: 'task-row' },
    checkBox(rec), title,
    tagChips(d.tags, (id) => go('/tag/' + id)),
    list ? h('span', { class: 'task-list-label' }, list.data.name) : null,
    opts.showDue === false ? null : dueChip(d.due, d.done),
    opts.expanded ? h('button', { class: 'icon-btn', 'aria-label': open ? 'Hide details' : 'Show details', 'aria-expanded': open ? 'true' : 'false', onclick: toggleOpen }, icon(open ? 'down' : 'more', 16)) : null);
  row.addEventListener('dblclick', (e) => { if (e.target === row) toggleOpen(); });
  wrap.appendChild(row);
  if (open) wrap.appendChild(taskDetail(rec));
  return wrap;
}

function taskDetail(rec) {
  const d = rec.data;
  const due = h('input', { class: 'input', type: 'date', value: d.due || '', 'aria-label': 'Due date' });
  due.addEventListener('change', () => store.update(rec.id, { due: due.value || null }));
  const lists = store.all('list').sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
  const listSel = h('select', { class: 'select', 'aria-label': 'List' }, lists.map((l) => h('option', { value: l.id, selected: l.id === d.listId }, l.data.name)));
  listSel.addEventListener('change', () => store.update(rec.id, { listId: listSel.value }));
  const notes = h('textarea', { class: 'textarea', placeholder: 'Notes', rows: 3, 'aria-label': 'Task notes' });
  notes.value = d.notes || '';
  const saveNotes = debounce(() => store.update(rec.id, { notes: notes.value }), 400);
  notes.addEventListener('input', saveNotes);
  notes.addEventListener('blur', () => saveNotes.flush());
  return h('div', { class: 'task-detail' },
    h('div', { class: 'row' },
      h('label', null, 'Due date', due),
      h('label', null, 'List', listSel),
      h('label', null, 'Tags', tagEditor(() => store.getData(rec.id)?.tags || [], (ids) => store.update(rec.id, { tags: ids })))),
    notes,
    h('div', { class: 'row' }, h('button', { class: 'btn small ghost danger', onclick: () => store.remove(rec.id) }, icon('trash', 15), 'Delete task')));
}

// Compact row for calendar columns.
export function miniTask(rec) {
  return h('div', { class: 'wtask' + (rec.data.done ? ' done' : '') },
    checkBox(rec),
    h('span', { class: 't', title: 'Open in list', onclick: () => go('/tasks/' + (rec.data.listId || 'all')) }, rec.data.title));
}

export function addTask(title, fields = {}) {
  return store.create('task', { title: title.trim(), done: false, due: null, notes: '', tags: [], listId: 'list-inbox', ...fields });
}

// Re-renders `container` unless the person is typing in it. An empty "add"
// box (marked with data-add-key) is re-focused after the render so several
// tasks can be added in a row.
export function rerenderSafely(container, render) {
  const a = document.activeElement;
  if (a && container.contains(a)) {
    const key = a.dataset && a.dataset.addKey;
    if (key && !a.value) {
      render();
      const n = container.querySelector(`[data-add-key="${key}"]`);
      if (n) n.focus();
      return;
    }
    if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable) return;
  }
  render();
}

// Keeps focus/edits safe: true when the person is typing inside `container`.
export function isEditingInside(container) {
  const a = document.activeElement;
  return a && container.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}
