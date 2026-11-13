// SPDX-License-Identifier: MIT
// X0 Navigator — "Run and ship", first version: the facts behind Run local, Check and Fetch back.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12c (first version of §F.2) · issue #2947. Pure node, no `vscode` import.
//
// It calls the project's own scripts and git, and re-implements none of them. Apps are discovered (a folder with a sw.js that
// declares CACHE_VERSION), the live site is derived from the git remote, and JavaScript is read with a parser (lib/js_facts.js).
// Every step returns § lines and stops at the first failure. Nothing here commits, pushes, merges or deploys.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');
const http = require('http');
const J = require('./js_facts');
const D = require('./deploy_cost');

const SEC = '§';
function git(root, args) {
  const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60000 });
  return { status: r.status, out: (r.stdout || '').replace(/\s+$/, '') };
}

/** Each app: { app, version, page }. `reader` is a deploy_cost reader (working tree or a git ref). */
function apps(root, reader) {
  const ts = J.loadTs(root);
  if (!ts) return null;
  const out = [];
  for (const dir of reader.dirs()) {
    const sw = reader.read(dir + '/sw.js');
    if (sw === null) continue;
    const version = J.stringConst(ts, sw, 'CACHE_VERSION');
    if (version === null) continue;
    const list = J.stringArray(ts, sw, 'PRECACHE_ASSETS');
    const page = list ? list.items.find(i => i.endsWith('.html')) : null;
    out.push({ app: dir, version, page: page ? path.posix.normalize(path.posix.join(dir, page)) : null });
  }
  return out;
}

/** Run local: what is on disk, and where it will be served. Starting the server is the caller's job (the repo's own task). */
function runLocalLines(root, port) {
  const list = apps(root, D.fsReader(root));
  if (!list) return [SEC + 'SHIP_RUN verdict=INCONCLUSIVE reason="no JavaScript parser found"'];
  return list.map(a => SEC + 'SHIP_RUN app=' + a.app + ' disk_version=' + a.version + ' url=http://localhost:' + (port || 8000) + '/' + (a.page || a.app + '/'))
    .concat(['  a tab that is already open may still run an older cached version: reload it (or "Update on reload" in DevTools)']);
}

/**
 * Check: three steps, stop at the first failure.
 * @returns {{ok: boolean, stoppedAt: string|null, lines: string[]}}
 */
function check(root, base, nodeBin) {
  const lines = []; const ref = base || 'origin/main';
  const fail = (step, l) => { lines.push(l); lines.push(SEC + 'SHIP_CHECK verdict=FAIL stopped_at=' + step); return { ok: false, stoppedAt: step, lines }; };
  if (git(root, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']).status !== 0) {
    lines.push(SEC + 'SHIP_CHECK verdict=INCONCLUSIVE reason="git ref ' + ref + ' not found"'); return { ok: false, stoppedAt: 'ref', lines };
  }
  // 1. syntax of every JS file that differs from the base, or is new
  const changed = git(root, ['diff', '--name-only', '--diff-filter=ACMR', ref, '--', '*.js', '*.mjs']).out.split('\n')
    .concat(git(root, ['ls-files', '--others', '--exclude-standard', '--', '*.js', '*.mjs']).out.split('\n')).filter(Boolean)
    .filter((f, i, a) => a.indexOf(f) === i && fs.existsSync(path.join(root, f))).sort();
  const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
  let bad = null;
  for (const f of changed) {
    const r = cp.spawnSync(nodeBin || process.execPath, ['--check', f], { cwd: root, encoding: 'utf8', env, timeout: 60000 });
    if (r.status !== 0) { bad = { f, msg: (r.stderr || '').split('\n').filter(l => l.trim()).slice(0, 4).join(' | ') }; break; }
  }
  if (bad) return fail('syntax', SEC + 'SHIP_SYNTAX files=' + changed.length + ' verdict=FAIL file=' + bad.f + ' error=' + JSON.stringify(bad.msg.slice(0, 200)));
  lines.push(SEC + 'SHIP_SYNTAX files=' + changed.length + ' verdict=PASS vs=' + ref);
  // 2. the repo's own precache audit
  const audit = path.join(root, 'tests', 'audit_sw_precache.js');
  if (!fs.existsSync(audit)) lines.push(SEC + 'SHIP_AUDIT verdict=SKIPPED reason="tests/audit_sw_precache.js not in this repo"');
  else {
    const r = cp.spawnSync(nodeBin || process.execPath, [audit], { cwd: root, encoding: 'utf8', env, timeout: 120000, maxBuffer: 1 << 26 });
    const sum = ((r.stdout || '').split('\n').find(l => l.startsWith(SEC + 'SW_AUDIT_SUMMARY')) || '').trim();
    if (r.status !== 0) return fail('audit', SEC + 'SHIP_AUDIT verdict=FAIL exit=' + r.status + ' ' + sum);
    lines.push(SEC + 'SHIP_AUDIT verdict=PASS ' + sum);
  }
  // 3. the bump rule: a precached file changed, but that app's CACHE_VERSION did not
  const now = D.measure(root, D.fsReader(root)), was = D.measure(root, D.gitReader(root, ref));
  if (!now.parser) { lines.push(SEC + 'SHIP_BUMP verdict=INCONCLUSIVE reason="no JavaScript parser found"'); return { ok: false, stoppedAt: 'bump', lines }; }
  const vNow = apps(root, D.fsReader(root)), vWas = apps(root, D.gitReader(root, ref));
  for (const a of vNow) {
    const before = vWas.find(x => x.app === a.app);
    if (!before) { lines.push(SEC + 'SHIP_BUMP app=' + a.app + ' verdict=PASS reason="new app"'); continue; }
    const files = Array.from(now.apps[a.app].precache.keys());
    const touched = files.filter(f => !was.apps[a.app].precache.has(f) || git(root, ['diff', '--quiet', ref, '--', f]).status !== 0);
    if (touched.length && a.version === before.version) {
      return fail('bump', SEC + 'SHIP_BUMP app=' + a.app + ' verdict=FAIL precached_files_changed=' + touched.length + ' cache_version=' + a.version + ' (unchanged) first=' + touched[0]
        + '  → bump CACHE_VERSION in ' + a.app + '/sw.js (node scripts/bump.js)');
    }
    lines.push(SEC + 'SHIP_BUMP app=' + a.app + ' verdict=PASS precached_files_changed=' + touched.length + ' cache_version=' + before.version + (a.version !== before.version ? '->' + a.version : ''));
  }
  lines.push(SEC + 'SHIP_CHECK verdict=PASS steps=3');
  return { ok: true, stoppedAt: null, lines };
}

/** `https://<owner>.github.io/<repo>` from the origin remote, or null. */
function liveSite(root) {
  const url = git(root, ['remote', 'get-url', 'origin']).out;
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
  return m ? 'https://' + m[1].toLowerCase() + '.github.io/' + m[2] : null;
}
function httpGet(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'x0-navigator', 'Cache-Control': 'no-cache' }, timeout: 20000 }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: '' }); });
    req.on('error', () => resolve({ status: 0, text: '' }));
  });
}

