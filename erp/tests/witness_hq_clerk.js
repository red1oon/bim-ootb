#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-HQ-CLERK, bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §14 (OWNER: separate operations by dedicated roles, as legacy) and TEAMWORK_FRAMEWORK §41 agent C. READ THE LOG after every run.
//   THE ISSUE: §13.5 proved the POS chain with an AUTOMATIC trigger (a TANR rule row on the processor). The owner's operating model is different: a PERSON in a ROLE runs Import Orders at head office, and
//   another role runs the Replenish Report and confirms the Movement. The automatic rule is a legacy-valid OPTION, not practice. Until this witness, nothing proved that the dictionary's OWN
//   windows/processes carry that flow (menu -> dialog -> OK) for the right roles and refuse the wrong ones, or that the order AND the movement come back to the station.
//   The REAL erp/idempiere.html (?team=1) in TWO headless Chromium contexts on one dumb folder pipe (the W-POS-CHAIN harness): A = head office (founder; its USER SESSION is the clerk, then the stock role), B = the station/till
//   (team role 200001). NO AD_Rule / AD_Table_ScriptValidator row exists on either device in this witness (H0 asserts it). Every business step is a click on the page's own menu / window / process dialog.
//   AD ROLES USED (measured in ad_seed.db, none invented): clerk = 102 GardenWorld Admin (AD_Window_Access 281 Y, AD_Process_Access 206 Y + 53267 Y); stock role = 103 GardenWorld User (AD_Process_Access 53267 Y,
//   NO AD_Window_Access 281 -> it cannot see Import Order); a role with neither = 50004 Web Service Execution (AD_Process_Access only 111, 236). The seed has no role NAMED clerk or stock: these three are
//   the dedicated-ness the dictionary actually gives.
//   §H0 precondition  — B enrolled; I_Order on both; ZERO TANR rows on A and B; B ran nothing.
//   §H1 deposit       — B enters a 3-line ticket as I_Order rows (the ERP's own write path) and Visits.
//   §H2 nothing runs  — A Visits: the 3 rows arrived, I_IsImported='N', ZERO C_Order for the key, ZERO §RULE_PROCESS: nothing is automatic, a person starts it.
//   §H3 menu X of N   — for each of the N=4 client roles (102, 103, 200001, 50004) and each of the 2 entries (menu 376 Import Order window, menu 53354 Replenish Report), the page's menu shows the entry
//                       iff the dictionary says so (AD_Menu active + AD_TreeNodeMM tree 10 membership AND AD_Window_Access 281 / AD_Process_Access 53267 for that role). X of 8.
//   §H4 params X of N — the dialogs the user sees render exactly the AD_Process_Para rows: Import Orders (206) 4 params, Replenish Report (53267) 6 params: name set, mandatory flag, and the dictionary default (X of 10 + 2).
//   §H5 negative arm  — role 103 has NO Import Order menu leaf and the ?window=281 deep link does not open; role 50004 has NO Replenish Report and NO Import Orders (deep links ?process=53267 / 206 log DENIED, no dialog).
//   §H6 clerk imports — A (clerk, role 102): menu "Import Order" -> window -> a row -> Process gear -> "Import Orders" dialog -> DocAction=CO -> Run: ONE C_Order (DocumentNo = key, CO, 3 lines), the 3 rows imported Y,
//                       the dictionary-resolved process ran (§AD-PROC-LIVE proc=206 ok), and still ZERO §RULE_PROCESS.
//   §H7 run twice     — the clerk runs Import Orders AGAIN: nothing more imported (still ONE order for the key, no new order of the day).
//   §H8 stock role    — the SAME device logs out and in as role 103: the menu has Replenish Report and no Import Order; M_Replenish rows for warehouse 104 (+ its source) are operator SAMPLE master data (labelled §HQ_SETUP).
//   §H9 report        — Replenish Report (menu 53354) for the branch warehouse, Create blank: T_Replenish rows equal the independent expectation (level, on hand), no document made.
//   §H10 confirm      — Create = Inventory Movement offers exactly the dictionary's Material Movement doctype; Run: ONE M_Movement with the report's lines (quantities = Qty To Order). (Was BLOCKED -> PARTIAL until fix/tip-update-read: crud_core.listTip matched the pk NAME exactly, so a CRUD_UPDATE of a mixed-case bundle table such as M_Warehouse never folded; W-TIP-UPDATE-READ. The §HQ_BLOCKED path stays for any future block.)
//   §H11 comes back   — A Visits, B Visits: B holds the order (same uu, CO, 3 lines) AND, once H10 produces one, the movement (same uu, lines); B ran neither process (no §AD-PROC-LIVE proc= on B, no §RULE_PROCESS).
//   §H12 0 page errors on both devices.
//   §MUTANTS          — the page served with one rule broken; each must turn >= 1 arm red (a crashed child is NOT a kill): process access ignored (H3/H5), window access ignored (H3/H5), Import Orders re-import on a second run (H7),
//                       Visit drops the movement (H11), Visit drops the order (H11); the movement mutant is declared NOT JUDGED only if H10 is blocked (a mutant on a path that never ran is not a kill).
//   VERDICT           — PASS only when nothing is blocked; PARTIAL (exit 3) when an arm is named BLOCKED; INCONCLUSIVE when nothing was judged; FAIL when a base arm is red.
//   POS-PLAN MODE (HQ_PLAN=pos, film evidence gap 2, TEAMWORK_FRAMEWORK §42.1 Ch 3 / §42.2; default = OFFICE mode above, whose verdict lines are unchanged): the SAME clerk steps in a POS space (A founded with ?teamplan=pos, the signed POS plan served). Only §S8/H11 differ,
//   because under the POS plan the till receives only what the plan declares for its role (W-POS-PLAN B2): the MOVEMENT, not the order, shipment, invoice or postings.
//   §H11 (pos)  the station's accepted ops are exactly the M_MovementLine ops head office authored (3, quantities = Qty To Order) and no other table; it holds 0 orders for the key and no new shipment / invoice / posting (counts equal to before the day); the relay-delivered ops it
//               REFUSED locally and their bytes are counted (§HQ_POSMODE ops/bytes); it ran neither process. Mutants (pos): the plan carries a C_Order DOWN flow (the till would get the order -> H11), the plan drops M_MovementLine (the movement never arrives -> H11).
//   Also in POS mode the run prints §FILM_EVT lines (film6/FILM_EVT.md §2) for the steps whose arm is green.
// Run: node erp/tests/witness_hq_clerk.js 2>&1 | tee /tmp/witness_hq_clerk.log      (HQ_NO_MUT=1 skips the mutants; HQ_ONLY_ARMS=1 is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.HQ_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function say(s) { if (!QUIET) console.log(s); }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var POSPLAN = (function () { var g = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'utf8'), { window: g, globalThis: g }); return g.TEAM_PLAN_POS; })();
var planPosJs = function (o) { return '(function (g) { g.TEAM_PLAN_POS = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
// HQ_MUT = JSON {"plan-drop": ["M_Movement","M_MovementLine"]} (flows dropped before signing) or {"file": "/erp/x.js", "from": "...", "to": "..."} (the page served with that file changed) — mutant child mode only
var MUT = process.env.HQ_MUT ? JSON.parse(process.env.HQ_MUT) : null;
// the ticket: one key, three lines (the §13.5 fixture: SAMPLE products 123 Oak Tree x2, 130 Plum Tree x1, 134 Patio Table x3; POS Order doctype declared by name; client 11, org 11)
var BLOCKED = [];
var POS = process.env.HQ_PLAN === 'pos', SEQ = 0, EVT = [];
function evt(o) { if (QUIET || MUT || !POS) return; var line = '§FILM_EVT ' + Object.entries(Object.assign({ seq: ++SEQ, ts: Date.now() }, o)).map(function (kv) { return kv[0] + '=' + (/[\s"]/.test(String(kv[1])) ? JSON.stringify(String(kv[1])) : kv[1]); }).join(' '); EVT.push(line); console.log(line); }
var KEY = process.env.HQ_KEY || ('POS1/2026-10-28/' + String(1000 + Math.floor(Math.random() * 8999)));
var PRODS = [123, 130, 134], QTYS = [2, 1, 3];
var LINES = PRODS.map(function (p, i) { return { ad_client_id: 11, ad_org_id: 11, i_isimported: 'N', issotrx: 'Y', doctypename: 'POS Order', m_product_id: p, qtyordered: QTYS[i], c_uom_id: 100, dateordered: '2026-10-28 00:00:00' }; });
// BRANCH = 104 Store Central (org 12; its default locator 102 holds 4 Oak Tree and nothing else); SOURCE = 103 HQ Warehouse (locator 101: 20 / 18 / 12). The M_Replenish levels are SAMPLE operator master data entered in S5.
var BRANCH = 104, BRANCH_LOC = 102, SOURCE = 103, LEVELS = { 123: [10, 20], 130: [5, 15], 134: [5, 10] };
var RECIPE_DOCTYPE_MMM = 143;   // C_DocType 143 'Material Movement' (DocBaseType MMM, client 11) — read from the dictionary in H10, asserted equal

(async function () {
  say('═══ W-HQ-CLERK — a clerk imports, the stock role replenishes, the station gets the order AND the movement (study §14) ═══  key=' + KEY + (MUT ? '  MUTANT=' + JSON.stringify(MUT).slice(0, 120) : '') + '\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-clerk-')), cur = { plan: null, planPos: null, over: {} };
  if (MUT && MUT.file) cur.over[MUT.file] = null;   // filled once the original is read
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan_pos.js' && cur.planPos) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.planPos); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (cur.over[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(cur.over[p]); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  if (MUT && MUT.file) { var orig = fs.readFileSync(path.join(ROOT, MUT.file), 'utf8'); if (orig.split(MUT.from).length !== 2) { console.log('§HQ_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + MUT.file); process.exit(2); } cur.over[MUT.file] = orig.replace(MUT.from, function () { return MUT.to; }); }
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(), plan = JSON.parse(JSON.stringify(PLAN));
  if (MUT && MUT['plan-drop']) plan.flows = plan.flows.filter(function (f) { return MUT['plan-drop'].indexOf(f.table) < 0; });
  cur.plan = planJs(await signObj(plan, owner));
  if (POS) {                                                  // the POS plan (signed by the same owner), with the mutant's flow edits applied BEFORE signing
    var pplan = JSON.parse(JSON.stringify(POSPLAN));
    if (MUT && MUT['pos-plan-drop']) pplan.flows = pplan.flows.filter(function (f) { return MUT['pos-plan-drop'].map(function (x) { return x.toLowerCase(); }).indexOf(String(f.table).toLowerCase()) < 0; });
    if (MUT && MUT['pos-plan-add']) pplan.flows = pplan.flows.concat(MUT['pos-plan-add']);
    cur.planPos = planPosJs(await signObj(pplan, owner));
  }
  // end of run: print the arms; a mutant child may stop early (HQ_MUT.stopAfter) once the arms it can turn red have been judged
  async function finishRun() { var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; }); console.log('§HQ_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged); await browser.close(); server.close(); return red; }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function device(name, extra) {
    var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + encodeURIComponent(xcfg) + (extra || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    approveAll: function (d, role) { return d.pg.evaluate(async function (role) { var r = await window.TeamSync.requests(); for (var x of r) await window.TeamSync.approve(x.rq, role); return r.length; }, role); },
    visit: function (d) { return d.pg.evaluate(async function () { var v = await window.TeamSync.visit(); return v && v.replicaIn; }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    // the ERP's own write path (what a window's Save commits): applyOp, then wait for the seal. Used ONLY for the deposit (the station's act) and the operator master data (§HQ_SETUP) — never for a business step.
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    update: function (d, table, id, changes) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(true); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: a.t, table: a.t, verb: 'update', id: a.id, changes: a.c }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, id: id, c: changes }); },
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    dict: function (d, sql) { return d.pg.evaluate(function (q) { var r = window.__idmpDb.exec(q); if (!r.length) return []; var cols = r[0].columns; return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; }); }, sql); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; },
    // POS mode: what the RELAY delivered into this device's fold, and what the device TOOK IN (projection) - counted from the engine's fold and the adapter's last projection (the W-POS-PLAN measure)
    measure: function (d) { return d.pg.evaluate(async function () { var S = window.TeamSync.store(), kid = (await window.TeamSync.pairState()).device, f = await S.foldable(), m = { delivered: 0, deliveredBytes: 0, ownPlaced: 0, ownBytes: 0, ownTabs: {} };
      f.forEach(function (p) { var n = JSON.stringify(p.env).length; if (p.env.author === kid) { m.ownPlaced++; m.ownBytes += n; m.ownTabs[p.env.target.table] = (m.ownTabs[p.env.target.table] || 0) + 1; } else { m.delivered++; m.deliveredBytes += n; } });
      var last = window.TeamSync._project.last || {}; m.projected = last.projected; m.thin = last.thin || null; m.byTable = last.byTable || {}; return m; }); },
    // the user's own hands: the menu tree, the window toolbar, the process dialog
    leaf: function (pg, id) { return pg.evaluate(function (id) { return !!document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); }, id); },
    clickLeaf: function (pg, id) { return pg.evaluate(function (id) { var leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return false; var n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); return true; }, id); },
    // the process pane: a record-launched process opens in the modal #idmp-procdlg, a menu-launched one in #idmp-content
    root: function (pg) { return pg.evaluate(function () { return document.getElementById('idmp-procdlg') ? '#idmp-procdlg' : '#idmp-content'; }); },
    params: async function (pg) { var r = await T.root(pg); return pg.$$eval(r + ' [data-proc-param]', function (els) { return els.map(function (e) { var f = e.closest('.fld'); return { col: e.getAttribute('data-proc-param'), mand: !!(f && f.classList.contains('mand')), val: e.value, tag: e.tagName, shown: e.offsetParent !== null }; }); }); },
    resultText: async function (pg) { var r = await T.root(pg); return pg.evaluate(function (r) { return (document.querySelector(r) || { innerText: '' }).innerText.replace(/\s+/g, ' ').slice(0, 400); }, r); },
    setPara: async function (pg, col, v) { var r = await T.root(pg); await pg.selectOption(r + ' [data-proc-param="' + col + '"]', String(v)); await sleep(300); },
    runDialog: async function (pg) { var r = await T.root(pg); await pg.click(r + ' [data-proc-run]'); await pg.waitForFunction(function (r) { return /OK #|Failed|Cannot run|Error/.test((document.querySelector(r) || {}).innerText || ''); }, r, { timeout: 90000 }).catch(function () {}); await sleep(1500); return T.resultText(pg); }
  };

  // ───────────────── H3 / H4 / H5 : the dictionary-vs-UI sweep, on plain (non-team) sessions per role ─────────────────
  async function plainSession(user, roleId, query) {
    var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.goto(base + '/erp/idempiere.html?lang=en_US' + (query || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await pg.waitForSelector('#idmp-login-step2:visible');
    await pg.selectOption('#idmp-login-role', String(roleId)); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 });
    await sleep(500);
    return { pg: pg, ctx: ctx, logs: logs, errs: errs };
  }
  // the dictionary's own answer for (role, entry): independent SQL against the page's AD (NOT the session code that prunes the menu)
  async function expectEntry(pg, roleId, kind, id) {
    var q = kind === 'W'
      ? "SELECT (SELECT count(*) FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 WHERE m.ad_window_id=" + id + " AND m.isactive='Y' AND m.action='W') AS menu, (SELECT count(*) FROM ad_window_access a WHERE a.ad_window_id=" + id + " AND a.ad_role_id=" + roleId + " AND a.isactive='Y') AS acc"
      : "SELECT (SELECT count(*) FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 WHERE m.ad_process_id=" + id + " AND m.isactive='Y' AND m.action IN ('P','R')) AS menu, (SELECT count(*) FROM ad_process_access a WHERE a.ad_process_id=" + id + " AND a.ad_role_id=" + roleId + " AND a.isactive='Y') AS acc";
    var r = (await pg.evaluate(function (q) { var x = window.__idmpDb.exec(q); return x[0].values[0]; }, q));
    return { menu: Number(r[0]), acc: Number(r[1]), shows: Number(r[0]) > 0 && Number(r[1]) > 0 };
  }

  say('§S0 two devices: A = head office (founder; clerk then stock role), B = station/till (team role 200001)');
  var A = await device('A', POS ? '&teamplan=pos' : ''), B = await device('B'), space = await T.found(A); await T.join(B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(A, 200001); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  var hasIo = async function (d) { return d.pg.evaluate(function () { return window.__idmpDb.exec("SELECT count(*) FROM sqlite_master WHERE name='i_order'")[0].values[0][0]; }); };
  var tanr = async function (d) { return Number((await T.rows(d, "SELECT count(*) AS n FROM ad_table_scriptvalidator WHERE eventmodelvalidator IN ('TANR','TACR')"))[0].n); };
  verdict('H0', (await T.enrolled(B)) && (await hasIo(A)) === 1 && (await hasIo(B)) === 1 && (await tanr(A)) === 0 && (await tanr(B)) === 0, 'B enrolled as the till; I_Order exists on both; ZERO TANR/TACR rule rows on A and on B (nothing is automatic in this witness)', 'io=' + (await hasIo(A)) + '/' + (await hasIo(B)) + ' tanr A=' + (await tanr(A)) + ' B=' + (await tanr(B)));

  var base0 = POS ? { inout: Number((await T.rows(B, 'SELECT count(*) AS n FROM m_inout'))[0].n), inv: Number((await T.rows(B, 'SELECT count(*) AS n FROM c_invoice'))[0].n), fact: Number((await T.rows(B, 'SELECT count(*) AS n FROM fact_acct'))[0].n), ord: Number((await T.rows(B, 'SELECT count(*) AS n FROM c_order'))[0].n) } : null;
  evt({ actor: 'till', kind: 'online', step: 'H0' }); evt({ actor: 'clerk', kind: 'online', step: 'H0' });
  say('§S1 the station deposits the ticket ' + KEY + ' (' + LINES.length + ' lines) and Visits');
  var made = [];
  for (var li = 0; li < LINES.length; li++) made.push(await T.create(B, 'i_order', Object.assign({ documentno: KEY }, LINES[li])));
  await T.visit(B);
  verdict('H1', made.every(function (x) { return x != null; }) && T.count(B, /§RULE_PROCESS ref=206/) === 0, 'the station sealed ' + LINES.length + ' I_Order rows through the ERP write path and ran no Import Orders', 'created=' + JSON.stringify(made));
  if (made.every(function (x) { return x != null; })) { for (var ei = 0; ei < LINES.length; ei++) evt({ actor: 'till', kind: 'local', queue: 1, text: 'ticket line written', step: 'H1' }); for (var ej = 0; ej < LINES.length; ej++) evt({ actor: 'till', kind: 'send', label: 'I_Order', step: 'H1' }); }

  say('§S2 head office Visits — the rows arrive, nothing runs');
  await T.visit(A); await T.visit(A);
  var ioA = await T.rows(A, "SELECT i_isimported AS imp FROM i_order WHERE documentno='" + KEY + "'"), ordA0 = await T.rows(A, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'");
  verdict('H2', ioA.length === LINES.length && ioA.every(function (r) { return r.imp === 'N'; }) && Number(ordA0[0].n) === 0 && T.count(A, /§RULE_PROCESS/) === 0, 'head office holds the ' + LINES.length + ' deposited rows (I_IsImported=N), ZERO orders for the key, ZERO §RULE_PROCESS: a person has to start it', 'rows=' + JSON.stringify(ioA) + ' orders=' + ordA0[0].n + ' ruleProcess=' + T.count(A, /§RULE_PROCESS/));
  if (ioA.length === LINES.length) { for (var ek = 0; ek < LINES.length; ek++) evt({ actor: 'clerk', kind: 'deliver', from: 'relay', label: 'I_Order', step: 'H2' }); evt({ actor: 'clerk', kind: 'note', cls: 'n', text: 'rows arrived, nothing runs', step: 'H2' }); }

  // ── H3 menu X of N, H5 negative ──
  say('§S3 menu / access sweep over the dictionary (4 roles x 2 entries) on plain sessions');
  var SWEEP = [['GardenAdmin', 102], ['GardenAdmin', 103], ['GardenAdmin', 200001], ['WebService', 50004]], sweep = [], okN = 0, totN = 0;
  for (var si = 0; si < SWEEP.length; si++) {
    var S = await plainSession(SWEEP[si][0], SWEEP[si][1]), row = { role: SWEEP[si][1] };
    var ew = await expectEntry(S.pg, SWEEP[si][1], 'W', 281), ep = await expectEntry(S.pg, SWEEP[si][1], 'P', 53267);
    var gw = await T.leaf(S.pg, 376), gp = await T.leaf(S.pg, 53354);
    row.win = [ew.shows, gw]; row.proc = [ep.shows, gp]; sweep.push(row); totN += 2; okN += (ew.shows === gw ? 1 : 0) + (ep.shows === gp ? 1 : 0);
    S.row = row; row.errs = S.errs.length;
    if (SWEEP[si][1] === 103 || SWEEP[si][1] === 102) {   // H5: the ?window=281 deep link: role 103 does not open it; role 102 DOES (the positive control — a probe that never opens anything would also read false)
      var D = await plainSession('GardenAdmin', SWEEP[si][1], '&window=281');
      row.deepWin = await D.pg.evaluate(function () { return !!document.querySelector('#idmp-toolbar [data-tb="new"]') && getComputedStyle(document.querySelector('#idmp-toolbar')).display !== 'none'; });
      await D.ctx.close();
    }
    if (SWEEP[si][1] === 50004) {   // H5: role 50004 — deep links to both processes are DENIED and no dialog opens
      var P1 = await plainSession('WebService', 50004, '&process=53267'), P2 = await plainSession('WebService', 50004, '&process=206');
      row.deny53267 = P1.logs.some(function (l) { return /§AD-PROC-LIVE deeplink proc=53267 DENIED/.test(l); }) && !(await P1.pg.$('#idmp-content [data-proc-run]'));
      row.deny206 = P2.logs.some(function (l) { return /§AD-PROC-LIVE deeplink proc=206 DENIED/.test(l); }) && !(await P2.pg.$('#idmp-content [data-proc-run]'));
      await P1.ctx.close(); await P2.ctx.close();
    }
    await S.ctx.close();
  }
  verdict('H3', okN === totN && totN === 8, 'menu entries match the dictionary for every role: X of N = ' + okN + ' of ' + totN + ' (roles ' + SWEEP.map(function (s) { return s[1]; }).join('/') + ' x [376 Import Order window, 53354 Replenish Report])', JSON.stringify(sweep.map(function (r) { return { role: r.role, win: r.win, proc: r.proc }; })));
  var r103 = sweep.filter(function (r) { return r.role === 103; })[0], r500 = sweep.filter(function (r) { return r.role === 50004; })[0];
  var r102 = sweep.filter(function (r) { return r.role === 102; })[0];
  verdict('H5', r103 && r102 && r102.deepWin === true && r103.win[0] === false && r103.win[1] === false && r103.deepWin === false && r103.proc[0] === true && r103.proc[1] === true, 'role 103 (stock role) has NO Import Order entry and the window deep link does not open it (control: role 102 deep link opens it), yet 103 DOES have Replenish Report (dedicated roles)', JSON.stringify({ r103: r103, r102deep: r102 && r102.deepWin }));
  verdict('H5', r500 && r500.proc[1] === false && r500.win[1] === false && r500.deny53267 === true && r500.deny206 === true, 'role 50004 (neither process in AD_Process_Access) sees neither entry; deep links to 53267 and 206 are DENIED and open no dialog', JSON.stringify(r500));

  if (MUT && MUT.stopAfter === 'H5') { process.exit((await finishRun()).length ? 1 : 0); }
  say('§S4 the clerk (A, role 102) imports from the menu');
  var okOpen = await T.clickLeaf(A.pg, 376);
  await A.pg.waitForSelector('#idmp-toolbar [data-tb="process"]', { timeout: 30000 }); await sleep(1500);
  // ── the clerk's whole path as a user does it: menu leaf -> window -> gear -> "Import Orders" -> dialog -> OK ──
  async function clerkImport(tag) {
    var opened = await T.clickLeaf(A.pg, 376);
    await A.pg.waitForSelector('#idmp-toolbar [data-tb="process"]:not([disabled])', { timeout: 30000 }); await sleep(1200);
    await A.pg.click('#idmp-toolbar [data-tb="process"]'); await A.pg.waitForSelector('#idmp-proc-ov', { timeout: 10000 });
    var items = await A.pg.$$eval('#idmp-proc-ov [data-tbb]', function (e) { return e.map(function (x) { return x.textContent.trim() + (x.disabled ? '(disabled)' : ''); }); });
    await A.pg.click('#idmp-proc-ov [data-tbb="Processing"]'); await A.pg.waitForSelector('#idmp-procdlg [data-proc-run]', { timeout: 20000 }); await sleep(800);
    var paras = await T.params(A.pg);
    await T.setPara(A.pg, 'AD_Client_ID', 11); await T.setPara(A.pg, 'AD_Org_ID', 11); await T.setPara(A.pg, 'DocAction', 'CO');
    var n0 = A.logs.length, text = await T.runDialog(A.pg);
    var mine = A.logs.slice(n0), pr = mine.filter(function (l) { return /§AD-PROC-LIVE proc=206 /.test(l); }).pop() || '', imp = mine.filter(function (l) { return /§IMPORT_ORDER client=/.test(l); }).pop() || '';
    await A.pg.click('#idmp-procdlg [data-procdlg-ok]'); await A.pg.waitForSelector('#idmp-procdlg', { state: 'detached', timeout: 10000 }); await sleep(500);
    return { opened: opened, items: items, paras: paras, text: text, proc: pr, imp: imp, tag: tag };
  }
  var run1 = await clerkImport('first');
  say('   clerk run 1: ' + run1.text + ' | ' + run1.imp);
  var ordNow = await T.rows(A, "SELECT c_order_id AS id, c_order_uu AS uu, docstatus AS ds, c_bpartner_id AS bp, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
  var ioNow = await T.rows(A, "SELECT i_isimported AS imp, c_order_id AS oid FROM i_order WHERE documentno='" + KEY + "'");
  // H4 (206): the dialog the clerk saw renders exactly AD_Process_Para
  async function paraCheck(pid, shown) {
    var dict = await T.dict(A, "SELECT columnname AS col, ismandatory AS mand, defaultvalue AS def, ad_reference_id AS ref, displaylogic AS dl FROM ad_process_para WHERE ad_process_id=" + pid + " AND isactive='Y' ORDER BY seqno");
    var ok = 0, tot = 0, bad = [];
    dict.forEach(function (d, i) {
      var u = shown.filter(function (x) { return x.col === d.col; })[0], posOk = shown[i] && shown[i].col === d.col;
      tot++; if (u && posOk) ok++; else bad.push(d.col + ':absent-or-misplaced');
      tot++; if (u && u.mand === (d.mand === 'Y')) ok++; else bad.push(d.col + ':mandatory');
      if (d.def != null && d.def !== '' && d.def !== '-1' && String(d.def).charAt(0) !== '@') { tot++; if (u && u.val === String(d.def)) ok++; else bad.push(d.col + ':default ' + d.def + ' vs ' + (u && u.val)); }
    });
    return { ok: ok, tot: tot, bad: bad, n: dict.length, extra: shown.filter(function (x) { return !dict.some(function (d) { return d.col === x.col; }); }).map(function (x) { return x.col; }) };
  }
  var pc206 = await paraCheck(206, run1.paras);
  verdict('H4', pc206.n === 4 && pc206.ok === pc206.tot && pc206.extra.length === 0 && run1.paras.length === pc206.n, 'Import Orders dialog renders exactly the AD_Process_Para rows (order, mandatory flag, default): X of N = ' + pc206.ok + ' of ' + pc206.tot + ' checks over ' + pc206.n + ' parameters, extra=' + pc206.extra.length, JSON.stringify(pc206.bad));
  verdict('H6', run1.opened === true && run1.items.length === 1 && /Import Orders/.test(run1.items[0]) && /OK #1\/3/.test(run1.text) && /dispatched=Y ok=Y/.test(run1.proc), 'the clerk opened menu 376 -> the window -> the gear offers "Import Orders" (the AD button) -> the dialog -> OK: the dictionary-resolved process ran and imported 1 of 3 rows-groups', 'items=' + JSON.stringify(run1.items) + ' text=' + run1.text.slice(0, 120));
  verdict('H6', ordNow.length === 1 && ordNow[0].ds === 'CO' && Number(ordNow[0].nl) === LINES.length && Number(ordNow[0].bp) === 112 && ioNow.length === LINES.length && ioNow.every(function (r) { return r.imp === 'Y' && r.oid != null; }) && T.count(A, /§RULE_PROCESS/) === 0, 'ONE C_Order with DocumentNo = the ticket key, CO, ' + LINES.length + ' lines (cash BP 112); the ' + LINES.length + ' I_Order rows read imported; still ZERO §RULE_PROCESS (a person ran it, no rule)', JSON.stringify({ ord: ordNow, io: ioNow, rule: T.count(A, /§RULE_PROCESS/) }));
  if (ordNow.length === 1 && ordNow[0].ds === 'CO') evt({ actor: 'clerk', kind: 'run', process: 'Import Orders', text: 'order per ticket', step: 'H6' });
  var allBefore = await T.rows(A, "SELECT count(*) AS n FROM c_order"), run2 = await clerkImport('again');
  var ordAgain = await T.rows(A, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'"), allAfter = await T.rows(A, "SELECT count(*) AS n FROM c_order");
  say('   clerk run 2: ' + run2.text);
  verdict('H7', /OK #0\/0/.test(run2.text) && Number(ordAgain[0].n) === 1 && Number(allAfter[0].n) === Number(allBefore[0].n), 'the clerk runs Import Orders AGAIN: it imports #0/0, still ONE order for the key and no new order of any kind (orders in the tenant ' + allBefore[0].n + ' -> ' + allAfter[0].n + ')', run2.text.slice(0, 100));
  if (/OK #0\/0/.test(run2.text)) evt({ actor: 'clerk', kind: 'run', process: 'Import Orders', text: 'second run: nothing new', step: 'H7' });

  if (MUT && MUT.stopAfter === 'H7') { process.exit((await finishRun()).length ? 1 : 0); }
  // ── the stock role: SAME device, logs out, logs in as role 103 ──
  say('§S5 operator master data for the branch (SAMPLE, §HQ_SETUP), then the SAME device logs in as role 103');
  var setup = [];
  // the branch's source warehouse is M_Warehouse.M_WarehouseSource_ID (the only place the Replenish Report port reads it). No seeded warehouse has one, so the operator sets it on 104 through the ERP write path.
  setup.push(await T.update(A, 'm_warehouse', BRANCH, { m_warehousesource_id: { old: null, new: SOURCE } })); await sleep(1500);
  var srcSeen = (await T.rows(A, 'SELECT m_warehousesource_id AS s FROM m_warehouse WHERE m_warehouse_id=' + BRANCH))[0].s;
  for (var pi = 0; pi < PRODS.length; pi++) setup.push(await T.create(A, 'm_replenish', { m_warehouse_id: BRANCH, m_product_id: PRODS[pi], ad_client_id: 11, ad_org_id: 12, isactive: 'Y', replenishtype: '1', level_min: LEVELS[PRODS[pi]][0], level_max: LEVELS[PRODS[pi]][1] }));
  console.log('§HQ_SETUP SAMPLE operator master data: warehouse ' + BRANCH + ' source=' + SOURCE + '; the model tip then reads M_WarehouseSource_ID=' + srcSeen + '; M_Replenish type 1 ' + JSON.stringify(LEVELS) + ' ops=' + JSON.stringify(setup));
  await A.pg.click('#idmp-switch-btn'); await sleep(600);
  if (await A.pg.isVisible('#idmp-login-clients')) { var gw = await A.pg.$("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); if (gw) await gw.click(); }
  await A.pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
  await A.pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await A.pg.waitForSelector('#idmp-login-step2:visible');
  await A.pg.selectOption('#idmp-login-role', '103'); await A.pg.click('#idmp-login-ok'); await sleep(1500);
  var roleNow = await A.pg.evaluate(function () { return window.APP.roleId; });
  var leaves103 = [await T.leaf(A.pg, 376), await T.leaf(A.pg, 53354)];
  verdict('H8', Number(roleNow) === 103 && leaves103[0] === false && leaves103[1] === true && (await tanr(A)) === 0, 'the same head-office device is now the stock role: APP.roleId=103, menu has Replenish Report and NOT Import Order; still no TANR row', 'role=' + roleNow + ' leaves=' + JSON.stringify(leaves103));
  if (Number(roleNow) === 103) evt({ actor: 'stock', kind: 'online', step: 'H8' });

  say('§S6 the stock role runs Replenish Report for the branch warehouse (menu 53354)');
  async function openReplenish() { await T.clickLeaf(A.pg, 53354); await A.pg.waitForSelector('#idmp-content [data-proc-run]', { timeout: 20000 }); await sleep(800); return T.params(A.pg); }
  var parasR = await openReplenish();
  var pc53267 = await paraCheck(53267, parasR);
  verdict('H4', pc53267.n === 6 && pc53267.ok === pc53267.tot && pc53267.extra.length === 0 && parasR.length === pc53267.n && parasR.filter(function (x) { return x.col === 'C_DocType_ID' && !x.shown; }).length === 1, 'Replenish Report dialog renders exactly the AD_Process_Para rows (order, mandatory, default): X of N = ' + pc53267.ok + ' of ' + pc53267.tot + ' checks over ' + pc53267.n + ' parameters; the DisplayLogic one (Document Type) is hidden until Create is chosen', JSON.stringify(pc53267.bad));
  await T.setPara(A.pg, 'M_Warehouse_ID', BRANCH);
  var nR = A.logs.length, rep = await T.runDialog(A.pg);
  say('   report result: ' + rep);
  say('   ' + A.logs.slice(nR).filter(function (l) { return /§RRP|§AD-PROC-LIVE proc=53267|§PROC-COMMIT|§PROC-/.test(l); }).join('\n   ').slice(0, 1500));
  // independent expectation of the report (type 1: Level_Max - onhand + reserved - ordered when onhand - reserved + ordered <= Level_Min; then Order_Min, Order_Pack), read from the data the report read
  async function expectReport() {
    var out = {};
    for (var i = 0; i < PRODS.length; i++) {
      var p = PRODS[i], lv = LEVELS[p];
      var oh = Number((await T.rows(A, "SELECT COALESCE(SUM(s.qtyonhand),0) AS q FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.m_product_id=" + p + " AND l.m_warehouse_id=" + BRANCH))[0].q);
      var rs = Number((await T.rows(A, "SELECT COALESCE(SUM(qty),0) AS q FROM m_storagereservation WHERE m_product_id=" + p + " AND m_warehouse_id=" + BRANCH + " AND issotrx='Y'"))[0].q), od = Number((await T.rows(A, "SELECT COALESCE(SUM(qty),0) AS q FROM m_storagereservation WHERE m_product_id=" + p + " AND m_warehouse_id=" + BRANCH + " AND issotrx='N'"))[0].q);
      var po = (await T.rows(A, "SELECT order_min AS om, order_pack AS op FROM m_product_po WHERE m_product_id=" + p + " AND iscurrentvendor='Y'"))[0] || {}, omin = Math.max(1, Number(po.om) || 0), opack = Math.max(1, Number(po.op) || 0);
      var q = (oh - rs + od) <= lv[0] ? lv[1] - oh + rs - od : 0;
      if (q > 0) { if (q < omin) q = omin; if (opack > 1 && q % opack) q = q + opack - (q % opack); }
      out[p] = { q: q, oh: oh, src: 0 };
    }
    return out;
  }
  var exp = await expectReport();
  var trep = await T.rows(A, "SELECT m_product_id AS p, qtyonhand AS oh, qtytoorder AS q, m_warehousesource_id AS src, c_bpartner_id AS bp FROM t_replenish WHERE m_warehouse_id=" + BRANCH + " AND ad_pinstance_id=(SELECT MAX(ad_pinstance_id) FROM t_replenish WHERE m_warehouse_id=" + BRANCH + ") ORDER BY m_product_id");
  var movCount0 = Number((await T.rows(A, "SELECT count(*) AS n FROM m_movement WHERE m_movement_id<0"))[0].n);
  say('   report rows: ' + JSON.stringify(trep) + ' expected: ' + JSON.stringify(exp));
  verdict('H9', /OK #|OK\b/.test(rep) && trep.length === PRODS.length && trep.every(function (r) { return exp[r.p] && Number(r.q) === exp[r.p].q && Number(r.oh) === exp[r.p].oh ; }) && movCount0 === 0, 'the report (Create blank) lists exactly the ' + PRODS.length + ' branch products with Qty To Order and On Hand equal to the independent expectation, and made no document', JSON.stringify({ rows: trep, exp: exp, movements: movCount0 }));
  if (trep.length === PRODS.length) evt({ actor: 'stock', kind: 'run', process: 'Replenish Report', text: 'quantities, no document', step: 'H9' });

  say('§S7 the stock role confirms the create: Create = Inventory Movement + Material Movement');
  var parasR2 = await openReplenish(); await T.setPara(A.pg, 'M_Warehouse_ID', BRANCH); await T.setPara(A.pg, 'ReplenishmentCreate', 'MMM');
  var dts = await A.pg.$$eval('#idmp-content [data-proc-param="C_DocType_ID"] option', function (o) { return o.filter(function (x) { return x.value; }).map(function (x) { return x.value + '=' + x.textContent; }); });
  var dictDt = await T.dict(A, "SELECT c_doctype_id AS id, name FROM c_doctype WHERE docbasetype='MMM' AND isactive='Y' AND ad_client_id IN (0,11) ORDER BY name");
  await T.setPara(A.pg, 'C_DocType_ID', RECIPE_DOCTYPE_MMM);
  var n1 = A.logs.length, conf = await T.runDialog(A.pg);
  say('   confirm result: ' + conf + ' | ' + A.logs.slice(n1).filter(function (l) { return /§AD-PROC-LIVE proc=53267|§PROC-COMMIT/.test(l); }).join(' | ').slice(0, 300));
  var mv = await T.rows(A, "SELECT m_movement_id AS id, m_movement_uu AS uu, c_doctype_id AS dt, docstatus AS ds FROM m_movement WHERE m_movement_id<0 ORDER BY m_movement_id");
  var ml = mv.length ? await T.rows(A, "SELECT m_product_id AS p, movementqty AS q, m_locator_id AS lf, m_locatorto_id AS lt FROM m_movementline WHERE m_movement_id=" + mv[0].id + " ORDER BY m_product_id") : [];
  say('   movement: ' + JSON.stringify(mv) + ' lines: ' + JSON.stringify(ml));
  var dtOk = JSON.stringify(dts.map(function (x) { return x.split('=')[0]; }).sort()) === JSON.stringify(dictDt.map(function (x) { return String(x.id); }).sort()) && dictDt.length >= 1;
  verdict('H10', dtOk && /OK/.test(conf), 'Create=Inventory Movement offers exactly the dictionary\'s Material Movement doctype(s) (X of N = ' + dts.length + ' of ' + dictDt.length + ') and the OK runs without error', JSON.stringify({ dts: dts, dict: dictDt, conf: conf.slice(0, 120) }));
  var warn = A.logs.slice(n1).filter(function (l) { return /§PROC-WARNING/.test(l); }).join(' | ');
  var MOVE_OK = mv.length === 1;
  if (MOVE_OK) verdict('H10', Number(mv[0].dt) === RECIPE_DOCTYPE_MMM && ml.length === PRODS.length && ml.every(function (l) { return exp[l.p] && Number(l.q) === exp[l.p].q && Number(l.lf) === 101 && Number(l.lt) === Number(BRANCH_LOC); }), 'OK makes ONE M_Movement (doctype 143) with ' + PRODS.length + ' lines, quantity = the report\'s Qty To Order, from HQ locator 101 to the branch default locator', JSON.stringify({ mv: mv, ml: ml }));
  if (MOVE_OK) { evt({ actor: 'stock', kind: 'run', process: 'Material Movement', text: 'one movement', step: 'H10' }); evt({ actor: 'stock', kind: 'send', label: 'movement', step: 'H10' }); }
  else { BLOCKED.push('H10'); console.log('§HQ_BLOCKED H10/H11b the Movement is NOT created: srcSeen=' + srcSeen + ' (M_Warehouse.M_WarehouseSource_ID set by a signed CRUD_UPDATE on warehouse ' + BRANCH + ' is not read by the model layer: ' + srcSeen + ' != ' + SOURCE + ') report warning="' + warn.slice(0, 120) + '" movements=' + mv.length + '. Not a dictionary row. By code reading: crud_core.listTip (called by crud_overlay _tipShadowOn) keys base rows by r[\'m_warehouse_id\'] while the seed row key is \'M_Warehouse_ID\', so the UPDATE of a base row of this mixed-case table never folds; and a warehouse CREATED in the sidecar is not offered by the process dialog lookup (base-only).'); }

  if (POS) {
    say('§S8 (POS plan) Visit: the station receives ONLY the movement');
    await T.visit(A); await T.visit(B); await T.visit(A); await T.visit(B);
    var mB = await T.measure(B), mAx = await T.measure(A);
    var tillRecv = mB.thin.accepted - mB.ownPlaced, tillBytes = mB.thin.bytesAccepted - mB.ownBytes, acc = Object.keys(mB.byTable).filter(function (t) { return mB.byTable[t] > 0; });
    var aSent = mAx.ownTabs;
    var uuA = mv.length ? (await T.rows(A, "SELECT m_movementline_uu AS u FROM m_movementline WHERE m_movement_id=" + mv[0].id)).map(function (r) { return r.u; }) : [];
    var mlB2 = uuA.length ? await T.rows(B, "SELECT m_product_id AS p, qtyentered AS q FROM m_movementline WHERE m_movementline_uu IN ('" + uuA.join("','") + "') ORDER BY m_product_id") : [];      // the SAME lines (same uu) as head office made; the POS plan ships QtyEntered (not MovementQty) for them
    var ordB2 = await T.rows(B, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'"), olB2 = await T.rows(B, "SELECT count(*) AS n FROM c_orderline WHERE c_order_id IN (SELECT c_order_id FROM c_order WHERE documentno='" + KEY + "')");
    var after = { inout: Number((await T.rows(B, 'SELECT count(*) AS n FROM m_inout'))[0].n), inv: Number((await T.rows(B, 'SELECT count(*) AS n FROM c_invoice'))[0].n), fact: Number((await T.rows(B, 'SELECT count(*) AS n FROM fact_acct'))[0].n), ord: Number((await T.rows(B, 'SELECT count(*) AS n FROM c_order'))[0].n) };
    var mvHdrB = await T.rows(B, "SELECT count(*) AS n FROM m_movement WHERE m_movement_uu='" + (mv[0] ? mv[0].uu : 'none') + "'");
    var wantLines = mv.length ? ml.map(function (l) { return [Number(l.p), Number(l.q)]; }) : [];
    console.log('   §HQ_POSLINES head_office_uu=' + JSON.stringify(uuA) + ' till_rows=' + JSON.stringify(mlB2) + ' expected=' + JSON.stringify(wantLines));
    console.log('   §HQ_POSMODE till_received_ops=' + tillRecv + ' till_received_bytes=' + tillBytes + ' accepted_tables=' + JSON.stringify(mB.byTable) + ' relay_delivered=' + mB.delivered + ' (' + mB.deliveredBytes + ' B) refused_locally=' + mB.thin.refused + ' (' + mB.thin.bytesRefused + ' B) head_office_put_on_pipe=' + JSON.stringify(aSent) + ' till_counts before=' + JSON.stringify(base0) + ' after=' + JSON.stringify(after) + ' movement_header_at_till=' + (mvHdrB[0] && mvHdrB[0].n));
    verdict('H11', MOVE_OK && tillRecv === (aSent.m_movementline || 0) && tillRecv === PRODS.length && acc.length === 1 && acc[0] === 'm_movementline' && uuA.length === PRODS.length && mlB2.length === PRODS.length && wantLines.every(function (w) { return mlB2.some(function (r) { return Number(r.p) === w[0] && Number(r.q) === w[1]; }); }),
      'POS PLAN: the station took in exactly ' + tillRecv + ' ops (' + tillBytes + ' bytes) = the ' + (aSent.m_movementline || 0) + ' M_MovementLine ops head office put on the pipe, no other table (' + JSON.stringify(acc) + '), and holds the movement lines with the report\'s quantities ' + JSON.stringify(wantLines), JSON.stringify({ tillRecv: tillRecv, acc: acc, aSent: aSent }));
    verdict('H11', Number(ordB2[0].n) === 0 && Number(olB2[0].n) === 0 && after.inout === base0.inout && after.inv === base0.inv && after.fact === base0.fact && after.ord === base0.ord && !(aSent.c_order || aSent.m_inout || aSent.c_invoice || aSent.fact_acct),
      'POS PLAN: the station does NOT hold the order (0 orders / 0 lines for the key), and its shipments, invoices, postings and orders are exactly as before the day (' + JSON.stringify(base0) + ' -> ' + JSON.stringify(after) + '); head office never put them on the pipe (kept at the source: ' + JSON.stringify(aSent) + ')', JSON.stringify({ ordB2: ordB2, base0: base0, after: after }));
    verdict('H11', T.count(B, /§AD-PROC-LIVE proc=/) === 0 && T.count(B, /§RULE_PROCESS/) === 0, 'the station ran neither Import Orders nor Replenish Report (no process ran on it; it only received)', 'bProc=' + T.count(B, /§AD-PROC-LIVE proc=/));
    if (MOVE_OK && tillRecv === PRODS.length) { for (var eq = 0; eq < tillRecv; eq++) evt({ actor: 'till', kind: 'deliver', from: 'relay', label: 'm_movementline', step: 'H11' }); evt({ actor: 'till', kind: 'note', cls: 'ok', text: 'only the movement came back', step: 'H11' }); }
    if (mB.thin.refused > 0) evt({ actor: 'till', kind: 'refuse', text: 'not declared for this role', step: 'H11' });
  } else {
  say('§S8 Visit: the station receives the order AND the movement');
    await T.visit(A); await T.visit(B); await T.visit(A); await T.visit(B);
    var ordB = await T.rows(B, "SELECT c_order_uu AS uu, docstatus AS ds, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
    var mvB = await T.rows(B, "SELECT m_movement_id AS id, m_movement_uu AS uu, docstatus AS ds FROM m_movement WHERE m_movement_uu='" + (mv[0] ? mv[0].uu : 'none') + "'");
    var mlB = mvB.length ? await T.rows(B, "SELECT m_product_id AS p, movementqty AS q FROM m_movementline WHERE m_movement_id=" + mvB[0].id + " ORDER BY m_product_id") : [];
    console.log('   §HQ_B orders=' + JSON.stringify(ordB) + ' movement=' + JSON.stringify(mvB) + ' lines=' + JSON.stringify(mlB));
    verdict('H11', ordB.length === 1 && ordB[0].uu === ordNow[0].uu && ordB[0].ds === 'CO' && Number(ordB[0].nl) === LINES.length, 'the station holds THE SAME completed order (same c_order_uu, CO, ' + LINES.length + ' lines)', JSON.stringify(ordB));
    verdict('H11', T.count(B, /§AD-PROC-LIVE proc=/) === 0 && T.count(B, /§RULE_PROCESS/) === 0, 'the station ran neither Import Orders nor Replenish Report (no process ran on it; it only received)', 'bProc=' + T.count(B, /§AD-PROC-LIVE proc=/));
    if (MOVE_OK) verdict('H11', mvB.length === 1 && mlB.length === PRODS.length && mlB.every(function (l) { return exp[l.p] && Number(l.q) === exp[l.p].q; }), 'the station holds THE SAME movement (same m_movement_uu, ' + PRODS.length + ' lines, same quantities)', JSON.stringify({ mvB: mvB, mlB: mlB }));
    else { BLOCKED.push('H11b'); console.log('§HQ_BLOCKED H11b the station-receives-the-movement arm is not judged: no movement exists to receive (see H10)'); }
  }
  verdict('H12', errors === 0, '0 page errors on every page of the run (both devices and the plain sessions)', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));

  var red = await finishRun();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§HQ_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (judged === 0) { console.log('§HQ_VERDICT INCONCLUSIVE nothing was judged'); process.exit(3); }
  var partial = BLOCKED.length ? ' blocked=' + BLOCKED.join(',') : '';
  if (process.env.HQ_NO_MUT) { console.log('§HQ_VERDICT ' + (BLOCKED.length ? 'PARTIAL' : 'PASS') + ' judged=' + judged + ' fails=0' + partial + ' mutants=skipped pageerrors=' + errors); process.exit(BLOCKED.length ? 3 : 0); }
  var M = POS ? [
    ['the POS plan also carries the order down (a C_Order DOWN flow): the till would receive the completed order', { 'pos-plan-add': [{ name: 'MUT order-down', table: 'C_Order', dir: 'DOWN', audience: 'hub', role: 200001, group: 'Order doc key', payload: [{ col: 'DocumentNo', cls: 'TEXT' }], ship: ['AD_Client_ID', 'AD_Org_ID', 'DocumentNo'] }] }, ['H11']],
    ['the POS plan drops M_MovementLine (the movement never reaches the till)', { 'pos-plan-drop': ['M_MovementLine'] }, ['H11']]] : [
    ['process access ignored (every role is granted Replenish Report and Import Orders)', { file: '/erp/idmp_session.js', from: "ctx.proc.forEach(function (rw, id) { set[id] = { rw: !!rw }; });", to: "ctx.proc.forEach(function (rw, id) { set[id] = { rw: !!rw }; }); set[53267] = { rw: true }; set[206] = { rw: true };", stopAfter: 'H5' }, ['H3', 'H5']],
    ['window access ignored in the menu (a role sees Import Order without AD_Window_Access)', { file: '/erp/idmp_session.js', from: "if (!winSet[wid]) return null;", to: "if (false) return null;", stopAfter: 'H5' }, ['H3', 'H5']],
    ['Import Orders run twice re-imports (the I_IsImported filter of the import loop removed)', { file: '/erp/processes/ImportOrder.js', from: "var impRows = trx.find('i_order', {}).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); })", to: "var impRows = trx.find('i_order', {}).filter(function (r) { return cc(r); })", stopAfter: 'H7' }, ['H7']],
    ['Visit drops the movement (M_Movement / M_MovementLine not in the signed plan)', { 'plan-drop': ['M_Movement', 'M_MovementLine'] }, ['H11']],
    ['Visit drops the order (C_Order / C_OrderLine not in the signed plan)', { 'plan-drop': ['C_Order', 'C_OrderLine'] }, ['H11']]];
  var cp = require('child_process'), muts = [], skipped = 0;
  for (var m of M) {
    if (m[2].length === 1 && m[2][0] === 'H11' && m[1]['plan-drop'] && m[1]['plan-drop'][0] === 'M_Movement' && BLOCKED.indexOf('H10') >= 0) { skipped++; console.log('   ⚠ ' + m[0] + ' -> NOT JUDGED (the Movement leg is blocked, see §HQ_BLOCKED): a mutant on a path that never ran is not a kill'); continue; }
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { HQ_ONLY_ARMS: '1', HQ_MUT: JSON.stringify(m[1]) }) });
    var mm = /§HQ_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[2], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String((kk.stdout || '') + (kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
  }
  console.log('\n§HQ_MUTANTS');
  var killed = 0;
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§HQ_VERDICT ' + (fails ? 'FAIL' : BLOCKED.length ? 'PARTIAL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + partial + ' mutants_killed=' + killed + '/' + muts.length + (skipped ? ' mutants_unjudgeable=' + skipped : '') + ' pageerrors=' + errors);
  process.exit(fails ? 1 : BLOCKED.length ? 3 : 0);
})().catch(function (e) { console.log('§HQ_CRASH ' + (e && e.stack || e)); process.exit(2); });
