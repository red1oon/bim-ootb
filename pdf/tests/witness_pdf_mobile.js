#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon  SPDX-License-Identifier: MIT
// W-PDF-MOBILE - the PDF page on an emulated phone (390x844, DPR 3, touch, CPU 4x slower, first load on slow 4G), judged on real PDFs.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §17 - Witness: W-PDF-MOBILE. Claims M1-M4 (perf) and U1-U5 (what the user sees); each names its issue in the spec.
// PRIVACY: with PDFM_LIST the files are the owner's own: this witness prints NO name or path, only a number and measured traits.
// Run: env -u DBUS_SESSION_BUS_ADDRESS node pdf/tests/witness_pdf_mobile.js                         (the page's own corpus)
//      PDFM_LIST=<file: one path per line, optional TAB kind> env -u DBUS_SESSION_BUS_ADDRESS node pdf/tests/witness_pdf_mobile.js
//      PDFM_URL=https://red1oon.github.io/bim-ootb/pdf/ ...   (the deployed page instead of this tree)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const PUP = require(process.env.PDFM_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const SLOW4G = { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
const OPEN_MS = Number(process.env.PDFM_OPEN_MS || 180000);

function list() {
  if (!process.env.PDFM_LIST) return fs.readdirSync(path.join(ROOT, 'pdf/corpus')).filter((f) => /\.pdf$/.test(f)).map((f) => ({ p: path.join(ROOT, 'pdf/corpus', f), kind: 'corpus' }));
  return fs.readFileSync(process.env.PDFM_LIST, 'utf8').split('\n').filter(Boolean).map((l) => { const [p, kind] = l.split('\t'); return { p, kind: kind || 'file' }; });
}
function traits(p) {
  const info = cp.spawnSync('pdfinfo', [p], { encoding: 'utf8' }).stdout || '';
  const t = cp.spawnSync('pdftotext', ['-l', '1', '-raw', p, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
  return { bytes: fs.statSync(p).size, pages: Number((/Pages:\s+(\d+)/.exec(info) || [])[1] || 0), locked: /Encrypted:\s+yes/.test(info), chars1: t.replace(/\s/g, '').length, money1: (t.match(/\d[\d,]*\.\d\d\b/g) || []).length };
}
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(ROOT, u);
      if (f.indexOf(ROOT) !== 0) { r.writeHead(403); return r.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

let judged = 0, failed = 0; const fails = [];
function claim(id, ok, measured) { judged++; if (!ok) { failed++; fails.push(id); } console.log('  §PDFM-' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + measured); }

async function phonePage(br, slowNet) {
  const ctx = await br.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport(PHONE); await p.setUserAgent(UA);
  const cdp = await p.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await cdp.send('Network.enable'); let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
  if (slowNet) await cdp.send('Network.emulateNetworkConditions', SLOW4G);
  const logs = [], errs = []; p.on('console', (m) => logs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.evaluateOnNewDocument(() => { window.__lt = { n: 0, ms: 0 }; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lt.n++; window.__lt.ms += e.duration; })).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no longtask API */ } });
  return { ctx, p, cdp, logs, errs, bytes: () => bytes };
}
// a thumb taps where the button IS: page.tap() first scrolls the element into view, which moves the window under a sticky toolbar (seen: page 3 -> 2)
async function thumb(p, sel) { const r = await p.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); await p.touchscreen.tap(r.x, r.y); }
async function heapMB(cdp) { const m = await cdp.send('Performance.getMetrics').catch(() => null); const h = m && m.metrics.find((x) => x.name === 'JSHeapUsedSize'); return h ? Math.round(h.value / 1048576) : -1; }
async function screen(p) {
  return p.evaluate(() => {
    const ih = innerHeight, whole = (r) => r.top >= 0 && r.bottom <= ih && r.height > 0, vis = (r) => Math.max(0, Math.min(r.bottom, ih) - Math.max(r.top, 0));
    const pg1 = document.querySelector('.pg[data-p="1"]'), hdr = document.querySelector('header'), v = document.getElementById('verdict');
    const ctl = Array.from(document.querySelectorAll('header button, header input, header a, nav a, #sheet button, #hist-ask input, #hist-ask button')).filter((e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; });
    const small = ctl.map((e) => { const r = e.getBoundingClientRect(); return (e.id || e.textContent.trim().slice(0, 12)) + ':' + Math.round(r.width) + 'x' + Math.round(r.height); }).filter((x) => /:(\d+)x(\d+)$/.exec(x).slice(1).some((n) => Number(n) < 24));
    const vr = v && v.getBoundingClientRect();
    return { docShare: pg1 ? Math.round(100 * vis(pg1.getBoundingClientRect()) / ih) : 0, docWhole: !!pg1 && whole(pg1.getBoundingClientRect()), header: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
      verdictSeen: !!vr && vr.height > 0 && vr.top >= 0 && vr.bottom <= ih, verdictTop: vr ? Math.round(vr.top) : null, sw: document.documentElement.scrollWidth, small,
      canvases: document.querySelectorAll('.pg canvas').length, stat: (document.getElementById('stat') || {}).textContent || '', lt: window.__lt };
  });
}

