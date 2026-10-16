#!/usr/bin/env node
// WITNESS — W-S7-GATE — on a building with no `schedules` row, #info-4d does not render an empty
// block (it states the reason or stays hidden), and the pill icon's reachability tracks the
// ENGINE'S capability, never a fabricated/empty affordance.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-DO item 4 / §S7-DATA-REALITY / §S7-INJECT
// ("WHERE IT HANGS") / §S7-WITNESS.
//
// ⚠ AMENDED 2026-09-14 for §S7-INJECT ("generate the programme once, on the fly"). Read this before
// assuming the PILL half of this witness still says what it said when it shipped (PR #1733):
// pre-§S7-INJECT, "no schedule" meant the pill stayed OFF ("no data -> no icon" read literally: no
// schedule = nothing to show). §S7-INJECT's decision — stated in the leg's own task text — is that a
// no-schedule building is NOT a dead end any more: the pill now offers a second state, "Generate
// programme", precisely when there is no schedule, so it must be REACHABLE there. What did NOT
// change (the same text: "that gating stays for the panel") is #info-4d's OWN gate — it is still
// keyed to an ACTIVE schedule (info_4d_panel.js render()), so it stays absent/hidden on a fresh
// no-schedule load exactly as before. This file's PART B negative-leg assertions were updated
// in-place to match (see the comment beside them) rather than left to silently fail against the new,
// deliberate behaviour — the OLD assertions are not preserved anywhere as a "red control": the old
// behaviour is superseded, not a case that still needs to be provably false.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-DATA-REALITY measured that NO published building carries a
// persisted schedule — every `*_extracted.db`/`*_meta.db` has `schedules=0`. That is the COMMON
// case, not an edge case, so getting this wrong (an empty-but-visible #info-4d box, or a pill icon
// that lights up with nothing real behind it) would be wrong on almost every real load. This witness
// proves TWO distinct claims kept separate on purpose (§S7-DO item 4's own text):
//   PART A (Node, pure) — find_erp_push.js's _show4DWindow(guid):
//     (1) on a REAL building DB with zero `schedules` rows, the box stays HIDDEN — never an empty
//         but visible block (the "reads as broken" failure §S7-DATA-REALITY calls out by name).
//     (2) on a REAL building DB that DOES have a schedule, a guid genuinely absent from every task
//         renders a STATED reason (non-empty, visible) — the pill would be showing, so a silent
//         blank box next to it would be the OTHER failure mode named in the spec.
//     (3) TWO booleans, kept distinct since §S7-INJECT: gateCondition (ScheduleAuthor.activeSchedule
//         resolving an id — still what gates #info-4d and the pill's hover-title text) is false for
//         the no-schedule DB and true for the schedule DB; pillCapableCondition (the engine itself
//         being loaded — what now gates the PILL's visibility) is TRUE on BOTH, because §S7-INJECT
//         made the pill reachable whether or not a schedule exists yet.
//   PART B (live browser, Chromium via puppeteer) — the REAL DOM: on the no-schedule building the
//     rendered pill rail NOW carries a `#pill-sched4d` button (`window._mainPillActions` marks it
//     NOT `pill:false`) whose title advertises the generate action; #info-4d is still absent/hidden.
//     On the schedule-carrying building the button exists too, as it always did. This is the part
//     Part A's boolean checks cannot see on their own — the actual wiring from those booleans to the
//     rendered icon (panels.js's poll + pill_builder.js's `if (act.pill===false) return;`).
//
// POPULATION: Duplex_extracted.db (9.6MB, real building, 0 `schedules` rows, per §S7-DATA-REALITY's
// own measured table) for the negative leg; Hospital_silent.db / HHS_Office_Federated_silent.db
// (the only two real persisted schedules that exist, per the spec's TEST DATA section) for the
// positive leg. HHS is used for Part B's live page load (80MB) — smaller/faster than Hospital's
// 315MB symlinked DB while still a REAL authored schedule, not a fixture.
//
// Command: node viewer/tests/witness_s7_gate.js
//   (Part B needs a Chromium binary; if puppeteer/Chromium cannot launch in this environment, Part
//   B is SKIPPED with a loud, explicit line — never silently treated as passing.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
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

