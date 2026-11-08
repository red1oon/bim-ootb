#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-ONE-FRAME. SCOPE: prompts/MODELLER_ONE_FRAME.md §1-§3 (part A: the open route lands in the Viewer import's local frame). Read the log after EVERY run; exit code 0 is not evidence.
// ISSUE IT EXPOSES: "one file, two frames; world-scale float32 drift at map coordinates". The Modeller open kept raw map coordinates where the Viewer import rebased to a local origin
// (+ a recorded whole-metre offset), so one file sat in two frames and every float32 mesh/export at map scale (x ~500 km, y ~3,000 km) lost up to 1.6 cm (x) and 12.5 cm (y).
// Fixture: the public IFC/Duplex_ARC.ifc with its IfcSite placement moved far (lib_far_fixture.js, the RT_FAR method of W-EXPORT-ROUNDTRIP), plus the unshifted Duplex.
// Claims: F1 identical georef_offset on both routes (+ federation pin + >1 km fallback) | F2 sweep X of N: every world-coordinate column shifted (red control: one table left unshifted)
//   F3 W-EXPORT-ROUNDTRIP far leg after (A): centres within 1 mm, bbox volume within 1% | F4 site facts as the file states them, with a source; none stated records none
//   F5 a local file is unchanged on both routes (offset 0; every table equals origin/main's code, the named site rows aside) | F6 W-IFC-GRID, W-IFC-OPEN-ONE, W-IFC-STOREYS, W-DRAWN-MAINS stay green.
// Verdict lines: §PASS / §FAIL / §INCONCLUSIVE, then `§VERDICT CLAIM MET` or `§VERDICT CLAIM NOT MET`. INCONCLUSIVE when nothing was judged (never PASS).
// Usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_one_frame.js > log 2>&1      ONE_FRAME_SKIP=F3,F6 skips the slow child runs (they print INCONCLUSIVE, not PASS).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), NM = path.join(os.homedir(), 'bim-compiler', 'node_modules');
const WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js')), initSqlJs = require(path.join(NM, 'sql.js'));
const _init = WebIFC.IfcAPI.prototype.Init; WebIFC.IfcAPI.prototype.Init = function () { this.SetWasmPath(path.join(NM, 'web-ifc') + '/', true); return _init.call(this); };   // the import worker builds its own IfcAPI with a browser wasm locator
const { farCopy } = require('./lib_far_fixture.js');
const SKIP = (process.env.ONE_FRAME_SKIP || '').split(',').filter(Boolean);
const say = s => console.log(s);
let pass = 0, fail = 0, inconclusive = 0;
const chk = (id, ok, d) => { if (ok) pass++; else fail++; say((ok ? '§PASS ' : '§FAIL ') + id + ' | ' + d); return ok; };
const inc = (id, d) => { inconclusive++; say('§INCONCLUSIVE ' + id + ' | ' + d); };
const PUB = path.join(ROOT, 'IFC', 'Duplex_ARC.ifc'), HOUSE = path.join(ROOT, 'IFC', 'SampleHouse_ARC.ifc');
const FAR = [500000, 3000000], FARZ = 12000;

// ── the code trees: ROOT (the code under test) and origin/main's (git show into a temp tree, same layout) ──────────────────────────────────────────────────────────────────────────────
function baseTree(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wone_base_')), files = ['modeller/dxf2bim/ifc_extract_core.js', 'modeller/ifc_open_db.js', 'viewer/import_worker.js', 'viewer/import_db_builder.js', 'viewer/ifc_declared_storeys.js', 'viewer/ifc_surface_names.js', 'common/ifc_grid_read.js', 'common/georef_frame.js'];
  try { for (const f of files) { const out = cp.execFileSync('git', ['-C', ROOT, 'show', ref + ':' + f], { maxBuffer: 1 << 26 }); fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), out); } return { dir }; }
  catch (e) { return { dir: null, err: e.message.split('\n')[0] }; }
}
const modOf = (dir, rel) => { const p = path.join(dir, rel); return fs.existsSync(p) ? require(p) : undefined; };
async function openRoute(SQL, api, dir, bytes, name, forced) {   // the Modeller open: IfcOpenDb.open over the tree's own extractor
  const Core = require(path.join(dir, 'modeller', 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(dir, 'modeller', 'ifc_open_db.js')), logs = [];
  const r = await IOD.open({ WebIFC, ifcApi: api, SQL, Core, GridRead: modOf(dir, 'common/ifc_grid_read.js'), GeorefFrame: modOf(dir, 'common/georef_frame.js'), forceGeorefOffset: forced || null, bytes, name: name || 'x', log: s => logs.push(String(s)) });
  return { db: r.db, logs, offset: r.georefOffset };
}
function importRoute(SQL, dir, bytes, filename, forced) {   // the Viewer import: the tree's import_worker.js + import_db_builder.js in a vm (the harness W-IFC-GRID uses)
  const V = path.join(dir, 'viewer'), logs = [], S2 = require(path.join(V, 'ifc_declared_storeys.js'));
  const base = () => ({ URL, Blob, TextDecoder, TextEncoder, setTimeout, Math, JSON, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, Int8Array, Int16Array, ArrayBuffer, Map, Set, Object, Array, String, Number, parseInt, parseFloat, isNaN, isFinite, Promise, performance });
  const cons = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) };
  return new Promise(res => {
    const self = { IfcDeclaredStoreys: S2, IfcGridRead: modOf(dir, 'common/ifc_grid_read.js') }; const gf = modOf(dir, 'common/georef_frame.js'); if (gf) self.GeorefFrame = gf;
    const c = Object.assign(base(), { self, WebIFC, console: cons, importScripts() {} });
    self.postMessage = m => {
      if (m.type === 'done') { const c2 = Object.assign(base(), { console: cons }); vm.createContext(c2); vm.runInContext(fs.readFileSync(path.join(V, 'import_db_builder.js'), 'utf8'), c2); const o = c2.buildImportDBs(SQL, m); res({ db: new SQL.Database(new Uint8Array(o.metaDb || o.extractedDb)), logs, offset: m.meta.georefOffset }); }
      else if (m.type === 'error') res({ db: null, logs, error: m.message });
    };
    vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(V, 'import_worker.js'), 'utf8'), c);
    self.onmessage({ data: { arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filename: filename || 'x.ifc', forceGeorefOffset: forced || null } });
  });
}

