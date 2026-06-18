// W-BOM-ASSEMBLY — DAGeVu modeller: dropping a NON-LEAF BOM (BUILDING/FLOOR/ROOM/SET) expands its m_bom_line
// subtree into N signed GEOM_INSERT leaf-rows, RECURSING through nested BOMs; the signed chain verifies, leaves
// seat at composed parent-relative (dx,dy,dz)+rotation transforms, render, and replay deterministically.
// = the BOM PRINCIPLE as INSERT. Verified by DATA+CHAIN math (geometry GPU-gated → counts/transforms/sig are
// the assertion). prompts/MODELLER_BOM_CATALOG_SPEC.md §SPEC RESOLVED 2026-06-19.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  pg.on('console', m => { const t = m.text(); if (/assembly-drop|recursion stop/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const L = window.Bonsai.library, O = window.Bonsai.oplog, THREE = window.THREE;
    const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-3);

    // ── pick a NESTED assembly (one whose children include a sub-BOM) that maximises recursion benefit
    const all = L.assemblies();
    const expLen = a => L.expandAssembly(a.id, { x: 0, y: 0, z: 0, rot: 0 }).length;
    const nested = all.filter(a => a.children.some(c => c.isBom))
                      .sort((a, b) => (expLen(b) - b.children.length) - (expLen(a) - a.children.length));
    const pick = nested[0];
    const directLeafLines = pick.children.filter(c => !c.isBom).length;

    // ── PURE recursion math: expand exceeds the direct leaf-line count → a nested BOM contributed extra leaves
    const N = expLen(pick);
    const recursionExpanded = N > directLeafLines;

    // ── PURE LINEAR-LAYOUT math (ported PhantomLayout walk): a zero-offset set is SPREAD, not stacked. Every
    // leaf of an autoLayout=LINEAR set lands at a distinct X spanning a real run (DUPLEX_BATHROOM_SET etc.).
    const lin = all.find(a => a.autoLayout === 'LINEAR' && a.children.filter(c => !c.isBom).length >= 3);
    let layoutSpread = true, linId = null;
    if (lin) {
      linId = lin.id;
      const lv = L.expandAssembly(lin.id, { x: 0, y: 0, z: 0, rot: 0 });
      const xs = lv.map(l => +l.x.toFixed(3));
      layoutSpread = new Set(xs).size >= Math.min(lv.length, 3) && (Math.max(...xs) - Math.min(...xs)) > 0.3;
    }

    // ── PURE relative-placement: a direct leaf child lands at root + (dx,dy,dz) at rot=0
    const dl = pick.children.find(c => !c.isBom && (Math.abs(c.dx) > 0.001 || Math.abs(c.dy) > 0.001));
    const leavesAt = L.expandAssembly(pick.id, { x: 10, y: 7, z: 0, rot: 0 });
    let relativeOk = true;
    if (dl) {
      const hit = leavesAt.find(l => l.hash === dl.ref && near(l.x, 10 + dl.dx, 0.01) && near(l.y, 7 + dl.dy, 0.01));
      relativeOk = !!hit;
    }
    // ── PURE rotation compose: at rot=90, a child's local (dx,dy) maps to (−dy, dx) about the drop point
    const leaves90 = L.expandAssembly(pick.id, { x: 0, y: 0, z: 0, rot: 90 });
    let rotationOk = true;
    if (dl) {
      const want = { x: -dl.dy, y: dl.dx };
      rotationOk = !!leaves90.find(l => l.hash === dl.ref && near(l.x, want.x, 0.02) && near(l.y, want.y, 0.02));
    }
    // ── PURE determinism: two expansions are byte-identical
    const det = JSON.stringify(L.expandAssembly(pick.id, { x: 3, y: 2, z: 0, rot: 45 }))
             === JSON.stringify(L.expandAssembly(pick.id, { x: 3, y: 2, z: 0, rot: 45 }));

    // ── HOST DROP through the real UI path: pick the assembly button, click the grid → placeAssembly commits
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3, 6] }); O.clear();
    document.getElementById('b-insert').click(); await L.ready();
    document.querySelector('.ins-chip[data-g="asm"]').click();                         // Sets chip
    const lvlCat = document.querySelector('.ins-cat[data-cat="ASM_' + pick.level + '"]');
    if (lvlCat) lvlCat.click();                                                        // expand the level group
    const btn = document.querySelector('.ins-a[data-asm="' + pick.id + '"]');
    btn.click();                                                                       // select the assembly
    const c = document.getElementById('c'), rect = c.getBoundingClientRect();
    const v = new THREE.Vector3(4, 3, 0).project(window.A.camera);
    c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    for (let i = 0; i < 120 && O.length < N; i++) await new Promise(r => setTimeout(r, 50));

    const committed = O.length;
    const ver = await O.verify();
    const signedCount = O.db ? O.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE undone=0 AND sig IS NOT NULL")[0].values[0][0] : 0;
    const allInsert = O._geomOps().every(o => o.op_type === 'GEOM_INSERT');
    // distinct placements → the parts spread out (not all stacked at the drop point)
    const pts = O._geomOps().map(o => o.parameters.placement).map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2));
    const distinctPts = new Set(pts).size;
    // rendered meshes in the authored group
    const g = window.Bonsai.group(); const meshCount = g ? g.children.filter(o => o.isMesh).length : 0;
    // picker DETACHES after the drop (no ghost stuck to the pointer) — user-reported fix
    const ghostDetached = !window.A.scene.children.find(o => o.name === 'InsertGhost');

    return { pickId: pick.id, level: pick.level, parts: pick.children.length, directLeafLines, N,
      recursionExpanded, relativeOk, rotationOk, det, layoutSpread, linId, ghostDetached,
      committed, verify: !!(ver && ver.ok), signedCount, allInsert, distinctPts, meshCount };
  });

  await br.close(); server.close();
  console.log('  §ASSEMBLY ' + JSON.stringify(r));
  const checks = {
    nestedPicked:    r.level && r.parts > 0,
    recursionExpand: r.recursionExpanded === true,           // expansion > direct leaf-lines = a nested BOM unfolded
    linearSpread:    r.layoutSpread === true,                // zero-offset set SPREAD (PhantomLayout walk), not stacked
    ghostDetaches:   r.ghostDetached === true,               // picker shakes off the pointer after a drop
    relativePlace:   r.relativeOk === true,                  // leaf seats at root+(dx,dy,dz)
    rotationCompose: r.rotationOk === true,                  // yaw rotates child (dx,dy) about the drop point
    deterministic:   r.det === true,                         // identical expansion twice
    committedAllN:   r.committed === r.N && r.N > 1,         // host committed exactly N leaves
    allGeomInsert:   r.allInsert === true,                   // every row is a signed GEOM_INSERT
    chainVerifies:   r.verify === true,                      // signed kernel_ops chain verifies
    everyRowSigned:  r.signedCount === r.committed && r.committed > 0,
    partsSpread:     r.distinctPts > 1,                      // distinct placements (not stacked)
    renders:         r.meshCount >= r.N                      // N leaf meshes folded into the scene
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §ASSEMBLY VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
