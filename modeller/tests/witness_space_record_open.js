#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-SPACE-RECORD-OPEN, prompts/IMPORT_KEEPS_IFCSPACE.md "Second part". Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: a raw IFC opened in the Modeller gave the walker 0 rooms (the extractor read the rooms, then the residents' rule deleted them), while the browser
// import kept none. Do BOTH JS routes now keep ONE record of the rooms a file states, the same rooms, in a frame that differs by one constant?
// Usage: node witness_space_record_open.js <with rooms.ifc>... [--none <without rooms.ifc>]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const NM = process.env.NODE_MODULES || path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js')), initSqlJs = require(path.join(NM, 'sql.js/dist/sql-wasm.js'));
const _init = WebIFC.IfcAPI.prototype.Init; WebIFC.IfcAPI.prototype.Init = function () { return _init.call(this); };
const M = path.join(__dirname, '..'), V = path.join(M, '..', 'viewer');
const Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(M, 'ifc_open_db.js')), DW = require(path.join(M, 'disc_walker.js'));
let fails = 0, judged = 0; const W = (ok, l, d) => { judged++; if (!ok) fails++; console.log('§W_OPEN ' + (ok ? 'PASS ' : 'FAIL ') + l + (d ? ' — ' + d : '')); };
const WORKER = fs.readFileSync(path.join(V, 'import_worker.js'), 'utf8'), BUILDER = fs.readFileSync(path.join(V, 'import_db_builder.js'), 'utf8');
const sharedCtx = () => ({ URL, Blob, TextDecoder, TextEncoder, setTimeout, Math, JSON, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, Int8Array, Int16Array, ArrayBuffer, Map, Set, Object, Array, String, Number, parseInt, parseFloat, isNaN, isFinite, Promise, performance });
const quiet = { log() {}, warn() {}, error() {} };
function importRoute(SQL, file) {
  return new Promise((resolve) => {
    const self = { GeorefFrame: require(path.join(V, '..', 'common', 'georef_frame.js')) }, ctx = Object.assign(sharedCtx(), { self, WebIFC, console: quiet, importScripts() {} });
    self.postMessage = (m) => { if (m.type === 'done' || m.type === 'error') {
      if (m.type === 'error') return resolve(null);
      const c2 = Object.assign(sharedCtx(), { console: quiet }); vm.createContext(c2); vm.runInContext(BUILDER, c2); const o = c2.buildImportDBs(SQL, m);
      resolve(new SQL.Database(new Uint8Array(o.metaDb || o.extractedDb))); } };
    vm.createContext(ctx); vm.runInContext(WORKER, ctx);
    const b = fs.readFileSync(file); self.onmessage({ data: { arrayBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), filename: path.basename(file) } });
  });
}
async function openRoute(SQL, file) {
  const api = new WebIFC.IfcAPI(); api.SetWasmPath(path.join(NM, 'web-ifc') + '/', true); await api.Init();
  const r = await IOD.open({ WebIFC, ifcApi: api, SQL, Core, bytes: new Uint8Array(fs.readFileSync(file)), name: path.basename(file, '.ifc'), log() {} });
  return r.db;
}
const rows = (db, sql) => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c] = v[i]); return o; }); };
const hasT = (db, t) => db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0;
const stepCount = f => (fs.readFileSync(f, 'latin1').match(/=\s*IFCSPACE\s*\(/g) || []).length;

(async () => {
  const SQL = await initSqlJs(), args = process.argv.slice(2), noneAt = args.indexOf('--none'), none = noneAt >= 0 ? args[noneAt + 1] : null, files = args.filter((a, i) => a !== '--none' && i !== noneAt + 1);
  if (!files.length) { console.log('§W_OPEN VERDICT INCONCLUSIVE no files named'); process.exit(0); }
  for (const f of files) {
    const n = path.basename(f), want = stepCount(f), A = await importRoute(SQL, f), B = await openRoute(SQL, f);
    if (!want) { console.log('§W_OPEN ' + n + ' VACUOUS the file states no rooms, nothing judged'); continue; }
    const ra = rows(A, 'SELECT * FROM ifc_spaces ORDER BY guid'), rb = rows(B, 'SELECT * FROM ifc_spaces ORDER BY guid');
    W(ra.length === want && rb.length === want, 'R1 ' + n + ': both routes record every room', 'file ' + want + ' import ' + ra.length + ' open ' + rb.length);
    const byG = {}; ra.forEach(r => byG[r.guid] = r); let same = 0, names = 0, sizes = 0, worstSize = 0; const dx = [], dy = [], dz = [];
    rb.forEach(r => { const a = byG[r.guid]; if (!a) return; same++;
      if ((a.name || '') === (r.name || '') && (a.long_name || '') === (r.long_name || '') && (a.object_type || '') === (r.object_type || '') && (a.predefined_type || '') === (r.predefined_type || '')) names++;
      if (r.size_x != null && a.size_x != null) { const e = Math.max(Math.abs(a.size_x - r.size_x), Math.abs(a.size_y - r.size_y), Math.abs(a.size_z - r.size_z)); worstSize = Math.max(worstSize, e); sizes++; dx.push(a.center_x - r.center_x); dy.push(a.center_y - r.center_y); dz.push(a.center_z - r.center_z); } });
    W(same === want && names === want, 'R2 ' + n + ': same rooms, Name and LongName kept apart, same values', 'guids ' + same + ' equal ' + names + ' of ' + want);
    W(sizes > 0 && worstSize < 0.001, 'R3 ' + n + ': same room sizes', 'judged ' + sizes + ' worst ' + worstSize.toExponential(2) + ' m');
    const spread = a => a.length ? Math.max.apply(null, a) - Math.min.apply(null, a) : Infinity;
    W(spread(dx) < 0.001 && spread(dy) < 0.001 && spread(dz) < 0.001, 'R4 ' + n + ': the frames differ by one constant', 'offset ' + [dx[0], dy[0], dz[0]].map(v => v.toFixed(3)).join(',') + ' spread ' + [spread(dx), spread(dy), spread(dz)].map(v => v.toExponential(1)).join(','));
    const longKept = rb.filter(r => r.long_name).length; console.log('§W_OPEN ' + n + ' long names on the open route ' + longKept + ' of ' + want);
    const sp = DW.spacesOf(B);
    W(sp.length > 0, 'R5 ' + n + ': the walker reads rooms from the opened DB', 'spacesOf=' + sp.length);
    W(rows(B, "SELECT 1 x FROM elements_meta WHERE ifc_class='IfcSpace'").length === 0, 'R6 ' + n + ': the residents rule still drops the rooms element rows', '');
    B.run('DROP TABLE ifc_spaces');
    ['center_x', 'center_y', 'center_z', 'size_x', 'size_y', 'size_z'].forEach(c => { try { B.run('ALTER TABLE spatial_structure ADD COLUMN ' + c + ' REAL'); } catch (e) { } });   // the page's room pass adds these before any walk (room_walker writeRooms)
    const red = DW.spacesOf(B);
    W(red.length === 0, 'R7 RED ' + n + ': the same DB without the record gives the walker 0 rooms', 'spacesOf=' + red.length);
    A.close(); B.close();
  }
  if (none) { const B = await openRoute(SQL, none); W(!hasT(B, 'ifc_spaces'), 'R8 ' + path.basename(none) + ': a file with no rooms writes no table', 'rooms in file ' + stepCount(none)); B.close(); }
  else console.log('§W_OPEN R8 INCONCLUSIVE no --none file named');
  console.log('§W_OPEN VERDICT judged=' + judged + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§W_OPEN ERROR ' + (e && e.stack || e)); process.exit(1); });
