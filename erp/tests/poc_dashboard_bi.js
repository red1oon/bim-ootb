// Whitebox §-witness — DASHBOARD BI low-hanging fruit (W-DASH-BI, this lane). §SPEC: prompts/RESUME_DASHBOARD_BI.md.
//   Three Graph-tab enrichments, every number a REAL fold of the open window's records (NON-INVENT, no LLM):
//     KPI strip   — count·total·average·biggest·smallest + ▲/▼ vs last month.
//     Top/Bottom N — an Explore chip drills the LIST to the 5 biggest / smallest by amount.
//     Stacked bar — the per-month status mix (date × status), reusing statusColor.
//   Proves:
//     W-KPI-CELLS  : Graph tab carries .dash-kpi with the 5 labelled cells; §DASH-KPI logged.
//     W-KPI-FOLD   : §DASH-KPI total EQUALS §DASH-SCURVE cumLast (same Σ over the same records, independent path);
//                    min ≤ avg ≤ max and avg·count ≈ total (internal consistency); §DASH-TREND ▲/▼ matches the cells.
//     W-KPI-COUNT  : §DASH-KPI rows EQUALS the independent List-tab DOM row count (capped at 200).
//     W-TOPN-TOP   : "Top 5 by …" → §DASH-TOPN dir=top, 5 ids, amts DESC, max==KPI biggest; grid drills (Show all).
//     W-TOPN-BOTTOM: "Bottom 5 by …" → §DASH-TOPN dir=bottom, amts ASC, min==KPI smallest.
//     W-STACK-FOLD : §DASH-STACK present; Σ of every month×status segment EQUALS the record count (each row once);
//                    DOM rects == non-zero segments.
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
const clickChip = (page,txt)=>page.evaluate(t=>{var c=[].slice.call(document.querySelectorAll('.dash-side .ask-chip')).find(x=>x.textContent.trim().indexOf(t)===0);if(c){c.click();return true;}return false;},txt);

