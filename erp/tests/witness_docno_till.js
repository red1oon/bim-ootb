#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCNO-TILL (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.10; CARDINAL TWIN RULE: the legacy MSequence mechanism, configured, no new code).
//   READ THE LOG after every run: every verdict is a §DT line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: DocumentNo = Org|Till|Sequence with ONE legacy sequence, Prefix "@AD_Org_ID.Value/K@-@C_POS_ID.Name/K@-" (MSequence.java:70 /K key, :603-612 sequence-no
//   level, DefaultEvaluatee.java:167-175/:268-301 reference operator), so every till runs its own gapless number and two stations working OFFLINE never draw the same DocumentNo.
//   D1 own series per till (interleaved) · D2 gapless 1..n per till · D3 another org's till starts its own · D4 two devices offline, own till each: no shared number
//   D5 CONTROL: the same two devices on the shipped plain sequence DO collide (else D4 is vacuous) · D6 an order with no till: measured, and not in any till's series
//   LEGACY arm: INCONCLUSIVE until scripts/bridge/out/docno_till_legacy.json exists (same config run on the pilot).
// §48.11b/§48.11c LOCAL NUMBERING (DocumentNo = OrgValue-UserValue-n, switched on with Team; erp/team_docno.js + the twin gaps G1-G4 + the fold rule docno-station):
//   D7 solo device: no overlay, the shipped number is unchanged · D8 Team overlay: every un-prefixed DocType sequence gets the format, the BASE manifest hash is unchanged
//   D9 order/invoice/shipment/payment each OrgValue-UserValue-n from the LOGIN context · D10 two devices, two users, offline: no shared number on any doc type
//   D11 CONTROL same user on two devices collides · D12 an admin's prefix is kept · D13 a user preference named like the variable does not change the number
//   D14 a received document with another station's prefix is REFUSED docno-station on every device (the honest one MERGED; an unbound author is not judged, counted)
//   D15 an admin's format edit changes the next number (as legacy), and at fold it is honoured once the edit is in the log (control: without it, refused)
// §48.11d station users get a Search Key (shipped patch = legacy MUser.setValue applied to every empty Value, erp/tools/user_value_rule.js):
//   D16 no seed user left without a Value (measured before/after) · D17 each patched Value = the legacy rule on its Name, GardenAdmin = the pilot's own value · D18 no two users of
//   one client share a Value · D19 the demo station (GardenAdmin) numbers OrgValue-gardenad-n, never Org--n · LEGACY arm: twin Value == pilot Value for every shared AD_User_ID
//   D20 LEGACY arm of LOCAL NUMBERING: scripts/bridge/docno_station_legacy.js ran the same format on the pilot through real WebServices logins (its own login rule sets
//   #AD_User_Value); the twin replays that config + login order and must give the SAME DocumentNo at every position and the same AD_Sequence_No keys/next values.
//   MUTANTS (--mutants): evalvar / logincv / overlay / judge — each served broken through a require hook that proves it applied; each must turn >= 1 row red (a crash is not a kill).
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), Module = require('module'), cp = require('child_process'), nodeCrypto = require('crypto');
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = nodeCrypto.webcrypto;
var MUT = { evalvar: ['model_trade.js', 'var lc = loginCtx(trx); if (lc)', 'var lc = null; if (lc)'],
  logincv: ['ad_callout.js', "Env.setContext(ctx, '#AD_User_Value', lu.v == null ? '' : lu.v);", ''],
  overlay: ['team_docno.js', 'if (isEmpty(r.prefix)) { run(', 'if (false) { run('],
  judge: ['team_docno.js', 'if (want.some(', 'if (true || want.some('] };
if (process.env.MUTATE) { var mu = MUT[process.env.MUTATE], js0 = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, fn) { if (mu && path.basename(fn) === mu[0] && fn.indexOf(path.join('erp', mu[0])) >= 0) { var src = fs.readFileSync(fn, 'utf8');
    if (src.indexOf(mu[1]) < 0) { console.log('§DT MUTANT-NOT-APPLIED ' + process.env.MUTATE); process.exit(3); } console.log('§DT MUTANT-APPLIED ' + process.env.MUTATE + ' in ' + mu[0]); return m._compile(src.replace(mu[1], mu[2]), fn); } return js0(m, fn); }; }
