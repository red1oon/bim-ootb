// ⚠ DO NOT REMOVE — Scope guard
// W-ATTACH — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §ATT (phase 1). Real page, headless Chromium, SOFTWARE rendering only (--disable-gpu, no GPU).
//   READ erp/tests/witness_attach_live.log (verdicts) + witness_attach_live.page.log (every §ATT line) after EVERY run; an exit code is not evidence.
// THE ISSUES this proves or disproves:
//   A-1 SWEEP  GridTab.canHaveAttachment over the dictionary: of the N AD tabs (counted in node, from ad_seed.db, by its own SQL, never by the module under test),
//              how many draw an ENABLED Attachment button on a saved record, and does every ineligible tab draw it disabled? (X of N; tabs with no row to stand on are
//              counted NO-RECORD, never PASS.)
//   B-1 ROUND-TRIP on header / header+lines / detail tab: add 2 files -> OK -> reload -> list equals, bytes equal (sha256 against node's), Record_ID and AD_Table_ID of the row
//              are the record on screen, a second record has none, the BinaryData is a real zip (python zipfile: names, CRC, comment) -> delete one entry -> delete all.
//   B-2 PERSIST each commit is ONE signed op in ad_attachment and nothing else (§CRUD-GROUP-PERSIST ops=1).
//   R-1 RED    a tab with no key column shows no enabled button (judge fed an enabled button on such a tab MUST say FAIL).
//   R-2 RED    a corrupted zip is REFUSED with a message, not shown as an empty attachment (judge fed an empty list with no message MUST say FAIL).
//   C-1 CAP    the DB method's size cap: cap-8KB stays in the DB zip (store=0), cap+64KB goes to the file store (phase 2, store=1, not refused); both read back, hash equal, and survive a reload.
// Verdict per arm: PASS | FAIL | INCONCLUSIVE(reason). INCONCLUSIVE when nothing was judged (N=0, no window driven).
// Run: NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_attach_live.js   (AT_PART=sweep|rt|red|cap to limit; AT_WORKERS=4; AT_ONLY=143,181 limits the sweep)
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const REPO = path.join(__dirname, '..', '..');
const LOGF = path.join(__dirname, 'witness_attach_live.log'), PAGELOGF = path.join(__dirname, 'witness_attach_live.page.log');
const PART = process.env.AT_PART || 'all', WORKERS = Number(process.env.AT_WORKERS || 4);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.zip': 'application/zip', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf); });
});
const OUT = [], PAGELOG = []; const say = s => { OUT.push(s); console.log(s); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// deterministic bytes (xorshift): a binary file that does not compress, and a text file
function prng(n, seed) { const o = Buffer.alloc(n); let x = seed >>> 0 || 1; for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; o[i] = x & 255; } return o; }
const FILES = [{ name: 'plan_A.bin', mimeType: 'application/octet-stream', buffer: prng(7000, 12345) }, { name: 'note_B.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment round trip éè line2\n'.repeat(40)) }];

