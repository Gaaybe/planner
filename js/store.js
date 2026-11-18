// Local-first data store. Every record lives in IndexedDB on this device and
// in memory while the app is open. Changes are marked "dirty" until the sync
// engine has pushed them to Supabase, so nothing is lost while offline.
//
// Record shape: { id, type, data, updated_at (ms), deleted, dirty }

import { uid } from './util.js';

const DB_NAME = 'planner';
const DB_VERSION = 1;
let db;
const mem = new Map();          // id -> record
const listeners = new Set();
const blobListeners = new Set();

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function tx(store, mode = 'readonly') { return db.transaction(store, mode).objectStore(store); }

export async function openStore() {
  db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Close other Planner tabs and reload.'));
  });
  const all = await req(tx('records').getAll());
  for (const rec of all) mem.set(rec.id, rec);
  // Ask the browser not to evict our data (helps on iPad/Safari).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not supported */ }
}

// ---------- Change notifications ----------
let pendingNotify = null;
const pendingTypes = new Set();
function notify(type, source) {
  pendingTypes.add(type);
  if (pendingNotify) return;
  pendingNotify = Promise.resolve().then(() => {
    const types = new Set(pendingTypes);
    pendingTypes.clear();
    pendingNotify = null;
    for (const fn of listeners) fn(types, source);
  });
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onBlobChange(fn) { blobListeners.add(fn); return () => blobListeners.delete(fn); }

let dirtyHook = () => {};
export function setDirtyHook(fn) { dirtyHook = fn; }

function persist(rec) {
  try { tx('records', 'readwrite').put(rec); } catch (e) { console.error('Save failed', e); }
}

// ---------- Reads ----------
export function get(id) { const r = mem.get(id); return r && !r.deleted ? r : null; }
export function getData(id) { const r = get(id); return r ? r.data : null; }
export function all(type, filter) {
  const out = [];
  for (const r of mem.values()) {
    if (r.type !== type || r.deleted) continue;
    if (filter && !filter(r.data, r)) continue;
    out.push(r);
  }
  return out;
}
export function allRaw() { return [...mem.values()]; }
export function dirtyRecords() { return [...mem.values()].filter((r) => r.dirty); }

// ---------- Writes ----------
// Creates a record. `id` may be supplied for records that must be unique
// across devices (daily notes use their date as the id).
export function create(type, data, id) {
  const now = Date.now();
  const rec = { id: id || uid(), type, data: { ...data, createdAt: data.createdAt || now }, updated_at: now, deleted: false, dirty: 1 };
  mem.set(rec.id, rec);
  persist(rec);
  notify(type, 'local');
  dirtyHook();
  return rec;
}

export function update(id, patch) {
  const rec = mem.get(id);
  if (!rec) return null;
  const now = Math.max(Date.now(), rec.updated_at + 1);
  const next = { ...rec, data: { ...rec.data, ...patch }, updated_at: now, deleted: false, dirty: 1 };
  mem.set(id, next);
  persist(next);
  notify(rec.type, 'local');
  dirtyHook();
  return next;
}

export function upsert(type, id, data) {
  const rec = mem.get(id);
  if (rec && !rec.deleted) return update(id, data);
  if (rec && rec.deleted) {
    const now = Math.max(Date.now(), rec.updated_at + 1);
    const next = { ...rec, data: { ...data, createdAt: Date.now() }, updated_at: now, deleted: false, dirty: 1 };
    mem.set(id, next); persist(next); notify(type, 'local'); dirtyHook();
    return next;
  }
  return create(type, data, id);
}

// Soft delete so the deletion syncs to other devices.
export function remove(id) {
  const rec = mem.get(id);
  if (!rec || rec.deleted) return;
  const now = Math.max(Date.now(), rec.updated_at + 1);
  const next = { ...rec, deleted: true, updated_at: now, dirty: 1 };
  mem.set(id, next);
  persist(next);
  notify(rec.type, 'local');
  dirtyHook();
}

// Applied by the sync engine for records coming from the server.
export function applyRemote(rows) {
  const types = new Set();
  const store = db.transaction('records', 'readwrite').objectStore('records');
  for (const row of rows) {
    const local = mem.get(row.id);
    const remoteTs = Number(row.updated_at);
    if (local && local.updated_at >= remoteTs) continue;
    const rec = { id: row.id, type: row.type, data: row.data || {}, updated_at: remoteTs, deleted: !!row.deleted, dirty: 0 };
    mem.set(rec.id, rec);
    store.put(rec);
    types.add(rec.type);
  }
  for (const t of types) notify(t, 'remote');
  return types.size > 0;
}

// Marks records clean after a successful push, unless they changed meanwhile.
export function markClean(pushed) {
  const store = db.transaction('records', 'readwrite').objectStore('records');
  for (const p of pushed) {
    const cur = mem.get(p.id);
    if (cur && cur.updated_at === p.updated_at && cur.dirty) {
      const next = { ...cur, dirty: 0 };
      mem.set(p.id, next);
      store.put(next);
    }
  }
}

// Marks everything dirty, e.g. after signing in to a fresh account.
export function markAllDirty() {
  const store = db.transaction('records', 'readwrite').objectStore('records');
  for (const r of mem.values()) { const next = { ...r, dirty: 1 }; mem.set(r.id, next); store.put(next); }
  dirtyHook();
}

// ---------- Images ----------
const urlCache = new Map();
let blobFetcher = null; // set by sync: async (id) => Blob|null
export function setBlobFetcher(fn) { blobFetcher = fn; }

export async function saveBlob(blob) {
  const id = uid();
  await req(tx('blobs', 'readwrite').put({ id, blob, type: blob.type, uploaded: 0 }));
  dirtyHook();
  return id;
}
export async function getBlobRow(id) { return req(tx('blobs').get(id)); }
export async function putBlobRow(row) { return req(tx('blobs', 'readwrite').put(row)); }
export async function pendingBlobs() {
  const rows = await req(tx('blobs').getAll());
  return rows.filter((r) => !r.uploaded);
}
export async function allBlobs() { return req(tx('blobs').getAll()); }

const inflight = new Map();
export function imageUrl(id) {
  if (urlCache.has(id)) return Promise.resolve(urlCache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    let row = await getBlobRow(id);
    if (!row && blobFetcher) {
      const blob = await blobFetcher(id);
      if (blob) { row = { id, blob, type: blob.type, uploaded: 1 }; await putBlobRow(row); }
    }
    if (!row) return null;
    const url = URL.createObjectURL(row.blob);
    urlCache.set(id, url);
    return url;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
export function notifyBlobsAvailable() { for (const fn of blobListeners) fn(); }

// ---------- Meta (small key/value per device) ----------
export async function getMeta(key) { const r = await req(tx('meta').get(key)); return r ? r.value : undefined; }
export async function setMeta(key, value) { return req(tx('meta', 'readwrite').put({ key, value })); }

// ---------- Backup ----------
export async function exportAll() {
  const records = [...mem.values()].filter((r) => !r.deleted).map(({ id, type, data, updated_at }) => ({ id, type, data, updated_at }));
  const blobs = [];
  for (const row of await allBlobs()) {
    blobs.push({ id: row.id, type: row.type, data: await blobToDataUrl(row.blob) });
  }
  return { app: 'planner', version: 1, exportedAt: new Date().toISOString(), records, blobs };
}
export async function importAll(json) {
  if (!json || json.app !== 'planner' || !Array.isArray(json.records)) throw new Error('This file is not a Planner backup.');
  for (const b of json.blobs || []) {
    const blob = await (await fetch(b.data)).blob();
    await putBlobRow({ id: b.id, blob, type: b.type, uploaded: 0 });
  }
  const store = db.transaction('records', 'readwrite').objectStore('records');
  const types = new Set();
  for (const r of json.records) {
    const local = mem.get(r.id);
    if (local && local.updated_at >= r.updated_at && !local.deleted) continue;
    const rec = { id: r.id, type: r.type, data: r.data, updated_at: Math.max(r.updated_at, local ? local.updated_at + 1 : 0), deleted: false, dirty: 1 };
    mem.set(rec.id, rec); store.put(rec); types.add(rec.type);
  }
  for (const t of types) notify(t, 'local');
  dirtyHook();
}
function blobToDataUrl(blob) { return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); }
