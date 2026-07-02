#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OL-SYNC scope (read this block first)
 * SCOPE: real-user witness for §P2/§P3/§P4/§P5 (prompts/RESUME_MODELLER_POLISH_BATCH.md) — the Outliner⇄canvas
 *   sync seams. Real mouse input through the production path (open a resident → canvas pick → shift-click →
 *   Outliner hover / ctrl-click), every claim read back from the live selection set, DOM row styles, and mesh
 *   emissive values. Read the log after every run.
 *
 * Issues under test (each was a silent one-way gap before this batch):
 *   S1 CANVAS-MULTI   — a real shift-click ADDS to the selection (2 fids in window.Bonsai._selSet).
 *   S2 OL-SECONDARY   — the Outliner paints BOTH selected rows: primary #26456b, secondary #1d3550 (§P3 —
 *                       before: only the primary row highlighted, multi-select looked single).
 *   S3 OL-HOVER       — hovering an Outliner row lights the mesh's faint hover emissive 0x14324a; leaving
 *                       clears it to 0 (§P2 — before: rows had no path back to the canvas tint).
 *   S4 OL-CTRL-TOGGLE — ctrl-click on an unselected row grows the LIVE selection to 3 (canvas repaints —
 *                       §P4 outliner→canvas direction); ctrl-click again shrinks back to 2.
 *   S5 DEADCLICK-SAYS-SO — clicking a leaf row whose GUID has no featureId bridge (non-ARC discipline
 *                       element) raises the honest toast + §OLSYNC deadclick log instead of a silent no-op (§P5).
 *   S6 NO-ERROR       — no pageerror across the whole sequence.
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
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§(OLSYNC|MODELLER select|MARQUEE)/.test(t)) slog.push(t); });

  console.log('═══ W-OL-SYNC — §P2/3/4/5 Outliner⇄canvas sync (real user, Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  // real Open → Duplex (ARC seed populates the tree + fid↔guid bridge)
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

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
        out.sort((a, b) => b.vol - a.vol); return out.slice(0, 16); },
      emis(fid) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
        return m && m.material && m.material.emissive ? m.material.emissive.getHex() : null; },
      rowSel(fid) { const guid = (window.__arcGuidByFid || {})[fid];
        const d = guid != null ? document.querySelector('[data-bnode="' + guid + '"]') : document.querySelector('[data-fid="' + fid + '"]');
        return d ? { bg: d.style.background, found: true } : { found: false }; }
    };
    return true;
  });

  // S1 — real pick + shift-click a second element (distinct fids, both actually selectable by mouse)
  const cands = await pg.evaluate(() => window.__e2e.candidates());
  let fidA = null, fidB = null;
  for (const c of cands) {
    await pg.mouse.click(c.sx, c.sy); await sleep(120);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1 && sel[0] === c.fid) { fidA = c.fid; break; }
  }
  for (const c of cands) {
    if (c.fid === fidA) continue;
    await pg.keyboard.down('Shift'); await pg.mouse.click(c.sx, c.sy); await pg.keyboard.up('Shift'); await sleep(150);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 2 && sel.includes(c.fid)) { fidB = c.fid; break; }
    if (sel.length !== 1 || sel[0] !== fidA) {   // toggled something odd off/on — reset to A and try the next
      await pg.evaluate(f => window.Bonsai.select(f), fidA); await sleep(80);
    }
  }
  const sel2 = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));

  // S2 — Outliner paints primary + secondary rows (fidB is the primary — it was added LAST)
  const rowPrimary = await pg.evaluate(f => window.__e2e.rowSel(f), fidB);
  const rowSecondary = await pg.evaluate(f => window.__e2e.rowSel(f), fidA);

  // S3 — hover a THIRD (unselected) element's Outliner row → mesh hover emissive on, out → off
  const fidC = await pg.evaluate((a, b) => {
    const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData.featureId != null && o.userData.featureId !== a && o.userData.featureId !== b
      && (window.__arcGuidByFid || {})[o.userData.featureId] != null
      && document.querySelector('[data-bnode="' + window.__arcGuidByFid[o.userData.featureId] + '"]'));
    return m ? m.userData.featureId : null;
  }, fidA, fidB);
  let hovOn = null, hovOff = null;
  if (fidC != null) {
    const rowSelC = await pg.evaluate(f => '[data-bnode="' + window.__arcGuidByFid[f] + '"]', fidC);
    await pg.hover(rowSelC); await sleep(120);
    hovOn = await pg.evaluate(f => window.__e2e.emis(f), fidC);
    await pg.hover('#bo-find'); await sleep(120);          // leave the row (find box is always present)
    hovOff = await pg.evaluate(f => window.__e2e.emis(f), fidC);
  }

  // S4 — ctrl-click that third row: selection 2→3 (live canvas set), ctrl-click again: 3→2
  let selAfterCtrl = null, selAfterCtrl2 = null;
  if (fidC != null) {
    const rowSelC = await pg.evaluate(f => '[data-bnode="' + window.__arcGuidByFid[f] + '"]', fidC);
    await pg.keyboard.down('Control'); await pg.click(rowSelC); await pg.keyboard.up('Control'); await sleep(150);
    selAfterCtrl = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    await pg.keyboard.down('Control'); await pg.click(rowSelC); await pg.keyboard.up('Control'); await sleep(150);
    selAfterCtrl2 = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  }

  // S5 — dead-click: a leaf row whose guid has NO fid bridge (non-ARC discipline element in the seeded tree)
  const deadSel = await pg.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-bnode][data-leaf="1"]'));
    const d = rows.find(r => { const bn = r.getAttribute('data-bnode');
      return isNaN(+bn) && (!window.__arcFidByGuid || window.__arcFidByGuid[bn] == null); });
    return d ? '[data-bnode="' + d.getAttribute('data-bnode') + '"]' : null;
  });
  let toastText = '';
  if (deadSel) {
    await pg.click(deadSel); await sleep(250);
    toastText = await pg.evaluate(() => { const t = document.querySelector('#toast-stack'); return t ? t.textContent : ''; });
  }

  await br.close(); server.close();

  console.log('  §SEL A=' + fidA + ' B=' + fidB + ' set=' + JSON.stringify(sel2));
  console.log('  §ROWS primary=' + JSON.stringify(rowPrimary) + ' secondary=' + JSON.stringify(rowSecondary));
  console.log('  §HOVER fidC=' + fidC + ' on=0x' + (hovOn != null ? hovOn.toString(16) : '?') + ' off=0x' + (hovOff != null ? hovOff.toString(16) : '?'));
  console.log('  §CTRL after=' + JSON.stringify(selAfterCtrl) + ' after2=' + JSON.stringify(selAfterCtrl2));
  console.log('  §DEAD row=' + (deadSel || 'none') + ' toast="' + toastText.slice(0, 80) + '"');
  slog.slice(0, 10).forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('S1 CANVAS-MULTI shift-click → 2 selected', fidA != null && fidB != null && sel2.length === 2 && sel2.includes(fidA) && sel2.includes(fidB), JSON.stringify(sel2));
  chk('S2 OL-SECONDARY both rows tinted (primary≠secondary)',
    rowPrimary.found && rowSecondary.found && /38, 69, 107/.test(rowPrimary.bg) && /29, 53, 80/.test(rowSecondary.bg),
    'primary=' + rowPrimary.bg + ' secondary=' + rowSecondary.bg);
  chk('S3 OL-HOVER row hover lights mesh 0x14324a, out clears', hovOn === 0x14324a && hovOff === 0x000000,
    'on=0x' + (hovOn != null ? hovOn.toString(16) : '?') + ' off=0x' + (hovOff != null ? hovOff.toString(16) : '?'));
  chk('S4 OL-CTRL-TOGGLE 2→3→2 in the LIVE canvas set',
    selAfterCtrl && selAfterCtrl.length === 3 && selAfterCtrl.includes(fidC) && selAfterCtrl2 && selAfterCtrl2.length === 2 && !selAfterCtrl2.includes(fidC),
    JSON.stringify({ a: selAfterCtrl && selAfterCtrl.length, b: selAfterCtrl2 && selAfterCtrl2.length }));
  chk('S5 DEADCLICK-SAYS-SO toast raised', !!deadSel && /no 3D pick/.test(toastText), 'toast="' + toastText.slice(0, 60) + '"');
  chk('S6 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-OL-SYNC: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
