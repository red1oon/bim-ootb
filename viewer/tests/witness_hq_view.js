// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-HQ-VIEW — bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 4 BUILD SPEC (HQ view: "Get from team").
// Issues this witness proves or disproves; folder relay; founder in node; phone A, phone B and HQ = three browser contexts, page-made devices:
//   V1 HQ could not see the phones' reports in its own Issue Log → Get from team: drops=2, 3 rows, each with its device code, photos byte-equal.
//   V2 a second Get must not duplicate → new=0, still 3 rows.
//   V3 a phone re-sends its whole log with one more issue → +1 row, the 2 known rows updated in place, no duplicate.
//   V4 HQ must not re-send other people's issues → A.buildHqBundle() on HQ holds only HQ's own issue.
//   V5 a phone's walk must replay at HQ → §HQ_REPLAY points = the phone's §WALK_TRACE lines; scrubbing each point puts HQ's camera within 1 cm of the phone's.
//   V6 a revoked device's new report is refused (reason=revoked), rows unchanged.
//   RED control: a byte flipped in a part before Get → that drop refused part-hash, 0 rows from it (the check can fail).
// §-log first — READ viewer/tests/witness_hq_view.log after every run before any conclusion.
// Run:  node viewer/tests/witness_hq_view.js
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path');
const NM = os.homedir() + '/bim-ootb/tests/node_modules/';
const { chromium } = require(process.env.PW || (NM + 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const COMM = path.join(ROOT, 'common', 'comm');
const STORE = require(path.join(COMM, 'comm_store.js')), PIPE = require(path.join(COMM, 'comm_pipe.js')), DROP = require(path.join(COMM, 'team_drop.js'));

const FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-view-'));
function walkDir(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(n => { const p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walkDir(p, r, out); else out.push(r); }); return out; }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (p === '/pipe/list') { const pre = u.searchParams.get('prefix') || '';
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walkDir(FOLDER, '', []).filter(n => n.indexOf(pre) === 0))); return; }
  if (p.indexOf('/pipe/f/') === 0) { const fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
    if (req.method === 'PUT') { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
      if (u.searchParams.get('absent') === '1' && fs.existsSync(fp)) { res.writeHead(412); res.end(); return; }
      fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(201); res.end('ok'); }); return; }
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
  if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };

const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
const b64 = u8 => Buffer.from(u8).toString('base64');

async function open(browser, base) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  await ctx.addInitScript(() => {   // the harness stands in for the OS share sheet (T5): it keeps what it was handed
    window.__shared = null; navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { window.__shared = { files: d.files.map(f => f.name) }; };
  });
  page.on('console', m => { const t = m.text(); cons.push(t); if (/§(HQ_|WALK_TRACE i=1 )/.test(t)) log.push('  [console] ' + t.slice(0, 220)); });
  page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto(base + '/viewer/viewer.html?db=buildings/Duplex_extracted.db&pipe=' + encodeURIComponent(base + '/pipe'), { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && APP.sendToHq && APP.flushHqOutbox && window.UniversalHistory)).catch(() => false); }
  return { ctx, page, cons, ready };
}
const addIssues = page => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48);
  const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)), png = await new Promise(r => c.toBlob(r, 'image/png'));
  const db = await APP._openIssuesDB(); const tx = db.transaction('issues', 'readwrite'), st = tx.objectStore('issues');
  st.add({ jpeg_blob: jpg, element_class: 'IfcCovering', element_guid: 'W-SEND-HQ-1', storey: 'Level 1', timestamp: new Date().toISOString(), notes: 'witness' });
  st.add({ jpeg_blob: png, element_class: 'IfcWall', element_guid: 'W-SEND-HQ-2', storey: 'Level 2', timestamp: new Date().toISOString(), notes: 'witness' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; }); db.close(); return 2; });
const walk = page => page.evaluate(() => { APP.walkStepCount = 0; APP.setWalkAnchor();
  for (let k = 1; k <= 12; k++) { if (k === 7) APP.camera.rotateY(40 * Math.PI / 180); APP.walkStepCount++; APP.advanceWalkStep(); } APP.stopWalkMode(); });
const tapSend = page => page.evaluate(() => { if (!document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues();
  const b = document.getElementById('issues-send-hq'); if (!b || !b.offsetWidth) return false; b.click(); return true; });
// keep the exact files the phone bundled (sendToHq calls A.buildHqBundle through the property, so the wrapper sees every send)
const recordBundles = page => page.evaluate(() => { window.__bundles = []; const o = APP.buildHqBundle;
  APP.buildHqBundle = async function () { const B = await o.apply(this, arguments); const out = [];
    for (const f of B.files) { const b = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); out.push({ name: f.name, type: f.type, b64: btoa(s) }); }
    window.__bundles.push(out); return B; }; });
