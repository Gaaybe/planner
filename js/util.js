// Small helpers shared by every view.

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// h('div', {class: 'x', onclick: fn}, child, 'text', [more])
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ---------- Dates (always local time, stored as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
export function ymd(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function today() { return ymd(new Date()); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function addMonths(s, n) { const d = parseYmd(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); }
export function startOfWeek(s, weekStart = 0) { const d = parseYmd(s); const diff = (d.getDay() - weekStart + 7) % 7; d.setDate(d.getDate() - diff); return ymd(d); }
export function isValidYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

const LOCALE = 'en-US';
export function fmtDate(s, opts) { return parseYmd(s).toLocaleDateString(LOCALE, opts); }
export function fmtLong(s) { return fmtDate(s, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
export function fmtShort(s) { return fmtDate(s, { month: 'short', day: 'numeric' }); }
export function weekdayShort(s) { return fmtDate(s, { weekday: 'short' }); }
export function monthTitle(s) { return fmtDate(s, { month: 'long', year: 'numeric' }); }
export function relDay(s) {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  const sameYear = s.slice(0, 4) === t.slice(0, 4);
  return fmtDate(s, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Rich text sanitizing ----------
const ALLOWED = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'CODE', 'PRE', 'SPAN', 'HR']);
export function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TITLE', 'META', 'LINK'].includes(child.tagName)) { child.remove(); continue; }
          walk(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        for (const attr of [...child.attributes]) {
          const n = attr.name;
          const keep = (n === 'href' && child.tagName === 'A' && /^(https?:|mailto:)/i.test(attr.value))
            || (n === 'class' && child.tagName === 'UL' && attr.value === 'checklist')
            || (n === 'data-checked' && child.tagName === 'LI');
          if (!keep) child.removeAttribute(n);
        }
        if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
        walk(child);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
export function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = (html || '').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, ' $&');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

// ---------- Misc ----------
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }

export const TAG_COLORS = ['#2B4ACB', '#C2410C', '#15803D', '#9333EA', '#BE185D', '#0E7490', '#A16207', '#4B5563'];
export const PAPER_COLORS = [
  { id: 'plain', label: 'Plain' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'pink', label: 'Pink' },
  { id: 'violet', label: 'Violet' }
];
