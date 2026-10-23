#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALL-LINE (rule D59, prompts/DXF2BIM_FOUNDATION_LANE.md §D59). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a converted wall was several bodies (the pieces between openings + one band per opening, as wide as its hole); moving "the wall" moved one piece and left its door
 * behind, and the exported IFC / DB lost which wall an opening voids and which door fills it, so editing the converted ARC (or the reopened DB) could not move a door with its wall.
 *   L1 ONE WALL  — (Node toOps) the bodies of a line become one: Duplex wall bodies 92 -> fewer; every cut's void inside its parent; each line's volume = its members' (1e-6 m3); cuts and fills unchanged in number.
 *   L2 FALSIFIER — a member made 0.1 m taller keeps its line apart.
 *   L3 NAMED     — every cut whose void holds exactly one fill names it.
 *   L4 RIDES     — (the page, BROWSER=1) after Convert, a 0.5 m move of a wall hosting a door moves the door 0.5 m and the hole with it; one undo restores both.
 *   L5 KEPT      — the export: IfcRelFillsElement = IfcRelVoidsElement = the cuts (naming a fill) in the IFC; Viewer DB rel_fills_host = them. The reopen-for-editing is MEASURED (INFO): it is the Modeller open path's (SEAM-7 / SEAM-8).
 *   L6 UNCHANGED — (BASE) the shed (structure path) and the set's cuts / fills: counts equal to BASE.
 * Input: the Duplex marked set with the 4 §D58 exclusions (built here from the Duplex Node model db, as W-EXCLUDE-STD does) + the OCI library (unreachable -> INCONCLUSIVE).
 * Usage: NODE_PATH=<dir with better-sqlite3> [BASE=<a modeller dir before D59>] [BROWSER=1] node modeller/tests/witness_dxf_wall_line.js /tmp/db2/DXARC.db
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), crypto = require('crypto'), M = path.join(__dirname, '..'), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const load = dir => { const D = path.join(dir, 'dxf2bim') + '/'; return { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
  SH: require(D + 'dxf2shell.js'), DxfParser: require(path.join(dir, 'lib/dxf-parser.js')), I: require(path.join(dir, 'dxf2bim_import.js')), SG: require(path.join(dir, 'dxf2suggest.js')) }; };
