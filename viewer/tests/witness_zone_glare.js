// ⚠ DO NOT REMOVE — §GLARE grid witness for §ZONE_OPEN_SKY (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§ZONE_OPEN_SKY — SPEC"). Read the log after every run.
// Watchdog red1-c6 (red1: "ray-test runs waste time"): black_exterior / junction_zone_flip / covered_open_side_black are CPU
// facts of the zone grid, computed by LightZones.audit at build time — no still, no pose walk, seconds per building.
//   black_exterior          faces between a SOLID cell and an OPEN-TO-SKY cell whose fragment lookup withholds sky (black in shade)
//   junction_zone_flip      floor points inside a wall / column / partition base's rasterised column whose lookup is not the
//                           room cell beside them (red1's bright junction strips)
//   covered_open_side_black covered cells that see the sky sideways (24 lattice rays) but are classed no-sky (Clinic canopy)
// Per building: load (full element count or VACUOUS), LightZones.build (the tree's builder = AFTER arm, prints its own
// §LIGHT_ZONE + §GLARE lines), then the 3395ae42 builder injected as LightZonesOld builds the BEFORE grid from the same scene
// and LightZones.audit runs on it with the old fragment rule (atSurface: 0 / off-grid = sky, zone > 0 or solid = no sky).
// The before arm must FAIL where red1 saw the defects (Clinic canopy, Hospital junctions); the after arm must read 0.
// Terminal: §HALL_ZONE — the zone at witness_wash_sources' terminal_hall_floor stand-in camera (1.6 m over the hall floor,
// long axis) must be != 0 (the hall is covered), with its aperture m2 (up / side) — the ~174 m2 roof-edge band the old rule
// leaked through. GUARD (every run): FAIL on any console "Shader Error", "Context Lost" or pageerror. Exit 3 when any AFTER
// count > 0 or the Terminal hall reads zone 0.
// RUN: node viewer/tests/witness_zone_glare.js <port> [outdir] [Hospital,Clinic,Terminal]   (OLD_BUILDER=<light_zones.js of 3395ae42>)
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path'), cp = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8614', OUT = '/tmp/witness_zone_glare', LIST = 'Hospital,Clinic,Terminal'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const FULL = { Hospital: 63182, Clinic: 16071, Terminal: 48428, HHS_Office_Federated: 6839 };
const OLD = process.env.OLD_BUILDER ? fs.readFileSync(process.env.OLD_BUILDER, 'utf8') : cp.execSync('git -C ' + path.resolve(__dirname, '../..') + ' show 3395ae42:viewer/light_zones.js').toString();
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 }; let afterFail = 0;
  for (const db of LIST.split(',')) {
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + db + ' ' + e.message.slice(0, 200)); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + db + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = -1, stable = 0; for (let i = 0; i < 200 && stable < 3; i++) { await sleep(2000);
      const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, st: !!window.APP.streaming, bb: (window.APP._bboxPlaceholders || []).length }));
      if (!s.st && s.bb === 0 && s.n > 0 && s.n === n && (!FULL[db] || s.n >= FULL[db])) stable++; else stable = 0; n = s.n; }
    const full = stable >= 3 && (!FULL[db] || n >= FULL[db]);
    const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
    say(db + ' loaded guids=' + n + (FULL[db] ? '/' + FULL[db] : ' (settled)') + (full ? '' : ' VACUOUS') + ' sw=' + sw);
    if (!full) { await p.close(); continue; }
    if (!(await p.evaluate(() => !!window.LightZones))) await p.addScriptTag({ url: '/viewer/light_zones.js?w=' + Date.now() });
    await p.addScriptTag({ content: OLD.replace('global.LightZones = {', 'global.LightZonesOld = {') });
    const b1 = L.length;
    const r = await p.evaluate(() => { const A = window.APP, LZ = window.LightZones, LO = window.LightZonesOld;
      const Z = LZ.build(A, { force: true }); if (!Z) return { err: 'AFTER build returned null' };
      const t0 = performance.now(), ZO = LO.build(A, { force: true }); if (!ZO) return { err: 'BEFORE build returned null', after: Z.stats.glare };
      const oldMs = performance.now() - t0;
      const oldRule = (p, n) => { const v = LO.atSurface(p, n); return { zone: v, sky: (v === 0 || v === -1) ? 1 : 0 }; }, oldCellSky = v => (v === 0 ? 1 : 0);
      const before = LZ.audit(ZO, oldRule, oldCellSky);
      return { after: Z.stats.glare, afterStats: { zones: Z.zones, cells: Z.stats.cells, openSkyCells: Z.stats.openSkyCells, indoorCells: Z.stats.indoorCells, skyLitCells: Z.stats.skyLitCells, apertureM2: Z.stats.apertureM2, ms: Z.stats.ms, skyMs: Z.stats.skyMs },
        before, beforeStats: { zones: ZO.zones, cells: ZO.stats.cells, outsideCells: ZO.stats.outsideCells, indoorCells: ZO.stats.indoorCells, ms: ZO.stats.ms, oldBuildMs: Math.round(oldMs) } }; });
    const g = re => (L.slice(b1).find(t => re.test(t)) || '-').slice(0, 700);
    say('§ZONE_STATS bld=' + db + ' ' + g(/§LIGHT_ZONE bld=/));
    if (r.err) { say('§GLARE bld=' + db + ' FAIL ' + r.err); afterFail++; await p.close(); continue; }
    const line = (tag, q) => '§GLARE' + tag + ' bld=' + db + ' ' + ((q.blackExteriorFaces > 0 || q.junctionFlips > 0 || q.canopyCells > 0) ? 'FAIL' : 'PASS') + ' black_exterior=' + q.blackExteriorFaces + ' junction_zone_flip=' + q.junctionFlips + ' covered_open_side_black=' + q.canopyCells +
      ' (exteriorFaces=' + q.exteriorFaces + ' junctionTested=' + q.junctionTested + ' junctionZoneFlips=' + q.junctionZoneFlips + ' rayLitCoveredCells=' + q.rayLitCoveredCells + ' coveredCells=' + q.coveredCells + ' auditMs=' + q.ms + ')';
    say(line('_BEFORE(3395ae42)', r.before) + ' ' + JSON.stringify(r.beforeStats));
    say(line('_AFTER', r.after) + ' ' + JSON.stringify(r.afterStats));
    if (r.after.blackExteriorFaces > 0 || r.after.junctionFlips > 0 || r.after.canopyCells > 0) afterFail++;
    if (db === 'Terminal') { const hz = await p.evaluate(() => { const A = window.APP, THREE = window.THREE, LZ = window.LightZones, LO = window.LightZonesOld, Z = LZ.get();
        const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
        for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
          for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
        const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
        const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y0 + 1.6;
        const cam = (x1 - x0 >= z1 - z0) ? { x: x0 + 0.1 * (x1 - x0), y: h, z: cz } : { x: cx, y: h, z: z0 + 0.1 * (z1 - z0) };
        let z = LZ.at(cam); if (z === LZ.SOLID) z = LZ.atSurface(cam, { x: 0, y: 1, z: 0 }); const zi = (z > 0 && z !== LZ.SOLID) ? Z.zoneInfo[z - 1] : null;
        let zo = LO.at(cam); if (zo === LO.SOLID) zo = LO.atSurface(cam, { x: 0, y: 1, z: 0 });
        return { cam: [cam.x, cam.y, cam.z].map(t => +t.toFixed(2)), beforeZone: zo, afterZone: z, cells: zi && zi.cells, m3: zi && zi.m3, apertureM2: zi && zi.apertureM2, upM2: zi && zi.upM2, sideM2: zi && zi.sideM2, surfaceM2: zi && zi.surfaceM2, skyLitCells: zi && zi.skyLitCells }; });
      say('§HALL_ZONE bld=Terminal ' + (hz.afterZone > 0 ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(hz)); if (!(hz.afterZone > 0)) afterFail++; }
    await p.close();
  }
  const fail = guard.shaderError || guard.contextLost || guard.pageError;
  say('GUARD ' + (fail ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard) + ' afterFailBuildings=' + afterFail); await b.close(); if (fail) process.exitCode = 2; else if (afterFail) process.exitCode = 3;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
