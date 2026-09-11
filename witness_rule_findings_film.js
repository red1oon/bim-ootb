#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — MEP_CLASH_REVEAL_MOVIE.md §59 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/rule_findings_film.js's OWN new logic — the scheduling/selection/ink/window-
 * gating this file adds on top of StructuralSanity/EgressSanity, which are already witnessed
 * elsewhere (tests/test_structural_sanity_rules.js, tests/test_egress_sanity_rules.js) and are NOT
 * re-verified here.
 *
 * StructuralSanity.evaluate() runs for REAL, against a real in-memory sql.js DB (same dbQuery
 * contract production code uses) — proving the Structural half of Build() calls the real evaluator,
 * not a mock. EgressSanity is STUBBED with a fixed evaluate() (a known circulation_distance ratio),
 * because building a full synthetic RoomGraph fixture (spatial_structure/storey_walkable_raster
 * schema) would only re-prove egress_sanity.js's own rule math, already covered by
 * tests/test_egress_sanity_rules.js — this witness needs a KNOWN, controlled distance figure to
 * check the scheduler's arithmetic, not a second copy of that coverage.
 *
 * CLAIMS CHECKED:
 *   1. ONE-OF-EACH — a Structural-only storey and an Egress-only storey both get a pick, on their
 *      own distinct storeys, when the reveal window has room for both (>=2.2s/storey).
 *   2. NOFIT — shrinking the same window below 2.2s/storey drops BOTH picks (never a half-fit),
 *      while still reporting the real totals (never silently swallowed).
 *   3. WINDOW-GATING — CompositeOntoCanvas posts a pick's title/rows/ink ONLY inside its own
 *      [startSec, endSec) slot, proven by sampling before/inside/after each pick's window.
 *   4. CATEGORY INK — Structural picks post '#ffaa33', Egress picks post '#cc4444' — never severity-
 *      based, always category-based (rule_checklist.js's own hexes, different axis).
 *   5. DISTANCE-TO-EXIT ARITHMETIC — a known 37.5m circulation_distance ratio converts to
 *      distance/A.WALK_SPEED seconds and round(distance/0.75) steps, using the EXISTING A.WALK_SPEED
 *      constant (not a re-derived one).
 *   6. showRuleModeTint is called once with exactly the picked guids, keyed by CATEGORY not severity.
 * RUN: node witness_rule_findings_film.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
global.StructuralSanity = require('./viewer/structural_sanity.js');
const setupRuleFindingsFilm = require('./viewer/rule_findings_film.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const SCHEMA = `
CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
`;

(async () => {
  console.log('§W-RULE-FILM synthetic fixture (real StructuralSanity, stubbed EgressSanity)');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA);

  function meta(guid, cls, name, storey) { return [guid, cls, name, storey, 'STR', '', '', 'Fixture']; }
  function xform(guid, cx, cy, cz, bx, by, bz) { return [guid, cx, cy, cz, 0, 0, 0, bx, by, bz]; }

  // L1: one isolated (floating) beam — a real, code-verified CRITICAL floating_member finding.
  // L2: no STR elements at all — zero structural findings there, by construction (not stubbed).
  db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', meta('beam-floating', 'IfcBeam', 'B-1', 'L1'));
  db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', xform('beam-floating', 200, 200, 20, 6, 0.3, 0.5));

  function dbQuery(sql, params) { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; }

  global.EgressSanity = {
    evaluate: function () {
      // Known figure, on L2 only — L1 has zero egress findings, by construction.
      return [{ guid: 'room-far', ifc_class: 'IfcSpace', name: 'Ward 2A', storey: 'L2',
                rule: 'circulation_distance', severity: 'WARNING', ratio: 37.5, target: 'exit' }];
    }
  };
  global.fetch = () => Promise.reject(new Error('no network in this witness — exercises the fallback path'));

  function makeA(overrides) {
    const posts = [], tints = [];
    const A = Object.assign({
      dbQuery: dbQuery,
      WALK_SPEED: 1.2,
      storeyRevealList: function () { return [{ name: 'L1', z: 0 }, { name: 'L2', z: 3 }]; },
      filmBoxesMeasurePost: function (title, rows, ink) { posts.push({ title, rows, ink }); return true; },
      showRuleModeTint: function (guidCategoryMap, colorMap) { tints.push({ guidCategoryMap, colorMap }); }
    }, overrides);
    setupRuleFindingsFilm(A);
    A._posts = posts; A._tints = tints;
    return A;
  }

  // ── Scenario 1: window fits both (winSec=6s / 2 storeys = 3s/storey >= 2.2s) ──
  const A1 = makeA({});
  const plan1 = { beats: { rise: 0.9 }, storeyReveal: { on: true, windowFrac: 0.06 }, durationSec: 100 };
  const report1 = await A1.ruleFindingsFilmBuild(A1.dbQuery, plan1);
  console.log('  report1:', JSON.stringify(report1));
  const stats1 = A1.ruleFindingsFilm.stats();
  console.log('  stats1:', JSON.stringify(stats1));

  chk('scenario 1: state=BEAT', report1.state === 'BEAT', report1.state);
  chk('scenario 1: one-of-each — both categories picked', stats1.structuralPicked && stats1.egressPicked);
  const pickS1 = report1.picks.find(p => p.category === 'structural');
  const pickE1 = report1.picks.find(p => p.category === 'egress');
  chk('scenario 1: structural pick is on L1 (the only storey with a structural finding)', pickS1 && pickS1.storey === 'L1', pickS1 && pickS1.storey);
  chk('scenario 1: egress pick is on L2 (the only storey with an egress finding) — distinct storeys', pickE1 && pickE1.storey === 'L2', pickE1 && pickE1.storey);
  chk('scenario 1: structural ink = category orange, not severity-derived', pickS1 && pickS1.ink === '#ffaa33', pickS1 && pickS1.ink);
  chk('scenario 1: egress ink = category red', pickE1 && pickE1.ink === '#cc4444', pickE1 && pickE1.ink);

  // window bounds, real arithmetic: winStartSec=(0.9-0.06)*100=84, slotSec=3
  chk('scenario 1: structural window = [84, 86.2)', pickS1 && Math.abs(pickS1.startSec - 84) < 1e-6 && Math.abs(pickS1.endSec - 86.2) < 1e-6,
      pickS1 && (pickS1.startSec + '-' + pickS1.endSec));
  chk('scenario 1: egress window = [87, 89.2)', pickE1 && Math.abs(pickE1.startSec - 87) < 1e-6 && Math.abs(pickE1.endSec - 89.2) < 1e-6,
      pickE1 && (pickE1.startSec + '-' + pickE1.endSec));

  chk('scenario 1: distance-to-exit seconds = 37.5/1.2', Math.abs(stats1.maxExitDistSec - 37.5 / 1.2) < 1e-6, stats1.maxExitDistSec);
  chk('scenario 1: distance-to-exit steps = round(37.5/0.75) = 50', stats1.maxExitDistSteps === 50, stats1.maxExitDistSteps);

  chk('scenario 1: showRuleModeTint called once, keyed by CATEGORY not severity',
      A1._tints.length === 1 && A1._tints[0].guidCategoryMap['beam-floating'] === 'structural' && A1._tints[0].guidCategoryMap['room-far'] === 'egress',
      JSON.stringify(A1._tints));

  // ── Window-gating: sample before / inside / gap / inside / after ──
  function sample(A, t) { A._posts.length = 0; A.ruleFindingsFilmCompositeOntoCanvas(null, 0, 0, t); return A._posts.slice(); }
  chk('gating: before structural window (83.9s) — no post', sample(A1, 83.9).length === 0);
  const atS = sample(A1, 85);
  chk('gating: inside structural window (85s) — posts Structural title + orange ink',
      atS.length === 1 && /^Structural/.test(atS[0].title) && atS[0].ink === '#ffaa33', JSON.stringify(atS));
  chk('gating: in the gap between windows (86.5s) — no post', sample(A1, 86.5).length === 0);
  const atE = sample(A1, 88);
  chk('gating: inside egress window (88s) — posts Safety title + red ink',
      atE.length === 1 && /^Safety/.test(atE[0].title) && atE[0].ink === '#cc4444', JSON.stringify(atE));
  chk('gating: after egress window (89.3s) — no post', sample(A1, 89.3).length === 0);

  // ── Scenario 2: same totals, window too short (winSec=0.5s / 2 storeys = 0.25s/storey < 2.2s) ──
  const A2 = makeA({});
  const plan2 = { beats: { rise: 0.9 }, storeyReveal: { on: true, windowFrac: 0.005 }, durationSec: 100 };
  const report2 = await A2.ruleFindingsFilmBuild(A2.dbQuery, plan2);
  const stats2 = A2.ruleFindingsFilm.stats();
  console.log('  report2:', JSON.stringify(report2), 'stats2:', JSON.stringify(stats2));
  chk('scenario 2: NOFIT — never a half-fit (neither category picked)', !stats2.structuralPicked && !stats2.egressPicked);
  chk('scenario 2: real totals still reported despite NOFIT (never silently swallowed)',
      stats2.structuralTotal === 1 && stats2.egressTotal === 1, JSON.stringify(stats2));
  chk('scenario 2: no tint call when nothing was picked', A2._tints.length === 0);

  // ── Scenario 4 (§59.8): the SAME too-short window, but with the Measure box's real linger wired.
  // ISSUE: §RULE_FILM_LINGER_FIT — the old gate compared slotSec alone, ignoring that the box holds
  // its last entry for a further LINGER_S. Scenario 2 above is the control: it sets no
  // filmBoxesMeasureLingerS, so it MUST still be NOFIT (L2), which also proves the fix reads the
  // live value instead of assuming 2.2 unconditionally. ──
  const lines4 = [];
  const A4 = makeA({ filmBoxesMeasureLingerS: 2.2, log: null });
  const _log4 = console.log; console.log = (m) => { if (typeof m === 'string') lines4.push(m); _log4(m); };
  const plan4 = { beats: { rise: 0.9 }, storeyReveal: { on: true, windowFrac: 0.005 }, durationSec: 100 };
  const report4 = await A4.ruleFindingsFilmBuild(A4.dbQuery, plan4);
  console.log = _log4;
  const stats4 = A4.ruleFindingsFilm.stats();
  chk('L1 §59.8 linger admits a slot the old gate rejected (0.50s + 2.2s >= 2.2s)',
      report4.state === 'BEAT', report4.state);
  // winSec 0.5s / MIN_SLOT_SEC 1.0 truncates the reveal list to ONE storey (L1), so only the
  // structural category has a storey left to ride — egress correctly unpicked, not a half-fit bug.
  // One-of-each is asserted on scenario 5 below, where both storeys survive truncation.
  chk('L1b the one surviving storey IS picked (truncation, not a dropped category)',
      stats4.structuralPicked && !stats4.egressPicked, JSON.stringify(stats4));
  chk('L3 overrun is REPORTED, not hidden — §RULE_FILM_LINGER_FIT names overrunSec',
      lines4.some(l => l.indexOf('\u00A7RULE_FILM_LINGER_FIT') === 0 && /overrunSec=1\.70s/.test(l)),
      lines4.filter(l => l.indexOf('\u00A7RULE_FILM_LINGER_FIT') === 0).join(' | ') || 'not logged');
  chk('L3b §RULE_FILM_WINDOW now reports lingerSec and effectiveSec, not slotSec alone',
      lines4.some(l => /\u00A7RULE_FILM_WINDOW .*lingerSec=2\.20 effectiveSec=2\.70 eligible\(>=2\.2s\)=true/.test(l)),
      lines4.filter(l => l.indexOf('\u00A7RULE_FILM_WINDOW') === 0).join(' | '));

  // ── Scenario 5 (§59.8 L4): HHS's OWN real numbers — winSec 4.03 over 4 storeys = 1.01s/storey,
  // the figure that NOFITed on 5 real bakes. Must now be admitted with overrunSec 1.19s. ──
  const lines5 = [];
  const A5 = makeA({
    filmBoxesMeasureLingerS: 2.2,
    storeyRevealList: () => [{ name: 'L1', z: 0 }, { name: 'L2', z: 3 }, { name: 'L3', z: 6 }, { name: 'L4', z: 9 }]
  });
  const _log5 = console.log; console.log = (m) => { if (typeof m === 'string') lines5.push(m); _log5(m); };
  // windowFrac * durationSec = 4.03s, matching the real bake's §RULE_FILM_WINDOW winSec=4.03
  const report5 = await A5.ruleFindingsFilmBuild(A5.dbQuery, { beats: { rise: 0.9 }, storeyReveal: { on: true, windowFrac: 0.0403 }, durationSec: 100 });
  console.log = _log5;
  chk('L4 HHS real window (4.03s / 4 storeys = 1.01s) is admitted, not NOFIT',
      report5.state === 'BEAT', report5.state);
  const stats5 = A5.ruleFindingsFilm.stats();
  chk('L4c one-of-each honoured on HHS\'s real 4-storey window (both categories survive truncation)',
      stats5.structuralPicked && stats5.egressPicked, JSON.stringify(stats5));
  chk('L4b HHS real overrun reported as 1.19s',
      lines5.some(l => /\u00A7RULE_FILM_LINGER_FIT .*slotSec=1\.01s .*overrunSec=1\.19s/.test(l)),
      lines5.filter(l => l.indexOf('\u00A7RULE_FILM_LINGER_FIT') === 0).join(' | ') || 'not logged');

  // ── Scenario 3: no storey-reveal window on the plan at all — degrades to INCONCLUSIVE, never throws ──
  const A3 = makeA({});
  const report3 = await A3.ruleFindingsFilmBuild(A3.dbQuery, { beats: { rise: 0.9 } });
  chk('scenario 3: INCONCLUSIVE (no storeyReveal), no throw', report3.state === 'INCONCLUSIVE', report3.state);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
