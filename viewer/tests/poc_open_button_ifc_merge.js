// §OPEN_BUTTON_IFC_MERGE — the Viewer's Open button now accepts native .db AND raw IFC (single or
// multi — 2+ IFCs silently merge into one building), reclaiming import_own.js's engine (previously
// only reachable from the landing hub's now-removed #m-import-zone — see morpheus_import_live.js).
// Drives the REAL production entry point APP._routeOpenPicks (the same function A.openModelDb calls
// once the native file-picker resolves — that dialog itself can't be automated, everything downstream
// is unmodified production code: parse → merge → cache write → same-tab navigate → reload → render).
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','..');
const IFC_A=path.join(process.env.HOME,'bim-compiler/reference/residential/Ifc2x3_Duplex_Architecture.ifc');
const IFC_B=path.join(process.env.HOME,'bim-compiler/reference/residential/Ifc2x3_Duplex_MEP.ifc');
const pup=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.db':'application/octet-stream','.ifc':'text/plain'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/viewer/viewer.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end('404 '+p);}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});r.end(b);});});
let pass=0,fail=0; const ck=(n,o)=>{console.log((o?'  PASS ':'  FAIL ')+n);o?pass++:fail++;};
(async()=>{
 await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const br=await pup.launch({headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const pg=await br.newPage();
 const logs=[]; pg.on('console',m=>logs.push(m.text()));
 const pageErrors=[]; pg.on('pageerror',e=>pageErrors.push(String(e)));

 await pg.goto(`http://localhost:${port}/viewer/viewer.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForFunction(()=>window.APP && typeof window.APP._routeOpenPicks==='function',{timeout:20000}).catch(()=>{});

 ck('import_own.js loaded — no §LOAD_FAIL', !logs.some(l=>l.includes('LOAD_FAIL')));
 ck('_fromViewerHost=true (asset paths collapsed to same-dir)', await pg.evaluate(()=>window._fromViewerHost===true));
 ck('APP._routeOpenPicks wired (widened Open picker)', await pg.evaluate(()=>typeof window.APP._routeOpenPicks==='function'));
 ck('handleImportFiles reachable (reused engine, not reinvented)', await pg.evaluate(()=>typeof window.handleImportFiles==='function'));

 // Real 2-discipline merge (ARC+MEP, same building) through the real Open-button entry point.
 const b64A=fs.readFileSync(IFC_A).toString('base64'), b64B=fs.readFileSync(IFC_B).toString('base64');
 const callResult = await pg.evaluate(async (bA,bB)=>{
   function toFile(b64,name){const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new File([u],name,{type:'application/octet-stream'});}
   try { await window.APP._routeOpenPicks([toFile(bA,'Ifc2x3_Duplex_Architecture.ifc'), toFile(bB,'Ifc2x3_Duplex_MEP.ifc')]); return {ok:true}; }
   catch(e){ return {ok:false, error:e.message}; }
 }, b64A, b64B);
 ck('APP._routeOpenPicks(2 IFCs) resolved without throwing', callResult.ok);

 await pg.waitForFunction(()=>location.search.includes('db=import'),{timeout:45000}).catch(()=>{});
 const urlAfterMerge = pg.url();
 ck('same-tab navigate (NOT a new window) to merged import:// db', /db=import%3A%2F%2F.*ghost=1/.test(urlAfterMerge));
 ck('§MULTI_IMPORT_DONE (both files merged, one building)', logs.some(l=>/§MULTI_IMPORT_DONE.*files=2/.test(l)));
 ck('§OPEN_PROJECT_SAMETAB (not §OPEN_POPUP_BLOCKED / window.open)', logs.some(l=>l.includes('§OPEN_PROJECT_SAMETAB')));

 // Let the reloaded page (new import:// db) actually boot the merged scene.
 await pg.waitForFunction(()=>window.APP && window.APP.scene,{timeout:20000}).catch(()=>{});
 await new Promise(r=>setTimeout(r,3000));
 const meshCount = await pg.evaluate(()=>window.APP && window.APP.scene ? window.APP.scene.children.length : -1);
 ck('reloaded viewer rendered the merged scene (children>0)', meshCount>0);
 ck('zero page errors across the whole flow', pageErrors.length===0);

 console.log('\n  §W-OPEN-BUTTON-IFC-MERGE '+pass+'/'+(pass+fail)+(fail?' (FAIL)':' PASS'));
 if (fail) { console.log('  logs:'); logs.filter(l=>/§|error/i.test(l)).slice(-20).forEach(l=>console.log('    '+l)); console.log('  pageErrors:', pageErrors); }
 await br.close();srv.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
