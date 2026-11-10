#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — legacy_cli.js: the door's program for putting a plugin on the LOCAL legacy iDempiere TEST instance and checking it there.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 12 (erp.legacy_plugin; owner 2026-11-11: "our local machine is our test and dev server ... ImportIdempiere each time, we always refresh that way so we can trace from base").
// Witness: common/door/tests/witness_legacy_plugin.js (W-LEGACY-PLUGIN). READ THE §LEGACY LOG after every run.
//   node legacy_cli.js up                      start the shared docker Postgres if it is not running (never the instance, never the pilot)
//   node legacy_cli.js refresh                 stop -> drop + create DB idempiere_bimdoc -> import the base seed -> sync -> install the bundle -> start -> read the rows back (scripts/legacy_bimdoc_refresh.sh)
//   node legacy_cli.js witness                 the in-server witness over the OSGi console (scripts/legacy_bimdoc_witness.sh)
//   node legacy_cli.js check --book <xlsx> [--version x.y.z]   every row of the workbook, looked up by SQL in the test DB; the installed pack's sha256 against the pack just made
// Exit: 0 answered · 3 refused (answer.refused) or INCONCLUSIVE · 1 failed · 2 usage. JSON on stdout, §LEGACY lines on stderr.
// FIXED, never from the caller: the instance (DB idempiere_bimdoc, ~/idempiere-bimdoc, ports 8108/8464), the Postgres container, the two scripts (found in the bim-compiler checkout at ONE place).
// It refuses the pilot's databases. Nothing here takes SQL, a shell string or a path from the caller.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const DB = 'idempiere_bimdoc', PGC = process.env.OPS_PG_CONTAINER || 'postgres', INST = path.join(os.homedir(), 'idempiere-bimdoc');
const CACHE = process.env.OPS_CACHE || path.join(os.homedir(), '.cache', 'bim_ops'), LOGD = path.join(CACHE, 'legacy');
// The scripts live in bim-compiler at master. The primary checkout ~/bim-compiler is usually on another lane's branch, so the verb keeps its OWN sparse worktree of origin/master
// (scripts + iDempiereOOTB only) under the cache and moves it to the current origin/master on each call; OPS_COMPILER_DIR overrides (a checkout that has both). Never edits ~/bim-compiler.
function compilerDir() {
  if (process.env.OPS_COMPILER_DIR) return process.env.OPS_COMPILER_DIR;
  const home = path.join(os.homedir(), 'bim-compiler'), wt = path.join(os.homedir(), '.cache', 'bim_ops_compiler_wt'), git = (a, cwd) => spawnSync('git', a, { cwd, encoding: 'utf8', timeout: 120000 });
  if (!fs.existsSync(path.join(home, '.git'))) return home;
  git(['fetch', '-q', 'origin', 'master'], home);
  if (!fs.existsSync(wt)) {
    const r = git(['worktree', 'add', '--detach', '--no-checkout', wt, 'origin/master'], home); if (r.status !== 0) return home;
    git(['sparse-checkout', 'set', '--cone', 'scripts', 'iDempiereOOTB'], wt); git(['checkout', '-q'], wt);
  } else git(['checkout', '-q', '--detach', 'origin/master'], wt);
  return wt;
}
const COMP = compilerDir();
const SCRIPTS = { refresh: path.join(COMP, 'scripts', 'legacy_bimdoc_refresh.sh'), witness: path.join(COMP, 'scripts', 'legacy_bimdoc_witness.sh') };
const say = (l) => console.error('§LEGACY ' + l), out = (o) => console.log(JSON.stringify(o));
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const refused = (reason, more) => { out(Object.assign({ refused: true, reason }, more || {})); return 3; };
const inconclusive = (summary) => { out({ verdict: 'INCONCLUSIVE', summary }); return 3; };
if (/^(idempiere|idempiere_pilot|idempiere_laos)$/.test(DB)) { say('FAIL the instance database is a pilot database'); process.exit(1); }

