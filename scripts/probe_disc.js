const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:900000,
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader']});
  const p = await b.newPage();
  const logs=[]; p.on('console',m=>logs.push(m.text()));
  await p.goto('http://localhost:8403/viewer/viewer.html?db=/buildings/Clinic_extracted.db', {waitUntil:'domcontentloaded', timeout:60000});
  await p.waitForFunction(()=>window.APP&&window.APP.startStillRefine, {timeout:180000});
  await sleep(20000);
  const out = await p.evaluate(() => {
    const A=window.APP;
    const guids=Object.values(A.guidMap);
    const uniq=[...new Set(guids)];
    // what disciplines / classes are actually in the scene?
    const q = (sql)=>{try{return A.dbQuery(sql)||[];}catch(e){return [['ERR '+e.message]];}};
    const inList = uniq.slice(0,4000).map(g=>"'"+g+"'").join(',');
    const disc = q("SELECT discipline, COUNT(*) FROM elements_meta WHERE guid IN ("+inList+") GROUP BY discipline ORDER BY 2 DESC");
    const allDisc = q("SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline ORDER BY 2 DESC");
    return { guidMapUnique: uniq.length, inSceneByDiscipline: disc, wholeBuildingByDiscipline: allDisc,
             streamedCount: A.streamedCount, hasInstances: !!A._instanceMeta };
  });
  console.log(JSON.stringify(out,null,1));
  console.log('--- streaming/discipline log lines ---');
  console.log(logs.filter(l=>/STREAM|DISCIPLINE|§CONTRACT|ELEC|budget|LOD/i.test(l)).slice(0,14).join('\n'));
  await b.close();
})();
