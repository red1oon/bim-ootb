// ⚠ DO NOT REMOVE — WITNESS W-MISSION-REPORT (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-15 "the report comes back").
//   READ viewer/tests/witness_mission_report.log AFTER EVERY RUN (the exit code is not evidence). Numbers and § lines only; no screenshots.
// ISSUE THIS PROVES OR DISPROVES: a step report made on the phone's REAL form becomes, on HQ's Kernel, what legacy would hold: the Request's Update row, its Resolution, time and material, its status and progress,
//   and HQ's "Verify" closes it. Product path (witness_mission_delivery.js harness): the real Find > ERP push of the doors, three Requests written into the Kernel from the model's rows (S one element with a pasted
//   checklist, C a class Request = every pushed door, X one element), the real "Prepare site mission" + "Send to site", the phone opens the mission (pickup), HQ gets it, the phone fills its form (resolution, text, material,
//   ticks, a photo from the real Site Camera, Done / Can't proceed), HQ "Get from team".
//   T1 S done: ONE new R_RequestUpdate whose Result = typed text + ticks in order + "photos: <the drop's file>", StartTime < EndTime (= the report's), QtySpent + M_ProductSpent_ID as typed, the Request's R_Resolution_ID = the
//      picked one, status Reported, History rows = the moves made (each holding the previous status: New, Prepared, On site), Request.Result cleared, LastResult = the text, DateLastAction set.
//   T2 the same report fetched again (HQ's "seen" memory cleared): §REPORT_DUP, no new Update row, no new History row.
//   T3 C (a class Request, n elements): after k done reports TaskStatus = the list step for k/n and the status is still On site; after n: the 100% value and Reported.
//   T4 X can't proceed: an Update starting "CANNOT PROCEED: <reason>", the Request stays On site, and it is an OPEN row in the Issue Log (card with no Verify).
//   T5 "Verify" (the real button on S's Issue Log card): Verified, CloseDate set, ONE new History row holding Reported; a phone profile's Issue Log shows a Reported task card WITHOUT a Verify control.
//   T6 independent numbers: the TaskStatus list is read by SQL here (by the reference's NAME), k/n -> step recomputed here, equal to literals and to what the Kernel stored.
//   RED controls: R1 de-duplication removed -> T2 FAILS · R2 the "all elements done" rule removed -> T3 FAILS (Reported too early) · R3 the cannot branch routed like done -> T4 FAILS.
// Run: node viewer/tests/witness_mission_report.js          (about 15 minutes with the three red controls)
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
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-MISSION-REPORT ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function waitLine(cons, re, ms, from) { for (let i = 0; i < (ms || 20000) / 200; i++) { const l = cons.slice(from || 0).find(t => re.test(t)); if (l) return l; await sleep(200); } return null; }

async function openPage(browser, base, profile, withPipe) {
  const ctx = await browser.newContext(profile), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  if (profile === PHONE) await ctx.addInitScript(() => {   // the harness stands in for the camera SENSOR only: a MediaStream of drawn frames; the Site Camera path after it is the real one
    navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
      let n = 0; const draw = () => { g.fillStyle = 'hsl(' + ((n++ * 20) % 360) + ',60%,45%)'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.fillText('W-MISSION-REPORT frame ' + n, 20, 120); }; draw(); setInterval(draw, 200);
      return c.captureStream(5); };
  });
  page.on('console', m => { const t = m.text(); cons.push(t); if (/^§(MISSION|HQ_|REQ_CHANGED|LAZY|SITE_TASK|TASK_REPORT|REPORT|REQUEST_VERIFY|TASK_ROW)/.test(t)) log.push('  [console ' + (profile === DESK ? 'HQ' : 'phone') + '] ' + t.slice(0, 260)); });
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
      [id, proj[1], proj[2], now, now, value, value + ' (W-MISSION-REPORT)', tpl[0], tpl[1], crypto.randomUUID(), tpl[2]]);
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
const readReqs = (P, reqs) => P.page.evaluate(async (ids) => {
  const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; }, out = {};
  Object.keys(ids).forEach(k => { const id = ids[k];
    out[k] = { status: (q('SELECT r_status_id FROM r_request WHERE r_request_id = ?', [id])[0] || [null])[0],
      actions: q('SELECT r_requestaction_id, r_status_id FROM r_requestaction WHERE r_request_id = ? ORDER BY r_requestaction_id', [id]).map(v => ({ id: v[0], status: v[1] })) }; });
  return out; }, Object.fromEntries(Object.entries(reqs).map(([k, v]) => [k, v.id])));
