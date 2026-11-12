// ⚠ DO NOT REMOVE — Scope guard
// W-BIMDOC — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC .. §BIMDOC-5, §BIMDOC-FILM, §BIMDOC-BUILD. Real page, headless Chromium, SOFTWARE rendering only (--disable-gpu, no GPU).
//   READ erp/tests/witness_bimdoc_live.log (verdicts + the film evidence) and witness_bimdoc_live.page.log (every page line) after EVERY run; an exit code is not evidence.
// THE ISSUES this proves or disproves (each arm names its denominator; N is always read from the page's own dictionary, never a hand list):
//   A-1 RENDER   of the N displayed AD fields of the BIM Document tab (AD_Field rows), how many draw a control on the New form? And does the Project window carry the BIM Document sub-tab under Project Task?
//   A-2 ROUNDTRIP a document is entered in the window, saved, the page RELOADED from the signed op-log: of the N displayed columns, how many read back equal?
//   B-1 FSM      of the N = (states of the status list) x (actions of the Document Action list) pairs, how many are legal/illegal exactly as §BIMDOC-3 rules (DR: Issue-for-review, Issue-for-construction;
//                IP: Issue-for-construction; Issued/Superseded: nothing), through the common AdDocFsm (no second engine)?
//   B-2 UI       the transitions DRIVEN through the document-action bar (button click -> signed op -> reload): Draft -> Issued for review -> Issued for construction persist; the bar at each state offers exactly the legal set.
//   C-1 SUPERSEDE completing a newer revision of the same deliverable sets the older row to Superseded (RE), linked by Reversal_ID, persisted; a deliverable with one revision is untouched.
//   D-1 PROGRESS computed progress per task and per phase (issued/total, pct, budget, earned hours) equals a HAND COUNT of the fixture, through the module AND through the task/phase GRIDS
//                (virtual ColumnSQL columns, §BIMDOC-ADPASS: G-2); nothing is stored (every BIM_ column on C_ProjectTask/C_ProjectPhase carries ColumnSQL, no physical column).
//   G-1 GEAR    "Open in Modeller / Viewer" is an AD_Process under the gear (Button column, IsToolbarButton Y): the gear lists it, the click logs §AD-TBB ... via=gear and the process result is OK.
//   G-3 GRID    the BIM Document grid draws X of N columns, N = the dictionary's IsDisplayedGrid='Y' fields of that tab (own window and the Project sub-tab); the first row's cells are not blank.
//   G-4 NOLENS  no lens named bimdoc is registered and no [data-lens-action^="bimdoc:"] is on screen (the side door is deleted).
//   G-5 VIRTUAL a task edited and saved commits an op whose columns carry no virtual (BIM_) column.
//   E-1 SUBTAB  the Project window shows the project's deliverables under the task (sub-tab rows == hand count) and a document created THERE takes project, phase and task from its parent.
//   F-1 ATTACH  the original file goes on the row through the generic Attachment dialog (sha256 logged == node's).
//   R-1 RED     an illegal transition is refused (Superseded -> Issue-for-construction): the bar offers nothing AND the FSM says no; the judge fed the opposite says FAIL.
//   R-2 RED     completing an OLDER revision when a newer one is already Issued for construction is refused by the DocAction class, status unchanged.
//   R-3 RED     the progress judge fed a wrong hand count says FAIL.
//   S-1 STORE   a 20 MB file attached through the generic dialog goes to the shared file store (ad_attachment row = Title 'fs' + index of name/size/sha256, NO bytes), reads back with sha256 == node's, and again after a reload.
//   O-1 OPEN    the "Open in Modeller / Viewer" action on the BIM Document: the URL is exactly <app>?open=store:<sha256>&name=<file>, and the TARGET APP's own log (§FILESTORE-OPEN) shows the same sha256 opened.
//   R-4 RED     the file-kind DATA row (AD_Ref_List 'BIM File Kind' DXF) removed -> the Open action is refused (no popup, §BIMDOC-OPEN REFUSED); restored -> it opens again.
//   R-5 RED     a store entry altered in OPFS -> the app refuses it (§FILESTORE-OPEN REFUSED reason=mismatch), no success line.
//   R-6 RED     two rows share one hash: deleting one attachment keeps the bytes (sweep kept>=1 removed=0), deleting the last one removes them (so the first keep is not vacuous).
//   H-1 HOURS   time lines booked on the task: the task grid's BIM_HoursBooked (§AD-VIRTUAL) equals the hand-counted total.   X-1 CHAIN  issuing a deliverable moves the project's issued count by one (§BIMDOC-CHAIN before/after, hand count).
//   FILM        the §BIMDOC-FILM evidence lines in order; beats 1 and 9 are NOT BUILT in the kernel (named with file:line), never faked.
// Verdict per arm: PASS | FAIL | INCONCLUSIVE(reason). INCONCLUSIVE when N is 0 (nothing judged). Overall exit 0 only if no FAIL and no INCONCLUSIVE among the built arms.
// Run: NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_bimdoc_live.js
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const REPO = path.join(__dirname, '..', '..');
const LOGF = path.join(__dirname, 'witness_bimdoc_live.log'), PAGELOGF = path.join(__dirname, 'witness_bimdoc_live.page.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.zip': 'application/zip', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf); }); });
const OUT = [], PAGELOG = []; const say = s => { OUT.push(s); console.log(s); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VERD = []; const verdict = (arm, v, why) => { VERD.push({ arm, v }); say('§W-BIMDOC-VERDICT ' + arm + ' ' + v + (why ? ' — ' + why : '')); };

// ── the fixture, and its HAND COUNT (written here, by hand, independent of the module under test) ──
//   task Plans (phase Concept):    A-101 hours 8 -> Issued for construction ; A-102 hours 6 -> Issued for review ; A-103 hours 10 -> Draft
//   task Sections (phase Concept): A-201 rev 1 hours 12 -> Issued for construction, then rev 2 hours 14 -> Issued for construction (rev 1 becomes Superseded)
//   task Details (phase Drawing):  A-301 hours 4 -> Draft (created in the Project window's sub-tab)
const FIX = {
  project: 'Duplex Sheet Set', phases: ['Concept', 'Construction Drawings'], tasks: [['Plans', 0], ['Sections', 0], ['Details', 1]],
  docs: [['A-101', 1, 'Duplex ground floor plan', 'ARC', 'DXF', 8, 'Plans', 'CO'], ['A-102', 1, 'Duplex first floor plan', 'ARC', 'DXF', 6, 'Plans', 'IP'], ['A-103', 1, 'Duplex roof plan', 'ARC', 'DXF', 10, 'Plans', 'DR'],
    ['A-201', 1, 'Duplex section AA', 'STR', 'IFC', 12, 'Sections', 'CO'], ['A-201', 2, 'Duplex section AA (revised)', 'STR', 'IFC', 14, 'Sections', 'CO']]
};
const HAND = {                       // by hand: a deliverable = (project, number); state = its latest revision; Superseded rows are not deliverables
  task: { Plans: { total: 3, issued: 1, pct: 33.3, budget: 24, earned: 8 }, Sections: { total: 1, issued: 1, pct: 100, budget: 14, earned: 14 }, Details: { total: 1, issued: 0, pct: 0, budget: 4, earned: 0 } },
  phase: { Concept: { total: 4, issued: 2, pct: 50, budget: 38, earned: 22 }, 'Construction Drawings': { total: 1, issued: 0, pct: 0, budget: 4, earned: 0 } }
};
const EXPECT_LEGAL = { DR: { PR: 'IP', CO: 'CO' }, IP: { CO: 'CO' }, CO: {}, RE: {} };   // §BIMDOC-3
const judgeCount = (got, want) => (got && want && ['total', 'issued', 'budget', 'earned'].every(k => Number(got[k]) === want[k]) && Math.abs(Number(got.pct) - want.pct) < 0.05) ? 'PASS' : 'FAIL';
const judgePair = (offered, to, want) => (want ? (offered && to === want) : !offered) ? 'PASS' : 'FAIL';
const BIG = crypto.randomBytes(20 * 1024 * 1024), BIG_SHA = sha(BIG);   // the 20 MB fixture (synthetic, above the 16 MB DB cap)
const DXF = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nWALLS\n10\n0.0\n20\n0.0\n11\n9.0\n21\n0.0\n0\nENDSEC\n0\nEOF\n');   // a synthetic one-line DXF (no private set)

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-compositing'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', d => d.dismiss().catch(() => {}));
  const mark = () => PAGELOG.length;
  const APPLOG = []; ctx.on('page', p => { if (p === page) return; p.on('console', m => { APPLOG.push(m.text()); PAGELOG.push('[app] ' + m.text()); }); p.on('pageerror', e => APPLOG.push('PAGEERR ' + e)); });
  const appSince = (n, re) => APPLOG.slice(n).filter(l => re.test(l));
  const since = (n, re) => PAGELOG.slice(n).filter(l => re.test(l));
  async function boot(suffix) {
    for (let g = 0; g < 3; g++) { try { await page.goto('about:blank'); await page.goto(base + '?login=GardenAdmin' + (suffix || ''), { waitUntil: 'load' }); break; } catch (e) { if (g === 2) throw e; await sleep(1500); } }
    await page.waitForFunction(() => window.__idmpDb && window.PluginEngine && window.PluginEngine._reg && (() => { const R = window.PluginEngine._reg(); const x = R && R.get('org.kernel.bim-document'); return x && x.state === 'ACTIVE'; })(), null, { timeout: 45000 });
    if (suffix && /window=/.test(suffix)) await page.waitForFunction(() => document.querySelector('#idmp-toolbar button[data-tb="new"]') && window.IdmpGridTab, null, { timeout: 40000 });
    await sleep(1500);
  }
  const rd = sql => page.evaluate(s => window.__tipRead.rows(s), sql);       // THE reader: base + signed tip
  const dq = sql => page.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);   // the dictionary as the page holds it
  const snap = () => page.evaluate(() => window.IdmpGridTab.snapshot());
  const setv = (col, v) => page.evaluate(([c, v]) => { const e = document.querySelector('#idmp-inline-mount select[data-col="' + c + '"], #idmp-inline-mount input[data-col="' + c + '"]'); if (!e) return 'nofield';
    e.value = String(v); if (e.tagName !== 'SELECT') { e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); } return e.value; }, [col, v]);   // no change event on a picker: its dependents refilter and empty a key the picker does not list yet

  const tabClick = async name => { await page.evaluate(n => { const t = [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].find(x => x.textContent.trim() === n); if (t) t.click(); }, name); await sleep(1500); };
  // the gear (ProcessButtonPopup): open it, list its items, click one by its component (the Button column name)
  async function gearRun(comp, waitPopup) {
    const on = await page.$eval('#idmp-toolbar [data-tb="process"]', e => !e.disabled).catch(() => false);
    if (!on) return { on: false, items: [] };
    await page.click('#idmp-toolbar [data-tb="process"]'); await page.waitForSelector('#idmp-proc-ov', { timeout: 8000 }).catch(() => {});
    const items = await page.evaluate(() => [...document.querySelectorAll('#idmp-proc-ov [data-tbb]')].map(b => ({ comp: b.getAttribute('data-tbb'), pid: b.getAttribute('data-tbb-process'), label: b.textContent.trim(), disabled: b.disabled })));
    const it = items.find(x => x.comp === comp);
    if (!it || it.disabled) { await page.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); }); return { on: true, items, item: it || null }; }
    const [popup] = await Promise.all([waitPopup ? page.waitForEvent('popup', { timeout: waitPopup }).catch(() => null) : Promise.resolve(null), page.click('#idmp-proc-ov [data-tbb="' + comp + '"]')]);
    for (let i = 0; i < 60 && !(await page.$('#idmp-procdlg .idmp-procresult')); i++) await sleep(250);
    const res = await page.evaluate(() => { const r = document.querySelector('#idmp-procdlg .idmp-procresult'); return r ? { chip: (r.querySelector('.ok-chip') || {}).textContent, msg: (r.querySelector('.msg') || {}).textContent } : null; });
    await page.click('[data-procdlg-ok]').catch(() => {}); await sleep(500);
    return { on: true, items, item: it, popup, res };
  }
  // the virtual column values a tab load computed (§AD-VIRTUAL, idempiere.html _fillVirtual): { key: value } of the LAST such line since n0
  const virt = (n0, table, col) => { const l = since(n0, new RegExp('^§AD-VIRTUAL tab=\\d+ table=' + table + ' col=' + col + ' rows=')).pop(); if (!l) return null;
    const m = / values=\[(.*)\]$/.exec(l), o = {}; (m ? m[1] : '').split(',').filter(Boolean).forEach(kv => { const i = kv.lastIndexOf(':'); o[kv.slice(0, i)] = kv.slice(i + 1); }); return o; };

  // ════════ population N, from the page's own dictionary ════════
  await boot();
  const T_ID = Number((await dq("SELECT AD_Table_ID FROM AD_Table WHERE TableName='BIM_Document' AND IsActive='Y'"))[0]?.[0] || 0);
  const W_ID = Number((await dq("SELECT AD_Window_ID FROM AD_Table WHERE AD_Table_ID=" + T_ID))[0]?.[0] || 0);
  const TABS = await dq("SELECT t.AD_Tab_ID, t.AD_Window_ID, t.Name, t.TabLevel FROM AD_Tab t WHERE t.AD_Table_ID=" + T_ID + " AND t.IsActive='Y' ORDER BY t.AD_Window_ID");
  const OWN_TAB = TABS.find(t => Number(t[1]) === W_ID), PRJ_TAB = TABS.find(t => Number(t[1]) !== W_ID && Number(t[3]) === 3), PRJ1_TAB = TABS.find(t => Number(t[1]) !== W_ID && Number(t[3]) === 1);
  const FIELDS = OWN_TAB ? await dq("SELECT c.ColumnName, f.IsReadOnly, c.AD_Reference_ID FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=" + OWN_TAB[0] + " AND f.IsActive='Y' AND f.IsDisplayed='Y' ORDER BY f.SeqNo") : [];
  const STATUSES = (await dq("SELECT l.Value FROM AD_Ref_List l JOIN AD_Column c ON c.AD_Reference_Value_ID=l.AD_Reference_ID WHERE c.AD_Table_ID=" + T_ID + " AND c.ColumnName='DocStatus' AND l.IsActive='Y' ORDER BY l.AD_Ref_List_ID")).map(r => r[0]);
  const ACTIONS = (await dq("SELECT Value FROM AD_Ref_List WHERE AD_Reference_ID=135 AND IsActive='Y' ORDER BY AD_Ref_List_ID")).map(r => r[0]);
  const PROJ_WIN = Number(PRJ_TAB ? PRJ_TAB[1] : 0);
  say('§W-BIMDOC population table=' + T_ID + ' window=' + W_ID + ' tabs=' + TABS.length + ' fields(N)=' + FIELDS.length + ' statuses=[' + STATUSES + '] actions=' + ACTIONS.length + ' projectWindow=' + PROJ_WIN + ' (from the page dictionary)');
  if (!T_ID) { verdict('population', 'INCONCLUSIVE', 'BIM_Document is not in the dictionary: the plugin did not start'); return finish(); }

  // ════════ fixture: project, phases, tasks (set-up through the signed CRUD lane; the project path itself is not under test) ════════
  const mkOp = (t, f) => ({ key: t, table: t, verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: f, stdDefaults: null });
  const commitOps = ops => page.evaluate(o => new Promise(res => { const A = window.APP || {}, std = { actor: A.actor, clientId: A.clientId, orgId: A.orgId || 0 }; o.forEach(x => { if (x.stdDefaults === null) x.stdDefaults = std; }); window.__crud.applyOpGroup(o, r => res(r)); }), ops);
  // the two projects: the sheet-set project (billable: partner, warehouse, price list version of the public GardenWorld seed) and a non-Service one (red control)
  const BILL = { c_bpartner_id: 117, c_bpartner_location_id: 112, m_warehouse_id: 103, m_pricelist_version_id: 104, c_currency_id: 100 };
  const fxp = await commitOps([mkOp('c_project', Object.assign({ value: 'DUPLEX-SHEETS', name: FIX.project, isactive: 'Y' }, BILL)), mkOp('c_project', Object.assign({ value: 'DUPLEX-GENERAL', name: 'Duplex General Project', isactive: 'Y' }, BILL))]);
  await sleep(1200);
  const PRJ = (await rd("SELECT c_project_id FROM c_project WHERE name='" + FIX.project + "'"))[0], PRJ2 = (await rd("SELECT c_project_id FROM c_project WHERE name='Duplex General Project'"))[0];

  // ════════ B-1 beat 1: a project from its type. ProjectSetType (AD_Process 215) driven from the Project window's button; the hand count is read from the dictionary's own C_Phase/C_Task rows ════════
  async function runSetType(projId, typeId) {
    await boot('&window=130'); await selectRow(projId); await sleep(800);
    const n0 = mark(); const btn = await page.$('[data-proc-btn="C_ProjectType_ID"]'); if (!btn) return { noButton: true, lines: [] };
    await btn.click(); await page.waitForSelector('[data-proc-param="C_ProjectType_ID"]', { timeout: 15000 });
    await setProc('C_ProjectType_ID', typeId); await page.click('[data-proc-run]');
    for (let i = 0; i < 60 && !(await page.$('#idmp-procdlg .idmp-procresult')); i++) await sleep(250);
    await sleep(1500);
    const res = await page.evaluate(() => { const r = document.querySelector('#idmp-procdlg .idmp-procresult'); return r ? { chip: (r.querySelector('.ok-chip') || {}).textContent, msg: (r.querySelector('.msg') || {}).textContent } : null; });
    await page.click('[data-procdlg-ok]').catch(() => {}); await sleep(800);
    return { res, lines: since(n0, /^§PROJECT-SETTYPE /), all: since(n0, /./) };
  }
  const setProc = (col, v) => page.evaluate(([c, v]) => { const e = document.querySelector('[data-proc-param="' + c + '"]'); if (!e) return 'nofield'; if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === String(v))) { const o = document.createElement('option'); o.value = String(v); o.textContent = String(v); e.appendChild(o); }   /* the picker lists committed rows only; a row of this session is offered by its key */ e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); return e.value; }, [col, v]);
  const projRows = async id => ({ ph: (await rd("SELECT count(*) n FROM c_projectphase WHERE c_project_id=" + id))[0].n, tk: (await rd("SELECT count(*) n FROM c_projecttask WHERE c_projectphase_id IN (SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id=" + id + ")"))[0].n,
    p: (await rd("SELECT c_projecttype_id AS t, projectcategory AS c FROM c_project WHERE c_project_id=" + id))[0] });
  const TYPE_S = 101, TYPE_N = 102;
  {
    const hp = Number((await dq("SELECT count(*) FROM C_Phase WHERE C_ProjectType_ID=" + TYPE_S + " AND IsActive='Y'"))[0][0]), ht = Number((await dq("SELECT count(*) FROM C_Task WHERE IsActive='Y' AND C_Phase_ID IN (SELECT C_Phase_ID FROM C_Phase WHERE C_ProjectType_ID=" + TYPE_S + " AND IsActive='Y')"))[0][0]);
    const hn = Number((await dq("SELECT count(*) FROM C_Phase WHERE C_ProjectType_ID=" + TYPE_N + " AND IsActive='Y'"))[0][0]);
    const catS = (await dq("SELECT ProjectCategory FROM C_ProjectType WHERE C_ProjectType_ID=" + TYPE_S))[0]?.[0], catN = (await dq("SELECT ProjectCategory FROM C_ProjectType WHERE C_ProjectType_ID=" + TYPE_N))[0]?.[0];
    const fail = [];
    if (!PRJ || !PRJ2) { verdict('B-1 project from its type', 'INCONCLUSIVE', 'projects not readable back'); return finish(); }
    const before = await projRows(PRJ.c_project_id);
    const r1 = await runSetType(PRJ.c_project_id, TYPE_S), after = await projRows(PRJ.c_project_id);
    const line = r1.lines[0] || null;
    if (r1.noButton) fail.push('no Set Project Type button on the Project form');
    if (!line || !line.includes('phases=' + hp + ' tasks=' + ht) || !line.includes('category=' + catS)) fail.push('log line ' + line + ' vs hand phases=' + hp + ' tasks=' + ht + ' category=' + catS);
    if (Number(after.ph) !== Number(before.ph) + hp || Number(after.tk) !== Number(before.tk) + ht) fail.push('rows ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) + ' want +' + hp + '/+' + ht);
    if (!after.p || Number(after.p.t) !== TYPE_S || after.p.c !== catS) fail.push('project not typed: ' + JSON.stringify(after.p));
    say('§W-BIMDOC-SETTYPE ' + (line || 'no line') + ' | rows ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) + ' | ui=' + JSON.stringify(r1.res));
    verdict('B-1 project from its Service type', hp === 0 ? 'INCONCLUSIVE' : (fail.length ? 'FAIL' : 'PASS'), fail.length ? fail.join(' ; ') : 'phases=' + hp + ' tasks=' + ht + ' copied, category ' + catS + ' (hand count from C_Phase/C_Task)');
    // R-7 red: a project that already has a type is refused, nothing copied
    const r2 = await runSetType(PRJ.c_project_id, TYPE_S), after2 = await projRows(PRJ.c_project_id), rf = [];
    if (!r2.res || !/Failed/i.test(r2.res.chip || '') || !/already has Type/.test(r2.res.msg || '')) rf.push('not refused: ' + JSON.stringify(r2.res));
    if (Number(after2.ph) !== Number(after.ph) || Number(after2.tk) !== Number(after.tk)) rf.push('rows changed on a refused run ' + JSON.stringify(after2));
    verdict('R-7 red type already set is refused', rf.length ? 'FAIL' : 'PASS', rf.length ? rf.join(' ; ') : 'message "' + (r2.res && r2.res.msg) + '", rows unchanged');
    // R-8 red: a non-Service type copies nothing but still types the project
    const b3 = await projRows(PRJ2.c_project_id), r3 = await runSetType(PRJ2.c_project_id, TYPE_N), a3 = await projRows(PRJ2.c_project_id), l3 = r3.lines[0] || null, f3 = [];
    if (catN === 'S') f3.push('population: type ' + TYPE_N + ' is a Service type');
    if (!l3 || !l3.includes('phases=0 tasks=0') || !l3.includes('category=' + catN)) f3.push('log ' + l3);
    if (Number(a3.ph) !== Number(b3.ph) || Number(a3.tk) !== Number(b3.tk)) f3.push('rows copied for a non-Service type ' + JSON.stringify(a3) + ' (the type has ' + hn + ' phases)');
    if (!a3.p || Number(a3.p.t) !== TYPE_N) f3.push('project not typed ' + JSON.stringify(a3.p));
    verdict('R-8 red non-Service type copies no phases', hn === 0 ? 'INCONCLUSIVE' : (f3.length ? 'FAIL' : 'PASS'), f3.length ? f3.join(' ; ') : 'type ' + TYPE_N + ' (' + catN + ') has ' + hn + ' phases; project typed, 0 phases/0 tasks copied: ' + l3);
  }
  // the sheet-set's own stages (the firm's phases and tasks), on top of the copied ones
  const fx = await commitOps(FIX.phases.map((p, i) => mkOp('c_projectphase', { c_project_id: PRJ.c_project_id, name: p, seqno: 100 + (i + 1) * 10, isactive: 'Y', iscomplete: 'N' }))
    .concat(FIX.tasks.map(([t, pi], i) => mkOp('c_projecttask', { c_projectphase_id: { __opRef: pi }, name: t, seqno: (i + 1) * 10, isactive: 'Y' }))));
  await sleep(1200);
  const PH = {}, TK = {}, inFix = n => FIX.phases.indexOf(n) >= 0 || FIX.tasks.some(t => t[0] === n);
  (await rd("SELECT c_projectphase_id AS id, name FROM c_projectphase WHERE c_project_id=" + (PRJ ? PRJ.c_project_id : 0))).filter(r => FIX.phases.indexOf(r.name) >= 0).forEach(r => PH[r.name] = r.id);
  (await rd("SELECT c_projecttask_id AS id, name, c_projectphase_id AS ph FROM c_projecttask WHERE c_projectphase_id IN (" + Object.values(PH).concat([0]).join(',') + ")")).filter(r => FIX.tasks.some(t => t[0] === r.name)).forEach(r => TK[r.name] = { id: r.id, ph: r.ph });
  say('§W-BIMDOC fixture committed=' + (fx && fx.committed) + ' project=' + (PRJ && PRJ.c_project_id) + ' phases=' + JSON.stringify(PH) + ' tasks=' + JSON.stringify(Object.fromEntries(Object.entries(TK).map(([k, v]) => [k, v.id]))));
  if (!PRJ || Object.keys(PH).length !== FIX.phases.length || Object.keys(TK).length !== FIX.tasks.length) { verdict('fixture', 'INCONCLUSIVE', 'fixture rows not readable back'); return finish(); }

  // ════════ A-1 render: the New form ════════
  await boot('&window=' + W_ID);
  await page.click('#idmp-toolbar button[data-tb="new"]'); await sleep(2500);
  const drawn = await page.evaluate(cols => cols.map(c => !!document.querySelector('#idmp-inline-mount select[data-col="' + c.toLowerCase() + '"], #idmp-inline-mount input[data-col="' + c.toLowerCase() + '"], #idmp-inline-mount textarea[data-col="' + c.toLowerCase() + '"]')), FIELDS.map(f => f[0]));
  const BTN = FIELDS.map(f => Number(f[2]) === 28), missing = FIELDS.map(f => f[0]).filter((c, i) => !drawn[i] && !BTN[i]);   // a Button field (DocAction) is the document-action bar, judged on a saved record below
  const tabStrip = PRJ_TAB ? Number(PRJ_TAB[3]) : -1;
    say('§W-BIMDOC-RENDER X=' + (FIELDS.length - missing.length) + ' of N=' + FIELDS.length + ' fields drawn; missing=[' + missing + '] tabs=' + TABS.map(t => t[2] + '@win' + t[1] + '/level' + t[3]).join(','));

  // ════════ creating a document through the window (the user's path) ════════
  const ID = { };   // 'A-101/1' -> pk
  async function createDoc(d, viaWindow) {
    const [no, rev, title, disc, kind, hours, task] = d, key = no + '/' + rev, n0 = mark();
    if (viaWindow !== false) { await boot('&window=' + W_ID); await page.click('#idmp-toolbar button[data-tb="new"]'); await sleep(2200); }
    const vals = [['c_project_id', PRJ.c_project_id], ['c_projectphase_id', TK[task].ph], ['c_projecttask_id', TK[task].id], ['deliverableno', no], ['revision', rev], ['name', title], ['discipline', disc], ['filekind', kind], ['hoursbudget', hours]];
    for (const [c, v] of vals) { const got = await setv(c, v); if (got === 'nofield') say('§W-BIMDOC createDoc field ' + c + ' not on the form'); await sleep(250); }
    await sleep(500); await page.click('#idmp-toolbar button[data-tb="save"]');
    for (let i = 0; i < 40 && !since(n0, /^§CRUD-GROUP-PERSIST|^§CRUD persist|committed key=bim_document/).length; i++) await sleep(250);
    await sleep(1200);
    const r = (await rd("SELECT bim_document_id FROM bim_document WHERE deliverableno='" + no + "' AND revision=" + rev + " AND name='" + title.replace(/'/g, "''") + "'"))[0];
    ID[key] = r ? r.bim_document_id : null; return ID[key];
  }
  // a document created this session has a synthetic (negative) key, which ?record= does not carry: select the row in the grid the way a user does, then open its form
  async function selectRow(id) {
    for (let k = 0; k < 2; k++) { if (await page.$('tr[data-ad-record="' + id + '"]')) break; await page.click('#idmp-toolbar button[data-tb="toggle"]').catch(() => {}); await sleep(900); }   // form view -> grid view
    await page.evaluate(i => { const tr = document.querySelector('tr[data-ad-record="' + i + '"]'); const c = tr && tr.querySelector('.idmp-rowind'); if (c) c.click(); }, id); await sleep(900);
    for (let k = 0; k < 3; k++) { const has = await page.$('.idmp-docfsm, #idmp-inline-mount .cfrow'); if (has && (await snap()).currentKey == id) break;
      await page.evaluate(i => { const tr = document.querySelector('tr[data-ad-record="' + i + '"]'); const c = tr && tr.querySelector('.idmp-rowind'); if (c) c.click(); }, id); await sleep(1200); }
    return (await snap()).currentKey;
  }
  async function openDoc(key) { await boot('&window=' + W_ID); const cur = await selectRow(ID[key]); if (String(cur) !== String(ID[key])) say('§W-BIMDOC openDoc ' + key + ' wanted=' + ID[key] + ' current=' + cur); await sleep(800); }
  const barActs = () => page.evaluate(() => [...document.querySelectorAll('.idmp-docfsm [data-doc-action]')].map(b => b.getAttribute('data-doc-action')));
  const chip = () => page.evaluate(() => (document.querySelector('.idmp-docfsm .chip') || {}).textContent || null);
  const status = async key => ((await rd("SELECT docstatus, reversal_id, processed FROM bim_document WHERE bim_document_id=" + ID[key]))[0]) || null;
  async function act(key, a) {
    await openDoc(key); const n0 = mark(); const bar = await barActs();
    if (bar.indexOf(a) < 0) return { ok: false, bar, why: 'not offered' };
    await page.click('.idmp-docfsm [data-doc-action="' + a + '"]');
    for (let i = 0; i < 60 && !since(n0, /^§CRUD process committed key=bim_document|REFUSED by the model|PROCESS BIM/).length; i++) await sleep(250);
    await sleep(1200); return { ok: true, bar, lines: since(n0, /./) };
  }

  // A-2 round trip: the first deliverable is entered with EVERY field, then read back after a reload from the op-log
  const openDoc2 = async id => { await boot('&window=' + W_ID); await selectRow(id); await sleep(800); };
  const first = FIX.docs[0], idA = await createDoc(first);
  await openDoc2(idA);
  const row = (await rd("SELECT * FROM bim_document WHERE bim_document_id=" + idA))[0] || {};
  const want = { c_project_id: PRJ.c_project_id, c_projectphase_id: TK.Plans.ph, c_projecttask_id: TK.Plans.id, deliverableno: 'A-101', revision: 1, name: first[2], discipline: 'ARC', filekind: 'DXF', hoursbudget: 8, docstatus: 'DR', docaction: 'CO', processed: 'N' };
  const rtBad = FIELDS.map(f => f[0].toLowerCase()).filter(c => c in want && String(row[c]) !== String(want[c]));
  const rtN = FIELDS.map(f => f[0].toLowerCase()).filter(c => c in want).length;
  say('§W-BIMDOC-ROUNDTRIP id=' + idA + ' X=' + (rtN - rtBad.length) + ' of N=' + rtN + ' columns equal after reload; unequal=' + JSON.stringify(rtBad.map(c => [c, row[c], want[c]])) + ' doctype=' + row.c_doctype_id);
  verdict('A-2 roundtrip', rtN === 0 || !idA ? 'INCONCLUSIVE' : (rtBad.length === 0 && Number(row.c_doctype_id) > 0 ? 'PASS' : 'FAIL'), 'X=' + (rtN - rtBad.length) + ' of N=' + rtN + (idA ? '' : ' (no id)'));

  { const bar = await barActs(); const nBtn = BTN.filter(Boolean).length, X = FIELDS.length - missing.length - (bar.length ? 0 : nBtn);
    verdict('A-1 render', FIELDS.length === 0 ? 'INCONCLUSIVE' : (missing.length === 0 && bar.length > 0 && TABS.length === 3 && tabStrip === 3 ? 'PASS' : 'FAIL'),
      'X=' + X + ' of N=' + FIELDS.length + ' displayed fields drawn (' + nBtn + ' Button field = document-action bar offering [' + bar + ']); missing=[' + missing + ']; sub-tab level ' + tabStrip + ' in window ' + PROJ_WIN); }
  // the rest of the fixture, all in Draft
  for (const d of FIX.docs.slice(1)) await createDoc(d);
  say('§W-BIMDOC fixture-docs ids=' + JSON.stringify(ID));

  // D-0 / beat 2: the register (deliverables per task) is the Task grid's virtual BIM_Deliverables column, before anything is issued; the register itself is the BIM Document grid (G-3)
  {
    const n0 = mark(); await boot('&window=' + PROJ_WIN); await selectRow(PRJ.c_project_id); await tabClick('Phase'); await selectRow(PH[FIX.phases[0]]); await tabClick('Task');
    const v = virt(n0, 'C_ProjectTask', 'BIM_Deliverables') || {};
    say('§W-BIMDOC register task-grid BIM_Deliverables=' + JSON.stringify(v) + ' (hand: Plans 3, Sections 1)');
    const fail = []; if (String(v[TK.Plans.id]) !== '3') fail.push('Plans ' + v[TK.Plans.id] + ' want 3'); if (String(v[TK.Sections.id]) !== '1') fail.push('Sections ' + v[TK.Sections.id] + ' want 1');
    verdict('D-0 register per task (grid)', Object.keys(v).length === 0 ? 'INCONCLUSIVE' : (fail.length ? 'FAIL' : 'PASS'), fail.length ? fail.join(' ; ') : 'task grid BIM_Deliverables Plans=3 Sections=1 equal to the hand count');
  }
  // G-3: the register grid draws the dictionary's IsDisplayedGrid fields, and a row's cells are not blank (FB2)
  {
    const fail = [], notes = [];
    for (const [tabRow, win, nav] of [[OWN_TAB, W_ID, null], [PRJ_TAB, PROJ_WIN, 'sub']]) {
      const want = (await dq("SELECT c.ColumnName FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=" + tabRow[0] + " AND f.IsActive='Y' AND f.IsDisplayed='Y' AND f.IsDisplayedGrid='Y' ORDER BY f.SeqNoGrid")).map(r => r[0]);
      if (nav) { await boot('&window=' + win); await selectRow(PRJ.c_project_id); await tabClick('Phase'); await selectRow(PH[FIX.phases[0]]); await tabClick('Task'); await selectRow(TK.Plans.id); await tabClick('BIM Document'); }
      else await boot('&window=' + win);
      for (let k = 0; k < 2 && !(await page.$('#idmp-content table thead th[data-ad-col]')); k++) { await page.click('#idmp-toolbar button[data-tb="toggle"]').catch(() => {}); await sleep(900); }
      const th = await page.evaluate(() => [...document.querySelectorAll('#idmp-content table thead th[data-ad-col]')].map(e => e.getAttribute('data-ad-col')));
      const cells = await page.evaluate(() => { const tr = document.querySelector('#idmp-content table tbody tr[data-ad-record]'); return tr ? [...tr.querySelectorAll('td')].map(td => td.textContent.trim()) : []; });
      const X = want.filter(c => th.indexOf(c) >= 0).length, filled = cells.filter(c => c !== '').length, nm = nav ? 'sub-tab' : 'own';
      notes.push(nm + ' X=' + X + ' of N=' + want.length + ' th=[' + th + '] filled=' + filled);
      if (want.length === 0) fail.push(nm + ': no IsDisplayedGrid field in the dictionary');
      if (X !== want.length || th.length !== want.length) fail.push(nm + ' grid columns [' + th + '] vs dictionary [' + want + ']');
      if (filled < 3) fail.push(nm + ' first row cells blank: ' + JSON.stringify(cells));
    }
    say('§W-BIMDOC-GRID ' + notes.join(' | '));
    verdict('G-3 register grid from the plugin AD model', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : notes.join(' ; '));
  }
  // G-4: the side door is deleted
  { const d = await page.evaluate(() => ({ reg: window.AdLens ? window.AdLens.describe() : null, dom: document.querySelectorAll('[data-lens-action^="bimdoc:"]').length }));
    await openDoc('A-101/1'); const dom2 = await page.evaluate(() => document.querySelectorAll('[data-lens-action^="bimdoc:"]').length);
    verdict('G-4 no bimdoc lens', d.reg && !('bimdoc' in d.reg) && d.dom === 0 && dom2 === 0 ? 'PASS' : (d.reg ? 'FAIL' : 'INCONCLUSIVE'), 'lenses=' + JSON.stringify(d.reg) + ' bimdoc buttons on screen=' + (d.dom + dom2)); }

  // F-1 attach the original file to the first deliverable (the generic Attachment dialog)
  {
    await openDoc('A-101/1'); const n0 = mark();
    let btn = await page.$('#idmp-toolbar button[data-tb="attachment"]'); let dis = btn ? await btn.evaluate(b => b.disabled) : true;
    if (dis) { await page.click('#idmp-toolbar button[data-tb="refresh"]').catch(() => {}); await sleep(1800); btn = await page.$('#idmp-toolbar button[data-tb="attachment"]'); dis = btn ? await btn.evaluate(b => b.disabled) : true; }
    let fail = [];
    if (dis) fail.push('Attachment button disabled on a saved BIM Document');
    else {
      await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 });
      await page.setInputFiles('[data-att="file"]', [{ name: 'duplex_ground_floor.dxf', mimeType: 'application/dxf', buffer: DXF }]); await sleep(900);
      await page.click('[data-att="ok"]'); await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 15000 }); await sleep(1200);
      const h = since(n0, /^§ATT hash /); if (!h.some(l => l.includes('name=duplex_ground_floor.dxf sha256=' + sha(DXF)))) fail.push('no §ATT hash line with the node sha256 ' + sha(DXF).slice(0, 12));
      if (!since(n0, /^§ATT save op=create entries=1 /).length) fail.push('no §ATT save op=create entries=1');
    }
    verdict('F-1 attach', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'duplex_ground_floor.dxf sha256=' + sha(DXF).slice(0, 16) + ' on BIM_Document ' + ID['A-101/1']);
  }

  // ════════ phase 2 + Open in Modeller / Viewer ════════
  const DXF_SHA = sha(DXF), ORIGIN = new URL(base).origin;
  const opfsList = () => page.evaluate(async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_files'); const k = []; for await (const x of d.keys()) k.push(x); return k.sort(); } catch (e) { return []; } });
  const attRow = id => rd("SELECT ad_attachment_id, title, length(binarydata) AS len, binarydata FROM ad_attachment WHERE ad_table_id=" + T_ID + " AND record_id=" + id);
  async function dialogAttach(key, name, buf) {
    await openDoc(key); let btn = await page.$('#idmp-toolbar button[data-tb="attachment"]'); let dis = btn ? await btn.evaluate(b => b.disabled) : true;
    if (dis) { await page.click('#idmp-toolbar button[data-tb="refresh"]').catch(() => {}); await sleep(1800); btn = await page.$('#idmp-toolbar button[data-tb="attachment"]'); dis = btn ? await btn.evaluate(b => b.disabled) : true; }
    if (dis) return false;
    await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 });
    await page.setInputFiles('[data-att="file"]', [{ name, mimeType: 'application/octet-stream', buffer: buf }]); await sleep(buf.length > 1e6 ? 4000 : 900);
    await page.click('[data-att="ok"]'); await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 60000 }); await sleep(1500); return true;
  }
  async function dialogDeleteAll(key) {
    await openDoc(key); let btn = await page.$('#idmp-toolbar button[data-tb="attachment"]'); if (!btn || await btn.evaluate(b => b.disabled)) { await page.click('#idmp-toolbar button[data-tb="refresh"]').catch(() => {}); await sleep(1800); }
    await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 });
    await page.click('[data-att="deleteall"]'); await page.click('[data-att="yes"]'); await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 30000 }); await sleep(1500);
  }
  // read the attachment of a record back the way the dialog does, hash it in the page: {title, indexLen, entries:[{name,size,sha,stored}]}; polls while the sidecar hydrates
  const readBack = (recId) => page.evaluate(async ([t, r]) => {
    if (!window.AdAttachment) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'ad_attachment.js?v=1'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const A = window.AdAttachment, hex = d => crypto.subtle.digest('SHA-256', d).then(h => [...new Uint8Array(h)].map(x => ('0' + x.toString(16)).slice(-2)).join(''));
    let row = null; for (let i = 0; i < 80 && !row; i++) { row = A.lookup({ rows: window.__tipRead.rows }, { tableId: t, recordId: r }); if (!row) await new Promise(q => setTimeout(q, 500)); }
    if (!row) return null;
    const st = await A.load(row), out = [];
    for (const e of st.entries) { const d = await A.bytes(e); out.push({ name: e.name, size: e.size, stored: !!e.stored, sha: await hex(d), len: d.length }); }
    return { title: row.title, entries: out };
  }, [T_ID, recId]);
  async function storeAltered(sha, fn) { return page.evaluate(async ([s, mode]) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_files'); const h = await d.getFileHandle(s); const f = await h.getFile(); const orig = new Uint8Array(await f.arrayBuffer());
      const w = await h.createWritable(); const bad = orig.slice(); bad[0] = bad[0] ^ 255; await w.write(mode === 'alter' ? bad : new Uint8Array(0)); await w.close(); return orig.length; }, [sha, fn]); }
  {
    const fail = [];
    // O-1: the action opens the app its file kind names; the app's own log shows the same sha256
    await openDoc('A-101/1'); const n0 = mark(), a0 = APPLOG.length;
    const PID = Number((await dq("SELECT AD_Process_ID FROM AD_Column WHERE AD_Table_ID=" + T_ID + " AND ColumnName='OpenInApp'"))[0]?.[0] || 0);
    const g = await gearRun('OpenInApp', 30000), has = !!(g.item && !g.item.disabled);
    if (!has) fail.push('the gear does not offer "Open in Modeller / Viewer": items=' + JSON.stringify(g.items));
    let popup = g.popup || null, urlLine = null;
    if (has) {
      for (let i = 0; i < 40 && !since(n0, /^§BIMDOC-OPEN id=/).length; i++) await sleep(250);
      urlLine = since(n0, /^§BIMDOC-OPEN id=/)[0] || null;
    }
    const gfail = [];   // G-1: the action is an AD_Process under the gear
    if (!PID) gfail.push('no OpenInApp Button column with an AD_Process_ID in the dictionary');
    if (!has || String(g.item.pid) !== String(PID) || g.item.label !== 'Open in Modeller / Viewer') gfail.push('gear item ' + JSON.stringify(g.item) + ' want process ' + PID);
    if (!since(n0, new RegExp('^§AD-TBB click comp=OpenInApp process=' + PID + ' table=BIM_Document .*via=gear')).length) gfail.push('no §AD-TBB click ... via=gear line');
    if (!since(n0, new RegExp('^§AD-PROC-LIVE proc=' + PID + ' .*dispatched=Y ok=Y')).length) gfail.push('process result not ok: ' + JSON.stringify(g.res) + ' ' + JSON.stringify(since(n0, /^§AD-PROC-LIVE proc=/).slice(-1)));
    verdict('G-1 Open is an AD process under the gear', gfail.length ? 'FAIL' : 'PASS', gfail.length ? gfail.join(' ; ') : 'gear item OpenInApp -> AD_Process ' + PID + ', clicked via=gear, result "' + (g.res && g.res.msg) + '"');
    const want = ORIGIN + '/modeller/modeller.html?open=store:' + DXF_SHA + '&name=duplex_ground_floor.dxf';
    const gotUrl = urlLine ? (/ url=(\S+)$/.exec(urlLine) || [])[1] : null;
    if (gotUrl !== want) fail.push('action URL ' + gotUrl + ' != expected ' + want);
    if (popup) { await popup.waitForLoadState('domcontentloaded').catch(() => {}); if (popup.url() !== want) fail.push('popup URL ' + popup.url()); }
    else if (has) fail.push('no popup opened');
    for (let i = 0; i < 360 && !appSince(a0, /^§FILESTORE-OPEN sha=|^§FILESTORE-OPEN REFUSED/).length; i++) await sleep(250);
    const appOpen = appSince(a0, /^§FILESTORE-OPEN sha=/)[0] || null, appGet = appSince(a0, /^§FILESTORE-GET sha=/)[0] || null;
    if (!appOpen || !appOpen.includes('sha=' + DXF_SHA.slice(0, 12)) || !/name=duplex_ground_floor\.dxf/.test(appOpen)) fail.push('the app did not log the same sha256 opened: ' + appOpen);
    const ar = (await attRow(ID['A-101/1']))[0];
    if (!ar || ar.title !== 'fs') fail.push('attachment row not promoted to the store: ' + JSON.stringify(ar && { title: ar.title }));
    say('§W-BIMDOC-OPEN url=' + gotUrl + ' | app-log: ' + appOpen + ' | ' + appGet + ' | row.title=' + (ar && ar.title) + ' | action-line: ' + (urlLine || '').slice(0, 200));
    verdict('O-1 open in Modeller', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'exact URL, popup URL equal, Modeller logged §FILESTORE-OPEN sha=' + DXF_SHA.slice(0, 12) + ' (= node sha256 ' + DXF_SHA.slice(0, 16) + ')');
    if (popup) await popup.close().catch(() => {});

    // R-4 red: the file-kind data row removed stops the action; restored, it works again
    const kindRef = Number((await dq("SELECT AD_Reference_Value_ID FROM AD_Column WHERE AD_Table_ID=" + T_ID + " AND ColumnName='FileKind'"))[0]?.[0] || 0);
    const saved = await page.evaluate(r => { const x = window.__idmpDb.exec("SELECT * FROM ad_ref_list WHERE ad_reference_id=" + r + " AND value='DXF'"); return x.length ? { cols: x[0].columns, vals: x[0].values[0] } : null; }, kindRef);
    const rf = [];
    if (!saved) rf.push('population: the DXF file-kind row is not in the dictionary (INCONCLUSIVE)');
    else {
      await openDoc('A-101/1'); await page.evaluate(r => window.__idmpDb.exec("DELETE FROM ad_ref_list WHERE ad_reference_id=" + r + " AND value='DXF'"), kindRef);   // no reload after the delete: the dictionary is in memory
      const m1 = mark();
      const gr = await gearRun('OpenInApp', 5000), pp = [gr.popup]; await sleep(1500);
      if (!gr.res || !/no-app-for-kind/.test(gr.res.msg || '')) rf.push('the process result does not carry the refusal: ' + JSON.stringify(gr.res));
      const refusal = since(m1, /^§BIMDOC-OPEN REFUSED .*reason=no-app-for-kind/);
      if (pp[0]) { rf.push('a popup opened although the file-kind row was removed'); await pp[0].close().catch(() => {}); }
      if (!refusal.length) rf.push('no §BIMDOC-OPEN REFUSED reason=no-app-for-kind line');
      await page.evaluate(([c, v]) => window.__idmpDb.run('INSERT INTO ad_ref_list (' + c.join(',') + ') VALUES (' + c.map(() => '?').join(',') + ')', v), [saved.cols, saved.vals]);
      const m2 = mark();
      const pp2 = [(await gearRun('OpenInApp', 20000)).popup]; await sleep(800);
      if (!pp2[0]) rf.push('after restoring the row the action still did not open'); else await pp2[0].close().catch(() => {});
      say('§W-BIMDOC-REDKIND removed=' + JSON.stringify(refusal.slice(0, 1)) + ' restoredOpened=' + !!pp2[0]);
    }
    verdict('R-4 red file-kind row removed', !saved ? 'INCONCLUSIVE' : (rf.length ? 'FAIL' : 'PASS'), rf.length ? rf.join(' ; ') : 'row removed -> refused, no popup; restored -> opens again');

    // R-5 red: an altered store entry is refused by the app
    const len = await storeAltered(DXF_SHA, 'alter');
    const a1 = APPLOG.length, p2 = await ctx.newPage(); await p2.goto(want, { waitUntil: 'domcontentloaded' }).catch(() => {});
    for (let i = 0; i < 120 && !appSince(a1, /^§FILESTORE-OPEN (sha=|REFUSED)/).length; i++) await sleep(250);
    const rfs = appSince(a1, /^§FILESTORE-OPEN REFUSED/)[0] || null, okLine = appSince(a1, /^§FILESTORE-OPEN sha=/)[0] || null;
    await p2.close().catch(() => {});
    await page.evaluate(async ([s, hex]) => { const b = Uint8Array.from(atob(hex), c => c.charCodeAt(0)); const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_files'); const w = await (await d.getFileHandle(s)).createWritable(); await w.write(b); await w.close(); }, [DXF_SHA, DXF.toString('base64')]);
    say('§W-BIMDOC-REDSTORE altered ' + len + ' bytes; app said: ' + (rfs || okLine || 'nothing'));
    verdict('R-5 red altered store entry', !len ? 'INCONCLUSIVE' : (rfs && /reason=mismatch/.test(rfs) && !okLine ? 'PASS' : 'FAIL'), 'app line: ' + (rfs || okLine || 'none'));
  }
  {
    // S-1: the 20 MB file through the generic dialog -> store; R-6: shared hash
    const fail = [], n0 = mark();
    const ok = await dialogAttach('A-103/1', 'fixture_sheetset_20mb.bin', BIG);
    if (!ok) fail.push('Attachment button disabled');
    const put = since(n0, /^§FILESTORE-PUT sha=/)[0] || null, sv = since(n0, /^§ATT save op=create entries=1 .*store=1/)[0] || null;
    if (!put || !put.includes('sha=' + BIG_SHA.slice(0, 12)) || !put.includes('size=' + BIG.length)) fail.push('no §FILESTORE-PUT with the node sha/size: ' + put);
    if (!sv) fail.push('no §ATT save ... store=1 line');
    const row = (await attRow(ID['A-103/1']))[0];
    if (!row || row.title !== 'fs') fail.push('row title ' + (row && row.title));
    else if (Number(row.len) > 2048) fail.push('the row holds ' + row.len + ' bytes: the bytes are in the DB, not the store');
    let rb = await readBack(ID['A-103/1']);
    const eq = r => r && r.entries.length === 1 && r.entries[0].sha === BIG_SHA && r.entries[0].len === BIG.length && r.entries[0].stored && r.entries[0].name === 'fixture_sheetset_20mb.bin';
    if (!eq(rb)) fail.push('readback ' + JSON.stringify(rb)); 
    await boot('&window=' + W_ID); const rb2 = await readBack(ID['A-103/1']);
    if (!eq(rb2)) fail.push('after reload ' + JSON.stringify(rb2));
    say('§W-BIMDOC-STORE put=' + put + ' | ' + sv + ' | row=' + JSON.stringify(row && { title: row.title, len: row.len }) + ' readback.sha=' + (rb && rb.entries[0] && rb.entries[0].sha) + ' node.sha=' + BIG_SHA + ' reload.sha=' + (rb2 && rb2.entries[0] && rb2.entries[0].sha));
    verdict('S-1 20 MB through the store', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'sha256 ' + BIG_SHA.slice(0, 16) + ' equal to node before and after a reload; the row holds ' + row.len + ' bytes of index');

    // R-6: a second row, same bytes -> deduped; delete one -> bytes stay; delete the last -> bytes go
    const rf = [], m1 = mark();
    await dialogAttach('A-102/1', 'fixture_sheetset_20mb.bin', BIG);
    const put2 = since(m1, /^§FILESTORE-PUT sha=/)[0] || null; if (!put2 || !/dedup=1/.test(put2)) rf.push('second row did not dedup: ' + put2);
    const L1 = (await opfsList()).filter(x => x === BIG_SHA).length; if (L1 !== 1) rf.push('store holds ' + L1 + ' copies of the hash');
    const m2 = mark(); await dialogDeleteAll('A-102/1');
    const sw1 = since(m2, /^§FILESTORE-SWEEP /)[0] || null, still = (await opfsList()).includes(BIG_SHA), other = await readBack(ID['A-103/1']);
    if (!sw1) rf.push('no sweep line after deleting the first row'); if (!still) rf.push('bytes were removed although another row uses the hash'); if (!eq(other)) rf.push('the other row no longer reads back');
    const m3 = mark(); await dialogDeleteAll('A-103/1');
    const sw2 = since(m3, /^§FILESTORE-SWEEP /)[0] || null, gone = !(await opfsList()).includes(BIG_SHA), dxfKept = (await opfsList()).includes(DXF_SHA);
    if (!gone) rf.push('the last reference was deleted but the bytes stayed (the sweep is a no-op)'); if (!dxfKept) rf.push('an unrelated referenced entry (the DXF) was swept');
    say('§W-BIMDOC-REDSHARE after-first-delete: ' + sw1 + ' stillThere=' + still + ' | after-last-delete: ' + sw2 + ' gone=' + gone + ' dxfKept=' + dxfKept);
    verdict('R-6 red shared hash keeps its bytes', !put2 ? 'INCONCLUSIVE' : (rf.length ? 'FAIL' : 'PASS'), rf.length ? rf.join(' ; ') : 'one stored copy for two rows; first delete kept it, last delete removed it, the referenced DXF survived both sweeps');
    // R-10 (§ATT-NEXT item 2, PO.delete :4508-4512): deleting a RECORD deletes its attachment row, then the store keeps what another row uses and drops the rest
    {
      const df = [], X1 = ['A-901', 1, 'Duplex delete probe one', 'ARC', 'DXF', 1, 'Plans'], X2 = ['A-902', 1, 'Duplex delete probe two', 'ARC', 'DXF', 1, 'Plans'];
      const i1 = await createDoc(X1), i2 = await createDoc(X2); ID['A-901/1'] = i1; ID['A-902/1'] = i2;
      if (!i1 || !i2) df.push('probe rows not created');
      else {
        await dialogAttach('A-901/1', 'fixture_sheetset_20mb.bin', BIG); await dialogAttach('A-902/1', 'fixture_sheetset_20mb.bin', BIG);
        const both = (await opfsList()).includes(BIG_SHA) && (await attRow(i1)).length === 1 && (await attRow(i2)).length === 1;
        if (!both) df.push('setup: both rows must hold the attachment');
        const delRecord = async key => { await openDoc(key); await page.click('#idmp-toolbar [data-tb="delete"]'); await page.waitForSelector('#idmp-delete-ov [data-del-ok]', { timeout: 8000 }); await page.click('#idmp-delete-ov [data-del-ok]'); await sleep(3500); };
        const m1 = mark(); await delRecord('A-901/1');
        const a1 = (await attRow(i1)).length, rec1 = (await rd("SELECT count(*) n FROM bim_document WHERE bim_document_id=" + i1))[0].n, kept = (await opfsList()).includes(BIG_SHA), sw1 = since(m1, /^§FILESTORE-SWEEP /)[0] || null;
        if (Number(rec1) !== 0) df.push('record 1 not deleted'); if (a1 !== 0) df.push('record 1 deleted but its ad_attachment row remains'); if (!kept) df.push('bytes removed although record 2 still uses the hash'); if (!sw1) df.push('no sweep after the record delete');
        const m2 = mark(); await delRecord('A-902/1');
        const a2 = (await attRow(i2)).length, gone = !(await opfsList()).includes(BIG_SHA), sw2 = since(m2, /^§FILESTORE-SWEEP /)[0] || null;
        if (a2 !== 0) df.push('record 2 deleted but its attachment row remains'); if (!gone) df.push('last record deleted but the bytes stayed'); 
        say('§W-BIMDOC-RECDELETE first: attRows=' + a1 + ' ' + sw1 + ' bytesKept=' + kept + ' | last: attRows=' + a2 + ' ' + sw2 + ' bytesGone=' + gone);
      }
      verdict('R-10 record delete takes its attachment and sweeps', !(ID['A-901/1'] && ID['A-902/1']) ? 'INCONCLUSIVE' : (df.length ? 'FAIL' : 'PASS'), df.length ? df.join(' ; ') : 'attachment rows cascade with the record; shared bytes kept until the last record is deleted');
    }
  }

  // B-1 FSM pair sweep through the common machine
  {
    const res = await page.evaluate(([tid, sts, acts]) => { const stub = { prepare: () => ({ get: () => null }) }, out = [];
      sts.forEach(s => acts.forEach(a => { const r = window.AdDocFsm.dispatchFor(stub, tid, { docStatus: s, doctypeId: null, processing: 'N', periodOpen: true, isBackDateTrxAllowed: true, isSOTrx: 'N' }, a); out.push({ s, a, ok: !!r.ok, to: r.to || null }); })); return out; }, [T_ID, STATUSES, ACTIONS]);
    let X = 0; const bad = [];
    res.forEach(r => { const want = (EXPECT_LEGAL[r.s] || {})[r.a] || null; const v = judgePair(r.ok, r.to, want); if (v === 'PASS') X++; else bad.push(r.s + '+' + r.a + '=' + (r.ok ? r.to : 'refused') + ' want ' + (want || 'refused')); });
    const legalN = res.filter(r => r.ok).length;
    say('§W-BIMDOC-FSM X=' + X + ' of N=' + res.length + ' (state,action) pairs as ruled; legal=' + legalN + '; wrong=' + JSON.stringify(bad));
    verdict('B-1 fsm', res.length === 0 ? 'INCONCLUSIVE' : (bad.length === 0 && legalN === 3 ? 'PASS' : 'FAIL'), 'X=' + X + ' of N=' + res.length);
    // R-1 red: Superseded -> Issue for construction is refused, and the judge fed the opposite says FAIL
    const re = res.find(r => r.s === 'RE' && r.a === 'CO');
    const judgeRed = judgePair(true, 'CO', null);
    verdict('R-1 red illegal transition (FSM)', re && !re.ok && judgeRed === 'FAIL' ? 'PASS' : 'FAIL', 'RE+CO ok=' + (re && re.ok) + '; judge fed "allowed" says ' + judgeRed);
  }

  // B-2 drive the transitions through the document-action bar
  const stateLog = [];
  {
    const fail = [];
    await openDoc('A-101/1'); let bar = await barActs(), c0 = await chip(); stateLog.push('DR bar=' + bar + ' chip=' + c0);
    if (JSON.stringify(bar.slice().sort()) !== JSON.stringify(['CO', 'PR'])) fail.push('Draft bar ' + JSON.stringify(bar)); if (!/Draft/.test(c0 || '')) fail.push('Draft chip ' + c0);
    let r = await act('A-101/1', 'PR'); let st = await status('A-101/1'); stateLog.push('after PR docstatus=' + (st && st.docstatus));
    if (!st || st.docstatus !== 'IP') fail.push('after Issue-for-review docstatus=' + (st && st.docstatus));
    await openDoc('A-101/1'); bar = await barActs(); c0 = await chip(); stateLog.push('IP bar=' + bar + ' chip=' + c0);
    if (JSON.stringify(bar) !== JSON.stringify(['CO'])) fail.push('Issued-for-review bar ' + JSON.stringify(bar)); if (!/Issued for review/.test(c0 || '')) fail.push('IP chip ' + c0);
    r = await act('A-101/1', 'CO'); st = await status('A-101/1'); stateLog.push('after CO docstatus=' + (st && st.docstatus) + ' processed=' + (st && st.processed));
    if (!st || st.docstatus !== 'CO' || st.processed !== 'Y') fail.push('after Issue-for-construction ' + JSON.stringify(st));
    await openDoc('A-101/1'); bar = await barActs(); c0 = await chip(); stateLog.push('CO bar=' + bar + ' chip=' + c0);
    if (bar.length !== 0) fail.push('Issued-for-construction bar not empty ' + JSON.stringify(bar)); if (!/Issued for construction/.test(c0 || '')) fail.push('CO chip ' + c0);
    // A-102: only to Issued for review
    r = await act('A-102/1', 'PR'); st = await status('A-102/1'); if (!st || st.docstatus !== 'IP') fail.push('A-102 docstatus=' + (st && st.docstatus));
    say('§W-BIMDOC-STATES ' + JSON.stringify(stateLog));
    const wf = PAGELOG.filter(l => /^§AD-DOCFSM-LIVE table=\d+\(bim_document\)/i.test(l)).length;
    verdict('B-2 transitions via the bar', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'Draft -> Issued for review -> Issued for construction; bar offers the ruled set at each state; persisted over reload; §AD-DOCFSM-LIVE lines=' + wf);
  }

  // C-1 supersede (+ R-2 red)
  {
    const fail = [];
    let r = await act('A-201/1', 'CO'); let s1 = await status('A-201/1'); if (!s1 || s1.docstatus !== 'CO') fail.push('A-201 rev1 docstatus=' + (s1 && s1.docstatus) + ' ' + JSON.stringify(r.lines && r.lines.filter(l => /MODEL|REFUS/.test(l)).slice(0, 3)));
    const n0 = mark(); r = await act('A-201/2', 'CO'); const s1b = await status('A-201/1'), s2 = await status('A-201/2'), a101 = await status('A-101/1');
    const sup = since(n0, /^§BIMDOC-SUPERSEDE /);
    if (!s2 || s2.docstatus !== 'CO') fail.push('rev2 docstatus=' + (s2 && s2.docstatus));
    if (!s1b || s1b.docstatus !== 'RE') fail.push('rev1 docstatus=' + (s1b && s1b.docstatus) + ' (want RE Superseded)');
    if (!s1b || String(s1b.reversal_id) !== String(ID['A-201/2'])) fail.push('rev1 reversal_id=' + (s1b && s1b.reversal_id) + ' want ' + ID['A-201/2']);
    if (!a101 || a101.docstatus !== 'CO') fail.push('an unrelated deliverable changed: A-101 ' + (a101 && a101.docstatus));
    if (sup.length !== 1) fail.push('§BIMDOC-SUPERSEDE lines=' + sup.length);
    say('§W-BIMDOC-SUPERSEDE rev1=' + JSON.stringify(s1b) + ' rev2=' + JSON.stringify(s2) + ' line=' + (sup[0] || 'none'));
    await openDoc('A-201/1'); const bar = await barActs(), c1 = await chip(); if (bar.length) fail.push('Superseded bar not empty ' + bar); if (!/Superseded/.test(c1 || '')) fail.push('Superseded chip ' + c1);
    verdict('C-1 supersede', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'rev 2 completed -> rev 1 Superseded (RE), Reversal_ID=' + ID['A-201/2'] + ', A-101 untouched, chip "' + c1 + '"');
    // R-1 (UI): the Superseded row's bar offered nothing (above) - the refusal needs no click. R-2: an OLDER revision completed after a newer one is issued
    const dup = ['A-201', 1, 'Duplex section AA (stale copy)', 'STR', 'IFC', 12, 'Sections'];
    const idDup = await createDoc(dup); ID['dup'] = idDup;
    const n1 = mark(); const rr = await act('dup', 'CO'); const sd = await status('dup');
    const refused = since(n1, /REFUSED by the model|ok=false/).length > 0;
    verdict('R-2 red older revision refused', sd && sd.docstatus !== 'CO' && refused ? 'PASS' : 'FAIL', 'status after CO attempt=' + (sd && sd.docstatus) + ' refusalLines=' + since(n1, /REFUSED by the model|ok=false/).length + ' offered=' + (rr && rr.ok));
    if (idDup) { await page.evaluate(id => 0, idDup); }
  }

  // E-1 the sub-tab under Project Task: navigate Project -> Phase -> Task -> BIM Document the way a user does
  async function toTask(phaseName, taskName) {
    await boot('&window=' + PROJ_WIN); await selectRow(PRJ.c_project_id);
    await tabClick('Phase'); await selectRow(PH[phaseName]);
    await tabClick('Task'); await selectRow(TK[taskName].id);
  }
  if (process.env.BD_ONLY9) { await beat9(); return finish(); }

  {
    const fail = [], notes = [];
    const expectRows = { Plans: 3, Sections: 3 };       // rows (every revision) of the task, by hand: A-101,A-102,A-103 ; A-201 rev1 (Superseded) + rev2 + the stale copy of rev1 made for R-2
    for (const [t, n] of Object.entries(expectRows)) {
      await toTask(FIX.tasks.find(x => x[0] === t)[1] === 0 ? FIX.phases[0] : FIX.phases[1], t); await tabClick('BIM Document');
      const sn = await snap(); notes.push(t + '=' + sn.rows.length + '(link ' + sn.linkColumn + '=' + sn.linkValue + ')');
      if (sn.table.toLowerCase() !== 'bim_document' || sn.rows.length !== n || String(sn.linkColumn).toLowerCase() !== 'c_projecttask_id' || String(sn.linkValue) !== String(TK[t].id)) fail.push('sub-tab of ' + t + ': ' + JSON.stringify({ table: sn.table, rows: sn.rows.length, want: n, link: sn.linkColumn, value: sn.linkValue }));
    }
    // a document created IN the sub-tab takes project, phase and task from its parents
    await toTask(FIX.phases[1], 'Details'); await tabClick('BIM Document');
    const n0 = mark(); await page.click('#idmp-toolbar button[data-tb="new"]'); await sleep(2200);
    for (const [c, v] of [['deliverableno', 'A-301'], ['revision', 1], ['name', 'Duplex door details'], ['discipline', 'ARC'], ['filekind', 'PDF'], ['hoursbudget', 4]]) { await setv(c, v); await sleep(250); }
    await sleep(500); await page.click('#idmp-toolbar button[data-tb="save"]');
    for (let i = 0; i < 40 && !since(n0, /^§CRUD-GROUP-PERSIST|committed key=bim_document/).length; i++) await sleep(250); await sleep(1200);
    const r = (await rd("SELECT bim_document_id AS id, c_project_id AS p, c_projectphase_id AS ph, c_projecttask_id AS t FROM bim_document WHERE deliverableno='A-301'"))[0];
    ID['A-301/1'] = r && r.id;
    if (!r) fail.push('A-301 not saved from the sub-tab: ' + JSON.stringify(since(n0, /REJECT|ERR/).slice(0, 3)));
    else if (String(r.p) !== String(PRJ.c_project_id) || String(r.ph) !== String(PH[FIX.phases[1]]) || String(r.t) !== String(TK.Details.id)) fail.push('parent values not inherited ' + JSON.stringify(r) + ' want p=' + PRJ.c_project_id + ' ph=' + PH[FIX.phases[1]] + ' t=' + TK.Details.id);
    say('§W-BIMDOC-SUBTAB ' + notes.join(' ') + ' created=' + JSON.stringify(r));
    verdict('E-1 sub-tab under Project Task', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'rows per task ' + notes.join(', ') + '; a document created in the sub-tab took project/phase/task from its parents');
  }

  // H-1 hours: time and expense lines booked on the task (signed CRUD lane, the kernel's own S_TimeExpense tables), then read back through the lens action
  {
    const HAND_H = { lines: 3, qty: [3.5, 2, 1.5], total: 7 };
    const r = await page.evaluate(([prj, ph, tk, H]) => new Promise(res => { const A = window.APP || {}, std = { actor: A.actor, clientId: A.clientId, orgId: A.orgId || 0 };
      const mk = (t, f) => ({ key: t, table: t, verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: f, stdDefaults: std });
      const ops = [mk('s_timeexpense', { documentno: 'TE-BIMDOC-1', datereport: '2026-11-09', isactive: 'Y', processed: 'N' })];
      H.qty.forEach((q, i) => ops.push(mk('s_timeexpenseline', { s_timeexpense_id: { __opRef: 0 }, line: (i + 1) * 10, istimereport: 'Y', dateexpense: '2026-11-09', qty: q, c_project_id: prj, c_projectphase_id: ph, c_projecttask_id: tk, description: 'Duplex plans, drafting hours', isactive: 'Y', processed: 'N' })));
      window.__crud.applyOpGroup(ops, rr => res(rr)); }), [PRJ.c_project_id, TK.Plans.ph, TK.Plans.id, HAND_H]);
    await sleep(1500);
    const lines = await rd("SELECT qty FROM s_timeexpenseline WHERE c_projecttask_id=" + TK.Plans.id + " AND isactive<>'N'");
    const n0 = mark(); await toTask(FIX.phases[0], 'Plans');
    const hv = virt(n0, 'C_ProjectTask', 'BIM_HoursBooked') || {}, got = hv[TK.Plans.id], judgeH = (g, w) => (g != null && Number(g) === w.total) ? 'PASS' : 'FAIL';
    say('§W-BIMDOC-HOURS committed=' + (r && r.committed) + ' rows-read-back=' + lines.length + ' task-grid BIM_HoursBooked=' + JSON.stringify(hv));
    const v = judgeH(got, HAND_H), ctl = judgeH(got, Object.assign({}, HAND_H, { total: HAND_H.total + 1 }));
    verdict('H-1 hours on the task', lines.length === 0 ? 'INCONCLUSIVE' : (v === 'PASS' && ctl === 'FAIL' ? 'PASS' : 'FAIL'), 'task grid BIM_HoursBooked=' + got + ' vs hand count total ' + HAND_H.total + ' (' + HAND_H.qty.join('+') + '); judge fed total+1 says ' + ctl + (r && r.committed ? '' : ' (booking not committed: ' + JSON.stringify(r).slice(0, 160) + ')'));
    // G-5: a task edited in its form and saved carries no virtual column in its op
    { const g5 = [], m5 = mark();   // toTask leaves the task's form open (selectRow); open it again only if it is not
      if (!(await page.$('#idmp-inline-mount [data-col="description"]'))) { await selectRow(TK.Plans.id); await sleep(800); }
      if ((await setv('description', 'Duplex plans (edited)')) === 'nofield') g5.push('no Description field on the task form');
      else { await sleep(400); await page.click('#idmp-toolbar button[data-tb="save"]'); for (let i = 0; i < 40 && !since(m5, /^§CRUD-PERSIST key=c_projecttask /).length; i++) await sleep(250); await sleep(800); }
      const pl = since(m5, /^§CRUD-PERSIST key=c_projecttask /)[0] || null;
      if (!pl) g5.push('no §CRUD-PERSIST for the task edit: ' + JSON.stringify(since(m5, /REJECT|ERR|SEVERE|no such column/i).slice(0, 3)));
      else if (/bim_/i.test((/ cols=(\S+)/.exec(pl) || [])[1] || '')) g5.push('the op carries a virtual column: ' + pl);
      verdict('G-5 a saved task carries no virtual column', g5.length ? 'FAIL' : 'PASS', g5.length ? g5.join(' ; ') : (pl || '').slice(0, 160)); }
  }

  // D-1 progress: the module and the UI action against the HAND COUNT
  {
    const P = await page.evaluate(() => window.BimDocProgress.compute(window.__tipRead.rows('SELECT * FROM bim_document')));
    const storedCol = (await dq("SELECT count(*) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE (lower(c.ColumnName) LIKE '%progress%' OR c.ColumnName LIKE 'BIM\\_%' ESCAPE '\\') AND COALESCE(c.ColumnSQL,'')='' AND c.ColumnName NOT IN ('BIM_StartDate','BIM_EndDate') /* §5.58: schedule data, not progress; the ONLY physical BIM_ columns on stock tables */ AND t.TableName IN ('C_ProjectTask','C_ProjectPhase')"))[0][0];
    let X = 0, N = 0; const bad = [];
    Object.entries(HAND.task).forEach(([k, w]) => { N++; const v = judgeCount(P.byTask[TK[k].id], w); if (v === 'PASS') X++; else bad.push('task ' + k + ' got ' + JSON.stringify(P.byTask[TK[k].id]) + ' want ' + JSON.stringify(w)); });
    Object.entries(HAND.phase).forEach(([k, w]) => { N++; const v = judgeCount(P.byPhase[PH[k]], w); if (v === 'PASS') X++; else bad.push('phase ' + k + ' got ' + JSON.stringify(P.byPhase[PH[k]]) + ' want ' + JSON.stringify(w)); });
    say('§W-BIMDOC-PROGRESS-MODULE X=' + X + ' of N=' + N + ' hand-counted task/phase figures equal; wrong=' + JSON.stringify(bad) + ' storedProgressColumns=' + storedCol);
    // G-2 through the UI: the task and phase GRIDS show the virtual progress columns (total, issued, earned hours) equal to the hand count
    const uiFail = [];
    async function uiProgress(level, name, want) {
      const n1 = mark(); await toTask(FIX.phases[0], 'Plans'); if (level === 'phase') { await tabClick('Phase'); }
      const tn = level === 'phase' ? 'C_ProjectPhase' : 'C_ProjectTask', key = level === 'phase' ? PH[name] : TK[name].id;
      const got = { total: (virt(n1, tn, 'BIM_Deliverables') || {})[key], issued: (virt(n1, tn, 'BIM_Issued') || {})[key], earned: (virt(n1, tn, 'BIM_EarnedHours') || {})[key] };
      for (let k = 0; k < 2 && !(await page.$('#idmp-content table thead th[data-ad-col]')); k++) { await page.click('#idmp-toolbar button[data-tb="toggle"]').catch(() => {}); await sleep(900); }
      const th = await page.evaluate(() => [...document.querySelectorAll('#idmp-content table thead th[data-ad-col]')].map(e => e.getAttribute('data-ad-col')).filter(c => /^BIM_/.test(c)));
      say('§W-BIMDOC-PROGRESS-UI ' + level + ' ' + name + ' grid=' + JSON.stringify(got) + ' gridColumns=[' + th + ']');
      if (['total', 'issued', 'earned'].some(k => got[k] == null || Number(got[k]) !== want[k])) uiFail.push(level + ' ' + name + ': grid ' + JSON.stringify(got) + ' want total=' + want.total + ' issued=' + want.issued + ' earned=' + want.earned);
      if (th.indexOf('BIM_Issued') < 0) uiFail.push(level + ' ' + name + ': no BIM_Issued column in the grid header [' + th + ']');
    }
    await uiProgress('task', 'Plans', HAND.task.Plans);
    await uiProgress('phase', FIX.phases[0], HAND.phase.Concept);
    const bad2 = bad.concat(uiFail);
    verdict('D-1 progress', N === 0 ? 'INCONCLUSIVE' : (bad2.length === 0 && Number(storedCol) === 0 ? 'PASS' : 'FAIL'), 'X=' + X + ' of N=' + N + ' equal to the hand count; G-2 task+phase grids ' + (uiFail.length ? 'WRONG ' + uiFail : 'equal') + '; physical (non-virtual) progress columns=' + storedCol);
    // R-3 red: a wrong hand count must be judged FAIL
    const wrong = Object.assign({}, HAND.task.Plans, { issued: HAND.task.Plans.issued + 1 });
    verdict('R-3 red progress judge', judgeCount(P.byTask[TK.Plans.id], wrong) === 'FAIL' ? 'PASS' : 'FAIL', 'judge fed a wrong count (issued+1) says ' + judgeCount(P.byTask[TK.Plans.id], wrong));
  }

  await beat9();

  // ════════ beat 9: the user ticks the phase complete (manual, §BIMDOC-5 c), runs the phase's Generate Order (ProjectPhaseGenOrder, AD_Process 216), the order is completed, Generate Invoices (119) bills it ════════
  async function beat9() {
    const fail = [], P_QTY = 8, P_PRICE = 50, HAND_AMT = P_QTY * P_PRICE;   // by hand: 8 x 50 = 400 (the phase's own PriceActual wins over the price list, ProjectPhaseGenOrder.java:93-95)
    const kv = (line, k) => { const m = new RegExp(' ' + k + '=(\\S+)').exec(line || ''); return m ? m[1] : null; };
    const judgeAmt = (line, w) => (line && Number(kv(line, 'qty')) === w.qty && Number(kv(line, 'price')) === w.price && Number(kv(line, 'amount')) === w.amount) ? 'PASS' : 'FAIL';
    const ph0 = (await rd("SELECT * FROM c_projectphase WHERE c_projectphase_id=" + PH.Concept))[0];
    const upd = await page.evaluate(([id, row, qty, price]) => new Promise(res => { const A = window.APP || {};
      const ch = { m_product_id: { old: row.m_product_id == null ? null : row.m_product_id, new: 126 }, qty: { old: row.qty == null ? null : row.qty, new: qty }, priceactual: { old: row.priceactual == null ? null : row.priceactual, new: price }, iscomplete: { old: row.iscomplete || 'N', new: 'Y' } };
      window.__crud.applyOpGroup([{ key: 'c_projectphase', table: 'c_projectphase', verb: 'update', op_type: 'CRUD_UPDATE', op_uuid: null, id: id, changes: ch, actor: A.actor }], r => res(r)); }), [PH.Concept, ph0, P_QTY, P_PRICE]);
    await sleep(1200);
    async function runPhaseOrder(phaseId) {
      await boot('&window=130'); await selectRow(PRJ.c_project_id); await tabClick('Phase'); await selectRow(phaseId); await sleep(800);
      const n0 = mark(); await page.click('#idmp-toolbar [data-tb="process"]').catch(() => {}); await sleep(600);
      const btn = await page.$('[data-tbb="GenerateOrder"]'); if (!btn) return { noButton: true, lines: [], n0 };   // a flagged Button field (IsToolbarButton Y) lives in the gear popup, ADTabpanel.getToolbarButtons
      await btn.click(); for (let i = 0; i < 80 && !(await page.$('#idmp-procdlg .idmp-procresult')); i++) await sleep(250); await sleep(1500);
      const res = await page.evaluate(() => { const r = document.querySelector('#idmp-procdlg .idmp-procresult'); return r ? { chip: (r.querySelector('.ok-chip') || {}).textContent, msg: (r.querySelector('.msg') || {}).textContent } : null; });
      await page.click('[data-procdlg-ok]').catch(() => {}); await sleep(800);
      return { res, n0, head: since(n0, /^§PROJECT-PHASE-GENORDER /)[0] || null, lines: since(n0, /^§PROJECT-PHASE-GENORDER-LINE /) };
    }
    const g = await runPhaseOrder(PH.Concept);
    if (g.noButton) fail.push('no Generate Order button on the Phase form');
    const docNo = g.head ? kv(g.head, 'documentno') : null;   // the order's key is synthetic until the group commits ('#new:1' in the process log): the document number is what the log can name
    const ordRow = docNo ? (await rd("SELECT c_order_id AS id FROM c_order WHERE documentno='" + docNo + "' AND c_project_id=" + PRJ.c_project_id))[0] : null, orderId = ordRow ? Number(ordRow.id) : null;
    if (!g.head || kv(g.head, 'lines') !== '1' || !g.lines.length || judgeAmt(g.lines[0], { qty: P_QTY, price: P_PRICE, amount: HAND_AMT }) !== 'PASS') fail.push('order lines: head=' + g.head + ' line=' + g.lines[0] + ' want qty ' + P_QTY + ' price ' + P_PRICE + ' amount ' + HAND_AMT);
    const ord = orderId != null ? (await rd("SELECT docstatus, c_project_id, c_bpartner_id, issotrx, c_doctypetarget_id FROM c_order WHERE c_order_id=" + orderId))[0] : null;
    if (!ord || String(ord.c_project_id) !== String(PRJ.c_project_id) || ord.docstatus !== 'DR' || ord.issotrx !== 'Y') fail.push('order header ' + JSON.stringify(ord));
    say('§W-BIMDOC-PHASEORDER ui=' + JSON.stringify(g.res) + ' | ' + g.head + ' | ' + (g.lines[0] || 'no line') + ' | header=' + JSON.stringify(ord) + ' | phase complete committed=' + (upd && upd.committed));
    verdict('B-2 phase Generate Order', fail.length ? 'FAIL' : 'PASS', fail.length ? fail.join(' ; ') : 'phase ticked complete, order ' + orderId + ' with 1 line 8 x 50 = 400 (hand count)');
    // complete the order through the Sales Order window's document-action bar; an On-Credit order invoices itself on Complete
    const f2 = [];
    if (orderId != null) {
      await boot('&window=143'); await selectRow(orderId); await sleep(800);
      const n1 = mark(); const bar = await barActs();
      if (bar.indexOf('CO') < 0) f2.push('Complete not offered on the order: ' + bar);
      else { await page.click('.idmp-docfsm [data-doc-action="CO"]'); for (let i = 0; i < 80 && !since(n1, /^§CRUD process committed key=c_order|REFUSED by the model|REJECTED/).length; i++) await sleep(250); await sleep(1500); }
      const od = (await rd("SELECT docstatus FROM c_order WHERE c_order_id=" + orderId))[0];
      if (!od || od.docstatus !== 'CO') f2.push('order docstatus ' + (od && od.docstatus) + ' ' + JSON.stringify(since(n1, /REFUSED|REJECTED|SEVERE/).slice(0, 3)));
      { const dr = (await rd("SELECT docstatus, isactive, c_doctype_id, c_doctypetarget_id, invoicerule, issotrx, c_bpartner_id, processed FROM c_order WHERE c_order_id=" + orderId))[0], dl = await rd("SELECT qtyordered, qtyinvoiced FROM c_orderline WHERE c_order_id=" + orderId), dt = dr ? await rd("SELECT docbasetype, docsubtypeso FROM c_doctype WHERE c_doctype_id=" + Number(dr.c_doctype_id || 0)) : [];
        say('§W-BIMDOC-ORDER-ROW ' + JSON.stringify(dr) + ' lines=' + JSON.stringify(dl) + ' doctype=' + JSON.stringify(dt)); }
      // the order is On-Credit (DocSubTypeSO WI): MOrder.completeIt raises the invoice itself (model_invoice.js MOrder.createInvoice) - 'the invoice through the existing path'
      const ih = since(n1, /^§ORDER-CREATEINVOICE /)[0] || null, il = since(n1, /^§ORDER-CREATEINVOICE-LINE /);
      if (!ih || !il.length) f2.push('no §ORDER-CREATEINVOICE lines'); else if (judgeAmt(il[0], { qty: P_QTY, price: P_PRICE, amount: HAND_AMT }) !== 'PASS') f2.push('invoice line ' + il[0]);
      const ctl = judgeAmt(il[0], { qty: P_QTY, price: P_PRICE, amount: HAND_AMT + 1 });
      if (il.length && ctl !== 'FAIL') f2.push('the judge fed amount+1 says ' + ctl);
      const inv = (await rd("SELECT docstatus, grandtotal FROM c_invoice WHERE c_order_id=" + orderId))[0];
      if (!inv || inv.docstatus !== 'CO') f2.push('invoice row ' + JSON.stringify(inv));
      say('§W-BIMDOC-INVOICE ' + ih + ' | ' + (il[0] || 'no line') + ' | row=' + JSON.stringify(inv));
    }
    verdict('B-3 order completed and invoiced', fail.length ? 'INCONCLUSIVE' : (f2.length ? 'FAIL' : 'PASS'), f2.length ? f2.join(' ; ') : 'order CO, invoice line 8 x 50 = 400 equal to the hand count; judge fed 401 says FAIL');
    // R-9 red: a phase with nothing to order yields an order with 0 lines (legacy saves the header first, ProjectPhaseGenOrder.java:75-77, then loops over nothing)
    await commitOps([mkOp('c_projectphase', { c_project_id: PRJ.c_project_id, name: 'Empty stage', seqno: 900, isactive: 'Y', iscomplete: 'N' })]); await sleep(1200);
    const eph = (await rd("SELECT c_projectphase_id AS id FROM c_projectphase WHERE c_project_id=" + PRJ.c_project_id + " AND name='Empty stage'"))[0];
    const e = eph ? await runPhaseOrder(eph.id) : null, rf = [];
    if (!eph) rf.push('empty phase not readable');
    else {
      if (!e.head || kv(e.head, 'lines') !== '0') rf.push('head ' + e.head);
      if (e.lines.length) rf.push('lines logged ' + e.lines.length);
      if (!e.res || !/\(0\)/.test(e.res.msg || '')) rf.push('message ' + JSON.stringify(e.res));
    }
    verdict('R-9 red nothing to order yields 0 lines', !eph ? 'INCONCLUSIVE' : (rf.length ? 'FAIL' : 'PASS'), rf.length ? rf.join(' ; ') : 'order header created, 0 lines, message "' + (e.res && e.res.msg) + '"');
  }

  // X-1 beat 10: issuing one more deliverable moves the project's issued count by one link (hand count: A-101 CO, A-201 rev2 CO = 2 -> A-103 issued = 3)
  {
    const n0 = mark(); await act('A-103/1', 'CO'); const ln = since(n0, /^§BIMDOC-CHAIN /)[0] || null, st = await status('A-103/1');
    const hand = { before: 2, after: 3 };
    const judgeC = (line, h) => line && line.includes('issued-before=' + h.before + ' ') && line.includes('issued-after=' + h.after + ' ') ? 'PASS' : 'FAIL';
    say('§W-BIMDOC-CHAIN-LINE ' + ln + ' status=' + JSON.stringify(st));
    verdict('X-1 the measure moves one link', !ln ? 'INCONCLUSIVE' : (judgeC(ln, hand) === 'PASS' && judgeC(ln, { before: 2, after: 4 }) === 'FAIL' && st && st.docstatus === 'CO' ? 'PASS' : 'FAIL'), 'line "' + ln + '" vs hand count 2 -> 3; judge fed 2 -> 4 says ' + judgeC(ln, { before: 2, after: 4 }));
  }
  // ════════ FB7 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md, FABLE STINT item 4): an IFC attached to a BIM Document opens in the VIEWER from the gear, by the same sha256.
  //   ISSUE: the IFC -> Viewer mapping was data only; it was never opened in a browser from a BIM Document (O-1 covers DXF -> Modeller).
  {
    const IFCF = path.join(REPO, 'IFC', 'SampleHouse_ARC.ifc'), key = ['A-201/2', 'A-201/1'].find(k => ID[k]);
    if (!fs.existsSync(IFCF) || !key) verdict('O-2 IFC opens in the Viewer', 'INCONCLUSIVE', 'no public IFC (' + fs.existsSync(IFCF) + ') or no IFC-kind document in the fixture (' + key + ')');
    else {
      const buf = fs.readFileSync(IFCF), want = sha(buf), f = [];
      const at = await dialogAttach(key, 'sample_house.ifc', buf); await sleep(1200);
      await openDoc(key); const n0 = mark(), a0 = APPLOG.length, g = await gearRun('OpenInApp', 30000);
      for (let i = 0; i < 40 && !since(n0, /^§BIMDOC-OPEN (id=|REFUSED)/).length; i++) await sleep(250);
      const line = since(n0, /^§BIMDOC-OPEN (id=|REFUSED)/)[0] || null, url = line ? (/ url=(\S+)$/.exec(line) || [])[1] : null, wantUrl = ORIGIN + '/viewer/viewer.html?open=store:' + want + '&name=sample_house.ifc';
      if (!g.item || g.item.disabled) f.push('the gear does not offer Open: ' + JSON.stringify(g.items));
      if (url !== wantUrl) f.push('action URL ' + url + ' != ' + wantUrl + ' (' + (line || 'no line').slice(0, 160) + ')');
      if (g.popup) { await g.popup.waitForLoadState('domcontentloaded').catch(() => {}); if (g.popup.url() !== wantUrl) f.push('popup URL ' + g.popup.url()); } else f.push('no popup opened');
      for (let i = 0; i < 480 && !appSince(a0, /^§FILESTORE-OPEN sha=|^§FILESTORE-OPEN REFUSED/).length; i++) await sleep(250);
      const appOpen = appSince(a0, /^§FILESTORE-OPEN /)[0] || null;
      if (!appOpen || !appOpen.includes('sha=' + want.slice(0, 12)) || !/name=sample_house\.ifc/.test(appOpen) || /REFUSED/.test(appOpen)) f.push('the Viewer did not log the same sha256 opened: ' + appOpen);
      say('§W-BIMDOC-OPEN-IFC key=' + key + ' attach=' + JSON.stringify(at).slice(0, 120) + ' url=' + url + ' | viewer-log: ' + appOpen + ' | node sha256=' + want.slice(0, 16) + ' bytes=' + buf.length);
      verdict('O-2 an IFC document opens in the Viewer by its sha256', f.length ? 'FAIL' : 'PASS', f.length ? f.join(' ; ') : 'viewer/viewer.html opened by store:' + want.slice(0, 12) + ', Viewer logged §FILESTORE-OPEN with the same digest (' + buf.length + ' bytes)');
      if (g.popup) await g.popup.close().catch(() => {});
    }
  }
  // ════════ §REGISTER-EXPORT (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md): the register as JSON, an AD_Process under the gear; the file comes back through IProcessUI.download ════════
  //   ISSUE: the walker's register gate needs the BIM Document rows as a file; nothing produced it. EX-1 the gear item, the file = a hand count over the tip; EX-2 red judge; EX-3 another project's rows stay out.
  {
    const docs = await rd("SELECT bim_document_id AS id, deliverableno AS no, revision AS rev, docstatus AS st, discipline AS di, filekind AS fk, name AS nm, c_project_id AS p FROM bim_document WHERE COALESCE(isactive,'Y')<>'N'");
    const mine = docs.filter(d => Number(d.p) === Number(PRJ.c_project_id)), other = docs.filter(d => Number(d.p) !== Number(PRJ.c_project_id));
    const latest = r => !mine.some(n => String(n.no) === String(r.no) && (Number(n.rev) > Number(r.rev) || (Number(n.rev) === Number(r.rev) && Number(n.id) > Number(r.id))));
    const hand = mine.filter(r => latest(r) || r.st === 'RE').map(r => ({ id: Number(r.id), no: r.no, rev: Number(r.rev), status: r.st, discipline: r.di || null, filekind: r.fk || null, name: r.nm || null }))
      .sort((a, b) => String(a.no).localeCompare(String(b.no)) || a.rev - b.rev || a.id - b.id);
    const attached = new Set((await rd('SELECT record_id AS r FROM ad_attachment WHERE ad_table_id=' + T_ID)).map(r => Number(r.r)));
    if (!hand.length) verdict('EX-1 register export', 'INCONCLUSIVE', 'the fixture project holds no document at this point');
    else {
      await openDoc2(hand[0].id); await page.evaluate(() => { window.__procNoDownload = true; });
      const n0 = mark(), g = await gearRun('ExportRegister', 0);
      for (let i = 0; i < 80 && !since(n0, /^§BIMDOC-REGISTER-EXPORT /).length; i++) await sleep(250);
      const line = since(n0, /^§BIMDOC-REGISTER-EXPORT /)[0] || null, dl = since(n0, /^§PROC-DOWNLOAD /)[0] || null;
      const file = await page.evaluate(async () => { const p = window.AdProcess && window.AdProcess.lastDownload && window.AdProcess.lastDownload(); if (!p) return null; const d = await p; return d ? { file: d.file, text: new TextDecoder().decode(d.bytes), sha: d.sha256 } : null; });
      let rows = null; try { rows = file ? JSON.parse(file.text) : null; } catch (e) { rows = null; }
      const KEYS = ['no', 'rev', 'status', 'discipline', 'filekind', 'sha256', 'name'];
      const judge = (got) => { const f = [];
        if (!Array.isArray(got) || got.length !== hand.length) return ['rows ' + (got && got.length) + ' vs hand ' + hand.length];
        got.forEach((r, i) => { const h = hand[i]; if (JSON.stringify(Object.keys(r)) !== JSON.stringify(KEYS)) f.push('keys of row ' + i + ' ' + Object.keys(r));
          ['no', 'rev', 'status', 'discipline', 'filekind', 'name'].forEach(k => { if (String(r[k]) !== String(h[k]) || (k === 'rev' && typeof r[k] !== 'number')) f.push(h.no + '/' + h.rev + ' ' + k + '=' + r[k] + ' hand=' + h[k]); });
          const hasFile = attached.has(h.id) && !!h.filekind; if (r.sha256 != null && !/^[0-9a-f]{64}$/.test(r.sha256)) f.push(h.no + ' sha256 not a digest'); if (r.sha256 != null && !hasFile) f.push(h.no + '/' + h.rev + ' has a sha256 but no attachment'); });
        return f; };
      const f1 = [];
      if (!g.item) f1.push('the gear does not list ExportRegister: ' + JSON.stringify((g.items || []).map(x => x.comp)));
      if (!g.res || !new RegExp('^Exported=' + hand.length + ' File=bim_register_').test((g.res.msg || '').trim())) f1.push('result ' + JSON.stringify(g.res));
      if (!line || !dl || !file) f1.push('no file handed back (line=' + !!line + ' download=' + !!dl + ')');
      const jf = rows ? judge(rows) : ['file not JSON']; jf.forEach(x => f1.push(x));
      const known = rows ? rows.filter(r => r.sha256 === sha(DXF) || r.sha256 === BIG_SHA).length : 0, withSha = rows ? rows.filter(r => r.sha256).length : 0, sup = hand.filter(h => h.status === 'RE').length;
      say('§W-BIMDOC-REGISTER ' + line + ' | ' + dl + ' | ui=' + JSON.stringify(g.res) + ' | hand rows=' + hand.length + ' superseded=' + sup + ' attachedRows=' + hand.filter(h => attached.has(h.id)).length + ' withSha=' + withSha + ' shaOfKnownFixtureBytes=' + known);
      verdict('EX-1 the gear exports the register: the file equals the hand count over the tip', f1.length ? 'FAIL' : 'PASS', f1.length ? f1.slice(0, 5).join(' ; ') : hand.length + ' rows (' + sup + ' superseded), 7 keys each, ' + withSha + ' with a file digest (' + known + ' equal to the fixture bytes\' own sha256)');
      if (rows && !jf.length) { const bad = JSON.parse(JSON.stringify(rows)); bad[0].rev = bad[0].rev + 1;
        verdict('EX-2 red: the judge fed a register with one revision altered says FAIL', judge(bad).length ? 'PASS' : 'FAIL', 'altered ' + bad[0].no + ' rev -> ' + bad[0].rev + ': ' + (judge(bad)[0] || 'not caught')); }
      else verdict('EX-2 red judge', 'INCONCLUSIVE', 'no clean export to alter');
      if (!other.length) say('§W-BIMDOC-REGISTER EX-3 NOT JUDGED: no document of another project exists in this run');
      else verdict('EX-3 a document of another project is not in the file', rows && !rows.some(r => other.some(o => String(o.no) === String(r.no) && Number(o.rev) === Number(r.rev) && !mine.some(m => String(m.no) === String(o.no)))) ? 'PASS' : 'FAIL', 'otherProjectDocs=' + other.length);
      await page.evaluate(() => { window.__procNoDownload = false; });
    }
  }
  // §BIMDOC-PROJTAB (bim-compiler ERP_IDEMPIERE_UX_PARITY.md): the level-1 Project tab. P1 rows == hand SQL; P2 every Task-tab row is in it; P3 a row made there carries the parent project; P4 Stop removes the tab, the window is
  //   unchanged otherwise; P5 an empty project is INCONCLUSIVE; P6 RED the judge fed count+1 says FAIL.
  {
    const fail = [], notes = []; const PT1 = 'BIM Document (Project)';
    const judgeP = (got, want) => (got === want ? 'PASS' : 'FAIL');
    if (!PRJ1_TAB) verdict('P1 project tab', 'INCONCLUSIVE', 'no level-1 BIM Document tab in the dictionary (AD_Tab TabLevel 1)');
    else {
      const want = Number((await rd("SELECT COUNT(*) AS n FROM bim_document WHERE c_project_id=" + PRJ.c_project_id))[0].n);
      await boot('&window=' + PROJ_WIN); await selectRow(PRJ.c_project_id); await tabClick(PT1);
      const sn = await snap(); const ids = sn.rows.map(r => String(r.bim_document_id || r.id));
      notes.push('rows=' + sn.rows.length + ' want=' + want + ' link=' + sn.linkColumn + '=' + sn.linkValue);
      if (want === 0) verdict('P5 vacuous guard', 'INCONCLUSIVE', 'the fixture project holds 0 deliverables');
      if (sn.table.toLowerCase() !== 'bim_document' || String(sn.linkColumn).toLowerCase() !== 'c_project_id' || String(sn.linkValue) !== String(PRJ.c_project_id)) fail.push('link ' + JSON.stringify({ t: sn.table, l: sn.linkColumn, v: sn.linkValue }));
      if (sn.rows.length !== want) fail.push('P1 rows ' + sn.rows.length + ' != hand SQL ' + want);
      // P2: the Task-tab rows of Plans are a subset of the project tab
      await toTask(FIX.phases[0], 'Plans'); await tabClick('BIM Document'); const st = await snap(); const tids = st.rows.map(r => String(r.bim_document_id || r.id));
      const miss = tids.filter(i => !ids.includes(i)); notes.push('task-tab ' + tids.length + ' missing from project tab ' + miss.length);
      if (!tids.length) verdict('P2 subset', 'INCONCLUSIVE', 'the Plans task tab is empty'); else if (miss.length) fail.push('P2 task rows not in project tab: ' + miss);
      // P3: a document created in the project tab carries the parent project; the task is chosen there
      await boot('&window=' + PROJ_WIN); await selectRow(PRJ.c_project_id); await tabClick(PT1);
      const n0 = mark(); await page.click('#idmp-toolbar button[data-tb="new"]'); await sleep(2200);
      for (const [c, v] of [['c_projecttask_id', TK.Details.id], ['deliverableno', 'A-302'], ['revision', 1], ['name', 'Duplex stair details'], ['discipline', 'ARC'], ['filekind', 'PDF'], ['hoursbudget', 3]]) { const g = await setv(c, v); if (g === 'nofield') fail.push('P3 field ' + c + ' not on the project-tab form'); await sleep(250); }
      await sleep(500); await page.click('#idmp-toolbar button[data-tb="save"]');
      for (let i = 0; i < 40 && !since(n0, /^§CRUD-GROUP-PERSIST|committed key=bim_document/).length; i++) await sleep(250); await sleep(1200);
      const r = (await rd("SELECT bim_document_id AS id, c_project_id AS p, c_projecttask_id AS t FROM bim_document WHERE deliverableno='A-302'"))[0];
      if (!r) fail.push('P3 A-302 not saved: ' + JSON.stringify(since(n0, /REJECT|ERR/).slice(0, 3))); else { ID['A-302/1'] = r.id; if (String(r.p) !== String(PRJ.c_project_id)) fail.push('P3 parent project not inherited ' + JSON.stringify(r)); }
      notes.push('created=' + JSON.stringify(r));
      // P6 red judge
      const red = judgeP(sn.rows.length + 1, want);
      if (red !== 'FAIL') fail.push('P6 judge fed count+1 did not say FAIL');
      verdict('P1-P3,P6 project tab (level 1)', want === 0 ? 'INCONCLUSIVE' : (fail.length ? 'FAIL' : 'PASS'), fail.length ? fail.join(' ; ') : notes.join(' ; ') + '; judge fed count+1 says ' + red);
      // P4 Stop removes the tab (and only that tab); Start brings it back
      const cnt = () => dq("SELECT COUNT(*) FROM AD_Tab WHERE AD_Window_ID=" + PROJ_WIN + " AND IsActive='Y'").then(r => Number(r[0][0]));
      const base = await page.evaluate(async () => { const R = window.PluginEngine._reg().system; await R.stopBundle('org.kernel.bim-document'); return true; }); await sleep(800);
      const afterStop = await cnt(); const left = await dq("SELECT COUNT(*) FROM AD_Tab WHERE AD_Table_ID=" + T_ID);
      await page.evaluate(async () => { await window.PluginEngine._reg().system.startBundle('org.kernel.bim-document'); }); await sleep(800);
      const afterStart = await cnt();
      const f4 = []; if (!(afterStart - afterStop === 2)) f4.push('Project window tabs stopped=' + afterStop + ' started=' + afterStart + ' (want +2: the task-level and the project-level BIM Document tabs)'); if (Number(left[0][0]) !== 0) f4.push('tabs of BIM_Document left after Stop: ' + left[0][0]);
      verdict('P4 Stop removes the Project tab, Start restores it', base ? (f4.length ? 'FAIL' : 'PASS') : 'INCONCLUSIVE', f4.length ? f4.join(' ; ') : 'window ' + PROJ_WIN + ' tabs ' + afterStop + ' -> ' + afterStart + '; BIM_Document tabs 0 while stopped');
    }
  }

  return finish();

  function finish() {
    // ── the ten evidence lines of §BIMDOC-FILM, in order, as far as items 1-4 cover them ──
    let last = -1, orderOk = true; const rows = [];
    const findAfter = (re, after) => { for (let i = after + 1; i < PAGELOG.length; i++) if (re.test(PAGELOG[i])) return i; return -1; };
    const EV = [[1, 'project from its type (copy-phases log)', /^§PROJECT-SETTYPE .*phases=[1-9]/], [2, 'sheet register (deliverables per task, task grid)', /^§AD-VIRTUAL tab=\d+ table=C_ProjectTask col=BIM_Deliverables rows=\d+ values=\[.*:[1-9]/], [3, 'drawing attached', /^§ATT hash name=duplex_ground_floor/], [4, 'open in the app', /^§BIMDOC-OPEN id=/],
      [5, 'issued (signed transition lines)', /^§CRUD process committed key=bim_document .*to=(IP|CO)/], [6, 'revised (supersede link)', /^§BIMDOC-SUPERSEDE /], [7, 'hours booked on the task (task grid)', /^§AD-VIRTUAL tab=\d+ table=C_ProjectTask col=BIM_HoursBooked rows=\d+ values=\[.*:[1-9]/], [8, 'progress, computed (task/phase grids)', /^§AD-VIRTUAL tab=\d+ table=C_Project(Task|Phase) col=BIM_Issued rows=\d+ values=\[.*:[1-9]/], [9, 'billed (phase order + invoice)', /^§ORDER-CREATEINVOICE-LINE /], [10, 'the measure moves (sheet chain)', /^§BIMDOC-CHAIN .*delta=1 /]];
    EV.forEach(([n, what, re]) => { const i = re ? findAfter(re, last) : -1; if (!re) rows.push('§BIMDOC-FILM-EVIDENCE ' + n + ' ABSENT ' + what + ' (' + (n === 1 ? '⛔ the kernel has no MProject.setProjectType/copyPhasesFrom twin: erp/model_project.js registers only c_projectline (:49), AD_Process 215 ProjectSetType has no handler in erp/ad_process.js' : '⛔ the kernel has no ProjectPhaseGenOrder (AD_Process 216): erp/ad_process.js registers only ProjectGenOrder (:462, project level, refuses category S :217)') + ')');
      else if (i < 0) { rows.push('§BIMDOC-FILM-EVIDENCE ' + n + ' MISSING-IN-ORDER ' + what); orderOk = false; }
      else { rows.push('§BIMDOC-FILM-EVIDENCE ' + n + ' PRESENT line#' + i + ' ' + what + ' :: ' + PAGELOG[i].slice(0, 150)); last = i; } });
    rows.forEach(say);
    const present = rows.filter(r => / PRESENT /.test(r)).length;
    verdict('FILM evidence order', present === 0 ? 'INCONCLUSIVE' : (orderOk ? 'PASS' : 'FAIL'), present + ' of 10 present, in order (1 and 9 named absent with file:line)');
    verdict('FILM evidence 10 of 10', present === 10 && orderOk ? 'PASS' : 'NOT-BUILT', present + ' of 10; absent beats are kernel gaps, not faked');
    const built = VERD.filter(v => v.v !== 'NOT-BUILT'), bad = built.filter(v => v.v !== 'PASS');
    say('§W-BIMDOC-SUMMARY arms=' + VERD.length + ' pass=' + VERD.filter(v => v.v === 'PASS').length + ' fail=' + VERD.filter(v => v.v === 'FAIL').length + ' inconclusive=' + VERD.filter(v => v.v === 'INCONCLUSIVE').length + ' not-built=' + VERD.filter(v => v.v === 'NOT-BUILT').length);
    fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
    return browser.close().then(() => { server.close(); process.exit(bad.length ? 1 : 0); });
  }
})().catch(e => { console.log('§W-BIMDOC-VERDICT harness FAIL ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\n§W-BIMDOC-VERDICT harness FAIL ' + (e && e.stack || e) + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n'); process.exit(2); });
