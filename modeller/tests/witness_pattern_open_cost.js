#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATTERN-OPEN-COST scope (read the log after every run)
 * SCOPE: bim-compiler prompts/Modeller/PATTERN_REVIEW_2026-09-27.md §B1-ROW3 + §B1-ROW8.
 * ISSUES UNDER TEST:
 *   row 3 — one resident Open rebuilt the SAME geometry index many times (cross_edges _readBoxes ×3 per deriveAll,
 *           a 4th build only for a log count, swbInit + arc_editable again). Counted from the §GEOIDX build lines.
 *   row 8 — every Open re-ran RoomWalker.walk + db.export() on identical input, because openResident caches RAW bytes.
 * Real user path: Open panel row (e2e_harness t.open) → wait for the ARC seed (geo continuation) → Open the SAME resident
 * again in the same page (raw bytes now an IDB cache-HIT).
 * CLAIMS (each names its issue):
 *   C1 GEOIDX-BUDGET   (row 3) — §GEOIDX builds per Open ≤ 2 (one per db pair: meta-only sync path, meta×geo). RED on base.
 *   C2 XEDGE-STABLE    (row 3, no-drift) — swXEdges digest + §XEDGE-ALL counts identical between the two Opens.
 *   C3 ROOM-CACHE      (row 8) — Open 2 logs §MODELLER-ROOM-INJECT source=cache (no walk). RED on base (source=walker).
 *   C4 SAME-SUBSTRATE  (row 8, no-drift) — Open 2's __dwBuf is byte-identical (sha-256) to Open 1's (on base this is RED
 *                      only because rooms_meta.built_at is a wall-clock stamp — roomsDigest, the room CONTENT, is the
 *                      base-vs-fix no-drift number), same room content digest, IfcSpace/RM_ counts and Outliner room nodes.
 *   C6 STALE-DROPPED   (row 8, invalidation) — a compiled entry planted for the same url under an OLD version key is deleted
 *                      by open1's persist. RED on base (base never touches mrooms_ keys).
 *   C5 NOT-VACUOUS     — Open 1 compiled rooms (source=walker, rooms>0) and resolved real geometry (§XEDGE-GEO geoDb=YES);
 *                      otherwise C1-C4 judged nothing.
 * Every run prints §OPEN-COST-DIGEST lines — compare them across base vs branch (behaviour-unchanged evidence).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const KEY = process.argv[2] || 'SampleHouse';

async function state(t) {
  return t.pg.evaluate(async () => {
    const sha = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const X = window.swXEdges || {};
    const xd = await sha(new TextEncoder().encode(JSON.stringify([X.abuts, X.anchored, X.spans, X.datums, X.fills, X.aggregates])));
    const bufSha = window.__dwBuf ? await sha(new Uint8Array(window.__dwBuf)) : null;
    let sp = null, roomsDigest = null;
    try { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      const q = db.exec("SELECT COUNT(*), SUM(guid LIKE 'RM\\_%' ESCAPE '\\') FROM spatial_structure WHERE type='IfcSpace'");
      sp = q.length ? q[0].values[0].join('/') : null;
      // room CONTENT digest (rooms_meta.built_at is a wall-clock stamp, so the raw bytes of two walker runs differ by design)
      const rr = db.exec("SELECT * FROM spatial_structure ORDER BY guid"), rc = db.exec("SELECT * FROM rel_contained_in_space ORDER BY space_guid, element_guid");
      roomsDigest = await sha(new TextEncoder().encode(JSON.stringify([rr.length ? rr[0].values : [], rc.length ? rc[0].values : []])));
      db.close(); } catch (e) { sp = 'err'; }
    let rooms = 0; const tr = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    if (tr) Object.keys(tr.nodes).forEach(k => { if (tr.nodes[k].kind === 'room') rooms++; });
    const ops = window.Bonsai.oplog._geomOps().length;
    return { xd, bufSha, roomsDigest, sp, rooms, ops, abuts: (X.abuts || []).length };
  });
}

async function openOnce(t, label) {
  const n0 = t.slog.length;
  await t.open(KEY);
  await t.pg.waitForFunction(() => !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree()), { timeout: 120000 }).catch(() => {});
  await t.pg.evaluate(() => Promise.race([window.__arcSeedReady || Promise.resolve(), new Promise(r => setTimeout(r, 120000))]));
  await t.sleep(800);
  const L = t.slog.slice(n0);
  const pick = re => L.filter(l => re.test(l));
  const geoidx = pick(/§GEOIDX build/);
  const inj = pick(/§MODELLER-ROOM-INJECT/);
  const cost = pick(/§MODELLER-ROOM-COST|§MODELLER-ROOM-CACHE/);
  const xall = pick(/§XEDGE-ALL/), xgeo = pick(/§XEDGE-GEO /), swg = pick(/§STRWALK-GEO|§STRWALK-INIT/);
  const s = await state(t);
  const ms = geoidx.reduce((a, l) => a + (+((l.match(/ms=(\d+)/) || [])[1] || 0)), 0);
  console.log('  §OPEN-COST ' + label + ' geoidxBuilds=' + geoidx.length + ' geoidxMs=' + ms);
  geoidx.forEach(l => console.log('    ' + l.slice(0, 160)));
  inj.concat(cost).forEach(l => console.log('    ' + l.slice(0, 200)));
  xall.concat(xgeo, swg).forEach(l => console.log('    ' + l.slice(0, 200)));
  console.log('  §OPEN-COST-DIGEST ' + label + ' ' + JSON.stringify(s) + ' xall=' + JSON.stringify(xall.map(l => l.replace(/^.*§XEDGE-ALL /, '').slice(0, 90))) +
    ' xgeo=' + JSON.stringify(xgeo.map(l => (l.match(/realGeomResolved=\S+/) || [''])[0] + ' ' + (l.match(/abuts=\d+/) || [''])[0])));
  return { geoidx: geoidx.length, ms, inj, xall, xgeo, s };
}

