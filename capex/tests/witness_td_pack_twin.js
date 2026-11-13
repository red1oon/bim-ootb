// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PACK-TWIN (bim-ootb prompts/CAPEX_DASHBOARD.md §5.69). READ THE LOG after every run: the §WTD lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: the twin's Pack In takes a client's DATA 2Pack (the §5.67 GardenWorld test-data zip) the way legacy does: rows land in the session's client, every New / Update
//   goes through the model layer (MProject.beforeSave sets the currency the pack leaves out, MProduct.afterSave writes M_Product_Acct), a second run changes nothing, and a record of ANOTHER client
//   is never touched: it is remapped through AD_Package_UUID_Map (POFinder.findPO / getTargetUUID / updateUUIDMap).
//   T1 rows per table by target UUID == the record count per table of the zip's PackOut.xml (independent scan with the system unzip); AD_Client_ID = 11 on all of them
//   T2 every column the pack carries == the row, references resolved to the target ids (0 judged = INCONCLUSIVE)
//   T3 the model layer ran: C_Project.C_Currency_ID == its price list's currency, M_Product_Acct rows for the 2 products
//   T4 the same zip again: every record Same, counts unchanged
//   T5 remap: one project moved to another client -> a NEW project for client 11 with a new UUID + 1 AD_Package_UUID_Map row; a further run is all Same
// Break switches (each MUST FAIL): WTD_BREAK=skiptable (T1) | shiftdate (T2) | nomodel (T3)
// Run: node capex/tests/witness_td_pack_twin.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WTD_BREAK || '';
const ZIP = process.env.WTD_ZIP || fs.readdirSync(path.join(REPO, 'capex/plugin/testdata_2pack')).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(REPO, 'capex/plugin/testdata_2pack', f)).pop();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WTD ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WTD ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + ' ' + JSON.stringify(info).slice(0, cond ? 400 : 1500)); };
(async () => {
  const xml = execFileSync('unzip', ['-p', ZIP, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const want = {}; for (const m of xml.matchAll(/<([A-Za-z_0-9]+) type="table">/g)) want[m[1]] = (want[m[1]] || 0) + 1;   // the independent count: the zip's text, not the engine
  console.log('§WTD zip=' + path.relative(REPO, ZIP) + ' bytes=' + fs.statSync(ZIP).size + ' independent records per table=' + JSON.stringify(want) + ' break=' + (BREAK || 'none'));
  let feed = xml;   // what the ENGINE is fed (a break edits only this; the oracle keeps the zip's text)
  if (BREAK === 'skiptable') feed = feed.replace(/<C_ProjectTask type="table">[\s\S]*?<\/C_ProjectTask>/g, '');
  if (BREAK === 'shiftdate') { let done = false; feed = feed.replace(/(<C_ProjectPhase type="table">[\s\S]*?<StartDate>)(\d{4}-\d\d-)(\d\d)/, (m, a, b, d) => { done = true; return a + b + String(Number(d) % 28 + 1).padStart(2, '0'); }); console.log('§WTD break shiftdate applied=' + done); }
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext()).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e));
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.AdCallout && !!window.ModelLayer && !!window.PipoPackIn && !!window.__crud, null, { timeout: 60000 });
    const out = await page.evaluate(({ feed, oracleXml, noModel }) => {
      const db = window.__idmpDb, P = window.PipoPackIn, ML = window.ModelLayer, log = [], say = l => log.push(l);
      const q = (s, p) => { const st = db.prepare(s), r = []; try { if (p) st.bind(p); while (st.step()) { const o = st.getAsObject(), k = {}; for (const c in o) k[c.toLowerCase()] = o[c]; r.push(k); } } finally { st.free(); } return r; };
      const env = window.__crud.withModelTrx((mq, e) => e);   // the session env the model layer runs under (binds the stored-function UDFs on this db too)
      const CL = 11, envC = Object.assign({}, env, { client: CL, org: 11 });
      const run = x => P.apply(db, x, { say, convertSql: window.AdCallout.convertSql, clientId: CL, model: noModel ? null : { ML, env: envC } });
      // the oracle's own reading of the zip's XML (the browser's DOMParser; none of the engine's code)
      const doc = new DOMParser().parseFromString(oracleXml, 'application/xml'), recs = [];
      for (let el = doc.documentElement.firstElementChild; el; el = el.nextElementSibling) if (el.getAttribute('type') === 'table') {
        const props = {}; for (let c = el.firstElementChild; c; c = c.nextElementSibling) props[c.nodeName] = { ref: c.getAttribute('reference'), key: c.getAttribute('reference-key'), v: c.textContent.trim(), empty: !c.firstChild };
        recs.push({ table: el.nodeName, props });
      }
      const mapUU = (t, uu) => { const r = q('SELECT target_uuid AS u FROM ad_package_uuid_map WHERE ad_client_id=? AND ad_table_id=(SELECT ad_table_id FROM ad_table WHERE lower(tablename)=?) AND source_uuid=?', [CL, t, uu])[0]; return r ? r.u : uu; };
      const rowOf = (t, uu) => q('SELECT * FROM ' + t + ' WHERE ' + t + '_uu=?', [mapUU(t, uu)])[0] || null;
      const counts = () => { const c = {}; recs.forEach(r => { const t = r.table.toLowerCase(), row = rowOf(t, r.props[r.table + '_UU'].v); c[r.table] = c[r.table] || { found: 0, client11: 0 }; if (row) { c[r.table].found++; if (Number(row.ad_client_id) === CL) c[r.table].client11++; } }); return c; };
      const norm = v => { if (v == null || v === '') return null; const s = String(v); if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(s)); if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(s)) return s.slice(0, 19).replace('T', ' '); return s; };
      const SKIP = /^(ad_client_id|created|createdby|updated|updatedby)$/;
      const DDL = {}; q('SELECT tablename AS t, columnname AS c, defaultvalue AS v FROM ad_ddl_default').forEach(r => { DDL[String(r.t).toLowerCase() + '.' + String(r.c).toLowerCase()] = r.v; });
      const defaulted = []; recs.forEach(r => { const t = r.table.toLowerCase(); Object.keys(r.props).forEach(name => { const p = r.props[name], k = name.toLowerCase(); if (!p.ref && p.empty && (t + '.' + k) in DDL || (p.ref && p.v === '' && (t + '.' + k) in DDL)) defaulted.push(r.table + '.' + name + ' ' + r.props[r.table + '_UU'].v); }); });
      const compare = (afterNew) => { let n = 0; const diffs = []; recs.forEach(r => { const t = r.table.toLowerCase(), row = rowOf(t, r.props[r.table + '_UU'].v); if (!row) return;
        Object.keys(r.props).forEach(name => { const k = name.toLowerCase(), p = r.props[name]; if (SKIP.test(k) || k === t + '_id' || k === t + '_uu' || !(k in row)) return;
          let w; if (p.ref === 'uuid') { if (p.v === '') w = null; else { const rr = q('SELECT ' + p.key + '_id AS i FROM ' + p.key + ' WHERE ' + p.key + '_uu=?', [mapUU(p.key, p.v)])[0]; w = rr ? rr.i : '<uuid ' + p.v + ' absent>'; } }
          else if (p.ref === 'id') w = p.v === '' ? null : Number(p.v); else w = p.empty ? null : p.v;
          if (afterNew && w == null && (t + '.' + k) in DDL) w = DDL[t + '.' + k];   // PO.saveNew omits a null column: the physical DEFAULT applies (legacy measured 0 for M_Product.M_AttributeSetInstance_ID)
          n++; if (norm(w) !== norm(row[k])) diffs.push(r.table + '.' + name + ' ' + r.props[r.table + '_UU'].v.slice(0, 8) + ' pack=' + norm(w) + ' twin=' + norm(row[k])); }); });
        return { n, diffs }; };
      const projUUs = recs.filter(r => r.table === 'C_Project').map(r => r.props.C_Project_UU.v), prodUUs = recs.filter(r => r.table === 'M_Product').map(r => r.props.M_Product_UU.v);
      const model = () => ({ currency: projUUs.map(u => { const p = rowOf('c_project', u); if (!p) return { u, missing: 1 }; const plc = q('SELECT pl.c_currency_id AS c FROM m_pricelist_version v JOIN m_pricelist pl ON pl.m_pricelist_id=v.m_pricelist_id WHERE v.m_pricelist_version_id=?', [p.m_pricelist_version_id])[0]; return { v: p.value, cur: p.c_currency_id, pl: plc && plc.c }; }),
        acct: prodUUs.map(u => { const p = rowOf('m_product', u); return p ? q('SELECT COUNT(*) AS n FROM m_product_acct WHERE m_product_id=?', [p.m_product_id])[0].n : -1; }) });
      const res = { env: { client: env.client, org: env.org, user: env.user, role: env.role } };
      res.r1 = (({ ok, error, processed, byTable, uuidMapped, modelOps, modelSide }) => ({ ok, error, processed, byTable, uuidMapped, modelOps, modelSide }))(run(feed));
      res.c1 = counts(); res.cmp = compare(true); res.model = model(); res.defaulted = defaulted;
      const all = t => q('SELECT COUNT(*) AS n FROM ' + t)[0].n, TB = ['c_project', 'c_projectphase', 'c_projecttask', 'c_projectline', 'm_product', 'm_product_category', 'm_product_acct', 'ad_package_uuid_map'];
      const tot = () => { const o = {}; TB.forEach(t => { try { o[t] = all(t); } catch (e) { o[t] = 'absent'; } }); return o; };
      res.tot1 = tot();
      const r2 = run(feed); res.r2 = { ok: r2.ok, error: r2.error, byTable: r2.byTable, actions: r2.details.reduce((m, d) => { m[d.action] = (m[d.action] || 0) + 1; return m; }, {}) }; res.tot2 = tot(); res.cmp2 = compare(false);
      const r2b = run(feed); res.r2b = { ok: r2b.ok, error: r2b.error, byTable: r2b.byTable }; res.tot2b = tot();
      // T5: one project of the pack moved to another client, then the same zip
      const other = q('SELECT ad_client_id AS c FROM ad_client WHERE ad_client_id NOT IN (0, ?) ORDER BY 1 LIMIT 1', [CL])[0];
      res.other = other ? other.c : null;
      if (other && projUUs.length && rowOf('c_project', projUUs[0])) {
        const moved = rowOf('c_project', projUUs[0]); db.run('UPDATE c_project SET ad_client_id=? WHERE c_project_id=?', [other.c, moved.c_project_id]); res.moved = { id: moved.c_project_id, value: moved.value };
        const r3 = run(feed); res.r3 = { ok: r3.ok, error: r3.error, byTable: r3.byTable, uuidMapped: r3.uuidMapped };
        const mapped = q('SELECT target_uuid AS u FROM ad_package_uuid_map WHERE ad_client_id=? AND source_uuid=?', [CL, projUUs[0]]);
        const fresh = mapped[0] ? q('SELECT c_project_id AS id, ad_client_id AS c, value AS v FROM c_project WHERE c_project_uu=?', [mapped[0].u])[0] : null;
        res.t5 = { mapRows: mapped.length, fresh, oldStill: q('SELECT ad_client_id AS c FROM c_project WHERE c_project_id=?', [moved.c_project_id])[0],
          phasesOnFresh: fresh ? q('SELECT COUNT(*) AS n FROM c_projectphase WHERE c_project_id=?', [fresh.id])[0].n : 0, phasesOnOld: q('SELECT COUNT(*) AS n FROM c_projectphase WHERE c_project_id=?', [moved.c_project_id])[0].n };
        const r4 = run(feed); res.r4 = { ok: r4.ok, error: r4.error, byTable: r4.byTable };
      }
      res.log = log; return res;
    }, { feed, oracleXml: xml, noModel: BREAK === 'nomodel' });
    out.log.forEach(l => console.log('  ' + String(l).slice(0, 1200)));
    console.log('§WTD session env=' + JSON.stringify(out.env) + ' run1=' + JSON.stringify(out.r1).slice(0, 900));
    const tables = Object.keys(want), total = tables.reduce((s, t) => s + want[t], 0);
    if (!total) verdict('T1', 'records per table', false, { want }, true);
    else verdict('T1', 'rows per table by target UUID == the zip\'s records, all in client 11 (' + total + ' records)', out.r1.ok && tables.every(t => out.c1[t] && out.c1[t].found === want[t] && out.c1[t].client11 === want[t]), { want, got: out.c1, ok: out.r1.ok, error: out.r1.error });
    if (!out.cmp.n) verdict('T2', 'columns compared', false, out.cmp, true);
    else verdict('T2', 'every column the pack carries == the twin row (' + out.cmp.n + ' values)', out.cmp.diffs.length === 0, { diffs: out.cmp.diffs.length, first: out.cmp.diffs.slice(0, 8) });
    const curOk = out.model.currency.length && out.model.currency.every(c => c.cur != null && Number(c.cur) === Number(c.pl)), acctOk = out.model.acct.length && out.model.acct.every(n => n > 0);
    if (!out.model.currency.length) verdict('T3', 'model layer', false, out.model, true);
    else verdict('T3', 'model layer ran: currency from the price list on ' + out.model.currency.length + ' projects, M_Product_Acct on ' + out.model.acct.length + ' products', curOk && acctOk, { currency: out.model.currency.slice(0, 3), acct: out.model.acct, modelSide: out.r1.modelSide });
    // T4 (legacy measured 2026-11-13, a re-walk of the same records on the test instance): every found record logged Update (225/225), the data changes ONLY where a pack null met a column default
    //   on the first run (M_Product.M_AttributeSetInstance_ID 0 -> NULL on 2 products), no new rows; after it the rows equal the pack column for column; a further run changes nothing
    const updTables = {}; out.defaulted.forEach(d => { const t = d.split('.')[0]; updTables[t] = (updTables[t] || new Set()).add(d.split(' ')[1]); });
    const updOk = out.r2.ok && Object.keys(out.r2.byTable || {}).every(t => { const b = out.r2.byTable[t]; return b.new === 0 && b.update === (updTables[t] ? updTables[t].size : 0); });
    verdict('T4', 'the same zip again: no new rows, changes only on the ' + out.defaulted.length + ' column(s) where a pack null met a default (legacy re-walk: 2 products), all ' + total + ' logged Update as legacy, then rows == pack',
      updOk && (out.r2.actions.Update || 0) === total && !out.r2.actions.New && JSON.stringify(out.tot1) === JSON.stringify(out.tot2) && out.cmp2.n > 0 && out.cmp2.diffs.length === 0,
      { byTable: out.r2.byTable, actions: out.r2.actions, defaulted: out.defaulted, cmp2: { n: out.cmp2.n, diffs: out.cmp2.diffs.slice(0, 5) }, error: out.r2.error });
    const still = out.r2b.ok && Object.keys(out.r2b.byTable || {}).every(t => out.r2b.byTable[t].new === 0 && out.r2b.byTable[t].update === 0);
    verdict('T4b', 'a third run changes nothing', still && JSON.stringify(out.tot2) === JSON.stringify(out.tot2b), { byTable: out.r2b.byTable, error: out.r2b.error });
    if (out.other == null || !out.t5) verdict('T5', 'remap through AD_Package_UUID_Map', false, { other: out.other }, true);
    else { const t5 = out.t5, sameAfter = out.r4 && out.r4.ok && Object.keys(out.r4.byTable || {}).every(t => out.r4.byTable[t].new === 0 && out.r4.byTable[t].update === 0);
      verdict('T5', 'a project of client ' + out.other + ' is left alone: a new project for client 11 under a mapped UUID, its phases follow it, the next run is all Same',
        out.r3.ok && t5.mapRows === 1 && t5.fresh && Number(t5.fresh.c) === 11 && Number(t5.oldStill.c) === Number(out.other) && t5.phasesOnFresh > 0 && sameAfter,
        { r3: out.r3, t5, r4: out.r4 && out.r4.byTable }); }
  } catch (e) { fails++; console.log('§WTD FATAL ' + (e.stack || e)); }
  finally { PAGELOG.filter(l => /PAGEERR|§MODEL-ERR|SEVERE/.test(l)).slice(0, 10).forEach(l => console.log('  page: ' + l.slice(0, 300))); await browser.close(); server.close(); }
  console.log('§WTD VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fail=' + fails + ' break=' + (BREAK || 'none'));
  process.exit(fails ? 1 : 0);
})();
