#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-UAT-CHAIN (bim-ootb prompts/CAPEX_DASHBOARD.md §5.86). READ THE LOG: the §UATCH lines carry the evidence, the exit code does not.
// THE ISSUE IT PROVES OR DISPROVES: "a tester who follows the UAT guide from the BricsCAD export reaches a different model, database or cost than the proven run".
// The tester run (T) and the proven run (P, the supplied marked set) go through the SAME stages in the same page build; each stage of T is judged against P:
//   E export   the nine sheets as ASCII DXF 2018 (guide B00; an ezdxf stand-in for BricsCAD's DXFOUT): AC1032, $INSUNITS 1
//   M marked   B0 in the real Modeller, Save marked copies == the supplied marked set, mark for mark (§5.84 rule: @BODYZ over the set, @EXCLUDE by tolerance)
//   C convert  "Converted: N elements …" equal
//   D database Export > Viewer database: every element (class, material, world bbox to 1 mm) and every table's row count equal
//   D' vs CLI  T's database against the CLI reference rebuilt now (the model folder's recipe): every difference must be the NAMED §D59/§D88 wall merge
//              (the CLI writes its IFC before toOps: OPEN defect, §5.86); any other difference FAILS
//   V viewer   the blank Viewer opens each database by Ctrl+O: "DONE — SHED N elements" and the Find box's "total cost" answer equal
// UAT_CHAIN_BREAK=1 skips the exclude drag in T: M, C, D and V must FAIL. Private set: SHED_DIR (sheets/, sheets_v2/); python3 + ezdxf; SKIP without.
// Usage: SHED_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node capex/tests/witness_uat_chain.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..'), MOD = path.join(ROOT, 'modeller'), DIR = process.env.SHED_DIR || '', BREAK = process.env.UAT_CHAIN_BREAK === '1';
const EXTRACTOR = process.env.EXTRACTOR || path.join(process.env.HOME, 'bim-compiler', 'scripts', 'extractIFC2DB.js');
const NAMES = ['0_FLOOR_PLAN', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '1N_ELEV_NORTH', '1S_ELEV_SOUTH', '2_ELEV_WEST', '7_ELEV_EAST', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const FACTS = ['--complete', '--accept-suggestions', '--set', 'SHED', '--level', '0',   // BIMCompiler scripts/guide/uat_shed_shots.js:17-19 = model/build_model.sh, verbatim
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794'];
const LAYERS = [['plan', 'Col', 'column'], ['plan', 'Fo', 'footing'], ['elev', 'Wall', 'panel'], ['elev', 'Rod', 'fan'], ['elev', 'Dim', 'net'], ['section', 'Fo', 'bar'], ['elev', 'Win', 'door'],
  ['elev', '0', 'column', '1S_ELEV_SOUTH.dxf'], ['plan', 'Dim', 'beam', '3_BEAM_LAYOUT.dxf'], ['plan', 'Rod', 'doorswing', '0_FLOOR_PLAN.dxf']];
const DATUMS = [['1S_ELEV_SOUTH.dxf', -4446.6], ['1N_ELEV_NORTH.dxf', -3895.2], ['2_ELEV_WEST.dxf', -4515.7264], ['7_ELEV_EAST.dxf', -3766.442], ['8_SECTION_AA_TRUSS.dxf', -3726.416]];
const BODYZ = [['footing', '-1.4478', '-1.143'], ['beam', '3.098794', '3.352794']];
const EX_AIM = [-20885, -5610, -20847, -4940], EX_TOL = { x0: [-20908, -20873.6], x1: [-20850.7, -20843.3], y0max: -5577.3, y1min: -4965.3 };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
let judged = 0, fails = 0; const say = s => console.log(s), ck = (id, c, i) => { judged++; if (!c) fails++; say('§UATCH ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(i).slice(0, 700)); };
const DxfParser = require(path.join(MOD, 'lib', 'dxf-parser.js')), MK = require(path.join(MOD, 'dxf2bim', 'dxf2marks.js'));
const marksOf = f => MK.readMarks(new DxfParser().parseSync(fs.readFileSync(f, 'utf8')).entities).map(m => ({ t: m.raw.replace(/\s+@BY=\S+$/, ''), x: Number(m.x.toFixed(2)), y: Number(m.y.toFixed(2)) }));
const PY = String.raw`
import sys, os, json, sqlite3, ezdxf
mode = sys.argv[1]
if mode == 'export':          # the B00 setting: ASCII DXF 2018, units as drawn
    src, dst = sys.argv[2], sys.argv[3]; os.makedirs(dst, exist_ok=True); out = []
    for n in sys.argv[4].split(','):
        doc = ezdxf.readfile(os.path.join(src, n + '.dxf')); doc.dxfversion = 'AC1032'; p = os.path.join(dst, n + '.dxf'); doc.saveas(p)
        d2 = ezdxf.readfile(p); out.append([n, d2.dxfversion, d2.header.get('$INSUNITS')])
    print(json.dumps(out))
elif mode == 'db':            # one database as rows: (class, material, bbox to 1 mm) + every table's row count
    c = sqlite3.connect(sys.argv[2])
    rows = c.execute("select m.ifc_class, coalesce(m.material_name,''), b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ from elements_meta m left join element_world_bbox b on b.guid=m.guid").fetchall()
    tabs = {t: c.execute('select count(*) from "%s"' % t).fetchone()[0] for (t,) in c.execute("select name from sqlite_master where type='table'")}
    print(json.dumps({'rows': [[r[0], r[1]] + [None if v is None else round(v, 3) for v in r[2:]] for r in rows], 'tables': tabs}))
`;
const py = (args) => { const r = cp.spawnSync('python3', [PYF].concat(args), { encoding: 'utf8', maxBuffer: 256 << 20 }); if (r.status !== 0) throw new Error('python ' + args[0] + ': ' + (r.stderr || '').slice(-300)); return JSON.parse(r.stdout); };
let PYF = null;
const rowKey = r => r.join('|');
function multisetDiff(a, b) { const m = new Map(); a.forEach(r => m.set(rowKey(r), (m.get(rowKey(r)) || 0) + 1)); const onlyB = []; b.forEach(r => { const k = rowKey(r); if (m.get(k)) m.set(k, m.get(k) - 1); else onlyB.push(r); });
  const onlyA = []; a.forEach(r => { const k = rowKey(r); if (m.get(k) > 0) { onlyA.push(r); m.set(k, m.get(k) - 1); } }); return { onlyA, onlyB }; }
(async () => {
  const RAW = path.join(DIR, 'sheets'), V2 = path.join(DIR, 'sheets_v2');
  if (!DIR || !NAMES.every(n => fs.existsSync(path.join(RAW, n + '.dxf')) && fs.existsSync(path.join(V2, n + '.dxf')))) { say('§UATCH SKIP no private Shed set at SHED_DIR=' + DIR); process.exit(0); }
  if (cp.spawnSync('python3', ['-c', 'import ezdxf'], { encoding: 'utf8' }).status !== 0) { say('§UATCH SKIP python3 + ezdxf not available'); process.exit(0); }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uatch-')); PYF = path.join(TMP, 'w.py'); fs.writeFileSync(PYF, PY);
  say('§UATCH start' + (BREAK ? ' (BREAK: the exclude drag is skipped in the tester run)' : '') + ' tmp=' + TMP);
  // ---- E: the export ----
  const EXP = path.join(TMP, 'export'), ex = py(['export', V2, EXP, NAMES.join(',')]);
  ck('E export: nine ASCII DXF 2018 files with their units (AC1032, $INSUNITS 1)', ex.length === 9 && ex.every(x => x[1] === 'AC1032' && x[2] === 1), ex);
  // ---- the proven marked set (the supplied copies are made by this line) and the CLI reference database ----
  const REF = path.join(TMP, 'ref'), cli = cp.spawnSync('node', [path.join(MOD, 'dxf2bim_cli.js'), '--sheets'].concat(NAMES.map(n => path.join(RAW, n + '.dxf')), ['--out', REF, '--ifc'], FACTS), { encoding: 'utf8', maxBuffer: 64 << 20 });
  say('§UATCH reference CLI rc=' + cli.status + ' ' + ((cli.stdout.match(/§CLI result ok=\w+ bodies=\d+/) || ['(none)'])[0]));
  if (cli.status !== 0) { say('§UATCH STOPPED reference CLI failed'); process.exit(1); }
  const refMarked = NAMES.map(n => path.join(REF, 'marked', n + '_marked.dxf'));
  let cliDb = null; if (fs.existsSync(EXTRACTOR)) { const x = cp.spawnSync('node', [EXTRACTOR, '--ifc', path.join(REF, 'model.ifc'), '-o', path.join(TMP, 'cli_ref.db')], { encoding: 'utf8', maxBuffer: 64 << 20 }); say('§UATCH CLI reference db: ' + ((x.stdout.match(/§SUMMARY[^\n]*/) || ['rc=' + x.status])[0])); if (x.status === 0) cliDb = path.join(TMP, 'cli_ref.db'); }
  else say('§UATCH CLI reference db: extractor not at ' + EXTRACTOR + ' (D\' not judged)');
  // ---- the page harness (the W-UAT-B0 / W-DXF-KEEP one) ----
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port, LAUNCH = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const idle = async pg => { await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await sleep(600); };
  const head = pg => pg.evaluate(() => { const S = window.DxfMetaEditor.state, b = document.getElementById('dm-chip'), v = S.verdict || {};
    return { badge: b ? b.innerText.replace(/\s+/g, ' ').trim() : null, verdict: v.verdict, yellow: document.querySelectorAll('#dm-yellows [data-act="confirm"],#dm-yellows [data-act="dconfirm"],#dm-yellows [data-act="defkeep"]').length }; });
  const openSec = (pg, id) => pg.evaluate(id => { const S = window.DxfMetaEditor.state; if (!S.sec[id]) { const h = document.querySelector('[data-act="sec"][data-sec="' + id + '"]'); if (h) h.click(); } }, id);
  const acceptAll = async pg => { for (let i = 0; i < 6 && (await head(pg)).yellow; i++) { await pg.evaluate(() => { const S = window.DxfMetaEditor.state; if (!S.sec.yellows) { const h = document.querySelector('[data-act="sec"][data-sec="yellows"]'); if (h) h.click(); }
    const b = ['acceptall', 'acceptsr', 'acceptinf'].map(a => document.querySelector('#dm-yellows [data-act="' + a + '"]')).find(Boolean); if (b) b.click(); }); await idle(pg); } };
  async function modeller(br, files, tag) {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => say('§UATCH ' + tag + ' PAGEERR ' + String(e).slice(0, 160)));
    pg.on('console', m => { const t = m.text(); if (/§VIEWERDB name=/.test(t)) say('  ' + tag + ' page: ' + t.slice(0, 260)); });
    await pg.goto(BASE + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files); await idle(pg); return pg; }
  async function b0(pg) {   // the guide's B0, through the panel's own controls (as W-UAT-B0)
    await acceptAll(pg);
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; if (!S.sec.sheets) document.querySelector('[data-act="sec"][data-sec="sheets"]').click(); if (!S.open[0]) document.querySelector('[data-act="card"][data-sheet="0"]').click(); });
    await pg.evaluate(() => { const el = document.getElementById('dm-f-0-SET'); el.value = 'SHED'; el.dispatchEvent(new Event('change')); }); await idle(pg);
    await openSec(pg, 'layers');
    for (const [role, L, ui, only0] of LAYERS) { const r = await pg.evaluate((role, L, ui, only) => {
        const sel = () => Array.from(document.querySelectorAll('select[data-act="layer"]')).find(s => s.getAttribute('data-role') === role && s.getAttribute('data-layer') === L && (only ? s.getAttribute('data-sheet') === only : !s.getAttribute('data-sheet')));
        if (only && !sel()) { const b = Array.from(document.querySelectorAll('[data-act="laysplit"]')).find(x => x.getAttribute('data-key') === role + '|' + L); if (b) b.click(); else only = null; }
        const s = sel(); if (!s) return 'no select'; s.value = ui; s.dispatchEvent(new Event('change')); return 'set'; }, role, L, ui, only0 || null); await idle(pg); if (r !== 'set') say('§UATCH T layer ' + role + ' ' + L + ': ' + r); }
    await acceptAll(pg); await openSec(pg, 'bodyz');
    for (const [k, z0, z1] of BODYZ) { await pg.evaluate((k, z0, z1) => { document.getElementById('dm-bz-' + k + '-0').value = z0; document.getElementById('dm-bz-' + k + '-1').value = z1; document.querySelector('[data-act="bodyzadd"][data-kind="' + k + '"]').click(); }, k, z0, z1); await idle(pg); }
    for (const [name, y] of DATUMS) { await pg.evaluate((name, y) => { const S = window.DxfMetaEditor.state, si = S.sheets.findIndex(s => s.name === name); if (!S.open[si]) document.querySelector('[data-act="card"][data-sheet="' + si + '"]').click();
      document.getElementById('dm-av-' + si + '-Z').value = '0.6096'; document.getElementById('dm-ap-' + si + '-Z').value = String(y); document.querySelector('[data-act="add"][data-sheet="' + si + '"][data-group="Z"]').click(); }, name, y); await idle(pg); }
    if (!BREAK) { await openSec(pg, 'excludes');
      const pts = await pg.evaluate(aim => { const THREE = window.THREE, A = window.A, c = window.DxfImportUI.state.canvas['3_BEAM_LAYOUT.dxf'];
        const sel = document.querySelector('[data-act="exsheet"]'); sel.value = '3_BEAM_LAYOUT.dxf'; sel.dispatchEvent(new Event('change')); document.querySelector('[data-act="tool"][data-tool="exclude"]').click();
        const W = (x, y) => c.toWorld(x, y), m0 = W(aim[0], aim[1]), m1 = W(aim[2], aim[3]), cx = (m0[0] + m1[0]) / 2, cy = (m0[1] + m1[1]) / 2, span = Math.abs(m1[1] - m0[1]);
        const rc = A.renderer.domElement.getBoundingClientRect(), pnl = document.querySelector('#dm-panel,.dm-panel'), pr = pnl ? pnl.getBoundingClientRect().right : rc.left, dist = span * 1.25;
        const wpp = 2 * dist * Math.tan(A.camera.fov * Math.PI / 360) / rc.height, dx = ((pr + (rc.right - pr) / 2) - (rc.left + rc.width / 2)) * wpp;
        A.camera.up.set(0, 1, 0); A.controls.target.set(cx - dx, cy, c.z); A.camera.position.set(cx - dx, cy, c.z + dist); A.controls.update(); A.camera.updateMatrixWorld(); if (A.requestRender) A.requestRender();
        const scr = (x, y) => { const w = W(x, y), v = new THREE.Vector3(w[0], w[1], w[2]).project(A.camera); return [rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height]; };
        return { a: scr(aim[0], aim[3]), b: scr(aim[2], aim[1]) }; }, EX_AIM);
      await sleep(500); await pg.mouse.move(pts.a[0], pts.a[1]); await pg.mouse.down(); await pg.mouse.move((pts.a[0] + pts.b[0]) / 2, (pts.a[1] + pts.b[1]) / 2, { steps: 4 }); await pg.mouse.move(pts.b[0], pts.b[1], { steps: 4 }); await pg.mouse.up(); await idle(pg);
      await pg.evaluate(() => { if (window.DxfMetaEditor.state.tool === 'exclude') document.querySelector('[data-act="tool"][data-tool="exclude"]').click(); }); }
    await acceptAll(pg); return head(pg); }
  async function convertAndExport(pg, dl, tag) {
    const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await pg.waitForFunction(() => { const b = document.getElementById('dxf-convert'); return b && !b.disabled; }, { timeout: 60000 }); await sleep(3000);
    await pg.evaluate(() => document.getElementById('dxf-convert').click());
    let conv = null; for (let i = 0; i < 240 && !conv; i++) { const t = await pg.evaluate(() => { const e = document.querySelector('#dxf-status,.dxf-status,#ip-status'); return e ? e.innerText : ''; }); const m = t.match(/Converted: (\d+) elements[^\n]*/); if (m) conv = { n: Number(m[1]), line: m[0] }; else await sleep(500); }
    say('§UATCH ' + tag + ' convert: ' + (conv ? conv.line : 'none'));
    await pg.click('#b-export'); await pg.waitForSelector('#m-export-panel .me-row[data-key="vdb"]', { visible: true }); await sleep(500); await pg.click('#m-export-panel .me-row[data-key="vdb"]');
    for (let i = 0; i < 240 && !fs.readdirSync(dl).some(f => /\.db$/.test(f)); i++) await sleep(500);
    const db = fs.readdirSync(dl).filter(f => /\.db$/.test(f)).map(f => path.join(dl, f))[0] || null; say('§UATCH ' + tag + ' database: ' + db); return { conv, db }; }
  // ---- T: the tester run ----
  let br = await LAUNCH(); const T_SAVED = path.join(TMP, 'T_saved'), T_DL = path.join(TMP, 'T_db'); fs.mkdirSync(T_SAVED); fs.mkdirSync(T_DL);
  let pg = await modeller(br, NAMES.map(n => path.join(EXP, n + '.dxf')), 'T'); const hT = await b0(pg); say('§UATCH T after B0: ' + JSON.stringify(hT));
  const cdpS = await pg.target().createCDPSession(); await cdpS.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: T_SAVED });
  await pg.evaluate(() => document.getElementById('dm-save').click()); for (let i = 0; i < 40 && fs.readdirSync(T_SAVED).filter(f => /_marked\.dxf$/.test(f)).length < 9; i++) await sleep(500);
  const T = await convertAndExport(pg, T_DL, 'T'); await br.close();
  // ---- P: the proven run (the supplied marked set) ----
  br = await LAUNCH(); const P_DL = path.join(TMP, 'P_db'); fs.mkdirSync(P_DL); pg = await modeller(br, refMarked, 'P'); const y0 = (await head(pg)).yellow; await acceptAll(pg); say('§UATCH P guide B2.2c Accept all: yellow ' + y0 + ' -> ' + (await head(pg)).yellow); const P = await convertAndExport(pg, P_DL, 'P'); await br.close();
  // ---- M ----
  const diffs = [], exOk = [], bzA = [], bzB = [];
  NAMES.forEach((n, i) => { const f = path.join(T_SAVED, n + '_marked.dxf'); if (!fs.existsSync(f)) { diffs.push(n + ' not saved'); return; }
    const a = marksOf(f), b = marksOf(refMarked[i]), sp = m => /^@(EXCLUDE|BODYZ)=/.test(m.t), K = m => m.t + ' @' + m.x + ',' + m.y;
    const ka = a.filter(m => !sp(m)).map(K).sort(), kb = b.filter(m => !sp(m)).map(K).sort(); ka.filter(x => !kb.includes(x)).forEach(x => diffs.push(n + ' extra ' + x)); kb.filter(x => !ka.includes(x)).forEach(x => diffs.push(n + ' missing ' + x));
    bzA.push(...a.filter(m => /^@BODYZ=/.test(m.t)).map(m => m.t)); bzB.push(...b.filter(m => /^@BODYZ=/.test(m.t)).map(m => m.t));
    const ea = a.filter(m => /^@EXCLUDE=/.test(m.t)), eb = b.filter(m => /^@EXCLUDE=/.test(m.t)); if (ea.length !== eb.length) diffs.push(n + ' @EXCLUDE ' + ea.length + ' vs ' + eb.length);
    ea.forEach(m => { const v = m.t.split('=')[1].split(',').map(Number); exOk.push(v[0] > EX_TOL.x0[0] && v[0] < EX_TOL.x0[1] && v[2] > EX_TOL.x1[0] && v[2] < EX_TOL.x1[1] && v[1] < EX_TOL.y0max && v[3] > EX_TOL.y1min); }); });
  if (JSON.stringify(bzA.sort()) !== JSON.stringify(bzB.sort())) diffs.push('@BODYZ over the set differs');
  ck('M marked: the tester\'s saved nine == the supplied marked set', /^qualifies$/i.test(hT.verdict || '') && diffs.length === 0 && exOk.length === 1 && exOk[0], { verdict: hT.verdict, diffs: diffs.slice(0, 8), nDiff: diffs.length, excludeInside: exOk });
  // ---- C ----
  ck('C convert: the tester\'s Convert == the proven run\'s', !!(T.conv && P.conv) && T.conv.line === P.conv.line, { T: T.conv && T.conv.line, P: P.conv && P.conv.line });
  // ---- D ----
  const dT = T.db ? py(['db', T.db]) : null, dP = P.db ? py(['db', P.db]) : null;
  if (dT && dP) { const md = multisetDiff(dP.rows, dT.rows), tabDiff = Object.keys(Object.assign({}, dT.tables, dP.tables)).filter(k => dT.tables[k] !== dP.tables[k]).map(k => k + ' ' + dP.tables[k] + '->' + dT.tables[k]);
    ck('D database: every element row and every table count equal to the proven run\'s', md.onlyA.length === 0 && md.onlyB.length === 0 && tabDiff.length === 0 && dT.rows.length > 0, { elements: dT.rows.length, onlyProven: md.onlyA.slice(0, 4), onlyTester: md.onlyB.slice(0, 4), tables: tabDiff }); }
  else ck('D database: both runs exported a database', false, { T: T.db, P: P.db });
  // ---- D' ----
  // two IFC writers (the CLI's dxf2ifc.js, the Modeller's export) differ below 1 cm in a bbox; §5.86 measured the parity at 1 cm: matched by class + material + every bbox side within TOLC
  const TOLC = 0.01, tolDiff = (A, B) => { const used = new Set(), onlyA = []; A.forEach(r => { const i = B.findIndex((q, j) => !used.has(j) && q[0] === r[0] && q[1] === r[1] && r.slice(2).every((v, k) => v !== null && q[2 + k] !== null && Math.abs(v - q[2 + k]) <= TOLC)); if (i < 0) onlyA.push(r); else used.add(i); });
    return { onlyA, onlyB: B.filter((q, j) => !used.has(j)) }; };
  if (cliDb && dT) { const dC = py(['db', cliDb]), mm = multisetDiff(dC.rows, dT.rows), md = tolDiff(dC.rows, dT.rows); say('§UATCH D\' at 1 mm: ' + mm.onlyA.length + ' CLI rows unmatched; at 1 cm: ' + md.onlyA.length);
    // the named §D59/§D88 difference: exactly 2 CLI wall pieces whose union is ONE tester wall, plus exactly 2 tester openings inside that wall's box
    const cw = md.onlyA.filter(r => r[0] === 'IfcWall'), tw = md.onlyB.filter(r => r[0] === 'IfcWall'), to = md.onlyB.filter(r => r[0] === 'IfcOpeningElement'), near = (a, b) => Math.abs(a - b) <= TOLC;
    const named = md.onlyA.length === 2 && cw.length === 2 && tw.length === 1 && to.length === 2 && md.onlyB.length === 3 && (() => { const w = tw[0], u = [Math.min(cw[0][2], cw[1][2]), Math.max(cw[0][3], cw[1][3]), Math.min(cw[0][4], cw[1][4]), Math.max(cw[0][5], cw[1][5]), cw[0][6], cw[0][7]];
      return u.every((v, k) => near(v, w[2 + k])) && to.every(o => o[2] >= w[2] - TOLC && o[3] <= w[3] + TOLC && o[4] >= w[4] - TOLC && o[5] <= w[5] + TOLC); })();
    say('§UATCH D\' CLI reference ' + dC.rows.length + ' elements vs tester ' + dT.rows.length + ': only in CLI ' + JSON.stringify(md.onlyA.slice(0, 4)) + ' only in tester ' + JSON.stringify(md.onlyB.slice(0, 4)));
    ck('D\' tester database vs the CLI reference: the only difference is the NAMED wall merge (OPEN defect §5.86: the CLI writes its IFC before toOps)', named, { onlyCli: md.onlyA.length, onlyTester: md.onlyB.length, matched: dT.rows.length - md.onlyB.length }); }
  // ---- V ----
  async function viewer(br, db, tag) {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => say('§UATCH ' + tag + ' viewer PAGEERR ' + String(e).slice(0, 160)));
    await pg.goto(BASE + '/viewer/viewer.html?blank=1', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', { timeout: 120000 }); await sleep(1500);
    await pg.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) { window.showOpenFilePicker = undefined; } });
    let ch = null; try { [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 8000 }), pg.keyboard.down('Control').then(() => pg.keyboard.press('o')).then(() => pg.keyboard.up('Control'))]); } catch (e) { ch = null; }
    let how = 'Ctrl+O'; if (!ch) { how = 'APP.openModelDb (Ctrl+O gave no chooser)'; [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 15000 }), pg.evaluate(() => window.APP.openModelDb())]); }
    await ch.accept([db]);
    let done = null; for (let i = 0; i < 360 && !done; i++) { const t = await pg.evaluate(() => { const A = window.APP; return A && A.status ? A.status.textContent : ''; }); if (/DONE/.test(t)) done = t; else await sleep(500); }
    await pg.evaluate(() => { const i = document.getElementById('nlp-input'); if (i) { i.value = 'total cost'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } }); await sleep(2500);
    const cost = await pg.evaluate(() => { const m = document.body.innerText.match(/[A-Z]{2,4} [\d,]+ \([A-Z]{2,4} [\d,]+\) — total building cost/); return m ? m[0] : null; });
    say('§UATCH ' + tag + ' viewer opened by ' + how + ': ' + (done || 'no DONE') + ' | total cost: ' + cost); await pg.close(); return { done: done && done.replace(/\(\d+ instanced[^)]*\)\.?/, '').trim(), cost }; }
  br = await LAUNCH(); const vT = T.db ? await viewer(br, T.db, 'T') : {}, vP = P.db ? await viewer(br, P.db, 'P') : {}; await br.close(); srv.close();
  ck('V viewer: the tester\'s database opens to the same element count and the same total cost as the proven run\'s', !!(vT.done && vP.done && vT.cost && vP.cost) && /SHED \d+ elements/.test(vT.done) && vT.done.match(/SHED \d+ elements/)[0] === vP.done.match(/SHED \d+ elements/)[0] && vT.cost === vP.cost, { T: vT, P: vP });
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; say('§UATCH_VERDICT ' + v + ' judged=' + judged + ' fails=' + fails + (BREAK ? ' (BREAK: M, C, D and V must FAIL)' : '')); process.exit(fails ? 1 : 0);
})().catch(e => { say('§UATCH STOPPED ' + (e.stack || e).toString().slice(0, 500)); process.exit(1); });
