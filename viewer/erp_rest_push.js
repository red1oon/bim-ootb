/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// erp_rest_push.js — push a Project Order into a REAL, EXTERNAL legacy iDempiere over its stock
// ADInterface REST webservices (org.idempiere.webservices — no plugin needed on the target server).
// prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §3 — the locked write footprint:
//   creates  M_Product / M_Product_Category (find-or-create) → C_Project → C_ProjectPhase →
//            C_ProjectTask → C_ProjectLine.
//   NEVER creates C_BPartner, C_Order/PO, or any GL/Fact_Acct row.
// Wire contract verified against real source (~/idempiere-dev-setup, org.idempiere.webservices):
//   ModelADService.java (JAX-RS paths) + WEB-INF/xsd/idempiere-schema.xsd (ModelCRUDRequest/
//   ADLoginRequest/DataRow/StandardResponse/WindowTabData shapes) — nothing here is guessed.
// Auth is STATELESS per call: ADLoginRequest{user,pass,lang,ClientID,RoleID,OrgID,WarehouseID,stage}
// rides inside every request body; there is no separate login/session step at this layer.
// Every column written must be pre-registered in a WS_WebServiceType field whitelist on the target
// instance (§5 cheatsheet) — ModelADServiceImpl.scanFields throws "input column X not allowed"
// otherwise. This module does not (cannot) fix that — it is a target-instance config step.
// Uses XML request/response bodies, not JSON — the endpoint accepts both, but the JSON form is an
// unverified XMLBeans auto-conversion; XML is unambiguous straight from the XSD.
// Dual export: node (require → tests/poc_erp_rest_push.js) + browser (window.ErpRestPush).

