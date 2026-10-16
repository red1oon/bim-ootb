#!/usr/bin/env node
// witness_tm_played_layer_midair.js — W-PLM. THE §TM_PLAYED_LAYER LINE JUDGES ITS OWN LAYER.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_MODEL_INTEGRITY.md §M.5 item 2, 2026-09-04,
// §TM_PLAYED_LAYER_MIDAIR). Read the log after every run (project Log Mandate).
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   scripts/lib/tm_played_layer.js printed `midair=` on the §TM_PLAYED_LAYER line from `dt.midair` —
//   the CPM-DISPLAY judge's count — under the words "these are the instants kernel_ops carries". The
//   OWNER (SupportSweep.midairAudit, §I "is anything floating?") re-judged on the played instants says
//   Duplex 257 where the line said 0, HHS 152 where it said 0, Hospital META 539 where it said 583.
//   A witness that reports the wrong layer's number under its own name is worse than no witness
//   (PRIMAL LAW clause 4). This file holds the line: the number printed as the played layer's midair
//   IS the owner's verdict over the played map, the CPM-display number is printed under its own name,
//   and the line can say UNJUDGED / VACUOUS instead of a meaningless 0.
//
// CLAIMS (PASS / FAIL / INCONCLUSIVE — a 0 over an empty population is never a PASS):
//   C1 NAMED       the § line carries `midairPlayed=` AND `midairCpmDisplay=` and NO bare `midair=`.
//   C2 OWNER       midairPlayed equals SupportSweep.midairAudit (the real module, called here) over
//                  the played map — the mirror and the owner cannot disagree.
//   C3 SUBJECT     anti-vacuous: on this fixture the two numbers DIFFER, i.e. the old line really was
//                  reporting a different subject (INCONCLUSIVE, not FAIL, if a fixture happens to tie).
//   C4 RED         a played map with ONE extra element pulled 2 d before its elected support (an
//                  element that supports nothing itself, so exactly one verdict can change) is judged
//                  midairPlayed + 1 — the judge moves with the map it is pointed at.
//   C5 HONEST      with no owner in the sandbox the token is UNJUDGED; with no items it is VACUOUS.
//
// Command: node viewer/tests/witness_tm_played_layer_midair.js [Building]     (default Duplex)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const V = path.join(ROOT, 'viewer');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const BLD = process.argv[2] || 'Duplex';
const DAY_MS = 86400000;

const TMP = require(path.join(ROOT, 'scripts', 'lib', 'tm_played_layer.js'));
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const tmSrc = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, verdict, detail) {
  if (verdict === 'PASS') pass++; else if (verdict === 'FAIL') fail++; else inconclusive++;
  console.log('§W_PLM ' + id.padEnd(12) + verdict.padEnd(13) + (detail || ''));
}
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

