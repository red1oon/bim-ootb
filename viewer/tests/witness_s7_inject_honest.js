#!/usr/bin/env node
// WITNESS — W-S7-INJECT-HONEST — provenance of an on-the-fly-injected schedule.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-INJECT ("HONESTY") / §S7-INJECT-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-INJECT's own measurement found that ALL THREE real schedule
// writers name their row 'Authored Schedule…' under schedule_id='SCH_AUTHORED' — so, unfixed, an
// auto-injected schedule would be INDISTINGUISHABLE from one the user authored by hand, which is
// exactly the "generated default reads as the committed programme" failure §DOCTRINE 4 (honest
// labels) forbids. This witness proves THREE things together, none of which alone is sufficient:
//   (1) an injected schedule's `schedules.name` is the GEN_NAME provenance string
//       ('Default Programme (auto-generated)'), not the wizard's own 'Authored Schedule (4D
//       template)' — proving the rename actually fires, not merely that some string exists;
//   (2) `schedule_id` STAYS 'SCH_AUTHORED' — proving HONESTY did not "fix" provenance by repurposing
//       the id, which would flip activeSchedule()'s captured/authored classification and make the
//       injected schedule read as an import (the ONE state that must never be auto-touched again);
//   (3) `#info-4d` (info_4d_panel.js's real render()) RENDERS that distinction on a hit — proving
//       the string is not merely sitting in a column nobody reads. Checked against BOTH provenance
//       strings (the injected one AND the wizard's own), so this proves the renderer shows WHATEVER
//       is actually stored, not a hardcoded "auto-generated" literal that would coincidentally match.
//
// POPULATION: Duplex_extracted.db (real building, verified schedules=0) — one copy injected via the
// real ScheduleInject.inject(), a SEPARATE fresh copy materialized via the real
// ScheduleAuthor.materializeZones() directly (the wizard's own call shape, schedule_author_ui.js:289)
// with no injection involved, as the CONTRAST population for claim (1).
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_s7_inject_honest.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = (function () {
  try { return require('sql.js'); } catch (e) {
    const alt = path.join(process.env.SQLJS_HOME || path.join(os.homedir(), 'bim-ootb'), 'node_modules', 'sql.js');
    try { return require(alt); } catch (e2) {
      console.log('§SQLJS_MISSING neither require("sql.js") nor ' + alt + ' resolved — set SQLJS_HOME');
      throw e2;
    }
  }
})();
const ScheduleAuthor = require('../schedule_author.js');
const ScheduleRead4D = require('../schedule_read_4d.js');
const ScheduleGate = require('../schedule_gate.js');
const ScheduleInject = require('../schedule_inject.js');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const FILE = 'Duplex_extracted.db';

function loadRules() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  const slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', '4D_template.json'), 'utf8'));
function loadDb(SQL) { return new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD_DIR, FILE)))); }

// Same fakeDom/global-registration convention as witness_s7_gate.js, so info_4d_panel.js's real
// render() (never reimplemented) can run headlessly.
function makeFakeDom() {
  const els = {};
  global.document = { getElementById: function (id) { if (!els[id]) els[id] = { style: { display: '' }, innerHTML: '' }; return els[id]; } };
  return els;
}

