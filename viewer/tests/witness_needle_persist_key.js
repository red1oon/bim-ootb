#!/usr/bin/env node
/* ⚠ WITNESS — W-NEEDLE-PERSIST-KEY (bim-compiler prompts/SEAM_IDENTITY_AUDIT.md, wave 3 tail). READ THE LOG after every run.
 * ISSUE: the needle room-inject persist (viewer/nf_tree_lens.js §S3) wrote the patched building under the RAW A.DB_URL,
 *   a slot cachedFetch never reads for a shipped building (it reads DbResolve.cacheKey) → rooms recomputed on EVERY load
 *   and a full building copy wasted; in split mode A.db is the META db, so DB_URL is also the wrong url. The save rule
 *   (url = _dbPersistUrl || DB_URL, key = cacheKey(url)) lived inline in erp/kernel_ops.js only.
 * CLAIMS: P1-P4 DbResolve.persistTarget is the one pure rule (shipped / split / dev-verbatim / none);
 *   S1 the needle persist puts under persistTarget().key and reclaims the raw copy; S2 erp/kernel_ops.js uses persistTarget.
 * BASELINE: pinned to 1a11a9ee (pre-fix) — must FAIL. MUTANT: needle back to put(outBuf, url) — must FAIL. 0 judged → INCONCLUSIVE.
 * RUN: node viewer/tests/witness_needle_persist_key.js [--before-ref=1a11a9ee]
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.resolve(__dirname, '..', '..');
var REF = ((process.argv.find(function (a) { return a.indexOf('--before-ref=') === 0; }) || '').split('=')[1]) || '1a11a9ee';
function cur(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function old(p) { try { return cp.execSync('git show ' + REF + ':' + p, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } }
function loadDR(src) { var c = { window: {} }; c.self = c.window; vm.createContext(c); try { vm.runInContext(src, c); } catch (e) {} return c.window.DbResolve || c.DbResolve || null; }
var SHIPPED = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db';
var META = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_meta.db';
var DEV = '/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';

function judge(tag, src) {
  var fails = [], n = 0;
  function ck(ok, msg) { n++; console.log('§NPK ' + tag + ' ' + (ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); }
  var DR = loadDR(src.dr), pt = DR && DR.persistTarget;
  ck(!!pt && pt({ DB_URL: SHIPPED }).key === 'buildings/Hospital_extracted.db' && pt({ DB_URL: SHIPPED }).url === SHIPPED, 'P1 shipped url → canonical key, url kept');
  ck(!!pt && pt({ DB_URL: SHIPPED, _dbPersistUrl: META }).key === 'buildings/Hospital_meta.db', 'P2 split mode keys the META url (APP.db = meta), never DB_URL');
  ck(!!pt && pt({ DB_URL: DEV }).key === DEV, 'P3 K3 dev path stays verbatim');
  ck(!!pt && pt({}) === null && pt(null) === null, 'P4 no url → null (no persist)');
  var i3 = src.nf.indexOf('S3 — persist patched'), s3 = i3 < 0 ? '' : src.nf.slice(i3, i3 + 2600);   // the §S3 persist block only
  ck(/persistTarget\(A\)/.test(s3) && /put\(outBuf,\s*_pkey\)/.test(s3) && !/put\(outBuf,\s*url\)/.test(s3), 'S1 needle persist puts under persistTarget().key, not the raw url');
  ck(/store\.delete\(_pt\.url\)/.test(s3), 'S1b needle persist reclaims the superseded raw copy');
  ck(/DbResolve\.persistTarget\(A\)/.test(src.ko), 'S2 erp/kernel_ops.js takes its url/key from the one rule');
  return { fails: fails, n: n };
}
var NOW = { dr: cur('viewer/db_resolve.js'), nf: cur('viewer/nf_tree_lens.js'), ko: cur('erp/kernel_ops.js') };
var BASE = { dr: old('viewer/db_resolve.js'), nf: old('viewer/nf_tree_lens.js'), ko: old('erp/kernel_ops.js') };
var MUT = { dr: NOW.dr, ko: NOW.ko, nf: NOW.nf.replace('store.put(outBuf, _pkey)', 'store.put(outBuf, url)') };
var a = judge('AFTER', NOW), b = BASE.dr ? judge('BASELINE@' + REF, BASE) : { fails: [], n: 0 }, m = judge('MUTANT(raw put)', MUT);
var judged = a.n + b.n + m.n;
if (!a.n || !b.n) { console.log('§NPK_VERDICT INCONCLUSIVE judged=' + judged + ' (baseline unreadable: ' + !b.n + ')'); process.exit(2); }
var ok = a.fails.length === 0 && b.fails.length > 0 && m.fails.length > 0;
console.log('§NPK_VERDICT ' + (ok ? 'PASS' : 'FAIL') + ' after=' + (a.n - a.fails.length) + '/' + a.n + ' baselineFails=' + b.fails.length + ' mutantFails=' + m.fails.length);
process.exit(ok ? 0 : 1);
