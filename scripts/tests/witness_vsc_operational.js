#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-VSC-OPERATIONAL (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.41 SPEC, DECISIONS, BUILD NOTES; bim-ootb #3330).
// Read the log after every run: exit code is not evidence. Verdict line: §VSC_OPERATIONAL … verdict=PASS|FAIL|INCONCLUSIVE.
// PROVES: .vscode/tasks.json, .vscode/launch.json
// ISSUE THIS PROVES OR DISPROVES: "an operational entry point of the download (an app page, a command, a package script, a runner, the setup
//   script) cannot be started from VS Code, or its VS Code route exists but does not start it". STANDING RULE (owner 2026-11-18): a PR that adds an
//   entry point adds its route in the same PR; this witness fails otherwise.
// DENOMINATOR, DERIVED (never typed; each row prints its source): every page of each manifest app (scripts/gen_manifest.js buildApp) · package.json
//   `bin` · devtools/<d>/<d>.js commands · package.json `scripts` · runners `*/tests/run_*.{js,sh}` and `scripts/run_*.{js,sh}` (one a package
//   script runs is that script's row) · scripts/setup.js (Developer Guide §3).
// ROUTE: NAMED = a task / launch whose command or url names the entry (the Code Facts extension for its own command); GENERIC = a task / launch
//   on `${file}` / `${relativeFile}` that fits the file's kind (owner F-41-Q1: generic routes count; generic-only rows are listed apart).
// RUN (headless, stdin closed): a page = HTTP 200 from the Serve task's own command (its port swapped for a free one) at the URL its route opens;
//   anything else = its route's command, ok when it exits 0 or prints its own verdict / § line; a long one killed at --timeout-s after printing
//   = `started`. setup.js runs with --dry-run. NEVER RUN (lane rule: no browser / heavy job without the owner's go): an entry whose code, or a local
//   file it calls, names one of SAFETY_WORDS in code (JS: parser tokens; sh: non-comment lines), or a shell runner that starts a program through a
//   variable, is `not-run`, listed, never counted as ok. BACKSTOP: every run has empty browser paths and is killed as a whole session (see GUARD_ENV).
// RED CONTROLS (same run, each must be DETECTED): V1 a new entry with no route -> gap routed · V2 a named task's command broken -> run fails ·
//   V3 an empty population -> INCONCLUSIVE · V4 the page server serving another folder -> HTTP 404, run fails (a parse of the task file is not a run) ·
//   V5 a run asking Playwright for a browser is BLOCKED (the backstop holds).
// Command: node scripts/tests/witness_vsc_operational.js [--root DIR] [--timeout-s 30] [--no-run]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http'), net = require('net'), os = require('os');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..', '..'))), TIMEOUT = 1000 * +opt('--timeout-s', 30), NO_RUN = argv.includes('--no-run');
const say = s => process.stdout.write(s + '\n');
const JSONC = require(path.join(__dirname, '..', 'lib', 'jsonc.js')), { trackedFiles } = require(path.join(__dirname, '..', 'lib', 'tracked_files.js'));
const SAFETY_WORDS = ['playwright', 'puppeteer', 'chromium', 'xvfb', 'google-chrome', 'cache_4d_run'];

