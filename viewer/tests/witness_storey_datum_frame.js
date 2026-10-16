#!/usr/bin/env node
// witness_storey_datum_frame.js — §STOREY_DATUM_FRAME: the declared storey ladder must be in the
// same VERTICAL FRAME as the geometry it bands, on the DBs the viewer ACTUALLY LOADS.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.6, 2026-09-03).
// Read the §-log after every run. Judges the meta / patched-meta / silent DBs, NOT only *_extracted.db
// — a witness that passes only on extracted is the exact defect that shipped PR #1551.
//
// THE ISSUE IT PROVES OR DISPROVES (user, 2026-09-03: "the bake is too fast paced"; and: "The local
// saved DB is supposedly similar to the OCI one. Thus its 4D schedule should be the same."):
//   PR #1551 (§STOREY_DATUM) chose the datum column by EMPTINESS — `elevation` rows if any, else
//   `center_z`. Hospital_meta.db (the split pair streaming.js §DB_SPLIT_DETECT serves, and the user's
//   Hospital_silent.db) carry 63 IfcBuildingStorey rows in TWO frames: 56 federated `elevation` rows
//   at 0.0…34.0 m (a local per-file frame) and 7/8 COMPILED `center_z` rows at 166…201 m (the world
//   frame the geometry is in). Elevation won, every element base-Z (156.6…202.8 m) sat above the top
//   datum, and all 63,182 landed in ONE band: 7 tasks / 509 days instead of 8 bands / 42 tasks / 318.
//   #1551's own check ran on Hospital_extracted.db, which has NO spatial_structure table, and read
//   "no declared storeys ⇒ byte-identical" — true there, false on what the viewer loads.
//
// WHAT IT ASSERTS (each named; the contract prints PASS/FAIL per invariant and proves the red control):
//   frame-consistent        every DECLARED row's ladder span [d_0, d_last] contains the element base-Z median
//   declared-partitions     every DECLARED row uses >= 2 bands (a ladder that puts everything in one band is a NO-OP)
//   hospital-not-collapsed  Hospital meta / patched-meta / silent: DECLARED on center_z, the elevation set
//                           REJECTED as OUT_OF_FRAME, >= 7 bands; and #1551's rule on the SAME data → 1 rung
//                           (the defect existed; this fix is not a no-op there)
//   fleet-noop-vs-1551      every non-Hospital row: the chosen source equals what #1551's rule picks (NO-OP)
//   log-matches-verb        the shipped §STOREY_DATUM line names the same source and bandsUsed the verb returned
//   silent-matches-meta     (only when ~/Downloads/Hospital_silent.db is present, else INCONCLUSIVE) the
//                           user's DB and the OCI meta DB choose the same mode+source, and the meta ladder's
//                           level names are a subset of the silent ladder's — the residual is NAMED, not hidden
//   extracted-is-vacuous    Hospital_extracted.db → INFERRED, reason NO_DECLARED_STOREYS: the row #1551 judged
//                           could never have seen the defect
//
// NO-OP / VACUOUS / INCONCLUSIVE: no Hospital_meta.db on this machine ⇒ the verdict line prints
// INCONCLUSIVE (never PASS); no silent DB ⇒ that one claim prints INCONCLUSIVE and the verdict says so.
//
// Command: node viewer/tests/witness_storey_datum_frame.js
//   env BLD_DIR (default ~/bim-ootb/buildings), SILENT_DB (default ~/Downloads/Hospital_silent.db)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { Witness } = require('../../witness_kit/contract');
const HOME = os.homedir();
const V = path.join(__dirname, '..');
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const SILENT_DB = process.env.SILENT_DB || path.join(HOME, 'Downloads', 'Hospital_silent.db');
const PATCH_DIR = path.join(BLD_DIR, 'patches');

const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const TMP = require(path.join(V, '..', 'scripts', 'lib', 'tm_played_layer.js'));
const tmSrc = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
// Mirror of viewer/scene.js A._runSqlChunked — statement split on a line ending in `;`, 500 per run.
function runSqlChunked(db, sql) {
  const rawLines = sql.split('\n'), statements = []; let buf = [];
  for (const ln of rawLines) { if (!ln.trim().length) continue; buf.push(ln); if (/;\s*$/.test(ln)) { statements.push(buf.join('\n')); buf = []; } }
  if (buf.length) statements.push(buf.join('\n'));
  for (let i = 0; i < statements.length; i += 500) db.run(statements.slice(i, i + 500).join('\n'));
  return statements.length;
}

