#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-CONVERT: DXF2BIM lane L3 in the Modeller (prompts/DXF2BIM_MODELLER_LANE.md §L3 "L3 build spec").
 * Read the log (tests/logs/witness_dxf_convert.log) after every run; exit code is not evidence.
 *
 * §L3.3: runs on the STD set (8 sheets incl. ROOF + SECTION, BIMCompiler `DXSET=std rosetta_dx_shell.js`, summary *_std.json).
 * Drives the REAL UI: Open ▸ "Open 2D drawings (.dxf)…" (file chooser, 8 sheets) → canvas → gate (roles + dxf2qualify verdict) → Convert.
 *   C0 CANVAS   — each sheet lands where its markings put it: plan wall lines at z = @LEVEL, roof outline at z = @ROOF, each
 *                 elevation's A-ELEV-WALL lines ON its face plane and spanning exactly the building's outer envelope along it
 *                 (1 mm). Issue: a sheet drawn at the wrong height, off its face plane or slid along it. Not covered: a mirror of a
 *                 symmetric span (the plan<->elevation mapping is Dxf2Marks.align, verified in BIMCompiler verify_marks_dx.js).
 *   C1 PARITY   — the converted model equals the Node run (BIMCompiler rosetta_dx_shell.js, out/duplex_basic_shapes_elements.json):
 *                 run_id equal; every non-infill element (wall pieces, slab, roof) is ONE committed GEOM_INSERT with the Node id,
 *                 class, storey and RENDERED bbox within 1 mm; every void group's rendered (kernel-cut) body has the bbox of the
 *                 union of that group's Node infill boxes (1 mm) and their summed volume (1e-5 m3). Issue: the browser
 *                 convert is not the pipeline (wrong element, misplaced, cut wrong, or another identity).
 *   C1 FILLS    — §L3.2: with the LOCAL library subset (generated first by BIMCompiler scripts/export_library_subset.js into
 *                 modeller/dxf2bim/local/, git-ignored) every Node fill (26) is ONE committed GEOM_INSERT of its library mesh with
 *                 the Node id, class, storey, rendered centre and bbox within 1 mm. Issue: fills missing, misplaced, or another product.
 *   C1 FILLS-FALSIFY — the subset served with one mesh removed: exactly the Node fills of that mesh's product get
 *                 GAP:lod400_mesh_missing, those are the ONLY blocking qualify items, so the gate refuses the set (§L3.3): Convert
 *                 disabled, forced convert refused, op-log unchanged (never a box, never a substitute).
 *   C1 FALSIFY  — the C1 comparator against the Node summary with one piece and one infill box moved 2 mm reports exactly those
 *                 two. Issue: a comparator that cannot fail.
 *   C2 IFC      — Export ▸ IFC → reimport: products by class == committed inserts by class, storeys == 2, contained == products.
 *                 Issue: the converted model does not survive export (classes lost, no storeys, products outside the tree).
 *   C0 SECTION  — every read layer of the SECTION sheet lies ON its cut plane (@CUT x units, 1 mm) and its cut walls (A-SECT)
 *                 span exactly the plan envelope along the section axis (1 mm). Issue: a section off its cut plane or slid along it.
 *   C3 REFUSE   — (a) the std GF plan replaced by its raw unmarked original: roles refuse naming that sheet; (b) the OLD marked set
 *                 (7 sheets, dxf2qualify verdict blocked): gate refused with the verdict (its canvas C0 still checked). Both: Convert
 *                 disabled, a forced convert() refused, op-log unchanged. Issue: a sheet without a role, or a set qualify blocks, converted.
 *   C4 UNDO     — ONE undo: every converted op inactive and no converted mesh left. Issue: convert is not one gesture.
 *   §L3.4 DXF_LIB=oci (L2) — the main page answers the local subset URL with 404 (as on GitHub Pages, where dxf2bim/local/ does not
 *                 exist): the library comes from OCI (log `§DXF-LIB source=oci`), and C0-C4 above must hold unchanged, incl. C1 FILLS
 *                 36/36. Issue: the public page cannot reach the OCI library (CORS, content type, path) or builds another one.
 *                 Default (no DXF_LIB): the local subset, `§DXF-LIB source=local` (the dev override).
 *   C5 LIB-UNREACHABLE (L3 falsify, always) — test hook = puppeteer answers latest.json with a non-existent library sha (production code
 *                 unchanged) and the local URL with 404: `§DXF-LIB source=none`, every opening GAP:lod400_library_unreachable, gate refused,
 *                 forced convert refused, op-log unchanged, no mesh. Issue: an unreachable library silently yields boxes or a pass.
 * Screenshots: ~/Videos/dxf2bim_work/l3/ (imported sheets; converted Duplex).
 * Inputs (not in git): $DXF2BIM_BC (default ~/Projects/bim-compiler): tests/dxf2bim/out/{marked,marked_shell}, the Node summary,
 * 2D_Layout/output/DXF/DX_FLOOR_GF_20260428_0636.dxf (C3). Run BIMCompiler tests/dxf2bim/rosetta_dx_shell.js first.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const BC = process.env.DXF2BIM_BC || path.join(process.env.HOME, 'Projects', 'bim-compiler');
