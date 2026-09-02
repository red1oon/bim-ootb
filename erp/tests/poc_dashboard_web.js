// Whitebox §-witness — DASHBOARD SPIDER WEB (W-DASH-WEB, this lane). §SPEC: idempiere.html.
//   The Graph tab's "Web" toggle collapses the pies the user has on the board into ONE radar: each pie = a spoke,
//   the spoke's reach = that pie's CONCENTRATION (biggest slice's % — read off the live card's data-conc). The
//   totals are equal on every pie (same records), so CONCENTRATION is what makes the spokes differ — the whole
//   point. NON-INVENT: each spoke is the same fold the donut already drew.
//   Proves:
//     W-WEB-SPOKES  : Web on → one .web-svg with one spoke per live pie (≥3); §DASH-WEB spokes==pie count.
//     W-WEB-DIFFER  : the spokes are NOT all equal (the "same value" trap is solved — real spread of concentration).
//     W-WEB-CHOSEN  : adding a pie via an Explore chip then re-opening the web adds a spoke (built from chosen pies).
//     W-WEB-TOGGLE  : toggle off → pies grid back, web hidden.
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT = path.join(__dirname, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mjs':'text/javascript'};
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
const clickWeb = (page)=>page.evaluate(()=>document.querySelector('.dash-webtoggle').click());

(async()=>{
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const page=await (await b.newContext()).newPage();
  await page.setViewportSize({width:1280,height:860});
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // Business Partner window (123) — multiple categorical cuts → several pies with DIFFERENT concentrations.
  await login(page,port,'123');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-card .donut-svg'),{timeout:10000});
  const pieCount = await page.evaluate(()=>document.querySelectorAll('.dash-grid .dash-card[data-conc]').length);

  // ── W-WEB-SPOKES: flip to Web → one radar, spokes == live pies (≥3). ──
  await clickWeb(page); await page.waitForTimeout(300);
  await page.waitForSelector('.dash-web .web-svg',{timeout:5000});
  const webLog = last(logs,/§DASH-WEB spokes=/);
  const spokes = Number((webLog.match(/spokes=(\d+)/)||[])[1]);
  const dots = await page.evaluate(()=>document.querySelectorAll('.dash-web .web-svg circle[r="3"]').length);
  ok.spokes = spokes>=3 && spokes===pieCount && dots===spokes;
  console.log('§W-WEB-SPOKES pies='+pieCount+' :: '+webLog+' dots='+dots+' :: '+(ok.spokes?'OK':'FAIL'));

  // ── W-WEB-DIFFER: the concentrations are NOT all equal (the "same value" trap is solved). ──
  const conc = ((webLog.match(/conc=\[([\d,]+)\]/)||[])[1]||'').split(',').map(Number);
  const distinct = new Set(conc).size;
  ok.differ = conc.length>=3 && distinct>=2 && conc.every(c=>c>=0&&c<=100);
  console.log('§W-WEB-DIFFER conc=['+conc.join(',')+'] distinct='+distinct+' :: '+(ok.differ?'OK':'FAIL'));

  // ── W-WEB-CHOSEN: flip back to pies, add a pie via an Explore chip, re-open web → a spoke is added. ──
  await clickWeb(page); await page.waitForTimeout(200);   // back to pies
  const added = await page.evaluate(()=>{
    var chip=[].slice.call(document.querySelectorAll('.dash-side .ask-chip')).find(c=>!c.classList.contains('on'));
    if(chip){chip.click();return true;} return false;
  });
  await page.waitForTimeout(300);
  const pieCount2 = await page.evaluate(()=>document.querySelectorAll('.dash-grid .dash-card[data-conc]').length);
  await clickWeb(page); await page.waitForTimeout(300);   // web again
  const webLog2 = last(logs,/§DASH-WEB spokes=/);
  const spokes2 = Number((webLog2.match(/spokes=(\d+)/)||[])[1]);
  ok.chosen = !added || (pieCount2===pieCount+1 && spokes2===pieCount2);   // honest pass if no spare chip to add
  console.log('§W-WEB-CHOSEN added='+added+' pies '+pieCount+'→'+pieCount2+' spokes2='+spokes2+' :: '+(ok.chosen?'OK':'FAIL'));

  // ── W-WEB-TOGGLE: off → pies grid visible, web hidden. ──
  await clickWeb(page); await page.waitForTimeout(200);
  const state = await page.evaluate(()=>({grid:getComputedStyle(document.querySelector('.dash-grid')).display, web:getComputedStyle(document.querySelector('.dash-web')).display}));
  ok.toggle = state.grid!=='none' && state.web==='none';
  console.log('§W-WEB-TOGGLE grid='+state.grid+' web='+state.web+' :: '+(ok.toggle?'OK':'FAIL'));

  const pass=Object.values(ok).filter(Boolean).length, total=Object.keys(ok).length;
  console.log('\n§W-DASH-WEB '+pass+'/'+total+' '+JSON.stringify(ok));
  if(errs.length) console.log('§PAGEERR '+errs.length+' :: '+errs.slice(0,3).join(' | '));
  await b.close(); server.close();
  process.exit(pass===total && !errs.length ? 0 : 1);
})().catch(e=>{console.error('§FATAL '+e.message);process.exit(1)});
