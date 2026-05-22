// handlers/construction.js — Implementing SpatialERP_POC.md §5 — Witness: W-SERP-P2
// Stateless lead lifecycle handlers. Each: read → compute → commitOp → return.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // ── Helper: update metadata sub_status ──────────────────────────

  function _setSubStatus(db, docId, subStatus) {
    var r = db.exec('SELECT metadata FROM documents WHERE id = ?', [docId]);
    if (!r.length || !r[0].values.length) return null;
    var meta = JSON.parse(r[0].values[0][0] || '{}');
    meta.sub_status = subStatus;
    db.run('UPDATE documents SET metadata = ? WHERE id = ?',
      [JSON.stringify(meta), docId]);
    return meta;
  }

  function _getMetadata(db, docId) {
    var r = db.exec('SELECT metadata FROM documents WHERE id = ?', [docId]);
    if (!r.length || !r[0].values.length) return null;
    return JSON.parse(r[0].values[0][0] || '{}');
  }

  // ── 1. screenLead ───────────────────────────────────────────────
  // DRAFT → IN_PROGRESS, sub_status = SCREENING

  function screenLead(db, leadId, screenedBy) {
    console.log('§HANDLER_LEAD_SCREEN enter lead=' + leadId + ' screened_by=' + (screenedBy || ''));
    var result = DocEngine.transition(db, leadId, 'start');
    if (!result) {
      console.log('§HANDLER_LEAD_SCREEN transition failed lead=' + leadId);
      return null;
    }
    _setSubStatus(db, leadId, 'SCREENING');
    KernelOps.commitOp(db, 'LEAD_SCREEN', {
      lead_id: leadId, screened_by: screenedBy || '',
      old_status: result.old_status, new_status: result.new_status
    });
    console.log('§HANDLER_LEAD_SCREEN done lead=' + leadId + ' status=IN_PROGRESS sub=SCREENING');
    return result;
  }

  // ── 2. planFAR ──────────────────────────────────────────────────
  // sub_status = FAR, creates DEV_PLAN document if not exists

  function planFAR(db, leadId, farData) {
    console.log('§HANDLER_FAR_PLAN enter lead=' + leadId + ' far_value=' + (farData && farData.far_value));
    var meta = _getMetadata(db, leadId);
    if (!meta) { console.log('§HANDLER_FAR_PLAN lead not found'); return null; }

    _setSubStatus(db, leadId, 'FAR');

    // Create or update DEV_PLAN linked to lead
    var devId = 'DEV-' + leadId.replace('LEAD-', '');
    var existing = db.exec('SELECT id FROM documents WHERE id = ?', [devId]);
    if (!existing.length || !existing[0].values.length) {
      var devMeta = Object.assign({ lead_ref: leadId }, farData || {});
      db.run(
        'INSERT INTO documents (id, doc_type, doc_status, created, description, metadata) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
        [devId, 'DEV_PLAN', 'DRAFT', new Date().toISOString(),
         'Development Plan for ' + leadId, JSON.stringify(devMeta)]
      );
      console.log('§HANDLER_FAR_PLAN created dev_plan=' + devId);
    } else {
      // Update existing DEV_PLAN metadata with FAR data
      var devR = db.exec('SELECT metadata FROM documents WHERE id = ?', [devId]);
      var devMeta2 = JSON.parse(devR[0].values[0][0] || '{}');
      Object.assign(devMeta2, farData || {});
      db.run('UPDATE documents SET metadata = ? WHERE id = ?',
        [JSON.stringify(devMeta2), devId]);
      console.log('§HANDLER_FAR_PLAN updated dev_plan=' + devId);
    }

    KernelOps.commitOp(db, 'FAR_PLAN', {
      lead_id: leadId, dev_plan_id: devId,
      far_value: farData && farData.far_value,
      dev_area: farData && farData.total_dev_area
    });
    console.log('§HANDLER_FAR_PLAN done lead=' + leadId + ' sub=FAR');
    return { dev_plan_id: devId, far_data: farData };
  }

  // ── 3. submitApproval ───────────────────────────────────────────
  // sub_status = APPROVAL

  function submitApproval(db, leadId, submittedBy) {
    console.log('§HANDLER_SUBMIT_APPROVAL enter lead=' + leadId);
    var meta = _getMetadata(db, leadId);
    if (!meta) return null;
    _setSubStatus(db, leadId, 'APPROVAL');
    KernelOps.commitOp(db, 'SUBMIT_APPROVAL', {
      lead_id: leadId, submitted_by: submittedBy || ''
    });
    console.log('§HANDLER_SUBMIT_APPROVAL done lead=' + leadId + ' sub=APPROVAL');
    return { sub_status: 'APPROVAL' };
  }

  // ── 4. approve ──────────────────────────────────────────────────
  // sub_status = BOQ (approved, ready for BOQ generation)

  function approve(db, leadId, approvedBy) {
    console.log('§HANDLER_LEAD_APPROVE enter lead=' + leadId);
    var meta = _getMetadata(db, leadId);
    if (!meta) return null;
    _setSubStatus(db, leadId, 'BOQ');
    KernelOps.commitOp(db, 'LEAD_APPROVE', {
      lead_id: leadId, approved_by: approvedBy || ''
    });
    console.log('§HANDLER_LEAD_APPROVE done lead=' + leadId + ' sub=BOQ');
    return { sub_status: 'BOQ' };
  }

  // ── 5. reject ───────────────────────────────────────────────────
  // transition → VOIDED

  function reject(db, leadId, reason) {
    console.log('§HANDLER_LEAD_REJECT enter lead=' + leadId + ' reason=' + (reason || ''));
    var result = DocEngine.transition(db, leadId, 'void');
    if (!result) {
      console.log('§HANDLER_LEAD_REJECT transition failed lead=' + leadId);
      return null;
    }
    KernelOps.commitOp(db, 'LEAD_REJECT', {
      lead_id: leadId, reason: reason || '',
      old_status: result.old_status, new_status: result.new_status
    });
    console.log('§HANDLER_LEAD_REJECT done lead=' + leadId + ' status=VOIDED');
    return result;
  }

  // ── 6. generateBOQ ─────────────────────────────────────────────
  // Reads element counts, creates document_lines, sub_status = NEGOTIATION.
  // In headless mode (no IFC loaded), accepts elements array directly.

  function generateBOQ(db, leadId, elements) {
    console.log('§HANDLER_BOQ_GENERATE enter lead=' + leadId +
                ' elements=' + (elements ? elements.length : 0));

    var meta = _getMetadata(db, leadId);
    if (!meta) return null;

    // Find the DEV_PLAN for this lead
    var devId = 'DEV-' + leadId.replace('LEAD-', '');
    var containerRef = meta.container_ref || 'bldg_test';
    var totalCost = 0;
    var lineCount = 0;

    // elements = [{ discipline, ifc_class, storey, qty, rate }]
    if (elements && elements.length) {
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var lineId = 'BOQ-' + devId + '-' + (i + 1);
        var lineTotal = (el.qty || 1) * (el.rate || 0);
        totalCost += lineTotal;
        db.run(
          'INSERT OR REPLACE INTO document_lines (id, doc_id, item_id, container_id, qty, unit_price, metadata) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
          [lineId, devId, null, containerRef, el.qty || 1, el.rate || 0,
           JSON.stringify({ discipline: el.discipline, ifc_class: el.ifc_class,
                            storey: el.storey, type: 'boq_element' })]
        );
        lineCount++;
      }
    }

    _setSubStatus(db, leadId, 'NEGOTIATION');
    KernelOps.commitOp(db, 'BOQ_GENERATE', {
      lead_id: leadId, dev_plan_id: devId,
      total_cost: totalCost, line_count: lineCount
    });
    console.log('§HANDLER_BOQ_GENERATE done lead=' + leadId +
                ' lines=' + lineCount + ' total=' + totalCost + ' sub=NEGOTIATION');
    return { total_cost: totalCost, line_count: lineCount };
  }

  // ── 7. closeLead ────────────────────────────────────────────────
  // transition → COMPLETED, journal auto-posts via StateMachine

  function closeLead(db, leadId, finalPrice) {
    console.log('§HANDLER_LEAD_CLOSE enter lead=' + leadId + ' final_price=' + (finalPrice || 0));

    // If finalPrice provided, ensure doc_lines exist for journal posting
    if (finalPrice && finalPrice > 0) {
      var existingLines = db.exec(
        'SELECT COUNT(*) FROM document_lines WHERE doc_id = ?', [leadId]);
      var hasLines = existingLines.length && Number(existingLines[0].values[0][0]) > 0;
      if (!hasLines) {
        db.run(
          'INSERT INTO document_lines (id, doc_id, qty, unit_price, metadata) ' +
          'VALUES (?, ?, 1, ?, ?)',
          ['CLOSE-' + leadId, leadId, finalPrice,
           JSON.stringify({ type: 'final_price' })]
        );
        console.log('§HANDLER_LEAD_CLOSE added final_price line=' + finalPrice);
      }
    }

    var result = DocEngine.transition(db, leadId, 'complete');
    if (!result) {
      console.log('§HANDLER_LEAD_CLOSE transition failed lead=' + leadId);
      return null;
    }
    KernelOps.commitOp(db, 'LEAD_CLOSE', {
      lead_id: leadId, final_price: finalPrice || 0,
      old_status: result.old_status, new_status: result.new_status
    });
    console.log('§HANDLER_LEAD_CLOSE done lead=' + leadId +
                ' status=COMPLETED journal_entries=' + result.side_effects.length);
    return result;
  }

  // ── Public API ──────────────────────────────────────────────────

  var ConstructionHandlers = {
    screenLead:      screenLead,
    planFAR:         planFAR,
    submitApproval:  submitApproval,
    approve:         approve,
    reject:          reject,
    generateBOQ:     generateBOQ,
    closeLead:       closeLead
  };

  if (typeof window !== 'undefined') window.ConstructionHandlers = ConstructionHandlers;
  if (typeof module !== 'undefined' && module.exports) module.exports = ConstructionHandlers;

  console.log('§CONSTRUCTION_HANDLERS_LOADED v1');
})();
