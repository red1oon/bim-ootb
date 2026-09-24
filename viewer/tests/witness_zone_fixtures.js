// ⚠ DO NOT REMOVE — §LIGHT_ZONE fixture witness (bim-compiler PHOTOREAL_STILL_RENDER.md §SOURCED_LIGHT). Read the log after every run.
// Issue (red1-4b, 2026-09-25): the camera's zone at a Clinic pose gets 0 lamps though red1 sees sconces + recessed
// downlights in that room. Per step, for the camera's zone Z: (1) selected fixtures whose bound cell (LightZones.atLamp)
// is Z, and fixtures within 1 m of a Z cell that bound elsewhere (wrong side of a wall / ceiling void); (2) of those, how
// many carry a LIT lamp in this still vs dropped by the lamp cap (list order); (3) name + shape colour of each.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT = '8611', DB = 'Clinic', POSE = '{"ifcPos":[-41.5,48.57,1.6],"ifcTgt":[-22,48.57,1.3]}'] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = []; p.on('console', m => L.push(m.text())); let errs = 0; p.on('pageerror', e => { errs++; console.log('PAGEERROR ' + e.message); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + DB + '_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 150 && st < 3; i++) { await sleep(2000); const k = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (k > 0 && k === n) st++; else st = 0; n = k; }
  console.log('loaded ' + DB + ' guids=' + n);
  await p.evaluate(ps => { const A = window.APP; if (ps.ifcPos) { const f = v => { const q = A.ifc2three(v[0], v[1], v[2]); return [q.x, q.y, q.z]; }; ps.pos = f(ps.ifcPos); ps.tgt = f(ps.ifcTgt); }
    A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); }, JSON.parse(POSE));
  await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 300 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
  if (!(await p.evaluate(() => !!window.LightZones))) await p.addScriptTag({ url: '/viewer/light_zones.js?w=' + Date.now() });
  const r = await p.evaluate(() => {
    const A = window.APP, LZ = window.LightZones, Z = LZ.build(A); const SOL = LZ.SOLID;
    const camZ = LZ.at(A.camera.position); const zc = Z.sizes[camZ - 1];
    const fx = A._nightFixtureWorldPositions(), names = A._nightFixtures.map(f => f.name);
    const lit = new Set(); (A._nightLights || []).forEach(l => { if (l.intensity > 0) lit.add(l.position.x.toFixed(2) + ',' + l.position.y.toFixed(2) + ',' + l.position.z.toFixed(2)); });
    const litByPos = (A._nightLightByPos instanceof Map) ? A._nightLightByPos : null;
    const near = (p) => { for (let dx = -1; dx <= 1; dx += 0.5) for (let dy = -1; dy <= 1; dy += 0.5) for (let dz = -1; dz <= 1; dz += 0.5) if (LZ.at({ x: p.x + dx, y: p.y + dy, z: p.z + dz }) === camZ) return true; return false; };
    const inZ = [], nearZ = []; let boundTot = 0;
    fx.forEach((p, i) => { const z = LZ.atLamp(p); if (z > 0 && z !== SOL) boundTot++;
      const key = p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2);
      const light = litByPos ? litByPos.get(p) : null;
      const rec = { name: String(names[i]).slice(0, 40), pos: [p.x, p.y, p.z].map(v => +v.toFixed(2)), bound: z === SOL ? 'SOLID' : z, raw: LZ.at(p), lit: !!(light && light.intensity > 0) || lit.has(key), hasLight: !!light,
        colour: light ? '#' + light.color.getHexString() : (p.__color != null ? '#' + p.__color.toString(16) : null) };
      if (z === camZ) inZ.push(rec); else if (near(p)) nearZ.push(rec); });
    return { camZone: camZ, camZoneM3: zc ? +(zc * 0.125).toFixed(1) : null, fixtures: fx.length, fixturesBound: boundTot, lampsLit: lit.size, lampCap: A._stillLampCap,
      inZone: { n: inZ.length, lit: inZ.filter(q => q.lit).length, list: inZ.slice(0, 20) }, nearButElsewhere: { n: nearZ.length, lit: nearZ.filter(q => q.lit).length, list: nearZ.slice(0, 20) } };
  });
  console.log('§LIGHT_ZONE_FIXTURES ' + JSON.stringify(r)); console.log('pageErrors=' + errs);
  console.log((L.slice(b1).find(t => /§LAMP_SHAPE_COLOUR/.test(t)) || '-').slice(0, 300)); console.log((L.slice(b1).find(t => /§LAMP_CAP_NEAREST/.test(t)) || '-').slice(0, 300));
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(1); });
