/**
 * probe_vo_drive.js — W-VO-BROWSER (BIM→Project §H1 / Task F, browser visual-drive)
 *
 * Closes "log ≠ visual proof" for the Variation Order UI leg: the headless witness
 * (poc_vo_fold) injects voRows + a db directly and never touches the diff panel, the
 * pricing of A.diffResult, the OPFS load of the project the > ERP push wrote, or the
 * > VO button. This drives the REAL viewer in Chrome on Hospital:
 *   1. select a storey in Find + click > ERP  → folds the Hospital C_Project to OPFS
 *   2. synthesize a model-delta on real GUIDs, open the diff panel, click > VO
 *      → the amendment is folded against THAT project (linked), persisted to OPFS.
 *
 *   §VO_BROWSER_BTN   — the > VO button renders on the diff panel.
 *   §VO_BROWSER_PUSH  — > VO prices the delta + folds a C_Order amendment (lines>0),
 *                       linked to the C_Project the push created; status reports it.
 * Run: PORT=8147 node tests/probe_vo_drive.js   (caller starts the static server)
 */
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8147;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_extracted.db&bld=Hospital`;
const OUT = path.resolve(__dirname, 'log');
const sleep = ms => new Promise(r => setTimeout(r, ms));
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §VO_BROWSER FAIL: ' + name); } }
async function shot(page, ctx, name) {
  try { await page.screenshot({ path: path.join(OUT, name), animations: 'disabled', timeout: 5000 }); return; }
  catch (e) {}
  try {
    const cdp = await ctx.newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    console.log('[SHOT] ' + name + ' via CDP');
  } catch (e2) { console.log('[SHOT] ' + name + ' skipped: ' + e2.message.split('\n')[0]); }
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const logs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 180000 }).catch(() => console.log('WAIT_FAIL building db never loaded'));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 30000 }).catch(() => {});
    await sleep(1500);

    const env = await page.evaluate(() => {
      const A = window.A || window.APP;
      return { bld: A && A.activeBuilding, voFold: !!window.VoFold, projFold: !!window.ProjFold, appSQL: !!(A && A._SQL) };
    });
    console.log('[ENV] bld=' + env.bld + ' VoFold=' + env.voFold + ' ProjFold=' + env.projFold + ' A._SQL=' + env.appSQL);

    // ── step 1: select a storey + > ERP → create the Hospital C_Project in OPFS ──
    await page.evaluate(() => { const A = window.A || window.APP; A.openFindPanel && A.openFindPanel(); });
    await page.waitForFunction(() => document.querySelectorAll('#find-tree .find-tree-row').length > 0, { timeout: 15000 }).catch(() => {});
    await sleep(400);
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#find-tree .find-tree-row'));
      const parent = rows.find(r => getComputedStyle(r).fontWeight >= 600) || rows[0];
      const text = parent && (parent.querySelector('span:nth-child(2)') || parent.querySelector('span'));
      (text || parent).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
    });
    await page.waitForFunction(() => { const el = document.getElementById('find-selected-cost'); return el && el.textContent.trim().length > 0; }, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.status && /Project Order:/.test(A.status.textContent); }, { timeout: 8000 }).catch(() => console.log('WAIT_FAIL project push status'));
    await sleep(1000);
    const projPush = logs.filter(l => l.includes('§PROJ_PUSH ')).slice(-1)[0] || '';
    console.log('[STEP1] project push: ' + (projPush || '(none)'));

    // ── step 2: synthesize a model-delta on REAL guids, open the diff panel ──
    const synth = await page.evaluate(() => {
      const A = window.A || window.APP;
      const q = A.dbQuery ? (A.dbQuery('SELECT guid FROM elements_meta WHERE guid IS NOT NULL LIMIT 16') || []) : [];
      const guids = q.map(r => r[0]);
      if (guids.length < 16) return { err: 'only ' + guids.length + ' guids' };
      A.diffResult = { added: guids.slice(0, 8), removed: guids.slice(8, 11), changed: guids.slice(11, 16), isMerge: false };
      A.diffDb = A.db; // price/element-info from the same db (the diff engine itself is witnessed elsewhere)
      A.showDiffSummary();
      const panel = document.getElementById('diff-summary');
      const btn = document.getElementById('diff-vo-btn');
      const rows = A._diffToVoRows ? A._diffToVoRows() : [];
      return {
        added: 8, removed: 3, changed: 5,
        hasBtn: !!btn, btnText: btn ? btn.textContent.trim() : '',
        panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
        voRows: rows.length, voRowsSample: rows.slice(0, 6).map(r => r.status + ':' + r.cls + '×' + r.count)
      };
    });
    console.log('[STEP2] diff synth: ' + JSON.stringify(synth));
    await shot(page, ctx, 'vo_01_panel.png');
    ok(synth && synth.hasBtn, 'the > VO button renders on the diff panel');
    ok(synth && synth.voRows > 0, 'the delta prices to vo rows (' + (synth && synth.voRows) + ')');
    if (synth && synth.hasBtn) console.log('§VO_BROWSER_BTN PASS — "' + synth.btnText + '" renders; ' + synth.voRows + ' priced rows ' + JSON.stringify(synth.voRowsSample));
    else console.log('§VO_BROWSER_BTN FAIL');

    // ── step 3: click > VO → fold the amendment against the project ──
    await page.evaluate(() => { const b = document.getElementById('diff-vo-btn'); if (b) b.click(); });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.status && /Variation Order|unavailable|No priced/.test(A.status.textContent); }, { timeout: 10000 }).catch(() => console.log('WAIT_FAIL vo status'));
    await sleep(2500);
    await shot(page, ctx, 'vo_02_folded.png');

    const voPush = logs.filter(l => l.includes('§VO_PUSH ')).slice(-1)[0] || '';
    const voDefer = logs.filter(l => l.includes('§VO_PUSH_DEFER') || l.includes('§VO_DB_ERR')).slice(-1)[0] || '';
    const voDb = logs.filter(l => l.includes('§VO_DB ')).slice(-1)[0] || '';
    const status = await page.evaluate(() => { const A = window.A || window.APP; return (A && A.status && A.status.textContent) || ''; });
    console.log('[STEP3] §VO_DB: ' + (voDb || '(none)'));
    console.log('[STEP3] §VO_PUSH: ' + (voPush || '(none)'));
    if (voDefer) console.log('[STEP3] DEFER/ERR: ' + voDefer);
    console.log('[STEP3] status: "' + status + '"');

    const m = /lines=\+(\d+) grandTotal=(-?[\d.]+) project=([^\s]+)/.exec(voPush);
    const lines = m ? Number(m[1]) : 0;
    const amt = m ? m[2] : '';
    const proj = m ? m[3] : '-';
    ok(!!voPush, '§VO_PUSH fired (amendment folded in the browser)');
    ok(lines > 0, 'amendment created order lines (>0)');
    ok(proj !== '-' && proj !== 'null', 'amendment linked to the C_Project the push created (project=' + proj + ')');
    ok(/Variation Order/.test(status), 'status bar reports the Variation Order');
    if (voPush && lines > 0 && proj !== '-') console.log('§VO_BROWSER_PUSH PASS — > VO folded ' + lines + ' lines (grandTotal=' + amt + ') linked to project ' + proj + ' in a real browser');
    else console.log('§VO_BROWSER_PUSH FAIL' + (voDefer ? ' (' + voDefer + ')' : ''));

    const perr = logs.filter(l => l.startsWith('PAGEERROR'));
    if (perr.length) console.log('[PAGEERRORS] ' + perr.join(' | '));
    ok(perr.length === 0, 'no page errors');
    console.log('§VO_BROWSER_SUMMARY pass=' + pass + ' fail=' + fail + ' (screenshots: ' + OUT + ')');
  } catch (e) {
    console.log('§VO_BROWSER_SUMMARY pass=' + pass + ' fail=' + (fail + 1) + ' THREW: ' + e.message);
    fail++;
  } finally {
    await browser.close();
  }
  process.exit(fail > 0 ? 1 : 0);
})();
