// Reusable UI pieces: popovers, tag chips and the tag picker.
import * as store from './store.js';
import { h, clear, TAG_COLORS } from './util.js';
import { icon } from './icons.js';

// ---------- Popover ----------
let openPop = null;
export function closePopover() { if (openPop) { openPop.close(); openPop = null; } }

export function popover(anchor, build, opts = {}) {
  closePopover();
  const el = h('div', { class: 'popover ' + (opts.class || ''), role: 'dialog' });
  document.body.appendChild(el);
  const close = () => {
    el.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    window.removeEventListener('resize', close);
    if (opts.onClose) opts.onClose();
  };
  const place = () => {
    if (!anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, ht = el.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8) top = Math.max(8, r.top - ht - 6);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  };
  const api = { el, close, reposition: place };
  openPop = api;
  build(el, api);
  place();
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) { closePopover(); } };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); } };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', close);
  });
  return api;
}

// Simple action menu: items = [{label, icon, onClick, danger}]
export function menu(anchor, items) {
  return popover(anchor, (el, api) => {
    for (const it of items) {
      if (!it) continue;
      el.appendChild(h('button', { class: 'pop-row' + (it.danger ? ' btn danger' : ''), style: it.danger ? { border: 0, height: 'auto' } : null, onclick: () => { api.close(); openPop = null; it.onClick(); } },
        it.icon ? icon(it.icon, 16) : null, it.label));
    }
  }, { class: 'menu' });
}

// ---------- Tags ----------
export function tagsSorted() {
  return store.all('tag').sort((a, b) => a.data.name.localeCompare(b.data.name));
}
export function createTag(name) {
  const used = store.all('tag').length;
  return store.create('tag', { name: name.trim(), color: TAG_COLORS[used % TAG_COLORS.length] });
}

export function tagChip(id, onRemove, onClick) {
  const t = store.get(id);
  if (!t) return null;
  const chip = h(onClick ? 'button' : 'span', { class: 'tag', style: { '--tag': t.data.color }, onclick: onClick ? (e) => { e.stopPropagation(); onClick(id); } : null },
    t.data.name,
    onRemove ? h('button', { class: 'x', 'aria-label': 'Remove tag ' + t.data.name, onclick: (e) => { e.stopPropagation(); onRemove(id); } }, icon('x', 12)) : null);
  chip.style.setProperty('--tag', t.data.color);
  return chip;
}

export function tagChips(ids, onClick) {
  const valid = (ids || []).filter((id) => store.get(id));
  if (!valid.length) return null;
  return h('span', { class: 'tags' }, valid.map((id) => tagChip(id, null, onClick)));
}

// Editable tag list: chips with remove buttons plus an "Add tag" button.
export function tagEditor(getIds, setIds, opts = {}) {
  const wrap = h('div', { class: 'tags' });
  const render = () => {
    clear(wrap);
    const ids = (getIds() || []).filter((id) => store.get(id));
    for (const id of ids) wrap.appendChild(tagChip(id, (rid) => { setIds(ids.filter((x) => x !== rid)); render(); }));
    const add = h('button', { class: 'tag-add', type: 'button' }, icon('plus', 12), opts.label || 'Tag');
    add.addEventListener('click', (e) => { e.stopPropagation(); openTagPicker(add, getIds, (next) => { setIds(next); render(); }); });
    wrap.appendChild(add);
  };
  render();
  wrap.refresh = render;
  return wrap;
}

export function openTagPicker(anchor, getIds, setIds) {
  popover(anchor, (el, api) => {
    const input = h('input', { class: 'input', placeholder: 'Find or create a tag', 'aria-label': 'Tag name' });
    const list = h('div', { class: 'popover-list' });
    let hl = 0;
    const rows = () => {
      const q = input.value.trim().toLowerCase();
      const tags = tagsSorted().filter((t) => !q || t.data.name.toLowerCase().includes(q));
      const exact = tags.some((t) => t.data.name.toLowerCase() === q);
      const out = tags.map((t) => ({ kind: 'tag', t }));
      if (q && !exact) out.push({ kind: 'new', name: input.value.trim() });
      return out;
    };
    const toggle = (id) => {
      const ids = getIds() || [];
      setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
      render();
    };
    const choose = (row) => {
      if (row.kind === 'new') { const t = createTag(row.name); input.value = ''; toggle(t.id); }
      else toggle(row.t.id);
      input.focus();
    };
    const render = () => {
      clear(list);
      const r = rows();
      hl = Math.min(hl, Math.max(0, r.length - 1));
      const ids = getIds() || [];
      if (!r.length) list.appendChild(h('div', { class: 'empty', style: { padding: '12px 4px' } }, 'Type a name to create your first tag.'));
      r.forEach((row, i) => {
        list.appendChild(row.kind === 'new'
          ? h('button', { class: 'pop-row' + (i === hl ? ' hl' : ''), onclick: () => choose(row) }, icon('plus', 14), `Create "${row.name}"`)
          : h('button', { class: 'pop-row' + (i === hl ? ' hl' : ''), onclick: () => choose(row) },
            h('span', { class: 'sw', style: { background: row.t.data.color } }), row.t.data.name,
            ids.includes(row.t.id) ? h('span', { class: 'chk' }, icon('check', 14)) : null));
      });
      api.reposition();
    };
    input.addEventListener('input', () => { hl = 0; render(); });
    input.addEventListener('keydown', (e) => {
      const r = rows();
      if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, r.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && r[hl]) { choose(r[hl]); e.preventDefault(); }
    });
    el.append(input, list);
    render();
    input.focus();
  });
}

// Confirm dialog using the native one (works everywhere, including iPad).
export function confirmAction(msg) { return window.confirm(msg); }
