// W-BONSAI-MORPHEUS — wiring witness (prompts/BONSAI_MORPHEUS_WIRING.md Tasks 2+3+4).
// CLAIM: the Morpheus front door (index.html) wires the Bonsai modeller as its BIM face:
//   red pill → background preload SHOWER (occt-wasm + ad_seed.db stream behind the pulse) →
//   ⋯ PillBuilder rail with a Bonsai-tree pill → click → navigates to viewer/modeller.html →
//   the modeller boots and AUTHORS A WALL (in A.scene). Whitebox §-log + a DOM/scene probe.
// Run: node viewer/tests/bonsai_morpheus_live.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join('/tmp/wt-morpheus');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm',
  '.json':'application/json', '.css':'text/css', '.db':'application/octet-stream', '.jpg':'image/jpeg', '.png':'image/png', '.map':'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1100,760'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 760 });
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/§(MORPHEUS_RED|PRELOAD|RAIL|REVEAL|BONSAI|WHOLE-REC)/.test(t)) { logs.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));

  // 1) cold boot → Morpheus gate
  await pg.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForSelector('#morpheus.active', { timeout: 15000 }).catch(() => {});
  const cold = await pg.$('#morpheus.active') ? true : false;

  // 2) take the RED pill → preload shower should appear + stream
  await pg.click('.hot.red');
  await pg.waitForSelector('#preload-shower', { timeout: 8000 }).catch(() => {});
  const showerUp = !!(await pg.$('#preload-shower'));
  // capture the shower mid-stream
  await pg.evaluate(() => new Promise(r => setTimeout(r, 600)));
  const showerShot = path.join(ROOT, 'viewer', 'morpheus_shower_shot.png');
  await pg.screenshot({ path: showerShot }).catch(() => {});

  // 3) reveal → rail rises; assert the Bonsai pill is present with the bonsai-tree icon
  await pg.waitForSelector('#desktop.active', { timeout: 20000 }).catch(() => {});
  // open the rail (the reveal auto-toggles, but force-open to be deterministic)
  await pg.evaluate(() => { if (window._rail && window._rail.toggle) { try { window._rail.open ? window._rail.open() : window._rail.toggle(); } catch(e){} } });
  await pg.waitForSelector('#pill-bonsai', { timeout: 8000 }).catch(() => {});
  const pillInfo = await pg.evaluate(() => {
    const b = document.getElementById('pill-bonsai');
    if (!b) return { exists: false };
    const svg = b.querySelector('svg');
    const d = svg ? Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d')).join('|') : '';
    return { exists: true, isBonsaiTree: /M8 19a4 4/.test(d), pathCount: svg ? svg.querySelectorAll('path').length : 0 };
  });
  const railShot = path.join(ROOT, 'viewer', 'morpheus_rail_shot.png');
  await pg.screenshot({ path: railShot }).catch(() => {});

  // 4) click the Bonsai pill → navigate to the modeller
  const navP = pg.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => null);
  await pg.click('#pill-bonsai');
  await navP;
  const url = pg.url();
  const onModeller = /viewer\/modeller\.html/.test(url);

  // 5) the Morpheus-launched modeller AUTHORS A WALL
  await pg.waitForFunction('window.Bonsai && window.A && window.A.scene', { timeout: 30000 }).catch(() => {});
  const authored = await pg.evaluate(async () => {
    try {
      const op = { id: 1, op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 4, h: 0.2 }, dir: [0, 0, 3] } };
      const r = await window.Bonsai.author(op, { color: 0x9fb4c8 });
      const g = window.A.scene.getObjectByName('BonsaiAuthored');
      const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
      return { ok: true, tris: r && r.triangleCount, meshes };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  console.log('  §BONSAI-MORPHEUS authored tris=' + (authored.tris) + ' meshes=' + authored.meshes + ' ok=' + authored.ok + (authored.err ? ' err=' + authored.err : ''));

  await br.close(); server.close();

  // verdict
  const preloadSeen = logs.some(t => /§PRELOAD/.test(t)) || showerUp;
  const railSeen = logs.some(t => /§RAIL mounted .*pills=bonsai/.test(t));
  const launchSeen = logs.some(t => /§BONSAI-LAUNCH/.test(t));
  const pass = cold && showerUp && pillInfo.exists && pillInfo.isBonsaiTree && railSeen && launchSeen && onModeller && authored.ok && authored.meshes >= 1;
  console.log('  §BONSAI-MORPHEUS VERDICT cold=' + cold + ' shower=' + showerUp + ' preload=' + preloadSeen +
    ' bonsaiPill=' + pillInfo.exists + ' icon=' + pillInfo.isBonsaiTree + ' rail=' + railSeen +
    ' launch=' + launchSeen + ' onModeller=' + onModeller + ' authored=' + (authored.ok && authored.meshes >= 1));
  console.log('  shots: ' + showerShot + ' , ' + railShot);
  console.log('── W-BONSAI-MORPHEUS ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
