// ⚠ DO NOT REMOVE — §SOURCED_LIGHT_COVERAGE witness (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: room binding only works where rooms exist. Hospital's camera room index held 2 rects (§STILL_CAMINSIDE_SPARSE).
// Per building, after A.ensureRooms(): compiled rects, floors, rect floor area, and how many lamp fixtures (the Alt+S
// lamp positions) fall inside a room rect (roomAt != null). Low coverage = binding does nothing there; reported, not assumed.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT = '8600', LIST = 'Hospital,Clinic,Terminal,HHS_Office_Federated,JKR,LTU_AHouse,Duplex'] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1286,844'] });
  for (const bld of LIST.split(',')) {
    const p = await b.newPage(); await p.setViewport({ width: 1266, height: 700 }); const L = []; p.on('console', m => L.push(m.text()));
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + bld + '_extracted.db', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = -1, st = 0; for (let i = 0; i < 150 && st < 3; i++) { await sleep(2000); const k = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (k > 0 && k === n) st++; else st = 0; n = k; }
    const r = await p.evaluate(async () => { const A = window.APP; let er = null;
      try { if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) await A.loadNavigate(); er = (typeof A.ensureRooms === 'function') ? await A.ensureRooms() : { status: 'no ensureRooms' }; } catch (e) { er = { status: 'throw ' + e.message }; }
      if (!window.RoomWalker) return { er, err: 'no RoomWalker' };
      const idx = window.RoomWalker.buildCameraRoomIndex(A.db); let area = 0, rooms = new Set();
      Object.values(idx.floors).forEach(f => f.forEach(c => { area += c.sx * c.sy; rooms.add(c.room); }));
      const fx = A.dbQuery("SELECT t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcLightFixture' AND t.center_x IS NOT NULL"); if (!idx.rects) return { er: er && er.status, rects: 0 };
      let inRoom = 0, inRect2d = 0; const all = [].concat(...Object.values(idx.floors));
      fx.forEach(q => { if (idx.roomAt(q[0], q[1], q[2]) != null) inRoom++; if (all.some(c => Math.abs(q[0] - c.cx) <= c.sx / 2 && Math.abs(q[1] - c.cy) <= c.sy / 2)) inRect2d++; });
      const xs = all.map(c => c.cx), ys = all.map(c => c.cy);
      return { er: er && er.status, rects: idx.rects, rooms: rooms.size, floors: Object.keys(idx.floors).length, rectAreaM2: Math.round(area), fixtures: fx.length, fixturesInRoom: inRoom, fixturesInRect2dAnyFloor: inRect2d, anchors: idx.anchors, rectX: [Math.min(...xs), Math.max(...xs)].map(Math.round), rectY: [Math.min(...ys), Math.max(...ys)].map(Math.round) };
    });
    console.log('§SOURCED_LIGHT_COVERAGE bld=' + bld + ' guids=' + n + ' ' + JSON.stringify(r));
    await p.close();
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(1); });
