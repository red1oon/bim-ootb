// ⚠ DO NOT REMOVE — WITNESS W-MISSION-PREPARE (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-25 "The desktop processor: a Project Order's new Requests become a mission file").
//   READ viewer/tests/witness_mission_processor.<building>.log AFTER EVERY RUN (the exit code is not evidence).
// ISSUE THIS PROVES OR DISPROVES: on the DESKTOP, the Find › ERP "Prepare site mission" control turns the New Requests of a Project Order into ONE mission file that the phone's own loader accepts
//   (refused=0, model_match=true), whose tasks sit at the elements' real x,y,storey (the frame the walk's arrival test uses), in the order the Requests and the nearest-next rule give, with the room
//   path as their paths — and moves EXACTLY the prepared Requests New -> Prepared with one History row each, never when the file does not validate. Numbers only; no screenshots.
// THE FIXTURE IS BUILT FROM THE MODEL AND THE REAL PUSH: the Project Order comes from the real Find › ERP push of the class CLS (default IfcDoor) of the open model (applyFindScope, the Zoom-Across entry selects the class's Find results — the Find list holds at most 50, so the pushed set can be smaller than the class); the three Requests are
//   written by this witness into the Kernel ERP store (window.ProjOrderState.shared — the same instance the processor reads) from the model's own rows:
//     R1 (earliest DateStartPlan, DocumentNo "WO25-30")  product Value = the GUID of ONE element of the model (the first element of a class that is not IfcDoor — see Q3's note)
//     R2 (middle,                  DocumentNo "WO25-20")  product Value = CLS (default "IfcDoor")  (every element of that class in the project's pushed set)
//     R3 (latest,                  DocumentNo "WO25-10")  product Value = a name that is no element and no class
//   DocumentNo order is the REVERSE of the date order, and R3 is inserted first: ordering by DocumentNo or by insertion would fail Q5.
//   Q1  §MISSION_PREPARE requests=3 prepared=2 skipped=1; the skipped one names its reason and is still New
//   Q2  the downloaded file loads in the phone's loader: §MISSION_LOAD refused=0 model_match=true
//   Q3  tasks = 1 + (the CLS rows of the model query that the push stored in C_Project.Note), every guid is in the model, no guid twice.  NOTE: the spec says R1 is "a single door"; a door would be one of the IfcDoor rows and repeat a guid, so
//       Q3 could not hold both of its own sentences. R1 is therefore a single element of another class; the processor treats a GUID product the same whatever the class.
//   Q4  frame: a REAL walk sample (the camera put at the task's x,y on its storey, the walk's own arrival call) with radius_m 0.5 shows the card with d_m=0.000
//   Q5  order: seq ascending 1..n, R1's task first then the class Request's, inside the class each next task is the nearest remaining one (recomputed here, independently), ties by guid
//   Q6  paths: every path >= 2 points, ends within 1 mm of its task's x,y on its storey, routed + straight = tasks; every ROUTED path = [previous spot] + the room graph's own polyline for the two rooms
//       (compared with a direct RoomGraph.shortestPath call) + [element]. A building whose elements fall in no room has routed=0: that half prints INCONCLUSIVE, never PASS.
//   Q7  the two prepared Requests are Prepared, each with exactly one new History row (R_RequestAction) holding the previous status New; the unresolved one is untouched; a second run prepares 0
//       (requests=1 prepared=0) and writes nothing; every Prepared Request's tasks are in a file that validates (refused=0)
//   Q8  nothing at boot: none of the processor's files is requested before the control is used (and each once after); a phone profile has no "Prepare site mission" control
//   R1 validator call removed + one task's storey blanked -> Q2 FAILS · R2 "resolves to no element" guard removed -> Q1 FAILS · R3 the status move made although the file does not validate -> Q7 FAILS
// Run: node viewer/tests/witness_mission_processor.js [Duplex_extracted] [IfcDoor]   (building file name under buildings/ ; class of R2). A building whose doors sit in no room judges its routed half with a class that does:
//        node viewer/tests/witness_mission_processor.js HHS_Office_Federated_extracted IfcFlowTerminal   (about 15 minutes with the three red controls; the log is witness_mission_processor.<building>.log)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BLD = process.argv[2] || 'Duplex_extracted', CLS = process.argv[3] || 'IfcDoor';   // CLS: the class of the class-Request (the spec's is IfcDoor; a building whose doors sit in no room needs a class that does, to judge routed paths)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
const CAT_UU = 'bdf15a57-436f-44d1-89f6-3925563cf296', TYPE_UU = 'be7c0c0c-4b1e-4fbb-ac29-3ad08c1d13a9';
let MUT = null;   // red control: { file, edits:[{from,to}] } applied to that file when served
const mutate = (src, edits) => edits.reduce((s, e) => { if (s.indexOf(e.from) < 0) throw new Error('red control: snippet not found: ' + e.from); return s.replace(e.from, e.to); }, src);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    let body = buf; if (MUT && p === '/viewer/' + MUT.file) body = Buffer.from(mutate(buf.toString('utf8'), MUT.edits));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESK = { viewport: { width: 1280, height: 800 } };

