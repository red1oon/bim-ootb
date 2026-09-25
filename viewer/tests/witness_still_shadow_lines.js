// ⚠ DO NOT REMOVE — §STILL_SHADOW_EDGE gate lines (watchdog red1-c6, 2026-09-25: "gated on the maths already in the
// per-press logs"). Read the log after every run. Issue: red1's base gap + stair-stepped edges. Proves, from ONE Alt+S
// staging per pose (no ray grid): §STILL_SHADOW_EDGE predictedBaseGap45 and 20deg < 0.05 m, bias = range/65536,
// normalBias = (R+1.5) x texel, thinCasterRisk (m); §STILL_SHADOW_FIT texel per pose. FAILs (exit 4) when a gap >= 0.05 m
// or the line is missing. GUARD: FAIL on "Shader Error" / "Context Lost" / pageerror.
// RUN: node viewer/tests/witness_still_shadow_lines.js <port> [outdir]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8616', OUT = '/tmp/witness_still_shadow_lines'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const RUNS = [
  { db: 'Hospital', full: 63182, poses: [{ name: 'default_exterior', default: true }, { name: 'aerial_centre', aerial: true }, { name: 'hospital_cafe', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] }] },
  { db: 'Terminal', full: 48428, poses: [{ name: 'terminal_hall_floor', hallFloor: true }] },
];
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
    await sleep(2000);
    for (const ps of R.poses) {
      await p.evaluate(ps => { const A = window.APP, T = window.THREE;
        if (ps.aerial) { const Z = new T.Box3(); A.scene.traverse(o => { if ((o.isInstancedMesh || o.isMesh) && o.visible && o.userData && /IfcSlab|IfcRoof|IfcWall/.test(o.userData.ifcClass || '')) { if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); Z.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else Z.union(new T.Box3().setFromObject(o)); } });
          const c = Z.getCenter(new T.Vector3()), s = Z.getSize(new T.Vector3()), D = Math.max(s.x, s.z); A.camera.position.set(c.x - 0.35 * D, Z.max.y + 0.6 * D, c.z - 0.35 * D); A.controls.target.set(c.x, Z.min.y + 0.3 * s.y, c.z); }
        else if (ps.hallFloor) { const m4 = new T.Matrix4(), v = new T.Vector3(), xs = [], ys = [], zs = [];
          for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue; for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
          const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; }; const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y0 + 1.6;
          if (x1 - x0 >= z1 - z0) { A.camera.position.set(x0 + 0.1 * (x1 - x0), h, cz); A.controls.target.set(x0 + 0.9 * (x1 - x0), h, cz); } else { A.camera.position.set(cx, h, z0 + 0.1 * (z1 - z0)); A.controls.target.set(cx, h, z0 + 0.9 * (z1 - z0)); } }
        else if (!ps.default) { A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); }
        A.controls.update(); if (A.markDirty) A.markDirty(); }, ps);
      for (let i = 0; i < 20 && await p.evaluate(() => !!window.APP._stillRefineActive); i++) { if (i === 0) await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(1000); }
      await sleep(1000); const b1 = L.length;
      await p.evaluate(() => window.APP.toggleStillRefine());
      for (let i = 0; i < 120 && !L.slice(b1).some(t => /^§STILL_SHADOW_EDGE (range|VACUOUS)/.test(t)); i++) await sleep(500);
      await sleep(500);
      const fit = L.slice(b1).find(t => /§STILL_SHADOW_FIT env/.test(t)) || '(no §STILL_SHADOW_FIT line)', edge = L.slice(b1).find(t => /^§STILL_SHADOW_EDGE (range|VACUOUS)/.test(t)) || '';
      const g45 = +((/predictedBaseGap45=([0-9.]+)/.exec(edge) || [])[1]), g20 = +((/ 20deg=([0-9.]+)/.exec(edge) || [])[1]);
      const ok = edge && g45 < 0.05 && g20 < 0.05; if (!ok) fails++;
      say('§STILL_SHADOW_GATE ' + (ok ? 'PASS' : 'FAIL') + ' ' + R.db + ' pose=' + ps.name + ' gap45=' + g45 + ' gap20=' + g20);
      say('   [page] ' + fit.slice(0, 420)); say('   [page] ' + (edge || '(no §STILL_SHADOW_EDGE line)').slice(0, 700));
      await p.evaluate(() => { if (window.APP._stillRefineActive) window.APP.toggleStillRefine(); }); await sleep(2000);
    }
    await p.close();
  }
  const gf = guard.shaderError || guard.contextLost || guard.pageError;
  say('§STILL_SHADOW_GATE_SUMMARY ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails + ' GUARD ' + (gf ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard));
  await b.close(); if (fails || gf) process.exitCode = 4;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
