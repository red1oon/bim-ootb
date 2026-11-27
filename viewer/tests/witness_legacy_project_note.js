// ⚠ DO NOT REMOVE — Scope: W-LEGACY-NOTE (bim-compiler prompts/MOBILE_PERF.md WO-11). READ THE LOG after every run (viewer/tests/witness_legacy_project_note.log).
// Issue it proves or disproves: "after a Project Order push the Kernel's C_Project.Note holds the pushed GUID set but legacy iDempiere's does not" (a twin divergence, CLAUDE.md TWIN CARDINAL RULE).
// Headless node, no browser, no GPU. Drives the REAL viewer/find_erp_push.js _pushToErp (same harness as capex/tests/witness_viewer_push_legacy.js: building db + ERP store = temp seed copy,
// password dialog stubbed) against the LOCAL PILOT, role "BIM Push Test" (1200003) through the BIMOOTB_* types (the pilot carries scripts/bridge/pilot/ws_bimootb_project_note.sql in bim-compiler).
// The legacy value is read back through the Query type (Push.queryRows), never from the push's own log. The pilot is NEVER cleaned: each run creates projects named WLN_<stamp>_*.
// The ONLY write to the legacy database outside the push is R2's toggle of ws_webservicetype.IsActive of BIMOOTB_Update_C_Project (psql), restored in a finally block and checked at the start.
//   N1  push 1 (>= 2 GUIDs): legacy Note == Kernel Note == the pushed set, as a SET (population >= 2, else INCONCLUSIVE)
//   N2  push 2 (a DIFFERENT, disjoint set): both sides hold the union of the two, equal
//   N3  the rest of the push is unchanged: the created counts of push 1 and push 2 equal a baseline run with Note removed from the plan (= the push before this change)
//   R1  red control: Note removed from the plan -> the very N1 check FAILS (legacy holds nothing)
//   R2  red control: the update type deactivated on the pilot -> `§LEGACY_NOTE skipped=` is logged, the push still completes (created counts equal baseline), legacy Note stays empty
//       (legacy caches a service type for 60 minutes, AbstractService.java:212, so the toggle only takes effect after a pilot restart: the witness restarts the pilot (stop.sh/start.sh) after each toggle)
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node viewer/tests/witness_legacy_project_note.js 2>&1 | tee viewer/tests/witness_legacy_project_note.log   (needs the pilot at http://localhost:8088)
// Env: PILOT_BASE, PILOT_PASS, PILOT_ROLE, WLN_DB (building db, default ~/bim-ootb/viewer/buildings/Duplex_extracted.db), WLN_BUILDING, PGHOST/PGUSER/PGPASSWORD/PGDATABASE for the R2 toggle.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.PILOT_BASE || 'http://localhost:8088', PASS = process.env.PILOT_PASS || 'GardenAdmin';
const CTX = { user: 'GardenAdmin', clientId: '11', roleId: process.env.PILOT_ROLE || '1200003', orgId: '11', warehouseId: '103' };
const BLD = process.env.WLN_BUILDING || 'Duplex', DBFILE = process.env.WLN_DB || path.join(os.homedir(), 'bim-ootb', 'viewer', 'buildings', BLD + '_extracted.db');
const STAMP = new Date().toISOString().replace(/\D/g, '').slice(2, 14), P_MAIN = 'WLN_' + STAMP, P_BASE = 'WLN_' + STAMP + '_BASE', P_R2 = 'WLN_' + STAMP + '_R2';
const UTYPE = 'BIMOOTB_Update_C_Project';
const PG = (sql) => cp.execFileSync('psql', ['-h', process.env.PGHOST || 'localhost', '-U', process.env.PGUSER || 'adempiere', '-d', process.env.PGDATABASE || 'idempiere_pilot', '-At', '-c', 'set search_path=adempiere; ' + sql],
  { env: Object.assign({}, process.env, { PGPASSWORD: process.env.PGPASSWORD || 'adempiere' }), encoding: 'utf8', timeout: 20000 }).replace(/^SET\s*/, '').trim();
let fetchCalls = 0; const _realFetch = globalThis.fetch; globalThis.fetch = function () { fetchCalls++; return _realFetch.apply(this, arguments); };   // erp_rest_push.js binds fetch at load: wrap BEFORE the require
const Push = require(path.join(ROOT, 'viewer', 'erp_rest_push.js')), Plan = require(path.join(ROOT, 'viewer', 'erp_push_plan.js'));
const allLogs = [], _l = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); allLogs.push(s); _l(s); };
const out = m => _l(m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHOME = process.env.PILOT_HOME || path.join(os.homedir(), 'idempiere-pilot');
const lc = o => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };
const q = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };
const toSet = s => new Set(String(s == null ? '' : s).split(',').filter(Boolean));
const sameSet = (a, b) => a.size === b.size && Array.from(a).every(x => b.has(x));
let fails = 0, judged = 0, inconclusive = null;
function check(name, ok, detail) { judged++; if (!ok) fails++; out('§W_LEGACY_NOTE_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); return ok; }
const verdictLine = (extra) => { const v = inconclusive ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; return '§W-LEGACY-NOTE checks=3 fail=' + fails + ' red=' + red.detected + '/2 verdict=' + v + (extra || ''); };
const red = { detected: 0 };
const blocked = why => { out('BLOCKED: legacy pilot not reachable (' + why + ')'); out('§W-LEGACY-NOTE checks=3 fail=0 red=0/2 verdict=INCONCLUSIVE'); process.exit(2); };

(async () => {
  // ── pilot reachable? (a refusal here is BLOCKED, never a faked read) ──
  try { const r = await _realFetch(BASE + '/', { signal: AbortSignal.timeout(8000) }); if (r.status >= 500) blocked('GET ' + BASE + '/ -> HTTP ' + r.status); }
  catch (e) { blocked('GET ' + BASE + '/ failed: ' + (e && e.message)); }
  let utype0;
  try { utype0 = PG("select isactive from ws_webservicetype where value='" + UTYPE + "'"); } catch (e) { blocked('psql to the pilot database failed: ' + String(e.message).split('\n')[0]); }
  if (!utype0) { out('§W_LEGACY_NOTE_SETUP the pilot has no ' + UTYPE + ': apply bim-compiler scripts/bridge/pilot/ws_bimootb_project_note.sql, restart the pilot'); out('§W-LEGACY-NOTE checks=3 fail=0 red=0/2 verdict=INCONCLUSIVE'); process.exit(2); }
  if (utype0 !== 'Y') { PG("update ws_webservicetype set isactive='Y' where value='" + UTYPE + "'"); out('§W_LEGACY_NOTE_SETUP ' + UTYPE + ' was inactive at start (a crashed earlier run?): restored to Y'); }
  if (!fs.existsSync(DBFILE)) { out('§W_LEGACY_NOTE_SETUP building db absent: ' + DBFILE); out('§W-LEGACY-NOTE checks=3 fail=0 red=0/2 verdict=INCONCLUSIVE'); process.exit(2); }

  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(DBFILE));
  const guids = q(bdb, 'SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0 ORDER BY m.guid LIMIT 12').map(v => v[0]);
  const setA = new Set(guids.slice(0, 5)), setB = new Set(guids.slice(5, 11));
  out('§W_LEGACY_NOTE_SETS building=' + BLD + ' A=' + setA.size + ' B=' + setB.size + ' disjoint=' + Array.from(setB).every(g => !setA.has(g)));
  if (setA.size < 2 || setB.size < 2) { out('§W_LEGACY_NOTE_VACUOUS fewer than 2 GUIDs with a size in ' + DBFILE); out('§W-LEGACY-NOTE checks=3 fail=0 red=0/2 verdict=INCONCLUSIVE'); process.exit(2); }

  const AREA = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END';
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'rsmeans2024_us.json'), 'utf8')).materials;
  function selectionPriced(set) {
    const g = Array.from(set), agg = {};
    for (let i = 0; i < g.length; i += 900) {
      const ch = g.slice(i, i + 900);
      q(bdb, 'SELECT m.discipline, m.ifc_class, m.storey, COUNT(*), SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)), SUM(' + AREA + '), SUM(t.bbox_x*t.bbox_y*t.bbox_z) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.guid IN (' + ch.map(() => '?').join(',') + ') AND t.bbox_x>0 GROUP BY 1,2,3', ch)
        .forEach(r => { const k = r[0] + '|' + r[1] + '|' + r[2]; const a = agg[k] || (agg[k] = { disc: r[0], cls: r[1], storey: r[2], cnt: 0, len: 0, area: 0, vol: 0 }); a.cnt += r[3]; a.len += r[4]; a.area += r[5]; a.vol += r[6]; });
    }
    let el = 0; const rows = Object.values(agg).map(a => { const rt = pack[a.cls], unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0; const qty = unit === 'M' ? a.len : unit === 'M2' ? a.area : unit === 'M3' ? a.vol : a.cnt; el += a.cnt; return { disc: a.disc, cls: a.cls, storey: a.storey, count: a.cnt, unit, qty, rate, cost: Math.round(rate * qty) }; });
    return { capped: false, elements: el, rows };
  }
  function openErp() {
    const edb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
    fs.readFileSync(path.join(ROOT, 'erp', 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { edb.run(st); } catch (e) {} });
    for (const m of ['ad_docvalue_overlay.js', 'ad_taxcat_overlay.js']) require(path.join(ROOT, 'erp', m)).ensure(edb);   // as ProjOrderState.openStore opens it
    return edb;
  }
  globalThis.window = globalThis;
  globalThis.ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
  globalThis.ScheduleAuthor = require(path.join(ROOT, 'viewer', 'schedule_author.js'));
  globalThis.SEQUENCE_RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8')).SEQUENCE_RULES;
  globalThis.ErpPushPlan = Plan; globalThis.ErpRestPush = Push;
  const FEP = require(path.join(ROOT, 'viewer', 'find_erp_push.js'));
  // R1 / baseline: Note removed from the plan = the push as it was before this change. find_erp_push reads window.ErpPushPlan.planFromDb at call time.
  const realPlan = Plan.planFromDb; let stripNote = false;
  Plan.planFromDb = function (db, v) { const r = realPlan.apply(this, arguments); if (stripNote && r.plan) r.plan.fields = r.plan.fields.filter(f => f.column !== 'Note'); return r; };

  const login = { user: CTX.user, pass: PASS, lang: 'en_US', clientId: +CTX.clientId, roleId: +CTX.roleId, orgId: +CTX.orgId, warehouseId: +CTX.warehouseId, stage: 0 };
  const QT = Plan.bimootbServiceTypes().C_Project.query;
  const legacyNote = async v => { const rows = await Push.queryRows(BASE, login, QT, 'C_Project', [{ column: 'Value', val: v }]); return rows.length ? { found: true, note: rows[0].Note == null ? '' : String(rows[0].Note), id: rows[0].C_Project_ID } : { found: false, note: '' }; };
  const kernelNote = (edb, v) => { const r = q(edb, 'SELECT Note FROM C_Project WHERE Value=?', [v]); return r.length && r[0][0] != null ? String(r[0][0]) : ''; };
  function tab(building, sel) {
    const edb = openErp();
    globalThis.ProjOrderState = { storeStamp: () => Promise.resolve('w'), openStore: () => Promise.resolve({ db: edb }), shared: () => Promise.resolve({ db: edb, stamp: 'w' }), persistShared: () => Promise.resolve(true), invalidateShared: () => {} };
    const link = { href: null, style: {}, title: '', setAttribute(k, v) { if (k === 'href') this.href = v; } };
    const A = { activeBuilding: building, db: bdb, _SQL: SQL, status: { textContent: '' }, DB_URL: 'witness://' + BLD, cachedFetch: () => Promise.reject(new Error('not used')), LEGACY_ERP: { base: BASE, via: 'witness' }, LEGACY_ERP_CTX: Object.assign({}, CTX) };
    const api = FEP.create({ A, elErpOpen: link, askPushAgain: () => Promise.resolve(true),   // the user answers "Push again" (a 2nd push on the same page)
      getLastSelSet: () => sel.set, selectionPriced, getLastSelLabel: () => 'all', cur: () => 'USD',
      askErpLogin: ask => Promise.resolve({ user: ask.prefill.user, pass: PASS, clientId: +ask.prefill.clientId, roleId: +ask.prefill.roleId, orgId: +ask.prefill.orgId, warehouseId: +ask.prefill.warehouseId }) });
    return { A, edb, push: async () => { const from = allLogs.length; await api.pushToErp(); const logs = allLogs.slice(from); const m = logs.map(s => /§PROJ_PUSH_LEGACY base=.*projectId=(\d+) created=(\{.*\})/.exec(s)).find(Boolean); return { logs, pid: m ? +m[1] : null, created: m ? JSON.parse(m[2]) : null }; } };
  }
  const note = (logs, re) => logs.filter(s => re.test(s));

  // ── baseline = the push before this change (Note not in the plan), and R1's subject ──
  stripNote = true;
  const selB = { set: setA }, TB = tab(P_BASE, selB);
  const b1 = await TB.push(); selB.set = setB; const b2 = await TB.push();
  stripNote = false;
  const bK = toSet(kernelNote(TB.edb, P_BASE)), bL = await legacyNote(P_BASE);
  out('§W_LEGACY_NOTE_BASELINE project=' + P_BASE + ' push1=' + JSON.stringify(b1.created) + ' push2=' + JSON.stringify(b2.created) + ' kernelGuids=' + bK.size + ' legacyGuids=' + toSet(bL.note).size);
  if (!b1.created || !b2.created) { out('§W_LEGACY_NOTE_SETUP the baseline push did not reach legacy: ' + note(b1.logs, /§PROJ_PUSH_LEGACY/).concat(note(b2.logs, /§PROJ_PUSH_LEGACY/)).join(' | ').slice(0, 400)); inconclusive = 'baseline push failed'; out(verdictLine()); process.exit(2); }

  // ── the real run ──
  const sel = { set: setA }, T = tab(P_MAIN, sel);
  const r1 = await T.push();
  const k1 = toSet(kernelNote(T.edb, P_MAIN)), l1 = await legacyNote(P_MAIN);
  out('§W_LEGACY_NOTE_PUSH1 project=' + P_MAIN + ' legacyId=' + r1.pid + ' created=' + JSON.stringify(r1.created) + ' kernelGuids=' + k1.size + ' legacyGuids=' + toSet(l1.note).size);
  note(r1.logs, /§LEGACY_NOTE/).forEach(s => out('   ' + s));
  const N1 = (kernel, legacy, pushed) => kernel.size >= 2 && pushed.size >= 2 && sameSet(kernel, pushed) && sameSet(toSet(legacy.note), kernel);
  const pop1 = k1.size >= 2 && setA.size >= 2;
  const n1ok = check('N1 first push: legacy Note == Kernel Note == the pushed set (as a SET; population ' + k1.size + ')', pop1 && l1.found && N1(k1, l1, setA), 'kernel=' + k1.size + ' legacy=' + toSet(l1.note).size + ' pushed=' + setA.size);
  if (!pop1) inconclusive = 'population < 2';

  sel.set = setB;
  const r2 = await T.push();
  const k2 = toSet(kernelNote(T.edb, P_MAIN)), l2 = await legacyNote(P_MAIN), want2 = new Set(Array.from(setA).concat(Array.from(setB)));
  out('§W_LEGACY_NOTE_PUSH2 project=' + P_MAIN + ' created=' + JSON.stringify(r2.created) + ' kernelGuids=' + k2.size + ' legacyGuids=' + toSet(l2.note).size);
  note(r2.logs, /§LEGACY_NOTE/).forEach(s => out('   ' + s));
  check('N2 second push (disjoint set): both sides hold the union, equal (' + want2.size + ' GUIDs)', k2.size === want2.size && sameSet(k2, want2) && sameSet(toSet(l2.note), k2) && k2.size > k1.size, 'kernel=' + k2.size + ' legacy=' + toSet(l2.note).size + ' want=' + want2.size);

  const eq = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  check('N3 the rest of the push is unchanged: created counts of push 1 and push 2 equal the baseline (Note-less) run', eq(r1.created, b1.created) && eq(r2.created, b2.created) && r1.created.projects === 1 && r1.created.lines > 0,
    'push1=' + JSON.stringify(r1.created) + ' baseline1=' + JSON.stringify(b1.created) + ' push2=' + JSON.stringify(r2.created) + ' baseline2=' + JSON.stringify(b2.created));

  // ── R1: the very N1 check on the Note-less run must FAIL (legacy holds no GUID there) ──
  const bK1 = bK.size >= 2, r1Detected = bK1 && !N1(bK, bL, bK);
  out('§W_LEGACY_NOTE_R1 Note removed from the plan: kernelGuids=' + bK.size + ' legacyGuids=' + toSet(bL.note).size + ' -> N1 check ' + (r1Detected ? 'FAILED as it must' : 'DID NOT FAIL (control is blind)'));
  if (r1Detected) red.detected++;

  // ── R2: the update type deactivated on the pilot -> skipped line, push completes, legacy Note stays empty ──
  let r2run = null, r2L = null;
  const restartPilot = async why => {
    cp.execFileSync(path.join(PHOME, 'stop.sh'), { encoding: 'utf8' });
    for (let i = 0; i < 60; i++) { try { await _realFetch(BASE + '/', { signal: AbortSignal.timeout(2000) }); await sleep(1000); } catch (e) { break; } }
    cp.execFileSync(path.join(PHOME, 'start.sh'), { stdio: 'ignore' });
    const t0 = Date.now();
    for (;;) {
      await sleep(5000);
      try { await Push.queryRows(BASE, login, QT, 'C_Project', [{ column: 'Value', val: P_MAIN }]); break; } catch (e) { if (Date.now() - t0 > 420000) throw new Error('pilot did not answer a query 420 s after restart (' + why + '): ' + e.message); }
    }
    out('§W_LEGACY_NOTE_RESTART ' + why + ' answered after ' + Math.round((Date.now() - t0) / 1000) + ' s');
  };
  try {
    PG("update ws_webservicetype set isactive='N' where value='" + UTYPE + "'");
    await restartPilot('update type inactive');
    out('§W_LEGACY_NOTE_R2 ' + UTYPE + ' deactivated on the pilot (isactive=' + PG("select isactive from ws_webservicetype where value='" + UTYPE + "'") + ')');
    const sel3 = { set: setA }, T3 = tab(P_R2, sel3);
    r2run = await T3.push(); r2L = await legacyNote(P_R2);
  } finally {
    PG("update ws_webservicetype set isactive='Y' where value='" + UTYPE + "'");
    out('§W_LEGACY_NOTE_R2 ' + UTYPE + ' restored on the pilot (isactive=' + PG("select isactive from ws_webservicetype where value='" + UTYPE + "'") + ')');
    await restartPilot('update type restored');
  }
  const sk = r2run ? note(r2run.logs, /§LEGACY_NOTE skipped=/) : [];
  sk.forEach(s => out('   ' + s));
  const r2Detected = !!r2run && sk.length === 1 && eq(r2run.created, b1.created) && !!r2L && r2L.found && r2L.note === '';
  out('§W_LEGACY_NOTE_R2 skippedLines=' + sk.length + ' created=' + JSON.stringify(r2run && r2run.created) + ' baseline1=' + JSON.stringify(b1.created) + ' legacyNoteLen=' + (r2L ? r2L.note.length : 'n/a') + ' -> ' + (r2Detected ? 'skip logged, push completed' : 'NOT as required'));
  if (r2Detected) red.detected++;
  else { fails++; out('§W_LEGACY_NOTE_ASSERT FAIL R2 control did not behave (skip must be logged exactly once and the push complete)'); }
  if (!r1Detected) { fails++; out('§W_LEGACY_NOTE_ASSERT FAIL R1 control is blind: with Note removed N1 did not fail'); }

  out('§W_LEGACY_NOTE_COUNT logLines=' + allLogs.length + ' wsCalls=' + fetchCalls);
  out('§W_LEGACY_NOTE_PROJECT ' + P_MAIN + ' legacy C_Project_ID=' + r1.pid + ' (left in place on the pilot; never deleted)');
  out(verdictLine());
  process.exit(inconclusive ? 2 : fails ? 1 : 0);
})().catch(e => { try { PG("update ws_webservicetype set isactive='Y' where value='" + UTYPE + "'"); } catch (x) {} out('§W_LEGACY_NOTE_ERROR ' + (e && e.stack || e)); out('§W-LEGACY-NOTE checks=3 fail=' + fails + ' red=' + red.detected + '/2 verdict=INCONCLUSIVE (error)'); process.exit(2); });
