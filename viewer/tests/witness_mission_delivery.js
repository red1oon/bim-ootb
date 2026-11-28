// ⚠ DO NOT REMOVE — WITNESS W-MISSION-DELIVERY (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-26 "the mission reaches the phone").
//   READ viewer/tests/witness_mission_delivery.log AFTER EVERY RUN (the exit code is not evidence). Numbers and § lines only; no screenshots.
// ISSUE THIS PROVES OR DISPROVES: HQ (desktop) prepares a mission and "Send to site" puts it in the team folder as ONE sealed drop (the Send-to-HQ drop format, same outbox); a paired PHONE lists the missions of
//   its team (drawer row "Missions" -> Get) and opens one with the existing loader; opening it queues ONE pickup report, and HQ's "Get from team" moves exactly that mission's still-Prepared Requests to On site
//   (one History row each). Harness = witness_send_hq_team.js: the same folder relay (?pipe=), founder in node, page-made devices; HQ = a desktop browser context (the real Find > ERP push, the real
//   "Prepare site mission" and "Send to site" controls), the phone = a phone-profile context (Duplex at viewer/buildings/Duplex_extracted.db).
//   V1 HQ prepares and sends: ONE new drop in HQ's drawer, opened by a node-side member = the mission file (+ kind:'mission', role, same tasks), sealed label 'bim-mission'; NO byte of any file in the folder contains a task summary,
//      a GUID, the mission id or its name (sealed). The role split (a batch with two roles -> one mission per role, ids and tasks apart, each validates refused=0) is judged in the same check.
//   V2 the phone's "Missions" row lists exactly that mission with its role and task count; a phone that is not paired lists nothing and says so in one line.
//   V3 opening it: §MISSION_LOAD ... refused=0 model_match=true, §MISSION_STEP n=1 with its path drawn (meshes > 0, path_pts = the file's first task).
//   V4 the pickup report reaches HQ's "Get from team": the mission's Requests are On site, ONE new History row each holding Prepared; the other Prepared Requests (another role's mission) are untouched; a SECOND pickup of the
//      same mission (the phone opened it again, after one of its Requests had moved on to Reported) moves 0 and leaves that Request Reported — nothing is written twice.
//   V5 an offline phone: the pickup stays queued (outbox 1, folder unchanged) and leaves when online (outbox 0, a new drop that HQ applies).
//   V6 boot: neither side requests the mission files before use (phone: mission_inbox / task_mission / task_form / mission_processor / request_changed; HQ: mission_processor / request_changed), and the phone never loads the processor.
//   RED controls: R1 the seal removed (the drop's bytes written as they are) -> V1 FAILS · R2 the "still Prepared" guard removed -> V4's second half FAILS.
// Run: node viewer/tests/witness_mission_delivery.js          (about 10 minutes with the two red controls)
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
const ST = { NEW: 990001, PREPARED: 990002, ONSITE: 990003, REPORTED: 990004 };

const log = []; let checks = 0, fails = 0, inconc = 0;
function S(m) { log.push(m); console.log(m); }
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-MISSION-DELIVERY ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function waitLine(cons, re, ms, from) { for (let i = 0; i < (ms || 20000) / 200; i++) { const l = cons.slice(from || 0).find(t => re.test(t)); if (l) return l; await sleep(200); } return null; }