// C6 STALE-DROPPED: plant a compiled entry for the SAME url under an OLD version key before the first Open. A correct
// miss-persist must delete it (a new ROOM_WALKER_V / raw ?v= / patch changes the key; the old compile must not linger).
const plantStale = (t) => t.pg.evaluate((key) => new Promise((resolve) => {
  const S = window.STRWalkerOutliner; const R = S._residents.find(r => r.key === key);
  const url = S._modellerBase() + R.db + (R.v ? '?v=' + R.v : ''), stale = 'mrooms_' + url + '|OLD-VERSION|deadbeef';
  const rq = indexedDB.open('bim_ootb_cache');
  rq.onsuccess = () => { const idb = rq.result; if (!idb.objectStoreNames.contains('dbs')) { idb.close(); resolve({ stale, planted: false }); return; }
    const tx = idb.transaction('dbs', 'readwrite'); tx.objectStore('dbs').put(new ArrayBuffer(8), stale);
    tx.oncomplete = () => { idb.close(); resolve({ stale, planted: true }); }; tx.onerror = () => { idb.close(); resolve({ stale, planted: false }); }; };
  rq.onerror = () => resolve({ stale, planted: false });
}), KEY);
const hasKey = (t, k) => t.pg.evaluate((k) => new Promise((resolve) => {
  const rq = indexedDB.open('bim_ootb_cache');
  rq.onsuccess = () => { const idb = rq.result; const g = idb.transaction('dbs', 'readonly').objectStore('dbs').getKey(k);
    g.onsuccess = () => { idb.close(); resolve(g.result !== undefined); }; g.onerror = () => { idb.close(); resolve(null); }; };
  rq.onerror = () => resolve(null);
}), k);

runE2E('W-PATTERN-OPEN-COST ' + KEY, async (t) => {
  await t.pg.waitForFunction(() => !!(window.STRWalkerOutliner && window.STRWalkerOutliner._residents), { timeout: 30000 }).catch(() => {});
  await t.sleep(500);   // _idbEnsureStore (module init) creates the 'dbs' store
  const st = await plantStale(t);
  const a = await openOnce(t, 'open1');
  await t.sleep(500);
  const staleLeft = await hasKey(t, st.stale);
  console.log('  §OPEN-COST stale-plant ' + JSON.stringify(st) + ' stillPresentAfterOpen1=' + staleLeft);
  const b = await openOnce(t, 'open2');
  const src = x => x.inj.length ? ((x.inj[0].match(/source=(\w+)/) || [])[1]) : null;
  t.assert('C5 NOT-VACUOUS (open1 compiled rooms + real geometry resolved)', src(a) === 'walker' && a.s.rooms > 0 && a.xgeo.some(l => /geoDb=YES/.test(l)),
    'source=' + src(a) + ' rooms=' + a.s.rooms + ' xgeo=' + a.xgeo.length);
  t.assert('C1 GEOIDX-BUDGET (≤2 index builds per Open)', a.geoidx <= 2 && b.geoidx <= 2, 'open1=' + a.geoidx + ' open2=' + b.geoidx);
  t.assert('C2 XEDGE-STABLE (same digest + counts both Opens)', a.s.xd === b.s.xd && JSON.stringify(a.xall) === JSON.stringify(b.xall), a.s.xd + ' vs ' + b.s.xd);
  t.assert('C3 ROOM-CACHE (open2 source=cache, no re-walk)', src(b) === 'cache', 'open2 source=' + src(b));
  t.assert('C6 STALE-DROPPED (an old-version compiled entry for this url is deleted when open1 persists)', st.planted === true && staleLeft === false, 'planted=' + st.planted + ' stillPresent=' + staleLeft);
  t.assert('C4 SAME-SUBSTRATE (open2 __dwBuf sha + IfcSpace/RM_ + room nodes == open1)', a.s.bufSha === b.s.bufSha && a.s.roomsDigest === b.s.roomsDigest && a.s.sp === b.s.sp && a.s.rooms === b.s.rooms,
    a.s.bufSha + '/' + a.s.sp + '/' + a.s.rooms + ' vs ' + b.s.bufSha + '/' + b.s.sp + '/' + b.s.rooms);
});