let pass = 0, fail = 0, skipped = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}
function skip(msg) { skipped++; console.log('  SKIP ' + msg); }

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const NO_SCHED_DB = path.join(BLD_DIR, 'Duplex_extracted.db');
const SCHED_DB = path.join(BLD_DIR, 'Hospital_silent.db');
const SCHED_DB_LIVE = path.join(BLD_DIR, 'HHS_Office_Federated_silent.db');   // smaller — used for the browser leg only
const REPO = path.join(__dirname, '..', '..');
const BLD_ROOT = path.dirname(BLD_DIR);   // Part B's server maps /buildings/* here (see partB below)

function makeFakeDom() {
  const els = {};
  global.document = {
    getElementById: function (id) {
      if (!els[id]) els[id] = { style: { display: '' }, innerHTML: '', addEventListener: function () {} };
      return els[id];
    }
  };
  return els;
}

// The EXACT boolean panels.js's data-gate poll evaluates for `has` (see viewer/panels.js, the
// 'sched4d' pill's gating IIFE) — duplicated here on purpose so a change to the condition's SHAPE
// (not just its inputs) would need a matching change here, keeping this witness honest about what
// it checks. Since §S7-INJECT (2026-09-14) this boolean no longer decides the PILL's visibility
// (see pillCapableCondition below) — it now only decides #info-4d's own render() gate and the
// pill's hover-title text (panels.js _syncSched4dTitle). Kept under its original name because that
// is still exactly what it means: "does an active schedule exist right now".
function gateCondition(SA, db) {
  try { return !!(SA && SA.activeSchedule && SA.activeSchedule(db) && SA.activeSchedule(db).id); }
  catch (e) { return false; }
}

// §S7-INJECT — the boolean that NOW decides the 'sched4d' pill's VISIBILITY (viewer/panels.js's gate
// poll, `capable`). The pill's second state ("Generate programme") must be reachable precisely when
// there is NO schedule yet, so visibility can no longer be gated on gateCondition() above — it is
// gated on the 4D AUTHORING ENGINE being loaded at all, which is true on every real building this
// app can open (elements_meta always exists; only a genuine module-load failure reads as "no data").
// Duplicated here for the same reason gateCondition() is: a change to panels.js's condition SHAPE
// must break this witness, not silently stop testing what actually ships.
function pillCapableCondition(SA) {
  try { return !!(SA && SA.materializeZones && SA.activeSchedule && SA.persistDb); }
  catch (e) { return false; }
}

