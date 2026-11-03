// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// friendly_ops.mjs - the opt-in "friendly operations" lens (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). Behaviour observed in Odoo 17 (an order carries its next
// actions as buttons on the record), written here from scratch over the host's own seams; no Odoo code. Installed = lens ON; stopped = the plain legacy twin.
// It names no table, window or form: every action is derived from the record on screen and the dictionary.
//   FO-M5 Save & Complete - while editing a document (the tab has a DocStatus): Save, then the same Complete the DocAction bar dispatches.
//   FO-M4 open a related form - on a saved record: every generic AD_Form with a menu leaf and a parameter named like this record's key opens with that key already chosen.
//   FO-M1 Preview - while editing a record whose model has an afterSave: what Save would write (the same Save chain, never committed).
//   FO-A1 Add <child tab> / Save & back - header: Save, open the child tab and its New in one gesture; child row: Save, back to the parent tab (tab seams only).
//   FO-A2 Next step - a completed document offers the follow-on dictionary process (Ship, Invoice) with its parameters taken from the record; descriptors below are data.
//   FO-B related counts - on a saved record: one button per Zoom Across destination, "<window> (<count>)", opening it exactly as Zoom Across does.

// §42 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md): Ship / Invoice THE AD WAY - dictionary rows rendered by the host's one toolbar, no lens button. Same classnames as the verbatim ports
//   (InOutGenerate 118, InvoiceGenerate 119); the variants default their parameters from the Order (@Column@ = window context) and show only while the order has something left (@SQL= DisplayLogic).
const NOW = '2026-10-17 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const P_SHIP = 53401, P_INV = 53402, P_RECV = 53403, P_BILL = 53404, P_DAYCLOSE = 53405;   // 53405: POS_PLUGIN_LOCAL_FIRST.md §21 Branch Day Close   // 53403/53404: ERP_FRIENDLY_OPS_LENS.md §44 (Purchase Order tab)
const proc = (id, value, name, description, classname) => Object.assign({ ad_process_id: id, value, name, description, accesslevel: '1', isreport: 'N', isdirectprint: 'N', classname, statistic_count: 0, statistic_seconds: 0,
  isbetafunctionality: 'N', isserverprocess: 'N', showhelp: 'Y', allowmultipleexecution: 'Y' }, STD);
// [id, process, name, columnname, seq, ref, refValue, valRule, mandatory, default]
const PARA = [[9534011, P_SHIP, 'Warehouse', 'M_Warehouse_ID', 10, 19, null, null, 'Y', '@M_Warehouse_ID@'], [9534012, P_SHIP, 'Business Partner', 'C_BPartner_ID', 20, 30, null, null, 'N', '@C_BPartner_ID@'],
  [9534013, P_SHIP, 'Document Action', 'DocAction', 50, 17, 135, 219, 'N', 'CO'], [9534014, P_SHIP, 'Consolidate to one Document', 'ConsolidateDocument', 60, 20, null, null, 'N', 'Y'],
  [9534021, P_INV, 'Organization', 'AD_Org_ID', 15, 18, 130, null, 'Y', '@AD_Org_ID@'], [9534022, P_INV, 'Order', 'C_Order_ID', 20, 19, null, 134, 'N', '@C_Order_ID@'],
  [9534023, P_INV, 'Document Action', 'DocAction', 40, 17, 135, 219, 'Y', 'CO'], [9534024, P_INV, 'Consolidate to one Document', 'ConsolidateDocument', 50, 20, null, null, 'N', 'Y']]
  .map((r) => Object.assign({ ad_process_para_id: r[0], ad_process_id: r[1], name: r[2], columnname: r[3], seqno: r[4], ad_reference_id: r[5], ad_reference_value_id: r[6], ad_val_rule_id: r[7], ismandatory: r[8],
    defaultvalue: r[9], fieldlength: 0, iscentrallymaintained: 'Y', isrange: 'N' }, STD));
