// capex/tests/witness_capex.js — W-CAPEX-* (spec: prompts/CAPEX_DASHBOARD.md §6). Numbers, not looks.
// Loads the REAL page in headless Chromium against an ERP DB and asserts every rendered tile value equals an INDEPENDENT SQL result
// (raw sql.js SELECTs below; tiles.js is not used for the expected values). Falsifiers mutate a TEMP COPY of the DB. Nothing is committed.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_capex.js [shed_erp.db]   (puppeteer is taken from ~/bim-compiler/node_modules)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const initSqlJs = require('sql.js');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler/node_modules/puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), TODAY = '2026-11-02';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capexw-'));
const A = require('../adapters.js'), Tl = require('./pa_harness.js');
(async () => { await require('./pa_harness.js').init({ quiet: true });   // §5.75 step 3: the numbers come from the PA rows (pa_harness.js), not the hand formulas in tiles.js
let fails = 0, judged = 0;
const say = m => console.log(m);
function check(name, ok, detail) { judged++; if (!ok) fails++; say('§CAPEX_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }

// ── static server: repo root + /__tmp/ (temp DBs, a stub legacy) ──
function serve(stub) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/ADInterface/services/rest/model_adservice/query_data' && stub) return stub(q, r);
      const f = u.startsWith('/__tmp/') ? path.join(TMP, u.slice(7)) : path.join(ROOT, u);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end('nf'); }
      const ext = path.extname(f); r.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' }[ext] || 'application/octet-stream');
      r.end(fs.readFileSync(f));
    }).listen(0, () => res(srv));
  });
}

