// Does the night-mode gate fix actually identify the Clinic's luminaires now?
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage(); const logs=[];
  p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.toggleNightMode,{timeout:180000});
  await sleep(12000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const want=await p.evaluate(()=>(window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(x=>/Architectural|Electrical/i.test(x)).sort());
  for(const bb of want){ await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
    let prev=-1; for(let i=0;i<60;i++){const n=await p.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }
  await p.evaluate(()=>window.APP.toggleNightMode());
  await sleep(4000);
  const st=await p.evaluate(()=>({fixtures:(window.APP._nightFixtures||[]).length,
    lights:(window.APP._nightLights||[]).length, glowClasses:window.APP._nightGlowClasses,
    glowMats:(window.APP._nightGlowMats||[]).length, exposure:window.APP.renderer.toneMappingExposure}));
  console.log(JSON.stringify(st,null,1));
  console.log(logs.filter(l=>/§NIGHT/.test(l)).slice(0,6).join('\n'));
  await b.close();
})();
