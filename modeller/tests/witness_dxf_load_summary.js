#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-LOAD-SUMMARY (prompts/DXF2BIM_FOUNDATION_LANE.md §D97). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a structural engineer asked "what does this shed weigh, and what does each footing carry?" had no answer from the drawings,
// although the converted bodies carry every material and drawn size. §D97 computes it. What could go wrong, one check each:
//   L1 a weight not traceable to size x a cited unit weight: each group's kN = the witness's own Σ(quantity x unit weight), the unit weights re-read from the
//      BNBC reference text (modeller/reference/BNBC2012_P6C2_dead_load_tables.txt), not retyped.
//   L2 a body counted twice or dropped: Σ footing loads + the ground-bearing slab = the total weighed; every weighed body carried exactly once.
//   L3 a missing weight quietly filled: the MISSING list is exactly the bodies with no drawn size / no stated weight (103 unsized members, 13 fans, 4 doors,
//      3 nettings) + site district + soil capacity, and none of them carries a kN.
//   L3b falsifier: a body with neither bbox nor vertices is MISSING ('no geometry to measure'), never weighed 0 (first run: the page's bodies carry vertices, not
//      bbox, and 7 groups were silently weighed 0 kN — 707 kN against the CLI's 5,352 kN for the same shed).
//   L4 falsifier: load.rc_steel_percent 1 -> 2 raises every concrete weight by exactly 0.63 kN/m3 x volume, and nothing else moves.
//   L6 the page shows other numbers than the module, or Apply does nothing: Export ▸ Load Summary on the CLI-marked shed (Complete ticked, Convert) opens
//      load_summary.html whose §LOAD_PAGE total equals the module's on the page's own bodies AND the CLI bodies.json total (within 0.01 %: the CLI rounds its boxes);
//      the inputs editor with p = 2 gives L4's total; 0 §PAGEERR.
//   L8 (U2, prompts/DXF2BIM_ARCHITECT_REVIEW.md) a beam with no stated size weighs the same at any plan angle (LoadSummary.beamSection: the vertices' axis); the §D104 box rule at 45 deg is ~9x.
//   L5 the defaults' basis is not the table: element_defaults.json load.* values = the reference text's numbers (22.8, 0.63, 18.9, 77.0, 0.096).
// Input: the CLI-marked shed's bodies.json (SHED_BODIES, default ~/Videos/dxf2bim_film_work/why/cli/bodies.json); missing -> INCONCLUSIVE (exit 2).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), M = path.join(ROOT, 'modeller'), L = require(path.join(M, 'load_summary.js'));
const BODIES = process.env.SHED_BODIES || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'bodies.json');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
if (!fs.existsSync(BODIES)) { console.log('§VERDICT INCONCLUSIVE missing ' + BODIES); process.exit(2); }
const bodies = JSON.parse(fs.readFileSync(BODIES, 'utf8')), D = JSON.parse(fs.readFileSync(path.join(M, 'element_defaults.json'), 'utf8')).defaults;
// the reference text's own numbers
const REF = fs.readFileSync(path.join(M, 'reference', 'BNBC2012_P6C2_dead_load_tables.txt'), 'utf8');
const grab = re => { const m = re.exec(REF); return m ? Number(m[1]) : NaN; };
const T = { concrete: grab(/Concrete\s*‐\s*stone aggregate \(unreinforced\)\s+([\d.]+)\*/), add: grab(/add\s+([\d.]+)\s*kN\/m3 for each 1% by volume/), brick: grab(/\n\s*Brick\s+([\d.]+)/), steel: grab(/Steel\s+([\d.]+)\n/), sheet08: grab(/Steel, galvanized std\. corrugated sheeting[\s\S]*?0\.8 mm thick\s+([\d.]+)/) };
console.log('§LOAD_REF ' + JSON.stringify(T));
const values = Object.fromEntries(L.KEYS.map(k => [k, D[k].value])), sources = Object.fromEntries(L.KEYS.map(k => [k, D[k].kind]));
// ---- L5 ----
ok('L5 the defaults equal the reference text (concrete 22.8, +0.63 per 1%, brick 18.9, steel 77.0, sheet 0.8 mm 0.096)', D['load.unit_weight.concrete'].value === T.concrete && D['load.unit_weight.brick'].value === T.brick && D['load.unit_weight.steel'].value === T.steel && D['load.roof_sheet'].value === T.sheet08 && /0\.63/.test(D['load.rc_steel_percent'].basis) && T.add === 0.63,
  'ref=' + JSON.stringify(T) + ' defaults=' + L.KEYS.map(k => k.replace('load.', '') + ':' + D[k].value).join(' '));
