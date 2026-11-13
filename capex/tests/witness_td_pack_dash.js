// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PACK-DASH (bim-ootb prompts/CAPEX_DASHBOARD.md §5.72). READ THE LOG after every run: the §WTPD lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: after a GardenWorld admin packs the CAPEX test-data 2Pack in, the DASHBOARD (capex/index.html, the page the testers look at) shows the 12 test projects, and shows them
//   the SAME on Source A (the Kernel ERP twin) and Source B (legacy iDempiere via its stock WebServices): TWIN CARDINAL RULE on what the user sees.
//   D1 the Budget view lists the zip's project Values on each side
//   D2 per test project its Budget row (currency, Planned, Committed, Invoiced, Actual) is equal on both sides; Planned == SUM(PlannedQty x PlannedPrice) of its lines in the zip; Committed/Invoiced/Actual 0
//   D3 per test project the Schedule tab (#project/<id>/schedule, #phTable) lists the zip's phases with the zip's start/end dates, on both sides
//   D4 no page error on either side
// Legacy half: test instance stopped, DB copy, folder Pack In, started, legacy_snapshot.js (BRIDGE_BASE=:8108), stopped, RESTORED (always), started, setup gate. The snapshot is kept, keyed by the zip's
//   sha256 (~/.cache/capex_film/wtd_pack/legacy_snapshot_<sha16>.json), so a break run reuses it (WTPD_LEGACY=cache is implied).
// Break switches (each MUST FAIL): WTPD_BREAK=legacyshift (one phase StartDate +1 day in the SERVED snapshot: D3) | twinplan (+1 on one project's PlannedAmt in the SERVED twin DB: D2)
// Run: node capex/tests/witness_td_pack_dash.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WTPD_BREAK || '', LEGACY = BREAK ? 'cache' : (process.env.WTPD_LEGACY || 'run');
const ZIP = process.env.WTPD_ZIP || fs.readdirSync(path.join(REPO, 'capex/plugin/testdata_2pack')).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(REPO, 'capex/plugin/testdata_2pack', f)).pop();
const HOME = os.homedir(), INST = path.join(HOME, 'idempiere-bimdoc'), DB = 'idempiere_bimdoc', BAK = 'idempiere_bimdoc_wtpdbak', CACHE = path.join(HOME, '.cache/capex_film/wtd_pack');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
let fails = 0, judged = 0;
const say = s => console.log(s);
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; say('§WTPD ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; say('§WTPD ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + ' ' + JSON.stringify(info).slice(0, cond ? 600 : 2000)); };
const pg = (sql, su) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', su ? 'postgres' : 'adempiere', '-d', su ? 'postgres' : DB, '-At', '-v', 'ON_ERROR_STOP=1'], { input: (su ? '' : 'set search_path=adempiere;\n') + sql + ';\n', encoding: 'utf8' }).split('\n').filter(l => l && l !== 'SET');
const waitUp = () => execFileSync('bash', ['-c', 'for i in $(seq 1 72); do c=$(curl -s -o /dev/null -w %{http_code} http://localhost:8108/webui/ || true); [ "$c" = 200 ] || [ "$c" = 302 ] && exit 0; sleep 5; done; exit 1'], { timeout: 400000 });
const stop = () => { try { execFileSync(path.join(INST, 'stop.sh')); } catch (e) { /* not running */ } execFileSync('sleep', ['8']); };

// the zip, read independently: projects (Value by UUID), phases per project (name, start, end), planned per project
function readZip() {
  const xml = execFileSync('unzip', ['-p', ZIP, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 }), el = (b, n) => { const m = new RegExp('<' + n + '(?: [^>]*)?>([^<]*)</' + n + '>').exec(b); return m ? m[1] : null; };
  const prj = {}, phases = {}, planned = {};
  for (const m of xml.matchAll(/<C_Project type="table">([\s\S]*?)<\/C_Project>/g)) prj[el(m[1], 'C_Project_UU')] = el(m[1], 'Value');
  for (const m of xml.matchAll(/<C_ProjectPhase type="table">([\s\S]*?)<\/C_ProjectPhase>/g)) { const v = prj[el(m[1], 'C_Project_ID')]; (phases[v] = phases[v] || []).push({ name: el(m[1], 'Name'), start: (el(m[1], 'StartDate') || '').slice(0, 10) || null, end: (el(m[1], 'EndDate') || '').slice(0, 10) || null, seq: Number(el(m[1], 'SeqNo')) }); }
  for (const m of xml.matchAll(/<C_ProjectLine type="table">([\s\S]*?)<\/C_ProjectLine>/g)) { const v = prj[el(m[1], 'C_Project_ID')]; planned[v] = (planned[v] || 0) + Number(el(m[1], 'PlannedQty') || 0) * Number(el(m[1], 'PlannedPrice') || 0); }
  Object.keys(phases).forEach(v => phases[v].sort((a, b) => a.seq - b.seq));
  return { values: Object.values(prj).sort(), phases, planned };
}

