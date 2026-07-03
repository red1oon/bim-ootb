#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OLVIRT scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V3+§V4 (prompts/RESUME_MODELLER_POLISH3.md) — Outliner scale
 *   (windowed sibling lists + O(selection) pick restyle) and auto-expand-on-pick. Real production path
 *   (open Duplex from the chooser, real canvas mouse click), every claim a number read back from the live
 *   DOM + window.__olPickStats. Read the log after every run; exit code is not evidence.
 *
 * Issues under test (each was a real gap in the research spec):
 *   V1 WINDOWED      — with OL_CHUNK=20, a sibling list larger than the window renders ≤ cap rows + ONE
 *                      "… show N more" row, while the category header still reports the REAL leaf total
 *                      (bounded DOM ≠ lying about counts).
 *   V2 SHOW-MORE     — clicking the more-row opens exactly one more window (rendered rows grow, hidden shrink).
 *   V3 AUTO-EXPAND   — collapse the whole BOM-tree category, real-click an element in the CANVAS → its row is
 *                      auto-expanded (§OLEXPAND log), painted active, and present in the DOM (was: silent miss).
 *   V4 O(K)-PICK     — the pick restyle touches ≤ 4 rows (window.__olPickStats.restyled) while the tree renders
 *                      far more rows than that (was: querySelectorAll + rebind over EVERY row per pick).
 *   V5 NO-ERROR      — no pageerror across the whole sequence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404 ' + p); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§(OLPICK|OLEXPAND|OLWINDOW)/.test(t)) slog.push(t); });

  console.log('═══ W-E2E-OLVIRT — §V3/§V4 Outliner windowing + O(k) pick + auto-expand (real user, Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  await pg.evaluate(() => { window.OL_CHUNK = 20; });      // window-scoped test knob (spec §V4a) — set BEFORE the tree seeds
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

  // V1 — windowed: some sibling list exceeds OL_CHUNK=20 → a more-row exists; header shows the REAL total
  const win1 = await pg.evaluate(() => {
    const rows = document.querySelectorAll('[data-bnode]').length;
    const more = Array.from(document.querySelectorAll('[data-more]'));
    const T = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree ? window.BOMTreeOutliner._currentTree() : null;
    const realLeaves = T ? Object.keys(T.nodes).filter(k => T.nodes[k].kind === 'element').length : -1;
    const header = document.querySelector('[data-tcat="bomtree"]:not([data-bnode])');
    const headerN = header ? +(header.textContent.match(/\((\d+)\)/) || [0, -1])[1] : -1;
    return { rows, moreN: more.length, moreKey: more.length ? more[0].getAttribute('data-more') : null, realLeaves, headerN };
  });

  // V2 — click the first more-row → its window widens by exactly one chunk
  let win2 = null;
  if (win1.moreKey) {
    const before = await pg.evaluate(k => document.querySelectorAll('[data-bnode]').length, win1.moreKey);
    await pg.click('[data-more]'); await sleep(300);
    win2 = await pg.evaluate(b => {
      const after = document.querySelectorAll('[data-bnode]').length;
      return { before: b, after, grew: after - b };
    }, before);
  }

  // V3 — collapse the WHOLE BOM-tree category, then real-click an element in the canvas
  await pg.evaluate(() => {
    window.__e2e = {
      proj(x, y, z) { const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
        return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top, v.z]; },
      candidates() { const g = window.Bonsai.group(); const out = [];
        for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue;
          const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue;
          const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z);
          const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
          if (p[0] < r.left + 30 || p[0] > r.right - 30 || p[1] < r.top + 30 || p[1] > r.bottom - 30 || p[2] > 1) continue;
          const sz = new window.THREE.Vector3(); b.getSize(sz);
          out.push({ fid: m.userData.featureId, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z }); }
        out.sort((a, b) => b.vol - a.vol); return out.slice(0, 16); }
    };
    // collapse the bomtree CATEGORY header (its rows all disappear from the DOM — other tree
    // categories, e.g. the STR-walker tab, keep their own rows: scope the count to bomtree)
    const ol = window.Bonsai.outliner;
    ol._collapsed['tcat|bomtree'] = true; ol._paint();
    return document.querySelectorAll('[data-bnode][data-tcat="bomtree"]').length;
  });
  const collapsedRows = await pg.evaluate(() => document.querySelectorAll('[data-bnode][data-tcat="bomtree"]').length);
  const cands = await pg.evaluate(() => window.__e2e.candidates());
  let fid = null, expand = null;
  for (const c of cands) {
    await pg.mouse.click(c.sx, c.sy); await sleep(200);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1 && sel[0] === c.fid) { fid = c.fid; break; }
  }
  if (fid != null) {
    expand = await pg.evaluate(f => {
      const guid = (window.__arcGuidByFid || {})[f];
      const d = guid != null ? document.querySelector('[data-bnode="' + guid + '"]') : null;
      return { rows: document.querySelectorAll('[data-bnode]').length, rowFound: !!d,
        painted: d ? d.dataset.sel === 'p' : false, catOpen: !window.Bonsai.outliner._collapsed['tcat|bomtree'] };
    }, fid);
  }

  // V4 — O(k) restyle: pick again (tree now expanded, many rows) and read the instrumented stats
  let pickStats = null, renderedRows = 0;
  if (fid != null) {
    await pg.mouse.click(cands[0].sx, cands[0].sy); await sleep(200);
    pickStats = await pg.evaluate(() => window.__olPickStats || null);
    renderedRows = await pg.evaluate(() => document.querySelectorAll('[data-bnode],[data-fid]').length);
  }

  await br.close(); server.close();

  console.log('  §WIN rows=' + win1.rows + ' moreRows=' + win1.moreN + ' headerN=' + win1.headerN + ' realLeaves=' + win1.realLeaves);
  console.log('  §MORE ' + JSON.stringify(win2));
  console.log('  §EXPAND collapsedRows=' + collapsedRows + ' → ' + JSON.stringify(expand));
  console.log('  §PICKSTATS ' + JSON.stringify(pickStats) + ' renderedRows=' + renderedRows);
  slog.slice(0, 12).forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('V1 WINDOWED more-row present + header reports REAL total (' + win1.realLeaves + ')',
    win1.moreN >= 1 && win1.headerN === win1.realLeaves && win1.realLeaves > 20,
    'rows=' + win1.rows + ' header=' + win1.headerN);
  chk('V2 SHOW-MORE opens exactly one more window (≤ OL_CHUNK new rows, > 0)',
    !!win2 && win2.grew > 0 && win2.grew <= 20, JSON.stringify(win2));
  chk('V3 AUTO-EXPAND collapsed category re-opens on a real canvas pick + row painted active',
    collapsedRows === 0 && !!expand && expand.rowFound && expand.painted && expand.catOpen && slog.some(l => /§OLEXPAND/.test(l)),
    JSON.stringify(expand));
  chk('V4 O(K)-PICK restyled ≤ 4 rows while ' + renderedRows + ' rows are rendered',
    !!pickStats && pickStats.restyled > 0 && pickStats.restyled <= 4 && renderedRows > 40,
    JSON.stringify(pickStats));
  chk('V5 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-OLVIRT: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