function pg(sql) {
  const r = spawnSync('docker', ['exec', PGC, 'psql', '-U', 'adempiere', '-d', DB, '-At', '-F', '\x1f', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60000 });
  if (r.error || r.status !== 0) throw Object.assign(new Error(((r.stderr || '') + (r.error ? r.error.message : '')).trim().split('\n')[0] || 'psql failed'), { down: true });
  return r.stdout.split('\n').filter(l => l.length).map(l => l.split('\x1f'));
}
const need = (which) => { if (!fs.existsSync(SCRIPTS[which])) { out({ verdict: 'INCONCLUSIVE', summary: 'the ' + which + ' script is not at ' + SCRIPTS[which] + ' (the verb keeps a sparse worktree of bim-compiler origin/master for them; set OPS_COMPILER_DIR to use another checkout)' }); return false; } return true; };

function refresh() {
  if (!need('refresh')) return 3;
  fs.mkdirSync(LOGD, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), log = path.join(LOGD, 'refresh.' + stamp + '.log'), t0 = Date.now();
  say('refresh start db=' + DB + ' instance=' + INST + ' (about two minutes; log ' + log + ')');
  const r = spawnSync('bash', [SCRIPTS.refresh], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1200000, env: process.env, cwd: COMP });
  const text = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : ''); fs.writeFileSync(log, text);
  const lines = text.split('\n').filter(l => /^§BIMDOC-LEGACY /.test(l)).map(l => l.replace(/^§BIMDOC-LEGACY /, '').slice(0, 260));
  const steps = lines.map(l => ({ step: l.split(' ')[0], line: l })), bad = lines.find(l => /^(REFUSED|FAILED)/.test(l));
  const start = lines.find(l => /^start /.test(l)) || '', installed = /installed/.test(start);
  say('refresh exit=' + r.status + ' steps=' + steps.length + ' installed=' + installed + ' ms=' + (Date.now() - t0));
  if (bad) return refused(bad, { steps, log });
  if (r.status !== 0 || !installed) { say('FAIL the refresh did not finish with the pack installed (exit ' + r.status + '); log ' + log); return 1; }
  out({ instance: { database: DB, http: 8108, https: 8464, dir: '~/idempiere-bimdoc' }, steps, installed, log, ms: Date.now() - t0, verdict: 'DONE', summary: 'refreshed ' + DB + ' from the base seed in ' + Math.round((Date.now() - t0) / 1000) + ' s; the pack is installed' });
  return 0;
}

function witness() {
  if (!need('witness')) return 3;
  fs.mkdirSync(LOGD, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), log = path.join(LOGD, 'witness.' + stamp + '.log'), t0 = Date.now();
  // the OSGi console needs about 20 s after the server starts: an INCONCLUSIVE (no console yet) is retried, never reported as the answer on the first try
  let r, text, v, tries = 0;
  do { if (tries) { say('witness: console not ready (' + (v ? v[1] : 'no verdict') + '), waiting 20 s (try ' + (tries + 1) + ' of 4)'); spawnSync('sleep', ['20']); }
    r = spawnSync('bash', [SCRIPTS.witness], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000, env: process.env, cwd: COMP }); text = (r.stdout || '') + (r.stderr || ''); v = /§W-BIMDOC-LEGACY (PASS|FAIL|INCONCLUSIVE|ERROR)([^\n]*)/.exec(text); tries++;
  } while ((!v || v[1] === 'INCONCLUSIVE') && tries < 4);
  fs.writeFileSync(log, text);
  if (!v) { say('FAIL the in-server witness printed no verdict line (exit ' + r.status + '); log ' + log); return 1; }
  const pass = /pass=(\d+)/.exec(v[2]), fail = /fail=(\d+)/.exec(v[2]), failed = text.split('\n').filter(l => /^\s*FAIL /.test(l)).map(l => l.trim().slice(0, 200));
  say('witness ' + v[1] + v[2].slice(0, 60) + ' log=' + log);
  const a = { verdict: v[1], pass: pass ? +pass[1] : null, fail: fail ? +fail[1] : null, failed, log, ms: Date.now() - t0, summary: 'in-server witness ' + v[1] + (pass ? ' ' + pass[1] + '/' + (fail ? fail[1] : '?') : '') };
  out(a); return v[1] === 'INCONCLUSIVE' || v[1] === 'ERROR' ? 3 : 0;
}

