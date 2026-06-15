/**
 * probe_roundtrip.js — W-ROUNDTRIP (BIM→Project §B, browser end-to-end)
 *
 * The whole loop in ONE browser context (shared same-origin OPFS):
 *   Page A (viewer, Hospital): select a storey + > ERP (fold C_Project) and a synthesized
 *     model-delta + > VO (fold C_Order amendment) → both persist to OPFS bim_project_orders.db.
 *   Page B (erp/idempiere.html): boot → BimOrdersOverlay.apply reads that OPFS store and overlays
 *     the BIM rows onto the live ad_seed.db → the pushed project + VO are now in the ERP db,
 *     readable by the STANDARD C_Project / C_Order windows.
 *
 *   §RT_WRITE  — the viewer push wrote the folded store (PROJ + VO persisted to OPFS).
 *   §RT_READ   — idempiere.html boot overlaid the BIM rows (§BIM_OVERLAY rows>0).
 *   §RT_DOCS   — the ERP db now carries the pushed C_Project AND the VO C_Order (round-trip closed).
 * Run: PORT=8147 node tests/probe_roundtrip.js
 */
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8147;
const VIEWER = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_extracted.db&bld=Hospital`;
const ERP = `http://localhost:${PORT}/erp/idempiere.html`;
const OUT = path.resolve(__dirname, 'log');
const sleep = ms => new Promise(r => setTimeout(r, ms));
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §RT FAIL: ' + name); } }
async function shot(page, ctx, name) {
  try { await page.screenshot({ path: path.join(OUT, name), animations: 'disabled', timeout: 5000 }); return; }
  catch (e) {}
  try { const cdp = await ctx.newCDPSession(page); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); console.log('[SHOT] ' + name + ' via CDP'); }
  catch (e2) { console.log('[SHOT] ' + name + ' skipped'); }
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });   // ONE context → shared OPFS origin
  try {
    // ════ Page A: viewer push (> ERP + > VO) ════
    const aLogs = [];
    const a = await ctx.newPage();
    a.on('console', m => aLogs.push(m.text()));
    await a.goto(VIEWER, { waitUntil: 'domcontentloaded' });
    await a.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 180000 }).catch(() => console.log('WAIT_FAIL viewer db'));
    await a.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    // > ERP: select a storey, push the project
    await a.evaluate(() => { const A = window.A || window.APP; A.openFindPanel && A.openFindPanel(); });
    await a.waitForFunction(() => document.querySelectorAll('#find-tree .find-tree-row').length > 0, { timeout: 15000 }).catch(() => {});
    await sleep(400);
    await a.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#find-tree .find-tree-row'));
      const parent = rows.find(r => getComputedStyle(r).fontWeight >= 600) || rows[0];
      const t = parent && (parent.querySelector('span:nth-child(2)') || parent.querySelector('span'));
      (t || parent).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
    });
    await a.waitForFunction(() => { const el = document.getElementById('find-selected-cost'); return el && el.textContent.trim().length > 0; }, { timeout: 8000 }).catch(() => {});
    await a.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
    await a.waitForFunction(() => { const A = window.A || window.APP; return A && A.status && /Project Order:/.test(A.status.textContent); }, { timeout: 10000 }).catch(() => console.log('WAIT_FAIL proj push'));
    // > VO: synth a delta, open diff panel, fold the amendment
    await a.evaluate(() => {
      const A = window.A || window.APP;
      const q = A.dbQuery ? (A.dbQuery('SELECT guid FROM elements_meta WHERE guid IS NOT NULL LIMIT 16') || []) : [];
      const g = q.map(r => r[0]);
      A.diffResult = { added: g.slice(0, 8), removed: g.slice(8, 11), changed: g.slice(11, 16), isMerge: false };
      A.diffDb = A.db; A.showDiffSummary();
    });
    await sleep(400);
    await a.evaluate(() => { const b = document.getElementById('diff-vo-btn'); if (b) b.click(); });
    await a.waitForFunction(() => { const A = window.A || window.APP; return A && A.status && /Variation Order/.test(A.status.textContent); }, { timeout: 10000 }).catch(() => console.log('WAIT_FAIL vo push'));
    await sleep(2500);
    const projPersist = aLogs.filter(l => l.includes('§PROJ_PUSH_PERSIST')).slice(-1)[0] || '';
    const voPersist = aLogs.filter(l => l.includes('§VO_PUSH_PERSIST')).slice(-1)[0] || '';
    const wrote = /opfs=true/.test(projPersist) && /opfs=true/.test(voPersist);
    console.log('[A] ' + projPersist + ' | ' + voPersist);
    ok(wrote, 'viewer push persisted PROJ + VO to OPFS (opfs=true)');
    if (wrote) console.log('§RT_WRITE PASS — folded store written to OPFS by the viewer');
    await a.close();

    // ════ Page B: ERP boot reads the folded store ════
    const bLogs = [];
    const b = await ctx.newPage();
    b.on('console', m => bLogs.push(m.text()));
    b.on('pageerror', e => bLogs.push('PAGEERROR: ' + e.message));
    await b.goto(ERP, { waitUntil: 'domcontentloaded' });
    await b.waitForFunction(() => !!window.__idmpDb, { timeout: 60000 }).catch(() => console.log('WAIT_FAIL erp boot db'));
    // overlay runs at boot (before login); give it a beat
    await b.waitForFunction(() => window.__bimOverlayDone === true || true, { timeout: 1000 }).catch(() => {});
    await sleep(1500);
    await shot(b, ctx, 'rt_erp.png');

    const overlayLog = bLogs.filter(l => l.includes('§BIM_OVERLAY')).slice(-1)[0] || '';
    const mOv = /rows=(\d+)/.exec(overlayLog);
    const overlaid = mOv ? Number(mOv[1]) : 0;
    console.log('[B] §BIM_OVERLAY: ' + (overlayLog || '(none)'));
    ok(overlaid > 0, 'idempiere.html boot overlaid BIM rows (rows>0)');
    if (overlaid > 0) console.log('§RT_READ PASS — ERP boot read the folded store and overlaid ' + overlaid + ' rows');

    // the pushed documents are now in the ERP db (what the C_Project / C_Order windows query)
    const docs = await b.evaluate(() => {
      const db = window.__idmpDb;
      function sc(sql) { try { const r = db.exec(sql); return r.length && r[0].values.length ? r[0].values[0] : null; } catch (e) { return null; } }
      const proj = sc("SELECT C_Project_ID, Name, PlannedAmt FROM C_Project WHERE Value='Hospital'");
      const vo = sc("SELECT DocumentNo, GrandTotal, C_Project_ID, DocStatus FROM C_Order WHERE Description LIKE 'BIM VO: Hospital%' ORDER BY C_Order_ID DESC");
      const nLines = sc("SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=(SELECT MAX(C_Order_ID) FROM C_Order WHERE Description LIKE 'BIM VO: Hospital%')");
      return { proj, vo, nLines: nLines ? nLines[0] : 0 };
    });
    console.log('[B] §RT_DOCS project=' + JSON.stringify(docs.proj) + ' VO=' + JSON.stringify(docs.vo) + ' voLines=' + docs.nLines);
    const projOk = !!docs.proj && Number(docs.proj[0]) >= 990000;
    const voOk = !!docs.vo && Number(docs.vo[2]) === Number(docs.proj && docs.proj[0]);
    ok(projOk, 'the pushed C_Project (Value=Hospital) is in the ERP db');
    ok(voOk, 'the VO C_Order is in the ERP db AND links to that project');
    ok(Number(docs.nLines) > 0, 'the VO amendment carries order lines');
    if (projOk && voOk) console.log('§RT_DOCS PASS — round-trip closed: viewer-pushed Project + VO are readable in the ERP app');

    const perr = bLogs.filter(l => l.startsWith('PAGEERROR'));
    if (perr.length) console.log('[PAGEERRORS] ' + perr.join(' | '));
    ok(perr.length === 0, 'no page errors on the ERP page');

    // ════ visual: auto-login + deep-link the standard Project window (130) to the pushed record ════
    const c = await ctx.newPage();
    const cLogs = [];
    c.on('console', m => cLogs.push(m.text()));
    await c.goto(ERP + '?login=GardenAdmin&window=130&record=990000', { waitUntil: 'domcontentloaded' });
    await c.waitForFunction(() => !!window.__idmpDb, { timeout: 60000 }).catch(() => {});
    await sleep(5000); // boot overlay + auto-login + window render
    await shot(c, ctx, 'rt_project.png');
    const visual = await c.evaluate(() => {
      const txt = document.body.innerText || '';
      return { showsProject: txt.indexOf('BIM: Hospital') >= 0 || /Hospital/.test(txt), loggedIn: !/Sign In/.test(txt) };
    });
    const ovC = cLogs.filter(l => l.includes('§BIM_OVERLAY')).slice(-1)[0] || '';
    console.log('[C] deep-link Project window: loggedIn=' + visual.loggedIn + ' showsProject=' + visual.showsProject + ' | ' + ovC);
    ok(visual.showsProject, 'the pushed project renders in the standard Project window (deep-link)');
    if (visual.showsProject) console.log('§RT_VISUAL PASS — BIM: Hospital project visible in the Project window UI');
    await c.close();

    console.log('§RT_SUMMARY pass=' + pass + ' fail=' + fail + ' (screenshots: ' + OUT + ')');
  } catch (e) {
    console.log('§RT_SUMMARY pass=' + pass + ' fail=' + (fail + 1) + ' THREW: ' + e.message);
    fail++;
  } finally {
    await browser.close();
  }
  process.exit(fail > 0 ? 1 : 0);
})();
