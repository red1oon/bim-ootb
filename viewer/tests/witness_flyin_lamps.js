// ⚠ DO NOT REMOVE — probe §CAMDEP fly-in (red1's 5 Hospital stills, 8619): frame 5 goes 39% black ("sudden dark due to no
// lamp caught in frame"). One session, the 5 poses in order, one refine staging each; per pose: camera zone, lamps kept per
// zone (count, sum), zones that lost ALL lamps vs the previous pose, portals, meter, and the LEFT-THIRD surface points
// (4x6 grid, x in the left third of the frame): their zones, lamp irradiance reaching them, kept lamps in their zone.
// GATE (§LAMP_ZONE_PICK spec + watchdog ruling): per pose, FAIL unless (1) camera-zone lamps kept = min(cap, camera-zone
// lamps available) and (2) pickZero = 0: a camera-zone left-third point with 0 lamp light counts as pickZero only when some
// lamp of ITS zone (kept or not) has N.L > 0 within the lamp range yet no kept lamp reaches it; a point no zone lamp could
// ever reach is GEOMETRY_DARK (bounce's job), printed, not a failure. decideMs of the ray-free DECIDE (target < 50 ms) and
// the exposure change pose 4 -> 5 in stops are reported. GUARD: any "Shader Error"/"Context Lost"/pageerror. Exit 2 on GUARD, 3 on a gate FAIL. Read the log.
// RUN: node witness_flyin_lamps.js <port>
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const POSES = [[-8.222,-11.231,-7.05,-2.545,-9.579,5.661],[-10.672,-13.522,-3.688,-4.821,-11.595,7.198],[-9.807,-13.471,1.608,-6.305,-12.317,8.123],[-9.983,-12.84,6.024,-8.385,-12.217,9.151],[-8.226,-11.841,13.38,-10.792,-12.069,18.264]];
const POSE_OFF = process.env.POSE ? +process.env.POSE - 1 : 0; if (process.env.POSE) POSES.splice(0, POSES.length, POSES[POSE_OFF]);   // one pose only (1-based)
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'] });
  const p = await b.newPage(); await p.setViewport({ width: 1685, height: 874 }); const L = []; let bad = 0; p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error|Context Lost/.test(t)) bad++; }); p.on('pageerror', () => bad++);
  await p.goto('http://127.0.0.1:' + process.argv[2] + '/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length >= 63182, { timeout: 400000, polling: 2000 }); await sleep(2000);
  let prevZones = null, gateFail = 0; const exposures = [];
  for (let k = 0; k < POSES.length; k++) { const ps = POSES[k];
    for (let i = 0; i < 20 && await p.evaluate(() => !!window.APP._stillRefineActive); i++) { if (i === 0) await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(1000); }
    await p.evaluate(ps => { const A = window.APP; A.camera.position.set(ps[0], ps[1], ps[2]); A.controls.target.set(ps[3], ps[4], ps[5]); A.controls.update(); }, ps);
    await sleep(1000); const b1 = L.length; await p.evaluate(() => window.APP.toggleStillRefine());
    for (let i = 0; i < 300 && !L.slice(b1).some(t => /§STILL_REFINE done/.test(t)); i++) await sleep(1000);
    const r = await p.evaluate(() => { const A = window.APP, T = window.THREE, LZ = window.LightZones, lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const zones = {}; (A._nightLights || []).forEach(l => { if (!(l.visible && l.intensity > 0)) return; const z = (l.userData && l.userData.sourcedZone) || 0; zones[z] = zones[z] || { n: 0, sum: 0 }; zones[z].n++; zones[z].sum += l.intensity; });
      const tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky) { const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.some(m => m && m.visible !== false && !(m.transparent && m.opacity < 0.95) && !m.isMeshBasicMaterial)) tg.push(o); } });
      const rc = new T.Raycaster(), M = new T.Matrix4(), mi = new T.Matrix4(), left = [];
      const allFx = A._nightFixtureWorldPositions(); allFx.forEach(q => { if (q.__slz === undefined) { const v = LZ.atLamp(q); q.__slz = (v > 0 && v !== LZ.SOLID) ? v : 0; } });
      const lampRange = ((A._nightLights || []).find(l => l.visible && l.intensity > 0) || {}).distance || 0;
      const att = (d, cut, dec) => { let f = 1 / Math.max(Math.pow(d, dec), 0.01); if (cut > 0) f *= Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / cut, 4))), 2); return f; };
      for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) { rc.setFromCamera(new T.Vector2(-1 + (x + 0.5) / 4 * 0.667, 1 - (y + 0.5) / 6 * 2), A.camera); const h = rc.intersectObjects(tg, false)[0]; if (!h || !h.face) continue;
        M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
        const N = h.face.normal.clone().transformDirection(M); if (N.dot(rc.ray.direction) > 0) N.negate(); const si = LZ.surfaceInfo(h.point, N);
        // Watchdog ruling 2 (red1-c6): CAP_LIMITED = its reaching lamps exist but lie outside the cap while the camera zone alone
        // exceeds the cap (zone lamps > cap): counted, printed, not a FAIL (closes with ALTC F1, no cap).
        const __camZ = (function () { const v = LZ.at(A.camera.position); return (v > 0 && v !== LZ.SOLID) ? v : LZ.atSurface(A.camera.position, { x: 0, y: 1, z: 0 }); })(), __capN = (typeof A._stillLampCap === 'number') ? A._stillLampCap : 200;
        // Watchdog ruling: a 0-lamp-light point is pickZero only if some lamp of ITS zone (kept or not) has N.L > 0 within
        // the lamp range, yet no kept lamp reaches it; with no such lamp at all it is GEOMETRY_DARK (bounce's job).
        const zoneAll = allFx.filter(q => q.__slz === si.zone), cut = lampRange; let anyZoneLamp = 0;
        zoneAll.forEach(q => { const v = new T.Vector3(q.x, q.y, q.z).sub(h.point), d = v.length(); if (cut > 0 && d > cut) return; v.normalize(); if (N.dot(v) > 0) anyZoneLamp++; });
        let El = 0, reach = 0; (A._nightLights || []).forEach(l => { if (!(l.visible && l.intensity > 0)) return; const lz = (l.userData && l.userData.sourcedZone) || 0; if (lz && si.zone && lz !== si.zone) return; const v = l.position.clone().sub(h.point), d = v.length(); v.normalize(); const nl = Math.max(0, N.dot(v)); if (!nl) return; reach++; El += lum(l.color) * l.intensity * att(d, l.distance, l.decay) * nl; });
        left.push({ z: si.zone, sky: si.sky, El: +El.toExponential(2), lampsReaching: reach, zoneLampsCouldReach: anyZoneLamp, kind: (+El > 0) ? 'lit' : (anyZoneLamp ? ((si.zone === __camZ && zoneAll.length > __capN) ? 'CAP_LIMITED' : 'PICK_ZERO') : 'GEOMETRY_DARK'), cls: h.object.userData.ifcClass || '', gx: x, gy: y, n: [+N.x.toFixed(2), +N.y.toFixed(2), +N.z.toFixed(2)], distM: +h.distance.toFixed(1), nearestKeptM: +Math.sqrt(Math.min.apply(null, (A._nightLights || []).filter(l => l.visible && l.intensity > 0).map(l => l.position.distanceToSquared(h.point)))).toFixed(1) }); }
      const lz = {}; left.forEach(q => { lz[q.z] = lz[q.z] || { pts: 0, lampsKeptInZone: zones[q.z] ? zones[q.z].n : 0, El0: 0, pickZero: 0, geometryDark: 0, capLimited: 0 }; lz[q.z].pts++; if (!(+q.El > 0)) { lz[q.z].El0++; if (q.kind === 'PICK_ZERO') lz[q.z].pickZero++; else if (q.kind === 'CAP_LIMITED') lz[q.z].capLimited++; else lz[q.z].geometryDark++; } });
      let por = 0, porI = 0; A.scene.traverse(o => { if (o.isSpotLight && o.userData && o.userData.skyPortal && !o.userData.pad && o.intensity > 0) { por++; porI += o.intensity; } });
      const cz0 = (A._sourcedCap && A._sourcedCap.camZone) || 0, zoneLampsAvail = A._nightFixtureWorldPositions().filter(q => LZ.atLamp(q) === cz0).length;
      return { camZone: cz0, cap: A._stillLampCap, zoneLampsAvail, camZoneKept: zones[cz0] ? zones[cz0].n : 0, lampRange, exposure: +A.renderer.toneMappingExposure.toFixed(3), zonesLit: Object.fromEntries(Object.entries(zones).map(([z, v]) => [z, v.n + '/' + v.sum.toFixed(2)])), leftZones: lz, leftSample: left.slice(0, 6), leftZeroPts: left.filter(q => !(+q.El > 0)), portals: por, portalI: +porI.toFixed(1) }; });
    const lost = prevZones ? Object.keys(prevZones).filter(z => !r.zonesLit[z]) : [];
    console.log('§CAMDEP_FLYIN pose=' + (k + 1 + POSE_OFF) + ' ' + JSON.stringify(r) + ' zonesLostAllLamps=' + JSON.stringify(lost));
    L.slice(b1).filter(t => /§LAMP_ZONE_PICK|§LAMP_CAP_ZONE|§METER camera|§SOURCED_LIGHT_CAP|§LAMP_CAP_NEAREST|§BAKE_INTERIOR_TOPUP/.test(t)).forEach(t => console.log('    ' + t.slice(0, 300)));
    const expKept = Math.min(typeof r.cap === 'number' ? r.cap : 200, r.zoneLampsAvail), lw = r.leftZones[r.camZone] || { pts: 0, El0: 0, pickZero: 0, geometryDark: 0, capLimited: 0 };
    const ok = r.camZone > 0 && r.camZoneKept === expKept && lw.pickZero === 0;
    const dm = (L.slice(b1).map(t => /§LAMP_ZONE_PICK camZone=.*decideMs=([0-9.]+)/.exec(t)).filter(Boolean).map(m => +m[1]));
    console.log('§LAMP_ZONE_PICK_GATE pose=' + (k + 1 + POSE_OFF) + ' ' + (ok ? 'PASS' : 'FAIL') + ' camZone=' + r.camZone + ' camZoneKept=' + r.camZoneKept + ' expected=min(cap ' + r.cap + ', zoneLamps ' + r.zoneLampsAvail + ')=' + expKept +
      ' leftWallZero=' + lw.El0 + '/' + lw.pts + ' pickZero=' + lw.pickZero + ' geometryDark=' + lw.geometryDark + ' capLimited=' + (lw.capLimited || 0) + ' (lampRange ' + r.lampRange + ' m) decideMs=' + (dm.length ? dm.map(v => v.toFixed(1)).join('/') : 'n/a') + ' exposure=' + r.exposure + (k > 0 ? ' stopsFromPrev=' + (Math.log2(r.exposure / exposures[k - 1])).toFixed(2) : ''));
    if (!ok) gateFail++; exposures.push(r.exposure);
    prevZones = r.zonesLit; }
  console.log('§LAMP_ZONE_PICK_GATE exposure pose4->5 = ' + (exposures.length >= 5 ? (Math.log2(exposures[4] / exposures[3])).toFixed(2) + ' stops (was +1.77)' : 'n/a'));
  console.log('GUARD ' + (bad ? 'FAIL' : 'PASS') + ' guardBad=' + bad + ' gateFailPoses=' + gateFail); await b.close(); if (bad) process.exitCode = 2; else if (gateFail) process.exitCode = 3; })().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