// The variants judged. `patched` mirrors A._applyPendingPatch: the served file + buildings/patches/<file>.sql.
function variants() {
  const out = [];
  // a 0-byte *_meta.db is a dev artifact, not a split pair (probe_storey_datum.js applies the same rule)
  const exists = f => fs.existsSync(f) && fs.statSync(f).size > 0;
  const add = (building, kind, file, patch) => { if (exists(file)) out.push({ building, kind, file, patch: patch || null }); };
  for (const b of ['Hospital', 'Terminal', 'Clinic', 'LTU_AHouse', 'Duplex', 'HHS_Office_Federated']) {
    const meta = path.join(BLD_DIR, b + '_meta.db'), ext = path.join(BLD_DIR, b + '_extracted.db');
    const live = exists(meta) ? meta : ext;                              // what streaming.js §DB_SPLIT_DETECT serves
    add(b, exists(meta) ? 'meta' : 'extracted', live);
    const patch = path.join(PATCH_DIR, path.basename(live) + '.sql');
    if (exists(patch)) add(b, 'patched-' + (live === meta ? 'meta' : 'extracted'), live, patch);
    if (b === 'Hospital') add(b, 'extracted', ext);                       // the row #1551 judged — vacuous by construction
  }
  add('Hospital', 'silent', SILENT_DB);
  return out;
}

async function judge(v, SQL, R) {
  let db = new SQL.Database(new Uint8Array(fs.readFileSync(v.file)));
  let patchNote = 'none';
  if (v.patch) {
    try { const n = runSqlChunked(db, fs.readFileSync(v.patch, 'utf8')); patchNote = 'applied(' + n + ' statements)'; }
    catch (e) {   // A._applyPendingPatch returns the ORIGINAL buffer on any throw — mirror that, and say so
      db.close(); db = new SQL.Database(new Uint8Array(fs.readFileSync(v.file))); patchNote = 'FAILED→unpatched(' + (e && e.message) + ')';
    }
  }
  const sb = TMP.buildSandbox({ tmSrc, SA, SG, CP, GM, SS, LABOR_RATES: R.LABOR_RATES, console });
  const base = { start: '2026-01-01', laborRates: R.LABOR_RATES, rates: R.RATES, nameOverrides: R.SEQUENCE_NAME_OVERRIDES,
    defaultRule: R.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, displayRemap: sb._tmDisplayRemap };
  // Tee, never suppress (PRIMAL LAW clause 3): the shipped §STOREY_DATUM line is primary evidence.
  const captured = []; const q = console.log;
  console.log = function () { const s = Array.prototype.join.call(arguments, ' '); if (/^§STOREY_DATUM( |_FRAME)/.test(s)) captured.push(s); return q.apply(console, arguments); };
  let els;
  try { els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, base); } finally { console.log = q; }
  const cands = SA._storeyDatumCandidates(db);
  const choice = SA._chooseStoreyDatum(cands, els.map(e => e.base_z));
  const bands = {}; els.forEach(e => { bands[e.storey] = (bands[e.storey] || 0) + 1; });
  const line = captured.filter(s => s.startsWith('§STOREY_DATUM mode=')).pop() || '';
  const tok = (re) => { const m = line.match(re); return m ? m[1] : null; };
  const legacyRep = choice.candidates.find(c => c.source === choice.legacySource) || null;
  const row = {
    building: v.building, kind: v.kind, file: path.basename(v.file), patch: patchNote,
    mode: choice.mode, source: choice.source, reason: choice.reason, legacySource: choice.legacySource,
    changedFrom1551: choice.source !== choice.legacySource,
    ladderDatums: choice.ladder.length, ladderLo: isFinite(choice.lo) ? choice.lo : null, ladderHi: isFinite(choice.hi) ? choice.hi : null,
    ladderNames: choice.ladder.map(d => d.name),
    ezN: choice.ez.n, ezMin: choice.ez.min, ezMedian: choice.ez.median, ezMax: choice.ez.max,
    bandsUsed: Object.keys(bands).length, elements: els.length,
    legacyVerdict: legacyRep ? legacyRep.verdict : 'EMPTY', legacyRungsUsed: legacyRep ? legacyRep.rungsUsed : 0,
    candidates: choice.candidates.map(c => ({ source: c.source, rows: c.rows, datums: c.datums, verdict: c.verdict, rungsUsed: c.rungsUsed, below: c.below, above: c.above })),
    logMode: tok(/ mode=(\S+)/), logSource: tok(/ source=(\S+)/), logBandsUsed: Number(tok(/ bandsUsed=(\d+)/)), logVs1551: tok(/ vs#1551=(\S+)/),
    tasks: null, totalDays: null
  };
  if (v.building === 'Hospital' && v.kind !== 'extracted') {   // the acceptance shape, on the rows that matter
    globalThis.APP = { db };
    try { const res = SA.materializeZones(db, R.SEQUENCE_RULES, base); if (res && res.ok) { row.tasks = res.tasks.length; row.totalDays = res.totalDays; } }
    finally { delete globalThis.APP; }
  }
  db.close();
  console.log('§STOREY_DATUM_FRAME_ROW ' + v.building + ' ' + v.kind + ' file=' + row.file + ' patch=' + patchNote + ' mode=' + row.mode + ' source=' + row.source +
    ' ladder=' + row.ladderDatums + (row.ladderLo != null ? '[' + row.ladderLo.toFixed(3) + '..' + row.ladderHi.toFixed(3) + ']' : '') +
    ' bandsUsed=' + row.bandsUsed + ' elementBaseZ=' + row.ezN + '[' + row.ezMin.toFixed(3) + '..' + row.ezMax.toFixed(3) + ' median=' + row.ezMedian.toFixed(3) + ']' +
    ' legacy(#1551)=' + row.legacySource + ':' + row.legacyVerdict + '(rungsUsed=' + row.legacyRungsUsed + ')' + ' vs#1551=' + (row.changedFrom1551 ? 'CHANGED' : 'same') +
    (row.tasks != null ? ' tasks=' + row.tasks + ' totalDays=' + row.totalDays : ''));
  return row;
}

