// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_import_tables.js — the physical I_* import tables of the ERP twin as a device-local BOOT OVERLAY (prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.1/§13.2 B1 — Witness: W-IMPORT-ORDER, erp/tests/witness_import_order.js; I_Payment added for Import Payment, AD_Process 343 — Witness: W-IMPORT-PAYMENT, erp/tests/witness_import_payment.js).
//
// GAP (measured): erp/ad_seed.db holds AD_Table 591 I_Order (AccessLevel 2) and its 68 AD_Column rows, but NOT the physical table, so Import Orders (AD_Process 206) and window 281 "Import Order" had nothing to read or write.
//
// BASE: the team BASE hash covers the seed file + patches/ad_seed.db.sql + patches/mfg.sql (team_sync.js hashBase) and no base-upgrade path exists - appending a CREATE TABLE to a patch would turn every existing team
//   'base-mismatch'. So, exactly like ad_rule.js ensure(db) (the precedent) and SystemTenant.ensure, the table is created idempotently at boot, outside the base identity. The dictionary rows are already in the seed.
// DDL is copied verbatim from build/erp/ad_full.db (sqlite3 .schema i_order); witness_import_order.js TABLE proves the physical columns == the 68 dictionary columns.
// Determinism: no Date.now / Math.random.
(function (global) {
  'use strict';

  var DDL = {
    // i_payment: AD_Table 597, 74 AD_Column rows in the seed, no physical table (W-IMPORT-PAYMENT B1, prompts/TEAMWORK_FRAMEWORK.md section 41 row B); DDL verbatim from build/erp/ad_full.db (sqlite3 .schema i_payment)
    i_payment: 'CREATE TABLE IF NOT EXISTS "i_payment" ("i_payment_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "processed" TEXT, "c_payment_id" NUMERIC, "documentno" TEXT, "datetrx" TEXT, "isreceipt" TEXT, "c_doctype_id" NUMERIC, "doctypename" TEXT, "trxtype" TEXT, "c_bankaccount_id" NUMERIC, "bankaccountno" TEXT, "c_bpartner_id" NUMERIC, "bpartnervalue" TEXT, "c_invoice_id" NUMERIC, "invoicedocumentno" TEXT, "tendertype" TEXT, "creditcardtype" TEXT, "creditcardnumber" TEXT, "creditcardvv" TEXT, "creditcardexpmm" NUMERIC, "creditcardexpyy" NUMERIC, "micr" TEXT, "routingno" TEXT, "accountno" TEXT, "checkno" TEXT, "a_name" TEXT, "a_street" TEXT, "a_city" TEXT, "a_state" TEXT, "a_zip" TEXT, "a_country" TEXT, "a_ident_dl" TEXT, "a_ident_ssn" TEXT, "a_email" TEXT, "voiceauthcode" TEXT, "swipe" TEXT, "orig_trxid" TEXT, "ponum" TEXT, "c_currency_id" NUMERIC, "payamt" NUMERIC, "discountamt" NUMERIC, "writeoffamt" NUMERIC, "isoverunderpayment" TEXT, "overunderamt" NUMERIC, "c_charge_id" NUMERIC, "chargename" TEXT, "chargeamt" NUMERIC, "taxamt" NUMERIC, "isapproved" TEXT, "isselfservice" TEXT, "isdelayedcapture" TEXT, "r_pnref" TEXT, "r_result" TEXT, "r_respmsg" TEXT, "r_authcode" TEXT, "r_info" TEXT, "processing" TEXT, "iso_code" TEXT, "dateacct" TEXT, "i_payment_uu" TEXT, "iban" TEXT, "swiftcode" TEXT, "description" TEXT, "c_activity_id" NUMERIC, "activityvalue" TEXT)',
    i_order: 'CREATE TABLE IF NOT EXISTS "i_order" ("i_order_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "ad_orgtrx_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "processing" TEXT, "processed" TEXT, "salesrep_id" NUMERIC, "m_warehouse_id" NUMERIC, "m_pricelist_id" NUMERIC, "c_currency_id" NUMERIC, "m_shipper_id" NUMERIC, "issotrx" TEXT, "c_bpartner_id" NUMERIC, "bpartnervalue" TEXT, "name" TEXT, "c_bpartner_location_id" NUMERIC, "billto_id" NUMERIC, "c_location_id" NUMERIC, "address1" TEXT, "address2" TEXT, "postal" TEXT, "city" TEXT, "c_region_id" NUMERIC, "regionname" TEXT, "c_country_id" NUMERIC, "countrycode" TEXT, "ad_user_id" NUMERIC, "contactname" TEXT, "email" TEXT, "phone" TEXT, "c_project_id" NUMERIC, "c_activity_id" NUMERIC, "c_doctype_id" NUMERIC, "doctypename" TEXT, "c_paymentterm_id" NUMERIC, "paymenttermvalue" TEXT, "c_order_id" NUMERIC, "documentno" TEXT, "dateordered" TEXT, "dateacct" TEXT, "description" TEXT, "m_product_id" NUMERIC, "productvalue" TEXT, "upc" TEXT, "sku" TEXT, "c_tax_id" NUMERIC, "taxindicator" TEXT, "taxamt" NUMERIC, "c_orderline_id" NUMERIC, "linedescription" TEXT, "c_uom_id" NUMERIC, "qtyordered" NUMERIC, "priceactual" NUMERIC, "freightamt" NUMERIC, "c_campaign_id" NUMERIC, "c_charge_id" NUMERIC, "chargename" TEXT, "c_ordersource_id" NUMERIC, "c_ordersourcevalue" TEXT, "deliveryrule" TEXT, "i_order_uu" TEXT)'
  };
  function log(s) { try { if (typeof console !== 'undefined') console.log(s); } catch (e) { /* logging never breaks boot */ } }

  // ensure(db) - idempotent boot overlay (a sql.js Database). Returns the number of tables it created (0 when all are already there).
  function ensure(db) {
    var made = 0;
    Object.keys(DDL).forEach(function (t) {
      var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'");
      if (r.length && r[0].values.length) return;
      db.run(DDL[t]); made++;
    });
    log('§IMPORT_TABLES ensure created=' + made + ' (' + Object.keys(DDL).join(', ') + '; boot overlay, outside the team base hash)');
    return made;
  }

  var API = { DDL: DDL, ensure: ensure };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness / ws host
  if (typeof window !== 'undefined') window.AdImportTables = API;              // browser
  else if (global) global.AdImportTables = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
