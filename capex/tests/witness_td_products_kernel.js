#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PRODUCTS-KERNEL (bim-ootb prompts/CAPEX_DASHBOARD.md §INTERNAL-UAT IU2; bim-compiler prompts/SQLiteIDEMPIERE.md §UAT-LEDGER row 12; TWIN CARDINAL RULE: the Kernel does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §TDPK line, the exit code is not the evidence. INCONCLUSIVE (never PASS) when nothing was judged or a population is empty.
// THE ISSUE: legacy gets the 10 PWD test products, their Standard M_Cost rows, the category's Standard method and the primary schema's Standard method from a PostgreSQL script
//   (capex/plugin/testdata_2pack/202611141500_CAPEX-TD-CONSTRUCTION-PRODUCTS.sql, written by capex/tools/td_products_sql.js). The Kernel had no route, so the UAT guide's chapter C could not be run on it with legacy's
//   figures. The SAME generator now also writes a Kernel 2Pack zip (<ts>_CAPEX-TD-CONSTRUCTION-PRODUCTS_kernel.zip) that the Kernel's generic Pack In applies (erp/pipo_packin.js, through the model layer).
// Expected values come from viewer/rates/pwd2024_bd.json by plain arithmetic HERE (rate / exchange_rate), never from the generator or the zip.
//   Z the zip exists · P0 population (none of the products exist before) · P1 10 products PWD-<item>, right unit · P2 price on the Purchase 2003 version == rate / fx · P3 ONE M_Cost (Material, Standard) per product == rate / fx
//   C category Construction + its schema row Standard, primary schema Standard · R a second Pack In adds 0 rows (all Same) · I1 an issue of qty 3 to a Work Order project books 3 x the cost
//   I2 the same with the product's category forced to Average PO: still Standard (the schema decides, MProjectIssue.java:577, IU3) · D drift: the zip's numbers == the PostgreSQL script's numbers
// Break switch TDPK_BREAK=rate: the generator is run on a COPY of the rate file with one rate changed; the checks (expected from the ORIGINAL file) must FAIL.
// Pack In needs DOMParser, so it runs in the real Kernel page (headless, as W-TD-PACK-TWIN); the database after it is exported to Node, where the issue path runs on the Kernel's own model layer (as IU3).
// Command: node capex/tests/witness_td_products_kernel.js > <log>        (PW=<playwright module> SQLJS_DIR=<sql.js dir> override the defaults)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.TDPK_BREAK || '';
const PWDIR = path.join(REPO, 'capex/plugin/testdata_2pack');
const RATES = path.join(REPO, 'viewer/rates/pwd2024_bd.json');
const SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const initSqlJs = require(SQLJS_DIR);
let judged = 0, fails = 0, inc = 0;
const LOG = console.log.bind(console), say = s => LOG(s), SEEN = new Set();   // the model layer's chatter is muted during the issue path; say() keeps the real log
const J = x => JSON.stringify(x);
const check = (id, claim, ok, info) => { judged++; SEEN.add(id); if (!ok) fails++; say('§TDPK ' + id + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + claim + (ok ? '' : ' got=' + J(info).slice(0, 1500))); };
const inconclusive = (id, why) => { inc++; say('§TDPK ' + id + ' INCONCLUSIVE ' + why); };
const near = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= (tol == null ? 1e-6 : tol);

// ── the expected values, from the rate file by plain arithmetic ──────────────────────────────────────────────────────────
const rate = JSON.parse(fs.readFileSync(RATES, 'utf8')), FX = rate.meta.exchange_rate;
const want = new Map();   // item -> { value, unit, rate, cost }
[].concat(...Object.values(rate.material_rates), ...Object.values(rate.material_adds)).forEach(r => { if (!want.has(r.source.item)) want.set(r.source.item, { value: 'PWD-' + r.source.item, unit: r.unit, rate: r.rate }); });
const UNIT_SYMBOL = { M3: 'M3', M2: 'M2', KG: 'Kg' };   // C_UOM.X12DE355 of the unit the product must carry (kilogram is GardenWorld's own 'Kg')
const ITEMS = [...want.keys()].sort();
ITEMS.forEach(i => { const w = want.get(i); w.cost = w.rate / FX; });
const TOL = 0.00005 + 1e-9;   // the legacy script (and so the zip) keeps 4 decimals: half of the last decimal is the whole allowed difference