// ── the judges (pure; each is fed a deliberately wrong input by its red control, and must say FAIL) ──
const judgeTab = (eligible, enabled) => eligible === enabled ? 'PASS' : 'FAIL';                       // R-1/A-1: enabled <=> canHaveAttachment (on a saved record)
const judgeCorrupt = (shownEntries, shownError) => (shownError && shownEntries === 0) ? 'PASS' : 'FAIL';   // R-2: refused with a message, and no (empty) list shown

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db'))));
  const Q = (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; };
  const has = t => Q("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [t]).length > 0;
  const access = (role, w) => Q("SELECT 1 FROM AD_Window_Access WHERE AD_Role_ID=? AND AD_Window_ID=? AND IsActive='Y'", [role, w]).length > 0;

  // ── population N: GridTab.canHaveAttachment from the dictionary alone: key = the tab's field whose column IsKey, UU = a field named <Table>_UU ──
  const TABS = [];
  for (const [wid, wname] of Q("SELECT AD_Window_ID, Name FROM AD_Window WHERE IsActive='Y' ORDER BY AD_Window_ID")) {
    const tabs = Q("SELECT t.AD_Tab_ID, t.Name, tb.TableName, tb.AD_Table_ID FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=? AND t.IsActive='Y' ORDER BY t.SeqNo", [wid]);
    tabs.forEach(([tid, tname, table, tableId], idx) => {
      const cols = Q("SELECT c.ColumnName, c.IsKey FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=? AND f.IsActive='Y' ORDER BY f.SeqNo, f.AD_Field_ID", [tid]);
      let key = ''; cols.forEach(([cn, ik]) => { if (ik === 'Y') key = cn; });
      const uu = cols.some(([cn]) => String(cn).toLowerCase() === String(table).toLowerCase() + '_uu');
      TABS.push({ wid, wname, idx, tid, tname, table, tableId, key, eligible: /_ID$/.test(key) || /_UU$/.test(key) || uu, inSeed: has(table) });
    });
  }
  const N = TABS.filter(t => t.eligible).length;
  say('§W-ATTACH population tabs=' + TABS.length + ' eligible(N)=' + N + ' ineligible=' + (TABS.length - N) + ' (from ad_seed.db by the witness\'s own SQL)');
  const BPREC = Q("SELECT C_BPartner_ID FROM C_BPartner WHERE AD_Client_ID=11 ORDER BY C_BPartner_ID LIMIT 1")[0][0];
  const uuCache = {}; const uuRows = t => { if (!(t in uuCache)) { try { uuCache[t] = Q('SELECT count(*) FROM ' + t + ' WHERE ' + t + '_uu IS NOT NULL AND ' + t + "_uu<>''")[0][0]; } catch (e) { uuCache[t] = 0; } } return uuCache[t]; };
  const tableIdOf = n => Number(Q("SELECT AD_Table_ID FROM AD_Table WHERE lower(TableName)=lower(?)", [n])[0][0]);
  const loginFor = wid => access(102, wid) ? 'GardenAdmin' : null;   // ?login= takes the user's first role; only role 102's windows are reachable (a window outside the role's menu cannot be opened by any user)

  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-gpu-compositing'] });
  const VERD = [];
  const verdict = (arm, v, why) => { VERD.push({ arm, v }); say('§W-ATTACH-VERDICT ' + arm + ' ' + v + (why ? ' — ' + why : '')); };

  async function newPage(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const PL = [];
    page.on('console', m => { const t = m.text(); PL.push(t); PAGELOG.push('[' + tag + '] ' + t); });
    page.on('pageerror', e => { PL.push('PAGEERR ' + e); PAGELOG.push('[' + tag + '] PAGEERR ' + e); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return { ctx, page, PL };
  }
  async function openWin(page, login, wid, record, tmo) {
    for (let g = 0; g < 3; g++) {
      try { await page.goto('about:blank'); await page.goto(base + '?login=' + login + '&window=' + wid + (record != null ? '&record=' + record : ''), { waitUntil: 'load' }); break; }
      catch (e) { if (g === 2) throw e; await sleep(1500); }
    }
    await page.waitForFunction(() => document.querySelector('#idmp-toolbar button[data-tb="new"]') && window.IdmpGridTab, null, { timeout: tmo || 40000 });
    await sleep(900);
  }
  const attBtn = page => page.evaluate(() => { const b = document.querySelector('#idmp-toolbar button[data-tb="attachment"]'); return b ? { disabled: b.disabled, active: b.classList.contains('active') } : null; });
  const snap = page => page.evaluate(() => window.IdmpGridTab.snapshot());
  async function waitAtt(page, ms) { for (let i = 0; i < (ms || 30000) / 250; i++) { const b = await attBtn(page); if (b && !b.disabled) return b; await sleep(250); } return await attBtn(page); }
  const clickTab = async (page, i) => { for (let a = 0; ; a++) { try { await page.click('#idmp-tabstrip .idmp-adtab >> nth=' + i, { timeout: 8000 }); break; } catch (e) { if (a >= 1) throw e; await sleep(1500); } } await sleep(900); };

  // ════════ A-1 sweep ════════
  if (PART === 'all' || PART === 'sweep') {
    const ONLY = process.env.AT_ONLY ? process.env.AT_ONLY.split(',').map(Number) : null;
    const allWins = [...new Set(TABS.map(t => t.wid))].filter(w => !ONLY || ONLY.includes(w)), wins = allWins.filter(w => loginFor(w));
    const noRoleTabs = allWins.filter(w => !loginFor(w)).reduce((n, w) => n + TABS.filter(t => t.wid === w && t.eligible).length, 0);
    say('§W-ATTACH-SWEEP windows total=' + allWins.length + ' reachable-by-role-102=' + wins.length + ' eligible tabs in windows outside the role=' + noRoleTabs);
    const queue = wins.slice(); const R = { X: 0, Nelig: 0, drivenElig: 0, noRecElig: 0, notOpenedElig: 0, inelDriven: 0, inelBad: [], eligBad: [], winFail: [], tabFail: [], stale: [], noKeyRec: [] };
    const tabsOf = w => TABS.filter(t => t.wid === w);
    for (const w of wins) tabsOf(w).forEach(t => { if (t.eligible) R.Nelig++; });
    async function worker(k) {
      let { ctx, page } = await newPage('s' + k);
      while (queue.length) {
        const w = queue.shift(); const T = tabsOf(w), tm = Date.now(); const done = new Set();
        const miss = t => { if (!done.has(t.idx)) { done.add(t.idx); if (t.eligible) R.notOpenedElig++; } };
        try {
          if (page.isClosed()) { try { await ctx.close(); } catch (e) { /* gone */ } ({ ctx, page } = await newPage('s' + k + 'r')); }
          await openWin(page, loginFor(w), w, null, 14000);
          const nTabs = await page.$$eval('#idmp-tabstrip .idmp-adtab', e => e.length);
          for (const t of T) {
            try {
              if (t.idx >= nTabs) { miss(t); continue; }
              if (t.idx > 0) await clickTab(page, t.idx); else await sleep(300);
              let sn = null; try { sn = await snap(page); } catch (e) { /* tab did not render */ }
              if (!sn || String(sn.table).toLowerCase() !== String(t.table).toLowerCase()) { miss(t); continue; }
              const hasRec = sn.rows.length > 0 && sn.currentKey != null && !sn.newMode;
              if (hasRec) await waitAtt(page, 3000);
              const b = await attBtn(page);
              if (!b) { miss(t); continue; }
              done.add(t.idx);
              if (!hasRec) { if (t.eligible) R.noRecElig++; else { R.inelDriven++; if (!b.disabled) R.inelBad.push(w + ':' + t.tname); } continue; }
              let v = judgeTab(t.eligible, !b.disabled);
              if (t.eligible && v === 'FAIL' && (sn.currentKey == null || sn.currentKey === '') && !uuRows(t.table)) {   // AbstractADWindowContent :2210 "No Key": record_ID == -1 and no Record_UU -> the legacy button is disabled too
                R.noKeyRec.push(w + ':' + t.tname + ':' + t.table); done.add(t.idx); continue;
              }
              if (t.eligible && v === 'FAIL') {   // a record-dependent button disabled on a saved record: is it the toolbar's staleness (rows arrived after the last draw; ZoomAcross is stale the same way) or the rule? One Refresh decides; counted apart, never as X.
                const z0 = await page.$eval('#idmp-toolbar button[data-tb="zoomacross"]', x => x.disabled).catch(() => null);
                await page.click('#idmp-toolbar button[data-tb="refresh"]', { timeout: 4000 }).catch(() => {}); await sleep(1500);
                const b2 = await attBtn(page);
                if (b2 && !b2.disabled) { R.stale.push(w + ':' + t.tname + ':' + t.table + ' (zoomacross disabled before refresh=' + z0 + ')'); done.add(t.idx); continue; }
              }
              if (t.eligible) { R.drivenElig++; if (v === 'PASS') R.X++; else R.eligBad.push(w + ':' + t.tname + ':' + t.table); }
              else { R.inelDriven++; if (v !== 'PASS') R.inelBad.push(w + ':' + t.tname + ':' + t.table); }
            } catch (e) { miss(t); R.tabFail.push(w + ':' + t.tname + ':' + String(e && e.message || e).split('\n')[0].slice(0, 60)); }
          }
        } catch (e) { T.forEach(miss); R.winFail.push(w + ':' + String(e && e.message || e).split('\n')[0].slice(0, 80)); }
        say('§W-ATTACH-SWEEP window=' + w + ' tabs=' + T.length + ' ms=' + (Date.now() - tm));
      }
      try { await ctx.close(); } catch (e) { /* gone */ }
    }
    await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
    say('§W-ATTACH-SWEEP-RESULT enabled-on-saved-record X=' + R.X + ' of N=' + R.Nelig + ' reachable-by-role (dictionary N=' + N + ') | driven eligible=' + R.drivenElig + ' no-record(eligible)=' + R.noRecElig + ' not-opened(eligible)=' + R.notOpenedElig +
      ' | ineligible driven=' + R.inelDriven + ' ineligible-with-enabled-button=' + R.inelBad.length + ' | window failures=' + R.winFail.length + ' tab-click failures=' + R.tabFail.length + ' | stale-toolbar(enabled only after Refresh)=' + R.stale.length + ' no-key-record(legacy disables too)=' + R.noKeyRec.length);
    if (R.noKeyRec.length) say('§W-ATTACH-SWEEP no-key-record (record has no _ID key value and the seed holds no _UU values; AbstractADWindowContent :2210 disables the button): ' + R.noKeyRec.join(' ; '));
    if (R.stale.length) say('§W-ATTACH-SWEEP stale-toolbar (pre-existing: rows reach the tab after the last toolbar draw): ' + R.stale.join(' ; '));
    if (R.eligBad.length) say('§W-ATTACH-SWEEP eligible-but-disabled: ' + R.eligBad.slice(0, 30).join(' ; ') + (R.eligBad.length > 30 ? ' …+' + (R.eligBad.length - 30) : ''));
    if (R.inelBad.length) say('§W-ATTACH-SWEEP ineligible-but-enabled: ' + R.inelBad.slice(0, 30).join(' ; '));
    if (R.winFail.length) say('§W-ATTACH-SWEEP window-failures: ' + R.winFail.slice(0, 20).join(' ; '));
    if (R.Nelig === 0 || R.drivenElig === 0) verdict('A-1 sweep', 'INCONCLUSIVE', 'N=' + R.Nelig + ' driven=' + R.drivenElig);
    else verdict('A-1 sweep', (R.eligBad.length === 0 && R.inelBad.length === 0) ? 'PASS' : 'FAIL', 'X=' + R.X + ' of N=' + R.Nelig + ' (driven ' + R.drivenElig + ', no-record ' + R.noRecElig + ', not-opened ' + R.notOpenedElig + '; stale-toolbar ' + R.stale.length + ', no-key-record ' + R.noKeyRec.length + '; ineligible driven ' + R.inelDriven + ', wrongly enabled ' + R.inelBad.length);
  }

  // ════════ B-1/B-2 round trip ════════
  const SHAPES = [   // header; header of a document that has lines; a detail tab (the lines) of that document
    { shape: 'header', wid: 123, tab: 0, recordSql: "SELECT C_BPartner_ID FROM C_BPartner WHERE AD_Client_ID=11 ORDER BY C_BPartner_ID LIMIT 1" },
    { shape: 'header+lines (header)', wid: 143, tab: 0, recordWith: 'C_OrderLine' },
    { shape: 'detail tab', wid: 143, tab: 1, recordWith: 'C_OrderLine' }];
  if (PART === 'all' || PART === 'rt') {
    const { ctx, page, PL } = await newPage('rt');
    for (const S of SHAPES) {
      const arm = 'B-1 round-trip ' + S.shape + ' (window ' + S.wid + ' tab ' + S.tab + ')'; const fails = [];
      try {
        const login = loginFor(S.wid); let rec = null;
        if (S.recordSql) rec = Q(S.recordSql)[0][0];
        if (S.recordWith) rec = Q("SELECT C_Order_ID FROM C_Order o WHERE EXISTS (SELECT 1 FROM C_OrderLine l WHERE l.C_Order_ID=o.C_Order_ID) AND IsSOTrx='Y' ORDER BY C_Order_ID LIMIT 1")[0][0];
        const nav = async () => { await openWin(page, login, S.wid, rec); if (S.tab > 0) await clickTab(page, S.tab); };
        await nav(); const b0 = await waitAtt(page, 30000);
        const s0 = await snap(page);
        if (!b0 || b0.disabled) { verdict(arm, 'INCONCLUSIVE', 'Attachment button not enabled (button=' + JSON.stringify(b0) + ' rows=' + s0.rows.length + ' current=' + s0.currentKey + ')'); continue; }
        const tableId = tableIdOf(s0.table), recId = Number(s0.currentKey), other = s0.rows.map(r => Number(r.pk)).find(p => p !== recId); const oth2 = other != null ? other : (Q('SELECT ' + s0.keyColumn + ' FROM ' + s0.table + ' WHERE ' + s0.keyColumn + '<>? ORDER BY 1 LIMIT 1', [recId])[0] || [])[0];
        if (b0.active) fails.push('button active before any attachment');
        // add 2 files
        let n = PL.length;
        await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 });
        await page.setInputFiles('[data-att="file"]', FILES); await sleep(900);
        const names1 = await page.$$eval('[data-att="entries"] option', o => o.map(x => x.textContent));
        if (JSON.stringify(names1) !== JSON.stringify(FILES.map(f => f.name))) fails.push('dialog list after add ' + JSON.stringify(names1));
        const hashLog = PL.slice(n).filter(l => /^§ATT hash /.test(l));
        FILES.forEach(f => { if (!hashLog.some(l => l.includes('name=' + f.name + ' sha256=' + sha(f.buffer)))) fails.push('§ATT hash line missing/different for ' + f.name); });
        n = PL.length; await page.click('[data-att="ok"]'); await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 15000 }); await sleep(900);
        const grp = PL.slice(n).filter(l => /^§CRUD-GROUP-PERSIST /.test(l));
        if (grp.length !== 1 || !/ops=1 /.test(grp[0] || '')) fails.push('B-2 commit groups=' + grp.length + ' ' + grp.join(' | '));
        if (!PL.slice(n).some(l => /^§ATT save op=create entries=2 /.test(l))) fails.push('no §ATT save op=create entries=2');
        const b1 = await attBtn(page); if (!b1.active) fails.push('button not active (pressed) after save');
        // reload: persistence
        await nav(); let b2 = await waitAtt(page, 30000); for (let i = 0; i < 40 && b2 && !b2.active; i++) { await sleep(250); b2 = await attBtn(page); }   // the pressed state repaints once the sidecar has hydrated
        if (!b2 || !b2.active) fails.push('after reload button active=' + (b2 && b2.active));
        const DB = await page.evaluate(async ([tid, rid, oth]) => {
          const A = window.AdAttachment, host = { rows: window.__tipRead.rows };
          const row = A.lookup(host, { tableId: tid, recordId: rid }), st = await A.load(row), hs = [];
          for (const e of st.entries) hs.push({ name: e.name, len: e.data.length, sha: await A.sha256(e.data) });
          return { row: row && { id: row.ad_attachment_id, title: row.title, record_uu: row.record_uu, bin: typeof row.binarydata === 'string' ? row.binarydata : null },
            entries: hs, otherHas: oth == null ? null : !!A.lookup(host, { tableId: tid, recordId: oth }),
            tableRows: window.__tipRead.rows('SELECT ad_table_id, record_id FROM ad_attachment WHERE ad_attachment_id=' + (row ? Number(row.ad_attachment_id) : -999))[0] || null };
        }, [tableId, recId, oth2 == null ? null : oth2]);
        if (!DB.row) fails.push('after reload no ad_attachment row for table=' + tableId + ' record=' + recId + ' | rows now: ' + JSON.stringify(await page.evaluate(() => window.__tipRead.rows('SELECT ad_attachment_id, ad_table_id, record_id, record_uu, title FROM ad_attachment'))));
        else {
          if (JSON.stringify(DB.entries.map(e => e.name)) !== JSON.stringify(FILES.map(f => f.name))) fails.push('list after reload ' + JSON.stringify(DB.entries.map(e => e.name)));
          FILES.forEach((f, i) => { const e = DB.entries[i]; if (!e || e.len !== f.buffer.length || e.sha !== sha(f.buffer)) fails.push('bytes differ for ' + f.name + ' got ' + (e && e.len) + '/' + (e && e.sha)); });
          if (!DB.tableRows || Number(DB.tableRows.record_id) !== recId || Number(DB.tableRows.ad_table_id) !== tableId) fails.push('row parent ' + JSON.stringify(DB.tableRows) + ' != table ' + tableId + ' record ' + recId);
          if (DB.row.title !== 'zip') fails.push('title=' + DB.row.title);
          // the BinaryData is a real zip: python's zipfile reads names, CRC and the archive comment
          const tmp = path.join(os.tmpdir(), 'att_' + process.pid + '.zip'); fs.writeFileSync(tmp, Buffer.from(DB.row.bin || '', 'base64'));
          const py = cp.spawnSync('python3', ['-I', '-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"bad":z.testzip(),"names":z.namelist(),"comment":z.comment.decode(),"methods":[i.compress_type for i in z.infolist()]}))', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp);
          let pz = null; try { pz = JSON.parse(py.stdout); } catch (e) { /* */ }
          say('§W-ATTACH zip ' + S.shape + ' python=' + (pz ? JSON.stringify(pz) : 'ERR ' + py.stderr.slice(0, 120)));
          if (!pz || pz.bad !== null || JSON.stringify(pz.names) !== JSON.stringify(FILES.map(f => f.name)) || pz.comment !== 'iDempiere' || pz.methods.some(m => m !== 8)) fails.push('BinaryData is not the AttachmentDBSystem zip layout');
        }
        if (DB.otherHas === true) fails.push('a second record (' + oth2 + ') also reports an attachment');
        say('§W-ATTACH rt ' + S.shape + ' table=' + tableId + ' record=' + recId + ' other=' + oth2 + ' otherHas=' + DB.otherHas + ' entries=' + JSON.stringify(DB.entries));
        // delete one entry (UI)
        n = PL.length; await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 }); await sleep(500);
        await page.selectOption('[data-att="entries"]', '0'); await page.click('[data-att="delete"]'); await page.click('[data-att="yes"]'); await sleep(1500);
        const names2 = await page.$$eval('[data-att="entries"] option', o => o.map(x => x.textContent));
        if (JSON.stringify(names2) !== JSON.stringify([FILES[1].name])) fails.push('after delete-one list ' + JSON.stringify(names2));
        if (!PL.slice(n).some(l => /^§ATT delete-entry name=plan_A.bin left=1/.test(l))) fails.push('no §ATT delete-entry line');
        const one = await page.evaluate(async ([tid, rid]) => { const A = window.AdAttachment, st = await A.load(A.lookup({ rows: window.__tipRead.rows }, { tableId: tid, recordId: rid })); return await Promise.all(st.entries.map(async e => ({ name: e.name, sha: await A.sha256(e.data) }))); }, [tableId, recId]);
        if (one.length !== 1 || one[0].sha !== sha(FILES[1].buffer)) fails.push('stored bytes after delete-one ' + JSON.stringify(one));
        // delete all (UI)
        n = PL.length; await page.click('[data-att="deleteall"]'); await page.click('[data-att="yes"]'); await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 15000 }); await sleep(900);
        const gone = await page.evaluate(([tid, rid]) => !window.AdAttachment.lookup({ rows: window.__tipRead.rows }, { tableId: tid, recordId: rid }), [tableId, recId]);
        const b3 = await attBtn(page);
        if (!gone) fails.push('row still present after delete-all'); if (b3.active) fails.push('button still active after delete-all');
        if (!PL.slice(n).some(l => /^§ATT delete-all ok=true op=delete/.test(l))) fails.push('no §ATT delete-all line');
        verdict(arm, fails.length ? 'FAIL' : 'PASS', fails.length ? fails.join(' ; ') : 'add 2 → reload → list+bytes(sha256) equal, parent table=' + tableId + ' record=' + recId + ', python zip ok, delete one → delete all');
      } catch (e) { verdict(arm, 'FAIL', 'harness ' + String(e && e.stack || e).slice(0, 300) + (fails.length ? ' | ' + fails.join(' ; ') : '')); }
    }
    await ctx.close();
  }

  // ════════ R-1 / R-2 red controls ════════
  if (PART === 'all' || PART === 'red') {
    // R-1: a real tab with no key column (dictionary) -> button disabled; and the judge, fed the opposite, says FAIL
    const noKey = TABS.filter(t => !t.eligible && t.inSeed && loginFor(t.wid)).slice(0, 400);
    let r1 = null;
    const { ctx, page, PL } = await newPage('red');
    for (const t of noKey) {
      try {
        await openWin(page, loginFor(t.wid), t.wid); if (t.idx > 0) await clickTab(page, t.idx); else await sleep(300);
        const sn = await snap(page); if (!sn || String(sn.table).toLowerCase() !== String(t.table).toLowerCase() || !sn.rows.length) continue;
        r1 = { t, sn }; break;
      } catch (e) { /* next */ }
    }
    if (!r1) verdict('R-1 no-key tab shows no enabled button', 'INCONCLUSIVE', 'no ineligible tab with a saved record could be opened (population ' + noKey.length + ')');
    else {
      const b = await attBtn(page), real = judgeTab(false, !(b && b.disabled));
      // the detector must be able to fail: force the module to claim the tab can have an attachment, redraw, judge again
      await page.evaluate(() => { window.__ca = window.AdAttachment.canHave; window.AdAttachment.canHave = () => true; });
      await clickTab(page, r1.t.idx === 0 ? 0 : r1.t.idx); await page.evaluate(() => document.querySelector('#idmp-toolbar button[data-tb="refresh"]').click()); await sleep(1200);
      const bf = await attBtn(page), forced = judgeTab(false, !(bf && bf.disabled));
      await page.evaluate(() => { window.AdAttachment.canHave = window.__ca; });
      say('§W-ATTACH-RED R-1 tab=' + r1.t.table + ' (window ' + r1.t.wid + ' key="' + r1.t.key + '") button=' + JSON.stringify(b) + ' judge=' + real + ' | control (canHave forced true) button=' + JSON.stringify(bf) + ' judge=' + forced);
      verdict('R-1 no-key tab shows no enabled button', (real === 'PASS' && forced === 'FAIL') ? 'PASS' : 'FAIL', 'real=' + real + ' control=' + forced + ' (control must be FAIL)');
    }
    // R-2: corrupted zip refused, not shown empty
    await openWin(page, 'GardenAdmin', 123, BPREC); await waitAtt(page, 30000);
    const s0 = await snap(page), tid = tableIdOf(s0.table), rid = Number(s0.currentKey);
    const prep = await page.evaluate(async ([tid, rid]) => {
      const A = window.AdAttachment, z = await A.zipBuild([{ name: 'x.bin', data: new Uint8Array(3000).map((_, i) => (i * 7 + 3) & 255) }]);
      z[40] ^= 0xFF; z[41] ^= 0xFF; z[60] ^= 0x55;   // inside the entry name / deflate data: the archive no longer reads clean
      const ok = await new Promise(r => window.__crud.applyOpGroup([{ key: 'ad_attachment', table: 'ad_attachment', verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: { ad_table_id: tid, record_id: rid, title: 'zip', binarydata: A.b64(z), isactive: 'Y' }, stdDefaults: { actor: window.APP.actor, clientId: window.APP.clientId, orgId: 0 } }], cr => r(!!(cr && cr.committed))));
      return ok;
    }, [tid, rid]);
    let n = PL.length;
    await page.evaluate(([tid, rid]) => { window.AdAttachment.open({ rows: window.__tipRead.rows, commit: () => Promise.resolve(false), msg: (v, en) => en }, { tableId: tid, recordId: rid, tableName: 'x' }); }, [tid, rid]);
    await sleep(1500);
    const shown = await page.$$eval('[data-att="entries"] option', o => o.length), err = await page.$eval('[data-att="error"]', e => e.textContent).catch(() => '');
    const refusedLog = PL.slice(n).some(l => /^§ATT refused reason=corrupt/.test(l));
    const j = judgeCorrupt(shown, !!err), jc = judgeCorrupt(0, false);   // control: an empty list with no message must be judged FAIL
    say('§W-ATTACH-RED R-2 corrupt row committed=' + prep + ' entries-shown=' + shown + ' message="' + err + '" refusedLog=' + refusedLog + ' judge=' + j + ' | control(empty list, no message) judge=' + jc);
    verdict('R-2 corrupted zip is refused, not shown empty', (prep && refusedLog && j === 'PASS' && jc === 'FAIL') ? 'PASS' : 'FAIL', 'judge=' + j + ' control=' + jc + ' (control must be FAIL)');
    await ctx.close();
  }

  // ════════ C-1 size cap ════════
  if (PART === 'all' || PART === 'cap') {
    const { ctx, page, PL } = await newPage('cap');
    await openWin(page, 'GardenAdmin', 123, BPREC); await waitAtt(page, 30000);
    const s0 = await snap(page), tid = tableIdOf(s0.table), rid = Number(s0.currentKey);
    const cap = await page.evaluate(() => window.AdAttachment.MAX_BYTES);
    for (const [label, size, expectOk, wantStore] of [['cap-8KB', cap - 8192, true, 0], ['cap+64KB', cap + 65536, true, 1]]) {   // phase 2: above the DB cap the entry goes to the file store instead of being refused
      await page.evaluate(() => { const d = document.querySelector('[data-att="dialog"]'); if (d) d.remove(); });
      const n = PL.length; await page.click('#idmp-toolbar button[data-tb="attachment"]'); await page.waitForSelector('[data-att="dialog"]', { timeout: 10000 });
      const buf = prng(size, 777); await page.setInputFiles('[data-att="file"]', [{ name: 'big.bin', mimeType: 'application/octet-stream', buffer: buf }]); await sleep(1500);
      await page.click('[data-att="ok"]'); await sleep(3500);
      const err = await page.$eval('[data-att="error"]', e => e.textContent).catch(() => '');
      const refused = PL.slice(n).some(l => /^§ATT refused reason=too-big/.test(l));
      let rb = null;
      if (expectOk) { await page.waitForSelector('[data-att="dialog"]', { state: 'detached', timeout: 20000 }).catch(() => {}); rb = await page.evaluate(async ([t, r]) => { const A = window.AdAttachment, st = await A.load(A.lookup({ rows: window.__tipRead.rows }, { tableId: t, recordId: r })); if (!st.entries.length) return null; const d = await A.bytes(st.entries[0]); return { len: d.length, sha: await A.sha256(d), stored: !!st.entries[0].stored }; }, [tid, rid]); }
      const storeLine = PL.slice(n).some(l => new RegExp('^§ATT save op=\\w+ entries=1 .* store=' + wantStore + '$').test(l));
      const ok = expectOk ? (!refused && storeLine && rb && rb.len === size && rb.sha === sha(buf) && rb.stored === !!wantStore) : (refused && /limit/.test(err));
      say('§W-ATTACH-CAP ' + label + ' file=' + size + ' refused=' + refused + ' message="' + err.slice(0, 120) + '" readback=' + JSON.stringify(rb) + ' → ' + (ok ? 'as expected' : 'UNEXPECTED'));
      verdict('C-1 cap ' + label, ok ? 'PASS' : 'FAIL', '');
      if (expectOk) {   // survives a reload (the kernel's persistence path), bytes equal
        await openWin(page, 'GardenAdmin', 123, BPREC); await waitAtt(page, 30000);
        let rb2 = null, waited = 0;   // the sidecar hydrates after the page opens: poll for the row (a read before it sees the bare seed), report how long it took
        for (; waited < 60000 && !rb2; waited += 500) {
          rb2 = await page.evaluate(async ([t, r]) => { const A = window.AdAttachment, row = A.lookup({ rows: window.__tipRead.rows }, { tableId: t, recordId: r }); if (!row) return null; const st = await A.load(row); if (!st.entries.length) return null; const d = await A.bytes(st.entries[0]); return { len: d.length, sha: await A.sha256(d), stored: !!st.entries[0].stored }; }, [tid, rid]);
          if (!rb2) await sleep(500);
        }
        say('§W-ATTACH-CAP ' + label + ' reload hydrate-wait-ms=' + waited);
        const ok2 = !!rb2 && rb2.len === size && rb2.sha === sha(buf);
        say('§W-ATTACH-CAP ' + label + ' after-reload readback=' + JSON.stringify(rb2) + ' → ' + (ok2 ? 'equal' : 'DIFFERENT')); verdict('C-1 cap ' + label + ' survives reload', ok2 ? 'PASS' : 'FAIL', '');
      }
      if (expectOk) { await page.evaluate(([t, r]) => new Promise(res => { const A = window.AdAttachment, row = A.lookup({ rows: window.__tipRead.rows }, { tableId: t, recordId: r }); if (!row) { res(null); return; } window.__crud.applyOpGroup([{ key: 'ad_attachment', table: 'ad_attachment', verb: 'delete', op_type: 'CRUD_DELETE', op_uuid: null, id: row.ad_attachment_id, tombstone: true, reversible: true }], res); }), [tid, rid]); }
    }
    await ctx.close();
  }

  await browser.close(); server.close();
  const f = VERD.filter(v => v.v === 'FAIL').length, inc = VERD.filter(v => v.v === 'INCONCLUSIVE').length, p = VERD.filter(v => v.v === 'PASS').length;
  say('§W-ATTACH-SUMMARY arms=' + VERD.length + ' PASS=' + p + ' FAIL=' + f + ' INCONCLUSIVE=' + inc + ' → ' + (VERD.length === 0 ? 'INCONCLUSIVE (nothing judged)' : f ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
  process.exitCode = f ? 1 : 0;
})().catch(e => { console.log('§W-ATTACH HARNESS-ERROR ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\n§W-ATTACH HARNESS-ERROR ' + e + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n'); process.exitCode = 1; });
