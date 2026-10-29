#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-FLOOR-POS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §46.6 S1+S2 (review findings F1/F2): a late till ticket below the shape floor is PARKED, then translated, then IMPORTED. READ THE LOG after every run: verdict = §FL_VERDICT.
//   THE ISSUE it proves/disproves (§46.1 D1, "a till offline for weeks comes back after the floor was raised"): the old engine REFUSED the ticket `retired-version` on every device (a silent loss of a real sale). It must be PARKED `needs-translation`
//   (visible, lossless), and once the admin publishes a signed translation set it must fold, be projected, fire the processor's Import Orders rule once, and become ONE completed order. The REAL erp/idempiere.html (?team=1, GardenAdmin)
//   in TWO headless Chromium contexts on one dumb folder pipe: A = the processor (founder, role 102, shape 2: CRUD_CREATE), B = the till (role 200001, shape 1, writes tickets in the OLD shape through the ERP's own commit funnel).
//   §F0 precondition — B enrolled; the processor holds the one rule row (device-local), as in W-POS-CHAIN.
//   §F1 parked     — B enters a 3-row ticket OFFLINE; THEN the admin raises the floor (min_v CRUD_CREATE 2, stamped with its frontier: it had not seen the ticket); B Visits, A Visits: the 3 ops are PARKED needs-translation on A (NOT refused,
//                    none retired-version / dep-refused), nothing is projected (no I_Order row, no C_Order), Import Orders has not run, the Team chip says "wait for a translation".
//   §F2 translated — the admin publishes ONE signed translation set (v1 -> v2: default Description); A Visits: the 3 ops are MERGED, projected with the translated field, Import Orders runs, ONE C_Order CO with 3 lines, the 3 I_Order rows I_IsImported=Y.
//   §F3 nothing lost — all 3 ticket ops MERGED, 0 version-refused on A.   §F4 0 page errors.   §MUTANTS — the engine files served with one rule broken; each must turn >= 1 arm red (a crashed child is NOT a kill).
// RED proof: FL_OLD_DIR=<dir holding origin/main's common/comm/*.js> serves the OLD engine under the same witness.
// Run: FL_LINES="$(cat <ticket-lines.json>)" node erp/tests/witness_team_floor.js 2>&1 | tee /tmp/witness_team_floor.log      (FL_LINES = the same fixture W-POS-CHAIN takes as PC_LINES)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.FL_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
// the ticket: one key, three lines — the minimal declaration of §38.8 G-1 (no BPartner: Import Orders takes AD_ClientInfo.C_BPartnerCashTrx_ID)
var KEY = process.env.FL_KEY || ('POS1/2026-10-29/' + String(1000 + Math.floor(Math.random() * 8999)));
var LINES = JSON.parse(process.env.FL_LINES || 'null');   // set below from the Import Orders witness fixture

