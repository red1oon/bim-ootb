#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-ROLE (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §41.1 "Plugins & Releases console — DECIDED", owner 2026-10-28: "User may see plugins but has no write rights. Read only."). READ THE LOG after every run:
//   every verdict is a §PLR line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged.
// THE ISSUE: any logged-in role could install, start, stop and remove plugin bundles (a foreign module that registers validators, processes, dictionary rows). The owner decided: EVERY role may SEE the console read-only (name, version, state, signature
//   status: transparency for support and audit); only the System Administrator (AD_Role_ID 0) may write. The gate must sit in the REGISTRY'S write calls themselves (a button that is merely hidden is not a gate), every write is logged with who and what,
//   and the read-only view shows no plugin configuration values.
// SPEC (one real page, the System tenant and GardenWorld; every claim is read from the DOM, the registry and the §-log, never from a screenshot):
//   PLR0 PRECONDITION  fresh browser profile: the built-in bundle org.kernel.pos-integration is INSTALLED and not ACTIVE; the probe bundle org.test.role-probe is not installed.
//   PLR1 ADMIN WRITES  logged in as System / System (APP.roleId 0): Plugins & Releases shows the write controls (Install/Update, per-row start/stop/refresh/uninstall: positive control, so "no control for 102" is not vacuous); Install by URL through the console
//                      installs and starts the probe; Stop then Start through the row icons work; the registry says ACTIVE; and every write is logged `§PLUGIN-ROLE ok role=0 user=<APP.actor> action=<install|start|stop> bundle=org.test.role-probe`.
//   PLR2 SAME LIST     the same page after switching to GardenWorld / GardenAdmin / role 102: the console lists the SAME rows as role 0 saw (id, name, version, status): the list is not hidden from a non-administrator.
//   PLR3 NO CONTROLS   as role 102: the console DOM holds 0 write controls (data-oc-installtoggle / doinstall / offer / start / stop / refresh / uninstall / pol) and the Plugin Engine card holds 0 (#pe-install, #pe-url, .pe-toggle, .pe-uninstall,
//                      .pe-policy, .pe-offer-install, #pe-tab-create); the same two views for role 0 hold > 0 of them.
//   PLR4 REGISTRY GATE as role 102: a DIRECT call of each registry write is refused with the System Administrator named - installBundle (a not yet installed bundle), startBundle (pos-integration), stopBundle (the probe), uninstallBundle (the probe), setPolicy -
//                      logs `§PLUGIN-ROLE refused role=102 action=<install|start|stop|remove|policy> bundle=<id or url>`, and CHANGES NOTHING: the registry list is identical before and after, the view i_possales was not created, the refused install imported
//                      no module (no §PLUGIN-INSTALL line for it).
//   PLR5 NO CONFIG     as role 102 the visible console text (detail pane of the probe opened) contains the bundle's name and version but NOT the probe manifest's configuration value nor the secret in its location URL's query string; for role 0 the Location
//                      line shows the full URL (positive control: the sentinel is detectable).
//   PLR6 BOOT RESTORE  a second page on the same profile logged in as role 102: the probe the administrator left ACTIVE is restored ACTIVE at boot (restoring persisted state is the host's act, not a user write) and that page logs no §PLUGIN-ROLE refused.
//   PLR7 REMOVE LOGGED back as System: Uninstall through the row icon removes the probe from the list and logs `§PLUGIN-ROLE ok role=0 user=<APP.actor> action=remove bundle=org.test.role-probe`.
//   PLR8 0 page errors on every page of the run.
// MUTANTS (PLR_MUTANTS=1; each served as an in-memory copy of the real file, applied exactly once or the child aborts as a CRASH, which is NOT a kill): gate only in the UI (registry authorize lets everyone through) -> PLR4 · gate absent
//   (registry open AND the console shows its controls) -> PLR3/PLR4 · the list hidden from non-administrators -> PLR2 · the boot restore goes through the gate -> PLR6 · the location URL shown whole to a read-only role -> PLR5.
// Run: node erp/tests/witness_plugin_role.js 2>&1 | tee /tmp/witness_plugin_role.log        (PLR_NO_MUT=1 skips the mutants; PLR_ONLY_ARMS=1 is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.PLR_ONLY_ARMS, MUT = process.env.PLR_MUT ? JSON.parse(process.env.PLR_MUT) : null;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function say(s) { if (!QUIET) console.log(s); }
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var BUNDLE = 'org.kernel.pos-integration', PROBE = 'org.test.role-probe', SENT_CFG = 'SENTINEL-CONFIG-VALUE-9f3a', SENT_URL = 'SENTINEL-URL-TOKEN-77';
var PROBE_SRC = "export const manifest = { id: '" + PROBE + "', name: 'Role probe', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, config: { apiKey: '" + SENT_CFG + "' } };\nexport async function activate(ctx) {}\nexport async function deactivate(ctx) {}\n";
var WRITE_CONSOLE = ['[data-oc-installtoggle]', '[data-oc-doinstall]', '[data-oc-offer]', '[data-oc-start]', '[data-oc-stop]', '[data-oc-refresh]', '[data-oc-uninstall]', '[data-oc-pol]'];
var WRITE_CARD = ['#pe-install', '#pe-url', '.pe-toggle', '.pe-uninstall', '.pe-policy', '.pe-offer-install', '#pe-tab-create'];

