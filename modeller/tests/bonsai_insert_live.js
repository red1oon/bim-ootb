// W-BONSAI-INSERT — Bonsai modeller §OOTB Item 2 witness (prompts/BONSAI_KERNEL_RESEARCH.md §SPEC W-BONSAI-INSERT).
// CLAIM: a REAL library component can be ASSEMBLED into the model (not drawn) as ONE signed GEOM_INSERT op-row,
// rendered at a chosen LOD, landing in the Outliner. Driving the REAL UI handlers (Insert button → pick a Door in
// the component panel → simulated ground pointerdown to place → LOD button), the placed component commits as a
// signed GEOM_INSERT (LOD-200 = a 12-tri bbox box proxy), the chain verifies + is signed, the Outliner shows a
// Components category, and the LOD button refines the SAME signed row to LOD-300 (the real extracted 52-tri mesh)
// with the chain TIP + row COUNT unchanged ("same row refined"). Scrub replays deterministically; tamper is caught.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-bonsai', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|OUTLINER|LIBRARY|KRN|BONSAI|KERNEL_OPS)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?insert=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__insertDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __insertDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__insertResult || {};
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §BONSAI-INSERT catalog=' + x.catalog + ' inserting=' + x.inserting + ' pickedComponent=' + x.pickedComponent +
    ' insertOps=' + x.insertOps + ' signed=' + x.signed + ' verify=' + x.verify +
    ' lod200Tris=' + x.lod200Tris + ' lod300Tris=' + x.lod300Tris + ' componentFc=' + x.componentFc +
    ' lenBefore=' + x.lenBefore + ' lenAfter=' + x.lenAfter + ' tipUnchanged=' + x.tipUnchanged +
    ' componentsCategory=' + x.componentsCategory + ' componentRow="' + x.componentRow + '"' +
    ' scrub0=' + x.scrub0 + ' scrub1=' + x.scrub1 + ' tamperOk=' + x.tamperOk + ' litPixels=' + probe.litPct + '%' +
    (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const assembled = x.inserting === true && x.pickedComponent === true && x.insertOps === 1;
  const oneSigned = x.signed === 1 && x.verify === true;
  const lod200Box = x.lod200Tris === 12;                                  // bbox box proxy
  const lod300Mesh = x.lod300Tris === x.componentFc && x.componentFc > 12; // real extracted mesh (52 for Door)
  const sameRowRefined = x.lenBefore === 1 && x.lenAfter === 1 && x.tipUnchanged === true; // LOD = render override, row immutable
  const inOutliner = x.componentsCategory === true && /Door/.test(x.componentRow || '');
  const replayOK = x.scrub0 === 0 && x.scrub1 === x.componentFc;          // deterministic prefix fold (override persists)
  const tamperCaught = x.tamperOk === false;
  const drew = probe.litPct > 0.5;
  const pass = assembled && oneSigned && lod200Box && lod300Mesh && sameRowRefined && inOutliner && replayOK && tamperCaught && drew;
  console.log('  §BONSAI-INSERT VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — assembledFromLibrary=' + assembled + ' oneSigned=' + oneSigned + ' lod200BoxProxy=' + lod200Box +
    ' lod300RealMesh=' + lod300Mesh + ' sameSignedRowRefined=' + sameRowRefined + ' inOutlinerComponents=' + inOutliner +
    ' replayDeterministic=' + replayOK + ' tamperCaught=' + tamperCaught + ' drew=' + drew);
  console.log('── W-BONSAI-INSERT ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
