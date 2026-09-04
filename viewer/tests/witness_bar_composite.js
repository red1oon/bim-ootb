#!/usr/bin/env node
// WITNESS — the COMPOSITE layer of the 4D Bar model: only leaves store time, every group derives it.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §2.1.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the TREE ARITHMETIC only — Bar/GroupBar/ElementBar over real building data. It deliberately
//   schedules with NO physical edges, so it says nothing about midair, support order, or crews.
//   Those belong to witness_bar_needs.js and witness_bar_schedule.js.
//
// ISSUE THIS PROVES OR DISPROVES: under the pre-Bar code an element inside its own bar was 54.5%
// true on Hospital, 35.4% on Terminal and 18.8% on Duplex (§S70), because task time and element
// time were two stored copies kept in sync by hand across five translators. If a group's span IS
// its children's, that number is 100% by construction and cannot regress. This witness gates the
// construction, not the number.
//
// Command: node viewer/tests/witness_bar_composite.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = process.env.VIEWER_DIR || path.join(__dirname, '..');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const BM = require(path.join(V, 'bar_model.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));
const { GroupChildRow } = require(path.join(KIT, 'schemas', 'bar_composite'));
const INV = require(path.join(KIT, 'invariants', 'bar_composite'));

// §FUTURE-5A / Part 2 (applied 2026-09-02, queue item B-3): viewer/rates/4D_policy.json DELETED —
// it self-described as "the ONLY authored input to 4D scheduling" but had ZERO production readers
// (viewer.html/time_machine.js never load it; 4D_MODEL_INTEGRITY.md §A already ruled bar_model.js,
// the only thing that ever consumed it, DEAD CODE/superseded by the 4D_template.json path). This
// witness and witness_bar_schedule.js were its only two readers, so its values move here verbatim
// as this witness's OWN fixture — a fixed test input for bar_model.js, not a claim that anything in
// production reads it. Full original prose/provenance (why each value, MEASURED evidence per field)
// is preserved in git history on the deleted file, not repeated here.
const POLICY = {
  days_per_week: 7,               // NOT read by bar_model.js or this witness — kept for shape parity
  phase_link: 'serial',           // packed-but-sequential within a level (2026-08-25 user ruling)
  level_link: 'trade',            // §4D_BAND_MONOTONIC enforced per trade, not per whole-level task
  level_bands: 'storey',          // finest granularity — one band per real storey
  ceiling_link: 'frame_above',    // non-structural phase on level N waits for Superstructure N+1
  building_scope: ['Substructure']   // phases occurring once for the whole building, not per storey
};
const SRC = fs.readFileSync(path.join(V, 'bar_model.js'), 'utf8');
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const rows = [], allGroups = [], perBuilding = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§BC_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    const bandRank = SG.deriveBandRanks(els, null).bandRank;
    console.log = _l; console.warn = _w;

    const order = BM.phaseOrder(R.SEQUENCE_RULES);
    const tree = BM.buildTree(els, POLICY, SG.collapsePhase, bandRank, order);
    // NO physical edges on purpose — this witness owns the tree arithmetic, nothing else.
    const res = BM.schedule(tree, { laborRates: R.LABOR_RATES, baseMs: 0 });

    // every (group, child) pair, at every level of the tree
    const groups = [];
    (function walk(g) {
      if (!g.children || !g.children().length) return;
      groups.push(g);
      g.children().forEach(c => {
        rows.push({ building: bld, group: g.name || 'Project',
          groupStart: g.start, groupStop: g.stop, childStart: c.start, childStop: c.stop });
        walk(c);
      });
    })(tree.project);
    allGroups.push(...groups);
    perBuilding.push({ bld, project: tree.project, leaves: tree.leaves });

    console.log('§BAR_COMPOSITE ' + bld + ' elements=' + els.length + ' tasks=' + tree.tasks.length +
      ' levels=' + Object.keys(tree.levels).length + ' groups=' + groups.length +
      ' placed=' + res.placed + ' cycles=' + res.cycles.length +
      ' spanD=' + ((tree.project.stop - tree.project.start) / 86400000).toFixed(1));
    db.close();
  }

  Witness('bar_composite')
    .population(() => rows)
    .schema(GroupChildRow)
    // THE RULE, checked in source: a group must not be able to store a time at all.
    .invariant('group-time-is-a-getter', () => INV.groupTimeIsAGetter(SRC))
    .invariant('only-leaves-store-time', () => INV.onlyLeavesStoreTime(allGroups))
    // The tautology that replaces §S70's 54.5%/35.4%/18.8%.
    .invariant('group-contains-every-child', INV.groupContainsEveryChild)
    .invariant('project-span-equals-leaf-extent', () => perBuilding.every(b => INV.projectSpanEqualsLeafExtent(b.project, b.leaves)))
    .invariant('no-zero-width-leaf', () => perBuilding.every(b => INV.noZeroWidthLeaf(b.leaves)))
    // RED CONTROLS — each gate must reject its OWN defect, in the committed witness, not in a
    // throwaway console session (feedback_extract_dont_author_then_gate.md).
    .invariant('redctl:getter gate rejects a stored group time',
      () => INV.groupTimeIsAGetter(SRC.replace("GroupBar.prototype.add = function (c) { this._kids.push(c); return c; };",
        "GroupBar.prototype.add = function (c) { this._s = 0; this._kids.push(c); return c; };")) === false)
    .invariant('redctl:contains gate rejects a child outside its group',
      () => INV.groupContainsEveryChild([{ groupStart: 10, groupStop: 20, childStart: 5, childStop: 15 }]) === false)
    .invariant('redctl:leaf-only gate rejects a group that stored a time',
      () => INV.onlyLeavesStoreTime([{ _s: 1, _e: 2 }]) === false)
    .invariant('redctl:zero-width gate rejects a zero-duration leaf',
      () => INV.noZeroWidthLeaf([{ start: 5, stop: 5 }]) === false)
    .redControl(rs => rs.map((r, i) => i ? r : Object.assign({}, r, { childStop: r.groupStop + 86400000 })))
    .run();
})();