const OUT = path.join(BC, 'tests/dxf2bim/out');
const SHOTS = path.join(process.env.HOME, 'Videos', 'dxf2bim_work', 'l3');
const LOG = path.join(__dirname, 'logs', 'witness_dxf_convert.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const SET = [['marked_std', 'DX_FLOOR_GF_marked.dxf'], ['marked_std', 'DX_FLOOR_FF_marked.dxf'], ['marked_std_shell', 'DX_FRONT_shell.dxf'], ['marked_std_shell', 'DX_REAR_shell.dxf'],
  ['marked_std_shell', 'DX_LEFT_shell.dxf'], ['marked_std_shell', 'DX_RIGHT_shell.dxf'], ['marked_std', 'DX_ROOF_marked.dxf'], ['marked_std', 'DX_SECTION_marked.dxf']].map(([d, n]) => path.join(OUT, d, n));
const OLDSET = [['marked', 'DX_FLOOR_GF_marked.dxf'], ['marked', 'DX_FLOOR_FF_marked.dxf'], ['marked_shell', 'DX_FRONT_shell.dxf'], ['marked_shell', 'DX_REAR_shell.dxf'],
  ['marked_shell', 'DX_LEFT_shell.dxf'], ['marked_shell', 'DX_RIGHT_shell.dxf'], ['marked_shell', 'DX_ROOF_shell.dxf']].map(([d, n]) => path.join(OUT, d, n));
const RAW_GF = path.join(BC, '2D_Layout/output/STD/DX_FLOOR_GF_std.dxf');
const lines = []; let fail = 0, gaps = 0;
const cp = require('child_process');
const SUBSET = path.join(ROOT, 'dxf2bim', 'local', 'library_subset_duplex.json');
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});

const LIBMODE = process.env.DXF_LIB === 'oci' ? 'oci' : 'local';
const LOCAL_RE = /dxf2bim\/local\/library_subset_duplex\.json/, LATEST_RE = /\/dxf2bim\/library\/latest\.json$/;
// routes: [[RegExp, {status, contentType, body}]] answered by interception (the SW is bypassed so it cannot answer first)
async function openPage(br, port, tag, routes) {
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  pg._logs = [];
  if (routes) {
    await pg.setBypassServiceWorker(true); await pg.setRequestInterception(true);
    pg.on('request', rq => { const hit = routes.find(([re]) => re.test(rq.url().split('?')[0])); if (hit) rq.respond(hit[1]); else rq.continue(); });
  }
  pg.on('console', m => { const t = m.text(); pg._logs.push(t); if (/§DXF|§IFC-SPATIAL|§IFC reimport|§IFC build|§IFC §IFC-SEED|commitGesture|GESTURE-UNDO|LOD400-REFUSE|insert fold fail|ERR/.test(t)) say('  [' + tag + '] ' + t.slice(0, 400)); });
  pg.on('pageerror', e => say('  [' + tag + '] PAGEERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction('window.Bonsai && window.Bonsai.oplog && window.Bonsai.library && window.DxfImportUI && window.A && window.A.scene', { timeout: 90000 });
  return pg;
}
async function openViaChooser(pg, files) {
  await pg.evaluate(() => { window.gateSum = g => g ? { ok: g.ok, set: g.set, refused: g.refused, verdict: g.verdict ? { verdict: g.verdict.verdict, blocking: g.verdict.blocking.length, advisory: g.verdict.advisory.length, counts: g.verdict.counts } : null } : null; });
  await pg.click('#b-open');
  await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
  const [chooser] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]);
  if (!chooser.isMultiple()) say('  chooser is NOT multiple');
  await chooser.accept(files);
  await pg.waitForFunction('window.DxfImportUI.state.gate && document.getElementById("dxf-panel")', { timeout: 60000 });
  return chooser.isMultiple();
}

