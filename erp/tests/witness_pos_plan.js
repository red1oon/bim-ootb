#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-POS-PLAN browser arm, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §38.14 + §38.15 (G-6 role-scoped delivery). READ THE LOG after every run — the exit code is not evidence.
//   THE ISSUE: W-POS-CHAIN measured that a till received the processor's whole Complete group (103 ops). Under a POS (star) plan the till must receive ONLY what the plan declares for its role, and a borrower
//   device only the records of ITS borrower (same role as the next borrower). The REAL erp/idempiere.html (?team=1) in headless Chromium contexts on one dumb folder pipe (no GitHub), counted from the engine's
//   fold (what the relay delivered) and the adapter's projection (what the device took in) - never from a screenshot.
//   §B0 BEFORE   an OFFICE space (no `plan`): A = processor (founder, 102), B = till (200001); the SAME ticket as W-POS-CHAIN. Count what the till receives (ops, envelope bytes).
//   §B1 AFTER    a POS space (founded with ?teamplan=pos): A, B, C1 and C2 = two borrower devices (role 103), each BOUND to a different C_BPartner by the admin's signed PERSON (person_uu = the BP's C_BPartner_UU).
//                The till declares the same ticket; the processor imports it (Import Orders, 103-op Complete group), makes a replenishment line, and issues a loan + instalment to each borrower; C1 deposits a payment.
//   §B2 JUDGED   the till received exactly the ops the plan declares for its role (computed from the plan itself), none of the Complete group, and it did not take in the borrowers' flows;
//                C2 received 0 of C1's loan / instalment / payment (and C1 holds its own: the 0 is not vacuous); the processor still imported ONE completed order; 0 page errors.
//   §MUTANTS     the adapter / reader served with one rule broken; each must turn >= 1 arm red (a crashed child is NOT a kill).
// Run: PC_LINES='[...]' node erp/tests/witness_pos_plan.js 2>&1 | tee /tmp/witness_pos_plan_browser.log     (PC_LINES = the W-POS-CHAIN ticket lines; PPB_NO_MUT=1 skips the mutants)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.PPB_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN'), POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS');
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var ADAPTER = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8'), READER = fs.readFileSync(path.join(ROOT, 'common', 'comm', 'team_scope.js'), 'utf8');
var KEY = 'POS1/2026-10-28/' + String(1000 + Math.floor(Math.random() * 8999)), LINES = JSON.parse(process.env.PC_LINES || 'null'), TILL = 200001, BORR = 50004, HQ = 102;
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  if (!LINES) { console.log('§PPB_VERDICT INCONCLUSIVE — no ticket lines (PC_LINES) given'); process.exit(2); }
  if (!QUIET) console.log('═══ W-POS-PLAN (browser) — the till receives only what the plan declares; borrower 2 receives 0 of borrower 1 (§38.14/§38.15) ═══  key=' + KEY + '\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-plan-')), cur = { plans: {}, adapter: process.env.PPB_MUT_ADAPTER ? fs.readFileSync(process.env.PPB_MUT_ADAPTER, 'utf8') : null, reader: process.env.PPB_MUT_READER ? fs.readFileSync(process.env.PPB_MUT_READER, 'utf8') : null };
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos, '/erp/team_sync.js': cur.adapter, '/common/comm/team_scope.js': cur.reader }[p];
    if (over) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64'));

  async function device(name, extra) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=281&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + (extra || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    kid: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).device; }); },
    // the admin approves ONE device by its kid: role, and (optionally) the entity record it is bound to (person_uu = that record's _uu)
    approve: function (a, kid, role, entityUu) { return a.pg.evaluate(async function (x) { var r = await window.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await window.TeamSync.approve(q.rq, x.role, x.ent); return true; } return false; }, { kid: kid, role: role, ent: entityUu || null }); },
    visit: function (d) { return d.pg.evaluate(async function () { var v = await window.TeamSync.visit(); return v && v.replicaIn; }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    db: function (d, sql) { return d.pg.evaluate(function (q) { var r = window.__idmpDb.exec(q); return r.length ? r[0].values : []; }, sql); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; },
    // what the RELAY delivered into this device's fold, and what the device TOOK IN (projection): counted from the engine's fold and the adapter's last projection, per table
    measure: function (d) { return d.pg.evaluate(async function () { var S = window.TeamSync.store(), kid = (await window.TeamSync.pairState()).device, f = await S.foldable(), m = { delivered: 0, deliveredBytes: 0, ownPlaced: 0, ownBytes: 0 }, tabs = {};
      f.forEach(function (p) { var n = JSON.stringify(p.env).length; if (p.env.author === kid) { m.ownPlaced++; m.ownBytes += n; } else { m.delivered++; m.deliveredBytes += n; tabs[p.env.target.table] = (tabs[p.env.target.table] || 0) + 1; } });
      var last = window.TeamSync._project.last || {}; m.projected = last.projected; m.skipped = last.skipped; m.thin = last.thin || null; m.deliveredTables = tabs; m.sentOps = Object.keys(window.TeamSync.sent()).length; m.kid = kid; m.byTable = last.byTable || {}; return m; }); }
  };
  var sum = function (d, re) { var n = 0; d.logs.forEach(function (l) { var m = re.exec(l); if (m) n += Number(m[1]); }); return n; };

  // ═══ §B0 BEFORE: the office space (no `plan`): the same ticket as W-POS-CHAIN ═══
  if (!QUIET) console.log('§B0 BEFORE — an OFFICE space (no plan): A processor, B till');
  var A0 = await device('A0'), B0 = await device('B0'), sp0 = await T.found(A0); await T.join(B0, sp0);
  for (var i = 0; i < 4; i++) { await T.approve(A0, await T.kid(B0), TILL); await T.visit(B0); await T.visit(A0); if (await T.enrolled(B0)) break; await sleep(300); }
  var tid0 = await A0.pg.evaluate(function () { return Number(window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='i_order'")[0].values[0][0]); });
  var rid0 = await T.create(A0, 'ad_rule', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: 990206, accesslevel: '3', entitytype: 'U', eventtype: 'T', isactive: 'Y', name: 'POS ticket -> Import Orders', ruletype: 'S', value: 'twin:process:206?DocAction=CO' });
  await T.create(A0, 'ad_table_scriptvalidator', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: rid0, ad_table_id: tid0, eventmodelvalidator: 'TANR', isactive: 'Y', seqno: 10 });
  await T.visit(A0); await T.visit(B0);
  var mark0 = await T.measure(B0);
  for (var li = 0; li < LINES.length; li++) await T.create(B0, 'i_order', Object.assign({ documentno: KEY }, LINES[li]));
  await T.visit(B0); await T.visit(A0); await T.visit(A0); await T.visit(B0); await T.visit(A0); await T.visit(B0);
  var m0 = await T.measure(B0), ord0 = await T.rows(A0, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'"), ordB0 = await T.rows(B0, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'");
  var before = { ops: m0.projected - m0.ownPlaced, bytes: m0.deliveredBytes, delivered: m0.delivered, tables: m0.deliveredTables };
  console.log('   §PPB_BEFORE office space · till B received ops=' + before.ops + ' (delivered by the relay ' + before.delivered + ') envelope_bytes=' + before.bytes + ' tables=' + Object.keys(before.tables).length + ' ' + JSON.stringify(before.tables).slice(0, 220));
  verdict('B0', Number(ord0[0].n) === 1 && Number(ordB0[0].n) === 1 && before.ops > 40, 'CONTROL (office plan): the till holds the completed order and received the processor\'s Complete group (the finding of W-POS-CHAIN: 103 ops committed at the processor; the share-able part reaches the till)', 'orders A=' + ord0[0].n + ' B=' + ordB0[0].n + ' till_received_ops=' + before.ops);
  await A0.ctx.close(); await B0.ctx.close();

  // ═══ §B1 AFTER: the POS space ═══
  if (!QUIET) console.log('§B1 AFTER — a POS space (?teamplan=pos): A processor, B till, C1 + C2 borrowers bound to two C_BPartners');
  var A = await device('A', '&teamplan=pos'), B = await device('B'), C1 = await device('C1'), C2 = await device('C2'), space = await T.found(A);
  var bps = await T.db(A, "SELECT c_bpartner_id, c_bpartner_uu FROM c_bpartner WHERE ad_client_id=11 AND iscustomer='Y' AND c_bpartner_uu IS NOT NULL AND c_bpartner_id<>(SELECT c_bpartnercashtrx_id FROM ad_clientinfo WHERE ad_client_id=11) ORDER BY c_bpartner_id LIMIT 3");      // not the cash customer: a POS order's own invoice must stay addressed to nobody
  var locs = await T.db(A, "SELECT m_locator_id FROM m_locator WHERE ad_client_id=11 ORDER BY m_locator_id LIMIT 2");
  for (var d of [B, C1, C2]) await T.join(d, space);
  for (var k = 0; k < 5; k++) { await T.approve(A, await T.kid(B), TILL); await T.approve(A, await T.kid(C1), BORR, bps[0][1]); await T.approve(A, await T.kid(C2), BORR, bps[1][1]);
    for (var d2 of [B, C1, C2, A]) await T.visit(d2); if ((await T.enrolled(B)) && (await T.enrolled(C1)) && (await T.enrolled(C2))) break; await sleep(300); }
  var kind = async function (d) { return d.pg.evaluate(function () { return window.TeamScope.kind() + ':' + window.TeamSync._scopeCtx().role; }); };
  verdict('B1', (await kind(A)) === 'pos:102' && (await kind(B)) === 'pos:200001' && (await kind(C1)) === 'pos:' + BORR && (await kind(C2)) === 'pos:' + BORR, 'all four devices read the POS plan from the genesis (kind:role) - nobody was told by a flag', [await kind(A), await kind(B), await kind(C1), await kind(C2)].join(' '));
  var tid = await A.pg.evaluate(function () { return Number(window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='i_order'")[0].values[0][0]); });
  var rid = await T.create(A, 'ad_rule', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: 990206, accesslevel: '3', entitytype: 'U', eventtype: 'T', isactive: 'Y', name: 'POS ticket -> Import Orders', ruletype: 'S', value: 'twin:process:206?DocAction=CO' });
  await T.create(A, 'ad_table_scriptvalidator', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: rid, ad_table_id: tid, eventmodelvalidator: 'TANR', isactive: 'Y', seqno: 10 });
  for (var d3 of [A, B, C1, C2]) await T.visit(d3);
  var markB = await T.measure(B);
  for (var lj = 0; lj < LINES.length; lj++) await T.create(B, 'i_order', Object.assign({ documentno: KEY }, LINES[lj]));
  await T.visit(B); await T.visit(A); await T.visit(A);                                           // the processor imports (103-op Complete group)
  var tag = String(Math.floor(Math.random() * 9000) + 1000), nA = 'LN-A-' + tag, nB = 'LN-B-' + tag, slip = 'SLIP-' + tag;
  var mv = await T.create(A, 'm_movementline', { ad_client_id: 11, ad_org_id: 11, m_product_id: 123, qtyentered: 5, c_uom_id: 100, m_locator_id: locs[0][0], m_locatorto_id: locs[1][0], description: 'replenish note that must stay' });
  var invA = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[0][0], documentno: nA, grandtotal: 228.85, dateinvoiced: '2026-10-28 00:00:00', issotrx: 'Y', description: 'secret of A' });
  var invB = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[1][0], documentno: nB, grandtotal: 100, dateinvoiced: '2026-10-28 00:00:00', issotrx: 'Y', description: 'secret of B' });
  var scA = invA != null ? await T.create(A, 'c_invoicepayschedule', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: invA, dueamt: 114.43, duedate: '2026-11-27 00:00:00' }) : null;
  var scB = invB != null ? await T.create(A, 'c_invoicepayschedule', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: invB, dueamt: 50, duedate: '2026-11-27 00:00:00' }) : null;
  console.log('   §PPB_MADE movementline=' + mv + ' invoiceA=' + invA + ' invoiceB=' + invB + ' scheduleA=' + scA + ' scheduleB=' + scB);
  await T.visit(A);
  var payId = await T.create(C1, 'c_payment', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[0][0], payamt: 114.43, documentno: slip, description: 'photo of the slip' });
  for (var r = 0; r < 3; r++) for (var d4 of [C1, C2, B, A]) await T.visit(d4);
  var mA = await T.measure(A), mB = await T.measure(B), mC1 = await T.measure(C1), mC2 = await T.measure(C2);
  var table = function (m) { return Object.keys(m.byTable).sort().map(function (t) { return t + ':' + m.byTable[t]; }).join(','); };
  [['A', mA], ['B(till)', mB], ['C1', mC1], ['C2', mC2]].forEach(function (x) { console.log('   §PPB_AFTER ' + x[0] + ' delivered_by_relay=' + x[1].delivered + ' (' + x[1].deliveredBytes + ' B) projected=' + x[1].projected + ' own=' + x[1].ownPlaced + ' thin=' + JSON.stringify(x[1].thin) + ' projected_tables=' + table(x[1])); });

  // ── §B2 judged against the plan ──
  var tillRecv = mB.thin.accepted - mB.ownPlaced, tillBytes = mB.thin.bytesAccepted - mB.ownBytes;
  var declared = await B.pg.evaluate(function (ts) { return ts.filter(function (t) { return window.TeamScope.scopeOf(t, 200001) === 'receive'; }); }, Object.keys(Object.assign({}, mA.byTable, mB.deliveredTables)));
  var aSentTables = await A.pg.evaluate(async function () { var f = await window.TeamSync.store().foldable(), kid = (await window.TeamSync.pairState()).device, t = {}; f.forEach(function (p) { if (p.env.author === kid) t[p.env.target.table] = (t[p.env.target.table] || 0) + 1; }); return t; });
  var expectTill = declared.reduce(function (s, t) { return s + (aSentTables[t] || 0); }, 0);
  console.log('   §PPB_TILL before(office): ops=' + before.ops + ' bytes=' + before.bytes + ' | after(pos): ops=' + tillRecv + ' bytes=' + tillBytes + ' | the plan declares for role ' + TILL + ' to RECEIVE: ' + JSON.stringify(declared) + ' -> processor authored ' + expectTill + ' such ops');
  verdict('B2', before.ops > 40 && tillRecv === expectTill && expectTill >= 1 && tillRecv < before.ops / 10, 'THE TILL: received ' + tillRecv + ' ops (was ' + before.ops + ') = exactly the ' + expectTill + ' the plan declares for its role (the replenishment line)', 'bytes ' + before.bytes + ' -> ' + tillBytes);
  var undeclared = sum(A, /§TEAM_NOT_DECLARED plan=pos role=102 ops=(\d+)/);
  verdict('B2', undeclared >= 90 && Object.keys(aSentTables).every(function (t) { return ['m_movementline', 'c_invoice', 'c_invoicepayschedule'].indexOf(t) >= 0; }), 'AT THE SOURCE: the processor kept ' + undeclared + ' undeclared ops on its own device (§TEAM_NOT_DECLARED) and put on the pipe only ' + JSON.stringify(aSentTables), 'sent tables=' + Object.keys(aSentTables).join(','));
  var bTabs = Object.keys(mB.byTable).filter(function (t) { return mB.byTable[t] > 0; });
  var bOwn = await T.rows(B, "SELECT count(*) AS n FROM i_order WHERE documentno='" + KEY + "'"), bOrd = await T.rows(B, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'"), bInv = await T.rows(B, "SELECT count(*) AS n FROM c_invoice WHERE documentno IN ('" + nA + "','" + nB + "')");
  verdict('B2', Number(bOrd[0].n) === 0 && Number(bInv[0].n) === 0 && Number(bOwn[0].n) === LINES.length && bTabs.every(function (t) { return ['i_order', 'm_movementline'].indexOf(t) >= 0; }), 'the till holds its own ' + LINES.length + ' ticket lines but NOT the completed order, NOT the borrowers\' loans (the processor\'s order / shipment / invoice / postings never reached it)', 'projected tables=' + table(mB) + ' order=' + bOrd[0].n + ' loans=' + bInv[0].n);
  var q1 = await T.rows(C1, "SELECT documentno AS d, description AS ds FROM c_invoice WHERE documentno IN ('" + nA + "','" + nB + "')"), q2 = await T.rows(C2, "SELECT documentno AS d, description AS ds FROM c_invoice WHERE documentno IN ('" + nA + "','" + nB + "')");
  var s1 = await T.rows(C1, "SELECT dueamt AS a FROM c_invoicepayschedule WHERE duedate LIKE '2026-11-27%'"), s2 = await T.rows(C2, "SELECT dueamt AS a FROM c_invoicepayschedule WHERE duedate LIKE '2026-11-27%'");
  var pq = "FROM c_payment WHERE c_bpartner_id=" + bps[0][0] + " AND payamt=114.43", p1 = await T.rows(C1, "SELECT payamt AS a, documentno AS d, description AS ds " + pq), p2 = await T.rows(C2, "SELECT payamt AS a " + pq), pA = await T.rows(A, "SELECT payamt AS a, documentno AS d, description AS ds " + pq);
  if (!(mC1.thin.accepted - mC1.ownPlaced > 0)) verdict('B2', false, 'INCONCLUSIVE - borrower 1 took in nothing, so borrower 2\'s 0 would mean nothing', JSON.stringify(mC1.thin));
  verdict('B2', q1.length === 1 && q1[0].d === nA && s1.length === 1 && Number(s1[0].a) === 114.43 && p1.length === 1 && p1[0].d === slip && p1[0].ds === 'photo of the slip', 'BORROWER 1 holds ITS loan (' + nA + '), ITS instalment (114.43) and its own payment WITH its own full record (slip number, photo note: only the carried columns ever left the phone)', JSON.stringify([q1, s1, p1]).slice(0, 160));
  verdict('B2', q2.length === 1 && q2[0].d === nB && s2.length === 1 && Number(s2[0].a) === 50 && p2.length === 0 && !JSON.stringify([q2, s2, p2]).match(/228\.85|114\.43|secret of A/), 'BORROWER 2 (same role) holds ITS loan (' + nB + ') and instalment (50) and 0 of borrower 1\'s loan / instalment / payment', JSON.stringify([q2, s2, p2]).slice(0, 160));
  verdict('B2', mC2.thin.accepted - mC2.ownPlaced === 2 && mC2.delivered > mC2.thin.accepted - mC2.ownPlaced && mC2.thin.refused > 0, 'borrower 2 took in exactly 2 ops (its loan, its instalment) although the relay delivered ' + mC2.delivered + ' - it refused ' + mC2.thin.refused + ' locally (not-addressed, ' + mC2.thin.bytesRefused + ' bytes never projected)', JSON.stringify(mC2.thin));
  verdict('B2', pA.length === 1 && Number(pA[0].a) === 114.43 && !pA[0].ds && !pA[0].d, 'the processor received the borrower\'s payment carrying only its declared columns (payamt; the slip number and the photo note stayed on the phone)', JSON.stringify(pA));
  var ordA = await T.rows(A, "SELECT docstatus AS ds, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
  verdict('B2', ordA.length === 1 && ordA[0].ds === 'CO' && Number(ordA[0].nl) === LINES.length, 'the processor still imported ONE completed order from the till\'s declaration (the plan thinned the pipe, not the business)', JSON.stringify(ordA));
  verdict('B2', errors === 0, '0 page errors on all devices', 'errors=' + errors + (errors ? ' ' + [A, B, C1, C2].map(function (d) { return d.errs[0]; }).filter(Boolean).slice(0, 2).join(' | ') : ''));
  // ── §B3 catch-up on bind (§41.2 L1): a loan issued BEFORE its borrower's phone is bound reaches it when it is ──
  var nC = 'LN-C-' + tag, invC = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[2][0], documentno: nC, grandtotal: 70, dateinvoiced: '2026-10-28 00:00:00', issotrx: 'Y', description: 'secret of C' });
  var scC = invC != null ? await T.create(A, 'c_invoicepayschedule', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: invC, dueamt: 35, duedate: '2026-12-01 00:00:00' }) : null;
  await T.visit(A); await T.visit(A);
  var whFor = function (d) { return d.pg.evaluate(function () { var w = window.TeamSync.localOnly(); return Object.keys(w).filter(function (k) { return /^no-addressee/.test(w[k]); }).length; }); }, wh0 = await whFor(A);
  // the processor's page RELOADS between issue and bind: only what the device persisted (rows, sent, localOnly) comes back
  await A.pg.reload({ waitUntil: 'load' });
  await A.pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
  await A.pg.evaluate(function () { return window.TeamSync.ready; }); await T.visit(A);
  var whR = await whFor(A);
  var C3 = await device('C3'); await T.join(C3, space);
  var c3Before = await T.rows(C3, "SELECT count(*) AS n FROM c_invoice WHERE documentno='" + nC + "'");
  for (var k3 = 0; k3 < 5; k3++) { await T.approve(A, await T.kid(C3), BORR, bps[2][1]); await T.visit(C3); await T.visit(A); await T.visit(C3); if (await T.enrolled(C3)) break; await sleep(300); }
  for (var r3 = 0; r3 < 3; r3++) for (var d5 of [A, C3, C1, C2, B]) await T.visit(d5);
  var wh1 = await whFor(A), cuLines = A.logs.filter(function (l) { return /§TEAM_CATCHUP op=/.test(l); });
  var c3q = await T.rows(C3, "SELECT documentno AS d, description AS ds FROM c_invoice WHERE documentno='" + nC + "'"), c3s = await T.rows(C3, "SELECT dueamt AS a FROM c_invoicepayschedule WHERE duedate LIKE '2026-12-01%'");
  var leak = await T.rows(C1, "SELECT count(*) AS n FROM c_invoice WHERE documentno='" + nC + "'"), leak2 = await T.rows(C2, "SELECT count(*) AS n FROM c_invoice WHERE documentno='" + nC + "'");
  console.log('   §PPB_CATCHUP withheld before bind=' + wh0 + ' after=' + wh1 + ' §TEAM_CATCHUP lines=' + cuLines.length + ' late borrower holds ' + JSON.stringify([c3q, c3s]));
  verdict('B3', wh0 >= 2 && whR === wh0 && Number(c3Before[0].n) === 0, 'BEFORE the bind the processor holds the late borrower\'s loan + instalment back (marked no-addressee, ' + wh0 + ' held in all), the mark SURVIVES a reload of the page (' + whR + '), and the device (just joined) has nothing', 'held=' + wh0 + ' after reload=' + whR + ' device has ' + c3Before[0].n);
  verdict('B3', whR - wh1 === 2 && cuLines.length === 2 && c3q.length === 1 && c3q[0].d === nC && !c3q[0].ds && c3s.length === 1 && Number(c3s[0].a) === 35, 'AFTER the bind the RELOADED processor released exactly 2 records (§TEAM_CATCHUP x2, once, across 3 further Visits) and the late borrower holds its loan and instalment with carried columns only', JSON.stringify([wh1, cuLines.length, c3q, c3s]).slice(0, 170));
  verdict('B3', Number(leak[0].n) === 0 && Number(leak2[0].n) === 0, 'borrowers 1 and 2 received none of it', 'C1=' + leak[0].n + ' C2=' + leak2[0].n);
  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§PPB_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§PPB_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (process.env.PPB_NO_MUT) { console.log('§PPB_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors + ' till_ops ' + before.ops + '->' + tillRecv + ' till_bytes ' + before.bytes + '->' + tillBytes + ' borrower2_of_1=0'); process.exit(0); }
  var M = [
    ['the inbound filter is off (everything the relay delivered is projected)', 'adapter', '      if (thin && thin.refuse[p.hash]) return;', '', ['B2']],
    ['`by` is ignored: a DOWN row is addressed by role alone', 'reader', 'if (!by || !by.length) return { ok: true };', 'if (true) return { ok: true };', ['B2']],
    ['catch-up on bind is off (a held record is never released)', 'adapter', "if (!S || scopeCtx.kind !== 'pos') return out;", 'return out;', ['B3']],
    ['the sender sends undeclared tables (every table is shipped as a flow)', 'adapter', "else if (scope !== 'share') return {", "else if (false) return {", ['B2']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var srcText = m[1] === 'adapter' ? ADAPTER : READER;
    if (srcText.split(m[2]).length !== 2) { muts.push({ name: m[0], error: 'MUTATION DID NOT APPLY (anchor not found exactly once)' }); continue; }
    var tmp = path.join(os.tmpdir(), 'ppb_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, srcText.replace(m[2], m[3]));
    var env = Object.assign({}, process.env, { PPB_ONLY_ARMS: '1' }); if (m[1] === 'adapter') env.PPB_MUT_ADAPTER = tmp; else env.PPB_MUT_READER = tmp;
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: env });
    fs.unlinkSync(tmp); var mm = /§PPB_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[4], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String(kk.stderr || kk.stdout).split('\n').slice(-3).join(' ') });
  }
  console.log('\n§PPB_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor = hole)'))); });
  console.log('§PPB_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); }).length + '/' + muts.length + ' pageerrors=' + errors + ' till_ops ' + before.ops + '->' + tillRecv + ' till_bytes ' + before.bytes + '->' + tillBytes);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§PPB_CRASH ' + (e && e.stack || e)); process.exit(2); });
