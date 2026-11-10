// ⚠ DO NOT REMOVE — W-DELETE-PO (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §DEL). READ THE LOG after every run: the §WDEL lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: a toolbar Delete in the twin is not legacy's GridTable.dataDelete + PO.delete: the button ignores AD_Table.IsDeleteable and Processed, model
//   beforeDelete/afterDelete never run on the UI path, foreign keys do nothing, and a deleted pushed BIM row may return on reload (user 2026-10-07: "I also cannot delete those recs").
//   Every arm drives the real toolbar + real confirm, and reads the committed state (base + signed tip) a user sees, after a reload where it matters.
// Run: node erp/tests/witness_delete_po.js [erpRootDir] > <log>   (RED on main before §DEL)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..');   // the repo root: erp/idempiere.html loads ../common/*
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info) => { judged++; if (!cond) fails++; console.log('§WDEL ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info === undefined ? null : info))); };
const inconclusive = (id, claim, info) => { fails++; console.log('§WDEL ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info === undefined ? null : info)); };
// fixture ids (band >= 990000, so the overlay carries them)
const P = 990001, PH = 990101, PH2 = 990102, T = 990201, T2 = 990202, L1 = 990301, L2 = 990302, L3 = 990303, L4 = 990304, O = 990401, O2 = 990402, OL = [990501, 990502, 990503], OL2 = 990504;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const logs = [], errs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  const say = (s) => console.log('§WDEL ' + s);
  // a modelRun first: it waits for the signed log to hydrate, which a bare read right after a load does not (§TIP_READ_HYDRATED), so the read is the committed state and not the bare base
  const tip = (sql) => page.evaluate((sql) => new Promise((res, rej) => { try { window.__crud.modelRun({ table: 'ad_client', timing: 'HYDRATE' }, () => window.__crud.withTipQuery(q => res(q(sql)))); } catch (e) { rej(e); } }), sql);
  const store = (sql) => page.evaluate(async (sql) => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis'), f = await (await d.getFileHandle('bim_project_orders.db')).getFile();
      const db = new window.SQL.Database(new Uint8Array(await f.arrayBuffer())), r = db.exec(sql); db.close(); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, sql);
  const open = async (win, rec) => { await page.goto(base + '/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=' + win + (rec ? '&record=' + rec : ''), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.SQL && !!window.__crud && document.querySelectorAll('.idmp-adtab').length > 0, null, { timeout: 60000 }); await page.waitForTimeout(1200); };
  const tab = async (n) => { const ok = await page.evaluate((n) => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === n); if (t) t.click(); return !!t; }, n); await page.waitForTimeout(1200); return ok; };
  const delBtn = () => page.evaluate(() => { const b = document.querySelector('#idmp-toolbar [data-tb="delete"]'); return b ? { present: true, disabled: b.disabled } : { present: false }; });
  // grid rows the user sees in the current tab (a form view counts as the grid behind it via the toggle-free row store)
  const rows = () => page.evaluate(() => Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')).map(r => r.getAttribute('data-ad-record')));
  const toGrid = async () => { const b = page.locator('#idmp-toolbar [data-tb="grid"], #idmp-toolbar [data-tb="toggle"]').first(); if (!(await rows()).length && await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(600); } };
  const selectRow = async (k) => { await toGrid(); await page.evaluate((k) => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k + '"]'), td = tr && tr.querySelector('td.idmp-gcell'); if (td && !tr.classList.contains('idmp-grid-cur')) td.click(); }, k); await page.waitForTimeout(700); };   // a click on the current row would enter edit mode (GridView :1053-1060)
  // the user's path: the toolbar button, then the question legacy asks (Dialog.ask "DeleteRecord?"). Playwright clicks refuse an invisible element, which is the point: a hidden confirm fails here.
  const doDelete = async () => { const b = await delBtn(); if (!b.present || b.disabled) return { clicked: false, b };
    const n = logs.length; await page.click('#idmp-toolbar [data-tb="delete"]'); await page.waitForTimeout(500);
    const ok = page.locator('#idmp-delete-ov [data-del-ok]'); if (!(await ok.count()) || !(await ok.isVisible())) return { clicked: true, confirmed: false, noVisibleQuestion: true, log: logs.slice(n).filter(x => /§(CRUD|FORM-PILL|DEL-)/.test(x)).slice(0, 3) };
    await ok.click(); await page.waitForTimeout(1500);
    return { clicked: true, confirmed: true, log: logs.slice(n).filter(x => /§(CRUD-PERSIST|CRUD-GATE|MODEL-SAVE-ROLLBACK|MODEL-DELETE|DEL-|BIM_PUSH)/.test(x)).map(x => x.slice(0, 170)), toasts: await page.evaluate(() => Array.from(document.querySelectorAll('.crud-toast')).map(t => t.textContent.slice(0, 120))), view: await page.evaluate(() => ({ grid: document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]').length, form: !!document.querySelector('#idmp-inline-mount .cfrow') })) }; };
  const quiet = async () => { for (let i = 0; i < 40; i++) { const n = logs.length; await page.waitForTimeout(2000); if (logs.length === n) return i; } return -1; };   // the order form's lookups render for seconds, and each pass re-bases the dirty check
  const sum = (x) => Math.round(x * 1000) / 1000;
  try {
    // ── the viewer's push store: a copy of the seed + a project with phases, tasks, lines, and two draft orders (rows cloned from shipped rows, so every NOT-NULL column is real)
    await page.goto(base + '/erp/idempiere.html?seed=ad_seed.db', { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.SQL, null, { timeout: 60000 });
    const seeded = await page.evaluate(async (ids) => {
      const db = new window.SQL.Database(new Uint8Array(await (await fetch('ad_seed.db', { cache: 'reload' })).arrayBuffer()));
      const clone = (t, pk, from, id, over) => { const cols = db.exec("SELECT name FROM pragma_table_info('" + t + "')")[0].values.map(x => x[0]);
        const sel = cols.map(c => { const l = c.toLowerCase(); if (l === pk.toLowerCase()) return id; if (l === t.toLowerCase() + '_uu') return "'" + t + id + "'"; for (const k in over) if (k.toLowerCase() === l) return typeof over[k] === 'string' ? "'" + over[k] + "'" : (over[k] === null ? 'NULL' : over[k]); return '"' + c + '"'; });
        db.run('INSERT INTO "' + t + '" ("' + cols.join('","') + '") SELECT ' + sel.join(',') + ' FROM "' + t + '" WHERE "' + pk + '" = ' + from); };
      const LN = (id, ln, ph, tk, q, pr, com) => clone('C_ProjectLine', 'C_ProjectLine_ID', 990000, id, { C_Project_ID: ids.P, Line: ln, C_ProjectPhase_ID: ph, C_ProjectTask_ID: tk, PlannedQty: q, PlannedPrice: pr, PlannedAmt: q * pr, CommittedAmt: com, CommittedQty: 0, Processed: 'N', IsActive: 'Y', C_Order_ID: null, C_OrderPO_ID: null });
      clone('C_Project', 'C_Project_ID', 990000, ids.P, { Value: 'WDEL', Name: 'W-DELETE-PO', PlannedAmt: 3600, CommittedAmt: 0, IsCommitment: 'Y' });   // legacy shows a line's Committed fields only on a commitment project (AD_Field DisplayLogic)
      clone('C_ProjectPhase', 'C_ProjectPhase_ID', 990000, ids.PH, { C_Project_ID: ids.P, Name: 'Phase A', SeqNo: 10, PlannedAmt: 3500, CommittedAmt: 0 });
      clone('C_ProjectPhase', 'C_ProjectPhase_ID', 990000, ids.PH2, { C_Project_ID: ids.P, Name: 'Phase B', SeqNo: 20, PlannedAmt: 100, CommittedAmt: 0 });
      clone('C_ProjectTask', 'C_ProjectTask_ID', 990000, ids.T, { C_ProjectPhase_ID: ids.PH, Name: 'Task A1', SeqNo: 10, PlannedAmt: 3500, CommittedAmt: 0 });
      clone('C_ProjectTask', 'C_ProjectTask_ID', 990000, ids.T2, { C_ProjectPhase_ID: ids.PH2, Name: 'Task B1', SeqNo: 10, PlannedAmt: 100, CommittedAmt: 0 });
      LN(ids.L1, 10, ids.PH, ids.T, 10, 100, 11); LN(ids.L2, 20, ids.PH, ids.T, 10, 200, 22); LN(ids.L3, 30, ids.PH, ids.T, 5, 100, 33); LN(ids.L4, 10, ids.PH2, ids.T2, 1, 100, 44);
      clone('C_Order', 'C_Order_ID', 108, ids.O, { DocumentNo: '990401', DocStatus: 'DR', DocAction: 'CO', Processed: 'N', Posted: 'N', IsApproved: 'N', Processing: 'N', C_Project_ID: null });
      clone('C_Order', 'C_Order_ID', 108, ids.O2, { DocumentNo: '990402', DocStatus: 'DR', DocAction: 'CO', Processed: 'N', Posted: 'N', IsApproved: 'N', Processing: 'N', C_Project_ID: null });
      const from = db.exec('SELECT C_OrderLine_ID FROM C_OrderLine WHERE C_Order_ID=108 ORDER BY 1 LIMIT 1')[0].values[0][0];
      ids.OL.forEach((id, i) => clone('C_OrderLine', 'C_OrderLine_ID', from, id, { C_Order_ID: ids.O, Line: (i + 1) * 10, Processed: 'N', QtyDelivered: 0, QtyInvoiced: 0, QtyReserved: 0 }));
      clone('C_OrderLine', 'C_OrderLine_ID', from, ids.OL2, { C_Order_ID: ids.O2, Line: 10, Processed: 'N', QtyDelivered: 0, QtyInvoiced: 0, QtyReserved: 0 });
      // legacy refuses to delete an order a project line refers to: c_projectline.c_order_id = corder_cprojectline, confdeltype a
      db.run('UPDATE C_ProjectLine SET C_Order_ID=' + ids.O2 + ' WHERE C_ProjectLine_ID=' + ids.L4);
      const out = db.export(); db.close();
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis', { create: true }), w = await (await dir.getFileHandle('bim_project_orders.db', { create: true })).createWritable(); await w.write(out); await w.close(); return out.length;
    }, { P, PH, PH2, T, T2, L1, L2, L3, L4, O, O2, OL, OL2 });
    say('fixture store bytes=' + seeded);

    if (process.env.WDEL_ONLY !== 'C10') {   // WDEL_ONLY=C10 skips to the form-save arm while debugging it
    // C1 header: IsDeleteable=N (AD_Table 203). Legacy: button disabled (AbstractADWindowContent :2134-2136)
    await open(130, P);
    const ov = logs.filter(x => /§BIM_OVERLAY/.test(x)).pop(); say('overlay ' + ov);
    const c1b = await delBtn(), c1row = await tip('SELECT COUNT(*) n FROM C_Project WHERE C_Project_ID=' + P);
    if (!c1row[0].n) { inconclusive('C1', 'the pushed project is not visible, the fixture proves nothing', { ov }); throw new Error('no fixture'); }
    verdict('C1', 'C_Project (IsDeleteable=N): toolbar Delete disabled=' + c1b.disabled, c1b.present && c1b.disabled === true, c1b);

    // C2 the gate over the dictionary: every active tab, against the Java rule computed from the legacy DB's own rows
    let oracle = null; try { oracle = cp.execSync(`docker exec postgres psql -U adempiere -d idempiere -tA -F'|' -c "select t.ad_tab_id, t.isreadonly, tb.isdeleteable from ad_tab t join ad_table tb using(ad_table_id) where t.isactive='Y'"`, { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').map(l => l.split('|')); } catch (e) { oracle = null; }
    if (!oracle || !oracle.length) inconclusive('C2', 'legacy DB unreachable, the dictionary sweep judged nothing');
    else {
      const r = await page.evaluate((oracle) => { if (!window.AdGridTab || !AdGridTab.canDelete) return { missing: true };
        let same = 0, absent = 0; const diff = []; oracle.forEach(o => { const tm = window.__idmpDb.exec('SELECT t.AD_Tab_ID id, t.Name name, t.IsReadOnly ro, b.TableName tn FROM AD_Tab t JOIN AD_Table b USING(AD_Table_ID) WHERE t.AD_Tab_ID=' + o[0]);
          if (!tm.length) { absent++; return; } const v = tm[0].values[0], m = AdGridTab.open(window.__idmpDb, [{ id: v[0], name: v[1], tableName: v[3], tabLevel: 0, isReadOnly: v[2] === 'Y', fields: [] }], 0), mine = AdGridTab.canDelete(m, {}), java = o[1] !== 'Y' && o[2] === 'Y';
          if (mine === java) same++; else diff.push([o[0], v[1], v[3], 'mine=' + mine, 'java=' + java]); }); return { same, absent, diff: diff.slice(0, 8), nDiff: diff.length }; }, oracle);
      verdict('C2', 'canDelete == GridTab.isDeleteRecord over the dictionary: ' + (r.missing ? 'canDelete absent' : r.same + ' of ' + (oracle.length - r.absent) + ' active tabs (' + r.absent + ' not in seed)'), !r.missing && r.nDiff === 0 && r.same > 0, r);
    }

    // C4 a pushed Task Line deleted through the UI, then a reload
    await tab('Phase'); await tab('Task'); await tab('Task Line'); await toGrid(); await page.waitForTimeout(500);
    const before = await rows(); say('Task Line rows before=' + JSON.stringify(before));
    if (before.indexOf(String(L1)) < 0) { inconclusive('C4', 'the fixture line is not on the grid', { before }); }
    else {
      await selectRow(L1); const d4 = await doDelete(); say('delete L1 ' + JSON.stringify(d4));
      const after = await rows();
      verdict('C4a', 'a deleted Task Line leaves the grid: ' + before.length + ' -> ' + after.length, d4.confirmed && after.length === before.length - 1 && after.indexOf(String(L1)) < 0, { d4, after });
      // C5 rollup, read straight after the delete (afterDelete -> updateHeader :279-320)
      const q5 = await tip(`SELECT (SELECT PlannedAmt FROM C_ProjectTask WHERE C_ProjectTask_ID=${T}) t, (SELECT CommittedAmt FROM C_ProjectTask WHERE C_ProjectTask_ID=${T}) tc, (SELECT PlannedAmt FROM C_ProjectPhase WHERE C_ProjectPhase_ID=${PH}) ph, (SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=${P}) p, (SELECT PlannedQty FROM C_Project WHERE C_Project_ID=${P}) pq, (SELECT CommittedAmt FROM C_Project WHERE C_Project_ID=${P}) pc`);
      verdict('C5', 'rollup after delete (legacy SUM over the 3 lines left): task ' + q5[0].t + ' =2500, task committed ' + q5[0].tc + ' =55, phase ' + q5[0].ph + ' =2500, project ' + q5[0].p + ' =2600, project qty ' + q5[0].pq + ' =16, project committed ' + q5[0].pc + ' =99',
        sum(q5[0].t) === 2500 && sum(q5[0].tc) === 55 && sum(q5[0].ph) === 2500 && sum(q5[0].p) === 2600 && sum(q5[0].pq) === 16 && sum(q5[0].pc) === 99, q5[0]);
      // reload: does the row come back? (the §BIM-CRUD suspicion)
      await open(130, P); await tab('Phase'); await tab('Task'); await tab('Task Line'); await toGrid(); await page.waitForTimeout(500);
      const reloaded = await rows(), tipN = await tip('SELECT COUNT(*) n FROM C_ProjectLine WHERE C_ProjectLine_ID=' + L1), sN = await store('SELECT COUNT(*) FROM C_ProjectLine WHERE C_ProjectLine_ID=' + L1);
      verdict('C4b', 'after reload the line stays gone: grid has it=' + (reloaded.indexOf(String(L1)) >= 0) + ', tip count=' + tipN[0].n, reloaded.indexOf(String(L1)) < 0 && tipN[0].n === 0, { reloaded, tipN });
      verdict('C4c', 'the delete reached the viewer push store (user 2026-10-07 "an ERP delete writes through"): store count=' + JSON.stringify(sN), Array.isArray(sN) && sN[0][0] === 0, sN);
      const s5 = await store(`SELECT (SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=${P}), (SELECT CommittedAmt FROM C_Project WHERE C_Project_ID=${P})`);
      verdict('C5b', 'the rollup reached the viewer push store too (§PROJ-VARIANCE gap 2): project planned/committed=' + JSON.stringify(s5) + ' expected [2600,99]', Array.isArray(s5) && sum(s5[0][0]) === 2600 && sum(s5[0][1]) === 99, s5);
    }

    // C11 the History reverses the delete, after a reload (the viewer's table no longer holds the row): ERP and store both get it back
    await open(130, P); await quiet(); const n11 = logs.length; let back = 0;   // the newest ops are this reload's own (a window open writes AD_RecentItem), so step back until the delete's group is reversed, as the History scrubber does
    for (; back < 8; back++) { const has = await tip('SELECT COUNT(*) n FROM C_ProjectLine WHERE C_ProjectLine_ID=' + L1); if (has[0].n) break; await page.evaluate(() => window.__crud.foldBack('c_projectline', '', '')); await page.waitForTimeout(900); } await page.waitForTimeout(1500);
    say('C11 steps=' + back + ' ' + JSON.stringify(logs.slice(n11).filter(x => /§(FOLD-BACK|BIM_PUSH)/.test(x)).map(x => x.slice(0, 170))));
    const t11 = await tip(`SELECT (SELECT COUNT(*) FROM C_ProjectLine WHERE C_ProjectLine_ID=${L1}) n, (SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=${P}) p`), s11 = await store(`SELECT (SELECT COUNT(*) FROM C_ProjectLine WHERE C_ProjectLine_ID=${L1}), (SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=${P})`);
    if (back === 0) inconclusive('C11', 'the line was never deleted, so there was no delete to reverse (vacuous on a tree where the delete did not happen)');
    else verdict('C11', 'History reverses the delete after a reload: ERP has the line ' + t11[0].n + ' =1, project ' + t11[0].p + ' =3600; store line ' + (s11[0] && s11[0][0]) + ' =1, project ' + (s11[0] && s11[0][1]) + ' =3600', t11[0].n === 1 && sum(t11[0].p) === 3600 && s11[0] && s11[0][0] === 1 && sum(s11[0][1]) === 3600, { t11, s11 });

    // C6 Phase: legacy DB rule on C_ProjectPhase = C_ProjectTask cascade (c), C_ProjectLine set null (n)
    await open(130, P); await tab('Phase'); await toGrid(); await selectRow(PH2);
    const d6 = await doDelete(); say('delete phase ' + JSON.stringify(d6));
    const q6 = await tip(`SELECT (SELECT COUNT(*) FROM C_ProjectPhase WHERE C_ProjectPhase_ID=${PH2}) ph, (SELECT COUNT(*) FROM C_ProjectTask WHERE C_ProjectTask_ID=${T2}) t, (SELECT COUNT(*) FROM C_ProjectLine WHERE C_ProjectLine_ID=${L4}) l, (SELECT C_ProjectPhase_ID FROM C_ProjectLine WHERE C_ProjectLine_ID=${L4}) lp, (SELECT C_ProjectTask_ID FROM C_ProjectLine WHERE C_ProjectLine_ID=${L4}) lt`);
    verdict('C6', 'Phase delete = the legacy FK rules: phase gone ' + q6[0].ph + ' =0, its task cascaded ' + q6[0].t + ' =0, its line kept ' + q6[0].l + ' =1 with phase ' + q6[0].lp + ' and task ' + q6[0].lt + ' = null', q6[0].ph === 0 && q6[0].t === 0 && q6[0].l === 1 && q6[0].lp == null && q6[0].lt == null, q6[0]);

    // C12 the next viewer push does not reuse a deleted id: 990102 was the highest phase id, its tombstone would hide a new row
    await page.addScriptTag({ url: '/viewer/proj_fold.js' });
    const c12 = await page.evaluate(async () => { if (!window.ProjFold || !ProjFold._allocator) return { missing: true };
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis'), f = await (await dir.getFileHandle('bim_project_orders.db')).getFile(), db = new window.SQL.Database(new Uint8Array(await f.arrayBuffer())); const v = ProjFold._allocator(db)('C_ProjectPhase', 'C_ProjectPhase_ID'), mainMax = db.exec('SELECT MAX(C_ProjectPhase_ID) FROM C_ProjectPhase')[0].values[0][0]; db.close(); return { next: v, mainMax }; }).catch(e => ({ err: e.message }));
    verdict('C12', 'next phase id after deleting the highest: ' + c12.next + ' (viewer table max ' + c12.mainMax + ', deleted ' + PH2 + ')', c12.next > PH2, c12);

    // C3 processed: shipped completed order
    await open(143, 108); const c3 = await delBtn(); verdict('C3', 'completed order 108: toolbar Delete disabled=' + c3.disabled + ' (:2136 !processed)', c3.present && c3.disabled === true, c3);

    // C7 a draft order's line deleted through the UI -> MOrderLine.afterDelete recalculates the header
    await open(143, O); await tab('Order Line'); await toGrid(); await page.waitForTimeout(400);
    const b7 = await tip(`SELECT (SELECT TotalLines FROM C_Order WHERE C_Order_ID=${O}) tl, (SELECT SUM(LineNetAmt) FROM C_OrderLine WHERE C_Order_ID=${O}) s, (SELECT LineNetAmt FROM C_OrderLine WHERE C_OrderLine_ID=${OL[0]}) one`);
    await selectRow(OL[0]); const d7 = await doDelete(); say('delete order line ' + JSON.stringify(d7));
    const a7 = await tip(`SELECT (SELECT TotalLines FROM C_Order WHERE C_Order_ID=${O}) tl, (SELECT SUM(LineNetAmt) FROM C_OrderLine WHERE C_Order_ID=${O}) s, (SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=${O}) n`);
    verdict('C7', 'order line delete recalculates the header (MOrderLine.afterDelete): before ' + JSON.stringify(b7[0]) + ' after ' + JSON.stringify(a7[0]), a7[0].n === 2 && sum(a7[0].tl) === sum(a7[0].s), { b7, a7, d7 });

    // C8a an order a project line refers to: refused (c_projectline.c_order_id is confdeltype a) ... L4 kept the reference through C6
    await open(143, O2); const d8a = await doDelete(); say('delete referenced order ' + JSON.stringify(d8a));
    const q8a = await tip('SELECT COUNT(*) n FROM C_Order WHERE C_Order_ID=' + O2), msg = (d8a.toasts || []).find(x => /dependent record found/.test(x)) || null;   // what the user reads, not only the log
    verdict('C8a', 'a referenced draft order is refused: order still there=' + q8a[0].n + ', message ' + msg, q8a[0].n === 1 && !!msg, { d8a, q8a });
    // C8b an unreferenced draft order: model cascade removes its lines (C_OrderLine.C_Order_ID FKConstraintType=M), database cascade its tax rows
    await open(143, O); const d8b = await doDelete(); say('delete draft order ' + JSON.stringify(d8b));
    const q8b = await tip(`SELECT (SELECT COUNT(*) FROM C_Order WHERE C_Order_ID=${O}) o, (SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=${O}) l, (SELECT COUNT(*) FROM C_OrderTax WHERE C_Order_ID=${O}) t`);
    verdict('C8b', 'draft order delete: order ' + q8b[0].o + ' =0, lines ' + q8b[0].l + ' =0, tax rows ' + q8b[0].t + ' =0', q8b[0].o === 0 && q8b[0].l === 0 && q8b[0].t === 0, { q8b, d8b });

    }
    // C10 the user who did not create a record can edit it: shipped orders are CreatedBy=100, the session is GardenAdmin. Legacy: MRole.canUpdate only.
    const mark10 = logs.length; await open(143, O2); const c10 = await page.evaluate(async (id) => { const b = await new Promise(r => window.__crud.withTipQuery(q => r(q('SELECT CreatedBy c FROM C_Order WHERE C_Order_ID=' + id)[0].c))); return { createdBy: b, actor: window.APP && window.APP.actor }; }, O2);
    for (let i = 0; i < 40 && !logs.slice(mark10).some(x => /§ADMIN3-CHANGEAUDIT rebuilt/.test(x)); i++) await page.waitForTimeout(500);   // the login-time rebuild ends in a form remount that clears the dirty state (named in §DEL-RESULT)
    say('C10 form settled after ' + await quiet() + ' waits, remounts so far=' + logs.filter(x => /§INPLACE-EDIT table=c_order id=990402/.test(x)).length); const n10 = logs.length, fld = page.locator('#idmp-inline-mount input[data-col="description"], #idmp-inline-mount textarea[data-col="description"]').first();
    if (!(await fld.count())) inconclusive('C10', 'no Description field on the order form, nothing was edited');
    else { const st = async (l) => say('C10 ' + l + ' ' + JSON.stringify(await page.evaluate(() => ({ dirty: window.__crud.inlineDirty(), needs: window.__crud.formNeedsSave(), val: (document.querySelector('#idmp-inline-mount input[data-col="description"], #idmp-inline-mount textarea[data-col="description"]') || {}).value, saveDis: (document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]') || {}).disabled }))) + ' mounts=' + logs.filter(x => /§INPLACE-EDIT/.test(x)).length);
      await st('before'); await fld.click(); await st('clicked'); await fld.fill(''); await st('cleared'); await page.keyboard.type('W-DELETE-PO C10'); await st('typed'); await page.keyboard.press('Tab'); await page.waitForTimeout(600); await st('tabbed'); await page.click('#idmp-toolbar [data-tb="save"]'); await page.waitForTimeout(1800);
      const q10 = await tip('SELECT Description d FROM C_Order WHERE C_Order_ID=' + O2), l10 = logs.slice(n10).filter(x => /§CRUD-GATE|§CRUD-PERSIST|REJECT|§FORM-PILL|§CRUD-VALID|§INPLACE|§SAVE|§CRUD-SAVE|§MODEL-ERR|§MODEL-SAVE/.test(x)).map(x => x.slice(0, 200)); say('C10 toasts ' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.crud-toast')).map(t => t.textContent))) + ' save disabled=' + await page.evaluate(() => { const b = document.querySelector('#idmp-toolbar [data-tb="save"]'); return b ? b.disabled : 'absent'; }) + ' field=' + await fld.inputValue().catch(() => '?'));
      if (q10[0].d !== 'W-DELETE-PO C10') say('C10 raw ' + JSON.stringify(logs.slice(n10).filter(x => /§INPLACE|§INLINE|§FORM-PILL|§CRUD-PERSIST/.test(x)).map(x => x.slice(0, 130)).slice(-12)));
      verdict('C10', 'a non-creator saves a draft order through the form: createdBy ' + c10.createdBy + ', session user ' + c10.actor + ', Description=' + q10[0].d + ', ' + JSON.stringify(l10), String(c10.createdBy) !== String(c10.actor) && q10[0].d === 'W-DELETE-PO C10', { c10, q10, l10 }); }

    // C13 the ordinary second edit: reload the order just saved, edit it again. A form that loses track of its own inputs answers "No changes" to a real change.
    const mark13 = logs.length; await open(143, O2); for (let i = 0; i < 40 && !logs.slice(mark13).some(x => /§ADMIN3-CHANGEAUDIT rebuilt/.test(x)); i++) await page.waitForTimeout(500); await quiet();
    const f13 = page.locator('#idmp-inline-mount input[data-col="description"], #idmp-inline-mount textarea[data-col="description"]').first(); await f13.click(); await f13.fill(''); await page.keyboard.type('second edit'); await page.keyboard.press('Tab'); await page.waitForTimeout(600);
    const d13 = await page.evaluate(() => window.__crud.inlineDirty()); await page.click('#idmp-toolbar [data-tb="save"]'); await page.waitForTimeout(1800); const q13 = await tip('SELECT Description d FROM C_Order WHERE C_Order_ID=' + O2);
    verdict('C13', 'a second edit after a reload saves: dirty=' + d13 + ', Description=' + q13[0].d, q13[0].d === 'second edit', { d13, q13 });

    // C14 §PROJ-VARIANCE: Committed typed on a line rolls up, and PlannedAmt is derived, through the form's own Save (MProjectLine.beforeSave + afterSave -> updateHeader), and the viewer's store gets it
    const mark14 = logs.length; await open(130, P); for (let i = 0; i < 40 && !logs.slice(mark14).some(x => /§ADMIN3-CHANGEAUDIT rebuilt/.test(x)); i++) await page.waitForTimeout(500);
    await tab('Phase'); await tab('Task'); await tab('Task Line'); await quiet();
    const on = await page.evaluate(() => !!document.querySelector('#idmp-inline-mount input[data-col="committedamt"]')); if (!on) { await page.click('#idmp-toolbar [data-tb="toggle"]'); await page.waitForTimeout(1500); await quiet(); }
    const cur14 = await page.evaluate(() => { const m = document.querySelector('[data-ad-table="C_ProjectLine"][data-ad-record]'); return m ? Number(m.getAttribute('data-ad-record')) : null; });
    const setF = async (col, v) => { const f = page.locator('#idmp-inline-mount input[data-col="' + col + '"]').first(); await f.click(); await f.fill(''); await page.keyboard.type(String(v)); await page.keyboard.press('Tab'); await page.waitForTimeout(500); };
    if (!cur14 || !(await page.locator('#idmp-inline-mount input[data-col="committedamt"]').count())) inconclusive('C14', 'no form on a Task Line, nothing was edited', { cur14 });
    else { await setF('committedamt', 1000); await setF('plannedqty', 7); await page.click('#idmp-toolbar [data-tb="save"]'); await page.waitForTimeout(2200);
      const q14 = await tip(`SELECT (SELECT PlannedAmt FROM C_ProjectLine WHERE C_ProjectLine_ID=${cur14}) la, (SELECT PlannedPrice FROM C_ProjectLine WHERE C_ProjectLine_ID=${cur14}) lp, (SELECT CommittedAmt FROM C_ProjectLine WHERE C_ProjectLine_ID=${cur14}) lc, (SELECT C_ProjectPhase_ID FROM C_ProjectLine WHERE C_ProjectLine_ID=${cur14}) ph, (SELECT C_ProjectTask_ID FROM C_ProjectLine WHERE C_ProjectLine_ID=${cur14}) tk`);
      const ex = await tip(`SELECT (SELECT SUM(CommittedAmt) FROM C_ProjectLine WHERE C_Project_ID=${P} AND IsActive='Y') pc, (SELECT SUM(PlannedAmt) FROM C_ProjectLine WHERE C_Project_ID=${P} AND IsActive='Y') pp, (SELECT SUM(CommittedAmt) FROM C_ProjectLine WHERE C_ProjectTask_ID=${q14[0].tk} AND IsActive='Y') tc, (SELECT CommittedAmt FROM C_Project WHERE C_Project_ID=${P}) hc, (SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=${P}) hp, (SELECT CommittedAmt FROM C_ProjectTask WHERE C_ProjectTask_ID=${q14[0].tk}) htc, (SELECT CommittedAmt FROM C_ProjectPhase WHERE C_ProjectPhase_ID=${q14[0].ph}) hpc`);
      const s14 = await store(`SELECT CommittedAmt, PlannedAmt FROM C_Project WHERE C_Project_ID=${P}`), e = ex[0];
      verdict('C14', 'a line saved through the form: Committed ' + q14[0].lc + ' =1000, PlannedAmt ' + q14[0].la + ' =7x' + q14[0].lp + '; header == legacy SUM: project committed ' + e.hc + ' =' + e.pc + ', planned ' + e.hp + ' =' + e.pp + ', task committed ' + e.htc + ' =' + e.tc + ', phase committed ' + e.hpc + '; store project ' + JSON.stringify(s14),
        sum(q14[0].lc) === 1000 && sum(q14[0].la) === sum(7 * q14[0].lp) && sum(e.hc) === sum(e.pc) && sum(e.hp) === sum(e.pp) && sum(e.htc) === sum(e.tc) && e.hc > 1000 && Array.isArray(s14) && sum(s14[0][0]) === sum(e.pc) && sum(s14[0][1]) === sum(e.pp), { q14, ex, s14 }); }

    // C9 the FK plan against the legacy database, both ways: every constraint is planned with its rule, and nothing is planned the database does not enforce (a false refusal)
    let pg = null; try { pg = cp.execSync(`docker exec postgres psql -U adempiere -d idempiere -tA -F'|' -c "select lower(c.conrelid::regclass::text), lower(a.attname), lower(c.confrelid::regclass::text), c.confdeltype from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.connamespace='adempiere'::regnamespace and array_length(c.conkey,1)=1"`, { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').map(l => l.split('|').map(s => s.replace(/^adempiere\./, ''))); } catch (e) { pg = null; }
    let pgTables = null; try { pgTables = cp.execSync(`docker exec postgres psql -U adempiere -d idempiere -tA -c "select lower(tablename) from pg_tables where schemaname='adempiere'"`, { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n'); } catch (e) { pgTables = null; }
    if (!pg || !pg.length) inconclusive('C9', 'legacy DB unreachable, FK plan unjudged');
    else {
      const r = await page.evaluate(([pg, pgTables]) => { const ML = window.ModelLayer, legacyHas = pgTables ? new Set(pgTables) : null; let notInLegacy = 0; if (!ML || !ML.fkPlan) return { missing: true };
        const q = (sql, p) => { const s = window.__idmpDb.prepare(sql); if (p) s.bind(p); const o = []; while (s.step()) { const g = s.getAsObject(), l = {}; for (const k in g) l[k.toLowerCase()] = g[k]; o.push(l); } s.free(); return o; };
        const has = q("SELECT lower(name) n FROM sqlite_master WHERE type='table'").map(x => x.n), hs = new Set(has), want = { a: 'N', c: 'C', n: 'S' }, plan = new Map(), pm = new Map();
        has.forEach(t => ML.fkPlan(q, t).forEach(p => plan.set(p.table + '.' + p.column + '.' + t, p.rule)));
        let same = 0, noTbl = 0; const miss = [], wrong = [], extra = [];
        pg.forEach(c => { const k = c[0] + '.' + c[1] + '.' + c[2], got = plan.get(k); pm.set(k, c[3]); if (!hs.has(c[0]) || !hs.has(c[2])) { noTbl++; return; } if (got == null) miss.push(k); else if (got === want[c[3]] || (c[3] === 'a' && got === 'M')) same++; else wrong.push(k + ' pg=' + c[3] + ' plan=' + got); });
        plan.forEach((v, k) => { if (pm.has(k)) return; const t = k.split('.')[0]; if (legacyHas && !legacyHas.has(t)) { notInLegacy++; return; } extra.push(k); });   // a table legacy does not have (a plugin's own): its plan is the dictionary's, the oracle cannot judge it - counted apart
        return { same, noTbl, miss: miss.slice(0, 10), nMiss: miss.length, wrong: wrong.slice(0, 10), nWrong: wrong.length, extra: extra.slice(0, 10), nExtra: extra.length, notInLegacy: notInLegacy }; }, [pg, pgTables]);
      verdict('C9', 'FK plan == pg_constraint: ' + (r.missing ? 'fkPlan absent' : r.same + ' agree, ' + r.nMiss + ' unplanned, ' + r.nWrong + ' wrong rule, ' + r.nExtra + ' planned but not in the database (' + r.noTbl + ' constraints on tables the seed lacks; ' + r.notInLegacy + ' planned on tables legacy does not have, not judged)'), !r.missing && r.same > 0 && !r.nMiss && !r.nWrong && !r.nExtra, r);
    }
    // C15 §FB4 the toolbar Delete on TICKED grid rows = legacy onDeleteSelected (AbstractADWindowContent :3216-3262): one question "<window> - N Selected" / DeleteSelection, each ticked row deleted by the
    //   same delete as a single record, "Deleted: N", the rows still gone after a reload. ISSUE: ticked rows were ignored, only the current record was deleted.
    { await open(130, P); await tab('Phase'); await tab('Task'); await tab('Task Line'); await toGrid(); await page.waitForTimeout(600);
      const b15 = await rows();
      if (b15.length < 3) inconclusive('C15', 'fewer than 3 Task Lines left on the grid: two ticked + one kept cannot be judged', { b15 });
      else { const pick = b15.slice(1, 3), keep = b15[0];   // the current row (first) is NOT ticked: on main it alone would be deleted
        await selectRow(keep);
        for (const k of pick) { await page.evaluate((k) => { const c = document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k + '"] input[type="checkbox"]'); if (c && !c.checked) c.click(); }, k); await page.waitForTimeout(250); }
        const n15 = logs.length; await page.click('#idmp-toolbar [data-tb="delete"]'); await page.waitForTimeout(500);
        const q15 = await page.evaluate(() => ({ title: (document.querySelector('#idmp-delete-ov [data-del-title]') || {}).textContent || null, msg: (document.querySelector('#idmp-delete-ov [data-del-msg]') || {}).textContent || null }));
        const ok15 = page.locator('#idmp-delete-ov [data-del-ok]'); if (await ok15.count()) await ok15.click();
        for (let i = 0; i < 40 && !logs.slice(n15).some(x => /§DEL-SELECTED /.test(x)); i++) await page.waitForTimeout(250);
        await page.waitForTimeout(1500);
        const line15 = logs.slice(n15).filter(x => /§DEL-SELECTED /.test(x))[0] || null, a15 = await rows(), st15 = await page.evaluate(() => (document.getElementById('idmp-status') || {}).textContent || '');
        await open(130, P); await tab('Phase'); await tab('Task'); await tab('Task Line'); await toGrid(); await page.waitForTimeout(600); const r15 = await rows();
        const tip15 = await tip('SELECT count(*) n FROM C_ProjectLine WHERE C_ProjectLine_ID IN (' + pick.join(',') + ')');
        say('C15 question=' + JSON.stringify(q15) + ' line=' + line15 + ' status="' + st15.slice(0, 60) + '" rows ' + b15.length + ' -> ' + a15.length + ' reloaded=' + r15.length);
        verdict('C15', 'two ticked Task Lines deleted by one toolbar Delete (the unticked current row kept): rows ' + b15.length + ' -> ' + a15.length + ', after reload ' + r15.length + ', tip count ' + tip15[0].n,
          /2 Selected$/.test(String(q15.title || '').trim()) && !!q15.msg && !!line15 && /selected=2 deleted=2 refused=\[\]/.test(line15) && a15.length === b15.length - 2 && a15.indexOf(keep) >= 0 && pick.every(k => a15.indexOf(k) < 0 && r15.indexOf(k) < 0) && r15.indexOf(keep) >= 0 && tip15[0].n === 0, { q15, line15, a15, r15, tip15 }); } }
  } catch (e) { if (!/no fixture/.test(e.message)) { fails++; console.log('§WDEL ERROR ' + (e.stack || e)); } }
  console.log('§WDEL page errors ' + errs.length + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 3)) : ''));
  if (errs.length) fails++;
  console.log('§WDEL VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
