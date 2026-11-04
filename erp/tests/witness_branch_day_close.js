#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DAYCLOSE / W-DAYCLOSE-STOP / W-AUDIT-GATE (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §21; TWIN CARDINAL RULE: the close runs the LEGACY processes, it invents no business rule). READ THE LOG after every run:
//   every verdict is a §DAYCLOSE-VERDICT line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. An empty population prints INCONCLUSIVE, never PASS. Logs: /tmp/dayclose_logs/.
// THE ISSUES it proves or disproves (spec §21.3):
//   BOOKS    the one-click Branch Day Close and the separate legacy step runs (Import POS Sales per branch, Replenish Report, its create) over the SAME deposits give IDENTICAL books and stock (row-set diff 0 on fact_acct,
//            m_storageonhand, m_movement, c_order, c_invoice, c_payment + lines, shipments, allocations; T_Replenish is a work table keyed on the run's AD_PInstance and is not compared). The fixture is built so a close that read the stock BEFORE its own sales shipped would order differently.
//   STOP     a failing step stops the close, earlier steps stay as legacy leaves them, the message names the step and the branch (3: create fails; 1: a ticket the import refuses).
//   GATE     a till/day with a ticket-number gap or an unbalanced ticket is NOT imported and is named; clean tills and branches still close.
//   RERUN    a second close makes no new row (I_IsImported).     STOPPLUG  Stop removes every staged row, the class, and the base hash is unchanged.     FALLBACK  without the POS plugin: Import Orders + Import Payment.
//   GS       gestures G and screens S before/after, MODEL-DERIVED from the dictionary (menu path clicks + parameters set + OK; one dialog per run) per ERP_FRIENDLY_OPS_LENS.md §2 - labelled as a model, not a browser recording.
// Run: node erp/tests/witness_branch_day_close.js            (parent: spawns the arms, judges, then the mutants when DC_MUTANTS=1)   child: DC_ARM=one|steps|gate|stop3|stop1|fb_one|fb_steps|fb_gap
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), LOGS = process.env.DC_LOGS || '/tmp/dayclose_logs', ARM = process.env.DC_ARM || '', TAG = process.env.DC_TAG || '';
var PLUGIN = process.env.DC_PLUGIN || path.join(ERP, 'plugins', 'friendly_ops.mjs');
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
fs.mkdirSync(LOGS, { recursive: true });
var DAY = '2026-10-28', D1 = DAY + ' 00:00:00', BANK = 100, NORTH = 50002, SOUTH = 50004, WH = { 50002: 50003, 50004: 50004 }, PID_DC = 53405, DOCTYPE_POO = 126, DOCTYPE_MMM = 143;
function J(x) { return JSON.stringify(x); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var TABLES = ['fact_acct', 'm_storageonhand', 'm_movement', 'm_movementline', 'c_order', 'c_orderline', 'c_invoice', 'c_invoiceline', 'c_payment', 'c_allocationhdr', 'c_allocationline', 'm_inout', 'm_inoutline', 'm_transaction', 'i_order', 'i_payment'];
var NAMED = ['fact_acct', 'm_storageonhand', 'm_movement', 'c_order', 'c_invoice', 'c_payment'];
var DROP = /^(created|updated|createdby|updatedby|.*_uu|ad_pinstance_id|processedon)$/;

// ═════════════════════════════════════════ CHILD: one arm, one fresh kernel ═════════════════════════════════════════
async function child() {
  var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
  console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
  var say = function (s) { _log(s); }, out = { arm: ARM, tag: TAG, checks: [] };
  function check(cs, key, rule, ok, info) { out.checks.push({ cs: cs, key: key, ok: !!ok }); say('  §DAYCLOSE-CHECK arm=' + ARM + ' case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db.run(st); } catch (e) { /* the loader's own tolerance */ } } });
  function q0(sql, params) { var st = db.prepare(sql), o = []; try { if (params && params.length) st.bind(params); while (st.step()) { var r = st.getAsObject(), l = {}; for (var k in r) l[k.toLowerCase()] = r[k]; o.push(l); } } finally { st.free(); } return o; }
  require(path.join(ERP, 'ad_import_tables.js')).ensure(db); require(path.join(ERP, 'ad_rule.js')).ensure(db);
  global.ERPEngine = require(path.join(ERP, 'erp_engine.js')); var TC = require(path.join(ERP, 'till_core.js'));
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:day-close' };
  var one = function (sql, p) { return k.q(sql, p || [])[0] || null; };
  function commit(fn, meta) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  var saveAll = function (rows) { return function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, rows[i].t, null, ML.newPO(trx, rows[i].t, rows[i].f)); if (!sv.ok) return { ok: false, error: rows[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; };
  var runProc = function (id, params, tag) { var r = commit(function (trx) { var r0 = AP.runInTrx(trx, id, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'day_close', tag: tag || '' }); (r.log || []).forEach(function (l) { if (/^§(DAYCLOSE|POSS-TICKET|POSS )/.test(l)) say('  ' + l); }); return r; };

  // ── fixture: two branch stores, stock one below the minimum's reach BEFORE the sales and under it AFTER ──
  [[WH[NORTH], 123], [WH[NORTH], 130], [WH[SOUTH], 123], [WH[SOUTH], 130]].forEach(function (x) {
    var loc = q0('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=? AND isdefault=?', [x[0], 'Y'])[0].l;
    db.run("DELETE FROM m_storageonhand WHERE m_product_id=? AND m_locator_id=?", [x[1], loc]);
    db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, created, createdby, isactive, m_attributesetinstance_id, m_locator_id, m_product_id, qtyonhand, updated, updatedby, m_storageonhand_uu, datematerialpolicy) VALUES (11, 0, '2026-10-01 00:00:00', 100, 'Y', 0, ?, ?, 9, '2026-10-01 00:00:00', 100, ?, '2026-10-01 00:00:00')", [loc, x[1], 'dc-fixture-' + x[0] + '-' + x[1]]);
    db.run("DELETE FROM m_replenish WHERE m_product_id=? AND m_warehouse_id=?", [x[1], x[0]]);
    db.run("INSERT INTO m_replenish (m_product_id, m_warehouse_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, replenishtype, level_min, level_max, m_replenish_uu) VALUES (?, ?, 11, 0, 'Y', '2026-10-01 00:00:00', 100, '2026-10-01 00:00:00', 100, '1', 8, 20, ?)", [x[1], x[0], 'dc-rep-' + x[0] + '-' + x[1]]);
  });
  var lineRow = function (org, key, prod, qty, price, extra) { return { t: 'i_order', f: Object.assign({ i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: 'POS Order', m_product_id: prod, qtyordered: qty, priceactual: price, c_uom_id: 100, dateordered: D1, ad_org_id: org }, extra || {}) }; };
  var tendRow = function (org, key, type, amt, extra) { return { t: 'i_payment', f: Object.assign({ i_isimported: 'N', documentno: key, doctypename: 'AR Receipt', iso_code: 'USD', payamt: amt, tendertype: type, datetrx: D1, ad_org_id: org }, extra || {}) }; };
  var card = function (n) { return { creditcardtype: 'V', r_pnref: 'PN-' + n, r_authcode: 'AU-' + n, r_result: '0', r_respmsg: 'APPROVED', isapproved: 'Y' }; };
  function till(org, pre, o) {                                                    // pre = '<OrgValue>-<TillUserValue>-' ; o.gap: skip S2 ; o.bad: unbalanced S2 ; o.refuse: an extra S4 the import refuses
    var R = [], p = pre + 'S';
    R.push(lineRow(org, p + 1, 123, 2, 65), tendRow(org, p + 1, 'X', 130));
    if (!o.gap) R.push(lineRow(org, p + 2, 130, 1, 50), lineRow(org, p + 2, 123, 1, 65), tendRow(org, p + 2, 'X', o.bad ? 40 : 50), tendRow(org, p + 2, 'C', o.bad ? 0.01 : 65, card(pre + 2)));
    R.push(lineRow(org, p + 3, 130, 2, 50), tendRow(org, p + 3, 'C', 100, card(pre + 3)));
    if (!o.noref) R.push(lineRow(org, pre + 'R1', 123, -1, 65, { linedescription: 'Refund of ' + p + 1 }), tendRow(org, pre + 'R1', 'X', -65));
    if (o.refuse) R.push(lineRow(org, p + 4, null, 1, 50, { productvalue: 'NO-SUCH-PRODUCT' }), tendRow(org, p + 4, 'X', 50));
    return R;
  }
  // tax arms (§23): a NON-ZERO rate (10 percent on the tax the till's own lookup resolves for the branch), tax-exclusive or tax-inclusive default SO price list. Tender oracle written by hand: exclusive = round(net x 1.10), inclusive = net.
  db.run('UPDATE ad_orginfo SET c_location_id=114 WHERE ad_org_id IN (?,?)', [NORTH, SOUTH]);   // a branch station has its address (the till reads its org's location for the tax lookup, the gate reads the same); the seed's branch orgs had none
  var TAX = ARM === 'tax_ex' || ARM === 'tax_in', INCL = ARM === 'tax_in', taxIds = [];
  if (TAX) {
    [NORTH, SOUTH].forEach(function (org) {
      var inp = TC.driveSync(TC.taxInputs({ ad_client_id: 11, ad_org_id: org, m_warehouse_id: WH[org] }), function (sq) { return q0(sq)[0]; }, function (sq) { return q0(sq); }), cat = {};
      q0('SELECT m_product_id AS p, c_taxcategory_id AS t FROM m_product WHERE m_product_id IN (123,130)').forEach(function (r) { cat[r.p] = r.t; });
      var env = TC.taxEnv(global.ERPEngine, inp, cat, DAY);
      [123, 130].forEach(function (pid) { var t = env.taxOf(pid); if (t && t.ok && taxIds.indexOf(t.c_tax_id) < 0) taxIds.push(t.c_tax_id); else if (!t || !t.ok) taxIds.push('LOOKUP-FAILED'); });
    });
    taxIds.filter(function (x) { return x !== 'LOOKUP-FAILED'; }).forEach(function (id) { db.run('UPDATE c_tax SET rate=10 WHERE c_tax_id=?', [id]); });
    if (INCL) db.run("UPDATE m_pricelist SET istaxincluded='Y' WHERE issopricelist='Y' AND ad_client_id=11");   // every sales list: the till reads the default one, Import Orders the cash partner's
    say('§DAYCLOSE-TAXFIX arm=' + ARM + ' taxIds=' + J(taxIds) + ' rate=10 priceListIncludesTax=' + INCL);
  }
  var g = function (net) { return INCL ? net : Math.round(net * 110) / 100; };
  var taxTill = function (org, pre, short) {                                   // T1 correct tickets; T2 (short) one ticket whose tender is 0.01 under
    var p = pre + 'S', R = [];
    if (!short) {
      R.push(lineRow(org, p + 1, 123, 2, 65), tendRow(org, p + 1, 'X', g(130)));
      R.push(lineRow(org, p + 2, 130, 1, 50), lineRow(org, p + 2, 123, 1, 65), tendRow(org, p + 2, 'X', 50), tendRow(org, p + 2, 'C', Math.round((g(115) - 50) * 100) / 100, card(pre + 2)));
      R.push(lineRow(org, pre + 'R1', 123, -1, 65, { linedescription: 'Refund of ' + p + 1 }), tendRow(org, pre + 'R1', 'X', -g(65)));
    } else R.push(lineRow(org, p + 1, 130, 1, 50), tendRow(org, p + 1, 'X', Math.round((g(50) - 0.01) * 100) / 100));
    return R;
  };
  var FIX = {
    tax: [].concat(taxTill(NORTH, 'SN-T1-', false), taxTill(SOUTH, 'SS-T2-', true)),
    standard: [].concat(till(NORTH, 'SN-N1-', {}), till(SOUTH, 'SS-S1-', {})),
    gate: [].concat(till(NORTH, 'SN-A-', { gap: true }), till(SOUTH, 'SS-B-', { bad: true }), till(SOUTH, 'SS-C-', {})),
    stop1: [].concat(till(NORTH, 'SN-N1-', { refuse: true }), till(SOUTH, 'SS-S1-', {})),
    gap: [].concat(till(NORTH, 'SN-A-', { gap: true }), till(SOUTH, 'SS-S1-', {}))
  };
  var fixName = { tax_ex: 'tax', tax_in: 'tax', one: 'standard', steps: 'standard', gate: 'gate', stop3: 'standard', stop1: 'stop1', fb_one: 'standard', fb_steps: 'standard', fb_gap: 'gap' }[ARM];
  var dep = commit(saveAll(FIX[fixName]), { ws: 'deposit' });
  var nO = one('SELECT count(*) AS n FROM i_order').n, nP = one('SELECT count(*) AS n FROM i_payment').n;
  check('FIX', 'deposit', 'the till deposits ' + fixName + ' through the ERP write path: I_Order lines and I_Payment tenders (n>0), all pending, no order made', dep.ok && nO >= 4 && nP >= 4 && one("SELECT count(*) AS n FROM i_order WHERE i_isimported<>'N'").n === 0 && one('SELECT count(*) AS n FROM c_order WHERE documentno LIKE ?', ['S_-%']).n === 0, { ok: dep.ok, err: dep.error, nO: nO, nP: nP });

  // ── plugins, installed exactly as the host does (generic extension points only) ──
  var hostDb = { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, lens: { register: function () {}, removeOwner: function () {} },
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), usePOS = !/^fb_/.test(ARM);
  if (usePOS) { var pm = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href); await reg.installBundle(pm); var st1 = await reg.startBundle('org.kernel.pos-integration'); check('PLUG', 'pos-started', 'pos-integration ACTIVE', st1.state === 'ACTIVE', st1); }
  var fm = await import(url.pathToFileURL(PLUGIN).href); await reg.installBundle(fm); var st2 = await reg.startBundle('org.kernel.friendly-ops');
  check('PLUG', 'fo-started', 'friendly-ops ACTIVE (' + path.basename(path.dirname(PLUGIN)) + ')', st2.state === 'ACTIVE', st2);
  function band() { var n = 0; n += one('SELECT count(*) AS n FROM ad_process WHERE ad_process_id=?', [PID_DC]).n; n += one('SELECT count(*) AS n FROM ad_process_para WHERE ad_process_id=?', [PID_DC]).n; n += one('SELECT count(*) AS n FROM ad_process_access WHERE ad_process_id=?', [PID_DC]).n;
    n += one('SELECT count(*) AS n FROM ad_menu WHERE ad_process_id=?', [PID_DC]).n; n += one('SELECT count(*) AS n FROM ad_treenodemm WHERE node_id=9534041').n; return n; }

  function snap() { var o = {}; TABLES.forEach(function (t) { var rows; try { rows = k.q('SELECT * FROM ' + t); } catch (e) { rows = []; }
    o[t] = rows.map(function (r) { var c = {}; Object.keys(r).sort().forEach(function (c0) { if (!DROP.test(c0)) c[c0] = r[c0]; }); return J(c); }).sort(); }); return o; }
  function counts() { var o = {}; ['c_order', 'c_orderline', 'c_invoice', 'm_inout', 'c_payment', 'c_allocationhdr', 'm_movement', 'fact_acct', 'm_transaction'].forEach(function (t) { o[t] = one('SELECT count(*) AS n FROM ' + t).n; }); return o; }
  var keyState = function (pre) { return k.q("SELECT documentno AS k, i_isimported AS i, c_order_id AS o, i_errormsg AS e FROM i_order WHERE documentno LIKE ? ORDER BY i_order_id", [pre + '%']); };
  var orderOf = function (key) { return k.q('SELECT * FROM c_order WHERE documentno=?', [key]); };
  var dcParams = function (extra) { return Object.assign({ BusinessDay: DAY, C_BankAccount_ID: BANK }, extra || {}); };
  var stepsRun = function (orgs, create, dt) {                                  // the legacy way: every step its own process run, its own commit; stage by stage over the branches (Import, then Replenish Report, then its create)
    orgs.forEach(function (org) {
      runProc(usePOS ? 9538001 : 206, usePOS ? { AD_Client_ID: 11, AD_Org_ID: org, C_BankAccount_ID: BANK } : { AD_Client_ID: 11, AD_Org_ID: org, DocAction: 'CO', DeleteOldImported: 'N' }, 'step1');
      if (!usePOS) runProc(343, { AD_Org_ID: org, C_BankAccount_ID: BANK, DocAction: 'CO', DeleteOldImported: 'N' }, 'step1b');
    });
    orgs.forEach(function (org) { runProc(53267, { M_Warehouse_ID: WH[org] }, 'report'); });
    if (create) orgs.forEach(function (org) { runProc(53267, { M_Warehouse_ID: WH[org], ReplenishmentCreate: create, C_DocType_ID: dt }, 'create'); });
  };
  var res = { arm: ARM }, saveSnap = function (extra) { Object.assign(res, extra || {}, { counts: counts(), snap: snap(), checks: out.checks }); fs.writeFileSync(path.join(LOGS, 'snap_' + ARM + (TAG ? '_' + TAG : '') + '.json'), J(res)); };

  if (ARM === 'steps' || ARM === 'fb_steps') { stepsRun([NORTH, SOUTH], 'POO', DOCTYPE_POO); saveSnap(); }
  if (ARM === 'one' || ARM === 'fb_one') {
    var rc = runProc(PID_DC, dcParams({ ReplenishmentCreate: 'POO', C_DocType_ID: DOCTYPE_POO }), 'close');
    check('CLOSE', 'ran', 'the one-click close ends DONE (message: ' + String(rc.error || (rc.r && rc.r.summary) || '').slice(0, 120) + ')', rc.ok && /done/.test(String((rc.r && rc.r.summary) || '')), { ok: rc.ok, s: rc.r && rc.r.summary });
    saveSnap({ summary: rc.r && rc.r.summary });
    if (ARM === 'one') {
      var c0 = counts(), snapBefore = J(snap()), r2 = runProc(PID_DC, dcParams({ BranchOrgs: NORTH + ',' + SOUTH, ReplenishmentCreate: 'POO', C_DocType_ID: DOCTYPE_POO }), 'rerun'), c1 = counts();
      var newDocs = ['c_order', 'c_orderline', 'c_invoice', 'm_inout', 'c_payment', 'c_allocationhdr', 'fact_acct', 'm_transaction'].filter(function (t) { return c1[t] !== c0[t]; });
      check('RERUN', 'no-new-rows', 'a second close of the same day naming both branches explicitly: ' + String((r2.r && r2.r.summary) || r2.error).slice(0, 100) + '; document-table counts unchanged (changed tables ' + J(newDocs) + '; I_Order/I_Payment/documents n>0)', r2.ok && !newDocs.length && c0.c_order > 4 && c0.c_payment > 4, { newDocs: newDocs, c0: c0, c1: c1, ok: r2.ok });
      check('RERUN', 'rows-identical', 'the I_ rows the first close imported are byte-identical after the second', JSON.parse(snapBefore).i_order.length > 0 && JSON.parse(snapBefore).i_order.join('|') === snap().i_order.join('|'), {});
      // G / S model from the dictionary (menu path + parameters + OK)
      var leaf = function (pid) { var r = one("SELECT m.ad_menu_id AS m FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 WHERE m.action IN ('P','R') AND m.ad_process_id=? AND m.isactive='Y' ORDER BY m.ad_menu_id LIMIT 1", [pid]); return r ? r.m : null; };
      var pathOf = function (mid) { var p = [], cur = mid, n = 0; while (cur != null && n++ < 20) { p.unshift(cur); var r = one('SELECT parent_id AS p FROM ad_treenodemm WHERE ad_tree_id=10 AND node_id=?', [cur]); cur = r && r.p ? r.p : null; } return p; };
      var gs = function (runs) { var open = {}, G = 0, Sx = 0; runs.forEach(function (r) { var p = pathOf(leaf(r.pid)); if (!p.length) throw new Error('no menu leaf for process ' + r.pid); p.slice(0, -1).forEach(function (f) { if (!open[f]) { open[f] = 1; G++; } }); G++; G += r.params; G++; Sx++; }); return { G: G, S: Sx }; };
      var before = [], pe = usePOS ? 9538001 : 206;
      [NORTH, SOUTH].forEach(function () { before.push({ pid: pe, params: 2 }, { pid: 53267, params: 1 }, { pid: 53267, params: 3 }); });   // [org, bank] / [warehouse] / [warehouse, create, doctype] per branch
      var after = [{ pid: PID_DC, params: 4 }];                                                                                                  // [day, bank, create, doctype]; Orgs blank = every branch with pending rows
      var gb = gs(before), ga = gs(after);
      say('§DAYCLOSE-GS model=MODEL-DERIVED(dictionary; not a browser recording) branches=2 before G=' + gb.G + ' S=' + gb.S + ' after G=' + ga.G + ' S=' + ga.S + ' paths=' + J({ import: pathOf(leaf(pe)), replenish: pathOf(leaf(53267)), dayclose: pathOf(leaf(PID_DC)) }));
      check('GS', 'lower', 'G and S both strictly lower with the close (before G=' + gb.G + ' S=' + gb.S + ', after G=' + ga.G + ' S=' + ga.S + ') for the same books (BOOKS verdict)', ga.G < gb.G && ga.S < gb.S, { gb: gb, ga: ga });
      out.gs = { before: gb, after: ga };
      // plugin stop
      var bandBefore = band(), clsBefore = !!AP.JAVA['org.kernel.friendlyops.BranchDayClose'];
      await reg.stopBundle('org.kernel.friendly-ops');
      var bandAfter = band(), clsAfter = !!AP.JAVA['org.kernel.friendlyops.BranchDayClose'], rr = commit(function (trx) { var r0 = AP.runInTrx(trx, PID_DC, { params: dcParams() }); return { ok: r0.ok, error: r0.summary }; });
      var pinRe = /BASE_PIN = '([0-9a-f]{64})'/.exec(fs.readFileSync(path.join(__dirname, 'witness_pos_sales.js'), 'utf8')), hsh = baseHash();
      var gitq = cp.spawnSync('git', ['-C', ERP, 'diff', '--quiet', 'origin/main', '--', 'ad_seed.db', 'patches/ad_seed.db.sql', 'patches/mfg.sql']);
      check('STOPPLUG', 'removes-all', 'before Stop: staged rows=' + bandBefore + ' class=' + clsBefore + '; after: rows=0 class=false, running 53405 answers not found; base hash == the pin of W-POS-SALES (' + (pinRe ? pinRe[1].slice(0, 12) : '?') + ') and git sees no change to the hashed files',
        bandBefore >= 13 && clsBefore && bandAfter === 0 && !clsAfter && /not found/i.test(String(rr.error || '')) && !!pinRe && hsh === pinRe[1] && gitq.status === 0, { bandBefore: bandBefore, bandAfter: bandAfter, clsBefore: clsBefore, clsAfter: clsAfter, err: rr.error, hsh: hsh, git: gitq.status });
    }
  }
  if (ARM === 'stop3') {
    var r3 = runProc(PID_DC, dcParams({ ReplenishmentCreate: 'POO', C_DocType_ID: DOCTYPE_MMM }), 'stop3'), msg3 = String((r3.r && r3.r.summary) || r3.error || '');
    var impN = keyState('SN-N1-S').filter(function (r) { return r.i === 'Y'; }).length, impS = keyState('SS-S1-S').filter(function (r) { return r.i === 'Y'; }).length;
    check('STOP3', 'names-step', 'the close STOPS at the create step of Org ' + NORTH + ' and says so: "' + msg3.slice(0, 160) + '"', /STOPPED at step "Replenish confirm create POO" \(Org 50002\)/.test(msg3), { msg: msg3 });
    check('STOP3', 'earlier-stay', 'steps 1 and 2 stay as legacy leaves them: both branches imported (Y rows north ' + impN + ', south ' + impS + '; orders CO) and the failed create left no PO and no half row', impN > 3 && impS > 3 && orderOf('SN-N1-S1').length === 1 && orderOf('SN-N1-S1')[0].docstatus === 'CO' && orderOf('SS-S1-S1')[0].docstatus === 'CO' && one("SELECT count(*) AS n FROM c_order WHERE issotrx='N' AND dateordered>=?", ['2026-01-01']).n === 0, { impN: impN, impS: impS });
    check('STOP3', 'later-not-run', 'nothing after the failed step ran: no create for Org ' + SOUTH + ' (no PO anywhere, SKIPPED/STEP lines for it absent)', !r3.log.some(function (l) { return /step="Replenish confirm create POO" result=OK/.test(l); }) && one("SELECT count(*) AS n FROM c_order WHERE issotrx='N' AND dateordered>=?", ['2026-01-01']).n === 0, {});
    saveSnap({ msg: msg3 });
  }
  if (ARM === 'stop1') {
    var r1s = runProc(PID_DC, dcParams({ ReplenishmentCreate: 'POO', C_DocType_ID: DOCTYPE_POO }), 'stop1'), msg1 = String((r1s.r && r1s.r.summary) || r1s.error || '');
    var ks = keyState('SN-N1-S');
    check('STOP1', 'names-step', 'the close STOPS at Import POS Sales of Org ' + NORTH + ' naming the refused ticket: "' + msg1.slice(0, 200) + '"', /STOPPED at step "Import POS Sales" \(Org 50002\): ticket SN-N1-S4 not imported/.test(msg1), { msg: msg1 });
    check('STOP1', 'earlier-tickets-stay', 'the three tickets before it stay imported (S1..S3 Y with orders), S4 is left whole (E + message, no order)', ['SN-N1-S1', 'SN-N1-S2', 'SN-N1-S3'].every(function (kk) { return orderOf(kk).length === 1 && orderOf(kk)[0].docstatus === 'CO'; }) && orderOf('SN-N1-S4').length === 0 && ks.filter(function (r) { return r.k === 'SN-N1-S4' && r.i === 'E' && r.e; }).length === 1, { ks: ks });
    check('STOP1', 'nothing-after', 'no later step or branch ran: no PO, no T_Replenish row, Org ' + SOUTH + ' tickets still N', one("SELECT count(*) AS n FROM c_order WHERE issotrx='N' AND dateordered>=?", ['2026-01-01']).n === 0 && one('SELECT count(*) AS n FROM t_replenish').n === 0 && keyState('SS-S1-S').every(function (r) { return r.i === 'N'; }), {});
  }
  if (ARM === 'fb_gap') {
    var rf = runProc(PID_DC, dcParams(), 'fbgap'), lf = rf.log.filter(function (l) { return /^§DAYCLOSE/.test(l); }).join('\n'), fm_ = String((rf.r && rf.r.summary) || '');
    check('GATE-FB', 'blocked-named', 'without the POS plugin the unscoped Import Orders would also import the withheld till: the close is BLOCKED, names the till, imports NOTHING (orders ' + one("SELECT count(*) AS n FROM c_order WHERE documentno LIKE 'S_-%'").n + ', all rows N) : "' + fm_.slice(0, 200) + '"',
      /STOPPED at step "Import Orders \+ Import Payment" \(Org 50002\): BLOCKED, nothing imported: the gate withheld Org 50002 SN-A-/.test(fm_) && one("SELECT count(*) AS n FROM c_order WHERE documentno LIKE 'S_-%'").n === 0 && keyState('S').every(function (r) { return r.i === 'N'; }) && keyState('S').length > 6, { fm: fm_, lf: lf.slice(0, 500) });
    check('GATE-FB', 'gap-named', 'the gap is named (§DAYCLOSE-GATE WITHHELD till=SN-A- reason="gap SN-A-S2")', /WITHHELD till=SN-A- reason="gap SN-A-S2"/.test(lf), { lf: lf.slice(0, 500) });
    saveSnap();
  }
  if (TAX) {
    var rt = runProc(PID_DC, dcParams(), 'tax'), lt = rt.log.filter(function (l) { return /^§DAYCLOSE/.test(l); }).join('\n'), mt = String((rt.r && rt.r.summary) || '');
    var inv = function (key) { var o = orderOf(key)[0]; return o ? k.q('SELECT grandtotal AS g, ispaid AS p, docstatus AS d FROM c_invoice WHERE c_order_id=?', [o.c_order_id])[0] : null; };
    var i1 = inv('SN-T1-S1'), i2 = inv('SN-T1-S2'), i3 = inv('SN-T1-R1'), want1 = [g(130), g(115), -g(65)];
    check('TAX', 'nonzero-rate', 'the fixture really has tax: the rate the till lookup resolved is 10 (ids ' + J(taxIds) + ') and the exclusive invoice differs from the net: invoice 1 GrandTotal ' + (i1 && i1.g) + ' vs net 130', taxIds.length > 0 && taxIds.indexOf('LOOKUP-FAILED') < 0 && !!i1 && (INCL ? Number(i1.g) === 130 : Number(i1.g) === 143), { taxIds: taxIds, i1: i1 });
    check('TAX', 'correct-closes', 'correct tickets (sale, split tender, refund) on a tax-' + (INCL ? 'INCLUSIVE' : 'EXCLUSIVE') + ' list pass the gate and close: invoices ' + J([i1 && i1.g, i2 && i2.g, i3 && i3.g]) + ' == tenders ' + J(want1) + ', each CO and paid', !!i1 && !!i2 && !!i3 && [i1, i2, i3].every(function (x, n) { return Number(x.g) === want1[n] && x.p === 'Y' && x.d === 'CO'; }), { i1: i1, i2: i2, i3: i3, lt: lt.slice(0, 600) });
    check('TAX', 'balance-mode', 'the gate says it judged tax-aware, honouring IsTaxIncluded=' + (INCL ? 'Y' : 'N') + ': §DAYCLOSE-GATE ... balance=tax-aware', new RegExp('balance=tax-aware \\(till_core totals, price list IsTaxIncluded=' + (INCL ? 'Y' : 'N') + '\\)').test(lt), { lt: lt.slice(0, 400) });
    var short = k.q("SELECT i_isimported AS i FROM i_order WHERE documentno='SS-T2-S1'"), exp1 = INCL ? '50.00' : '55.00', got1 = INCL ? '49.99' : '54.99';
    check('TAX', 'short-withheld-named', 'a ticket whose tenders are 0.01 short is WITHHELD and NAMED (expected=' + exp1 + ' tenders=' + got1 + '), not imported (orders ' + orderOf('SS-T2-S1').length + ', row still N)', lt.indexOf('WITHHELD till=SS-T2-') > 0 && lt.indexOf('unbalanced SS-T2-S1 expected=' + exp1 + ' tenders=' + got1 + ' difference=-0.01') > 0 && orderOf('SS-T2-S1').length === 0 && short.length === 1 && short[0].i === 'N', { lt: lt.slice(0, 900) });
    check('TAX', 'close-done', 'the close ends DONE with 3 tickets imported: "' + mt.slice(0, 100) + '"', /done: branches=2 tickets imported=3 till\/day withheld=1/.test(mt), { mt: mt });
    saveSnap();
  }
  if (ARM === 'gate') {
    var rg = runProc(PID_DC, dcParams({ ReplenishmentCreate: 'POO', C_DocType_ID: DOCTYPE_POO }), 'gate'), logs = rg.log.filter(function (l) { return /^§DAYCLOSE/.test(l); }).join('\n'), gm = String((rg.r && rg.r.summary) || '');
    var imported = function (pre) { return one('SELECT count(*) AS n FROM c_order WHERE documentno LIKE ?', [pre + '%']).n; }, pa = 'SN-A-', pb = 'SS-B-', pc = 'SS-C-';
    check('GATE', 'gap-withheld-named', 'till ' + pa + ' (ticket 2 missing) is withheld and NAMED with the missing number, none of its tickets imported (orders ' + imported(pa) + ', rows still N)', logs.indexOf('WITHHELD till=' + pa) > 0 && /gap SN-A-S2/.test(logs) && imported(pa) === 0 && keyState(pa).every(function (r) { return r.i === 'N'; }) && keyState(pa).length > 2, { logs: logs.slice(0, 600) });
    check('GATE', 'unbalanced-withheld-named', 'till ' + pb + ' (ticket 2: expected 115.00, tenders 40.01) is withheld and NAMED with both totals, nothing of it imported (orders ' + imported(pb) + ')', logs.indexOf('WITHHELD till=' + pb) > 0 && /unbalanced SS-B-S2 expected=115.00 tenders=40.01/.test(logs) && imported(pb) === 0 && keyState(pb).every(function (r) { return r.i === 'N'; }), { logs: logs.slice(0, 600) });
    check('GATE', 'clean-still-closes', 'the clean till ' + pc + ' IS imported (orders ' + imported(pc) + ' > 0, each CO) and the close ends DONE: "' + gm.slice(0, 120) + '"', imported(pc) >= 4 && orderOf(pc + 'S1')[0].docstatus === 'CO' && /done/.test(gm), { gm: gm, imp: imported(pc) });
    var pos = one("SELECT count(*) AS n FROM c_order WHERE issotrx='N' AND dateordered>=?", ['2026-01-01']).n;
    check('GATE', 'steps-23-still-run', 'with Store North withheld whole its Replenish Report still ran and the branches closed through the create (POs made: ' + pos + ' > 0)', pos > 0 && /org=50002 step="Replenish Report" result=OK/.test(logs) && /step="Replenish confirm create POO" result=OK/.test(logs), { logs: logs.slice(0, 900) });
    check('GATE', 'z-not-available', 'the run says out loud that no Z reaches head office (the till sends none): §DAYCLOSE-GATE z=NOT-AVAILABLE', /§DAYCLOSE-GATE z=NOT-AVAILABLE/.test(logs), {});
    saveSnap();
  }
  var judged = out.checks.length, failed = out.checks.filter(function (c) { return !c.ok; }).length, v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  say('§DAYCLOSE-ARM arm=' + ARM + (TAG ? ' mutant=' + TAG : '') + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed);
  fs.writeFileSync(path.join(LOGS, 'verdict_' + ARM + (TAG ? '_' + TAG : '') + '.json'), J({ v: v, judged: judged, failed: failed, gs: out.gs || null }));
  process.exit(v === 'PASS' ? 0 : 1);
  function baseHash() { var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
    ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; }); return sha256(Buffer.from(man, 'utf8')); }
}

