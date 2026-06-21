'use strict';
const path=require('path'),http=require('http'),fs=require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mjs':'text/javascript','.xlsx':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b)})});
async function clickPill(page,id){await page.waitForSelector('#pill-'+id,{state:'attached',timeout:15000});await page.evaluate(()=>{var d=document.getElementById('idmp-pill'),t=document.getElementById('idmp-pill-trigger');if(d&&t&&getComputedStyle(d).display==='none')t.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))});await page.waitForTimeout(150);await page.evaluate(i=>document.getElementById('pill-'+i).dispatchEvent(new PointerEvent('pointerup',{bubbles:true})),id)}
(async()=>{const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
const logs=[],errs=[];const b=await chromium.launch();const page=await b.newPage();await page.setViewportSize({width:1280,height:800});page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
const W=process.argv[2]||'143';
await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=${W}`,{waitUntil:'networkidle'});
await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)',{timeout:15000});
await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
await page.waitForSelector('#idmp-login-ok',{timeout:5000});await page.click('#idmp-login-ok');
await page.waitForSelector('[data-ad-table]',{timeout:15000}).catch(()=>{});await page.waitForTimeout(1800);
await clickPill(page,'dashboard');
await page.waitForFunction(()=>document.querySelector('.dash-chart'),{timeout:10000}).catch(()=>{});
await page.waitForTimeout(900);
const ov=await page.evaluate(()=>({charts:document.querySelectorAll('.dash-chart').length,bars:document.querySelectorAll('.dash-gbox .chart-bar').length,chips:document.querySelectorAll('.ask-chip').length}));
console.log('OVERVIEW '+JSON.stringify(ov));
['§DASH-OVERVIEW','§ASK-PANEL'].forEach(p=>{var l=logs.find(x=>x.startsWith(p));console.log(l||'(no '+p+')')});
await page.screenshot({path:path.join(__dirname,'dash_overview.png'),fullPage:true});
// Timeline tab
await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Timeline');b&&b.click()});
await page.waitForTimeout(700);
const tl=await page.evaluate(()=>({cols:document.querySelectorAll('.tl-col').length,cards:document.querySelectorAll('.tl-card').length,hasSlider:!!document.querySelector('.tl-slider'),rest:(document.querySelector('.tl-restlabel')||{}).textContent||''}));
console.log('TIMELINE '+JSON.stringify(tl));
// scrub to middle
await page.evaluate(()=>{var s=document.querySelector('.tl-slider');if(s){s.value=Math.floor((+s.max)/2);s.dispatchEvent(new Event('input',{bubbles:true}))}});
await page.waitForTimeout(500);
const scr=await page.evaluate(()=>({rest:(document.querySelector('.tl-restlabel')||{}).textContent||'',restCol:!!document.querySelector('.tl-col.rest')}));
console.log('SCRUB '+JSON.stringify(scr));
console.log((logs.filter(x=>x.startsWith('§DASH-TL-SCRUB')).pop())||'(no scrub log)');
await page.screenshot({path:path.join(__dirname,'dash_timeline.png')});
console.log('ERRS '+(errs.length?errs.slice(0,3).join(' | '):0));
await b.close();server.close();process.exit(errs.length?1:0)})().catch(e=>{console.error('SMOKE3-ERR',e);server.close();process.exit(2)})