// the phone's device is made IN the page (its private keys never leave it), saved where the Team panel saves it
const makePhoneDevice = page => page.evaluate(async () => {
  for (const n of ['comm_envelope', 'comm_order', 'team_keys', 'comm_roster', 'comm_admit', 'comm_pipe', 'comm_store']) {
    if (n === 'comm_store' && window.CommStore) continue;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../common/comm/' + n + '.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  const dev = await window.CommStore.newDevice(); dev.person_uu = crypto.randomUUID();
  await new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(dev, 'device'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; });
  return { kid: dev.kid, pubJwk: dev.pubJwk, dhPubJwk: dev.dhPubJwk, person_uu: dev.person_uu }; });
const setCfg = (page, cfg) => page.evaluate(cfg => new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(cfg, 'cfg'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; }), cfg);
const outboxCount = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('bim_hq_outbox', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
  r.onsuccess = () => { const q = r.result.transaction('q').objectStore('q').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(-1); }; r.onerror = () => res(-1); }));


const mkIssue = (page, tag, png) => page.evaluate(async ([tag, png]) => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = png ? '#3c3' : '#c33'; g.fillRect(0, 0, 64, 48); g.fillText(tag, 4, 20);
  const blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.9));
  const db = await APP._openIssuesDB(); const tx = db.transaction('issues', 'readwrite');
  tx.objectStore('issues').add({ jpeg_blob: blob, element_class: 'IfcWall', element_guid: tag, storey: 'Level 1', timestamp: new Date().toISOString(), notes: tag });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; }); db.close(); }, [tag, !!png]);
const rows = page => page.evaluate(async () => { const all = await APP._getAllIssues(), out = [];
  for (const r of all) { let b64 = ''; if (r.jpeg_blob) { const b = new Uint8Array(await r.jpeg_blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); b64 = btoa(s); }
    out.push({ id: r.id, tag: r.element_guid, src_kid: r.src_kid || '', src_code: r.src_code || '', src_id: r.src_id, b64 }); } return out; });
const codeOf = kid => kid.slice(0, 4).toUpperCase() + '-' + kid.slice(4, 8).toUpperCase();
async function sendAndWait(P) { const c0 = P.cons.length; await tapSend(P.page); let l = '';
  for (let i = 0; i < 60 && !l; i++) { await P.page.waitForTimeout(500); l = P.cons.slice(c0).find(t => /^§HQ_SEND via=team /.test(t)) || P.cons.slice(c0).find(t => /^§HQ_TEAM (nokey|flush_err)/.test(t)) || ''; } return l; }
