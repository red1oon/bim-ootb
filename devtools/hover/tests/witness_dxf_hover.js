#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DXF-HOVER (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 2). READ THE LOG after every run: the §DXF_HOVER_W lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: "I see a wrong body on the Modeller canvas; which code made it?" had no answer without reading the pipeline. With the dev overlay loaded (the
//   bookmarklet's own code), hovering a body must show the line that built it, and never a guessed line.
//   H1 the generated index (devtools/hover/trace_index.json) = a fresh parse: same keys, one line each
//   H2 THE PAGE (headless Modeller, SwiftShader, as witness_dxf_props_panel.js): open the marked shed, Complete, load the overlay, Convert, then REAL mouse moves over a grid of
//      canvas points. For every body the page's own pick hovered: tooltip key = the page's trace map = the Node CLI's trace.json (an independent run) for that guid; its
//      file:line = the index; the V link = vscode://file/<root>/<file:line>
//   H2b (§F.23, the provenance hover): for every hovered body the tooltip's six layer counts = dxf_hover.layersFor in Node on the same page-shaped model
//      (devtools/hover/tests/shed_ctx.js, ids from the page's own logged commit nextId)
//   H2c every hovered body's tooltip lies wholly inside the 1440x900 window (the layered tooltip is tall: unclamped, it ran off the bottom; film 3's first page run, 2026-11-15)
//   H3 RED CONTROL: a second page converts BEFORE the overlay loads: every hovered body says "convert again", 0 lines claimed
// INCONCLUSIVE (exit 2) if a sweep hovered 0 bodies or the marked shed is missing. Run it alone, at low priority (two of these at once saturate the machine):
//   nice -n 19 ionice -c3 node devtools/hover/tests/witness_dxf_hover.js < /dev/null > <log>      (NODE_PATH=~/bim-compiler/node_modules; SHED_MARKED overrides the input)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), M = path.join(ROOT, 'modeller');
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('§DXF_HOVER_W VERDICT INCONCLUSIVE the 9 CLI-marked shed sheets are not at ' + MK + ' (found ' + files.length + ')'); process.exit(2); }
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const BOOKMARKLET = "(function(){var s=document.createElement('script');s.src='/devtools/hover/dxf_hover.js?'+Date.now();document.head.appendChild(s)})()";   // = the spec's bookmarklet body
const H = require(path.join(ROOT, 'devtools', 'hover', 'dxf_hover.js'));