const ACCESS = [P_SHIP, P_INV, P_RECV, P_BILL].flatMap((pid) => [102, 103, 200001].map((role) => { const r = Object.assign({ ad_process_id: pid, ad_role_id: role, isreadwrite: 'Y', ad_process_access_uu: 'fo-rows-' + pid + '-' + role }, STD); delete r.entitytype; return r; }));
const leftSql = (col) => '@SQL=SELECT 1 FROM C_Order o JOIN C_OrderLine ol ON ol.C_Order_ID=o.C_Order_ID WHERE o.C_Order_ID=@C_Order_ID:0@ AND o.DocStatus=\'CO\' AND ol.M_Product_ID IS NOT NULL AND ol.QtyOrdered<>ol.' + col;
// §44 Purchase Order tab (294): Receive while the PO is Completed and M_InOut_CreateFrom_v still has quantity for it; Create Bill while a completed receipt of it has no invoice line
const RECV_SQL = '@SQL=SELECT 1 FROM M_InOut_CreateFrom_v v JOIN C_Order o ON o.C_Order_ID=v.C_Order_ID WHERE o.C_Order_ID=@C_Order_ID:0@ AND o.IsSOTrx=\'N\' AND o.DocStatus=\'CO\' AND v.Qty>0';
const BILL_SQL = '@SQL=SELECT 1 FROM M_InOut io WHERE io.C_Order_ID=@C_Order_ID:0@ AND io.IsSOTrx=\'N\' AND io.DocStatus=\'CO\' AND NOT EXISTS (SELECT 1 FROM C_InvoiceLine il JOIN M_InOutLine iol ON iol.M_InOutLine_ID=il.M_InOutLine_ID WHERE iol.M_InOut_ID=io.M_InOut_ID)';
const button = (id, comp, name, pid, seq, dl, tab) => Object.assign({ ad_toolbarbutton_id: id, componentname: comp, name, action: 'W', ad_tab_id: tab || 186, ad_process_id: pid, seqno: seq, displaylogic: dl,
  iscustomization: 'N', isadvancedbutton: 'N', isaddseparator: 'N', isshowmore: 'N' }, STD);

// §21 Branch Day Close (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §21): ONE head-office process that runs the SAME ported legacy processes in legacy order for the chosen branch Orgs. Rows are DATA (manifest.dictionary), the class is below.
const P_POSSALES = 9538001, P_IMPORT_ORDER = 206, P_IMPORT_PAYMENT = 343, P_REPLENISH = 53267, M_DAYCLOSE = 9534041, DC_ROLES = [[0, 0], [102, 11]];   // [role, client of the access row]; the head-office clerk, as pos_integration.mjs
// [id, name, columnname, seq, ref, refValue, valRule, mandatory, length]
const DC_PARA = [[9534031, 'Organization', 'AD_Org_ID', 10, 19, null, 130, 'N', 10], [9534032, 'Branch Orgs (comma separated ids; both empty = every Org with pending till rows)', 'BranchOrgs', 20, 10, null, null, 'N', 255],
  [9534033, 'Business Day', 'BusinessDay', 30, 15, null, null, 'Y', 7], [9534034, 'Bank Account', 'C_BankAccount_ID', 40, 19, null, null, 'Y', 10],
  [9534035, 'Business Partner', 'C_BPartner_ID', 50, 18, 223, null, 'N', 10], [9534036, 'Product Category', 'M_Product_Category_ID', 60, 19, null, null, 'N', 10], [9534037, 'Is Kanban', 'IsKanban', 70, 17, 319, null, 'N', 1],
  [9534038, 'Create', 'ReplenishmentCreate', 80, 17, 53412, null, 'N', 3], [9534039, 'Document Type', 'C_DocType_ID', 90, 19, null, 229, 'N', 10]]
  .map((r) => Object.assign({ ad_process_para_id: r[0], ad_process_id: P_DAYCLOSE, name: r[1], columnname: r[2], seqno: r[3], ad_reference_id: r[4], ad_reference_value_id: r[5], ad_val_rule_id: r[6], ismandatory: r[7], fieldlength: r[8],
    defaultvalue: null, iscentrallymaintained: 'Y', isrange: 'N' }, STD));
const DC_ACCESS = DC_ROLES.map((r) => { const x = Object.assign({ ad_process_id: P_DAYCLOSE, ad_role_id: r[0], isreadwrite: 'Y', ad_process_access_uu: 'fo-rows-' + P_DAYCLOSE + '-' + r[0] }, STD); x.ad_client_id = r[1]; delete x.entitytype; return x; });
const DC_MENU = Object.assign({ ad_menu_id: M_DAYCLOSE, name: 'Branch Day Close', description: 'Import the branches\' till sales for a business day, then the Replenish Report and its create, in legacy order', issummary: 'N', issotrx: 'Y', isreadonly: 'N',
  action: 'P', ad_process_id: P_DAYCLOSE, iscentrallymaintained: 'Y' }, STD);
const DC_NODE = { ad_tree_id: 10, node_id: M_DAYCLOSE, parent_id: 163, seqno: 27, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };

export const manifest = {
  id: 'org.kernel.friendly-ops',
  name: 'Friendly operations lens',
  version: '0.4.0',
  engineVersion: '>=0.9.0',
  requires: {},
  dictionary: [
    { table: 'ad_process', idCol: 'ad_process_id', rows: [proc(P_SHIP, 'FO_Order_Ship', 'Ship', 'Generate the shipment for this order', 'org.compiere.process.InOutGenerate'),
      proc(P_INV, 'FO_Order_Invoice', 'Invoice', 'Generate the invoice for this order', 'org.compiere.process.InvoiceGenerate'),
      proc(P_RECV, 'FO_Order_Receive', 'Receive', 'Receive the open lines of this purchase order (Material Receipt from the order, completed)', 'org.kernel.friendlyops.OrderReceive'),
      proc(P_BILL, 'FO_Order_Bill', 'Create Bill', 'Create the vendor invoice from this order\'s completed receipts (Generate Invoice from Receipt), completed', 'org.kernel.friendlyops.OrderBill'),
      Object.assign(proc(P_DAYCLOSE, 'FO_Branch_Day_Close', 'Branch Day Close', 'Close the branches\' business day at head office: Import POS Sales (or Import Orders + Import Payment), Replenish Report, its create; stops at the first error', 'org.kernel.friendlyops.BranchDayClose'), { accesslevel: '3',
        help: 'Runs the legacy processes in legacy order for each chosen branch Org, each step reported on its own line. Before the import an audit gate holds back any till/day whose ticket numbers have a gap or whose tickets do not balance; held tills are named and never imported. Every step stays runnable on its own from its own menu entry.' })] },
    { table: 'ad_process_para', idCol: 'ad_process_para_id', rows: PARA.concat(DC_PARA) },
    { table: 'ad_process_access', idCol: 'ad_process_access_uu', rows: ACCESS.concat(DC_ACCESS) },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [DC_MENU] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [DC_NODE] },
    { table: 'ad_toolbarbutton', idCol: 'ad_toolbarbutton_id', rows: [button(53431, 'FO_Order_Ship', 'Ship', P_SHIP, 20, leftSql('QtyDelivered')), button(53432, 'FO_Order_Invoice', 'Invoice', P_INV, 30, leftSql('QtyInvoiced')),
      button(53433, 'FO_Order_Receive', 'Receive', P_RECV, 20, RECV_SQL, 294), button(53434, 'FO_Order_Bill', 'Create Bill', P_BILL, 30, BILL_SQL, 294)] }
  ]
};

const BREAK = (typeof globalThis !== 'undefined' && globalThis.__FOPS_BREAK) || null;   // witness-only negative control (W-FRIENDLY-OPS F5)

// FO-A4 descriptor (Receive payment): DATA. Ship / Invoice are no longer here: they are dictionary rows (manifest.dictionary below, ERP_FRIENDLY_OPS_LENS.md §42).
const NEXT = [
  // a NEW record of another table with fields preset (a value starting '@' is read from the 'when' row, else from this record's column)
  { table: 'c_order', status: 'CO', id: 'pay', label: 'Receive payment', newTable: 'c_payment',
    preset: { AD_Org_ID: 'ad_org_id', C_BPartner_ID: 'c_bpartner_id', C_Invoice_ID: '@c_invoice_id' },
    when: "SELECT c_invoice_id FROM c_invoice WHERE c_order_id=:key AND docstatus='CO' AND ispaid='N' ORDER BY c_invoice_id LIMIT 1" }
];
function nextSteps(api) {
  if (!api.tab || api.keyVal == null || api.isNew || api.dirty) return [];
  const t = String(api.tab.tableName || '').toLowerCase(), st = String(api.val('docstatus') || '');
  return NEXT.filter((n) => n.table === t && n.status === st && api.exists(n.when));   // a step whose 'when' finds nothing (nothing left to ship / invoice / pay) is not offered
}

const lens = {
  actions(api) {
    const out = [];
    nextSteps(api).forEach((n) => out.push({ id: 'next:' + n.id, label: n.label, title: n.label + ' this document: runs the dictionary process with this record\'s values already set' }));
    if (api.editing && api.hasAfterSave && (api.isNew || api.dirty)) out.push({ id: 'preview', label: 'Preview', title: 'Show what Save will write, without saving' });
    return out;
  },
  run(actionId, api) {
    if (actionId === 'preview') return api.previewSave();
    const nx = /^next:(.+)$/.exec(actionId);
    if (nx) { const n = NEXT.find((x) => x.id === nx[1]); if (!n) return null; const wr = api.row(n.when) || {}; const pre = {}; Object.keys(n.preset).forEach((k) => { const v = n.preset[k]; pre[k] = v.charAt(0) === '@' ? wr[v.slice(1)] : api.val(v); });
      if (n.newTable) return api.openNew(n.newTable, BREAK === 'nopreset' ? {} : pre);
      return null; }
    return null;
  }
};