async function partA() {
  console.log('-- PART A (Node, pure) --');
  const SQL = await initSqlJs();
  const ScheduleRead4D = require('../schedule_read_4d.js');
  const ScheduleAuthor = require('../schedule_author.js');

  // ---- (1) no schedule at all -> #info-4d stays hidden, never an empty-but-visible block --------
  {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(NO_SCHED_DB)));
    const schedCountRows = db.exec('SELECT COUNT(*) FROM schedules');
    const schedCount = schedCountRows.length ? schedCountRows[0].values[0][0] : -1;
    assert(schedCount === 0, 'Duplex_extracted.db verified to carry 0 `schedules` rows (§S7-DATA-REALITY population)');
    assert(gateCondition(ScheduleAuthor, db) === false, 'gate condition (ScheduleAuthor.activeSchedule resolving) is FALSE for a real no-schedule DB');
    // §S7-INJECT: capability (what now gates the PILL) is TRUE even though there is no schedule —
    // this is the whole point of the leg (the pill must be reachable to offer "Generate programme").
    assert(pillCapableCondition(ScheduleAuthor) === true, '§S7-INJECT: pill CAPABILITY condition is TRUE on this same no-schedule DB — the engine can generate one even though it has not yet');

    const guidRow = db.exec('SELECT guid FROM elements_meta LIMIT 1');
    const guid = guidRow.length ? guidRow[0].values[0][0] : null;
    assert(!!guid, 'have a real guid from the no-schedule building to probe');

    const els = makeFakeDom();
    global.window = global;
    global.ScheduleRead4D = ScheduleRead4D;
    global.ScheduleAuthor = ScheduleAuthor;
    // §S7-OPEN: the renderer moved OUT of find_erp_push.js into its own eager module so the plain
    // canvas-pick path can reach it; _show4DWindow now delegates. Register it the way viewer.html's
    // eager script tag does, or the delegation honestly no-ops (§4D_INFO_PANEL reason=info_4d_panel_absent).
    global.Info4DPanel = require('../info_4d_panel.js');
    delete require.cache[require.resolve('../find_erp_push.js')];
    const FindErpPush = require('../find_erp_push.js');
    const A = { db: db, activeBuilding: 'Duplex' };
    const mod = FindErpPush.create({ A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; }, selectionPriced: function () { return null; }, cur: function () { return 'RM'; } });
    els['info-4d'] = { style: { display: '' }, innerHTML: 'PRE-EXISTING-SENTINEL' };   // prove show4DWindow does not merely leave it, but ACTIVELY hides it
    mod.show4DWindow(guid);
    assert(els['info-4d'].style.display === 'none', 'PART A(1): #info-4d.style.display === "none" on a real no-schedule building (never an empty-but-visible block)');

    db.close();
  }

  // ---- (2) schedule exists, guid genuinely absent -> STATED reason, non-empty, visible -----------
  {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(SCHED_DB)));
    const sched = ScheduleAuthor.activeSchedule(db);
    assert(!!(sched && sched.id), 'Hospital_silent.db has a real active schedule');
    assert(gateCondition(ScheduleAuthor, db) === true, 'gate condition is TRUE for a real schedule-carrying DB');
    assert(pillCapableCondition(ScheduleAuthor) === true, '§S7-INJECT: pill CAPABILITY condition is also TRUE here — same engine, a schedule already exists');

    const SENTINEL = 'NOT_A_REAL_GUID_S7_GATE_WITNESS';
    const presentRows = db.exec('SELECT COUNT(*) FROM task_elements WHERE guid=?', [SENTINEL]);
    assert((presentRows.length ? presentRows[0].values[0][0] : -1) === 0, 'sentinel guid verified ABSENT from every task_elements row before asserting the miss');

    const els = makeFakeDom();
    global.window = global;
    delete require.cache[require.resolve('../find_erp_push.js')];
    const FindErpPush = require('../find_erp_push.js');
    const A = { db: db, activeBuilding: 'Hospital' };
    const mod = FindErpPush.create({ A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; }, selectionPriced: function () { return null; }, cur: function () { return 'RM'; } });
    mod.show4DWindow(SENTINEL);
    assert(els['info-4d'].style.display === 'block', 'PART A(2): #info-4d IS shown (schedule exists, pill would be on) even though this guid misses');
    assert(!!els['info-4d'].innerHTML && els['info-4d'].innerHTML.length > 0, 'PART A(2): the shown block is NON-EMPTY — it states a reason, never a blank box');
    assert(/not yet assigned/i.test(els['info-4d'].innerHTML), 'PART A(2): the stated reason is human-readable text, not a raw error/stack');

    // ---- (3) sanity: a REAL member guid on the same schedule-carrying DB renders NORMALLY --------
    const realGuidRows = db.exec('SELECT MIN(guid) FROM task_elements');
    const realGuid = realGuidRows.length ? realGuidRows[0].values[0][0] : null;
    els['info-4d'] = { style: { display: '' }, innerHTML: '' };
    mod.show4DWindow(realGuid);
    assert(els['info-4d'].style.display === 'block' && /Task/.test(els['info-4d'].innerHTML),
      'PART A(3) sanity: a real member guid on the same DB still renders the normal Task/Window rows (the miss-handling above is not just "always hide/always same message")');

    db.close();
  }
}

