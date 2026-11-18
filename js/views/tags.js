import * as store from '../store.js';
import { h, clear, htmlToText, relDay, TAG_COLORS } from '../util.js';
import { icon } from '../icons.js';
import { tagsSorted, createTag, confirmAction } from '../components.js';
import { go, setTitle } from '../nav.js';
import { noteTitle } from './notes.js';
import { dueChip, checkBox, rerenderSafely } from './taskRow.js';
import { openTask } from '../taskPanel.js';

const TAGGABLE = ['task', 'note', 'daily', 'wbitem'];
function usage(tagId) {
  let n = 0;
  for (const t of TAGGABLE) n += store.all(t, (d) => (d.tags || []).includes(tagId)).length;
  return n;
}

export function tagsView(root) {
  const page = h('div', { class: 'page' });
  const inner = h('div', { class: 'narrow' });
  page.appendChild(inner);
  root.appendChild(page);
  const render = () => {
    clear(inner);
    setTitle('Tags');
    const input = h('input', { type: 'text', placeholder: 'New tag name', 'aria-label': 'New tag name', 'data-add-key': 'tag' });
    const form = h('form', { class: 'add-row' }, icon('tag', 18), input, h('button', { class: 'btn small primary', type: 'submit' }, 'Add tag'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      if (store.all('tag').some((t) => t.data.name.toLowerCase() === v.toLowerCase())) { input.select(); return; }
      createTag(v); input.value = ''; input.focus();
    });
    const tags = tagsSorted();
    inner.append(
      h('div', { class: 'page-head' }, h('h1', null, 'Tags')),
      h('p', { style: { color: 'var(--ink-2)', marginTop: '-8px' } }, 'Tags work across tasks, notes, daily notes and whiteboard items. Open a tag to see everything that has it.'),
      form,
      tags.length ? h('div', { class: 'tag-table' }, tags.map(line)) : h('div', { class: 'empty' }, h('strong', null, 'No tags yet'), 'Add one above, or from any task, note or whiteboard item.'));
  };
  const line = (t) => {
    const name = h('input', { class: 'input', value: t.data.name, 'aria-label': 'Tag name' });
    name.addEventListener('change', () => { const v = name.value.trim(); if (v) store.update(t.id, { name: v }); else name.value = t.data.name; });
    const n = usage(t.id);
    return h('div', { class: 'tag-line' },
      h('div', { class: 'color-dots', role: 'radiogroup', 'aria-label': 'Tag color' }, TAG_COLORS.map((c) => h('button', { class: c === t.data.color ? 'on' : '', style: { background: c }, role: 'radio', 'aria-checked': String(c === t.data.color), 'aria-label': 'Color ' + c, onclick: () => store.update(t.id, { color: c }) }))),
      name,
      h('a', { class: 'count', href: '#/tag/' + t.id }, `${n} item${n === 1 ? '' : 's'}`),
      h('button', { class: 'icon-btn danger', 'aria-label': 'Delete tag ' + t.data.name, onclick: () => {
        if (!confirmAction(`Delete the tag "${t.data.name}"? It will be removed from ${n} item${n === 1 ? '' : 's'}.`)) return;
        for (const type of TAGGABLE) store.all(type, (d) => (d.tags || []).includes(t.id)).forEach((r) => store.update(r.id, { tags: r.data.tags.filter((x) => x !== t.id) }));
        store.remove(t.id);
      } }, icon('trash', 16)));
  };
  render();
  return { refresh: () => rerenderSafely(inner, render) };
}

export function tagView(root, params) {
  const page = h('div', { class: 'page' });
  const inner = h('div', { class: 'narrow' });
  page.appendChild(inner);
  root.appendChild(page);
  const render = () => {
    clear(inner);
    const tag = store.get(params.id);
    if (!tag) { inner.appendChild(h('div', { class: 'empty' }, h('strong', null, 'Tag not found'), h('a', { href: '#/tags' }, 'See all tags'))); return; }
    setTitle('#' + tag.data.name);
    const has = (d) => (d.tags || []).includes(tag.id);
    const tasks = store.all('task', has).sort((a, b) => (a.data.done ? 1 : 0) - (b.data.done ? 1 : 0));
    const notes = store.all('note', has).sort((a, b) => b.updated_at - a.updated_at);
    const dailies = store.all('daily', has).sort((a, b) => (a.data.date < b.data.date ? 1 : -1));
    const items = store.all('wbitem', has);
    inner.append(h('div', { class: 'page-head' }, h('h1', null, h('span', { class: 'tag', style: { '--tag': tag.data.color, fontSize: '22px', height: '36px', padding: '0 14px' } }, tag.data.name)), h('a', { class: 'btn ghost', href: '#/tags' }, 'All tags')));
    if (!tasks.length && !notes.length && !dailies.length && !items.length) inner.appendChild(h('div', { class: 'empty' }, 'Nothing has this tag yet.'));
    if (tasks.length) inner.appendChild(h('div', { class: 'result-group' }, h('h2', null, 'Tasks'), tasks.map((t) =>
      h('div', { class: 'result', style: t.data.done ? { opacity: .6 } : null }, checkBox(t), h('span', { class: 'r-title', style: { cursor: 'pointer' }, onclick: () => openTask(t.id) }, t.data.title), dueChip(t.data.due, t.data.done)))));
    if (notes.length) inner.appendChild(h('div', { class: 'result-group' }, h('h2', null, 'Notes'), notes.map((n) =>
      h('button', { class: 'result', onclick: () => go('/notes/all/' + n.id) }, icon('note', 16), h('span', { class: 'r-title' }, noteTitle(n.data)), h('span', { class: 'r-meta' }, htmlToText(n.data.html).slice(0, 50))))));
    if (dailies.length) inner.appendChild(h('div', { class: 'result-group' }, h('h2', null, 'Daily notes'), dailies.map((d) =>
      h('button', { class: 'result', onclick: () => go('/daily/' + d.data.date) }, icon('daily', 16), h('span', { class: 'r-title' }, relDay(d.data.date)), h('span', { class: 'r-meta' }, htmlToText(d.data.html).slice(0, 50))))));
    if (items.length) inner.appendChild(h('div', { class: 'result-group' }, h('h2', null, 'Whiteboard items'), items.map((i) => {
      const b = store.get(i.data.boardId);
      const label = i.data.kind === 'image' ? 'Image' : i.data.kind === 'card' ? (i.data.title || i.data.body || 'Card') : (i.data.text || 'Text');
      return h('button', { class: 'result', onclick: () => go(`/board/${i.data.boardId}/${i.id}`) }, icon(i.data.kind === 'image' ? 'image' : i.data.kind === 'card' ? 'card' : 'text', 16),
        h('span', { class: 'r-title' }, label.slice(0, 80)), h('span', { class: 'r-meta' }, b ? b.data.name : ''));
    })));
  };
  render();
  return { update() { return false; }, refresh: render };
}
