// ⚠ DO NOT REMOVE — §WASH_SOURCES witness (bim-compiler PHOTOREAL_STILL_RENDER.md §SOURCED_LIGHT). Read the log after every run.
// Issue (red1 via red1-4b, 2026-09-25): "it's not too much sun/sky seeping through; outside looks darker" — is the interior
// washout sourceless sky / leaking lamps? After a real Alt+S, over a 32x18 screen grid of surface samples (emitters, sprites,
// sky and glass excluded; a ray that passes glass first is a THROUGH-GLASS sample), the irradiance each source puts on the
// sample, computed analytically with three's own formulas (luminance-weighted colour x intensity): sun = N.L x a shadow
// RAY to the sun (the scene's drawn meshes, glass included when it casts); hemi = mix(ground, sky, 0.5 N.y + 0.5); ambient;
// lamps / other points / camera fill = I x getDistanceAttenuation(d, distance, decay) x N.L; sky portals (spots) = the
// same x the cone smoothstep (their shadow maps are NOT evaluated: an upper bound). Reports per pose: shares % of the summed
// irradiance by source, and absolute levels vs the sunlit ground (sun x sin(elevation) + hemi on an up-facing surface).
// GUARD (every run): FAIL on any console "Shader Error", "Context Lost" or pageerror.
// RUN: node viewer/tests/witness_wash_sources.js <port> [outdir]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8612', OUT = '/tmp/witness_wash_sources'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const RUNS = [
  { db: 'Hospital', full: 63182, poses: [{ name: 'hospital_cafe (reference stand-in)', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] }] },
  { db: 'Clinic', full: 16071, poses: [{ name: 'clinic_corridor (stand-in)', pos: [-13.5, -1.4, -18.3], tgt: [4, -2.2, -18.3] }] },
  { db: 'Terminal', full: 48428, poses: [{ name: 'terminal_exterior (default load pose)', default: true }, { name: 'terminal_hall (stand-in, witness_dlod_still_ownership pose)', hall: true }] },
];
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 };
  for (const R of RUNS) {
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + e.message.slice(0, 200)); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + R.db + '_extracted.db', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= R.full) break; await sleep(2000); }
    const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
    say(R.db + ' loaded guids=' + n + '/' + R.full + (n >= R.full ? '' : ' VACUOUS') + ' sw=' + sw);
    if (n < R.full) { await p.close(); continue; }
    for (const ps of R.poses.filter(q => !(process.env.SKIP_EXT && q.default))) {
      if (ps.hall) await p.evaluate(() => { const A = window.APP, m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
        for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
          for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
        const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
        const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), y1 = q(ys, .98), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        A.camera.position.set(cx - (x1 - x0) * 0.1, y0 + 2, cz); A.controls.target.set(cx + (x1 - x0) * 0.25, y1, cz); A.controls.update(); });
      else if (!ps.default) await p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); }, ps);
      const o0 = await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); return 1; });
      await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
      await sleep(1000);
      const r = await p.evaluate(() => {
        const A = window.APP, THREE = window.THREE, lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        const glassy = m => m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial';
        const skip = m => !m || m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.visible === false || m.colorWrite === false;
        const tg = [], occ = []; A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || o === A._sky || o === A.ground && false) return;
          const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.every(skip)) return; tg.push(o); if (o.castShadow !== false && !(o.userData && o.userData.excludeFromShadow)) occ.push(o); });
        // lights, classified
        const cls = l => (A._nightLights || []).includes(l) ? 'lamps' : (l === A._camLight ? 'camlight' : (l.isSpotLight && l.userData && l.userData.skyPortal ? 'portals' : (l.isPointLight ? 'otherPoints' : (l.isSpotLight ? 'otherSpots' : (l.isDirectionalLight ? 'sun' : (l.isHemisphereLight ? 'hemi' : (l.isAmbientLight ? 'ambient' : 'other')))))));
        const lights = []; A.scene.traverse(l => { if (l.isLight && l.visible && l.intensity > 0) lights.push(l); });
        const dAtt = (d, cutoff, decay) => { let f = 1 / Math.max(Math.pow(d, decay), 0.01); if (cutoff > 0) f *= Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / cutoff, 4))), 2); return f; };
        const rc = new THREE.Raycaster(), M = new THREE.Matrix4(), mi = new THREE.Matrix4(), sunRc = new THREE.Raycaster();
        const W = 32, H = 18, S = []; let glassHits = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          rc.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2), A.camera);
          const hs = rc.intersectObjects(tg, false); let through = false, h = null;
          for (const hh of hs) { const m = Array.isArray(hh.object.material) ? hh.object.material[hh.face ? hh.face.materialIndex : 0] : hh.object.material; if (glassy(m)) { through = true; continue; } if (skip(m)) continue; h = hh; break; }
          if (!h || !h.face) continue; if (through) glassHits++;
          M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
          const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate();
          const LZ = window.LightZones, SLon = !!(window.SourcedLight && window.SourcedLight.isActive && window.SourcedLight.isActive() && LZ && LZ.get());
          let fz = null; if (SLon) { const v = LZ.atSurface(h.point, nn); fz = (v === LZ.SOLID || v < 0) ? -1 : (v === 0 ? 65534 : v); }
          const skyKeep = (SLon && (fz === -1 || (fz > 0 && fz < 65534))) ? 0 : 1;   // the shader's slSkyKeep (indoorSky=0 default)
          const reaches = l => { if (!SLon) return true; const lz = (l.userData && l.userData.sourcedZone) || 0; if (l.isSpotLight && l.userData && l.userData.skyPortal) { const v2 = LZ.at(l.position); const pz = (v2 > 0 && v2 !== LZ.SOLID) ? v2 : 0; return !pz || fz === -1 || pz === fz; } return !lz || fz === -1 || lz === fz; };
          const P = h.point, E = { sun: 0, hemi: 0, ambient: 0, lamps: 0, portals: 0, camlight: 0, otherPoints: 0, otherSpots: 0 };
          lights.forEach(l => { const k = cls(l), I = lum(l.color) * l.intensity;
            if (l.isDirectionalLight) { const dir = l.position.clone().sub(l.target.position).normalize(), nl = Math.max(0, nn.dot(dir)); if (!nl) return;
              sunRc.set(P.clone().addScaledVector(nn, 0.05), dir); sunRc.far = 800; const vis = sunRc.intersectObjects(occ, false).length ? 0 : 1; E.sun += I * nl * vis; }
            else if (l.isHemisphereLight) { const w = 0.5 * nn.y + 0.5; E.hemi += skyKeep * (lum(l.groundColor) * (1 - w) + lum(l.color) * w) * l.intensity; }
            else if (l.isAmbientLight) E.ambient += skyKeep * I;
            else if (l.isPointLight || l.isSpotLight) { if (!reaches(l)) return; const v = l.position.clone().sub(P), d = v.length(); v.normalize(); const nl = Math.max(0, nn.dot(v)); if (!nl) return;
              let a = dAtt(d, l.distance, l.decay); if (l.isSpotLight) { const sd = l.position.clone().sub(l.target.position).normalize(), ac = v.dot(sd), cc = Math.cos(l.angle), pc = Math.cos(l.angle * (1 - l.penumbra));
                const t = Math.max(0, Math.min(1, (ac - cc) / Math.max(1e-6, pc - cc))); a *= t * t * (3 - 2 * t); }
              E[k === 'sun' || k === 'hemi' ? 'otherPoints' : k] += I * a * nl; } });
          S.push({ through, floor: nn.y > 0.7, wall: Math.abs(nn.y) < 0.3, E });
        }
        const sd = A.sun ? A.sun.position.clone().sub(A.sun.target.position).normalize() : new THREE.Vector3(0, 1, 0);
        const hemiUp = A.hemi ? lum(A.hemi.color) * A.hemi.intensity : 0, Eground = (A.sun ? lum(A.sun.color) * A.sun.intensity * Math.max(0, sd.y) : 0) + hemiUp;
        const summarise = set => { const keys = ['sun', 'hemi', 'ambient', 'portals', 'lamps', 'camlight', 'otherPoints', 'otherSpots'], tot = {}; let all = 0; keys.forEach(k => { tot[k] = 0; });
          const per = set.map(s => { let t = 0; keys.forEach(k => { tot[k] += s.E[k]; t += s.E[k]; }); all += t; return t / Math.max(1e-9, Eground); }).sort((a, b) => a - b);
          const share = {}; keys.forEach(k => { share[k] = all ? +(100 * tot[k] / all).toFixed(1) : 0; });
          const outside = all ? +(100 * (tot.sun + tot.hemi + tot.portals) / all).toFixed(1) : 0, inside = all ? +(100 * (tot.lamps + tot.camlight + tot.otherPoints + tot.otherSpots) / all).toFixed(1) : 0;
          return { samples: set.length, sharesPct: share, outsideSourcesPct: outside, insideSourcesPct: inside, ambientPct: share.ambient,
            vsSunlitGround: { median: per.length ? +per[Math.floor(per.length / 2)].toFixed(3) : null, p95: per.length ? +per[Math.floor(per.length * 0.95)].toFixed(3) : null, mean: set.length ? +(per.reduce((a, b) => a + b, 0) / per.length).toFixed(3) : null } }; };
        const SLonNow = !!(window.SourcedLight && window.SourcedLight.isActive && window.SourcedLight.isActive());
        return { sourcedLight: SLonNow, sunElevDeg: +(Math.asin(sd.y) * 180 / Math.PI).toFixed(1), Eground: +Eground.toFixed(3), exposure: +A.renderer.toneMappingExposure.toFixed(3), lights: lights.length, camPos: A.camera.position.toArray().map(v => +v.toFixed(2)),
          all: summarise(S), floor: summarise(S.filter(s => s.floor)), walls: summarise(S.filter(s => s.wall)), throughGlass: summarise(S.filter(s => s.through)), direct: summarise(S.filter(s => !s.through)), glassRays: glassHits };
      });
      const g = re => (L.slice(b1).find(t => re.test(t)) || '-').slice(0, 220);
      say('§WASH_SOURCES pose=' + ps.name + ' ' + JSON.stringify(r) + '\n   ' + [g(/§STILL_BASE sky/), g(/§STILL_POSE/), g(/§GI_STILL result/)].join('\n   '));
      await p.keyboard.press('Escape'); await sleep(3000);
    }
    await p.close();
  }
  const fail = guard.shaderError || guard.contextLost || guard.pageError;
  say('GUARD ' + (fail ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard)); await b.close(); if (fail) process.exitCode = 2;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
