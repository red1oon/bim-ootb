// PROBE — §PHOTO_EMBER part 2: is "too dark drab" the EXPOSURE, the emissive, or both?
// User: "Can we get light to emit from those fixtures. Scene still too dark drab."
//
// Three renders at ONE Alt+C pose, changing one thing at a time, so the answer is attributable:
//   A  as-shipped                     (toneMappingExposure 0.45)
//   B  exposure raised to 1.0         (nothing else touched)
//   C  exposure 1.0 + luminaires emissive
// scene.js:103 ships 0.45 against three.js's default of 1.0, so A vs B tests the cheapest possible
// explanation before anything is built. B vs C tests whether emission adds anything once the frame
// is correctly exposed — the previous probe measured it as invisible at 0.45.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'); const path = require('path');
const PORT = process.env.PORT || 8403, OUT = '/tmp/ember_out';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LUM = ['light','troffer','downlight','luminaire','lamp','sconce','pendant'];
const NOT = ['switch','receptacle','panelboard','socket','outlet'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless:'new', protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Clinic_extracted.db`, {waitUntil:'domcontentloaded', timeout:60000});
  await page.waitForFunction(()=>window.APP&&window.APP.startStillRefine&&window.APP._composer,{timeout:180000});
  await sleep(12000);
  await page.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});

  const want = await page.evaluate(()=> (window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(b=>/Architectural|Electrical/i.test(b)).sort());
  for (const b of want) {
    await page.evaluate(bb=>{try{window.APP.streamBuilding(bb);}catch(e){}}, b);
    let prev=-1; for(let i=0;i<60;i++){const n=await page.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }

  const pose = await page.evaluate(()=>{ const p=window.APP.cinemaPathPlan(30).poseAt(0.60); return {x:p.x,y:p.y,z:p.z,tx:p.tx,ty:p.ty,tz:p.tz}; });
  await page.evaluate(p=>{const A=window.APP;A.camera.position.set(p.x,p.y,p.z);A.controls.target.set(p.tx,p.ty,p.tz);A.controls.update();A.markDirty&&A.markDirty();}, pose);
  const shipped = await page.evaluate(()=>window.APP.renderer.toneMappingExposure);

  async function shoot(tag){
    await page.evaluate(()=>{ if(window.APP._stillRefineActive) window.APP.stopStillRefine(true); });
    await sleep(600);
    await page.evaluate(()=>window.APP.startStillRefine());
    for(let i=0;i<120 && await page.evaluate(()=>!!window.APP._stillRefineBusy);i++) await sleep(500);
    await sleep(1500);
    const f=path.join(OUT,`bright_${tag}.png`); await page.screenshot({path:f}); return f;
  }
  const files={};
  files.A = await shoot('A_shipped_exp' + String(shipped).replace('.',''));

  await page.evaluate(()=>{ window.APP.renderer.toneMappingExposure = 1.0; window.APP.markDirty&&window.APP.markDirty(); });
  files.B = await shoot('B_exposure10');

  const lit = await page.evaluate((L,N)=>{
    const A=window.APP;
    const like=(w,j)=>w.map(x=>"lower(element_name) LIKE '%"+x+"%'").join(j);
    const rows=A.dbQuery("SELECT guid FROM elements_meta WHERE ("+like(L,' OR ')+") AND NOT ("+like(N,' OR ')+")")||[];
    const want=new Set(rows.map(r=>r[0])), ids=new Set();
    Object.keys(A.guidMap).forEach(k=>{ if(want.has(A.guidMap[k])) ids.add(parseInt(String(k).split('_')[0],10)); });
    const seen=new Set(); let mats=0;
    A.collectMeshes(o=>o.isMesh).forEach(o=>{ if(!ids.has(o.id))return;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ if(!m||!m.emissive||seen.has(m.uuid))return; seen.add(m.uuid); mats++;
        m.emissive.setHex(0xfff2d0); m.emissiveIntensity=3.0; m.toneMapped=false; m.needsUpdate=true; }); });
    return { fixtures: rows.length, materials: mats };
  }, LUM, NOT);
  files.C = await shoot('C_exposure10_emissive');

  await browser.close();
  console.log(`\nshipped toneMappingExposure = ${shipped}   (three.js default is 1.0)`);
  console.log(`emissive applied to ${lit.materials} materials covering ${lit.fixtures} luminaires\n`);
  Object.entries(files).forEach(([k,v])=>console.log(`  ${k}  ${v}`));
})();
