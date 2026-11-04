#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SODA-PRICE / W-SODA-BATCH / W-SODA-RECEIVE (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §28.4; TWIN CARDINAL RULE). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
//   An empty population prints INCONCLUSIVE, never PASS. A mutant is a COPY proven applied exactly once; a crash is not a kill. Logs: /tmp/soda_logs/.
// THE ISSUES: (PRICE) a SODA batch must carry ONLY the rows that changed since the last finished run of the same branch (Export2Queue.java:152-165): a price, a product row (ImageURL included), a tax; the till must apply only what
//   arrived and leave every other row as it was ("old prices stay", §24.1 D5). (BATCH) one run = ONE op group however many rows or tills. (RECEIVE) the movement the Replenish create made for the branch warehouse is named in the batch,
//   its receipt (full or short) goes up as POS_MovementReceipt rows, and applying it moves the storage at BOTH warehouses as legacy does (MMovementConfirm.processLine :130-137 / createDifferenceDoc :497-590).
// HARNESS: dd_common.js boot (the twin kernel over ad_seed.db, GardenWorld: branch Org 12 = Store Central, wh 104, price list 101 / version 104) + the REAL friendly_ops.mjs plugin through the plugin registry. The harness plays the host in ONE
//   respect: it records the finished AD_PInstance of a run (idempiere.html:4485-4490 does that in the UI) because runJava writes none. NOT exercised here (named in §28.R): the branch_admin.html / till.html pages and the pipe.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node erp/tests/witness_soda.js 2>&1 | tee /tmp/soda_logs/soda.log     Mutant: SODA_MUT=<name>   Arms: SODA_ARMS=price,batch,receive
'use strict';
var path = require('path'), fs = require('fs'), os = require('os'), url = require('url');
if (!global.window) global.window = {};
var C = require('./dd_common.js'), ERP = C.ERP, J = JSON.stringify;
var ARMS = (process.env.SODA_ARMS || 'price,batch,receive').split(','), MUT = process.env.SODA_MUT || '', LOGS = process.env.SODA_LOGS || '/tmp/soda_logs';
var V = { price: { judged: 0, failed: 0 }, batch: { judged: 0, failed: 0 }, receive: { judged: 0, failed: 0 } }, ARM = 'price';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §SODA_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 500))); return ok; }
var MUTS = {   // [file, anchor (exactly once), replacement, arm that must go red]
  'full-list': ['plugins/friendly_ops.mjs', "since: SODA_BREAK === 'fulllist' ? SODACORE.EPOCH : since,", "since: SODACORE.EPOCH,", 'price'],
  'till-overwrites': ['soda_core.js', "w.update('m_productprice', where, f);", "w.update('m_productprice', { m_pricelist_version_id: r.m_pricelist_version_id }, f);", 'price'],
  'imageurl-dropped': ['soda_core.js', "upc: r.upc, imageurl: r.imageurl, c_uom_id: r.c_uom_id, m_product_category_id: r.m_product_category_id, c_taxcategory_id: r.c_taxcategory_id })); });", "upc: r.upc, c_uom_id: r.c_uom_id, m_product_category_id: r.m_product_category_id, c_taxcategory_id: r.c_taxcategory_id })); });", 'price'],
  'watermark-ignored': ['soda_core.js', "return mine.length ? ts(mine[0].updated) : EPOCH;", "return EPOCH;", 'price'],
  'receipt-ignores-scrap': ['soda_core.js', "scrappedqty: num(l.scrappedqty), differenceqty", "scrappedqty: 0, differenceqty", 'receive']
};

