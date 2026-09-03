#!/usr/bin/env node
// cache_4d_run.js — RUN THE PIPELINE ONCE PER BUILDING, PERSIST IT, READ IT FOREVER AFTER.
//
// ⚠ DO NOT REMOVE — SCOPE. USER, 2026-08-26: "Cant u get that to persist instead of endless
// running?" Terminal (48k elements) and Hospital (63k) take minutes through materializeZones, and
// every probe/analysis was paying that cost again from scratch. This runs the SHIPPED pipeline
// once, with its §-logging ON (never suppressed — USER, same session: "Why dont u refer WITNESS
// debug logging?"), and persists two artifacts every downstream reader can consume:
//
//   witness.log — the FULL §-tagged log the shipped pipeline emitted. This is the primary
//                 evidence, per the project Log Mandate. Read it; do not re-derive what it says.
//   run.json    — elements (guid, cls, seq, phase, storey, name, bbox) + BOTH schedule layers,
//                 each NAMED (see §CACHE_PLAYED_LAYER below), exactly as the run produced them.
//
// ══ §CACHE_PLAYED_LAYER (2026-09-02, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2
//    §CACHE_PLAYED_LAYER, queue item A-9) — TWO LAYERS, BOTH NAMED, NEITHER ANONYMOUS ═══════════
// This file used to persist exactly ONE schedule under the neutral key `sched`: materializeZones'
// `displaySchedule`. §TM_REVEAL_SHIPPED then measured that viewer/time_machine.js has ZERO readers
// of that map — the movie and the scrubber play kernel_ops timestamps written by injectGantt. So
// every judge reading this cache (witness_day0_integrity, probe_tpl_reveal_spread,
// probe_tpl_parallel_reveal, probe_tpl_calibration_scope, probe_stair_flight_support_pool) was
// judging a map nobody plays, and NONE of them printed which map that was. The anonymity is the
// defect: a judge that cannot name its own input cannot report being pointed at the wrong one
// (PRIMAL LAW clause 4). Both layers are persisted now and `layerOf()` makes every reader say so.
//
//   play    — the instants kernel_ops carries = what the film and the Time Machine scrubber
//             reveal each element at. Produced by the injectGantt mirror in
//             scripts/lib/tm_played_layer.js (the live time_machine.js functions, sliced).
//   sched   — materializeZones' displaySchedule (remapSolveToTasks). KEPT under its original key
//             so no existing reader breaks, and aliased `display`. NOT read by time_machine.js.
//
// ⚠ A SECOND divergence fixed here at the same time: this file called materializeZones WITHOUT
// `opts.displayRemap`, and that hook (schedule_author.js:728-736) is what sets display_authored=1
// and what swaps the raw solve for the CPM display timeline BEFORE task windows are authored.
// Measured on the pre-fix Hospital cache: no §ZONE_DISPLAY_AUTHORING, no §CELL_GATE, no §CPM_DISPLAY
// in 29 log lines — the cached run was a third configuration the browser never runs. The hook is
// wired in below; `schedules.display_authored` is READ from the DB, never assumed.
//
// CACHE KEY = building db (size+mtime) + the CONTENT of every input that can change the answer
// (the viewer modules, rates.js, 4D_template.json, and — since the played layer depends on them —
// time_machine.js, gantt_model.js and the three §S50 CELL-gate modules). Change any of them and
// the key changes, so a stale cache is impossible — which matters here: this lane already lost
// hours to two measurements that silently disagreed because they ran against different viewer
// checkouts (4D_MODEL_INTEGRITY.md §H.4).
//
// ══ §CACHE_DB_KIND (2026-09-04, bim-compiler prompts/4D_MODEL_INTEGRITY.md §M.0 item 2 / §M.5 item 3)
//    JUDGE THE DB THE VIEWER LOADS ═══════════════════════════════════════════════════════════════
// This file resolved `<bld>_extracted.db` by construction. The viewer loads the SPLIT PAIR
// (`_meta.db` + `_geo.db`) whenever BOTH halves exist — viewer/streaming.js §DB_SPLIT_DETECT /
// §SPLIT_PAIR_REQUIRED — so for Hospital the persisted run was the 20-label INFERRED grid (its
// _extracted.db has no spatial_structure), NOT the post-#1641 7-band / 36-task / 334 d grid the
// viewer plays. That is project_split_db_live_vs_probe_landmine inside clause 5's own instrument:
// a whole class of "probe-green" claims judged a model nobody plays.
//   resolveDbFile(bld) mirrors the viewer's rule: META when the pair exists AND the meta file is a
//   readable SQLite file (buildings/Duplex_meta.db is a 0-byte trap that crashed the probe, §M.0
//   item 3); otherwise EXTRACTED — and it SAYS WHY (`reason`, `skipped`). DB_KIND=meta|extracted
//   forces one side, so the extracted run stays reachable for comparison. The cache dir carries
//   the kind (`<codeKey>_<dbKey>_<kind>`), run.json carries dbFile + dbKind, and §CACHE_DB /
//   §CACHE_BUILT print them — a stale comparison between the two is impossible to make silently.
//   scripts/probe_tm_reveal_shipped.js calls THIS resolver (one owner, no second copy).
//   The mirror (scripts/lib/tm_played_layer.js) is part of the code key too: it produces the
//   played layer, so a change to it changes what is persisted.
// Witness: viewer/tests/witness_cache_db_kind.js (W-CDK).
//
// Usage:  node scripts/cache_4d_run.js Terminal Hospital        (build if missing)
//         node scripts/cache_4d_run.js --force Terminal         (rebuild)
//         node scripts/cache_4d_run.js --list                   (what is cached)
//         DB_KIND=extracted node scripts/cache_4d_run.js Hospital   (force the whole-db run)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), crypto = require('crypto');
const HOME = os.homedir();
const V = path.join(__dirname, '..', 'viewer');
const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const ROOT = process.env.CACHE_4D_DIR || path.join(HOME, '.cache', 'bim4d');
const TMP = require(path.join(__dirname, 'lib', 'tm_played_layer.js'));

