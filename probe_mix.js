// Does the 20/20 ratio actually land at 20/20, and is it stable?
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage();
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.nightLightColor&&window.APP.dbQuery,{timeout:180000});
  await sleep(10000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const out=await p.evaluate(()=>{
    const A=window.APP;
    const rows=A.dbQuery("SELECT m.element_name,t.center_x,t.center_y,t.center_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance') AND (LOWER(m.element_name) LIKE '%light%' OR LOWER(m.element_name) LIKE '%troffer%' OR LOWER(m.element_name) LIKE '%downlight%' OR LOWER(m.element_name) LIKE '%luminaire%' OR LOWER(m.element_name) LIKE '%lamp%' OR LOWER(m.element_name) LIKE '%sconce%' OR LOWER(m.element_name) LIKE '%pendant%') AND NOT (LOWER(m.element_name) LIKE '%switch%' OR LOWER(m.element_name) LIKE '%receptacle%' OR LOWER(m.element_name) LIKE '%panelboard%' OR LOWER(m.element_name) LIKE '%socket%' OR LOWER(m.element_name) LIKE '%outlet%')")||[];
    const tally={}; const first=[];
    rows.forEach(r=>{
      const key=r[0]+'|'+r[1].toFixed(2)+','+r[2].toFixed(2)+','+r[3].toFixed(2);
      const c=A.nightLightColor(r[0],key);
      const hex='0x'+c.toString(16);
      tally[hex]=(tally[hex]||0)+1;
      if(first.length<3) first.push(hex);
    });
    // stability: same inputs twice must give the same answer
    const again=rows.slice(0,3).map(r=>'0x'+A.nightLightColor(r[0],r[0]+'|'+r[1].toFixed(2)+','+r[2].toFixed(2)+','+r[3].toFixed(2)).toString(16));
    return {total:rows.length,tally,stable:JSON.stringify(first)===JSON.stringify(again)};
  });
  const names={'0xa8c8ff':'MIX blue','0xffb45c':'MIX amber','0xdce8ff':'cool (type)','0xffdca8':'warm (type)','0x9bffc0':'exit green','0xffe4b5':'amber fallback'};
  console.log('total luminaires:',out.total,' deterministic:',out.stable);
  Object.entries(out.tally).sort((a,b)=>b[1]-a[1]).forEach(([h,n])=>
    console.log(`  ${(names[h]||h).padEnd(16)} ${String(n).padStart(4)}  ${(n/out.total*100).toFixed(1)}%`));
  await b.close();
})();
