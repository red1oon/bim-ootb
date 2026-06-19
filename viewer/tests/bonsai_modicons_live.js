// W-BONSAI-MODICONS — modeller icon-redo witness (BONSAI_MORPHEUS_WIRING.md Task 4b).
// CLAIM: the modeller's placeholder unicode glyphs (▦ ✎ ⬆ ✂ ⤓ + ▼/▸) are replaced by verbatim
// Lucide LINE icons with ZERO functional regression — the toolbar still authors a wall+opening,
// the Sketch button toggles its icon/label, the Grid button toggles its active state, and the
// Outliner renders chevron disclosure. No unicode symbol glyph survives on the toolbar/outliner.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-modicons', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm',
  '.json':'application/json', '.css':'text/css', '.png':'image/png', '.map':'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
const UNICODE_GLYPH = /[←-⯿\u{1F000}-\u{1FAFF}]/u;
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1200,760'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 760 });
  const errs = []; const logs = []; const audio = [];
  pg.on('console', m => { const t = m.text();
    if (/§BONSAI author/.test(t)) { logs.push(t); console.log('  ' + t); }
    if (/§AUDIO/.test(t)) { audio.push(t); console.log('  ' + t); } });
  pg.on('pageerror', e => { errs.push(String(e)); console.log('  ERR ' + String(e).slice(0, 200)); });

  await pg.goto(`http://localhost:${port}/modeller.html?author=both`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__authorDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout __authorDone'));

  // toolbar: every button has an svg.ic, and none carries a unicode symbol glyph
  const bar = await pg.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#bar button'));
    return btns.map(b => ({ id: b.id, hasSvg: !!b.querySelector('svg.ic'), text: (b.textContent || '').trim() }));
  });
  const allHaveIcons = bar.every(b => b.hasSvg);
  const noGlyph = bar.every(b => !UNICODE_GLYPH.test(b.text));

  // Grid toggle → .on class; Sketch toggle → icon+label swaps to Cancel then back
  const gridOn = await pg.evaluate(() => { document.getElementById('b-grid').click(); return document.getElementById('b-grid').classList.contains('on'); });
  const sketchToggle = await pg.evaluate(() => {
    const b = document.getElementById('b-sketch'); b.click();
    const inSketch = { label: (b.textContent || '').trim(), hasSvg: !!b.querySelector('svg.ic') };
    b.click(); const back = (b.textContent || '').trim();
    return { inSketch, back };
  });

  // Outliner: chevron svgs present, no ▼/▸ text glyphs
  const outliner = await pg.evaluate(() => {
    const el = document.getElementById('bonsai-outliner') || document.querySelector('[id*="outliner"]');
    const tree = document.getElementById('bo-tree') || (el && el.querySelector('[id*="tree"]'));
    const host = tree || el || document.body;
    const svgN = host.querySelectorAll('svg').length;
    const txt = host.textContent || '';
    return { found: !!(el || tree), svgCount: svgN, hasTriangle: /[▼▸]/.test(txt) };
  });

  // sound toggle: default ON (.on + Sound label), click → Muted; authoring fired a §AUDIO cue
  const sound = await pg.evaluate(() => {
    const b = document.getElementById('b-sound');
    if (!b) return { exists: false };
    const onAtStart = b.classList.contains('on');
    const labelOn = (b.textContent || '').trim();
    b.click();
    const mutedAfter = !b.classList.contains('on') && /Muted/.test(b.textContent || '');
    b.click(); // back on
    return { exists: true, hasSvg: !!b.querySelector('svg.ic'), onAtStart, labelOn, mutedAfter };
  });
  const audioFired = audio.some(t => /§AUDIO cue=author/.test(t));

  const shot = path.join(VIEWER, 'modeller_icons_shot.png');
  await pg.screenshot({ path: shot }).catch(() => {});
  await br.close(); server.close();

  const wall = logs.find(t => /op=GEOM_EXTRUDE/.test(t));
  const open = logs.find(t => /op=GEOM_OPENING/.test(t));
  const authored = wall && /inScene=true/.test(wall) && open && /inScene=true/.test(open);
  const sketchOK = sketchToggle.inSketch.hasSvg && /Cancel/.test(sketchToggle.inSketch.label) && /Sketch/.test(sketchToggle.back);
  const soundOK = sound.exists && sound.hasSvg && sound.onAtStart && sound.mutedAfter;
  const pass = errs.length === 0 && authored && allHaveIcons && noGlyph && gridOn && sketchOK && !outliner.hasTriangle && outliner.svgCount >= 1 && soundOK && audioFired;
  console.log('  §BONSAI-MODICONS buttons=' + bar.length + ' allIcons=' + allHaveIcons + ' noGlyph=' + noGlyph +
    ' gridOn=' + gridOn + ' sketchToggle=' + sketchOK + ' outlinerChevrons=' + outliner.svgCount + ' outlinerTriangleText=' + outliner.hasTriangle +
    ' sound=' + soundOK + ' audioCue=' + audioFired + ' authored=' + authored + ' pageerrors=' + errs.length);
  console.log('  shot: ' + shot);
  console.log('── W-BONSAI-MODICONS ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
