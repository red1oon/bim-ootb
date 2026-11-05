#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-COMPANY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §36.4-§36.6, §36.8). READ THE LOG (/tmp/theme_logs/company.log): every verdict is a § line; the exit code is not the evidence.
//   An empty population prints INCONCLUSIVE; a mutant is a COPY served by the harness, proven applied exactly once; a crash is not a kill.
// THE ISSUE: the owner asked the till to "load own corporate logo and about company details". Judged on REAL devices (harness copied from witness_soda_ui.js: head office A, branch POS admin D, tills T1 T2 T3, signed POS plan, one dumb folder pipe):
//   K0 GardenWorld has NO logo in legacy's columns (AD_OrgInfo.Logo_ID, AD_ClientInfo.Logo_ID/LogoReport_ID/LogoWeb_ID) - the till shows a placeholder initial and logs logo=none (nothing invented);
//   K1 the company (AD_Org.Name + AD_OrgInfo + C_Location, read from HQ's own rows) reaches every till in the SODA batch as ONE Kind 'O' row and shows in the About screen;
//   K2 an Org Info edit at HQ (tax id, phone, email, a logo AD_Image.ImageURL) -> SODA -> About, the top-strip brand and the RECEIPT HEADER show it, the logo is an <img> of that URL;
//   K3 UNCHANGED details never travel (a later batch holds 0 'O' rows); only the org's own row travels (HQ passes ALL orgs, one arrives);
//   K4 the logo's BYTES are not in IndexedDB (the harness serves a PNG carrying a unique marker; non-vacuous: it was fetched; the marker is searched in every IDB value of the till); K5 one changed field updates the About.
// Mutant: COMPANY_MUT=till-no-apply (a copy of erp/till.js that drops the company apply). Run: node erp/tests/witness_till_company.js 2>&1 | tee /tmp/theme_logs/company.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = process.env.SODA_ROOT || path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var ARMS = ['co'], MUTNAME = process.env.COMPANY_MUT || '', LOGS = '/tmp/theme_logs';
var V = { co: { judged: 0, failed: 0 } }, errors = [], ARM = 'co';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §COMPANY_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 600))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var money = function (c) { return (Number(c) / 100).toFixed(2); }, toCents = function (s) { return Math.round(Number(s) * 100); };

// mutants: [file, anchor (must occur exactly once), replacement, arm that must go red]
var MUTS = {
  'till-no-apply': ['/erp/till.js', "var cres = comp.length && window.TillCompany ? window.TillCompany.apply(comp) : null;", "var cres = null;", 'co']
};

