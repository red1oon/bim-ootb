#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon  SPDX-License-Identifier: MIT
// W-KILLER-USE - the three front-door pages (PDF, Sheet history, File it) judged as a NEWCOMER would meet them: from the short address, with no file of
// their own, at phone and desktop width, and walking ACROSS the pages with what each one handed them. Implementing bim-compiler
// prompts/SHEET_FRONT_DOOR.md §16 - Witness: W-KILLER-USE. Each claim names the usability issue it exposes (see the spec). A FAIL is a finding.
// Run: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_killer_usability.js                      (this tree, served under /bim-ootb/)
//      USE_URL=https://red1oon.github.io/bim-ootb/ env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_killer_usability.js   (the deployed site)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
const PUP = require(process.env.USE_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer'));
const TB = path.join(ROOT, 'pdf/corpus/trial_balance_th.pdf');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.db': 'application/octet-stream', '.gz': 'application/gzip' };
const PAGES = [
  { name: 'PDF', short: 'pdf/', main: '#b-open' },
  { name: 'Sheet history', short: 'history/', main: 'label[for=file]' },
  { name: 'File it', short: 'file-it/', main: 'label[for=file]' }
];
const VIEWS = [{ id: 'desktop', vp: { width: 1280, height: 800 } }, { id: 'phone', vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }];

let judged = 0, failed = 0; const findings = [];
function claim(id, ok, measured) { judged++; if (!ok) { failed++; findings.push(id); } console.log('§USE-' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + measured); }

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (!u.startsWith('/bim-ootb/')) { r.writeHead(404); return r.end(); }
      u = u.slice(9); let f = path.join(ROOT, u);
      if (f.indexOf(ROOT) !== 0) { r.writeHead(403); return r.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { if (!u.endsWith('/')) { r.writeHead(301, { Location: '/bim-ootb' + u + '/' }); return r.end(); } f = path.join(f, 'index.html'); }
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function newPage(br, view, dl) {
  const p = await br.newPage(); await p.setViewport(view.vp);
  const errs = [], logs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); p.on('console', (m) => logs.push(m.text()));
  const cdp = await p.target().createCDPSession(); let bytes = 0;
  await cdp.send('Network.enable'); cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
  if (dl) await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }).catch(() => {});
  return { p, errs, logs, bytes: () => bytes, reset: () => { bytes = 0; } };
}
async function upload(p, trigger, file) { const [fc] = await Promise.all([p.waitForFileChooser({ timeout: 8000 }), p.click(trigger)]); await fc.accept([file]); }
async function waitFor(p, fn, arg, ms) { try { await p.waitForFunction(fn, { timeout: ms || 15000 }, arg); return true; } catch (e) { return false; } }
async function arrived(dir, re, ms) { for (let t = 0; t < (ms || 15000); t += 200) { const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => re.test(x) && !/\.crdownload$/.test(x)) : []; if (f.length) return path.join(dir, f[0]); await sleep(200); } return null; }