const RowSchema = {
  type: 'object',
  required: ['building', 'kind', 'mode', 'ladderDatums', 'ezN', 'ezMedian', 'bandsUsed', 'candidates', 'changedFrom1551', 'logSource', 'logBandsUsed'],
  properties: {
    building: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['meta', 'patched-meta', 'extracted', 'patched-extracted', 'silent'] },
    mode: { type: 'string', enum: ['DECLARED', 'INFERRED'] },
    source: { type: ['string', 'null'], enum: ['elevation', 'center_z', null] },
    legacySource: { type: ['string', 'null'], enum: ['elevation', 'center_z', null] },
    ladderDatums: { type: 'integer', minimum: 0 },
    ladderLo: { type: ['number', 'null'] }, ladderHi: { type: ['number', 'null'] },
    ezN: { type: 'integer', minimum: 1 },                       // a row judged over 0 elements is not a row
    ezMedian: { type: 'number' }, bandsUsed: { type: 'integer', minimum: 1 },
    candidates: { type: 'array', minItems: 2, items: { type: 'object', required: ['source', 'verdict', 'rungsUsed'],
      properties: { verdict: { type: 'string', enum: ['EMPTY', 'TOO_FEW', 'NO_ELEMENTS', 'IN_FRAME', 'OUT_OF_FRAME'] } } } },
    changedFrom1551: { type: 'boolean' },
    logSource: { type: ['string', 'null'] }, logBandsUsed: { type: 'integer' }
  },
  additionalProperties: true
};