// ---- the denominator
function derive(root) {
  const E = [], G = require(path.join(root, 'scripts', 'gen_manifest.js')), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const app of G.APPS) for (const p of G.buildApp(root, app).manifest.pages) E.push({ kind: 'page', name: p, file: p, source: 'manifest:' + app });
  for (const [n, f] of Object.entries(pkg.bin || {})) E.push({ kind: 'cli', name: n, file: f.replace(/^\.\//, ''), source: 'package.json bin' });
  const dv = path.join(root, 'devtools');
  for (const d of fs.existsSync(dv) ? fs.readdirSync(dv).sort() : []) { const f = `devtools/${d}/${d}.js`;
    if (fs.existsSync(path.join(root, f)) && /^#!.*node/.test(fs.readFileSync(path.join(root, f), 'utf8'))) E.push({ kind: 'cli', name: d, file: f, source: 'devtools/<d>/<d>.js' }); }
  const scripts = Object.entries(pkg.scripts || {});
  for (const [n, c] of scripts) E.push({ kind: 'script', name: 'npm ' + (n === 'test' ? 'test' : 'run ' + n), cmd: c, source: 'package.json scripts' });
  for (const f of trackedFiles(root).filter(f => /((^|\/)tests\/run_[^/]*|^scripts\/run_[^/]*)\.(js|sh)$/.test(f)).sort()) {
    if (scripts.some(([, c]) => c.split(/\s+/).includes(f))) continue;   // that package script's row
    E.push({ kind: 'runner', name: f, file: f, source: 'runner glob' }); }
  if (fs.existsSync(path.join(root, 'scripts', 'setup.js'))) E.push({ kind: 'setup', name: 'scripts/setup.js', file: 'scripts/setup.js', source: 'Developer Guide §3' });
  return E;
}

// ---- the routes VS Code offers
function routes(root) {
  const rd = f => { try { return JSONC.read(path.join(root, '.vscode', f)); } catch (e) { return null; } };
  const t = rd('tasks.json'), l = rd('launch.json'), ext = path.join(root, 'devtools', 'vscode', 'code-facts', 'package.json');
  let cfCmds = 0; try { cfCmds = (JSON.parse(fs.readFileSync(ext, 'utf8')).contributes.commands || []).length; } catch (e) { /* no extension */ }
  return { tasks: (t && t.tasks) || [], launches: (l && l.configurations) || [], codeFactsCommands: cfCmds };
}
const cmdOf = task => [task.command].concat(task.args || []).join(' ');
const GEN_FILE = /\$\{(relativeFile|file)\}/;
const interpOf = c => { const s = new Set(); for (const m of c.matchAll(/\b(node|bash|sh)\s+['"]?\$\{(?:relativeFile|file)\}/g)) s.add(m[1] === 'sh' ? 'bash' : m[1]); return s; };
function serveOf(R) { const t = R.tasks.find(x => /http\.server\s+\d+/.test(cmdOf(x))); if (!t) return null; return { task: t, port: +/http\.server\s+(\d+)/.exec(cmdOf(t))[1] }; }

function match(e, R) {
  if (e.kind === 'page') {
    const sv = serveOf(R); if (!sv) return null;
    const ok = c => c.type === 'chrome' && typeof c.url === 'string' && new URL(c.url.replace(GEN_FILE, 'x')).port === String(sv.port);
    const named = R.launches.find(c => ok(c) && !GEN_FILE.test(c.url) && new URL(c.url).pathname === '/' + e.file);
    if (named) return { cls: 'named', label: named.name, url: named.url };
    const gen = R.launches.find(c => ok(c) && /\$\{relativeFile\}/.test(c.url));
    return gen ? { cls: 'generic', label: gen.name, url: gen.url.replace('${relativeFile}', e.file) } : null;
  }
  if (e.kind === 'script') {
    const want = e.cmd.replace(/^npx\s+/, ''), named = R.tasks.find(t => { const c = cmdOf(t); return c.includes(want) || new RegExp('\\bnpm (run )?' + e.name.replace(/^npm (run )?/, '') + '\\b').test(c); });
    return named ? { cls: 'named', label: named.label, cmd: cmdOf(named) } : null;
  }
  // a file: cli, runner, setup
  const named = R.tasks.find(t => cmdOf(t).includes(e.file)) || null;
  if (named) return { cls: 'named', label: named.label, cmd: cmdOf(named) };
  const nl = R.launches.find(c => c.type === 'node' && typeof c.program === 'string' && c.program.includes(e.file));
  if (nl) return { cls: 'named', label: nl.name, cmd: 'node ' + e.file };
  if (e.kind === 'cli' && e.file === 'devtools/code-facts/code-facts.js' && R.codeFactsCommands > 0) return { cls: 'named', label: `Code Facts extension (${R.codeFactsCommands} commands)`, cmd: 'node devtools/code-facts/code-facts.js tag §BUMP', note: 'the terminal form of the same facts' };
  const want = /\.sh$/.test(e.file) ? 'bash' : /\.m?js$/.test(e.file) ? 'node' : null;
  const gt = want && R.tasks.find(t => interpOf(cmdOf(t)).has(want));
  if (gt) return { cls: 'generic', label: gt.label, cmd: cmdOf(gt) };
  const gl = want === 'node' && R.launches.find(c => c.type === 'node' && GEN_FILE.test(c.program || ''));
  if (gl) return { cls: 'generic', label: gl.name, cmd: 'node ' + e.file };
  return null;
}

// ---- safety: never start a browser or a heavy job
function codeWords(root, f) {
  let src; try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return ''; }
  if (/\.sh$/.test(f)) return src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  try { const es = require(path.join(root, 'node_modules', 'espree'));
    return es.tokenize(src.replace(/^#![^\n]*/, ''), { ecmaVersion: 'latest', sourceType: 'script', tolerant: true }).filter(t => t.type !== 'Punctuator').map(t => t.value).join(' '); }
  catch (e) { return src; }   // unparsable: judge the raw text (stricter, never looser)
}
function unsafe(root, e) {
  const files = [e.file].filter(Boolean), first = files[0] && codeWords(root, files[0]);
  // a shell runner that starts a program through a variable (`node "tests/$1"`) cannot be read ahead: never run (tests/run_regression.sh, measured 2026-11-19)
  if (first && /\.sh$/.test(files[0])) { const dyn = first.split('\n').find(l => /\b(node|bash|sh|python3?)\s+["']?[^\s"';|&]*\$/.test(l)); if (dyn) return 'dynamic call in ' + files[0] + ': ' + dyn.trim().slice(0, 80); }
  if (first) for (const m of first.matchAll(/\b(?:node|bash)\s+["']?(?:\$ROOT\/)?([\w./-]+\.(?:m?js|sh))/g)) if (fs.existsSync(path.join(root, m[1]))) files.push(m[1]);
  for (const f of files) { const w = SAFETY_WORDS.find(x => codeWords(root, f).toLowerCase().includes(x)); if (w) return `${w} in ${f}`; }
  return null;
}

// ---- running a route
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const get = url => new Promise(r => { const q = http.get(url, res => { res.resume(); r(res.statusCode); }); q.on('error', () => r(0)); q.setTimeout(10000, () => { q.destroy(); r(0); }); });
async function startServer(R, cwd) {
  const sv = serveOf(R), port = await freePort(), cmd = cmdOf(sv.task).replace(/http\.server\s+\d+/, 'http.server ' + port + ' --bind 127.0.0.1');
  const ch = cp.spawn('bash', ['-c', cmd], { cwd, stdio: 'ignore', detached: true });
  for (let i = 0; i < 50; i++) { if (await get(`http://127.0.0.1:${port}/`) > 0) break; await new Promise(z => setTimeout(z, 200)); }
  return { port, from: sv.port, stop: () => { try { process.kill(-ch.pid, 'SIGTERM'); } catch (e) { /* gone */ } } };
}
function subst(cmd, root, file) {
  const f = file || '', ext = path.extname(f);
  return cmd.replace(/\$\{workspaceFolder\}/g, root).replace(/\$\{relativeFile\}/g, f).replace(/\$\{file\}/g, path.join(root, f))
    .replace(/\$\{fileBasenameNoExtension\}/g, path.basename(f, ext)).replace(/\$\{fileExtname\}/g, ext);
}
// BACKSTOP for the scan above: browser paths point at an empty folder (Playwright / Puppeteer cannot find a browser to start), and every run is its
//   own session (detached = setsid), killed whole when it ends or times out, so a child that moved to its own process group (`timeout` does) dies too.
const NOBROWSER = fs.mkdtempSync(path.join(os.tmpdir(), 'w-vsc-nobrowser-'));
process.on('exit', () => { try { fs.rmSync(NOBROWSER, { recursive: true, force: true }); } catch (e) { /* gone */ } });
const GUARD_ENV = Object.assign({}, process.env, { PLAYWRIGHT_BROWSERS_PATH: NOBROWSER, PUPPETEER_CACHE_DIR: NOBROWSER, PUPPETEER_EXECUTABLE_PATH: path.join(NOBROWSER, 'none'), CHROME_PATH: path.join(NOBROWSER, 'none') });
const killSession = sid => { try { cp.spawnSync('pkill', ['-KILL', '-s', String(sid)]); } catch (e) { /* none left */ } };
function runCmd(root, cmd) {
  return new Promise(resolve => {
    const ch = cp.spawn('nice', ['-n', '19', 'bash', '-c', cmd], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: GUARD_ENV }); let out = '', done = false, timedOut = false;
    ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { timedOut = true; killSession(ch.pid); }, TIMEOUT);
    ch.on('close', code => { if (done) return; done = true; clearTimeout(t); killSession(ch.pid); resolve({ code, out, timedOut }); });
  });
}
const VERDICT = /^\s*§(?!LOG_STAMP\b)[A-Z0-9_]+\b[^\n]*(verdict=|_VERDICT )|^\s*§(?!LOG_STAMP\b)[A-Z0-9_]+ /m;   // the entry's own line, never the task's §LOG_STAMP
async function runEntry(root, e, rt) {
  if (e.kind === 'page') return null;   // pages run together (one server)
  const why = unsafe(root, e.kind === 'script' ? Object.assign({}, e, { file: (e.cmd.match(/[\w./-]+\.(?:m?js|sh)\b/) || [null])[0] }) : e);
  if (why) return { run: 'not-run', detail: 'reason=' + why };
  let cmd = subst(rt.cmd, root, e.file);
  if (e.kind === 'setup') {   // only the `node …setup.js` call gets --dry-run (the task also names the file as log_stamp's argument); no node call = never run
    const re = /(\bnode\s+['"]?[^'"\s;]*scripts\/setup\.js['"]?)/g; if (!re.test(cmd)) return { run: 'not-run', detail: 'reason=no node call to add --dry-run to' };
    cmd = cmd.replace(re, '$1 --dry-run'); }
  const r = await runCmd(root, cmd);
  // a task that writes its output to a log file and prints only the tail at the end ("Run this witness"): judge what that log holds so far
  const lf = (/>\s*['"]?([^'"\s;&|]+\.log)['"]?/.exec(cmd) || [])[1], logTxt = lf && fs.existsSync(path.resolve(root, lf)) ? fs.readFileSync(path.resolve(root, lf), 'utf8') : '';
  const all = r.out + '\n' + logTxt, lines = all.split('\n').filter(l => l.trim() && !/^\s*§LOG_STAMP\b/.test(l)), v = (all.match(VERDICT) || [''])[0].trim().slice(0, 120);
  if (r.timedOut) return { run: lines.length ? 'started' : 'fail', detail: `killed_at=${TIMEOUT / 1000}s out_lines=${lines.length}${lf ? ' (its log ' + lf + ')' : ''}` + (v ? ' first_verdict=' + JSON.stringify(v) : '') };
  return { run: r.code === 0 || v ? 'ok' : 'fail', detail: `exit=${r.code} out_lines=${lines.length}` + (v ? ' verdict_line=' + JSON.stringify(v) : ' last=' + JSON.stringify((lines.slice(-1)[0] || '').slice(0, 100))) };
}
async function runPages(R, rows, cwd) {
  const pages = rows.filter(x => x.e.kind === 'page' && x.rt); if (!pages.length) return null;
  const s = await startServer(R, cwd);
  try { for (const x of pages) { const u = new URL(x.rt.url); u.port = String(s.port); u.hostname = '127.0.0.1'; const code = await get(u.toString());
    x.run = code === 200 ? 'ok' : 'fail'; x.detail = `http=${code} url=${u.pathname} serve_port=${s.from}->${s.port}`; } }
  finally { s.stop(); }
  return s.port;
}

// ---- the judgement
async function judge(root, E, R, o) {
  o = o || {};
  const rows = E.map(e => ({ e, rt: match(e, R), run: 'not-run', detail: '' }));
  if (!o.noRun) {
    await runPages(R, rows, o.serveCwd || root);
    for (const x of rows) if (x.rt && x.e.kind !== 'page') Object.assign(x, await runEntry(root, x.e, x.rt));
  }
  const routed = rows.filter(x => x.rt), judged = rows.filter(x => x.rt && x.run !== 'not-run'), okRun = judged.filter(x => x.run === 'ok' || x.run === 'started');
  return { rows, N: rows.length, routed: routed.length, named: routed.filter(x => x.rt.cls === 'named').length, genericOnly: routed.filter(x => x.rt.cls === 'generic'),
    judged: judged.length, runOk: okRun.length, notRun: rows.filter(x => x.rt && x.run === 'not-run'), gaps: rows.filter(x => !x.rt || x.run === 'fail') };
}
const verdictOf = j => !j.N || (!j.judged && !NO_RUN) ? 'INCONCLUSIVE' : j.routed === j.N && j.runOk === j.judged ? 'PASS' : 'FAIL';

(async () => {
  const E = derive(ROOT), R = routes(ROOT), j = await judge(ROOT, E, R, { noRun: NO_RUN });
  for (const x of j.rows) say(`  §VSC_OPERATIONAL_ENTRY kind=${x.e.kind} name=${x.e.name} source=${JSON.stringify(x.e.source)} route=${x.rt ? x.rt.cls + ':' + JSON.stringify(x.rt.label) : '-'} run=${x.run}${x.detail ? ' ' + x.detail : ''}`);
  for (const x of j.gaps) say(`  §VSC_OPERATIONAL_GAP entry=${x.e.name} what=${x.rt ? 'run' : 'routed'}`);
  for (const x of j.notRun) say(`  §VSC_OPERATIONAL_NOT_RUN entry=${x.e.name} ${x.detail || 'reason=--no-run'}`);
  say(`  §VSC_OPERATIONAL_GENERIC_ONLY n=${j.genericOnly.length} entries=${j.genericOnly.map(x => x.e.name).join(',')}`);

  // red controls: each on a copy of the inputs, never on the files
  const red = [];
  { const j1 = await judge(ROOT, [{ kind: 'cli', name: 'zz_v1_tool.py', file: 'zz_v1/tool.py', source: 'planted' }], R, { noRun: true });
    red.push(['V1', j1.gaps.length === 1 && !j1.rows[0].rt, `a planted entry with no route: gaps=${j1.gaps.length} routed=${j1.routed}`]); }
  { const R2 = JSON.parse(JSON.stringify(R)), ts = R2.tasks.filter(x => /eslint/.test(cmdOf(x))), t = ts[0];
    ts.forEach(x => { x.command = cmdOf(x) + ' --zz-v2-no-such-option'; delete x.args; });   // still names `eslint viewer` (so it routes), but cannot start
    const lint = E.filter(e => e.kind === 'script' && /eslint/.test(e.cmd)), j2 = t && lint.length ? await judge(ROOT, lint, R2) : null;
    red.push(['V2', !!j2 && j2.gaps.some(x => x.rt && x.run === 'fail'), j2 ? `lint task command broken: ${j2.rows.map(x => x.run + ' ' + x.detail).join(' ; ')}` : 'no lint task to break']); }
  { const j3 = await judge(ROOT, [], R, { noRun: true }); red.push(['V3', verdictOf(j3) === 'INCONCLUSIVE', `empty population: verdict=${verdictOf(j3)}`]); }
  { const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'w-vsc-v4-')), p = E.filter(e => e.kind === 'page' && match(e, R)).slice(0, 1);
    try { const j4 = p.length ? await judge(ROOT, p, R, { serveCwd: empty }) : null;
      red.push(['V4', !!j4 && j4.rows.length > 0 && j4.rows.every(x => x.rt && x.run === 'fail'), j4 ? `server serving an empty folder: ${j4.rows.map(x => x.e.name + ' ' + x.run + ' ' + x.detail).join(' ; ')}` : 'no page']); }
    finally { fs.rmSync(empty, { recursive: true, force: true }); } }
  // V5: the backstop holds: a run that asks Playwright for a browser gets none (an empty browser folder), so a missed scan cannot start one
  { let pw = null; try { pw = require(path.join(__dirname, '..', '..', 'witness_kit', 'paths.js')).nodeModule('playwright'); } catch (e) { /* not installed */ }
    if (!pw) red.push(['V5', true, 'n/a: playwright is not installed here, so there is no browser to start']);
    else { const r = await runCmd(ROOT, `node -e "require(${JSON.stringify(JSON.stringify(pw)).slice(1, -1)}).chromium.launch().then(b => { console.log('LAUNCHED'); return b.close(); }, e => console.log('BLOCKED ' + e.message.split('\\n')[0].slice(0, 90)))"`);
      red.push(['V5', /BLOCKED/.test(r.out) && !/LAUNCHED/.test(r.out), 'a run asking Playwright for a browser: ' + (r.out.trim().split('\n').pop() || '(no output)').slice(0, 140)]); } }
  red.forEach(([id, d, s]) => say(`  §VSC_OPERATIONAL_RED id=${id} detected=${d ? 'Y' : 'N'} ${s}`));

  const kinds = {}; j.rows.forEach(x => { kinds[x.e.kind] = (kinds[x.e.kind] || 0) + 1; });
  let v = verdictOf(j); if (red.some(r => !r[1]) && v === 'PASS') v = 'INCONCLUSIVE';
  if (red.some(r => !r[1])) say('  §VSC_OPERATIONAL_INCONCLUSIVE a red control was not detected');
  say(`§VSC_OPERATIONAL entry_points=${j.N} (${Object.entries(kinds).map(([k, n]) => k + ':' + n).join(' ')}) routed=${j.routed} named=${j.named} generic_only=${j.genericOnly.length} run_judged=${j.judged} run_ok=${j.runOk} not_run=${j.notRun.length} gaps=${j.gaps.length} red=${red.filter(r => r[1]).length}/${red.length}${NO_RUN ? ' mode=no-run' : ''} verdict=${v}`);
  process.exit(v === 'PASS' ? 0 : 1);
})();
