#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ARRANGE (prompts/DXF2BIM_ARRANGE.md, D34 ARRANGE). Read the log after every run: exit code is not evidence.
// The Arrange view draws every sheet as drawn (1 unit = 1 mm, z = 0) and places it one marking / one yellow band at a time by its EFFECTIVE markings
// (markings + the editor's yellow suggestions, later rounds as if the earlier yellow values were in place). Issues proved / disproved:
//   A1 the arrangement ends where the canvas places the sheet (every segment end = buildCanvas, 1e-6 m)
//   A2 stage 0 is the file as drawn (raw x 0.001, z = 0, every sheet, placed or not)
//   A3 each step comes from a value the sheet carries (no marking, no step; the plain Duplex set: no role is proposed, its sheets stay flat)
//   A4 the panel calls up the field / yellow band of the step, in view, outlined; the 2D Drawings panel minimised during play, everything restored after
//   A5 it is only a view (verdict, markings, saved texts byte-identical; 0 page errors)
//   A6 the morph comes from the defaults as they appear (raw shed: every step = one yellow band, in panel order, played on open)
//   A7 yellow is not yours (play changes nothing accepted; after Accept all + the stated values typed in the panel, the tint is gone and A1 holds)
// Sets: the Duplex model-marked + plain sets are written here from DXARC.db (prompts/film_dxf2bim_yellow_sets.js); the shed sets are private local
// material (SKIP loudly when absent; never copied into the repo; no sheet text is printed).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_arrange.js [/tmp/db2/DXARC.db]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DB = process.argv[2] || '/tmp/db2/DXARC.db';
const SHED_MARKED = path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
const SHED_RAW = path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets');
const RAW9 = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const DATUM = { '1S_ELEV': -4446.6, '1N_ELEV': -3895.2, '2_ELEV': -4515.7264, '7_ELEV': -3766.442, '8_SECTION': -3726.416 };   // the CLI run's stated second datums (0.6096 m at drawing y)
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const skip = (id, why) => console.log('§SKIP ' + id + '  ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.ARRANGE_SHOTS || null;   // optional: a folder for the review screenshots (never the repo: the shed shows its title block)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arrange-'));
  let duplex = null;
  if (fs.existsSync(DB)) {
    const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, path.join(tmp, 'duplex')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
    console.log('  sets: ' + ((r.stdout || '').match(/§FILM_SETS.*/) || ['rc=' + r.status + ' ' + (r.stderr || '').slice(0, 200)])[0].replace(/ out=\S+/, ''));
    if (r.status === 0) duplex = path.join(tmp, 'duplex');
  }
  const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
  const errs = [], alog = []; pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
  pg.on('console', m => { const t = m.text(); if (/^§DXF-ARRANGE/.test(t)) alog.push(t); });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
  const idle = () => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
  const openSet = async (files, onOpen) => {
    await pg.evaluate(o => { window.DxfImportUI.state.arrangeOnOpen = !!o; window.__arr = { steps: [], checks: [], stage0: null }; window.DxfImportUI.state.arrangeOpts = o ? window.__arrOpts() : null; }, !!onOpen);
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await idle(); await sleep(500);
  };
  // the in-page probes: at every step (before its motion) the focus / panel checks; at step 1 the stage-0 buffers
  await pg.evaluate(() => {
    window.__arrSnap = () => { const S = window.DxfMetaEditor.state, b = document.getElementById('dm-body'); return JSON.stringify({ sec: S.sec, open: S.open, top: b ? b.scrollTop : null, min: (document.getElementById('dxf-panel') || { classList: { contains: () => false } }).classList.contains('dxf-min') }); };
    window.__stage0 = () => {   // every sheet's live buffer vs its own entities x 0.001, z = 0 (axes sorted: independent of draw order)
      const U = window.DxfImportUI.state, out = []; U.arr.items.forEach(it => {
        const got = [[], [], []], exp = [[], [], []];
        it.obj.forEach(ls => { const a = ls.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) got[k].push(a[i + k]); });
        it.s.dxf.entities.forEach(e => { if (e.layer === 'DXF2BIM-MARK') return; const s = window.DxfImportUI.segs2d([e]).s; for (let i = 0; i < s.length; i += 2) { exp[0].push(s[i] * 0.001); exp[1].push(s[i + 1] * 0.001); exp[2].push(0); } });
        let worst = got[0].length === exp[0].length ? 0 : Infinity; if (isFinite(worst)) for (let k = 0; k < 3; k++) { got[k].sort((p, q) => p - q); exp[k].sort((p, q) => p - q); for (let i = 0; i < got[k].length; i++) worst = Math.max(worst, Math.abs(got[k][i] - exp[k][i]) / Math.max(1, Math.abs(exp[k][i]))); }
        out.push({ name: it.name, n: got[0].length / 2, worst: worst, z0: got[2].every(z => z === 0) }); });
      return out; };
    window.__arrOpts = () => ({ stepMs: 15, holdMs: 15, onStep: async (info) => {
      const W = window.__arr; if (info.i === 1) W.stage0 = window.__stage0();
      const T = window.DxfMetaEditor.focusTargets(), body = document.getElementById('dm-body'), br = body.getBoundingClientRect(), dp = document.getElementById('dxf-panel'), db = document.getElementById('dxf-body');
      const each = T.map(e => { const r = e.getBoundingClientRect(), card = e.closest('[data-card]');
        const own = card && Number(card.getAttribute('data-card')) === info.si && (info.yellow ? e.getAttribute('data-pv-key') === info.key : (e.id === 'dm-f-' + info.si + '-' + info.key || (e.getAttribute('data-mark') || '').indexOf(info.key + '=') === 0)) || (!info.yellow && e.id === 'dm-f-' + info.si + '-' + info.key);
        return { own: !!own, inView: r.top >= br.top - 1 && r.bottom <= br.bottom + 1 && r.height > 0, outlined: e.classList.contains('dm-focus') && getComputedStyle(e).outlineStyle === 'solid' }; });
      W.checks.push({ i: info.i, sheet: info.sheet, si: info.si, key: info.key, yellow: info.yellow, n: T.length, ok: T.length > 0 && each.every(x => x.own && x.outlined) && each.some(x => x.inView), inView: each.filter(x => x.inView).length, minimised: !!dp && dp.classList.contains('dxf-min') && !!db && getComputedStyle(db).display === 'none',
        rows: info.yellow ? Array.from(document.querySelectorAll('[data-card="' + info.si + '"] .dm-pv')).map(e => e.getAttribute('data-pv-key')) : null });
      W.steps.push(info); } });
  });
  const state = () => pg.evaluate(() => { const S = window.DxfMetaEditor.state; return { verdict: JSON.stringify(S.verdict && { v: S.verdict.verdict, b: S.verdict.blocking, a: S.verdict.advisory }), marks: JSON.stringify(S.sheets.map(sh => sh.marks.map(m => [m.key, m.value, m.x, m.y, m.source]))), texts: S.sheets.map(sh => window.DxfMetaEditor.effText(sh)), gate: window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok }; });
  const same = (a, b) => a.verdict === b.verdict && a.marks === b.marks && a.texts.length === b.texts.length && a.texts.every((t, i) => t === b.texts[i]) && a.gate === b.gate;
  const play = () => pg.evaluate(() => window.DxfImportUI.arrange(window.__arrOpts()));
  const A1 = () => pg.evaluate(() => {   // the arrangement's last positions vs the canvas's own segOf, per handle (independent of the view's own compare)
    const U = window.DxfImportUI.state, F = U.arrLast && U.arrLast.final, C = U.canvas || {}, res = [];
    Object.keys(C).forEach(n => { const a = C[n].segOf, b = F && F[n]; let w = b ? 0 : Infinity; if (b) { const ha = Object.keys(a), hb = Object.keys(b); if (ha.length !== hb.length) w = Infinity; else ha.forEach(h => { const x = a[h], y = b[h]; if (!y || x.length !== y.length) { w = Infinity; return; } for (let i = 0; i < x.length; i++) w = Math.max(w, Math.abs(x[i] - y[i])); }); }
      res.push({ n: n, segs: Object.keys(a).reduce((s, h) => s + a[h].length / 6, 0), worst: w }); });
    return res; });
  const expectedSteps = () => pg.evaluate(() => {   // A3 oracle: the placing keys each sheet's ACCEPTED desc states (as the canvas read it), by its role
    const NEED = { plan: ['UNITS', 'VIEW', 'LEVEL', 'GRIDX', 'GRIDY'], roof: ['UNITS', 'VIEW', 'ROOF'], elev: ['UNITS', 'VIEW', 'Z', 'HAXIS', 'GRIDH', 'FACE'], section: ['UNITS', 'VIEW', 'Z', 'HAXIS', 'GRIDH', 'CUT'] }, VR = { PLAN: 'plan', ROOF: 'roof', ELEV: 'elev', SECTION: 'section' };
    const o = {}; window.DxfImportUI.state.sheets.forEach(s => { const d = s.desc, need = NEED[VR[d.view]] || ['UNITS'];
      o[s.name] = need.filter(k => k === 'Z' ? d.zs.length : k === 'GRIDH' ? Object.keys(d.gridsH).length : k === 'GRIDX' ? Object.keys(d.gridsX).length : k === 'GRIDY' ? Object.keys(d.gridsY).length : d[k.toLowerCase()] !== undefined); }); return o; });
  const restoredOk = (b, a) => { const x = JSON.parse(b), y = JSON.parse(a); return JSON.stringify(x.sec) === JSON.stringify(y.sec) && JSON.stringify(x.open) === JSON.stringify(y.open) && Math.abs(x.top - y.top) <= 1 && !y.min; };

  // ---------- a marked set: A1-A5 ----------
  async function markedSet(tag, dir) {
    await openSet(dxfs(dir), false);
    const before = await state(), snap0 = await pg.evaluate(() => window.__arrSnap()), exp = await expectedSteps(), e0 = errs.length; alog.length = 0;
    const res = await play(); await sleep(400);
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'w_' + tag + '_final.png') });
    const W = await pg.evaluate(() => window.__arr), snap1 = await pg.evaluate(() => window.__arrSnap()), after = await state();
    console.log('  ' + tag + ': ' + JSON.stringify(res) + ' log: ' + alog.filter(l => / done | hand-over/.test(l)).join(' | ').slice(0, 300));
    const a1 = await A1(), canv = a1.length, roles = await pg.evaluate(() => window.DxfImportUI.state.sheets.filter(s => s.role && s.role !== 'drawing').length);
    ok('A1[' + tag + '] the arrangement ends where the canvas places the sheet: every segment end of every placed sheet = buildCanvas (1e-6 m); every sheet with a role is placed (' + canv + '/' + roles + ')', canv > 0 && canv === roles && a1.every(x => x.worst <= 1e-6) && res.final_equal === true && res.compared === canv, a1.map(x => x.n.replace(/(_std|_marked)?\.dxf$/, '') + ':' + x.segs + '/' + x.worst).join(' '));
    const s0 = W.stage0 || [];
    ok('A2[' + tag + '] stage 0 is the file as drawn: raw x 0.001, z = 0, for every sheet, placed or not', s0.length === after.texts.length && s0.every(x => x.worst <= 1e-6 && x.z0 && x.n > 0), s0.map(x => x.name.replace(/(_std|_marked)?\.dxf$/, '') + ':' + x.n + '/' + (isFinite(x.worst) ? x.worst.toExponential(1) : 'count')).join(' '));
    const got = {}; W.steps.forEach(s => { (got[s.sheet] = got[s.sheet] || []).push(s.key + (s.yellow ? '*' : '')); });
    const bad = Object.keys(exp).filter(n => JSON.stringify((got[n] || []).filter(k => !/\*$/.test(k))) !== JSON.stringify(exp[n]));
    ok('A3[' + tag + '] each step comes from a marking the sheet carries: per sheet the accepted steps = its placing markings, in order (no marking, no step)', !bad.length && W.steps.length === res.total, bad.length ? bad.map(n => n + ' got ' + (got[n] || []).join(',') + ' want ' + exp[n].join(',')).join('; ') : Object.keys(exp).map(n => n.replace(/(_std|_marked)?\.dxf$/, '') + ':' + exp[n].length).join(' ') + ' yellow=' + W.steps.filter(s => s.yellow).length);
    const fc = W.checks.filter(c => !c.ok || !c.minimised);
    ok('A4[' + tag + '] the panel calls up the field of the step: it exists, is that sheet\'s field / rows, outlined, inside #dm-body\'s visible part; 2D Drawings minimised during play and sections / cards / scroll restored after', W.checks.length === res.total && !fc.length && restoredOk(snap0, snap1), W.checks.length + ' steps, ' + fc.length + ' bad' + (fc.length ? ' first ' + JSON.stringify(fc[0]) : '') + ' restored=' + restoredOk(snap0, snap1));
    ok('A5[' + tag + '] it is only a view: verdict, markings, saved texts, gate byte-identical before / after; 0 page errors', same(before, after) && errs.length === e0, 'texts=' + after.texts.length + ' errors=' + (errs.length - e0));
    return W;
  }
  if (duplex) await markedSet('duplex', path.join(duplex, 'marked')); else { ['A1', 'A2', 'A3', 'A4', 'A5'].forEach(a => skip(a + '[duplex]', 'no DXARC.db at ' + DB + ' (the Duplex sets are written from it)')); }
  if (fs.existsSync(SHED_MARKED) && dxfs(SHED_MARKED).length === 9) await markedSet('shed', SHED_MARKED); else ['A1', 'A2', 'A3', 'A4', 'A5'].forEach(a => skip(a + '[shed]', 'LOCAL MATERIAL ABSENT: ' + SHED_MARKED + ' (9 CLI-marked shed sheets)'));

  // ---------- the plain Duplex set: A3b ----------
  if (duplex) {
    await openSet(dxfs(path.join(duplex, 'plain')), false); alog.length = 0;
    const before = await state(); const res = await play(); await sleep(300); const W = await pg.evaluate(() => window.__arr), after = await state();
    const flat = await pg.evaluate(() => { const L = window.DxfImportUI.state.arrLast; return L ? Object.keys(L.lacks).filter(n => /^no role/.test(L.lacks[n][0] || '')).length : -1; });
    const finding = alog.filter(l => /finding sheets without a role=/.test(l))[0] || '';
    ok('A3b[duplex plain] no marking, no accepted step: every step is a yellow band; roles are not proposed for the sheets whose titles end in a scale, they stay flat as drawn (stated in the log)', W.steps.length === res.total && W.steps.every(s => s.yellow) && flat >= 1 && /stay flat as drawn/.test(finding) && same(before, after), 'steps=' + res.total + ' yellow=' + W.steps.filter(s => s.yellow).length + ' flat=' + flat + ' keys=' + Array.from(new Set(W.steps.map(s => s.key))).join(','));
  } else skip('A3b[duplex plain]', 'no DXARC.db');

  // ---------- the raw shed: A6 (play on open, every step a yellow band in panel order) + A7 (yellow is not yours) ----------
  const rawOk = RAW9.every(n => fs.existsSync(path.join(SHED_RAW, n + '.dxf')));
  if (!rawOk) { skip('A6[shed raw]', 'LOCAL MATERIAL ABSENT: ' + SHED_RAW + ' (' + RAW9.join(' ') + ')'); skip('A7[shed raw]', 'LOCAL MATERIAL ABSENT'); }
  else {
    alog.length = 0; const e0 = errs.length;
    await openSet(RAW9.map(n => path.join(SHED_RAW, n + '.dxf')), true);
    await pg.waitForFunction('window.DxfImportUI.state.arrLast && window.__arr.steps.length && !(window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.playing)', { timeout: 240000 }); await sleep(500);
    const W = await pg.evaluate(() => window.__arr), pv = await pg.evaluate(() => window.DxfMetaEditor.preview().map(p => ({ si: p.si, keys: p.yellow.map(y => y.key) })));
    const bySi = {}; W.checks.forEach(c => { (bySi[c.si] = bySi[c.si] || []).push(c); });
    const order = Object.keys(bySi).every(si => { const cs = bySi[si], last = cs[cs.length - 1]; return JSON.stringify(cs.map(c => c.key)) === JSON.stringify(last.rows.filter((k, i, a) => a.indexOf(k) === i)) && cs.every((c, i) => c.rows.filter((k, j, a) => a.indexOf(k) === j).length === i + 1); });
    const bands = pv.every(p => { const ks = p.keys.filter((k, i, a) => a.indexOf(k) === i); return JSON.stringify(ks.slice().sort()) === JSON.stringify((bySi[p.si] || []).map(c => c.key).sort()); });
    const opened = alog.some(l => /§DXF-ARRANGE start /.test(l)) && W.steps.length > 0;
    ok('A6[shed raw] the morph comes from the defaults as they appear: played on open, every step is one yellow band (all rows of one key), each band appears in its card one at a time and the steps follow the card\'s order; every yellow key of every sheet is a step', opened && W.steps.every(s => s.yellow) && order && bands && W.checks.every(c => c.ok && c.minimised),
      'steps=' + W.steps.length + ' sheets=' + Object.keys(bySi).length + ' order=' + order + ' bands=' + bands + ' focus-bad=' + W.checks.filter(c => !c.ok || !c.minimised).length);
    const s0 = W.stage0 || [];
    ok('A2[shed raw] stage 0 is the file as drawn (raw x 0.001, z = 0) for all 9 sheets', s0.length === 9 && s0.every(x => x.worst <= 1e-6 && x.z0), s0.map(x => x.n + '/' + (isFinite(x.worst) ? x.worst.toExponential(1) : 'count')).join(' '));
    // A7 part 1: the play changed nothing accepted (the verdict / markings / texts at open = after play: the open itself judged them)
    const L0 = await pg.evaluate(() => ({ tinted: (window.DxfImportUI.state.arrLast.tinted || []).length, live: !!window.DxfImportUI.state.arr, marks: window.DxfMetaEditor.state.sheets.reduce((n, sh) => n + sh.marks.length, 0) }));
    const st0 = await state(); await pg.evaluate(() => { window.__arr = { steps: [], checks: [], stage0: null }; }); const rp = await play(); await sleep(400); const st1 = await state();
    ok('A7b[shed raw] a replay (Arrange button path) of all ' + rp.total + ' yellow steps leaves verdict, markings, saved texts, gate byte-identical', same(st0, st1) && rp.steps === rp.total, JSON.stringify(rp));
    // the one-datum preview rule against the CLI's stated second datum: the yellow ground line + the unit factor put the stated y at 0.6096 m (within 0.5 mm)
    const oneDatum = await pg.evaluate(D => window.DxfMetaEditor.preview().filter(p => p.desc.zs.length === 1 && Object.keys(D).some(k => p.name.indexOf(k) === 0)).map(p => { const k = Object.keys(D).filter(q => p.name.indexOf(q) === 0)[0], z = p.desc.zs[0], f = { in: 0.0254, mm: 0.001 }[p.desc.units];
      return { n: k, dz: Math.abs(z.z + (D[k] - z.y) * f - 0.6096) }; }), DATUM);
    ok('A7a[shed raw] one datum + units place the heights in the preview: the stated second datum of the CLI run (0.6096 m) lands within 0.5 mm of the suggested ground line', oneDatum.length === 5 && oneDatum.every(x => x.dz <= 0.0005), oneDatum.map(x => x.n + ':' + (x.dz * 1000).toFixed(3) + 'mm').join(' '));
    // A7 part 2: Accept all, then the values the CLI states (--set SHED, --level 0, the five second datums) typed into the panel's own fields, Accept all again
    const acceptAll = async () => { for (let r = 0; r < 6; r++) { const n = await pg.evaluate(() => { const b = document.querySelector('#dm-yellows [data-act="acceptall"]'); if (!b) return 0; b.click(); return 1; }); if (!n) break; await sleep(700); await idle(); await sleep(1200); } };
    const typeField = async (si, key, val) => { await pg.evaluate((si, key, val) => { const S = window.DxfMetaEditor.state; if (!S.open[si]) document.querySelector('#dm-panel [data-act="card"][data-sheet="' + si + '"]').click();
      const el = document.getElementById('dm-f-' + si + '-' + key); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, si, key, val); await sleep(300); };
    const addZ = async (si, z, y) => { await pg.evaluate((si, z, y) => { const S = window.DxfMetaEditor.state; if (!S.open[si]) document.querySelector('#dm-panel [data-act="card"][data-sheet="' + si + '"]').click();
      document.getElementById('dm-av-' + si + '-Z').value = String(z); document.getElementById('dm-ap-' + si + '-Z').value = String(y); document.querySelector('#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]').click(); }, si, z, y); await sleep(300); };
    alog.length = 0;
    await acceptAll();
    const sync1 = alog.filter(l => / sync /.test(l)), moved1 = sync1.map(l => Number((/moved=(\d+)/.exec(l) || [])[1] || 0));
    const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => sh.name));
    await typeField(0, 'SET', 'SHED'); await idle(); await sleep(1500);
    // A8: a typed value moves the sheet live: @LEVEL=0 typed on the plans gives the reference plan, so HAXIS is suggested (yellow) and the other plans align: the view tweens them from where they stand
    const before8 = await pg.evaluate(() => { const F = window.DxfImportUI.state.arrLast.final, o = {}; Object.keys(F).forEach(n => { const h = Object.keys(F[n])[0]; o[n] = h ? F[n][h].slice(0, 3) : null; }); return o; });
    alog.length = 0;
    for (let si = 0; si < names.length; si++) if (/FLOOR_PLAN|BEAM_LAYOUT|FOUNDATION_LAYOUT/.test(names[si])) await typeField(si, 'LEVEL', '0');
    await idle(); await sleep(2500);
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'w_shedraw_after_level0.png') });
    const sync8 = alog.filter(l => / sync moved=/.test(l)), movedNames = Array.from(new Set([].concat.apply([], sync8.map(l => ((/moved=\d+ \(([^)]*)\)/.exec(l) || [])[1] || '').split(',').filter(Boolean)))));
    const after8 = await pg.evaluate(() => { const F = window.DxfImportUI.state.arrLast.final, o = {}; Object.keys(F).forEach(n => { const h = Object.keys(F[n])[0]; o[n] = h ? F[n][h].slice(0, 3) : null; }); return o; });
    const want8 = names.filter(n => /ELEV|SECTION|BEAM_LAYOUT|FOUNDATION_LAYOUT/.test(n)), shifted = want8.filter(n => before8[n] && after8[n] && Math.hypot(after8[n][0] - before8[n][0], after8[n][1] - before8[n][1]) > 1);
    ok('A8[shed raw] a typed value moves the sheet live: @LEVEL=0 typed in the panel after play -> the view tweens (sync tween) the 4 elevations, the section (HAXIS now suggested: turned onto the plan grid) and the 2 other plans (aligned by their grid labels) from where they stood',
      want8.every(n => movedNames.indexOf(n) >= 0) && shifted.length === want8.length && sync8.some(l => /tween=700ms/.test(l)), 'moved=' + movedNames.map(n => n.replace(/\.dxf$/, '')).join(',') + ' shifted>1m=' + shifted.length + '/' + want8.length + ' | ' + sync8.map(l => l.replace(/\(.*\)/, '').replace('§DXF-ARRANGE ', '')).join(' | '));
    for (let si = 0; si < names.length; si++) { const k = Object.keys(DATUM).filter(q => names[si].indexOf(q) === 0)[0]; if (k) await addZ(si, 0.6096, DATUM[k]); }
    await idle(); await sleep(1500); await acceptAll(); await idle(); await sleep(2500);
    const L1 = await pg.evaluate(() => { const U = window.DxfImportUI.state; return { live: !!U.arr, tinted: (U.arrLast && U.arrLast.tinted) || null, canvas: Object.keys(U.canvas || {}), roles: U.sheets.map(s => s.role), yellowPlacing: window.DxfMetaEditor.preview().reduce((n, p) => n + p.yellow.filter(y => ['UNITS', 'VIEW', 'LEVEL', 'ROOF', 'Z', 'HAXIS', 'GRIDH', 'FACE', 'CUT'].indexOf(y.key) >= 0).length, 0) }; });
    const a1 = await A1();
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'w_shedraw_after_typed.png') });
    console.log('  shed raw after Accept all + typed: ' + JSON.stringify({ live: L1.live, tinted: L1.tinted, canvas: L1.canvas.length, roles: L1.roles, yellowPlacing: L1.yellowPlacing, syncMovedOnFirstAccept: moved1 }));
    ok('A7[shed raw] yellow is not yours: the play left the accepted markings / verdict / texts as opened (0 accepted before Accept all); accepting the yellow values re-morphs nothing (sync moved=0); after Accept all + the CLI\'s stated values typed in the panel no tint is left and every sheet the canvas places ends where buildCanvas puts it',
      L0.marks === 0 && L0.tinted > 0 && moved1.length > 0 && moved1.every(n => n === 0) && L1.yellowPlacing === 0 && (L1.tinted === null || L1.tinted.length === 0) && a1.length === 8 && a1.every(x => x.worst <= 1e-6) && errs.length === e0,
      'before: marks=' + L0.marks + ' tinted=' + L0.tinted + ' | first accept syncs moved=' + moved1.join(',') + ' | after: tinted=' + JSON.stringify(L1.tinted) + ' canvas=' + a1.map(x => x.n.replace(/\.dxf$/, '') + ':' + x.worst).join(' ') + ' errors=' + (errs.length - e0) + ' st0.gate=' + st0.gate);
  }
  console.log('  page errors total=' + errs.length);
  await br.close(); srv.close();
  console.log('§W-ARRANGE ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-ARRANGE crashed ' + (e && e.stack || e)); process.exit(1); });
