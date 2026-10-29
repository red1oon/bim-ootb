#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DATUM-PICK (prompts/DXF2BIM_FOUNDATION_LANE.md §D94). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the second height of an elevation / section was given as a CAD y the user had to read in the CAD program (§D40 "type it in metres, and the y
// where it is drawn"); §D94 lets the user click the drawn line on the Sheet view. What could go wrong, one check each:
//   P1 the pick fills a y that is not the drawn line's (a rounding, the pointer's own y, a marking's y): the field = the raw sheet's drawn horizontal segment y (computed here in Node
//      from the raw file, to 1e-6) and within 0.02 of the y the CLI-marked set states, on each of the 5 sheets that ask.
//   P2 the pick writes a marking by itself (the height must stay the user's): every sheet's markings byte-identical before / after each pick.
//   P3 a picked y builds a different set from a typed y: the height typed + Add gives @Z=<z> at the picked y, and the verdict's blocking count after all 5 = a control run that types
//      the marked set's y values (the Why take's path).
//   P4 falsifier: a pointer 30 px from every drawn horizontal segment gives snap=free and the pointer's own y (to 1 px / scale), never a line's.
//   P5 Esc in pick mode leaves the field as it was and logs cancel.
//   P6 0 §PAGEERR.
//   P8 (§D40, moved here from W-DXF-ARRANGE A11a by §D96) each asking card quotes the sheet's own ground y, both inputs carry `need`, the placeholders say what goes in.
//   P0 (§D96) the page with PR-Z-DIM on: the raw shed after Accept all asks no second height (every elevation / section holds 2 @Z, the second PR-Z-DIM). The pick runs below
//      with the rule switched off (window.DXF_NO_ZDIM), i.e. on sheets that still ask, as a set without a self-measured dimension would.
//   P7 a pointer that cannot tell two drawn lines apart (2+ within 8 px) picks NOTHING: the click is refused (logged), the field unchanged, the view stays open; the user zooms in
//      (a real wheel at the pointer) and picks. (First run of this witness, 2026-10-29: without this rule, at the whole-sheet zoom 4.39 in per px, 4 of 5 picks took a line 4 in off.)
// Inputs: the 9 raw shed sheets (SHED_RAW_DIR, default ~/Videos/dxf2bim_film_work/why/raw) + their CLI-marked copies (SHED_MARKED_DIR, default .../why/cli/marked); missing -> INCONCLUSIVE.
// usage: node modeller/tests/witness_dxf_datum_pick.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const SV = require(path.join(ROOT, 'viewer', 'dxf_sheet_view.js')), MK = require(path.join(ROOT, 'modeller', 'dxf2bim', 'dxf2marks.js')), DP = require(path.join(ROOT, 'modeller', 'lib', 'dxf-parser.js'));
const RAW = process.env.SHED_RAW_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'raw');
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const dxfs = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f)) : [];
// the raw sheet's drawn horizontal segments (the sheet's own entities), and the marked set's second datum
const hsegs = file => { const out = []; SV.toDrawList(SV.parse(fs.readFileSync(file, 'utf8'))).list.forEach(d => {
  const sg = d.k === 'line' ? [[d.a, d.b]] : d.k === 'poly' && d.pts ? d.pts.slice(1).map((q, i) => [d.pts[i], q]).concat(d.closed && d.pts.length > 2 ? [[d.pts[d.pts.length - 1], d.pts[0]]] : []) : [];
  sg.forEach(([a, b]) => { if (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[0] - b[0]) > 1e-6) out.push({ y: a[1], x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) }); }); }); return out; };
const secondZ = file => { const m = MK.readMarks(new DP().parseSync(fs.readFileSync(file, 'utf8')).entities).filter(q => /^@Z=/.test(q.raw)).map(q => ({ z: Number(/^@Z=(\S+)/.exec(q.raw)[1]), y: q.y }));
  return m.length >= 2 ? m.sort((a, b) => b.z - a.z)[0] : null; };
