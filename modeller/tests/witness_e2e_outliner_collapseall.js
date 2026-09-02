#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OL-COLLAPSEALL scope (read this block first)
 * SCOPE: real-user witness for §OLCOLLAPSEALL (prompts/OUTLINER_COLLAPSE_ALL.md) — double-click the
 *   Outliner root label ("DAGeVu Model", #bo-root) collapses the WHOLE tree to the top-level trunk in one
 *   action. Real production path (open Duplex from the chooser, real puppeteer dblclick, real reload, real
 *   canvas click), every claim read back from the live DOM / localStorage / §-log — never the in-memory
 *   object alone. Read the log after every run; exit code is not evidence.
 *
 * Issues under test (each names what it proves or disproves):
 *   K1 BASELINE      — after opening Duplex the seeded tree actually renders expanded rows ([data-bnode]>0)
 *                      and flat group headers exist: without this the collapse claims below would be vacuous.
 *   K2 PAINT-COLLAPSED — a real dblclick on #bo-root leaves ZERO [data-bnode] and ZERO [data-fid] rows in the
 *                      rendered DOM while the category headers survive — proves the PAINT reflects the bulk
 *                      collapse, not just this._collapsed's in-memory state. §OLCOLLAPSEALL logged.
 *   K3 KEY-SHAPES    — localStorage dagevu_modeller_ol_collapsed now holds ONLY the three existing key
 *                      shapes (tcat|*, bn|*, flat cat keys), incl. tcat|bomtree and ≥1 bn| key — no invented
 *                      fourth shape.
 *   K4 PERSISTS      — after a REAL page reload + re-open Duplex the tree comes back COLLAPSED (0 rows) —
 *                      the bulk state rides the exact §P9 persistence guarantee (W-OL-PERSIST).
 *   K5 EXPANDTO-ALIVE — the regression that matters most: AFTER collapse-all, a real canvas click on an
 *                      element still auto-expands its ancestor path (§OLEXPAND fires, the picked row is in
 *                      the DOM and painted primary) — collapse-all must not break §V3 reveal-on-pick.
 *   K6 PARTIAL-EXPAND — that pick expanded ONLY the ancestor path: other bn| keys remain collapsed=true
 *                      (auto-reveal ≠ silently undoing the user's collapse-all).
 *   + NO-ERROR (harness): no pageerror / fatal across the whole sequence.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const sleep = ms => new Promise(r => setTimeout(r, ms));

runE2E('W-E2E-OL-COLLAPSEALL', async (t) => {
  const pg = t.pg;
  await t.open('Duplex');

  // K1 — baseline: seeded tree renders expanded rows; flat group headers present
  const base = await pg.evaluate(() => ({
    bnodes: document.querySelectorAll('[data-bnode]').length,
    fidRows: document.querySelectorAll('[data-fid]').length,
    tcatHdrs: document.querySelectorAll('[data-tcat]:not([data-bnode])').length,
    grpHdrs: document.querySelectorAll('[data-grp]').length,
    rootLabel: (document.querySelector('#bo-root') || {}).textContent || ''
  }));
  t.assert('K1 BASELINE expanded tree rendered', base.bnodes > 0 && base.tcatHdrs > 0 && base.grpHdrs > 0 &&
    /DAGeVu Model/.test(base.rootLabel),
    'bnodes=' + base.bnodes + ' tcatHdrs=' + base.tcatHdrs + ' grpHdrs=' + base.grpHdrs + ' root="' + base.rootLabel.trim() + '"');
  await t.shot('before');

  // K2 — real dblclick on the root label → whole tree folds to the trunk IN THE RENDERED DOM
  await pg.click('#bo-root', { clickCount: 2 });
  await sleep(400);
  const after = await pg.evaluate(() => ({
    bnodes: document.querySelectorAll('[data-bnode]').length,
    fidRows: document.querySelectorAll('[data-fid]').length,
    tcatHdrs: document.querySelectorAll('[data-tcat]:not([data-bnode])').length,
    grpHdrs: document.querySelectorAll('[data-grp]').length
  }));
  const calLog = t.slog.filter(l => /§OLCOLLAPSEALL/.test(l));
  t.assert('K2 PAINT-COLLAPSED zero child rows, headers survive', after.bnodes === 0 && after.fidRows === 0 &&
    after.tcatHdrs === base.tcatHdrs && after.grpHdrs === base.grpHdrs && calLog.length === 1,
    'bnodes=' + after.bnodes + ' fidRows=' + after.fidRows + ' tcatHdrs=' + after.tcatHdrs + ' grpHdrs=' + after.grpHdrs +
    ' log=' + (calLog[0] || 'MISSING'));
  await t.shot('collapsed');

  // K3 — localStorage holds ONLY the three existing key shapes; the bulk keys are all true
  const ls = await pg.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('dagevu_modeller_ol_collapsed') || '{}');
    const flatKeys = window.Bonsai.outliner._categories.filter(c => !c.tree).map(c => c.key);
    const keys = Object.keys(o);
    return {
      n: keys.length,
      tcat: keys.filter(k => k.indexOf('tcat|') === 0).length,
      bn: keys.filter(k => k.indexOf('bn|') === 0).length,
      flat: keys.filter(k => flatKeys.indexOf(k) >= 0).length,
      alien: keys.filter(k => k.indexOf('tcat|') !== 0 && k.indexOf('bn|') !== 0 && flatKeys.indexOf(k) < 0),
      bomtree: o['tcat|bomtree'] === true,
      allTrue: keys.every(k => o[k] === true)
    };
  });
  t.assert('K3 KEY-SHAPES persisted, no fourth shape', ls.n > 0 && ls.bomtree && ls.bn > 0 && ls.flat > 0 &&
    ls.alien.length === 0 && ls.allTrue,
    'keys=' + ls.n + ' (tcat=' + ls.tcat + ' bn=' + ls.bn + ' flat=' + ls.flat + ') alien=' + JSON.stringify(ls.alien));

  // K4 — REAL reload + re-open: the bulk collapse rides §P9 persistence into the next session
  await pg.reload({ waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady===true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
  await t.open('Duplex');
  const re = await pg.evaluate(() => ({
    bnodes: document.querySelectorAll('[data-bnode]').length,
    tcatHdrs: document.querySelectorAll('[data-tcat]:not([data-bnode])').length,
    mem: window.Bonsai.outliner._collapsed['tcat|bomtree'] === true
  }));
  t.assert('K4 PERSISTS across reload (still trunk-only)', re.bnodes === 0 && re.tcatHdrs > 0 && re.mem,
    'bnodes=' + re.bnodes + ' tcatHdrs=' + re.tcatHdrs + ' memRestored=' + re.mem);

  // K5 — the regression that matters most: after collapse-all, a REAL canvas pick still auto-reveals
  const bnBefore = await pg.evaluate(() =>
    Object.keys(window.Bonsai.outliner._collapsed).filter(k => k.indexOf('bn|') === 0 && window.Bonsai.outliner._collapsed[k]).length);
  const picked = await t.pick();
  const expandLog = t.slog.filter(l => /§OLEXPAND/.test(l));
  const reveal = picked ? await pg.evaluate(fid => {
    const guid = (window.__arcGuidByFid || {})[fid];
    const d = (guid != null && document.querySelector('[data-bnode="' + guid + '"][data-leaf="1"]')) ||
      document.querySelector('[data-fid="' + fid + '"]');
    return { found: !!d, sel: d ? d.dataset.sel : null };
  }, picked.fid) : { found: false, sel: null };
  t.assert('K5 EXPANDTO-ALIVE pick auto-reveals after collapse-all', !!picked && expandLog.length >= 1 &&
    reveal.found && reveal.sel === 'p',
    'fid=' + (picked && picked.fid) + ' rowFound=' + reveal.found + ' sel=' + reveal.sel + ' log=' + (expandLog[0] || 'MISSING'));
  await t.shot('revealed');

  // K6 — auto-reveal opened ONLY the ancestor path; the rest of the collapse-all state is untouched
  const bnAfter = await pg.evaluate(() =>
    Object.keys(window.Bonsai.outliner._collapsed).filter(k => k.indexOf('bn|') === 0 && window.Bonsai.outliner._collapsed[k]).length);
  t.assert('K6 PARTIAL-EXPAND siblings stay collapsed', bnAfter > 0 && bnAfter < bnBefore && (bnBefore - bnAfter) <= 8,
    'bn collapsed before=' + bnBefore + ' after=' + bnAfter + ' pathOpened=' + (bnBefore - bnAfter));
});
