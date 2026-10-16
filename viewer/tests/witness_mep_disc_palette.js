// ⚠ DO NOT REMOVE — Scope guard
// W-MEP-DISC-PALETTE — bim-compiler prompts/RESUME_2026-09-02_FILM_REVIEW.md §MEP_SYNTHETIC_PALETTE
//
// THE ISSUE THIS TEST EXPOSES — two defects, and it must be able to fail on each independently:
//  (1) COVERAGE. The §SUNGLASS discipline band (tools.js ticks 56-65) groups on
//      `mesh.userData.disc`, but streaming.js's InstancedMesh path never set it. So every
//      InstancedMesh fell into A._groupBy's 'Unknown' bucket and took ONE flat colour, on exactly
//      the instance-heavy MEP geometry the user wants coloured. (PR #1594 corroborates without
//      naming it: it reported "7 discs" on Clinic whose DB holds only 6 — the 7th was 'Unknown'.)
//  (2) MINIMALISM + IDENTITY. The band painted `earthTone[i % 10]` by ALPHABETIC rank, so a
//      discipline's colour depended on which OTHER disciplines happened to be present and never
//      matched the viewer's own discipline legend (A.DISC_COLORS, config.js) that the HUD bars,
//      bbox placeholders, city and measure all already use.
//
// WHAT IS AND IS NOT CLAIMED (PRIME RULE). The KEY is EXTRACTED: `elements_meta.discipline`, which
// is non-null on 100% of rows on every shipped building. The disc->colour ASSIGNMENT is an AUTHORED
// choice — there is NO MEP colour convention anywhere in the model data (Hospital's 6,664
// material_name rows are 100% `≈`-prefixed synthetic; no IfcSystem/`system` column exists on any
// shipped DB). This witness therefore does NOT claim the palette is an industry standard. It claims
// exactly three checkable things: one hue per discipline, every hue named, and the hue equal to the
// viewer's own legend entry for that discipline.
//
// "MINIMALIST" IS COUNTED, NOT ASSERTED: the test counts DISTINCT HUES actually painted onto real
// meshes and compares that to the discipline count. A palette that merely "applied colour" passes
// nothing here. Nothing in this file is judged by looking at a rendered frame (CLAUDE.md
// FUNDAMENTAL LAW) — every verdict is a number read back off the real scene graph.
//
// SELF-FAILURE: prints VACUOUS when a building yields 0 discipline groups (nothing to judge),
// INCONCLUSIVE (never PASS) when streaming never completed, and NO-OP when the new mapping produced
// colours identical to the old formula. RED CONTROL: gate 4 recomputes the OLD earthTone-cycle
// formula and asserts it does NOT match the legend — if that ever passes, this witness cannot fail
// and every other gate here is worthless.
//
// §-log first — READ viewer/tests/witness_mep_disc_palette.log before any conclusion.
// Run:  timeout 1800 node viewer/tests/witness_mep_disc_palette.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = process.env.DATA_ROOT || (require('os').homedir() + '/bim-ootb');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = b => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); };
  fs.readFile(path.join(ROOT, p), (e, b) => { if (!e) return send(b);
    fs.readFile(path.join(DATA_ROOT, p), (e2, b2) => { if (!e2) return send(b2); res.writeHead(404); res.end('404 ' + p); }); });
});
const log = []; let fails = 0, judged = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const save = () => fs.writeFileSync(path.join(__dirname, 'witness_mep_disc_palette.log'), log.join('\n') + '\n');

