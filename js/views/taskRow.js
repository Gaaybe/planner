import * as store from '../store.js';
import { h, today, relDay } from '../util.js';
import { icon } from '../icons.js';
import { tagChips } from '../components.js';
import { openTask, currentTask } from '../taskPanel.js';
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

// Task row. Clicking it opens the task's details in the side panel.
// opts: { showList:bool, showDue:bool }
export function taskRow(rec, opts = {}) {
  const d = rec.data;
  const list = opts.showList && d.listId ? store.get(d.listId) : null;
  const open = () => openTask(rec.id);
  const row = h('div', {
    class: 'task task-row' + (d.done ? ' done' : '') + (currentTask() === rec.id ? ' selected' : ''),
    dataset: { taskId: rec.id }, role: 'button', tabindex: '0', 'aria-label': `Open task ${d.title}`,
    onclick: open, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }
  },
    checkBox(rec),
    h('span', { class: 'task-title' }, d.title || 'Untitled task'),
    d.notes ? h('span', { class: 'task-has-notes', title: 'Has notes' }, icon('note', 14)) : null,
    tagChips(d.tags, (id) => go('/tag/' + id)),
    list ? h('span', { class: 'task-list-label' }, list.data.name) : null,
    opts.showDue === false ? null : dueChip(d.due, d.done));
  return row;
}

// Compact row for calendar columns.
export function miniTask(rec) {
  return h('div', { class: 'wtask' + (rec.data.done ? ' done' : '') + (currentTask() === rec.id ? ' selected' : ''), dataset: { taskId: rec.id } },
    checkBox(rec),
    h('span', { class: 't', role: 'button', tabindex: '0', title: 'Open task details', onclick: () => openTask(rec.id), onkeydown: (e) => { if (e.key === 'Enter') openTask(rec.id); } }, rec.data.title));
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