const R = L.compute(bodies, { values, sources, facts: {} }); L.log(R, s => console.log('  ' + s.slice(0, 220)));
// ---- L1: the witness's own sums ---- (§D104, 2026-11-01: the beam line below was a copy of load_summary's defect, (w || bbox-y); moved to the beam's width = the smaller plan extent, because a beam along Y has its LENGTH in bbox-y. L7 below is the falsifier)
const dim = b => [0, 1, 2].map(i => b.bbox[i + 3] - b.bbox[i]), n = v => v && typeof v === 'object' ? Number(v.number) : Number(v), s = (b, k) => b.size && b.size[k] !== undefined ? n(b.size[k]) : NaN;
const rc = T.concrete + T.add * values['load.rc_steel_percent'], own = {};
const add = (k, kN) => { own[k] = (own[k] || 0) + kN; };
// T14c: the witness's own mode: per kind, the most frequent labelled section (by area + legs), ties lighter first
const modeK = {}; { const cnt = {}; bodies.filter(b => b.class === 'IfcMember').forEach(b => { const A = L.angleOf((b.ifc && b.ifc.type_name) || ''); if (!A) return; const k = b.kind || '', key = [A.n, A.a, A.b, A.t].join('|'); ((cnt[k] = cnt[k] || {})[key] = cnt[k][key] || { A, n: 0 }).n++; });
  Object.keys(cnt).forEach(k => { modeK[k] = Object.values(cnt[k]).sort((p, q) => q.n - p.n || p.A.area - q.A.area)[0].A; }); }
bodies.forEach(b => { const d = dim(b), h = b.z1 - b.z0, mat = (b.ifc && b.ifc.material) || '', c = b.class, tn = (b.ifc && b.ifc.type_name) || '';
  if (/concrete/i.test(mat)) add(c + '|' + mat, rc * (c === 'IfcBeam' ? (s(b, 'w') || Math.min(d[0], d[1])) * (s(b, 'd') || d[2]) * Math.max(d[0], d[1]) : c === 'IfcSlab' ? d[0] * d[1] * (s(b, 't') || d[2]) : (s(b, 'x') || d[0]) * (s(b, 'y') || d[1]) * h));
  else if (/brick/i.test(mat)) add(c + '|' + mat, T.brick * Math.max(d[0], d[1]) * h * (s(b, 't') || Math.min(d[0], d[1])));
  else if (c === 'IfcPlate') { const e = d.slice().sort((p, q) => q - p); add(c + '|' + mat, T.steel * e[0] * e[1] * (s(b, 't') || e[2])); }
  else if (c === 'IfcMember') { const A = L.angleOf(tn) || modeK[b.kind || '']; if (A) add(c + '|' + mat, T.steel * A.area * L.barLength(b)); }
  else if (c === 'IfcRoof') add(c + '|' + mat, T.sheet08 * d[0] * d[1] / Math.cos(Number(b.size.slope_deg) * Math.PI / 180)); });
const bad1 = R.groups.filter(g => !g.missing).filter(g => Math.abs(g.kN - (own[g.cls + '|' + g.material] || 0)) > 1e-6 * Math.max(1, g.kN));
ok('L1 each group = Σ quantity x the reference unit weight (witness recompute)', bad1.length === 0 && R.groups.filter(g => !g.missing).length === 8, R.groups.filter(g => !g.missing).map(g => g.cls.replace('Ifc', '') + ' ' + g.kN.toFixed(1) + '=' + (own[g.cls + '|' + g.material] || 0).toFixed(1)).join(' | '));
// ---- L2 ----
const carried = R.rows.filter(r => r.kN >= 0), onceOk = carried.every(r => r.carriedBy && (r.carriedBy === 'ground' || R.footings.some(f => f.guid === r.carriedBy)));
ok('L2 Σ footings + ground-bearing slab = total weighed; every weighed body carried once', Math.abs(R.toFootings_kN + R.onGround_kN - R.total_kN) < 1e-6 && onceOk && R.footings.reduce((a, f) => a + f.n, 0) + carried.filter(r => r.carriedBy === 'ground').length === carried.length,
  'footings ' + R.toFootings_kN.toFixed(1) + ' + ground ' + R.onGround_kN.toFixed(1) + ' = ' + R.total_kN.toFixed(1) + ' kN; bodies ' + carried.length);
