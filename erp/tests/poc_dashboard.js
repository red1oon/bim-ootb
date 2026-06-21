// Whitebox §-witness — unified Dashboard: donut grid, chip-fills-left, long-press textmode, collapse, timeline scrub.
'use strict';
const path=require('path'),http=require('http'),fs=require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mjs':'text/javascript','.xlsx':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b)})});
async function clickPill(page,id){await page.waitForSelector('#pill-'+id,{state:'attached',timeout:15000});await page.evaluate(()=>{var d=document.getElementById('idmp-pill'),t=document.getElementById('idmp-pill-trigger');if(d&&t&&getComputedStyle(d).display==='none')t.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))});await page.waitForTimeout(150);await page.evaluate(i=>document.getElementById('pill-'+i).dispatchEvent(new PointerEvent('pointerup',{bubbles:true})),id)}
const now=()=>Number(process.hrtime.bigint()/1000000n);
(async()=>{const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
const logs=[],errs=[];const b=await chromium.launch();const page=await b.newPage();await page.setViewportSize({width:1280,height:800});page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
const W=process.argv[2]||'143';
await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=${W}`,{waitUntil:'networkidle'});
await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)',{timeout:15000});
await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
await page.waitForSelector('#idmp-login-ok',{timeout:5000});await page.click('#idmp-login-ok');
await page.waitForSelector('[data-ad-table]',{timeout:15000}).catch(()=>{});await page.waitForTimeout(1700);
const t0=now();await clickPill(page,'dashboard');
await page.waitForFunction(()=>document.querySelector('.dash-card .donut-svg'),{timeout:10000});
const tOverview=now()-t0;
await page.waitForFunction(()=>document.querySelector('.dash-side .ask-chip'),{timeout:5000}).catch(()=>{});
const layout=await page.evaluate(()=>({split:!!document.querySelector('.dash-split'),donuts:document.querySelectorAll('.dash-main .donut-svg').length,sideChips:document.querySelectorAll('.dash-side .ask-chip').length,arcPct:document.querySelectorAll('.dash-main .donut-arc-l').length}));
console.log('§T-LAYOUT '+JSON.stringify(layout)+' overviewMs='+tOverview);
// CHIP FILLS LEFT — clicking a "By X" chip adds a donut card to the LEFT grid
const gridBefore=await page.evaluate(()=>document.querySelectorAll('.dash-main .dash-card').length);
const tc=now();
await page.evaluate(()=>{var c=[].slice.call(document.querySelectorAll('.dash-side .ask-chip')).find(x=>/^By /.test(x.textContent)&&!x.classList.contains('on'));c&&c.click()});
await page.waitForTimeout(250);const tChip=now()-tc;
const gridAfter=await page.evaluate(()=>document.querySelectorAll('.dash-main .dash-card').length);
console.log('§T-CHIP filledLeft='+(gridAfter>gridBefore)+' gridBefore='+gridBefore+' gridAfter='+gridAfter+' clickMs='+tChip+' :: '+(logs.filter(l=>l.startsWith('§ASK ')).pop()||''));
// LONG-PRESS → textmode
await page.evaluate(()=>{var w=document.querySelector('.dash-main .donut-wrap');w.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))});
await page.waitForTimeout(560);
await page.evaluate(()=>{var w=document.querySelector('.dash-main .donut-wrap');w.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
const textmode=await page.evaluate(()=>!!document.querySelector('.dash-main .donut-wrap.textmode'));
console.log('§T-LONGPRESS textmode='+textmode+' :: '+(logs.filter(l=>l.startsWith('§DONUT-TEXTMODE')).pop()||'(none)'));
await page.evaluate(()=>{var w=document.querySelector('.dash-main .donut-wrap.textmode');if(w){w.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));setTimeout(()=>w.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})),520)}});await page.waitForTimeout(640);
// COLLAPSE toggle
await page.evaluate(()=>{var h=document.querySelector('.dash-side .ask-head');h&&h.click()});
await page.waitForTimeout(120);
const collapsed=await page.evaluate(()=>document.querySelector('.dash-side').classList.contains('collapsed'));
console.log('§T-COLLAPSE collapsed='+collapsed+' :: '+(logs.filter(l=>l.startsWith('§ASK-COLLAPSE')).pop()||''));
await page.evaluate(()=>{var h=document.querySelector('.dash-side .ask-head');h&&h.click()});
// TIMELINE scrub
await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Timeline');b&&b.click()});
await page.waitForFunction(()=>document.querySelector('.tl-slider'),{timeout:5000});await page.waitForTimeout(250);
const maxIdx=await page.evaluate(()=>+document.querySelector('.tl-slider').max);const shifts=[];
for(let i=0;i<=maxIdx;i++){await page.evaluate(v=>{var s=document.querySelector('.tl-slider');s.value=String(v);s.dispatchEvent(new Event('input',{bubbles:true}))},i);await page.waitForTimeout(50);shifts.push(await page.evaluate(()=>{var t=document.querySelector('.tl-track');var m=(t.style.transform||'').match(/-?\d+/);return m?+m[0]:null}))}
const scrubN=logs.filter(l=>l.startsWith('§DASH-TL-SCRUB')).length,distinct=new Set(shifts.filter(x=>x!=null)).size;
console.log('§T-SCRUB scrubLogs='+scrubN+' distinctShiftPx='+distinct+' shifts='+JSON.stringify(shifts));
await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Graph');b&&b.click()});await page.waitForTimeout(400);
await page.screenshot({path:path.join(__dirname,'dash_overview.png')});
const pass=errs.length===0 && layout.split && layout.donuts>=4 && layout.sideChips>0 && layout.arcPct>0 && gridAfter>gridBefore && textmode && collapsed && scrubN>=(maxIdx+1) && distinct>=Math.min(2,maxIdx+1);
console.log('§DASHBOARD-RESULT '+(pass?'PASS':'FAIL')+' errs='+(errs.length?errs.slice(0,2).join('|'):0));
await b.close();server.close();process.exit(pass?0:1)})().catch(e=>{console.error('POC-ERR',e);server.close();process.exit(2)})