(async function main() {
  console.log('═══ W-SODA — SODA down: deltas, one batch, receive stock (prompts/POS_PLUGIN_LOCAL_FIRST.md §28) ═══ arms=' + ARMS.join(',') + (MUT ? ' MUTANT=' + MUT : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var root = ERP;                                                                                       // the tree under test; a mutant is a COPY of the whole erp dir with one anchor replaced
  if (MUT) {
    var m = MUTS[MUT]; if (!m) { console.log('§SODA_CRASH unknown mutant'); process.exit(2); }
    var copy = fs.mkdtempSync(path.join(os.tmpdir(), 'soda-mut-')); fs.cpSync(ERP, path.join(copy, 'erp'), { recursive: true }); root = path.join(copy, 'erp');
    var f = path.join(root, m[0]), src = fs.readFileSync(f, 'utf8'); if (src.split(m[1]).length !== 2) { console.log('§SODA_CRASH MUTATION DID NOT APPLY exactly once in ' + m[0]); process.exit(2); }
    fs.writeFileSync(f, src.replace(m[1], function () { return m[2]; })); console.log('§SODA_MUTANT applied ' + MUT + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]];
  }
  var H = await C.boot(), q = H.q, one = H.one, TODAY = H.TODAY, db = H.db;
  var IT = require(path.join(ERP, 'ad_import_tables.js')); IT.ensurePos(db);
  db.run('CREATE TABLE IF NOT EXISTS ad_pinstance (ad_pinstance_id NUMERIC, ad_process_id NUMERIC, ad_user_id NUMERIC, record_id NUMERIC, name TEXT, isprocessing TEXT, result NUMERIC, created TEXT, updated TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS ad_pinstance_para (ad_pinstance_id NUMERIC, parametername TEXT, p_number NUMERIC, p_string TEXT)');
  var SC = null; try { SC = require(path.join(root, 'soda_core.js')); } catch (e) { SC = null; }
  if (!SC) { ARM = 'price'; check('ABSENT', false, 'erp/soda_core.js is absent from this tree: there is no SODA to judge (RED)', { root: root }); V.batch.judged++; V.batch.failed++; V.receive.judged++; V.receive.failed++; return finish(); }
  var AP = require(path.join(ERP, 'ad_process.js')), PR = H.PR;
  var hostDb = { query: q, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, lens: { register: function () {}, removeOwner: function () {} }, docAction: H.ML, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(root, 'plugins'), u)).href); } };
  var reg = PR.create(host), fm = await import(url.pathToFileURL(path.join(root, 'plugins', 'friendly_ops.mjs')).href); await reg.installBundle(fm); var st = await reg.startBundle('org.kernel.friendly-ops');
  var procRow = one('SELECT classname FROM ad_process WHERE ad_process_id=53406');
  check('PLUG', st.state === 'ACTIVE' && !!procRow && /BranchSoda/.test(procRow.classname), 'friendly-ops ACTIVE and AD_Process 53406 FO_Branch_SODA staged from the manifest', { state: st.state, row: procRow });
  var ORG = 12, WH = 104, PL = 101, VER = Number(one('SELECT m_pricelist_version_id AS v FROM m_pricelist_version WHERE m_pricelist_id=? ORDER BY validfrom DESC, m_pricelist_version_id DESC LIMIT 1', [PL]).v), pin = 8200000, clock = 0;
  var posRow = one('SELECT * FROM c_pos WHERE ad_org_id=?', [ORG]);
  check('FIX', !!posRow && Number(posRow.m_pricelist_id) === PL, 'fixture: Org ' + ORG + ' has a C_POS on price list ' + PL + ' (version ' + VER + ')', posRow);
  var T0 = '2026-11-04';
  // run the process once the way the host does; the harness records the finished AD_PInstance (the host's job) with a controlled time
  function runSoda(day, sendAll, hostTime) {
    var params = { AD_Org_ID: { v: ORG, type: 'Integer' }, BusinessDay: { v: day, type: 'String' } }; if (sendAll) params.SendAll = { v: 'Y', type: 'String' };
    var n0 = ['pos_sodaref'].map(function (t) { return Number(one('SELECT COUNT(*) AS n FROM ' + t).n); })[0];
    var res = AP.runJava(q, H.env({ wh: WH }), { AD_PInstance_ID: ++pin, AD_Process_ID: 53406, className: 'org.kernel.friendlyops.BranchSoda', title: 'Branch SODA', Record_ID: 0, Table_ID: 0, params: params });
    (res.log || []).filter(function (l) { return /^§SODA|§PROC-(EXCEPTION|UNPORTED)|§MODEL-(ERR|SEVERE)/.test(l); }).forEach(function (l) { console.log('    ' + String(l).slice(0, 300)); });
    var groups = 0; if (res.ok) { groups = res.ops && res.ops.length ? 1 : 0; H.apply(res.ops); }
    db.run('INSERT INTO ad_pinstance (ad_pinstance_id, ad_process_id, ad_user_id, record_id, name, isprocessing, result, created, updated) VALUES (?,?,?,?,?,?,?,?,?)', [pin, 53406, 100, 0, 'Branch SODA', 'N', 1, hostTime, hostTime]);
    db.run('INSERT INTO ad_pinstance_para (ad_pinstance_id, parametername, p_number) VALUES (?,?,?)', [pin, 'AD_Org_ID', ORG]);
    return { ok: res.ok, summary: res.summary, groups: groups, nOps: (res.ops || []).length, rows: Number(one('SELECT COUNT(*) AS n FROM pos_sodaref').n) - n0 };
  }
  var batchRows = function (seq) { return q('SELECT * FROM pos_sodaref WHERE ad_org_id=? AND seq=? ORDER BY kind, m_product_id, c_tax_id', [ORG, seq]); };
  var kinds = function (rs) { var o = { B: 0, P: 0, R: 0, T: 0 }; rs.forEach(function (r) { o[r.kind]++; }); return o; };

  // ══════════════ the till: a replica of the twin BEFORE any edit (what the shipped seed gave it), with ONE deliberately different local value (an untouched price must stay) ══════════════
  var tillDb = new (db.constructor)(db.export());
  var tq = function (sql, p) { var s = tillDb.prepare(sql), o = []; try { if (p && p.length) s.bind(p); while (s.step()) { var r = s.getAsObject(), l = {}; for (var k in r) l[k.toLowerCase()] = r[k]; o.push(l); } } finally { s.free(); } return o; };
  var W = { find: function (t, where) { var ks = Object.keys(where); return tq('SELECT * FROM ' + t + ' WHERE ' + ks.map(function (k) { return k + '=?'; }).join(' AND '), ks.map(function (k) { return where[k]; }))[0] || null; },
    update: function (t, where, f) { var ks = Object.keys(f), wk = Object.keys(where); tillDb.run('UPDATE ' + t + ' SET ' + ks.map(function (k) { return k + '=?'; }).join(',') + ' WHERE ' + wk.map(function (k) { return k + '=?'; }).join(' AND '), ks.map(function (k) { return f[k]; }).concat(wk.map(function (k) { return where[k]; }))); },
    insert: function (t, f) { var ks = Object.keys(f); tillDb.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; })); } };
  var priced = q('SELECT pp.m_product_id AS pid, pp.pricestd AS price, p.imageurl AS img FROM m_productprice pp JOIN m_product p ON p.m_product_id=pp.m_product_id WHERE pp.m_pricelist_version_id=? AND pp.isactive=? AND p.isactive=? ORDER BY pp.m_product_id', [VER, 'Y', 'Y']);
  var X = priced[0].pid, Y = priced[1].pid, Z = priced[2].pid, TAXID = Number(one('SELECT c_tax_id AS t FROM c_tax ORDER BY c_tax_id LIMIT 1').t);
  tillDb.run('UPDATE m_productprice SET pricestd=99.99 WHERE m_product_id=? AND m_pricelist_version_id=?', [Z, VER]);   // the till-local value of Z: HQ will not touch Z, so after every batch the till must still say 99.99
  var tillSnap = function () { return tq('SELECT m_product_id, pricestd, pricelimit, pricelist FROM m_productprice WHERE m_pricelist_version_id=? ORDER BY m_product_id', [VER]); };
  var hqEdit = function (sql, p, at) { db.run(sql, p); };

  if (ARMS.indexOf('price') >= 0) {
    ARM = 'price'; console.log('\n── W-SODA-PRICE ──');
    // run 1: no earlier finished run of this branch -> Export2Queue.java:152-165: since = 2000-01-01, everything the till reads travels ONCE (the baseline)
    var r1 = runSoda(T0, false, T0 + ' 08:00:00'), b1 = batchRows(1), k1 = kinds(b1);
    console.log('§SODA_BASELINE rows=' + b1.length + ' kinds=' + J(k1) + ' (first run of the branch: no earlier AD_PInstance, since=2000-01-01)');
    check('BASE', r1.ok && k1.B === 1 && k1.P === priced.length && k1.R === priced.length, 'first run = the whole catalogue the till reads, once: ' + priced.length + ' prices, ' + priced.length + ' products', { ok: r1.ok, sum: r1.summary, k: k1, want: priced.length });
    check('BATCH-1', r1.groups === 1 && r1.nOps >= b1.length, 'ONE op group carries the whole batch (' + r1.nOps + ' ops, ' + b1.length + ' rows)', r1);
    // the tills received that baseline? No: the tills' own seed IS the baseline (they hold the same rows). Nothing is applied for run 1.
    var snap0 = tillSnap();
    // ── case NONE: nothing edited -> only the header travels
    var r2 = runSoda(T0, false, T0 + ' 09:00:00'), b2 = batchRows(2), k2 = kinds(b2);
    check('NONE', k2.B === 1 && k2.P === 0 && k2.R === 0 && k2.T === 0 && b2.length === 1, 'nothing changed since the last run: the batch is the header alone', { k: k2, n: b2.length });
    // ── case PRICE: ONE price edited at HQ at 09:30 (after the 09:00 run)
    hqEdit("UPDATE m_productprice SET pricestd=pricestd+1.5, pricelist=pricelist+1.5, updated=? WHERE m_product_id=? AND m_pricelist_version_id=?", [T0 + ' 09:30:00', X, VER]);
    var r3 = runSoda(T0, false, T0 + ' 10:00:00'), b3 = batchRows(3), k3 = kinds(b3), p3 = b3.filter(function (r) { return r.kind === 'P'; });
    var hqX = one('SELECT pricestd, pricelist, pricelimit FROM m_productprice WHERE m_product_id=? AND m_pricelist_version_id=?', [X, VER]);
    check('PRICE-ONE', k3.P === 1 && k3.R === 0 && k3.T === 0 && Number(p3[0] && p3[0].m_product_id) === Number(X) && Number(p3[0] && p3[0].pricestd) === Number(hqX.pricestd), 'one edited price = exactly one P row for that product at the HQ value (' + priced.length + ' prices exist)', { k: k3, p3: p3.map(function (r) { return r.m_product_id + ':' + r.pricestd; }), hq: hqX });
    var tr = SC.tillRows(b3, { client: 11, org: ORG }), ap3 = SC.applyRef(W, tr, { client: 11 }), snap3 = tillSnap();
    var diffs = snap3.filter(function (r, i) { return J(r) !== J(snap0[i]); });
    check('PRICE-APPLY', ap3.applied.prices === 1 && diffs.length === 1 && Number(diffs[0].m_product_id) === Number(X) && Number(diffs[0].pricestd) === Number(hqX.pricestd), 'the till applied the one price and changed no other row of its ' + snap3.length, { applied: ap3.applied, diffs: diffs });
    var zNow = Number(tq('SELECT pricestd FROM m_productprice WHERE m_product_id=? AND m_pricelist_version_id=?', [Z, VER])[0].pricestd);
    check('PRICE-STAY', zNow === 99.99, 'an untouched price stays on the till: Z=' + zNow + ' (till-local 99.99, HQ never edited it; D5 "old prices stay")', { z: zNow });
    var ap3b = SC.applyRef(W, tr, { client: 11 });
    check('PRICE-IDEMPOTENT', ap3b.applied.prices === 0 && ap3b.noop === 1, 'applying the same batch again changes nothing (>= watermark can repeat a row)', ap3b);
    // ── case IMG (lead addition): ONLY a product's ImageURL changes
    hqEdit("UPDATE m_product SET imageurl=?, updated=? WHERE m_product_id=?", ['https://img.example/' + Y + '.png', T0 + ' 10:30:00', Y]);
    var r4 = runSoda(T0, false, T0 + ' 11:00:00'), b4 = batchRows(4), k4 = kinds(b4), R4 = b4.filter(function (r) { return r.kind === 'R'; });
    check('IMG-ONE', k4.R === 1 && k4.P === 0 && k4.T === 0 && Number(R4[0] && R4[0].m_product_id) === Number(Y) && R4[0].imageurl === 'https://img.example/' + Y + '.png', 'only ImageURL of one product changed: exactly that one R row, carrying the URL string (no price, no tax row)', { k: k4, R4: R4.map(function (r) { return r.m_product_id + ':' + r.imageurl; }) });
    var snapP = tillSnap(), ap4 = SC.applyRef(W, SC.tillRows(b4, { client: 11, org: ORG }), { client: 11 });
    var yRow = tq('SELECT imageurl, name FROM m_product WHERE m_product_id=?', [Y])[0];
    check('IMG-APPLY', ap4.applied.products === 1 && yRow.imageurl === 'https://img.example/' + Y + '.png' && J(tillSnap()) === J(snapP), "the till's product row now carries the new URL and no price moved", { applied: ap4.applied, y: yRow });
    // ── case TAX
    hqEdit("UPDATE c_tax SET rate=rate+1, updated=? WHERE c_tax_id=?", [T0 + ' 11:30:00', TAXID]);
    var r5 = runSoda(T0, false, T0 + ' 12:00:00'), b5 = batchRows(5), k5 = kinds(b5);
    check('TAX-ONE', k5.T === 1 && k5.P === 0 && k5.R === 0 && Number(b5.filter(function (r) { return r.kind === 'T'; })[0].c_tax_id) === TAXID, 'one edited tax = one T row', { k: k5 });
    // ── watermark rules
    var wm = [SC.watermark([{ isprocessing: 'N', updated: '2026-11-04 08:00:00', org: 12 }, { isprocessing: 'N', updated: '2026-11-04 10:00:00', org: 12 }, { isprocessing: 'Y', updated: '2026-11-04 11:00:00', org: 12 }, { isprocessing: 'N', updated: '2026-11-04 11:30:00', org: 13 }], 12, 'N'),
      SC.watermark([{ isprocessing: 'N', updated: '2026-11-04 10:00:00', org: 12 }], 12, 'Y'), SC.watermark([], 12, 'N')];
    check('WATERMARK', wm[0] === '2026-11-04 10:00:00' && wm[1] === SC.EPOCH && wm[2] === SC.EPOCH, 'newest FINISHED run of THIS Org (a running one and another Org ignored); SendAll resets; none = 2000-01-01 (Export2Queue.java:152-165)', wm);
    // ── a DB-level read of the watermark the process used (the log line is primary evidence)
    var sinceLogged = batchRows(3)[0] && JSON.parse(batchRows(3)[0].detail).watermark;
    check('WM-USED', sinceLogged === T0 + ' 09:00:00', 'run 3 used the finished run 2 (host time 09:00:00) as its watermark', { sinceLogged: sinceLogged });
  }

  if (ARMS.indexOf('batch') >= 0) {
    ARM = 'batch'; console.log('\n── W-SODA-BATCH ──');
    // groups do not grow with the number of changed rows: 1 changed price vs 25 changed prices, one run each
    var base = runSoda(T0, false, T0 + ' 13:00:00');
    hqEdit("UPDATE m_productprice SET pricestd=pricestd+0.5, updated=? WHERE m_pricelist_version_id=? AND m_product_id=?", [T0 + ' 13:10:00', VER, X]);
    var small = runSoda(T0, false, T0 + ' 14:00:00');
    hqEdit("UPDATE m_productprice SET pricestd=pricestd+0.5, updated=? WHERE m_pricelist_version_id=?", [T0 + ' 14:10:00', VER]);
    var big = runSoda(T0, false, T0 + ' 15:00:00');
    console.log('§SODA_BATCH runs small={rows:' + small.rows + ',groups:' + small.groups + ',ops:' + small.nOps + '} big={rows:' + big.rows + ',groups:' + big.groups + ',ops:' + big.nOps + '}');
    check('GROUPS', small.groups === 1 && big.groups === 1 && big.rows > small.rows * 5, 'one SODA run = ONE op group: ' + small.rows + ' rows -> ' + small.groups + ' group, ' + big.rows + ' rows -> ' + big.groups + ' group (does not grow with lines)', { small: small, big: big });
    check('BATCH-ID', new Set(q('SELECT DISTINCT batchid FROM pos_sodaref WHERE seq=(SELECT MAX(seq) FROM pos_sodaref)').map(function (r) { return r.batchid; })).size === 1, 'every row of a run carries the same BatchId', null);
    console.log('§SODA_BATCH_LIMIT relay requests on the pipe are NOT measured by this node harness (no pipe): the claim is op groups per run. See §28.R.');
  }

  if (ARMS.indexOf('receive') >= 0) {
    ARM = 'receive'; console.log('\n── W-SODA-RECEIVE ──');
    var HQL = 101, STL = 102, HQO = 11, DT = 9100143, PA = 124;
    if (!one('SELECT 1 AS x FROM c_doctype WHERE c_doctype_id=?', [DT])) {
      var cols = Object.keys(one('SELECT * FROM c_doctype WHERE c_doctype_id=143')).filter(function (k) { return k !== 'c_doctype_id' && k !== 'c_doctype_uu'; });
      db.run('INSERT INTO c_doctype (c_doctype_id,' + cols.join(',') + ') SELECT ?,' + cols.join(',') + ' FROM c_doctype WHERE c_doctype_id=143', [DT]); db.run("UPDATE c_doctype SET isintransit='Y', name='Inventory Move (in transit) [twin fixture]' WHERE c_doctype_id=?", [DT]);
    }
    var onhand = function (loc) { return Number(one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=? AND m_product_id=?', [loc, PA]).s); };
    var s0 = { hq: onhand(HQL), st: onhand(STL) }, QTY = 5;
    // the movement exactly as the Replenish create step makes it (a DRAFT MMM), then HQ prepares (the in-transit doctype creates the confirm) and completes (stays In Progress: legacy MMovement.java:427-430)
    var h = H.save('m_movement', { AD_Org_ID: HQO, C_DocType_ID: DT, MovementDate: TODAY, DocAction: 'CO', IsInTransit: 'N' }), mid = H.lastId('m_movement');
    H.save('m_movementline', { m_movement_id: mid, AD_Org_ID: HQO, M_Product_ID: PA, C_UOM_ID: 100, MovementQty: QTY, QtyEntered: QTY, M_Locator_ID: HQL, M_LocatorTo_ID: STL, Line: 10 });
    var pr = H.docAction('m_movement', mid, 'PR', { noWorkflow: true }), co = H.docAction('m_movement', mid, 'CO', { noWorkflow: true }), mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), cf = one('SELECT * FROM m_movementconfirm WHERE m_movement_id=?', [mid]);
    check('SETUP', h.ok && pr.ok && mv.docstatus === 'IP' && !!cf && onhand(HQL) === s0.hq && onhand(STL) === s0.st, 'draft MMM -> Prepare creates the confirm -> Complete stays IP; goods in transit stay at the source', { mv: mv && mv.docstatus, cf: !!cf, hq: onhand(HQL), st: onhand(STL), co: co.msg });
    var rS = runSoda(T0, false, T0 + ' 16:00:00'), seqS = Number(one('SELECT MAX(seq) AS s FROM pos_sodaref').s), hdr = batchRows(seqS)[0], det = JSON.parse(hdr.detail);
    check('NAMED', (det.movements || []).indexOf(mv.documentno) >= 0, 'the SODA batch header names the movement the Replenish create made for the branch warehouse (' + mv.documentno + ')', det);
    var rS2 = runSoda(T0, false, T0 + ' 17:00:00'), hdr2 = JSON.parse(batchRows(seqS + 1)[0].detail);
    check('NAMED-ONCE', (hdr2.movements || []).indexOf(mv.documentno) < 0, 'a movement already named by an earlier batch is not named again', hdr2);
    // the branch clerk confirms 3 of 5 (a short receipt, 1 scrapped): legacy MMovementLineConfirm.processLine sets MovementQty := ConfirmedQty; Difference at the SOURCE, Scrapped at the TARGET (MMovementConfirm.createDifferenceDoc :497-590)
    var CONF = 3, SCR = 1, DIFF = QTY - CONF;   // MMovementLineConfirm.beforeSave :169-172: DifferenceQty = Target - Confirmed (Scrapped is NOT subtracted)
    var lc = q('SELECT * FROM m_movementlineconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]);
    var up = H.update('m_movementlineconfirm', lc[0].m_movementlineconfirm_id, { confirmedqty: CONF, scrappedqty: SCR, differenceqty: DIFF });
    var lc1 = one('SELECT * FROM m_movementlineconfirm WHERE m_movementlineconfirm_id=?', [lc[0].m_movementlineconfirm_id]);
    var ml = one('SELECT * FROM m_movementline WHERE m_movement_id=?', [mid]);
    var rr = SC.receiptRows({ client: 11, org: ORG, batchId: det && JSON.parse(hdr.detail) && hdr.batchid, movement: mv, confirm: cf, lines: [{ line: ml.line, m_product_id: PA, m_locator_id: HQL, m_locatorto_id: STL, targetqty: lc1.targetqty, confirmedqty: lc1.confirmedqty, scrappedqty: lc1.scrappedqty, differenceqty: lc1.differenceqty }] });
    check('RECEIPT-ROWS', rr.length === 1 && rr[0].confirmedqty === CONF && rr[0].scrappedqty === SCR && rr[0].targetqty === QTY && rr[0].differenceqty === DIFF && rr[0].status === 'CO', 'the receipt row carries target ' + QTY + ', confirmed ' + CONF + ', scrapped ' + SCR + ', difference ' + DIFF + ' as the branch clerk entered them', rr);
    // HQ applies the receipt: the confirm completes (processLine, difference documents, then the movement completes by cascade)
    var fin = H.docAction('m_movementconfirm', cf.m_movementconfirm_id, 'CO', { noWorkflow: true }), mv1 = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), ml1 = one('SELECT * FROM m_movementline WHERE m_movement_id=?', [mid]), cf1 = one('SELECT * FROM m_movementconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]);
    var s1 = { hq: onhand(HQL), st: onhand(STL) };
    // legacy arithmetic, written from the Java and NOT from the twin's output: the move carries CONFIRMED (3): source -3, target +3; the Difference document writes the shortfall (QtyBook=DifferenceQty 2, count 0) off the SOURCE, the Scrapped document off the TARGET
    var wantHq = s0.hq - CONF - DIFF, wantSt = s0.st + CONF - SCR;
    console.log('§SODA_RECEIVE fin=' + fin.ok + ' confirm=' + cf1.docstatus + ' movement=' + mv1.docstatus + ' line movementqty=' + ml1.movementqty + ' source ' + s0.hq + '->' + s1.hq + ' (want ' + wantHq + ') target ' + s0.st + '->' + s1.st + ' (want ' + wantSt + ')');
    check('CONFIRM-CO', fin.ok && cf1.docstatus === 'CO' && mv1.docstatus === 'CO', 'the confirm completes and the movement completes by cascade (MMovementConfirm.completeIt :387-486)', { fin: fin.msg, cf: cf1.docstatus, mv: mv1.docstatus });
    check('LINE-QTY', Number(ml1.movementqty) === CONF && Number(ml1.confirmedqty) === CONF && Number(ml1.scrappedqty) === SCR, 'processLine copied Confirmed to MovementQty (' + CONF + ') and Scrapped (' + SCR + ') onto the movement line (:130-137)', ml1);
    check('STORAGE', s1.hq === wantHq && s1.st === wantSt, 'storage at BOTH warehouses as legacy: HQ ' + s0.hq + ' -> ' + wantHq + ', Store Central ' + s0.st + ' -> ' + wantSt, { s0: s0, s1: s1, want: { hq: wantHq, st: wantSt } });
    var invs = q("SELECT i.m_inventory_id AS id, i.m_warehouse_id AS wh, i.docstatus AS st FROM m_inventory i WHERE i.description LIKE ?", ['%' + (cf1.documentno || '') + '%']);
    check('DIFF-DOCS', invs.length === 2 && invs.every(function (i) { return i.st === 'CO'; }) && invs.map(function (i) { return Number(i.wh); }).sort().join() === '103,104', 'two completed inventory documents: Difference at the source warehouse (103), Scrapped at the target warehouse (104)', invs);
    // the up-path: the receipt row exists only as a row of the NEXT EODA batch (no sender of its own)
    var senders = ['soda_core.js', 'plugins/friendly_ops.mjs'].filter(function (f) { return /TeamSync\.visit|applyOpGroup/.test(fs.readFileSync(path.join(root, f), 'utf8')); });
    check('NO-OWN-SEND', senders.length === 0, 'neither soda_core.js nor the plugin sends anything: the receipt rows are handed to the branch admin\'s ONE EODA send (§28.2)', senders);
  }

  return finish();
  function finish() {
  var total = 0, failed = 0; Object.keys(V).forEach(function (a) { if (ARMS.indexOf(a) < 0) return; var v = V[a]; total += v.judged; failed += v.failed; console.log('§SODA_VERDICT arm=' + a + ' ' + (v.judged === 0 ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS') + ' judged=' + v.judged + ' failed=' + v.failed + (MUT ? ' mutant=' + MUT : '')); });
  console.log('§SODA_VERDICT ALL ' + (total === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + total + ' failed=' + failed + (MUT ? ' mutant=' + MUT : ''));
  process.exit(total === 0 ? 2 : failed ? 1 : 0);
  }
})().catch(function (e) { console.log('§SODA_VERDICT ALL FAIL exception ' + (e && e.stack || e)); process.exit(2); });
