#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-BUMP), bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8 S5
// ISSUE: a precached file edited by hand is served STALE, with no error, unless three other edits are made too:
//        its `?v=N` in every page that loads it, and `CACHE_VERSION` in that page's service worker. Doing that by
//        hand is the commonest way a by-hand fix "doesn't work" (MODELLER_MASTER: "check the service-worker
//        CACHE_VERSION and whether the file is precached").
// WHAT:  for each file given, find every tracked .html whose src=/href= resolves to it and add 1 to its ?v=N;
//        also each `'<path>?v=N'` in a .js loader's lazy list (viewer/main.js modules[]) — and then the changed loader's
//        own ?v= (it is precached); add 1 to CACHE_VERSION of each sw.js involved (once per sw). Lazy loading is kept as
//        is: a not-precached file gets a NOTE (normal for lazy modules), never an edit to PRECACHE_ASSETS.
//        DRY RUN by default — prints what it would change. --write applies. Touches nothing else.
// USE:   node scripts/bump.js viewer/still_fault.js            (dry run)
//        node scripts/bump.js --changed [--check|--write]     (§F.34: every changed file a page loads; --check = both gates, nothing written)
//        node scripts/bump.js viewer/still_fault.js --write    (apply; then run tests/audit_sw_precache.js)
//        --root DIR   operate on another tree (the witness uses a temp copy)
// PARITY GATE (W-BUMP-PARITY, F-16; bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md "F-16 BUILD SPEC"):
//        with --write and a target under `applies_to` (scripts/bump_parity.json, default erp/), the legacy-parity bridge
//        (run_all.sh) runs FIRST; every `§<TAG>_VERDICT <WORD>` is parsed; NEW = a FAIL/HARNESS-FAIL not in `known`.
//        mode block (config; BUMP_PARITY=block|warn|off overrides one run): NEW or 0 verdicts (INCONCLUSIVE) -> nothing written, exit 3.
//        warn: written, line says WARN. off: not run. `--no-parity "<reason>"` writes and logs OVERRIDE (reason required).
//        A PASS is cached per tree (HEAD + git diff) under ~/.cache/bim_bridge/bump_parity/. Dry runs and non-ERP bumps never run it.
//        Env for tests: BUMP_PARITY_BRIDGE (script path), BUMP_PARITY_HOME (cache + log dir).
// EXIT:  0 ok · 2 a file does not exist or no page loads it (nothing written) · 1 bad usage · 3 parity gate blocked (nothing written)
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const ri = argv.indexOf('--root');
const ROOT = path.resolve(ri >= 0 ? argv[ri + 1] : path.join(__dirname, '..'));
const npi = argv.indexOf('--no-parity');
let NO_PARITY = null;   // the reason string, once given
if (npi >= 0) {
  const r = argv[npi + 1];
  // a reason is required; an existing file name right after the flag is a target, not a reason
  if (r === undefined || r.startsWith('--') || !r.trim() || fs.existsSync(path.resolve(ROOT, r))) {
    console.log('§BUMP_ERR no_parity_needs_reason (usage: --no-parity "<why the parity gate is skipped>") written=0'); process.exit(1);
  }
  NO_PARITY = r.trim();
}
const targets = argv.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1) && !(npi >= 0 && i === npi + 1));
if (!targets.length && !argv.includes('--changed')) { console.error('usage: node scripts/bump.js <file…> | --changed [--check | --write] [--root DIR]'); process.exit(1); }