/**
 * Fetch back (HTTP only): is the live site on the version the base ref has?
 * @param {{site?: string, base?: string, get?: (url: string) => Promise<{status: number, text: string}>}} opts
 */
async function fetchBack(root, opts) {
  const o = opts || {}, ref = o.base || 'origin/main', get = o.get || httpGet, lines = [];
  const site = o.site || liveSite(root);
  const ts = J.loadTs(root);
  if (!site || !ts) { lines.push(SEC + 'SHIP_FETCH verdict=INCONCLUSIVE reason=' + JSON.stringify(!site ? 'no live site (origin is not a GitHub remote)' : 'no JavaScript parser found')); return { ok: false, lines }; }
  const main = apps(root, D.gitReader(root, ref));
  let ok = true;
  for (const a of main) {
    const r = await get(site + '/' + a.app + '/sw.js?x0=' + Date.now());
    const live = r.status === 200 ? J.stringConst(ts, r.text, 'CACHE_VERSION') : null;
    const match = live === a.version;
    if (!match) ok = false;
    lines.push(SEC + 'SHIP_FETCH app=' + a.app + ' http=' + r.status + ' live=' + live + ' main=' + a.version + ' match=' + (match ? 'Y' : 'N'));
  }
  const sha = git(root, ['rev-parse', ref]).out;
  // A version.json beside an app's sw.js that carries a `sha` is the deploy's own stamp (it is written at deploy time, so it
  // need not be in git). One that is missing, or has no `sha`, is not such a stamp and is left alone.
  let stamps = 0;
  for (const a of main) {
    const r = await get(site + '/' + a.app + '/version.json?x0=' + Date.now());
    let liveSha = null, unreadable = false;
    try { liveSha = String(JSON.parse(r.text).sha || ''); } catch (e) { liveSha = null; unreadable = r.status === 200 && /"sha"\s*:/.test(r.text); }
    if (unreadable) {   // the deploy wrote a stamp, but it is not valid JSON: the page that reads it cannot read it either
      stamps++; ok = false;
      lines.push(SEC + 'SHIP_FETCH file=' + a.app + '/version.json http=200 live_sha=unreadable (not valid JSON) match=N');
      continue;
    }
    if (r.status !== 200 || !liveSha) continue;
    stamps++;
    const match = liveSha.length >= 7 && sha.startsWith(liveSha);
    if (!match) ok = false;
    lines.push(SEC + 'SHIP_FETCH file=' + a.app + '/version.json http=' + r.status + ' live_sha=' + liveSha + ' main_sha=' + sha.slice(0, 12) + ' match=' + (match ? 'Y' : 'N'));
  }
  if (!stamps) lines.push(SEC + 'SHIP_FETCH deploy_stamp=none  (no <app>/version.json with a sha on the live site: WHICH commit is live could not be compared)');
  // The cache versions matching says the right VERSION is live; only a deploy stamp says the right COMMIT is. No stamp → not judged.
  const verdict = !ok ? 'FAIL' : stamps ? 'PASS' : 'INCONCLUSIVE';
  lines.push(SEC + 'SHIP_FETCH site=' + site + ' vs=' + ref + ' verdict=' + verdict
    + (verdict === 'FAIL' ? '  (a deploy may still be running: the live site follows a merge by a minute or two)' : ''));
  return { ok: verdict === 'PASS', verdict, lines };
}

module.exports = { apps, runLocalLines, check, liveSite, fetchBack, httpGet };
