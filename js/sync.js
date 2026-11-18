// Sync engine: pushes local changes to Supabase and pulls changes made on
// other devices. Conflicts are settled per record: the newest edit wins.

import * as store from './store.js';
import { lsGet, lsSet, debounce } from './util.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const TABLE = 'records';
const BUCKET = 'images';

let sb = null;          // Supabase client
let user = null;
let channel = null;
let running = false;
let again = false;
let timer = null;

const state = { status: 'local', message: 'Saved on this device', lastSync: lsGet('planner.lastSync', null) };
const statusListeners = new Set();
export function onStatus(fn) { statusListeners.add(fn); fn(state); return () => statusListeners.delete(fn); }
function setStatus(status, message) {
  state.status = status; state.message = message;
  for (const fn of statusListeners) fn(state);
}
export function getState() { return { ...state, user, configured: !!getConfig() }; }

export function getConfig() {
  const saved = lsGet('planner.supabase', null);
  if (saved && saved.url && saved.key) return saved;
  const c = window.PLANNER_CONFIG || {};
  if (c.supabaseUrl && c.supabaseKey) return { url: c.supabaseUrl, key: c.supabaseKey, fromFile: true };
  return null;
}
export function saveConfig(url, key) {
  lsSet('planner.supabase', { url: url.trim().replace(/\/+$/, ''), key: key.trim() });
  sb = null; user = null;
}
export function clearConfig() { try { localStorage.removeItem('planner.supabase'); } catch (e) { /* ignore */ } sb = null; user = null; }

async function client() {
  if (sb) return sb;
  const cfg = getConfig();
  if (!cfg) return null;
  const mod = await import(SUPABASE_CDN);
  sb = mod.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'planner.auth' } });
  sb.auth.onAuthStateChange((event, session) => {
    const prev = user && user.id;
    user = session ? session.user : null;
    if (user && user.id !== prev) startRealtime();
    if (!user) stopRealtime();
  });
  return sb;
}

let listening = false;
export async function init() {
  store.setDirtyHook(schedule);
  store.setBlobFetcher(fetchBlob);
  if (!listening) {
    listening = true;
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => setStatus('offline', 'Offline: changes are saved on this device'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
    setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  }
  if (!getConfig()) { setStatus('local', 'Saved on this device'); return; }
  try {
    const c = await client();
    const { data } = await c.auth.getSession();
    user = data.session ? data.session.user : null;
    if (user) { startRealtime(); store.notifyBlobsAvailable(); syncNow(); }
    else setStatus('signedout', 'Sign in to sync');
  } catch (e) {
    console.warn(e);
    setStatus('offline', navigator.onLine ? 'Could not reach Supabase' : 'Offline: changes are saved on this device');
  }
}

export async function signIn(email, password) {
  const c = await client();
  if (!c) throw new Error('Add your Supabase URL and key first.');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  user = data.user;
  await afterSignIn();
}
export async function signUp(email, password) {
  const c = await client();
  if (!c) throw new Error('Add your Supabase URL and key first.');
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) return 'confirm';
  user = data.user;
  await afterSignIn();
  return 'ok';
}
async function afterSignIn() {
  const lastUser = lsGet('planner.lastUser', null);
  if (lastUser !== user.id) {
    // New account on this device: upload everything made here and pull everything.
    store.markAllDirty();
    const blobs = await store.allBlobs();
    for (const b of blobs) if (b.uploaded) await store.putBlobRow({ ...b, uploaded: 0 });
    lsSet('planner.cursor', null);
    lsSet('planner.lastUser', user.id);
  }
  startRealtime();
  store.notifyBlobsAvailable();
  await syncNow();
}
export async function signOut() {
  const c = await client();
  if (c) await c.auth.signOut();
  user = null;
  stopRealtime();
  setStatus('signedout', 'Sign in to sync');
}

function schedule() {
  clearTimeout(timer);
  if (!user) return;
  if (!navigator.onLine) { setStatus('offline', 'Offline: changes are saved on this device'); return; }
  setStatus('pending', 'Saving…');
  timer = setTimeout(syncNow, 1200);
}

export async function syncNow() {
  if (!user || !sb) return;
  if (!navigator.onLine) { setStatus('offline', 'Offline: changes are saved on this device'); return; }
  if (running) { again = true; return; }
  running = true;
  setStatus('syncing', 'Syncing…');
  try {
    do {
      again = false;
      await pushBlobs();
      await push();
      await pull();
    } while (again);
    state.lastSync = Date.now();
    lsSet('planner.lastSync', state.lastSync);
    setStatus('synced', 'Synced');
  } catch (e) {
    console.warn('Sync failed', e);
    const msg = (e && e.message) || String(e);
    if (/relation .* does not exist|Could not find the table/i.test(msg)) setStatus('error', 'Run supabase/schema.sql in your Supabase project');
    else if (/JWT|session|auth/i.test(msg)) setStatus('signedout', 'Sign in again to sync');
    else setStatus('error', navigator.onLine ? 'Sync failed, will retry' : 'Offline: changes are saved on this device');
  } finally {
    running = false;
  }
}

async function push() {
  const dirty = store.dirtyRecords();
  for (let i = 0; i < dirty.length; i += 200) {
    const batch = dirty.slice(i, i + 200);
    const rows = batch.map((r) => ({ user_id: user.id, id: r.id, type: r.type, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted }));
    const { error } = await sb.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
    store.markClean(batch.map((r) => ({ id: r.id, updated_at: r.updated_at })));
  }
}

async function pull() {
  let cursor = lsGet('planner.cursor', null);
  // Re-read a short window behind the cursor so rows committed late are not missed.
  const since = cursor ? new Date(new Date(cursor).getTime() - 120000).toISOString() : null;
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = sb.from(TABLE).select('id,type,data,updated_at,deleted,server_ts').order('server_ts', { ascending: true }).range(from, from + page - 1);
    if (since) q = q.gt('server_ts', since);
    const { data, error } = await q;
    if (error) throw error;
    if (data.length) {
      store.applyRemote(data);
      const last = data[data.length - 1].server_ts;
      if (!cursor || last > cursor) cursor = last;
    }
    if (data.length < page) break;
    from += page;
  }
  if (cursor) lsSet('planner.cursor', cursor);
}

async function pushBlobs() {
  const pending = await store.pendingBlobs();
  for (const row of pending) {
    const { error } = await sb.storage.from(BUCKET).upload(`${user.id}/${row.id}`, row.blob, { upsert: true, contentType: row.type || 'application/octet-stream' });
    if (error && !/exists/i.test(error.message)) throw error;
    await store.putBlobRow({ ...row, uploaded: 1 });
  }
}

async function fetchBlob(id) {
  if (!user || !sb || !navigator.onLine) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(`${user.id}/${id}`);
  if (error) return null;
  return data;
}

const pullSoon = debounce(() => syncNow(), 800);
function startRealtime() {
  if (!sb || !user || channel) return;
  try {
    channel = sb.channel('planner-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${user.id}` }, () => pullSoon())
      .subscribe();
  } catch (e) { channel = null; }
}
function stopRealtime() {
  if (channel && sb) { try { sb.removeChannel(channel); } catch (e) { /* ignore */ } }
  channel = null;
}
