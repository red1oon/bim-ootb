#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-META: DXF2BIM lane L4 "Drawing metadata" editor (prompts/DXF2BIM_MODELLER_LANE.md §L4 + §L4.1).
 * Read the log (tests/logs/witness_dxf_meta_editor.log) after every run; exit code is not evidence.
 * Real UI through tests/e2e_harness.js (chooser, selects, typing, clicks, canvas drags). Each check names its issue:
 *   E1 FROM-FILE  marked Duplex set: every marking shows "from file", no red field; page verdict counts by code == the Node verdict of the
 *                 BIMCompiler modules over the same inputs (files + maps + plan ops + dx_shell_gaps.json). Issue: hidden markings / another input.
 *   E2 FILL       the set with DXF2BIM-MARK stripped (written here): needed fields red; every value typed/selected/clicked in; the in-page verdict,
 *                 the saved copies' markings (canonical, @BY stripped) and the re-imported copies' verdict equal the marked set's.
 *                 Issue: the editor cannot reproduce the markings, or writes others.
 *   E3 UNCONFIRMED a proposal left unticked never reaches the saved file (one ticked one does). Issue: a suggestion leaks into the drawing.
 *   E4 MUTATION   @WALLTOP=3.2,slab_above written on the FF plan (no plan at 3.2) -> exactly one new blocking QF:walltop_unknown_storey on the
 *                 new marking's handle; control 3.1 -> no new blocking, the FF wall height gaps leave the blocking list (pipeline applies the stated tops). Issue: a wrong level passes.
 *   E5 GATE       Convert disabled while blocked (forced convert refused, op-log unchanged); the real std set (8 sheets) through the chooser,
 *                 layer set from the drawings (STD) -> the editor verdict == the gate; qualifies -> Convert enabled and a real click converts. Issue: Convert on a guess.
 *   T1/X1         UI sanity: Tag tool click on the canvas writes @TAG at the entity centre; Exclude tool drag writes @EXCLUDE.
 * Inputs (local, not in git): $DXF2BIM_BC (default ~/Projects/bim-compiler) tests/dxf2bim/out/{marked,marked_shell} + dx_shell_gaps.json
 * (run there: mark_dx_set.js, rosetta_dx_shell.js), out/{marked_std,marked_std_shell} (std2d.py --door-ops, mark_dx_set.js std, DXSET=std rosetta_dx_shell.js),
 * scripts/export_library_subset.js.
 * Screenshots ~/Videos/dxf2bim_work/l4/.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { runE2E } = require('./e2e_harness');
const BC = process.env.DXF2BIM_BC || path.join(os.homedir(), 'Projects', 'bim-compiler');
const OUT = path.join(BC, 'tests/dxf2bim/out'), DD = path.join(BC, 'deploy/dev/');
const SHOTS = path.join(os.homedir(), 'Videos', 'dxf2bim_work', 'l4');
const LOG = path.join(__dirname, 'logs', 'witness_dxf_meta_editor.log');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'w-dxf-meta-'));
const SET = [['marked', 'DX_FLOOR_GF_marked.dxf'], ['marked', 'DX_FLOOR_FF_marked.dxf'], ['marked_shell', 'DX_FRONT_shell.dxf'], ['marked_shell', 'DX_REAR_shell.dxf'],
  ['marked_shell', 'DX_LEFT_shell.dxf'], ['marked_shell', 'DX_RIGHT_shell.dxf'], ['marked_shell', 'DX_ROOF_shell.dxf']].map(([d, n]) => path.join(OUT, d, n));
const SUBSET = path.join(__dirname, '..', 'dxf2bim', 'local', 'library_subset_duplex.json');
const lines = []; let fail = 0, gapN = 0;
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const gap = (id, d) => { gapN++; say('GAP  ' + id + ' | ' + d); };
const J = JSON.stringify, sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const DxfParser = require(DD + 'dxf-parser.js'), MK = require(DD + 'dxf2marks.js'), B = require(DD + 'dxf2bim.js'), Q = require(DD + 'dxf2qualify.js');
const SC = require(path.join(BC, 'tests/dxf2bim/set_configs.js'));
const parse = t => new DxfParser().parseSync(t);
const sortObj = o => J(Object.keys(o).sort().reduce((q, k) => (q[k] = o[k], q), {}));

