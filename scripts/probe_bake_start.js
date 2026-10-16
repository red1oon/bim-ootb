// Drives a REAL Alt+C bake far enough to prove the frame loop is entered — the exact thing that
// silently stopped: staging completed, then no frames. Watches for §CPE_PATH_OVERVIEW (which was
// absent entirely, and is what located the fault) and the first §CPE_BUILDUP frame lines.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'HHS_Office_Federated';
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  const hits={overview:null,frames:0,err:[],maxqStart:null,progress:null};
  p.on('console',m=>{const t=m.text();
    if(/§CPE_PATH_OVERVIEW/.test(t)) hits.overview=t;
    if(/§MAXQ_START /.test(t)) hits.maxqStart=t;
    if(/§CPE_BUILDUP frame=/.test(t)){ hits.frames++; if(!hits.progress) hits.progress=t; }
    if(/§MAXQ_PROGRESS|§MAXQ_FRAME/.test(t) && !hits.progress) hits.progress=t;
    if(/_ERR|PAGEERROR/.test(t)) hits.err.push(t.slice(0,160));});
  p.on('pageerror',e=>hits.err.push('PAGEERROR '+e.message.slice(0,200)));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene&&window.APP.startMaxQ,{timeout:180000}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:600000,polling:1000}).catch(()=>{});
  // drive the bake with the editor skipped and Label ON, short film
  await p.evaluate(()=>{ window.APP.startMaxQ({ editor:false, seconds:6,
      override:{ roomTitle:true, buildup:false, reveal:false, dayCounter:'tr' } }); }).catch(e=>hits.err.push('start: '+e.message));
  await new Promise(r=>setTimeout(r,90000));
  console.log('='.repeat(72)+'\n§BAKE_START probe\n'+'='.repeat(72));
  console.log('  §MAXQ_START      : '+(hits.maxqStart||'(none)'));
  console.log('  §CPE_PATH_OVERVIEW: '+(hits.overview||'(NONE — the exact symptom of the abort)'));
  console.log('  frame lines seen : '+hits.frames+(hits.progress?('  first: '+hits.progress.slice(0,110)):''));
  if(hits.err.length) console.log('  errors: '+hits.err.slice(0,5).join('\n          '));
  console.log('\n  '+((hits.overview&&hits.frames>0)?'PASS — overview prepared AND the frame loop is running'
      :(hits.overview?'PARTIAL — overview logged but no frame lines captured in the window':'FAIL — still aborting before the overview block')));
  await b.close();
})();
