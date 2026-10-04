// ⚠ DO NOT REMOVE — Scope guard
// W-GRIDTAB-LIVE — bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §GT.3. Real headless browser (--disable-gpu) over the served
//   bundle. READ erp/tests/witness_gridtab_live.log (verdicts) + witness_gridtab_live.page.log after every run.
// THE ISSUES this proves or disproves, per window, over EVERY active window that has an active TabLevel 1 tab directly under its
//   header whose tables exist in erp/ad_seed.db (data-driven population, never a hand-picked list):
//   MD-1 typing a NEW header then clicking the detail tab WITHOUT Save: is the header saved (or, on a save error, does the window
//        STAY on the header tab — both are iDempiere, AbstractADWindowContent.saveAndNavigate/onSave0)? A prompt / silent drop = GAP.
//   MD-2 does the detail tab of a brand-new header show 0 rows, and EVERY visible detail row carry link == the current parent id —
//        including after another header got a detail row this session (the op-log leak)?
//   MD-3 does returning to the header tab keep the record just worked on current?
//   MD-4/MD-8 is the new detail row linked to the header just saved (its link column == that header's exact id)?
// Verdict per window: PASS | GAP | INCONCLUSIVE(reason). INCONCLUSIVE when it cannot be driven (window not in the role's menu,
//   New disabled, header mandatory data the generic filler cannot supply) — counted, never PASS.
// GT_NINJA=1 (§GT-NINJA, bim-compiler ERP_IDEMPIERE_UX_PARITY.md): the population is a header+lines module STAGED AT RUNTIME by ninja_stage.js
//   (ninja_starter: AST_Asset → AST_Maintenance) INSIDE the page's own db, role access granted, re-login, opened from the MENU — then the SAME
//   MD-1..MD-4 arms. Log: witness_ninja_gridtab_live.log. Proves the Ninja module gets master-detail with ZERO host code.
// Run: NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_gridtab_live.js   (GT_ONLY=143,181 to limit; GT_WORKERS=4)
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const { Witness } = require('../../witness_kit/contract');
const REPO = path.join(__dirname, '..', '..');
const NINJA = process.env.GT_NINJA === '1';
const LOGF = path.join(__dirname, NINJA ? 'witness_ninja_gridtab_live.log' : 'witness_gridtab_live.log'), PAGELOGF = path.join(__dirname, NINJA ? 'witness_ninja_gridtab_live.page.log' : 'witness_gridtab_live.page.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.zip': 'application/zip', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf);
  });
});
const OUT = []; const say = s => { OUT.push(s); console.log(s); };
const PAGELOG = [];

