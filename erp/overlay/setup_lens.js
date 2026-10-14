// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
//
// setup_lens.js — SETUP COMPLETENESS LENS (bim-compiler prompts/ERP_DEPTH_FILM.md §SETUP-LENS; Witness: W-SETUP-LENS).
// A READ-ONLY overlay for the pill panel: "what is this client still missing before it can post a first invoice?" Every line is ONE SQL over the client's own rows plus the legacy
// mechanism that makes the row necessary (file:line). It writes nothing, changes no window, and prints INCONCLUSIVE — never "done" — when the table it needs is not in the bundle (PRIMAL LAW §4).
// PURE: compute(q, clientId, todayISO) where q(sql, params) -> [{col: value}] with LOWERCASE keys (the host adapts its db). No DOM here; the pill chrome only renders the returned rows.
(function (global) {
  'use strict';
  var NEED_DT = ['SOO', 'MMS', 'ARI', 'ARR', 'POO', 'MMR', 'API', 'APP'];   // the trade cycle's document base types (order, shipment, AR invoice/receipt, PO, receipt, AP invoice/payment)
  // each check: id, label, cite, tables (all must exist or the line is INCONCLUSIVE), run(q, client, today) -> {ok, detail}
  var CHECKS = [
    { id: 'period', label: 'A period covers today', cite: 'MPeriod.isOpen MPeriod.java:735-770; MYear.createStdPeriods', tables: ['c_calendar', 'c_year', 'c_period'],
      run: function (q, c, t) { var r = q("SELECT COUNT(*) AS n FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN c_calendar k ON k.c_calendar_id=y.c_calendar_id WHERE k.ad_client_id=? AND p.isactive='Y' AND substr(p.startdate,1,10)<=? AND substr(p.enddate,1,10)>=?", [c, t, t])[0]; return { ok: r.n > 0, detail: r.n + ' period(s) cover ' + t }; } },
    { id: 'schema', label: 'An accounting schema with its default accounts', cite: 'MSetup.createAccountingRecord MSetup.java:877-900', tables: ['c_acctschema', 'c_acctschema_default'],
      run: function (q, c) { var r = q("SELECT s.c_acctschema_id AS id FROM c_acctschema s JOIN c_acctschema_default d ON d.c_acctschema_id=s.c_acctschema_id WHERE s.ad_client_id=? AND s.isactive='Y'", [c]); return { ok: r.length > 0, detail: r.length + ' schema(s) with defaults' }; } },
    { id: 'doctypes', label: 'Document types for the trade cycle', cite: 'MSetup.createDocumentTypes', tables: ['c_doctype'],
      run: function (q, c) { var have = {}; q("SELECT DISTINCT docbasetype AS t FROM c_doctype WHERE ad_client_id=? AND isactive='Y'", [c]).forEach(function (r) { have[r.t] = 1; }); var miss = NEED_DT.filter(function (t) { return !have[t]; }); return { ok: !miss.length, detail: miss.length ? 'missing base types: ' + miss.join(',') : NEED_DT.length + ' of ' + NEED_DT.length + ' base types' }; } },
    { id: 'warehouse', label: 'A warehouse with a locator', cite: 'MWarehouse.afterSave (default locator)', tables: ['m_warehouse', 'm_locator'],
      run: function (q, c) { var r = q("SELECT COUNT(*) AS n FROM m_warehouse w JOIN m_locator l ON l.m_warehouse_id=w.m_warehouse_id WHERE w.ad_client_id=? AND w.isactive='Y' AND l.isactive='Y'", [c])[0]; return { ok: r.n > 0, detail: r.n + ' warehouse locator(s)' }; } },
    { id: 'pricelist', label: 'A price list version valid today', cite: 'MPriceList / MPriceListVersion; MOrder price list lookup', tables: ['m_pricelist', 'm_pricelist_version'],
      run: function (q, c, t) { var r = q("SELECT COUNT(*) AS n FROM m_pricelist_version v WHERE v.ad_client_id=? AND v.isactive='Y' AND substr(v.validfrom,1,10)<=?", [c, t])[0]; return { ok: r.n > 0, detail: r.n + ' version(s) valid from <= ' + t }; } },
    { id: 'tax', label: 'A tax with its tax category', cite: 'MSetup.createEntities (C_TaxCategory, C_Tax)', tables: ['c_tax', 'c_taxcategory'],
      run: function (q, c) { var r = q("SELECT COUNT(*) AS n FROM c_tax t JOIN c_taxcategory k ON k.c_taxcategory_id=t.c_taxcategory_id WHERE t.ad_client_id=? AND t.isactive='Y'", [c])[0]; return { ok: r.n > 0, detail: r.n + ' tax(es)' }; } },
    { id: 'paymentterm', label: 'A payment term', cite: 'MPaymentTerm (invoice mandatory C_PaymentTerm_ID)', tables: ['c_paymentterm'],
      run: function (q, c) { var r = q("SELECT COUNT(*) AS n FROM c_paymentterm WHERE ad_client_id=? AND isactive='Y'", [c])[0]; return { ok: r.n > 0, detail: r.n + ' term(s)' }; } },
    { id: 'bpartner', label: 'A business partner group and a partner', cite: 'MBPGroup / MBPartner', tables: ['c_bp_group', 'c_bpartner'],
      run: function (q, c) { var g = q("SELECT COUNT(*) AS n FROM c_bp_group WHERE ad_client_id=? AND isactive='Y'", [c])[0].n, b = q("SELECT COUNT(*) AS n FROM c_bpartner WHERE ad_client_id=? AND isactive='Y'", [c])[0].n; return { ok: g > 0 && b > 0, detail: g + ' group(s), ' + b + ' partner(s)' }; } },
    { id: 'product', label: 'A product category and a product', cite: 'MProductCategory / MProduct', tables: ['m_product_category', 'm_product'],
      run: function (q, c) { var g = q("SELECT COUNT(*) AS n FROM m_product_category WHERE ad_client_id=? AND isactive='Y'", [c])[0].n, p = q("SELECT COUNT(*) AS n FROM m_product WHERE ad_client_id=? AND isactive='Y'", [c])[0].n; return { ok: g > 0 && p > 0, detail: g + ' categor(ies), ' + p + ' product(s)' }; } },
    { id: 'access', label: 'An administrator role that can open windows', cite: 'MRole window access (NC-9: a new role starts with Manual=Y)', tables: ['ad_role', 'ad_window_access'],
      run: function (q, c) { var r = q("SELECT COUNT(DISTINCT r.ad_role_id) AS n FROM ad_role r JOIN ad_window_access a ON a.ad_role_id=r.ad_role_id WHERE r.ad_client_id=? AND r.isactive='Y' AND a.isactive='Y'", [c])[0]; return { ok: r.n > 0, detail: r.n + ' role(s) with window access' }; } }
  ];
  function hasTable(q, t) { try { return q("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=?", [t]).length > 0; } catch (e) { return false; } }
  function compute(q, clientId, todayISO) {
    var rows = CHECKS.map(function (ck) {
      var missingT = ck.tables.filter(function (t) { return !hasTable(q, t); });
      if (missingT.length) return { id: ck.id, label: ck.label, cite: ck.cite, status: 'INCONCLUSIVE', detail: 'table not in this bundle: ' + missingT.join(',') };
      try { var r = ck.run(q, clientId, todayISO); return { id: ck.id, label: ck.label, cite: ck.cite, status: r.ok ? 'OK' : 'MISSING', detail: r.detail }; }
      catch (e) { return { id: ck.id, label: ck.label, cite: ck.cite, status: 'INCONCLUSIVE', detail: 'query failed: ' + String(e.message).slice(0, 80) }; }
    });
    var n = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    return { clientId: clientId, today: todayISO, rows: rows, ok: n('OK'), missing: n('MISSING'), inconclusive: n('INCONCLUSIVE'), judged: n('OK') + n('MISSING'),
      verdict: !(n('OK') + n('MISSING')) ? 'INCONCLUSIVE' : n('MISSING') ? 'INCOMPLETE' : n('INCONCLUSIVE') ? 'COMPLETE-BUT-UNJUDGED' : 'COMPLETE' };
  }
  var api = { compute: compute, CHECKS: CHECKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SetupLens = api;
})(typeof window !== 'undefined' ? window : this);
