// ⚠ DO NOT REMOVE — WITNESS W-SITE-PROGRESS (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-28 "site progress is a fold over the Requests, shown in the model").
//   READ viewer/tests/witness_site_progress.log AFTER EVERY RUN (the exit code is not evidence). Numbers and § lines only; no screenshots.
// ISSUE THIS PROVES OR DISPROVES: site progress is COMPUTED from the Request rows (erp/site_progress.js, one pure read-only fold) and SHOWN in the model through the viewer's one existing tint path - never stored.
//   PART A (node, no browser): the fold over a Kernel store whose Requests are made and moved by the PRODUCT functions (RequestChanged.requestChanged, A.applyMissionPickup, A.applyMissionReport, A.verifyRequest of
//     viewer/mission_processor.js, resolver A.requestResolver) on the Duplex model:
//     G1 each state transition: New -> new; Prepared / On site -> open; a done report -> done; cannot -> cannot; cannot THEN done on the same element -> done; done THEN cannot -> cannot; done then Verify -> verified.
//     G2 a class Request of n elements with k done: exactly k elements done, n-k open, the line shows done=k (then one cannot, then all done, then Verify -> all verified).
//     G3 line arithmetic recomputed here by SQL + BigDecimal: planned, done, cannot, open, new, not_issued sum to planned when the Requests cover no more than planned; when they cover MORE, not_issued=0 and `excess` carries it.
//     G4 a Request tied to no line is listed as line:null and counted in the totals.
//   PART B (headless desktop Duplex, the product path of witness_mission_report.js: real push, Requests, Prepare, Send to site, the phone fills its real form, HQ "Get from team", Verify on the real Issue Log card):
//     G5 toggle on: the number of elements carrying each state colour in the tint path's own state (A._ruleTintMeshes) = the fold's counts = counts derived here from the Update rows by SQL; the table agrees.
//     G6 toggle off: every mesh's visible flag + material colour + instanceColor sum, and the scene's mesh count, equal the state recorded before turning it on (diff=0), twice.
//     G7 one further phone report arrives through "Get from team": the fold, the colours and the table change by EXACTLY that element.
//     G8 boot requests none of the new files; they load on demand; the phone profile has no control and requests none of them.
//     G9 nothing stored: the row count of every r_* and c_project* table is equal before and after turning the toggle on and off.
//   RED controls: R1 "the latest Update decides" removed -> G1 FAILS (cannot-then-done) · R2 the restore step (A.exitRuleModeTint in the toggle-off) removed -> G6 FAILS · R3 the fold made to read TaskStatus for a
//     class Request's per-element state -> G2 FAILS.
// Run: node viewer/tests/witness_site_progress.js [--node-only]      (part B about 15 minutes with the red control)
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path');
const NM = os.homedir() + '/bim-ootb/tests/node_modules/';
const { chromium } = require(process.env.PW || (NM + 'playwright'));
const ROOT = path.join(__dirname, '..', '..'), COMM = path.join(ROOT, 'common', 'comm');
const STORE = require(path.join(COMM, 'comm_store.js')), PIPE = require(path.join(COMM, 'comm_pipe.js')), DROP = require(path.join(COMM, 'team_drop.js'));

let FOLDER = null, MUT = null;   // FOLDER: the relay folder of the running scenario; MUT: a red control { file, edits:[{from,to}] } applied to that viewer file when served
function walkDir(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(n => { const p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walkDir(p, r, out); else out.push(r); }); return out; }
const mutate = (src, edits) => edits.reduce((s, e) => { if (s.indexOf(e.from) < 0) throw new Error('red control: snippet not found: ' + e.from); return s.replace(e.from, e.to); }, src);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (p === '/pipe/list') { const pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walkDir(FOLDER, '', []).filter(n => n.indexOf(pre) === 0))); return; }
  if (p.indexOf('/pipe/f/') === 0) { const fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
    if (req.method === 'PUT') { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
      if (u.searchParams.get('absent') === '1' && fs.existsSync(fp)) { res.writeHead(412); res.end(); return; }
      fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(201); res.end('ok'); }); return; }
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
  if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    let body = buf; if (MUT && p === '/viewer/' + MUT.file) body = Buffer.from(mutate(buf.toString('utf8'), MUT.edits));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body); });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESK = { viewport: { width: 1280, height: 800 }, acceptDownloads: true };
const CAT_UU = 'bdf15a57-436f-44d1-89f6-3925563cf296', TYPE_UU = 'be7c0c0c-4b1e-4fbb-ac29-3ad08c1d13a9', CLS = 'IfcDoor';
const ST = { NEW: 990001, PREPARED: 990002, ONSITE: 990003, REPORTED: 990004, VERIFIED: 990005 };

const log = []; let checks = 0, fails = 0, inconc = 0;
function S(m) { log.push(m); console.log(m); }
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-SITE-PROGRESS ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function waitLine(cons, re, ms, from) { for (let i = 0; i < (ms || 20000) / 200; i++) { const l = cons.slice(from || 0).find(t => re.test(t)); if (l) return l; await sleep(200); } return null; }

async function openPage(browser, base, profile, withPipe) {
  const ctx = await browser.newContext(profile), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  if (profile === PHONE) await ctx.addInitScript(() => {   // the harness stands in for the camera SENSOR only: a MediaStream of drawn frames; the Site Camera path after it is the real one
    navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
      let n = 0; const draw = () => { g.fillStyle = 'hsl(' + ((n++ * 20) % 360) + ',60%,45%)'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.fillText('W-SITE-PROGRESS frame ' + n, 20, 120); }; draw(); setInterval(draw, 200);
      return c.captureStream(5); };
  });
  page.on('console', m => { const t = m.text(); cons.push(t); if (/^§(MISSION|HQ_|REQ_CHANGED|LAZY|SITE_TASK|TASK_REPORT|REPORT|REQUEST_VERIFY|TASK_ROW|SITE_PROGRESS)/.test(t)) log.push('  [console ' + (profile === DESK ? 'HQ' : 'phone') + '] ' + t.slice(0, 260)); });
  page.on('request', r => reqs.push(r.url())); page.on('pageerror', e => { errs.push(String(e.message).slice(0, 200)); log.push('  [pageerror] ' + String(e.message).slice(0, 200)); });
  await page.goto(base + '/viewer/viewer.html?db=buildings/Duplex_extracted.db' + (withPipe ? '&pipe=' + encodeURIComponent(base + '/pipe') : ''), { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && APP.sendToHq && APP.flushHqOutbox && APP.lazy && window.UniversalHistory && window._mainPillActions)).catch(() => false); }
  return { ctx, page, cons, reqs, errs, ready };
}
// the device is made IN the page (its private keys never leave it), saved where the Team panel saves it
const makeDevice = page => page.evaluate(async () => {
  for (const n of ['comm_envelope', 'comm_order', 'team_keys', 'comm_roster', 'comm_admit', 'comm_pipe', 'comm_store']) {
    if (n === 'comm_store' && window.CommStore) continue;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../common/comm/' + n + '.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  const dev = await window.CommStore.newDevice(); dev.person_uu = crypto.randomUUID();
  await new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(dev, 'device'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; });
  return { kid: dev.kid, pubJwk: dev.pubJwk, dhPubJwk: dev.dhPubJwk, person_uu: dev.person_uu }; });
const setCfg = (page, cfg) => page.evaluate(cfg => new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(cfg, 'cfg'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; }), cfg);
const outboxCount = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('bim_hq_outbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
  r.onsuccess = () => { const q = r.result.transaction('q').objectStore('q').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(-1); }; r.onerror = () => res(-1); }));

