// WITNESS: GEOMETRY_TRUTH_CHAIN.md §S3 — render-time FIDELITY (link 2 of the truth chain).
//
// THE ISSUE THIS PROVES OR DISPROVES: "did REAL geometry reach the scene, or box proxies?"
// On 2026-07-01 the Modeller rendered 3,225/3,225 SampleCastle elements as 12-triangle bounding
// boxes — 100% fake — and ALL 32 Modeller witnesses stayed green, because every one of them
// asserts something a box satisfies IDENTICALLY to a real mesh (counts, bbox centres/extents,
// pixel-diffs). The only detector that ever fired was a human eye on a screenshot.
//
// This witness asserts the ONE metric a box cannot fake: the triangle census. A box is exactly 12
// triangles; real meshes are not. Measured separation (2026-07-20, S0): Duplex green 126.8
// tris/element vs 12.0 when the geometry substrate is missing — 10.6×, unambiguous.
//
// AND IT ASSERTS WHAT THE OLD GUARDS MISS: in that same broken run `§GEOM-HARDFAIL total=0` and
// `§BLOB_MISS`=0 — both existing guards reported ALL CLEAN while rendering 100% boxes, because
// they only detect per-element breaks INSIDE a substrate that loaded, never whole-substrate loss.
// So hardFail/blobMiss are recorded here but are NOT sufficient; tris/element is load-bearing.
//
// GREEN + RED, both required (a tripwire never shown to trip is not a tripwire):
//   node modeller/tests/witness_render_fidelity.js            → all fixtures verdict=REAL
//   BREAK=1 node modeller/tests/witness_render_fidelity.js    → verdict=FAKE, and this script
//                                                               exits NON-ZERO if it does not trip
// The RED case injects the fault at the loader's own seam (a resident's geoDb repointed at a
// nonexistent file, taking the shipped meta-only fallback). NO DB FILE IS EVER TOUCHED — per the
// user's standing 2026-07-19 do-not-touch-DBs directive.
//
// Requires a static server for the worktree (default :8399, the standing sandbox).