// ═════════════════════════════════════════ PARENT: spawn arms, judge BOOKS, run mutants ═════════════════════════════════════════
function runArm(arm, env, tag) {
  var lf = path.join(LOGS, 'arm_' + arm + (tag ? '_' + tag : '') + '.log');
  var r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DC_ARM: arm, DC_TAG: tag || '' }, env || {}), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
  fs.writeFileSync(lf, (r.stdout || '') + (r.stderr ? '\n--stderr--\n' + r.stderr : ''));
  var snapf = path.join(LOGS, 'snap_' + arm + (tag ? '_' + tag : '') + '.json'), vf = path.join(LOGS, 'verdict_' + arm + (tag ? '_' + tag : '') + '.json');
  return { code: r.status, log: lf, out: r.stdout || '', snap: fs.existsSync(snapf) ? JSON.parse(fs.readFileSync(snapf, 'utf8')).snap : null, verdict: fs.existsSync(vf) ? JSON.parse(fs.readFileSync(vf, 'utf8')) : null };
}
function diff(a, b, tables) {
  var rep = {}, total = 0, empty = [];
  tables.forEach(function (t) { var A = a.snap[t] || [], B = b.snap[t] || [], sa = {}, sb = {}; A.forEach(function (x) { sa[x] = 1; }); B.forEach(function (x) { sb[x] = 1; });
    var onlyA = A.filter(function (x) { return !sb[x]; }).length, onlyB = B.filter(function (x) { return !sa[x]; }).length; rep[t] = { a: A.length, b: B.length, diff: onlyA + onlyB, dup: (A.length - Object.keys(sa).length) + (B.length - Object.keys(sb).length) }; total += onlyA + onlyB + Math.abs(A.length - B.length); if (!A.length || !B.length) empty.push(t); });
  return { rep: rep, total: total, empty: empty };
}
function line(s) { console.log(s); fs.appendFileSync(path.join(LOGS, 'parent.log'), s + '\n'); }
function verdictLine(cs, ok, judged, failed, extra) { var v = !judged ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; line('§DAYCLOSE-VERDICT case=' + cs + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed + (extra ? ' ' + extra : '')); return v; }
async function parent() {
  fs.writeFileSync(path.join(LOGS, 'parent.log'), '');
  var arms = {}, all = [];
  ['steps', 'one', 'tax_ex', 'tax_in', 'gate', 'stop3', 'stop1', 'fb_steps', 'fb_one', 'fb_gap'].forEach(function (a) { arms[a] = runArm(a); line('§DAYCLOSE-RUN arm=' + a + ' exit=' + arms[a].code + ' log=' + arms[a].log + ' verdict=' + J(arms[a].verdict)); });
  function books(cs, A, B) {
    if (!A.snap || !B.snap) return all.push(verdictLine(cs, false, 0, 0, 'reason="an arm produced no snapshot (crashed): see its log"'));
    var d = diff(A, B, TABLES), named = NAMED.map(function (t) { return t + ' a=' + d.rep[t].a + ' b=' + d.rep[t].b + ' diff=' + d.rep[t].diff; }).join('; ');
    line('§DAYCLOSE-BOOKS case=' + cs + ' ' + named + ' | others ' + TABLES.filter(function (t) { return NAMED.indexOf(t) < 0; }).map(function (t) { return t + ' ' + d.rep[t].a + '/' + d.rep[t].b + ' d' + d.rep[t].diff; }).join(' ') + ' | excluded columns: created updated createdby updatedby *_uu ad_pinstance_id processedon(a millisecond clock)');
    var emptyNamed = d.empty.filter(function (t) { return NAMED.indexOf(t) >= 0; }), po = (A.snap.c_order || []).filter(function (r) { return /"issotrx":"N"/.test(r) && /"dateordered":"2026-1/.test(r); }).length;
    var failed = (d.total ? 1 : 0), judged = 1 + 1;
    if (emptyNamed.length || !po) { line('§DAYCLOSE-BOOKS case=' + cs + ' VACUOUS empty=' + J(emptyNamed) + ' purchaseOrders=' + po); all.push(verdictLine(cs, false, 0, 0, 'reason="population empty"')); return; }
    all.push(verdictLine(cs, !d.total && po > 0, judged, failed, 'rowDiff=' + d.total + ' purchaseOrdersMade=' + po));
  }
  books('W-DAYCLOSE', arms.steps, arms.one);
  books('W-DAYCLOSE-FALLBACK', arms.fb_steps, arms.fb_one);
  ['one', 'tax_ex', 'tax_in', 'gate', 'stop3', 'stop1', 'fb_gap'].forEach(function (a) { var v = arms[a].verdict; var cs = { tax_ex: 'W-AUDIT-GATE-TAX-EXCLUSIVE', tax_in: 'W-AUDIT-GATE-TAX-INCLUSIVE', one: 'W-DAYCLOSE-ARM-one(RERUN,GS,STOPPLUG)', gate: 'W-AUDIT-GATE', stop3: 'W-DAYCLOSE-STOP-3', stop1: 'W-DAYCLOSE-STOP-1', fb_gap: 'W-AUDIT-GATE-FALLBACK' }[a]; all.push(verdictLine(cs, v && v.v === 'PASS', v ? v.judged : 0, v ? v.failed : 0, 'log=' + arms[a].log)); });
  var gs = arms.one.verdict && arms.one.verdict.gs; if (gs) line('§DAYCLOSE-GS-RESULT before G=' + gs.before.G + ' S=' + gs.before.S + ' after G=' + gs.after.G + ' S=' + gs.after.S + ' (MODEL-DERIVED)');
  // mutants: copies of the shipped plugin, each rewrite proven applied exactly once; the named case must print FAIL itself
  if (process.env.DC_MUTANTS === '1') {
    var src = fs.readFileSync(path.join(ERP, 'plugins', 'friendly_ops.mjs'), 'utf8');
    var MUT = [
      { name: 'gate-off', arm: 'gate', old: "&& DC_BREAK !== 'nogate'", neu: '&& false', kills: 'W-AUDIT-GATE' },
      { name: 'pretax-balance', arm: 'tax_ex', old: "if (DC_BREAK === 'pretax') return k.lc;", neu: 'if (true) return k.lc;', kills: 'W-AUDIT-GATE-TAX-EXCLUSIVE' },
      { name: 'steps-out-of-order', arm: 'one', old: "if (DC_BREAK === 'order')", neu: 'if (true)', kills: 'W-DAYCLOSE' },
      { name: 'direct-c_order-write', arm: 'one', old: "const l0 = trx.log.length, r = ap.runInTrx(trx, P_POSSALES, { params: { AD_Client_ID: C, AD_Org_ID: org, C_BankAccount_ID: P.C_BankAccount_ID, DocumentNo: k } });",
        neu: "const l0 = trx.log.length, r = (function () { const sv = X.ML.save(trx, 'c_order', null, X.ML.newPO(trx, 'c_order', { ad_org_id: org, documentno: k, issotrx: 'Y', dateordered: day, c_doctype_id: 135, c_bpartner_id: 117, m_warehouse_id: 50003, m_pricelist_id: 101, c_currency_id: 100, c_paymentterm_id: 105, paymentrule: 'P', deliveryrule: 'A', invoicerule: 'I', priorityrule: '5' })); return { ok: sv.ok, summary: sv.error || 'direct' }; })();", kills: 'W-DAYCLOSE' }
    ];
    var base = arms.steps;
    MUT.forEach(function (m) {
      var n = src.split(m.old).length - 1, root = '/tmp/dayclose_mut/' + m.name, dir = root + '/plugins'; fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(ERP, 'till_core.js'), root + '/till_core.js'); fs.copyFileSync(path.join(ERP, 'eoda_core.js'), root + '/eoda_core.js');   // ../till_core.js of the copy
      var mutSrc = src.replace(m.old, function () { return m.neu; }), applied = n === 1 && mutSrc !== src; fs.writeFileSync(dir + '/friendly_ops.mjs', mutSrc);
      line('§DAYCLOSE-MUTANT name=' + m.name + ' applied=' + (applied ? 'YES exactly once' : 'NO occurrences=' + n) + ' copy=' + dir + '/friendly_ops.mjs (a copy, the shipped file untouched)');
      if (!applied) { all.push(verdictLine('MUTANT-' + m.name, false, 0, 0, 'reason="rewrite did not apply: not a kill"')); return; }
      var r = runArm(m.arm, { DC_PLUGIN: dir + '/friendly_ops.mjs' }, m.name), killed = false, why = '';
      if (m.arm === 'gate' || m.arm === 'tax_ex') { killed = !!(r.verdict && r.verdict.v === 'FAIL'); why = 'arm gate verdict=' + (r.verdict && r.verdict.v); }
      else { if (!r.snap || !base.snap) why = 'CRASH (no snapshot): not a kill'; else { var d = diff(base, r, TABLES); killed = d.total > 0; why = 'W-DAYCLOSE rowDiff=' + d.total + ' ' + NAMED.map(function (t) { return t + ' ' + d.rep[t].a + '/' + d.rep[t].b; }).join(' '); } }
      line('§DAYCLOSE-MUTANT name=' + m.name + ' ' + (killed ? 'KILLED' : 'SURVIVED') + ' by=' + m.kills + ' ' + why + ' exit=' + r.code + ' log=' + r.log);
      all.push(verdictLine('MUTANT-' + m.name, killed, 1, killed ? 0 : 1, 'killed=' + killed));
    });
  }
  var bad = all.filter(function (v) { return v !== 'PASS'; }).length;
  line('§DAYCLOSE-SUMMARY verdicts=' + all.length + ' notPass=' + bad + ' logs=' + LOGS);
  process.exit(bad ? 1 : 0);
}
(ARM ? child() : parent()).catch(function (e) { console.error('§DAYCLOSE-CRASH ' + (e && e.stack || e)); process.exit(2); });
