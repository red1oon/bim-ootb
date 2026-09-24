// ⚠ DO NOT REMOVE — witness for §SOURCED_LIGHT (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md). Read the log after every run.
/* global Buffer */
// Issue (watchdog red1-4b hypothesis, 2026-09-25): the "many lamps" washout is lamps on OTHER floors / rooms leaking
// through slabs and walls (Hospital café stack: 132 lit, 40 over 5% of peak). This witness proves or kills that: at the
// floor point under the view centre, after a real Alt+S, every lit lamp's three.js point-light contribution (no angle
// term, same as §LIGHT_STACK) is split by a line-of-sight ray floor→lamp: CLEAR, BLOCKED same storey (a wall between,
// |dy| < 2.5 m) or BLOCKED other storey (a slab between). If blocked lamps carry most of the sum, room binding removes the
// wash without dimming anything. After §SOURCED_LIGHT: also own-zone vs other-zone per the zone texture, and crossWall
// (a blocked lamp in another zone still reaching) must be 0.
// RUN: node viewer/tests/witness_sourced_stack.js <port> <outdir> [query]   (poses are stand-ins, see POSES)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8600', OUT = '/tmp/witness_sourced_stack', QUERY = ''] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
// Stand-in poses (red1-4b, 2026-09-25: no console/URL exists for red1's café still or Clinic 20:22; previous dev session's wash3 poses).
const RUNS = [
  { db: 'Hospital', full: 63182, sun: [45, 228], poses: [
    { name: 'cafe_atrium_high (stand-in)', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] },
    { name: 'cafe_atrium_ground (stand-in)', pos: [-5.355, -13.58, 9.984], tgt: [-5.355, -11.28, -2.316] },
    { name: 'rail_L1 (stand-in)', pos: [-11.15, -3.0, 4.08], tgt: [0.75, -4.5, -7.82] }] },
  { db: 'Clinic', full: 16071, sun: null, poses: [{ name: 'clinic_corr_x (stand-in)', ifcPos: [-41.5, 48.57, 1.6], ifcTgt: [-22, 48.57, 1.3] },
    // dev-picked 2026-09-25: the wash3 pose's camera sits in a closed 0.x m3 space (all 53 lamps through walls); this one is
    // under the corridor's own lamp row (lamps at x -12.7/-11.2/-7.6, z -18.4; ceiling -0.8, floor ~-3.0), looking +x
    { name: 'clinic_corr_row (stand-in)', pos: [-13.5, -1.4, -18.3], tgt: [4, -2.2, -18.3] }] },
];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  let errs = 0;
  for (const R of RUNS) { if (ONLY && !ONLY.test(R.db)) continue;
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/§SOURCED_LIGHT|§LIGHT_ZONE|§SUN_GLASS|Shader Error|THREE.WebGLProgram/.test(t)) say('[page] ' + t.slice(0, 400)); });
    p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + R.db + '_extracted.db' + QUERY, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
    let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= R.full) break; await sleep(2000); }
    const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
    say(R.db + ' loaded guids=' + n + '/' + R.full + (n >= R.full ? '' : ' VACUOUS') + ' sw=' + sw + ' query=' + (QUERY || '-'));
    if (n < R.full) { await p.close(); continue; }
    if (R.sun) await p.evaluate((el, trueAz) => { const A = window.APP; const tn = (typeof window._trueNorthAngle === 'number') ? window._trueNorthAngle : 0; A.updateSky(el, ((180 - (trueAz - tn)) % 360 + 360) % 360); }, R.sun[0], R.sun[1]);
    for (const ps of R.poses) {
      await p.evaluate(ps => { const A = window.APP; if (ps.ifcPos) { const f = v => { const q = A.ifc2three(v[0], v[1], v[2]); return [q.x, q.y, q.z]; }; ps.pos = f(ps.ifcPos); ps.tgt = f(ps.ifcTgt); }
        A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); }, ps);
      await sleep(1500); const b1 = L.length;
      await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
      await sleep(1000);
      if (process.env.ZONES) {   // measure-only zone probe: build §LIGHT_ZONE now, tag each lit lamp with its zone
        if (process.env.INNER_R) await p.evaluate((r) => { window.APP._lightZoneInnerR = r; }, +process.env.INNER_R);
        const hasLZ = await p.evaluate(() => !!window.LightZones); if (!hasLZ) await p.addScriptTag({ url: '/viewer/light_zones.js?probe=' + Date.now() });
        const zs = await p.evaluate(() => { const A = window.APP, LZ = window.LightZones; const Z = LZ.build(A); if (!Z) return null;
          let bound = 0, solid = 0, out0 = 0, off = 0, lit = 0; (A._nightLights || []).forEach(l => { if (!(l.intensity > 0)) return; lit++; const v = LZ.atLamp(l.position); l.userData.sourcedZone = (v > 0 && v !== LZ.SOLID) ? v : 0; l.userData.sourcedInfo = LZ.lampInfo ? LZ.lampInfo(l.position) : null;
            if (v > 0 && v !== LZ.SOLID) bound++; else if (v === LZ.SOLID) solid++; else if (v === 0) out0++; else off++; });
          A._sourcedZoneAt = (P) => { const v = LZ.atSurface(P, { x: 0, y: 1, z: 0 }); return (v > 0 && v !== LZ.SOLID) ? v : 0; };
          return { stats: Z.stats, lamps: { lit, bound, inSolid: solid, inOutside: out0, offGrid: off } }; });
        say(ps.name + ' ZONES ' + JSON.stringify(zs));
      }
      if (process.env.SL_DEBUG) await p.evaluate(() => { window.__SL_DEBUG = 1; });
      const r = await p.evaluate(() => {
        const A = window.APP, THREE = window.THREE, LZ = window.LightZones; const rc = new THREE.Raycaster();
        const tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky && !(o.userData && o.userData.excludeFromShadow)) tg.push(o); });
        const clsCache = new Map();
        const clsOf = (h) => { const o = h.object; const gd = A.guidMap[o.id + '_' + (h.batchId != null ? h.batchId : h.instanceId)] || (o.userData && o.userData.guid);
          const key = gd || ('o' + o.id); if (clsCache.has(key)) return clsCache.get(key); let cls = (o.userData && o.userData.ifcClass) || '?';
          if (gd) { try { const q = A.dbQuery("SELECT ifc_class FROM elements_meta WHERE guid=?", [gd]); if (q.length) cls = q[0][0]; } catch (e) {} } clsCache.set(key, cls); return cls; };
        // HARD = a room boundary (wall, slab, roof, ceiling, closed door); thin stuff (beam, railing, member, duct, column, glass) does not count
        const HARD = /^Ifc(Wall|WallStandardCase|Slab|Roof|Covering|Door)$/;
        const lamps = (A._nightLights || []).filter(l => l.intensity > 0);
        const zoneRaw = (P) => LZ ? LZ.atSurface(P, { x: 0, y: 1, z: 0 }) : null;
        function stackAt(P) {
          const P0 = P.clone().add(new THREE.Vector3(0, 0.05, 0)), zr = zoneRaw(P0), zP = (zr > 0 && zr !== 65535) ? zr : 0; const rows = [];
          lamps.forEach(l => { const d = Math.max(0.01, l.position.distanceTo(P));
            let att = 1 / Math.max(Math.pow(d, l.decay), 0.01); if (l.distance > 0) att *= Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / l.distance, 4))), 2);
            const c = l.intensity * att; if (!(c > 0)) return;
            const dir = l.position.clone().sub(P0), dl = dir.length(); dir.normalize(); rc.set(P0, dir); rc.near = 0.2; rc.far = Math.max(0.3, dl - 0.3);
            let blocked = false; for (const h of rc.intersectObjects(tg, false)) { if (HARD.test(clsOf(h))) { blocked = true; break; } }
            const dy = l.position.y - P.y, lz = (l.userData && l.userData.sourcedZone > 0) ? l.userData.sourcedZone : 0;
            const reaches = !(lz > 0 && zP > 0 && lz !== zP);
            rows.push({ l, c, blocked, other: Math.abs(dy) > 2.5 ? (dy > 0 ? 'up' : 'down') : 'same', lz, reaches }); });
          rows.sort((x, y) => y.c - x.c); const pk = rows.length ? rows[0].c : 0, sum = rows.reduce((t, q) => t + q.c, 0);
          const share = f => sum ? +(100 * rows.filter(f).reduce((t, q) => t + q.c, 0) / sum).toFixed(1) : 0;
          const reach = rows.filter(q => q.reaches), rsum = reach.reduce((t, q) => t + q.c, 0);
          // storey band arm: the sample's own empty column [floorY, ceilY] (first empty cell above P); a lamp beyond it +-0.3 m is cut
          let bd = null; if (LZ && LZ.band) { for (let up = 0.3; up < 1.6 && !bd; up += 0.25) bd = LZ.band({ x: P.x, y: P.y + up, z: P.z }); }
          const inBand = q => !bd || (q.l.position.y <= bd.ceilY + 0.3 && q.l.position.y >= bd.floorY - 0.3);
          const reachB = reach.filter(inBand), bsum = reachB.reduce((t, q) => t + q.c, 0);
          // band v2: lamp band from its bound cell; void column rule via the fragment's own run top
          const reach2 = (LZ && LZ.bandPass) ? reach.filter(q => { const li = q.l.userData.sourcedInfo; return !li || LZ.bandPass(li, P.y, bd ? bd.ceilY : null); }) : reach;
          const b2sum = reach2.reduce((t, q) => t + q.c, 0), viaVoid = reach2.filter(q => { const li = q.l.userData.sourcedInfo; return li && li.floorY != null && P.y < li.floorY - 0.5; });
          const dbg = (window.__SL_DEBUG && LZ) ? { up: Array.from({ length: 14 }, (_, k) => LZ.at({ x: P.x, y: P.y - 0.5 + k * 0.25, z: P.z })),
            clearLamps: rows.filter(q => !q.blocked).slice(0, 6).map(q => ({ pos: [q.l.position.x, q.l.position.y, q.l.position.z].map(v => +v.toFixed(2)), lz: q.lz, c: +q.c.toFixed(2),
              col: Array.from({ length: 12 }, (_, k) => LZ.at({ x: q.l.position.x, y: q.l.position.y + 0.25 - k * 0.25, z: q.l.position.z })) })) } : undefined;
          return { dbg, P: [P.x, P.y, P.z].map(v => +v.toFixed(2)), zone: zr === 65535 ? 'SOLID' : zr, lit: rows.length, n5: rows.filter(q => q.c > 0.05 * pk).length, sum: +sum.toFixed(3),
            clear: share(q => !q.blocked), wall: share(q => q.blocked && q.other === 'same'), slab: share(q => q.blocked && q.other !== 'same'),
            after: LZ ? { reaching: reach.length, sum: +rsum.toFixed(3), keptPct: sum ? +(100 * rsum / sum).toFixed(1) : 0,
              blockedButReaching: reach.filter(q => q.blocked).length, blockedButReachingPct: sum ? +(100 * reach.filter(q => q.blocked).reduce((t, q) => t + q.c, 0) / sum).toFixed(1) : 0,
              upStoreyOwnZone: reach.filter(q => q.other === 'up' && q.lz === zP && zP > 0).length,
              band: bd ? { floorY: +bd.floorY.toFixed(2), ceilY: +bd.ceilY.toFixed(2), reaching: reachB.length, keptPct: sum ? +(100 * bsum / sum).toFixed(1) : 0,
                blockedButReachingPct: sum ? +(100 * reachB.filter(q => q.blocked).reduce((t, q) => t + q.c, 0) / sum).toFixed(1) : 0, clearLostPct: sum ? +(100 * reach.filter(q => !q.blocked && !inBand(q)).reduce((t, q) => t + q.c, 0) / sum).toFixed(1) : 0 } : null,
              band2: { fragCeilY: bd ? +bd.ceilY.toFixed(2) : null, reaching: reach2.length, keptPct: sum ? +(100 * b2sum / sum).toFixed(1) : 0,
                leakKeptPct: sum ? +(100 * reach2.filter(q => q.blocked).reduce((t, q) => t + q.c, 0) / sum).toFixed(1) : 0,
                clearKeptPct: (() => { const cl = reach.filter(q => !q.blocked), cs = cl.reduce((t, q) => t + q.c, 0), c2 = reach2.filter(q => !q.blocked).reduce((t, q) => t + q.c, 0); return cs ? +(100 * c2 / cs).toFixed(1) : null; })(),
                viaVoid: viaVoid.length, viaVoidUpLamps: viaVoid.filter(q => q.other === 'up').length } } : null };
        }
        const floorHit = (sx, sy) => { rc.near = 0; rc.far = Infinity; rc.setFromCamera(new THREE.Vector2(sx, sy), A.camera); const h = rc.intersectObjects(tg, false)[0]; if (!h || !h.face) return null;
          const o = h.object, M = new THREE.Matrix4().copy(o.matrixWorld), mi = new THREE.Matrix4();
          if (o.isInstancedMesh && h.instanceId != null) { o.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (o.isBatchedMesh && h.batchId != null) { o.getMatrixAt(h.batchId, mi); M.multiply(mi); }
          const n = h.face.normal.clone().transformDirection(M); window.__SL_LASTMISS = { ny: +n.y.toFixed(2), y: +h.point.y.toFixed(2), cls: clsOf(h) }; return n.y > 0.7 ? h.point.clone() : null; };
        const centre = (() => { rc.setFromCamera(new THREE.Vector2(0, 0), A.camera); const h = rc.intersectObjects(tg, false)[0]; return h ? stackAt(h.point.clone()) : null; })();
        const eye = stackAt(A.camera.position.clone().add(new THREE.Vector3(0, -0.05, 0)));   // the viewer's eye: always open air, in the space being viewed
        const grid = []; window.__SL_GRIDMISS = []; for (let gy = -0.9; gy <= 0.11; gy += 0.25) for (let gx = -0.8; gx <= 0.81; gx += 0.4) { const P = floorHit(gx, gy); if (P) grid.push(stackAt(P)); else window.__SL_GRIDMISS.push(window.__SL_LASTMISS); }
        const agg = { floorSamples: grid.length, zoneResolved: grid.filter(q => typeof q.zone === 'number' && q.zone > 0).length, outside: grid.filter(q => q.zone === 0).length,
          solid: grid.filter(q => q.zone === 'SOLID').length, offGrid: grid.filter(q => q.zone === -1).length,
          meanLeakPct: grid.length ? +(grid.reduce((t, q) => t + q.wall + q.slab, 0) / grid.length).toFixed(1) : 0,
          meanKeptPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + q.after.keptPct, 0) / grid.length).toFixed(1) : null,
          meanBand2KeptPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + q.after.band2.keptPct, 0) / grid.length).toFixed(1) : null,
          meanBand2LeakKeptPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + q.after.band2.leakKeptPct, 0) / grid.length).toFixed(1) : null,
          band2ViaVoidSamples: (LZ && grid.length) ? grid.filter(q => q.after.band2.viaVoidUpLamps > 0).length : null,
          meanBandKeptPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + (q.after.band ? q.after.band.keptPct : q.after.keptPct), 0) / grid.length).toFixed(1) : null,
          meanBandLeakKeptPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + (q.after.band ? q.after.band.blockedButReachingPct : q.after.blockedButReachingPct), 0) / grid.length).toFixed(1) : null,
          meanBlockedButReachingPct: (LZ && grid.length) ? +(grid.reduce((t, q) => t + q.after.blockedButReachingPct, 0) / grid.length).toFixed(1) : null,
          zones: [...new Set(grid.map(q => q.zone))] };
        const L0 = lamps[0];
        return { sunI: A.sun ? +A.sun.intensity.toFixed(3) : null, sunUp: A.sun ? +(A.sun.position.clone().normalize().y).toFixed(3) : null, hemiI: +A.hemi.intensity.toFixed(3),
          lampI: L0 ? +L0.intensity.toFixed(2) : null, lampDecay: L0 ? L0.decay : null, lampDist: L0 ? L0.distance : null, lampsLit: lamps.length, centre, eye, agg, grid, gridMiss: window.__SL_DEBUG ? window.__SL_GRIDMISS : undefined };
      });
      const g = re => (L.slice(b1).find(t => re.test(t)) || '-').slice(0, 260);
      say(ps.name + ' STACK ' + JSON.stringify(r) + '\n   ' + [g(/§GI_STILL result/), g(/§STILL_BASE sky/), g(/§LIGHT_STACK/), g(/§SKY_PORTAL placed/)].join('\n   '));
      const ov = await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'), c = o && o.querySelector('canvas'); return c ? c.toDataURL('image/jpeg', 0.85) : null; });
      if (ov) fs.writeFileSync(path.join(OUT, ps.name.split(' ')[0] + '.jpg'), Buffer.from(ov.split(',')[1], 'base64'));
      await p.keyboard.press('Escape'); await sleep(3000);
    }
    await p.close();
  }
  say('pageErrors=' + errs); await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
