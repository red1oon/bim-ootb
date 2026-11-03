#!/usr/bin/env node
/* ⚠ WITNESS — W-SCHED-PERSIST-TARGET (bim-compiler prompts/SEAM_IDENTITY_AUDIT.md, §PERSIST_TARGET tail). READ THE LOG after every run.
 * ISSUE: three callers persist the open building through ScheduleAuthor.persistDb; tm_gantt_edit.js passed the right url
 *   (app._dbPersistUrl || DB_URL, §S78) but schedule_inject.js (Apply/inject) and schedule_author_ui.js passed raw A.DB_URL.
 *   In split mode app.db is loaded from the META url, so those writes went to a slot the loader never reads back
 *   (streaming.js §TM_SPLITMODE_PERSIST_KEY comment) — the authored/injected schedule vanished on reload.
 * CLAIMS: U1-U3 persistUrlFor(app) = split → meta url, whole → DB_URL, none → null; C1-C3 every caller passes persistUrlFor(...)
 *   and none passes a raw DB_URL; K1 the slot written for a split app == cacheKey(meta url) (the slot cachedFetch(metaUrl) reads).
 * BASELINE: pinned to 4c451725 (pre-fix) — must FAIL. MUTANT: schedule_inject back to A.DB_URL — must FAIL. 0 judged → INCONCLUSIVE.
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.resolve(__dirname, '..', '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || '4c451725';
function cur(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function old(p) { try { return cp.execSync('git show ' + REF + ':' + p, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } }
var OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/';
function load(drSrc, saSrc) {
  var c = { window: {}, console: { log: function () {}, warn: function () {} }, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise };
  c.self = c.window; vm.createContext(c);
  try { vm.runInContext(drSrc, c); } catch (e) {}
  if (!c.window.DbResolve && c.DbResolve) c.window.DbResolve = c.DbResolve;
  try { vm.runInContext(saSrc, c); } catch (e) {}
  return { SA: c.window.ScheduleAuthor || c.ScheduleAuthor, DR: c.window.DbResolve };
}
function judge(tag, src) {
  var fails = [], n = 0;
  function ck(ok, msg) { n++; console.log('§SPT ' + tag + ' ' + (ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); }
  var L = load(src.dr, src.sa), f = L.SA && L.SA.persistUrlFor;
  var split = { DB_URL: OCI + 'Hospital_extracted.db', _dbPersistUrl: OCI + 'Hospital_meta.db' }, whole = { DB_URL: OCI + 'Duplex_extracted.db' };
  ck(!!f && f(split) === OCI + 'Hospital_meta.db', 'U1 split mode → the META url app.db came from');
  ck(!!f && f(whole) === OCI + 'Duplex_extracted.db', 'U2 whole-db → DB_URL');
  ck(!!f && f({}) === null, 'U3 no url → null');
  ck(!!f && !!L.SA._cacheKeyFor && L.SA._cacheKeyFor(f(split)) === 'buildings/Hospital_meta.db', 'K1 split write slot == cacheKey(meta url), the slot cachedFetch(metaUrl) reads');
  ck(/persistDb\(d,\s*\(SA\.persistUrlFor \? SA\.persistUrlFor\(A\)/.test(src.inj) && !/persistDb\(d,\s*A\.DB_URL/.test(src.inj), 'C1 schedule_inject.js passes persistUrlFor(A), not A.DB_URL');
  ck(/persistUrlFor\(a\)/.test(src.ui) && !/persistDb\(d,\s*a\.DB_URL/.test(src.ui), 'C2 schedule_author_ui.js passes persistUrlFor(a), not a.DB_URL');
  ck(/SA\.persistUrlFor\(app\)/.test(src.tm), 'C3 tm_gantt_edit.js uses the same rule');
  return { fails: fails, n: n };
}
var files = { dr: 'viewer/db_resolve.js', sa: 'viewer/schedule_author.js', inj: 'viewer/schedule_inject.js', ui: 'viewer/schedule_author_ui.js', tm: 'viewer/tm_gantt_edit.js' };
function grab(fn) { var o = {}; Object.keys(files).forEach(function (k) { o[k] = fn(files[k]); }); return o; }
var NOW = grab(cur), BASE = grab(old), MUT = grab(cur);
MUT.inj = MUT.inj.replace(/persistDb\(d,\s*\(SA\.persistUrlFor \? SA\.persistUrlFor\(A\) : A\.DB_URL\)/, 'persistDb(d, A.DB_URL');
var a = judge('AFTER', NOW), b = BASE.sa ? judge('BASELINE@' + REF, BASE) : { fails: [], n: 0 }, m = judge('MUTANT(inject raw DB_URL)', MUT);
if (!a.n || !b.n) { console.log('§SPT_VERDICT INCONCLUSIVE (baseline unreadable=' + !b.n + ')'); process.exit(2); }
var ok = a.fails.length === 0 && b.fails.length > 0 && m.fails.length > 0;
console.log('§SPT_VERDICT ' + (ok ? 'PASS' : 'FAIL') + ' after=' + (a.n - a.fails.length) + '/' + a.n + ' baselineFails=' + b.fails.length + ' mutantFails=' + m.fails.length);
process.exit(ok ? 0 : 1);
