#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — W-S8-PURE (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S8-WITNESS). Read the log after every run.
// SPEC: viewer/edit_delta.js is ONE pure function fed by the shipped owners. This witness proves, on the REAL Duplex DB (and every other
//   ARC DB in modeller/ that has the tables), what would falsify it:
//   P1 QTY-TWIN     qtyOf == the compute5D / _AREA_EXPR SQL for every element (a drifted twin fails), and the per-class sums equal
//                   analysis_sidecar.compute5D itself.                                                   (n elements judged, else INCONCLUSIVE)
//   P2 IDENTITY     net = identity -> costDelta 0.00 and labourDelta 0 for every element (a Δ from thin air fails).
//   P3 WALL-COST    a real IfcWallStandardCase (M2) scaled fy x1.5: costDelta == rate x (area_after - area_before) recomputed HERE from SQL.
//   P4 WALL-FLAT    the same wall: labourDelta == 0 and basis 'flat per element' (the shipped rule; a fabricated schedule number fails).
//   P5 LINEAR       an 'M'-unit class element, longest edge x2: labourDelta > 0, basis 'length-weighted' (INCONCLUSIVE if no such class).
//   P6 MOVE         a pure GEOM_MOVE net (dx only): costDelta 0.00 and label 'a move changes no quantity' (a move billed as quantity fails).
//   P7 GRID-BLOCKED a GEOM_GRID_MOVE touching a feature is FLAGGED unsupported, never priced.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..'), ROOT = path.join(V, '..');
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const SA = require(path.join(V, 'schedule_author.js'));
const AS = require(path.join(V, 'analysis_sidecar.js'));
const BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const ED = require(path.join(V, 'edit_delta.js'));
const rt = {}; vm.runInNewContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') +
  '\n;__o.RATES=RATES;__o.LABOR_RATES=LABOR_RATES;__o.SEQUENCE_RULES=SEQUENCE_RULES;__o.SEQUENCE_DEFAULT=SEQUENCE_DEFAULT;__o.SEQUENCE_NAME_OVERRIDES=SEQUENCE_NAME_OVERRIDES;', { __o: rt, console, window: undefined });