// ---- L3 ----
const mm = Object.fromEntries(R.missing.map(m => [m.what, m.n])), unsized = bodies.filter(b => b.class === 'IfcMember' && !L.angleOf((b.ifc && b.ifc.type_name) || '')).length;
// T14c: an unsized member with a same-kind labelled sibling is weighed, ASSUMED and saying from what; only kinds with no labelled sibling stay missing
const noMode = bodies.filter(b => b.class === 'IfcMember' && !L.angleOf((b.ifc && b.ifc.type_name) || '') && !modeK[b.kind || '']).length, asm = R.rows.filter(r => r.assumed);
ok('L3c T14c the members filled from the drawing\'s most common same-kind section are marked assumed with their source, never silent (' + asm.length + ' of ' + unsized + ' unsized)', unsized === 103 && asm.length === unsized - noMode && asm.every(r => r.kN > 0 && /most common/.test(r.sectionFrom) && /section:/.test(r.formula)), asm.length + ' assumed: ' + (asm[0] ? asm[0].sectionFrom : '-'));
ok('L3 missing = exactly the bodies with no drawn size (and no same-kind drawn section) or stated weight + district + soil, none weighed', noMode === 12 && mm['IfcMember: section size not drawn'] === noMode && mm['IfcFan: fan weight not stated'] === 13 && mm['IfcDoor: door weight not stated'] === 4 && mm['IfcCovering: netting weight not stated'] === 3 && R.missing.some(m => m.fact === 'district') && R.missing.some(m => m.fact === 'soil_kPa') && R.rows.filter(r => r.missing).every(r => !(r.kN >= 0)),
  JSON.stringify(mm));