(function (global) {
  'use strict';

  var _fetch = (typeof fetch !== 'undefined') ? fetch : null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── §XML — build one ModelCRUDRequest body, per idempiere-schema.xsd ──────────────────────────
  function buildCrudXml(login, crud) {
    var fields = (crud.fields || []).map(function (f) {
      return '<field column="' + esc(f.column) + '"><val>' + esc(f.val) + '</val></field>';
    }).join('');
    var dataRow = fields ? ('<DataRow>' + fields + '</DataRow>') : '';
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0">' +
      '<ModelCRUD>' +
      '<serviceType>' + esc(crud.serviceType) + '</serviceType>' +
      '<TableName>' + esc(crud.tableName) + '</TableName>' +
      '<RecordID>' + (crud.recordId || 0) + '</RecordID>' +
      (crud.filter ? ('<Filter>' + esc(crud.filter) + '</Filter>') : '') +
      '<Action>' + esc(crud.action) + '</Action>' +
      dataRow +
      '</ModelCRUD>' +
      '<ADLoginRequest>' +
      '<user>' + esc(login.user) + '</user>' +
      '<pass>' + esc(login.pass) + '</pass>' +
      '<lang>' + esc(login.lang || 'en_US') + '</lang>' +
      '<ClientID>' + (login.clientId || 0) + '</ClientID>' +
      '<RoleID>' + (login.roleId || 0) + '</RoleID>' +
      '<OrgID>' + (login.orgId || 0) + '</OrgID>' +
      '<WarehouseID>' + (login.warehouseId || 0) + '</WarehouseID>' +
      '<stage>' + (login.stage || 0) + '</stage>' +
      '</ADLoginRequest>' +
      '</ModelCRUDRequest>';
  }

  // ── §XML-PARSE — minimal, tolerant extraction (no external XML lib assumed) ───────────────────
  function tag(xml, name) {
    var m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
    return m ? m[1] : null;
  }
  function attr(xml, tagName, attrName) {
    var m = xml.match(new RegExp('<' + tagName + '\\b[^>]*\\b' + attrName + '="([^"]*)"'));
    return m ? m[1] : null;
  }
  // A real iDempiere prefixes every reply element with a namespace (`<_0:StandardResponse IsError="true" xmlns:_0=…>`, measured on the local pilot 2026-11-02 — prompts/CAPEX_DASHBOARD.md
  //   §12.1 D3); without this every refusal read as success with RecordID null and every find saw 0 rows. Element prefixes are dropped before parsing (attributes untouched).
  function unprefix(xml) { return String(xml == null ? '' : xml).replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1'); }
  function parseStandardResponse(xml) {
    xml = unprefix(xml);
    var isErrorAttr = attr(xml, 'StandardResponse', 'IsError');
    var recordIdAttr = attr(xml, 'StandardResponse', 'RecordID');
    return {
      isError: isErrorAttr === 'true',
      recordId: recordIdAttr != null ? parseInt(recordIdAttr, 10) : null,
      error: tag(xml, 'Error')
    };
  }
  function parseWindowTabData(xml) {
    xml = unprefix(xml);
    var rows = [];
    var rowRe = /<DataRow>([\s\S]*?)<\/DataRow>/g, rm;
    while ((rm = rowRe.exec(xml))) {
      var row = {};
      var fieldRe = /<field\b([^>]*)>([\s\S]*?)<\/field>/g, fm;
      while ((fm = fieldRe.exec(rm[1]))) {
        var col = (fm[1].match(/column="([^"]*)"/) || [])[1];
        var val = tag(fm[2], 'val');
        if (col != null) row[col] = val;
      }
      rows.push(row);
    }
    return { rows: rows, rowCount: parseInt(tag(xml, 'RowCount') || '0', 10), success: tag(xml, 'Success') === 'true', error: tag(xml, 'Error') };
  }

  // ── §CALL — one HTTP round-trip; logs §ERP_REST every call (Log Mandate) ──────────────────────
  function call(baseUrl, path, login, crud) {
    if (!_fetch) return Promise.reject(new Error('no fetch available'));
    var url = baseUrl.replace(/\/$/, '') + '/ADInterface/services/rest/model_adservice/' + path;
    var body = buildCrudXml(login, crud);
    console.log('§ERP_REST_CALL path=' + path + ' table=' + crud.tableName + ' action=' + crud.action + (crud.filter ? ' filter=' + crud.filter : ''));
    return _fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' }, body: body })
      .then(function (res) { return res.text().then(function (text) { return { status: res.status, text: text }; }); })
      .then(function (r) {
        console.log('§ERP_REST_RESP path=' + path + ' status=' + r.status + ' len=' + r.text.length);
        return r;
      });
  }

  // ── §FIND-OR-CREATE — query_data by natural-key Filter, create_data if RowCount=0 ──────────────
  // serviceType: a WS_WebServiceType.Value, or { query, create } — legacy binds a type to ONE method (AbstractService.authenticate :223-252, "Service type X not configured"), so a real
  //   server needs a read type for query_data and a create type for create_data (prompts/CAPEX_DASHBOARD.md §12.1 D1). A plain string = the same type for both (the stand-in only).
  function findOrCreate(baseUrl, login, serviceType, tableName, filter, fields) {
    var qType = serviceType && typeof serviceType === 'object' ? serviceType.query : serviceType;
    var cType = serviceType && typeof serviceType === 'object' ? serviceType.create : serviceType;
    return call(baseUrl, 'query_data', login, { serviceType: qType, tableName: tableName, action: 'Read', filter: filter })
      .then(function (r) {
        var parsed = parseWindowTabData(r.text);
        if (parsed.error) throw new Error('§ERP_REST_QUERY_ERR ' + tableName + ': ' + parsed.error);
        var idCol = tableName + '_ID';
        if (parsed.rowCount > 0 && parsed.rows[0][idCol]) {
          console.log('§ERP_REST_FOUND table=' + tableName + ' id=' + parsed.rows[0][idCol] + ' (+0)');
          return { id: parseInt(parsed.rows[0][idCol], 10), created: false };
        }
        return call(baseUrl, 'create_data', login, { serviceType: cType, tableName: tableName, action: 'Create', fields: fields })
          .then(function (r2) {
            var resp = parseStandardResponse(r2.text);
            if (resp.isError) throw new Error('§ERP_REST_CREATE_ERR ' + tableName + ': ' + resp.error);
            console.log('§ERP_REST_CREATED table=' + tableName + ' id=' + resp.recordId);
            return { id: resp.recordId, created: true };
          });
      });
  }

  // ── §PUSH — the locked write footprint, in order ──────────────────────────────────────────────
  // plan = { building, phases: [ { name, seqno, startDate, endDate, plannedAmt,
  //            tasks: [ { name } ],
  //            lines: [ { productValue, productName, categoryName, qty, price, plannedAmt } ] } ] }
  // Optional (the twin push, CAPEX_DASHBOARD.md §12.1): plan.name; plan.fields / phase.fields / task.fields / line.fields / line.productFields / line.categoryFields = extra
  //   [{column,val}] input columns appended to that row's create (the target's whitelist decides); line.taskName links the line to that phase's task (C_ProjectTask_ID);
  //   line.plannedAmt omitted ⇒ not sent (legacy computes it: MProjectLine.beforeSave :212).
  function pushProjectOrder(cfg, plan) {
    var baseUrl = cfg.baseUrl, login = cfg.login;
    var svc = cfg.serviceTypes || {}; // per-table WS_WebServiceType.Value (§5 #2 registration)
    var created = { categories: 0, products: 0, projects: 0, phases: 0, tasks: 0, lines: 0 };

    return findOrCreate(baseUrl, login, svc.C_Project || 'BIMOOTB_Project', 'C_Project',
      "Value='" + plan.building + "'",
      [{ column: 'Value', val: plan.building }, { column: 'Name', val: plan.name || ('BIM: ' + plan.building) }].concat(plan.fields || []))
      .then(function (proj) {
        if (proj.created) created.projects++;
        var phaseChain = Promise.resolve();
        (plan.phases || []).forEach(function (ph) {
          phaseChain = phaseChain.then(function () {
            return findOrCreate(baseUrl, login, svc.C_ProjectPhase || 'BIMOOTB_ProjectPhase', 'C_ProjectPhase',
              "C_Project_ID=" + proj.id + " AND Name='" + ph.name + "'",
              [{ column: 'C_Project_ID', val: proj.id }, { column: 'Name', val: ph.name },
               { column: 'SeqNo', val: ph.seqno }, { column: 'StartDate', val: ph.startDate }, { column: 'EndDate', val: ph.endDate }].concat(ph.fields || []))
              .then(function (phase) {
                if (phase.created) created.phases++;
                var taskChain = Promise.resolve(), taskIds = {};
                (ph.tasks || []).forEach(function (t) {
                  taskChain = taskChain.then(function () {
                    return findOrCreate(baseUrl, login, svc.C_ProjectTask || 'BIMOOTB_ProjectTask', 'C_ProjectTask',
                      "C_ProjectPhase_ID=" + phase.id + " AND Name='" + t.name + "'",
                      [{ column: 'C_ProjectPhase_ID', val: phase.id }, { column: 'Name', val: t.name }].concat(t.fields || []))
                      .then(function (task) { if (task.created) created.tasks++; taskIds[t.name] = task.id; });
                  });
                });
                var lineChain = taskChain;
                (ph.lines || []).forEach(function (ln) {
                  lineChain = lineChain.then(function () {
                    // line.uom = { x12de355, name, fields } — the product's UOM by its natural key on the TARGET (ids differ per instance; a UOM the target lacks is created). §12.1 D6
                    var uomStep = ln.uom && ln.uom.x12de355 ? findOrCreate(baseUrl, login, svc.C_UOM || 'BIMOOTB_UOM', 'C_UOM', "X12DE355='" + ln.uom.x12de355 + "'",
                      [{ column: 'X12DE355', val: ln.uom.x12de355 }, { column: 'Name', val: ln.uom.name }].concat(ln.uom.fields || []))
                      .then(function (u) { if (u.created) created.uoms = (created.uoms || 0) + 1; return u.id; }) : Promise.resolve(null);
                    var uomId = null;
                    return uomStep.then(function (u) { uomId = u; return findOrCreate(baseUrl, login, svc.M_Product_Category || 'BIMOOTB_ProductCategory', 'M_Product_Category',
                      "Name='" + ln.categoryName + "'",
                      [{ column: 'Name', val: ln.categoryName }].concat(ln.categoryFields || [])); })
                      .then(function (cat) {
                        if (cat.created) created.categories++;
                        return findOrCreate(baseUrl, login, svc.M_Product || 'BIMOOTB_Product', 'M_Product',
                          "Value='" + ln.productValue + "'",
                          [{ column: 'Value', val: ln.productValue }, { column: 'Name', val: ln.productName },
                           { column: 'M_Product_Category_ID', val: cat.id }].concat((ln.productFields || []).filter(function (f) { return !(uomId && f.column === 'C_UOM_ID'); }))
                           .concat(uomId ? [{ column: 'C_UOM_ID', val: uomId }] : []));
                      })
                      .then(function (prod) {
                        if (prod.created) created.products++;
                        // natural key = (phase, product) — plus the line's TASK when it has one: a fold given the 4D programme writes one line per product × 4D task
                        // (prompts/CAPEX_DASHBOARD.md §5.1 R1), so (phase, product) alone would find the first storey's line and silently drop the others
                        var lnTaskId = ln.taskName != null && taskIds[ln.taskName] ? taskIds[ln.taskName] : null;
                        return findOrCreate(baseUrl, login, svc.C_ProjectLine || 'BIMOOTB_ProjectLine', 'C_ProjectLine',
                          "C_ProjectPhase_ID=" + phase.id + " AND M_Product_ID=" + prod.id + (lnTaskId ? " AND C_ProjectTask_ID=" + lnTaskId : ""),
                          [{ column: 'C_ProjectPhase_ID', val: phase.id }, { column: 'C_Project_ID', val: proj.id },
                           { column: 'M_Product_ID', val: prod.id }, { column: 'PlannedQty', val: ln.qty },
                           { column: 'PlannedPrice', val: ln.price }]
                            .concat(ln.plannedAmt != null ? [{ column: 'PlannedAmt', val: ln.plannedAmt }] : [])
                            .concat(ln.taskName != null && taskIds[ln.taskName] ? [{ column: 'C_ProjectTask_ID', val: taskIds[ln.taskName] }] : [])
                            .concat(ln.fields || []));
                      })
                      .then(function (line) { if (line.created) created.lines++; });
                  });
                });
                return lineChain;
              });
          });
        });
        return phaseChain.then(function () {
          console.log('§ERP_REST_PUSH_DONE building="' + plan.building + '" projectId=' + proj.id +
            ' created=' + JSON.stringify(created));
          return { projectId: proj.id, created: created };
        });
      });
  }

  var API = { pushProjectOrder: pushProjectOrder, buildCrudXml: buildCrudXml, parseStandardResponse: parseStandardResponse, parseWindowTabData: parseWindowTabData };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ErpRestPush = API;
})(typeof self !== 'undefined' ? self : this);
