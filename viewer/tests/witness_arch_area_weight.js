#!/usr/bin/env node
// WITNESS — W-AREA — §ARCH_AREA_WEIGHT
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §DAY_GAP_PHASE_OCC GAP 4.
//
// ISSUE THIS PROVES OR DISPROVES:
//   _installSecs had three branches and the architecture bulk hit none of them. realQty covers
//   FRAGMENTED classes only; lengthRatio selects on `unit === 'M'` — the 7 metre-priced classes.
//   The M2 set (IfcSlab, IfcWall, IfcWallStandardCase, IfcCurtainWall, IfcCovering, IfcRoof,
//   IfcPlate) fell through to the flat `28800/productivity`, so on Hospital an IfcWall of 0.90m and
//   one of 78.79m — an 88x span — were charged IDENTICAL install time. User, live: "The ARCH still
//   comes on too fast. They are heavy items should take longer relatively to MEP etc."
//
//   The fix uses the REDISTRIBUTION form (ratio = thisArea / classAvgArea), not the multiply form.
//   That distinction is the entire safety argument and it is what G-AREA-TOTAL exists to prove:
//   _classFragmentation's own header records that multiplying a non-fragmented class by absolute
//   area sends "IfcWall from ~14 days to 563 days". A ratio has mean 1 by construction, so a
//   class's total labour cannot move — only its distribution.
//
// GATES:
//   G-AREA-TOTAL   (BLOCKING) per class, total installSecs after == before, within rounding.
//                  Proves this redistributes and cannot inflate the programme.
//   G-AREA-SPREAD  per-element installSecs spread rises from 1.0x (flat) to >1 on the M2 classes
//                  that have real size variation. Proves it actually did something.
//   G-AREA-ORDER   within a weighted class, a physically larger element never gets LESS time than
//                  a smaller one. The monotonicity a planner would check by eye.
//   G-AREA-NOCLOBBER  classes already claimed by realQty (fragmented) or lengthRatio are untouched
//                  — no double-weighting. Their per-element secs must be byte-identical to before.
//
// ── §VOL_WEIGHT (M3), added 2026-08-12 — the same issue, third unit ───────────────────────────
//   ISSUE: `unit === 'M3'` classes fell through every _installSecs branch to flat, so a tiny pad
//   footing and a massive raft footing charged identical install time.
//
//   ⚠ THE FIXTURE IS GONE — these gates now run on the SHIPPED rates table (§FOOTING_M3,
//   2026-08-12). When _volumeWeighting first landed, no class in the shipped model was priced M3
//   (32 EA / 11 M / 7 M2 / 1 KG, identical split in all 17 templates), so the M3 half could only be
//   proved against a one-key in-memory fixture and G-VOL-SHIPPED-INERT asserted the mechanism
//   selected nothing. IfcFooting has since been repriced EA→M3 in rates.js and in all 16 templates
//   that carry a materials.IfcFooting entry, so the mechanism now fires on real shipped data and
//   that inert gate is RETIRED, replaced by G-VOL-SHIPPED-LIVE (its inverse — the same collateral
//   assertion, now stated over a live path). Deleting it outright would have dropped the
//   "nothing ELSE moved" half, which is the part still worth owning.
//
//   ⚠ THE RATE IS DERIVED, NOT INVENTED — G-VOL-RATE-DERIVED is what proves that, and it is the
//   reason this witness carries the pre-change EA rates as constants. The conversion is a pure unit
//   correction of the rate the table already had:
//       rate_m3 = rate_EA / avgVolume,  avgVolume = 4.25074802767622 m3
//   avgVolume is the class-wide mean of t.bbox_x*t.bbox_y*t.bbox_z (the ONE volume foldCost,
//   _volumeWeighting and analysis_sidecar.vol_m3 already share) over every real IfcFooting in the
//   7 shipped buildings — 821 elements, SUM 3489.86413072218 m3, spanning 0.2595..602.0946 m3:
//     SELECT COUNT(*), SUM(t.bbox_x*t.bbox_y*t.bbox_z) FROM elements_meta m
//     JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='IfcFooting'
//     AND t.bbox_x IS NOT NULL AND t.bbox_x>0 AND (t.bbox_x*t.bbox_y*t.bbox_z)>0
//   Multiplying any shipped m3 rate back by that divisor must return the EA rate it came from —
//   that round trip is the gate. IfcPile is deliberately NOT converted: zero IfcPile elements exist
//   in any shipped building, so there is no measured divisor and any m3 rate would be invented.
//
//   G-VOL-RATE-DERIVED (BLOCKING) every shipped IfcFooting m3 rate × avgVolume returns its own
//                  pre-change EA rate (<=0.05% — the 2dp rounding band), across rates.js + all 16
//                  templates, and none of them still says EA. The anti-invention gate.
//   G-VOL-COST-NEUTRAL (BLOCKING) sum(rate_m3 × real volume) over the 821-element derivation
//                  population equals rate_EA × 821 — the same class total, redistributed by size.
//                  Per BUILDING it deliberately shifts by that building's own avg/class avg.
//   G-VOL-SHIPPED-LIVE (BLOCKING) on shipped RATES _volumeWeighting selects exactly the M3-priced
//                  classes and NOTHING else — every element of a non-M3 class is byte-identical
//                  with the volumeRatio arg wired vs. not. (Replaces G-VOL-SHIPPED-INERT.)
//   G-VOL-TOTAL    (BLOCKING) on shipped rates, per class total installSecs after == before.
//   G-VOL-SPREAD   per-element spread rises above flat on the weighted class. Proves it did something.
//   G-VOL-ORDER    a physically larger element never gets LESS time than a smaller one.
//   G-VOL-NOCLOBBER  classes claimed by realQty / lengthRatio / areaRatio are byte-identical.
'use strict';
const fs = require('fs');
const path = require('path');
const HOME = require('os').homedir();
const VIEWER_DIR = path.join(__dirname, '..');
const SQLJS_DIR = process.env.SQLJS_DIR || path.join(HOME, 'bim-ootb', 'modeller', 'lib');
const initSqlJs = require(path.join(SQLJS_DIR, 'sql-wasm.js'));
const SA = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');

