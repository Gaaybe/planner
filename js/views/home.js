// Home screen: today at a glance.
import * as store from '../store.js';
import { h, clear, today, addDays, startOfWeek, parseYmd, weekdayShort, fmtDate, htmlToText, relDay, ymd } from '../util.js';
import { icon } from '../icons.js';
import { tagChips } from '../components.js';
import { go, setTitle, prefs, INBOX_ID } from '../nav.js';
import { taskRow, sortTasks, addTask, rerenderSafely } from './taskRow.js';
import { dailyEditor, getDaily } from './daily.js';
import { noteTitle, newNote } from './notes.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

export default function homeView(root) {
  setTitle('Home');
  let date = today();
  let block = null;
  const page = h('div', { class: 'page home' });
  root.appendChild(page);

  const tasksBox = h('div');
  const weekBox = h('div');
  const notesBox = h('div');
  const noteBox = h('section', { class: 'card home-note', 'aria-label': "Today's note" });
  let addInput = null;

  // ----- Header -----
  const header = h('div', { class: 'home-head' },
    h('div', null,
      h('h1', { class: 'home-greet' }, greeting()),
      h('div', { class: 'home-date' }, fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }))),
    h('div', { class: 'home-actions' },
      h('button', { class: 'btn primary', onclick: () => { if (addInput) { addInput.focus(); addInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } }, icon('plus', 16), 'New task'),
      h('button', { class: 'btn', onclick: () => { const r = newNote(); go('/notes/all/' + r.id); } }, icon('note', 16), 'New note'),
      h('button', { class: 'btn', onclick: () => { const r = store.create('board', { name: 'Untitled whiteboard' }); go('/board/' + r.id); } }, icon('board', 16), 'New whiteboard')));

  // ----- Today's tasks -----
  function renderTasks() {
    clear(tasksBox);
    const t = today();
    const dueToday = store.all('task', (d) => d.due === t).sort((a, b) => (a.data.done ? 1 : 0) - (b.data.done ? 1 : 0) || sortTasks(a, b));
    const overdue = store.all('task', (d) => !d.done && d.due && d.due < t).sort(sortTasks);
    const open = dueToday.filter((x) => !x.data.done).length + overdue.length;
    addInput = h('input', { type: 'text', placeholder: 'Add a task for today', 'aria-label': 'Add a task for today', 'data-add-key': 'home' });
    const form = h('form', { class: 'add-row' }, icon('plus', 18), addInput);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (addInput.value.trim()) { addTask(addInput.value, { due: t, listId: INBOX_ID }); addInput.value = ''; } });
    tasksBox.append(h('section', { class: 'card', 'aria-label': "Today's tasks" },
      h('div', { class: 'card-head' }, icon('tasks', 18), h('h2', null, "Today's tasks"), h('span', { class: 'card-count' }, open ? `${open} open` : 'All clear')),
      form,
      overdue.length ? h('div', { class: 'card-sub' }, 'Overdue') : null,
      overdue.map((r) => taskRow(r, { showList: false })),
      overdue.length && dueToday.length ? h('div', { class: 'card-sub' }, 'Due today') : null,
      dueToday.map((r) => taskRow(r, { showList: false, showDue: false })),
      !overdue.length && !dueToday.length ? h('div', { class: 'empty small' }, 'Nothing due today. Add a task above.') : null));
  }

  // ----- Today's daily note -----
  function renderNote() {
    if (block) block.destroy();
    clear(noteBox);
    block = dailyEditor(date, { compact: true });
    noteBox.append(
      h('div', { class: 'card-head' }, icon('daily', 18), h('h2', null, "Today's note"), h('a', { class: 'btn small ghost', href: '#/daily/' + date }, 'Open full page')),
      h('div', { style: { marginBottom: '4px' } }, block.tags),
      block.editor.el);
  }

  // ----- This week -----
  function renderWeek() {
    clear(weekBox);
    const t = today();
    const start = startOfWeek(t, prefs.weekStart);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const tasks = store.all('task', (x) => x.due === d);
      const openCount = tasks.filter((x) => !x.data.done).length;
      const daily = getDaily(d);
      const hasNote = (daily && htmlToText(daily.data.html)) || store.all('note', (x) => x.date === d).length;
      days.push(h('button', { class: 'wk-day' + (d === t ? ' today' : '') + (d < t ? ' past' : ''), onclick: () => go('/calendar/day/' + d), 'aria-label': `${fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}: ${openCount} open tasks` },
        h('span', { class: 'wk-name' }, weekdayShort(d)),
        h('span', { class: 'wk-num' }, parseYmd(d).getDate()),
        h('span', { class: 'wk-info' }, tasks.length ? `${openCount || 'All'} ${openCount ? (openCount === 1 ? 'task' : 'tasks') : 'done'}` : '—'),
        hasNote ? h('span', { class: 'wk-dot', title: 'Has notes' }) : null));
    }
    weekBox.append(h('section', { class: 'card', 'aria-label': 'This week' },
      h('div', { class: 'card-head' }, icon('calendar', 18), h('h2', null, 'This week'), h('a', { class: 'btn small ghost', href: '#/calendar/week/' + t }, 'Open calendar')),
      h('div', { class: 'wk-strip' }, days)));
  }

  // ----- Recent notes -----
  function renderNotes() {
    clear(notesBox);
    const notes = store.all('note').sort((a, b) => (b.data.pinned ? 1 : 0) - (a.data.pinned ? 1 : 0) || b.updated_at - a.updated_at).slice(0, 6);
    notesBox.append(h('section', { class: 'card', 'aria-label': 'Recent notes' },
      h('div', { class: 'card-head' }, icon('note', 18), h('h2', null, 'Recent notes'), h('a', { class: 'btn small ghost', href: '#/notes/all' }, 'All notes')),
      notes.length
        ? h('div', { class: 'note-grid' }, notes.map((n) => {
          const g = n.data.groupId ? store.get(n.data.groupId) : null;
          return h('button', { class: 'note-tile', onclick: () => go('/notes/all/' + n.id) },
            h('div', { class: 'nt-title' }, n.data.pinned ? icon('pin', 14) : null, noteTitle(n.data)),
            h('div', { class: 'nt-snippet' }, htmlToText(n.data.html).slice(0, 140) || 'Empty note'),
            h('div', { class: 'nt-meta' }, g ? h('span', { class: 'nt-group' }, h('i', { style: { background: g.data.color } }), g.data.name) : null, relDay(ymd(new Date(n.updated_at))), tagChips(n.data.tags)));
        }))
        : h('div', { class: 'empty small' }, 'Your latest notes will show up here. ', h('button', { class: 'linklike', onclick: () => { const r = newNote(); go('/notes/all/' + r.id); } }, 'Write one now'))));
  }

  page.append(header,
    h('div', { class: 'home-grid' }, tasksBox, noteBox),
    weekBox,
    notesBox);
  renderTasks(); renderNote(); renderWeek(); renderNotes();

  // Refresh the greeting and "today" if the app stays open past midnight.
  const tick = setInterval(() => {
    if (today() !== date) { date = today(); renderTasks(); renderNote(); renderWeek(); header.querySelector('.home-date').textContent = fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }); }
    header.querySelector('.home-greet').textContent = greeting();
  }, 60000);

  return {
    refresh(types, source) {
      if (types.has('task') || types.has('tag') || types.has('list')) rerenderSafely(tasksBox, renderTasks);
      if (['task', 'daily', 'note'].some((t) => types.has(t))) renderWeek();
      if (types.has('note') || types.has('group') || types.has('tag')) renderNotes();
      if (source === 'remote' && block && (types.has('daily') || types.has('tag'))) block.syncRemote();
    },
    destroy() { clearInterval(tick); if (block) block.destroy(); }
  };
}