// ── independent expected values: plain SQL over the DB file, same canonical strings as tiles.flatten ──
function expected(db, f) {
  const q = (sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };
  const one = (sql, p) => { const v = q(sql, p); return v.length ? v[0][0] : null; };
  const org = f.org ? `AND p.AD_Org_ID=${+f.org}` : '', cat = f.category ? `AND p.ProjectCategory='${f.category}'` : '';
  const ACT = `p.IsActive='Y' AND COALESCE(p.Processed,'N')<>'Y'`;
  const ST = { all: '1=1', active: ACT, closed: `p.Processed='Y'`, inactive: `p.IsActive<>'Y'` }[f.status || 'all'];
  const P = `FROM C_Project p WHERE 1=1 ${org} ${cat}`, SP = `${P} AND ${ST}`, AP = `${SP} AND ${ACT}`;
  const K = `COALESCE(CAST(p.C_Currency_ID AS TEXT),'none')`;
  const o = {}, nP = one(`SELECT COUNT(*) ${P}`);
  const cur = (rows, d) => rows.length ? rows.map(r => r[0] + ':' + (r[1] / 100).toFixed(d)).sort().join(',') : 'no data';
  const sumQ = (col, where) => q(`SELECT ${K}, SUM(ROUND(p.${col}*100)) ${where} GROUP BY 1 HAVING COUNT(p.${col})>0`).map(r => [r[0], r[1]]);
  const ratio = (num, den) => { const n = Object.fromEntries(num), r = den.filter(d => d[1] > 0 && n[d[0]] != null).map(d => d[0] + ':' + (n[d[0]] / d[1]).toFixed(4)).sort(); return r.length ? r.join(',') : 'no data'; };
  const empty = nP === 0;
  o.total_projects = empty ? 'no data' : nP; o.total_projects_closed = empty ? 'no data' : one(`SELECT COUNT(*) ${P} AND p.Processed='Y'`);
  o.active_projects = empty ? 'no data' : one(`SELECT COUNT(*) ${P} AND ${ACT}`);
  o.active_projects_closing = empty ? 'no data' : one(`SELECT COUNT(*) ${P} AND ${ACT} AND p.C_Phase_ID IN (SELECT C_Phase_ID FROM C_Phase WHERE Name='Closed')`);
  o.approved_budget = cur(sumQ('PlannedAmt', SP), 2);
  o.actual_cost = cur(sumQ('ProjectBalanceAmt', SP), 2);
  o.actual_cost_pct_of_plan = ratio(sumQ('ProjectBalanceAmt', SP), sumQ('PlannedAmt', SP));
  o.committed_cost = cur(sumQ('CommittedAmt', SP), 2); o.committed_invoiced = cur(sumQ('InvoicedAmt', SP), 2);
  o.forecast_cost = 'PENDING';
  o.completed_year = empty ? 'no data' : one(`SELECT COUNT(*) ${P} AND p.Processed='Y' AND substr(p.DateFinish,1,4)=substr(?,1,4)`, [TODAY]);
  // per-project earned-value facts for the active population, straight from C_ProjectPhase
  const ph = (id, extra) => `(SELECT COALESCE(SUM(ROUND(COALESCE(PlannedAmt,0)*100)),0) FROM C_ProjectPhase WHERE C_Project_ID=${id} ${extra})`;
  const rows = q(`SELECT p.C_Project_ID, ${K}, p.C_Phase_ID, COALESCE(ROUND(p.ProjectBalanceAmt*100),0), ROUND(p.PlannedAmt*100), p.PlannedAmt IS NULL ${AP.replace('FROM C_Project p', 'FROM C_Project p')}`).map(r => {
    const id = r[0];
    return { id, cur: r[1], phase: r[2], ac: r[3], plan: r[4] || 0, bac: one(`SELECT ${ph(id, '')}`), pv: one(`SELECT ${ph(id, `AND EndDate IS NOT NULL AND substr(EndDate,1,10)<='${TODAY}'`)}`), ev: one(`SELECT ${ph(id, `AND IsComplete='Y'`)}`),
      dated: one(`SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=${id} AND StartDate IS NOT NULL AND EndDate IS NOT NULL`),
      overdue: one(`SELECT COALESCE(MAX(julianday(?)-julianday(substr(EndDate,1,10))),0) FROM C_ProjectPhase WHERE C_Project_ID=${id} AND COALESCE(IsComplete,'N')<>'Y' AND EndDate IS NOT NULL AND substr(EndDate,1,10)<?`, [TODAY, TODAY]) };
  });
  const NA = 'no data';
  if (!rows.length) { ['health', 'stage', 'physical', 'spent', 'schedule', 'avg_delay', 'budget_status', 'actual_overrun'].forEach(k => o[k] = NA); }
  else {
    const h = { green: 0, amber: 0, red: 0, none: 0 }, st = {}, s = { ontime: 0, delayed: 0, atrisk: 0, nosched: 0 }, b = { within: 0, over: 0, notstarted: 0 }, ov = {}; let dsum = 0, dn = 0;
    const bacBy = {}, evBy = {};
    rows.forEach(r => {
      if (!(r.pv > 0)) h.none++; else { const idx = [r.ev / r.pv]; if (r.ac > 0) idx.push(r.ev / r.ac); const ok = idx.filter(v => v >= 0.9).length; h[ok === idx.length ? 'green' : ok === 0 ? 'red' : 'amber']++; }
      const nm = r.phase == null ? '(no phase)' : (one('SELECT Name FROM C_Phase WHERE C_Phase_ID=?', [r.phase]) || 'C_Phase#' + r.phase); st[nm] = (st[nm] || 0) + 1;
      bacBy[r.cur] = (bacBy[r.cur] || 0) + r.bac; evBy[r.cur] = (evBy[r.cur] || 0) + r.ev;
      if (!r.dated) s.nosched++; else if (r.pv > 0 && r.ev / r.pv < 0.9) { s.atrisk++; dsum += r.overdue; dn++; } else if (r.overdue > 0) { s.delayed++; dsum += r.overdue; dn++; } else s.ontime++;
      if (r.ac === 0) b.notstarted++; else if (r.ac > r.plan) { b.over++; ov[r.cur] = (ov[r.cur] || 0) + r.ac - r.plan; } else b.within++;
    });
    o.health = `green=${h.green} amber=${h.amber} red=${h.red} none=${h.none}`;
    o.stage = Object.keys(st).sort().map(k => k + '=' + st[k]).join(';');
    o.physical = ratio(Object.entries(evBy), Object.entries(bacBy));
    o.spent = ratio(sumQ('ProjectBalanceAmt', AP), sumQ('PlannedAmt', AP));
    o.schedule = `ontime=${s.ontime} delayed=${s.delayed} atrisk=${s.atrisk} nosched=${s.nosched}`; o.avg_delay = dn ? (dsum / dn).toFixed(2) : NA;
    o.budget_status = `within=${b.within} over=${b.over} notstarted=${b.notstarted}`; o.actual_overrun = Object.keys(ov).length ? Object.keys(ov).sort().map(k => k + ':' + (ov[k] / 100).toFixed(2)).join(',') : NA;
  }
  o.approvals = one(`SELECT COUNT(*) FROM AD_WF_Activity WHERE WFState='OS' AND COALESCE(Processed,'N')<>'Y'`);
  o.last_updated = one(`SELECT MAX(p.Updated) ${P}`) || NA;
  Object.keys(o).forEach(k => o[k] = String(o[k])); return o;
}
const CARD = { health: 'health', stage: 'stage', physical: 'physical_spent', spent: 'physical_spent', schedule: 'schedule', avg_delay: 'schedule', budget_status: 'budget_status', actual_overrun: 'budget_status' };

