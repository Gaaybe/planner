import * as store from '../store.js';
import { h, clear, today, addDays, addMonths, startOfWeek, parseYmd, ymd, fmtLong, fmtDate, monthTitle, weekdayShort, htmlToText } from '../util.js';
import { icon } from '../icons.js';
import { go, setTitle, prefs } from '../nav.js';
import { miniTask, taskRow, sortTasks, addTask, rerenderSafely } from './taskRow.js';
import { getDaily, dailyEditor } from './daily.js';
import { noteTitle, newNote } from './notes.js';
import { tagChips } from '../components.js';

function tasksOn(date) { return store.all('task', (d) => d.due === date).sort((a, b) => (a.data.done ? 1 : 0) - (b.data.done ? 1 : 0) || sortTasks(a, b)); }
function notesOn(date) { return store.all('note', (d) => d.date === date).sort((a, b) => a.data.createdAt - b.data.createdAt); }
function dailyText(date) { const r = getDaily(date); return r ? htmlToText(r.data.html) : ''; }

export default function calendarView(root, params) {
  let mode = ['month', 'week', 'day'].includes(params.mode) ? params.mode : 'week';
  let date = params.date;
  let dayBlock = null;
  const expanded = new Set();

  const wrap = h('div', { class: 'cal' });
  const head = h('div', { class: 'cal-head' });
  const body = h('div', { style: { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' } });
  wrap.append(head, body);
  root.appendChild(wrap);

  const nav = (m, d) => go(`/calendar/${m}/${d}`);
  const step = (dir) => {
    if (mode === 'month') nav(mode, addMonths(date, dir));
    else if (mode === 'week') nav(mode, addDays(date, 7 * dir));
    else nav(mode, addDays(date, dir));
  };

  function titleText() {
    if (mode === 'month') return monthTitle(date);
    if (mode === 'day') return fmtLong(date);
    const s = startOfWeek(date, prefs.weekStart), e = addDays(s, 6);
    const sameMonth = s.slice(0, 7) === e.slice(0, 7);
    return sameMonth
      ? `${fmtDate(s, { month: 'long' })} ${parseYmd(s).getDate()}–${parseYmd(e).getDate()}, ${s.slice(0, 4)}`
      : `${fmtDate(s, { month: 'short', day: 'numeric' })} – ${fmtDate(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function renderHead() {
    clear(head);
    setTitle(titleText());
    head.append(
      h('h1', null, titleText()),
      h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Calendar view' },
        ['month', 'week', 'day'].map((m) => h('button', { class: m === mode ? 'on' : '', role: 'tab', 'aria-selected': String(m === mode), onclick: () => nav(m, date) }, m[0].toUpperCase() + m.slice(1)))),
      h('div', { class: 'cal-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous', onclick: () => step(-1) }, icon('left', 20)),
        h('button', { class: 'btn small', onclick: () => nav(mode, today()) }, 'Today'),
        h('button', { class: 'icon-btn', 'aria-label': 'Next', onclick: () => step(1) }, icon('right', 20))));
  }

  // ---------- Month ----------
  function renderMonth() {
    const first = date.slice(0, 8) + '01';
    const start = startOfWeek(first, prefs.weekStart);
    const lastDay = ymd(new Date(parseYmd(first).getFullYear(), parseYmd(first).getMonth() + 1, 0));
    let weeks = 0; for (let d = start; d <= lastDay; d = addDays(d, 7)) weeks++;
    const t = today();
    const grid = h('div', { class: 'month-grid', style: { gridTemplateRows: `repeat(${weeks}, minmax(92px, 1fr))` } });
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const tasks = tasksOn(d), notes = notesOn(d), daily = dailyText(d);
      const chips = [];
      if (daily) chips.push(h('div', { class: 'mchip note' }, icon('daily', 12), daily.slice(0, 40)));
      tasks.forEach((tk) => chips.push(h('div', { class: 'mchip' + (tk.data.done ? ' done' : '') }, tk.data.title)));
      notes.forEach((n) => chips.push(h('div', { class: 'mchip note' }, icon('note', 12), noteTitle(n.data))));
      const max = 3;
      grid.appendChild(h('div', { class: 'mcell' + (d.slice(0, 7) !== date.slice(0, 7) ? ' other' : '') + (d === t ? ' today' : ''), role: 'button', tabindex: '0', 'aria-label': fmtLong(d), onclick: () => nav('day', d), onkeydown: (e) => { if (e.key === 'Enter') nav('day', d); } },
        h('span', { class: 'mnum' }, parseYmd(d).getDate()),
        chips.slice(0, max),
        chips.length > max ? h('div', { class: 'mmore' }, `+${chips.length - max} more`) : null));
    }
    const dow = h('div', { class: 'month-dow' });
    for (let i = 0; i < 7; i++) dow.appendChild(h('div', null, weekdayShort(addDays(start, i))));
    body.appendChild(h('div', { class: 'month' }, dow, grid));
  }

  // ---------- Week: seven columns side by side ----------
  function renderWeek() {
    const start = startOfWeek(date, prefs.weekStart);
    const t = today();
    const week = h('div', { class: 'week' });
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const tasks = tasksOn(d), notes = notesOn(d), daily = getDaily(d);
      const dailyTxt = daily ? htmlToText(daily.data.html) : '';
      const add = h('input', { class: 'wadd', placeholder: '+ Add task', 'aria-label': `Add task on ${fmtLong(d)}`, 'data-add-key': 'w-' + d });
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { addTask(add.value, { due: d }); add.value = ''; } });
      const col = h('section', { class: 'wcol' + (d === t ? ' today' : ''), 'aria-label': fmtLong(d), dataset: { date: d } },
        h('button', { class: 'whead', onclick: () => nav('day', d), title: 'Open day' }, h('span', { class: 'wn' }, parseYmd(d).getDate()), h('span', { class: 'wd' }, weekdayShort(d))),
        h('div', { class: 'wbody' },
          h('div', { class: 'wsec' }, 'Tasks'),
          tasks.map(miniTask),
          add,
          h('div', { class: 'wsec' }, 'Notes'),
          dailyTxt || (daily && daily.data.tags && daily.data.tags.length)
            ? h('button', { class: 'wnote', onclick: () => go('/daily/' + d) }, h('div', { class: 'wn-title' }, icon('daily', 14), 'Daily note'), h('div', { class: 'wn-body' }, dailyTxt), tagChips(daily.data.tags))
            : h('button', { class: 'wnote-add', onclick: () => go('/daily/' + d) }, icon('daily', 14), 'Daily note'),
          notes.map((n) => h('button', { class: 'wnote plain', onclick: () => go('/notes/all/' + n.id) }, h('div', { class: 'wn-title' }, icon('note', 14), noteTitle(n.data)), h('div', { class: 'wn-body' }, htmlToText(n.data.html).slice(0, 160)), tagChips(n.data.tags))),
          h('button', { class: 'wnote-add', onclick: () => { const rec = newNote({ date: d }); go('/notes/all/' + rec.id); } }, icon('plus', 14), 'Note')));
      week.appendChild(col);
    }
    body.appendChild(week);
    // Scroll today's column into view on narrow screens.
    requestAnimationFrame(() => {
      const c = week.querySelector('.wcol.today');
      if (c && c.offsetLeft + c.offsetWidth > week.clientWidth) week.scrollLeft = c.offsetLeft - 12;
    });
  }

  // ---------- Day ----------
  const dayTasks = h('div');
  function renderDayTasks() {
    clear(dayTasks);
    const t = today();
    const tasks = tasksOn(date);
    const input = h('input', { type: 'text', placeholder: 'Add a task for this day', 'aria-label': 'Add a task for this day', 'data-add-key': 'day' });
    const form = h('form', { class: 'add-row' }, icon('plus', 18), input);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) { addTask(input.value, { due: date }); input.value = ''; input.focus(); } });
    const opts = { expanded, showList: true, showDue: false, onToggleOpen: renderDayTasks };
    dayTasks.append(h('div', { class: 'panel' }, h('h2', null, icon('tasks', 18), h('span', { class: 'grow' }, 'Tasks'), h('span', { class: 'due' }, `${tasks.filter((x) => !x.data.done).length} open`)),
      form, tasks.length ? tasks.map((tk) => taskRow(tk, opts)) : h('div', { class: 'empty', style: { padding: '10px' } }, 'No tasks due on this day.')));
    if (date === t) {
      const overdue = store.all('task', (d) => !d.done && d.due && d.due < t).sort(sortTasks);
      if (overdue.length) dayTasks.append(h('div', { class: 'panel' }, h('h2', null, h('span', { class: 'grow' }, 'Overdue')), overdue.map((tk) => taskRow(tk, { ...opts, showDue: true }))));
    }
    const notes = notesOn(date);
    dayTasks.append(h('div', { class: 'panel' },
      h('h2', null, icon('note', 18), h('span', { class: 'grow' }, 'Notes'), h('button', { class: 'btn small', onclick: () => { const rec = newNote({ date }); go('/notes/all/' + rec.id); } }, icon('plus', 14), 'New note')),
      notes.length ? notes.map((n) => h('button', { class: 'result', onclick: () => go('/notes/all/' + n.id) }, icon('note', 16), h('span', { class: 'r-title' }, noteTitle(n.data)), tagChips(n.data.tags)))
        : h('div', { class: 'empty', style: { padding: '10px' } }, 'No notes for this day.')));
  }
  function renderDay() {
    const view = h('div', { class: 'dayview' });
    dayBlock = dailyEditor(date, { compact: true });
    view.append(dayTasks,
      h('div', { class: 'panel' },
        h('h2', null, icon('daily', 18), h('span', { class: 'grow' }, 'Daily note'), h('a', { class: 'btn small ghost', href: '#/daily/' + date }, 'Open full page')),
        h('div', { style: { marginBottom: '6px' } }, dayBlock.tags),
        dayBlock.editor.el));
    renderDayTasks();
    body.appendChild(view);
  }

  function renderBody() {
    if (dayBlock) { dayBlock.destroy(); dayBlock = null; }
    clear(body);
    if (mode === 'month') renderMonth();
    else if (mode === 'week') renderWeek();
    else renderDay();
  }

  renderHead(); renderBody();

  return {
    update(p) {
      mode = ['month', 'week', 'day'].includes(p.mode) ? p.mode : 'week';
      date = p.date; expanded.clear();
      renderHead(); renderBody();
    },
    refresh(types, source) {
      if (mode === 'day') {
        if (['task', 'note', 'tag', 'list'].some((t) => types.has(t))) rerenderSafely(dayTasks, renderDayTasks);
        if (source === 'remote' && dayBlock && (types.has('daily') || types.has('tag'))) dayBlock.syncRemote();
        return;
      }
      rerenderSafely(body, renderBody);
    },
    destroy() { if (dayBlock) dayBlock.destroy(); }
  };
}
