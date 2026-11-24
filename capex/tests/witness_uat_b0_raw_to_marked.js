#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-UAT-B0 (bim-ootb prompts/CAPEX_DASHBOARD.md §5.84). READ THE LOG: the §UATB0 lines carry the evidence, the exit code does not.
// THE ISSUE IT PROVES OR DISPROVES: "a tester holding the nine RAW Shed sheets cannot reach the guide's marked set by the steps of
//   UAT Guide B0 in the real Modeller" (until 2026-11-15 the guide's B1/B2 were proven only for the supplied …_marked.dxf copies).
//   R0 non-vacuous: nine sheets on the panel, none with a stated role (the raw files carry no marks), the badge does not read Qualifies.
//   R1 after B0's steps, done through the panel's own controls, the badge reads Qualifies and no yellow row is open.
//   R2 Save writes nine …_marked.dxf whose marks equal the guide set's mark for mark (text + position); @EXCLUDE (the tester's drag) is
//      judged by its box lying inside the §5.84 tolerance instead of by its digits.
//   R3 Convert reads the same "Converted: N elements" as the guide's marked set opened in the same page build.
//   UAT_B0_BREAK=1 skips the exclude drag: R2 and R3 must FAIL.
//   §D114 (prompts/DXF2BIM_ARCHITECT_REVIEW.md, 2026-11-24, owner: "Defaults needs no further typing"): RP the set name, five PL datums and the beam body height arrive PRE-FILLED from the
//   drawings (7 values, nothing typed, each naming its rule); B0 types only the layers, the footing heights and the exclude drag. R2 uses the Run Checker's own comparer
//   (capex/uat/uat_compare.js compareMarked: its B0.9 row) against the CLI guide set and, with UAT_PACK=<Shed_UAT_pack_….zip>, the published pack; R2z its same-line datum rule's falsifier.
//   UAT_B0_BREAK=prefill sets DXF_NO_PREFILL in the page: RP and R2 must FAIL.
//   §D115: RX the exclude box is a default (PR-EXCLUDE-JOINT, no drag; UAT_B0_BREAK=1 sets DXF_NO_JOINT and skips the drag: RX, R2, R3 FAIL); RF the footing default is read from the
//   dimensioned Footing Section (PR-BODYZ-CHAIN) and the guide's figure overrides it; UAT_B0_ALL=1 keeps every default (zero typing but the layers) and MEASURES what then differs.
// The guide's set is made here by the SAME CLI line as BIMCompiler scripts/guide/uat_shed_shots.js:17-19 (REF_FACTS below, copied verbatim).
// Usage: SHED_SHEETS=<raw Shed sheets dir> NODE_PATH=~/bim-compiler/node_modules node capex/tests/witness_uat_b0_raw_to_marked.js   (private set: SKIP without)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..'), MOD = path.join(ROOT, 'modeller'), BREAK = process.env.UAT_B0_BREAK === '1', NOPRE = process.env.UAT_B0_BREAK === 'prefill', TYPE_MISSING = process.env.UAT_B0_TYPE === '1',   // UAT_B0_TYPE=1: the pre-2026-11-24 guide (type what is missing)
  PACK = process.env.UAT_PACK || '', ALL = process.env.UAT_B0_ALL === '1';   // §D115 ALL: every default kept, nothing typed but the layers (the layer rule is not built yet)
