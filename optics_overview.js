// Produces REAL composited frames (renderer output + the three overlays through the SAME
// compositors the bake uses) so the optics can be judged without spending a full bake.
// Not a witness — this makes no pass/fail claim. The look is the user's call.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs=require('fs');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'HHS_Office_Federated';
const OUT=process.env.OUT||'/home/red1/Pictures/Screenshots';
const W=1280,H=720;
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:W,height:H});
  p.on('console',m=>{const t=m.text(); if(/§CPE_PATH_OVERVIEW|§LOAD_FAIL/.test(t)) console.log('  '+t);});
  p.on('pageerror',e=>console.log('  PAGEERROR '+e.message.slice(0,160)));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.camera&&window.APP._composer&&
    typeof window.APP.cinemaPathPlan==='function'&&typeof window.APP.pathOverviewPrepare==='function',
    {timeout:180000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:120000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:600000,polling:1000}).catch(()=>{});

  const prep=await p.evaluate(()=>{
    const A=window.APP;
    const plan=A.cinemaPathPlan(20);
    if(!plan||!plan.waypoints) return {ok:false,why:'no plan'};
    let bbox=null;
    try{ const b3=new THREE.Box3();
      A.scene.traverse(o=>{if(o.isMesh&&o.visible)b3.expandByObject(o);});
      if(!b3.isEmpty()) bbox={min:{x:b3.min.x,y:b3.min.y,z:b3.min.z},max:{x:b3.max.x,y:b3.max.y,z:b3.max.z}};
    }catch(e){}
    const cam=[]; for(let k=0;k<=64;k++){ const q=plan.poseAt(k/64); if(q) cam.push({x:q.x,y:q.y,z:q.z}); }
    window.__ov=A.pathOverviewPrepare(plan,null,cam);
    window.__plan=plan;
    // real caption timeline, real room names — not a placeholder string
    let segs=null; try{ segs=A.roomTitleBuildTimeline(plan,20); }catch(e){}
    window.__segs=segs;
    return {ok:!!window.__ov, wp:plan.waypoints.length, bbox:!!bbox, segs:segs?segs.length:0};
  });
  console.log('prepared:',JSON.stringify(prep));
  if(!prep.ok){ console.log('ABORT — no overview to draw'); await b.close(); return; }

  const TS=(process.env.TS||'0.02,0.35,0.70').split(',').map(Number);
  for(const t of TS){
    const dataUrl=await p.evaluate(async(t,W,H)=>{
      const A=window.APP, plan=window.__plan;
      // poseAt returns FLAT {x,y,z,tx,ty,tz} (effects.js:7672) — position and look target, not
      // {pos,dir}. Same shape the bake itself consumes.
      const ps=plan.poseAt(t);
      const pos={x:ps.x,y:ps.y,z:ps.z}, tgt={x:ps.tx,y:ps.ty,z:ps.tz};
      A.camera.position.set(pos.x,pos.y,pos.z);
      A.controls.target.set(tgt.x,tgt.y,tgt.z); A.controls.update();
      A._composer.render();
      const c=document.createElement('canvas'); c.width=W; c.height=H;
      const cx=c.getContext('2d');
      cx.drawImage(A.renderer.domElement,0,0,W,H);
      // caption — real room name from the real timeline where the clock lands on one
      let ti=null;
      try{ if(window.__segs&&A.roomTitleOpacityAt) ti=A.roomTitleOpacityAt(window.__segs,t*20); }catch(e){}
      if(ti&&ti.opacity>0&&A.roomTitleCompositeOntoCanvas)
        A.roomTitleCompositeOntoCanvas(cx,W,H,ti.name,Math.max(ti.opacity,0.95));
      // day counter — real arithmetic over a real 240-day span so the plate is drawn at true size
      if(A.dayCounterAt&&A.dayCounterCompositeOntoCanvas){
        const s=Date.UTC(2026,0,1), e=s+240*86400000;
        const di=A.dayCounterAt(s+Math.round(t*239)*86400000,s,e);
        if(di){ di.pos='tr'; A.dayCounterCompositeOntoCanvas(cx,W,H,di,1,'tr'); }
      }
      // §CPE_HUD_STACK — same corner as the counter, stacked beneath it, exactly as the bake does
      const gap=Math.round(H*0.012);
      const stack=A.dayCounterBoxSize?A.dayCounterBoxSize(H).h+gap:0;
      A.pathOverviewCompositeOntoCanvas(cx,W,H,window.__ov,{pos:pos,target:tgt},1,'tr',stack);
      return c.toDataURL('image/png');
    },t,W,H);
    const f=`${OUT}/overview_optics_t${String(Math.round(t*100)).padStart(3,'0')}.png`;
    fs.writeFileSync(f,Buffer.from(dataUrl.split(',')[1],'base64'));
    console.log('wrote',f);
  }
  await b.close();
})();
