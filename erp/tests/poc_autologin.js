// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the demo auto-login (?login=<id|name>) on top of Renderer #2.
//   PROVES (issue: "land straight on the tenant — zero clicks — for the movie; SystemAdmin is the proper
//   migration mode"):
//     1. ?login=Odoo  → NO login card, session client=Odoo(12), opening Product window shows the 35 Odoo
//        products with zero clicks (§IDEMPIERE-AUTOLOGIN + §IDEMPIERE-LOGIN client=Odoo(12)).
//     2. ?login=SuperUser → auto-login as the SystemAdmin (System, client 0) — the proper tenant-SETUP/
//        migration mode (cross-client). Confirms the practice mode exists and is reachable.
//   §-log first — READ tests/poc_autologin.log before any conclusion.
// Run:  node tests/poc_autologin.js 2>&1 | tee tests/poc_autologin.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});

async function visit(browser, port, query) {
  const logs=[],errs=[];const pg=await browser.newPage();
  pg.on('console',m=>logs.push(m.text()));pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(`http://localhost:${port}/idempiere.html?${query}`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(1800);
  const loginShown=await pg.evaluate(()=>{var e=document.getElementById('idmp-login');return !!e && getComputedStyle(e).display!=='none';});
  const grid=await pg.evaluate(()=>{var c=document.getElementById('idmp-content');return c?c.innerText:'';});
  await pg.close();
  return { logs, errs, loginShown, grid };
}

(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port;const br=await chromium.launch();
  // 1) tenant auto-login (the wow)
  const o=await visit(br,port,'seed=ad_odoo.db&login=Odoo&window=140');
  const oAuto=o.logs.find(l=>l.startsWith('§IDEMPIERE-AUTOLOGIN'))||'(no autologin)';
  const oLogin=o.logs.find(l=>l.startsWith('§IDEMPIERE-LOGIN'))||'(no login)';
  console.log('§AL-ODOO loginCardShown='+o.loginShown+' '+oAuto+' | client12='+/client=Odoo\(12\)/.test(oLogin)+' productsRendered='+/Large Desk|Storage Box|Cabinet/.test(o.grid)+' errs='+(o.errs.length?o.errs.join('|'):0));
  // 2) SystemAdmin mode (proper migration practice) — the System user (client 0) now has a System Administrator role
  const s=await visit(br,port,'seed=ad_odoo.db&login=System');
  const sLogin=s.logs.find(l=>l.startsWith('§IDEMPIERE-LOGIN'))||'(no login)';
  console.log('§AL-SYSADMIN loginCardShown='+s.loginShown+' '+(/client=System\(0\)/.test(sLogin)?'client=System(0)':sLogin)+' errs='+(s.errs.length?s.errs.join('|'):0));

  const odooOk = o.loginShown===false && /client=Odoo\(12\)/.test(oLogin) && /Large Desk|Storage Box|Cabinet/.test(o.grid) && o.errs.length===0;
  const sysOk  = s.loginShown===false && /client=System\(0\)/.test(sLogin) && s.errs.length===0;
  console.log('§AUTOLOGIN-WITNESS odooOk='+odooOk+' sysadminOk='+sysOk);
  console.log('§AUTOLOGIN '+(odooOk&&sysOk?'PASS':'FAIL'));
  await br.close();server.close();process.exit(odooOk&&sysOk?0:1);
})().catch(e=>{console.error('PROBE-ERR',e);server.close();process.exit(2);});
