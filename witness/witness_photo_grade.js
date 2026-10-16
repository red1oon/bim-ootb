// WITNESS — §PHOTO_GRADE v2. ISSUE IT PROVES/DISPROVES: does the grade raise CONTRAST without
// raising MEAN luma, and put real pixels through the clip point?
// v1 of this witness was VACUOUS (read a 300x150 all-black overlay canvas). v2 of this witness was
// CONFOUNDED: it ran both conditions on ONE page load, and the second Alt+S reported
// §PHOTO_AO avgRenderMs=0.7 against the first's 94.5 — the AO phase did no real work the second
// time, so the two frames were never comparable. This version runs ONE CONDITION PER PAGE LOAD,
// and uses the SAME pose the §PHOTO_GRADE_PROBE calibration was measured at.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'Terminal';
process.on('unhandledRejection', e => { console.error('UNHANDLED_REJECTION: ' + (e && e.stack||e)); process.exit(1); });

const STATS = `(() => {
  const c = window.APP.renderer.domElement;
  const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  g.getContext('2d').drawImage(c, 0, 0);
  const d = g.getContext('2d').getImageData(0,0,g.width,g.height).data;
  let n=0,sr=0,sg=0,sb=0,sl=0,sl2=0,hi=0,lo=0,mx=0; const L=[];
  for (let i=0;i<d.length;i+=4){ const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
    sr+=d[i];sg+=d[i+1];sb+=d[i+2];sl+=l;sl2+=l*l;n++;
    if(l>250)hi++; if(l<16)lo++; if(l>mx)mx=l; if((i>>2)%5===0)L.push(l); }
  L.sort((a,b)=>a-b); const p=q=>L[Math.min(L.length-1,Math.floor(q*L.length))];
  const mean=sl/n;
  return { w:g.width,h:g.height, meanLuma:+mean.toFixed(2),
           stdLuma:+Math.sqrt(Math.max(0,sl2/n-mean*mean)).toFixed(2),
           p50:+p(0.5).toFixed(1), p95:+p(0.95).toFixed(1), p999:+p(0.999).toFixed(1),
           pctGT250:+(100*hi/n).toFixed(4), pctLT16:+(100*lo/n).toFixed(4), maxLuma:+mx.toFixed(1) };
})()`;

async function oneRun(browser, gradeOff, label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  let aoMs = null;
  page.on('console', m => { const t = m.text();
    const k = t.match(/§PHOTO_AO done .*avgRenderMs=([\d.]+)/); if (k) aoMs = +k[1]; });
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP._composer &&
    typeof window.APP.startStillRefine === 'function', { timeout: 180000 });
  await page.evaluate(off => { window.APP._gradeOff = off; }, gradeOff);
  await page.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue||[]).length > 0,
    { timeout: 120000, polling: 250 }).catch(()=>{});
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 600000, polling: 1000 }).catch(()=>{});
  // EXACTLY the pose §PHOTO_GRADE_PROBE calibrated at
  const pose = await page.evaluate(() => {
    const a = window.APP, box = new THREE.Box3();
    a.scene.traverse(o => { if (o.isMesh && o.visible) box.expandByObject(o); });
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const eye = box.min.y + Math.min(s.y*0.12, 1.7);
    a.camera.position.set(c.x + s.x*0.08, eye, c.z + s.z*0.08);
    a.controls.target.set(c.x, eye, c.z); a.controls.update();
    return a.camera.position.toArray().map(v=>+v.toFixed(2));
  });
  await page.evaluate(() => window.APP.startStillRefine());
  await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 300000, polling: 200 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 1500));
  const s = await page.evaluate(STATS);
  const armed = await page.evaluate(() => !!(window.APP._gradePass && window.APP._gradePass.enabled));
  console.log(`\n[${label}]  armed=${armed}  ${s.w}x${s.h}  pose=${JSON.stringify(pose)}  aoAvgRenderMs=${aoMs}`);
  console.log(`   meanLuma=${s.meanLuma}  stdLuma=${s.stdLuma}  p50=${s.p50}  p95=${s.p95}  p99.9=${s.p999}  max=${s.maxLuma}`);
  console.log(`   >250=${s.pctGT250}%  <16=${s.pctLT16}%`);
  await page.close();
  return { s, armed, aoMs, pose };
}

(async () => {
  const browser = await puppeteer.launch({ headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout: 900000 });
  console.log('='.repeat(78) + `\n§PHOTO_GRADE v2 witness — ${BLD} @ :${PORT} — one condition per page load\n` + '='.repeat(78));
  const off = await oneRun(browser, true,  'A  grade OFF');
  const on  = await oneRun(browser, false, 'B  grade ON');
  console.log('\n' + '-'.repeat(78) + '\nVERDICT');
  if (!on.armed) console.log('  INCONCLUSIVE — grade never armed.');
  else if (off.s.meanLuma === 0 || on.s.meanLuma === 0) console.log('  INCONCLUSIVE — VACUOUS: black readback.');
  else if (JSON.stringify(off.pose) !== JSON.stringify(on.pose)) console.log('  INCONCLUSIVE — poses differ, frames not comparable.');
  else if (off.aoMs !== null && on.aoMs !== null && (off.aoMs < 10 || on.aoMs < 10))
    console.log(`  INCONCLUSIVE — an AO phase did no real work (avgRenderMs ${off.aoMs} vs ${on.aoMs}); frames not comparable.`);
  else {
    const dM = +(on.s.meanLuma - off.s.meanLuma).toFixed(2), dS = +(on.s.stdLuma - off.s.stdLuma).toFixed(2);
    console.log(`  meanLuma ${off.s.meanLuma} -> ${on.s.meanLuma} (${dM>=0?'+':''}${dM})`);
    console.log(`  stdLuma  ${off.s.stdLuma} -> ${on.s.stdLuma} (${dS>=0?'+':''}${dS}, ${(100*dS/off.s.stdLuma).toFixed(1)}%)`);
    console.log(`  >250     ${off.s.pctGT250}% -> ${on.s.pctGT250}%`);
    console.log(`  <16      ${off.s.pctLT16}% -> ${on.s.pctLT16}%`);
    console.log(`  ${(dS>0 && dM<=0.5 && on.s.pctGT250>off.s.pctGT250) ? 'PASS' : 'FAIL'} — contrast up, mean not raised, pixels through the clip point`);
  }
  await browser.close();
})();