// §44 the two plugin-defined process classes: they only resolve the id of the OTHER document and call the legacy code (CreateFromInOut.createLineFrom/updateFrom, InOutCreateInvoice, processIt).
function receiveClass(SvrProcess, X) {
  const P = globalThis.AdProcess;
  function OrderReceive() { SvrProcess.call(this); }
  OrderReceive.prototype = Object.create(SvrProcess.prototype);
  OrderReceive.prototype.prepare = function () {};
  OrderReceive.prototype.doIt = function () {
    const trx = this.get_TrxName(), g = P.PSUP.docgen, C = g.ctor(), CF = P.JAVA['org.compiere.process.CreateFromInOut'], orderId = this.getRecord_ID();
    if (!orderId) throw new Error('@NotFound@ @C_Order_ID@');
    const order = trx.get('c_order', orderId);
    if (!order || order.docstatus !== 'CO' || order.issotrx === 'Y') throw new Error('Order not completed or not a purchase order');
    if (BREAK === 'nolines') { /* control: header only */ }
    const dt = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='MMR' AND isactive='Y' AND issotrx='N' ORDER BY isdefault DESC, c_doctype_id", [order.ad_client_id])[0];   // MInOut.setC_DocType_ID(MMR)
    if (!dt) throw new Error('@NotFound@ @C_DocType_ID@ MMR');
    const hdr = C.MInOutFromOrder(trx, order, dt.d, null);
    if (!hdr.save()) throw new Error('Cannot save Material Receipt header');
    const inout = trx.get('m_inout', hdr.id());
    const open = trx.q('SELECT c_orderline_id AS ol, c_uom_id AS uom, m_locator_id AS loc, m_product_id AS pr, qty AS q FROM m_inout_createfrom_v WHERE c_order_id=? AND qty>0 ORDER BY line', [orderId]);
    let n = 0;
    if (BREAK !== 'nolines') open.forEach((r) => { CF.createLineFrom(trx, inout, { orderLine: Number(r.ol), product: Number(r.pr || 0), uom: Number(r.uom || 0), qty: X.A.toBD(String(r.q)), locator: Number(r.loc || 0) }); n++; });
    CF.updateFrom(trx, inout, order, null, null);
    const res = g.ML().processIt(trx, 'm_inout', inout.m_inout_id, 'CO');
    if (!res || !res.ok) throw new Error('Material Receipt Process Failed: ' + inout.m_inout_id + ' - ' + (res && res.msg));
    const done = trx.get('m_inout', inout.m_inout_id);
    this.addLog(done.m_inout_id, done.movementdate, null, '@Created@ ' + done.documentno + ' (' + n + ')', 319, done.m_inout_id);
    return '@Created@ = ' + n;
  };
  return OrderReceive;
}
function billClass(SvrProcess, X) {
  const P = globalThis.AdProcess;
  function OrderBill() { SvrProcess.call(this); }
  OrderBill.prototype = Object.create(SvrProcess.prototype);
  OrderBill.prototype.prepare = function () {};
  OrderBill.prototype.doIt = function () {
    const trx = this.get_TrxName(), g = P.PSUP.docgen, orderId = this.getRecord_ID(), Cls = P.JAVA['org.compiere.process.InOutCreateInvoice'];
    if (!orderId) throw new Error('@NotFound@ @C_Order_ID@');
    const receipts = trx.q("SELECT io.m_inout_id AS id FROM m_inout io WHERE io.c_order_id=? AND io.issotrx='N' AND io.docstatus='CO' AND NOT EXISTS (SELECT 1 FROM c_invoiceline il JOIN m_inoutline iol ON iol.m_inoutline_id=il.m_inoutline_id WHERE iol.m_inout_id=io.m_inout_id) ORDER BY io.m_inout_id", [orderId]);
    if (!receipts.length) throw new Error('@NotFound@ M_InOut');
    let n = 0;
    receipts.forEach((r) => {                                                           // the legacy process, Record_ID = the receipt, in this Trx
      const sub = new Cls(), pi = { AD_Process_ID: 0, Record_ID: Number(r.id), Table_ID: 319, parameter: [], ctx: this.getCtx() };
      if (!sub.startProcess(this.getCtx(), pi, trx) || pi.isError) throw new Error('Generate Invoice from Receipt failed: ' + pi.summary);
      const invId = sub.logs && sub.logs[0] && sub.logs[0].recordId;   // InOutCreateInvoice.addLog(C_Invoice_ID, ..., 318, C_Invoice_ID)
      if (!invId) throw new Error('Generate Invoice from Receipt created no invoice');
      const res = g.ML().processIt(trx, 'c_invoice', invId, 'CO');
      if (!res || !res.ok) throw new Error('Vendor Invoice Process Failed: ' + invId + ' - ' + (res && res.msg));
      n++;
    });
    return '@Created@ = ' + n;
  };
  return OrderBill;
}

