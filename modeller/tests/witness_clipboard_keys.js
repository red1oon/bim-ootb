#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CLIPBOARD-KEYS (BIMCompiler prompts/MODELLER_CLIPBOARD_COPY_PASTE.md §REGROUND 2026-10-28). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the Modeller had no copy / paste at all; a copy that drops its hole, its door or the door's link to its wall would look like a copy and not be one.
// Driven as a person does it on the converted Duplex (the marked set with the 4 §D58 exclusions, as W-WALL-LINE builds it): select a wall that hosts a door, Ctrl+C, Ctrl+V.
//   K1 +1 + the wall's hosted fillings (its door, and any window) and + the wall's own cuts; every vertex of the pasted wall (its hole included) = the source wall's + the paste shift, and the pasted door's box = its source's + shift (1 mm)
//   K2 the pasted door rides a 0.5 m Move of the pasted wall (the re-keyed fills edge works), and the source door does not move
//   K3 one Ctrl+Z after the paste restores the element count and every box; Ctrl+Y brings the paste back
//   K4 0 page errors
// Input: the Duplex Node model db (default ~/.cache/dxf2bim/db/DXARC.db) + the OCI library (unreachable -> INCONCLUSIVE). Missing input -> MISSING, exit 2.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_clipboard_keys.js [DXARC.db]
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), crypto = require('crypto'), M = path.join(__dirname, '..'), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const D = path.join(M, 'dxf2bim') + '/', N = { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
  DxfParser: require(path.join(M, 'lib/dxf-parser.js')), I: require(path.join(M, 'dxf2bim_import.js')), SG: require(path.join(M, 'dxf2suggest.js')) };