// ── DB reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const rowsOf = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
const tablesOf = db => (rowsOf(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") || []).map(r => r[0]);
const colsOf = (db, t) => (rowsOf(db, 'PRAGMA table_info("' + t + '")') || []).map(r => r[1]);
const metaOf = db => { const o = {}; (rowsOf(db, 'SELECT key, value FROM project_metadata') || []).forEach(r => { o[r[0]] = r[1]; }); return o; };
const offOf = m => ['x', 'y', 'z'].map(a => m['georef_offset_' + a] == null ? 0 : Number(m['georef_offset_' + a]));
function tableHash(db, t, skipMeta) {   // order-independent row hash, BLOBs by content
  const rows = rowsOf(db, 'SELECT * FROM "' + t + '"' + (t === 'project_metadata' ? " WHERE key <> 'import_date'" : '')) || [];
  const keep = skipMeta && t === 'project_metadata' ? rows.filter(r => !skipMeta.includes(r[0])) : rows;
  const lines = keep.map(r => JSON.stringify(r.map(v => v instanceof Uint8Array ? 'blob:' + crypto.createHash('md5').update(Buffer.from(v)).digest('hex') : v))).sort();
  return { n: lines.length, h: crypto.createHash('sha1').update(lines.join('\n')).digest('hex') };
}
function metaDiff(a, b, skip) { const x = metaOf(a), y = metaOf(b), o = []; new Set(Object.keys(x).concat(Object.keys(y))).forEach(k => { if (k === 'import_date' || (skip || []).includes(k)) return; if (x[k] !== y[k]) o.push(k + ': new=' + JSON.stringify(x[k]) + ' old=' + JSON.stringify(y[k])); }); return o.join('; '); }
function diffDbs(a, b, skipMeta) {   // → { tables, same, diffs[] }
  const ta = tablesOf(a), tb = tablesOf(b), diffs = [];
  ta.filter(t => !tb.includes(t)).forEach(t => diffs.push('table only in A: ' + t)); tb.filter(t => !ta.includes(t)).forEach(t => diffs.push('table only in B: ' + t));
  let same = 0; ta.filter(t => tb.includes(t)).forEach(t => { const x = tableHash(a, t, skipMeta), y = tableHash(b, t, skipMeta); if (x.h === y.h) same++; else diffs.push(t + ' rows ' + x.n + ' vs ' + y.n + (t === 'project_metadata' ? ' | ' + metaDiff(a, b, skipMeta) : '')); });
  return { tables: ta.length, same, diffs };
}

// ── the sweep: every world-coordinate column, FOUND by table and column names (never a hand list) ───────────────────────────────────────────────────────────────────────────────────────
function worldColumns(db) {   // → [{ t, c, axis: 'x'|'y'|'z'|'xyz', key }]
  const out = [];
  for (const t of tablesOf(db)) {
    const cols = colsOf(db, t), key = cols.includes('guid') ? 'guid' : (cols.includes('axis_guid') ? 'axis_guid' : null);
    for (const c of cols) {
      let axis = null, m, attr = false;
      if ((m = /^center_([xyz])$/.exec(c))) axis = m[1];                        // element_transforms, ifc_spaces centres
      else if ((m = /^([xyz])[01]$/.exec(c))) axis = m[1];                      // ifc_grid_axis x0/y0/x1/y1
      else if ((m = /^(?:min|max)([XYZ])$/.exec(c))) axis = m[1].toLowerCase(); // element_world_bbox
      else if (c === 'origin') axis = 'xyz';                                    // door_operation origin (a JSON [x,y,z])
      else if (c === 'placement_z_m') axis = 'z';                               // a storey placement resolved to world
      else if (/^elevation(_attr_m)?$/.test(c)) { axis = 'z'; attr = true; }    // an Elevation ATTRIBUTE the file states (building-relative); it is not moved by the fixture's site placement
      if (axis) out.push({ t, c, axis, key, attr });
    }
  }
  return out;
}
const unpack = v => { if (v == null) return null; if (typeof v === 'number') return [v]; try { return JSON.parse(v); } catch (e) { return null; } };
// far DB vs the local DB of the same file: (far + offset) - (local + fixture shift) must be 0 on each axis
function sweep(far, local, offset, shift, cols, label) {
  const res = [], AX = { x: 0, y: 1, z: 2 };
  for (const col of cols) {
    if (!tablesOf(far).includes(col.t) || !tablesOf(local).includes(col.t) || !col.key) { res.push({ col, n: 0, why: 'no such table in both / no key' }); continue; }
    const q = t => { const m = {}; (rowsOf(t, 'SELECT "' + col.key + '", "' + col.c + '" FROM "' + col.t + '" WHERE "' + col.c + '" IS NOT NULL') || []).forEach(r => { m[r[0]] = r[1]; }); return m; };
    const fa = q(far), lo = q(local); let n = 0, worst = 0; const resid = [], sh = col.attr ? [0, 0, 0] : shift;
    for (const k of Object.keys(fa)) {
      if (!(k in lo)) continue;
      const a = unpack(fa[k]), b = unpack(lo[k]); if (!a || !b) continue;
      const axes = col.axis === 'xyz' ? [0, 1, 2] : [AX[col.axis]];
      axes.forEach((ax, i) => { const ai = col.axis === 'xyz' ? i : 0; n++; const d = Math.abs((a[ai] + offset[ax]) - (b[ai] + sh[ax])); resid.push(d); worst = Math.max(worst, d); });
    }
    resid.sort((x, y) => x - y); res.push({ col, n, worst, med: resid.length ? resid[resid.length >> 1] : null, over: resid.filter(d => d >= 1e-3).length });
  }
  const judged = res.filter(r => r.n > 0), isOk = r => r.med < 1e-3 && r.over <= Math.ceil(r.n * 0.02), ok = judged.filter(isOk);   // shifted = the median residual is 0 (a table left unshifted is off by the offset on EVERY value); a handful of walls differ by ~1 cm because web-ifc tessellates a cut wall differently at map coordinates (counted and printed, not hidden)
  res.forEach(r => say('  §SWEEP[' + label + '] ' + r.col.t + '.' + r.col.c + ' axis=' + r.col.axis + (r.n ? ' values=' + r.n + ' median|(far+offset)-(local+shift)|=' + r.med.toExponential(2) + ' max=' + r.worst.toExponential(2) + ' over1mm=' + r.over + (r.col.attr ? ' [file-stated attribute: expected = the file\'s number - offset]' : '') + (isOk(r) ? ' shifted' : ' NOT SHIFTED') : ' EMPTY (' + (r.why || 'no rows in the fixture') + ') not judged')));
  return { res, judged: judged.length, ok: ok.length, bad: judged.filter(r => !isOk(r)).map(r => r.col.t + '.' + r.col.c), empty: res.filter(r => !r.n).map(r => r.col.t + '.' + r.col.c) };
}

(async () => {
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const enc = f => new Uint8Array(fs.readFileSync(f));
  const bt = baseTree(process.env.BASE || 'fbe06d64');
  say('§ONE_FRAME code under test ' + ROOT + '; base tree ' + (bt.dir || 'UNAVAILABLE ' + bt.err));
  const farF = farCopy(PUB, FAR[0], FAR[1]); say(farF.log);
  const farZ = farCopy(PUB, FAR[0], FAR[1], { dz: FARZ }); say(farZ.log);
  const localB = enc(PUB);

  // ── F1 the same offset on both routes ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const fo = await openRoute(SQL, api, ROOT, enc(farF.file), 'far'), fi = await importRoute(SQL, ROOT, enc(farF.file), 'far.ifc');
  if (!fi.db) { chk('F1 the import ran', false, 'import error: ' + fi.error); }
  const oo = offOf(metaOf(fo.db)), oi = fi.db ? offOf(metaOf(fi.db)) : null;
  say('§F1 far copy (' + FAR.join(',') + '): open offset=' + JSON.stringify(oo) + ' import offset=' + JSON.stringify(oi) + ' (returned: open ' + JSON.stringify(fo.offset) + ', import ' + JSON.stringify(fi.offset) + ')');
  if (!(oo[0] || oo[1] || oo[2])) inc('F1 identical offset', 'VACUOUS: the open route recorded no offset on a file at map coordinates');
  else chk('F1 georef_offset_x/y/z identical on both routes (far copy)', !!oi && oo.every((v, i) => v === oi[i]), 'open ' + JSON.stringify(oo) + ' import ' + JSON.stringify(oi));
  // federation: a second file opened together takes the first file's pin; a file >1 km from it keeps its own (flagged)
  const sib = farCopy(PUB, FAR[0] + 120, FAR[1]), alien = farCopy(PUB, FAR[0] + 5000, FAR[1]);
  const probe = db => (rowsOf(db, "SELECT center_x, center_y FROM element_transforms WHERE guid=(SELECT guid FROM element_transforms ORDER BY guid LIMIT 1)") || [[null, null]])[0];
  const so = await openRoute(SQL, api, ROOT, enc(sib.file), 'sib', oo), si = await importRoute(SQL, ROOT, enc(sib.file), 'sib.ifc', oo);
  const p0 = probe(fo.db), po = probe(so.db), pi = si.db ? probe(si.db) : [null, null];
  chk('F1b federation pin: a sibling 120 m east, opened with the first file, takes its offset on both routes', JSON.stringify(offOf(metaOf(so.db))) === JSON.stringify(oo) && !!si.db && JSON.stringify(offOf(metaOf(si.db))) === JSON.stringify(oo), 'pin ' + JSON.stringify(oo) + ' open ' + JSON.stringify(offOf(metaOf(so.db))) + ' import ' + (si.db ? JSON.stringify(offOf(metaOf(si.db))) : si.error));
  chk('F1b the sibling sits 120.000 m east of the first file in the shared local frame (both routes, 1 mm)', Math.abs(po[0] - p0[0] - 120) < 1e-3 && Math.abs(pi[0] - p0[0] - 120) < 1e-3 && Math.abs(po[1] - p0[1]) < 1e-3, 'open dx=' + (po[0] - p0[0]).toFixed(4) + ' import dx=' + (pi[0] - p0[0]).toFixed(4) + ' dy(open)=' + (po[1] - p0[1]).toFixed(4));
  const ao = await openRoute(SQL, api, ROOT, enc(alien.file), 'alien', oo), ai = await importRoute(SQL, ROOT, enc(alien.file), 'alien.ifc', oo);
  const own = offOf(metaOf(ao.db)), ownI = ai.db ? offOf(metaOf(ai.db)) : null;
  chk('F1c a file >1 km from the pin keeps its OWN offset on both routes and says so (§GEOREF_MISMATCH)', own.some(v => v) && JSON.stringify(own) === JSON.stringify(ownI) && JSON.stringify(own) !== JSON.stringify(oo) && ao.logs.some(l => l.includes('§GEOREF_MISMATCH')) && ai.logs.some(l => l.includes('§GEOREF_MISMATCH')), 'own open ' + JSON.stringify(own) + ' import ' + JSON.stringify(ownI) + ' pin ' + JSON.stringify(oo) + ' mismatch lines open=' + ao.logs.filter(l => l.includes('§GEOREF_MISMATCH')).length + ' import=' + ai.logs.filter(l => l.includes('§GEOREF_MISMATCH')).length);

  // ── F1d (the issue-#2710 follow-up): ONE input for the pin. A far element of a class one route used to count and the other not (IfcSpace / IfcOpeningElement are in the open route's element list, never in the import's) moved the midpoint ──
  const OUT_DY = Number(process.env.OUTLIER_DY || 30);
  for (const cls of ['IFCSPACE', 'IFCOPENINGELEMENT']) {
    const fx = farCopy(PUB, FAR[0], FAR[1], { outlier: { cls, dy: OUT_DY } }); say(fx.log);
    const xo = await openRoute(SQL, api, ROOT, enc(fx.file), 'out', null), xi = await importRoute(SQL, ROOT, enc(fx.file), 'out.ifc');
    const o1 = offOf(metaOf(xo.db)), i1 = xi.db ? offOf(metaOf(xi.db)) : null;
    say('§F1d ' + cls + ' +' + OUT_DY + ' m in y: open offset=' + JSON.stringify(o1) + ' import offset=' + JSON.stringify(i1) + ' (plain far copy: ' + JSON.stringify(oo) + ')');
    chk('F1d ' + cls + ' outlier: identical georef_offset on both routes', !!i1 && o1.every((v, i) => v === i1[i]), 'open ' + JSON.stringify(o1) + ' import ' + JSON.stringify(i1));
    chk('F1d ' + cls + ' outlier: the import offset equals the plain far copy\'s (the import did not move)', !!i1 && i1.every((v, i) => v === oo[i]), 'import ' + JSON.stringify(i1) + ' plain ' + JSON.stringify(oo));
    if (bt.dir) {   // RED: origin/main's code on the SAME fixture must disagree (else the fixture proves nothing)
      const bo = await openRoute(SQL, api, bt.dir, enc(fx.file), 'out', null), bi = await importRoute(SQL, bt.dir, enc(fx.file), 'out.ifc');
      const bo1 = offOf(metaOf(bo.db)), bi1 = bi.db ? offOf(metaOf(bi.db)) : null;
      say('§F1d RED ' + cls + ' origin/main: open offset=' + JSON.stringify(bo1) + ' import offset=' + JSON.stringify(bi1));
      if (process.env.BASE_IS_FIXED) inc('F1d RED ' + cls, 'BASE_IS_FIXED set: red not asserted'); else chk('F1d RED ' + cls + ': origin/main gives DIFFERENT offsets on this fixture (the fixture exposes the bug)', !!bi1 && !bo1.every((v, i) => v === bi1[i]), 'open ' + JSON.stringify(bo1) + ' import ' + JSON.stringify(bi1));
    } else inc('F1d RED ' + cls, 'base tree unavailable');
  }

  // ── F2 the sweep (x, y AND z shifted: the fixture also lifts the site 12 km) ──────────────────────────────────────────────────────────────
  const lo = await openRoute(SQL, api, ROOT, localB, 'local'), li = await importRoute(SQL, ROOT, localB, 'local.ifc');
  const zo = await openRoute(SQL, api, ROOT, enc(farZ.file), 'farz'), zi = await importRoute(SQL, ROOT, enc(farZ.file), 'farz.ifc');
  const zoff = offOf(metaOf(zo.db)), shift = [FAR[0], FAR[1], FARZ];
  say('§F2 fixture far3 (' + shift.join(',') + '): open offset=' + JSON.stringify(zoff) + ' import offset=' + (zi.db ? JSON.stringify(offOf(metaOf(zi.db))) : zi.error));
  const colsO = worldColumns(zo.db), colsI = zi.db ? worldColumns(zi.db) : [];
  say('§F2 world-coordinate columns FOUND by name in the opened DB (open route), ' + colsO.length + ': ' + colsO.map(c => c.t + '.' + c.c).join(' '));
  say('§F2 world-coordinate columns FOUND by name in the imported DB (import route), ' + colsI.length + ': ' + colsI.map(c => c.t + '.' + c.c).join(' '));
  const swO = sweep(zo.db, lo.db, zoff, shift, colsO, 'open'), swI = zi.db ? sweep(zi.db, li.db, offOf(metaOf(zi.db)), shift, colsI, 'import') : null;
  if (!swO.judged) inc('F2 sweep', 'VACUOUS: no world column carried a row');
  else chk('F2 open route: every world-coordinate column read local, X of N = ' + swO.ok + ' of ' + swO.judged, swO.ok === swO.judged && zoff[2] !== 0 && zoff[0] !== 0, 'offset ' + JSON.stringify(zoff) + (swO.bad.length ? ' NOT SHIFTED: ' + swO.bad.join(',') : '') + (swO.empty.length ? '; not judged (no rows in the fixture): ' + swO.empty.join(',') : ''));
  if (swI) chk('F2 import route (the reference behaviour): X of N = ' + swI.ok + ' of ' + swI.judged, swI.judged > 0 && swI.ok === swI.judged, (swI.bad.length ? 'NOT SHIFTED: ' + swI.bad.join(',') : 'all shifted') + (swI.empty.length ? '; not judged: ' + swI.empty.join(',') : ''));
  // the same sweep over the two routes' own tables: a column the import shifts and the open route lacks (or the reverse) is named
  const nameO = new Set(colsO.map(c => c.t + '.' + c.c)), nameI = new Set(colsI.map(c => c.t + '.' + c.c));
  say('§F2 columns found on one route only: open-only [' + [...nameO].filter(x => !nameI.has(x)).join(' ') + '] import-only [' + [...nameI].filter(x => !nameO.has(x)).join(' ') + ']');
  // red control: leave ONE table unshifted (element_world_bbox put back to the map frame); the sweep must turn red on exactly that table
  const red = new SQL.Database(zo.db.export());
  red.run('UPDATE element_world_bbox SET minX = minX + ?, maxX = maxX + ?', [zoff[0], zoff[0]]);
  const swR = sweep(red, lo.db, zoff, shift, colsO, 'red-control');
  chk('F2 RED CONTROL: element_world_bbox left unshifted turns the sweep red on exactly that table', swR.bad.length > 0 && swR.bad.every(x => x.startsWith('element_world_bbox.')) && swR.ok === swR.judged - swR.bad.length, 'red columns ' + JSON.stringify(swR.bad) + ' of ' + swR.judged + ' judged');
  red.close();

  // ── F3 the export round trip, far leg, after (A) ─────────────────────────────────────────────────────────────────────────────────────────
  if (SKIP.includes('F3')) inc('F3 precision', 'skipped by ONE_FRAME_SKIP; not judged');
  else {
    const t0 = Date.now(), r = cp.spawnSync('node', [path.join(__dirname, 'witness_export_roundtrip.js')], { cwd: ROOT, env: Object.assign({}, process.env, { RT_FAR: FAR.join(',') }), maxBuffer: 1 << 28, timeout: 1500000 }), out = String(r.stdout || ''), logF = path.join(os.tmpdir(), 'wone_rt_far.log');
    fs.writeFileSync(logF, out + '\n--- stderr ---\n' + String(r.stderr || '')); say('§F3 W-EXPORT-ROUNDTRIP far leg ran in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, exit ' + r.status + ', full log ' + logF);
    const L = out.split('\n'), pick = (key, re) => { const l = L.find(x => x.includes('[' + key + ']') && re.test(x)); return l ? re.exec(l) : null; };
    const showFar = L.filter(x => x.includes('[Duplex_FAR]') && /C6c centre difference|C6c centre-difference histogram|C9b bbox volume per|PRECISION/.test(x) && !/^§RT \[Duplex_FAR\] C9b bbox volume per matched element within 1%:/.test(x)); showFar.forEach(x => say('  ' + x.slice(0, 330)));
    const mc = pick('Duplex_FAR', /C6c centre difference m over (\d+) matched: median=([\d.]+) max=([\d.]+)/), hist = pick('Duplex_FAR', /<=0\.001m:(\d+)/), vol = pick('Duplex_FAR', /C9b bbox volume per matched element within 1% (\d+) of (\d+)/), loc = pick('Duplex_ARC', /C6c centre difference m over (\d+) matched: median=([\d.]+) max=([\d.]+)/);
    if (!mc || !vol || !hist) inc('F3 precision', 'the far leg did not report its centre/volume lines (exit ' + r.status + '): see ' + logF);
    else {
      const matched = +mc[1], within = +hist[1], maxd = +mc[3], vx = +vol[1], vn = +vol[2];
      chk('F3 far copy centre differences within 1 mm on ALL ' + matched + ' matched elements', matched > 0 && within === matched && maxd < 0.0005, 'matched ' + matched + ' within1mm ' + within + ' max ' + maxd + ' m' + (loc ? ' (local Duplex: ' + loc[1] + ' matched, max ' + loc[3] + ' m)' : ''));
      chk('F3 far copy bbox volume within 1% on ALL matched elements', vn > 0 && vx === vn, vx + ' of ' + vn);
    }
    const pr = L.find(x => x.includes('RT-PRECISION [Duplex_FAR]') && /CONFIRMED|n\/a|neither|not float32/.test(x)); say('§F3 precision line: ' + (pr ? pr.trim() : '(none)'));
  }

  // ── F4 the site facts, as the file states them ────────────────────────────────────────────────────────────────────────────────────────────
  const LAT = [10, 20, 30, 500000], LON = [-5, -6, -7, 0], TN = [0.5, 0.8660254037844386];
  const wantLat = 10 + 20 / 60 + 30.5 / 3600, wantLon = -(5 + 6 / 60 + 7 / 3600), wantTN = Math.atan2(-TN[0], TN[1]) * 180 / Math.PI;
  const f4a = farCopy(PUB, FAR[0], FAR[1], { lat: LAT, lon: LON, trueNorth: TN }), f4b = farCopy(PUB, FAR[0], FAR[1], { lat: null, lon: null });
  for (const [lab, f, exp] of [['facts stated', f4a, { lat: wantLat, lon: wantLon, tn: wantTN, src: 'ifc_site', tns: 'ifc_truenorth' }], ['none stated', f4b, { lat: null, lon: null, tn: 0, src: 'unknown', tns: 'default_zero' }]]) {
    const ro = await openRoute(SQL, api, ROOT, enc(f.file), 'f4'), ri = await importRoute(SQL, ROOT, enc(f.file), 'f4.ifc');
    for (const [rn, r] of [['open', ro], ['import', ri]]) {
      if (!r.db) { chk('F4 ' + lab + ' (' + rn + ')', false, 'route error ' + r.error); continue; }
      const m = metaOf(r.db), lat = m.site_latitude === '' ? null : Number(m.site_latitude), lon = m.site_longitude === '' ? null : Number(m.site_longitude), tn = Number(m.true_north_angle);
      const ok = (exp.lat == null ? lat === null : Math.abs(lat - exp.lat) < 1e-9) && (exp.lon == null ? lon === null : Math.abs(lon - exp.lon) < 1e-9) && Math.abs(tn - exp.tn) < 1e-6 && m.site_latlong_source === exp.src && m.true_north_source === exp.tns;
      chk('F4 ' + lab + ' (' + rn + ' route): lat/long/true north recorded as the file states, with a source', ok, 'lat=' + m.site_latitude + ' lon=' + m.site_longitude + ' src=' + m.site_latlong_source + ' trueNorth=' + m.true_north_angle + ' (' + m.true_north_source + ') | expected ' + JSON.stringify(exp));
    }
  }
  // the public Duplex states a location (41.8744, -87.6394); an import that wrote 'unknown' for it was the reader defect
  { const ro = metaOf(lo.db), ri = metaOf(li.db);
    chk('F4 the unmodified public Duplex: both routes record the site location its IfcSite states (41.8744, -87.6394), source ifc_site', [ro, ri].every(m => Math.abs(Number(m.site_latitude) - 41.8744) < 1e-6 && Math.abs(Number(m.site_longitude) + 87.6394) < 1e-6 && m.site_latlong_source === 'ifc_site'), 'open lat=' + ro.site_latitude + ' lon=' + ro.site_longitude + ' src=' + ro.site_latlong_source + ' | import lat=' + ri.site_latitude + ' lon=' + ri.site_longitude + ' src=' + ri.site_latlong_source); }
  // IfcMapConversion (IFC4): a minimal IFC4 file that states one, no elements
  const mcText = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');\nFILE_NAME('mc.ifc','2026-11-08T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCPROJECT('0000000000000000000001',$,'MC',$,$,$,$,(#10),#20);\n#2=IFCCARTESIANPOINT((0.,0.,0.));\n#3=IFCAXIS2PLACEMENT3D(#2,$,$);\n#4=IFCDIRECTION((0.,1.));\n#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#3,#4);\n#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n#20=IFCUNITASSIGNMENT((#11));\n#30=IFCPROJECTEDCRS('EPSG:3375',$,$,$,$,$,#11);\n#31=IFCMAPCONVERSION(#10,#30,500000.5,2700000.25,12.5,0.8,0.6,1.);\nENDSEC;\nEND-ISO-10303-21;\n`;
  const mcB = new TextEncoder().encode(mcText), mo = await openRoute(SQL, api, ROOT, mcB, 'mc').catch(e => ({ err: e.message })), mi = await importRoute(SQL, ROOT, mcB, 'mc.ifc');
  const wantMC = { map_conversion_eastings: 500000.5, map_conversion_northings: 2700000.25, map_conversion_orthogonal_height: 12.5, map_conversion_x_axis_abscissa: 0.8, map_conversion_x_axis_ordinate: 0.6, map_conversion_scale: 1 };
  for (const [rn, r] of [['open', mo], ['import', mi]]) {
    if (!r.db) { inc('F4 IfcMapConversion (' + rn + ')', 'the route produced no DB for an element-less IFC4 file (' + (r.err || r.error) + '); the reader itself is exercised on the other route'); continue; }
    const m = metaOf(r.db); const ok = Object.keys(wantMC).every(k => m[k] != null && Math.abs(Number(m[k]) - wantMC[k]) < 1e-9) && m.map_conversion_target_crs === 'EPSG:3375' && m.map_conversion_source === 'ifc_mapconversion';
    chk('F4 IfcMapConversion (' + rn + ' route) recorded as stated, with its source', ok, JSON.stringify(Object.keys(m).filter(k => k.startsWith('map_conversion')).reduce((o, k) => { o[k] = m[k]; return o; }, {})));
  }
  { const m = metaOf(lo.db); chk('F4 a file with no IfcMapConversion records none', !Object.keys(m).some(k => k.startsWith('map_conversion')), 'keys: ' + Object.keys(m).filter(k => k.startsWith('map_conversion')).join(',') + '(none)'); }

  // ── F5 a local file is unchanged ───────────────────────────────────────────────────────────────────────────────────────────────────────
  if (!bt.dir) inc('F5 local file unchanged', 'no base tree: ' + bt.err);
  else {
    const SITE = ['site_latitude', 'site_longitude', 'site_elevation_m', 'site_latlong_source'];                       // the import reader defect, fixed on purpose
    const OPEN_NEW = ['true_north_angle', 'true_north_source', 'site_latitude', 'site_longitude', 'site_elevation_m', 'site_latlong_source'];   // the open route now records the site facts (the import always did)
    for (const [lab, file] of [['Duplex_ARC', PUB], ['SampleHouse_ARC', HOUSE]]) {
      if (!fs.existsSync(file)) { inc('F5 ' + lab, 'public IFC absent'); continue; }
      const bytes = enc(file), nO = await openRoute(SQL, api, ROOT, bytes, lab), oO = await openRoute(SQL, api, bt.dir, bytes, lab), nI = await importRoute(SQL, ROOT, bytes, lab + '.ifc'), oI = await importRoute(SQL, bt.dir, bytes, lab + '.ifc');
      const offs = [offOf(metaOf(nO.db)), nI.db ? offOf(metaOf(nI.db)) : null];
      chk('F5 ' + lab + ': local file (all axes < 10 km) records offset 0 on both routes and writes no georef_offset keys', offs.every(o => o && o.every(v => v === 0)) && !Object.keys(metaOf(nO.db)).concat(nI.db ? Object.keys(metaOf(nI.db)) : []).some(k => k.startsWith('georef_offset')), JSON.stringify(offs));
      const dO = diffDbs(nO.db, oO.db, OPEN_NEW);
      chk('F5 ' + lab + ' OPEN route: every table equals origin/main\'s code (project_metadata aside from the ' + OPEN_NEW.length + ' newly recorded site keys): ' + dO.same + ' of ' + dO.tables + ' tables identical', dO.same === dO.tables && dO.diffs.length === 0, dO.diffs.join('; ') || 'identical');
      const added = Object.keys(metaOf(nO.db)).filter(k => !(k in metaOf(oO.db))).sort(); say('  §F5 ' + lab + ' keys newly in the open DB\'s project_metadata: ' + added.join(','));
      if (!nI.db || !oI.db) { chk('F5 ' + lab + ' IMPORT route', false, 'import error ' + (nI.error || oI.error)); continue; }
      const dI = diffDbs(nI.db, oI.db, SITE);
      chk('F5 ' + lab + ' IMPORT route: every table equals origin/main\'s code (project_metadata aside from the 4 site rows the reader fix restores): ' + dI.same + ' of ' + dI.tables + ' tables identical', dI.same === dI.tables && dI.diffs.length === 0, dI.diffs.join('; ') || 'identical');
      const mo = metaOf(oI.db), mn = metaOf(nI.db);
      say('  §F5 ' + lab + ' IMPORT site rows: before lat=' + mo.site_latitude + ' lon=' + mo.site_longitude + ' src=' + mo.site_latlong_source + ' | after lat=' + mn.site_latitude + ' lon=' + mn.site_longitude + ' src=' + mn.site_latlong_source);
      // the far copy: the import's offset is the same as origin/main's import (the rule was lifted, not changed)
    }
    const oldFar = await importRoute(SQL, bt.dir, enc(farF.file), 'far.ifc'), newFar = fi;
    chk('F5 the lifted rebase rule: the import of the far copy gives origin/main\'s offset and the same DB (site rows aside)', !!oldFar.db && !!newFar.db && JSON.stringify(offOf(metaOf(oldFar.db))) === JSON.stringify(offOf(metaOf(newFar.db))) && diffDbs(newFar.db, oldFar.db, SITE).diffs.length === 0, 'old ' + (oldFar.db ? JSON.stringify(offOf(metaOf(oldFar.db))) : oldFar.error) + ' new ' + JSON.stringify(offOf(metaOf(newFar.db))));
    const oldOpenFar = await openRoute(SQL, api, bt.dir, enc(farF.file), 'far');
    say('§F5 context: origin/main\'s OPEN route on the far copy records offset ' + JSON.stringify(offOf(metaOf(oldOpenFar.db))) + ' and keeps centre_x of the probe at ' + probe(oldOpenFar.db)[0].toFixed(3) + ' (the map frame); the new open route ' + probe(fo.db)[0].toFixed(3));
  }

  // ── F6 regression ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (SKIP.includes('F6')) inc('F6 regression', 'skipped by ONE_FRAME_SKIP; not judged');
  else {
    const runs = [['W-IFC-GRID', 'modeller/tests/witness_ifc_grid.js', /§VERDICT CLAIM MET.*fail=0/], ['W-IFC-OPEN-ONE', 'modeller/tests/witness_ifc_open_one.js', /§VERDICT PASS W-IFC-OPEN-ONE judged=\d+ fail=0/], ['W-IFC-STOREYS', 'viewer/tests/witness_ifc_storeys.js', /VERDICT pass=\d+ fail=0/], ['W-DRAWN-MAINS', 'modeller/tests/witness_drawn_mains.js', /VERDICT PASS/]];
    for (const [n, f, re] of runs) {
      const r = cp.spawnSync('node', [path.join(ROOT, f)], { cwd: ROOT, env: Object.assign({}, process.env, { NODE_PATH: NM }), maxBuffer: 1 << 28, timeout: 900000 }), out = String(r.stdout || ''), v = out.split('\n').filter(x => /VERDICT/.test(x)).join(' || ');
      fs.writeFileSync(path.join(os.tmpdir(), 'wone_f6_' + n + '.log'), out + String(r.stderr || ''));
      chk('F6 ' + n + ' stays green', r.status === 0 && re.test(out), 'exit ' + r.status + ' | ' + (v || '(no verdict line)').slice(0, 260));
    }
  }

  say('§ONE_FRAME pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  say(fail ? '§VERDICT CLAIM NOT MET pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive : (pass === 0 ? '§VERDICT INCONCLUSIVE nothing was judged' : '§VERDICT CLAIM MET on what was judged' + (inconclusive ? '; ' + inconclusive + ' leg(s) INCONCLUSIVE' : '') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive));
  process.exit(fail || !pass ? 1 : 0);
})().catch(e => { console.log('§FAIL witness crashed | ' + (e && e.stack || e)); console.log('§VERDICT CLAIM NOT MET (crash)'); process.exit(1); });