const N = load(M), BASE = process.env.BASE ? load(path.resolve(process.env.BASE)) : null, db = process.argv[2], CLUSTERS = ['B6', 'D5', 'F1', 'F8'];
const LIBURL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/';
const wbox = P => { const b = P.bbox, c = P.placement, h = (b[5] - b[4]) / 2; return [c.x + b[0], c.y + b[2], c.z + h + b[4], c.x + b[1], c.y + b[3], c.z + h + b[5]]; };
const vol = b => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
(async () => {
  if (!db) { say('MISSING input: the Duplex Node model .db (/tmp/db2/DXARC.db)'); process.exit(2); }
  const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), R0 = N.S.writeStdSet(q, 'DX', {}), Dm = N.Mk.deriveMarks(R0, { B: N.B, DxfParser: N.DxfParser, hashHex, MK: N.MK, SHC: N.SHC, SCOPES: N.SC }, { set: 'DX' });
  const plain = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), sheets = N.I.readSheets(plain), P = new N.DxfParser();
  const L2 = sheets.find(s => s.role === 'plan' && /LEVEL_2/.test(s.name)), f = N.MK.UNITS[L2.desc.units];
  const run0 = N.B.run(L2.text, N.MK.withLayers(N.I.setWith('STD').MAP_PLAN, L2.desc), N.SHC.CFG, { DxfParser: N.DxfParser, hashHex, library: [] });
  const boxes = run0.ops.filter(o => o.op_type === 'DXF_OPENING' && o.params.kind === 'window' && CLUSTERS.indexOf(o.params.handle) >= 0).map(o => o.params.bbox.map(v => v / f)).map(b => [b[0] - 0.5, b[1] - 0.5, b[2] + 0.5, b[3] + 0.5].map(v => Number(v.toFixed(1))));
  const ex = plain.map(F => F.name !== L2.name ? F : { name: F.name, text: N.MK.writeMarks(N.SG.stripMarks(F.text), N.MK.readMarks(P.parseSync(F.text).entities).map(m => ({ text: m.raw, x: m.x, y: m.y })).concat(boxes.map(b => ({ text: '@EXCLUDE=' + b.join(',') + ' @BY=user', x: 0, y: 0 })))) });
  let lib = null; try { lib = (await N.I.loadOci(N.I.readSheets(ex), { fetchJson: async u => (await fetch(u)).json(), base: LIBURL })).library; } catch (e) { say('INFO library fetch failed: ' + e.message); }
  if (!lib) { say('INCONCLUSIVE L1-L6 | no library reachable: nothing judged'); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  const R = N.I.convert(N.I.readSheets(ex), { library: lib }), T = N.I.toOps(R, {});
  const WC = { IfcWall: 1, IfcCurtainWall: 1 }, walls = T.inserts.filter(o => WC[o.params.ifc_class]);
  const inside = c => { const b = wbox(T.inserts[c.params.parent].params), V = c.params.void, t = 1e-6; return [0, 1, 2].every(k => Math.min(V.c1[k], V.c2[k]) >= b[k] - t && Math.max(V.c1[k], V.c2[k]) <= b[k + 3] + t); };
  // the members' volume: the bodies BEFORE the merge, by member guid (a run of toOps with the merge off is not available; members are listed in provenance.members and the BASE toOps holds them)
  let volOk = 'no BASE', cutsSame = 'no BASE';
  if (BASE) { const R1 = BASE.I.convert(BASE.I.readSheets(ex), { library: lib }), T0 = BASE.I.toOps(R1, {}), byG = {}; T0.inserts.forEach(o => { byG[o.outputGuid] = o; });
    const bad = walls.filter(o => o.params.provenance.members).filter(o => Math.abs(vol(wbox(o.params)) - o.params.provenance.members.reduce((n, g) => n + vol(wbox(byG[g].params)), 0)) > 1e-6);
    volOk = bad.length === 0; cutsSame = T0.cuts.length === T.cuts.length && T0.fills.length === T.fills.length;
    say('INFO before: wall bodies ' + T0.inserts.filter(o => WC[o.params.ifc_class]).length + ', cuts ' + T0.cuts.length + ', fills ' + T0.fills.length); }
  check('L1', 'a drawn line is ONE wall body; every void inside its parent; volume conserved; cuts and fills unchanged', T.lines && T.lines.bodies_after < T.lines.bodies_before && T.cuts.every(inside) && volOk === true && cutsSame === true,
    `lines=${JSON.stringify(T.lines)} walls=${walls.length} voids_inside=${T.cuts.filter(inside).length}/${T.cuts.length} volume_conserved=${volOk} cuts_fills_same=${cutsSame}`);
  { const R2 = N.I.convert(N.I.readSheets(ex), { library: lib }), drawn = new Set(R2.els.map(e => 'dxf-' + e.guid));
    const multi = walls.find(o => (o.params.provenance.members || []).some(g => drawn.has(g))), mg = multi.params.provenance.members, raised = mg.find(g => drawn.has(g));
    R2.els = R2.els.map(e => { if (('dxf-' + e.guid) !== raised) return e; const top = Math.max(...e.vertices.map(w => w[2])); return Object.assign({}, e, { vertices: e.vertices.map(v => [v[0], v[1], v[2] === top ? v[2] + 0.1 : v[2]]) }); });
    const T2 = N.I.toOps(R2, {}), W2 = T2.inserts.filter(o => WC[o.params.ifc_class]);
    const still = W2.some(o => (o.params.provenance.members || []).indexOf(raised) >= 0), alone = W2.some(o => o.outputGuid === raised);
    check('L2', 'a member made 0.1 m taller is not merged into its line (never a stretched body)', !still && alone, `line=${mg.length} members, raised=${raised} in_a_line_after=${still} its_own_body=${alone}`); }
  const named = T.cuts.filter(c => c.params.slide.filling), fillIx = new Set(named.map(c => c.params.slide.fillingIdx));
  check('L3', 'every cut whose void holds one fill names it (distinct fills)', named.length > 0 && fillIx.size === named.length, `cuts=${T.cuts.length} naming_a_fill=${named.length} distinct_fills=${fillIx.size} fills=${T.fills.length}`);
  if (BASE) { const sh = path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
    if (fs.existsSync(sh)) { const F = fs.readdirSync(sh).filter(x => /\.dxf$/i.test(x)).map(n => ({ name: n, text: fs.readFileSync(path.join(sh, n), 'utf8') })), a = N.I.gate(N.I.readSheets(F), {}), b = BASE.I.gate(BASE.I.readSheets(F), {});
      check('L6', 'the shed (structure path) gates the same as BASE', JSON.stringify(a.refused) === JSON.stringify(b.refused) && a.set === b.set, `set=${a.set} refused=${a.refused.length}`); }
    else say('INCONCLUSIVE L6 | the marked shed set is absent'); }
  if (!process.env.BROWSER) { say('INFO L4/L5 | the page checks run with BROWSER=1'); say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0); }
  // ---- the page
  const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(M, '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wline-'));
  const files = ex.map(F => { fs.writeFileSync(path.join(dir, F.name), F.text); return path.join(dir, F.name); });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
  const srv = http.createServer((rq, rs) => { const p = decodeURIComponent(rq.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port, ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const open = async br => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.errs = []; pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/bridge published|§IFC-FILLS|§MODELLER-ROOM-INJECT|rider/.test(t)) say('  ' + t.slice(0, 240)); });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 }); return pg; };
  // in-page probe: a host wall with a door edge, move it 0.5 m along its long axis, measure door + hole, undo
  const probe = async (pg, doUndo) => pg.evaluate(async (doUndo) => {
    const X = window.swXEdges, F = window.__arcFidByGuid; if (!X || !X.fills || !F) return { err: 'no bridge', fills: X && X.fills ? X.fills.length : null };
    const g = window.Bonsai.group(), mesh = fid => g.children.find(m => m.isMesh && m.userData && m.userData.featureId === fid);
    const bb = fid => { const m = mesh(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
    const coords = (fid, k) => { const m = mesh(fid), a = m.geometry.attributes.position, s = new Set(); for (let i = 0; i < a.count; i++) s.add(+(k === 0 ? a.getX(i) : a.getY(i)).toFixed(3)); return Array.from(s); };
    const e = X.fills.find(x => x.filling_class === 'IfcDoor' && F[x.host_guid] != null && F[x.filling_guid] != null && (() => { const b = bb(F[x.host_guid]), d = bb(F[x.filling_guid]); if (!b || !d) return false; const k = (b[3] - b[0]) >= (b[4] - b[1]) ? 0 : 1; return d[k] > b[k] + 0.05 && d[k + 3] < b[k + 3] - 0.05; })());
    if (!e) return { err: 'no wall longer than its door', fills: X.fills.length };
    const hf = F[e.host_guid], df = F[e.filling_guid], b0 = bb(hf), d0 = bb(df), k = (b0[3] - b0[0]) >= (b0[4] - b0[1]) ? 0 : 1, O = window.Bonsai.oplog, n0 = O.length; window.__c0 = coords(hf, k);
    window.Bonsai.select(hf); const dv = [0, 0, 0]; dv[k] = 0.5; await window.__commitMove(dv[0], dv[1], dv[2]); await new Promise(r => setTimeout(r, 1500));
    const b1 = bb(hf), d1 = bb(df), c0 = window.__c0, c1 = coords(hf, k);
    // the hole = the wall mesh's coordinates along the axis that are not its two ends; moved = every such coordinate of before + 0.5 is present after
    const inner = c => c.filter(x => Math.abs(x - Math.min.apply(null, c)) > 0.003 && Math.abs(x - Math.max.apply(null, c)) > 0.003).sort((p, q) => p - q);
    const h0 = inner(c0), h1 = inner(c1), moved = h0.length > 0 && h0.every(v => h1.some(x => Math.abs(x - (v + 0.5)) <= 0.003));
    const r = { fills: X.fills.length, axis: 'xy'[k], wallDx: +(b1[k] - b0[k]).toFixed(3), doorDx: +(d1[k] - d0[k]).toFixed(3), holeEdges: h0.length, holeAtNew: moved, ops: O.length - n0 };
    if (doUndo) { await O.undo(); await new Promise(r2 => setTimeout(r2, 1500)); const b2 = bb(hf), d2 = bb(df); r.undoWall = +(b2[k] - b0[k]).toFixed(3); r.undoDoor = +(d2[k] - d0[k]).toFixed(3); }
    return r; }, doUndo);
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try {
    const pg = await open(br); await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; }); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 300000 }).catch(() => {});
    const ok = await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok));
    if (!ok) { say('INCONCLUSIVE L4/L5 | the page gate did not qualify (library?): nothing judged'); }
    else {
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await new Promise(r => setTimeout(r, 2000));
      const A = await probe(pg, true);
      check('L4', 'after Convert a 0.5 m move of a wall hosting a door moves the door 0.5 m and its hole, in one gesture; one undo restores both', !A.err && A.wallDx === 0.5 && A.doorDx === 0.5 && A.holeAtNew && A.undoWall === 0 && A.undoDoor === 0 && !pg.errs.length, JSON.stringify(A));
      const D = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }), enc = b => { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; }; return { db: enc(r.bytes), ifc: enc(r.ifcBytes) }; });
      const vdb = path.join(dir, 'wall_line_viewer.db'), vifc = path.join(dir, 'wall_line.ifc'); fs.writeFileSync(vdb, Buffer.from(D.db, 'latin1')); fs.writeFileSync(vifc, Buffer.from(D.ifc, 'latin1'));
      const d = new Database(vdb, { readonly: true }), nf = d.prepare('select count(*) c from rel_fills_host').get().c, nfh = d.prepare("select count(*) c from rel_fills_host where host_guid is not null and filling_guid is not null").get().c;
      const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
      try { const p2 = await open(br2); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
        const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vifc]);   // the IFC: an .ifc open seeds an EDITABLE model (mo_ifc_), a local .db opens read-only (SEAM-7)
        await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }).catch(() => {}); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 3000));
        const B2 = await probe(p2, false);
        const ifcTxt = fs.readFileSync(vifc, 'latin1'), nFillsIfc = (ifcTxt.match(/=\s*IFCRELFILLSELEMENT\(/g) || []).length, nVoidsIfc = (ifcTxt.match(/=\s*IFCRELVOIDSELEMENT\(/g) || []).length;
        check('L5', 'the export keeps the relations: IFC IfcRelFillsElement = IfcRelVoidsElement = the cuts naming a fill, and the Viewer DB rel_fills_host = them, host and filling set', nf === named.length && nfh === nf && nFillsIfc === named.length && nVoidsIfc === T.cuts.length,
          `ifc fills=${nFillsIfc} voids=${nVoidsIfc} cuts=${T.cuts.length} db rel_fills_host=${nf} (host+filling ${nfh}) named=${named.length}`);
        say('INFO L5-reopen (measured, not judged: the Modeller open path, SEAM-7 / SEAM-8) the exported IFC reopened for editing: ' + JSON.stringify(B2));
      } finally { await br2.close(); }
    }
  } finally { await br.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + e.stack); process.exit(1); });
