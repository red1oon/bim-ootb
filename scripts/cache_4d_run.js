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
//   run.json    — elements (guid, cls, seq, phase, storey, name, bbox) + displaySchedule
//                 (guid -> {s,e}) exactly as the run produced them.
//
// CACHE KEY = building db (size+mtime) + the CONTENT of every input that can change the answer
// (the five viewer modules, rates.js, 4D_template.json). Change any of them and the key changes,
// so a stale cache is impossible — which matters here: this lane already lost hours to two
// measurements that silently disagreed because they ran against different viewer checkouts
// (4D_MODEL_INTEGRITY.md §H.4).
//
// Usage:  node scripts/cache_4d_run.js Terminal Hospital        (build if missing)
//         node scripts/cache_4d_run.js --force Terminal         (rebuild)
//         node scripts/cache_4d_run.js --list                   (what is cached)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), crypto = require('crypto');
const HOME = os.homedir();
const V = path.join(__dirname, '..', 'viewer');
const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const ROOT = process.env.CACHE_4D_DIR || path.join(HOME, '.cache', 'bim4d');

const INPUTS = ['schedule_gate.js', 'schedule_author.js', 'support_sweep.js', 'cpm_schedule.js',
                'rates.js', 'rates/4D_template.json'];

function codeKey() {
  const h = crypto.createHash('sha1');
  for (const f of INPUTS) h.update(f).update(fs.readFileSync(path.join(V, f)));
  return h.digest('hex').slice(0, 12);
}
function dbKey(file) {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(st.size + ':' + st.mtimeMs).digest('hex').slice(0, 12);
}
function dirFor(bld) { return path.join(ROOT, bld, codeKey() + '_' + dbKey(path.join(BLD, bld + '_extracted.db'))); }

// read(bld) — what every downstream probe should call. Returns {els, sched, tasks, log, dir} or null.
function read(bld) {
  const d = dirFor(bld);
  if (!fs.existsSync(path.join(d, 'run.json'))) return null;
  const j = JSON.parse(fs.readFileSync(path.join(d, 'run.json'), 'utf8'));
  return { els: j.els, sched: j.sched, storeys: j.storeys || null, tasks: j.tasks || null, log: fs.readFileSync(path.join(d, 'witness.log'), 'utf8'), dir: d };
}

function build(bld, force) {
  const d = dirFor(bld);
  if (!force && fs.existsSync(path.join(d, 'run.json'))) { console.log('§CACHE_HIT ' + bld + ' ' + d); return read(bld); }
  const file = path.join(BLD, bld + '_extracted.db');
  if (!fs.existsSync(file)) { console.log('§CACHE_SKIP ' + bld + ' — no db'); return null; }

  // Modules are loaded FRESH per build so one process building several buildings cannot carry
  // module-level state from one into the next.
  for (const k of Object.keys(require.cache)) if (k.startsWith(V)) delete require.cache[k];
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
  const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
  const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
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
      let els = null, sched = null, storeys = null, tasks = null, err = null;
      try {
        const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
        const base = { start: '2026-01-01', laborRates: sb.LABOR_RATES, rates: sb.RATES,
          nameOverrides: sb.SEQUENCE_NAME_OVERRIDES, defaultRule: sb.SEQUENCE_DEFAULT,
          scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db };
        els = SA._buildScheduleElements(db, sb.SEQUENCE_RULES, base).map(e => ({
          guid: e.guid, cls: e.cls, seq: e.seq, phase: e.phase, storey: e.storey, name: e.name || '',
          resource: e.resource, installSecs: e.installSecs,
          x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, bz: e.base_z, tz: e.top_z }));
        const res = SA.materializeZones(db, sb.SEQUENCE_RULES, base);
        sched = res && res.displaySchedule;
        // task grid (id, window, member guids) — needed to compute reveal-time-within-task-window,
        // 4D_GANTT_TM_REFACTOR.md §FUTURE item 2. Not derivable from els/sched alone: the task_id a
        // guid belongs to only exists on `res.tasks` (in-memory here, never written back to the db).
        if (res && res.tasks) tasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays,
          phase: t.phase, storey: t.storey, guids: t.guids }));
        // The IFC's OWN declared spatial structure, persisted alongside the run so a witness can
        // compare "storeys the model declares" against "bands the schedule invents" without a
        // tolerance constant anywhere. Absent on some shipped DBs (Duplex/Hospital have no
        // spatial_structure table at all) — absent must be REPORTED as absent, never guessed.
        try {
          const q = db.exec("SELECT name,center_z,size_z FROM spatial_structure WHERE type='IfcBuildingStorey'");
          if (q.length) {
            const c = q[0].columns, ni = c.indexOf('name'), zi = c.indexOf('center_z'), si = c.indexOf('size_z');
            storeys = q[0].values.map(v => ({ name: v[ni], center_z: v[zi], size_z: v[si] }));
          }
        } catch (e) { storeys = null; }   // no table / no columns — reported, not invented
        db.close();
      } catch (e) { err = e; }
      console.log = _l; console.warn = _w;
      if (err || !sched) { console.log('§CACHE_FAIL ' + bld + ' ' + (err ? err.message : 'no displaySchedule')); return null; }
      const flat = {};
      for (const g in sched) flat[g] = { s: sched[g].start, e: sched[g].end };
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'witness.log'), lines.join('\n') + '\n');
      fs.writeFileSync(path.join(d, 'run.json'), JSON.stringify({ bld: bld, builtAt: new Date().toISOString(),
        codeKey: codeKey(), els: els, sched: flat, storeys: storeys, tasks: tasks }));
      console.log('§CACHE_BUILT ' + bld + ' n=' + els.length + ' scheduled=' + Object.keys(flat).length +
        ' logLines=' + lines.length + ' declaredStoreys=' + (storeys ? storeys.length : 'ABSENT') + ' -> ' + d);
      return read(bld);
    });
}

module.exports = { read: read, build: build, dirFor: dirFor, codeKey: codeKey };

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  if (args.includes('--list')) {
    if (!fs.existsSync(ROOT)) { console.log('§CACHE_LIST empty (' + ROOT + ')'); process.exit(0); }
    for (const b of fs.readdirSync(ROOT)) for (const k of fs.readdirSync(path.join(ROOT, b))) {
      const rj = path.join(ROOT, b, k, 'run.json');
      if (!fs.existsSync(rj)) continue;
      const st = fs.statSync(rj);
      console.log('§CACHE_LIST ' + b.padEnd(24) + ' ' + k + '  ' + (st.size / 1048576).toFixed(1) + 'MB  ' +
        st.mtime.toISOString() + (k.startsWith(codeKey()) ? '  <- CURRENT code' : '  (stale code)'));
    }
    process.exit(0);
  }
  const list = args.filter(a => a[0] !== '-');
  (async () => { for (const b of (list.length ? list : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'])) await build(b, force); })()
    .catch(e => { console.error('§CACHE_ERROR ' + (e && e.stack || e)); process.exit(2); });
}
