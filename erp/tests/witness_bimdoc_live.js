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
//   D-1 PROGRESS computed progress per task and per phase (issued/total, pct, budget, earned hours) equals a HAND COUNT of the fixture, through the module AND through the UI action; nothing is stored (no progress column).
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
//   H-1 HOURS   time lines booked on the task: §BIMDOC-HOURS lines/qty/total equal the hand count.   X-1 CHAIN  issuing a deliverable moves the project's issued count by one (§BIMDOC-CHAIN before/after, hand count).
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
    e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); return e.value; }, [col, v]);

  // ════════ population N, from the page's own dictionary ════════
  await boot();
  const T_ID = Number((await dq("SELECT AD_Table_ID FROM AD_Table WHERE TableName='BIM_Document' AND IsActive='Y'"))[0]?.[0] || 0);
  const W_ID = Number((await dq("SELECT AD_Window_ID FROM AD_Table WHERE AD_Table_ID=" + T_ID))[0]?.[0] || 0);
  const TABS = await dq("SELECT t.AD_Tab_ID, t.AD_Window_ID, t.Name, t.TabLevel FROM AD_Tab t WHERE t.AD_Table_ID=" + T_ID + " AND t.IsActive='Y' ORDER BY t.AD_Window_ID");
  const OWN_TAB = TABS.find(t => Number(t[1]) === W_ID), PRJ_TAB = TABS.find(t => Number(t[1]) !== W_ID);
  const FIELDS = OWN_TAB ? await dq("SELECT c.ColumnName, f.IsReadOnly, c.AD_Reference_ID FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=" + OWN_TAB[0] + " AND f.IsActive='Y' AND f.IsDisplayed='Y' ORDER BY f.SeqNo") : [];
  const STATUSES = (await dq("SELECT l.Value FROM AD_Ref_List l JOIN AD_Column c ON c.AD_Reference_Value_ID=l.AD_Reference_ID WHERE c.AD_Table_ID=" + T_ID + " AND c.ColumnName='DocStatus' AND l.IsActive='Y' ORDER BY l.AD_Ref_List_ID")).map(r => r[0]);
  const ACTIONS = (await dq("SELECT Value FROM AD_Ref_List WHERE AD_Reference_ID=135 AND IsActive='Y' ORDER BY AD_Ref_List_ID")).map(r => r[0]);
  const PROJ_WIN = Number(PRJ_TAB ? PRJ_TAB[1] : 0);
  say('§W-BIMDOC population table=' + T_ID + ' window=' + W_ID + ' tabs=' + TABS.length + ' fields(N)=' + FIELDS.length + ' statuses=[' + STATUSES + '] actions=' + ACTIONS.length + ' projectWindow=' + PROJ_WIN + ' (from the page dictionary)');
  if (!T_ID) { verdict('population', 'INCONCLUSIVE', 'BIM_Document is not in the dictionary: the plugin did not start'); return finish(); }

  // ════════ fixture: project, phases, tasks (set-up through the signed CRUD lane; the project path itself is not under test) ════════
  const fx = await page.evaluate(F => new Promise(res => { const A = window.APP || {}, std = { actor: A.actor, clientId: A.clientId, orgId: A.orgId || 0 };
    const mk = (t, f) => ({ key: t, table: t, verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: f, stdDefaults: std });
    const ops = [mk('c_project', { value: 'DUPLEX-SHEETS', name: F.project, isactive: 'Y', projectcategory: 'S', isactive_: 'Y' })];
    F.phases.forEach((p, i) => ops.push(mk('c_projectphase', { c_project_id: { __opRef: 0 }, name: p, seqno: (i + 1) * 10, isactive: 'Y', iscomplete: 'N' })));
    F.tasks.forEach(([t, pi], i) => ops.push(mk('c_projecttask', { c_projectphase_id: { __opRef: 1 + pi }, name: t, seqno: (i + 1) * 10, isactive: 'Y' })));
    ops.forEach(o => { delete o.fields.isactive_; });
    window.__crud.applyOpGroup(ops, r => res(r)); }), FIX);
  await sleep(1200);
  const PRJ = (await rd("SELECT c_project_id FROM c_project WHERE name='" + FIX.project + "'"))[0];
  const PH = {}, TK = {};
  (await rd("SELECT c_projectphase_id AS id, name FROM c_projectphase WHERE c_project_id=" + (PRJ ? PRJ.c_project_id : 0))).forEach(r => PH[r.name] = r.id);
  (await rd("SELECT c_projecttask_id AS id, name, c_projectphase_id AS ph FROM c_projecttask WHERE c_projectphase_id IN (" + Object.values(PH).concat([0]).join(',') + ")")).forEach(r => TK[r.name] = { id: r.id, ph: r.ph });
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
    verdict('A-1 render', FIELDS.length === 0 ? 'INCONCLUSIVE' : (missing.length === 0 && bar.length > 0 && TABS.length === 2 && tabStrip === 3 ? 'PASS' : 'FAIL'),
      'X=' + X + ' of N=' + FIELDS.length + ' displayed fields drawn (' + nBtn + ' Button field = document-action bar offering [' + bar + ']); missing=[' + missing + ']; sub-tab level ' + tabStrip + ' in window ' + PROJ_WIN); }
  // the rest of the fixture, all in Draft
  for (const d of FIX.docs.slice(1)) await createDoc(d);
  say('§W-BIMDOC fixture-docs ids=' + JSON.stringify(ID));

  // D-0 / beat 2: the register (row count per task) through the lens action, before anything is issued
  async function lensProgress(winId, tabName, recKey, expectText) {
    await boot('&window=' + winId + (recKey != null && recKey > 0 ? '&record=' + recKey : '')); await sleep(1500); if (recKey != null && recKey < 0) await selectRow(recKey);
    if (tabName) { await page.evaluate(n => { const t = [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].find(x => x.textContent.trim() === n); if (t) t.click(); }, tabName); await sleep(1500); }
    const n0 = mark(); const has = await page.$('[data-lens-action="bimdoc:progress"]');
    if (!has) return { lines: [], panel: null, has: false };
    await page.click('[data-lens-action="bimdoc:progress"]'); await sleep(1200);
    const panel = await page.evaluate(() => [...document.querySelectorAll('#bimdoc-progress [data-bimdoc-line]')].map(e => e.textContent));
    return { lines: since(n0, /^§BIMDOC-(PROGRESS|REGISTER)/), panel, has: true };
  }
  const reg = await lensProgress(W_ID, null, ID['A-101/1']);
  say('§W-BIMDOC register-lines ' + JSON.stringify(reg.lines));

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
    const SEL = '[data-lens-action="bimdoc:open"]';
    const has = await page.$(SEL); if (!has) fail.push('no "Open in Modeller / Viewer" action on the BIM Document');
    let popup = null, urlLine = null;
    if (has) {
      [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 30000 }).catch(() => null), page.click(SEL)]);
      for (let i = 0; i < 40 && !since(n0, /^§BIMDOC-OPEN id=/).length; i++) await sleep(250);
      urlLine = since(n0, /^§BIMDOC-OPEN id=/)[0] || null;
    }
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
      const pp = await Promise.all([page.waitForEvent('popup', { timeout: 5000 }).catch(() => null), page.click(SEL)]); await sleep(1500);
      const refusal = since(m1, /^§BIMDOC-OPEN REFUSED .*reason=no-app-for-kind/);
      if (pp[0]) { rf.push('a popup opened although the file-kind row was removed'); await pp[0].close().catch(() => {}); }
      if (!refusal.length) rf.push('no §BIMDOC-OPEN REFUSED reason=no-app-for-kind line');
      await page.evaluate(([c, v]) => window.__idmpDb.run('INSERT INTO ad_ref_list (' + c.join(',') + ') VALUES (' + c.map(() => '?').join(',') + ')', v), [saved.cols, saved.vals]);
      const m2 = mark();
      const pp2 = await Promise.all([page.waitForEvent('popup', { timeout: 20000 }).catch(() => null), page.click(SEL)]); await sleep(800);
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
  const tabClick = async name => { await page.evaluate(n => { const t = [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].find(x => x.textContent.trim() === n); if (t) t.click(); }, name); await sleep(1500); };
  async function toTask(phaseName, taskName) {
    await boot('&window=' + PROJ_WIN); await selectRow(PRJ.c_project_id);
    await tabClick('Phase'); await selectRow(PH[phaseName]);
    await tabClick('Task'); await selectRow(TK[taskName].id);
  }
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
    await toTask(FIX.phases[0], 'Plans'); const n0 = mark(); const has = await page.$('[data-lens-action="bimdoc:progress"]'); if (has) { await page.click('[data-lens-action="bimdoc:progress"]'); await sleep(1200); }
    const hl = since(n0, /^§BIMDOC-HOURS /)[0] || null, judgeH = (line, w) => (line && line.includes('lines=' + w.lines + ' ') && line.includes('qty=[' + w.qty.slice().sort((x, y) => x - y).join(',') + ']')   /* the log lists lines by id, synthetic ids run downward: compare as a set */ && line.includes('total=' + w.total)) ? 'PASS' : 'FAIL';
    say('§W-BIMDOC-HOURS committed=' + (r && r.committed) + ' rows-read-back=' + lines.length + ' line: ' + hl);
    const v = judgeH(hl, HAND_H), ctl = judgeH(hl, Object.assign({}, HAND_H, { total: HAND_H.total + 1 }));
    verdict('H-1 hours on the task', lines.length === 0 ? 'INCONCLUSIVE' : (v === 'PASS' && ctl === 'FAIL' ? 'PASS' : 'FAIL'), 'line "' + hl + '" vs hand count ' + JSON.stringify(HAND_H) + '; judge fed total+1 says ' + ctl + (r && r.committed ? '' : ' (booking not committed: ' + JSON.stringify(r).slice(0, 160) + ')'));
  }

  // D-1 progress: the module and the UI action against the HAND COUNT
  {
    const P = await page.evaluate(() => window.BimDocProgress.compute(window.__tipRead.rows('SELECT * FROM bim_document')));
    const storedCol = (await dq("SELECT count(*) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE lower(c.ColumnName) LIKE '%progress%' AND t.TableName IN ('BIM_Document','C_ProjectTask','C_ProjectPhase')"))[0][0];
    let X = 0, N = 0; const bad = [];
    Object.entries(HAND.task).forEach(([k, w]) => { N++; const v = judgeCount(P.byTask[TK[k].id], w); if (v === 'PASS') X++; else bad.push('task ' + k + ' got ' + JSON.stringify(P.byTask[TK[k].id]) + ' want ' + JSON.stringify(w)); });
    Object.entries(HAND.phase).forEach(([k, w]) => { N++; const v = judgeCount(P.byPhase[PH[k]], w); if (v === 'PASS') X++; else bad.push('phase ' + k + ' got ' + JSON.stringify(P.byPhase[PH[k]]) + ' want ' + JSON.stringify(w)); });
    say('§W-BIMDOC-PROGRESS-MODULE X=' + X + ' of N=' + N + ' hand-counted task/phase figures equal; wrong=' + JSON.stringify(bad) + ' storedProgressColumns=' + storedCol);
    // through the UI: the lens action on a task, then on a phase
    const uiFail = [];
    async function uiProgress(level, name, want, label) {
      await toTask(FIX.phases[0], 'Plans'); if (level === 'phase') await tabClick('Phase'), await selectRow(PH[name]);
      const n1 = mark(); const has = await page.$('[data-lens-action="bimdoc:progress"]');
      if (!has) { uiFail.push(level + ': no BIM progress action on the toolbar'); return; }
      await page.click('[data-lens-action="bimdoc:progress"]'); await sleep(1000);
      const panel = await page.evaluate(() => [...document.querySelectorAll('#bimdoc-progress [data-bimdoc-line]')].map(e => e.textContent));
      const txt = want.issued + ' of ' + want.total + ' issued for construction (' + want.pct + '%), earned hours ' + want.earned + ' of ' + want.budget;
      const logged = since(n1, /^§BIMDOC-PROGRESS /).some(l => l.includes('issued=' + want.issued + ' total=' + want.total + ' pct=' + want.pct + ' budget=' + want.budget + ' earned=' + want.earned));
      say('§W-BIMDOC-PROGRESS-UI ' + level + ' ' + name + ' panel=' + JSON.stringify(panel));
      if (!panel.some(l => l.includes(txt)) || !logged) uiFail.push(level + ' ' + name + ': panel/log lack "' + txt + '"');
      await page.evaluate(() => { const o = document.getElementById('bimdoc-progress'); if (o) o.remove(); });
    }
    await uiProgress('task', 'Plans', HAND.task.Plans);
    await uiProgress('phase', FIX.phases[0], HAND.phase.Concept);
    const bad2 = bad.concat(uiFail);
    verdict('D-1 progress', N === 0 ? 'INCONCLUSIVE' : (bad2.length === 0 && Number(storedCol) === 0 ? 'PASS' : 'FAIL'), 'X=' + X + ' of N=' + N + ' equal to the hand count; UI task+phase panels ' + (uiFail.length ? 'WRONG ' + uiFail : 'equal') + '; stored progress columns=' + storedCol);
    // R-3 red: a wrong hand count must be judged FAIL
    const wrong = Object.assign({}, HAND.task.Plans, { issued: HAND.task.Plans.issued + 1 });
    verdict('R-3 red progress judge', judgeCount(P.byTask[TK.Plans.id], wrong) === 'FAIL' ? 'PASS' : 'FAIL', 'judge fed a wrong count (issued+1) says ' + judgeCount(P.byTask[TK.Plans.id], wrong));
  }

  // X-1 beat 10: issuing one more deliverable moves the project's issued count by one link (hand count: A-101 CO, A-201 rev2 CO = 2 -> A-103 issued = 3)
  {
    const n0 = mark(); await act('A-103/1', 'CO'); const ln = since(n0, /^§BIMDOC-CHAIN /)[0] || null, st = await status('A-103/1');
    const hand = { before: 2, after: 3 };
    const judgeC = (line, h) => line && line.includes('issued-before=' + h.before + ' ') && line.includes('issued-after=' + h.after + ' ') ? 'PASS' : 'FAIL';
    say('§W-BIMDOC-CHAIN-LINE ' + ln + ' status=' + JSON.stringify(st));
    verdict('X-1 the measure moves one link', !ln ? 'INCONCLUSIVE' : (judgeC(ln, hand) === 'PASS' && judgeC(ln, { before: 2, after: 4 }) === 'FAIL' && st && st.docstatus === 'CO' ? 'PASS' : 'FAIL'), 'line "' + ln + '" vs hand count 2 -> 3; judge fed 2 -> 4 says ' + judgeC(ln, { before: 2, after: 4 }));
  }
  return finish();

  function finish() {
    // ── the ten evidence lines of §BIMDOC-FILM, in order, as far as items 1-4 cover them ──
    let last = -1, orderOk = true; const rows = [];
    const findAfter = (re, after) => { for (let i = after + 1; i < PAGELOG.length; i++) if (re.test(PAGELOG[i])) return i; return -1; };
    const EV = [[1, 'project from its type (copy-phases log)', null], [2, 'sheet register (row count per task)', /^§BIMDOC-REGISTER /], [3, 'drawing attached', /^§ATT hash name=duplex_ground_floor/], [4, 'open in the app', /^§BIMDOC-OPEN id=/],
      [5, 'issued (signed transition lines)', /^§CRUD process committed key=bim_document .*to=(IP|CO)/], [6, 'revised (supersede link)', /^§BIMDOC-SUPERSEDE /], [7, 'hours booked on the task', /^§BIMDOC-HOURS task=-?\d+ lines=[1-9]/], [8, 'progress, computed', /^§BIMDOC-PROGRESS /], [9, 'billed (phase order + invoice)', null], [10, 'the measure moves (sheet chain)', /^§BIMDOC-CHAIN .*delta=1 /]];
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
