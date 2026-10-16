const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db', {waitUntil:'domcontentloaded', timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.startStillRefine, {timeout:180000});
  await sleep(14000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const out = await p.evaluate(() => {
    const A = window.APP;
    const meshes = A.collectMeshes(o=>o.isMesh);
    const sample = [];
    for (let i=0;i<meshes.length && sample.length<5;i++){
      const o=meshes[i];
      const g=(A.guidMap&&A.guidMap[o.id])||(o.userData&&o.userData.guid);
      if(g) sample.push({g:String(g), name:o.name||'', type:o.type, isInst:!!o.isInstancedMesh, count:o.count||1});
    }
    // a real luminaire guid from the DB
    const rows = A.dbQuery("SELECT e.guid, e.element_name, t.center_x, t.center_y, t.center_z FROM elements_meta e JOIN element_transforms t ON t.guid=e.guid WHERE lower(e.element_name) LIKE '%troffer%' LIMIT 3")||[];
    // does that guid appear anywhere in the scene?
    const found = rows.map(r=>{
      const want=r[0];
      let hit=null;
      A.collectMeshes(o=>o.isMesh).forEach(o=>{
        const g=(A.guidMap&&A.guidMap[o.id])||(o.userData&&o.userData.guid);
        if(g && String(g).indexOf(want)===0){ if(!hit){ const w=new o.position.constructor(); o.getWorldPosition(w); hit={sceneGuid:String(g), wx:w.x, wy:w.y, wz:w.z, inst:!!o.isInstancedMesh}; } }
      });
      return { dbGuid:want, name:r[1], dbx:r[2], dby:r[3], dbz:r[4], hit:hit };
    });
    return { meshCount: meshes.length, guidMapSize: A.guidMap?Object.keys(A.guidMap).length:0, sample, found,
             hasFindMeshByGuid: typeof A.findMeshByGuid };
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
