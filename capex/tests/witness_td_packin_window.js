// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PACKIN-WINDOW (bim-ootb prompts/CAPEX_DASHBOARD.md §5.70). READ THE LOG after every run: the §WTW lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: a GardenWorld client admin can pack the CAPEX test-data 2Pack into the twin the way legacy does it - window 50005 Pack In, a record with the zip attached, the Pack In
//   button (AD_Process 50008 PackInProcess) - and the rows stay after a reload (kept + replayed in the base DB, owner's choice).
//   W1 logged in as GardenWorld Admin (client 11); the Pack In window opens from the menu
//   W2 a Pack In record with NO attachment: the process says legacy's message, no project is written
//   W3 the zip attached (the attachment module the window uses), the button run: the card says Processed=<the zip's records> Un-Resolved=0; 12/42/84/84 rows in client 11; AD_Package_Imp in client 11
//      carrying the record's id; the record's DateProcessed set and P_Msg == the card's message
//   W4 reload + log in again: the same rows, once (not twice), put back by §PACKIN-REPLAY of the kept client entry
// Break switches (each MUST FAIL): WTW_BREAK=noreplay (the kept client entry deleted before the reload) -> W4 | nothen (the host ignores the continuation) -> W3
// Run: node capex/tests/witness_td_packin_window.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WTW_BREAK || '';
const ZIP = process.env.WTW_ZIP || fs.readdirSync(path.join(REPO, 'capex/plugin/testdata_2pack')).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(REPO, 'capex/plugin/testdata_2pack', f)).pop();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WTW ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WTW ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + ' ' + JSON.stringify(info).slice(0, cond ? 500 : 1500)); };
(async () => {
  const xml = execFileSync('unzip', ['-p', ZIP, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const want = {}; for (const m of xml.matchAll(/<([A-Za-z_0-9]+) type="table">/g)) want[m[1]] = (want[m[1]] || 0) + 1;   // independent: the zip's text
  const total = Object.values(want).reduce((a, b) => a + b, 0), zipB64 = fs.readFileSync(ZIP).toString('base64'), zipName = path.basename(ZIP);
  const VALUES = [...xml.matchAll(/<C_Project type="table">[\s\S]*?<Value>([^<]*)<\/Value>/g)].map(m => m[1]);
  console.log('§WTW zip=' + path.relative(REPO, ZIP) + ' records=' + total + ' perTable=' + JSON.stringify(want) + ' projects=' + VALUES.length + ' break=' + (BREAK || 'none'));
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html?lang=en_US';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), context = await browser.newContext({ acceptDownloads: true }), pg = await context.newPage();
  const LOG = []; pg.on('console', m => LOG.push(m.text())); pg.on('pageerror', e => LOG.push('PAGEERR ' + e));
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const login = async () => {
    await pg.goto(base, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => window.APP && window.APP.clientId != null && document.querySelector('#idmp-tree .idmp-row'), null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  };
  // the tip-aware read the window itself uses (the attachment host's rows = the page's _sqlRows)
  const rows = (sql) => pg.evaluate(s => window.__idmpAttach.host().rows(s) || [], sql);
  const counts = async () => { const V = VALUES.map(v => "'" + v + "'").join(','), PRJ = 'SELECT c_project_id FROM c_project WHERE ad_client_id=11 AND value IN (' + V + ')';
    const n = async s => Number(((await rows(s))[0] || {}).n || 0);
    return { project: await n('SELECT COUNT(*) AS n FROM c_project WHERE ad_client_id=11 AND value IN (' + V + ')'), phase: await n('SELECT COUNT(*) AS n FROM c_projectphase WHERE c_project_id IN (' + PRJ + ')'),
      task: await n('SELECT COUNT(*) AS n FROM c_projecttask WHERE c_projectphase_id IN (SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id IN (' + PRJ + '))'), line: await n('SELECT COUNT(*) AS n FROM c_projectline WHERE c_project_id IN (' + PRJ + ')') }; };
  const runButton = async () => {
    const n0 = LOG.length; await hc('[data-proc-btn]');   // a process with no parameters runs at once (no parameter dialog), as legacy's
    await pg.waitForSelector('[data-proc-run], .idmp-procresult', { timeout: 20000 });
    if (!(await pg.locator('.idmp-procresult').count()) && await pg.locator('[data-proc-run]').count()) await hc('[data-proc-run]');
    await pg.waitForSelector('.idmp-procresult', { timeout: 60000 }); await pg.waitForTimeout(800);
    const card = await pg.$eval('.idmp-procresult .msg', e => e.textContent).catch(() => null), chip = await pg.$eval('.idmp-procresult .ok-chip', e => e.textContent).catch(() => null);
    if (await pg.locator('[data-procdlg-ok]').count()) await hc('[data-procdlg-ok]');
    return { card, chip, log: LOG.slice(n0).filter(l => /§PACKIN|§PROC-ASYNC|§PROC-COMMIT|§AD-PROC-LIVE|PAGEERR|§PROC-EXCEPTION/.test(l)) };
  };
  try {
    if (BREAK === 'nothen') await context.addInitScript(() => { window.__procNoThen = true; });
    await login();
    const env = await pg.evaluate(() => ({ client: window.APP.clientId, role: window.APP.roleId, org: window.APP.orgId }));
    const mid = Number(((await rows("SELECT ad_menu_id AS m FROM ad_menu WHERE action='W' AND ad_window_id=50005 AND isactive='Y'"))[0] || {}).m || 0);
    let opened = false;
    if (mid) {
      const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
        while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
      if (chain) { for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
          if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
        await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 15000 }); await pg.waitForTimeout(1200); opened = true; }
    }
    verdict('W1', 'GardenWorld Admin (client 11) opens window 50005 Pack In from the menu', env.client === 11 && opened, { env, menu: mid, opened });
    if (!opened) throw new Error('window not opened');
    // W2: a record, no attachment
    const NAME = 'CAPEX test data (W-TD-PACKIN-WINDOW)';
    await hc('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(700);
    await pg.fill(F('name'), NAME); await pg.locator(F('name')).first().blur().catch(() => {}); await pg.waitForTimeout(300);
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800);
    const rec = (await rows("SELECT ad_package_imp_proc_id AS id, ad_client_id AS c, ad_package_imp_proc_uu AS uu FROM ad_package_imp_proc WHERE name='" + NAME.replace(/'/g, "''") + "' ORDER BY 1 DESC LIMIT 1"))[0];
    if (!rec) throw new Error('the Pack In record was not saved');
    const c0 = await counts(), r2 = await runButton(), c2 = await counts();
    verdict('W2', 'no attachment: the card says legacy\'s message, no project written', r2.card === 'Please attach the pack out archive before running the process' && c2.project === c0.project && c0.project === 0, { record: rec, card: r2.card, chip: r2.chip, c0, c2, log: r2.log });
    // W3: attach the zip through the attachment module the window's Attachment dialog uses, then the button
    const att = await pg.evaluate(async ({ b64, name, rid, ruu }) => {
      const A = window.__idmpAttach, AT = await A.load(), host = A.host(), bin = atob(b64), data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      const tid = window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='ad_package_imp_proc'")[0].values[0][0], cx = { tableId: tid, tableName: 'AD_Package_Imp_Proc', recordId: Number(rid), recordUU: ruu || null };
      const r = await AT.save(host, cx, AT.lookup(host, cx), [{ name, data, size: data.length }], ''); return { ok: r.ok, op: r.op, bytes: r.bytes, has: !!AT.lookup(host, cx) };
    }, { b64: zipB64, name: zipName, rid: rec.id, ruu: rec.uu });
    const r3 = await runButton(), c3 = await counts();
    const imp = await rows('SELECT ad_package_imp_id AS id, ad_client_id AS c, ad_org_id AS o, name, pk_status AS s, ad_package_imp_proc_id AS p FROM ad_package_imp WHERE ad_package_imp_proc_id=' + Number(rec.id));
    const recAfter = (await rows('SELECT dateprocessed AS d, p_msg AS m FROM ad_package_imp_proc WHERE ad_package_imp_proc_id=' + Number(rec.id)))[0] || {};
    const localDay = await pg.evaluate(() => { const d = new Date(), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); });   // the session's local day (never the UTC day, §5.33)
    const wantMsg = 'Processed=' + total + ' Un-Resolved=0', wantRows = { project: want.C_Project || 0, phase: want.C_ProjectPhase || 0, task: want.C_ProjectTask || 0, line: want.C_ProjectLine || 0 };
    if (!total) verdict('W3', 'records in the zip', false, { want }, true);
    else verdict('W3', 'zip attached, button run: card "' + wantMsg + '", rows ' + JSON.stringify(wantRows) + ' in client 11, AD_Package_Imp in client 11 with the record id, DateProcessed on the local day + P_Msg set',
      att.has && r3.card === wantMsg && JSON.stringify(c3) === JSON.stringify(wantRows) && imp.length === 1 && Number(imp[0].c) === 11 && /Completed/.test(imp[0].s) && recAfter.d != null && String(recAfter.d).slice(0, 10) === localDay && recAfter.m === r3.card,
      { att, card: r3.card, chip: r3.chip, rows: c3, imp, record: recAfter, localDay, log: r3.log });
    // W4: reload, log in again
    if (BREAK === 'noreplay') console.log('§WTW break noreplay removed=' + await pg.evaluate(() => new Promise(res => { const rq = indexedDB.open('fold_plugins', 1); rq.onsuccess = () => { const db = rq.result, tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), g = st.get('packs');
      g.onsuccess = () => { const v = g.result || {}, ks = Object.keys(v).filter(k => /^client:/.test(k)); ks.forEach(k => delete v[k]); st.put(v, 'packs'); tx.oncomplete = () => res(ks.join(',')); }; }; rq.onerror = () => res('ERR'); })));
    const n4 = LOG.length; await login(); const c4 = await counts(), rep = LOG.slice(n4).filter(l => /§PACKIN-REPLAY bundle=client:/.test(l));
    verdict('W4', 'after a reload the same rows are there once, put back by the kept client entry', JSON.stringify(c4) === JSON.stringify(wantRows) && rep.length >= 1, { rows: c4, replay: rep.slice(0, 2) });
  } catch (e) { fails++; console.log('§WTW FATAL ' + (e.stack || e)); }
  finally { LOG.filter(l => /PAGEERR|§MODEL-ERR|§PROC-EXCEPTION|§PACKIN-CLIENT/.test(l)).slice(0, 12).forEach(l => console.log('  page: ' + l.slice(0, 400))); await browser.close(); server.close(); }
  console.log('§WTW VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fail=' + fails + ' break=' + (BREAK || 'none'));
  process.exit(fails ? 1 : 0);
})();
