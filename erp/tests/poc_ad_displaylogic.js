// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// poc_ad_displaylogic.js — W-AD-DISPLAYLOGIC-LIVE (UI-unpark §1 on the real AD-UI).
// Proves ad_ui.js applies AD DisplayLogic to the live form: opening AD_Menu record 101 (Action='W')
// HIDES the action-gated FK fields whose @Action@ != W (Workflow/Task/Process/Form/InfoWindow) and SHOWS
// Window (@Action@=W). The §AD-DISPLAYLOGIC-LIVE whitebox log IS the value proof (CLAUDE.md: §-log first).
// Run: node erp/tests/poc_ad_displaylogic.js   (driver: bim-ootb playwright)
const { chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/erp.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{
  await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const br=await chromium.launch();const pg=await br.newContext().then(c=>c.newPage());
  let line=null;pg.on('console',m=>{const t=m.text();if(t.includes('§AD-DISPLAYLOGIC-LIVE'))line=t;});
  await pg.goto(`http://localhost:${port}/erp.html?db=ad_seed.db`,{waitUntil:'networkidle'});
  await pg.waitForFunction(()=>{try{return window.__erpDb.exec("SELECT 1 FROM AD_Window LIMIT 1").length>0 && window.ADUI._test.openAccordion;}catch(e){return false;}},{timeout:25000}).catch(()=>{});
  const rec=await pg.evaluate(()=>{var res=window.__erpDb.exec("SELECT * FROM AD_Menu WHERE AD_Menu_ID=101");if(!res.length)return null;var c=res[0].columns,v=res[0].values[0],r={};c.forEach((x,i)=>r[x]=v[i]);window.ADUI.hydrate&&window.ADUI.hydrate(window.__erpDb);window.ADUI._test.openAccordion('AD_Menu',105,r,'data');return{Action:r.Action,IsSummary:r.IsSummary};});
  await pg.waitForTimeout(600);
  console.log('record AD_Menu#101 = '+JSON.stringify(rec));
  console.log(line||'(no §AD-DISPLAYLOGIC-LIVE)');
  const hides=['AD_Workflow_ID','AD_Task_ID','AD_Process_ID','AD_Form_ID','AD_InfoWindow_ID'];
  const ok = !!line && rec && rec.Action==='W' && hides.every(h=>line.includes(h)) && !/AD_Window_ID\[/.test(line);
  console.log(ok?'🟢 W-AD-DISPLAYLOGIC-LIVE PASS — action=W menu hides the 5 mismatched action FKs, keeps Window (AD DisplayLogic live on the AD-UI form)':'🔴 FAIL');
  await br.close();server.close();process.exit(ok?0:1);
})().catch(e=>{console.log('🔴 ERROR '+e.message);process.exit(1);});