const env = { RATES: rt.RATES, LABOR_RATES: rt.LABOR_RATES, SEQUENCE_RULES: rt.SEQUENCE_RULES, SEQUENCE_DEFAULT: rt.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rt.SEQUENCE_NAME_OVERRIDES, ScheduleAuthor: SA, BigDecimal };
const out = []; const G = (n, s, d) => { out.push(s); console.log('§S8_PURE ' + n + ' ' + d + ' => ' + s); };
const realLog = console.log; const quiet = (f) => { console.log = () => {}; try { return f(); } finally { console.log = realLog; } };

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbs = fs.readdirSync(path.join(ROOT, 'modeller')).filter(f => /\.db$/.test(f)).map(f => path.join(ROOT, 'modeller', f));
  const opened = [];
  for (const f of dbs) { try { const db = new SQL.Database(fs.readFileSync(f)); const has = db.exec("SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0"); if (has.length && has[0].values[0][0] > 0) opened.push({ f: path.basename(f), db, n: has[0].values[0][0] }); } catch (e) { } }
  console.log('§S8_PURE dbs judged: ' + opened.map(o => o.f + '(' + o.n + ')').join(', '));
  const duplex = opened.find(o => o.f === 'Duplex_extracted.db');
  if (!duplex) { G('P0 SETUP', 'INCONCLUSIVE', 'Duplex_extracted.db not readable'); return; }

  // P1 — qty twin vs SQL, per element, all units; per-class sums vs compute5D
  { let n = 0, bad = 0, worst = 0;
    const areaExpr = "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END";
    for (const o of opened) {
      const r = o.db.exec("SELECT t.bbox_x,t.bbox_y,t.bbox_z, MAX(t.bbox_x,t.bbox_y,t.bbox_z), " + areaExpr + ", t.bbox_x*t.bbox_y*t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0");
      for (const v of r[0].values) { n++; const d = [v[0], v[1], v[2]];
        const e = Math.max(Math.abs(ED.qtyOf('M', d) - v[3]), Math.abs(ED.qtyOf('M2', d) - v[4]), Math.abs(ED.qtyOf('M3', d) - v[5]));
        worst = Math.max(worst, e); if (e > 1e-9) bad++; }
    }
    // compute5D wants the viewer schema (elements_meta.building/discipline/storey): mirror the REAL Duplex rows into it.
    const mir = new SQL.Database(); mir.run("CREATE TABLE elements_meta(guid TEXT, building TEXT, discipline TEXT, ifc_class TEXT, storey TEXT); CREATE TABLE element_transforms(guid TEXT, bbox_x REAL, bbox_y REAL, bbox_z REAL)");
    const src = duplex.db.exec("SELECT m.guid, m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0")[0].values;
    src.forEach(v => { mir.run("INSERT INTO elements_meta VALUES(?,?,?,?,?)", [v[0], 'Duplex', 'ARC', v[1], 'L1']); mir.run("INSERT INTO element_transforms VALUES(?,?,?,?)", [v[0], v[2], v[3], v[4]]); });
    const c5 = quiet(() => AS.compute5D(mir, 'Duplex'));
    let sumBad = 0; for (const row of c5.rows) { const ds = src.filter(v => v[1] === row.cls);
      const a = ds.reduce((s, v) => s + ED.qtyOf('M2', [v[2], v[3], v[4]]), 0), l = ds.reduce((s, v) => s + ED.qtyOf('M', [v[2], v[3], v[4]]), 0), vol = ds.reduce((s, v) => s + ED.qtyOf('M3', [v[2], v[3], v[4]]), 0);
      if (Math.abs(a - row.area_m2) > 0.002 || Math.abs(l - row.length_m) > 0.002 || Math.abs(vol - row.vol_m3) > 0.002 || ds.length !== row.count) sumBad++; }
    G('P1 QTY-TWIN', n === 0 ? 'INCONCLUSIVE' : (bad === 0 && sumBad === 0 ? 'PASS' : 'FAIL'), 'elements=' + n + ' mismatched=' + bad + ' worstAbsErr=' + worst.toExponential(2) + ' compute5D rows=' + c5.rows.length + ' rowSumMismatch=' + sumBad);
  }

  // P2 — identity net
  { const ctx = quiet(() => ED.classCtx(duplex.db, env)); const r = duplex.db.exec("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0");
    let n = 0, bad = 0; for (const [g] of r[0].values) { const rec = ED.readRecord(duplex.db, g); const d = quiet(() => ED.deltaFor(rec, null, ctx, env)); n++; if (d.costDelta !== '0' || d.labourSecsDelta !== 0) bad++; }
    G('P2 IDENTITY', n === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL'), 'elements=' + n + ' nonZeroDelta=' + bad);
  }

  // P3/P4 — a real wall
  const w = duplex.db.exec("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='IfcWallStandardCase' AND t.bbox_x>0 ORDER BY t.bbox_x*t.bbox_y*t.bbox_z DESC LIMIT 1");
  if (!w.length) { G('P3 WALL-COST', 'INCONCLUSIVE', 'no IfcWallStandardCase'); G('P4 WALL-FLAT', 'INCONCLUSIVE', 'no wall'); }
  else { const guid = w[0].values[0][0]; const rec = ED.readRecord(duplex.db, guid);
    const net = ED.netEdits([{ op_type: 'GEOM_SCALE', parameters: { parent: 1, fx: 1, fy: 1.5, fz: 1 } }]).get(1);
    const ctx = quiet(() => ED.classCtx(duplex.db, env)); const d = quiet(() => ED.deltaFor(rec, net, ctx, env));
    // independent recompute: area via SQL on scaled columns
    const ex = (sx, sy, sz) => duplex.db.exec("SELECT MAX(a,b,c) * CASE WHEN a>=b AND a>=c THEN MAX(b,c) WHEN b>=a AND b>=c THEN MAX(a,c) ELSE MAX(a,b) END FROM (SELECT ROUND(t.bbox_x,4)*" + sx + " a, ROUND(t.bbox_y,4)*" + sy + " b, ROUND(t.bbox_z,4)*" + sz + " c FROM element_transforms t WHERE t.guid='" + guid + "')")[0].values[0][0];
    const aB = ex(1, 1, 1), aA = ex(1, 1.5, 1); const rate = env.RATES.IfcWallStandardCase.rate;
    const exp = BigDecimal.of(String(rate)).multiply(BigDecimal.of(aA.toFixed(6))).setScale(0, BigDecimal.RoundingMode.HALF_UP).subtract(BigDecimal.of(String(rate)).multiply(BigDecimal.of(aB.toFixed(6))).setScale(0, BigDecimal.RoundingMode.HALF_UP)).toString();   // ONE BASIS: round0(rate x qty) per row, as proj_fold
    G('P3 WALL-COST', d.costDelta === exp && aA > aB ? 'PASS' : (aA === aB ? 'INCONCLUSIVE' : 'FAIL'), 'guid=' + guid + ' unit=' + d.unit + ' rate=' + rate + ' area ' + aB.toFixed(3) + '->' + aA.toFixed(3) + ' costDelta=' + d.costDelta + ' expected(independent)=' + exp);
    const direct = SA._installSecs(rec.cls, SA.matchNameOverride(rec.cls, rec.name, env.SEQUENCE_NAME_OVERRIDES) || SA.matchRule(rec.cls, env.SEQUENCE_RULES, env.SEQUENCE_DEFAULT), env.LABOR_RATES, null, null);
    G('P4 WALL-FLAT', d.labourSecsDelta === 0 && d.schedBasis === 'flat per element' ? 'PASS' : 'FAIL', 'labourSecs ' + d.labourSecsBefore + '->' + d.labourSecsAfter + ' delta=' + d.labourSecsDelta + ' basis=' + d.schedBasis + ' ownerFlatSecs=' + direct);
    // P6 move
    const mv = ED.netEdits([{ op_type: 'GEOM_MOVE', parameters: { parent: 1, dx: 0.5, dy: 0, dz: 0 } }]).get(1); const dm = quiet(() => ED.deltaFor(rec, mv, ctx, env));
    G('P6 MOVE', dm.costDelta === '0' && dm.labourSecsDelta === 0 && dm.labels.indexOf('a move changes no quantity') >= 0 ? 'PASS' : 'FAIL', 'costDelta=' + dm.costDelta + ' labourDelta=' + dm.labourSecsDelta + ' labels[0]=' + dm.labels[0]);
    // P7 grid
    const gm = ED.netEdits([{ op_type: 'GEOM_GRID_MOVE', parameters: { commands: [{ featureId: 1 }] } }]).get(1); const dg = quiet(() => ED.deltaFor(rec, gm, ctx, env));
    G('P7 GRID-BLOCKED', dg.unsupported.indexOf('GEOM_GRID_MOVE') >= 0 && dg.costDelta === '0' ? 'PASS' : 'FAIL', 'unsupported=' + JSON.stringify(dg.unsupported) + ' costDelta=' + dg.costDelta);
  }

  // P5 — a linear class
  { let hit = null;
    for (const o of opened) { const ctx = quiet(() => ED.classCtx(o.db, env)); const cl = Object.keys(ctx.lin.avgLength)[0]; if (!cl) continue;
      const r = o.db.exec("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='" + cl + "' AND t.bbox_x>0 LIMIT 1"); if (r.length) { hit = { o, ctx, guid: r[0].values[0][0], cl }; break; } }
    if (!hit) G('P5 LINEAR', 'INCONCLUSIVE', 'no M-unit class with a labour rate in any DB under modeller/ (walls/slabs are M2 = flat)');
    else { const rec = ED.readRecord(hit.o.db, hit.guid); const i = rec.dims.indexOf(Math.max.apply(null, rec.dims)); const f = [1, 1, 1]; f[i] = 2;
      const net = ED.netEdits([{ op_type: 'GEOM_SCALE', parameters: { parent: 1, fx: f[0], fy: f[1], fz: f[2] } }]).get(1); const d = quiet(() => ED.deltaFor(rec, net, hit.ctx, env));
      G('P5 LINEAR', d.schedBasis === 'length-weighted (linear class)' && d.labourSecsDelta !== 0 ? 'PASS' : (d.labourSecsBefore === d.labourSecsAfter && d.labourSecsBefore === 120 ? 'INCONCLUSIVE' : 'FAIL'), 'db=' + hit.o.f + ' cls=' + hit.cl + ' labourSecs ' + d.labourSecsBefore + '->' + d.labourSecsAfter + ' basis=' + d.schedBasis + ' costDelta=' + d.costDelta);
    } }
})().then(() => {
  const c = s => out.filter(x => x === s).length;
  console.log('§S8_PURE SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE');
  process.exit(c('FAIL') ? 1 : 0);
}).catch(e => { console.log('§S8_PURE FATAL ' + (e && e.stack || e)); process.exit(2); });