(async () => {
  let initSqlJs, sqlDist;
  try { initSqlJs = require('sql.js'); sqlDist = path.dirname(require.resolve('sql.js/dist/sql-wasm.js')); }
  catch (e) { initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js')); sqlDist = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist'); }
  const SQL = await initSqlJs({ locateFile: f => path.join(sqlDist, f) });
  const R = executedRules();
  const vs = variants();
  const hasHospitalMeta = vs.some(v => v.building === 'Hospital' && v.kind === 'meta');
  const hasSilent = vs.some(v => v.kind === 'silent');
  if (!hasHospitalMeta) {
    console.log('§WITNESS_STOREY_DATUM_FRAME_VERDICT INCONCLUSIVE — no ' + path.join(BLD_DIR, 'Hospital_meta.db') +
      ': the split-pair DB the viewer loads is absent, so the defect population was not judged (an extracted-only run is the #1551 blind spot)');
    return;
  }
  const rows = [];
  for (const v of vs) { console.log('§STOREY_DATUM_FRAME_JUDGE ' + v.building + ' ' + v.kind + ' ' + v.file + (v.patch ? ' + ' + path.basename(v.patch) : '')); rows.push(await judge(v, SQL, R)); }

  // ── the residual between the user's DB and the OCI one, NAMED ──
  const meta = rows.find(r => r.building === 'Hospital' && r.kind === 'meta');
  const silent = rows.find(r => r.kind === 'silent');
  if (meta && silent) {
    const onlyS = silent.ladderNames.filter(n => meta.ladderNames.indexOf(n) < 0), onlyM = meta.ladderNames.filter(n => silent.ladderNames.indexOf(n) < 0);
    console.log('§STOREY_DATUM_FRAME_SILENT_VS_META mode=' + meta.mode + '/' + silent.mode + ' source=' + meta.source + '/' + silent.source +
      ' ladder=' + meta.ladderDatums + '/' + silent.ladderDatums + ' bandsUsed=' + meta.bandsUsed + '/' + silent.bandsUsed +
      ' tasks=' + meta.tasks + '/' + silent.tasks + ' totalDays=' + meta.totalDays + '/' + silent.totalDays +
      ' elements=' + meta.elements + '/' + silent.elements + ' silentOnlyLevels=' + JSON.stringify(onlyS) + ' metaOnlyLevels=' + JSON.stringify(onlyM) +
      ' ladderLo=' + meta.ladderLo.toFixed(3) + '/' + silent.ladderLo.toFixed(3) +
      ' — same choice on both; the ladder difference is the STC_* rows themselves (meta/patch = pre-#1552 walker, 7 rows at wall-CENTRE datum;' +
      ' silent = post-#1552 walker, 8 rows at FLOOR datum incl. Level 7A), see 4D_MODEL_INTEGRITY.md §I.6');
  } else {
    console.log('§STOREY_DATUM_FRAME_CLAIM silent-matches-meta INCONCLUSIVE — ' + SILENT_DB + ' not present; the user-DB acceptance claim was not judged');
  }

  const isHosp = r => r.building === 'Hospital' && (r.kind === 'meta' || r.kind === 'patched-meta' || r.kind === 'silent');
  const w = Witness('storey_datum_frame')
    .population(() => rows)
    .schema(RowSchema)
    .invariant('frame-consistent', rs => rs.filter(r => r.mode === 'DECLARED').every(r => r.ladderLo <= r.ezMedian && r.ezMedian <= r.ladderHi))
    .invariant('declared-partitions', rs => rs.filter(r => r.mode === 'DECLARED').every(r => r.bandsUsed >= 2))
    .invariant('hospital-not-collapsed', rs => { const h = rs.filter(isHosp); return h.length >= 1 && h.every(r =>
      r.mode === 'DECLARED' && r.source === 'center_z' && r.bandsUsed >= 7 &&
      r.candidates.some(c => c.source === 'elevation' && c.verdict === 'OUT_OF_FRAME') &&
      r.legacySource === 'elevation' && r.legacyRungsUsed === 1 && r.changedFrom1551 === true); })
    .invariant('fleet-noop-vs-1551', rs => { const f = rs.filter(r => r.building !== 'Hospital'); return f.length >= 1 && f.every(r => r.changedFrom1551 === false); })
    .invariant('log-matches-verb', rs => rs.every(r => r.logMode === r.mode && r.logSource === (r.source || 'none') && r.logBandsUsed === r.bandsUsed &&
      r.logVs1551 === (r.changedFrom1551 ? 'CHANGED(' + r.legacySource + '→' + (r.source || 'INFERRED') + ')' : 'same')))
    .invariant('extracted-is-vacuous', rs => { const x = rs.filter(r => r.building === 'Hospital' && r.kind === 'extracted'); return x.length === 1 && x[0].mode === 'INFERRED' && x[0].reason === 'NO_DECLARED_STOREYS'; })
    .redControl(rs => rs.map(r => {
      const c = Object.assign({}, r, { candidates: r.candidates.map(x => Object.assign({}, x)) });
      if (c.mode === 'DECLARED') { c.ladderLo = c.ezMedian + 1000; c.ladderHi = c.ezMedian + 1001; }   // trips frame-consistent
      if (isHosp(c)) { c.source = 'elevation'; c.bandsUsed = 1; c.changedFrom1551 = false; }        // #1551's collapse, trips hospital-not-collapsed
      if (c.building !== 'Hospital') c.changedFrom1551 = true;                                      // trips fleet-noop-vs-1551
      return c;
    }));
  if (meta && silent) w.invariant('silent-matches-meta', rs => { const m = rs.find(r => r.building === 'Hospital' && r.kind === 'meta'), s = rs.find(r => r.kind === 'silent');
    return !!m && !!s && m.mode === s.mode && m.source === s.source && m.ladderNames.every(n => s.ladderNames.indexOf(n) >= 0); });
  const res = w.run();
  console.log('§WITNESS_STOREY_DATUM_FRAME_VERDICT ' + (res.fail ? 'FAIL' : 'PASS') + ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail +
    (hasSilent ? '' : ' INCONCLUSIVE=silent-matches-meta(' + SILENT_DB + ' missing)'));
})().catch(e => { console.error('§WITNESS_STOREY_DATUM_FRAME_ERROR ' + (e && e.stack || e)); process.exit(2); });