var ERP = path.join(__dirname, '..');
var TREE = path.join(__dirname, '..', '..'), initSqlJs;      // §50.3: SQLJS_DIR, the tree's own tests/ install, normal resolution; never a home-directory path
[process.env.SQLJS_DIR, path.join(TREE, 'tests', 'node_modules', 'sql.js'), 'sql.js'].filter(Boolean).some(function (c) { try { initSqlJs = require(c); return true; } catch (e) { return false; } });
if (!initSqlJs) { console.log('§DT_VERDICT INCONCLUSIVE sql.js is not installed: run `cd ' + TREE + '/tests && npm install` (or set SQLJS_DIR) — §50.3: no home-directory fallback'); process.exit(2); }
// §50.3: BIMCompiler (the legacy oracle files are tracked there): BIM_COMPILER_ROOT (the terms runner sets it), else a sibling of this tree; never homedir()
var BC = process.env.BIM_COMPILER_ROOT || ['BIMCompiler', 'bim-compiler'].map(function (n) { return path.join(TREE, '..', n); }).filter(function (d) { return fs.existsSync(path.join(d, 'scripts', 'bridge')); })[0] || path.join(TREE, '..', 'BIMCompiler');
var judged = 0, fails = 0, inconc = 0, log = function (s) { console.log(s); };
function ck(id, issue, ok, d) { judged++; if (!ok) fails++; log('§DT ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + issue + (d ? ' :: ' + d : '')); }
var PREFIX = '@AD_Org_ID.Value/K@-@C_POS_ID.Name/K@-', SEQ = 9300001, POS = { T1: 9300101, T2: 9300102, N1: 9300103 }, ORG2 = 50002;

async function device(SQL, label) {        // one device = its own copy of the shipped state (ad_seed.db + the self-heal patch), offline
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  db.run("INSERT INTO ad_sequence (ad_sequence_id,ad_client_id,ad_org_id,isactive,name,isautosequence,incrementno,startno,currentnext,currentnextsys,istableid,prefix,startnewyear,decimalpattern,startnewmonth,isorglevelsequence) VALUES (?,11,0,'Y','DocNo Org|Till','Y',1,1,1,100,'N',?,'N','000000','N','N')", [SEQ, PREFIX]);
  [['T1', 11], ['T2', 11], ['N1', ORG2]].forEach(function (p) { db.run("INSERT INTO c_pos (c_pos_id,ad_client_id,ad_org_id,isactive,name) VALUES (?,11,?,'Y',?)", [POS[p[0]], p[1], p[0]]); });
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; }));
    while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var ML = require(path.join(ERP, 'model_layer.js')), MT = require(path.join(ERP, 'model_trade.js')), says = [];
  function apply(ops) { ops.forEach(function (o) {
    if (o.op_type === 'CRUD_UPDATE') { var kk = Object.keys(o.changes); db.run('UPDATE ' + o.table + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || o.table + '_id') + '=?', kk.map(function (k) { return o.changes[k].new; }).concat([o.id])); }
    else if (o.op_type === 'CRUD_CREATE') { var f = o.fields, ks = Object.keys(f); db.run('INSERT INTO ' + o.table + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; })); } }); }
  function draw(seqId, po) {                                   // MSequence.getDocumentNoFromSeq, one Trx per save; its writes (AD_Sequence_No / AD_Sequence) committed
    var trx = new ML.Trx(q, { client: 11, org: po.ad_org_id, user: 100, role: 102, date: '2026-10-31', now: '2026-10-31 09:00:00', nowMillis: Date.now(), uuid: function () { return require('crypto').randomUUID(); } });
    var dn = MT.getDocumentNoFromSeq(trx, trx.get('ad_sequence', seqId), po);
    (trx.lines || trx.log || []).forEach(function (l) { if (/§MODEL-SEQ/.test(l)) says.push(String(l)); });
    apply(trx.ops.filter(Boolean)); return dn; }
  var AC = require(path.join(ERP, 'ad_callout.js')), ctxs = {};
  function login(user, org) { var k = user + '|' + org; if (!ctxs[k]) { AC.bind(q); ctxs[k] = AC.loginContext({ client: 11, org: org, role: 102, user: user }); } return ctxs[k]; }
  function drawDT(dtId, po, user) {                           // the shipped path: MSequence.getDocumentNo(C_DocType_ID) with the LOGIN context (Env.getCtx) of `user`
    var trx = new ML.Trx(q, { client: 11, org: po.ad_org_id, user: user, role: 102, ctx: login(user, po.ad_org_id), date: '2026-10-31', now: '2026-10-31 09:00:00', nowMillis: Date.now(), uuid: function () { return nodeCrypto.randomUUID(); } });
    var dn = MT.getDocumentNoByDocType(trx, dtId, false, po); apply(trx.ops.filter(Boolean)); return dn; }
  return { label: label, draw: draw, drawDT: drawDT, q: q, db: db, login: login, says: says, plainSeq: q("SELECT docnosequence_id AS s FROM c_doctype WHERE c_doctype_id=132")[0].s };
}
function series(nums, pre) { return nums.filter(function (n) { return n.indexOf(pre) === 0; }).map(function (n) { return Number(n.slice(pre.length)); }); }
function gapless(a) { return a.length > 0 && a.every(function (n, i) { return n === i + 1; }); }

