// witness_offline_db_select.js — proves the MEP + 4D/5D offline DB-load fix.
// Issue proven: MEP/boq_charts re-fetched the building DB over the network even when it
//   was already cached in IndexedDB, so they died offline (HEAD probe threw → fell through
//   to an _extracted.db key the viewer never cached). Fix = peek IDB first (zero network),
//   fall back to the sibling, and on genuinely-no-DB show "load the building first".
// Method: extract the REAL selection+load slice from each shipped HTML (no re-port → no
//   drift), run it under mocked indexedDB/fetch for 4 scenarios, assert chosen URL +
//   network-call count + the no-DB branch.
const fs = require('fs');

function sliceBetween(html, startMark, endMark) {
  const a = html.indexOf(startMark); if (a < 0) throw new Error('start mark not found: ' + startMark);
  const b = html.indexOf(endMark, a); if (b < 0) throw new Error('end mark not found: ' + endMark);
  return html.slice(a, b + endMark.length);
}

// ── mocks ──────────────────────────────────────────────────────────────────
function makeEnv(seed, online) {
  const store = new Map(Object.entries(seed));         // url -> buf (a fake ArrayBuffer)
  let fetchCalls = 0;
  const env = {};
  env.logs = [];
  env.console = { log: (...a) => { const s = a.join(' '); env.logs.push(s); console.log('   · ' + s); }, warn: () => {}, error: () => {} };
  env.fetchCalls = () => fetchCalls;
  // indexedDB: just enough of the 'dbs' object store the code uses
  env.indexedDB = {
    open() {
      const req = {};
      setTimeout(() => { if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); }, 0);
      req.result = {
        transaction() {
          return { objectStore() {
            return { get(url) { const r = {}; setTimeout(() => { r.result = store.get(url) || undefined; if (r.onsuccess) r.onsuccess(); }, 0); return r; },
                     put(buf, url) { store.set(url, buf); return {}; } };
          } };
        }
      };
      return req;
    }
  };
  // fetch: counts every network touch. Offline → reject. Online → 200 for known server files.
  const SERVER = new Set(seed.__server || []);
  env.fetch = (url, opts) => {
    fetchCalls++;
    env.logs.push('FETCH ' + ((opts && opts.method) || 'GET') + ' ' + url);
    if (!online) return Promise.reject(new Error('NetworkError (offline)'));
    const ok = SERVER.has(url);
    if (opts && opts.method === 'HEAD') return Promise.resolve({ ok, headers: { get: () => '0' } });
    if (!ok) return Promise.reject(new Error('404'));
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
  env.initSqlJs = () => Promise.resolve({ Database: function () { this.exec = () => []; } });
  env._reportEl = { innerHTML: '', textContent: '' };
  env._infoEl = { innerHTML: '', textContent: '' };
  env.document = { getElementById: (id) => (id === 'info' ? env._infoEl : env._reportEl) };
  env._t = (k, fb) => fb;
  return env;
}

