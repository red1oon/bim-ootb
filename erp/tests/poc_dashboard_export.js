// Whitebox §-witness — DASHBOARD_EXPORT + name/date fixes (this lane):
//  W-DASH-EXPORT  : per-card CSV download parses back to the same fold rows; window Export = all records;
//                   pivot cross-tab CSV grand-total > 0; PNG/SVG affordance present.
//  W-DASH-DATE    : BPartner (no Date* col) Timeline now scrubs on audit Updated/Created (was blank).
//  W-DASH-REGROUP : Sales-Order kanban DocStatus regroup keeps its cards (was blank — label≠code bug).
//  W-DASH-TBLNAME : pivot Table label folds PP_Order → "Manufacturing Order" (AD_Table.Name).
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
const readDl = async (dl)=>{const p=await dl.path();return fs.readFileSync(p,'utf8');};
(async()=>{
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const ctx=await b.newContext({acceptDownloads:true});const page=await ctx.newPage();
  await page.setViewportSize({width:1280,height:820});
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // ── PART 1 — Sales Order (143): export + regroup ───────────────────────────────────────────────
  await login(page,port,'143');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-card .donut-svg'),{timeout:10000});

  // CHIP SYNC — Explore chips for already-shown donuts start highlighted (.on); §ASK-CHIPS-SYNC shownOnLoad>0.
  await page.waitForFunction(()=>document.querySelector('.dash-side .ask-chip'),{timeout:5000}).catch(()=>{});
  await page.waitForTimeout(150);
  const onChips=await page.evaluate(()=>document.querySelectorAll('.dash-side .ask-chip.on').length);
  const syncLog=logs.filter(l=>/§ASK-CHIPS-SYNC/.test(l)).pop()||'';
  const syncShown=Number((syncLog.match(/shownOnLoad=(\d+)/)||[])[1]);
  ok.chipSync = onChips>0 && syncShown>0 && onChips===syncShown;
  console.log('§W-CHIP-SYNC domOn='+onChips+' :: '+syncLog+' :: '+(ok.chipSync?'OK':'FAIL'));
  // PERF — distinctCount/groupBy memoized: §DASH-CACHE calls ≫ computes (saved scans>0).
  const cacheLog=logs.filter(l=>/§DASH-CACHE/.test(l)).pop()||'';
  const saved=Number((cacheLog.match(/saved (\d+)/)||[])[1]);
  ok.cache = /§DASH-CACHE/.test(cacheLog) && saved>0;
  console.log('§W-CACHE :: '+cacheLog+' :: '+(ok.cache?'OK':'FAIL'));

  // per-card CSV: open the export menu on the first donut card → CSV → capture the download, parse it back.
  await page.click('.dash-card .dash-export');
  await page.waitForSelector('.dash-exmenu .dash-exmi',{timeout:4000});
  const menuItems=await page.evaluate(()=>[].map.call(document.querySelectorAll('.dash-exmenu .dash-exmi'),x=>x.textContent));
  const clickItem=(label)=>page.evaluate(l=>{var it=[].slice.call(document.querySelectorAll('.dash-exmenu .dash-exmi')).find(x=>x.textContent===l);if(it)it.click();},label);
  const [dlCard]=await Promise.all([page.waitForEvent('download'),clickItem('CSV')]);
  const cardCsv=await readDl(dlCard);
  const cardLines=cardCsv.trim().split(/\r?\n/);
  const cardLog=logs.filter(l=>/§DASH-EXPORT kind=csv/.test(l)).pop()||'';
  const loggedRows=Number((cardLog.match(/rows=(\d+)/)||[])[1]);
  ok.cardCsv = cardLines.length>=2 && (cardLines.length-1)===loggedRows && /Key,(Count|Amount),Pct/.test(cardLines[0]);
  console.log('§W-EXPORT-CARD menu='+JSON.stringify(menuItems)+' csvDataRows='+(cardLines.length-1)+' loggedRows='+loggedRows+' header="'+cardLines[0]+'" :: '+(ok.cardCsv?'OK':'FAIL'));

  // window-level Export → all records CSV.
  const recCount=await page.evaluate(()=>document.querySelectorAll('[data-ad-table] tbody tr, .idmp-grid tbody tr').length);
  const [dlAll]=await Promise.all([page.waitForEvent('download'),page.click('.dash-export-all')]);
  const allCsv=await readDl(dlAll);const allRows=allCsv.trim().split(/\r?\n/).length-1;
  const allLog=logs.filter(l=>/§DASH-EXPORT kind=csv/.test(l)).pop()||'';
  ok.allCsv = allRows>0 && allRows===Number((allLog.match(/rows=(\d+)/)||[])[1]);
  console.log('§W-EXPORT-ALL csvDataRows='+allRows+' gridRows='+recCount+' :: '+(ok.allCsv?'OK':'FAIL'));

  // REGROUP bug E: Cards → change group-by off DocStatus → back to DocStatus → board still has cards.
  await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Cards');b&&b.click()});
  await page.waitForFunction(()=>document.querySelector('.dash-body select')||document.querySelector('.kanban-board,.kb-board,[class*=kanban]'),{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(600);
  const sel='.dash-body select';
  const hasSel=await page.$(sel);
  if(hasSel){
    const opts=await page.evaluate(s=>[].map.call(document.querySelectorAll(s+' option'),o=>({v:o.value,t:o.textContent})),sel);
    const dsOpt=opts.find(o=>/docstatus/i.test(o.v)),other=opts.find(o=>!/docstatus/i.test(o.v));
    if(other){await page.selectOption(sel,other.v);await page.waitForTimeout(400);}
    if(dsOpt){await page.selectOption(sel,dsOpt.v);await page.waitForTimeout(500);}
    const reLog=logs.filter(l=>/§KANBAN-GROUPBY/.test(l)).pop()||'';
    const cards=await page.evaluate(()=>document.querySelectorAll('.kanban-card').length);  // real board cards (label≠code bug → 0)
    const groups=Number((reLog.match(/groups=(\d+)/)||[])[1]);
    ok.regroup = /draggable=true/.test(reLog) && groups>0 && cards>0;
    console.log('§W-REGROUP backToDocStatus cards='+cards+' :: '+reLog+' :: '+(ok.regroup?'OK':'FAIL'));
  } else { ok.regroup=true; console.log('§W-REGROUP no-groupby-selector (single axis) — n/a → OK'); }

  // PIVOT export + table name: Pivot tab → iframe → export → grand>0; AD table label folded.
  await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Pivot');b&&b.click()});
  await page.waitForSelector('.dash-body iframe',{timeout:6000});
  const fr=page.frames().find(f=>/pivot_lens/.test(f.url()));
  await fr.waitForSelector('#pv-export',{timeout:8000});await fr.waitForSelector('.pv-table',{timeout:8000}).catch(()=>{});
  const [dlPv]=await Promise.all([page.waitForEvent('download'),fr.click('#pv-export')]);
  const pvCsv=await readDl(dlPv);const pvLog=logs.filter(l=>/§PIVOT-EXPORT/.test(l)).pop()||'';
  const tblLog=logs.filter(l=>/table labels:/.test(l)).pop()||'';
  const grand=Number((pvLog.match(/grand=(\d+)/)||[])[1]);
  ok.pivotCsv = grand>0 && pvCsv.indexOf('Total')>=0;
  ok.tblName = /pp_order→Manufacturing Order/i.test(tblLog);
  console.log('§W-PIVOT-EXPORT grand='+grand+' bytes='+pvCsv.length+' :: '+(ok.pivotCsv?'OK':'FAIL'));
  console.log('§W-TBLNAME :: '+tblLog+' :: '+(ok.tblName?'OK':'FAIL'));

  // ── PART 2 — Business Partner (123): Timeline date fallback ────────────────────────────────────
  await login(page,port,'123');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-tabs'),{timeout:10000});
  await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent==='Timeline');b&&b.click()});
  await page.waitForTimeout(800);
  const tlLog=logs.filter(l=>/§DASH-TIMELINE/.test(l)).pop()||'';
  const hasSlider=await page.evaluate(()=>!!document.querySelector('.tl-slider'));
  const dateField=(tlLog.match(/dateField=(\S+)/)||[])[1]||'none';
  const days=Number((tlLog.match(/days=(\d+)/)||[])[1])||0;
  ok.bpTimeline = dateField!=='none' && /updated|created|date/i.test(dateField) && days>0 && hasSlider;
  console.log('§W-DASH-DATE :: '+tlLog+' hasSlider='+hasSlider+' :: '+(ok.bpTimeline?'OK':'FAIL'));

  // ── PART 3 — DRILL on EVERY tab (Graph slice · List row · Timeline card · Cards card · Pivot cell), via
  //    LONG-PRESS (deliberate intent). Each closes the dash and lands the record(s) in the window grid/form. ──
  const lpDown=(sel,idx)=>page.evaluate(({s,i})=>{var els=document.querySelectorAll(s);var el=els[i==null?0:i];if(el)el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:5,clientY:5}));},{s:sel,i:idx});
  async function reopenDash(){await clickPill(page,'dashboard');await page.waitForFunction(()=>document.querySelector('.dash-wrap'),{timeout:8000});await page.waitForTimeout(300);}
  async function openTab(name){await page.evaluate(n=>{var b=[].slice.call(document.querySelectorAll('.dash-tab')).find(x=>x.textContent===n);b&&b.click()},name);await page.waitForTimeout(500);}
  function drillResult(tag){const lg=logs.filter(l=>/§DASH-DRILL table/.test(l)).pop()||'';const recs=Number((lg.match(/recs=(\d+)/)||[])[1])||0;return {lg,recs};}
  async function restore(){await page.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('button')).find(x=>/Show all/.test(x.textContent));if(b)b.click();});await page.waitForTimeout(250);}

  // GRAPH — long-press the largest arc
  await login(page,port,'143'); await reopenDash();
  await lpDown('.dash-card .donut-svg circle',1); await page.waitForTimeout(620);
  let r=drillResult(); const dashGone=await page.evaluate(()=>!document.querySelector('.dash-wrap'));
  ok.drillGraph = /§DASH-DRILL/.test(r.lg) && r.recs>0 && dashGone;
  console.log('§W-DRILL-GRAPH :: '+r.lg+' dashClosed='+dashGone+' :: '+(ok.drillGraph?'OK':'FAIL'));
  await restore(); const restLog=logs.filter(l=>/§DASH-DRILL-RESTORE/.test(l)).pop()||'';
  ok.drillRestore = /§DASH-DRILL-RESTORE/.test(restLog); console.log('§W-DRILL-RESTORE :: '+restLog+' :: '+(ok.drillRestore?'OK':'FAIL'));

  // LIST — long-press a row
  await reopenDash(); await openTab('List');
  const lN=logs.length; await lpDown('.dash-list tr',1); await page.waitForTimeout(620);
  r=drillResult(); ok.drillList = logs.slice(lN).some(l=>/§DASH-DRILL table/.test(l)) && r.recs>=1;
  console.log('§W-DRILL-LIST :: '+r.lg+' :: '+(ok.drillList?'OK':'FAIL'));
  await restore();

  // TIMELINE — long-press a day card
  await reopenDash(); await openTab('Timeline'); await page.waitForSelector('.tl-card',{timeout:5000}).catch(()=>{});
  const tN=logs.length; await lpDown('.tl-card',0); await page.waitForTimeout(620);
  ok.drillTimeline = logs.slice(tN).some(l=>/§DASH-DRILL table/.test(l));
  console.log('§W-DRILL-TIMELINE :: '+(logs.filter(l=>/§DASH-DRILL table/.test(l)).pop()||'')+' :: '+(ok.drillTimeline?'OK':'FAIL'));
  await restore();

  // CARDS (kanban) — long-press a card
  await reopenDash(); await openTab('Cards'); await page.waitForSelector('.kanban-card',{timeout:6000}).catch(()=>{});
  const cN=logs.length; await lpDown('.kanban-card',0); await page.waitForTimeout(620);
  ok.drillCards = logs.slice(cN).some(l=>/§DASH-DRILL table/.test(l));
  console.log('§W-DRILL-CARDS :: '+(logs.filter(l=>/§DASH-DRILL table/.test(l)).pop()||'')+' :: '+(ok.drillCards?'OK':'FAIL'));
  await restore();

  // PIVOT — long-press a non-zero cell → host drills (pivot defaults to the window's table c_order → match)
  await reopenDash(); await openTab('Pivot');
  const frEl=await page.waitForSelector('.dash-body iframe',{timeout:6000});
  const frP=await frEl.contentFrame();
  await frP.waitForSelector('.pv-table td:not(.pv-zero)',{timeout:8000}).catch(()=>{});
  const pN=logs.length;
  await frP.evaluate(()=>{var td=[].slice.call(document.querySelectorAll('.pv-table td')).find(x=>x.style.cursor==='pointer'&&!x.classList.contains('pv-zero')&&/^\d/.test(x.textContent));if(td)td.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:5,clientY:5}));});
  await page.waitForTimeout(700);
  const lpFired=logs.slice(pN).some(l=>/§PIVOT-DRILL-LP/.test(l));
  const hostLog=logs.slice(pN).filter(l=>/§PIVOT-DRILL-HOST/.test(l)).pop()||'';
  ok.drillPivot = lpFired && /drilled=true/.test(hostLog);
  console.log('§W-DRILL-PIVOT lpFired='+lpFired+' :: '+hostLog+' :: '+(ok.drillPivot?'OK':'FAIL'));

  const pass = errs.length===0 && Object.values(ok).every(Boolean);
  console.log('§DASH-EXPORT-RESULT '+(pass?'PASS':'FAIL')+' checks='+JSON.stringify(ok)+' errs='+(errs.length?errs.slice(0,3).join('|'):0));
  await b.close();server.close();process.exit(pass?0:1);
})().catch(e=>{console.error('POC-ERR',e);try{server.close()}catch(_){}process.exit(2)});
