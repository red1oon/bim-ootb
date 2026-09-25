// ⚠ DO NOT REMOVE — §SUN_GLASS_CASTERS witness (bim-compiler PHOTOREAL_STILL_RENDER.md §SOURCED_LIGHT (d)). Read the log after every run.
// Issue: tools.js:996 / effects.js _reassertPhotoShadowCoverage set castShadow=true on EVERY visible mesh, glass included,
// and three's shadow pass has no transparency test, so glazing casts a solid sun shadow and blocks the sun indoors. Only
// §SURFACE_R10 split panes are exempt (customDepthMaterial = A._r10DepthMat, discards aPane=1). After a real Alt+S this
// counts, per class, the glass that still reaches the sun shadow map: glassy material (the sky_portal.js test) on a
// castShadow mesh with no discarding depth material. Pass after the fix: glassM2 casting = 0.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT = '8611', LIST = 'Terminal,Hospital,Clinic'] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  let errs = 0;
  for (const bld of LIST.split(',')) {
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = []; p.on('console', m => L.push(m.text())); p.on('pageerror', e => { errs++; console.log('PAGEERROR ' + e.message); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + bld + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = -1, st = 0; for (let i = 0; i < 150 && st < 3; i++) { await sleep(2000); const k = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (k > 0 && k === n) st++; else st = 0; n = k; }
    const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 300 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
    // BEHAVIOUR, not assignment: hook onBeforeShadow on every glassy castShadow mesh, force one sun shadow render, and count
    // the draws whose depth material is NOT the discarding one (a draw that can write glass depth).
    const beh = await p.evaluate(() => { const A = window.APP; const glassy = m => m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial';
      const hooked = []; let draws = 0, writing = 0; const wc = {};
      A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.castShadow || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.every(glassy)) return;
        const prev = o.onBeforeShadow; hooked.push([o, prev]); o.onBeforeShadow = function (r, obj, cam, sc, geo, dm) { draws++; if (!(dm && dm.userData && dm.userData.slGlassDiscard) && !(A._r10DepthMat && dm === A._r10DepthMat)) { writing++; const k = (obj.userData && obj.userData.ifcClass) || obj.type; wc[k] = (wc[k] || 0) + 1; } }; });
      A.renderer.shadowMap.needsUpdate = true; if (A.sun && A.sun.shadow) A.sun.shadow.needsUpdate = true; A.renderer.render(A.scene, A.camera);
      hooked.forEach(([o, prev]) => { o.onBeforeShadow = prev; }); return { glassMeshesHooked: hooked.length, shadowDraws: draws, drawsWritingGlassDepth: writing, writingByKind: wc }; });
    console.log('§SUN_GLASS_SHADOW_PASS bld=' + bld + ' ' + JSON.stringify(beh));
    const r = await p.evaluate(() => {
      const A = window.APP, THREE = window.THREE; const glassy = m => m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial';
      const out = { pureMeshes: 0, mixedMeshes: 0, mixedGlassM2: 0, meshes: 0, instances: 0, glassM2: 0, byClass: {}, r10Exempt: 0, sunCastShadow: !!(A.sun && A.sun.castShadow) };
      const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), M = new THREE.Matrix4(), mi = new THREE.Matrix4();
      const cls = (o, i) => { if (o.userData && o.userData.ifcClass) return o.userData.ifcClass; const gd = A.guidMap[o.id + '_' + i] || (o.userData && o.userData.guid); if (!gd) return '?';
        try { const q = A.dbQuery("SELECT ifc_class FROM elements_meta WHERE guid=?", [gd]); return q.length ? q[0][0] : '?'; } catch (e) { return '?'; } };
      function area(g, start, count, Mw) { const pos = g.attributes.position, ix = g.index; let s = 0;
        for (let t = start; t + 2 < start + count; t += 3) { const i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(Mw); bb.fromBufferAttribute(pos, i1).applyMatrix4(Mw); c.fromBufferAttribute(pos, i2).applyMatrix4(Mw);
          s += bb.sub(a).cross(c.sub(a)).length() / 2; } return s / 2; }   // two faces per pane: count the pane once
      A.scene.traverse(o => {
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.castShadow || !o.geometry) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material]; if (!mats.some(glassy)) return;
        if (A._r10DepthMat && o.customDepthMaterial === A._r10DepthMat) { out.r10Exempt++; return; }
        if (o.customDepthMaterial && o.customDepthMaterial.userData && o.customDepthMaterial.userData.slGlassDiscard) { out.slExempt = (out.slExempt || 0) + 1; return; }
        const g = o.geometry, full = g.index ? g.index.count : g.attributes.position.count;
        const groups = (g.groups && g.groups.length) ? g.groups : [{ start: 0, count: full, materialIndex: 0 }];
        out.meshes++; o.updateMatrixWorld(); const pure = mats.every(glassy); if (pure) out.pureMeshes++; else out.mixedMeshes++; const m2Before = out.glassM2;
        const add = (k, m2) => { const e = out.byClass[k] = out.byClass[k] || { n: 0, m2: 0 }; e.n++; e.m2 += m2; out.glassM2 += m2; out.instances++; };
        if (o.isBatchedMesh) { const N = o._instanceInfo ? o._instanceInfo.length : 0;
          for (let i = 0; i < N; i++) { let rng; try { rng = o.getGeometryRangeAt(o.getGeometryIdAt(i)); } catch (e) { continue; } o.getMatrixAt(i, mi); M.multiplyMatrices(o.matrixWorld, mi);
            add(cls(o, i), glassy(mats[0]) ? area(g, g.index ? rng.indexStart : rng.vertexStart, g.index ? rng.indexCount : rng.vertexCount, M) : 0); } return; }
        const cnt = o.isInstancedMesh ? o.count : 1;
        for (let i = 0; i < cnt; i++) { if (o.isInstancedMesh) { o.getMatrixAt(i, mi); M.multiplyMatrices(o.matrixWorld, mi); } else M.copy(o.matrixWorld);
          let m2 = 0; groups.forEach(gr => { if (glassy(mats[gr.materialIndex || 0])) m2 += area(g, gr.start, gr.count, M); }); add(cls(o, i), m2); }
        if (!pure) out.mixedGlassM2 += out.glassM2 - m2Before;
      });
      Object.values(out.byClass).forEach(e => { e.m2 = Math.round(e.m2); }); out.glassM2 = Math.round(out.glassM2); out.mixedGlassM2 = Math.round(out.mixedGlassM2); return out; });
    console.log('§SUN_GLASS_CASTERS bld=' + bld + ' guids=' + n + ' ' + JSON.stringify(r));
    await p.close();
  }
  console.log('pageErrors=' + errs); await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(1); });