// Run a real slice (which may early-`return;` on the no-DB branch). We don't rely on its
// return value — we read effects: captured §-logs + the mocked DOM message element.
function bindHelpers(env) {
  const peekDbCache = async (url) => {
    const cacheDb = await new Promise(res => { const r = env.indexedDB.open(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (!cacheDb) return null;
    return await new Promise(ok => { const rq = cacheDb.transaction().objectStore().get(url); rq.onsuccess = () => ok(rq.result || null); rq.onerror = () => ok(null); });
  };
  const fetchDbBuffer = async (url) => {
    const cached = await peekDbCache(url); if (cached) return cached;
    const resp = await env.fetch(url); if (!resp.ok) throw new Error('DB fetch failed'); return await resp.arrayBuffer();
  };
  return { peekDbCache, fetchDbBuffer };
}
async function runSlice(slice, env, DB_URL, extraVars) {
  const { peekDbCache, fetchDbBuffer } = bindHelpers(env);
  const body = '"use strict"; return (async function(DB_URL){ var buf=null; ' + (extraVars || '') +
    ' var initSqlJs=arguments[1].initSqlJs; var document=arguments[1].document; var _t=arguments[1]._t; var fetch=arguments[1].fetch; var _t0=0;\n' +
    slice + '\n })';
  const fn = new Function('peekDbCache', 'fetchDbBuffer', 'console', body)(peekDbCache, fetchDbBuffer, env.console);
  try { await fn(DB_URL, env); } catch (e) { env.logs.push('THREW ' + e.message); }
  const L = env.logs.join('\n');
  const msg = (env._reportEl.innerHTML || '') + (env._infoEl.innerHTML || '');
  const loaded = L.match(/§(MEP_DB_LOADED|DB_INIT)[^\n]*/);
  const urlLine = L.match(/(SPLIT_HIT_CACHE|FULL_HIT_CACHE|SPLIT_HIT)[^\n]* ([^\s]+\.db)/);
  return { gotBuf: !!loaded, chosen: urlLine ? urlLine[2] : null, msg, logs: L, fetches: env.fetchCalls() };
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (cond, name, extra) => { if (cond) { pass++; console.log('§WIT PASS ' + name + (extra ? ' ' + extra : '')); } else { fail++; console.log('§WIT FAIL ' + name + (extra ? ' ' + extra : '')); } };

  const mepHtml = fs.readFileSync(__dirname + '/../viewer/mep_report.html', 'utf8');
  const boqHtml = fs.readFileSync(__dirname + '/../viewer/boq_charts.html', 'utf8');

  // Real slices: the selection cascade + guarded load, up to the DB-loaded log.
  const mepSlice = sliceBetween(mepHtml, 'var _actualUrl = DB_URL;', "console.log('§MEP_DB_LOADED url=' + _actualUrl.split('/').pop() + ' size=' + Math.round(buf.byteLength/1024/1024) + 'MB');");
  const boqSlice = sliceBetween(boqHtml, 'var _actualUrl = DB_URL;', "console.log('§DB_INIT loadMs=' + Math.round(performance.now() - _t0) + ' size=' + Math.round(buf.byteLength / 1024 / 1024) + 'MB');");
  const boqVars = 'var db=null; var performance={now:function(){return 0;}};';
  const EXT = '/buildings/Duplex_extracted.db', META = '/buildings/Duplex_meta.db';
  const base = (u) => u.split('/').pop();

  let env, r;
  // 1) ONLINE, split building on server → HEAD probe picks _meta.db (pre-existing online behavior intact).
  env = makeEnv({ __server: [EXT, META] }, true);
  r = await runSlice(mepSlice, env, EXT);
  ok(r.gotBuf && base(r.logs.match(/§MEP_DB_LOADED url=(\S+)/)[1]) === 'Duplex_meta.db', 'MEP-online-split-picks-meta', 'chosen=' + r.chosen + ' fetches=' + r.fetches);

  // 2) OFFLINE, _meta.db cached → picks meta with ZERO network (the "don't fetch again" win).
  env = makeEnv({ [META]: new ArrayBuffer(8) }, false);
  r = await runSlice(mepSlice, env, EXT);
  ok(r.gotBuf && r.chosen === 'Duplex_meta.db' && r.fetches === 0, 'MEP-offline-meta-cached-zero-network', 'chosen=' + r.chosen + ' fetches=' + r.fetches);

  // 3) OFFLINE, only full _extracted.db cached → picks full, zero network.
  env = makeEnv({ [EXT]: new ArrayBuffer(8) }, false);
  r = await runSlice(mepSlice, env, EXT);
  ok(r.gotBuf && r.chosen === 'Duplex_extracted.db' && r.fetches === 0, 'MEP-offline-full-cached-zero-network', 'chosen=' + r.chosen + ' fetches=' + r.fetches);

  // 4) OFFLINE, nothing cached → no crash, shows "load the building first".
  env = makeEnv({}, false);
  r = await runSlice(mepSlice, env, EXT);
  ok(!r.gotBuf && /Load the building first/.test(r.msg), 'MEP-offline-no-db-says-load-first', 'msg="' + r.msg.replace(/<[^>]+>/g, '').slice(0, 38) + '"');

  // ── boq_charts (4D/5D): identical cascade, #info element ──
  // 5) OFFLINE, meta cached → zero network.
  env = makeEnv({ [META]: new ArrayBuffer(8) }, false);
  r = await runSlice(boqSlice, env, EXT, boqVars);
  ok(r.gotBuf && r.chosen === 'Duplex_meta.db' && r.fetches === 0, 'BOQ-offline-meta-cached-zero-network', 'chosen=' + r.chosen + ' fetches=' + r.fetches);

  // 6) OFFLINE, nothing cached → load-first message, no crash.
  env = makeEnv({}, false);
  r = await runSlice(boqSlice, env, EXT, boqVars);
  ok(!r.gotBuf && /Load the building first/.test(r.msg), 'BOQ-offline-no-db-says-load-first', 'msg="' + r.msg.replace(/<[^>]+>/g, '').slice(0, 38) + '"');

  console.log('§WIT SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§WIT CRASH ' + e.message); process.exit(2); });
