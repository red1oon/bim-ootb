// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_asi.js: Attribute Set Instance creation, ONE implementation for every PAttribute column (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-1;
//   Witness: W-ASI-CREATE, erp/tests/witness_asi_create.js). READ THE LOG: §ASI lines + the verdict §ASI-SUMMARY; the exit code alone is not evidence.
// What this is: the data half of iDempiere's attribute dialog. plan() is PURE (reads through r.q(sql,params), returns the rows to write); create() writes them through a Trx
//   (the model layer: auto-generate lot on a receipt line, MAttributeSetInstance.create); the UI half (crud_overlay.js type 'pattribute') turns the SAME plan into one signed op group.
// Java root org.adempiere.base/src/org/compiere/model/ (M): MAttributeSetInstance :205-258 setDescription, :274-285 getGuaranteeDate(new), :294-326 getLot/createLot/setLot,
//   :354-367 getSerNo(new), :419-459 create/generateLot, afterSave :430-450 (empty Description := the id); MLotCtl.createLot / MSerNoCtl.createSerNo (Prefix+CurrentNext+Suffix,
//   CurrentNext += IncrementNo); MAttributeSet :421-466 Lot/SerNo delimiters; MAttributeInstance.setValueNumber :212-236. The dialog's save rules: WPAttributeDialog.saveSelection :1083-1250
//   (zkwebui window/WPAttributeDialog.java): mandatory Lot/SerNo/GuaranteeDate and mandatory attributes refuse with "FillMandatory - <names>".
// NOT ported (named, never silent): Reference (R) and Chosen-Multiple-Selection (C) attribute value types; "existing instance" search (the picker still offers every instance).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelAsi = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  function one(r, sql, p) { return (r.q(sql, p || [])[0]) || null; }
  function str(v) { return v == null ? '' : String(v); }
  function oneChar(v, dflt) { return v != null && String(v).length === 1 && String(v) !== ' ' ? String(v) : dflt; }   // MAttributeSet.getLotCharStart etc. :421-466
  function mdy(iso) { var d = String(iso).slice(0, 10).split('-'); return d.length === 3 ? d[1] + '/' + d[2] + '/' + d[0] : String(iso); }   // DisplayType.getDateFormat(Date), en_US MM/dd/yyyy (Language.java:520)
  function addDays(iso, n) { var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10) + ' 00:00:00'; }
  function numStr(v) { var s = String(v); if (Number(v) === 0) return '0'; if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, ''); return s; }   // MAttributeInstance.setValueNumber :212-236

  // the attributes the dialog shows: instance attributes in a document window, product attributes in the Product window (WPAttributeDialog :1163 getMAttributes(!m_productWindow))
  function attributesOf(r, setId, productWindow) {
    return r.q("SELECT a.m_attribute_id, a.name, a.attributevaluetype, a.ismandatory FROM m_attributeuse u JOIN m_attribute a ON a.m_attribute_id=u.m_attribute_id " +
      "WHERE u.isactive='Y' AND a.isactive='Y' AND u.m_attributeset_id=? AND a.isinstanceattribute=? ORDER BY u.seqno, a.m_attribute_id", [setId, productWindow ? 'N' : 'Y']);
  }
  // the controls an editor must show for this product (so the UI never hard-codes a field list): lot (with/without a "New" counter), serial no, guarantee date, attributes
  function form(r, productId, productWindow) {
    var p = one(r, 'SELECT m_product_id, m_attributeset_id FROM m_product WHERE m_product_id=?', [productId]);
    if (!p || !Number(p.m_attributeset_id)) return { ok: false, reason: 'product has no Attribute Set' };
    var s = one(r, 'SELECT * FROM m_attributeset WHERE m_attributeset_id=?', [p.m_attributeset_id]);
    if (!s) return { ok: false, reason: 'Attribute Set ' + p.m_attributeset_id + ' not found' };
    var f = { ok: true, setId: s.m_attributeset_id, setName: s.name, productWindow: !!productWindow, lot: false, serno: false, guaranteedate: false, attributes: [] };
    if (!productWindow) {
      f.lot = s.islot === 'Y'; f.lotCounter = f.lot && Number(s.m_lotctl_id) > 0; f.lotMandatory = s.islotmandatory === 'Y';
      f.serno = s.isserno === 'Y'; f.sernoCounter = f.serno && Number(s.m_sernoctl_id) > 0; f.sernoMandatory = s.issernomandatory === 'Y';
      f.guaranteedate = s.isguaranteedate === 'Y'; f.guaranteeMandatory = s.isguaranteedatemandatory === 'Y'; f.guaranteeDays = Number(s.guaranteedays || 0);
    }
    f.attributes = attributesOf(r, s.m_attributeset_id, productWindow).map(function (a) {
      var o = { id: a.m_attribute_id, name: a.name, type: a.attributevaluetype || 'S', mandatory: a.ismandatory === 'Y' };
      if (o.type === 'L') o.options = r.q('SELECT m_attributevalue_id AS id, name FROM m_attributevalue WHERE m_attribute_id=? AND isactive=\'Y\' ORDER BY name', [a.m_attribute_id]);
      return o;
    });
    return f;
  }
  // MAttributeSetInstance.setDescription :205-258 from the values a plan holds (instance attrs, SerNo, Lot, GuaranteeDate, then product attrs)
  function describe(s, instAttrs, prodAttrs, v) {
    var sb = [];
    instAttrs.forEach(function (a) { var x = v.attrs[a.id]; if (x && x.value != null) sb.push(x.value); });
    if (s.isserno === 'Y' && v.serno != null && v.serno !== '') sb.push(oneChar(s.sernocharsoverwrite, '#') + v.serno + oneChar(s.sernochareoverwrite, ''));
    if (s.islot === 'Y' && v.lot != null && v.lot !== '') sb.push(oneChar(s.lotcharsoverwrite, '«') + v.lot + oneChar(s.lotchareoverwrite, '»'));
    if (s.isguaranteedate === 'Y' && v.guaranteedate) sb.push(mdy(v.guaranteedate));
    prodAttrs.forEach(function (a) { var x = v.attrs[a.id]; if (x) sb.push(x.value != null ? x.value : ''); });
    return sb.join('_');
  }
  function counter(ctl) {   // MLotCtl.createLot / MSerNoCtl.createSerNo: Prefix + CurrentNext + Suffix, then CurrentNext += IncrementNo
    var no = Number(ctl.currentnext);
    return { name: str(ctl.prefix) + no + str(ctl.suffix), next: no + Number(ctl.incrementno || 0) };
  }
  // plan(r, o): o = { productId, mode: 'dialog'|'create'|'generateLot', productWindow, today, values: { lot, serno, guaranteedate, newLot, newSerNo, attrs: { <m_attribute_id>: raw } } }
  //  -> { ok, errors[], mandatory[], description, rows: [{ table, fields, update?: { key, id } }] } ; rows[0] is the m_attributesetinstance row, children carry { ref: 0 } for its id.
  function plan(r, o) {
    var out = { ok: false, errors: [], mandatory: [], rows: [], description: '' };
    var f = form(r, o.productId, o.productWindow);
    if (!f.ok) { out.errors.push(f.reason); return out; }
    var s = one(r, 'SELECT * FROM m_attributeset WHERE m_attributeset_id=?', [f.setId]);
    var vin = o.values || {}, v = { lot: null, serno: null, guaranteedate: null, attrs: {} }, mode = o.mode || 'dialog';
    var today = o.today || new Date().toISOString().slice(0, 10), lotRow = null, lotCtlUpd = null, snCtlUpd = null;
    var autoNew = mode !== 'dialog';
    if (!o.productWindow) {
      if (s.islot === 'Y' || autoNew) {   // getLot(true) / generateLot create from the lot control whatever IsLot says (MAttributeSetInstance.java:294-318, :444-459)
        if ((vin.newLot || (autoNew && !vin.lot)) && Number(s.m_lotctl_id) > 0) {                    // getLot(true) -> createLot :306-318
          var lc = one(r, 'SELECT * FROM m_lotctl WHERE m_lotctl_id=?', [s.m_lotctl_id]);
          if (!lc) { out.errors.push('M_LotCtl ' + s.m_lotctl_id + ' not found'); return out; }
          var c = counter(lc); v.lot = c.name; lotCtlUpd = { key: 'm_lotctl', id: lc.m_lotctl_id, fields: { currentnext: c.next } };
          lotRow = { table: 'm_lot', fields: { m_lotctl_id: lc.m_lotctl_id, m_product_id: o.productId, name: c.name, ad_org_id: 0 } };
        } else if (vin.lot != null && vin.lot !== '') {                                              // setLot(Lot, Product) :326-333: link an existing M_Lot of the product
          v.lot = String(vin.lot);
          var ex = r.q('SELECT m_lot_id FROM m_lot WHERE m_product_id=? AND name=?', [o.productId, v.lot])[0];
          if (ex) lotRow = { existing: ex.m_lot_id };
        }
      }
      if (s.isserno === 'Y' || mode === 'create') {   // generateLot makes the LOT only; create also takes Serial No and Guarantee Date (:419-437)
        if ((vin.newSerNo || (mode === 'create' && !vin.serno)) && Number(s.m_sernoctl_id) > 0) {              // getSerNo(true) :354-367
          var sc = one(r, 'SELECT * FROM m_sernoctl WHERE m_sernoctl_id=?', [s.m_sernoctl_id]);
          if (!sc) { out.errors.push('M_SerNoCtl ' + s.m_sernoctl_id + ' not found'); return out; }
          var c2 = counter(sc); v.serno = c2.name; snCtlUpd = { key: 'm_sernoctl', id: sc.m_sernoctl_id, fields: { currentnext: c2.next } };
        } else if (vin.serno != null && vin.serno !== '') v.serno = String(vin.serno);
      }
      if (s.isguaranteedate === 'Y' || mode === 'create') {
        if (vin.guaranteedate) v.guaranteedate = String(vin.guaranteedate).length === 10 ? vin.guaranteedate + ' 00:00:00' : vin.guaranteedate;
        else if (mode === 'create' && Number(s.guaranteedays) > 0) v.guaranteedate = addDays(today, s.guaranteedays);   // getGuaranteeDate(true) :274-285
      }
      if (mode === 'dialog') {                                                                       // WPAttributeDialog.saveSelection mandatory block
        if (s.islot === 'Y' && s.islotmandatory === 'Y' && !v.lot) out.mandatory.push('Lot');
        if (s.isserno === 'Y' && s.issernomandatory === 'Y' && !v.serno) out.mandatory.push('SerNo');
        if (s.isguaranteedate === 'Y' && s.isguaranteedatemandatory === 'Y' && !v.guaranteedate) out.mandatory.push('GuaranteeDate');
      }
    }
    var attrRows = [];
    if (mode === 'dialog') f.attributes.forEach(function (a) {
      var raw = (vin.attrs || {})[a.id], has = raw != null && String(raw) !== '', row = { table: 'm_attributeinstance', ref: 0, fields: { m_attribute_id: a.id } }, shown = null;
      if (a.type === 'L') { if (has && Number(raw) > 0) { var av = one(r, 'SELECT name FROM m_attributevalue WHERE m_attributevalue_id=? AND m_attribute_id=?', [raw, a.id]); if (!av) { out.errors.push('Attribute ' + a.name + ': value ' + raw + ' is not a value of this attribute'); return; } row.fields.m_attributevalue_id = Number(raw); row.fields.value = av.name; shown = av.name; } }
      else if (a.type === 'N') { if (has) { if (isNaN(Number(raw))) { out.errors.push('Attribute ' + a.name + ': not a number'); return; } row.fields.valuenumber = Number(raw); row.fields.value = numStr(raw); shown = row.fields.value; } }
      else if (a.type === 'D') { if (has) { row.fields.valuedate = String(raw).slice(0, 10) + ' 00:00:00'; row.fields.value = String(raw).slice(0, 10); shown = row.fields.value; } }
      else if (a.type === 'R' || a.type === 'C') { out.errors.push('Attribute ' + a.name + ': value type ' + a.type + ' (Reference / multiple selection) is not supported on the twin yet - named gap'); return; }
      else { if (has) { row.fields.value = String(raw); shown = String(raw); } }
      if (a.mandatory && shown == null) out.mandatory.push(a.name);
      // legacy keeps an attribute instance row even when the value is empty (setMAttributeInstance with null) - only a mandatory miss blocks the save
      attrRows.push({ row: row, a: a, shown: shown });
      v.attrs[a.id] = { value: shown };
    });
    if (out.errors.length) return out;
    if (out.mandatory.length) { out.errors.push('@FillMandatory@ ' + out.mandatory.map(function (n) { return ' - ' + n; }).join('')); return out; }
    var inst = o.productWindow ? [] : f.attributes, prod = o.productWindow ? f.attributes : [];
    out.description = describe(s, inst, prod, v);
    out.rows = [];
    var asiFields = { m_attributeset_id: f.setId, lot: v.lot, serno: v.serno, guaranteedate: v.guaranteedate, description: out.description || null, ad_org_id: (mode === 'dialog' && o.org != null) ? o.org : 0 };   // create/generateLot: setClientOrg(client, 0) :423; dialog: the session org
    if (lotRow && lotRow.existing) asiFields.m_lot_id = lotRow.existing;
    out.rows.push({ table: 'm_attributesetinstance', fields: asiFields, lotRef: lotRow && lotRow.table ? 1 : 0 });
    if (lotRow && lotRow.table) out.rows.push(lotRow);                                                // M_Lot created with the instance; the instance gets its id (rowsLot)
    attrRows.forEach(function (x) { out.rows.push(x.row); });
    if (lotCtlUpd) out.rows.push({ update: lotCtlUpd });
    if (snCtlUpd) out.rows.push({ update: snCtlUpd });
    out.ok = true;
    return out;
  }

  // create(trx, o): write a plan through the model layer (a receipt-line auto-generate lot, MAttributeSetInstance.create). Returns { ok, asi, description, error }.
  function create(trx, o) {
    var p = plan({ q: function (sql, prm) { return trx.q(sql, prm); } }, o);
    if (!p.ok) return { ok: false, error: p.errors.join('; ') };
    var asiPlan = p.rows[0], lot = null;
    if (asiPlan.lotRef) { var lp = p.rows[1]; lot = trx.insert('m_lot', ML.newPO(trx, 'm_lot', Object.assign({ ad_client_id: trx.env.client, isactive: 'Y' }, lp.fields))); asiPlan.fields.m_lot_id = lot.m_lot_id; }
    var asi = trx.insert('m_attributesetinstance', ML.newPO(trx, 'm_attributesetinstance', Object.assign({ ad_client_id: trx.env.client, isactive: 'Y' }, asiPlan.fields)));
    var id = asi.m_attributesetinstance_id;
    p.rows.slice(1).forEach(function (rw) {
      if (rw.update) { var cur = trx.get(rw.update.key, rw.update.id); trx.update(rw.update.key, cur, rw.update.fields); }
      else if (rw.table === 'm_attributeinstance') trx.insert('m_attributeinstance', ML.newPO(trx, 'm_attributeinstance', Object.assign({ ad_client_id: trx.env.client, isactive: 'Y', m_attributesetinstance_id: id }, rw.fields)));
    });
    trx.say('§ASI created id=' + id + ' set=' + asiPlan.fields.m_attributeset_id + ' lot=' + (asiPlan.fields.lot || '') + ' serno=' + (asiPlan.fields.serno || '') + ' gd=' + (asiPlan.fields.guaranteedate || '') + ' desc="' + p.description + '"');
    return { ok: true, asi: id, description: p.description, lot: lot ? lot.m_lot_id : null };
  }

  // ── mandatory-ASI rule: ONE implementation for every document (AS-2). Java MProduct.isASIMandatoryFor MProduct.java:1028-1056 + MAttributeSet.excludeTableEntry :318-337.
  //   Batch/Lot costing on ANY client schema makes an instance always mandatory; otherwise only an INSTANCE attribute set can require one: outgoing (SO) -> MandatoryType Always (Y), or
  //   the type the caller passes ('S' = When Shipping, MInOut.prepareIt); incoming -> Always only. MAttributeSetExclude (set + table + IsSOTrx) switches the check off per document table.
  function dep(name, file) { var g = typeof window !== 'undefined' ? window : globalThis; if (g[name]) return g[name]; if (typeof require === 'function') { try { return require(file); } catch (e) { return null; } } return null; }
  function asiMandatoryFor(trx, p, mandatoryType, isSOTrx) {
    var MM = dep('ModelMaster', './model_master'), MC = dep('ModelCost', './model_cost');
    if (MM && MC) { var schemas = MM.clientAcctSchemas ? MM.clientAcctSchemas(trx, p.ad_client_id) : [];
      for (var i = 0; i < schemas.length; i++) if (MC.costingLevel(trx, p, schemas[i]) === 'B') return true; }
    if (!p.m_attributeset_id || Number(p.m_attributeset_id) === 0) return false;
    var s = trx.get('m_attributeset', p.m_attributeset_id);
    if (!s || s.isinstanceattribute !== 'Y') return false;
    var always = s.mandatorytype === 'Y', mandatory = (s.mandatorytype && s.mandatorytype !== 'N') || s.islotmandatory === 'Y' || s.issernomandatory === 'Y' || s.isguaranteedatemandatory === 'Y';
    if (isSOTrx) return always || (mandatory && mandatoryType != null && s.mandatorytype === mandatoryType);
    return always;
  }
  function excludeTableEntry(trx, p, tableName, isSOTrx) {   // MAttributeSetExclude rows of the product's set for this document table + direction
    if (!p.m_attributeset_id) return false;
    var t = trx.q('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=?', [String(tableName).toLowerCase()])[0]; if (!t) return false;
    try { return trx.q("SELECT 1 AS x FROM m_attributesetexclude WHERE m_attributeset_id=? AND ad_table_id=? AND issotrx=? AND isactive='Y'", [p.m_attributeset_id, t.id, isSOTrx ? 'Y' : 'N']).length > 0; } catch (e) { return false; }
  }
  // the refusal text of MOrder.prepareIt :1639-1647 / MInOut.prepareIt :1537-1540
  function mandatoryMsg(line, p) { return '@M_AttributeSet_ID@ @IsMandatory@ (@Line@ #' + line + ', @M_Product_ID@=' + p.value + ')'; }
  // ── MStorageOnHand.getWarehouse / getWarehouseNegative: ONE implementation for every caller (AS-3, converged by AS-8 - model_movement.getWarehouse, model_inventory.getWarehouseNegative, libero's copy and
  //   InOutGenerate's copy are gone). It READS THROUGH THE TRX (trx.find / trx.get = base rows overlaid with the Trx's own pending writes), as the Java reads through its trxName: a document that completes
  //   in the same Trx as an earlier one (a movement confirm's inventory documents) sees the earlier one's storage writes. The old base-SQL port did not (measured: a phantom -1 row, W-MOVEMENT-CONFIRM e5b).
  //   Rows come back as the Trx's own row objects (callers that only read them for display copy them first).
  var nz = T.nz, D = T.D;
  function mmFifo(trx, p) {   // MProduct.getMMPolicy :990-996: the product category's policy, else the client's; MClient.MMPOLICY_FiFo = 'F'
    var cat = (p.m_product_category_id != null ? trx.get('m_product_category', p.m_product_category_id) : null) || {}, cl = trx.get('ad_client', trx.env.client) || {};
    return (cat.mmpolicy || cl.mmpolicy || 'F') === 'F';
  }
  // MProduct.isUseGuaranteeDateForMPolicy :1002-1010 = the product's Attribute SET has IsGuaranteeDate AND UseGuaranteeDateForMPolicy (the SET's flags, not a product column - the finding of W-ASI-POLICY)
  function useGuaranteeDate(trx, p) { var as = p && nz(p.m_attributeset_id) ? trx.get('m_attributeset', p.m_attributeset_id) : null; return !!as && as.isguaranteedate === 'Y' && as.useguaranteedateformpolicy === 'Y'; }
  // the storage rows of one product at the locator (o.locatorId) or at every locator of the warehouse (o.warehouseId, used when no locator is given - MStorageOnHand.java :411-415 "M_Locator_ID > 0")
  function storageBase(trx, o, qtyOk) {
    var byLoc = nz(o.locatorId), prio = {}, rows;
    if (byLoc) { var l = trx.get('m_locator', o.locatorId); prio[String(o.locatorId)] = l ? Number(l.priorityno || 0) : 0; rows = trx.find('m_storageonhand', { m_locator_id: o.locatorId, m_product_id: o.productId }); }
    else {
      trx.find('m_locator', { m_warehouse_id: o.warehouseId }).forEach(function (l) { prio[String(l.m_locator_id)] = Number(l.priorityno || 0); });
      rows = trx.find('m_storageonhand', { m_product_id: o.productId }).filter(function (s) { return prio[String(s.m_locator_id)] != null; });
    }
    return { rows: rows.filter(function (s) { return qtyOk(D(s.qtyonhand)); }), prio: function (s) { return prio[String(s.m_locator_id)] || 0; } };
  }
  function sortStorage(rows, fifo, prio, key, qtyDesc) {   // ORDER BY l.PriorityNo DESC, <key> ASC (FiFo) / DESC (LiFo), instance id (asc FiFo / desc LiFo) [, QtyOnHand DESC]
    return rows.sort(function (a, b) {
      var c = prio(b) - prio(a); if (c) return c;
      var ka = key(a), kb = key(b); c = ka < kb ? -1 : ka > kb ? 1 : 0; if (!fifo) c = -c;
      if (key.tie !== false && !c) { var x = Number(a.m_attributesetinstance_id) || 0, y = Number(b.m_attributesetinstance_id) || 0; c = fifo ? x - y : y - x; }
      if (!c && qtyDesc) c = D(b.qtyonhand).compareTo(D(a.qtyonhand));
      return c;
    });
  }
  var gdate = function (d) { return String(d).slice(0, 10); };
  // getWarehouse :398-533. `asiId` 0 = all instances (minGuaranteeDate filter + optional guarantee-date ordering apply); a given instance = exactly that instance (the filter is ignored, :418 + :512-518).
  //   Order: locator priority DESC, then DateMaterialPolicy (or COALESCE(GuaranteeDate, DateMaterialPolicy) when the product says "use guarantee date for material policy") ASC for FiFo / DESC for LiFo,
  //   then instance id (asc FiFo / desc LiFo), then (all instances only) QtyOnHand DESC. Zero-quantity rows are never returned.
  function storages(trx, o) {
    if ((!nz(o.warehouseId) && !nz(o.locatorId)) || !nz(o.productId)) return [];
    var all = !nz(o.asiId), p = trx.get('m_product', o.productId) || {}, useGD = useGuaranteeDate(trx, p), asis = {};
    var asiOf = function (s) { if (!nz(s.m_attributesetinstance_id)) return null; var k = String(s.m_attributesetinstance_id); return k in asis ? asis[k] : (asis[k] = trx.get('m_attributesetinstance', s.m_attributesetinstance_id)); };
    var base = storageBase(trx, o, function (q) { return o.positiveOnly ? q.signum() > 0 : q.signum() !== 0; }), rows = base.rows;
    if (!all) rows = rows.filter(function (s) { return String(s.m_attributesetinstance_id || 0) === String(o.asiId); });
    else if (o.minGuaranteeDate) rows = rows.filter(function (s) { var a = asiOf(s); return !a || !a.guaranteedate || gdate(a.guaranteedate) > gdate(o.minGuaranteeDate); });
    var key = function (s) { if (all && useGD) { var a = asiOf(s); if (a && a.guaranteedate) return String(a.guaranteedate); } return String(s.datematerialpolicy || ''); };
    return sortStorage(rows, o.fifo, base.prio, key, all);
  }
  // getWarehouseNegative :579-680 - the NEGATIVE on-hand rows a receipt / count fills first (MInOut.autoBalanceNegative :2477-2500, MInventory.checkMaterialPolicy). asiId > 0 = that instance, 0 = the rows
  //   WITHOUT an instance, omitted/negative = every instance. When the product uses the guarantee date: ORDER BY priority DESC, asi.GuaranteeDate (asc FiFo / desc LiFo; NULLs last ascending like PostgreSQL,
  //   no instance-id tie-break) else priority DESC, DateMaterialPolicy, instance id; always then QtyOnHand DESC (least negative first).
  function negatives(trx, o) {
    if ((!nz(o.warehouseId) && !nz(o.locatorId)) || !nz(o.productId)) return [];
    var a0 = o.asiId == null ? -1 : o.asiId, p = trx.get('m_product', o.productId) || {}, useGD = useGuaranteeDate(trx, p), asis = {};
    var asiOf = function (s) { if (!nz(s.m_attributesetinstance_id)) return null; var k = String(s.m_attributesetinstance_id); return k in asis ? asis[k] : (asis[k] = trx.get('m_attributesetinstance', s.m_attributesetinstance_id)); };
    var base = storageBase(trx, o, function (q) { return q.signum() < 0; }), rows = base.rows;
    if (o.minGuaranteeDate) rows = rows.filter(function (s) { var a = asiOf(s); return !a || !a.guaranteedate || gdate(a.guaranteedate) > gdate(o.minGuaranteeDate); });
    if (a0 === -1 || (typeof a0 === 'number' && a0 < 0)) { /* every instance */ } else if (nz(a0)) rows = rows.filter(function (s) { return String(s.m_attributesetinstance_id || 0) === String(a0); });
    else rows = rows.filter(function (s) { return !nz(s.m_attributesetinstance_id); });
    var key = function (s) { if (useGD) { var a = asiOf(s); return a && a.guaranteedate ? String(a.guaranteedate) : '￿'; } return String(s.datematerialpolicy || ''); };
    key.tie = !useGD;
    return sortStorage(rows, o.fifo, base.prio, key, true);
  }

  // MAttributeSetInstance.afterSave :430-450 - a NEW instance saved with an empty Description gets its own id as the Description
  ML.registerModel('m_attributesetinstance', { afterSave: function (trx, row, isNew) {
    if (isNew && (row.description == null || String(row.description).trim() === '')) {
      // the key is only assigned when the group is committed (Trx.insert placeholder): '{{opref:N}}' is the id of the row op N, resolved by the commit (crud_overlay applyOpGroup / dd_common apply)
      var pe = trx._p('m_attributesetinstance')[String(row.m_attributesetinstance_id)];
      trx.update('m_attributesetinstance', row, { description: pe && pe.opIdx != null ? '{{opref:' + pe.opIdx + '}}' : String(row.m_attributesetinstance_id) });
    }
    return null;
  } });
  // MAttributeSet.beforeSave :462-470 / afterSave :472-526 - IsInstanceAttribute follows Lot / SerNo / GuaranteeDate and the instance attributes the set uses
  ML.registerModel('m_attributeset', {
    initialDefaults: { isguaranteedate: 'N', isguaranteedatemandatory: 'N', islot: 'N', islotmandatory: 'N', isserno: 'N', issernomandatory: 'N', isinstanceattribute: 'N', mandatorytype: 'N' },   // MAttributeSet.setInitialDefaults :130-139
    beforeSave: function (trx, s) { if (s.isinstanceattribute !== 'Y' && (s.isserno === 'Y' || s.islot === 'Y' || s.isguaranteedate === 'Y')) s.isinstanceattribute = 'Y'; return null; },
    afterSave: function (trx, s) {
      var any = s.isserno === 'Y' || s.islot === 'Y' || s.isguaranteedate === 'Y' || trx.q("SELECT 1 AS x FROM m_attributeuse mau JOIN m_attribute ma ON ma.m_attribute_id=mau.m_attribute_id WHERE mau.m_attributeset_id=? AND mau.isactive='Y' AND ma.isactive='Y' AND ma.isinstanceattribute='Y'", [s.m_attributeset_id]).length > 0;
      var want = any ? 'Y' : 'N';
      if (s.isinstanceattribute !== want) trx.update('m_attributeset', s, { isinstanceattribute: want });
      return null;
    } });
  return { form: form, plan: plan, create: create, describe: describe, counter: counter, asiMandatoryFor: asiMandatoryFor, excludeTableEntry: excludeTableEntry, mandatoryMsg: mandatoryMsg, storages: storages, negatives: negatives, mmFifo: mmFifo, useGuaranteeDate: useGuaranteeDate };
});