(async function () {
  if (!QUIET) console.log('═══ W-FLOOR-POS — a till ticket becomes ONE completed order on the processor, and comes back (study §13) ═══  key=' + KEY + '\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-chain-')), cur = { plan: null, mutPath: null, mutText: null };
  if (process.env.FL_MUT_FILE) { cur.mutPath = process.env.FL_MUT_PATH; cur.mutText = fs.readFileSync(process.env.FL_MUT_FILE, 'utf8'); }       // a mutant: serve the broken file at that URL
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (process.env.FL_OLD_DIR && p.indexOf('/common/comm/') === 0 && fs.existsSync(path.join(process.env.FL_OLD_DIR, path.basename(p)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(process.env.FL_OLD_DIR, path.basename(p)))); return; }       // RED proof: serve the engine files of origin/main
    if (cur.mutPath && p === cur.mutPath) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.mutText); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plan = planJs(await signObj(PLAN, owner));

  async function device(name, shape) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; if (c.shape) window.TEAM_SHAPE_V = c.shape; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: [owner.pub], shape: shape || null })).toString('base64');
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
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; },
    // the verdict of every I_Order ticket op in the comm log, as THIS device folds it
    ticket: function (d) { return d.pg.evaluate(async function () { var S = window.TeamSync.store(), L = await S.order(), out = [];
      S.query('SELECT op_hash, envelope FROM cl_op').forEach(function (r) { var e = JSON.parse(r.envelope); if (e.body.op_type === 'CRUD_CREATE' && e.target.table === 'i_order') out.push({ v: L.verdict[r.op_hash] ? L.verdict[r.op_hash].verdict + ':' + L.verdict[r.op_hash].reason : 'none', sv: e.body.sv === undefined ? null : e.body.sv }); });
      var vers = Object.keys(L.verdict).filter(function (h) { return /^(retired-version|dep-refused|bogus-version)$/.test(L.verdict[h].reason); }).length; return { ops: out, versionRefused: vers, vs: await window.TeamSync.versionState() }; }); }
  };
  if (!LINES) { console.log('§FL_VERDICT INCONCLUSIVE — no ticket lines (FL_LINES) given'); process.exit(2); }
  var SHAPE_A = { CRUD_CREATE: 2 };

  if (!QUIET) console.log('§F0 two devices: A = processor (founder, role 102, shape 2), B = till (role 200001, shape 1)');
  var A = await device('A', SHAPE_A), B = await device('B', null), space = await T.found(A); await T.join(B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(A, 200001); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  var tidIO = await A.pg.evaluate(function () { return Number(window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='i_order'")[0].values[0][0]); });
  var rid = await T.create(A, 'ad_rule', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: 990206, accesslevel: '3', entitytype: 'U', eventtype: 'T', isactive: 'Y', name: 'POS ticket -> Import Orders', ruletype: 'S', value: 'twin:process:206?DocAction=CO' });
  var svid = await T.create(A, 'ad_table_scriptvalidator', { ad_client_id: 11, ad_org_id: 0, ad_rule_id: rid, ad_table_id: tidIO, eventmodelvalidator: 'TANR', isactive: 'Y', seqno: 10 });
  await T.visit(A); await T.visit(B);
  verdict('F0', (await T.enrolled(B)) && rid != null && svid != null, 'B is enrolled as the till; the processor holds the one rule row', 'enrolled=' + (await T.enrolled(B)) + ' rule=' + rid + ' sv=' + svid);

  if (!QUIET) console.log('§F1 the till enters ticket ' + KEY + ' OFFLINE, THEN the admin raises the floor, THEN the till arrives');
  var made = [];
  for (var li = 0; li < LINES.length; li++) made.push(await T.create(B, 'i_order', Object.assign({ documentno: KEY }, LINES[li])));       // authored on B, NOT sent: the admin has not seen it
  var raise = await A.pg.evaluate(async function () { var S = window.TeamSync.store(), pol = await S.policy(), p = pol ? JSON.parse(JSON.stringify(pol.params)) : {};
    p.epoch = (pol ? pol.epoch : 0) + 1; p.min_v = Object.assign({}, p.min_v || {}, { CRUD_CREATE: 2 }); if (!p.visit_ms) p.visit_ms = 900000;
    var op = await S.setPolicy(p), v = (await S.order()).verdict[op.hash], pf = (await S.policy()); return { verdict: v ? v.verdict + ':' + v.reason : 'none', from: op.env.body.params.from_seq }; });
  await T.visit(A); await T.visit(B); await T.visit(B); await T.visit(A);
  var f1 = await T.ticket(A), ioA1 = await T.rows(A, "SELECT count(*) AS n FROM i_order WHERE documentno='" + KEY + "'"), ordA1 = await T.rows(A, "SELECT count(*) AS n FROM c_order WHERE documentno='" + KEY + "'");
  var chip = await A.pg.evaluate(async function () { await window.TeamSync.render(); var w = document.getElementById('team-warn'); return w ? w.textContent : ''; });
  console.log('   §FL_A1 raise=' + JSON.stringify(raise) + ' ticketOps=' + JSON.stringify(f1.ops) + ' versionRefused=' + f1.versionRefused + ' vs=' + JSON.stringify(f1.vs) + ' io=' + ioA1[0].n + ' orders=' + ordA1[0].n);
  verdict('F1', made.length === LINES.length && /^MERGED/.test(raise.verdict) && raise.from && Object.keys(raise.from).length > 0, 'the till sealed ' + LINES.length + ' rows; the floor raise is MERGED and stamped with the admin\'s frontier', JSON.stringify(raise) + ' made=' + JSON.stringify(made));
  verdict('F1', f1.ops.length === LINES.length && f1.ops.every(function (o) { return o.v === 'PARKED:needs-translation' && o.sv === null; }), 'the ' + LINES.length + ' old-shape ticket ops are PARKED needs-translation on the processor (not refused)', JSON.stringify(f1.ops.map(function (o) { return o.v; })));
  verdict('F1', f1.versionRefused === 0, 'NONE is REFUSED retired-version / dep-refused / bogus-version (the ticket is not lost)', 'versionRefused=' + f1.versionRefused);
  verdict('F1', Number(ioA1[0].n) === 0 && Number(ordA1[0].n) === 0 && T.count(A, /§RULE_PROCESS ref=206 /) === 0, 'nothing is projected while parked: no I_Order row, no C_Order, Import Orders has not run', 'io=' + ioA1[0].n + ' orders=' + ordA1[0].n + ' runs=' + T.count(A, /§RULE_PROCESS ref=206 /));
  verdict('F1', f1.vs && f1.vs.provisional === true && f1.vs.parked_by_reason['needs-translation'] === LINES.length && /translation/.test(chip), 'the processor says so in words ("wait for a translation") and its versionState counts ' + LINES.length + ' needs-translation', 'chip=' + String(chip).slice(0, 110));

  if (!QUIET) console.log('§F2 the admin publishes the signed translation set; the processor Visits');
  var SET = await signObj({ kind: 'upcasters', op: 'CRUD_CREATE', steps: [{ from: 1, map: [{ at: 'fields', default: ['description', 'POS ticket (translated v1)'] }] }] }, owner);
  await A.pg.evaluate(function (s) { return window.TeamSync.publishUpcasters([s]); }, SET);
  var rin = await T.visit(A); await T.visit(A);
  var f2 = await T.ticket(A);
  var ordA = await T.rows(A, "SELECT c_order_id AS id, docstatus AS ds, (SELECT count(*) FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AS nl FROM c_order o WHERE documentno='" + KEY + "'");
  var ioA = await T.rows(A, "SELECT i_isimported AS imp, c_order_id AS oid, description AS d FROM i_order WHERE documentno='" + KEY + "'");
  console.log('   §FL_A2 replicaIn=' + JSON.stringify(rin) + ' ticketOps=' + JSON.stringify(f2.ops.map(function (o) { return o.v; })) + ' orders=' + JSON.stringify(ordA) + ' i_order=' + JSON.stringify(ioA));
  verdict('F2', f2.ops.length === LINES.length && f2.ops.every(function (o) { return /^MERGED/.test(o.v); }), 'once the translation is loaded the ' + LINES.length + ' ticket ops FOLD (MERGED)', JSON.stringify(f2.ops.map(function (o) { return o.v; })));
  verdict('F2', ioA.length === LINES.length && ioA.every(function (r) { return r.d === 'POS ticket (translated v1)'; }), 'they are projected in the TRANSLATED shape (the v2 default Description is on every I_Order row)', JSON.stringify(ioA.map(function (r) { return r.d; })));
  var runs = A.logs.filter(function (l) { return /§RULE_PROCESS ref=206 /.test(l); }), imp = runs.filter(function (l) { return /summary=#1\/3/.test(l); }).length;
  verdict('F2', runs.length === LINES.length && imp === 1, 'Import Orders runs once per received row and imports ONCE (#1/' + LINES.length + ')', 'runs=' + runs.length + ' imported=' + imp);
  verdict('F2', ordA.length === 1 && ordA[0].ds === 'CO' && Number(ordA[0].nl) === LINES.length && ioA.every(function (r) { return r.imp === 'Y' && r.oid != null; }), 'exactly ONE C_Order with the ticket key, DocStatus CO, ' + LINES.length + ' lines; the I_Order rows read I_IsImported=Y', JSON.stringify(ordA) + ' ' + JSON.stringify(ioA.map(function (r) { return r.imp; })));
  verdict('F3', f2.versionRefused === 0 && f2.vs.parked_count === 0 && f2.vs.provisional === false, '0 lost, 0 left waiting: no version-refused verdict, nothing parked, no longer provisional', JSON.stringify(f2.vs));
  verdict('F4', errors === 0, '0 page errors on both devices', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§FL_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§FL_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (process.env.FL_NO_MUT) { console.log('§FL_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors); process.exit(0); }
  var M = [
    ['a below-floor op is REFUSED retired-version again', '/common/comm/op_versions.js', "(why || v >= (appVs[t] || 1))) return { verdict: 'PARKED', reason: 'needs-translation' };", "(why || v >= (appVs[t] || 1))) return { verdict: 'REFUSED', reason: 'retired-version' };", ['F1']],
    ['the published translation set is never adopted by a waiting device', '/common/comm/team_versions.js', "if (!store || typeof store.policy !== 'function') return 0;", 'return 0;', ['F2', 'F3']],
    ['the translation is not applied to what the host receives', '/common/comm/comm_store.js', 'if (opts.versions) p = { hash: p.hash,', 'if (false) p = { hash: p.hash,', ['F2']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var orig = fs.readFileSync(path.join(ROOT, m[1].slice(1)), 'utf8');
    if (orig.split(m[2]).length !== 2) { muts.push({ name: m[0], error: 'MUTATION DID NOT APPLY (anchor not found exactly once)' }); continue; }
    var mutated = orig.replace(m[2], function () { return m[3]; }); if (mutated === orig) { muts.push({ name: m[0], error: 'MUTATION DID NOT CHANGE THE FILE' }); continue; }
    var tmp = path.join(os.tmpdir(), 'fl_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, mutated);
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { FL_ONLY_ARMS: '1', FL_MUT_FILE: tmp, FL_MUT_PATH: m[1] }) });
    fs.unlinkSync(tmp); var mm = /§FL_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[4], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String(kk.stderr || kk.stdout).split('\n').slice(-3).join(' ') });
  }
  console.log('\n§FL_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected one of ' + m.expect.join('/') + ')')); });
  console.log('§FL_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); }).length + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§FL_CRASH ' + (e && e.stack || e)); process.exit(2); });
