// capex/tests/witness_find_push_4d.js — W-FIND-PUSH-4D (spec: prompts/CAPEX_DASHBOARD.md §5.5 R1-f). Headless, no browser, no GPU.
// ISSUE IT PROVES OR DISPROVES: "the viewer's Find › ERP push ignores the programme on screen" — drives the REAL viewer/find_erp_push.js _pushToErp (create(D).pushToErp)
// on HHS: A.db = the building db from disk + the schedule rows the SHIPPED 4D pipeline wrote (copied read-only via scripts/cache_4d_run.js build's onDb hook);
// the ERP store = a temp seed copy (stubbed OPFS). Expected = the 4D owner's res.tasks (independent of the fold and the reader).
// Negative: the same push with NO schedule rows → phases without dates + NO_4D_SCHEDULE. Break: BREAK=1 expects one task shifted +1 day → FAIL.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_find_push_4d.js
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), BLD = 'HHS_Office_Federated', BREAK = process.env.BREAK === '1';
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
let fails = 0, judged = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§W_FP4D_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
const addDays = (s, d) => new Date(Date.parse(s + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
const q = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };

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
  if (!exp || !exp.length) { console.log('§W_FP4D_VERDICT INCONCLUSIVE no 4D tasks'); process.exit(2); }
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
  const FEP = require(path.join(ROOT, 'viewer', 'find_erp_push.js'));

  async function push(withSchedule) {
    const bdb = buildingDb(withSchedule), edb = openErp();
    globalThis._4dTemplate = withSchedule ? tpl : null;
    globalThis.ProjOrderState = { storeStamp: () => Promise.resolve('w'), openStore: () => Promise.resolve({ db: edb }) };
    const guids = q(bdb, 'SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x>0').map(v => v[0]);
    // the Find panel's _selectionPriced shape (nf_highlight_cost.js), over the same SQL basis
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
    const logs = [], _l = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); logs.push(s); _l(s); };
    const A = { activeBuilding: BLD, db: bdb, _SQL: SQL, status: {}, DB_URL: 'witness://' + BLD, cachedFetch: () => Promise.reject(new Error('not used')) };
    const api = FEP.create({ A, getLastSelSet: () => new Set(guids), selectionPriced, getLastSelLabel: () => 'all', cur: () => 'USD' });
    api.pushToErp();
    for (let i = 0; i < 200 && !logs.some(s => /§PROJ_PUSH project=|§PROJ_PUSH_DEFER|PROJ_PUSH_DBERR/.test(s)); i++) await new Promise(r => setTimeout(r, 25));
    await new Promise(r => setTimeout(r, 50));
    console.log = _l;
    const pid = q(edb, 'SELECT C_Project_ID FROM C_Project WHERE Value=?', [BLD])[0];
    const ph = pid ? q(edb, 'SELECT Name, StartDate, EndDate FROM C_ProjectPhase WHERE C_Project_ID=? ORDER BY SeqNo', pid) : [];
    const nt = pid ? q(edb, 'SELECT COUNT(*) FROM C_ProjectTask WHERE C_ProjectPhase_ID IN (SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=?)', pid)[0][0] : 0;
    return { logs, ph, nt };
  }

  const a = await push(true);
  const expPh = {}; exp.forEach(t => { const p = expPh[t.phase] || (expPh[t.phase] = { s: t.s, e: t.e }); if (t.s < p.s) p.s = t.s; if (t.e > p.e) p.e = t.e; });
  if (BREAK) { const k = Object.keys(expPh)[0]; expPh[k].e = addDays(expPh[k].e, 1); console.log('§W_FP4D_BREAK expected ' + k + ' end +1 d'); }
  a.ph.forEach(v => console.log('§W_FP4D_PHASE ' + v[0] + ' ' + String(v[1]).slice(0, 10) + ' → ' + String(v[2]).slice(0, 10) + (expPh[v[0]] ? '  Gantt ' + expPh[v[0]].s + ' → ' + expPh[v[0]].e : '')));
  check('PUSH ran and saw the programme', a.logs.some(s => /§PROJ_PUSH_SCHEDULE from=building db/.test(s)), (a.logs.find(s => /§PROJ_PUSH_SCHEDULE/.test(s)) || '').slice(0, 140));
  const bad = Object.keys(expPh).filter(n => { const g = a.ph.find(v => v[0] === n); return !g || String(g[1]).slice(0, 10) !== expPh[n].s || String(g[2]).slice(0, 10) !== expPh[n].e; });
  check('ORDER PHASE DATES == the Gantt\'s', a.ph.length > 0 && bad.length === 0, bad.length ? 'wrong=' + bad.join(', ') : 'phases=' + a.ph.length);
  check('ONE TASK PER GANTT BAR', a.nt === exp.length, 'order=' + a.nt + ' gantt=' + exp.length);
  const b = await push(false);
  check('NO PROGRAMME → no dates', b.ph.length > 0 && b.ph.every(v => v[1] == null && v[2] == null), 'phases=' + b.ph.length);
  check('NO PROGRAMME → logged none', b.logs.some(s => /§PROJ_PUSH_SCHEDULE none/.test(s)));
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_FP4D_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W_FP4D_ERROR ' + (e && e.stack || e)); process.exit(2); });
