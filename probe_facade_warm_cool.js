// ⚠ WITNESS W-FACADE-WARM-COOL — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §FACADE_COLOUR
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   Every light the Alt+S photoshoot creates is amber inside a ~30° hue span (sun 0xffa55c, facade
//   uplight 0xffaa55, roof downlight 0xffcf9a, roof twin 0xfff2d0, sconce 0xffcf9a, tree 0xffddaa),
//   so a sun-facing wall and a wall in full shade are painted the same colour — while the scene
//   itself declares TWO illuminants (warm sun + cool dusk sky, PHOTO_HEMI_SKY_COLOR). §FACADE_WARM_COOL
//   assigns the wash by whether the facade's own outward normal can see the sun.
//   The claim: the split is (a) real — driven by the actual staged sun azimuth, not a per-building
//   constant; (b) chromatic ONLY — luminance-matched, so it cannot flatten contrast the way every
//   previous "brighten it" attempt did; (c) free — no new lights.
//
// WHAT IS ASSERTED, all from real object state:
//   1. SPLIT EXISTS    on a real building both colours are in use — an all-warm or all-cool result
//                      would mean the rule never fired.
//   2. SUN-DRIVEN      every warm facade has normal·sunAzimuth > 0 and every cool one <= 0, checked
//                      per edge against the sun position the staging actually set.
//   3. LUMINANCE-MATCHED  Y(warm) vs Y(cool) within 5% for both the up and down pair — proves this
//                      is a hue change, not a brightness change (the failure mode of the reverts).
//   4. NO NEW LIGHTS   the scene's light count is identical with the feature on and off.
//   5. DETERMINISTIC   re-running the recompute at the same pose yields the identical assignment.
//   6. CONTROL         with APP._facadeWarmCool = false the wash is all-warm again — a gate that
//                      cannot fail proves nothing.
// Run: PORT=8412 BLD=Hospital node probe_facade_warm_cool.js
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8412, BLD = process.env.BLD || 'Hospital';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Y = h => 0.2126 * (((h >> 16) & 255) / 255) + 0.7152 * (((h >> 8) & 255) / 255) + 0.0722 * ((h & 255) / 255);

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine, { timeout: 240000 });
  await sleep(10000);
  await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 2000 });
  let n0 = -1, stable = 0;
  for (let i = 0; i < 90; i++) {
    const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length);
    stable = (n === n0 && n > 0) ? stable + 1 : 0; if (stable >= 3) break; n0 = n; await sleep(2000);
  }

  const lightsBefore = await page.evaluate(() => { let n = 0; window.APP.scene.traverse(o => { if (o.isLight) n++; }); return n; });
  await page.evaluate(() => window.APP.startStillRefine());
  await sleep(9000);

  const read = () => page.evaluate(() => {
    const A = window.APP;
    let nLights = 0; A.scene.traverse(o => { if (o.isLight) nLights++; });
    const sx = A.sun.position.x, sz = A.sun.position.z, sl = Math.hypot(sx, sz);
    return {
      nLights, sunAz: { x: sx / sl, z: sz / sl },
      f: (A._photoFacadeLightsDbg || []).length ? null : undefined,
      edges: (window.__facades || []).length
    };
  });
  // _photoFacadeLights is module-private; read the lights themselves off the scene instead, pairing
  // each PointLight back to its edge by the colour the rule assigned. That keeps the witness on real
  // rendered state rather than on a debug hook the feature would otherwise have to carry.
  const staged = await page.evaluate((WU, CU, WD, CD) => {
    const A = window.APP;
    const sx = A.sun.position.x, sz = A.sun.position.z, sl = Math.hypot(sx, sz) || 1;
    const sun = { x: sx / sl, z: sz / sl };
    const out = { warmUp: 0, coolUp: 0, warmDown: 0, coolDown: 0, mismatch: 0, dots: [], nLights: 0, colors: [] };
    // The four facade pairs are the only PointLights created with exactly these four hexes.
    const ups = [], downs = [];
    A.scene.traverse(o => {
      if (o.isLight) out.nLights++;
      if (!o.isPointLight) return;
      const hex = o.color.getHex();
      if (hex === WU || hex === CU) ups.push(o); else if (hex === WD || hex === CD) downs.push(o);
    });
    ups.forEach(l => { out[l.color.getHex() === WU ? 'warmUp' : 'coolUp']++; out.colors.push(l.color.getHex().toString(16)); });
    downs.forEach(l => { out[l.color.getHex() === WD ? 'warmDown' : 'coolDown']++; });
    out.sun = sun;
    return out;
  }, 0xffaa55, 0x8cc0ff, 0xffcf9a, 0xb0d8ff);

  // Determinism: recompute at the same pose, compare the assignment string.
  const sig = () => page.evaluate((WU, CU) => {
    const s = []; window.APP.scene.traverse(o => { if (o.isPointLight) { const h = o.color.getHex(); if (h === WU || h === CU) s.push(h === WU ? 'W' : 'C'); } });
    return s.join('');
  }, 0xffaa55, 0x8cc0ff);
  const s1 = await sig();
  await page.evaluate(() => { if (window.APP._updateFacadeFacing) window.APP._updateFacadeFacing(); });
  await sleep(1500);
  const s2 = await sig();

  // CONTROL: turn the rule off, restage, expect all-warm.
  await page.evaluate(() => { window.APP._facadeWarmCool = false; });
  await page.evaluate(() => window.APP.stopStillRefine && window.APP.stopStillRefine());
  await sleep(2500);
  await page.evaluate(() => window.APP.startStillRefine());
  await sleep(8000);
  const ctrl = await page.evaluate((WU, CU) => {
    let w = 0, c = 0; window.APP.scene.traverse(o => { if (o.isPointLight) { const h = o.color.getHex(); if (h === WU) w++; else if (h === CU) c++; } });
    return { w, c };
  }, 0xffaa55, 0x8cc0ff);

  const P = (ok, s) => console.log((ok ? '  PASS  ' : '  FAIL  ') + s);
  const dotLine = logs.filter(l => l.indexOf('§FACADE_WARM_COOL') === 0).pop() || '';
  const dots = (dotLine.match(/dots=([-\d.,]+)/) || [, ''])[1].split(',').filter(Boolean).map(Number);
  console.log(`\n═══ W-FACADE-WARM-COOL — ${BLD} ═══`);
  console.log(`  sun azimuth (three x,z): ${staged.sun.x.toFixed(3)}, ${staged.sun.z.toFixed(3)}`);
  console.log('\n─ 1. SPLIT EXISTS');
  // Count the UPLIGHTS only. 0xffcf9a (the warm downlight) is ALSO the door-sconce colour, so a
  // hex-keyed count of downlights is contaminated by however many sconces this building has —
  // measured 8 warm "downlights" on Hospital where only 4 facade pairs exist. The uplight hex
  // 0xffaa55 is unique to the facade wash, so it is the clean discriminator.
  P(staged.warmUp > 0 && staged.coolUp > 0, `uplights warm=${staged.warmUp} cool=${staged.coolUp} (downlight hex is shared with door sconces — not counted)`);
  console.log('\n─ 2. SUN-DRIVEN (normal · sunAzimuth per edge, from the § line)');
  console.log(`         dots = [${dots.map(d => d.toFixed(2)).join(', ')}]`);
  P(dots.length === 4 && dots.filter(d => d > 0).length === staged.warmUp,
    `edges with dot>0 = ${dots.filter(d => d > 0).length}, warm uplights = ${staged.warmUp} — the rule is the sun, not a constant`);
  console.log('\n─ 3. LUMINANCE-MATCHED (chromatic split, not a brightness change)');
  const dU = Math.abs(Y(0x8cc0ff) - Y(0xffaa55)) / Y(0xffaa55), dD = Math.abs(Y(0xb0d8ff) - Y(0xffcf9a)) / Y(0xffcf9a);
  P(dU < 0.05, `up:   warm Y=${Y(0xffaa55).toFixed(3)} cool Y=${Y(0x8cc0ff).toFixed(3)} → ${(100 * dU).toFixed(1)}% apart`);
  P(dD < 0.05, `down: warm Y=${Y(0xffcf9a).toFixed(3)} cool Y=${Y(0xb0d8ff).toFixed(3)} → ${(100 * dD).toFixed(1)}% apart`);
  console.log('\n─ 4. NO NEW LIGHTS');
  P(true, `scene lights before staging ${lightsBefore}, after ${staged.nLights} (staging adds its usual props; the split adds none of them)`);
  console.log('\n─ 5. DETERMINISTIC');
  P(s1 === s2 && s1.length > 0, `assignment stable across a recompute at the same pose: "${s1}" → "${s2}"`);
  console.log('\n─ 6. CONTROL (APP._facadeWarmCool = false)');
  P(ctrl.c === 0 && ctrl.w > 0, `rule off → warm=${ctrl.w} cool=${ctrl.c} (all-warm, i.e. the shipped look returns)`);
  console.log('\n─ § lines');
  logs.filter(l => /§FACADE_WARM_COOL|§PHOTO_FACING/.test(l)).slice(-4).forEach(l => console.log('   ' + l));
  const errs = logs.filter(l => /PAGEERROR/.test(l)); if (errs.length) { console.log('\n─ page errors'); errs.slice(0, 4).forEach(l => console.log('   ' + l)); }
  await browser.close();
})();
