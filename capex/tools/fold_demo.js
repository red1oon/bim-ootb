// capex/tools/fold_demo.js — fold a Viewer building DB into a TEMP COPY of erp/ad_seed.db with viewer/proj_fold.js (node path),
// so the CAPEX dashboard has a real BIM-folded project to read. Writes ONLY the output path given; never commits a .db (NO-LFS).
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/fold_demo.js <building.db> <out.db> [packFile=pwd2024_bd.json] [packISO=BDT]
// Mirrors tests/poc_proj_push.js (compute5D/apply5DRates are copied verbatim from it — one rating path, the Viewer's own).
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..');
const ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
function compute5D(db, building) {
  const bld = String(building).replace(/'/g, "''");
  const areaExpr = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END';
  const sql = "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) cnt, ROUND(SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)),3) length_m, ROUND(SUM(" + areaExpr + "),3) area_m2, ROUND(SUM(t.bbox_x*t.bbox_y*t.bbox_z),3) vol_m3 FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.building='" + bld + "' AND t.bbox_x IS NOT NULL AND t.bbox_x>0 GROUP BY m.discipline, m.ifc_class, m.storey";
  const res = db.exec(sql);
  return (res.length ? res[0].values : []).map(r => ({ disc: r[0], cls: r[1], storey: r[2], count: r[3] || 0, length_m: r[4] || 0, area_m2: r[5] || 0, vol_m3: r[6] || 0 }));
}
function apply5DRates(rows, RATES) {
  return rows.map(r => {
    const rt = RATES[r.cls]; let unit = rt ? rt.unit : 'EA'; const rate = rt ? rt.rate : 0; let qty;
    if (unit === 'M') qty = r.length_m; else if (unit === 'M2') qty = r.area_m2; else if (unit === 'M3') qty = r.vol_m3; else { unit = rt ? unit : 'EA'; qty = r.count; }
    return { disc: r.disc, cls: r.cls, storey: r.storey, count: r.count, unit, qty, rate, cost: Math.round(rate * qty) };
  });
}
(async () => {
  const [bldPath, outPath, packFile = 'pwd2024_bd.json', iso = 'BDT'] = process.argv.slice(2);
  if (!bldPath || !outPath) { console.error('usage: fold_demo.js <building.db> <out.db> [pack] [ISO]'); process.exit(2); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(bldPath));
  const edb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', packFile), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
  const hier = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'ifc_schema_hierarchy.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const golden = priced.reduce((a, r) => a + r.cost, 0);
  const cnt = () => ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'M_Product'].map(t => t + '=' + edb.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0]).join(' ');
  console.log('§FOLD_DEMO before ' + cnt());
  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, hierarchy: hier.hierarchy || hier, packCurrencyISO: iso, now: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  console.log('§FOLD_DEMO building=' + building + ' pack=' + packFile + ' cur=' + iso + ' priced_rows=' + priced.length + ' golden_5D=' + golden);
  console.log('§FOLD_DEMO created ' + JSON.stringify(r.created) + ' projectId=' + r.projectId + ' orderId=' + (r.orderId || '-'));
  (r.notes || []).forEach(n => console.log('§FOLD_DEMO_NOTE ' + n));
  console.log('§FOLD_DEMO after ' + cnt());
  fs.writeFileSync(outPath, Buffer.from(edb.export()));
  console.log('§FOLD_DEMO wrote ' + outPath);
})().catch(e => { console.error(e); process.exit(1); });