// the witness's OWN mark stripper (independent of the editor's): drop TEXT/MTEXT entities on DXF2BIM-MARK in ENTITIES
function stripMarks(text) {
  const L = text.split(/\r?\n/), out = []; let inEnt = false, i = 0;
  while (i + 1 < L.length) {
    const c = L[i].trim(), v = L[i + 1].trim();
    if (c === '0' && v === 'SECTION' && (L[i + 3] || '').trim() === 'ENTITIES') inEnt = true; else if (inEnt && c === '0' && v === 'ENDSEC') inEnt = false;
    if (inEnt && c === '0' && (v === 'TEXT' || v === 'MTEXT')) { let j = i + 2, mk = false; while (j + 1 < L.length && L[j].trim() !== '0') { if (L[j].trim() === '8' && L[j + 1].trim() === 'DXF2BIM-MARK') mk = true; j += 2; }
      if (!mk) for (let k = i; k < j; k++) out.push(L[k]); i = j; continue; }
    out.push(L[i], L[i + 1]); i += 2;
  }
  for (; i < L.length; i++) out.push(L[i]);
  return out.join(text.indexOf('\r\n') >= 0 ? '\r\n' : '\n');
}
// canonical markings (§L4.1): '@KEY=VALUE' (+ the meaningful position), @BY suffix stripped
const POS = { GRIDX: 'x', GRIDH: 'x', GRIDY: 'y', Z: 'y', TAG: 'xy' };
const n6 = v => String(Number(Number(v).toFixed(6)));
function canonMarks(text) {
  return MK.readMarks(parse(text).entities).map(m => { const raw = m.raw.replace(/\s+@BY=\S+$/, ''), k = (/^@([A-Z]+)=/.exec(raw) || [])[1], p = POS[k];
    return raw + (p === 'x' ? '@x=' + n6(m.x) : p === 'y' ? '@y=' + n6(m.y) : p === 'xy' ? '@' + n6(m.x) + ',' + n6(m.y) : ''); }).sort();
}

async function openSet(pg, files) {
  await pg.click('#b-open');
  await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
  const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]);
  await ch.accept(files);
  await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length', { timeout: 120000 });
  return idle(pg);
}
async function idle(pg) {
  await sleep(350);
  await pg.waitForFunction('window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 300000 });
  return pg.evaluate(() => { const v = window.DxfMetaEditor.state.verdict; return { verdict: v.verdict, counts: v.counts, nB: v.blocking.length, nA: v.advisory.length, pipeline: v.pipeline,
    blocking: v.blocking.map(x => ({ code: x.code, sheet: x.sheet, handles: x.handles, message: x.message, detail: x.detail })), advisory: v.advisory.map(x => ({ code: x.code, sheet: x.sheet, handles: x.handles, gap: x.gap })) }; });
}
async function newPage(t, tag) {
  const pg = await t.pg.browser().newPage(); await pg.setViewport({ width: 1400, height: 900 });
  pg.on('console', m => { const x = m.text(); if (/§DXF-META (verdict|save|zoom|tool|tag|confirm|exclude|add refused)|§DXF-CONVERT|pageerror|ERR/.test(x)) say('  [' + tag + '] ' + x.slice(0, 260)); });
  pg.on('pageerror', e => say('  [' + tag + '] PAGEERR ' + String(e).slice(0, 300)));
  await pg.goto(t.pg.url().replace(/\?.*$/, ''), { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 90000 });
  return pg;
}
async function setDownloads(pg, dir) { fs.mkdirSync(dir, { recursive: true }); const c = await pg.target().createCDPSession(); await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }); }
async function waitFiles(dir, n) { for (let i = 0; i < 120; i++) { const f = fs.readdirSync(dir).filter(x => /\.dxf$/.test(x)); if (f.length >= n) { await sleep(400); return f.sort(); } await sleep(250); } return fs.readdirSync(dir).filter(x => /\.dxf$/.test(x)).sort(); }
const sheetIdx = (pg, name) => pg.evaluate(n => window.DxfMetaEditor.state.sheets.findIndex(s => s.name === n), name);
async function ensureSec(pg, sec) { const open = await pg.evaluate(s => window.DxfMetaEditor.state.sec[s], sec); if (!open) { await clk(pg, '[data-act="sec"][data-sec="' + sec + '"]'); await sleep(150); } }
async function ensureCard(pg, si) { const open = await pg.evaluate(i => !!window.DxfMetaEditor.state.open[i], si); if (!open) { await clk(pg, '[data-act="card"][data-sheet="' + si + '"]'); await sleep(150); } }
async function clk(pg, sel, o) {   // the panel re-renders when a verdict lands; a click racing that render is retried on the fresh node
  for (let i = 0; ; i++) { try { await pg.waitForSelector(sel, { visible: true, timeout: 10000 }); await pg.click(sel, o); return; } catch (e) { if (i >= 3 || !/detached|not clickable/.test(e.message)) throw new Error('click ' + sel + ': ' + e.message); await sleep(300); } }
}
async function typeInto(pg, sel, text) { await clk(pg, sel, { clickCount: 3 }); await pg.keyboard.press('Backspace'); await pg.type(sel, String(text)); await pg.keyboard.press('Enter'); await sleep(120); }
const keyOf = x => x.code + '|' + x.sheet + '|' + x.handles.join(',');
function subset(sfx) {   // BIMCompiler scripts/export_library_subset.js from a run's element summary (old set: '', std: '_std'); local, git-ignored
  say(cp.execFileSync('node', [path.join(BC, 'scripts/export_library_subset.js'), '--elements', path.join(OUT, 'duplex_basic_shapes_elements' + sfx + '.json'),
    '--labels', path.join(OUT, 'duplex_basic_shapes_labels' + sfx + '.json'), '--lib', path.join(BC, 'deploy/component_library.db'), '--out', SUBSET], { encoding: 'utf8' }).trim().split('\n')[0]);
}

