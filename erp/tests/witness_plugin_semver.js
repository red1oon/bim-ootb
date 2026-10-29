#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PLUGIN-SEMVER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §46.6 S4 (review finding F4). READ THE LOG after every run: verdict = §PS_VERDICT.
//   THE ISSUE it proves/disproves: erp/plugin_registry.js read versions with a parser that returned [0,0,0] for garbage, so a two-sided OSGi range "[1.2,2)" silently meant "= 0.0.0" (a plugin needing it was
//   refused or admitted for no stated reason) and a malformed `requires` was never reported. The registry must use the ONE strict library (common/comm/semver_strict.js): garbage THROWS and is a clear install error,
//   OSGi intervals work, every single-comparator range that worked still works, every SHIPPED manifest still parses, and a resolveDeps failure that restore() swallowed is logged (§PLUGIN_RESOLVE_FAILED).
//   P1 intervals · P2 garbage throws · P3 single comparators unchanged (grid vs a plain numeric oracle) · P4 install/start with real ranges · P5 resolveDeps · P6 §PLUGIN_RESOLVE_FAILED · P7 shipped manifests parse (N>0).
// Run: node erp/tests/witness_plugin_semver.js 2>&1 | tee /tmp/witness_plugin_semver.log      env PS_REGISTRY=<file> runs against another registry (RED proof against origin/main's; mutants).
'use strict';
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), ONLY = !!process.env.PS_ONLY_ARMS, _log = console.log, ARMS = {}, JUDGED = 0, FAILS = 0, say = function (s) { if (!ONLY) _log(s); };
function check(id, name, cond, detail) { ARMS[id] = ARMS[id] || { bad: 0 }; JUDGED++; if (!cond) { ARMS[id].bad++; FAILS++; } say('   ' + (cond ? '🟢' : '🔴') + ' ' + id + ' ' + name + (detail ? ' — ' + detail : '')); }
var REG = process.env.PS_REGISTRY || path.join(ERP, 'plugin_registry.js'), PR = require(REG);
function throws(f) { try { f(); return false; } catch (e) { return true; } }
async function rejects(p) { try { await p; return null; } catch (e) { return e.message; } }
function mk(id, version, over) { return { manifest: Object.assign({ id: id, version: version, engineVersion: '>=0.9.0', requires: {} }, over || {}), activate: function () {} }; }