(async () => {
  let mp = null;
  const dbf = path.join(BLD_DIR, BLD + '_extracted.db');
  if (!fs.existsSync(dbf)) { claim('C0_FIXTURE', 'INCONCLUSIVE', 'no fixture at ' + dbf); return done(); }
  const initSqlJs = require(path.join(ROOT, 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'node_modules', 'sql.js', 'dist', f) });
  const R = executedRules();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbf)));

  // The run — the same configuration scripts/cache_4d_run.js persists (template, real rates, the
  // displayRemap hook, SupportSweep loaded). The § log is teed, never suppressed (PRIMAL LAW clause 3).
  const seen = [];
  const _log = console.log;
  console.log = function () { const s = Array.prototype.join.call(arguments, ' '); seen.push(s); _log(s); };
  const sb = TMP.buildSandbox({ tmSrc: tmSrc, SA: SA, SG: SG, CP: CP, GM: GM, SS: SS, LABOR_RATES: R.LABOR_RATES, console: console });
  const base = { start: '2026-01-01', laborRates: R.LABOR_RATES, rates: R.RATES, nameOverrides: R.SEQUENCE_NAME_OVERRIDES,
    defaultRule: R.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db,
    displayRemap: sb._tmDisplayRemap };
  const elements = SA._buildScheduleElements(db, R.SEQUENCE_RULES, base);
  globalThis.APP = { db: db };
  const res = SA.materializeZones(db, R.SEQUENCE_RULES, base);
  if (!res || !res.ok || !res.tasks) { console.log = _log; claim('C0_RUN', 'INCONCLUSIVE', 'materializeZones failed ' + JSON.stringify(res && res.reason)); return done(); }
  const tasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays, phase: t.phase, storey: t.storey, guids: t.guids }));
  mp = TMP.mirrorInjectGantt({ sb: sb, elements: elements, tasks: tasks, db: db, startISO: base.start, applyTiling: true, log: console.log });
  delete globalThis.APP;
  console.log = _log;
  if (!mp.ok) { claim('C0_MIRROR', 'INCONCLUSIVE', mp.reason); return done(); }
  const line = seen.filter(l => l.indexOf('§TM_PLAYED_LAYER ') === 0).pop() || '';
  const tplModel = seen.filter(l => l.indexOf('§TPL_MODEL') === 0).pop() || '';
  console.log('§W_PLM_POPULATION ' + BLD + ' elements=' + elements.length + ' tasks=' + tasks.length +
    ' model=' + (tplModel.indexOf('model=template') >= 0 ? 'template' : 'NOT-TEMPLATE') +
    ' line=' + (line ? line.slice(0, 200) : '(NO §TM_PLAYED_LAYER LINE)'));

  // ── C1 NAMED ────────────────────────────────────────────────────────────────────────────────────
  {
    const hasPlayed = /\bmidairPlayed=/.test(line), hasCpm = /\bmidairCpmDisplay=/.test(line);
    const bare = /\smidair=/.test(line);
    claim('C1_NAMED', !line ? 'INCONCLUSIVE' : (hasPlayed && hasCpm && !bare ? 'PASS' : 'FAIL'),
      'midairPlayed=' + hasPlayed + ' midairCpmDisplay=' + hasCpm + ' bareMidairToken=' + bare +
      ' — a bare midair= is the anonymous number this witness exists to keep dead');
  }

  // ── C2 OWNER — the real module, over the played map, must equal what the line printed ─────────
  const items = mp.twItems.map(it => Object.assign({}, it, { s: mp.play[it.guid].s, e: mp.play[it.guid].e, task: mp.guidTask[it.guid] }));
  const owner = SS.midairAudit(items);
  const printed = (line.match(/midairPlayed=(\S+)/) || [])[1];
  {
    const ok = printed === String(owner.midair) && mp.stats.midairPlayed === owner.midair;
    claim('C2_OWNER', items.length === 0 ? 'INCONCLUSIVE' : (ok ? 'PASS' : 'FAIL'),
      'owner SupportSweep.midairAudit(played)=' + owner.midair + ' line=' + printed + ' stats=' + mp.stats.midairPlayed +
      ' judged=' + items.length);
  }

  // ── C3 SUBJECT — the number the line USED to print is a different subject on this fixture ──────
  {
    const cpm = mp.stats.midairCpmDisplay;
    const v = (typeof cpm !== 'number') ? 'INCONCLUSIVE' : (cpm !== owner.midair ? 'PASS' : 'INCONCLUSIVE');
    claim('C3_SUBJECT', v, 'midairCpmDisplay=' + cpm + ' midairPlayed=' + owner.midair +
      (v === 'PASS' ? ' — the old line reported the former under the latter\'s name' :
        ' — equal on this fixture, so this run cannot show the old line was lying (it still cannot lie now: C1/C2)'));
  }

  // ── C4 RED CONTROL — move one supported, non-supporting element 2 d before its support ─────────
  {
    const G = SS.contactGraph(items);
    const des = SS.designatedSupport(items, G);
    const isSupport = new Set(); des.forEach(s => { if (s >= 0) isSupport.add(s); });
    let victim = -1;
    for (let i = 0; i < items.length; i++) {
      const s = des[i];
      if (s < 0 || isSupport.has(i)) continue;                 // must be supported, and support nothing
      if (items[s].s > items[i].s + 1) continue;                // already midair — moving it changes nothing
      victim = i; break;
    }
    if (victim < 0) claim('C4_RED', 'INCONCLUSIVE', 'no supported non-supporting element on ' + BLD + ' to break');
    else {
      const mutated = Object.assign({}, mp.play);
      const sup = items[des[victim]];
      const dur = mp.play[items[victim].guid].e - mp.play[items[victim].guid].s;
      mutated[items[victim].guid] = { s: sup.s - 2 * DAY_MS, e: sup.s - 2 * DAY_MS + Math.max(60000, dur) };
      const mj = TMP.judgePlayedMidair(sb, mp.twItems, mutated, mp.guidTask);
      claim('C4_RED', mj.midair === owner.midair + 1 ? 'PASS' : 'FAIL',
        'victim=' + items[victim].cls + ' ' + items[victim].guid.slice(0, 8) + ' pulled 2 d before its support ' + sup.cls +
        ' → judge says ' + mj.midair + ' (expected ' + (owner.midair + 1) + ')');
    }
  }

  // ── C5 HONEST — UNJUDGED without an owner, VACUOUS without items ────────────────────────────────
  {
    const noOwner = TMP.judgePlayedMidair({ _midairAudit: undefined }, mp.twItems, mp.play, mp.guidTask);
    const noItems = TMP.judgePlayedMidair(sb, [], {}, {});
    const ok = TMP.describeMidair(noOwner) === 'UNJUDGED' && noOwner.midair === null &&
      TMP.describeMidair(noItems) === 'VACUOUS' && noItems.judged === 0;
    claim('C5_HONEST', ok ? 'PASS' : 'FAIL', 'noOwner→' + TMP.describeMidair(noOwner) + ' noItems→' + TMP.describeMidair(noItems));
  }
  db.close();
  done();

  function done() {
    console.log('§WITNESS_TM_PLAYED_LAYER_MIDAIR pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive +
      ' building=' + BLD + ' midairPlayed=' + (mp && mp.stats ? mp.stats.midairPlayedStatus : 'n/a') +
      ' midairCpmDisplay=' + (mp && mp.stats ? mp.stats.midairCpmDisplay : 'n/a'));
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('§W_PLM_ERROR ' + (e && e.stack || e)); process.exit(2); });
