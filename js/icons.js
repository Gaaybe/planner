// Stroke icons drawn on a 24px grid.
const P = {
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  tasks: '<rect x="3.5" y="4" width="5" height="5" rx="1.2"/><path d="M12 6.5h8.5"/><rect x="3.5" y="14" width="5" height="5" rx="1.2"/><path d="M12 16.5h8.5"/><path d="M4.8 6.6l1.3 1.2 2.2-2.4"/>',
  note: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5"/><path d="M9 13h7M9 16.5h5"/>',
  folder: '<path d="M3.5 6.5h6l2 2h9v10.5h-17z"/>',
  daily: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13.5h3v3H8z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>',
  board: '<rect x="3" y="3.5" width="18" height="17" rx="2"/><rect x="6.5" y="7" width="5" height="4" rx=".8"/><rect x="13" y="12" width="5" height="5" rx=".8"/><path d="M9 11v4.5h4"/>',
  tag: '<path d="M3.5 11.6V4.5a1 1 0 011-1h7.1l9 9-8.1 8.1z"/><circle cx="8" cy="8" r="1.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.7"/><path d="M4 17.5l5-5 4 4 2.5-2.5 5 4.5"/>',
  text: '<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
  card: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><rect x="6.5" y="7" width="11" height="5" rx=".8"/><path d="M6.5 15h11M6.5 17.5h7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.4 9.6 4.5 4.5 0 007 18.5z"/>',
  cloudOff: '<path d="M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.4 9.6 4.5 4.5 0 007 18.5z"/><path d="M4 4l16 16"/>',
  device: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10.5 18h3"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  pointer: '<path d="M6 3.5l12 7.5-5.3 1.4 3 5.8-2.6 1.3-3-5.8L6 17.5z"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 013 0v5.5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7.5c0 4-2.5 6.5-6 6.5-2.8 0-4.3-1.4-5.6-3.6L4 13.6a1.5 1.5 0 012.6-1.5L8 14.5"/>',
  front: '<rect x="8" y="8" width="11.5" height="11.5" rx="1.5"/><path d="M5 15.5H4.5v-11h11V5"/>',
  bold: '<path d="M7 4.5h6a3.5 3.5 0 010 7H7zM7 11.5h7a4 4 0 010 8H7z"/>',
  italic: '<path d="M10 4.5h8M6 19.5h8M14.5 4.5l-5 15"/>',
  underline: '<path d="M7 4.5V11a5 5 0 0010 0V4.5M5.5 20h13"/>',
  strike: '<path d="M4.5 12h15M16.5 7.5c-.6-1.8-2.4-3-4.5-3-2.6 0-4.5 1.5-4.5 3.5 0 1.5 1 2.6 3 3.3M7.5 16.5c.6 1.8 2.4 3 4.5 3 2.6 0 4.5-1.4 4.5-3.5"/>',
  h: '<path d="M5 5v14M14 5v14M5 12h9M17.5 11.5l2.5-1.5V19"/>',
  ul: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><circle cx="5" cy="6.5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17.5" r="1"/>',
  ol: '<path d="M10 6.5h10M10 12h10M10 17.5h10M4.5 5l1.5-1v5M4 14c.4-.8 1-1.2 1.7-1.2 1.6 0 1.8 1.8.6 2.7L4 17.5h3"/>',
  checklist: '<rect x="3.5" y="4.5" width="5" height="5" rx="1"/><rect x="3.5" y="14.5" width="5" height="5" rx="1"/><path d="M4.8 7l1.2 1.2 2-2.2M11.5 7h9M11.5 17h9"/>',
  quote: '<path d="M5 17.5v-5c0-3 1.3-5 4-6M5 12.5h4.5v5H5zM14 17.5v-5c0-3 1.3-5 4-6M14 12.5h4.5v5H14z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7L5.3 5.3"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11M7 9l5-5 5 5M5 19.5h14"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  pin: '<path d="M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5zM12 13v7.5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1.1-1.6-1.1-2.7 0-1 .8-1.6 1.8-1.6h2.2a3.8 3.8 0 003.8-3.8C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  link: '<path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 01-13 5.1M4.5 12a7.5 7.5 0 0113-5.1M17.5 3v4h-4M6.5 21v-4h4"/>'
};

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}
