// ⚠ DO NOT REMOVE — §GLOW_LAYERS_OFF witness (bim-compiler PHOTOREAL_STILL_RENDER.md "§GLOW_LAYERS_OFF — SPEC" + its
// CORRECTION, red1 2026-09-25: "I mean remove completely"). Read the log after every run.
// ISSUE THIS PROVES OR DISPROVES: the two decorative glow layers (the fixture bloom-sprite cloud and the fitted lens quads)
// are gone from Alt+S, and they were the prime suspect for item C (Clinic entrance shaft/blobs by day). Per building
// (Hospital, Clinic, Terminal — one Alt+S each at the default pose) it prints the page's §FIXTURE_EMISSIVE line
// (lamps=N withMesh=M withoutMesh=K) and FAILs if the line is missing or glow draws > 0. At red1's Clinic exterior pose
// (item C) it counts glow draws (scene objects of the removed layers: the old names + the old signature — Points, or an
// additive MeshBasic InstancedMesh of planes) — must be 0 — and casts a 48x25 ray grid through glass (transparent,
// opacity < 0.95) naming every first opaque hit behind glass whose material has emissive > 0 (class, material, n):
// `§ITEM_C glowDraws= emissiveBehindGlass=[...]`. The emissive list is REPORTED, not failed: it names what item C is now.
// GUARD: FAIL on "Shader Error" / "Context Lost" / pageerror. Load gate: full element count or the run is VACUOUS (FAIL).
// NO visual checks, no pixels. One browser at a time (shared GPU).
// RUN: node viewer/tests/witness_glow_removed.js <port> [outdir]      (ONLY=Clinic: one building)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8623', OUT = '/tmp/witness_glow_removed'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const RUNS0 = [
  { db: 'Hospital', full: 63182, poses: [{ name: 'default', default: true }] },
  { db: 'Clinic', full: 16071, poses: [{ name: 'default', default: true },
    { name: 'item_c_exterior_day', itemC: true, pos: [43.873, 7.747, -3.074], tgt: [-8.138, -4.599, 2.188] }] },
  { db: 'Terminal', full: 48428, poses: [{ name: 'default', default: true }] },
];
const RUNS = process.env.ONLY ? RUNS0.filter(r => r.db === process.env.ONLY) : RUNS0;

// In-page: glow draws of the removed layers. By name (the names the deleted code gave its objects) and by signature
// (THREE.Points, or an InstancedMesh of PlaneGeometry with an additive MeshBasicMaterial — what the lens quads were).
function glowDrawsInPage() {
  const T = window.THREE, A = window.APP; let byName = 0, bySig = 0, otherPoints = 0, otherSprites = 0; const seen = [], other = {};
  A.scene.traverse(o => {
    const named = /^__glow(Sprites|LensQuads)/.test(o.name || '');
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const additive = m && m.blending === T.AdditiveBlending;
    // signature of the removed layers: an additive Points cloud (the sprites) or an additive MeshBasic InstancedMesh of planes (the quads)
    const sig = !named && ((o.isPoints && additive) || (o.isInstancedMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && m && m.isMeshBasicMaterial && additive));
    if (named) byName++; if (sig) bySig++;
    if (named || sig) seen.push((o.name || o.type) + (o.visible ? '' : '(hidden)'));
    else if (o.isPoints || o.isSprite) { if (o.isPoints) otherPoints++; else otherSprites++; const k = (o.name || o.type); other[k] = (other[k] || 0) + 1; }
  });
  return { byName, bySig, glowDraws: byName + bySig, seen: seen.slice(0, 10), otherPoints, otherSprites, other };
}