// ── HQ: the real push, the Requests (from the model's own rows), the Kernel reads ─────────────────────────────────────
async function pushDoors(P) {
  const n0 = P.cons.length;
  await P.page.evaluate(async (cls) => { await window.APP.loadNavigate(); window.APP.applyFindScope(cls, {}); }, CLS); await sleep(2500);
  await P.page.waitForFunction(() => { const b = document.getElementById('find-erp-btn'); return b && b.offsetWidth > 0; }, null, { timeout: 30000 }).catch(() => {});
  await P.page.evaluate(() => document.getElementById('find-erp-btn').click());
  return waitLine(P.cons, /§PROJ_PUSH_PERSIST|§PROJ_PUSH_ERR|§PROJ_PUSH_DEFER/, 60000, n0);
}
// specs: [{ k, doc, date, value:'guid'|'class'|'x', sum, role }]; element guids come from the model (class `cls`, the k-th positioned row)
const makeRequests = (P, specs) => P.page.evaluate(async (a) => {
  const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; };
  if (!window.AdSiteTaskOverlay) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '../erp/ad_site_task_overlay.js'; sc.onload = res; sc.onerror = () => rej(new Error('ad_site_task_overlay.js')); document.head.appendChild(sc); });
  window.AdSiteTaskOverlay.ensure(db);
  const alloc = window.ProjFold._allocator(db);
  const proj = q('SELECT c_project_id, ad_client_id, ad_org_id, note FROM c_project WHERE value = ?', [APP.activeBuilding])[0];
  if (!proj) return { error: 'no Project Order after the push' };
  const typ = q('SELECT r_requesttype_id FROM r_requesttype WHERE r_requesttype_uu = ?', [a.TYPE_UU])[0], cat = q('SELECT r_statuscategory_id FROM r_statuscategory WHERE r_statuscategory_uu = ?', [a.CAT_UU])[0];
  if (!typ || !cat) return { error: 'the Site Task rows are not in the store' };
  const nw = q("SELECT r_status_id FROM r_status WHERE r_statuscategory_id = ? AND isdefault = 'Y'", [cat[0]])[0];
  const model = APP.dbQuery("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = ? AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid", [a.single]);
  const tpl = q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product WHERE value = ?', [a.CLS])[0] || q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product WHERE m_product_id >= 990000 LIMIT 1')[0];
  const now = '2026-11-28 12:00:00';
  function product(value) {
    const have = q('SELECT m_product_id FROM m_product WHERE value = ?', [value])[0]; if (have) return have[0];
    const id = alloc('m_product', 'm_product_id');
    db.run("INSERT INTO m_product (m_product_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,value,name,m_product_category_id,c_uom_id,producttype,issummary,isstocked,issold,ispurchased,m_product_uu,c_taxcategory_id) VALUES (?,?,?,'Y',?,100,?,100,?,?,?,?,'I','N','N','Y','Y',?,?)",
      [id, proj[1], proj[2], now, now, value, value + ' (W-SITE-PROGRESS)', tpl[0], tpl[1], crypto.randomUUID(), tpl[2]]);
    return id;
  }
  const out = { project: proj[0], note_guids: proj[3] ? String(proj[3]).split(',').length : 0, new_status: nw[0], reqs: {} };
  for (const s of a.specs) {
    const value = s.value === 'class' ? a.CLS : s.value === 'none' ? 'WO26-NO-SUCH-ELEMENT' : model[s.nth][0];
    const pid = product(value), id = alloc('r_request', 'r_request_id'), uu = crypto.randomUUID();
    db.run("INSERT INTO r_request (r_request_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,documentno,r_requesttype_id,r_status_id,priority,priorityuser,duetype,summary,confidentialtype,confidentialtypeentry,isescalated,isselfservice,salesrep_id,ad_role_id,result,processed,isinvoiced,requestamt,m_product_id,c_project_id,datestartplan,startdate,r_request_uu) " +
      "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,'5','5','5',?,'C','C','N','N',100,?,?,'N','N',0,?,?,?,?,?)", [id, proj[1], proj[2], now, now, s.doc, typ[0], nw[0], s.sum, s.role, s.result || null, pid, proj[0], s.date, now, uu]);
    out.reqs[s.k] = { id, uu, doc: s.doc, value, role: s.role };
  }
  await window.ProjOrderState.persistShared(db, 'witness');
  return out;
}, { specs, TYPE_UU, CAT_UU, CLS, single: SINGLE });
let SINGLE = 'IfcWindow';
const up = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, sel);
async function tapRow(page, rowId) {
  const pt = await page.evaluate(id => { const r = document.getElementById(id); if (!r) return null; r.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, rowId);
  if (!pt) return false; await page.waitForTimeout(150); await page.touchscreen.tap(pt[0], pt[1]); return true;
}
async function openMissionsRow(page, viaDrawer) {
  let have = null, tapped = null;
  if (viaDrawer !== false) {   // the first time: the real drawer row, touched
    await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await sleep(400);
    await up(page, '#pill-navigate'); await sleep(500);
    have = await page.evaluate(() => !!document.getElementById('drawer-row-missions'));
    tapped = have && await tapRow(page, 'drawer-row-missions');
  } else await page.evaluate(() => { const e = document.getElementById('missions-sheet'); if (!e || e.style.display === 'none') APP.openMissionInbox(); });
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => { const e = document.getElementById('missions-sheet'); return !!(e && e.style.display !== 'none'); })) break; await sleep(250); }
  return { have, tapped, shown: await page.evaluate(() => { const e = document.getElementById('missions-sheet'); return !!(e && e.style.display !== 'none'); }) };
}
async function missionsGet(P) { const n = P.cons.length; await P.page.evaluate(() => document.getElementById('missions-get').click()); const l = await waitLine(P.cons, /^§MISSION_LIST /, 60000, n); await sleep(300);
  return { line: l, status: await P.page.evaluate(() => (document.getElementById('missions-status') || {}).textContent || ''), rows: await P.page.evaluate(() => [...document.querySelectorAll('#missions-list .mission-row')].map(b => b.textContent)) }; }
async function clickRow(P, i) { const n = P.cons.length; await P.page.evaluate(i => document.querySelectorAll('#missions-list .mission-row')[i].click(), i); const l = await waitLine(P.cons, /^§MISSION_PICKUP /, 30000, n); return { line: l, logs: P.cons.slice(n) }; }

// ── WO-15 additions: the Kernel read, the phone's real form, the drops ─────────────────────────────────────────────────────────
const click = (page, id) => page.evaluate(i => { const e = document.getElementById(i); if (!e) return false; e.click(); return true; }, id);
const setSel = (pg, id, v) => pg.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
const tick = (pg, idx) => pg.evaluate(i => { document.getElementById('tf-checklist-' + i).click(); }, idx);
const pad = n => (n < 10 ? '0' : '') + n;
const fmtTs = iso => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + ('00' + d.getMilliseconds()).slice(-3); };
const SOLVED = 'f0f97e10-54a7-4d37-9096-8e7ee42156a3';   // R_Resolution "Solved" (the seed's UU)
const readFull = (P, reqs) => P.page.evaluate(async (ids) => {
  const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; }, out = {};
  Object.keys(ids).forEach(k => { const id = ids[k];
    const r = q('SELECT r_status_id, r_resolution_id, taskstatus, closedate, result, lastresult, datelastaction, starttime, endtime, qtyspent, m_productspent_id, processed FROM r_request WHERE r_request_id = ?', [id])[0] || [];
    out[k] = { status: r[0], resolution: r[1], taskstatus: r[2], closedate: r[3], result: r[4], lastresult: r[5], datelastaction: r[6], starttime: r[7], endtime: r[8], qtyspent: r[9], prod: r[10], processed: r[11],
      actions: q('SELECT r_requestaction_id, r_status_id FROM r_requestaction WHERE r_request_id = ? ORDER BY r_requestaction_id', [id]).map(v => ({ id: v[0], status: v[1] })),
      updates: q('SELECT r_requestupdate_id, result, starttime, endtime, qtyspent, m_productspent_id, r_requestupdate_uu FROM r_requestupdate WHERE r_request_id = ? ORDER BY r_requestupdate_id', [id]).map(v => ({ id: v[0], result: v[1], starttime: v[2], endtime: v[3], qtyspent: v[4], prod: v[5], uu: v[6] })) }; });
  return out; }, Object.fromEntries(Object.entries(reqs).map(([k, v]) => [k, v.id])));
