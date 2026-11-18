import * as store from '../store.js';
import { h, clear, debounce, lsGet, lsSet, relDay, ymd, PAPER_COLORS, toast } from '../util.js';
import { icon } from '../icons.js';
import { menu, confirmAction, openTagPicker, tagChips } from '../components.js';
import { go, setTitle } from '../nav.js';

const MIN_S = 0.1, MAX_S = 4;

// ---------- Image helpers ----------
// Shrinks very large photos so they upload and sync quickly.
async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth || 400, ht = img.naturalHeight || 300;
    const MAX = 2200;
    const keep = /gif|svg/.test(file.type) || (Math.max(w, ht) <= MAX && file.size < 1.5e6);
    if (keep) return { blob: file, w, h: ht };
    const k = Math.min(1, MAX / Math.max(w, ht));
    const cw = Math.round(w * k), ch = Math.round(ht * k);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(img, 0, 0, cw, ch);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let blob = await new Promise((res) => c.toBlob(res, type, 0.86));
    if (type === 'image/png' && blob.size > 3e6) blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    return { blob, w: cw, h: ch };
  } finally { URL.revokeObjectURL(url); }
}
function imageFiles(list) { return [...(list || [])].filter((f) => f.type && f.type.startsWith('image/')); }

function setImg(img, id, ph) {
  store.imageUrl(id).then((u) => {
    if (u) { img.src = u; if (ph) ph.remove(); }
    else if (ph) ph.textContent = 'Image will appear once synced';
  });
}

// ================= Whiteboard list =================
export function boardsView(root) {
  const page = h('div', { class: 'page' });
  root.appendChild(page);
  const render = () => {
    clear(page);
    setTitle('Whiteboards');
    const boards = store.all('board').sort((a, b) => b.updated_at - a.updated_at);
    page.append(
      h('div', { class: 'page-head' }, h('h1', null, 'Whiteboards'),
        h('button', { class: 'btn primary', onclick: () => { const r = store.create('board', { name: 'Untitled whiteboard' }); go('/board/' + r.id); } }, icon('plus', 16), 'New whiteboard')),
      boards.length ? h('div', { class: 'board-grid' }, boards.map(tile))
        : h('div', { class: 'empty' }, h('strong', null, 'No whiteboards yet'), 'A whiteboard is an endless canvas for images, text and cards.'));
  };
  const tile = (b) => {
    const items = store.all('wbitem', (d) => d.boardId === b.id);
    const thumb = h('div', { class: 'thumb' });
    if (items.length) {
      const minX = Math.min(...items.map((i) => i.data.x)), minY = Math.min(...items.map((i) => i.data.y));
      const maxX = Math.max(...items.map((i) => i.data.x + (i.data.w || 200))), maxY = Math.max(...items.map((i) => i.data.y + (i.data.w || 200) * (i.data.kind === 'image' ? (i.data.ar || 0.75) : 0.6)));
      const k = Math.min(200 / Math.max(1, maxX - minX), 96 / Math.max(1, maxY - minY), 0.4);
      for (const i of items.slice(0, 40)) {
        const w = (i.data.w || 200) * k, ht = (i.data.w || 200) * (i.data.kind === 'image' ? (i.data.ar || 0.75) : 0.6) * k;
        thumb.appendChild(h('i', { class: i.data.color ? 'paper-' + i.data.color : '', style: { left: 12 + (i.data.x - minX) * k + 'px', top: 12 + (i.data.y - minY) * k + 'px', width: Math.max(4, w) + 'px', height: Math.max(3, ht) + 'px' } }));
      }
    }
    return h('button', { class: 'board-tile', onclick: () => go('/board/' + b.id) }, thumb,
      h('div', { class: 'bt-body' }, h('div', { class: 'bt-name' }, b.data.name || 'Untitled whiteboard'),
        h('div', { class: 'bt-meta' }, `${items.length} item${items.length === 1 ? '' : 's'} · edited ${relDay(ymd(new Date(b.updated_at))).toLowerCase()}`)));
  };
  render();
  return { refresh: (types) => { if (types.has('board') || types.has('wbitem')) render(); } };
}

