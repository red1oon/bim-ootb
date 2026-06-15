/**
 * probe_fin_evm.js — W-FIN-EVM-LIVE (BIM→Project FINANCE §F4, browser visual-drive)
 *
 * Closes "log ≠ visual proof" for the PM control readout: the headless poc_fin_evm
 * injects a sql.js db; this drives the REAL viewer in Chrome, taps a storey in Find,
 * clicks "› ERP", and proves the control picture is computed on the live folded
 * project and surfaced to the user:
 *   §FIN_EVM_LIVE_CONTROL — §PROJ_CONTROL fires with original/revised contract sum +
 *                           PV/EV/AC/CPI/SPI computed in the browser.
 *   §FIN_EVM_LIVE_STATUS  — the status bar reports the contract sum to the user.
 *   §FIN_EVM_LIVE_HONEST  — a fresh push (nothing invoiced) → AC=0 + the honest note.
 * Run: PORT=8147 node tests/probe_fin_evm.js   (caller starts the static server)
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
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §FIN_EVM_LIVE FAIL: ' + name); } }
async function shot(page, ctx, name) {
  try { await page.screenshot({ path: path.join(OUT, name), animations: 'disabled', timeout: 5000 }); return; } catch (e) {}
  try { const cdp = await ctx.newCDPSession(page); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); } catch (e2) {}
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

    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 180000 })
      .catch(() => console.log('WAIT_FAIL building db never loaded'));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 30000 }).catch(() => {});
    await sleep(1500);

    const env = await page.evaluate(() => ({ projFold: !!window.ProjFold, projControl: !!window.ProjControl }));
    console.log('[ENV] ProjFold=' + env.projFold + ' ProjControl=' + env.projControl);
    ok(env.projControl, 'window.ProjControl loaded in the viewer');

    // open Find, tap a parent (storey) row
    await page.evaluate(() => { const A = window.A || window.APP; A.openFindPanel && A.openFindPanel(); });
    await page.waitForFunction(() => document.querySelectorAll('#find-tree .find-tree-row').length > 0, { timeout: 15000 })
      .catch(() => console.log('WAIT_FAIL no storey rows'));
    await sleep(400);
    const tapped = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#find-tree .find-tree-row'));
      const parent = rows.find(r => getComputedStyle(r).fontWeight >= 600) || rows[0];
      if (!parent) return null;
      const text = parent.querySelector('span:nth-child(2)') || parent.querySelector('span');
      (text || parent).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
      return text ? text.textContent : '?';
    });
    console.log('[DRIVE] tapped storey="' + tapped + '"');
    await page.waitForFunction(() => { const el = document.getElementById('find-selected-cost'); return el && el.textContent.trim().length > 0; }, { timeout: 8000 }).catch(() => {});

    // click › ERP → fold + control readout
    await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
    await sleep(4000);
    await shot(page, ctx, 'fin_evm_live.png');

    const ctrlLine = logs.filter(l => l.includes('§PROJ_CONTROL ')).slice(-1)[0] || '';
    const statusText = await page.evaluate(() => { const A = window.A || window.APP; return (A && A.status && A.status.textContent) || ''; });
    console.log('[CONTROL] ' + (ctrlLine || '(none)'));
    console.log('[STATUS] "' + statusText + '"');

    // §FIN_EVM_LIVE_CONTROL — the readout fired with real numbers
    const rev = (/revised=([\d.]+)/.exec(ctrlLine) || [])[1];
    const bac = (/bac=([\d.]+)/.exec(ctrlLine) || [])[1];
    const ac = (/\bac=([\d.]+)/.exec(ctrlLine) || [])[1];
    ok(!!ctrlLine, '§PROJ_CONTROL fired in the browser');
    ok(rev && Number(rev) > 0, 'revised contract sum > 0 (' + rev + ')');
    ok(bac && Number(bac) > 0, 'BAC > 0 (' + bac + ')');
    if (ctrlLine && Number(rev) > 0) console.log('§FIN_EVM_LIVE_CONTROL PASS — revised=' + rev + ' bac=' + bac + ' computed live');

    // §FIN_EVM_LIVE_STATUS — surfaced to the user
    ok(/contract/.test(statusText) && /[\d,]+/.test(statusText), 'status bar shows the contract sum');
    if (/contract/.test(statusText)) console.log('§FIN_EVM_LIVE_STATUS PASS — "' + statusText + '"');

    // §FIN_EVM_LIVE_HONEST — fresh push has no actuals → AC=0 + honest note
    ok(ac === '0', 'AC=0 on a fresh push (no fabricated actual)');
    ok(/note="AC=0/.test(ctrlLine), 'honest AC-undefined note present');
    if (ac === '0' && /note="AC=0/.test(ctrlLine)) console.log('§FIN_EVM_LIVE_HONEST PASS — AC=0, CPI undefined, note shown');

    const perr = logs.filter(l => l.startsWith('PAGEERROR'));
    if (perr.length) console.log('[PAGEERRORS] ' + perr.join(' | '));
    ok(perr.length === 0, 'no page errors');

    console.log('§FIN_EVM_LIVE_SUMMARY pass=' + pass + ' fail=' + fail);
    console.log('§FIN_EVM_LIVE ' + (fail === 0 ? 'PASS' : 'FAIL') + ' — control readout computed + surfaced live (screenshots: ' + OUT + ')');
  } catch (e) {
    console.log('§FIN_EVM_LIVE FAIL — ' + e.message);
    fail++;
  } finally {
    await browser.close();
  }
  process.exit(fail === 0 ? 0 : 1);
})();
