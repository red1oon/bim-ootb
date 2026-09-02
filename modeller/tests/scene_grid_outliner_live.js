// W-SCENE-GRID-OUTLINER — the scene GridHelper lies FLAT on XY (Z-up world, was a vertical wall) + the
// Outliner shows the PRODUCT NAME (e.g. 'Bed King'), not the bare ifc_class. Math/DOM asserts, no visuals.
const http=require('http'),fs=require('fs'),path=require('path');const VIEWER=require('path').join(__dirname,'..');
const pup=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.map':'application/json'};
const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/modeller.html';fs.readFile(path.join(VIEWER,p),(e,b)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b)})});
(async()=>{await new Promise(r=>s.listen(0,r));const port=s.address().port;
const br=await pup.launch({headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await br.newPage();pg.on('pageerror',e=>console.log('ERR',String(e).slice(0,120)));
await pg.goto(`http://localhost:${port}/modeller.html`,{waitUntil:'load',timeout:60000});
await pg.waitForFunction('window.Bonsai&&window.Bonsai.library&&window.Bonsai.library.ready&&window.A',{timeout:30000}).catch(()=>{});
await pg.evaluate(()=>window.Bonsai.library.ready());
const r=await pg.evaluate(async()=>{
 const THREE=window.THREE;
 // 1) scene GridHelper flat on XY?
 const gh=window.A.scene.children.find(o=>o.type==='GridHelper');
 const bb=new THREE.Box3().setFromObject(gh);
 const gridZext=+(bb.max.z-bb.min.z).toFixed(3), gridYext=+(bb.max.y-bb.min.y).toFixed(2);
 // 2) Outliner product name?
 window.Bonsai.grid.define({xs:[0,4],ys:[0,3]});window.Bonsai.oplog.clear();
 document.getElementById('b-insert').click();await window.Bonsai.library.ready();
 const bed=[...document.querySelectorAll('#ins-body .ins-c')].find(b=>/bed king/i.test(b.textContent+b.title));bed.click();
 const c=document.getElementById('c'),rect=c.getBoundingClientRect();const v=new THREE.Vector3(2,1.5,0).project(window.A.camera);
 c.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:rect.left+(v.x+1)/2*rect.width,clientY:rect.top+(1-v.y)/2*rect.height,bubbles:true}));
 for(let i=0;i<60&&window.Bonsai.oplog.length<1;i++)await new Promise(r=>setTimeout(r,50));
 if(window.Bonsai.outliner)window.Bonsai.outliner.refresh();
 const rows=[...document.querySelectorAll('#bonsai-outliner [data-fid]')].map(d=>d.textContent.replace(/\s+/g,' ').trim());
 return {gridZext,gridYext,gridRotX:+gh.rotation.x.toFixed(2),outlinerRows:rows};
});
await br.close();s.close();
console.log(JSON.stringify(r));
const gridFlat=r.gridZext<0.01 && r.gridYext>10;   // grid spans XY (Y wide), ~0 in Z = lying flat
const nameOk=r.outlinerRows.some(t=>/Bed King/i.test(t));
console.log('SCENE-GRID flat='+gridFlat+' (Zext='+r.gridZext+' rotX='+r.gridRotX+')  OUTLINER name='+nameOk+' rows='+JSON.stringify(r.outlinerRows));
console.log('VERDICT '+(gridFlat&&nameOk?'PASS':'FAIL'));
process.exit(gridFlat&&nameOk?0:1)})();
