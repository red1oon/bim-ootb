#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-NEIGHBOURS: the clash neighbours of a LOD Upgrade pack are the model as read PLUS every live generated part of the other packs in the op-log. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P6 item 0 (the P5 known limit: "a model whose joints were run in the Modeller would not see them"). Seam: LodOps.fromOps (op-log rows -> world soups) -> inp.generated() ->
 * LodJointPack.kit.seedGenerated (joints AND gussets; any future pack calls the same function) + clearPost(..., extraParts).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "Run Joints then Run Gussets (either order) can leave a gusset part overlapping a fin-plate part".
 *   SEED_RULES        a unit test of the seed: own pack skipped, aggregate children (parts_of: layers, rebar) skipped, a guid the model already holds skipped, noGenerated = the old behaviour (nothing seeded).
 *   ORDER_JG / ORDER_GJ   on the real model (JPAM-class): run the first pack, rebuild its parts from the op rows (float32 + centre), run the second pack with them as neighbours, then CLEAR_POST over ALL generated parts
 *                     (every part's surface against every other solid, the model included): 0 overlaps required. Two scenarios: the model as read, and the model with the fin plates of the oracle run hidden
 *                     (the base DB already holds 150 of them as elements, which is why P5 saw no overlap: this scenario is the Modeller's, where they are op-log rows only).
 *   BREAK_OLD         the same runs with opts.noGenerated (the old behaviour): the overlap count it leaves. Reported as measured; a 0 here is the truth about this model, printed INCONCLUSIVE for the control, not tuned.
 * Inputs by environment only: LODUP_SRC_DB (the base model, read only). Unset -> SEED_RULES only; the order runs are INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = undefined;
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Joint = require(path.join(ROOT, 'lod/joint_pack.js')), Gusset = require(path.join(ROOT, 'lod/gusset_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, FAILS = [], INCONC = [], K = Joint.kit, quiet = function () { };
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }

// rows the op-log would hold for a run's parts, and the meshes it stores: fromOps rebuilds them (float32 + centre)
function liveOf(parts, packId, meta) { var b = Ops.build(parts, packId, meta), byHash = {}; b.assets.forEach(function (a) { byHash[a.hash] = a; }); return Ops.fromOps(b.ops.map(function (o) { return { guid: o.outputGuid, params: o.params }; }), function (h) { return byHash[h]; }); }
function itemsOf(parts) { return parts.map(function (p) { return { guid: p.guid, beam: p.beam, support: p.support, kind: p.kind, atype: p.atype, tris: p.tris }; }); }
function hide(inp, re) {   // the model without some elements (their meta, boxes, meshes): a new src key, so no cache is shared
  var meta = {}; Object.keys(inp.meta).forEach(function (g) { if (!re.test(g)) meta[g] = inp.meta[g]; });
  var o = Object.assign({}, inp, { meta: meta, src: {}, boxes: function () { var b = inp.boxes(), r = {}; Object.keys(b).forEach(function (g) { if (!re.test(g)) r[g] = b[g]; }); return r; }, mesh: function (g) { return re.test(g) ? null : inp.mesh(g); }, world: function (g) { return re.test(g) ? null : inp.world(g); } });
  return o;
}

// ---- SEED_RULES (always runs): hand-built parts
(function () {
  var box = function (x) { return Float64Array.from([x, 0, 0, x + 1, 0, 0, x, 1, 0, x, 0, 1, x + 1, 0, 1, x, 1, 1]); };
  var live = [{ guid: 'GEN-CR-1-A-PL', cls: 'IfcPlate', name: 'own', tris: box(0), parents: [] }, { guid: 'GEN-RB-1-BOT', cls: 'IfcReinforcingBar', name: 'rebar', tris: box(2), parents: ['B1'] }, { guid: 'GEN-GU-1-A-PL', cls: 'IfcPlate', name: 'other pack', tris: box(4), parents: [] },
    { guid: 'GEN-WD-1', cls: 'IfcFastener', name: 'in the model already', tris: box(6), parents: [] }, { guid: 'GEN-X-1', cls: 'IfcPlate', name: 'empty', tris: new Float64Array(0), parents: [] }];
  var inp = { meta: { 'GEN-WD-1': { cls: 'IfcFastener' } }, generated: function () { return live; } };
  var G = K.seedGenerated(inp, {}, 'GEN-CR-'), off = K.seedGenerated(inp, { noGenerated: true }, 'GEN-CR-'), none = K.seedGenerated({ meta: {} }, {}, 'GEN-CR-');
  verdict('SEED_RULES', Object.keys(G).join() === 'GEN-GU-1-A-PL' && G['GEN-GU-1-A-PL'].seeded === true && Math.abs(G['GEN-GU-1-A-PL'].box[1][0] - 5) < 1e-12 && Object.keys(off).length === 0 && Object.keys(none).length === 0 && K.seededItems(G).length === 1,
    'seeded=' + Object.keys(G).join() + ' (own prefix GEN-CR-, the parts_of child GEN-RB-, the guid already in the model, the empty mesh: all skipped); noGenerated seeds ' + Object.keys(off).length + '; an input with no generated list seeds ' + Object.keys(none).length);
})();

if (!SRC) {
  verdict('ORDER', null, 'LODUP_SRC_DB unset: the real-model runs (joints then gussets, gussets then joints, the old behaviour) were not made');
  console.log('§LODUP_SUMMARY pack=neighbours failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + INCONC.join(',') + ' mode=synthetic'); process.exit(FAILS.length ? 1 : 0);
}
initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))), base = Reader.fromDb(db); base.callouts = [];
  var JR = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/joint_defaults.json'), 'utf8'))), GR = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/gusset_defaults.json'), 'utf8')));
  var nCR = Object.keys(base.meta).filter(function (g) { return /^GEN-CR-/.test(g); }).length;
  console.log('§LODUP_MODE pack=neighbours source=LODUP_SRC_DB (real) elements=' + Object.keys(base.meta).length + ' fin_plate_elements_already_in_the_model=' + nCR);
  var scen = [['model as read', base], ['model with its ' + nCR + ' fin-plate elements hidden (they are op-log rows only, as in the Modeller)', hide(base, /^GEN-CR-/)]], tot = {};
  scen.forEach(function (sc, si) {
    var name = sc[0], inpS = sc[1], t0 = Date.now();
    // ---- joints then gussets
    var J = Joint.run(inpS, JR, { log: quiet }), jLive = liveOf(J.parts, 'joints', inpS.meta), inpG = Object.assign({}, inpS, { generated: function () { return jLive; } });
    var Gn = Gusset.run(inpG, GR, { log: quiet }), Go = Gusset.run(inpG, GR, { log: quiet, noGenerated: true });
    var postN = Gusset.clearPost(inpS, GR, itemsOf(J.parts).concat(itemsOf(Gn.parts)), quiet), postO = Gusset.clearPost(inpS, GR, itemsOf(J.parts).concat(itemsOf(Go.parts)), quiet);
    var seedSeen = Object.keys(K.seedGenerated(inpG, {}, 'GEN-GU-')).length;
    verdict('ORDER_JG', J.parts.length && (si === 0 || seedSeen === J.parts.length) ? postN.fails.length === 0 : null, '[' + name + '] joints=' + J.stats.joints + ' (' + J.parts.length + ' parts) then gussets=' + Gn.stats.joints + ' (' + Gn.parts.length + ' parts; neighbours seeded from ' + seedSeen + ' live joint parts' + (si === 0 ? ': 0 because the model already holds them as elements, so the seed skips them' : '') + '): CLEAR_POST over ALL ' + (J.parts.length + Gn.parts.length) + ' generated parts: overlaps=' + postN.fails.length + (postN.fails[0] ? ' first=' + JSON.stringify(postN.fails[0]) : '') + ' (large neighbours surface-tested only: ' + postN.skipped.length + ')');
    var bw = !Go.parts.length && !J.parts.length ? null : postO.fails.length > 0;
    verdict('BREAK_OLD_JG', bw === true ? true : null, '[' + name + '] old behaviour (noGenerated): gussets=' + Go.stats.joints + ' (' + Go.parts.length + ' parts) instead of ' + Gn.stats.joints + '; CLEAR_POST over all parts: overlaps=' + postO.fails.length + (postO.fails[0] ? ' first=' + JSON.stringify(postO.fails[0]) : '') + (bw === true ? ' (the red control shows the overlap)' : ' (measured truth: the old behaviour shows no overlap on this scenario, so the control cannot discriminate here)'));
    tot[si] = { jg: postN.fails.length, jgOld: postO.fails.length, gN: Gn.stats.joints, gO: Go.stats.joints, j: J.stats.joints };
    // ---- gussets then joints (the other order)
    var G0 = Gusset.run(inpS, GR, { log: quiet }), gLive = liveOf(G0.parts, 'gussets', inpS.meta), inpJ = Object.assign({}, inpS, { generated: function () { return gLive; } });
    var Jn = Joint.run(inpJ, JR, { log: quiet }), Jo = Joint.run(inpJ, JR, { log: quiet, noGenerated: true });
    var pN = Gusset.clearPost(inpS, GR, itemsOf(G0.parts).concat(itemsOf(Jn.parts)), quiet), pO = Gusset.clearPost(inpS, GR, itemsOf(G0.parts).concat(itemsOf(Jo.parts)), quiet);   // one re-check over ALL parts (its prefix rules also skip the model's own duplicates of a joint plate)
    verdict('ORDER_GJ', G0.parts.length && (si === 0 || Object.keys(K.seedGenerated(inpJ, {}, 'GEN-CR-')).length === G0.parts.length) ? pN.fails.length === 0 : null, '[' + name + '] gussets=' + G0.stats.joints + ' (' + G0.parts.length + ' parts) then joints=' + Jn.stats.joints + ' (' + Jn.parts.length + ' parts): CLEAR_POST over ALL ' + (G0.parts.length + Jn.parts.length) + ' generated parts: overlaps=' + pN.fails.length + (pN.fails[0] ? ' first=' + JSON.stringify(pN.fails[0]) : ''));
    console.log('§LODUP_NEIGHBOURS_OLD_GJ [' + name + '] old behaviour: joints=' + Jo.stats.joints + ' instead of ' + Jn.stats.joints + ', CLEAR_POST overlaps=' + pO.fails.length + (pO.fails[0] ? ' first=' + JSON.stringify(pO.fails[0]) : '') + ' ms=' + (Date.now() - t0));
    tot[si].gj = pN.fails.length; tot[si].gjOld = pO.fails.length;
    // ---- CONSTRUCTED control (the measured model shows no overlap either way, so the old behaviour cannot be seen failing on it): a live part of another pack is put where the generated gusset sits.
    if (si === 1 && Gn.parts.length) {
      var all = [].concat.apply([], Gn.parts.map(function (p) { return Array.from(p.tris); })), bb = (function (W) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < W.length; i += 3) for (var a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; } return [lo, hi]; })(all), c = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; }), h = [0, 1, 2].map(function (a) { return (bb[1][a] - bb[0][a]) / 2 + 0.03; });   // a box 30 mm larger than the gusset's three parts, on it
      var corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(function (s2) { return [c[0] + s2[0] * h[0], c[1] + s2[1] * h[1], c[2] + s2[2] * h[2]]; }), F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], soup = [];
      F.forEach(function (t) { t.forEach(function (i) { soup.push(corners[i][0], corners[i][1], corners[i][2]); }); });
      var inj = [{ guid: 'GEN-ZZ-1-INJECTED', cls: 'IfcPlate', name: 'injected live part of another pack (control)', tris: Float64Array.from(soup), parents: [] }], inpZ = Object.assign({}, inpS, { generated: function () { return inj; } });
      var Zn = Gusset.run(inpZ, GR, { log: quiet }), Zo = Gusset.run(inpZ, GR, { log: quiet, noGenerated: true }), extra = [{ guid: inj[0].guid, tris: inj[0].tris }];
      var zN = Gusset.clearPost(inpZ, GR, itemsOf(Zn.parts), quiet, extra), zO = Gusset.clearPost(inpZ, GR, itemsOf(Zo.parts), quiet, extra);
      verdict('BREAK_CONSTRUCTED', Zn.stats.joints === 0 && zN.fails.length === 0 && Zo.stats.joints === 1 && zO.fails.length > 0, 'a box 30 mm larger than the gusset parts is a live part of another pack at the gusset: with the seed the gusset is refused (joints=' + Zn.stats.joints + ', overlaps=' + zN.fails.length + '); the old behaviour (noGenerated) writes it (joints=' + Zo.stats.joints + ') and CLEAR_POST shows ' + zO.fails.length + ' overlap(s)' + (zO.fails[0] ? ' first=' + JSON.stringify(zO.fails[0]) : ''));
      tot[si].constructedOld = zO.fails.length; tot[si].constructedNew = zN.fails.length;
    }
  });
  console.log('§LODUP_NEIGHBOURS_COUNTS ' + JSON.stringify(tot));
  console.log('§LODUP_SUMMARY pack=neighbours failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=real');
  process.exit(FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