// the reference list, read by SQL by its NAME (not through the column the product code follows)
const clearSeen = P => P.page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({}, 'viewer_drops'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; }));
// HQ "Get from team" (the real function); returns the new console lines
async function hqGet(HQ) { const n = HQ.cons.length; await HQ.page.evaluate(() => APP.getFromTeam()); await sleep(300); return HQ.cons.slice(n); }
// the phone does the current task through its real form. kind: 'done' | 'cannot'. o = { text, resolution, material:{i,qty}, ticks:[idx], photo, reason }
async function phoneTask(PH, kind, o) {
  o = o || {}; const n = PH.cons.length;
  await click(PH.page, 'mission-here'); await sleep(250);
  if (kind === 'cannot') {
    await click(PH.page, 'mission-cant'); await sleep(250);
    await PH.page.evaluate(r => { document.getElementById('mission-reason').value = r; }, o.reason); await click(PH.page, 'mission-cant-send');
  } else {
    await click(PH.page, 'mission-open-form'); await sleep(250);
    if (o.resolution) await setSel(PH.page, 'tf-resolution', o.resolution);
    if (o.text != null) await PH.page.evaluate(t => { document.getElementById('tf-result').value = t; }, o.text);
    if (o.material) { await setSel(PH.page, 'tf-material-product', o.material.product); await PH.page.evaluate(q => { document.getElementById('tf-material-qty').value = String(q); }, o.material.qty); }
    for (const i of (o.ticks || [])) await tick(PH.page, i);
    await click(PH.page, 'mission-done');
  }
  const l = await waitLine(PH.cons, /^§TASK_REPORT /, 30000, n); await sleep(500);
  return l;
}
// the report drops the phone put in the team folder, opened by the node-side member: [{ id, rep, files:[names] }]
async function phoneReports(R) {
  await R.H.sync(R.relay); const out = [], roster = (await R.H.order()).roster, ring = await R.H.keyring();
  for (const d of (await DROP.list(R.relay, R.sp.space)).filter(x => x.kid === R.phDev.kid)) {
    const o = await DROP.open(R.relay, { space: R.sp.space, kid: d.kid, id: d.id, roster, ring }); if (!o.ok || o.label !== 'bim-site-report') continue;
    const jf = o.files.filter(f => /\.json$/.test(f.name))[0]; let rep = null; try { rep = JSON.parse(Buffer.from(jf.bytes).toString('utf8')); } catch (e) { rep = null; }
    if (rep && rep.task) out.push({ id: d.id, rep, files: o.files.filter(f => !/\.json$/.test(f.name)).map(f => f.name) }); }
  return out;
}
// the Issue Log of the HQ page: rows of kind 'task' and the cards in the DOM
const taskRows = P => P.page.evaluate(async () => { const all = await APP._getAllIssues(); return all.filter(r => r.kind === 'task').map(r => ({ request_uu: r.request_uu, task: r.task, status: r.status, req_status: r.req_status, outcome: r.outcome })); });
const taskCards = P => P.page.evaluate(async () => { if (!document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues(); await APP._renderIssueList(); await new Promise(r => setTimeout(r, 300));
  return Array.from(document.querySelectorAll('#issues-list .issue-task')).map(c => ({ request: c.getAttribute('data-request'), req_status: c.getAttribute('data-req-status'), issue: c.getAttribute('data-issue-status'), verify: !!c.querySelector('.issue-verify') })); });


// ══ PART A - the fold in node, rows made by the product functions ════════════════════════════════════════════════════════════════════════════════
const Module = require('module');
const BD = require(path.join(ROOT, 'erp', 'bigdecimal.js')); globalThis.BigDecimal = BD;   // erp/site_progress.js reads the global (no load-order edge)
function loadFold(edits) {   // erp/site_progress.js, optionally with a red-control edit applied to its text
  const file = path.join(ROOT, 'erp', 'site_progress.js'); let src = fs.readFileSync(file, 'utf8');
  (edits || []).forEach(e => { if (src.indexOf(e.from) < 0) throw new Error('red control: snippet not found: ' + e.from); src = src.replace(e.from, e.to); });
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports;
}
const KS = { NEW: 990001, PREPARED: 990002, ONSITE: 990003, REPORTED: 990004, VERIFIED: 990005 };
const TABLES = db => { const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'r\\_%' ESCAPE '\\' OR name LIKE 'c\\_project%' ESCAPE '\\') ORDER BY name"); return r.length ? r[0].values.map(v => v[0]) : []; };
const rowCounts = db => Object.fromEntries(TABLES(db).map(t => [t, db.exec('SELECT COUNT(*) FROM "' + t + '"')[0].values[0][0]]));

async function buildWorld() {
  const SQL = await require(NM + 'sql.js')();
  const kdb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  const mdb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'viewer', 'buildings', 'Duplex_extracted.db')));
  global.window = globalThis;
  window.FindErpPush = require(path.join(ROOT, 'viewer', 'find_erp_push.js'));
  window.RequestChanged = require(path.join(ROOT, 'erp', 'request_changed.js'));
  window.AdSiteTaskOverlay = require(path.join(ROOT, 'erp', 'ad_site_task_overlay.js'));
  window.ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
  window.ProjOrderState = { shared: async () => ({ db: kdb }), persistShared: async () => true };
  require(path.join(ROOT, 'viewer', 'mission_processor.js'));
  const mq = (s, p) => { const r = mdb.exec(s, p || []); return r.length ? r[0].values : []; };
  const A = { db: true, _SQL: SQL, dbQuery: mq, cachedFetch: async () => null, walkStoreyLevels: [], activeBuilding: 'W28-NODE' };
  window.setupMissionProcessor(A);
  window.AdSiteTaskOverlay.ensure(kdb);
  const q = (s, p) => { const r = kdb.exec(s, p || []); return r.length ? r[0].values : []; };
  const pos = (cls, n) => mq("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = ? AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid LIMIT " + n, [cls]).map(r => r[0]);
  const doors = pos('IfcDoor', 6), wins = pos('IfcWindow', 3);
  const other = mq("SELECT m.guid FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class LIKE 'Ifc%' AND m.ifc_class NOT IN ('IfcDoor','IfcWindow','IfcSpace','IfcOpeningElement') AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid LIMIT 1").map(r => r[0]);
  return { SQL, kdb, mdb, A, q, mq, doors, wins, other: other[0] };
}
// the store: ONE Project Order (note = the 6 pushed doors), two lines, five Requests of the "Site Task" type
function arrange(W) {
  const { kdb, q, doors, wins, other } = W, alloc = window.ProjFold._allocator(kdb), now = '2026-11-28 12:00:00', X = { reqs: {}, lines: {} };
  const typ = q('SELECT r_requesttype_id FROM r_requesttype WHERE r_requesttype_uu = ?', [TYPE_UU])[0][0];
  const tpl = q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product WHERE m_product_id >= 990000 LIMIT 1')[0] || q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product LIMIT 1')[0];
  const product = value => { const have = q('SELECT m_product_id FROM m_product WHERE value = ?', [value])[0]; if (have) return have[0]; const id = alloc('m_product', 'm_product_id');
    kdb.run("INSERT INTO m_product (m_product_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,value,name,m_product_category_id,c_uom_id,producttype,issummary,isstocked,issold,ispurchased,m_product_uu,c_taxcategory_id) VALUES (?,11,0,'Y',?,100,?,100,?,?,?,?,'I','N','N','Y','Y',?,?)",
      [id, now, now, value, value + ' (W-SITE-PROGRESS)', tpl[0], tpl[1], require('crypto').randomUUID(), tpl[2]]); return id; };
  const pid = alloc('c_project', 'c_project_id');
  kdb.run("INSERT INTO c_project (c_project_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,value,name,issummary,iscommitment,plannedamt,plannedqty,plannedmarginamt,committedamt,processed,committedqty,invoicedamt,invoicedqty,projectbalanceamt,iscommitceiling,projinvoicerule,projectlinelevel,note,c_project_uu,c_currency_id) VALUES (?,11,0,'Y',?,100,?,100,'W28-NODE','W28 node project','N','N',0,0,0,0,'N',0,0,0,0,'N','-','P',?,?,(SELECT c_currency_id FROM c_currency LIMIT 1))",
    [pid, now, now, doors.join(','), require('crypto').randomUUID()]);
  X.project = pid; X.projRow = { id: pid, note: doors.join(','), value: 'W28-NODE', ad_client_id: 11 };
  const line = (no, prodValue, planned) => { const id = alloc('c_projectline', 'c_projectline_id');
    kdb.run("INSERT INTO c_projectline (c_projectline_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,c_project_id,line,plannedqty,plannedprice,plannedamt,plannedmarginamt,invoicedamt,invoicedqty,isprinted,processed,m_product_id,c_projectline_uu) VALUES (?,11,0,'Y',?,100,?,100,?,?,?,0,0,0,0,0,'Y','N',?,?)",
      [id, now, now, pid, no, planned, product(prodValue), require('crypto').randomUUID()]); X.lines[no] = id; return id; };
  line(10, 'IfcDoor', '8.5'); line(20, 'IfcWindow', '2');
  const tbl = q("SELECT ad_table_id FROM ad_table WHERE tablename = 'C_ProjectLine'")[0][0];
  const req = (k, doc, date, value, record) => { const id = alloc('r_request', 'r_request_id'), uu = require('crypto').randomUUID();
    kdb.run("INSERT INTO r_request (r_request_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,documentno,r_requesttype_id,r_status_id,priority,priorityuser,duetype,summary,confidentialtype,confidentialtypeentry,isescalated,isselfservice,salesrep_id,ad_role_id,processed,isinvoiced,requestamt,m_product_id,c_project_id,datestartplan,startdate,r_request_uu,ad_table_id,record_id) " +
      "VALUES (?,11,0,'Y',?,100,?,100,?,?,?,'5','5','5',?,'C','C','N','N',100,103,'N','N',0,?,?,?,?,?,?,?)", [id, now, now, doc, typ, KS.NEW, 'W28 ' + k, product(value), pid, date, now, uu, record ? tbl : null, record || null]);
    X.reqs[k] = { id, uu, value }; return X.reqs[k]; };
  req('RC', 'W28-1', '2026-12-01 08:00:00', 'IfcDoor', null);                         // a class Request: tied to line 10 by its product
  req('RS1', 'W28-2', '2026-12-02 08:00:00', wins[0], X.lines[20]);                   // single elements tied to line 20 by AD_Table_ID + Record_ID
  req('RS2', 'W28-3', '2026-12-03 08:00:00', wins[1], X.lines[20]);
  req('RS3', 'W28-4', '2026-12-04 08:00:00', wins[2], X.lines[20]);
  req('RN', 'W28-5', '2026-12-05 08:00:00', other, null);                             // tied to NO line (G4)
  X.guid = { RS1: wins[0], RS2: wins[1], RS3: wins[2], RN: other }; X.doors = doors; X.tbl = tbl;
  return X;
}