const INPUTS = ['schedule_gate.js', 'schedule_author.js', 'support_sweep.js', 'cpm_schedule.js',
                'rates.js', 'rates/4D_template.json',
                // §CACHE_PLAYED_LAYER: the played layer is produced by these — a change to any of
                // them changes what the movie reveals, so it must change the cache key too.
                'time_machine.js', 'gantt_model.js', 'location_axis.js',
                'lib/room_walker.js', 'lib/level_deriver.js'];

// ── LAYERS — self-describing, so a judge can print what it judged without knowing this file ──────
const LAYERS = {
  played: { key: 'play',
    desc: 'PLAYED — kernel_ops timestamps written by injectGantt (_tmTilePlayWithinTasks -> ' +
          '_tmRescaleToTaskWindow). THIS is what the film and the Time Machine scrubber reveal.' },
  display: { key: 'sched',
    desc: 'DISPLAY(unplayed) — materializeZones displaySchedule (remapSolveToTasks). ' +
          'viewer/time_machine.js has ZERO readers of it (§TM_REVEAL_SHIPPED, 2026-09-02).' },
};

// layerOf(run, id) — the ONE accessor every cache reader selects through. Throws on an unknown id
// (W-CLA-5: no silent default), and reports MISSING rather than substituting the other layer when a
// cache predates §CACHE_PLAYED_LAYER.
function layerOf(run, id) {
  const want = id || process.env.LAYER || 'played';
  const L = LAYERS[want];
  if (!L) throw new Error('§CACHE_LAYER_UNKNOWN "' + want + '" — known layers: ' + Object.keys(LAYERS).join(', '));
  const map = run ? run[L.key] : null;
  if (!map) return { id: want, key: L.key, map: null, desc: L.desc, missing: true };
  return { id: want, key: L.key, map: map, desc: L.desc, missing: false };
}

