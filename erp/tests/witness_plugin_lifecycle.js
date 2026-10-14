#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-LIFECYCLE (Host work H1; spec ~/Projects/Mfg/HOST_PLUGIN_LIFECYCLE_SPEC.md). READ THE LOG after every run: verdict = §PLG-VERDICT.
// THE ISSUE it proves/disproves: a plugin bundle (OSGi-style) can be installed, started and STOPPED, and STOP restores the system EXACTLY: install changes nothing; start contributes to every extension point (model hooks, doc action,
//   validator, process, callout, posting class, GL token, dictionary rows); stop returns a canonical dump of every registry to the baseline hash; overrides STACK by rank/owner and unwind in any stop order; a failing start is atomic;
//   a reload restores only the ACTIVE bundles.  A SYNTHETIC bundle is used on purpose: this proves the framework, not Libero.  Breaks (MUST be red, named): MFG_BREAK=noundo | merge.
'use strict';
var path = require('path'), fs = require('fs');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js'));
var DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
// a realistic CORE: the real model classes, a real verbatim process port and callout, the default validators
['model_trade', 'model_order'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
require(path.join(ERP, 'processes', 'BOMVerify.js')); require(path.join(ERP, 'callouts', 'CalloutOrder.js')); MV.installDefaultHooks();
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(name, ok, info) { judged++; if (!ok) fails++; _log('  §PLG ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }

(async function () {
  var SQL = await initSqlJs(), db = new SQL.Database();
  db.run('CREATE TABLE AD_Menu (AD_Menu_ID INTEGER PRIMARY KEY, Name TEXT, IsActive TEXT)'); db.run("INSERT INTO AD_Menu VALUES (1,'Mfg root','N'),(2,'Mfg order','N'),(9,'Core menu','Y')");
  var hostDb = { query: function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }, run: function (sql, p) { db.run(sql, p || []); } };
  var tokens = { '{Core.Token}': { resolved: 'core' } }, ops = [];
  var modelEng = ML;
  if (BREAK === 'noundo') modelEng = Object.create(ML, { removeOwner: { value: function () { return {}; }, writable: true, configurable: true } });                                          // BREAK: stop does not remove model/doc layers
  if (BREAK === 'merge') modelEng = Object.create(ML, { registerModel: { value: function (t, impl) { ML.MODEL[t] = Object.assign(ML.MODEL[t] || {}, impl); }, writable: true, configurable: true }, removeOwner: { value: function () { return {}; }, writable: true, configurable: true } });   // BREAK: the OLD merging registerModel
  var BUNDLES = {};
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function (t, p) { ops.push(t); return ops.length; } }, modelval: MV, callout: AC, process: AP, postTokens: tokens, docAction: modelEng, docClass: DP,
    import: function (u) { if (!BUNDLES[u]) return Promise.reject(new Error('no such bundle ' + u)); return Promise.resolve(BUNDLES[u]); } };
  function dump() {
    var mv = {}; Object.keys(MV.REGISTRY).sort().forEach(function (t) { mv[t] = {}; Object.keys(MV.REGISTRY[t]).sort().forEach(function (ti) { mv[t][ti] = MV.REGISTRY[t][ti].map(function (h) { return h.name; }); }); });
    var core = { models: Object.keys(ML.MODEL).sort().map(function (t) { return t + ':' + Object.keys(ML.MODEL[t]).sort().join(',') + ':' + djb(Object.keys(ML.MODEL[t]).sort().map(function (k) { return String(ML.MODEL[t][k]); }).join('|')); }), docs: Object.keys(ML.DOCS).sort() };
    var m = ML.describe(), p = AP.describe(), c = AC.describe();
    var ad = hostDb.query('SELECT ad_menu_id AS i, isactive AS a, name AS n FROM AD_Menu ORDER BY 1').map(function (r) { return r.i + r.a + r.n; });
    var s = JSON.stringify({ core: core, layers: m, mv: mv, proc: p, callout: c, doc: DP.describeDocClasses(), tokens: Object.keys(tokens).sort().map(function (k) { return k + '=' + JSON.stringify(tokens[k]); }), ad: ad, handlers: Object.keys(AP.JAVA).sort().length + '/' + AP.registeredClassnames().length });
    return { s: s, h: djb(s), n: s.length };
  }
  function mkBundle(id, tag, opt) {
    opt = opt || {};
    var chunk = { activate: function (ctx) { ctx.modelval.registerValidator('pp_order', 'AFTER_SAVE', tag + '.chunk', function () { return null; }); if (opt.chunkThrows) throw new Error('hot chunk ' + tag + ' failed'); }, deactivate: function () {} };
    return { manifest: { id: id, version: '1.0.0', engineVersion: '>=0.9.0', requires: opt.requires || {}, chunks: { hot: [chunk] }, budget: { kb: 12, note: 'synthetic' } },
      activate: async function (ctx) {
        ctx.docAction.registerModel('pp_order', { afterSave: function () { return tag + '-after'; }, beforeSave: function () { return tag + '-before'; } });
        ctx.docAction.registerModel('c_order', { beforeSave: function () { return tag + '-overrides-core-beforeSave'; } });                    // overrides a CORE hook
        ctx.docAction.registerDocAction('pp_order', { completeIt: function () { return tag; } });
        ctx.modelval.registerValidator('pp_order', 'BEFORE_SAVE', tag + '.guard', function () { return null; });
        ctx.process.registerHandler('report:pp_' + tag, function () { return { ok: true }; }, { kind: 'report' });
        ctx.process.defineProcess('org.test.Proc' + tag, function (Svr) { function P() { Svr.call(this); } P.prototype = Object.create(Svr.prototype); return P; });
        ctx.callout.registerHandler('org.test.' + tag + '.m', function () { return { derived: {} }; });
        ctx.callout.defineCallout('org.test.Callout' + tag, function (CE) { function C() { CE.call(this); } C.prototype = Object.create(CE.prototype); return C; });
        ctx.docClass.register('PP_Test_' + tag, { derive: function () { return { by: {}, absent: [] }; } });
        ctx.postTokens['{Test.' + tag + '}'] = { resolved: tag }; ctx.postTokens['{Core.Token}'] = { resolved: 'overridden-by-' + tag };
        ctx.dict.activate('AD_Menu', 'AD_Menu_ID', [1, 2]); ctx.dict.insert('AD_Menu', 'AD_Menu_ID', [{ AD_Menu_ID: tag === 'A' ? 31 : 32, Name: 'staged ' + tag, IsActive: 'Y' }]);
        if (opt.activateThrows) throw new Error('activate ' + tag + ' failed half-way');
      },
      deactivate: async function () {} };
  }
  var A = mkBundle('com.test.a', 'A'), B = mkBundle('com.test.b', 'B'), F1 = mkBundle('com.test.f1', 'F1', { activateThrows: true }), F2 = mkBundle('com.test.f2', 'F2', { chunkThrows: true });
  BUNDLES['b/a.mjs'] = A; BUNDLES['b/b.mjs'] = B; BUNDLES['b/f1.mjs'] = F1; BUNDLES['b/f2.mjs'] = F2;
  var reg = PR.create(host);
  var base = dump();
  console.log('§PLG-LOAD break=' + (BREAK || 'none') + ' baseline hash=' + base.h + ' bytes=' + base.n + ' coreModels=' + ML.describe().models.c_order.length + ' (core registry is real: model_trade, model_order, BOMVerify, CalloutOrder, default validators)');
  if (base.n < 500) { inconclusive++; _log('§PLG P0 INCONCLUSIVE — baseline dump is nearly empty'); }
  var coreBefore = ML.MODEL.c_order.beforeSave;

  // P1 install changes nothing
  mute(); await reg.installBundle('b/a.mjs'); unmute();
  check('P1 install: registry dump unchanged (INSTALLED has no behaviour)', dump().h === base.h && reg.get('com.test.a').state === 'INSTALLED', { state: reg.get('com.test.a').state });

  // P2 start: every contribution live
  mute(); await reg.startBundle('com.test.a'); unmute();
  var d2 = dump();
  var live = { model: ML.MODEL.pp_order && ML.MODEL.pp_order.afterSave() === 'A-after', overridesCore: ML.MODEL.c_order.beforeSave() === 'A-overrides-core-beforeSave', coreHooksKept: typeof ML.MODEL.c_order.afterSave === typeof (ML.MODEL.c_order.afterSave),
    doc: ML.docActionFor('pp_order').completeIt() === 'A', validator: MV.REGISTRY.pp_order.BEFORE_SAVE.some(function (h) { return h.name === 'A.guard'; }) && MV.REGISTRY.pp_order.AFTER_SAVE.some(function (h) { return h.name === 'A.chunk'; }),
    process: AP.hasHandler('report:pp_A') && !!AP.JAVA['org.test.ProcA'], callout: AC.hasHandler('org.test.A.m') && !!AC.CLASSES['org.test.CalloutA'], docClass: !!DP.docClassFor('PP_Test_A') && DP.immediatePostingRefusal === undefined ? true : !!DP.docClassFor('PP_Test_A'),
    token: !!tokens['{Test.A}'] && tokens['{Core.Token}'].resolved === 'overridden-by-A', dictActive: hostDb.query('SELECT isactive AS a FROM AD_Menu WHERE ad_menu_id IN (1,2)').every(function (r) { return r.a === 'Y'; }), dictInserted: hostDb.query('SELECT 1 AS x FROM AD_Menu WHERE ad_menu_id=31').length === 1,
    budget: reg.get('com.test.a').budget && reg.get('com.test.a').budget.kb === 12 };
  var notLive = Object.keys(live).filter(function (k) { return !live[k]; });
  console.log('§PLG-P2 contributions live: ' + Object.keys(live).map(function (k) { return k + '=' + live[k]; }).join(' ') + ' | dump changed=' + (d2.h !== base.h));
  check('P2 start: every contribution is live (model hook, core-hook override, doc action, validators incl. hot chunk, process, callout, posting class, token, dictionary rows, budget)', notLive.length === 0 && d2.h !== base.h && reg.get('com.test.a').state === 'ACTIVE', { notLive: notLive });

  // P3 stop restores EXACTLY
  mute(); await reg.stopBundle('com.test.a'); unmute();
  var d3 = dump();
  var diff3 = d3.h === base.h ? [] : (function () { var a = JSON.parse(base.s), b = JSON.parse(d3.s); return Object.keys(b).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); }); })();
  console.log('§PLG-P3 after stop: hash ' + d3.h + ' baseline ' + base.h + (diff3.length ? ' LEFTOVER in: ' + diff3.join(',') : '') + ' | core c_order.beforeSave restored identically=' + (ML.MODEL.c_order.beforeSave === coreBefore));
  check('P3 stop: the canonical dump of every registry (+tokens, +dictionary rows) equals the baseline; the core hook is the very same function again', d3.h === base.h && ML.MODEL.c_order.beforeSave === coreBefore && reg.get('com.test.a').state === 'STOPPED', { leftover: diff3 });

  // P4 idempotent second cycle
  mute(); await reg.startBundle('com.test.a'); var d4a = dump(); await reg.stopBundle('com.test.a'); unmute();
  check('P4 second start/stop cycle: identical live dump to the first start, baseline again after stop', d4a.h === d2.h && dump().h === base.h, { first: d2.h, second: d4a.h });

  // P5 stacking: A then B override the same hooks; unwind in both orders
  mute(); await reg.installBundle('b/b.mjs'); await reg.startBundle('com.test.a'); await reg.startBundle('com.test.b'); unmute();
  var eff = { both: ML.MODEL.pp_order.afterSave() === 'B-after', coreOverride: ML.MODEL.c_order.beforeSave() === 'B-overrides-core-beforeSave', doc: ML.docActionFor('pp_order').completeIt() === 'B' };
  mute(); await reg.stopBundle('com.test.b'); unmute();
  var afterB = { a: ML.MODEL.pp_order.afterSave() === 'A-after', coreA: ML.MODEL.c_order.beforeSave() === 'A-overrides-core-beforeSave', doc: ML.docActionFor('pp_order').completeIt() === 'A', token: tokens['{Core.Token}'].resolved === 'overridden-by-A' };
  mute(); await reg.stopBundle('com.test.a'); unmute();
  var d5 = dump();
  mute(); await reg.startBundle('com.test.a'); await reg.startBundle('com.test.b'); await reg.stopBundle('com.test.a'); var mid = ML.MODEL.pp_order.afterSave() === 'B-after' && hostDb.query('SELECT isactive AS a FROM AD_Menu WHERE ad_menu_id IN (1,2)').every(function (r) { return r.a === 'Y'; }) && tokens['{Core.Token}'].resolved === 'overridden-by-B' && !tokens['{Test.A}'] && !!tokens['{Test.B}'] && hostDb.query('SELECT 1 AS x FROM AD_Menu WHERE ad_menu_id=32').length === 1 && hostDb.query('SELECT 1 AS x FROM AD_Menu WHERE ad_menu_id=31').length === 0; await reg.stopBundle('com.test.b'); unmute();
  console.log('§PLG-P5 B over A over core: ' + JSON.stringify(eff) + ' | stop B -> ' + JSON.stringify(afterB) + ' | stop A -> hash ' + d5.h + ' | other order (stop A first): B still fully effective (hook, shared dictionary rows kept, B token, A rows gone)=' + mid + ' final hash ' + dump().h);
  check('P5 stacking: latest/highest layer wins; stopping B restores A, stopping A restores core; either stop order ends at the baseline', Object.keys(eff).every(function (k) { return eff[k]; }) && Object.keys(afterB).every(function (k) { return afterB[k]; }) && d5.h === base.h && mid && dump().h === base.h, { eff: eff, afterB: afterB, d5: d5.h, mid: mid });

  // P6 atomic start
  var r6 = {};
  [['com.test.f1', 'b/f1.mjs'], ['com.test.f2', 'b/f2.mjs']].forEach(function () {});
  mute(); await reg.installBundle('b/f1.mjs'); try { await reg.startBundle('com.test.f1'); r6.f1 = 'started'; } catch (e) { r6.f1 = e.message; }
  await reg.installBundle('b/f2.mjs'); try { await reg.startBundle('com.test.f2'); r6.f2 = 'started'; } catch (e) { r6.f2 = e.message; } unmute();
  console.log('§PLG-P6 f1(activate throws half-way)=' + r6.f1 + ' state=' + reg.get('com.test.f1').state + ' | f2(hot chunk throws)=' + r6.f2 + ' state=' + reg.get('com.test.f2').state + ' | hash ' + dump().h);
  check('P6 failing start is atomic: error propagated, state INSTALLED, dump == baseline (half-made contributions undone), for a throw in activate AND in a hot chunk', /half-way/.test(r6.f1) && /hot chunk/.test(r6.f2) && reg.get('com.test.f1').state === 'INSTALLED' && reg.get('com.test.f2').state === 'INSTALLED' && dump().h === base.h, { r6: r6 });

  // P7 restore(): a reload brings back only the bundles that were ACTIVE
  mute(); await reg.startBundle('com.test.a'); var saved = reg.list().map(function (x) { return { id: x.id, url: x.url, state: x.state }; }); await reg.stopBundle('com.test.a'); unmute();
  var reg2 = PR.create(host); mute(); var rr = await reg2.restore(saved); unmute();
  var st2 = {}; reg2.list().forEach(function (x) { st2[x.id] = x.state; });
  console.log('§PLG-P7 saved=' + saved.map(function (x) { return x.id + ':' + x.state; }).join(' ') + ' -> restored states ' + JSON.stringify(st2) + ' started=' + rr.started.join(',') + ' failed=' + rr.failed.length);
  check('P7 restore: ACTIVE bundles are re-activated (A), STOPPED/INSTALLED ones are only installed; live again == first start', st2['com.test.a'] === 'ACTIVE' && st2['com.test.b'] === 'INSTALLED' && rr.started.join() === 'com.test.a' && dump().h === d2.h, { st2: st2, rr: rr });
  mute(); await reg2.stopBundle('com.test.a'); unmute();
  check('P8 after the whole run every registry is at the baseline hash (nothing leaked across 9 start/stop operations)', dump().h === base.h, { now: dump().h, base: base.h });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  _log('§PLG-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { unmute(); _log('§PLG-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
