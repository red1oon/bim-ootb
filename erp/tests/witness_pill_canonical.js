// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the CANONICAL pill_builder (PILLS_CONSOLIDATION_REVIEW_2026-07-03 §Part A).
//   ISSUE IT PROVES / DISPROVES: the erp/viewer pill_builder.js fork silently diverged in BEHAVIOR
//   (close semantics + hover-label manifest key) with zero test catching it. This witness is designed
//   to catch a FUTURE re-fork:
//     W1 SINGLE SOURCE — exactly ONE file in the repo defines window.PillBuilder
//        (common/pill_builder.js); the old erp/ + viewer/ copies stay deleted; all six entry pages
//        (erp.html, idempiere.html, glassbowl.html, glassbowl_gravity.html, index.html, viewer.html)
//        load the common path. A second definition or a re-pointed page = re-fork = FAIL.
//     W2 CLOSE DECREE (live, per surface) — user decree 2026-07-02, applied universally: an OUTSIDE
//        tap does NOT collapse the open rail; ONLY a deliberate ⋯ tap toggles it. Exercised in a real
//        headless browser on erp.html + idempiere.html + glassbowl.html (each mounting its REAL manifest).
//     W3 HOVER CONTRACT (live, per surface) — btn.title = act.title || act.name || act.id, proven per
//        manifest: a title-carrying pill renders its rich title, a name-only pill renders its name
//        (the old erp copy fell back to raw ids; the old viewer copy dropped titles).
//     W4 ICON MAP (live) — the §ICON MAP de-collisions resolve: no §PILL_ICON_MISS on any surface, and
//        the verify pill no longer wears the checkList (UBBL) glyph.
//   Viewer surface is checked STATICALLY only (W1 + layout:'rail' opt-in) — viewer.html needs the 3D
//   stack; its ⋯ behavior shares the same single module proven live on the three erp surfaces.
//   §-log first — READ tests/witness_pill_canonical.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/witness_pill_canonical.js 2>&1 | tee tests/witness_pill_canonical.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };

let fails = 0;
function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + msg); if (!cond) fails++; }

// ══ W1 — SINGLE SOURCE (static) ═══════════════════════════════════════════════════════════════════
console.log('=== §PILL-CANON witness ===\n[W1] single source — ONE PillBuilder definition, six pages on the common path');
ok(fs.existsSync(path.join(REPO, 'common', 'pill_builder.js')), 'common/pill_builder.js exists (the canonical module)');
ok(!fs.existsSync(path.join(REPO, 'erp', 'pill_builder.js')), 'erp/pill_builder.js stays DELETED (no re-fork)');
ok(!fs.existsSync(path.join(REPO, 'viewer', 'pill_builder.js')), 'viewer/pill_builder.js stays DELETED (no re-fork)');
// any OTHER file defining window.PillBuilder = a re-fork (grep the tracked tree, excluding tests/docs)
let defs = [];
try {
  defs = execSync("grep -rl 'window.PillBuilder = PillBuilder' --include='*.js' .", { cwd: REPO })
    .toString().trim().split('\n').filter(f => f && f.indexOf('/tests/') < 0 && f.indexOf('node_modules') < 0);
} catch (e) { defs = []; }
ok(defs.length === 1 && defs[0].indexOf('common/pill_builder.js') >= 0,
   'exactly ONE PillBuilder definition in the tree: ' + JSON.stringify(defs));
const PAGES = ['erp/erp.html', 'erp/idempiere.html', 'erp/glassbowl.html', 'erp/glassbowl_gravity.html',
               'index.html', 'viewer/viewer.html'];