// §CACHE_DB_KIND: the played-layer mirror is an input — it produces the `play` map this file persists.
const MIRROR_INPUTS = ['lib/tm_played_layer.js'];
function codeKey() {
  const h = crypto.createHash('sha1');
  for (const f of INPUTS) h.update(f).update(fs.readFileSync(path.join(V, f)));
  for (const f of MIRROR_INPUTS) h.update('scripts/' + f).update(fs.readFileSync(path.join(__dirname, f)));
  return h.digest('hex').slice(0, 12);
}
function dbKey(file) {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(st.size + ':' + st.mtimeMs).digest('hex').slice(0, 12);
}

// sqliteProblem(file) — null when the file is a readable SQLite database, else WHY it is not. A
// 0-byte file, an LFS pointer, a directory and a missing file are four different facts; the resolver
// reports the one it saw rather than "exists".
function sqliteProblem(f) {
  let st;
  try { st = fs.statSync(f); } catch (e) { return 'missing'; }
  if (!st.isFile()) return 'not a file';
  if (st.size === 0) return '0 bytes';
  try {
    const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(16);
    const n = fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
    const hdr = b.toString('latin1', 0, 15);
    if (n < 16 || hdr !== 'SQLite format 3')
      return 'not a SQLite file (header "' + hdr.replace(/[^\x20-\x7e]/g, '?') + '")';
  } catch (e) { return 'unreadable (' + (e.code || e.message) + ')'; }
  return null;
}

// resolveDbFile(bld, want, bldDir) — WHICH DB THE VIEWER LOADS, with the reason. `want` is
// 'auto' (default; env DB_KIND overrides) | 'meta' | 'extracted'. Returns
//   { path, kind: 'meta'|'extracted', reason, skipped: [..] }   or   { path: null, kind: null, reason }.
const DB_KINDS = ['auto', 'meta', 'extracted'];
function resolveDbFile(bld, want, bldDir) {
  const dir = bldDir || BLD;
  want = want || process.env.DB_KIND || 'auto';
  if (DB_KINDS.indexOf(want) < 0) throw new Error('§CACHE_DB_KIND_UNKNOWN "' + want + '" — known: ' + DB_KINDS.join(' | '));
  const meta = path.join(dir, bld + '_meta.db'), geo = path.join(dir, bld + '_geo.db'), ext = path.join(dir, bld + '_extracted.db');
  const mp = sqliteProblem(meta), gp = sqliteProblem(geo), ep = sqliteProblem(ext);
  const skipped = [];
  if (want === 'extracted') {
    return ep ? { path: null, kind: null, reason: 'DB_KIND=extracted but ' + path.basename(ext) + ' ' + ep, skipped }
              : { path: ext, kind: 'extracted', reason: 'DB_KIND=extracted (forced)', skipped };
  }
  if (want === 'meta') {
    return mp ? { path: null, kind: null, reason: 'DB_KIND=meta but ' + path.basename(meta) + ' ' + mp, skipped }
              : { path: meta, kind: 'meta', reason: 'DB_KIND=meta (forced' +
                  (gp ? '; ' + path.basename(geo) + ' ' + gp + ' — the viewer would NOT take split mode here' : '') + ')', skipped };
  }
  // auto — the viewer's rule: split mode iff BOTH halves are there (§SPLIT_PAIR_REQUIRED).
  if (!mp && !gp) {
    return { path: meta, kind: 'meta', skipped,
      reason: 'split pair present (' + path.basename(meta) + ' + ' + path.basename(geo) + ') — what streaming.js §DB_SPLIT_DETECT loads' };
  }
  if (!mp && gp) skipped.push(path.basename(meta) + ' usable but ' + path.basename(geo) + ' ' + gp + ' (§SPLIT_PAIR_REQUIRED: both halves or neither)');
  if (mp && mp !== 'missing') skipped.push(path.basename(meta) + ' ' + mp + ' — skipped, not loaded');
  if (ep) return { path: null, kind: null, skipped,
    reason: 'no usable db: ' + path.basename(ext) + ' ' + ep + (skipped.length ? '; ' + skipped.join('; ') : '') };
  return { path: ext, kind: 'extracted', skipped,
    reason: (skipped.length ? skipped.join('; ') + ' -> ' : 'no split pair -> ') + path.basename(ext) };
}

