#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — W-T0-FRAME: is the envelope established at film second 0?
// Reads the REAL frame-0 pose (plan.poseAt(0)) and the scene-space envelope, and asks §20.8's
// two questions: is the camera outside the envelope, and does the envelope fit the frame.
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477', DB = process.env.DB || 'Hospital_silent_local', DUR = Number(process.env.DUR || 195.8);
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:1800000,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width:1280, height:720 });
  p.on('console', m => { if (/§T0_/.test(m.text())) console.log('  ' + m.text()); });
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil:'domcontentloaded', timeout:90000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout:240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta')||[]).map(r=>r[0]));
  for (const bb of parts) await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}}, bb);
  let stable=0;
  for (let i=0;i<400;i++){ const st=await p.evaluate(()=>(window.APP.status&&window.APP.status.textContent)||'');
    const m=st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if(!m||m[1].replace(/,/g,'')===m[2].replace(/,/g,'')){ if(++stable>=4) break; } else stable=0; await sleep(3000); }
  await sleep(4000);
  const out = await p.evaluate((dur) => {
    const A=window.APP, T=window.THREE, R={};
    R.modelOffset = A.modelOffset;
    // scene envelope of real building meshes (what the audience sees), plus the DB-derived one
    // Envelope from DB extents through A.ifc2three (the owner) — no mesh walk, no memory spike.
    const ENVC = "'IfcColumn','IfcPile','IfcWall','IfcWallStandardCase','IfcSlab','IfcBeam','IfcFooting','IfcCurtainWall','IfcRoof'";
    function extBox(where){
      const r=(A.dbQuery("SELECT MIN(t.center_x-t.bbox_x/2),MAX(t.center_x+t.bbox_x/2),"+
        "MIN(t.center_y-t.bbox_y/2),MAX(t.center_y+t.bbox_y/2),MIN(t.center_z-t.bbox_z/2),MAX(t.center_z+t.bbox_z/2) "+
        "FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid"+where)||[])[0];
      if(!r) return null;
      const a=A.ifc2three(r[0],r[2],r[4]), b2=A.ifc2three(r[1],r[3],r[5]);
      return new T.Box3(new T.Vector3(Math.min(a.x,b2.x),Math.min(a.y,b2.y),Math.min(a.z,b2.z)),
                        new T.Vector3(Math.max(a.x,b2.x),Math.max(a.y,b2.y),Math.max(a.z,b2.z)));
    }
    const bx = extBox(" WHERE m.ifc_class IN ("+ENVC+")");
    R.sceneEnvStructural={min:bx.min.toArray().map(v=>+v.toFixed(1)),max:bx.max.toArray().map(v=>+v.toFixed(1))};
    const bxAll = extBox("");
    R.sceneEnvAll={min:bxAll.min.toArray().map(v=>+v.toFixed(1)),max:bxAll.max.toArray().map(v=>+v.toFixed(1))};
    const plan=A.cinemaPathPlan(dur); const pz=plan.poseAt(0);
    R.pose={cam:[+pz.x.toFixed(2),+pz.y.toFixed(2),+pz.z.toFixed(2)],tgt:[+pz.tx.toFixed(2),+pz.ty.toFixed(2),+pz.tz.toFixed(2)]};
    const cam=new T.PerspectiveCamera(A.camera?A.camera.fov:60,1280/720,0.1,5000);
    cam.position.set(pz.x,pz.y,pz.z); cam.lookAt(pz.tx,pz.ty,pz.tz); cam.updateMatrixWorld(true);
    R.cameraInsideEnvelope = bx.containsPoint(new T.Vector3(pz.x,pz.y,pz.z));
    let inFrame=0, behind=0, worst=0;
    for(let i=0;i<8;i++){
      const c=new T.Vector3(i&1?bx.max.x:bx.min.x, i&2?bx.max.y:bx.min.y, i&4?bx.max.z:bx.min.z);
      const v=c.clone().applyMatrix4(cam.matrixWorldInverse);
      if(v.z>=-0.1){behind++;continue;}
      const nd=c.clone().project(cam);
      const off=Math.max(Math.abs(nd.x),Math.abs(nd.y)); if(off>worst) worst=off;
      if(Math.abs(nd.x)<=1&&Math.abs(nd.y)<=1) inFrame++;
    }
    R.corners={inFrame:inFrame, behindCamera:behind, worstNdc:+worst.toFixed(2)};
    R.verdict_envelopeEstablishes = (!R.cameraInsideEnvelope && behind===0 && inFrame===8);
    console.log('§T0_FRAME '+JSON.stringify(R));
    return R;
  }, DUR);
  console.log('\n§T0_RESULT ' + JSON.stringify(out,null,1));
  await b.close();
})().catch(e=>{console.error('PROBE FAILED '+e.message);process.exit(1);});
