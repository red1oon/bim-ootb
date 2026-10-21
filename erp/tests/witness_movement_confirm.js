#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MOVEMENT-CONFIRM (prompts/ERP_FRIENDLY_OPS_LENS.md §61 + §62 OWNER RULE; TWIN CARDINAL RULE). READ THE LOG: §MVC lines and the verdict §MVC-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: an in-transit Inventory Move (doctype IsInTransit=Y) was refused by the twin at prepareIt ("MMovementConfirm not ported"), so a Distribution Movement could not run at all.
// §62: legacy is NEVER touched and the pilot has no in-transit MMM doctype, so NO oracle is called. Every behaviour case is NOTED-AS-DESIGNED (counted apart, never a pass) with the Java file:line it follows; the twin is JUDGED by
// accounting invariants, numerically, on a twin-only fixture (an in-transit MMM doctype created inside a savepoint of the TWIN DB; HQ org 11 locator 101 -> Store Central org 12 locator 102, an inter-org move).
//   Invariants: (iii) goods in transit stay at the source (storage unmoved, no M_Transaction, no Fact_Acct while the confirm is open); (iv) qty conserved (source minus = target plus); (ii)/(i) Fact_Acct balanced per schema AND per org,
//   value conserved - judged only if the Doc_Movement port (§60) is present, else "posting pending §60" (not faked); (v) a void/reversal nets every qty to zero.
//   A difference/scrapped qty is a NAMED gap (no MInventory model) - counted apart, never a pass. Zero judged prints INCONCLUSIVE, never PASS.
//   Negative controls (MUST turn red): LMC_BREAK=noguard (drops MMovement.completeIt :427-430) -> case (b); LMC_BREAK=noguardline (drops MMovementLine.beforeSave :182-188) -> case (d); LMC_BREAK=noconfirm -> case (a).
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node erp/tests/witness_movement_confirm.js   (no oracle needed)
'use strict';
var C = require('./dd_common.js'), fs = require('fs'), path = require('path');
var pass = 0, fail = 0, inc = 0, judged = 0, noted = 0, named = 0, pending = 0, BREAK = process.env.LMC_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var NOTE = function (id, javaRef, what) { noted++; log('  ◻ NOTED-AS-DESIGNED ' + id + ' ' + what + ' — legacy not runnable for this flow (§62); follows ' + javaRef); };
var NAMEDGAP = function (id, what) { named++; log('  ◼ NAMED-GAP ' + id + ' ' + what + ' (counted apart, not a pass)'); };

