#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — W-S9-PURE (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S9-WITNESS). Read the log after every run.
// SPEC: viewer/proj_order_state.js is the ONE owner of the Project-Order read + Generate / delete&re-issue / VO on an edited part. On the REAL erp/ad_seed.db
//   and the REAL Duplex DB, each claim names what would falsify it:
//   S1 PRICED-PARITY  pricedRowsFor == navigate_find.js _selectionPriced's SQL fold (same rows) for a real multi-class guid set (a drifted quantity twin fails).
//   S2 NOT-GENERATED  a building with no C_Project reads generated=false and decide() offers only Generate.
//   S3 GENERATE       Generate -> exactly ONE C_Project row for the building; plannedAmt == the independent BigDecimal sum of the rows; a 2nd Generate adds +0 rows.
//   S4 VARIANT        an EDITED part of a generated PO -> decide() = variant, offering deleteReissue AND issueVO (uncommitted).
//   S5 OPTION-A       delete & re-issue leaves EXACTLY ONE project row, and the new plannedAmt == the independent sum over the POST-EDIT quantities.
//   S6 COMMITTED      a completed sub purchase order on the project (fixture) -> committed=true FROM RECORDS; option A is REFUSED with its reason named (and changes 0 rows).
//   S7 OPTION-B       issueVO adds exactly one VO order; its GrandTotal == the independent BigDecimal (rate x 1.3 x loading x count); the contract's revised sum
//                     moves ONLY when the VO is approved (vo_approve), by exactly its GrandTotal.
//   S8 LAUNCH         the ERP link carries the C_Project id: ../erp/idempiere.html?client=garden&window=130&record=<id>.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..'), ROOT = path.join(V, '..');
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const ED = require(path.join(V, 'edit_delta.js')), PS = require(path.join(V, 'proj_order_state.js'));
const ProjFold = require(path.join(V, 'proj_fold.js')), VoFold = require(path.join(V, 'vo_fold.js')), ProjControl = require(path.join(V, 'proj_control.js')), VoApprove = require(path.join(V, 'vo_approve.js'));
const rt = {}; vm.runInNewContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + '\n;__o.RATES=RATES;__o.LABOR_RATES=LABOR_RATES;__o.SEQUENCE_RULES=SEQUENCE_RULES;__o.RATES_DEFAULT=RATES_DEFAULT;', { __o: rt, console, window: undefined });
const env = { EditDelta: ED, ProjFold, VoFold, ProjControl, BigDecimal, RATES: rt.RATES, RATES_DEFAULT: rt.RATES_DEFAULT, SEQUENCE_RULES: rt.SEQUENCE_RULES, LABOR_RATES: rt.LABOR_RATES };
const out = []; const G = (n, s, d) => { out.push(s); console.log('§S9_PURE ' + n + ' ' + d + ' => ' + s); };
const realLog = console.log; const quiet = f => { console.log = () => {}; try { return f(); } finally { console.log = realLog; } };
const NOW = '2026-09-30 09:00:00', BUILD = 'Duplex';
const one = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values[0] : null; };
const HALF_UP = BigDecimal.RoundingMode.HALF_UP;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const bdb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'modeller', 'Duplex_extracted.db')));
  const erp = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  // a real multi-class guid set: every wall + door + window
  const guids = bdb.exec("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWallStandardCase','IfcDoor','IfcWindow') AND t.bbox_x>0")[0].values.map(v => v[0]);
  const walls = bdb.exec("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='IfcWallStandardCase' AND t.bbox_x>0 ORDER BY t.bbox_x*t.bbox_y*t.bbox_z DESC LIMIT 3")[0].values.map(v => v[0]);

  // S1 — parity vs the _selectionPriced SQL
  const AREA = "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END";
  const ph = guids.map(() => '?').join(',');
  const sqlRows = bdb.exec("SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) cnt, SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)) len, SUM(" + AREA + ") area, SUM(t.bbox_x*t.bbox_y*t.bbox_z) vol FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.guid IN (" + ph + ") AND t.bbox_x IS NOT NULL AND t.bbox_x>0 GROUP BY m.discipline, m.ifc_class, m.storey", guids)[0].values;
  const exp = sqlRows.map(r => { const rt2 = env.RATES[r[1]], unit = rt2 ? rt2.unit : 'EA', rate = rt2 ? rt2.rate : 0; const qty = unit === 'M' ? r[4] : unit === 'M2' ? r[5] : unit === 'M3' ? r[6] : r[3]; return { k: (r[0] || '_') + '|' + r[1] + '|' + (r[2] || '_'), count: r[3], qty, cost: Math.round(rate * qty) }; }).sort((a, b) => a.k < b.k ? -1 : 1);
  const got = PS.pricedRowsFor(bdb, guids, env, null).rows.map(r => ({ k: r.disc + '|' + r.cls + '|' + r.storey, count: r.count, qty: r.qty, cost: r.cost })).sort((a, b) => a.k < b.k ? -1 : 1);
  const same = exp.length === got.length && exp.every((e, i) => e.k === got[i].k && e.count === got[i].count && Math.abs(e.qty - got[i].qty) < 1e-9 && e.cost === got[i].cost);
  G('S1 PRICED-PARITY', got.length === 0 ? 'INCONCLUSIVE' : (same ? 'PASS' : 'FAIL'), 'guids=' + guids.length + ' groups=' + got.length + ' totalCost=' + got.reduce((s, r) => s + r.cost, 0) + ' allEqual=' + same);

  // S2 — not generated (building absent in the seed)
  const s0 = PS.readState(erp, BUILD, ['IfcWallStandardCase'], env), d0 = PS.decide(s0, false);
  G('S2 NOT-GENERATED', !s0.generated && d0.kind === 'not-generated' && d0.actions.join() === 'generate' ? 'PASS' : 'FAIL', 'generated=' + s0.generated + ' kind=' + d0.kind + ' actions=' + d0.actions.join());

  // S3 — generate
  const rows0 = PS.pricedRowsFor(bdb, guids, env, null).rows;
  const p0 = quiet(() => PS.generate(erp, BUILD, rows0, env, NOW, 'USD'));
  const indep = (rows) => rows.reduce((s, r) => s.add(BigDecimal.of(String(r.rate)).multiply(BigDecimal.of(String(r.qty))).setScale(0, HALF_UP)), BigDecimal.ZERO).toString();
  const s1 = PS.readState(erp, BUILD, ['IfcWallStandardCase'], env);
  const again = quiet(() => PS.generate(erp, BUILD, rows0, env, NOW, 'USD'));
  const nProj = PS.countProjects(erp, BUILD);
  G('S3 GENERATE', nProj === 1 && s1.generated && s1.plannedAmt === indep(rows0) && again.created.lines === 0 && again.created.phases === 0 ? 'PASS' : 'FAIL',
    'projectRows=' + nProj + ' plannedAmt=' + s1.plannedAmt + ' independentSum=' + indep(rows0) + ' secondGenerate lines=+' + again.created.lines + ' phases=+' + again.created.phases + ' inPO=' + s1.inPO.join());

  // S4 — an edited wall makes it a variant
  const net = ED.netEdits([{ op_type: 'GEOM_SCALE', parameters: { parent: 1, fx: 1, fy: 1.25, fz: 1 } }]).get(1);
  const edits = {}; edits[walls[0]] = net;
  const d1 = PS.decide(s1, true);
  G('S4 VARIANT', d1.kind === 'variant' && d1.actions.join() === 'deleteReissue,issueVO' && !d1.refuseDeleteReissue ? 'PASS' : 'FAIL', 'kind=' + d1.kind + ' actions=' + d1.actions.join() + ' refuse=' + d1.refuseDeleteReissue);

  // S6 first (committed fixture on a COPY) so S5 runs on the uncommitted store
  const erpC = new SQL.Database(erp.export());
  erpC.run("INSERT INTO C_Order (C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,C_BPartner_ID,Description,IsSOTrx,DocStatus,GrandTotal,C_Project_ID,DocumentNo) VALUES (991001,11,11,'Y',120,'Sub-contract PO (fixture): Duplex','N','CO',1000,?, 'FIX-1')", [s1.projectId]);
  const sC = PS.readState(erpC, BUILD, ['IfcWallStandardCase'], env), dC = PS.decide(sC, true);
  const beforeRows = PS.countProjects(erpC, BUILD), amtBefore = sC.plannedAmt;
  const rows1 = PS.pricedRowsFor(bdb, guids, env, edits).rows;
  const refused = quiet(() => PS.deleteReissue(erpC, BUILD, rows1, env, NOW, 'USD', sC));
  const sC2 = PS.readState(erpC, BUILD, ['IfcWallStandardCase'], env);
  G('S6 COMMITTED', sC.committed.is && dC.actions.join() === 'issueVO' && refused.ok === false && /committed/.test(refused.reason) && PS.countProjects(erpC, BUILD) === beforeRows && sC2.plannedAmt === amtBefore ? 'PASS' : 'FAIL',
    'committed=' + sC.committed.is + ' why=' + JSON.stringify(sC.committed.why) + ' actions=' + dC.actions.join() + ' optionA.ok=' + refused.ok + ' reason="' + (refused.reason || '').slice(0, 90) + '" projectRows ' + beforeRows + '->' + PS.countProjects(erpC, BUILD) + ' plannedAmt unchanged=' + (sC2.plannedAmt === amtBefore));

  // S7 — option B on the committed copy
  const voRows = PS.voRowsForEdited(bdb, [walls[0]], env);
  const vo = quiet(() => PS.issueVO(erpC, BUILD, voRows, env, NOW, 'USD'));
  const load = BigDecimal.of('1').add(BigDecimal.of('0.10')).add(BigDecimal.of('0.15')).multiply(BigDecimal.of('1').add(BigDecimal.of('0.05')));
  const expVO = voRows.reduce((s, r) => s.add(BigDecimal.of(String(r.rate)).multiply(BigDecimal.of('1.3')).multiply(load).setScale(2, HALF_UP).multiply(BigDecimal.of(String(r.count))).setScale(2, HALF_UP)), BigDecimal.ZERO).toString();
  const sV = PS.readState(erpC, BUILD, ['IfcWallStandardCase'], env);
  const rev0 = sV.contract.revised;
  const ap = quiet(() => VoApprove.approveVariationOrder(erpC, vo.orderId, { now: NOW }));
  const sV2 = PS.readState(erpC, BUILD, ['IfcWallStandardCase'], env);
  const revExp = BigDecimal.of(sV.contract.original).add(BigDecimal.of(expVO)).toString();
  G('S7 OPTION-B', vo.created.orders === 1 && vo.grandTotal === expVO && sV.vos.length === 1 && rev0 === sV.contract.original && ap.ok && BigDecimal.of(sV2.contract.revised).compareTo(BigDecimal.of(revExp)) === 0 ? 'PASS' : 'FAIL',
    'voRows=' + JSON.stringify(voRows.map(r => r.status + ':' + r.cls + 'x' + r.count + '@' + r.rate)) + ' grandTotal=' + vo.grandTotal + ' independent=' + expVO + ' voOrders=' + sV.vos.length + ' revised before-approve=' + rev0 + ' (original ' + sV.contract.original + ') after-approve=' + sV2.contract.revised + ' expected=' + revExp);

  // S5 — option A on the uncommitted store
  const rows1b = PS.pricedRowsFor(bdb, guids, env, edits).rows;
  const ra = quiet(() => PS.deleteReissue(erp, BUILD, rows1b, env, NOW, 'USD', s1));
  const sA = PS.readState(erp, BUILD, ['IfcWallStandardCase'], env);
  const dPlanned = BigDecimal.of(sA.plannedAmt).subtract(BigDecimal.of(s1.plannedAmt)).toString();
  const dIndep = BigDecimal.of(indep(rows1b)).subtract(BigDecimal.of(indep(rows0))).toString();
  G('S5 OPTION-A', ra.ok && PS.countProjects(erp, BUILD) === 1 && sA.plannedAmt === indep(rows1b) && dPlanned === dIndep && Number(dPlanned) > 0 ? 'PASS' : 'FAIL',
    'ok=' + ra.ok + ' projectRows ' + ra.projectRowsBefore + '->' + ra.projectRowsAfter + ' plannedAmt ' + s1.plannedAmt + '->' + sA.plannedAmt + ' (delta ' + dPlanned + ', independent ' + dIndep + ')');

  // S8 — launch url
  G('S8 LAUNCH', PS.launchUrl(sA.projectId) === '../erp/idempiere.html?client=garden&window=130&record=' + sA.projectId && sA.url === PS.launchUrl(sA.projectId) ? 'PASS' : 'FAIL', 'url=' + sA.url);
})().then(() => {
  const c = s => out.filter(x => x === s).length;
  console.log('§S9_PURE SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE'); process.exit(c('FAIL') ? 1 : 0);
}).catch(e => { console.log('§S9_PURE FATAL ' + (e && e.stack || e)); process.exit(2); });
