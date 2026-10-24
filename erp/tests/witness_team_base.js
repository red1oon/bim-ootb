#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-BASE-EDIT (two real browsers + a third with the wrong seed), bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.I.1 / §13.12.I.2.
//   READ THE LOG after every run — the exit code is not evidence. An arm that judged nothing prints INCONCLUSIVE, never PASS.
//   Same harness as witness_team_docaction.js (REAL erp/idempiere.html, dumb folder pipe, no GitHub, no Gmail). The BASE is the REAL shipped erp/ad_seed.db.
//   §BASE-R1       BEFORE: a team founded WITHOUT a base (the phone page, as in W2): the Complete's m_storagereservation write is REFUSED scope-unknown; chip data-base=none.
//   §BASE-FOUND    AFTER: a team founded in the ERP pins ad_seed.db: genesis base sha256 == the sha256 node computes from the file on disk (independent oracle); both devices data-base=ok.
//   §BASE-EDIT     a seeded Business Partner (a base record, no CREATE in the log): role 102 edits it -> B sees it after a Visit; role 103 on an org-0 partner is REFUSED by the base
//                  row's scope (access:*) on BOTH devices and B's own screen reverts; role 103 on an org-11 partner is ADMITTED (so the refusal is the scope, not the role);
//                  an op on a uu that is in neither the log nor the base is REFUSED base-row-missing.
//   §BASE-COMPLETE AFTER: the same Complete in the base team: the m_storagereservation write is ADMITTED and B holds the same reservation update; refused counts printed before/after.
//   §BASE-MISMATCH a third device whose seed differs by ONE byte joins: its chip says so in plain words, data-base=mismatch, NOTHING is folded (control: B folds the same log), no crash.
//   Every arm names the issue it proves or disproves.
//   Mutation checks: MUTATE=baserow (the engine never asks the base row) and MUTATE=checkbase (checkBase always ok) serve a broken comm_store.js; this witness must go RED on both.
// Run: node erp/tests/witness_team_base.js 2>&1 | tee /tmp/witness_team_base.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, inconclusive = [], errors = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function sha1(b) { return crypto.createHash('sha1').update(b).digest('hex'); }
function kidOfName(n) { var p = n.split('/'); return (p.length >= 4 && p[0] === 's' && /^[0-9a-f]{64}$/.test(p[1]) && (p[2] === 'o' || p[2] === 'h' || p[2] === 'r' || p[2] === 'f')) ? p[3] : null; }

var MUT = process.env.MUTATE || '';
var SEED = path.join(ROOT, 'erp', 'ad_seed.db'), SEEDBUF = fs.readFileSync(SEED);
var sha256 = function (b) { return crypto.createHash('sha256').update(b).digest('hex'); };
// the base as team_sync.js hashes it (an INDEPENDENT oracle: node, not the page): the seed file, then the self-heal patch texts idempiere.html applies on every load
function patchOf(n) { var f = path.join(ROOT, 'erp', 'patches', n); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; }
function baseOracle(buf) { var man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n', n = buf.length;
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var t = patchOf(nm); man += '--patch ' + i + (t == null ? ' MISSING' : '\n' + t) + '\n'; if (t != null) n += Buffer.byteLength(t); });
  return { sha: sha256(Buffer.from(man, 'utf8')), bytes: n }; }
var SEED_ORA = baseOracle(SEEDBUF), SEED_SHA = SEED_ORA.sha;
var ALT = Buffer.from(SEEDBUF), altAt = -1;                              // the same file with ONE byte changed, inside unused page space (a run of zeros), so the database stays valid
for (var zi = 1 << 20, run = 0; zi < ALT.length; zi++) { if (ALT[zi] === 0) { if (++run >= 200) { altAt = zi - 100; break; } } else run = 0; }
if (altAt > 0) ALT[altAt] = 1;
var ALT_SHA = baseOracle(ALT).sha;

