#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-KDS-BRANCH / W-KDS-REPLACE / W-KDS-RELAY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §19.6). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUES: (BRANCH) the kitchen link must run between the till and the kitchen with HEAD OFFICE OFFLINE and must never leak a kitchen row to head office; (REPLACE) a re-sent ticket must REPLACE its kitchen lines (uniCenta 5.0
// replace-all), changed lines must be marked, a void must reach the till; (RELAY) the link must cost the fewest relay requests per Send Order / bump and must not grow with the number of lines.
// HARNESS (copied from erp/tests/witness_till_delivery.js, which copied witness_mf_seed.js): THREE real devices in headless Chromium on one dumb folder pipe, signed plans:
//   head office A = erp/idempiere.html?login=GardenAdmin&team=1&teamplan=pos (founder)   the till T = erp/till.html   the kitchen K = erp/kitchen.html   (T and K: role 50004 Bound to the branch Org)
// Every request on /pipe/ is attributed to the device that made it (REQ). OFFLINE = the browser context's network is cut. Mutants are COPIES served by the harness, each proven applied exactly once; a crash is not a kill.
// Arms: KDS_ARMS=branch,replace,relay (default all).  Mutant: KDS_MUT=<name> (the arm that must go red runs).  Run: node erp/tests/witness_kds.js 2>&1 | tee /tmp/till_logs/p2_kds.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = process.env.KDS_ROOT || path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var ARMS = (process.env.KDS_ARMS || 'branch,replace,relay').split(','), MUTNAME = process.env.KDS_MUT || '';
var V = { branch: { judged: 0, failed: 0 }, replace: { judged: 0, failed: 0 }, relay: { judged: 0, failed: 0 } }, errors = [], ARM = 'branch';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §KDS_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 500))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };

// mutants: [file, anchor (must occur exactly once), replacement, arm that must go red]
var MUTS = {
  'send-appends-not-replaces': ['/erp/kds_core.js', "rows = c.gens[cur].slice().sort(function (a, b) { return a.line - b.line; });", "rows = [].concat.apply([], seqs.map(function (sq) { return c.gens[sq]; })).sort(function (a, b) { return a.line - b.line; });", 'replace'],
  'changed-lines-not-marked': ['/erp/kds_core.js', "if (prevSeq != null && !cancelled) {", "if (prevSeq != null && !cancelled && false) {", 'replace'],
  'void-not-sent-back': ['/erp/kitchen.js', "if (c) return writeStatus(c, 0, a); }", "if (c) return writeStatus(c, 0, a === 'V' ? 'W' : a); }", 'replace'],
  'kitchen-rows-ship-to-hub': ['/erp/team_sync.js', "scope === 'branch' && scopeCtx.person ? 'b_' + String(scopeCtx.person).toLowerCase() : null;", "scope === 'branch' && scopeCtx.person ? 'hub' : null;", 'branch'],
  'line-per-visit': ['/erp/till_kds.js', "var res = await A.depositGroup(rows.map(function (r) { return A.create('pos_kitchenorder', r); }));", "var res = { committed: true, gid: 'm' }; for (var mi = 0; mi < rows.length; mi++) { var mr = await A.depositGroup([A.create('pos_kitchenorder', rows[mi])]); if (!mr || mr.committed !== true) res = mr; else await window.Till.visit(); }", 'relay']
};

