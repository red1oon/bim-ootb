#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SHEET-FRAME (prompts/DXF2BIM_FOUNDATION_LANE.md §D82 SV3-SV7). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a loaded DXF and its yellow markings could only be seen as lines on the 3D canvas; §D82 gives the whole sheet, full frame, in the Modeller, with
// every marking drawn where it sits, printable. What could go wrong, one check each:
//   SV3 a marking lost, doubled or drawn at a meaningless place: every marking of a sheet is drawn once, a positional one AT its own coordinate (GRIDX/GRIDH line x = the mark's x,
//       GRIDY/Z line y = its y), the rest in the markings box; no marking element at 0,0.
//   SV4 the view and the list disagree: the rings + the box's open lines = the list's rows of that sheet (data-ev ids), each ring at its row's point, coloured by its tier; accepting
//       one row in the list removes it from the view and adds its marking (the view follows the list).
//   SV5 a frame doubled or a client's block replaced: own frame on 8 of the 9 marked shed sheets and none drawn; 1S_ELEV_SOUTH and the Duplex sheets get one at the paper / scale the
//       rule gives (recomputed here), and the title block's not-stated fields are yellow.
//   SV6 a print that is not the sheet: the SVG states the paper in mm, and with Markings off it is exactly the SVG minus the markings group.
//   SV7 the view changes the work: open / Esc / reopen / close leave markings, verdict, saved texts and the gate byte-identical; 0 page errors.
// Sets: the CLI-marked shed (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked) and the plain Duplex (prompts/film_dxf2bim_yellow_sets.js from DXARC.db, argv[2]).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_sheet_frame.js [DXARC.db]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DB = process.argv[2] || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db');
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PAPERS = [['A4', 297, 210], ['A3', 420, 297], ['A2', 594, 420], ['A1', 841, 594], ['A0', 1189, 841]], SCALES = [100, 200, 500, 50], UM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const expectPaper = (W, H, u) => { const w = W * UM[u], h = H * UM[u]; for (const s of SCALES) for (const P of PAPERS) if (w / s + 10 <= P[1] - 20 && h / s + 10 <= P[2] - 20 - 50) return { paper: P[0], scale: s, mm: [P[1], P[2]] }; return null; };
(async () => {
  const shed = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (shed.length !== 9 || !fs.existsSync(DB)) { console.log('MISSING input: ' + (shed.length !== 9 ? 'the 9 CLI-marked shed sheets (SHED_MARKED_DIR ' + MARKED + ', found ' + shed.length + ')' : DB)); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheetview-'));
  const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, tmp], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
  const dx = r.status === 0 ? fs.readdirSync(path.join(tmp, 'plain')).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(tmp, 'plain', f)) : [];
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = async () => { const ctx = await br.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§SHEET-(MARKS|FRAME)/.test(t)) console.log('  ' + t.slice(0, 220)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; }); return pg; };
  const idle = pg => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict && window.DxfSheetFrame', { timeout: 240000 });
  const openSet = async (pg, files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files); await idle(pg); await sleep(800); };
  const info = (pg, si, marks) => pg.evaluate((si, marks) => { const r = window.DxfSheetFrame.build(si, { marks: marks !== false }), S = window.DxfMetaEditor.state.sheets[si];
    return { i: r.info, sh: { name: S.name, marks: S.marks.map(m => ({ key: m.key, value: String(m.value), x: m.x, y: m.y })) }, items: r.list.filter(d => d.mk !== undefined || d.ev !== undefined || d.tb).map(d => ({ k: d.k, mk: d.mk, ev: d.ev, a: d.a, b: d.b, o: d.o, p: d.p, c: d.c, tb: d.tb, ns: d.notStated })), svg: r.svg() }; }, si, marks);
  const state = pg => pg.evaluate(() => { const E = window.DxfMetaEditor; return JSON.stringify({ m: E.state.sheets.map(s => s.marks.map(m => [m.key, m.value, m.x, m.y])), v: E.state.verdict && E.state.verdict.verdict, b: E.state.verdict && (E.state.verdict.blocking || []).length, t: E.state.sheets.map(s => E.effText(s).length), g: !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok) }); });
  try {
    // ---- the marked shed: SV3 + SV5 (own frames) ----
    const pg = await page(); await openSet(pg, shed);
    const n = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.length), S3 = [], S5 = [];
    for (let si = 0; si < n; si++) { const x = await info(pg, si), bad = [];
      x.sh.marks.forEach((m, mi) => { const its = x.items.filter(d => d.mk === mi), pl = x.i.placed.filter(q => q.mi === mi);
        const times = pl.length + x.i.boxedMarks.filter(q => q === mi).length; if (times !== 1) bad.push(mi + ':' + m.key + ' drawn ' + times + ' times');
        if (pl.length && pl[0].at === 'x') { const ln = its.find(d => d.k === 'line'); if (!ln || ln.a[0] !== m.x || ln.b[0] !== m.x) bad.push(mi + ':' + m.key + ' line not at x=' + m.x); }
        if (pl.length && pl[0].at === 'y') { const ln = its.find(d => d.k === 'line'); if (!ln || ln.a[1] !== m.y || ln.b[1] !== m.y) bad.push(mi + ':' + m.key + ' line not at y=' + m.y); }
        its.forEach(d => { const q = d.p || d.o; if (q && q[0] === 0 && q[1] === 0) bad.push(mi + ':' + m.key + ' at 0,0'); }); });
      if (x.i.positional + x.i.boxed !== x.i.marks) bad.push('positional ' + x.i.positional + ' + boxed ' + x.i.boxed + ' != marks ' + x.i.marks);
      S3.push({ name: x.sh.name, marks: x.i.marks, pos: x.i.positional, bad }); S5.push({ name: x.sh.name, own: x.i.frame.own, paper: x.i.frame.paper, scale: x.i.frame.scale, units: x.i.frame.units, b: x.i.bounds, ns: x.items.filter(d => d.tb && d.ns), items: x.items }); }
    ok('SV3[shed marked] every marking drawn once, positional ones at their own coordinate, the rest boxed, none at 0,0', S3.every(q => !q.bad.length) && S3.reduce((a, q) => a + q.pos, 0) > 0,
      S3.map(q => q.name.replace(/_marked\.dxf$/, '') + ' ' + q.pos + '/' + q.marks + (q.bad.length ? ' BAD ' + q.bad.slice(0, 3).join('; ') : '')).join(' | '));
    const own = S5.filter(q => q.own).map(q => q.name), none = S5.filter(q => !q.own), sv5bad = none.map(q => { const e = expectPaper(q.b.x1 - q.b.x0, q.b.y1 - q.b.y0, q.units);
      return !e || e.paper !== q.paper || e.scale !== q.scale || !q.ns.length || q.ns.some(d => d.c !== '#ffd21f') ? q.name + ' got ' + q.paper + ' 1:' + q.scale + ' want ' + (e ? e.paper + ' 1:' + e.scale : 'none') + ' notstated=' + q.ns.length : null; }).filter(Boolean);
    const ownTb = S5.filter(q => q.own && q.items.some(d => d.tb)).map(q => q.name);
    ok('SV5[shed marked] own frames kept, none doubled; the frame-less sheet gets the computed paper / scale and yellow not-stated fields', own.length === 8 && none.length === 1 && /1S_ELEV_SOUTH/.test(none[0].name) && !sv5bad.length && !ownTb.length,
      'own=' + own.length + ' none=' + none.map(q => q.name + ' ' + q.paper + ' 1:' + q.scale + ' (' + q.units + ')').join(',') + (sv5bad.length ? ' BAD ' + sv5bad.join('; ') : '') + (ownTb.length ? ' TITLE BLOCK DRAWN ON OWN FRAME ' + ownTb.join(',') : ''));
    // SV7 on the shed: real clicks open / Esc / reopen / close
    const st0 = await state(pg);
    await pg.evaluate(() => { const c = document.querySelector('#dm-panel [data-act="card"][data-sheet="0"]'); if (c && !window.DxfMetaEditor.state.open[0]) c.click(); }); await sleep(400);
    await pg.click('#dm-panel [data-act="sheetview"][data-sheet="0"]'); await sleep(600); const o1 = await pg.evaluate(() => !!document.getElementById('dxf-sheet-frame'));
    await pg.keyboard.press('Escape'); await sleep(300); const g1 = await pg.evaluate(() => !document.getElementById('dxf-sheet-frame'));
    await pg.click('#dm-panel [data-act="sheetview"][data-sheet="0"]'); await sleep(600); await pg.click('#dsf-close'); await sleep(300); const g2 = await pg.evaluate(() => !document.getElementById('dxf-sheet-frame'));
    const st1 = await state(pg);
    ok('SV7 open / Esc / reopen / close leave the work byte-identical, 0 page errors', o1 && g1 && g2 && st0 === st1 && errs.length === 0, 'opened=' + o1 + ' esc-closed=' + g1 + ' close-closed=' + g2 + ' state same=' + (st0 === st1) + ' errors=' + errs.length);
    // ---- the plain Duplex: SV4 (rings = list rows; accept one) + SV5 (std sheets frame-less) + SV6 (SVG) ----
    if (!dx.length) ok('SV4-SV6[duplex]', false, 'the plain Duplex set was not written (film_dxf2bim_yellow_sets rc=' + r.status + ')');
    else {
      const pd = await page(); await openSet(pd, dx);
      // round 1 (units, roles, names) has no point on the sheet: accepted by its group ticks until rows that carry a point (the grid, round 2) are in the list
      for (let i = 0; i < 12; i++) { const any = await pd.evaluate(() => (window.DxfMetaEditor.state.yMeta || []).some(m => m.si >= 0 && (m.x || m.y))); if (any) break;
        const k = await pd.evaluate(() => { const b = document.querySelector('#dm-yellows .dm-grp [data-act="grpok"]'); if (!b) return null; b.click(); return b.getAttribute('data-grp'); }); if (!k) break; await idle(pd); await sleep(500); }
      const nd = await pd.evaluate(() => window.DxfMetaEditor.state.sheets.length); let si4 = -1, x4 = null;
      const S5d = [];
      for (let si = 0; si < nd; si++) { const x = await info(pd, si); S5d.push(x); if (si4 < 0 && x.i.rings.length) { si4 = si; x4 = x; } }
      const dsv5 = S5d.map(x => { const e = expectPaper(x.i.bounds.x1 - x.i.bounds.x0, x.i.bounds.y1 - x.i.bounds.y0, x.i.frame.units); return x.i.frame.own || !e || e.paper !== x.i.frame.paper || e.scale !== x.i.frame.scale ? x.sh.name + ' own=' + x.i.frame.own + ' ' + x.i.frame.paper + ' 1:' + x.i.frame.scale + ' want ' + (e ? e.paper + ' 1:' + e.scale : 'none') : null; }).filter(Boolean);
      ok('SV5[duplex std] the written sheets have no frame of their own and get the computed paper / scale', !dsv5.length, S5d.map(x => x.sh.name.replace(/\.dxf$/, '') + ' ' + x.i.frame.paper + ' 1:' + x.i.frame.scale).join(' | ') + (dsv5.length ? ' BAD ' + dsv5.join('; ') : ''));
      if (si4 < 0) ok('SV4[duplex plain] a sheet with open rows', false, 'no sheet has a ring');
      else {
        const listEv = await pd.evaluate(si => Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-ev]')).map(e => e.getAttribute('data-ev')).filter(e => e.indexOf(si + '|') === 0), si4);
        const viewEv = x4.i.rings.concat(x4.i.boxedOpen).sort(), rows = await pd.evaluate(si => window.DxfMetaEditor.openRows(si), si4), TC = { stated: '#ffd21f', read: '#ffd21f', inferred: '#ff8a1f' };
        const B4 = x4.i.bounds, want = q => /^GRID[XH]$/.test(q.key) ? [q.x, B4.y1] : /^(GRIDY|Z)$/.test(q.key) ? [B4.x1, q.y] : [q.x, q.y];   // a row's point means what its key means (§D82 fix)
        const ringBad = rows.filter(q => x4.i.rings.indexOf(q.ev) >= 0).filter(q => { const c = x4.items.find(d => d.k === 'circle' && d.ev === q.ev), w = want(q); return !c || c.o[0] !== w[0] || c.o[1] !== w[1] || c.c !== TC[q.t]; }).map(q => q.ev);
        ok('SV4[duplex plain] the view\'s open rows = the list\'s rows of the sheet; each ring at its row\'s point in its tier colour', JSON.stringify(viewEv) === JSON.stringify(listEv.slice().sort()) && !ringBad.length,
          x4.sh.name + ' list=' + listEv.length + ' view rings=' + x4.i.rings.length + ' boxed open=' + x4.i.boxedOpen.length + (ringBad.length ? ' RING BAD ' + ringBad.slice(0, 3).join(',') : ''));
        // accept one ringed row in the list (its own tick), with the view open: the ring goes, the sheet gains a marking
        const ev = x4.i.rings[0];
        await pd.evaluate(si => { const c = document.querySelector('#dm-panel [data-act="card"][data-sheet="' + si + '"]'); if (c && !window.DxfMetaEditor.state.open[si]) c.click(); }, si4); await sleep(400);
        await pd.click('#dm-panel [data-act="sheetview"][data-sheet="' + si4 + '"]'); await sleep(600);
        const m0 = await pd.evaluate(() => window.DxfSheetFrame.state.last.info.marks);
        await pd.evaluate(ev => { const row = Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-ev]')).find(e => e.getAttribute('data-ev') === ev); row.querySelector('[data-act="confirm"]').click(); }, ev); await sleep(800);
        const a1 = await pd.evaluate(() => { const i = window.DxfSheetFrame.state.last.info; return { marks: i.marks, rings: i.rings, open: !!document.getElementById('dxf-sheet-frame') }; });
        ok('SV4b accepting a row in the list updates the open view: its ring is gone, the sheet has one more marking', a1.open && a1.rings.indexOf(ev) < 0 && a1.marks === m0 + 1, 'row ' + ev + ' marks ' + m0 + ' -> ' + a1.marks + ' ring still there=' + (a1.rings.indexOf(ev) >= 0));
        await pd.click('#dsf-close'); await sleep(300);
      }
      // SV6: the SVG of a frame-less sheet states its paper; Markings off = the same SVG without the markings group
      const on = await info(pd, 0, true), off = await info(pd, 0, false), g = (/<g id="dxf2bim-marks">[\s\S]*?<\/g>\n/.exec(on.svg) || [''])[0], mm = on.i.frame.mm;
      const head = mm ? new RegExp('width="' + mm[0] + 'mm" height="' + mm[1] + 'mm"').test(on.svg) : false;
      ok('SV6 the SVG is the sheet at its paper size; without Markings it is exactly the SVG minus the markings group', !!g && head && on.svg.replace(g, '') === off.svg && on.svg.length - off.svg.length === g.length,
        on.sh.name + ' paper=' + (mm ? mm.join('x') + 'mm' : 'none') + ' svg ' + on.svg.length + ' / ' + off.svg.length + ' B, marks group ' + g.length + ' B');
    }
    // SV4c the raw shed (the set that showed it): after round 1, every ring lies inside the printed view, and every open row is either ringed or boxed (none lost)
    const RAWD = process.env.SHED_RAW_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'raw'), raw = fs.existsSync(RAWD) ? fs.readdirSync(RAWD).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(RAWD, f)) : [];
    if (raw.length !== 9) ok('SV4c[shed raw]', false, 'MISSING input: the 9 raw shed sheets (SHED_RAW_DIR)');
    else { const pr = await page(); await openSet(pr, raw);
      for (let i = 0; i < 12; i++) { const any = await pr.evaluate(() => (window.DxfMetaEditor.state.yMeta || []).some(m => m.si >= 0 && (m.x || m.y))); if (any) break;
        const k = await pr.evaluate(() => { const b = document.querySelector('#dm-yellows .dm-grp [data-act="grpok"]'); if (!b) return null; b.click(); return b.getAttribute('data-grp'); }); if (!k) break; await idle(pr); await sleep(500); }
      const nr = await pr.evaluate(() => window.DxfMetaEditor.state.sheets.length), rep = [];
      for (let si = 0; si < nr; si++) { const x = await info(pr, si), V = x.i.view, off = x.items.filter(d => d.k === 'circle' && d.ev !== undefined && !(d.o[0] >= V.x0 && d.o[0] <= V.x1 && d.o[1] >= V.y0 && d.o[1] <= V.y1)).length;
        rep.push({ n: x.sh.name.replace(/\.dxf$/, ''), rings: x.i.rings.length, boxed: x.i.boxedOpen.length, open: x.i.open, off }); }
      ok('SV4c[shed raw] every ring is on the printed sheet and every open row is ringed or boxed', rep.every(q => q.off === 0 && q.rings + q.boxed === q.open) && rep.some(q => q.rings > 0),
        rep.map(q => q.n + ' ' + q.rings + '+' + q.boxed + '/' + q.open + (q.off ? ' OFF ' + q.off : '')).join(' | ')); }
    ok('SV0 no page errors', errs.length === 0, 'errors=' + errs.length);
  } catch (e) { ok('SV run', false, 'threw ' + String(e && e.stack || e).slice(0, 400)); }
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('§W-SHEET-FRAME ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
