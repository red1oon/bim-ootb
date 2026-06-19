// W-MPLATE-IMPORT — drop-own-IFC in the Matrix hub actually imports + opens the viewer.
// Feeds a REAL IFC through the verbatim-extracted landing pipeline (import_own.js → import_worker →
// buildImportDBs → IDB cache → openProject). Whitebox §-log + window.open capture.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/tmp/wt-mplate';
const IFC=path.join(process.env.HOME,'bim-compiler/reference/residential/Ifc4_WallElementedCase.ifc');
const pup=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.db':'application/octet-stream','.ifc':'text/plain'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index2.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end('404 '+p);}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});r.end(b);});});
let pass=0,fail=0; const ck=(n,o)=>{console.log((o?'  PASS ':'  FAIL ')+n);o?pass++:fail++;};
(async()=>{
 await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const br=await pup.launch({headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const pg=await br.newPage();
 const logs=[]; pg.on('console',m=>{const t=m.text();if(/§|Failed|error/i.test(t))logs.push(t);});
 pg.on('pageerror',e=>console.log('  ERR '+String(e).slice(0,200)));
 await pg.evaluateOnNewDocument(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return{focus(){}}};});
 await pg.goto(`http://localhost:${port}/index2.html?home=1`,{waitUntil:'load',timeout:60000});
 await pg.waitForSelector('#portal.active',{timeout:8000}).catch(()=>{});
 // open the hub directly
 await pg.evaluate(()=>window.openHub());
 await pg.waitForSelector('#m-import-zone',{timeout:8000}).catch(()=>{});
 ck('hub import zone present + wired', await pg.evaluate(()=>!!document.getElementById('m-import-zone') && typeof window.handleImportFile==='function'));
 ck('buildImportDBs (real landing builder) loaded', await pg.evaluate(()=>typeof window.buildImportDBs==='function'));
 // feed the real IFC
 const b64=fs.readFileSync(IFC).toString('base64');
 await pg.evaluate(async(b64,name)=>{
   const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
   const file=new File([u],name,{type:'application/octet-stream'});
   await window.handleImportFile(file);
 }, b64, 'Ifc4_WallElementedCase.ifc');
 // wait for save + auto-open (worker parse can take a few s)
 await pg.waitForFunction(()=>window.__opened.some(u=>/import:\/\//.test(u)),{timeout:45000}).catch(()=>{});
 const opened=await pg.evaluate(()=>window.__opened);
 ck('§IMPORT_SAVED logged', logs.some(l=>/§IMPORT_SAVED/.test(l)));
 ck('§IMPORT_AUTO_OPEN logged', logs.some(l=>/§IMPORT_AUTO_OPEN/.test(l)));
 ck('opened viewer with import:// db + ghost', opened.some(u=>/viewer\/viewer\.html\?db=import%3A%2F%2F.*ghost=1/.test(u)));
 // confirm it actually landed in the import IDB
 const stored=await pg.evaluate(()=>new Promise(res=>{const rq=indexedDB.open('bim_ootb_imports');rq.onsuccess=()=>{const db=rq.result;if(!db.objectStoreNames.contains('buildings'))return res(0);const c=db.transaction('buildings','readonly').objectStore('buildings').count();c.onsuccess=()=>res(c.result);c.onerror=()=>res(-1);};rq.onerror=()=>res(-1);}));
 ck('imported project persisted in bim_ootb_imports IDB', stored>=1);
 console.log('\n  §W-MPLATE-IMPORT '+pass+'/'+(pass+fail)+(fail?' (FAIL)':' PASS'));
 console.log('  import logs:'); logs.filter(l=>/§(IMPORT|DISC|IFC|SQL)|Failed/i.test(l)).slice(0,12).forEach(l=>console.log('    '+l));
 await br.close();srv.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