async function partA(Fold, label) {
  const W = await buildWorld(), X = arrange(W), { kdb, A } = W, RC = window.RequestChanged, out = { label, steps: [], truth: {} };
  const resolver = () => A.requestResolver(kdb, X.projRow);
  const fold = () => Fold.siteProgress(kdb, X.project, resolver(), { quiet: true });
  const step = (name, want, got) => { const ok = JSON.stringify(want) === JSON.stringify(got); out.steps.push({ name, ok, want, got }); return ok; };
  const states = (f, guids) => guids.map(g => (f.elements[g] || {}).state || 'absent');
  const truth = out.truth;   // what THIS witness did to each element, kept apart from every row: guid -> state
  const setT = (guids, s) => guids.forEach(g => { truth[g] = s; });
  const SINGLES = ['RS1', 'RS2', 'RS3', 'RN'], allG = X.doors.concat(SINGLES.map(k => X.guid[k]));
  let n = 0; const rep = (k, outcome, guid, extra) => Object.assign({ kind: 'task-report', v: 1, mission: 'M-W28', task: X.reqs[k].uu + (guid ? '#' + guid : ''), outcome, of: X.doors.length, at: '2026-11-28T10:00:' + String(10 + (n++)).padStart(2, '0') + '.000Z', reason: outcome === 'cannot' ? 'blocked ' + n : undefined }, extra || {});
  const apply = async r => { const a = await A.applyMissionReport(r, { kid: 'kid-w28' }); if (a.refused) throw new Error('report refused: ' + a.refused); return a; };
  const before = rowCounts(kdb);

  // G1.s0 every Request still New -> every element `new`
  setT(allG, 'new'); let f = fold();
  step('s0 New -> new', allG.map(() => 'new'), states(f, allG));
  // s1 Prepared (the processor's own status move = requestChanged) -> open
  Object.keys(X.reqs).forEach(k => { const m = RC.requestChanged(kdb, X.reqs[k].id, { r_status_id: KS.PREPARED }, {}); if (!m.ok) throw new Error('prepared: ' + m.error); });
  setT(allG, 'open'); f = fold(); step('s1 Prepared -> open', allG.map(() => 'open'), states(f, allG));
  // s2 On site (the product pickup) -> open
  const pk = await A.applyMissionPickup({ mission: 'M-W28', requests: Object.keys(X.reqs).map(k => X.reqs[k].uu), by: 'w28' });
  f = fold(); step('s2 On site -> open (pickup moved ' + pk.moved + ')', allG.map(() => 'open'), states(f, allG));
  // s3 RS1 done, RS2 cannot, RS3 done
  await apply(rep('RS1', 'done')); await apply(rep('RS2', 'cannot')); await apply(rep('RS3', 'done'));
  setT([X.guid.RS1], 'done'); setT([X.guid.RS2], 'cannot'); setT([X.guid.RS3], 'done');
  f = fold(); step('s3 done / cannot / done', ['done', 'cannot', 'done'], states(f, [X.guid.RS1, X.guid.RS2, X.guid.RS3]));
  // s4 RS2: cannot THEN done -> done   (R1 target)
  await apply(rep('RS2', 'done')); setT([X.guid.RS2], 'done');
  f = fold(); step('s4 cannot THEN done -> done', 'done', states(f, [X.guid.RS2])[0]);
  // s5 RS3: done THEN cannot -> cannot
  await apply(rep('RS3', 'cannot')); setT([X.guid.RS3], 'cannot');
  f = fold(); step('s5 done THEN cannot -> cannot', 'cannot', states(f, [X.guid.RS3])[0]);
  // s6 RS1: done then Verify (the product Verify) -> verified
  const v = await A.verifyRequest(X.reqs.RS1.uu); setT([X.guid.RS1], 'verified');
  f = fold(); step('s6 done then Verify -> verified (verify ok=' + v.ok + ')', 'verified', states(f, [X.guid.RS1])[0]);
  out.g1 = out.steps.slice(); out.steps = [];

  // G2 the class Request: k = 2 doors done (one report each, as the phone sends them)
  const d = X.doors;
  await apply(rep('RC', 'done', d[0])); await apply(rep('RC', 'done', d[1])); setT([d[0], d[1]], 'done');
  f = fold(); const k = 2, ln = f.lines.filter(l => l.line === 10)[0];
  step('k=' + k + ' of n=' + d.length + ': done elements', [d[0], d[1]], d.filter(g => f.elements[g].state === 'done'));
  step('k done -> n-k open', d.length - k, d.filter(g => f.elements[g].state === 'open').length);
  step('the line shows done=k', k, ln && ln.done);
  out.g2k = { k, n: d.length, line: ln };
  // one door cannot (the first line is CANNOT PROCEED, the GUID follows on the second)
  await apply(rep('RC', 'cannot', d[2])); setT([d[2]], 'cannot');
  f = fold(); step('a class element cannot: exactly that one', [d[2]], d.filter(g => f.elements[g].state === 'cannot'));
  out.g2 = out.steps.slice(); out.steps = [];

  // G3/G4 at this point P (singles: verified / done / cannot / open ; class: 2 done, 1 cannot, 3 open)
  out.P = f; out.noWrite = (() => { const a = JSON.stringify(rowCounts(kdb)); fold(); const b = JSON.stringify(rowCounts(kdb)); return a === b; })();
  // the independent expectation: the witness's own ledger (truth) + SQL for the planned numbers and the Request -> line ties
  const lines = kdb.exec("SELECT line, plannedqty, c_projectline_id FROM c_projectline WHERE c_project_id = " + X.project + " ORDER BY line")[0].values;
  const ties = {};   // line no -> the guids of its Requests: by SQL on r_request (record_id for the singles, product for the class)
  const reqRows = kdb.exec("SELECT r.r_request_uu, r.record_id, r.ad_table_id, p.value FROM r_request r JOIN m_product p ON p.m_product_id = r.m_product_id WHERE r.c_project_id = " + X.project)[0].values;
  const lineOfRow = r => { for (const l of lines) { if (r[1] != null && Number(r[2]) === Number(X.tbl) && Number(r[1]) === Number(l[2])) return l[0]; }
    for (const l of lines) { const pv = kdb.exec("SELECT p.value FROM c_projectline pl JOIN m_product p ON p.m_product_id = pl.m_product_id WHERE pl.c_projectline_id = " + l[2])[0].values[0][0]; if (pv === r[3]) return l[0]; } return null; };
  reqRows.forEach(r => { const ln2 = lineOfRow(r); const gs = r[3] === 'IfcDoor' ? d : [r[3]]; const key = ln2 == null ? 'none' : String(ln2); (ties[key] = ties[key] || []).push.apply(ties[key], gs); });
  out.ties = ties; out.sqlLines = lines;
  out.truthP = Object.assign({}, truth);
  // G2 (continued): the cannot door is done at last, the rest follow -> all six done, the Request is Reported; Verify -> all six verified
  await apply(rep('RC', 'done', d[2])); for (let i = 3; i < d.length; i++) await apply(rep('RC', 'done', d[i]));
  f = fold(); step('cannot THEN done (class element) + the rest: all done', d.map(() => 'done'), states(f, d));
  const vc = await A.verifyRequest(X.reqs.RC.uu); f = fold();
  step('Verify the class Request: all verified (verify ok=' + vc.ok + ')', d.map(() => 'verified'), states(f, d));
  const l10 = f.lines.filter(l => l.line === 10)[0]; step('the line then shows done=n verified=n', [d.length, d.length], [l10.done, l10.verified]);
  out.g2b = out.steps.slice(); out.steps = [];
  return out;
}

