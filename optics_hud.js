// Renders the FULL HUD stack onto a real frame with REAL schedule data, to prove the resource
// panel draws before a bake is spent on it. Not a witness — no pass/fail claim on the look.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs=require('fs');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Hospital';
const OUT=process.env.OUT||'/home/red1/Pictures/Screenshots';
const W=1280,H=720;
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:1800000});
  const p=await b.newPage(); await p.setViewport({width:W,height:H});
  p.on('console',m=>{const t=m.text();
    if(/§CPE_RESOURCE_PANEL|§CPE_PATH_OVERVIEW|§MEP_SMOOTH|§TIME_MACHINE|_ERR/.test(t)) console.log('  '+t.slice(0,150));});
  p.on('pageerror',e=>console.log('  PAGEERROR '+e.message.slice(0,180)));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:180000});
  await p.waitForFunction(()=>window.APP&&window.APP.camera&&window.APP._composer&&
    typeof window.APP.resourcePanelAt==='function',{timeout:240000});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:1500000,polling:2000}).catch(()=>{});
  console.log('  streamed.');
  // real schedule — the same verb the bake uses
  const st = await p.evaluate(async()=>{
    const log=[];
    // Hospital ships no schedule in the DB (the user's own log: "§GANTT_STALE_CACHE ops=6881 but no
    // schedule in DB — dropping cache, taking the single-pass cold path"), so the timeline has to be
    // GENERATED before it can be activated. Activating first is what returned "no ops and no
    // elements" — the bake reaches this state through the generate path, not the activate one.
    // A.materializeZones is the verb that actually authors the programme — it is what produces the
    // §GANTT injected / §CPM_RUN / §TPL_WIRED chain in a real bake log. tmGenerateTimeline alone
    // left ops at 0 on Hospital, which ships no schedule in its DB.
    if(typeof window.APP.materializeZones==='function'){
      try{ const r=window.APP.materializeZones(); if(r&&r.then) await r; log.push('materialized'); }
      catch(e){ log.push('materialize-threw:'+e.message); }
    } else log.push('no-materializeZones');
    if(typeof window.tmGenerateTimeline==='function'){
      try{ const r=window.tmGenerateTimeline(); if(r&&r.then) await r; log.push('generated'); }
      catch(e){ log.push('generate-threw:'+e.message); }
    }
    if(typeof window.tmActivateForBake==='function'){
      try{ const ok=await window.tmActivateForBake(); log.push('activate='+ok); }
      catch(e){ return {err:'activate: '+e.message, log}; }
    }
    window.__log=log;
    const s = (typeof window.tmFollowTimeline==='function') ? window.tmFollowTimeline() : null;
    const ops = (typeof window.tmOpsSnapshot==='function') ? window.tmOpsSnapshot() : null;
    return { ok:!!s, ops: ops?ops.length:0, ps:s&&s.projectStart, pe:s&&s.projectEnd,
             rates: !!(window.LABOR_RATES), log:window.__log };
  });
  console.log('  schedule: '+JSON.stringify(st));
  let synthetic=false;
  if(!st.ok||!st.ops){
    // The DATA path could not be armed headlessly. Rather than abort, prove the DRAW with a clearly
    // SYNTHETIC ops set — this makes NO claim about crew numbers, only that the panel renders. The
    // real data path is exercised in an actual bake, where the schedule always exists (the user's
    // own log: §GANTT injected=6880 -> §TIME_MACHINE ON (silent, bake-owned)).
    synthetic=true;
    console.log('  NOTE: real schedule unavailable headlessly — drawing with SYNTHETIC ops.');
    console.log('        This proves RENDERING ONLY. The numbers on it mean nothing.');
    await p.evaluate(()=>{
      const DAY=86400000, ps=Date.UTC(2026,7,30), pe=ps+50*DAY;
      const mix=[['STEEL_ERECTOR',9],['PLUMBER',6],['MASON',4],['CARPENTER',3],['HVAC_TECH',2],['CONCRETE_GANG',1]];
      const ops=[]; mix.forEach(([r,n])=>{ for(let i=0;i<n;i++) ops.push({s:ps+20*DAY,e:ps+35*DAY,r:r}); });
      ops.sort((a,b)=>a.s-b.s);
      window.__synth={ ops, ps, pe };
    });
  }

  const dataUrl = await p.evaluate((W,H)=>{
    const A=window.APP;
    const plan=A.cinemaPathPlan(20);
    const cam=[]; for(let k=0;k<=64;k++){ const q=plan&&plan.poseAt(k/64); if(q) cam.push({x:q.x,y:q.y,z:q.z}); }
    const ov=plan?A.pathOverviewPrepare(plan,null,null):null;
    const ps=plan?plan.poseAt(0.45):null;
    if(ps){ A.camera.position.set(ps.x,ps.y,ps.z); A.controls.target.set(ps.tx,ps.ty,ps.tz); A.controls.update(); }
    A._composer.render();
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const cx=c.getContext('2d'); cx.drawImage(A.renderer.domElement,0,0,W,H);
    const sy=window.__synth;
    const s=sy?{projectStart:sy.ps,projectEnd:sy.pe}:window.tmFollowTimeline();
    const ops=sy?sy.ops:window.tmOpsSnapshot();
    const cursor = s.projectStart + 0.55*(s.projectEnd-s.projectStart);
    // caption
    if(A.roomTitleCompositeOntoCanvas) A.roomTitleCompositeOntoCanvas(cx,W,H,'MEP Rough-in',1);
    // day counter
    const gap=Math.round(H*0.012); let stack=0;
    if(A.dayCounterAt&&A.dayCounterCompositeOntoCanvas){
      const di=A.dayCounterAt(cursor,s.projectStart,s.projectEnd);
      if(di){ di.pos='tr'; A.dayCounterCompositeOntoCanvas(cx,W,H,di,1,'tr'); stack=A.dayCounterBoxSize(H).h+gap; }
    }
    // resource panel
    let resH=0;
    const ri=A.resourcePanelAt(cursor,ops,s.projectStart,s.projectEnd);
    if(ri){ A.resourcePanelCompositeOntoCanvas(cx,W,H,ri,1,'tr',stack); resH=Math.round(H*0.26)+gap; }
    // path overview under it
    if(ov&&ps) A.pathOverviewCompositeOntoCanvas(cx,W,H,ov,{pos:{x:ps.x,y:ps.y,z:ps.z},target:{x:ps.tx,y:ps.ty,z:ps.tz}},1,'tr',stack+resH);
    window.__diag={ hasRi:!!ri, rows:ri?ri.rows.map(r=>r.trade+':'+r.heads):[], total:ri?ri.totalHeads:0,
                    progress:ri?+ri.progress.toFixed(3):null, ov:!!ov };
    return c.toDataURL('image/png');
  },W,H);
  const diag=await p.evaluate(()=>window.__diag);
  console.log('  panel: '+JSON.stringify(diag));
  const f=`${OUT}/hud_${BLD}.png`;
  fs.writeFileSync(f,Buffer.from(dataUrl.split(',')[1],'base64'));
  console.log('  wrote '+f);
  await b.close();
})();