async function openPage(browser, base, profile, withPipe) {
  const ctx = await browser.newContext(profile), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  page.on('console', m => { const t = m.text(); cons.push(t); if (/^§(MISSION|HQ_|REQ_CHANGED|LAZY|SITE_TASK|TASK_REPORT)/.test(t)) log.push('  [console ' + (profile === DESK ? 'HQ' : 'phone') + '] ' + t.slice(0, 260)); });
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
      [id, proj[1], proj[2], now, now, value, value + ' (W-MISSION-DELIVERY)', tpl[0], tpl[1], crypto.randomUUID(), tpl[2]]);
    return id;
  }
  const out = { project: proj[0], note_guids: proj[3] ? String(proj[3]).split(',').length : 0, new_status: nw[0], reqs: {} };
  for (const s of a.specs) {
    const value = s.value === 'class' ? a.CLS : s.value === 'none' ? 'WO26-NO-SUCH-ELEMENT' : model[s.nth][0];
    const pid = product(value), id = alloc('r_request', 'r_request_id'), uu = crypto.randomUUID();
    db.run("INSERT INTO r_request (r_request_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,documentno,r_requesttype_id,r_status_id,priority,priorityuser,duetype,summary,confidentialtype,confidentialtypeentry,isescalated,isselfservice,salesrep_id,ad_role_id,processed,isinvoiced,requestamt,m_product_id,c_project_id,datestartplan,startdate,r_request_uu) " +
      "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,'5','5','5',?,'C','C','N','N',100,?,'N','N',0,?,?,?,?,?)", [id, proj[1], proj[2], now, now, s.doc, typ[0], nw[0], s.sum, s.role, pid, proj[0], s.date, now, uu]);
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

// ── one full run. opts.stopAfter 'V1' (red control R1) | null ─────────────────────────────────────────────────────────
async function scenario(browser, base, label, opts) {
  opts = opts || {};
  FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'wo26-'));
  const R = { label }, SQL = await require(NM + 'sql.js')(), relay = PIPE.folderPipe(FOLDER, 'folder');
  const HQ = await openPage(browser, base, DESK, true), PH = opts.stopAfter ? null : await openPage(browser, base, PHONE, true);
  R.HQ = HQ; R.PH = PH;
  if (!HQ.ready || (PH && !PH.ready)) { S('§W-MISSION-DELIVERY ABORT ' + label + ' a page never became ready (HQ=' + HQ.ready + ' phone=' + (PH && PH.ready) + ') ' + HQ.errs.concat(PH ? PH.errs : []).join(' | ')); R.abort = true; return R; }
  R.bootHQ = HQ.reqs.filter(u => /\/(mission_processor|request_changed|mission_inbox|task_mission|task_form)\.js/.test(u)).map(u => u.split('/').pop());
  R.bootPH = PH ? PH.reqs.filter(u => /\/(mission_processor|request_changed|mission_inbox|task_mission|task_form|route_line|task_arrival)\.js/.test(u)).map(u => u.split('/').pop()) : [];
  // the team: founder in node, HQ desk + phone enrolled
  const hqDev = await makeDevice(HQ.page), phDev = PH ? await makeDevice(PH.page) : null;
  const founder = await STORE.newDevice(); founder.person_uu = require('crypto').randomUUID();
  const sp = await STORE.newSpace('wo26-site', founder, founder.person_uu, 'Founder', 102);
  const H = STORE.open(new SQL.Database(), { SQL, space: sp.space, self: founder, access: () => ({ allowed: true }), tableId: () => null, log: () => {} });
  await H.genesis(sp.params);
  for (const [d, nm] of [[hqDev, 'HQ desk'], [phDev, 'Site phone']]) if (d) { await H.addPerson({ person_uu: d.person_uu, name: nm, ad_role_id: 103, comm_admin: false }); await H.enroll(d.kid, d.pubJwk, d.person_uu, d.dhPubJwk); }
  await H.sync(relay);
  await setCfg(HQ.page, { space: sp.space, founder: false }); if (PH) await setCfg(PH.page, { space: sp.space, founder: false });
  R.sp = sp; R.H = H; R.relay = relay; R.hqDev = hqDev; R.phDev = phDev;
  S('   §W-MISSION-DELIVERY ARRANGE ' + label + ' space=' + sp.space.slice(0, 12) + ' hq=' + hqDev.kid + (phDev ? ' phone=' + phDev.kid : '') + ' folder=' + FOLDER);

  // HQ: push the doors, the Requests. R1 one element (role 103), R2 every door (103), R3 no element (stays New). All three: the Kernel store of the HQ page.
  R.pushLine = await pushDoors(HQ);
  R.fx = await makeRequests(HQ, [
    { k: 'R3', doc: 'WO26-10', date: '2026-12-03 08:00:00', value: 'none', sum: 'Check something that is not in the model', role: 103 },
    { k: 'R1', doc: 'WO26-30', date: '2026-12-01 08:00:00', value: 'guid', nth: 0, sum: 'Inspect this one element', role: 103 },
    { k: 'R2', doc: 'WO26-20', date: '2026-12-02 08:00:00', value: 'class', sum: 'Check every door', role: 103 }]);
  if (R.fx.error) { S('§W-MISSION-DELIVERY ABORT ' + label + ' ' + R.fx.error + ' push=' + R.pushLine); R.abort = true; return R; }
  // the real controls: Prepare site mission, then Send to site
  const n0 = HQ.cons.length, dl = HQ.page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await HQ.page.evaluate(() => document.getElementById('find-mission-btn').click());
  R.prepLine = await waitLine(HQ.cons, /^§MISSION_PREPARE project=/, 120000, n0);
  const d = await dl; R.file = null; if (d) { try { R.file = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); } catch (e) { R.fileErr = e.message; } }
  await sleep(500);
  R.sendBtn = await HQ.page.evaluate(() => { const b = document.getElementById('find-mission-send'); return b ? { text: b.textContent, shown: b.offsetWidth > 0 } : null; });
  R.folderBeforeSend = walkDir(FOLDER, '', []);
  const n1 = HQ.cons.length;
  if (R.sendBtn) await HQ.page.evaluate(() => document.getElementById('find-mission-send').click());
  R.sendLine = await waitLine(HQ.cons, /^§MISSION_SEND /, 60000, n1); await sleep(800);
  R.state0 = await readReqs(HQ, R.fx.reqs);
  // V1 evidence: the new files in the folder, opened by a node-side member
  R.newFiles = walkDir(FOLDER, '', []).filter(n => R.folderBeforeSend.indexOf(n) < 0);
  await H.sync(relay);
  R.drops = (await DROP.list(relay, sp.space)).filter(x => x.kid === hqDev.kid);
  R.opened = null;
  if (R.drops.length) R.opened = await DROP.open(relay, { space: sp.space, kid: R.drops[0].kid, id: R.drops[0].id, roster: (await H.order()).roster, ring: await H.keyring() });
  R.meta = R.drops.length ? await DROP.open(relay, { space: sp.space, kid: R.drops[0].kid, id: R.drops[0].id, roster: (await H.order()).roster, ring: await H.keyring(), metaOnly: true }) : null;
  R.plain = []; if (R.file) { const needles = new Set(['bim-mission', R.file.mission.id, R.file.mission.name]); R.file.tasks.forEach(t => { needles.add(t.summary); needles.add(t.guid); });
    walkDir(FOLDER, '', []).forEach(n => { const s = fs.readFileSync(path.join(FOLDER, n)).toString('latin1'); needles.forEach(w => { if (w && s.indexOf(w) >= 0) R.plain.push(n.split('/').pop() + ':' + String(w).slice(0, 24)); }); }); }
  // the role split: two more New Requests, ROLE 102 and ROLE 103, on two other elements -> a second prepare makes two missions (not sent)
  {
    R.fx2 = await makeRequests(HQ, [
      { k: 'R4', doc: 'WO26-41', date: '2026-12-04 08:00:00', value: 'guid', nth: 1, sum: 'Second element, role 102', role: 102 },
      { k: 'R5', doc: 'WO26-42', date: '2026-12-05 08:00:00', value: 'guid', nth: 2, sum: 'Third element, role 103', role: 103 }]);
    if (!R.fx2.error) {
      const n2 = HQ.cons.length;
      R.split = await HQ.page.evaluate(async (pid) => { const r = await APP.prepareMission(pid, {}); return { error: r.error || null, prepared: r.prepared.length, missions: (r.missions || []).map(m => ({ id: m.id, role: m.role, requests: m.requests, tasks: m.mission.tasks.map(t => ({ id: t.id, seq: t.seq })), role_in_file: m.mission.mission.role || null,
        v: window.TaskMission.validate(m.mission, APP.walkStoreyLevels).refused.length })) }; }, R.fx.project);
      R.splitLogs = HQ.cons.slice(n2);
      Object.assign(R.fx.reqs, R.fx2.reqs);
    }
  }
  R.state1 = await readReqs(HQ, R.fx.reqs);
  if (opts.stopAfter === 'V1') return R;

  // V2: the phone's drawer row, Get; and a phone that is not paired
  R.row = await openMissionsRow(PH.page);
  R.get = await missionsGet(PH);
  const U = await openPage(browser, base, PHONE, true);
  R.unpaired = null;
  if (U.ready) { const row = await openMissionsRow(U.page); const g = await missionsGet(U); R.unpaired = { row, g }; }
  await U.ctx.close();
  // V3 + V4: open it (pickup 1), HQ gets
  const open1 = await clickRow(PH, 0); R.open1 = open1; await sleep(1500);
  R.phState = await PH.page.evaluate(() => APP.missionState && APP.missionState());
  R.sent1 = await waitLine(PH.cons, /^§HQ_SEND via=team /, 20000, 0);
  const g1n = HQ.cons.length; await HQ.page.evaluate(() => APP.getFromTeam()); R.get1 = HQ.cons.slice(g1n);
  R.state2 = await readReqs(HQ, R.fx.reqs);
  // R2 moves on (as WO-15 will do): Reported; then the phone opens the mission again -> pickup 2; HQ gets
  await HQ.page.evaluate(async (id) => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
    const m = window.RequestChanged.requestChanged(db, id, { r_status_id: 990004 }, { alloc: window.ProjFold._allocator(db) }); if (!m.ok) throw new Error(m.error); await window.ProjOrderState.persistShared(db, 'witness'); }, R.fx.reqs.R2.id);
  R.stateRep = await readReqs(HQ, R.fx.reqs);
  await openMissionsRow(PH.page, false); await missionsGet(PH);
  R.open2 = await clickRow(PH, 0); await sleep(1500);
  const g2n = HQ.cons.length; await HQ.page.evaluate(() => APP.getFromTeam()); R.get2 = HQ.cons.slice(g2n);
  R.state3 = await readReqs(HQ, R.fx.reqs);
  // V5: online Get (the list is in memory), then offline: open it -> the pickup is queued; online again -> it leaves
  await openMissionsRow(PH.page, false); await missionsGet(PH);
  const before = walkDir(FOLDER, '', []).length;
  await PH.ctx.setOffline(true);
  R.open3 = await clickRow(PH, 0); await sleep(500);
  R.ob1 = await outboxCount(PH.page); R.folderOff = walkDir(FOLDER, '', []).length - before;
  const c1 = PH.cons.length; await PH.ctx.setOffline(false);
  R.flushLine = await waitLine(PH.cons, /^§HQ_TEAM flushed sent=1 left=0/, 60000, c1); await sleep(500);
  R.ob2 = await outboxCount(PH.page); R.folderOn = walkDir(FOLDER, '', []).length - before;
  const g3n = HQ.cons.length; await HQ.page.evaluate(() => APP.getFromTeam()); R.get3 = HQ.cons.slice(g3n);
  R.state4 = await readReqs(HQ, R.fx.reqs);
  // V6: what each side requested over the whole run
  R.reqsPH = PH.reqs.filter(u => /\/(mission_processor|request_changed|mission_inbox|task_mission|task_form|route_line|task_arrival)\.js/.test(u)).map(u => u.split('/').pop());
  R.reqsHQ = HQ.reqs.filter(u => /\/(mission_processor|request_changed|mission_inbox)\.js/.test(u)).map(u => u.split('/').pop());
  return R;
}
const num = (re, line) => { const m = re.exec(line || ''); return m ? Number(m[1]) : null; };

