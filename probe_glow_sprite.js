// ⚠ WITNESS W-GLOW-SPRITE — bim-compiler prompts/NIGHT_AND_FIXTURE_LIGHTING.md §PHOTO_GLOW_SPRITE
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   §PHOTO_EMBER lit luminaires by setting `emissive` on the MATERIALS they are drawn with. Batched
//   and instanced meshes share one material across everything they draw (Hospital: 1216 luminaires ->
//   7 materials), so it lit walls, beams and railings, and `toneMapped=false` on a material shared
//   with a transparent panel rendered that panel pure black. §PHOTO_GLOW_SPRITE replaces it with an
//   additive Points cloud at the fixture positions, which touches NO scene material at all.
//
// Three numbers decide it, in this order — the later ones cannot print a pass unless the earlier
// ones hold, because a luminance verdict that can pass with nothing staged is worse than none:
//   1. materialsMutated == 0   — snapshot emissive/emissiveIntensity/toneMapped of every scene
//                                material before staging, diff after. THIS is the whole point of
//                                the mechanism; non-zero fails the run outright.
//   2. sprites == fixtures     — every luminaire the vocabulary finds gets a sprite. The dead end
//                                being replaced could only reach 4 materials of 6 on the Clinic.
//   3. mean luminance / hot %  — a glow that does not move these is not reaching the frame.
//
// Three folds at ONE pose so the contribution is attributable, changing one thing at a time:
//   A  as-shipped                 (sprites off, bloom off)
//   B  bloom only                 (sprites off, bloom forced on) — §PHOTO_BLOOM has never been
//                                 judged on its own; it shipped attached to a broken ember
//   C  sprites + bloom            (the mechanism)
//
// Run:  PORT=8403 BLD=Clinic node probe_glow_sprite.js
//       PORT=8403 BLD=Hospital node probe_glow_sprite.js
// Read the LOG, not the exit code.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8403;
const BLD  = process.env.BLD  || 'Clinic';
const OUT  = process.env.OUT  || '/tmp/glow_out';
const T    = parseFloat(process.env.T || '0.60');   // cinemaPathPlan sample — mid-film is inside
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine && window.APP.toggleNightMode && window.APP._composer,
    { timeout: 240000 });
  await sleep(12000);
  await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } },
    { timeout: 180000, polling: 2000 });

  // A federated building lands one model at a time — streamBuilding must be called ONE AT A TIME,
  // waiting for the guid count to settle, or only one lands (NIGHT_AND_FIXTURE_LIGHTING.md).
  // Electrical is not optional here: it is where the luminaires live.
  const all = await page.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  const want = all.filter(b => /Architectural|Electrical/i.test(b)).sort();
  for (const b of want) {
    await page.evaluate(bb => { try { window.APP.streamBuilding(bb); } catch (e) {} }, b);
    let prev = -1;
    for (let i = 0; i < 60; i++) {
      const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length);
      if (n === prev && n > 0) break;
      prev = n; await sleep(2000);
    }
  }
  const guidMapN = await page.evaluate(() => Object.keys(window.APP.guidMap).length);

  // The camera comes from Alt+C's own plan — poseAt(t) is the same function the bake flies. Deriving
  // a viewpoint by hand put the camera inside walls three times.
  const cam = await page.evaluate(t => {
    const A = window.APP;
    let plan;
    try { plan = A.cinemaPathPlan(30); } catch (e) { return { ok: false, err: e.message }; }
    if (!plan || typeof plan.poseAt !== 'function') return { ok: false, err: 'no plan' };
    const p = plan.poseAt(t);
    A.camera.position.set(p.x, p.y, p.z);
    A.controls.target.set(p.tx, p.ty, p.tz);
    A.controls.update();
    if (A.markDirty) A.markDirty();
    return { ok: true, pose: { x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz }, pathLen: plan.pathLen };
  }, T);
  if (!cam.ok) { console.log('CINEMA PLAN UNAVAILABLE: ' + cam.err); await browser.close(); process.exit(1); }
  await sleep(1200);

  await page.evaluate(() => window.APP.toggleNightMode());
  await sleep(4000);
  const fixtures = await page.evaluate(() => window.APP._nightFixtureWorldPositions().length);
  const navSprites = await page.evaluate(() => window.APP._glowSpriteCount());   // must be 0 — still-only

  // Snapshot AFTER night mode, because night mode legitimately makes fixture/window materials
  // emissive itself. Everything below this line must leave these untouched.
  const snap = () => page.evaluate(() => {
    const seen = {}, out = [];
    window.APP.collectMeshes(o => o.isMesh).forEach(o => {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m || seen[m.uuid]) return;
        seen[m.uuid] = 1;
        out.push([m.uuid, m.emissive ? m.emissive.getHex() : -1, m.emissiveIntensity === undefined ? -1 : m.emissiveIntensity, m.toneMapped !== false ? 1 : 0]);
      });
    });
    return out;
  });
  const before = await snap();

  async function fold(tag, opts) {
    await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); });
    await sleep(800);
    await page.evaluate(o => { window.APP._glowSpriteEnabled = o.sprites; }, opts);
    const t0 = Date.now();
    await page.evaluate(() => window.APP.startStillRefine());
    if (opts.forceBloom) {
      await page.evaluate(() => { if (window.APP._bloomPass) window.APP._bloomPass.enabled = true; window.APP.markDirty && window.APP.markDirty(); });
    }
    for (let i = 0; i < 240 && await page.evaluate(() => !!window.APP._stillRefineBusy); i++) await sleep(500);
    await sleep(2000);
    const state = await page.evaluate(() => ({
      sprites: window.APP._glowSpriteCount(),
      bloom: !!(window.APP._bloomPass && window.APP._bloomPass.enabled),
      calls: window.APP.renderer.info.render.calls,
      exposure: window.APP.renderer.toneMappingExposure
    }));
    const file = path.join(OUT, `${BLD}_${tag}.png`);
    await page.screenshot({ path: file });
    return Object.assign({ file, ms: Date.now() - t0 }, state);
  }

  const A_shot = await fold('A_asshipped',    { sprites: false, forceBloom: false });
  const B_shot = await fold('B_bloomonly',    { sprites: false, forceBloom: true  });
  const C_shot = await fold('C_glowsprites',  { sprites: true,  forceBloom: false });
  // Diff while the sprite still is UP — the claim is that nothing was mutated at any point, and
  // checking only after teardown would be satisfied by a mutate-then-restore.
  const during = await snap();
  await page.evaluate(() => window.APP.stopStillRefine(true));
  await sleep(2000);
  const after = await snap();
  const afterSprites = await page.evaluate(() => window.APP._glowSpriteCount());

  function diff(a, b) {
    const m = {}; a.forEach(r => m[r[0]] = r);
    let n = 0; const eg = [];
    b.forEach(r => {
      const o = m[r[0]];
      if (!o) return;                                  // newly created material — not a mutation
      if (o[1] !== r[1] || o[2] !== r[2] || o[3] !== r[3]) { n++; if (eg.length < 5) eg.push(`${r[0].slice(0, 8)} emissive ${o[1]}->${r[1]} int ${o[2]}->${r[2]} toneMapped ${o[3]}->${r[3]}`); }
    });
    return { n, eg };
  }
  const dDuring = diff(before, during), dAfter = diff(before, after);

  const lum = await page.evaluate(async files => {
    const read = src => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, peak = 0, hot = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += L; if (L > peak) peak = L; if (L > 240) hot++; n++;
        }
        res({ mean: sum / n, peak, hotPct: hot / n * 100 });
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    const o = {};
    for (const k of Object.keys(files)) o[k] = await read(files[k]);
    return o;
  }, { A: 'data:image/png;base64,' + fs.readFileSync(A_shot.file).toString('base64'),
       B: 'data:image/png;base64,' + fs.readFileSync(B_shot.file).toString('base64'),
       C: 'data:image/png;base64,' + fs.readFileSync(C_shot.file).toString('base64') });

  await browser.close();

  const line = '='.repeat(84);
  console.log(`\n${line}\nW-GLOW-SPRITE — ${BLD}   §PHOTO_GLOW_SPRITE vs the §PHOTO_EMBER dead end\n${line}`);
  console.log(`scene       ${guidMapN} guidMap entries, models streamed: ${want.join(', ') || '(single-model DB)'}`);
  console.log(`camera      Alt+C plan poseAt(${T})  at (${cam.pose.x.toFixed(1)}, ${cam.pose.y.toFixed(1)}, ${cam.pose.z.toFixed(1)}) -> (${cam.pose.tx.toFixed(1)}, ${cam.pose.ty.toFixed(1)}, ${cam.pose.tz.toFixed(1)})`);
  console.log(`fixtures    ${fixtures} luminaires from the shared vocabulary (A._nightFixtureWorldPositions)`);
  console.log(`\n--- 1. materialsMutated — the whole point of the mechanism`);
  console.log(`  scene materials tracked      ${before.length}`);
  console.log(`  mutated WHILE the still is up ${dDuring.n}${dDuring.eg.length ? '\n      ' + dDuring.eg.join('\n      ') : ''}`);
  console.log(`  mutated after teardown        ${dAfter.n}${dAfter.eg.length ? '\n      ' + dAfter.eg.join('\n      ') : ''}`);
  console.log(`\n--- 2. sprites staged`);
  console.log(`  during night NAVIGATION      ${navSprites}   (still-only; must be 0)`);
  console.log(`  A as-shipped                 ${A_shot.sprites}   bloom=${A_shot.bloom}  drawCalls=${A_shot.calls}`);
  console.log(`  B bloom only                 ${B_shot.sprites}   bloom=${B_shot.bloom}  drawCalls=${B_shot.calls}`);
  console.log(`  C glow sprites               ${C_shot.sprites}   bloom=${C_shot.bloom}  drawCalls=${C_shot.calls}  (delta vs A: ${C_shot.calls - A_shot.calls})`);
  console.log(`  after teardown               ${afterSprites}   (must be 0 — must not outlive its still)`);
  console.log(`\n--- 3. luminance at one pose (fold cost A ${(A_shot.ms / 1000).toFixed(1)}s  B ${(B_shot.ms / 1000).toFixed(1)}s  C ${(C_shot.ms / 1000).toFixed(1)}s)`);
  ['A', 'B', 'C'].forEach(k => {
    const l = lum[k];
    if (l) console.log(`  ${k}  mean ${l.mean.toFixed(2)}   peak ${l.peak.toFixed(0)}   hot>240 ${l.hotPct.toFixed(3)}%`);
  });
  if (lum.A && lum.C) {
    console.log(`  C vs A  mean ${((lum.C.mean / Math.max(0.01, lum.A.mean) - 1) * 100).toFixed(1)}%   hot ${lum.A.hotPct.toFixed(3)}% -> ${lum.C.hotPct.toFixed(3)}%`);
    console.log(`  C vs B  mean ${((lum.C.mean / Math.max(0.01, lum.B.mean) - 1) * 100).toFixed(1)}%   (isolates the sprites from bloom's own contribution)`);
  }

  const clean   = dDuring.n === 0 && dAfter.n === 0;
  const staged  = fixtures > 0 && C_shot.sprites === fixtures && navSprites === 0 && afterSprites === 0;
  const reaches = !!(lum.A && lum.C) && (lum.C.hotPct > lum.B.hotPct * 1.5 || lum.C.mean > lum.B.mean * 1.02);
  console.log(`\nVERDICT     ${!clean ? 'FAIL — ' + dDuring.n + '/' + dAfter.n + ' scene materials mutated; the blocker is NOT solved'
    : !staged ? 'FAIL — staging wrong: ' + C_shot.sprites + ' sprites for ' + fixtures + ' fixtures (nav ' + navSprites + ', after ' + afterSprites + ')'
    : reaches ? 'PASS — 0 materials touched, ' + C_shot.sprites + '/' + fixtures + ' fixtures lit, and it reaches the frame'
    : 'PARTIAL — 0 materials touched and all fixtures staged, but the pixels did not move: glow is not reaching the frame'}`);
  console.log(`stills      ${A_shot.file}\n            ${B_shot.file}\n            ${C_shot.file}`);
  console.log(`\n--- § log lines`);
  console.log(logs.filter(l => /§PHOTO_GLOW_SPRITE|§PHOTO_EMBER|§NIGHT_MODE|§NIGHT_STILL_LIGHTS|PAGEERROR/.test(l)).join('\n'));
  process.exit(clean && staged ? 0 : 1);
})();
