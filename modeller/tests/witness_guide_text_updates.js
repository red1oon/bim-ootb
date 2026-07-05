#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GUIDE-TEXT-UPDATES scope
 * SCOPE: prompts/SCALE_AND_UX_SWEEP.md §3.1 (green/orange ctrl+click discoverability) + §2 (Teams v1 scope
 * decision — settled: ship same-tab-multi-profile as an honestly-labeled narrower v1). Both land as real text
 * in the SAME in-app Modeller guide panel (#b-guide → #m-guide-panel) PR #661 already touched — this proves
 * the text actually RENDERS in the live DOM (not just present in the source), and that it doesn't reintroduce
 * the Teams/HBA confusion #661 fixed (that sentence must still be present verbatim).
 *
 * CLAIM G1: guide panel opens and contains the ctrl+click green/orange opt-out sentence (3D Grid section).
 * CLAIM G2: guide panel contains the Teams v1 same-profile-only cross-device caveat (Teams section).
 * CLAIM G3: the pre-existing Teams-vs-HBA disambiguation sentence (#661) is still present, untouched.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  console.log('═══ W-GUIDE-TEXT-UPDATES — real in-app guide panel content ═══');

  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true', { timeout: 30000 });
  await pg.click('#b-guide');
  await sleep(200);
  const html = await pg.evaluate(() => { const p = document.getElementById('m-guide-panel'); return p ? p.innerHTML : null; });

  chk('G0 guide panel opened', !!html, 'panelExists=' + !!html);
  chk('G1 ctrl+click green/orange opt-out sentence present (§3.1 discoverability)',
    !!html && /Ctrl\/Cmd\+click any tinted element/.test(html) && /turns green/.test(html), 'found=' + (!!html && /Ctrl\/Cmd\+click/.test(html)));
  chk('G2 Teams v1 same-profile cross-device caveat present (§2 settled decision)',
    !!html && /same browser profile/.test(html) && /server relay, not yet built/.test(html), 'found=' + (!!html && /same browser profile/.test(html)));
  chk('G3 pre-existing #661 Teams-vs-HBA disambiguation sentence untouched',
    !!html && /a different feature from &quot;HBA&quot;|a different feature from "HBA"/.test(html) && /does not exist in the Modeller/.test(html),
    'found=' + (!!html && /does not exist in the Modeller/.test(html)));
  chk('NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close(); server.close();
  console.log('W-GUIDE-TEXT-UPDATES: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