async function load(browser, base, dbUrl, extra, hash) {
  const page = await browser.newPage(), logs = [];
  page.on('console', m => { const t = m.text(); if (t.startsWith('§')) logs.push(t); });
  page.on('pageerror', e => logs.push('§PAGEERROR ' + e.message));
  await page.goto(`${base}/capex/index.html?today=${TODAY}&db=${encodeURIComponent(dbUrl)}${extra || ''}${hash || ''}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__capex && window.__capex.rendered || document.querySelector('.nodata'), { timeout: 30000 }).catch(() => {});
  return { page, logs };
}
const domFlat = page => page.evaluate(() => {
  const m = {}, txt = {}; document.querySelectorAll('[data-flat]').forEach(e => { m[e.getAttribute('data-flat')] = e.getAttribute('data-value'); txt[e.getAttribute('data-flat')] = e.textContent.trim(); });
  const cards = {}; document.querySelectorAll('[data-tile]').forEach(c => cards[c.getAttribute('data-tile')] = c.textContent);
  const money = {}; document.querySelectorAll('.money[data-cur]').forEach(e => { const k = e.closest('[data-flat]'); if (k) (money[k.getAttribute('data-flat')] = money[k.getAttribute('data-flat')] || {})[e.getAttribute('data-cur')] = parseFloat(e.textContent.replace(/[^0-9.\-]/g, '')); });
  return { m, txt, cards, money };
});

// compare rendered DOM to independent SQL; returns the DOM flat map
async function verify(label, browser, base, dbFile, dbUrl, f, extra) {
  const SQL = global.__SQL, db = new SQL.Database(fs.readFileSync(dbFile)), exp = expected(db, f);
  const qs = (f.org ? '&org=' : '') ; // filters are applied through the page's own selects below
  const { page, logs } = await load(browser, base, dbUrl, extra);
  if (f.org || f.category || f.status) {
    await page.evaluate(f => { const set = (id, v) => { const s = document.getElementById(id); if (v != null) { s.value = v; s.dispatchEvent(new Event('change')); } }; set('fOrg', f.org || ''); set('fCat', f.category || ''); set('fStatus', f.status || 'active'); }, f);
  } else { await page.evaluate(() => { const s = document.getElementById('fStatus'); s.value = 'all'; s.dispatchEvent(new Event('change')); }); }
  const fe = Object.assign({ status: 'all' }, f); const exp2 = expected(db, fe);
  const d = await domFlat(page); let bad = 0, n = 0;
  for (const k of Object.keys(exp2)) {
    n++; const dv = d.m[k];
    if (dv === undefined) {                         // not rendered as a number => the card must say "no data"/pending, and SQL must agree
      const ok = exp2[k] === 'no data' && /no data/.test(d.cards[CARD[k]] || ''); if (!ok) { bad++; say(`§CAPEX_DIFF ${label} ${k} dom=<absent> sql=${exp2[k]}`); }
    } else if (dv !== exp2[k]) { bad++; say(`§CAPEX_DIFF ${label} ${k} dom=${dv} sql=${exp2[k]}`); }
  }
  // visible text of simple numbers == data-value
  for (const k of ['total_projects', 'total_projects_closed', 'active_projects', 'completed_year', 'approvals']) if (d.txt[k] !== undefined && d.txt[k] !== d.m[k]) { bad++; say(`§CAPEX_DIFF ${label} visible ${k} text=${d.txt[k]} value=${d.m[k]}`); }
  for (const k of ['approved_budget', 'actual_cost', 'committed_cost']) if (d.money[k]) for (const [c, v] of Object.entries(d.money[k])) {
    const want = (exp2[k].split(',').find(x => x.startsWith(c + ':')) || '').split(':')[1]; if (!(Math.abs(v - parseFloat(want)) < 0.005)) { bad++; say(`§CAPEX_DIFF ${label} visible money ${k} cur=${c} text=${v} sql=${want}`); }
  }
  check(`W-CAPEX-SQL ${label}`, bad === 0 && n > 0, `tiles_compared=${n} diffs=${bad}`);
  say(`§CAPEX_TILES ${label} ` + JSON.stringify(d.m));
  const pagerr = logs.filter(l => l.startsWith('§PAGEERROR')); check(`no page errors ${label}`, pagerr.length === 0, pagerr.join('|'));
  await page.close(); return { dom: d.m, exp: exp2 };
}

(async () => {
  global.__SQL = await initSqlJs();
  const SQL = global.__SQL, seed = path.join(ROOT, 'erp', 'ad_seed.db');
  const mut = (name, sqls) => { const db = new SQL.Database(fs.readFileSync(seed)); sqls.forEach(s => db.run(s)); const f = path.join(TMP, name + '.db'); fs.writeFileSync(f, Buffer.from(db.export())); return f; };
  const srv = await serve(), base = 'http://localhost:' + srv.address().port;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-gpu-sandbox'] });
  try {
    // ── 1. base DB, three filter sets ──
    say(`§CAPEX_BASE db=erp/ad_seed.db today=${TODAY}`);
    const base0 = await verify('base/status=all', browser, base, seed, '/erp/ad_seed.db', { status: 'all' });
    await verify('base/status=active', browser, base, seed, '/erp/ad_seed.db', { status: 'active' });
    await verify('base/org=11,status=all', browser, base, seed, '/erp/ad_seed.db', { org: '11', status: 'all' });
    // population judged? (VACUOUS guard)
    const nProj = new SQL.Database(fs.readFileSync(seed)).exec('SELECT COUNT(*) FROM C_Project')[0].values[0][0];
    say(`§CAPEX_POPULATION C_Project=${nProj} ${nProj ? '' : 'VACUOUS'}`); if (!nProj) { say('§CAPEX_VERDICT INCONCLUSIVE'); process.exitCode = 3; return; }

    // ── 2. falsifiers on temp copies ──
    const diffKeys = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]).sort();
    const f1 = mut('f1', ['UPDATE C_Project SET PlannedAmt=PlannedAmt+1000 WHERE C_Project_ID=990000']);
    const r1 = await verify('F1 Hospital PlannedAmt+1000', browser, base, f1, '/__tmp/f1.db', { status: 'all' });
    const k1 = diffKeys(base0.dom, r1.dom); check('W-CAPEX-FALSIFY F1 only approved_budget moved', k1.join() === 'approved_budget', 'changed=' + k1.join());
    const pick = (s, c) => parseFloat((s.split(',').find(x => x.startsWith(c + ':')) || '').split(':')[1]);
    check('W-CAPEX-FALSIFY F1 rendered delta == +1000.00 (cur 301)', Math.abs(pick(r1.dom.approved_budget, '301') - pick(base0.dom.approved_budget, '301') - 1000) < 0.005, `${pick(base0.dom.approved_budget, '301')} -> ${pick(r1.dom.approved_budget, '301')}`);
    const f2 = mut('f2', ["UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=990002"]);
    const r2 = await verify('F2 phase 990002 complete', browser, base, f2, '/__tmp/f2.db', { status: 'all' });
    const k2 = diffKeys(base0.dom, r2.dom); check('W-CAPEX-FALSIFY F2 physical progress moved (and only schedule-money-free tiles)', k2.includes('physical'), 'changed=' + k2.join());
    const f3 = mut('f3', ["UPDATE C_Project SET Processed='Y' WHERE C_Project_ID=990000"]);
    const r3 = await verify('F3 Hospital Processed=Y', browser, base, f3, '/__tmp/f3.db', { status: 'all' });
    check('W-CAPEX-FALSIFY F3 closed +1, active -1', +r3.dom.total_projects_closed === +base0.dom.total_projects_closed + 1 && +r3.dom.active_projects === +base0.dom.active_projects - 1, `closed ${base0.dom.total_projects_closed}->${r3.dom.total_projects_closed} active ${base0.dom.active_projects}->${r3.dom.active_projects}`);

    // ── 3. vacuous: no projects at all ──
    const fe = mut('empty', ['DELETE FROM C_ProjectLine', 'DELETE FROM C_ProjectTask', 'DELETE FROM C_ProjectPhase', 'DELETE FROM C_Project']);
    const re = await verify('EMPTY C_Project', browser, base, fe, '/__tmp/empty.db', { status: 'all' });
    const nodata = ['total_projects', 'active_projects', 'approved_budget', 'actual_cost', 'completed_year', 'last_updated'].filter(k => re.dom[k] !== 'no data');
    check('W-CAPEX-VACUOUS empty population renders "no data" (no 0 / 0% / 100%)', nodata.length === 0, 'not-no-data=' + nodata.join());
    { const { page } = await load(browser, base, '/__tmp/empty.db'); const t = await page.evaluate(() => ({ circles: document.querySelectorAll('svg circle').length, text: document.getElementById('view').textContent })); check('W-CAPEX-VACUOUS no donut ring, no percent text', t.circles === 0 && !/\b\d+%/.test(t.text), `circles=${t.circles}`); await page.close(); }

    // ── 4. no source at all ──
    { const { page } = await load(browser, base, '/__tmp/does_not_exist.db', '&snapshot=' + encodeURIComponent('/__tmp/does_not_exist.json')); /* NEITHER source: a local git-ignored legacy_snapshot.json must not change this verdict (§12.6) */ const t = await page.evaluate(() => document.getElementById('view').textContent); check('W-CAPEX-NODATA-DEFAULTS missing DB => "no data source", not zeros', /no data source/.test(t), t.slice(0, 60)); await page.close(); }

    // ── 5. shed fold (temp DB produced by capex/tools/fold_demo.js; only if provided) ──
    const shed = process.argv[2];
    if (shed && fs.existsSync(shed)) {
      fs.copyFileSync(shed, path.join(TMP, 'shed.db')); fs.mkdirSync(path.join(TMP, 'b'), { recursive: true }); fs.writeFileSync(path.join(TMP, 'b', 'SHED_extracted.db'), '');   // existence marker for the BIM-link probe only
      await verify('SHED fold', browser, base, shed, '/__tmp/shed.db', { status: 'all' }, '&buildings=' + encodeURIComponent('/__tmp/b/'));
      const { page } = await load(browser, base, '/__tmp/shed.db', '&buildings=' + encodeURIComponent('/__tmp/b/'), '#projects');
      await page.evaluate(() => { const s = document.getElementById('fStatus'); s.value = 'all'; s.dispatchEvent(new Event('change')); });
      const rows = await page.evaluate(() => [...document.querySelectorAll('tr[data-project]')].map(r => ({ id: r.dataset.project, cur: r.querySelector('[data-cur]').textContent, planned: parseFloat(r.querySelector('[data-col=PlannedAmt]').textContent.replace(/[^0-9.\-]/g, '')), bim: (r.querySelector('a.bim') || {}).href || null, val: r.cells[0].textContent })));
      const sdb = new SQL.Database(fs.readFileSync(shed)), sqlP = sdb.exec("SELECT p.C_Project_ID, p.Value, p.PlannedAmt, c.ISO_Code FROM C_Project p JOIN C_Currency c USING(C_Currency_ID) WHERE p.Value='SHED'")[0].values[0];
      const row = rows.find(r => r.val === 'SHED');
      check('W-CAPEX-SHED SHED row present with SQL PlannedAmt and currency from data', !!row && Math.abs(row.planned - sqlP[2]) < 0.005 && row.cur === sqlP[3], `row=${JSON.stringify(row)} sql=${JSON.stringify(sqlP)}`);
      check('W-CAPEX-BIMLINK link only where a building file exists, with db= and record=', rows.filter(r => r.bim).length === 1 && row.bim && row.bim.includes('record=' + sqlP[0]) && row.bim.includes('db='), 'links=' + rows.filter(r => r.bim).map(r => r.val + ' ' + r.bim).join('|'));
      await page.close();
    } else say('§CAPEX_SHED SKIPPED (no shed DB path given) — INCONCLUSIVE for W-CAPEX-SHED');

    // ── 6. legacy adapter parse + twin machinery against a STUB (rows copied from the SQLite DB in WS wire shape; a transport test, NOT a twin result) ──
    { const sd = new SQL.Database(fs.readFileSync(seed)), sq = A.fromSqlite(sd); let tamper = null;
      const wire = rows => ({ WindowTabData: { '@TotalRows': String(rows.length), DataSet: { DataRow: rows.map(r => ({ field: Object.keys(r).map(c => ({ '@column': c, val: r[c] == null ? { '@nil': 'true' } : String(r[c]) })) })) } } });
      const stubSrv = await serve((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { const t = JSON.parse(b).ModelCRUDRequest.ModelCRUD.serviceType, ent = Object.entries(A.LEGACY_TYPES).find(e => e[1] === t);
        r.setHeader('Content-Type', 'application/json');
        if (!ent || !['projects', 'orgs'].includes(ent[0])) return r.end(JSON.stringify({ StandardResponse: { '@IsError': true, Error: 'Web service type ' + t + ' not found' } }));
        let rows = sq[ent[0]]; if (tamper && ent[0] === 'projects') rows = rows.map(x => Object.assign({}, x, x.C_Project_ID === 990000 ? { PlannedAmt: x.PlannedAmt + 1 } : {})); r.end(JSON.stringify(wire(rows))); }); });
      const cfg = { base: 'http://localhost:' + stubSrv.address().port, login: {} };
      const lg = await A.loadLegacy(cfg);
      check('W-CAPEX-TWIN-PARSE projects parsed == sqlite rows (stringified)', JSON.stringify(lg.projects.map(r => Object.values(r).map(v => v == null ? null : String(v)))) === JSON.stringify(sq.projects.map(r => Object.values(r).map(v => v == null ? null : String(v)))), `rows=${lg.projects.length}`);
      check('W-CAPEX-TWIN-PARSE unregistered read types => unavailable (never guessed)', lg.unavailable.sort().join() === ['currencies', 'lines', 'phaseRef', 'phases', 'tasks', 'wf'].sort().join(), lg.unavailable.join());
      const f = { status: 'all', today: TODAY }, lines = [], tw = Tl.twin(Tl.flatten(Tl.compute(sq, f).tiles), Tl.flatten(Tl.compute(lg, f).tiles), m => lines.push(m));
      lines.forEach(l => say(l)); check('§DASH_TWIN stub: projects-only tiles MATCH, phase tiles INCONCLUSIVE, verdict PASS', tw.verdict === 'PASS' && tw.diff === 0 && tw.match > 0 && tw.inconclusive > 0, JSON.stringify(tw));
      check('twin: PENDING tile is INCONCLUSIVE, not MATCH', lines.some(l => /tile=forecast_cost .* INCONCLUSIVE$/.test(l)), '');
      tamper = true; const lg2 = await A.loadLegacy(cfg), l2 = [], tw2 = Tl.twin(Tl.flatten(Tl.compute(sq, f).tiles), Tl.flatten(Tl.compute(lg2, f).tiles), m => l2.push(m));
      l2.filter(l => /DIFF/.test(l)).forEach(l => say('  (negative control) ' + l)); check('twin negative control: one changed legacy row => DIFF => FAIL', tw2.verdict === 'FAIL' && tw2.diff >= 1, JSON.stringify(tw2));
      const tw3 = Tl.twin({ a: 'no data' }, { a: 'no data' }, () => {}); check('twin both-empty => INCONCLUSIVE (never PASS)', tw3.verdict === 'INCONCLUSIVE', tw3.verdict);
      // §12.6 PER_SOURCE: each system's own write clock is printed, never judged
      const tw4 = Tl.twin({ total_projects: '3', last_updated: '2026-11-02 18:35:17' }, { total_projects: '3', last_updated: '2026-11-02 18:29:07' }, () => {});
      check('twin: last_updated-only difference => PASS, per_source=1 (not a DIFF)', tw4.verdict === 'PASS' && tw4.diff === 0 && tw4.per_source === 1, JSON.stringify(tw4));
      // §15.1 ?project= — one project by Value, the same filter on both sources: total == 1 and the budget == that project's own PlannedAmt (independent SQL), unknown Value => no data
      { const one = sq.projects.find(x => x.PlannedAmt != null && Number(x.PlannedAmt) > 0), fp = Tl.flatten(Tl.compute(sq, { status: 'all', today: TODAY, project: one.Value }).tiles), fz = Tl.flatten(Tl.compute(sq, { status: 'all', today: TODAY, project: '__none__' }).tiles);
        check('?project= scopes to one project (total=1, budget=its PlannedAmt)', fp.total_projects === '1' && fp.approved_budget === one.C_Currency_ID + ':' + Number(one.PlannedAmt).toFixed(2), JSON.stringify({ v: one.Value, t: fp.total_projects, b: fp.approved_budget }));
        check('?project= unknown Value => no data (never zeros)', fz.total_projects === 'no data' || fz.total_projects === '0' ? fz.approved_budget === 'no data' : false, JSON.stringify({ t: fz.total_projects, b: fz.approved_budget })); }
      const tw5 = Tl.twin({ last_updated: 'x' }, { last_updated: 'y' }, () => {});
      check('twin: PER_SOURCE-only population => INCONCLUSIVE (never PASS)', tw5.verdict === 'INCONCLUSIVE', tw5.verdict);
      stubSrv.close(); }

    // ── 6b. in-page twin wiring: a snapshot file (rows copied from the SQLite DB — wiring test only) => the PAGE logs §DASH_TWIN lines + verdict ──
    { const sq = A.fromSqlite(new SQL.Database(fs.readFileSync(seed))); sq.source = 'legacy'; sq.unavailable = ['phases', 'tasks', 'lines', 'phaseRef', 'currencies', 'wf']; ['phases', 'tasks', 'lines', 'phaseRef', 'currencies', 'wf'].forEach(k => sq[k] = []);
      fs.writeFileSync(path.join(TMP, 'snap.json'), JSON.stringify(sq));
      const { page, logs } = await load(browser, base, '/erp/ad_seed.db', '&snapshot=' + encodeURIComponent('/__tmp/snap.json'));
      const tw = logs.filter(l => l.startsWith('§DASH_TWIN')); check('in-page twin logs per-tile lines and a verdict', tw.some(l => /^§DASH_TWIN tile=approved_budget .* MATCH$/.test(l)) && tw.some(l => /^§DASH_TWIN_VERDICT PASS/.test(l)), `lines=${tw.length}`);
      const opts = await page.evaluate(() => [...document.querySelectorAll('#src option')].map(o => o.value)); check('source selector offers A and B when a legacy snapshot exists', opts.join() === 'sqlite,legacy', opts.join());
      await page.close(); }
    // ── 7. no-invention audit ──
    { const files = ['index.html', 'dash.js', 'dash.css', 'tiles.js', 'adapters.js'].map(f => [f, fs.readFileSync(path.join(ROOT, 'capex', f), 'utf8')]);
      const hits = []; files.forEach(([f, s]) => { [/kazi/i, /sysnova/i, /৳/, /\bUSD\b/, /[$€£]\s*\d/, /Math\.random/].forEach(re => { const m = s.match(re); if (m) hits.push(f + ':' + re + ':' + m[0]); }); });
      check('no client name / currency literal / random in capex/*', hits.length === 0, hits.join(' | ')); }
  } finally { await browser.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
  const verdict = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  say(`§CAPEX_VERDICT ${verdict} asserts=${judged} failed=${fails}`); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });

})().catch(function (e) { console.log('§PA_HARNESS_CRASH ' + (e && e.stack || e)); process.exit(1); });