// §FLYTHRU_BENCH — R-tree vs in-memory arithmetic, measured before committing to either.
// User: "measure both before committing". Two jobs, both timed on the REAL Hospital model:
//   A. CANDIDATE PICK — which elements are near the camera?
//   B. OBSCURITY      — which elements block a camera->endpoint sightline?
// Each is run as (1) a SQL R-tree query and (2) a plain JS pass over the metadata already in memory.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:1800000,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.APP&&window.APP.dbQuery&&window.APP.flythruFrameMap,{timeout:240000});
  const parts = await p.evaluate(()=> (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta')||[]).map(r=>r[0]));
  for (const bb of parts) await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
  let stable=0;
  for (let i=0;i<400;i++){ const st=await p.evaluate(()=> (window.APP.status&&window.APP.status.textContent)||'');
    const m=st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if(!m||m[1].replace(/,/g,'')===m[2].replace(/,/g,'')){ if(++stable>=4) break; } else stable=0; await sleep(3000); }
  await sleep(5000);

  const out = await p.evaluate(async () => {
    const A = window.APP, T = window.THREE, R = {};
    const q = (sql) => { try { return A.dbQuery(sql) || []; } catch (e) { return null; } };
    R.nElements = (q('SELECT COUNT(*) FROM element_transforms')[0]||[0])[0];

    // Build the R-tree if the viewer has not already (measure.js does it lazily on clash use).
    let hasRtree = !!q("SELECT name FROM sqlite_master WHERE name='elements_rtree'").length;
    const tBuild0 = performance.now();
    if (!hasRtree) {
      try {
        A.db.run("CREATE VIRTUAL TABLE IF NOT EXISTS elements_rtree USING rtree(id,minX,maxX,minY,maxY,minZ,maxZ)");
        A.db.run("BEGIN");
        A.db.run("INSERT INTO elements_rtree SELECT rowid, center_x-bbox_x/2, center_x+bbox_x/2, center_y-bbox_y/2, center_y+bbox_y/2, center_z-bbox_z/2, center_z+bbox_z/2 FROM element_transforms");
        A.db.run("COMMIT");
        hasRtree = true;
      } catch (e) { R.rtreeBuildErr = e.message; }
    }
    R.rtreeBuildMs = +(performance.now() - tBuild0).toFixed(0);
    R.hasRtree = hasRtree;

    // In-memory boxes, straight from the metadata the viewer already holds — no DB at all.
    const boxes = [];
    const push = (map, idxOf) => { for (const id in (map||{})) { const arr = map[id];
      for (let i=0;i<arr.length;i++){ const md=arr[i]; if(!md) continue;
        boxes.push({ bx:+md.bx||0, by:+md.by||0, bz:+md.bz||0 }); } } };
    push(A._instanceMeta); push(A._batchMeta);
    R.nBoxesInMemory = boxes.length;

    // Real DB envelope, for query windows that actually hit rows.
    const e = q('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms')[0];
    const cx=(+e[0]+ +e[1])/2, cy=(+e[2]+ +e[3])/2, cz=(+e[4]+ +e[5])/2;

    // ── A. CANDIDATE PICK: elements within a 30m box around a point. 200 queries.
    const N = 200, RAD = 30;
    let t0 = performance.now(), hitsSql = 0;
    for (let i=0;i<N;i++){ const ox=cx+(i%20)*2-20, oy=cy+(i%13)*3-20, oz=cz+(i%7)*2-7;
      const r = q(`SELECT COUNT(*) FROM elements_rtree WHERE maxX>=${ox-RAD} AND minX<=${ox+RAD} AND maxY>=${oy-RAD} AND minY<=${oy+RAD} AND maxZ>=${oz-RAD} AND minZ<=${oz+RAD}`);
      hitsSql += (r && r[0]) ? r[0][0] : 0; }
    R.pickSqlMs = +(performance.now()-t0).toFixed(1); R.pickSqlHits = hitsSql;

    // Same 200 picks, plain JS over rows already fetched once.
    const rows = q('SELECT center_x,center_y,center_z,bbox_x,bbox_y,bbox_z FROM element_transforms');
    const arr = new Float64Array(rows.length*6);
    for (let i=0;i<rows.length;i++){ for(let k=0;k<6;k++) arr[i*6+k]=+rows[i][k]; }
    t0 = performance.now(); let hitsJs=0;
    for (let i=0;i<N;i++){ const ox=cx+(i%20)*2-20, oy=cy+(i%13)*3-20, oz=cz+(i%7)*2-7;
      for (let j=0;j<rows.length;j++){ const o=j*6;
        if (Math.abs(arr[o]-ox)<=RAD+arr[o+3]/2 && Math.abs(arr[o+1]-oy)<=RAD+arr[o+4]/2 && Math.abs(arr[o+2]-oz)<=RAD+arr[o+5]/2) hitsJs++; } }
    R.pickJsMs = +(performance.now()-t0).toFixed(1); R.pickJsHits = hitsJs;

    // ── B. OBSCURITY: which boxes intersect a camera->endpoint segment? 200 sightlines,
    // approximated by the segment's own AABB (what an R-tree can answer).
    t0 = performance.now(); let occSql=0;
    for (let i=0;i<N;i++){ const ax=cx-40+i*0.3, ay=cy-30, az=cz;
      const bx2=cx+20, by2=cy+25, bz2=cz+3;
      const r = q(`SELECT COUNT(*) FROM elements_rtree WHERE maxX>=${Math.min(ax,bx2)} AND minX<=${Math.max(ax,bx2)} AND maxY>=${Math.min(ay,by2)} AND minY<=${Math.max(ay,by2)} AND maxZ>=${Math.min(az,bz2)} AND minZ<=${Math.max(az,bz2)}`);
      occSql += (r && r[0]) ? r[0][0] : 0; }
    R.occSqlMs = +(performance.now()-t0).toFixed(1); R.occSqlHits = occSql;

    t0 = performance.now(); let occJs=0;
    for (let i=0;i<N;i++){ const ax=cx-40+i*0.3, ay=cy-30, az=cz, bx2=cx+20, by2=cy+25, bz2=cz+3;
      const lox=Math.min(ax,bx2), hix=Math.max(ax,bx2), loy=Math.min(ay,by2), hiy=Math.max(ay,by2), loz=Math.min(az,bz2), hiz=Math.max(az,bz2);
      for (let j=0;j<rows.length;j++){ const o=j*6;
        if (arr[o]+arr[o+3]/2>=lox && arr[o]-arr[o+3]/2<=hix && arr[o+1]+arr[o+4]/2>=loy && arr[o+1]-arr[o+4]/2<=hiy && arr[o+2]+arr[o+5]/2>=loz && arr[o+2]-arr[o+5]/2<=hiz) occJs++; } }
    R.occJsMs = +(performance.now()-t0).toFixed(1); R.occJsHits = occJs;

    // ── C. The path-window filter, for comparison: 63k elements x 300 samples of pure arithmetic.
    const path=[]; for(let i=0;i<300;i++) path.push({t:i*0.25,pos:{x:cx+i*0.1,y:cy,z:cz},fwd:{x:1,y:0,z:0}});
    t0 = performance.now(); let win=0;
    for (let j=0;j<rows.length;j++){ const o=j*6;
      const w = A.flythruPathWindows(path,{x:arr[o],y:arr[o+1],z:arr[o+2]},Math.max(arr[o+3],arr[o+4],arr[o+5]));
      if (w.length) win++; }
    R.pathWinMs = +(performance.now()-t0).toFixed(0); R.pathWinQualified = win;

    console.log('§BENCH ' + JSON.stringify(R));
    return R;
  });
  await b.close();
  console.log(JSON.stringify(out,null,1));
  console.log(logs.filter(l=>/§BENCH/.test(l)).join('\n'));
})();
