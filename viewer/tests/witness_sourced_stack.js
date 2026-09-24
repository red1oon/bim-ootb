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
  { db: 'Clinic', full: 16071, sun: null, poses: [{ name: 'clinic_corr_x (stand-in)', ifcPos: [-41.5, 48.57, 1.6], ifcTgt: [-22, 48.57, 1.3] }] },
];
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  let errs = 0;
  for (const R of RUNS) {
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
      const r = await p.evaluate(() => {
        const A = window.APP, THREE = window.THREE; const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, 0), A.camera);
        const tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky && !(o.userData && o.userData.excludeFromShadow)) tg.push(o); });
        const hit = rc.intersectObjects(tg, false)[0]; if (!hit) return { err: 'no floor hit' };
        const P = hit.point.clone(), P0 = P.clone().add(new THREE.Vector3(0, 0.05, 0));
        const zoneAt = (typeof A._sourcedZoneAt === 'function') ? A._sourcedZoneAt : null, zP = zoneAt ? zoneAt(P0) : null;
        const rows = []; (A._nightLights || []).forEach(l => { if (!(l.intensity > 0)) return; const d = Math.max(0.01, l.position.distanceTo(P));
          let att = 1 / Math.max(Math.pow(d, l.decay), 0.01); if (l.distance > 0) att *= Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / l.distance, 4))), 2);
          const c = l.intensity * att; if (!(c > 0)) return;
          const dir = l.position.clone().sub(P0), dl = dir.length(); dir.normalize(); rc.set(P0, dir); rc.near = 0.05; rc.far = Math.max(0.06, dl - 0.5);
          rc.near = 0.2;   // skip what the floor point itself sits on (a door threshold, a rug)
          const hits = rc.intersectObjects(tg, false), dy = l.position.y - P.y;
          const clsOf = (h) => { const o = h.object; let cls = (o.userData && o.userData.ifcClass) || null, nm = '';
            const gd = A.guidMap[o.id + '_' + (h.batchId != null ? h.batchId : h.instanceId)] || (o.userData && o.userData.guid);
            if (gd) { try { const q = A.dbQuery("SELECT ifc_class, element_name FROM elements_meta WHERE guid=?", [gd]); if (q.length) { cls = q[0][0]; nm = String(q[0][1]).slice(0, 30); } } catch (e) {} }
            return { cls: cls || '?', nm }; };
          // HARD = a room boundary (wall, slab, roof, ceiling, closed door); thin stuff (beam, railing, member, duct, column,
          // glass) is not what room binding is about and does not count as "blocked".
          const HARD = /^Ifc(Wall|WallStandardCase|Slab|Roof|Covering|Door)$/;
          let hc = null; for (const h of hits) { if (dl - h.distance < 0.3) continue; const k = clsOf(h); if (HARD.test(k.cls)) { hc = { cls: k.cls + ':' + k.nm, fromLamp: +(dl - h.distance).toFixed(2), fromFloor: +h.distance.toFixed(2) }; break; } }
          const blocked = !!hc;
          const lz = (l.userData && l.userData.sourcedZone != null) ? l.userData.sourcedZone : null;
          const reaches = !(l.userData && l.userData.sourcedZone > 0 && zP > 0 && l.userData.sourcedZone !== zP);
          rows.push({ c, blocked, hc, other: Math.abs(dy) > 2.5 && dy > 0 ? 'up' : (Math.abs(dy) > 2.5 ? 'down' : 'same'), lz, reaches }); });
        rows.sort((a, b) => b.c - a.c); const pk = rows.length ? rows[0].c : 0, sum = rows.reduce((s, q) => s + q.c, 0);
        const agg = (f) => { const s = rows.filter(f); return { n: s.length, n5: s.filter(q => q.c > 0.05 * pk).length, share: sum ? +(100 * s.reduce((a, q) => a + q.c, 0) / sum).toFixed(1) : 0 }; };
        const reach = rows.filter(q => q.reaches), rsum = reach.reduce((s, q) => s + q.c, 0);
        const sunI = A.sun ? +A.sun.intensity.toFixed(3) : null, sunUp = A.sun ? +(A.sun.position.clone().normalize().y).toFixed(3) : null;
        const L0 = (A._nightLights || []).find(l => l.intensity > 0);
        return { sunI, sunUp, hemiI: +A.hemi.intensity.toFixed(3), lampI: L0 ? +L0.intensity.toFixed(2) : null, lampDecay: L0 ? L0.decay : null, lampDist: L0 ? L0.distance : null, P: [P.x, P.y, P.z].map(v => +v.toFixed(1)), lit: rows.length, n5: rows.filter(q => q.c > 0.05 * pk).length, sum: +sum.toFixed(3), strongest: +pk.toFixed(3),
          clear: agg(q => !q.blocked), blockedSame: agg(q => q.blocked && q.other === 'same'), blockedOtherStorey: agg(q => q.blocked && q.other !== 'same'),
          topBlocked: rows.filter(q => q.blocked).slice(0, 12).map(q => ({ c: +q.c.toFixed(3), st: q.other, ...q.hc })),
          zoneP: zP, afterBinding: zoneAt ? { reaching: reach.length, sum: +rsum.toFixed(3), crossWall: reach.filter(q => q.blocked && q.lz > 0 && q.lz !== zP).length,
            otherStoreyReaching: reach.filter(q => q.other === 'up').length, unbound: rows.filter(q => !(q.lz > 0)).length } : null };
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
