#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-GRID (prompts/DXF2BIM_FOUNDATION_LANE.md §D88). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: after a DXF Convert the Modeller kept its DEFAULT grid (0,4,8,12 / 0,3,6 at the origin), so a grid drag — the Modeller's stretch with orange / green
// openings — did nothing on a converted drawing (the shed: 0 commands on all 7 default lines). The drawing states its own grid; it must become the Modeller's grid.
//   G1 after Convert of the marked shed the grid = the base plan's markings: 14 x-lines labelled 01..06,35..42, 4 y-lines A..D, values = marking x 0.0254 (to 1e-6 m)
//   G2 a one-bay drag (3.048 m) of the last x-line, previewed (nothing committed), gives commands; the classes it moves / stretches are logged (§DXF-GRID-BAY) for the film
//   G3 a grid the user defined before Convert is kept
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_grid_handoff.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), M = path.join(ROOT, 'modeller');
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR ' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
  // the expected grid, read here from the plan's own markings with the reader's marking parser (independent of planGrid)
  const MK = require(path.join(M, 'dxf2bim', 'dxf2marks.js')), DP = require(path.join(M, 'lib', 'dxf-parser.js'));
  const plan = files.find(f => /FLOOR_PLAN/i.test(f)), ms = MK.readMarks(new DP().parseSync(fs.readFileSync(plan, 'utf8')).entities);
  const want = ax => ms.map(m => /^@GRID([XY])=([^ ]+)/.exec(m.raw || '')).filter(q => q && q[1] === ax).map((q, i) => q).map(q => ({ l: q[2] })).map((o, i, a) => o);
  const pick = ax => ms.filter(m => new RegExp('^@GRID' + ax + '=').test(m.raw || '')).map(m => ({ l: /^@GRID.=([^ ]+)/.exec(m.raw)[1], v: (ax === 'X' ? m.x : m.y) * 0.0254 })).sort((a, b) => a.v - b.v);
  const WX = pick('X'), WY = pick('Y'); void want;
  console.log('§DXF-GRID-WANT x=' + WX.length + ' [' + WX.map(q => q.l).join(',') + '] y=' + WY.length + ' [' + WY.map(q => q.l).join(',') + ']');
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const run = async (userGrid) => {
    const pg = await (await br.createBrowserContext()).newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-GRID/.test(t)) console.log('  ' + t.slice(0, 220)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    if (userGrid) await pg.evaluate(g => window.Bonsai.grid.define(g), userGrid);
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 300000 }).catch(() => {});
    if (!await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok))) return { pg, inconclusive: true };
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
    return { pg, grid: await pg.evaluate(() => { const G = window.Bonsai.grid; return { xs: G.xs.slice(), ys: G.ys.slice(), xl: G.xlabels.slice(), yl: G.ylabels.slice() }; }) };
  };
  try {
    const A = await run(null);
    if (A.inconclusive) { console.log('§W-DXF-GRID INCONCLUSIVE: the shed did not qualify'); process.exit(1); }
    const g = A.grid, eq = (got, w) => got.length === w.length && w.every((q, i) => Math.abs(got[i] - q.v) <= 1e-6);
    ok('G1 the Modeller grid after Convert = the base plan\'s stated grid (labels and positions)', eq(g.xs, WX) && eq(g.ys, WY) && g.xl.join() === WX.map(q => q.l).join() && g.yl.join() === WY.map(q => q.l).join(),
      'x ' + g.xs.length + ' [' + g.xl.join(',') + '] first ' + (g.xs[0] || 0).toFixed(6) + ' (want ' + (WX[0] ? WX[0].v.toFixed(6) : '-') + ') y ' + g.ys.length + ' [' + g.yl.join(',') + ']');
    // G2 a one-bay stretch of the length, previewed
    const P = await A.pg.evaluate(bay => { const gm = window.Bonsai.gridmove, ops = window.Bonsai.oplog._geomOps(), cls = id => { const o = ops.find(q => q.id === id); return o && o.parameters ? o.parameters.ifc_class : '?'; };
      const lines = gm.gridLines(), xl = lines.filter(l => l.axis === 'x'), last = xl[xl.length - 1];
      const pv = gm.previewCommands(last.id, bay), by = {}; (pv.commands || []).forEach(c => { const k = cls(c.featureId) + ':' + c.action; by[k] = (by[k] || 0) + 1; });
      return { line: last.id, at: last.pos, n: (pv.commands || []).length, by, riders: (pv.riders || []).length, refusals: (pv.refusals || []).length, held: (pv.held || []).length, dim: pv.dimLabel || null }; }, 3.048);
    console.log('§DXF-GRID-BAY line=' + P.line + ' at=' + (+P.at).toFixed(3) + ' commands=' + P.n + ' ' + JSON.stringify(P.by) + ' riders=' + P.riders + ' held=' + P.held + ' refusals=' + P.refusals + ' dim=' + P.dim);
    ok('G2 a one-bay (3.048 m) drag of the last x-line moves or stretches the shed (preview, nothing committed)', P.n > 0, 'commands=' + P.n + ' ' + JSON.stringify(P.by));
    await A.pg.close();
    const U = { xs: [0, 5], ys: [0, 5], xlabels: ['P', 'Q'], ylabels: ['9', '8'] }, B = await run(U);
    ok('G3 a grid the user defined before Convert is kept', !B.inconclusive && B.grid.xs.join() === U.xs.join() && B.grid.xl.join() === U.xlabels.join(), 'after Convert xs=[' + (B.grid ? B.grid.xs.join(',') : '-') + '] labels=' + (B.grid ? B.grid.xl.join('') : '-'));
    ok('G5 no page errors', errs.length === 0, 'errors=' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } catch (e) { ok('G run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-DXF-GRID ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
