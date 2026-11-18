#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-YIELD: every LOD Upgrade pack's run yields to the browser in chunks and the chunked result is the SAME result. Read the log after every run (§LODUP_YIELD_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md "P7 SPEC" item 2. THE ISSUE THIS PROVES OR DISPROVES: "a long Run holds the page (P6: beam rebar ran about 26 s on the main thread)" and "chunking changed the result".
 *   SAME        run() (the sync drain, what the other witnesses judge) and runSteps() driven in 25 ms slices (what the browser does) give the same SHA-256 over every part's guid / name / class / vertices and every change row.
 *   SLICES      the driven run really yielded (more than one slice; a vacuous drive that ran in one slice is INCONCLUSIVE, never PASS) and reports its longest slice.
 *   LIMIT       beambars (the pack the owner measured at 26 s): the longest slice <= 200 ms. rebar / welds / layers: the same limit. joints / gussets: the longest slice is reported and must be under a fifth of the whole run
 *               (their first touch of one large neighbour mesh builds its triangle grid in one step; measured and stated, not tuned).
 *   BREAK       the red control: a 1e9 ms budget (one slice for the whole run) must FAIL LIMIT for beambars.
 * Inputs by environment only: LODUP_SRC_DB (the base model, for joints / gussets / beambars), LODUP_MARKS_JSON, LODUP_SHED_DB (rebar, welds), LODUP_LAYER_DB (layers). A pack whose input is unset is INCONCLUSIVE.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..'), E = process.env;
var Reg = require(path.join(ROOT, 'lod/lod_registry.js')), Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js'));
var Packs = { rebar: require(path.join(ROOT, 'lod/rebar_pack.js')), welds: require(path.join(ROOT, 'lod/weld_pack.js')), layers: require(path.join(ROOT, 'lod/layer_pack.js')), joints: require(path.join(ROOT, 'lod/joint_pack.js')), gussets: require(path.join(ROOT, 'lod/gusset_pack.js')), beambars: require(path.join(ROOT, 'lod/beambar_pack.js')) };
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var FAILS = [], INCONC = [], LIMIT = parseFloat(E.LODUP_SLICE_LIMIT_MS || '200');
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_YIELD_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function hashOf(r) { var h = crypto.createHash('sha256'); r.parts.forEach(function (p) { h.update(p.guid + '|' + p.name + '|' + p.cls); h.update(Buffer.from(p.tris.buffer, p.tris.byteOffset, p.tris.byteLength)); }); h.update(JSON.stringify(r.changes)); return h.digest('hex'); }
var PLAN = [['rebar', 'LODUP_SHED_DB'], ['welds', 'LODUP_SHED_DB'], ['layers', 'LODUP_LAYER_DB'], ['joints', 'LODUP_SRC_DB'], ['gussets', 'LODUP_SRC_DB'], ['beambars', 'LODUP_SRC_DB']];
function rowsFor(id) { var P = Packs[id], base = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', P.rulesFile), 'utf8'))); return id === 'rebar' ? Rules.merge(base, { column_zone_A_stated_in: { value: parseFloat(E.LODUP_ZONE_IN || '20'), unit: 'in', source: 'stated: LODUP_ZONE_IN' } }).rows : base; }
async function main() {
  var SQL = await initSqlJs({ wasmBinary: wasmBinary }), cache = {};
  for (var k = 0; k < PLAN.length; k++) {
    var id = PLAN[k][0], envKey = PLAN[k][1], dbp = E[envKey];
    if (!dbp || (id === 'beambars' && !E.LODUP_MARKS_JSON)) { verdict(id.toUpperCase(), null, 'pack=' + id + ' ' + envKey + (id === 'beambars' ? ' / LODUP_MARKS_JSON' : '') + ' not set: not judged'); continue; }
    if (!cache[dbp]) cache[dbp] = new SQL.Database(new Uint8Array(fs.readFileSync(dbp)));
    var inp = Reader.fromDb(cache[dbp]); inp.callouts = []; inp.inputs = id === 'beambars' ? { beambars: { schedule: Packs.beambars.attachFormat(JSON.parse(fs.readFileSync(E.LODUP_MARKS_JSON, 'utf8')), JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/schedule_formats.json'), 'utf8')).formats).json } } : {}; inp.generated = function () { return []; };
    var P = Packs[id], rows = rowsFor(id), t0 = Date.now(), a = P.run(inp, rows, { log: function () { } }), tSync = Date.now() - t0;
    t0 = Date.now(); var d = await Reg.kit.drive(P.runSteps(inp, rows, { log: function () { } }), { budgetMs: 25, wait: function () { return new Promise(function (r) { setImmediate(r); }); } }), tDriven = Date.now() - t0, b = d.value;
    var same = hashOf(a) === hashOf(b) && a.parts.length === b.parts.length, mx = d.stats.maxSliceMs;
    var lim = (id === 'joints' || id === 'gussets') ? tSync / 5 : LIMIT, okLimit = mx <= lim;
    var line = 'pack=' + id + ' parts=' + a.parts.length + ' sync_ms=' + tSync + ' driven_ms=' + tDriven + ' slices=' + d.stats.slices + ' maxSliceMs=' + Math.round(mx) + ' limit_ms=' + Math.round(lim) + ' sha=' + hashOf(a).slice(0, 16);
    console.log('§LODUP_YIELD_RUN ' + line);
    verdict('SAME_' + id.toUpperCase(), a.parts.length ? same : null, 'sync_vs_driven_identical=' + same + ' parts=' + a.parts.length + (a.parts.length ? '' : ' (nothing built: not judged)'));
    verdict('SLICES_' + id.toUpperCase(), a.parts.length && d.stats.slices > 1 ? true : null, 'slices=' + d.stats.slices + (d.stats.slices > 1 ? '' : ' (the whole run fit in one 25 ms slice: nothing to yield, so the drive was not judged; INCONCLUSIVE per the header, never PASS)'));
    verdict('LIMIT_' + id.toUpperCase(), a.parts.length ? okLimit : null, 'maxSliceMs=' + Math.round(mx) + ' limit_ms=' + Math.round(lim) + (id === 'joints' || id === 'gussets' ? ' (one fifth of the sync run)' : ''));
    if (id === 'beambars') {   // the red control: one slice for the whole run must FAIL the limit
      var dd = await Reg.kit.drive(P.runSteps(inp, rows, { log: function () { } }), { budgetMs: 1e9 }), brk = dd.stats.maxSliceMs;
      verdict('BREAK_CHECK', brk > LIMIT, 'switch=on (budget 1e9 ms = no yielding): maxSliceMs=' + Math.round(brk) + ' slices=' + dd.stats.slices + ' expected LIMIT=FAIL got LIMIT=' + (brk <= LIMIT ? 'PASS' : 'FAIL'));
    }
  }
  console.log('§LODUP_YIELD_SUMMARY failed=' + (FAILS.join(',') || 'none') + ' inconclusive=' + (INCONC.join(',') || 'none'));
  process.exit(FAILS.length ? 1 : 0);
}
main().catch(function (e) { console.error('§LODUP_YIELD_CRASH ' + (e && e.stack || e)); process.exit(2); });
