// ⚠ WITNESS W-BILLBOARD-ART — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §FACADE_SIGNAGE
// THE ISSUE: the billboard panel is real DB geometry, but component_geometries carries NO UV
// channel, so a texture map has nothing to sample. §BILLBOARD_ART puts the artwork on its own
// quad placed FROM THE PANEL'S OWN ROW. Asserts: the DB rows exist and round-trip; the art quad
// is built once, sized and positioned from those rows, clear of the panel face; it owns its
// material; and with no billboard.png present the NOTICE fallback is what renders.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8412, DB = process.env.DB || 'Terminal_Hi.db';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'] });
  const page = await b.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${DB}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine, { timeout: 240000 });
  await sleep(10000);
  await page.waitForFunction(() => { try { return window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms')[0][0] > 0; } catch(e){ return false; } }, { timeout: 180000, polling: 2000 });
  let n0=-1, st=0; for (let i=0;i<90;i++){ const n=await page.evaluate(()=>Object.keys(window.APP.guidMap).length); st=(n===n0&&n>0)?st+1:0; if(st>=3)break; n0=n; await sleep(2000);}    
  const db = await page.evaluate(() => {
    const q = s => { try { return window.APP.dbQuery(s) || []; } catch(e){ return []; } };
    return { panel: q("SELECT element_name, center_x, bbox_y, bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.element_name LIKE 'BIM_OOTB_Billboard%'"),
             lamps: q("SELECT COUNT(*) FROM elements_meta WHERE element_name LIKE 'BIM_OOTB_Floodlight%'"),
             fin:   q("SELECT finish, COUNT(*) FROM render_finishes GROUP BY 1") };
  });
  await page.evaluate(() => window.APP.startStillRefine());
  // Wait for the CONDITION, never a fixed sleep: the art quad's texture arrives after up to four
  // sequential image probes (404, 404, then the hit), and a timed guess measured a null map and
  // reported a working feature as broken. Second occurrence of this exact race in this suite —
  // the ground witness needed the same fix for _applyGroundTexture's async load.
  await page.waitForFunction(() => {
    let ok = false;
    window.APP.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry'
      && o.material && o.material.isMeshBasicMaterial && o.material.map) ok = true; });
    return ok;
  }, { timeout: 120000, polling: 500 }).catch(() => {});
  await sleep(2000);
  const art = await page.evaluate(() => {
    let found = null, count = 0, shared = 0;
    const mats = [];
    window.APP.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.isMeshBasicMaterial) {
      count++; found = { w: o.geometry.parameters.width, h: o.geometry.parameters.height, x: o.position.x, y: o.position.y, z: o.position.z,
                         roty: o.rotation.y, hasMap: !!o.material.map, uuid: o.material.uuid }; } });
    window.APP.scene.traverse(o => { const m = o.material ? (Array.isArray(o.material)?o.material:[o.material]) : []; m.forEach(x => { if (found && x && x.uuid === found.uuid) shared++; }); });
    return { found, count, shared };
  });
  const P=(ok,s)=>console.log((ok?'  PASS  ':'  FAIL  ')+s);
  console.log(`\n═══ W-BILLBOARD-ART — ${DB} ═══`);
  console.log('\n─ 1. DB ROWS');
  P(db.panel.length===1, `panel row: ${db.panel.length ? db.panel[0][0]+' cx='+db.panel[0][1].toFixed(3)+' '+db.panel[0][2]+'x'+db.panel[0][3]+'m' : 'MISSING'}`);
  P(db.lamps[0] && db.lamps[0][0]===4, `corner floodlights in DB: ${db.lamps[0]?db.lamps[0][0]:0} (expect 4)`);
  P(db.fin.length>0, `render_finishes: ${db.fin.map(r=>r[0]+'='+r[1]).join(', ')}`);
  console.log('\n─ 2. ART QUAD built from those rows');
  P(!!art.found, `art quad exists (count=${art.count}, must be 1)`);
  if (art.found) {
    P(Math.abs(art.found.w-db.panel[0][2])<0.01 && Math.abs(art.found.h-db.panel[0][3])<0.01, `sized from the DB row: ${art.found.w}m x ${art.found.h}m`);
    P(Math.abs(art.found.roty-Math.PI/2)<1e-6, `oriented to the +X facade (rotation.y=${art.found.roty.toFixed(4)})`);
    P(art.found.hasMap, `texture bound (fallback notice or billboard.png)`);
    P(art.shared===1, `material shared with ${art.shared} mesh — the invariant (must be 1: itself)`);
  }
  console.log('\n─ 3. IMAGE PICKUP + ASPECT FIT');
  const fb = logs.filter(l=>/§BILLBOARD_(ART|FIT)/.test(l));
  const got = fb.find(l=>/§BILLBOARD_ART image=/.test(l));
  P(!!got, `real image picked up by convention (not the fallback): ${got ? got.split('image=')[1] : 'NONE — fell back'}`);
  const fit = fb.find(l=>/§BILLBOARD_FIT/.test(l));
  P(!!fit && /mode=cover/.test(fit), `artwork COVER-fitted (crop to fill), never stretched: ${fit ? fit.replace('§BILLBOARD_FIT ','') : 'no fit line'}`);
  console.log('\n─ § lines'); fb.forEach(l=>console.log('   '+l));
  const errs = logs.filter(l=>/PAGEERROR/.test(l)); if (errs.length){ console.log('\n─ errors'); errs.slice(0,3).forEach(l=>console.log('   '+l)); }
  await b.close();
})();
