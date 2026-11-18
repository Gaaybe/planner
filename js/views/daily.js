import * as store from '../store.js';
import { h, clear, today, addDays, fmtLong, relDay, htmlToText, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { tagEditor, tagChips } from '../components.js';
import { createEditor } from '../editor.js';
import { go, setTitle } from '../nav.js';
import { miniTask, addTask, sortTasks, rerenderSafely } from './taskRow.js';

export const dailyId = (date) => 'daily-' + date;
export function getDaily(date) { return store.get(dailyId(date)); }
export function saveDaily(date, patch) {
  const id = dailyId(date);
  const cur = store.get(id);
  return store.upsert('daily', id, cur ? patch : { date, html: '', tags: [], ...patch });
}

// Editor block for one day's daily note. Used here and in the calendar's day view.
export function dailyEditor(date, { compact = false } = {}) {
  const rec = getDaily(date);
  const editor = createEditor({
    html: rec ? rec.data.html : '',
    placeholder: compact ? 'Write today\'s note…' : 'What happened today? Plans, thoughts, a checklist…',
    compact,
    onChange: (html) => saveDaily(date, { html })
  });
  const tags = tagEditor(() => getDaily(date)?.data.tags || [], (ids) => saveDaily(date, { tags: ids }));
  return {
    editor, tags,
    syncRemote() { const r = getDaily(date); editor.setHtml(r ? r.data.html : ''); if (!tags.contains(document.activeElement)) tags.refresh(); },
    destroy() { editor.destroy(); }
  };
}

export default function dailyView(root, params) {
  let date = params.date;
  let block = null;
  const split = h('div', { class: 'split show-detail' });
  const listPane = h('div', { class: 'split-list' });
  const detail = h('div', { class: 'split-detail' });
  split.append(listPane, detail);
  root.appendChild(split);

  function renderList() {
    clear(listPane);
    const t = today();
    const dates = new Set(store.all('daily', (d) => htmlToText(d.html) || (d.tags && d.tags.length)).map((r) => r.data.date));
    dates.add(t);
    const sorted = [...dates].sort().reverse();
    listPane.append(
      h('div', { class: 'split-list-head' }, h('div', { class: 'row' }, h('h2', null, 'Daily notes'),
        h('input', { class: 'input', type: 'date', style: { width: 'auto', height: '32px' }, 'aria-label': 'Jump to date', value: date, onchange: (e) => e.target.value && go('/daily/' + e.target.value) }))),
      h('div', { class: 'split-list-body' }, sorted.map((ds) => {
        const r = getDaily(ds);
        return h('button', { class: 'list-item' + (ds === date ? ' active' : ''), onclick: () => go('/daily/' + ds) },
          h('div', { class: 'li-title' }, relDay(ds), ' ', h('span', { style: { color: 'var(--muted)', fontWeight: 400 } }, fmtDate(ds, { month: 'short', day: 'numeric', year: 'numeric' }))),
          h('div', { class: 'li-snippet' }, r ? htmlToText(r.data.html).slice(0, 140) || 'Empty' : 'Nothing written yet'),
          r ? h('div', { class: 'li-meta' }, tagChips(r.data.tags)) : null);
      })));
  }

  const tasksBox = h('div');
  function renderTasks() {
    clear(tasksBox);
    const tasks = store.all('task', (d) => d.due === date).sort(sortTasks);
    const input = h('input', { class: 'wadd', placeholder: '+ Add a task for this day', 'aria-label': 'Add a task for this day', 'data-add-key': 'daily' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { addTask(input.value, { due: date }); input.value = ''; } });
    tasksBox.append(h('h3', null, tasks.length ? `Tasks due (${tasks.filter((t) => !t.data.done).length} open)` : 'Tasks due'), h('div', { style: { display: 'grid', gap: '4px' } }, tasks.map(miniTask)), input);
  }

  function renderDetail() {
    if (block) block.destroy();
    clear(detail);
    setTitle(relDay(date) === 'Today' ? 'Today' : fmtLong(date));
    block = dailyEditor(date);
    const isToday = date === today();
    detail.append(
      h('div', { class: 'editor-head' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
          h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => go('/daily/' + addDays(date, -1)) }, icon('left', 20)),
          h('button', { class: 'icon-btn', 'aria-label': 'Next day', onclick: () => go('/daily/' + addDays(date, 1)) }, icon('right', 20)),
          h('div', { class: 'daily-date' }, fmtLong(date)),
          isToday ? null : h('button', { class: 'btn small', style: { marginLeft: 'auto' }, onclick: () => go('/daily/' + today()) }, 'Today')),
        h('div', { class: 'meta-row' }, block.tags)),
      h('div', { class: 'day-strip' }, tasksBox),
      block.editor.el);
    renderTasks();
  }

  renderList(); renderDetail();
  return {
    update(p) { if (p.date !== date) { date = p.date; renderDetail(); } renderList(); },
    refresh(types, source) {
      if (types.has('daily') || types.has('tag')) renderList();
      if (types.has('task')) rerenderSafely(tasksBox, renderTasks);
      if (source === 'remote' && (types.has('daily') || types.has('tag')) && block) block.syncRemote();
    },
    destroy() { if (block) block.destroy(); }
  };
}