// dirFor(bld, want) — the cache dir for the db the viewer loads (or the forced kind). Null when no
// usable db exists. The KIND is in the name so two runs of one building cannot be confused.
function dirFor(bld, want) {
  const r = resolveDbFile(bld, want);
  if (!r.path) return null;
  return path.join(ROOT, bld, codeKey() + '_' + dbKey(r.path) + '_' + r.kind);
}

// read(bld) — what every downstream probe should call. Returns {els, play, sched, tasks, log, dir}
// or null. SELECT A LAYER WITH layerOf(run) — never reach for `.sched` directly; that key is the
// unplayed map and reading it unnamed is the defect §CACHE_PLAYED_LAYER removed.
function read(bld, want) {
  const d = dirFor(bld, want);
  if (!d || !fs.existsSync(path.join(d, 'run.json'))) return null;
  const j = JSON.parse(fs.readFileSync(path.join(d, 'run.json'), 'utf8'));
  return { els: j.els, play: j.play || null, sched: j.sched, display: j.sched,
    playStats: j.playStats || null, storeys: j.storeys || null, tasks: j.tasks || null,
    dbFile: j.dbFile || null, dbKind: j.dbKind || null, builtAt: j.builtAt || null,
    log: fs.readFileSync(path.join(d, 'witness.log'), 'utf8'), dir: d };
}