function judgeG1(o) { const bad = o.g1.filter(s => !s.ok); return { ok: !bad.length && o.g1.length === 7, detail: o.g1.map(s => (s.ok ? '' : '✗ ') + s.name + ' ' + JSON.stringify(s.got)).join(' | ') }; }
function judgeG2(o) { const all = o.g2.concat(o.g2b); const bad = all.filter(s => !s.ok); return { ok: !bad.length && all.length === 7, detail: all.map(s => (s.ok ? '' : '✗ ') + s.name + ' want=' + JSON.stringify(s.want) + ' got=' + JSON.stringify(s.got)).join(' | ').slice(0, 900) }; }
function judgeG3(o) {
  const out = [], P = o.P; let ok = true, sawExcess = false, sawNotIssued = false;
  o.sqlLines.forEach(([no, planned]) => {
    const gs = Array.from(new Set(o.ties[String(no)] || [])), cnt = { verified: 0, done: 0, cannot: 0, open: 0, new: 0 };
    gs.forEach(g => { cnt[o.truthP[g]]++; });
    const pl = BD.fromString(String(planned)), cv = BD.of(gs.length); let ni = pl.subtract(cv), ex = cv.subtract(pl); if (ni.signum() < 0) ni = BD.ZERO; if (ex.signum() < 0) ex = BD.ZERO;
    const l = P.lines.filter(x => x.line === no)[0];
    if (!l) { ok = false; out.push('line ' + no + ' missing'); return; }
    const good = BD.fromString(l.planned).compareTo(pl) === 0 && l.done === cnt.done + cnt.verified && l.verified === cnt.verified && l.cannot === cnt.cannot && l.open === cnt.open && l.new === cnt.new && l.covered === gs.length &&
      BD.fromString(l.not_issued).compareTo(ni) === 0 && BD.fromString(l.excess).compareTo(ex) === 0 && BD.fromString(l.not_issued).signum() >= 0;
    const sum = BD.of(l.done + l.cannot + l.open + l.new).add(BD.fromString(l.not_issued));
    const sumOk = ex.signum() > 0 ? (BD.fromString(l.not_issued).signum() === 0 && BD.of(l.done + l.cannot + l.open + l.new).subtract(pl).compareTo(ex) === 0) : sum.compareTo(pl) === 0;
    if (ex.signum() > 0) sawExcess = true; if (ni.signum() > 0) sawNotIssued = true;
    if (!good || !sumOk) ok = false;
    out.push('line ' + no + ': planned ' + l.planned + ' done=' + l.done + '(verified ' + l.verified + ') cannot=' + l.cannot + ' open=' + l.open + ' new=' + l.new + ' not_issued=' + l.not_issued + ' excess=' + l.excess + ' | by SQL+BigDecimal: covered ' + gs.length + ' not_issued ' + ni + ' excess ' + ex + ' sum ' + sum + (good && sumOk ? '' : ' ✗'));
  });
  return { ok, vacuous: !(sawExcess && sawNotIssued), detail: out.join(' | ') + ' | one line over-covered=' + sawExcess + ', one under-covered=' + sawNotIssued };
}
function judgeG4(o) {
  const P = o.P, nl = P.lines.filter(l => l.line === null), T = P.totals, want = { verified: 0, done: 0, cannot: 0, open: 0, new: 0 };
  Object.keys(o.truthP).forEach(g => want[o.truthP[g]]++);
  const ok = nl.length === 1 && nl[0].requests === 1 && nl[0].covered === 1 && nl[0].open === 1 && T.line_null_requests === 1 && T.requests === 5 && T.elements === 10 && eq([T.verified, T.done, T.cannot, T.open, T.new], [want.verified, want.done, want.cannot, want.open, want.new]) && o.noWrite === true;
  return { ok, detail: 'line:null entries=' + nl.length + ' ' + JSON.stringify(nl[0] || null) + ' · totals ' + JSON.stringify({ requests: T.requests, elements: T.elements, line_null_requests: T.line_null_requests, verified: T.verified, done: T.done, cannot: T.cannot, open: T.open, new: T.new }) + ' (ledger ' + JSON.stringify(want) + ') · fold wrote nothing: ' + o.noWrite };
}

// ══ PART B - the toggle in the real viewer (headless desktop Duplex; the phone profile on the same team folder) ═══════════════════════════════
const HEX = { verified: '4fc3f7', done: '44cc44', open: 'ffaa33', cannot: 'cc4444', new: '888888' };   // the colours as the tint path's own materials carry them (viewer/site_progress_view.js header)
// the Kernel row counts of every r_* and c_project* table, read in the page
const pageCounts = P => P.page.evaluate(async () => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const t = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'r\\_%' ESCAPE '\\' OR name LIKE 'c\\_project%' ESCAPE '\\') ORDER BY name"); const names = t.length ? t[0].values.map(v => v[0]) : [], out = {};
  names.forEach(n => { out[n] = db.exec('SELECT COUNT(*) FROM "' + n + '"')[0].values[0][0]; }); return out; });
// the model's state the tint path can change: every mesh's visible flag, material colour, instanceColor sum, instance count (the witness's OWN traversal of the scene)
const sceneSnap = P => P.page.evaluate(() => { const out = []; APP.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLineSegments) {
  const m = o.material, hex = m && m.color && m.color.getHexString ? m.color.getHexString() : (Array.isArray(m) ? 'multi' : 'none'); let ic = 0;
  if (o.instanceColor && o.instanceColor.array) { const a = o.instanceColor.array; for (let i = 0; i < a.length; i++) ic += a[i]; }
  out.push(o.uuid + '|' + (o.visible ? 1 : 0) + '|' + hex + '|' + Math.round(ic * 1000) + '|' + (o.isInstancedMesh ? o.count : 0)); } }); return out; });
