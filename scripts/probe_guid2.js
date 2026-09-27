const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p = await b.newPage();
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db', {waitUntil:'domcontentloaded', timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.startStillRefine, {timeout:180000});
  await sleep(16000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const out = await p.evaluate(() => {
    const A=window.APP;
    // invert guidMap: guid -> [meshId or meshId_slot]
    const inv={}; Object.keys(A.guidMap).forEach(k=>{ const g=A.guidMap[k]; (inv[g]=inv[g]||[]).push(k); });
    const lum = A.dbQuery("SELECT e.guid, e.element_name FROM elements_meta e WHERE e.discipline='ELEC' AND (lower(e.element_name) LIKE '%troffer%' OR lower(e.element_name) LIKE '%downlight%' OR lower(e.element_name) LIKE '%pendant%' OR lower(e.element_name) LIKE '%sconce%')")||[];
    const inScene = lum.filter(r=>inv[r[0]]);
    // what object types hold them?
    const byId={}; A.collectMeshes(o=>o.isMesh||o.isInstancedMesh||o.isBatchedMesh).forEach(o=>byId[o.id]=o);
    const kinds={}; const matIds=new Set();
    inScene.slice(0,400).forEach(r=>{
      inv[r[0]].forEach(k=>{
        const id=parseInt(String(k).split('_')[0],10); const o=byId[id];
        if(!o){kinds['(mesh-not-in-scene)']=(kinds['(mesh-not-in-scene)']||0)+1;return;}
        const t=o.isBatchedMesh?'BatchedMesh':o.isInstancedMesh?'InstancedMesh':'Mesh';
        kinds[t]=(kinds[t]||0)+1;
        const ms=Array.isArray(o.material)?o.material:[o.material];
        ms.forEach(m=>{ if(m) matIds.add(m.uuid+'|'+(m.name||'')+'|hasEmissive='+!!m.emissive); });
      });
    });
    return { totalLuminairesDB: lum.length, inScene: inScene.length, kinds,
             distinctMaterials: matIds.size, matSample:[...matIds].slice(0,6),
             totalMeshObjs: A.collectMeshes(o=>o.isMesh).length };
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