(async function () {
  say('═══ W-PLUGIN-SEMVER — the plugin registry uses ONE strict version parser (spec §46.6 S4) ═══');
  say('\n── P1: OSGi two-sided ranges work in the registry ──');
  var T = [['1.5.0', '[1.2,2)', true], ['1.2.0', '[1.2,2)', true], ['1.1.9', '[1.2,2)', false], ['2.0.0', '[1.2,2)', false], ['1.2.0', '(1.2,2)', false], ['2.0.0', '(1.0,2.0]', true], ['2.0.0', '[1.2,2]', true], ['0.0.0', '[1.2,2)', false]];
  var bad1 = T.filter(function (t) { var g; try { g = PR.satisfies(t[0], t[1]); } catch (e) { g = 'THROW'; } return g !== t[2]; });
  check('P1', T.length + ' interval cases (incl. "0.0.0 is NOT in [1.2,2)", the old silent "= 0.0.0")', bad1.length === 0, bad1.length ? 'wrong: ' + bad1.map(function (t) { return t[0] + ' in ' + t[1]; }).join('; ') : 'all');

  say('\n── P2: garbage THROWS (never a silent 0.0.0) ──');
  var G = [function () { PR.parseVer('garbage'); }, function () { PR.parseVer(''); }, function () { PR.cmpVer('1.0.0', 'x'); }, function () { PR.satisfies('1.0.0', '[1.2,2'); }, function () { PR.satisfies('1.0.0', '[2,1)'); }, function () { PR.satisfies('x', '*'); }, function () { PR.satisfies('1.0.0', '~1.2'); }];
  var okThrow = G.filter(function (f) { return throws(f); }).length;
  check('P2', G.length + ' malformed versions / ranges each THROW', okThrow === G.length, okThrow + '/' + G.length + ' threw');
  check('P2', 'an ABSENT range (undefined / null) still means "any version" (back-compat for a manifest with no range)', (function () { try { return PR.satisfies('1.0.0', undefined) === true && PR.satisfies('1.0.0', null) === true; } catch (e) { return false; } })());

  say('\n── P3: every single-comparator range that worked still works (grid vs a plain numeric oracle) ──');
  var VS = ['0.0.0', '0.9.0', '0.9.9', '0.10.0', '1.0.0', '1.0.1', '1.2.0', '1.10.0', '2.0.0', '10.0.0'], OPS = ['>=', '>', '<=', '<', '=', ''], BASE = ['0.9.0', '1.0.0', '1.2.0'], diff = [], n3 = 0;
  var num = function (v) { return v.split('.').map(Number); }, cmp = function (a, b) { var x = num(a), y = num(b); for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  VS.forEach(function (v) { OPS.forEach(function (op) { BASE.forEach(function (b) { n3++; var c = cmp(v, b), want = op === '>=' ? c >= 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '<' ? c < 0 : c === 0, got; try { got = PR.satisfies(v, op + b); } catch (e) { got = 'THROW'; } if (got !== want) diff.push(v + ' ' + op + b); }); }); });
  check('P3', n3 + ' version x comparator x bound cases agree with the oracle, plus "*"', diff.length === 0 && PR.satisfies('3.1.4', '*') === true, diff.length ? 'differ: ' + diff.slice(0, 5).join('; ') : 'all');

  say('\n── P4: install / start with real ranges ──');
  var reg = PR.create({ engineVersion: '0.10.0' });
  var eBadVer = await rejects(reg.installBundle(mk('bad.ver', 'abc')));
  var eBadReq = await rejects(reg.installBundle(mk('bad.req', '1.0.0', { requires: { dep: '[1.2,' } })));
  var eBadEng = await rejects(reg.installBundle(mk('bad.eng', '1.0.0', { engineVersion: '>=banana' })));
  check('P4', 'a malformed plugin version, a malformed `requires` range and a malformed engineVersion are each a CLEAR install error naming the plugin', !!eBadVer && !!eBadReq && !!eBadEng && /bad\.ver/.test(eBadVer) && /bad\.req/.test(eBadReq) && /bad\.eng/.test(eBadEng), [eBadVer, eBadReq, eBadEng].map(function (e) { return String(e).slice(0, 70); }).join(' | '));
  var reg2 = PR.create({ engineVersion: '0.10.0' });
  await reg2.installBundle(mk('dep.ok', '1.5.0')); await reg2.installBundle(mk('app.ok', '1.0.0', { requires: { 'dep.ok': '[1.2,2)' } }));
  await reg2.startBundle('dep.ok'); var sOk = await rejects(reg2.startBundle('app.ok'));
  check('P4', 'a plugin requiring dep@[1.2,2) starts against dep 1.5.0', sOk === null, String(sOk));
  var reg3 = PR.create({ engineVersion: '0.10.0' });
  await reg3.installBundle(mk('dep.new', '2.0.0')); await reg3.installBundle(mk('app.no', '1.0.0', { requires: { 'dep.new': '[1.2,2)' } }));
  await reg3.startBundle('dep.new'); var sNo = await rejects(reg3.startBundle('app.no'));
  check('P4', 'the same plugin is REFUSED against dep 2.0.0 with the range in the message (was: judged as "= 0.0.0")', !!sNo && /dep\.new@\[1\.2,2\)/.test(sNo) && /2\.0\.0/.test(sNo), String(sNo).slice(0, 110));
  var reg4 = PR.create({ engineVersion: '0.10.0' }), eEng = await rejects(reg4.installBundle(mk('eng.no', '1.0.0', { engineVersion: '[1.0,2)' })));
  check('P4', 'engineVersion accepts an interval too: "[1.0,2)" is refused for engine 0.10.0 with the engine message', !!eEng && /requires engine/.test(eEng), String(eEng).slice(0, 90));

  say('\n── P5: resolveDeps with intervals ──');
  var order = null; try { order = PR.resolveDeps([{ id: 'a', version: '1.0.0', requires: { b: '[1,2)' } }, { id: 'b', version: '1.5.0', requires: {} }]); } catch (e) { order = ['THROW ' + e.message]; }
  var conflict = null; try { PR.resolveDeps([{ id: 'a', version: '1.0.0', requires: { b: '[1,2)' } }, { id: 'c', version: '1.0.0', requires: { b: '[2,3)' } }, { id: 'b', version: '1.5.0', requires: {} }]); } catch (e) { conflict = e.message; }
  check('P5', 'resolveDeps orders dependency-first for an interval and REFUSES the diamond (a needs b@[1,2), c needs b@[2,3)) naming the range', order.join() === 'b,a' && !!conflict && /\[2,3\)/.test(conflict), order.join() + ' | ' + String(conflict).slice(0, 90));

  say('\n── P6: a resolveDeps failure that restore() swallows is LOGGED ──');
  var lines = []; console.log = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  var reg5 = PR.create({ engineVersion: '0.10.0' }), res5;
  try { res5 = await reg5.restore([{ id: 'p.a', bundle: mk('p.a', '1.0.0', { requires: { 'p.b': '[2,3)' } }), state: 'ACTIVE' }, { id: 'p.b', bundle: mk('p.b', '1.0.0'), state: 'ACTIVE' }]); } finally { console.log = _log; }
  var rl = lines.filter(function (l) { return l.indexOf('§PLUGIN_RESOLVE_FAILED') === 0; });
  check('P6', 'restore() with a conflicting saved set prints §PLUGIN_RESOLVE_FAILED naming the conflict (it used to swallow it silently), and still returns without throwing', rl.length === 1 && /version conflict/.test(rl[0]) && /p\.a requires p\.b@\[2,3\)/.test(rl[0]) && !!res5, rl.join(' || ').slice(0, 160) + ' | restore=' + JSON.stringify(res5 && { s: res5.started, f: res5.failed.length }));

  say('\n── P7: every SHIPPED manifest still parses under the strict rules ──');
  var dir = path.join(ERP, 'plugins'), files = fs.readdirSync(dir).filter(function (f) { return /\.mjs$/.test(f); }), nM = 0, badM = [];
  var V = require(path.join(ERP, '..', 'common', 'comm', 'semver_strict.js'));
  files.forEach(function (f) { var src = fs.readFileSync(path.join(dir, f), 'utf8'), mi = src.search(/manifest\s*=\s*\{/); if (mi < 0) return; var blk = src.slice(mi, mi + 1500), v = /version\s*:\s*'([^']*)'/.exec(blk), ev = /engineVersion\s*:\s*'([^']*)'/.exec(blk);
    nM++; try { if (!v) throw new Error('no version'); V.parse(v[1]); if (ev) V.parseRange(ev[1]); var rq = /requires\s*:\s*\{([^}]*)\}/.exec(blk); if (rq) rq[1].split(',').forEach(function (kv) { var m = /:\s*'([^']*)'/.exec(kv); if (m) V.parseRange(m[1]); }); } catch (e) { badM.push(f + ': ' + e.message); } });
  if (nM === 0) say('   ❓ P7 INCONCLUSIVE: no shipped manifest was found to judge');
  check('P7', nM + ' shipped plugin manifests (erp/plugins/*.mjs) have a strictly valid version, engineVersion and requires', nM > 0 && badM.length === 0, badM.length ? badM.join('; ') : nM + ' parsed');

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k].bad > 0; });
  _log('§PS_ARMS red=' + (red.join(',') || 'none') + ' judged=' + JUDGED);
  if (ONLY) process.exit(red.length ? 1 : 0);
  var muts = [];
  if (!process.env.PS_NO_MUTANTS && !process.env.PS_REGISTRY) {
    var src = fs.readFileSync(REG, 'utf8'), lib = fs.readFileSync(path.join(ERP, '..', 'common', 'comm', 'semver_strict.js'), 'utf8');
    var M = [
      ['satisfies reads a malformed range as exact 0.0.0 again', "function satisfies(version, range) { return V.satisfies(version, range == null ? '*' : range); }", "function satisfies(version, range) { try { return V.satisfies(version, range == null ? '*' : range); } catch (e) { return false; } }", ['P2']],
      ['validateManifest does not parse the declared versions', "try { V.parse(mf.version); if (mf.engineVersion)", "try { if (false) V.parse(mf.version); if (false && mf.engineVersion)", ['P4']],
      ['the resolveDeps failure is swallowed silently again', "try { console.log('§PLUGIN_RESOLVE_FAILED ' + (e && e.message)", "try { void ('§PLUGIN_RESOLVE_FAILED ' + (e && e.message)", ['P6']],
      ['an absent range throws instead of meaning any', "return V.satisfies(version, range == null ? '*' : range); }\n", "return V.satisfies(version, range); }\n", ['P2']]];
    M.forEach(function (m) {
      if (src.split(m[1]).length !== 2) { muts.push({ name: m[0], error: 'anchor not found exactly once' }); return; }
      var mutated = src.replace(m[1], function () { return m[2]; }); if (mutated === src) { muts.push({ name: m[0], error: 'not applied' }); return; }
      var d = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-mut-')); fs.mkdirSync(path.join(d, 'erp')); fs.mkdirSync(path.join(d, 'common', 'comm'), { recursive: true });       // a COPY with its sibling library
      fs.writeFileSync(path.join(d, 'erp', 'plugin_registry.js'), mutated); fs.writeFileSync(path.join(d, 'common', 'comm', 'semver_strict.js'), lib); fs.copyFileSync(path.join(ERP, 'layered_registry.js'), path.join(d, 'erp', 'layered_registry.js'));
      var k = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, { PS_ONLY_ARMS: '1', PS_NO_MUTANTS: '1', PS_REGISTRY: path.join(d, 'erp', 'plugin_registry.js') }) });
      fs.rmSync(d, { recursive: true, force: true }); var mm = /§PS_ARMS red=(\S+)/.exec(k.stdout || '');
      muts.push({ name: m[0], expect: m[3], red: mm ? (mm[1] === 'none' ? [] : mm[1].split(',')) : ['CRASH'] });
    });
    _log('\n§PS_MUTANTS');
    muts.forEach(function (m) { var ok = !m.error && m.red.indexOf('CRASH') === -1 && m.expect.every(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) FAILS++;
      _log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || ('red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected ' + m.expect.join('/') + ')'))); });
  }
  var killed = muts.filter(function (m) { return !m.error && m.red.length > 0 && m.red.indexOf('CRASH') === -1; }).length;
  _log('§PS_VERDICT ' + (FAILS ? 'FAIL' : 'PASS') + ' judged=' + JUDGED + ' fails=' + FAILS + (muts.length ? ' mutants_killed=' + killed + '/' + muts.length : ' mutants=skipped'));
  process.exit(FAILS ? 1 : 0);
})().catch(function (e) { console.log = _log; _log('§PS_CRASH ' + (e && e.stack || e)); process.exit(2); });
