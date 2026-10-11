// probe wand settings on the KLCC photo. node film/probe_v4.js
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const { chromium } = require('/home/red1/bim-ootb-psd/poc/psd-oplog/node_modules/playwright-core');
const DIST='/tmp/oplogpic_film_dist_v4',W=path.join(os.homedir(),'Videos/oplogpic_v2_work'),PHOTO=W+'/assets/KLCC_dawn_Slusarczyk_CCBY3.jpg',OUT=W+'/probe4/';
(async()=>{
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(DIST,u);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':{'.js':'text/javascript','.html':'text/html'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r));const base='http://127.0.0.1:'+srv.address().port+'/index.html';
const br=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const page=await br.newPage({viewport:{width:1366,height:853}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto(base);await page.waitForFunction(()=>window.__ed);
await page.setInputFiles('#photo',PHOTO);await page.waitForFunction(()=>__ed.ops.length>3);await page.waitForTimeout(800);
console.log(await page.evaluate(()=>JSON.stringify({W:__ed.st.W,layers:__ed.layers().map(l=>l.id+':'+l.name),keys:Object.keys(__ed.st.L[1]||{})})));
const run=async(tag,steps,g)=>{ // steps: [{x,y,tol,contig,mode}] canvas coords
 const r=await page.evaluate(([steps,s_g])=>{const e=__ed;e.clearSel&&e.clearSel();const lid=e.layers()[e.layers().length-1].id;
  for(const s of steps){ // set params through UI
   const t=document.getElementById('w-tol');t.value=s.tol;t.dispatchEvent(new Event('input',{bubbles:true}));
   const c=document.getElementById('w-contig');const isC=c.classList.contains('on');if(isC!==s.contig)c.click();
   e.wandAt(s.x,s.y,s.mode||'new');}if(s_g)e.growSel(2);
  const st=e.st,W=st.W,m=st.sel.mask;let n=0;for(let i=0;i<m.length;i++)n+=m[i];
  const rows=[0,0,0,0];// selected counts in bands of canvas y
  const bandy=[[170,300],[300,420],[420,520],[520,853]];for(let b=0;b<4;b++){let c=0;for(let y=bandy[b][0];y<bandy[b][1];y++)for(let x=0;x<W;x++)c+=m[y*W+x];rows[b]=c;}
  // overlay
  return {n,rows};
 },[steps,g]);
 // render overlay image
 const url=await page.evaluate(()=>{const e=__ed,st=e.st,W=st.W,m=st.sel.mask;const src=document.getElementById('c');const c=document.createElement('canvas');c.width=W;c.height=W;const x=c.getContext('2d');x.drawImage(src,0,0);const d=x.getImageData(0,0,W,W);for(let i=0;i<m.length;i++)if(m[i]){d.data[i*4]=255;d.data[i*4+1]*=.3;d.data[i*4+2]*=.3;}x.putImageData(d,0,0);return c.toDataURL('image/png');});
 fs.writeFileSync(OUT+tag+'.png',Buffer.from(url.split(',')[1],'base64'));console.log(tag,JSON.stringify(r));};
const cfg=JSON.parse(process.argv[2]||'[]');
for(const c of cfg)await run(c.tag,c.steps,c.g);
await br.close();srv.close();})();