// ── the checks ────────────────────────────────────────────────────────────────────────────────────────────────────────
function judgeV1(R) {
  const f = R.file, sendOk = /^§MISSION_SEND mission=\S+ role=GardenWorld User tasks=(\d+) sealed=true queued=false$/.exec(R.sendLine || ''), op = R.opened, body = op && op.ok ? (() => { try { return JSON.parse(new TextDecoder().decode(op.files[0].bytes)); } catch (e) { return null; } })() : null;
  const dropFiles = R.newFiles.filter(n => n.indexOf('/drop-') > 0), manifests = R.newFiles.filter(n => /\/drop-[0-9a-f]{16}\/m\.json$/.test(n));
  const same = !!(body && f && eq(Object.assign({}, body, { kind: undefined }), Object.assign({}, f, { kind: undefined })) && body.kind === 'mission');
  const sp = R.split, split = !!(sp && !sp.error && sp.missions.length === 2 && new Set(sp.missions.map(m => m.id)).size === 2 && eq(sp.missions.map(m => m.role).sort(), ['GardenWorld Admin', 'GardenWorld User']) &&
    sp.missions.every(m => m.v === 0 && m.tasks.length === 1 && m.tasks[0].seq === 1 && m.role_in_file === m.role && m.requests.length === 1) && sp.missions[0].requests[0] !== sp.missions[1].requests[0]);
  const ok = !!(f && sendOk && manifests.length === 1 && dropFiles.length >= 2 && dropFiles.every(n => n.indexOf('/pub/' + R.hqDev.kid + '/') > 0) && op && op.ok && R.meta && R.meta.ok && R.meta.label === 'bim-mission' && same && R.plain.length === 0 && Number(sendOk[1]) === f.tasks.length && f.tasks.length > 0 && split);
  return { ok, detail: (R.sendLine || 'no §MISSION_SEND') + ' · drop_files=' + dropFiles.length + ' manifests=' + manifests.length + ' in_hq_drawer=' + dropFiles.every(n => n.indexOf('/pub/' + R.hqDev.kid + '/') > 0) + ' · open=' + (op ? (op.ok ? 'ok' : op.reason) : 'none') + ' label=' + (R.meta && R.meta.label) +
    ' file_equal=' + same + ' tasks=' + (f && f.tasks.length) + ' · plaintext_hits=' + JSON.stringify(R.plain.slice(0, 4)) + ' (' + R.plain.length + ') · split=' + (sp ? JSON.stringify({ err: sp.error, n: sp.missions.length, roles: sp.missions.map(m => m.role + ':' + m.tasks.length + ':' + m.id.slice(-8)), refused: sp.missions.map(m => m.v) }) : 'none') };
}
function judgeV4(R) {
  const rq = R.fx.reqs, s0 = R.state1, s1 = R.state2, sr = R.stateRep, s2 = R.state3;
  const onsite = k => s1[k].status === ST.ONSITE, newRows = (a, b, k) => b[k].actions.length - a[k].actions.length;
  const first = onsite('R1') && onsite('R2') && newRows(s0, s1, 'R1') === 1 && newRows(s0, s1, 'R2') === 1 &&
    s1.R1.actions[s1.R1.actions.length - 1].status === ST.PREPARED && s1.R2.actions[s1.R2.actions.length - 1].status === ST.PREPARED &&
    s1.R4.status === ST.PREPARED && s1.R5.status === ST.PREPARED && newRows(s0, s1, 'R4') === 0 && newRows(s0, s1, 'R5') === 0 && s1.R3.status === ST.NEW && newRows(s0, s1, 'R3') === 0 &&
    /^§MISSION_ONSITE mission=\S+ moved=2 already=0 /.test(R.get1.find(t => /^§MISSION_ONSITE /.test(t)) || '');
  const secondLine = R.get2.find(t => /^§MISSION_ONSITE /.test(t)) || '';
  const second = /^§MISSION_ONSITE mission=\S+ moved=0 already=2 /.test(secondLine) && s2.R1.status === ST.ONSITE && s2.R2.status === ST.REPORTED && s2.R1.actions.length === sr.R1.actions.length && s2.R2.actions.length === sr.R2.actions.length;
  return { first, second, detail: 'first: ' + (R.get1.find(t => /^§MISSION_ONSITE /.test(t)) || 'no §MISSION_ONSITE') + ' · status R1/R2/R3/R4/R5 ' + ['R1', 'R2', 'R3', 'R4', 'R5'].map(k => s1[k].status).join('/') + ' (Prepared=' + ST.PREPARED + ' OnSite=' + ST.ONSITE + ') new History rows R1/R2/R4/R5 ' +
    ['R1', 'R2', 'R4', 'R5'].map(k => newRows(s0, s1, k)).join('/') + ' prev-status of the new rows ' + s1.R1.actions.slice(-1)[0].status + '/' + s1.R2.actions.slice(-1)[0].status + ' · second: ' + secondLine + ' · R1/R2 after ' + s2.R1.status + '/' + s2.R2.status + ' History rows R1 ' + sr.R1.actions.length + '→' + s2.R1.actions.length + ' R2 ' + sr.R2.actions.length + '→' + s2.R2.actions.length };
}
function judgeAll(R, tag) {
  const out = {}, v1 = judgeV1(R); out.V1 = v1;
  if (!R.PH || !R.get) return out;
  const f = R.file, row0 = R.get.rows[0] || '', un = R.unpaired;
  out.V2 = { ok: /^§MISSION_LIST n=1 /.test(R.get.line || '') && R.get.rows.length === 1 && row0.indexOf(f.mission.name) === 0 && row0.indexOf('GardenWorld User') > 0 && row0.indexOf(f.tasks.length + ' task') > 0 &&
    !!un && /^§MISSION_LIST n=0 .*reason=unpaired/.test(un.g.line || '') && un.g.rows.length === 0 && /not paired/.test(un.g.status) && R.row.have && R.row.tapped && R.row.shown,
    detail: (R.get.line || '').slice(0, 170) + ' · row="' + row0 + '" · drawer row=' + R.row.have + ' tapped=' + R.row.tapped + ' sheet=' + R.row.shown + ' · unpaired: ' + ((un && un.g.line) || 'no line') + ' status="' + (un && un.g.status) + '"' };
  const ld = (R.open1.logs.find(t => /^§MISSION_LOAD /.test(t)) || ''), st1 = (R.open1.logs.find(t => /^§MISSION_STEP n=1 /.test(t)) || '');
  out.V3 = { ok: new RegExp('^§MISSION_LOAD tasks=' + f.tasks.length + ' refused=0 model_match=true mission=' + f.mission.id.replace(/[-]/g, '\\-')).test(ld) && /^§MISSION_STEP n=1 of=\d+ task=\S+ path_pts=(\d+) meshes=(\d+)$/.test(st1) &&
    num(/path_pts=(\d+)/, st1) === f.tasks[0].path.length && num(/meshes=(\d+)/, st1) > 0 && !!R.phState && R.phState.step === 1 && R.phState.of === f.tasks.length,
    detail: ld.slice(0, 150) + ' · ' + st1 + ' · file task 1 path_pts=' + f.tasks[0].path.length + ' · state=' + JSON.stringify(R.phState) };
  const v4 = judgeV4(R); out.V4 = { ok: v4.first && v4.second, detail: v4.detail, first: v4.first, second: v4.second };
  const sendL = R.open1.logs.find(t => /^§MISSION_PICKUP /.test(t)) || '';
  const p3 = (R.open3.logs.find(t => /^§MISSION_PICKUP /.test(t)) || '');
  const dropsAfter = R.folderOn - R.folderOff;
  out.V5 = { ok: /^§MISSION_PICKUP mission=\S+ queued=true sent=false .*reason=offline/.test(p3) && R.ob1 === 1 && R.folderOff === 0 && !!R.flushLine && R.ob2 === 0 && dropsAfter > 0 && /^§MISSION_ONSITE mission=\S+ moved=0 already=2 /.test(R.get3.find(t => /^§MISSION_ONSITE /.test(t)) || ''),
    detail: sendL.slice(0, 110) + ' | offline: ' + p3 + ' · outbox ' + R.ob1 + '→' + R.ob2 + ' · folder files while offline +' + R.folderOff + ', after reconnect +' + R.folderOn + ' · ' + (R.flushLine || 'no flush line') + ' · HQ: ' + (R.get3.find(t => /^§MISSION_ONSITE /.test(t)) || 'no §MISSION_ONSITE') };
  out.V6 = { ok: R.bootHQ.length === 0 && R.bootPH.length === 0 && R.reqsPH.filter(n => /mission_processor|request_changed/.test(n)).length === 0 && R.reqsPH.filter(n => /mission_inbox/.test(n)).length === 1 && R.reqsPH.filter(n => /task_mission/.test(n)).length === 1 &&
    R.reqsHQ.filter(n => /mission_processor/.test(n)).length === 1 && R.reqsHQ.filter(n => /mission_inbox/.test(n)).length === 0,
    detail: 'at boot HQ=' + JSON.stringify(R.bootHQ) + ' phone=' + JSON.stringify(R.bootPH) + ' · after the run phone requested ' + JSON.stringify(R.reqsPH) + ' HQ requested ' + JSON.stringify(R.reqsHQ) };
  return out;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, logFile = path.join(__dirname, 'witness_mission_delivery.log');
  const flush = () => fs.writeFileSync(logFile, log.join('\n') + '\n');
  const browser = await chromium.launch();
  const probe = await openPage(browser, base, DESK, false);
  if (!probe.ready) { S('§W-MISSION-DELIVERY ABORT model never ready'); flush(); process.exit(1); }
  SINGLE = await probe.page.evaluate((cls) => { const r = APP.dbQuery("SELECT m.ifc_class, COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.storey IS NOT NULL AND t.center_x IS NOT NULL AND m.ifc_class <> ? AND m.ifc_class LIKE 'Ifc%' AND m.ifc_class NOT IN ('IfcSpace','IfcOpeningElement') GROUP BY m.ifc_class HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, m.ifc_class LIMIT 1", [cls]); return r.length ? r[0][0] : null; }, CLS);
  await probe.ctx.close();
  S('── arrange: Duplex; HQ = desktop profile (real Find > ERP push, "Prepare site mission", "Send to site"), phone = phone profile; element class for the single-element Requests=' + SINGLE + ' ──');
  if (!SINGLE) { S('§W-MISSION-DELIVERY ABORT no class with three positioned elements'); flush(); process.exit(1); }

  const A = await scenario(browser, base, 'real');
  if (A.abort) { flush(); process.exit(1); }
  S('── fixture: push=' + (A.pushLine || 'none').slice(0, 120) + ' · requests ' + JSON.stringify(Object.fromEntries(Object.entries(A.fx.reqs).map(([k, v]) => [k, v.doc + ':' + v.value.slice(0, 12) + ':role' + v.role]))) + ' · prepare: ' + A.prepLine + ' · send button=' + JSON.stringify(A.sendBtn) + ' ──');
  const tasksN = A.file ? A.file.tasks.length : 0;
  let V = {};
  if (!A.file || !tasksN) { inconc++; S('§W-MISSION-DELIVERY INCONCLUSIVE the prepared file has no tasks (' + (A.fileErr || 'no download') + ')'); }
  else V = judgeAll(A, 'real');
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].forEach(k => { if (V[k]) check(k, V[k].ok, V[k].detail); else { checks++; fails++; S('§W-MISSION-DELIVERY ' + k + ' FAIL — not judged'); } });
  await A.HQ.ctx.close(); await A.PH.ctx.close();
  flush();

  // ── red controls ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let red = 0;
  S('\n── RED R1: the seal removed (the drop is written in the clear) → V1 must FAIL ──');
  MUT = { file: 'issues.js', edits: [{ from: "var d = await window.TeamDrop.seal(files, { space: cfg.space, epoch: nk.epoch, key: nk.key, signer: dev, label: it.label || 'bim-site-report' });",
    to: "var _dd = 's/' + cfg.space + '/pub/' + dev.kid + '/drop-ffffffffffffffff/', d = { id: 'ffffffffffffffff', entries: [{ name: _dd + 'm.json', bytes: new TextEncoder().encode('{}') }, { name: _dd + '0.bin', bytes: files[0].bytes }] };" }] };
  const R1 = await scenario(browser, base, 'R1-no-seal', { stopAfter: 'V1' }); MUT = null;
  if (!R1.abort) { const j = judgeV1(R1); const detected = !j.ok && R1.plain.length > 0; S('§W-MISSION-DELIVERY RED R1 ' + (detected ? 'detected' : 'NOT DETECTED') + ' — V1 would read ok=' + j.ok + ' plaintext_hits=' + R1.plain.length + ' ' + JSON.stringify(R1.plain.slice(0, 3))); if (detected) red++; }
  else S('§W-MISSION-DELIVERY RED R1 ABORT');
  await R1.HQ.ctx.close();
  flush();
  S('\n── RED R2: the "still Prepared" guard removed → V4\'s second half must FAIL ──');
  MUT = { file: 'mission_processor.js', edits: [{ from: 'if (Number(q.st) !== Number(ST.next.r_status_id))', to: 'if (false)' }] };
  const R2 = await scenario(browser, base, 'R2-no-guard'); MUT = null;
  if (!R2.abort && R2.state3) { const j = judgeV4(R2); const detected = j.first && !j.second; S('§W-MISSION-DELIVERY RED R2 ' + (detected ? 'detected' : 'NOT DETECTED') + ' — first half ok=' + j.first + ' second half ok=' + j.second + ' · ' + j.detail.split(' · second: ')[1]); if (detected) red++; }
  else S('§W-MISSION-DELIVERY RED R2 ABORT');
  if (R2.HQ) await R2.HQ.ctx.close(); if (R2.PH) await R2.PH.ctx.close();

  await browser.close(); server.close();
  const verdict = inconc ? 'INCONCLUSIVE' : (fails === 0 && red === 2 ? 'PASS' : 'FAIL');
  S('§W-MISSION-DELIVERY checks=' + checks + ' fail=' + fails + ' red=' + red + '/2 verdict=' + verdict);
  flush(); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-MISSION-DELIVERY CRASH ' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_mission_delivery.log'), log.join('\n') + '\n'); process.exit(1); });
