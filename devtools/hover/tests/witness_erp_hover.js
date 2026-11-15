#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ERP-HOVER (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.22, decision F-17). READ THE LOG after every run: the §ERP_HOVER_W lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: "what code runs when I touch this ERP field?" needed the dictionary and four registries read by hand. The dev hover must list every registered layer of a field
//   in firing order, each with the line that registered it, and never a guessed line. AD-LAYER LAW: the claim is "X of N AD window fields", N taken from the dictionary.
//   E1 the index (devtools/hover/erp_index.json) = a fresh parse; every name the registries REPORT (callout classes, processes, model tables, validators) has its line (unindexed ones listed)
//   E2 the denominator: the node kernel (erp/ws_kernel.js load(), plus every erp/callouts/*.js as the page loads them) over EVERY column shown on an active AD window: each layer that names a line
//      must land on a line whose text holds that registration (the name, or prototype.<method>); UNPORTED callouts/processes are counted and listed, not failed (a coverage fact)
//   E2b every UNPORTED claim agrees with the ENGINE's own lookup (ad_callout.js getCallout; ad_process JAVA + handlers): v1 called CalloutEngine.dateAcct UNPORTED (found 2026-11-15)
//   E3 RED CONTROL: one index entry that E2 used is removed -> the judge must count its layers as unresolved
//   E4 THE PAGE (headless Chromium, CPU, ONE session): GardenWorld login, the Sales Order window, the overlay loaded with the bookmarklet's own code, REAL mouse hovers on form fields: the tooltip's
//      stack (step, kind, name, line) = E2's for that column; EVERY number the tooltip shows is pressed (Alt+n) and must open the line printed beside it. INCONCLUSIVE if it hovered 0 fields with a layer that names a line. WEH_PAGE=0 skips E4 (printed).
// Run it alone, at low priority:  nice -n 19 ionice -c3 node devtools/hover/tests/witness_erp_hover.js < /dev/null > <log>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), ERP = path.join(ROOT, 'erp'), HV = path.join(ROOT, 'devtools', 'hover');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const BOOKMARKLET = "(function(){var s=document.createElement('script');s.src='/devtools/hover/erp_hover.js?'+Date.now();document.head.appendChild(s)})()";
const H = require(path.join(HV, 'erp_hover.js'));
const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
(async () => {
  // E1 — the index = a fresh parse
  const gen = cp.spawnSync('node', [path.join(HV, 'gen_erp_index.js'), '--root', ROOT], { encoding: 'utf8' });
  const IX = JSON.parse(fs.readFileSync(path.join(HV, 'erp_index.json'), 'utf8')), FRESH = require(path.join(HV, 'erp_sites.js')).sites(ROOT);
  const same = JSON.stringify(IX.entries) === JSON.stringify(FRESH.entries);
  console.log('§ERP_HOVER_W E1 ' + (gen.stdout || '').trim().replace(ROOT, '<bim-ootb>') + ' same_as_fresh_parse=' + (same ? 'Y' : 'N'));
  const log0 = console.log; console.log = () => {};
  const K = await require(path.join(ERP, 'ws_kernel.js')).load();
  fs.readdirSync(path.join(ERP, 'callouts')).filter(f => /\.js$/.test(f)).forEach(f => { try { require(path.join(ERP, 'callouts', f)); } catch (e) { /* a port needing a browser-only global */ } });
  console.log = log0;
  const ctx = index => ({ q: K.q, callouts: require(path.join(ERP, 'ad_callout.js')), models: require(path.join(ERP, 'model_layer.js')), validators: require(path.join(ERP, 'ad_modelval.js')), processes: require(path.join(ERP, 'ad_process.js')), index });
  const C0 = ctx(IX), has = (kind, pred) => IX.entries.some(e => e.kind === kind && pred(e));
  const rep = { callout: Object.keys(C0.callouts.describe().classes).filter(k => k.indexOf('.') > 0), process: Object.keys(C0.processes.describe().processes), model: Object.keys(C0.models.describe().models),
    validator: [].concat.apply([], Object.keys(C0.validators.REGISTRY).map(t => [].concat.apply([], Object.keys(C0.validators.REGISTRY[t]).map(tm => C0.validators.REGISTRY[t][tm].map(v => t + '|' + v.name))))) };
  const miss = { callout: rep.callout.filter(k => !has('callout', e => e.key === k)), process: rep.process.filter(k => !has('process', e => e.key === k)), model: rep.model.filter(k => !has('model', e => e.key === k)),
    validator: rep.validator.filter(k => !has('validator', e => e.key + '|' + e.name === k)) };
  Object.keys(rep).forEach(k => console.log('§ERP_HOVER_W E1 kind=' + k + ' registered=' + rep[k].length + ' indexed=' + (rep[k].length - miss[k].length) + (miss[k].length ? ' not_indexed=' + miss[k].slice(0, 8).join(',') + (miss[k].length > 8 ? ',…' : '') : '')));
  ok('E1 the index = a fresh parse', gen.status === 0 && same);
  // E2 — every column shown on an active AD window
  const fields = K.q("SELECT DISTINCT t.tablename AS t, c.columnname AS c FROM ad_field f JOIN ad_tab tb ON tb.ad_tab_id = f.ad_tab_id JOIN ad_window w ON w.ad_window_id = tb.ad_window_id " +
    "JOIN ad_column c ON c.ad_column_id = f.ad_column_id JOIN ad_table t ON t.ad_table_id = c.ad_table_id WHERE f.isactive = 'Y' AND tb.isactive = 'Y' AND w.isactive = 'Y' ORDER BY 1, 2");
  const lineText = at => { const m = /^(.*):(\d+)$/.exec(at); try { return fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split('\n')[Number(m[2]) - 1] || ''; } catch (e) { return ''; } };
  const holds = l => { const t = lineText(l.at), nm = l.name.replace(/\s*\(.*\)$/, ''); if (l.kind === 'callout') return t.indexOf('prototype.' + nm.split('.').pop()) >= 0 || t.indexOf(nm.split('.')[0]) >= 0;
    if (l.kind === 'model' || l.kind === 'doc action') return /register(Model|DocAction)\(/.test(t) || new RegExp('\\b' + l.__table + '\\s*:', 'i').test(t);   // a loop-installed model's line is its { <table>: … } entry if (l.kind === 'process') return /defineProcess\(/.test(t); if (l.kind === 'model validator') return t.indexOf(nm) >= 0 || /registerValidator\(/.test(t);
    if (l.kind === 'column-callout') return /defineColumnCallout\(/.test(t); return t.length > 0; };
  const judge = index => { const c = ctx(index), S = {}; let withLayers = 0, named = 0, resolved = 0, unported = 0, bad = [], unresolved = 0, falseUnported = 0; const unp = {}, falseU = [];
    fields.forEach(f => { const s = quiet(() => H.stackFor(f.t, f.c, c)); S[f.t + '.' + f.c] = s; if (s.layers.length > 1) withLayers++;
      s.layers.forEach(l => { l.__table = String(f.t).toLowerCase(); if (l.kind === 'callout' || l.kind === 'process') named++;
        if (/^UNPORTED/.test(l.note || '')) { unported++; unp[l.name] = 1;   // E2b: every UNPORTED claim must agree with the ENGINE's own lookup (v1 called a real callout UNPORTED)
          // the command / class come from the DICTIONARY here, not from the hover's output (a check that read the hover's own fields was blind to v1: its red run passed)
          const row = K.q("SELECT c.callout, p.classname FROM ad_column c JOIN ad_table t ON t.ad_table_id = c.ad_table_id LEFT JOIN ad_process p ON p.ad_process_id = c.ad_process_id WHERE lower(t.tablename) = ? AND lower(c.columnname) = ?", [String(f.t).toLowerCase(), String(f.c).toLowerCase()])[0] || {};
          const cmd = String(row.callout || '').split(/[;,]/).map(x => x.trim()).filter(Boolean).find(x => { const i = x.lastIndexOf('.'); return x.slice(0, i).split('.').pop() + '.' + x.slice(i + 1) === l.name; });
          const live = l.kind === 'callout' ? !!(cmd && c.callouts.hasCallout(cmd)) : l.kind === 'process' ? !!(row.classname && (c.processes.describe().processes[row.classname] || c.processes.describe().handlers[row.classname])) : false;
          if (live) { falseUnported++; if (falseU.length < 5) falseU.push(f.t + '.' + f.c + ' ' + l.kind + ':' + l.name); } return; }
        if (/line not in the index/.test(l.note || '')) { unresolved++; if (bad.unres = bad.unres || [], bad.unres.length < 12) bad.unres.push(f.t + '.' + f.c + ' ' + l.kind + ':' + l.name); return; }
        if (l.at) { if (holds(l)) resolved++; else bad.push(f.t + '.' + f.c + ' ' + l.kind + ':' + l.name + '@' + l.at); } }); });
    return { S, withLayers, named, resolved, unported, unp: Object.keys(unp), bad, unresolved, falseUnported, falseU }; };
  const J = judge(IX);
  console.log('§ERP_HOVER_W E2 fields=' + fields.length + ' with_layers=' + J.withLayers + ' callouts_and_processes_named=' + J.named + ' lines_resolved=' + J.resolved + ' wrong_line=' + J.bad.length + ' unresolved=' + J.unresolved + ' unported=' + J.unported + ' (distinct ' + J.unp.length + ')');
  console.log('§ERP_HOVER_W E2 unported_first=' + J.unp.slice(0, 10).join(','));
  J.bad.slice(0, 5).forEach(b => console.log('  §ERP_HOVER_W E2 WRONG_LINE ' + b));
  (J.bad.unres || []).forEach(b => console.log('  §ERP_HOVER_W E2 UNRESOLVED ' + b));
  if (!fields.length) { console.log('§ERP_HOVER_W VERDICT INCONCLUSIVE no AD window field in the dictionary'); process.exit(2); }
  console.log('§ERP_HOVER_W E2b false_unported=' + J.falseUnported + (J.falseU.length ? ' e.g. ' + J.falseU.join(' | ') : ''));
  ok('E2b every UNPORTED the hover says agrees with the engine\'s own lookup (getCallout / the process registries)', J.falseUnported === 0);
  ok('E2 every layer that names a line lands on its registration, over all ' + fields.length + ' AD window fields', J.bad.length === 0 && J.unresolved === 0 && J.resolved > 0, J.withLayers + ' fields with layers beyond the dictionary row');
  // E3 — red control
  const used = (() => { for (const k of Object.keys(J.S)) for (const l of J.S[k].layers) if (l.at && l.kind === 'callout') return l.at; return null; })();
  const broken = Object.assign({}, IX, { entries: IX.entries.filter(e => e.file + ':' + e.line !== used) }), J3 = judge(broken);
  console.log('§ERP_HOVER_W E3 red-control removed=' + used + ' unresolved_or_wrong=' + (J3.unresolved + J3.bad.length) + ' (was ' + (J.unresolved + J.bad.length) + ')');
  ok('E3 red control: a removed index entry is counted, not hidden', !!used && J3.unresolved + J3.bad.length > J.unresolved + J.bad.length);
  // E4 — the page
  if (process.env.WEH_PAGE === '0') console.log('§ERP_HOVER_W E4 skipped (WEH_PAGE=0)');
  else await page(J.S, IX);
  console.log('§ERP_HOVER_W VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§ERP_HOVER_W FATAL ' + (e && e.stack || e)); process.exit(1); });

async function page(S, IX) {
  const http = require('http'), { chromium } = require(process.env.PW || path.join(ROOT, 'tests', 'node_modules', 'playwright'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { const fp = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }); });
  await new Promise(z => srv.listen(0, z));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' }), pg = await cx.newPage(), LOG = [];
  pg.on('console', m => LOG.push(m.text())); pg.on('pageerror', e => LOG.push('PAGEERR ' + e));
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle', timeout: 180000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 120000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => window.APP && window.APP.clientId != null && document.querySelector('#idmp-tree .idmp-row'), null, { timeout: 120000 }); await pg.waitForTimeout(1500);
    await pg.evaluate(BOOKMARKLET); await pg.waitForFunction(() => window.__ERP_HOVER && window.__ERP_HOVER.ready, null, { timeout: 30000 }); await pg.evaluate(() => window.__ERP_HOVER.ready);
    await pg.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; }; });
    // open the Sales Order window (143) from the menu, as a person does (the leaf's parents are opened first)
    const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT ad_menu_id FROM ad_menu WHERE action='W' AND ad_window_id=143 AND isactive='Y'"); return r.length ? r[0].values[0][0] : 0; });
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain || []) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) { await pg.click('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); await pg.waitForTimeout(250); } }
    await pg.click('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(3000);
    // the first record in the form (the grid's first row, if the window opened on the grid)
    if (!(await pg.$('[data-ad-table] input[data-col], [data-ad-table] select[data-col]'))) { const tr = await pg.$('tr[data-ad-table][data-ad-record]'); if (tr) { await tr.dblclick(); await pg.waitForTimeout(2500); } }
    const targets = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-ad-table] [data-col], [data-ad-column]')).filter(e => e.offsetWidth > 0 && e.offsetHeight > 0).slice(0, 40).map(e => {
      const r = e.getBoundingClientRect(), h = e.hasAttribute('data-ad-table') ? e : e.closest('[data-ad-table]'); return { x: Math.round(r.left + Math.min(20, r.width / 2)), y: Math.round(r.top + r.height / 2), t: h.getAttribute('data-ad-table'), c: e.getAttribute('data-ad-column') || e.getAttribute('data-col') }; }));
    const seen = [], wrong = []; let keysTried = 0, keysBad = 0; const keysBadEx = [];
    for (const g of targets) {
      await pg.mouse.move(5, 5); await pg.mouse.move(g.x, g.y); await pg.waitForTimeout(120);
      const cur = await pg.evaluate(() => { const c = window.__ERP_HOVER.state.cur; return c ? { t: c.table, c: c.column, found: c.found, layers: c.layers.map(l => [l.step, l.kind, l.name, l.at]) } : null; });   // owner text may differ (the page installs validators at the first save): step, kind, name and line must not
      if (!cur || !cur.found) continue;
      const n = S[cur.t + '.' + cur.c] || S[Object.keys(S).find(k => k.toLowerCase() === (cur.t + '.' + cur.c).toLowerCase())], want = n ? n.layers.map(l => [l.step, l.kind, l.name, l.at]) : null;
      const eq = want && JSON.stringify(want) === JSON.stringify(cur.layers); seen.push({ id: cur.t + '.' + cur.c, layers: cur.layers.length, lined: cur.layers.filter(l => l[3]).length }); if (!eq) { wrong.push(cur.t + '.' + cur.c); if (!wrong.diff && want) { let i = want.findIndex((w, k) => JSON.stringify(w) !== JSON.stringify(cur.layers[k])); if (i < 0) i = Math.min(want.length, cur.layers.length); wrong.diff = cur.t + '.' + cur.c + ' first difference at layer ' + i + ': node=' + JSON.stringify(want[i]) + ' page=' + JSON.stringify(cur.layers[i]) + ' (node ' + want.length + ' layers, page ' + cur.layers.length + ')'; } }
      // every number the tooltip SHOWS must open the line printed next to it (v1's key map lost a number after a layer without a line: key 1 on Target Document Type did nothing)
      const shown = await pg.evaluate(() => { const out = []; (document.getElementById('erp-hover-tip').textContent || '').split('\n').forEach(ln => { const m = /^\s*\[(\d)\] .*?\s(erp\/[^\s]+:\d+)/.exec(ln); if (m) out.push({ n: m[1], at: m[2] }); }); return out; });
      for (const k of shown) { await pg.evaluate(() => { window.__opened = []; }); await pg.keyboard.press('Alt+' + k.n); await pg.waitForTimeout(60); const u = (await pg.evaluate(() => window.__opened.slice()))[0] || '';
        keysTried++; if (!u.endsWith('/' + k.at)) { keysBad++; if (keysBadEx.length < 4) keysBadEx.push(cur.t + '.' + cur.c + ' [' + k.n + '] ' + k.at + ' -> ' + (u || 'nothing')); } else if (!seen.vlink) { seen.vlink = u; seen.vfield = cur.t + '.' + cur.c; } }
    }
    const lined = seen.filter(s => s.lined > 0).length, errs = LOG.filter(l => /^PAGEERR/.test(l)).length;
    console.log('§ERP_HOVER_W E4 window=143 targets=' + targets.length + ' hovered=' + seen.length + ' distinct_fields=' + new Set(seen.map(x => x.id)).size + ' with_lines=' + lined + ' same_as_node=' + (seen.length - wrong.length) + ' wrong=' + wrong.length + ' page_errors=' + errs + ' installed="' + (LOG.find(l => /§ERP_HOVER installed/.test(l)) || '') + '"');
    seen.slice(0, 6).forEach(s => console.log('  §ERP_HOVER_W E4 field=' + s.id + ' layers=' + s.layers + ' with_line=' + s.lined));
    console.log('  §ERP_HOVER_W E4 keys tried=' + keysTried + ' wrong_or_dead=' + keysBad + (keysBadEx.length ? ' e.g. ' + keysBadEx.join(' | ') : '') + ' first_link=' + String(seen.vlink || '-').replace(ROOT, '<bim-ootb>'));
    wrong.slice(0, 5).forEach(w => console.log('  §ERP_HOVER_W E4 WRONG ' + w));
    if (wrong.diff) console.log('  §ERP_HOVER_W E4 FIRST_DIFF ' + wrong.diff);
    if (!lined) { console.log('§ERP_HOVER_W VERDICT INCONCLUSIVE the page hover reached 0 fields with a lined layer'); process.exit(2); }
    ok('E4 the page: every hovered field shows the same stack as the node kernel, and EVERY number shown (Alt+n) opens the line printed beside it', wrong.length === 0 && keysTried > 0 && keysBad === 0 && errs === 0, seen.length + ' hovers, ' + keysTried + ' keys');
  } finally { await br.close(); srv.close(); }
}