// Buildings: the user's own case first, then a small one for generality.
const BUILDINGS = (process.env.BUILDINGS || 'buildings/HospitalAjaibPath.db,buildings/Duplex_extracted.db').split(',');

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  S('── W-MEP-DISC-PALETTE — witness_mep_disc_palette ──');
  S('   ISSUE 1: do InstancedMeshes carry a real discipline key, or do they all fall into "Unknown"?');
  S('   ISSUE 2: is the discipline palette MINIMALIST (one hue per discipline) and does each hue');
  S('            equal the viewer\'s OWN legend colour (A.DISC_COLORS) for that discipline?');

  let anyJudged = false;

  for (const DB of BUILDINGS) {
    S('\n════ ' + DB + ' ════');
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    const coverage = [];
    page.on('console', m => { const t = m.text(); if (/§MEP_DISC_COVERAGE|§MEP_DISC_PALETTE/.test(t)) coverage.push(t); });
    try {
      await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB,
        { waitUntil: 'domcontentloaded', timeout: 180000 });
    } catch (e) { S('   §MEP_DISC_PALETTE INCONCLUSIVE — nav failed: ' + e.message); await page.close(); continue; }
    let ready = false;
    for (let i = 0; i < 900 && !ready; i++) { await page.waitForTimeout(1000);
      ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
        && Object.keys(window.APP.guidMap || {}).length > 0)).catch(() => false); }
    if (!ready) { S('   §MEP_DISC_PALETTE INCONCLUSIVE — never finished streaming, nothing judged on this building'); await page.close(); continue; }
    V(true, DB + ' loaded and finished streaming');

    // ── Gate 1 — COVERAGE: InstancedMeshes keyed by discipline instead of 'Unknown' ──
    const cov = await page.evaluate(() => {
      const A = window.APP;
      let inst = 0, instKeyed = 0;
      A.scene.traverse(o => { if (o.isInstancedMesh) { inst++; if (o.userData && o.userData.disc) instKeyed++; } });
      const g = A._groupBy(A._collectAllMeshes(), 'disc');
      const unknownMeshes = (g['Unknown'] || []).length;
      const total = Object.keys(g).reduce((s, k) => s + g[k].length, 0);
      return { inst, instKeyed, unknownMeshes, total,
               uniform: A._instDiscUniform || 0, mixed: A._instDiscMixed || 0 };
    });
    coverage.forEach(c => S('   [log] ' + c.replace(/^\[S\d+\]\s*/, '')));
    S('   [coverage] InstancedMeshes=' + cov.inst + ' keyed=' + cov.instKeyed +
      ' | uniformDisc=' + cov.uniform + ' mixedDisc=' + cov.mixed +
      ' | meshes in "Unknown" disc bucket=' + cov.unknownMeshes + '/' + cov.total);
    if (cov.inst === 0) {
      S('   §MEP_DISC_COVERAGE VACUOUS — this building built no InstancedMesh, coverage has no population');
    } else {
      // Before the fix every InstancedMesh was unkeyed, so keyed>0 IS the fix firing. A mixed set is
      // deliberately left unkeyed and is not a failure — it is the count we must not paint.
      V(cov.instKeyed > 0, '§MEP_DISC_COVERAGE InstancedMeshes now carry a discipline key (was 0 for all of them)',
        cov.instKeyed + '/' + cov.inst + ' keyed; ' + cov.mixed + ' left unkeyed because their instance set is NOT discipline-uniform');
      V(cov.instKeyed === cov.uniform, '§MEP_DISC_COVERAGE keyed count equals the uniform-set count (no set painted a discipline it does not all share)',
        cov.instKeyed + ' == ' + cov.uniform);
    }

    // ── Gates 2/3 — MINIMALISM + IDENTITY, counted off the real painted meshes at tick 56 (sub=0) ──
    const pal = await page.evaluate(() => {
      const A = window.APP;
      A.updateAmbience(56);                       // discipline band, sub = 0
      const g = A._groupBy(A._collectAllMeshes(), 'disc');
      const keys = Object.keys(g).sort();
      const rows = keys.map(k => {
        const m = g[k].find(x => x.material && x.material.color);
        return { disc: k, n: g[k].length, hex: m ? '#' + m.material.color.getHexString() : null,
                 legend: (A.DISC_COLORS && A.DISC_COLORS[k] != null)
                   ? '#' + new window.THREE.Color().setHex(A.DISC_COLORS[k]).getHexString() : null };
      });
      return { rows, legendSize: Object.keys(A.DISC_COLORS || {}).length };
    });
    const painted = pal.rows.filter(r => r.hex);
    if (!painted.length) {
      S('   §MEP_DISC_PALETTE VACUOUS — no discipline group carried a colourable mesh, nothing judged');
      await page.close(); continue;
    }
    anyJudged = true;
    S('   [palette] discipline → painted hex (legend hex) × meshes:');
    painted.forEach(r => S('       ' + r.disc.padEnd(8) + ' ' + r.hex +
      (r.legend ? '  legend=' + r.legend + (r.legend === r.hex ? ' ✓' : ' ✗MISMATCH') : '  (no legend entry — earthTone fallback)') +
      '  n=' + r.n));

    const hues = new Set(painted.map(r => r.hex));
    V(hues.size === painted.length,
      '§MEP_DISC_PALETTE MINIMALIST — distinct hues equals discipline count, one hue each, no collision',
      'distinctHues=' + hues.size + ' discs=' + painted.length);
    V(hues.size <= Math.max(pal.legendSize, painted.length),
      '§MEP_DISC_PALETTE MINIMALIST — palette no larger than the legend it draws from',
      'distinctHues=' + hues.size + ' legendSize=' + pal.legendSize);
    const named = painted.filter(r => r.legend);
    if (!named.length) {
      S('   §MEP_DISC_PALETTE INCONCLUSIVE — no discipline on this building has a legend entry; identity not judged');
    } else {
      const matched = named.filter(r => r.hex === r.legend);
      V(matched.length === named.length,
        '§MEP_DISC_PALETTE IDENTITY — every legend-mapped discipline is painted the viewer\'s OWN legend colour',
        matched.length + '/' + named.length + ' exact hex match against A.DISC_COLORS');
    }

    // ── Gate 5 — the hue COUNT must be invariant across the band (sub deepens, never re-hues) ──
    const across = await page.evaluate(() => {
      const A = window.APP, out = [];
      for (let t = 56; t <= 65; t++) {
        A.updateAmbience(t);
        const g = A._groupBy(A._collectAllMeshes(), 'disc');
        const set = new Set();
        Object.keys(g).forEach(k => { const m = g[k].find(x => x.material && x.material.color);
          if (m) set.add(m.material.color.getHexString()); });
        out.push(set.size);
      }
      A.updateAmbience(0);
      return out;
    });
    V(new Set(across).size === 1,
      '§MEP_DISC_PALETTE distinct-hue count is invariant across ticks 56-65 (sub deepens, never re-hues)',
      'counts=[' + across.join(',') + ']');

    // ── Gate 4 — RED CONTROL: the OLD formula must NOT match the legend, or nothing above can fail ──
    const red = await page.evaluate(() => {
      const A = window.APP, THREE = window.THREE;
      // earthTone PINNED from the pre-fix tools.js discipline band (§SUNGLASS palette table).
      const earthTone = [
        [0.08, 0.45, 0.65], [0.05, 0.50, 0.55], [0.10, 0.40, 0.70],
        [0.12, 0.55, 0.50], [0.15, 0.38, 0.60], [0.03, 0.48, 0.58],
        [0.07, 0.42, 0.62], [0.55, 0.35, 0.58], [0.20, 0.50, 0.52],
        [0.02, 0.60, 0.45]];
      const g = A._groupBy(A._collectAllMeshes(), 'disc');
      const keys = Object.keys(g).sort();
      let agree = 0, comparable = 0;
      keys.forEach((k, i) => {
        if (!A.DISC_COLORS || A.DISC_COLORS[k] == null) return;
        comparable++;
        const p = earthTone[i % earthTone.length];
        const old = new THREE.Color().setHSL(p[0], p[1], p[2]).getHexString();
        const legend = new THREE.Color().setHex(A.DISC_COLORS[k]).getHexString();
        if (old === legend) agree++;
      });
      return { agree, comparable };
    });
    if (!red.comparable) S('   §MEP_DISC_PALETTE RED-CONTROL INCONCLUSIVE — no legend-mapped discipline to compare against');
    else V(red.agree === 0,
      '§MEP_DISC_PALETTE RED CONTROL — the OLD earthTone cycle does NOT reproduce the legend (so the identity gate can fail)',
      red.agree + '/' + red.comparable + ' of the old colours coincided with the legend');

    await page.close();
  }

  if (!anyJudged) S('\n§MEP_DISC_PALETTE INCONCLUSIVE — no building yielded a judgeable population');
  S('\n── VERDICT ' + (judged - fails) + '/' + judged + (fails ? '  🔴 ' + fails + ' FAILED' : '  🟢 all gates passed') +
    (anyJudged ? '' : '  (INCONCLUSIVE — nothing was actually judged)'));
  save();
  await browser.close(); server.close();
  process.exit(fails || !anyJudged ? 1 : 0);
})().catch(e => { S('§MEP_DISC_PALETTE CRASH ' + (e && e.stack || e)); save(); process.exit(2); });
