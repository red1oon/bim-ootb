// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mfg_mrp.js: PP_MRP as a DERIVED, DETERMINISTIC FOLD (Milestone 5, ~/Projects/Mfg/MILESTONE_5_SPEC.md; Witness W-MFG-MRP). Design rule 6: MRP output is never hand-written.
//   fold(q) reads the kernel projection (documents PP_Order + their document_lines BOM snapshot) through a READ-ONLY query and RETURNS PP_MRP rows. It writes nothing, emits no ops, reads no clock,
//   mints no counter: identity of a row is a key built from DocumentNo + type + line. Field mapping EXTRACTED from legacy orders 50000/50001 (reference DB / seed pp_mrp), see spec.
//   NOT derived (excluded on purpose): PP_MRP_ID/Value (minted sequences), DatesSimulation/Created/Updated (wall clock), IsAvailable (unevidenced). Netting / planned orders / forecasts: not here (no legacy evidence).
(function (root) {
  'use strict';
  function meta(r) { try { return JSON.parse(r.metadata || '{}'); } catch (e) { return {}; } }
  function nz(v) { return v === undefined ? null : v; }

  function fold(q) {
    var out = [];
    q("SELECT id, doc_status, metadata FROM documents WHERE doc_type='PP_Order' ORDER BY id", []).forEach(function (o) {
      var m = meta(o), a = m.attrs || {};
      var base = { ordertype: 'MOP', docstatus: o.doc_status, name: m.documentno, pp_order_id: o.id, datepromised: nz(a.datepromised), datestartschedule: nz(a.datestartschedule),
        dateordered: nz(a.dateordered), s_resource_id: nz(a.s_resource_id), ad_org_id: nz(a.ad_org_id), ad_client_id: nz(a.ad_client_id), m_warehouse_id: nz(m.m_warehouse_id) };
      q('SELECT id, line_no, metadata FROM document_lines WHERE document_id=? ORDER BY line_no, id', [o.id]).forEach(function (l) {
        if (l.line_no === 0) return;   // the BOM header copy is not a component
        var f = meta(l).fields || {};
        out.push(Object.assign({ id: 'PP_MRP:' + m.documentno + ':D:' + l.line_no, typemrp: 'D', pp_order_bomline_id: l.id, m_product_id: nz(f.m_product_id), qty: nz(f.qtyrequiered),
          datefinishschedule: nz(a.datefinishschedule) }, base));
      });
      out.push(Object.assign({ id: 'PP_MRP:' + m.documentno + ':S', typemrp: 'S', pp_order_bomline_id: null, m_product_id: nz(m.m_product_id), qty: nz(m.qtyordered),
        datefinishschedule: nz(a.datestartschedule) }, base));   // S finish = the order's DateStartSchedule: the ONLY value legacy shows, but both legacy orders share one date pair (AMBIGUOUS, spec)
    });
    return out.sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
  }

  function canonical(rows) { return JSON.stringify(rows.map(function (r) { var k = {}; Object.keys(r).sort().forEach(function (c) { k[c] = r[c]; }); return k; })); }
  function hash(rows) { var s = canonical(rows), a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }

  var API = { fold: fold, canonical: canonical, hash: hash };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.MfgMrp = API;
})(typeof window !== 'undefined' ? window : this);
