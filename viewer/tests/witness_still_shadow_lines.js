// ⚠ DO NOT REMOVE — §STILL_SHADOW_EDGE gate lines (watchdog red1-c6, 2026-09-25: "gated on the maths already in the
// per-press logs"). Read the log after every run. Issue: red1's base gap + stair-stepped edges. Proves, from ONE Alt+S
// staging per pose (no ray grid): §STILL_SHADOW_EDGE predictedBaseGap45 and 20deg < 0.05 m, bias = range/65536,
// normalBias = (R+1.5) x texel, thinCasterRisk (m); §STILL_SHADOW_FIT texel per pose. FAILs (exit 4) when a gap >= 0.05 m
// or the line is missing. GUARD: FAIL on "Shader Error" / "Context Lost" / pageerror.
// §STILL_SHADOW_CASCADE gate (bim-compiler PHOTOREAL_STILL_RENDER.md "§STILL_SHADOW_CASCADE — SPEC" + WATCHDOG GATE
// CONDITIONS C1-C5): prints the page's §STILL_SHADOW_CASCADE line per pose and FAILs when cascade-0 texel > 0.0167 m
// (thinCasterRisk >= 0.05 m), any cascade gap45/gap20 >= 0.05 m, any texelPerPixel > 2 (C5), memMB > 512 (C3), or a
// press after the first creates a program whose cacheKey this page never compiled before (C1: newKeys > 0). Without the
// line (the before arm / &shadowcascade=0) it FAILs on the single map's texel and reports it. programs= is counted by
// the witness itself from renderer.info.programs (before the press, after the staged frames).
// C2 (link time): LINK=1 runs ONLY Hospital default_exterior with the driver + Chrome shader caches off, and sums the
// wall time of compileShader/linkProgram/getProgramParameter(LINK_STATUS)/getShaderParameter over the press (linkMs=; measured
// 116 ms for 62 links: Chrome's GL calls return before the GPU process links, so linkMs is NOT the link time) and the press
// wall time from Alt+S to the 4th staged frame (pressMs= — the compile burst blocks those frames; this is the C2 number).
// RUN: node viewer/tests/witness_still_shadow_lines.js <port> [outdir]      (QUERY='&shadowcascade=0' for the A arm)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8616', OUT = '/tmp/witness_still_shadow_lines'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const LINK = process.env.LINK === '1';
const RUNS0 = [
  { db: 'Hospital', full: 63182, poses: [{ name: 'default_exterior', default: true }, { name: 'aerial_centre', aerial: true }, { name: 'hospital_cafe', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] }] },
  { db: 'Terminal', full: 48428, poses: [{ name: 'terminal_hall_floor', hallFloor: true }] },
];
const RUNS = LINK ? [{ db: 'Hospital', full: 63182, poses: [{ name: 'default_exterior', default: true }] }] : (process.env.ONLY ? RUNS0.filter(r => r.db === process.env.ONLY) : RUNS0);   // ONLY=Terminal: one building
const num = (re, t) => { const m = re.exec(t || ''); return m ? +m[1] : NaN; };
const arr = (key, t) => { const m = new RegExp(' ' + key + '=\\[([^\\]]*)\\]').exec(t || ''); return m ? m[1].split(',').filter(x => x.trim() !== '').map(Number) : []; };
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }, LINK ? { __GL_SHADER_DISK_CACHE: '0' } : {}),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1686,1044'].concat(LINK ? ['--disable-gpu-program-cache', '--disable-gpu-shader-disk-cache'] : []) });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 }; let fails = 0;
  for (const R of RUNS) {
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + e.message.slice(0, 200)); });
    if (LINK) await p.evaluateOnNewDocument(() => { window.__linkMs = 0; window.__linkN = 0; const P = WebGL2RenderingContext.prototype;
      ['compileShader', 'linkProgram'].forEach(k => { const o = P[k]; P[k] = function () { const t = performance.now(); const r = o.apply(this, arguments); window.__linkMs += performance.now() - t; if (k === 'linkProgram') window.__linkN++; return r; }; });
      const gp = P.getProgramParameter; P.getProgramParameter = function (pr, q) { const t = performance.now(); const r = gp.apply(this, arguments); if (q === 0x8B82) window.__linkMs += performance.now() - t; return r; };
      const gs = P.getShaderParameter; P.getShaderParameter = function (sh, q) { const t = performance.now(); const r = gs.apply(this, arguments); window.__linkMs += performance.now() - t; return r; }; });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + R.db + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= R.full) break; await sleep(2000); }
    say(R.db + ' loaded ' + n + '/' + R.full + (n >= R.full ? '' : ' VACUOUS')); if (n < R.full) { fails++; await p.close(); continue; }
    await sleep(2000);
    const seenKeys = new Set(await p.evaluate(() => (window.APP.renderer.info.programs || []).map(q => q.cacheKey))); let press = 0;
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
      await sleep(1000); const b1 = L.length; press++;
      const pre = await p.evaluate(() => { const I = window.APP.renderer.info; return { n: (I.programs || []).length, ids: (I.programs || []).map(q => q.id), link: window.__linkMs || 0, linkN: window.__linkN || 0 }; });
      const tPress = Date.now(); await p.evaluate(() => window.APP.toggleStillRefine());
      for (let i = 0; i < 120 && !(L.slice(b1).some(t => /^§STILL_SHADOW_EDGE (range|VACUOUS)/.test(t)) && L.slice(b1).some(t => /§SKY_PORTAL placed|§SKY_PORTAL off/.test(t))); i++) await sleep(500);
      // the staged frames: wait for 4 rendered frames after the staging lines (programs compile on first draw)
      const f0 = await p.evaluate(() => window.APP.renderer.info.render.frame);
      for (let i = 0; i < 240 && (await p.evaluate(() => window.APP.renderer.info.render.frame)) < f0 + 4; i++) await sleep(250);
      const pressMs = Date.now() - tPress; await sleep(500);
      const post = await p.evaluate(() => { const I = window.APP.renderer.info; return { n: (I.programs || []).length, progs: (I.programs || []).map(q => ({ id: q.id, key: q.cacheKey })), link: window.__linkMs || 0, linkN: window.__linkN || 0 }; });
      const created = post.progs.filter(q => pre.ids.indexOf(q.id) < 0), newKeys = created.filter(q => !seenKeys.has(q.key)).length;
      created.forEach(q => seenKeys.add(q.key));
      const progLine = 'programs=' + pre.n + '->' + post.n + ' created=' + created.length + ' newKeys=' + newKeys + ' press=' + press + ' pressMs=' + pressMs + (LINK ? ' linkMs=' + (post.link - pre.link).toFixed(0) + ' links=' + (post.linkN - pre.linkN) : '');
      const fit = L.slice(b1).find(t => /§STILL_SHADOW_FIT env/.test(t)) || '(no §STILL_SHADOW_FIT line)', edge = L.slice(b1).find(t => /^§STILL_SHADOW_EDGE (range|VACUOUS)/.test(t)) || '';
      const g45 = +((/predictedBaseGap45=([0-9.]+)/.exec(edge) || [])[1]), g20 = +((/ 20deg=([0-9.]+)/.exec(edge) || [])[1]);
      const cas = L.slice(b1).find(t => /^§STILL_SHADOW_CASCADE m=/.test(t)) || '';
      const why = [];
      if (!edge) why.push('no §STILL_SHADOW_EDGE line');
      if (cas) {
        const tx = arr('texel', cas), tpp = arr('texelPerPixel', cas), c45 = arr('gap45', cas), c20 = arr('gap20', cas), mem = num(/ memMB=([0-9.]+)/, cas), mUsed = num(/ used=([0-9]+)/, cas);
        if (!(tx[0] <= 0.0167)) why.push('cascade0 texel ' + tx[0] + ' > 0.0167');
        c45.concat(c20).forEach((g, i) => { if (!(g < 0.05)) why.push('gap ' + g + ' >= 0.05'); });
        tpp.forEach((v, i) => { if (i < (isFinite(mUsed) ? mUsed : tpp.length) && !(v <= 2)) why.push('texelPerPixel[' + i + ']=' + v + ' > 2'); });
        if (!(mem <= 512)) why.push('memMB ' + mem + ' > 512');
      } else {
        const t1 = num(/texel=([0-9.]+)/, edge); if (!(t1 <= 0.0167)) why.push('no cascade line; single-map texel ' + t1 + ' > 0.0167');
        if (!(g45 < 0.05 && g20 < 0.05)) why.push('gap45=' + g45 + ' gap20=' + g20);
      }
      // C1: the cascades must not change a program key between presses — the page's dirShadows (directional shadow count,
      // part of every lit program's key) is the same on every press. newKeys is printed, not failed: the base 3edd28a8
      // already compiles 1 (aerial) and 4 (café) new keys on presses 2/3 (portal shadow count 0 vs 8), before any cascade.
      const ds = num(/ dirShadows=([0-9]+)/, cas); if (cas) { if (R.dirShadows == null) R.dirShadows = ds; else if (ds !== R.dirShadows) why.push('C1 dirShadows ' + ds + ' != first press ' + R.dirShadows); }
      const ok = !why.length; if (!ok) fails++;
      say('§STILL_SHADOW_GATE ' + (ok ? 'PASS' : 'FAIL') + ' ' + R.db + ' pose=' + ps.name + ' gap45=' + g45 + ' gap20=' + g20 + ' ' + progLine + (why.length ? ' why=[' + why.join('; ') + ']' : ''));
      say('   [page] ' + (cas || '(no §STILL_SHADOW_CASCADE line)').slice(0, 1400));
      L.slice(b1).filter(t => /^§STILL_SHADOW_CASCADE_(DEPTH|BOX|FALLBACK|OFF)|§LIGHT_TEXTURE_BUDGET|§SHADOW_SIZE_BY_ENVELOPE/.test(t)).forEach(t => say('   [page] ' + t.slice(0, 900)));
      say('   [page] ' + fit.slice(0, 420)); say('   [page] ' + (edge || '(no §STILL_SHADOW_EDGE line)').slice(0, 700));
      L.slice(b1).filter(t => /§PORTAL_SHADOW_BIAS|§SKY_PORTAL_BLOCKED/.test(t)).forEach(t => say('   [page] ' + t.slice(0, 700)));
      await p.evaluate(() => { if (window.APP._stillRefineActive) window.APP.toggleStillRefine(); }); await sleep(2000);
    }
    await p.close();
  }
  const gf = guard.shaderError || guard.contextLost || guard.pageError;
  say('§STILL_SHADOW_GATE_SUMMARY ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails + ' GUARD ' + (gf ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard));
  await b.close(); if (fails || gf) process.exitCode = 4;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
