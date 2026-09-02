/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// seed_fin_uom.js — BIM→Project FINANCE lane §F2 (W-FIN-UOM) reproducible seed.
//
// The default iDempiere seed ships Each/Hour/Day… but no linear/area/volume metres, so a BoQ folds with
// every line in EA + a UOM_FALLBACK note. This adds the three construction measures the rate packs price in
// (M / M2 / M3) so the BoQ reads m / m² / m³. EXTRACT-only:
//   - X12DE355 = the short code the rate packs + fold use ('M','M2','M3') — same convention as the seed's
//     own pre-existing 'CM' (Centimeter) row, NOT invented.
//   - UNCEFACT = the real UN/CEFACT Recommendation 20 code (MTR / MTK / MTQ) — the international standard.
//   - UOMType  = the iDempiere AD_Ref_List code (LE Length / AR Area / VD Volume Dry) — extracted from the seed.
//   - StdPrecision = 3 — matches the QTO quantity precision (compute5D ROUND(…,3) / C_ProjectLine plannedqty 3dp).
// IDEMPOTENT (find-or-create by X12DE355 → a 2nd run adds 0 rows). Mirrors the seed's CM row shape exactly.
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_fin_uom.js  (writes erp/ad_seed.db in place)

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SEED = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const BIM_BASE = 990000;

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }

// the three construction measures — short code (pack/fold), real UN/CEFACT std code, iDempiere UOMType.
const UOMS = [
  { x12: 'M', unc: 'MTR', type: 'LE', sym: 'm', name: 'Meter' },
  { x12: 'M2', unc: 'MTK', type: 'AR', sym: 'm2', name: 'Square Meter' },
  { x12: 'M3', unc: 'MTQ', type: 'VD', sym: 'm3', name: 'Cubic Meter' }
];

(async function () {
  if (!SEED) { console.log('§SEED_UOM SKIP — ad_seed.db not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));

  // mirror the org/client the seed's measure rows use (the 'CM' row: client 11, org 0).
  const proto = db.exec("SELECT ad_client_id,ad_org_id FROM C_UOM WHERE X12DE355='CM' OR UOMType='LE' LIMIT 1");
  const [cl, og] = proto.length ? proto[0].values[0] : [11, 0];
  const now = '2026-06-15 00:00:00';
  let nextId = Math.max(Number(scalar(db, "SELECT COALESCE(MAX(C_UOM_ID),0) FROM C_UOM") || 0), BIM_BASE - 1) + 1;

  let added = 0;
  UOMS.forEach(function (u) {
    const existing = scalar(db, "SELECT C_UOM_ID FROM C_UOM WHERE X12DE355=?", [u.x12]);
    if (existing != null) { console.log('§SEED_UOM_SKIP exists ' + u.x12 + ' id=' + existing); return; }
    const id = nextId++;
    db.run("INSERT INTO C_UOM (C_UOM_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,Updated,CreatedBy,UpdatedBy," +
      "X12DE355,UOMSymbol,Name,StdPrecision,CostingPrecision,IsDefault,UOMType,UNCEFACT,C_UOM_UU) " +
      "VALUES (?,?,?,'Y',?,?,100,100,?,?,?,3,4,'N',?,?,?)",
      [id, cl, og, now, now, u.x12, u.sym, u.name, u.type, u.unc, 'bim-uom-' + u.x12.toLowerCase()]);
    console.log('§SEED_UOM_ADD ' + u.x12 + ' id=' + id + ' UNCEFACT=' + u.unc + ' UOMType=' + u.type + ' name="' + u.name + '"');
    added++;
  });

  if (added > 0) fs.writeFileSync(SEED, Buffer.from(db.export()));
  console.log('§SEED_UOM PASS — added=' + added + ' (idempotent; ' + (added ? 'wrote' : 'no-op, seed already current') + ' ' + path.basename(SEED) + ')');
  db.close();
  process.exit(0);
})();
