// WITNESS: end-to-end offline-read check for 4D/5D charts after the F2 fix
// (prompts/SEAM_IDENTITY_AUDIT.md). Confirms boq_charts.html's ACTUAL peekDbCache()/fetchDbBuffer()
// source (extracted verbatim from viewer/boq_charts.html, not reimplemented) can still read a
// building back out of IndexedDB with zero network, in both scenarios the "meta OR full" comment
// at boq_charts.html:983 promises:
//   (A) only the split meta.db was ever cached (the common case — streaming.js's Phase 1)
//   (B) the whole monolithic _extracted.db was cached (older/small buildings, no split)
// The cache is seeded exactly the way viewer/scene.js's cachedFetch() really writes it: DB opened
// at version 2 (A.openCacheDB's canonical version), same 'dbs' object store, keyed by the same raw
// url string boq_charts.html derives from its own ?db= query param (viewer/tools.js:377 passes the
// SAME db= value through unencoded-content, so both sides key on an identical string — no F1-style
// key mismatch in this particular path).
require('fake-indexeddb/auto');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/../viewer/boq_charts.html', 'utf8');
function extractFn(name) {
  const start = html.indexOf('async function ' + name);
  if (start === -1) throw new Error('function not found: ' + name);
  // walk braces to find the matching close of the function body
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return html.slice(start, i);
}

const { performance } = require('perf_hooks');
const ctx = { indexedDB, console, performance, _log: () => {} };
vm.createContext(ctx);
vm.runInContext(extractFn('peekDbCache') + '\nthis.peekDbCache = peekDbCache;', ctx);
vm.runInContext(extractFn('fetchDbBuffer') + '\nthis.fetchDbBuffer = fetchDbBuffer;', ctx);

function log(s) { console.log(s); }

// Seed the shared cache exactly the way scene.js's canonical opener + cachedFetch() write it.
// Uses store.clear() to reset between scenarios (not deleteDatabase) — deleteDatabase blocks on
// any still-open connection (e.g. the one peekDbCache() itself opens and never closes, same as
// the real page), which would just hang a Node script with no browser tab lifecycle to close it.
function seedCache(entries) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bim_ootb_cache', 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('dbs')) req.result.createObjectStore('dbs');
      if (!req.result.objectStoreNames.contains('timestamps')) req.result.createObjectStore('timestamps');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['dbs', 'timestamps'], 'readwrite');
      tx.objectStore('dbs').clear();
      tx.objectStore('timestamps').clear();
      for (const [key, buf] of entries) {
        tx.objectStore('dbs').put(buf, key);
        tx.objectStore('timestamps').put(Date.now(), key);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function makeBuf(tag) {
  const b = new ArrayBuffer(16);
  new DataView(b).setUint32(0, tag);
  return b;
}

async function scenarioMetaOnly() {
  const DB_URL = 'buildings/Hospital_extracted.db';
  const metaUrl = DB_URL.replace('_extracted.db', '_meta.db');
  await seedCache([[metaUrl, makeBuf(0xA1)]]);   // only meta.db was ever streamed+cached
  const hitMeta = await ctx.peekDbCache(metaUrl);
  const hitFull = await ctx.peekDbCache(DB_URL);
  log('§W1 meta-only scenario: peekDbCache(metaUrl) hit=' + (hitMeta !== null) +
      ' peekDbCache(fullUrl) hit=' + (hitFull !== null) + ' (expect true/false)');
  return hitMeta !== null && hitFull === null;
}

async function scenarioFullOnly() {
  const DB_URL = 'buildings/Duplex_extracted.db';
  const metaUrl = DB_URL.replace('_extracted.db', '_meta.db');
  await seedCache([[DB_URL, makeBuf(0xB2)]]);    // no split — whole monolith was cached
  const hitMeta = await ctx.peekDbCache(metaUrl);
  const hitFull = await ctx.peekDbCache(DB_URL);
  log('§W2 full-only scenario: peekDbCache(metaUrl) hit=' + (hitMeta !== null) +
      ' peekDbCache(fullUrl) hit=' + (hitFull !== null) + ' (expect false/true)');
  return hitMeta === null && hitFull !== null;
}

async function scenarioFetchDbBufferOffline() {
  // fetchDbBuffer() falls back to network fetch() on a miss — prove the CACHE HIT path returns
  // without ever calling fetch (no global fetch defined in this vm context => would throw if hit).
  const url = 'buildings/Hospital_meta.db';
  await seedCache([[url, makeBuf(0xC3)]]);
  const buf = await ctx.fetchDbBuffer(url);   // ctx has no `fetch` — would throw ReferenceError on a miss
  log('§W3 fetchDbBuffer offline hit: gotBuffer=' + (buf && buf.byteLength === 16));
  return !!(buf && buf.byteLength === 16);
}

(async () => {
  const r1 = await scenarioMetaOnly();
  const r2 = await scenarioFullOnly();
  const r3 = await scenarioFetchDbBufferOffline();
  const pass = r1 && r2 && r3;
  log('§WITNESS_RESULT offline_meta_db_cache_hit ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})();
