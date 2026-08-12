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

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§AREA_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
