// ⚠ PROBE (not a witness), prompts/CAPEX_DASHBOARD.md §5.60: completes PO -> receipt -> invoice -> payment on project 100 in the twin via erp/tests/dd_common.js. Run: NODE_PATH=<bim-ootb>/node_modules node capex/tools/probe_twin_chain.js. Replace by capex/tools/twin_mockchain.js (build order d).
const DD=require('../../erp/tests/dd_common.js');
(async()=>{const H=await DD.boot({});const q=H.q;
console.log('patches',H.patchOk,H.patchBad);H.A.RUNTIME.bind?H.A.RUNTIME.bind(H.q):H.A.bind(H.q);
const bp=q("select c_bpartner_id,name from c_bpartner where ad_client_id=11 and isvendor='Y' limit 1")[0], loc=q('select c_bpartner_location_id from c_bpartner_location where c_bpartner_id=?',[bp.c_bpartner_id])[0];
const prod0=q("select p.m_product_id,pp.pricelist from m_productprice pp join m_product p on p.m_product_id=pp.m_product_id join m_pricelist_version v on v.m_pricelist_version_id=pp.m_pricelist_version_id where v.m_pricelist_id=102 and p.ad_client_id=11 and p.isstocked='N' and pp.pricelist>0 limit 1")[0];const prod=prod0&&{m_product_id:prod0.m_product_id}||q("select m_product_id,name from m_product where ad_client_id=11 and ispurchased='Y' and isstocked='N' limit 1")[0]||q("select m_product_id,name from m_product where ad_client_id=11 limit 1")[0];
const dt=q("select c_doctype_id from c_doctype where ad_client_id=11 and docbasetype='POO' limit 1")[0], wh=q('select m_warehouse_id from m_warehouse where ad_client_id=11 limit 1')[0], pl=q("select m_pricelist_id from m_pricelist where ad_client_id=11 and issopricelist='N' limit 1")[0];
console.log(JSON.stringify({bp,loc,prod,dt,wh,pl}));
let r=H.save('C_Order',{ad_client_id:11,ad_org_id:11,c_doctype_id:dt.c_doctype_id,c_doctypetarget_id:dt.c_doctype_id,issotrx:'N',c_bpartner_id:bp.c_bpartner_id,c_bpartner_location_id:loc.c_bpartner_location_id,m_warehouse_id:wh.m_warehouse_id,m_pricelist_id:pl.m_pricelist_id,c_currency_id:100,c_project_id:100,dateordered:H.DAY,dateacct:H.DAY});
const oid=H.lastId('c_order');console.log('order',oid,JSON.stringify(r).slice(0,200));
r=H.save('C_OrderLine',{ad_client_id:11,ad_org_id:11,c_order_id:oid,m_product_id:prod.m_product_id,qtyordered:10,priceentered:50,pricelist:50,c_project_id:100});
console.log('line',JSON.stringify(r).slice(0,300));
r=H.docAction('C_Order',oid,'CO');console.log('CO',JSON.stringify(r).slice(0,300));
console.log(JSON.stringify(H.one('select docstatus,grandtotal,c_project_id from c_order where c_order_id=?',[oid])));

const ol=H.one('select * from c_orderline where c_order_id=?',[oid]);
let dtr={c_doctype_id:122};console.log('terms',JSON.stringify(H.q('select c_paymentterm_id,name,isvalid from c_paymentterm where ad_client_id=11')),'ol',JSON.stringify(H.one('select priceentered,priceactual,linenetamt,qtyordered,c_tax_id from c_orderline where c_orderline_id=?',[ol.c_orderline_id])),'ord',JSON.stringify(H.one('select grandtotal,totallines,c_paymentterm_id from c_order where c_order_id=?',[oid])));let dti=H.one("select c_doctype_id from c_doctype where ad_client_id=11 and docbasetype='API'"),dtp=H.one("select c_doctype_id from c_doctype where ad_client_id=11 and docbasetype='APP'");
r=H.save('M_InOut',{ad_client_id:11,ad_org_id:11,c_doctype_id:dtr.c_doctype_id,issotrx:'N',movementtype:'V+',c_bpartner_id:bp.c_bpartner_id,c_bpartner_location_id:loc.c_bpartner_location_id,m_warehouse_id:wh.m_warehouse_id,c_order_id:oid,c_project_id:100,movementdate:H.DAY,dateacct:H.DAY});
const rid=H.lastId('m_inout');console.log('receipt hdr',rid,r.ok);
r=H.save('M_InOutLine',{ad_client_id:11,ad_org_id:11,m_inout_id:rid,c_orderline_id:ol.c_orderline_id,m_product_id:prod.m_product_id,movementqty:10,qtyentered:10,c_uom_id:ol.c_uom_id,m_locator_id:H.one('select m_locator_id from m_locator where m_warehouse_id=103 limit 1').m_locator_id});console.log('receipt line',r.ok,(r.log||[]).slice(0,3).join('|'));
r=H.docAction('M_InOut',rid,'CO');console.log('receipt CO',r.ok,(r.log||[]).slice(0,3).join('|'));console.log(JSON.stringify(H.one('select docstatus,c_project_id from m_inout where m_inout_id=?',[rid])));
r=H.save('C_Invoice',{ad_client_id:11,ad_org_id:11,c_doctype_id:dti.c_doctype_id,c_doctypetarget_id:dti.c_doctype_id,issotrx:'N',c_bpartner_id:bp.c_bpartner_id,c_bpartner_location_id:loc.c_bpartner_location_id,m_pricelist_id:pl.m_pricelist_id,c_currency_id:100,c_paymentterm_id:(H.one("select c_paymentterm_id from c_paymentterm where ad_client_id=11 and name='Immediate'")||{}).c_paymentterm_id,c_order_id:oid,c_project_id:100,dateinvoiced:H.DAY,dateacct:H.DAY});
const iid=H.lastId('c_invoice');console.log('inv hdr',iid,r.ok);
r=H.save('C_InvoiceLine',{ad_client_id:11,ad_org_id:11,c_invoice_id:iid,c_orderline_id:ol.c_orderline_id,m_product_id:prod.m_product_id,qtyinvoiced:10,qtyentered:10,priceentered:50,pricelist:50,c_uom_id:ol.c_uom_id,c_project_id:100});console.log('inv line',r.ok,(r.log||[]).slice(0,3).join('|'));
r=H.docAction('C_Invoice',iid,'CO');console.log('inv CO',r.ok,(r.log||[]).slice(0,3).join('|'));console.log(JSON.stringify(H.one('select docstatus,grandtotal,c_project_id from c_invoice where c_invoice_id=?',[iid])));
const ba=H.one('select c_bankaccount_id from c_bankaccount where ad_client_id=11 limit 1');
r=H.save('C_Payment',{ad_client_id:11,ad_org_id:11,c_doctype_id:dtp.c_doctype_id,isreceipt:'N',c_bpartner_id:bp.c_bpartner_id,c_invoice_id:iid,c_order_id:oid,c_project_id:100,c_currency_id:100,payamt:500,datetrx:H.DAY,dateacct:H.DAY,c_bankaccount_id:ba&&ba.c_bankaccount_id,tendertype:'K',trxtype:'S'});
const pid=H.lastId('c_payment');console.log('pay hdr',pid,r.ok,(r.log||[]).slice(0,3).join('|'));
r=H.docAction('C_Payment',pid,'CO');console.log('pay CO',r.ok,(r.log||[]).slice(0,3).join('|'));console.log(JSON.stringify(H.one('select docstatus,payamt,c_project_id from c_payment where c_payment_id=?',[pid])));
console.log(H.logs.filter(l=>/ERR|SEVERE/.test(l)).slice(0,5).join('\n'));
})().catch(e=>console.log('ERR',e.stack))
