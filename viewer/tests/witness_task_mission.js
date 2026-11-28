// ⚠ DO NOT REMOVE — WITNESS W-TASK-MISSION (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-24 "The phone runs a mission", + the designer's ruling of the same day:
//   the room path's line drawer moved into viewer/route_line.js and both callers use it). READ viewer/tests/witness_task_mission.log AFTER EVERY RUN.
// ISSUE THIS PROVES OR DISPROVES: with a mission loaded, a PHONE (headless phone profile, Duplex) shows its tasks in order, draws the path to the NEXT task with the
//   room path's own drawer, opens that task's card on arrival, takes the form, queues the report in the Send-to-HQ outbox, and moves on — and the room path itself still
//   draws number-for-number what it drew before the drawer was moved. Numbers only; no screenshots.
// THE FIXTURE IS BUILT FROM THE MODEL: three IfcDoor rows of the open Duplex (guid, storey, centre) read with ONE query printed in the log — no typed guid or coordinate.
// PHOTOS: headless has no camera. navigator.mediaDevices.getUserMedia is replaced by a canvas.captureStream() MediaStream (a real stream of drawn frames); everything after it
//   is the real Site Camera path (openSiteCamera, snapSitePhoto, the Save button). The queue is the REAL outbox (IndexedDB bim_hq_outbox), read back, never faked.
//   M1  boot requests none of the task files / route_line.js; #mission= loads each once and requests no navigate.js / nf_*.js / room_graph.js
//   M2  §MISSION_LOAD tasks=3 refused=0 model_match=true; a copy with one guid removed -> refused=1 naming it
//   M3  the path drawn for step 1 = the fixture's points (the drawer's own meshes, numbers)
//   M4  a walk sample at the element opens exactly one card (sheets 0 -> 1); a later task's element, or one storey up, opens none; "I'm here" and a typed code open it too
//   M5  built-in form: Done with text + one photo queues a report equal to the typed values and the task's guid
//   M6  five-component form: each answer under its fieldId; a required empty field refuses Done (nothing queued); an unsupported component is a named row and counted
//   M7  step 2 of 3 is drawn after M5; a reload keeps step 2 and redraws its path
//   M8  "Can't proceed" asks a reason, queues outcome:"cannot" with the reason and the model version; the mission then completes with the counts
//   M9  #mission= from another origin: §MISSION_REFUSED origin=, nothing loaded, the other server saw no request
//   M10 the room path (Find > Room > Path, desktop) draws the same line vertices, marker positions and mesh count as the recording made on origin/main before the move
//   R1 "current task only" removed -> M4 (later task) FAILS · R2 validation removed -> M2 (second half) FAILS · R3 required-field check removed -> M6 FAILS
//   WO-31 "The standard task form" (bim-compiler prompts/MOBILE_PERF.md WO-31; the checklist = the Standard Response picked on the task's Request, so it is PER TASK in the file; materials are mission-level):
//   S1  a type with 3 resolutions, a task with a 4-line checklist and a mission with 2 materials renders exactly those (counts and texts read from the sheet); the next task of the same type shows ITS OWN 3 lines
//   S2  Done without an outcome picked is refused (nothing queued); with an outcome but a material product without a quantity it is refused too
//   S3  the report carries the picked resolution id, the ticks in the task's order, start < end (both ISO), the material and the quantity typed, outcome "done"
//   S4  a mission with no resolutions, no checklist and no materials renders text + photos + Done only (today's built-in form) and still reports (resolution null, checklist [], spent null)
//   R4 the outcome requirement removed -> S2 FAILS · R5 the checklist order shuffled in the form -> S3 FAILS
//   WO-34 "the office sets the arrival distance" (bim-compiler prompts/MOBILE_PERF.md WO-34): a mission whose type carries radius_m opens the CURRENT task's card by walking, in a REAL Walk (toggleWalkMode + setWalkAnchor),
//   through the existing walk.js _walkTaskArrive -> TaskArrival.arrive path, and walk.js hands the arrival to the mission with the explicit call A.onTaskArrive(show) (the old property setter on _taskArrivalShow is gone)
//   W1  the walker 2.6 m and 4.0 m (plan) from the current task's element, radius_m 2.5, same storey: no card, no §TASK_ARRIVE by=distance line
//   W2  2.4 m from it on its storey: exactly one card (sheets 0 -> 1, view card), exactly one §TASK_ARRIVE by=distance with d_m <= 2.5 and = the plan distance computed here from the walker's read-back position and the task's x,y (1 cm), exactly one
//       A.onTaskArrive call; a second sample inside the radius opens no second card; the strip still has "I'm here" and "Scan QR"
//   W3  the same x,y one storey up: no card (and back on the element's storey the card opens: the storey, not leftover state, was the reason)
//   W4  the same moves with radius_m null: no card by distance; "I'm here" still opens it
//   W5  no Object.defineProperty / setter on _taskArrivalShow remains in the tree (grep of viewer/ and erp/), no own property of that name on APP, walk.js calls A.onTaskArrive(...) and the page has it as a function once a mission is loaded
//   R6 (the order's R2) the A.onTaskArrive call removed from walk.js -> W2 FAILS
// Run: node viewer/tests/witness_task_mission.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const RP = require('./lib_room_path_capture.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
let MISSION = null;                  // what /mission/m.json serves
let MUT = null;                      // red control: { file, from, to } applied to that file when served
const mutate = (src, from, to) => { if (src.indexOf(from) < 0) throw new Error('red control: snippet not found: ' + from); return src.replace(from, to); };
function makeServer(onHit) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (onHit) onHit(p);
    if (p === '/mission/m.json') { res.writeHead(MISSION ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(MISSION ? JSON.stringify(MISSION) : ''); return; }
    if (p === '/') p = '/viewer/viewer.html';
    fs.readFile(path.join(ROOT, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      let body = buf;
      if (MUT && p === '/viewer/' + MUT.file) body = Buffer.from(mutate(buf.toString('utf8'), MUT.from, MUT.to));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
    });
  });
}
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };

const log = []; let checks = 0, fails = 0;
function S(m) { log.push(m); console.log(m); }
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-TASK-MISSION ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPhone(browser, base, hash, opts) {
  opts = opts || {};
  const ctx = opts.ctx || await browser.newContext(PHONE), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  await ctx.addInitScript(() => {   // the harness stands in for the camera SENSOR only: a MediaStream of drawn frames; the Site Camera path after it is the real one
    navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
      let n = 0; const draw = () => { g.fillStyle = 'hsl(' + ((n++ * 20) % 360) + ',60%,45%)'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.fillText('W-TASK-MISSION frame ' + n, 20, 120); }; draw(); setInterval(draw, 200);
      return c.captureStream(5); };
  });
  page.on('console', m => cons.push(m.text())); page.on('request', r => reqs.push(r.url())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(base + '/viewer/viewer.html?db=buildings/Duplex_extracted.db' + (hash || ''), { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && window._mainPillActions && window._mainPillActions.length && APP.sheets && APP.flushHqOutbox && APP._hq)).catch(() => false); }
  return { ctx, page, cons, reqs, errs, ready };
}
async function waitLine(cons, re, ms) { for (let i = 0; i < (ms || 20000) / 200; i++) { const l = cons.find(t => re.test(t)); if (l) return l; await sleep(200); } return null; }
const sheets = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(() => r({ open: APP.sheets.open.length, ids: APP.sheets.open.map(s => s.el.id), view: (document.getElementById('mission-sheet') || {}).getAttribute ? document.getElementById('mission-sheet').getAttribute('data-view') : null,
  shown: !!(document.getElementById('mission-sheet') && document.getElementById('mission-sheet').offsetWidth) }), 250))));
