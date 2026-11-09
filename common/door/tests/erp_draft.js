// Witness helper: key a DRAFT Standard Order into the ERP twin's op-log, the way a user fills the Sales Order window (header save, line save through the model layer's own
// beforeSave: price, tax, line amount). It is the INPUT of the witnesses, not a verb: lane B offers find / actions / complete only. Same facts go to legacy in the parallel run.
'use strict';
const path = require('path'), ROOT = path.join(__dirname, '..', '..', '..'), EC = require(path.join(ROOT, 'common', 'door', 'erp_cli.js'));
// f = { bp, loc, product, qty, doctype, warehouse, pricelist, client, org, day }  (GardenWorld defaults = the bridge's client_ctx)
async function draftOrder(a, f) {
  f = Object.assign({ bp: 112, loc: 108, product: 137, qty: 2, doctype: 132, warehouse: 103, pricelist: 101, client: 11, org: 11, day: new Date().toISOString().slice(0, 10) + ' 00:00:00' }, f || {});
  const O = await EC.boot(a), ML = O.ML, q = (s, p) => O.rows(s, p), env = { client: f.client, org: f.org, date: f.day };
  const log = console.log; console.log = () => {};
  try {
    let tx = O.trx(); Object.assign(tx.env, env);
    const h = ML.save(tx, 'c_order', null, { ad_client_id: f.client, ad_org_id: f.org, issotrx: 'Y', c_doctypetarget_id: f.doctype, c_doctype_id: 0, c_bpartner_id: f.bp, c_bpartner_location_id: f.loc, bill_bpartner_id: f.bp, bill_location_id: f.loc,
      m_warehouse_id: f.warehouse, m_pricelist_id: f.pricelist, c_currency_id: 100, dateordered: f.day, dateacct: f.day, docstatus: 'DR', docaction: 'CO', processed: 'N', paymentrule: 'B', deliveryrule: 'A', invoicerule: 'I', freightcostrule: 'I', priorityrule: '5', deliveryviarule: 'P', c_paymentterm_id: 105 });
    if (!h.ok) throw new Error('header: ' + h.error);
    const g1 = EC.persistGroup(O, tx.groupOps()), id = g1[g1.length - 1].fields.c_order_id;
    tx = O.trx(); Object.assign(tx.env, env);
    const l = ML.save(tx, 'c_orderline', null, { ad_client_id: f.client, ad_org_id: f.org, c_order_id: id, line: 10, m_product_id: f.product, qtyentered: f.qty, qtyordered: f.qty, m_warehouse_id: f.warehouse, c_bpartner_id: f.bp, c_bpartner_location_id: f.loc, c_currency_id: 100, dateordered: f.day, c_uom_id: 100 });
    if (!l.ok) throw new Error('line: ' + l.error);
    EC.persistGroup(O, tx.groupOps());
    const row = q('SELECT c_order_id, documentno, docstatus, totallines, grandtotal FROM c_order WHERE c_order_id=?', [id])[0];
    return { id, number: row.documentno, docStatus: row.docstatus, totalLines: row.totallines, grandTotal: row.grandtotal, facts: f, lines: q('SELECT m_product_id, qtyordered, priceactual, linenetamt, c_tax_id FROM c_orderline WHERE c_order_id=?', [id]) };
  } finally { console.log = log; }
}
module.exports = { draftOrder };