(async function main() {
  console.log('═══ W-TILL-COMPANY (prompts/POS_PLUGIN_LOCAL_FIRST.md §36) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'eoda-')), cur = { plans: {}, over: {} };
  var haveAdmin = fs.existsSync(path.join(ROOT, 'erp', 'branch_admin.html'));
  if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§COMPANY_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§COMPANY_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); console.log('§COMPANY_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]]; }
  var REQ = [], LOGOREQ = 0, LOGOMARK = 'COMPANY-LOGO-MARKER-7f3a9c21d4e8b650';
  var crc = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return function (b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
  var LOGO = (function () { var png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), body = Buffer.concat([Buffer.from('Comment\0'), Buffer.from(LOGOMARK)]), len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    var ty = Buffer.concat([Buffer.from('tEXt'), body]), cc = Buffer.alloc(4); cc.writeUInt32BE(crc(ty)); var chunk = Buffer.concat([len, ty, cc]); return Buffer.concat([png.slice(0, png.length - 12), chunk, png.slice(png.length - 12)]); })();
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/logo/store_central.png') { LOGOREQ++; res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' }); res.end(LOGO); return; }
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
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(SODA|EODA|TEAM_HELD|TEAM_HOLD|MV-TIP-SHADOW)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 300)); });
    pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname !== '127.0.0.1') { NET.aborted.push(u.host); return route.abort('blockedbyclient'); }
      if (u.pathname.indexOf('/pipe/') === 0) REQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' }); return route.continue(); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600';
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Till ? window.Till.engine() : window.BranchAdmin ? window.BranchAdmin.engine() : window; return (' + fn.toString() + ')(W, ' + J(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); }, join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); }, enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §EODA_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { try { res(trx.q(q)); } catch (e) { res({ error: String(e && e.message) }); } return { ok: true }; } }, function () {}); }); }, sql); }
  };
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) for (var i = 0; i < devs.length; i++) await T.visit(devs[i]); }
  var mark = function () { return REQ.length; }, since = function (mk) { return REQ.slice(mk); };
  // lanes of a PUT: 'branch' = the branch box m/b_<org>/ (head office never reads it); 'hub' = an op bundle (/o/) outside it = DATA head office reads; 'house' = heartbeat / frontier / receipt files (h, f, r), carry no ticket
  var lane = function (r) { return /\/m\/b_/.test(r.p + r.q) ? 'branch' : /\/o\//.test(r.p + r.q) ? 'hub' : 'house'; };
  var puts = function (arr, dev, ln) { return arr.filter(function (r) { return r.m === 'PUT' && (!dev || r.dev === dev) && (!ln || lane(r) === ln); }).length; };

  // ═══ setup: head office A, the branch POS admin D, tills T1 T2 T3 (distinct logins = distinct till keys)
  console.log('§E0 setup: head office A (founder, POS plan), the branch POS admin D and three tills (role 50004, Bound to the branch Org 12)');
  var A = await open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsBase, function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; });
  await A.pg.evaluate(function () { return window.TeamSync.ready; });
  var D = haveAdmin ? await open('D', '/erp/branch_admin.html?login=50001' + qsBase, function () { return window.BranchAdmin && window.BranchAdmin.ready; }).catch(function (e) { console.log('§COMPANY_PAGE branch_admin.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; }) : null;
  if (!D) console.log('§COMPANY_PAGE erp/branch_admin.html is ' + (haveAdmin ? 'present but did not boot' : 'ABSENT') + ' (RED: the branch POS admin is not built)');
  var tillLogins = [50001, 102, 101], TL = [];
  for (var i = 0; i < 3; i++) TL.push(await open('T' + (i + 1), '/erp/till.html?login=' + tillLogins[i] + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§COMPANY_PAGE till T' + (i + 1) + ' did not boot: ' + String(e && e.message).slice(0, 160)); return null; }));
  var setupOk = !!D && TL.every(Boolean);
  if (!setupOk) { ARMS.forEach(function (a) { ARM = a; check('e0-devices-boot', false, 'the branch POS admin and 3 tills boot', { admin: !!D, tills: TL.map(Boolean) }); }); }
  var space = await T.found(A), org = (await T.rows(A, 'SELECT ad_org_uu AS uu FROM ad_org WHERE ad_org_id=12'))[0];
  var devs = setupOk ? [D].concat(TL) : [];
  for (var d of devs) await T.join(d, space);
  for (var k = 0; k < 10 && setupOk; k++) { for (var d of devs) await T.approve(A, await T.kid(d), 50004, org.uu); await visitAll(devs.concat([A])); var en = []; for (var d of devs) en.push(await T.enrolled(d)); if (en.every(Boolean)) break; await sleep(300); }
  if (setupOk) await visitAll(devs.concat([A]), 2);
  var tillKeys = [], pgs = TL.map(function (t) { return t && t.pg; });
  if (setupOk) {
    var enr = []; for (var d of devs) enr.push(await T.enrolled(d)); ARM = ARMS[0];
    check('e0-enrolled', enr.every(Boolean), 'the admin and the three tills are enrolled (role 50004, Bound to Org 12)', enr);
    for (var t of TL) tillKeys.push(await t.pg.evaluate(function () { return window.Till.state().cfg.tillKey; }));
    check('e0-distinct-tills', tillKeys.length === 3 && tillKeys.filter(function (x, i, a) { return a.indexOf(x) === i; }).length === 3, 'the three tills have three different till keys: ' + J(tillKeys), tillKeys);
    var zero = []; for (var d of [A, D]) zero.push(Number((await T.rows(d, 'SELECT (SELECT count(*) FROM i_order) + (SELECT count(*) FROM i_payment) AS n'))[0].n));
    check('e0-empty-start', zero[0] === 0 && zero[1] === 0, 'non-vacuous start: 0 I_Order / I_Payment rows at head office and at the admin', zero);
  }

  // ── till helpers (the delivery witness' UI path)
  async function clickProduct(pg, pid) { async function vis() { return (await pg.$('#products .prod[data-pid="' + pid + '"]')) !== null; } if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
    var cats = await pg.$$eval('#cats [data-cat]', function (b) { return b.map(function (x) { return x.getAttribute('data-cat'); }); });
    for (var c of cats) { await pg.click('#cats [data-cat="' + c + '"]'); if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; } if (await pg.$('#cats [data-cat-up]')) await pg.click('#cats [data-cat-up]'); } return false; }
  async function pay(pg, tab) { var tot = await pg.$eval('#t-tot', function (e) { return e.textContent; }); await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); await pg.click('#tabs [data-tab="' + tab + '"]'); await pg.fill('#tender-amount', tot); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
    var key = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.getAttribute('data-v'); }); await pg.click('#rc-ok'); return key; }
  var rung = [[], [], []], SHAPE = {};
  async function ring(ti, n, bankIdx) { var pg = pgs[ti]; for (var i = 0; i < n; i++) { await clickProduct(pg, 128); if (i % 2 === 0) await clickProduct(pg, 129); var key = await pay(pg, i === bankIdx ? 'bank' : 'cash'); rung[ti].push(key); SHAPE[key] = i % 2 === 0 ? 2 : 1; } }
  async function closeShift(ti) { var pg = pgs[ti], mk = mark(); await pg.evaluate(function () { window.Till.go('close'); }); await sleep(400); await pg.click('#zclose'); await pg.click('#zconfirm'); await pg.waitForFunction(function () { return /Cash Closed OK/.test(document.querySelector('#zdone').textContent); }, null, { timeout: 30000 }); await sleep(1500); return since(mk); }
  function zOf(t) {   // the till's OWN Z line (§TILL_Z, printed by renderClose before the close): the oracle independent of the hand-off rows
    var ci = -1; t.logs.forEach(function (l, i) { if (/^§TILL_CLOSE closed=/.test(l)) ci = i; });
    for (var i = ci; i >= 0; i--) { var mm = /^§TILL_Z seq=(\d+) tickets=(\d+) units=\S+ gross=(\S+) net=(\S+) payments=(\d+) bytender=(\{.*?\}) removed=/.exec(t.logs[i]); if (mm) return { tickets: Number(mm[2]), gross: toCents(mm[3]), net: toCents(mm[4]), tenders: JSON.parse(mm[6]) }; }
    return null; }

  // ── the logo the harness serves (a valid 1x1 PNG + a tEXt chunk carrying a unique 32-byte marker: the bytes whose absence from IndexedDB K4 proves)
  var stage = {}, SC = (function () { try { return require(path.join(ROOT, 'erp', 'soda_core.js')); } catch (e) { return null; } })();
  var cr = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };
  var rowsOf = async function (d, sql) { var r = await T.rows(d, sql); return Array.isArray(r) ? r : []; };
  ARM = 'co';
  if (!SC) { check('ABSENT', false, 'erp/soda_core.js is absent', {}); setupOk = false; }
  if (setupOk) {
    var admin = D.pg, T1 = TL[0];
    var qc = "SELECT o.ad_org_id, o.name, o.value, o.isactive, i.taxid, i.phone, i.phone2, i.fax, i.email, i.receiptfootermsg, l.address1, l.address2, l.city, l.postal, c.name AS country, img.imageurl AS logo_url, " +
      "MAX(COALESCE(o.updated,''), COALESCE(i.updated,''), COALESCE(l.updated,''), COALESCE(img.updated,'')) AS updated FROM ad_org o LEFT JOIN ad_orginfo i ON i.ad_org_id=o.ad_org_id LEFT JOIN c_location l ON l.c_location_id=i.c_location_id " +
      "LEFT JOIN c_country c ON c.c_country_id=l.c_country_id LEFT JOIN ad_image img ON img.ad_image_id=COALESCE(i.logo_id, (SELECT logo_id FROM ad_clientinfo WHERE ad_client_id=11)) WHERE o.ad_client_id=11";
    var hq1 = async function (ops) { return eng(A, function (W, o) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 60000); W.__crud.applyOpGroup(o, function (r) { clearTimeout(t); res(r); }); }); }, ops); };
    // ═══ K0 GardenWorld's logo columns
    var lg = (await rowsOf(A, 'SELECT (SELECT count(*) FROM ad_orginfo WHERE logo_id IS NOT NULL) AS oi, (SELECT count(*) FROM ad_clientinfo WHERE logo_id IS NOT NULL OR logoreport_id IS NOT NULL OR logoweb_id IS NOT NULL) AS ci, (SELECT count(*) FROM ad_orginfo) AS n'))[0];
    console.log('§COMPANY_K0 AD_OrgInfo rows=' + lg.n + ' with Logo_ID=' + lg.oi + ' | AD_ClientInfo rows with a logo column=' + lg.ci + ' => GardenWorld logo: ' + (lg.oi + lg.ci === 0 ? 'NONE' : 'PRESENT'));
    check('K0-no-logo-in-legacy-data', lg.n > 0 && lg.oi === 0 && lg.ci === 0, 'non-vacuous (' + lg.n + ' AD_OrgInfo rows): no org and no client info carries a logo, so none is shown or invented', lg);
    var companyRows = async function () { return rowsOf(A, qc); };
    var batch = async function (seq, since, upto, label) {
      var C = await companyRows(), d = SC.refDelta({ since: since, upto: upto, batchId: 'C-' + label, seq: seq, client: 11, org: 12, version: 0, prices: [], products: [], taxes: [], company: C });
      var g = await hq1(d.rows.map(function (r) { return cr('pos_sodaref', r); })); await T.visit(A); return { d: d, group: g, all: C.length };
    };
    var deliver = async function () { await visitAll([D, A, D], 1); await admin.evaluate(function () { return window.BranchAdmin.fan(); }); for (var t of TL) await t.pg.evaluate(function () { return window.Till.visit(); }).catch(function () {}); };
    var aboutOf = async function (t) { return t.pg.evaluate(function () { Till.go('about'); var q = function (s) { var e = document.querySelector(s); return e ? e.textContent : null; }; var im = document.querySelector('#ab-logo img'); return { text: q('#ab-co'), app: q('#ab-app'), logoBox: q('#ab-logo'), img: im ? { src: im.getAttribute('src'), w: im.naturalWidth, done: im.complete } : null, brand: q('#brand-name'), co: Till.state().store.company || null }; }); };
    // ═══ K1 first-ever batch (SendAll: since = the epoch): the company as legacy holds it
    var b1 = await batch(1, '2000-01-01 00:00:00', '2026-11-05 00:00:00', 'one');
    var oRows = b1.d.rows.filter(function (r) { return r.kind === 'O'; });
    console.log('§COMPANY_K1 batch rows=' + b1.d.rows.length + ' kinds=' + J(b1.d.rows.map(function (r) { return r.kind; })) + ' orgsPassed=' + b1.all + ' O=' + oRows.length + ' name=' + (oRows[0] && oRows[0].name));
    check('K1-one-own-row', oRows.length === 1 && b1.all >= 5 && oRows[0].ad_org_id === 12 && oRows[0].name === 'Store Central' && b1.group.committed === true, 'HQ passed ' + b1.all + ' orgs, ONE Kind O row travels: the till\'s own org (Store Central)', { n: oRows.length, all: b1.all });
    await deliver(); var a1 = await aboutOf(T1);
    console.log('§COMPANY_K1 about=' + J(a1.text) + ' logoBox=' + J(a1.logoBox) + ' img=' + J(a1.img));
    check('K1-about-shows-legacy-columns', a1.text && /Store Central/.test(a1.text) && /1000 Main Street/.test(a1.text) && /Westport 06555/.test(a1.text) && !/Tax ID/.test(a1.text), 'About shows AD_Org.Name + C_Location address from the batch; TaxID "?" (iDempiere\'s empty placeholder) is not printed', a1);
    check('K1-no-logo-placeholder', a1.img === null && a1.logoBox === 'S', 'no logo in legacy -> no <img>, a placeholder initial "S" in the theme colour (nothing invented)', { img: a1.img, box: a1.logoBox });
    var allTills = []; for (var t of TL) allTills.push((await aboutOf(t)).co && (await aboutOf(t)).co.name);
    check('K1-every-till', allTills.every(function (n) { return n === 'Store Central'; }), 'all three tills hold the company', allTills);
    // ═══ K2 HQ edits Org Info the ordinary way (AD_OrgInfo + a logo AD_Image row), SODA again
    var LOGOURL = base + '/logo/store_central.png', st2 = '2026-11-05 08:00:00', oi = (await rowsOf(A, 'SELECT * FROM ad_orginfo WHERE ad_org_id=12'))[0];
    var mkImg = await hq1([cr('ad_image', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: 'store_central_logo.png', imageurl: LOGOURL, created: st2, updated: st2 })]), imgRow = (await rowsOf(A, "SELECT ad_image_id FROM ad_image WHERE name='store_central_logo.png'"))[0] || {};
    check('K2-logo-image-created', mkImg && mkImg.committed === true && imgRow.ad_image_id != null, 'the logo is an AD_Image row whose ImageURL is a URL (bytes NOT stored): created and read back', { mk: mkImg, row: imgRow });
    var ed = await hq1([{ op_type: 'CRUD_UPDATE', key: 'ad_orginfo', table: 'ad_orginfo', verb: 'update', id: oi.ad_orginfo_uu, idCol: 'ad_orginfo_uu', changes: { taxid: { old: oi.taxid, new: 'TX-4242' }, phone: { old: oi.phone, new: '+1 555 0100' }, email: { old: oi.email, new: 'store@gardenworld.example' }, logo_id: { old: oi.logo_id, new: imgRow.ad_image_id }, updated: { old: oi.updated, new: st2 } } }]);
    var oi2 = (await rowsOf(A, 'SELECT taxid, phone, logo_id, updated FROM ad_orginfo WHERE ad_org_id=12'))[0];
    check('K2-edit-committed', ed && ed.committed === true && oi2.taxid === 'TX-4242' && Number(oi2.logo_id) === Number(imgRow.ad_image_id) && String(oi2.updated).slice(0, 19) === st2, 'the Org Info edit committed at HQ and was READ BACK (tax id, logo id, Updated)', { ed: ed, oi2: oi2 });
    var b2 = await batch(2, '2026-11-05 00:00:01', '2026-11-05 09:00:00', 'two'), o2 = b2.d.rows.filter(function (r) { return r.kind === 'O'; });
    check('K2-one-O-row-with-logo-url', o2.length === 1 && o2[0].imageurl === LOGOURL && JSON.parse(o2[0].detail).taxid === 'TX-4242', 'the batch holds ONE O row carrying the logo URL (a string) and the new tax id', { n: o2.length, url: o2[0] && o2[0].imageurl });
    await deliver(); var a2 = await aboutOf(T1); await T1.pg.waitForFunction(function () { var i = document.querySelector('#ab-logo img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(function () {}); a2.img = await T1.pg.evaluate(function () { var im = document.querySelector('#ab-logo img'); return im ? { src: im.getAttribute('src'), w: im.naturalWidth, done: im.complete } : null; });
    console.log('§COMPANY_K2 about=' + J(a2.text) + ' img=' + J(a2.img) + ' brand=' + J(a2.brand));
    check('K2-about-shows-the-edit', /TX-4242/.test(a2.text) && /\+1 555 0100/.test(a2.text) && /store@gardenworld\.example/.test(a2.text), 'About shows the HQ edit: tax id, phone, email', a2.text);
    check('K2-logo-is-the-url', a2.img && a2.img.src === LOGOURL && a2.img.done && a2.img.w === 1, 'About shows the logo as an <img> of that URL and it decoded (naturalWidth 1)', a2.img);
    check('K2-brand-strip', a2.brand === 'Store Central', 'the top strip shows the company name', a2.brand);
    // receipt header: a real sale
    var pg = T1.pg; await pg.evaluate(function () { Till.go('sales'); }); await clickProduct(pg, 128);
    var tot = await pg.$eval('#t-tot', function (e) { return e.textContent; }); await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); await pg.click('#tabs [data-tab="cash"]'); await pg.fill('#tender-amount', tot); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
    var rc = await pg.$$eval('#receipt .rf', function (e) { return e.map(function (x) { return [x.getAttribute('data-f'), x.textContent]; }); }); await pg.click('#rc-ok');
    var hdrRaw = rc.filter(function (r) { return r[0] === 'header'; }).map(function (r) { return r[1]; }), hdr = hdrRaw.map(function (t) { return t.trim(); }), firstReceipt = rc.findIndex(function (r) { return r[0] === 'Receipt'; });
    console.log('§COMPANY_K2 receipt header=' + J(hdr) + ' logoLine=' + J(rc.filter(function (r) { return r[0] === 'header-logo'; }).length) + ' fields=' + J(rc.map(function (r) { return r[0]; }).slice(0, 12)));
    check('K2-receipt-header', hdr[0] === 'Store Central' && hdr.some(function (h) { return /TX-4242/.test(h); }) && hdr.some(function (h) { return /1000 Main Street/.test(h); }) && firstReceipt === hdr.length + rc.filter(function (r) { return r[0] === 'header-logo'; }).length, 'the receipt prints the company lines (name, address, tax id) BEFORE the Receipt lines, as Printer.Ticket.xml prints its header', { hdr: hdr, firstReceipt: firstReceipt });
    var imgN = await pg.evaluate(function () { return document.querySelectorAll('#receipt .rf[data-f="header-logo"] img').length; });   // §39 W-TILL-RECEIPT-COMPANY: centred in the template's 42 columns, logo as an image
    check('K2-receipt-header-grid', hdrRaw.length >= 3 && hdrRaw.every(function (t) { var l = t.length - t.trimStart().length, r = t.length - t.trimEnd().length; return t.length === 42 && Math.abs(l - r) <= 1; }) && imgN === 1, 'every company header line is centred in 42 columns (Printer.Ticket.xml:36-53) and the logo prints as one image', { hdrRaw: hdrRaw, imgN: imgN });
    // ═══ K3 unchanged details never travel
    var b3 = await batch(3, '2026-11-05 09:00:01', '2026-11-05 10:00:00', 'three'), co0 = J((await aboutOf(T1)).co);
    check('K3-unchanged-never-travels', b3.d.counts.company === 0 && b3.d.rows.every(function (r) { return r.kind !== 'O'; }) && b3.d.rows.length === 1 && b3.all >= 5, 'nothing changed since the last batch -> 0 O rows (header only), although HQ holds ' + b3.all + ' orgs', { counts: b3.d.counts, rows: b3.d.rows.length });
    await deliver(); check('K3-till-untouched', J((await aboutOf(T1)).co) === co0, 'the till\'s company record is byte-identical after the empty batch', null);
    // ═══ K4 the logo's bytes are not in IndexedDB
    var scan = await T1.pg.evaluate(async function (marker) {
      var hits = 0, scanned = 0, stores = 0, dbs = await indexedDB.databases(), enc = new TextEncoder().encode(marker);
      var has = function (u8) { outer: for (var i = 0; i + enc.length <= u8.length; i++) { for (var j = 0; j < enc.length; j++) if (u8[i + j] !== enc[j]) continue outer; return true; } return false; };
      var walk = async function (v, depth) { if (v == null || depth > 4) return; scanned++;
        if (v instanceof Blob) { if (has(new Uint8Array(await v.arrayBuffer()))) hits++; } else if (v instanceof ArrayBuffer) { if (has(new Uint8Array(v))) hits++; } else if (ArrayBuffer.isView(v)) { if (has(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))) hits++; }
        else if (typeof v === 'string') { if (v.indexOf(marker) >= 0) hits++; } else if (typeof v === 'object') { for (var k of Object.keys(v)) await walk(v[k], depth + 1); } };
      for (var d of dbs) { var db = await new Promise(function (res) { var r = indexedDB.open(d.name); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); if (!db) continue;
        for (var s of Array.from(db.objectStoreNames)) { stores++; var all = await new Promise(function (res) { var q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res([]); }; }); for (var v of all) await walk(v, 0); } db.close(); }
      return { hits: hits, scanned: scanned, stores: stores, dbs: dbs.length }; }, LOGOMARK);
    console.log('§COMPANY_K4 logo requests=' + LOGOREQ + ' idb=' + J(scan));
    check('K4-non-vacuous', LOGOREQ >= 1 && scan.stores > 0 && scan.scanned > 0, 'the logo WAS fetched by the device (' + LOGOREQ + ' request(s)) and ' + scan.scanned + ' IndexedDB values in ' + scan.stores + ' stores were scanned', { req: LOGOREQ, scan: scan });
    check('K4-logo-bytes-not-in-idb', scan.hits === 0, 'the logo\'s marker bytes occur 0 times in IndexedDB (only the URL string is in the device store)', scan);
    var urlInStore = await T1.pg.evaluate(function () { return typeof Till.state().store.company.imageurl; }); check('K4-url-is-a-string', urlInStore === 'string', 'the device keeps the logo as a URL string', urlInStore);
    // ═══ K5 one field changed
    var st5 = '2026-11-05 11:00:00', oi5 = (await rowsOf(A, 'SELECT * FROM ad_orginfo WHERE ad_org_id=12'))[0];
    await hq1([{ op_type: 'CRUD_UPDATE', key: 'ad_orginfo', table: 'ad_orginfo', verb: 'update', id: oi5.ad_orginfo_uu, idCol: 'ad_orginfo_uu', changes: { phone: { old: oi5.phone, new: '+1 555 0199' }, updated: { old: oi5.updated, new: st5 } } }]);
    var b5 = await batch(4, '2026-11-05 10:00:01', '2026-11-05 12:00:00', 'four'); await deliver(); var a5 = await aboutOf(T1);
    check('K5-one-field', b5.d.counts.company === 1 && /\+1 555 0199/.test(a5.text) && /TX-4242/.test(a5.text) && a5.img && a5.img.src === LOGOURL, 'a phone-only edit travels as one O row; About shows the new phone, keeps the tax id and the logo', { counts: b5.d.counts, text: a5.text });
  }
  console.log('§COMPANY_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §COMPANY_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the five pages');
  await browser.close(); server.close();
  var bad = 0; ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§COMPANY_VERDICT arm=' + a + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§COMPANY_CRASH ' + (e && e.stack || e)); process.exit(3); });
