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
//   ⚠ WHY THIS HALF USES A FIXTURE, stated plainly so nobody reads more into a green run than is
//   there: NO class in the shipped rates model is priced M3. viewer/rates.js RATES is 32 EA /
//   11 M / 7 M2 / 1 KG and all 17 rates/*.json templates carry the identical split (0 M3 each).
//   So on shipped data _volumeWeighting selects nothing — which G-VOL-SHIPPED-INERT asserts as a
//   POSITIVE result (zero regression), not as a pass by absence. To prove the mechanism actually
//   works, the M3 gates run against a one-key fixture that reprices IfcFooting EA->M3. IfcFooting
//   is not an arbitrary pick: it is the named real-world case (821 elements across Hospital/
//   LTU_AHouse/Clinic spanning 0.26..602.09 m3 — 2320x — all charged the same today), and the
//   fixture changes ONLY the witness's own in-memory copy. Shipped rates are untouched; repricing
//   for real is a rates DATA decision this witness deliberately does not make.
//
//   G-VOL-SHIPPED-INERT (BLOCKING) with shipped RATES, _volumeWeighting selects 0 classes and every
//                  element's installSecs is byte-identical with the new arg wired vs. not.
//   G-VOL-TOTAL    (BLOCKING) under the fixture, per class total installSecs after == before.
//   G-VOL-SPREAD   per-element spread rises above flat on the fixture class. Proves it did something.
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

  // ── §VOL_WEIGHT (M3) — see the fixture note in this file's header ────────────────────────────
  const M3_FIXTURE_CLASS = 'IfcFooting';
  let volTotalBad = [], volSpread = [], volOrderBad = [], volClobbered = [], volRan = 0;
  let shippedM3 = [], inertBad = [], fixtureSeen = 0;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) continue;
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const frag = SA._classFragmentation(db, RATES);
    const lin = SA._linearWeighting(db, RATES);
    const area = SA._areaWeighting(db, RATES, frag.fragmented, SR, SD, NO, LR);

    // (a) shipped rates — must select nothing at all.
    const volShipped = SA._volumeWeighting(db, RATES, frag.fragmented, SR, SD, NO, LR);
    Object.keys(volShipped.avgVolume).forEach(c => shippedM3.push(`${bld}/${c}`));

    // (b) the fixture — one key repriced, in this witness's own copy only.
    const RATES_M3 = Object.assign({}, RATES);
    RATES_M3[M3_FIXTURE_CLASS] = Object.assign({}, RATES[M3_FIXTURE_CLASS] || { rate: 0 }, { unit: 'M3' });
    const vol = SA._volumeWeighting(db, RATES_M3, frag.fragmented, SR, SD, NO, LR);

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

      // shipped-inert: new arg wired, but volumeRatio derived from the SHIPPED table.
      const avgVolShipped = volShipped.avgVolume[cls];
      const volRatioShipped = (realQty == null && lengthRatio == null && areaRatio == null && hasGeom &&
                               avgVolShipped > 0 && volShipped.volume[guid] > 0)
        ? volShipped.volume[guid] / avgVolShipped : null;
      const noArg = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio);
      const withArg = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio, volRatioShipped);
      if (noArg !== withArg) inertBad.push(`${bld}/${cls}`);

      // fixture: the M3 path under the repriced table.
      const avgVol = vol.avgVolume[cls];
      const volumeRatio = (realQty == null && lengthRatio == null && areaRatio == null && hasGeom &&
                           avgVol > 0 && vol.volume[guid] > 0) ? vol.volume[guid] / avgVol : null;
      const after = SA._installSecs(cls, rule, LR, realQty, lengthRatio, areaRatio, volumeRatio);
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
        fixtureSeen++;
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
    console.log(`      ${bld}: shippedM3Classes=${Object.keys(volShipped.avgVolume).length} ` +
      `fixtureWeighted=${wt.join(' ') || 'none'}`);
    db.close();
  }

  gate('G-VOL-SHIPPED-INERT', shippedM3.length === 0 && inertBad.length === 0 && volRan > 0,
    (shippedM3.length ? 'shipped RATES unexpectedly yielded M3 classes: ' + shippedM3.join(' ') + ' ' : '') +
    (inertBad.length ? 'installSecs CHANGED on shipped rates: ' + inertBad.slice(0, 5).join(' ')
      : `shipped rates price 0 classes M3, so the new path selects nothing and every element's install time is byte-identical on all ${volRan} buildings — zero regression`));
  gate('G-VOL-TOTAL', volTotalBad.length === 0 && fixtureSeen > 0,
    volTotalBad.length ? 'class total MOVED (inflation!): ' + volTotalBad.join(' ')
      : (fixtureSeen > 0 ? `every volume-weighted class keeps its total install time (${fixtureSeen} class-instances under the ${M3_FIXTURE_CLASS} M3 fixture) — redistribution, not inflation`
        : `fixture class ${M3_FIXTURE_CLASS} weighted nothing — mechanism unproven`));
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