runE2E('W-DXF-META', async (t) => {
  for (const f of SET) if (!fs.existsSync(f)) throw new Error('MISSING input ' + f);
  fs.mkdirSync(SHOTS, { recursive: true });
  say('BC=' + BC + ' (' + cp.execFileSync('git', ['-C', BC, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim().slice(0, 100) + ')');
  subset('');   // the OLD set's local LOD400 subset (E1-E4); the std one is written before E5
  // the copies in modeller/dxf2bim/ are the BIMCompiler modules at the inputs' commit (verbatim; modeller/dxf2bim/sync.sh)
  const drift = ['dxf2bim', 'dxf2elev', 'dxf2marks', 'dxf2mesh', 'dxf2types', 'dxf2shell', 'dxf2shell_config', 'dxf2qualify'].filter(f =>
    cp.execFileSync('git', ['-C', BC, 'show', 'HEAD:deploy/dev/' + f + '.js'], { encoding: 'utf8', maxBuffer: 1 << 28 }) !== fs.readFileSync(path.join(__dirname, '..', 'dxf2bim', f + '.js'), 'utf8'));
  check('E0 COPIES', 'the Modeller copies are not the BIMCompiler modules the inputs were made with (drift)', drift.length === 0, 'BIMCompiler HEAD vs modeller/dxf2bim: drift=' + J(drift));

  // ---------------- Node reference (BIMCompiler modules, NOT the Modeller port): rosetta_qualify.js Q1 composition ----------------
  const G = JSON.parse(fs.readFileSync(path.join(OUT, 'marked_shell', 'dx_shell_gaps.json'), 'utf8'));
  const txt = {}; SET.forEach(f => { txt[path.basename(f)] = fs.readFileSync(f, 'utf8'); });
  const idOf = n => n.replace(/_(marked|shell)\.dxf$/, '');
  const stale = Object.keys(G.inputs).filter(k => G.inputs[k] !== sha(txt[Object.keys(txt).find(n => idOf(n) === k)] || ''));
  check('E1 inputs fresh', 'the Node gaps were computed on other files than the ones opened', stale.length === 0, G.gaps.length + ' gap records, stale=' + J(stale));
  const DX = SC.DX, mapsOf = n => /FLOOR/.test(n) ? [DX.MAP_PLAN] : /ROOF/.test(n) ? [DX.MAP_ROOF] : [DX.MAP_ELEV, DX.MAP_LEVL];
  const deps = { DxfParser, hashHex: sha, library: [] };
  const vNode = Q.qualify({ files: Object.keys(txt).sort().map(n => ({ name: idOf(n), dxf: parse(txt[n]), layer_maps: mapsOf(n) })),
    plan_ops: { DX_FLOOR_GF: B.run(txt['DX_FLOOR_GF_marked.dxf'], DX.MAP_PLAN, DX.CFG, deps).ops, DX_FLOOR_FF: B.run(txt['DX_FLOOR_FF_marked.dxf'], DX.MAP_PLAN, DX.CFG, deps).ops },
    gaps: G.gaps, resolved: G.resolved }, DX.QUALIFY);
  say('Node verdict: ' + vNode.verdict + ' blocking=' + vNode.blocking.length + ' advisory=' + vNode.advisory.length + ' counts=' + sortObj(vNode.counts));

  // ================= E1 =================
  const pg = await newPage(t, 'marked');
  const v1 = await openSet(pg, SET);
  say('page verdict (marked): ' + v1.verdict + ' blocking=' + v1.nB + ' advisory=' + v1.nA + ' pipeline=' + J(v1.pipeline));
  for (let i = 0; i < 7; i++) await ensureCard(pg, i);
  await ensureSec(pg, 'units');
  const e1 = await pg.evaluate(() => {
    const S = window.DxfMetaEditor.state, P = document.getElementById('dm-panel');
    const srcs = Array.from(P.querySelectorAll('.dm-card [data-src], .dm-sb [data-src]')).filter(e => !e.closest('.dm-lay')).map(e => e.getAttribute('data-src'));
    const red = Array.from(P.querySelectorAll('.dm-card .need, .dm-card label.need')).length + Array.from(P.querySelectorAll('[data-key="UNITS"].need')).length;
    return { srcs, red, fileMarks: S.sheets.reduce((n, s) => n + s.marks.length, 0), allFile: S.sheets.every(s => s.marks.every(m => m.source === 'file')) };
  });
  const bySrc = e1.srcs.reduce((o, s) => (o[s] = (o[s] || 0) + 1, o), {});
  check('E1 FROM-FILE', 'a file marking is not shown, or shown as anything but "from file", or a field is red on a fully marked set',
    e1.allFile && e1.srcs.length === e1.fileMarks && (bySrc.file || 0) === e1.fileMarks && e1.red === 0, 'markings in files=' + e1.fileMarks + ' shown=' + J(bySrc) + ' red fields=' + e1.red);
  check('E1 VERDICT', 'the editor verdict differs from the Node verdict for the same inputs (counts by code)', sortObj(v1.counts) === sortObj(vNode.counts) && v1.nA === vNode.advisory.length,
    'page=' + sortObj(v1.counts) + ' adv=' + v1.nA + ' | node adv=' + vNode.advisory.length);
  // screenshot: the editor filled from the file (GF card + units), then click a blocking item -> zoom + highlight
  await pg.evaluate(() => { const S = window.DxfMetaEditor.state, gi = S.sheets.findIndex(x => /FLOOR_GF/.test(x.name)); S.open = {}; S.open[gi] = true; S.sec.units = true; S.sec.verdict = false; S.sec.sheets = true; });
  await clk(pg, '[data-act="sec"][data-sec="layers"]'); await clk(pg, '[data-act="sec"][data-sec="layers"]');
  await pg.evaluate(() => { document.getElementById('dm-body').scrollTop = 0; }); await sleep(600);
  await pg.screenshot({ path: path.join(SHOTS, 'l4_editor_filled.png') });
  await pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.open = {}; S.sec.units = false; S.sec.sheets = true; });
  await pg.click('[data-act="card"][data-sheet="1"]'); await sleep(200);
  await ensureSec(pg, 'verdict');
  const iz = await pg.evaluate(() => { const L = window.DxfMetaEditor.state.verdict.blocking; return L.findIndex(x => x.code === 'GAP:door_below_min_width'); });
  await pg.evaluate(i => { const el = document.querySelector('.dm-it[data-i="' + i + '"]'); el.scrollIntoView({ block: 'center' }); }, iz);
  await pg.click('.dm-it[data-i="' + iz + '"]'); await sleep(900);
  const z1 = await pg.evaluate(() => window.DxfMetaEditor.state.lastZoom);
  check('E1 ZOOM', 'clicking a verdict item does not frame the canvas on it and highlight its handle\'s drawn segments', !!z1 && z1.code === 'GAP:door_below_min_width' && z1.segs > 0, J(z1));
  await pg.screenshot({ path: path.join(SHOTS, 'l4_editor_verdict_zoom.png') });

  // ================= E4 (marked page): one wrong level =================
  await ensureSec(pg, 'walltops');
  const ffI = await sheetIdx(pg, 'DX_FLOOR_FF_marked.dxf');
  await typeInto(pg, '#dm-wt-' + ffI, '3.2');
  await clk(pg, '[data-act="walltop"][data-sheet="' + ffI + '"]');
  const v4 = await idle(pg);
  const k1 = new Set(v1.blocking.map(keyOf)), k4 = new Set(v4.blocking.map(keyOf));
  const add4 = v4.blocking.filter(x => !k1.has(keyOf(x))), gone4 = v1.blocking.filter(x => !k4.has(keyOf(x)));
  const wtEnt = add4.length === 1 ? await pg.evaluate((h) => { const S = window.DxfMetaEditor.state, sh = S.sheets.find(s => s.name === 'DX_FLOOR_FF_marked.dxf');
    const d = new window.DxfParser().parseSync(window.DxfMetaEditor.effText(sh)); const e = d.entities.find(q => q.handle === h); return e ? e.layer + ' ' + e.text : null; }, add4[0].handles[0]) : null;
  check('E4 MUTATION', 'a wrong @WALLTOP level is not reported exactly once with its own handle (or other items move)',
    add4.length === 1 && add4[0].code === 'QF:walltop_unknown_storey' && gone4.length === 0 && /^DXF2BIM-MARK @WALLTOP=3\.2,slab_above/.test(wtEnt || ''),
    'new=' + J(add4.map(x => x.code + ' ' + x.sheet + ' h=' + x.handles.join(','))) + ' entity=' + J(wtEnt) + ' gone=' + gone4.length);
  await typeInto(pg, '#dm-wt-' + ffI, '3.1');
  const v4c = await idle(pg);
  const isFFwall = x => x.code === 'GAP:no_elevation_height' && x.sheet === 'DX_FLOOR_FF_marked.dxf' && /WALL/.test((x.detail && x.detail.layer) || '');
  const wallFF = v1.blocking.filter(isFFwall).length, conv = v4c.advisory.filter(x => x.code === 'QF:convention_applied' && x.sheet === 'DX_FLOOR_FF_marked.dxf').length;
  const add4c = v4c.blocking.filter(x => !k1.has(keyOf(x)));
  check('E4 CONTROL', 'the right level (3.1) is not applied (FF wall height gaps stay blocking, or something new blocks)',
    add4c.length === 0 && wallFF > 0 && v4c.nB === v1.nB - wallFF && v4c.blocking.filter(isFFwall).length === 0,
    'FF wall no_elevation_height before=' + wallFF + ' -> blocking 0 (pipeline applied the stated tops, L2.6 A applyWallTops; qualify convention_applied=' + conv + ') blocking ' + v1.nB + '->' + v4c.nB + ' new=' + add4c.length);
  await clk(pg, '[data-act="walltop"][data-sheet="' + ffI + '"]');   // untick: back to the file's markings
  const v4r = await idle(pg);
  check('E4 RESTORE', 'unticking the convention does not return to the file verdict', sortObj(v4r.counts) === sortObj(v1.counts), 'counts ' + (sortObj(v4r.counts) === sortObj(v1.counts) ? 'equal' : sortObj(v4r.counts)));

  // ================= T1 / X1 UI sanity (marked page) =================
  {
    await ensureSec(pg, 'tags');
    const gfI = await sheetIdx(pg, 'DX_FLOOR_GF_marked.dxf');
    const tgt = await pg.evaluate(() => { const c = window.DxfImportUI.state.canvas['DX_FLOOR_GF_marked.dxf'], S = window.DxfMetaEditor.state;
      const sh = S.sheets.find(s => s.name === 'DX_FLOOR_GF_marked.dxf'), e = sh.dxf.entities.find(q => q.layer === 'A-DOOR' && c.segOf[q.handle]);
      window.DxfMetaEditor.highlight({ code: 'probe', sheet: sh.name, handles: [e.handle], pos: null }); return e.handle; });
    await sleep(500);
    await clk(pg, '[data-act="tool"][data-tool="tag"]'); await sleep(200);
    const px = await pg.evaluate(h => { const c = window.DxfImportUI.state.canvas['DX_FLOOR_GF_marked.dxf'], s = c.segOf[h];
      const v = new window.THREE.Vector3((s[0] + s[3]) / 2, (s[1] + s[4]) / 2, (s[2] + s[5]) / 2).project(window.A.camera), r = window.A.renderer.domElement.getBoundingClientRect();
      return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, tgt);
    await pg.mouse.click(px[0], px[1]); await sleep(400);
    const pick = await pg.evaluate(() => window.DxfMetaEditor.state.pick);
    if (pick) { await pg.waitForSelector('[data-act="tagadd"]', { timeout: 5000 }); await clk(pg, '[data-act="tagadd"]'); }
    await idle(pg);
    const tg = await pg.evaluate(() => { const S = window.DxfMetaEditor.state; for (const sh of S.sheets) { const m = sh.marks.find(q => q.key === 'TAG'); if (m) return { sheet: sh.name, value: m.value, x: m.x, y: m.y, source: m.source }; } return null; });
    check('T1 TAG', 'the Tag tool click does not write a @TAG (canned value) at the picked entity centre', !!pick && !!tg && tg.source === 'user' && tg.sheet === pick.sheet && tg.x === pick.x && tg.y === pick.y,
      'aimed GF A-DOOR ' + tgt + ' picked=' + J(pick) + ' tag=' + J(tg));
    await clk(pg, '[data-act="tool"][data-tool="tag"]').catch(() => {});
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.tags = true; });
    if (tg) { await pg.evaluate(() => { const b = Array.from(document.querySelectorAll('[data-act="rm"]')).find(x => /@TAG=/.test(x.parentElement.textContent)); b.click(); }); }
    await ensureSec(pg, 'excludes');
    await pg.select('select[data-act="exsheet"]', 'DX_FLOOR_GF_marked.dxf'); await sleep(100);
    await clk(pg, '[data-act="tool"][data-tool="exclude"]'); await sleep(200);
    const ex = await pg.evaluate(() => { const A = window.A, c = window.DxfImportUI.state.canvas[window.DxfMetaEditor.state.exSheet], r = A.renderer.domElement.getBoundingClientRect();
      const pr = (x, y) => { const v = new window.THREE.Vector3(x, y, c.z).project(A.camera); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; };
      const z = window.DxfMetaEditor.state.lastZoom.centre, t = { x: z[0], y: z[1] }; return { sheet: window.DxfMetaEditor.state.exSheet, a: pr(t.x - 0.6, t.y - 0.6), b: pr(t.x + 0.6, t.y + 0.6) }; });
    say('  X1 drag ' + J(ex) + ' element at start: ' + await pg.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '#' + e.id + '.' + e.className : null; }, ex.a[0], ex.a[1]) + ' tool=' + await pg.evaluate(() => window.DxfMetaEditor.state.tool));
    await pg.mouse.move(ex.a[0], ex.a[1]); await pg.mouse.down(); await pg.mouse.move(ex.b[0], ex.b[1], { steps: 8 }); await pg.mouse.up(); await sleep(300);
    await idle(pg);
    const xm = await pg.evaluate(n => { const sh = window.DxfMetaEditor.state.sheets.find(s => s.name === n); const m = sh.marks.find(q => q.key === 'EXCLUDE'); return m ? { value: m.value, source: m.source } : null; }, ex.sheet);
    check('X1 EXCLUDE', 'dragging a box with the Exclude tool does not write @EXCLUDE on that sheet', !!xm && xm.source === 'user' && xm.value.split(',').length === 4, 'sheet=' + ex.sheet + ' mark=' + J(xm));
    await clk(pg, '[data-act="tool"][data-tool="exclude"]').catch(() => {});
    if (xm) await pg.evaluate(() => { const b = Array.from(document.querySelectorAll('[data-act="rm"]')).find(x => /@EXCLUDE=/.test(x.parentElement.textContent)); b.click(); });
    await idle(pg);
  }

  // ================= E5 (a): Duplex blocked -> Convert disabled, forced convert refused =================
  const e5a = await pg.evaluate(async () => { const b = document.getElementById('dxf-convert'), before = window.Bonsai.oplog.length, dis = b.disabled, st = document.getElementById('dxf-status').textContent;
    const r = await window.DxfImportUI.convert(); return { dis, st, refused: !!(r && r.refused), before, after: window.Bonsai.oplog.length }; });
  check('E5 BLOCKED', 'Convert is enabled (or a convert runs) while the verdict is blocked', e5a.dis && e5a.refused && e5a.before === e5a.after, J(e5a));
  await pg.close();

  // ================= E2: stripped -> fill through the UI =================
  const SD = path.join(TMP, 'stripped'); fs.mkdirSync(SD, { recursive: true });
  const STRIPPED = SET.map(f => { const o = path.join(SD, path.basename(f)); fs.writeFileSync(o, stripMarks(fs.readFileSync(f, 'utf8'))); return o; });
  STRIPPED.forEach(f => { const n = MK.readMarks(parse(fs.readFileSync(f, 'utf8')).entities).length; if (n) throw new Error('strip left ' + n + ' marks in ' + f); });
  const pg2 = await newPage(t, 'fill');
  const DL = path.join(TMP, 'saved'); await setDownloads(pg2, DL);
  const v2a = await openSet(pg2, STRIPPED);
  await ensureSec(pg2, 'units');
  const red = await pg2.evaluate(() => { const S = window.DxfMetaEditor.state, P = document.getElementById('dm-panel');
    return { sheets: S.sheets.map((s, i) => ({ n: s.name, roleRed: !!P.querySelector('[data-card="' + i + '"] .dm-role.need'), viewRed: !!P.querySelector('[data-card="' + i + '"] select[data-key="VIEW"].need') })),
      unitsRed: P.querySelectorAll('select[data-key="UNITS"].need').length, props: S.sheets.reduce((n, s) => n + (s.prop ? s.prop.list.length : 0), 0) }; });
  check('E2 RED', 'a raw sheet does not show its missing role / units as red blanks', red.sheets.every(s => s.roleRed && s.viewRed) && red.unitsRed === 7,
    'role+view red=' + red.sheets.filter(s => s.roleRed && s.viewRed).length + '/7 units red=' + red.unitsRed + ' verdict blocking=' + v2a.nB + ' ' + sortObj(v2a.counts) + ' proposals listed=' + red.props);
  await pg2.screenshot({ path: path.join(SHOTS, 'l4_editor_raw.png') });
  // fill: the marked set's values, sheet by sheet, through selects / typing / Add clicks
  const orig = {}; SET.forEach(f => { orig[path.basename(f)] = MK.readMarks(parse(fs.readFileSync(f, 'utf8')).entities).map(m => { const p = /^@([A-Z]+)=(.*)$/.exec(m.raw.replace(/\s+@BY=\S+$/, '')); return { key: p[1], value: p[2], x: m.x, y: m.y }; }); });
  let actions = 0, k = 0;
  for (const f of SET) {
    const name = path.basename(f), si = await sheetIdx(pg2, name), M = orig[name];
    await ensureSec(pg2, 'sheets'); await ensureCard(pg2, si);
    const one = key => M.find(m => m.key === key);
    await pg2.select('select[data-act="single"][data-key="VIEW"][data-sheet="' + si + '"]', one('VIEW').value); actions++; await sleep(200);
    for (const key of ['SET', 'NAME', 'LEVEL', 'ROOF']) { const m = one(key); if (!m) continue; await typeInto(pg2, 'input[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); actions++; }
    for (const key of ['FACE', 'HAXIS']) { const m = one(key); if (!m) continue; await pg2.select('select[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); actions++; await sleep(150); }
    for (const m of M.filter(q => /^GRID|^Z$/.test(q.key))) {
      const grp = m.key === 'Z' ? 'Z' : m.key === 'GRIDH' ? 'GRIDH' : 'GRID';
      if (grp === 'GRID') await pg2.select('select[data-add-key="' + si + '-GRID"]', m.key);
      await pg2.type('input[data-add-val="' + si + '-' + grp + '"]', m.value);
      await pg2.type('input[data-add-pos="' + si + '-' + grp + '"]', String(m.key === 'GRIDY' || m.key === 'Z' ? m.y : m.x));
      await clk(pg2, 'button[data-act="add"][data-sheet="' + si + '"][data-group="' + grp + '"]'); actions++; await sleep(150);
    }
    const left = M.filter(m => ['VIEW', 'SET', 'NAME', 'LEVEL', 'ROOF', 'FACE', 'HAXIS', 'UNITS'].indexOf(m.key) < 0 && !/^GRID|^Z$/.test(m.key));
    if (left.length) say('  (no UI path used for ' + left.map(m => m.key).join(',') + ' on ' + name + ')');
    await ensureSec(pg2, 'units');
    await pg2.select('select[data-act="single"][data-key="UNITS"][data-sheet="' + si + '"]', one('UNITS').value); actions++; await sleep(150);
    if (++k === 3) { await sleep(400); await pg2.screenshot({ path: path.join(SHOTS, 'l4_editor_midfill.png') }); }
  }
  const v2 = await idle(pg2);
  say('filled through ' + actions + ' UI actions; page verdict ' + v2.verdict + ' blocking=' + v2.nB + ' advisory=' + v2.nA + ' pipeline=' + J(v2.pipeline).slice(0, 160));
  check('E2 VERDICT', 'the filled set\'s live verdict differs from the marked set\'s (counts by code)', sortObj(v2.counts) === sortObj(v1.counts) && v2.nA === v1.nA, 'filled=' + sortObj(v2.counts) + ' adv=' + v2.nA);
  const byOk = await pg2.evaluate(() => window.DxfMetaEditor.state.byOk);
  await pg2.click('#dm-save');
  const saved = await waitFiles(DL, 7);
  say('saved: ' + saved.join(', '));
  const bad2 = [];
  SET.forEach(f => { const n = path.basename(f), sn = n.replace(/\.dxf$/i, '').replace(/_marked$/i, '') + '_marked.dxf', p = path.join(DL, sn);
    if (!fs.existsSync(p)) { bad2.push(n + ': no saved copy ' + sn); return; }
    const a = canonMarks(fs.readFileSync(f, 'utf8')), b = canonMarks(fs.readFileSync(p, 'utf8'));
    if (J(a) !== J(b)) bad2.push(n + ': ' + J(a.filter(x => b.indexOf(x) < 0)) + ' vs ' + J(b.filter(x => a.indexOf(x) < 0)));
    if (fs.readFileSync(STRIPPED[SET.indexOf(f)], 'utf8') !== stripMarks(fs.readFileSync(f, 'utf8'))) bad2.push(n + ': opened file changed'); });
  check('E2 SAVED', 'a saved copy\'s markings differ from the original markings (canonical key/value/position per sheet), or a copy is missing', bad2.length === 0 && saved.length === 7, bad2.length ? bad2.join(' ; ') : '7 copies, markings equal');
  const byAll = SET.every(f => { const n = path.basename(f), p = path.join(DL, n.replace(/\.dxf$/i, '').replace(/_marked$/i, '') + '_marked.dxf'); return fs.existsSync(p) && MK.readMarks(parse(fs.readFileSync(p, 'utf8')).entities).every(m => / @BY=user$/.test(m.raw)); });
  if (byOk) check('E2 BY', 'a user-entered marking is saved without @BY=user', byAll, 'grammar accepts @BY');
  else gap('E2 BY', 'the synced Dxf2Marks (BIMCompiler ' + cp.execFileSync('git', ['-C', BC, 'log', '-1', '--format=%h'], { encoding: 'utf8' }).trim() + ') does not accept the " @BY=user" suffix yet (lane §L2.7 pending): written WITHOUT it, as §L4.1 states; flips when re-synced');
  await pg2.close();
  const pg3 = await newPage(t, 'reimport');
  const v3 = await openSet(pg3, saved.map(n => path.join(DL, n)));
  check('E2 REIMPORT', 'the saved copies re-imported give another verdict than the marked set', sortObj(v3.counts) === sortObj(v1.counts) && v3.nA === v1.nA, 'reimport=' + sortObj(v3.counts) + ' adv=' + v3.nA);
  await pg3.close();

  // ================= E3: an unconfirmed proposal never reaches the file =================
  const pg4 = await newPage(t, 'propose');
  const DL4 = path.join(TMP, 'saved_e3'); await setDownloads(pg4, DL4);
  await openSet(pg4, STRIPPED);
  await ensureSec(pg4, 'units');
  const gfI = await sheetIdx(pg4, 'DX_FLOOR_GF_marked.dxf');
  const props = await pg4.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => ({ n: s.name, p: s.prop.list.map(q => q.rule + ':@' + q.key + '=' + q.value) })));
  await pg4.click('[data-act="confirm"][data-sheet="' + gfI + '"][data-pi="' + (await pg4.evaluate(i => window.DxfMetaEditor.state.sheets[i].prop.list.findIndex(q => q.key === 'UNITS'), gfI)) + '"]');
  const v5 = await idle(pg4);
  await pg4.click('#dm-save');
  const saved4 = await waitFiles(DL4, 7);
  const got4 = {}; saved4.forEach(n => { got4[n] = MK.readMarks(parse(fs.readFileSync(path.join(DL4, n), 'utf8')).entities).map(m => m.raw); });
  const nProps = props.reduce((n, s) => n + s.p.length, 0);
  const only = Object.keys(got4).every(n => n === 'DX_FLOOR_GF_marked.dxf' ? got4[n].length === 1 && /^@UNITS=mm( @BY=user)?$/.test(got4[n][0]) : got4[n].length === 0);
  check('E3 UNCONFIRMED', 'an unticked suggestion reached a saved file (or the ticked one did not)', only && nProps > 1 && saved4.length === 7 && !v5.blocking.some(x => x.code === 'QF:units_unstated' && x.sheet === 'DX_FLOOR_GF_marked.dxf'),
    'suggestions listed=' + nProps + ' (e.g. ' + props[0].p.slice(0, 4).join(' ; ') + ') ticked=GF PR-UNITS | saved markings ' + J(got4));
  await pg4.close();

  // ================= E5 (b): the real std Duplex set (8 sheets; BIMCompiler chain std2d.py --door-ops -> mark_dx_set.js std -> DXSET=std rosetta_dx_shell.js) =================
  const STDF = ['marked_std/DX_FLOOR_GF_marked.dxf', 'marked_std/DX_FLOOR_FF_marked.dxf', 'marked_std_shell/DX_FRONT_shell.dxf', 'marked_std_shell/DX_REAR_shell.dxf',
    'marked_std_shell/DX_LEFT_shell.dxf', 'marked_std_shell/DX_RIGHT_shell.dxf', 'marked_std/DX_ROOF_marked.dxf', 'marked_std/DX_SECTION_marked.dxf'].map(f => path.join(OUT, f));
  const SG = JSON.parse(fs.readFileSync(path.join(OUT, 'marked_std_shell', 'dx_shell_gaps.json'), 'utf8'));
  const stdName = id => path.basename(STDF.find(f => idOf(path.basename(f)) === id));
  const sStale = Object.keys(SG.inputs).filter(k => SG.inputs[k] !== sha(fs.readFileSync(STDF.find(f => idOf(path.basename(f)) === k), 'utf8')));
  check('E5 std inputs fresh', 'the Node std gaps were computed on other files than the ones opened', sStale.length === 0, SG.gaps.length + ' gap records, stale=' + J(sStale));
  subset('_std');   // the std run's subset (the page reads ONE local subset file)
  const pg5 = await newPage(t, 'std');
  await openSet(pg5, STDF);
  await ensureSec(pg5, 'layers');
  const v6 = await idle(pg5);
  const g6 = await pg5.evaluate(() => ({ dis: document.getElementById('dxf-convert').disabled, st: document.getElementById('dxf-status').textContent, set: window.DxfImportUI.state.gate.set,
    setFrom: window.DxfImportUI.state.gate.setFrom, roles: window.DxfImportUI.state.sheets.map(s => s.name + ':' + s.role), shown: window.DxfMetaEditor.state.verdict.verdict }));
  say('std page verdict: ' + v6.verdict + ' blocking=' + v6.nB + ' advisory=' + v6.nA + ' ' + sortObj(v6.counts) + ' pipeline=' + J(v6.pipeline).slice(0, 120) + ' | set ' + g6.set + ' (' + g6.setFrom + ') roles ' + J(g6.roles) + ' | Convert disabled=' + g6.dis);
  check('E5 GATE', 'Convert state disagrees with the verdict the editor shows (enabled while blocked, or disabled while it qualifies)', (v6.verdict === 'qualifies') === !g6.dis && g6.shown === v6.verdict && v6.pipeline.ran,
    'verdict=' + v6.verdict + ' disabled=' + g6.dis + ' status="' + g6.st + '"');
  check('E5 STD QUALIFIES', 'the std set (Node: qualifies, 0 blocking) is not shown as qualifying in the editor', v6.verdict === 'qualifies' && v6.nB === 0, 'blocking=' + v6.nB + ' advisory=' + v6.nA);
  if (!g6.dis) {   // the enabled button converts (real click): one gesture lands
    const before = await pg5.evaluate(() => window.Bonsai.oplog.length);
    await clk(pg5, '#dxf-convert');
    await pg5.waitForFunction('window.DxfImportUI.state.last', { timeout: 600000 });
    const after = await pg5.evaluate(() => ({ n: window.Bonsai.oplog.length, last: { inserts: window.DxfImportUI.state.last.nInserts, cuts: window.DxfImportUI.state.last.nCuts, run_id: window.DxfImportUI.state.last.run_id } }));
    check('E5 CONVERT', 'the enabled Convert does not convert the qualifying set', after.n > before && after.last.inserts > 0, 'op-log ' + before + '->' + after.n + ' ' + J(after.last));
  }
  await pg5.screenshot({ path: path.join(SHOTS, 'l4_editor_std.png') });
  await pg5.close();
  say('screenshots: ' + ['l4_editor_filled.png', 'l4_editor_verdict_zoom.png', 'l4_editor_raw.png', 'l4_editor_midfill.png', 'l4_editor_std.png'].map(f => path.join(SHOTS, f)).join(' , '));
  say('SUMMARY fail=' + fail + ' gap=' + gapN);
  t.assert('W-DXF-META checks', fail === 0, 'fail=' + fail + ' gap=' + gapN);
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
}, { width: 1400, height: 900 });
process.on('exit', () => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n'); } catch (e) {} });
