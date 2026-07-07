// W-MPLATE-IMPORT — RETIRED 2026-07-06 (§OPEN_BUTTON_IFC_MERGE). The landing hub's #m-import-zone
// drop-IFC gesture it tested is gone by design (user: reads as an upload/privacy prompt); the same
// engine (import_own.js handleImportFile/handleImportFiles/importMultiIFC) is now reached ONLY via
// the Viewer's Open button. Live successor: viewer/tests/poc_open_button_ifc_merge.js.
// This file is now a regression guard that the removal stuck — NOT a test of import behavior.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','..');
const pup=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.db':'application/octet-stream','.ifc':'text/plain'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end('404 '+p);}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});r.end(b);});});
let pass=0,fail=0; const ck=(n,o)=>{console.log((o?'  PASS ':'  FAIL ')+n);o?pass++:fail++;};
(async()=>{
 await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const br=await pup.launch({headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const pg=await br.newPage();
 const logs=[]; pg.on('console',m=>logs.push(m.text()));
 pg.on('pageerror',e=>console.log('  ERR '+String(e).slice(0,200)));
 await pg.goto(`http://localhost:${port}/index.html?home=1`,{waitUntil:'load',timeout:60000});
 await pg.waitForSelector('#portal.active',{timeout:8000}).catch(()=>{});
 await pg.evaluate(()=>window.openHub());
 await new Promise(r=>setTimeout(r,1000));
 ck('hub drop-zone REMOVED (was #m-import-zone)', await pg.evaluate(()=>!document.getElementById('m-import-zone')));
 ck('hub file-input REMOVED (was #m-import-file)', await pg.evaluate(()=>!document.getElementById('m-import-file')));
 ck('wireImportZone function REMOVED (dead code cleaned up)', await pg.evaluate(()=>typeof window.wireImportZone!=='function'));
 ck('handleImportFile/handleImportFiles engine still loaded (reused by Open button now)', await pg.evaluate(()=>typeof window.handleImportFile==='function' && typeof window.handleImportFiles==='function'));
 console.log('\n  §W-MPLATE-IMPORT-RETIRED '+pass+'/'+(pass+fail)+(fail?' (FAIL)':' PASS'));
 await br.close();srv.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
