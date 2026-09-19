#!/usr/bin/env node
// WITNESS — W-S7-GRAIN — the cost row names its IFC class AND its match count; no element-grain
// money string is ever emitted next to the element's OWN name.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-GRAIN ("RULE, load-bearing not cosmetic")
// / §S7-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: S7's cost fold is IFC-CLASS grain (_foldClassTwin joins
// M_Product.Value=ifcClass -> C_ProjectLine.PlannedAmt for the WHOLE class), never element grain —
// hovering/picking one IfcBeam shows what ALL 1,970 IfcBeam elements in the building cost, not what
// that one beam costs. Before this leg, find_erp_push.js's _showClassCost already RECEIVED a
// matchCount parameter and even LOGGED it (§ZOOM-COST matches=...) but never RENDERED it — so the
// on-screen row read as "IfcBeam: RM36.9M -> RM59.0M", indistinguishable from a genuine per-element
// price next to that element's own Name/GUID rows in the SAME #info-panel. This witness proves (1)
// the rendered row now carries the class name bound together with its real match count (not just
// logged), and (2) the fold never writes into #info-name (the element's own name row) — the two
// facts that together make "this is a class total, not this element's price" impossible to miss.
//
// POPULATION: the REAL folded twin (erp/ad_seed.db, C_Project 'Hospital') and a REAL class match
// count measured off Hospital_extracted.db's own elements_meta (1,970 real IfcBeam rows) — not an
// invented number. Superstructure Planned->Committed (+60%) is the same marquee figure §DATA and
// S2's own witness (test_zoom_cost_panel.js) already established; this witness does not re-derive
// it, only checks it renders paired with the class + count.
//
// Command: node viewer/tests/witness_s7_grain.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
// §SQLJS_MISSING (PR #1730's class of bug, hit again 2026-09-14): a bare require('sql.js') resolves
// only when node_modules happens to sit above this file — which a FRESH WORKTREE does not have, so
// these witnesses were unrunnable outside the shared checkout. Fall back to the shared clone's copy,
// overridable by SQLJS_HOME, and say so loudly rather than dying on a MODULE_NOT_FOUND stack.
const initSqlJs = (function () {
  try { return require('sql.js'); } catch (e) {
    const alt = path.join(process.env.SQLJS_HOME || path.join(os.homedir(), 'bim-ootb'), 'node_modules', 'sql.js');
    try { return require(alt); } catch (e2) {
      console.log('§SQLJS_MISSING neither require("sql.js") nor ' + alt + ' resolved — set SQLJS_HOME');
      throw e2;
    }
  }
})();

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}

const REPO = path.join(__dirname, '..', '..');
const ERP_DB = path.join(REPO, 'erp', 'ad_seed.db');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const BUILDING_DB = path.join(BLD_DIR, 'Hospital_extracted.db');

function makeFakeDom() {
  const els = {};
  global.document = {
    getElementById: function (id) {
      if (!els[id]) els[id] = { style: { display: '' }, innerHTML: '', textContent: '', addEventListener: function () {} };
      return els[id];
    }
  };
  return els;
}

