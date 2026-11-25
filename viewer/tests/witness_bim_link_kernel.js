// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BIM-LINK-KERNEL. Spec: bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8.10 items 2, 4, 5 (owner 2026-11-26: "no red pill, just link back").
// THE ISSUE it proves or disproves: "a project pushed from the Viewer into the Kernel ERP links back to its model the same way legacy does" — the push stores C_Project.BIM_ViewerURL =
//   <this Viewer's origin+path>?db=<A.DB_URL>; the Project window shows it as legacy's URL field (text read-only + an <a target=_blank> whose href is the value), right after Description;
//   the red pill no longer offers the BIM Viewer for a project; the link opens the Viewer on that db.
// Real paths only: the blank Viewer, Ctrl+O on the Shed's db (a file chooser stands in for the OS dialog), Find > Level 1, > ERP (no legacy target: Kernel only), then erp/idempiere.html in the
//   SAME browser (its BIM overlay reads the Viewer's OPFS store), the link clicked. Falsifier in the same run: ERP_BREAK=nourl (display type 40 not mapped) -> the URL-editor check must FAIL.
// Writes the Kernel half of §BIM_LINK_TWIN to $TWIN_OUT (default /tmp/bim_link_twin_kernel.json). READ viewer/tests/witness_bim_link_kernel.log after every run.
// Run: SHED_DB=<path to SHED_extracted.db (the UAT reference pack)> node viewer/tests/witness_bim_link_kernel.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), SHED = process.env.SHED_DB, TWIN_OUT = process.env.TWIN_OUT || '/tmp/bim_link_twin_kernel.json';
const LOG = path.join(__dirname, 'witness_bim_link_kernel.log'), out = [];
const S = m => { out.push(m); console.log(m); };
let judged = 0, fails = 0;
const check = (id, ok, detail) => { judged++; if (!ok) fails++; S('§W_BIM_LINK_KERNEL ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ' ' + detail); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(pg, fn, ms, arg) { const t0 = Date.now(); for (;;) { const v = await pg.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(400); } }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
// the Project window's link field as the user sees it: label, text box (value, read-only), button (<a>: target, href), and the displayed field right before it
const FIELD = () => {
  const row = document.querySelector('#idmp-inline-mount [data-ad-column="bim_viewerurl"]'); if (!row) return null;
  const inp = row.querySelector('input[data-col="bim_viewerurl"]'), a = row.querySelector('a[data-url-open]');
  const rows = [...document.querySelectorAll('#idmp-inline-mount .cfrow[data-ad-column]')].filter(r => r.style.display !== 'none'), i = rows.indexOf(row);
  return { label: (row.querySelector('.cfl') || {}).textContent.replace(/\*/g, '').trim(), value: inp ? inp.value : null, disabled: inp ? inp.disabled : null, hasButton: !!a,
    target: a ? a.getAttribute('target') : null, href: a ? a.getAttribute('href') : null, prev: i > 0 ? rows[i - 1].getAttribute('data-ad-column') : null, shown: row.getBoundingClientRect().width > 0 };
};

(async () => {
  if (!SHED || !fs.existsSync(SHED)) { S('§W_BIM_LINK_KERNEL_VERDICT INCONCLUSIVE judged=0 fails=0 (SHED_DB not given / absent: nothing was pushed)'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = 'http://localhost:' + server.address().port;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'wbimlinkk-'));
  const br = await puppeteer.launch({ headless: 'new', userDataDir: prof, protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--window-size=1440,900'] });
  const lines = [], page = async () => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); pg.on('console', m => lines.push(m.text().slice(0, 800))); pg.on('pageerror', e => lines.push('§PAGEERR ' + String(e.message).slice(0, 300))); return pg; };
  try {
    // K1 the blank Viewer, Ctrl+O the Shed
    const pg = await page();
    await pg.goto(BASE + '/viewer/viewer.html?blank=1', { waitUntil: 'load', timeout: 180000 });
    await pg.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', { timeout: 180000 }); await sleep(1500);
    await pg.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.keyboard.down('Control').then(() => pg.keyboard.press('KeyO')).then(() => pg.keyboard.up('Control'))]);
    await ch.accept([SHED]);
    const st = await until(pg, () => { const t = window.APP && window.APP.status ? window.APP.status.textContent : ''; return /DONE/.test(t) ? t : null; }, 360000);
    S('§BIM_LINK_K1 opened status="' + (st || '').slice(0, 80) + '" url=' + pg.url());
    if (!st) throw new Error('the Viewer did not open the Shed');
    await sleep(3000);
    // K2 Find > Level 1 (the whole Shed) > ERP
    const wholeReady = () => { const b = document.getElementById('find-erp-btn'), t = (document.getElementById('find-selected') || {}).innerText || ''; return !!(b && b.getBoundingClientRect().width > 0 && /Level 1/.test(t)); };
    let pushed = null;
    for (let a = 1; a <= 4 && !pushed; a++) {
      if (!(await pg.evaluate(wholeReady))) {
        if (!(await pg.evaluate(() => { const p = document.getElementById('find-panel'); return !!(p && p.getBoundingClientRect().width > 0); }))) { await pg.mouse.click(700, 700); await sleep(300); await pg.keyboard.press('KeyF'); await sleep(2500 * a); }
        const lbl = await pg.$('#find-tree .find-tree-row[data-find-parent="Level 1"] > span:nth-child(2)') || await pg.$('#find-tree .find-tree-row[data-find-parent="Level 1"]');
        if (lbl) { await lbl.scrollIntoView(); await lbl.click(); }
        await until(pg, wholeReady, 30000 * a);
      }
      const b = await pg.$('#find-erp-btn'); if (b && await b.boundingBox()) { const n0 = lines.length; await b.click(); for (let i = 0; i < 300 && !pushed; i++) { pushed = lines.slice(n0).find(l => /§BIM_LINK_STORE project=\d+/.test(l)) || null; if (!pushed) await sleep(400); } }
    }
    S('§BIM_LINK_K2 ' + (pushed || 'no §BIM_LINK_STORE line'));
    const legacyLine = lines.find(l => /§PROJ_PUSH_LEGACY skip=/.test(l)) || '';
    const dbUrl = await pg.evaluate(() => window.APP.DB_URL), origin = await pg.evaluate(() => location.origin + location.pathname);
    const expect = origin + '?db=' + encodeURIComponent(dbUrl), m = /§BIM_LINK_STORE project=(\d+) written url=(\S+)/.exec(pushed || ''), pid = m ? Number(m[1]) : null, stored = m ? m[2] : null;
    check('K2.store', stored === expect, 'stored=' + stored + ' expected=' + expect + ' (A.DB_URL=' + dbUrl + ')');
    check('K2.kernel-only', /skip=no-target/.test(legacyLine), 'the push stayed in the Kernel: ' + (legacyLine || 'no §PROJ_PUSH_LEGACY line'));
    const plan = await pg.evaluate(async (v) => { const st = await window.ProjOrderState.shared(window.APP._SQL || window.SQL || window._SQL_CACHED, () => window.APP.cachedFetch('../erp/ad_seed.db'), 'witness'); const p = window.ErpPushPlan.planFromDb(st.db, v); return p.plan ? (p.plan.fields.find(f => f.column === 'BIM_ViewerURL') || {}).val || null : null; }, await pg.evaluate(() => window.APP.activeBuilding)).catch(e => 'ERR ' + e.message);
    check('K2.plan', plan === stored, 'the legacy push plan carries the same stored link: ' + plan);
    // K3 the Project window in the Kernel ERP, same browser
    const ep = await page();
    await ep.goto(BASE + '/erp/idempiere.html?login=GardenAdmin&window=130&record=' + pid, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const f = await until(ep, FIELD, 120000);
    S('§BIM_LINK_K3 field=' + JSON.stringify(f));
    check('K3.shown', !!f && f.shown && f.label === 'BIM Model', 'the Project window shows the field "BIM Model": ' + JSON.stringify(f && { label: f.label, shown: f.shown }));
    check('K3.value', !!f && f.value === stored, 'its text == the stored link');
    check('K3.readonly', !!f && f.disabled === true, 'its text is read-only (disabled=' + (f && f.disabled) + ')');
    check('K3.button', !!f && f.hasButton && f.target === '_blank' && f.href === stored, 'its button is <a target=_blank href=value> (target=' + (f && f.target) + ' href==value ' + (f && f.href === stored) + ')');
    check('K3.place', !!f && f.prev === 'description', 'it is right after Description (previous field: ' + (f && f.prev) + ')');
    const zoom = await ep.evaluate(() => ({ gate: typeof window.IdmpPillZoomGate === 'function' ? window.IdmpPillZoomGate() : null,
      viewer: window.ZoomAcross ? window.ZoomAcross.destinations().some(d => { try { return d.id === 'viewer' && d.available({ tab: { tableName: 'C_Project' }, rec: null, db: window.__idmpDb }); } catch (e) { return false; } }) : null }));
    check('K3.no-red-pill', zoom.gate === false && zoom.viewer === false, 'Zoom Across on this project: gate=' + zoom.gate + ' viewerDestination=' + zoom.viewer);
    // K4 the rule is the display type's, not this window's: every displayed URL field of the dictionary maps to the URL editor (X of N)
    const xn = await ep.evaluate(() => { const r = window.__idmpDb.exec("SELECT COUNT(*), COUNT(DISTINCT f.ad_tab_id) FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id WHERE COALESCE(f.ad_reference_id,c.ad_reference_id)=40 AND f.isdisplayed='Y' AND f.isactive='Y' AND t.isactive='Y'")[0].values[0];
      const CC = window.CrudCore || (window.__crud && window.__crud.core); return { fields: r[0], tabs: r[1], type: CC && CC.mapRefDisplayType ? CC.mapRefDisplayType(40) : 'no CrudCore' }; });
    check('K4.generic', xn.type === 'url' && xn.fields > 1, xn.fields + ' displayed URL fields on ' + xn.tabs + ' tabs, all display type 40 -> editor "' + xn.type + '" (one rule, no per-window code)');
    // K5 the link opens the Viewer on that db, in a new tab
    const before = new Set(br.targets()); await ep.click('#idmp-inline-mount a[data-url-open="bim_viewerurl"]');
    let np = null; for (let i = 0; i < 60 && !np; i++) { const t = br.targets().find(x => !before.has(x) && x.type() === 'page'); if (t) np = await t.page(); else await sleep(500); }
    if (np) { np.on('console', m => lines.push(m.text().slice(0, 800))); await np.waitForFunction('window.APP && typeof window.APP.DB_URL === "string"', { timeout: 180000 }).catch(() => {}); }
    const opened = np ? { url: np.url(), db: await np.evaluate(() => window.APP && window.APP.DB_URL).catch(() => null) } : null;
    const reopened = np ? await until(np, () => { const t = window.APP && window.APP.status ? window.APP.status.textContent : ''; return /DONE/.test(t) ? t : null; }, 240000) : null;
    check('K5.opens', !!opened && opened.url === stored && opened.db === dbUrl, 'a click on the button opened a NEW tab at the link, its Viewer db == the pushed db: ' + JSON.stringify(opened));
    S('§BIM_LINK_K5 reopened status="' + String(reopened || 'not DONE').slice(0, 80) + '" (same browser: the Ctrl+O copy is in this browser\'s storage)');
    // K6 falsifier: display type 40 not mapped -> the same window shows a plain text box, no button -> the K3.button rule must fail
    const fp = await page(); await fp.evaluateOnNewDocument(() => { window.ERP_BREAK = 'nourl'; });
    await fp.goto(BASE + '/erp/idempiere.html?login=GardenAdmin&window=130&record=' + pid, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const fb = await until(fp, FIELD, 120000);
    const brokeOk = !!fb && fb.hasButton && fb.target === '_blank' && fb.href === stored;
    check('K6.falsifier', !!fb && !brokeOk, 'ERP_BREAK=nourl: the URL-editor rule ' + (brokeOk ? 'still PASSED (the witness cannot fail)' : 'FAILED as it must') + ' ' + JSON.stringify(fb && { hasButton: fb.hasButton, href: fb.href }));
    // the Kernel half of the twin line
    const dict = await ep.evaluate(() => { const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values[0] : null; };
      const c = q("SELECT c.columnname, c.ad_reference_id, c.fieldlength, c.ad_column_uu, e.name, e.ad_element_uu FROM ad_column c JOIN ad_element e ON e.ad_element_id=c.ad_element_id WHERE lower(c.columnname)='bim_viewerurl'");
      const fl = q("SELECT f.isreadonly, f.seqno, f.ad_field_uu, f.ad_tab_id, (SELECT c2.columnname FROM ad_field f2 JOIN ad_column c2 ON c2.ad_column_id=f2.ad_column_id WHERE f2.ad_tab_id=f.ad_tab_id AND f2.isdisplayed='Y' AND f2.seqno<f.seqno ORDER BY f2.seqno DESC LIMIT 1) FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE lower(c.columnname)='bim_viewerurl'");
      const tb = q("SELECT isactive FROM ad_tab WHERE ad_tab_uu='b1a00100-0001-4000-8000-000000000001'");
      return { column: c && c[0], reference: c && c[1], length: c && c[2], columnUU: c && c[3], element: c && c[4], elementUU: c && c[5], readonly: fl && fl[0], seqno: fl && fl[1], fieldUU: fl && fl[2], tab: fl && fl[3], after: fl && fl[4], bimTabActive: tb && tb[0] }; });
    const twin = Object.assign({ side: 'kernel', value: stored, valueShape: /^https?:\/\/[^?]+\/viewer\/viewer\.html\?db=[^&]+$/.test(stored || '') ? '<origin>/<path>/viewer.html?db=<enc db>' : 'OTHER', db: dbUrl, renderer: f && { readonly: f.disabled, button: f.hasButton, target: f.target, hrefIsValue: f.href === stored } }, dict);
    fs.writeFileSync(TWIN_OUT, JSON.stringify(twin, null, 1)); S('§BIM_LINK_TWIN_KERNEL ' + JSON.stringify(twin));
  } catch (e) { fails++; S('§W_BIM_LINK_KERNEL ERROR ' + (e && e.stack || e)); }
  finally {
    out.push('', '--- page § lines ---'); lines.filter(l => /§(BIM_LINK|BIMLINK|PROJ_PUSH|S9-STORE|ZOOM|PAGEERR|AD-SEED-PATCH file)/.test(l)).slice(0, 80).forEach(l => out.push(l));
    await br.close().catch(() => {}); server.close(); fs.rmSync(prof, { recursive: true, force: true });
  }
  const v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  S('§W_BIM_LINK_KERNEL_VERDICT ' + v + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(LOG, out.join('\n') + '\n');
  process.exit(v === 'PASS' ? 0 : 1);
})();