// In-page: 48x25 ray grid from the camera; glass = transparent && opacity < 0.95 (passed through); the first opaque hit
// behind glass with emissive non-black and emissiveIntensity > 0 is named (class via guidMap -> elements_meta).
function itemCRays() {
  const T = window.THREE, A = window.APP, rc = new T.Raycaster(), cam = A.camera; cam.updateMatrixWorld();
  const visible = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  const matOf = h => { const m = h.object.material; if (!Array.isArray(m)) return m;
    const mi = h.face && h.face.materialIndex != null ? h.face.materialIndex : 0; return m[mi] || m[0]; };
  const guidOf = h => { const idx = h.instanceId != null ? h.instanceId : h.batchId;
    return (idx != null && A.guidMap[h.object.id + '_' + idx]) || A.guidMap[h.object.id] || (h.object.userData && h.object.userData.guid) || null; };
  const clsCache = {}; const clsOf = g => { if (!g) return '?'; if (g in clsCache) return clsCache[g];
    let c = '?'; try { const r = A.db.exec("SELECT ifc_class FROM elements_meta WHERE guid='" + String(g).replace(/'/g, "''") + "'"); if (r && r[0]) c = r[0].values[0][0]; } catch (e) {}
    return (clsCache[g] = c); };
  const agg = {}, allBehind = {}; let rays = 0, throughGlass = 0, glassHits = 0, noHit = 0;
  const NX = 48, NY = 25;
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    rays++; rc.setFromCamera(new T.Vector2(((ix + 0.5) / NX) * 2 - 1, 1 - ((iy + 0.5) / NY) * 2), cam);
    const hits = rc.intersectObjects(A.scene.children, true); let passed = false, done = false;
    for (const h of hits) {
      const o = h.object; if (!visible(o) || o.isSprite || o.isPoints || o.isLine) continue;
      const m = matOf(h); if (!m || m.visible === false) continue;
      if (m.transparent && m.opacity < 0.95) { if (!passed) glassHits++; passed = true; continue; }
      if (passed) { throughGlass++; const c0 = clsOf(guidOf(h)); allBehind[c0] = (allBehind[c0] || 0) + 1;
        if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) {
          const g = guidOf(h), key = clsOf(g) + '|' + (m.name || m.type) + '|#' + m.emissive.getHexString() + '|ei=' + (+m.emissiveIntensity).toFixed(2);
          agg[key] = (agg[key] || 0) + 1; } }
      done = true; break;
    }
    if (!done && !passed) noHit++;
  }
  const list = Object.keys(agg).map(k => { const [cls, mat, col, ei] = k.split('|'); return { cls, mat: mat + ' ' + col + ' ' + ei, n: agg[k] }; }).sort((a, b) => b.n - a.n);
  const behindTop = Object.keys(allBehind).sort((a, b) => allBehind[b] - allBehind[a]).slice(0, 6).map(k => k + ':' + allBehind[k]).join(' ');
  return { behindTop, rays, glassHits, throughGlass, noHit, list, lampsOff: !!A._stillLampsOff, nightPLScale: A._nightPLScale };
}

(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 }; let fails = 0;
  for (const R of RUNS) {
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + e.message.slice(0, 200)); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + R.db + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= R.full) break; await sleep(2000); }
    say(R.db + ' loaded ' + n + '/' + R.full + (n >= R.full ? '' : ' VACUOUS')); if (n < R.full) { fails++; await p.close(); continue; }
    const sv = await p.evaluate(() => fetch('sw.js').then(r => r.text()).then(t => (/CACHE_VERSION = '([^']+)'/.exec(t) || [])[1]));
    say('   served sw ' + sv + ' effects.js has _glowLensOn: ' + await p.evaluate(() => fetch('effects.js').then(r => r.text()).then(t => /_glowLensOn|_glowOn\(/.test(t))));
    await sleep(2000);
    for (const ps of R.poses) {
      if (!ps.default) await p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); if (A.markDirty) A.markDirty(); }, ps);
      for (let i = 0; i < 20 && await p.evaluate(() => !!window.APP._stillRefineActive); i++) { if (i === 0) await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(1000); }
      await sleep(1000); const b1 = L.length;
      await p.evaluate(() => window.APP.toggleStillRefine());
      for (let i = 0; i < 360 && !L.slice(b1).some(t => /^§STILL_REFINE done/.test(t)); i++) await sleep(500);
      await sleep(1500);
      const doneLine = L.slice(b1).find(t => /^§STILL_REFINE done/.test(t));
      const fe = L.slice(b1).find(t => /^§FIXTURE_EMISSIVE /.test(t));
      const gd = await p.evaluate(glowDrawsInPage);
      const why = [];
      if (!doneLine) why.push('no §STILL_REFINE done');
      if (!fe) why.push('no §FIXTURE_EMISSIVE line');
      if (gd.glowDraws !== 0) why.push('glowDraws=' + gd.glowDraws + ' ' + JSON.stringify(gd.seen));
      if (L.slice(b1).some(t => /§PHOTO_GLOW_SPRITE|§GLOW_LENS_QUAD/.test(t))) why.push('a removed layer logged during the press');
      const pose = await p.evaluate(() => { const A = window.APP; return A.camera.position.toArray().map(v => +v.toFixed(3)).join(',') + ' tgt ' + A.controls.target.toArray().map(v => +v.toFixed(3)).join(','); });
      say('§GLOW_REMOVED_GATE ' + (why.length ? 'FAIL' : 'PASS') + ' ' + R.db + ' pose=' + ps.name + ' cam ' + pose + ' glowDraws=' + gd.glowDraws +
        ' (byName ' + gd.byName + ', bySignature ' + gd.bySig + '; other Points ' + gd.otherPoints + ', other Sprites ' + gd.otherSprites + ' ' + JSON.stringify(gd.other).slice(0, 200) + ')' + (why.length ? ' why=[' + why.join('; ') + ']' : ''));
      say('   [page] ' + (fe || '(no §FIXTURE_EMISSIVE line)').slice(0, 1200));
      say('   [page] ' + (doneLine || '(no §STILL_REFINE done)').slice(0, 300));
      L.slice(b1).filter(t => /^§STILL_GLOW daylight|^§LAMP_SHAPE_COLOUR/.test(t)).forEach(t => say('   [page] ' + t.slice(0, 500)));
      if (ps.itemC) {
        const t1 = Date.now(); const rc = await p.evaluate(itemCRays);
        const eb = rc.list.map(x => '{cls:' + x.cls + ', mat:' + x.mat + ', n:' + x.n + '}').join(', ');
        say('§ITEM_C glowDraws=' + gd.glowDraws + ' emissiveBehindGlass=[' + eb + '] (rays ' + rc.rays + ', through glass ' + rc.glassHits +
          ', opaque hit behind glass ' + rc.throughGlass + ', no hit ' + rc.noHit + ', opaque-behind-glass by class: ' + rc.behindTop + ', lampsOff=' + (rc.lampsOff ? 1 : 0) + ', nightPLScale=' + rc.nightPLScale + ', ' + (Date.now() - t1) + ' ms)');
      }
      if (why.length) fails++;
      await p.evaluate(() => { if (window.APP._stillRefineActive) window.APP.toggleStillRefine(); }); await sleep(2000);
    }
    await p.close();
  }
  const gf = guard.shaderError || guard.contextLost || guard.pageError;
  say('§GLOW_REMOVED_SUMMARY ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails + ' GUARD ' + (gf ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard));
  await b.close(); if (fails || gf) process.exitCode = 4;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
