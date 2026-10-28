#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FILM-OFFLINE (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §42.1 Ch 1 "the till works while the link is down", film evidence gap 1 = film6/FILM_EVT.md §0 finding 1). READ THE LOG after every run: every verdict is a §FOFF line,
//   the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged. The film may only show OFFLINE stretches this witness measured.
// THE ISSUE: no witness ever took a device offline (only tests/offline_smoke.js:74 calls setOffline). A film frame "OFFLINE" painted without a real cut is a label with nothing behind it. This witness cuts the till's network FOR REAL and proves what the
//   local-first claim says: the till keeps working, head office knows nothing, and when the link returns the same tickets arrive once.
// "OFFLINE" HERE MEANS (stated so nobody over-reads it): the till's BROWSER CONTEXT is cut with Playwright context.setOffline(true) - every network request of that page fails (net::ERR_INTERNET_DISCONNECTED) and navigator.onLine is false - AND no Visit is possible:
//   the pipe (a dumb folder served by this witness) is unreachable FROM THE TILL; it is still reachable from head office, so "head office sees none" is not "the whole network is down". It is not a model of a flaky link, a slow link or a partial outage.
// HARNESS: the W-POS-PLAN pattern (two real pages of erp/idempiere.html?team=1 on one dumb folder pipe, POS plan ?teamplan=pos): A = head office (founder, processor), B = the till (team role 50004 bound to org 12, window 281 Import Order open).
// SPEC (every number is counted from the engine's fold, the page's grid, the pipe folder or the browser's own request log - never from a screenshot):
//   FOFF0 ONLINE CONTROL  before the cut: the till's page reaches the pipe (fetch ok), a Visit succeeds and logs "§TEAM_VISIT sent=", and head office holds 0 rows of the ticket. (A cut that leaves a working link would also "pass" later arms; this is the control.)
//   FOFF1 THE CUT         setOffline(true): navigator.onLine=false and a fetch of the pipe FAILS from the till (TypeError), while the SAME fetch from head office succeeds (non-vacuous: the pipe is up). A Visit on the till returns without delivering anything:
//                         the page logs "§TEAM_VISIT error" (no "sent=" line), the browser reports >=1 failed request, the pipe folder is byte-for-byte the same listing as before. 0 page errors on the till while offline.
//   FOFF2 STILL WORKS     offline the till records 3 ticket lines through the ERP write path: 3 committed ids, 3 I_Order rows readable back from the device (tip: key, product, qty, I_IsImported=N), and the Import Order window it has open SHOWS 3 rows for the key.
//   FOFF3 HQ KNOWS NOTHING head office Visits twice while the till is offline: 0 I_Order rows of the key, 0 ops of the till's authorship beyond the pre-cut count, the pipe listing unchanged (the 3 tickets exist on ONE device only).
//   FOFF4 BACK ONLINE     setOffline(false): ONE Visit on the till logs "sent=3" (exactly the 3 queued ops, no more); head office Visits and now holds EXACTLY 3 rows of the key with the SAME I_Order_UU set, product, quantity and key as the till (nothing lost, nothing altered);
//                         a further round of Visits (till, HQ, till, HQ) changes nothing: still 3 rows at both ends, the till's later Visits log "sent=0", head office's delivered I_Order ops = 3 (nothing duplicated). 0 page errors on both devices for the whole run.
// MUTANTS (FOFF_MUTANTS=1): the instrument and the shipped engine broken one way each; each must turn >= 1 named arm red (a crash is NOT a kill): (a) the cut is never applied (FOFF1/FOFF3), (b) a failed Visit forgets the queue (marks it sent before the network, FOFF4),
//   (c) a Visit carries only part of the queue (bundle cap 2, FOFF4), (d) the plan carries no I_Order flow (head office never receives, FOFF4).
// FILM EVIDENCE: prints §FILM_EVT lines (film6/FILM_EVT.md §1) only after the arm that proves each event is green: till offline/local x3 at the cut, till online + send x3 at the reconnect, clerk deliver x3.
// Run: node erp/tests/witness_film_offline.js 2>&1 | tee /tmp/witness_film_offline.log        (FOFF_NO_MUT=1 skips the mutants; FOFF_ONLY_ARMS=1 is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.FOFF_ONLY_ARMS, MUT = process.env.FOFF_MUT ? JSON.parse(process.env.FOFF_MUT) : null, SEQ = 0, EVT = [];
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function say(s) { if (!QUIET) console.log(s); }
function evt(o) { if (QUIET || MUT) return; var line = '§FILM_EVT ' + Object.entries(Object.assign({ seq: ++SEQ, ts: Date.now() }, o)).map(function (kv) { return kv[0] + '=' + (/[\s"]/.test(String(kv[1])) ? JSON.stringify(String(kv[1])) : kv[1]); }).join(' '); EVT.push(line); console.log(line); }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS');
var OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var TILL = 50004, KEY = 'POS1/2026-10-28/' + String(1000 + Math.floor(Math.random() * 8999)), J = JSON.stringify;
var LINES = [{ m_product_id: 123, qtyordered: 2 }, { m_product_id: 130, qtyordered: 1 }, { m_product_id: 134, qtyordered: 3 }].map(function (l) { return Object.assign({ ad_client_id: 11, ad_org_id: 11, i_isimported: 'N', issotrx: 'Y', doctypename: 'POS Order', c_uom_id: 100, dateordered: '2026-10-28 00:00:00' }, l); });
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  say('═══ W-FILM-OFFLINE — the till goes offline for real, keeps selling, and the same tickets arrive once when the link returns (§42.1 Ch 1) ═══  key=' + KEY + (MUT ? '  MUTANT=' + J(MUT).slice(0, 140) : '') + '\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'film-off-')), cur = { plans: {}, over: {} };
  if (MUT && MUT.file) { var orig = fs.readFileSync(path.join(ROOT, MUT.file), 'utf8'); if (orig.split(MUT.from).length !== 2) { console.log('§FOFF_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + MUT.file); process.exit(2); } cur.over[MUT.file] = orig.replace(MUT.from, function () { return MUT.to; }); }
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos }[p] || cur.over[p];
    if (over) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(), pos = JSON.parse(JSON.stringify(POSPLAN));
  if (MUT && MUT['plan-drop']) pos.flows = (pos.flows || pos.rows || []).filter(function (f) { return String(f.table).toLowerCase() !== MUT['plan-drop']; });
  cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(pos, owner));
  var xcfg = encodeURIComponent(Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64'));
  async function finishRun() { var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; }); console.log('§FOFF_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged); await browser.close(); server.close(); return red; }

  async function device(name, extra) {
    var ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } }), pg = await ctx.newPage(), logs = [], errs = [], failed = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; }); pg.on('requestfailed', function (r) { failed.push(r.url()); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=281&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + (extra || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, failed: failed, ctx: ctx };
  }
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    kid: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).device; }); },
    approve: function (a, kid, role, ent) { return a.pg.evaluate(async function (x) { var r = await window.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await window.TeamSync.approve(q.rq, x.role, x.ent || null); return true; } return false; }, { kid: kid, role: role, ent: ent || null }); },
    visit: function (d) { return d.pg.evaluate(async function () { var v = await window.TeamSync.visit(); return v ? { ok: true, sent: v.rep && v.rep.sent } : null; }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    pipeUp: function (d) { return d.pg.evaluate(function (u) { return fetch(u + '/list?prefix=', { cache: 'no-store' }).then(function (r) { return { ok: r.ok, status: r.status }; }, function (e) { return { ok: false, err: e && e.name + ': ' + e.message }; }); }, PIPE).catch(function (e) { return { ok: false, err: 'evaluate: ' + e.message }; }); },
    online: function (d) { return d.pg.evaluate(function () { return navigator.onLine; }); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; },
    measure: function (d) { return d.pg.evaluate(async function () { var S = window.TeamSync.store(), kid = (await window.TeamSync.pairState()).device, f = await S.foldable(), m = { delivered: 0, ownPlaced: 0, tabs: {}, ownTabs: {} };
      f.forEach(function (p) { var t = p.env.target.table; if (p.env.author === kid) { m.ownPlaced++; m.ownTabs[t] = (m.ownTabs[t] || 0) + 1; } else { m.delivered++; m.tabs[t] = (m.tabs[t] || 0) + 1; } }); return m; }); },
    grid: function (d) { return d.pg.evaluate(function () { var t = Array.prototype.filter.call(document.querySelectorAll('#idmp-content table'), function (x) { return /Document No|DocumentNo|Doc/i.test(x.innerText); })[0]; if (!t) return null; return Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (r) { return r.innerText.replace(/\s+/g, ' ').trim(); }); }); }
  };
  var listing = function () { return walk(FOLDER, '', []).sort(); };
  var uuSet = function (rs) { return rs.map(function (r) { return r.uu + '|' + r.p + '|' + Number(r.q) + '|' + r.k; }).sort(); };
  var Q = "SELECT i_order_uu AS uu, m_product_id AS p, qtyordered AS q, documentno AS k, i_isimported AS imp FROM i_order WHERE documentno='" + KEY + "' ORDER BY m_product_id";

  // ── set up the POS space: A processor, B till ──
  say('§S0 set up: A = head office (processor), B = the till (role ' + TILL + ' bound to org 12)');
  var A = await device('A', '&teamplan=pos'), B = await device('B'), space = await T.found(A); await T.join(B, space);
  var tillOrg = await A.pg.evaluate(function () { return window.__idmpDb.exec('SELECT ad_org_uu FROM ad_org WHERE ad_org_id=12')[0].values[0][0]; });      // POS plan: tills are role 50004, each bound to its org (_uu)
  for (var i = 0; i < 5; i++) { await T.approve(A, await T.kid(B), TILL, tillOrg); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  await T.visit(A); await T.visit(B);
  evt({ actor: 'till', kind: 'online', step: 'O0' }); evt({ actor: 'clerk', kind: 'online', step: 'O0' });

  // ── FOFF0 online control ──
  var up0 = await T.pipeUp(B), v0 = await T.visit(B), files0 = listing(), mA0 = await T.measure(A), mB0 = await T.measure(B), aRows0 = await T.rows(A, Q);
  var visitLines0 = T.count(B, /§TEAM_VISIT sent=\d+/);
  verdict('FOFF0', (await T.enrolled(B)) && up0.ok && v0 && v0.ok && visitLines0 >= 1 && aRows0.length === 0, 'CONTROL (online): the till is enrolled, its page reaches the pipe (' + J(up0) + '), a Visit succeeds and logs "§TEAM_VISIT sent=" (' + visitLines0 + ' such lines), head office holds 0 rows of the ticket', J({ up0: up0, v0: v0, aRows0: aRows0.length }));

  // ── FOFF1 the cut ──
  say('§S1 the cut: context.setOffline(true) on the till');
  if (!(MUT && MUT.noCut)) await B.ctx.setOffline(true);
  await sleep(500);
  var onl = await T.online(B), upB = await T.pipeUp(B), upA = await T.pipeUp(A);
  evt({ actor: 'till', kind: 'offline', step: 'O1' });
  var failedBefore = B.failed.length, visitErrBefore = T.count(B, /§TEAM_VISIT error/), visitOkBefore = T.count(B, /§TEAM_VISIT sent=\d+/);
  var vOff = await T.visit(B);
  var failedPipe = B.failed.slice(failedBefore).filter(function (u) { return u.indexOf('/pipe/') >= 0; }).length, files1 = listing();
  verdict('FOFF1', onl === false && upB.ok === false && /TypeError|Failed to fetch|network/i.test(String(upB.err)) && upA.ok === true, 'THE CUT: navigator.onLine=' + onl + '; a fetch of the pipe from the till FAILS (' + J(upB) + ') while the same fetch from head office succeeds (' + J(upA) + ')', J({ onl: onl, upB: upB, upA: upA }));
  verdict('FOFF1', vOff === null && T.count(B, /§TEAM_VISIT error/) === visitErrBefore + 1 && T.count(B, /§TEAM_VISIT sent=\d+/) === visitOkBefore && failedPipe >= 1 && J(files1) === J(files0), 'a Visit on the cut till delivers nothing: it returns null, logs one "§TEAM_VISIT error" and no "sent=" line, the browser reports ' + failedPipe + ' failed pipe request(s), the pipe folder listing is identical (' + files0.length + ' files)', J({ vOff: vOff, errLines: T.count(B, /§TEAM_VISIT error/) - visitErrBefore, failedPipe: failedPipe, listingSame: J(files1) === J(files0) }));

  // ── FOFF2 the till still works ──
  say('§S2 offline the till records ' + LINES.length + ' ticket lines');
  var made = [];
  for (var li = 0; li < LINES.length; li++) { made.push(await T.create(B, 'i_order', Object.assign({ documentno: KEY }, LINES[li]))); evt({ actor: 'till', kind: 'local', queue: 1, text: 'ticket line written', step: 'O1' }); }
  var bRows = await T.rows(B, Q);
  var openLeaf = function (id) { return B.pg.evaluate(function (id) { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } lf.click(); return true; }, id); };
  await openLeaf(53354); await sleep(1500);                                                                              // leave the window (it had opened on an empty New form: no rows yet), then come back to it from the menu
  var leaf = await openLeaf(376);
  await sleep(2500); await B.pg.click('#idmp-toolbar [data-tb="toggle"]').catch(function () {}); await sleep(1500);                    // the window reopens on a New form (zero bundle rows at the first paint); Grid Toggle is the user's own button for the list
  await sleep(2500);
  if (process.env.FOFF_DEBUG) say('   DBG ' + (await B.pg.evaluate(function () { var c = document.getElementById('idmp-content'); return { txt: c.innerText.replace(/\s+/g, ' ').slice(0, 500), cls: Array.prototype.map.call(c.querySelectorAll('[class]'), function (e) { return e.className; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 30), tabs: document.querySelectorAll('#idmp-toolbar [data-tb]').length }; }).then(J)));
  var grid = await T.grid(B), shown = grid ? grid.filter(function (r) { return r.indexOf(KEY) >= 0; }).length : 0;
  verdict('FOFF2', made.every(function (x) { return x != null; }) && made.length === 3 && bRows.length === 3 && bRows.every(function (r) { return r.k === KEY && r.imp === 'N' && r.uu; }) && J(bRows.map(function (r) { return [Number(r.p), Number(r.q)]; })) === J([[123, 2], [130, 1], [134, 3]]), 'OFFLINE the till committed 3 ticket lines (ids ' + J(made) + ') and reads back 3 I_Order rows from its own device: key, products 123/130/134, quantities 2/1/3, I_IsImported=N, each with a uuid', J(bRows));
  verdict('FOFF2', leaf && shown === 3, 'the Import Order window the till has open SHOWS ' + shown + ' rows for the key (menu leaf 376 reopened offline; grid read from the DOM)', J({ leaf: leaf, rows: grid && grid.length, shown: shown }));
  var mBq = await T.measure(B);

  // ── FOFF3 head office knows nothing ──
  say('§S3 head office Visits twice while the till is offline');
  await T.visit(A); await T.visit(A);
  var aRows3 = await T.rows(A, Q), mA3 = await T.measure(A), files3 = listing();
  verdict('FOFF3', aRows3.length === 0 && (mA3.tabs.i_order || 0) === (mA0.tabs.i_order || 0) && mA3.delivered === mA0.delivered && J(files3) === J(files0) && mBq.ownPlaced === mB0.ownPlaced + 3, 'HEAD OFFICE knows nothing: 0 rows of the key after two Visits, delivered ops unchanged (' + mA0.delivered + ' -> ' + mA3.delivered + '), the pipe listing unchanged; the 3 ops exist on ONE device only (till own ops ' + mB0.ownPlaced + ' -> ' + mBq.ownPlaced + ')', J({ aRows3: aRows3.length, dA: [mA0.delivered, mA3.delivered], files: [files0.length, files3.length], own: [mB0.ownPlaced, mBq.ownPlaced] }));

  // ── FOFF4 back online ──
  say('§S4 the link returns: setOffline(false), one Visit on the till');
  if (!(MUT && MUT.noCut)) await B.ctx.setOffline(false);
  await sleep(500);
  var upB4 = await T.pipeUp(B), onl4 = await T.online(B);
  evt({ actor: 'till', kind: 'online', step: 'O2' });
  var vOn = await T.visit(B), sentLine = B.logs.filter(function (l) { return /§TEAM_VISIT sent=\d+/.test(l); }).pop() || '', sentN = Number((/sent=(\d+)/.exec(sentLine) || [])[1]);
  await T.visit(A);
  var aRows4 = await T.rows(A, Q), mA4 = await T.measure(A);
  for (var r = 0; r < 2; r++) { await T.visit(B); await T.visit(A); }
  var aRows5 = await T.rows(A, Q), bRows5 = await T.rows(B, Q), mA5 = await T.measure(A), later = B.logs.filter(function (l) { return /§TEAM_VISIT sent=\d+/.test(l); }).slice(-2).map(function (l) { return Number((/sent=(\d+)/.exec(l) || [])[1]); });
  verdict('FOFF4', onl4 === true && upB4.ok === true && vOn && vOn.ok && sentN === 3, 'BACK ONLINE: navigator.onLine=' + onl4 + ', the pipe is reachable again, ONE Visit on the till logs "sent=' + sentN + '" (exactly the 3 queued ops)', J({ onl4: onl4, upB4: upB4, sentLine: sentLine.slice(0, 90) }));
  verdict('FOFF4', aRows4.length === 3 && J(uuSet(aRows4)) === J(uuSet(bRows)) && (mA4.tabs.i_order || 0) - (mA0.tabs.i_order || 0) === 3, 'head office holds EXACTLY the 3 tickets with the SAME uuid / product / quantity / key as the till (nothing lost, nothing altered); delivered I_Order ops +' + ((mA4.tabs.i_order || 0) - (mA0.tabs.i_order || 0)), J({ a: aRows4.map(function (x) { return [x.uu.slice(0, 8), x.p, Number(x.q)]; }), delivered: mA4.tabs }));
  verdict('FOFF4', aRows5.length === 3 && bRows5.length === 3 && (mA5.tabs.i_order || 0) === (mA4.tabs.i_order || 0) && later.every(function (n) { return n === 0; }), 'a further round of Visits changes nothing (nothing duplicated): 3 rows at head office, 3 at the till, delivered I_Order ops still ' + (mA5.tabs.i_order || 0) + ', the till\'s later Visits log sent=' + J(later), J({ a: aRows5.length, b: bRows5.length, later: later }));
  if (sentN === 3) { for (var s = 0; s < sentN; s++) evt({ actor: 'till', kind: 'send', label: 'I_Order', step: 'O2' }); }
  if (aRows4.length === 3) { for (var d = 0; d < aRows4.length; d++) evt({ actor: 'clerk', kind: 'deliver', from: 'relay', label: 'I_Order', step: 'O3' }); evt({ actor: 'clerk', kind: 'note', cls: 'n', text: 'rows arrived, nothing runs', step: 'O3' }); }
  verdict('FOFF5', errors === 0, '0 page errors on both devices for the whole run (offline included)', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));
  say('§FOFF_EVT lines=' + EVT.length);

  var red = await finishRun();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§FOFF_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (judged === 0) { console.log('§FOFF_VERDICT INCONCLUSIVE nothing was judged'); process.exit(3); }
  if (process.env.FOFF_NO_MUT) { console.log('§FOFF_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors + ' film_evt=' + EVT.length); process.exit(0); }
  var M = [
    ['the cut is never applied (setOffline skipped): the pipe stays reachable from the till', { noCut: true }, ['FOFF1', 'FOFF3']],
    ['a failed Visit forgets the queue (the unsent ops are marked sent before the network is tried)', { file: '/common/comm/comm_store.js', from: "var rep = { sent: 0, fetched: 0, received: 0, contenders: 0, rejected: 0, readBackFail: 0, sealed: 0, opened: 0, tampered: 0, granted: 0 };", to: "var rep = { sent: 0, fetched: 0, received: 0, contenders: 0, rejected: 0, readBackFail: 0, sealed: 0, opened: 0, tampered: 0, granted: 0 }; db.run(\"UPDATE cl_self SET bundled_to=(SELECT COALESCE(MAX(author_seq),0) FROM cl_op WHERE author_kid=? AND state='OWN') WHERE kid=?\", [self.kid, self.kid]);" }, ['FOFF4']],
    ['a Visit carries only part of the queue (bundle cap 2 ops)', { file: '/common/comm/comm_store.js', from: "if (take.length >= cap) break;", to: "if (take.length >= 2) break;" }, ['FOFF4']],
    ['the signed POS plan carries no I_Order flow (head office never receives the tickets)', { 'plan-drop': 'i_order' }, ['FOFF4']]];
  var muts = [];
  for (var m of M) {
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { FOFF_ONLY_ARMS: '1', FOFF_MUT: J(m[1]) }) });
    var mm = /§FOFF_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[2], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String((kk.stdout || '') + (kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
  }
  console.log('\n§FOFF_MUTANTS');
  var killed = 0;
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§FOFF_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors + ' film_evt=' + EVT.length);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§FOFF_CRASH ' + (e && e.stack || e)); process.exit(2); });
