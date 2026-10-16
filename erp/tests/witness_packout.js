// ⚠ DO NOT REMOVE — W-PACKOUT (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §25, slice C). READ THE LOG after every run: the §WPO lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: the twin packs dictionary rows OUT to a 2Pack the way legacy does (org.adempiere.pipo2 PackOutProcess / PoExporter), so a user can edit a row in a
//   dictionary window, Pack Out, and redeploy - and the pack is legacy's format.
//   O1 LEGACY FORMAT ORACLE: the twin's Pack Out of the 36 processes + 9 forms that Libero's own legacy-produced 2Pack_1.0.0 PackOut.xml carries (same UUs) == that XML, per property:
//      name, attributes (reference / reference-key) and value. A difference counts AGAINST the twin only when the legacy value equals the twin's DB value (else the data changed since 2015:
//      reported as drift, never hidden); property names only one side has (schema drift) are listed; the relative order of the shared names must be the same.
//   O2 ROUND TRIP: our 1.0.3 rows (type P process + type D toolbar button) packed out on page A, packed in on a fresh page B: the rows read back equal field for field (by UU).
//   O3 EDIT -> REDEPLOY: the process Name edited in the Report & Process window (Save) on page A; Pack Out carries the new Name; page B packs it in.
//   O4 FILTER: without IsExportDictionaryEntity the EE01 process is not exported; DateFrom after its Updated skips it.
//   O5 NEGATIVE: an unported type refuses ("Packout handler not found for type"); a record with no UUID and no official id refuses (verifyPackOutRequirement).
//   O6 THE WINDOW: Pack Out window (System): header + a Package Details line typed in the window, Saved, the "Export Package" button: "Exported=1 File=<Name>.zip", a zip download
//      that the system unzip lists and whose PackOut.xml carries the process.
// Run: node erp/tests/witness_packout.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WPO ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WPO ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 1800))); };
const LEGACY_XML = execFileSync('unzip', ['-p', path.join(REPO, 'erp/plugins/libero_2pack/2Pack_1.0.0.zip'), '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const PUU = '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01', BUU = '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a02';
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const PAGELOG = [];
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, acceptDownloads: true }); const p = await ctx.newPage();
    p.on('console', m => PAGELOG.push(m.text())); p.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); p.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
    await p.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 });
    await p.evaluate(() => { window.__packOutNoDownload = false; }); return p; };
  // Pack Out through the TIP (the op log over the dictionary): the same query a process uses
  const packOut = (p, header, details, clientId) => p.evaluate(({ header, details, clientId }) => { let r; window.__crud.withModelTrx((q) => { try { const x = window.PipoPackOut.exportPackage(q, header, details, { clientId: clientId || 0 }); r = { xml: x.xml, stat: x.stat, count: x.count }; } catch (e) { r = { error: e.message }; } }); return r; }, { header, details, clientId });
  const login = async (p, client, user) => { await p.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))"); await p.waitForSelector('#idmp-login-step1:visible');
    await p.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await p.waitForSelector('#idmp-login-step2:visible'); await p.click('#idmp-login-ok');
    await p.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 20000 }); await p.waitForTimeout(1200); };
  const openWin = async (p, w) => { const mid = await p.evaluate(w => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return r.length ? r[0].values[0][0] : null; }, w);
    await p.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, mid);
    await p.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 20000, state: 'attached' }); await p.waitForTimeout(1500); };
  const HDR = (name, version, dict) => ({ name, pk_version: version, isexportdictionaryentity: dict ? 'Y' : 'N', created: '2026-10-16 00:00:00', updated: '2026-10-16 00:00:00' });
  try {
    // ════ page A: Libero started (its packs incl. 1.0.3), System logged in ════
    const A = await mk();
    for (const n of ['erp_cache', 'fold_plugins']) await A.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await A.reload({ waitUntil: 'networkidle' }); await A.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 });
    await A.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); }, base + '/plugins/libero_manufacturing.mjs');
    await login(A, 'System', 'System');

    // ── O1 legacy format oracle ──
    const legacyRecs = await A.evaluate((xml) => { const d = new DOMParser().parseFromString(xml, 'application/xml'), out = [];
      d.querySelectorAll('AD_Process[type="table"], AD_Form[type="table"]').forEach(e => { const t = e.nodeName, props = []; for (let c = e.firstElementChild; c; c = c.nextElementSibling) if (!c.hasAttribute('type')) props.push([c.nodeName, c.getAttribute('reference') || '', c.getAttribute('reference-key') || '', c.textContent.trim()]);
        const uu = (props.find(p => p[0] === t + '_UU') || [])[3]; if (uu) out.push({ t, uu, props }); });
      return out; }, LEGACY_XML);
    const present = await A.evaluate((recs) => recs.filter(r => window.__idmpDb.exec('SELECT 1 FROM ' + r.t + ' WHERE ' + r.t + "_uu='" + r.uu + "'").length), legacyRecs);
    const ids = await A.evaluate((recs) => recs.map(r => ({ t: r.t, id: window.__idmpDb.exec('SELECT ' + r.t + '_id FROM ' + r.t + ' WHERE ' + r.t + "_uu='" + r.uu + "'")[0].values[0][0] })), present);
    const o1 = await packOut(A, HDR('wpo_oracle', '1.0.0', true), ids.map((x, i) => ({ line: (i + 1) * 10, type: x.t === 'AD_Process' ? 'P' : 'X', ad_process_id: x.t === 'AD_Process' ? x.id : null, ad_form_id: x.t === 'AD_Form' ? x.id : null })));
    if (o1.error) throw new Error('O1 pack out: ' + o1.error);
    const ours = await A.evaluate((xml) => { const d = new DOMParser().parseFromString(xml, 'application/xml'), m = {};
      d.querySelectorAll('AD_Process[type="table"], AD_Form[type="table"]').forEach(e => { const t = e.nodeName, props = []; for (let c = e.firstElementChild; c; c = c.nextElementSibling) if (!c.hasAttribute('type')) props.push([c.nodeName, c.getAttribute('reference') || '', c.getAttribute('reference-key') || '', c.textContent.trim()]);
        const uu = (props.find(p => p[0] === t + '_UU') || [])[3]; m[uu] = props; }); return m; }, o1.xml);
    // the twin's raw DB values, to tell exporter defects from data drift
    const raw = await A.evaluate((recs) => { const o = {}; recs.forEach(r => { const st = window.__idmpDb.prepare('SELECT * FROM ' + r.t + ' WHERE ' + r.t + "_uu=?"); st.bind([r.uu]); st.step(); const v = st.getAsObject(); st.free(); const lv = {}; Object.keys(v).forEach(k => { lv[k.toLowerCase()] = v[k]; }); o[r.uu] = lv; }); return o; }, present);
    let eq = 0, total = 0, drift = [], bad = [], writerVer = [], onlyLegacy = {}, onlyTwin = {}, orderBad = [];
    for (const r of present) {
      const ourP = ours[r.uu]; if (!ourP) { bad.push({ uu: r.uu, why: 'not exported' }); continue; }
      const lNames = r.props.map(p => p[0]), oNames = ourP.map(p => p[0]);
      lNames.filter(n => oNames.indexOf(n) < 0).forEach(n => { onlyLegacy[r.t + '.' + n] = (onlyLegacy[r.t + '.' + n] || 0) + 1; });
      oNames.filter(n => lNames.indexOf(n) < 0).forEach(n => { onlyTwin[r.t + '.' + n] = (onlyTwin[r.t + '.' + n] || 0) + 1; });
      const shared = lNames.filter(n => oNames.indexOf(n) >= 0), dedupe = (a) => a.filter((n, i) => a.indexOf(n) === i);
      if (JSON.stringify(dedupe(shared)) !== JSON.stringify(dedupe(oNames.filter(n => lNames.indexOf(n) >= 0)))) orderBad.push({ uu: r.uu, legacy: dedupe(shared), twin: dedupe(oNames.filter(n => lNames.indexOf(n) >= 0)) });
      for (const lp of r.props) {
        const op = ourP.find(p => p[0] === lp[0]); if (!op) continue; total++;
        if (lp[1] === op[1] && lp[2] === op[2] && lp[3] === op[3]) { eq++; continue; }
        const dbv = raw[r.uu][lp[0].toLowerCase()], dbs = dbv == null ? '' : String(dbv).trim();
        // writer version: today's ReferenceUtils.getTableReference (:46-53) writes reference-key on an official-id reference; the 2015 writer that made Libero's pack did not
        if (lp[1] === 'id' && op[1] === 'id' && lp[2] === '' && op[2] !== '' && lp[3] === op[3]) { writerVer.push(r.t + '.' + lp[0]); continue; }
        // data drift: legacy recorded a different value than the twin's DB holds, AND the twin exported exactly its DB value
        if (lp[3] !== dbs && op[3] === dbs && lp[1] === op[1]) { drift.push({ rec: r.t + ' ' + r.uu.slice(0, 8), col: lp[0], legacy: lp[3].slice(0, 40), twin: op[3].slice(0, 40) }); continue; }
        bad.push({ rec: r.t + ' ' + r.uu.slice(0, 8), col: lp[0], legacy: lp.slice(1), twin: op.slice(1), db: dbs });
      }
    }
    console.log('§WPO O1 records legacy=' + legacyRecs.length + ' presentInTwin=' + present.length + ' exported=' + Object.keys(ours).length + ' stat=' + JSON.stringify(o1.stat));
    console.log('§WPO O1 onlyLegacy=' + JSON.stringify(onlyLegacy) + ' onlyTwin=' + JSON.stringify(onlyTwin));
    console.log('§WPO O1 drift(data changed since the 2015 pack)=' + drift.length + ' ' + JSON.stringify(drift.slice(0, 8)));
    console.log('§WPO O1 writer-version (reference-key on an official id: today ReferenceUtils:46-53, absent in the 2015 writer)=' + writerVer.length + ' ' + JSON.stringify([...new Set(writerVer)]));
    bad.slice(0, 10).forEach(b => console.log('§WPO O1 DEFECT ' + JSON.stringify(b))); orderBad.slice(0, 3).forEach(b => console.log('§WPO O1 ORDER ' + JSON.stringify(b)));
    verdict('O1', 'legacy format: ' + present.length + ' records (36 processes + 9 forms expected), ' + eq + ' of ' + total + ' shared properties identical; ' + drift.length + ' differ because the data changed since 2015 (legacy value != the twin DB, the twin exported its DB value); ' + writerVer.length + ' are the reference-key today\'s writer adds; ' + bad.length + ' exporter defects; shared-name order differs in ' + orderBad.length,
      present.length > 0 && total > 0 && !bad.length && !orderBad.length && Object.keys(ours).length === present.length, { bad: bad.slice(0, 5), orderBad: orderBad.slice(0, 2) }, !present.length);

    // ── O4 filter ──
    const pid = await A.evaluate((uu) => window.__idmpDb.exec("SELECT ad_process_id, updated FROM ad_process WHERE ad_process_uu='" + uu + "'")[0].values[0], PUU);
    const o4a = await packOut(A, HDR('wpo_nodict', '1.0.0', false), [{ line: 10, type: 'P', ad_process_id: pid[0] }]);
    const o4b = await packOut(A, Object.assign(HDR('wpo_datefrom', '1.0.0', true), { datefrom: '2999-01-01 00:00:00' }), [{ line: 10, type: 'P', ad_process_id: pid[0] }]);
    console.log('§WPO O4 noDict=' + JSON.stringify(o4a.stat) + ' dateFrom=' + JSON.stringify(o4b.stat));
    verdict('O4', 'filter: without IsExportDictionaryEntity the EE01 process exports ' + (o4a.stat && o4a.stat.records) + ' (skipped as dictionary ' + (o4a.stat && o4a.stat.skipped.dictionary) + '); DateFrom after its Updated exports ' + (o4b.stat && o4b.stat.records) + ' (skipped ' + (o4b.stat && o4b.stat.skipped.fromDate) + ')',
      o4a.stat && o4a.stat.records === 0 && o4a.stat.skipped.dictionary === 1 && o4b.stat && o4b.stat.records === 0 && o4b.stat.skipped.fromDate === 1, { o4a, o4b });
    // ── O5 negatives ──
    const o5a = await packOut(A, HDR('wpo_neg', '1.0.0', true), [{ line: 10, type: 'W', ad_window_id: 53009 }]);
    const o5b = await A.evaluate(() => { const db = window.__idmpDb; db.run("INSERT INTO ad_message (ad_message_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, value, msgtext, msgtype, entitytype, ad_message_uu) VALUES (1000777,0,0,'Y','2026-10-16',0,'2026-10-16',0,'WPO_NO_UU','x','I','U',NULL)"); return 1000777; });
    const o5c = await packOut(A, HDR('wpo_neg2', '1.0.0', true), [{ line: 10, type: 'MSG', ad_message_id: o5b }]);
    await A.evaluate(() => window.__idmpDb.run('DELETE FROM ad_message WHERE ad_message_id=1000777'));
    console.log('§WPO O5 ' + JSON.stringify({ unported: o5a.error, noUuid: o5c.error }));
    verdict('O5', 'negative: type W refuses (' + o5a.error + '); a non-official record without UUID refuses (' + o5c.error + ')', /Packout handler not found for type/.test(o5a.error || '') && /without official Id and UUID/.test(o5c.error || ''), { o5a, o5c });

    // ── O3 edit in the Report & Process window, then O2 round trip of the edited rows ──
    await openWin(A, 165);
    if (!(await A.locator('#idmp-find-ov').count())) await A.click('#idmp-toolbar [data-tb="find"]');   // a high-volume window opens with Find already up (legacy FindWindow, #2042)
    await A.waitForSelector('#idmp-find-ov'); await A.fill('[data-find-panel="simple"] [data-find-s="Name"]', 'Order Receipt & Issue'); await A.click('[data-find-ok]'); await A.waitForTimeout(1500);
    if (!(await A.locator('#idmp-inline-mount').count())) { await A.click('.idmp-grid tbody tr'); await A.waitForTimeout(500); await A.click('#idmp-toolbar [data-tb="toggle"]'); await A.waitForTimeout(1200); }
    const NEWNAME = 'Order Receipt & Issue (edited for W-PACKOUT)';
    const NAMEF = A.locator('#idmp-inline-mount input[data-col="name"]').first(); await NAMEF.fill(NEWNAME); await NAMEF.dispatchEvent('change');
    const nS = PAGELOG.length; await A.click('#idmp-toolbar [title^="Save"]'); await A.waitForTimeout(2500);
    const saveLine = PAGELOG.slice(nS).filter(l => /§MODEL-AFTER-SAVE|§CRUD|committed=/.test(l)).slice(-1)[0] || '';
    const bid = await A.evaluate((uu) => { let r; window.__crud.withModelTrx(q => { r = q("SELECT ad_toolbarbutton_id AS id FROM ad_toolbarbutton WHERE ad_toolbarbutton_uu=?", [uu]); }); return r && r[0] ? r[0].id : null; }, BUU);
    const tbbTable = await A.evaluate(() => window.__idmpDb.exec("SELECT ad_table_id FROM ad_table WHERE tablename='AD_ToolBarButton'")[0].values[0][0]);
    const o2 = await packOut(A, HDR('wpo_roundtrip', '1.0.4', true), [{ line: 10, type: 'P', ad_process_id: pid[0] }, { line: 20, type: 'D', ad_table_id: tbbTable, sqlstatement: "SELECT * FROM AD_ToolBarButton WHERE AD_ToolBarButton_UU='" + BUU + "'" }]);
    if (o2.error) throw new Error('O2 pack out: ' + o2.error);
    const nameInPack = (/<AD_Process type="table">[\s\S]*?<Name>([^<]*)<\/Name>/.exec(o2.xml) || [])[1];
    console.log('§WPO O3 save ' + saveLine.slice(0, 200) + ' | name in the pack: ' + nameInPack);
    const readRows = (p) => p.evaluate(({ PUU, BUU }) => { let r = {}; window.__crud.withModelTrx(q => {
      const pr = q('SELECT * FROM ad_process WHERE ad_process_uu=?', [PUU])[0] || null, bt = q('SELECT * FROM ad_toolbarbutton WHERE ad_toolbarbutton_uu=?', [BUU])[0] || null;
      const strip = (o) => { if (!o) return null; const c = {}; Object.keys(o).sort().forEach(k => { if (!/^(created|createdby|updated|updatedby)$/.test(k)) c[k] = o[k]; }); return c; };
      r = { process: strip(pr), button: strip(bt), buttonProcessUU: bt ? (q('SELECT ad_process_uu AS u FROM ad_process WHERE ad_process_id=?', [bt.ad_process_id])[0] || {}).u : null }; }); return r; }, { PUU, BUU });
    const rowsA = await readRows(A);
    // ════ page B: a fresh profile, no Libero: Pack In of what page A packed out ════
    const B = await mk();
    const before = await readRows(B);
    const inB = await B.evaluate((xml) => { window.__crud.withModelTrx(q => q('SELECT 1 AS x')); const st = window.PipoPackIn.apply(window.__idmpDb, xml, { convertSql: window.AdCallout.convertSql }); return { ok: st.ok, error: st.error, processed: st.processed, byTable: st.byTable }; }, o2.xml);
    const rowsB = await readRows(B);
    const cmp = (a, b, skip) => Object.keys(a || {}).filter(k => skip.indexOf(k) < 0 && String(a[k] == null ? '' : a[k]) !== String((b || {})[k] == null ? '' : (b || {})[k]));
    // a pack carries the columns with an ACTIVE AD_Column (POInfo); others (e.g. AD_Process.IsServerProcess, inactive in legacy too) are not round-tripped by legacy either - listed, not judged
    const carried = await A.evaluate(() => { const o = {}; ['AD_Process', 'AD_ToolBarButton'].forEach(t => { o[t.toLowerCase()] = window.__idmpDb.exec("SELECT lower(c.columnname) FROM ad_column c JOIN ad_table x ON x.ad_table_id=c.ad_table_id WHERE x.tablename='" + t + "' AND c.isactive='Y'")[0].values.map(r => r[0]); }); return o; });
    const notCarried = (row, t) => Object.keys(row || {}).filter(k => carried[t].indexOf(k) < 0);
    console.log('§WPO O2 columns no pack carries (no active AD_Column): process=' + JSON.stringify(notCarried(rowsA.process, 'ad_process')) + ' button=' + JSON.stringify(notCarried(rowsA.button, 'ad_toolbarbutton')));
    const dP = cmp(rowsA.process, rowsB.process, ['ad_process_id'].concat(notCarried(rowsA.process, 'ad_process'))), dB = cmp(rowsA.button, rowsB.button, ['ad_toolbarbutton_id', 'ad_process_id'].concat(notCarried(rowsA.button, 'ad_toolbarbutton')));
    console.log('§WPO O2 packIn on B ' + JSON.stringify(inB) + ' before=' + JSON.stringify({ p: !!before.process, b: !!before.button }) + ' processDiff=' + JSON.stringify(dP) + ' buttonDiff=' + JSON.stringify(dB) + ' buttonProcess=' + rowsB.buttonProcessUU);
    verdict('O2', 'round trip: page B (fresh, no Libero: process ' + !!before.process + ', button ' + !!before.button + ') packs in ' + (inB.processed) + ' records; process fields differing ' + JSON.stringify(dP) + ', button fields differing ' + JSON.stringify(dB) + ', the button points at the same process (UU)',
      inB.ok && !before.process && !before.button && !!rowsB.process && !!rowsB.button && !dP.length && !dB.length && rowsB.buttonProcessUU === PUU, { inB, dP, dB, a: rowsA, b: rowsB });
    verdict('O3', 'edit -> redeploy: the Name saved in the Report & Process window ("' + (rowsA.process && rowsA.process.name) + '") is in the pack (' + nameInPack + ') and arrives on page B ("' + (rowsB.process && rowsB.process.name) + '")',
      rowsA.process && rowsA.process.name === NEWNAME && nameInPack === NEWNAME.replace(/&/g, '&amp;') && rowsB.process && rowsB.process.name === NEWNAME, { saveLine, nameInPack, a: rowsA.process && rowsA.process.name, b: rowsB.process && rowsB.process.name });

    // ── O6 the Pack Out window, the user's path ──
    const step = async (label) => console.log('§WPO O6 step ' + label + ' ' + JSON.stringify(await A.evaluate(() => ({ find: !!document.getElementById('idmp-find-ov'), mount: !!document.getElementById('idmp-inline-mount'), tab: (document.querySelector('#idmp-tabstrip .idmp-adtab.active') || {}).title || null, status: ((document.getElementById('idmp-status') || {}).innerText || '').slice(0, 120), newBtn: (() => { const b = document.querySelector('#idmp-toolbar [data-tb="new"]'); return b ? (b.disabled ? 'disabled' : 'enabled') : 'absent'; })() }))));
    await openWin(A, 50003); await step('opened');
    if (await A.locator('#idmp-find-ov').count()) await A.click('#idmp-find-ov [data-find-ok]').catch(() => {});
    if (!(await A.locator('#idmp-inline-mount').count())) { await A.click('#idmp-toolbar [data-tb="new"]'); await A.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); }
    const fill = async (c, v) => { const L = A.locator('#idmp-inline-mount :is(input,select,textarea)[data-col="' + c + '"]').first(); if (!(await L.count())) return 'absent'; const tag = await L.evaluate(e => e.tagName + ':' + (e.type || ''));
      if (/checkbox/.test(tag)) { if (!(await L.isChecked())) await L.click(); } else if (/SELECT/.test(tag)) { await L.selectOption(v); await L.dispatchEvent('change'); } else { await L.fill(v); await L.dispatchEvent('change'); } return 'ok'; };
    const f1 = [await fill('name', 'wpo_window'), await fill('pk_version', '1.0.5'), await fill('version', '13'), await fill('releaseno', 'all'), await fill('isexportdictionaryentity', 'Y')];
    await A.click('#idmp-toolbar [title^="Save"]'); await A.waitForTimeout(2500);
    await A.click('#idmp-tabstrip .idmp-adtab[title$="· AD_Package_Exp_Detail"]'); await A.waitForTimeout(1500);
    if (!(await A.locator('#idmp-inline-mount').count())) { await A.click('#idmp-toolbar [data-tb="new"]'); await A.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); }
    console.log('§WPO O6 detail form: ' + JSON.stringify(await A.evaluate(() => ({ typeOptions: [...(document.querySelector('#idmp-inline-mount select[data-col="type"]') || { options: [] }).options].map(o => o.value + '=' + o.text).slice(0, 30) }))));
    const typeOpt = 'X';   // AD_Package_Exp_Detail.Type X = Form (TYPE_Form). Not P: the twin's process picker offers the first 200 processes only (crud_overlay LIMIT 200, a named divergence of the generic lookup, ERP_FRIENDLY_OPS_LENS.md §25.1) and our process sorts past it
    const f2 = [await fill('line', '10'), typeOpt ? await fill('type', typeOpt) : 'no Process option'];
    await A.waitForTimeout(800);
    const procOpt = await A.locator('#idmp-inline-mount select[data-col="ad_form_id"]').first().locator('option').evaluateAll(os => (os.find(o => /Order Receipt/.test(o.text)) || {}).value).catch(() => null);
    if (!procOpt) console.log('§WPO O6 form options: ' + JSON.stringify(await A.locator('#idmp-inline-mount select[data-col="ad_form_id"]').first().locator('option').evaluateAll(os => ({ n: os.length, match: os.filter(o => /Receipt/i.test(o.text)).map(o => o.value + '=' + o.text) }))));
    f2.push(procOpt ? await fill('ad_form_id', procOpt) : 'no form option');
    await A.click('#idmp-toolbar [title^="Save"]'); await A.waitForTimeout(2500);
    await A.click('#idmp-tabstrip .idmp-adtab[title$="· AD_Package_Exp"]'); await A.waitForTimeout(1500);
    if (!(await A.locator('#idmp-inline-mount').count())) { await A.click('#idmp-toolbar [data-tb="toggle"]'); await A.waitForTimeout(1200); }   // the header comes back in grid view: the form shows its button
    console.log('§WPO O6 header form: ' + JSON.stringify(await A.evaluate(() => ({ cols: [...new Set([...document.querySelectorAll('#idmp-inline-mount [data-col]')].map(e => e.getAttribute('data-col')))], buttons: [...document.querySelectorAll('#idmp-inline-mount button, #idmp-inline-mount [data-btn], #idmp-inline-mount .idmp-btnfield')].map(e => e.outerHTML.slice(0, 160)).slice(0, 10) }))));
    const dl = A.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    const n6 = PAGELOG.length; const btn = await A.$('[data-proc-btn="Processing"]');
    if (btn) await btn.click(); await A.waitForTimeout(1500);
    const shownDlg = await A.evaluate(() => { const d = document.getElementById('idmp-procdlg'); return d ? d.innerText : ''; }).catch(() => '');   // the result the dialog shows, before OK closes it
    if (await A.locator('#idmp-procdlg [data-procdlg-ok]').count()) await A.click('#idmp-procdlg [data-procdlg-ok]');   // ProcessModalDialog: OK
    const d = await dl; let listing = '', xmlOk = false;
    const shown = shownDlg;
    console.log('§WPO O6 the process result the user sees: ' + JSON.stringify(shown.replace(/\s+/g, ' ').slice(0, 300)));
    if (d) { const fp = path.join(os.tmpdir(), 'wpo_' + Date.now() + '.zip'); await d.saveAs(fp); try { listing = execFileSync('unzip', ['-l', fp], { encoding: 'utf8' }); const x = execFileSync('unzip', ['-p', fp, '*dict/PackOut.xml'], { encoding: 'utf8' }); xmlOk = /<AD_Form type="table">/.test(x) && x.indexOf('77081588-9733-4792-80ae-257638ebc534') >= 0 && /<Classname>org\.libero\.form\.VOrderReceiptIssue<\/Classname>/.test(x); } catch (e) { listing = 'ERR ' + e.message; } }
    const msg6 = PAGELOG.slice(n6).filter(l => /Exported=|§PACKOUT-DOWNLOAD|§AD-PROC|§PROC/.test(l)).join(' || ').slice(0, 600);
    console.log('§WPO O6 fill=' + JSON.stringify({ f1, f2 }) + ' button=' + !!btn + ' download=' + (d ? d.suggestedFilename() : null) + ' log=' + msg6 + ' unzip=' + listing.replace(/\s+/g, ' ').slice(0, 300));
    verdict('O6', 'Pack Out window: header + a Package Details line typed and saved, "Export Package" -> ' + (d ? d.suggestedFilename() : 'no download') + ', the zip lists dict/PackOut.xml and carries form 53007 (Classname org.libero...): ' + xmlOk,
      !!d && /wpo_window\.zip$/.test(d.suggestedFilename()) && /dict\/PackOut\.xml/.test(listing) && xmlOk && /Exported=1 File=wpo_window\.zip/.test(shown), { f1, f2, msg6, listing: listing.slice(0, 300) }, !btn);
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('O0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§WPO ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(os.tmpdir(), 'witness_packout.page.log'), PAGELOG.join('\n'));
  console.log('§WPO_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
