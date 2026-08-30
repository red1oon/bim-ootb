// ⚠ DO NOT REMOVE — Scope guard
// W-GLASS-NOT-METAL — prompts/LTU_TERMINAL_CLINIC_RENDER_CORRUPTION.md §X
//
// THE ISSUE THIS TEST EXPOSES: Clinic's curtain-wall glazing renders as steel, not glass. STD_MAT
// and TRIPLANAR_MAT are keyed on ifc_class ALONE, so an element carrying a real transparent IFC
// material still received its class's OPAQUE PBR preset. Clinic authors its glazing as IfcPlate,
// whose preset is "steel plate" (metal 0.70, envInt 0.05) plus the _TRI_METAL triplanar texture.
//
// THE ORACLE IS IN THE BUILDING ITSELF: Clinic has the SAME IFC material `0.000,0.502,0.753,0.100`
// on BOTH IfcWindow (58 elements) and IfcPlate (167 elements). Same rgba, same alpha, same
// discipline — so any difference in how they render is caused by ifc_class alone, and IfcWindow
// (metal 0.00) is the known-good rendering of that exact material. The test asserts the two agree.
//
// Measured on live GH Pages BEFORE the fix:
//   0.000,0.502,0.753,0.100|IfcWindow → metalness=0    envMapIntensity=0.6  triplanar=false
//   0.000,0.502,0.753,0.100|IfcPlate  → metalness=0.7  envMapIntensity=0.05 triplanar=true
// i.e. 167 of Clinic's 225 glass panels (74%) rendered as metal. No X-ray involved — this is a
// different mechanism from §B/§W's X-ray restore bug, which is separately fixed and verified.
//
// §-log first — READ tests/witness_glass_not_metal_2026-08-30.log before any conclusion.
// Run:  timeout 900 node viewer/tests/witness_glass_not_metal_2026-08-30.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream',
  '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.bin':'application/octet-stream', '.jpg':'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = b => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); };
  fs.readFile(path.join(ROOT, p), (e, b) => { if (!e) return send(b);
    fs.readFile(path.join(DATA_ROOT, p), (e2, b2) => { if (!e2) return send(b2); res.writeHead(404); res.end('404 ' + p); }); });
});
const log = []; let fails = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const save = () => fs.writeFileSync(path.join(__dirname, 'witness_glass_not_metal_2026-08-30.log'), log.join('\n') + '\n');

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  S('── W-GLASS-NOT-METAL — witness_glass_not_metal_2026-08-30 ──');
  S('   ISSUE: does a transparent IFC material get its class\'s OPAQUE metal preset?');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=buildings/Clinic_extracted.db',
    { waitUntil: 'domcontentloaded', timeout: 180000 });
  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
      && Object.keys(window.APP.guidMap || {}).length > 0)); }
  V(ready, 'Clinic loaded and finished streaming');
  if (!ready) { S('\n❌ ABORT'); save(); await browser.close(); server.close(); process.exit(1); }

  const r = await page.evaluate(() => {
    const A = window.APP;
    const pick = frag => { const k = Object.keys(A._matCache || {}).filter(x => x.indexOf(frag) === 0)[0];
      if (!k) return null; const m = A._matCache[k];
      return { k, hex: m.color ? m.color.getHexString() : '?', op: +(m.opacity || 0).toFixed(3),
               tr: !!m.transparent, metal: m.metalness === undefined ? null : +m.metalness.toFixed(3),
               rough: m.roughness === undefined ? null : +m.roughness.toFixed(3),
               envI: m.envMapIntensity === undefined ? null : +m.envMapIntensity.toFixed(3),
               tri: !!m._triplanarShader }; };
    const all = Object.keys(A._matCache || {}).map(k => { const m = A._matCache[k];
      return { k, op: +(m.opacity || 0).toFixed(3), metal: m.metalness === undefined ? 0 : m.metalness,
               tri: !!m._triplanarShader, envI: m.envMapIntensity === undefined ? null : m.envMapIntensity }; });
    const q = s => { try { const x = A.db.exec(s); return x.length ? x[0].values : []; } catch (e) { return []; } };
    return { win: pick('0.000,0.502,0.753,0.100|IfcWindow'),
             plate: pick('0.000,0.502,0.753,0.100|IfcPlate'),
             all,
             dbCounts: q("SELECT ifc_class, COUNT(*) FROM elements_meta WHERE material_rgba='0.000,0.502,0.753,0.100' GROUP BY 1") };
  });

  S('\n   [DB] elements carrying the glass material 0.000,0.502,0.753,0.100:');
  r.dbCounts.forEach(c => S('       ' + c[0] + ' = ' + c[1]));
  S('   [oracle ] ' + JSON.stringify(r.win));
  S('   [subject] ' + JSON.stringify(r.plate));
  V(!!r.win && !!r.plate, 'both IfcWindow and IfcPlate materials exist for the SAME rgba (the oracle pair)');
  if (!r.win || !r.plate) { S('\n❌ ABORT — oracle pair absent'); save(); await browser.close(); server.close(); process.exit(1); }

  V(r.win.op === r.plate.op, 'same rgba → same opacity on both classes', r.win.op + ' vs ' + r.plate.op);
  V(r.plate.metal === 0, 'THE BUG: IfcPlate glazing is NOT metallic (was 0.7 = STD_MAT "steel plate")',
    'metalness=' + r.plate.metal);
  V(r.plate.metal === r.win.metal, 'IfcPlate metalness now matches the IfcWindow oracle for the identical material',
    r.plate.metal + ' vs oracle ' + r.win.metal);
  V(r.plate.envI === r.win.envI, 'IfcPlate envMapIntensity matches the oracle (was 0.05 vs 0.6 — no reflection = no glass read)',
    r.plate.envI + ' vs oracle ' + r.win.envI);
  V(r.plate.tri === false, 'IfcPlate glazing carries no metal triplanar texture', 'triplanar=' + r.plate.tri);

  // Generalisation: the rule is "a transparent surface is never a metal", not a per-class patch.
  const trans = r.all.filter(m => m.op < 0.999);
  const badMetal = trans.filter(m => m.metal > 0);
  const badTri = trans.filter(m => m.tri);
  S('\n   [general] transparent materials in the build = ' + trans.length +
    ', metallic = ' + badMetal.length + ', triplanar = ' + badTri.length);
  badMetal.concat(badTri).slice(0, 6).forEach(m => S('       offender ' + m.k + ' op=' + m.op + ' metal=' + m.metal + ' tri=' + m.tri));
  V(trans.length > 0, 'the build really has transparent materials to judge (not vacuous)', 'n=' + trans.length);
  V(badMetal.length === 0, 'no transparent material is metallic anywhere in the build', badMetal.length + ' metallic');
  V(badTri.length === 0, 'no transparent material carries a triplanar surface-wear texture', badTri.length + ' triplanar');

  S('\n── VERDICT ──');
  S('   ' + (fails === 0 ? '🟢 W-GLASS-NOT-METAL PASS' : '🔴 W-GLASS-NOT-METAL FAIL (' + fails + ')'));
  save(); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
