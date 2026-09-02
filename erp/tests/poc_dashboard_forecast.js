// Whitebox §-witness — DASHBOARD "future tense" (W-DASH-FORECAST, this lane). §SPEC: idempiere.html.
//   The future is a run-rate PROJECTION on the TIME-axis lenses only (Graph S-curve + Timeline), driven by one
//   Forecast toggle. NON-INVENT: every dashed point is a labelled extrapolation of the SAME real folds the donuts
//   use; nothing synthetic, no LLM. Donut/kanban/pivot have no time axis → no forecast there (by design).
//   Proves:
//     W-FORECAST-MATH    : §RUNRATE projection is a correct constant-delta run-rate (proj_i = last + i·delta).
//     W-FORECAST-SCURVE  : Graph tab has the cumulative S-curve card; forecast OFF ⇒ no dashed tail (forecast=0),
//                          ON ⇒ a dashed forecast path appears (forecast=3). Cumulative is monotonic by construction.
//     W-FORECAST-TIMELINE: Timeline forecast OFF ⇒ 0 future cols == real days; ON ⇒ 3 dashed .tl-col.future cols,
//                          and scrubbing onto one logs §DASH-TL-SCRUB … FORECAST.
//     W-FORECAST-RESTING : toggling OFF restores the resting panel — S-curve forecast=0, Timeline forecastCols=0.
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT = path.join(__dirname, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mjs':'text/javascript','.xlsx':'application/octet-stream'};
const server = http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b)})});
async function clickPill(page,id){await page.waitForSelector('#pill-'+id,{state:'attached',timeout:15000});await page.evaluate(()=>{var d=document.getElementById('idmp-pill'),t=document.getElementById('idmp-pill-trigger');if(d&&t&&getComputedStyle(d).display==='none')t.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))});await page.waitForTimeout(150);await page.evaluate(i=>document.getElementById('pill-'+i).dispatchEvent(new PointerEvent('pointerup',{bubbles:true})),id)}
async function login(page,port,win){
  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=${win}`,{waitUntil:'networkidle'});
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)',{timeout:15000});
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok',{timeout:5000});await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]',{timeout:15000}).catch(()=>{});await page.waitForTimeout(1700);
}
const last = (logs,re)=>logs.filter(l=>re.test(l)).pop()||'';
const clickTab = (page,label)=>page.evaluate(t=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent.trim().indexOf(t)>=0);if(b)b.click();},label);
const toggleForecast = (page)=>page.evaluate(()=>document.querySelector('.dash-forecast').click());

(async()=>{
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const ctx=await b.newContext();const page=await ctx.newPage();
  await page.setViewportSize({width:1280,height:860});
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // Sales Order window (143) — dated (DateOrdered) + amount (GrandTotal), multi-month garden data → a real S-curve.
  await login(page,port,'143');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-card .donut-svg'),{timeout:10000});

  // ── W-FORECAST-SCURVE (resting): the cumulative S-curve card exists, forecast OFF (no dashed tail). ──
  await page.waitForSelector('.dash-scurve svg.scurve-svg',{timeout:5000});
  const scRest = last(logs,/§DASH-SCURVE/);
  const scRestF = Number((scRest.match(/forecast=(\d+)/)||[])[1]);
  const cumLast = Number((scRest.match(/cumLast=(\d+)/)||[])[1]);
  ok.scurveResting = /§DASH-SCURVE/.test(scRest) && scRestF===0 && cumLast>0;
  console.log('§W-FORECAST-SCURVE-REST :: '+scRest+' :: '+(ok.scurveResting?'OK':'FAIL'));

  // ── flip Forecast ON → Graph re-renders with the dashed tail + §RUNRATE ──
  await toggleForecast(page); await page.waitForTimeout(400);
  const scFut = last(logs,/§DASH-SCURVE/);
  const scFutF = Number((scFut.match(/forecast=(\d+)/)||[])[1]);
  const dashedPaths = await page.evaluate(()=>document.querySelectorAll('.dash-scurve svg.scurve-svg path[stroke-dasharray]').length);
  ok.scurveFuture = scFutF===3 && dashedPaths>=1;
  console.log('§W-FORECAST-SCURVE-FUT :: '+scFut+' dashedPaths='+dashedPaths+' :: '+(ok.scurveFuture?'OK':'FAIL'));

  // ── W-FORECAST-MATH: §RUNRATE proj is a constant-delta run-rate (proj_i = last + i·delta). ──
  const rr = last(logs,/§RUNRATE/);
  const dlt = Number((rr.match(/delta=(-?\d+)/)||[])[1]);
  const lst = Number((rr.match(/last=(-?\d+)/)||[])[1]);
  const proj = ((rr.match(/proj=([-\d,]+)/)||[])[1]||'').split(',').map(Number);
  // each step rises by ~delta (allow ±1 for the per-step Math.round in the log); monotonic non-decreasing after clamp.
  let stepOk = proj.length===3;
  let prev = lst; proj.forEach(p=>{ if(Math.abs((p-prev)-dlt)>1 && p!==prev) stepOk=false; prev=p; });
  const mono = proj.every((p,i)=> i===0 ? p>=lst-1 : p>=proj[i-1]-1);
  ok.math = /§RUNRATE/.test(rr) && stepOk && mono;
  console.log('§W-FORECAST-MATH :: '+rr+' :: step='+stepOk+' mono='+mono+' :: '+(ok.math?'OK':'FAIL'));

  // ── W-FORECAST-TIMELINE: Timeline tab now carries 3 dashed future cols + a FORECAST scrub. ──
  await clickTab(page,'Timeline'); await page.waitForTimeout(500);
  const tlFut = last(logs,/§DASH-TIMELINE/);
  const tlFutCols = Number((tlFut.match(/forecastCols=(\d+)/)||[])[1]);
  const futColsDom = await page.evaluate(()=>document.querySelectorAll('.tl-col.future').length);
  // scrub to the far right (onto a forecast column) → §DASH-TL-SCRUB … FORECAST
  await page.evaluate(()=>{var s=document.querySelector('.tl-slider');s.value=s.max;s.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(200);
  const scrub = last(logs,/§DASH-TL-SCRUB/);
  ok.timelineFuture = tlFutCols===3 && futColsDom===3 && /FORECAST/.test(scrub);
  console.log('§W-FORECAST-TL-FUT :: '+tlFut+' domFutCols='+futColsDom+' :: '+scrub+' :: '+(ok.timelineFuture?'OK':'FAIL'));

  // ── W-FORECAST-RESTING: flip OFF → Timeline back to 0 future, then Graph S-curve forecast=0. ──
  await toggleForecast(page); await page.waitForTimeout(400);
  const tlRest = last(logs,/§DASH-TIMELINE/);
  const tlRestCols = Number((tlRest.match(/forecastCols=(\d+)/)||[])[1]);
  const futColsAfter = await page.evaluate(()=>document.querySelectorAll('.tl-col.future').length);
  await clickTab(page,'Graph'); await page.waitForTimeout(400);
  const scAfter = last(logs,/§DASH-SCURVE/);
  const scAfterF = Number((scAfter.match(/forecast=(\d+)/)||[])[1]);
  ok.resting = tlRestCols===0 && futColsAfter===0 && scAfterF===0;
  console.log('§W-FORECAST-RESTING :: tlForecastCols='+tlRestCols+' domFut='+futColsAfter+' :: '+scAfter+' :: '+(ok.resting?'OK':'FAIL'));

  // ── summary ──
  const pass = Object.values(ok).filter(Boolean).length, total = Object.keys(ok).length;
  console.log('\n§W-DASH-FORECAST '+pass+'/'+total+' '+JSON.stringify(ok));
  if(errs.length) console.log('§PAGEERR '+errs.length+' :: '+errs.slice(0,3).join(' | '));
  await b.close(); server.close();
  process.exit(pass===total && !errs.length ? 0 : 1);
})().catch(e=>{console.error('§FATAL '+e.message);process.exit(1)});
