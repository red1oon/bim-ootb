#!/usr/bin/env node
/**
 * W-DW-DEDUP-RENDER — regression witness for DW_FIXTURE_DOUBLE_RENDER_FINDING.md G1-G3, visually
 * confirmed 2026-07-17 chasing a guide-shot close-up (a ceiling light z-fought into a garbled oval).
 * Every disc-walked fixture folds BOTH as an individual op-log mesh (signed provenance/undo, same
 * mechanism every ARC element uses) AND as an InstancedMesh bucket (perf). Both used to stay fully
 * visible/opaque forever at two independently-computed near-but-not-identical positions → z-fighting.
 * Fix: the individual fold-copy goes opacity:0/transparent (RENDER-invisible) while staying
 * `visible:true` (still raycastable — window.Bonsai._selSet pick-to-identify depends on it, W-E2E-INSTPICK
 * P2). Assert this holds after a fresh walk AND survives xrayReveal(true)->xrayReveal(false) (a full
 * op-log re-fold that rebuilds every individual mesh from scratch with default material — the first
 * fix attempt didn't re-apply after that path and silently regressed).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, (e, buf) => {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function openAndWalk(pg, key, disc) {
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  let lastN = -1, stable = 0, deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const n = await pg.evaluate(() => { const g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.length : -1; });
    if (n === lastN) { stable++; if (stable >= 8) break; } else { stable = 0; lastN = n; }
    await sleep(250);
  }
  await pg.click(`#bo-tree [data-disc="${disc}"]`).catch(() => {});
  const wdl = Date.now() + 60000;
  while (Date.now() < wdl) {
    const done = await pg.evaluate(d => window.__dwLastCommitDisc === d, disc);
    if (done) break;
    await sleep(300);
  }
  await sleep(1000);
}

async function dedupState(pg, disc) {
  return pg.evaluate(d => {
    const ops = window.Bonsai.oplog._geomOps();
    const fids = new Set();
    ops.forEach(o => { if (o.parameters && o.parameters._dw && o.parameters._dw.disc === d) fids.add(o.id); });
    const g = window.Bonsai.group();
    let total = 0, deduped = 0, stillOpaqueVisible = 0, missing = 0;
    fids.forEach(fid => {
      const mesh = g.children.find(o => o.isMesh && o.userData && o.userData.featureId === fid);
      total++;
      if (!mesh) { missing++; return; }
      const m = mesh.material;
      const isDeduped = mesh.visible === true && m.transparent === true && m.opacity < 0.01;
      if (isDeduped) deduped++; else stillOpaqueVisible++;
    });
    return { total, deduped, stillOpaqueVisible, missing };
  }, disc);
}

(async () => {
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  pg.on('console', m => logs.push(m.text()));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.SQL && !!window.Bonsai', null, { timeout: 30000 });

  let pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-DW-DEDUP-RENDER — individual fold-copy vs InstancedMesh, chase-to-zero ═══');

  // Duplex ELEC — fresh walk
  await openAndWalk(pg, 'Duplex', 'ELEC');
  const s1 = await dedupState(pg, 'ELEC');
  chk('D1 Duplex fresh-walk: every disc-walked feature deduped', s1.total > 0 && s1.deduped === s1.total && s1.missing === 0,
    JSON.stringify(s1));

  // survive an xrayReveal(true) -> xrayReveal(false) full re-fold (the gap the first fix attempt missed)
  await pg.evaluate(() => window.__xrayReveal(true));
  await sleep(500);
  await pg.evaluate(() => window.__xrayReveal(false));
  await sleep(500);
  const s2 = await dedupState(pg, 'ELEC');
  chk('D2 Duplex post-xray-restore: still every feature deduped (scrubTo refold re-applies)', s2.total > 0 && s2.deduped === s2.total && s2.missing === 0,
    JSON.stringify(s2));

  // SampleCastle — a second, larger building
  await openAndWalk(pg, 'SampleCastle', 'ELEC');
  const s3 = await dedupState(pg, 'ELEC');
  chk('D3 SampleCastle fresh-walk: every disc-walked feature deduped', s3.total > 0 && s3.deduped === s3.total && s3.missing === 0,
    JSON.stringify(s3));

  const errs = logs.filter(l => /PAGEERROR/.test(l));
  chk('D4 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`W-DW-DEDUP-RENDER: ${pass} PASS / ${fail} FAIL`);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('❌ UNCAUGHT ' + String(e && e.message || e)); process.exit(1); });