const snapDiff = (a, b) => { const A = new Set(a), B = new Set(b); let d = 0; A.forEach(x => { if (!B.has(x)) d++; }); B.forEach(x => { if (!A.has(x)) d++; }); return d; };
// what the toggle shows now: the tint path's own state, the fold the view kept, the table in the DOM
const readOn = P => P.page.evaluate(() => { const per = {}, n = {};
  (APP._ruleTintMeshes || []).forEach(m => { const hex = m.material.color.getHexString(); per[hex] = (per[hex] || 0) + ((m.userData && m.userData.ruleTintGuids) || []).length; });
  const f = APP.siteProgressLast ? APP.siteProgressLast() : null;
  return { per, active: !!APP._ruleTintActive, meshes: (APP._ruleTintMeshes || []).length,
    fold: f ? { totals: f.totals, lines: f.lines, elements: Object.fromEntries(Object.entries(f.elements).map(([g, e]) => [g, e.state])) } : null,
    table: Array.from(document.querySelectorAll('#find-progress-table tr[data-line]')).map(tr => Array.from(tr.children).map(td => td.textContent)),
    btn: (document.getElementById('find-progress-btn') || {}).textContent, resultShown: (document.getElementById('find-progress-result') || {}).style ? document.getElementById('find-progress-result').style.display !== 'none' : false }; });
async function toggle(P, re) { const n = P.cons.length; await P.page.evaluate(() => document.getElementById('find-progress-btn').click()); const l = await waitLine(P.cons, re, 90000, n); await sleep(400); return l; }
const ON_RE = /^§SITE_PROGRESS project=/, OFF_RE = /^§SITE_PROGRESS_OFF /;

// one run. o = { light:true } = the red-control run: no phone, no team folder, three New Requests, one on/off cycle
async function scenarioB(browser, base, label, o) {
  o = o || {}; FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'wo28-'));
  const R = { label, o }, SQL = await require(NM + 'sql.js')(), relay = PIPE.folderPipe(FOLDER, 'folder');
  const HQ = await openPage(browser, base, DESK, !o.light); R.HQ = HQ; R.bootReqs = HQ.reqs.slice();
  if (!HQ.ready) { S('§W-SITE-PROGRESS ABORT ' + label + ' the HQ page never became ready'); R.abort = true; return R; }
  if (o.light) {
    R.pushLine = await pushDoors(HQ);
    R.fx = await makeRequests(HQ, [{ k: 'S', doc: 'WO28-10', date: '2026-12-01 08:00:00', value: 'guid', nth: 0, sum: 'one', role: 103 }, { k: 'C', doc: 'WO28-30', date: '2026-12-03 08:00:00', value: 'class', sum: 'every door', role: 103 }]);
    if (R.fx.error) { S('§W-SITE-PROGRESS ABORT ' + label + ' ' + R.fx.error); R.abort = true; return R; }
    R.s0 = await sceneSnap(HQ); R.onLine = await toggle(HQ, ON_RE); R.on1 = await readOn(HQ); R.offLine = await toggle(HQ, OFF_RE); R.s1 = await sceneSnap(HQ); R.off1 = await readOn(HQ);
    return R;
  }
  const PH = await openPage(browser, base, PHONE, true); R.PH = PH;
  if (!PH.ready) { S('§W-SITE-PROGRESS ABORT ' + label + ' the phone page never became ready'); R.abort = true; return R; }
  const hqDev = await makeDevice(HQ.page), phDev = await makeDevice(PH.page), founder = await STORE.newDevice(); founder.person_uu = require('crypto').randomUUID();
  const sp = await STORE.newSpace('wo28-site', founder, founder.person_uu, 'Founder', 102);
  const H = STORE.open(new SQL.Database(), { SQL, space: sp.space, self: founder, access: () => ({ allowed: true }), tableId: () => null, log: () => {} }); await H.genesis(sp.params);
  for (const [d, nm] of [[hqDev, 'HQ desk'], [phDev, 'Site phone']]) { await H.addPerson({ person_uu: d.person_uu, name: nm, ad_role_id: 103, comm_admin: false }); await H.enroll(d.kid, d.pubJwk, d.person_uu, d.dhPubJwk); }
  await H.sync(relay); await setCfg(HQ.page, { space: sp.space, founder: false }); await setCfg(PH.page, { space: sp.space, founder: false });
  Object.assign(R, { sp, H, hqDev, phDev, relay });
  S('   §W-SITE-PROGRESS ARRANGE ' + label + ' space=' + sp.space.slice(0, 12) + ' hq=' + hqDev.kid + ' phone=' + phDev.kid);
  // the product path: the real push, Requests (S one element, X one element, C = every pushed door), the real Prepare + Send to site, the phone opens the mission (pickup), HQ gets it
  R.pushLine = await pushDoors(HQ);
  R.fx = await makeRequests(HQ, [{ k: 'S', doc: 'WO28-10', date: '2026-12-01 08:00:00', value: 'guid', nth: 0, sum: 'Inspect this one', role: 103 },
    { k: 'X', doc: 'WO28-20', date: '2026-12-02 08:00:00', value: 'guid', nth: 1, sum: 'Check the blocked one', role: 103 }, { k: 'C', doc: 'WO28-30', date: '2026-12-03 08:00:00', value: 'class', sum: 'Check every door', role: 103 }]);
  if (R.fx.error) { S('§W-SITE-PROGRESS ABORT ' + label + ' ' + R.fx.error); R.abort = true; return R; }
  const dl = HQ.page.waitForEvent('download', { timeout: 120000 }).catch(() => null), n0 = HQ.cons.length;
  await HQ.page.evaluate(() => document.getElementById('find-mission-btn').click());
  R.prepLine = await waitLine(HQ.cons, /^§MISSION_PREPARE project=/, 120000, n0); const d = await dl;
  if (d) { try { R.file = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); } catch (e) { R.file = null; } }
  await sleep(500); const n1 = HQ.cons.length;
  await HQ.page.evaluate(() => document.getElementById('find-mission-send').click()); R.sendLine = await waitLine(HQ.cons, /^§MISSION_SEND /, 60000, n1);
  if (!R.file || !/sealed=true/.test(R.sendLine || '')) { S('§W-SITE-PROGRESS ABORT ' + label + ' the mission was not made / sent: ' + R.prepLine + ' | ' + R.sendLine); R.abort = true; return R; }
  await openMissionsRow(PH.page); await missionsGet(PH); R.pickup = await clickRow(PH, 0); await sleep(1200);
  await hqGet(HQ);
  R.n = R.file.tasks.filter(t => String(t.id).indexOf('#') > 0).length;
  // before any report: the toggle shows everything issued as open (On site) - one on/off here also proves the fold on a store with no Update rows
  // the phone works the series in order: S done, X cannot, then k = 3 doors done
  R.sLine = await phoneTask(PH, 'done', { resolution: SOLVED, text: 'S ok' });
  R.xLine = await phoneTask(PH, 'cannot', { reason: 'door is locked' });
  R.k = 3; for (let i = 1; i <= R.k; i++) await phoneTask(PH, 'done', { resolution: SOLVED, text: 'door ' + i + ' ok' });
  await hqGet(HQ);
  // Verify S on the real Issue Log card
  R.cards = await taskCards(HQ); const n5 = HQ.cons.length;
  await HQ.page.evaluate(uu => { const b = document.querySelector('#issues-list .issue-task[data-request="' + uu + '"] .issue-verify'); if (b) b.click(); }, R.fx.reqs.S.uu);
  R.verifyLine = await waitLine(HQ.cons, /^§REQUEST_VERIFY /, 20000, n5); await sleep(500);
  await HQ.page.evaluate(() => { if (document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues(); });
  R.full = await readFull(HQ, R.fx.reqs);
  R.reportsBefore = await phoneReports(R);
  R.plannedDoors = await HQ.page.evaluate(async () => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
    const r = db.exec("SELECT pl.plannedqty FROM c_projectline pl JOIN m_product p ON p.m_product_id = pl.m_product_id JOIN c_project c ON c.c_project_id = pl.c_project_id WHERE p.value = 'IfcDoor' AND c.value = ?", [APP.activeBuilding]); return r.length ? r[0].values[0][0] : null; });
  // CYCLE 1: on -> read -> off, nothing in between
  R.rc0 = await pageCounts(HQ); R.s0 = await sceneSnap(HQ);
  R.onLine = await toggle(HQ, ON_RE); R.on1 = await readOn(HQ);
  R.offLine = await toggle(HQ, OFF_RE); R.s1 = await sceneSnap(HQ); R.rc1 = await pageCounts(HQ); R.off1 = await readOn(HQ);
  // CYCLE 2: on, one more door through the phone's real form + HQ "Get from team" (which refreshes the toggle), off
  R.s2 = await sceneSnap(HQ); R.on2Line = await toggle(HQ, ON_RE); R.on2 = await readOn(HQ);
  await phoneTask(PH, 'done', { resolution: SOLVED, text: 'door ' + (R.k + 1) + ' ok' });
  const nG = HQ.cons.length; await HQ.page.evaluate(() => APP.getFromTeam()); R.refreshLine = await waitLine(HQ.cons, /^§SITE_PROGRESS project=.* refresh=1/, 60000, nG); await sleep(500);
  R.on3 = await readOn(HQ); R.reportsAfter = await phoneReports(R); R.full3 = await readFull(HQ, R.fx.reqs);
  R.off2Line = await toggle(HQ, OFF_RE); R.s3 = await sceneSnap(HQ); R.off2 = await readOn(HQ);
  // the phone profile: the Find panel is built (not vacuous), the control is not, the module is not loaded
  R.phone = await PH.page.evaluate(async () => { await APP.loadNavigate(); return { caps_phone: !!(window._caps && window._caps.phone), find_built: !!document.getElementById('find-selected'), progress_btn: !!document.getElementById('find-progress-btn'), mission_btn: !!document.getElementById('find-mission-btn'), toggle_fn: typeof APP.siteProgressToggle, fold_global: typeof window.SiteProgress }; });
  R.phoneReqs = PH.reqs.filter(u => /site_progress/.test(u)); R.hqReqs = HQ.reqs.filter(u => /site_progress/.test(u)); R.bootHits = R.bootReqs.filter(u => /site_progress/.test(u));
  return R;
}