function build(bld, force, want) {
  // §CACHE_DB_KIND — resolve the db the viewer loads, and say which one and why, BEFORE anything runs.
  const dbf = resolveDbFile(bld, want);
  if (!dbf.path) { console.log('§CACHE_SKIP ' + bld + ' — ' + dbf.reason); return null; }
  console.log('§CACHE_DB ' + bld + ' kind=' + dbf.kind + ' file=' + path.basename(dbf.path) + ' reason=' + dbf.reason);
  const d = dirFor(bld, want);
  if (!force && fs.existsSync(path.join(d, 'run.json'))) { console.log('§CACHE_HIT ' + bld + ' kind=' + dbf.kind + ' ' + d); return read(bld, want); }
  const file = dbf.path;

  // Modules are loaded FRESH per build so one process building several buildings cannot carry
  // module-level state from one into the next.
  for (const k of Object.keys(require.cache)) if (k.startsWith(V)) delete require.cache[k];
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
  const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
  const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
  // §S50: the CELL gate resolves these on globalThis exactly like a browser window would. Without
  // them the run silently takes the GRAPH path — a configuration the browser does not run.
  globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
  globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
  globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
  const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
  const tmSrc = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);

  const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
  return initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) })
    .then(SQL => {
      const lines = [];
      const _l = console.log, _w = console.warn;
      // TEE, not suppress: the §-log is the evidence, so it goes to the file AND to the terminal.
      console.log = function () { const s = Array.prototype.join.call(arguments, ' '); lines.push(s); _l(s); };
      console.warn = function () { const s = Array.prototype.join.call(arguments, ' '); lines.push(s); _w(s); };
      let els = null, sched = null, play = null, playStats = null, storeys = null, tasks = null, err = null;
      try {
        const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
        // §CACHE_PLAYED_LAYER — the live time_machine.js functions, sliced (never re-typed).
        const tmsb = TMP.buildSandbox({ tmSrc: tmSrc, SA: SA, SG: SG, CP: CP, GM: GM, SS: SS,
          LABOR_RATES: sb.LABOR_RATES, console: console });
        const base = { start: '2026-01-01', laborRates: sb.LABOR_RATES, rates: sb.RATES,
          nameOverrides: sb.SEQUENCE_NAME_OVERRIDES, defaultRule: sb.SEQUENCE_DEFAULT,
          scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db,
          // §ZONE_DISPLAY_AUTHORING — the hook every real UI call site passes. Without it this run
          // authors windows from the RAW solve and never runs the CPM display pass, i.e. it is not
          // the configuration the browser runs (§CACHE_PLAYED_LAYER header).
          displayRemap: tmsb._tmDisplayRemap };
        const rawEls = SA._buildScheduleElements(db, sb.SEQUENCE_RULES, base);
        els = rawEls.map(e => ({
          guid: e.guid, cls: e.cls, seq: e.seq, phase: e.phase, storey: e.storey, name: e.name || '',
          resource: e.resource, installSecs: e.installSecs,
          x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, bz: e.base_z, tz: e.top_z }));
        globalThis.APP = { db: db };          // §S50 CELL gate reads the db through APP, as the viewer does
        const res = SA.materializeZones(db, sb.SEQUENCE_RULES, base);
        sched = res && res.displaySchedule;
        // task grid (id, window, member guids) — needed to compute reveal-time-within-task-window,
        // 4D_GANTT_TM_REFACTOR.md §FUTURE item 2. Not derivable from els/sched alone: the task_id a
        // guid belongs to only exists on `res.tasks` (in-memory here, never written back to the db).
        if (res && res.tasks) tasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays,
          phase: t.phase, storey: t.storey, guids: t.guids }));
        // ── THE PLAYED LAYER — injectGantt's write path, mirrored (scripts/lib/tm_played_layer.js).
        // These are the instants kernel_ops carries, i.e. what the film and the scrubber reveal.
        if (res && res.tasks) {
          const mp = TMP.mirrorInjectGantt({ sb: tmsb, elements: rawEls, tasks: tasks, db: db,
            startISO: base.start, applyTiling: true, log: console.log });
          if (mp.ok) { play = mp.play; playStats = mp.stats; }
          else console.log('§CACHE_PLAY_FAIL ' + bld + ' ' + mp.reason + ' — the played layer is NOT persisted for this run');
        }
        delete globalThis.APP;
        // The IFC's OWN declared spatial structure, persisted alongside the run so a witness can
        // compare "storeys the model declares" against "bands the schedule invents" without a
        // tolerance constant anywhere. Absent on some shipped DBs (Duplex/Hospital have no
        // spatial_structure table at all) — absent must be REPORTED as absent, never guessed.
        //
        // ⚠ §STOREY_PROVENANCE (2026-09-02, queue B-1 / bim-compiler 4D_MODEL_INTEGRITY.md §J.6.2
        // W3). `object_type` is persisted with the row because these are NOT always what a reader
        // assumes. MEASURED on the shipped fleet: 6 of 6 Terminal and 3 of 3 HHS IfcBuildingStorey
        // rows carry object_type='COMPILED' with STC_* guids — they are compile_rooms.py output,
        // not an IFC declaration. A claim that compares "bands the schedule uses" against these and
        // calls the difference "levels the schedule invented" is comparing against a derived
        // artifact. It cannot say so unless the provenance travels with the row, so it does.
        //
        // ⚠ §STOREY_DATUM shape tolerance (PR #1551, merged forward 2026-09-02). TWO COLUMN SHAPES
        // exist in the fleet and BOTH carry the same fact: `elevation` (the extractor writes it now,
        // and buildings/patches/*.sql backfills it) or `center_z` (older shipped DBs, where the
        // storey row is a placement point with size_z 0/NULL). A fixed column list asked for one
        // shape and THREW on the other, reporting declaredStoreys=ABSENT on the very run where
        // §STOREY_DATUM said mode=DECLARED — two log lines from one run contradicting each other.
        // So the columns are read BY NAME off the result set instead of being named in the SELECT:
        // every shape resolves, and a missing column is a null field, never a throw.
        // ⚠ THE ROW SET IS DELIBERATELY UNFILTERED, exactly as before. #1551's draft filtered
        // `WHERE elevation IS NOT NULL`, which would silently drop the 3 COMPILED rows from a
        // patched Duplex and change C1's `declaredStoreys` count — i.e. move a verdict. Provenance
        // and datum are ADDED to each row; which rows exist is unchanged.
        try {
          const q = db.exec("SELECT * FROM spatial_structure WHERE type='IfcBuildingStorey'");
          if (q.length) {
            const c = q[0].columns, at = (v, n) => { const i = c.indexOf(n); return i >= 0 ? v[i] : null; };
            storeys = q[0].values.map(v => {
              const ele = at(v, 'elevation'), cz = at(v, 'center_z');
              return { name: at(v, 'name'), center_z: cz, size_z: at(v, 'size_z'),
                object_type: at(v, 'object_type'),
                elevation: ele,
                // the datum this row asserts, and which column asserted it — never invented: null
                // when the row carries neither, so a reader can tell "no datum" from "datum 0".
                datum: ele != null ? ele : cz,
                source: ele != null ? 'elevation' : (cz != null ? 'center_z' : null) };
            });
          }
        } catch (e) { storeys = null; }   // no table at all — reported, not invented
        db.close();
      } catch (e) { err = e; }
      console.log = _l; console.warn = _w;
      if (err || !sched) { console.log('§CACHE_FAIL ' + bld + ' ' + (err ? err.message : 'no displaySchedule')); return null; }
      const flat = {};
      for (const g in sched) flat[g] = { s: sched[g].start, e: sched[g].end };
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'witness.log'), lines.join('\n') + '\n');
      fs.writeFileSync(path.join(d, 'run.json'), JSON.stringify({ bld: bld, builtAt: new Date().toISOString(),
        codeKey: codeKey(), dbFile: path.basename(file), dbKind: dbf.kind, dbReason: dbf.reason, els: els,
        sched: flat, play: play, playStats: playStats, storeys: storeys, tasks: tasks }));
      console.log('§CACHE_BUILT ' + bld + ' dbFile=' + path.basename(file) + ' kind=' + dbf.kind +
        ' n=' + els.length + ' scheduled=' + Object.keys(flat).length +
        ' logLines=' + lines.length + ' declaredStoreys=' + (storeys ? storeys.length : 'ABSENT') + ' -> ' + d);
      // §CACHE_LAYERS — the cache says, in its own log, which maps it carries and which one plays.
      console.log('§CACHE_LAYERS ' + bld +
        ' played=' + (play ? Object.keys(play).length : 'MISSING') +
        ' display=' + Object.keys(flat).length +
        (playStats ? ' tiled=' + playStats.tiled + '/' + playStats.total +
          ' clamped=' + playStats.clamped + ' uncovered=' + playStats.uncovered +
          ' display_authored=' + playStats.displayAuthored : '') +
        ' — "played" is what the film/scrubber reveal (kernel_ops); "display" is remapSolveToTasks, ' +
        'which viewer/time_machine.js does not read. Select with CACHE.layerOf(run).');
      return read(bld, want);
    });
}

