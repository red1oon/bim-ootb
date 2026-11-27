// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-SEND-HQ-TEAM — bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 3 BUILD SPEC (owner decision 2026-11-27: "Drop the files").
// Issues this witness proves or disproves, phone emulation, Duplex, a dumb folder server as the team relay (?pipe=):
//   T1 a paired phone's "Send to HQ" still needed the user to pick Mail → now it goes to the team folder silently: §HQ_SEND via=team,
//      no share sheet, the folder holds 1 manifest + its parts, all under the phone's own drawer s/<space>/pub/<kid>/drop-<id>/.
//   T2 HQ (node, its OWN store, its own sync) opens the drop → the files are byte-equal to the bundle the phone built, and the
//      step-2 validator passes on them (report parses, 2 issues, each photo present with its magic bytes, walk = §WALK_TRACE lines).
//   T3 the relay never sees plaintext: no stored byte sequence in the whole folder contains the building name or an issue guid.
//   T4 offline → queued on the phone (outbox 1, folder unchanged); back online → flushed (outbox 0) and a second drop opens at HQ.
//   T5 an unpaired browser keeps the email route (share sheet), nothing reaches the folder — no default target for anyone.
//   T6 the same drop on the GitHub relay client (ghPipe against common/tests/gh_standin.js, node): ONE commit, HQ opens it, and a
//      drop written into another device's drawer is refused by the pipe (one writer per name).
//   RED controls (each MUST be refused by TeamDrop.open): a flipped byte in one part → part-hash; a manifest whose parts list is
//      edited after signing → bad-signature; the same drop under a device NOT in the roster → unknown-author.
// §-log first — READ viewer/tests/witness_send_hq_team.log after every run before any conclusion.
// Run:  node viewer/tests/witness_send_hq_team.js
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path');
const NM = os.homedir() + '/bim-ootb/tests/node_modules/';
const { chromium } = require(process.env.PW || (NM + 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const COMM = path.join(ROOT, 'common', 'comm');
const STORE = require(path.join(COMM, 'comm_store.js')), PIPE = require(path.join(COMM, 'comm_pipe.js')), DROP = require(path.join(COMM, 'team_drop.js'));
const ENV = require(path.join(COMM, 'comm_envelope.js'));

const FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-team-'));
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
  page.on('console', m => { const t = m.text(); cons.push(t); if (/§(HQ_|WALK_TRACE)/.test(t)) log.push('  [console] ' + t.slice(0, 220)); });
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

// the step-2 validator (same rules as W-SEND-HQ) over {name, type, b64}
function validate(files, nTrace, nIssues) {
  const P = [], byName = {}; files.forEach(f => { byName[f.name] = f; });
  const js = files.filter(f => /\.json$/.test(f.name)); if (js.length !== 1) { P.push('json files=' + js.length); return P; }
  let r; try { r = JSON.parse(Buffer.from(js[0].b64, 'base64').toString('utf8')); } catch (e) { P.push('report does not parse'); return P; }
  if (r.kind !== 'bim-site-report' || r.v !== 1) P.push('kind/v ' + r.kind + '/' + r.v);
  if (!Array.isArray(r.issues) || r.issues.length !== nIssues) P.push('issues ' + (r.issues && r.issues.length) + '!=' + nIssues);
  (r.issues || []).forEach(it => { const f = it.photo && byName[it.photo]; if (!f) { P.push('photo missing for issue ' + it.id); return; }
    const b = Buffer.from(f.b64, 'base64'); const jpg = b[0] === 0xFF && b[1] === 0xD8, png = b[0] === 0x89 && b[1] === 0x50;
    if (/\.jpg$/.test(f.name) ? !jpg : !png) P.push('bytes do not match ' + f.name); });
  if (!Array.isArray(r.walk) || r.walk.length !== nTrace) P.push('walk ' + (r.walk && r.walk.length) + '!=' + nTrace + ' trace lines');
  return P;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const SQL = await require(NM + 'sql.js')();
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  const relay = PIPE.folderPipe(FOLDER, 'folder');

  S('── arrange: HQ founds an encrypted team space (node), the phone makes its device in the page, HQ enrols it ──');
  const A = await open(browser, base);
  verdict(A.ready, 'Duplex loaded on the phone, sendToHq + flushHqOutbox present');
  if (!A.ready) { await finish(browser); return; }
  const phone = await makePhoneDevice(A.page);
  const hqDev = await STORE.newDevice(); hqDev.person_uu = require('crypto').randomUUID();
  const sp = await STORE.newSpace('hq-site', hqDev, hqDev.person_uu, 'HQ', 102);
  const H = STORE.open(new SQL.Database(), { SQL, space: sp.space, self: hqDev, access: () => ({ allowed: true }), tableId: () => null, log: () => {} });
  await H.genesis(sp.params);
  await H.addPerson({ person_uu: phone.person_uu, name: 'Site phone', ad_role_id: 103, comm_admin: false });
  await H.enroll(phone.kid, phone.pubJwk, phone.person_uu, phone.dhPubJwk);
  await H.sync(relay);
  await setCfg(A.page, { space: sp.space, founder: false });
  const R0 = (await H.order()).roster;
  S('   §HQT_ARRANGE space=' + sp.space.slice(0, 12) + ' hq=' + hqDev.kid + ' phone=' + phone.kid + ' encrypted=' + R0.encrypted + ' epoch=' + R0.epoch + ' phone_in_roster=' + !!R0.devices[phone.kid] + ' folder=' + FOLDER);

  S('\n── T1 paired phone: 2 issues + a 12-step walk → Send to HQ ──');
  await addIssues(A.page); const m = A.cons.length; await walk(A.page); await A.page.waitForTimeout(400);
  const nTrace = A.cons.slice(m).filter(t => /^§WALK_TRACE /.test(t)).length;
  await recordBundles(A.page);
  const before = walkDir(FOLDER, '', []);
  const tapped = await tapSend(A.page);
  let sendLine = ''; for (let i = 0; i < 60 && !sendLine; i++) { await A.page.waitForTimeout(500); sendLine = A.cons.find(t => /^§HQ_SEND via=team /.test(t)) || A.cons.find(t => /^§HQ_TEAM (nokey|flush_err)/.test(t)) || ''; }
  await A.page.waitForTimeout(500);
  const shared1 = await A.page.evaluate(() => window.__shared);
  const added = walkDir(FOLDER, '', []).filter(n => before.indexOf(n) < 0), drops1 = added.filter(n => /\/drop-[0-9a-f]{16}\/m\.json$/.test(n));
  const mine = 's/' + sp.space + '/pub/' + phone.kid + '/drop-';
  const dropFiles = added.filter(n => n.indexOf('/drop-') > 0);
  verdict(tapped && /^§HQ_SEND via=team drop=[0-9a-f]{16} parts=3 /.test(sendLine) && !shared1 && drops1.length === 1 && dropFiles.length === 4 && dropFiles.every(n => n.indexOf(mine) === 0),
    'T1 silent send: no share sheet, 1 manifest + 3 parts, all in the phone\'s own drawer', 'button=' + tapped + ' | ' + sendLine + ' | share_sheet=' + !!shared1 + ' drop_files=' + JSON.stringify(dropFiles.map(n => n.split('/').slice(3).join('/'))));

  S('\n── T2 HQ opens the drop with its own store ──');
  await H.sync(relay);
  const R = (await H.order()).roster, ring = await H.keyring();
  const list = await DROP.list(relay, sp.space);
  const bundles = await A.page.evaluate(() => window.__bundles);
  let o1 = null;
  if (list.length) o1 = await DROP.open(relay, { space: sp.space, kid: list[0].kid, id: list[0].id, roster: R, ring });
  const got = o1 && o1.ok ? o1.files.map(f => ({ name: f.name, type: f.type, b64: b64(f.bytes) })) : [];
  const sent = bundles && bundles[0] || [];
  const equal = got.length === sent.length && got.length > 0 && got.every((f, i) => f.name === sent[i].name && f.b64 === sent[i].b64);
  const P = got.length ? validate(got, nTrace, 2) : ['no files opened'];
  verdict(!!(o1 && o1.ok) && equal && P.length === 0 && nTrace >= 4, 'T2 HQ reads the same files the phone bundled, and the report validates',
    'drops=' + list.length + ' open=' + (o1 ? (o1.ok ? 'ok' : o1.reason) : 'none') + ' files=' + got.map(f => f.name.replace(/_\d{8}_\d{6}/, '') + ':' + Buffer.from(f.b64, 'base64').length).join(',') + ' byte_equal=' + equal + ' trace_lines=' + nTrace + ' problems=' + JSON.stringify(P));
  S('   §HQT_OPEN drop=' + (list[0] && list[0].id) + ' author=' + (list[0] && list[0].kid) + ' epoch=' + (o1 && o1.manifest && o1.manifest.epoch) + ' hq_ring_epochs=' + Object.keys(ring).join(','));

  S('\n── T3 the relay holds no plaintext ──');
  const needles = ['Duplex', 'W-SEND-HQ-1', 'W-SEND-HQ-2', 'IfcCovering', 'bim-site-report'];
  const hits = [];
  walkDir(FOLDER, '', []).forEach(n => { const s = fs.readFileSync(path.join(FOLDER, n)).toString('latin1'); needles.forEach(w => { if (s.indexOf(w) >= 0) hits.push(n.split('/').slice(2).join('/') + ':' + w); }); });
  verdict(hits.length === 0, 'T3 no building name / issue guid / report kind in any stored file', 'files_scanned=' + walkDir(FOLDER, '', []).length + ' hits=' + JSON.stringify(hits));

  S('\n── T4 offline → queued; online → flushed ──');
  await A.ctx.setOffline(true);
  const b4 = walkDir(FOLDER, '', []).length, c0 = A.cons.length;
  await tapSend(A.page);
  let q = ''; for (let i = 0; i < 20 && !q; i++) { await A.page.waitForTimeout(250); q = A.cons.slice(c0).find(t => /^§HQ_TEAM flushed /.test(t)) || ''; }
  const qLine = A.cons.slice(c0).find(t => /^§HQ_TEAM queued /.test(t)) || '', ob1 = await outboxCount(A.page), mid = walkDir(FOLDER, '', []).length;
  const c1 = A.cons.length;
  await A.ctx.setOffline(false);
  let fl = ''; for (let i = 0; i < 60 && !fl; i++) { await A.page.waitForTimeout(500); fl = A.cons.slice(c1).find(t => /^§HQ_TEAM flushed /.test(t)) || ''; }
  const ob2 = await outboxCount(A.page);
  await H.sync(relay);
  const list2 = await DROP.list(relay, sp.space), fresh = list2.filter(d => !list.some(x => x.id === d.id));
  const o2 = fresh.length ? await DROP.open(relay, { space: sp.space, kid: fresh[0].kid, id: fresh[0].id, roster: (await H.order()).roster, ring: await H.keyring() }) : null;
  verdict(!!qLine && /reason=offline/.test(q) && ob1 === 1 && mid === b4 && /sent=1 left=0/.test(fl) && ob2 === 0 && !!(o2 && o2.ok),
    'T4 queued while offline (folder unchanged), sent on reconnect, opens at HQ', qLine + ' | ' + q + ' | outbox ' + ob1 + '→' + ob2 + ' folder ' + b4 + '→' + mid + ' | ' + fl + ' | drops=' + list2.length + ' second=' + (o2 ? (o2.ok ? 'ok' : o2.reason) : 'none'));

  S('\n── RED controls: TeamDrop.open must refuse a forged drop ──');
  const d0 = list[0], dirName = DROP.dir(sp.space, d0.kid, d0.id);
  async function copyDrop(mut) { const mp = PIPE.memPipe('red'); for (const n of walkDir(FOLDER, '', []).filter(n => n.indexOf(dirName) === 0)) {
      let name = n, bytes = new Uint8Array(fs.readFileSync(path.join(FOLDER, n))); const r = mut ? await mut(name, bytes) : null; if (r) { name = r.name; bytes = r.bytes; } await mp.put(name, bytes); } return mp; }
  const ctxH = { space: sp.space, roster: (await H.order()).roster, ring: await H.keyring() };
  const flip = await copyDrop((n, b) => { if (/\/1\.bin$/.test(n)) { const c = new Uint8Array(b); c[40] ^= 1; return { name: n, bytes: c }; } return null; });
  const r1 = await DROP.open(flip, Object.assign({ kid: d0.kid, id: d0.id }, ctxH));
  const edit = await copyDrop((n, b) => { if (/m\.json$/.test(n)) { const mj = JSON.parse(Buffer.from(b).toString()); mj.parts.pop(); return { name: n, bytes: new Uint8Array(Buffer.from(JSON.stringify(mj))) }; } return null; });
  const r2 = await DROP.open(edit, Object.assign({ kid: d0.kid, id: d0.id }, ctxH));
  const stranger = await STORE.newDevice();
  const moved = await copyDrop(async (n, b) => { const nn = n.replace('/pub/' + d0.kid + '/', '/pub/' + stranger.kid + '/');
    if (/m\.json$/.test(n)) { const mj = JSON.parse(Buffer.from(b).toString()); mj.author = stranger.kid; const s2 = await ENV.sign(mj, stranger); return { name: nn, bytes: new Uint8Array(Buffer.from(JSON.stringify(s2))) }; }
    return { name: nn, bytes: b }; });
  const r3 = await DROP.open(moved, Object.assign({ kid: stranger.kid, id: d0.id }, ctxH));
  [['flipped byte in part 1', r1, 'part-hash'], ['parts list edited after signing', r2, 'bad-signature'], ['re-signed by a device not in the roster', r3, 'unknown-author']].forEach(x => {
    judged++; const red = x[1] && !x[1].ok && x[1].reason === x[2]; if (!red) fails++;
    S('   ' + (red ? '🟢 red control went RED as required — ' : '🔴 red control did NOT go red — ') + x[0] + ': ' + (x[1] ? (x[1].ok ? 'OPENED' : x[1].reason) : 'none') + ' (want ' + x[2] + ')'); });
  await A.ctx.close();

  S('\n── T5 an unpaired browser keeps the email route ──');
  const B = await open(browser, base);
  if (B.ready) {
    await addIssues(B.page); const b5 = walkDir(FOLDER, '', []).length;
    await tapSend(B.page); await B.page.waitForTimeout(1500);
    const shared = await B.page.evaluate(() => window.__shared), line = B.cons.find(t => /^§HQ_SEND /.test(t)) || '';
    verdict(/via=share ok files=3/.test(line) && !!shared && walkDir(FOLDER, '', []).length === b5 && !B.cons.some(t => /^§HQ_TEAM /.test(t)),
      'T5 unpaired → share sheet, folder untouched, no team path taken', line + ' folder ' + b5 + '→' + walkDir(FOLDER, '', []).length);
  } else verdict(false, 'T5 page did not load');
  await B.ctx.close();

  S('\n── T6 the same drop through the GitHub relay client (ghPipe against the GitHub stand-in, node) ──');
  const gh = await require(path.join(ROOT, 'common', 'tests', 'gh_standin.js')).start(), api = 'http://127.0.0.1:' + gh.port;
  const hq2 = await STORE.newDevice(), site2 = await STORE.newDevice(); hq2.person_uu = require('crypto').randomUUID(); site2.person_uu = require('crypto').randomUUID();
  const sp2 = await STORE.newSpace('hq-site-gh', hq2, hq2.person_uu, 'HQ', 102);
  const mk = dev => STORE.open(new SQL.Database(), { SQL, space: sp2.space, self: dev, access: () => ({ allowed: true }), tableId: () => null, log: () => {} });
  const H2 = mk(hq2), S2 = mk(site2);
  const pH = PIPE.ghPipe({ api, owner: 'o', repo: 'r', token: 't', self: hq2.kid, minGapMs: 0 }), pS = PIPE.ghPipe({ api, owner: 'o', repo: 'r', token: 't', self: site2.kid, minGapMs: 0 });
  await H2.genesis(sp2.params); await H2.addPerson({ person_uu: site2.person_uu, name: 'Site', ad_role_id: 103, comm_admin: false });
  await H2.enroll(site2.kid, site2.pubJwk, site2.person_uu, site2.dhPubJwk);
  await H2.sync(pH); await S2.sync(pS);
  const nk2 = DROP.newestKey(await S2.keyring());
  const src = [{ name: 'report.json', type: 'application/json', bytes: new Uint8Array(Buffer.from('{"kind":"bim-site-report"}')) }, { name: 'photo.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xFF, 0xD8, 1, 2, 3, 4, 5]) }];
  let o6 = null, commits = -1, refused = '';
  if (nk2) { const d6 = await DROP.seal(src, { space: sp2.space, epoch: nk2.epoch, key: nk2.key, signer: site2 });
    const c0 = pS.stats.commits; await pS.putMany(d6.entries); commits = pS.stats.commits - c0;
    try { await pS.putMany(d6.entries.map(e => ({ name: e.name.replace('/pub/' + site2.kid + '/', '/pub/' + hq2.kid + '/'), bytes: e.bytes }))); refused = 'ACCEPTED'; } catch (e) { refused = String(e.message).replace(/s\/[0-9a-f]{64}\/pub\/\S+/, '<name>').slice(0, 80); }
    await H2.sync(pH); const l6 = await DROP.list(pH, sp2.space);
    o6 = l6.length === 1 ? await DROP.open(pH, { space: sp2.space, kid: l6[0].kid, id: l6[0].id, roster: (await H2.order()).roster, ring: await H2.keyring() }) : { ok: false, reason: 'drops=' + l6.length }; }
  const eq6 = !!(o6 && o6.ok) && o6.files.length === 2 && o6.files.every((f, i) => f.name === src[i].name && Buffer.from(f.bytes).equals(Buffer.from(src[i].bytes)));
  verdict(!!nk2 && commits === 1 && eq6 && /not under my prefix/.test(refused), 'T6 one commit carries the drop on the GitHub client, HQ opens it, another device\'s drawer is refused',
    'key=' + !!nk2 + ' commits=' + commits + ' open=' + (o6 ? (o6.ok ? 'ok' : o6.reason) : 'none') + ' byte_equal=' + eq6 + ' foreign_drawer=' + refused);
  gh.close();
  await finish(browser);
})().catch(e => { S('🔴 witness crashed: ' + (e && e.stack || e)); fails++; finish(null); });

async function finish(browser) {
  if (browser) await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_SEND_HQ_TEAM ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_send_hq_team.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
}
