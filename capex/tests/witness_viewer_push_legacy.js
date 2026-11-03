// capex/tests/witness_viewer_push_legacy.js — W-VIEWER-PUSH-LEGACY (spec: bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8.6 SPEC P5; result: prompts/CAPEX_DASHBOARD.md §5.10).
// Headless node, no browser, no GPU. ISSUE IT PROVES OR DISPROVES: "the viewer's Find > ERP push stops at its own local store — it never reaches a real iDempiere" (and, once it does,
// "it lands different numbers, duplicates on a 2nd push, leaks the password, or keeps a refused password").
// Drives the REAL viewer/find_erp_push.js _pushToErp exactly as capex/tests/witness_find_push_4d.js does (building db + the SHIPPED 4D pipeline's schedule rows; ERP store = temp seed copy,
// stubbed OPFS) with: the password dialog stubbed (D.askErpLogin), A.LEGACY_ERP = the LOCAL pilot, role "BIM Push Test" (1200003, includes the plugin master role) through the plugin's BIMOOTB_* types.
// The pilot is NEVER cleaned: each run creates one project named HHS_VIEWER_PUSH_<stamp> (the safety gate refuses deletes) — its id is logged (§W_VPL_PROJECT).
// Break: BREAK=1 expects one MORE phase on legacy than the fold made -> FAIL.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_viewer_push_legacy.js   (needs the pilot at http://localhost:8088)
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), BLD = 'HHS_Office_Federated', BREAK = process.env.BREAK === '1';
const BASE = process.env.PILOT_BASE || 'http://localhost:8088', PASS = process.env.PILOT_PASS || 'GardenAdmin';
const CTX = { user: 'GardenAdmin', clientId: '11', roleId: '1200003', orgId: '11', warehouseId: '103' };
const STAMP = new Date().toISOString().replace(/\D/g, '').slice(2, 14), PROJ = 'HHS_VIEWER_PUSH_' + STAMP, PROJ_BAD = 'HHS_VIEWER_PUSH_' + STAMP + '_BADPW', BADPW = 'WRONGPW_' + Math.random().toString(36).slice(2, 10);
// every WS round trip is counted (erp_rest_push.js binds fetch at load, so wrap BEFORE the require)
let fetchCalls = 0; const _realFetch = globalThis.fetch; globalThis.fetch = function () { fetchCalls++; return _realFetch.apply(this, arguments); };
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const Push = require(path.join(ROOT, 'viewer', 'erp_rest_push.js')), Plan = require(path.join(ROOT, 'viewer', 'erp_push_plan.js'));
let fails = 0, judged = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§W_VPL_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
const addDays = (s, d) => new Date(Date.parse(s + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
const q = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };
const allLogs = [], _l = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); allLogs.push(s); _l(s); };
const lc = o => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };

