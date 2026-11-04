// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mutant table of W-IMPORT-PRODUCT (witness_import_product.js, IPROD_MUTANTS=1). Each entry rewrites the SHIPPED source in a mirror of COPIES (found exactly `count` times else NOT-APPLIED), then the witness re-runs in a child;
//   one named check must print FAIL. A child that crashes without its § verdict is NOT a kill. READ THE LOG: §IPROD-MUTANT lines.
'use strict';
var F = 'processes/ImportProduct.js';
module.exports = [
 { name: 'M01-update-writes-imageurl', kills: ['UPD.imageurl-not-written'], what: 'the update SET list gains ImageURL (twin != legacy :509-550)',
   edits: [{ file: F, from: "ch.updated = nowTs; ch.updatedby = imp.updatedby;", to: "ch.imageurl = imp.imageurl; ch.updated = nowTs; ch.updatedby = imp.updatedby;" }] },
 { name: 'M02-unknown-value-silently-skipped', kills: ['ERR.unknown-value'], what: 'a refused insert leaves no I_ErrorMsg (row looks fine, nothing said)',
   edits: [{ file: F, from: "markError('Insert Product failed'); return; }", to: "return; }" }] },
 { name: 'M03-rerun-reimports', kills: ['RERUN.nothing-new'], what: 'the row is never marked imported (:647-652): a re-run updates all 27 again',
   edits: [{ file: F, from: "{ i_isimported: 'Y', m_product_id: M_Product_ID, updated: nowTs, processed: 'Y' }", to: "{ i_isimported: 'N', m_product_id: M_Product_ID, updated: nowTs, processed: 'Y' }" }] },
 { name: 'M04-match-by-value-dropped', kills: ['UPD.by-value', 'UPD.counts'], what: 'the Value lookup (:182) is dropped: every row is a new product',
   edits: [{ file: F, from: "return { m_product_id: scalar('SELECT m_product_id FROM m_product p WHERE ?=p.value AND ?=p.ad_client_id', [r.value, r.ad_client_id]) }; });", to: "return { m_product_id: null }; });" }] },
 { name: 'M05-insert-drops-imageurl', kills: ['INS.insert-with-imageurl'], what: 'MProduct(X_I_Product) no longer copies ImageURL (MProduct.java:329)',
   edits: [{ file: F, from: "producttype: imp.producttype, imageurl: imp.imageurl,", to: "producttype: imp.producttype," }] },
 { name: 'M06-ddl-table-missing', kills: ['TABLE.ensure'], what: 'the I_Product boot overlay lacks a dictionary column (Group2)',
   edits: [{ file: 'ad_import_tables.js', from: ', "group2" TEXT, "m_attributeset_id" NUMERIC)\'', to: ', "m_attributeset_id" NUMERIC)\'' }] },
 { name: 'M07-not-wired', kills: ['TABLE.wiring'], what: 'idempiere.html does not load processes/ImportProduct.js',
   edits: [{ file: 'idempiere.html', from: '<script src="processes/ImportProduct.js?v=1"></script>', to: '' }] },
 { name: 'M08-reset-producttype-dropped', kills: ['UPD.in-place'], what: 'the Reset COALESCE of ProductType to I (:127-143) is dropped (the copy-from-product then keeps S)',
   edits: [{ file: F, from: "producttype: r.producttype != null ? r.producttype : 'I',", to: "" }] },
 { name: 'M09-client-check-dropped', kills: ['ERR.unknown-value', 'UPD.counts'], what: 'AD_Client_ID parameter is ignored (client 0 used): nothing matches',
   edits: [{ file: F, from: "this.m_AD_Client_ID = pv == null ? 0 : para[i].getParameterAsInt();", to: "this.m_AD_Client_ID = 0;" }] }
];
