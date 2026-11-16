#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SEED-INDEX (bim-compiler prompts/CLI_ERP_IVR.md §37). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the door worked on a seed with NO explicit index (380 automatic ones only), because it never ran the boot index overlay the page runs, and the overlay left out every legacy
 *   UNIQUE official index (ad_column_name among them). One login-context query then scanned all of AD_Column once per table: ~4 s on every write line (§36.2: §LOGINCTX 3900 ms).
 *   X1 the door's boot runs the overlay: the list names found in the kept image + the overlay's skipped count = the whole list, > 0; ad_column_name is in the image
 *   X2 a write line (mis.new C_BP_Group) does its work in < 1000 ms, its own `§ERP new ... ms=` (was 4680 with no index; the login-context build is most of it)
 *   X3 the same lines give the same answers and op-log rows with and without the overlay (field by field, except _uu values and time stamps)
 *   X4 a duplicate Value is refused the same way with and without the overlay (uniqueness stays the model layer's save-time check; the index is a plain lookup index)
 * Falsifier (must make this witness FAIL): SEEDIDX_BREAK=noindex runs the "with" pass with ERP_BREAK=noindex too (X1, X2).
 * Every run uses a temp op-log, journal and snapshot folder; the owner's files are never touched.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, ROOT } = require('./_kit');
const k = kit('W-SEED-INDEX');
const CLI = path.join(ROOT, 'common', 'door', 'erp_cli.js');
const LIST = require(path.join(ROOT, 'erp', 'ad_official_indexes.js'));
const BREAK = process.env.SEEDIDX_BREAK || '';
const mask = (o) => Array.isArray(o) ? o.map(mask) : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => { a[k] = /_uu$|^(created|updated|t|ms)$/.test(k) ? 'X' : mask(o[k]); return a; }, {}) : (typeof o === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(o) ? 'UUID' : o);
const norm = (s) => String(s).split('\n').filter(Boolean).map(l => { try { return JSON.stringify(mask(JSON.parse(l))); } catch (e) { return l; } }).join('\n');   // keys sorted, time stamps and uuids masked at any depth

async function pass(label, breakIdx) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'seedidx_' + label + '_'));
  const env = { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'journal.jsonl'), ERP_SNAPSHOT_DIR: path.join(d, 'snap') };
  if (breakIdx) env.ERP_BREAK = 'noindex';
  fs.writeFileSync(env.BIM_OBJECT_OPLOG, '');
  const lines = [
    ['sum', 'sum', '--kind', 'Order', '--column', 'GrandTotal'],
    ['group', 'new', '--kind', 'C_BP_Group', '--where', 'Value=SIDX1', '--where', 'Name=Seed Index Group'],
    ['order', 'new', '--kind', 'Order', '--where', 'issotrx=Y', '--where', 'C_DocTypeTarget_ID=132', '--where', 'C_BPartner_ID=112', '--where', 'SalesRep_ID=101'],
    ['line', 'new', '--kind', 'C_OrderLine', '--where', 'order=50000', '--where', 'm_product_id=137', '--where', 'qtyentered=2'],
    ['prepare', 'prepare', '--kind', 'Order', '--number', '50000'],
    ['sum2', 'sum', '--kind', 'Order', '--column', 'GrandTotal'],
    ['dup', 'new', '--kind', 'Business Partner', '--where', 'Value=JoeBlock', '--where', 'Name=Duplicate Joe']
  ];
  const out = {};
  for (const [id, ...argv] of lines) {
    const t0 = Date.now(), r = await run(CLI, argv, env);
    out[id] = { out: (r.out || '').trim(), err: r.err || '', code: r.code, ms: Date.now() - t0 };
    k.L(label + ' line=' + id + ' exit=' + r.code + ' wall_ms=' + out[id].ms + ' answer=' + out[id].out.slice(0, 110).replace(/\s+/g, ' '));
  }
  const ov = /§ERP index-overlay ensure created=(\d+) present=(\d+) skipped=(\d+) analyze_ms=(-?\d+) ms=(\d+)/.exec(out.sum.err) || /INDEX_OVERLAY ensure created=(\d+) present=(\d+) skipped=(\d+) analyze_ms=(-?\d+) ms=(\d+)/.exec(out.sum.err);
  const lc = /§ERP new kind=.* ms=(\d+)/.exec(out.group.err);
  const snapFile = fs.existsSync(env.ERP_SNAPSHOT_DIR) ? fs.readdirSync(env.ERP_SNAPSHOT_DIR).filter(f => /^ad_seed-.*\.db$/.test(f)).map(f => path.join(env.ERP_SNAPSHOT_DIR, f))[0] : null;
  return { d, out, ov, lc, snapFile, ops: fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8') };
}

(async () => {
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const W = await pass('with', BREAK === 'noindex'), N = await pass('without', true);
  if (!W.snapFile) { k.incon('X1', 'no snapshot was kept in ' + W.d); return k.end(); }
  const img = new SQL.Database(fs.readFileSync(W.snapFile)), names = {};
  (img.exec("SELECT lower(name) FROM sqlite_master WHERE type='index'")[0] || { values: [] }).values.forEach(v => { names[v[0]] = 1; });
  const found = LIST.filter(e => names[String(e).split('|')[0]]).length, skipped = W.ov ? Number(W.ov[3]) : -1;
  k.L('overlay ' + (W.ov ? W.ov[0].replace(/^.*ensure /, '') : 'NO §INDEX_OVERLAY line') + ' list=' + LIST.length + ' found_in_image=' + found + ' image_bytes=' + fs.statSync(W.snapFile).size + ' without_image_bytes=' + (N.snapFile ? fs.statSync(N.snapFile).size : '?'));
  k.chk('X1 the door runs the boot index overlay: list names found in the kept image + skipped = the whole list (' + LIST.length + '), found > 0, ad_column_name present', !!W.ov && found > 0 && found + skipped === LIST.length && !!names.ad_column_name, 'found=' + found + ' skipped=' + skipped + ' ad_column_name=' + !!names.ad_column_name);
  k.chk('X2 a write line (mis.new C_BP_Group) does its work in < 1000 ms (was 4680 with no index)', !!W.lc && Number(W.lc[1]) < 1000, 'with_ms=' + (W.lc ? W.lc[1] : 'none') + ' without_ms=' + (N.lc ? N.lc[1] : 'none'));
  const same = ['sum', 'group', 'order', 'line', 'prepare', 'sum2'].filter(id => norm(W.out[id].out) === norm(N.out[id].out) && W.out[id].code === N.out[id].code);
  const opsSame = norm(W.ops) === norm(N.ops);
  k.chk('X3 the same lines give the same answers (6) and op-log rows with and without the overlay', same.length === 6 && opsSame && W.out.prepare.code === 0, 'same=' + same.join(',') + ' oplog_same=' + opsSame + ' oplog_lines=' + W.ops.split('\n').filter(Boolean).length + ' prepare=' + W.out.prepare.out.slice(0, 80));
  const refused = (o) => o.code !== 0 && /refused/.test(o.out);
  k.chk('X4 a duplicate Value is refused the same way with and without the overlay (the model layer\'s unique check)', refused(W.out.dup) && norm(W.out.dup.out) === norm(N.out.dup.out), 'with=' + W.out.dup.out.slice(0, 140));
  k.end();
})();
