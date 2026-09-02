#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POS-PILLBAR (FABLE5_FOLLOWUP_2026-07-04 §Item 3). The POS pill-button bar was an
//   UNTESTED surface (flagged in the pills survey, never picked up). ISSUES THIS PROVES / DISPROVES:
//     1. The bar RENDERS: `.pos-pill-btn` is a CSS-only legacy of §P-7 — the LIVE bar is the §R2
//        #pos-top-bar (#pos-pill-payment + #pos-pill-scan) + the ⋯ dock (#pos-pill-import,
//        #pos-pill-receipt). Each button carries a real svg glyph + hover title; the receipt pill is
//        HIDDEN until a sale exists (its documented contract).
//     2. Each button's click fires the RIGHT action (whitebox §-log + DOM state, per
//        docs/TestArchitecture.md §Browser Testing): payment→§POS-FLOAT toggle, scan→§POS-SCAN
//        mode=open + .active overlay, import→§POS-IMPORT mode=open, empty-cart Pay→§POS-PAY refused
//        reason=empty-cart (the T6-guarded path refuses, never half-commits).
//     3. §PB-DECREE — the close-decree DECISION, stated: the ⋯ dock is a pill RAIL in miniature, so
//        the universal "no outside-tap close" decree (user decree 2026-07-02, witness_pill_canonical
//        W2) GOVERNS it despite not being PillBuilder-hosted — only the deliberate ⋯ tap toggles.
//        Pre-fix the dock closed on any outside pointerdown (the divergence this witness kills).
//        Lens overlays with their own ✕/Done (scan, receipt, float) are PANELS — decree-EXEMPT.
//   Playwright is used as the project allows: wiring/DOM checks; every VALUE assertion reads a §-log.
//   Fixture: erp/tests/fixtures/pos_host.html — REAL pos_lens.js/POSCore/KernelOps over a real sql.js
//   seed; only the page chrome (login/kanban) is absent.
//   Run: node erp/tests/witness_pos_pillbar.js 2>&1 | tee build/pos_pillbar.log — then READ the log.
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const REPO = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

let fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-POS-PILLBAR — the POS pill-button bar: renders · right actions · ⋯ decree ═══\n');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    fs.readFile(path.join(REPO, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await reqPw().chromium.launch();
  try {
    const logs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', m => logs.push(m.text()));
    await page.goto(`http://localhost:${port}/erp/tests/fixtures/pos_host.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction('window.__posFixtureReady === true || window.__posFixtureError', { timeout: 15000 });
    const fixErr = await page.evaluate('window.__posFixtureError || null');
    verdict(!fixErr, '§PB-RENDER fixture booted the REAL pos_lens over a real seed', fixErr || ('§POS-LIVE=' + logs.some(l => l.indexOf('§POS-LIVE open') === 0)));

    // ── §PB-RENDER — the live bar + dock render; glyph + title on every button; receipt starts hidden ──
    const bar = await page.evaluate(() => {
      const g = id => { const b = document.getElementById(id); return b && { svg: b.innerHTML.indexOf('<svg') >= 0, title: b.title || '', display: getComputedStyle(b).display }; };
      return { top: !!document.getElementById('pos-top-bar'), pay: g('pos-pill-payment'), scan: g('pos-pill-scan'),
               imp: g('pos-pill-import'), rcpt: g('pos-pill-receipt'), dock: !!document.getElementById('pos-dock') };
    });
    verdict(bar.top && bar.dock, '§PB-RENDER #pos-top-bar + ⋯ dock present', 'top=' + bar.top + ' dock=' + bar.dock);
    verdict(!!bar.pay && bar.pay.svg && /pay/i.test(bar.pay.title), '§PB-RENDER payment pill: svg glyph + hover title', 'title="' + (bar.pay && bar.pay.title) + '"');
    verdict(!!bar.scan && bar.scan.svg && /scan/i.test(bar.scan.title), '§PB-RENDER scan pill: svg glyph + hover title', 'title="' + (bar.scan && bar.scan.title) + '"');
    verdict(!!bar.imp && bar.imp.svg && /register/i.test(bar.imp.title), '§PB-RENDER import(+) pill: svg glyph + hover title', 'title="' + (bar.imp && bar.imp.title) + '"');
    verdict(!!bar.rcpt && bar.rcpt.display === 'none', '§PB-RENDER receipt pill HIDDEN until a sale (its contract)', 'display=' + (bar.rcpt && bar.rcpt.display));

    // ── §PB-ACTION — each click fires the RIGHT action (§-log is the value check) ──
    await page.click('#pos-pill-payment');
    await page.waitForTimeout(150);
    const floatOpen = await page.$eval('#pos-float-panel', n => n.classList.contains('open')).catch(() => 'absent');
    verdict(logs.some(l => l === '§POS-FLOAT toggle=open') && floatOpen === true,
      '§PB-ACTION payment → float pay panel opens (§POS-FLOAT toggle=open)', 'panelOpen=' + floatOpen);

    // empty-cart Pay refuses honestly (the RIGHT action wired, the T6 guard upstream of any commit)
    await page.click('#pos-float-tender');
    await page.waitForTimeout(100);
    verdict(logs.some(l => l === '§POS-PAY refused reason=empty-cart'),
      '§PB-ACTION Pay with empty cart → honest refusal, NO commit', '§POS-PAY refused reason=empty-cart logged');
    await page.click('#pos-pill-payment');                      // toggle the panel back shut

    await page.click('#pos-pill-scan');
    await page.waitForTimeout(150);
    const scanActive = await page.$eval('#pos-scan-overlay', n => n.classList.contains('active')).catch(() => 'absent');
    verdict(logs.some(l => l === '§POS-SCAN mode=open') && scanActive === true,
      '§PB-ACTION scan → scan overlay active (§POS-SCAN mode=open)', 'overlayActive=' + scanActive);
    await page.click('#pos-scan-close');                        // the overlay's own deliberate close (decree-exempt panel)
    await page.waitForTimeout(150);
    const scanClosed = await page.$eval('#pos-scan-overlay', n => !n.classList.contains('active'));
    verdict(scanClosed, '§PB-ACTION scan overlay closes via its OWN Done button (panel, not rail)', 'closed=' + scanClosed);

    // the import pill lives in the ⋯ dock — open the dock first (the deliberate tap)
    await page.click('#pos-dock-trigger');
    await page.waitForTimeout(150);
    await page.click('#pos-pill-import');
    await page.waitForTimeout(150);
    verdict(logs.some(l => l === '§POS-IMPORT mode=open'), '§PB-ACTION import(+) → register overlay (§POS-IMPORT mode=open)', 'logged');
    const impClose = await page.$('#pos-import-overlay .pos-import-close, #pos-import-close');
    if (impClose) { await impClose.click(); await page.waitForTimeout(100); }

    // ── §PB-DECREE — the ⋯ dock obeys the universal close decree: outside tap does NOT collapse ──
    const dockSel = '#pos-dock-items';
    const isOpen = () => page.$eval(dockSel, n => n.classList.contains('open'));
    if (!(await isOpen())) { await page.click('#pos-dock-trigger'); await page.waitForTimeout(150); }
    verdict(await isOpen(), '§PB-DECREE ⋯ tap opens the dock', 'open=true');
    await page.mouse.click(640, 200);                            // far from the dock
    await page.waitForTimeout(300);
    verdict(await isOpen(), '§PB-DECREE OUTSIDE tap does NOT collapse the dock (decree 2026-07-02, applied — was a divergence)', 'stillOpen=' + await isOpen());
    await page.click('#pos-dock-trigger');
    await page.waitForTimeout(150);
    verdict(!(await isOpen()), '§PB-DECREE only the deliberate ⋯ re-tap collapses', 'open=' + await isOpen());
    verdict(logs.filter(l => l.indexOf('§POS-DOCK toggle=') === 0).length >= 2, '§PB-DECREE dock toggles are §-logged (every toggle = a deliberate ⋯ tap)', logs.filter(l => l.indexOf('§POS-DOCK') === 0).join(' | '));
  } finally {
    await browser.close(); server.close();
  }
  console.log('\n' + (fails === 0 ? '✅ W-POS-PILLBAR ALL PASS' : '❌ W-POS-PILLBAR ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 W-POS-PILLBAR CRASH: ' + (e && e.stack || e)); process.exit(1); });