const click = (page, id) => page.evaluate(i => { const e = document.getElementById(i); if (!e) return false; e.click(); return true; }, id);
const stripText = page => page.evaluate(() => (document.getElementById('mission-strip-text') || {}).textContent || '');

// the walker's feet at an IFC x,y on a named storey: the camera is put there and 5 steps are taken with a zero step length, so the
// REAL walk.js trace mark runs _walkTaskArrive at exactly that point (nothing is faked inside the arrival path)
const walkSample = (page, x, y, storey) => page.evaluate(([x, y, st]) => {
  const lv = APP.walkStoreyLevels.find(l => l.storey === st); if (!lv) return 'no-storey';
  const p = APP.ifc2three(x, y, lv.floorZ); APP.camera.position.set(p.x, p.y + APP.WALK_EYE_HEIGHT, p.z);
  const keep = APP.WALK_STEP_DISTANCE; APP.WALK_STEP_DISTANCE = 0; APP.walkStepCount = (APP.walkStepCount || 0) + 5; APP.advanceWalkStep(); APP.WALK_STEP_DISTANCE = keep; return 'ok'; }, [x, y, storey]);

// the mission-owned meshes the shared drawer left in the scene
const missionMeshes = page => page.evaluate(() => { const out = []; APP.scene.traverse(o => { if (o.userData && o.userData._routeOwner === 'mission') out.push(o); });
  return out.map(o => o.type === 'Line' ? { type: 'Line', v: Array.from(o.geometry.attributes.position.array) } : { type: o.type, p: [o.position.x, o.position.y, o.position.z] }); });
const expectedPath = (page, task) => page.evaluate(t => t.path.map(q => { const lv = APP.walkStoreyLevels.find(l => l.storey === q[2]); const c = APP.ifc2three(q[0], q[1], lv.floorZ); return [c.x, c.y + 0.05, c.z]; }), task);
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-4);
async function pathMatches(page, task) {
  const exp = await expectedPath(page, task), got = await missionMeshes(page);
  const lines = got.filter(g => g.type === 'Line'), marks = got.filter(g => g.type !== 'Line');
  const lineOk = lines.length === 1 && lines[0].v.length === exp.length * 3 && exp.every((e, i) => [0, 1, 2].every(k => near(lines[0].v[i * 3 + k], e[k])));
  const markOk = marks.length === exp.length * 2 && exp.every(e => marks.filter(m => [0, 1, 2].every(k => near(m.p[k], e[k]))).length === 2);   // a halo and a marker at each point
  return { ok: lineOk && markOk, detail: 'expected ' + exp.length + ' points -> line ' + (lines.length ? lines[0].v.length / 3 : 0) + ' vertices (' + (lineOk ? 'equal' : 'DIFFER') + '), ' + marks.length + ' marker meshes (' + (markOk ? 'equal' : 'DIFFER') + ') mission meshes=' + got.length, exp };
}
const outbox = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('bim_hq_outbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
  r.onerror = () => res([]); r.onsuccess = () => { const q = r.result.transaction('q').objectStore('q').getAll(); q.onsuccess = async () => { const items = [];
    for (const it of q.result) { const files = []; for (const f of it.files) { const b = new Uint8Array(await f.blob.arrayBuffer()); files.push({ name: f.name, type: f.type, size: b.length, head: Array.from(b.slice(0, 3)), text: /json/.test(f.type) ? new TextDecoder().decode(b) : null }); } items.push({ id: it.id, files }); } res(items); }; q.onerror = () => res([]); }; }));
const reportOf = item => { const j = item.files.find(f => /_report\.json$/.test(f.name)); return j ? JSON.parse(j.text) : null; };
// take one photo through the REAL Site Camera: open, snap, Save (the Save button's own handler)
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

