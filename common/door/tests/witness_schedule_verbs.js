#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SCHED-VERB / W-SCHED-COMPARE / W-SCHED-RETIRE / W-SCHED-CACHE / W-SCHED-HONEST. READ THE §-LOG after every run.
 * Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §23.5. Real runs (the door spawns viewer/tools/schedule_verbs.js; public buildings Duplex and Hospital only; no GPU, no model call).
 *   SV  (W-SCHED-VERB)    issue: a verb answering from its own second computation. The door's viewer.schedule_at answer equals the persisted run's own values
 *                         (run.json playStats/tasks, witness.log), and an independent count over run.json's played map at the days where the numbers move.
 *   SC  (W-SCHED-COMPARE) issue: a comparison that drifts from the script it replaced. viewer.schedule_compare's §SE_* lines equal what the base script printed on the same building
 *                         (the base is taken from its pinned git revision into a temporary file, never from the working tree).
 *   SR  (W-SCHED-RETIRE)  issue: a deletion that strands a question or a caller. The retired script is gone, its question is answered by a verb call, no live file requires it, and every script kept still exists.
 *   SK  (W-SCHED-CACHE)   issue: re-running a pipeline the cache already holds. Private cache dir; spawns of cache_4d_run.js counted by a NODE_OPTIONS preload, independent of the verb's own report.
 *   SH  (W-SCHED-HONEST)  issue: a vacuous ok. A building with a database and no elements, and an unknown building, never reply ok.
 * Falsifiers (run the whole witness with the env set; it must FAIL):  SCHED_VERB_BREAK=day (the verb answers for day+1)  ·  SCHED_VERB_BREAK=row (one compare row perturbed).
 * Run: node common/door/tests/witness_schedule_verbs.js [--only SV|SC|SR|SK|SH]
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { kit, tmp, ROOT } = require('./_kit');
const D = require('../door.js');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const k = kit('W-SCHED');
const ONLY = (process.argv.indexOf('--only') >= 0 ? process.argv[process.argv.indexOf('--only') + 1] : '');
const want = (id) => !ONLY || ONLY === id;
const BASE_REV = 'cdcec7e8';   // origin/main when the verbs were built: the last commit that still holds scripts/probe_schedule_engine.js
const PUBLIC = ['Duplex', 'Hospital'];
const door = D.createDoor({ journal: tmp('sched_j_'), say: (s) => console.log('§DOOR ' + s) });
const ask = (line) => door.runLine(line, { actor: 'ai' });
const hasDb = (b) => { const r = CACHE.resolveDbFile(b); return !!r.path; };

// an INDEPENDENT count over the cache's played map: written as a different expression from the verb's stateOf (it sorts by the three-way split on the cursor)
function indepCount(play, day) {
  const c = Date.parse(CACHE.PROJECT_START + 'T00:00:00Z') + day * 86400000; let placed = 0, frontier = 0, future = 0;
  for (const g in play) { const s = play[g].s, e = play[g].e; if (s > c) future++; else if (e > c) frontier++; else placed++; }
  return { placed, frontier, future };
}

