const http=require('http'),fs=require('fs'),path=require('path');
const VIEWER=path.join('/tmp/wt-bonsai','viewer');
const puppeteer=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/modeller.html';fs.readFile(path.join(VIEWER,p),(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{
  await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const br=await puppeteer.launch({headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
  const pg=await br.newPage(); await pg.setViewport({width:1280,height:800});
  pg.on('pageerror',e=>console.log('ERR '+String(e).slice(0,200)));
  await pg.goto(`http://localhost:${port}/modeller.html`,{waitUntil:'load',timeout:60000});
  await pg.waitForFunction('window.__sceneReady===true',{timeout:60000});
  await pg.evaluate(async()=>{
    Bonsai.grid.define({xs:[0,4,8],ys:[0,3,6],xlabels:['A','B','C'],ylabels:['1','2','3']});
    Bonsai.grid.show(true);
    Bonsai.oplog.clear();
    const w=await Bonsai.oplog.commit({op_type:'GEOM_EXTRUDE_POLY',parameters:{profile:{points:[[0,0],[4,0],[4,0.2],[0,0.2]]},depth:3}},{color:0x9fb4c8});
    Bonsai.select(w.id);
    await Bonsai.oplog.commit({op_type:'GEOM_CUT',parameters:{parent:w.id,void:{c1:[1,-1,1],c2:[2,1,2]}}},{color:0x9fd6b4});
    // a second wall on gridline B->C so the Outliner shows two walls
    Bonsai.sketch && Bonsai.sketch.reset && Bonsai.sketch.reset();
    await Bonsai.oplog.commit({op_type:'GEOM_EXTRUDE_POLY',parameters:{profile:{points:[[4,0],[8,0],[8,0.2],[4,0.2]]},depth:3}},{color:0x9fb4c8});
  });
  await pg.evaluate(()=>new Promise(r=>setTimeout(r,400)));
  const outPng='/tmp/wt-bonsai/viewer/modeller_shot.png';
  await pg.screenshot({path:outPng});
  console.log('SHOT '+outPng);
  await br.close(); server.close();
})();