(async function () {
  say('═══ W-PLUGIN-ROLE — the Plugins & Releases console is read-only for every role; write only for the System Administrator (§41.1) ═══' + (MUT ? '  MUTANT=' + J(MUT.map(function (e) { return e.file.split('/').pop(); })) : '') + '\n');
  var cur = { over: {} };
  cur.over['/erp/plugins/zz_role_probe.mjs'] = PROBE_SRC;
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (cur.over[p] != null) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(cur.over[p]); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  if (MUT) MUT.forEach(function (e) {
    var orig = fs.readFileSync(path.join(ROOT, e.file), 'utf8'); if (orig.split(e.from).length !== 2) { console.log('§PLR_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + e.file + ' :: ' + e.from.slice(0, 60)); process.exit(2); }
    cur.over[e.file] = orig.replace(e.from, function () { return e.to; });
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  async function finishRun() { var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; }); console.log('§PLR_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged); await browser.close(); server.close(); return red; }

  async function openPage() {
    var pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
    await sleep(2500);                                                                                       // the built-in bundles install after boot (plugin_overlay _builtins)
    return { pg: pg, logs: logs, errs: errs };
  }
  async function firstLogin(pg, client, user, role) {
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    if (role != null) await pg.selectOption('#idmp-login-role', String(role));
    await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1500);
    return pg.evaluate(function () { return { role: window.APP.roleId, actor: window.APP.actor }; });
  }
  async function switchTo(pg, client, user, role) {
    await pg.click('#idmp-switch-btn'); await sleep(600);
    if (await pg.isVisible('#idmp-login-clients')) await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))");
    await pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    await pg.selectOption('#idmp-login-role', String(role)); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1500);
    return pg.evaluate(function () { return { role: window.APP.roleId, actor: window.APP.actor }; });
  }
  var regList = function (pg) { return pg.evaluate(function () { return window.PluginEngine._reg().list().map(function (b) { return b.id + '|' + b.version + '|' + b.state + '|' + (b.policy || ''); }).sort(); }); };
  var stateOf = function (pg, id) { return pg.evaluate(function (i) { var b = window.PluginEngine._reg().list().filter(function (x) { return x.id === i; })[0]; return b ? b.state : null; }, id); };
  var openConsole = async function (pg) { await pg.evaluate(function () { window.PluginRelease.close(); window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await sleep(500); };
  var consoleRows = function (pg) { return pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)'), function (tr) { return Array.prototype.map.call(tr.querySelectorAll(':scope > td:not(.oc-act)'), function (td) { return td.innerText.replace(/\s+/g, ' ').trim(); }).join(' | '); }); }); };
  var count = function (pg, sels) { return pg.evaluate(function (ss) { return ss.map(function (s) { return [s, document.querySelectorAll(s).length]; }); }, sels); };
  var sum = function (pairs) { return pairs.reduce(function (a, p) { return a + p[1]; }, 0); };
  var openProbeDetail = async function (pg) { await pg.evaluate(function (nm) { var trs = Array.prototype.slice.call(document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr')), i = trs.findIndex(function (t) { return !t.classList.contains('oc-d') && t.innerText.indexOf(nm) >= 0; }); if (i >= 0 && !(trs[i + 1] && trs[i + 1].classList.contains('oc-d'))) trs[i].querySelector('a.oc-nm').click(); }, 'Role probe'); await sleep(400); };   // idempotent: the console remembers which detail panes are open
  var consoleText = function (pg) { return pg.evaluate(function () { return document.getElementById('pr-osgi').innerText; }); };
  var openCard = async function (pg) { await pg.evaluate(function () { var c = document.getElementById('pe-ov'); if (c) c.remove(); window.IdmpPillActions.plugin(); }); await sleep(1200); };
  var roleLines = function (logs, re) { return logs.filter(function (l) { return l.indexOf('§PLUGIN-ROLE ') === 0 && re.test(l); }); };

  var P = await openPage(), pg = P.pg, logs = P.logs;
  var url = base + '/erp/plugins/zz_role_probe.mjs?token=' + SENT_URL;

  // ───────────────── PLR0 precondition ─────────────────
  say('§S0 fresh profile');
  var st0 = await stateOf(pg, BUNDLE), pr0 = await stateOf(pg, PROBE);
  verdict('PLR0', st0 === 'INSTALLED' && pr0 === null, 'fresh profile: ' + BUNDLE + ' is ' + st0 + ' (INSTALLED, not ACTIVE) and the probe ' + PROBE + ' is ' + pr0 + ' (not installed)', J({ st0: st0, pr0: pr0 }));

  // ───────────────── PLR1 the System Administrator writes ─────────────────
  say('§S1 System Administrator: install + start + stop + start through the console');
  var a0 = await firstLogin(pg, 'System', 'System');
  await openConsole(pg);
  var ctl0 = await count(pg, WRITE_CONSOLE);
  await pg.click('[data-oc-installtoggle]'); await pg.fill('[data-oc-url]', url); var n1 = logs.length; await pg.click('[data-oc-doinstall]'); await sleep(2500);
  var s1 = await stateOf(pg, PROBE);
  await pg.click('[data-oc-stop="' + PROBE + '"]'); await sleep(1500); var s2 = await stateOf(pg, PROBE);
  await pg.click('[data-oc-start="' + PROBE + '"]'); await sleep(1500); var s3 = await stateOf(pg, PROBE);
  var okLines = roleLines(logs.slice(n1), /^§PLUGIN-ROLE ok role=0 user=\S+ action=\S+ bundle=\S+$/);
  var want = ['install', 'start', 'stop', 'start'].map(function (a) { return '§PLUGIN-ROLE ok role=0 user=' + a0.actor + ' action=' + a + ' bundle=' + PROBE; });
  var gotOk = want.every(function (w) { return okLines.indexOf(w) >= 0; });
  await openProbeDetail(pg);
  var rows0 = await consoleRows(pg), text0 = await consoleText(pg), card0;
  verdict('PLR1', a0.role === 0 && sum(ctl0) > 0 && s1 === 'ACTIVE' && s2 === 'STOPPED' && s3 === 'ACTIVE' && gotOk,
    'as role ' + a0.role + ' (actor ' + a0.actor + '): the console shows ' + sum(ctl0) + ' write controls; install -> ' + s1 + ', stop -> ' + s2 + ', start -> ' + s3 + '; every write logged with who and what (' + okLines.length + ' ok lines)', J({ ctl0: ctl0, s: [s1, s2, s3], okLines: okLines }));
  await pg.evaluate(function () { window.PluginRelease.close(); });
  await openCard(pg); card0 = await count(pg, WRITE_CARD); await pg.evaluate(function () { var c = document.getElementById('pe-ov'); if (c) c.remove(); });

  // ───────────────── PLR2..PLR5 as role 102 ─────────────────
  say('§S2 GardenWorld Admin (role 102): same list, no controls, refused registry calls');
  var a1 = await switchTo(pg, 'GardenWorld', 'GardenAdmin', 102);
  await openConsole(pg); await openProbeDetail(pg);
  var rows1 = await consoleRows(pg), text1 = await consoleText(pg), ctl1 = await count(pg, WRITE_CONSOLE);
  verdict('PLR2', a1.role === 102 && rows0.length > 3 && J(rows1) === J(rows0), 'as role ' + a1.role + ' the console lists the same ' + rows1.length + ' rows as role 0 saw (' + rows0.length + ')', J({ same: J(rows1) === J(rows0), only0: rows0.filter(function (r) { return rows1.indexOf(r) < 0; }), only102: rows1.filter(function (r) { return rows0.indexOf(r) < 0; }) }));
  await pg.evaluate(function () { window.PluginRelease.close(); });
  await openCard(pg); var card1 = await count(pg, WRITE_CARD), cardRows1 = await pg.evaluate(function () { return document.querySelectorAll('#pe-list .pe-row').length; }); await pg.evaluate(function () { var c = document.getElementById('pe-ov'); if (c) c.remove(); });
  verdict('PLR3', sum(ctl1) === 0 && sum(card1) === 0 && sum(ctl0) > 0 && sum(card0) > 0 && cardRows1 > 0, 'role 102: ' + sum(ctl1) + ' write controls in the console and ' + sum(card1) + ' in the Plugin Engine card (which still lists ' + cardRows1 + ' bundles); role 0 had ' + sum(ctl0) + ' and ' + sum(card0), J({ ctl1: ctl1, card1: card1, ctl0: ctl0, card0: card0 }));

  var before = await regList(pg), viewBefore = await pg.evaluate(function () { var r = window.__idmpDb.exec("SELECT count(*) FROM sqlite_master WHERE name='i_possales'"); return r[0].values[0][0]; });
  var n2 = logs.length;
  var calls = await pg.evaluate(async function (a) {
    var reg = window.PluginEngine._reg(), out = {};
    async function t(name, fn) { try { await fn(); out[name] = { ok: true }; } catch (e) { out[name] = { ok: false, msg: String(e && e.message) }; } }
    await t('install', function () { return reg.installBundle(a.url2); });
    await t('start', function () { return reg.startBundle(a.bundle); });
    await t('stop', function () { return reg.stopBundle(a.probe); });
    await t('remove', function () { return reg.uninstallBundle(a.probe); });
    await t('policy', function () { return reg.setPolicy(a.probe, 'lazy'); });
    return out;
  }, { url2: base + '/erp/plugins/friendly_ops.mjs', bundle: BUNDLE, probe: PROBE });
  var after = await regList(pg), viewAfter = await pg.evaluate(function () { var r = window.__idmpDb.exec("SELECT count(*) FROM sqlite_master WHERE name='i_possales'"); return r[0].values[0][0]; });
  var refused = roleLines(logs.slice(n2), /^§PLUGIN-ROLE refused role=102 action=\S+ bundle=\S+$/), acts = ['install', 'start', 'stop', 'remove', 'policy'];
  var allRefused = acts.every(function (a) { return calls[a] && calls[a].ok === false && /System Administrator/.test(calls[a].msg || ''); });
  var allLogged = acts.every(function (a) { return refused.some(function (l) { return l.indexOf(' action=' + a + ' ') > 0; }); });
  var importedNothing = !logs.slice(n2).some(function (l) { return /^§PLUGIN-INSTALL id=org\.kernel\.friendly-ops/.test(l); });
  verdict('PLR4', allRefused && allLogged && J(before) === J(after) && viewBefore === viewAfter && importedNothing && before.length > 3,
    'role 102 direct registry calls: install/start/stop/remove/policy all refused naming the System Administrator (' + allRefused + '), each logged §PLUGIN-ROLE refused (' + allLogged + '), registry list unchanged (' + (J(before) === J(after)) + '), i_possales not created (' + viewBefore + '->' + viewAfter + '), the refused install imported no module (' + importedNothing + ')',
    J({ calls: calls, refused: refused, same: J(before) === J(after) }));

  var hasName = /Role probe/.test(text1) && /1\.0\.0/.test(text1);
  verdict('PLR5', hasName && text1.indexOf(SENT_CFG) < 0 && text1.indexOf(SENT_URL) < 0 && text0.indexOf(SENT_URL) >= 0 && text0.indexOf(SENT_CFG) < 0,
    'role 102 sees the bundle name and version (' + hasName + ') but not the configuration value (' + (text1.indexOf(SENT_CFG) < 0) + ') nor the secret in the location URL (' + (text1.indexOf(SENT_URL) < 0) + '); role 0 sees the whole location (positive control: ' + (text0.indexOf(SENT_URL) >= 0) + ')',
    J({ sample: (text1.match(/Location[^\n]*/) || [''])[0].slice(0, 160) }));

  // ───────────────── PLR6 boot restore for a non-administrator ─────────────────
  say('§S3 a second page on the same profile, logged in as role 102: the persisted state is restored at boot');
  var P2 = await openPage(); var a2 = await firstLogin(P2.pg, 'GardenWorld', 'GardenAdmin', 102);
  var rst = await stateOf(P2.pg, PROBE), refused2 = roleLines(P2.logs, /refused/);
  verdict('PLR6', a2.role === 102 && rst === 'ACTIVE' && refused2.length === 0, 'second page as role ' + a2.role + ': the probe the administrator left ACTIVE is restored ' + rst + ' at boot and no §PLUGIN-ROLE refused is logged (' + refused2.length + ')', J({ rst: rst, refused2: refused2 }));
  await P2.pg.close();

  // ───────────────── PLR7 remove, logged ─────────────────
  say('§S4 back to System: Uninstall through the row icon');
  var a3 = await switchTo(pg, 'System', 'System', 0); await openConsole(pg);
  var n3 = logs.length, hasIcon = !!(await pg.$('[data-oc-uninstall="' + PROBE + '"]')); if (hasIcon) { await pg.click('[data-oc-uninstall="' + PROBE + '"]'); await sleep(2000); }   // a mutant that let role 102 uninstall it leaves nothing to click: judged red, not a crash
  var gone = await stateOf(pg, PROBE), rmLines = roleLines(logs.slice(n3), /action=remove/);
  verdict('PLR7', hasIcon && a3.role === 0 && gone === null && rmLines.indexOf('§PLUGIN-ROLE ok role=0 user=' + a3.actor + ' action=remove bundle=' + PROBE) >= 0, 'role ' + a3.role + ' Uninstall removes the probe (state ' + gone + ') and logs who and what', J({ rmLines: rmLines }));

  verdict('PLR8', errors === 0, '0 page errors on every page of the run', 'errors=' + errors + (errors ? ' ' + P.errs.concat(P2.errs).slice(0, 2).join(' | ') : ''));
  var red = await finishRun();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§PLR_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (judged === 0) { console.log('§PLR_VERDICT INCONCLUSIVE nothing was judged'); process.exit(3); }
  if (process.env.PLR_NO_MUT) { console.log('§PLR_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors); process.exit(0); }
  var REG = '/erp/plugin_registry.js', REL = '/erp/plugin_release.js', OSGI = '/erp/osgi_console.js';
  var OPEN = { file: REG, from: 'function authorize(action, ref) {', to: 'function authorize(action, ref) { return { role: 0, user: 0 };' };
  var M = [
    ['gate only in the UI (the registry authorize lets everyone through; the buttons stay hidden)', [OPEN], ['PLR4']],
    ['gate absent (registry open AND the console draws its controls for everyone)', [OPEN, { file: REL, from: 'canWrite: pr.mayWrite()', to: 'canWrite: true' }], ['PLR3', 'PLR4']],
    ['the list is hidden from non-administrators', [{ file: REL, from: 'list: function () { return pr.list(); }', to: 'list: function () { return pr.mayWrite() ? pr.list() : []; }' }], ['PLR2']],
    ['the boot restore goes through the gate', [{ file: REG, from: 'async function restore(saved) {', to: "async function restore(saved) { authorize('restore', 'boot');" }], ['PLR6']],
    ['the location URL is shown whole to a read-only role (secret in the query string)', [{ file: OSGI, from: 'var shownUrl = readOnly ? stripQuery(row.url) : row.url;', to: 'var shownUrl = row.url;' }], ['PLR5']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 900000, env: Object.assign({}, process.env, { PLR_ONLY_ARMS: '1', PLR_MUT: JSON.stringify(m[1]) }) });
    var mm = /§PLR_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[2], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String((kk.stdout || '') + (kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
  }
  console.log('\n§PLR_MUTANTS');
  var killed = 0;
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§PLR_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§PLR_CRASH ' + (e && e.stack || e)); process.exit(2); });