function check(a) {
  if (!a.book || /\.\./.test(a.book) || path.isAbsolute(a.book) || !/\.xlsx$/i.test(a.book)) return refused('book is a relative .xlsx path inside this tree');
  const book = [path.resolve(process.cwd(), a.book), path.resolve(ROOT, a.book)].find(f => fs.existsSync(f)); if (!book) return refused('no workbook ' + a.book);
  const { readWorkbook } = require(path.join(ROOT, 'erp', 'tools', 'xlsx_pack.js')), W = readWorkbook(book).sheets, S = (t) => W[t] || [];
  const tblOf = (v) => { const m = /^ref:(.+)$/.exec(v || ''); if (m) { const r = S('ad_table').find(x => x.key === m[1]); return r ? r.values.tablename : null; } const e = /^existing:AD_Table:(.+)$/.exec(v || ''); return e ? e[1] : null; };
  const checks = []; const add = (what, exp, found) => checks.push({ what, expected: exp, found, ok: found >= exp });
  try {
    pg('select 1');
    const one = (sql) => +(pg(sql)[0] || [0])[0];
    add('AD_Table rows', S('ad_table').length, S('ad_table').filter(r => one('select count(*) from ad_table where tablename=' + lit(r.values.tablename))).length);
    add('physical tables', S('ad_table').length, S('ad_table').filter(r => one("select count(*) from information_schema.tables where table_name=" + lit(String(r.values.tablename).toLowerCase()))).length);
    add('AD_Column rows', S('ad_column').length, S('ad_column').filter(r => { const t = tblOf(r.values.ad_table_id); return t && one('select count(*) from ad_column c join ad_table t on t.ad_table_id=c.ad_table_id where t.tablename=' + lit(t) + ' and c.columnname=' + lit(r.values.columnname)); }).length);
    add('AD_Window rows', S('ad_window').length, S('ad_window').filter(r => one('select count(*) from ad_window where name=' + lit(r.values.name))).length);
    add('AD_Tab rows', S('ad_tab').length, S('ad_tab').filter(r => { const w = /^ref:(.+)$/.exec(r.values.ad_window_id || ''), wr = w && S('ad_window').find(x => x.key === w[1]), wn = wr ? wr.values.name : ((/^existing:AD_Window:(.+)$/.exec(r.values.ad_window_id || '') || [])[1]); return wn && one('select count(*) from ad_tab t join ad_window w on w.ad_window_id=t.ad_window_id where w.name=' + lit(wn) + ' and t.name=' + lit(r.values.name) + ' and t.tablevel=' + (+r.values.tablevel || 0)); }).length);
    add('AD_Menu rows', S('ad_menu').length, S('ad_menu').filter(r => one('select count(*) from ad_menu where name=' + lit(r.values.name))).length);
    add('AD_Process rows with the same class name', S('ad_process').length, S('ad_process').filter(r => one('select count(*) from ad_process where value=' + lit(r.values.value) + ' and classname=' + lit(r.values.classname))).length);
    add('AD_Reference rows', S('ad_reference').length, S('ad_reference').filter(r => one('select count(*) from ad_reference where name=' + lit(r.values.name))).length);
  } catch (e) { return inconclusive('the test database ' + DB + ' is not reachable (' + e.message + '); run legacy.status, then legacy.refresh'); }
  // the pack the plugin really carries: the installed bundle's 2Pack zip against the pack just made from this workbook
  let pack = { compared: false, note: 'no version given: the installed pack was not compared with a fresh one' };
  if (a.version) {
    const fresh = path.join(ROOT, 'build', 'legacy_plugin', '2Pack_' + a.version + '.zip'), pdir = path.join(INST, 'server', 'plugins'), inst = fs.existsSync(pdir) ? fs.readdirSync(pdir).filter(n => /^org\.idempiere\.bimdocument_/.test(n)).map(n => path.join(pdir, n, 'META-INF', '2Pack_' + a.version + '.zip')).find(f => fs.existsSync(f)) : null;
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    // the two zips carry the same rows when their PackOut.xml is the same (the zip container's own stamps are not the pack)
    const xml = (f) => spawnSync('unzip', ['-p', f, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
    if (!fs.existsSync(fresh)) pack = { compared: false, note: 'no fresh pack at build/legacy_plugin/2Pack_' + a.version + '.zip (run erp.pack with out=build/legacy_plugin first)' };
    else if (!inst) pack = { compared: false, note: 'no installed bundle carries 2Pack_' + a.version + '.zip' };
    else pack = { compared: true, same: xml(fresh) === xml(inst), freshSha256: sha(fresh).slice(0, 16), installedSha256: sha(inst).slice(0, 16), note: xml(fresh) === xml(inst) ? 'the installed pack has the same rows as the one just made' : 'the installed pack is NOT the one made from this workbook (the refresh installs the bundle as committed)' };
  }
  const missing = checks.filter(c => !c.ok).map(c => c.what + ' ' + c.found + '/' + c.expected), verdict = missing.length ? 'MISSING' : 'ALL-FOUND';
  say('check ' + verdict + ' ' + checks.map(c => c.found + '/' + c.expected).join(' ') + ' pack=' + (pack.compared ? (pack.same ? 'same' : 'DIFFERENT') : 'not compared'));
  out({ database: DB, book: a.book, checks, pack, missing, verdict, summary: 'test DB ' + DB + ': ' + verdict + ' (' + checks.filter(c => c.ok).length + '/' + checks.length + ' kinds of row); ' + pack.note });
  return 0;
}

function pgReady() { const r = spawnSync('docker', ['exec', PGC, 'pg_isready', '-U', 'adempiere'], { encoding: 'utf8', timeout: 8000 }); return !r.error && r.status === 0; }
function up() {   // the shared docker Postgres only: it starts that one container and waits for it to accept connections. The instance itself is started by the refresh.
  const ps = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}|{{.State}}'], { encoding: 'utf8', timeout: 10000 });
  if (ps.error || ps.status !== 0) return inconclusive('docker is not reachable here (' + String((ps.stderr || (ps.error && ps.error.message) || '')).trim().split('\n')[0] + ')');
  const row = ps.stdout.split('\n').map(l => l.split('|')).find(r => r[0] === PGC);
  if (!row) return refused('no docker container named ' + PGC + ' (the shared Postgres); create it with ~/idempiere-dev-setup/docker-postgres.sh');
  if (row[1] === 'running' && pgReady()) { say('up ' + PGC + ' already running and ready'); out({ container: PGC, verdict: 'ALREADY-UP', summary: PGC + ' was already running and accepting connections; nothing was started' }); return 0; }
  say('up starting container ' + PGC + ' (state ' + row[1] + ')'); const st = spawnSync('docker', ['start', PGC], { encoding: 'utf8', timeout: 60000 });
  if (st.status !== 0) { say('FAIL docker start ' + PGC + ': ' + String(st.stderr).trim().slice(0, 160)); return 1; }
  for (let i = 0; i < 30; i++) { if (pgReady()) { say('up ' + PGC + ' started after ' + (i * 2) + ' s'); out({ container: PGC, verdict: 'STARTED', summary: PGC + ' started and accepts connections' }); return 0; } spawnSync('sleep', ['2']); }
  return inconclusive(PGC + ' was started but did not accept connections within 60 s');
}

async function main(argv) {
  const cmd = argv[0], a = {};
  for (let i = 1; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('FAIL usage: ' + argv[i]); return 2; } a[m[1]] = argv[++i]; }
  try {
    if (cmd === 'up') return up(); if (cmd === 'refresh') return refresh(); if (cmd === 'witness') return witness(); if (cmd === 'check') return check(a);
    say('FAIL usage: legacy_cli.js up|refresh|witness|check'); return 2;
  } catch (e) { say('FAIL ' + (e && e.message)); return 1; }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { main };
