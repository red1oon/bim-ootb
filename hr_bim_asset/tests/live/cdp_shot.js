// ⚠ DO NOT REMOVE — LIVE-3D WHITEBOX HARNESS (RESUME_HR_BIM_ASSET.md §NEXT-SESSION). Zero-dep Chrome
// DevTools-Protocol driver over --remote-debugging-pipe (Node 18, no WebSocket). Serve the worktree
// (python3 -m http.server 8099), then drive the REAL viewer headlessly: load a building, wait for the
// model to stream, run an action (apply a lens), and capture — printing §-log truth (e.g. tintedMeshes)
// so the suite TELLS us, no visual check. Usage: node cdp_shot.js <url> <out.png> <readyJsFile> <actionJsFile> <maxMs> <postMs>
// google-chrome flags include --use-angle=swiftshader for headless WebGL. Example ready/action: see *.example.js.
// Usage: node cdp_shot.js <url> <out.png> <readyExprFile> <actionExprFile> <maxMs> <postActionMs>
const { spawn } = require('child_process');
const fs = require('fs');
const [,, URL, OUT, READY_F, ACTION_F, MAX_MS_S, POST_S] = process.argv;
const READY = READY_F && fs.existsSync(READY_F) ? fs.readFileSync(READY_F,'utf8') : 'true';
const ACTION = ACTION_F && fs.existsSync(ACTION_F) ? fs.readFileSync(ACTION_F,'utf8') : '';
const MAX_MS = parseInt(MAX_MS_S||'90000',10), POST_MS = parseInt(POST_S||'2500',10);

const args = ['--headless=new','--no-sandbox','--hide-scrollbars',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
  '--window-size=1400,900','--force-device-scale-factor=1','--remote-debugging-pipe', URL];
const child = spawn('/usr/bin/google-chrome', args, { stdio:['ignore','inherit','pipe','pipe','pipe'] });
const W = child.stdio[3], R = child.stdio[4];
let buf = Buffer.alloc(0); const pend = new Map(); let id=0; const logs=[];
function send(method, params={}, sessionId){ const mid=++id; const m={id:mid,method,params}; if(sessionId)m.sessionId=sessionId;
  W.write(JSON.stringify(m)+'\0'); return new Promise((res,rej)=>pend.set(mid,{res,rej})); }
R.on('data',c=>{ buf=Buffer.concat([buf,c]); let i; while((i=buf.indexOf(0))>=0){ const raw=buf.slice(0,i).toString(); buf=buf.slice(i+1);
  let m; try{m=JSON.parse(raw);}catch(e){continue;} if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}
  else if(m.method==='Runtime.consoleAPICalled'){ try{logs.push((m.params.args||[]).map(a=>a.value!==undefined?a.value:a.description).join(' '));}catch(e){} } } });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let sess=null;
  for(let k=0;k<60&&!sess;k++){ await sleep(250); try{ const t=await send('Target.getTargets'); const pg=(t.targetInfos||[]).find(x=>x.type==='page');
    if(pg){ const a=await send('Target.attachToTarget',{targetId:pg.targetId,flatten:true}); sess=a.sessionId; } }catch(e){} }
  if(!sess){ console.error('NO_PAGE_TARGET'); process.exit(2); }
  await send('Page.enable',{},sess); await send('Runtime.enable',{},sess);
  const evalJs = async (expr)=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true},sess); return r.result?r.result.value:undefined; };
  // poll readiness
  const t0=Date.now(); let ready=false, last='';
  while(Date.now()-t0<MAX_MS){ await sleep(1500); try{ const v=await evalJs('(function(){try{return ('+READY+')}catch(e){return "ERR:"+e.message}})()'); last=String(v);
    if(v===true){ ready=true; break; } }catch(e){ last='eval-throw:'+e.message; } }
  console.error('READY='+ready+' last='+last+' elapsed='+((Date.now()-t0)/1000).toFixed(1)+'s');
  if(ACTION){ try{ const av=await evalJs('(function(){try{'+ACTION+';return "OK"}catch(e){return "ACTION_ERR:"+e.message}})()'); console.error('ACTION='+av); }catch(e){ console.error('ACTION_THROW='+e.message); } }
  await sleep(POST_MS);
  const shot=await send('Page.captureScreenshot',{format:'png'},sess);
  fs.writeFileSync(OUT, Buffer.from(shot.data,'base64'));
  console.error('SHOT_WRITTEN '+OUT+' bytes='+fs.statSync(OUT).size);
  fs.writeFileSync(OUT+'.console.log', logs.join('\n'));
  try{ await send('Browser.close'); }catch(e){}
  child.kill('SIGKILL'); process.exit(0);
})().catch(e=>{ console.error('DRIVER_FAIL '+e.message); child.kill('SIGKILL'); process.exit(1); });