(async () => {
  let rows4D = null, exp = null, tpl = null;
  await CACHE.build(BLD, true, undefined, { onDb: (db, res, ctx) => {
    tpl = ctx.template;
    rows4D = { schedules: q(db, 'SELECT * FROM schedules'),
      tasks: db.exec('SELECT * FROM tasks'), te: q(db, 'SELECT task_id, guid FROM task_elements') };
    rows4D.schedHdr = db.exec('PRAGMA table_info(schedules)')[0].values.map(v => v[1]);
    rows4D.taskHdr = db.exec('PRAGMA table_info(tasks)')[0].values.map(v => v[1]);
    rows4D.taskRows = q(db, 'SELECT * FROM tasks');
    exp = (res.tasks || []).map(t => ({ phase: t.phase, s: addDays(ctx.start, t.sDays), e: addDays(ctx.start, t.eDays) }));
  } });
  if (!exp || !exp.length) { console.log('§W_VPL_VERDICT INCONCLUSIVE no 4D tasks'); process.exit(2); }
  const SQL = await initSqlJs();
  const file = CACHE.resolveDbFile(BLD).path;
  function buildingDb(withSchedule) {
    const db = new SQL.Database(fs.readFileSync(file));
    if (!withSchedule) return db;
    ['schedules', 'tasks', 'task_elements'].forEach(t => { try { db.run('DELETE FROM ' + t); } catch (e) {} });
    const addCols = (t, hdr) => { const have = db.exec('PRAGMA table_info(' + t + ')')[0].values.map(v => v[1]); hdr.forEach(c => { if (have.indexOf(c) < 0) db.run('ALTER TABLE ' + t + ' ADD COLUMN ' + c); }); };
    addCols('schedules', rows4D.schedHdr); addCols('tasks', rows4D.taskHdr);
    rows4D.schedules.forEach(v => db.run('INSERT INTO schedules (' + rows4D.schedHdr.join(',') + ') VALUES (' + v.map(() => '?').join(',') + ')', v));
    rows4D.taskRows.forEach(v => db.run('INSERT INTO tasks (' + rows4D.taskHdr.join(',') + ') VALUES (' + v.map(() => '?').join(',') + ')', v));
    rows4D.te.forEach(v => db.run('INSERT INTO task_elements VALUES (?,?)', v));
    return db;
  }
  function openErp() {
    const edb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
    fs.readFileSync(path.join(ROOT, 'erp', 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { edb.run(st); } catch (e) {} });
    return edb;
  }
  // the viewer's globals, as the browser has them (read at call time by find_erp_push.js)
  globalThis.window = globalThis;
  globalThis.ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
  globalThis.ScheduleAuthor = require(path.join(ROOT, 'viewer', 'schedule_author.js'));
  const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
  globalThis.SEQUENCE_RULES = sr.SEQUENCE_RULES;
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'rsmeans2024_us.json'), 'utf8')).materials;
  globalThis.ErpPushPlan = Plan; globalThis.ErpRestPush = Push;   // viewer.html loads both as classic scripts (window.ErpPushPlan / window.ErpRestPush)
  const FEP = require(path.join(ROOT, 'viewer', 'find_erp_push.js'));

  const goodLogin = { user: CTX.user, pass: PASS, lang: 'en_US', clientId: +CTX.clientId, roleId: +CTX.roleId, orgId: +CTX.orgId, warehouseId: +CTX.warehouseId, stage: 0 };
  const ST = Plan.bimootbServiceTypes();
  const legacyRows = async (t, table, keys) => (await Push.queryRows(BASE, goodLogin, ST[t].query, table, keys)).map(lc);
  globalThis._4dTemplate = tpl;   // the 4D template the SHIPPED pipeline used (find_erp_push reads window._4dTemplate for ProjFold.scheduleFromDb)
  const bdb = buildingDb(true);
  const guids = q(bdb, 'SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0').map(v => v[0]);
  const AREA = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END';
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
  // one viewer "tab": its own find_erp_push closure (= its own remembered-password variable), its own A, a dialog stub that records what it was asked and answers from `answers`
  function tab(building, target, answers) {
    const edb = openErp();
    globalThis.ProjOrderState = { storeStamp: () => Promise.resolve('w'), openStore: () => Promise.resolve({ db: edb }), shared: () => Promise.resolve({ db: edb, stamp: 'w' }), persistShared: () => Promise.resolve(true), invalidateShared: () => {} };
    const asks = [];
    const A = { activeBuilding: building, db: bdb, _SQL: SQL, status: { textContent: '' }, DB_URL: 'witness://' + BLD, cachedFetch: () => Promise.reject(new Error('not used')), LEGACY_ERP: target, LEGACY_ERP_CTX: Object.assign({}, CTX) };
    const api = FEP.create({ A, getLastSelSet: () => new Set(guids), selectionPriced, getLastSelLabel: () => 'all', cur: () => 'USD',
      askErpLogin: (ask) => { asks.push(ask); const a = answers[Math.min(asks.length - 1, answers.length - 1)]; return Promise.resolve(a === null ? null : { user: ask.prefill.user, pass: a, clientId: +ask.prefill.clientId, roleId: +ask.prefill.roleId, orgId: +ask.prefill.orgId, warehouseId: +ask.prefill.warehouseId }); } });
    return { A, api, edb, asks, push: async () => { const from = allLogs.length, f0 = fetchCalls; await api.pushToErp(); return { logs: allLogs.slice(from), calls: fetchCalls - f0 }; } };
  }
  const grab = (logs, re) => logs.find(s => re.test(s)) || '';

  // ── target rule (item 2) ──
  const LT = (pathname, search, origin) => Plan.legacyTarget({ pathname, search, origin: origin || 'http://h:1' });
  check('TARGET served under /bimootb/ -> its own origin', (LT('/bimootb/viewer/viewer.html', '') || {}).base === 'http://h:1');
  check('TARGET ?erp= http://localhost accepted', (LT('/viewer/viewer.html', '?erp=http://localhost:8088') || {}).base === 'http://localhost:8088');
  check('TARGET ?erp= https accepted', (LT('/viewer/viewer.html', '?erp=https://erp.example.com') || {}).base === 'https://erp.example.com');
  check('TARGET ?erp= plain http to a remote host REFUSED (a password must not cross it)', LT('/viewer/viewer.html', '?erp=http://erp.example.com') === null);
  check('TARGET none -> null', LT('/viewer/viewer.html', '') === null && LT('/viewer/viewer.html', '?erp=javascript:alert(1)') === null);

  // ── 1. first push: creates on the pilot; the dialog is asked once and shown the URL-param prefill ──
  const T1 = tab(PROJ, { base: BASE, via: 'witness' }, [PASS]);
  const r1 = await T1.push();
  const L1 = grab(r1.logs, /§PROJ_PUSH_LEGACY base=/), m1 = L1.match(/projectId=(\d+) created=(\{.*\})/), pid1 = m1 ? +m1[1] : null, cr1 = m1 ? JSON.parse(m1[2]) : null;
  console.log('§W_VPL_PROJECT ' + PROJ + ' legacy C_Project_ID=' + pid1 + ' (left in place on the pilot; never deleted)');
  check('PUSH reached legacy: §PROJ_PUSH_LEGACY with a project id', !!m1 && cr1.projects === 1, L1.slice(0, 200));
  check('DIALOG asked once, with the URL-param prefill + the target base', T1.asks.length === 1 && JSON.stringify(T1.asks[0].prefill) === JSON.stringify(CTX) && T1.asks[0].base === BASE);
  // legacy == the local fold
  const lp = pid1 ? (await legacyRows('C_Project', 'C_Project', [{ column: 'Value', val: PROJ }]))[0] : null;
  const locP = q(T1.edb, 'SELECT C_Project_ID, PlannedAmt FROM C_Project WHERE Value=?', [PROJ])[0];
  const locPh = q(T1.edb, 'SELECT C_ProjectPhase_ID, Name, StartDate, EndDate FROM C_ProjectPhase WHERE C_Project_ID=? ORDER BY SeqNo, C_ProjectPhase_ID', [locP[0]]);
  const locT = q(T1.edb, 'SELECT COUNT(*) FROM C_ProjectTask WHERE C_ProjectPhase_ID IN (SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=?)', [locP[0]])[0][0];
  const locL = q(T1.edb, 'SELECT COUNT(*) FROM C_ProjectLine WHERE C_Project_ID=?', [locP[0]])[0][0];
  const lph = pid1 ? await legacyRows('C_ProjectPhase', 'C_ProjectPhase', [{ column: 'C_Project_ID', val: pid1 }]) : [];
  let legT = 0, legL = 0; const phaseOk = [];
  for (const ph of lph) {
    legT += (await legacyRows('C_ProjectTask', 'C_ProjectTask', [{ column: 'C_ProjectPhase_ID', val: +ph.c_projectphase_id }])).length;
    legL += (await legacyRows('C_ProjectLine', 'C_ProjectLine', [{ column: 'C_ProjectPhase_ID', val: +ph.c_projectphase_id }])).length;
  }
  const expPhases = locPh.length + (BREAK ? 1 : 0);
  if (BREAK) console.log('§W_VPL_BREAK expecting legacy phases = fold phases + 1 (' + expPhases + ')');
  check('LEGACY == FOLD: PlannedAmt', !!lp && Math.abs(Number(lp.plannedamt) - Number(locP[1])) < 0.0005, 'legacy=' + (lp && lp.plannedamt) + ' fold=' + locP[1]);
  check('LEGACY == FOLD: phase count', lph.length === expPhases && lph.length > 0, 'legacy=' + lph.length + ' fold=' + locPh.length);
  check('LEGACY == FOLD: task count', legT === locT && locT > 0, 'legacy=' + legT + ' fold=' + locT);
  check('LEGACY == FOLD: line count', legL === locL && locL > 0, 'legacy=' + legL + ' fold=' + locL);
  const badDates = locPh.filter(p => { const g = lph.find(x => x.name === p[1]); return !g || String(g.startdate).slice(0, 10) !== String(p[2]).slice(0, 10) || String(g.enddate).slice(0, 10) !== String(p[3]).slice(0, 10); });
  locPh.forEach(p => { const g = lph.find(x => x.name === p[1]); console.log('§W_VPL_PHASE ' + p[1] + ' fold ' + String(p[2]).slice(0, 10) + ' → ' + String(p[3]).slice(0, 10) + '  legacy ' + (g ? String(g.startdate).slice(0, 10) + ' → ' + String(g.enddate).slice(0, 10) : 'ABSENT')); });
  check('LEGACY == FOLD: the phase dates (all of them; none may be empty = not vacuous)', locPh.length > 0 && locPh.every(p => p[2] && p[3]) && badDates.length === 0, 'phases=' + locPh.length + (badDates.length ? ' wrong=' + badDates.map(p => p[1]).join(',') : ''));

  // ── 2. second push, same tab: password remembered (no 2nd dialog), legacy created +0 ──
  const r2 = await T1.push();
  const L2 = grab(r2.logs, /§PROJ_PUSH_LEGACY base=/), m2 = L2.match(/projectId=(\d+) created=(\{.*\})/), cr2 = m2 ? JSON.parse(m2[2]) : null;
  check('2nd PUSH created +0 on legacy, same project', !!m2 && +m2[1] === pid1 && Object.keys(cr2).every(k => cr2[k] === 0), L2.slice(0, 200));
  check('2nd PUSH did not ask again (password held in memory for the tab)', T1.asks.length === 1);

  // ── 3. no target: skip line, ZERO web-service calls, no dialog ──
  const T3 = tab(PROJ + '_NOTARGET', null, [PASS]);
  const r3 = await T3.push();
  check('NO TARGET -> §PROJ_PUSH_LEGACY skip=no-target', /§PROJ_PUSH_LEGACY skip=no-target/.test(r3.logs.join('\n')));
  check('NO TARGET -> zero WS calls and no dialog', r3.calls === 0 && T3.asks.length === 0 && !r3.logs.some(s => /§ERP_REST_CALL/.test(s)), 'fetchCalls=' + r3.calls + ' asks=' + T3.asks.length);
  check('NO TARGET -> the local fold still happened', /§PROJ_PUSH project=/.test(r3.logs.join('\n')));

  // ── 4. wrong password: refused, 0 rows created, error surfaced, password forgotten ──
  const T4 = tab(PROJ_BAD, { base: BASE, via: 'witness' }, [BADPW, null]);
  const r4 = await T4.push();
  const E4 = grab(r4.logs, /§PROJ_PUSH_LEGACY_ERR/);
  check('WRONG PASSWORD -> §PROJ_PUSH_LEGACY_ERR (no success line)', !!E4 && !r4.logs.some(s => /§PROJ_PUSH_LEGACY base=/.test(s)), E4.slice(0, 220));
  check('WRONG PASSWORD -> it really tried legacy', r4.calls > 0, 'fetchCalls=' + r4.calls);
  check('WRONG PASSWORD -> error surfaced to the user (status text)', /failed/i.test(T4.A.status.textContent), T4.A.status.textContent.slice(0, 120));
  const bad = await legacyRows('C_Project', 'C_Project', [{ column: 'Value', val: PROJ_BAD }]);
  check('WRONG PASSWORD -> 0 rows created on legacy', bad.length === 0, 'projects named ' + PROJ_BAD + '=' + bad.length);
  const r4b = await T4.push();
  check('WRONG PASSWORD -> password forgotten: the next push asks again', T4.asks.length === 2, 'asks=' + T4.asks.length);
  check('CANCELLED dialog -> skip=no-credentials, no WS call', /§PROJ_PUSH_LEGACY skip=no-credentials/.test(r4b.logs.join('\n')) && r4b.calls === 0, 'fetchCalls=' + r4b.calls);

  // ── 5. the password is in NO captured log line / status text ──
  const leakGood = allLogs.filter(s => s.indexOf(PASS) >= 0), leakBad = allLogs.filter(s => s.indexOf(BADPW) >= 0);
  const statuses = [T1, T3, T4].map(t => t.A.status.textContent).filter(s => s.indexOf(PASS) >= 0 || s.indexOf(BADPW) >= 0);
  check('PASSWORD never logged (' + allLogs.length + ' lines scanned: the real one and the wrong one)', allLogs.length > 50 && leakGood.length === 0 && leakBad.length === 0 && statuses.length === 0, leakGood.concat(leakBad).slice(0, 2).join(' | ').slice(0, 200));

  const verdict = judged === 0 || !m1 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_VPL_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' project=' + PROJ + ' legacyId=' + pid1 + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W_VPL_ERROR ' + (e && e.stack || e)); process.exit(2); });