// ── §48.11b LOCAL NUMBERING arms ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
var DOCS = { order: 132, invoice: 116, shipment: 120, payment: 119 }, JOE = 103, GU = 102;   // shipped doc types (Standard Order, AR Invoice, MM Shipment, AR Receipt); two shipped users with a Value
function baseManifest() { var h = nodeCrypto.createHash('sha256'); h.update(fs.readFileSync(path.join(ERP, 'ad_seed.db'))); h.update(fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'))); return h.digest('hex'); }
function TD() { return require(path.join(ERP, 'team_docno.js')); }
function overlay(D) { return TD().ensure(D.q, function (sql, a) { D.db.run(sql, a || []); }, log); }
async function localNumbering(SQL) {
  var uv = {}; [JOE, GU].forEach(function (u) { uv[u] = null; });
  // D7 solo: no overlay -> the shipped plain number, and no shipped sequence carries the format
  var S0 = await device(SQL, 'S0'), solo = S0.drawDT(DOCS.order, { ad_org_id: 11 }, JOE), fmt0 = S0.q('SELECT count(*) AS n FROM ad_sequence WHERE prefix=?', [TD().FORMAT])[0].n;
  [JOE, GU].forEach(function (u) { uv[u] = S0.q('SELECT value AS v FROM ad_user WHERE ad_user_id=?', [u])[0].v; });
  ck('D7', 'solo device (no Team, no overlay): the shipped number is unchanged and no shipped sequence carries the format (the switch is Team only)', solo === '50000' && fmt0 === 0, 'number=' + solo + ' sequences with format=' + fmt0);
  // D8 Team overlay: applied to every un-prefixed DocType sequence, kept the prefixed, base inputs byte-identical
  var h0 = baseManifest(), T = await device(SQL, 'T'), tg = T.q(TD().TARGETS, []), empty = tg.filter(function (r) { return r.prefix == null || r.prefix === ''; }).length;
  var r8 = overlay(T), after = T.q(TD().TARGETS, []), noPrefix = after.filter(function (r) { return r.prefix == null || r.prefix === ''; }).length, h1 = baseManifest();
  ck('D8', 'Team overlay: every un-prefixed DocType sequence gets the format, the prefixed are kept, the BASE manifest (seed bytes + patch text) is byte-identical', r8.applied === empty && r8.applied > 0 && r8.kept === tg.length - empty && noPrefix === 0 && h0 === h1,
    'targets=' + tg.length + ' applied=' + r8.applied + ' kept=' + r8.kept + ' left-unprefixed=' + noPrefix + ' base ' + h0.slice(0, 12) + '->' + h1.slice(0, 12));
  var r8b = overlay(T); ck('D8b', 'the overlay is idempotent (a second boot applies nothing)', r8b.applied === 0, 'applied=' + r8b.applied + ' kept=' + r8b.kept);
  var vl = T.q("SELECT count(*) AS n FROM ad_user WHERE ad_client_id=11 AND isactive='Y' AND (value IS NULL OR value='')", [])[0].n;
  log('§DT-VALUELESS active users of client 11 with no Search Key (Value) = ' + vl + ' — each would draw OrgValue--n and collide with another valueless user (a station user needs a Value)');
  // D9 order / invoice / shipment / payment, each OrgValue-UserValue-n from the login context
  var pre = 'HQ-' + uv[JOE] + '-', d9 = {}; Object.keys(DOCS).forEach(function (k) { d9[k] = T.drawDT(DOCS[k], { ad_org_id: 11 }, JOE); });
  log('§DT-STATION device=T user=' + uv[JOE] + ' ' + JSON.stringify(d9));
  ck('D9', 'order, invoice, shipment, payment are each numbered OrgValue-UserValue-n from the LOGIN context (#AD_User_Value, G1-G4)', Object.keys(DOCS).every(function (k) { return d9[k] && d9[k].indexOf(pre) === 0 && /^\d+$/.test(d9[k].slice(pre.length)); }), JSON.stringify(d9));
  // D10 two devices, two users, offline; D11 CONTROL same user on two devices
  async function pair(u1, u2) { var X = await device(SQL, 'X'), Y = await device(SQL, 'Y'); overlay(X); overlay(Y); var a = [], b = [];
    for (var i = 0; i < 3; i++) Object.keys(DOCS).forEach(function (k) { a.push(X.drawDT(DOCS[k], { ad_org_id: 11 }, u1)); b.push(Y.drawDT(DOCS[k], { ad_org_id: 11 }, u2)); });
    return { a: a, b: b, shared: a.filter(function (n) { return b.indexOf(n) >= 0; }) }; }
  var p10 = await pair(JOE, GU); log('§DT-OFFLINE2 X(' + uv[JOE] + ')=' + p10.a.join(',') + ' Y(' + uv[GU] + ')=' + p10.b.join(','));
  ck('D10', 'two devices, two users, OFFLINE from the same shipped state: no shared number on any of the 4 doc types', p10.a.length === 12 && p10.shared.length === 0 && p10.a.every(Boolean), 'shared=' + JSON.stringify(p10.shared));
  var p11 = await pair(JOE, JOE); log('§DT-CONTROL2 same user on X and Y: X=' + p11.a.slice(0, 4).join(',') + ' Y=' + p11.b.slice(0, 4).join(','));
  ck('D11', 'CONTROL: the SAME user on two devices shares one series and collides (one user per station is the rule; else D10 is vacuous)', p11.shared.length === 12, 'shared=' + p11.shared.length + '/12');
  // D12 the admin's own prefix kept (shipped: Quotation seq 383 has one)
  var q383 = T.q('SELECT prefix AS p FROM ad_sequence WHERE ad_sequence_id=383', [])[0].p;
  ck('D12', "an admin's own prefix is kept by the overlay (shipped Quotation sequence 383)", q383 === '@AD_Org_ID<AD_Org.Value>@-', 'prefix=' + q383);
  // D13 a user preference named like the variable does not change the number
  var P = await device(SQL, 'P'); overlay(P);
  P.db.run("INSERT INTO ad_preference (ad_preference_id,ad_client_id,ad_org_id,isactive,ad_user_id,attribute,value,preferencefor) VALUES (9399001,11,0,'Y',?,'AD_User_Value','HIJACK','W')", [JOE]);
  P.db.run("INSERT INTO ad_preference (ad_preference_id,ad_client_id,ad_org_id,isactive,ad_user_id,attribute,value,preferencefor) VALUES (9399002,11,0,'Y',?,'#AD_User_Value','HIJACK','W')", [JOE]);
  var c13 = P.login(JOE, 11), n13 = P.drawDT(DOCS.order, { ad_org_id: 11 }, JOE);
  ck('D13', 'a user preference named AD_User_Value (or #AD_User_Value) does not change the number: the station comes from the login, not a user-editable preference', n13 && n13.indexOf(pre) === 0 && n13.indexOf('HIJACK') < 0 && c13.getProperty('P|AD_User_Value') === 'HIJACK',
    'number=' + n13 + ' ctx P|AD_User_Value=' + c13.getProperty('P|AD_User_Value'));
  // D14 + D15 at fold: the REAL comm engine, three devices, the judge over a pristine base copy
  await foldArms(SQL, uv);
  // D15 drawing: an admin edits the format in AD_Sequence -> the next number follows it (as legacy)
  var E = await device(SQL, 'E'); overlay(E); var seqO = E.q('SELECT docnosequence_id AS s FROM c_doctype WHERE c_doctype_id=?', [DOCS.order])[0].s;
  E.db.run('UPDATE ad_sequence SET prefix=? WHERE ad_sequence_id=?', ['@AD_Org_ID.Value/K@/@#AD_User_Value/K@/', seqO]); var n15 = E.drawDT(DOCS.order, { ad_org_id: 11 }, JOE);
  ck('D15', "an admin's edit of the format in the Document Sequence window changes the next number (as legacy)", n15 === 'HQ/' + uv[JOE] + '/50000', 'number=' + n15);
}
async function userValues(SQL) {
  var R = require(path.join(ERP, 'tools', 'user_value_rule.js')), raw = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var emptyRaw = raw.exec("SELECT ad_user_id, name, ldapuser FROM ad_user WHERE value IS NULL OR value=''")[0]; emptyRaw = emptyRaw ? emptyRaw.values : [];
  var U = await device(SQL, 'U'), left = U.q("SELECT count(*) AS n FROM ad_user WHERE value IS NULL OR value=''", [])[0].n;
  ck('D16', 'after the shipped patch no user is left without a Search Key (before: ' + emptyRaw.length + ' in the seed file)', emptyRaw.length > 0 && left === 0, 'before=' + emptyRaw.length + ' after=' + left);
  var bad = emptyRaw.filter(function (x) { var v = U.q('SELECT value AS v FROM ad_user WHERE ad_user_id=?', [x[0]])[0].v; return v !== R.rule(x[1], x[2]); });
  var ga = U.q('SELECT value AS v FROM ad_user WHERE ad_user_id=101', [])[0].v;
  ck('D17', "every patched Value is legacy MUser.setValue's own result on that user's Name (not typed), and GardenAdmin = gardenad (the value legacy's pilot already carries)", bad.length === 0 && ga === 'gardenad', 'mismatch=' + JSON.stringify(bad.map(function (x) { return x[0]; })) + ' GardenAdmin=' + ga);
  var dup = U.q("SELECT ad_client_id AS c, value AS v, count(*) AS n FROM ad_user WHERE isactive='Y' GROUP BY ad_client_id, value HAVING count(*) > 1", []);
  ck('D18', 'no two active users of one client share a Search Key in the shipped data (else two stations would share one series)', dup.length === 0, 'shared=' + JSON.stringify(dup));
  overlay(U); var n19 = U.drawDT(DOCS.order, { ad_org_id: 11 }, 101);
  ck('D19', 'the demo station (GardenAdmin) numbers HQ-gardenad-n, never HQ--n (the live defect seen in W-TEAM-SO, §48.11c)', n19 === 'HQ-gardenad-50000', 'number=' + n19);
  // LEGACY arm: the pilot (docker postgres, idempiere_pilot) — the same AD_User_ID must carry the same Value on both sides
  var pr = cp.spawnSync('psql', ['-h', 'localhost', '-U', 'postgres', '-d', 'idempiere_pilot', '-AtF', '|', '-c', 'SELECT ad_user_id, coalesce(value,\'\') FROM adempiere.ad_user ORDER BY 1'], { env: Object.assign({}, process.env, { PGPASSWORD: process.env.PGPASSWORD || 'postgres' }), encoding: 'utf8', timeout: 20000 });
  if (pr.status !== 0) { inconc++; log('§DT INCONCLUSIVE LEGACY-USER-VALUE - pilot not reachable (' + String(pr.stderr || pr.error || '').trim().slice(0, 120) + ')'); return; }
  var pv = {}; pr.stdout.trim().split('\n').forEach(function (l) { var a = l.split('|'); pv[a[0]] = a[1]; });
  var both = U.q('SELECT ad_user_id AS id, value AS v FROM ad_user', []).filter(function (r) { return pv[String(r.id)] !== undefined; }), diff = both.filter(function (r) { return pv[String(r.id)] !== r.v; });
  log('§DT-LEGACY-USER-VALUE pilot users=' + Object.keys(pv).length + ' shared ids=' + both.length + ' ' + both.map(function (r) { return r.id + '=' + r.v + (pv[String(r.id)] !== r.v ? '≠' + pv[String(r.id)] : ''); }).join(' '));
  ck('D17L', 'LEGACY: every AD_User_ID present on both sides carries the same Search Key on the twin and on the pilot', both.length > 0 && diff.length === 0, 'shared=' + both.length + ' differ=' + JSON.stringify(diff.map(function (r) { return r.id; })));
}
async function legacyStation(SQL) {
  var LJ = path.join(BC, 'scripts/bridge/out/docno_station_legacy.json');
  if (!fs.existsSync(LJ)) { inconc++; log('§DT INCONCLUSIVE D20 - no oracle file ' + LJ + ' (run scripts/bridge/docno_station_legacy.js on the pilot)'); return; }
  var L = JSON.parse(fs.readFileSync(LJ, 'utf8')), X = await device(SQL, 'LEG'), SEQ2 = 9300201, DT2 = 9300202;
  X.db.run("INSERT INTO ad_sequence (ad_sequence_id,ad_client_id,ad_org_id,isactive,name,isautosequence,incrementno,startno,currentnext,currentnextsys,istableid,prefix,startnewyear,decimalpattern,startnewmonth,isorglevelsequence) VALUES (?,11,0,'Y','DTLN replay','Y',1,?,?,100,'N',?,'N',NULL,'N','N')", [SEQ2, L.start, L.start, L.format]);
  X.db.run('CREATE TEMP TABLE t AS SELECT * FROM c_doctype WHERE c_doctype_id=132'); X.db.run("UPDATE t SET c_doctype_id=?, name='DTLN replay', docnosequence_id=?, isdefault='N'", [DT2, SEQ2]); X.db.run('INSERT INTO c_doctype SELECT * FROM t');
  var twin = L.numbers.map(function (n) { return X.drawDT(DT2, { ad_org_id: 11 }, n.createdby); }), leg = L.numbers.map(function (n) { return n.documentno; });
  var keys = X.q('SELECT sequencekey AS k, currentnext AS c FROM ad_sequence_no WHERE ad_sequence_id=? ORDER BY 1', [SEQ2]).map(function (r) { return r.k + '=' + r.c; }), lkeys = (L.keys || []).map(function (r) { return r.key + '=' + r.currentnext; });
  log('§DT-LEGACY-STATION plan=' + L.plan.join(',') + ' legacy=' + leg.join(',') + ' twin=' + twin.join(',') + ' | keys legacy=' + lkeys.join(',') + ' twin=' + keys.join(','));
  ck('D20', 'LEGACY: the pilot (real WS logins, its own login rule) and the twin number the same format the same way: equal DocumentNo at every position, equal AD_Sequence_No keys and next values',
    leg.length > 0 && JSON.stringify(leg) === JSON.stringify(twin) && JSON.stringify(lkeys) === JSON.stringify(keys), 'positions=' + leg.length + ' keys=' + keys.length);
}
async function foldArms(SQL, uv) {
  var CD = path.join(ERP, '..', 'common', 'comm'); ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe'].forEach(function (n) { delete globalThis[n]; });
  var STORE = require(path.join(CD, 'comm_store.js')), PIPE = require(path.join(CD, 'comm_pipe.js'));
  var B = await device(SQL, 'BASE'), baseQ = function (sql, a) { return B.q(sql, a); };     // pristine: seed + patches, NO overlay (the judge applies it in memory)
  var users = {}; B.q('SELECT ad_user_id AS id, ad_user_uu AS uu FROM ad_user WHERE ad_user_id IN (?,?)', [JOE, GU]).forEach(function (r) { users[r.id] = r.uu; });
  var unj = {};
  var docno = async function (o) { var r = await TD().judge(Object.assign({}, o, { baseQ: baseQ })); if (r && r.unjudged) unj[r.unjudged] = (unj[r.unjudged] || 0) + 1; return r; };
  var dev = {}, per = { F: nodeCrypto.randomUUID(), S: users[JOE], T: users[GU] }, St = {}, names = ['F', 'S', 'T'];   // F = founder (person NOT bound to a user); S, T bound to their AD_User_UU (§38.15)
  for (var n of names) { dev[n] = await STORE.newDevice(); dev[n].person_uu = per[n]; }
  // a space WITH a base, as every ERP team space is (team_sync spaceOpts): base rows (the sequence the admin edits) are judged by their base scope (opts.baseRow, §13.12.I.1)
  var bi = await STORE.baseFromBytes('ad_seed.db', new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var baseRow = function (t, uu) { if (!/^[a-z][a-z0-9_]*$/.test(t)) return null; var r = B.q('SELECT ad_client_id AS c, ad_org_id AS o FROM "' + t + '" WHERE lower("' + t + '_uu")=?', [String(uu).toLowerCase()])[0]; return r ? { client: r.c, org: r.o } : null; };
  var sp = await STORE.newSpace('dn', dev.F, per.F, 'F', 102, { base: bi });
  names.forEach(function (k) { St[k] = STORE.open(new SQL.Database(), { SQL: SQL, space: sp.space, self: dev[k], access: function () { return { allowed: true }; }, docno: docno, baseRow: baseRow, log: function (m) { if (/§TEAM_DOCNO/.test(m)) log('     [' + k + '] ' + m); } }); });
  await St.F.genesis(sp.params);
  for (var m of ['S', 'T']) { await St.F.addPerson({ person_uu: per[m], name: m, ad_role_id: 102, comm_admin: false }); await St.F.enroll(dev[m].kid, dev[m].pubJwk, per[m], dev[m].dhPubJwk); }
  var pipe = PIPE.memPipe('dn-' + nodeCrypto.randomUUID()), sync = async function () { for (var r = 0; r < 3; r++) for (var k of names) await St[k].sync(pipe); };
  await sync();
  async function make(s, dn, extra) { var uu = nodeCrypto.randomUUID(); var o = await s.author({ target: { table: 'c_order', uu: uu }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: Object.assign({ documentno: dn, c_doctypetarget_id: DOCS.order, ad_client_id: 11, ad_org_id: 11 }, extra || {}) } } }); return o.hash; }
  async function all(h) { await sync(); var o = []; for (var k of names) { var L = await St[k].order(), v = L.verdict[h]; o.push(v ? v.verdict + ':' + (v.reason || '') : 'none'); } return o; }
  var honest = await make(St.T, 'HQ-' + uv[GU] + '-50000'), forged = await make(St.T, 'HQ-' + uv[JOE] + '-50000'), typed = await make(St.T, '12345'), byF = await make(St.F, 'HQ-' + uv[GU] + '-50001');
  var vh = await all(honest), vf = await all(forged), vt = await all(typed), vF = await all(byF);
  log('§DT-FOLD honest=' + vh.join(' ') + ' | forged=' + vf.join(' ') + ' | typed=' + vt.join(' ') + ' | unbound-founder=' + vF.join(' ') + ' | unjudged=' + JSON.stringify(unj));
  ck('D14', "a received document carrying ANOTHER station's prefix (or a hand-typed number) is REFUSED docno-station on every device; the station's own number is MERGED",
    vh.every(function (v) { return /^MERGED/.test(v); }) && vf.every(function (v) { return v === 'REFUSED:docno-station'; }) && vt.every(function (v) { return v === 'REFUSED:docno-station'; }), 'honest=' + vh[0] + ' forged=' + vf[0] + ' typed=' + vt[0]);
  ck('D14b', 'an author whose person is not bound to an AD_User is NOT judged (merged, counted unbound) — stated, never guessed', vF.every(function (v) { return /^MERGED/.test(v); }) && (unj.unbound || 0) > 0, 'founder=' + vF[0] + ' unbound=' + (unj.unbound || 0));
  // D15 at fold: a number in an admin's NEW format is refused until the format edit is in the log, then merged (the edit is an ad_sequence op; base uu from the pristine copy)
  var seqUu = B.q('SELECT s.ad_sequence_uu AS u FROM ad_sequence s JOIN c_doctype d ON d.docnosequence_id=s.ad_sequence_id WHERE d.c_doctype_id=?', [DOCS.order])[0].u;
  var newFmt = await make(St.T, 'HQ/' + uv[GU] + '/50001'), before = await all(newFmt);
  var fo = await St.F.author({ target: { table: 'ad_sequence', uu: seqUu }, intent: 'K2', body: { op_type: 'CRUD_UPDATE', params: { changes: { prefix: '@AD_Org_ID.Value/K@/@#AD_User_Value/K@/' } } } });
  var vfo = await all(fo.hash); log('§DT-FOLD-FORMAT the admin\'s format edit (ad_sequence ' + String(seqUu).slice(0, 8) + ') verdicts=' + vfo.join(' '));
  var afterV = await all(newFmt), forged2 = await make(St.T, 'HQ/' + uv[JOE] + '/50002'), vf2 = await all(forged2);
  log('§DT-FOLD-FORMAT new-format number before the edit arrived=' + before.join(' ') + ' after=' + afterV.join(' ') + ' | forged in the new format=' + vf2.join(' '));
  ck('D15b', "at fold an admin's format edit is honoured once it is in the log (CONTROL: before it, the same number is refused); a forged number in the new format is still refused",
    before.every(function (v) { return v === 'REFUSED:docno-station'; }) && afterV.every(function (v) { return /^MERGED/.test(v); }) && vf2.every(function (v) { return v === 'REFUSED:docno-station'; }), 'before=' + before[0] + ' after=' + afterV[0] + ' forged=' + vf2[0]);
}

if (process.argv.indexOf('--mutants') >= 0) {                    // each mutant is a child run; a kill = exit 1 with the mutant proven applied and no crash
  var kills = 0, ks = Object.keys(MUT); ks.forEach(function (k) {
    var r = cp.spawnSync('node', [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 }), out = (r.stdout || '') + (r.stderr || '');
    var applied = out.indexOf('§DT MUTANT-APPLIED ' + k) >= 0, crash = /§DT_VERDICT FAIL crash/.test(out), red = (out.match(/§DT FAIL D\w+/g) || []).map(function (x) { return x.split(' ')[2]; });
    var kill = r.status === 1 && applied && !crash && red.length > 0; if (kill) kills++;
    log('§DT-MUTANT ' + k + ' ' + (kill ? 'KILLED' : 'SURVIVED') + ' exit=' + r.status + ' applied=' + applied + ' crash=' + crash + ' red=' + red.join(','));
  });
  log('§DT_MUTANTS killed=' + kills + '/' + ks.length); process.exit(kills === ks.length ? 0 : 1);
}
(async function () {
  var SQL = await initSqlJs(), A = await device(SQL, 'A');
  // D1/D2/D3: one device, interleaved saves T1,T2,T1,T1,T2,N1
  var plan = [['T1', 11], ['T2', 11], ['T1', 11], ['T1', 11], ['T2', 11], ['N1', ORG2]], got = plan.map(function (p) { return A.draw(SEQ, { ad_org_id: p[1], c_pos_id: POS[p[0]] }); });
  log('§DT-NUMBERS device=A ' + plan.map(function (p, i) { return p[0] + '=' + got[i]; }).join(' '));
  var t1 = series(got, 'HQ-T1-'), t2 = series(got, 'HQ-T2-'), n1 = series(got, 'Store North-N1-');
  ck('D1', 'two tills in one org each run their own series over interleaved saves (prefix Org-Till-)', t1.length === 3 && t2.length === 2, 'T1=' + JSON.stringify(t1) + ' T2=' + JSON.stringify(t2));
  ck('D2', 'each till series is gapless 1..n', gapless(t1) && gapless(t2), 'T1=' + t1 + ' T2=' + t2);
  ck('D3', "another org's till starts its own series (the org value is part of the key)", n1.length === 1 && n1[0] === 1, 'N1=' + JSON.stringify(n1) + ' got=' + got[5]);
  // D4: two devices from the SAME shipped state, offline, each its own till, same customer, 5 orders each
  var B1 = await device(SQL, 'B1'), B2 = await device(SQL, 'B2'), d1 = [], d2 = [];
  for (var i = 0; i < 5; i++) { d1.push(B1.draw(SEQ, { ad_org_id: 11, c_pos_id: POS.T1 })); d2.push(B2.draw(SEQ, { ad_org_id: 11, c_pos_id: POS.T2 })); }
  var shared = d1.filter(function (n) { return d2.indexOf(n) >= 0; });
  log('§DT-OFFLINE device B1(T1)=' + d1.join(',') + ' device B2(T2)=' + d2.join(','));
  ck('D4', 'two devices numbering OFFLINE from the same shipped state, each for its own till, share no DocumentNo (the legacy unique (DocumentNo,C_DocType_ID,C_BPartner_ID) cannot fire)', d1.length === 5 && d2.length === 5 && shared.length === 0, 'shared=' + JSON.stringify(shared));
  // D5 CONTROL: the shipped plain sequence (Standard Order's DocNoSequence) on two devices
  var C1 = await device(SQL, 'C1'), C2 = await device(SQL, 'C2'), c1 = [], c2 = [];
  for (var j = 0; j < 3; j++) { c1.push(C1.draw(C1.plainSeq, { ad_org_id: 11, c_pos_id: POS.T1 })); c2.push(C2.draw(C2.plainSeq, { ad_org_id: 11, c_pos_id: POS.T2 })); }
  var clash = c1.filter(function (n) { return c2.indexOf(n) >= 0; });
  log('§DT-CONTROL plain seq=' + C1.plainSeq + ' device C1=' + c1.join(',') + ' device C2=' + c2.join(','));
  ck('D5', 'CONTROL: the same two devices on the shipped plain sequence DO draw the same numbers (the defect D4 removes is real)', clash.length === 3, 'clash=' + JSON.stringify(clash));
  // D6: an order with no till
  var none = A.draw(SEQ, { ad_org_id: 11, c_pos_id: null });
  log('§DT-NOTILL org=HQ c_pos_id=null DocumentNo=' + none);
  ck('D6', 'an order with no till gets a number outside every till series (measured: ' + none + ')', none && !/^HQ-T[12]-/.test(none) && !/^Store North-/.test(none), none);
  log('§DT-SEQLOG ' + (A.says.slice(0, 2).join(' | ') || '(no §MODEL-SEQ lines captured)'));
  await localNumbering(SQL);
  await userValues(SQL);
  await legacyStation(SQL);
  var LJ = path.join(BC, 'scripts/bridge/out/docno_till_legacy.json');
  if (!fs.existsSync(LJ)) { inconc++; log('§DT INCONCLUSIVE LEGACY - no oracle file ' + LJ + ' (run the same config on the pilot; until then the twin numbers are not legacy-compared)'); }
  // §51.3 C4: the limits this witness does NOT judge, stated where the code is tested (the terms runner copies them into the record)
  log('§LIMIT an author not bound to an AD_User is not judged at fold (counted)');
  log('§LIMIT two users sharing a Search Key share a series');
  log('§DT_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconc + (inconc ? ' (legacy arm)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§DT_VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(1); });
