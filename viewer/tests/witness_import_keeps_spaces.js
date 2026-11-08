#!/usr/bin/env node
// W-IMPORT-SPACES (prompts/IMPORT_KEEPS_IFCSPACE.md). Issue proved or disproved: the browser IFC import threw away the file's
// stated rooms and finish properties. Keeps them as a record; the Find panel room injection (needle, auto-inject) stays the owner of the Viewer's rooms.
// Runs the REAL viewer/import_worker.js + REAL import_db_builder.js in node. Files are named on the command line.
// Usage: node witness_import_keeps_spaces.js <file.ifc>...   Env: PARITY_IFC + PARITY_DB compare one file with an extractor DB.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Buffer } = require('buffer');
const NM = process.env.NODE_MODULES || '/home/red1/bim-compiler/node_modules';
const WebIFC = require(path.join(NM, 'web-ifc/web-ifc-api-node.js'));
const _init = WebIFC.IfcAPI.prototype.Init; WebIFC.IfcAPI.prototype.Init = function () { return _init.call(this); };
const initSqlJs = require(path.join(NM, 'sql.js/dist/sql-wasm.js'));
const VIEWER = path.join(__dirname, '..');
const WORKER = fs.readFileSync(path.join(VIEWER, 'import_worker.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(VIEWER, 'import_db_builder.js'), 'utf8');
let fails = 0, judged = 0;
const W = (ok, label, detail) => { judged++; if (!ok) fails++; console.log(`§W ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); };

function runWorker(file, src) {
  return new Promise((resolve) => {
    const logs = [], self = { GeorefFrame: require(path.join(VIEWER, '..', 'common', 'georef_frame.js')) };
    const con = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
    const ctx = { self, WebIFC, console: con, importScripts: () => {}, URL, Blob, TextDecoder, TextEncoder, setTimeout, Math, JSON, Date, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Uint16Array, ArrayBuffer, Map, Set, Promise, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
    self.postMessage = (m) => { if (m.type === 'done' || m.type === 'error') resolve({ msg: m, logs }); };
    vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'import_worker.js' });
    const b = fs.readFileSync(file);
    self.onmessage({ data: { arrayBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), filename: path.basename(file) } });
  });
}
function build(SQL, data) {
  const logs = [], ctx = { console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) }, Uint8Array, Float32Array, Uint32Array, Math, JSON, Date };
  vm.createContext(ctx); vm.runInContext(BUILDER, ctx, { filename: 'import_db_builder.js' });
  const out = ctx.buildImportDBs(SQL, data);
  return { db: new SQL.Database(new Uint8Array(out.metaDb || out.extractedDb)), logs };
}
const count = (s) => (s.match(/=\s*IFCSPACE\s*\(/g) || []).length;
const q1 = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values[0][0] : 0; };
const tables = (db) => { const r = db.exec("SELECT name FROM sqlite_master WHERE type='table'"); return r.length ? r[0].values.map(x => x[0]) : []; };

(async () => {
  const SQL = await initSqlJs();
  const files = process.argv.slice(2);
  if (!files.length) { console.log('§W VERDICT INCONCLUSIVE no files named'); process.exit(2); }
  let withSpaces = 0, noSpaces = 0;
  for (const f of files) {
    const name = path.basename(f), text = fs.readFileSync(f, 'latin1'), want = count(text);
    const { msg, logs } = await runWorker(f, WORKER);
    if (msg.type === 'error') { W(false, name, 'worker error ' + msg.message); continue; }
    logs.filter(l => /§IMPORT_SPACES/.test(l)).forEach(l => console.log('  ' + l));
    const { db, logs: blogs } = build(SQL, msg);
    blogs.filter(l => /§IMPORT_SPACES_DB/.test(l)).forEach(l => console.log('  ' + l));
    const t = tables(db);
    W(!t.includes('spatial_structure') && !t.includes('rel_contained_in_space'), `W0 ${name}: the import writes nothing the Find panel room injection owns, so its needle still fires`, `tables ${t.length}`);
    if (want === 0) {
      noSpaces++;
      W(!t.includes('ifc_spaces') && !t.includes('element_pset_common'), `W2 ${name}: no IfcSpace in the file writes no new table`, '');
      db.close(); continue;
    }
    withSpaces++;
    const n = q1(db, 'SELECT COUNT(*) FROM ifc_spaces');
    W(n === want, `W1 ${name}: every IfcSpace in the file is recorded`, `file ${want}, DB ${n}`);
    const box = q1(db, 'SELECT COUNT(*) FROM ifc_spaces WHERE center_x IS NOT NULL AND size_x>0'), st = q1(db, 'SELECT COUNT(*) FROM ifc_spaces WHERE storey IS NOT NULL');
    W(box > 0 && st > 0, `W1b ${name}: rooms have a box and a storey`, `box ${box}, storey ${st} of ${n}`);
    const ex = db.exec('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y) FROM element_transforms')[0].values[0];
    // A frame error moves every room; one room outside can be the model's own stray (seen on a real set, and the extractor agrees).
    const outR = db.exec(`SELECT name FROM ifc_spaces WHERE center_x IS NOT NULL AND (center_x<${ex[0] - 5} OR center_x>${ex[1] + 5} OR center_y<${ex[2] - 5} OR center_y>${ex[3] + 5})`);
    const outs = outR.length ? outR[0].values.map(x => x[0]) : [];
    W(outs.length <= box * 0.1, `W3 ${name}: rooms sit in the same frame as the elements`, `${outs.length} of ${box} room centres outside the element extent + 5 m${outs.length ? ', named: ' + outs.join(' ') : ''}`);
    const notSpace = q1(db, 'SELECT COUNT(*) FROM element_pset_common p LEFT JOIN ifc_spaces s ON s.guid=p.guid WHERE s.guid IS NULL');
    const hasCov = /FloorCovering/.test(text), cov = q1(db, "SELECT COUNT(*) FROM element_pset_common WHERE name='FloorCovering'");
    W(notSpace === 0 && (hasCov ? cov > 0 : true), `W4 ${name}: properties land on rooms only`, `rows ${q1(db, 'SELECT COUNT(*) FROM element_pset_common')}, FloorCovering ${cov}${hasCov ? '' : ' (file states none: not judged)'}, off-room ${notSpace}`);
    W(!t.includes('element_psets'), `W4b ${name}: civil road panel table stays absent`, '');
    if (process.env.PARITY_IFC && path.resolve(process.env.PARITY_IFC) === path.resolve(f) && process.env.PARITY_DB) {
      const ref = new SQL.Database(fs.readFileSync(process.env.PARITY_DB));
      const R = {}; ref.exec("SELECT guid,name,center_x,center_y,center_z,size_x,size_y,size_z FROM spatial_structure WHERE type='IfcSpace'")[0].values.forEach(v => { R[v[0]] = v; });
      const rows = db.exec('SELECT guid,name,center_x,center_y,center_z,size_x,size_y,size_z FROM ifc_spaces')[0].values;
      let miss = 0, nameBad = 0, sizeBad = 0, cmp = 0, maxSize = 0; const off = [[], [], []];
      rows.forEach(v => {
        const r = R[v[0]]; if (!r) { miss++; return; }
        if (r[1] !== v[1]) nameBad++;
        if (r[2] == null || v[2] == null) return; cmp++;
        for (let a = 0; a < 3; a++) { off[a].push(v[2 + a] - r[2 + a]); const d = Math.abs(v[5 + a] - r[5 + a]); maxSize = Math.max(maxSize, d); if (d > 0.02) sizeBad++; }
      });
      const spread = off.map(o => Math.max(...o) - Math.min(...o));
      W(miss === 0 && nameBad === 0 && Object.keys(R).length === rows.length, 'W6 parity with the extractor DB: same rooms and names', `DB ${rows.length}, extractor ${Object.keys(R).length}, missing ${miss}, name differs ${nameBad}`);
      W(cmp > 0 && sizeBad === 0 && spread.every(x => x < 0.02), 'W6b parity: same sizes, one constant frame offset', `compared ${cmp}, max size diff ${maxSize.toFixed(4)} m, offset ${off.map(o => o[0].toFixed(3)).join(',')}, spread ${spread.map(x => x.toFixed(4)).join(',')}`);
      const refCols = ref.exec('PRAGMA table_info(ifc_spaces)');
      if (refCols.length) {
        const LN = {}; ref.exec('SELECT guid,long_name FROM ifc_spaces')[0].values.forEach(v => { LN[v[0]] = v[1]; });
        const lnRows = db.exec('SELECT guid,long_name FROM ifc_spaces')[0].values, lnBad = lnRows.filter(v => LN[v[0]] !== v[1]).length, lnSet = lnRows.filter(v => v[1]).length;
        W(lnSet > 0 && lnBad === 0, 'W7 parity: both routes record the same long names', `named ${lnSet} of ${lnRows.length}, differ ${lnBad}`);
      } else console.log('  §W7 INCONCLUSIVE extractor DB has no ifc_spaces, long names not compared');
      ref.close();
    }
    if (process.env.KEEP_DB && want > 0) { fs.writeFileSync(process.env.KEEP_DB, Buffer.from(db.export())); console.log('  §KEEP_DB ' + name + ' written'); }
    db.close();
  }
  // Red control: the same witness on a worker with the pass removed must fail W1.
  const redFile = files.find(f => count(fs.readFileSync(f, 'latin1')) > 0);
  if (redFile) {
    const broken = WORKER.replace('_spIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSPACE)', '_spIds = { size: function () { return 0; } }');
    const { msg } = await runWorker(redFile, broken);
    W(broken !== WORKER && (msg.spaces || []).length === 0, 'RED control: with the room pass removed the worker returns 0 rooms, so W1 can fail', `rooms ${(msg.spaces || []).length}`);
  }
  if (!withSpaces) { console.log(`§W VERDICT INCONCLUSIVE no named file has IfcSpace (no-space files ${noSpaces})`); process.exit(2); }
  console.log(`§W VERDICT ${fails ? 'FAIL' : 'PASS'} ${judged - fails} of ${judged}; files with rooms ${withSpaces}, without ${noSpaces}`);
  process.exit(fails ? 1 : 0);
})();