(async function main() {
  var H = await C.boot(), q = H.q, TODAY = H.TODAY;
  log('§MVC-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var hasConfirmTbl = !!H.one("SELECT name FROM sqlite_master WHERE name='m_movementconfirm'") && !!H.one("SELECT name FROM sqlite_master WHERE name='m_movementlineconfirm'");
  ok('S0', 'twin seed has m_movementconfirm + m_movementlineconfirm (erp/patches/ad_seed.db.sql §MOVCONFIRM-PORT)', hasConfirmTbl);
  var postPorted = /DOC\.m_movement\b|DOC\['m_movement'\]/.test(fs.readFileSync(path.join(H.ERP, 'model_post.js'), 'utf8'));
  log('§MVC-POST doc_movement_ported=' + postPorted + (postPorted ? '' : ' -> posting pending §60: Fact_Acct is not judged for the completed move, only "none while open"'));
  var DT = 9100143, HQ = 11, ST = 12, FROM = 101, TO = 102, PA = 124, PB = 123;
  var one = H.one, onhand = function (loc, p) { var r = one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=? AND m_product_id=?', [loc, p]); return Number(r.s); };
  var snap = function () { return { a1: onhand(FROM, PA), a2: onhand(TO, PA), b1: onhand(FROM, PB), b2: onhand(TO, PB) }; };
  var facts = function (id) { return q('SELECT c_acctschema_id AS s, ad_org_id AS o, SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr, COUNT(*) AS n FROM fact_acct WHERE ad_table_id=323 AND record_id=? GROUP BY 1,2', [id]); };
  var trxN = function (id) { return Number(one('SELECT COUNT(*) AS n FROM m_transaction WHERE m_movementline_id IN (SELECT m_movementline_id FROM m_movementline WHERE m_movement_id=?)', [id]).n); };
  var act = function (t, id, a) { return H.docAction(t, id, a, { noWorkflow: true }); };
  var seq = 0;
  // a fresh in-transit movement: 2 lines, inter-org (org 11 HQ -> org 12 Store Central), everything inside the caller's savepoint
  function fixture(qa, qb) {
    var d = one('SELECT * FROM c_doctype WHERE c_doctype_id=?', [143]);
    if (!one('SELECT 1 AS x FROM c_doctype WHERE c_doctype_id=?', [DT])) {
      var cols = Object.keys(d).filter(function (k) { return k !== 'c_doctype_id' && k !== 'c_doctype_uu'; });
      H.db.run('INSERT INTO c_doctype (c_doctype_id,' + cols.join(',') + ') SELECT ?,' + cols.join(',') + ' FROM c_doctype WHERE c_doctype_id=143', [DT]);
      H.db.run("UPDATE c_doctype SET isintransit='Y', name='Inventory Move (in transit) [twin fixture]' WHERE c_doctype_id=?", [DT]);
    }
    var h = H.save('m_movement', { AD_Org_ID: HQ, C_DocType_ID: DT, MovementDate: TODAY, DocAction: 'CO', IsInTransit: 'N' }); if (!h.ok) throw new Error('header: ' + (h.error || h.msg));
    var mid = H.lastId('m_movement');
    [[PA, qa, 10], [PB, qb, 20]].forEach(function (x) { var r = H.save('m_movementline', { m_movement_id: mid, AD_Org_ID: HQ, M_Product_ID: x[0], C_UOM_ID: 100, MovementQty: x[1], QtyEntered: x[1], M_Locator_ID: FROM, M_LocatorTo_ID: TO, Line: x[2] }); if (!r.ok) throw new Error('line: ' + (r.error || r.msg)); });
    return mid;
  }
  function confirmOf(mid) { return q('SELECT * FROM m_movementconfirm WHERE m_movement_id=?', [mid]); }
  var withSP = function (name, fn) { H.begin(name); try { return fn(); } catch (e) { ok('X-' + name, 'case ran to its end (a missing precondition is a failure, not a skip)', false, String(e && e.message).slice(0, 160)); } finally { H.rollback(name); } };

  if (hasConfirmTbl) {
    // ═ (a) prepare creates the confirm with equal lines ═══════════════════════════════════════════════════════════
    withSP('ca', function () {
      var mid = fixture(5, 8), pr = act('m_movement', mid, 'PR'), cf = confirmOf(mid), cls = cf[0] ? q('SELECT * FROM m_movementlineconfirm WHERE m_movementconfirm_id=? ORDER BY m_movementline_id', [cf[0].m_movementconfirm_id]) : [];
      var mls = q('SELECT * FROM m_movementline WHERE m_movement_id=? ORDER BY m_movementline_id', [mid]);
      var eq = cls.length === mls.length && mls.every(function (l, i) { return cls[i] && Number(cls[i].m_movementline_id) === Number(l.m_movementline_id) && Number(cls[i].targetqty) === Number(l.movementqty) && Number(cls[i].confirmedqty) === Number(l.movementqty) && Number(cls[i].differenceqty) === 0; });
      log('§MVC case=a prepare ok=' + pr.ok + ' status=' + pr.status + ' confirms=' + cf.length + ' lines confirm=' + cls.length + '/movement=' + mls.length + ' confirm docstatus=' + (cf[0] || {}).docstatus + ' processed=' + (cf[0] || {}).processed);
      NOTE('a', 'MMovement.java:355-356,:371-378 + MMovementConfirm.create :62-90', 'prepare of an in-transit movement creates ONE confirm, one line per movement line, Target=Confirmed=MovementQty');
      ok('a1', 'prepare of the in-transit movement -> IP (the twin used to refuse it)', pr.ok && pr.status === 'IP', 'status=' + pr.status + ' msg=' + pr.msg);
      ok('a2', 'exactly 1 confirm (Drafted, unprocessed, same org) with 2 lines, Target=Confirmed=MovementQty, Difference=0', cf.length === 1 && cf[0].docstatus === 'DR' && cf[0].processed === 'N' && Number(cf[0].ad_org_id) === HQ && eq, 'confirms=' + cf.length + ' eq=' + eq);
      var pr2 = act('m_movement', mid, 'PR');
      ok('a3', 'prepare again does not create a second confirm (createConfirmation :373-375)', pr2.ok && confirmOf(mid).length === 1, 'confirms=' + confirmOf(mid).length);
    });
    // ═ (b) complete with the confirm open ═════════════════════════════════════════════════════════════════════
    withSP('cb', function () {
      var mid = fixture(5, 8), s0 = snap(); act('m_movement', mid, 'PR'); var r = act('m_movement', mid, 'CO'), s1 = snap(), mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]);
      log('§MVC case=b complete-with-open-confirm ok=' + r.ok + ' status=' + mv.docstatus + ' msg=' + r.msg + ' processed=' + mv.processed + ' storage ' + JSON.stringify(s0) + ' -> ' + JSON.stringify(s1) + ' trx=' + trxN(mid) + ' facts=' + facts(mid).length);
      NOTE('b', 'MMovement.java:427-430 completeIt + :704-712 pendingConfirmations', 'completing the movement while its confirm is open stays InProgress with "@Open@: @M_MovementConfirm_ID@"');
      ok('b1', 'movement stays IP (not CO, not processed) with the open-confirm message', mv.docstatus === 'IP' && mv.processed === 'N' && /@Open@: @M_MovementConfirm_ID@/.test(String(r.msg)), 'status=' + mv.docstatus + ' processed=' + mv.processed + ' msg=' + r.msg);
      ok('b2', 'goods in transit stay at the source: storage of both products at source AND target unmoved', JSON.stringify(s0) === JSON.stringify(s1), JSON.stringify(s0) + ' vs ' + JSON.stringify(s1));
      ok('b3', 'no M_Transaction and no Fact_Acct while the confirm is open (nothing lost, nothing counted twice)', trxN(mid) === 0 && facts(mid).length === 0, 'trx=' + trxN(mid) + ' facts=' + facts(mid).length);
    });
    // ═ (c) complete the confirm -> movement completes; conservation ═══════════════════════════════════════════
    withSP('cc', function () {
      var mid = fixture(5, 8), s0 = snap(); act('m_movement', mid, 'PR'); var cf = confirmOf(mid)[0], r = act('m_movementconfirm', cf.m_movementconfirm_id, 'CO');
      var s1 = snap(), mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), cf1 = one('SELECT * FROM m_movementconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]);
      var dA1 = s1.a1 - s0.a1, dA2 = s1.a2 - s0.a2, dB1 = s1.b1 - s0.b1, dB2 = s1.b2 - s0.b2, ls = q('SELECT * FROM m_movementline WHERE m_movement_id=? ORDER BY line', [mid]);
      log('§MVC case=c confirm-complete ok=' + r.ok + ' confirm=' + cf1.docstatus + '/' + cf1.processed + ' movement=' + mv.docstatus + '/' + mv.processed + ' msg=' + r.msg + ' delta prodA src=' + dA1 + ' tgt=' + dA2 + ' prodB src=' + dB1 + ' tgt=' + dB2 + ' trx=' + trxN(mid) + ' lines target/confirmed=' + ls.map(function (l) { return l.targetqty + '/' + l.confirmedqty + '/' + l.movementqty; }).join(','));
      NOTE('c', 'MMovementConfirm.java:387-486 completeIt (processLine -> runDocumentActionWorkflow(move, Complete))', 'completing the confirm (full qty) completes the movement');
      ok('c1', 'confirm CO and processed; movement CO and processed', r.ok && cf1.docstatus === 'CO' && cf1.processed === 'Y' && mv.docstatus === 'CO' && mv.processed === 'Y', 'confirm=' + cf1.docstatus + ' movement=' + mv.docstatus);
      ok('c2', 'processLine copied Target/Confirmed back onto the movement lines (qty unchanged for a full confirm)', ls.length === 2 && Number(ls[0].targetqty) === 5 && Number(ls[0].confirmedqty) === 5 && Number(ls[0].movementqty) === 5 && Number(ls[1].targetqty) === 8 && Number(ls[1].movementqty) === 8, ls.map(function (l) { return l.targetqty + '/' + l.confirmedqty + '/' + l.movementqty; }).join(','));
      ok('c3', 'qty conserved (iv): source minus == target plus, per product (A -5/+5, B -8/+8), nothing else moved', dA1 === -5 && dA2 === 5 && dB1 === -8 && dB2 === 8 && dA1 + dA2 === 0 && dB1 + dB2 === 0, 'A ' + dA1 + '/' + dA2 + ' B ' + dB1 + '/' + dB2);
      ok('c4', 'M_Transaction: one M- and one M+ per line (4 rows), net 0', trxN(mid) === 4 && Number(one('SELECT COALESCE(SUM(movementqty),0) AS s FROM m_transaction WHERE m_movementline_id IN (SELECT m_movementline_id FROM m_movementline WHERE m_movement_id=?)', [mid]).s) === 0, 'trx=' + trxN(mid));
      var fx = facts(mid);
      if (!postPorted && fx.length === 0) { pending++; log('  ⏳ c5 Fact_Acct (i)(ii): posting pending §60 (Doc_Movement not in model_post) - NOT judged, NOT faked; facts=0'); }
      else if (fx.length === 0) ok('c5', 'Doc_Movement is ported but wrote NO Fact_Acct for the completed move', false, 'facts=0');
      else {
        var bal = fx.every(function (f) { return Math.abs(Number(f.dr) - Number(f.cr)) < 1e-6; }), orgs = fx.map(function (f) { return f.o; });
        ok('c5', 'Fact_Acct balanced per schema and per org (i)', bal, JSON.stringify(fx));
        var tot = q('SELECT SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr FROM fact_acct WHERE ad_table_id=323 AND record_id=?', [mid])[0];
        ok('c6', 'value conserved (ii): total debit == total credit over the transfer (inventory out of source == inventory into target)', Math.abs(Number(tot.dr) - Number(tot.cr)) < 1e-6, 'dr=' + tot.dr + ' cr=' + tot.cr + ' orgs=' + orgs.join(','));
      }
    });
    // ═ (d) line edits with a pending confirm ═════════════════════════════════════════════════════════════════
    withSP('cd', function () {
      var mid = fixture(5, 8); act('m_movement', mid, 'PR'); var ln = q('SELECT * FROM m_movementline WHERE m_movement_id=? ORDER BY line', [mid])[0];
      var e1 = H.update('m_movementline', ln.m_movementline_id, { movementqty: 3 }), e2 = H.save('m_movementline', { m_movement_id: mid, AD_Org_ID: HQ, M_Product_ID: PA, C_UOM_ID: 100, MovementQty: 1, QtyEntered: 1, M_Locator_ID: FROM, M_LocatorTo_ID: TO, Line: 30 }), e3 = H.update('m_movementline', ln.m_movementline_id, { description: 'note' });
      var after = one('SELECT movementqty FROM m_movementline WHERE m_movementline_id=?', [ln.m_movementline_id]);
      log('§MVC case=d qty-edit ok=' + e1.ok + ' err=' + (e1.error || e1.msg) + ' | new-line ok=' + e2.ok + ' err=' + (e2.error || e2.msg) + ' | description-edit ok=' + e3.ok + ' | movementqty after=' + after.movementqty);
      NOTE('d', 'MMovementLine.java:182-188 beforeSave', 'a line edit (MovementQty without TargetQty) or a new line is refused while a confirm is open; other fields stay editable');
      ok('d1', 'MovementQty edit refused ("@Open@: @M_MovementConfirm_ID@") and the quantity is unchanged', !e1.ok && /@Open@/.test(String(e1.error || e1.msg)) && Number(after.movementqty) === 5, 'ok=' + e1.ok + ' err=' + (e1.error || e1.msg) + ' qty=' + after.movementqty);
      ok('d2', 'a NEW line is refused alike', !e2.ok && /@Open@/.test(String(e2.error || e2.msg)), 'ok=' + e2.ok + ' err=' + (e2.error || e2.msg));
      ok('d3', 'the guard is not blanket: a Description edit is accepted', e3.ok, 'ok=' + e3.ok);
    });
    // ═ (e) difference / scrapped -> NAMED refusal ═════════════════════════════════════════════════════════════
    ['difference', 'scrapped'].forEach(function (kind, ki) {
      withSP('ce' + ki, function () {
        var mid = fixture(5, 8), s0 = snap(); act('m_movement', mid, 'PR'); var cf = confirmOf(mid)[0], cl = q('SELECT * FROM m_movementlineconfirm WHERE m_movementconfirm_id=? ORDER BY m_movementline_id', [cf.m_movementconfirm_id])[0];
        var u = H.update('m_movementlineconfirm', cl.m_movementlineconfirm_id, kind === 'difference' ? { confirmedqty: 3 } : { scrappedqty: 1 }), cl1 = one('SELECT * FROM m_movementlineconfirm WHERE m_movementlineconfirm_id=?', [cl.m_movementlineconfirm_id]);
        var r = act('m_movementconfirm', cf.m_movementconfirm_id, 'CO'), mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), cf1 = one('SELECT * FROM m_movementconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]);
        log('§MVC case=e-' + kind + ' line save ok=' + u.ok + ' difference=' + cl1.differenceqty + ' | confirm-complete ok=' + r.ok + ' status=' + r.status + ' msg=' + r.msg + ' | movement=' + mv.docstatus + ' storage unmoved=' + (JSON.stringify(s0) === JSON.stringify(snap())));
        NOTE('e-' + kind, 'MMovementConfirm.java:430-445 + createDifferenceDoc :497-600 (legacy creates an MInventory difference doc)', 'a ' + kind + ' quantity');
        ok('e1-' + kind, 'MMovementLineConfirm.beforeSave sets Difference = Target - Confirmed (' + (kind === 'difference' ? '5-3=2' : 'scrapped saved as given') + ')', u.ok && Number(cl1.differenceqty) === (kind === 'difference' ? 2 : 0), 'difference=' + cl1.differenceqty);
        var refused = !r.ok && r.status === 'IN' && /not ported - named/.test(String(r.msg)) && /MInventory/.test(String(r.msg));
        ok('e2-' + kind, 'confirm completion is REFUSED with a named message (never silent), nothing moved, movement still IP, confirm still open', refused && JSON.stringify(s0) === JSON.stringify(snap()) && mv.docstatus === 'IP' && cf1.processed === 'N', 'status=' + r.status + ' msg=' + String(r.msg).slice(0, 120));
        if (refused) NAMEDGAP('e-' + kind, 'MInventory difference document (MMovementConfirm.createDifferenceDoc) - no MInventory model in the twin');
      });
    });
    // ═ (f) void of the confirm ═══════════════════════════════════════════════════════════════════════════════
    withSP('cf', function () {
      var mid = fixture(5, 8), s0 = snap(); act('m_movement', mid, 'PR'); var cf = confirmOf(mid)[0], r = act('m_movementconfirm', cf.m_movementconfirm_id, 'VO');
      var mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), cf1 = one('SELECT * FROM m_movementconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]);
      var qsum = Number(one('SELECT COALESCE(SUM(movementqty),0) AS s FROM m_movementline WHERE m_movement_id=?', [mid]).s), cq = Number(one('SELECT COALESCE(SUM(targetqty)+SUM(confirmedqty)+SUM(scrappedqty)+SUM(differenceqty),0) AS s FROM m_movementlineconfirm WHERE m_movementconfirm_id=?', [cf.m_movementconfirm_id]).s);
      log('§MVC case=f void-confirm(open) ok=' + r.ok + ' confirm=' + cf1.docstatus + ' movement=' + mv.docstatus + ' msg=' + r.msg + ' movement qty sum=' + qsum + ' confirm qty sum=' + cq + ' storage unmoved=' + (JSON.stringify(s0) === JSON.stringify(snap())) + ' trx=' + trxN(mid) + ' facts=' + facts(mid).length);
      NOTE('f', 'MMovementConfirm.java:608-651 voidIt (zero the confirm lines, mark processed, void the movement)', 'voiding the open confirm voids the movement');
      ok('f1', 'confirm VO and movement VO (both processed)', r.ok && cf1.docstatus === 'VO' && mv.docstatus === 'VO' && mv.processed === 'Y', 'confirm=' + cf1.docstatus + ' movement=' + mv.docstatus);
      ok('f2', 'quantities net to zero (v): movement lines 0, confirm lines 0, storage unmoved, no transaction, no fact', qsum === 0 && cq === 0 && JSON.stringify(s0) === JSON.stringify(snap()) && trxN(mid) === 0 && facts(mid).length === 0, 'mvqty=' + qsum + ' cqty=' + cq);
    });
    withSP('cf2', function () {
      var mid = fixture(5, 8), s0 = snap(); act('m_movement', mid, 'PR'); var cf = confirmOf(mid)[0]; act('m_movementconfirm', cf.m_movementconfirm_id, 'CO');
      var sMid = snap(), r = act('m_movementconfirm', cf.m_movementconfirm_id, 'VO'), s2 = snap(), mv = one('SELECT * FROM m_movement WHERE m_movement_id=?', [mid]), rev = one('SELECT * FROM m_movement WHERE reversal_id=?', [mid]);
      var net = Number(one('SELECT COALESCE(SUM(movementqty),0) AS s FROM m_transaction WHERE m_movementline_id IN (SELECT m_movementline_id FROM m_movementline WHERE m_movement_id IN (SELECT m_movement_id FROM m_movement WHERE m_movement_id=? OR reversal_id=?))', [mid, mid]).s);
      log('§MVC case=f2 void-confirm(after complete) ok=' + r.ok + ' msg=' + r.msg + ' movement=' + mv.docstatus + ' reversal=' + (rev ? rev.docstatus : 'none') + ' storage mid=' + JSON.stringify(sMid) + ' end=' + JSON.stringify(s2) + ' net trx qty=' + net);
      NOTE('f2', 'MMovementConfirm.java:608-651 voidIt -> MMovement.voidIt :843-866 reverseCorrect', 'voiding the completed confirm reverses the movement');
      ok('f3', 'movement reversed (RE) with a reversal document; storage back to the start (v)', r.ok && mv.docstatus === 'RE' && !!rev && JSON.stringify(s0) === JSON.stringify(s2), 'movement=' + mv.docstatus + ' rev=' + (rev && rev.docstatus) + ' start=' + JSON.stringify(s0) + ' end=' + JSON.stringify(s2));
      ok('f4', 'every M_Transaction nets to zero across original + reversal', net === 0 && trxN(mid) === 4, 'net=' + net + ' trx=' + trxN(mid));
      var fx = q('SELECT SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr, COUNT(*) AS n FROM fact_acct WHERE ad_table_id=323 AND record_id IN (?, ?)', [mid, rev ? rev.m_movement_id : -1])[0];
      if (!postPorted && Number(fx.n) === 0) { pending++; log('  ⏳ f5 reversal Fact_Acct net zero: posting pending §60 - NOT judged'); }
      else ok('f5', 'reversal nets every fact to zero (debits == credits over original + reversal, and per account)', Number(fx.n) > 0 && Math.abs(Number(fx.dr) - Number(fx.cr)) < 1e-6 && Number(one('SELECT COALESCE(SUM(amtacctdr-amtacctcr),0) AS s FROM fact_acct WHERE ad_table_id=323 AND record_id IN (?, ?)', [mid, rev ? rev.m_movement_id : -1]).s) === 0, JSON.stringify(fx));
    });
  }
  var verdict = judged === 0 ? 'INCONCLUSIVE' : (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS');
  log('§MVC-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' named_gaps=' + named + ' posting_pending_§60=' + pending + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MVC-FATAL ' + (e && e.stack || e)); process.exit(2); });
