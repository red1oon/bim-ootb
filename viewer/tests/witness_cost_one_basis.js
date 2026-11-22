// ⚠ DO NOT REMOVE — W-COST-ONE-BASIS (spec: prompts/CAPEX_DASHBOARD.md §COST-ONE-BASIS, owner 2026-11-22: "the cost of a model is rate x quantity in the rate's own unit"). READ THE LOG (the page console is
//   written to LOG); an exit code is not evidence.
//   ISSUE: the Viewer showed TWO costs for ONE model: Ask "total cost" priced rate x element COUNT (Shed USD 96,839), the Find bar and the > ERP push priced rate x quantity in the rate's unit (USD 355,097.98).
//   Per model (Shed = the UAT model, and a second model) it drives the REAL Viewer (headless, software GL): Ctrl+O -> the .db, key F, the Ask chip "total cost", the whole model selected in the Find bar, > ERP.
//   C1 the three amounts are one number: Ask exact == the Find bar's whole-model exact == the push's plannedAmt, to the cent (BigDecimal compare of the §-logged decimals; no rounding in the compare)
//   C2 the three DISPLAYED figures agree: Ask text figure == bar text figure (both at the order currency's precision)
//   C3 the per-class rows agree: Ask's §ASK_COST_ROW lines == the pushed Project Order's lines (M_Product.Value, PlannedQty, PlannedAmt), line for line
//   C4 an independent oracle (this file: the pack JSON's rate x unit quantity re-derived from the db with sql.js, BigDecimal) == Ask exact
//   C5 the grid-drag Cost panel's total Δ Cost (bay 2 vs bay 1) == the oracle's priced difference of the two bays (it carried its own per-m3 rate table, not the pack's)
//   INCONCLUSIVE (never PASS) when nothing was priced, the db is missing, or a step produced no reading.   Break switch: COST_ONE_BASIS_BREAK=count swaps the page's A.costBasis for the old
//   getRate x COUNT before Ask is asked: C1 C3 C4 must FAIL.   VIEWER_ROOT=<tree> serves another checkout (the RED run: a tree from before the fix; Ask then has no exact, its text figure is compared).
// Run: SHED_DB=<copy of SHED_extracted.db> [SECOND_DB=<Duplex_extracted.db>] LOG=<file> node viewer/tests/witness_cost_one_basis.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), SERVE = process.env.VIEWER_ROOT || ROOT;
const { kit } = require(path.join(ROOT, 'common', 'door', 'tests', '_kit.js'));
const k = kit('W-COST-ONE-BASIS');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const SQLJS = process.env.SQLJS || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'sql.js');
const BREAK = process.env.COST_ONE_BASIS_BREAK || '';
const LOGF = process.env.LOG || path.join(os.tmpdir(), 'witness_cost_one_basis.log');
const MODELS = [{ name: 'Shed', db: process.env.SHED_DB }, { name: 'Second', db: process.env.SECOND_DB || path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db') }];
const BD = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const out = fs.createWriteStream(LOGF); const T0 = Date.now();
const L = m => { const s = '[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m; out.write(s + '\n'); };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(SERVE, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const lineQty = q => Math.round(q * 1000) / 1000;                       // the order's line rule (proj_fold.js lineQty), restated here
const dec = s => String(s).replace(/,/g, '');
const same = (a, b) => a != null && b != null && BD.of(dec(a)).compareTo(BD.of(dec(b))) === 0;

// ── C4 oracle: pack rate x the unit's quantity, straight from the db file, per class line; no Viewer code involved
async function oracle(dbPath, packName, box) {
  const initSqlJs = require(SQLJS), SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', packName + '.json'), 'utf8')), M = pack.materials || {};
  let prov = 0; try { const r = db.exec("SELECT COUNT(*) FROM element_pset_common WHERE pset='BIMOOTB_Walk' AND name='Provisional' AND value='TRUE'"); prov = r.length ? +r[0].values[0][0] : 0; } catch (e) { prov = 0; }
  if (prov) return { inconclusive: 'db carries ' + prov + ' provisional rows (the oracle does not model that leave-out)' };
  const area = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END';
  const r = db.exec("SELECT m.ifc_class, m.discipline, COUNT(*), SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)), SUM(" + area + "), SUM(t.bbox_x*t.bbox_y*t.bbox_z) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0" + (box ? " AND t.center_x BETWEEN ? AND ? AND t.center_y BETWEEN ? AND ?" : "") + " GROUP BY 1,2", box || []);
  const lines = {}; let total = BD.ZERO, elements = 0;
  (r.length ? r[0].values : []).forEach(([cls, disc, cnt, len, ar, vol]) => {
    const rt = M[cls], rate = rt ? rt.rate : 0, unit = rt ? rt.unit : 'EA';
    const q = unit === 'M' ? len : unit === 'M2' ? ar : unit === 'M3' ? vol : cnt;
    const key = (cls === 'IfcBuildingElementProxy' && disc && disc.charAt(0) !== '_') ? cls + ':' + disc : cls;
    const l = lines[key] || (lines[key] = { rate, q: 0 }); l.q += q || 0; elements += cnt;
  });
  Object.keys(lines).forEach(key => { const l = lines[key]; l.qty = lineQty(l.q); l.amount = BD.of(String(l.rate)).multiply(BD.of(String(l.qty))); total = total.add(l.amount); });
  const bounds = db.exec('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y) FROM element_transforms WHERE bbox_x IS NOT NULL AND bbox_x>0')[0].values[0];
  return { total: total.toString(), lines, elements, currency: (pack.meta || {}).currency, bounds };
}

async function one(chromium, M) {
  const tag = M.name;
  if (!M.db || !fs.existsSync(M.db)) { k.incon(tag, 'db missing: ' + M.db); return; }
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
  const logs = []; page.on('console', m => { const t = m.text(); logs.push(t); L('[' + tag + '] ' + t); }); page.on('pageerror', e => L('[' + tag + '] [pageerror] ' + e));
  const sleep = ms => page.waitForTimeout(ms);
  const until = async (fn, ms, arg) => { for (let i = 0; i < ms / 250; i++) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await sleep(250); } return null; };
  const find = re => { for (let i = logs.length - 1; i >= 0; i--) { const m = re.exec(logs[i]); if (m) return m; } return null; };
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load' });
    await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await sleep(2000);
    await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
    await page.mouse.click(900, 640); await sleep(300);
    const fc = page.waitForEvent('filechooser', { timeout: 20000 }); await page.keyboard.press('Control+o'); (await fc).setFiles(M.db);
    let st = ''; for (let i = 0; i < 720 && !/DONE/.test(st); i++) { st = await page.evaluate(() => (window.APP && APP.status ? APP.status.textContent : '') || ''); if (!/DONE/.test(st)) await sleep(500); }
    L('[' + tag + '] opened: ' + st.slice(0, 120));
    await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('f');
    await until(() => { const p = document.getElementById('find-panel'); return !!(p && p.getBoundingClientRect().width > 0); }, 15000); await sleep(1500);
    const env = await page.evaluate(() => ({ pack: window.RATE_TEMPLATE_NAME, cur: window._TRL && _TRL.cur, n: APP.dbQuery('SELECT count(*) FROM elements_meta')[0][0], bld: APP.activeBuilding }));
    L('[' + tag + '] env ' + JSON.stringify(env));
    if (BREAK === 'count') await page.evaluate(() => {   // the OLD Ask basis, injected: getRate x element COUNT per class (nlp.js calcCost before the fix)
      APP.costBasis = function (set) { const g = Array.from(set), by = {}; for (let i = 0; i < g.length; i += 900) { const c = g.slice(i, i + 900); APP.dbQuery('SELECT ifc_class, COUNT(*) FROM elements_meta WHERE guid IN (' + c.map(() => '?').join(',') + ') GROUP BY 1', c).forEach(r => { by[r[0]] = (by[r[0]] || 0) + r[1]; }); }
        let t = 0; const detail = Object.keys(by).map(cl => { const a = getRate(cl) * by[cl]; t += a; return { cls: cl, unit: 'EA', rate: getRate(cl), qty: by[cl], amount: String(a) }; }); return { exact: String(t), elements: g.length, lines: detail.length, tasks: 0, detail, unpriced: {}, cur: window._TRL.cur, pack: window.RATE_TEMPLATE_NAME, ms: 0 }; };
    });

    // ── Ask: the chip "total cost"
    await page.locator('#find-panel button', { hasText: /^total cost$/ }).first().click();
    const askText = await until(() => { const t = document.getElementById('nlp-toast'); return t && /total building cost/.test(t.textContent) ? t.querySelector('div').textContent.trim() : null; }, 60000);
    await sleep(500);
    const askExactLog = find(/§ASK_COST scope="total building cost".* exact=(\S+)/), askRows = [];
    logs.forEach(t => { const m = /§ASK_COST_ROW cls=(\S+) unit=(\S+) rate=(\S+) qty=(\S+) amount=(\S+)/.exec(t); if (m) askRows.push({ cls: m[1], unit: m[2], rate: m[3], qty: m[4], amount: m[5] }); });
    const askFig = askText ? (/^[A-Z]{2,4}\s+(-?[\d,]+(?:\.\d+)?)/.exec(askText) || [])[1] : null;
    L('[' + tag + '] ASK text="' + askText + '" exactLog=' + (askExactLog && askExactLog[1]) + ' rows=' + askRows.length);

    // ── the whole model in the Find bar (the bar's own _updateSelCost path), then its push
    await page.evaluate(() => {
      const g = APP.dbQuery('SELECT guid FROM elements_meta' + (APP.activeBuilding ? " WHERE building='" + APP.activeBuilding.replace(/'/g, "''") + "'" : '')).map(r => r[0]);
      window.__capLines = null; const PF = window.ProjFold, orig = PF.foldProjectOrder;
      PF.foldProjectOrder = function (db, bld, rows, opts) { const r = orig.apply(this, arguments);
        try { const q = db.exec("SELECT p.Value, l.plannedqty, l.plannedamt FROM C_ProjectLine l JOIN M_Product p ON p.m_product_id=l.m_product_id WHERE l.c_project_id=?", [r.projectId]); window.__capLines = q.length ? q[0].values : []; } catch (e) { window.__capLines = 'ERR ' + e.message; }
        return r; };
      APP.applyFindScope(g.join(','));   // the Viewer's own select-these-elements entry (Zoom Across scope): lights them, reveals the bar, prices it
    });
    const barExactM = await (async () => { for (let i = 0; i < 80; i++) { const m = find(/§FIND_COST scope="Zoom Across[^"]*" .*costExact=(\S+)/); if (m) return m; await sleep(250); } return null; })();
    let barText = null; for (let i = 0; i < 60; i++) { barText = await page.evaluate(() => (document.getElementById('find-selected-cost') || {}).textContent || ''); if (/\.\d\d$/.test(barText)) break; await sleep(250); }
    const barFig = barText ? (/^[A-Z]{2,4}\s+(-?[\d,]+(?:\.\d+)?)/.exec(barText) || [])[1] : null;
    L('[' + tag + '] BAR text="' + barText + '" exact=' + (barExactM && barExactM[1]));
    await page.locator('#find-erp-btn').click();
    let pushM = null; for (let i = 0; i < 200 && !pushM; i++) { pushM = find(/§PROJ_PUSH project=.* scope="Zoom Across[^"]*".* plannedAmt=(\S+)/); if (!pushM) await sleep(250); }
    const pushLines = await page.evaluate(() => window.__capLines);
    L('[' + tag + '] PUSH plannedAmt=' + (pushM && pushM[1]) + ' lines=' + (Array.isArray(pushLines) ? pushLines.length : pushLines));
    const orc = await oracle(M.db, env.pack);

    // ── verdicts
    const askExact = askExactLog ? askExactLog[1] : (askFig ? dec(askFig) : null), barExact = barExactM ? barExactM[1] : null, pushAmt = pushM ? pushM[1] : null;
    if (!askExact || !barExact || !pushAmt || !Array.isArray(pushLines)) { k.incon(tag, 'a reading is missing: ask=' + askExact + ' bar=' + barExact + ' push=' + pushAmt + ' lines=' + (Array.isArray(pushLines) ? pushLines.length : pushLines)); return; }
    if (BD.of(barExact).compareTo(BD.ZERO) <= 0 || !pushLines.length) { k.incon(tag, 'VACUOUS: nothing priced (bar=' + barExact + ', push lines=' + pushLines.length + ')'); return; }
    k.L(tag + ' ask=' + askExact + ' bar=' + barExact + ' push=' + pushAmt + ' oracle=' + (orc.total || orc.inconclusive) + ' pack=' + env.pack + ' cur=' + env.cur);
    k.chk(tag + ' C1 Ask total cost == Find whole-model bar == push plannedAmt, to the cent (BigDecimal)', same(askExact, barExact) && same(barExact, pushAmt), 'ask=' + askExact + ' bar=' + barExact + ' push=' + pushAmt);
    k.chk(tag + ' C2 the displayed figures agree: Ask text "' + askFig + '" == bar text "' + barFig + '"', askFig != null && barFig != null && askFig === barFig);
    // C3: Ask rows (non-zero) vs push lines; both keyed by the class key, qty and amount compared exactly
    const pl = {}; pushLines.forEach(([key, q, a]) => { const o = pl[key] || (pl[key] = { qty: BD.ZERO, amount: BD.ZERO }); o.qty = o.qty.add(BD.of(String(q))); o.amount = o.amount.add(BD.of(String(a))); });
    const nzPush = Object.keys(pl).filter(x => BD.of(pl[x].amount.toString()).compareTo(BD.ZERO) !== 0);
    let c3 = askRows.length > 0 && askRows.length === nzPush.length, why = 'ask rows=' + askRows.length + ' push non-zero lines=' + nzPush.length;
    if (c3) askRows.forEach(r => { const p = pl[r.cls]; if (!p || !same(r.amount, p.amount.toString()) || !same(r.qty, p.qty.toString())) { c3 = false; why += ' | differs at ' + r.cls + ' ask(q=' + r.qty + ',a=' + r.amount + ') push(' + (p ? 'q=' + p.qty + ',a=' + p.amount : 'absent') + ')'; } });
    k.chk(tag + ' C3 the per-class rows equal the pushed Project Order\'s lines (qty and amount)', c3, why);
    if (orc.inconclusive) k.incon(tag + ' C4', orc.inconclusive);
    else k.chk(tag + ' C4 independent oracle (pack rate x unit quantity from the db) == Ask total', same(askExact, orc.total), 'oracle=' + orc.total + ' ask=' + askExact);
    // C5: the grid-drag Cost panel: two bays, the second narrower; total Δ Cost cell vs the oracle's priced difference
    if (tag === 'Shed' && !orc.inconclusive) {
      const [x0, x1, y0, y1] = orc.bounds, xm = (x0 + x1) / 2, PAD = 1;
      const b1 = [x0 - PAD, x1 + PAD, y0 - PAD, y1 + PAD], b2 = [x0 - PAD, xm, y0 - PAD, y1 + PAD];
      const o1 = await oracle(M.db, env.pack, b1), o2 = await oracle(M.db, env.pack, b2);
      const grid = b => ({ xLines: [{ position: b[0] }, { position: b[1] }], yLines: [{ position: b[2] }, { position: b[3] }] });
      const cell = await page.evaluate(g => { if (!window.CostPanel) return { err: 'no CostPanel' }; CostPanel.reset(); CostPanel.refresh(APP, g[0]); CostPanel.refresh(APP, g[1]);
        const rows = document.querySelectorAll('#costPanel table tr'), last = rows[rows.length - 1], tds = last ? last.querySelectorAll('td') : []; return { txt: tds.length ? tds[tds.length - 1].textContent : null, n: rows.length }; }, [grid(b1), grid(b2)]);
      const want = Number(o2.total) - Number(o1.total), got = cell.txt == null || cell.txt === '\u2014' || cell.txt === '-' ? null : Number(cell.txt);
      k.L(tag + ' C5 bay1=' + o1.total + ' bay2=' + o2.total + ' wantDelta=' + want.toFixed(2) + ' panelCell=' + JSON.stringify(cell));
      if (cell.err || Math.abs(want) < 1) k.incon(tag + ' C5', cell.err || 'VACUOUS: the two bays price the same (delta ' + want + ')');
      else k.chk(tag + ' C5 the grid Cost panel\'s total Δ Cost == the pack-priced difference of the two bays (oracle)', got != null && Math.abs(got - want) < 1, 'panel=' + got + ' want=' + want.toFixed(2));
    }
  } catch (e) { k.incon(tag, 'driver error: ' + (e && e.message)); L('[' + tag + '] ERROR ' + (e && e.stack)); }
  await browser.close();
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = require(PW);
  k.L('serving ' + SERVE + (BREAK ? ' BREAK=' + BREAK : ''));
  for (const M of MODELS) await one(chromium, M);
  server.close(); out.end(); k.end();
})().catch(e => { console.log('§W-COST-ONE-BASIS ERROR ' + (e && e.stack || e)); process.exit(2); });
