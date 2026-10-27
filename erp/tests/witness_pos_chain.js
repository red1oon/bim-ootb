#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-POS-CHAIN, bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13 (2.4 + 2.6 + the POS rule row, G-1…G-3 of TEAMWORK_FRAMEWORK §38.8). READ THE LOG after every run.
//   THE ISSUE: a till's ticket must become ONE completed sales order, made ONCE, by the head-office processor only, through legacy Import Orders, with no host code naming a table or process,
//   and the completed order must come back to the till. Before §13 a received row fired no listener (§9.1 gap 3), so no trigger could run on the processor at all.
//   The REAL erp/idempiere.html (?team=1, GardenAdmin) in TWO headless Chromium contexts on one dumb folder pipe (no GitHub): A = the processor (founder, role 102), B = the till (role 200001 'GardenWorld Admin Not Advanced').
//   WHY NOT role 103: I_Order is AccessLevel 2 (Client) and 103 is an Organization-level role, so legacy MRole.canUpdate refuses it (missing=T, measured): the comm admission then refuses the
//   till's rows on every device, as legacy would refuse the save. A till that declares tickets holds a role that may write the import table.
//   §C0 precondition — B enrolled; I_Order exists on both (the boot overlay); A holds the rule rows, B does not, and the rule rows are NOT shared (the plan declares them LOCAL).
//   §C1 the ticket   — B enters 3 I_Order rows with ONE ticket key (DocumentNo) through the ERP's own write path (window 281's commit funnel), Visits; B ran no Import Orders.
//   §C2 processor    — A Visits: §TEAM_REPLICA_IN fired the received rows; Import Orders invoked per row, imports once (#1/3 then #0/0); exactly ONE C_Order with DocumentNo = the key, DocStatus CO,
//                      3 lines; the 3 I_Order rows I_IsImported='Y'.
//   §C3 back         — A Visits (sends), B Visits: B holds that order (same c_order_uu, CO, 3 lines) and its I_Order rows read I_IsImported='Y'; B still ran no Import Orders.
//   §C4 once         — two more Visits on both: no second order, the rule fired nothing new (§TEAM_REPLICA_IN not repeated for the same rows).
//   §C5 FL-8         — the till's own I_Order saves fired no TANR (no §RULE_FIRE event=TANR on B at any point).   §C6 0 page errors.
//   §C7 own ticket   — a ticket the processor saves ITSELF is not imported by the replica rule, not at the save and not after its Visits re-project its own rows (TANR = received rows only).
//   §MUTANTS         — the adapter served with one rule broken; each must turn >= 1 arm red (a crashed child is NOT a kill).
// Run: node erp/tests/witness_pos_chain.js 2>&1 | tee /tmp/witness_pos_chain.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.PC_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var ADAPTER = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8');
// the ticket: one key, three lines — the minimal declaration of §38.8 G-1 (no BPartner: Import Orders takes AD_ClientInfo.C_BPartnerCashTrx_ID)
var KEY = process.env.PC_KEY || ('POS1/2026-10-27/' + String(1000 + Math.floor(Math.random() * 8999)));
var LINES = JSON.parse(process.env.PC_LINES || 'null');   // set below from the Import Orders witness fixture

