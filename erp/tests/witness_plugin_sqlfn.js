// ⚠ DO NOT REMOVE — W-PLUGIN-SQLFN (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §24, slice B2). READ THE LOG after every run: the §WSF lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: a plugin's stored DB objects work in SQLite the legacy way - Libero's 2Pack_1.0.0 CREATE FUNCTION (PL/pgSQL) and CREATE VIEW statements.
//   S1 Start: every CREATE VIEW in the pack is created (translated by pg_view_sql.js, the core views' translator) and every CREATE FUNCTION is provided (bound from the
//      bundle's libero_sqlfn.mjs); names counted by a plain text scan of the pack, not by the engine
//   S2 VALUE ORACLE: Postgres runs the pack's OWN PL/pgSQL over the TWIN's rows (copied into a scratch schema on the pilot inside BEGIN..ROLLBACK - nothing kept on the pilot):
//      every function x every sampled (product, ASI, warehouse, locator) == the twin's JS body, value for value (errors must match as errors)
//   S3 every created view is queryable in the page (twin-internal: no legacy row count is claimed - the pilot's data is not the twin's)
//   S4 Stop + reload: the functions are bound again at load (§PACKIN-FN) for the STOPPED bundle and answer the same values; the views are still there (replayed)
//   Precondition logged: the page's UDF data access (AdCallout.RUNTIME.DB) is bound on its first model transaction - core's own bomqtyonhand needs it too (named in §24).
//   Break WSF_BREAK=nobind: the functions module is served EMPTY at the reload -> S4 must go RED.
// Run: [WSF_BREAK=nobind] node erp/tests/witness_plugin_sqlfn.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WSF_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WSF ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WSF ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 1500))); };
const PACK = path.join(REPO, 'erp/plugins/libero_2pack/2Pack_1.0.0.zip');
const XML = execFileSync('unzip', ['-p', PACK, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const STMTS = [...XML.matchAll(/<statement>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/statement>/g)].map(m => m[1]);
const FN_SQL = {}; STMTS.forEach(s => { const m = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:\w+\.)?(\w+)/i.exec(s); if (m) FN_SQL[m[1].toLowerCase()] = s; });
const VIEW_NAMES = [...new Set(STMTS.flatMap(s => [...s.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:\w+\.)?(\w+)\s+AS/gi)].map(m => m[1].toLowerCase())))];
const FNS = Object.keys(FN_SQL).sort();
console.log('§WSF pack scan: functions=' + JSON.stringify(FNS) + ' views=' + JSON.stringify(VIEW_NAMES));
function psql(script) {
  try { return execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'idempiere_pilot', '-tA', '-F', '|', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', maxBuffer: 1 << 26 }); }
  catch (e) { return { error: String(e.stderr || e.message).slice(0, 600) }; }
}
const lit = (v) => v == null ? 'NULL' : (typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const num = (v) => (v == null || v === '') ? null : Number(v);
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext(BREAK ? { serviceWorkers: 'block' } : {}); const page = await context.newPage();   // the break's route must see the module fetch (a service worker's fetches bypass page.route)
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e));
  const load = async () => { await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 }); await page.waitForTimeout(500); };
  const since = (n, re) => PAGELOG.slice(n).filter(l => re.test(l));
  try {
    await load();
    for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await load();
    // ── S1 ──
    let n0 = PAGELOG.length;
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); await window.PluginEngine.persist(); }, base + '/plugins/libero_manufacturing.mjs');
    const p100 = since(n0, /§PACKIN pack=org.idempiere.mfg version=1.0.0 /)[0] || '', bound = since(n0, /§PACKIN-FN bundle=org.idempiere.mfg/)[0] || '';
    const vs = /views=\[([^\]]*)\] viewsMissing=\[([^\]]*)\] functionsMissing=\[([^\]]*)\]/.exec(p100) || [];
    const created = [...new Set((vs[1] || '').split(',').filter(Boolean))], vMiss = (vs[2] || '').split(',').filter(Boolean), fMiss = (vs[3] || '').split(',').filter(Boolean);
    const provided = since(n0, /§PACKIN sql function=\S+ provided-by/).map(l => /function=(\S+)/.exec(l)[1]);
    console.log('§WSF S1 ' + bound + ' || ' + p100.replace(/genericForSpecial=.*?views=/, 'views=').slice(0, 600));
    verdict('S1', 'Start: views created ' + created.length + ' of ' + VIEW_NAMES.length + ' in the pack (missing ' + JSON.stringify(vMiss) + '); functions provided ' + [...new Set(provided)].length + ' of ' + FNS.length + ' (missing ' + JSON.stringify(fMiss) + ')',
      VIEW_NAMES.length > 0 && JSON.stringify(created.slice().sort()) === JSON.stringify(VIEW_NAMES.slice().sort()) && !vMiss.length && JSON.stringify([...new Set(provided)].sort()) === JSON.stringify(FNS) && !fMiss.length,
      { created, vMiss, provided, fMiss }, !VIEW_NAMES.length || !FNS.length);
    // ── S2: the sample + the twin's rows ──
    // UDF data access (core and plugin alike) reads through AdCallout.RUNTIME.DB, which the page binds on its first model transaction (crud_overlay _coBindUdf) - done here as any use of the page does
    const bindUdf = () => page.evaluate(() => { window.__crud.withModelTrx(q => q('SELECT 1 AS x')); return !!window.AdCallout.RUNTIME.DB; });
    console.log('§WSF udf data access bound=' + await bindUdf());
    // fixture (this page only, copied to the oracle with the rest): the seed has no ORDERED quantity and almost no RESERVED one, so bomqtyorderedasi / reservedasi would be judged on zeros
    //   alone (vacuous). A purchase (IsSOTrx N) and a sales (Y) reservation on two stocked BOM components of warehouse 103 give both non-zero values, through the core M_Storage view.
    console.log('§WSF fixture ' + await page.evaluate(() => { const db = window.__idmpDb;
      db.run("INSERT INTO m_storagereservation (ad_client_id, ad_org_id, created, createdby, isactive, issotrx, m_attributesetinstance_id, m_product_id, m_warehouse_id, qty, updated, updatedby, m_storagereservation_uu) VALUES (11,11,'2026-10-16 00:00:00',100,'Y','N',0,133,103,40,'2026-10-16 00:00:00',100,'wsf-fixture-po'),(11,11,'2026-10-16 00:00:00',100,'Y','Y',0,134,103,9,'2026-10-16 00:00:00',100,'wsf-fixture-so')");
      return JSON.stringify(db.exec("SELECT m_product_id, qtyreserved, qtyordered FROM m_storage WHERE qtyreserved<>0 OR qtyordered<>0")[0].values); }));
    const twin = await page.evaluate((fns) => { const db = window.__idmpDb, rows = (s) => { const r = db.exec(s); return r.length ? r[0].values : []; };
      const prods = rows("SELECT DISTINCT m_product_id FROM (SELECT m_product_id FROM pp_product_bom UNION SELECT m_product_id FROM pp_product_bomline UNION SELECT m_product_id FROM m_storage) ORDER BY 1").map(r => r[0]).concat([999999999]);
      const whs = rows('SELECT m_warehouse_id, MIN(m_locator_id) FROM m_locator WHERE ad_client_id=11 GROUP BY 1 ORDER BY 1');
      const asis = [0].concat(rows('SELECT DISTINCT m_attributesetinstance_id FROM m_storage WHERE m_attributesetinstance_id > 0 ORDER BY 1 LIMIT 2').map(r => r[0]));
      const tuples = [];
      prods.forEach(p => { asis.forEach(a => whs.forEach(w => tuples.push([p, a, w[0], null]))); whs.forEach(w => tuples.push([p, 0, null, w[1]])); tuples.push([p, 0, null, null]); });
      const vals = tuples.map(t => fns.map(f => { try { const r = db.exec('SELECT ' + f + '(' + t.map(v => v == null ? 'NULL' : v).join(',') + ')'); return r[0].values[0][0]; } catch (e) { return 'ERR ' + e.message; } }));
      const T = { m_product: rows('SELECT m_product_id, isbom, producttype, isstocked, c_uom_id FROM m_product'), c_uom: rows('SELECT c_uom_id, stdprecision FROM c_uom'), m_locator: rows('SELECT m_locator_id, m_warehouse_id FROM m_locator'),
        m_storage: rows('SELECT m_product_id, m_locator_id, m_attributesetinstance_id, qtyonhand, qtyreserved, qtyordered FROM m_storage'), pp_product_bom: rows('SELECT pp_product_bom_id, m_product_id FROM pp_product_bom'),
        pp_product_bomline: rows('SELECT pp_product_bom_id, m_product_id, isqtypercentage, qtybom, qtybatch FROM pp_product_bomline') };
      return { tuples, vals, T };
    }, FNS);
    const DDL = { m_product: 'm_product_id numeric, isbom char(1), producttype char(1), isstocked char(1), c_uom_id numeric', c_uom: 'c_uom_id numeric, stdprecision numeric', m_locator: 'm_locator_id numeric, m_warehouse_id numeric',
      m_storage: 'm_product_id numeric, m_locator_id numeric, m_attributesetinstance_id numeric, qtyonhand numeric, qtyreserved numeric, qtyordered numeric', pp_product_bom: 'pp_product_bom_id numeric, m_product_id numeric',
      pp_product_bomline: 'pp_product_bom_id numeric, m_product_id numeric, isqtypercentage char(1), qtybom numeric, qtybatch numeric' };
    let sc = 'BEGIN;\nCREATE SCHEMA wsf_oracle;\nSET LOCAL search_path = wsf_oracle, adempiere;\n';
    for (const t of Object.keys(DDL)) { sc += 'CREATE TABLE wsf_oracle.' + t + ' (' + DDL[t] + ');\n'; for (let i = 0; i < twin.T[t].length; i += 500) sc += 'INSERT INTO wsf_oracle.' + t + ' VALUES ' + twin.T[t].slice(i, i + 500).map(r => '(' + r.map(lit).join(',') + ')').join(',') + ';\n'; }
    for (const f of FNS) sc += FN_SQL[f].replace(/\badempiere\./gi, 'wsf_oracle.').replace(/ALTER\s+FUNCTION[\s\S]*?OWNER\s+TO\s+\w+\s*;?/gi, '').trim().replace(/;?\s*$/, ';') + '\n';
    sc += "CREATE FUNCTION wsf_oracle.wsf_try(f text, p numeric, a numeric, w numeric, l numeric) RETURNS text AS $$ DECLARE v numeric; BEGIN EXECUTE format('SELECT wsf_oracle.%I($1,$2,$3,$4)', f) INTO v USING p, a, w, l; RETURN v::text; EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLERRM; END; $$ LANGUAGE plpgsql;\n";
    sc += 'SELECT t.i, ' + FNS.map(f => "wsf_oracle.wsf_try('" + f + "', t.p, t.a, t.w, t.l)").join(', ') + ' FROM (VALUES ' + twin.tuples.map((t, i) => '(' + i + ',' + t.map(v => v == null ? 'NULL::numeric' : v + '::numeric').join(',') + ')').join(',') + ') AS t(i, p, a, w, l) ORDER BY t.i;\nROLLBACK;\n';
    const out = psql(sc);
    let s2judged = 0, s2bad = [], perFn = {}; FNS.forEach(f => { perFn[f] = { n: 0, bad: 0, nonzero: 0 }; });
    if (typeof out === 'string') {
      out.split('\n').filter(l => /^\d+\|/.test(l)).forEach(l => { const c = l.split('|'), i = Number(c[0]);
        FNS.forEach((f, k) => { const lv = c[k + 1], tv = twin.vals[i][k], le = /^ERR/.test(lv), te = /^ERR/.test(String(tv)); s2judged++; perFn[f].n++;
          const ok = (le && te) || (!le && !te && num(lv) === num(tv)); if (!le && num(lv) !== 0 && num(lv) !== null) perFn[f].nonzero++;
          if (!ok) { perFn[f].bad++; if (s2bad.length < 12) s2bad.push({ f, args: twin.tuples[i], legacy: lv, twin: tv }); } }); });
    } else console.log('§WSF oracle error ' + JSON.stringify(out));
    console.log('§WSF S2 tuples=' + twin.tuples.length + ' perFunction=' + JSON.stringify(perFn) + ' rowsCopied=' + JSON.stringify(Object.fromEntries(Object.keys(twin.T).map(t => [t, twin.T[t].length]))));
    s2bad.forEach(b => console.log('§WSF S2 diff ' + JSON.stringify(b)));
    verdict('S2', 'value oracle: ' + (s2judged - FNS.reduce((m, f) => m + perFn[f].bad, 0)) + ' of ' + s2judged + ' function calls (' + FNS.length + ' functions x ' + twin.tuples.length + ' tuples) equal Postgres running the pack\'s PL/pgSQL over the twin\'s rows',
      s2judged > 0 && FNS.every(f => perFn[f].bad === 0) && FNS.every(f => perFn[f].nonzero > 0), { perFn, s2bad }, !s2judged);
    // ── S3 views queryable ──
    const vq = await page.evaluate((names) => names.map(n => { try { return [n, window.__idmpDb.exec('SELECT COUNT(*) FROM ' + n)[0].values[0][0]]; } catch (e) { return [n, 'ERR ' + e.message]; } }), VIEW_NAMES);
    console.log('§WSF S3 ' + JSON.stringify(vq));
    verdict('S3', 'every created view is queryable in the page (twin-internal, row counts ' + JSON.stringify(Object.fromEntries(vq)) + ')', vq.every(v => typeof v[1] === 'number'), vq);
    // ── S4 stop + reload ──
    const probe = twin.tuples.map((t, i) => ({ t, v: twin.vals[i] })).filter(x => x.v.some(v => v !== 0 && v !== 99999 && !/^ERR/.test(String(v)))).slice(0, 6);
    await page.evaluate(async () => { await window.PluginEngine._reg().stopBundle('org.idempiere.mfg'); await window.PluginEngine.persist(); });
    if (BREAK === 'nobind') await page.route(/libero_sqlfn\.mjs/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function functions() { return {}; }' }));
    n0 = PAGELOG.length; await load();
    const bind4 = since(n0, /§PACKIN-FN bundle=org.idempiere.mfg/)[0] || '', rep4 = since(n0, /§PACKIN-REPLAY bundle=org.idempiere.mfg/)[0] || '';
    console.log('§WSF udf data access bound after reload=' + await bindUdf());
    const st4 = await page.evaluate(() => { const b = window.PluginEngine._reg().get('org.idempiere.mfg'); return b ? b.state : null; });
    const after = await page.evaluate(({ probe, fns, views }) => ({ vals: probe.map(x => fns.map(f => { try { return window.__idmpDb.exec('SELECT ' + f + '(' + x.t.map(v => v == null ? 'NULL' : v).join(',') + ')')[0].values[0][0]; } catch (e) { return 'ERR ' + e.message; } })),
      views: views.filter(n => { try { window.__idmpDb.exec('SELECT 1 FROM ' + n + ' LIMIT 1'); return true; } catch (e) { return false; } }).length }), { probe, fns: FNS, views: VIEW_NAMES });
    const same4 = probe.every((x, i) => JSON.stringify(x.v) === JSON.stringify(after.vals[i]));
    console.log('§WSF S4 state=' + st4 + ' || ' + bind4 + ' || ' + rep4 + ' probe=' + JSON.stringify(probe.map((x, i) => ({ args: x.t, before: x.v, after: after.vals[i] }))).slice(0, 700));
    verdict('S4', 'bundle ' + st4 + ' after reload: functions re-bound (' + (bind4 ? bind4.replace(/^.*bound=/, 'bound=') : 'NO §PACKIN-FN line') + '), ' + probe.length + ' probe tuples answer the same values: ' + same4 + '; views present ' + after.views + ' of ' + VIEW_NAMES.length,
      st4 !== 'ACTIVE' && /bound=\[bomqty/.test(bind4) && same4 && after.views === VIEW_NAMES.length && / mode=delta /.test(rep4), { bind4, rep4, after, probe }, !probe.length);
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('S0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§WSF ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(os.tmpdir(), 'witness_plugin_sqlfn.page.log'), PAGELOG.join('\n'));
  console.log('§WSF_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : ''));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
