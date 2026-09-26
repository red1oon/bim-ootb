#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-COLOR-PARITY: the Modeller paints each element's REAL IFC colour (MODELLER_MASTER row 11).
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_COLOR_PARITY.md. Real Open of Duplex + HHS. Read the log after every run.
 * ISSUE: arc_editable.js stamped a per-CLASS cosmetic PALETTE; elements_meta.material_rgba's r,g,b (what the Viewer paints,
 *   streaming.js §S265c) was never used — only its alpha.
 *   C1 REAL          — every seeded mesh whose element has a parseable material_rgba renders that colour (±1/255).
 *   C2 FALLBACK      — every element with NULL rgba keeps its class PALETTE colour (INCONCLUSIVE when none exist).
 *   C3 NOT-VACUOUS   — ≥1 real-colour mesh AND ≥1 whose real colour differs from its PALETTE colour (else INCONCLUSIVE).
 *   C4 GLASS         — Duplex windows with authored alpha 0.1 still render transparent at 0.1 (§MAT-PARITY holds).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-COLOR-PARITY ═══');
  const R = {};
  for (const KEY of ['Duplex', 'HHS']) {
    const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { const t = m.text(); if (/§COLOR-PARITY/.test(t)) console.log('    ' + t.slice(0, 200)); });
    await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load' });
    await pg.waitForFunction('window.__sceneReady === true && !!window.ArcEditable', { timeout: 60000 });
    await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${KEY}"]`); await pg.click(`#m-open-panel .mo-row[data-key="${KEY}"]`);
    await pg.waitForFunction(k => window.__dwName === k && window.Bonsai.oplog.length > 0 && !!window.__arcGuidByFid && !!window.__dwBuf, { timeout: 300000, polling: 500 }, KEY);
    await new Promise(r => setTimeout(r, 3000));
    R[KEY] = await pg.evaluate(() => {
      const db = new window.SQL.Database(new Uint8Array(window.__dwBuf)), rgbaOf = {}, clsOf = {};
      const q = db.exec('SELECT guid, ifc_class, material_rgba FROM elements_meta');
      (q[0] ? q[0].values : []).forEach(v => { rgbaOf[v[0]] = v[2]; clsOf[v[0]] = v[1]; });
      db.close();
      const A = window.ArcEditable, g = window.Bonsai.group(), gbf = window.__arcGuidByFid;
      let real = 0, realDiff = 0, realBad = [], pal = 0, palBad = [], glass = 0, glassBad = 0;
      const tol = 1.5 / 255;
      g.children.forEach(m => {
        if (!m.isMesh || !m.userData || m.userData.featureId == null || m.userData.anchor) return;
        const guid = gbf[m.userData.featureId]; if (!guid || !(guid in rgbaOf)) return;
        const rgba = rgbaOf[guid], cls = clsOf[guid], c = m.material.color;
        // independent oracle: the authored r,g,b parsed here, not through the code under test
        const pp = rgba && rgba.indexOf(',') >= 0 ? rgba.split(',').map(Number) : null;
        const want = pp && pp.length >= 3 && pp.slice(0, 3).every(v => isFinite(v) && v >= 0 && v <= 1)
          ? (Math.round(pp[0] * 255) << 16) | (Math.round(pp[1] * 255) << 8) | Math.round(pp[2] * 255) : null;
        if (want != null) {
          real++;
          const w = [(want >> 16 & 255) / 255, (want >> 8 & 255) / 255, (want & 255) / 255];
          if (Math.abs(c.r - w[0]) > tol || Math.abs(c.g - w[1]) > tol || Math.abs(c.b - w[2]) > tol) { if (realBad.length < 3) realBad.push({ guid, cls, rgba, got: c.getHexString() }); else realBad.push(0); }
          if (want !== A.colorFor(cls, null)) realDiff++;
          const a = Number(rgba.split(',')[3]);
          if (cls === 'IfcWindow' && a < 1) { glass++; if (!(m.material.transparent && Math.abs(m.material.opacity - a) < 1e-6)) glassBad++; }
        } else {
          pal++;
          if (c.getHex() !== A.colorFor(cls, null)) { if (palBad.length < 3) palBad.push({ guid, cls, got: c.getHexString() }); else palBad.push(0); }
        }
      });
      return { real, realDiff, realBad: realBad.length, realBadEx: realBad.filter(Boolean), pal, palBad: palBad.length, palBadEx: palBad.filter(Boolean), glass, glassBad };
    });
    R[KEY].errs = errs.length;
    console.log('  §COLOR ' + KEY + ' ' + JSON.stringify(R[KEY]));
    await pg.close();
  }
  const D = R.Duplex, H = R.HHS;
  chk('C1 REAL (authored rgba → that colour, ±1/255)', D.real > 0 && H.real > 0 && D.realBad === 0 && H.realBad === 0, 'Duplex ' + D.real + ' (bad ' + D.realBad + ') · HHS ' + H.real + ' (bad ' + H.realBad + ') ' + JSON.stringify(D.realBadEx.concat(H.realBadEx)));
  if (D.pal + H.pal === 0) console.log('  ⚪ C2 FALLBACK INCONCLUSIVE — every seeded element has an authored rgba (Duplex ' + D.real + ', HHS ' + H.real + '); nothing to judge');
  else chk('C2 FALLBACK (NULL rgba → class PALETTE)', D.palBad === 0 && H.palBad === 0, 'Duplex ' + D.pal + ' (bad ' + D.palBad + ') · HHS ' + H.pal + ' (bad ' + H.palBad + ') ' + JSON.stringify(D.palBadEx.concat(H.palBadEx)));
  const nv = D.realDiff > 0 && H.realDiff > 0;
  if (!nv) console.log('  ⚪ C3 INCONCLUSIVE — no element whose real colour differs from the palette; C1 would pass unchanged');
  chk('C3 NOT-VACUOUS (real colours that differ from the palette exist)', nv, 'Duplex ' + D.realDiff + ' · HHS ' + H.realDiff);
  chk('C4 GLASS (Duplex authored-alpha windows stay transparent at their alpha)', D.glass > 0 && D.glassBad === 0, 'windows=' + D.glass + ' bad=' + D.glassBad);
  chk('C5 NO-ERROR', D.errs === 0 && H.errs === 0, 'errs=' + D.errs + '/' + H.errs);
  console.log('W-COLOR-PARITY: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
