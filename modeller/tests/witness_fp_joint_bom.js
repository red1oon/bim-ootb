#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FP-JOINT-BOM (rule D66, prompts/DXF2BIM_FOUNDATION_LANE.md §D66). Read the log after every run (exit code is not evidence).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the shed's sprinkler pipework (the D65 BOM tree) had no joint parts: assemble() read only routeChains, so `§DW-ASSEMBLE FP parts=0 (no routed network)`, and the
 * farm rules carried no FP rule_joint_piece rows; the library's T_CONNECTOR_ASSEMBLY (tee + transition + drop at each head, the owner's "each joint is a series of mini BOM ... shim-anchor") was not used.
 *   J1 PROJECTED  — farm_rules.db rule_joint_piece FP rows = the library's ad_bom_child T_CONNECTOR_ASSEMBLY rows (product, hash, offset, rotation, mesh extents); the meshes in the rules db byte-equal the library's.
 *   J2 PLACED     — 3 parts per head, each on its head's vertical at head z + its row's dz (tack model), every part drawn from its real mesh (LOD400, none refused). 0 parts = NO-OP.
 *   J3 ON NETWORK — every tee centre = its DROP edge's tee node (<= 1 mm); J3b the stack head bottom -> tee top = the library's stated total height (177 mm, +- 1 mm), measured from the drawn meshes.
 *   J4 ORIENTED   — each tee's long arm (mesh local X, the 79 mm extent) lies along its branch run (read from the drawn instance matrix).
 *   J5 NO DOUBLE  — filled DROP edges neither swept nor committed as GEOM_SWEEP; the parts committed (GEOM_INSERT, real mesh hash); the parts survive a redraw (the next walk's commit, ELEC: _redrawAllDiscWalks).
 *   J6 UNCHANGED  — Clinic (Terminal rules, FP routed by its pattern): no joint mini-BOM, the same assemble refusal as before.
 * Input: the CLI-marked shed set (SHED_MARKED_DIR) or an already exported shed Viewer DB (SHED_VIEWER_DB, skips the convert); absent -> INCONCLUSIVE. Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_fp_joint_bom.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked'), LIB = path.join(process.env.HOME, 'bim-compiler/library/component_library.db');
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  // J1 in Node: the projected rows against the library, recomputed here from the library alone
  let rows = [], libH = null;
  { const F = new Database(path.join(ROOT, 'modeller', 'farm_rules.db'), { readonly: true });
    try { rows = F.prepare("SELECT * FROM rule_joint_piece WHERE disc='FP' AND assembly_id IS NOT NULL ORDER BY sequence").all(); } catch (e) { rows = []; }
    if (!fs.existsSync(LIB)) say('INCONCLUSIVE J1 | the component library is absent: ' + LIB);
    else if (!rows.length) check('J1', 'farm_rules.db carries the FP T_CONNECTOR_ASSEMBLY rows', false, 'NO-OP: 0 FP rule_joint_piece rows with an assembly_id');
    else { const L = new Database(LIB, { readonly: true }), bad = [];
      const nest = L.prepare("SELECT bom_id, z_rule FROM ad_bom_child WHERE child_bom_id='T_CONNECTOR_ASSEMBLY' AND is_active=1").get();
      const kids = L.prepare("SELECT * FROM ad_bom_child WHERE bom_id='T_CONNECTOR_ASSEMBLY' AND is_active=1 ORDER BY sequence").all();
      libH = +(/(\d+)\s*mm total height/.exec(L.prepare("SELECT description FROM ad_bom WHERE bom_id=?").get(nest.bom_id).description) || [])[1] / 1000;
      if (kids.length !== rows.length) bad.push('rows ' + rows.length + ' vs library children ' + kids.length);
      kids.forEach((k, i) => { const r = rows[i] || {}, d = L.prepare('SELECT geometry_hash FROM component_definitions WHERE name=?').all(k.child_name_pattern), g = d.length === 1 ? L.prepare('SELECT vertices, faces FROM component_geometries WHERE geometry_hash=?').get(d[0].geometry_hash) : null;
        const v = g ? new Float32Array(g.vertices.buffer.slice(g.vertices.byteOffset, g.vertices.byteOffset + g.vertices.length)) : [], ext = [0, 1, 2].map(a => { let lo = Infinity, hi = -Infinity; for (let j = a; j < v.length; j += 3) { lo = Math.min(lo, v[j]); hi = Math.max(hi, v[j]); } return hi - lo; });
        const dz = (k.dz || 0) + +((/^OFFSET_(-?[\d.]+)$/.exec(k.z_rule || '') || [])[1]), mine = F.prepare('SELECT vertices, faces FROM component_geometries WHERE geometry_hash=?').get(r.geometry_hash || '');
        const same = { seq: r.sequence === k.sequence, role: r.role === k.role, cls: r.ifc_class === k.child_ifc_class, product: r.product === k.child_name_pattern, hash: d.length === 1 && r.geometry_hash === d[0].geometry_hash,
          dz: Math.abs(r.dz_m - dz) < 1e-9, dx: (r.dx_m || 0) === (k.dx || 0) && (r.dy_m || 0) === (k.dy || 0), rot: String(r.rotation_rule) === String(k.rotation_rule), parent: r.parent_assembly === nest.bom_id && r.anchor === nest.z_rule,
          ext: Math.abs(r.bbox_x_m - ext[0]) < 1e-5 && Math.abs(r.bbox_y_m - ext[1]) < 1e-5 && Math.abs(r.bbox_z_m - ext[2]) < 1e-5, mesh: !!(g && mine && Buffer.compare(g.vertices, mine.vertices) === 0 && Buffer.compare(g.faces, mine.faces) === 0) };
        Object.keys(same).filter(x => !same[x]).forEach(x => bad.push('seq ' + k.sequence + ' ' + x)); });
      L.close();
      check('J1', 'the projected FP T rows = the library\'s ad_bom_child T_CONNECTOR_ASSEMBLY rows (product, hash, offset, rotation, extents, parent) and the meshes byte-equal', !bad.length,
        (bad.length ? 'WRONG: ' + bad.join('; ') + ' | ' : '') + rows.map(r => r.sequence + ':' + r.role + ' ' + r.product + ' ' + r.geometry_hash + ' +' + r.dz_m + 'm ' + [r.bbox_x_m, r.bbox_y_m, r.bbox_z_m].map(x => (x * 1000).toFixed(1)).join('x') + 'mm').join(', ') + ' | total height (library) ' + libH); }
    F.close(); }
  let vdb = process.env.SHED_VIEWER_DB;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wjb-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const open = async (br, logs) => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.errs = [];
    pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§DW-ASSEMBLE|§DW-ASM|§JOINT-BOM|§BOM-TREE|§DW-TUBE|§ROUTER-CHAIN-COMMIT|§DW-RULES-MESH|§DW-LOD400-REFUSE|§DISC-WALK /.test(t)) { logs.push(t); say('  ' + t.slice(0, 260)); } });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 }); return pg; };
  const openLocal = async (pg, file) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await c.accept([file]);
    await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000)); };
  const walkFP = pg => pg.evaluate(async () => { const n0 = window.Bonsai.oplog._geomOps().length; window.__dwLastDoneDisc = null; window.discWalk('FP'); const t0 = Date.now();
    while (window.__dwLastDoneDisc !== 'FP' && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200));
    while (window.__dwChainAnimating && window.__dwChainAnimating.FP && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200));   // the drawn chain is read only after its reveal ends (§D64.1: it can last up to 7 s)
    await new Promise(r => setTimeout(r, 1500)); return n0; });
  // 1. the shed: convert the marked set and export its Viewer DB (unless one is given)
  if (!vdb) {
    if (!fs.existsSync(MARKED) || fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length !== 9) { say('INCONCLUSIVE | the marked shed set is absent: ' + MARKED); srv.close(); say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0); }
    const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)), br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
    try { const pg = await open(br, []); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
      await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 2500));
      await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 800));
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
      const D = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode.apply(null, r.bytes.subarray(i, i + 32768)); return s; });
      vdb = path.join(dir, 'shed_viewer.db'); fs.writeFileSync(vdb, Buffer.from(D, 'latin1'));
    } finally { await br.close(); }
  }
  say('INFO shed Viewer DB ' + vdb + ' ' + fs.statSync(vdb).size + ' bytes');
  // 2. the shed from disk: FP walk, then read the landed parts, the network, the drawn meshes, the op-log
  const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], pg = await open(br2, logs); await openLocal(pg, vdb); const n0 = await walkFP(pg);
    const read = () => pg.evaluate(() => { const T = window.THREE, M = new T.Matrix4(), out = { drawn: 0, lod400: true, inst: [], tubes: 0, headHalf: null };
      window.A.scene.traverse(o => { if (!o.isInstancedMesh || !o.userData) return;
        if (o.userData.dwAsm === 'FP') { out.drawn += o.count; if (!(o.geometry.userData && o.geometry.userData.lod400)) out.lod400 = false; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox;
          for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); const e = M.elements, p = o.userData.dwSub[i]; out.inst.push({ role: p.role, head: p.head_guid, x: e[12], y: e[13], z: e[14], axX: [e[0], e[1], e[2]], zlo: bb.min.z, zhi: bb.max.z }); } }
        if (o.userData.dwChain === 'FP') out.tubes += o.count;
        if (o.userData.dwDisc === 'FP' && out.headHalf == null) { o.geometry.computeBoundingBox(); out.headHalf = -o.geometry.boundingBox.min.z; } });
      return out; });
    const S = await pg.evaluate(n0 => { const ops = window.Bonsai.oplog._geomOps().slice(n0).map(o => ({ t: o.op_type, dw: (o.parameters || {})._dw || {}, h: (o.parameters || {}).realGeomHash || null }));
      return { parts: (window.__dwAssembly.FP || []).map(p => ({ role: p.role, head: p.head_guid, pos: p.pos, yaw: p.yaw, node: p.node, hash: p.geometry_hash })), heads: (window.__dwWalks.FP || []).map(p => ({ x: p.x, y: p.y, z: p.z })),
        segs: (window.__dwChains.FP || []).map(s => ({ role: s.role, from: s.from, to: s.to, fg: s.from_guid, tg: s.to_guid, fill: s.fill || null })), ops,
        asmRows: (((window.__dwRowsByDisc || {}).FP || {}).asm || []).length }; }, n0);
    const D1 = await read();
    const drops = S.segs.filter(s => s.role === 'DROP'), headOf = {}; drops.forEach(s => { headOf[s.fg] = s; });
    const dzOf = Object.fromEntries(rows.map(r => [r.role, +r.dz_m])), offV = [], offZ = [];
    S.parts.forEach(p => { const d = headOf[p.head]; if (!d) { offV.push(p.role + '@' + p.head + ' no drop'); return; }
      if (Math.hypot(p.pos[0] - d.from[0], p.pos[1] - d.from[1]) > 1e-4) offV.push(p.role + '@' + p.head); if (!(p.role in dzOf) || Math.abs(p.pos[2] - d.from[2] - dzOf[p.role]) > 1e-4) offZ.push(p.role + '@' + p.head + ' dz=' + (p.pos[2] - d.from[2]).toFixed(4)); });
    const refusedLine = logs.some(t => /§DW-LOD400-REFUSE asm/.test(t)), jb = logs.filter(t => /§JOINT-BOM/.test(t)).pop() || '';
    check('J2', 'three parts per head on its vertical at head + the row\'s dz, all drawn from real meshes (LOD400, none refused)',
      S.parts.length > 0 && S.parts.length === rows.length * S.heads.length && drops.length === S.heads.length && !offV.length && !offZ.length && D1.drawn === S.parts.length && D1.lod400 && !refusedLine,
      (S.parts.length ? '' : 'NO-OP: 0 parts landed | ') + `parts=${S.parts.length} heads=${S.heads.length} rows=${rows.length} drawn=${D1.drawn} lod400=${D1.lod400} off_vertical=${offV.length} off_dz=${offZ.length}${offZ.length ? ' ' + offZ.slice(0, 3) : ''} refused_line=${refusedLine} | ${jb.slice(0, 160)}`);
    // J3 the tee on its node; the stack span from the drawn meshes
    const tees = D1.inst.filter(i => i.role === 'TEE'), drp = D1.inst.filter(i => i.role === 'DROP_PIPE'), offNode = [], spans = [];
    tees.forEach(t => { const d = headOf[t.head]; if (!d || Math.hypot(t.x - d.to[0], t.y - d.to[1], t.z - d.to[2]) > 0.001) offNode.push(t.head + (d ? ' ' + (t.z - d.to[2]).toFixed(4) : ' no drop')); if (d && D1.headHalf != null) spans.push(t.z + t.zhi - (d.from[2] - D1.headHalf)); });
    const spanMin = spans.length ? Math.min(...spans) : NaN, spanMax = spans.length ? Math.max(...spans) : NaN;
    check('J3', 'every tee centre on its BOM-tree tee node (<= 1 mm); the stack head bottom -> tee top = the library\'s total height (+- 1 mm)',
      tees.length === S.heads.length && tees.length > 0 && !offNode.length && libH > 0 && Math.abs(spanMin - libH) <= 0.001 && Math.abs(spanMax - libH) <= 0.001,
      `tees=${tees.length} off_node=${offNode.length}${offNode.length ? ' WRONG ' + offNode.slice(0, 3) : ''} span=${(spanMin * 1000).toFixed(1)}..${(spanMax * 1000).toFixed(1)}mm library=${libH * 1000}mm head_half=${D1.headHalf && (D1.headHalf * 1000).toFixed(1)}mm drop_pipes=${drp.length}`);
    // J4 the tee's local X along its branch run
    const misaligned = [];
    tees.forEach(t => { const d = headOf[t.head], k = p => p.map(v => v.toFixed(4)).join(','), node = d ? k(d.to) : '', br = S.segs.filter(s => s.role !== 'DROP' && (k(s.from) === node || k(s.to) === node) && Math.abs(s.from[2] - s.to[2]) < 1e-6);
      if (!br.length) { misaligned.push(t.head + ' no run'); return; } const v = [br[0].to[0] - br[0].from[0], br[0].to[1] - br[0].from[1]], L = Math.hypot(v[0], v[1]), a = Math.hypot(t.axX[0], t.axX[1], t.axX[2]);
      if (Math.abs((v[0] * t.axX[0] + v[1] * t.axX[1]) / (L * a)) < 0.999) misaligned.push(t.head); });
    check('J4', 'each tee\'s long arm (mesh local X) along its branch run', tees.length > 0 && !misaligned.length, `tees=${tees.length} misaligned=${misaligned.length}${misaligned.length ? ' WRONG ' + misaligned.slice(0, 3) : ''}`);
    // J5 no double: filled drops not swept / not committed; the parts committed; a redraw keeps them
    const filled = S.segs.filter(s => s.fill).length, sweepDrops = S.ops.filter(o => o.t === 'GEOM_SWEEP' && o.dw.from_kind === 'IfcFireSuppressionTerminal').length, asmOps = S.ops.filter(o => o.t === 'GEOM_INSERT' && o.dw.asm && o.h).length;
    await pg.evaluate(async () => { window.__dwLastDoneDisc = null; window.discWalk('ELEC'); const t0 = Date.now(); while (window.__dwLastDoneDisc !== 'ELEC' && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 2000)); });
    const D2 = await read();   // the ELEC walk's commit re-folds and redraws every walked disc (_redrawAllDiscWalks): the FP parts must come back
    check('J5', 'the filled DROP edges neither swept nor committed as sweeps; the parts committed with their mesh hash, in the walk\'s undo gesture; a redraw (the next walk, ELEC) keeps them drawn',
      filled === drops.length && filled > 0 && D1.tubes === S.segs.length - filled && sweepDrops === 0 && asmOps === S.parts.length && S.asmRows === S.parts.length && D2.drawn === S.parts.length && !pg.errs.length,
      `filled=${filled}/${drops.length} tubes=${D1.tubes}/${S.segs.length - filled} drop_sweeps_committed=${sweepDrops} part_inserts=${asmOps}/${S.parts.length} in_walk_undo=${S.asmRows} drawn_after_redraw=${D2.drawn} page_errors=${pg.errs.length}`);
  } finally { await br2.close(); }
  // J6 Clinic from disk (Terminal rules): its FP routes by the pattern; no joint mini-BOM; the same refusal as before
  const brC = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], pc = await open(brC, logs), cdb = path.join(dir, 'clinic_local.db'); fs.copyFileSync(path.join(ROOT, 'modeller', 'Clinic_ARC.db'), cdb); await openLocal(pc, cdb); await walkFP(pc);
    const n = await pc.evaluate(() => ({ chains: (window.__dwChains.FP || []).length, parts: (window.__dwAssembly.FP || []).length, filled: (window.__dwChains.FP || []).filter(s => s.fill).length }));
    const asm = logs.filter(t => /§DW-ASSEMBLE FP/.test(t)).pop() || '';
    check('J6', 'Clinic (Terminal rules) routes its FP by the pattern: no joint mini-BOM, assemble refuses as before', n.chains > 0 && !n.parts && !n.filled && !logs.some(t => /§JOINT-BOM|§DW-ASM-COMMIT/.test(t)) && /assemble REFUSE: no routed network/.test(asm),
      `chains=${n.chains} parts=${n.parts} filled=${n.filled} | ${asm.slice(0, 140)}`);
  } finally { await brC.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
