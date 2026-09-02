// W-CONNECT-SELECT — Connect Scene P1 witness (prompts/CONNECT_SCENE_SPEC.md P1).
// CLAIM: with the Modeller and the REAL Viewer (Clinic_extracted.db) running as TWO SEPARATE same-origin
// surfaces joined by the Connect broker (BroadcastChannel), a pick in one lands on the SAME signed entity in
// the other — resolved by the cross-surface bridge (component ifc_class == elements_meta ifc_class), NOT a
// hand-coded map:
//   FORWARD  Modeller selects an inserted IfcDoor → Viewer highlights IfcDoor against its real elements_meta.
//   REVERSE  Viewer picks a real IfcDoor element → Modeller selects the owning Door feature.
// Surfaces stay separate (no shared DOM); only the 'selection' CONTEXT crosses. 3D DRAW is GPU-gated → the
// MATCH COUNT + the cross-surface §-log round-trip are the GPU-independent assertions.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
const GREP = /^§(CONNECT|BIM-HL|BIM-FOCUSREC|MODELLER connectsel)/;
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ── Surface VIEWER (real model) — open first so it is listening before the modeller publishes ──
  const vlogs = [];
  const V = await br.newPage();
  V.on('console', m => { const t = m.text(); if (GREP.test(t)) { vlogs.push(t); console.log('  [V] ' + t); } });
  V.on('pageerror', e => console.log('  [V] ERR ' + String(e).slice(0, 200)));
  await V.goto(`http://localhost:${port}/viewer.html?db=buildings/Clinic_extracted.db&bld=Clinic&connect=1`, { waitUntil: 'load', timeout: 90000 });
  await V.waitForFunction('window.APP && window.APP.db && window.APP.dbQuery && window.Connect && window.Connect.on', { timeout: 120000 })
    .catch(() => console.log('  ✗ viewer db/Connect not ready'));
  const doorGuid = await V.evaluate(() => {
    const r = window.APP.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class='IfcDoor' LIMIT 1");
    const n = window.APP.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcDoor'");
    return { guid: r && r.length ? r[0][0] : null, count: n && n.length ? n[0][0] : 0 };
  }).catch(() => ({ guid: null, count: 0 }));
  console.log('  viewer Clinic IfcDoor count=' + doorGuid.count);

  // ── Surface MODELLER — insert a Door, enable Connect ──
  const mlogs = [];
  const M = await br.newPage();
  M.on('console', m => { const t = m.text(); if (GREP.test(t)) { mlogs.push(t); console.log('  [M] ' + t); } });
  M.on('pageerror', e => console.log('  [M] ERR ' + String(e).slice(0, 200)));
  await M.goto(`http://localhost:${port}/modeller.html?connectsel=demo`, { waitUntil: 'load', timeout: 90000 });
  await M.waitForFunction('window.__connectSelReady === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ modeller connectsel not ready'));
  const insertedId = await M.evaluate(() => window.__connectSelInsertedId).catch(() => null);
  console.log('  modeller inserted Door featureId=' + insertedId);

  // ── FORWARD: Modeller selects the Door → Viewer should highlight IfcDoor ──
  await M.evaluate((id) => window.Bonsai.select(id), insertedId);
  await new Promise(r => setTimeout(r, 800));
  const fwdViewerGotSel = vlogs.some(l => /§CONNECT-SEL-IN viewer .*class=IfcDoor/.test(l));
  const fwdHlLine = vlogs.find(l => /§BIM-HL class=IfcDoor match=(\d+)/.test(l));
  const fwdMatch = fwdHlLine ? +fwdHlLine.match(/match=(\d+)/)[1] : 0;

  // ── REVERSE: Viewer picks a real IfcDoor element → Modeller should select the Door feature ──
  if (doorGuid.guid) await V.evaluate((g) => window.APP._bimPostFocus(g, 'IfcDoor'), doorGuid.guid);
  await new Promise(r => setTimeout(r, 800));
  const revModGotSel = mlogs.some(l => /§CONNECT-SEL-IN modeller class=IfcDoor .*match=(\d+)/.test(l) && !/match=none/.test(l));
  const revSelId = await M.evaluate(() => window.Bonsai._selId).catch(() => null);

  await br.close(); server.close();

  console.log('  §CONNECT-SELECT forward{viewerGotSel=' + fwdViewerGotSel + ' match=' + fwdMatch + '} ' +
    'reverse{modGotSel=' + revModGotSel + ' modSelId=' + revSelId + ' insertedId=' + insertedId + '}');
  const checks = {
    insertOk:    insertedId != null && doorGuid.count > 0,
    fwdRouted:   fwdViewerGotSel,                          // modeller publish reached the viewer surface
    fwdMatched:  fwdMatch > 0,                             // viewer matched IfcDoor against REAL elements_meta
    revRouted:   revModGotSel,                             // viewer pick reached the modeller surface
    revSelected: revSelId != null && revSelId === insertedId  // modeller landed on the SAME feature
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §CONNECT-SELECT VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