(async () => {
  const SQL = await initSqlJs();
  const rules = loadRules();

  // ── (1) + (2): inject() produces GEN_NAME under schedule_id='SCH_AUTHORED' ──────────────────────
  const dbInj = loadDb(SQL);
  const res = await ScheduleInject.inject({ db: dbInj }, {
    scheduleAuthor: ScheduleAuthor, rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES,
    scheduleGate: ScheduleGate, template: TEMPLATE
  });
  assert(!!(res && res.ok), 'inject() materialized ok=' + (res && res.ok));
  const injRow = dbInj.exec("SELECT schedule_id, name FROM schedules");
  const injId = injRow.length ? injRow[0].values[0][0] : null;
  const injName = injRow.length ? injRow[0].values[0][1] : null;
  assert(injId === 'SCH_AUTHORED', "injected schedule_id STAYS 'SCH_AUTHORED' (got " + injId + ") — HONESTY forbids repurposing the id");
  assert(injName === ScheduleInject.GEN_NAME, 'injected schedules.name === ScheduleInject.GEN_NAME ("' + ScheduleInject.GEN_NAME + '"), got "' + injName + '"');
  const injSched = ScheduleAuthor.activeSchedule(dbInj);
  assert(!!(injSched && injSched.authored === true && injSched.captured === false),
    "activeSchedule() still classifies the injected schedule as authored/non-captured (authored=" + (injSched && injSched.authored) + ' captured=' + (injSched && injSched.captured) + ') — the id rule was not violated');

  // ── contrast population: the WIZARD's own call shape, no injection involved ──────────────────────
  const dbWiz = loadDb(SQL);
  const wizRes = ScheduleAuthor.materializeZones(dbWiz, rules.SEQUENCE_RULES,
    { start: '2026-01-01', laborRates: rules.LABOR_RATES, scheduleGate: ScheduleGate, template: TEMPLATE });
  assert(!!(wizRes && wizRes.ok), 'contrast: real materializeZones (wizard call shape, no injection) wrote ok=' + (wizRes && wizRes.ok));
  const wizRow = dbWiz.exec("SELECT schedule_id, name FROM schedules");
  const wizName = wizRow.length ? wizRow[0].values[0][1] : null;
  assert(wizName === 'Authored Schedule (4D template)', 'contrast: the WIZARD\'s own (non-injected) schedule keeps ITS name ("' + wizName + '") — proving (1) is the rename firing, not a name materializeZones already produces on its own');
  assert(injName !== wizName, 'the injected name and the wizard name are DISTINCT strings (§DOCTRINE 4: a generated default must not read as the committed programme)');

  // ── (3): #info-4d renders whichever provenance is actually stored ────────────────────────────────
  const guidInj = (function () { const r = dbInj.exec('SELECT guid FROM task_elements LIMIT 1'); return r.length && r[0].values.length ? r[0].values[0][0] : null; })();
  const guidWiz = (function () { const r = dbWiz.exec('SELECT guid FROM task_elements LIMIT 1'); return r.length && r[0].values.length ? r[0].values[0][0] : null; })();
  assert(!!guidInj && !!guidWiz, 'have real member guids from both the injected and the wizard-materialized schedule');

  {
    const els = makeFakeDom();
    global.window = global; global.ScheduleRead4D = ScheduleRead4D; global.ScheduleAuthor = ScheduleAuthor;
    global.Info4DPanel = require('../info_4d_panel.js');
    delete require.cache[require.resolve('../find_erp_push.js')];
    const FindErpPush = require('../find_erp_push.js');
    const A = { db: dbInj, activeBuilding: 'Duplex' };
    const mod = FindErpPush.create({ A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; }, selectionPriced: function () { return null; }, cur: function () { return 'RM'; } });
    mod.show4DWindow(guidInj);
    const html = els['info-4d'].innerHTML;
    assert(html.indexOf(ScheduleInject.GEN_NAME) !== -1, '#info-4d (real render(), injected schedule) shows the GEN_NAME provenance string — "' + html.replace(/\n/g, ' ') + '"');
    assert(/Task/.test(html), '#info-4d still renders the normal Task/Window rows alongside the provenance line (not replaced by it)');
  }
  {
    const els = makeFakeDom();
    global.window = global; global.ScheduleRead4D = ScheduleRead4D; global.ScheduleAuthor = ScheduleAuthor;
    global.Info4DPanel = require('../info_4d_panel.js');
    delete require.cache[require.resolve('../find_erp_push.js')];
    const FindErpPush = require('../find_erp_push.js');
    const A = { db: dbWiz, activeBuilding: 'Duplex' };
    const mod = FindErpPush.create({ A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; }, selectionPriced: function () { return null; }, cur: function () { return 'RM'; } });
    mod.show4DWindow(guidWiz);
    const html = els['info-4d'].innerHTML;
    assert(html.indexOf('Authored Schedule (4D template)') !== -1, '#info-4d (real render(), WIZARD schedule) shows the WIZARD\'s own provenance string, proving the renderer shows whatever is stored, not a hardcoded "auto-generated" literal — "' + html.replace(/\n/g, ' ') + '"');
    assert(html.indexOf(ScheduleInject.GEN_NAME) === -1, '#info-4d on the wizard schedule does NOT show the injected GEN_NAME string (the two provenances are not cross-contaminating)');
  }

  dbInj.close(); dbWiz.close();

  console.log('§WITNESS_S7_INJECT_HONEST pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — an injected schedule keeps schedule_id=SCH_AUTHORED, is named ' +
    '"' + ScheduleInject.GEN_NAME + '" (distinct from the wizard\'s own name), and #info-4d renders ' +
    'that exact distinction — a generated default cannot present as the project\'s committed programme.');
})().catch((e) => { console.error('§WITNESS_S7_INJECT_HONEST CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });
