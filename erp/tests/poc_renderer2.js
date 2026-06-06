// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for RENDERER #2 — a 3rd tenant (Client 12 "Odoo"), rendered by the SAME
//   AD dictionary framework, from ad_odoo.db (tests/gen_ad_odoo.js: GardenWorld frame cloned → Client 12 +
//   LIVE odoodemo data). PROVES (issue: "can a new ERP show as a new client through the existing renderer?"):
//     1. login lists the Odoo tenant user; logging in resolves client = Odoo(12) (§IDEMPIERE-LOGIN).
//     2. the Product window shows the REAL Odoo catalog (a known Odoo product name renders; rows>0).
//     3. the Graph button works on it — no docstatus → heat map by product category (§HEATMAP), the "wow".
//   §-log first — READ tests/poc_renderer2.log before any conclusion.
// Run:  node tests/poc_renderer2.js 2>&1 | tee tests/poc_renderer2.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port;
const logs=[],errs=[];const br=await chromium.launch();const pg=await br.newPage();
pg.on('console',m=>logs.push(m.text()));pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&window=140`,{waitUntil:'networkidle'});
await pg.waitForSelector('#idmp-login-users .idmp-login-user',{timeout:15000});
// pick the Odoo tenant user specifically (not System/GardenWorld)
const odooUser=await pg.$$eval('#idmp-login-users .idmp-login-user',els=>{var i=els.findIndex(e=>/Odoo Admin/.test(e.textContent));return i;});
const userList=await pg.$$('#idmp-login-users .idmp-login-user');
let clickedOdoo=false;
for(const u of userList){const t=await u.evaluate(e=>e.textContent);if(/Odoo Admin/.test(t)){await u.click();clickedOdoo=true;break;}}
await pg.waitForSelector('#idmp-login-ok');await pg.click('#idmp-login-ok');
await pg.waitForTimeout(1800);
const loginLog=logs.find(l=>l.startsWith('§IDEMPIERE-LOGIN'))||'(no login)';
// product names rendered in the grid (Odoo catalog)
const gridText=await pg.evaluate(()=>{var c=document.getElementById('idmp-content');return c?c.innerText:'';});
const odooProductSeen=/Large Desk|Storage Box|Corner Desk|Customizable Desk|Cabinet/.test(gridText);
const tabLog=logs.find(l=>/§IDEMPIERE tab=Product/.test(l))||'(no product tab)';
await pg.screenshot({path:path.join(__dirname,'renderer2_products.png')});
// Graph → heat map by category
await pg.click('#pill-kanban');await pg.waitForTimeout(1500);
const heatLog=logs.find(l=>l.startsWith('§HEATMAP'))||'(no heatmap)';
const cells=await pg.$$eval('.hm-cell',e=>e.length).catch(()=>0);
await pg.screenshot({path:path.join(__dirname,'renderer2_graph.png')});

console.log('§R2-LOGIN clickedOdoo='+clickedOdoo+' '+loginLog);
console.log('§R2-CATALOG '+tabLog+' odooProductRendered='+odooProductSeen);
console.log('§R2-GRAPH '+heatLog+' cells='+cells);
console.log('§R2-ERRS '+(errs.length?errs.join('|'):0));
const clientOdoo=/client=Odoo\(12\)/.test(loginLog);
const pass=clickedOdoo&&clientOdoo&&odooProductSeen&&/§HEATMAP by=/.test(heatLog)&&cells>1&&errs.length===0;
console.log('§RENDERER2 '+(pass?'PASS':'FAIL'));
await br.close();server.close();process.exit(pass?0:1);
})().catch(e=>{console.error('PROBE-ERR',e);server.close();process.exit(2);});
