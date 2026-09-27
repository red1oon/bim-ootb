// Which luminaire FAMILIES actually receive an emissive material, and which silently do not.
// User: "In dark rooms these are not lighted 'M_Troffer Light - Parabolic Rectangular'"
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage();
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.startStillRefine,{timeout:180000});
  await sleep(12000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const want=await p.evaluate(()=>(window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(x=>/Architectural|Electrical/i.test(x)).sort());
  for(const bb of want){ await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
    let prev=-1; for(let i=0;i<60;i++){const n=await p.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }
  const out=await p.evaluate(()=>{
    const A=window.APP;
    const rows=A.dbQuery("SELECT guid, element_name FROM elements_meta WHERE (lower(element_name) LIKE '%light%' OR lower(element_name) LIKE '%troffer%' OR lower(element_name) LIKE '%downlight%' OR lower(element_name) LIKE '%sconce%' OR lower(element_name) LIKE '%pendant%' OR lower(element_name) LIKE '%lamp%' OR lower(element_name) LIKE '%luminaire%') AND NOT (lower(element_name) LIKE '%switch%' OR lower(element_name) LIKE '%receptacle%' OR lower(element_name) LIKE '%panelboard%' OR lower(element_name) LIKE '%socket%' OR lower(element_name) LIKE '%outlet%')")||[];
    const famOf=n=>String(n).split(':')[0];
    const g2f={}; rows.forEach(r=>g2f[r[0]]=famOf(r[1]));
    const byId={}; A.collectMeshes(o=>o.isMesh).forEach(o=>byId[o.id]=o);
    const stat={};
    rows.forEach(r=>{ const f=g2f[r[0]]; stat[f]=stat[f]||{db:0,mapped:0,meshFound:0,withEmissive:0,matTypes:{}}; stat[f].db++; });
    Object.keys(A.guidMap).forEach(k=>{
      const g=A.guidMap[k]; const f=g2f[g]; if(!f) return;
      stat[f].mapped++;
      const o=byId[parseInt(String(k).split('_')[0],10)];
      if(!o) return;
      stat[f].meshFound++;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
        if(!m) return;
        stat[f].matTypes[m.type]=(stat[f].matTypes[m.type]||0)+1;
        if(m.emissive) stat[f].withEmissive++;
      });
    });
    return stat;
  });
  console.log('family                                        db  guidMapped  meshFound  hasEmissive   material types');
  Object.entries(out).sort((a,b)=>b[1].db-a[1].db).forEach(([f,s])=>{
    console.log(`${f.slice(0,44).padEnd(44)} ${String(s.db).padStart(4)} ${String(s.mapped).padStart(10)} ${String(s.meshFound).padStart(10)} ${String(s.withEmissive).padStart(12)}   ${Object.keys(s.matTypes).join(',')||'-'}`);
  });
  await b.close();
})();