module.exports = { read: read, build: build, dirFor: dirFor, codeKey: codeKey,
  layerOf: layerOf, LAYERS: LAYERS,
  resolveDbFile: resolveDbFile, sqliteProblem: sqliteProblem, DB_KINDS: DB_KINDS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  if (args.includes('--list')) {
    if (!fs.existsSync(ROOT)) { console.log('§CACHE_LIST empty (' + ROOT + ')'); process.exit(0); }
    for (const b of fs.readdirSync(ROOT)) for (const k of fs.readdirSync(path.join(ROOT, b))) {
      const rj = path.join(ROOT, b, k, 'run.json');
      if (!fs.existsSync(rj)) continue;
      const st = fs.statSync(rj);
      const kind = (k.match(/_(meta|extracted)$/) || [])[1] || 'extracted(legacy, unnamed)';
      console.log('§CACHE_LIST ' + b.padEnd(24) + ' ' + k.padEnd(36) + ' kind=' + kind.padEnd(26) + (st.size / 1048576).toFixed(1) + 'MB  ' +
        st.mtime.toISOString() + (k.startsWith(codeKey()) ? '  <- CURRENT code' : '  (stale code)'));
    }
    process.exit(0);
  }
  const list = args.filter(a => a[0] !== '-');
  (async () => { for (const b of (list.length ? list : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'])) await build(b, force); })()
    .catch(e => { console.error('§CACHE_ERROR ' + (e && e.stack || e)); process.exit(2); });
}