// the phone's real drawer: the pill, the Navigate drawer, a touch on the row
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
// take one photo through the REAL Site Camera (the harness replaces the camera SENSOR only)
async function photo(page, cons, takeId) {
  const n0 = cons.filter(t => /^§MISSION_PHOTO /.test(t)).length;
  await click(page, takeId);
  await page.waitForFunction(() => { const o = document.getElementById('site-cam-overlay'); return o && o.classList.contains('active'); }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => APP.snapSitePhoto());
  await page.waitForFunction(() => document.getElementById('site-cam-preview').classList.contains('active'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#site-cam-preview-controls button')).find(x => x.textContent.trim() === 'Save'); if (b) b.click(); });
  for (let i = 0; i < 50 && cons.filter(t => /^§MISSION_PHOTO /.test(t)).length === n0; i++) await sleep(200);
  await sleep(300);
  return cons.filter(t => /^§MISSION_PHOTO /.test(t)).length > n0;
}
// the Kernel's rows of each Request: the Request, its Updates and its History (read by SQL, not through the product code)
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
const readList = P => P.page.evaluate(async () => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const r = db.exec("SELECT l.value, l.name FROM ad_ref_list l JOIN ad_reference r ON r.ad_reference_id = l.ad_reference_id WHERE r.name = 'R_Request TaskStatus' ORDER BY l.value"); return r.length ? r[0].values : []; });
const idOfUU = (P, table, uuCol, idCol, uu) => P.page.evaluate(async (a) => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const r = db.exec('SELECT ' + a.idCol + ' FROM ' + a.table + ' WHERE ' + a.uuCol + ' = ?', [a.uu]); return r.length ? r[0].values[0][0] : null; }, { table, uuCol, idCol, uu });
// the witness's OWN rule for the class progress: the highest list step <= the real percentage; the 100% step only when all are done
function stepOf(list, k, n) { const L = list.map(([v, name]) => ({ v, pct: Number(/(\d+)\s*%/.exec(name)[1]) })).sort((a, b) => a.pct - b.pct); let best = null; const real = 100 * k / n;
  L.forEach(l => { if (k >= n ? l.pct === 100 : (l.pct < 100 && l.pct <= real)) best = l; }); return best && best.v; }
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
    if (o.photo) await photo(PH.page, PH.cons, 'tf-photos-take');
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

