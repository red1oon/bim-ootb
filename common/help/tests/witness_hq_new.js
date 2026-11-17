// ⚠ DO NOT REMOVE — W-HQ-NEW (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 Step 6a; design prompts/HELP_QUERY_CORE_DESIGN.md D6; legacy MenuSearchController.java:435-451 the new-record button). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: a window result in the ERP How To box offers New ONLY where the role holds the window READ-WRITE, never on a read-only window or one off the role's menu, and New opens the window on an UNSAVED row and writes NOTHING.
// The page is the REAL erp/idempiere.html (GardenAdmin) served a copy of ad_seed.db where the role has unreachable / read-only / read-write windows (common/help/tests/_hq.js roleSeed; the shipped seed grants every window read-write).
// N = the ACTIVE windows of the dictionary (AD_Window IsActive='Y', read from the page's own database), never a hand list. The oracle is the role's own AD_Window_Access rows (IsReadWrite), read through the page's database handle.
//   N1 for every active window w: ask its name in the box; when the box's window result IS w, the New link is there exactly when AD_Window_Access.IsReadWrite='Y' AND the header tab can create (not a view, IsReadOnly='N', IsInsertRecord='Y', a displayed non-key field: the toolbar's own New; legacy does nothing on such a tab) (X of N judged; read-only windows show none); when w is not on the role's menu there is no window result
//      for it and no New link for it (X of M); a name that resolves to another window is counted apart and printed (not judged as w).
//   N2 clicking New (the real link) on every offered window opens THAT window with an UNSAVED row (state read: window in view, new-record mode, the form mounted) and kernel_ops is unchanged (X of N offered).
//   N3 the link's own handler refuses a read-only or off-menu window (window not opened, kernel_ops unchanged), so the gate is not only a hidden button (X of N).
// Verdict INCONCLUSIVE when a claim judged nothing (no read-only window, no offered window...). Red control (must FAIL N1 and N3): HQ_BREAK=nogate (the page offers New without the read-write test and without the menu gate).
// Run: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node common/help/tests/witness_hq_new.js
'use strict';
const H = require('./_hq'), k = H.kit('W-HQ-NEW'), BR = process.env.HQ_BREAK || '';
(async function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const RS = H.roleSeed(); let page;
  try {
    try { page = await H.erpPage(BR ? { HQ: BR } : null, { '/erp/ad_seed.db': RS.file }); } catch (e) { k.incon('page', 'no headless chromium / ERP page: ' + String(e.message).split('\n')[0]); return k.end(); }
    const pg = page.pg, qp = (sql) => pg.evaluate((s) => window.__tipRead.rows(s), sql), st0 = await pg.evaluate(() => window.__idmpHowto.state()), menu = await pg.evaluate(() => window.__idmpFieldHelp.menu().windows), on = new Set(menu);
    const wins = await qp("SELECT ad_window_id AS id, name FROM ad_window WHERE isactive='Y' ORDER BY ad_window_id");
    const acc = {}; (await qp("SELECT ad_window_id AS id, isreadwrite AS rw FROM ad_window_access WHERE ad_role_id=" + st0.roleId + " AND isactive='Y'")).forEach((r) => { acc[r.id] = r.rw; });
    // the header tab's own New condition, from the dictionary (this witness's SQL): not a view, AD_Tab.IsReadOnly='N', AD_Tab.IsInsertRecord='Y', and a displayed non-key field (legacy's New does nothing on such a tab)
    const views = new Set((await qp("SELECT name FROM sqlite_master WHERE type='view'")).map((r) => String(r.name).toLowerCase()));
    const hdr = {}; (await qp("SELECT b.ad_window_id AS w, b.isreadonly AS ro, b.isinsertrecord AS ins, t.tablename AS tn, b.seqno AS sq, (SELECT count(*) FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=b.ad_tab_id AND f.isactive='Y' AND f.isdisplayed='Y' AND c.iskey='N') AS nf FROM ad_tab b JOIN ad_table t ON t.ad_table_id=b.ad_table_id WHERE b.isactive='Y' AND b.tablevel=0 ORDER BY b.ad_window_id, b.seqno")).forEach((r) => { if (!hdr[r.w]) hdr[r.w] = r; });
    const insertable = (w) => { const h = hdr[w]; return !!h && !views.has(String(h.tn).toLowerCase()) && h.ro !== 'Y' && h.ins !== 'N' && Number(h.nf) > 0; };
    const ops = () => pg.evaluate(() => { try { return Number(window.__crud.kernelDb().exec('SELECT count(*) FROM kernel_ops')[0].values[0][0]); } catch (e) { return null; } });
    const ops0 = await ops(), pageRw = new Set(st0.rw);
    const oracleRw = (w) => acc[w] === 'Y' && insertable(w);   // New = a read-write grant AND a header tab that can create
    k.L('role ' + st0.roleId + ': active windows N=' + wins.length + ' · access rows=' + Object.keys(acc).length + ' (read-write ' + Object.keys(acc).filter((w) => acc[w] === 'Y').length + ', read-only ' + Object.keys(acc).filter((w) => acc[w] === 'N').length + ') · on the menu=' + menu.length + ' · page winSet read-write=' + pageRw.size + ' · kernel_ops=' + ops0);
    const askCard = (n) => pg.evaluate((s) => { const c = window.__idmpHowto.ask(s); return { win: c && c.window ? c.window.id : null, news: Array.from(document.querySelectorAll('#idmp-howto-card a[data-help-new]')).map((a) => Number(a.getAttribute('data-help-new'))) }; }, n);
    let jn = 0, jok = 0, amb = 0, offN = 0, roN = 0, rwNoIns = 0, unN = 0, unOk = 0; const offered = [], bad = [], roMenu = [], offMenu = [];
    for (const w of wins) {
      const c = await askCard(w.name);
      if (!on.has(w.id)) { unN++; if (c.win !== w.id && c.news.indexOf(w.id) < 0) unOk++; else if (bad.length < 4) bad.push('off-menu window ' + w.id + ' "' + w.name + '" shows result=' + c.win + ' new=' + JSON.stringify(c.news)); offMenu.push(w.id); continue; }
      if (c.win !== w.id) { amb++; if (oracleRw(w.id) === false) roMenu.push(w.id); continue; }
      const has = c.news.indexOf(w.id) >= 0, want = oracleRw(w.id); jn++; if (has === want) jok++; else if (bad.length < 4) bad.push('window ' + w.id + ' "' + w.name + '" New=' + has + ' but IsReadWrite=' + acc[w.id] + ' insertable=' + insertable(w.id));
      if (want) { offN++; if (has) offered.push(w); } else { if (acc[w.id] === 'Y') rwNoIns++; roN++; roMenu.push(w.id); }
    }
    k.L('N1 active windows N=' + wins.length + ': judged as the box\'s window result=' + jn + ' (New offered ' + offN + ', not offered ' + roN + ' = read-only ' + (roN - rwNoIns) + ' + read-write but the header tab cannot create ' + rwNoIns + ') · off the role\'s menu=' + unN + ' (no result and no New: ' + unOk + ') · name resolved to another window (not judged)=' + amb);
    if (!jn || !offN || !roN) k.incon('N1', 'VACUOUS: judged=' + jn + ' read-write=' + offN + ' read-only=' + roN + ' (a claim needs both kinds)');
    else k.chk('N1 New is offered exactly on read-write windows whose header tab can create: ' + jok + ' of ' + jn + ' windows judged (' + unOk + ' of ' + unN + ' off-menu windows show no result and no New)', jok === jn && unOk === unN, bad.join(' ; '));
    // N2: the real link on every offered window
    let n2 = 0, n2ok = 0; const bad2 = [], t0 = Date.now();
    for (const w of offered) {
      await pg.evaluate((s) => window.__idmpHowto.ask(s), w.name);
      const before = await ops(); n2++;
      await pg.evaluate((id) => document.querySelector('#idmp-howto-card a[data-help-new="' + id + '"]').click(), w.id);
      let s = null; for (let i = 0; i < 40; i++) { s = await pg.evaluate(() => window.__idmpHowto.state()); if (s.win === w.id && s.newMode) break; await pg.waitForTimeout(100); }
      const after = await ops(), ok = s.win === w.id && s.newMode && s.inlineForm && before === after;
      if (ok) n2ok++; else if (bad2.length < (process.env.NEW_DEBUG ? 40 : 4)) bad2.push('window ' + w.id + ' "' + w.name + '" table=' + s.table + ' inView=' + s.win + ' newMode=' + s.newMode + ' form=' + s.inlineForm + ' ops ' + before + '->' + after);
    }
    k.L('N2 offered windows clicked=' + n2 + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
    if (!n2) k.incon('N2', 'VACUOUS: nothing was offered'); else k.chk('N2 New opens that window on an unsaved row with 0 writes (state: window, new-record mode, form mounted; kernel_ops unchanged): ' + n2ok + ' of ' + n2 + ' offered windows', n2ok === n2, bad2.join(' ; '));
    // N3: the handler's own gate (read-only windows on the menu + off-menu windows)
    let n3 = 0, n3ok = 0; const bad3 = [], probe = roMenu.concat(offMenu).slice(0, 60);
    for (const id of probe) {
      const before = await ops(), s0 = await pg.evaluate(() => window.__idmpHowto.state()), r = await pg.evaluate((w) => window.__idmpHowto.newFor(w), id);
      await pg.waitForTimeout(150); const s1 = await pg.evaluate(() => window.__idmpHowto.state()), after = await ops(); n3++;
      if (r === false && s1.win === s0.win && before === after) n3ok++; else if (bad3.length < 4) bad3.push('window ' + id + ' handler returned ' + r + ' inView ' + s0.win + '->' + s1.win + ' ops ' + before + '->' + after);
    }
    if (!n3) k.incon('N3', 'VACUOUS: no read-only or off-menu window to probe'); else k.chk('N3 the New handler refuses a read-only or off-menu window (nothing opened, 0 writes): ' + n3ok + ' of ' + n3 + ' (' + roMenu.length + ' read-only on the menu + ' + offMenu.length + ' off the menu known; first 60 probed)', n3ok === n3, bad3.join(' ; '));
    const ops1 = await ops(); k.L('kernel_ops start=' + ops0 + ' end=' + ops1); if (ops0 === null) k.incon('ops', 'kernel_ops not readable'); else k.chk('0 writes over the whole run: kernel_ops ' + ops0 + ' -> ' + ops1, ops0 === ops1);
    k.L('page errors=' + page.errs.length + (page.errs.length ? ' ' + page.errs.slice(0, 2).join(' | ') : ''));
  } finally { if (page) await page.close(); RS.cleanup(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
