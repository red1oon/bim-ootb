/**
 * probe_bim2proj.js — W-PROJ-BROWSER (BIM→Project Tasks A+C, browser visual-drive)
 *
 * Closes the "log ≠ visual proof" gap: the headless witnesses (poc_find_cost,
 * poc_proj_push) inject a sql.js db directly and never exercise the REAL viewer
 * UI path. This drives the deployed viewer in Chrome on Duplex and proves, in a
 * real browser, the two user-facing claims — naming the issue each step proves:
 *
 *   §PROJ_BROWSER_COST  — Task A: tapping a storey in Find renders the indicative
 *                         5D cost in #find-selected-cost (currency + number > 0).
 *   §PROJ_BROWSER_PUSH  — Task C: clicking "› ERP" (#find-erp-btn) folds the
 *                         selection into a C_Project (§PROJ_PUSH fires, lines>0,
 *                         plannedAmt>0) and the status bar reports the line count.
 *
 * Screenshots are saved as the visual artefact (log/ dir).
 * Run: PORT=8147 node tests/probe_bim2proj.js   (caller starts the static server)
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
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §PROJ_BROWSER FAIL: ' + name); } }
async function shot(page, ctx, name) { // screenshots are artifacts, never fatal
  try { await page.screenshot({ path: path.join(OUT, name), animations: 'disabled', timeout: 5000 }); return; }
  catch (e) { /* Playwright waits on document.fonts.ready, which can hang under swiftshader — fall back to raw CDP capture */ }
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

    // ── building loaded (meta db carries no geometry blobs → meshCache may stay empty;
    //    cost + push only need A.db, so we wait on the db, not on meshes) ─────────────
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding;
    }, { timeout: 180000 }).catch(() => console.log('WAIT_FAIL building db never loaded'));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 30000 }).catch(() => {});
    await sleep(1500);

    // engine globals the push depends on (records what the REAL browser has)
    const env = await page.evaluate(() => {
      const A = window.A || window.APP;
      return {
        bld: A && A.activeBuilding,
        projFold: !!window.ProjFold,
        winSQL: !!window.SQL, winSQLCached: !!window._SQL_CACHED, appSQL: !!(A && A._SQL),
        bigDecimal: typeof BigDecimal !== 'undefined' || !!window.BigDecimal,
      };
    });
    console.log('[ENV] bld=' + env.bld + ' ProjFold=' + env.projFold + ' window.SQL=' + env.winSQL +
      ' _SQL_CACHED=' + env.winSQLCached + ' A._SQL=' + env.appSQL + ' BigDecimal=' + env.bigDecimal);

    // ── open Find, tap the first storey (parent) row ────────────────────
    await page.evaluate(() => { const A = window.A || window.APP; A.openFindPanel && A.openFindPanel(); });
    await page.waitForFunction(() => document.querySelectorAll('#find-tree .find-tree-row').length > 0, { timeout: 15000 })
      .catch(() => console.log('WAIT_FAIL no storey rows'));
    await sleep(400);

    const tapped = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#find-tree .find-tree-row'));
      // parent (level-0) rows carry font-weight 600; fall back to the first row
      const parent = rows.find(r => getComputedStyle(r).fontWeight === '600' || getComputedStyle(r).fontWeight >= 600) || rows[0];
      if (!parent) return null;
      const text = parent.querySelector('span:nth-child(2)') || parent.querySelector('span');
      const label = text ? text.textContent : '?';
      (text || parent).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
      return label;
    });
    console.log('[DRIVE] tapped storey row label="' + tapped + '"');

    // ── §PROJ_BROWSER_COST: the cost span renders ───────────────────────
    await page.waitForFunction(() => {
      const el = document.getElementById('find-selected-cost');
      return el && el.textContent && el.textContent.trim().length > 0;
    }, { timeout: 8000 }).catch(() => console.log('WAIT_FAIL cost span never populated'));

    const costState = await page.evaluate(() => {
      const bar = document.getElementById('find-selected');
      const el = document.getElementById('find-selected-cost');
      return {
        barVisible: bar ? getComputedStyle(bar).display !== 'none' : false,
        costText: el ? el.textContent.trim() : '',
        costTitle: el ? el.title : '',
      };
    });
    // currency prefix may be a symbol ($) or letters (RM/USD); parse the number robustly
    const costNum = Number(((costState.costText.match(/[\d,]+/) || ['0'])[0]).replace(/,/g, ''));
    await shot(page, ctx, 'bim2proj_01_cost.png');
    console.log('[COST] barVisible=' + costState.barVisible + ' costText="' + costState.costText +
      '" parsed=' + costNum + ' title="' + costState.costTitle + '"');
    ok(costState.barVisible, '#find-selected bar is visible after selection');
    ok(costState.costText.length > 0, 'cost span has text');
    ok(costNum > 0, 'rendered cost is a positive number');
    const findCostLog = logs.filter(l => l.includes('§FIND_COST ')).slice(-1)[0] || '';
    console.log('[COST] §FIND_COST log: ' + (findCostLog || '(none)'));

    // disciplines folded into this WBS-level selection (the reason to use Hospital) ──
    const discBreak = await page.evaluate((storey) => {
      const A = window.A || window.APP;
      if (!A || !A.dbQuery) return null;
      const rows = A.dbQuery('SELECT discipline, COUNT(*) FROM elements_meta WHERE storey=? GROUP BY discipline ORDER BY 2 DESC', [storey]) || [];
      return rows.map(r => (r[0] || '?') + ':' + r[1]);
    }, tapped);
    console.log('[DISC] storey "' + tapped + '" disciplines = ' + (discBreak ? discBreak.join('  ') : '(n/a)'));
    if (costState.barVisible && costNum > 0) console.log('§PROJ_BROWSER_COST PASS — bar renders ' + costState.costText + ' in a real browser');
    else console.log('§PROJ_BROWSER_COST FAIL — cost did not render (text="' + costState.costText + '")');

    // ── §PROJ_BROWSER_PUSH: › ERP folds the C_Project ───────────────────
    const beforeLen = logs.length;
    await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
    // wait for either the success log or a defer/error log
    await page.waitForFunction(() => {
      const s = document.getElementById('rp-status') || document.querySelector('#status, .status');
      return true; // we poll logs from node side; just give the async fold time
    }, { timeout: 1000 }).catch(() => {});
    await sleep(3500);

    const pushLogs = logs.slice(beforeLen);
    const pushLine = logs.filter(l => l.includes('§PROJ_PUSH ')).slice(-1)[0] || '';
    const deferLine = logs.filter(l => l.includes('§PROJ_PUSH_DEFER') || l.includes('§PROJ_PUSH_DBERR')).slice(-1)[0] || '';
    const statusText = await page.evaluate(() => {
      const A = window.A || window.APP;
      return (A && A.status && A.status.textContent) || '';
    });
    await shot(page, ctx, 'bim2proj_02_push.png');
    console.log('[PUSH] §PROJ_PUSH: ' + (pushLine || '(none)'));
    if (deferLine) console.log('[PUSH] DEFER/ERR: ' + deferLine);
    console.log('[PUSH] status bar text: "' + statusText + '"');

    const m = /lines=\+(\d+).*plannedAmt=([\d.]+)/.exec(pushLine);
    const lines = m ? Number(m[1]) : 0;
    const amt = m ? Number(m[2]) : 0;
    ok(!!pushLine, '§PROJ_PUSH fired (fold ran in the browser)');
    ok(lines > 0, 'fold created project lines (>0)');
    ok(amt > 0, 'fold planned amount > 0');
    ok(/Project Order:|lines/.test(statusText), 'status bar reports the fold');
    if (pushLine && lines > 0) console.log('§PROJ_BROWSER_PUSH PASS — › ERP folded ' + lines + ' lines, plannedAmt=' + amt + ' in a real browser');
    else console.log('§PROJ_BROWSER_PUSH FAIL — push did not fold' + (deferLine ? ' (' + deferLine + ')' : ''));

    const perr = logs.filter(l => l.startsWith('PAGEERROR'));
    if (perr.length) console.log('[PAGEERRORS] ' + perr.join(' | '));
    ok(perr.length === 0, 'no page errors');

    console.log('§PROJ_BROWSER_SUMMARY pass=' + pass + ' fail=' + fail + ' (screenshots: ' + OUT + ')');
  } catch (e) {
    console.log('§PROJ_BROWSER_SUMMARY pass=' + pass + ' fail=' + (fail + 1) + ' THREW: ' + e.message);
    fail++;
  } finally {
    await browser.close();
  }
  process.exit(fail > 0 ? 1 : 0);
})();
