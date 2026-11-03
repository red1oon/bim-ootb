// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// viewer/erp_push_plan.js - the ONE plan builder: a folded Project Order (rows of the ERP store, sql.js API) -> the {building,name,fields,phases:[{tasks,lines}]} plan that
// viewer/erp_rest_push.js pushProjectOrder sends to a legacy iDempiere. MOVED VERBATIM from capex/tools/shed_twin.js (bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md
// §8.6 SPEC P5 item 1); the viewer's Find > ERP push (find_erp_push.js) and the node twin tool both call it, so there is no second copy. Dual export: node (require) + browser (window.ErpPushPlan).
// The push sends only what a user types (inputs taken from the folded rows); what legacy derives (line PlannedAmt = qty x price, rollups) is COMPARED, never sent.
(function (global) {
  'use strict';
  const lc = o => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };
  // legacy *_UU columns are Postgres uuid: a non-UUID UU (the shipped seed's Hospital-era 'bim-...' products, CAPEX_DASHBOARD.md §12.1 D4) cannot be sent - dropped from the create and LOGGED, never silently
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // planFromDb(db, projectValue) -> { plan, notes }   plan === null when the db holds no such project; notes = the UUs dropped (log them).
  function planFromDb(db, value) {
    const notes = [];
    const uuField = (col, v, where) => { if (v == null) return null; if (UUID.test(v)) return { column: col, val: v }; notes.push(col + '=' + v + ' (' + where + ')'); return null; };
    const q = (sql, p) => { const st = db.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(lc(st.getAsObject())); st.free(); return out; };
    const proj = q('SELECT * FROM c_project WHERE value=?', [value])[0];
    if (!proj) return { plan: null, notes };
    const phases = q('SELECT * FROM c_projectphase WHERE c_project_id=? ORDER BY seqno, c_projectphase_id', [proj.c_project_id]);
  const plan = { building: proj.value, name: proj.name, fields: [{ column: 'C_Currency_ID', val: proj.c_currency_id }, { column: 'IsCommitment', val: proj.iscommitment },
    { column: 'ProjInvoiceRule', val: proj.projinvoicerule }, { column: 'ProjectLineLevel', val: proj.projectlinelevel }, uuField('C_Project_UU', proj.c_project_uu, 'C_Project ' + proj.value)].filter(f => f && f.val != null), phases: [] };
  for (const ph of phases) {
    const tasks = q('SELECT * FROM c_projecttask WHERE c_projectphase_id=? ORDER BY seqno, c_projecttask_id', [ph.c_projectphase_id]);
    const tname = {}; tasks.forEach(t => { tname[t.c_projecttask_id] = t.name; });
    const lines = q('SELECT l.*, p.value AS pvalue, p.name AS pname, p.description AS pdesc, p.c_uom_id AS puom, p.c_taxcategory_id AS ptax, p.producttype AS ptype, p.isstocked AS pstk, p.ispurchased AS ppur, p.issold AS psold, p.m_product_uu AS puu, '
      + 'c.name AS cname, c.value AS cvalue, c.m_product_category_uu AS cuu, u.x12de355 AS ucode, u.name AS uname, u.uomsymbol AS usym, u.stdprecision AS ustd, u.costingprecision AS ucost, u.isdefault AS udef, u.c_uom_uu AS uuu FROM c_projectline l JOIN m_product p ON p.m_product_id=l.m_product_id LEFT JOIN m_product_category c ON c.m_product_category_id=p.m_product_category_id LEFT JOIN c_uom u ON u.c_uom_id=p.c_uom_id '
      + 'WHERE l.c_projectphase_id=? ORDER BY l.line, l.c_projectline_id', [ph.c_projectphase_id]);
    plan.phases.push({ name: ph.name, seqno: ph.seqno, startDate: ph.startdate, endDate: ph.enddate,
      fields: [{ column: 'IsComplete', val: ph.iscomplete }, { column: 'Qty', val: ph.qty }, uuField('C_ProjectPhase_UU', ph.c_projectphase_uu, 'phase ' + ph.name)].filter(f => f && f.val != null),
      tasks: tasks.map(t => ({ name: t.name, fields: [{ column: 'SeqNo', val: t.seqno }, { column: 'Qty', val: t.qty }, uuField('C_ProjectTask_UU', t.c_projecttask_uu, 'task ' + t.name)].filter(f => f && f.val != null) })),
      lines: lines.map(l => ({ productValue: l.pvalue, productName: l.pname, categoryName: l.cname, qty: l.plannedqty, price: l.plannedprice, taskName: l.c_projecttask_id != null ? tname[l.c_projecttask_id] : null,
        uom: l.ucode ? { x12de355: l.ucode, name: l.uname, fields: [{ column: 'UOMSymbol', val: l.usym }, { column: 'StdPrecision', val: l.ustd }, { column: 'CostingPrecision', val: l.ucost }, { column: 'IsDefault', val: l.udef }, uuField('C_UOM_UU', l.uuu, 'uom ' + l.ucode)].filter(f => f && f.val != null) } : null,
        categoryFields: [{ column: 'Value', val: l.cvalue }, uuField('M_Product_Category_UU', l.cuu, 'category ' + l.cname)].filter(f => f && f.val != null),
        productFields: [{ column: 'Description', val: l.pdesc }, { column: 'C_UOM_ID', val: l.puom }, { column: 'C_TaxCategory_ID', val: l.ptax }, { column: 'ProductType', val: l.ptype }, { column: 'IsStocked', val: l.pstk },
          { column: 'IsPurchased', val: l.ppur }, { column: 'IsSold', val: l.psold }, uuField('M_Product_UU', l.puu, 'product ' + l.pvalue)].filter(f => f && f.val != null),
        fields: [{ column: 'Line', val: l.line }, { column: 'Description', val: l.description }, { column: 'DoPricing', val: l.dopricing }, uuField('C_ProjectLine_UU', l.c_projectline_uu, 'line ' + l.description)].filter(f => f && f.val != null) })) });
  }
    return { plan, notes };
  }

  // the BIMOOTB_Query_/Create_<Table> service types the org.idempiere.bimootb plugin installs at System level (reached through its master role "BIM OOTB Push"; §8) - the map
  // shed_twin.js used for BRIDGE_SVC=bimootb.
  function bimootbServiceTypes() {
    const m = {};
    ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'M_Product', 'M_Product_Category', 'C_UOM'].forEach(t => { m[t] = { query: 'BIMOOTB_Query_' + t, create: 'BIMOOTB_Create_' + t }; });
    return m;
  }

  // legacyTarget(loc) -> { base, via } | null  (§8.6 SPEC P5 item 2). `loc` = a Location-like { pathname, origin, search }.
  //   served under /bimootb/ (the plugin's static context)  -> the server it came from: loc.origin.
  //   else ?erp=<base>                                       -> only https, or http on localhost/127.0.0.1 (a password must not cross plain http to a remote host).
  //   neither                                                -> null (the push stays local; the caller logs §PROJ_PUSH_LEGACY skip=no-target).
  function legacyTarget(loc) {
    if (!loc) return null;
    if (/^\/bimootb\//.test(loc.pathname || '') && loc.origin && loc.origin !== 'null') return { base: loc.origin, via: 'served' };
    let raw = null;
    try { raw = new URLSearchParams(loc.search || '').get('erp'); } catch (e) { raw = null; }
    if (!raw) return null;
    let u; try { u = new URL(raw); } catch (e) { return null; }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return { base: u.origin, via: 'param' };
    return null;
  }

  const API = { planFromDb, bimootbServiceTypes, legacyTarget };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ErpPushPlan = API;
})(typeof self !== 'undefined' ? self : this);
