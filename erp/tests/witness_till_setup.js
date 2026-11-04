#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-SETUP (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §29.1, §29.D.1, §32.2). READ THE LOG (/tmp/rest_logs/setup.log): exit code is not evidence.
// THE ISSUE: the till had no Configuration screen and the mode was URL-only. Real till page: (1) exactly 49 keys, none of the 52 hardware keys; (2) every DEVICE key round-trips through Save + page reload;
// (3) the C_POS keys come from C_POS, not the device store (a planted device value is ignored, the input is read-only); (4) the mode switch changes the bag after a reload.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
var V = { j: 0, f: 0 }; function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §SETUP_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var MUT = process.env.SETUP_MUT || '', MUTS = { 'cpos-from-device': ["if (sc.indexOf('cpos:') === 0) {", "if (false) {"] };
var srv = http.createServer(function (q, r) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (MUT && p.endsWith('/till_setup.js')) { var src = fs.readFileSync(p, 'utf8'), m = MUTS[MUT]; console.log('§SETUP_MUT ' + MUT + ' applied=' + (src.split(m[0]).length - 1)); r.setHeader('Content-Type', 'text/javascript'); return r.end(src.replace(m[0], m[1])); } if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(r); });
srv.listen(0, async function () {
  var pw; try { pw = require('playwright'); } catch (e) { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); }
  var b = await pw.chromium.launch(), ctx = await b.newContext(), pg = await ctx.newPage(), base = 'http://localhost:' + srv.address().port + '/erp/till.html';
  pg.on('console', function (m) { var t = m.text(); if (/§TILL_SETUP|🔴/.test(t)) console.log(t.slice(0, 200)); }); pg.on('pageerror', function (e) { console.log('PAGEERR ' + e.message.slice(0, 200)); });
  console.log('═══ W-TILL-SETUP ═══');
  async function boot(qs) { await pg.goto(base + (qs || ''), { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready && window.TillSetup', null, { timeout: 170000 }); }
  async function login() { await pg.click('#u1 .u-user:has-text("GardenAdmin")'); }
  await boot(); await login();
  var keys = await pg.evaluate(function () { return TillSetup.keys.map(function (k) { return { key: k[1], scope: k[5], type: k[3], def: k[4] }; }); });
  var hw = ['payment.magcardreader', 'payment.gateway', 'machine.printer', 'machine.display', 'machine.scale', 'machine.scanner', 'db.URL', 'swing.defaultlaf', 'machine.screenmode', 'erp.URL'];
  check(keys.length === 50, 'exactly 50 keys: the 49 applicable (§29.1) + ui.theme Look and Feel (§36.3)', 'n=' + keys.length); check(!keys.some(function (k) { return hw.indexOf(k.key) >= 0; }), 'no hardware / Swing / DB key is shown');
  var dev = keys.filter(function (k) { return k.scope === 'device'; }); if (!dev.length) { console.log('§SETUP_VERDICT INCONCLUSIVE no device keys'); process.exit(2); }
  await pg.click('#cfg-open'); await pg.waitForSelector('#setup #cfg-tabs button');
  // set each device key on its own tab, save, reload, read back
  var want = {}; dev.forEach(function (k, i) { want[k.key] = k.type === 'bool' ? !k.def : k.type === 'num' ? 7 + i : k.type === 'mode' ? 'simple' : k.type === 'theme' ? 'modern' : 'v' + i; });
  var tabs = await pg.$$eval('#cfg-tabs button', function (b) { return b.map(function (x) { return x.getAttribute('data-cfg-tab'); }); });
  for (var t of tabs) { await pg.click('#cfg-tabs [data-cfg-tab="' + t + '"]'); await pg.evaluate(function (w) { document.querySelectorAll('#cfg-body [data-key]:not([disabled])').forEach(function (e) { var k = e.getAttribute('data-key'); if (!(k in w) || k === 'machine.ticketsbag') return; if (e.type === 'checkbox') e.checked = w[k]; else e.value = w[k]; }); }, want); await pg.click('#cfg-save'); }
  await boot('?mode=standard'); await login();   // ?mode= given: the URL wins for the mode, every other key is read back from the device store
  var got = await pg.evaluate(function () { return TillSetup.bag(); }); var bad = dev.filter(function (k) { return k.key !== 'machine.ticketsbag' && JSON.stringify(got[k.key]) !== JSON.stringify(want[k.key]) && !(k.type === 'num' && Number(got[k.key]) === want[k.key]); });
  check(bad.length === 0, 'each of ' + (dev.length - 1) + ' device keys survives Save + reload', bad.length ? 'lost=' + bad.map(function (k) { return k.key + ':' + JSON.stringify(got[k.key]); }).join(',') : '');
  // C_POS keys: a planted device value must not win
  var cp = await pg.evaluate(async function () { Till.engine().__idmpDb.run("UPDATE c_pos SET autologoutdelay=45, ismodifyprice='Y'"); Till.state().store.setup['till.autotimer'] = 999; Till.state().store.setup['db.prodpriceupdate'] = true; TillSetup.render.tab = 'S'; await TillSetup.render(); var a = document.querySelector('#cfg-body [data-key="till.autotimer"]'), p = document.querySelector('#cfg-body [data-key="db.prodpriceupdate"]'); var r = (await Till.rows('SELECT autologoutdelay AS a, ismodifyprice AS m FROM c_pos LIMIT 1'))[0] || {}; return { shown: a && a.value, ro: a && a.disabled, cposA: r.a, pshown: p && p.checked, pro: p && p.disabled, cposM: r.m }; });
  check(cp.ro && cp.pro && String(cp.shown) !== '999' && String(cp.shown) === '45' && String(cp.cposA) === '45', 'till.autotimer comes from C_POS.AutoLogoutDelay, not the device (planted 999 ignored, read-only)', JSON.stringify(cp));
  check(cp.pshown === true && cp.cposM === 'Y', 'db.prodpriceupdate comes from C_POS.IsModifyPrice, not the device', 'shown=' + cp.pshown + ' cpos=' + cp.cposM);
  // mode switch
  async function modeAfter(m) { await pg.evaluate(function (m2) { Till.state().store.setup['machine.ticketsbag'] = m2; Till.persist(); Till.state(); localStorage.length; }, m); await pg.evaluate(function () { }); await boot(); await login(); return pg.evaluate(function () { return { mode: Till.state().mode, body: document.body.getAttribute('data-mode'), bag: !document.querySelector('#bag').hidden, floorbar: !document.querySelector('#floorbar').hidden }; }); }
  var simple = await modeAfter('simple'), rest = await modeAfter('restaurant'), std = await modeAfter('standard');
  check(simple.mode === 'simple' && !simple.bag && !simple.floorbar, 'mode simple: no shared-ticket bag, no floor bar', JSON.stringify(simple));
  check(rest.mode === 'restaurant' && !rest.bag && rest.floorbar, 'mode restaurant: floor bar, no bag', JSON.stringify(rest));
  check(std.mode === 'standard' && std.bag && !std.floorbar, 'mode standard: the bag', JSON.stringify(std));
  console.log('§SETUP_VERDICT ' + (V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f);
  await b.close(); srv.close(); process.exit(V.j && !V.f ? 0 : 1);
});
