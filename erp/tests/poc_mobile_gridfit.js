// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that idempiere.html FITS a 390px phone — the gap the narrow §MOB-TOPBAR
//   witness missed. PROVES (issue: "mobile not done — #idmp-main 2145px, header buttons off-screen right"):
//     1. no horizontal PAGE scroll (document.scrollWidth == clientWidth) — the AD grid no longer balloons the
//        page; #idmp-main constrained to the viewport (the min-width:0 flex fix).
//     2. the grid is still REACHABLE — it scrolls horizontally INSIDE #idmp-content (overflow:auto), not by
//        pushing the page (which body{overflow:hidden} would clip → unreachable on touch).
//     3. the header role/home/help buttons (#idmp-switch/home/help-btn) are ON-SCREEN (breadcrumb hidden on
//        mobile, it duplicates the bottom status bar).
//   §-log first — READ tests/poc_mobile_gridfit.log before any conclusion.
// Run:  node tests/poc_mobile_gridfit.js 2>&1 | tee tests/poc_mobile_gridfit.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/idempiere.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port;
const br=await chromium.launch();const pg=await br.newPage();await pg.setViewportSize({width:390,height:844});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://localhost:${port}/idempiere.html?window=140`,{waitUntil:'networkidle'});
await pg.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)',{timeout:15000});
await pg.click('#idmp-login-users .idmp-login-user:not(.disabled)');
await pg.waitForSelector('#idmp-login-ok');await pg.click('#idmp-login-ok');await pg.waitForTimeout(1500);
const m=await pg.evaluate(()=>{var de=document.documentElement,vw=de.clientWidth;var c=document.getElementById('idmp-content');
  function on(id){var e=document.getElementById(id);if(!e)return false;var b=e.getBoundingClientRect();return b.right<=vw+1&&b.left>=-1;}
  return {pageOverflow:de.scrollWidth>vw+1, docSW:de.scrollWidth, vw:vw, mainW:Math.round(document.getElementById('idmp-main').getBoundingClientRect().width),
    contentScrolls:c?c.scrollWidth>c.clientWidth+1:false, help:on('idmp-help-btn'), home:on('idmp-home-btn'), sw:on('idmp-switch-btn')};});
await pg.screenshot({path:path.join(__dirname,'mob_topbar_fixed.png')});
console.log('§MOBILE-GRIDFIT pageOverflow='+m.pageOverflow+' docSW='+m.docSW+' mainW='+m.mainW+'/vw='+m.vw+' gridScrollsInContent='+m.contentScrolls+' btnsOnscreen=help:'+m.help+'/home:'+m.home+'/switch:'+m.sw+' pageErrors='+(errs.length?errs.join('|'):0));
const pass=!m.pageOverflow&&m.mainW<=m.vw+1&&m.contentScrolls&&m.help&&m.home&&m.sw&&errs.length===0;
console.log('§MOBILE-GRIDFIT '+(pass?'PASS':'FAIL'));
await br.close();server.close();process.exit(pass?0:1);})().catch(e=>{console.error('PROBE-ERR',e);server.close();process.exit(2);});