// ── which zip: the newest kernel zip of the test-data folder, or (break) one made from a changed COPY of the rate file ─────────────
let zipFile = process.env.TDPK_ZIP || null, brokenItem = null, breakTmp = null;
if (BREAK === 'rate') {
  const tmp = breakTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdpk_')), copy = path.join(tmp, 'pwd2024_bd.json'), d = JSON.parse(fs.readFileSync(RATES, 'utf8'));
  brokenItem = ITEMS[0];
  [].concat(...Object.values(d.material_rates), ...Object.values(d.material_adds)).forEach(r => { if (r.source.item === brokenItem) r.rate = r.rate + 1000; });
  fs.writeFileSync(copy, JSON.stringify(d));
  try { execFileSync(process.execPath, [path.join(REPO, 'capex/tools/td_products_sql.js'), '--rates', copy, '--out', path.join(tmp, 'broken.sql')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { say('§TDPK break generator run failed: ' + String(e.stderr || e.message).slice(0, 400)); }
  zipFile = fs.readdirSync(tmp).filter(f => /_kernel\.zip$/.test(f)).map(f => path.join(tmp, f))[0] || null;
  say('§TDPK break=rate item ' + brokenItem + ' rate ' + want.get(brokenItem).rate + ' -> ' + (want.get(brokenItem).rate + 1000) + ' in a COPY; the checks keep the original file\'s values; zip=' + zipFile);
}
if (!zipFile) zipFile = fs.existsSync(PWDIR) ? fs.readdirSync(PWDIR).filter(f => /_CAPEX-TD-CONSTRUCTION-PRODUCTS_kernel\.zip$/.test(f)).sort().map(f => path.join(PWDIR, f)).pop() || null : null;
const SQLFILE = fs.readdirSync(PWDIR).filter(f => /_CAPEX-TD-CONSTRUCTION-PRODUCTS\.sql$/.test(f)).sort().map(f => path.join(PWDIR, f)).pop();
say('§TDPK population items=' + ITEMS.length + ' fx=' + FX + ' items=' + ITEMS.join(',') + ' zip=' + (zipFile ? path.relative(REPO, zipFile) : 'NONE') + ' sql=' + (SQLFILE ? path.relative(REPO, SQLFILE) : 'NONE') + ' break=' + (BREAK || 'none'));
if (ITEMS.length === 0) inconclusive('P', 'the rate file lists no items: a pass would mean nothing');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });

// ── D: the numbers of the zip against the numbers of the PostgreSQL script (independent text scans, no engine) ──────────────────
function driftCheck(xml) {
  const sql = fs.readFileSync(SQLFILE, 'utf8'), fromSql = {};
  for (const m of sql.matchAll(/INSERT INTO M_Product \([^)]*\)\nSELECT[^\n]*?'(PWD-[^']+)'[^\n]*?\(SELECT C_UOM_ID FROM C_UOM WHERE AD_Client_ID IN \(0,11\) AND (?:Name='(kilogram)'|X12DE355='(M[23])')/g)) { const v = m[1]; fromSql[v] = Object.assign(fromSql[v] || {}, { uom: m[2] === 'kilogram' ? 'Kg' : m[3] }); }
  for (const m of sql.matchAll(/INSERT INTO M_ProductPrice [^\n]*\nSELECT[^\n]*,100,([\d.]+),([\d.]+),([\d.]+),md5\('capex-td-products:price:'[^\n]*\nFROM M_Product pr, [^\n]*pr\.Value='(PWD-[^']+)'/g)) fromSql[m[4]] = Object.assign(fromSql[m[4]] || {}, { price: Number(m[2]) });
  for (const m of sql.matchAll(/INSERT INTO M_Cost [^\n]*\nSELECT 11,0,pr\.M_Product_ID,[^\n]*,100,([\d.]+),0,0,0,0,0,0,0,'N',md5\('capex-td-products:cost:'[^\n]*\nFROM M_Product pr[^\n]*\nWHERE pr\.AD_Client_ID=11 AND pr\.Value='(PWD-[^']+)'/g)) fromSql[m[2]] = Object.assign(fromSql[m[2]] || {}, { cost: Number(m[1]) });
  const prod = {}, fromZip = {};   // zip: product UU -> value; then the price / cost records point at the product UU
  for (const m of xml.matchAll(/<M_Product type="table">([\s\S]*?)<\/M_Product>/g)) { const v = /<Value>([^<]*)<\/Value>/.exec(m[1]), u = /<M_Product_UU>([^<]*)<\/M_Product_UU>/.exec(m[1]), c = /<C_UOM_ID [^>]*>([^<]*)<\/C_UOM_ID>/.exec(m[1]); if (v && u) { prod[u[1]] = v[1]; fromZip[v[1]] = { uomRef: c && c[1] }; } }
  for (const m of xml.matchAll(/<M_ProductPrice type="table">([\s\S]*?)<\/M_ProductPrice>/g)) { const p = /<M_Product_ID [^>]*>([^<]*)<\/M_Product_ID>/.exec(m[1]), s = /<PriceStd>([^<]*)<\/PriceStd>/.exec(m[1]); if (p && s && prod[p[1]]) fromZip[prod[p[1]]].price = Number(s[1]); }
  for (const m of xml.matchAll(/UPDATE M_Cost SET CurrentCostPrice=([\d.]+) WHERE [^\]]*?M_Product_ID=\(SELECT M_Product_ID FROM M_Product WHERE AD_Client_ID=11 AND Value='(PWD-[^']+)'\)/g)) if (fromZip[m[2]]) fromZip[m[2]].cost = Number(m[1]);   // the zip carries the Standard cost as a SQLStatement (the rows are created by MProduct.afterSave)
  return { fromSql, fromZip };
}

(async () => {
  // Z the zip exists
  if (!zipFile || !fs.existsSync(zipFile)) { check('Z', 'the Kernel 2Pack zip exists (written by capex/tools/td_products_sql.js)', false, { zip: zipFile }); finish(); return; }
  const xml = execFileSync('unzip', ['-p', zipFile, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const recs = {}; for (const m of xml.matchAll(/<([A-Za-z_0-9]+) type="(?:table|custom)">/g)) recs[m[1]] = (recs[m[1]] || 0) + 1;
  check('Z', 'the Kernel 2Pack zip exists and its PackOut.xml carries records', Object.keys(recs).length > 0, { zip: zipFile });
  say('§TDPK zip bytes=' + fs.statSync(zipFile).size + ' independent records per table=' + J(recs));

  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext()).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e));
  let dbB64 = null, pg = null;
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.AdCallout && !!window.ModelLayer && !!window.PipoPackIn && !!window.__crud, null, { timeout: 60000 });
    pg = await page.evaluate(({ xml, items }) => {
      const db = window.__idmpDb, P = window.PipoPackIn, ML = window.ModelLayer, log = [], say = l => log.push(l);
      const q = (s, p) => { const st = db.prepare(s), r = []; try { if (p) st.bind(p); while (st.step()) { const o = st.getAsObject(), k = {}; for (const c in o) k[c.toLowerCase()] = o[c]; r.push(k); } } finally { st.free(); } return r; };
      const env = window.__crud.withModelTrx((mq, e) => e), CL = 11, envC = Object.assign({}, env, { client: CL, org: 11 });
      const run = () => { try { const r = P.apply(db, xml, { say, convertSql: window.AdCallout.convertSql, clientId: CL, model: { ML, env: envC } }); return { ok: r.ok, error: r.error, byTable: r.byTable, modelSide: r.modelSide, sql: r.sql, unresolved: r.unresolved, actions: r.details.reduce((m, d) => { m[d.action] = (m[d.action] || 0) + 1; return m; }, {}) }; } catch (e) { return { ok: false, error: String(e && e.stack || e).slice(0, 800) }; } };
      const TB = ['c_uom', 'm_product_category', 'm_product_category_acct', 'm_product', 'm_product_acct', 'm_productprice', 'm_cost'];
      const tot = () => { const o = {}; TB.forEach(t => { try { o[t] = q('SELECT COUNT(*) AS n FROM ' + t)[0].n; } catch (e) { o[t] = 'absent'; } }); return o; };
      const vals = items.map(i => 'PWD-' + i), inList = vals.map(v => "'" + v + "'").join(',');
      const res = { env: { client: env.client, org: env.org } };
      res.pre = { products: q('SELECT COUNT(*) AS n FROM m_product WHERE value IN (' + inList + ')')[0].n, category: q("SELECT COUNT(*) AS n FROM m_product_category WHERE ad_client_id=11 AND value='Construction'")[0].n,
        schema: q('SELECT costingmethod AS m FROM c_acctschema WHERE c_acctschema_id=101')[0].m };
      res.tot0 = tot(); res.r1 = run(); res.tot1 = tot();
      res.prod = q('SELECT p.value AS v, p.name AS n, p.ad_client_id AS cl, u.x12de355 AS uom, p.m_product_id AS id, pc.value AS cat FROM m_product p LEFT JOIN c_uom u ON u.c_uom_id=p.c_uom_id LEFT JOIN m_product_category pc ON pc.m_product_category_id=p.m_product_category_id WHERE p.value IN (' + inList + ') ORDER BY p.value');
      res.price = q("SELECT p.value AS v, pp.pricestd AS std, pp.pricelist AS lst, pp.pricelimit AS lim, pp.m_pricelist_version_id AS ver FROM m_productprice pp JOIN m_product p ON p.m_product_id=pp.m_product_id WHERE p.value IN (" + inList + ')');
      res.cost = q("SELECT p.value AS v, c.currentcostprice AS cp, c.ad_org_id AS org, c.c_acctschema_id AS s, c.m_costelement_id AS ce, ce.costingmethod AS cm, ce.costelementtype AS ct FROM m_cost c JOIN m_product p ON p.m_product_id=c.m_product_id JOIN m_costelement ce ON ce.m_costelement_id=c.m_costelement_id WHERE p.value IN (" + inList + ') AND c.m_attributesetinstance_id=0');
      res.cat = q("SELECT pc.value AS v, pc.ad_client_id AS cl, a.c_acctschema_id AS s, a.costingmethod AS m FROM m_product_category pc LEFT JOIN m_product_category_acct a ON a.m_product_category_id=pc.m_product_category_id WHERE pc.ad_client_id=11 AND pc.value='Construction'");
      res.schemas = q('SELECT c_acctschema_id AS s, costingmethod AS m FROM c_acctschema WHERE ad_client_id=11 ORDER BY 1');
      res.primary = q('SELECT c_acctschema1_id AS s FROM ad_clientinfo WHERE ad_client_id=11')[0].s;
      res.r2 = run(); res.tot2 = tot();
      res.r3 = run(); res.tot3 = tot();
      res.log = log.filter(l => !/^\s*$/.test(l)).slice(0, 40);
      res.exportB64 = (() => { const u8 = db.export(); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); })();
      return res;
    }, { xml, items: ITEMS });
    dbB64 = pg.exportB64; delete pg.exportB64;
    pg.log.forEach(l => say('  ' + String(l).slice(0, 300)));
  } catch (e) { fails++; say('§TDPK FATAL ' + (e.stack || e)); }
  finally { PAGELOG.filter(l => /PAGEERR|§MODEL-ERR|SEVERE/.test(l)).slice(0, 10).forEach(l => say('  page: ' + l.slice(0, 300))); await browser.close(); server.close(); }
  if (!pg) { finish(); return; }
  say('§TDPK session env=' + J(pg.env) + ' run1=' + J({ ok: pg.r1.ok, error: pg.r1.error, byTable: pg.r1.byTable, modelSide: pg.r1.modelSide, unresolved: pg.r1.unresolved, sql: pg.r1.sql }).slice(0, 1800));
  say('§TDPK counts before=' + J(pg.tot0) + ' after run1=' + J(pg.tot1));

  // P0 population
  if (pg.pre.products !== 0) inconclusive('P0', 'products already existed before the Pack In (' + pg.pre.products + '): the run would judge nothing');
  else check('P0', 'population: none of the ' + ITEMS.length + ' products, no Construction category, schema 101 on "' + pg.pre.schema + '" before the Pack In', pg.pre.category === 0 && pg.pre.schema !== 'S', pg.pre);
  check('A', 'run 1 of Pack In ok=true, no unresolved reference', !!pg.r1.ok && !(pg.r1.unresolved && pg.r1.unresolved.length), { error: pg.r1.error, unresolved: pg.r1.unresolved });
  // P1 products + unit
  const byV = {}; pg.prod.forEach(p => { byV[p.v] = p; });
  const badP = ITEMS.filter(i => { const w = want.get(i), p = byV[w.value]; return !p || Number(p.cl) !== 11 || p.uom !== UNIT_SYMBOL[w.unit] || p.cat !== 'Construction'; }).map(i => ({ item: i, want: UNIT_SYMBOL[want.get(i).unit], got: byV['PWD-' + i] }));
  check('P1', ITEMS.length + ' products PWD-<item> in client 11, category Construction, unit M3 / M2 / Kg as the rate file says', pg.prod.length === ITEMS.length && badP.length === 0, { found: pg.prod.length, bad: badP.slice(0, 4) });
  // P2 price
  const badPr = ITEMS.filter(i => { const w = want.get(i), rows = pg.price.filter(x => x.v === w.value); return rows.length !== 1 || !near(rows[0].std, w.cost, TOL) || !near(rows[0].lst, w.cost, TOL) || !near(rows[0].lim, w.cost, TOL); }).map(i => ({ item: i, want: want.get(i).cost, got: pg.price.filter(x => x.v === 'PWD-' + i).map(x => x.std) }));
  const verIds = [...new Set(pg.price.map(x => x.ver))];
  check('P2', 'one M_ProductPrice per product on the Purchase 2003 version (103), PriceStd == rate / ' + FX + ' to the 4th decimal', badPr.length === 0 && verIds.length === 1 && Number(verIds[0]) === 103, { bad: badPr.slice(0, 4), versions: verIds });
  // P3 M_Cost
  const std = pg.cost.filter(c => c.ct === 'M' && c.cm === 'S' && Number(c.s) === 101 && Number(c.org) === 0);
  const badC = ITEMS.filter(i => { const w = want.get(i), rows = std.filter(x => x.v === w.value); return rows.length !== 1 || !near(rows[0].cp, w.cost, TOL); }).map(i => ({ item: i, want: want.get(i).cost, rows: std.filter(x => x.v === 'PWD-' + i).map(x => x.cp) }));
  check('P3', 'exactly ONE M_Cost (Material, Standard, schema 101, org 0) per product, CurrentCostPrice == rate / ' + FX + ' to the 4th decimal', badC.length === 0, { bad: badC.slice(0, 4), total: std.length });
  // C category + schema
  const catRows = pg.cat.filter(c => c.s != null), primary = pg.schemas.find(s => Number(s.s) === Number(pg.primary));
  check('C', 'category Construction exists once, its row for schema ' + pg.primary + ' is Standard, and the primary schema itself costs by Standard', pg.cat.length >= 1 && catRows.filter(c => Number(c.s) === Number(pg.primary)).length === 1 && catRows.filter(c => Number(c.s) === Number(pg.primary))[0].m === 'S' && !!primary && primary.m === 'S', { cat: pg.cat, schemas: pg.schemas, primary: pg.primary });
  // R second Pack In
  const same = r => r && r.ok && Object.keys(r.byTable || {}).every(t => r.byTable[t].new === 0);
  check('R', 'a second Pack In adds 0 rows: ok, no New record, every table\'s row count unchanged', same(pg.r2) && J(pg.tot1) === J(pg.tot2), { r2: pg.r2.byTable, error: pg.r2.error, tot1: pg.tot1, tot2: pg.tot2 });
  check('R3', 'a third run changes nothing either (no New, no Update, counts unchanged)', same(pg.r3) && Object.keys(pg.r3.byTable || {}).every(t => pg.r3.byTable[t].update === 0) && J(pg.tot2) === J(pg.tot3), { r3: pg.r3.byTable, error: pg.r3.error });

  // D drift (zip vs the committed PostgreSQL script)
  const dr = driftCheck(xml), sqlKeys = Object.keys(dr.fromSql).sort(), zipKeys = Object.keys(dr.fromZip).sort();
  const uomRefOk = v => { const u = dr.fromZip[v] && dr.fromZip[v].uomRef; return !!u && ({ M3: 'bim-uom-m3', M2: 'bim-uom-m2', Kg: 'c0776c7c-f653-4663-89ed-cb2bf92b6998' })[dr.fromSql[v].uom] === u; };
  const dd = sqlKeys.filter(v => !dr.fromZip[v] || !near(dr.fromSql[v].cost, dr.fromZip[v].cost, 1e-9) || !near(dr.fromSql[v].price, dr.fromZip[v].price, 1e-9) || !uomRefOk(v)).map(v => ({ v, sql: dr.fromSql[v], zip: dr.fromZip[v] }));
  say('§TDPK drift sql products=' + sqlKeys.length + ' zip products=' + zipKeys.length);
  if (!sqlKeys.length) inconclusive('D', 'no product could be read from the PostgreSQL script: nothing compared');
  else check('D', 'drift: the same ' + sqlKeys.length + ' products, and per product cost, price and unit in the zip == the PostgreSQL script (' + path.relative(REPO, SQLFILE) + ')', J(sqlKeys) === J(zipKeys) && dd.length === 0, { sqlOnly: sqlKeys.filter(k => !zipKeys.includes(k)), zipOnly: zipKeys.filter(k => !sqlKeys.includes(k)), diffs: dd.slice(0, 3) });

  // I: the issue path on the Kernel's model layer, on the database the Pack In left behind
  if (!dbB64) { inconclusive('I1', 'no database came back from the page'); finish(); return; }
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIR, 'dist', f) });
  if (!global.window) global.window = {};
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  const log0 = console.log; console.log = () => { };   // the model layer's own chatter; every verdict below is a §TDPK line
  let issues = null;
  try {
    const db = new SQL.Database(new Uint8Array(Buffer.from(dbB64, 'base64')));
    const ERP = path.join(REPO, 'erp'), K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML;
    require(path.join(ERP, 'model_projectissue.js'));
    const S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:td-products-kernel' };
    const one = (sql, p) => k.q(sql, p || [])[0] || null;
    const commit = fn => { const trx = new ML.Trx(k.q, k.env(S)); let r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; } const ok = r.ok !== false, ops = ok ? trx.groupOps() : []; if (ok && ops.length) k.commit(S, ops, { ws: 'td_products_kernel' }); return Object.assign({}, r, { ok }); };
    const lastId = t => one('SELECT MAX(' + t + '_id) AS m FROM ' + t).m;
    const mk = (table, f) => { const r = commit(trx => { const sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, f))); return { ok: sv.ok, error: sv.error }; }); if (!r.ok) throw new Error('fixture ' + table + ' refused: ' + r.error); return lastId(table); };
    const item = ITEMS[0], w = want.get(item), prod = one('SELECT m_product_id AS id, m_product_category_id AS cat FROM m_product WHERE value=? AND ad_client_id=11', [w.value]);
    if (!prod) { inconclusive('I1', 'product ' + w.value + ' is not in the database after the Pack In'); }
    else {
      const stored = Number((one("SELECT currentcostprice AS c FROM m_cost WHERE m_product_id=? AND c_acctschema_id=101 AND ad_org_id=0 AND m_attributesetinstance_id=0 AND m_costelement_id=(SELECT m_costelement_id FROM m_costelement WHERE ad_client_id=11 AND costelementtype='M' AND costingmethod='S')", [prod.id]) || {}).c);
      const QTY = 3; let N = 0;
      const scenario = (key, rule, catMethod) => {
        const p = mk('c_project', { value: 'TDPK' + (++N) + '-' + process.pid, name: 'TDPK project ' + N, c_currency_id: 100, m_pricelist_version_id: 104, m_warehouse_id: 103, c_bpartner_id: 117, c_bpartner_location_id: 112, ad_user_id: 104, c_paymentterm_id: 105, salesrep_id: 101, issummary: 'N', projectcategory: 'W' });
        const b0 = Number(one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [p]).b || 0), id = mk('c_projectissue', { c_project_id: p, m_locator_id: 101, m_product_id: prod.id, movementqty: QTY, movementdate: k.env(S).date });
        const r = commit((trx, M) => { const x = M.processIt(trx, 'c_projectissue', id, 'CO'); return { ok: x.ok, status: x.status, msg: x.msg }; });
        const d = Number(one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [p]).b || 0) - b0, st = one('SELECT docstatus AS s FROM c_projectissue WHERE c_projectissue_id=?', [id]).s;
        const cm = (one('SELECT costingmethod AS m FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=101', [prod.cat]) || {}).m, sm = (one('SELECT costingmethod AS m FROM c_acctschema WHERE c_acctschema_id=101') || {}).m;
        say('§TDPK issue ' + key + ' product=' + w.value + ' qty=' + QTY + ' balanceDelta=' + d.toFixed(4) + ' want=' + (QTY * w.cost).toFixed(4) + ' (= ' + QTY + ' x ' + w.rate + ' / ' + FX + ') storedCost=' + stored + ' docstatus=' + st + ' category method=' + cm + ' schema method=' + sm);
        check(key, rule + ': balance +' + d.toFixed(4) + ' == ' + QTY + ' x ' + w.rate + ' / ' + FX + ' = ' + (QTY * w.cost).toFixed(4), r.ok && st === 'CO' && cm === catMethod && sm === 'S' && d !== 0 && near(d, QTY * w.cost, QTY * TOL) && near(d, QTY * stored, 1e-6), { ok: r.ok, msg: r.msg, d, status: st, categoryMethod: cm, schemaMethod: sm, stored });
      };
      if (!(w.cost > 0) || !(stored > 0)) inconclusive('I1', 'the product has no positive Standard cost to book (' + stored + '): a pass would mean nothing');
      else {
        scenario('I1', 'schema Standard, category Standard: an issue of 3 to a Work Order project', 'S');
        db.run("UPDATE m_product_category_acct SET costingmethod='A' WHERE m_product_category_id=? AND c_acctschema_id=101", [prod.cat]);
        scenario('I2', 'the product\'s category forced to Average PO, the schema still Standard (the schema decides, IU3)', 'A');
      }
    }
  } catch (e) { fails++; console.log = log0; say('§TDPK FATAL issue path ' + (e.stack || e)); }
  console.log = log0;
  finish();
})().catch(e => { say('§TDPK ERROR ' + (e && e.stack || e)); process.exit(2); });

const REQUIRED = ['Z', 'P0', 'A', 'P1', 'P2', 'P3', 'C', 'R', 'R3', 'D', 'I1', 'I2'];
function finish() {
  const missing = REQUIRED.filter(id => !SEEN.has(id)); if (!fails && missing.length) inconclusive('ALL', 'checks never judged (scope-blind otherwise): ' + missing.join(','));
  const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE';
  say('§TDPK VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + ' break=' + (BREAK || 'none') + (BREAK ? ' (FAIL expected)' : ''));
  try { server.close(); } catch (e) { }
  if (breakTmp) try { fs.rmSync(breakTmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(v === 'PASS' ? 0 : 1);
}
