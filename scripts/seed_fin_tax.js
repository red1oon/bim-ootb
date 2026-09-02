/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// seed_fin_tax.js — BIM→Project FINANCE lane §F7 (W-FIN-TAX) reproducible seed.
//
// Adds Malaysia's Service Tax (SST) as a real C_Tax — the statutory 6% service-tax rate (the published
// Malaysian rate; not invented), in the seed's existing Standard tax category, for country Malaysia (238).
// Creates its C_Tax_Acct rows per acct schema by COPYING the tax-account combinations from an existing seed
// tax (the Standard/CT-Sales row) — EXTRACT-only, every account a real C_ValidCombination. IDEMPOTENT
// (find-or-create by Name 'SST' + Rate 6 + country MY).
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_fin_tax.js  (writes erp/ad_seed.db in place)

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SEED = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const BIM_BASE = 990000;
const MY_RATE = 6;          // Malaysia Service Tax — statutory 6%
const MY_COUNTRY = 238;     // C_Country Malaysia

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

(async function () {
  if (!SEED) { console.log('§SEED_TAX SKIP — ad_seed.db not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));

  const exists = scalar(db, "SELECT C_Tax_ID FROM C_Tax WHERE Name='SST' AND Rate=" + MY_RATE);
  if (exists != null) { console.log('§SEED_TAX_SKIP exists SST id=' + exists); fs.writeFileSync; console.log('§SEED_TAX PASS — added=0 (idempotent; no-op)'); process.exit(0); }

  // mirror org/client + the Standard tax category the seed uses.
  const cat = scalar(db, "SELECT C_TaxCategory_ID FROM C_TaxCategory WHERE IsDefault='Y' LIMIT 1") || 107;
  const proto = db.exec("SELECT ad_client_id,ad_org_id FROM C_Tax LIMIT 1");
  const [cl, og] = proto.length ? proto[0].values[0] : [11, 0];
  const now = '2026-06-15 00:00:00';
  const taxId = Math.max(Number(scalar(db, "SELECT COALESCE(MAX(C_Tax_ID),0) FROM C_Tax") || 0), BIM_BASE - 1) + 1;

  db.run("INSERT INTO C_Tax (C_Tax_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
    "Name,Description,Rate,C_TaxCategory_ID,C_Country_ID,IsDefault,IsSalesTax,IsSummary,IsDocumentLevel,IsTaxExempt,RequiresTaxCertificate,SOPOType,ValidFrom,C_Tax_UU) " +
    "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,?,?,'N','N','N','Y','N','N','B',?,?)",
    [taxId, cl, og, now, now, 'SST', 'Malaysia Sales & Service Tax (Service Tax ' + MY_RATE + '%)', MY_RATE, cat, MY_COUNTRY, '2024-01-01 00:00:00', 'bim-tax-sst']);
  console.log('§SEED_TAX_ADD SST id=' + taxId + ' rate=' + MY_RATE + '% category=' + cat + ' country=MY(' + MY_COUNTRY + ')');

  // C_Tax_Acct per acct schema — copy the account combinations from an existing tax (Standard 6% 'CT Sales').
  const srcTax = scalar(db, "SELECT C_Tax_ID FROM C_Tax WHERE Rate=6 AND C_Tax_ID<" + BIM_BASE + " LIMIT 1") || 105;
  const schemas = db.exec("SELECT C_AcctSchema_ID FROM C_AcctSchema");
  let acctRows = 0;
  (schemas.length ? schemas[0].values : []).forEach(function (row) {
    const asId = row[0];
    const src = db.exec("SELECT t_due_acct,t_liability_acct,t_credit_acct,t_receivables_acct,t_expense_acct FROM C_Tax_Acct WHERE C_Tax_ID=? AND C_AcctSchema_ID=?", [srcTax, asId]);
    if (!src.length) return;
    const v = src[0].values[0];
    db.run("INSERT INTO C_Tax_Acct (c_tax_id,c_acctschema_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby," +
      "t_due_acct,t_liability_acct,t_credit_acct,t_receivables_acct,t_expense_acct,c_tax_acct_uu) " +
      "VALUES (?,?,?,?,'Y',?,100,?,100,?,?,?,?,?,?)",
      [taxId, asId, cl, og, now, now, v[0], v[1], v[2], v[3], v[4], 'bim-taxacct-' + taxId + '-' + asId]);
    acctRows++;
  });
  console.log('§SEED_TAX_ACCT rows=' + acctRows + ' (copied from tax ' + srcTax + ': t_credit=input-tax-recoverable on purchase)');

  fs.writeFileSync(SEED, Buffer.from(db.export()));
  console.log('§SEED_TAX PASS — added SST(' + taxId + ') + ' + acctRows + ' acct rows (wrote ' + path.basename(SEED) + ')');
  db.close();
  process.exit(0);
})();
