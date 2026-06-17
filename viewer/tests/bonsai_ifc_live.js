// W-BONSAI-IFC — in-viewer Item 3(c) witness (prompts/BONSAI_KERNEL_RESEARCH.md Item 3).
// CLAIM: the authored signed op-log EXPORTS to a standards IFC4 file via web-ifc, in-viewer.
// Author a wall (GEOM_EXTRUDE_POLY) + an opening (GEOM_CUT child) -> build IFC4 (IfcWall +
// IfcArbitraryClosedProfileDef extrude + IfcOpeningElement + IfcRelVoidsElement) -> re-import the
// exported bytes and confirm the wall/opening/voids-relation counts AND the wall's profile polygon +
// extrude depth round-trip exactly. Completes author -> sign -> export (W-KERNEL-WEBIFC, now in-viewer).
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
  pg.on('console', m => { const t = m.text(); if (/^§(IFC|OPLOG|MODELLER)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?ifc=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__ifcDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __ifcDone'));

  const x = await pg.evaluate(() => window.__ifcResult || {}).catch(e => ({ err: String(e) }));
  await br.close(); server.close();

  const re = x.re || {}, src = x.src || {};
  // wall profile round-trip: re-imported OuterCurve repeats the first point to close, so the first N
  // points must equal the source polygon; extrude depth must match.
  const srcPts = src.points || [];
  const reProfMatch = Array.isArray(re.firstProfile) && re.firstProfile.length >= srcPts.length &&
    srcPts.every((p, i) => Math.abs(re.firstProfile[i][0] - p[0]) < 1e-3 && Math.abs(re.firstProfile[i][1] - p[1]) < 1e-3);
  const depthMatch = src.depth != null && Math.abs(re.firstDepth - src.depth) < 1e-3;
  console.log('  §BONSAI-IFC bytes=' + x.bytes + ' built(walls=' + x.builtWalls + ' openings=' + x.builtOpenings + ' rels=' + x.builtRels + ')' +
    ' reimport(walls=' + re.walls + ' openings=' + re.openings + ' rels=' + re.rels + ' solids=' + re.solids + ')' +
    ' profileMatch=' + reProfMatch + ' depthMatch=' + depthMatch + (x.error ? ' ERROR=' + x.error : ''));

  const builtOK = x.builtWalls === 1 && x.builtOpenings === 1 && x.builtRels === 1 && x.bytes > 200;
  const reOK = re.walls === 1 && re.openings === 1 && re.rels === 1 && re.solids >= 2;   // wall solid + void solid
  const geomOK = reProfMatch && depthMatch;
  const pass = builtOK && reOK && geomOK;
  console.log('  §BONSAI-IFC VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — built=' + builtOK + ' reimport=' + reOK + ' profile+depth=' + geomOK);
  console.log('── W-BONSAI-IFC ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
