import * as store from '../store.js';
import { h, clear, htmlToText, relDay, ymd, isValidYmd, TAG_COLORS } from '../util.js';
import { icon } from '../icons.js';
import { menu, confirmAction, tagEditor, tagChips } from '../components.js';
import { createEditor } from '../editor.js';
import { go, setTitle } from '../nav.js';

export function noteTitle(d) { return (d.title || '').trim() || htmlToText(d.html).slice(0, 60) || 'Untitled note'; }

export function newNote(fields = {}) {
  return store.create('note', { title: '', html: '', tags: [], groupId: null, pinned: false, date: ymd(), ...fields });
}

export default function notesView(root, params) {
  let scope = params.scope;
  let noteId = params.noteId;
  let query = '';
  let editor = null;

  const split = h('div', { class: 'split' });
  const listPane = h('div', { class: 'split-list' });
  const detail = h('div', { class: 'split-detail' });
  split.append(listPane, detail);
  root.appendChild(split);

  const listHead = h('div', { class: 'split-list-head' });
  const listBody = h('div', { class: 'split-list-body' });
  listPane.append(listHead, listBody);

  const base = () => '/notes/' + scope;
  const scopeName = () => scope === 'all' ? 'All notes' : scope === 'none' ? 'Ungrouped' : (store.getData(scope)?.name || 'Group');

  function renderHead() {
    clear(listHead);
    const group = scope !== 'all' && scope !== 'none' ? store.get(scope) : null;
    const titleEl = group
      ? h('input', { class: 'title-input', style: { fontSize: '20px' }, value: group.data.name, 'aria-label': 'Group name' })
      : h('h2', null, scopeName());
    if (group) {
      titleEl.addEventListener('change', () => { const v = titleEl.value.trim(); if (v) store.update(group.id, { name: v }); });
      titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleEl.blur(); });
    }
    const addBtn = h('button', { class: 'btn primary small', onclick: () => {
      const rec = newNote({ groupId: group ? group.id : null });
      go(base() + '/' + rec.id);
      setTimeout(() => detail.querySelector('.title-input')?.focus(), 30);
    } }, icon('plus', 15), 'New note');
    const row = h('div', { class: 'row' }, titleEl);
    if (group) {
      const more = h('button', { class: 'icon-btn', 'aria-label': 'Group options' }, icon('more', 18));
      more.addEventListener('click', () => menu(more, [
        { label: 'Change color', icon: 'palette', onClick: () => {
          const i = TAG_COLORS.indexOf(group.data.color);
          store.update(group.id, { color: TAG_COLORS[(i + 1) % TAG_COLORS.length] });
        } },
        { label: 'Delete group', icon: 'trash', danger: true, onClick: () => {
          if (!confirmAction(`Delete the group "${group.data.name}"? Its notes move to Ungrouped.`)) return;
          store.all('note', (d) => d.groupId === group.id).forEach((n) => store.update(n.id, { groupId: null }));
          store.remove(group.id);
          go('/notes/all');
        } }
      ]));
      row.appendChild(more);
    }
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search notes', value: query, 'aria-label': 'Search notes' });
    search.addEventListener('input', () => { query = search.value.toLowerCase(); renderList(); });
    listHead.append(row, h('div', { class: 'row' }, search, addBtn));
  }

  function notesInScope() {
    return store.all('note', (d) => scope === 'all' ? true : scope === 'none' ? !d.groupId : d.groupId === scope)
      .filter((r) => !query || (r.data.title || '').toLowerCase().includes(query) || htmlToText(r.data.html).toLowerCase().includes(query))
      .sort((a, b) => (b.data.pinned ? 1 : 0) - (a.data.pinned ? 1 : 0) || b.updated_at - a.updated_at);
  }

  function renderList() {
    clear(listBody);
    const notes = notesInScope();
    if (!notes.length) {
      listBody.appendChild(h('div', { class: 'empty' }, query ? 'No notes match your search.' : h('span', null, h('strong', null, 'No notes yet'), 'Create one with New note.')));
      return;
    }
    for (const n of notes) {
      const g = n.data.groupId ? store.get(n.data.groupId) : null;
      listBody.appendChild(h('button', { class: 'list-item' + (n.id === noteId ? ' active' : ''), onclick: () => go(base() + '/' + n.id) },
        h('div', { class: 'li-title' }, n.data.pinned ? '📌 ' : '', noteTitle(n.data)),
        h('div', { class: 'li-snippet' }, htmlToText(n.data.html).slice(0, 160) || 'Empty note'),
        h('div', { class: 'li-meta' }, relDay(ymd(new Date(n.updated_at))), scope === 'all' && g ? h('span', { class: 'task-list-label' }, g.data.name) : null, tagChips(n.data.tags))));
    }
  }

  function renderDetail() {
    if (editor) { editor.destroy(); editor = null; }
    clear(detail);
    split.classList.toggle('show-detail', !!noteId);
    const rec = noteId ? store.get(noteId) : null;
    if (!rec) {
      setTitle(scopeName());
      detail.appendChild(h('div', { class: 'empty', style: { margin: 'auto' } }, h('strong', null, noteId ? 'This note was deleted' : 'Pick a note'), 'Or start a new one with New note.'));
      return;
    }
    const d = rec.data;
    setTitle(noteTitle(d));
    const back = h('button', { class: 'icon-btn back-btn', 'aria-label': 'Back to notes', onclick: () => go(base()) }, icon('left', 20));
    const title = h('input', { class: 'title-input', value: d.title || '', placeholder: 'Untitled note', 'aria-label': 'Note title' });
    title.addEventListener('input', () => store.update(rec.id, { title: title.value }));
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });

    const groups = store.all('group').sort((a, b) => a.data.name.localeCompare(b.data.name));
    const groupSel = h('select', { class: 'select', 'aria-label': 'Group' },
      h('option', { value: '' }, 'No group'), groups.map((g) => h('option', { value: g.id, selected: g.id === d.groupId }, g.data.name)));
    groupSel.addEventListener('change', () => store.update(rec.id, { groupId: groupSel.value || null }));
    const date = h('input', { class: 'input', type: 'date', value: d.date || '', 'aria-label': 'Show on calendar date', title: 'Show on calendar' });
    date.addEventListener('change', () => store.update(rec.id, { date: isValidYmd(date.value) ? date.value : null }));
    const more = h('button', { class: 'icon-btn', 'aria-label': 'Note options' }, icon('more', 18));
    more.addEventListener('click', () => menu(more, [
      { label: store.getData(rec.id).pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onClick: () => store.update(rec.id, { pinned: !store.getData(rec.id).pinned }) },
      { label: 'Delete note', icon: 'trash', danger: true, onClick: () => { if (confirmAction('Delete this note?')) { store.remove(rec.id); go(base()); } } }
    ]));

    editor = createEditor({ html: d.html, placeholder: 'Start writing… (try "- " for a list or "[] " for a checklist)', onChange: (html) => store.update(rec.id, { html }) });
    detail.append(
      h('div', { class: 'editor-head' },
        h('div', { class: 'row', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, back, title, more),
        h('div', { class: 'meta-row' },
          icon('folder', 15), groupSel,
          icon('calendar', 15), date,
          tagEditor(() => store.getData(rec.id)?.tags || [], (ids) => store.update(rec.id, { tags: ids })))),
      editor.el);
  }

  renderHead(); renderList(); renderDetail();

  return {
    update(p) {
      const scopeChanged = p.scope !== scope;
      scope = p.scope;
      if (scopeChanged) { query = ''; renderHead(); }
      if (p.noteId !== noteId) { noteId = p.noteId; renderDetail(); }
      renderList();
    },
    refresh(types, source) {
      if (types.has('group') && !listHead.contains(document.activeElement)) renderHead();
      if (types.has('note') || types.has('tag') || types.has('group')) renderList();
      if (source === 'remote' && noteId) {
        const rec = store.get(noteId);
        if (!rec) { renderDetail(); return; }
        const t = detail.querySelector('.title-input');
        if (t && document.activeElement !== t) t.value = rec.data.title || '';
        if (editor) editor.setHtml(rec.data.html);
      }
    },
    destroy() { if (editor) editor.destroy(); }
  };
}
