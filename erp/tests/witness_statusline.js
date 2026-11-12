#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-STATUSLINE (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.47, S7; TWIN CARDINAL RULE: same operations, same L&F as legacy). READ THE LOG: verdict = §STATUSLINE_VERDICT; exit code alone is not evidence.
// ISSUE it proves/disproves: "the twin's status bar shows no record-info line where legacy's does (Order, Invoice, Invoice Batch, Expense summaries), and nothing generic renders AD_StatusLine".
// S1 the formatter == java.text.MessageFormat (the REAL legacy class, run with java 17, Locale.US) over every pattern the pilot's status lines use × typed argument vectors (ties, zeros, negatives, 0/1/many lines)
// S2 the lookup == MStatusLine.getSL (window+tab, then window with tab NULL, then table): Sales Order header resolves to OrderSummary; a tab with no row resolves to null
// S3 end to end on the twin's own orders: line(order) == the line built from an independent SUM over c_orderline (count, TotalLines, GrandTotal)
// S4 generic: the module names no window/table; S5 no usable context (record with no key) -> null, not a stale line.  STATUSLINE_BREAK=1 makes S1 compare against a deliberately wrong expected → FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node erp/tests/witness_statusline.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const C = require('./dd_common.js'), S = require('../ad_statusline.js'), BREAK = process.env.STATUSLINE_BREAK === '1';
let judged = 0, fails = 0, inconc = 0; const log = console.log;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §STATUSLINE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i ? ' ' + i : '')); };
const inc = (n, w) => { inconc++; log('  §STATUSLINE ' + n + ' INCONCLUSIVE ' + w); };
(async () => {
  const H = await C.boot(), g = q => { const x = H.db.exec(q); return x[0] ? x[0].values : []; };
  const pats = g("select distinct m.msgtext from ad_statusline sl join ad_message m on m.ad_message_id=sl.ad_message_id order by 1").map(r => r[0]);
  if (!pats.length) { inc('S1', 'no window status-line patterns in the twin seed: nothing judged'); }
  else {
    const vecs = [['n:0', 'n:0', 'n:0', 's:USD', 'n:0'], ['n:1', 'n:100.5', 'n:116.25', 's:USD', 'n:116.25'], ['n:3', 'n:1234.125', 'n:1500', 's:MYR', 'n:350.005'], ['n:12', 'n:-7.5', 'n:1234567.895', 's:USD', 'n:0.125'], ['n:2', 'n:10', 'n:20', 's: ', 'n:1']];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl_')), jf = path.join(dir, 'Fmt.java'), inp = path.join(dir, 'in.txt');
    fs.writeFileSync(jf, 'import java.text.*;import java.math.*;import java.util.*;import java.nio.file.*;public class Fmt{public static void main(String[] a)throws Exception{for(String l:Files.readAllLines(Path.of(a[0]))){String[] p=l.split("\\t",-1);Object[] o=new Object[p.length-1];for(int i=1;i<p.length;i++){o[i-1]=p[i].startsWith("n:")?new BigDecimal(p[i].substring(2)):p[i].substring(2);}String pat=p[0].replace("<NL>","\\n");System.out.println(new MessageFormat(pat,Locale.US).format(o).replace("\\n","<NL>"));}}}');
    const cases = []; pats.forEach(p => vecs.forEach(v => cases.push({ p, v })));
    fs.writeFileSync(inp, cases.map(c => c.p.replace(/\n/g, '<NL>') + '\t' + c.v.join('\t')).join('\n'));
    const r = spawnSync('java', [jf, inp], { encoding: 'utf8' });
    if (r.status !== 0) inc('S1', 'java oracle did not run: ' + (r.stderr || '').slice(0, 120));
    else {
      const want = r.stdout.split('\n').slice(0, cases.length), bad = [];
      cases.forEach((c, i) => {
        const ty = S.argTypes(c.p), args = c.v.map((x, k) => x.startsWith('n:') ? Number(x.slice(2)) : x.slice(2));
        const got = S.format(c.p.replace(/\n/g, '\n'), args).replace(/\n/g, '<NL>'); let w = want[i]; if (BREAK && i === 3) w += 'x';
        if (got !== w) bad.push(JSON.stringify({ p: c.p.slice(0, 40), v: c.v.join(','), got, want: w }));
      });
      ck('S1 formatter == java.text.MessageFormat over ' + pats.length + ' patterns × ' + vecs.length + ' vectors = ' + cases.length + ' cases', bad.length === 0, bad.slice(0, 2).join(' | '));
    }
  }
  const rows = q => g(q);
  const so = S.getSL(rows, 143, 186, 259), none = S.getSL(rows, 143, 99999999, 99999999);
  ck('S2 Sales Order header (window 143, tab 186) resolves to a status line, an unrelated tab/table to none', so != null && g('select name from ad_statusline where ad_statusline_id=' + so)[0][0] === 'OrderSummary' && none == null, 'so=' + so + ' none=' + none);
  const ords = g("select o.c_order_id, count(l.c_orderline_id), o.totallines, o.grandtotal, c.iso_code from c_order o join c_currency c on c.c_currency_id=o.c_currency_id left join c_orderline l on l.c_order_id=o.c_order_id group by o.c_order_id, o.totallines, o.grandtotal, c.iso_code having count(l.c_orderline_id) >= 2 order by 1 limit 3");
  if (!ords.length) inc('S3', 'the twin has no order with lines: nothing judged');
  else {
    const bad = [], seen = [];
    ords.forEach(([id, n, tl, gt, iso]) => {
      const ctx = k => ({ c_order_id: id }[String(k).toLowerCase()]);
      const got = S.line({ rows, windowId: 143, tabId: 186, tableId: 259, ctx });
      const expect = S.format('{0,choice,0#No Lines|1#1 Line|1<{0} Lines} - {1,number,#,##0.00} - Total: {2,number,#,##0.00} {3} = {4,number,#,##0.00}', [n, tl, gt, iso, gt]);
      seen.push(got); if (got !== expect) bad.push(id + ': got "' + got + '" want "' + expect + '"');
    });
    ck('S3 line(order) on the twin == the line from an independent SUM/COUNT over c_orderline (' + ords.length + ' orders)', bad.length === 0 && seen.every(x => x), (bad[0] || seen[0]));
  }
  ck('S5 a record with no key gives null (legacy: parseContext empty -> null), not a stale line', S.line({ rows, windowId: 143, tabId: 186, tableId: 259, ctx: () => undefined }) === null);
  ck('S4 the module names no window, tab or table of its own', !/c_order|c_invoice|ad_window_id=\d|ad_tab_id=\d/i.test(fs.readFileSync(path.join(__dirname, '..', 'ad_statusline.js'), 'utf8').replace(/\/\/.*$/gm, '')));
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§STATUSLINE_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc); process.exit(v === 'PASS' ? 0 : 1);
})();
