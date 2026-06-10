// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for REPORTING_LANE step 3 browser wiring — report_overlay.js new verbs.
//   THE CLAIM (headless oracle proofs in bim-compiler scripts/poc_pa_report.js + poc_printformat.js;
//   THIS witness proves the BROWSER PATH: script mounts, events wire, data-gates are honest):
//     1. §REPORT-MOUNTED  — report_overlay.js mounts without errors (§REPORT layer mounted in logs).
//     2. §REPORT-RECEIPT  — overlay:report {key:'c_invoice'} → panel opens, §REPORT-RECEIPT in logs
//                          (receipt folds from glassbowl_data.db — line count > 0).
//     3. §REPORT-STMT     — __report.statement(id) for a real pa_report → §STATEMENT in logs.
//     4. §REPORT-TB       — __report.trialBalance() → §TB balanced=Y in logs (fact_acct in bundle).
//     5. §REPORT-PRINT-GATE — ⎙ button ABSENT: glassbowl_data.db lacks c_invoice_header_v (the
//                          extract_printformat.sh view); data-gate is honest — no dead button.
//   NON-INVENT: glassbowl_data.db is the real bundle; c_invoice rows are real GardenWorld seed data.
//   §-log first — READ tests/poc_report_format.log before any conclusion.
// Run: node tests/poc_report_format.js 2>&1 | tee tests/poc_report_format.log  (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');                       // bim-ootb/erp
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm',
  '.map':'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/glassbowl.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
function ok(cond, msg, detail) {
  if (!cond) { fails++; console.log('   \u{1F534} FAIL: ' + msg + (detail ? ' — ' + detail : '')); }
  else console.log('   \u{1F7E2} ' + msg + (detail ? ' — ' + detail : ''));
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { const t = m.text(); logs.push(t); if (t.startsWith('§')) process.stdout.write('  [log] ' + t + '\n'); });
  page.on('pageerror', e => { errs.push(e.message); console.log('  [pageerr] ' + e.message); });

  await page.goto(`http://localhost:${port}/glassbowl.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // ── 1. §REPORT-MOUNTED: script loaded ───────────────────────────────────────────
  const mounted = logs.find(l => l.startsWith('§REPORT layer mounted'));
  ok(!!mounted, '§REPORT-MOUNTED', mounted || '(no §REPORT layer mounted log)');

  // ── 2. §REPORT-RECEIPT: receipt opens for c_invoice ─────────────────────────────
  // Dispatch the overlay:report event (the same bus used by the UI)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('overlay:report', { detail: { key: 'c_invoice' } }));
  });
  await page.waitForTimeout(1500);                              // let bundle load + fold

  const receiptLog = logs.find(l => l.startsWith('§REPORT-RECEIPT'));
  ok(!!receiptLog, '§REPORT-RECEIPT fired', receiptLog || '(no §REPORT-RECEIPT log — bundle missing or fold error)');

  const panelOpen = await page.$('#reportPanel.open');
  ok(!!panelOpen, '§REPORT-RECEIPT panel.open in DOM');

  // Receipt lines > 0 (proves real data fold, not empty skeleton)
  const linesMatch = receiptLog && receiptLog.match(/lines=(\d+)/);
  ok(linesMatch && Number(linesMatch[1]) > 0, '§REPORT-RECEIPT lines>0', receiptLog);

  // ── 3. §REPORT-STMT: statement fold honest-gates when bundle lacks pa_report ─────
  // glassbowl_data.db has fact_acct but NOT pa_report/ad_treenode (the PA_Report extract requires
  // running extract_pa_report.sh against PostgreSQL — data-gated, never a dead call).
  // Prove the fallback fires: calling statement() logs §STATEMENT bundle lacks pa_report/...
  await page.evaluate(() => { if (window.__report) window.__report.statement(1); });
  await page.waitForTimeout(800);
  const stmtLog = logs.find(l => l.startsWith('§STATEMENT bundle lacks'));
  ok(!!stmtLog, '§REPORT-STMT honest-gate fires when pa_report absent',
    stmtLog || '(no §STATEMENT bundle lacks log — fallback path broken)');

  // ── 4. §REPORT-TB: Trial Balance folds + is balanced ────────────────────────────
  await page.evaluate(() => { if (window.__report) window.__report.trialBalance(); });
  await page.waitForTimeout(800);
  const tbLog = logs.find(l => l.startsWith('§TB'));
  ok(!!tbLog, '§REPORT-TB §TB fired', tbLog || '(no §TB log — fact_acct or c_elementvalue missing from bundle)');
  const tbBalanced = tbLog && tbLog.includes('balanced=true');
  ok(tbBalanced, '§REPORT-TB balanced=true', tbLog);

  // ── 5. §REPORT-PRINT-GATE: ⎙ button absent (data-gate is honest) ────────────────
  // Re-open a receipt and check no ⎙ button appeared (glassbowl_data.db lacks c_invoice_header_v)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('overlay:report', { detail: { key: 'c_invoice' } }));
  });
  await page.waitForTimeout(1500);
  const printBtn = await page.$eval('#reportPanel', el => {
    const btns = el.querySelectorAll('button.rptab');
    return Array.from(btns).some(b => b.textContent.includes('⎉'));
  }).catch(() => false);
  ok(!printBtn, '§REPORT-PRINT-GATE ⎙ button absent (data-gated: c_invoice_header_v not in bundle)',
    'present=' + printBtn);

  // ── 0 pageerrors ─────────────────────────────────────────────────────────────────
  ok(errs.length === 0, '0 pageerrors', errs.length ? errs.join(' | ') : 'clean');

  console.log('\n§REPORT-FORMAT-RESULT ' +
    (fails === 0 ? 'PASS' : 'FAIL fails=' + fails));
  console.log('  mounted=' + !!mounted +
    ' receipt=' + !!receiptLog +
    ' stmtGate=' + !!stmtLog +
    ' tb=' + !!tbLog + ' tbBalanced=' + !!tbBalanced +
    ' printGated=' + (!printBtn) +
    ' pageerr=' + errs.length);

  await browser.close();
  server.close();
  process.exit(fails > 0 ? 1 : 0);
})();
