// The Clinic main hallway, lit. Camera placed with the app's OWN coordinate transform
// (A.ifc2three) instead of a guessed axis mapping — three earlier attempts put the camera outside
// the building or inside a wall precisely because that transform was being reinvented.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs=require('fs'),path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const OUT='/tmp/ember_out';
const ROOM=process.env.ROOM||'≈ Second Floor R22';
(async()=>{
  const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:720});
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.toggleNightMode&&window.APP.startStillRefine&&window.APP.ifc2three,{timeout:180000});
  await sleep(12000);
  await p.waitForFunction(()=>{try{const r=window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms');return r&&r[0][0]>0;}catch(e){return false;}},{timeout:120000,polling:2000});
  const want=await p.evaluate(()=>(window.APP.dbQuery("SELECT DISTINCT building FROM elements_meta")||[]).map(r=>r[0]).filter(x=>/Architectural|Electrical/i.test(x)).sort());
  for(const bb of want){ await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
    let prev=-1; for(let i=0;i<60;i++){const n=await p.evaluate(()=>Object.keys(window.APP.guidMap).length); if(n===prev&&n>0)break; prev=n; await sleep(2000);} }

  const cam=await p.evaluate((ROOM)=>{
    const A=window.APP;
    const rr=A.dbQuery("SELECT center_x,center_y,center_z,size_x,size_y FROM spatial_structure WHERE name='"+ROOM.replace(/'/g,"''")+"'");
    if(!rr||!rr.length) return {ok:false,err:'room not found'};
    const R={cx:rr[0][0],cy:rr[0][1],cz:rr[0][2],sx:rr[0][3],sy:rr[0][4]};
    const rows=A.dbQuery(
      "SELECT t.center_x,t.center_y,t.center_z FROM elements_meta e JOIN element_transforms t ON t.guid=e.guid "+
      "WHERE (lower(e.element_name) LIKE '%troffer%' OR lower(e.element_name) LIKE '%downlight%' OR lower(e.element_name) LIKE '%light%') "+
      "AND NOT (lower(e.element_name) LIKE '%switch%' OR lower(e.element_name) LIKE '%receptacle%' OR lower(e.element_name) LIKE '%panelboard%') "+
      "AND t.center_x BETWEEN "+(R.cx-R.sx/2)+" AND "+(R.cx+R.sx/2)+
      " AND t.center_y BETWEEN "+(R.cy-R.sy/2)+" AND "+(R.cy+R.sy/2)+
      " AND ABS(t.center_z-"+R.cz+")<4")||[];
    if(rows.length<2) return {ok:false,err:'only '+rows.length+' fixtures'};
    // THE APP'S OWN TRANSFORM. tools.js uses exactly this to place its night lights, so it is the
    // one mapping guaranteed to agree with where the geometry actually is.
    const P=rows.map(r=>A.ifc2three(r[0],r[1],r[2]));
    const mn={x:Math.min(...P.map(q=>q.x)),y:Math.min(...P.map(q=>q.y)),z:Math.min(...P.map(q=>q.z))};
    const mx={x:Math.max(...P.map(q=>q.x)),y:Math.max(...P.map(q=>q.y)),z:Math.max(...P.map(q=>q.z))};
    const alongX=(mx.x-mn.x)>=(mx.z-mn.z);
    const key=alongX?'x':'z';
    const sorted=P.slice().sort((a,b)=>a[key]-b[key]);
    const near=sorted[Math.floor(sorted.length*0.10)], far=sorted[Math.floor(sorted.length*0.90)];
    const eye=mn.y-1.5;                       // ceiling fixtures -> standing height
    A.camera.position.set(near.x,eye,near.z);
    A.controls.target.set(far.x,eye,far.z);
    A.controls.update(); A.markDirty&&A.markDirty();
    return {ok:true,n:P.length,along:key,eye:+eye.toFixed(2),
            from:{x:+near.x.toFixed(1),z:+near.z.toFixed(1)},to:{x:+far.x.toFixed(1),z:+far.z.toFixed(1)},
            ceiling:+mn.y.toFixed(2), span:{x:+(mx.x-mn.x).toFixed(1),z:+(mx.z-mn.z).toFixed(1)}};
  },ROOM);
  if(!cam.ok){ console.log('FAILED: '+cam.err); await b.close(); return; }
  await sleep(2000);
  await p.screenshot({path:path.join(OUT,'hall_1_day_nav.png')});
  await p.evaluate(()=>window.APP.toggleNightMode()); await sleep(4000);
  await p.screenshot({path:path.join(OUT,'hall_2_night_nav.png')});
  await p.evaluate(()=>window.APP.startStillRefine());
  for(let i=0;i<200 && await p.evaluate(()=>!!window.APP._stillRefineBusy);i++) await sleep(500);
  await sleep(2500);
  await p.screenshot({path:path.join(OUT,'hall_3_night_still.png')});
  const lights=await p.evaluate(()=>window.APP._nightLights.length);
  await b.close();
  console.log(JSON.stringify(cam));
  console.log('lights during still:',lights);
  console.log(logs.filter(l=>/§PHOTO_EMBER|§NIGHT_STILL_LIGHTS|§NIGHT_MODE/.test(l)).join('\n'));
})();
