// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PACK (bim-ootb prompts/CAPEX_DASHBOARD.md §5.71). READ THE LOG after every run: the §WTP lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves (TWIN CARDINAL RULE): the SAME CAPEX test-data 2Pack, packed in by a GardenWorld admin, lands the SAME rows on legacy iDempiere (the test instance, folder Pack In)
//   and on the Kernel ERP twin (the Pack In window's own path, PluginEngine.packInClient).
//   P1 the same UUIDs per table on both sides == the zip's records (independent scan)
//   P2 every column the pack carries equal per row (numbers/dates normalised; a uuid reference compared as the UUID of the row it points at; keys + audit columns not compared)
//   P3 what the model layer writes outside the pack equal: C_Project.C_Currency_ID, M_Product_Acct and M_Cost row counts per product
// Legacy half: stop the test instance, database copy, RUN_ApplyPackInFromFolder.sh, read the rows, RESTORE (always), start, setup gate. Its rows are kept in ~/.cache/capex_film/wtd_pack/legacy_rows.json
//   keyed by the zip's sha256, so a break run (twin half only: WTP_LEGACY=cache) reuses them; a stale file is refused.
// Break switches (each MUST FAIL, twin half only, legacy from the cache): WTP_BREAK=twinshift (P2) | nomodel (P3)
// Run: node capex/tests/witness_td_pack.js > <log>      (WTP_LEGACY=cache to skip the legacy half)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WTP_BREAK || '', LEGACY = BREAK ? 'cache' : (process.env.WTP_LEGACY || 'run');
const ZIP = process.env.WTP_ZIP || fs.readdirSync(path.join(REPO, 'capex/plugin/testdata_2pack')).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(REPO, 'capex/plugin/testdata_2pack', f)).pop();
const HOME = os.homedir(), INST = path.join(HOME, 'idempiere-bimdoc'), DB = 'idempiere_bimdoc', BAK = 'idempiere_bimdoc_wtdbak', CACHE = path.join(HOME, '.cache/capex_film/wtd_pack');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
let fails = 0, judged = 0;
const say = s => console.log(s);
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; say('§WTP ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; say('§WTP ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + ' ' + JSON.stringify(info).slice(0, cond ? 500 : 1800)); };
const pg = (sql, user) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', user || 'adempiere', '-d', user === 'postgres' ? 'postgres' : DB, '-At', '-v', 'ON_ERROR_STOP=1'], { input: (user === 'postgres' ? '' : 'set search_path=adempiere;\n') + sql + ';\n', encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(l => l && l !== 'SET');
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";