(async () => {
  const SQL = await initSqlJs();

  // Real class match count — measured off the real building DB, not invented.
  const bdb = new SQL.Database(new Uint8Array(fs.readFileSync(BUILDING_DB)));
  const cntRows = bdb.exec("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBeam'");
  const REAL_MATCH_COUNT = cntRows.length ? cntRows[0].values[0][0] : 0;
  bdb.close();
  assert(REAL_MATCH_COUNT > 0, 'Hospital_extracted.db carries real IfcBeam elements (count=' + REAL_MATCH_COUNT + ')');

  // Independent ground truth for the phase pct this class folds to (Superstructure, §DATA +60% marquee).
  const edb = new SQL.Database(new Uint8Array(fs.readFileSync(ERP_DB)));
  const phaseRow = edb.exec(
    "SELECT ph.Name, ph.PlannedAmt, ph.CommittedAmt FROM C_ProjectLine pl " +
    "JOIN M_Product p ON pl.M_Product_ID = p.M_Product_ID " +
    "JOIN C_Project pr ON pl.C_Project_ID = pr.C_Project_ID " +
    "JOIN C_ProjectPhase ph ON pl.c_projectphase_id = ph.C_ProjectPhase_ID " +
    "WHERE pr.Value='Hospital' AND p.Value='IfcBeam'");
  assert(phaseRow.length > 0, 'IfcBeam resolves to a real C_ProjectPhase via the twin (independent direct SQL)');
  const [expPhaseName, expPlanned, expCommitted] = phaseRow[0].values[0];
  const expPct = expPlanned > 0 ? Math.round((expCommitted - expPlanned) * 100 / expPlanned) : 0;
  console.log('  independent ground truth: phase="' + expPhaseName + '" planned=' + expPlanned + ' committed=' + expCommitted + ' pct=' + expPct + '%');
  edb.close();

  const els = makeFakeDom();
  // find_erp_push.js's IIFE picks its own `global` as `(typeof window!=='undefined'?window:globalThis)`
  // — alias `window` to `globalThis` itself (not a fresh {}) so a property set on one (ProjFold
  // below) is visible through the other, whichever branch the module's IIFE happens to take.
  global.window = global;
  global.ProjFold = {};   // _ensureErpDb's truthy-presence gate — this witness only needs the fold, not the push
  const FindErpPush = require('../find_erp_push.js');
  const A = {
    activeBuilding: 'Hospital',
    _SQL: SQL,
    cachedFetch: function (url) {
      assert(/ad_seed\.db$/.test(url), 'cachedFetch called for the real erp/ad_seed.db path (url=' + url + ')');
      // Return the Buffer itself (a Uint8Array subclass) — `new Uint8Array(buf)` inside
      // _ensureErpDb then copies by VALUE off its .length, so Node's Buffer-pool byteOffset
      // quirks (Buffer.buffer can be a larger shared pool) never leak in.
      return Promise.resolve(fs.readFileSync(ERP_DB));
    }
  };
  const mod = FindErpPush.create({
    A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; },
    selectionPriced: function () { return null; }, cur: function () { return 'RM'; }
  });

  // Seed info-name with a sentinel so we can prove _showClassCost never touches it (§S7-GRAIN's
  // "never a bare element-grain money string next to the element's own name").
  els['info-name'] = { style: { display: '' }, innerHTML: 'IfcBeam-0042 (sentinel, must survive untouched)', textContent: 'IfcBeam-0042' };
  els['info-cost'] = { style: { display: 'none' }, innerHTML: '' };

  await new Promise((resolve) => {
    mod.showClassCost('IfcBeam', REAL_MATCH_COUNT, 'SOME-GUID-NOT-USED-IN-RENDER');
    setTimeout(resolve, 50);   // _foldClassTwin resolves via a Promise chain — let it settle
  });

  const html = els['info-cost'].innerHTML;
  const plain = html.replace(/<[^>]+>/g, '');   // tag-stripped text — the class name and its count sit either side of a <span>, so compare on rendered TEXT, not raw markup
  assert(!!html, '#info-cost was populated (fold resolved against the real twin)');
  assert(html.indexOf('IfcBeam') !== -1, 'rendered row names the IFC class ("IfcBeam")');
  const countRe = new RegExp('IfcBeam\\s*\\(' + REAL_MATCH_COUNT + ' matches\\)');
  assert(countRe.test(plain),
    'W-S7-GRAIN: the class name and its REAL match count (' + REAL_MATCH_COUNT + ') render TOGETHER, in the same label — not just logged (rendered text: "' + plain.split('RM')[0].trim() + '...")');
  assert(html.indexOf(expPhaseName) !== -1, 'rendered row names the phase this class folds to ("' + expPhaseName + '")');
  assert(html.indexOf((expPct >= 0 ? '+' : '') + expPct + '%') !== -1,
    'rendered pct (' + expPct + '%) matches the independent direct-SQL ground truth — not a re-derived figure');

  // ---- the other half of W-S7-GRAIN: the class fold NEVER writes into the element's OWN name row ----
  assert(els['info-name'].innerHTML === 'IfcBeam-0042 (sentinel, must survive untouched)',
    '#info-name (the ELEMENT\'s own name/GUID row) is untouched by the class-grain cost fold — a class total can never overwrite or sit disguised as this element\'s own identity row');

  // ---- singular wording sanity: matchCount=1 (the plain-pinpoint-pick call site's literal arg) ----
  els['info-cost'] = { style: { display: 'none' }, innerHTML: '' };
  await new Promise((resolve) => {
    mod.showClassCost('IfcBeam', 1, 'SOME-GUID');
    setTimeout(resolve, 50);
  });
  const html1 = els['info-cost'].innerHTML;
  const plain1 = html1.replace(/<[^>]+>/g, '');
  assert(/IfcBeam\s*\(1 match\)/.test(plain1), 'matchCount=1 renders singular "1 match" (not "1 matches")');

  console.log('§WITNESS_S7_GRAIN pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — the cost row names its IFC class AND its real match count together, matches the independent phase/pct ground truth, and never touches the element\'s own name row — a class total cannot be misread as this element\'s price');
})();