(async function () {
  if (!QUIET) console.log('═══ W-POS-CHAIN — a till ticket becomes ONE completed order on the processor, and comes back (study §13) ═══  key=' + KEY + '\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-chain-')), cur = { plan: null, adapter: null };
  if (process.env.PC_MUT_FILE) cur.adapter = fs.readFileSync(process.env.PC_MUT_FILE, 'utf8');
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/erp/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plan = planJs(await signObj(PLAN, owner));

  async function device(name) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=281&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + encodeURIComponent(xcfg), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    approveAll: function (d, role) { return d.pg.evaluate(async function (role) { var r = await window.TeamSync.requests(); for (var x of r) await window.TeamSync.approve(x.rq, role); return r.length; }, role); },
    visit: function (d) { return d.pg.evaluate(async function () { var v = await window.TeamSync.visit(); return v && v.replicaIn; }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    // the ERP's own write path: applyOp (what a window's Save commits), then wait for the seal
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    // what the dictionary-driven page holds: the model layer's own read of the tip (base + sidecar)
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; }
  };
  if (!LINES) { console.log('§PC_VERDICT INCONCLUSIVE — no ticket lines (PC_LINES) given'); process.exit(2); }

  if (!QUIET) console.log('§S0 two devices: A = processor (founder, role 102), B = till (role 200001)');
  var A = await device('A'), B = await device('B'), space = await T.found(A); await T.join(B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(A, 200001); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  var hasIo = async function (d) { return d.pg.evaluate(function () { return window.__idmpDb.exec("SELECT count(*) FROM sqlite_master WHERE name='i_order'")[0].values[0][0]; }); };
  var tidIO = await A.pg.evaluate(function () { return Number(window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='i_order'")[0].values[0][0]); });
  // the processor's ONE rule row (device-local configuration), entered through the ERP's own write path
  var rid = await T.create(A, 'ad_rule', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: 990206, accesslevel: '3', entitytype: 'U', eventtype: 'T', isactive: 'Y', name: 'POS ticket -> Import Orders', ruletype: 'S', value: 'twin:process:206?DocAction=CO' });
  var svid = await T.create(A, 'ad_table_scriptvalidator', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: rid, ad_table_id: tidIO, eventmodelvalidator: 'TANR', isactive: 'Y', seqno: 10 });
  await T.visit(A); await T.visit(B);
  var bRules = await T.rows(B, "SELECT count(*) AS n FROM ad_table_scriptvalidator WHERE eventmodelvalidator='TANR'"), aRules = await T.rows(A, "SELECT count(*) AS n FROM ad_table_scriptvalidator WHERE eventmodelvalidator='TANR'");
  var localRule = A.logs.filter(function (l) { return /§TEAM_STATION_LOCAL op=CRUD_CREATE station-owned ad_(rule|table_scriptvalidator)/.test(l); }).length;
  verdict('C0', (await T.enrolled(B)) && (await hasIo(A)) === 1 && (await hasIo(B)) === 1, 'B enrolled as the till; the I_Order table exists on both (boot overlay)', 'io A=' + (await hasIo(A)) + ' B=' + (await hasIo(B)));
  verdict('C0', rid != null && svid != null && Number(aRules[0].n) === 1 && Number(bRules[0].n) === 0 && localRule === 2, 'the rule rows are on the processor ONLY: sealed on A, not shared (plan LOCAL: 2 §TEAM_STATION_LOCAL lines), absent on B', 'rule=' + rid + ' sv=' + svid + ' A=' + aRules[0].n + ' B=' + bRules[0].n + ' local=' + localRule);

  if (!QUIET) console.log('§S1 the till enters the ticket ' + KEY + ' (' + LINES.length + ' lines) and Visits');
  var made = [], mark = B.logs.length;
  for (var li = 0; li < LINES.length; li++) made.push(await T.create(B, 'i_order', Object.assign({ documentno: KEY }, LINES[li])));
  await T.visit(B);
  if (!QUIET) B.logs.slice(mark).filter(function (l) { return /§(CRUD|OPLOG|MODEL|BUS|TEAM|RULE|SEQ)|rror|refus/i.test(l); }).slice(0, 30).forEach(function (l) { console.log('   B: ' + l.slice(0, 240)); });
  verdict('C1', made.every(function (x) { return x != null; }) && T.count(B, /§RULE_PROCESS ref=206/) === 0, 'the till sealed ' + LINES.length + ' I_Order rows through applyOp and ran no Import Orders', 'created=' + JSON.stringify(made));

  if (!QUIET) console.log('§S2 the processor Visits');
  var rin = await T.visit(A);
  if (!QUIET) A.logs.filter(function (l) { return /§TEAM_VISIT|§TEAM_PROJECT_SKIP|§TEAM_REPLICA/.test(l); }).slice(-4).forEach(function (l) { console.log('   A: ' + l.slice(0, 300)); });
  var ordA = await T.rows(A, "SELECT c_order_id AS id, c_order_uu AS uu, docstatus AS ds, c_bpartner_id AS bp, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
  var ioA = await T.rows(A, "SELECT i_isimported AS imp, c_order_id AS oid FROM i_order WHERE documentno='" + KEY + "'");
  console.log('   §PC_A replicaIn=' + JSON.stringify(rin) + ' orders=' + JSON.stringify(ordA) + ' i_order=' + JSON.stringify(ioA));
  A.logs.filter(function (l) { return /§TEAM_REPLICA_(IN|EXCEPTION)|§RULE_(FIRE|PROCESS|VETO)|§BUS_REPLICA/.test(l); }).slice(0, 10).forEach(function (l) { console.log('   A: ' + l.slice(0, 220)); });
  verdict('C2', rin && rin.received >= LINES.length && rin.exceptions === 0 && rin.committed === true, 'the processor fired the received rows (§TEAM_REPLICA_IN) and committed what the rule wrote', JSON.stringify(rin));
  var runs = A.logs.filter(function (l) { return /§RULE_PROCESS ref=206 /.test(l); }), imp = runs.filter(function (l) { return /summary=#1\/3/.test(l); }).length, empty = runs.filter(function (l) { return /summary=#0\/0/.test(l); }).length;
  verdict('C2', runs.length === LINES.length && imp === 1 && empty === LINES.length - 1, 'Import Orders is invoked once per received row (TANR is per record, as legacy) and imports ONCE: one run #1/' + LINES.length + ', the others #0/0 (I_IsImported, legacy idempotency)', 'runs=' + runs.length + ' imported=' + imp + ' empty=' + empty);
  verdict('C2', ordA.length === 1 && ordA[0].ds === 'CO' && Number(ordA[0].nl) === LINES.length, 'exactly ONE C_Order with DocumentNo = the ticket key, DocStatus CO, ' + LINES.length + ' lines (Import Orders, legacy)', JSON.stringify(ordA));
  verdict('C2', ioA.length === LINES.length && ioA.every(function (r) { return r.imp === 'Y' && r.oid != null; }), 'the ' + LINES.length + ' I_Order rows read I_IsImported=Y and name the order', JSON.stringify(ioA));

  if (!QUIET) console.log('§S3 the processor Visits (sends), the till Visits');
  await T.visit(A); await T.visit(B);
  var ordB = await T.rows(B, "SELECT c_order_uu AS uu, docstatus AS ds, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
  var ioB = await T.rows(B, "SELECT i_isimported AS imp FROM i_order WHERE documentno='" + KEY + "'");
  console.log('   §PC_B orders=' + JSON.stringify(ordB) + ' i_order=' + JSON.stringify(ioB));
  verdict('C3', ordB.length === 1 && ordA.length === 1 && ordB[0].uu === ordA[0].uu && ordB[0].ds === 'CO' && Number(ordB[0].nl) === LINES.length, 'the till holds THE SAME completed order (same c_order_uu, CO, ' + LINES.length + ' lines)', 'B=' + JSON.stringify(ordB));
  verdict('C3', ioB.length === LINES.length && ioB.every(function (r) { return r.imp === 'Y'; }) && T.count(B, /§RULE_PROCESS ref=206/) === 0, 'the till sees its ticket imported and ran no Import Orders itself', JSON.stringify(ioB));

  if (!QUIET) console.log('§S4 two more Visits each');
  var p0 = T.count(A, /§RULE_PROCESS ref=206 /), r0 = T.count(A, /§TEAM_REPLICA_IN received=/);
  for (var k = 0; k < 2; k++) { await T.visit(A); await T.visit(B); }
  var ordA2 = await T.rows(A, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'"), ordB2 = await T.rows(B, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'");
  verdict('C4', Number(ordA2[0].n) === 1 && Number(ordB2[0].n) === 1 && T.count(A, /§RULE_PROCESS ref=206 /) === p0, 'no second order and Import Orders did not run again (the fired set holds across Visits and refolds)', 'A=' + ordA2[0].n + ' B=' + ordB2[0].n + ' processRuns ' + p0 + '->' + T.count(A, /§RULE_PROCESS ref=206 /) + ' replicaIn lines ' + r0 + '->' + T.count(A, /§TEAM_REPLICA_IN received=/));
  // C7: a ticket the PROCESSOR saves itself is an ordinary save (afterNew), not a replica: its TANR row must NOT import it - not at the save, and not after a Visit re-projects the processor's own rows
  var KEY2 = KEY + '-HQ', p1 = T.count(A, /§RULE_PROCESS ref=206 /);
  for (var lj = 0; lj < LINES.length; lj++) await T.create(A, 'i_order', Object.assign({ documentno: KEY2 }, LINES[lj]));
  await T.visit(A); await T.visit(A);
  var own2 = await T.rows(A, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY2 + "'"), io2 = await T.rows(A, "SELECT i_isimported AS imp FROM i_order WHERE documentno='" + KEY2 + "'");
  verdict('C7', Number(own2[0].n) === 0 && io2.length === LINES.length && io2.every(function (r) { return r.imp === 'N'; }) && T.count(A, /§RULE_PROCESS ref=206 /) === p1, 'the processor\'s OWN ticket is not imported by the replica rule, even after its Visits (only a row received from another device fires TANR)', 'orders=' + own2[0].n + ' rows=' + JSON.stringify(io2) + ' processRuns ' + p1 + '->' + T.count(A, /§RULE_PROCESS ref=206 /));
  verdict('C5', T.count(B, /§RULE_FIRE .*event=TANR/) === 0, 'the till fired no TANR rule at any point (its own saves are ordinary saves; it holds no rule row)', 'B TANR fires=' + T.count(B, /§RULE_FIRE .*event=TANR/));
  verdict('C6', errors === 0, '0 page errors on both devices', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§PC_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§PC_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (process.env.PC_NO_MUT) { console.log('§PC_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors); process.exit(0); }
  var M = [
    ['the fired set is not kept (every Visit fires again)', '    todo.forEach(function (x) { fired[x.hash] = 1; });\n', '\n', ['C4']],
    ['the till fires its OWN rows too (author filter removed)', "if (e.author !== (dev && dev.kid) && (b.op_type", "if ((b.op_type", ['C7', 'C1', 'C5', 'C4', 'C2']],
    ['no replica firing after the projection', "      var rin = res && res.ok ? await fireReceived(pj) : null;", "      var rin = null;", ['C2']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    if (ADAPTER.split(m[1]).length !== 2) { muts.push({ name: m[0], error: 'MUTATION DID NOT APPLY (anchor not found exactly once)' }); continue; }
    var tmp = path.join(os.tmpdir(), 'pc_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, ADAPTER.replace(m[1], m[2]));
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { PC_ONLY_ARMS: '1', PC_MUT_FILE: tmp }) });
    fs.unlinkSync(tmp); var mm = /§PC_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[3], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String(kk.stderr || kk.stdout).split('\n').slice(-3).join(' ') });
  }
  console.log('\n§PC_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§PC_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); }).length + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§PC_CRASH ' + (e && e.stack || e)); process.exit(2); });
