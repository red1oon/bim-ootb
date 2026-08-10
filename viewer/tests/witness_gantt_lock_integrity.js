#!/usr/bin/env node
// witness_gantt_lock_integrity.js — §GANTT_LOCK_INTEGRITY (2026-08-07, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md). Proves the 🔓→🔒 lock-back transition VERIFIES physical
// integrity of the edited schedule and REFUSES to lock while anything floats — a user must Undo
// (or fix by further edits) before locking completes. Today locking just flips a flag: whatever
// the user dragged is accepted as-is, no re-check — a drag that strands an element mid-air locks
// in silently, precisely the "drag hides a real defect" failure the C-band constraint rules exist
// to prevent.
//
// Names the issues it tests:
//   G-LI-1  auditFloating names offenders: optional collector arg fills the offending GUIDs
//           (count return unchanged for every existing caller). RED on main: arg ignored.
//   G-LI-2  verifyGanttIntegrity() (sliced from the SHIPPED time_machine.js, never reimplemented —
//           repo convention, witness_gantt_edit_undo.js): on a REAL building (Duplex) with a REAL
//           computeSchedule-derived op set — clean state verifies ok; a simulated bad drag (element
//           moved to start before its support finishes) is caught with the offender named; restoring
//           the edit (what ↺ Undo does) verifies clean again. RED on main: function absent.
//   G-LI-3  lock-gate wiring (static source, same convention as witness_tm_panel_resize_h): the
//           lock handler verifies on the Editing→Locked transition ONLY (unlock never gated),
//           REFUSES the flip on breach (stays editable), shows an "Integrity Breach" message
//           naming the Undo path, logs §GANTT_LOCK_BREACH / §GANTT_LOCK_VERIFY. RED on main.
//   G-LI-4  cost (spec open-question 3): auditFloating over Hospital-scale (63,415 elements) —
//           measured, printed, sane (<10s); the handler paints "Verifying…" before running.
//
// Read the §LI log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

/* ── G-LI-1: auditFloating collector names the offender ────────────────────────────────────── */
// slab bears wall; wall scheduled to START before the slab it stands on FINISHES = 1 floating.
const synEls = [
  { guid: 'SLAB', cls: 'IfcSlab', seq: 4, storey: 'L1', x0: 0, x1: 10, y0: 0, y1: 10, base_z: 0, top_z: 0.3 },
  { guid: 'WALL', cls: 'IfcWallStandardCase', seq: 6, storey: 'L1', x0: 0, x1: 10, y0: 0, y1: 0.2, base_z: 0.3, top_z: 3 },
];
const synSched = { SLAB: { start: 0, end: 1000000 }, WALL: { start: 100, end: 2000000 } };
const got = [];
const synN = ScheduleGate.auditFloating(synEls, synSched, null, got);
assert(synN === 1, 'G-LI-1a count unchanged: floating=' + synN + ' (wall starts at 100, its slab ends at 1000000)');
assert(got.length === 1 && got[0] === 'WALL', 'G-LI-1b collector names the offender: got=[' + got.join(',') + '] (RED on main: arg ignored, empty)');