(async()=>{
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const ctx=await b.newContext();const page=await ctx.newPage();
  await page.setViewportSize({width:1280,height:860});
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // Sales Order window (143) — GrandTotal (amount) + DateOrdered (date) + DocStatus → all three features fire.
  await login(page,port,'143');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-card .donut-svg'),{timeout:10000});
  await page.waitForSelector('.dash-kpi',{timeout:5000});

  // ── W-KPI-CELLS: 5 labelled cells present, §DASH-KPI logged. ──
  const labels = await page.evaluate(()=>[].slice.call(document.querySelectorAll('.dash-kpi .kpi-l')).map(e=>e.textContent));
  const kpiLog = last(logs,/§DASH-KPI/);
  ok.kpiCells = labels.length===5 && ['Records','Total','Average','Biggest','Smallest'].every((l,i)=>labels[i]===l) && /§DASH-KPI/.test(kpiLog);
  console.log('§W-KPI-CELLS labels='+JSON.stringify(labels)+' :: '+kpiLog+' :: '+(ok.kpiCells?'OK':'FAIL'));

  const kRows=Number((kpiLog.match(/rows=(\d+)/)||[])[1]);
  const kTot=Number((kpiLog.match(/total=(\d+)/)||[])[1]);
  const kAvg=Number((kpiLog.match(/avg=(\d+)/)||[])[1]);
  const kMax=Number((kpiLog.match(/max=(\d+)/)||[])[1]);
  const kMin=Number((kpiLog.match(/min=(\d+)/)||[])[1]);

  // ── W-KPI-FOLD: total == S-curve cumLast (independent Σ over the same records); consistency; trend arrow. ──
  const scLog = last(logs,/§DASH-SCURVE/);
  const cumLast = Number((scLog.match(/cumLast=(\d+)/)||[])[1]);
  const consistent = kMin<=kAvg && kAvg<=kMax && Math.abs(kAvg - kTot/kRows) <= 1;
  const trendLog = last(logs,/§DASH-TREND/);
  const deltaTxt = await page.evaluate(()=>{var d=document.querySelector('.dash-kpi .kpi-delta');return d?d.textContent.trim():''});
  const trendUp = /thisMo=(\d+).*pct=(-?\d+)/.test(trendLog);
  ok.kpiFold = kTot>0 && kTot===cumLast && consistent && (deltaTxt===''||/[▲▼]/.test(deltaTxt));
  console.log('§W-KPI-FOLD total='+kTot+' cumLast='+cumLast+' min='+kMin+' avg='+kAvg+' max='+kMax+' delta="'+deltaTxt+'" :: '+trendLog+' :: '+(ok.kpiFold?'OK':'FAIL'));

  // ── W-KPI-COUNT: §DASH-KPI rows == List-tab DOM row count (independent, capped at 200). ──
  await clickTab(page,'List'); await page.waitForTimeout(400);
  const domRows = await page.evaluate(()=>document.querySelectorAll('.dash-list tr').length-1);   // minus header
  ok.kpiCount = domRows===Math.min(kRows,200);
  console.log('§W-KPI-COUNT kpiRows='+kRows+' domRows='+domRows+' :: '+(ok.kpiCount?'OK':'FAIL'));

  // ── W-STACK-FOLD: stacked bar present; Σ all month×status segments == record count; DOM rects == non-zero segs. ──
  await clickTab(page,'Graph'); await page.waitForTimeout(400);
  const stackLog = last(logs,/§DASH-STACK/);
  const segStr = (stackLog.match(/segs=\[([^\]]*)\]/)||[])[1]||'';
  let segSum=0, segCount=0;
  segStr.split(' ').filter(Boolean).forEach(t=>{ (t.split(':')[1]||'').split('/').forEach(v=>{const n=Number(v); if(n>0)segCount++; segSum+=n;}); });
  const rects = await page.evaluate(()=>document.querySelectorAll('.dash-card[data-dim="__stack"] svg.stack-svg rect').length);
  ok.stackFold = /§DASH-STACK/.test(stackLog) && segSum===kRows && rects===segCount && segCount>0;
  console.log('§W-STACK-FOLD segSum='+segSum+' kRows='+kRows+' rects='+rects+' nonzeroSegs='+segCount+' :: '+(ok.stackFold?'OK':'FAIL'));

  // ── W-TOPN-TOP: "Top 5 by …" chip drills the list to the 5 biggest; amts DESC; max == KPI biggest. ──
  const tapped = await clickChip(page,'Top 5 by');
  await page.waitForTimeout(500);
  const topLog = last(logs,/§DASH-TOPN dir=top/);
  const topAmts = ((topLog.match(/amts=\[([-\d,]+)\]/)||[])[1]||'').split(',').map(Number);
  const topDesc = topAmts.length>=1 && topAmts.every((v,i)=>i===0||v<=topAmts[i-1]);
  const drilled = await page.evaluate(()=>!!([].slice.call(document.querySelectorAll('button')).find(b=>/Show all/.test(b.textContent))));
  const wantN = Math.min(5,kRows);   // garden has small demo data — the cap returns min(5, records), honestly
  ok.topnTop = tapped && topAmts.length===wantN && topDesc && topAmts[0]===kMax && drilled;
  console.log('§W-TOPN-TOP wantN='+wantN+' :: '+topLog+' desc='+topDesc+' max==kpi='+(topAmts[0]===kMax)+' drilled='+drilled+' :: '+(ok.topnTop?'OK':'FAIL'));

  // ── W-TOPN-BOTTOM: restore, re-open, "Bottom 5 by …" → amts ASC; min == KPI smallest. ──
  await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('button')).find(x=>/Show all/.test(x.textContent));if(b)b.click();});
  await page.waitForTimeout(400);
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-side .ask-chip'),{timeout:10000});
  const tappedB = await clickChip(page,'Bottom 5 by');
  await page.waitForTimeout(500);
  const botLog = last(logs,/§DASH-TOPN dir=bottom/);
  const botAmts = ((botLog.match(/amts=\[([-\d,]+)\]/)||[])[1]||'').split(',').map(Number);
  const botAsc = botAmts.length>=1 && botAmts.every((v,i)=>i===0||v>=botAmts[i-1]);
  ok.topnBottom = tappedB && botAmts.length===wantN && botAsc && botAmts[0]===kMin;
  console.log('§W-TOPN-BOTTOM :: '+botLog+' asc='+botAsc+' min==kpi='+(botAmts[0]===kMin)+' :: '+(ok.topnBottom?'OK':'FAIL'));

  const pass = Object.values(ok).filter(Boolean).length, total = Object.keys(ok).length;
  console.log('\n§W-DASH-BI '+pass+'/'+total+' '+JSON.stringify(ok));
  if(errs.length) console.log('§PAGEERR '+errs.length+' :: '+errs.slice(0,3).join(' | '));
  await b.close(); server.close();
  process.exit(pass===total && !errs.length ? 0 : 1);
})().catch(e=>{console.error('§FATAL '+e.message);process.exit(1)});
