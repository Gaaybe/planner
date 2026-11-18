// Rich text editor for notes and daily notes (bold, headings, lists, checklists).
import { h, debounce, sanitizeHtml } from './util.js';
import { icon } from './icons.js';

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }

const activeEditors = new Set();
// Save any pending typing before the page is hidden or closed.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAllEditors(); });
window.addEventListener('pagehide', () => flushAllEditors());
export function flushAllEditors() { for (const ed of activeEditors) ed.flush(); }

export function createEditor({ html = '', placeholder = 'Start writing…', onChange, compact = false }) {
  const rich = h('div', { class: 'rich', contenteditable: 'true', spellcheck: 'true', 'data-placeholder': placeholder, role: 'textbox', 'aria-multiline': 'true' });
  rich.innerHTML = sanitizeHtml(html);
  let last = rich.innerHTML;

  const emit = debounce(() => {
    // Remove stray <br> so the placeholder shows when the note is empty.
    if (rich.textContent.trim() === '' && !rich.querySelector('li,hr')) rich.innerHTML = '';
    const cur = rich.innerHTML;
    if (cur === last) return;
    last = cur;
    onChange(sanitizeHtml(cur));
  }, 400);

  const exec = (cmd, val = null) => { rich.focus(); document.execCommand(cmd, false, val); emit(); updateState(); };
  const block = (tag) => {
    const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    exec('formatBlock', cur === tag ? 'p' : tag);
  };
  const checklist = () => {
    rich.focus();
    let ul = closest('UL');
    if (ul && ul.classList.contains('checklist')) { document.execCommand('insertUnorderedList'); emit(); updateState(); return; }
    if (!ul) { document.execCommand('insertUnorderedList'); ul = closest('UL'); }
    if (ul) ul.classList.add('checklist');
    emit(); updateState();
  };
  const closest = (tag) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n !== rich) { if (n.nodeType === 1 && n.tagName === tag) return n; n = n.parentNode; }
    return null;
  };

  const buttons = [
    ['bold', 'Bold', () => exec('bold'), 'bold'],
    ['italic', 'Italic', () => exec('italic'), 'italic'],
    ['underline', 'Underline', () => exec('underline'), 'underline'],
    ['strike', 'Strikethrough', () => exec('strikeThrough'), 'strikeThrough'],
    'sep',
    ['h', 'Heading', () => block('h2'), null],
    ['quote', 'Quote', () => block('blockquote'), null],
    'sep',
    ['ul', 'Bulleted list', () => exec('insertUnorderedList'), null],
    ['ol', 'Numbered list', () => exec('insertOrderedList'), 'insertOrderedList'],
    ['checklist', 'Checklist', checklist, null]
  ];
  const btnEls = {};
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    buttons.map((b) => {
      if (b === 'sep') return h('span', { class: 'sep' });
      const [ic, label, fn, state] = b;
      const el = h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onmousedown: (e) => e.preventDefault(), onclick: fn }, icon(ic, 17));
      if (state) btnEls[state] = el;
      return el;
    }));

  const updateState = () => {
    for (const [cmd, el] of Object.entries(btnEls)) {
      let on = false;
      try { on = document.queryCommandState(cmd); } catch (e) { /* ignore */ }
      el.classList.toggle('on', on && rich.contains(window.getSelection().anchorNode));
    }
  };

  rich.addEventListener('input', () => emit());
  rich.addEventListener('blur', () => emit.flush());
  document.addEventListener('selectionchange', updateState);
  rich.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); exec('bold'); }
    else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); exec('italic'); }
    else if (mod && e.key.toLowerCase() === 'u') { e.preventDefault(); exec('underline'); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      // New checklist items start unchecked.
      setTimeout(() => { const li = closest('LI'); if (li && li.dataset.checked) delete li.dataset.checked; });
    } else if (e.key === ' ') {
      markdownShortcut(e);
    }
  });
  // Markdown-style shortcuts at the start of a line: "- ", "1. ", "[] ", "# ", "> "
  const markdownShortcut = (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3 || !rich.contains(node)) return;
    const before = node.textContent.slice(0, sel.anchorOffset);
    const blockEl = node.parentElement && node.parentElement.closest('p,div,h1,h2,h3,li,blockquote');
    if (blockEl && blockEl !== rich && blockEl.firstChild !== node) return;
    const map = { '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'check', '#': 'h2', '>': 'quote' };
    const kind = map[before];
    if (!kind || (blockEl && blockEl.tagName === 'LI')) return;
    e.preventDefault();
    node.textContent = node.textContent.slice(sel.anchorOffset);
    const r = document.createRange(); r.setStart(node, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    if (kind === 'ul') exec('insertUnorderedList');
    else if (kind === 'ol') exec('insertOrderedList');
    else if (kind === 'check') checklist();
    else if (kind === 'h2') block('h2');
    else if (kind === 'quote') block('blockquote');
  };
  rich.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('ul.checklist > li');
    if (!li) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left < 24) {
      if (li.dataset.checked === 'true') delete li.dataset.checked; else li.dataset.checked = 'true';
      emit();
    }
  });
  rich.addEventListener('paste', (e) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
    else document.execCommand('insertText', false, text);
    emit();
  });

  const el = h('div', { class: 'editor-wrap' + (compact ? ' editor-compact' : '') }, toolbar, rich);
  const api = {
    el, rich,
    focus: () => { rich.focus(); const r = document.createRange(); r.selectNodeContents(rich); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); },
    flush: () => emit.flush(),
    setHtml: (v) => { if (document.activeElement === rich) return; const clean = sanitizeHtml(v); if (clean !== rich.innerHTML) { rich.innerHTML = clean; last = rich.innerHTML; } },
    destroy: () => { emit.flush(); activeEditors.delete(api); document.removeEventListener('selectionchange', updateState); }
  };
  activeEditors.add(api);
  return api;
}