const DB = process.argv[2] || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db'), CLUSTERS = ['B6', 'D5', 'F1', 'F8'], MM = 0.001;
const LIBURL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!fs.existsSync(DB)) { console.log('MISSING input: the Duplex Node model db (' + DB + ')'); process.exit(2); }
  // the marked set + the 4 exclusions (W-WALL-LINE's own construction)
  const con = new Database(DB, { readonly: true }), q = s => con.prepare(s).all(), R0 = N.S.writeStdSet(q, 'DX', {}), Dm = N.Mk.deriveMarks(R0, { B: N.B, DxfParser: N.DxfParser, hashHex, MK: N.MK, SHC: N.SHC, SCOPES: N.SC }, { set: 'DX' });
  const plain = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), sheets = N.I.readSheets(plain), P = new N.DxfParser();
  const L2 = sheets.find(s => s.role === 'plan' && /LEVEL_2/.test(s.name)), f = N.MK.UNITS[L2.desc.units];
  const run0 = N.B.run(L2.text, N.MK.withLayers(N.I.setWith('STD').MAP_PLAN, L2.desc), N.SHC.CFG, { DxfParser: N.DxfParser, hashHex, library: [] });
  const boxes = run0.ops.filter(o => o.op_type === 'DXF_OPENING' && o.params.kind === 'window' && CLUSTERS.indexOf(o.params.handle) >= 0).map(o => o.params.bbox.map(v => v / f)).map(b => [b[0] - 0.5, b[1] - 0.5, b[2] + 0.5, b[3] + 0.5].map(v => Number(v.toFixed(1))));
  const ex = plain.map(F => F.name !== L2.name ? F : { name: F.name, text: N.MK.writeMarks(N.SG.stripMarks(F.text), N.MK.readMarks(P.parseSync(F.text).entities).map(m => ({ text: m.raw, x: m.x, y: m.y })).concat(boxes.map(b => ({ text: '@EXCLUDE=' + b.join(',') + ' @BY=user', x: 0, y: 0 })))) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wclip-')), files = ex.map(F => { fs.writeFileSync(path.join(dir, F.name), F.text); return path.join(dir, F.name); });
  const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(M, '..');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
  const srv = http.createServer((rq, rs) => { const p = decodeURIComponent(rq.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
  pg.on('console', m => { const t = m.text(); if (/^§CLIPBOARD|bridge published|§SDG-CASCADE hosted-by hosts|^§GATE /.test(t)) console.log('  ' + t.slice(0, 300)); });
  const key = async k => { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); await sleep(2500); };
  try {
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.clipboard', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; }); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 300000 }).catch(() => {});
    if (!await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok))) { console.log('§W-CLIPBOARD-KEYS INCONCLUSIVE: the set did not qualify (library?): nothing judged'); process.exit(1); }
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
    // the page's own state readers
    await pg.evaluate(() => {
      const g = () => window.Bonsai.group(); window.__mesh = fid => g().children.find(m => m.isMesh && m.userData && m.userData.featureId === fid);
      window.__bb = fid => { const m = window.__mesh(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
      window.__verts = fid => { const m = window.__mesh(fid); if (!m) return null; m.updateMatrixWorld(true); const a = m.geometry.attributes.position, v = new (m.matrixWorld.elements.constructor === Float32Array ? Array : Array)(), s = new Set();
        const e = m.matrixWorld.elements; for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); s.add([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]].map(t => t.toFixed(3)).join(',')); } return Array.from(s); };
      window.__state = () => { const ops = window.Bonsai.oplog._geomOps(), out = { n: 0, cuts: 0, boxes: {} }; ops.forEach(o => { if (o.op_type === 'GEOM_INSERT') { out.n++; const b = window.__bb(o.id); if (b) out.boxes[o.id] = b; } else if (o.op_type === 'GEOM_CUT') out.cuts++; }); return out; };
    });
    const pick = await pg.evaluate(() => { const X = window.swXEdges, F = window.__arcFidByGuid; if (!X || !X.fills || !F) return { err: 'no bridge' };
      const e = X.fills.find(x => x.filling_class === 'IfcDoor' && F[x.host_guid] != null && F[x.filling_guid] != null && window.__bb(F[x.host_guid]) && window.__bb(F[x.filling_guid]));
      if (!e) return { err: 'no wall hosting a door', fills: X.fills.length };
      const hosted = X.fills.filter(x => x.host_guid === e.host_guid && F[x.filling_guid] != null).length, cuts = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_CUT' && o.parameters.parent === F[e.host_guid]).length;
      return { wall: F[e.host_guid], door: F[e.filling_guid], hosted, cuts, fills: X.fills.length }; });
    console.log('§CLIPBOARD-KEYS pick wall #' + pick.wall + ' door #' + pick.door + ' hosts ' + pick.hosted + ' filling(s), ' + pick.cuts + ' cut(s)');
    if (pick.err) { ok('K1 a wall hosting a door is pasted with its door and hole', false, JSON.stringify(pick)); throw new Error('no pick'); }
    const S0 = await pg.evaluate(() => window.__state()), V0 = await pg.evaluate(f => window.__verts(f), pick.wall);
    await pg.evaluate(f => window.Bonsai.select(f), pick.wall); await key('c'); await key('v');
    const R = await pg.evaluate(() => { const h = window.Bonsai.clipboard.held; return { held: h && { fids: h.fids, n: h.n, how: h.how }, stat: (document.getElementById('stat') || {}).textContent }; });
    const S1 = await pg.evaluate(() => window.__state()), added = Object.keys(S1.boxes).filter(id => !S0.boxes[id]).map(Number);
    const meta = await pg.evaluate(ids => { const ops = window.Bonsai.oplog._geomOps(); return ids.map(id => { const o = ops.find(q => q.id === id); return { id, cls: o.parameters.ifc_class, copyOf: o.parameters.copyOf }; }); }, added);
    const pw = (meta.find(m => m.copyOf === pick.wall) || {}).id, pd = (meta.find(m => m.copyOf === pick.door) || {}).id;
    const sh = pw != null ? [0, 1, 2].map(k => (S1.boxes[pw][k] - S0.boxes[pick.wall][k])) : [0, 0, 0];
    const V1 = pw != null ? await pg.evaluate(f => window.__verts(f), pw) : [], shifted = new Set(V0.map(s => s.split(',').map((v, k) => (+v + sh[k]).toFixed(3)).join(',')));
    const vOff = V1.filter(s => !shifted.has(s)).length + V0.length - V1.length;
    const dOk = pd != null && S1.boxes[pd].every((v, i) => Math.abs(v - (S0.boxes[pick.door][i] + sh[i % 3])) <= MM);
    ok('K1 Ctrl+C / Ctrl+V on a wall hosting a door: + the wall and every filling it hosts, + its cuts; the pasted wall\'s every vertex (its hole too) = the source\'s + shift; the pasted door = its source + shift',
      added.length === 1 + pick.hosted && S1.cuts === S0.cuts + pick.cuts && pw != null && pd != null && V1.length > 8 && vOff === 0 && dOk,
      'want +' + (1 + pick.hosted) + ' elements +' + pick.cuts + ' cuts | added ' + JSON.stringify(meta) + ' cuts ' + S0.cuts + '->' + S1.cuts + ' | shift ' + sh.map(v => v.toFixed(3)).join(',') + ' (' + (R.held && R.held.how) + ') | wall verts ' + V0.length + '/' + V1.length + ' off ' + vOff + ' | door ok=' + dOk + ' | status "' + String(R.stat).slice(0, 120) + '"');
    // K3 one undo, one redo (before the ride, so the paste is the last gesture)
    const same = (A, B) => { const ka = Object.keys(A.boxes), kb = Object.keys(B.boxes); if (ka.length !== kb.length || A.cuts !== B.cuts) return 'count ' + ka.length + '/' + A.cuts + ' vs ' + kb.length + '/' + B.cuts; for (const id of ka) { if (!B.boxes[id]) return 'missing #' + id; if (A.boxes[id].some((v, i) => Math.abs(v - B.boxes[id][i]) > MM)) return 'moved #' + id; } return ''; };
    await key('z'); const S2 = await pg.evaluate(() => window.__state()), u = same(S0, S2); await key('y'); const S3 = await pg.evaluate(() => window.__state()), y = same(S1, S3);
    ok('K3 one Ctrl+Z removes the paste (count, cuts, every box); Ctrl+Y brings it back', u === '' && y === '', 'undo: ' + (u || 'identical (' + Object.keys(S2.boxes).length + ' elements, ' + S2.cuts + ' cuts)') + ' | redo: ' + (y || 'identical'));
    // K2 the pasted door rides a move of the pasted wall
    const K = await pg.evaluate(async (pw, pd, sd) => { const b0 = window.__bb(pw), d0 = window.__bb(pd), s0 = window.__bb(sd), k = (b0[3] - b0[0]) >= (b0[4] - b0[1]) ? 0 : 1, dv = [0, 0, 0]; dv[k] = 0.5;
      window.Bonsai.select(pw); await window.__commitMove(dv[0], dv[1], dv[2]); await new Promise(r => setTimeout(r, 2000));
      const b1 = window.__bb(pw), d1 = window.__bb(pd), s1 = window.__bb(sd); return { axis: 'xy'[k], wall: +(b1[k] - b0[k]).toFixed(3), door: +(d1[k] - d0[k]).toFixed(3), source: +(s1[k] - s0[k]).toFixed(3) }; }, pw, pd, pick.door);
    ok('K2 the pasted door rides a 0.5 m move of the pasted wall; the source door stays', K.wall === 0.5 && K.door === 0.5 && K.source === 0, JSON.stringify(K));
    ok('K4 no page errors', errs.length === 0, 'errors=' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } catch (e) { if (!/no pick/.test(String(e && e.message))) ok('K run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-CLIPBOARD-KEYS ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