(async function () {
  const srv = process.env.PDFM_URL ? null : await serve();
  const URL0 = process.env.PDFM_URL || ('http://127.0.0.1:' + srv.address().port + '/pdf/');
  const files = list();
  console.log('§PDFM-SITE ' + (process.env.PDFM_URL ? 'LIVE ' + URL0 : 'local tree') + ' files=' + files.length + ' source=' + (process.env.PDFM_LIST ? 'PDFM_LIST (names withheld)' : 'pdf/corpus'));
  const br = await PUP.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'] });
  try {
    // M4 + U2 (empty page): first visit on slow 4G, empty cache
    const f0 = await phonePage(br, true), t0 = Date.now();
    await f0.p.goto(URL0, { waitUntil: 'load', timeout: 120000 }); await f0.p.waitForFunction(() => document.getElementById('b-open') && !document.getElementById('b-open').disabled, { timeout: 60000 });
    const ms0 = Date.now() - t0, s0 = await screen(f0.p);
    console.log('§PDFM-FIRSTVISIT bytes=' + f0.bytes() + ' msToUsable=' + ms0 + ' net=slow4G cpu=4x');
    claim('U2-empty', s0.header <= 100, 'header=' + s0.header + 'px');
    claim('U4-empty', s0.sw <= 390 && !s0.small.length, 'documentWidth=' + s0.sw + ' small=' + JSON.stringify(s0.small));
    await f0.ctx.close();

    for (let i = 0; i < files.length; i++) {
      const F = files[i], n = i + 1, T = traits(F.p), big = T.bytes > 10 * 1024 * 1024;
      const tag = 'n=' + n + ' kind=' + F.kind + ' bytes=' + T.bytes + ' pages=' + T.pages + ' chars1=' + T.chars1 + ' money1=' + T.money1 + (T.locked ? ' locked' : '');
      console.log('§PDFM-FILE ' + tag);
      const w = await phonePage(br, false);
      try {
        await w.p.goto(URL0, { waitUntil: 'load', timeout: 60000 });
        await w.p.waitForFunction(() => window.PdfPage || document.getElementById('b-open'), { timeout: 30000 });
        const from = w.logs.length; let peak = await heapMB(w.cdp);
        const sampler = setInterval(async () => { const h = await heapMB(w.cdp); if (h > peak) peak = h; }, 500);
        const [fc] = await Promise.all([w.p.waitForFileChooser({ timeout: 10000 }), w.p.click('#b-open')]);
        const ta = Date.now(); await fc.accept([F.p]);
        // page 1 on screen is timed on its own: the page may still be reading the text (§17.1 F2)
        let opened = null, firstPaint = null;
        for (let t = 0; t < OPEN_MS && !opened; t += 50) {
          opened = w.logs.slice(from).find((l) => /^§PDFED-OPEN /.test(l));
          if (firstPaint == null && await w.p.$('.pg[data-p="1"][data-drawn="1"]').catch(() => null)) firstPaint = Date.now() - ta;
          if (!opened) await sleep(50);
        }
        const okOpen = !!opened && /ok=true/.test(opened);
        if (okOpen && firstPaint == null) { const got = await w.p.waitForFunction(() => document.querySelector('.pg[data-p="1"][data-drawn="1"]'), { timeout: 60000 }).then(() => true, () => false); if (got) firstPaint = Date.now() - ta; }
        const textAllMs = opened ? Date.now() - ta : null;
        const openMs = opened ? Number((/ ms=(\d+)/.exec(opened) || [])[1]) : null;
        await sleep(800); const s1 = await screen(w.p), heapOpen = await heapMB(w.cdp);
        console.log('  §PDFM-OPEN n=' + n + ' opened=' + (opened ? opened.replace(/file="[^"]*"/, 'file=<withheld>').slice(0, 140) : 'NOT within ' + OPEN_MS + 'ms') + ' firstPagePaintedMs=' + firstPaint + ' allTextReadMs~' + textAllMs + ' canvases=' + s1.canvases + ' heapMB=' + heapOpen + ' longTasks=' + s1.lt.n + '/' + Math.round(s1.lt.ms) + 'ms');
        // stated, not judged (SHEET_FRONT_DOOR §18.5): how much of page 1 the edit layer offers on this file; the layer line carries no file name
        const lay = w.logs.slice(from).find((l) => /^§EDSHEET-LAYER/.test(l)); if (okOpen) console.log('  §PDFM-LAYER n=' + n + ' ' + (lay ? lay.replace(/^§EDSHEET-LAYER /, '').replace(/ heapMB=.*$/, '') : 'no layer line'));
        if (T.locked && !okOpen) { claim('U5-locked n=' + n, /locked|password/i.test(s1.stat) && !w.errs.length, 'said="' + s1.stat.slice(0, 60) + '"'); }
        else if (!okOpen) { claim('U5-refused n=' + n, !!opened && /named=/.test(opened) && !w.errs.length, 'said="' + s1.stat.slice(0, 80) + '"'); }
        else {
          if (!big) claim('M1 n=' + n, firstPaint != null && firstPaint <= 3000, 'firstPagePaintedMs=' + firstPaint + ' (openMs=' + openMs + ')');
          else console.log('  §PDFM-M1-STATED n=' + n + ' firstPagePaintedMs=' + firstPaint + ' openMs=' + openMs + ' (over 10 MB: stated, not judged)');
          claim('U1 n=' + n, s1.docShare >= 50 || s1.docWhole, 'page 1 covers ' + s1.docShare + '% of the first screen, wholly on it: ' + s1.docWhole);
          claim('U2 n=' + n, s1.header <= 100, 'header=' + s1.header + 'px');
          // scroll to the end the way a thumb would: whatever scrolls
          await w.p.evaluate(() => { const h = document.getElementById('pages'); h.scrollTop = h.scrollHeight; window.scrollTo(0, document.documentElement.scrollHeight); });
          await sleep(2500); const s2 = await screen(w.p);
          const reach = await w.p.$eval('#b-sheet', (e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= innerHeight && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) !== null && e.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); });
          if (T.pages > 1) claim('U7 n=' + n, reach, 'scrolled to the end, the Sheet button is ' + (reach ? 'on screen and tappable' : 'OFF screen'));
          claim('M2 n=' + n, s1.canvases <= 6 && s2.canvases <= 6, 'canvasesAlive afterOpen=' + s1.canvases + ' afterScrollToEnd=' + s2.canvases + ' of ' + T.pages + ' pages; peakHeapMB=' + peak);
          await w.p.evaluate(() => { const h = document.getElementById('pages'); h.scrollTop = 0; window.scrollTo(0, 0); }); await sleep(600);
          await w.p.waitForFunction(() => !document.getElementById('b-sheet').disabled, { timeout: 30000 }).catch(() => {});
          const k = T.pages >= 3 ? 3 : 1;   // U6: the page in the middle of the screen is the page read
          if (k > 1) { await w.p.evaluate((kk) => document.querySelector('.pg[data-p="' + kk + '"]').scrollIntoView({ block: 'center' }), k); await sleep(800); }
          if (T.chars1 > 0 && !(await w.p.$eval('#b-sheet', (b) => b.disabled))) {
            const fs0 = w.logs.length, tb = Date.now(); await thumb(w.p, '#b-sheet');
            const done = await w.p.waitForFunction(() => (document.getElementById('verdict').textContent || '').length > 0, { timeout: 60000 }).then(() => true, () => false);
            const rd = (/Page (\d+) /.exec(await w.p.$eval('#verdict', (e) => e.textContent)) || [])[1];
            if (k > 1) claim('U6 n=' + n, Number(rd) === k, 'page ' + k + ' in the middle of the screen; Read as sheet read page ' + rd);
            const s3 = await screen(w.p), vtext = await w.p.$eval('#verdict', (e) => e.textContent.slice(0, 70));
            console.log('  §PDFM-M3 n=' + n + ' readMs=' + (done ? Date.now() - tb : null) + ' verdict="' + vtext + '" readerLog=' + (w.logs.slice(fs0).find((l) => /^§SHEET_READER/.test(l)) || '').replace(/file="[^"]*"/, '').slice(0, 90));
            if (T.money1 >= 10) claim('U3 n=' + n, s3.verdictSeen, 'verdict top=' + s3.verdictTop + 'px of ' + PHONE.height + ' (seen without scrolling: ' + s3.verdictSeen + ')');
            claim('U4 n=' + n, s3.sw <= 390 && !s3.small.length, 'documentWidth=' + s3.sw + ' small=' + JSON.stringify(s3.small.slice(0, 6)));
          }
          if (!T.chars1) claim('U5-scan n=' + n, /no text|scan/i.test(s1.stat), 'said="' + s1.stat.replace(/^[^:]*:/, '<file>:').slice(0, 60) + '"');
        }
        clearInterval(sampler);
        if (w.errs.length) claim('U5-errors n=' + n, false, JSON.stringify(w.errs.slice(0, 2)));
      } catch (e) { claim('RUN n=' + n, false, String(e && e.message || e).slice(0, 160)); }
      await w.ctx.close();
    }
  } finally { await br.close(); if (srv) srv.close(); }
  const verdict = judged === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  console.log('§PDFM-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + (fails.length ? ' fails=' + JSON.stringify(fails) : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