const log = []; let checks = 0, fails = 0, inconc = 0;
function S(m) { log.push(m); console.log(m); }
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-MISSION-PREPARE ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function openPage(browser, base, profile) {
  const ctx = await browser.newContext(profile), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('request', r => reqs.push(r.url())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(base + '/viewer/viewer.html?db=buildings/' + BLD + '.db', { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && window.ProjFold && APP._SQL && window.ProjOrderState && APP.lazy)).catch(() => false); }
  return { ctx, page, cons, reqs, errs, ready };
}
async function waitLine(cons, re, ms, from) { for (let i = 0; i < (ms || 20000) / 200; i++) { const l = cons.slice(from || 0).find(t => re.test(t)); if (l) return l; await sleep(200); } return null; }

// the real push of every IfcDoor of the open model (the Zoom-Across entry selects the whole class; › ERP then folds it)
async function pushDoors(P) {
  const n0 = P.cons.length;
  await P.page.evaluate(async (cls) => { await window.APP.loadNavigate(); window.APP.applyFindScope(cls, {}); }, CLS); await sleep(2500);
  await P.page.waitForFunction(() => { const b = document.getElementById('find-erp-btn'); return b && b.offsetWidth > 0; }, null, { timeout: 30000 }).catch(() => {});
  await P.page.evaluate(() => document.getElementById('find-erp-btn').click());
  const l = await waitLine(P.cons, /§PROJ_PUSH_PERSIST|§PROJ_PUSH_ERR|§PROJ_PUSH_DEFER/, 60000, n0);
  return { line: l, push: P.cons.slice(n0).find(t => /§PROJ_PUSH project=/.test(t)) || null };
}

// the three fixture Requests, written into the Kernel store from the model's own rows
async function makeRequests(P, single) {
  return P.page.evaluate(async (a) => {
    const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
    const q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; };
    const alloc = window.ProjFold._allocator(db);
    const proj = q('SELECT c_project_id, ad_client_id, ad_org_id, note FROM c_project WHERE value = ?', [APP.activeBuilding])[0];
    if (!proj) return { error: 'no Project Order after the push' };
    const typ = q('SELECT r_requesttype_id FROM r_requesttype WHERE r_requesttype_uu = ?', [a.TYPE_UU])[0], cat = q('SELECT r_statuscategory_id FROM r_statuscategory WHERE r_statuscategory_uu = ?', [a.CAT_UU])[0];
    if (!typ || !cat) return { error: 'the Site Task rows are not in the store (type=' + !!typ + ' category=' + !!cat + ')' };
    const nw = q("SELECT r_status_id FROM r_status WHERE r_statuscategory_id = ? AND isdefault = 'Y'", [cat[0]])[0];
    const model = APP.dbQuery("SELECT m.guid, m.storey, t.center_x, t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = ? AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid", [a.cls || 'IfcWindow']);
    const one = model[0]; if (!one) return { error: 'no positioned element of class ' + a.cls };
    const tpl = q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product WHERE value = ?', [a.CLS])[0] || q('SELECT m_product_category_id, c_uom_id, c_taxcategory_id FROM m_product WHERE m_product_id >= 990000 LIMIT 1')[0];
    const now = '2026-11-28 12:00:00';
    function product(value) {
      const have = q('SELECT m_product_id FROM m_product WHERE value = ?', [value])[0]; if (have) return have[0];
      const id = alloc('m_product', 'm_product_id');
      db.run("INSERT INTO m_product (m_product_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,value,name,m_product_category_id,c_uom_id,producttype,issummary,isstocked,issold,ispurchased,m_product_uu,c_taxcategory_id) VALUES (?,?,?,'Y',?,100,?,100,?,?,?,?,'I','N','N','Y','Y',?,?)",
        [id, proj[1], proj[2], now, now, value, value + ' (W-MISSION-PREPARE)', tpl[0], tpl[1], crypto.randomUUID(), tpl[2]]);
      return id;
    }
    const specs = [   // inserted in this order on purpose: R3, R1, R2
      { k: 'R3', doc: 'WO25-10', date: '2026-12-03 08:00:00', value: 'WO25-NO-SUCH-ELEMENT', sum: 'Check something that is not in the model' },
      { k: 'R1', doc: 'WO25-30', date: '2026-12-01 08:00:00', value: one[0], sum: 'Inspect this one element' },
      { k: 'R2', doc: 'WO25-20', date: '2026-12-02 08:00:00', value: a.CLS, sum: 'Check every ' + a.CLS }];
    const out = { project: proj[0], note_len: proj[3] ? String(proj[3]).length : 0, note_guids: proj[3] ? String(proj[3]).split(',').length : 0, note: proj[3] ? String(proj[3]).split(',') : [], new_status: nw[0], single: { guid: one[0], storey: one[1], x: one[2], y: one[3] }, reqs: {} };
    specs.forEach(s => {
      const pid = product(s.value), id = alloc('r_request', 'r_request_id'), uu = crypto.randomUUID();
      db.run("INSERT INTO r_request (r_request_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,documentno,r_requesttype_id,r_status_id,priority,priorityuser,duetype,summary,confidentialtype,confidentialtypeentry,isescalated,isselfservice,salesrep_id,processed,isinvoiced,requestamt,m_product_id,c_project_id,datestartplan,startdate,r_request_uu) " +
        "VALUES (?,?,?,'Y',?,100,?,100,?,?,?,'5','5','5',?,'C','C','N','N',100,'N','N',0,?,?,?,?,?)", [id, proj[1], proj[2], now, now, s.doc, typ[0], nw[0], s.sum, pid, proj[0], s.date, now, uu]);
      out.reqs[s.k] = { id, uu, doc: s.doc, date: s.date, product: s.value };
    });
    await window.ProjOrderState.persistShared(db, 'witness');
    return out;
  }, { TYPE_UU, CAT_UU, cls: single, CLS });
}

