// capex/tools/fold_demo.js — fold a Viewer building DB into a TEMP COPY of erp/ad_seed.db with viewer/proj_fold.js (node path),
// so the CAPEX dashboard has a real BIM-folded project to read. Writes ONLY the output path given; never commits a .db (NO-LFS).
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/fold_demo.js <building.db> <out.db> [packFile=pwd2024_bd.json] [packISO=BDT]
// Inputs from capex/tools/fold_inputs.js: 5D quantities + the 4D owner's programme (prompts/CAPEX_DASHBOARD.md §5.1 R1) — the fold computes no schedule.
// Optional 5th arg / env START=YYYY-MM-DD = the project start (default: today, local). No 4D run for the building → phases without dates (NO_4D_SCHEDULE).
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..');
const ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
const PS = require(path.join(ROOT, 'viewer', 'proj_order_state.js'));
const FI = require(path.join(ROOT, 'capex', 'tools', 'fold_inputs.js'));   // ONE input producer (5D quantities + the 4D owner's programme)
(async () => {
  const [bldPath, outPath, packFile = 'pwd2024_bd.json', iso = 'BDT', startArg] = process.argv.slice(2);
  if (!bldPath || !outPath) { console.error('usage: fold_demo.js <building.db> <out.db> [pack] [ISO]'); process.exit(2); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(bldPath));
  // the ONE store opener (viewer/proj_order_state.js: seed + self-heal patch + the ERP's boot overlays, §5.25 D1). INTO=1 folds into the existing output, as the viewer's OPFS store accumulates.
  const edb = process.env.INTO === '1' && fs.existsSync(outPath) ? new SQL.Database(fs.readFileSync(outPath)) : (await PS.openStore(SQL, () => Promise.resolve(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'))))).db;
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', packFile), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
  const hier = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'ifc_schema_hierarchy.json'), 'utf8'));
  const d = new Date(), start = startArg || process.env.START || (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  const bldName = path.basename(bldPath).replace(/_(extracted|meta)\.db$/, '').replace(/\.db$/, '');
  const sched = FI.schedule4D(bldName, start);
  const priced = FI.apply5DRates(FI.compute5D(bdb, building, sched), pack.materials || {});
  const golden = priced.reduce((a, r) => a + r.cost, 0);
  const cnt = () => ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'M_Product'].map(t => t + '=' + edb.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0]).join(' ');
  console.log('§FOLD_DEMO before ' + cnt());
  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, hierarchy: hier.hierarchy || hier, packCurrencyISO: iso, schedule: sched, now: start + ' 00:00:00' });   // now = the fold's default (server-local time, like legacy)
  console.log('§FOLD_DEMO building=' + building + ' pack=' + packFile + ' cur=' + iso + ' priced_rows=' + priced.length + ' golden_5D=' + golden);
  console.log('§FOLD_DEMO created ' + JSON.stringify(r.created) + ' projectId=' + r.projectId + ' orderId=' + (r.orderId || '-'));
  (r.notes || []).forEach(n => console.log('§FOLD_DEMO_NOTE ' + n));
  (r.seqLog || []).forEach(p => console.log('§FOLD_DEMO_PHASE ' + p.phase + ' seq=' + p.seqno + ' ' + p.start + ' → ' + p.end));
  console.log('§FOLD_DEMO after ' + cnt());
  fs.writeFileSync(outPath, Buffer.from(edb.export()));
  console.log('§FOLD_DEMO wrote ' + outPath);
})().catch(e => { console.error(e); process.exit(1); });
