#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MF-LENS (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §42.5; owner 2026-10-28: "we have to use the iDempiere admin client panel just that it's micro finance lens (this is a std feature too in legacy where main screen can be edited to be just
//   the HTML link version"). CARDINAL RULE: the Home is legacy's own dashboard (PA_DashboardContent / PA_DashboardContent_Access through MDashboardContentAccess.get + DashboardController), ported once in erp/overlay/; the lens is DATA. READ THE LOG after every
//   run: every verdict is a §MFL line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged.
// THE ISSUE: the Home rendered the Performance, Activities and Recent Items gadgets and printed "Not ported yet" for every other kind - including the HTML gadget (GardenWorld's own "Donate"), so legacy's way of turning the main screen into a page of links could not
//   be used at all. And a Micro Finance admin had no single page that leads to the windows and processes of a loan.
// SPEC (one real page, GardenWorld seed; every expectation is read from the DICTIONARY or from the legacy oracle (scripts/bridge/out/dashboard_select_legacy.json, produced by the pilot JVM), never from the code under test):
//   MFL0 PRECONDITION  fresh profile: bundle org.kernel.mf-lens is INSTALLED, not ACTIVE; 0 rows of it in pa_dashboardcontent / pa_dashboardcontent_access (id band 9539001-9539999); the team BASE hash equals the pin (the plugin stages at runtime, no hashed file moved).
//   MFL1 START         System Administrator (role 0) starts it from Plugins & Releases: registry ACTIVE; exactly 1 content row ("Micro Finance", HTML, ColumnNo 0, Line -1) and 1 access row (role 102, client 11) in the dictionary; the base hash still equals the pin.
//   MFL2 HOME          GardenAdmin / role 102: the Home draws the item as a gadget named "Micro Finance" of kind html, FIRST in its column and first on the page: the gadget order is "Micro Finance" followed by the legacy oracle's order for this role
//                      (Activities | KPI1 | Views | KPI2 | Donate | Running Jobs | Calendar | Performance); its HTML holds the 6 links of the bundle, rendered as HTML (anchors in the DOM, not escaped text).
//   MFL3 LINKS X of N  for each of the N links of the gadget: the href is an application link (?window= / ?process=), the target is a row of the DICTIONARY (AD_Window / AD_Process, IsActive Y), the overlay's resolver agrees, and a REAL CLICK on the link in the page opens
//                      it through the role's menu leaf: a window -> the active window tab is the menu's name; a process -> its dialog (the run button) is on screen and `§AD-PROC-LIVE open proc=<id>` is logged. Negative arms: a link to window 99999999 and to process
//                      99999999 (not in the dictionary) is refused by the resolver, and a click on it opens nothing and logs `§DASH-LINK refused`; an external link is left to the browser (resolver says external).
//   MFL4 ACCESS X of N for every loginable role of the dictionary (System roles 0 and 1000000, GardenWorld roles 102 / 103 / 200001 / 50004): the Home shows "Micro Finance" iff an ACTIVE PA_DashboardContent_Access row of the item names that role (the dictionary says: 102 only).
//   MFL5 SEED ITEMS    GardenWorld's own KPI1, KPI2 and Calendar each appear on the role-102 Home as a named gadget, drawn as "Not ported yet (<kind>)" with a `§DASH-UNPORTED id=<id> name="<name>" kind=<kind>` line (statusline, statusline, calendar - AD_StatusLine and the ZK calendar are not in the twin);
//                      "Donate" (the seed's own HTML gadget) is now DRAWN as HTML (it was one of the unported). None is dropped silently.
//   MFL6 STOP          the System Administrator stops the bundle: registry not ACTIVE; 0 rows of it left in both tables; the role-102 Home no longer has the item and still has the 8 legacy gadgets; base hash = pin.
//   MFL8 OFFLINE DONATE the seed's Donate gadget frames www.idempiere.org (legacy data, kept as legacy draws it); with that host unreachable the request is refused, there is no page error, the frame element is present and every other gadget is drawn.
//   MFL7 0 page errors on every page of the run.
// MUTANTS (MFL_MUTANTS=1; each an in-memory copy of the real file, applied exactly once or the child aborts as a CRASH, which is NOT a kill): the access row is ignored (every role sees the item) -> MFL4 · the Line order is ignored -> MFL2 · a link to a target that is not in
//   the dictionary is accepted -> MFL3 · Stop leaves the rows behind -> MFL6.
// Run: node erp/tests/witness_mf_lens.js 2>&1 | tee /tmp/witness_mf_lens.log        (MFL_NO_MUT=1 skips the mutants; MFL_ONLY_ARMS=1 is the mutant child mode; MFL_RED=1 serves the integ/wave1 Home overlay to reproduce the RED)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.MFL_ONLY_ARMS, MUT = process.env.MFL_MUT ? JSON.parse(process.env.MFL_MUT) : null;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function say(s) { if (!QUIET) console.log(s); }
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var BUNDLE = 'org.kernel.mf-lens', CID = 9539001, NAME = 'Micro Finance', BAND_LO = 9539001, BAND_HI = 9539999;
var BASE_PIN = 'a3eef3f59d775cc2adfc320b82c8ec5c8045721d74490c5dfaa421cbf595b8ab';       // team base of origin/main 9d092972 (the pin of W-IMPORT-ORDER / W-POS-SALES); a later INTENDED base change must move this pin on purpose · MOVED ON PURPOSE 2026-10-31: user Search Keys patch (TEAMWORK §48.11d, bim-ootb #2463); was d35e8a75…
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
var ORA = JSON.parse(fs.readFileSync(process.env.DS_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/dashboard_select_legacy.json', 'utf8'));
var LEGACY102 = (function () { var c = ORA.cases.filter(function (x) { return x.name.indexOf('GardenAdmin') === 0; })[0]; return c.main.map(function (id) { return c.detail.filter(function (d) { return d.id === id; })[0].name; }); })();

(async function () {
  say('═══ W-MF-LENS — the Micro Finance lens as legacy\'s own home dashboard: HTML gadget, links resolved against the dictionary, access by role, seed items named (§42.5) ═══' + (MUT ? '  MUTANT=' + J(MUT.map(function (e) { return e.file.split('/').pop(); })) : '') + '\n');
  var cur = { over: {} };
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (cur.over[p] != null) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(cur.over[p]); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  if (process.env.MFL_RED) {                                                                                                // RED reproduction: serve the Home overlay as it was on integ/wave1 (HTML / Window / Process kinds printed "Not ported yet")
    cur.over['/erp/overlay/home.js'] = require('child_process').execFileSync('git', ['-C', ROOT, 'show', 'origin/integ/wave1:erp/overlay/home.js'], { encoding: 'utf8' }); console.log('§MFL_RED serving the integ/wave1 Home overlay (' + cur.over['/erp/overlay/home.js'].length + ' chars)');
  }
  if (MUT) MUT.forEach(function (e) {
    var orig = fs.readFileSync(path.join(ROOT, e.file), 'utf8'); if (orig.split(e.from).length !== 2) { console.log('§MFL_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + e.file + ' :: ' + e.from.slice(0, 60)); process.exit(2); }
    cur.over[e.file] = orig.replace(e.from, function () { return e.to; });
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  async function finishRun() { var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; }); console.log('§MFL_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged); await browser.close(); server.close(); return red; }

  var frameHits = []; await ctx.route(/\/\/www\.idempiere\.org\//, function (r) { frameHits.push(r.request().url()); return r.abort('internetdisconnected'); });   // the seed's Donate gadget frames www.idempiere.org: unreachable here, as it is offline
  var pg = await ctx.newPage(), logs = [], errs = [];
  pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
  await pg.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'load' });
  await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
  await sleep(2500);
  var db = function (sql) { return pg.evaluate(function (q) { var r = window.__idmpDb.exec(q); if (!r.length) return []; var cols = r[0].columns; return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; }); }, sql); };
  var one = function (sql) { return db(sql).then(function (r) { return r[0] || {}; }); };
  var bundleState = function () { return pg.evaluate(function (id) { var r = window.PluginEngine && window.PluginEngine._reg(); var b = r && r.list().filter(function (x) { return x.id === id; })[0]; return b ? b.state : null; }, BUNDLE); };
  var band = function () { return one('SELECT (SELECT count(*) FROM pa_dashboardcontent WHERE pa_dashboardcontent_id BETWEEN ' + BAND_LO + ' AND ' + BAND_HI + ') AS c, (SELECT count(*) FROM pa_dashboardcontent_access WHERE pa_dashboardcontent_id BETWEEN ' + BAND_LO + ' AND ' + BAND_HI + ') AS a').then(function (r) { return { content: Number(r.c), access: Number(r.a) }; }); };
  async function firstLogin(client, user) {
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 }); await sleep(1200);
    return pg.evaluate(function () { return window.APP.roleId; });
  }
  async function switchTo(client, user, role) {
    await pg.click('#idmp-switch-btn'); await sleep(600);
    if (await pg.isVisible('#idmp-login-clients')) await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))");
    await pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    await pg.selectOption('#idmp-login-role', String(role)); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 });
    await pg.waitForSelector('#idmp-home', { timeout: 15000 }).catch(function () {}); await sleep(1200);
    return pg.evaluate(function () { return window.APP.roleId; });
  }
  var homeGadgets = function () { return pg.evaluate(function () { return [].map.call(document.querySelectorAll('#idmp-home .idmp-hcol:not(.idmp-hside) .idmp-gadget'), function (g) { return { id: Number(g.getAttribute('data-gadget-id')), name: g.getAttribute('data-gadget-name'), kind: g.getAttribute('data-gadget-kind'), text: g.querySelector('.gb') ? g.querySelector('.gb').innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : '' }; }); }); };
  var lensLinks = function () { return pg.evaluate(function (n) { var g = document.querySelector('#idmp-home .idmp-gadget[data-gadget-name="' + n + '"]'); return g ? [].map.call(g.querySelectorAll('.idmp-pa a[href]'), function (a) { return { href: a.getAttribute('href'), text: a.textContent.trim(), title: a.getAttribute('title') }; }) : null; }, NAME); };
  var consoleStart = async function (id, op) { await pg.evaluate(function () { window.PluginRelease.close(); window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await sleep(500); await pg.click('[data-oc-' + op + '="' + id + '"]'); await sleep(3000); await pg.evaluate(function () { window.PluginRelease.close(); }); await sleep(600); };

  // ───────────────── MFL0 precondition ─────────────────
  say('§S0 fresh profile');
  var st0 = await bundleState(), b0 = await band();
  verdict('MFL0', st0 === 'INSTALLED' && b0.content === 0 && b0.access === 0 && baseOracle() === BASE_PIN, 'fresh profile: ' + BUNDLE + ' is ' + st0 + ' (INSTALLED, not ACTIVE); ' + b0.content + '/' + b0.access + ' rows in the band; base hash == pin (' + (baseOracle() === BASE_PIN) + ')', J({ st0: st0, b0: b0, base: baseOracle() }));

  // ───────────────── MFL1 the System Administrator starts it ─────────────────
  say('§S1 System Administrator starts the lens from Plugins & Releases');
  var role0 = await firstLogin('System', 'System');
  await consoleStart(BUNDLE, 'start');
  var st1 = await bundleState(), b1 = await band(), c1 = await one('SELECT name, columnno AS col, line, isshowindashboard AS d, (html IS NOT NULL AND html <> \'\') AS h FROM pa_dashboardcontent WHERE pa_dashboardcontent_id=' + CID), a1 = await one('SELECT ad_role_id AS r, ad_client_id AS c, isactive AS act FROM pa_dashboardcontent_access WHERE pa_dashboardcontent_id=' + CID);
  verdict('MFL1', role0 === 0 && st1 === 'ACTIVE' && b1.content === 1 && b1.access === 1 && c1.name === NAME && Number(c1.col) === 0 && Number(c1.line) === -1 && Number(c1.h) === 1 && Number(a1.r) === 102 && Number(a1.c) === 11 && baseOracle() === BASE_PIN,
    'as role ' + role0 + ' Start: registry ' + st1 + '; ' + b1.content + ' content row ' + J(c1) + ' + ' + b1.access + ' access row ' + J(a1) + '; base hash == pin', J({ st1: st1, b1: b1 }));

  // ───────────────── MFL2 the Home of the Micro Finance admin ─────────────────
  say('§S2 GardenAdmin (role 102): the Home');
  var role102 = await switchTo('GardenWorld', 'GardenAdmin', 102);
  var g102 = await homeGadgets(), links = await lensLinks(), names102 = g102.map(function (g) { return g.name; });
  var want102 = [NAME].concat(LEGACY102), lensG = g102.filter(function (g) { return g.name === NAME; })[0];
  verdict('MFL2', role102 === 102 && !!lensG && lensG.kind === 'html' && J(names102) === J(want102) && !!links && links.length === 6,
    'role ' + role102 + ' Home gadgets in order: ' + names102.join(' | ') + ' (expected "' + NAME + '" first, then the legacy oracle\'s ' + LEGACY102.length + '); the item is kind ' + (lensG && lensG.kind) + ' with ' + (links && links.length) + ' anchors', J({ names102: names102, want102: want102, links: links && links.length }));

  // ───────────────── MFL5 the seed items ─────────────────
  say('§S3 the seed items');
  var SEED = [[200018, 'KPI1', 'statusline'], [200019, 'KPI2', 'statusline'], [50004, 'Calendar', 'calendar']];
  var seedOk = SEED.every(function (s) {
    var g = g102.filter(function (x) { return x.id === s[0]; })[0];
    return g && g.name === s[1] && g.kind === s[2] && /Not ported yet \(/.test(g.text) && logs.some(function (l) { return l.indexOf('§DASH-UNPORTED id=' + s[0] + ' name="' + s[1] + '" kind=' + s[2]) === 0; });
  });
  var donate = g102.filter(function (x) { return x.id === 200005; })[0], donateHtml = await pg.evaluate(function () { var g = document.querySelector('#idmp-home .idmp-gadget[data-gadget-id="200005"] .idmp-pa .content'); return g ? g.innerHTML.length : 0; });
  verdict('MFL5', seedOk && !!donate && donate.kind === 'html' && donateHtml > 10 && !/Not ported yet/.test(donate.text), 'KPI1 / KPI2 / Calendar each a named "Not ported yet" gadget with a §DASH-UNPORTED line (' + seedOk + '); Donate (seed HTML gadget) drawn as HTML (' + donateHtml + ' chars, kind ' + (donate && donate.kind) + ')', J({ seed: SEED.map(function (s) { return g102.filter(function (x) { return x.id === s[0]; })[0]; }) }));

  // MFL8 OFFLINE DONATE: the Donate gadget's iframe to www.idempiere.org (legacy seed data, drawn as legacy draws it) fails QUIETLY when the host is unreachable: the request was made and refused, no page error, the frame element is there, and every other gadget of the Home is drawn
  var frameEl = await pg.evaluate(function () { return document.querySelectorAll('#idmp-home .idmp-gadget[data-gadget-id="200005"] iframe').length; });
  verdict('MFL8', frameHits.length >= 1 && frameEl === 1 && errors === 0 && J(names102) === J(want102), 'Donate frame host unreachable: ' + frameHits.length + ' request(s) refused, ' + frameEl + ' iframe in the gadget, ' + errors + ' page errors, all ' + names102.length + ' gadgets still drawn', J({ frameHits: frameHits.slice(0, 2) }));
  // ───────────────── MFL3 links, X of N ─────────────────
  say('§S4 every link: dictionary target, resolver, a real click');
  var resolved = [], opened = 0, detail = [];
  for (var i = 0; i < (links || []).length; i++) {
    var lk = links[i], u = new URL(lk.href, base + '/erp/idempiere.html'), kind = u.searchParams.get('window') != null ? 'window' : 'process', id = Number(u.searchParams.get(kind));
    var dictRow = await one(kind === 'window' ? 'SELECT name FROM ad_window WHERE ad_window_id=' + id + " AND isactive='Y'" : 'SELECT name FROM ad_process WHERE ad_process_id=' + id + " AND isactive='Y'");
    var menuRow = await one('SELECT name FROM ad_menu WHERE ' + (kind === 'window' ? 'ad_window_id' : 'ad_process_id') + '=' + id + " AND isactive='Y' ORDER BY ad_menu_id DESC");
    var rv = await pg.evaluate(function (h) { var R = window.OverlayHome && window.OverlayHome.resolveLink; return R ? R(h) : null; }, lk.href);
    await switchTo('GardenWorld', 'GardenAdmin', 102);                                                    // a fresh Home for every click: opening a window replaces the Home
    var n0 = logs.length;
    await pg.click('#idmp-home .idmp-gadget[data-gadget-name="' + NAME + '"] a[href="' + lk.href + '"]'); await sleep(2500);
    var res = await pg.evaluate(function () { var t = document.querySelector('.idmp-wintab.active .lbl'); return { tab: t ? t.textContent.trim() : null, run: !!document.querySelector('#idmp-content [data-proc-run]') }; });
    var procLog = logs.slice(n0).some(function (l) { return l.indexOf('§AD-PROC-LIVE open proc=' + id + ' ') === 0; });
    var ok = !!dictRow.name && !!menuRow.name && rv && rv.ok === true && rv.kind === kind && rv.id === id && (kind === 'window' ? res.tab === menuRow.name : (res.run && procLog));
    if (ok) opened++;
    detail.push({ text: lk.text, kind: kind, id: id, dict: dictRow.name, menu: menuRow.name, tab: res.tab, run: res.run, procLog: procLog, resolver: rv && (rv.ok ? 'ok' : rv.reason) });
  }
  var bogus = await pg.evaluate(function () { var R = window.OverlayHome && window.OverlayHome.resolveLink; return R ? { w: R('?window=99999999'), p: R('?process=99999999'), ext: R('https://example.org/x') } : { w: {}, p: {}, ext: {} }; });
  await switchTo('GardenWorld', 'GardenAdmin', 102);
  var tabs0 = await pg.evaluate(function () { return document.querySelectorAll('.idmp-wintab').length; }), n1 = logs.length;
  var injected = await pg.evaluate(function () { var ct = document.querySelector('#idmp-home .idmp-gadget[data-gadget-name="Micro Finance"] .idmp-pa .content'); if (!ct) return false; ['?window=99999999', '?process=99999999'].forEach(function (h) { var a = document.createElement('a'); a.setAttribute('href', h); a.className = 'mfl-bogus'; a.textContent = 'bogus ' + h; ct.appendChild(a); }); return true; });
  if (injected) { await pg.click('a.mfl-bogus[href="?window=99999999"]'); await sleep(500); await pg.click('a.mfl-bogus[href="?process=99999999"]'); await sleep(800); }
  var tabs1 = await pg.evaluate(function () { return document.querySelectorAll('.idmp-wintab').length; }), runShown = await pg.evaluate(function () { return !!document.querySelector('#idmp-content [data-proc-run]'); });
  var refusedN = logs.slice(n1).filter(function (l) { return /^§DASH-LINK refused href=\?(window|process)=99999999 reason=not-in-dictionary/.test(l); }).length;
  verdict('MFL3', links && links.length === 6 && opened === links.length && bogus.w.ok === false && bogus.w.reason === 'not-in-dictionary' && bogus.p.ok === false && bogus.p.reason === 'not-in-dictionary' && bogus.ext.external === true && tabs1 === tabs0 && !runShown && refusedN === 2,
    'X_of_N=' + opened + '_of_' + (links || []).length + ' links resolve to a dictionary window / process and open it on a real click; negative: window/process 99999999 refused by the resolver (' + (bogus.w.reason) + '/' + (bogus.p.reason) + '), a click on each opens nothing (tabs ' + tabs0 + '->' + tabs1 + ', dialog ' + runShown + ') and logs §DASH-LINK refused x' + refusedN + '; an external link is left to the browser (' + bogus.ext.external + ')', J(detail));

  // ───────────────── MFL4 access X of N ─────────────────
  say('§S5 the Home of every loginable role');
  var roleSet = await db("SELECT DISTINCT r.ad_role_id AS id, u.name AS user, c.name AS client FROM ad_user_roles ur JOIN ad_user u ON u.ad_user_id=ur.ad_user_id AND u.isactive='Y' JOIN ad_role r ON r.ad_role_id=ur.ad_role_id AND r.isactive='Y' JOIN ad_client c ON c.ad_client_id=r.ad_client_id WHERE ur.isactive='Y' AND r.ad_client_id IN (0,11) AND u.name IN ('System','GardenAdmin','WebService') ORDER BY 1");
  var seen = {}; roleSet = roleSet.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return true; });
  var granted = (await db("SELECT DISTINCT ad_role_id AS r FROM pa_dashboardcontent_access WHERE pa_dashboardcontent_id=" + CID + " AND isactive='Y'")).map(function (r) { return Number(r.r); });
  var acc = [], accOk = 0;
  for (var ri = 0; ri < roleSet.length; ri++) {
    var rs = roleSet[ri], got = await switchTo(rs.client, rs.user, rs.id), gs = await homeGadgets(), shown = gs.some(function (g) { return g.name === NAME; }), expect = granted.indexOf(Number(rs.id)) >= 0;
    if (shown === expect) accOk++; acc.push(rs.id + ':' + (shown ? 'shown' : 'hidden') + (shown === expect ? '' : '!'));
  }
  verdict('MFL4', roleSet.length >= 6 && granted.length === 1 && granted[0] === 102 && accOk === roleSet.length && acc.indexOf('102:shown') >= 0, 'X_of_N=' + accOk + '_of_' + roleSet.length + ' roles show the item iff the dictionary grants it (granted roles ' + J(granted) + '): ' + acc.join(' '), J({ acc: acc }));

  // ───────────────── MFL6 Stop removes it ─────────────────
  say('§S6 System Administrator stops the lens');
  await switchTo('System', 'System', 0);
  await consoleStart(BUNDLE, 'stop');
  var st6 = await bundleState(), b6 = await band(), g6role = await switchTo('GardenWorld', 'GardenAdmin', 102), g6 = await homeGadgets();
  verdict('MFL6', st6 !== 'ACTIVE' && b6.content === 0 && b6.access === 0 && g6role === 102 && !g6.some(function (g) { return g.name === NAME; }) && J(g6.map(function (g) { return g.name; })) === J(LEGACY102) && baseOracle() === BASE_PIN,
    'after Stop: registry ' + st6 + ', rows ' + b6.content + '/' + b6.access + ', the role-102 Home is the legacy ' + g6.length + ' gadgets again, base hash == pin', J({ st6: st6, b6: b6, names: g6.map(function (g) { return g.name; }) }));

  verdict('MFL7', errors === 0, '0 page errors on the run', 'errors=' + errors + (errors ? ' ' + errs.slice(0, 2).join(' | ') : ''));
  var red = await finishRun();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§MFL_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (judged === 0) { console.log('§MFL_VERDICT INCONCLUSIVE nothing was judged'); process.exit(3); }
  if (process.env.MFL_NO_MUT) { console.log('§MFL_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors); process.exit(0); }
  var DH = '/erp/overlay/dashboard_home.js', HM = '/erp/overlay/home.js', REG = '/erp/plugin_registry.js';
  var M = [
    ['the access row is ignored (every role sees the item)', [{ file: DH, from: 'AND COALESCE(cta.AD_Role_ID," + role + ")=" + role + " AND', to: 'AND 1=1 AND' }], ['MFL4']],
    ['the Line order is ignored (the item falls behind Activities)', [{ file: DH, from: 'main.sort(order); side.sort(order);', to: '/* order ignored */' }], ['MFL2']],
    ['a link to a target that is not in the dictionary is accepted', [{ file: HM, from: "if (!row) return { ok: false, reason: 'not-in-dictionary', kind: kind, id: id };", to: "if (!row) row = { id: id, n: '(unchecked)' };" }], ['MFL3']],
    ['Stop leaves the rows behind', [{ file: REG, from: "function () { d.run('DELETE FROM ' + table + ' WHERE ' + idCol + '=?', [rid]); });", to: 'function () { });' }], ['MFL6']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1200000, env: Object.assign({}, process.env, { MFL_ONLY_ARMS: '1', MFL_MUT: JSON.stringify(m[1]) }) });
    var mm = /§MFL_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[2], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String((kk.stdout || '') + (kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
  }
  console.log('\n§MFL_MUTANTS');
  var killed = 0;
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§MFL_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§MFL_CRASH ' + (e && e.stack || e)); process.exit(2); });