function listFiles(ext) {
  try {
    return cp.execSync(`git ls-files "*${ext}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
  } catch (e) {   // not a git tree (temp copy): walk it
    const out = [];
    (function w(d) {
      for (const n of fs.readdirSync(path.join(ROOT, d))) {
        if (n === 'node_modules' || n === '.git') continue;
        const r = d ? d + '/' + n : n; const st = fs.statSync(path.join(ROOT, r));
        if (st.isDirectory()) w(r); else if (r.endsWith(ext)) out.push(r);
      }
    })('');
    return out;
  }
}
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

// LAZY LOADING IS KEPT AS IS (bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §14 N2): a lazy module's ?v= lives in a
// .js loader's string list (viewer/main.js modules[]: 'nf_room.js?v=1'), not in a page. Those literals are bumped too —
// resolved from the loader's own folder, exact path only — and nothing is ever added to PRECACHE_ASSETS.
const pages = listFiles('.html').filter(h => !/\/lib\//.test(h));
const loaders = listFiles('.js').filter(f => !/^scripts\/|\/(lib|node_modules|tests)\/|\.min\.js$|witness|(^|\/)sw\.js$/.test(f));   // scripts/ = tooling, never loaded by a page
const PAGE_REF = /((?:src|href)\s*=\s*")([^"?#]+)\?v=(\d+)(")/g;
const JS_REF = /((['"]))([^'"\s?#]+\.(?:js|css|json|wasm))\?v=(\d+)(\2)/g;
// B1 (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B1 BUILD SPEC" §4; bim-ootb #3244): an app with a committed <app>/modules.json is
//   bumped IN ITS MANIFEST: the module's one `v` and the app's cacheVersion go up there, then the generator writes the app's pages, loaders,
//   inline page literals (owner B1-Q2: they go up with their module) and sw.js. Every other referrer takes the regex path below, unchanged;
//   a shared file (e.g. viewer/rates.js) takes both in one run. Command lines, exit codes and §BUMP lines are as before.
const MS = require('./lib/manifest_source.js');
const SRC = {};
for (const app of require('./gen_manifest.js').APPS) if (MS.hasSource(ROOT, app)) {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, MS.sourceFile(app)), 'utf8'));
  SRC[app] = { m, owned: new Set([...Object.keys(m.order), m.sw, MS.sourceFile(app)]), bumped: new Set(), why: [] };
}
const ownedBy = f => Object.keys(SRC).find(a => SRC[a].owned.has(f));
// §F.34 --changed (decision F-24): the targets are every file changed against the merge-base with origin/main (committed, working tree, untracked)
//   that a page or loader references with ?v= (the files a bump can raise); the rest (prompts, tests, tools) are counted and skipped.
const CHANGED = argv.includes('--changed'), CHECK = argv.includes('--check');
if (CHANGED) {
  const g = a => { try { return cp.execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  const mb = (g(['merge-base', 'HEAD', 'origin/main']) || '').trim();
  if (!mb) { console.log('§BUMP_ERR changed_needs_git_and_origin_main written=0'); process.exit(1); }
  const files = [...new Set(((g(['diff', '--name-only', mb]) || '') + (g(['ls-files', '--others', '--exclude-standard']) || '')).split('\n').filter(f => f && fs.existsSync(path.join(ROOT, f))))];
  const refd = new Set();
  for (const h of pages) for (const m of fs.readFileSync(path.join(ROOT, h), 'utf8').matchAll(PAGE_REF)) if (!/^[a-z]+:|^\/\//i.test(m[2])) refd.add(path.relative(ROOT, path.resolve(ROOT, path.dirname(h), m[2])).split(path.sep).join('/'));
  for (const l of loaders) for (const m of fs.readFileSync(path.join(ROOT, l), 'utf8').matchAll(JS_REF)) refd.add(path.relative(ROOT, path.resolve(ROOT, path.dirname(l), m[3])).split(path.sep).join('/'));
  for (const a of Object.keys(SRC)) for (const [f, x] of Object.entries(SRC[a].m.modules)) if (x.v != null) refd.add(f);
  const pick = files.filter(f => refd.has(f));
  console.log(`§BUMP_CHANGED base=${mb.slice(0, 12)} changed=${files.length} bumpable=${pick.length} skipped=${files.length - pick.length} files=${pick.join(',')}`);
  if (!pick.length) { console.log('§BUMP_DONE targets=0 nothing to bump (no changed file is loaded with ?v=)'); process.exit(0); }
  targets.push(...pick);
}
const want = new Set();
for (const t of targets) {
  const abs = path.resolve(ROOT, t);
  if (!fs.existsSync(abs)) { console.log(`§BUMP_ERR missing=${t} written=0`); process.exit(2); }
  want.add(rel(abs));
}

const edits = new Map();          // file -> new text
const hits = new Map([...want].map(w => [w, 0]));
const swBump = new Map();         // sw path -> [files whose change needs it]
const text = f => (edits.has(f) ? edits.get(f) : fs.readFileSync(path.join(ROOT, f), 'utf8'));
function swFor(f, besideOnly) {   // a page uses the sw beside it; a .js loader the nearest sw.js above it
  let d = path.posix.dirname(f);
  for (;;) {
    const sw = path.posix.join(d === '.' ? '' : d, 'sw.js');
    if (fs.existsSync(path.join(ROOT, sw))) return sw;
    if (besideOnly || d === '.' || d === '') return null;
    d = path.posix.dirname(d);
  }
}
function needSw(f, besideOnly) {
  const sw = swFor(f, besideOnly);
  if (sw) { if (!swBump.has(sw)) swBump.set(sw, []); swBump.get(sw).push(f); }
  else console.log(`§BUMP_NOTE file=${f} has no sw.js for it (no cache to bump)`);
}
let queue = [...want]; const done = new Set();
for (let depth = 0; queue.length && depth < 4; depth++) {
  const round = new Set(queue.filter(q => !done.has(q))); queue = [];
  round.forEach(q => done.add(q));
  if (!round.size) break;
  for (const h of pages) {
    if (ownedBy(h)) continue;   // B1: written from its app's modules.json (below)
    let changed = false;
    const out = text(h).replace(PAGE_REF, (m, a, p, n, z) => {
      if (/^[a-z]+:|^\/\//i.test(p)) return m;
      const r = rel(path.resolve(ROOT, path.dirname(h), p));
      if (!round.has(r)) return m;
      if (hits.has(r)) hits.set(r, hits.get(r) + 1); changed = true;
      console.log(`§BUMP page=${h} ref=${p} v=${n}->${+n + 1}`);
      return a + p + '?v=' + (+n + 1) + z;
    });
    if (changed) { edits.set(h, out); needSw(h, true); }
  }
  for (const f of loaders) {
    if (ownedBy(f)) continue;
    let changed = false;
    const out = text(f).replace(JS_REF, (m, a, q, p, n, z) => {
      if (/^[a-z]+:|^\/\//i.test(p)) return m;
      const r = rel(path.resolve(ROOT, path.dirname(f), p));
      if (!round.has(r) || r === f) return m;   // a file never bumps a reference to itself; its OTHER entries are still read (#3201)
      if (hits.has(r)) hits.set(r, hits.get(r) + 1); changed = true;
      console.log(`§BUMP loader=${f} ref=${p} v=${n}->${+n + 1} (lazy load list)`);
      return a + p + '?v=' + (+n + 1) + z;
    });
    if (changed) {
      edits.set(f, out); needSw(f, false);
      queue.push(f);   // the loader itself changed: its own ?v= must go up too (it is precached, e.g. viewer/main.js)
    }
  }
  for (const app of Object.keys(SRC)) {   // B1: the manifest path — one `v` per module, every site of it in the app
    const S = SRC[app], { b0 } = MS.expand(S.m);
    for (const mod of b0.modules) {
      if (!round.has(mod.file) || S.bumped.has(mod.file) || mod.v == null) continue;
      const sites = mod.sites.filter(x => x.in !== mod.file);   // a file never bumps a reference to itself
      if (!sites.length) continue;
      S.bumped.add(mod.file); S.m.modules[mod.file].v = mod.v + 1;
      if (hits.has(mod.file)) hits.set(mod.file, hits.get(mod.file) + sites.length);
      for (const x of sites) {
        const k = x.kind === 'inline' ? 'inline' : x.in.endsWith('.html') ? 'page' : 'loader';
        console.log(`§BUMP ${k}=${x.in} ref=${x.as} v=${mod.v}->${mod.v + 1}${k === 'loader' ? ' (lazy load list)' : k === 'inline' ? ' (inline page script, B1-Q2)' : ''} (manifest ${MS.sourceFile(app)})`);
        S.why.push(x.in);
        if (k === 'loader') queue.push(x.in);   // the loader changed: its own ?v= goes up next round
      }
    }
  }
}
for (const [w, n] of hits) if (!n) { console.log(`§BUMP_ERR not_loaded_by_any_page_or_loader=${w} written=0`); process.exit(2); }

for (const [sw, why] of [...swBump]) { const a = ownedBy(sw); if (a) { SRC[a].why.push(...why); swBump.delete(sw); } }
for (const app of Object.keys(SRC)) {
  const S = SRC[app]; if (!S.why.length) continue;
  const n = +S.m.cacheVersion.slice(1);
  console.log(`§BUMP sw=${S.m.sw} CACHE_VERSION v${n}->v${n + 1} (for: ${[...new Set(S.why)].join(', ')}) (manifest ${MS.sourceFile(app)})`);
  S.m.cacheVersion = 'v' + (n + 1);
  const w = MS.write(ROOT, app, { manifest: S.m });
  if (w.fails.length) { w.fails.forEach(f => console.log('§BUMP_ERR manifest_write ' + f)); console.log('§BUMP_ERR the manifest could not write its files; run node scripts/gen_manifest.js --check written=0'); process.exit(1); }
  for (const [f, t] of w.out) if (t !== text(f)) edits.set(f, t);
  const pre = new Set(S.m.precacheOrder.map(e => path.posix.normalize(path.posix.join(app, e.split('?')[0]))));
  for (const x of want) if (S.m.modules[x] && !pre.has(x)) console.log(`§BUMP_NOTE not_precached file=${x} sw=${S.m.sw} — normal for a lazy module; add it to precacheOrder in ${MS.sourceFile(app)} only if it must work offline`);
}
for (const [sw, why] of swBump) {
  const src = text(sw);
  const m = /(const CACHE_VERSION\s*=\s*'v)(\d+)(')/.exec(src);
  if (!m) { console.log(`§BUMP_WARN sw=${sw} CACHE_VERSION not found — bump it by hand`); continue; }
  edits.set(sw, src.slice(0, m.index) + m[1] + (+m[2] + 1) + m[3] + src.slice(m.index + m[0].length));
  console.log(`§BUMP sw=${sw} CACHE_VERSION v${m[2]}->v${+m[2] + 1} (for: ${[...new Set(why)].join(', ')})`);
  const swDir = path.posix.dirname(sw);
  for (const w of want) {
    const inSw = path.posix.relative(swDir, w);
    if (!inSw.startsWith('..') && !src.includes(`'${inSw}'`) && !src.includes(`"${inSw}"`))
      console.log(`§BUMP_NOTE not_precached file=${w} sw=${sw} — normal for a lazy module (viewer/sw.js v1078 note: network-first online); add it to PRECACHE_ASSETS only if it must work offline`);
  }
}

for (const w of want) {   // mentions the exact-path rule could not resolve (e.g. a page-relative path in a sub-folder loader)
  const needle = path.posix.basename(w) + '?v=';
  for (const f of loaders) if (!edits.has(f) && !ownedBy(f) && text(f).includes(needle)) console.log(`§BUMP_CHECK_BY_HAND loader=${f} mentions ${needle} (not changed: path did not resolve to ${w})`);
}

// ---- ERP parity gate (F-16) -------------------------------------------------------------------------------------------
// §F.32: the witnesses the bridge script names (`witness_x` with a witness_x.js beside it) and those whose source, or a local module it requires
//   (transitively), reads a setting the gate hands in (OOTB / BRIDGE_OOTB / BRIDGE_UI_DB): those are the ones that judge the bumped tree.
function bridgeSelect(bridge) {
  const dir = path.dirname(bridge), READS = /\b(BRIDGE_OOTB|BRIDGE_UI_DB)\b|\benv\.OOTB\b/;
  let src = ''; try { src = fs.readFileSync(bridge, 'utf8'); } catch (e) { return { names: [], tree: [] }; }
  const names = [...new Set(src.match(/\bwitness_[a-z0-9_]+/g) || [])].filter(n => fs.existsSync(path.join(dir, n + '.js')));
  const reads = (f, seen) => {
    f = path.resolve(f); if (seen.has(f) || !fs.existsSync(f)) return false; seen.add(f);
    const s = fs.readFileSync(f, 'utf8'); if (READS.test(s)) return true;
    for (const m of s.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) { let q = path.resolve(path.dirname(f), m[1]); if (!/\.js$/.test(q)) q += '.js'; if (reads(q, seen)) return true; }
    return false;
  };
  return { names, tree: names.filter(n => reads(path.join(dir, n + '.js'), new Set())) };
}

// tree identity = HEAD + git diff (a non-git temp copy: hash of every file). One function: the bridge cache, the touch cache and --check share it.
let _treeKey = null;
function treeKey() {
  if (_treeKey) return _treeKey;
  const h = crypto.createHash('sha256');
  const git = a => cp.execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  try { h.update(git(['rev-parse', 'HEAD'])); h.update(git(['diff', 'HEAD'])); }
  catch (e) { h.update('nogit'); for (const f of [...listFiles('.html'), ...listFiles('.js'), ...listFiles('.json')].sort()) h.update(f).update(fs.readFileSync(path.join(ROOT, f))); }
  return (_treeKey = h.digest('hex'));
}

function parityGate() {
  const cfgPath = [path.join(ROOT, 'scripts', 'bump_parity.json'), path.join(__dirname, 'bump_parity.json')].find(p => fs.existsSync(p));
  let cfg = { mode: 'block', applies_to: ['erp/'], bridge: '~/bim-compiler/scripts/bridge/run_all.sh', known: [] };
  if (cfgPath) { try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); }
    catch (e) { console.log(`§BUMP_ERR bump_parity.json unreadable (${e.message}) written=0`); process.exit(1); } }
  if (![...want].some(w => (cfg.applies_to || []).some(a => w.startsWith(a)))) return;   // not an ERP bump: never runs
  const mode = process.env.BUMP_PARITY || cfg.mode;
  if (!['block', 'warn', 'off'].includes(mode)) { console.log(`§BUMP_ERR BUMP_PARITY/mode must be block|warn|off, got "${mode}" written=0`); process.exit(1); }
  if (NO_PARITY) { console.log(`§BUMP_PARITY mode=${mode} verdict=OVERRIDE reason=${JSON.stringify(NO_PARITY)} (put the reason in the commit message)`); return; }
  if (mode === 'off') { console.log('§BUMP_PARITY mode=off verdict=OFF (parity not run)'); return; }
  const home = process.env.BUMP_PARITY_HOME || path.join(os.homedir(), '.cache', 'bim_bridge');
  const known = new Set(cfg.known || []);
  const key = treeKey(), cacheFile = path.join(home, 'bump_parity', key + '.json');
  const say = (verdict, o) => console.log(`§BUMP_PARITY mode=${mode} verdicts=${o.verdicts.length} new=[${o.nw.join(',')}] known=[${o.kn.join(',')}] log=${o.log} cached=${o.cached ? 'Y' : 'N'} tree=${ROOT} scoped=${o.scope || scope} verdict=${verdict}${o.why ? ' why=' + o.why : ''}`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.key === key && c.verdict === 'PASS') { say('PASS', { verdicts: c.verdicts, nw: [], kn: c.kn, log: c.log, cached: true, scope: c.scope }); return; }
  } catch (e) { /* no cache */ }
  const bridge = (process.env.BUMP_PARITY_BRIDGE || cfg.bridge || '').replace(/^~(?=\/|$)/, os.homedir());
  let out = '', why = '', scope = 'none';
  if (!bridge || !fs.existsSync(bridge)) why = `bridge_missing(${bridge}) set BUMP_PARITY_BRIDGE or bridge in bump_parity.json`;
  else {
    // §F.30 (#3111): the bridge judges the tree being BUMPED, not the shared ~/bim-ootb. These are the settings its witnesses read; the ones that
    // read only ~/bim-ootb are the parity lane's (bim-compiler prompts/SQLiteIDEMPIERE.md note), hence scoped=partial on the § line.
    const env = Object.assign({}, process.env, { OOTB: ROOT, BRIDGE_OOTB: ROOT, BRIDGE_UI_DB: path.join(ROOT, 'erp', 'ad_seed.db') });
    // §F.32: run only the bridge witnesses that READ one of those settings (directly or through a local require); the others judge the parity lane's own
    //   engine and DBs, a change to this tree cannot move them, and the whole bridge outgrew the gate (~25 min, W-FA grows every run). The bridge script stays
    //   the list of record; a script that names no witness file (a stub, a custom runner) is run whole, as before.
    const sel = bridgeSelect(bridge);
    if (!sel.names.length) {
      scope = 'script';
      const r = cp.spawnSync('bash', [bridge], { cwd: path.dirname(bridge), env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 15 * 60 * 1000 });
      out = (r.stdout || '') + (r.stderr || '');
      if (r.error) why = `bridge_error(${r.error.message})`;
    } else {
      scope = `tree witnesses=${sel.tree.length} skipped=${sel.names.length - sel.tree.length}`;
      console.log(`§BUMP_PARITY_PLAN witnesses=${sel.tree.length}`);
      for (const w of sel.tree) {
        const t0 = Date.now(), r = cp.spawnSync('node', [w + '.js'], { cwd: path.dirname(bridge), env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 10 * 60 * 1000 });
        const o1 = `=== ${w}\n` + (r.stdout || '') + (r.stderr || '');
        out += o1;
        console.log(`§BUMP_PARITY_RUN w=${w} secs=${Math.round((Date.now() - t0) / 1000)} verdicts=${(o1.match(/^\s*§\w+?_VERDICT\s/mg) || []).length}${r.error ? ' error=' + r.error.message : ''}`);
        if (r.error) why = why || `bridge_error(${w}: ${r.error.message})`;
      }
    }
  }
  fs.mkdirSync(home, { recursive: true });
  const log = path.join(home, `bump_parity_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}_${process.pid}.log`);
  fs.writeFileSync(log, out);
  const WORDS = new Set(['PASS', 'PASS-with-INCONCLUSIVE', 'FAIL', 'HARNESS-FAIL', 'NOT-RUN', 'INCONCLUSIVE']);
  const verdicts = [];   // "TAG:WORD", first recognised word after §<TAG>_VERDICT (some lines carry a witness id first)
  for (const line of out.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    const m = /^\s*§(\w+?)_VERDICT\s+(.*)$/.exec(line);
    const w = m && m[2].split(/\s+/).find(x => WORDS.has(x));
    if (w) verdicts.push(`${m[1]}:${w}`);
  }
  const bad = verdicts.filter(v => /:(FAIL|HARNESS-FAIL)$/.test(v));
  const nw = [...new Set(bad.filter(v => !known.has(v)))], kn = [...new Set(bad.filter(v => known.has(v)))];
  const o = { verdicts, nw, kn, log, cached: false, scope };
  if (!verdicts.length) {
    why = why || 'bridge printed 0 verdicts (is the legacy pilot up? docker postgres :5432 idempiere_pilot + pilot :8088; see ' + log + ')';
    o.why = why;
    if (mode === 'block') { say('INCONCLUSIVE', o); console.log('§BUMP_BLOCKED nothing written (exit 3). Fix the cause, or: --no-parity "<reason>", or BUMP_PARITY=warn'); process.exit(3); }
    say('WARN', o); return;
  }
  if (nw.length) {
    if (mode === 'block') { say('BLOCKED', o); console.log('§BUMP_BLOCKED new parity mismatch, nothing written (exit 3). Fix it, or: --no-parity "<reason>", or BUMP_PARITY=warn'); process.exit(3); }
    say('WARN', o); return;
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ key, verdict: 'PASS', verdicts, kn, log, scope, at: new Date().toISOString() }));
  say('PASS', o);
}

// §F.33 (decision F-23): the CHANGED files' own witnesses. Every node witness under */tests/ that requires a bumped target runs on this tree; one that
//   fails is re-run once (a flake is not a failure) and then run on the BASE (merge-base with origin/main, a cached detached worktree; BUMP_TOUCH_BASE=<dir>
//   names a ready one). Blocks only on pass-on-base / fail-on-change. Judged by exit code (the signal all witnesses share); the last verdict line is printed.
function touchGate() {
  const cfgPath = [path.join(ROOT, 'scripts', 'bump_parity.json'), path.join(__dirname, 'bump_parity.json')].find(p => fs.existsSync(p));
  let cfg = { mode: 'block', applies_to: ['erp/'] };
  if (cfgPath) { try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); } catch (e) { /* parityGate already refused it */ } }
  const changed = [...want].filter(w => (cfg.applies_to || []).some(a => w.startsWith(a)) && w.endsWith('.js'));
  if (!changed.length || NO_PARITY) return;
  const mode = process.env.BUMP_PARITY || cfg.mode;
  if (mode === 'off') return;
  const t0 = Date.now(), names = changed.map(f => path.basename(f, '.js'));
  const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const REQ = new RegExp(`require\\([^)]*['"/](${names.map(esc).join('|')})(\\.js)?['"]`);
  let all = [];
  try { all = cp.execFileSync('git', ['ls-files', '*/tests/witness_*.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
  catch (e) { all = listFiles('.js').filter(f => /(^|\/)tests\/witness_[^/]*\.js$/.test(f)); }
  const loads = all.filter(f => REQ.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const browser = loads.filter(f => /playwright|chromium|puppeteer/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const ws = loads.filter(f => !browser.includes(f));
  const runOne = (tree, f) => {
    const s0 = Date.now(), r = cp.spawnSync('node', [path.join(tree, f)], { cwd: path.join(tree, path.dirname(path.dirname(f))), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, timeout: 5 * 60 * 1000 });
    const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /VERDICT|verdict=/.test(l));
    return { code: r.status === 0 ? 0 : 1, secs: Math.round((Date.now() - s0) / 1000), last: (lines[lines.length - 1] || '').trim().slice(0, 160) };
  };
  const home = process.env.BUMP_PARITY_HOME || path.join(os.homedir(), '.cache', 'bim_bridge');
  let base = process.env.BUMP_TOUCH_BASE || null, baseSha = base ? 'dir' : null, baseWhy = '', cache = {}, cacheFile = null;
  const ensureBase = () => {
    if (base || baseWhy) return base;
    try {
      baseSha = cp.execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const dir = path.join(home, 'touch_base', baseSha);
      if (!fs.existsSync(path.join(dir, '.git'))) { fs.mkdirSync(path.dirname(dir), { recursive: true }); cp.execFileSync('git', ['worktree', 'add', '--detach', dir, baseSha], { cwd: ROOT, stdio: 'ignore' }); }
      if (fs.existsSync(path.join(ROOT, 'node_modules')) && !fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(dir, 'node_modules'));
      base = dir; cacheFile = path.join(home, 'touch_base', baseSha + '.json');
      try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { cache = {}; }
    } catch (e) { baseWhy = 'base_unavailable(' + (e.message || e).toString().split('\n')[0].slice(0, 120) + ')'; }
    return base;
  };
  const passFile = path.join(home, 'touch_pass', crypto.createHash('sha256').update(treeKey() + '|' + changed.slice().sort().join(',')).digest('hex') + '.json');
  try { const c = JSON.parse(fs.readFileSync(passFile, 'utf8')); if (c.verdict === 'PASS') { console.log(c.line.replace(/ verdict=PASS/, ' cached=Y verdict=PASS')); return; } } catch (e) { /* not checked yet */ }
  console.log(`§BUMP_TOUCH_PLAN witnesses=${ws.length} budget_s=${+process.env.BUMP_TOUCH_BUDGET_S || 600}`);
  const newFail = [], preFail = [], unjudged = [], unrun = [];
  // F-23b (owner 2026-11-17, "10-min budget"): fastest first by the durations recorded on earlier runs (never-measured ones first, to learn them); no new
  //   witness starts once the budget is spent, and every one not reached is NAMED (unrun=[...]); it is not a failure.
  const budget = 1000 * (+process.env.BUMP_TOUCH_BUDGET_S || 600), durFile = path.join(home, 'touch_durations.json');
  let dur = {}; try { dur = JSON.parse(fs.readFileSync(durFile, 'utf8')); } catch (e) { dur = {}; }
  ws.sort((a, b) => (dur[a] == null ? -1 : dur[a]) - (dur[b] == null ? -1 : dur[b]) || (a < b ? -1 : 1));
  for (const f of ws) {
    if (Date.now() - t0 >= budget) { unrun.push(path.basename(f, '.js')); continue; }
    // base FIRST (cached per base commit): a witness already failing on the base cannot be a new fail, so it needs no flake re-run (measured 2026-11-17:
    //   re-running the 9 pre-failing ad_callout.js witnesses was ~20 of the 34 min). Only a fail-on-change / pass-on-base is re-run once.
    let c = runOne(ROOT, f), b = null;
    if (c.code && ensureBase()) {
      b = cache[f] && baseSha !== 'dir' ? cache[f] : runOne(base, f);
      if (baseSha !== 'dir') cache[f] = b;
      if (!b.code) { const c2 = runOne(ROOT, f); if (!c2.code) c = Object.assign(c2, { flake: true }); }
      if (c.code) (b.code ? preFail : newFail).push(path.basename(f, '.js'));
    } else if (c.code) unjudged.push(path.basename(f, '.js'));
    dur[f] = c.secs;
    console.log(`§BUMP_TOUCH_RUN w=${f} change=${c.code}${c.flake ? '(flake)' : ''} base=${b ? b.code : '-'} secs=${c.secs} last=${JSON.stringify(c.last)}`);
  }
  if (cacheFile) try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch (e) { /* cache is a convenience */ }
  try { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(durFile, JSON.stringify(dur)); } catch (e) { /* durations are a convenience */ }
  // a witness failing on the change with no base to compare is NOT judged: INCONCLUSIVE, never a silent pass
  const verdict = newFail.length ? (mode === 'block' ? 'BLOCKED' : 'WARN') : unjudged.length ? (mode === 'block' ? 'INCONCLUSIVE' : 'WARN') : 'PASS';
  const touchLine = `§BUMP_TOUCH files=${changed.join(',')} witnesses=${ws.length} browser_skipped=${browser.length} new_fail=[${newFail.join(',')}] pre_fail=[${preFail.join(',')}] unjudged=[${unjudged.join(',')}] unrun=[${unrun.join(',')}] budget_s=${budget / 1000} base=${baseSha ? baseSha.slice(0, 12) : '-'} secs=${Math.round((Date.now() - t0) / 1000)} verdict=${verdict}${baseWhy ? ' why=' + baseWhy : ''}`;
  console.log(touchLine);
  if (verdict === 'PASS') try { fs.mkdirSync(path.dirname(passFile), { recursive: true }); fs.writeFileSync(passFile, JSON.stringify({ verdict, line: touchLine, at: new Date().toISOString() })); } catch (e) { /* cache is a convenience */ }
  if (mode === 'block' && (verdict === 'BLOCKED' || verdict === 'INCONCLUSIVE')) { console.log('§BUMP_BLOCKED a changed file\'s own witness fails only on this change, nothing written (exit 3). Fix it, or: --no-parity "<reason>", or BUMP_PARITY=warn'); process.exit(3); }
}

if (WRITE || CHECK) parityGate();
if (WRITE || CHECK) touchGate();
if (CHECK) { console.log(`§BUMP_CHECK verdict=PASS key=${treeKey().slice(0, 12)} targets=${want.size} (nothing written; --write on the same tree reuses this result)`); process.exit(0); }

if (WRITE) for (const [f, t] of edits) fs.writeFileSync(path.join(ROOT, f), t);
console.log(`§BUMP_DONE targets=${want.size} pages=${[...edits.keys()].filter(f => f.endsWith('.html')).length} loaders=${[...edits.keys()].filter(f => f.endsWith('.js') && !/(^|\/)sw\.js$/.test(f)).length} sw=${swBump.size + Object.values(SRC).filter(S => S.why.length).length} mode=${WRITE ? 'write' : 'dry-run'} written=${WRITE ? edits.size : 0}`);
if (!WRITE) console.log('dry run — nothing written. Add --write to apply, then run: node tests/audit_sw_precache.js');
