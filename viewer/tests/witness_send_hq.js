// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-SEND-HQ — bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEPS 1–2 BUILD SPEC (owner 2026-11-27: "proceed on plan").
// Issues this witness proves or disproves, phone emulation, Duplex:
//   S1 a field user could not get the Issue Log + walk trace to HQ in one go → the Issues panel's "Send to HQ" button hands the share
//      sheet ONE bundle: a JSON report that parses, every issue in it, each issue's photo a shared file whose bytes match its type
//      (JPEG FF D8 / PNG 89 50), and every walk waypoint (= the §WALK_TRACE lines) with its position and geo source.
//   S2 no share-with-files (most desktops) → the same files download (1 report + 1 per photo), nothing silently dropped.
//   S3 nothing to send → `§HQ_SEND empty`, no share sheet.
//   RED control: the same validator on the shared set minus one photo must FAIL (the check can fail).
// §-log first — READ viewer/tests/witness_send_hq.log after every run before any conclusion.
// Run:  node viewer/tests/witness_send_hq.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };

const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }

async function open(browser, opts) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  if (opts && opts.noShare) await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {} navigator.share = undefined; navigator.canShare = undefined; });
  else await ctx.addInitScript(() => {   // the harness stands in for the OS share sheet: it keeps what it was handed
    window.__shared = null;
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { const out = [];
      for (const f of d.files) { const b = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        out.push({ name: f.name, type: f.type, size: f.size, b64: btoa(s) }); }
      window.__shared = { title: d.title, text: d.text, files: out }; };
  });
  page.on('console', m => { const t = m.text(); cons.push(t); if (/§(HQ_|WALK_TRACE)/.test(t)) log.push('  [console] ' + t.slice(0, 200)); });
  page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && APP.sendToHq && window.UniversalHistory)).catch(() => false); }
  return { ctx, page, cons, ready };
}
// arrange: two issues with real image blobs (one JPEG like Site Camera, one PNG like a clash snag) — the store issues.js reads
const addIssues = page => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48);
  const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)), png = await new Promise(r => c.toBlob(r, 'image/png'));
  const db = await APP._openIssuesDB(); const tx = db.transaction('issues', 'readwrite'), st = tx.objectStore('issues');
  st.add({ jpeg_blob: jpg, element_class: 'IfcCovering', element_guid: 'W-SEND-HQ-1', storey: 'Level 1', timestamp: new Date().toISOString(), notes: 'witness' });
  st.add({ jpeg_blob: png, element_class: 'IfcWall', element_guid: 'W-SEND-HQ-2', storey: 'Level 2', timestamp: new Date().toISOString(), notes: 'witness' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; }); db.close(); return 2; });
const walk = page => page.evaluate(() => { APP.walkStepCount = 0; APP.setWalkAnchor();
  for (let k = 1; k <= 12; k++) { if (k === 7) APP.camera.rotateY(40 * Math.PI / 180); APP.walkStepCount++; APP.advanceWalkStep(); } APP.stopWalkMode(); });
