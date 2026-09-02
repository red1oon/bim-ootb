/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_vo_fold.js — BIM → Variation Order, TASK F witness (docs/BIMtoProject.md §H1)
// Folds a model-DELTA (added/removed/changed) into a SIGNED iDempiere C_Order amendment against the
//   building's existing C_Project — reusing the FIDIC/AACE cost model (== viewer/variation_order.js)
//   but money via BigDecimal. Non-destructive: in-memory copy of ad_seed.db.
// Proves (each block names the issue it proves/disproves):
//   W-VO-FOLD       — fold creates ONE C_Order amendment (DR) + one C_OrderLine per status×class.
//   W-VO-AMT        — GrandTotal == Σ LineNetAmt == the hand-computed BigDecimal golden, to the cent
//                     (loaded price = rate×factor×(1+OH+markup)(1+disruption); qty×price == net invariant).
//   W-VO-SIGN       — a REMOVED line carries NEGATIVE QtyOrdered and NEGATIVE LineNetAmt (a real credit).
//   W-VO-LINK       — the amendment links to the C_Project (C_Project_ID) and references the base PO (Ref_Order_ID).
//   W-VO-IDEMPOTENT — re-folding the SAME delta adds 0 rows and returns the same order (digest natural key).
//   W-VO-NEWDELTA   — a DIFFERENT delta mints a NEW VO doc (voSeq=2), not a dup.
//   W-VO-CONTRACT   — vo_fold.js dual-exports VoFold and is loaded by viewer.html (engine ships).
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_vo_fold.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');
const VoFold = require('../viewer/vo_fold.js');

const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §VO FAIL: ' + name); } }
function totC(c) { return c.orders + c.lines + c.products + c.categories; }