const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8399;
const BREAK = process.env.BREAK === '1';
// Default fixtures: seconds-to-~1min. Hospital/Terminal fulls are opt-in (FIXTURES=... , ~6 min each).
const FIXTURES = (process.env.FIXTURES || 'SampleHouse,Duplex,SampleCastle,HHS').split(',');
const URL = `http://localhost:${PORT}/modeller/modeller.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Baselines MEASURED 2026-07-20 (S0), never invented. A box population sits at exactly 12.0;
// the lowest real fixture measured 73.6. 24 = 2× the box signature: comfortably above every
// possible all-box run, comfortably below every measured real one.
const BOX_TRIS = 12;
const REAL_MIN_TPE = 24;

function census() {
  const A = window.A;
  if (!A || !A.scene) return { err: 'no scene' };
  let tris = 0, meshes = 0, batched = 0, instanced = 0, standalone = 0;
  A.scene.traverse(o => {
    const g = o.geometry;
    if (!g || !o.visible) return;
    let t = 0;
    if (g.index) t = g.index.count / 3;
    else if (g.attributes && g.attributes.position) t = g.attributes.position.count / 3;
    if (o.isInstancedMesh) { t *= o.count; instanced++; }
    else if (o.isBatchedMesh) { batched++; }
    else if (o.isMesh) { standalone++; }
    else return;
    tris += t; meshes++;
  });
  return { tris: Math.round(tris), meshes, batched, instanced, standalone };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const results = [];
  let failures = 0;

  try {
    for (const key of FIXTURES) {
      const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', m => logs.push(m.text()));
      page.on('pageerror', e => logs.push('PAGEERR: ' + e.message));

      if (BREAK) await page.addInitScript(() => { window.__BREAK_GEO = true; });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.STRWalkerOutliner && window.A && window.A.scene, { timeout: 60000 });
      await sleep(1500);

      const res = await page.evaluate((k) => {
        const SW = window.STRWalkerOutliner;
        const r = SW._residents.find(x => x.key === k);
        if (!r) return { err: 'no resident ' + k };
        if (window.__BREAK_GEO) r.geoDb = 'NO_SUCH_mesh.db';   // fault injection; no DB file touched
        SW._openResident(r);
        return { db: r.db, geoDb: r.geoDb || null };
      }, key);
      if (res.err) { console.log(`§RENDER_FIDELITY building=${key} ERROR ${res.err}`); failures++; await ctx.close(); continue; }

      // The §GEOM-HARDFAIL summary is the end-of-seed marker.
      let seeded = false;
      for (let i = 0; i < 180; i++) {
        if (logs.some(l => /§GEOM-HARDFAIL total=/.test(l))) { seeded = true; break; }
        await sleep(2000);
      }
      await sleep(3000);

      const c = await page.evaluate(census);
      const hfLine = logs.find(l => /§GEOM-HARDFAIL total=/.test(l)) || '';
      const hardFail = parseInt((hfLine.match(/total=(\d+)/) || [, '0'])[1], 10);
      const elements = parseInt((hfLine.match(/of (\d+)/) || [, '0'])[1], 10);
      const blobMiss = logs.filter(l => /§BLOB_MISS|§RANGE_BLOB_MISS/.test(l)).length;
      const idLine = logs.find(l => /§DB_IDENTITY/.test(l)) || '(none)';
      const tpe = elements > 0 ? c.tris / elements : 0;

      // verdict: REAL = comfortably above the box signature. FAKE = at/below it (all-box).
      // PARTIAL = in between, i.e. a mixed population — still a failure, still worth naming.
      let verdict = 'FAKE';
      if (tpe >= REAL_MIN_TPE) verdict = 'REAL';
      else if (tpe > BOX_TRIS * 1.05) verdict = 'PARTIAL';

      console.log(`§RENDER_FIDELITY building=${key} tris=${c.tris} elements=${elements} ` +
        `trisPerElement=${tpe.toFixed(1)} blobMiss=${blobMiss} hardFail=${hardFail} verdict=${verdict}`);
      console.log('  ' + idLine.replace(/^\S+\s/, ''));
      if (!seeded) console.log('  ⚠ seed marker never appeared — census may be premature');

      results.push({ key, verdict, tpe: +tpe.toFixed(1), tris: c.tris, elements, blobMiss, hardFail, seeded });

      if (BREAK) {
        // RED: the tripwire MUST trip, and MUST prove it caught what the old guards did not.
        if (verdict === 'REAL') { console.log(`  ✗ RED FAIL ${key}: fault injected but verdict=REAL — tripwire did not trip`); failures++; }
        else {
          console.log(`  ✓ RED OK ${key}: verdict=${verdict} at ${tpe.toFixed(1)} tris/element (box signature=${BOX_TRIS})`);
          if (hardFail === 0 && blobMiss === 0)
            console.log(`  ✓ RED CONFIRMS §S0(c): old guards silent (hardFail=0 blobMiss=0) while 100% boxes render`);
        }
      } else {
        if (verdict !== 'REAL') { console.log(`  ✗ GREEN FAIL ${key}: verdict=${verdict} at ${tpe.toFixed(1)} tris/element`); failures++; }
        if (blobMiss > 0) { console.log(`  ✗ GREEN FAIL ${key}: blobMiss=${blobMiss}`); failures++; }
        if (hardFail > 0) { console.log(`  ✗ GREEN FAIL ${key}: hardFail=${hardFail}`); failures++; }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }

  console.log('\n§RENDER_FIDELITY_SUMMARY mode=' + (BREAK ? 'RED(fault-injected)' : 'GREEN') +
    ' fixtures=' + results.length + ' failures=' + failures);
  console.log(JSON.stringify(results, null, 1));
  process.exit(failures ? 1 : 0);
})();
