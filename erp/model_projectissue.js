// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_projectissue.js -- MProjectIssue (org.adempiere.base/src/org/compiere/model/MProjectIssue.java, iDempiere 13), registered into the generic ModelLayer like every other M* class.
//   bim-ootb prompts/CAPEX_DASHBOARD.md §5.60 finding 3: the twin had NO c_projectissue table, so the dashboard's actual-cost source (completed Project Issues) did not exist on the twin. Witness: capex/tests/witness_project_issue.js.
//   DocActionDelegate (:121-126): Complete -> doComplete (:178-296), Reverse Correct / Accrual -> doReverse (:298-345). The legacy path of the film test data creates the row and completes it by DocAction (BridgeCreateProjectIssue,
//   BridgeCompleteProjectIssue), so that is the path ported; the AD_Process ProjectIssue (receipt / expense / project line variants) is NOT in this file: named in the spec.
//   NOT PORTED here, named (not faked): periodClosedCheckForBackDateTrx (:187-193), MStorageOnHand.getDateMaterialPolicy for an instance (:222-225), the s_timeexpenseline / m_inoutline cost branches of updateBalanceAmt (:559-566).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelProjectIssue = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = ML.D, N = ML.N, Z = D(0);
  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  function Y(v) { return v === 'Y' || v === true; }
  function mod(n) { var NODE = typeof module !== 'undefined' && module.exports; return NODE ? require('./' + n) : (typeof window !== 'undefined' ? window : globalThis)[{ model_asi: 'ModelAsi', model_cost: 'ModelCost', model_master: 'ModelMaster' }[n]]; }

  // updateBalanceAmt :543-595: cost = MCost.getCost(product, asi, as, org, costingMethod, MovementQty, 0, true, MovementDate, null, false) -> project.ProjectBalanceAmt += cost
  function updateBalanceAmt(trx, pi) {
    var MC = mod('model_cost'), MM = mod('model_master'), p = T.product(trx, pi.m_product_id), as = MM.clientAcctSchemas(trx, pi.ad_client_id)[0], cost = null;
    if (nz(pi.m_inoutline_id) || nz(pi.s_timeexpenseline_id)) trx.say('§MODEL-UNPORTED-DEP MProjectIssue.updateBalanceAmt inOutLine.getPOCost / expenseLine.getLaborCost (:559-566) - cost taken from MCost like the plain issue');
    cost = MC.getProductCosts(trx, p, pi.m_attributesetinstance_id || 0, as, pi.ad_org_id, null, D(pi.movementqty), 0, true, pi.movementdate, null, false);
    if (cost != null) { var proj = trx.get('c_project', pi.c_project_id); trx.update('c_project', proj, { projectbalanceamt: N(D(proj.projectbalanceamt).add(D(cost))) }); }
    if (Number(pi.reversal_id || 0) < 0 && (cost == null || D(cost).signum() <= 0)) throw new Error('Product: (' + p.name + ') is not present at Locator: (' + pi.m_locator_id + ') for ASI: (' + (pi.m_attributesetinstance_id || 0) + ')');   // :583-592 literally `getReversal_ID() < 0`: a NEGATIVE id only (the Java never tests an unset id), so a plain issue never throws here
    return cost;
  }
  // doComplete :178-296
  function doComplete(trx, pi) {
    if (!nz(pi.m_product_id)) { trx.say('§MODEL-SEVERE MProjectIssue No Product'); return 'No Product'; }
    var p = T.product(trx, pi.m_product_id);
    if (!T.isStocked(p)) { trx.update('c_projectissue', pi, { processed: 'Y' }); updateBalanceAmt(trx, trx.get('c_projectissue', pi.c_projectissue_id)); return null; }   // :205-210 not stocked: no transaction, no storage
    var qty = D(pi.movementqty), loc = trx.get('m_locator', pi.m_locator_id), ok = true, dateMPolicy = pi.movementdate;
    if (qty.negate().signum() < 0) {                                                                                       // :230-263 an issue (positive MovementQty) takes the storage rows in material-policy order
      var ASI = mod('model_asi'), proj = trx.get('c_project', pi.c_project_id), whId = nz(pi.m_locator_id) ? loc.m_warehouse_id : proj.m_warehouse_id, toIssue = qty;
      ASI.storages(trx, { warehouseId: whId, productId: pi.m_product_id, asiId: pi.m_attributesetinstance_id || 0, minGuaranteeDate: pi.movementdate, fifo: ASI.mmFifo(trx, p), positiveOnly: true, locatorId: pi.m_locator_id }).some(function (s) {
        var have = D(s.qtyonhand);
        if (have.compareTo(toIssue) >= 0) { trx.update('m_storageonhand', s, { qtyonhand: N(have.subtract(toIssue)) }); toIssue = Z; }
        else { toIssue = toIssue.subtract(have); trx.update('m_storageonhand', s, { qtyonhand: 0 }); }
        return toIssue.signum() === 0;
      });
      if (toIssue.signum() > 0) { var e = T.storageAdd(trx, pi.m_locator_id, pi.m_product_id, pi.m_attributesetinstance_id || 0, toIssue.negate(), dateMPolicy); if (e) ok = false; }   // :258-262 the remainder (can go negative where the warehouse allows)
    } else { var e2 = T.storageAdd(trx, pi.m_locator_id, pi.m_product_id, pi.m_attributesetinstance_id || 0, qty.negate(), dateMPolicy); if (e2) ok = false; }                    // :264-270 a reversal puts it back
    if (!ok) { trx.say('§MODEL-SEVERE MProjectIssue Storage not updated'); return 'Storage not updated'; }
    trx.insert('m_transaction', ML.newPO(trx, 'm_transaction', { ad_org_id: pi.ad_org_id, movementtype: 'W+', m_locator_id: pi.m_locator_id, m_product_id: pi.m_product_id,
      m_attributesetinstance_id: pi.m_attributesetinstance_id || 0, movementqty: N(qty.negate()), movementdate: pi.movementdate, c_projectissue_id: pi.c_projectissue_id }));   // :213-218 MTransaction WorkOrder+ (-qty)
    updateBalanceAmt(trx, trx.get('c_projectissue', pi.c_projectissue_id));                                                                                               // :279
    return null;
  }
  // doReverse :298-345 (accrual = today's date, else the issue's own)
  function doReverse(trx, pi, accrual) {
    var rdate = accrual ? String(trx.env.date).slice(0, 10) + ' 00:00:00' : pi.movementdate, rid = ML.newPO(trx, 'c_projectissue', { ad_org_id: pi.ad_org_id, c_project_id: pi.c_project_id, m_locator_id: pi.m_locator_id, m_product_id: pi.m_product_id,
      m_attributesetinstance_id: pi.m_attributesetinstance_id || 0, movementqty: N(D(pi.movementqty).negate()), movementdate: rdate, description: 'Reversal for Line No ' + pi.line + '<' + pi.c_projectissue_id + '>', reversal_id: pi.c_projectissue_id });
    var rev = trx.insert('c_projectissue', rid), r = ML.processIt(trx, 'c_projectissue', rev.c_projectissue_id, 'CO');
    if (!r.ok) { trx.say('Reversal ERROR: ' + r.msg); return false; }
    var fresh = trx.get('c_projectissue', rev.c_projectissue_id); trx.update('c_projectissue', fresh, { docstatus: 'RE', docaction: '--', processing: 'N' });                           // :326-333
    trx.update('c_projectissue', trx.get('c_projectissue', pi.c_projectissue_id), { reversal_id: rev.c_projectissue_id, docstatus: 'RE', docaction: '--' });                           // :334-336
    return true;
  }
  var MProjectIssue = {
    prepareIt: function (trx, pi) { if (pi.docaction !== 'CO') trx.update('c_projectissue', pi, { docaction: 'CO' }); return 'IP'; },     // DocActionDelegate.prepareIt: nothing to check, In Progress
    completeIt: function (trx, pi) {
      var m; try { m = doComplete(trx, pi); } catch (e) { trx.say('§MODEL-SEVERE MProjectIssue.completeIt ' + (e && e.message)); T.msg(trx, String(e && e.message)); return 'IN'; }
      if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('c_projectissue', trx.get('c_projectissue', pi.c_projectissue_id), { processed: 'Y', docaction: 'CL', isapproved: 'Y' });
      return 'CO';
    },
    reverseCorrectIt: function (trx, pi) { return doReverse(trx, pi, false); },
    reverseAccrualIt: function (trx, pi) { return doReverse(trx, pi, true); }
  };
  ML.registerModel('c_projectissue', {
    initialDefaults: { movementqty: 0, posted: 'N', processed: 'N', docstatus: 'DR', docaction: 'CO', isapproved: 'N' }, initialClock: ['movementdate'],               // setInitialDefaults :77-82 (+ the DocStatus/DocAction column defaults)
    beforeSave: function (trx, pi, isNew) { if (isNew && !nz(pi.line)) { var mx = 0; trx.find('c_projectissue', { c_project_id: pi.c_project_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line || 0)); }); pi.line = mx + 10; } return null; }   // getNextLine :148-153
  });
  ML.registerDocAction('c_projectissue', MProjectIssue);
  return { MProjectIssue: MProjectIssue, updateBalanceAmt: updateBalanceAmt };
});
