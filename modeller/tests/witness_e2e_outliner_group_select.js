#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OL-GROUPSELECT scope (read this block first)
 * SCOPE: real-user witness for §OLGROUPSELECT (prompts/OUTLINER_GROUP_SELECT.md) — double-click a
 *   category/group header in the Outliner selects EVERY leaf element under it in one action (the Viewer
 *   Find panel's "a GROUP result selects the whole set", Outliner-side), and the ALREADY-LANDED #711
 *   zoom-to-selection frames it — no zoom code in this feature. Real production path (open Duplex from the
 *   chooser, real puppeteer dblclicks on the real header rows; 3 fixture walls authored via the same
 *   oplog.commit idiom as witness_e2e_dm_multiselect so the flat group is non-empty), every claim read back
 *   from the live selection set / DOM / §-log against INDEPENDENTLY hand-computed expected id sets. Read
 *   the log after every run; exit code is not evidence.
 *
 * §OLSUBTREE-SELECT UPDATE (MODELLER_RENDER_MATERIAL_PARITY.md follow-up, 2026-07-11, user-directed
 * "option 1"): selectGroup() was promoted from dblclick-only to a SINGLE click on the header (Find-panel
 * parity — a higher-level Outliner row now highlights+zooms its whole section on one click, not two). The
 * old dblclick wiring was REMOVED as redundant. A combined "single-click ALSO toggles collapse" design was
 * tried and REVERTED after empirical proof it can't work: setActive()'s pre-existing auto-expand-on-pick
 * (§V3) unconditionally re-reveals any row containing the just-selected content — a manual toggle-to-
 * collapsed on the SAME row gets silently undone by the very _paint() needed to render the toggle (repaint
 * re-applies setActive → finds the row it just hid → auto-expands it back). No click ordering avoids this,
 * it's a structural conflict between "select this" and "hide this" in one gesture. Final design: a header
 * click is select+zoom ONLY — matches the Viewer Find panel's own actual pattern (separate label-tap vs
 * arrow-tap zones; the Modeller has no arrow zone, so collapse only comes from the tree's own auto-expand
 * or the bulk Collapse All button). K2-K4 below test this final contract, not the old dblclick one.
 *
 * Issues under test (each K names what it proves or disproves):
 *   K1 BASELINE        — Duplex renders the bomtree header + walls flat header, and the hand-walk of
 *                        _lastRoots.bomtree (kind==='element' → __arcFidByGuid/numeric, deduped) yields >1
 *                        expected fids while the walls group holds exactly the 3 authored op ids: without
 *                        this every claim below is vacuous.
 *   K2 TREE-GROUP-SELECT — a REAL single click on the bomtree category header puts EXACTLY the hand-computed
 *                        expected fid set into window.Bonsai._selSet (counted, ID-level set equality — not
 *                        "count > 0") and §OLGROUPSELECT cat=bomtree n=<expected> is logged with that count.
 *   K3 ZOOM-COMPOSES   — that same click fired #711's §ZOOM-SEL fill line (zoomToSelection ran off
 *                        selectMany → setSelectionIds), proving the two merged features compose with NO
 *                        zoom re-wiring in this change.
 *   K4 REPEAT-CLICK-IDEMPOTENT — clicking the SAME header again re-fires an identical selectGroup (same
 *                        set, a fresh §OLGROUPSELECT log line) with no crash/drift — proves a header click
 *                        is a safe, repeatable action, not a one-shot toggle with a "wrong" second state.
 *   K5 FLAT-GROUP-SELECT — a REAL single click on the walls flat group header selects EXACTLY the 3 authored
 *                        GEOM_EXTRUDE_POLY op ids (ID-level equality) + §OLGROUPSELECT cat=walls n=3 logged.
 *   K6 EMPTY-NOOP      — selectGroup on a category with zero selectable leaves (strwalk: walker info rows,
 *                        no kind==='element') logs the n=0 no-op and leaves the live selection UNTOUCHED
 *                        (still the 3 walls from K5).
 *   K7 ROOT-COEXISTS   — with the selection cleared (§V3 reveal caveat — a live selection's ancestor path
 *                        legitimately auto-reopens after collapse-all, proven by W-E2E-OL-COLLAPSEALL K5/K6),
 *                        dblclick on #bo-root STILL collapses everything (§OLCOLLAPSEALL fires, zero
 *                        [data-bnode] and zero [data-fid] rows) and fires NO §OLGROUPSELECT — the bulk
 *                        Collapse All action and per-header select live on different targets, no interference.
 *   +  NO-ERROR (harness): no pageerror / fatal across the whole sequence.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const sleep = ms => new Promise(r => setTimeout(r, ms));