(async () => {
  // H1 — the index the overlay reads = a fresh parse
  const gen = cp.spawnSync('node', [path.join(ROOT, 'devtools', 'hover', 'gen_trace_index.js'), '--root', ROOT], { encoding: 'utf8' });
  const IX = JSON.parse(fs.readFileSync(path.join(ROOT, 'devtools', 'hover', 'trace_index.json'), 'utf8')), S = require(path.join(ROOT, 'devtools', 'hover', 'trace_sites.js')).sites(ROOT);
  const one = Object.keys(S).every(k => S[k].length === 1 && IX.keys[k] === S[k][0]) && Object.keys(IX.keys).length === Object.keys(S).length;
  console.log('§DXF_HOVER_W H1 ' + (gen.stdout || '').trim() + ' parse_keys=' + Object.keys(S).length + ' same=' + (one ? 'Y' : 'N'));
  ok('H1 the index = a fresh parse, one line per key', gen.status === 0 && one && Object.keys(S).length > 0);

  // the independent oracle: the Node CLI with --trace on the same sheets
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'w_dxf_hover_'));
  const cli = cp.spawnSync('node', [path.join(M, 'dxf2bim_cli.js'), '--sheets', ...files, '--out', out, '--pack', 'pwd2024_bd', '--complete', '--trace'], { encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
  const ORACLE = fs.existsSync(path.join(out, 'trace.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'trace.json'), 'utf8')).trace : {};
  console.log('§DXF_HOVER_W oracle cli_exit=' + cli.status + ' traced=' + Object.keys(ORACLE).length + ' ' + ((cli.stdout || '').match(/§DXF_TRACE elements=.*/) || [''])[0]);

  const http = require('http'), puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  async function session(overlayFirst) {
    const bc = await br.createBrowserContext(), pg = await bc.newPage(), errs = [], hov = [];   // a fresh context per session: no storage shared between H2 and H3
    await pg.setViewport({ width: 1440, height: 900 });   // was inside the comment above until 2026-11-15 (the page ran at puppeteer's default 800x600; found by H2c's red run)
    pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    let nextId = null; pg.on('console', m => { const t = m.text(); if (/^§DXF_HOVER /.test(t)) hov.push(t); const n = /commit nextId=(\d+)/.exec(t); if (n) nextId = Number(n[1]); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI', { timeout: 120000 }); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    const loadOverlay = async () => { await pg.evaluate(BOOKMARKLET); await pg.waitForFunction('window.__DXF_HOVER && window.__DXF_HOVER.state', { timeout: 30000 }); await pg.evaluate(() => window.__DXF_HOVER.ready); };
    if (overlayFirst) await loadOverlay();
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 180000 }); await new Promise(r => setTimeout(r, 1500));
    if (!overlayFirst) await loadOverlay();
    await pg.evaluate(() => { document.querySelectorAll('[id$="-panel"], #dxf-meta, .dxf-meta').forEach(p => { if (getComputedStyle(p).position === 'fixed') p.style.display = 'none'; }); });   // side panels off the canvas for the sweep
    const box = await pg.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const seen = {};
    for (let j = 1; j < 18; j++) for (let i = 1; i < 26; i++) {
      await pg.mouse.move(box.x + box.w * i / 26, box.y + box.h * j / 18);
      const s = await pg.evaluate(() => { const c = window.__DXF_HOVER.state.cur, t = document.getElementById('dxf-hover-tip'); return c && !c.other ? { fid: c.fid, guid: c.guid, key: c.key, at: c.at, link: c.link, text: t.textContent, counts: t.dataset.counts || '', rect: (function (r) { return { x: r.left, y: r.top, r: r.right, b: r.bottom }; })(t.getBoundingClientRect()), vw: innerWidth, vh: innerHeight, pageKey: c.guid ? String(window.__DXF_TRACE.get(c.guid) || '').split(' > ')[0] || null : null } : null; });
      if (s && seen[s.fid] == null) seen[s.fid] = s;
    }
    await bc.close();
    return { seen: Object.values(seen), errs, hov, nextId };
  }

  try {
    // H2 — the overlay loaded before Convert: every hovered body names its line
    const A = await session(true);
    const bad = A.seen.filter(s => !(s.key && s.key === s.pageKey && s.key === String(ORACLE[s.guid] || '').split(' > ')[0] && s.at === IX.keys[s.key] && s.link === 'vscode://file' + IX.root + '/' + s.at));
    const keys = {}; A.seen.forEach(s => { keys[s.key] = (keys[s.key] || 0) + 1; });
    A.seen.slice(0, 6).forEach(s => console.log('  §DXF_HOVER_W H2 fid=' + s.fid + ' key=' + s.key + ' at=' + s.at + ' oracle=' + String(ORACLE[s.guid] || '-') + ' link=' + s.link));
    console.log('§DXF_HOVER_W H2 hovered=' + A.seen.length + ' keys=' + JSON.stringify(keys) + ' wrong=' + bad.length + ' page_hover_lines=' + A.hov.length + ' page_errors=' + A.errs.length);
    bad.slice(0, 5).forEach(s => console.log('  §DXF_HOVER_W H2 WRONG ' + JSON.stringify(s)));
    if (!A.seen.length) { console.log('§DXF_HOVER_W VERDICT INCONCLUSIVE the sweep hovered 0 bodies'); process.exit(2); }
    ok('H2 every hovered body shows its key = page map = Node CLI trace, its file:line = the index, and the V link', bad.length === 0, A.seen.length + ' bodies, ' + Object.keys(keys).length + ' keys');
    // H2b — the six layer counts on screen = layersFor in Node on the same page-shaped model (the page's own nextId)
    const SC = require(path.join(ROOT, 'devtools', 'hover', 'tests', 'shed_ctx.js')).shedCtx(ROOT, files, A.nextId || 1);
    const diff = A.seen.filter(s => { const n = H.layersFor(s.fid, SC.ctx(IX)); return !n || !n.counts || n.counts.join(',') !== s.counts; });
    A.seen.slice(0, 4).forEach(s => console.log('  §DXF_HOVER_W H2b fid=' + s.fid + ' page_counts=' + s.counts + ' node_counts=' + ((H.layersFor(s.fid, SC.ctx(IX)) || {}).counts || []).join(',')));
    console.log('§DXF_HOVER_W H2b nextId=' + A.nextId + ' hovered=' + A.seen.length + ' counts_differ=' + diff.length);
    ok('H2b every hovered body: the tooltip layer counts = layersFor in Node', A.nextId != null && diff.length === 0, A.seen.length + ' bodies');
    const outV = A.seen.filter(s => !(s.rect.x >= 0 && s.rect.y >= 0 && s.rect.r <= s.vw && s.rect.b <= s.vh));
    console.log('§DXF_HOVER_W H2c hovered=' + A.seen.length + ' tip_out_of_window=' + outV.length + (outV.length ? ' first=' + JSON.stringify(outV[0].rect) : '') + ' lowest_tip_bottom=' + Math.max.apply(null, A.seen.map(s => Math.round(s.rect.b))) + ' of ' + (A.seen[0] || {}).vh);
    ok('H2c every hovered body: the tooltip is wholly inside the window', outV.length === 0);

    // H3 — red control: Convert before the overlay: no line may be claimed
    const B = await session(false);
    const claimed = B.seen.filter(s => s.key || s.at || s.link || s.text.indexOf(H.CONVERT_AGAIN) < 0);
    console.log('§DXF_HOVER_W H3 red-control hovered=' + B.seen.length + ' claimed_a_line=' + claimed.length);
    ok('H3 red control: converted before the overlay -> every hovered body says convert again, 0 lines claimed', B.seen.length > 0 && claimed.length === 0);
  } finally { await br.close(); srv.close(); }
  console.log('§DXF_HOVER_W VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§DXF_HOVER_W FATAL ' + (e && e.stack || e)); process.exit(1); });