(async () => {
  for (const f of SET.concat(OLDSET, [RAW_GF])) if (!fs.existsSync(f)) { say('MISSING input ' + f); process.exit(2); }
  // §L3.2: generate the local library subset FIRST (never committed)
  say(cp.execFileSync('node', [path.join(BC, 'scripts/export_library_subset.js'), '--elements', path.join(OUT, 'duplex_basic_shapes_elements_std.json'),
    '--labels', path.join(OUT, 'duplex_basic_shapes_labels_std.json'), '--lib', path.join(BC, 'deploy/component_library.db'), '--out', SUBSET], { encoding: 'utf8' }).trim());
  const ref = JSON.parse(fs.readFileSync(path.join(OUT, 'duplex_basic_shapes_elements_std.json'), 'utf8'));
  const DROP = ref.elements.filter(e => e.class === 'IfcDoor' && e.geometry_hash).map(e => e.geometry_hash).sort()[0];   // a door product's mesh (deterministic)
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  say('BC=' + BC);

  // ---------------- C1 / C2 / C4 on the marked set ----------------
  say('library mode=' + LIBMODE);
  const pg = await openPage(br, port, 'set', LIBMODE === 'oci' ? [[LOCAL_RE, { status: 404, contentType: 'text/plain', body: 'not found' }]] : null);
  const multiple = await openViaChooser(pg, SET);
  const imp = await pg.evaluate(() => ({ gate: gateSum(window.DxfImportUI.state.gate), roles: window.DxfImportUI.state.sheets.map(s => [s.name, s.role]),
    lines: window.DxfImportUI.state.group ? window.DxfImportUI.state.group.children.map(c => [c.userData.dxfSheet, c.geometry.attributes.position.count / 2]) : [],
    convertDisabled: document.getElementById('dxf-convert').disabled }));
  const c0 = async (pgx, label, nSheets) => {
  const cv = await pgx.evaluate(() => ({ canvas: window.DxfImportUI.state.canvas, env: window.DxfImportUI.state.envelope,
    sheets: window.DxfImportUI.state.sheets.map(s => ({ name: s.name, role: s.role, level: s.level, face: s.face, roofZ: s.roofZ })) }));
  const cbad = [], lv = cv.sheets.filter(s => s.role === 'plan').map(s => s.level), roofZ = (cv.sheets.find(s => s.role === 'roof') || {}).roofZ;
  cv.sheets.forEach(s => { const c = cv.canvas[s.name]; if (!c) { cbad.push(s.name + ' not drawn'); return; } const tb = c.typeBox;
    if (s.role === 'plan') { const b = tb.wall; if (!b || Math.abs(b[2] - s.level) > 1e-6 || Math.abs(b[5] - s.level) > 1e-6) cbad.push(s.name + ' wall z ' + (b && [b[2], b[5]])); }
    if (s.role === 'roof') { const b = tb.roof; if (!b || Math.abs(b[2] - s.roofZ) > 1e-6 || Math.abs(b[5] - s.roofZ) > 1e-6) cbad.push(s.name + ' roof z ' + (b && [b[2], b[5]])); }
    if (s.role === 'elev') { const b = tb.elevwall, E = cv.env, ax = /Y$/.test(s.face) ? 0 : 1, ac = 1 - ax, fc = { minX: E[0], minY: E[1], maxX: E[2], maxY: E[3] }[s.face];
      const ok = b && Math.abs(b[ac] - fc) <= 0.001 && Math.abs(b[ac + 3] - fc) <= 0.001 && Math.abs(b[ax] - E[ax]) <= 0.001 && Math.abs(b[ax + 3] - E[ax + 2]) <= 0.001;
      if (!ok) cbad.push(s.name + ' ' + s.face + ' elevwall box ' + JSON.stringify(b) + ' env ' + JSON.stringify(E)); }
    if (s.role === 'section') {   // every read layer ON the cut plane; the cut walls (A-SECT, sectwall) span exactly the plan envelope along the section axis
      const E = cv.env, cu = c.cut, ca = cu && cu.axis === 'X' ? 0 : 1, oa = 1 - ca, b = tb.sectwall;
      const onPlane = cu && Object.keys(tb).every(t => Math.abs(tb[t][ca] - cu.value) <= 0.001 && Math.abs(tb[t][ca + 3] - cu.value) <= 0.001);
      const ok = onPlane && b && Math.abs(b[oa] - E[oa]) <= 0.001 && Math.abs(b[oa + 3] - E[oa + 2]) <= 0.001;
      say('  [' + label + '] section ' + s.name + ' cut=' + JSON.stringify(cu) + ' boxes=' + JSON.stringify(Object.keys(tb).reduce((o, t) => (o[t] = tb[t].map(v => Math.round(v * 1000) / 1000), o), {})));
      if (!ok) cbad.push(s.name + ' section onPlane=' + onPlane + ' sectwall ' + JSON.stringify(b) + ' cut ' + JSON.stringify(cu) + ' env ' + JSON.stringify(E)); } });
  check('C0 CANVAS ' + label, 'a sheet is drawn at the wrong height, an elevation off its face plane / slid along it, or a section off its cut plane (1 mm)', cbad.length === 0 && cv.sheets.length === nSheets,
    'sheets=' + cv.sheets.length + ' envelope=' + JSON.stringify(cv.env) + (cbad.length ? ' bad: ' + cbad.join('; ') : ''));
  };
  await c0(pg, 'std', SET.length);
  const srcLine = pg._logs.filter(t => /^§DXF-LIB /.test(t));
  check('C0 LIB-SOURCE', 'the library came from another source than this run asks for (' + LIBMODE + '), or no §DXF-LIB line',
    srcLine.length > 0 && srcLine.every(t => t.indexOf('§DXF-LIB source=' + LIBMODE + ' ') === 0) && srcLine.every(t => /sha=7e5df6e10027/.test(t)), srcLine.join(' || ').slice(0, 400));
  check('C0 GATE std', 'the std set (Node verdict qualifies) is not allowed to convert by the ONE gate (roles + dxf2qualify)', imp.gate.ok && imp.gate.verdict && imp.gate.verdict.verdict === 'qualifies' && !imp.convertDisabled,
    JSON.stringify(imp.gate));
  say('import: multiple=' + multiple + ' gate.ok=' + imp.gate.ok + ' roles=' + JSON.stringify(imp.roles) + ' canvas=' + JSON.stringify(imp.lines));
  await new Promise(r => setTimeout(r, 1500));
  await pg.screenshot({ path: path.join(SHOTS, 'l3_std_imported_sheets.png') });
  const opsBefore = await pg.evaluate(() => window.Bonsai.oplog.length);
  await pg.click('#dxf-convert');
  await pg.waitForFunction('window.DxfImportUI.state.last', { timeout: 600000 });
  await new Promise(r => setTimeout(r, 2500));
  const got = await pg.evaluate(() => {
    const L = window.DxfImportUI.state.last, g = window.Bonsai.group();
    const meshByFid = {}; g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null) meshByFid[m.userData.featureId] = m; });
    const measure = m => {
      const p = m.geometry.attributes.position, idx = m.geometry.index; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      let vol = 0; const n = idx ? idx.count : p.count;
      for (let i = 0; i + 2 < n; i += 3) { const a = idx ? idx.getX(i) : i, bb = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(bb), by = p.getY(bb), bz = p.getZ(bb), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
        vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6; }
      return { bbox: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], volume: vol, matrixIdentity: m.matrixWorld.equals(new window.THREE.Matrix4()) };
    };
    const ops = window.Bonsai.oplog._geomOps().filter(o => o.parameters && o.parameters.provenance && o.parameters.provenance.run_id === L.run_id);
    const inserts = ops.filter(o => o.op_type === 'GEOM_INSERT').map(o => {
      const guid = Object.keys(L.fidByGuid).find(k => L.fidByGuid[k] === o.id), m = meshByFid[o.id];
      return { fid: o.id, guid, cls: o.parameters.ifc_class, storey: o.parameters.storey, storey_elev: o.parameters.storey_elev, prov: o.parameters.provenance, mesh: m ? measure(m) : null };
    });
    const cuts = ops.filter(o => o.op_type === 'GEOM_CUT').map(o => ({ fid: o.id, parent: o.parameters.parent, prov: o.parameters.provenance }));
    return { run_id: L.run_id, gid: L.gid, ids: L.ids, groups: L.groups, counts: L.counts, fillsNeeded: L.fillsNeeded, fills: L.fills, fillGaps: L.fillGaps, inserts, cuts, nOps: ops.length, opsTotal: window.Bonsai.oplog.length };
  });
  say('converted: ops=' + got.nOps + ' inserts=' + got.inserts.length + ' cuts=' + got.cuts.length + ' gid=' + got.gid + ' counts=' + JSON.stringify(got.counts) + ' op-log ' + opsBefore + '->' + got.opsTotal);
  await pg.screenshot({ path: path.join(SHOTS, 'l3_std_converted_panel.png') });
  await pg.evaluate(() => { const p = document.getElementById('dxf-panel'); if (p) p.style.display = 'none';
    const T = window.THREE, A = window.A, b = new T.Box3().setFromObject(window.Bonsai.group()), c = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.5, d = new T.Vector3(0.9, -1, 0.5).normalize();
    A.camera.up.set(0, 0, 1); A.controls.target.copy(c); A.camera.position.copy(c).addScaledVector(d, r / Math.sin(A.camera.fov * Math.PI / 360) * 1.25); A.controls.update(); });
  await new Promise(r => setTimeout(r, 1200));
  await pg.screenshot({ path: path.join(SHOTS, 'l3_std_converted.png') });
  await pg.evaluate(() => { const T = window.THREE, A = window.A, b = new T.Box3().setFromObject(window.Bonsai.group()), c = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.5, d = new T.Vector3(0.75, -1, 0.35).normalize();
    A.controls.target.copy(c); A.camera.position.copy(c).addScaledVector(d, r / Math.sin(A.camera.fov * Math.PI / 360) * 1.05); A.controls.update(); });
  await new Promise(r => setTimeout(r, 1200));
  await pg.screenshot({ path: path.join(SHOTS, 'l3_std_fills.png') });

  // C1 comparator (pure, reused by the falsify control)
  function c1(refEls, gotIns, groups) {
    const bad = [];
    const byGuid = {}; gotIns.forEach(x => { byGuid[x.guid] = x; });
    const solid = refEls.filter(e => !e.infill && !/IfcDoor|IfcWindow/.test(e.class));
    solid.forEach(e => {
      const x = byGuid['dxf-' + e.guid];
      if (!x) { bad.push('missing ' + e.class + ' ' + e.guid.slice(0, 8)); return; }
      if (!x.mesh) { bad.push('no mesh ' + e.class + ' ' + e.guid.slice(0, 8)); return; }
      const d = Math.max(...e.bbox.map((v, i) => Math.abs(v - x.mesh.bbox[i])));
      if (x.cls !== e.class || x.storey !== e.storey || d > 0.001) bad.push(e.class + ' ' + e.guid.slice(0, 8) + ' bboxΔ=' + d.toFixed(4) + (x.storey !== e.storey ? ' storey ' + x.storey + '/' + e.storey : ''));
    });
    const infill = refEls.filter(e => e.infill);
    const used = new Set();
    groups.forEach(gr => {
      const mine = infill.filter(e => e.storey === gr.storey && e.openings.join('+') === gr.openings.join('+') &&
        e.bbox[0] >= gr.rect[0] - 1e-6 && e.bbox[3] <= gr.rect[2] + 1e-6 && e.bbox[1] >= gr.rect[1] - 1e-6 && e.bbox[4] <= gr.rect[3] + 1e-6);
      mine.forEach(e => used.add(e.guid));
      const x = gotIns.find(y => y.fid === gr.fid);
      if (!mine.length || !x || !x.mesh) { bad.push('group ' + gr.openings.join('+') + ' ref=' + mine.length + ' mesh=' + !!(x && x.mesh)); return; }
      const ub = [0, 1, 2].map(a => Math.min(...mine.map(e => e.bbox[a]))).concat([3, 4, 5].map(a => Math.max(...mine.map(e => e.bbox[a]))));
      const d = Math.max(...ub.map((v, i) => Math.abs(v - x.mesh.bbox[i]))), vol = mine.reduce((n, e) => n + e.volume, 0);
      if (d > 0.001 || Math.abs(vol - x.mesh.volume) > 1e-5) bad.push('group ' + gr.storey + ' ' + gr.openings.join('+') + ' bboxΔ=' + d.toFixed(4) + ' vol ref=' + vol.toFixed(6) + ' got=' + x.mesh.volume.toFixed(6));
    });
    infill.filter(e => !used.has(e.guid)).forEach(e => bad.push('infill not in any cut body ' + e.guid.slice(0, 8) + ' ' + e.openings.join('+')));
    const extra = gotIns.filter(x => !refEls.some(e => 'dxf-' + e.guid === x.guid) && !groups.some(g => g.fid === x.fid)).map(x => 'extra ' + x.cls + ' ' + x.guid);
    // §L3.2 fills: each Node fill = one insert with its id, class, storey, rendered centre + bbox (1 mm)
    refEls.filter(e => /IfcDoor|IfcWindow/.test(e.class)).forEach(e => {
      const x = byGuid['dxf-' + e.guid];
      if (!x || !x.mesh) { bad.push('fill missing ' + e.class + ' ' + e.guid.slice(0, 8) + ' ' + e.element_ref); return; }
      const cc = [0, 1, 2].map(a => (x.mesh.bbox[a] + x.mesh.bbox[a + 3]) / 2);
      const d = Math.max(...e.bbox.map((v, i) => Math.abs(v - x.mesh.bbox[i]))), dc = Math.max(...e.centre.map((v, i) => Math.abs(v - cc[i])));
      if (x.cls !== e.class || x.storey !== e.storey || d > 0.001 || dc > 0.001 || !x.prov || x.prov.geometry_hash !== e.geometry_hash)
        bad.push('fill ' + e.class + ' ' + e.guid.slice(0, 8) + ' bboxΔ=' + d.toFixed(4) + ' centreΔ=' + dc.toFixed(4) + (x.storey !== e.storey ? ' storey ' + x.storey + '/' + e.storey : ''));
    });
    return bad.concat(extra);
  }
  check('C1 RUN-ID', 'the page convert has another identity than the Node run for the same inputs', got.run_id === ref.run_id, 'page=' + got.run_id + ' node=' + ref.run_id);
  const nFillRef = ref.elements.filter(e => /IfcDoor|IfcWindow/.test(e.class)).length;
  const c1bad = c1(ref.elements, got.inserts, got.groups);
  const nSolid = ref.elements.filter(e => !e.infill && !/IfcDoor|IfcWindow/.test(e.class)).length, nInf = ref.elements.filter(e => e.infill).length;
  check('C1 PARITY', 'a converted element is missing, misplaced (rendered bbox 1 mm), in the wrong class/storey, or a cut body is not the union of the Node infill (bbox 1 mm, volume 1e-5 m3)',
    c1bad.length === 0 && got.inserts.length === nSolid + got.groups.length + nFillRef,
    'node solids=' + nSolid + ' infill=' + nInf + ' in ' + got.groups.length + ' void groups | page inserts=' + got.inserts.length + ' cuts=' + got.cuts.length + ' | differ=' + c1bad.length + (c1bad.length ? ' ' + c1bad.slice(0, 8).join('; ') : ''));
  const cntRef = {}, cntGot = {};
  ref.elements.filter(e => !e.infill && !/IfcDoor|IfcWindow/.test(e.class)).forEach(e => { const k = e.storey + '/' + e.class; cntRef[k] = (cntRef[k] || 0) + 1; });
  got.inserts.filter(x => !got.groups.some(g => g.fid === x.fid) && !/IfcDoor|IfcWindow/.test(x.cls)).forEach(x => { const k = x.storey + '/' + x.cls; cntGot[k] = (cntGot[k] || 0) + 1; });
  const so = o => JSON.stringify(Object.keys(o).sort().reduce((q, k) => (q[k] = o[k], q), {}));
  check('C1 COUNTS', 'element counts by storey/class (wall pieces, slab, roof) differ from the Node run', so(cntRef) === so(cntGot), 'node=' + so(cntRef) + ' page=' + so(cntGot) + ' | cut bodies by storey=' + JSON.stringify(got.groups.reduce((o, g) => (o[g.storey] = (o[g.storey] || 0) + 1, o), {})));
  const provOk = got.inserts.concat(got.cuts).every(x => x.prov && x.prov.dxf_handle && x.prov.layer && x.prov.sheet && x.prov.run_id === got.run_id);
  check('C1 PROVENANCE', 'a converted op lacks provenance {dxf_handle, layer, sheet, run_id}', provOk && got.nOps === got.inserts.length + got.cuts.length, 'ops=' + got.nOps);
  const cutParentsOk = got.cuts.every(c => got.groups.some(g => g.fid === c.parent));
  check('C1 CUTS', 'a GEOM_CUT does not target a converted opening body (wrong parent fid)', cutParentsOk && got.cuts.length > 0, 'cuts=' + got.cuts.length + ' bodies=' + got.groups.length);
  const fillBad = c1(ref.elements, got.inserts, got.groups).filter(x => /^fill/.test(x));
  const fillCls = got.inserts.filter(x => /IfcDoor|IfcWindow/.test(x.cls)).reduce((o, x) => (o[x.cls] = (o[x.cls] || 0) + 1, o), {});
  check('C1 FILLS', 'a Node LOD400 fill is not placed in the page, or sits elsewhere (rendered centre/bbox 1 mm), or is another product/class/storey',
    fillBad.length === 0 && got.fills.length === nFillRef && got.fillGaps.length === 0,
    'node=' + nFillRef + ' page=' + got.fills.length + ' ' + JSON.stringify(fillCls) + ' gaps=' + got.fillGaps.length + (fillBad.length ? ' ' + fillBad.slice(0, 6).join('; ') : ''));

  // C1 FALSIFY: move one piece and one infill box 2 mm in the Node summary
  const moved = JSON.parse(JSON.stringify(ref.elements));
  const pi = moved.findIndex(e => !e.infill && e.class === 'IfcWall'), ii = moved.findIndex(e => e.infill);
  moved[pi].bbox[0] += 0.002; moved[pi].bbox[3] += 0.002; moved[ii].bbox[2] += 0.002; moved[ii].bbox[5] += 0.002;
  const fbad = c1(moved, got.inserts, got.groups);
  check('C1 FALSIFY', 'the C1 comparator cannot fail (one piece + one infill box moved 2 mm must be exactly 2 differences)', fbad.length === 2, 'reported=' + fbad.length + ' ' + fbad.join('; '));

  // C2 IFC round trip
  const ifc = await pg.evaluate(async () => { const b = await window.Bonsai.ifc.build(); const re = await window.Bonsai.ifc.reimport(b.bytes);
    return { seeded: b.seeded, seedByClass: b.seedByClass, seedNoMesh: b.seedNoMesh, openings: b.openings, byClass: re.byClass, spatial: re.spatial, bytes: b.bytes.length }; });
  const insByClass = got.inserts.reduce((o, x) => (o[x.cls] = (o[x.cls] || 0) + 1, o), {});
  const clsOk = Object.keys(insByClass).every(k => ifc.byClass[k] === insByClass[k]) && ifc.byClass.IfcDoor === (insByClass.IfcDoor || 0) && ifc.byClass.IfcWindow === (insByClass.IfcWindow || 0) && insByClass.IfcDoor + insByClass.IfcWindow === nFillRef;
  check('C2 IFC', 'export->reimport loses or invents products by class, storeys != 2, or a product is outside the spatial tree',
    clsOk && ifc.spatial.storeys === 2 && ifc.spatial.contained === ifc.seeded && ifc.seeded === got.inserts.length && ifc.seedNoMesh === 0,
    'committed=' + JSON.stringify(insByClass) + ' reimport=' + JSON.stringify(ifc.byClass) + ' spatial=' + JSON.stringify(ifc.spatial) + ' seeded=' + ifc.seeded + ' noMesh=' + ifc.seedNoMesh + ' bytes=' + ifc.bytes);

  // C4 one undo
  const und = await pg.evaluate(async (runId) => {
    await window.Bonsai.oplog.undo(); await new Promise(r => setTimeout(r, 500));
    const act = window.Bonsai.oplog._geomOps().filter(o => o.parameters && o.parameters.provenance && o.parameters.provenance.run_id === runId).length;
    const ids = new Set(window.DxfImportUI.state.last.ids);
    const meshes = window.Bonsai.group().children.filter(m => m.isMesh && ids.has(m.userData.featureId)).length;
    return { active: act, meshes, total: window.Bonsai.oplog.length };
  }, got.run_id);
  check('C4 UNDO', 'one undo leaves converted ops or meshes (convert is not one gesture)', und.active === 0 && und.meshes === 0 && und.total === opsBefore, 'activeConverted=' + und.active + ' meshes=' + und.meshes + ' op-log=' + und.total + ' (before convert ' + opsBefore + ')');
  await pg.close();

  // ---------------- C1 FILLS-FALSIFY: the subset served with one mesh removed ----------------
  {
    const J0 = JSON.parse(fs.readFileSync(SUBSET, 'utf8')), prodRows = J0.rows.ad_geometry_map.filter(m => m.geometry_hash === DROP).map(m => m.element_ref);
    delete J0.meshes[DROP]; const body = JSON.stringify(J0);
    const pgf = await br.newPage(); await pgf.setViewport({ width: 1400, height: 900 });
    await pgf.setBypassServiceWorker(true);   // the page SW would answer the fetch before interception sees it
    await pgf.setRequestInterception(true);
    pgf.on('request', rq => { if (/dxf2bim\/local\/library_subset_duplex\.json/.test(rq.url())) rq.respond({ status: 200, contentType: 'application/json', body }); else rq.continue(); });
    const errs = []; pgf.on('console', m => { if (m.type() === 'error' && /§DXF-CONVERT HARD-FAIL fill/.test(m.text())) errs.push(m.text()); if (/§DXF-CONVERT (counts|library)/.test(m.text())) say('  [drop] ' + m.text().slice(0, 300)); });
    await pgf.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 90000 });
    await pgf.waitForFunction('window.Bonsai && window.Bonsai.oplog && window.DxfImportUI && window.A && window.A.scene', { timeout: 90000 });
    await openViaChooser(pgf, SET);
    // §L3.3: a missing LOD400 mesh is a blocking qualify item, so the ONE gate refuses the set: nothing is converted, nothing is a box
    const fz = await pgf.evaluate(async () => { const st = window.DxfImportUI.state, g = st.gate, before = window.Bonsai.oplog.length, dis = document.getElementById('dxf-convert').disabled;
      const forced = await window.DxfImportUI.convert();
      return { gate: gateSum(g), disabled: dis, forced: !!(forced && forced.refused), before, after: window.Bonsai.oplog.length,
        gaps: (g.R && g.R.fillGaps || []).map(x => ({ code: x.code, storey: x.storey, handle: x.handle, product: x.element_ref })),
        blockingCodes: g.verdict ? g.verdict.blocking.map(x => x.code) : [], meshes: window.Bonsai.group().children.filter(m => m.isMesh && m.userData && m.userData.featureId != null).length }; });
    const expect = ref.elements.filter(e => /IfcDoor|IfcWindow/.test(e.class) && prodRows.indexOf(e.element_ref) >= 0);
    const key = x => x.storey + '|' + x.handle, ms = a => a.map(key).sort().join(',');
    check('C1 FILLS-FALSIFY', 'a fill whose library mesh is missing is converted anyway (substitute or box), the GAP hits other fills or is unnamed, or the gate lets the set through',
      expect.length > 0 && fz.gaps.length === expect.length && fz.gaps.every(g => g.code === 'GAP:lod400_mesh_missing') && ms(fz.gaps) === ms(expect) &&
      fz.gate && !fz.gate.ok && fz.gate.verdict && fz.gate.verdict.verdict === 'blocked' && fz.blockingCodes.length > 0 && fz.blockingCodes.every(c => c === 'GAP:lod400_mesh_missing') &&
      fz.disabled && fz.forced && fz.before === fz.after,
      'dropped=' + DROP + ' product=' + [...new Set(prodRows)].join(',') + ' node fills of it=' + expect.length + ' gaps=' + JSON.stringify(fz.gaps) + ' verdict=' + JSON.stringify(fz.gate && fz.gate.verdict) +
      ' blocking codes=' + JSON.stringify([...new Set(fz.blockingCodes)]) + ' disabled=' + fz.disabled + ' forced refused=' + fz.forced + ' op-log ' + fz.before + '->' + fz.after);
    await pgf.close();
  }

  // ---------------- C3 refuse: (a) a std plan without markings (roles), (b) the OLD marked set (dxf2qualify verdict blocked) ----------------
  for (const [label, files, expectNamed] of [['raw-gf', [RAW_GF].concat(SET.slice(1)), path.basename(RAW_GF)], ['old-set', OLDSET, null]]) {
    const pg3 = await openPage(br, port, label);
    await openViaChooser(pg3, files);
    if (label === 'old-set') await c0(pg3, 'old-set', OLDSET.length);
    const r3 = await pg3.evaluate(async () => {
      const before = window.Bonsai.oplog.length, st = window.DxfImportUI.state, dis = document.getElementById('dxf-convert').disabled;
      const forced = await window.DxfImportUI.convert();
      return { gate: gateSum(st.gate), disabled: dis, forced: forced && { refused: !!forced.refused }, before, after: window.Bonsai.oplog.length,
        why: Array.prototype.map.call(document.querySelectorAll('#dxf-panel .dxf-why'), e => e.textContent).slice(0, 3).join(' | ') };
    });
    const named = expectNamed ? r3.gate.refused.some(r => r.sheet === expectNamed) : (r3.gate.verdict && r3.gate.verdict.verdict === 'blocked' && r3.gate.verdict.blocking > 0);
    check('C3 REFUSE ' + label, label === 'raw-gf' ? 'a sheet without a role marking is converted (or refused without naming it)' : 'a set the dxf2qualify verdict blocks is converted (or refused without the verdict)',
      !r3.gate.ok && named && r3.disabled && r3.forced && r3.forced.refused && r3.before === r3.after,
      'gate=' + JSON.stringify(r3.gate).slice(0, 500) + ' disabled=' + r3.disabled + ' op-log ' + r3.before + '->' + r3.after + ' panel="' + r3.why.slice(0, 300) + '"');
    await pg3.close();
  }

  // ---------------- C5 LIB-UNREACHABLE (§L3.4 L3 falsify): latest.json names a library sha that does not exist ----------------
  {
    const fake = JSON.stringify({ format: 'dxf2bim-library-latest/1', library_sha256: '0'.repeat(64), index: '000000000000/index.json' });
    const pg5 = await openPage(br, port, 'nolib', [[LOCAL_RE, { status: 404, contentType: 'text/plain', body: 'not found' }], [LATEST_RE, { status: 200, contentType: 'application/json', body: fake, headers: { 'Access-Control-Allow-Origin': '*' } }]]);
    await openViaChooser(pg5, SET);
    const r5 = await pg5.evaluate(async () => { const st = window.DxfImportUI.state, g = st.gate, before = window.Bonsai.oplog.length, dis = document.getElementById('dxf-convert').disabled;
      const forced = await window.DxfImportUI.convert();
      return { gate: gateSum(g), disabled: dis, forced: !!(forced && forced.refused), before, after: window.Bonsai.oplog.length, lib: !!g.lib,
        codes: [...new Set((g.R && g.R.ST || []).reduce((a, st) => a.concat(st.fills.gaps), []).map(x => x.code))], nGaps: (g.R && g.R.ST || []).reduce((n, st) => n + st.fills.gaps.length, 0),
        blockingCodes: g.verdict ? [...new Set(g.verdict.blocking.map(x => x.code))] : [],
        meshes: window.Bonsai.group().children.filter(m => m.isMesh && m.userData && m.userData.featureId != null).length }; });
    const src5 = pg5._logs.filter(t => /^§DXF-LIB /.test(t));
    check('C5 LIB-UNREACHABLE', 'an unreachable library silently yields boxes, a substitute or a pass (must be GAP:lod400_library_unreachable, gate refused, no op)',
      src5.length > 0 && src5.every(t => /^§DXF-LIB source=none /.test(t)) && !r5.lib && r5.nGaps > 0 && r5.codes.length === 1 && r5.codes[0] === 'GAP:lod400_library_unreachable' && r5.blockingCodes.length === 1 && r5.blockingCodes[0] === 'GAP:lod400_library_unreachable' &&
      r5.gate && !r5.gate.ok && r5.disabled && r5.forced && r5.before === r5.after && r5.meshes === 0,
      'log=' + src5.join(' || ').slice(0, 300) + ' gaps=' + r5.nGaps + ' codes=' + JSON.stringify(r5.codes) + ' blocking codes=' + JSON.stringify(r5.blockingCodes) + ' verdict=' + JSON.stringify(r5.gate && r5.gate.verdict) + ' disabled=' + r5.disabled + ' forced refused=' + r5.forced + ' op-log ' + r5.before + '->' + r5.after + ' meshes=' + r5.meshes);
    await pg5.close();
  }

  await br.close(); server.close();
  say('screenshots: ' + ['l3_std_imported_sheets.png', 'l3_std_converted_panel.png', 'l3_std_converted.png', 'l3_std_fills.png'].map(f => path.join(SHOTS, f)).join(' , '));
  say('SUMMARY fail=' + fail + ' gap=' + gaps);
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { say('ERR ' + e.stack); try { fs.writeFileSync(LOG, lines.join('\n') + '\n'); } catch (x) {} process.exit(1); });