async function partB() {
  console.log('-- PART B (live browser, Chromium) --');
  let puppeteer;
  try { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }
  catch (e) { try { puppeteer = require('puppeteer'); } catch (e2) { puppeteer = null; } }
  if (!puppeteer) { skip('PART B skipped entirely — no puppeteer install found (checked project + ~/bim-compiler/node_modules) — Part A above is the only evidence for this run'); return; }
  if (!fs.existsSync(SCHED_DB_LIVE)) { skip('PART B skipped — ' + SCHED_DB_LIVE + ' not present on this machine'); return; }

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    // The large building DBs are NOT git-tracked (only buildings/patches/*.sql is) — a fresh
    // worktree genuinely has no buildings/ contents, so §HARD RULES' "worktree-only" convention
    // cannot apply to the fleet DBs. Serve /buildings/* from the shared checkout's real fleet
    // (BLD_DIR, read-only — the exact directory the spec's TEST DATA section names) and everything
    // else (the viewer/erp/common code under test) from THIS worktree.
    const root = p.indexOf('/buildings/') === 0 ? BLD_ROOT : REPO;
    fs.readFile(path.join(root, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  let browser;
  try { browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }); }
  catch (e) { skip('PART B skipped — Chromium failed to launch (' + e.message + ')'); server.close(); return; }

  try {
    // ---- negative leg: Duplex_extracted.db (0 schedules) ------------------------------------------
    // §S7-INJECT (2026-09-14) CHANGED THIS LEG'S EXPECTATION, documented here rather than silently
    // edited: pre-§S7-INJECT, "no schedule" meant the pill stayed OFF (§S7-DATA-REALITY's own
    // "no data -> no icon" reading of that state). §S7-INJECT's whole point is that a no-schedule
    // building is no longer a dead end — the pill now offers "Generate programme" precisely HERE, so
    // it must be ON. What did NOT change, and what this leg's own spec text says "stays for the
    // panel": #info-4d itself is still gated on an ACTIVE schedule (info_4d_panel.js render()), so it
    // stays absent/hidden on initial load exactly as before — only the PILL's reachability moved.
    {
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      // '../buildings/...' (not 'buildings/...') — relative to /viewer/viewer.html this resolves to
      // repo-root /buildings/, which is where the server above maps to BLD_ROOT (the shared
      // checkout's REAL fleet). The bare 'buildings/...' form resolves to /viewer/buildings/ — a
      // DIFFERENT, stale, git-tracked-symlink copy that does not carry the _silent schedule DBs at
      // all (see the comment on BLD_ROOT above).
      await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=../buildings/Duplex_extracted.db&bld=Ifc2x3_Duplex_Federated', { waitUntil: 'load', timeout: 90000 });
      await page.waitForFunction('!!(window.APP && window.APP.db && window._mainPillActions)', { timeout: 60000 });
      // Let the data-gate poll (500ms tick, panels.js) run at least once past the db-ready moment.
      await new Promise((r) => setTimeout(r, 2000));
      const state = await page.evaluate(() => {
        const act = (window._mainPillActions || []).find((a) => a.id === 'sched4d');
        return { actPill: act ? act.pill : 'MISSING_ACTION', actTitle: act ? act.title : null, domBtn: !!document.getElementById('pill-sched4d'), info4d: document.getElementById('info-4d') ? document.getElementById('info-4d').style.display : 'NO_ELEMENT' };
      });
      console.log('  Duplex (no schedule): ' + JSON.stringify(state));
      assert(state.actPill !== false, '§S7-INJECT PART B negative: window._mainPillActions sched4d.pill !== false — the pill is now REACHABLE with no schedule, to offer "Generate programme" (was pill===false pre-§S7-INJECT)');
      assert(state.domBtn === true, '§S7-INJECT PART B negative: #pill-sched4d button IS present in the real rendered DOM (was absent pre-§S7-INJECT)');
      assert(/generate a programme/i.test(state.actTitle || ''), 'PART B negative: the pill\'s hover title advertises the generate action ("' + state.actTitle + '")');
      assert(state.info4d === 'NO_ELEMENT' || state.info4d === 'none', 'PART B negative: #info-4d is STILL absent or hidden on initial load — UNCHANGED, "that gating stays for the panel"');
      assert(errs.length === 0, 'zero pageerrors on the no-schedule building (errs=' + errs.join(' | ') + ')');
      await page.close();
    }

    // ---- positive leg: HHS_Office_Federated_silent.db (has a real schedule) — pill must EXIST ----
    {
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=../buildings/HHS_Office_Federated_silent.db&bld=HHS_Office_Federated', { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction('!!(window.APP && window.APP.db && window._mainPillActions)', { timeout: 90000 });
      await new Promise((r) => setTimeout(r, 3000));
      const state = await page.evaluate(() => {
        const act = (window._mainPillActions || []).find((a) => a.id === 'sched4d');
        return { actPill: act ? act.pill : 'MISSING_ACTION', domBtn: !!document.getElementById('pill-sched4d') };
      });
      console.log('  HHS_Office_Federated (has schedule): ' + JSON.stringify(state));
      assert(state.actPill !== false, 'PART B positive: window._mainPillActions sched4d.pill !== false (schedule-carrying building)');
      assert(state.domBtn === true, 'PART B positive: #pill-sched4d button IS present in the real rendered DOM');

      // _show4DWindow is exposed as A._show4DWindow inside navigate_find.js's init() — part of the
      // LAZY loadNavigate() bundle (find_erp_push.js/navigate_find.js are not loaded until Find
      // first opens). Force that load, same as poc_find_erp_link_live.js/witness_hover_name.js do.
      await page.evaluate(() => (window.APP.loadNavigate ? window.APP.loadNavigate() : Promise.resolve()));
      await new Promise((r) => setTimeout(r, 500));
      assert(await page.evaluate(() => typeof window.APP._show4DWindow === 'function'), 'A._show4DWindow is exposed once loadNavigate() has run');

      // Real member guid + a sentinel guid, both via the SAME live A._show4DWindow exposed for witnesses.
      const guids = await page.evaluate(() => {
        const rows = window.APP.dbQuery('SELECT te.guid FROM task_elements te LIMIT 1');
        return { real: rows.length ? rows[0][0] : null };
      });
      assert(!!guids.real, 'have a real member guid from the live HHS building');
      const hitHtml = await page.evaluate((g) => { window.APP._show4DWindow(g); return document.getElementById('info-4d').innerHTML; }, guids.real);
      assert(/Task/.test(hitHtml), 'PART B: live _show4DWindow(realGuid) renders the Task row in the real browser DOM');
      const missHtml = await page.evaluate(() => { window.APP._show4DWindow('NOT_A_REAL_GUID_S7_GATE_LIVE'); return document.getElementById('info-4d').innerHTML; });
      assert(/not yet assigned/i.test(missHtml), 'PART B: live _show4DWindow(sentinelGuid) states the reason in the real browser DOM');
      assert(errs.length === 0, 'zero pageerrors on the schedule-carrying building (errs=' + errs.join(' | ') + ')');
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

(async () => {
  await partA();
  await partB();
  console.log('§WITNESS_S7_GATE pass=' + pass + ' fail=' + fail + ' skipped=' + skipped);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — #info-4d never renders an empty-but-visible block (hidden with no schedule, states its own reason on a real per-element miss) and the pill icon\'s presence tracks the same gate' + (skipped ? ' (Part B partially/fully skipped — see SKIP lines above)' : ', verified in BOTH the pure engine layer and the real rendered DOM'));
})().catch((e) => { console.error('§WITNESS_S7_GATE CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });
