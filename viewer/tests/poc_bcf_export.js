// §BCF_EXPORT — Viewer's new BCF export module (viewer/bcf_export.js), ported from the real
// Federation/IfcOpenShell Python BCF generator + Modeller's already-shipped zip/XML engine.
// Drives the REAL production entry point APP.exportBcf() against REAL IssuesDB records (one clash
// with a resolved status + real PNG snapshot, one freeform note without a snapshot), then hands the
// produced .bcfzip bytes to the independent `unzip` CLI (ground truth, not self-checking) to confirm
// it's a genuinely valid, well-formed BCF 2.1 archive with the expected per-topic XML content.
const http=require('http'),fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const pup=require(path.join(process.env.HOME,'bim-compiler','node_modules','puppeteer'));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.png':'image/png','.db':'application/octet-stream'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/viewer/viewer.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end('404 '+p);}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
let pass=0,fail=0; const ck=(n,o)=>{console.log((o?'  PASS ':'  FAIL ')+n);o?pass++:fail++;};
const OUT=path.join(require('os').tmpdir(),'poc_bcf_export_'+Date.now()+'.bcfzip');
const EXTRACT=OUT+'.d';

(async()=>{
 await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
 const br=await pup.launch({headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const pg=await br.newPage();
 const logs=[]; pg.on('console',m=>logs.push(m.text()));
 const pageErrors=[]; pg.on('pageerror',e=>pageErrors.push(String(e)));

 await pg.goto(`http://localhost:${port}/viewer/viewer.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForFunction(()=>window.APP && typeof window.APP.exportBcf==='function',{timeout:20000}).catch(()=>{});

 ck('bcf_export.js loaded — no §LOAD_FAIL', !logs.some(l=>l.includes('LOAD_FAIL')));
 ck('APP.exportBcf wired (setupBcfExport ran)', await pg.evaluate(()=>typeof window.APP.exportBcf==='function'));
 ck('APP._bcf pure builders exposed for unit checks', await pg.evaluate(()=>!!(window.APP._bcf && window.APP._bcf.zipStore && window.APP._bcf._issueToTopic)));

 // Pure-function unit checks — real Viewer status/severity vocab → BCF vocab (ported mapping).
 const mapChecks = await pg.evaluate(()=>{
   const b = window.APP._bcf;
   return {
     resolvedToOpen: b._statusToBcf('') === 'Open',
     reviewedToOpen: b._statusToBcf('Reviewed') === 'Open',
     resolvedToResolved: b._statusToBcf('Resolved') === 'Resolved',
     acceptedToClosed: b._statusToBcf('Accepted') === 'Closed',
     hardToCritical: b._priorityFromSeverity('Hard clash') === 'Critical',
     softToMajor: b._priorityFromSeverity('Soft clash') === 'Major',
     clearanceToMinor: b._priorityFromSeverity('Clearance violation') === 'Minor',
   };
 });
 ck('status mapping (\'\'/Reviewed→Open, Resolved→Resolved, Accepted→Closed)', mapChecks.resolvedToOpen && mapChecks.reviewedToOpen && mapChecks.resolvedToResolved && mapChecks.acceptedToClosed);
 ck('priority mapping (Hard→Critical, Soft→Major, Clearance→Minor)', mapChecks.hardToCritical && mapChecks.softToMajor && mapChecks.clearanceToMinor);

 // Real 1x1 PNG bytes (smallest valid PNG) for the clash issue's snapshot.
 const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

 // Insert REAL issue records into the REAL issues IndexedDB (viewer/issues.js A._openIssuesDB),
 // exactly the shape A._saveClashIssue / A._saveIssueToLog would write.
 const seeded = await pg.evaluate(async (pngB64) => {
   function b64ToU8(b64){const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
   const pngBlob = new Blob([b64ToU8(pngB64)], {type:'image/png'});
   window.APP._clashPairKey = window.APP._clashPairKey || function(a,b){return a+'|'+b;};
   window.APP._clashStatuses = window.APP._clashStatuses || {};
   window.APP._clashStatuses[window.APP._clashPairKey('GUID_WALL_001','GUID_DUCT_002')] = 'Resolved';
   const db = await window.APP._openIssuesDB();
   const tx = db.transaction('issues','readwrite');
   const store = tx.objectStore('issues');
   store.add({
     type:'clash', jpeg_blob: pngBlob, timestamp: new Date().toISOString(),
     element_guid:'GUID_WALL_001', element_class:'IfcWall', element_name:'Wall-01',
     building:'PocTestBuilding', storey:'L1', discipline:'STR|MEP', notes:'needs reroute',
     element_b_guid:'GUID_DUCT_002', element_b_class:'IfcDuctSegment', element_b_name:'Duct-02',
     discipline_pair:'STR|MEP', overlap_mm: 42, severity:'Hard clash',
     camera_pos: JSON.stringify({x:10,y:5,z:8}), camera_target: JSON.stringify({x:0,y:0,z:0}),
     deep_link:'', gps_lat:null, gps_lng:null, gps_accuracy:null, compass_heading:null
   });
   store.add({
     type:'note', jpeg_blob:null, timestamp: new Date().toISOString(),
     element_guid:'GUID_DOOR_003', element_class:'IfcDoor', element_name:'Door-03',
     building:'PocTestBuilding', storey:'L2', discipline:'ARC',
     notes:'Door swing clashes with corridor furniture layout'
   });
   await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=rej;});
   db.close();
   return true;
 }, pngB64);
 ck('seeded 2 real issue records into IssuesDB', seeded === true);

 const exportResult = await pg.evaluate(async () => {
   try { const r = await window.APP.exportBcf({ download: false }); return { ok:true, topicCount: r.topicCount, byteLength: r.bytes.length, bytesB64: btoa(String.fromCharCode(...r.bytes)) }; }
   catch (e) { return { ok:false, error: e.message }; }
 });
 ck('APP.exportBcf({download:false}) resolved without throwing', exportResult.ok);
 ck('exported 2 topics (1 clash + 1 note)', exportResult.topicCount === 2);
 ck('§BCF export log line present', logs.some(l=>/§BCF export topics=2/.test(l)));
 ck('zero page errors', pageErrors.length === 0);

 // Write real bytes to disk, validate with the INDEPENDENT unzip CLI (not our own code).
 fs.writeFileSync(OUT, Buffer.from(exportResult.bytesB64, 'base64'));
 let unzipList = '', unzipTestOk = false;
 try {
   unzipTestOk = execSync(`unzip -t "${OUT}"`).toString().includes('No errors detected');
   unzipList = execSync(`unzip -l "${OUT}"`).toString();
   fs.mkdirSync(EXTRACT, { recursive: true });
   execSync(`unzip -o -q "${OUT}" -d "${EXTRACT}"`);
 } catch (e) { unzipList = 'UNZIP_FAILED: ' + e.message; }
 ck('independent unzip CLI: archive integrity OK (CRC valid)', unzipTestOk);
 ck('archive contains bcf.version', unzipList.includes('bcf.version'));
 ck('archive contains 2 markup.bcf + 2 viewpoint.bcfv (one per topic)', (unzipList.match(/markup\.bcf/g)||[]).length === 2 && (unzipList.match(/viewpoint\.bcfv/g)||[]).length === 2);
 ck('archive contains exactly 1 snapshot.png (clash only, note has none)', (unzipList.match(/snapshot\.png/g)||[]).length === 1);

 const topicDirs = fs.readdirSync(EXTRACT).filter(d => fs.statSync(path.join(EXTRACT,d)).isDirectory());
 const clashMarkup = topicDirs.map(d => fs.readFileSync(path.join(EXTRACT,d,'markup.bcf'),'utf8')).find(x => x.includes('TopicType="Clash"'));
 const noteMarkup = topicDirs.map(d => fs.readFileSync(path.join(EXTRACT,d,'markup.bcf'),'utf8')).find(x => x.includes('TopicType="Comment"'));
 ck('clash topic: TopicStatus="Resolved" (real severity Hard clash + real status Resolved)', !!clashMarkup && clashMarkup.includes('TopicStatus="Resolved"'));
 ck('clash topic: Priority=Critical (Hard clash → Critical)', !!clashMarkup && clashMarkup.includes('<Priority>Critical</Priority>'));
 ck('clash topic: ReferenceLinks carry the REAL element guids', !!clashMarkup && clashMarkup.includes('GUID_WALL_001') && clashMarkup.includes('GUID_DUCT_002'));
 ck('clash topic: Title uses real element names', !!clashMarkup && clashMarkup.includes('Wall-01') && clashMarkup.includes('Duct-02'));
 ck('note topic: TopicStatus="Open" (no clash-status lifecycle → default Open)', !!noteMarkup && noteMarkup.includes('TopicStatus="Open"'));
 ck('note topic: ReferenceLinks carry the real single element guid', !!noteMarkup && noteMarkup.includes('GUID_DOOR_003'));

 console.log('\n  §BCF_EXPORT '+pass+'/'+(pass+fail)+(fail?' (FAIL)':' PASS'));
 if (fail) { console.log('  unzip -l:\n'+unzipList); console.log('  pageErrors:', pageErrors); }
 try { fs.rmSync(OUT); fs.rmSync(EXTRACT, {recursive:true, force:true}); } catch(e) {}
 await br.close(); srv.close();
 process.exit(fail ? 1 : 0);
})().catch(e=>{console.error(e);process.exit(1);});
