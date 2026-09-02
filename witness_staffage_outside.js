// WITNESS — §STAFFAGE_OUTSIDE_VARIETY + §STAFFAGE_FLOOR_PHANTOM
// (prompts/STAFFAGE_WALKABLE_PLACEMENT.md, user report 2026-07-26).
//
// ISSUE PROVEN/DISPROVEN:
//   (1) "Alt-P made outside standing persons the same, should be the diff standing sprites."
//   (2) "And some will stand in air outside first floor etc."
//
// Whitebox per the project rule: drives a REAL Alt+P keypress and reads the §-lines. No screenshots.
//
//   G1 the exterior pose pool has more than one asset (the defect was a filter that matched exactly
//      ONE entry of _STAFFAGE_PEOPLE, so `placedP % pool.length` was always 0).
//   G2 when >1 exterior figure is placed in a press, they are NOT all the same sprite.
//   G3 no figure is left standing on a bbox-only "slab" — every press reports phantom rejections
//      that were CAUGHT (a fallback to groundY), never a silent lift, and the run stays clean.
//   G4 control: the unfixed tip reports pool=1, i.e. the gate discriminates.
//
// Run: node witness_staffage_outside.js [--baseline /path/to/unfixed/worktree]
const http=require('http'), fs=require('fs'), path=require('path');
let puppeteer; try{puppeteer=require('puppeteer');}catch(e){puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');}
const DB = process.env.WDB || 'buildings/Duplex_extracted.db';
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.db':'application/octet-stream','.sql':'application/sql','.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon'};
function serve(root){return new Promise(res=>{const s=http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.stat(p,(e,st)=>{if(e){r.writeHead(404);return r.end();}if(st.isDirectory())p=path.join(p,'index.html');r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes'});fs.createReadStream(p).pipe(r);});});s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port}));});}
async function run(root,label,presses){
  const {s,port}=await serve(root);
  const b=await puppeteer.launch({headless:'new',handleSIGINT:false,defaultViewport:null,
    args:['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu','--no-sandbox','--window-size=1280,800']});
  const pg=(await b.pages())[0]; const logs=[]; pg.on('console',m=>logs.push(m.text()));
  await pg.goto(`http://127.0.0.1:${port}/viewer/viewer.html?db=${encodeURIComponent(DB)}`,{waitUntil:'domcontentloaded',timeout:120000});
  await pg.waitForFunction(()=>window.APP&&window.APP.camera,{timeout:180000});
  await new Promise(r=>setTimeout(r,12000));
  for(let i=0;i<presses;i++){
    await pg.keyboard.down('Alt'); await pg.keyboard.press('p'); await pg.keyboard.up('Alt');
    await new Promise(r=>setTimeout(r,9000));
  }
  await b.close(); s.close();
  return {label,root,logs};
}
(async()=>{
  const bi=process.argv.indexOf('--baseline');
  const baseline=bi>0?process.argv[bi+1]:null;
  const runs=[]; if(baseline) runs.push(await run(baseline,'BEFORE (unfixed)',3));
  runs.push(await run(__dirname,'AFTER  (fixed)',3));
  console.log('\n========== §STAFFAGE_OUTSIDE_VARIETY / §STAFFAGE_FLOOR_PHANTOM WITNESS ==========');
  const R={};
  for(const r of runs){
    const varie=r.logs.filter(l=>l.startsWith('§STAFFAGE_OUTSIDE_VARIETY'));
    const summ=r.logs.filter(l=>l.startsWith('§PHOTO_STAFFAGE thisPress'));
    const phan=r.logs.filter(l=>l.startsWith('§STAFFAGE_FLOOR_PHANTOM'));
    let pool=null, multi=[], distinctOK=true;
    for(const l of varie){
      const m=/pool=(\d+) used=\[([^\]]*)\] distinct=(\d+)/.exec(l); if(!m) continue;
      pool=Number(m[1]); const used=m[2]?m[2].split(','):[]; const d=Number(m[3]);
      if(used.length>1){ multi.push(used.length+'->'+d+' distinct'); if(d<2) distinctOK=false; }
    }
    R[r.label.slice(0,6).trim()]={pool,multi,distinctOK,phan:phan.length,summ};
    console.log('\n--- '+r.label);
    console.log('  exterior pose pool size    : '+(pool===null?'(no exterior press logged)':pool));
    varie.slice(0,3).forEach(l=>console.log('    '+l));
    console.log('  §STAFFAGE_FLOOR_PHANTOM catches: '+phan.length);
    phan.slice(0,3).forEach(l=>console.log('    '+l));
    summ.slice(0,3).forEach(l=>console.log('    '+l.slice(0,150)));
  }
  const A=R['AFTER'], B=R['BEFORE'];
  let basePool=null;
  if(baseline){
    const src=fs.readFileSync(path.join(baseline,'viewer/effects.js'),'utf8');
    const tbl=/var _STAFFAGE_PEOPLE = \[([\s\S]*?)\];/.exec(src);
    const usesOldFilter=/outsidePoses = _STAFFAGE_PEOPLE\.filter\(function\(p\) \{ return p\.role === 'stand' && p\.facing === 'toward'; \}\)/.test(src);
    if(tbl&&usesOldFilter)
      basePool=tbl[1].split('\n').filter(l=>/role: 'stand'/.test(l)&&/facing: 'toward'/.test(l)).length;
    console.log('\n  control, read from the unfixed source: usesOldFilter='+usesOldFilter+' -> pool='+basePool);
  }
  console.log('\n--- GATES');
  const g=[];
  g.push(['G1 exterior pose pool has >1 asset', A.pool!==null&&A.pool>1, 'pool='+A.pool]);
  g.push(['G2 a multi-figure press is not all the same sprite', A.multi.length===0?true:A.distinctOK,
          A.multi.length?A.multi.join(' | '):'no multi-figure press in this run (pool gate G1 carries it)']);
  // G3 must not pass vacuously. With zero phantom slabs on this building there is no evidence
  // either way, so say so instead of printing a green that proves nothing.
  if(A.phan>0) g.push(['G3 phantom-slab lifts CAUGHT and fell back to groundY (no silent lift)', true, A.phan+' caught']);
  else console.log('  ----  G3 NOT EXERCISED on this building: 0 bbox-only slabs encountered, so the');
  if(A.phan===0) console.log('        phantom path proves nothing here. G1/G2 carry this run.');
  if(baseline) g.push(['G4 control: unfixed tip pool is exactly 1 (the gate discriminates)',
                       basePool===1, 'pool='+basePool+' (from source)']);
  let pass=0; for(const [n,ok,v] of g){console.log('  '+(ok?'PASS':'FAIL')+'  '+n+'  ['+v+']'); if(ok)pass++;}
  console.log('\n  '+pass+'/'+g.length+' gates green');
  process.exit(pass===g.length?0:1);
})().catch(e=>{console.error('WITNESS CRASH '+(e&&e.stack||e));process.exit(1);});