/* ── G-LI-3: lock-gate wiring, static source ───────────────────────────────────────────────── */
(function () {
  let handler = '';
  const anchor = tmSrc.indexOf("lockBtn.addEventListener('pointerup'");
  if (anchor >= 0) {
    let depth = 0, i = tmSrc.indexOf('{', anchor), start = i, seenOpen = false;
    for (; i < tmSrc.length; i++) {
      if (tmSrc[i] === '{') { depth++; seenOpen = true; }
      else if (tmSrc[i] === '}') { depth--; if (seenOpen && depth === 0) { handler = tmSrc.slice(start, i + 1); break; } }
    }
  }
  assert(handler.length > 0, 'G-LI-3a lock handler found');
  assert(handler.indexOf('verifyGanttIntegrity') >= 0, 'G-LI-3b handler calls verifyGanttIntegrity (RED on main: no verification at all)');
  assert(handler.indexOf('Integrity Breach') >= 0, 'G-LI-3c breach message shown ("Integrity Breach")');
  assert(/Undo/.test(handler), 'G-LI-3d breach message names the Undo path');
  assert(handler.indexOf('§GANTT_LOCK_BREACH') >= 0, 'G-LI-3e refusal is logged (§GANTT_LOCK_BREACH), silence is not a refusal');
  assert(handler.indexOf('§GANTT_LOCK_VERIFY') >= 0, 'G-LI-3f clean lock is logged (§GANTT_LOCK_VERIFY, with ms)');
  assert(handler.indexOf('Verifying') >= 0, 'G-LI-3g paints a "Verifying…" state before the audit (cost honesty, spec Q3)');
  // the refusal path must RETURN before _ganttEditable is flipped false — i.e. inside the handler,
  // the breach branch keeps editing on. Structural: '_ganttEditable = false' appears only AFTER the
  // verify call in source order, and a `return` sits between the breach log and it.
  const vIdx = handler.indexOf('verifyGanttIntegrity');
  const lockOff = handler.indexOf('_ganttEditable = false');
  assert(lockOff > vIdx, 'G-LI-3h lock (editable=false) only after verification in the Editing→Locked branch');
  const breachIdx = handler.indexOf('§GANTT_LOCK_BREACH');
  const retIdx = handler.indexOf('return', breachIdx);
  assert(breachIdx >= 0 && retIdx > breachIdx && (lockOff < 0 || retIdx < lockOff),
    'G-LI-3i breach branch returns (refuses) before the flag ever flips');
  // unlock direction (Locked→Editing) is NEVER gated — verify must be inside the _ganttEditable
  // (currently-editing) branch only.
  assert(/if\s*\(\s*_ganttEditable\s*\)[\s\S]*verifyGanttIntegrity/.test(handler),
    'G-LI-3j verification scoped to the Editing→Locked transition only (unlock never gated, spec Q2)');
})();

/* ── G-LI-2: verify core, sliced + driven on real Duplex ───────────────────────────────────── */
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