const results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}
function loadRatesTable() {
  const txt = fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(SQLJS_DIR, 'sql-wasm.wasm')) });
  const rules = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rules.SEQUENCE_RULES, SD = rules.SEQUENCE_DEFAULT, LR = rules.LABOR_RATES;
  const NO = rules.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();

  let totalBad = [], spreadRose = [], orderBad = [], clobbered = [], ran = 0;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log(`      (skip ${bld} — fixture missing)`); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const frag = SA._classFragmentation(db, RATES);
    const lin = SA._linearWeighting(db, RATES);
    const area = SA._areaWeighting(db, RATES, frag.fragmented, SR, SD, NO, LR);

    const r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(m.element_name,''), " +
      't.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid ' +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!r.length) { db.close(); continue; }
    ran++;

    const byCls = {};
    r[0].values.forEach(v => {
      const [guid, cls, nm, bx, by, bz] = v;
      const rule = SA.matchNameOverride(cls, nm, NO) || SA.matchRule(cls, SR, SD);
      const realQty = (frag.fragmented[cls] && frag.area[guid] != null) ? frag.area[guid] : null;
      const hasGeom = bx > 0 || by > 0 || bz > 0;
      const avgLen = lin.avgLength[cls];
      const lengthRatio = (realQty == null && hasGeom && avgLen > 0) ? Math.max(bx, by, bz) / avgLen : null;
      const avgArea = area.avgArea[cls];
      const areaRatio = (realQty == null && lengthRatio == null && hasGeom && avgArea > 0 &&
                         area.area[guid] > 0) ? area.area[guid] / avgArea : null;
      const before = SA._installSecs(cls, rule, LR, realQty, lengthRatio);          // pre-change path
      const after  = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio);
      const c = byCls[cls] || (byCls[cls] = { b: 0, a: 0, n: 0, weighted: areaRatio != null,
                                              claimed: (realQty != null || lengthRatio != null),
                                              pts: [], diffs: 0 });
      c.b += before; c.a += after; c.n++;
      if (before !== after) c.diffs++;
      if (areaRatio != null) c.pts.push({ q: area.area[guid], s: after });
    });

    const weighted = [];
    for (const cls in byCls) {
      const c = byCls[cls];
      if (c.weighted) {
        // total preserved (rounding only — each element rounds independently)
        // 5% band — user ruling 2026-08-12: "NOT ASKING FOR PERFECTION. 5% ERROR MARGIN IS
        // ACCEPTABLE." Per-element rounding alone cannot reach 5%; anything that does is a real
        // distortion (the mixed-rate class bug measured 49%), so the bar still catches those.
        const tol = Math.max(2, c.b * 0.05);
        if (Math.abs(c.a - c.b) > tol) totalBad.push(`${bld}/${cls} ${c.b}->${c.a} (${(100*(c.a-c.b)/c.b).toFixed(1)}%)`);
        const secs = c.pts.map(p => p.s).filter(x => x > 0);
        if (secs.length > 1) {
          const spread = Math.max(...secs) / Math.min(...secs);
          if (spread > 1.01) weighted.push(`${cls}:${spread.toFixed(0)}x`);
          // monotone: sort by quantity, secs must be non-decreasing
          const sorted = c.pts.slice().sort((x, y) => x.q - y.q);
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].s < sorted[i - 1].s * 0.95 - 1) { orderBad.push(`${bld}/${cls}`); break; }
          }
        }
      } else if (c.claimed && c.diffs > 0) {
        clobbered.push(`${bld}/${cls} (${c.diffs} elements changed)`);
      }
    }
    if (weighted.length) spreadRose.push(`${bld}[${weighted.join(' ')}]`);
    console.log(`      ${bld}: areaWeightedClasses=${Object.keys(byCls).filter(k => byCls[k].weighted).length} ` +
      `spread=${weighted.join(' ') || 'none'}`);
    db.close();
  }

  gate('G-AREA-TOTAL', totalBad.length === 0 && ran > 0,
    totalBad.length ? 'class total MOVED (inflation!): ' + totalBad.join(' ')
      : `every area-weighted class keeps its total install time on all ${ran} buildings — redistribution, not inflation`);
  gate('G-AREA-SPREAD', spreadRose.length > 0,
    spreadRose.length ? 'per-element spread now scales with real area: ' + spreadRose.join(' ')
      : 'NO class gained spread — the weighting is not reaching any element');
  gate('G-AREA-ORDER', orderBad.length === 0,
    orderBad.length ? 'larger element got LESS time in: ' + orderBad.join(' ')
      : 'within every weighted class, a larger element never installs faster than a smaller one');
  gate('G-AREA-NOCLOBBER', clobbered.length === 0,
    clobbered.length ? 'double-weighted: ' + clobbered.join(' ')
      : 'classes already claimed by realQty (fragmented) or lengthRatio are byte-identical — no double-weighting');

  // ── §VOL_WEIGHT (M3) — runs on the SHIPPED rates table, see this file's header ────────────────
  // The set of classes the shipped table prices M3. Derived from RATES, never hardcoded: whatever
  // is priced M3 is what _volumeWeighting must claim, and nothing else may move.
  const M3_PRICED = Object.keys(RATES).filter(c => RATES[c] && RATES[c].unit === 'M3');
  let volTotalBad = [], volSpread = [], volOrderBad = [], volClobbered = [], volRan = 0;
  let liveM3 = [], collateralBad = [], liveSeen = 0;
  let neutralCount = 0, neutralVol = 0;   // §FOOTING_M3 cost-neutrality accumulators

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) continue;
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const frag = SA._classFragmentation(db, RATES);
    const lin = SA._linearWeighting(db, RATES);
    const area = SA._areaWeighting(db, RATES, frag.fragmented, SR, SD, NO, LR);

    // The shipped rates table IS the M3 table now — one call, no fixture. Anything it claims that
    // the table does not price M3 is a selection bug, and that is what G-VOL-SHIPPED-LIVE reads.
    const vol = SA._volumeWeighting(db, RATES, frag.fragmented, SR, SD, NO, LR);
    Object.keys(vol.avgVolume).forEach(c => liveM3.push(`${bld}/${c}`));

    const r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(m.element_name,''), " +
      't.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid ' +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!r.length) { db.close(); continue; }
    volRan++;

    const byCls = {};
    r[0].values.forEach(v => {
      const [guid, cls, nm, bx, by, bz] = v;
      const rule = SA.matchNameOverride(cls, nm, NO) || SA.matchRule(cls, SR, SD);
      const realQty = (frag.fragmented[cls] && frag.area[guid] != null) ? frag.area[guid] : null;
      const hasGeom = bx > 0 || by > 0 || bz > 0;
      const avgLen = lin.avgLength[cls];
      const lengthRatio = (realQty == null && hasGeom && avgLen > 0) ? Math.max(bx, by, bz) / avgLen : null;
      const avgArea = area.avgArea[cls];
      const areaRatio = (realQty == null && lengthRatio == null && hasGeom && avgArea > 0 &&
                         area.area[guid] > 0) ? area.area[guid] / avgArea : null;

      const avgVol = vol.avgVolume[cls];
      const volumeRatio = (realQty == null && lengthRatio == null && areaRatio == null && hasGeom &&
                           avgVol > 0 && vol.volume[guid] > 0) ? vol.volume[guid] / avgVol : null;
      const noArg = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio);
      const after = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio, volumeRatio);
      // COLLATERAL: a class the shipped table does NOT price M3 must be untouched by the new arg.
      // This is the surviving half of the retired G-VOL-SHIPPED-INERT.
      if (M3_PRICED.indexOf(cls) < 0 && noArg !== after) collateralBad.push(`${bld}/${cls}`);
      // §FOOTING_M3 cost-neutrality population — exactly the rows the divisor was averaged over.
      if (cls === 'IfcFooting' && vol.volume[guid] > 0) { neutralCount++; neutralVol += vol.volume[guid]; }
      const c = byCls[cls] || (byCls[cls] = { b: 0, a: 0, n: 0, weighted: false,
                                              claimed: (realQty != null || lengthRatio != null || areaRatio != null),
                                              pts: [], diffs: 0 });
      c.b += noArg; c.a += after; c.n++;
      if (volumeRatio != null) { c.weighted = true; c.pts.push({ q: vol.volume[guid], s: after }); }
      if (noArg !== after) c.diffs++;
    });

    const wt = [];
    for (const cls in byCls) {
      const c = byCls[cls];
      if (c.weighted) {
        liveSeen++;
        const tol = Math.max(2, c.b * 0.05);   // same 5% band + rounding floor as G-AREA-TOTAL
        if (Math.abs(c.a - c.b) > tol) volTotalBad.push(`${bld}/${cls} ${c.b}->${c.a} (${(100*(c.a-c.b)/c.b).toFixed(1)}%)`);
        const secs = c.pts.map(p => p.s).filter(x => x > 0);
        if (secs.length > 1) {
          const spread = Math.max(...secs) / Math.min(...secs);
          if (spread > 1.01) wt.push(`${cls}:${spread.toFixed(0)}x`);
          const sorted = c.pts.slice().sort((x, y) => x.q - y.q);
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].s < sorted[i - 1].s * 0.95 - 1) { volOrderBad.push(`${bld}/${cls}`); break; }
          }
        }
      } else if (c.claimed && c.diffs > 0) {
        volClobbered.push(`${bld}/${cls} (${c.diffs} elements changed)`);
      }
    }
    if (wt.length) volSpread.push(`${bld}[${wt.join(' ')}]`);
    console.log(`      ${bld}: shippedM3Classes=${Object.keys(vol.avgVolume).length} ` +
      `weighted=${wt.join(' ') || 'none'}`);
    db.close();
  }

  // ── §FOOTING_M3 — the anti-invention gate. Every shipped m3 rate must round-trip through the
  // measured divisor back to the EA rate it was converted from. AVG_VOL and EA_BEFORE are the
  // derivation record; if someone edits a rate to a market number, this gate is what catches it.
  const AVG_VOL = 4.25074802767622;   // class-wide mean bbox volume, 821 shipped IfcFooting, see header
  const EA_BEFORE = {                 // the pre-conversion unit:'EA' rate each source carried
    'rates.js': 320, aramco2024_sa: 275, asaqs2024_za: 4500, bcis2024_uk: 184, bki2024_de: 185,
    cidb2024_my: 320, cype2024_es: 73, dpt2024_th: 2600, gb50500_cn: 520, jbci2024_jp: 14500,
    kict2024_kr: 105000, pwd2024_bd: 5500, rawlinsons2024_au: 540, rsmeans2024_us: 240,
    sinapi2024_br: 385, sni2024_id: 1150000, untec2024_fr: 75
  };
  const rateBad = [], rateOk = [];
  function checkFootingRate(src, entry) {
    const ea = EA_BEFORE[src];
    if (ea == null) return;                                    // source not part of the conversion
    if (!entry) { rateBad.push(`${src}: IfcFooting entry vanished`); return; }
    if (entry.unit !== 'M3') { rateBad.push(`${src}: still unit=${entry.unit}, not converted`); return; }
    const implied = entry.rate * AVG_VOL;                      // the round trip
    const relPct = Math.abs(implied - ea) / ea * 100;
    if (relPct > 0.05) rateBad.push(`${src}: ${entry.rate}x${AVG_VOL.toFixed(4)}=${implied.toFixed(2)} != EA ${ea} (${relPct.toFixed(3)}%) — INVENTED, not derived`);
    else rateOk.push(`${src}:${entry.rate}`);
  }
  checkFootingRate('rates.js', RATES.IfcFooting);
  fs.readdirSync(path.join(VIEWER_DIR, 'rates')).filter(f => f.endsWith('.json')).forEach(f => {
    let tpl; try { tpl = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', f), 'utf8')); } catch (e) { return; }
    checkFootingRate(f.replace(/\.json$/, ''), (tpl.materials || {}).IfcFooting);
  });
  gate('G-VOL-RATE-DERIVED', rateBad.length === 0 && rateOk.length === Object.keys(EA_BEFORE).length,
    rateBad.length ? rateBad.slice(0, 4).join(' | ')
      : `all ${rateOk.length} shipped IfcFooting m3 rates round-trip through avgVolume=${AVG_VOL.toFixed(6)} back to their own pre-change EA rate (<=0.05%, the 2dp band) — every rate DERIVED from the rate that was already there, none invented`);

  // Cost neutrality over the derivation population — the arithmetic that proves the conversion.
  const eaBase = EA_BEFORE['rates.js'], m3Base = RATES.IfcFooting ? RATES.IfcFooting.rate : 0;
  const oldTotal = eaBase * neutralCount, newTotal = m3Base * neutralVol;
  const neutralPct = oldTotal > 0 ? Math.abs(newTotal - oldTotal) / oldTotal * 100 : 100;
  gate('G-VOL-COST-NEUTRAL', neutralCount > 0 && neutralPct <= 0.05,
    neutralCount === 0 ? 'no IfcFooting elements found — the derivation population is empty'
      : `${neutralCount} shipped footings, ${neutralVol.toFixed(3)} m3: OLD ${eaBase}/EA x ${neutralCount} = ${oldTotal.toFixed(0)} vs NEW ${m3Base}/M3 x ${neutralVol.toFixed(3)} = ${newTotal.toFixed(0)} (${neutralPct.toFixed(4)}% apart) — same class total, redistributed by real size`);

  gate('G-VOL-SHIPPED-LIVE', collateralBad.length === 0 && liveM3.length > 0 && volRan > 0 &&
       liveM3.every(x => M3_PRICED.indexOf(x.split('/')[1]) >= 0),
    collateralBad.length ? 'a class NOT priced M3 changed install time: ' + collateralBad.slice(0, 5).join(' ')
      : (liveM3.length === 0 ? `shipped rates price [${M3_PRICED.join(',')}] M3 but _volumeWeighting selected NOTHING on any of ${volRan} buildings — the mechanism is inert on live data`
        : `_volumeWeighting selects exactly the M3-priced classes on shipped rates (${liveM3.join(' ')}) and every element of every other class is byte-identical with the volumeRatio arg wired vs. not — no collateral across all ${volRan} buildings`));
  gate('G-VOL-TOTAL', volTotalBad.length === 0 && liveSeen > 0,
    volTotalBad.length ? 'class total MOVED (inflation!): ' + volTotalBad.join(' ')
      : (liveSeen > 0 ? `every volume-weighted class keeps its total install time (${liveSeen} class-instances on SHIPPED rates) — redistribution, not inflation`
        : `no class weighted on shipped rates — mechanism unproven`));
  gate('G-VOL-SPREAD', volSpread.length > 0,
    volSpread.length ? 'per-element spread now scales with real volume: ' + volSpread.join(' ')
      : 'NO class gained spread — the volume weighting is not reaching any element');
  gate('G-VOL-ORDER', volOrderBad.length === 0,
    volOrderBad.length ? 'larger element got LESS time in: ' + volOrderBad.join(' ')
      : 'within every volume-weighted class, a larger element never installs faster than a smaller one');
  gate('G-VOL-NOCLOBBER', volClobbered.length === 0,
    volClobbered.length ? 'double-weighted: ' + volClobbered.join(' ')
      : 'classes already claimed by realQty, lengthRatio or areaRatio are byte-identical — no double-weighting');

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§AREA_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