function legacySnapshot(sha) {
  const file = path.join(CACHE, 'legacy_snapshot_' + sha.slice(0, 16) + '.json');
  if (LEGACY === 'cache') { if (!fs.existsSync(file)) throw new Error('no cached legacy snapshot for zip ' + sha.slice(0, 16) + ': run once without a break'); say('§WTPD legacy snapshot from the cache ' + file); return fs.readFileSync(file, 'utf8'); }
  fs.mkdirSync(CACHE, { recursive: true }); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtpd_pack_')); fs.copyFileSync(ZIP, path.join(dir, path.basename(ZIP)));
  let copied = false;
  try {
    stop();
    const conns = pg("SELECT count(*) FROM pg_stat_activity WHERE datname='" + DB + "'", true)[0]; if (conns !== '0') throw new Error(conns + ' connections on ' + DB + ' after stop');
    pg('DROP DATABASE IF EXISTS ' + BAK, true); pg('CREATE DATABASE ' + BAK + ' TEMPLATE ' + DB, true); copied = true;
    if (Number(pg("SELECT count(*) FROM c_project WHERE value LIKE 'TD\\_%'")[0])) throw new Error('TD projects already on the test instance: refusing (a left-over set)');
    fs.writeFileSync(path.join(CACHE, 'dash_legacy_packin.log'), execFileSync('./RUN_ApplyPackInFromFolder.sh', [dir], { cwd: path.join(INST, 'server/utils'), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 400000 }));
    say('§WTPD legacy packin ad_package_imp=' + JSON.stringify(pg("SELECT name || '|' || pk_status || '|' || ad_client_id FROM ad_package_imp WHERE name='" + path.basename(ZIP) + "'")) + ' td_projects=' + pg("SELECT count(*) FROM c_project WHERE value LIKE 'TD\\_%'")[0]);
    execFileSync('sh', ['-c', path.join(INST, 'start.sh')]); waitUp(); execFileSync('sleep', ['20']);   // WS types are loaded at start
    const out = execFileSync('node', [path.join(REPO, 'capex/tools/legacy_snapshot.js'), file], { env: Object.assign({}, process.env, { BRIDGE_BASE: 'http://localhost:8108' }), encoding: 'utf8', timeout: 300000 });
    say('§WTPD legacy ' + out.trim().split('\n').filter(l => /§DASH_LEGACY_SNAPSHOT/.test(l)).join(' ').slice(0, 600));
  } finally {
    if (copied) { stop(); pg('DROP DATABASE ' + DB, true); pg('CREATE DATABASE ' + DB + ' TEMPLATE ' + BAK + ' OWNER adempiere', true); pg('DROP DATABASE ' + BAK, true); }
    const left = pg("SELECT count(*) FROM c_project WHERE value LIKE 'TD\\_%'")[0];
    execFileSync('sh', ['-c', path.join(INST, 'start.sh')]); say('§WTPD legacy restored=' + copied + ' td_projects_after_restore=' + left);
  }
  return fs.readFileSync(file, 'utf8');
}

async function twinDb(browser, base) {
  const page = await (await browser.newContext()).newPage(), LOG = []; page.on('console', m => LOG.push(m.text()));
  await page.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 });
  await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
  await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
  await page.waitForFunction(() => window.APP && window.APP.clientId != null && window.PluginEngine && window.PluginEngine.packInClient, null, { timeout: 60000 }); await page.waitForTimeout(1200);
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const A = window.APP, res = await window.PluginEngine.packInClient({ name: 'W-TD-PACK-DASH', bytes, clientId: A.clientId, orgId: A.orgId || 0, userId: A.actor, roleId: A.roleId, procId: 0 });
    const db = window.__idmpDb.export(); let s = ''; for (let i = 0; i < db.length; i += 0x8000) s += String.fromCharCode.apply(null, db.subarray(i, i + 0x8000));
    return { ok: res.ok, summary: res.summary, db: btoa(s) };
  }, fs.readFileSync(ZIP).toString('base64'));
  say('§WTPD twin packInClient ok=' + r.ok + ' summary=' + r.summary + ' ' + LOG.filter(l => /§PACKIN-CLIENT/.test(l)).map(l => l.slice(0, 200)).join(' '));
  await page.context().close();
  return Buffer.from(r.db, 'base64');
}

