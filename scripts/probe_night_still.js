// Night mode + Alt+S: do we get 4x lights, and does the frame actually get brighter?
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs=require('fs'),path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const OUT='/tmp/ember_out';
(async()=>{
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:720});
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.toggleNightMode&&window.APP.startStillRefine,{timeout:180000});
  await sleep(12000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const want=await p.evaluate(()=>(window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(x=>/Architectural|Electrical/i.test(x)).sort());
  for(const bb of want){ await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
    let prev=-1; for(let i=0;i<60;i++){const n=await p.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }
  const pose=await p.evaluate(()=>{const q=window.APP.cinemaPathPlan(30).poseAt(0.60);return{x:q.x,y:q.y,z:q.z,tx:q.tx,ty:q.ty,tz:q.tz};});
  await p.evaluate(q=>{const A=window.APP;A.camera.position.set(q.x,q.y,q.z);A.controls.target.set(q.tx,q.ty,q.tz);A.controls.update();A.markDirty&&A.markDirty();},pose);
  await p.evaluate(()=>window.APP.toggleNightMode()); await sleep(4000);
  const navLights=await p.evaluate(()=>window.APP._nightLights.length);
  await p.screenshot({path:path.join(OUT,'night_1_nav.png')});
  await p.evaluate(()=>window.APP.startStillRefine());
  for(let i=0;i<200 && await p.evaluate(()=>!!window.APP._stillRefineBusy);i++) await sleep(500);
  await sleep(2500);
  const stillLights=await p.evaluate(()=>window.APP._nightLights.length);
  await p.screenshot({path:path.join(OUT,'night_2_still.png')});
  await p.evaluate(()=>window.APP.stopStillRefine(true)); await sleep(2500);
  const backLights=await p.evaluate(()=>window.APP._nightLights.length);
  await b.close();
  console.log(`lights: nav=${navLights}  still=${stillLights}  restored=${backLights}`);
  console.log(logs.filter(l=>/§NIGHT_STILL_LIGHTS|§PHOTO_EMBER|§NIGHT_MODE/.test(l)).join('\n'));
})();
