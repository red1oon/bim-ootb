// ⚠ DO NOT REMOVE — ORACLE for W-FIND-LF (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §FIND-LF). READ THE LOG (§LEG lines).
// Drives the LIVE legacy iDempiere ZK UI (LEGACY_URL, default http://localhost:8088/webui/; GardenAdmin) headless: opens Business Partner (a high-volume
// tab => Find first) and records the Find window's DOM structure + COMPUTED STYLES as numbers (never a screenshot) into
// tests/fixtures/legacy_find_window_bp.json, the oracle the twin witness (witness_find_lf.js) compares against. Re-run only when legacy changes.
// Run: node tests/oracle_legacy_find_window.js   (cwd = bim-ootb/erp; needs the legacy server up)
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright'), fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] }), ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage();
  await pg.goto((process.env.LEGACY_URL || 'http://localhost:8088/webui/'), { waitUntil: 'load', timeout: 60000 }); await pg.waitForTimeout(5000);
  await pg.fill('input.z-textbox[type=text]', 'GardenAdmin'); await pg.fill('input.z-textbox[type=password]', 'GardenAdmin'); await pg.click('button.login-btn.btn-ok'); await pg.waitForTimeout(6000);
  const ok2 = await pg.$('button.login-btn.btn-ok'); if (ok2) { await ok2.click(); await pg.waitForTimeout(6000); }
  await pg.click('input.z-bandbox-input'); await pg.keyboard.type('Business Partner', { delay: 60 }); await pg.waitForTimeout(3000);
  const items = await pg.evaluate(() => Array.from(document.querySelectorAll('.z-bandpopup *')).filter(e => e.offsetParent && /^Business Partner$/.test((e.innerText || '').trim())).map(e => e.tagName + '.' + e.className));
  console.log('§LEG search items=' + JSON.stringify(items.slice(0, 6)));
  const hit = await pg.$$('.z-bandpopup .z-listitem, .z-bandpopup .z-treerow, .z-bandpopup a');
  let clicked = false;
  for (const h of hit) { const t = ((await h.innerText()) || '').trim(); if (/^Business Partner$/.test(t)) { await h.click(); clicked = true; break; } }
  if (!clicked) { await pg.keyboard.press('Enter'); }
  await pg.waitForSelector('.find-window', { timeout: 30000 }); await pg.waitForTimeout(8000); console.log('§LEG desktopTabs=' + JSON.stringify(await pg.evaluate(() => Array.from(document.querySelectorAll('.desktop-tabbox > .z-tabs .z-tab')).map(t => t.innerText.trim() + (t.classList.contains('z-tab-selected') ? '*' : '')))));
  const outline = await pg.evaluate(() => { const out = []; const walk = (e, d) => { if (d > 16 || getComputedStyle(e).display === 'none') return; const c = String(e.className || '').split(' ').filter(x => x && !/^z-flex|^z-vflex|^z-hflex/.test(x)).slice(0, 4).join('.'); const t = e.children.length ? '' : (e.innerText || '').trim().slice(0, 25);
      if (c || t) out.push('  '.repeat(d) + e.tagName.toLowerCase() + (c ? '.' + c : '') + (t ? ' "' + t + '"' : '')); Array.from(e.children).forEach(ch => walk(ch, d + 1)); }; walk(document.querySelector('.find-window'), 0); const chain = []; let p = document.querySelector('.find-window').parentElement; while (p && chain.length < 12) { chain.push(p.tagName.toLowerCase() + '.' + String(p.className).split(' ').slice(0, 3).join('.')); p = p.parentElement; } const m = document.querySelector('.z-modal-mask'); return 'PARENTS: ' + chain.join(' < ') + '\nMASK: ' + (m ? getComputedStyle(m).display + ' ' + getComputedStyle(m).backgroundColor + ' op=' + getComputedStyle(m).opacity : 'none') + '\n' + out.slice(0, 400).join('\n'); });
  const data = await pg.evaluate(() => {
    const cs = (e, props) => { if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect(), o = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; props.forEach(p => o[p] = s[p]); return o; };
    const P = ['backgroundColor', 'backgroundImage', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'borderTop', 'borderBottom', 'borderLeft', 'borderRadius', 'boxShadow', 'padding', 'textAlign', 'lineHeight'];
    const win = document.querySelector('.find-window'), q = s => win.querySelector(s), qa = s => Array.from(win.querySelectorAll(s)).filter(e => e.offsetParent);
    const tb = q('.toolbar');
    return {
      window: cs(win, P), header: Object.assign(cs(q('.z-window-header'), P) || {}, { text: (q('.z-window-header') || {}).innerText }), content: cs(q('.z-window-content'), P),
      toolbar: { box: cs(tb, P), parts: tb ? Array.from(tb.querySelectorAll('.z-label, .z-combobox, .z-toolbarbutton, button, a')).filter(e => e.offsetParent).map(e => ({ cls: String(e.className).slice(0, 60), text: (e.innerText || '').trim(), icon: (e.querySelector('[class*="z-icon-"]') || {}).className || '', st: cs(e, ['backgroundColor', 'color', 'fontSize', 'borderTop', 'borderRadius', 'padding']) })) : [] },
      tabs: qa('.z-tab').map(t => Object.assign(cs(t, P), { text: t.innerText.trim(), selected: t.classList.contains('z-tab-selected') })), tabsBar: cs(q('.z-tabs'), P),
      simpleRows: qa('.find-window-simple .z-grid .z-row').map(r => { const cells = Array.from(r.children); return { cells: cells.map(c => ({ text: (c.innerText || '').trim().slice(0, 40), st: cs(c, ['textAlign', 'width', 'padding', 'fontSize', 'color', 'fontWeight']), inputs: Array.from(c.querySelectorAll('input, select, textarea')).filter(e => e.offsetParent).map(i => Object.assign(cs(i, ['height', 'borderTop', 'borderRadius', 'backgroundColor', 'fontSize', 'padding']), { tag: i.tagName, type: i.type, cls: String(i.className).slice(0, 50) })) })) }; }),
      simpleCols: qa('.find-window-simple .z-grid .z-column').map(c => cs(c, ['width', 'textAlign'])), simpleGrid: cs(q('.find-window-simple .z-grid'), P),
      southButtons: qa('.find-window-simple .z-south button').map(bt => Object.assign(cs(bt, P), { id: bt.id, cls: String(bt.className), text: bt.innerText.trim(), title: bt.title, icon: (bt.querySelector('[class*="z-icon-"]') || {}).className || '' })),
      south: cs(q('.find-window-simple .z-south'), P), statusbar: Object.assign(cs(q('.statusbar'), P) || {}, { text: (q('.statusbar') || {}).innerText }),
      groupRows: qa('.find-window-simple .z-grid .z-group').map(g => (g.innerText || '').trim()), mask: cs(document.querySelector('.z-modal-mask'), ['backgroundColor', 'opacity'])
    };
  });
  data.outlineHead = outline.split('\n').slice(0, 3);
  // Advanced tab + the toolbar path
  const adv = await pg.$$('.find-window .z-tab'); await adv[1].click(); await pg.waitForTimeout(2500);
  const advData = await pg.evaluate(() => { const win = document.querySelector('.find-window'), cs = (e, p) => { if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect(), o = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; p.forEach(k => o[k] = s[k]); return o; };
    const pnl = win.querySelector('.find-window-advanced') || win.querySelectorAll('.z-tabpanel')[1];
    return { heads: Array.from(pnl.querySelectorAll('.z-listheader')).filter(e => e.offsetParent).map(h => Object.assign(cs(h, ['textAlign', 'fontWeight', 'backgroundColor', 'color']), { text: h.innerText.trim() })),
      rows: Array.from(pnl.querySelectorAll('.z-listitem')).filter(e => e.offsetParent).length,
      cells: Array.from((pnl.querySelector('.z-listitem') || { querySelectorAll: () => [] }).querySelectorAll('.z-listcell')).map(c => Array.from(c.querySelectorAll('input, .z-combobox, .z-listbox, select')).map(i => i.className.split(' ')[0]).join('+')),
      north: Array.from(pnl.querySelectorAll('.z-toolbar .z-toolbarbutton, .z-north .z-toolbarbutton')).filter(e => e.offsetParent).map(b => ((b.querySelector('[class*=z-icon-]') || {}).className || '') + ':' + (b.title || '')),
      south: Array.from(pnl.querySelectorAll('.z-south button')).filter(e => e.offsetParent).map(b => ((b.querySelector('[class*=z-icon-]') || {}).className || '') + '@x' + Math.round(b.getBoundingClientRect().x)) }; });
  console.log('§LEG adv heads=' + advData.heads.map(h => h.text + '[' + h.w + ']').join(' | ') + ' rows=' + advData.rows + ' cells=' + JSON.stringify(advData.cells) + ' north=' + advData.north.join(',') + ' south=' + advData.south.join(','));
  data.advanced = advData; data.theme = await pg.evaluate(() => document.body.className); data.capturedAt = new Date().toISOString();
  fs.writeFileSync(__dirname + '/fixtures/legacy_find_window_bp.json', JSON.stringify(data, null, 1)); console.log('§LEG wrote tests/fixtures/legacy_find_window_bp.json');
  // close via Cancel, then reopen from the window toolbar's Find button
  const cancel = await pg.$('.find-window .find-window-advanced .btn-cancel') || await pg.$('.find-window .btn-cancel'); if (cancel) await cancel.click(); await pg.waitForTimeout(3000);
  const tbFind = await pg.$('.adwindow-toolbar [class*="z-icon-Find"], .toolbar-button [class*="z-icon-Find"]');
  console.log('§LEG toolbarFind found=' + !!tbFind);
  if (tbFind) { await tbFind.click(); await pg.waitForTimeout(3500);
    const tp = await pg.evaluate(() => { const w = document.querySelector('.find-window'), r = w && w.getBoundingClientRect(), m = Array.from(document.querySelectorAll('.z-modal-mask, .busy-mask, .z-loading, [class*=mask]')).filter(e => e.offsetParent || getComputedStyle(e).display !== 'none');
      const tb = document.querySelector('.adwindow-toolbar'), tr = tb && tb.getBoundingClientRect(), ad = document.querySelector('.adwindow-layout, .adwindow'), ar = ad && ad.getBoundingClientRect();
      return { find: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, toolbar: tr && { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) }, adwin: ar && { x: Math.round(ar.x), y: Math.round(ar.y), w: Math.round(ar.width), h: Math.round(ar.height) },
        masks: m.map(e => { const s = getComputedStyle(e), q = e.getBoundingClientRect(); return e.className + ' bg=' + s.backgroundColor + ' op=' + s.opacity + ' rect=' + Math.round(q.x) + ',' + Math.round(q.y) + ',' + Math.round(q.width) + 'x' + Math.round(q.height); }) }; });
    console.log('§LEG toolbarPath ' + JSON.stringify(tp)); }

  console.log('§LEG window=' + JSON.stringify(data.window).slice(0, 400)); console.log('§LEG header=' + JSON.stringify(data.header).slice(0, 400));
  console.log('§LEG toolbar parts=' + data.toolbar.parts.map(p => p.text || p.icon || p.cls).join(' | ')); console.log('§LEG tabs=' + data.tabs.map(t => t.text + (t.selected ? '*' : '')).join(' | '));
  console.log('§LEG simple rows=' + data.simpleRows.length + ' first=' + JSON.stringify(data.simpleRows.slice(0, 3).map(r => r.cells.map(c => c.text + '[' + c.st.textAlign + ',' + c.st.w + 'px,' + c.inputs.map(i => i.tag + ':' + i.h + 'h').join('+') + ']'))));
  console.log('§LEG cols=' + JSON.stringify(data.simpleCols.map(c => c.w))); console.log('§LEG groups=' + JSON.stringify(data.groupRows));
  console.log('§LEG south buttons=' + data.southButtons.map(b => b.id + '{' + b.icon + '|' + (b.text || b.title) + '|x' + b.x + ' w' + b.w + ' h' + b.h + '}').join(' '));
  console.log('§LEG statusbar=' + JSON.stringify(data.statusbar).slice(0, 200));
  await b.close();
})().catch(e => { console.log('§LEG ERR ' + e.message); process.exit(1); });