// ---- L3b ----
const nb = JSON.parse(JSON.stringify(bodies)); const wi = nb.findIndex(b => b.class === 'IfcWall'); delete nb[wi].bbox; delete nb[wi].vertices;
const R3 = L.compute(nb, { values, sources, facts: {} }), w3 = R3.rows.find(r => r.guid === nb[wi].guid);
ok('L3b falsifier: a body with no geometry is MISSING, not weighed 0', w3 && w3.missing === 'no geometry to measure' && !(w3.kN >= 0) && R3.unweighed === R.unweighed + 1, (w3 ? w3.guid + ' missing="' + w3.missing + '" kN=' + w3.kN : 'row not found') + ' unweighed ' + R.unweighed + ' -> ' + R3.unweighed);
// ---- L4 ----
const R2 = L.compute(bodies, { values: Object.assign({}, values, { 'load.rc_steel_percent': 2 }), sources, facts: {} });
const dif = R2.groups.map(g2 => { const g1 = R.groups.find(g => g.cls === g2.cls && g.material === g2.material && !!g.missing === !!g2.missing); return { k: g2.cls, conc: /concrete/i.test(g2.material), d: g2.kN - g1.kN, want: /concrete/i.test(g2.material) ? T.add * g2.qty : 0 }; });
ok('L4 falsifier: p 1 -> 2 adds exactly 0.63 kN/m3 x volume to every concrete group and moves nothing else', dif.every(x => Math.abs(x.d - x.want) < 1e-6), dif.filter(x => x.d !== 0).map(x => x.k.replace('Ifc', '') + ' +' + x.d.toFixed(2)).join(' '));
// ---- L7 (§D104): a beam with no stated width weighs the same running along X or along Y ----
{ const box = (x0, y0, x1, y1) => ({ guid: 'bm', class: 'IfcBeam', z0: 3, z1: 3.254, sheet: 's', handle: 'h', ifc: { material: 'Reinforced concrete' }, bbox: [x0, y0, 3, x1, y1, 3.254] });
  const kx = L.compute([box(0, 0, 4.775, 0.305)], { values, sources, facts: {} }).rows[0].kN, ky = L.compute([box(0, 0, 0.305, 4.775)], { values, sources, facts: {} }).rows[0].kN;
  const oldY = rc * 0.305 * 4.775 * 0.254 * (4.775 / 0.305), want = rc * 0.305 * 0.254 * 4.775;   // the old formula (w || bbox-y) on the Y beam: length / width times too heavy
  ok('L7a one beam, no stated size: along X ' + kx.toFixed(3) + ' kN = along Y ' + ky.toFixed(3) + ' kN = width x depth x length x rc (' + want.toFixed(3) + '); the OLD formula would give ' + oldY.toFixed(3) + ' kN for the Y one (x' + (oldY / want).toFixed(2) + ')', Math.abs(kx - want) < 1e-9 && Math.abs(ky - want) < 1e-9 && oldY > 10 * want, '');
  const bm = R.rows.find(r => r.handle === '2A1+2A4');
  const bb = bodies.find(b => b.handle === '2A1+2A4'), dd = dim(bb), oldKN = rc * dd[1] * dd[2] * Math.max(dd[0], dd[1]), newKN = rc * Math.min(dd[0], dd[1]) * dd[2] * Math.max(dd[0], dd[1]);
  console.log('  §LOAD_D104 beam 2A1+2A4 ' + oldKN.toFixed(3) + ' -> ' + (bm ? bm.kN.toFixed(3) : 'n/a') + ' kN; shed own-weight total ' + (R.total_kN - (bm ? bm.kN : 0) + oldKN).toFixed(1) + ' -> ' + R.total_kN.toFixed(1) + ' kN');
  ok('L7b the shed: beam 2A1+2A4 (no stated size, along Y) weighs its box ' + newKN.toFixed(3) + ' kN, not ' + oldKN.toFixed(3) + '; the total drops by ' + (oldKN - newKN).toFixed(3) + ' kN', !!bm && Math.abs(bm.kN - newKN) < 1e-9 && Math.abs(newKN - 8.662) < 0.01 && oldKN > 100, ''); }
// ---- L8 (U2): one beam-section owner — a beam with no stated size weighs the same at any plan angle (its vertices' axis, not its plan box) ----
{ const Lb = 4.775, Wb = 0.305, Db = 0.254, want = rc * Lb * Wb * Db;
  const beamAt = deg => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), V = [];
    [0, Lb].forEach(x => [-Wb / 2, Wb / 2].forEach(y => [3, 3 + Db].forEach(z => V.push([10 + x * c - y * s, 20 + x * s + y * c, z])))); return { guid: 'b' + deg, class: 'IfcBeam', z0: 3, z1: 3 + Db, sheet: 's', handle: 'h' + deg, ifc: { material: 'Reinforced concrete' }, vertices: V }; };
  const ks = [0, 30, 45, 90].map(d => L.compute([beamAt(d)], { values, sources, facts: {} }).rows[0].kN);
  const b45 = beamAt(45), x45 = b45.vertices.map(v => v[0]), y45 = b45.vertices.map(v => v[1]), dx = Math.max(...x45) - Math.min(...x45), dy = Math.max(...y45) - Math.min(...y45);
  const boxRule45 = rc * Math.min(dx, dy) * Db * Math.max(dx, dy);
  ok('L8 one beam, no stated size, at 0/30/45/90 degrees in plan: ' + ks.map(k => k.toFixed(3)).join(' / ') + ' kN, all = width x depth x length x rc (' + want.toFixed(3) + '); the §D104 box rule at 45 degrees would give ' + boxRule45.toFixed(3) + ' kN (x' + (boxRule45 / want).toFixed(2) + ')',
    ks.every(k => Math.abs(k - want) < 1e-9) && boxRule45 > 5 * want && typeof L.beamSection === 'function', ''); }
