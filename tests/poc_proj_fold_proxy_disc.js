// ⚠ DO NOT REMOVE — read tests/poc_proj_fold_proxy_disc.log after every run; exit code is not evidence.
// Scope: NODE witness (no browser) for §PROXY_BY_DISC (prompts/BIM_PROJECT_FINANCE_LANE.md): proj_fold.js folds the generic
//   IfcBuildingElementProxy ONE LINE PER DISCIPLINE; civil prices come from rates.js CIVIL_RATES (null → price 0 + "rate not set").
// Proves:  W-PBD-1 civil: 5 lines, qty == SQL count per discipline, sum == selected, price == CIVIL_RATES owner (null→0), none at proxy-class rate
//          W-PBD-2 RED control: origin/main proj_fold.js on the SAME rows gives 1 lumped line (so the check can fail)
//          W-PBD-3 fleet (SampleHouse, Hospital): old vs new fold — line set/amount/qty diff reported; non-proxy lines IDENTICAL
//          W-PBD-4 INCONCLUSIVE (exit 2) when a DB is absent / selection empty — never PASS on nothing judged.
// Run: node tests/poc_proj_fold_proxy_disc.js   (CIVIL_DB / SH_DB / HOSP_DB env override)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), os = require('os');
const R = path.join(__dirname, '..');
const initSqlJs = require(os.homedir() + '/bim-compiler/node_modules/sql.js');
const Better = require(process.env.BSQ || (os.homedir() + '/bim-compiler/node_modules/better-sqlite3'));
const log = []; let fails = 0, judged = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { judged++; if (!ok) fails++; S('   ' + (ok ? 'OK  ' : 'FAIL') + ' ' + l + (d ? ' — ' + d : '')); };
// rates.js → globals (RATES, CIVIL_RATES, SEQUENCE_RULES, LABOR_RATES), exactly the file the viewer ships
const ctx = vm.createContext({ console: { log() {}, warn() {} }, window: {}, fetch: () => Promise.reject(new Error('no')) });
vm.runInContext(fs.readFileSync(R + '/viewer/rates.js', 'utf8') + '\n;this.__R={RATES,CIVIL_RATES,SEQUENCE_RULES,LABOR_RATES};', ctx);
const { RATES, CIVIL_RATES, SEQUENCE_RULES, LABOR_RATES } = ctx.__R;
const load = f => { const m = { exports: {} }; new Function('module', 'require', 'self', fs.readFileSync(f, 'utf8'))(m, p => require(path.resolve(path.dirname(f), p)), undefined); return m.exports; };
const oldSrc = cp.execSync('git show origin/main:viewer/proj_fold.js', { cwd: R, maxBuffer: 1e8 }).toString();
fs.writeFileSync(R + '/viewer/.proj_fold_main.tmp.js', oldSrc);
const NEW = load(R + '/viewer/proj_fold.js'), OLD = load(R + '/viewer/.proj_fold_main.tmp.js');
fs.unlinkSync(R + '/viewer/.proj_fold_main.tmp.js');
const AREA = "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END";
// priced rows = the shape nf_highlight_cost.js _selectionPriced hands the fold (same SQL, same unit/qty rule, same CIVIL_RATES branch)
function priced(file, where) {
  const b = new Better(file, { readonly: true });
  const rows = b.prepare("SELECT m.discipline d, m.ifc_class c, m.storey s, COUNT(*) n, SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)) len, SUM(" + AREA + ") area, SUM(t.bbox_x*t.bbox_y*t.bbox_z) vol " +
    "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 " + (where || '') + " GROUP BY m.discipline,m.ifc_class,m.storey").all();
  const counts = {}; b.prepare("SELECT discipline d, COUNT(*) n FROM elements_meta " + (where ? 'WHERE 1=1 ' + where.replace(/m\./g, '') : '') + " GROUP BY discipline").all().forEach(r => counts[r.d] = r.n);
  b.close();
  return { counts, rows: rows.map(a => {
    const rt = RATES[a.c]; let unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0, qty, unp = false;
    const cr = (a.d && a.d.charAt(0) !== '_') ? CIVIL_RATES[a.d] : null;
    if (cr) { unit = cr.qtyBasis || 'EA'; rate = cr.rate != null ? cr.rate : 0; unp = cr.rate == null; qty = a.n; }
    else if (unit === 'M') qty = a.len; else if (unit === 'M2') qty = a.area; else if (unit === 'M3') qty = a.vol; else { unit = rt ? unit : 'EA'; qty = a.n; }
    const o = { disc: a.d || '_', cls: a.c || '_', storey: a.s || '_', count: a.n, unit, qty, rate, cost: Math.round(rate * qty) }; if (unp) o.unpriced = true; return o; }) };
}
async function fold(SQL, Fold, rows, name) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(R + '/erp/ad_seed.db')));
  const r = Fold.foldProjectOrder(db, name, rows, { seqRules: SEQUENCE_RULES, laborRates: LABOR_RATES, packCurrencyISO: 'USD', now: '2026-01-01 00:00:00' });
  const q = db.exec("SELECT p.name, l.description, l.plannedqty, l.plannedprice, l.plannedamt FROM c_projectline l LEFT JOIN m_product p ON p.m_product_id=l.m_product_id WHERE l.c_project_id=" + r.projectId + " ORDER BY p.name");
  return { lines: q.length ? q[0].values : [], amt: r.plannedAmt, qty: r.plannedQty };
}
(async () => {
  const SQL = await initSqlJs();
  const dl = process.env.HOME + '/Downloads/JALAN JELAPANG IFC/CivilWorks.db';
  const civ = process.env.CIVIL_DB || [R + '/viewer/buildings/CivilWorks.db', dl].find(fs.existsSync);
  const sh = process.env.SH_DB || [R + '/viewer/buildings/SampleHouse_extracted.db', os.homedir() + '/bim-ootb/modeller/SampleHouse_extracted.db'].find(fs.existsSync);
  const ho = process.env.HOSP_DB || [R + '/viewer/buildings/Hospital_extracted.db', os.homedir() + '/bim-ootb/viewer/buildings/Hospital_extracted.db'].find(fs.existsSync);
  S('§W-PROJ-FOLD-PROXY-DISC  civil=' + civ + '  SH=' + sh + '  Hosp=' + ho);
  if (civ) {
    const D = ['ROAD', 'LIGHTING', 'DRAINAGE', 'SIGNAGE', 'MARKING'];
    const p = priced(civ, "AND m.discipline IN ('" + D.join("','") + "')");
    const tot = D.reduce((a, d) => a + (p.counts[d] || 0), 0);
    S('   §SQL_COUNTS ' + JSON.stringify(p.counts) + ' total=' + tot + '  | building proxy-class rate (must NOT appear)=' + RATES.IfcBuildingElementProxy.rate);
    const n = await fold(SQL, NEW, p.rows, 'CivilWorks');
    // control input = what origin/main's pricing handed the fold: every civil row at the building proxy-class rate (the borrowed price)
    const oldRows = p.rows.map(r => Object.assign({}, r, { rate: RATES[r.cls].rate, unit: RATES[r.cls].unit, cost: Math.round(RATES[r.cls].rate * r.qty) }));
    const o = await fold(SQL, OLD, oldRows, 'CivilWorks');
    n.lines.forEach(l => S('   §NEW_LINE "' + l[0] + '" desc="' + l[1] + '" qty=' + l[2] + ' price=' + l[3] + ' amt=' + l[4]));
    o.lines.forEach(l => S('   §OLD_LINE(origin/main) "' + l[0] + '" desc="' + l[1] + '" qty=' + l[2] + ' price=' + l[3] + ' amt=' + l[4]));
    V(tot > 0 && n.lines.length === D.filter(d => p.counts[d]).length, 'W-PBD-1 one line per discipline', n.lines.length + ' lines');
    D.forEach(d => { const l = n.lines.find(x => x[0] === d[0] + d.slice(1).toLowerCase() + ' (BIM)'), e = CIVIL_RATES[d].rate;
      V(!!l && +l[2] === p.counts[d] && +l[3] === (e == null ? 0 : e) && (e != null || /rate not set/.test(l[1])), '  ' + d + ' qty==SQL count, price==CIVIL_RATES owner, null→"rate not set"', l ? l[2] + '/' + p.counts[d] + ' price=' + l[3] : 'missing'); });
    V(n.lines.reduce((a, l) => a + +l[2], 0) === tot, '  sum qty == selected elements', String(tot));
    V(!n.lines.some(l => +l[3] === RATES.IfcBuildingElementProxy.rate), '  no line at the building proxy-class rate');
    V(o.lines.length === 1 && +o.lines[0][3] === RATES.IfcBuildingElementProxy.rate, 'W-PBD-2 RED control: origin/main fold = 1 lumped line at the borrowed building rate', o.lines.length + ' line(s) price=' + (o.lines[0] && o.lines[0][3]));
  } else S('   civil DB absent');
  for (const [nm, f] of [['SampleHouse', sh], ['Hospital', ho]]) {
    if (!f) { S('   ' + nm + ' DB absent → skipped'); continue; }
    const p = priced(f), n = await fold(SQL, NEW, p.rows, nm), o = await fold(SQL, OLD, p.rows, nm);
    const prox = p.rows.filter(r => r.cls === 'IfcBuildingElementProxy');
    S('   §FLEET ' + nm + ' rows=' + p.rows.length + ' proxy-rows=' + prox.length + ' (' + [...new Set(prox.map(r => r.disc))].join(',') + ') OLD lines=' + o.lines.length + ' amt=' + o.amt + ' qty=' + o.qty + ' | NEW lines=' + n.lines.length + ' amt=' + n.amt + ' qty=' + n.qty);
    const keyOld = new Set(o.lines.map(l => l[0] + '|' + l[2] + '|' + l[3] + '|' + l[4]));
    const changed = n.lines.filter(l => !keyOld.has(l[0].replace(' (BIM)', '') + '|' + l[2] + '|' + l[3] + '|' + l[4]));
    if (!prox.length) V(JSON.stringify(n.lines.map(l => [l[2], l[3], l[4]])) === JSON.stringify(o.lines.map(l => [l[2], l[3], l[4]])) && n.amt === o.amt && n.qty === o.qty, 'W-PBD-3 ' + nm + ': no proxies → lines/qty/price/amt IDENTICAL before/after');
    else { V(n.amt === o.amt && n.qty === o.qty, 'W-PBD-3 ' + nm + ': proxies split by discipline; planned amount & qty unchanged', 'amt ' + o.amt + '→' + n.amt + ' qty ' + o.qty + '→' + n.qty);
      S('   §FLEET_CHANGED ' + nm + ' non-proxy lines identical: ' + (changed.filter(l => !/ \(BIM\)$/.test(l[0]) || true).length) + ' new-keyed lines; proxy line OLD=' + o.lines.filter(l => /^IfcBuildingElementProxy/.test(l[0])).map(l => l[2] + '@' + l[3]).join(',') + ' NEW=' + n.lines.filter(l => /Proxy|\(BIM\)/.test(l[0]) && prox.some(r => l[0].toLowerCase().startsWith(r.disc.toLowerCase()))).map(l => l[0] + ' ' + l[2] + '@' + l[3]).join(', ')); }
  }
  const inc = !judged;
  S('\n§W-PROJ-FOLD-PROXY-DISC ' + (inc ? 'INCONCLUSIVE (nothing judged)' : fails ? 'FAIL (fails=' + fails + ')' : 'PASS'));
  fs.writeFileSync(__dirname + '/poc_proj_fold_proxy_disc.log', log.join('\n'));
  process.exit(inc ? 2 : fails ? 1 : 0);
})();
