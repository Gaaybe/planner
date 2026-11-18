import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, clear, toast } from '../util.js';
import { icon } from '../icons.js';
import { setTitle, getTheme, setTheme, prefs, setPref } from '../nav.js';

export default function settingsView(root) {
  const page = h('div', { class: 'page' });
  const inner = h('div', { class: 'narrow' });
  page.appendChild(inner);
  root.appendChild(page);
  setTitle('Settings');
  const syncSec = h('section', { class: 'settings-sec' });
  let busy = false;

  function renderSync() {
    clear(syncSec);
    const st = sync.getState();
    const cfg = sync.getConfig();
    syncSec.append(h('h2', null, 'Sync between devices'),
      h('p', null, 'Everything is always saved on this device first, so the app works offline. Connect your Supabase project and sign in on each device to keep your computer and iPad in sync.'));
    syncSec.appendChild(h('div', { class: 'status-line' }, icon(st.user ? 'cloud' : cfg ? 'cloudOff' : 'device', 18),
      h('span', null, st.user ? `${st.message} · signed in as ${st.user.email}` : st.message),
      st.lastSync && st.user ? h('span', { style: { marginLeft: 'auto', color: 'var(--muted)', fontSize: '12.5px' } }, 'Last sync ' + new Date(st.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : null));

    if (!cfg) {
      const url = h('input', { class: 'input', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off', spellcheck: 'false' });
      const key = h('input', { class: 'input', placeholder: 'Publishable (anon) key', autocomplete: 'off', spellcheck: 'false' });
      const form = h('form', { class: 'form-grid' },
        h('label', null, 'Project URL', url),
        h('label', null, 'Publishable key', key),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Connect project')));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!/^https:\/\/.+/.test(url.value.trim()) || key.value.trim().length < 20) { toast('Check the project URL and key'); return; }
        sync.saveConfig(url.value, key.value);
        await sync.init();
        renderSync();
      });
      syncSec.append(form, h('p', { style: { marginTop: '12px', fontSize: '13.5px' } }, 'Find both in Supabase under Project Settings → API. The README explains the one-time setup.'));
      return;
    }
    if (!st.user) {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email' });
      const pass = h('input', { class: 'input', type: 'password', placeholder: 'At least 8 characters', autocomplete: 'current-password' });
      const run = async (fn) => {
        if (busy) return;
        if (!email.value || pass.value.length < 6) { toast('Enter your email and password'); return; }
        busy = true;
        try {
          const r = await fn(email.value.trim(), pass.value);
          if (r === 'confirm') toast('Check your email to confirm the account, then sign in', 5000);
          else toast('Signed in. Syncing your data…');
        } catch (err) { toast(err.message || 'Sign in failed', 4000); }
        busy = false;
        renderSync();
      };
      const form = h('form', { class: 'form-grid' },
        h('label', null, 'Email', email), h('label', null, 'Password', pass),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'),
          h('button', { class: 'btn', type: 'button', onclick: () => run(sync.signUp) }, 'Create account')));
      form.addEventListener('submit', (e) => { e.preventDefault(); run(sync.signIn); });
      syncSec.append(form,
        h('div', { class: 'form-actions', style: { marginTop: '12px' } },
          cfg.fromFile ? null : h('button', { class: 'btn small ghost', onclick: () => { sync.clearConfig(); renderSync(); } }, 'Use a different Supabase project')));
      return;
    }
    syncSec.appendChild(h('div', { class: 'form-actions' },
      h('button', { class: 'btn primary', onclick: async () => { await sync.syncNow(); renderSync(); } }, icon('refresh', 16), 'Sync now'),
      h('button', { class: 'btn', onclick: async () => { await sync.signOut(); renderSync(); } }, 'Sign out')));
  }

  const themeSec = () => {
    const cur = getTheme();
    return h('section', { class: 'settings-sec' }, h('h2', null, 'Appearance'),
      h('p', null, 'Follow your device setting, or pick one.'),
      h('div', { class: 'seg' }, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) =>
        h('button', { class: cur === v ? 'on' : '', onclick: (e) => { setTheme(v); [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, l))));
  };

  const weekSec = () => h('section', { class: 'settings-sec' }, h('h2', null, 'Calendar'),
    h('p', null, 'First day of the week.'),
    h('div', { class: 'seg' }, [[0, 'Sunday'], [1, 'Monday']].map(([v, l]) =>
      h('button', { class: prefs.weekStart === v ? 'on' : '', onclick: (e) => { setPref('weekStart', v); [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, l))));

  const backupSec = () => {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      try { await store.importAll(JSON.parse(await f.text())); toast('Backup imported'); } catch (e) { toast(e.message || 'Could not import that file', 4000); }
    });
    return h('section', { class: 'settings-sec' }, h('h2', null, 'Backup'),
      h('p', null, 'Download everything (including images) as one file, or restore from a backup. Importing merges with what is already here.'),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn', onclick: async () => {
          const data = await store.exportAll();
          const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
          const a = h('a', { href: url, download: `planner-backup-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } }, icon('download', 16), 'Download backup'),
        h('button', { class: 'btn', onclick: () => file.click() }, icon('upload', 16), 'Import backup'), file));
  };

  const installSec = () => h('section', { class: 'settings-sec', style: { borderBottom: 0 } }, h('h2', null, 'Install as an app'),
    h('p', null, 'On iPad: open this page in Safari, tap Share, then Add to Home Screen. On a computer: in Chrome or Edge, use the install icon in the address bar. Installed, it opens in its own window and works offline.'));

  inner.append(h('div', { class: 'page-head' }, h('h1', null, 'Settings')), syncSec, themeSec(), weekSec(), backupSec(), installSec());
  renderSync();
  const off = sync.onStatus(() => { if (!syncSec.contains(document.activeElement)) renderSync(); });
  return { destroy: off };
}
