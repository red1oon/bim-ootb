// WITNESS — §TRIPLANAR_NORMAL. ISSUE IT PROVES/DISPROVES: with diffuse+roughness only, every
// fragment of a flat surface shares ONE normal, so the lighting term is CONSTANT across it —
// measured on a real Alt+S Terminal frame, ceiling patch luma std 5.67, floor patch std 16.92.
// Adding the third map should make light VARY across a flat surface. Metric: mean local std in
// 8x8 blocks (fine surface detail; insensitive to overall brightness) + global gradient energy.
// One condition per page load — a same-page A/B was proven confounded (2nd Alt+S logged
// §PHOTO_AO avgRenderMs=0.7 vs 94.5, i.e. the AO phase did no real work).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'Terminal';
const POSE = process.env.POSE || 'int';
process.on('unhandledRejection', e => { console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e)); process.exit(1); });

const STATS = `(() => {
  const c = window.APP.renderer.domElement;
  const g = document.createElement('canvas'); g.width=c.width; g.height=c.height;
  g.getContext('2d').drawImage(c,0,0);
  const W=g.width,H=g.height,d=g.getContext('2d').getImageData(0,0,W,H).data;
  const L=new Float32Array(W*H);
  for(let i=0,p=0;i<d.length;i+=4,p++) L[p]=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
  // mean local std over 8x8 blocks — "does light vary ACROSS a surface"
  let bs=0,bn=0;
  for(let by=0;by+8<=H;by+=8) for(let bx=0;bx+8<=W;bx+=8){
    let s=0,s2=0; for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const v=L[(by+y)*W+bx+x]; s+=v; s2+=v*v; }
    const m=s/64; bs+=Math.sqrt(Math.max(0,s2/64-m*m)); bn++;
  }
  // global gradient energy
  let gsum=0,gn=0;
  for(let y=0;y<H-1;y++) for(let x=0;x<W-1;x++){ const o=y*W+x;
    gsum+=Math.abs(L[o+1]-L[o])+Math.abs(L[o+W]-L[o]); gn++; }
  let s=0,s2=0; for(let i=0;i<L.length;i++){ s+=L[i]; s2+=L[i]*L[i]; }
  const mean=s/L.length;
  return { w:W,h:H, blockStd:+(bs/bn).toFixed(4), gradEnergy:+(gsum/gn).toFixed(4),
           meanLuma:+mean.toFixed(2), stdLuma:+Math.sqrt(Math.max(0,s2/L.length-mean*mean)).toFixed(2) };
})()`;

async function run(browser, off, label){
  const page = await browser.newPage();
  await page.setViewport({width:960,height:540});
  let aoMs=null; const texReady=[];
  page.on('console', m=>{ const t=m.text();
    const k=t.match(/§PHOTO_AO done .*avgRenderMs=([\d.]+)/); if(k) aoMs=+k[1];
    if(/§TRIPLANAR_TEX_(READY|FAIL).*normal/.test(t)) texReady.push(t.trim()); });
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.APP&&window.APP.camera&&window.APP._composer&&
    typeof window.APP.startStillRefine==='function',{timeout:180000});
  await page.evaluate(o=>{ window.APP._triNormalOff=o; }, off);
  await page.evaluate(p=>{ window.__POSE=p; }, POSE);
  await page.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:120000,polling:250}).catch(()=>{});
  await page.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:600000,polling:1000}).catch(()=>{});
  const pose = await page.evaluate(()=>{ const a=window.APP,box=new THREE.Box3();
    a.scene.traverse(o=>{if(o.isMesh&&o.visible)box.expandByObject(o);});
    const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
    if (window.__POSE === 'ext') {
      // exterior, sun-side, looking back at the envelope — a normal map needs DIRECTIONAL light to
      // show relief; the interior pose is lit by ~uniform ambient+hemi+point fixtures, where
      // perturbing a normal changes almost nothing. This tests that explanation rather than tuning.
      a.camera.position.set(c.x + s.x*1.1, box.min.y + s.y*0.45, c.z + s.z*1.1);
      a.controls.target.set(c.x, box.min.y + s.y*0.35, c.z);
    } else {
      const eye=box.min.y+Math.min(s.y*0.12,1.7);
      a.camera.position.set(c.x+s.x*0.08,eye,c.z+s.z*0.08);
      a.controls.target.set(c.x,eye,c.z);
    }
    a.controls.update();
    return a.camera.position.toArray().map(v=>+v.toFixed(2)); });
  await page.evaluate(()=>window.APP.startStillRefine());
  await page.waitForFunction(()=>window.APP._stillRefineBusy===false,{timeout:300000,polling:200}).catch(()=>{});
  await new Promise(r=>setTimeout(r,1500));
  const s = await page.evaluate(STATS);
  const uni = await page.evaluate(()=>{
    const mats=window.APP._triplanarMaterials||[]; let withMap=0,scale=null;
    mats.forEach(m=>{ const sh=m._triplanarShader; if(sh&&sh.uniforms.uTriNormalMap&&sh.uniforms.uTriNormalMap.value){
      withMap++; scale=sh.uniforms.uTriNormalScale.value; } });
    return { triMats:mats.length, withNormalMap:withMap, uTriNormalScale:scale }; });
  console.log(`\n[${label}] pose=${JSON.stringify(pose)} aoAvgRenderMs=${aoMs} ${s.w}x${s.h}`);
  console.log(`   triMats=${uni.triMats} withNormalMap=${uni.withNormalMap} uTriNormalScale=${uni.uTriNormalScale}`);
  console.log(`   blockStd=${s.blockStd}  gradEnergy=${s.gradEnergy}  meanLuma=${s.meanLuma}  stdLuma=${s.stdLuma}`);
  if(texReady.length) console.log('   ' + texReady.slice(0,3).join('\n   '));
  await page.close();
  return {s,uni,aoMs,pose,texReady};
}

(async()=>{
  const browser = await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  console.log('='.repeat(78)+`\n§TRIPLANAR_NORMAL witness — ${BLD} @ :${PORT} pose=${POSE}\n`+'='.repeat(78));
  const a = await run(browser,true ,'A  normal map OFF (shipped two-map look)');
  const b = await run(browser,false,'B  normal map ON  (§TRIPLANAR_NORMAL)');
  console.log('\n'+'-'.repeat(78)+'\nVERDICT');
  if(b.uni.withNormalMap===0) console.log('  INCONCLUSIVE — no triplanar material ever received a normal map; nothing was judged.');
  else if(b.uni.uTriNormalScale!==1) console.log(`  INCONCLUSIVE — uTriNormalScale=${b.uni.uTriNormalScale}, the map was not active.`);
  else if(a.s.meanLuma===0||b.s.meanLuma===0) console.log('  INCONCLUSIVE — VACUOUS: black readback.');
  else if(JSON.stringify(a.pose)!==JSON.stringify(b.pose)) console.log('  INCONCLUSIVE — poses differ.');
  else if((a.aoMs!==null&&a.aoMs<10)||(b.aoMs!==null&&b.aoMs<10)) console.log(`  INCONCLUSIVE — an AO phase did no real work (${a.aoMs} vs ${b.aoMs}).`);
  else if(a.s.blockStd===b.s.blockStd) console.log('  NO-OP — frames identical; the normal map changed nothing.');
  else {
    const dB=+(b.s.blockStd-a.s.blockStd).toFixed(4), dG=+(b.s.gradEnergy-a.s.gradEnergy).toFixed(4);
    console.log(`  blockStd    ${a.s.blockStd} -> ${b.s.blockStd}  (${dB>=0?'+':''}${dB}, ${(100*dB/a.s.blockStd).toFixed(1)}%)`);
    console.log(`  gradEnergy  ${a.s.gradEnergy} -> ${b.s.gradEnergy}  (${dG>=0?'+':''}${dG}, ${(100*dG/a.s.gradEnergy).toFixed(1)}%)`);
    console.log(`  meanLuma    ${a.s.meanLuma} -> ${b.s.meanLuma}`);
    console.log(`  ${dB>0?'PASS':'FAIL'} — light varies across flat surfaces where it previously could not`);
  }
  await browser.close();
})();
