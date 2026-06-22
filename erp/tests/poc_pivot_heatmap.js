// Whitebox §-witness — PIVOT HEATMAP (W-PIVOT-HEATMAP, this lane). §SPEC: pivot_lens.html.
//   Each data cell is tinted blue by its share of the biggest cell (darker = higher) — the SAME count/sum the
//   cell already shows (NON-INVENT). Totals + row labels stay plain so they never dominate the heat.
//   Proves:
//     W-HEAT-CELLS    : data cells carry .pv-heat with an rgba background; §renderPivot heatMax>0.
//     W-HEAT-GRADIENT : the tint scales with value — the bigger cell is darker (higher alpha) than a smaller one.
//     W-HEAT-PLAIN    : the totals row keeps NO heat tint (stays plain).
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT = path.join(__dirname, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.mjs':'text/javascript'};
const server = http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/pivot_lens.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b)})});
const alpha = (bg)=>{const m=/rgba?\([^)]*?,\s*([\d.]+)\s*\)/.exec(bg||'');return m?Number(m[1]):0;};

(async()=>{
  const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const b=await chromium.launch();const page=await (await b.newContext()).newPage();
  const logs=[],errs=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
  let ok={};

  // load the pivot standalone over the real tenant seed (Sales Orders, client 11) — auto-picks row/col fields.
  await page.goto(`http://localhost:${port}/pivot_lens.html?db=ad_seed.db&table=c_order&client=11`,{waitUntil:'networkidle'});
  await page.waitForSelector('.pv-table td.pv-heat',{timeout:15000});

  // ── W-HEAT-CELLS: heat cells exist, each has an rgba background; §-log heatMax>0. ──
  const heated = await page.evaluate(()=>[].map.call(document.querySelectorAll('.pv-table td.pv-heat'),td=>({t:td.textContent,bg:td.style.background})));
  const renderLog = logs.filter(l=>/renderPivot/.test(l)).pop()||'';
  const heatMax = Number((renderLog.match(/heatMax=(\d+)/)||[])[1]);
  ok.cells = heated.length>0 && heated.every(h=>/rgba/.test(h.bg)) && heatMax>0;
  console.log('§W-HEAT-CELLS heated='+heated.length+' :: '+renderLog+' :: '+(ok.cells?'OK':'FAIL'));

  // ── W-HEAT-GRADIENT: bigger value → darker (higher alpha). ──
  const withVal = heated.map(h=>({v:Number(String(h.t).replace(/[^\d.-]/g,''))||0, a:alpha(h.bg)})).filter(x=>x.v>0);
  const maxCell = withVal.reduce((m,x)=>x.v>m.v?x:m, withVal[0]||{v:0,a:0});
  const minCell = withVal.reduce((m,x)=>x.v<m.v?x:m, withVal[0]||{v:0,a:1});
  // if every data cell shares one value there's no gradient to prove — accept the single-tone case honestly.
  ok.gradient = withVal.length>0 && (maxCell.v===minCell.v ? maxCell.a>0 : maxCell.a>minCell.a);
  console.log('§W-HEAT-GRADIENT max{v='+maxCell.v+',a='+maxCell.a+'} min{v='+minCell.v+',a='+minCell.a+'} :: '+(ok.gradient?'OK':'FAIL'));

  // ── W-HEAT-PLAIN: the totals row carries NO heat tint. ──
  const totalHeated = await page.evaluate(()=>document.querySelectorAll('.pv-table tr.total-row td.pv-heat').length);
  ok.plain = totalHeated===0;
  console.log('§W-HEAT-PLAIN totalRowHeatCells='+totalHeated+' :: '+(ok.plain?'OK':'FAIL'));

  const pass=Object.values(ok).filter(Boolean).length, total=Object.keys(ok).length;
  console.log('\n§W-PIVOT-HEATMAP '+pass+'/'+total+' '+JSON.stringify(ok));
  if(errs.length) console.log('§PAGEERR '+errs.length+' :: '+errs.slice(0,3).join(' | '));
  await b.close(); server.close();
  process.exit(pass===total && !errs.length ? 0 : 1);
})().catch(e=>{console.error('§FATAL '+e.message);process.exit(1)});