// ── one run. o = { classReq, upto:'T2'|'T3first'|'T4'|'all' } ─────────────────────────────────────────────────────────────────
const CHECK_LINES = ['Check the hinge', 'Check the latch', 'Check the seal'];
async function scenario(browser, base, label, o) {
  FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'wo15-'));
  const R = { label, o }, SQL = await require(NM + 'sql.js')(), relay = PIPE.folderPipe(FOLDER, 'folder');
  const HQ = await openPage(browser, base, DESK, true), PH = await openPage(browser, base, PHONE, true, true);
  Object.assign(R, { HQ, PH, relay });
  if (!HQ.ready || !PH.ready) { S('§W-MISSION-REPORT ABORT ' + label + ' a page never became ready (HQ=' + HQ.ready + ' phone=' + PH.ready + ')'); R.abort = true; return R; }
  const hqDev = await makeDevice(HQ.page), phDev = await makeDevice(PH.page), founder = await STORE.newDevice(); founder.person_uu = require('crypto').randomUUID();
  const sp = await STORE.newSpace('wo15-site', founder, founder.person_uu, 'Founder', 102);
  const H = STORE.open(new SQL.Database(), { SQL, space: sp.space, self: founder, access: () => ({ allowed: true }), tableId: () => null, log: () => {} }); await H.genesis(sp.params);
  for (const [d, nm] of [[hqDev, 'HQ desk'], [phDev, 'Site phone']]) { await H.addPerson({ person_uu: d.person_uu, name: nm, ad_role_id: 103, comm_admin: false }); await H.enroll(d.kid, d.pubJwk, d.person_uu, d.dhPubJwk); }
  await H.sync(relay); await setCfg(HQ.page, { space: sp.space, founder: false }); await setCfg(PH.page, { space: sp.space, founder: false });
  Object.assign(R, { sp, H, hqDev, phDev });
  S('   §W-MISSION-REPORT ARRANGE ' + label + ' space=' + sp.space.slice(0, 12) + ' hq=' + hqDev.kid + ' phone=' + phDev.kid + ' classReq=' + !!o.classReq + ' upto=' + o.upto);

  // the product path: the real push, Requests in the Kernel, the real Prepare + Send to site, the phone opens it (pickup), HQ gets it
  R.pushLine = await pushDoors(HQ);
  const specs = [{ k: 'S', doc: 'WO15-30', date: '2026-12-01 08:00:00', value: 'guid', nth: 0, sum: 'Inspect this one door', role: 103, result: CHECK_LINES.join('\n') }];
  if (o.classReq) specs.push({ k: 'C', doc: 'WO15-20', date: '2026-12-02 08:00:00', value: 'class', sum: 'Check every door', role: 103 });
  specs.push({ k: 'X', doc: 'WO15-10', date: '2026-12-03 08:00:00', value: 'guid', nth: 1, sum: 'Check the blocked one', role: 103 });
  R.fx = await makeRequests(HQ, specs);
  if (R.fx.error) { S('§W-MISSION-REPORT ABORT ' + label + ' ' + R.fx.error); R.abort = true; return R; }
  const dl = HQ.page.waitForEvent('download', { timeout: 120000 }).catch(() => null), n0 = HQ.cons.length;
  await HQ.page.evaluate(() => document.getElementById('find-mission-btn').click());
  R.prepLine = await waitLine(HQ.cons, /^§MISSION_PREPARE project=/, 120000, n0); const d = await dl;
  if (d) { try { R.file = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); } catch (e) { R.file = null; } }
  await sleep(500); const n1 = HQ.cons.length;
  await HQ.page.evaluate(() => document.getElementById('find-mission-send').click()); R.sendLine = await waitLine(HQ.cons, /^§MISSION_SEND /, 60000, n1);
  if (!R.file || !/sealed=true/.test(R.sendLine || '')) { S('§W-MISSION-REPORT ABORT ' + label + ' the mission was not made / sent: ' + R.prepLine + ' | ' + R.sendLine); R.abort = true; return R; }
  await openMissionsRow(PH.page); await missionsGet(PH); R.pickup = await clickRow(PH, 0); await sleep(1200);
  await hqGet(HQ);
  R.sNew = await readFull(HQ, R.fx.reqs);   // after prepare + pickup, before any report
  R.list = await readList(HQ);

  // task 1 = S (earliest DateStartPlan): the real form, every control
  R.material = R.file.mission.materials[0].id;
  R.typed = 'hinge loose, retightened';
  R.sLine = await phoneTask(PH, 'done', { resolution: SOLVED, text: R.typed, material: { product: R.material, qty: 1.5 }, ticks: [0, 2], photo: true });
  R.g1 = await hqGet(HQ); R.s1 = await readFull(HQ, R.fx.reqs);
  R.reports1 = await phoneReports(R);
  // T2: the same report fetched again (the "seen" memory of HQ is cleared)
  await clearSeen(HQ); R.g2 = await hqGet(HQ); R.s2 = await readFull(HQ, R.fx.reqs);
  if (o.upto === 'T2') return R;

  // the class Request: n = the doors of the pushed set, one report each (the form's outcome only); checkpoints k
  R.checks = {};
  if (o.classReq) {
    const nTasks = R.file.tasks.filter(t => String(t.id).indexOf('#') > 0).length; R.n = nTasks;
    const marks = o.upto === 'T3first' ? [1] : [3, 9, nTasks - 1, nTasks];
    for (let k = 1; k <= nTasks; k++) {
      await phoneTask(PH, 'done', { resolution: SOLVED, text: 'door ' + k + ' ok' });
      if (marks.indexOf(k) >= 0) { await hqGet(HQ); R.checks[k] = await readFull(HQ, R.fx.reqs); }
      if (o.upto === 'T3first' && k === 1) break;
    }
    if (o.upto === 'T3first') return R;
  }
  // X: cannot proceed
  R.reason = 'door is locked';
  R.xLine = await phoneTask(PH, 'cannot', { reason: R.reason });
  R.g4 = await hqGet(HQ); R.s4 = await readFull(HQ, R.fx.reqs); R.rows4 = await taskRows(HQ); R.cards4 = await taskCards(HQ);
  if (o.upto === 'T4') return R;

  // T5: Verify S in the Issue Log (the real button), and the phone's Issue Log carries no Verify
  R.cardsBefore = await taskCards(HQ);
  const n5 = HQ.cons.length;
  await HQ.page.evaluate((uu) => { const b = document.querySelector('#issues-list .issue-task[data-request="' + uu + '"] .issue-verify'); if (b) b.click(); }, R.fx.reqs.S.uu);
  R.verifyLine = await waitLine(HQ.cons, /^§REQUEST_VERIFY /, 20000, n5); await sleep(500);
  R.s5 = await readFull(HQ, R.fx.reqs); R.cards5 = await taskCards(HQ);
  R.phoneCards = await PH.page.evaluate(async () => { { const db = await APP._openIssuesDB(), tx = db.transaction('issues', 'readwrite'); tx.objectStore('issues').put({ kind: 'task', request_uu: 'u-probe', task: 't-probe', documentno: 'PROBE', element_class: 'Site task', req_status: 'Reported', status: 'open', outcome: 'done', timestamp: new Date().toISOString(), src_kid: 'phone-probe', src_id: 'task:t-probe' }); await new Promise(r => { tx.oncomplete = r; }); db.close(); }
    if (!document.getElementById('issues-panel').classList.contains('active')) APP.toggleIssues(); await APP._renderIssueList(); await new Promise(r => setTimeout(r, 300));
    return { caps_phone: !!(window._caps && window._caps.phone), cards: document.querySelectorAll('#issues-list .issue-task').length, verify: document.querySelectorAll('#issues-list .issue-verify').length }; });
  return R;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lastStatuses = a => a.actions.map(x => x.status);