async function getAndWait(P) { const c0 = P.cons.length;
  const tapped = await P.page.evaluate(() => { if (!document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues(); return true; });
  await P.page.waitForTimeout(600);
  const shown = await P.page.evaluate(() => { const b = document.getElementById('issues-get-team'); if (!b || !b.offsetWidth) return false; b.click(); return true; });
  let l = ''; for (let i = 0; i < 60 && !l; i++) { await P.page.waitForTimeout(500); l = P.cons.slice(c0).find(t => /^§HQ_GET drops=/.test(t)) || ''; }
  await P.page.waitForTimeout(400);
  return { line: l, shown: tapped && shown, refused: P.cons.slice(c0).filter(t => /^§HQ_GET refused /.test(t)) }; }

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const SQL = await require(NM + 'sql.js')();
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  const relay = PIPE.folderPipe(FOLDER, 'folder');

  S('── arrange: founder (node) + phone A + phone B + HQ browser, all enrolled in one encrypted space ──');
  const A = await open(browser, base), B = await open(browser, base), HQ = await open(browser, base);
  verdict(A.ready && B.ready && HQ.ready, 'three viewers loaded (Duplex)', 'A=' + A.ready + ' B=' + B.ready + ' HQ=' + HQ.ready);
  if (!(A.ready && B.ready && HQ.ready)) { await finish(browser); return; }
  const dA = await makePhoneDevice(A.page), dB = await makePhoneDevice(B.page), dH = await makePhoneDevice(HQ.page);
  const fDev = await STORE.newDevice(); fDev.person_uu = require('crypto').randomUUID();
  const sp = await STORE.newSpace('hq-view', fDev, fDev.person_uu, 'Founder', 102);
  const F = STORE.open(new SQL.Database(), { SQL, space: sp.space, self: fDev, access: () => ({ allowed: true }), tableId: () => null, log: () => {} });
  await F.genesis(sp.params);
  for (const [d, n] of [[dA, 'Site A'], [dB, 'Site B'], [dH, 'HQ desk']]) { await F.addPerson({ person_uu: d.person_uu, name: n, ad_role_id: 103, comm_admin: false }); await F.enroll(d.kid, d.pubJwk, d.person_uu, d.dhPubJwk); }
  await F.sync(relay);
  for (const P of [A, B, HQ]) await setCfg(P.page, { space: sp.space, founder: false });
  S('   §HQV_ARRANGE space=' + sp.space.slice(0, 12) + ' A=' + codeOf(dA.kid) + ' B=' + codeOf(dB.kid) + ' HQ=' + codeOf(dH.kid) + ' folder=' + FOLDER);

  S('\n── V1 A (2 issues + walk) and B (1 issue + walk) send; HQ gets ──');
  await mkIssue(A.page, 'A-1'); await mkIssue(A.page, 'A-2', true); const mA = A.cons.length; await walk(A.page); await A.page.waitForTimeout(400);
  const traceA = A.cons.slice(mA).filter(t => /^§WALK_TRACE /.test(t));
  await mkIssue(B.page, 'B-1'); await walk(B.page); await B.page.waitForTimeout(400);
  const sA = await sendAndWait(A), sB = await sendAndWait(B);
  const srcRows = (await rows(A.page)).concat(await rows(B.page));
  const g1 = await getAndWait(HQ), r1 = await rows(HQ.page);
  const okRows = r1.length === 3 && r1.every(r => { const s = srcRows.find(x => x.tag === r.tag); return s && s.b64 === r.b64 && r.b64.length > 0 && r.src_code === codeOf(/^A-/.test(r.tag) ? dA.kid : dB.kid); });
  const cards = await HQ.page.evaluate(() => Array.from(document.querySelectorAll('#issues-list .issue-card:not(.issue-walk-row) .issue-ts')).map(e => e.textContent.replace(/^.*· /, '')));
  const walkRows = await HQ.page.evaluate(() => document.querySelectorAll('#issues-list .issue-walk-row').length);
  verdict(/via=team/.test(sA) && /via=team/.test(sB) && g1.shown && /drops=2 new=2 issues_added=3 issues_updated=0 walks=2 refused=0$/.test(g1.line) && okRows && cards.length === 3 && cards.every(c => /^from [0-9A-F]{4}-[0-9A-F]{4}$/.test(c)) && walkRows === 2,
    'V1 one Issue Log at HQ: 3 rows, right device code, photos byte-equal, 2 walk rows', g1.line + ' | button_shown=' + g1.shown + ' rows=' + r1.map(r => r.tag + '@' + r.src_code).join(',') + ' photos_equal=' + okRows + ' cards=' + JSON.stringify(cards) + ' walk_rows=' + walkRows);

  S('\n── V2 Get again is idempotent ──');
  const g2 = await getAndWait(HQ), r2 = await rows(HQ.page);
  verdict(/drops=2 new=0 issues_added=0 issues_updated=0/.test(g2.line) && r2.length === 3, 'V2 nothing new → nothing added', g2.line + ' rows=' + r2.length);

  S('\n── V3 A adds an issue and re-sends its whole log ──');
  await mkIssue(A.page, 'A-3'); await sendAndWait(A);
  const g3 = await getAndWait(HQ), r3 = await rows(HQ.page), tags3 = r3.map(r => r.tag).sort();
  const keptIds = r1.filter(r => /^A-/.test(r.tag)).every(r => { const n = r3.find(x => x.tag === r.tag); return n && n.id === r.id; });
  verdict(/new=1 issues_added=1 issues_updated=2/.test(g3.line) && JSON.stringify(tags3) === JSON.stringify(['A-1', 'A-2', 'A-3', 'B-1']) && keptIds,
    'V3 +1 row, 2 updated in place (same local ids), no duplicate', g3.line + ' tags=' + tags3.join(',') + ' ids_kept=' + keptIds);

  S('\n── V4 HQ never re-sends merged rows ──');
  await mkIssue(HQ.page, 'HQ-own');
  const bun = await HQ.page.evaluate(async () => { const b = await APP.buildHqBundle(); return b.report.issues.map(i => i.element_guid); });
  verdict(bun.length === 1 && bun[0] === 'HQ-own', 'V4 HQ\'s own bundle holds only HQ\'s own issue', 'bundle_issues=' + JSON.stringify(bun) + ' log_rows=' + (await rows(HQ.page)).length);

  S('\n── V5 A\'s walk replays at HQ by scrubbing ──');
  const c5 = HQ.cons.length;
  const clicked = await HQ.page.evaluate(kid => { const r = document.querySelector('#issues-list .issue-walk-row[data-kid="' + kid + '"]'); if (!r) return false; r.click(); return true; }, dA.kid);
  let rp = ''; for (let i = 0; i < 20 && !rp; i++) { await HQ.page.waitForTimeout(250); rp = HQ.cons.slice(c5).find(t => /^§HQ_REPLAY /.test(t)) || ''; }
  const scrub = await HQ.page.evaluate(async ([kid, code]) => {
    const w = await new Promise(res => { const r = indexedDB.open('comm_phone', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('viewer_walks'); q.onsuccess = () => res((q.result || {})[kid]); }; });
    const L = UniversalHistory.list().filter(e => String(e.label).indexOf(code + ' \u00b7 ') === 0), out = [];
    L.forEach((e, k) => { UniversalHistory.jumpTo(e.i); const p = APP.camera.position, want = w.walk[k].viewState.cam.p; out.push(Math.hypot(p.x - want[0], p.y - want[1], p.z - want[2])); });
    return out; }, [dA.kid, codeOf(dA.kid)]);
  const maxErr = scrub.length ? Math.max.apply(null, scrub) : NaN;
  const pts = +(rp.match(/points=(\d+)/) || [])[1];
  verdict(clicked && pts === traceA.length && traceA.length >= 4 && scrub.length === pts && maxErr <= 0.01,
    'V5 every walk point of phone A restores HQ\'s camera within 1 cm', rp + ' | phone_trace_lines=' + traceA.length + ' scrubbed=' + scrub.length + ' max_err_m=' + (isNaN(maxErr) ? 'n/a' : maxErr.toFixed(4)));

  S('\n── RED control: a flipped byte in a new drop → refused whole ──');
  await mkIssue(A.page, 'A-4'); const before = walkDir(FOLDER, '', []); await sendAndWait(A);
  const part = walkDir(FOLDER, '', []).filter(n => before.indexOf(n) < 0 && /\/1\.bin$/.test(n))[0];
  if (part) { const fp = path.join(FOLDER, part), b = fs.readFileSync(fp); b[40] ^= 1; fs.writeFileSync(fp, b); }
  const g5 = await getAndWait(HQ), r5 = await rows(HQ.page);
  judged++; const red = !!part && /refused=1$/.test(g5.line) && g5.refused.some(t => /reason=part-hash/.test(t)) && !r5.some(r => r.tag === 'A-4'); if (!red) fails++;
  S('   ' + (red ? '🟢 red control went RED as required — ' : '🔴 red control did NOT go red — ') + g5.line + ' | ' + g5.refused.join(' ; ') + ' | A-4_in_log=' + r5.some(r => r.tag === 'A-4'));
  if (part) { const fp = path.join(FOLDER, part), b = fs.readFileSync(fp); b[40] ^= 1; fs.writeFileSync(fp, b); }   // restore: the next Get must take it
  const g5b = await getAndWait(HQ);
  verdict(/new=1 issues_added=1/.test(g5b.line) && (await rows(HQ.page)).some(r => r.tag === 'A-4'), 'the same drop, bytes restored, is taken on the next Get (a refused drop is retried)', g5b.line);

  S('\n── V6 a revoked device\'s new report is refused ──');
  await F.sync(relay); await F.revoke(dB.kid, 0); await F.sync(relay);
  await mkIssue(B.page, 'B-2'); const sB2 = await sendAndWait(B);
  const n6 = (await rows(HQ.page)).length, g6 = await getAndWait(HQ), r6 = await rows(HQ.page);
  if (!/via=team/.test(sB2)) { S('   INCONCLUSIVE V6 — the revoked phone did not send (' + sB2 + '), nothing to refuse'); judged++; fails++; }
  else verdict(g6.refused.some(t => /reason=revoked/.test(t)) && r6.length === n6 && !r6.some(r => r.tag === 'B-2'), 'V6 refused with reason=revoked, rows unchanged', g6.line + ' | ' + g6.refused.join(' ; ') + ' rows ' + n6 + '→' + r6.length);

  for (const P of [A, B, HQ]) await P.ctx.close();
  await finish(browser);
})().catch(e => { S('🔴 witness crashed: ' + (e && e.stack || e)); fails++; finish(null); });

async function finish(browser) {
  if (browser) await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_HQ_VIEW ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_hq_view.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
}