// what the Kernel store says about the three Requests (status, History rows)
const readState = (P, reqs) => P.page.evaluate(async (ids) => {
  const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'), db = st.db;
  const q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; }, out = {};
  Object.keys(ids).forEach(k => { const id = ids[k];
    out[k] = { status: (q('SELECT r_status_id FROM r_request WHERE r_request_id = ?', [id])[0] || [null])[0],
      actions: q('SELECT r_requestaction_id, r_status_id, nullcolumns FROM r_requestaction WHERE r_request_id = ? ORDER BY r_requestaction_id', [id]).map(v => ({ id: v[0], status: v[1], nullcolumns: v[2] })) }; });
  out._allActions = q('SELECT COUNT(*) FROM r_requestaction')[0][0]; return out; }, Object.fromEntries(Object.entries(reqs).map(([k, v]) => [k, v.id])));

// one full run on a fresh desktop page: push, fixture, the real control, everything measured. `muts` = a red control
async function scenario(browser, base, label, single, opts) {
  opts = opts || {};
  const P = await openPage(browser, base, DESK);
  if (!P.ready) { S('§W-MISSION-PREPARE ABORT ' + label + ' model never ready ' + P.errs.join(' | ')); return { P, abort: true }; }
  const R = { P, label };
  R.bootReqs = P.reqs.filter(u => /\/(mission_processor|request_changed)\.js/.test(u)).length;
  R.push = await pushDoors(P);
  R.fx = await makeRequests(P, single);
  if (R.fx.error) { S('§W-MISSION-PREPARE ABORT ' + label + ' ' + R.fx.error + ' push=' + (R.push.line || 'none')); R.abort = true; return R; }
  R.btn = await P.page.evaluate(() => { const b = document.getElementById('find-mission-btn'); return b ? { text: b.textContent, shown: b.offsetWidth > 0 } : null; });
  R.reqsBeforeClick = P.reqs.filter(u => /\/(mission_processor|request_changed)\.js/.test(u)).length;
  const n0 = P.cons.length, dl = P.page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await P.page.evaluate(() => document.getElementById('find-mission-btn').click());
  R.prepLine = await waitLine(P.cons, /^§MISSION_PREPARE project=/, 120000, n0);
  const d = await dl; R.file = null; R.fileName = d ? d.suggestedFilename() : null;
  if (d) { try { R.file = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); } catch (e) { R.fileErr = e.message; } }
  await sleep(500);
  R.logs = P.cons.slice(n0);
  R.resultText = await P.page.evaluate(() => (document.getElementById('find-mission-result') || {}).textContent || '');
  R.reqsAfterClick = P.reqs.filter(u => /\/(mission_processor|request_changed)\.js/.test(u));
  R.state = await readState(P, R.fx.reqs);
  R.fileV = R.file ? await P.page.evaluate(f => { APP.cacheStoreyLevels(); const v = window.TaskMission.validate(f, APP.walkStoreyLevels); return { ok: v.ok, why: v.why, refused: v.refused.length, tasks: v.tasks.length }; }, R.file) : null;
  return R;
}
const parsePrep = l => { const m = /requests=(\d+) prepared=(\d+) skipped=(\d+) tasks=(\d+) routed=(\d+) straight=(\d+) start=(\S+)/.exec(l || ''); return m ? { requests: +m[1], prepared: +m[2], skipped: +m[3], tasks: +m[4], routed: +m[5], straight: +m[6], start: m[7] } : null; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, logFile = path.join(__dirname, 'witness_mission_processor.' + BLD.replace(/_extracted$/, '') + '.log');
  const flush = () => fs.writeFileSync(logFile, log.join('\n') + '\n');
  const browser = await chromium.launch();
  // which class gives the single element: the first class (not IfcDoor) the model has positioned elements of
  const probe = await openPage(browser, base, DESK);
  if (!probe.ready) { S('§W-MISSION-PREPARE ABORT model never ready'); flush(); process.exit(1); }
  const single = await probe.page.evaluate((cls) => { const r = APP.dbQuery("SELECT m.ifc_class, COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.storey IS NOT NULL AND t.center_x IS NOT NULL AND m.ifc_class <> ? AND m.ifc_class LIKE 'Ifc%' AND m.ifc_class NOT IN ('IfcSpace','IfcOpeningElement') GROUP BY m.ifc_class ORDER BY (m.ifc_class = 'IfcWindow') DESC, 2 DESC LIMIT 1", [cls]); return r.length ? r[0][0] : null; }, CLS);
  const doorQuery = "SELECT m.guid, m.storey, t.center_x, t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = '" + CLS + "' AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid";
  const doors = await probe.page.evaluate(q => APP.dbQuery(q), doorQuery);
  await probe.ctx.close();
  S('── arrange: ' + BLD + ' on the desktop profile; single-element class=' + single + '; IfcDoor rows=' + doors.length + ' ──');
  S('§W-MISSION-PREPARE FIXTURE door_query="' + doorQuery + '" rows=' + doors.length + ' single_class=' + single);
  if (!single || !doors.length) { S('§W-MISSION-PREPARE ABORT the model has no IfcDoor rows or no other positioned class'); flush(); process.exit(1); }

  // ── the real run ───────────────────────────────────────────────────────────────────────────────────────────────────
  const A = await scenario(browser, base, 'real', single);
  if (A.abort) { flush(); process.exit(1); }
  const P = A.P, prep = parsePrep(A.prepLine);
  S('── fixture: push=' + (A.push.push ? A.push.push.slice(0, 150) : A.push.line) + ' · project=' + A.fx.project + ' pushed_guids=' + A.fx.note_guids + ' · requests ' + JSON.stringify(A.fx.reqs) + ' · single ' + JSON.stringify(A.fx.single) + ' ──');
  S('── the control: button=' + JSON.stringify(A.btn) + ' · ' + A.prepLine + ' · file=' + A.fileName + ' · result text="' + A.resultText.replace(/\n/g, ' | ') + '" ──');
  const tasks = (A.file && A.file.tasks) || [], R1 = A.fx.reqs.R1, R2 = A.fx.reqs.R2, R3 = A.fx.reqs.R3, NEW = A.fx.new_status;

  // Q1
  const skipLine = A.logs.find(t => /^§MISSION_PREPARE_SKIP /.test(t)) || '';
  const cQ1 = a => { const p = parsePrep(a.prepLine); return !!p && p.requests === 3 && p.prepared === 2 && p.skipped === 1 && /request=\d+ documentno=WO25-10 why=product "WO25-NO-SUCH-ELEMENT" is neither an element of this model nor a class in it/.test((a.logs.find(t => /^§MISSION_PREPARE_SKIP /.test(t)) || '')) && a.state.R3.status === a.fx.new_status && a.state.R3.actions.length === 0; };
  check('Q1', cQ1(A), A.prepLine + ' · ' + skipLine + ' · R3 status ' + A.state.R3.status + ' (New=' + NEW + ') History rows=' + A.state.R3.actions.length);

  // Q4 first (before the file is loaded as a mission): a REAL walk sample at task 1's x,y,storey, arrival radius 0.5
  const t1 = tasks[0];
  let q4 = null;
  if (t1) {
    const n4 = P.cons.length;
    q4 = await P.page.evaluate(async (t) => {
      await APP.lazy('tasks'); APP.cacheStoreyLevels();
      const lv = APP.walkStoreyLevels.find(l => l.storey === t.storey); if (!lv) return { err: 'no-storey' };
      APP._tasks = [{ id: t.id, radius_m: 0.5, qr: null, elements: [{ guid: t.guid, storey: t.storey, x: t.x, y: t.y }] }]; APP._taskArrivalState = {};
      const p = APP.ifc2three(t.x, t.y, lv.floorZ); APP.camera.position.set(p.x, p.y + APP.WALK_EYE_HEIGHT, p.z);
      const keep = APP.WALK_STEP_DISTANCE; APP.WALK_STEP_DISTANCE = 0; APP.walkStepCount = (APP.walkStepCount || 0) + 5; APP.advanceWalkStep(); APP.WALK_STEP_DISTANCE = keep;
      const back = APP.three2ifc(p.x, p.y, p.z); return { ok: true, round_trip_x: back.ix, round_trip_y: back.iy }; }, t1);
    await sleep(600);
    const arr = P.cons.slice(n4).find(t => /^§TASK_ARRIVE task=/.test(t)) || '';
    const m = /d_m=([0-9.]+) radius_m=0.5 storey=(.*)$/.exec(arr);
    check('Q4', !!(q4 && q4.ok) && arr.indexOf('task=' + t1.id + ' guid=' + t1.guid + ' by=distance') >= 0 && !!m && m[1] === '0.000' && m[2] === t1.storey,
      'task 1 = ' + t1.id + ' guid ' + t1.guid + ' at x=' + t1.x + ' y=' + t1.y + ' storey ' + t1.storey + ' · ' + arr);
  } else check('Q4', false, 'the file has no task');

  // Q2 — the phone's own loader (the file as downloaded)
  const n2 = P.cons.length;
  const ld = A.file ? await P.page.evaluate(async f => { const m = await APP.loadMission(f); return { ok: !!m, state: APP.missionState && APP.missionState() }; }, A.file) : null;
  const loadLine = (await waitLine(P.cons, /^§MISSION_LOAD /, 20000, n2)) || '';
  const cQ2 = (line, fv) => /tasks=\d+ refused=0 model_match=true/.test(line) && !!fv && fv.refused === 0 && fv.ok;
  check('Q2', cQ2(loadLine, A.fileV), loadLine + ' · TaskMission.validate on the same file: ' + JSON.stringify(A.fileV) + ' · file meta ' + JSON.stringify(A.file && A.file.mission));

  // Q3
  const pushedSet = new Set(A.fx.note), rows = pushedSet.size ? doors.filter(d => pushedSet.has(d[0])) : doors;   // the class Request is narrowed to the project's pushed set (C_Project.Note): the rows the model query returns that the push stored
  const doorSet = new Set(rows.map(d => d[0])), expTasks = 1 + rows.length;
  const inModel = await P.page.evaluate(gs => gs.map(g => APP.dbQuery('SELECT COUNT(*) FROM elements_meta WHERE guid = ?', [g])[0][0]), tasks.map(t => t.guid));
  const uniq = new Set(tasks.map(t => t.guid)).size, uniqIds = new Set(tasks.map(t => t.id)).size;
  check('Q3', tasks.length === expTasks && inModel.every(n => n === 1) && uniq === tasks.length && uniqIds === tasks.length && tasks.filter(t => doorSet.has(t.guid)).length === rows.length && tasks.filter(t => t.guid === A.fx.single.guid).length === 1,
    'tasks=' + tasks.length + ' expected 1 + ' + rows.length + ' = ' + expTasks + ' (' + CLS + ' rows of the model query ' + doors.length + ', of them in the project\'s pushed set ' + rows.length + ' — the processor narrows a class to the pushed set, the reader rule of erp/idempiere.html _linkBack)' + ' · every guid in elements_meta=' + inModel.every(n => n === 1) + ' · distinct guids=' + uniq + ' distinct task ids=' + uniqIds + ' · ' + CLS + ' tasks=' + tasks.filter(t => doorSet.has(t.guid)).length);

  // Q5 — independent recompute
  const lvls = await P.page.evaluate(() => APP.walkStoreyLevels.map(l => [l.storey, l.floorZ])), fz = Object.fromEntries(lvls);
  const dst = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((fz[a.storey] || 0) - (fz[b.storey] || 0)) ** 2);
  let cur = { x: A.fx.single.x, y: A.fx.single.y, storey: A.fx.single.storey }; const left = rows.map(d => ({ guid: d[0], storey: d[1], x: d[2], y: d[3] })), want = [];
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((e, i) => { const d = dst(cur, e); if (d < bd || (d === bd && e.guid < left[bi].guid)) { bd = d; bi = i; } }); const e = left.splice(bi, 1)[0]; want.push(e.guid); cur = e; }
  const seqOk = tasks.every((t, i) => t.seq === i + 1), gotDoors = tasks.slice(1).map(t => t.guid), docs = tasks.map(t => t.documentno);
  check('Q5', seqOk && tasks[0] && tasks[0].guid === A.fx.single.guid && tasks[0].documentno === 'WO25-30' && docs.slice(1).every(d => d === 'WO25-20') && eq(gotDoors, want),
    'seq ascending 1..' + tasks.length + '=' + seqOk + ' · first task = R1 (' + (tasks[0] && tasks[0].documentno) + ', date-first, DocumentNo-last) · next ' + gotDoors.length + ' tasks all R2=' + docs.slice(1).every(d => d === 'WO25-20') +
    ' · nearest-next recomputed here from R1\'s spot (xy + storey height, ties by guid): ' + (eq(gotDoors, want) ? 'the same ' + want.length + ' guids in the same order' : 'DIFFERENT first diff at ' + gotDoors.findIndex((g, i) => g !== want[i])));

  // Q6 — paths
  const taskLogs = A.logs.filter(t => /^§MISSION_PREPARE_TASK /.test(t)).map(t => ({ seq: +/seq=(\d+)/.exec(t)[1], room: (/ room=(\S+)/.exec(t) || [])[1], kind: (/path_kind=(\w+)/.exec(t) || [])[1] }));
  const univ = tasks.every(t => Array.isArray(t.path) && t.path.length >= 2 && t.path.every(q => Array.isArray(q) && typeof q[0] === 'number' && typeof q[1] === 'number' && typeof q[2] === 'string') && Math.hypot(t.path[t.path.length - 1][0] - t.x, t.path[t.path.length - 1][1] - t.y) <= 0.001 && t.path[t.path.length - 1][2] === t.storey && (t.path_kind === 'routed' || t.path_kind === 'straight'));
  const nR = tasks.filter(t => t.path_kind === 'routed').length, nS = tasks.filter(t => t.path_kind === 'straight').length;
  const routedCheck = nR ? await P.page.evaluate(async ([ts, rooms]) => {
    const g = APP.getRoomGraph(), RG = window.RoomGraph, out = []; const roomBy = {}; rooms.forEach(r => roomBy[r.seq] = r.room);
    ts.forEach((t, i) => { if (t.path_kind !== 'routed' || i === 0) return;
      const a = roomBy[ts[i - 1].seq], b = roomBy[t.seq], sp = RG.shortestPath(g, a, b), poly = (sp && sp.polyline) || [], mid = t.path.slice(1, t.path.length - 1);
      out.push({ seq: t.seq, from: a, to: b, hops: sp && sp.doors ? sp.doors.length : -1, poly: poly.length, mid: mid.length, equal: poly.length === mid.length && poly.every((p, k) => Math.abs(p.x - mid[k][0]) < 1e-9 && Math.abs(p.y - mid[k][1]) < 1e-9),
        first: Math.hypot(t.path[0][0] - 0, 0) >= 0 }); }); return out; }, [tasks, taskLogs]) : [];
  const frontOk = tasks.every((t, i) => t.path_kind !== 'routed' || i === 0 || (Math.abs(t.path[0][0] - tasks[i - 1].x) < 1e-9 && Math.abs(t.path[0][1] - tasks[i - 1].y) < 1e-9 && t.path[0][2] === tasks[i - 1].storey));
  const straightOk = tasks.every((t, i) => t.path_kind !== 'straight' || (t.path.length === 2 && (i === 0 || (t.path[0][0] === tasks[i - 1].x && t.path[0][1] === tasks[i - 1].y && t.path[0][2] === tasks[i - 1].storey))));
  const counted = !!prep && prep.routed === nR && prep.straight === nS && nR + nS === tasks.length;
  const q6ok = univ && counted && straightOk && frontOk && routedCheck.every(r => r.equal);
  check('Q6', q6ok, 'every path >= 2 points ending at its task\'s x,y within 1 mm on its storey=' + univ + ' · routed=' + nR + ' straight=' + nS + ' (log says ' + (prep ? prep.routed + '/' + prep.straight : '?') + ', sum ' + (nR + nS) + ' = tasks ' + tasks.length + ')=' + counted +
    ' · straight paths are [previous spot, element]=' + straightOk + ' · routed paths start at the previous spot=' + frontOk + ' · routed paths vs a direct RoomGraph.shortestPath: ' + (routedCheck.length ? routedCheck.map(r => 'seq' + r.seq + ' ' + r.from + '->' + r.to + ' hops=' + r.hops + ' polyline ' + r.poly + ' pts ' + (r.equal ? 'EQUAL' : 'DIFFER')).join('; ') : 'none routed'));
  if (!nR) { inconc++; S('§W-MISSION-PREPARE Q6 ROUTED-HALF INCONCLUSIVE routed=0 of ' + tasks.length + ': no task of this model has a graph room to start from or end in (rooms: ' + (A.logs.find(t => /^§MISSION_PREPARE_ROOMS/.test(t)) || '') + ') — run the witness on a building whose elements fall in rooms'); }
  else if (!routedCheck.length) { inconc++; S('§W-MISSION-PREPARE Q6 ROUTED-HALF INCONCLUSIVE routed=' + nR + ' but none beyond the first task could be compared with a direct shortestPath call'); }
  S('§W-MISSION-PREPARE PATHS ' + taskLogs.slice(0, 40).map(r => r.seq + ':' + r.kind + (r.room && r.room !== 'none' ? '@' + r.room : '')).join(' ') + ' | ' + (A.logs.find(t => /^§MISSION_PREPARE_ROOMS/.test(t)) || ''));

  // Q7 — statuses + History + second run
  const pv = A.state, histOk = k => pv[k].actions.length === 1 && pv[k].actions[0].status === NEW, prepared = k => pv[k].status !== NEW && pv[k].status != null;
  const n7 = P.cons.length, allBefore = pv._allActions;
  const second = await P.page.evaluate(async id => { const r = await APP.prepareMission(id, {}); return { prepared: r.prepared.length, skipped: r.skipped.length, error: r.error || null, file_tasks: r.mission ? r.mission.tasks.length : null }; }, A.fx.project);
  const secLine = (await waitLine(P.cons, /^§MISSION_PREPARE project=/, 30000, n7)) || '', sp2 = parsePrep(secLine), after2 = await readState(P, A.fx.reqs);
  const statusNames = await P.page.evaluate(async () => { const st = await window.ProjOrderState.shared(APP._SQL, () => APP.cachedFetch('../erp/ad_seed.db'), 'witness'); const r = st.db.exec("SELECT r_status_id, name FROM r_status WHERE r_statuscategory_id = 990001"); return Object.fromEntries(r[0].values); });
  const cQ7moved = a => ['R1', 'R2'].every(k => a.state[k].status !== a.fx.new_status) && !!a.fileV && a.fileV.refused === 0 && a.fileV.ok;
  check('Q7', prepared('R1') && prepared('R2') && histOk('R1') && histOk('R2') && pv.R3.status === NEW && pv.R3.actions.length === 0 && pv.R1.status === pv.R2.status && statusNames[pv.R1.status] === 'Prepared' && cQ7moved(A) &&
    !!sp2 && sp2.requests === 1 && sp2.prepared === 0 && second.prepared === 0 && after2._allActions === allBefore && after2.R1.status === pv.R1.status && after2.R2.status === pv.R2.status,
    'R1 status ' + pv.R1.status + ' (' + statusNames[pv.R1.status] + ') History ' + JSON.stringify(pv.R1.actions) + ' · R2 status ' + pv.R2.status + ' History ' + JSON.stringify(pv.R2.actions) + ' · R3 status ' + pv.R3.status + ' History ' + pv.R3.actions.length + ' · New=' + NEW +
    ' · file validates (refused=' + (A.fileV && A.fileV.refused) + ') for the moved Requests · second run: ' + secLine.replace(/^§MISSION_PREPARE /, '') + ' · History rows in the store ' + allBefore + ' -> ' + after2._allActions);

  // Q8 — nothing at boot; phone profile
  const PH = await openPage(browser, base, PHONE);
  let ph = { ready: PH.ready };
  if (PH.ready) {
    ph = await PH.page.evaluate(async () => { await APP.loadNavigate(); APP.openFindPanel('IfcDoor'); await new Promise(r => setTimeout(r, 2500));
      return { phone: !!(window._caps && window._caps.phone), erpBtn: !!document.getElementById('find-erp-btn'), missionBtn: !!document.getElementById('find-mission-btn'), missionResult: !!document.getElementById('find-mission-result'), hasPrep: typeof APP.prepareMission }; });
    ph.reqs = PH.reqs.filter(u => /\/(mission_processor|request_changed)\.js/.test(u)).length;
  }
  const eachOnce = ['mission_processor.js', 'request_changed.js'].every(f => A.reqsAfterClick.filter(u => u.indexOf('/' + f) >= 0).length === 1);
  check('Q8', A.bootReqs === 0 && A.reqsBeforeClick === 0 && A.reqsAfterClick.length === 2 && eachOnce && !!A.btn && A.btn.shown && PH.ready && ph.phone === true && ph.erpBtn === true && ph.missionBtn === false && ph.missionResult === false && ph.reqs === 0 && ph.hasPrep === 'undefined',
    'desktop: processor files requested at boot=' + A.bootReqs + ', after the Find panel + the push + the fixture, before the click=' + A.reqsBeforeClick + ', after the click=' + A.reqsAfterClick.map(u => u.split('/').pop().split('?')[0]).join('+') + ' · control "' + (A.btn && A.btn.text) + '" shown=' + (A.btn && A.btn.shown) +
    ' · phone profile (caps.phone=' + ph.phone + '): Find panel built (the › ERP button is there)=' + ph.erpBtn + ', Prepare control present=' + ph.missionBtn + ', result area=' + ph.missionResult + ', processor files requested=' + ph.reqs + ', APP.prepareMission is ' + ph.hasPrep);
  await PH.ctx.close(); await A.P.ctx.close();

  // ── red controls ───────────────────────────────────────────────────────────────────────────────────────────────────
  S('\n── red controls (each must make its check FAIL) ──');
  let red = 0;
  const BLANK = { from: "storey: String(el.storey), x: el.x, y: el.y, seq: seq,", to: "storey: (seq === 1 ? '' : String(el.storey)), x: el.x, y: el.y, seq: seq," };
  // R1: the validator call removed and one task's storey blanked -> the file is refused by the phone's loader (Q2 fails)
  MUT = { file: 'mission_processor.js', edits: [{ from: 'var V = window.TaskMission.validate(mission, A.walkStoreyLevels);   // R1 marker', to: 'var V = { ok: true, refused: [], why: "" };' }, BLANK] };
  { const r = await scenario(browser, base, 'R1', single); let l = ''; if (r.file) { const n = r.P.cons.length; await r.P.page.evaluate(async f => { await APP.lazy('tasks'); await APP.loadMission(f); }, r.file); l = (await waitLine(r.P.cons, /^§MISSION_LOAD /, 20000, n)) || ''; }
    const failed = !cQ2(l, r.fileV); S('§W-MISSION-PREPARE R1 validator call removed + task 1 storey blanked: ' + l + ' (a correct run says refused=0) -> Q2 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await r.P.ctx.close(); }
  // R2: the "resolves to no element" guard removed -> the unresolved Request is no longer reported (Q1 fails)
  MUT = { file: 'mission_processor.js', edits: [{ from: "if (why) { skipped.push({ request: r.r_request_id, documentno: r.documentno, why: why });", to: "if (false) { skipped.push({ request: r.r_request_id, documentno: r.documentno, why: why });" }] };
  { const r = await scenario(browser, base, 'R2', single); const failed = !r.abort && !cQ1(r); S('§W-MISSION-PREPARE R2 "resolves to no element" guard removed: ' + (r.prepLine || 'no result') + ' · R3 History rows ' + (r.state && r.state.R3.actions.length) + ' (a correct run says skipped=1) -> Q1 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; if (r.P) await r.P.ctx.close(); }
  // R3: the status move made although the file does not validate -> Prepared Requests with no usable mission (Q7 fails)
  MUT = { file: 'mission_processor.js', edits: [{ from: 'var invalid = !V.ok || V.refused.length > 0;                        // R3 marker', to: 'var invalid = false;' }, BLANK] };
  { const r = await scenario(browser, base, 'R3', single); const failed = !r.abort && !cQ7moved(r); S('§W-MISSION-PREPARE R3 status moved with a broken file: R1 status ' + (r.state && r.state.R1.status) + ' R2 status ' + (r.state && r.state.R2.status) + ' (New=' + r.fx.new_status + ') while the file validates as ' + JSON.stringify(r.fileV) + ' -> Q7 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; if (r.P) await r.P.ctx.close(); }
  MUT = null;

  await browser.close(); server.close();
  const verdict = fails > 0 || red !== 3 ? 'FAIL' : (inconc > 0 ? 'INCONCLUSIVE' : 'PASS');
  S('§W-MISSION-PREPARE building=' + BLD + ' checks=' + checks + ' fail=' + fails + ' inconclusive=' + inconc + ' red=' + red + '/3 verdict=' + verdict);
  flush();
  process.exit(verdict === 'FAIL' ? 1 : 0);
})().catch(e => { console.error(e); S('§W-MISSION-PREPARE CRASH ' + (e && e.stack || e)); try { fs.writeFileSync(path.join(__dirname, 'witness_mission_processor.' + BLD.replace(/_extracted$/, '') + '.log'), log.join('\n') + '\n'); } catch (e2) { /* ignore */ } process.exit(1); });
