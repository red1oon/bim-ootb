// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * inout_confirm.js — the CONFIRMATION-LAYER fold (POS_ADDON_SPEC.md §P-12 pick gate,
 * POS_ENGINE_LANE.md §E-5): m_inoutconfirm / m_inoutlineconfirm as pure derivations.
 *
 * Implementing docs/POS_ADDON_SPEC.md §P-12 — Witness: W-WH-CONFIRM.
 *
 * ORACLE (verbatim-source rule-consistency — the real iDempiere Java read line-by-line at
 * ~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/, 2026-06-12;
 * the PG-replay drive of B-1/B-2 is NOT used here — GardenWorld carries no completed
 * confirmation cycle to diff against, a NAMED omission):
 *   MInOut.prepareIt            :1551  → createConfirmation() spawns the confirm doc(s)
 *   MInOut.createConfirmation   :1175  → pick (PC) first, then ship (SC); none needed → no-op
 *   MInOut.completeIt gate      :1648  → unprocessed confirm ⇒ "@Open@: @M_InOutConfirm_ID@",
 *                                        STATUS_InProgress — the InOut WAITS; storage update is
 *                                        below the gate, so ON-HAND MOVES AT CONFIRM-COMPLETE
 *   MInOut.pendingCustomerConfirmations :2203 → CustomerConfirmation (XC) does NOT block (the
 *                                        seed's own anchor: inout 108 is CO with an unprocessed XC)
 *   MInOutConfirm.create        :static → one confirm line per ship line; TargetQty=MovementQty,
 *                                        ConfirmedQty=TargetQty ("suggestion", setInOutLine)
 *   MInOutConfirm.completeIt    :394-480→ per line processLine; fully-confirmed ⇒ processed;
 *                                        else createDifferenceDoc; then Processed=Y, DocStatus CO
 *   MInOutLineConfirm.processLine       → PickQA: Target/Movement/Picked/Scrapped onto the ship
 *                                        line (MovementQty = ConfirmedQty); ShipReceipt: +scrap on
 *                                        the PO side only; XC/XV: ConfirmedQty echo only
 *   MInOutLineConfirm.beforeSave:202    → DifferenceQty = Target − Confirmed − Scrapped
 *   MInOutConfirm.createDifferenceDoc :604-669 →
 *        difference ≠ 0 AND !isSOTrx AND Ref_InOut_ID ≠ 0  ⇒ AP CREDIT MEMO line @ difference
 *        scrapped  ≠ 0                                     ⇒ M_Inventory difference line @ scrapped
 *        SO-side difference, no scrap ⇒ NO document — the ship line's MovementQty is simply
 *        REDUCED to ConfirmedQty (the difference stays recorded on the confirm line). EXTRACTED,
 *        not invented: those are the only two branches in the real method.
 *   Split-shipment (isInDispute + IsSplitWhenDifference :416-431) — NOT folded: seed doctypes
 *        147/148 carry IsSplitWhenDifference='N', no seed data exercises it (named omission).
 *
 * Separation contract (pos_core house rules): PURE — no DB import, no Date.now/Math.random/DOM.
 * Ids are caller-supplied deterministic inputs (the nextIds discipline). Ops ride the EXISTING
 * kernel shapes (CREATE_DOCUMENT/CREATE_LINE/UPDATE_LINE/SET_STATUS) — newVerbs=[].
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.InOutConfirm = factory();
})(typeof window !== 'undefined' ? window : this, function () {

  // the dictionary list codes (X_M_InOutConfirm:205-213, verbatim)
  var TYPES = { DropShip: 'DS', PickQA: 'PC', ShipReceipt: 'SC', Customer: 'XC', Vendor: 'XV' };

  // ── which confirmations a doctype demands (MInOut.createConfirmation:1179-1180 reads the dt row) ──
  function confirmPolicy(dt) {
    return { pick: dt.ispickqaconfirm === 'Y', ship: dt.isshipconfirm === 'Y' };
  }

  // ── the prepareIt SPAWN (MInOut.prepareIt:1551 → createConfirmation:1175-1227) ─────────────────
  // Returns the op group creating the NEXT needed confirmation, or [] when none is needed.
  // Pick (PC) first, then ship (SC) — "Create Both .. after each other" (:1187): the SC doc is only
  // spawned once the PC doc is processed. existing = the m_inoutconfirm rows already on this inout.
  // opts = { confirmId, lineIdOf(i) } — deterministic, caller-counted (the nextIds discipline).
  function createConfirmationOps(inout, inoutLines, dt, existing, opts) {
    var p = confirmPolicy(dt);
    if (!p.pick && !p.ship) return [];                                     // "No need" (:1183)
    var have = { PC: null, SC: null };
    (existing || []).forEach(function (c) { if (have[c.confirmtype] === null || c.confirmtype in have) have[c.confirmtype] = c; });
    var type = null;
    if (p.pick && p.ship) {
      if (have.PC && have.PC.processed !== 'Y') return [];                 // "wait until done" (:1199)
      if (!have.PC) type = TYPES.PickQA;
      else if (!have.SC) type = TYPES.ShipReceipt;
      else return [];
    } else if (p.pick) { if (have.PC) return []; type = TYPES.PickQA; }
    else { if (have.SC) return []; type = TYPES.ShipReceipt; }

    // header — dictionary defaults: DocStatus=DR, DocAction=CO, IsInDispute=N (AD_Column.defaultvalue);
    // client/org INHERITED from the parent shipment (the real ctor: new MInOutConfirm(ship, type));
    // IsCancelled=N (ctor initialization, anchored by the seed's own confirm row 100);
    // DocumentNo/audit = substrate-stamped at fold (the same named omission as every CRUD_CREATE)
    var ops = [{
      op_type: 'CREATE_DOCUMENT', table: 'M_InOutConfirm',
      m_inoutconfirm_id: opts.confirmId, m_inout_id: inout.m_inout_id, confirmtype: type,
      ad_client_id: inout.ad_client_id, ad_org_id: inout.ad_org_id,
      docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', isindispute: 'N',
      iscancelled: 'N', isactive: 'Y'
    }];
    // one confirm line per ship line; TargetQty=MovementQty, ConfirmedQty=TargetQty (the SUGGESTION —
    // MInOutLineConfirm.setInOutLine, anchored by the seed's own row 100: target=10 confirmed=10)
    inoutLines.forEach(function (l, i) {
      ops.push({
        op_type: 'CREATE_LINE', table: 'M_InOutLineConfirm',
        m_inoutlineconfirm_id: opts.lineIdOf(i), m_inoutconfirm_id: opts.confirmId,
        ad_client_id: inout.ad_client_id, ad_org_id: inout.ad_org_id,
        m_inoutline_id: l.m_inoutline_id, targetqty: l.movementqty, confirmedqty: l.movementqty,
        differenceqty: 0, scrappedqty: 0, processed: 'N', isactive: 'Y'
      });
    });
    return ops;
  }

  // ── DifferenceQty = Target − Confirmed − Scrapped (MInOutLineConfirm.beforeSave:202-205) ──
  function differenceQty(cl) {
    return Number(cl.targetqty) - Number(cl.confirmedqty) - Number(cl.scrappedqty || 0);
  }

  // ── the completeIt GATE (MInOut.completeIt:1648 / pendingCustomerConfirmations:2203) ──────────
  // An unprocessed confirm BLOCKS completion → the InOut answers IP and waits. EXCEPTION extracted
  // verbatim: ConfirmType XC (CustomerConfirmation) never blocks (:2208 `continue`).
  function completeInOutGate(confirms) {
    var open = (confirms || []).filter(function (c) {
      return c.processed !== 'Y' && c.confirmtype !== TYPES.Customer;
    });
    if (open.length) {
      return { ok: false, status: 'IP', reason: '@Open@: @M_InOutConfirm_ID@', open: open.map(function (c) { return c.m_inoutconfirm_id; }) };
    }
    return { ok: true };
  }

  // ── processLine (MInOutLineConfirm.processLine, verbatim per type) ─────────────────────────────
  // Returns the SHIP-LINE column updates the confirm type writes. PickQA: MovementQty BECOMES the
  // confirmed qty (the on-hand spine therefore moves by what was PICKED, not what was asked).
  function processConfirmLine(confirmType, cl, isSOTrx) {
    if (confirmType === TYPES.Customer || confirmType === TYPES.Vendor) return { confirmedqty: cl.confirmedqty };
    if (confirmType === TYPES.DropShip) return {};
    if (confirmType === TYPES.PickQA) {
      return { targetqty: cl.targetqty, movementqty: cl.confirmedqty, pickedqty: cl.confirmedqty, scrappedqty: cl.scrappedqty || 0 };
    }
    if (confirmType === TYPES.ShipReceipt) {
      var qty = Number(cl.confirmedqty) + (isSOTrx ? 0 : Number(cl.scrappedqty || 0));   // PO side owns scrap (:processLine)
      return { targetqty: cl.targetqty, movementqty: qty, scrappedqty: cl.scrappedqty || 0 };
    }
    throw new Error('unknown ConfirmType ' + confirmType);
  }

  // ── MInOutConfirm.completeIt as ONE op group (:394-480 + createDifferenceDoc:604-669) ──────────
  // confirm = the m_inoutconfirm row; confirmLines = its lines WITH the operator's keyed
  // confirmedqty/scrappedqty; inout = {m_inout_id, issotrx, ref_inout_id, m_warehouse_id}.
  // opts = { inventoryId, inventoryLineIdOf(i), creditMemoId, creditMemoLineIdOf(i) } — deterministic.
  // Returns { ok, ops, fullyConfirmed, differences } or an honest refusal.
  function completeConfirmOps(confirm, confirmLines, inout, dt, opts) {
    if (!confirmLines || !confirmLines.length) return { ok: false, reason: 'no-lines' };          // prepareIt:340 @NoLines@
    if (confirm.processed === 'Y') return { ok: false, reason: 'already-processed' };
    var anyDispute = confirmLines.some(function (cl) { return differenceQty(cl) !== 0 || Number(cl.scrappedqty || 0) !== 0; });
    if (anyDispute && dt && dt.issplitwhendifference === 'Y') {
      // :425 — split needs C_DocTypeDifference_ID; seed doctypes carry N → the split path is a named,
      // honest refusal here rather than an invented split (no seed data exercises it)
      return { ok: false, reason: 'split-when-difference-not-folded', detail: 'IsSplitWhenDifference=Y needs C_DocTypeDifference_ID; no seed case' };
    }
    var ops = [], differences = [], inv = null, cm = null;
    confirmLines.forEach(function (cl, i) {
      var upd = processConfirmLine(confirm.confirmtype, cl, inout.issotrx === 'Y');
      var shipUpd = { op_type: 'UPDATE_LINE', table: 'M_InOutLine', id: cl.m_inoutline_id };
      Object.keys(upd).forEach(function (k) { shipUpd[k] = upd[k]; });
      ops.push(shipUpd);
      var diff = differenceQty(cl);
      var confUpd = { op_type: 'UPDATE_LINE', table: 'M_InOutLineConfirm', id: cl.m_inoutlineconfirm_id, differenceqty: diff, processed: 'Y' };
      if (diff === 0 && Number(cl.scrappedqty || 0) === 0) { ops.push(confUpd); return; }          // isFullyConfirmed → processed
      // createDifferenceDoc (:604) — the ONLY two branches of the real method:
      if (diff !== 0 && inout.issotrx !== 'Y' && inout.ref_inout_id) {                             // :611 PO-side linked doc → AP credit memo
        if (!cm) { cm = { op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', c_invoice_id: opts.creditMemoId, docbasetype: 'APC', ref_m_inoutconfirm_id: confirm.m_inoutconfirm_id }; ops.push(cm); }
        ops.push({ op_type: 'CREATE_LINE', table: 'C_InvoiceLine', c_invoiceline_id: opts.creditMemoLineIdOf(i), c_invoice_id: opts.creditMemoId, m_inoutline_id: cl.m_inoutline_id, qtyinvoiced: diff });
        confUpd.c_invoiceline_id = opts.creditMemoLineIdOf(i);
      }
      if (Number(cl.scrappedqty || 0) !== 0) {                                                     // :637 scrap → inventory difference doc
        if (!inv) { inv = { op_type: 'CREATE_DOCUMENT', table: 'M_Inventory', m_inventory_id: opts.inventoryId, m_warehouse_id: inout.m_warehouse_id, ref_m_inoutconfirm_id: confirm.m_inoutconfirm_id }; ops.push(inv); }
        ops.push({ op_type: 'CREATE_LINE', table: 'M_InventoryLine', m_inventoryline_id: opts.inventoryLineIdOf(i), m_inventory_id: opts.inventoryId, m_inoutline_id: cl.m_inoutline_id, m_product_id: cl.m_product_id, qtyinternaluse: cl.scrappedqty });
        confUpd.m_inventoryline_id = opts.inventoryLineIdOf(i);
      }
      // SO-side difference without scrap: NO document — MovementQty was reduced above (extracted rule)
      ops.push(confUpd);
      differences.push({ m_inoutline_id: cl.m_inoutline_id, differenceqty: diff, scrappedqty: Number(cl.scrappedqty || 0) });
    });
    ops.push({ op_type: 'SET_STATUS', table: 'M_InOutConfirm', id: confirm.m_inoutconfirm_id, doc_status: 'CO', processed: 'Y' });
    return { ok: true, ops: ops, fullyConfirmed: differences.length === 0, differences: differences, newVerbs: [] };
  }

  return {
    TYPES: TYPES, confirmPolicy: confirmPolicy, createConfirmationOps: createConfirmationOps,
    differenceQty: differenceQty, completeInOutGate: completeInOutGate,
    processConfirmLine: processConfirmLine, completeConfirmOps: completeConfirmOps
  };
});