async function SV() {
  for (const b of PUBLIC) {
    if (!hasDb(b)) { k.incon('SV-' + b, 'no database for ' + b); continue; }
    const first = await ask('viewer.schedule_at building=' + b + ' day=0');   // builds and persists the run when the key has no cache yet (spec: run once, persist)
    const run = CACHE.read(b);
    if (first.status !== 'ok' || !run) { k.chk('SV-' + b + '-0 the verb answered and the persisted run exists', false, 'status=' + first.status + ' why=' + first.why); continue; }
    const play = CACHE.layerOf(run, 'played').map || {}, n = Object.keys(play).length, tasks = run.tasks || [];
    if (!n || !tasks.length) { k.incon('SV-' + b, 'the persisted run holds no played map or no tasks: nothing to judge'); continue; }
    const endDay = tasks.reduce((m, t) => Math.max(m, t.eDays), 0), logTotal = +((/§TM_PLAYED_LAYER total=(\d+)/.exec(run.log) || [])[1]);
    // the days where the numbers move: the first d (from the middle) with placed(d) != placed(d+1), so a one-day shift cannot hide
    let dStar = null; for (let d = Math.floor(endDay / 3); d < endDay + 3; d++) if (indepCount(play, d).placed !== indepCount(play, d + 1).placed) { dStar = d; break; }
    const days = [-1, 0, Math.floor(endDay / 3), Math.floor(endDay / 2), dStar, endDay - 1, endDay, endDay + 5].filter((d, i, a) => d !== null && a.indexOf(d) === i);
    k.L('SV ' + b + ' run=' + path.basename(run.dir) + ' n=' + n + ' tasks=' + tasks.length + ' endDay=' + endDay + ' dStar=' + dStar + ' days=' + days.join(','));
    k.chk('SV-' + b + '-a total = the cache\'s playStats.total = the §TM_PLAYED_LAYER total in its witness.log', first.answer.total === n && n === (run.playStats && run.playStats.total) && n === logTotal, 'verb=' + first.answer.total + ' playMap=' + n + ' playStats=' + (run.playStats && run.playStats.total) + ' log=' + logTotal);
    const logLines = String(run.log).split('\n').filter(l => l.indexOf('§') === 0).map(l => l.slice(0, 600));
    k.chk('SV-' + b + '-b engineLines = the cache\'s witness.log § lines, verbatim (' + logLines.length + ')', JSON.stringify(first.answer.engineLines) === JSON.stringify(logLines), 'verb=' + first.answer.engineLines.length);
    let all = true, sums = true, moved = [];
    for (const d of days) {
      const e = await ask('viewer.schedule_at building=' + b + ' day=' + d), x = indepCount(play, d), a = e.answer || {}, c = a.counts || {};
      const same = e.status === 'ok' && c.placed === x.placed && c.frontier === x.frontier && c.future === x.future;
      if (!same) { all = false; k.L('SV ' + b + ' day=' + d + ' MISMATCH verb=' + JSON.stringify(c) + ' run.json=' + JSON.stringify(x) + ' status=' + e.status); }
      if (same && c.placed + c.frontier + c.future !== a.total) sums = false;
      moved.push(d + ':' + x.placed + '/' + x.frontier + '/' + x.future);
      if (d === -1) k.chk('SV-' + b + '-d before the start (day -1) every element is future', c.future === n && c.placed === 0 && c.frontier === 0, JSON.stringify(c));
      if (d === endDay + 5) k.chk('SV-' + b + '-e past the end (day ' + d + ') every element is placed', c.placed === n && c.frontier === 0 && c.future === 0, JSON.stringify(c));
      // two layers of the cache agreeing: a done task\'s elements are all placed, a pending task\'s none are
      if (e.status === 'ok' && d === dStar) {
        let bad = 0, done = 0, pend = 0;
        for (const t of a.tasks) { if (t.state === 'done') { done++; if (t.placed !== t.elements) bad++; } if (t.state === 'pending') { pend++; if (t.placed !== 0 || t.frontier !== 0) bad++; } }
        k.chk('SV-' + b + '-f at day ' + d + ': every element of a done task (' + done + ') is placed, none of a pending task (' + pend + ') is placed or on the frontier', bad === 0 && done + pend > 0, 'bad=' + bad);
      }
    }
    k.chk('SV-' + b + '-g the verb\'s placed/frontier/future equal an independent count over run.json at every day (' + days.length + ' days) and sum to total', all && sums, 'placed/frontier/future by day: ' + moved.join(' '));
    const t0 = (await ask('viewer.schedule_at building=' + b + ' day=0')).answer.tasks.map(t => t.id + '|' + t.sDays + '|' + t.eDays).join(';');
    k.chk('SV-' + b + '-h the task grid (id, sDays, eDays) = run.tasks', t0 === tasks.map(t => t.id + '|' + t.sDays + '|' + t.eDays).join(';'), tasks.length + ' tasks');
    if (dStar !== null) {
      const e = await ask('viewer.schedule_at building=' + b + ' day=' + dStar), x = indepCount(play, dStar);
      k.chk('SV-' + b + '-i the answer at day ' + dStar + ' equals the cache\'s numbers for day ' + dStar + ' (a one-day shift would give placed ' + indepCount(play, dStar + 1).placed + ', not ' + x.placed + ')', e.answer.counts.placed === x.placed && x.placed !== indepCount(play, dStar + 1).placed, 'verb placed=' + e.answer.counts.placed);
    } else k.incon('SV-' + b + '-i', 'no day at which the placed count moves: the one-day falsifier has nothing to bite on');
  }
}

