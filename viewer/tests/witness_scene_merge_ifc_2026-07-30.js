// ⚠ DO NOT REMOVE — Scope guard
// W-SCENE-MERGE-IFC — prompts/LANDING_MULTIMERGE_SAVEOPEN_RESURRECT.md §SM-3 step 5 / §SM-7.1
//
// THE ISSUE THIS TEST EXPOSES: the Open door used to accept `.db,.sqlite` ONLY, so a source IFC
// could not be opened — let alone merged — from the Viewer at all. §SM-3 step 5 widens the SAME door
// to `.ifc` and routes it through the EXISTING A.importMultiIFC (import.js:267), no new import path.
// A wrong wiring here shows up as either "picker rejects the file" or "IFC parsed but nothing
// reached the scene".
//
// Proves, on the real 2.3MB SampleHouse_ARC.ifc merged into a live Duplex scene:
//   1. the widened accept list really contains .ifc (read off the live <input>, not the source)
//   2. the pick routes to importMultiIFC → §OPEN_IFC / §MULTI_IMPORT_DONE / §OPEN_IFC_DB
//   3. the produced DB reaches the SAME merge path (§MERGE_PROMPT → §MERGE_DONE), no navigation
//   4. the IFC's building lands in A.buildingCentres and actually streams (§MERGE_CONTRACT > 0)
//
// §-log first — READ tests/witness_scene_merge_ifc_2026-07-30.log before any conclusion.
// Run:  timeout 900 node viewer/tests/witness_scene_merge_ifc_2026-07-30.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';
const IFC = path.join(DATA_ROOT, 'IFC', 'SampleHouse_ARC.ifc');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = (buf) => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); };
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (!e) return send(buf);
    fs.readFile(path.join(DATA_ROOT, p), (e2, buf2) => {
      if (e2) { res.writeHead(404); res.end('404 ' + p); return; }
      send(buf2);
    });
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function save() { fs.writeFileSync(path.join(__dirname, 'witness_scene_merge_ifc_2026-07-30.log'), log.join('\n') + '\n'); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => cons.push('PAGEERROR ' + e.message));
  const grep = (n) => cons.filter(l => l.indexOf(n) >= 0);

  S('── W-SCENE-MERGE-IFC — source IFC through the SAME Open door ──');
  S('   ISSUE: the Open door accepted .db/.sqlite only — a source IFC could not be opened at all.');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false && Object.keys(window.APP.guidMap || {}).length > 0)); } catch (e) {}
  }
  verdict(ready, 'building A (Duplex) loaded + streaming complete');
  if (!ready) { S('\n❌ ABORT — A never became ready'); save(); await browser.close(); server.close(); process.exit(1); }

  await page.evaluate(() => { window.__mergeEpoch = 'E' + Date.now(); });
  const before = await page.evaluate(() => ({ centres: Object.keys(window.APP.buildingCentres), meta: window.APP.totalElements,
    guidMap: Object.keys(window.APP.guidMap).length, epoch: window.__mergeEpoch, href: location.href.split('#')[0] }));
  S('     [state] before: centres=' + JSON.stringify(before.centres) + ' totalElements=' + before.meta + ' guidMap=' + before.guidMap);

  cons.length = 0;
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.evaluate(() => { window.APP.openModelDb(); }),
  ]);
  // CLAIM 1 — read the widened accept list off the LIVE input element
  const accept = await page.evaluate(() => {
    const ins = Array.from(document.querySelectorAll('input[type=file]'));
    const el = ins[ins.length - 1];
    return el ? { accept: el.accept, multiple: el.multiple } : null;
  });
  verdict(!!accept && /\.ifc/.test(accept.accept), 'CLAIM 1: the live picker accepts .ifc (widened from .db,.sqlite)', JSON.stringify(accept));
  await chooser.setFiles(IFC);

  // CLAIM 2 — routed to the EXISTING importMultiIFC, not a new import path
  let ifcDone = null;
  for (let i = 0; i < 300 && !ifcDone; i++) { await page.waitForTimeout(1000); ifcDone = grep('§OPEN_IFC_DB')[0]; }
  S('     [console] ' + (grep('§OPEN_IFC')[0] || 'no §OPEN_IFC'));
  S('     [console] ' + (grep('§MULTI_IMPORT_START')[0] || 'no §MULTI_IMPORT_START'));
  S('     [console] ' + (grep('§MULTI_IMPORT_DONE')[0] || 'no §MULTI_IMPORT_DONE'));
  S('     [console] ' + (ifcDone || 'no §OPEN_IFC_DB'));
  grep('§OPEN_IFC_FAIL').forEach(l => S('     [console] ' + l));
  verdict(!!grep('§MULTI_IMPORT_DONE')[0], 'CLAIM 2: routed through the existing A.importMultiIFC (import.js:267)', grep('§MULTI_IMPORT_DONE')[0] || 'missing');
  verdict(!!ifcDone, 'CLAIM 2b: importMultiIFC handed its produced DB back to the Open door', ifcDone || 'missing');
  if (!ifcDone) { S('\n❌ ABORT — IFC never produced a DB'); S('   tail: ' + cons.slice(-25).join('\n     ')); save(); await browser.close(); server.close(); process.exit(1); }

  // CLAIM 3 — same merge prompt, same merge path, no navigation
  await page.waitForSelector('#merge-modal', { state: 'visible', timeout: 60000 });
  const promptLine = grep('§MERGE_PROMPT')[0];
  verdict(!!promptLine, 'CLAIM 3: the produced DB reaches the SAME merge prompt', promptLine || 'missing');
  await page.click('#merge-btn');
  let mergeDone = null;
  for (let i = 0; i < 240 && !mergeDone; i++) { await page.waitForTimeout(1000); mergeDone = grep('§MERGE_DONE')[0]; }
  verdict(!!mergeDone, 'CLAIM 3b: §MERGE_DONE for the IFC-derived DB', mergeDone || 'missing');
  S('     [console] ' + (grep('§MERGE_CENTRES')[0] || 'missing'));
  S('     [console] ' + (grep('§MERGE_ROWS table=elements_meta')[0] || 'missing'));

  let settled = false;
  for (let i = 0; i < 300 && !settled; i++) {
    await page.waitForTimeout(1000);
    settled = await page.evaluate(() => !!(window.APP.streaming === false && (!window.APP._mergePending || !window.APP._mergePending.length)));
  }
  const after = await page.evaluate(() => ({ centres: Object.keys(window.APP.buildingCentres), meta: window.APP.totalElements,
    guidMap: Object.keys(window.APP.guidMap).length, epoch: window.__mergeEpoch, href: location.href.split('#')[0],
    rendered: Array.from(window.APP.buildingsRendered) }));
  verdict(after.epoch === before.epoch && after.href === before.href,
    'CLAIM 3c: no page navigation — the epoch marker and document URL both survived', 'epoch=' + after.epoch + ' url=' + after.href);

  // CLAIM 4 — the IFC's building is really in the scene
  const mc = grep('§MERGE_CONTRACT');
  S('     [console] ' + (mc[mc.length - 1] || 'no §MERGE_CONTRACT'));
  const newB = after.centres.filter(c => before.centres.indexOf(c) < 0);
  verdict(newB.length >= 1 && after.centres.length > before.centres.length,
    'CLAIM 4: the IFC-derived building joined A.buildingCentres', 'added=' + JSON.stringify(newB) +
    ' centres ' + before.centres.length + '→' + after.centres.length);
  verdict(newB.every(b => after.rendered.indexOf(b) >= 0) && after.guidMap > before.guidMap,
    'CLAIM 4b: and it actually streamed (buildingsRendered + guidMap grew)',
    'rendered=' + JSON.stringify(after.rendered) + ' guidMap ' + before.guidMap + '→' + after.guidMap);
  verdict(!grep('§CONTRACT_FAIL').length, 'CLAIM 4c: no §CONTRACT_FAIL', 'n=' + grep('§CONTRACT_FAIL').length);
  const risk = grep('§OPEN_IFC_WASM_RISK');
  S('     [info] §OPEN_IFC_WASM_RISK lines=' + risk.length + ' (expected 0 for a 2.3MB file; the §KUL009 4GB warning only fires >900MB)');

  S('\n── VERDICT ──');
  S('   ' + (fails === 0 ? '🟢 W-SCENE-MERGE-IFC PASS' : '🔴 W-SCENE-MERGE-IFC FAIL (' + fails + ')'));
  save();
  await page.close().catch(() => {}); await ctx.close().catch(() => {}); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => {
  S('\n💥 HARNESS ERROR: ' + (e && e.stack ? e.stack : e));
  save();
  try { server.close(); } catch (e2) {}
  process.exit(2);
});