// ── the pack, read independently (the zip's text) ──
function readPack(xml) {
  const recs = []; for (const m of xml.matchAll(/<([A-Za-z_0-9]+) type="table">([\s\S]*?)<\/\1>/g)) {
    const table = m[1], props = {}; for (const p of m[2].matchAll(/<([A-Za-z_0-9]+)((?: [a-z-]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const at = {}; for (const a of p[2].matchAll(/ ([a-z-]+)="([^"]*)"/g)) at[a[1]] = a[2];
      props[p[1].toLowerCase()] = { ref: at.reference || null, key: (at['reference-key'] || '').toLowerCase() || null, v: p[3] == null ? '' : p[3] };
    }
    recs.push({ table: table.toLowerCase(), uu: props[table.toLowerCase() + '_uu'].v, props });
  }
  return recs;
}
const norm = v => { if (v == null || v === '') return null; const s = String(v); if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(s)); if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(s)) return s.slice(0, 19).replace('T', ' '); return s; };
const SKIP = /^(ad_client_id|created|createdby|updated|updatedby)$/;
// one side's rows: { byTable: { t: { uu: row } }, uuOf: { refTable: { id: uu } }, model: {...} } from a reader rows(sql) -> [lower-case objects]
function collect(rows, recs) {
  const tables = [...new Set(recs.map(r => r.table))], byTable = {}, uuOf = {};
  for (const t of tables) { const uus = recs.filter(r => r.table === t).map(r => lit(r.uu)).join(','); byTable[t] = {}; rows('SELECT * FROM ' + t + ' WHERE ' + t + '_uu IN (' + uus + ')').forEach(r => { byTable[t][r[t + '_uu']] = r; }); }
  const want = {}; recs.forEach(r => { const row = byTable[r.table][r.uu]; if (!row) return; Object.keys(r.props).forEach(k => { const p = r.props[k]; if (p.ref === 'uuid' && p.key && row[k] != null && row[k] !== '') (want[p.key] = want[p.key] || new Set()).add(Number(row[k])); }); });
  Object.keys(want).forEach(t => { uuOf[t] = {}; rows('SELECT ' + t + '_id AS i, ' + t + '_uu AS u FROM ' + t + ' WHERE ' + t + '_id IN (' + [...want[t]].join(',') + ')').forEach(r => { uuOf[t][Number(r.i)] = r.u; }); });
  const prods = Object.values(byTable.m_product || {}), model = { currency: {}, acct: {}, cost: {} };
  Object.values(byTable.c_project || {}).forEach(p => { model.currency[p.c_project_uu] = p.c_currency_id == null ? null : Number(p.c_currency_id); });
  prods.forEach(p => { model.acct[p.m_product_uu] = Number(rows('SELECT COUNT(*) AS n FROM m_product_acct WHERE m_product_id=' + Number(p.m_product_id))[0].n); model.cost[p.m_product_uu] = Number(rows('SELECT COUNT(*) AS n FROM m_cost WHERE m_product_id=' + Number(p.m_product_id))[0].n); });
  return { byTable, uuOf, model };
}

function legacyHalf(recs, sha) {
  if (LEGACY === 'cache') {
    const f = path.join(CACHE, 'legacy_rows.json'); if (!fs.existsSync(f)) return { error: 'no cached legacy rows: run once without WTP_LEGACY=cache' };
    const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.sha256 !== sha) return { error: 'cached legacy rows are for zip ' + c.sha256 + ', not ' + sha + ': run the legacy half again' };
    say('§WTP legacy half from the cache ' + f + ' (written ' + c.at + ')'); return c.side;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtp_pack_')), log = path.join(CACHE, 'legacy_packin.log'); fs.mkdirSync(CACHE, { recursive: true }); fs.copyFileSync(ZIP, path.join(dir, path.basename(ZIP)));
  let side = null, copied = false;
  try {
    try { execFileSync(path.join(INST, 'stop.sh'), { encoding: 'utf8' }); } catch (e) { /* not running */ }
    execFileSync('sleep', ['8']);
    const conns = pg("SELECT count(*) FROM pg_stat_activity WHERE datname='" + DB + "'", 'postgres')[0]; if (conns !== '0') throw new Error(conns + ' connections on ' + DB + ' after stop');
    pg('DROP DATABASE IF EXISTS ' + BAK, 'postgres'); pg('CREATE DATABASE ' + BAK + ' TEMPLATE ' + DB, 'postgres'); copied = true;
    const before = Number(pg("SELECT count(*) FROM c_project WHERE value LIKE 'TD\\_%'")[0]); if (before) throw new Error(before + ' TD projects already on the test instance: refusing (a left-over set)');
    const out = execFileSync('./RUN_ApplyPackInFromFolder.sh', [dir], { cwd: path.join(INST, 'server/utils'), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 400000 }); fs.writeFileSync(log, out);
    const imp = pg("SELECT name || '|' || pk_status || '|' || ad_client_id FROM ad_package_imp WHERE name=" + lit(path.basename(ZIP)));
    say('§WTP legacy packin log=' + log + ' summary=' + JSON.stringify((out.match(/Summary=.*/g) || []).slice(-1)) + ' ad_package_imp=' + JSON.stringify(imp));
    const rows = sql => pg('SELECT row_to_json(x) FROM (' + sql + ') x').map(l => JSON.parse(l));
    side = collect(rows, recs);
  } finally {
    if (copied) { pg('DROP DATABASE ' + DB, 'postgres'); pg('CREATE DATABASE ' + DB + ' TEMPLATE ' + BAK + ' OWNER adempiere', 'postgres'); pg('DROP DATABASE ' + BAK, 'postgres'); }
    const left = Number(pg("SELECT count(*) FROM c_project WHERE value LIKE 'TD\\_%'")[0]);
    execFileSync('sh', ['-c', path.join(INST, 'start.sh')]); say('§WTP legacy restored=' + copied + ' td_projects_after_restore=' + left + ' (instance restarted)');
  }
  fs.writeFileSync(path.join(CACHE, 'legacy_rows.json'), JSON.stringify({ sha256: sha, at: new Date().toISOString(), side }));
  return side;
}

async function twinHalf(recs, zipBytes) {
  const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
    fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), page = await (await browser.newContext()).newPage(), LOG = [];
  page.on('console', m => LOG.push(m.text())); page.on('pageerror', e => LOG.push('PAGEERR ' + e));
  try {
    await page.goto('http://localhost:' + server.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
    await page.waitForFunction(() => window.APP && window.APP.clientId != null && window.PluginEngine && window.PluginEngine.packInClient && window.__idmpAttach, null, { timeout: 60000 }); await page.waitForTimeout(1200);
    const r = await page.evaluate(async ({ b64, noModel }) => {
      if (noModel) { const a = window.PipoPackIn.apply; window.PipoPackIn.apply = (db, x, o) => a(db, x, Object.assign({}, o, { model: null })); }
      const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const A = window.APP, res = await window.PluginEngine.packInClient({ name: 'W-TD-PACK', bytes, clientId: A.clientId, orgId: A.orgId || 0, userId: A.actor, roleId: A.roleId, procId: 0 });
      return { ok: res.ok, summary: res.summary, client: A.clientId };
    }, { b64: zipBytes.toString('base64'), noModel: BREAK === 'nomodel' });
    say('§WTP twin packInClient ' + JSON.stringify(r) + ' ' + JSON.stringify(LOG.filter(l => /§PACKIN-CLIENT/.test(l)).map(l => l.slice(0, 260))));
    const all = {}; const rows = async sql => (await page.evaluate(s => (window.__idmpAttach.host().rows(s) || []).map(o => { const k = {}; Object.keys(o).forEach(c => { k[c.toLowerCase()] = o[c]; }); return k; }), sql));
    // collect() is synchronous over a reader: pre-read through the page by running it twice (first pass records the SQL, second answers from it)
    const seen = []; collect(sql => { seen.push(sql); return sql.indexOf('COUNT(*)') >= 0 ? [{ n: 0 }] : []; }, recs);
    for (let pass = 0; pass < 3; pass++) { for (const s of seen) if (!(s in all)) all[s] = await rows(s); const more = []; collect(sql => { if (!(sql in all)) more.push(sql); return all[sql] || (sql.indexOf('COUNT(*)') >= 0 ? [{ n: 0 }] : []); }, recs); if (!more.length) break; seen.push(...more); }
    return { side: collect(sql => all[sql] || [], recs), r };
  } finally { LOG.filter(l => /PAGEERR|§MODEL-ERR/.test(l)).slice(0, 6).forEach(l => say('  page: ' + l.slice(0, 300))); await browser.close(); server.close(); }
}

(async () => {
  try {
    const xml = execFileSync('unzip', ['-p', ZIP, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 }), recs = readPack(xml), sha = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex');
    const want = {}; recs.forEach(r => { want[r.table] = (want[r.table] || 0) + 1; });
    say('§WTP zip=' + path.relative(REPO, ZIP) + ' sha256=' + sha.slice(0, 16) + ' records=' + recs.length + ' perTable=' + JSON.stringify(want) + ' break=' + (BREAK || 'none') + ' legacy=' + LEGACY);
    let twinZip = fs.readFileSync(ZIP);
    if (BREAK === 'twinshift') {   // one phase StartDate shifted a day in the zip the TWIN gets (legacy and the oracle keep the original)
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wtp_shift_')); execFileSync('unzip', ['-q', ZIP, '-d', d]); const f = path.join(d, 'CAPEXTestData/dict/PackOut.xml'); let x = fs.readFileSync(f, 'utf8'), done = false;
      x = x.replace(/(<C_ProjectPhase type="table">[\s\S]*?<StartDate>\d{4}-\d\d-)(\d\d)/, (m, a, dd) => { done = true; return a + String(Number(dd) % 28 + 1).padStart(2, '0'); }); fs.writeFileSync(f, x);
      const z = path.join(d, 'shift.zip'); execFileSync('zip', ['-q', '-r', z, 'CAPEXTestData'], { cwd: d }); twinZip = fs.readFileSync(z); say('§WTP break twinshift applied=' + done);
    }
    const L = legacyHalf(recs, sha);
    if (!L || L.error) { verdict('P1', 'legacy rows', false, L, true); throw new Error('no legacy side'); }
    const T = (await twinHalf(recs, twinZip)).side;
    // P1
    const p1 = {}; let p1ok = true; Object.keys(want).forEach(t => { const l = Object.keys(L.byTable[t] || {}), w = Object.keys(T.byTable[t] || {}), both = l.filter(u => w.indexOf(u) >= 0).length; p1[t] = { zip: want[t], legacy: l.length, twin: w.length, both }; if (!(l.length === want[t] && w.length === want[t] && both === want[t])) p1ok = false; });
    if (!recs.length) verdict('P1', 'records', false, { want }, true); else verdict('P1', 'the same UUIDs per table on both sides == the zip (' + recs.length + ' records)', p1ok, p1);
    // P2
    let n = 0; const diffs = [];
    recs.forEach(r => { const a = (L.byTable[r.table] || {})[r.uu], b = (T.byTable[r.table] || {})[r.uu]; if (!a || !b) return;
      Object.keys(r.props).forEach(k => { if (SKIP.test(k) || k === r.table + '_id' || k === r.table + '_uu' || !(k in a)) return; const p = r.props[k];
        let x = a[k], y = b[k]; if (p.ref === 'uuid' && p.key) { x = x == null || x === '' ? null : ((L.uuOf[p.key] || {})[Number(x)] || '<id ' + x + '>'); y = y == null || y === '' ? null : ((T.uuOf[p.key] || {})[Number(y)] || '<id ' + y + '>'); }
        n++; if (norm(x) !== norm(y)) diffs.push(r.table + '.' + k + ' ' + r.uu.slice(0, 8) + ' legacy=' + norm(x) + ' twin=' + norm(y)); }); });
    if (!n) verdict('P2', 'columns compared', false, { n }, true);
    else verdict('P2', 'every column the pack carries equal on both sides (' + n + ' values, references by UUID)', diffs.length === 0, { diffs: diffs.length, first: diffs.slice(0, 10) });
    // P3
    const md = []; ['currency', 'acct', 'cost'].forEach(k => Object.keys(L.model[k]).forEach(u => { if (L.model[k][u] !== T.model[k][u]) md.push(k + ' ' + u.slice(0, 8) + ' legacy=' + L.model[k][u] + ' twin=' + T.model[k][u]); }));
    const mN = Object.keys(L.model.currency).length + Object.keys(L.model.acct).length;
    if (!mN) verdict('P3', 'model rows', false, L.model, true);
    else verdict('P3', 'the model layer\'s own rows equal: currency on ' + Object.keys(L.model.currency).length + ' projects, M_Product_Acct + M_Cost on ' + Object.keys(L.model.acct).length + ' products', md.length === 0, { diffs: md.slice(0, 8), legacy: { acct: L.model.acct, cost: L.model.cost }, twin: { acct: T.model.acct, cost: T.model.cost } });
  } catch (e) { fails++; say('§WTP FATAL ' + (e.stack || e).toString().slice(0, 1200)); }
  if (LEGACY === 'run') { try { execFileSync('bash', ['-c', 'for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w %{http_code} http://localhost:8108/webui/ || true); [ "$c" = 200 ] || [ "$c" = 302 ] && exit 0; sleep 5; done; exit 1'], { timeout: 330000 }); const g = execFileSync('bash', [path.join(REPO, 'capex/legacy/test_instance/setup_test_instance.sh'), '--check'], { encoding: 'utf8', timeout: 400000 }); say('§WTP after restore: ' + ((g.match(/§SETUP_VERDICT.*/) || ['no verdict'])[0])); } catch (e) { fails++; say('§WTP after restore: setup gate FAILED ' + String(e.stdout || e.message).slice(-400)); } }
  say('§WTP VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fail=' + fails + ' break=' + (BREAK || 'none'));
  process.exit(fails ? 1 : 0);
})();
