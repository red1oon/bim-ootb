// Witness: both resets now show an OK feedback dialog summarizing what happened (before reload). Sandboxed.
'use strict';
var http=require('http'),fs=require('fs'),path=require('path');
var {chromium}=require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT=path.join(__dirname,'..');
var MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.db':'application/octet-stream','.jpg':'image/jpeg','.png':'image/png'};
var server=http.createServer((req,res)=>{var f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end('404');}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b);});});
(async()=>{
  await new Promise(r=>server.listen(0,r));var port=server.address().port,base='http://localhost:'+port,pageErrors=[],dialogs=[];
  var browser=await chromium.launch({args:['--no-sandbox']});var page=await browser.newPage();
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('dialog',d=>{dialogs.push({type:d.type(),msg:d.message()});d.accept();});
  var boot=()=>page.waitForFunction(()=>!!window.__idmpDb&&!!window.SQL&&!!window.IdmpSession,null,{timeout:30000});
  await page.goto(base+'/idempiere.html',{waitUntil:'networkidle'});await boot();
  // add a born tenant so the "kept" count is non-zero + meaningful
  await page.evaluate(async()=>{var db=window.__idmpDb;
    function clone(t,pk,v,ov){var info=db.exec('PRAGMA table_info("'+t+'")')[0].values,cols=info.map(r=>r[1]);var r=db.exec('SELECT * FROM "'+t+'" WHERE '+pk+'='+v);if(!r.length)return;var rec={};r[0].columns.forEach((c,i)=>rec[c]=r[0].values[0][i]);var lc={};Object.keys(rec).forEach(k=>lc[k.toLowerCase()]=k);Object.keys(ov).forEach(k=>rec[lc[k.toLowerCase()]||k]=ov[k]);try{db.run('INSERT INTO "'+t+'" ('+cols.map(c=>'"'+c+'"').join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',cols.map(c=>rec[c]));}catch(e){}}
    clone('AD_Client','AD_Client_ID',11,{ad_client_id:17,value:'AcmeCo',name:'AcmeCo'});});
  // SURGICAL reset → expect confirm + OK-summary dialog, then reload
  await page.click('#idmp-sysmon-link');await page.waitForSelector('#sm-root [data-sm-reset-seed]',{timeout:8000});
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle',timeout:30000}),page.click('#sm-root [data-sm-reset-seed]')]);await boot();
  var surgical=dialogs.slice(); dialogs.length=0;
  // NUCLEAR reset → expect confirm + OK-summary dialog
  await page.click('#idmp-sysmon-link');await page.waitForSelector('#sm-root [data-sm-reset]',{timeout:8000});
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle',timeout:30000}),page.click('#sm-root [data-sm-reset]')]);
  var nuclear=dialogs.slice();

  console.log('\n=== RESET FEEDBACK DIALOGS ===');
  console.log('SURGICAL:'); surgical.forEach(d=>console.log('  ['+d.type+'] '+JSON.stringify(d.msg)));
  console.log('NUCLEAR:'); nuclear.forEach(d=>console.log('  ['+d.type+'] '+JSON.stringify(d.msg)));
  console.log('pageErrors='+pageErrors.length+'\n');
  var pass=0,fail=0;function ck(o,m){(o?pass++:fail++);console.log((o?'  ✓ ':'  ✗ FAIL ')+m);}
  var sAlert=surgical.find(d=>d.type==='alert'), nAlert=nuclear.find(d=>d.type==='alert');
  ck(surgical.some(d=>d.type==='confirm'),'surgical shows a confirm before acting');
  ck(!!sAlert,'surgical shows an OK feedback dialog AFTER (before reload)');
  ck(sAlert&&/restored to their initial/.test(sAlert.msg)&&/kept: 1/.test(sAlert.msg),'surgical summary names what happened + kept count=1 (the born tenant)');
  ck(nuclear.some(d=>d.type==='confirm'),'nuclear shows a confirm before acting');
  ck(!!nAlert,'nuclear shows an OK feedback dialog AFTER');
  ck(nAlert&&/Cleared everything local/.test(nAlert.msg),'nuclear summary names the full wipe');
  ck(pageErrors.length===0,'0 pageerrors');
  console.log('\n  TOTAL '+pass+' pass / '+fail+' fail');
  await browser.close();server.close();process.exit(fail?1:0);
})();