PAGES.forEach(p => {
  const html = fs.readFileSync(path.join(REPO, p), 'utf8');
  ok(/src="(\.\.\/)?common\/pill_builder\.js/.test(html), p + ' loads common/pill_builder.js');
  ok(!/src="(erp\/)?pill_builder\.js/.test(html), p + ' does NOT load a local pill_builder.js copy');
});
const CANON = fs.readFileSync(path.join(REPO, 'common', 'pill_builder.js'), 'utf8');
ok(CANON.indexOf('!!opts.persistent') < 0 && CANON.indexOf('_persistent =') < 0, 'canonical has NO opts.persistent knob (dead flag stays deleted)');
ok(CANON.indexOf('act.title || act.name || act.id') >= 0, 'canonical hover contract: act.title || act.name || act.id');
const PANELS = fs.readFileSync(path.join(REPO, 'viewer', 'panels.js'), 'utf8');
ok(/layout:\s*'rail'/.test(PANELS), "viewer/panels.js opts in to layout:'rail' (L-PATH stays viewer-only)");

// ══ W2/W3/W4 — LIVE, three erp surfaces off their REAL manifests ══════════════════════════════════
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
const dispOf = (page, sel) => page.$eval(sel, el => getComputedStyle(el).display).catch(() => 'absent');

// Per surface: [page, pill container, ⋯ trigger, [btnId, expected hover title, which contract leg]...]
const SURFACES = [
  ['erp/erp.html', '#erp-pill', '#erp-pill-trigger', [
    ['#pill-verify', 'Verify Ledger — hash-chain tamper check on your live op-log', 'title wins over name'],
    ['#pill-erpdoc', 'Read / Compare', 'name fallback (no title in manifest)'] ]],
  ['erp/idempiere.html', '#idmp-pill', '#idmp-pill-trigger', [
    ['#pill-rule', 'Rule', 'name fallback (no title in manifest)'] ]],
  ['erp/glassbowl.html', '#gb-pill', '#gb-pill-trigger', [
    ['#pill-trace', 'Trace a record', 'name fallback (no title in manifest)'] ]],
];
// §ICON MAP — the checkList (UBBL) glyph must no longer appear on the verify pill (W4).
const CHECKLIST_MARK = 'm9 14 2 2 4-4';   // checkList's distinctive check-stroke path

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  for (const [file, pillSel, trigSel, hoverChecks] of SURFACES) {
    const logs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    page.on('console', m => logs.push(m.text()));
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    console.log('\n[W2/W3/W4] surface=' + file);

    // open the rail (PB.close() collapses it at boot — first ⋯ tap opens)
    let open = await dispOf(page, pillSel), taps = 0;
    while (open === 'none' && taps < 3) { await page.tap(trigSel); await page.waitForTimeout(300); open = await dispOf(page, pillSel); taps++; }
    ok(open !== 'none' && open !== 'absent', '⋯ tap opens the rail (display=' + open + ')');

    // W2 — the decree: an OUTSIDE tap must NOT collapse it
    await page.mouse.click(5, 400);            // far from the bottom-right rail on every surface
    await page.waitForTimeout(400);
    const afterOutside = await dispOf(page, pillSel);
    ok(afterOutside !== 'none', 'OUTSIDE tap does NOT collapse the open rail (decree 2026-07-02) — display=' + afterOutside);

    // W3 — hover contract off the surface's REAL manifest
    for (const [btnSel, want, leg] of hoverChecks) {
      const got = await page.$eval(btnSel, el => el.title).catch(() => '(button absent)');
      ok(got === want, btnSel + ' hover="' + got + '" — expected "' + want + '" (' + leg + ')');
    }

    // W4 — icon map: new glyphs resolved (no MISS) + verify no longer wears the UBBL checkList
    const miss = logs.filter(l => l.indexOf('ICON_MISS') >= 0);
    ok(miss.length === 0, 'no §PILL_ICON_MISS on this surface (offenders=' + JSON.stringify(miss) + ')');
    if (file === 'erp/erp.html') {
      const svg = await page.$eval('#pill-verify', el => el.innerHTML).catch(() => '');
      ok(svg.indexOf(CHECKLIST_MARK) < 0 && svg.indexOf('<path') >= 0,
         'verify pill glyph is NOT checkList (UBBL stays UBBL-only) and IS a real svg');
    }

    // W2 — only the deliberate ⋯ tap collapses
    await page.tap(trigSel);
    await page.waitForTimeout(600);            // rail-mode close animates 360ms; flow closes instantly
    const closed = await dispOf(page, pillSel);
    ok(closed === 'none', '⋯ re-tap collapses the rail (display=' + closed + ')');
    const trail = logs.filter(l => l.indexOf('§PILL open=') === 0).join('->') || '(none)';
    console.log('  §PILL-CANON surface=' + file + ' trail=' + trail);
    await page.close();
  }

  await browser.close(); server.close();
  console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' ===');
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.log('✗ CRASH: ' + (e && e.message)); process.exit(1); });