// ── the checks of part B ────────────────────────────────────────────────────────────────────────────────────────────────────────
const same = (a, b) => { const k = o => JSON.stringify(Object.keys(o).sort().map(x => [x, o[x]])); return k(a) === k(b); };
const colourCounts = per => ['verified', 'done', 'open', 'cannot', 'new'].map(s => [s, per[HEX[s]] || 0]);
function expectedFromRows(R, full) {   // counts derived HERE from the Update rows and statuses (SQL read of the page's Kernel), not from the fold
  const isGuid = l => /^[0-9A-Za-z_$]{22}$/.test(l), firstLines = rq => full[rq].updates.map(u => String(u.result).split('\n')[0]);
  const exp = { verified: 0, done: 0, open: 0, cannot: 0, new: 0 };
  [['S', 1], ['X', 1]].forEach(([k]) => { const fl = firstLines(k), last = fl.length ? fl[fl.length - 1] : null;
    if (full[k].status === ST.VERIFIED) exp.verified++; else if (last && /^CANNOT PROCEED:/.test(last)) exp.cannot++; else if (last) exp.done++; else exp.open++; });
  const dn = new Set(firstLines('C').filter(isGuid)); exp.done += dn.size; exp.open += R.n - dn.size;
  return exp;
}
function judgeG5(R) {
  const on = R.on1, f = on.fold, exp = expectedFromRows(R, R.full), T = f.totals, row = on.table.filter(r => r[1] === 'IfcDoor')[0], none = on.table.filter(r => r[0] === '(no line)')[0];
  const perWant = Object.fromEntries(['verified', 'done', 'open', 'cannot', 'new'].map(s => [HEX[s], exp[s]]).filter(x => x[1] > 0)), perGot = Object.fromEntries(Object.entries(on.per).filter(x => x[1] > 0));
  const foldCnt = { verified: T.verified, done: T.done, open: T.open, cannot: T.cannot, new: T.new };
  const pl = R.plannedDoors, ni = BD.fromString(String(pl)).subtract(BD.of(R.n)), niWant = ni.signum() < 0 ? '0' : String(ni);
  const ok = on.active && same(perGot, perWant) && eq(foldCnt, exp) && T.elements === R.n + 2 && !!row && Number(row[3]) === exp.done && Number(row[5]) === R.n - exp.done && row[7].indexOf(niWant) === 0 && !!none && Number(none[3]) === 1 && Number(none[4]) === 1 && /^§SITE_PROGRESS project=/.test(R.onLine || '');
  return { ok, vacuous: !(T.elements > 0 && Object.keys(perGot).length >= 3), detail: 'tint path colour counts ' + JSON.stringify(perGot) + ' · counts from the Update rows by SQL ' + JSON.stringify(perWant) + ' · fold ' + JSON.stringify(foldCnt) + ' (elements ' + T.elements + ', want ' + (R.n + 2) + ') · IfcDoor line row ' + JSON.stringify(row) + ' (done want ' + exp.done + ', open want ' + (R.n - exp.done) + ', not_issued want ' + niWant + ' = planned ' + pl + ' - ' + R.n + ') · no-line row ' + JSON.stringify(none) + ' · ' + R.onLine };
}
function judgeG6(R) {
  const d1 = snapDiff(R.s0, R.s1), d2 = snapDiff(R.s2, R.s3), m1 = /diff=(\d+)/.exec(R.offLine || ''), m2 = /diff=(\d+)/.exec(R.off2Line || '');
  return { ok: d1 === 0 && d2 === 0 && R.s0.length > 0 && R.off1.meshes === 0 && R.off1.active === false && !!m1 && m1[1] === '0' && !!m2 && m2[1] === '0', vacuous: R.s0.length === 0,
    detail: 'witness snapshot diff cycle 1 = ' + d1 + ', cycle 2 = ' + d2 + ' over ' + R.s0.length + ' meshes (visible+colour+instanceColor+count) · tint meshes left ' + R.off1.meshes + ' · ' + R.offLine + ' · ' + R.off2Line };
}
function judgeG7(R) {
  const a = R.on2.fold.elements, b = R.on3.fold.elements, ch = Object.keys(b).filter(g => a[g] !== b[g]);
  const nb = new Set(R.reportsBefore.map(x => x.id)), fresh = R.reportsAfter.filter(x => !nb.has(x.id)), gu = fresh.length === 1 ? String(fresh[0].rep.task).split('#')[1] : null;
  const pa = R.on2.per, pb = R.on3.per, dDone = (pb[HEX.done] || 0) - (pa[HEX.done] || 0), dOpen = (pb[HEX.open] || 0) - (pa[HEX.open] || 0);
  const rowA = R.on2.table.filter(r => r[1] === 'IfcDoor')[0], rowB = R.on3.table.filter(r => r[1] === 'IfcDoor')[0];
  const others = Object.keys(pb).filter(h => h !== HEX.done && h !== HEX.open).every(h => pb[h] === (pa[h] || 0));
  return { ok: ch.length === 1 && ch[0] === gu && a[gu] === 'open' && b[gu] === 'done' && dDone === 1 && dOpen === -1 && others && !!rowA && !!rowB && Number(rowB[3]) === Number(rowA[3]) + 1 && Number(rowB[5]) === Number(rowA[5]) - 1 &&
      /refresh=1/.test(R.refreshLine || '') && R.on3.fold.totals.done === R.on2.fold.totals.done + 1,
    detail: 'elements changed by "Get from team": ' + JSON.stringify(ch.map(g => [g, a[g], b[g]])) + ' · the new drop reports ' + JSON.stringify(gu) + ' (' + fresh.length + ' new drop) · colour counts done ' + (pa[HEX.done] || 0) + '->' + (pb[HEX.done] || 0) + ' open ' + (pa[HEX.open] || 0) + '->' + (pb[HEX.open] || 0) + ', other colours unchanged=' + others + ' · IfcDoor row ' + JSON.stringify(rowA) + ' -> ' + JSON.stringify(rowB) + ' · ' + R.refreshLine };
}
function judgeG8(R) {
  const has = re => R.hqReqs.some(u => re.test(u));
  const ok = R.bootHits.length === 0 && has(/erp\/site_progress\.js/) && has(/site_progress_view\.js/) && R.phone.caps_phone === true && R.phone.find_built === true && R.phone.progress_btn === false && R.phone.mission_btn === false && R.phone.toggle_fn === 'undefined' && R.phone.fold_global === 'undefined' && R.phoneReqs.length === 0;
  return { ok, detail: 'requests at page-ready (' + R.bootReqs.length + ' total) naming site_progress: ' + R.bootHits.length + ' · HQ requests after use: ' + JSON.stringify(R.hqReqs.map(u => u.replace(/^.*\/(erp|viewer)\//, '$1/').replace(/\?.*$/, ''))) + ' · phone: ' + JSON.stringify(R.phone) + ' site_progress requests ' + R.phoneReqs.length };
}
function judgeG9(R, nodeNoWrite) {
  const k = Object.keys(R.rc0), diff = k.filter(t => R.rc0[t] !== R.rc1[t]);
  return { ok: diff.length === 0 && k.length >= 10 && eq(Object.keys(R.rc0), Object.keys(R.rc1)) && nodeNoWrite === true, vacuous: k.length < 10,
    detail: k.length + ' tables (r_* and c_project*), rows ' + k.reduce((n, t) => n + R.rc0[t], 0) + ' -> ' + Object.keys(R.rc1).reduce((n, t) => n + R.rc1[t], 0) + ' · tables that differ: ' + JSON.stringify(diff) + ' · the fold alone wrote nothing (part A): ' + nodeNoWrite };
}

// ══ main ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
(async () => {
  const nodeOnly = process.argv.indexOf('--node-only') >= 0, logFile = path.join(__dirname, 'witness_site_progress.log');
  const flush = () => fs.writeFileSync(logFile, log.join('\n') + '\n');
  // the product's own § lines are primary evidence: keep them in the log (part A runs the real processor functions under node)
  const realLog = console.log; let tee = false;
  console.log = (...a) => { const t = a.join(' '); if (tee && /^§/.test(t) && !/^§(SCHEDULE|MISSION_PROCESSOR_READY|SITE_TASK_ENSURE|MISSION_PREPARE_ROWS)/.test(t)) log.push('  [node] ' + t.slice(0, 240)); if (!tee || !/^§/.test(t)) realLog(...a); };
  if (process.argv.indexOf('--smoke') >= 0) {   // development aid: ONE light on/off cycle, printed, nothing judged
    await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch();
    const L0 = await scenarioB(browser, base, 'smoke', { light: true });
    S('SMOKE on=' + L0.onLine + ' off=' + L0.offLine + ' snapDiff=' + snapDiff(L0.s0, L0.s1) + ' meshes=' + L0.s0.length); S(JSON.stringify(L0.on1).slice(0, 1500)); S(JSON.stringify(L0.off1).slice(0, 300));
    await browser.close(); server.close(); flush(); process.exit(0);
  }
  const res = {}; let red = 0;
  S('── PART A: the fold in node (Duplex model rows, Kernel store, rows made by RequestChanged / applyMissionPickup / applyMissionReport / verifyRequest) ──');
  tee = true; const A = await partA(loadFold(), 'real'); tee = false;
  res.G1 = judgeG1(A); res.G2 = judgeG2(A); res.G3 = judgeG3(A); res.G4 = judgeG4(A);
  let browserRan = false, B = null, L = null;
  if (!nodeOnly) {
    require('child_process');
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch();
    const probe = await openPage(browser, base, DESK, false);
    if (!probe.ready) { S('§W-SITE-PROGRESS ABORT model never ready'); flush(); process.exit(1); }
    SINGLE = await probe.page.evaluate((cls) => { const r = APP.dbQuery("SELECT m.ifc_class, COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.storey IS NOT NULL AND t.center_x IS NOT NULL AND m.ifc_class <> ? AND m.ifc_class LIKE 'Ifc%' AND m.ifc_class NOT IN ('IfcSpace','IfcOpeningElement') GROUP BY m.ifc_class HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, m.ifc_class LIMIT 1", [cls]); return r.length ? r[0][0] : null; }, CLS);
    await probe.ctx.close();
    S('── PART B: Duplex, HQ desktop + phone profile on a team folder; single-element class=' + SINGLE + '; class Request = every ' + CLS + ' of the pushed set ──');
    B = await scenarioB(browser, base, 'real', {});
    if (B.abort) { flush(); process.exit(1); }
    browserRan = true;
    S('── fixture: prepare=' + B.prepLine + ' · send=' + B.sendLine + ' · pickup=' + (B.pickup.line || 'none') + ' · requests ' + JSON.stringify(Object.fromEntries(Object.entries(B.fx.reqs).map(([k, v]) => [k, v.doc + ':' + v.value.slice(0, 10)]))) + ' · class tasks n=' + B.n + ' k=' + B.k + ' · verify=' + B.verifyLine + ' ──');
    res.G5 = judgeG5(B); res.G6 = judgeG6(B); res.G7 = judgeG7(B); res.G8 = judgeG8(B); res.G9 = judgeG9(B, A.noWrite);
    await B.HQ.ctx.close(); await B.PH.ctx.close(); flush();
    // R2 (browser): the toggle-off's restore step removed -> G6 FAILS
    S('\n── RED R2 the restore step (A.exitRuleModeTint in the toggle-off) removed ──');
    MUT = { file: 'site_progress_view.js', edits: [{ from: 'A.exitRuleModeTint(); }   // R2 marker: the restore step', to: '/* removed */ }   // R2 marker: the restore step' }] };
    L = await scenarioB(browser, base, 'R2', { light: true }); MUT = null;
    if (L.abort) S('§W-SITE-PROGRESS RED R2 ABORT'); else {
      const d = snapDiff(L.s0, L.s1), m = /diff=(\d+)/.exec(L.offLine || ''), det = d > 0 && !!m && Number(m[1]) > 0 && L.off1.meshes > 0;
      S('§W-SITE-PROGRESS RED R2 ' + (det ? 'detected' : 'NOT DETECTED') + ' - witness snapshot diff=' + d + ' over ' + L.s0.length + ' meshes, tint meshes left on after Off=' + L.off1.meshes + ' · ' + L.offLine); if (det) red++;
      await L.HQ.ctx.close();
    }
    await browser.close(); server.close();
  }
  ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'].forEach(k => { if (res[k]) check(k, res[k].ok && !res[k].vacuous, (res[k].vacuous ? 'VACUOUS ' : '') + res[k].detail); });
  // R1 / R3 (node): the fold edited in its text, the SAME scenario run again
  S('\n── RED R1 "the latest Update decides" removed ──');
  tee = true; const A1 = await partA(loadFold([{ from: 'if (mine) last = {', to: 'if (mine && !last) last = {' }]), 'R1'); tee = false;
  const j1 = judgeG1(A1); S('§W-SITE-PROGRESS RED R1 ' + (!j1.ok ? 'detected' : 'NOT DETECTED') + ' - ' + j1.detail.slice(0, 420)); if (!j1.ok) red++;
  S('\n── RED R3 the fold made to read TaskStatus for a class Request\'s per-element state ──');
  tee = true; const A3 = await partA(loadFold([{ from: 'else mine = cannot ?', to: 'else mine = r.taskstatus != null ? true : cannot ?' }]), 'R3'); tee = false;
  const j3 = judgeG2(A3); S('§W-SITE-PROGRESS RED R3 ' + (!j3.ok ? 'detected' : 'NOT DETECTED') + ' - ' + j3.detail.slice(0, 420)); if (!j3.ok) red++;
  const vacuous = Object.keys(res).some(k => res[k].vacuous), complete = browserRan && Object.keys(res).length === 9;
  const verdict = !complete || vacuous ? 'INCONCLUSIVE' : (fails === 0 && red === 3 ? 'PASS' : 'FAIL');
  S('§W-SITE-PROGRESS checks=' + checks + ' fail=' + fails + ' red=' + red + '/3 verdict=' + verdict);
  flush(); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-SITE-PROGRESS CRASH ' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_site_progress.log'), log.join('\n') + '\n'); process.exit(1); });