async function SC() {
  const BASE = path.join(ROOT, 'scripts', '_base_probe_schedule_engine.tmp.js');
  const have = spawnSync('git', ['-C', ROOT, 'cat-file', '-e', BASE_REV + ':scripts/probe_schedule_engine.js']);
  if (have.status !== 0) { k.incon('SC', 'the pinned base revision ' + BASE_REV + ' (scripts/probe_schedule_engine.js) is not in this clone'); return; }
  fs.writeFileSync(BASE, spawnSync('git', ['-C', ROOT, 'show', BASE_REV + ':scripts/probe_schedule_engine.js'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout);
  try {
    for (const b of PUBLIC) {
      if (!hasDb(b) || !fs.existsSync(path.join(process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), b + '_extracted.db'))) { k.incon('SC-' + b, 'no ' + b + '_extracted.db'); continue; }
      const r = spawnSync(process.execPath, [BASE], { env: Object.assign({}, process.env, { ONLY: b + '_extracted' }), encoding: 'utf8', maxBuffer: 1 << 28 });
      const pick = (arr) => arr.filter(l => /^§(SE_DIFF|SE_FLOATING|CPM_ENGINE_REACHABILITY) /.test(l));
      const baseLines = pick(String(r.stdout).split('\n')), v = await ask('viewer.schedule_compare building=' + b), vl = pick((v.answer && v.answer.lines) || []);
      k.L('SC ' + b + ' base(exit ' + r.status + '): ' + baseLines.join(' | ').slice(0, 400));
      k.L('SC ' + b + ' verb(' + v.status + '):  ' + vl.join(' | ').slice(0, 400));
      k.chk('SC-' + b + '-a the base script printed its three rows (' + baseLines.length + ')', baseLines.length === 3, 'n=' + baseLines.length);
      k.chk('SC-' + b + '-b the verb\'s §SE_DIFF / §SE_FLOATING / §CPM_ENGINE_REACHABILITY lines equal the base script\'s, character for character', baseLines.length === 3 && JSON.stringify(vl) === JSON.stringify(baseLines));
      const diff = ((v.answer || {}).rows || []).filter(x => x.row === 'SE_DIFF')[0], bd = /checked=(\d+) mismatches=(\d+) missingInModel=(\d+)/.exec(baseLines[1] || baseLines.join(' '));
      k.chk('SC-' + b + '-c the verb\'s row data equals the numbers the base printed (checked, mismatches, missing)', !!diff && !!bd && diff.checked === +bd[1] && diff.mismatches === +bd[2] && diff.missingInModel === +bd[3] && diff.checked > 0, diff ? JSON.stringify({ checked: diff.checked, mismatches: diff.mismatches, missing: diff.missingInModel }) : 'no SE_DIFF row');
    }
  } finally { try { fs.unlinkSync(BASE); } catch (e) { /* already gone */ } }
}

function SR() {
  const git = (a) => spawnSync('git', ['-C', ROOT].concat(a), { encoding: 'utf8', maxBuffer: 1 << 26 });
  const retired = [{ script: 'scripts/probe_schedule_engine.js', question: 'does ScheduleEngine.compute equal the reference pair, element by element, and is nothing floating', verb: 'viewer.schedule_compare' }];
  const kept = ['scripts/probe_kernel_ops_vs_engine.js', 'scripts/probe_cpm_schedule.js', 'scripts/probe_cpm_display_path.js', 'scripts/probe_e5_resolution.js', 'scripts/cache_4d_run.js', 'viewer/tools/schedule_verbs.js'];
  const vocab = D.loadVocab(), entries = ['viewer.schedule_at', 'viewer.schedule_compare'].map(v => vocab.byVerb.get(v));
  k.chk('SR-a both verbs are in verbs.json, harm read, calling the schedule_verbs CLI, witness file present', entries.every(e => e && e.harm === 'read' && e.calls.cli === 'schedule_verbs' && fs.existsSync(path.join(ROOT, e.witness))), entries.map(e => e && e.verb).join(','));
  for (const r of retired) {
    k.chk('SR-b ' + r.script + ' is gone from the working tree', !fs.existsSync(path.join(ROOT, r.script)));
    k.chk('SR-c ' + r.script + ' existed at the pinned base ' + BASE_REV + ' (so this is a retirement, not a typo)', git(['cat-file', '-e', BASE_REV + ':' + r.script]).status === 0);
    const hits = git(['grep', '-n', path.basename(r.script, '.js'), '--', '.']).stdout.split('\n').filter(Boolean);
    const requires = hits.filter(h => /require\(|spawn|exec(File|Sync)?\(|node\s+\S*probe_schedule_engine|\.sh:|["']scripts\/probe_schedule_engine/.test(h) && !/^common\/door\/tests\/witness_schedule_verbs\.js/.test(h));
    k.L('SR ' + r.script + ' mentions=' + hits.length + ' requiring=' + requires.length + (hits.length ? ' [' + hits.map(h => h.split(':').slice(0, 2).join(':')).join(' ') + ']' : ''));
    k.chk('SR-d no live file requires, spawns or lists ' + r.script + ' (mentions in comments are not callers)', requires.length === 0, requires.join(' | ').slice(0, 300));
    const entry = vocab.byVerb.get(r.verb);
    k.chk('SR-e its former question is answered by ' + r.verb + ': the entry returns the rows the script printed (SE_DIFF checked/mismatches/missingInModel/maxDeltaMs, SE_FLOATING midair/structural/orphans)', !!entry && /SE_DIFF/.test(entry.returns.shape) && /maxDeltaMs/.test(entry.returns.shape) && /midair/.test(entry.returns.shape) && /structural/.test(entry.returns.shape) && /orphans/.test(entry.returns.shape));
  }
  kept.forEach(f => k.chk('SR-f kept script still exists: ' + f, fs.existsSync(path.join(ROOT, f))));
}

async function SK() {
  const b = 'Duplex', src = path.join(process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), b + '_extracted.db');
  if (!fs.existsSync(src) || !hasDb(b)) { k.incon('SK', 'no ' + b + '_extracted.db'); return; }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_cache_')), cdir = path.join(work, 'cache'), log = path.join(work, 'spawns.log'), pre = path.join(work, 'count.js');
  fs.writeFileSync(log, ''); fs.writeFileSync(pre, "if (/cache_4d_run\\.js$/.test(process.argv[1] || '')) require('fs').appendFileSync(process.env.SCHED_SPAWN_LOG, process.pid + ' ' + process.argv.slice(2).join(' ') + '\\n');\n");
  const bdir = path.join(work, 'bld'); fs.mkdirSync(bdir); fs.copyFileSync(src, path.join(bdir, b + '_extracted.db'));
  const saved = {}; ['CACHE_4D_DIR', 'BLD_DIR', 'SCHED_SPAWN_LOG', 'NODE_OPTIONS'].forEach(e => { saved[e] = process.env[e]; });
  Object.assign(process.env, { CACHE_4D_DIR: cdir, BLD_DIR: bdir, SCHED_SPAWN_LOG: log, NODE_OPTIONS: ((saved.NODE_OPTIONS || '') + ' --require ' + pre).trim() });
  const spawns = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
  try {
    const a1 = await ask('viewer.schedule_at building=' + b + ' day=5'), n1 = spawns();
    const a2 = await ask('viewer.schedule_at building=' + b + ' day=5'), n2 = spawns();
    const a3 = await ask('viewer.schedule_at building=' + b + ' day=6'), n3 = spawns();
    k.L('SK first: cache=' + (a1.answer && a1.answer.cache && a1.answer.cache.status) + ' preload-spawns=' + n1 + ' | second: cache=' + (a2.answer && a2.answer.cache && a2.answer.cache.status) + ' spawns=' + n2 + ' | third (another day): spawns=' + n3);
    k.chk('SK-a the first call with an empty private cache builds once: the verb says BUILT spawned=1, the preload saw one cache_4d_run.js', a1.status === 'ok' && a1.answer.cache.status === 'BUILT' && a1.answer.cache.spawned === 1 && n1 === 1, 'spawns=' + n1);
    k.chk('SK-b a second call with the same key spawns nothing (HIT, preload still 1) and returns the same counts and the same run', a2.status === 'ok' && a2.answer.cache.status === 'HIT' && n2 === 1 && JSON.stringify(a2.answer.counts) === JSON.stringify(a1.answer.counts) && a2.answer.cache.builtAt === a1.answer.cache.builtAt && a2.answer.cache.dir === a1.answer.cache.dir, 'spawns=' + n2);
    k.chk('SK-c a different day on the same key also spawns nothing', a3.status === 'ok' && a3.answer.cache.status === 'HIT' && n3 === 1, 'spawns=' + n3);
    // change the key: the building database gets a new mtime (the cache key is size + mtime of the DB and the content of the schedule code)
    const f = path.join(bdir, b + '_extracted.db'), t = new Date(Date.now() + 3600e3); fs.utimesSync(f, t, t);
    const a4 = await ask('viewer.schedule_at building=' + b + ' day=5'), n4 = spawns();
    k.chk('SK-d a changed key (the DB\'s mtime) runs the pipeline once more: BUILT, preload 2, a new cache directory, same counts (same data)', a4.status === 'ok' && a4.answer.cache.status === 'BUILT' && n4 === 2 && a4.answer.cache.dir !== a1.answer.cache.dir && JSON.stringify(a4.answer.counts) === JSON.stringify(a1.answer.counts), 'spawns=' + n4);
    const a5 = await ask('viewer.schedule_at building=' + b + ' day=5'), n5 = spawns();
    k.chk('SK-e and that new key is then a HIT (still 2 spawns)', a5.status === 'ok' && a5.answer.cache.status === 'HIT' && n5 === 2, 'spawns=' + n5);
  } finally { Object.keys(saved).forEach(e => { if (saved[e] === undefined) delete process.env[e]; else process.env[e] = saved[e]; }); fs.rmSync(work, { recursive: true, force: true }); }
}

async function SH() {
  const b = 'Duplex', src = path.join(process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), b + '_extracted.db');
  if (!fs.existsSync(src)) { k.incon('SH', 'no ' + b + '_extracted.db'); return; }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_empty_')), bdir = path.join(work, 'bld'); fs.mkdirSync(bdir);
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(src)); db.run('DELETE FROM elements_meta'); const left = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  fs.writeFileSync(path.join(bdir, 'Emptied_extracted.db'), Buffer.from(db.export())); db.close();
  const saved = {}; ['CACHE_4D_DIR', 'BLD_DIR'].forEach(e => { saved[e] = process.env[e]; });
  Object.assign(process.env, { CACHE_4D_DIR: path.join(work, 'cache'), BLD_DIR: bdir });
  try {
    k.L('SH fixture: Duplex with elements_meta emptied (rows left ' + left + ')');
    const at = await ask('viewer.schedule_at building=Emptied day=3'), cmp = await ask('viewer.schedule_compare building=Emptied'), unk = await ask('viewer.schedule_at building=NoSuchBuilding day=3');
    k.chk('SH-a a database with no elements: schedule_at is inconclusive (never ok, never "0 placed")', at.status === 'inconclusive' && /no schedule/.test(String(at.why)), 'status=' + at.status + ' why=' + String(at.why).slice(0, 140));
    k.chk('SH-b the same database: schedule_compare is inconclusive (the base script printed FAIL error=no elements; neither a pass nor a fail is a judgment of nothing)', cmp.status === 'inconclusive' && /nothing judged/.test(String(cmp.why)), 'status=' + cmp.status + ' why=' + String(cmp.why).slice(0, 140));
    k.chk('SH-c an unknown building is an error, not an answer', unk.status === 'error' && /unknown building/.test(String(unk.why)), 'status=' + unk.status);
    const SV = require(path.join(ROOT, 'viewer', 'tools', 'schedule_verbs.js')), e1 = SV.stateAt({ play: {}, els: [], tasks: [] }, 3, 0), e2 = SV.stateAt({}, 3, 0);
    k.chk('SH-d stateAt on an empty played layer and on a run with no layer: INCONCLUSIVE both', e1.verdict === 'INCONCLUSIVE' && e2.verdict === 'INCONCLUSIVE', e1.verdict + '/' + e2.verdict);
    const bad = await ask('viewer.schedule_at building=Duplex day=2.5');
    k.chk('SH-e a fractional day is refused, not rounded', bad.status === 'error' && /whole number/.test(String(bad.why)), 'status=' + bad.status);
  } finally { Object.keys(saved).forEach(e => { if (saved[e] === undefined) delete process.env[e]; else process.env[e] = saved[e]; }); fs.rmSync(work, { recursive: true, force: true }); }
}

(async () => {
  k.L('start break=' + (process.env.SCHED_VERB_BREAK || 'none') + ' only=' + (ONLY || 'all') + ' base=' + BASE_REV);
  if (want('SV')) await SV();
  if (want('SC')) await SC();
  if (want('SR')) SR();
  if (want('SK')) await SK();
  if (want('SH')) await SH();
  k.end();
})().catch(e => { console.log('§WITNESS_SCHED verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
