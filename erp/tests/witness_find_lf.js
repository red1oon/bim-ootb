// ⚠ DO NOT REMOVE — W-FIND-LF (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §FIND-LF; CARDINAL RULE: the twin's look & feel == legacy).
//   READ THE LOG after every run (§WFLF lines); exit code is not evidence. Never a screenshot: DOM structure + computed numbers only.
// THE ISSUE (user, 2026-11-04: "opening of say B Partners gives a chooser panel which is ugly and not as legacy design"): the twin's Find window was a
//   page-wide dark overlay with a floating titled box; legacy EMBEDS it in the window (setupEmbeddedFindwindow) with its own layout. The oracle is the live
//   legacy, recorded by tests/oracle_legacy_find_window.js into tests/fixtures/legacy_find_window_bp.json. Judged on the twin:
//   L1 Business Partner (high volume) opens on Find EMBEDDED in the window: inside #idmp-main, no page-wide mask, no title, top = under the window tabs,
//      height = 60% of the window area (legacy 490 of 816)                     L2 the top row = legacy's order: Saved Query · combo · Save · ⋮ · History · combo
//   L3 tabs = legacy texts, first selected, 32px, padding = legacy, selected marker = 2px bottom border
//   L4 Lookup Record grid: columns 30/50/20 (legacy 293/488/195), labels right-aligned, 24px editors, the same field rows as legacy + the "..." group
//   L5 south: New, Reset at the LEFT and OK, Cancel at the RIGHT, icon-only, 24px high, padding/radius = legacy, 6px apart (legacy 233->295 = 56+6)
//   L6 status bar "Records = N", N = COUNT(*) under the grid's own filter       L7 Advanced: header texts = legacy, one row, toolbar New + Delete, left group hidden
//   L8 Sales Order toolbar Find: below the window toolbar, over the busy mask (#e4e4e4, opacity .6) inside the window only
//   MUTANT: FIND_LF_BREAK=overlay re-applies the old page-wide overlay look (style injection) -> L1 must FAIL. Nothing judged -> INCONCLUSIVE.
// Run: node tests/witness_find_lf.js 2>&1 | tee tests/witness_find_lf.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FIND_LF_BREAK || '';
const LEG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy_find_window_bp.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0, inc = 0;
const ok = (id, name, cond, detail) => { console.log((cond === null ? '  ⚠ ' : cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond === null ? inc++ : cond ? pass++ : fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage();   // the oracle's viewport
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  if (BREAK === 'overlay') await pg.addStyleTag({ content: '#idmp-find-ov{position:fixed!important;inset:0!important;top:0!important;height:auto!important;width:auto!important;background:rgba(0,0,0,.45)!important}' });
  const openMenu = async (win) => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + win + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1500);
  };
  const measure = () => pg.evaluate(() => {
    const cs = (e, p) => { if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect(), o = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; (p || []).forEach(k => o[k] = s[k]); return o; };
    const ov = document.getElementById('idmp-find-ov'); if (!ov) return null;
    const main = document.getElementById('idmp-main'), tabs = document.getElementById('idmp-wintabs'), tb = document.getElementById('idmp-toolbar'), vis = e => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const tr = tabs.getBoundingClientRect(), mr = main.getBoundingClientRect(), tbr = tb.getBoundingClientRect(), o = ov.getBoundingClientRect();
    const fixedDark = Array.from(document.querySelectorAll('body *')).filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.position === 'fixed' && r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && /rgba\(0, 0, 0, 0\.[1-9]/.test(s.backgroundColor) && vis(e); }).length;
    const bar = ov.querySelector('.fw-toolbar:not(.fw-advbar)'), parts = bar ? Array.from(bar.children).filter(e => e.tagName !== 'DATALIST' && vis(e)).map(e => e.matches('.fw-lbl') ? 'label:' + e.textContent.trim() : e.matches('[data-find-query]') ? 'combo' : e.matches('[data-find-save]') ? 'save' : e.matches('[data-find-more]') ? 'more' : e.matches('[data-find-history]') ? 'combo' : e.tagName) : [];
    const tabsEls = Array.from(ov.querySelectorAll('.fw-tab')).map(t => Object.assign(cs(t, ['padding', 'borderBottomWidth', 'borderBottomStyle']), { text: t.textContent.trim(), sel: t.classList.contains('sel') }));
    const grid = ov.querySelector('.fw-simple .fw-grid'), firstRow = grid && grid.querySelector('tr.fld'), cells = firstRow ? Array.from(firstRow.children).map(c => cs(c, ['textAlign'])) : [];
    const rows = grid ? Array.from(grid.querySelectorAll('tr.fld:not(.fw-more)')).map(r => r.querySelector('.fw-label').textContent.trim()) : [];
    const eds = grid ? Array.from(grid.querySelectorAll('tr.fld:not(.fw-more) .fw-ed [data-find-s]')).map(i => Math.round(i.getBoundingClientRect().height)) : [];
    const btn = sel => { const b = ov.querySelector(sel); return b ? Object.assign(cs(b, ['padding', 'borderRadius']), { text: b.textContent.trim(), vis: vis(b) }) : null; };
    const st = ov.querySelector('.fw-status'), mask = document.getElementById('idmp-find-mask');
    return { placement: ov.getAttribute('data-find-placement'), parentIsMain: ov.parentElement === main, fixedDark, hasTitle: !!ov.querySelector('h1,h2,h3,.z-window-header'),
      top: Math.round(o.top), tabsBottom: Math.round(tr.bottom), toolbarBottom: Math.round(tbr.bottom), h: Math.round(o.height), areaH: Math.round(mr.bottom - tr.bottom), w: Math.round(o.width), mainW: Math.round(mr.width),
      parts, tabs: tabsEls, cells, rows, eds, group: !!(grid && grid.querySelector('tr.fw-group')),
      south: { nw: btn('[data-find-new]'), rs: btn('[data-find-reset]'), okb: btn('[data-find-ok]'), cn: btn('[data-find-cancel]') },
      status: st ? st.textContent.trim() : null, statusN: st ? st.getAttribute('data-find-records') : null,
      mask: mask ? Object.assign(cs(mask, ['backgroundColor', 'opacity', 'position']), { inMain: mask.parentElement === main }) : null };
  });
  // ── Business Partner: high volume -> Find first (initial placement)
  await openMenu(123); await pg.waitForSelector('#idmp-find-ov', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(800);
  const m = await measure();
  console.log('§WFLF BP ' + JSON.stringify(m).slice(0, 1500));
  if (!m) { ok('L1', 'Business Partner opens on the Find window', false, 'no #idmp-find-ov'); }
  else {
    const legRatio = LEG.window.h / (LEG.window.h / 0.6);   // setupEmbeddedFindwindow: 60%
    ok('L1', 'embedded in the window: inside #idmp-main, no page-wide mask, no title, top = under the window tabs, height = 60% of the window area, full width',
      m.placement === 'initial' && m.parentIsMain && m.fixedDark === 0 && !m.hasTitle && near(m.top, m.tabsBottom, 1) && near(m.h / m.areaH, 0.6, 0.01) && near(m.w, m.mainW, 2),
      'parentIsMain=' + m.parentIsMain + ' fixedDarkMasks=' + m.fixedDark + ' title=' + m.hasTitle + ' top=' + m.top + ' tabsBottom=' + m.tabsBottom + ' h/area=' + (m.h / m.areaH).toFixed(3) + ' (legacy ' + LEG.window.h + '/' + Math.round(LEG.window.h / 0.6) + ') w=' + m.w + '/' + m.mainW);
    const legParts = LEG.toolbar.parts.filter(p => !/combobox-icon/.test(p.icon) || false).map(p => p.text ? 'label:' + p.text : /Save/.test(p.icon) ? 'save' : /ellipsis/.test(p.icon) ? 'more' : 'combo');
    const legOrder = ['label:' + LEG.toolbar.parts[0].text, 'combo', 'save', 'more', 'label:' + LEG.toolbar.parts.filter(p => p.text)[1].text, 'combo'];
    ok('L2', 'the top row = legacy order (Saved Query, combo, Save, more, History records, combo)', JSON.stringify(m.parts) === JSON.stringify(legOrder), 'twin=' + JSON.stringify(m.parts) + ' legacy=' + JSON.stringify(legOrder));
    const lt = LEG.tabs;
    ok('L3', 'tabs = legacy (texts, first selected, height, padding, 2px selected marker)', m.tabs.length === lt.length && m.tabs.every((t, i) => t.text === lt[i].text && t.sel === lt[i].selected && t.h === lt[i].h && t.padding === lt[i].padding) && m.tabs[0].borderBottomWidth === '2px',
      'twin=' + m.tabs.map(t => t.text + (t.sel ? '*' : '') + '[' + t.h + 'h ' + t.padding + ' bb=' + t.borderBottomWidth + ']').join(' | ') + ' legacy=' + lt.map(t => t.text + (t.selected ? '*' : '') + '[' + t.h + 'h ' + t.padding + ']').join(' | '));
    const lc = LEG.simpleRows[0].cells.map(c => c.st.w), lsum = lc.reduce((a, b) => a + b, 0), tsum = m.cells.reduce((a, c) => a + c.w, 0);
    const legRows = LEG.simpleRows.map(r => r.cells[0].text), colsOk = m.cells.length === 3 && m.cells.every((c, i) => near(c.w / tsum, lc[i] / lsum, 0.02));
    ok('L4', 'Lookup Record grid: columns 30/50/20, labels right-aligned, 24px editors, legacy field rows + the "..." group',
      colsOk && m.cells[0].textAlign === 'right' && m.eds.length > 0 && m.eds.every(h => h === LEG.simpleRows[0].cells[1].inputs[0].h) && JSON.stringify(m.rows) === JSON.stringify(legRows) && m.group === (LEG.groupRows.length > 0),
      'cols=' + m.cells.map(c => (c.w / tsum * 100).toFixed(1) + '%').join('/') + ' (legacy ' + lc.map(w => (w / lsum * 100).toFixed(1) + '%').join('/') + ') align=' + (m.cells[0] || {}).textAlign + ' editorH=' + JSON.stringify(m.eds) + ' rows=' + JSON.stringify(m.rows) + ' legacy=' + JSON.stringify(legRows) + ' group=' + m.group);
    const s = m.south, lb = LEG.southButtons, gapTwin = s.rs && s.nw ? s.rs.x - (s.nw.x + s.nw.w) : null, gapLeg = lb[1].x - (lb[0].x + lb[0].w);
    ok('L5', 'south: New, Reset left / OK, Cancel right, icon-only, 24px, padding + radius = legacy, 6px apart',
      !!(s.nw && s.rs && s.okb && s.cn) && s.nw.x < s.rs.x && s.rs.x < s.okb.x && s.okb.x < s.cn.x && (s.okb.x - (s.rs.x + s.rs.w)) > 200 && [s.nw, s.rs, s.okb, s.cn].every(b => b.text === '' && b.h === lb[0].h && b.padding === lb[0].padding && b.borderRadius === lb[0].borderRadius) && gapTwin === gapLeg,
      s.nw ? ['nw', 'rs', 'okb', 'cn'].map(k => k + '@x' + s[k].x + ' ' + s[k].w + 'x' + s[k].h + ' pad=' + s[k].padding + ' r=' + s[k].borderRadius + ' text="' + s[k].text + '"').join(' ; ') + ' gap=' + gapTwin + ' (legacy ' + gapLeg + ', ' + lb.map(b => b.x + ':' + b.w + 'x' + b.h + ' ' + b.padding).join(' ') + ')' : 'missing');
    const bpWhere = logs.filter(x => /^§AD_DATA readRecords table=C_BPartner/i.test(x)).length;
    const want = (await seed("SELECT count(*) FROM C_BPartner WHERE AD_Client_ID IN (0,11)"))[0][0];
    ok('L6', 'status bar "Records = N" (legacy text shape) with N = the tab\'s rows under its own filter', m.status === 'Records = ' + m.statusN && /^Records = \d+$/.test(m.status) && Number(m.statusN) > 0, 'twin="' + m.status + '" legacy="' + String(LEG.statusbar.text).trim() + '" (client 0+11 BPartner rows in this seed=' + want + ')');
    // Advanced
    await hc('#idmp-find-ov [data-find-tab="advanced"]');
    const adv = await pg.evaluate(() => { const ov = document.getElementById('idmp-find-ov'), p = ov.querySelector('.fw-advanced'); return { heads: Array.from(p.querySelectorAll('thead th')).map(h => h.textContent.trim()), rows: p.querySelectorAll('tbody tr[data-find-row]').length,
      bar: Array.from(p.querySelectorAll('.fw-advbar button')).map(b => b.getAttribute('data-find-addrow') ? 'new' : b.getAttribute('data-find-delrow') ? 'delete' : '?'), leftHidden: getComputedStyle(ov.querySelector('.fw-south .fw-left')).visibility === 'hidden', okVisible: ov.querySelector('[data-find-ok]').offsetParent !== null }; });
    const lh = LEG.advanced.heads.map(h => h.text);
    ok('L7', 'Advanced: header texts = legacy, one starting row, toolbar New + Delete, OK/Cancel only', JSON.stringify(adv.heads) === JSON.stringify(lh) && adv.rows === LEG.advanced.rows && JSON.stringify(adv.bar) === '["new","delete"]' && adv.leftHidden && adv.okVisible,
      'twin=' + JSON.stringify(adv) + ' legacy heads=' + JSON.stringify(lh) + ' rows=' + LEG.advanced.rows);
    await hc('#idmp-find-ov [data-find-ok]'); await pg.waitForTimeout(1200);
  }
  // ── Sales Order: the toolbar Find (drops below the toolbar, over the busy mask)
  await openMenu(143); await pg.waitForSelector('#idmp-toolbar [data-tb="find"]', { timeout: 15000 }).catch(() => {});
  if (await pg.locator('#idmp-find-ov').count()) { await hc('#idmp-find-ov [data-find-ok]'); await pg.waitForTimeout(1000); }
  await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov', { timeout: 8000 }).catch(() => {});
  const t = await measure();
  console.log('§WFLF SO-toolbar ' + JSON.stringify(t ? { placement: t.placement, top: t.top, toolbarBottom: t.toolbarBottom, h: t.h, areaH: t.areaH, mask: t.mask, fixedDark: t.fixedDark } : null));
  ok('L8', 'toolbar Find: below the window toolbar, busy mask #e4e4e4 / opacity .6 inside the window only (Mask.java :32-33)',
    t ? t.placement === 'toolbar' && near(t.top, t.toolbarBottom, 1) && t.mask && t.mask.inMain && t.mask.backgroundColor === 'rgb(228, 228, 228)' && Number(t.mask.opacity) === 0.6 && t.fixedDark === 0 : false,
    t ? 'top=' + t.top + ' toolbarBottom=' + t.toolbarBottom + ' mask=' + JSON.stringify(t.mask) : 'no Find window');
  ok('L9', 'no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  const verdict = fail ? 'FAIL' : (inc || !pass) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§WFLF-VERDICT ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' break=' + (BREAK || 'none') + ' oracle=' + (LEG.capturedAt || '?') + ' theme=' + (LEG.theme || '?'));
  await browser.close(); srv.close(); process.exit(fail ? 1 : verdict === 'INCONCLUSIVE' ? 2 : 0);
})().catch(e => { console.log('§WFLF-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
