// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the SHARED OVERLAY KIT + LUCIDE SWEEP (CONSISTENCY_FINISH.md §K-1/§K-2, W-OVERLAY-KIT).
//   PROVES the issue: "the import overlays (erp_picker + migrate_showme) read like a different author —
//   ~300 lines of byte-identical utilities duplicated, and unicode glyphs (🟧🟣⬇🔒✓✗⧉▶●…) where every
//   other surface renders Lucide line icons from icons.js (feedback_pill_icon_consistency)." After the fix:
//     §A KIT       — window.OverlayKit present; both overlays CONSUME it (no local _el/_ensureSql remain
//                    in either module source — static grep); kit ensureSql REUSES the page's window.SQL.
//     §B PICKER    — drive ErpPicker through install grid → iDempiere install-tenant panel → Odoo staged
//                    panel → chain fold result: ZERO icon-glyph codepoints in any rendered ep- DOM.
//     §C SHOWME    — step MigrateShowMe through all 5 STEPS: ZERO icon-glyph codepoints in ms- DOM.
//   Glyph scan = emoji blocks (U+1F000–1FAFF), dingbats/misc (U+2600–27BF: ✓✗), arrows-B (U+2B00–2BFF: ⬇⬑),
//   ⧉ (U+29C9), geometric (U+25A0–25FF: ●▶). Typography (× · — … Σ →) is NOT an icon and stays.
//   §-log first — READ tests/poc_overlay_kit.log before any conclusion.
// Run:  node tests/poc_overlay_kit.js 2>&1 | tee tests/poc_overlay_kit.log   (cwd = bim-ootb/erp)
'use strict';
let chromium;
try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); }
catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// in-page glyph scan of a container's rendered text+markup (icon glyphs only — typography excluded)
const scanGlyphs = (sel) => {
  const el = document.querySelector(sel); if (!el) return { err: 'no ' + sel };
  const s = el.innerHTML;
  const re = /[☀-➿⬀-⯿⧉■-◿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g;
  const hits = s.match(re) || [];
  return { hits: hits, n: hits.length };
};

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

(async () => {
  console.log('\n══ W-OVERLAY-KIT — one toolbox, Lucide-only import overlays ══\n');

  // ── §A KIT (static): duplication is GONE from both module sources ──
  // migrate_showme.js retired 2026-07-12 (TRILOGY_STALE_CODE_AUDIT — superseded by overlay_kit + about_diy)
  const pickerSrc = fs.readFileSync(path.join(ROOT, 'erp_picker.js'), 'utf8');
  ok(!/function _el\(/.test(pickerSrc),
    'no local _el() left in the overlay (kit-owned)');
  ok(!/function _ensureSql\(/.test(pickerSrc),
    'no local _ensureSql() left in the overlay (kit-owned)');
  ok(/OverlayKit/.test(pickerSrc), 'overlay consumes OverlayKit');
  console.log('§OVERLAY-KIT static dedup=clean consumers=1');

  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const since = (tag) => logs.filter(l => l.indexOf(tag) >= 0).slice(-1)[0] || '(no ' + tag + ')';

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  ok(await page.evaluate(() => !!(window.OverlayKit && window.OverlayKit.el && window.OverlayKit.ensureSql && window.OverlayKit.ico)),
    'window.OverlayKit live on idempiere.html (el + ensureSql + ico)');
  ok(await page.evaluate(() => window.OverlayKit.ico('check', 12).indexOf('<svg') === 0),
    'ico() renders an inline SVG from the verbatim ICONS registry');
  ok(await page.evaluate(() => window.OverlayKit.ico('no-such-icon') === ''),
    'ico() on an unknown name returns "" (never invented art)');

  // ── §B PICKER — every panel of the dialog scans clean ──
  await page.evaluate(() => window.ErpPicker.open({ mode: 'install' }));
  await page.waitForSelector('#ep-grid', { timeout: 5000 });
  let g = await page.evaluate(scanGlyphs, '#ep-overlay');
  console.log('§OVERLAY-KIT scan panel=grid glyphs=' + g.n + (g.n ? ' hits=' + JSON.stringify(g.hits) : ''));
  ok(g.n === 0, 'install grid renders ZERO icon glyphs (brand dots are CSS circles)');

  await page.click('#ep-c-idempiere');
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');                                  // → install-tenant panel (pre-verified shard CTA)
  await page.waitForSelector('#ep-install-go', { timeout: 5000 });
  g = await page.evaluate(scanGlyphs, '#ep-overlay');
  console.log('§OVERLAY-KIT scan panel=install-tenant glyphs=' + g.n + (g.n ? ' hits=' + JSON.stringify(g.hits) : ''));
  ok(g.n === 0, 'iDempiere install-tenant panel (lock banner + Install CTA) scans clean');

  await page.click('#ep-back');
  await page.waitForSelector('#ep-c-odoo', { timeout: 5000 });
  await page.click('#ep-c-odoo');
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');                                  // → staged Odoo panel
  await page.waitForSelector('#ep-chain', { state: 'attached', timeout: 5000 });
  g = await page.evaluate(scanGlyphs, '#ep-overlay');
  console.log('§OVERLAY-KIT scan panel=odoo-staged glyphs=' + g.n + (g.n ? ' hits=' + JSON.stringify(g.hits) : ''));
  ok(g.n === 0, 'Odoo staged panel (lock + download + copy + drop) scans clean');

  await page.setInputFiles('#ep-chain', path.join(ROOT, 'odoo_chain.json'));   // real agent output → fold
  await page.waitForSelector('.ep-tbl', { timeout: 8000 });
  g = await page.evaluate(scanGlyphs, '#ep-overlay');
  console.log('§OVERLAY-KIT scan panel=fold-result glyphs=' + g.n + (g.n ? ' hits=' + JSON.stringify(g.hits) : ''));
  ok(g.n === 0, 'fold result (hop table + GL summary + verify line + Install CTA) scans clean');
  const sqlLog = since('§OVERLAY-KIT sql=');
  console.log('  ' + sqlLog);
  ok(/sql=reused/.test(sqlLog), 'kit ensureSql REUSED the page\'s booted sql.js (one WASM init per page)');
  await page.evaluate(() => window.ErpPicker.close());

  // ── §C SHOWME — all 5 steps scan clean ──
  await page.evaluate(() => window.MigrateShowMe.open());
  await page.waitForSelector('#ms-body', { timeout: 5000 });
  for (let i = 0; i < 5; i++) {
    if (i) await page.click('#ms-next');
    await page.waitForTimeout(150);
    g = await page.evaluate(scanGlyphs, '#ms-overlay');
    console.log('§OVERLAY-KIT scan panel=showme-step' + (i + 1) + ' glyphs=' + g.n + (g.n ? ' hits=' + JSON.stringify(g.hits) : ''));
    ok(g.n === 0, 'ShowMe step ' + (i + 1) + ' scans clean');
  }

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-OVERLAY-KIT PASS' : '🔴 W-OVERLAY-KIT FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — one shared toolbox, zero unicode icon glyphs across every import-overlay panel. pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
