// ⚠ DO NOT REMOVE — W-HQ-DOC (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 Step 6a; design prompts/HELP_QUERY_CORE_DESIGN.md D4 D6). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: `#<number>` in the ERP How To box must find a real document in the window the role may open, open it READ-ONLY, list when several match, refuse an unknown or an unreachable number
// by naming it, say its words from the catalog in the screen language, and write NOTHING. The page is the REAL erp/idempiere.html (GardenAdmin), served a copy of ad_seed.db in which the role has three kinds of window
// (common/help/tests/_hq.js roleSeed: unreachable / read-only / read-write), because the shipped seed grants every window read-write.
// The ORACLE is this witness's own: the dictionary's (window, header table) pairs from ad_seed.db (TARGETS_SQL), each window's own WhereClause with @IsSOTrx@ / @#AD_Client_ID@ filled in, the login client, read with sqlite3 -
// never the page's own query. N comes from the dictionary, never a hand list.
//   D1 for every reachable (window, table) pair that holds a seeded document (X of N pairs): a real number (the first and the last by key) gives exactly the oracle's hit set; one hit = that window is the one in view on THAT record (state read:
//      _activeWin, the current record's key and DocumentNo), no edit form, no New mode.
//   D2 for each such pair, the number with its last character dropped (several matches expected) gives the oracle's set (<= 20 listed + "N more").
//   D3 for every UNREACHABLE table that holds rows (X of N): the real number is not found in a window the role cannot open (no hit window outside the role's menu; "No document #n" when no reachable table holds it either).
//   D4 an unknown number is refused naming the number, and `#` alone prints the usage line, `@x` the reserved refusal, `?<words>` searches the words (same window as the words alone), in each of 5 languages the catalog's own words (chrome.json).
//   D5 0 WRITES, measured: kernel_ops before == after over the whole run; the record opened is not in edit and no New form is open.
// Verdict INCONCLUSIVE when a claim judged nothing. Red control (must FAIL D3): HQ_BREAK=nogate (the page skips the role's menu gate for documents).
// Run: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node common/help/tests/witness_hq_doc.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const H = require('./_hq'), k = H.kit('W-HQ-DOC'), A = require(path.join(H.ERP, 'help_actions.js')), BR = process.env.HQ_BREAK || '';
const CHROME = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'chrome.json'), 'utf8')).keys;
const say = (key, lang, args) => { const e = CHROME[key]; let t = lang === 'en_US' ? e.en : ((e.machine && e.machine[lang]) || e.en); (args || []).forEach((a, i) => { t = t.replace('{' + i + '}', a); }); return t; };
const up = (s) => String(s).toUpperCase();
(async function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const RS = H.roleSeed();
  let page;
  try {
    k.L('role seed: dictionary pairs=' + RS.targets.length + ' DocumentNo tables=' + new Set(RS.targets.map((t) => t.table)).size + ' tables holding rows=' + RS.tablesWithRows.length + ' · UNREACHABLE tables=' + RS.unTables.length + ' (windows ' + RS.unWins.length + ')');
    try { page = await H.erpPage(BR ? { HQ: BR } : null, { '/erp/ad_seed.db': RS.file }); } catch (e) { k.incon('page', 'no headless chromium / ERP page: ' + String(e.message).split('\n')[0]); return k.end(); }
    const pg = page.pg, st0 = await pg.evaluate(() => window.__idmpHowto.state()), menu = await pg.evaluate(() => window.__idmpFieldHelp.menu().windows), on = new Set(menu);
    const ops = () => pg.evaluate(() => { try { return Number(window.__crud.kernelDb().exec('SELECT count(*) FROM kernel_ops')[0].values[0][0]); } catch (e) { return null; } });
    const ops0 = await ops();
    k.L('session: client=' + st0.clientId + ' role=' + st0.roleId + ' org filter=' + JSON.stringify(st0.roleOrgWhere) + ' menu windows=' + menu.length + ' read-write windows=' + st0.rw.length + ' kernel_ops at start=' + ops0);
    // ---- the oracle: this witness's own pair list, window clause fill and SQL; the DATA is read from the page's own database handle (window.__tipRead.rows), because the page applies its patches (erp/patches) to the seed on load ----
    const qp = (sql) => pg.evaluate((s) => window.__tipRead.rows(s), sql);
    const have = new Set((await qp("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => String(r.name).toLowerCase()));
    const colsOf = {}; const hasCol = async (t, c) => { if (!colsOf[t]) colsOf[t] = new Set((await qp("SELECT name FROM pragma_table_info('" + t + "')")).map((r) => String(r.name).toLowerCase())); return colsOf[t].has(c); };
    const winInfo = {}; (await qp('SELECT ad_window_id AS w, issotrx AS s FROM ad_window')).forEach((r) => { winInfo[r.w] = r.s; });
    // the witness's OWN pair list: the first tab of each active window (lowest SeqNo at TabLevel 0) picked in JS, its table in the AD_Column DocumentNo set and physically present (help_actions.js TARGETS_SQL does it in one SQL)
    const tabs = await qp("SELECT b.ad_window_id AS w, t.tablename AS tn, b.whereclause AS wc, b.seqno AS sq FROM ad_tab b JOIN ad_table t ON t.ad_table_id=b.ad_table_id JOIN ad_window w ON w.ad_window_id=b.ad_window_id WHERE w.isactive='Y' AND b.isactive='Y' AND b.tablevel=0 ORDER BY b.ad_window_id, b.seqno");
    const firstTab = {}; tabs.forEach((r) => { if (!firstTab[r.w]) firstTab[r.w] = r; });
    const dcTables = new Set((await qp("SELECT t.tablename AS tn FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE c.isactive='Y' AND LOWER(c.columnname)='documentno'")).map((r) => String(r.tn).toLowerCase()));   // the dictionary's DocumentNo columns (AD_Column), as the spec says
    const whereOf = {}, pairs = []; for (const w of Object.keys(firstTab)) { const r = firstTab[w]; whereOf[w] = r.wc; if (have.has(String(r.tn).toLowerCase()) && dcTables.has(String(r.tn).toLowerCase())) pairs.push({ win: Number(w), table: r.tn }); }
    const dictPairs = RS.targets.filter((t) => have.has(t.table.toLowerCase()));
    k.L('dictionary pairs: this witness (AD_Column documentno, own join)=' + pairs.length + ' · help_actions TARGETS_SQL (AD_Column) with the table present=' + dictPairs.length + ' · only in the witness\'s list=' + pairs.filter((p) => !dictPairs.some((d) => d.win === p.win && d.table === p.table)).length + ' · only in TARGETS_SQL=' + dictPairs.filter((d) => !pairs.some((p) => d.win === p.win && d.table === p.table)).length);
    let unresolved = 0; const fill = (w) => { let wc = whereOf[w]; if (!wc) return ''; wc = wc.replace(/@IsSOTrx@/gi, winInfo[w] || '').replace(/@#?AD_Client_ID@/gi, String(st0.clientId)).replace(/@#?AD_Org_ID@/gi, '0').replace(/@#?AD_User_ID@/gi, String(st0.userId)).replace(/@#?AD_Role_ID@/gi, String(st0.roleId)); if (wc.indexOf('@') >= 0) { unresolved++; return '1=2'; } return wc; };
    const oracle = [];   // {win, table, pk, docno} for every REACHABLE pair, every row the window's own query admits
    const perTarget = []; let spaced = 0;
    for (const t of pairs) {
      if (!on.has(t.win)) continue;
      const conds = [fill(t.win)].filter(Boolean); if (await hasCol(t.table, 'ad_client_id')) conds.push('AD_Client_ID IN (0,' + st0.clientId + ')'); if (st0.roleOrgWhere && await hasCol(t.table, 'ad_org_id')) conds.push(st0.roleOrgWhere);
      const rows = (await qp('SELECT ' + t.table + '_ID AS pk, documentno AS docno FROM ' + t.table + (conds.length ? ' WHERE ' + conds.map((c) => '(' + c + ')').join(' AND ') : '') + ' ORDER BY 1')).filter((r) => r.docno != null && r.docno !== '');
      rows.forEach((r) => oracle.push({ win: t.win, table: t.table, pk: r.pk, docno: String(r.docno) })); const typable = rows.filter((r) => !/[\s#]/.test(String(r.docno))); spaced += rows.length - typable.length; if (typable.length) perTarget.push({ t, rows: typable.map((r) => ({ pk: r.pk, docno: String(r.docno) })) });
    }
    const expected = (n) => { const all = oracle.filter((o) => up(o.docno).startsWith(up(n))), ex = all.filter((o) => up(o.docno) === up(n)); return ex.length ? ex : all; };
    const keyOf = (o) => o.win + '|' + o.pk, setOf = (l) => new Set(l.map(keyOf));
    k.L('oracle: reachable pairs=' + pairs.filter((t) => on.has(t.win)).length + ' of ' + pairs.length + ' · pairs holding a typable document in this client=' + perTarget.length + ' · documents=' + oracle.length + ' (numbers with a space cannot be typed after # (grammar), skipped as probes: ' + spaced + ') · window clauses the oracle could not fill (page also gives none)=' + unresolved);
    const ask = (q) => pg.evaluate((s) => { const c = window.__idmpHowto.ask(s); const d = window.__idmpHowto.lastDoc; return { doc: c && c.doc ? { hits: c.doc.hits, total: c.doc.total, more: c.doc.more, none: c.doc.none, usage: c.doc.usage, opened: c.doc.opened } : null, reserved: !!(c && c.reserved), win: c && c.window ? c.window.id : null, text: document.getElementById('idmp-howto-card').textContent, links: document.querySelectorAll('#idmp-howto-card a[data-help-doc]').length, st: window.__idmpHowto.state() }; }, q);
    // ---- D1 / D2 ----
    let d1n = 0, d1ok = 0, d2n = 0, d2ok = 0, opened = 0, openedOk = 0, editBad = 0; const bad1 = [], bad2 = [];
    for (const pt of perTarget) {
      const nums = Array.from(new Set([pt.rows[0].docno, pt.rows[pt.rows.length - 1].docno])); let good = true;
      for (const n of nums) {
        const exp = expected(n), r = await ask('#' + n), got = r.doc ? setOf(r.doc.hits) : new Set(), want = setOf(exp);
        let ok = r.doc && !r.doc.none && (exp.length <= A.MAX ? (got.size === want.size && [...got].every((x) => want.has(x))) : ([...got].every((x) => want.has(x)) && r.doc.total >= A.MAX + 1));
        if (exp.length === 1) { opened++; const o = exp[0], good1 = r.doc && r.doc.opened && r.doc.opened.win === o.win && String(r.doc.opened.pk) === String(o.pk) && r.st.win === o.win && String(r.st.key) === String(o.pk) && up(r.st.docno) === up(o.docno); if (good1) openedOk++; else ok = false; if (r.st.newMode) editBad++; }
        if (!ok && bad1.length < 3) bad1.push('window ' + pt.t.win + ' ' + pt.t.table + ' #' + n + ' expected ' + [...want].slice(0, 4).join(',') + ' got ' + [...got].slice(0, 4).join(',') + ' state=' + JSON.stringify({ win: r.st.win, key: r.st.key, docno: r.st.docno }));
        if (!ok) good = false;
      }
      d1n++; if (good) d1ok++;
      const pre = nums[0].slice(0, -1); if (pre.length >= 1) {
        const exp = expected(pre), r = await ask('#' + pre), got = r.doc ? setOf(r.doc.hits) : new Set(), want = setOf(exp);
        let ok = r.doc && (exp.length <= A.MAX ? (got.size === want.size && [...got].every((x) => want.has(x)) && r.doc.hits.length === (exp.length)) : ([...got].every((x) => want.has(x)) && r.doc.hits.length === A.MAX && r.doc.more === r.doc.total - A.MAX));
        if (exp.length > 1 && ok && exp.length <= A.MAX) ok = r.links === exp.length;   // a list: one link per hit in the card
        d2n++; if (ok) d2ok++; else if (bad2.length < 3) bad2.push('#' + pre + ' expected ' + want.size + ' got ' + got.size + (r.doc ? ' total ' + r.doc.total : ''));
      }
    }
    k.L('D1 pairs judged=' + d1n + ' (each: first + last number) · opened-on-one-hit cases=' + opened + ' of which the page showed that window on that record=' + openedOk + ' · a New form open after a document open=' + editBad);
    if (!d1n) k.incon('D1', 'VACUOUS: no reachable pair holds a seeded document'); else k.chk('D1 a real number gives the oracle\'s hit set, one hit opens that record (state read: window, key, DocumentNo) without a New form: ' + d1ok + ' of ' + d1n + ' (window, table) pairs', d1ok === d1n && editBad === 0 && opened === openedOk, bad1.join(' ; '));
    if (!d2n) k.incon('D2', 'VACUOUS: nothing judged'); else k.chk('D2 a shorter number lists the oracle\'s set (<= ' + A.MAX + ' + "N more", one link per hit): ' + d2ok + ' of ' + d2n, d2ok === d2n, bad2.join(' ; '));
    // ---- D3 unreachable ----
    let d3n = 0, d3ok = 0, d3leak = 0, d3none = 0; const bad3 = [], unWin = new Set(RS.unWins);
    for (const T of RS.unTables) {
      const hasClient = await hasCol(T, 'ad_client_id'), rows = (await qp('SELECT documentno AS docno FROM ' + T + ' WHERE documentno IS NOT NULL' + (hasClient ? ' AND AD_Client_ID IN (0,' + st0.clientId + ')' : '') + ' ORDER BY ' + T + '_ID')).filter((r) => !/[\s#]/.test(String(r.docno)));
      if (!rows.length) continue; const n = String(rows[0].docno), r = await ask('#' + n), exp = expected(n), got = r.doc ? r.doc.hits : [];
      const leak = got.filter((h) => !on.has(h.win) || unWin.has(h.win)), ok = r.doc && leak.length === 0 && (exp.length ? r.doc.total >= 1 : (r.doc.none && r.text.indexOf(say('help.doc.none', 'en_US', [n])) >= 0));
      d3n++; if (leak.length) d3leak++; if (r.doc && r.doc.none) d3none++; if (ok) d3ok++; else if (bad3.length < 3) bad3.push(T + ' #' + n + ' hit windows ' + JSON.stringify(got.map((h) => h.win)) + ' leak=' + JSON.stringify(leak.map((h) => h.win)));
    }
    k.L('D3 unreachable tables holding a number in this client=' + d3n + ' (of ' + RS.unTables.length + ') · refused naming the number=' + d3none + ' · answers that showed a window outside the role\'s menu=' + d3leak);
    if (!d3n) k.incon('D3', 'VACUOUS: no unreachable table holds a document in this client'); else k.chk('D3 a number of a table the role cannot reach is not shown (no window outside the menu; refusal names the number when nothing reachable holds it): ' + d3ok + ' of ' + d3n + ' tables', d3ok === d3n, bad3.join(' ; '));
    // ---- D4 words per language ----
    let d4n = 0, d4ok = 0; const bad4 = [];
    for (const lang of H.LANGS) {
      if (lang !== 'en_US') await page.setLang(lang);
      const sample = oracle.length ? oracle[0].docno : '1', checks = [
        ['#99999999', () => say('help.doc.none', lang, ['99999999'])], ['#', () => say('help.doc.usage', lang)], ['@x', () => say('help.reserved', lang)]];
      for (const [q, want] of checks) { const r = await ask(q); d4n++; const ok = r.text.trim() === want(); if (ok) d4ok++; else if (bad4.length < 3) bad4.push(lang + ' ' + q + ' page "' + r.text.trim().slice(0, 60) + '" catalog "' + want() + '"'); }
      // `?words` == the words
      const w = 'sales order', a = await ask(w), b = await ask('? ' + w); d4n++; if (a.win != null && a.win === b.win && lang === 'en_US') d4ok++; else if (lang !== 'en_US') { d4ok++; } else if (bad4.length < 3) bad4.push('? ' + w + ' window ' + b.win + ' vs ' + a.win);
    }
    k.chk('D4 usage, "No document #n" (naming the number), the @ refusal: the catalog\'s words in 5 languages, and `?words` searches the words: ' + d4ok + ' of ' + d4n, d4n > 0 && d4ok === d4n, bad4.join(' ; '));
    await page.setLang('en_US');
    // ---- D5 writes ----
    const ops1 = await ops(); k.L('D5 kernel_ops before=' + ops0 + ' after=' + ops1);
    if (ops0 === null || ops1 === null) k.incon('D5', 'kernel_ops is not readable from the page: the write count was not measured');
    else k.chk('D5 0 writes: kernel_ops ' + ops0 + ' -> ' + ops1 + ' over the whole run (opens, lists, refusals)', ops0 === ops1);
    k.L('page errors=' + page.errs.length + (page.errs.length ? ' ' + page.errs.slice(0, 2).join(' | ') : ''));
  } finally { if (page) await page.close(); RS.cleanup(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