runE2E('W-E2E-OL-GROUPSELECT', async (t) => {
  const pg = t.pg;
  await t.open('Duplex');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});

  // fixture (authoring, not the interaction under test — same idiom as witness_e2e_dm_multiselect): a fresh
  // Duplex open has ZERO op-log walls (measured, run 1: expWalls=0), so author 3 real signed walls to make
  // the flat "Walls" group non-empty. Their op ids are the hand-known expected flat selection.
  const wallIds = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog; const out = [];
    for (const x0 of [30, 32, 34]) {
      const r = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: {
        profile: { points: [[x0, 0], [x0 + 1, 0], [x0 + 1, 0.2], [x0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
      out.push(+r.id);
    }
    return out.sort((a, b) => a - b);
  });
  await sleep(600);

  const TCAT_SEL = '#bo-trees [data-tcat="bomtree"]:not([data-bnode])';
  const GRP_SEL = '#bo-flats [data-grp="walls"]';
  // Independent hand-computation of the EXPECTED id sets — the same data sources the feature reads
  // (_lastRoots fold + op-log + __arcFidByGuid bridge) walked here in witness-owned code, NOT by calling
  // selectGroup. Mirrors how W-E2E-ZOOMSEL re-derives fitDist independently of the page's own function.
  const expectedTree = () => pg.evaluate(() => {
    const ol = window.Bonsai.outliner, bridge = window.__arcFidByGuid || {};
    const out = new Set();
    const walk = n => {
      if (n.kind === 'element') {
        let num = +n.id;
        if (isNaN(num) && bridge[n.id] != null) num = +bridge[n.id];
        if (!isNaN(num)) out.add(num);
      }
      (n.children || []).forEach(walk);
    };
    (ol._lastRoots['bomtree'] || []).forEach(walk);
    return Array.from(out).sort((a, b) => a - b);
  });
  const expectedWalls = () => pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_EXTRUDE_POLY');
    return Array.from(new Set(ops.map(o => +o.id))).sort((a, b) => a - b);
  });
  const selNow = () => pg.evaluate(() => Array.from(window.Bonsai._selSet || []).sort((a, b) => a - b));
  const setEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const nLogs = re => t.slog.filter(l => re.test(l)).length;

  // K1 — baseline: both header kinds exist; hand-derived expected sets are non-trivial and the walls
  // group is EXACTLY the 3 authored ops (nothing else invents walls on a fresh open)
  const expT = await expectedTree();
  const expW = await expectedWalls();
  const hdrs = await pg.evaluate((ts, gs) => ({
    tcat: !!document.querySelector(ts), grp: !!document.querySelector(gs),
    bnodes: document.querySelectorAll('[data-bnode]').length
  }), TCAT_SEL, GRP_SEL);
  t.assert('K1 BASELINE headers exist + expected sets non-empty (walls = the 3 authored ops)',
    hdrs.tcat && hdrs.grp && hdrs.bnodes > 0 && expT.length > 1 && setEq(expW, wallIds),
    'expTree=' + expT.length + ' expWalls=' + JSON.stringify(expW) + ' authored=' + JSON.stringify(wallIds) +
    ' bnodes=' + hdrs.bnodes);
  await t.shot('baseline');

  // K2 — REAL single click on the bomtree category header → EXACT hand-computed selection
  await pg.click(TCAT_SEL);
  await t.flySettle();
  const selT = await selNow();
  const gLog = t.slog.filter(l => /§OLGROUPSELECT cat=bomtree/.test(l));
  t.assert('K2 TREE-GROUP-SELECT exact ID-level set match + counted log',
    setEq(selT, expT) && gLog.length === 1 && new RegExp(' n=' + expT.length + '$').test(gLog[0]),
    'sel=' + selT.length + ' expected=' + expT.length + ' idSetEqual=' + setEq(selT, expT) +
    ' log=' + (gLog[0] || 'MISSING'));
  await t.shot('tree-selected');

  // K3 — #711 zoom composes: that same click produced a NEW §ZOOM-SEL fill line (no re-wiring here)
  const zoom1 = nLogs(/§ZOOM-SEL fill/);
  t.assert('K3 ZOOM-COMPOSES §ZOOM-SEL fill fired off selectMany (landed #711, untouched here)',
    zoom1 === 1,
    'zoomLogs after first click=' + zoom1);

  // K4 — clicking the SAME header again: selectGroup re-fires idempotently (same set), no crash/drift
  const gsel3 = nLogs(/§OLGROUPSELECT/);
  await pg.click(TCAT_SEL);
  await t.flySettle();
  const selT2 = await selNow();
  t.assert('K4 REPEAT-CLICK-IDEMPOTENT re-fires an identical group-select, no crash/drift',
    setEq(selT2, expT) && nLogs(/§OLGROUPSELECT/) === gsel3 + 1,
    'selEqual=' + setEq(selT2, expT) + ' groupSelectLogs=' + nLogs(/§OLGROUPSELECT/));

  // K5 — REAL single click on the walls FLAT group header → exactly the 3 authored op ids
  await pg.click(GRP_SEL);
  await t.flySettle();
  const selW = await selNow();
  const wLog = t.slog.filter(l => /§OLGROUPSELECT cat=walls/.test(l));
  t.assert('K5 FLAT-GROUP-SELECT exact ID-level set match + counted log',
    setEq(selW, expW) && wLog.length === 1 && new RegExp(' n=' + expW.length + '$').test(wLog[0]),
    'sel=' + JSON.stringify(selW) + ' expected=' + JSON.stringify(expW) + ' log=' + (wLog[0] || 'MISSING'));
  await t.shot('flat-selected');

  // K6 — empty category = clean logged no-op, live selection untouched (strwalk: info rows, no element leaves)
  const had = await pg.evaluate(() => {
    const ol = window.Bonsai.outliner;
    if (!ol._categories.some(c => c.key === 'strwalk')) return false;
    ol.selectGroup('strwalk'); return true;
  });
  await sleep(200);
  const noopLog = t.slog.filter(l => /§OLGROUPSELECT cat=strwalk n=0/.test(l));
  const selAfter6 = await selNow();
  t.assert('K6 EMPTY-NOOP zero-leaf category logs n=0 and leaves the walls selection untouched',
    had && noopLog.length === 1 && setEq(selAfter6, selW),
    'catRegistered=' + had + ' log=' + (noopLog[0] || 'MISSING') + ' selStill=' + JSON.stringify(selAfter6));

  // K7 — the OTHER dblclick target still works: #bo-root collapses everything, fires NO group-select.
  // Selection cleared first (same §V3 reveal caveat as K4 — a live selection's ancestor path legitimately
  // auto-reopens after collapse-all, proven by W-E2E-OL-COLLAPSEALL K5/K6).
  await pg.evaluate(() => window.Bonsai.select(null));
  await sleep(200);
  const gsel7 = nLogs(/§OLGROUPSELECT/);
  await pg.click('#bo-root', { clickCount: 2 });
  await sleep(400);
  const afterRoot = await pg.evaluate(() => ({
    bnodes: document.querySelectorAll('[data-bnode]').length,
    fidRows: document.querySelectorAll('[data-fid]').length
  }));
  const calLog = nLogs(/§OLCOLLAPSEALL/);
  t.assert('K7 ROOT-COEXISTS #bo-root dblclick still collapse-all, no group-select fired',
    afterRoot.bnodes === 0 && afterRoot.fidRows === 0 && calLog === 1 && nLogs(/§OLGROUPSELECT/) === gsel7,
    'bnodes=' + afterRoot.bnodes + ' fidRows=' + afterRoot.fidRows + ' collapseAllLogs=' + calLog +
    ' groupSelectLogs=' + nLogs(/§OLGROUPSELECT/));
  await t.shot('root-collapsed');
});
