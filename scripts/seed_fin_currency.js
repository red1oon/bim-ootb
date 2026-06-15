/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// seed_fin_currency.js — BIM→Project FINANCE lane §F1 (W-FIN-CURRENCY) reproducible seed.
//
// EXTRACT-only: the seed already carries C_Currency MYR (id 301, ISO 4217 = 458, CurSymbol 'RM').
// What it lacks is a C_Conversion_Rate so a MYR-priced job can be expressed in the accounting currency
// (the primary C_AcctSchema currency = USD 100). This script ADDS that rate, extracting the exchange
// rate from the CIDB Malaysia rate pack (viewer/rates/cidb2024_my.json meta.exchange_rate) — never invents
// a number. It reuses the org/client/conversiontype the seed's existing C_Conversion_Rate rows use, and is
// IDEMPOTENT (find-or-create by currency pair + type → a 2nd run adds 0 rows).
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_fin_currency.js
//   (writes erp/ad_seed.db in place; re-run the 5 regression witnesses after.)

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SEED = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const PACK = path.join(__dirname, '..', 'viewer', 'rates', 'cidb2024_my.json');
const BIM_BASE = 990000; // high PK band (matches proj_fold/vo_fold) — never collides with seed/iDempiere ids

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

(async function () {
  if (!SEED) { console.log('§SEED_CUR SKIP — ad_seed.db not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));

  // 1) EXTRACT the exchange rate from the CIDB pack (1 USD = N MYR; RM weaker → N≈3.91).
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  const meta = pack.meta || {};
  const myrPerUsd = Number(meta.exchange_rate);
  if (!(myrPerUsd > 0)) { console.log('§SEED_CUR FAIL — cidb pack has no usable meta.exchange_rate'); process.exit(1); }

  // 2) resolve the two currencies (MYR by ISO/CurSymbol, acct currency from the primary schema).
  const myr = scalar(db, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code='MYR' OR CurSymbol='RM' ORDER BY (ISO_Code='MYR') DESC LIMIT 1");
  const acct = Number(scalar(db, "SELECT C_Currency_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1") || 100);
  if (myr == null) { console.log('§SEED_CUR FAIL — MYR currency not in seed (ISO 4217 458)'); process.exit(1); }
  console.log('§SEED_CUR myr=' + myr + ' acct=' + acct + ' usdPerMyr=' + (1 / myrPerUsd).toFixed(8) + ' myrPerUsd=' + myrPerUsd);

  // 3) extract the org/client/conversiontype the seed already uses for conversion rates (don't invent).
  const proto = db.exec("SELECT ad_client_id,ad_org_id,c_conversiontype_id FROM C_Conversion_Rate LIMIT 1");
  if (!proto.length) { console.log('§SEED_CUR FAIL — no existing C_Conversion_Rate to mirror org/type'); process.exit(1); }
  const [cl, og, ctype] = proto[0].values[0];
  // validity window: match the seed's own base-rate convention (USD↔EUR validfrom 2000-01-01) so the rate
  // covers every C_Period in the seed (incl. the open GardenWorld-era periods used by §F8 period control).
  const validFrom = '2000-01-01 00:00:00';
  const validTo = scalar(db, "SELECT MAX(validto) FROM C_Conversion_Rate") || '2056-01-29 00:00:00';
  const now = '2026-06-15 00:00:00';

  let nextId = Math.max(Number(scalar(db, "SELECT COALESCE(MAX(c_conversion_rate_id),0) FROM C_Conversion_Rate") || 0), BIM_BASE - 1) + 1;
  function uu() { return 'bim-cur-' + (nextId).toString(16); }

  // 4) idempotent find-or-create of the pair both ways.
  //    iDempiere semantics: to convert FROM cur TO cur_to, multiply by multiplyrate.
  function upsert(from, to, mult) {
    const existing = scalar(db, "SELECT c_conversion_rate_id FROM C_Conversion_Rate WHERE c_currency_id=? AND c_currency_id_to=? AND c_conversiontype_id=? AND isactive='Y'", [from, to, ctype]);
    if (existing != null) {
      // correct an earlier row's validity window if it doesn't match the convention (keeps reproducible).
      const vf = scalar(db, "SELECT validfrom FROM C_Conversion_Rate WHERE c_conversion_rate_id=?", [existing]);
      if (String(vf).slice(0, 10) !== validFrom.slice(0, 10)) {
        db.run("UPDATE C_Conversion_Rate SET validfrom=? WHERE c_conversion_rate_id=?", [validFrom, existing]);
        console.log('§SEED_CUR_FIX ' + from + '→' + to + ' id=' + existing + ' validfrom→' + validFrom.slice(0, 10));
        return 1;
      }
      console.log('§SEED_CUR_SKIP exists ' + from + '→' + to + ' id=' + existing); return 0;
    }
    const id = nextId++;
    const div = 1 / mult;
    db.run("INSERT INTO C_Conversion_Rate (c_conversion_rate_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby," +
      "c_currency_id,c_currency_id_to,validfrom,validto,multiplyrate,dividerate,c_conversiontype_id,c_conversion_rate_uu) " +
      "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,?,?,?,?,?)",
      [id, cl, og, now, now, from, to, validFrom, validTo, mult, div, ctype, uu()]);
    console.log('§SEED_CUR_ADD ' + from + '→' + to + ' id=' + id + ' multiplyrate=' + mult + ' dividerate=' + div);
    return 1;
  }
  // MYR → USD: 1 MYR = 1/myrPerUsd USD ; USD → MYR: 1 USD = myrPerUsd MYR
  let added = 0;
  added += upsert(myr, acct, 1 / myrPerUsd);
  added += upsert(acct, myr, myrPerUsd);

  if (added > 0) fs.writeFileSync(SEED, Buffer.from(db.export()));
  console.log('§SEED_CUR ' + (added >= 0 ? 'PASS' : 'FAIL') + ' — added=' + added + ' (idempotent; ' + (added ? 'wrote' : 'no-op, seed already current') + ' ' + path.basename(SEED) + ')');
  db.close();
  process.exit(0);
})();