(async () => {
  let sliced;
  try {
    // _promoteRoofLoadPath: _buildXrayElements calls it since the #1272 consolidation — slice it
    // too when present (same both-commits pattern as witness_tm_geo_order_cycles.js; without this
    // the witness crashed ReferenceError on every post-#1272 run).
    const _names = ['_buildXrayElements', 'verifyGanttIntegrity'];
    if (tmSrc.indexOf('function _promoteRoofLoadPath(') >= 0) _names.unshift('_promoteRoofLoadPath');
    sliced = _names.map(n => sliceFn(tmSrc, n)).join('\n');
  } catch (e) {
    assert(false, 'G-LI-2 slice failed (RED on main: ' + e.message + ')');
    finish();
    return;
  }
  const dbPath = path.join(BLD_DIR, 'Duplex_extracted.db');
  if (!fs.existsSync(dbPath)) { console.log('§LI_SKIP Duplex fixture missing at ' + dbPath); finish(); return; }
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));

  const sandbox = {
    console: console,
    performance: { now: () => Date.now() },
    ScheduleGate: ScheduleGate,
    window: { SEQUENCE_RULES: rulesJson.SEQUENCE_RULES, SEQUENCE_DEFAULT: rulesJson.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rulesJson.SEQUENCE_NAME_OVERRIDES || [] },
    A: function () { return { db: db }; },
    _ops: [],
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nthis.__verify = verifyGanttIntegrity; this.__bxe = _buildXrayElements;', sandbox);

  // Seed _ops from the REAL scheduler on the REAL geometry — the clean, engine-produced state.
  const els = sandbox.__bxe();
  assert(els && els.length > 500, 'G-LI-2a _buildXrayElements yields real geometry (n=' + (els ? els.length : 0) + ')');
  const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
  geoEls.forEach(e => { e.resource = e.cls; e.installSecs = 120; });
  const sched = ScheduleGate.computeSchedule(geoEls, 0, 1);
  sandbox._ops = geoEls.map(e => ({ timestamp: sched[e.guid].start, end_ts: sched[e.guid].end, output_guid: e.guid, input_guids: [e.guid] }));

  const clean = sandbox.__verify();
  assert(clean && clean.ok === true && clean.floating === 0,
    'G-LI-2b clean engine schedule verifies ok (floating=' + (clean && clean.floating) + '/' + (clean && clean.total) + ' ms=' + (clean && clean.ms) + ')');

  // Simulate the bad drag: take a floating-capable element (has a real bearing support that ends
  // late) and move its op to start at time 0 — before its support finishes. Find one empirically:
  // latest-starting gated elements first, stop at the first whose early-move breaks the audit.
  const byLate = sandbox._ops.slice().sort((a, b) => b.timestamp - a.timestamp);
  let brokeGuid = null, saved = null, breach = null;
  for (let i = 0; i < Math.min(byLate.length, 200); i++) {
    const op = byLate[i];
    saved = { op: op, t: op.timestamp, e: op.end_ts };
    const dur = op.end_ts - op.timestamp;
    op.timestamp = 0; op.end_ts = dur;
    breach = sandbox.__verify();
    if (!breach.ok) { brokeGuid = op.output_guid; break; }
    op.timestamp = saved.t; op.end_ts = saved.e; saved = null;
  }
  assert(brokeGuid !== null, 'G-LI-2c a real bad drag is constructible on Duplex (moved ' + brokeGuid + ' to t=0)');
  assert(breach && breach.ok === false && breach.floating > 0,
    'G-LI-2d breach detected on lock-back verify (floating=' + (breach && breach.floating) + ')');
  assert(breach && breach.guids && breach.guids.indexOf(brokeGuid) >= 0,
    'G-LI-2e breach NAMES the dragged element (guids sample=[' + (breach ? breach.guids.slice(0, 3).join(',') : '') + '])');

  // Undo (restore the exact pre-edit values, what undoLastGanttEdit does) → verifies clean again.
  if (saved) { saved.op.timestamp = saved.t; saved.op.end_ts = saved.e; }
  const after = sandbox.__verify();
  assert(after.ok === true && after.floating === 0, 'G-LI-2f after Undo the lock verifies ok again (floating=' + after.floating + ')');
  db.close();

  /* ── G-LI-4: audit cost at Hospital scale (spec open-question 3, measured not guessed) ────── */
  const HOSP = '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db';
  if (fs.existsSync(HOSP)) {
    const SR = rulesJson.SEQUENCE_RULES, SDEF = rulesJson.SEQUENCE_DEFAULT || { sequence: 6 };
    const matchRule = c => { let b = null, l = 0; for (const k in SR) if (c.indexOf(k) >= 0 && k.length > l) { b = k; l = k.length; } return b ? SR[b] : SDEF; };
    const csv = execSync(
      `sqlite3 -noheader -csv "${HOSP}" "SELECT m.guid,m.ifc_class,COALESCE(t.center_x,0),COALESCE(t.center_y,0),` +
      `COALESCE(t.center_z,0),COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0),COALESCE(t.bbox_z,0),COALESCE(m.storey,'_UNKNOWN') ` +
      `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class!='IfcOpeningElement';"`,
      { maxBuffer: 1 << 28 }).toString().trim().split('\n');
    const hEls = csv.map(line => {
      const a = line.split(','); if (a.length < 8) return null;
      const cls = a[1], cx = +a[2], cy = +a[3], cz = +a[4], bx = +a[5], by = +a[6], bz = +a[7], r = matchRule(cls);
      return { guid: a[0], cls, seq: r.sequence, resource: r.resource || cls, storey: (a[8] || '_UNKNOWN').replace(/"/g, ''),
               installSecs: 120, x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2, base_z: cz - bz / 2, top_z: cz + bz / 2 };
    }).filter(Boolean);
    const hSched = ScheduleGate.computeSchedule(hEls, 0, 1);
    const at0 = Date.now();
    const hFloat = ScheduleGate.auditFloating(hEls, hSched, null, []);
    const atMs = Date.now() - at0;
    console.log('§LI_COST auditFloating n=' + hEls.length + ' ms=' + atMs + ' floating=' + hFloat);
    assert(atMs < 10000, 'G-LI-4 Hospital-scale lock-back audit measured: ' + atMs + 'ms for ' + hEls.length + ' elements (<10s sanity bar)');
  } else console.log('§LI_SKIP Hospital fixture missing — G-LI-4 cost not measured');

  finish();
})();

function finish() {
  console.log('§GANTT_LOCK_INTEGRITY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — lock-back verifies physical integrity, refuses on breach, names offenders, clears after Undo');
}
