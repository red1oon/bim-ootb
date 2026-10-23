#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FP-BOM-TREE (rule D65, prompts/DXF2BIM_FOUNDATION_LANE.md §D65). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the shed's sprinklers had no pipework (the router's pattern: 0 / 2 kept, "no routed network"); the Java compiler's BOM template (FP_PIPE_ASSEMBLY,
 * SPRINKLER_PENDANT_ASSEMBLY) was not used.
 *   P1 TREE      — one DROP per head (assembly height, vertical), BRANCH runs along each row, MAIN across the row ends, one RISER; axis-aligned; ONE connected network reaching every head.
 *   P2 READ      — the rule's roles / diameters / height = the library's BOM rows (ad_bom_child, ad_assembly_connector, ad_bom.description).
 *   P3 CLEAR     — 0 clashes against the true world bounds; the heads' level inside their cited band (1-12 in below the ceiling).
 *   P4 REVEAL    — the network reveals outward from the riser (animated, seed-outward), is committed, and is drawn at its own diameters (main 65 / branch 25 mm).
 *   P5 UNCHANGED — a building whose FP routes by its pattern (Clinic_ARC.db from disk, Terminal rules): no BOM tree runs.
 * Input: the CLI-marked shed set (SHED_MARKED_DIR, local; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_fp_bom_tree.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  if (!fs.existsSync(MARKED) || fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length !== 9) { say('INCONCLUSIVE | the marked shed set is absent: ' + MARKED); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrm-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const open = async (br, logs) => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.errs = [];
    pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§DW-|§BOM-TREE|§NOSPACES-ZONE|§DISC-WALK/.test(t)) { logs.push(t); say('  ' + t.slice(0, 230)); } });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 }); return pg; };
  const walk = (pg, disc) => pg.evaluate(async (disc) => { window.__dwLastCommitDisc = null; const t0 = Date.now(), n0 = window.Bonsai.oplog.length; window.discWalk(disc);
    await new Promise(r => setTimeout(r, 50)); while (window.__dwLastDoneDisc !== disc && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 1500)); return { ms: Date.now() - t0, ops: window.Bonsai.oplog.length - n0, committed: window.__dwLastCommitDisc === disc }; }, disc);
  // 1. the shed: convert, export the Viewer DB
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  let vdb;
  try { const pg = await open(br, []); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 2500));
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 800));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
    const D = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode.apply(null, r.bytes.subarray(i, i + 32768)); return s; });
    vdb = path.join(dir, 'shed_viewer.db'); fs.writeFileSync(vdb, Buffer.from(D, 'latin1')); say('INFO shed Viewer DB ' + fs.statSync(vdb).size + ' bytes');
  } finally { await br.close(); }
  // P2 in Node: the rule row against the library's BOM rows
  { const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3')), F = new Database(path.join(ROOT, 'modeller', 'farm_rules.db'), { readonly: true }), L = path.join(process.env.HOME, 'bim-compiler/library/component_library.db');
    const row = F.prepare("SELECT params_json FROM rule_routing WHERE disc='FP' AND pattern='bom-tree'").get(); F.close(); const P = row ? JSON.parse(row.params_json) : null;
    if (!fs.existsSync(L) || !P) say('INCONCLUSIVE P2 | ' + (!P ? 'no bom-tree row' : 'the component library is absent'));
    else { const lib = new Database(L, { readonly: true }), roles = lib.prepare("SELECT role FROM ad_bom_child WHERE bom_id='FP_PIPE_ASSEMBLY' ORDER BY sequence").all().map(r => r.role),
        conn = Object.fromEntries(lib.prepare("SELECT connector_type, diameter_mm FROM ad_assembly_connector WHERE assembly_id='SPRINKLER_PENDANT_ASSEMBLY'").all().map(r => [r.connector_type, r.diameter_mm])),
        desc = lib.prepare("SELECT description FROM ad_bom WHERE bom_id='SPRINKLER_PENDANT_ASSEMBLY'").get().description, h = +(/(\d+)\s*mm total height/.exec(desc) || [])[1] / 1000; lib.close();
      check('P2', 'the rule\'s roles, diameters and assembly height = the library\'s BOM rows', JSON.stringify(P.roles) === JSON.stringify(roles) && P.main_dia_mm === conn.MAIN_HOOKUP && P.branch_dia_mm === conn.BRANCH_OUT && P.assembly_height_m === h,
        `roles=${P.roles} main=${P.main_dia_mm}/${conn.MAIN_HOOKUP} branch=${P.branch_dia_mm}/${conn.BRANCH_OUT} height=${P.assembly_height_m}/${h}`); } }
  // 2. the shed from disk: FP walk
  const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], p2 = await open(br2, logs); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vdb]);
    await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const S = await p2.evaluate(async () => { const n0 = window.Bonsai.oplog.length; window.__dwLastDoneDisc = null; window.discWalk('FP'); const t0 = Date.now(); while (window.__dwLastDoneDisc !== 'FP' && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200));
      await new Promise(r => setTimeout(r, 500)); for (let g = 0; g < 100 && window.__dwChainAnimating.FP; g++) await new Promise(r => setTimeout(r, 200));   // §D64.1 the reveal runs after the heads' build-up
      await new Promise(r => setTimeout(r, 500)); const segs = (window.__dwChains.FP || []).map(s => ({ role: s.role, from: s.from, to: s.to, dia: s.dia_mm })), heads = (window.__dwWalks.FP || []).map(p => [p.x, p.y, p.z]);
      const scales = []; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwChain === 'FP') { const M = new window.THREE.Matrix4(), q = new window.THREE.Quaternion(), p = new window.THREE.Vector3(), sc = new window.THREE.Vector3(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(p, q, sc); scales.push(+sc.x.toFixed(4)); } } });
      return { segs, heads, scales: Array.from(new Set(scales)), ops: window.Bonsai.oplog.length - n0 }; });
    const roles = {}; S.segs.forEach(s => { roles[s.role] = (roles[s.role] || 0) + 1; });
    const k = p => p.map(v => v.toFixed(3)).join(','), par = {}, find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }, uni = (a, b) => { [a, b].forEach(x => { if (!(x in par)) par[x] = x; }); par[find(a)] = find(b); };
    S.segs.forEach(s => uni(k(s.from), k(s.to))); const comps = new Set(Object.keys(par).map(find)), headsIn = S.heads.every(h => k(h) in par);
    const axisAligned = S.segs.every(s => [0, 1, 2].filter(i => Math.abs(s.from[i] - s.to[i]) > 1e-6).length === 1);
    const dropsVertical = S.segs.filter(s => s.role === 'DROP').every(s => Math.abs(s.from[0] - s.to[0]) < 1e-6 && Math.abs(s.from[1] - s.to[1]) < 1e-6 && Math.abs(s.to[2] - s.from[2] - 0.177) < 1e-3);
    check('P1', 'one drop per head (vertical, the assembly height), branches, a main and a riser; axis-aligned; one connected network reaching every head', roles.DROP === S.heads.length && roles.BRANCH > 0 && roles.MAIN > 0 && roles.RISER === 1 && axisAligned && dropsVertical && comps.size === 1 && headsIn,
      `roles=${JSON.stringify(roles)} heads=${S.heads.length} axis_aligned=${axisAligned} drops_vertical=${dropsVertical} components=${comps.size} every_head_on_it=${headsIn}`);
    const fit = logs.filter(t => /§BOM-TREE-FIT/.test(t)).pop() || '', hz = +(/head_z=([\d.]+)/.exec(fit) || [])[1], cl = +(/clashes=(\d+)/.exec(fit) || [])[1];
    check('P3', 'no clash against the true world bounds; the heads inside their cited band (2.880..3.159)', cl === 0 && /envelope=world-bbox/.test(fit) && hz >= 2.880 - 1e-6 && hz <= 3.159 + 1e-6 && S.heads.every(h => Math.abs(h[2] - hz) < 1e-6), fit.slice(0, 200));
    const anim = logs.filter(t => /§DW-CHAIN-ANIM FP/.test(t)).pop() || '';
    check('P4', 'revealed outward from the riser (animated), committed, drawn at its own diameters (2 radii: main / branch)', /mode=animated/.test(anim) && /seed-outward/.test(anim) && S.ops > S.heads.length && S.scales.length === 2 && !p2.errs.length,
      `${anim.slice(0, 120)} ops=${S.ops} radius_scales=${JSON.stringify(S.scales)} page_errors=${p2.errs.length}`);
  } finally { await br2.close(); }
  // P5 Clinic from disk (Terminal rules): its FP routes by the pattern, no BOM tree
  const brC = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], pc = await open(brC, logs), cdb = path.join(dir, 'clinic_local.db'); fs.copyFileSync(path.join(ROOT, 'modeller', 'Clinic_ARC.db'), cdb);
    await pc.click('#b-open'); await pc.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [cc] = await Promise.all([pc.waitForFileChooser(), pc.click('#m-open-panel .mo-row[data-key="__local"]')]); await cc.accept([cdb]);
    await pc.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pc.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const n = await pc.evaluate(async () => { window.__dwLastDoneDisc = null; window.discWalk('FP'); const t0 = Date.now(); while (window.__dwLastDoneDisc !== 'FP' && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200)); return (window.__dwChains.FP || []).length; });
    check('P5', 'Clinic (Terminal rules) routes its FP by the pattern: no BOM tree', !logs.some(t => /§BOM-TREE/.test(t)) && n > 0, `chains=${n} bom_tree_lines=${logs.filter(t => /§BOM-TREE/.test(t)).length}`);
  } finally { await brC.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