const setOf = file => { const m = MK.readMarks(new DP().parseSync(fs.readFileSync(file, 'utf8')).entities).find(q => /^@SET=/.test(q.raw)); return m ? m.raw.replace(/^@SET=/, '').replace(/ @BY=.*/, '') : null; };
(async () => {
  const raw = dxfs(RAW), marked = dxfs(MARKED);
  if (raw.length !== 9 || marked.length !== 9) { console.log('§VERDICT INCONCLUSIVE missing input: raw ' + raw.length + ' (' + RAW + '), marked ' + marked.length + ' (' + MARKED + '), need 9 + 9'); process.exit(2); }
  const markedOf = name => marked.find(f => path.basename(f).startsWith(name.replace(/\.dxf$/i, '') + '_marked'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = async (noZdim) => { const ctx = await br.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-DATUM-PICK/.test(t)) { console.log('  ' + t.slice(0, 240)); pg.__picks.push(t); } });
    pg.__picks = [];
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.evaluate(nz => { window.DxfImportUI.state.arrangeOnOpen = false; if (nz) window.DXF_NO_ZDIM = true; }, !!noZdim); return pg; };
  const idle = pg => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict && window.DxfSheetFrame', { timeout: 300000, polling: 100 });
  const ACC = '#dm-yellows [data-act="acceptall"],#dm-yellows [data-act="acceptsr"],#dm-yellows [data-act="acceptinf"]';
  const click = async (pg, sel) => { await pg.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await sleep(100); await pg.click(sel); await sleep(250); await idle(pg); };
  const acceptY = async pg => { for (let g = 0; g < 4 && await pg.$(ACC); g++) await click(pg, ACC); };
  const blocking = pg => pg.evaluate(() => ((window.DxfMetaEditor.state.verdict || {}).blocking || []).length);
  const marksJson = pg => pg.evaluate(() => JSON.stringify(window.DxfMetaEditor.state.sheets.map(s => s.marks.map(m => [m.key, m.value, m.x, m.y]))));
  const ensureCard = async (pg, si) => { if (!(await pg.$('#dm-av-' + si + '-Z'))) await click(pg, '#dm-panel [data-act="card"][data-sheet="' + si + '"]'); };
  const prepare = async pg => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(raw); await idle(pg); await sleep(800);
    await acceptY(pg); const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
    if (!(await pg.$('#dm-f-0-SET'))) await click(pg, '#dm-panel [data-act="card"][data-sheet="0"]');
    await pg.$eval('#dm-f-0-SET', e => e.scrollIntoView({ block: 'center' })); await pg.click('#dm-f-0-SET'); await pg.keyboard.type(setOf(markedOf(names[0]))); await pg.keyboard.press('Enter'); await sleep(300); await idle(pg); await acceptY(pg);
    return names; };
  // screen point of drawing (x, y) on the open Sheet view's canvas
  const screenOf = (pg, x, y) => pg.evaluate((x, y) => { const v = window.DxfSheetFrame.state.view, r = document.querySelector('#dxf-sheet-frame canvas').getBoundingClientRect();
    return { x: r.left + r.width / 2 + (x - v.cx) * v.s, y: r.top + r.height / 2 - (y - v.cy) * v.s, s: v.s, top: r.top, h: r.height, left: r.left, w: r.width }; }, x, y);
  const pickAt = async (pg, si, sx, sy) => { await click(pg, '#dm-panel [data-act="zpick"][data-sheet="' + si + '"]'); await pg.waitForSelector('#dxf-sheet-frame canvas'); await sleep(300);
    await pg.mouse.move(sx - 20, sy); await pg.mouse.move(sx, sy, { steps: 4 }); await sleep(100); await pg.mouse.down(); await pg.mouse.up(); await sleep(300); };
  try {
    // ---- control: the marked set's y values typed (the Why take's path) ----
    { const p0 = await page(false), nm0 = await prepare(p0), Z0 = await p0.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => ({ n: s.name, z: s.marks.filter(m => m.key === 'Z').map(m => m.rule || m.source) })));
      const ev = Z0.filter(q => /ELEV|SECTION/.test(q.n)), asks = await p0.evaluate(() => document.querySelectorAll('#dm-panel .dm-ask[data-ask="Z"]').length);
      ok('P0 (§D96) rule on: after Accept all no card asks for a second height; each elevation / section holds 2 @Z, one from PR-Z-DIM', ev.length === 5 && asks === 0 && ev.every(q => q.z.length === 2 && q.z.indexOf('PR-Z-DIM') >= 0), 'asks=' + asks + ' ' + ev.map(q => q.n.replace(/\.dxf$/, '') + ':' + q.z.join('+')).join(' '));
      await p0.close(); }
    const pa = await page(true), names = await prepare(pa), second = {};
    names.forEach(n => { const f = markedOf(n); const z = f && secondZ(f); if (z) second[n] = z; });
    const sis = names.map((n, i) => second[n] ? i : -1).filter(i => i >= 0);
    for (const si of sis) { await ensureCard(pa, si); await pa.$eval('#dm-av-' + si + '-Z', (e, v) => { e.value = v; }, String(second[names[si]].z)); await pa.$eval('#dm-ap-' + si + '-Z', (e, v) => { e.value = v; }, String(second[names[si]].y));
      await click(pa, '#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]'); }
    await acceptY(pa); const blockA = await blocking(pa);
    console.log('§DATUM-CONTROL sheets=' + sis.length + ' blocking=' + blockA);
    // ---- the pick ----
    const pb = await page(true); await prepare(pb); const P1 = [], P2 = [], P3 = [], P7 = [], W = [];
    { const A8 = []; for (const si of sis) { await ensureCard(pb, si); A8.push(await pb.evaluate(si => { const S = window.DxfMetaEditor.state, v = document.getElementById('dm-av-' + si + '-Z'), p = document.getElementById('dm-ap-' + si + '-Z'); if (!v) return null;
        const ask = v.closest('.dm-row').previousElementSibling, z0 = S.sheets[si].marks.filter(m => m.key === 'Z')[0], y = z0 ? String(Number(Number(z0.y).toFixed(6))) : null;
        return { y, ok: !!(ask && ask.classList.contains('dm-ask') && ask.innerText.indexOf('One height is known') === 0 && y && ask.innerText.indexOf('at y ' + y) > 0 && v.classList.contains('need') && p.classList.contains('need') && v.placeholder + '|' + p.placeholder === 'height, m|y where drawn') }; }, si)); }
      ok('P8 (§D40) each of the 5 asking cards quotes its own ground y, both inputs red-outlined, the placeholders say what goes in', A8.length === 5 && A8.every(q => q && q.ok), A8.map(q => q ? q.y + ':' + q.ok : 'null').join(' ')); }
    for (const [k, si] of sis.entries()) { const n = names[si], z = second[n], segs = hsegs(raw.find(f => path.basename(f) === n));
      const line = segs.filter(g => Math.abs(g.y - z.y) < 0.5).sort((a, b) => Math.abs(a.y - z.y) - Math.abs(b.y - z.y) || (b.x1 - b.x0) - (a.x1 - a.x0))[0];
      await ensureCard(pb, si);
      if (k === 0) {   // P5 Esc, then P4 the falsifier, on the first sheet only
        const before = await marksJson(pb); await click(pb, '#dm-panel [data-act="zpick"][data-sheet="' + si + '"]'); await pb.waitForSelector('#dxf-sheet-frame canvas'); await pb.keyboard.press('Escape'); await sleep(300);
        const f5 = await pb.$eval('#dm-ap-' + si + '-Z', e => e.value);
        ok('P5 Esc in pick mode: field unchanged, cancel logged, no marking', f5 === '' && pb.__picks.some(t => /cancel sheet=/.test(t)) && before === await marksJson(pb), 'field="' + f5 + '"');
        await click(pb, '#dm-panel [data-act="zpick"][data-sheet="' + si + '"]'); await pb.waitForSelector('#dxf-sheet-frame canvas'); await sleep(300);
        const vcx = await pb.evaluate(() => window.DxfSheetFrame.state.view.cx), mid = Math.min(Math.max(vcx, line.x0), line.x1), sc = await screenOf(pb, mid, line.y); let fy = null;
        for (let yy = sc.top + 40; yy < sc.top + sc.h - 40 && fy === null; yy += 4) { const dy = (sc.top + sc.h / 2 - yy) / sc.s, py = (await pb.evaluate(() => window.DxfSheetFrame.state.view.cy)) + dy;
          if (segs.every(g => (mid < g.x0 - 8 / sc.s || mid > g.x1 + 8 / sc.s) || Math.abs(g.y - py) * sc.s > 30)) fy = { sy: yy, py }; }
        await pb.keyboard.press('Escape'); await sleep(200);
        if (!fy) ok('P4 falsifier: a pointer 30 px from every drawn horizontal line', false, 'no such row found on ' + n);
        else { const nb = pb.__picks.length; await pickAt(pb, si, sc.x, fy.sy); const t = pb.__picks.slice(nb).join(' '), f4 = Number(await pb.$eval('#dm-ap-' + si + '-Z', e => e.value));
          ok('P4 falsifier: 30 px from every drawn line -> snap=free, the pointer\'s own y, no line', /snap=free/.test(t) && Math.abs(f4 - fy.py) <= 1.5 / sc.s && segs.every(g => Math.abs(g.y - f4) > 1e-6), n + ' y=' + f4 + ' pointer=' + fy.py.toFixed(4) + ' 1px=' + (1 / sc.s).toFixed(4)); }
      }
      const before = await marksJson(pb), nb = pb.__picks.length, hover = () => pb.evaluate(() => { const p = window.DxfSheetFrame.state.pick; return p && p.hover ? { snap: p.hover.snap, y: p.hover.y } : null; });
      await click(pb, '#dm-panel [data-act="zpick"][data-sheet="' + si + '"]'); await pb.waitForSelector('#dxf-sheet-frame canvas'); await sleep(300);
      const vcx = await pb.evaluate(() => window.DxfSheetFrame.state.view.cx), lx = Math.min(Math.max(vcx, line.x0), line.x1);
      let sc = await screenOf(pb, lx, line.y); await pb.mouse.move(sc.x - 20, sc.y + 3); await pb.mouse.move(sc.x, sc.y + 3, { steps: 4 }); await sleep(100);   // 3 px off the line, as a hand would be
      let hv = await hover(), wheels = 0;
      if (hv && hv.snap === 'ambiguous') { const f0 = await pb.$eval('#dm-ap-' + si + '-Z', e => e.value), n0 = pb.__picks.length; await pb.mouse.down(); await pb.mouse.up(); await sleep(250);
        P7.push({ n, ok: f0 === await pb.$eval('#dm-ap-' + si + '-Z', e => e.value) && !!(await pb.$('#dxf-sheet-frame')) && pb.__picks.slice(n0).some(t => /refused .*ambiguous/.test(t)) }); }
      while (hv && hv.snap === 'ambiguous' && wheels < 12) { await pb.mouse.wheel({ deltaY: -120 }); wheels++; await sleep(80); sc = await screenOf(pb, lx, line.y); await pb.mouse.move(sc.x, sc.y + 3, { steps: 2 }); await sleep(60); hv = await hover(); }
      await pb.mouse.down(); await pb.mouse.up(); await sleep(300); W.push(n.replace(/\.dxf$/, '') + ' wheels=' + wheels);
      const got = await pb.$eval('#dm-ap-' + si + '-Z', e => e.value), y = Number(got), t = pb.__picks.slice(nb).filter(q => !/cancel/.test(q)).join(' ');
      P1.push({ n, got, line: line.y, marked: z.y, ok: got !== '' && Math.abs(y - line.y) <= 1e-6 && Math.abs(y - z.y) <= 0.02 && /snap=line/.test(t) });
      P2.push({ n, ok: before === await marksJson(pb) });
      await pb.$eval('#dm-av-' + si + '-Z', (e, v) => { e.value = v; }, String(z.z)); await click(pb, '#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]');
      const zm = await pb.evaluate(si => window.DxfMetaEditor.state.sheets[si].marks.filter(m => m.key === 'Z').map(m => [String(m.value), m.y]), si);
      P3.push({ n, ok: zm.some(m => m[0] === String(z.z) && Math.abs(m[1] - line.y) <= 1e-6), zm: JSON.stringify(zm) }); }
    await acceptY(pb); const blockB = await blocking(pb);
    ok('P1 the picked y = the drawn line\'s y (1e-6) and within 0.02 of the marked set\'s, on every sheet that asks', P1.length === 5 && P1.every(q => q.ok), P1.map(q => q.n.replace(/\.dxf$/, '') + ' ' + q.got + ' line=' + q.line.toFixed(6) + ' marked=' + q.marked + (q.ok ? '' : ' BAD')).join(' | '));
    ok('P2 a pick writes no marking', P2.length === 5 && P2.every(q => q.ok), P2.map(q => q.n.replace(/\.dxf$/, '') + (q.ok ? ' same' : ' CHANGED')).join(' | '));
    ok('P3 height + Add gives @Z at the picked y; blocking after all 5 = the typed control', P3.every(q => q.ok) && blockB === blockA, 'blocking pick=' + blockB + ' typed=' + blockA + ' ' + P3.filter(q => !q.ok).map(q => q.n + ' ' + q.zm).join(' '));
    ok('P7 two drawn lines within 8 px: the click picks nothing, then a zoom in picks the right one', P7.length > 0 && P7.every(q => q.ok), P7.length + ' sheets met it: ' + P7.map(q => q.n.replace(/\.dxf$/, '') + (q.ok ? ' refused' : ' NOT REFUSED')).join(' | ') + ' · ' + W.join(' '));
    ok('P6 0 §PAGEERR', errs.length === 0, errs.length + ' errors');
  } catch (e) { console.log('§FAIL crash ' + (e && e.stack || e).toString().slice(0, 400)); fails++; }
  await br.close(); srv.close();
  console.log('§VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' W-DATUM-PICK judged=' + judged + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
})();