(async function () {
  if (!ERP) { console.log('§VO_FOLD SKIP — missing erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const edb = new SQL.Database(fs.readFileSync(ERP));            // IN-MEMORY writable copy (file untouched)
  const BUILDING = 'VOTestBuilding';
  const now = '2026-06-14 00:00:00';
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));

  // ── arrange: a base C_Project + PO for the building, so the VO has a project to amend + a PO to reference ──
  const basePriced = [
    { disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 20, unit: 'EA', qty: 20, rate: 100, cost: 2000 },
    { disc: 'MEP', cls: 'IfcPipeSegment', storey: 'L1', count: 12, unit: 'EA', qty: 12, rate: 50, cost: 600 },
  ];
  const baseProj = ProjFold.foldProjectOrder(edb, BUILDING, basePriced,
    { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'USD', now: now, bpartnerId: 119 });
  console.log('§VO_ARRANGE base project=' + baseProj.projectId + ' basePO=' + (baseProj.orderId || '-'));

  // ── the model-delta (the IFC diff, priced per status×class) ──
  const voRows = [
    { status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'EA' },
    { status: 'REMOVED', cls: 'IfcDoor', disc: 'ARC', storey: 'L1', count: 4, rate: 200, unit: 'EA' },
    { status: 'CHANGED', cls: 'IfcPipeSegment', disc: 'MEP', storey: 'L1', count: 6, rate: 50, unit: 'EA' },
  ];
  // hand-computed BigDecimal golden: load=(1+.10+.15)(1+.05)=1.3125
  //   ADDED   IfcWall  131.25 × +10 = +1312.50
  //   REMOVED IfcDoor   78.75 × -4  =  -315.00
  //   CHANGED IfcPipe    85.31 × +6  =  +511.86   (85.3125→85.31 HALF_UP)
  //   GrandTotal = 1509.36
  const GOLDEN = '1509.36';

  // ── FOLD 1 ──
  const r1 = VoFold.foldVariationOrder(edb, BUILDING, voRows, { packCurrencyISO: 'USD', now: now });
  r1.notes.forEach(n => console.log('  §VO_NOTE ' + n));
  console.log('§VO_FOLD doc=' + r1.docNo + ' order=' + r1.orderId + ' orders=+' + r1.created.orders +
    ' lines=+' + r1.created.lines + ' products=+' + r1.created.products + ' grandTotal=' + r1.grandTotal);
  ok(r1.created.orders === 1, 'fold created exactly one C_Order amendment');
  ok(r1.created.lines === 3, 'one C_OrderLine per status×class (3)');

  // ── W-VO-AMT: GrandTotal == golden, and == Σ LineNetAmt actually persisted ──
  const gt = edb.exec("SELECT GrandTotal FROM C_Order WHERE C_Order_ID=" + r1.orderId)[0].values[0][0];
  const sumLines = edb.exec("SELECT TOTAL(LineNetAmt) FROM C_OrderLine WHERE C_Order_ID=" + r1.orderId)[0].values[0][0];
  const amtOk = String(gt) === GOLDEN && Math.round(Number(sumLines) * 100) === Math.round(Number(GOLDEN) * 100) && r1.grandTotal === GOLDEN;
  console.log('§VO_AMT grandTotal=' + gt + ' ΣlineNet=' + sumLines + ' golden=' + GOLDEN + ' match=' + amtOk);
  ok(amtOk, 'GrandTotal == ΣLineNetAmt == BigDecimal golden to the cent');

  // ── W-VO-SIGN: REMOVED line is a real negative credit ──
  const rem = edb.exec("SELECT QtyOrdered, LineNetAmt, Description FROM C_OrderLine WHERE C_Order_ID=" + r1.orderId +
    " AND Description LIKE 'REMOVED%'")[0].values[0];
  const signOk = Number(rem[0]) < 0 && Number(rem[1]) < 0;
  console.log('§VO_SIGN removed qty=' + rem[0] + ' net=' + rem[1] + ' negative=' + signOk + ' ("' + rem[2] + '")');
  ok(signOk, 'REMOVED line has negative QtyOrdered and LineNetAmt');

  // ── W-VO-LINK: amendment is linked to the project + references the base PO; signed draft doc ──
  const ord = edb.exec("SELECT C_Project_ID, Ref_Order_ID, DocStatus, DocumentNo FROM C_Order WHERE C_Order_ID=" + r1.orderId)[0].values[0];
  const linkOk = Number(ord[0]) === Number(baseProj.projectId) && Number(ord[1]) === Number(baseProj.orderId) && ord[2] === 'DR' && !!ord[3];
  console.log('§VO_LINK project=' + ord[0] + ' refOrder=' + ord[1] + ' status=' + ord[2] + ' docNo=' + ord[3] +
    ' (project=' + baseProj.projectId + ' basePO=' + baseProj.orderId + ')');
  ok(linkOk, 'amendment links C_Project_ID + Ref_Order_ID (base PO), DocStatus=DR, DocumentNo set');

  // ── W-VO-IDEMPOTENT: re-fold the SAME delta → 0 new rows, same order ──
  const r2 = VoFold.foldVariationOrder(edb, BUILDING, voRows, { packCurrencyISO: 'USD', now: now });
  const idemp = totC(r2.created) === 0 && r2.orderId === r1.orderId;
  console.log('§VO_IDEMPOTENT 2nd-run-new=' + totC(r2.created) + ' sameOrder=' + (r2.orderId === r1.orderId) + ' match=' + idemp);
  ok(idemp, 're-folding the same delta adds 0 rows and returns the same VO order');

  // ── W-VO-NEWDELTA: a DIFFERENT delta mints a NEW VO doc (voSeq=2) ──
  const voRows2 = voRows.concat([{ status: 'ADDED', cls: 'IfcWindow', disc: 'ARC', storey: 'L2', count: 3, rate: 300, unit: 'EA' }]);
  const r3 = VoFold.foldVariationOrder(edb, BUILDING, voRows2, { packCurrencyISO: 'USD', now: now });
  const newOk = r3.created.orders === 1 && r3.orderId !== r1.orderId && r3.voSeq === 2;
  console.log('§VO_NEWDELTA doc=' + r3.docNo + ' order=' + r3.orderId + ' voSeq=' + r3.voSeq + ' new=' + newOk);
  ok(newOk, 'a different delta creates a new VO doc (voSeq=2), not a dup');

  // ── W-VO-CONTRACT: the engine ships (dual export + loaded by viewer.html) ──
  function srcHas(file, tokens) {
    const p = path.join(__dirname, '..', file);
    const s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(t => { const has = s.indexOf(t) >= 0; if (!has) console.log('  §VO_CONTRACT MISSING ' + file + ' :: ' + t); return has; });
  }
  const cFold = srcHas('viewer/vo_fold.js', ['function foldVariationOrder', 'global.VoFold', 'require(\'../erp/bigdecimal.js\')']);
  const cHtml = srcHas('viewer/viewer.html', ['vo_fold.js']);
  ok(cFold, 'vo_fold.js dual-exports VoFold + uses BigDecimal');
  ok(cHtml, 'viewer.html loads vo_fold.js');
  console.log('§VO_CONTRACT ' + (cFold && cHtml ? 'PASS' : 'FAIL') + ' — vo_fold=' + cFold + ' viewer.html=' + cHtml);

  edb.close();
  const allOk = fail === 0;
  console.log('§VO_FOLD ' + (allOk ? 'PASS' : 'FAIL') + ' — model-delta folds to a signed C_Order amendment; pass=' + pass + ' fail=' + fail);
  process.exit(allOk ? 0 : 1);
})();
