// HARD PROOF for S284f: not "a canvas exists" / not "§IMPORT_SAVED" — actual RENDERED PIXELS.
// Opens the packaged file from file:// (network blocked), drops IFC, then reads back the WebGL
// #canvas pixels (preserveDrawingBuffer=true in scene.js) and counts distinct colors. A black /
// blank canvas → 1-2 colors. A real 3D scene → hundreds. Also saves a PNG screenshot to eyeball.
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const path = require('path');
const IFC = path.resolve('/home/red1/bim-ootb/tests/fixtures/Vogel_Gesamt_upgraded.ifc');
const OUT = '/tmp/BIM-OOTB-s284f.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KIND = process.argv[2] || 'chromium';

(async () => {
  const browser = await pw[KIND].launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  const has = t => logs.some(l => l.includes(t));

  await page.goto('file://' + OUT, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#import-file-input', { state: 'attached', timeout: 20000 });
  await page.locator('#import-file-input').setInputFiles(IFC);
  for (let i = 0; i < 90; i++) { if (has('§CONTRACT_CHECK') || has('§INIT_VIEWER_ERROR')) break; await sleep(1000); }
  await sleep(2500); // let a few render frames paint

  // Find the viewer iframe
  let fr = null;
  for (const f of page.frames()) { const n = f.name() || ''; if (n.charAt(0) === '?' || n.indexOf('db=') >= 0) { fr = f; break; } }
  if (!fr) { console.log(KIND + ' ✗ no viewer iframe'); await browser.close(); process.exit(1); }

  // Read back the ACTUAL pixels of the WebGL render canvas via a 2D copy → getImageData.
  const px = await fr.evaluate(() => {
    const c = document.getElementById('canvas');
    if (!c) return { err: 'no #canvas' };
    const w = c.width, h = c.height;
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const g = tmp.getContext('2d'); g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    const clear = (26 << 16) | (26 << 8) | 46; // 0x1a1a2e renderer clear color
    const colors = new Set(); let nonClear = 0, opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      const rgb = (d[i] << 16) | (d[i+1] << 8) | d[i+2];
      colors.add(rgb);
      if (d[i+3] > 0) opaque++;
      // tolerance around clear color
      if (Math.abs(d[i]-26) > 6 || Math.abs(d[i+1]-26) > 6 || Math.abs(d[i+2]-46) > 6) nonClear++;
    }
    const total = d.length / 4;
    return { w, h, total, distinctColors: colors.size, nonClearPct: +(100*nonClear/total).toFixed(1), opaquePct: +(100*opaque/total).toFixed(1) };
  });

  const shot = '/tmp/s284f_render_' + KIND + '.png';
  try { await fr.locator('#canvas').screenshot({ path: shot }); } catch(e) { /* fallback full page */ await page.screenshot({ path: shot }); }

  // Verdict: a genuinely-rendered 3D scene has many distinct colors and substantial non-clear area.
  const rendered = px.distinctColors > 50 && px.nonClearPct > 2;
  console.log('\n=== ' + KIND + ' PIXEL PROOF ===');
  console.log('  canvas ' + px.w + 'x' + px.h + '  distinctColors=' + px.distinctColors +
              '  nonClear=' + px.nonClearPct + '%  opaque=' + px.opaquePct + '%');
  console.log('  screenshot: ' + shot);
  console.log('  ' + (rendered ? '✓ REAL 3D RENDER (not blank/black)' : '✗ BLANK/UNIFORM canvas — NOT rendered'));
  await browser.close();
  process.exit(rendered ? 0 : 1);
})();