(async () => {
  // ── population from the seed (AD only) ──
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db'))));
  const Q = (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; };
  const has = t => Q("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [t]).length > 0;
  const access = (role, w) => Q("SELECT 1 FROM AD_Window_Access WHERE AD_Role_ID=? AND AD_Window_ID=? AND IsActive='Y'", [role, w]).length > 0;
  const POPW = [];
  for (const [wid, wname] of Q("SELECT AD_Window_ID, Name FROM AD_Window WHERE IsActive='Y' ORDER BY AD_Window_ID")) {
    const tabs = Q("SELECT t.AD_Tab_ID, t.Name, t.TabLevel, tb.TableName FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=? AND t.IsActive='Y' ORDER BY t.SeqNo", [wid]);
    if (!tabs.length || tabs[0][2] !== 0 || !has(tabs[0][3])) continue;
    let ci = -1;
    for (let i = 1; i < tabs.length; i++) { if (tabs[i][2] === 0) break; if (tabs[i][2] === 1 && has(tabs[i][3])) { ci = i; break; } }
    if (ci < 0) continue;
    const login = access(102, wid) ? 'GardenAdmin' : (access(0, wid) ? 'SuperUser' : null);
    POPW.push({ wid, wname, header: tabs[0][3], childIdx: ci, child: tabs[ci][1], childTable: tabs[ci][3], login });
  }
  if (NINJA) {   // population = the starter module staged on a node copy of the seed (same deterministic slot the page will get)
    POPW.length = 0;
    const NM = require('../ninja_model.js'), NS = require('../ninja_stage.js'), NST = require('../ninja_starter.js');
    const nr = NST.starterModelRows(), pm = NM.parseSheet(nr.model, { header: nr.header }), model = pm.model || pm;
    const ndb = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(REPO, 'erp', 'ad_seed.db'))));
    const _l = console.log; console.log = () => {}; NS.stageModels(ndb, model, 0); console.log = _l;
    const nq = (s2, p2) => { const r = ndb.exec(s2, p2 || []); return r.length ? r[0].values : []; };
    const hdrT = model.tables.find(t => !t.master), detT = model.tables.find(t => t.master === hdrT.name);
    const wid = nq("SELECT AD_Window_ID FROM AD_Table WHERE TableName=?", [hdrT.name])[0][0];
    const tabs = nq("SELECT t.AD_Tab_ID, t.Name, t.TabLevel, tb.TableName FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=? AND t.IsActive='Y' ORDER BY t.SeqNo", [wid]);
    POPW.push({ wid, wname: hdrT.name.replace(/_/g, ' '), header: tabs[0][3], childIdx: tabs.findIndex(t => t[3] === detT.name), child: tabs.find(t => t[3] === detT.name)[1], childTable: detT.name, login: 'GardenAdmin', ninja: { model: nr, menuText: hdrT.name.replace(/_/g, ' ') } });
    say('§NINJA-GT-LIVE population window=' + wid + ' tabs=' + JSON.stringify(tabs.map(t => t[3] + '@L' + t[2])) + ' (staged on a node copy; the page stages its own)');
  }
  const ONLY = process.env.GT_ONLY ? process.env.GT_ONLY.split(',').map(Number) : null;
  const WINS = ONLY ? POPW.filter(w => ONLY.includes(w.wid)) : POPW;
  say('§GT-LIVE population windows=' + WINS.length + ' (of ' + POPW.length + ' with a TabLevel-1 child under the header, tables in seed)');

  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const RES = [];

  async function driveWindow(page, W, PL) {
    const r = { window: W.wid, name: W.wname, header: W.header, child: W.childTable, verdict: 'INCONCLUSIVE', reason: '', arms: {} };
    const since = (n, re) => PL.slice(n).filter(l => re.test(l));
    const last = (n, re) => since(n, re).pop() || '';
    if (!W.login) { r.reason = 'no role in the seed has access to this window'; return r; }
    let n0 = PL.length;
    for (let g = 0; g < 3; g++) {   // a navigation the page itself starts (SW / history) can abort goto — retry, never judge it
      try { await page.goto('about:blank'); await page.goto(base + '?login=' + W.login + (W.ninja ? '' : '&window=' + W.wid), { waitUntil: 'load' }); break; }
      catch (e) { if (g === 2) throw e; await page.waitForTimeout(1500); }
    }
    if (W.ninja) {   // §GT-NINJA: stage the module INSIDE the page, grant the role the window, re-login (winSet is built at login), open from the MENU
      try { await page.waitForFunction(() => window.__idmpDb && window.NinjaStage && window.NinjaModel, null, { timeout: 30000 }); } catch (e) { r.reason = 'page has no __idmpDb/NinjaStage'; return r; }
      for (let w = 0; w < 60 && !since(n0, /^§IDEMPIERE-LOGIN user=/).length; w++) await page.waitForTimeout(250);
      const st = await page.evaluate((nr) => {
        const db = window.__idmpDb, pm = NinjaModel.parseSheet(nr.model, { header: nr.header }), model = pm.model || pm;
        const c = NinjaStage.stageModels(db, model, 0);
        const hdr = model.tables.find(t => !t.master).name;
        const w = db.exec("SELECT AD_Window_ID FROM AD_Table WHERE TableName='" + hdr + "'")[0].values[0][0];
        db.run("INSERT INTO AD_Window_Access (AD_Window_ID,AD_Role_ID,AD_Client_ID,AD_Org_ID,IsActive,IsReadWrite) VALUES (" + w + ",102,11,0,'Y','Y')");
        return { counts: c, wid: w };
      }, W.ninja.model);
      PL.push('§NINJA-GT-LIVE staged-in-page window=' + st.wid + ' counts=' + JSON.stringify(st.counts));
      if (st.wid !== W.wid) { r.verdict = 'GAP'; r.reason = 'page staged window ' + st.wid + ' != node-staged ' + W.wid + ' (staging not deterministic)'; return r; }
      await page.evaluate(() => document.getElementById('idmp-login-ok').click());
      let clicked = false;   // the menu is rebuilt by the re-login; leaves sit under collapsed nodes → click the row element itself
      for (let w = 0; w < 60 && !clicked; w++) {
        clicked = await page.evaluate((txt) => { const nm = [...document.querySelectorAll('#idmp-tree .idmp-row.leaf .nm')].find(e => e.textContent.trim() === txt); if (!nm) return false; nm.closest('.idmp-row').click(); return true; }, W.ninja.menuText);
        if (!clicked) await page.waitForTimeout(250);
      }
      if (!clicked) { r.reason = 'Ninja menu leaf "' + W.ninja.menuText + '" not in the role-scoped menu'; return r; }
    }
    try { await page.waitForFunction(() => document.querySelector('#idmp-toolbar button[data-tb="new"]') && window.IdmpGridTab, null, { timeout: 30000 }); }
    catch (e) { const al = last(n0, /§IDEMPIERE-AUTOLOGIN user=/); r.reason = 'window not opened for the auto-login role (' + (al ? al.replace(/.*role=(\d+).*/, 'role $1') : 'no autologin') + '; ?login= takes the user\'s first role, this window is granted to role ' + (W.login === 'SuperUser' ? '0 only' : '?') + ')'; return r; }
    for (let w = 0; w < 40 && !since(n0, /^§IDEMPIERE tab=/).length; w++) await page.waitForTimeout(250);   // the header's rows are loaded
    await page.waitForTimeout(700);
    const snap = () => page.evaluate(() => window.IdmpGridTab.snapshot());
    const newEnabled = () => page.$eval('#idmp-toolbar button[data-tb="new"]', b => !b.disabled).catch(() => false);
    const clickTab = async (i) => { await page.click('#idmp-tabstrip .idmp-adtab >> nth=' + i); await page.waitForTimeout(1300); };
    const activeTab = () => page.evaluate(() => [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].findIndex(t => t.classList.contains('active')));
    // the generic mandatory filler: every visible required (or save-rejected) empty control gets a typed value
    const fill = (tag, rot) => page.evaluate(([tag, rot]) => {
      const out = [];
      document.querySelectorAll('#idmp-inline-mount .cfrow').forEach(row => {
        const col = row.getAttribute('data-row'); const req = row.querySelector('i.req'); const err = row.querySelector('.cfe');
        const need = (req && req.style.display !== 'none') || (err && /required|mandatory/i.test(err.textContent));
        if (!need || row.offsetParent === null) return;
        const c = row.querySelector('[data-col]'); if (!c || c.disabled || c.readOnly) return;
        if (c.tagName === 'SELECT') {
          const opts = [...c.options].filter(o => o.value !== '' && o.value !== 'null');
          if (c.value && c.value !== '' && c.value !== 'null' && !(rot > 0 && opts.length > rot)) return;   // a retry ROTATES the pick (user tries another)
          const o = opts[rot > 0 && opts.length > rot ? rot : 0]; if (!o) { out.push(col + ':no-option'); return; }
          c.value = o.value; c.dispatchEvent(new Event('change', { bubbles: true })); out.push(col + '=' + o.value);
        } else if (c.type === 'checkbox') { if (c.getAttribute('data-unset')) { c.checked = true; c.removeAttribute('data-unset'); c.dispatchEvent(new Event('change', { bubbles: true })); out.push(col + '=Y'); } }
        else {
          if (String(c.value || '').trim() !== '') return;
          const v = c.type === 'number' ? '1' : c.type === 'date' ? new Date().toISOString().slice(0, 10) : c.type === 'datetime-local' ? new Date().toISOString().slice(0, 16) : (tag + '-' + col).slice(0, 30);
          c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); c.dispatchEvent(new Event('blur')); out.push(col + '=' + v);
        }
      });
      return out;
    }, [tag, rot || 0]);
    const newRec = async (tag) => {
      for (let w = 0; w < 20 && !(await newEnabled()); w++) await page.waitForTimeout(250);   // the toolbar re-renders after the rows load
      if (!(await newEnabled())) { newRec.why = 'New button disabled'; return null; }
      await page.click('#idmp-toolbar button[data-tb="new"]');
      try { await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 20000 }); } catch (e) { newRec.why = 'no create form within 20s'; return null; }
      await page.waitForTimeout(600);
      const a = await fill(tag); await page.waitForTimeout(400); const b = await fill(tag); await page.waitForTimeout(300);
      if (!a.length && !b.length) {   // nothing mandatory to type: type into the first editable text field so the record is REALLY changed
        const t = await page.evaluate((tag) => { const c = [...document.querySelectorAll('#idmp-inline-mount .cfrow input[data-col]')].find(i => (i.type === 'text' || !i.type) && !i.disabled && !i.readOnly && i.offsetParent !== null);
          if (!c) return null; c.value = (tag + '-' + c.getAttribute('data-col')).slice(0, 30); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return c.getAttribute('data-col'); }, tag);
        if (t) a.push(t + '(typed)');
      }
      return a.concat(b);
    };
    // header New → (no Save) → click the child tab; on a REJECT the window must STAY; fix + retry ≤ 2 (the user's path in iDempiere)
    const headerThenChild = async (tag) => {
      const filled = await newRec(tag); if (filled == null) return { err: 'header ' + (newRec.why || 'New disabled/no form') };
      let res = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const n = PL.length; await clickTab(W.childIdx);
        const RE = /§GT-NAV autosave table=\S+ verdict=|§GT-NAV ignore-new|§DIRTY-GATE prompt/;
        for (let w = 0; w < 40 && !last(n, RE) && since(n, /§GT-NAV autosave table=\S+ on=/).length; w++) await page.waitForTimeout(250);   // a save in flight: wait for its verdict
        if (since(n, /§GT-NAV autosave table=\S+ verdict=saved/).length) await page.waitForTimeout(900);   // the tab switch renders after the verdict
        const nav = last(n, RE); const at = await activeTab();
        if (/verdict=saved/.test(nav)) { res = { saved: true, id: Number((/ id=(-?\d+)/.exec(nav) || [])[1]), at, nav, filled }; break; }
        if (/verdict=blocked/.test(nav)) { res = { saved: false, stayed: at === 0, nav, at, filled }; await fill(tag + attempt, attempt + 1); await page.waitForTimeout(900); /* dependents (e.g. BP → location) refill after the rotated pick */ await fill(tag + attempt); await page.waitForTimeout(400); continue; }
        res = { saved: false, stayed: at === 0, nav: nav || '(no §GT-NAV line — navigated without a save decision)', at, filled, noDecision: true }; break;
      }
      return res;
    };
    // ── arm 1: header 1 ──
    const h1 = await headerThenChild('GT1');
    if (h1.err) { const sn = await snap().catch(() => null); r.reason = h1.err + (sn ? ' (AD: canInsert=' + sn.canInsert + ')' : ''); return r; }
    r.arms.autosave1 = h1.saved ? 'saved id=' + h1.id : (h1.noDecision ? 'GAP ' + h1.nav : 'blocked stayed=' + h1.stayed + ' ' + h1.nav.slice(0, 140));
    if (!h1.saved && /ignore-new/.test(h1.nav || '') && !(h1.filled || []).length) { r.reason = 'header form had nothing the generic filler could type (untouched New → dataIgnore, iDempiere-correct)'; return r; }
    if (!h1.saved) {
      if (h1.noDecision || !h1.stayed) { r.verdict = 'GAP'; r.reason = 'MD-1 header left without save decision / moved off the header on a failed save'; return r; }
      r.reason = 'header not saveable by the generic filler: ' + (/error="([^"]*)"/.exec(h1.nav) || [, h1.nav])[1].slice(0, 120); return r;   // iDempiere-correct blocked, but the window cannot be driven further
    }
    const fails = [];
    const s1 = await snap();
    r.arms.child1 = { link: s1.linkColumn, linkValue: s1.linkValue, parent: s1.parentKey, rows: s1.rows.length, foreign: s1.rows.filter(x => String(x.link) !== String(s1.linkValue)).length };
    if (s1.tabIdx !== W.childIdx) fails.push('not on child tab after autosave');
    if (String(s1.parentKey) !== String(h1.id)) fails.push('MD-4 child bound to parent=' + s1.parentKey + ' != header ' + h1.id);
    if (s1.linkValue == null) r.arms.child1.note = 'parent has no link value → 2=3 (iDempiere parentNeedSave)';
    if (s1.rows.length !== 0) fails.push('MD-2 new header shows ' + s1.rows.length + ' child rows');
    // ── arm 2: a child row on header 1 ──
    let childSaved = false;
    if (!s1.canInsert) r.arms.childNew = 'INCONCLUSIVE canInsert=false (IsInsertRecord/ReadOnly)';
    else {
      const cf = await newRec('GTc');
      if (cf == null) r.arms.childNew = 'INCONCLUSIVE no child form';
      else {
        let n = PL.length; await page.click('#idmp-toolbar button[title^="Save"]').catch(() => {}); await page.waitForTimeout(1600);
        let sv = last(n, /§CRUD-CREATE-SEL table=|§CRUD validate key=\S+ verb=create REJECT|§AD-MODELVAL-LIVE .*REJECT/);
        if (!/§CRUD-CREATE-SEL/.test(sv)) { await fill('GTc2', 1); n = PL.length; await page.click('#idmp-toolbar button[title^="Save"]').catch(() => {}); await page.waitForTimeout(1600);
          sv = last(n, /§CRUD-CREATE-SEL table=|§CRUD validate key=\S+ verb=create REJECT|§AD-MODELVAL-LIVE .*REJECT/); }
        if (/§CRUD-CREATE-SEL/.test(sv)) {
          childSaved = true; await page.waitForTimeout(400);
          const s2 = await snap(); const mine = s2.rows.filter(x => String(x.link) === String(s1.linkValue)).length;
          r.arms.childNew = 'saved rows=' + s2.rows.length + ' linkedToHeader1=' + mine;
          if (s2.rows.length !== 1 || mine !== 1) fails.push('MD-4/MD-2 after child save rows=' + s2.rows.length + ' linkedToHeader1=' + mine);
        } else {
          r.arms.childNew = 'INCONCLUSIVE child not saveable: ' + sv.slice(0, 120);
          await page.click('#idmp-toolbar button[title^="Ignore"]').catch(() => {}); await page.waitForTimeout(700);   // the user abandons the line (dataIgnore)
        }
      }
    }
    // ── arm 3: back to the header → current = header 1 ──
    await clickTab(0); let sh = await snap();
    r.arms.back1 = 'current=' + sh.currentKey;
    if (String(sh.currentKey) !== String(h1.id)) fails.push('MD-3 back on header current=' + sh.currentKey + ' != ' + h1.id);
    // ── arm 4: header 2 → child shows 0 rows, no foreign row (header 1's child must not leak) ──
    const h2 = await headerThenChild('GT2');
    if (h2.saved) {
      const s3 = await snap(); const foreign = s3.rows.filter(x => String(x.link) !== String(s3.linkValue)).length;
      r.arms.child2 = 'parent=' + s3.parentKey + ' linkValue=' + s3.linkValue + ' rows=' + s3.rows.length + ' foreign=' + foreign + (childSaved ? ' (header1 has a session child row)' : ' (no session child to leak)');
      if (String(s3.parentKey) !== String(h2.id)) fails.push('MD-4 child2 bound to parent=' + s3.parentKey + ' != ' + h2.id);
      if (s3.rows.length !== 0) fails.push('MD-2 header2 child rows=' + s3.rows.length + ' foreign=' + foreign);
      await clickTab(0); sh = await snap();
      r.arms.back2 = 'current=' + sh.currentKey;
      if (String(sh.currentKey) !== String(h2.id)) fails.push('MD-3 back2 current=' + sh.currentKey + ' != ' + h2.id);
    } else r.arms.child2 = 'header2 not saved: ' + (h2.nav || h2.err || '').slice(0, 100);
    if (fails.length) { r.verdict = 'GAP'; r.reason = fails.join('; '); }
    else if (!childSaved) { r.verdict = 'PASS'; r.reason = 'MD-1/2/3 judged; child-create arm not driven (' + String(r.arms.childNew).slice(0, 80) + ')'; r.partial = true; }
    else r.verdict = 'PASS';
    return r;
  }

  const N = Math.max(1, Number(process.env.GT_WORKERS || 4));
  let next = 0;
  async function worker(k) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage(); const PL = [];
    page.on('console', m => { const t = m.text(); PL.push(t); PAGELOG.push('[w' + k + '] ' + t); });
    page.on('pageerror', e => { PL.push('PAGEERR ' + e); PAGELOG.push('[w' + k + '] PAGEERR ' + e); });
    page.on('dialog', async d => { PL.push('DIALOG ' + d.type() + ' ' + d.message()); if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });   // beforeunload on a left-dirty form must not abort the next window's goto
    while (next < WINS.length) {
      const W = WINS[next++]; const n0 = PL.length; let r;
      try { r = await driveWindow(page, W, PL); } catch (e) { r = { window: W.wid, name: W.wname, header: W.header, child: W.childTable, verdict: 'INCONCLUSIVE', reason: 'harness: ' + String(e.message).split('\n')[0].slice(0, 120), arms: {} }; }
      r.pageErrors = PL.slice(n0).filter(l => /^PAGEERR/.test(l)).length;
      RES.push(r);
      say('§GT-LIVE window=' + r.window + ' "' + r.name + '" header=' + r.header + ' child=' + r.child + ' verdict=' + r.verdict + (r.partial ? '(partial)' : '') +
        ' pageErrors=' + r.pageErrors + ' arms=' + JSON.stringify(r.arms) + (r.reason ? ' reason=' + r.reason : ''));
    }
    await ctx.close();
  }
  await Promise.all(Array.from({ length: N }, (_, k) => worker(k)));
  await browser.close(); server.close();
  const cnt = v => RES.filter(r => r.verdict === v).length;
  const why = {}; RES.filter(r => r.verdict === 'INCONCLUSIVE').forEach(r => { const k = r.reason.replace(/[:(].*/, '').trim(); why[k] = (why[k] || 0) + 1; });
  say('§GT-LIVE-TOTAL windows=' + RES.length + ' PASS=' + cnt('PASS') + ' (full=' + RES.filter(r => r.verdict === 'PASS' && !r.partial).length + ' partial=' + RES.filter(r => r.partial).length + ') GAP=' + cnt('GAP') +
    ' INCONCLUSIVE=' + cnt('INCONCLUSIVE') + ' inconclusiveWhy=' + JSON.stringify(why) + ' pageErrors=' + RES.reduce((a, r) => a + (r.pageErrors || 0), 0));
  fs.writeFileSync(PAGELOGF, PAGELOG.join('\n'));
  Witness('gridtab_live')
    .population(() => RES)
    .schema({ type: 'object', required: ['window', 'verdict'], properties: { verdict: { enum: ['PASS', 'GAP', 'INCONCLUSIVE'] } } })
    .invariant('no GAP window (MD-1..MD-4 hold on every driven window)', rs => rs.every(r => r.verdict !== 'GAP'))
    .invariant('non-vacuous: >= 25% of windows judged PASS with the child-create arm driven', rs => rs.filter(r => r.verdict === 'PASS' && !r.partial).length >= Math.ceil(rs.length * 0.25))
    .redControl(rs => rs.map(r => r.verdict === 'PASS' ? Object.assign(r, { verdict: 'GAP' }) : r))
    .run();
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n');
})().catch(e => { console.log('§GT-LIVE HARNESS-ERROR ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\n§GT-LIVE HARNESS-ERROR ' + e + '\n'); process.exitCode = 1; });