// §21 Branch Day Close - the one process class. It calls the legacy processes through AdProcess.runInTrx (the dictionary names each class), in ONE Trx, each behind a savepoint; it owns no business rule.
//   GATE (§21.2): only what the till really sends (I_Order / I_Payment rows; no Z travels): ticket-number gaps per till series and lines-vs-tenders per ticket. A till/day with a gap or an unbalanced ticket is withheld whole and named.
//   STOP (§21.1): a failed step is rolled back alone, the close stops, earlier steps stay; the class returns normally so they commit (a throw would roll the whole group back).
let HOSTP = null;                                                                       // ctx.process of activate(): the AdProcess engine through the plugin's own extension point
function dayCloseClass(SvrProcess, X) {
  const AP = () => HOSTP || globalThis.AdProcess;
  const nz = (v) => (v == null || v === '' ? 0 : Number(v));
  const cents = (v) => Math.round(Number(v == null ? 0 : v) * 100);
  const money = (c) => (c / 100).toFixed(2);
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const KEY = /^(.*-([A-Z]))(\d+)$/;                                                     // till_core.js keyPrefix: <OrgValue>-<TillUserValue>-<S|R|P><n>
  const DC_BREAK = (typeof globalThis !== 'undefined' && globalThis.__DAYCLOSE_BREAK) || '';   // witness-only negative control
  function BranchDayClose() { SvrProcess.call(this); this.p = {}; }
  BranchDayClose.prototype = Object.create(SvrProcess.prototype);
  BranchDayClose.prototype.prepare = function () {
    const para = this.getParameter();
    for (let i = 0; i < para.length; i++) {
      const name = para[i].getParameterName(), pv = para[i].getParameter();
      if (pv == null || pv === '') continue;
      if (name === 'AD_Org_ID' || name === 'C_BankAccount_ID' || name === 'C_BPartner_ID' || name === 'M_Product_Category_ID' || name === 'C_DocType_ID') this.p[name] = para[i].getParameterAsInt();
      else if (name === 'BusinessDay') this.p[name] = String(pv).slice(0, 10);
      else if (name === 'BranchOrgs' || name === 'IsKanban' || name === 'ReplenishmentCreate') this.p[name] = String(pv);
      else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA BranchDayClose ' + name);
    }
  };
  // the audit gate for ONE branch Org and the business day: reads the till's own deposit rows only
  function gate(trx, C, org, day) {
    const rowsO = trx.q('SELECT documentno AS k, qtyordered AS q, priceactual AS p, substr(dateordered,1,10) AS d, i_isimported AS imp FROM i_order WHERE ad_client_id=? AND ad_org_id=?', [C, org]);
    const rowsP = trx.q('SELECT documentno AS k, payamt AS a, substr(datetrx,1,10) AS d, i_isimported AS imp FROM i_payment WHERE ad_client_id=? AND ad_org_id=?', [C, org]);
    const pend = (r) => String(r.imp) !== 'Y';
    const keys = {};                                                                      // the day's pending tickets
    const K = (k) => keys[k] || (keys[k] = { key: k, lines: 0, lc: 0, tenders: 0, tc: 0 });
    rowsO.filter((r) => pend(r) && r.d === day).forEach((r) => { const t = K(r.k); t.lines++; t.lc += cents(nz(r.q) * nz(r.p)); });
    rowsP.filter((r) => pend(r) && r.d === day).forEach((r) => { const t = K(r.k); t.tenders++; t.tc += cents(r.a); });
    const known = {};                                                                     // every number the head office has ever seen per series: any row, any day, any state, and the orders made
    const see = (k) => { const m = KEY.exec(String(k || '')); if (m) (known[m[1]] = known[m[1]] || {})[Number(m[3])] = 1; };
    rowsO.forEach((r) => see(r.k)); rowsP.forEach((r) => see(r.k));
    trx.q("SELECT documentno AS k FROM c_order WHERE ad_client_id=? AND ad_org_id=? AND issotrx='Y'", [C, org]).forEach((r) => see(r.k));
    const tills = {};
    const till = (k) => { const m = KEY.exec(k); return m ? m[1].slice(0, -1) : '(unkeyed)'; };
    Object.keys(keys).forEach((k) => { const t = till(k), T = tills[t] = tills[t] || { till: t, keys: [], gaps: [], unbal: [], max: {} }; T.keys.push(keys[k]); const m = KEY.exec(k); if (m) T.max[m[1]] = Math.max(T.max[m[1]] || 0, Number(m[3])); });
    const left = [];
    Object.keys(tills).forEach((t) => { const T = tills[t];
      Object.keys(T.max).forEach((series) => { for (let n = 1; n <= T.max[series]; n++) if (!(known[series] || {})[n]) T.gaps.push(series + n); });
      T.keys.forEach((k) => { const m = KEY.exec(k.key), type = m ? m[2] : '';
        if (type === 'P' && !k.lines && k.tenders) { k.customerPayment = true; return; }                  // a customer payment (till_core.js kind P): I_Payment only, imported by Import Payment (343)
        if (!k.lines || !k.tenders || k.lc !== k.tc) T.unbal.push(k.key + ' lines=' + money(k.lc) + ' tenders=' + money(k.tc) + ' difference=' + money(k.tc - k.lc)); }); });
    const out = { tills: [], pass: [], left: [], withheld: [], pending: Object.keys(keys).length,
      otherDayPending: rowsO.filter((r) => pend(r) && r.d !== day).length + rowsP.filter((r) => pend(r) && r.d !== day).length };
    Object.keys(tills).sort().forEach((t) => { const T = tills[t], bad = (T.gaps.length || T.unbal.length) && DC_BREAK !== 'nogate';
      out.tills.push({ till: t, keys: T.keys.length, gaps: T.gaps, unbal: T.unbal, withheld: !!bad });
      if (bad) out.withheld.push({ till: t, reason: [T.gaps.length ? 'gap ' + T.gaps.join(',') : '', T.unbal.length ? 'unbalanced ' + T.unbal.join('; ') : ''].filter(Boolean).join(' | '), keys: T.keys.map((k) => k.key) });
      else T.keys.forEach((k) => { if (k.customerPayment) out.left.push(k.key); else out.pass.push(k.key); }); });
    return out;
  }
  BranchDayClose.prototype.doIt = function () {
    const self = this, trx = this.get_TrxName(), A = X.A, C = this.getAD_Client_ID(), P = this.p, ap = AP(), line = (s) => { trx.say(s); };
    if (!P.BusinessDay) throw new Error('@FillMandatory@ @BusinessDay@');
    if (!P.C_BankAccount_ID) throw new Error('@NotFound@ @C_BankAccount_ID@ - 0');
    const day = P.BusinessDay;
    const posCls = (trx.q('SELECT classname AS c FROM ad_process WHERE ad_process_id=? AND isactive=?', [P_POSSALES, 'Y'])[0] || {}).c, usePOS = !!(posCls && ap.JAVA[posCls]);
    let orgs;
    if (P.AD_Org_ID) orgs = [P.AD_Org_ID];
    else if (P.BranchOrgs) orgs = P.BranchOrgs.split(',').map((x) => Number(String(x).trim())).filter((x) => x > 0);
    else orgs = trx.q('SELECT DISTINCT o FROM (SELECT ad_org_id AS o, i_isimported AS i, substr(dateordered,1,10) AS d FROM i_order WHERE ad_client_id=? UNION ALL SELECT ad_org_id, i_isimported, substr(datetrx,1,10) FROM i_payment WHERE ad_client_id=?) WHERE i IS NOT \'Y\' AND d=? AND o IS NOT NULL ORDER BY o', [C, C, day]).map((r) => Number(r.o));
    orgs = orgs.filter((o, i, a) => a.indexOf(o) === i).sort((a, b) => a - b);
    line('§DAYCLOSE-START client=' + C + ' day=' + day + ' branches=' + orgs.join(',') + ' import=' + (usePOS ? 'Import POS Sales ' + P_POSSALES : 'Import Orders ' + P_IMPORT_ORDER + ' + Import Payment ' + P_IMPORT_PAYMENT) + ' replenishCreate=' + (P.ReplenishmentCreate || 'none') + ' break=' + (DC_BREAK || 'none'));
    if (!orgs.length) { line('§DAYCLOSE-EMPTY day=' + day + ' no branch has pending till rows for this day: nothing judged'); this.addLog(0, null, null, 'Nothing to close for ' + day); return 'Branch Day Close: nothing pending for ' + day; }
    line('§DAYCLOSE-GATE z=NOT-AVAILABLE the till sends no Z declaration and no closed-shift marker (till.js closeCash keeps them on the device); judged: ticket-number gaps and lines vs tenders only');
    let stopped = null, done = 0, imported = 0, withheldN = 0, pin = 0, fbReason = null;
    const step = (org, name, fn) => {
      const sp = trx.setSavepoint(), log0 = trx.log.length;
      let res;
      try { res = fn(); } catch (e) { res = { ok: false, msg: clean((e && e.message) || e) }; }
      if (res.ok) { line('§DAYCLOSE-STEP org=' + org + ' step="' + name + '" result=OK ' + clean(res.msg || '')); self.addLog(0, null, null, 'Org ' + org + ' - ' + name + ': ' + clean(res.msg || 'OK')); return true; }
      if (!res.keep) trx.rollbackTo(sp);                                                  // the failed step alone (one legacy process = one commit); a refusal Import POS Sales already undid keeps its own marks
      const inner = trx.log.slice(log0).filter((l) => /^§(IMPORT_ORDER|IMPORT_PAYMENT|POSS-TICKET)/.test(l) && /REFUSED|EXCEPTION|REFUSED|COLLISION/.test(l)).map((l) => clean(l).slice(0, 200)).join(' ');
      stopped = { org, step: name, reason: clean(res.msg) + (inner ? ' ' + inner : '') };
      line('§DAYCLOSE-STEP org=' + org + ' step="' + name + '" result=FAILED reason="' + stopped.reason.slice(0, 400) + '"'); self.addLog(0, null, A.toBD('1'), '@Errors@ Org ' + org + ' - ' + name + ': ' + stopped.reason.slice(0, 300));
      return false;
    };
    const pendingOf = (org) => trx.find('i_order', {}, null, { exclude: { i_isimported: 'Y' } }).filter((r) => nz(r.ad_org_id) === org).length;
    // the three steps (an array so every step stays one named unit; the order IS legacy's, §2.3)
    const steps = (org, g, whs) => {
      const imp = () => step(org, usePOS ? 'Import POS Sales' : 'Import Orders + Import Payment', () => {
        if (usePOS) {
          let n = 0;
          for (const k of g.pass) {
            const l0 = trx.log.length, r = ap.runInTrx(trx, P_POSSALES, { params: { AD_Client_ID: C, AD_Org_ID: org, C_BankAccount_ID: P.C_BankAccount_ID, DocumentNo: k } });
            const t = trx.log.slice(l0).filter((l) => /^§POSS-TICKET /.test(l) && l.indexOf(' key=' + k + ' ') > 0)[0] || '';
            if (!r.ok || /result=REFUSED/.test(t)) return { ok: false, keep: true, msg: 'ticket ' + k + ' not imported: ' + clean(r.ok ? t.replace(/^.*reason=/, '') : r.summary) };
            n++;
          }
          imported += n; return { ok: true, msg: 'tickets=' + n };
        }
        if (fbReason) return { ok: false, msg: 'BLOCKED, nothing imported: ' + fbReason };   // Import Orders / Import Payment read EVERY pending row of the client whatever Org is given: they cannot be scoped to the gate-passed tickets
        const po = ap.runInTrx(trx, P_IMPORT_ORDER, { params: { AD_Client_ID: C, AD_Org_ID: org, DocAction: 'CO', DeleteOldImported: 'N' } });
        if (!po.ok) return { ok: false, msg: 'Import Orders: ' + clean(po.summary) };
        const bad = trx.find('i_order', {}).filter((r) => nz(r.ad_org_id) === org && String(r.i_isimported) === 'E');
        if (bad.length) return { ok: false, msg: 'Import Orders refused ' + bad.length + ' line(s): ' + clean(bad[0].i_errormsg) };
        const pp = ap.runInTrx(trx, P_IMPORT_PAYMENT, { params: { AD_Org_ID: org, C_BankAccount_ID: P.C_BankAccount_ID, DocAction: 'CO', DeleteOldImported: 'N' } });
        if (!pp.ok) return { ok: false, msg: 'Import Payment: ' + clean(pp.summary) };
        const badp = trx.find('i_payment', {}).filter((r) => nz(r.ad_org_id) === org && String(r.i_isimported) === 'E');
        if (badp.length) return { ok: false, msg: 'Import Payment refused ' + badp.length + ' row(s): ' + clean(badp[0].i_errormsg) };
        imported += g.pass.length; return { ok: true, msg: 'tickets=' + g.pass.length };
      });
      const rep = (create) => () => {
        let n = 0, sum = [];
        for (const w of whs) {
          const params = { M_Warehouse_ID: w };
          ['C_BPartner_ID', 'M_Product_Category_ID', 'IsKanban'].forEach((k) => { if (P[k] != null) params[k] = P[k]; });
          if (create) { params.ReplenishmentCreate = P.ReplenishmentCreate; params.C_DocType_ID = P.C_DocType_ID; }
          const r = ap.runInTrx(trx, P_REPLENISH, { params, pinstance: 910000000 + (++pin) });   // each run its own AD_PInstance (legacy: one per run), so T_Replenish rows of the report and of the create never collide in this one Trx
          if (!r.ok) return { ok: false, msg: 'warehouse ' + w + ': ' + clean(r.summary) };
          sum.push(w + ':' + clean(r.summary)); n++;
        }
        return { ok: true, msg: 'warehouses=' + n + ' ' + sum.join(' ') };
      };
      const list = [['import', imp], ['report', () => step(org, 'Replenish Report', rep(false))]];
      if (P.ReplenishmentCreate) list.push(['create', () => step(org, 'Replenish confirm create ' + P.ReplenishmentCreate, rep(true))]);
      else list.push(['create', () => { line('§DAYCLOSE-STEP org=' + org + ' step="Replenish confirm create" result=SKIPPED not requested'); return true; }]);
      if (DC_BREAK === 'order') { const a = list[0]; list[0] = list[2]; list[2] = a; }   // witness-only negative control: the Replenish create before the Import
      return list;
    };
    const plans = orgs.map((org) => {                                                      // the gate judges every branch BEFORE any step (committed deposits only)
      const g = gate(trx, C, org, day), whs = trx.q("SELECT m_warehouse_id AS w FROM m_warehouse WHERE ad_client_id=? AND ad_org_id=? AND isactive='Y' ORDER BY m_warehouse_id", [C, org]).map((r) => Number(r.w));
      g.tills.forEach((t) => line('§DAYCLOSE-GATE org=' + org + ' day=' + day + ' till=' + t.till + ' tickets=' + t.keys + ' gaps=' + t.gaps.length + ' unbalanced=' + t.unbal.length + ' ' + (t.withheld ? 'WITHHELD' : 'PASS')));
      g.withheld.forEach((w) => { withheldN++; line('§DAYCLOSE-GATE org=' + org + ' day=' + day + ' WITHHELD till=' + w.till + ' reason="' + w.reason + '" keys=' + w.keys.join(',')); self.addLog(0, null, null, 'Org ' + org + ' till ' + w.till + ' WITHHELD: ' + w.reason); });
      g.left.forEach((k) => line('§DAYCLOSE-GATE org=' + org + ' LEFT key=' + k + ' customer payment (no lines): import it with Import Payment (343)'));
      if (!g.pending) line('§DAYCLOSE-GATE org=' + org + ' day=' + day + ' INCONCLUSIVE no pending ticket for this branch and day: nothing judged');
      line('§DAYCLOSE-BRANCH org=' + org + ' warehouses=' + whs.join(',') + ' pass=' + g.pass.length + ' withheld=' + g.withheld.length + ' left=' + g.left.length);
      if (!g.pending) { line('§DAYCLOSE-BRANCH org=' + org + ' SKIPPED nothing pending for ' + day + ': no step runs (Replenish create is not idempotent in legacy; a re-run must make nothing new)'); return { org, list: [0, 1, 2].map(() => ['skipped', () => true]) }; }
      return { org, g, list: steps(org, g, whs) };
    });
    if (!usePOS) {                                                                         // fallback: the unscoped legacy imports are safe only when the gate held nothing and nothing else is pending
      const held = plans.filter((p) => p.g.withheld.length).map((p) => 'Org ' + p.org + ' ' + p.g.withheld.map((w) => w.till).join(',')), out = trx.q('SELECT COUNT(*) AS n FROM (SELECT ad_org_id AS o, substr(dateordered,1,10) AS d FROM i_order WHERE ad_client_id=? AND i_isimported IS NOT \'Y\' UNION ALL SELECT ad_org_id, substr(datetrx,1,10) FROM i_payment WHERE ad_client_id=? AND i_isimported IS NOT \'Y\') WHERE d IS NOT ? OR o NOT IN (' + orgs.join(',') + ')', [C, C, day])[0];
      if (held.length || nz(out && out.n) > 0) fbReason = (held.length ? 'the gate withheld ' + held.join('; ') : '') + (nz(out && out.n) > 0 ? (held.length ? '; ' : '') + nz(out.n) + ' pending row(s) of other days or Orgs would be imported too' : '') + '. Stage Import POS Sales for per-ticket control, or correct the held tills.';
    }
    // legacy order, stage by stage over the chosen branches (a clerk runs Import for them, then the Replenish Report, then its create): the same sequence of runs the separate-steps path makes
    for (let st = 0; st < 3 && !stopped; st++) for (const p of plans) { if (stopped) break; p.list[st][1](); }
    if (!stopped) done = orgs.length;
    const msg = stopped ? 'Branch Day Close STOPPED at step "' + stopped.step + '" (Org ' + stopped.org + '): ' + stopped.reason : 'Branch Day Close done: branches=' + done + ' tickets imported=' + imported + ' till/day withheld=' + withheldN;
    line('§DAYCLOSE-RESULT ' + (stopped ? 'STOPPED' : 'DONE') + ' branches=' + done + '/' + orgs.length + ' imported=' + imported + ' withheld=' + withheldN + (stopped ? ' at="' + stopped.step + '" org=' + stopped.org : ''));
    return msg;
  };
  return BranchDayClose;
}
export async function activate(ctx) {
  HOSTP = ctx.process || null;
  if (!ctx.lens) throw new Error('host has no lens extension point');
  ctx.lens.register('friendly-ops', lens);
  if (ctx.process && ctx.process.defineProcess) { ctx.process.defineProcess('org.kernel.friendlyops.OrderReceive', receiveClass); ctx.process.defineProcess('org.kernel.friendlyops.OrderBill', billClass); ctx.process.defineProcess('org.kernel.friendlyops.BranchDayClose', dayCloseClass); }
}
export async function deactivate() { /* ctx.lens registrations are owner-removed by the registry on stop */ }