// ================= Whiteboard canvas =================
export function boardView(root, params) {
  const boardId = params.id;
  const board = store.get(boardId);
  if (!board) {
    root.appendChild(h('div', { class: 'empty', style: { margin: 'auto' } }, h('strong', null, 'Whiteboard not found'), h('a', { href: '#/boards' }, 'See all whiteboards')));
    return {};
  }
  setTitle(board.data.name || 'Whiteboard');

  const viewKey = 'planner.wbview.' + boardId;
  const view = Object.assign({ x: 0, y: 0, s: 1 }, lsGet(viewKey, {}));
  const saveView = debounce(() => lsSet(viewKey, view), 300);
  let selected = null;       // item id
  let editing = null;        // item id
  const els = new Map();     // id -> element

  const wb = h('div', { class: 'wb', tabindex: '0', 'aria-label': 'Whiteboard canvas' });
  const layer = h('div', { class: 'wb-layer' });
  const hint = h('div', { class: 'wb-hint' }, h('strong', null, 'This whiteboard is empty'), 'Add text, a card or an image below. Drag to move around, pinch or scroll to zoom.');
  const selBar = h('div', { class: 'wb-sel', hidden: true });
  const dropOverlay = h('div', { class: 'wb-drop', hidden: true }, 'Drop images to add them');
  wb.append(layer, hint);
  root.appendChild(wb);

  // ----- Top bar -----
  const nameInput = h('input', { class: 'wb-name', value: board.data.name || '', placeholder: 'Untitled whiteboard', 'aria-label': 'Whiteboard name' });
  nameInput.addEventListener('change', () => { store.update(boardId, { name: nameInput.value.trim() || 'Untitled whiteboard' }); setTitle(nameInput.value); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); e.stopPropagation(); });
  const moreBtn = h('button', { class: 'icon-btn', style: { background: 'var(--surface)', boxShadow: 'var(--shadow)', width: '38px', height: '38px' }, 'aria-label': 'Whiteboard options' }, icon('more', 18));
  moreBtn.addEventListener('click', () => menu(moreBtn, [
    { label: 'Delete whiteboard', icon: 'trash', danger: true, onClick: () => {
      if (!confirmAction(`Delete "${store.getData(boardId).name}" and everything on it?`)) return;
      store.all('wbitem', (d) => d.boardId === boardId).forEach((i) => store.remove(i.id));
      store.remove(boardId);
      go('/boards');
    } }
  ]));
  const top = h('div', { class: 'wb-top' }, h('a', { class: 'icon-btn', href: '#/boards', style: { background: 'var(--surface)', boxShadow: 'var(--shadow)', width: '38px', height: '38px' }, 'aria-label': 'All whiteboards' }, icon('left', 18)), nameInput, moreBtn);

  // ----- Bottom toolbar -----
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const zoomLabel = h('button', { class: 'zoom', title: 'Reset zoom to 100%', onclick: () => zoomTo(1) });
  const bar = h('div', { class: 'wb-bar', role: 'toolbar', 'aria-label': 'Whiteboard tools' },
    h('button', { class: 'icon-btn', title: 'Add text', 'aria-label': 'Add text', onclick: () => addItem('text') }, icon('text', 19)),
    h('button', { class: 'icon-btn', title: 'Add card', 'aria-label': 'Add card', onclick: () => addItem('card') }, icon('card', 19)),
    h('button', { class: 'icon-btn', title: 'Add image', 'aria-label': 'Add image', onclick: () => { fileInput.dataset.target = ''; fileInput.click(); } }, icon('image', 19)),
    h('span', { class: 'sep' }),
    h('button', { class: 'icon-btn', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomTo(view.s / 1.25) }, icon('zoomOut', 19)),
    zoomLabel,
    h('button', { class: 'icon-btn', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomTo(view.s * 1.25) }, icon('zoomIn', 19)),
    h('button', { class: 'icon-btn', title: 'Fit everything', 'aria-label': 'Fit everything on screen', onclick: () => fit() }, icon('fit', 19)),
    fileInput);
  wb.append(top, bar, selBar, dropOverlay);

  fileInput.addEventListener('change', async () => {
    const files = imageFiles(fileInput.files);
    const target = fileInput.dataset.target;
    fileInput.value = '';
    if (target) await addImagesToCard(target, files);
    else await addImages(files, centerWorld());
  });

  // ----- Coordinates -----
  const rect = () => wb.getBoundingClientRect();
  const toWorld = (cx, cy) => { const r = rect(); return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s }; };
  const centerWorld = () => { const r = rect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
  function applyView() {
    layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    const g = 22 * view.s;
    wb.style.backgroundSize = `${g}px ${g}px`;
    wb.style.backgroundPosition = `${view.x}px ${view.y}px`;
    zoomLabel.textContent = Math.round(view.s * 100) + '%';
    positionSelBar();
    saveView();
  }
  function zoomAt(cx, cy, s) {
    s = Math.min(MAX_S, Math.max(MIN_S, s));
    const r = rect();
    const px = cx - r.left, py = cy - r.top;
    view.x = px - (px - view.x) * (s / view.s);
    view.y = py - (py - view.y) * (s / view.s);
    view.s = s;
    applyView();
  }
  function zoomTo(s) { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, s); }
  function fit() {
    const items = boardItems();
    if (!items.length) { view.x = 0; view.y = 0; view.s = 1; applyView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const el = els.get(it.id);
      const w = it.data.w || 200, ht = el ? el.offsetHeight : 120;
      minX = Math.min(minX, it.data.x); minY = Math.min(minY, it.data.y);
      maxX = Math.max(maxX, it.data.x + w); maxY = Math.max(maxY, it.data.y + ht);
    }
    const r = rect(), pad = 80;
    const s = Math.min(MAX_S, Math.max(MIN_S, Math.min((r.width - pad * 2) / (maxX - minX || 1), (r.height - pad * 2 - 60) / (maxY - minY || 1), 1.5)));
    view.s = s;
    view.x = (r.width - (maxX - minX) * s) / 2 - minX * s;
    view.y = (r.height - 60 - (maxY - minY) * s) / 2 - minY * s;
    applyView();
  }

  // ----- Items -----
  const boardItems = () => store.all('wbitem', (d) => d.boardId === boardId);
  const maxZ = () => boardItems().reduce((m, i) => Math.max(m, i.data.z || 0), 0);
  // Moves a new item's spot diagonally until it doesn't sit on top of another item's corner.
  // Steps a new item (of size w×hh) down and to the right until it no longer
  // overlaps an existing item, so nothing lands on top of something else.
  function freeSpot(x, y, w, hh) {
    const boxes = boardItems().map((it) => {
      const el = els.get(it.id);
      return { x: it.data.x, y: it.data.y, w: it.data.w || 200, h: el ? el.offsetHeight : 120 };
    });
    const overlaps = (px, py) => boxes.some((b) => px < b.x + b.w + 12 && px + w + 12 > b.x && py < b.y + b.h + 12 && py + hh + 12 > b.y);
    for (let i = 0; i < 60 && overlaps(x, y); i++) { x += 30; y += 30; }
    return { x, y };
  }
  function addItem(kind, at) {
    const c0 = at || centerWorld();
    const off = kind === 'text' ? { x: 110, y: 20 } : { x: 140, y: 90 };
    const spot = at ? { x: c0.x - off.x, y: c0.y - off.y } : freeSpot(c0.x - off.x, c0.y - off.y, off.x * 2, off.y * 2);
    const c = { x: spot.x + off.x, y: spot.y + off.y };
    const base = { boardId, kind, z: maxZ() + 1, tags: [] };
    let rec;
    if (kind === 'text') rec = store.create('wbitem', { ...base, x: c.x - 110, y: c.y - 20, w: 220, text: '', color: 'none', big: false });
    else rec = store.create('wbitem', { ...base, x: c.x - 140, y: c.y - 90, w: 280, title: '', body: '', imageIds: [], color: 'plain' });
    store.update(boardId, {});
    renderItems();
    select(rec.id);
    enterEdit(rec.id);
    return rec;
  }
  async function addImages(files, at) {
    if (!files.length) return;
    let off = 0;
    for (const f of files) {
      try {
        const { blob, w, h: ht } = await prepareImage(f);
        const id = await store.saveBlob(blob);
        const dispW = Math.min(420, w);
        const spot = freeSpot(at.x - dispW / 2 + off, at.y - (dispW * ht / w) / 2 + off, dispW, dispW * ht / w);
        const rec = store.create('wbitem', { boardId, kind: 'image', imageId: id, ar: ht / w, x: spot.x, y: spot.y, w: dispW, z: maxZ() + 1, tags: [] });
        off += 28;
        renderItems();
        select(rec.id);
      } catch (e) { toast('Could not read that image'); }
    }
    store.update(boardId, {});
  }
  async function addImagesToCard(cardId, files) {
    const ids = [];
    for (const f of files) {
      try { const { blob } = await prepareImage(f); ids.push(await store.saveBlob(blob)); } catch (e) { toast('Could not read that image'); }
    }
    const d = store.getData(cardId);
    if (d && ids.length) store.update(cardId, { imageIds: [...(d.imageIds || []), ...ids] });
  }

  function buildItem(rec) {
    const d = rec.data;
    const el = h('div', { class: `wb-item ${d.kind}` + (d.kind === 'image' ? '' : ` paper-${d.color || (d.kind === 'text' ? 'none' : 'plain')}`) +(d.kind === 'text' && d.color && d.color !== 'none' ? ' colored' : ''), dataset: { id: rec.id, ts: String(rec.updated_at) } });
    el.style.left = d.x + 'px'; el.style.top = d.y + 'px'; el.style.width = (d.w || 200) + 'px'; el.style.zIndex = d.z || 1;
    if (d.kind === 'text') {
      el.appendChild(h('div', { class: 'wb-text' + (d.big ? ' big' : ''), 'data-placeholder': 'Type something', style: d.big ? { fontSize: '30px', lineHeight: '1.15' } : null }, d.text || ''));
    } else if (d.kind === 'image') {
      el.style.height = (d.w * (d.ar || 0.75)) + 'px';
      const img = h('img', { alt: '', draggable: 'false' });
      const ph = h('div', { class: 'empty', style: { position: 'absolute', inset: '0', padding: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--line-2)', borderRadius: '8px' } }, 'Loading image…');
      el.append(ph, img);
      setImg(img, d.imageId, ph);
    } else if (d.kind === 'card') {
      const imgs = d.imageIds || [];
      el.append(...[
        h('div', { class: 'card-title', 'data-placeholder': 'Card title' }, d.title || ''),
        imgs.length ? h('div', { class: 'card-imgs' }, imgs.map((iid) => {
          const img = h('img', { alt: '', draggable: 'false' });
          setImg(img, iid);
          return h('div', { class: 'ci' + (imgs.length === 1 ? ' single' : '') }, img,
            h('button', { class: 'rm', 'aria-label': 'Remove image from card', onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); store.update(rec.id, { imageIds: (store.getData(rec.id).imageIds || []).filter((x) => x !== iid) }); } }, icon('x', 12)));
        })) : null,
        h('div', { class: 'card-body', 'data-placeholder': 'Write something…' }, d.body || '')].filter(Boolean));
    }
    const chips = tagChips(d.tags, (id) => go('/tag/' + id));
    if (chips) el.appendChild(h('div', { class: 'item-tags' }, chips));
    el.appendChild(h('div', { class: 'wb-handle', 'aria-hidden': 'true' }));
    if (rec.id === selected) el.classList.add('selected');
    return el;
  }

  function renderItems() {
    const items = boardItems();
    hint.hidden = items.length > 0;
    const seen = new Set();
    for (const rec of items) {
      seen.add(rec.id);
      const existing = els.get(rec.id);
      if (existing && (existing.dataset.ts === String(rec.updated_at) || rec.id === editing || existing.classList.contains('dragging'))) continue;
      const el = buildItem(rec);
      if (existing) existing.replaceWith(el); else layer.appendChild(el);
      els.set(rec.id, el);
    }
    for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); if (selected === id) select(null); }
    positionSelBar();
  }

  // ----- Selection & editing -----
  function select(id) {
    if (selected && selected !== id) { const old = els.get(selected); if (old) old.classList.remove('selected'); if (editing === selected) exitEdit(); }
    selected = id;
    if (id) { const el = els.get(id); if (el) el.classList.add('selected'); }
    renderSelBar();
  }

  const editableParts = (el) => [...el.querySelectorAll('.wb-text, .card-title, .card-body')];
  const saveEditing = debounce(() => saveFromDom(editing), 500);
  function saveFromDom(id) {
    if (!id) return;
    const el = els.get(id), d = store.getData(id);
    if (!el || !d) return;
    const patch = {};
    if (d.kind === 'text') patch.text = el.querySelector('.wb-text').innerText.replace(/\n$/, '');
    if (d.kind === 'card') { patch.title = el.querySelector('.card-title').innerText.replace(/\n$/, ''); patch.body = el.querySelector('.card-body').innerText.replace(/\n$/, ''); }
    if (Object.keys(patch).some((k) => patch[k] !== d[k])) { store.update(id, patch); el.dataset.ts = String(store.get(id).updated_at); }
  }
  function enterEdit(id, target) {
    const el = els.get(id), d = store.getData(id);
    if (!el || !d || d.kind === 'image') return;
    if (editing && editing !== id) exitEdit();
    editing = id;
    el.classList.add('editing');
    const parts = editableParts(el);
    for (const p of parts) {
      p.setAttribute('contenteditable', supportsPlaintext ? 'plaintext-only' : 'true');
      p.oninput = () => saveEditing();
      p.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') { p.blur(); exitEdit(); } if (e.key === 'Enter' && p.classList.contains('card-title')) { e.preventDefault(); el.querySelector('.card-body').focus(); } };
    }
    const t = target && parts.includes(target) ? target : (d.kind === 'card' && !d.title ? parts[0] : parts[parts.length - 1]);
    t.focus();
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function exitEdit() {
    if (!editing) return;
    const id = editing;
    saveEditing.cancel();
    saveFromDom(id);
    editing = null;
    const el = els.get(id);
    if (el) {
      el.classList.remove('editing');
      for (const p of editableParts(el)) { p.removeAttribute('contenteditable'); p.oninput = null; p.onkeydown = null; }
    }
    const d = store.getData(id);
    // Remove empty text boxes the person abandoned.
    if (d && d.kind === 'text' && !d.text && !(d.tags || []).length) { store.remove(id); }
    else renderItems();
  }
  const supportsPlaintext = (() => { const d = document.createElement('div'); d.setAttribute('contenteditable', 'plaintext-only'); return d.contentEditable === 'plaintext-only'; })();

  layer.addEventListener('focusout', (e) => {
    if (!editing) return;
    const el = els.get(editing);
    if (el && (!e.relatedTarget || !el.contains(e.relatedTarget)) && !selBar.contains(e.relatedTarget)) setTimeout(() => { if (editing && !el.contains(document.activeElement)) exitEdit(); }, 0);
  });

  // ----- Selection toolbar -----
  function renderSelBar() {
    clear(selBar);
    const rec = selected && store.get(selected);
    if (!rec) { selBar.hidden = true; return; }
    const d = rec.data;
    const btn = (ic, label, fn, on) => h('button', { class: 'icon-btn' + (on ? ' on' : ''), title: label, 'aria-label': label, onpointerdown: (e) => e.preventDefault(), onclick: fn }, icon(ic, 17));
    if (d.kind !== 'image') {
      const colors = d.kind === 'text' ? [{ id: 'none', label: 'No background' }, ...PAPER_COLORS.filter((c) => c.id !== 'plain')] : PAPER_COLORS;
      for (const c of colors) selBar.appendChild(h('button', { class: 'sw-btn paper-' + c.id + ((d.color || (d.kind === 'text' ? 'none' : 'plain')) === c.id ? ' on' : ''), style: c.id === 'none' ? { background: 'linear-gradient(135deg, var(--surface) 45%, var(--danger) 47%, var(--danger) 53%, var(--surface) 55%)' } : null, title: c.label, 'aria-label': 'Color: ' + c.label, onpointerdown: (e) => e.preventDefault(), onclick: () => store.update(rec.id, { color: c.id }) }));
      selBar.appendChild(h('span', { class: 'sep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)', margin: '4px' } }));
    }
    if (d.kind === 'text') selBar.appendChild(btn('h', d.big ? 'Normal text' : 'Big text', () => store.update(rec.id, { big: !d.big }), d.big));
    if (d.kind === 'card') selBar.appendChild(btn('image', 'Add image to card', () => { fileInput.dataset.target = rec.id; fileInput.click(); }));
    if (d.kind !== 'image') selBar.appendChild(btn('text', 'Edit text', () => enterEdit(rec.id)));
    const tagBtn = btn('tag', 'Tags', () => openTagPicker(tagBtn, () => store.getData(rec.id)?.tags || [], (ids) => store.update(rec.id, { tags: ids })));
    selBar.appendChild(tagBtn);
    selBar.appendChild(btn('front', 'Bring to front', () => store.update(rec.id, { z: maxZ() + 1 })));
    selBar.appendChild(btn('trash', 'Delete', () => deleteSelected()));
    selBar.hidden = false;
    positionSelBar();
  }
  function positionSelBar() {
    if (!selected || selBar.hidden) return;
    const el = els.get(selected);
    if (!el) return;
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top), w = el.offsetWidth;
    let sx = view.x + (x + w / 2) * view.s, sy = view.y + y * view.s - 12;
    const r = rect();
    sx = Math.min(Math.max(sx, selBar.offsetWidth / 2 + 8), r.width - selBar.offsetWidth / 2 - 8);
    if (sy - selBar.offsetHeight < 58) sy = view.y + (y + el.offsetHeight) * view.s + selBar.offsetHeight + 12;
    selBar.style.left = sx + 'px'; selBar.style.top = sy + 'px';
  }
  function deleteSelected() {
    if (!selected) return;
    const id = selected;
    if (editing === id) { saveEditing.cancel(); editing = null; }
    select(null);
    store.remove(id);
  }

  // ----- Pointer interaction: pan, pinch, drag, resize -----
  const pointers = new Map();
  let gesture = null;
  let lastDownTarget = null; // pointer capture retargets clicks, so remember the real target
  wb.addEventListener('pointerdown', (e) => {
    lastDownTarget = e.target;
    if (top.contains(e.target) || bar.contains(e.target) || selBar.contains(e.target)) return;
    const itemEl = e.target.closest('.wb-item');
    // Clicks inside text being edited behave like normal text editing.
    if (itemEl && itemEl.dataset.id === editing && e.target.closest('[contenteditable]')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { wb.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pointers.size === 2) {
      // Second finger: switch to pinch-zoom, cancelling any drag.
      if (gesture && gesture.kind === 'drag') cancelDrag();
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, s: view.s, vx: view.x, vy: view.y };
      return;
    }
    if (pointers.size > 2) return;
    if (e.button !== 0 && e.pointerType === 'mouse' && e.button !== 1) return;
    if (itemEl && e.button !== 1) {
      const id = itemEl.dataset.id;
      const d = store.getData(id);
      if (!d) return;
      if (editing && editing !== id) exitEdit();
      const wasSelected = selected === id;
      select(id);
      if (e.target.classList.contains('wb-handle')) {
        gesture = { kind: 'resize', id, el: itemEl, sx: e.clientX, w0: d.w || 200, ar: d.ar };
      } else {
        gesture = { kind: 'drag', id, el: itemEl, sx: e.clientX, sy: e.clientY, x0: d.x, y0: d.y, moved: false, wasSelected, target: e.target };
      }
      e.preventDefault();
      if (!editing) wb.focus({ preventScroll: true });
    } else {
      if (editing) exitEdit();
      select(null);
      wb.focus({ preventScroll: true });
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      wb.classList.add('panning');
    }
  });
  wb.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.min(MAX_S, Math.max(MIN_S, gesture.s * dist / gesture.dist));
      const r = rect();
      const px = gesture.mid.x - r.left, py = gesture.mid.y - r.top;
      view.s = s;
      view.x = px - (px - gesture.vx) * (s / gesture.s) + (mid.x - gesture.mid.x);
      view.y = py - (py - gesture.vy) * (s / gesture.s) + (mid.y - gesture.mid.y);
      applyView();
    } else if (gesture.kind === 'pan') {
      view.x = gesture.vx + (e.clientX - gesture.sx);
      view.y = gesture.vy + (e.clientY - gesture.sy);
      applyView();
    } else if (gesture.kind === 'drag') {
      const dx = (e.clientX - gesture.sx) / view.s, dy = (e.clientY - gesture.sy) / view.s;
      if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < 4) return;
      gesture.moved = true;
      gesture.el.classList.add('dragging');
      gesture.el.style.left = gesture.x0 + dx + 'px';
      gesture.el.style.top = gesture.y0 + dy + 'px';
      highlightDropCard(e, gesture.id);
      positionSelBar();
    } else if (gesture.kind === 'resize') {
      const w = Math.max(80, gesture.w0 + (e.clientX - gesture.sx) / view.s);
      gesture.el.style.width = w + 'px';
      if (gesture.ar) gesture.el.style.height = w * gesture.ar + 'px';
      positionSelBar();
    }
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.kind === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    const g = gesture;
    gesture = null;
    wb.classList.remove('panning');
    if (g.kind === 'drag') {
      g.el.classList.remove('dragging');
      if (g.moved) {
        const dropCard = cardUnder(e, g.id);
        clearDropHighlight();
        const d = store.getData(g.id);
        if (dropCard && d && d.kind === 'image') {
          // Dropping an image onto a card puts the image inside the card.
          const cd = store.getData(dropCard);
          store.update(dropCard, { imageIds: [...(cd.imageIds || []), d.imageId] });
          select(null);
          store.remove(g.id);
        } else {
          store.update(g.id, { x: parseFloat(g.el.style.left), y: parseFloat(g.el.style.top) });
        }
      } else if (g.wasSelected && e.type === 'pointerup') {
        enterEdit(g.id, g.target.closest('.wb-text, .card-title, .card-body'));
      }
    } else if (g.kind === 'resize') {
      store.update(g.id, { w: parseFloat(g.el.style.width) });
    }
  };
  function cancelDrag() {
    if (!gesture) return;
    const d = store.getData(gesture.id);
    if (d) { gesture.el.style.left = d.x + 'px'; gesture.el.style.top = d.y + 'px'; gesture.el.classList.remove('dragging'); }
    clearDropHighlight();
    gesture = null;
  }
  wb.addEventListener('pointerup', endPointer);
  wb.addEventListener('pointercancel', endPointer);
  wb.addEventListener('dblclick', (e) => {
    const t = lastDownTarget && wb.contains(lastDownTarget) ? lastDownTarget : e.target;
    const itemEl = t.closest('.wb-item');
    if (itemEl) { if (editing !== itemEl.dataset.id) enterEdit(itemEl.dataset.id, t.closest('.wb-text, .card-title, .card-body')); return; }
    if (top.contains(t) || bar.contains(t) || selBar.contains(t)) return;
    // Double-click empty space to drop a text box there.
    addItem('text', (() => { const p = toWorld(e.clientX, e.clientY); return { x: p.x + 110, y: p.y + 20 }; })());
  });

  let dropHL = null;
  function cardUnder(e, exceptId) {
    const d = store.getData(exceptId);
    if (!d || d.kind !== 'image') return null;
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('card') && n.dataset.id !== exceptId);
    return el ? el.dataset.id : null;
  }
  function highlightDropCard(e, id) {
    const c = cardUnder(e, id);
    if (dropHL && dropHL !== c) { const el = els.get(dropHL); if (el) el.classList.remove('drop-target'); }
    dropHL = c;
    if (c) { const el = els.get(c); if (el) el.classList.add('drop-target'); }
  }
  function clearDropHighlight() { if (dropHL) { const el = els.get(dropHL); if (el) el.classList.remove('drop-target'); } dropHL = null; }

  // Wheel: scroll to pan, pinch on a trackpad (or Ctrl+scroll) to zoom.
  wb.addEventListener('wheel', (e) => {
    if (top.contains(e.target) || bar.contains(e.target)) return;
    if (editing && e.target.closest('[contenteditable]')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, view.s * Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.008));
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }, { passive: false });
  // Safari trackpad pinch
  let gs = null;
  wb.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = view.s; });
  wb.addEventListener('gesturechange', (e) => { e.preventDefault(); if (gs && pointers.size < 2) zoomAt(e.clientX, e.clientY, gs * e.scale); });
  wb.addEventListener('gestureend', (e) => { e.preventDefault(); gs = null; });

  // Keyboard
  wb.addEventListener('keydown', (e) => {
    if (editing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Enter' && selected) { e.preventDefault(); enterEdit(selected); }
    else if ((e.key === '=' || e.key === '+') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomTo(view.s * 1.25); }
    else if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomTo(view.s / 1.25); }
    else if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomTo(1); }
  });

  // Drag and drop images from the computer
  let dragDepth = 0;
  wb.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; dropOverlay.hidden = false; e.preventDefault(); } });
  wb.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  wb.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay.hidden = true; });
  wb.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; dropOverlay.hidden = true;
    const files = imageFiles(e.dataTransfer.files);
    if (!files.length) return;
    const cardEl = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('card'));
    if (cardEl) await addImagesToCard(cardEl.dataset.id, files);
    else await addImages(files, toWorld(e.clientX, e.clientY));
  });

  // Paste images (and plain text as a new text box)
  const onPaste = async (e) => {
    if (!wb.isConnected) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    const files = imageFiles(e.clipboardData && e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      const sel = selected && store.getData(selected);
      if (sel && sel.kind === 'card') await addImagesToCard(selected, files);
      else await addImages(files, centerWorld());
      return;
    }
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text && text.trim()) {
      e.preventDefault();
      const c = centerWorld();
      const rec = store.create('wbitem', { boardId, kind: 'text', x: c.x - 120, y: c.y - 20, w: 240, text: text.trim(), color: 'none', big: false, z: maxZ() + 1, tags: [] });
      renderItems(); select(rec.id);
    }
  };
  document.addEventListener('paste', onPaste);

  const ro = new ResizeObserver(() => positionSelBar());
  ro.observe(wb);
  const offBlobs = store.onBlobChange(() => { for (const [, el] of els) el.dataset.ts = ''; renderItems(); });

  applyView();
  renderItems();
  if (!lsGet(viewKey, null)) requestAnimationFrame(() => fit());
  if (params.focus && store.get(params.focus)) {
    requestAnimationFrame(() => {
      const d = store.getData(params.focus), el = els.get(params.focus), r = rect();
      view.s = 1;
      view.x = r.width / 2 - (d.x + (d.w || 200) / 2);
      view.y = r.height / 2 - (d.y + (el ? el.offsetHeight : 100) / 2);
      applyView();
      select(params.focus);
    });
  }

  return {
    update() { return false; },
    refresh(types, source) {
      if (types.has('wbitem') || types.has('tag')) {
        if (types.has('tag')) for (const [, el] of els) el.dataset.ts = '';
        renderItems();
        if (selected && !selBar.contains(document.activeElement)) renderSelBar();
      }
      if (types.has('board') && source === 'remote') {
        const b = store.get(boardId);
        if (!b) { go('/boards'); return; }
        if (document.activeElement !== nameInput) nameInput.value = b.data.name || '';
      }
    },
    destroy() {
      if (editing) exitEdit();
      document.removeEventListener('paste', onPaste);
      ro.disconnect();
      offBlobs();
    }
  };
}