(async function main() {
  console.log('═══ W-KDS — the kitchen screen and Send Order (prompts/POS_PLUGIN_LOCAL_FIRST.md §19) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'kds-')), cur = { plans: {}, over: {} };
  var haveKitchen = fs.existsSync(path.join(ROOT, 'erp', 'kitchen.html'));
  if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§KDS_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§KDS_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); console.log('§KDS_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]].concat(m[3] === 'branch' ? [] : []); }
  var REQ = [];
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(J(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos }[p] || cur.over[p];
    if (over) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(J({ trust: [owner.pub] })).toString('base64')), NET = { aborted: [] };
  async function open(name, urlPath, ready) {
    var ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(KDS|TILL_KITCHEN)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 260)); });
    pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname !== '127.0.0.1') { NET.aborted.push(u.host); return route.abort('blockedbyclient'); }
      if (u.pathname.indexOf('/pipe/') === 0) REQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' }); return route.continue(); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600';
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Till ? window.Till.engine() : window.Kitchen ? window.Kitchen.engine() : window; return (' + fn.toString() + ')(W, ' + J(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); }, join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); }, enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §KDS_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { try { res(trx.q(q)); } catch (e) { res({ error: String(e && e.message) }); } return { ok: true }; } }, function () {}); }); }, sql); },
    comm: function (d, sql) { return eng(d, function (W, q) { var r = W.TeamSync.store().db.exec(q); return r.length ? r[0].values : []; }, sql); }
  };
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) for (var i = 0; i < devs.length; i++) await T.visit(devs[i]); }
  async function soft(page, sel) { try { await page.click(sel, { timeout: 6000 }); return true; } catch (e) { console.log('   §KDS_STEP no such control: ' + sel + ' (the control is missing; the check that depends on it judges the outcome)'); return false; } }       // a missing control is a FAILED check, not a crash
  var mark = function () { return REQ.length; }, since = function (mk) { return REQ.slice(mk); };
  var count = function (arr, dev) { return arr.filter(function (r) { return !dev || r.dev === dev; }).length; };

  // ═══ setup: head office A, the till T, the kitchen K
  console.log('§K0 setup: head office A (founder, POS plan), the till T and the kitchen K (role 50004, Bound to the branch Org)');
  var A = await open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsBase, function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; });
  await A.pg.evaluate(function () { return window.TeamSync.ready; });
  var Tl = null, Kt = null, setupOk = true;
  Tl = await open('T', '/erp/till.html?login=50001' + qsBase, function () { return window.Till && window.Till.ready; });
  if (haveKitchen) Kt = await open('K', '/erp/kitchen.html?login=50001' + qsBase, function () { return window.Kitchen && window.Kitchen.ready; }).catch(function (e) { console.log('§KDS_PAGE kitchen.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; });
  else console.log('§KDS_PAGE erp/kitchen.html is ABSENT (RED: the kitchen screen is not built)');
  if (!Kt) { ARMS.forEach(function (a) { ARM = a; check('kitchen-page', false, 'erp/kitchen.html boots and exposes window.Kitchen', null); }); setupOk = false; }
  var space = await T.found(A), org = (await T.rows(A, 'SELECT ad_org_uu AS uu FROM ad_org WHERE ad_org_id=12'))[0];
  await T.join(Tl, space); if (Kt) await T.join(Kt, space);
  for (var k = 0; k < 8 && setupOk; k++) { await T.approve(A, await T.kid(Tl), 50004, org.uu); await T.approve(A, await T.kid(Kt), 50004, org.uu); await visitAll([Tl, Kt, A]); if ((await T.enrolled(Tl)) && (await T.enrolled(Kt))) break; await sleep(300); }
  if (setupOk) await visitAll([Tl, Kt, A, Tl, Kt], 2);          // the branch key is created and granted by a branch device, then read by the other
  if (setupOk) {
    var enr = [await T.enrolled(Tl), await T.enrolled(Kt)]; ARM = 'branch';
    check('K0-enrolled', enr[0] === true && enr[1] === true, 'the till and the kitchen are both enrolled (role 50004, Bound to Org 12)', enr);
  }
  var pg = Tl.pg, pk = Kt && Kt.pg;
  async function clickProduct(pid) { await pg.evaluate(function (id) { var T = window.Till, p = T.state().prods.filter(function (x) { return x.pid === id; })[0]; T.addLine(p, 1); }, pid); return true; }       // a catalog tap = Till.addLine (the tile click handler's own call)

  var PIDS = [];
  async function sendOrder() { var mk = mark(); var r = await pg.evaluate(function () { return window.TillKds.send(); }); return { r: r, req: since(mk) }; }
  async function kTick() { var mk = mark(); await pk.evaluate(function () { return window.Kitchen.tick(); }); console.log('   §KDS_DEBUG kitchen link ' + J(await pk.evaluate(function () { return window.Kitchen.link().state(); }))); await pk.evaluate(function () { return window.Kitchen.render(); }); return since(mk); }
  async function tTick() { var mk = mark(); await pg.evaluate(function () { return window.TillKds.tick(); }); await pg.evaluate(function () { return window.TillKds.refresh(); }); return since(mk); }
  var kOrder = function (ref) { return T.rows(Kt, "SELECT * FROM pos_kitchenorder WHERE orderref='" + ref + "' ORDER BY seq, line"); };

  if (setupOk) {
    await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
    PIDS = (await pg.evaluate(function () { return window.Till.state().prods.slice(0, 12).map(function (p) { return p.pid; }); }));
    console.log('§KDS_SETUP reachable products=' + J(PIDS));
    var zeros = async function (d) { var t = await T.rows(d, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pos_kitchen%'"); var n = 0; for (var x of t) n += Number((await T.rows(d, 'SELECT count(*) AS n FROM ' + x.name))[0].n); return n; };
    ARM = 'branch';
    check('K0-empty-start', (await zeros(Tl)) === 0 && (await zeros(Kt)) === 0 && (await zeros(A)) === 0, 'non-vacuous start: 0 kitchen rows on the till, the kitchen and head office', null);
  }

  // ═══ BRANCH
  if (setupOk && ARMS.indexOf('branch') >= 0) {
    ARM = 'branch'; console.log('§B1 head office goes OFFLINE; the till sends an order; the kitchen takes it; the kitchen bumps; the till is told');
    await A.ctx.setOffline(true);
    var offA = await A.pg.evaluate(function () { return navigator.onLine; });
    check('b1-hq-offline', offA === false, 'head office is offline (navigator.onLine false) for the whole arm', offA);
    await clickProduct(PIDS[0]); await clickProduct(PIDS[0]); await clickProduct(PIDS[1]);
    var s1 = await sendOrder();
    check('b2-send-order', s1.r && s1.r.rows === 2 && s1.r.seq === 1, 'Send Order writes ONE generation of 2 kitchen rows (replace-all, seq 1) for order ' + (s1.r && s1.r.ref), s1.r);
    await kTick();
    var kr = await kOrder(s1.r.ref);
    if (kr.length !== 2) { console.log('   §KDS_DEBUG folder m/: ' + J(walk(FOLDER, '', []).filter(function (n) { return /\/m\//.test(n); }))); console.log('   §KDS_DEBUG K requests: ' + J(REQ.filter(function (r) { return r.dev === 'K'; }).slice(-14).map(function (r) { return r.m + ' ' + r.p.slice(0, 120) + ' ' + r.q.slice(0, 90); })));
      console.log('   §KDS_DEBUG K peek: ' + J(await Kt.pg.evaluate(function () { return window.Kitchen.engine().TeamSync.peekBranch(); })));
      console.log('   §KDS_DEBUG K ops: ' + J(await T.comm(Kt, "SELECT op_type, target_table, state, author_seq FROM cl_op WHERE envelope LIKE '%pos_kitchen%'")));
      console.log('   §KDS_DEBUG K verdicts: ' + J(await eng(Kt, async function (W) { var st = W.TeamSync.store(), L = await st.order(), out = [], hs = st.db.exec("SELECT op_hash FROM cl_op WHERE envelope LIKE '%pos_kitchen%'"); (hs.length ? hs[0].values : []).forEach(function (r) { out.push([r[0].slice(0, 8), JSON.stringify(L.verdict[r[0]] || null).slice(0, 300)]); }); return out; })));
      console.log('   §KDS_DEBUG K cfetched: ' + J(await T.comm(Kt, "SELECT name FROM cl_fetched WHERE name LIKE '%/m/%'"))); console.log('   §KDS_DEBUG K cl_sealed: ' + J(await T.comm(Kt, 'SELECT count(*) FROM cl_sealed'))); ['T', 'K'].forEach(function (n) { var d = n === 'T' ? Tl : Kt; console.log('   §KDS_DEBUG ' + n + ' log: ' + J(d.logs.filter(function (l) { return /TEAM_VISIT|COMM_SYNC|COMM_SEAL|COMM_KEY|REFUS|PARKED|TEAM_REPLICA|🔴/.test(l); }).slice(-6).map(function (l) { return l.slice(0, 700); }))); }); }
    check('b3-kitchen-has-lines', kr.length === 2 && kr.every(function (r) { return Number(r.seq) === 1 && r.kind === 'L'; }) && Number(kr[0].qty) === 2 && Number(kr[1].qty) === 1, 'the kitchen device holds the 2 lines (Qty 2 and 1) with head office offline', kr);
    var cards = await pk.$$eval('.kcard', function (c) { return c.map(function (x) { return [x.getAttribute('data-ref'), x.querySelectorAll('.kline').length]; }); });
    check('b4-kitchen-card', cards.length >= 1 && cards.some(function (c) { return c[0] === s1.r.ref && c[1] === 2; }), 'the kitchen page shows ONE card for order ' + s1.r.ref + ' with 2 lines', cards);
    await soft(pk, '.kcard[data-ref="' + s1.r.ref + '"] button[data-act="D"]'); await sleep(500);
    await tTick();
    var st = await T.rows(Tl, "SELECT * FROM pos_kitchenstatus WHERE orderref='" + s1.r.ref + "'"), tn = await pg.evaluate(function () { return window.Till.state().kitchen; });
    check('b5-bump-reaches-till', st.length === 1 && st[0].state === 'D' && Number(st[0].line) === 0 && tn[s1.r.ref] && tn[s1.r.ref].state === 'ready', 'the bump (Done) reaches the till with head office offline: status D, notice "ready"', { st: st, tn: tn });
    var chip = await pg.$eval('#kchip', function (e) { return [e.hidden, e.textContent]; }).catch(function () { return null; });
    var tlog = Tl.logs.filter(function (l) { return /^§TILL_KITCHEN_NOTICE order=/.test(l); });
    check('b6-till-notice', tlog.length === 1 && /ready/.test(tlog[0]), 'the till raised exactly ONE "ready" notice (§TILL_KITCHEN_NOTICE) for the order', { tlog: tlog, chip: chip });
    // head office: still offline = nothing; then ONLINE and visiting = still nothing
    var aOff = { tables: await T.rows(A, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pos_kitchen%'") };
    await A.ctx.setOffline(false); var mkA = mark(); await visitAll([A, Tl, Kt, A], 2);
    var aReq = since(mkA).filter(function (r) { return r.dev === 'A'; }), aBox = aReq.filter(function (r) { return /\/m\/b_/.test(r.p + r.q); });
    var aOps = await T.comm(A, "SELECT count(*) FROM cl_op WHERE envelope LIKE '%pos_kitchen%'"), aFetched = await T.comm(A, "SELECT count(*) FROM cl_fetched WHERE name LIKE '%/m/b_%'"), aPhys = await T.rows(A, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pos_kitchen%'");
    var kOps = await T.comm(Kt, "SELECT count(*) FROM cl_op WHERE envelope LIKE '%pos_kitchen%'"), kFetched = await T.comm(Kt, "SELECT count(*) FROM cl_fetched WHERE name LIKE '%/m/b_%'");
    console.log('§KDS_HQ head office after going online and 2 rounds of Visits: requests=' + aReq.length + ' requests_into_branch_box=' + aBox.length + ' kitchen_ops_in_its_log=' + aOps[0][0] + ' branch_bundles_fetched=' + aFetched[0][0] + ' physical_kitchen_tables=' + aPhys.length + ' | kitchen: ops_in_log=' + kOps[0][0] + ' branch_bundles_fetched=' + kFetched[0][0]);
    check('b7-hq-gets-0-rows', Number(aOps[0][0]) === 0 && Number(aFetched[0][0]) === 0 && aPhys.length === 0 && aOff.tables.length === 0, 'head office receives 0 kitchen rows: 0 kitchen ops in its comm log, 0 branch-box bundles fetched, no kitchen table', { aOps: aOps, aFetched: aFetched, aPhys: aPhys });
    check('b8-hq-not-vacuous', aReq.length > 0 && Number(kOps[0][0]) > 0 && Number(kFetched[0][0]) > 0, 'non-vacuous: head office DID Visit (' + aReq.length + ' requests) while the kitchen holds kitchen ops (' + kOps[0][0] + ') and fetched branch bundles (' + kFetched[0][0] + ')', { aReq: aReq.length, kOps: kOps, kFetched: kFetched });
    check('b9-hq-never-lists-branch-box', aBox.length === 0, 'head office made 0 pipe requests into the branch box (m/b_*)', aBox.slice(0, 3));
    var boxes = walk(FOLDER, '', []).filter(function (n) { return /\/m\/b_[^/]+\/o\//.test(n); });
    check('b10-traffic-used-branch-box', boxes.length >= 2, 'the kitchen traffic really used the branch box on the pipe (' + boxes.length + ' bundles under m/b_<org>/)', boxes.slice(0, 3));
  }

  // ═══ REPLACE
  if (setupOk && ARMS.indexOf('replace') >= 0) {
    ARM = 'replace'; console.log('§R1 re-sending an edited ticket replaces its kitchen lines; changed lines are marked; void and recall come back');
    var sel = '.kcard';
    await pg.evaluate(function () { var S = window.Till.state(); S.ticket = { type: 'S', lines: [], sel: -1, pickup: null, old: null, orig: null, table: null }; window.Till.persist(); window.Till.go('sales'); });      // a fresh ticket: its own pick-up number, generation 1
    await clickProduct(PIDS[2]); await clickProduct(PIDS[2]); await clickProduct(PIDS[3]);
    var n0 = await pg.evaluate(function () { return window.Till.state().ticket.lines.map(function (l) { return [l.name, l.qty]; }); });
    var r1 = await sendOrder(); await kTick();
    var ref = r1.r.ref, g1 = await kOrder(ref);
    check('r1-first-send', g1.length === 2 && g1.every(function (r) { return Number(r.seq) === 1; }), 'send 1 of order ' + ref + ': 2 lines, generation 1 on the kitchen', g1);
    // edit: line 1 quantity 2 -> 3, line 2 removed, a new product added
    await pg.evaluate(function () { var S = window.Till.state(); S.ticket.sel = 0; });
    await pg.click('#east .key[data-key="*"]'); await pg.click('#east .key[data-key="3"]'); await pg.click('#east .key[data-key="+"]');       // 5.0 pad: "* n +" on a selected line sets its quantity to n (JPanelTicket.java:1642-1685; probed: por=x3 -> setLine qty 3)
    await pg.evaluate(function () { var S = window.Till.state(); S.ticket.sel = 1; }); await pg.click('#b-remove');
    await clickProduct(PIDS[4]);
    var n1 = await pg.evaluate(function () { return window.Till.state().ticket.lines.map(function (l) { return [l.name, l.qty]; }); });
    var r2 = await sendOrder(); await kTick();
    var cur = (await T.rows(Kt, "SELECT * FROM pos_kitchenorder WHERE orderref='" + ref + "' AND seq=(SELECT max(seq) FROM pos_kitchenorder WHERE orderref='" + ref + "') ORDER BY line")), all = await kOrder(ref);
    var cardLines = await pk.$$eval('.kcard[data-ref="' + ref + '"] .kline', function (l) { return l.map(function (x) { return [x.textContent, x.getAttribute('data-mark'), x.getAttribute('data-line')]; }); });
    check('r2-resend-replaces', r2.r.seq === 2 && cur.length === n1.length && J(cur.map(function (r) { return [r.details, Number(r.qty)]; })) === J(n1.map(function (l) { return [l[0], Number(l[1])]; })), 'the re-send is generation 2 and the current queue of order ' + ref + ' is exactly the edited ticket (' + J(n1) + ')', { cur: cur, n1: n1 });
    var shown = cardLines.filter(function (c) { return c[1] !== 'removed'; });
    check('r3-card-shows-only-new-lines', shown.length === n1.length && !shown.some(function (c) { return c[0].indexOf(n0[1][0]) >= 0; }), 'the card shows only the NEW lines: the removed product is not an active line (replace-all, not append): ' + J(cardLines.map(function (c) { return c[0]; })), { cardLines: cardLines, n0: n0 });
    var marks = cardLines.map(function (c) { return c[1]; }).sort();
    check('r4-changed-lines-marked', marks.indexOf('changed') >= 0 && marks.indexOf('added') >= 0 && marks.indexOf('removed') >= 0, 'changed lines are marked on the card: one changed (qty), one added, one removed (URY): marks=' + J(marks), { cardLines: cardLines });
    var flag = await pk.$eval('.kcard[data-ref="' + ref + '"]', function (e) { return e.getAttribute('data-modified'); }).catch(function () { return null; });
    check('r5-card-flagged-modified', flag === '1', 'the card is flagged Modified', flag);
    check('r5b-history-kept', all.length === 2 + n1.length, 'the earlier generation stays in the op log (append-only): ' + all.length + ' rows for the order = 2 + ' + n1.length, all.length);
    // item done (Floreant per-item) then ticket void
    await soft(pk, '.kcard[data-ref="' + ref + '"] .kline[data-line="1"]'); await sleep(400);
    var it = await T.rows(Kt, "SELECT * FROM pos_kitchenstatus WHERE orderref='" + ref + "' AND line=1");
    check('r6-item-done', it.length === 1 && it[0].state === 'D' && Number(it[0].seq) === 2, 'tapping an item writes a per-item Done row for the CURRENT generation', it);
    await soft(pk, '.kcard[data-ref="' + ref + '"] button[data-act="V"]'); await sleep(500);
    await tTick();
    var tv = await pg.evaluate(function () { return window.Till.state().kitchen; }), tvl = Tl.logs.filter(function (l) { return /^§TILL_KITCHEN_NOTICE order=/.test(l); });
    check('r7-void-reaches-till', tv[ref] && tv[ref].state === 'void' && tvl.some(function (l) { return l.indexOf('order=' + ref + ' ') >= 0 && /void/.test(l); }), 'a Void on the kitchen reaches the till: notice state "void" for order ' + ref, { tv: tv[ref], tvl: tvl });
    // recall brings the newest bump back
    var openBefore = await pk.$$('.kcard[data-ref="' + ref + '"]');
    await soft(pk, '#k-recall'); await sleep(500); await tTick();
    var openAfter = await pk.$$('.kcard[data-ref="' + ref + '"]'), tr = await pg.evaluate(function () { return window.Till.state().kitchen; });
    check('r8-recall', openBefore.length === 0 && openAfter.length === 1 && tr[ref] && tr[ref].state === 'waiting', 'Recall puts the last bumped ticket back on the board (state W) and the till sees "waiting" again', { before: openBefore.length, after: openAfter.length, tr: tr[ref] });
    // a new send after a bump re-opens; a bump then an emptied ticket cancels
    await soft(pk, '.kcard[data-ref="' + ref + '"] button[data-act="D"]'); await sleep(500);
    await pg.evaluate(function () { window.Till.go('sales'); }); await clickProduct(PIDS[5]);
    var r3 = await sendOrder(); await kTick();
    var reopened = await pk.$$('.kcard[data-ref="' + ref + '"]');
    check('r9-resend-after-done-reopens', r3.r.seq === 3 && reopened.length === 1, 'a new send (generation 3) after a Done re-opens the card', { seq: r3.r && r3.r.seq, cards: reopened.length });
    await pg.evaluate(function () { var S = window.Till.state(); S.ticket.lines = []; S.ticket.sel = -1; window.Till.persist(); window.Till.go('sales'); });
    var r4 = await sendOrder(); await kTick();
    var canc = await pk.$eval('.kcard[data-ref="' + ref + '"]', function (e) { return [e.getAttribute('data-cancelled'), e.querySelectorAll('.kline:not(.removed)').length]; }).catch(function () { return null; });
    check('r10-emptied-ticket-cancels', r4.r && r4.r.seq === 4 && canc && canc[0] === '1' && canc[1] === 0, 'an emptied ticket re-sent = replace-all with no lines: the card shows "Cancelled by the till" and no active line', { r4: r4.r, canc: canc });
  }

  // ═══ RELAY
  if (setupOk && ARMS.indexOf('relay') >= 0) {
    ARM = 'relay'; console.log('§L1 relay requests per Send Order and per bump; lines must not multiply them');
    var out = {};
    async function oneOrder(nLines) {
      await pg.evaluate(function () { var S = window.Till.state(); S.ticket = { type: 'S', lines: [], sel: -1, pickup: null, old: null, orig: null, table: null }; window.Till.persist(); window.Till.go('sales'); });
      for (var i = 0; i < nLines; i++) await clickProduct(PIDS[i]);
      var s = await sendOrder(); var rk = await kTick(), ref = s.r && s.r.ref, ok = await pk.$$('.kcard[data-ref="' + ref + '"]');
      var mkB = mark(); await soft(pk, '.kcard[data-ref="' + ref + '"] button[data-act="D"]'); await sleep(600); var bump = since(mkB); var rt = await tTick();
      return { lines: nLines, ref: ref, send: s.req.length, sendPuts: s.req.filter(function (r) { return r.m === 'PUT'; }).length, recv: rk.length, recvPuts: rk.filter(function (r) { return r.m === 'PUT'; }).length, bump: bump.length, bumpPuts: bump.filter(function (r) { return r.m === 'PUT'; }).length, bumpRecv: rt.length, delivered: ok.length === 1 };
    }
    for (var nl of [1, 3, 8]) { out[nl] = await oneOrder(nl); console.log('§KDS_RELAY lines=' + nl + ' | Send Order: till requests=' + out[nl].send + ' (puts ' + out[nl].sendPuts + ') + kitchen takes it: requests=' + out[nl].recv + ' (puts ' + out[nl].recvPuts + ') = ' + (out[nl].send + out[nl].recv) + ' per delivered order | bump: kitchen requests=' + out[nl].bump + ' (puts ' + out[nl].bumpPuts + ') + till takes it: requests=' + out[nl].bumpRecv + ' = ' + (out[nl].bump + out[nl].bumpRecv) + ' per delivered bump | delivered=' + out[nl].delivered); }
    // the idle poll: a peek (ONE list) vs a full Visit as the poll
    var mq = mark(); await pk.evaluate(function () { return window.Kitchen.tick(); }); var quiet = since(mq);
    var mv = mark(); await pk.evaluate(function () { return window.Kitchen.visit(); }); var fullv = since(mv);
    console.log('§KDS_RELAY idle poll: peek requests=' + quiet.length + ' (candidate B, the shipped poll) | a full Visit as the poll requests=' + fullv.length + ' (candidate A)');
    var per = function (n) { return out[n].send + out[n].recv; }, perB = function (n) { return out[n].bump + out[n].bumpRecv; };
    check('l1-delivered', [1, 3, 8].every(function (n) { return out[n].delivered; }), 'each order of 1, 3 and 8 lines was delivered and bumped', out);
    check('l2-send-not-growing-with-lines', per(8) <= per(1) && per(3) <= per(1), 'requests per delivered Send Order do NOT grow with the lines: 1 line -> ' + per(1) + ', 3 -> ' + per(3) + ', 8 -> ' + per(8), out);
    check('l3-bump-not-growing', perB(8) <= perB(1) && perB(3) <= perB(1), 'requests per delivered bump do not grow with the lines: ' + perB(1) + ' / ' + perB(3) + ' / ' + perB(8), out);
    check('l4-idle-poll-is-one-request', quiet.length === 1 && quiet[0].m === 'GET', 'a quiet poll is ONE list request (measured ' + quiet.length + ')', quiet);
    check('l5-peek-cheaper-than-visit-poll', quiet.length < fullv.length, 'the peek poll (' + quiet.length + ') is cheaper than polling with a full Visit (' + fullv.length + ')', { quiet: quiet.length, full: fullv.length });
    check('l6-one-batch-per-send', out[8].sendPuts <= out[1].sendPuts, 'puts per Send Order do not grow with lines (1 line ' + out[1].sendPuts + ', 8 lines ' + out[8].sendPuts + ')', out);
  }

  console.log('§KDS_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §KDS_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the three pages');
  await browser.close(); server.close();
  var names = { branch: 'W-KDS-BRANCH', replace: 'W-KDS-REPLACE', relay: 'W-KDS-RELAY' }, bad = 0;
  ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§KDS_VERDICT ' + names[a] + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§KDS_CRASH ' + (e && e.stack || e)); process.exit(3); });
