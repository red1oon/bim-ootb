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
 *   E6 LAYERS     §L4.2: the old set's unmapped layers mapped in the Layers UI -> exactly the layer_unmapped items go; saved copies carry those
 *                 @LAYER=… @BY=user markings; re-import restores the mapping ("you", same types, no red) and the verdict. Issue: a layer map that does not travel.
 *   T1/X1         UI sanity: Tag tool click on the canvas writes @TAG at the entity centre; Exclude tool drag writes @EXCLUDE.
 *   E7 RAW→QUALIFIES §L4.3: the std set with DXF2BIM-MARK stripped, EVERYTHING filled through the UI incl. the Doors section (schedule rows
 *                 typed, 14 door tags by canvas clicks) -> blocked 28 -> qualifies; saved markings == the marked std set's; Convert == E5's
 *                 conversion element for element. E7-FALSIFY one schedule height mistyped -> exactly that mark's doors block. E7 PROPOSE:
 *                 schedule / tag texts drawn in a plan are suggested, never written until ticked. Issue: a raw drawing cannot reach "Qualifies"
 *                 through the editor, or the doors it fills differ from the stated ones.
 *   E7 WINDOW-PICKS §L4.4: the 12 stacked FF windows are tagged by real clicks on their glazing in the 4 elevations (z from the elevation,
 *                 never typed); each pick = the plan position (0.01 drawing units) + z of the marked set's tag. E7-ELEV-FALSIFY: a click on an
 *                 elevation wall line tags nothing and shows why. Issue: a stacked window cannot be stated in the editor, or is stated wrong.
 * W_ONLY=E7 runs E0 + E5(b) + E7 only (development); the recorded log is the full run.
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
const ONLY = process.env.W_ONLY || '';
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

  if (!ONLY) {
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
    for (const key of ['SET', 'NAME', 'LEVEL', 'ROOF']) { const m = one(key); if (!m) continue; await idle(pg2); await typeInto(pg2, 'input[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); actions++; }
    for (const key of ['FACE', 'HAXIS']) { const m = one(key); if (!m) continue; await pg2.select('select[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); actions++; await sleep(150); }
    for (const m of M.filter(q => /^GRID|^Z$/.test(q.key))) {
      await idle(pg2);   // a user types the row once the panel has settled (a verdict landing re-renders the panel; puppeteer element handles would go stale)
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

  // ================= E6 (§L4.2): layer choices are @LAYER markings: mapped through the UI -> saved -> re-imported (round trip) =================
  {
    const pg6 = await newPage(t, 'layers');
    const DL6 = path.join(TMP, 'saved_e6'); await setDownloads(pg6, DL6);
    const v60 = await openSet(pg6, SET);
    await ensureSec(pg6, 'layers');
    const chosen = [];
    for (let guard = 0; guard < 80; guard++) {
      const nx = await pg6.evaluate(() => { const e = document.querySelector('select[data-act="layer"].need'); return e ? [e.getAttribute('data-role'), e.getAttribute('data-layer')] : null; });
      if (!nx) break;
      const ch = nx[1] === 'A-GRID' ? 'grid' : nx[1] === 'A-ANNO-DIMS' ? 'dims' : 'ignore';
      await pg6.select('select[data-act="layer"][data-role="' + nx[0] + '"][data-layer="' + nx[1] + '"]', ch); chosen.push([nx[0], nx[1], ch]); await sleep(150);
    }
    const v61 = await idle(pg6);
    const k0 = new Set(v60.blocking.map(keyOf)), un = v60.blocking.filter(x => x.code === 'QF:layer_unmapped').map(keyOf);
    const gone = v60.blocking.filter(x => !new Set(v61.blocking.map(keyOf)).has(keyOf(x))).map(keyOf), nw = v61.blocking.filter(x => !k0.has(keyOf(x)));
    const lr = await pg6.evaluate(() => (window.DxfImportUI.state.gate.verdict.layer_rules || []).map(r => r.sheet + '|' + r.layer + '|' + r.type + '|' + r.source));
    check('E6 MAPPED', 'mapping the unmapped layers through the UI does not remove exactly the layer_unmapped items (or adds others), or the verdict does not list them as user-stated',
      chosen.length > 0 && un.length === v60.counts['QF:layer_unmapped'] && J(gone.sort()) === J(un.sort()) && nw.length === 0 && lr.length > 0 && lr.every(x => /\|user$/.test(x)),
      'choices=' + chosen.length + ' ' + J(chosen.slice(0, 6)) + ' layer_unmapped ' + un.length + ' -> gone ' + gone.length + ', new=' + nw.length + ' | layer_rules=' + lr.length + ' e.g. ' + J(lr.slice(0, 3)));
    const want = await pg6.evaluate(() => { const o = {}; window.DxfMetaEditor.state.sheets.forEach(sh => { o[window.DxfMetaEditor.saveName(sh.name)] = sh.marks.filter(m => m.key === 'LAYER').map(m => '@LAYER=' + m.value).sort(); }); return o; });
    await clk(pg6, '#dm-save');
    const saved6 = await waitFiles(DL6, 7);
    const bad6 = [];
    saved6.forEach(n => { const raws = MK.readMarks(parse(fs.readFileSync(path.join(DL6, n), 'utf8')).entities).map(m => m.raw).filter(r => /^@LAYER=/.test(r));
      const got = raws.map(r => r.replace(/\s+@BY=\S+$/, '')).sort();
      if (J(got) !== J(want[n] || [])) bad6.push(n + ' got ' + J(got) + ' want ' + J(want[n]));
      if (!raws.every(r => / @BY=user$/.test(r))) bad6.push(n + ' a @LAYER without @BY=user'); });
    check('E6 SAVED', 'a saved copy lacks the @LAYER markings the user chose (or carries others, or without @BY=user)', bad6.length === 0 && saved6.length === 7,
      bad6.length ? bad6.join(' ; ') : J(Object.keys(want).map(k => k + ':' + want[k].length)));
    await pg6.close();
    const pg7 = await newPage(t, 'layers-reimport');
    const v7 = await openSet(pg7, saved6.map(n => path.join(DL6, n)));
    await ensureSec(pg7, 'layers');
    const shown = await pg7.evaluate(ch => ch.map(([role, layer, c]) => { const sel = document.querySelector('select[data-act="layer"][data-role="' + role + '"][data-layer="' + layer + '"]');
      const src = sel && sel.parentElement.querySelector('[data-src]'); return [role, layer, sel ? sel.value : null, src ? src.getAttribute('data-src') : null, c]; }), chosen);
    const red7 = await pg7.evaluate(() => document.querySelectorAll('select[data-act="layer"].need').length);
    const badShown = shown.filter(x => x[2] !== x[4] || x[3] !== 'user');
    check('E6 ROUND-TRIP', 'the re-imported copies do not restore the layer mapping (type or "you" source lost, a layer red again) or give another verdict',
      badShown.length === 0 && red7 === 0 && sortObj(v7.counts) === sortObj(v61.counts) && v7.nA === v61.nA, 'restored ' + (shown.length - badShown.length) + '/' + shown.length + (badShown.length ? ' bad=' + J(badShown.slice(0, 4)) : '') + ' red=' + red7 + ' verdict ' + v7.nB + '/' + v7.nA + ' vs ' + v61.nB + '/' + v61.nA);
    await pg7.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.sheets = false; S.sec.units = false; S.sec.verdict = false; });
    await clk(pg7, '[data-act="sec"][data-sec="layers"]'); await clk(pg7, '[data-act="sec"][data-sec="layers"]');
    await pg7.evaluate(() => { const r = document.querySelector('[data-layer-row^="elev|"] select'); if (r) r.scrollIntoView({ block: 'center' }); }); await sleep(500);
    await pg7.screenshot({ path: path.join(SHOTS, 'l4_editor_layers_reimport.png') });
    await pg7.close();
  }

  }   // !ONLY

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
  const elSig = () => window.DxfImportUI.state.gate.R.els.map(e => { const v = e.vertices, m = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) { m[a] = Math.min(m[a], v[i + a]); m[a + 3] = Math.max(m[a + 3], v[i + a]); }
    return e.class + '|' + e.storey + '|' + m.map(x => x.toFixed(3)).join(','); }).sort();
  const ref5 = { els: await pg5.evaluate(elSig), adv: v6.advisory.reduce((o, x) => (o[x.code] = (o[x.code] || 0) + 1, o), {}), nA: v6.nA, last: null };
  if (!g6.dis) {   // the enabled button converts (real click): one gesture lands
    const before = await pg5.evaluate(() => window.Bonsai.oplog.length);
    await clk(pg5, '#dxf-convert');
    await pg5.waitForFunction('window.DxfImportUI.state.last', { timeout: 600000 });
    const after = await pg5.evaluate(() => ({ n: window.Bonsai.oplog.length, last: { inserts: window.DxfImportUI.state.last.nInserts, cuts: window.DxfImportUI.state.last.nCuts, run_id: window.DxfImportUI.state.last.run_id } }));
    check('E5 CONVERT', 'the enabled Convert does not convert the qualifying set', after.n > before && after.last.inserts > 0, 'op-log ' + before + '->' + after.n + ' ' + J(after.last));
    ref5.last = await pg5.evaluate(() => { const L = window.DxfImportUI.state.last; return { inserts: L.nInserts, cuts: L.nCuts, counts: L.counts, ops: window.Bonsai.oplog.length }; });
    ref5.last.ops -= before;
    // test isolation: the browser profile is shared by every page of this run and the op-log autosaves per origin (bonsai_oplog.js);
    // a converted model does not survive a reload (rg: meshes are per session, §L3 Not claimed), so E7 starts from an empty op-log
    await pg5.evaluate(() => window.Bonsai.oplog.clear()); await sleep(800);
    say('E5 op-log cleared after the reference conversion (shared browser profile; E7 converts on a fresh page)');
  }
  await pg5.screenshot({ path: path.join(SHOTS, 'l4_editor_std.png') });
  await pg5.close();

  // ================= E7 (§L4.3): the RAW std set -> everything through the UI incl. the Doors section -> Qualifies -> Convert == the marked std set =================
  {
    const RAWD = path.join(TMP, 'raw_std'); fs.mkdirSync(RAWD, { recursive: true });
    const rawName = f => idOf(path.basename(f)) + '_std.dxf';
    const RAWF = STDF.map(f => { const o = path.join(RAWD, rawName(f)); fs.writeFileSync(o, stripMarks(fs.readFileSync(f, 'utf8'))); return o; });
    const eqStd = RAWF.map(f => { const src = path.join(BC, '2D_Layout/output/STD', path.basename(f)); return path.basename(f) + (fs.existsSync(src) ? (fs.readFileSync(src, 'utf8') === fs.readFileSync(f, 'utf8') ? ' == std2d output' : ' != std2d output') : ' (no std2d file)'); });
    say('E7 raw set = the marked std sheets with DXF2BIM-MARK stripped by this witness: ' + eqStd.join(', '));
    // the user's knowledge, stated: the marked std set's own markings (model-derived, @BY=model; §L2.6 C for the schedule and tags)
    const ORIG = {}; STDF.forEach((f, i) => { ORIG[path.basename(RAWF[i])] = MK.readMarks(parse(fs.readFileSync(f, 'utf8')).entities).map(m => { const p = /^@([A-Z]+)=(.*)$/.exec(m.raw.replace(/\s+@BY=\S+$/, '')); return { key: p[1], value: p[2], x: m.x, y: m.y }; }); });
    const SCHED = {}; Object.values(ORIG).forEach(M => M.filter(m => m.key === 'SCHEDULE').forEach(m => { const q = m.value.split(','); SCHED[q[0]] = { w: q[2], h: q[3] }; }));
    say('E7 user knowledge (stated): door schedule ' + J(SCHED) + ' = the std set\'s @SCHEDULE (IFC OverallWidth/OverallHeight via door_operation, §L2.6 C); door marks = its @TAG per door; every other value = its markings');
    const pgE = await newPage(t, 'raw7');
    const DL7 = path.join(TMP, 'saved_e7'); await setDownloads(pgE, DL7);
    const v70 = await openSet(pgE, RAWF);
    say('E7 op-log at open: ' + await pgE.evaluate(() => window.Bonsai.oplog.length) + ' ops');
    say('E7 opened raw: verdict ' + v70.verdict + ' blocking=' + v70.nB + ' ' + sortObj(v70.counts));
    const act = { select: 0, typed: 0, click: 0, canvas: 0, tick: 0 };
    for (const f of RAWF) {
      const name = path.basename(f), si = await sheetIdx(pgE, name), M = ORIG[name], one = key => M.find(m => m.key === key);
      await ensureSec(pgE, 'sheets'); await ensureCard(pgE, si);
      await pgE.select('select[data-act="single"][data-key="VIEW"][data-sheet="' + si + '"]', one('VIEW').value); act.select++; await sleep(200);
      for (const key of ['SET', 'NAME', 'LEVEL', 'ROOF', 'CUT']) { const m = one(key); if (!m) continue; await idle(pgE); await typeInto(pgE, 'input[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); act.typed++; }
      for (const key of ['FACE', 'HAXIS']) { const m = one(key); if (!m) continue; await pgE.select('select[data-act="single"][data-key="' + key + '"][data-sheet="' + si + '"]', m.value); act.select++; await sleep(150); }
      for (const m of M.filter(q => /^GRID|^Z$/.test(q.key))) {
        await idle(pgE);
        const grp = m.key === 'Z' ? 'Z' : m.key === 'GRIDH' ? 'GRIDH' : 'GRID';
        if (grp === 'GRID') { await pgE.select('select[data-add-key="' + si + '-GRID"]', m.key); act.select++; }
        await pgE.type('input[data-add-val="' + si + '-' + grp + '"]', m.value); act.typed++;
        await pgE.type('input[data-add-pos="' + si + '-' + grp + '"]', String(m.key === 'GRIDY' || m.key === 'Z' ? m.y : m.x)); act.typed++;
        await clk(pgE, 'button[data-act="add"][data-sheet="' + si + '"][data-group="' + grp + '"]'); act.click++; await sleep(150);
      }
      await ensureSec(pgE, 'units');
      await pgE.select('select[data-act="single"][data-key="UNITS"][data-sheet="' + si + '"]', one('UNITS').value); act.select++; await sleep(150);
      const left = M.filter(m => ['VIEW', 'SET', 'NAME', 'LEVEL', 'ROOF', 'CUT', 'FACE', 'HAXIS', 'UNITS', 'WALLTOP', 'SCHEDULE', 'TAG'].indexOf(m.key) < 0 && !/^GRID|^Z$/.test(m.key));
      if (left.length) say('  E7 no UI path used for ' + left.map(m => m.key).join(',') + ' on ' + name);
    }
    const v71 = await idle(pgE);
    const redLayers = await pgE.evaluate(() => document.querySelectorAll('select[data-act="layer"].need').length);
    say('E7 sheets + units filled: verdict ' + v71.verdict + ' blocking=' + v71.nB + ' ' + sortObj(v71.counts) + ' | unmapped layers (red)=' + redLayers);
    // wall tops: the convention per plan (tick; the level field defaults to the plan's @LEVEL), per-wall tops where the UI lists the wall
    await ensureSec(pgE, 'walltops');
    const notListed = [];
    for (const f of RAWF) {
      const name = path.basename(f), si = await sheetIdx(pgE, name), M = ORIG[name];
      for (const m of M.filter(q => q.key === 'WALLTOP')) {
        if (/,slab_above$/.test(m.value)) {
          const lvl = m.value.split(',')[0], cur = await pgE.$eval('#dm-wt-' + si, e => e.value);
          if (cur !== lvl) { await typeInto(pgE, '#dm-wt-' + si, lvl); act.typed++; }
          await clk(pgE, '[data-act="walltop"][data-sheet="' + si + '"]'); act.tick++; await idle(pgE);
        } else {
          const hd = m.value.slice(7).split(',')[0], z = m.value.split(',')[1];
          const has = await pgE.$('input[data-act="wallz"][data-sheet="' + si + '"][data-h="' + hd + '"]');
          if (has) { await typeInto(pgE, 'input[data-act="wallz"][data-sheet="' + si + '"][data-h="' + hd + '"]', z); act.typed++; await idle(pgE); }
          else notListed.push(name.replace(/_std\.dxf$/, '') + ' ' + hd + ' (' + m.value + ')');
        }
      }
    }
    say('E7 per-wall @WALLTOP not asked by the UI (the wall has a height from the drawings; applyWallTops applies a per-wall top only to a height gap): ' + (notListed.join(', ') || 'none'));
    const v72 = await idle(pgE);
    say('E7 before the Doors section: verdict ' + v72.verdict + ' blocking=' + v72.nB + ' ' + sortObj(v72.counts));
    // §L4.4: + the 12 stacked windows whose product the drawing cannot tell (GAP:fill_unbound, FF plan) until they are tagged below
    const nWin = Object.values(ORIG).reduce((n, M) => n + M.filter(m => m.key === 'TAG' && /^window,/.test(m.value)).length, 0);
    const doorB = v72.blocking.filter(x => (x.code === 'GAP:no_elevation_height' || x.code === 'GAP:no_host_cut') && /DOOR/.test((x.detail && x.detail.layer) || '')), winB = v72.blocking.filter(x => x.code === 'GAP:fill_unbound');
    check('E7 BLOCKED-BY-DOORS+WINDOWS', 'after every non-door, non-tag field the raw set is not blocked by exactly the doors (no_elevation_height + no_host_cut per door) and the untagged stacked windows (fill_unbound)',
      doorB.length > 0 && winB.length === nWin && nWin === 12 && doorB.length + winB.length === v72.nB, 'blocking=' + v72.nB + ' ' + sortObj(v72.counts) + ' | doors ' + doorB.length + ', windows ' + winB.length + ' of ' + nWin + ' window tags');
    // ---- Doors: the schedule typed, then each door tagged on the canvas ----
    await pgE.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.sheets = false; S.sec.units = false; S.sec.walltops = false; S.sec.layers = false; S.sec.verdict = false; });
    await ensureSec(pgE, 'doors');
    for (const mk of Object.keys(SCHED).sort()) {
      await idle(pgE);
      await pgE.type('#dm-ds-mark', mk); await pgE.type('#dm-ds-w', SCHED[mk].w); await pgE.type('#dm-ds-h', SCHED[mk].h); act.typed += 3;
      await clk(pgE, '[data-act="dsadd"]'); act.click++; await sleep(200);
    }
    await idle(pgE);
    const rows7 = await pgE.evaluate(() => window.DxfMetaEditor.schedRows().map(r => r.mark + ' ' + r.w + 'x' + r.h + ' ' + r.src));
    say('E7 schedule rows: ' + J(rows7));
    await clk(pgE, '[data-act="tool"][data-tool="door"]'); act.click++;
    const tagged = [], tagFail = [];
    let nTag = 0;
    for (const f of RAWF) {
      const name = path.basename(f), tags = ORIG[name].filter(m => m.key === 'TAG' && /^door,/.test(m.value));   // §L4.4: window tags are picked in the elevations below
      for (const tg of tags) {
        const mark = tg.value.split(',').slice(1).join(',');
        // the door this tag names (the reader rule: the door whose swing box or opening box holds the tag point)
        const door = await pgE.evaluate((n, x, y) => { const D = window.DxfMetaEditor.doorsOf(n), P = [x * D.factor, y * D.factor], tol = D.snap_tol;
          const inD = d => { const H = d.hinge, pts = [H].concat([d.swing_start_deg, d.swing_end_deg].map(a => [H[0] + d.width * Math.cos(a * Math.PI / 180), H[1] + d.width * Math.sin(a * Math.PI / 180)]));
            const sx = pts.map(q => q[0]), sy = pts.map(q => q[1]); if (P[0] >= Math.min(...sx) - tol && P[0] <= Math.max(...sx) + tol && P[1] >= Math.min(...sy) - tol && P[1] <= Math.max(...sy) + tol) return true;
            const b = d.opening_box; if (!b) return false; const u = b.axis === 'x' ? P[0] : P[1], v = b.axis === 'x' ? P[1] : P[0], L = b.along || b.s; return u >= L[0] - tol && u <= L[1] + tol && v >= b.band[0] - tol && v <= b.band[1] + tol; };
          const h = D.doors.filter(inD); return h.length === 1 ? h[0].handle : null; }, name, tg.x, tg.y);
        if (!door) { tagFail.push(name + ' tag ' + mark + ' at ' + tg.x + ',' + tg.y + ': no unique door'); continue; }
        // frame the door (its row in the door list), then a real click on its arc on the canvas
        await clk(pgE, '[data-act="dzoom"][data-door="' + name + '|' + door + '"]'); await sleep(500);
        let picked = null;
        const segN = await pgE.evaluate((n, h) => (window.DxfImportUI.state.canvas[n].segOf[h] || []).length / 6, name, door);
        for (const k of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const px = await pgE.evaluate((n, h, k) => { const s = window.DxfImportUI.state.canvas[n].segOf[h], i = Math.min(Math.floor(s.length / 6 * k), s.length / 6 - 1) * 6;
            const v = new window.THREE.Vector3((s[i] + s[i + 3]) / 2, (s[i + 1] + s[i + 4]) / 2, (s[i + 2] + s[i + 5]) / 2).project(window.A.camera), r = window.A.renderer.domElement.getBoundingClientRect();
            return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, name, door, k);
          await pgE.mouse.click(px[0], px[1]); act.canvas++; await sleep(300);
          picked = await pgE.evaluate(() => window.DxfMetaEditor.state.dpick);
          if (picked && picked.handle === door && picked.sheet === name) break;
          say('  E7 canvas click on door ' + door + ' (' + name + ', arc segment ' + k + ' of ' + segN + ') picked ' + J(picked) + ' msg=' + J(await pgE.evaluate(() => window.DxfMetaEditor.state.dmsg)));
          picked = null;
        }
        if (!picked) { tagFail.push(name + ' door ' + door + ': canvas click never picked it'); continue; }
        await pgE.select('#dm-dt-sel', mark); act.select++;
        await clk(pgE, '[data-act="dtag"]'); act.click++; await sleep(150);
        tagged.push(name.replace(/_std\.dxf$/, '') + ':' + door + '=' + mark);
        if (++nTag === 7) { await idle(pgE); await pgE.evaluate(() => { const b = document.getElementById('dm-dpick') || document.querySelector('.dm-sched'); if (b) b.scrollIntoView({ block: 'start' }); }); await sleep(500);
          await pgE.screenshot({ path: path.join(SHOTS, 'l4_doors_schedule.png') }); }
      }
    }
    await clk(pgE, '[data-act="tool"][data-tool="door"]');   // tool off (not counted: closing a tool)
    // ---- §L4.4 Windows: the stacked windows tagged by clicking them IN THE ELEVATIONS (z from the elevation, never typed) ----
    // Where to click (answer key, stated): the elevation glazing cluster whose reader pick (Dxf2BimImport.elevPick on the MARKED set) lands on
    // a marked window tag's plan position (0.01 drawing units) and z. The page then decides everything from the user's markings alone.
    const IM = require(path.join(__dirname, '..', 'dxf2bim_import.js')), EL = require(path.join(__dirname, '..', 'dxf2bim', 'dxf2elev.js')), CF = require(path.join(__dirname, '..', 'dxf2bim', 'dxf2shell_config.js'));
    const mSheets = IM.readSheets(STDF.map(f => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') })), { hashHex: sha });
    const mPlans = mSheets.filter(q => q.role === 'plan').sort((a, b) => a.level - b.level), mElev = mSheets.filter(q => q.role === 'elev'), XS = IM.setWith('STD');
    const winTags = []; RAWF.forEach(f => ORIG[path.basename(f)].filter(m => m.key === 'TAG' && /^window,/.test(m.value)).forEach(m => winTags.push(Object.assign({ plan: path.basename(f) }, m))));
    const zOfV = v => Number((/z=([-\d.]+)/.exec(v) || [])[1]);
    const target = winTags.map(tg => { let hit = null;
      mElev.forEach(e => { const al = MK.align(mPlans[0].desc, e.desc, CF.MARK_ALIGN_TOL); EL.elevClusters(e.dxf.entities, MK.withLayers(XS.MAP_ELEV, e.desc), al.map, CF.CFG.snap_tol, 'glazing').forEach(c => {
        const r = IM.elevPick(mPlans, e, 'STD', c.handles[0]);
        if (r.ok && Math.abs(r.x - tg.x) <= 0.01 && Math.abs(r.y - tg.y) <= 0.01 && r.z === zOfV(tg.value)) hit = { elev: e.name.replace(/_marked\.dxf$|_shell\.dxf$/, '_std.dxf'), face: e.desc.face, handles: c.handles }; }); });
      return Object.assign({ hit }, tg); });
    say('E7 window tags to state (' + winTags.length + '), clicked in: ' + target.map(t => t.value.replace(/^window,/, '') + '@' + (t.hit ? t.hit.elev.replace(/_std\.dxf$/, '') + ':' + t.hit.handles.join('+') : 'NONE')).join(' '));
    await ensureSec(pgE, 'tags');
    await clk(pgE, '[data-act="tool"][data-tool="tag"]'); act.click++;
    // face an elevation (camera on the face's outward normal, 7 m out, at the handles' centre), panned clear of the editor panel
    const frameFace = (en, hs, face) => pgE.evaluate((n, hs, face) => { const c = window.DxfImportUI.state.canvas[n], P = []; hs.forEach(h => { (c.segOf[h] || []).forEach(v => P.push(v)); });
        const mid = [0, 1, 2].map(a => { let lo = Infinity, hi = -Infinity; for (let i = a; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return (lo + hi) / 2; });
        const nrm = { minY: [0, -1, 0], maxY: [0, 1, 0], minX: [-1, 0, 0], maxX: [1, 0, 0] }[face], T = window.THREE, A = window.A;
        A.camera.up.set(0, 0, 1); A.controls.target.set(mid[0], mid[1], mid[2]); A.camera.position.set(mid[0] + 7 * nrm[0], mid[1] + 7 * nrm[1], mid[2] + 7 * nrm[2]); A.controls.update(); A.camera.updateMatrixWorld();
        // pan clear of the editor panel, as the editor's own framing does (the free strip right of the panel)
        const cv = A.renderer.domElement.getBoundingClientRect(), Sp = window.DxfMetaEditor.state.panel, pr = Sp && Sp.style.display !== 'none' ? Sp.getBoundingClientRect().right : cv.left, dxPx = (pr + (cv.right - pr) / 2) - (cv.left + cv.width / 2);
        if (dxPx > 0) { const right = new T.Vector3().setFromMatrixColumn(A.camera.matrixWorld, 0), wpp = 2 * 7 * Math.tan(A.camera.fov * Math.PI / 360) / cv.height; right.multiplyScalar(-dxPx * wpp); A.camera.position.add(right); A.controls.target.add(right); A.controls.update(); A.camera.updateMatrixWorld(); }
        if (A.markDirty) A.markDirty(); if (A.requestRender) A.requestRender(); }, en, hs, face);
    const wPicks = [], wFail = [];
    for (const tg of target) {
      if (!tg.hit) { wFail.push(tg.value + ': no elevation cluster in the marked set'); continue; }
      const en = tg.hit.elev;
      await frameFace(en, tg.hit.handles, tg.hit.face);
      await sleep(400);
      let picked = null;
      for (const hh of tg.hit.handles) {
        for (const k of [0.5, 0.3, 0.7]) {
          const px = await pgE.evaluate((n, h, k) => { window.A.camera.updateMatrixWorld(); const s = window.DxfImportUI.state.canvas[n].segOf[h]; if (!s) return null; const i = Math.min(Math.floor(s.length / 6 * k), s.length / 6 - 1) * 6;
            const v = new window.THREE.Vector3((s[i] + s[i + 3]) / 2, (s[i + 1] + s[i + 4]) / 2, (s[i + 2] + s[i + 5]) / 2).project(window.A.camera), r = window.A.renderer.domElement.getBoundingClientRect();
            return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, en, hh, k);
          if (!px) continue;
          await pgE.mouse.click(px[0], px[1]); act.canvas++; await sleep(300);
          const pk = await pgE.evaluate(() => { const p = window.DxfMetaEditor.state.pick; return p ? { sheet: p.sheet, x: p.x, y: p.y, z: p.z, cls: p.cls, elev: p.elev, elevHandle: p.elevHandle } : null; });
          if (pk && pk.elev === en && tg.hit.handles.indexOf(pk.elevHandle) >= 0) { picked = pk; break; }
          say('  E7 window click on ' + en + ' handle ' + hh + ' (segment ' + k + ') picked ' + J(pk) + ' msg=' + J(await pgE.evaluate(() => window.DxfMetaEditor.state.tmsg)));
        }
        if (picked) break;
      }
      if (!picked) { wFail.push(tg.value + ': no click picked ' + en + ' ' + tg.hit.handles.join('+')); continue; }
      const val = tg.value.split(',').slice(2).join(',');
      await pgE.select('#dm-tag-val', val); act.select++;
      await clk(pgE, '[data-act="tagadd"]'); act.click++; await sleep(150);
      wPicks.push({ tag: tg.value, plan: picked.sheet, wantPlan: tg.plan, want: [tg.x, tg.y, zOfV(tg.value)], got: [picked.x, picked.y, picked.z], elev: en, h: picked.elevHandle, cls: picked.cls });
    }
    const dmax = wPicks.reduce((m, w) => Math.max(m, Math.abs(w.got[0] - w.want[0]), Math.abs(w.got[1] - w.want[1])), 0), zmax = wPicks.reduce((m, w) => Math.max(m, Math.abs(w.got[2] - w.want[2])), 0);
    wPicks.forEach(w => say('  E7 window ' + w.tag + ' <- ' + w.elev.replace(/_std\.dxf$/, '') + ':' + w.h + ' -> ' + w.plan.replace(/_std\.dxf$/, '') + ' at ' + w.got.join(',') + ' (marked ' + w.want.join(',') + ')'));
    const distinct = new Set(wPicks.map(w => w.got.join(','))).size;
    check('E7 WINDOW-PICKS', 'a click on a stacked window in an elevation does not resolve to the plan position + z of that window (or two clicks to the same one)',
      wFail.length === 0 && wPicks.length === winTags.length && winTags.length === 12 && distinct === 12 && wPicks.every(w => w.cls === 'window' && w.plan === w.wantPlan) && dmax <= 0.01 && zmax === 0,
      'picked ' + wPicks.length + '/' + winTags.length + ' distinct=' + distinct + ' max |Δx|,|Δy| = ' + dmax.toFixed(4) + ' drawing units (mm), max |Δz| = ' + zmax + ' m' + (wFail.length ? ' FAILED ' + J(wFail) : ''));
    // E7-ELEV-FALSIFY: a click on an elevation WALL line (not an opening) tags nothing and says why (not counted in the E7 actions)
    {
      const fr = target[0] && target[0].hit ? target[0].hit.elev : null;
      const wh = fr ? await pgE.evaluate(n => { const sh = window.DxfMetaEditor.state.sheets.find(s => s.name === n), c = window.DxfImportUI.state.canvas[n];
        const e = sh.dxf.entities.find(q => q.layer === 'A-WALL' && c.segOf[q.handle] && c.segOf[q.handle].length >= 6); return e ? e.handle : null; }, fr) : null;
      let fz = null;
      if (wh) {
        const before = await pgE.evaluate(() => window.DxfMetaEditor.state.sheets.reduce((n, s) => n + s.marks.filter(m => m.key === 'TAG').length, 0));
        await frameFace(fr, [wh], target[0].hit.face); await sleep(300);
        const px = await pgE.evaluate((n, h) => { window.A.camera.updateMatrixWorld(); const s = window.DxfImportUI.state.canvas[n].segOf[h], v = new window.THREE.Vector3((s[0] + s[3]) / 2, (s[1] + s[4]) / 2, (s[2] + s[5]) / 2).project(window.A.camera), r = window.A.renderer.domElement.getBoundingClientRect();
          return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, fr, wh);
        await pgE.mouse.click(px[0], px[1]); await sleep(300);
        fz = await pgE.evaluate(b => { const S = window.DxfMetaEditor.state; return { pick: S.pick, msg: S.tmsg, shown: !!document.getElementById('dm-tag-msg'), tags: S.sheets.reduce((n, s) => n + s.marks.filter(m => m.key === 'TAG').length, 0), before: b }; }, before);
      }
      check('E7-ELEV-FALSIFY', 'a click on an elevation wall line (not an opening) writes a tag or picks something instead of saying why',
        !!fz && !fz.pick && /^No tag: /.test(fz.msg || '') && fz.shown && fz.tags === fz.before, 'wall handle ' + wh + ' on ' + fr + ': ' + J(fz));
    }
    await clk(pgE, '[data-act="tool"][data-tool="tag"]');   // tool off (not counted)
    const v73 = await idle(pgE);
    const nActs = act.select + act.typed + act.click + act.canvas + act.tick;
    say('E7 doors tagged ' + tagged.length + ': ' + tagged.join(' ') + (tagFail.length ? ' | FAILED ' + J(tagFail) : ''));
    say('E7 UI actions=' + nActs + ' ' + J(act) + ' (selects, typed fields, Add/Tag/tool clicks, canvas clicks on doors and on elevation windows, ticks; door-list clicks that only frame a door and the camera framing of an elevation not counted)');
    const advE7 = v73.advisory.reduce((o, x) => (o[x.code] = (o[x.code] || 0) + 1, o), {});
    say('E7 verdict ' + v72.nB + ' blocking -> ' + v73.verdict + ' blocking=' + v73.nB + ' advisory=' + v73.nA + ' ' + sortObj(advE7) + ' | marked std (E5) advisory ' + ref5.nA + ' ' + sortObj(ref5.adv));
    check('E7 VERDICT', 'the raw std set filled through the UI does not qualify, or its advisory counts differ from the marked std set\'s', v73.verdict === 'qualifies' && v73.nB === 0 && sortObj(advE7) === sortObj(ref5.adv) && tagFail.length === 0,
      v72.nB + ' -> ' + v73.nB + ' blocking, advisory ' + v73.nA + ' vs ' + ref5.nA);
    // ---- E7-FALSIFY: one schedule height mistyped (0864: 2032 -> 2132) ----
    {
      const fm = Object.keys(SCHED).find(m => /^0864/.test(m)) || Object.keys(SCHED)[0], good = SCHED[fm].h, bad = String(Number(good) + 100);
      const want = await pgE.evaluate(mk => { const out = []; window.DxfMetaEditor.state.sheets.forEach(sh => { const D = window.DxfMetaEditor.doorsOf(sh.name); if (!D) return;
        sh.marks.filter(m => m.key === 'TAG' && m.value === 'door,' + mk).forEach(m => { const P = [m.x * D.factor, m.y * D.factor];
          D.doors.forEach(d => { const b = d.opening_box; if (!b) return; const u = b.axis === 'x' ? P[0] : P[1], v = b.axis === 'x' ? P[1] : P[0], L = b.along || b.s; if (u >= L[0] && u <= L[1] && v >= b.band[0] && v <= b.band[1]) out.push(sh.name + '|' + d.handle); }); }); }); return out.sort(); }, fm);
      const sel = 'input[data-act="dsz"][data-mark="' + fm + '"][data-dim="h"]';
      await typeInto(pgE, sel, bad); const vF = await idle(pgE);
      const got = vF.blocking.map(x => x.sheet + '|' + x.handles.join(',')).sort(), codes = vF.blocking.reduce((o, x) => (o[x.code] = (o[x.code] || 0) + 1, o), {});
      check('E7-FALSIFY', 'a mistyped schedule height does not block exactly the doors tagged with that mark (or blocks others)', vF.nB === want.length && want.length > 0 && J(got) === J(want) && Object.keys(codes).length === 1,
        fm + ' height ' + good + ' -> ' + bad + ': blocking ' + vF.nB + ' ' + J(codes) + ' on ' + J(got.map(g => g.replace(/_std\.dxf/, ''))) + ' | doors tagged ' + fm + ': ' + want.length);
      await typeInto(pgE, sel, good); const vB = await idle(pgE);
      check('E7-FALSIFY RESTORE', 'typing the height back does not return to "Qualifies"', vB.verdict === 'qualifies' && vB.nB === 0, 'blocking=' + vB.nB);
    }
    await pgE.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.doors = false; S.sec.verdict = true; S.sec.sheets = true; S.open = {}; });
    await clk(pgE, '[data-act="sec"][data-sec="doors"]'); await clk(pgE, '[data-act="sec"][data-sec="doors"]');
    await pgE.evaluate(() => { document.getElementById('dm-body').scrollTop = 0; }); await sleep(600);
    await pgE.screenshot({ path: path.join(SHOTS, 'l4_raw_qualifies.png') });
    // ---- saved copies: canonical markings == the marked std set's (TAG positions within 0.01 drawing units), every marking @BY=user ----
    await clk(pgE, '#dm-save');
    const saved7 = await waitFiles(DL7, 8);
    const bad7 = [], extra = [], missing = [];
    const canonT = text => MK.readMarks(parse(text).entities).map(m => { const raw = m.raw.replace(/\s+@BY=\S+$/, ''); const k = (/^@([A-Z]+)=/.exec(raw) || [])[1], p = POS[k];
      return { s: raw + (p === 'x' ? '@x=' + n6(m.x) : p === 'y' ? '@y=' + n6(m.y) : ''), tag: k === 'TAG', x: m.x, y: m.y, by: / @BY=user$/.test(m.raw) }; });
    STDF.forEach((f, i) => { const sn = path.basename(RAWF[i]).replace(/\.dxf$/, '') + '_marked.dxf', p = path.join(DL7, sn);
      if (!fs.existsSync(p)) { bad7.push('no saved copy ' + sn); return; }
      const A = canonT(fs.readFileSync(f, 'utf8')), Bm = canonT(fs.readFileSync(p, 'utf8')), used = new Set();
      if (!Bm.every(m => m.by)) bad7.push(sn + ': a marking without @BY=user');
      A.forEach(a => { const j = Bm.findIndex((b, bi) => !used.has(bi) && b.s === a.s && (!a.tag || (Math.abs(b.x - a.x) <= 0.01 && Math.abs(b.y - a.y) <= 0.01))); if (j >= 0) used.add(j); else missing.push(sn.replace(/_std_marked\.dxf/, '') + ' ' + a.s + (a.tag ? '@' + a.x + ',' + a.y : '')); });
      Bm.forEach((b, bi) => { if (!used.has(bi)) extra.push(sn.replace(/_std_marked\.dxf/, '') + ' ' + b.s + (b.tag ? '@' + b.x + ',' + b.y : '')); }); });
    const missOk = missing.every(m => /@WALLTOP=handle:/.test(m));
    check('E7 SAVED', 'a saved copy\'s markings differ from the marked std set\'s (beyond the per-wall tops the UI never asks for), or lack @BY=user', bad7.length === 0 && extra.length === 0 && missOk && saved7.length === 8,
      saved7.length + ' copies; missing=' + J(missing) + ' extra=' + J(extra) + (bad7.length ? ' bad=' + J(bad7) : ''));
    // ---- Convert (real click) == E5's conversion of the marked std set ----
    const sig7 = await pgE.evaluate(elSig);
    const dis7 = await pgE.evaluate(() => document.getElementById('dxf-convert').disabled);
    const b7 = await pgE.evaluate(() => window.Bonsai.oplog.length);
    if (!dis7) { await clk(pgE, '#dxf-convert'); await pgE.waitForFunction('window.DxfImportUI.state.last', { timeout: 600000 }); }
    const c7 = dis7 ? null : await pgE.evaluate(() => { const L = window.DxfImportUI.state.last; return { inserts: L.nInserts, cuts: L.nCuts, counts: L.counts, ops: window.Bonsai.oplog.length }; });
    if (c7) c7.ops -= b7;
    const dA = ref5.els.filter(x => !sig7.includes(x)), dB = sig7.filter(x => !ref5.els.includes(x));
    check('E7 CONVERT', 'Convert of the filled raw set differs from the marked std set\'s (inserts, cuts, counts by storey/class, or any element class/storey/bbox 1 mm)',
      !!c7 && !!ref5.last && c7.inserts === ref5.last.inserts && c7.cuts === ref5.last.cuts && sortObj(c7.counts) === sortObj(ref5.last.counts) && c7.ops === ref5.last.ops && dA.length === 0 && dB.length === 0 && sig7.length === ref5.els.length,
      'E7 ' + J(c7) + ' | E5 ' + J(ref5.last) + ' | elements ' + sig7.length + ' vs ' + ref5.els.length + ', only-marked=' + dA.length + ' only-raw=' + dB.length + (dA.length ? ' e.g. ' + J(dA.slice(0, 2)) + ' / ' + J(dB.slice(0, 2)) : ''));
    await pgE.close();
  }

  // ================= E7 PROPOSE (§L4.3): schedule + door marks drawn as TEXT in a plan are suggested, never written until ticked =================
  {
    const gfF = STDF[0], gfTxt = fs.readFileSync(gfF, 'utf8');
    const kept = MK.readMarks(parse(gfTxt).entities).filter(m => !/^@(TAG|SCHEDULE)=/.test(m.raw)).map(m => ({ text: m.raw, x: m.x, y: m.y }));
    const tagsGF = MK.readMarks(parse(gfTxt).entities).filter(m => /^@TAG=/.test(m.raw)).map(m => ({ mark: m.raw.replace(/\s+@BY=\S+$/, '').split(',').slice(1).join(','), x: m.x, y: m.y }));
    const schedGF = MK.readMarks(parse(gfTxt).entities).filter(m => /^@SCHEDULE=/.test(m.raw)).map(m => m.raw.replace(/\s+@BY=\S+$/, '').slice(10).split(','));
    const short = {}; schedGF.forEach((q, i) => { short[q[0]] = 'D' + (i + 1); });   // a drafter's one-token marks (fixture), sizes = the std schedule
    const fixture = [{ text: 'DOOR SCHEDULE  MARK  SIZE  DESCRIPTION', x: 12000, y: -1000 }].concat(schedGF.map((q, i) => ({ text: short[q[0]] + '  ' + q[2] + ' x ' + q[3] + '  DOOR', x: 12000, y: -1400 - 400 * i })),
      tagsGF.map(tg => ({ text: short[tg.mark], x: tg.x, y: tg.y })));
    // fixture texts on a drawing layer (A-ANNO-NOTE, ignored by the std plan map), then the file's other markings
    const L = MK.writeMarks(stripMarks(gfTxt), fixture).split(/\r?\n/);
    for (let i = 0, n = 0; i + 1 < L.length; i++) if (L[i] === '8' && L[i + 1] === 'DXF2BIM-MARK') { L[i + 1] = 'A-ANNO-NOTE'; n++; }
    const fxTxt = MK.writeMarks(L.join('\n'), kept);
    const PD = path.join(TMP, 'propose'); fs.mkdirSync(PD, { recursive: true });
    const fxF = path.join(PD, path.basename(gfF)); fs.writeFileSync(fxF, fxTxt);
    const set8 = [fxF].concat(STDF.slice(1).filter(f => !/FLOOR_FF/.test(f)));   // GF fixture + the marked elevations, roof, section (FF left out: its tags are not in the fixture)
    const pgP = await newPage(t, 'propose');
    const DLP = path.join(TMP, 'saved_e7p'); await setDownloads(pgP, DLP);
    await openSet(pgP, set8);
    await ensureSec(pgP, 'doors');
    const pr0 = await pgP.evaluate(() => Array.from(document.querySelectorAll('[data-dprop]')).map(e => e.getAttribute('data-dprop')));
    const mk0 = await pgP.evaluate(() => window.DxfMetaEditor.state.sheets.reduce((n, s) => n + s.marks.filter(m => m.key === 'TAG' || m.key === 'SCHEDULE').length, 0));
    await clk(pgP, '#dm-save'); const sP0 = await waitFiles(DLP, set8.length);
    const leak0 = sP0.reduce((n, f) => n + MK.readMarks(parse(fs.readFileSync(path.join(DLP, f), 'utf8')).entities).filter(m => /^@(TAG|SCHEDULE)=/.test(m.raw)).length, 0);
    sP0.forEach(f => fs.unlinkSync(path.join(DLP, f)));
    // tick ONE schedule row: it becomes the user's row; the tag texts of that mark are now suggested (their doors resolved by the reader rule)
    const i1 = pr0.findIndex(p => /^PR-SCHEDULE:D1$/.test(p));
    if (i1 >= 0) { await clk(pgP, '[data-act="dconfirm"][data-i="' + i1 + '"]'); await idle(pgP); }
    const pr1 = await pgP.evaluate(() => Array.from(document.querySelectorAll('[data-dprop]')).map(e => e.getAttribute('data-dprop')));
    const iT = pr1.findIndex(p => /^PR-TAG:D1@/.test(p));
    if (iT >= 0) { await clk(pgP, '[data-act="dconfirm"][data-i="' + iT + '"]'); await idle(pgP); }
    await clk(pgP, '#dm-save'); const sP1 = await waitFiles(DLP, set8.length);
    const got = []; sP1.forEach(f => MK.readMarks(parse(fs.readFileSync(path.join(DLP, f), 'utf8')).entities).filter(m => /^@(TAG|SCHEDULE)=/.test(m.raw)).forEach(m => got.push(f.replace(/_marked\.dxf$/, '') + ' ' + m.raw)));
    const d1 = schedGF[0], d1Tag = tagsGF.filter(tg => tg.mark === d1[0]);
    const okP = pr0.filter(p => /^PR-SCHEDULE:/.test(p)).length === schedGF.length && pr0.filter(p => /^PR-TAG:/.test(p)).length === 0 && mk0 === 0 && leak0 === 0 &&
      pr1.filter(p => /^PR-TAG:D1@/.test(p)).length === d1Tag.length && got.length === 2 && got.some(g => g === 'DX_FLOOR_GF ' + '@SCHEDULE=D1,door,' + d1[2] + ',' + d1[3] + ' @BY=user') && got.some(g => /^DX_FLOOR_GF @TAG=door,D1 @BY=user$/.test(g));
    check('E7 PROPOSE', 'schedule / door-mark texts drawn in the plan are not suggested, or a suggestion reaches a file unticked, or a ticked one writes something else',
      okP, 'suggested at open ' + J(pr0) + ' (markings TAG/SCHEDULE in the editor=' + mk0 + ', in files saved unticked=' + leak0 + ') | after ticking PR-SCHEDULE D1: ' + J(pr1) + ' | saved after ticking D1 + one PR-TAG: ' + J(got));
    await pgP.close();
  }
  say('screenshots: ' + ['l4_editor_filled.png', 'l4_editor_verdict_zoom.png', 'l4_editor_raw.png', 'l4_editor_midfill.png', 'l4_editor_layers_reimport.png', 'l4_editor_std.png', 'l4_doors_schedule.png', 'l4_raw_qualifies.png'].map(f => path.join(SHOTS, f)).join(' , '));
  say('SUMMARY fail=' + fail + ' gap=' + gapN);
  t.assert('W-DXF-META checks', fail === 0, 'fail=' + fail + ' gap=' + gapN);
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
}, { width: 1400, height: 900 });
process.on('exit', () => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n'); } catch (e) {} });