(async function () {
  const srv = process.env.USE_URL ? null : await serve();
  const B = process.env.USE_URL || ('http://127.0.0.1:' + srv.address().port + '/bim-ootb/');
  console.log('§USE-SITE ' + B + (process.env.USE_URL ? ' (LIVE)' : ' (local tree)'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuse_'));
  const br = await PUP.launch({ headless: 'new', userDataDir: path.join(tmp, 'profile'), args: ['--no-sandbox', '--disable-gpu'] });
  try {
    // ---- N1 / N2 / N3 / C: first visit, no file, both viewports ----
    for (const view of VIEWS) {
      for (const pg of PAGES) {
        const t = await newPage(br, view); const t0 = Date.now();
        await t.p.goto(B + pg.short, { waitUntil: 'networkidle2', timeout: 60000 });
        if (pg.name === 'File it') await waitFor(t.p, () => !/Loading/.test((document.getElementById('engine') || {}).textContent || ''), null, 60000);
        const ms = Date.now() - t0;
        const m = await t.p.evaluate((sel) => {
          const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const ctl = Array.from(document.querySelectorAll('button, a[href], input:not([type=file]):not([type=hidden]), label.filebtn, select')).filter(vis);
          const small = ctl.map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.placeholder || e.id || e.tagName).trim().slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 24 || x.h < 24);
          const sample = ctl.filter((e) => /sample|try it|example|demo file/i.test(e.textContent || '')).map((e) => e.textContent.trim());
          const main = document.querySelector(sel), mr = main && main.getBoundingClientRect();
          return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, ih: window.innerHeight, controls: ctl.length, small, sample, mainBottom: mr ? Math.round(mr.bottom) : null, mainVisible: !!main && vis(main) };
        }, pg.main);
        const tag = view.id + ' ' + pg.name;
        claim('N1 ' + tag, m.sample.length > 0, 'sample=' + JSON.stringify(m.sample));
        claim('N2 ' + tag, m.mainVisible && m.mainBottom != null && m.mainBottom <= m.ih, 'main=' + pg.main + ' bottom=' + m.mainBottom + ' screen=' + m.ih);
        if (view.id === 'phone') {
          claim('N3-fit ' + tag, m.sw <= m.iw, 'documentWidth=' + m.sw + ' window=' + m.iw);
          claim('N3-targets ' + tag, m.small.length === 0, m.small.length + ' of ' + m.controls + ' controls under 24x24: ' + JSON.stringify(m.small.slice(0, 8)));
        }
        if (pg.name === 'PDF' && m.sample.length) {
          await t.p.click('#b-sample');
          await waitFor(t.p, () => !document.getElementById('b-sheet').disabled, null, 20000); await t.p.click('#b-sheet');
          const ok = await waitFor(t.p, () => /adds up/.test(document.getElementById('verdict').textContent), null, 20000);
          claim('N1-works ' + tag, ok, 'sample opened and read: verdict="' + (await t.p.$eval('#verdict', (e) => e.textContent)).slice(0, 60) + '"');
        }
        if (pg.name === 'Sheet history' && m.sample.length) {
          const kept = await t.p.evaluate(() => { try { return localStorage.getItem('sheet_history_name'); } catch (e) { return 'n/a'; } });
          await t.p.click('#b-try');
          await waitFor(t.p, () => /3 stamps by two people/.test((document.getElementById('stamp-result') || {}).textContent || ''), null, 20000);
          const steps = await t.p.$$eval('#steps button[data-step]', (b) => b.length);
          const d5 = await t.p.$('#grid td[data-cell="D5"]'); if (d5) { if (view.id === 'phone') await d5.tap(); else await d5.click(); } await sleep(500);
          const story = await t.p.$$eval('#story-list li', (l) => l.map((x) => x.textContent.slice(0, 60)));
          const after = await t.p.evaluate(() => { try { return localStorage.getItem('sheet_history_name'); } catch (e) { return 'n/a'; } });
          claim('N1-works ' + tag, steps >= 3 && story.length >= 3 && after === kept, 'steps=' + steps + ' D5 story=' + JSON.stringify(story) + ' visitorNameKept=' + (after === kept));
        }
        console.log('§USE-COST ' + tag + ' bytes=' + t.bytes() + ' msToReady=' + ms + ' errors=' + t.errs.length + (t.errs.length ? ' ' + JSON.stringify(t.errs) : ''));
        await t.p.close();
      }
    }

    // ---- J1-J3 / J4: the user's path across the pages, per viewport ----
    for (const view of VIEWS) {
      const dl = path.join(tmp, 'dl_' + view.id); fs.mkdirSync(dl);
      const t = await newPage(br, view, dl), p = t.p, tag = view.id;
      // J4 PDF: not a PDF
      await p.goto(B + 'pdf/', { waitUntil: 'networkidle2', timeout: 60000 });
      const junk = path.join(tmp, 'notes_' + view.id + '.pdf'); fs.writeFileSync(junk, 'these are my notes, not a pdf');
      await upload(p, '#b-open', junk); await sleep(800);
      const st0 = await p.$eval('#stat', (e) => e.textContent);
      claim('J4-pdf ' + tag, /not a PDF/i.test(st0) && t.errs.length === 0, 'said="' + st0 + '" errors=' + t.errs.length);
      // J1 the PDF job
      await upload(p, '#b-open', TB);
      await waitFor(p, () => !document.getElementById('b-sheet').disabled, null, 20000);
      await p.click('#b-sheet');
      const add0 = await waitFor(p, () => /adds up/.test(document.getElementById('verdict').textContent), null, 20000);
      const v0 = await p.$eval('#verdict', (e) => e.textContent);
      const cell = async (a) => p.$eval('#grid td[data-a="' + a + '"]', (e) => e.textContent.trim()).catch(() => null);
      const edit = async (a, val) => {
        const sel = '#grid td[data-a="' + a + '"]';
        if (view.id === 'phone') await p.tap(sel); else await p.click(sel, { clickCount: 2 });
        const opened = await waitFor(p, (s) => !!document.querySelector(s + ' input'), sel, 5000);
        if (!opened) return false;
        await p.$eval(sel + ' input', (i) => { i.select(); }); await p.keyboard.type(val); await p.keyboard.press('Enter');
        return waitFor(p, (x) => { const td = document.querySelector(x[0]); return td && !td.querySelector('input') && td.textContent.trim() === x[1]; }, [sel, val], 10000);
      };
      const plus1 = (s) => { const n = Number(String(s).replace(/,/g, '')) + 1; return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      const before = { D10: await cell('D10'), F10: await cell('F10'), D28: await cell('D28'), F28: await cell('F28') };
      const e1 = await edit('D10', plus1(before.D10));
      const v1 = await p.$eval('#verdict', (e) => e.textContent);
      const e2 = await edit('F10', plus1(before.F10)), e3 = await edit('D28', plus1(before.D28)), e4 = await edit('F28', plus1(before.F28));
      const v2 = await p.$eval('#verdict', (e) => e.textContent);
      claim('J1-read ' + tag, add0, 'verdict="' + v0.slice(0, 90) + '"');
      claim('J1-edit-bites ' + tag, e1 && /does NOT add up/.test(v1) && /D28/.test(v1), (view.id === 'phone' ? 'tap' : 'double-click') + ' edited=' + e1 + ' verdict="' + v1.slice(0, 110) + '"');
      claim('J1-edit-consistent ' + tag, e2 && e3 && e4 && /adds up/.test(v2) && !/NOT/.test(v2), 'edits=' + [e2, e3, e4].join(',') + ' verdict="' + v2.slice(0, 110) + '"');
      await p.click('#b-pdf'); const fPdf = await arrived(dl, /\.pdf$/);
      await p.click('#b-xlsx'); const fX = await arrived(dl, /\.xlsx$/);
      claim('J1-downloads ' + tag, !!fPdf && !!fX, 'pdf=' + (fPdf ? path.basename(fPdf) + ' ' + fs.statSync(fPdf).size + 'B' : 'none') + ' xlsx=' + (fX ? path.basename(fX) + ' ' + fs.statSync(fX).size + 'B' : 'none'));
      // J2 on to Sheet history by the row, with the .xlsx the PDF page gave
      const [hl] = await p.$$('xpath/.//nav[@class="apps"]//a[text()="Sheet history"]');
      if (hl) await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), hl.click()]);
      claim('J2-row ' + tag, !!hl && /history\.html/.test(p.url()), 'landed=' + p.url().slice(B.length));
      if (fX) {
        await p.$eval('#file', (i) => { i.value = ''; }).catch(() => {});
        await upload(p, 'label[for=file]', fX);
        await waitFor(p, () => /History:|no history|edited by hand|could not/.test(document.getElementById('status').textContent), null, 15000);
        const hs = await p.$eval('#status', (e) => e.textContent);
        claim('J2-recognised ' + tag, /History: \d+ (entry|entries), verified/.test(hs), 'status="' + hs.slice(0, 140) + '"');
        const td = await p.$$('#grid td[data-cell="D10"]');
        if (td.length) { if (view.id === 'phone') await td[0].tap(); else await td[0].click(); }
        await sleep(600);
        const story = await p.$$eval('#story-list li', (l) => l.map((x) => x.textContent.slice(0, 70)));
        claim('J2-story ' + tag, story.length >= 2, 'D10 cells=' + td.length + ' story=' + JSON.stringify(story));
        const sb = await p.$eval('#b-stamp', (b) => b.disabled);
        const pend = await p.$$eval('#pending li', (l) => l.map((x) => x.textContent.slice(0, 80)));
        claim('J2-no-phantom ' + tag, pend.length === 0, 'opened straight from the PDF page, the page lists ' + pend.length + ' changes nobody made: ' + JSON.stringify(pend) + ' stampDisabled=' + sb);
      }
      // J3 on to File it by the row, with the same file
      const [fl] = await p.$$('xpath/.//nav[@class="apps"]//a[text()="File it"]');
      if (fl) await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }), fl.click()]);
      await waitFor(p, () => !/Loading/.test(document.getElementById('engine').textContent), null, 60000);
      if (fX) {
        await upload(p, 'label[for=file]', fX); await sleep(1200);
        const op = await p.$eval('#opened', (e) => e.textContent), can = await p.$eval('#b-file', (b) => !b.disabled);
        let vv = '';
        if (can) { await p.click('#b-file'); await waitFor(p, () => !/Working/.test(document.getElementById('verdict').textContent), null, 30000); vv = await p.$eval('#verdict', (e) => e.textContent); }
        const said = op + ' | ' + vv;
        claim('J3-refused-in-words ' + tag, /sample|mark|_door_tags|invoice cells/i.test(said) && t.errs.length === 0, 'fileItEnabled=' + can + ' said="' + said.slice(0, 220) + '"');
      }
      await p.click('#b-sample'); await sleep(1500);
      await waitFor(p, () => !document.getElementById('b-file').disabled, null, 15000);
      await p.click('#b-file');
      await waitFor(p, () => !/Working/.test(document.getElementById('verdict').textContent) && document.getElementById('verdict').dataset.verdict, null, 60000);
      const fv = await p.$eval('#verdict', (e) => e.dataset.verdict + ': ' + e.textContent), erp = await p.$eval('#b-erp', (a) => !a.hidden);
      claim('J3-sample-files ' + tag, /^FILED/.test(fv) && erp, 'verdict="' + fv.slice(0, 120) + '" openInErp=' + erp);
      console.log('§USE-ERRORS ' + tag + ' pageErrors=' + t.errs.length + (t.errs.length ? ' ' + JSON.stringify(t.errs.slice(0, 3)) : ''));
      await p.close();
    }
  } catch (e) { failed++; console.log('§USE-ABORT ' + (e && e.stack || e).toString().slice(0, 400)); }
  await br.close(); if (srv) srv.close();
  const verdict = judged === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  console.log('§USE-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + (findings.length ? ' findings=' + JSON.stringify(findings) : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