async function readDash(browser, url, values) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage(), errs = [], LOG = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200))); page.on('console', m => { LOG.push(m.text()); if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  // a failed resource is judged by its URL. The page's two OPTIONAL probes are not errors and are counted apart: the HEAD per project for a BIM model (capex/dash.js:381-382, absent = no BIM link) and the
  //   default legacy snapshot when the URL names none (capex/dash.js CFG.legacySnapshot, git-ignored: "§DASH_SOURCE legacy none")
  const probes = [];
  page.on('response', r => { if (r.status() < 400) return; const u = r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0], m = r.request().method();
    if ((m === 'HEAD' && /^\/buildings\/[^/]+_extracted\.db$/.test(u)) || (u === '/capex/legacy_snapshot.json' && !/[?&]snapshot=/.test(url))) probes.push(m + ' ' + u); else errs.push('HTTP ' + r.status() + ' ' + m + ' ' + u); });
  await page.goto(url + '#budget', { waitUntil: 'networkidle' }); await page.waitForSelector('table[data-tile="budget"] tr[data-project]', { timeout: 60000 }); await page.waitForTimeout(500);
  const num = t => { t = String(t || '').trim(); return (t === '' || t === '—') ? null : Number(t.replace(/,/g, '')); };
  const rows = await page.$$eval('table[data-tile="budget"] tr[data-project]', trs => trs.map(tr => ({ id: tr.getAttribute('data-project'), cells: [...tr.children].map(td => td.textContent.trim()) })));
  const budget = {}; rows.forEach(r => { budget[r.cells[0]] = { id: r.id, cur: r.cells[1], planned: num(r.cells[2]), committed: num(r.cells[3]), invoiced: num(r.cells[4]), actual: num(r.cells[5]) }; });
  const sched = {};
  for (const v of values) { const b = budget[v]; if (!b) continue;
    await page.evaluate(id => { location.hash = '#project/' + id + '/schedule'; }, b.id);
    await page.waitForSelector('#phTable tbody tr', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(250);
    sched[v] = await page.$$eval('#phTable tbody tr', trs => trs.map(tr => [...tr.children].slice(0, 3).map(td => td.textContent.trim()))).catch(() => []); }
  await page.context().close();
  return { budget, sched, errs, probes, src: LOG.filter(l => /§DASH_PROJSEL|§DASH_SOURCE/.test(l)).slice(0, 2) };
}

(async () => {
  let server, browser;
  try {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex'), Z = readZip();
    say('§WTPD zip=' + path.relative(REPO, ZIP) + ' sha256=' + sha.slice(0, 16) + ' projects=' + Z.values.length + ' phases=' + Object.values(Z.phases).reduce((a, p) => a + p.length, 0) + ' break=' + (BREAK || 'none') + ' legacy=' + LEGACY);
    let snap = legacySnapshot(sha);
    if (BREAK === 'legacyshift') { const j = JSON.parse(snap), tdIds = new Set((j.projects || []).filter(p => /^TD_/.test(p.Value)).map(p => String(p.C_Project_ID))), ph = (j.phases || []).filter(p => tdIds.has(String(p.C_Project_ID)) && p.StartDate)[0];
      if (ph) { const d = new Date(Date.parse(String(ph.StartDate).slice(0, 10) + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10); say('§WTPD break legacyshift phase ' + ph.Name + ' ' + ph.StartDate + ' -> ' + d); ph.StartDate = d + String(ph.StartDate).slice(10); }
      else say('§WTPD break legacyshift found no TD phase in the snapshot (keys: ' + Object.keys(j).join(',') + ')');
      snap = JSON.stringify(j); }
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    let twin = Buffer.alloc(0);
    server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/__twin.db') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(twin); }
      if (u === '/__legacy.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(snap); }
      const fp = path.join(REPO, u); fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
    await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port;
    twin = await twinDb(browser, base);
    if (BREAK === 'twinplan') { const initSqlJs = require('sql.js'), SQL = await initSqlJs(), d = new SQL.Database(twin); d.run("UPDATE c_project SET plannedamt = plannedamt + 1 WHERE value=?", [Z.values[0]]); twin = Buffer.from(d.export()); say('§WTPD break twinplan +1 on ' + Z.values[0] + ' in the served twin DB'); }
    const A = await readDash(browser, base + '/capex/index.html?db=/__twin.db', Z.values), B = await readDash(browser, base + '/capex/index.html?snapshot=/__legacy.json&source=legacy', Z.values);
    say('§WTPD sources twin=' + JSON.stringify(A.src) + ' legacy=' + JSON.stringify(B.src));
    // D1
    const inA = Z.values.filter(v => A.budget[v]), inB = Z.values.filter(v => B.budget[v]);
    if (!Z.values.length) verdict('D1', 'projects in the zip', false, {}, true);
    else verdict('D1', 'the Budget view lists the zip\'s ' + Z.values.length + ' projects on both sides', inA.length === Z.values.length && inB.length === Z.values.length, { twin: inA.length, legacy: inB.length, missingTwin: Z.values.filter(v => !A.budget[v]), missingLegacy: Z.values.filter(v => !B.budget[v]) });
    // D2
    const d2 = [], r2 = (x) => x == null ? null : Math.round(x * 100) / 100; let n2 = 0;
    Z.values.forEach(v => { const a = A.budget[v], b = B.budget[v]; if (!a || !b) return; n2++;
      ['cur', 'planned', 'committed', 'invoiced', 'actual'].forEach(k => { if (String(a[k]) !== String(b[k])) d2.push(v + ' ' + k + ' twin=' + a[k] + ' legacy=' + b[k]); });
      if (r2(a.planned) !== r2(Z.planned[v])) d2.push(v + ' planned twin=' + a.planned + ' zip=' + r2(Z.planned[v]));
      ['committed', 'invoiced', 'actual'].forEach(k => { if (a[k] !== 0) d2.push(v + ' ' + k + ' twin=' + a[k] + ' (want 0: no document yet)'); }); });
    if (!n2) verdict('D2', 'budget rows', false, {}, true);
    else verdict('D2', 'per project the Budget row is equal on both sides, Planned == the zip\'s lines, Committed/Invoiced/Actual 0 (' + n2 + ' projects)', d2.length === 0, { diffs: d2.length, first: d2.slice(0, 10), sample: { twin: A.budget[Z.values[0]], legacy: B.budget[Z.values[0]], zipPlanned: r2(Z.planned[Z.values[0]]) } });
    // D3
    const d3 = []; let n3 = 0;
    Z.values.forEach(v => { const want = (Z.phases[v] || []).map(p => [p.name, p.start, p.end]); [['twin', A.sched[v] || []], ['legacy', B.sched[v] || []]].forEach(([side, got]) => { n3 += got.length;
      const g = got.map(c => [c[0], (c[1] || '').slice(0, 10) || null, (c[2] || '').slice(0, 10) || null]);
      if (JSON.stringify(g) !== JSON.stringify(want)) d3.push(v + ' ' + side + ' got=' + JSON.stringify(g).slice(0, 200) + ' want=' + JSON.stringify(want).slice(0, 200)); }); });
    if (!n3) verdict('D3', 'schedule rows', false, { sample: A.sched[Z.values[0]] }, true);
    else verdict('D3', 'per project the Schedule tab lists the zip\'s phases and dates on both sides (' + n3 + ' phase rows)', d3.length === 0, { diffs: d3.length, first: d3.slice(0, 6) });
    verdict('D4', 'no page error and no failed resource on either side (the page\'s optional probes counted apart: twin ' + A.probes.length + ', legacy ' + B.probes.length + ')', !A.errs.length && !B.errs.length, { twin: A.errs.slice(0, 3), legacy: B.errs.slice(0, 3), probes: { twin: A.probes.slice(0, 3), legacy: B.probes.slice(0, 3) } });
  } catch (e) { fails++; say('§WTPD FATAL ' + String(e.stack || e).slice(0, 1500)); }
  finally { if (browser) await browser.close(); if (server) server.close(); }
  if (LEGACY === 'run') { try { waitUp(); const g = execFileSync('bash', [path.join(REPO, 'capex/legacy/test_instance/setup_test_instance.sh'), '--check'], { encoding: 'utf8', timeout: 400000 }); say('§WTPD after restore: ' + ((g.match(/§SETUP_VERDICT.*/) || ['no verdict'])[0])); } catch (e) { fails++; say('§WTPD after restore: setup gate FAILED ' + String(e.stdout || e.message).slice(-400)); } }
  say('§WTPD VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fail=' + fails + ' break=' + (BREAK || 'none'));
  process.exit(fails ? 1 : 0);
})();