// ---- L6: the page ----
(async () => {
  const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (process.env.BROWSER === '0' || files.length !== 9) { console.log('§LOAD_PAGE_SKIP ' + (files.length !== 9 ? 'marked sheets missing (' + MARKED + ')' : 'BROWSER=0') + ' — L6 not judged'); }
  else {
    const http = require('http'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
    await new Promise(z => srv.listen(0, '127.0.0.1', z));
    const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [], plog = [];
    try {
      const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); console.log('§PAGEERR ' + String(e).slice(0, 160)); });
      pg.on('console', m => { const t = m.text(); if (/^§LOAD_SUMMARY (handoff|refused)/.test(t)) console.log('  ' + t.slice(0, 200)); });
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
      await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
      await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
      await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
      await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
      const els = await pg.evaluate(() => JSON.stringify(window.DxfImportUI.state.gate.R.els));
      const tgt = new Promise(res => br.once('targetcreated', t => res(t)));
      await pg.click('#b-export'); await pg.waitForSelector('#m-export-panel', { visible: true }); await pg.evaluate(() => { const r = [...document.querySelectorAll('#m-export-panel *')].find(e => /^Load Summary/.test((e.textContent || '').trim()) && e.closest('[data-key]')); (r ? r.closest('[data-key]') : document.querySelector('#m-export-panel [data-key="load"]')).click(); });
      const rp = await (await tgt).page(); rp.on('console', m => { const t = m.text(); if (/^§LOAD_/.test(t)) { plog.push(t); } }); rp.on('pageerror', e => { errs.push('report: ' + String(e).slice(0, 160)); console.log('§PAGEERR report ' + String(e).slice(0, 160)); });
      await rp.waitForFunction(() => document.querySelectorAll('#groups tr').length > 1, { timeout: 60000 });
      const pageTotal = () => rp.evaluate(() => document.getElementById('cards').innerText);
      const mod = L.compute(JSON.parse(els), { values, sources, facts: {} }), mod2 = L.compute(JSON.parse(els), { values: Object.assign({}, values, { 'load.rc_steel_percent': 2 }), sources, facts: {} });
      const fmt = v => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const t1 = await pageTotal();
      await rp.evaluate(() => { const t = document.getElementById('inputs'), j = JSON.parse(t.value); j.values['load.rc_steel_percent'] = 2; t.value = JSON.stringify(j, null, 2); document.getElementById('apply').click(); }); await new Promise(r => setTimeout(r, 400));
      const t2 = await pageTotal(), applied = await rp.evaluate(() => document.getElementById('msg').textContent);
      // the CLI reference is a FRESH CLI run of the same marked set with Complete (the stored bodies.json predates §D100's column default and would compare against a stale model)
      const CLI = require(path.join(M, 'dxf2bim_cli.js')), fresh = CLI.run(CLI.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_ls_cli_' + process.pid), '--complete']), () => {}).out.gate.R.els;
      const Rc = L.compute(fresh, { values, sources, facts: {} }), cliRel = Math.abs(mod.total_kN - Rc.total_kN) / Rc.total_kN;
      ok('L6 the report page: its total = the module on the page\'s own bodies = the CLI bodies (0.01 %), Apply p = 2 = the module with p = 2, 0 page errors', t1.indexOf(fmt(mod.total_kN) + ' kN') >= 0 && t2.indexOf(fmt(mod2.total_kN) + ' kN') >= 0 && cliRel <= 1e-4 && errs.length === 0,
        'page-vs-CLI ' + (cliRel * 100).toFixed(5) + ' % | ' +
        'bodies=' + JSON.parse(els).length + ' module ' + fmt(mod.total_kN) + ' -> ' + fmt(mod2.total_kN) + ' kN | page "' + t1.split('\n').slice(0, 3).join(' ') + '" -> "' + applied + '" | errors ' + errs.length);
      plog.slice(0, 3).forEach(l => console.log('  ' + l.slice(0, 220)));
    } catch (e) { ok('L6 the report page', false, 'crash ' + String(e && e.message || e).slice(0, 200)); }
    await br.close(); srv.close();
  }
  console.log('§VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' W-LOAD-SUMMARY judged=' + judged + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
})();