(async () => {
  const server = makeServer(), other = (() => { let hits = 0; const s = makeServer(p => { hits++; }); s.hits = () => hits; return s; })();
  await new Promise(r => server.listen(0, '127.0.0.1', r)); await new Promise(r => other.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, otherBase = 'http://127.0.0.1:' + other.address().port;
  const browser = await chromium.launch();
  const hash = (u) => '#mission=' + encodeURIComponent(u);

  // ── arrange: a phone page with NO mission: boot census + the fixture, read from the model ────────────────────────────────────────────────────────────────────
  S('── arrange: Duplex on the phone profile, no mission ──');
  const P0 = await openPhone(browser, base, '');
  if (!P0.ready) { S('§W-TASK-MISSION ABORT model never ready ' + P0.errs.join(' | ')); fs.writeFileSync(path.join(__dirname, 'witness_task_mission.log'), log.join('\n') + '\n'); process.exit(1); }
  const bootTask = P0.reqs.filter(u => /\/(task_arrival|task_form|task_mission|route_line)\.js/.test(u));
  const bootNav = P0.reqs.filter(u => /\/(navigate[a-z_]*|nf_[a-z_]+)\.js|room_graph\.js/.test(u));
  S('§W-TASK-MISSION BOOT task_files_requested=' + bootTask.length + ' navigate_stack_requested=' + bootNav.length + ' requests=' + P0.reqs.length);
  const SQLQ = "SELECT m.guid, m.storey, t.center_x, t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.storey IS NOT NULL AND t.center_x IS NOT NULL ORDER BY m.guid";
  const fx = await P0.page.evaluate(q => { APP.cacheStoreyLevels(); return { rows: APP.dbQuery(q), levels: APP.walkStoreyLevels.map(l => [l.storey, l.floorZ]) }; }, SQLQ);
  const picks = [];
  fx.rows.forEach(r => { if (picks.length < 3 && picks.every(p => Math.hypot(p[2] - r[2], p[3] - r[3]) >= 8)) picks.push(r); });   // >= 8 m apart: the 3 m arrival radii never overlap
  const entrance = fx.rows.find(r => picks.indexOf(r) < 0);
  S('§W-TASK-MISSION FIXTURE query="' + SQLQ + '" rows=' + fx.rows.length + ' storeys=' + fx.levels.length + ' picked=' + picks.map(p => p[0] + '(' + p[1] + ' x=' + p[2].toFixed(2) + ' y=' + p[3].toFixed(2) + ')').join(' ; ') +
    ' path_start=' + (entrance ? entrance[0] + '(' + entrance[1] + ')' : 'none'));
  if (picks.length < 3 || !entrance || fx.levels.length < 2) { S('§W-TASK-MISSION ABORT INCONCLUSIVE fixture population too small (picks=' + picks.length + ' storeys=' + fx.levels.length + ')'); process.exit(2); }
  const FORM_B = { window: { name: 'Install check', tabs: [{ name: 'Check', fields: [
    { fieldId: 'f_text', name: 'Notes', component: 'TEXT', sequence: 10, validation: { required: true } },
    { fieldId: 'f_safe', name: 'Anchors tight', component: 'SAFETY_CHECKLIST', sequence: 20, validation: { required: true } },
    { fieldId: 'f_photo', name: 'Photos', component: 'MULTI_PHOTO', sequence: 30 },
    { fieldId: 'f_sig', name: 'Signature', component: 'SIGNATURE', sequence: 40 },
    { fieldId: 'f_qr', name: 'Box code', component: 'QR_CHECKLIST', sequence: 50 }] }] } };
  const mk = (i, type, from) => ({ id: 'wt24-task-' + (i + 1), documentno: 'REQ-W24-' + (i + 1), type, summary: 'Check door ' + (i + 1), guid: picks[i][0], storey: picks[i][1], x: picks[i][2], y: picks[i][3], seq: (i + 1) * 10,
    path: [[from[2], from[3], from[1]], [picks[i][2], picks[i][3], picks[i][1]]] });
  const T = [mk(0, 'wt24-type-a', entrance), mk(1, 'wt24-type-b', picks[0]), mk(2, 'wt24-type-a', picks[1])];
  const MODEL_V = 'wt24-model-v1';
  const REAL = { v: 1, mission: { id: 'wt24-mission-1', name: 'Witness mission', project: 'wt24-project', model: { db: 'Duplex_extracted.db', version: MODEL_V } },
    types: { 'wt24-type-a': { name: 'Basic check', radius_m: 3, form: null }, 'wt24-type-b': { name: 'Install check', radius_m: 3, form: FORM_B } },
    tasks: [T[2], T[0], T[1]] };   // file order is NOT seq order: the phone must sort
  MISSION = REAL;
  const MURL = base + '/mission/m.json';
  await P0.ctx.close();

  // ── the main run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  S('\n── #mission= on the phone ──');
  const ctx = await browser.newContext(PHONE);
  const P = await openPhone(browser, base, hash(MURL), { ctx }), page = P.page, cons = P.cons;
  const loadLine = await waitLine(cons, /^§MISSION_LOAD /, 30000); await waitLine(cons, /^§MISSION_STEP /, 20000);
  // M1
  const need = ['route_line.js', 'task_arrival.js', 'task_form.js', 'task_mission.js'];
  const counts = need.map(f => P.reqs.filter(u => u.indexOf('/viewer/' + f) >= 0 || (u.indexOf('/' + f) >= 0 && u.indexOf('/viewer/') >= 0)).length);
  const navAfter = P.reqs.filter(u => /\/(navigate[a-z_]*|nf_[a-z_]+)\.js|room_graph\.js/.test(u));
  check('M1', bootTask.length === 0 && counts.every(c => c === 1) && navAfter.length === 0,
    'boot (no mission) requested task/route files=' + bootTask.length + '; with #mission= each of ' + need.join(',') + ' requested ' + counts.join(',') + ' time(s); navigate/nf_/room_graph requests=' + navAfter.length + (navAfter.length ? ' (' + navAfter.slice(0, 3).join(' ') + ')' : ''));
  // M2
  const broken = JSON.parse(JSON.stringify(REAL)); broken.mission.id = 'wt24-mission-broken';
  const victim = broken.tasks.find(t => t.id === 'wt24-task-2'); delete victim.guid;
  const n0 = cons.length; await page.evaluate(b => APP.loadMission(b), broken); await sleep(500);
  const bl = cons.slice(n0).find(t => /^§MISSION_LOAD /.test(t)) || '', br = cons.slice(n0).find(t => /^§MISSION_TASK_REFUSED /.test(t)) || '';
  const m2b = /^§MISSION_LOAD tasks=2 refused=1 /.test(bl) && /task=wt24-task-2 why=guid/.test(br);
  await page.evaluate(r => APP.loadMission(r), REAL); await sleep(500);   // back to the real mission for the rest
  check('M2', /^§MISSION_LOAD tasks=3 refused=0 model_match=true/.test(loadLine || '') && m2b, 'valid file: ' + loadLine + ' | guid removed from wt24-task-2: ' + bl + ' | ' + br);
  // M3
  const st1 = await page.evaluate(() => APP.missionState()), t1 = T[0];
  const p3 = await pathMatches(page, t1);
  check('M3', st1 && st1.step === 1 && st1.task === t1.id && p3.ok, 'step=' + (st1 && st1.step) + ' of ' + (st1 && st1.of) + ' task=' + (st1 && st1.task) + ' ; ' + p3.detail + ' ; first point (three) ' + JSON.stringify(p3.exp[0].map(v => +v.toFixed(3))));
  const stripBox = await page.evaluate(() => { const r = document.getElementById('mission-strip').getBoundingClientRect(), b = Array.from(document.querySelectorAll('#mission-strip button')).map(x => Math.round(x.getBoundingClientRect().height));
    return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, minBtn: Math.min.apply(null, b), n: b.length }; });
  S('§W-TASK-MISSION STRIP text="' + await stripText(page) + '" rect=' + stripBox.l + ',' + stripBox.t + '..' + stripBox.r + ',' + stripBox.b + ' viewport=' + stripBox.vw + 'x' + stripBox.vh + ' buttons=' + stripBox.n + ' min_button_h=' + stripBox.minBtn);

  // M4 — one card, only for the current task, only on its storey
  const el1 = T[0], el3 = T[2], otherStorey = fx.levels.map(l => l[0]).find(s => s !== el1.storey);
  let s0 = await sheets(page);
  await walkSample(page, el3.x, el3.y, el3.storey); await sleep(400); const sLater = await sheets(page);
  await walkSample(page, el1.x, el1.y, otherStorey); await sleep(400); const sUp = await sheets(page);
  await click(page, 'mission-here'); const sMan = await sheets(page); await page.evaluate(() => APP.missionSheetClosed()); await sheets(page);
  await click(page, 'mission-scan'); await sheets(page);
  await page.evaluate(() => { document.getElementById('mission-scan-code').value = 'not-the-code'; }); await click(page, 'mission-scan-check'); const sBadQr = await sheets(page);
  await page.evaluate(id => { document.getElementById('mission-scan-code').value = id; }, el1.id); await click(page, 'mission-scan-check'); const sQr = await sheets(page);
  await page.evaluate(() => APP.missionSheetClosed()); await sheets(page);
  const arrLines0 = cons.filter(t => /^§TASK_ARRIVE task=wt24-task-1 guid=.* by=distance/.test(t)).length;
  await walkSample(page, 9999, 9999, el1.storey); await sleep(300);   // out of the radius: re-arms the element
  const sBefore = await sheets(page);
  await walkSample(page, el1.x, el1.y, el1.storey); await sleep(400); const sDist = await sheets(page);
  const arrLines1 = cons.filter(t => /^§TASK_ARRIVE task=wt24-task-1 guid=.* by=distance/.test(t)).length;
  const cardText = await page.evaluate(() => document.getElementById('mission-sheet').innerText);
  check('M4', s0.open === 0 && sLater.open === 0 && sUp.open === 0 && sMan.open === 1 && sMan.ids[0] === 'mission-sheet' && sBadQr.open === 1 && sBadQr.view === 'scan' && sQr.open === 1 && sQr.view === 'card'
    && sBefore.open === 0 && sDist.open === 1 && sDist.view === 'card' && sDist.shown && arrLines1 - arrLines0 === 1 && /Check door 1/.test(cardText),
    'sheets before=' + s0.open + ' | sample at a LATER task\'s element=' + sLater.open + ' | same x,y on storey "' + otherStorey + '" (the element is on "' + el1.storey + '")=' + sUp.open + ' | "I\'m here"=' + sMan.open +
    ' | wrong code stays on scan=' + sBadQr.view + ' | the task\'s code=' + sQr.view + ' | distance sample at the element: sheets ' + sBefore.open + ' -> ' + sDist.open + ' (view=' + sDist.view + ', ' + (arrLines1 - arrLines0) + ' §TASK_ARRIVE by=distance)');

  // M5 — built-in form, one photo, Done
  await click(page, 'mission-open-form'); await sheets(page);
  const f5 = await page.evaluate(() => ({ view: document.getElementById('mission-sheet').getAttribute('data-view'), fields: Array.from(document.querySelectorAll('#mission-form [data-field]')).map(e => e.getAttribute('data-field') + ':' + e.getAttribute('data-component')) }));
  await page.evaluate(() => { const t = document.getElementById('tf-result'); t.value = 'grout cracked at jamb'; });
  const photoOk = await photo(page, cons, 'tf-photos-take'); await sheets(page);
  await click(page, 'mission-done'); for (let i = 0; i < 50 && !cons.some(t => /^§TASK_REPORT task=wt24-task-1 /.test(t)); i++) await sleep(200); await sleep(400);
  const ob1 = await outbox(page), rep1 = ob1.length ? reportOf(ob1[ob1.length - 1]) : null;
  const jpg = ob1.length ? ob1[ob1.length - 1].files.filter(f => /\.jpg$/.test(f.name)) : [];
  const exp1 = { v: 1, mission: REAL.mission.id, task: 'wt24-task-1', type: 'wt24-type-a', guid: T[0].guid, outcome: 'done', reason: '', model_version: MODEL_V, by: 'distance' };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const m5body = rep1 && Object.keys(exp1).every(k => eq(rep1[k], exp1[k])) && eq(Object.keys(rep1.answers).sort(), ['photos', 'result']) && rep1.answers.result === 'grout cracked at jamb' && eq(rep1.answers.photos, rep1.photos);
  check('M5', f5.view === 'form' && eq(f5.fields, ['result:TEXT', 'photos:MULTI_PHOTO']) && photoOk && ob1.length === 1 && m5body && rep1.photos.length === 1 && jpg.length === 1 && jpg[0].head[0] === 0xFF && jpg[0].head[1] === 0xD8 && eq(rep1.photos[0], jpg[0].name.replace(/^mission_.*?REQ-W24-1_/, '')) && /^\d{4}-\d\d-\d\dT/.test(rep1.at),
    'builtin form fields=' + f5.fields.join(',') + ' ; outbox items=' + ob1.length + ' ; report=' + JSON.stringify(rep1) + ' ; photo file ' + (jpg[0] ? jpg[0].name + ' ' + jpg[0].size + ' bytes, JPEG magic ' + jpg[0].head.map(x => x.toString(16)).join('') : 'none') + ' (camera sensor = canvas stream)');

  // M7 (first half) — step 2 of 3 and its path
  const st2 = await page.evaluate(() => APP.missionState()), p7 = await pathMatches(page, T[1]);
  const ok7a = st2 && st2.step === 2 && st2.of === 3 && st2.task === 'wt24-task-2' && p7.ok && (await stripText(page)).indexOf('task 2 of 3') === 0, d7a = 'after M5: step=' + (st2 && st2.step) + ' of ' + (st2 && st2.of) + ' strip="' + await stripText(page) + '" ; ' + p7.detail;
  // ... a reload keeps step 2
  await page.reload({ waitUntil: 'domcontentloaded' }); let ready2 = false;
  for (let i = 0; i < 150 && !ready2; i++) { await sleep(1000); ready2 = await page.evaluate(() => !!(window.APP && APP.missionState && APP.missionState())).catch(() => false); }
  await sleep(800);
  const st2b = await page.evaluate(() => APP.missionState && APP.missionState()), p7b = ready2 ? await pathMatches(page, T[1]) : { ok: false, detail: 'mission not back after the reload' };
  const loadAgain = cons.filter(t => /^§MISSION_LOAD /.test(t)).pop();
  S('§W-TASK-MISSION RELOAD state=' + JSON.stringify(st2b) + ' load="' + loadAgain + '" ; ' + p7b.detail);
  const ok7b = st2b && st2b.step === 2 && st2b.of === 3 && p7b.ok && /restored=1/.test(loadAgain || '');
  check('M7', ok7a && ok7b, d7a + ' | after a reload: step=' + (st2b && st2b.step) + ' of ' + (st2b && st2b.of) + ' ' + loadAgain + ' ; ' + p7b.detail);

  // M6 — five-component form on step 2
  await click(page, 'mission-here'); await sheets(page); await click(page, 'mission-open-form'); await sheets(page);
  const f6 = await page.evaluate(() => Array.from(document.querySelectorAll('#mission-form [data-field]')).map(e => e.getAttribute('data-field') + ':' + e.getAttribute('data-component') + (e.getAttribute('data-unsupported') ? ':UNSUPPORTED' : '')));
  const formLine = cons.filter(t => /^§TASK_FORM type=wt24-type-b /.test(t)).pop() || '';
  const obBefore = (await outbox(page)).length;
  await click(page, 'mission-done'); await sleep(500);
  const obRefused = (await outbox(page)).length, refuseLine = cons.filter(t => /^§TASK_FORM_REFUSED /.test(t)).pop() || '', msg = await page.evaluate(() => document.getElementById('mission-form-msg').textContent);
  const stillOpen = await page.evaluate(() => APP.missionState().step);
  await page.evaluate(() => { document.getElementById('tf-f_text').value = 'torque ok'; const c = document.getElementById('tf-f_safe'); c.checked = true; document.getElementById('tf-f_qr').value = 'BOX-17'; });
  const ph6 = await photo(page, cons, 'tf-f_photo-take'); await sheets(page);
  await page.evaluate(() => { const c = document.getElementById('tf-f_sig'), r = c.getBoundingClientRect(); c.scrollIntoView(); const rr = c.getBoundingClientRect();
    const ev = (n, x, y) => c.dispatchEvent(new PointerEvent(n, { clientX: rr.left + x, clientY: rr.top + y, bubbles: true })); ev('pointerdown', 10, 20); ev('pointermove', 60, 60); ev('pointermove', 120, 25); ev('pointerup', 120, 25); });
  await click(page, 'mission-done'); for (let i = 0; i < 50 && !cons.some(t => /^§TASK_REPORT task=wt24-task-2 /.test(t)); i++) await sleep(200); await sleep(400);
  const ob2 = await outbox(page), rep2 = ob2.length ? reportOf(ob2.find(i => { const r = reportOf(i); return r && r.task === 'wt24-task-2'; }) || ob2[ob2.length - 1]) : null;
  const a2 = rep2 && rep2.answers || {};
  const ids6 = ['f_text', 'f_safe', 'f_photo', 'f_sig', 'f_qr'];
  const unsup = await page.evaluate(() => { const pl = window.TaskForm.plan({ form: { window: { tabs: [{ fields: [{ fieldId: 'g1', name: 'Pin', component: 'GEO_PIN', sequence: 1, validation: { required: true } }, { fieldId: 'g2', name: 'N', component: 'TEXT', sequence: 2 }] }] } } });
    const host = document.createElement('div'); document.body.appendChild(host); const f = window.TaskForm.mount(host, pl, {}); const row = host.querySelector('[data-unsupported]'); const chk = f.check(); const r = { plan: [pl.fields_n, pl.rendered, pl.unsupported], row: row ? row.textContent : null, ok: chk.ok }; host.remove(); return r; });
  check('M6', eq(f6.map(s => s.split(':')[0]), ids6) && /fields=5 rendered=5 unsupported=0 builtin=false/.test(formLine) && obRefused === obBefore && /missing=f_text,f_safe$/.test(refuseLine) && /Required: f_text, f_safe/.test(msg) && stillOpen === 2
    && ph6 && ob2.length === obBefore + 1 && rep2 && eq(Object.keys(a2).sort(), ids6.slice().sort()) && a2.f_text === 'torque ok' && a2.f_safe === true && eq(a2.f_photo, rep2.photos) && rep2.photos.length === 1
    && /^data:image\/png;base64,/.test(a2.f_sig) && a2.f_qr === 'BOX-17' && rep2.outcome === 'done' && rep2.task === 'wt24-task-2' && rep2.guid === T[1].guid && rep2.by === 'manual'
    && eq(unsup.plan, [2, 1, 1]) && /not supported on this phone \(GEO_PIN\)/.test(unsup.row || '') && unsup.ok === true,
    'fields=' + f6.join(',') + ' | ' + formLine + ' | Done with everything empty: outbox ' + obBefore + ' -> ' + obRefused + ', ' + refuseLine + ', message="' + msg + '" | after filling: outbox ' + ob2.length + ', answers=' + JSON.stringify(Object.assign({}, a2, { f_sig: String(a2.f_sig || '').slice(0, 22) + '...(' + String(a2.f_sig || '').length + ' chars)' })) +
    ' | unsupported component: plan [fields,rendered,unsupported]=' + JSON.stringify(unsup.plan) + ' row="' + unsup.row + '" and it does not block Done=' + unsup.ok);

  // M8 — Can't proceed on step 3
  const st3 = await page.evaluate(() => APP.missionState());
  await click(page, 'mission-cant'); await sheets(page);
  const obC0 = (await outbox(page)).length; await click(page, 'mission-cant-send'); await sleep(400); const noReason = (await outbox(page)).length, nrMsg = await page.evaluate(() => document.getElementById('mission-cant-msg').textContent);
  await page.evaluate(() => { document.getElementById('mission-reason').value = 'door is locked'; }); await click(page, 'mission-cant-send');
  for (let i = 0; i < 50 && !cons.some(t => /^§MISSION_COMPLETE /.test(t)); i++) await sleep(200); await sleep(300);
  const ob3 = await outbox(page), rep3 = ob3.map(reportOf).find(r => r && r.task === 'wt24-task-3'), done = cons.filter(t => /^§MISSION_COMPLETE /.test(t)).pop() || '';
  check('M8', st3 && st3.step === 3 && noReason === obC0 && /reason/i.test(nrMsg) && ob3.length === obC0 + 1 && rep3 && rep3.outcome === 'cannot' && rep3.reason === 'door is locked' && rep3.model_version === MODEL_V && rep3.guid === T[2].guid && rep3.by === null
    && /done=2 cannot=1 of=3/.test(done) && (await stripText(page)) === 'Mission complete — 2 done, 1 can\'t proceed',
    'step before=' + (st3 && st3.step) + ' ; empty reason: outbox ' + obC0 + ' -> ' + noReason + ' ("' + nrMsg + '") ; with reason: outbox ' + ob3.length + ' report=' + JSON.stringify(rep3) + ' ; ' + done + ' ; strip="' + await stripText(page) + '"');
  await ctx.close();

  // M9 — another origin
  S('\n── #mission= from another origin ──');
  const hits0 = other.hits(); const P9 = await openPhone(browser, base, hash(otherBase + '/mission/m.json'));
  const ref = await waitLine(P9.cons, /^§MISSION_REFUSED /, 30000); await sleep(1500);
  const st9 = await P9.page.evaluate(() => APP.missionState ? APP.missionState() : 'no-module'), loaded9 = P9.cons.some(t => /^§MISSION_LOAD /.test(t));
  const strip9 = await P9.page.evaluate(() => { const s = document.getElementById('mission-strip'); return !!(s && s.offsetWidth); });
  check('M9', !!ref && ref.indexOf('origin=' + otherBase) >= 0 && !loaded9 && !st9 && !strip9 && other.hits() === hits0, String(ref) + ' ; §MISSION_LOAD lines=' + (loaded9 ? 'some' : 0) + ' ; mission state=' + JSON.stringify(st9) + ' ; strip shown=' + strip9 + ' ; requests that reached the other server=' + (other.hits() - hits0));
  await P9.ctx.close();

  // M10 — the room path is identical (desktop profile, the real Find panel)
  S('\n── the room path, before and after the drawer moved ──');
  const base10 = fs.existsSync(RP.FIX) ? JSON.parse(fs.readFileSync(RP.FIX, 'utf8')) : null;
  const cap = await RP.capture(browser, base);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let m10 = !!(base10 && cap.ok);
  const parts = [];
  if (m10) {
    const q = same(cap.pair, base10.pair), c = cap.mesh_count === base10.mesh_count, ob = same(cap.objs, base10.objs), cl = same(cap.console, base10.console), ac = cap.after_close === 0;
    m10 = q && c && ob && cl && ac && cap.foreign === 0 && cap.mesh_count > 0 && cap.lines === 1 && cap.loaded.drawFn === 'function';
    parts.push('pair equal=' + q, 'mesh_count ' + cap.mesh_count + ' vs ' + base10.mesh_count, 'line vertices+marker positions+opacity+renderOrder (' + cap.objs.length + ' objects, ' + cap.objs.filter(o => o.vertices).reduce((n, o) => n + o.vertices.length, 0) + ' vertex numbers) equal=' + ob, '§ROOM_PATH/§DOT_DROP lines equal=' + cl, 'orange objects not owned by route_line.js=' + cap.foreign, 'orange meshes after closing Find=' + cap.after_close, 'APP.drawRoutePoints=' + cap.loaded.drawFn);
  }
  check('M10', m10, (base10 ? 'baseline recorded on origin/main ' + String(base10.base_commit).slice(0, 8) + ' ; ' : 'NO BASELINE FILE ; ') + (cap.ok ? parts.join(' ; ') : 'capture failed: ' + cap.why));

  // ── WO-31: the standard task form (S1-S4) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  S('\n── the standard task form: Outcome / What I found / Material used / Photos / Checklist ──');
  const RES = [{ id: 'wt31-res-1', name: 'Solved' }, { id: 'wt31-res-2', name: 'Delayed' }, { id: 'wt31-res-3', name: 'Dropped' }];
  const MATS = [{ id: 'wt31-mat-1', name: 'Grout', uom: 'kg' }, { id: 'wt31-mat-2', name: 'Sealant', uom: 'tube' }];
  const CL1 = ['Isolate the door closer', 'Check hinge screws', 'Test the latch', 'Remove the tape'], CL2 = ['Photograph the frame', 'Check the seal', 'Lock and unlock twice'];
  const mk31 = (i, id, cl) => Object.assign(mk(i, 'wt31-type-a', i === 0 ? entrance : picks[i - 1]), { id, documentno: 'REQ-W31-' + (i + 1), summary: 'Task ' + id }, cl ? { checklist: cl } : {});
  const M31 = { v: 1, mission: { id: 'wt31-mission-1', name: 'Standard form mission', project: 'wt31-project', model: { db: 'Duplex_extracted.db', version: MODEL_V }, materials: MATS },
    types: { 'wt31-type-a': { name: 'Door check', radius_m: 3, form: null, resolutions: RES } }, tasks: [mk31(0, 'wt31-task-1', CL1), mk31(1, 'wt31-task-2', CL2)] };
  const M31B = { v: 1, mission: { id: 'wt31-mission-2', name: 'Plain mission', project: 'wt31-project', model: { db: 'Duplex_extracted.db', version: MODEL_V }, materials: [] },
    types: { 'wt31-type-b': { name: 'Plain check', radius_m: 3, form: null } }, tasks: [Object.assign(mk(0, 'wt31-type-b', entrance), { id: 'wt31-task-3', documentno: 'REQ-W31-3', summary: 'Task wt31-task-3' })] };
  async function newMissionPage(obj) {
    const Q = await openPhone(browser, base, ''); if (!Q.ready) return Q;
    await Q.page.evaluate(async o => { await APP.lazy('tasks'); await APP.loadMission(o); }, obj); await waitLine(Q.cons, /^§MISSION_STEP /, 30000); return Q;
  }
  const openForm = async pg => { await click(pg, 'mission-here'); await sheets(pg); await click(pg, 'mission-open-form'); await sheets(pg); };
  const readForm = pg => pg.evaluate(() => ({
    fields: Array.from(document.querySelectorAll('#mission-form [data-field]')).map(e => e.getAttribute('data-field') + ':' + e.getAttribute('data-component')),
    resolutions: Array.from(document.querySelectorAll('#tf-resolution option')).filter(o => o.value !== '').map(o => o.value + '=' + o.textContent),
    checklist: Array.from(document.querySelectorAll('#mission-form label[data-check]')).map(l => l.textContent),
    materials: Array.from(document.querySelectorAll('#tf-material-product option')).filter(o => o.value !== '').map(o => o.value + '=' + o.textContent) }));
  const setSel = (pg, id, v) => pg.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  const tick = (pg, idx) => pg.evaluate(i => { document.getElementById('tf-checklist-' + i).click(); }, idx);
  const Q31 = await newMissionPage(M31); const pg31 = Q31.page;
  if (!Q31.ready) { S('§W-TASK-MISSION ABORT the standard-form page never became ready'); process.exit(1); }
  await openForm(pg31);
  const F1 = await readForm(pg31), line1 = Q31.cons.filter(t => /^§TASK_FORM type=wt31-type-a /.test(t)).pop() || '';
  const wantRes = RES.map(r => r.id + '=' + r.name), wantMat = MATS.map(m => m.id + '=' + m.name + ' (' + m.uom + ')');
  const s1a = eq(F1.fields, ['resolution:RESOLUTION', 'result:TEXT', 'material:MATERIAL', 'photos:MULTI_PHOTO', 'checklist:CHECKLIST']) && eq(F1.resolutions, wantRes) && eq(F1.checklist, CL1) && eq(F1.materials, wantMat)
    && /fields=5 rendered=5 unsupported=0 builtin=true resolutions=3 checklist=4 materials=2$/.test(line1);
  // S2 — Done without an outcome is refused; with an outcome, a product without a quantity is refused too
  const obS0 = (await outbox(pg31)).length;
  await click(pg31, 'mission-done'); await sleep(500);
  const obS1 = (await outbox(pg31)).length, refS2 = Q31.cons.filter(t => /^§TASK_FORM_REFUSED /.test(t)).pop() || '', msgS2 = await pg31.evaluate(() => document.getElementById('mission-form-msg').textContent);
  await setSel(pg31, 'tf-resolution', 'wt31-res-2'); await setSel(pg31, 'tf-material-product', 'wt31-mat-2');
  await click(pg31, 'mission-done'); await sleep(500);
  const obS2 = (await outbox(pg31)).length, refS2b = Q31.cons.filter(t => /^§TASK_FORM_REFUSED /.test(t)).pop() || '';
  const s2 = obS1 === obS0 && /missing=resolution$/.test(refS2) && /Required: resolution/.test(msgS2) && obS2 === obS0 && /missing=material$/.test(refS2b);
  // S3 — fill everything, Done, read the report
  await pg31.evaluate(() => { document.getElementById('tf-result').value = 'hinge loose, retightened'; document.getElementById('tf-material-qty').value = '1.5'; });
  await tick(pg31, 0); await tick(pg31, 2);
  await click(pg31, 'mission-done'); for (let i = 0; i < 50 && !Q31.cons.some(t => /^§TASK_REPORT task=wt31-task-1 /.test(t)); i++) await sleep(200); await sleep(400);
  const obS3 = await outbox(pg31), repS3 = obS3.map(reportOf).find(r => r && r.task === 'wt31-task-1') || null;
  const wantTicks = [{ text: CL1[0], done: true }, { text: CL1[1], done: false }, { text: CL1[2], done: true }, { text: CL1[3], done: false }];
  const isoOk = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/.test(x);
  const s3 = !!repS3 && obS3.length === obS0 + 1 && repS3.outcome === 'done' && repS3.resolution === 'wt31-res-2' && eq(repS3.checklist, wantTicks) && isoOk(repS3.start) && isoOk(repS3.end) && Date.parse(repS3.start) < Date.parse(repS3.end)
    && eq(repS3.spent, { product: 'wt31-mat-2', qty: 1.5 }) && eq(Object.keys(repS3.answers).sort(), ['photos', 'result']) && repS3.answers.result === 'hinge loose, retightened';
  // S1 (second half): the next task of the same type shows ITS OWN checklist
  const st31 = await pg31.evaluate(() => APP.missionState());
  await openForm(pg31); const F1b = await readForm(pg31), line1b = Q31.cons.filter(t => /^§TASK_FORM type=wt31-type-a /.test(t)).pop() || '';
  const s1b = !!st31 && st31.step === 2 && eq(F1b.checklist, CL2) && eq(F1b.resolutions, wantRes) && eq(F1b.materials, wantMat) && /resolutions=3 checklist=3 materials=2$/.test(line1b);
  check('S1', s1a && s1b, 'task 1: ' + line1 + ' · fields=' + F1.fields.join(',') + ' · outcome options=' + JSON.stringify(F1.resolutions) + ' · checklist=' + JSON.stringify(F1.checklist) + ' · materials=' + JSON.stringify(F1.materials) +
    ' || task 2 (same type, its own list): ' + line1b + ' · checklist=' + JSON.stringify(F1b.checklist));
  check('S2', s2, 'Done with nothing picked: outbox ' + obS0 + ' -> ' + obS1 + ', ' + refS2 + ', message="' + msgS2 + '" · outcome picked + product without a quantity: outbox -> ' + obS2 + ', ' + refS2b);
  check('S3', s3, 'report ' + JSON.stringify(repS3 && { outcome: repS3.outcome, resolution: repS3.resolution, checklist: repS3.checklist, start: repS3.start, end: repS3.end, spent: repS3.spent, answers: repS3.answers }) + ' · expected ticks ' + JSON.stringify(wantTicks) +
    ' · ' + (Q31.cons.filter(t => /^§TASK_REPORT task=wt31-task-1 /.test(t)).pop() || ''));
  // S4 — a mission with none of the three lists
  await pg31.evaluate(async o => { await APP.loadMission(o); }, M31B); await waitLine(Q31.cons, /^§MISSION_STEP .* task=wt31-task-3 /, 20000);
  await openForm(pg31); const F4 = await readForm(pg31), line4 = Q31.cons.filter(t => /^§TASK_FORM type=wt31-type-b /.test(t)).pop() || '';
  const extraDom = await pg31.evaluate(() => ({ sel: document.querySelectorAll('#mission-form select').length, check: document.querySelectorAll('#mission-form label[data-check]').length }));
  await pg31.evaluate(() => { document.getElementById('tf-result').value = 'all fine'; }); const obP0 = (await outbox(pg31)).length;
  await click(pg31, 'mission-done'); for (let i = 0; i < 50 && !Q31.cons.some(t => /^§TASK_REPORT task=wt31-task-3 /.test(t)); i++) await sleep(200); await sleep(400);
  const obP = await outbox(pg31), repS4 = obP.map(reportOf).find(r => r && r.task === 'wt31-task-3') || null;
  check('S4', eq(F4.fields, ['result:TEXT', 'photos:MULTI_PHOTO']) && extraDom.sel === 0 && extraDom.check === 0 && /fields=2 rendered=2 unsupported=0 builtin=true resolutions=0 checklist=0 materials=0$/.test(line4)
    && obP.length === obP0 + 1 && !!repS4 && repS4.outcome === 'done' && repS4.resolution === null && eq(repS4.checklist, []) && repS4.spent === null && eq(repS4.answers, { result: 'all fine', photos: [] }) && isoOk(repS4.start) && isoOk(repS4.end),
    'fields=' + F4.fields.join(',') + ' selects=' + extraDom.sel + ' checklist rows=' + extraDom.check + ' · ' + line4 + ' · report ' + JSON.stringify(repS4 && { outcome: repS4.outcome, resolution: repS4.resolution, checklist: repS4.checklist, spent: repS4.spent, answers: repS4.answers }));
  await Q31.ctx.close();

  // ── WO-34: the arrival distance reaches the card through the real Walk ───────────────────────────────────────────────────────────────────────────────────────
  S('\n── WO-34: arrival by distance in a real Walk (W1-W5) ──');
  const RAD = 2.5, EL = picks[0], ELS = EL[1], OTHER = fx.levels.map(l => l[0]).find(s => s !== ELS);
  const mkW = (radius, tag) => ({ v: 1, mission: { id: 'wt34-mission-' + tag, name: 'Arrival distance ' + tag, project: 'wt34-project', model: { db: 'Duplex_extracted.db', version: MODEL_V }, materials: [] },
    types: { 'wt34-type': { name: 'Arrival check', radius_m: radius, form: null } },
    tasks: [Object.assign(mk(0, 'wt34-type', entrance), { id: 'wt34-task-1', documentno: 'REQ-W34-1', summary: 'Task wt34-1' }), Object.assign(mk(1, 'wt34-type', picks[0]), { id: 'wt34-task-2', documentno: 'REQ-W34-2', summary: 'Task wt34-2' })] });
  const W_R = mkW(RAD, 'r'), W_N = mkW(null, 'null');
  async function walkPage() {   // a phone page, Walk ENTERED for real (walk.js:25-70), then the mission loaded
    const Q = await openPhone(browser, base, ''); if (!Q.ready) return Q;
    Q.walk = await Q.page.evaluate(async () => { APP.toggleWalkMode(); await new Promise(r => setTimeout(r, 400)); APP.setWalkAnchor(); await new Promise(r => setTimeout(r, 800)); return APP.walkModeActive === true; });
    return Q;
  }
  const loadW = async (Q, f) => { const n = Q.cons.length; await Q.page.evaluate(async o => { await APP.lazy('tasks'); await APP.loadMission(o); }, f); for (let i = 0; i < 150 && !Q.cons.slice(n).some(t => /^§MISSION_STEP /.test(t)); i++) await sleep(200); await Q.page.evaluate(() => APP.cacheStoreyLevels()); };
  // the walker at plan offset dx from the element on a storey, then the walker's position READ BACK from the camera (three2ifc of the feet) and its plan distance to the element computed here
  async function moveW(Q, dx, storey) {
    const n = Q.cons.length; await walkSample(Q.page, EL[2] + dx, EL[3], storey); await sleep(450);
    const w = await Q.page.evaluate(() => { const p = APP.camera.position, q = APP.three2ifc(p.x, p.y - APP.WALK_EYE_HEIGHT, p.z); return { x: q.ix, y: q.iy }; });
    return { n, d: Math.hypot(w.x - EL[2], w.y - EL[3]), lines: Q.cons.slice(n).filter(t => /^§TASK_ARRIVE task=wt34-task-1 .* by=distance /.test(t)), sheets: await sheets(Q.page) };
  }
  const spyOn = Q => Q.page.evaluate(() => { APP._w34calls = 0; const f = APP.onTaskArrive; if (typeof f === 'function' && !f._w34) { const g = function (s) { APP._w34calls++; return f.apply(this, arguments); }; g._w34 = true; APP.onTaskArrive = g; } return typeof APP.onTaskArrive; });
  const cardCount = (Q, from) => Q.cons.slice(from).filter(t => /^§MISSION_ARRIVE task=wt34-task-1 by=distance/.test(t)).length;
  // the W2 probe, used by the real run and by the red control
  async function probeW2(Q) {
    const nFn = await spyOn(Q), m = await moveW(Q, 2.4, ELS), calls = await Q.page.evaluate(() => APP._w34calls);
    const dm = m.lines.length ? Number((/ d_m=([0-9.]+) /.exec(m.lines[0]) || [])[1]) : NaN;
    return { m, calls, dm, ok: m.sheets.open === 1 && m.sheets.view === 'card' && m.lines.length === 1 && dm <= RAD && Math.abs(dm - m.d) <= 0.01 && calls === 1, fn: nFn };
  }
  const QW = await walkPage();
  if (!QW.ready || QW.walk !== true) { S('§W-TASK-MISSION ABORT the WO-34 walk page (ready=' + QW.ready + ' walk=' + QW.walk + ')'); process.exit(1); }
  const fnBefore = await QW.page.evaluate(() => typeof APP.onTaskArrive);
  await loadW(QW, W_R);
  const stripBtns = await QW.page.evaluate(() => ['mission-here', 'mission-scan'].map(id => { const b = document.getElementById(id); return b ? b.textContent + '@' + (b.offsetWidth > 0) : 'missing'; }));
  // W1 — outside the radius: no card
  const w1a = await moveW(QW, RAD + 0.1, ELS), w1b = await moveW(QW, 4.0, ELS);
  check('W1', w1a.sheets.open === 0 && w1b.sheets.open === 0 && w1a.lines.length === 0 && w1b.lines.length === 0 && w1a.d > RAD && w1b.d > RAD,
    'radius_m=' + RAD + ' · walker at plan distance ' + w1a.d.toFixed(3) + ' m and ' + w1b.d.toFixed(3) + ' m from task wt34-task-1\'s element on its storey ' + ELS + ': sheets ' + w1a.sheets.open + '/' + w1b.sheets.open + ', §TASK_ARRIVE by=distance lines ' + w1a.lines.length + '/' + w1b.lines.length);
  // W2 — inside: exactly one card
  const w2 = await probeW2(QW), w2b = await moveW(QW, 2.0, ELS);
  const arrN = cardCount(QW, w2.m.n);
  check('W2', w2.ok && w2b.sheets.open === 1 && w2b.lines.length === 0 && arrN === 1 && stripBtns.join('|') === 'I\'m here@true|Scan QR@true' && fnBefore === 'undefined' && w2.fn === 'function',
    'walker at plan distance ' + w2.m.d.toFixed(3) + ' m: sheets ' + w2.m.sheets.open + ' (view ' + w2.m.sheets.view + ') · ' + (w2.m.lines[0] || 'no §TASK_ARRIVE line') + ' · log d_m=' + w2.dm + ' vs computed ' + w2.m.d.toFixed(4) + ' (diff ' + (Math.abs(w2.dm - w2.m.d)).toFixed(4) + ') · A.onTaskArrive calls=' + w2.calls + ' (APP.onTaskArrive before a mission: ' + fnBefore + ') · §MISSION_ARRIVE by=distance lines=' + arrN +
    ' · a second sample at ' + w2b.d.toFixed(3) + ' m inside the radius: sheets ' + w2b.sheets.open + ', new arrive lines ' + w2b.lines.length + ' · strip buttons ' + stripBtns.join(', '));
  // W3 — one storey up, same x,y
  await QW.page.evaluate(() => APP.missionSheetClosed()); await sheets(QW.page);
  const w3 = await moveW(QW, 0, OTHER), w3b = await moveW(QW, 0.5, ELS);
  check('W3', !!OTHER && w3.sheets.open === 0 && w3.lines.length === 0 && w3b.sheets.open === 1 && w3b.lines.length === 1,
    'same x,y on storey "' + OTHER + '" (the element is on "' + ELS + '"): sheets ' + w3.sheets.open + ', arrive lines ' + w3.lines.length + ' · back on "' + ELS + '" at ' + w3b.d.toFixed(3) + ' m: sheets ' + w3b.sheets.open + ', arrive lines ' + w3b.lines.length + ' (the storey was the reason)');
  // W4 — radius_m null: no card by distance, "I'm here" still opens it
  await loadW(QW, W_N); await QW.page.evaluate(() => APP.missionSheetClosed());
  const w4s = await sheets(QW.page), w4a = await moveW(QW, 2.4, ELS), w4b = await moveW(QW, 0, ELS);
  await click(QW.page, 'mission-here'); const w4h = await sheets(QW.page);
  check('W4', w4s.open === 0 && w4a.sheets.open === 0 && w4b.sheets.open === 0 && w4a.lines.length === 0 && w4b.lines.length === 0 && w4h.open === 1 && w4h.view === 'card',
    'radius_m null: sample at ' + w4a.d.toFixed(3) + ' m and at ' + w4b.d.toFixed(3) + ' m: sheets ' + w4a.sheets.open + '/' + w4b.sheets.open + ', arrive-by-distance lines ' + w4a.lines.length + '/' + w4b.lines.length + ' · after "I\'m here": sheets ' + w4h.open + ' view ' + w4h.view);
  // W5 — the setter is gone; the explicit call is there
  const sh = require('child_process'); let grepHits = '';
  try { grepHits = sh.execSync("grep -rnE \"defineProperty[^;]*_taskArrivalShow|_taskArrivalShow\" viewer erp --include=*.js --include=*.html --exclude-dir=tests --exclude-dir=node_modules || true", { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { grepHits = 'GREP-ERROR ' + e.message; }
  const own = await QW.page.evaluate(() => ({ desc: !!Object.getOwnPropertyDescriptor(APP, '_taskArrivalShow'), fn: typeof APP.onTaskArrive }));
  const walkSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'walk.js'), 'utf8');
  check('W5', grepHits === '' && !own.desc && own.fn === 'function' && /A\.onTaskArrive\(r\.show\)/.test(walkSrc) && w2.calls === 1,
    'grep for _taskArrivalShow in viewer/ and erp/ (tests excluded): ' + (grepHits === '' ? 'no hit' : grepHits.slice(0, 200)) + ' · own property on APP=' + own.desc + ' · typeof APP.onTaskArrive after a mission=' + own.fn + ' · walk.js calls A.onTaskArrive(r.show)=' + /A\.onTaskArrive\(r\.show\)/.test(walkSrc) + ' · calls seen in W2=' + w2.calls);
  await QW.ctx.close();

  // ── red controls ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  S('\n── red controls (each must make its check FAIL) ──');
  let red = 0;
  async function freshMission(hashUrl) { const Q = await openPhone(browser, base, hash(hashUrl)); await waitLine(Q.cons, /^§MISSION_STEP /, 30000); return Q; }
  // R1: a task that is NOT the current one must not open a card
  MUT = { file: 'task_mission.js', from: "A._tasks = [{ id: t.id, radius_m: type.radius_m, qr: t.id, elements: [{ guid: t.guid, storey: t.storey, x: t.x, y: t.y }] }];",
    to: "A._tasks = M.tasks.map(function (k) { return { id: k.id, radius_m: M.types[k.type].radius_m, qr: k.id, elements: [{ guid: k.guid, storey: k.storey, x: k.x, y: k.y }] }; });" };
  { const Q = await freshMission(MURL); await Q.page.evaluate(() => APP.cacheStoreyLevels()); await walkSample(Q.page, el3.x, el3.y, el3.storey); await sleep(500); const s = await sheets(Q.page);
    const failed = s.open !== 0; S('§W-TASK-MISSION R1 current-task-only filter removed: sample at a later task\'s element -> sheets=' + s.open + ' (a correct run has 0) -> M4 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  // R2: validation removed -> a task with no guid is loaded
  MUT = { file: 'task_mission.js', from: 'if (why) { out.refused.push', to: 'if (false) { out.refused.push' };
  { const Q = await freshMission(MURL); const n = Q.cons.length; await Q.page.evaluate(b => APP.loadMission(b), broken); await sleep(600);
    const l = Q.cons.slice(n).find(t => /^§MISSION_LOAD /.test(t)) || ''; const failed = !/refused=1 /.test(l);
    S('§W-TASK-MISSION R2 validation removed: ' + l + ' (a correct run says refused=1) -> M2 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  // R3: required-field check removed -> Done with empty required fields queues a report
  MUT = { file: 'task_form.js', from: 'if (f.required && s && !s.ok()) missing.push(f.fieldId);', to: 'void 0;' };
  { const Q = await freshMission(MURL); const pg = Q.page; await pg.evaluate(() => APP.cacheStoreyLevels());
    await click(pg, 'mission-here'); await click(pg, 'mission-open-form'); await sheets(pg);   // step 1 is the built-in form: finish it so step 2 (the five-component form) is current
    await click(pg, 'mission-done'); for (let i = 0; i < 40 && !(await pg.evaluate(() => APP.missionState().step === 2)); i++) await sleep(250);
    await click(pg, 'mission-here'); await click(pg, 'mission-open-form'); await sheets(pg); const b = (await outbox(pg)).length; await click(pg, 'mission-done'); await sleep(900); const a = (await outbox(pg)).length;
    const failed = a !== b; S('§W-TASK-MISSION R3 required-field check removed: Done with every field empty, outbox ' + b + ' -> ' + a + ' (a correct run keeps ' + b + ') -> M6 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  // R4: the outcome requirement removed -> Done without an outcome queues a report (S2 must fail)
  MUT = { file: 'task_form.js', from: "if (f.component === 'RESOLUTION' && s && !s.ok() && missing.indexOf(f.fieldId) < 0) missing.push(f.fieldId);", to: 'void 0;' };
  { const Q = await newMissionPage(M31); await openForm(Q.page); const b = (await outbox(Q.page)).length; await click(Q.page, 'mission-done'); await sleep(900); const a = (await outbox(Q.page)).length;
    const failed = a !== b; S('§W-TASK-MISSION R4 outcome requirement removed: Done with no outcome picked, outbox ' + b + ' -> ' + a + ' (a correct run keeps ' + b + ') -> S2 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  // R5: the checklist order shuffled in the form -> the report's ticks are not in the task's order (S3 must fail)
  MUT = { file: 'task_form.js', from: 'done: !!boxes[i].checked }; }); };   // R5 marker', to: 'done: !!boxes[i].checked }; }).reverse(); };   // R5 marker' };
  { const Q = await newMissionPage(M31); await openForm(Q.page); await setSel(Q.page, 'tf-resolution', 'wt31-res-1'); await tick(Q.page, 0); await tick(Q.page, 2);
    await click(Q.page, 'mission-done'); for (let i = 0; i < 40 && !Q.cons.some(t => /^§TASK_REPORT task=wt31-task-1 /.test(t)); i++) await sleep(250); await sleep(300);
    const ob = await outbox(Q.page), rp = ob.map(reportOf).find(r => r && r.task === 'wt31-task-1'), got = rp ? rp.checklist : null;
    const failed = !eq(got, wantTicks.map(t => ({ text: t.text, done: t.done })));
    S('§W-TASK-MISSION R5 checklist order shuffled: report ticks ' + JSON.stringify(got && got.map(c => c.text.slice(0, 12) + ':' + c.done)) + ' (a correct run lists ' + CL1.map(x => x.slice(0, 12)).join(' | ') + ' in that order) -> S3 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  // R6 (the order's R2): walk.js no longer calls A.onTaskArrive -> the walker arrives, the card does not open (W2 must fail)
  MUT = { file: 'walk.js', from: "typeof A.onTaskArrive === 'function') A.onTaskArrive(r.show);", to: "typeof A.onTaskArrive === 'function') void 0;" };
  { const Q = await walkPage(); await loadW(Q, W_R); const r = await probeW2(Q); const failed = !r.ok;
    S('§W-TASK-MISSION R6 A.onTaskArrive call removed from walk.js: at ' + r.m.d.toFixed(3) + ' m sheets=' + r.m.sheets.open + ' arrive lines=' + r.m.lines.length + ' onTaskArrive calls=' + r.calls + ' (a correct run has sheets 1, 1 line, 1 call) -> W2 ' + (failed ? 'FAILS as it must' : 'STILL PASSES: control not detected')); if (failed) red++; await Q.ctx.close(); }
  MUT = null;

  await browser.close(); server.close(); other.close();
  const verdict = fails === 0 && red === 6 ? 'PASS' : 'FAIL';
  S('§W-TASK-MISSION checks=' + checks + ' fail=' + fails + ' red=' + red + '/6 verdict=' + verdict + '');
  fs.writeFileSync(path.join(__dirname, 'witness_task_mission.log'), log.join('\n') + '\n');
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error(e); S('§W-TASK-MISSION CRASH ' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_task_mission.log'), log.join('\n') + '\n'); process.exit(1); });
