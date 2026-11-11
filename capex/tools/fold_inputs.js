// capex/tools/fold_inputs.js — the node-side INPUTS of viewer/proj_fold.js foldProjectOrder, in one place
// (prompts/CAPEX_DASHBOARD.md §5.1 R1 BUILD SPEC). Nothing here computes a schedule: the programme is the
// 4D owner's (schedule_author.js materializeZones → tasks), read from the persisted run of
// scripts/cache_4d_run.js (current code key only — a stale run is never read; build it with `node scripts/cache_4d_run.js <bld>`). Quantities are the Viewer's 5D rule
// (bbox length / area / volume per element, the same expressions compute5D used in tests/poc_proj_push.js).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// per-element quantities (one row per element with a size) — grouped below, never re-measured
function elementQty(db, building) {
  const blds = [].concat(building).map(b => "'" + String(b).replace(/'/g, "''") + "'").join(',');   // a DB may hold several buildings (disciplines of one set): all of them, never the first only (§5.40)
  const areaExpr = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END';
  const sql = "SELECT m.guid, m.discipline, m.ifc_class, m.storey, MAX(t.bbox_x,t.bbox_y,t.bbox_z), " + areaExpr + ", t.bbox_x*t.bbox_y*t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.building IN (" + blds + ") AND t.bbox_x IS NOT NULL AND t.bbox_x>0";
  const res = db.exec(sql);
  return (res.length ? res[0].values : []).map(r => ({ guid: r[0], disc: r[1], cls: r[2], storey: r[3], len: r[4] || 0, area: r[5] || 0, vol: r[6] || 0 }));
}

// compute5D(db, building, schedule?) — rows {disc, cls, storey, count, length_m, area_m2, vol_m3, guids}. With a schedule the
// group key also carries the element's 4D task (R1 spec: a row never spans two tasks); an element in no task keeps taskId null.
function compute5D(db, building, schedule) {
  const g2t = {};
  if (schedule && schedule.tasks) schedule.tasks.forEach(t => (t.guids || []).forEach(g => { g2t[g] = t.id; }));
  const groups = {}, order = [];
  elementQty(db, building).forEach(e => {
    const tid = schedule ? (g2t[e.guid] || null) : null;
    const k = e.disc + '|' + e.cls + '|' + e.storey + '|' + tid;
    let g = groups[k];
    if (!g) { g = groups[k] = { disc: e.disc, cls: e.cls, storey: e.storey, taskId: tid, count: 0, length_m: 0, area_m2: 0, vol_m3: 0, guids: [] }; order.push(k); }
    g.count++; g.length_m += e.len; g.area_m2 += e.area; g.vol_m3 += e.vol; g.guids.push(e.guid);
  });
  return order.map(k => { const g = groups[k]; ['length_m', 'area_m2', 'vol_m3'].forEach(f => { g[f] = Math.round(g[f] * 1000) / 1000; }); return g; });
}

function apply5DRates(rows, RATES) {
  return rows.map(r => {
    const rt = RATES[r.cls]; let unit = rt ? rt.unit : 'EA'; const rate = rt ? rt.rate : 0; let qty;
    if (unit === 'M') qty = r.length_m; else if (unit === 'M2') qty = r.area_m2; else if (unit === 'M3') qty = r.vol_m3; else { unit = rt ? unit : 'EA'; qty = r.count; }
    return { disc: r.disc, cls: r.cls, storey: r.storey, count: r.count, unit, qty, rate, cost: Math.round(rate * qty), guids: r.guids };
  });
}

// schedule4D(bld, start) — the 4D owner's programme for a building, as the fold's opts.schedule. null when no run can be had
// (the fold then writes NO dates and notes NO_4D_SCHEDULE). start = the project's own start date (the fold's clock).
function schedule4D(bld, start) {
  const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
  const r = CACHE.read(bld);
  const run = r && (r.run || r), key = r && r.dir ? path.basename(r.dir) : '?';
  if (!run || !run.tasks || !run.tasks.length) { console.log('§FOLD_INPUT_4D bld=' + bld + ' tasks=0 → no schedule'); return null; }
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', '4D_template.json'), 'utf8'));
  const phaseSeq = {}; (T.phases || []).forEach(p => { phaseSeq[p.name] = p.sequence; });
  const tasks = run.tasks.map(t => ({ id: t.id, phase: t.phase, storey: t.storey, sDays: t.sDays, eDays: t.eDays, guids: t.guids }));
  console.log('§FOLD_INPUT_4D bld=' + bld + ' run=' + key + ' dbFile=' + (run.dbFile || '?') + ' tasks=' + tasks.length +
    ' lastDay=' + Math.max.apply(null, tasks.map(t => t.eDays)) + ' start=' + start);
  return { start: String(start).slice(0, 10), tasks, phaseSeq, source: 'cache_4d_run ' + key };
}


// coverageAudit(db, buildings, {log}) — §5.40 verb `bim.coverage_audit`: every element WITHOUT a usable box is accounted for, never dropped silently.
//   AGGREGATE_PRICED_VIA_PARTS: no box of its own, but a child (rel_aggregates / element_parts) that has one: the parts are priced as their own classes, a parent box would double-count.
//   NO_GEOMETRY: no transform and no part with a box.   ZERO_DIM: a box with a zero side.   opts.ignoreParts (witness break switch): aggregates are counted as NO_GEOMETRY.
function coverageAudit(db, buildings, opts) {
  opts = opts || {}; const lg = opts.log || console.log, blds = [].concat(buildings).map(b => "'" + String(b).replace(/'/g, "''") + "'").join(',');
  const has = t => db.exec("SELECT 1 FROM sqlite_master WHERE name='" + t + "'").length > 0;
  const kids = [];
  if (!opts.ignoreParts && has('rel_aggregates')) kids.push('EXISTS (SELECT 1 FROM rel_aggregates r JOIN element_transforms c ON c.guid=r.child_guid AND c.bbox_x>0 WHERE r.parent_guid=m.guid)');
  if (!opts.ignoreParts && has('element_parts')) kids.push('EXISTS (SELECT 1 FROM element_parts p JOIN element_transforms c ON c.guid=p.child_guid AND c.bbox_x>0 WHERE p.parent_guid=m.guid)');
  const parts = kids.length ? '(' + kids.join(' OR ') + ')' : '0';
  const sql = "SELECT m.building, m.ifc_class, CASE WHEN t.guid IS NULL THEN CASE WHEN " + parts + " THEN 'AGGREGATE_PRICED_VIA_PARTS' ELSE 'NO_GEOMETRY' END WHEN COALESCE(t.bbox_x,0)<=0 OR COALESCE(t.bbox_y,0)<=0 OR COALESCE(t.bbox_z,0)<=0 THEN 'ZERO_DIM' ELSE NULL END AS cls, COUNT(*) " +
    "FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.building IN (" + blds + ") GROUP BY 1,2,3 HAVING cls IS NOT NULL ORDER BY 1,2,3";
  const res = db.exec(sql), rows = res.length ? res[0].values : [], totals = { AGGREGATE_PRICED_VIA_PARTS: 0, NO_GEOMETRY: 0, ZERO_DIM: 0 };
  rows.forEach(r => { totals[r[2]] += r[3]; lg('§COVERAGE building=' + r[0] + ' ifc_class=' + r[1] + ' class=' + r[2] + ' n=' + r[3]); });
  const total = rows.reduce((a, r) => a + r[3], 0), unclassified = 0;
  lg('§COVERAGE_VERDICT unclassified=' + unclassified + ' total_unpriced=' + total + ' ' + JSON.stringify(totals));
  return { rows, totals, total, unclassified };
}

module.exports = { elementQty, compute5D, apply5DRates, schedule4D, coverageAudit };