// the real button, as a phone user reaches it: Issues panel → "Send to HQ"
const tapSend = page => page.evaluate(() => { if (!document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues();
  const b = document.getElementById('issues-send-hq'); if (!b || !b.offsetWidth) return false; b.click(); return true; });

// the validator — returns the list of problems (empty = the bundle is what HQ needs)
function validate(shared, nTrace, nIssues) {
  const P = [], files = shared.files, byName = {}; files.forEach(f => { byName[f.name] = f; });
  const js = files.filter(f => /\.json$/.test(f.name)); if (js.length !== 1) { P.push('json files=' + js.length); return P; }
  let r; try { r = JSON.parse(Buffer.from(js[0].b64, 'base64').toString('utf8')); } catch (e) { P.push('report does not parse'); return P; }
  if (r.kind !== 'bim-site-report' || r.v !== 1) P.push('kind/v ' + r.kind + '/' + r.v);
  if (!Array.isArray(r.issues) || r.issues.length !== nIssues) P.push('issues ' + (r.issues && r.issues.length) + '!=' + nIssues);
  (r.issues || []).forEach(it => { const f = it.photo && byName[it.photo]; if (!f) { P.push('photo missing for issue ' + it.id + ' (' + it.photo + ')'); return; }
    const b = Buffer.from(f.b64, 'base64'); const jpg = b[0] === 0xFF && b[1] === 0xD8, png = b[0] === 0x89 && b[1] === 0x50;
    if (/\.jpg$/.test(f.name) ? !jpg : !png) P.push('bytes do not match ' + f.name); });
  if (!Array.isArray(r.walk) || r.walk.length !== nTrace) P.push('walk ' + (r.walk && r.walk.length) + '!=' + nTrace + ' trace lines');
  (r.walk || []).forEach(w => { if (!w.ref || !Array.isArray(w.ref.p) || !w.ref.geo || !w.ref.geo.src) P.push('walk point without p/geo: ' + w.label); });
  return P;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--disable-gpu'] });

  S('── S1 PHONE, Duplex: 2 issues + a 12-step walk → Send to HQ (share sheet) ──');
  const A = await open(browser);
  verdict(A.ready, 'Duplex loaded, sendToHq + history present');
  if (A.ready) {
    await addIssues(A.page); const m = A.cons.length; await walk(A.page); await A.page.waitForTimeout(400);
    const nTrace = A.cons.slice(m).filter(t => /^§WALK_TRACE /.test(t)).length;
    const tapped = await tapSend(A.page); await A.page.waitForTimeout(1500);
    const shared = await A.page.evaluate(() => window.__shared);
    const bundleLine = A.cons.find(t => /^§HQ_BUNDLE /.test(t)) || '', sendLine = A.cons.find(t => /^§HQ_SEND /.test(t)) || '';
    const P = shared ? validate(shared, nTrace, 2) : ['nothing reached the share sheet'];
    verdict(tapped && !!shared && P.length === 0 && /via=share ok/.test(sendLine) && nTrace >= 4,
      'S1 one bundle reaches the share sheet: report + every issue + matching photos + the whole walk', 'button=' + tapped + ' trace_lines=' + nTrace +
      ' files=' + (shared ? shared.files.map(f => f.name.replace(/_\d{8}_\d{6}/, '') + ':' + f.size).join(',') : 0) + ' problems=' + JSON.stringify(P) + ' | ' + bundleLine + ' | ' + sendLine);
    if (shared) {
      const cut = { files: shared.files.filter(f => !/\.png$/.test(f.name)) };
      const RP = validate(cut, nTrace, 2);
      judged++; if (RP.length === 0) fails++;
      S('   ' + (RP.length ? '🟢 red control went RED as required — ' + JSON.stringify(RP) : '🔴 red control did NOT go red (validator blind to a missing photo)'));
    }
  }
  await A.ctx.close();

  S('\n── S2 no share-with-files → the files download ──');
  const B = await open(browser, { noShare: true });
  if (B.ready) {
    await addIssues(B.page); const dl = []; B.page.on('download', d => dl.push(d.suggestedFilename()));
    await tapSend(B.page); await B.page.waitForTimeout(2500);
    const line = B.cons.find(t => /^§HQ_SEND /.test(t)) || '';
    verdict(/via=download files=3/.test(line) && dl.length === 3 && dl.filter(n => /\.json$/.test(n)).length === 1,
      'S2 fallback downloads report + 2 photos', 'downloads=' + JSON.stringify(dl.map(n => n.replace(/_\d{8}_\d{6}/, ''))) + ' | ' + line);
  } else verdict(false, 'S2 page did not load');
  await B.ctx.close();

  S('\n── S3 nothing to send ──');
  const C = await open(browser);
  if (C.ready) {
    await tapSend(C.page); await C.page.waitForTimeout(800);
    const shared = await C.page.evaluate(() => window.__shared), line = C.cons.find(t => /^§HQ_SEND /.test(t)) || '';
    verdict(line === '§HQ_SEND empty' && !shared, 'S3 empty → no share sheet, says so', line + ' shared=' + !!shared);
  } else verdict(false, 'S3 page did not load');
  await C.ctx.close();

  await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_SEND_HQ ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_send_hq.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
