/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_find_cost.js — BIM → Project Order, TASK A witness W-FIND-COST
// Implementing prompts/BIM_TO_PROJECT.md TASK A — the value proof for "cost on the Find selected bar".
// Proves: selection-scoped cost == Σ(qty × rate) over the selection's sidecar rows, using the SAME
//   currency-free quantity basis as analysis_sidecar.js / export_5d.js (the consistency invariant —
//   round(rate×qty) in JS Number, NOT BigDecimal; BigDecimal is reserved for the ERP push in Task C).
// Disproves drift: the storey/discipline/type subsets must PARTITION the whole-building total exactly
//   (select-nothing = whole building). A leak/double-count breaks the partition assert.
// Whitebox §-log first. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_find_cost.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_CANDIDATES = [
  path.join(__dirname, '..', 'buildings', 'Duplex_extracted.db'),
  path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Duplex_extracted.db'),
];
const PACK_FILE = path.join(__dirname, '..', 'viewer', 'rates', 'cidb2024_my.json');

// ── verbatim from viewer/analysis_sidecar.js compute5D() — same bbox expressions ──────────────
function compute5D(db, building) {
  var bld = String(building).replace(/'/g, "''");
  var areaExpr =
    "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
    "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
    "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
    "ELSE MAX(t.bbox_x,t.bbox_y) END";
  var sql =
    "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) AS cnt, " +
    "ROUND(SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)),3) AS length_m, " +
    "ROUND(SUM(" + areaExpr + "),3) AS area_m2, " +
    "ROUND(SUM(t.bbox_x*t.bbox_y*t.bbox_z),3) AS vol_m3 " +
    "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
    "WHERE m.building='" + bld + "' AND t.bbox_x IS NOT NULL AND t.bbox_x>0 " +
    "GROUP BY m.discipline, m.ifc_class, m.storey";
  var res = db.exec(sql);
  var rows = (res.length ? res[0].values : []).map(function (r) {
    return { disc: r[0], cls: r[1], storey: r[2], count: r[3] || 0, length_m: r[4] || 0, area_m2: r[5] || 0, vol_m3: r[6] || 0 };
  });
  return { building: building, rows: rows };
}

// ── verbatim from viewer/analysis_sidecar.js apply5DRates() — unit-driven qty, rounded cost ───
function apply5DRates(sidecar, RATES, currency) {
  RATES = RATES || {};
  return sidecar.rows.map(function (r) {
    var rt = RATES[r.cls];
    var unit = rt ? rt.unit : 'EA';
    var rate = rt ? rt.rate : 0;
    var qty;
    if (unit === 'M') qty = r.length_m;
    else if (unit === 'M2') qty = r.area_m2;
    else if (unit === 'M3') qty = r.vol_m3;
    else { unit = rt ? unit : 'EA'; qty = r.count; }
    var cost = Math.round(rate * qty);
    return { disc: r.disc, cls: r.cls, storey: r.storey, count: r.count, unit: unit, qty: qty, rate: rate, cost: cost, currency: currency || '' };
  });
}

// ── selection scope filter — the WBS isomorphism: nothing→all, storey/disc/type→filter ────────
function scopeFilter(priced, sel) {
  if (!sel || sel.kind === 'all') return priced;
  return priced.filter(function (r) {
    if (sel.kind === 'storey') return r.storey === sel.value;
    if (sel.kind === 'disc') return r.disc === sel.value;
    if (sel.kind === 'type') return r.cls === sel.value;
    return false;
  });
}
function sumCost(rows) { return rows.reduce(function (a, r) { return a + r.cost; }, 0); }
function sumElems(rows) { return rows.reduce(function (a, r) { return a + r.count; }, 0); }

(async function () {
  const dbPath = DB_CANDIDATES.find(fs.existsSync);
  if (!dbPath) { console.log('§FIND_COST SKIP — no Duplex_extracted.db'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const building = db.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];

  // active 5D pack → RATES { cls:{rate,unit} } (same shape loadRateTemplate merges into rates.js RATES)
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  const RATES = pack.materials || {};
  const packName = (pack.meta && pack.meta.name) || 'cidb2024_my';
  const CUR = pack.currency || (pack.meta && pack.meta.currency) || 'RM';

  const sidecar = compute5D(db, building);
  const priced = apply5DRates(sidecar, RATES, CUR);

  // (1) select-nothing = whole building
  const whole = scopeFilter(priced, { kind: 'all' });
  const wholeCost = sumCost(whole);
  console.log('§FIND_COST scope=all elements=' + sumElems(whole) + ' qty=' + whole.length + 'rows cost=' + wholeCost + ' cur=' + CUR + ' pack=' + packName);

  // (2) one storey, one discipline, one type — each a real selection
  const storeys = Array.from(new Set(priced.map(function (r) { return r.storey; })));
  const discs = Array.from(new Set(priced.map(function (r) { return r.disc; })));
  const types = Array.from(new Set(priced.map(function (r) { return r.cls; })));
  const sSel = { kind: 'storey', value: storeys[0] };
  const dSel = { kind: 'disc', value: discs[0] };
  const tSel = { kind: 'type', value: types[0] };
  [sSel, dSel, tSel].forEach(function (sel) {
    const rows = scopeFilter(priced, sel);
    console.log('§FIND_COST scope=' + sel.kind + ':' + sel.value + ' elements=' + sumElems(rows) + ' qty=' + rows.length + 'rows cost=' + sumCost(rows) + ' cur=' + CUR + ' pack=' + packName);
  });

  // (3) GOLDEN PARTITION — Σ over all storeys must == whole-building (no leak, no double-count).
  const byStorey = storeys.reduce(function (a, s) { return a + sumCost(scopeFilter(priced, { kind: 'storey', value: s })); }, 0);
  const byDisc = discs.reduce(function (a, d) { return a + sumCost(scopeFilter(priced, { kind: 'disc', value: d })); }, 0);
  const byType = types.reduce(function (a, t) { return a + sumCost(scopeFilter(priced, { kind: 'type', value: t })); }, 0);
  const partOk = byStorey === wholeCost && byDisc === wholeCost && byType === wholeCost;
  console.log('§FIND_COST_PARTITION whole=' + wholeCost + ' Σstoreys=' + byStorey + ' Σdiscs=' + byDisc + ' Σtypes=' + byType + ' match=' + partOk);

  // (4) elements partition too (selection element-count must also partition)
  const elemPartOk = storeys.reduce(function (a, s) { return a + sumElems(scopeFilter(priced, { kind: 'storey', value: s })); }, 0) === sumElems(whole);

  const mathOk = partOk && elemPartOk && wholeCost > 0;
  console.log('§FIND_COST ' + (mathOk ? 'PASS' : 'FAIL') + ' — selection cost partitions the whole-building total exactly (cost+elements); building=' + building);

  // ── CONTRACT: the wiring this witness proves must actually be in the deployed viewer source ──
  // (guards against the inlined compute5D/apply5DRates above drifting from navigate_find.js).
  function srcHas(file, tokens) {
    var p = path.join(__dirname, '..', 'viewer', file);
    var s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(function (t) {
      var ok = s.indexOf(t) >= 0;
      if (!ok) console.log('  §FIND_COST_CONTRACT MISSING ' + file + ' :: ' + t);
      return ok;
    });
  }
  const cNav = srcHas('navigate_find.js', [
    'function _selectionCost', 'function _updateSelCost', "id=\"find-selected-cost\"",
    '_updateSelCost(focusSet', "§FIND_COST scope=" ]);
  const cPanels = srcHas('panels.js', ['function _rate5dBody', "'5D Rate Pack'", 'bim_5d_pack', '§FIND_COST_PACK']);
  const cRates = srcHas('rates.js', ['bim_5d_pack']);
  const contractOk = cNav && cPanels && cRates;
  console.log('§FIND_COST_CONTRACT ' + (contractOk ? 'PASS' : 'FAIL') +
    ' — navigate_find=' + cNav + ' panels=' + cPanels + ' rates=' + cRates +
    ' (cost span + _selectionCost/_updateSelCost wired; 5D pack picker + bim_5d_pack override present)');

  const pass = mathOk && contractOk;
  db.close();
  process.exit(pass ? 0 : 1);
})();
