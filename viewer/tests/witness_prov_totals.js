#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-PROV-TOTALS (§11 P7), prompts/DISC_WALK_BAND_NO_HOST.md "§11 P7 SPEC". Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: a Viewer DB exported after a walk holds provisional devices (borrowed density: a count, not a location).
// Does the Viewer still count them in its totals (HUD, Find dropdowns and result line, NL answers, quantities) — and does a
// DB with no walk set stay exactly as before? Owner 2026-11-08: "Leave them out"; the devices stay listed and labelled.
//   P7a census: every COUNT(/SUM( near elements_meta in the Viewer is swapped through ProvTotals or sits in the reason table
//       below with its expected count; an unlisted one FAILS. RED: main's tree must fail the same census.
//   P7b node: ProvTotals returns COUNT(*) on the resident and with the switch on; the swapped SQL counts resident + FALSE rows.
//   P7c real page on the fixture: totals equal node truth without the TRUE rows; an all-provisional class stays at (0);
//       its result rows are listed and labelled. RED: __vwCountProvisional=true puts the TRUE rows back in every total.
//   P7d real page on the untouched resident: same totals as node truth, no site swapped, § line says unchanged.
// Usage: [P7_BASE=<viewer db>] [P7_RED_REF=<commit>] node viewer/tests/witness_prov_totals.js   (software GL only: no GPU, no bake)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process');
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const Database = require(path.join(NM, 'better-sqlite3')), puppeteer = require(path.join(NM, 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), VIEWER = path.join(ROOT, 'viewer'), SHARED = path.join(process.env.HOME, 'bim-ootb');
const BASE = process.env.P7_BASE || path.join(SHARED, 'buildings', 'Duplex_extracted.db');
const RED_REF = process.env.P7_RED_REF || 'c5ddd579';   // pinned: the commit before P7 (a live tree goes vacuous once this merges)
const PT = require(path.join(VIEWER, 'provisional_totals.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const TAG = '§W-PROV-TOTALS';

// ── P7a: the census. Files whose count lines are NOT totals, with how many such lines and why (spec "Not swapped"). ──
const NOT_TOTALS = {
  'streaming.js': [8, 'load plumbing: civil presence, largest building, element count for loading'],
  'tools.js': [3, 'presence (civil, light fixtures) and z-band geometry'],
  'helpers.js': [1, 'load plumbing'], 'main.js': [1, 'diff DB presence'], 'scene.js': [3, 'merge plumbing: per-building count and centroid'],
  'tour.js': [3, 'cache key'], 'nf_highlight_cost.js': [1, 'large-building perf threshold'], 'nf_tree_lens.js': [2, 'presence of elements / materials'],
  'nf_panel_search.js': [1, 'main entrance: storey with the most doors'], 'fx_props_staffage.js': [3, 'presence of real people/trees/cars'],
  'cpe_road_panels.js': [3, 'presence'], 'wh_walk.js': [2, 'presence'], 'doc_canvas.js': [1, 'presence of a roof'], 'cpe_linear_beat.js': [1, 'presence'],
  'cpe_resource_panel.js': [1, 'COUNT(DISTINCT storey): levels, not elements'], 'cpe_sun_compass.js': [3, 'geometry statistics'],
  'boq_charts.html': [4, 'largest building, presence, and COUNT(DISTINCT geometry_hash)'], 'mep_report.html': [1, 'largest building'],
  'measure.js': [5, 'clash: provisional devices are still geometry that can clash'], 'clash_matrix.js': [1, 'clash'], 'clash_report.js': [1, 'clash'],
  'cpe_storey_reveal.js': [5, 'film reveal bands: the devices are drawn, so they animate'], 'fx_cpe_reveal_bands.js': [1, 'film reveal bands'],
  'grid_overlay.js': [2, 'storey for the grid'], 'section_cut.js': [2, 'storey floor levels'], 'routewalker.js': [1, 'route logic'],
  'wizard.js': [2, 'diagnostics: material and proxy name breakdown'], 'import_db_builder.js': [1, 'import writer'], 'rates.js': [1, 'comment'],
  'schedule_gate.js': [1, 'comment'], 'egress_sanity.js': [2, 'FOR THE OWNER: counts provisional sprinklers as FP present'],
  'rule_report.js': [16, 'FOR THE OWNER: sufficiency probes count what the evaluators judge'],
  'schedule_author.js': [5, 'FOR THE OWNER: the 4D schedule'], 'tm_lifecycle_api.js': [1, 'FOR THE OWNER: 4D'], 'tm_sched_xray.js': [1, 'FOR THE OWNER: 4D'],
  'mep_qto_populate.js': [4, 'FOR THE OWNER: offline node tool for qto_cache'],
};
const SWAPPED = /ProvTotals\.|_pvCount\(|_pvC\(|_pvS\(|_pc\(\)|\$\{C\}|' \+ C \+ '|_pvd|_pvc/;
function census(read, list) {
  const per = {}, swapped = {};
  list.forEach(f => { const L = (read(f) || '').split('\n'); L.forEach((l, i) => {
    if (!/COUNT\(|SUM\(/.test(l)) return; if (!/elements_meta/.test(L.slice(Math.max(0, i - 3), i + 4).join(' '))) return;
    if (SWAPPED.test(l)) return; (per[f] = per[f] || []).push((i + 1) + ': ' + l.trim().slice(0, 110)); }); });
  list.forEach(f => { const n = ((read(f) || '').match(/ProvTotals\.(count|sum)\(|_pvCount\(\)|_pvC\(db\)|_pvS\(db,|_pc\(\)|countExpr: ProvTotals/g) || []).length; if (n) swapped[f] = n; });
  const bad = [];
  Object.keys(per).forEach(f => { const want = NOT_TOTALS[f]; if (!want) bad.push(f + ' unlisted ' + per[f].length + ' [' + per[f].slice(0, 2).join(' | ') + ']'); else if (want[0] !== per[f].length) bad.push(f + ' has ' + per[f].length + ' not ' + want[0] + ' [' + per[f].join(' | ') + ']'); });
  return { bad, swapped, nSwapped: Object.values(swapped).reduce((a, b) => a + b, 0) };
}
const FILES = fs.readdirSync(VIEWER).filter(f => /\.js$/.test(f) && f !== 'sw.js' && f !== 'provisional_totals.js').concat(['boq_charts.html', 'mep_report.html']);

// ── fixture: the resident + device copies in every guid table. T1 a class with only provisional rows, T2 provisional in a mixed class, F flag FALSE. ──
function buildFixture(src, dst) {
  fs.copyFileSync(src, dst); const d = new Database(dst);
  const gtabs = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).filter(t => d.prepare('PRAGMA table_info(' + t + ')').all().some(c => c.name === 'guid'));
  const copy = (g, ng, over) => gtabs.forEach(t => { const cols = d.prepare('PRAGMA table_info(' + t + ')').all().filter(c => !(c.pk && c.name !== 'guid' && /INT/i.test(c.type))).map(c => c.name);
    const sel = cols.map(c => c === 'guid' ? '?' : (t === 'elements_meta' && over && over[c] != null ? "'" + over[c] + "'" : c)).join(','); d.prepare('INSERT INTO ' + t + ' (' + cols.join(',') + ') SELECT ' + sel + ' FROM ' + t + ' WHERE guid = ?').run(ng, g); });
  const src1 = d.prepare("SELECT guid FROM elements_meta WHERE discipline='MEP' AND ifc_class='IfcFlowTerminal' ORDER BY guid").all().map(r => r.guid);
  const src2 = d.prepare("SELECT guid FROM elements_meta WHERE discipline='ELEC' AND ifc_class='IfcFlowTerminal' ORDER BY guid").all().map(r => r.guid);
  if (!src1.length || !src2.length) { d.close(); return null; }
  d.exec("CREATE TABLE IF NOT EXISTS element_pset_common (guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT, PRIMARY KEY (guid, pset, name))");
  const ps = d.prepare("INSERT INTO element_pset_common VALUES (?,?,?,?,'occurrence')"), G = { T1: [], T2: [], F: [] };
  d.transaction(() => {
    for (let i = 0; i < 10; i++) { const g = 'P7_T1_' + i; copy(src1[i % src1.length], g, { ifc_class: 'IfcAirTerminal', discipline: 'ACMV' }); G.T1.push(g); }
    for (let i = 0; i < 20; i++) { const g = 'P7_T2_' + i; copy(src2[i % src2.length], g); G.T2.push(g); }
    for (let i = 0; i < 5; i++) { const g = 'P7_F_' + i; copy(src2[i % src2.length], g); G.F.push(g); }
    G.T1.concat(G.T2).forEach(g => { ps.run(g, 'BIMOOTB_Walk', 'Provisional', 'TRUE'); ps.run(g, 'BIMOOTB_Walk', 'Provenance', 'placed:band'); });
    G.F.forEach(g => { ps.run(g, 'BIMOOTB_Walk', 'Provisional', 'FALSE'); ps.run(g, 'BIMOOTB_Walk', 'Provenance', 'sched:room'); });
  })();
  d.close(); return G;
}
function truth(file, dropTrue) {
  const d = new Database(file, { readonly: true });
  const hasT = !!d.prepare("SELECT 1 FROM sqlite_master WHERE name='element_pset_common'").get();
  // Truth is written here, not through ProvTotals: every group is kept, its provisional rows (flag TRUE) not counted.
  const c = dropTrue && hasT ? "SUM(CASE WHEN guid IN (SELECT guid FROM element_pset_common WHERE pset='BIMOOTB_Walk' AND name='Provisional' AND value='TRUE') THEN 0 ELSE 1 END)" : 'COUNT(*)';
  const out = { total: d.prepare('SELECT ' + c + ' n FROM elements_meta').get().n, disc: {}, cls: {} };
  d.prepare('SELECT discipline k, ' + c + ' n FROM elements_meta GROUP BY 1').all().forEach(r => { out.disc[r.k] = r.n; });
  d.prepare('SELECT ifc_class k, ' + c + ' n FROM elements_meta GROUP BY 1').all().forEach(r => { out.cls[r.k] = r.n; });
  d.close(); return out;
}

async function pageRun(br, base, dbName, red) {
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const lines = [], errs = [];
  if (red) await pg.evaluateOnNewDocument(() => { window.__vwCountProvisional = true; });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/§PROV-TOTALS/.test(t)) { lines.push(t); console.log('  [page' + (red ? ' RED' : '') + '] ' + t.slice(0, 300)); } });
  await pg.goto(base + '/viewer/viewer.html?db=buildings/' + dbName, { waitUntil: 'load', timeout: 180000 });
  let t = ''; for (let i = 0; i < 180; i++) { await sleep(1000); t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')); if (/DONE/.test(t)) break; }
  await sleep(3000);
  const r = await pg.evaluate(async () => {
    const A = window.APP, out = { total: A.totalElements, disc: Object.assign({}, A.discCounts), prov: window.ProvTotals ? ProvTotals.provisional(A.db) : -1 };
    out.hud = ((document.querySelector('#disc-bars small') || {}).textContent || '');
    try { if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) await A.loadNavigate(); A.openFindPanel(); } catch (e) { out.findErr = e.message; }
    await new Promise(r => setTimeout(r, 1500));
    if (A._findRefreshTree) { A._findRefreshTree('w-prov-totals'); await new Promise(r => setTimeout(r, 1500)); }
    out.acc = Array.from(document.querySelectorAll('#find-type-body .find-acc-item')).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /Air|Flow Terminal|FlowTerminal/i.test(t));
    out.dbg = { navLoaded: !!A._navigateLoaded, panel: !!document.getElementById('find-panel'), panelShown: (document.getElementById('find-panel') || { style: {} }).style.display, typeEl: !!document.getElementById('find-type') };
    const sel = document.getElementById('find-type'); out.types = sel ? Array.from(sel.options).map(o => [o.value, o.textContent]) : null;
    if (sel && Array.from(sel.options).some(o => o.value === 'IfcAirTerminal')) {
      sel.value = 'IfcAirTerminal'; sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 1500));
      out.found = (document.getElementById('find-count') || {}).textContent || '';
      out.metas = Array.from(document.querySelectorAll('#find-results .find-result-item .ri-meta')).map(e => e.textContent);
      const first = document.querySelector('#find-results .find-result-item'); if (first) { first.click(); await new Promise(r => setTimeout(r, 800)); out.infoClass = (document.getElementById('info-class') || {}).textContent || ''; }
    }
    const inp = document.getElementById('nlp-input');
    if (inp) { inp.value = 'how many electrical elements'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise(r => setTimeout(r, 1500)); out.nl = ((document.getElementById('nlp-toast') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 300); }
    out.sites = window.ProvTotals ? Object.assign({}, ProvTotals.sites) : null;
    return out;
  });
  r.lines = lines; r.errs = errs; r.done = /DONE/.test(t); await pg.close(); return r;
}
const optCount = (types, v) => { const o = (types || []).find(x => x[0] === v); if (!o) return null; const m = o[1].match(/\((\d[\d,]*)\)\s*$/); return m ? +m[1].replace(/,/g, '') : null; };

(async () => {
  // P7a
  const now = census(f => { try { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); } catch (e) { return ''; } }, FILES);
  ok('P7a every count near elements_meta is swapped or listed with its reason', now.bad.length === 0 && now.nSwapped > 0, 'swapped=' + now.nSwapped + ' in ' + Object.keys(now.swapped).length + ' files ' + (now.bad.length ? 'UNLISTED: ' + now.bad.join(' || ') : ''));
  let redCensus = null; try { redCensus = census(f => { try { return cp.execSync('git -C ' + ROOT + ' show ' + RED_REF + ':viewer/' + f, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); } catch (e) { return ''; } }, FILES); } catch (e) {}
  if (!redCensus) console.log(TAG + ' P7a-RED INCONCLUSIVE ' + RED_REF + ' not readable');
  else ok('P7a-RED the same census on ' + RED_REF + ' (before P7) fails', redCensus.bad.length > 0 && redCensus.nSwapped === 0, 'unlisted files there: ' + redCensus.bad.length + ' e.g. ' + redCensus.bad.slice(0, 3).map(b => b.split(' ')[0]).join(','));

  if (!fs.existsSync(BASE) || fs.statSync(BASE).size < 4096) { console.log(TAG + ' INCONCLUSIVE base DB absent or a pointer stub (' + BASE + '), P7b-d not judged'); console.log(TAG + ' VERDICT judged=' + judged + ' fail=' + fails); process.exit(fails ? 1 : 0); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp7-')), baseDb = path.join(tmp, '_w_p7_base.db'), fixDb = path.join(tmp, '_w_p7_fix.db');
  fs.copyFileSync(BASE, baseDb); const G = buildFixture(BASE, fixDb);
  if (!G) { console.log(TAG + ' INCONCLUSIVE base has no flow terminals to copy, nothing judged'); process.exit(0); }
  const raw = truth(fixDb, false), cnt = truth(fixDb, true), res = truth(baseDb, false);
  console.log(TAG + ' fixture base=' + path.basename(BASE) + ' rows=' + res.total + ' +T1(all-provisional IfcAirTerminal)=' + G.T1.length + ' +T2(provisional IfcFlowTerminal)=' + G.T2.length + ' +F(flag FALSE)=' + G.F.length + ' truth: raw=' + raw.total + ' counted=' + cnt.total);

  // P7b node, sql.js-shaped exec over better-sqlite3
  const wrap = d => ({ exec: (s) => { const st = d.prepare(s); const rows = st.raw().all(); return rows.length ? [{ values: rows }] : []; } });
  const dR = new Database(baseDb, { readonly: true }), dF = new Database(fixDb, { readonly: true }), eR = wrap(dR), eF = wrap(dF);
  const cR = PT.count(eR, 'guid', 'node'), cF = PT.count(eF, 'guid', 'node'); globalThis.__vwCountProvisional = true; const cFred = PT.count(eF, 'guid', 'node'); globalThis.__vwCountProvisional = false;
  const nF = dF.prepare('SELECT ' + cF + ' n FROM elements_meta').get().n;
  ok('P7b resident (no walk set) gets the literal COUNT(*)', cR === 'COUNT(*)' && PT.sum(eR, 'x', 'guid') === 'SUM(x)', cR);
  ok('P7b switch on gets the literal COUNT(*) on the fixture too', cFred === 'COUNT(*)', cFred);
  ok('P7b swapped SQL counts resident + FALSE rows, not the TRUE rows', nF === res.total + G.F.length && nF === cnt.total, 'counted=' + nF + ' resident=' + res.total + ' F=' + G.F.length + ' provisional()=' + PT.provisional(eF));
  ok('P7b an all-provisional class keeps its group at 0', dF.prepare("SELECT " + cF + " n FROM elements_meta WHERE ifc_class='IfcAirTerminal' GROUP BY ifc_class").get().n === 0);
  dR.close(); dF.close();

  // P7c / P7d on the real page
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); let f;
    if (/\/buildings\/_w_p7_fix\.db$/.test(p)) f = fixDb; else if (/\/buildings\/_w_p7_base\.db$/.test(p)) f = baseDb; else { const a = path.join(ROOT, p), b = path.join(SHARED, p); f = fs.existsSync(a) ? a : b; }
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const P = await pageRun(br, base, '_w_p7_fix.db', false), R = await pageRun(br, base, '_w_p7_fix.db', true), B = await pageRun(br, base, '_w_p7_base.db', false);
    console.log(TAG + ' page fix=' + JSON.stringify({ total: P.total, disc: P.disc, prov: P.prov, found: P.found, nl: P.nl, info: P.infoClass, dbg: P.dbg, acc: P.acc, findErr: P.findErr, sites: P.sites, errs: P.errs.length }));
    console.log(TAG + ' page red=' + JSON.stringify({ total: R.total, disc: R.disc, prov: R.prov, found: R.found, nl: R.nl, sites: R.sites }));
    console.log(TAG + ' page base=' + JSON.stringify({ total: B.total, disc: B.disc, prov: B.prov, sites: B.sites, errs: B.errs.length }));
    if (!P.done || P.prov <= 0) { console.log(TAG + ' INCONCLUSIVE the page did not load the fixture or saw no provisional row (done=' + P.done + ' prov=' + P.prov + ')'); }
    else {
      ok('P7c HUD total leaves provisional out', P.total === cnt.total, 'page=' + P.total + ' truth counted=' + cnt.total + ' raw=' + raw.total);
      ok('P7c HUD discipline counts leave provisional out', JSON.stringify(P.disc) === JSON.stringify(Object.assign({}, ...Object.keys(P.disc).map(k => ({ [k]: cnt.disc[k] })))) && P.disc.ACMV === 0, 'page=' + JSON.stringify(P.disc) + ' truth=' + JSON.stringify(cnt.disc));
      ok('P7c Find Type dropdown: all-provisional class listed at (0), mixed class without its provisional rows', optCount(P.types, 'IfcAirTerminal') === 0 && optCount(P.types, 'IfcFlowTerminal') === cnt.cls.IfcFlowTerminal && (P.acc || []).includes('Air Terminal (0)') && (P.acc || []).includes('Flow Terminal (' + cnt.cls.IfcFlowTerminal + ')'), 'accordion=' + JSON.stringify(P.acc) + ' IfcAirTerminal=' + optCount(P.types, 'IfcAirTerminal') + ' IfcFlowTerminal=' + optCount(P.types, 'IfcFlowTerminal') + ' truth=' + cnt.cls.IfcFlowTerminal);
      ok('P7c Find result line counts 0 for that class, the list still shows its devices labelled', /^0\b/.test((P.found || '').trim()) && (P.metas || []).length === G.T1.length && P.metas.every(m => /provisional/.test(m)), 'found="' + P.found + '" listed=' + (P.metas || []).length + ' labelled=' + (P.metas || []).filter(m => /provisional/.test(m)).length);
      ok('P7c identify says provisional', /provisional/.test(P.infoClass || ''), 'info-class="' + P.infoClass + '"');
      ok('P7c NL count answer leaves provisional out', new RegExp('\\b' + cnt.disc.ELEC + '\\b').test(P.nl || '') && !new RegExp('\\b' + raw.disc.ELEC + '\\b').test(P.nl || ''), 'toast="' + P.nl + '" counted ELEC=' + cnt.disc.ELEC + ' raw=' + raw.disc.ELEC);
      ok('P7c-RED switch on puts them back in every judged total', R.total === raw.total && R.disc.ACMV === raw.disc.ACMV && optCount(R.types, 'IfcAirTerminal') === G.T1.length && new RegExp('\\b' + raw.disc.ELEC + '\\b').test(R.nl || '') && !/provisional/.test((R.metas || []).join(' ')), 'total=' + R.total + ' ACMV=' + R.disc.ACMV + ' airTerminal=' + optCount(R.types, 'IfcAirTerminal') + ' nl="' + R.nl + '"');
      ok('P7c no page error', P.errs.length === 0, P.errs.slice(0, 2).join(' | '));
    }
    ok('P7d resident page: totals = node truth, no site swapped, unchanged § line', B.done && B.total === res.total && Object.keys(B.disc).every(k => B.disc[k] === res.disc[k]) && B.prov === 0 && B.sites && Object.keys(B.sites).length === 0 && B.lines.some(l => /provisional=0 totals unchanged/.test(l)), 'total=' + B.total + ' truth=' + res.total + ' sites=' + JSON.stringify(B.sites));
  } finally { await br.close(); srv.close(); }
  console.log(TAG + ' VERDICT judged=' + judged + ' fail=' + fails + (fails ? ' CLAIM NOT MET' : ' PASS'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log(TAG + ' CRASH ' + (e && e.stack || e)); process.exit(2); });
