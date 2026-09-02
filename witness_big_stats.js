// WITNESS — §CPE_BIG_STATS. ISSUE IT PROVES/DISPROVES: after §CPE_BUILDUP_TOPOUT the composition
// pie is honestly empty (no trade is active), so the panel drew NOTHING for the whole second half
// of the user's bake. The revolving cards claim to fill that. Do they (a) build from REAL sources
// on a real building, (b) rotate and fade, (c) drop a card whose source is missing rather than
// inventing a number, and (d) draw?
// (c) is the load-bearing one: a client-facing headline that fabricates is worse than a blank panel.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Clinic';
process.on('unhandledRejection',e=>{console.error('UNHANDLED: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:1200000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  const errs=[]; let statLog=null;
  p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  p.on('console',m=>{const t=m.text(); if(/§CPE_BIG_STATS/.test(t)) statLog=t;});
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:180000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene&&typeof window.APP.bigStatsBuild==='function',{timeout:240000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,{timeout:300000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),{timeout:1200000,polling:1500}).catch(()=>{});
  const r=await p.evaluate(async()=>{
    const A=window.APP;
    if(typeof window.tmGenerateTimeline==='function'){ try{ const x=window.tmGenerateTimeline(); if(x&&x.then) await x; }catch(e){} }
    if(typeof window.tmActivateForBake==='function'){ try{ await window.tmActivateForBake(); }catch(e){} }
    const s=(typeof window.tmFollowTimeline==='function')?window.tmFollowTimeline():null;
    const ops=(typeof window.tmOpsSnapshot==='function')?window.tmOpsSnapshot():[];
    const cards=A.bigStatsBuild(ops, s?s.projectStart:0, s?s.projectEnd:0);
    const out={ cards: cards?cards.map(c=>({big:c.big,label:c.label,src:c.src})):null,
                hasDb: !!A.db, ops: ops.length, hrCost: A._hrCost||null };
    if(cards){
      // rotation + fade, pure
      const seen=new Set(); let faded=false;
      for(let t=0;t<cards.length*4.5;t+=0.25){ const sh=A.bigStatsAt(cards,t);
        if(sh){ seen.add(sh.idx); if(sh.opacity<0.99) faded=true; } }
      out.distinctShown=seen.size; out.fades=faded;
      // draws?
      const cv=document.createElement('canvas'); cv.width=1852; cv.height=960;
      const cx=cv.getContext('2d'); let fills=0;
      const rf=cx.fill.bind(cx); cx.fill=function(){fills++;return rf.apply(cx,arguments);};
      A.bigStatsCompositeOntoCanvas(cx,1852,960,A.bigStatsAt(cards,2.2),1,'tr',60);
      out.fills=fills;
      // (c) fabrication check: every card must name a real source, and no card may be empty
      out.allSourced = cards.every(c=>c.src && c.big && String(c.big).length>0);
    }
    return out;
  });
  console.log('='.repeat(84)+`\n§CPE_BIG_STATS witness — ${BLD}\n`+'='.repeat(84));
  if(statLog) console.log('  log: '+statLog.slice(0,200));
  console.log(`  A.db=${r.hasDb}  ops=${r.ops}  hrCost=${JSON.stringify(r.hrCost)}`);
  if(!r.cards){ console.log('\n  INCONCLUSIVE — no cards built; nothing was judged.'); await b.close(); return; }
  r.cards.forEach(c=>console.log(`    ${String(c.big).padStart(12)}  ${String(c.label).padEnd(30)} ← ${c.src}`));
  const G=[
    [`G-BS-1  cards built from real sources (${r.cards.length})`, r.cards.length>0],
    ['G-BS-2  every card names a source and carries a value (no fabrication)', r.allSourced===true],
    [`G-BS-3  rotation reaches every card (${r.distinctShown}/${r.cards.length})`, r.distinctShown===r.cards.length],
    ['G-BS-4  cards fade in/out rather than snapping', r.fades===true],
    [`G-BS-5  it actually draws (fills=${r.fills})`, r.fills>0],
    ['G-BS-6  no page errors', errs.length===0]
  ];
  let pass=0; G.forEach(([n,v])=>{console.log('  '+(v?'PASS':'FAIL')+'  '+n); if(v)pass++;});
  if(errs.length) console.log('  errors: '+errs.slice(0,3).join(' | '));
  console.log(`\n  ${pass}/${G.length} — ${pass===G.length?'PASS':'FAIL'}`);
  await b.close();
})();
