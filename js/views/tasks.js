import * as store from '../store.js';
import { h, clear } from '../util.js';
import { icon } from '../icons.js';
import { menu, confirmAction } from '../components.js';
import { go, setTitle, INBOX_ID } from '../nav.js';
import { taskRow, sortTasks, addTask, isEditingInside } from './taskRow.js';

export default function tasksView(root, params) {
  let listId = params.listId;
  const expanded = new Set();
  let showDone = false;
  const page = h('div', { class: 'page' });
  const inner = h('div', { class: 'narrow' });
  page.appendChild(inner);
  root.appendChild(page);

  const head = h('div', { class: 'page-head' });
  const addInput = h('input', { type: 'text', placeholder: 'Add a task', 'aria-label': 'New task title' });
  const addDate = h('input', { type: 'date', 'aria-label': 'Due date for new task' });
  const addRow = h('form', { class: 'add-row' }, icon('plus', 18), addInput, addDate);
  const rows = h('div');
  inner.append(head, addRow, rows);

  addRow.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = addInput.value.trim();
    if (!t) return;
    addTask(t, { listId: listId === 'all' ? INBOX_ID : listId, due: addDate.value || null });
    addInput.value = '';
    addInput.focus();
  });

  function renderHead() {
    clear(head);
    if (listId === 'all') {
      head.appendChild(h('h1', null, 'All tasks'));
      setTitle('All tasks');
      return;
    }
    const list = store.get(listId);
    if (!list) { head.appendChild(h('h1', null, 'List not found')); return; }
    setTitle(list.data.name);
    const name = h('input', { class: 'title-input', value: list.data.name, 'aria-label': 'List name' });
    name.addEventListener('change', () => { const v = name.value.trim(); if (v) store.update(listId, { name: v }); else name.value = list.data.name; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const more = h('button', { class: 'icon-btn', 'aria-label': 'List options' }, icon('more', 18));
    more.addEventListener('click', () => menu(more, [
      listId !== INBOX_ID && { label: 'Delete list', icon: 'trash', danger: true, onClick: () => {
        const tasks = store.all('task', (d) => d.listId === listId);
        if (!confirmAction(`Delete "${list.data.name}" and its ${tasks.length} task${tasks.length === 1 ? '' : 's'}?`)) return;
        tasks.forEach((t) => store.remove(t.id));
        store.remove(listId);
        go('/tasks/' + INBOX_ID);
      } },
      { label: 'Clear completed', icon: 'check', onClick: () => store.all('task', (d) => d.listId === listId && d.done).forEach((t) => store.remove(t.id)) }
    ]));
    head.append(name, more);
  }

  function renderRows() {
    clear(rows);
    const filter = listId === 'all' ? () => true : (d) => d.listId === listId;
    const tasks = store.all('task', filter);
    const open = tasks.filter((t) => !t.data.done).sort(sortTasks);
    const done = tasks.filter((t) => t.data.done).sort((a, b) => (b.data.doneAt || 0) - (a.data.doneAt || 0));
    const opts = { expanded, showList: listId === 'all', onToggleOpen: renderRows };
    if (!open.length && !done.length) {
      rows.appendChild(h('div', { class: 'empty' }, h('strong', null, 'Nothing here yet'), 'Type a task above and press Enter.'));
      return;
    }
    if (!open.length) rows.appendChild(h('div', { class: 'empty' }, 'Everything here is done.'));
    open.forEach((t) => rows.appendChild(taskRow(t, opts)));
    if (done.length) {
      rows.appendChild(h('button', { class: 'done-toggle' + (showDone ? '' : ' collapsed'), 'aria-expanded': String(showDone), onclick: () => { showDone = !showDone; renderRows(); } }, icon('down', 16), `Completed (${done.length})`));
      if (showDone) done.forEach((t) => rows.appendChild(taskRow(t, opts)));
    }
  }

  renderHead();
  renderRows();
  if (listId !== 'all' && !store.get(listId)) addRow.hidden = true;

  return {
    update(p) { listId = p.listId; expanded.clear(); addRow.hidden = listId !== 'all' && !store.get(listId); renderHead(); renderRows(); },
    refresh(types) {
      if (types.has('list') && !head.contains(document.activeElement)) renderHead();
      if ((types.has('task') || types.has('tag') || types.has('list')) && !isEditingInside(rows)) renderRows();
    }
  };
}