(async function () {
  console.log('═══ W-BASE-EDIT — the shared loaded DB with signed ops on top, in the real ERP (TEAMWORK_FRAMEWORK §13.12.I) ═══\n');
  console.log('§BASE-FILE ' + path.relative(ROOT, SEED) + ' file=' + SEEDBUF.length + ' B file-sha256=' + sha256(SEEDBUF).slice(0, 16) + ' | base (file + patches) sha256=' + SEED_SHA.slice(0, 16) + ' bytes=' + SEED_ORA.bytes + ' | altered copy (1 byte @' + altAt + ') base sha256=' + ALT_SHA.slice(0, 16));
  if (altAt < 0 || ALT_SHA === SEED_SHA) { console.log('§W-BASE-EDIT INCONCLUSIVE judged=0 fails=0 — could not make the one-byte altered seed'); process.exit(2); }
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-base-'));
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/patches/ad_seed_alt.db.sql') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(fs.readFileSync(path.join(ROOT, 'erp', 'patches', 'ad_seed.db.sql'))); return; }   // the altered device has the SAME patches: only ONE byte of the file differs
    if (p === '/erp/ad_seed_alt.db') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(ALT); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    if (MUT && p === '/common/comm/comm_store.js') {            // MUTATION CHECK: serve a broken engine; this witness must go RED
      var src = fs.readFileSync(f, 'utf8'), bad = MUT === 'baserow' ? src.replace('opts.baseRow && roster.base)', 'opts.baseRow && roster.base && false)') : MUT === 'checkbase' ? src.replace('if (have === want && bytesOk) return', 'if (true) return') : src;
      console.log('§BASE-MUTANT ' + MUT + (bad === src ? ' NOT APPLIED' : ' applied') + ' to ' + p); res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(bad); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';

  // ── a stand-in for api.github.com for the UNMODIFIED phone page (round 1 only): a thin view of the SAME folder ──
  var blobs = {}, trees = {}, commits = {}, commitKid = {};
  function namesByKid() { var m = {}; walk(FOLDER, '', []).forEach(function (n) { var k = kidOfName(n); if (k) (m[k] = m[k] || []).push(n); }); return m; }
  function commitOf(kid) { var ns = (namesByKid()[kid] || []).sort(), h = crypto.createHash('sha1'); ns.forEach(function (n) { h.update(n); h.update(fs.readFileSync(path.join(FOLDER, n))); }); var c = h.digest('hex'); commitKid[c] = kid; return c; }
  async function fakeGh(route) {
    var rq = route.request(), u = new URL(rq.url()), m = rq.method(), p = u.pathname.replace('/repos/red1oon/bim-teams-pipe', '');
    var cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    function J(st, b) { return route.fulfill({ status: st, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(b) }); }
    var body = rq.postData() ? JSON.parse(rq.postData()) : null, mm;
    if (m === 'GET' && p === '/git/matching-refs/heads/dev/') { var nk = namesByKid(); return J(200, Object.keys(nk).map(function (k) { return { ref: 'refs/heads/dev/' + k, object: { sha: commitOf(k) } }; })); }
    if (m === 'GET' && (mm = /^\/git\/trees\/([0-9a-f]{40})$/.exec(p))) { var kid = commitKid[mm[1]]; if (!kid) return J(404, {});
      return J(200, { tree: (namesByKid()[kid] || []).map(function (n) { var b = fs.readFileSync(path.join(FOLDER, n)), s = sha1(b); blobs[s] = b; return { path: n, type: 'blob', sha: s, size: b.length }; }) }); }
    if (m === 'GET' && (mm = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(p))) { var bb = blobs[mm[1]]; return bb ? J(200, { content: bb.toString('base64'), encoding: 'base64' }) : J(404, {}); }
    if (m === 'GET' && (mm = /^\/git\/ref\/heads\/dev\/(.+)$/.exec(p))) { return (namesByKid()[mm[1]] ? J(200, { object: { sha: commitOf(mm[1]) } }) : J(404, {})); }
    if (m === 'GET' && (mm = /^\/git\/commits\/([0-9a-f]{40})$/.exec(p))) return J(200, { tree: { sha: 'f'.repeat(40) } });
    if (m === 'POST' && p === '/git/blobs') { var buf = Buffer.from(body.content, 'base64'), s2 = sha1(buf); blobs[s2] = buf; return J(201, { sha: s2 }); }
    if (m === 'POST' && p === '/git/trees') { var id = crypto.randomBytes(20).toString('hex'); trees[id] = body.tree; return J(201, { sha: id }); }
    if (m === 'POST' && p === '/git/commits') { var cid = crypto.randomBytes(20).toString('hex'); commits[cid] = body.tree; return J(201, { sha: cid }); }
    if ((m === 'PATCH' && /^\/git\/refs\/heads\/dev\//.test(p)) || (m === 'POST' && p === '/git/refs')) {
      (trees[commits[body.sha]] || []).forEach(function (e) { var fp = path.join(FOLDER, e.path); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, blobs[e.sha]); });
      return J(m === 'POST' ? 201 : 200, { object: { sha: body.sha } }); }
    return J(404, { message: 'fake-gh: unhandled ' + m + ' ' + p });
  }

  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), L = {};
  var pg = {}, ctxs = [];
  async function newDevice(name, withGh) {
    var c = await browser.newContext({ viewport: { width: 1400, height: 900 } }); ctxs.push(c); L[name] = [];
    if (withGh) await c.route('https://api.github.com/**', fakeGh);
    pg[name] = await c.newPage();
    pg[name].on('console', function (m) { var t = m.text(); L[name].push(t); if (/§TEAM_BASE|§TEAM_VISIT|§TEAM_OUT|§TEAM_LOCALONLY|§TEAM_PROJECT_SKIP|group-torn|verifyChain=FAIL|🔴/.test(t)) console.log('     [' + name + '] ' + t.slice(0, 300)); });
    pg[name].on('pageerror', function (e) { errors++; L[name].push('PAGEERR ' + e.message); console.log('     [' + name + '] 🔴 pageerror ' + e.message); });
    pg[name].on('dialog', function (d) { d.accept().catch(function () {}); });
  }
  function waitLog(w, re, from, ms) { return (async function () { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; })(); }
  async function openErp(w, win, extra, light) {
    await pg[w].goto(base + '/erp/idempiere.html?login=GardenAdmin&window=' + (win || 143) + '&team=1&pipe=' + encodeURIComponent(PIPE) + (extra || ''), { waitUntil: 'load' });
    try { if (!light) await pg[w].waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 90000 }); await pg[w].waitForSelector('#team-chip', { timeout: 90000 }); }
    catch (e) { console.log('🔴 §BASE-OPEN ' + w + ' did not reach a toolbar + chip; last console lines:\n     ' + L[w].slice(-12).map(function (t) { return t.slice(0, 220); }).join('\n     ')); throw e; }
    await sleep(1500);
  }
  var sel = function (c) { return '#idmp-inline-mount select[data-col="' + c + '"]'; };
  var inp = function (c) { return '#idmp-inline-mount input[data-col="' + c + '"]'; };
  async function toHeaderGrid(w) { var p = pg[w]; if (await p.locator('#idmp-find-ov').count()) { await p.click('#idmp-find-ov [data-find-ok]').catch(function () {}); await sleep(900); }   // Find dialog first, as in legacy
    await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(900); await require('./legacy_open.js').showAllRows(p, { settle: 300 }); await sleep(500); }
  async function gridPks(w) { return pg[w].evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (tr) { return Number(tr.getAttribute('data-ad-record')); }); }); }
  async function selectRow(w, pk) { await pg[w].evaluate(function (i) { var tr = Array.prototype.filter.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (x) { return Number(x.getAttribute('data-ad-record')) === i; })[0]; if (tr) tr.click(); }, pk);
    await pg[w].waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(function () {}); await sleep(700); }
  async function descOf(w) { return pg[w].$eval(inp('description'), function (e) { return e.value; }).catch(function () { return null; }); }
  async function editDesc(w, v, key) { var p = pg[w]; await p.fill(inp('description'), v); await p.dispatchEvent(inp('description'), 'change'); await sleep(300);
    var n0 = L[w].length; await p.click('#idmp-toolbar [data-tb="save"]'); var l = await waitLog(w, new RegExp('§CRUD-PERSIST key=' + key + ' '), n0, 15000); await sleep(900); return l; }
  async function visit(w) { var n0 = L[w].length; if (await pg[w].locator('#idmp-find-ov').count()) { await pg[w].click('#idmp-find-ov [data-find-ok]').catch(function () {}); await sleep(900); }   // a high-volume window (Business Partner) opens with the Find dialog on top, as in legacy
    await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 90000); await sleep(1200); return l; }
  async function chip(w) { return pg[w].evaluate(function () { var c = document.getElementById('team-chip'), wn = document.getElementById('team-warn');
    return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), team: c.getAttribute('data-team'), base: c.getAttribute('data-base'), warn: wn ? wn.textContent : '' } : null; }); }
  // every op this device holds with its verdict (what the fold decided), mine or not
  async function ops(w) { return pg[w].evaluate(function () { var S = window.TeamSync.store(), me = S.kid, vd = {}; S.verdicts().forEach(function (r) { vd[r.op_hash] = r; });
    return S.query("SELECT op_hash, author_kid, op_type, target_table, target_uu FROM cl_op").filter(function (r) { return !/^(GENESIS|PERSON|ENROLL|ROLE|REVOKE|KEYGRANT|REKEY|POLICY|CHECKPOINT)$/.test(r.op_type); }).map(function (r) {
      var v = vd[r.op_hash] || {}; return { hash: r.op_hash, mine: r.author_kid === me, type: r.op_type, table: r.target_table, uu: r.target_uu, verdict: v.verdict || null, reason: v.reason || null }; }); }); }
  async function newOrder(w, desc) {
    var p = pg[w], n0 = L[w].length;
    await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(700);
    await p.click('#idmp-toolbar [data-tb="new"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
    await p.selectOption(sel('ad_org_id'), '11').catch(function () {}); await sleep(400);
    await p.selectOption(sel('m_warehouse_id'), '103').catch(function () {}); await sleep(300);
    await p.selectOption(sel('c_bpartner_id'), '118'); await sleep(300);
    var dts = await p.$$eval(sel('c_doctypetarget_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); });
    var dt = dts.find(function (o) { return /^Standard Order/.test(o.t); }) || dts.find(function (o) { return /^POS Order/.test(o.t); }); if (!dt) throw new Error('no order doctype');
    await p.selectOption(sel('c_doctypetarget_id'), dt.v);
    await p.fill(inp('description'), desc); await p.dispatchEvent(inp('description'), 'change');
    await p.click('#idmp-toolbar [data-tb="save"]');
    await waitLog(w, /§CRUD-CREATE-SEL table=c_order id=/, n0, 15000); await sleep(900);
  }
  async function addLine(w) {
    var p = pg[w];
    await p.click('#idmp-tabstrip >> text=Order Line'); await sleep(900);
    await p.click('#idmp-toolbar [data-tb="new"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
    await p.selectOption(sel('m_product_id'), '123'); await sleep(300);
    var qi = p.locator(inp('qtyentered')).first(); await qi.fill('2'); await qi.blur(); await sleep(300);
    var uom = (await p.$$eval(sel('c_uom_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); })).find(function (o) { return /^Each/.test(o.t); });
    var tax = (await p.$$eval(sel('c_tax_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); })).find(function (o) { return /^Standard \(104\)/.test(o.t); });
    if (uom) await p.selectOption(sel('c_uom_id'), uom.v); if (tax) await p.selectOption(sel('c_tax_id'), tax.v);
    var pe = p.locator(inp('priceentered')).first(); await pe.fill('61.75'); await pe.blur();
    await p.locator(inp('priceactual')).first().fill('61.75').catch(function () {});
    var n0 = L[w].length; await p.click('#idmp-toolbar [data-tb="save"]');
    await waitLog(w, /§CRUD-PERSIST key=c_orderline/, n0, 15000); await sleep(1200);
  }
  function orderPk(w, desc) { return pg[w].evaluate(function (d) { var db = window.__crud.kernelDb(), r = db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='CRUD_CREATE' AND undone=0 ORDER BY id"), pk = null;
    (r.length ? r[0].values : []).forEach(function (v) { var p = JSON.parse(v[1]); if (p.table === 'c_order' && p.fields && p.fields.description === d) pk = -v[0]; }); return pk; }, desc); }
  async function complete(w, desc) { var pk = await orderPk(w, desc), n0 = L[w].length;
    await pg[w].evaluate(function (id) { window.__crud.process('c_order', id, 'CO', { from: 'DR', to: 'CO', outcome: 'success' }); }, pk);
    var cl = await waitLog(w, /§CRUD process committed key=c_order/, n0, 25000); await sleep(1500); return cl; }
  // how many CRUD_UPDATE rows on a table sit in this device's sidecar (what the projection put on the screen's op-log)
  function kernelCount(w, table, type) { return pg[w].evaluate(function (a) { var db = window.__crud.kernelDb(), r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='" + a[1] + "' AND undone=0"), n = 0;
    (r.length ? r[0].values : []).forEach(function (v) { try { if (JSON.parse(v[0]).table === a[0]) n++; } catch (e) {} }); return n; }, [table, type]); }
  var refusedSummary = function (list) { var by = {}; list.filter(function (o) { return o.verdict === 'REFUSED'; }).forEach(function (o) { var k = o.table + ':' + o.reason; by[k] = (by[k] || 0) + 1; }); return by; };

  try {
    // ═══ §BASE-R1 — BEFORE: a team without a base (the phone page, as W2 did) ═══
    console.log('§BASE-R1');
    await newDevice('A1', true); await newDevice('B1', true);
    var phone = base + '/common/comm/comm_phone.html?gap=0';
    async function ready(p) { await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 }); }
    async function press(p, s) { await p.click(s); await ready(p); }
    async function token(p) { await ready(p); await p.fill('#token', 'fake-token-local-folder'); await press(p, '#b-token'); }
    await pg.A1.goto(phone); await token(pg.A1); await press(pg.A1, '#b-found');
    var invite = await pg.A1.inputValue('#invite-link');
    await pg.B1.goto(invite.replace(/^https?:\/\/[^/]+/, base).replace('#', '?gap=0#')); await token(pg.B1);
    await press(pg.B1, '#b-join'); var code1 = (await pg.B1.textContent('#mycode')).trim();
    await press(pg.A1, '#b-requests');
    await pg.A1.selectOption('#requests .request:has-text("' + code1 + '") .req-role', '102').catch(function () {});
    await pg.A1.click('#requests .request:has-text("' + code1 + '") .b-approve'); await ready(pg.A1);
    await press(pg.B1, '#b-visit');
    for (var w1 of ['A1', 'B1']) await openErp(w1);
    var bs1 = await pg.A1.evaluate(function () { return window.TeamSync.baseState(); }), info1 = await pg.A1.evaluate(function () { return window.TeamSync.store().baseInfo(); }), c1 = await chip('A1');
    verdict(bs1.state === 'none' && info1 === null && c1.base === 'none', 'a team founded WITHOUT a base: baseInfo() is null, the host says state=none, the chip says data-base=none (unchanged behaviour)', JSON.stringify({ state: bs1.state, info: info1, chip: c1.base }));
    await toHeaderGrid('A1'); await toHeaderGrid('B1');
    await newOrder('A1', 'BASE-R1-one'); await addLine('A1'); await visit('A1'); await visit('B1');
    var nR1 = L.A1.length; await complete('A1', 'BASE-R1-one'); await visit('A1'); await visit('B1');
    var o1 = await ops('A1'), ref1 = refusedSummary(o1), rsv1 = o1.filter(function (o) { return o.table === 'm_storagereservation'; });
    var lo1 = await pg.A1.evaluate(function () { return Object.keys(window.TeamSync.localOnly()).length; });
    var refCount1 = o1.filter(function (o) { return o.verdict === 'REFUSED'; }).length;
    console.log('   §BASE-BEFORE (no base) Complete: ops=' + o1.length + ' refused=' + refCount1 + ' ' + JSON.stringify(ref1) + ' | m_storagereservation ops=' + rsv1.length + ' verdicts=' + JSON.stringify(rsv1.map(function (o) { return o.verdict + ':' + o.reason; })) + ' | local-only (never sent)=' + lo1);
    if (!rsv1.length) incon('§BASE-R1 before-state', 'the Complete sent no m_storagereservation op in the baseline space — the BEFORE count did not reproduce');
    else verdict(rsv1.every(function (o) { return o.verdict === 'REFUSED' && o.reason === 'scope-unknown'; }), 'BEFORE: the Complete\'s m_storagereservation write(s) are REFUSED scope-unknown in a space without a base (the W2 named limit, reproduced here)', JSON.stringify(rsv1.map(function (o) { return o.verdict + ':' + o.reason; })));
    for (var cx of ctxs.splice(0)) await cx.close();

    // ═══ §BASE-FOUND — AFTER: the same ERP, a team founded in the ERP pins the seed ═══
    console.log('\n§BASE-FOUND');
    FOLDER_RESET();
    await newDevice('A', false); await newDevice('B', false);
    await openErp('A', 123); await openErp('B', 123);
    var inv = await pg.A.evaluate(function () { return window.TeamSync.found(); });
    var bsA = await pg.A.evaluate(function () { return window.TeamSync.baseState(); }), infoA = await pg.A.evaluate(function () { return window.TeamSync.store().baseInfo(); });
    verdict(/^[0-9a-f]{64}$/.test(inv) && infoA && infoA.sha256 === SEED_SHA && infoA.bytes === SEED_ORA.bytes && infoA.name === 'ad_seed.db+patches' && bsA.state === 'ok',
      'A founds a team: the genesis pins ad_seed.db + its shipped patches — sha256 and size equal what node computes from the files on disk (independent oracle) — and A says state=ok', JSON.stringify({ name: infoA && infoA.name, sha: infoA && infoA.sha256.slice(0, 12), want: SEED_SHA.slice(0, 12), bytes: infoA && infoA.bytes, state: bsA.state }));
    await pg.B.evaluate(function (i) { return window.TeamSync.join(i); }, inv);
    var rqs = await pg.A.evaluate(function () { return window.TeamSync.requests(); });
    await pg.A.evaluate(function (r) { return window.TeamSync.approve(r.rq, 103); }, rqs[0]);                        // B is GardenWorld User (103): no write on org 0
    await visit('B');
    var bsB = await pg.B.evaluate(function () { return window.TeamSync.baseState(); }), cA = await chip('A'), cB = await chip('B'), stB = await pg.B.evaluate(function () { return window.TeamSync.pairState(); });
    verdict(rqs.length === 1 && stB.enrolled && stB.devices === 2 && bsB.state === 'ok' && cA.base === 'ok' && cB.base === 'ok', 'B joins and is approved as role 103; both chips say data-base=ok (B hashed ITS OWN copy of the seed and it equals the team\'s)', JSON.stringify({ requests: rqs.length, enrolled: stB.enrolled, devices: stB.devices, A: cA.base, B: cB.base, haveB: bsB.loaded && bsB.loaded.sha256.slice(0, 12) }));

    // ═══ §BASE-EDIT ═══
    console.log('\n§BASE-EDIT');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var pksA = await gridPks('A'), PK_OK = 114, PK_DENY = 120, PK_ORG11 = 50001;      // Tree Farm Inc. / Seed Farm Inc. (org 0) and Color, Inc (org 11): seeded Business Partners with a real uuid
    if (pksA.indexOf(PK_OK) < 0 || pksA.indexOf(PK_DENY) < 0 || pksA.indexOf(PK_ORG11) < 0) incon('§BASE-EDIT', 'the seeded partners are not in the window grid: ' + pksA.slice(0, 12).join(','));
    else {
      var d0B = (await (async function () { await selectRow('B', PK_OK); return descOf('B'); })());
      await toHeaderGrid('A'); await selectRow('A', PK_OK);
      var d0 = await descOf('A'); console.log('   §BASE-EDIT partner ' + PK_OK + ' description before: A=' + JSON.stringify(d0) + ' B=' + JSON.stringify(d0B));
      var nA = L.A.length; await editDesc('A', 'edited by 102 on a base record', 'c_bpartner');
      var outA = L.A.slice(nA).filter(function (t) { return /§TEAM_OUT op=CRUD_UPDATE table=c_bpartner/.test(t); }), loA = L.A.slice(nA).filter(function (t) { return /§TEAM_LOCALONLY/.test(t); });
      verdict(outA.length === 1 && loA.length === 0, 'A (role 102): an UPDATE of a SEEDED partner is SENT (was local-only: no CREATE in the log)', 'sent=' + outA.length + ' localonly=' + loA.length + ' ' + (outA[0] || loA[0] || '').slice(0, 100));
      await visit('A'); await visit('B');
      await toHeaderGrid('B'); await selectRow('B', PK_OK); var d1B = await descOf('B');
      verdict(d1B === 'edited by 102 on a base record' && d0B !== d1B, 'B sees A\'s edit of the base record after a Visit (B\'s own form, record ' + PK_OK + ')', 'B before=' + JSON.stringify(d0B) + ' after=' + JSON.stringify(d1B));
      var oA = await ops('A'), eOp = oA.filter(function (o) { return o.table === 'c_bpartner' && o.type === 'CRUD_UPDATE' && o.mine; })[0];
      verdict(eOp && /^MERGED/.test(eOp.verdict), 'the fold judged it MERGED by the base row\'s scope (no CREATE anywhere in the log)', JSON.stringify(eOp && { v: eOp.verdict, r: eOp.reason }));

      // role 103 (B) on an org-0 partner: refused by the BASE ROW's scope
      await toHeaderGrid('B'); await selectRow('B', PK_DENY); var dd0 = await descOf('B'); var nB = L.B.length;
      await editDesc('B', 'edited by 103 on org 0', 'c_bpartner');
      var ddMid = await descOf('B');
      verdict(ddMid === 'edited by 103 on org 0', 'NO-OP guard: before B\'s Visit, B\'s own form DOES show its edit (so the revert below is the refusal, not a save that never happened)', JSON.stringify(ddMid));
      var outB = L.B.slice(nB).filter(function (t) { return /§TEAM_OUT op=CRUD_UPDATE table=c_bpartner/.test(t); });
      await visit('B'); await visit('A'); await visit('B');
      var oA2 = await ops('A'), oB2 = await ops('B');
      var denA = oA2.filter(function (o) { return o.table === 'c_bpartner' && o.type === 'CRUD_UPDATE' && !o.mine; })[0], denB = oB2.filter(function (o) { return o.table === 'c_bpartner' && o.type === 'CRUD_UPDATE' && o.mine; })[0];
      verdict(outB.length === 1, 'B (role 103): the edit of the org-0 partner was authored and SENT (the UI allows it; admission decides)', 'sent=' + outB.length);
      verdict(denA && denA.verdict === 'REFUSED' && /^access:/.test(denA.reason || '') && denB && denB.verdict === 'REFUSED' && denB.reason === denA.reason, 'role 103 has no write on org 0: REFUSED with an access: reason by the base row\'s scope — the SAME verdict on A and on B', 'A sees ' + JSON.stringify(denA && { v: denA.verdict, r: denA.reason }) + ' B sees ' + JSON.stringify(denB && { v: denB.verdict, r: denB.reason }));
      await toHeaderGrid('B'); await selectRow('B', PK_DENY); var dd1 = await descOf('B'); await toHeaderGrid('A'); await selectRow('A', PK_DENY); var ddA = await descOf('A');
      verdict(dd1 === dd0 && ddA === dd0 && dd0 !== 'edited by 103 on org 0', 'the refused edit is not on either screen: B\'s own form reverted to the base value and A never showed it', 'B before=' + JSON.stringify(dd0) + ' after=' + JSON.stringify(dd1) + ' A=' + JSON.stringify(ddA));
      // control: the same role on a base record of ITS org is admitted
      await toHeaderGrid('B'); await selectRow('B', PK_ORG11); var e0 = await descOf('B'); await editDesc('B', 'edited by 103 on org 11', 'c_bpartner');
      await visit('B'); await visit('A'); await toHeaderGrid('A'); await selectRow('A', PK_ORG11); var eA = await descOf('A');
      var oB3 = await ops('B'), okB = oB3.filter(function (o) { return o.table === 'c_bpartner' && o.mine && o.uu && /^MERGED/.test(o.verdict || ''); });
      verdict(eA === 'edited by 103 on org 11' && okB.length >= 1, 'CONTROL: role 103 editing a base record of ITS org (11) is ADMITTED and reaches A — the refusal above is the base row\'s scope, not a blanket block', 'A sees ' + JSON.stringify(eA) + ' (was ' + JSON.stringify(e0) + ') merged ops=' + okB.length);
    }
    // an op on a uu that exists nowhere
    var ghost = await pg.A.evaluate(async function () { var S = window.TeamSync.store(), uu = window.crypto.randomUUID();
      var r = await S.author({ target: { table: 'c_bpartner', uu: uu }, intent: 'K2', body: { op_type: 'CRUD_UPDATE', params: { changes: { description: { old: null, new: 'ghost' } } } } }); return { hash: r.hash, uu: uu }; });
    await visit('A'); await visit('B');
    var gA = (await ops('A')).filter(function (o) { return o.hash === ghost.hash; })[0], gB = (await ops('B')).filter(function (o) { return o.hash === ghost.hash; })[0];
    verdict(gA && gB && gA.verdict === 'REFUSED' && gA.reason === 'base-row-missing' && gB.reason === 'base-row-missing', 'an op on a uu that is in neither the log nor the base is REFUSED base-row-missing — on both devices', JSON.stringify([gA && gA.reason, gB && gB.reason]));

    // ═══ §BASE-COMPLETE — AFTER ═══
    console.log('\n§BASE-COMPLETE');
    await openErp('A', 143); await openErp('B', 143); await toHeaderGrid('A'); await toHeaderGrid('B');
    await newOrder('A', 'BASE-R2-one'); await addLine('A'); await visit('A'); await visit('B');
    var rsvB0 = await kernelCount('B', 'm_storagereservation', 'CRUD_UPDATE');
    await complete('A', 'BASE-R2-one'); await visit('A'); await visit('B'); await visit('A');
    var o2 = await ops('A'), ref2 = refusedSummary(o2), rsv2 = o2.filter(function (o) { return o.table === 'm_storagereservation'; }), refCount2 = o2.filter(function (o) { return o.verdict === 'REFUSED'; }).length;
    var lo2 = await pg.A.evaluate(function () { return Object.keys(window.TeamSync.localOnly()).length; });
    var rsvA = await kernelCount('A', 'm_storagereservation', 'CRUD_UPDATE'), rsvB = await kernelCount('B', 'm_storagereservation', 'CRUD_UPDATE');
    var rsvBase = await pg.A.evaluate(function () { return window.TeamSync.store().query("SELECT target_uu FROM cl_op WHERE target_table='m_storagereservation'").map(function (r) { return r.target_uu; }); });
    var rsvRow = rsvBase.length ? await pg.A.evaluate(function (u) { return window.TeamSync.baseRow('m_storagereservation', u); }, rsvBase[0]) : null;
    console.log('   §BASE-RSV the Complete\'s reservation row ' + (rsvBase[0] || '?').slice(0, 8) + ' is in the pristine base (file + patches) with scope ' + JSON.stringify(rsvRow));
    verdict(rsvRow && rsvRow.client === 11 && rsvRow.org === 11 && !fs.readFileSync(SEED).includes(Buffer.from(rsvBase[0] || '-')) && (patchOf('ad_seed.db.sql') || '').indexOf(rsvBase[0]) >= 0, 'the reservation row the Complete updates is NOT in the seed file but IS in the shipped patch, and the pristine base (file + patches) answers its scope client/org = 11/11', JSON.stringify(rsvRow));
    var rsvRows = await pg.A.evaluate(function () { var r = window.__crud.kernelDb().exec("SELECT id, op_type, user_tag, parameters FROM kernel_ops WHERE parameters LIKE '%\"table\":\"m_storagereservation\"%' ORDER BY id"); return r.length ? r[0].values.map(function (v) { return { id: v[0], op: v[1], tag: v[2], p: String(v[3]).slice(0, 330) }; }) : []; });
    console.log('   §BASE-DEBUG A kernel rows on m_storagereservation: ' + JSON.stringify(rsvRows));
    console.log('   §BASE-AFTER (base) Complete: ops=' + o2.length + ' refused=' + refCount2 + ' ' + JSON.stringify(ref2) + ' | m_storagereservation ops=' + rsv2.length + ' verdicts=' + JSON.stringify(rsv2.map(function (o) { return o.verdict + ':' + o.reason; })) + ' | local-only=' + lo2);
    var cRef2 = o2.filter(function (o) { return o.verdict === 'REFUSED' && o.table !== 'c_bpartner'; }).length;       // the c_bpartner refusals are the §BASE-EDIT arms above, on purpose
    console.log('   §BASE-BEFORE-AFTER refused by the Complete: before(no base)=' + refCount1 + ' ' + JSON.stringify(ref1) + '  ->  after(base)=' + cRef2 + ' (all refusals in the space incl. the deliberate §BASE-EDIT ones: ' + refCount2 + ' ' + JSON.stringify(ref2) + ')' + ' | m_storagereservation: before ' + JSON.stringify(rsv1.map(function (o) { return o.reason; })) + ' after ' + JSON.stringify(rsv2.map(function (o) { return o.verdict + ':' + o.reason; })));
    verdict(rsv2.length >= 1 && rsv2.every(function (o) { return /^MERGED/.test(o.verdict || ''); }), 'AFTER: the Complete\'s m_storagereservation write(s) are ADMITTED in the base team (before: scope-unknown)', JSON.stringify(rsv2.map(function (o) { return o.verdict + ':' + o.reason; })));
    verdict(cRef2 === 0 && refCount1 === 1, 'refused ops of the Complete: 1 before (the m_storagereservation write) -> 0 after', 'before=' + refCount1 + ' after=' + cRef2);
    verdict(rsvA >= 1 && rsvB === rsvA && rsvB > rsvB0, 'B holds the SAME reservation update(s) as A in its op-log (projected through the idCol/uu addressing of the base row)', 'A=' + rsvA + ' B=' + rsvB + ' (B before the Complete: ' + rsvB0 + ')');

    // ═══ §BASE-MISMATCH — a device whose seed differs by one byte ═══
    console.log('\n§BASE-MISMATCH');
    await newDevice('C', false);
    await openErp('C', 143, '&seed=ad_seed_alt.db', true);
    await pg.C.evaluate(function (i) { return window.TeamSync.join(i); }, inv);
    var rqC = await pg.A.evaluate(function () { return window.TeamSync.requests(); });
    await pg.A.evaluate(function (r) { return window.TeamSync.approve(r.rq, 102); }, rqC[0]);
    await visit('C'); await sleep(500);
    var bsC = await pg.C.evaluate(function () { return window.TeamSync.baseState(); }), cC = await chip('C');
    console.log('   §BASE-MISMATCH C chip: ' + JSON.stringify(cC));
    verdict(bsC.state === 'mismatch' && cC.base === 'mismatch' && bsC.want === SEED_SHA && bsC.have === ALT_SHA, 'C (seed differs by ONE byte) is told so: state=mismatch, have/want are the two real base hashes (node oracle for the altered copy and for the shipped files)', JSON.stringify({ state: bsC.state, have: (bsC.have || '').slice(0, 10), want: (bsC.want || '').slice(0, 10) }));
    verdict(/ad_seed_alt\.db|ad_seed\.db/.test(cC.warn) && /not the team/.test(cC.warn) && /Update it/.test(cC.warn), 'the chip says it in plain words (no stack, no hash dump to read)', cC.warn.slice(0, 200));
    var foldedC = await pg.C.evaluate(function () { return window.TeamSync.store().order().then(function (L) { return L.order.length; }); }), teamRowsC = await pg.C.evaluate(function () { var r = window.__crud.kernelDb().exec("SELECT COUNT(*) FROM kernel_ops WHERE user_tag='team'"); return r.length ? r[0].values[0][0] : 0; });
    var teamRowsB = await pg.B.evaluate(function () { var r = window.__crud.kernelDb().exec("SELECT COUNT(*) FROM kernel_ops WHERE user_tag='team'"); return r.length ? r[0].values[0][0] : 0; });
    verdict(foldedC > 5 && teamRowsC === 0 && teamRowsB > 0, 'C holds the team\'s log (' + foldedC + ' placed ops) but projected NOTHING onto its screen (team rows C=' + teamRowsC + '); CONTROL: B, same log, right seed, has ' + teamRowsB, 'placed=' + foldedC + ' C=' + teamRowsC + ' B=' + teamRowsB);
    var visC = L.C.filter(function (t) { return /§TEAM_VISIT/.test(t); }).pop() || '';
    verdict(/NOTHING FOLDED/.test(visC) && !/rebuild=/.test(visC), 'the Visit line on C says NOTHING FOLDED (no rebuild ran)', visC.slice(0, 160));

    console.log('\n§BASE-NOERR'); verdict(errors === 0, 'zero page errors on every device', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-BASE-EDIT ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors + (MUT ? ' [MUTATE=' + MUT + ']' : ''));
  process.exit(fails || !judged ? 1 : 0);

  function FOLDER_RESET() { walk(FOLDER, '', []).forEach(function (n) { fs.rmSync(path.join(FOLDER, n), { force: true }); }); }      // round 2 starts on an empty post office
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
