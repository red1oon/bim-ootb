// PROBE — §PHOTO_EMBER + §PHOTO_BLOOM through the REAL Alt+S path (A.startStillRefine), not by
// poking materials from outside. Same Alt+C pose, before and after, measured.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs=require('fs'), path=require('path');
const PORT=process.env.PORT||8403, OUT='/tmp/ember_out';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:720});
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Clinic_extracted.db`,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.startStillRefine&&window.APP._composer,{timeout:180000});
  await sleep(12000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const want=await p.evaluate(()=>(window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(x=>/Architectural|Electrical/i.test(x)).sort());
  for(const bb of want){ await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
    let prev=-1; for(let i=0;i<60;i++){const n=await p.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }
  const pose=await p.evaluate(()=>{const q=window.APP.cinemaPathPlan(30).poseAt(0.60);return{x:q.x,y:q.y,z:q.z,tx:q.tx,ty:q.ty,tz:q.tz};});
  await p.evaluate(q=>{const A=window.APP;A.camera.position.set(q.x,q.y,q.z);A.controls.target.set(q.tx,q.ty,q.tz);A.controls.update();A.markDirty&&A.markDirty();},pose);
  const exposure=await p.evaluate(()=>window.APP.renderer.toneMappingExposure);
  await sleep(2500);
  const navShot=path.join(OUT,'allout_1_nav.png'); await p.screenshot({path:navShot});
  await p.evaluate(()=>window.APP.startStillRefine());
  for(let i=0;i<200 && await p.evaluate(()=>!!window.APP._stillRefineBusy);i++) await sleep(500);
  await sleep(2500);
  const stillShot=path.join(OUT,'allout_2_still_ember_bloom.png'); await p.screenshot({path:stillShot});
  const bloomOn=await p.evaluate(()=>!!(window.APP._bloomPass&&window.APP._bloomPass.enabled));
  await p.evaluate(()=>window.APP.stopStillRefine(true)); await sleep(2000);
  const afterShot=path.join(OUT,'allout_3_after_restore.png'); await p.screenshot({path:afterShot});
  await b.close();
  console.log('exposure', exposure, '| bloom enabled during still:', bloomOn);
  console.log(logs.filter(l=>/PHOTO_EMBER|PHOTO_BLOOM|LOAD_FAIL|PAGEERROR|BloomPass/.test(l)).join('\n')||'(no §PHOTO_EMBER lines)');
  console.log('stills:\n  '+navShot+'\n  '+stillShot+'\n  '+afterShot);
})();
