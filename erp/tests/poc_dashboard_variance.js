// Whitebox §-witness — DASHBOARD EVM variance S-curve (W-DASH-VARIANCE, this lane). §SPEC: idempiere.html.
//   On a PROJECT window a phased project's baked PlannedAmt (contract) vs CommittedAmt (outturn) folds into the
//   variance S-curve: planned baseline always, committed/forecast outturn + Δ when the Forecast toggle is on.
//   NON-INVENT — the §DASH-VARIANCE numbers must EQUAL the real C_ProjectPhase Σ in ad_seed.db (no fabrication).
//   Proves:
//     W-VAR-CARD     : the Project window's Graph tab carries a variance S-curve card (data-dim="__variance").
//     W-VAR-NUMBERS  : §DASH-VARIANCE planned/committed == the DB Σ(PlannedAmt)/Σ(CommittedAmt) for that project.
//     W-VAR-FORECAST : Forecast OFF ⇒ planned baseline only (forecast=0); ON ⇒ committed line + Δ (forecast=1).
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const { execFileSync } = require('child_process');
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
const toggleForecast = (page)=>page.evaluate(()=>document.querySelector('.dash-forecast').click());

// the DB truth, computed independently from ad_seed.db via the sqlite3 CLI (the oracle the §-log must match).
function dbTruth(){
  try {
    const out = execFileSync('sqlite3', [path.join(ROOT,'ad_seed.db'),
      "SELECT p.C_Project_ID||'|'||CAST(ROUND(SUM(ph.PlannedAmt)) AS INT)||'|'||CAST(ROUND(SUM(ph.CommittedAmt)) AS INT) FROM C_ProjectPhase ph JOIN C_Project p ON p.C_Project_ID=ph.C_Project_ID WHERE ph.Name<>'Unsequenced' GROUP BY p.C_Project_ID ORDER BY SUM(ph.CommittedAmt) DESC LIMIT 1"],
      {encoding:'utf8'}).trim();
    const v = out.split('|'); return {id:Number(v[0]), planned:Number(v[1]), committed:Number(v[2])};
  } catch(e){ console.log('§DBTRUTH-ERR '+e.message); return null; }
}

(async()=>{
  const truth = dbTruth();
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const ctx=await b.newContext();const page=await ctx.newPage();
  await page.setViewportSize({width:1280,height:860});
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // Project window (130) — C_Project, carries the baked Planned/Committed phase baseline.
  await login(page,port,'130');
  await clickPill(page,'dashboard');
  await page.waitForFunction(()=>document.querySelector('.dash-scurve'),{timeout:10000});

  // ── W-VAR-CARD: the variance S-curve card is present (data-dim __variance), resting forecast=0. ──
  const cardDom = await page.evaluate(()=>!!document.querySelector('.dash-card[data-dim="__variance"] svg.scurve-svg'));
  const vRest = last(logs,/§DASH-VARIANCE/);
  ok.card = cardDom && /forecast=0/.test(vRest);
  console.log('§W-VAR-CARD dom='+cardDom+' :: '+vRest+' :: '+(ok.card?'OK':'FAIL'));

  // ── W-VAR-NUMBERS: the §-log planned/committed EQUAL the independent DB Σ (NON-INVENT). ──
  const planned = Number((vRest.match(/planned=(\d+)/)||[])[1]);
  const committed = Number((vRest.match(/committed=(\d+)/)||[])[1]);
  ok.numbers = truth!=null && planned===truth.planned && committed===truth.committed && committed>planned;
  console.log('§W-VAR-NUMBERS log{planned='+planned+',committed='+committed+'} db{'+(truth?truth.planned+','+truth.committed:'?')+'} :: '+(ok.numbers?'OK':'FAIL'));

  // ── W-VAR-FORECAST: toggle ON → committed line + Δ (forecast=1, delta>0). ──
  await toggleForecast(page); await page.waitForTimeout(400);
  const vFut = last(logs,/§DASH-VARIANCE/);
  const fOn = /forecast=1/.test(vFut);
  const delta = Number((vFut.match(/delta=(-?\d+)/)||[])[1]);
  const dashedDom = await page.evaluate(()=>document.querySelectorAll('.dash-card[data-dim="__variance"] svg path[stroke-dasharray]').length);
  ok.forecast = fOn && delta===(committed-planned) && delta>0 && dashedDom>=1;
  console.log('§W-VAR-FORECAST :: '+vFut+' dashed='+dashedDom+' :: '+(ok.forecast?'OK':'FAIL'));

  const pass = Object.values(ok).filter(Boolean).length, total = Object.keys(ok).length;
  console.log('\n§W-DASH-VARIANCE '+pass+'/'+total+' '+JSON.stringify(ok));
  if(errs.length) console.log('§PAGEERR '+errs.length+' :: '+errs.slice(0,3).join(' | '));
  await b.close(); server.close();
  process.exit(pass===total && !errs.length ? 0 : 1);
})().catch(e=>{console.error('§FATAL '+e.message);process.exit(1)});