let RF = [];
const SHD = (process.env.SHED_SHEETS || '/nonexistent') + '/';   // the private raw sheets dir: never named in code
const NAMES = ['0_FLOOR_PLAN', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '1N_ELEV_NORTH', '1S_ELEV_SOUTH', '2_ELEV_WEST', '7_ELEV_EAST', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const REF_FACTS = ['--complete', '--accept-suggestions', '--set', 'SHED', '--level', '0',
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794'];
// B0's steps = what the guide tells the tester to type (the same values; the exclude box is a drag inside the §5.84 tolerance)
const LAYERS = [['plan', 'Col', 'column'], ['plan', 'Fo', 'footing'], ['elev', 'Wall', 'panel'], ['elev', 'Rod', 'fan'], ['elev', 'Dim', 'net'], ['section', 'Fo', 'bar'], ['elev', 'Win', 'door'],
  ['elev', '0', 'column', '1S_ELEV_SOUTH.dxf'], ['plan', 'Dim', 'beam', '3_BEAM_LAYOUT.dxf'], ['plan', 'Rod', 'doorswing', '0_FLOOR_PLAN.dxf']];
const DATUMS = [['1S_ELEV_SOUTH.dxf', -4446.6], ['1N_ELEV_NORTH.dxf', -3895.2], ['2_ELEV_WEST.dxf', -4515.7264], ['7_ELEV_EAST.dxf', -3766.442], ['8_SECTION_AA_TRUSS.dxf', -3726.416]];
const BODYZ = [['footing', '-1.4478', '-1.143'], ['beam', '3.098794', '3.352794']];
const EX_AIM = [-20885, -5610, -20847, -4940], EX_TOL = { x0: [-20908, -20873.6], x1: [-20850.7, -20843.3], y0max: -5577.3, y1min: -4965.3 };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
let judged = 0, fails = 0; const say = s => console.log(s), ck = (id, c, i) => { judged++; if (!c) fails++; say('§UATB0 ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(i).slice(0, 600)); };
const DxfParser = require(path.join(MOD, 'lib', 'dxf-parser.js')), MK = require(path.join(MOD, 'dxf2bim', 'dxf2marks.js'));
const UC = require(path.join(ROOT, 'capex', 'uat', 'uat_compare.js')), textsOf = files => files.reduce((o, f) => (fs.existsSync(f) && (o[path.basename(f)] = fs.readFileSync(f, 'utf8')), o), {});   // the Run Checker's comparer
const marksOf = file => MK.readMarks(new DxfParser().parseSync(fs.readFileSync(file, 'utf8')).entities).map(m => ({ t: m.raw.replace(/\s+@BY=\S+$/, ''), x: Number(m.x.toFixed(2)), y: Number(m.y.toFixed(2)) }));
const key = m => m.t + ' @' + m.x + ',' + m.y;
(async () => {
  if (!NAMES.every(n => fs.existsSync(SHD + n + '.dxf'))) { say('§UATB0 SKIP the nine raw Shed sheets are not at ' + SHD + ' (private set)'); process.exit(0); }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uatb0-')), REF = path.join(TMP, 'ref'), DL = path.join(TMP, 'saved'); fs.mkdirSync(DL);
  const cli = cp.spawnSync('node', [path.join(MOD, 'dxf2bim_cli.js'), '--sheets'].concat(NAMES.map(n => SHD + n + '.dxf'), ['--out', REF], REF_FACTS), { encoding: 'utf8' });
  const refLine = (cli.stdout.match(/§CLI result .*/) || ['(none)'])[0].replace(/ out=\S+/, ''); say('§UATB0 ref set (guide CLI line) rc=' + cli.status + ' ' + refLine.slice(0, 200));
  if (cli.status !== 0) { say('§UATB0 STOPPED the reference CLI run failed: ' + (cli.stderr || '').slice(0, 300)); process.exit(1); }
  const refFiles = NAMES.map(n => path.join(REF, 'marked', n + '_marked.dxf'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const LAUNCH = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  async function load(br, files, noPre) { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); if (noPre) await pg.evaluateOnNewDocument(() => { window.DXF_NO_PREFILL = true; }); if (BREAK) await pg.evaluateOnNewDocument(() => { window.DXF_NO_JOINT = true; });   // §D115 the joint rule's falsifier   // §D114 the falsifier: the three pre-fill rules off
    pg.on('pageerror', e => say('§UATB0 PAGEERR ' + String(e).slice(0, 160)));
    pg.on('console', m => { const t = m.text(); if (/accept-all|edit sheet=|layer role=|add sheet=|exclude|save |§D98/.test(t)) say('  page: ' + t.slice(0, 220)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await idle(pg, 120000); return pg; }
  const idle = async (pg, t) => { await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: t || 60000 }); await sleep(600); };
  const head = pg => pg.evaluate(() => { const S = window.DxfMetaEditor.state, b = document.getElementById('dm-chip'), v = S.verdict || {};
    return { badge: b ? b.innerText.replace(/\s+/g, ' ').trim() : null, verdict: v.verdict, sheets: S.sheets.length, roles: S.sheets.filter(s => s.marks.some(m => m.key === 'VIEW')).length, yellow: document.querySelectorAll('#dm-yellows [data-act="confirm"],#dm-yellows [data-act="dconfirm"],#dm-yellows [data-act="defkeep"]').length }; });
  const openSec = (pg, id) => pg.evaluate(id => { const S = window.DxfMetaEditor.state; if (!S.sec[id]) { const h = document.querySelector('[data-act="sec"][data-sec="' + id + '"]'); if (h) h.click(); } return !!S.sec[id]; }, id);
  // the yellow list shows ONE "Accept all" when one kind of evidence is present, else "Accept stated + read" and "Accept inferred" (dxf_meta_editor.js renderYellows §D36): press what is there, as the tester does
  const acceptAll = async (pg, tag) => { for (let i = 1; i <= 6; i++) { const n0 = (await head(pg)).yellow; if (!n0) break;
    const which = await pg.evaluate(() => { const S = window.DxfMetaEditor.state; if (!S.sec.yellows) { const h = document.querySelector('[data-act="sec"][data-sec="yellows"]'); if (h) h.click(); }
      const b = ['acceptall', 'acceptsr', 'acceptinf'].map(a => document.querySelector('#dm-yellows [data-act="' + a + '"]')).find(Boolean); if (!b) return 'no accept button'; b.click(); return b.innerText.trim(); });
    await idle(pg); say('§UATB0 step ' + tag + ' round ' + i + ' pressed "' + which + '": yellow ' + n0 + ' -> ' + (await head(pg)).yellow); } };
  const stat = pg => pg.evaluate(() => { const e = document.querySelector('#dxf-status,.dxf-status,#ip-status'); return e ? e.innerText : ''; });
  const convert = async pg => { await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await pg.waitForFunction(() => { const b = document.getElementById('dxf-convert'); return b && !b.disabled; }, { timeout: 60000 }); await sleep(3000); await pg.evaluate(() => document.getElementById('dxf-convert').click());
    for (let i = 0; i < 240; i++) { const m = (await stat(pg)).match(/Converted: (\d+) elements[^\n]*/); if (m) return { n: Number(m[1]), line: m[0] }; await sleep(500); } return { n: null, line: await stat(pg) }; };

  // ---- run 1: the tester's B0 on the raw nine ----
  let br = await LAUNCH(); let pg = await load(br, NAMES.map(n => SHD + n + '.dxf'), NOPRE); if (NOPRE) say('§UATB0 BREAK=prefill: DXF_NO_PREFILL set in the page (RP and R2 must FAIL)');
  const h0 = await head(pg); say('§UATB0 opened raw nine: ' + JSON.stringify(h0));
  ck('R0 non-vacuous: nine raw sheets, none with a stated role, not Qualifies', h0.sheets === 9 && h0.roles === 0 && !/^qualifies$/i.test(h0.verdict || '') && !/Qualifies/i.test(h0.badge || ''), h0);
  await acceptAll(pg, 'B0.2');
  say('§UATB0 after Accept all: ' + JSON.stringify(await head(pg)));
  // §D114 what the drawings pre-filled (read from the panel's state, nothing typed yet): the set name, the datums; the body height comes after the layers
  const pre = () => pg.evaluate(() => { const S = window.DxfMetaEditor.state, mk = (s, k) => s.marks.filter(m => m.key === k);
    return { set: S.sheets.map(s => { const m = mk(s, 'SET')[0]; return m ? m.value + (m.rule ? ' (' + m.rule + ')' : '') : null; }),
      datums: S.sheets.map(s => mk(s, 'Z').filter(m => m.rule === 'PR-Z-LABEL').map(m => s.name + ' @Z=' + m.value + '@y=' + m.y)).flat(),
      bodyz: S.sheets.map(s => mk(s, 'BODYZ').filter(m => m.rule === 'PR-BODYZ-DRAWN').map(m => s.name + ' @BODYZ=' + m.value)).flat() }; });
  const p1 = await pre(); say('§UATB0 pre-filled after Accept all (no typing): ' + JSON.stringify(p1));
  // B0.3 Set: CHECK the default; type only when it is not the guide's name (§D98 replaces the placeholder on every sheet)
  await pg.evaluate(() => { const S = window.DxfMetaEditor.state; if (!S.sec.sheets) document.querySelector('[data-act="sec"][data-sec="sheets"]').click(); if (!S.open[0]) document.querySelector('[data-act="card"][data-sheet="0"]').click(); });
  const setShown = await pg.evaluate(() => { const el = document.getElementById('dm-f-0-SET'); return el ? el.value : null; }), setTyped = setShown !== 'SHED';
  // §D114 the guide's B0 now TYPES NOTHING for the set name, the beam height and the datums (check the default, override only if wrong): a missing default stays missing (the falsifier then fails R2)
  if (setTyped && TYPE_MISSING) { await pg.evaluate(() => { const el = document.getElementById('dm-f-0-SET'); el.value = 'SHED'; el.dispatchEvent(new Event('change')); }); await idle(pg); }
  say('§UATB0 step B0.3 Set field shows "' + setShown + '": ' + (setTyped ? 'NOT pre-filled' + (TYPE_MISSING ? ', TYPED SHED' : ', not typed (the guide types nothing here)') : 'checked the default, nothing typed') + ' -> ' + JSON.stringify(await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => (s.marks.find(m => m.key === 'SET') || {}).value))) + ' | ' + JSON.stringify(await head(pg)));
  // B0.4 Layers: the pooled select, or the per-sheet select after the row's split arrow
  await openSec(pg, 'layers');
  for (const [role, L, ui, only] of LAYERS) {
    const r = await pg.evaluate((role, L, ui, only) => {
      const sel = q => Array.from(document.querySelectorAll('select[data-act="layer"]')).find(s => s.getAttribute('data-role') === role && s.getAttribute('data-layer') === L && (only ? s.getAttribute('data-sheet') === only : !s.getAttribute('data-sheet')));
      let pooled = false;
      if (only && !sel()) { const k = role + '|' + L, b = Array.from(document.querySelectorAll('[data-act="laysplit"]')).find(x => x.getAttribute('data-key') === k); if (b) b.click();
        else {   // no split arrow: the layer is on ONE sheet of that role, so the pooled row is that sheet's row (the page offers no other control)
          const on = window.DxfMetaEditor.state.sheets.filter(q => q.dxf.entities.some(e => e.layer === L) && q.marks.some(m => m.key === 'VIEW' && m.value === { plan: 'PLAN', elev: 'ELEV', section: 'SECTION', roof: 'ROOF' }[role])).map(q => q.name);
          if (on.length === 1 && on[0] === only) { only = null; pooled = true; } else return 'no split arrow and the layer is on ' + JSON.stringify(on); } }
      const s = sel(); if (!s) { const row = Array.from(document.querySelectorAll('[data-layer-row]')).find(r => r.getAttribute('data-layer-row') === role + '|' + L + (only ? '|' + only : '')); return 'no select' + (row ? ' (row reads: ' + row.innerText.replace(/\s+/g, ' ').trim() + ')' : ' (no row)'); } if (!Array.from(s.options).some(o => o.value === ui)) return 'no option ' + ui + ' in [' + Array.from(s.options).map(o => o.value).join(',') + ']';
      s.value = ui; s.dispatchEvent(new Event('change')); return pooled ? 'set (pooled row: the layer is on this sheet only)' : 'set';
    }, role, L, ui, only || null);
    await idle(pg); say('§UATB0 step B0.4 layer ' + role + ' ' + L + (only ? ' (' + only + ')' : '') + ' = ' + ui + ': ' + r + ' | ' + JSON.stringify(await head(pg)));
  }
  await acceptAll(pg, 'B0.4b');
  // B0.5 Body heights: CHECK each kind's row; type only a kind that still waits with no default (§D114: the fields show the default, Accept all took it)
  await openSec(pg, 'bodyz');
  const bzShown = await pg.evaluate(() => ({ rows: Array.from(document.querySelectorAll('[data-bodyz-row]')).map(r => r.innerText.replace(/\s+/g, ' ').trim()), rules: Array.from(document.querySelectorAll('[data-bodyz-row] [data-rule]')).map(e => e.getAttribute('data-rule')), waiting: Array.from(document.querySelectorAll('[data-bodyz]')).map(r => r.getAttribute('data-bodyz')) }));
  say('§UATB0 step B0.5 Body heights shows: ' + JSON.stringify(bzShown));
  let typedN = setTyped ? 1 : 0;
  for (const [k, z0, z1] of BODYZ) {
    const have = await pg.evaluate(k => window.DxfMetaEditor.state.sheets.map(s => s.marks.filter(m => m.key === 'BODYZ' && String(m.value).split(',')[0] === k).map(m => m.value)).flat(), k);
    if (have.length === 1 && have[0] === k + ',' + z0 + ',' + z1) { say('§UATB0 step B0.5 body heights ' + k + ': checked the default @BODYZ=' + have[0] + ', nothing typed'); continue; }
    if (k === 'footing') {   // §D115 RF: the footing default comes from the drawings' dimensioned detail (PR-BODYZ-CHAIN); the guide's figure overrides it, unless UAT_B0_ALL=1 (all defaults, zero typing)
      const fr = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.marks.filter(m => m.key === 'BODYZ' && /^footing,/.test(m.value)).map(m => s.name + ' @BODYZ=' + m.value + ' (' + (m.rule || 'typed') + ')')).flat());
      RF = fr; say('§UATB0 step B0.5 footing default shown: ' + JSON.stringify(fr));
      if (ALL) { say('§UATB0 step B0.5 footing: ALL-DEFAULTS run, the default is kept (nothing typed)'); continue; }
      if (have.length) { const del = await pg.evaluate(() => { const b = Array.from(document.querySelectorAll('[data-bodyz-row="footing"] [data-act="bodyzdel"]'))[0]; if (!b) return 'no remove button'; b.click(); return 'removed the default'; }); await idle(pg); say('§UATB0 step B0.5 footing override: ' + del); }
    }
    if (k !== 'footing' && !TYPE_MISSING) { typedN++; say('§UATB0 step B0.5 body heights ' + k + ': NOT pre-filled (have ' + JSON.stringify(have) + '), not typed (the guide types nothing here)'); continue; }
    const r = await pg.evaluate((k, z0, z1) => { const a = document.getElementById('dm-bz-' + k + '-0'), b = document.getElementById('dm-bz-' + k + '-1'); if (!a || !b) return 'no row for ' + k; const shown = [a.value, b.value]; a.value = z0; b.value = z1;
      document.querySelector('[data-act="bodyzadd"][data-kind="' + k + '"]').click(); return 'TYPED (fields showed ' + JSON.stringify(shown) + ')'; }, k, z0, z1);
    if (k !== 'footing') typedN++;   // §D114: footing is NOT pre-filled (the drawings' footing detail and the guide disagree), typed as before
    await idle(pg); say('§UATB0 step B0.5 body heights ' + k + ' ' + z0 + '..' + z1 + ': ' + r + ' | ' + JSON.stringify(await head(pg)));
  }
  // B0.6 Level datums: CHECK each elevation / section card holds 0.6096 m at its PL line; type only where it does not
  for (const [name, y] of DATUMS) {
    const have = await pg.evaluate(name => { const s = window.DxfMetaEditor.state.sheets.find(q => q.name === name); return s ? s.marks.filter(m => m.key === 'Z' && Number(m.value) === 0.6096).map(m => m.y + (m.rule ? ' (' + m.rule + ')' : '')) : []; }, name);
    if (have.length === 1) { say('§UATB0 step B0.6 datum ' + name + ': checked the default @Z=0.6096 at y ' + have[0] + ' (the guide typed ' + y + '), nothing typed'); continue; }
    if (!TYPE_MISSING) { typedN++; say('§UATB0 step B0.6 datum ' + name + ': NOT pre-filled (have ' + JSON.stringify(have) + '), not typed (the guide types nothing here)'); continue; }
    const r = await pg.evaluate((name, y) => { const S = window.DxfMetaEditor.state, si = S.sheets.findIndex(s => s.name === name); if (si < 0) return 'no sheet';
      if (!S.open[si]) document.querySelector('[data-act="card"][data-sheet="' + si + '"]').click();
      const v = document.getElementById('dm-av-' + si + '-Z'), p = document.getElementById('dm-ap-' + si + '-Z'); if (!v || !p) return 'no datum row';
      v.value = '0.6096'; p.value = String(y); document.querySelector('[data-act="add"][data-sheet="' + si + '"][data-group="Z"]').click(); return 'TYPED si=' + si; }, name, y);
    typedN++; await idle(pg); say('§UATB0 step B0.6 datum ' + name + ' 0.6096 m at y ' + y + ': ' + r + ' | ' + JSON.stringify(await head(pg)));
  }
  const p2 = await pre(), nPre = (p2.set.every(v => v === 'SHED (PR-SET-TITLE)' || v === 'SHED (PR-SET)') && p2.set.some(v => /PR-SET-TITLE/.test(v)) ? 1 : 0) + p2.datums.length + p2.bodyz.length;
  say('§UATB0 pre-filled before the exclude step: ' + JSON.stringify(p2) + ' NOT pre-filled (of set name, beam height, five datums)=' + typedN);
  ck('RP the drawings pre-fill 7 values with no typing (1 set name on 9 sheets, 5 PL datums 0.6096 m, the beam body height), each naming its rule in the panel', nPre === 7 && typedN === 0 && p2.set.length === 9 && bzShown.rules.indexOf('PR-BODYZ-DRAWN') >= 0,
    { prefilled: nPre, typed: typedN, set: p2.set.slice(0, 2), datums: p2.datums, bodyz: p2.bodyz, bodyzRuleShown: bzShown.rules });
  // B0.7 Exclude area: choose 3_BEAM_LAYOUT, press Exclude area, drag a box round the expansion joint (camera placed over the joint = the tester's zoom)
  let exMark = null;
  const exD = await pg.evaluate(() => { const s = window.DxfMetaEditor.state.sheets.find(q => q.name === '3_BEAM_LAYOUT.dxf'); return s ? s.marks.filter(m => m.key === 'EXCLUDE').map(m => ({ v: m.value, rule: m.rule || null })) : []; });
  { const v = exD.length === 1 ? exD[0].v.split(',').map(Number) : null, inTol = !!v && v[0] > EX_TOL.x0[0] && v[0] < EX_TOL.x0[1] && v[2] > EX_TOL.x1[0] && v[2] < EX_TOL.x1[1] && v[1] < EX_TOL.y0max && v[3] > EX_TOL.y1min;
    say('§UATB0 step B0.7 exclude areas before any drag: ' + JSON.stringify(exD));
    ck('RX the expansion joint arrives as a default exclude box (PR-EXCLUDE-JOINT, no drag) inside the §5.84 tolerance', exD.length === 1 && exD[0].rule === 'PR-EXCLUDE-JOINT' && inTol, { exclude: exD, inside: inTol });
    ck('RF the footing default comes from the dimensioned Footing Section (PR-BODYZ-CHAIN): @BODYZ=footing,-1.8288,-1.524', RF.length === 1 && /@BODYZ=footing,-1\.8288,-1\.524 \(PR-BODYZ-CHAIN\)$/.test(RF[0]), { footing: RF }); }
  if (!BREAK && !exD.length) {
    await openSec(pg, 'excludes');
    const pts = await pg.evaluate(aim => { const S = window.DxfMetaEditor.state, THREE = window.THREE, A = window.A, c = window.DxfImportUI.state.canvas['3_BEAM_LAYOUT.dxf'];
      const sel = document.querySelector('[data-act="exsheet"]'); sel.value = '3_BEAM_LAYOUT.dxf'; sel.dispatchEvent(new Event('change'));
      document.querySelector('[data-act="tool"][data-tool="exclude"]').click();
      // aim where the sheet is DRAWN (c.toWorld: a plan after the first is shifted onto it by its shared grid labels), as a tester sees and drags it
      const k = c.k, z = c.z, W = (x, y) => c.toWorld(x, y), m0 = W(aim[0], aim[1]), m1 = W(aim[2], aim[3]), cx = (m0[0] + m1[0]) / 2, cy = (m0[1] + m1[1]) / 2, span = Math.abs(m1[1] - m0[1]);
      const rc = A.renderer.domElement.getBoundingClientRect(), pnl = document.querySelector('#dm-panel,.dm-panel'), pr = pnl ? pnl.getBoundingClientRect().right : rc.left, dist = span * 1.25;
      // over the joint, then panned so it sits in the middle of the canvas strip the panel does not cover (as highlight() does)
      const wpp = 2 * dist * Math.tan(A.camera.fov * Math.PI / 360) / rc.height, dx = ((pr + (rc.right - pr) / 2) - (rc.left + rc.width / 2)) * wpp;
      A.camera.up.set(0, 1, 0); A.controls.target.set(cx - dx, cy, z); A.camera.position.set(cx - dx, cy, z + dist); A.controls.update(); A.camera.updateMatrixWorld(); if (A.requestRender) A.requestRender();
      const scr = (x, y) => { const w = W(x, y), v = new THREE.Vector3(w[0], w[1], w[2]).project(A.camera); return [rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height]; };
      const tw = c.toWorld(aim[0], aim[1]);
      return { drawnAt: [tw[0], tw[1], tw[2]].map(v => +v.toFixed(4)), dragPlane: [aim[0] * k, aim[1] * k, z].map(v => +v.toFixed(4)), a: scr(aim[0], aim[3]), b: scr(aim[2], aim[1]), tool: S.tool, k, z, panelRight: pr, hitAt: (function () { const e = document.elementFromPoint(scr(aim[0], aim[3])[0] + 1, scr(aim[0], aim[3])[1] + 1); return e ? e.tagName + '#' + e.id : null; })(), canvas: [rc.left, rc.top, rc.width, rc.height] };
    }, EX_AIM);
    say('§UATB0 step B0.7 exclude aim (drawing) ' + EX_AIM.join(',') + ' -> screen ' + JSON.stringify(pts));
    await sleep(500); await pg.mouse.move(pts.a[0], pts.a[1]); await pg.mouse.down(); await pg.mouse.move((pts.a[0] + pts.b[0]) / 2, (pts.a[1] + pts.b[1]) / 2, { steps: 4 }); await pg.mouse.move(pts.b[0], pts.b[1], { steps: 4 }); await pg.mouse.up(); await idle(pg);
    exMark = await pg.evaluate(() => { const s = window.DxfMetaEditor.state.sheets.find(q => q.name === '3_BEAM_LAYOUT.dxf'); const m = s.marks.find(q => q.key === 'EXCLUDE'); return m ? m.value : null; });
    say('§UATB0 step B0.7 @EXCLUDE written: ' + exMark + ' | ' + JSON.stringify(await head(pg)));
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; if (S.tool === 'exclude') document.querySelector('[data-act="tool"][data-tool="exclude"]').click(); });
  } else say('§UATB0 ' + (BREAK ? 'BREAK: exclude drag skipped (DXF_NO_JOINT in the page)' : 'step B0.7: the default box stands, no drag'));
  await acceptAll(pg, 'B0.8');
  const h1 = await head(pg); say('§UATB0 after B0: ' + JSON.stringify(h1));
  ck('R1 after B0 the badge reads Qualifies and no yellow row is open', /^qualifies$/i.test(h1.verdict || '') && /Qualifies/i.test(h1.badge || '') && h1.yellow === 0, h1);
  // B0.9 Save marked copies
  const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }));
  await pg.evaluate(() => document.getElementById('dm-save').click());
  for (let i = 0; i < 40 && fs.readdirSync(DL).filter(f => /_marked\.dxf$/.test(f)).length < 9; i++) await sleep(500);
  const saved = fs.readdirSync(DL).filter(f => /_marked\.dxf$/.test(f)).sort(); say('§UATB0 step B0.9 saved ' + saved.length + ': ' + saved.join(','));
  const conv1 = await convert(pg); say('§UATB0 tester set Convert: ' + conv1.line);
  await pg.close(); await br.close();
  // R2 the saved marks == the supplied set's, by the Run Checker's own comparer (uat_compare.compareMarked, its B0.9 row): the CLI guide set, and the published pack's marked/ when UAT_PACK names it
  const mine = textsOf(NAMES.map(n => path.join(DL, n + '_marked.dxf')));
  NAMES.forEach((n, i) => { const f = path.join(DL, n + '_marked.dxf'); say('§UATB0 marks ' + n + ': saved ' + (fs.existsSync(f) ? marksOf(f).length : 'NOT SAVED') + ' guide ' + marksOf(refFiles[i]).length); });
  const cmR = UC.compareMarked(mine, textsOf(refFiles), { DxfParser, Dxf2Marks: MK }, EX_TOL);
  say('§UATB0 B0.9 vs the CLI guide set: ' + cmR.verdict + ' sheets=' + cmR.sheets + ' diffs=' + JSON.stringify(cmR.diffs.slice(0, 8)) + ' same-line datums=' + JSON.stringify(cmR.zline) + ' exclude=' + JSON.stringify(cmR.exclude));
  let cmP = null;
  if (PACK) { const PK = path.join(TMP, 'pack'); fs.mkdirSync(PK); cp.spawnSync('unzip', ['-q', '-o', PACK, '-d', PK]); const man = JSON.parse(fs.readFileSync(path.join(PK, 'manifest.json'), 'utf8'));
    cmP = UC.compareMarked(mine, textsOf(NAMES.map(n => path.join(PK, 'marked', n + '_marked.dxf'))), { DxfParser, Dxf2Marks: MK }, man.exclude_tolerance);
    say('§UATB0 B0.9 vs the supplied pack ' + path.basename(PACK) + ' (built ' + man.built + '): ' + cmP.verdict + ' sheets=' + cmP.sheets + ' diffs=' + JSON.stringify(cmP.diffs.slice(0, 8)) + ' same-line datums=' + JSON.stringify(cmP.zline)); }
  else say('§UATB0 B0.9 vs the supplied pack: not judged (UAT_PACK not given)');
  ck('R2 B0.9: the saved nine equal the supplied marked set by the Run Checker (uat_compare.compareMarked): the CLI guide set' + (PACK ? ' AND the published pack' : ''), saved.length === 9 && cmR.verdict === 'PASS' && cmR.sheets === 9 && cmR.exclude.length === 1 && (!PACK || (cmP.verdict === 'PASS' && cmP.sheets === 9)),
    { saved: saved.length, cli: cmR.verdict, cliDiffs: cmR.diffs.slice(0, 6), pack: cmP ? cmP.verdict : 'not given', packDiffs: cmP ? cmP.diffs.slice(0, 6) : null });
  // R2z the same-line datum rule is not loose: a datum one drawn line off (the line 4 in under the PL line) FAILS the checker
  { const OFF = path.join(TMP, 'off'), c2 = cp.spawnSync('node', [path.join(MOD, 'dxf2bim_cli.js'), '--sheets'].concat(NAMES.map(n => SHD + n + '.dxf'), ['--out', OFF], REF_FACTS.map(a => a === '1S_ELEV:0.6096@-4446.6' ? '1S_ELEV:0.6096@-4450.5812' : a)), { encoding: 'utf8' });
    const cz = UC.compareMarked(textsOf(NAMES.map(n => path.join(OFF, 'marked', n + '_marked.dxf'))), textsOf(refFiles), { DxfParser, Dxf2Marks: MK }, EX_TOL);
    ck('R2z falsifier: 1S_ELEV datum typed on the NEXT line (y -4450.5812) -> the checker FAILS it', cz.sheets === 9 && cz.verdict === 'FAIL' && cz.diffs.some(d => /1S_ELEV_SOUTH: (extra|missing) @Z=0\.6096/.test(d)), { cliRc: c2.status, sheets: cz.sheets, verdict: cz.verdict, diffs: cz.diffs.slice(0, 4) }); }
  // R3 Convert: tester set vs the guide set in the same page build
  br = await LAUNCH(); pg = await load(br, refFiles); const conv2 = await convert(pg); say('§UATB0 guide set Convert: ' + conv2.line); await pg.close(); await br.close(); srv.close();
  ck('R3 Convert on the tester set == Convert on the guide set', conv1.n !== null && conv1.n === conv2.n && conv2.n > 0, { tester: conv1.line, guide: conv2.line });
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; say('§UATB0_VERDICT ' + v + ' judged=' + judged + ' fails=' + fails + (BREAK ? ' (BREAK: R2+R3 must FAIL)' : NOPRE ? ' (BREAK=prefill: RP+R2 must FAIL)' : '')); process.exit(fails ? 1 : 0);
})().catch(e => { say('§UATB0 STOPPED ' + (e.stack || e).toString().slice(0, 500)); process.exit(1); });