function judgeT1(R) {
  const before = R.sNew.S, after = R.s1.S, up = after.updates.slice(before.updates.length), rep = (R.reports1.filter(x => x.rep.task === R.fx.reqs.S.uu)[0] || {}).rep, files = (R.reports1.filter(x => x.rep.task === R.fx.reqs.S.uu)[0] || {}).files || [];
  if (!rep || up.length !== 1) return { ok: false, detail: 'new Update rows=' + up.length + ' (want 1), report found=' + !!rep };
  const u = up[0], wantResult = [R.typed].concat(CHECK_LINES.map((l, i) => (i === 0 || i === 2 ? '[x] ' : '[ ] ') + l)).concat(['photos: ' + files.join(', ')]).join('\n');
  const wantStart = fmtTs(rep.start), wantEnd = fmtTs(rep.end);
  return { ok: after.updates.length === before.updates.length + 1 && u.result === wantResult && u.starttime === wantStart && u.endtime === wantEnd && u.starttime < u.endtime && Number(u.qtyspent) === 1.5 && u.prod === R.wantProd &&
      after.resolution === R.wantRes && after.status === ST.REPORTED && eq(lastStatuses(after), [ST.NEW, ST.PREPARED, ST.ONSITE]) && after.result == null && after.lastresult === wantResult && after.datelastaction != null && files.length === 1 && /\.jpg$/.test(files[0]),
    detail: 'new Update rows=1 · Result=' + JSON.stringify(u.result) + ' (want ' + JSON.stringify(wantResult) + ') · start/end ' + u.starttime + ' < ' + u.endtime + ' (report ' + wantStart + ' / ' + wantEnd + ') · qty ' + u.qtyspent + ' product ' + u.prod + ' (want ' + R.wantProd + ') · resolution ' + after.resolution + ' (want ' + R.wantRes + ') · status ' + after.status +
      ' (Reported=' + ST.REPORTED + ') · History previous statuses ' + JSON.stringify(lastStatuses(after)) + ' · Request.Result=' + JSON.stringify(after.result) + ' LastResult==Update.Result ' + (after.lastresult === wantResult) + ' DateLastAction=' + after.datelastaction };
}
function judgeT2(R) {
  const a = R.s1.S, b = R.s2.S, dupLine = R.g2.find(t => /^§REPORT_DUP request=\d+ task=/.test(t)) || '', err = R.g2.find(t => /^§REPORT_APPLY_ERR/.test(t)) || '';
  return { ok: !!dupLine && !err && b.updates.length === a.updates.length && b.actions.length === a.actions.length && b.status === a.status,
    detail: (dupLine || 'no §REPORT_DUP') + (err ? ' · ' + err : '') + ' · Update rows ' + a.updates.length + '→' + b.updates.length + ' History rows ' + a.actions.length + '→' + b.actions.length };
}
function judgeT3(R, marks) {
  const out = [], n = R.n; let ok = true;
  marks.forEach(k => { const c = R.checks[k] && R.checks[k].C; if (!c) { ok = false; out.push('k=' + k + ' no read'); return; }
    const want = stepOf(R.list, k, n), full = k >= n, doneGuids = new Set(c.updates.map(u => String(u.result).split('\n')[0]).filter(l => /^[0-9A-Za-z_$]{22}$/.test(l)));
    const good = c.taskstatus === want && c.status === (full ? ST.REPORTED : ST.ONSITE) && doneGuids.size === k;
    if (!good) ok = false; out.push('k=' + k + '/' + n + ' TaskStatus=' + c.taskstatus + ' (list step ' + want + ') status=' + c.status + ' (' + (full ? 'Reported' : 'On site') + ' wanted ' + (full ? ST.REPORTED : ST.ONSITE) + ') distinct done elements in Update rows=' + doneGuids.size + (good ? '' : ' ✗')); });
  return { ok, detail: out.join(' · ') };
}
function judgeT4(R) {
  const x = R.s4.X, before = R.sNew.X, up = x.updates.slice(before.updates.length), row = R.rows4.filter(r => r.request_uu === R.fx.reqs.X.uu)[0], card = R.cards4.filter(c => c.request === R.fx.reqs.X.uu)[0];
  return { ok: up.length === 1 && up[0].result.split('\n')[0] === 'CANNOT PROCEED: ' + R.reason && x.status === ST.ONSITE && !!row && row.status === 'open' && row.outcome === 'cannot' && !!card && card.issue === 'open' && card.verify === false,
    detail: 'new Update rows=' + up.length + ' first line=' + JSON.stringify(up[0] && up[0].result.split('\n')[0]) + ' · status ' + x.status + ' (On site=' + ST.ONSITE + ') · Issue Log row ' + JSON.stringify(row) + ' card ' + JSON.stringify(card) };
}
function judgeT5(R) {
  const a = R.s4.S, b = R.s5.S, rowsBefore = R.cardsBefore.filter(c => c.request === R.fx.reqs.S.uu)[0], rowAfter = R.cards5.filter(c => c.request === R.fx.reqs.S.uu)[0];
  return { ok: /^§REQUEST_VERIFY request=\d+ status=Verified closedate=set/.test(R.verifyLine || '') && b.status === ST.VERIFIED && b.closedate != null && b.actions.length === a.actions.length + 1 && b.actions[b.actions.length - 1].status === ST.REPORTED &&
      !!rowsBefore && rowsBefore.verify === true && !!rowAfter && rowAfter.issue === 'fixed' && rowAfter.verify === false && R.phoneCards.caps_phone === true && R.phoneCards.cards === 1 && R.phoneCards.verify === 0,
    detail: (R.verifyLine || 'no §REQUEST_VERIFY') + ' · status ' + b.status + ' (Verified=' + ST.VERIFIED + ') CloseDate=' + b.closedate + ' Processed=' + b.processed + ' · History rows ' + a.actions.length + '→' + b.actions.length + ' last previous status ' + (b.actions[b.actions.length - 1] || {}).status + ' (Reported=' + ST.REPORTED + ') · HQ card before ' + JSON.stringify(rowsBefore) + ' after ' + JSON.stringify(rowAfter) + ' · phone profile: ' + JSON.stringify(R.phoneCards) };
}
function judgeT6(R) {
  const lit = { 3: '2', 9: '6' }; lit[R.n - 1] = '9'; lit[R.n] = 'D';
  const pcts = R.list.map(([v, nm]) => Number(/(\d+)\s*%/.exec(nm)[1])).sort((a, b) => a - b);
  const mine = Object.keys(lit).map(k => [k, stepOf(R.list, Number(k), R.n)]), stored = Object.keys(lit).map(k => [k, R.checks[k] && R.checks[k].C.taskstatus]);
  return { ok: eq(pcts, [0, 20, 40, 60, 80, 90, 95, 99, 100]) && Object.keys(lit).every(k => stepOf(R.list, Number(k), R.n) === lit[k]) && eq(mine, stored) && R.n >= 14 && R.n <= 15,
    detail: 'list read by SQL (' + R.list.length + ' values) pct=' + JSON.stringify(pcts) + ' · witness step(k,n=' + R.n + ')=' + JSON.stringify(mine) + ' literal ' + JSON.stringify(lit) + ' · stored TaskStatus ' + JSON.stringify(stored) };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, logFile = path.join(__dirname, 'witness_mission_report.log');
  const flush = () => fs.writeFileSync(logFile, log.join('\n') + '\n');
  const browser = await chromium.launch();
  const probe = await openPage(browser, base, DESK, false);
  if (!probe.ready) { S('§W-MISSION-REPORT ABORT model never ready'); flush(); process.exit(1); }
  SINGLE = await probe.page.evaluate((cls) => { const r = APP.dbQuery("SELECT m.ifc_class, COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.storey IS NOT NULL AND t.center_x IS NOT NULL AND m.ifc_class <> ? AND m.ifc_class LIKE 'Ifc%' AND m.ifc_class NOT IN ('IfcSpace','IfcOpeningElement') GROUP BY m.ifc_class HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, m.ifc_class LIMIT 1", [cls]); return r.length ? r[0][0] : null; }, CLS);
  await probe.ctx.close();
  S('── arrange: Duplex; HQ desktop + phone profile on the team-folder relay; single-element class=' + SINGLE + '; class Request = every ' + CLS + ' of the pushed set ──');
  if (!SINGLE) { S('§W-MISSION-REPORT ABORT no class with three positioned elements'); flush(); process.exit(1); }

  const A = await scenario(browser, base, 'real', { classReq: true, upto: 'all' });
  if (A.abort) { flush(); process.exit(1); }
  A.wantProd = await idOfUU(A.HQ, 'm_product', 'm_product_uu', 'm_product_id', A.material); A.wantRes = await idOfUU(A.HQ, 'r_resolution', 'r_resolution_uu', 'r_resolution_id', SOLVED);
  S('── fixture: prepare=' + A.prepLine + ' · send=' + A.sendLine + ' · pickup=' + (A.pickup.line || 'none') + ' · requests ' + JSON.stringify(Object.fromEntries(Object.entries(A.fx.reqs).map(([k, v]) => [k, v.doc + ':' + v.value.slice(0, 10)]))) + ' · material picked=' + A.material + ' · class tasks n=' + A.n + ' ──');
  const marks = [3, 9, A.n - 1, A.n], res = {};
  res.T1 = judgeT1(A); res.T2 = judgeT2(A); res.T3 = judgeT3(A, marks); res.T4 = judgeT4(A); res.T5 = judgeT5(A); res.T6 = judgeT6(A);
  ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].forEach(k => check(k, res[k].ok, res[k].detail));
  await A.HQ.ctx.close(); await A.PH.ctx.close(); flush();

  let red = 0;
  const redRun = async (name, file, from, to, opts, judge) => {
    S('\n── RED ' + name + ' ──');
    MUT = { file, edits: [{ from, to }] };
    const R = await scenario(browser, base, name, opts); MUT = null;
    if (R.abort) { S('§W-MISSION-REPORT RED ' + name + ' ABORT'); return; }
    R.wantProd = await idOfUU(R.HQ, 'm_product', 'm_product_uu', 'm_product_id', R.material); R.wantRes = await idOfUU(R.HQ, 'r_resolution', 'r_resolution_uu', 'r_resolution_id', SOLVED);
    const j = judge(R); const detected = !j.ok; S('§W-MISSION-REPORT RED ' + name + ' ' + (detected ? 'detected' : 'NOT DETECTED') + ' — ' + j.detail.slice(0, 500)); if (detected) red++;
    await R.HQ.ctx.close(); await R.PH.ctx.close(); flush();
  };
  await redRun('R1 de-duplication removed (T2)', 'mission_processor.js', "if (rows(db, 'SELECT 1 AS x FROM r_requestupdate WHERE r_requestupdate_uu = ?', [upUU]).length) {", 'if (false) {', { classReq: false, upto: 'T2' }, judgeT2);
  await redRun('R2 "all elements done" rule removed (T3)', 'mission_processor.js', 'allDone = d >= n;', 'allDone = d >= 1;', { classReq: true, upto: 'T3first' }, R => { R.n = R.file.tasks.filter(t => String(t.id).indexOf('#') > 0).length; return judgeT3(R, [1]); });
  await redRun('R3 the cannot branch routed like done (T4)', 'mission_processor.js', "var cannot = rep.outcome === 'cannot'", 'var cannot = false', { classReq: false, upto: 'T4' }, judgeT4);

  await browser.close(); server.close();
  const inconclusive = !A.n || A.n < 14 || A.n > 15;
  const verdict = inconclusive ? 'INCONCLUSIVE' : (fails === 0 && red === 3 ? 'PASS' : 'FAIL');
  S('§W-MISSION-REPORT checks=' + checks + ' fail=' + fails + ' red=' + red + '/3 verdict=' + verdict);
  flush(); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-MISSION-REPORT CRASH ' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_mission_report.log'), log.join('\n') + '\n'); process.exit(1); });
