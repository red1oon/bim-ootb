#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-OPEN-FILLS (rule D69, prompts/DXF2BIM_FOUNDATION_LANE.md §D69; architect review SEAM-8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: an .ifc opened in the Modeller (or imported in the Viewer) was built by viewer/import_db_builder.js with no rel_fills_host, so no door or window rode its wall
 * on ANY opened IFC; the resident dbs and the Viewer-DB export (the shared extractor core) have the table.
 *   I1 SAME     — the import db's rel_fills_host rows = the extractor core's (bim-compiler extractIFC2DB.js on the same file): same (opening, host, filling) triples, 0 missing, 0 extra; schema = the core's.
 *   I2 OPEN     — the Modeller's raw-IFC open (since P-X: modeller/ifc_open_db.js, the shared extractor + the residents' rule; the _filterArc path is retired) keeps rel_fills_host and every row's host
 *                 is an element of the db; a filling is in the db or NULL.
 *   I3 FALSIFIER — the file with its IFCRELFILLSELEMENT lines removed: every row void-only (filling NULL), as the core gives; with IFCRELVOIDSELEMENT removed too: 0 rows.
 *   I4 SAME     — every other table of the import db has the same rows as BASE's builder + worker (BASE=<repo root at origin/main>).
 * The worker runs in a Node vm (importScripts shim; web-ifc = the Node build of the Viewer's 0.0.77): the Viewer's own parse, not a re-implementation. No browser.
 * Usage: NODE_PATH=<bim-compiler node_modules> [BASE=<repo root>] node modeller/tests/witness_ifc_open_fills.js <file.ifc> [<more.ifc>]
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..'), BASE = process.env.BASE || null;
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler/node_modules/sql.js'));
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const ifcs = process.argv.slice(2); if (!ifcs.length) { say('MISSING input: an .ifc (e.g. ~/bim-compiler/reference/residential/Ifc2x3_Duplex_Architecture.ifc)'); process.exit(2); }
function runWorker(root, bytes, filename) {   // the Viewer's import_worker.js in a vm context; resolves with the 'done' message
  return new Promise((resolve, reject) => {
    const vdir = path.join(root, 'viewer'), keep = s => /§REL_FILLS|§BOM_TREE/.test(String(s)), quiet = { log(s) { if (process.env.WDBG && keep(s)) console.log('  [worker] ' + s); }, warn(s) { if (process.env.WDBG) console.log('  [worker!] ' + s); }, error() {}, info() {} };
    const ctx = { console: quiet, setTimeout, clearTimeout, TextDecoder, TextEncoder, URL, Blob, WebAssembly, performance, process, require, __dirname: vdir, __filename: path.join(vdir, 'import_worker.js'), Buffer, atob: s => Buffer.from(s, 'base64').toString('binary') };
    ctx.self = ctx; ctx.globalThis = ctx;
    // web-ifc: the Node build of the same version the Viewer ships (0.0.77; the IIFE refuses to run outside a browser); every other script is the Viewer's own file
    ctx.importScripts = f => { if (/web-ifc-api-iife\.js$/.test(f)) { ctx.WebIFC = require(path.join(process.env.HOME, 'bim-compiler/node_modules/web-ifc')); return; } const p = path.join(vdir, f); vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p }); };
    ctx.postMessage = m => { if (m && m.type === 'done') resolve(m); else if (m && m.type === 'error') reject(new Error(m.message)); };
    vm.createContext(ctx);
    // the worker's locateFile answers 'lib/<wasm>' (its same-origin path): a scratch dir whose lib/ is the Node package's folder
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'w-ifc-wasm-')); fs.symlinkSync(path.join(process.env.HOME, 'bim-compiler/node_modules/web-ifc'), path.join(wd, 'lib'));
    const cwd = process.cwd(); process.chdir(wd);
    vm.runInContext(fs.readFileSync(path.join(vdir, 'import_worker.js'), 'utf8'), ctx, { filename: 'import_worker.js' });
    Promise.resolve(ctx.onmessage({ data: { arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filename } })).catch(reject).finally(() => process.chdir(cwd));
  });
}
function buildDb(root, SQL, data) { const ctx = { console: { log() {}, warn() {}, error() {} }, SQL, data, Uint8Array, Float32Array, Uint32Array, Math, JSON, Date, Object, Array };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'viewer', 'import_db_builder.js'), 'utf8') + '\n;__out = buildImportDBs(SQL, data);', ctx); return new SQL.Database(new Uint8Array(ctx.__out.extractedDb)); }
async function modellerOpen(root, SQL, bytes, name) {   // the Modeller's own open (P-X): modeller/ifc_open_db.js over the shared extractor, as ifc_open_worker.js runs it
  const WI = require(path.join(process.env.HOME, 'bim-compiler/node_modules/web-ifc')), api = new WI.IfcAPI(); await api.Init();
  const Core = require(path.join(root, 'modeller', 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(root, 'modeller', 'ifc_open_db.js'));
  return (await IOD.open({ WebIFC: WI, ifcApi: api, SQL, Core, bytes: new Uint8Array(bytes), name, log: () => {} })).db; }
const rows = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
(async () => {
  const SQL = await initSqlJs();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-ifc-fills-'));
  for (const f of ifcs) {
    const name = path.basename(f, '.ifc'), bytes = fs.readFileSync(f);
    const parsed = await runWorker(ROOT, bytes, path.basename(f)), db = buildDb(ROOT, SQL, parsed);
    const got = rows(db, 'SELECT opening_guid, host_guid, filling_guid FROM rel_fills_host ORDER BY 1');
    const schema = rows(db, "SELECT sql FROM sqlite_master WHERE name='rel_fills_host'");
    // the core's rows: bim-compiler extractIFC2DB.js (the shared extractor core) on the same file
    const ref = path.join(tmp, name + '_core.db'), ex = cp.spawnSync('node', [path.join(process.env.HOME, 'bim-compiler/scripts/extractIFC2DB.js'), '--ifc', f, '-o', ref], { encoding: 'utf8', timeout: 600000 });
    const rdb = fs.existsSync(ref) ? new SQL.Database(fs.readFileSync(ref)) : null, want = rdb ? rows(rdb, 'SELECT opening_guid, host_guid, filling_guid FROM rel_fills_host ORDER BY 1') : null;
    const wantSchema = rdb ? rows(rdb, "SELECT sql FROM sqlite_master WHERE name='rel_fills_host'") : null;
    const k = r => r.join('|'), W = new Set((want || []).map(k)), G = new Set((got || []).map(k));
    const miss = [...W].filter(x => !G.has(x)), extra = [...G].filter(x => !W.has(x));
    check('I1[' + name + ']', 'the import db\'s rel_fills_host = the extractor core\'s (same triples, same schema)', got && want && want.length > 0 && !miss.length && !extra.length && JSON.stringify(schema) === JSON.stringify(wantSchema),
      `import=${got ? got.length : 'no table'} core=${want ? want.length : 'n/a ' + (ex.stdout || '').slice(-120)} filled=${(got || []).filter(r => r[2]).length} missing=${miss.length} extra=${extra.length} schema_same=${JSON.stringify(schema) === JSON.stringify(wantSchema)}`);
    // I2: the Modeller's open (P-X)
    const a = await modellerOpen(ROOT, SQL, bytes, name);
    const ar = rows(a, 'SELECT r.host_guid, r.filling_guid, (SELECT count(*) FROM elements_meta m WHERE m.guid = r.host_guid), (SELECT count(*) FROM elements_meta m WHERE m.guid = r.filling_guid) FROM rel_fills_host r') || [];
    check('I2[' + name + ']', 'the Modeller\'s open keeps rel_fills_host; every row\'s host is in the db; a filling is in the db or NULL', ar.length > 0 && ar.every(r => r[2] === 1 && (r[1] === null || r[3] === 1)), `rows=${ar.length} filled=${ar.filter(r => r[1]).length} hosts_missing=${ar.filter(r => r[2] !== 1).length}`);
    // I3: falsifiers on edited copies of the file
    const txt = bytes.toString('latin1'), noFill = txt.split('\n').filter(l => !/IFCRELFILLSELEMENT\(/i.test(l)).join('\n'), noBoth = noFill.split('\n').filter(l => !/IFCRELVOIDSELEMENT\(/i.test(l)).join('\n');
    const r1 = rows(buildDb(ROOT, SQL, await runWorker(ROOT, Buffer.from(noFill, 'latin1'), path.basename(f))), 'SELECT count(*), sum(filling_guid IS NOT NULL) FROM rel_fills_host')[0];
    const r2 = rows(buildDb(ROOT, SQL, await runWorker(ROOT, Buffer.from(noBoth, 'latin1'), path.basename(f))), 'SELECT count(*) FROM rel_fills_host')[0];
    check('I3[' + name + ']', 'FALSIFIER fills removed -> void-only rows; voids removed too -> 0 rows', r1 && r1[0] > 0 && !r1[1] && r2 && r2[0] === 0, `no_fills rows=${r1 && r1[0]} filled=${r1 && r1[1]} no_voids rows=${r2 && r2[0]}`);
    if (BASE) {   // I4: every other table, same rows as BASE
      const bp = await runWorker(BASE, bytes, path.basename(f)), b = buildDb(BASE, SQL, bp);
      const tabs = rows(b, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1").map(r => r[0]), tabsNew = rows(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1").map(r => r[0]);
      const sel = t => 'SELECT * FROM "' + t + '"' + (t === 'project_metadata' ? " WHERE key <> 'import_date'" : '');   // import_date = the run's clock
      const diff = tabs.filter(t => JSON.stringify(rows(b, sel(t))) !== JSON.stringify(rows(db, sel(t))));
      const added = tabsNew.filter(t => tabs.indexOf(t) < 0);
      // the table set may only grow by rel_fills_host (the PR that added it); once BASE has it too, nothing is added (P-X 2026-11-02: the clause read '== ["rel_fills_host"]' and failed on a BASE that already holds it)
      check('I4[' + name + ']', 'every table has BASE\'s rows; no table added beyond rel_fills_host', !diff.length && added.every(t => t === 'rel_fills_host'), `tables=${tabs.length} differ=${JSON.stringify(diff)} added=${JSON.stringify(added)}`);
    } else say('INCONCLUSIVE I4[' + name + '] no BASE');
  }
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { say('FAIL harness ' + e.stack); process.exit(1); });
