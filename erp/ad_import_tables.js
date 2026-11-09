// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_import_tables.js — the physical I_* import tables of the ERP twin as a device-local BOOT OVERLAY (prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.1/§13.2 B1 — Witness: W-IMPORT-ORDER, erp/tests/witness_import_order.js; I_Payment added for Import Payment, AD_Process 343 — Witness: W-IMPORT-PAYMENT, erp/tests/witness_import_payment.js; I_Product added for Import Product, AD_Process 196 - Witness: W-IMPORT-PRODUCT, erp/tests/witness_import_product.js).
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
    // i_product: AD_Table 532, 58 AD_Column rows in the seed, no physical table (W-IMPORT-PRODUCT, prompts/POS_PLUGIN_LOCAL_FIRST.md section 30; Import Product AD_Process 196); DDL verbatim from build/erp/ad_full.db (sqlite3 .schema i_product)
    i_product: 'CREATE TABLE IF NOT EXISTS "i_product" ("i_product_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "m_product_id" NUMERIC, "value" TEXT, "name" TEXT, "description" TEXT, "documentnote" TEXT, "help" TEXT, "upc" TEXT, "sku" TEXT, "x12de355" TEXT, "c_uom_id" NUMERIC, "productcategory_value" TEXT, "m_product_category_id" NUMERIC, "producttype" TEXT, "classification" TEXT, "volume" NUMERIC, "weight" NUMERIC, "shelfwidth" NUMERIC, "shelfheight" NUMERIC, "shelfdepth" NUMERIC, "unitsperpallet" NUMERIC, "discontinued" TEXT, "discontinuedby" TEXT, "imageurl" TEXT, "descriptionurl" TEXT, "bpartner_value" TEXT, "c_bpartner_id" NUMERIC, "iso_code" TEXT, "c_currency_id" NUMERIC, "pricelist" NUMERIC, "pricepo" NUMERIC, "royaltyamt" NUMERIC, "priceeffective" TEXT, "vendorproductno" TEXT, "vendorcategory" TEXT, "manufacturer" TEXT, "order_min" NUMERIC, "order_pack" NUMERIC, "costperorder" NUMERIC, "deliverytime_promised" NUMERIC, "processing" TEXT, "processed" TEXT, "pricestd" NUMERIC, "pricelimit" NUMERIC, "discontinuedat" TEXT, "i_product_uu" TEXT, "customstariffnumber" TEXT, "group1" TEXT, "group2" TEXT, "m_attributeset_id" NUMERIC)',
    i_order: 'CREATE TABLE IF NOT EXISTS "i_order" ("i_order_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "ad_orgtrx_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "processing" TEXT, "processed" TEXT, "salesrep_id" NUMERIC, "m_warehouse_id" NUMERIC, "m_pricelist_id" NUMERIC, "c_currency_id" NUMERIC, "m_shipper_id" NUMERIC, "issotrx" TEXT, "c_bpartner_id" NUMERIC, "bpartnervalue" TEXT, "name" TEXT, "c_bpartner_location_id" NUMERIC, "billto_id" NUMERIC, "c_location_id" NUMERIC, "address1" TEXT, "address2" TEXT, "postal" TEXT, "city" TEXT, "c_region_id" NUMERIC, "regionname" TEXT, "c_country_id" NUMERIC, "countrycode" TEXT, "ad_user_id" NUMERIC, "contactname" TEXT, "email" TEXT, "phone" TEXT, "c_project_id" NUMERIC, "c_activity_id" NUMERIC, "c_doctype_id" NUMERIC, "doctypename" TEXT, "c_paymentterm_id" NUMERIC, "paymenttermvalue" TEXT, "c_order_id" NUMERIC, "documentno" TEXT, "dateordered" TEXT, "dateacct" TEXT, "description" TEXT, "m_product_id" NUMERIC, "productvalue" TEXT, "upc" TEXT, "sku" TEXT, "c_tax_id" NUMERIC, "taxindicator" TEXT, "taxamt" NUMERIC, "c_orderline_id" NUMERIC, "linedescription" TEXT, "c_uom_id" NUMERIC, "qtyordered" NUMERIC, "priceactual" NUMERIC, "freightamt" NUMERIC, "c_campaign_id" NUMERIC, "c_charge_id" NUMERIC, "chargename" TEXT, "c_ordersource_id" NUMERIC, "c_ordersourcevalue" TEXT, "deliveryrule" TEXT, "i_order_uu" TEXT)'
  };
  // I_Inventory (AD_Table 572, 38 AD_Column rows in the seed, no physical table) for Import Inventory, AD_Process 219 - Witness: W-IMPORT-INVENTORY (erp/tests/witness_import_inventory.js), prompts/POS_PLUGIN_LOCAL_FIRST.md section 37; DDL verbatim from
  //   build/erp/ad_full.db (sqlite3 .schema i_inventory). Kept apart from DDL (as Recurring) so ensure() still reports the three older import tables; ensure() calls ensureInventory().
  var DDL_INV = { i_inventory: 'CREATE TABLE IF NOT EXISTS "i_inventory" ("i_inventory_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "m_product_id" NUMERIC, "upc" TEXT, "value" TEXT, "lot" TEXT, "serno" TEXT, "m_locator_id" NUMERIC, "m_warehouse_id" NUMERIC, "warehousevalue" TEXT, "locatorvalue" TEXT, "x" TEXT, "y" TEXT, "z" TEXT, "m_inventory_id" NUMERIC, "m_inventoryline_id" NUMERIC, "qtybook" NUMERIC, "qtycount" NUMERIC, "movementdate" TEXT, "description" TEXT, "processing" TEXT, "processed" TEXT, "currentcostprice" NUMERIC, "i_inventory_uu" TEXT, "doctypename" TEXT, "c_doctype_id" NUMERIC, "qtyinternaluse" NUMERIC, "c_charge_id" NUMERIC, "chargename" TEXT, "m_costingline_id" NUMERIC)' };
  // I_Invoice (AD_Table 598, 65 AD_Column rows in the seed, no physical table) for Import Invoice, AD_Process 207 - Witness: W-IMPORT-INVOICE (erp/tests/witness_import_invoice.js), bim-compiler prompts/MIGRATE_INSTALL_TENANT.md section ENGINE-SPEC E3b;
  //   DDL verbatim from build/erp/ad_full.db (sqlite3 .schema i_invoice). Kept apart from DDL (as Recurring / Inventory) so ensure() still reports the older import tables; ensure() calls ensureInvoice().
  var DDL_INVOICE = { i_invoice: 'CREATE TABLE IF NOT EXISTS "i_invoice" ("i_invoice_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "ad_orgtrx_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "processing" TEXT, "processed" TEXT, "m_pricelist_id" NUMERIC, "c_currency_id" NUMERIC, "salesrep_id" NUMERIC, "issotrx" TEXT, "c_bpartner_id" NUMERIC, "c_bpartner_location_id" NUMERIC, "bpartnervalue" TEXT, "name" TEXT, "c_location_id" NUMERIC, "address1" TEXT, "address2" TEXT, "postal" TEXT, "city" TEXT, "c_region_id" NUMERIC, "regionname" TEXT, "ad_user_id" NUMERIC, "email" TEXT, "contactname" TEXT, "phone" TEXT, "c_country_id" NUMERIC, "countrycode" TEXT, "c_doctype_id" NUMERIC, "doctypename" TEXT, "c_paymentterm_id" NUMERIC, "paymenttermvalue" TEXT, "c_project_id" NUMERIC, "c_campaign_id" NUMERIC, "c_activity_id" NUMERIC, "c_invoice_id" NUMERIC, "documentno" TEXT, "dateinvoiced" TEXT, "dateacct" TEXT, "description" TEXT, "m_product_id" NUMERIC, "productvalue" TEXT, "upc" TEXT, "sku" TEXT, "c_tax_id" NUMERIC, "taxindicator" TEXT, "taxamt" NUMERIC, "c_invoiceline_id" NUMERIC, "linedescription" TEXT, "qtyordered" NUMERIC, "priceactual" NUMERIC, "projectvalue" TEXT, "activityvalue" TEXT, "chargename" TEXT, "c_charge_id" NUMERIC, "i_invoice_uu" TEXT, "c_1099box_id" NUMERIC, "c_1099box_value" TEXT, "iso_code" TEXT);' };
  // RECURRING overlay (F1, prompts/TEAMWORK_FRAMEWORK.md section 41; Witness: W-RECURRING, erp/tests/witness_recurring.js): AD_Table 573 C_Recurring_Run and 200143 C_RecurringGroup are in the seed dictionary WITHOUT a physical
  //   table (C_Recurring 574 has one); DDL verbatim from build/erp/ad_full.db (sqlite3 .schema c_recurring_run / c_recurringgroup). Kept apart from DDL so ensure() still reports the import tables only.
  // i_gljournal: AD_Table 599, 70 AD_Column rows in the seed, no physical table (W-IMPORT-GLJOURNAL, bim-compiler prompts/MIGRATE_INSTALL_TENANT.md section ENGINE-SPEC E3a; Import Journal AD_Process 220). Kept apart like DDL_INV so ensure() still
  //   reports the three older import tables; ensure() calls ensureGLJournal(). DDL verbatim from build/erp/ad_full.db (sqlite3 .schema i_gljournal).
  var DDL_GLJ = { i_gljournal: 'CREATE TABLE IF NOT EXISTS "i_gljournal" ("i_gljournal_id" NUMERIC, "ad_client_id" NUMERIC, "clientvalue" TEXT, "ad_orgdoc_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "i_isimported" TEXT, "i_errormsg" TEXT, "processing" TEXT, "processed" TEXT, "gl_journalbatch_id" NUMERIC, "batchdocumentno" TEXT, "batchdescription" TEXT, "gl_journal_id" NUMERIC, "journaldocumentno" TEXT, "postingtype" TEXT, "c_acctschema_id" NUMERIC, "acctschemaname" TEXT, "c_doctype_id" NUMERIC, "doctypename" TEXT, "gl_category_id" NUMERIC, "categoryname" TEXT, "c_period_id" NUMERIC, "gl_budget_id" NUMERIC, "gl_journalline_id" NUMERIC, "line" NUMERIC, "dateacct" TEXT, "description" TEXT, "amtsourcedr" NUMERIC, "amtacctdr" NUMERIC, "amtsourcecr" NUMERIC, "amtacctcr" NUMERIC, "c_currency_id" NUMERIC, "iso_code" TEXT, "conversiontypevalue" TEXT, "c_conversiontype_id" NUMERIC, "currencyrate" NUMERIC, "c_uom_id" NUMERIC, "qty" NUMERIC, "c_validcombination_id" NUMERIC, "orgvalue" TEXT, "ad_org_id" NUMERIC, "account_id" NUMERIC, "accountvalue" TEXT, "ad_orgtrx_id" NUMERIC, "orgtrxvalue" TEXT, "m_product_id" NUMERIC, "productvalue" TEXT, "upc" TEXT, "sku" TEXT, "c_bpartner_id" NUMERIC, "bpartnervalue" TEXT, "c_project_id" NUMERIC, "projectvalue" TEXT, "c_locto_id" NUMERIC, "c_locfrom_id" NUMERIC, "c_salesregion_id" NUMERIC, "c_activity_id" NUMERIC, "c_campaign_id" NUMERIC, "user1_id" NUMERIC, "user2_id" NUMERIC, "iscreatenewbatch" TEXT, "iscreatenewjournal" TEXT, "i_gljournal_uu" TEXT, "activityvalue" TEXT, "campaignvalue" TEXT, "salesregionvalue" TEXT)' };
  var DDL_RECURRING = {
    c_recurring_run: 'CREATE TABLE IF NOT EXISTS "c_recurring_run" ("c_recurring_run_id" NUMERIC, "ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "c_payment_id" NUMERIC, "c_order_id" NUMERIC, "c_invoice_id" NUMERIC, "c_project_id" NUMERIC, "gl_journalbatch_id" NUMERIC, "c_recurring_id" NUMERIC, "datedoc" TEXT, "c_recurring_run_uu" TEXT)',
    c_recurringgroup: 'CREATE TABLE IF NOT EXISTS "c_recurringgroup" ("ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "created" TEXT, "createdby" NUMERIC, "c_recurringgroup_id" NUMERIC, "c_recurringgroup_uu" TEXT, "description" TEXT, "help" TEXT, "isactive" TEXT, "name" TEXT, "updated" TEXT, "updatedby" NUMERIC, "value" TEXT)'
  };
  // POS row kinds (POS_PLUGIN_LOCAL_FIRST §26.2): twin-local, NOT legacy tables (no daily-declaration table exists in the dictionary). POS_TillHandoff is branch-local (till to branch POS admin);
  //   POS_BranchDayStatement is the branch's declaration to HQ. Plan source: bim-compiler build/scriptor/flows_pos.json H1 / E1. Made only on a device of a POS team (team_sync.js refreshScope), with the
  //   ad_table row the comm layer needs to admit an op (kds_core.js pattern), outside the base hash.
  var BASE_COLS = '"ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, ';
  var DDL_POS = {
    pos_tillhandoff: 'CREATE TABLE IF NOT EXISTS "pos_tillhandoff" ("pos_tillhandoff_id" NUMERIC, ' + BASE_COLS + '"pos_tillhandoff_uu" TEXT, "tillkey" TEXT, "shiftseq" NUMERIC, "kind" TEXT, "documentno" TEXT, "body" TEXT)',
    pos_branchdaystatement: 'CREATE TABLE IF NOT EXISTS "pos_branchdaystatement" ("pos_branchdaystatement_id" NUMERIC, ' + BASE_COLS + '"pos_branchdaystatement_uu" TEXT, "batchid" TEXT, "businessday" TEXT, "partial" TEXT, "seq" NUMERIC, "kind" TEXT, "tillkey" TEXT, "series" TEXT, "tickets" NUMERIC, "gross" NUMERIC, "net" NUMERIC, "tax" NUMERIC, "tenders" TEXT, "taxes" TEXT, "override" TEXT)',
    pos_sodaref: 'CREATE TABLE IF NOT EXISTS "pos_sodaref" ("pos_sodaref_id" NUMERIC, ' + BASE_COLS + '"pos_sodaref_uu" TEXT, "batchid" TEXT, "seq" NUMERIC, "kind" TEXT, "m_product_id" NUMERIC, "m_pricelist_version_id" NUMERIC, "pricestd" NUMERIC, "pricelimit" NUMERIC, "pricelist" NUMERIC, "value" TEXT, "name" TEXT, "upc" TEXT, "imageurl" TEXT, "c_uom_id" NUMERIC, "m_product_category_id" NUMERIC, "c_taxcategory_id" NUMERIC, "c_tax_id" NUMERIC, "rate" NUMERIC, "validfrom" TEXT, "since" TEXT, "upto" TEXT, "detail" TEXT)',
    pos_tillref: 'CREATE TABLE IF NOT EXISTS "pos_tillref" ("pos_tillref_id" NUMERIC, ' + BASE_COLS + '"pos_tillref_uu" TEXT, "batchid" TEXT, "seq" NUMERIC, "kind" TEXT, "m_product_id" NUMERIC, "m_pricelist_version_id" NUMERIC, "pricestd" NUMERIC, "pricelimit" NUMERIC, "pricelist" NUMERIC, "value" TEXT, "name" TEXT, "upc" TEXT, "imageurl" TEXT, "c_uom_id" NUMERIC, "m_product_category_id" NUMERIC, "c_taxcategory_id" NUMERIC, "c_tax_id" NUMERIC, "rate" NUMERIC, "validfrom" TEXT, "since" TEXT, "upto" TEXT, "detail" TEXT)',
    pos_floorplan: 'CREATE TABLE IF NOT EXISTS "pos_floorplan" ("pos_floorplan_id" NUMERIC, ' + BASE_COLS + '"pos_floorplan_uu" TEXT, "kind" TEXT, "recid" TEXT, "name" TEXT, "floorid" TEXT, "seats" NUMERIC, "x" NUMERIC, "y" NUMERIC, "w" NUMERIC, "h" NUMERIC, "image" TEXT, "value" TEXT, "seq" NUMERIC, "deleted" TEXT)',
    pos_opentable: 'CREATE TABLE IF NOT EXISTS "pos_opentable" ("pos_opentable_id" NUMERIC, ' + BASE_COLS + '"pos_opentable_uu" TEXT, "placeid" TEXT, "seq" NUMERIC, "state" TEXT, "lockedby" TEXT, "guests" NUMERIC, "waiter" TEXT, "customer" TEXT, "body" TEXT, "since" TEXT, "override" TEXT)',
    pos_reservation: 'CREATE TABLE IF NOT EXISTS "pos_reservation" ("pos_reservation_id" NUMERIC, ' + BASE_COLS + '"pos_reservation_uu" TEXT, "resid" TEXT, "seq" NUMERIC, "customer" TEXT, "at" TEXT, "chairs" NUMERIC, "state" TEXT, "placeid" TEXT)'
  };
  var AD_ROWS_POS = { pos_tillhandoff: [7900003, 'POS Till Handoff', 'POS_TillHandoff'], pos_branchdaystatement: [7900004, 'POS Branch Day Statement', 'POS_BranchDayStatement'],
    pos_sodaref: [7900005, 'POS SODA Reference Delta', 'POS_SodaRef'], pos_tillref: [7900006, 'POS Till Reference Delta', 'POS_TillRef'],
    pos_floorplan: [7900008, 'POS Floor Plan', 'POS_FloorPlan'], pos_opentable: [7900009, 'POS Open Table', 'POS_OpenTable'], pos_reservation: [7900010, 'POS Reservation', 'POS_Reservation'] };   // POS_PLUGIN_LOCAL_FIRST §28 (S1 / S2 / S6)
  function ensurePos(db) {
    var made = 0;
    Object.keys(DDL_POS).forEach(function (t) { var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); if (r.length && r[0].values.length) return; db.run(DDL_POS[t]); made++; });
    Object.keys(AD_ROWS_POS).forEach(function (t) { var a = AD_ROWS_POS[t], r = db.exec('SELECT 1 FROM ad_table WHERE ad_table_id=' + a[0]); if (r.length && r[0].values.length) return;
      db.run("INSERT INTO ad_table (ad_table_id, ad_client_id, ad_org_id, isactive, name, tablename, isview, accesslevel, entitytype, isdeleteable, ishighvolume, importtable, ischangelog, ad_table_uu) VALUES (?,0,0,'Y',?,?,'N','2','U','Y','N','N','N',?)", [a[0], a[1], a[2], 'eoda0000-0000-4000-8000-0000000' + a[0]]); made++; });
    if (made) log('§EODA_TABLES ensurePos created=' + made + ' (' + Object.keys(DDL_POS).join(', ') + '; twin-local row kinds, outside the team base hash)');
    return made;
  }
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
    ensureRecurring(db);
    ensureInventory(db);
    ensureGLJournal(db);
    ensureInvoice(db);
    return made;
  }
  // ensureRecurring(db) - the Recurring tables (see DDL_RECURRING); idempotent; returns the number it created. ensure() calls it, so every host that boots the import tables boots these too.
  function ensureRecurring(db) {
    var made = 0;
    Object.keys(DDL_RECURRING).forEach(function (t) {
      var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'");
      if (r.length && r[0].values.length) return;
      db.run(DDL_RECURRING[t]); made++;
    });
    log('§RECUR_TABLES ensure created=' + made + ' (' + Object.keys(DDL_RECURRING).join(', ') + '; boot overlay, outside the team base hash)');
    return made;
  }

  function ensureInventory(db) {
    var made = 0;
    Object.keys(DDL_INV).forEach(function (t) { var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); if (r.length && r[0].values.length) return; db.run(DDL_INV[t]); made++; });
    log('§IMPORT_INV_TABLES ensure created=' + made + ' (' + Object.keys(DDL_INV).join(', ') + '; boot overlay, outside the team base hash)');
    return made;
  }

  function ensureGLJournal(db) {
    var made = 0;
    Object.keys(DDL_GLJ).forEach(function (t) { var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); if (r.length && r[0].values.length) return; db.run(DDL_GLJ[t]); made++; });
    log('§IMPORT_GLJ_TABLES ensure created=' + made + ' (' + Object.keys(DDL_GLJ).join(', ') + '; boot overlay, outside the team base hash)');
    return made;
  }

  function ensureInvoice(db) {
    var made = 0;
    Object.keys(DDL_INVOICE).forEach(function (t) { var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); if (r.length && r[0].values.length) return; db.run(DDL_INVOICE[t]); made++; });
    log('§IMPORT_INVOICE_TABLES ensure created=' + made + ' (' + Object.keys(DDL_INVOICE).join(', ') + '; boot overlay, outside the team base hash)');
    return made;
  }

  var API = { DDL: DDL, DDL_RECURRING: DDL_RECURRING, DDL_POS: DDL_POS, DDL_INV: DDL_INV, ensureInventory: ensureInventory, DDL_INVOICE: DDL_INVOICE, ensureInvoice: ensureInvoice, DDL_GLJ: DDL_GLJ, ensureGLJournal: ensureGLJournal, ensure: ensure, ensureRecurring: ensureRecurring, ensurePos: ensurePos };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness / ws host
  if (typeof window !== 'undefined') window.AdImportTables = API;              // browser
  else if (global) global.AdImportTables = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
