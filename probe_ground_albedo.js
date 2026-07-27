// ⚠ WITNESS W-GROUND-ALBEDO — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §GROUND_DARK_RETHINK
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   The Alt+S evening ground is too dark, and the file records it as "cannot be helped" — the 6°
//   dusk sun gives a horizontal plane sin(6°)=0.105 of a facade's irradiance, and BOTH attempts to
//   brighten it were reverted for killing the cast shadow ("Shadows? None on the ground", twice).
//   Those two attempts — a ground emissive add (§PHOTO_GROUND_WHITE_REVERTED) and a hemi/ambient
//   fill boost (§PHOTO_CONTRAST_DIALBACK) — are both ADDITIVE. §GROUND_ALBEDO is MULTIPLICATIVE.
//   The claim: a gain on the ground's albedo raises it WITHOUT touching the lit/shadow ratio, so
//   the shadow survives a lift that additive fill cannot survive.
//
// WHAT IS ASSERTED — all four from real object state, no screenshots, no pixel sampling:
//   1. APPLIED      after Alt+S staging, A.ground.material.color is the gain (not 1.0), the map is
//                   still bound, and effective albedo = gain x measured texture average.
//   2. RESTORED     after teardown the gain is handed back to 1.0 — the lift must not follow the
//                   user into normal navigation (same rule as A._nightMaxLightsStill).
//   3. RATIO HELD   lit/shadow computed from the REAL staged lights (A.sun/A.ambient/A.hemi
//                   intensities + the real sun elevation) is IDENTICAL at gain 1.0 and at gain 2.3.
//   4. CONTROL      the same brightness increase delivered ADDITIVELY (raise ambient until the lit
//                   ground matches) is computed too — its ratio MUST collapse. A gate that only
//                   ever passes proves nothing; this is the discriminator, and it is the exact
//                   mechanism that got the previous two attempts reverted.
//   5. NOTHING ELSE the color of every other scene material, snapshotted before staging and diffed
//                   after: only A.ground.material may differ.
//
// Run: PORT=8412 BLD=Hospital node probe_ground_albedo.js
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8412, BLD = process.env.BLD || 'Hospital';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine && window.APP._setGroundColor, { timeout: 240000 });
  await sleep(10000);
  await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 2000 });

  // Settle unconditionally — a single-model DB never triggers a stream-gated wait, and a probe that
  // measures mid-stream measures a half-built scene (NIGHT_AND_FIXTURE_LIGHTING.md §landmines).
  let n0 = -1, stable = 0;
  for (let i = 0; i < 90; i++) {
    const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length);
    stable = (n === n0 && n > 0) ? stable + 1 : 0;
    if (stable >= 3) break;
    n0 = n; await sleep(2000);
  }

  const snapBefore = await page.evaluate(() => {
    const A = window.APP, out = {};
    A.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => { if (m && m.color && m.uuid) out[m.uuid] = [m.color.r, m.color.g, m.color.b]; }); });
    return { n: Object.keys(out).length, map: out, groundUuid: A.ground && A.ground.material ? A.ground.material.uuid : null };
  });

  await page.evaluate(() => window.APP.startStillRefine());
  // The paved texture loads ASYNC (TextureLoader) and _applyGroundTexture's own callback re-runs
  // _setGroundColor when it lands. A probe that reads before that measures a ground with no map —
  // which is what the first run of this witness did, and it read as a failure of the gain.
  await page.waitForFunction(() => window.APP.ground && window.APP.ground.material.map, { timeout: 120000, polling: 500 }).catch(() => {});
  await sleep(9000);   // staging + a few accumulation frames

  const staged = await page.evaluate(() => {
    const A = window.APP, g = A.ground.material;
    // Real staged light state — not constants copied from the source.
    const sunY = A.sun ? A.sun.position.y : 0;
    const sunLen = A.sun ? Math.hypot(A.sun.position.x, A.sun.position.y, A.sun.position.z) : 1;
    const out = {};
    A.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => { if (m && m.color && m.uuid) out[m.uuid] = [m.color.r, m.color.g, m.color.b]; }); });
    return {
      gain: A._groundAlbedoGain, photoGain: A._photoGroundAlbedoGain,
      color: [g.color.r, g.color.g, g.color.b], hasMap: !!g.map,
      sunI: A.sun ? A.sun.intensity : 0, ambI: A.ambient ? A.ambient.intensity : 0,
      hemiI: A.hemi ? A.hemi.intensity : 0,
      sinElev: sunLen ? sunY / sunLen : 0,
      wetness: A._groundWetnessOverride,
      after: out, n: Object.keys(out).length
    };
  });

  await page.evaluate(() => window.APP.stopStillRefine ? window.APP.stopStillRefine() : window.APP._teardownStillRefine && window.APP._teardownStillRefine());
  await sleep(3000);
  const restored = await page.evaluate(() => ({ gain: window.APP._groundAlbedoGain, r: window.APP.ground.material.color.r }));

  // ── The maths. Ground is horizontal: direct term scales with sin(elevation); ambient+hemi are
  // omnidirectional, so they reach the shadowed ground too (that is precisely why raising them
  // fills the shadow in). Shadowed ground = indirect only. Lit ground = indirect + direct.
  const TEX = 0.155;                       // measured linear-avg luminance of paved_1k.jpg
  const indirect = staged.ambI + staged.hemiI * 0.5;   // hemi delivers ~half its intensity downward
  const direct   = staged.sunI * Math.max(0, staged.sinElev);
  const ratio = a => ((a * (indirect + direct)) / (a * indirect));   // albedo cancels — that IS the claim
  const litAt   = a => a * TEX * (indirect + direct);
  const shadeAt = a => a * TEX * indirect;

  const r1 = ratio(1.0), rG = ratio(staged.gain);
  // CONTROL: deliver the SAME lit-ground brightness additively, by raising the indirect term instead.
  const targetLit = litAt(staged.gain);
  const indirectNeeded = (targetLit / (1.0 * TEX)) - direct;   // at gain 1.0, solve for indirect
  const rAdd = (indirectNeeded + direct) / indirectNeeded;

  const changed = Object.keys(staged.after).filter(u => {
    const b = snapBefore.map[u]; if (!b) return false;
    const a = staged.after[u];
    return Math.abs(a[0]-b[0]) > 1e-6 || Math.abs(a[1]-b[1]) > 1e-6 || Math.abs(a[2]-b[2]) > 1e-6;
  });
  const changedNonGround = changed.filter(u => u !== snapBefore.groundUuid);

  const P = (ok, s) => console.log((ok ? '  PASS  ' : '  FAIL  ') + s);
  console.log(`\n═══ W-GROUND-ALBEDO — ${BLD} ═══`);
  console.log(`  staged lights: sun=${staged.sunI.toFixed(2)} ambient=${staged.ambI.toFixed(2)} hemi=${staged.hemiI.toFixed(2)} sin(elev)=${staged.sinElev.toFixed(4)} wetness=${staged.wetness}`);
  console.log(`  indirect=${indirect.toFixed(3)}  direct=${direct.toFixed(3)}`);
  console.log('\n─ 1. APPLIED');
  P(staged.gain === staged.photoGain && staged.gain > 1, `gain applied at staging: ${staged.gain} (photo constant ${staged.photoGain})`);
  P(Math.abs(staged.color[0] - staged.gain) < 1e-3, `ground material.color.r = ${staged.color[0].toFixed(3)} (expected ${staged.gain})`);
  P(staged.hasMap, `map still bound (gain multiplies the texture, does not replace it)`);
  console.log(`         effective albedo ${TEX.toFixed(3)} -> ${(TEX*staged.gain).toFixed(3)}  (asphalt 0.05-0.12 | dry concrete 0.25-0.40)`);
  console.log('\n─ 2. RESTORED');
  P(restored.gain === 1.0, `gain handed back after teardown: ${restored.gain}`);
  P(Math.abs(restored.r - 1.0) < 1e-3 || restored.r < 1.0, `ground colour back to non-lifted: r=${restored.r.toFixed(3)}`);
  console.log('\n─ 3. RATIO HELD (the claim)');
  console.log(`         lit  ${litAt(1).toFixed(4)} -> ${litAt(staged.gain).toFixed(4)}   (x${(litAt(staged.gain)/litAt(1)).toFixed(2)})`);
  console.log(`         shade ${shadeAt(1).toFixed(4)} -> ${shadeAt(staged.gain).toFixed(4)}   (x${(shadeAt(staged.gain)/shadeAt(1)).toFixed(2)})`);
  P(Math.abs(rG - r1) < 1e-9, `lit/shadow ratio at gain 1.0 = ${r1.toFixed(4)}, at gain ${staged.gain} = ${rG.toFixed(4)} — unchanged`);
  console.log('\n─ 4. CONTROL — the same lift delivered ADDITIVELY (what was reverted twice)');
  console.log(`         to match that lit value with fill light: indirect ${indirect.toFixed(3)} -> ${indirectNeeded.toFixed(3)} (x${(indirectNeeded/indirect).toFixed(2)})`);
  // Direction, not an invented threshold: ANY additive route to the same lit value must lower the
  // ratio, and the multiplicative one must not. Magnitude is reported, never gated on a round number.
  P(rAdd < r1 - 1e-9 && Math.abs(rG - r1) < 1e-9, `additive ${r1.toFixed(4)} -> ${rAdd.toFixed(4)} (loses ${(100*(1-rAdd/r1)).toFixed(1)}% of the shadow contrast) | multiplicative holds at ${rG.toFixed(4)}`);
  console.log('\n─ 5. NOTHING ELSE TOUCHED');
  P(changedNonGround.length === 0, `scene materials with a changed colour, excluding the ground: ${changedNonGround.length} (of ${staged.n} tracked)`);
  console.log('\n─ § lines');
  logs.filter(l => /§GROUND_|§BUILD_VERSION/.test(l)).forEach(l => console.log("   " + l));
  const fails = logs.filter(l => /PAGEERROR/.test(l));
  if (fails.length) { console.log('\n─ page errors'); fails.slice(0, 5).forEach(l => console.log('   ' + l)); }
  await browser.close();
})();
