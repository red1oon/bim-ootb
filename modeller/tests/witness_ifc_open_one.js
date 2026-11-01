#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-OPEN-ONE (P-X, prompts/DXF2BIM_ARCHITECT_REVIEW.md ### P-X SPEC). Read the log after every run; exit code is not evidence.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (owner 2026-11-02: "all downstream just work on the DB format. A single source of truth"): a raw .ifc opened in the
 * Modeller was converted by a SECOND converter (the Viewer's import_worker.js + the Modeller's _filterArc + import_db_builder.js) whose DB differs from every
 * resident's (no property sets / types / spatial structure; a FILENAME discipline rule that seeds *_ARC.ifc STR members as ARC and empties an *_STR.ifc).
 * P-X routes the open through the shared extractor + the residents' rule (modeller/ifc_open_db.js). Claims:
 *   O1 SAME DB AS THE RESIDENT — the opened DB's element guid set = the resident's (its self-heal patch applied, as the Modeller opens it): 0 missing,
 *      0 extra; centre/bbox Δ 0 m; every resident-instanced guid has a mesh with the same triangle count and area (≤1e-4 rel), or the resident mesh is a
 *      curated layered one (component_geometry_layers), or within the residents' ≤1 mm dedup bound (|ΔA| ≤ 0.004·(bx+by+bz)); each class COUNTED.
 *      rel_fills_host triples = the resident's. (SampleCastle: an older ARC-only lineage — compared on its ARC rows, stated.)
 *   O2 SAME MESH AS THE VIEWER'S IMPORT — every element the Viewer's import worker and the open both keep has byte-identical vertices + faces, centre, bbox.
 *   O3 ONE DB HOLDS THE FACTS — element_pset_common = the extractor's rows for the kept guids; spatial_structure = the extractor's (building + storeys), not empty.
 *   O4 FALSIFIERS — no class dropped → O1 FAIL (extra = the IfcSpace + IfcOpeningElement rows); one vertex moved 1 cm → O2 FAIL naming the guid;
 *      one wall's GlobalId changed in the IFC text → O1 FAIL (1 missing, 1 extra).
 *   O5 THE PAGE — headless Modeller opens the raw Duplex .ifc: one §IFC-OPEN-X kept=<oracle>, the ARC seed commits the oracle's ARC count with hardfail=0,
 *      the Properties panel shows a wall's Pset rows = the oracle with source=building and no §PROPS_IFC_EXTRACT; 0 page errors. BROWSER=0 → printed, not judged.
 * Usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_ifc_open_one.js   (PX_FULL=1 adds the Hospital, 77 MB)
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), https = require('https');
const ROOT = path.join(__dirname, '..', '..'), M = path.join(ROOT, 'modeller'), NM = path.join(os.homedir(), 'bim-compiler', 'node_modules');
const initSqlJs = require(path.join(NM, 'sql.js')), WebIFC = require(path.join(NM, 'web-ifc'));
const Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(M, 'ifc_open_db.js'));
const GEO_BASE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/modeller/', GEO_DIR = path.join(os.homedir(), '.cache', 'dxf2bim', 'geo');
const H = os.homedir(), U = path.join(H, 'bim-compiler', 'internal');
const CASES = [
  { key: 'SampleHouse', ifc: path.join(ROOT, 'IFC', 'SampleHouse_ARC.ifc'), res: 'SampleHouse_ARC.db', geo: 'SampleHouse_geo.db' },
  { key: 'Duplex', ifc: path.join(ROOT, 'IFC', 'Duplex_ARC.ifc'), res: 'Duplex_ARC.db', geo: 'Duplex_geo.db' },
  { key: 'HHS', ifc: path.join(U, 'UNMERGED', 'opensourceBIM_HHS_Office_architect.ifc'), res: 'HHS_ARC.db', geo: 'HHS_geo.db' },
  { key: 'Clinic', ifc: path.join(U, 'UNMERGED', 'Clinic_Architectural_IFC2x3.ifc'), res: 'Clinic_ARC.db', geo: 'Clinic_geo.db' },
  { key: 'Garage', ifc: path.join(H, 'Projects', 'bim-compiler', 'DAGCompiler', 'lib', 'input', 'IFC', 'HospitalGarage_IFC4.ifc'), res: 'Garage_ARC.db', geo: 'HospitalGarage_geo.db' },
  { key: 'SampleCastle', ifc: path.join(U, 'sources', 'Ifc2x3_SampleCastle.ifc'), res: 'SampleCastle_ARC.db', geo: 'SampleCastle_geo.db', arcOnly: true },
].concat(process.env.PX_FULL ? [{ key: 'Hospital', ifc: path.join(U, 'UNMERGED', 'Hospital_IFC4_ARC.ifc'), res: 'Hospital_ARC.db', geo: 'Hospital_geo.db' }] : []);
let fail = 0, judged = 0, inconclusive = 0;
const say = s => console.log(s);
const check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const rows = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
const has = (db, t) => (rows(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'") || []).length > 0;
const getUrl = url => new Promise((res, rej) => https.get(url, r => { if (r.statusCode !== 200) { r.resume(); rej(new Error('HTTP ' + r.statusCode)); return; } const b = []; r.on('data', c => b.push(c)); r.on('end', () => res(Buffer.concat(b))); }).on('error', rej));
async function geoDb(SQL, name) {   // the resident's mesh DB (OCI, as the Modeller fetches it), cached once under ~/.cache/dxf2bim/geo
  const p = path.join(GEO_DIR, name);
  if (!fs.existsSync(p)) { fs.mkdirSync(GEO_DIR, { recursive: true }); fs.writeFileSync(p, await getUrl(GEO_BASE + name)); say('  §GEO_FETCHED ' + name); }
  return new SQL.Database(fs.readFileSync(p));
}
function patched(SQL, res) {   // the resident as the Modeller opens it: the .db + modeller/patches/<db>.sql, applied statement by statement (§PATCH-SELFHEAL)
  const db = new SQL.Database(fs.readFileSync(path.join(M, res))), pp = path.join(M, 'patches', res + '.sql');
  let n = 0;
  if (fs.existsSync(pp)) { let st = ''; for (const line of fs.readFileSync(pp, 'utf8').split('\n')) { st += line + '\n'; if (/;\s*$/.test(line)) { try { db.run(st); n++; } catch (e) { } st = ''; } } }
  return { db, n };
}
function sig(v, f) {   // rotation-invariant mesh signature: triangle count + surface area
  const V = new Float32Array(v.buffer, v.byteOffset, v.byteLength / 4), F = new Uint32Array(f.buffer, f.byteOffset, f.byteLength / 4); let area = 0;
  for (let i = 0; i + 2 < F.length; i += 3) { const a = F[i] * 3, b = F[i + 1] * 3, c = F[i + 2] * 3, ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2; }
  return { tris: F.length / 3, area };
}
const meshes = (db, gdb) => { const hs = {}; (rows(gdb || db, 'SELECT geometry_hash, vertices, faces FROM component_geometries') || []).forEach(r => hs[r[0]] = sig(r[1], r[2])); const o = {}; (rows(db, 'SELECT guid, geometry_hash FROM element_instances') || []).forEach(r => o[r[0]] = { h: r[1], s: hs[r[1]] }); return o; };
const tr = db => { const o = {}; (rows(db, 'SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms') || []).forEach(r => o[r[0]] = r.slice(1)); return o; };
const clsCount = (db, gs) => { const c = {}; gs.forEach(g => { const r = rows(db, "SELECT ifc_class FROM elements_meta WHERE guid='" + g.replace(/'/g, "''") + "'"); const k = r && r[0] ? r[0][0] : '?'; c[k] = (c[k] || 0) + 1; }); return JSON.stringify(c); };
// O1 judged as a pure function so a falsifier can feed it a wrong DB
function o1(O, R, G, arcOnly) {
  const where = arcOnly ? " WHERE discipline='ARC'" : '';
  const oS = new Set(rows(O, 'SELECT guid FROM elements_meta' + where).map(r => r[0])), rS = new Set(rows(R, 'SELECT guid FROM elements_meta' + where).map(r => r[0]));
  const missing = [...rS].filter(g => !oS.has(g)), extra = [...oS].filter(g => !rS.has(g));
  const ot = tr(O), rt = tr(R); let dC = 0, dB = 0, shared = 0;
  for (const g of rS) { const p = rt[g], q = ot[g]; if (!p || !q) continue; shared++; for (let k = 0; k < 3; k++) { dC = Math.max(dC, Math.abs(p[k] - q[k])); dB = Math.max(dB, Math.abs(p[k + 3] - q[k + 3])); } }
  const om = meshes(O), rm = meshes(R, G), layered = new Set(G && has(G, 'component_geometry_layers') ? rows(G, 'SELECT DISTINCT geometry_hash FROM component_geometry_layers').map(r => r[0]) : []);
  const k = { exact: 0, layered: 0, dedup1mm: 0, unexplained: 0, noMesh: 0, noResMesh: 0 }, firstBad = [];
  for (const g of rS) { const r = rm[g]; if (!r) continue; if (!r.s) { k.noResMesh++; continue; } const o = om[g];
    if (!o || !o.s) { k.noMesh++; if (firstBad.length < 3) firstBad.push(g + ' no mesh'); continue; }
    const dA = Math.abs(r.s.area - o.s.area), rel = dA / Math.max(o.s.area, 1e-9), b = rt[g] || [0, 0, 0, 0, 0, 0];
    if (r.s.tris === o.s.tris && rel <= 1e-4) k.exact++;
    else if (layered.has(r.h)) k.layered++;
    else if (r.s.tris === o.s.tris && dA <= 0.004 * (Math.abs(b[3]) + Math.abs(b[4]) + Math.abs(b[5]))) k.dedup1mm++;
    else { k.unexplained++; if (firstBad.length < 3) firstBad.push(g + ' tris ' + r.s.tris + '/' + o.s.tris + ' area ' + r.s.area.toFixed(4) + '/' + o.s.area.toFixed(4)); } }
  const fk = db => new Set((has(db, 'rel_fills_host') ? rows(db, 'SELECT opening_guid, host_guid, ifnull(filling_guid, \'\') FROM rel_fills_host') : []).map(r => r.join('|')));
  const of = fk(O), rf = fk(R), fMiss = [...rf].filter(x => !of.has(x)).length, fExtra = [...of].filter(x => !rf.has(x)).length;
  const ok = rS.size > 0 && !missing.length && !extra.length && dC <= 1e-9 && dB <= 1e-9 && !k.unexplained && !k.noMesh && (!rf.size || (!fMiss && !fExtra));
  return { ok, oN: oS.size, rN: rS.size, shared, missing, extra, dC, dB, k, firstBad, fills: rf.size ? `fills R=${rf.size} O=${of.size} missing=${fMiss} extra=${fExtra}` : 'fills R=none (table absent)' };
}

// O6 judged as a pure function (a falsifier feeds it a wrong DB). Pairs = rel_aggregates (parent|child). "Spatial" = parent is no element (the storey -> building rows).
function o6(O, R) {
  const pairs = db => new Set((has(db, 'rel_aggregates') ? rows(db, 'SELECT parent_guid, child_guid FROM rel_aggregates') : []).map(r => r[0] + '|' + r[1]));
  const isEl = db => { const s = new Set(rows(db, 'SELECT guid FROM elements_meta').map(r => r[0])); return g => s.has(g); };
  const hasTr = db => { const s = new Set(rows(db, 'SELECT guid FROM element_transforms').map(r => r[0])); return g => s.has(g); };
  const cls = db => { const o = {}; rows(db, 'SELECT guid, ifc_class FROM elements_meta').forEach(r => o[r[0]] = r[1]); return o; };
  const op = pairs(O), rp = pairs(R), oEl = isEl(O), oTr = hasTr(O), oCls = cls(O), rCls = cls(R);
  const missing = [...rp].filter(x => !op.has(x)), oGhost = [...op].filter(x => { const g = x.split('|')[0]; return oEl(g) && !oTr(g); });
  const ghostExtra = oGhost.filter(x => !rp.has(x)), spatial = [...op].filter(x => !oEl(x.split('|')[0])).length;
  const withGeo = [...op].filter(x => { const g = x.split('|')[0]; return oEl(g) && oTr(g) && !rp.has(x); }), byCls = {};
  withGeo.forEach(x => { const [p, c] = x.split('|'), k = (oCls[p] || '?') + '>' + (oCls[c] || '?'); byCls[k] = (byCls[k] || 0) + 1; });
  const nameP = x => { const [p, c] = x.split('|'); return (rCls[p] || oCls[p] || '?') + ' ' + p + ' > ' + (rCls[c] || oCls[c] || '?') + ' ' + c; };
  return { ok: rp.size > 0 && !missing.length && !ghostExtra.length, rN: rp.size, oN: op.size, spatial, missing, ghostExtra, withGeo: withGeo.length, byCls, nameP };
}
// the Viewer's own import (kept, untouched): import_worker.js in a vm (web-ifc = the Node build of the same 0.0.77) + import_db_builder.js, no Modeller filter
function runWorker(bytes, filename) {
  return new Promise((resolve, reject) => {
    const vdir = path.join(ROOT, 'viewer'), quiet = { log() {}, warn() {}, error() {}, info() {} };
    const ctx = { console: quiet, setTimeout, clearTimeout, TextDecoder, TextEncoder, URL, Blob, WebAssembly, performance, process, require, __dirname: vdir, __filename: path.join(vdir, 'import_worker.js'), Buffer, atob: s => Buffer.from(s, 'base64').toString('binary') };
    ctx.self = ctx; ctx.globalThis = ctx;
    ctx.importScripts = f => { if (/web-ifc-api-iife\.js$/.test(f)) { ctx.WebIFC = WebIFC; return; } const p = path.join(vdir, f); vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p }); };
    ctx.postMessage = m => { if (m && m.type === 'done') resolve(m); else if (m && m.type === 'error') reject(new Error(m.message)); };
    vm.createContext(ctx);
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'w-px-wasm-')); fs.symlinkSync(path.join(NM, 'web-ifc'), path.join(wd, 'lib'));
    const cwd = process.cwd(); process.chdir(wd);
    vm.runInContext(fs.readFileSync(path.join(vdir, 'import_worker.js'), 'utf8'), ctx, { filename: 'import_worker.js' });
    Promise.resolve(ctx.onmessage({ data: { arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filename } })).catch(reject).finally(() => process.chdir(cwd));
  });
}
function buildViewerDb(SQL, data) { const ctx = { console: { log() {}, warn() {}, error() {} }, SQL, data, Uint8Array, Float32Array, Uint32Array, Int32Array, Math, JSON, Date, Object, Array, String };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'import_db_builder.js'), 'utf8') + '\n;__out = buildImportDBs(SQL, data);', ctx); return new SQL.Database(new Uint8Array(ctx.__out.extractedDb)); }
function o2(O, Wd) {   // byte-identical mesh + centre + bbox on every guid both keep
  const blob = db => { const o = {}; (rows(db, 'SELECT i.guid, g.vertices, g.faces FROM element_instances i JOIN component_geometries g ON g.geometry_hash = i.geometry_hash') || []).forEach(r => o[r[0]] = [r[1], r[2]]); return o; };
  const ob = blob(O), wb = blob(Wd), ot = tr(O), wt = tr(Wd); let shared = 0, diff = 0, dT = 0; const all = [];
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
  for (const g of Object.keys(wb)) { if (!ob[g]) continue; shared++; if (!eq(ob[g][0], wb[g][0]) || !eq(ob[g][1], wb[g][1])) { diff++; all.push(g); }
    const p = ot[g], q = wt[g]; if (p && q) for (let k = 0; k < 6; k++) dT = Math.max(dT, Math.abs(p[k] - q[k])); }
  return { ok: shared > 0 && !diff && dT <= 1e-9, shared, diff, dT, first: all.slice(0, 3), all };
}
(async () => {
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const present = CASES.filter(c => fs.existsSync(c.ifc)), absent = CASES.filter(c => !fs.existsSync(c.ifc));
  absent.forEach(c => { inconclusive++; say('INCONCLUSIVE ' + c.key + ' | source IFC missing on this machine: ' + c.ifc); });
  if (!present.length) { say('MISSING input: none of the residents\' source IFCs (' + CASES.map(c => c.ifc).join(' ') + ')'); process.exit(2); }
  const openIt = async (bytes, name, drop) => IOD.open({ WebIFC, ifcApi: api, SQL, Core, bytes: new Uint8Array(bytes), name, drop, log: () => {} });
  let duplex = null;
  for (const c of present) {
    const bytes = fs.readFileSync(c.ifc), name = path.basename(c.ifc, '.ifc'), out = await openIt(bytes, name);
    say('  ' + out.line.replace('§IFC-OPEN-X', '§IFC-OPEN-X[' + c.key + ']'));
    const R = patched(SQL, c.res); let G = null; try { G = await geoDb(SQL, c.geo); } catch (e) { say('  §GEO_UNAVAILABLE ' + c.geo + ' ' + e.message); }
    const r = o1(out.db, R.db, G, c.arcOnly);
    say(`  §O1[${c.key}] opened=${r.oN} resident=${r.rN} (patch statements ${R.n}) shared=${r.shared} missing=${r.missing.length} ${clsCount(R.db, r.missing.slice(0, 500))} extra=${r.extra.length} ${clsCount(out.db, r.extra.slice(0, 500))} dCentre=${r.dC.toFixed(9)} dBbox=${r.dB.toFixed(9)} meshes=${JSON.stringify(r.k)} ${r.fills}${r.firstBad.length ? ' first=' + r.firstBad.join(' | ') : ''}`);
    if (!G) { inconclusive++; say('INCONCLUSIVE O1[' + c.key + '] the resident mesh DB could not be read: meshes not judged'); }
    else check('O1[' + c.key + ']', 'the opened DB = the resident\'s' + (c.arcOnly ? ' (ARC rows: the resident is an older ARC-only lineage)' : '') + ': rows, centres, bboxes, meshes, fills', r.ok, `rows ${r.oN}/${r.rN} missing=${r.missing.length} extra=${r.extra.length} meshes ${JSON.stringify(r.k)}`);
    const a6 = o6(out.db, R.db);
    say(`  §O6[${c.key}] resident(patched) pairs=${a6.rN} opened pairs=${a6.oN} (spatial ${a6.spatial}) missing=${a6.missing.length} ghostExtra=${a6.ghostExtra.length} extraWithGeometryParent=${a6.withGeo} ${JSON.stringify(a6.byCls)}${a6.missing.length ? ' firstMissing=' + a6.missing.slice(0, 3).map(a6.nameP).join(' | ') : ''}`);
    if (!a6.rN) { inconclusive++; say('INCONCLUSIVE O6[' + c.key + '] the resident has no element-level rel_aggregates: nothing judged'); }
    else check('O6[' + c.key + ']', 'the opened rel_aggregates hold every patched-resident pair and, for ghost parents, exactly the resident\'s', a6.ok, `resident ${a6.rN} opened ${a6.oN} missing=${a6.missing.length} ghostExtra=${a6.ghostExtra.length} geometryParentExtra=${a6.withGeo}`);
    // O2: the Viewer's import, same file
    const t0 = Date.now(), Wd = buildViewerDb(SQL, await runWorker(bytes, path.basename(c.ifc))), w = o2(out.db, Wd);
    check('O2[' + c.key + ']', 'every element the Viewer\'s import and the open both keep: byte-identical mesh, centre, bbox', w.ok, `shared=${w.shared} meshDiff=${w.diff} maxTransformDiff=${w.dT} (${Date.now() - t0} ms)${w.first.length ? ' first=' + w.first.join(',') : ''}`);
    // O3: the facts are in the one DB
    const raw = await openIt(bytes, name, []), kept = new Set(rows(out.db, 'SELECT guid FROM elements_meta').map(r => r[0]));
    const pk = db => rows(db, 'SELECT guid, pset, name, value, source FROM element_pset_common ORDER BY 1,2,3').filter(r => kept.has(r[0])).map(r => r.join('|')).join('\n');
    const sp = db => rows(db, 'SELECT * FROM spatial_structure ORDER BY guid').map(r => r.join('|')), spT = db => JSON.stringify(rows(db, 'SELECT type, count(*) FROM spatial_structure GROUP BY type'));
    check('O3[' + c.key + ']', 'element_pset_common = the extractor\'s rows for the kept guids; spatial_structure = the extractor\'s, not empty', out.psetRows > 0 && pk(out.db) === pk(raw.db) && sp(out.db).length > 0 && sp(out.db).join('\n') === sp(raw.db).join('\n'),
      `psetRows=${out.psetRows} extractor(kept)=${pk(raw.db).split('\n').filter(Boolean).length} spatial_structure ${spT(out.db)} = extractor ${sp(out.db).join('\n') === sp(raw.db).join('\n')}`);
    if (c.key === 'Duplex') duplex = { c, bytes, name, out, raw, R, G, Wd }; else { raw.db.close(); out.db.close(); }
  }
  // O4 falsifiers (Duplex)
  if (!duplex) { inconclusive++; say('INCONCLUSIVE O4 the Duplex IFC is missing: falsifiers not run'); }
  else {
    const { c, bytes, name, out, raw, R, G, Wd } = duplex, sp = raw.dropped, a = o1(raw.db, R.db, G, false);
    const nDrop = Number(rows(raw.db, "SELECT count(*) FROM elements_meta WHERE ifc_class IN ('IfcSpace','IfcOpeningElement')")[0][0]);
    check('O4a', 'FALSIFIER no class dropped -> O1 FAILS with extra = the IfcSpace + IfcOpeningElement rows', !a.ok && a.extra.length === nDrop && nDrop > 0 && !a.missing.length, `O1 ok=${a.ok} extra=${a.extra.length} ${clsCount(raw.db, a.extra)} (want ${nDrop})`);
    const g = rows(out.db, 'SELECT i.guid, i.geometry_hash FROM element_instances i JOIN elements_meta m ON m.guid = i.guid WHERE m.ifc_class LIKE \'IfcWall%\' ORDER BY i.guid LIMIT 1')[0];
    const mut = new SQL.Database(out.db.export()), vb = rows(mut, "SELECT vertices FROM component_geometries WHERE geometry_hash='" + g[1] + "'")[0][0], v2 = new Uint8Array(vb), f32 = new Float32Array(v2.buffer, v2.byteOffset, v2.byteLength / 4);
    f32[0] += 0.01; const st = mut.prepare('UPDATE component_geometries SET vertices = ? WHERE geometry_hash = ?'); st.run([v2, g[1]]); st.free();
    const b = o2(mut, Wd);
    check('O4b', 'FALSIFIER one vertex of wall ' + g[0] + ' moved 1 cm in the opened DB -> O2 FAILS naming it', !b.ok && b.all.indexOf(g[0]) >= 0, `O2 ok=${b.ok} meshDiff=${b.diff} named=${b.all.indexOf(g[0]) >= 0} first=${b.first.join(',')}`);
    const txt = bytes.toString('latin1'), m = /#\d+\s*=\s*IFCWALLSTANDARDCASE\('([^']{22})'/.exec(txt);
    if (!m) { inconclusive++; say('INCONCLUSIVE O4c no IFCWALLSTANDARDCASE line found'); }
    else { const ng = (m[1][0] === 'Z' ? 'Y' : 'Z') + m[1].slice(1), edited = Buffer.from(txt.replace("IFCWALLSTANDARDCASE('" + m[1] + "'", "IFCWALLSTANDARDCASE('" + ng + "'"), 'latin1');
      const e = await openIt(edited, name), cc = o1(e.db, R.db, G, false);
      check('O4c', 'FALSIFIER wall ' + m[1] + ' renamed ' + ng + ' in the IFC text -> O1 FAILS: 1 missing, 1 extra', !cc.ok && cc.missing.length === 1 && cc.missing[0] === m[1] && cc.extra.length === 1 && cc.extra[0] === ng, `O1 ok=${cc.ok} missing=${cc.missing.join(',')} extra=${cc.extra.join(',')}`); e.db.close(); }
    { const tx = bytes.toString('latin1'), rm = /#(\d+)\s*=\s*IFCROOF\('([^']{22})'/.exec(tx);
      if (!rm) { inconclusive++; say('INCONCLUSIVE O4d no IFCROOF line found'); }
      else { const re = new RegExp('#\\d+\\s*=\\s*IFCRELAGGREGATES\\([^;]*?,#' + rm[1] + ',\\([^;]*\\);', 'g'), n = (tx.match(re) || []).length, e = await openIt(Buffer.from(tx.replace(re, ''), 'latin1'), name), d = o6(e.db, R.db);
        const roofR = rows(R.db, 'SELECT count(*) FROM rel_aggregates WHERE parent_guid = \'' + rm[2] + '\'')[0][0], named = d.missing.length > 0 && d.missing.length === roofR && d.missing.every(x => x.startsWith(rm[2] + '|'));
        check('O4d', 'FALSIFIER the ' + n + ' IFCRELAGGREGATES line(s) of roof ' + rm[2] + ' removed from the IFC -> O6 FAILS naming the roof > slab pair', n > 0 && !d.ok && named, `removed=${n} O6 ok=${d.ok} missing=${d.missing.length} (the roof's resident pairs: ${roofR}) onlyRoof=${named} first=${d.missing.slice(0, 2).map(d.nameP).join(' | ')}`); e.db.close(); } }
    // O5 the page
    if (process.env.BROWSER === '0') { inconclusive++; say('INCONCLUSIVE O5 BROWSER=0: the page was not judged'); }
    else await page(c, out.db, R.db);
  }
  say(fail ? `§VERDICT FAIL W-IFC-OPEN-ONE judged=${judged} fail=${fail} inconclusive=${inconclusive}` : judged ? `§VERDICT PASS W-IFC-OPEN-ONE judged=${judged} fail=0 inconclusive=${inconclusive}` : '§VERDICT INCONCLUSIVE W-IFC-OPEN-ONE judged=0');
  process.exit(fail ? 1 : 0);
})().catch(e => { say('FAIL harness ' + (e && e.stack || e)); process.exit(1); });

async function page(c, O, R) {
  const OB = require(path.join(M, 'open_building_db.js'));
  const oracleArc = rows(O, "SELECT count(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.discipline = 'ARC'")[0][0];
  const resArc = rows(R, "SELECT count(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.discipline = 'ARC'")[0][0];
  const gW = rows(O, "SELECT p.guid FROM element_pset_common p JOIN elements_meta m ON m.guid = p.guid WHERE m.ifc_class LIKE 'IfcWall%' GROUP BY p.guid ORDER BY count(*) DESC, p.guid LIMIT 1")[0][0], oW = OB.partOf(O, gW);
  const http = require('http'), puppeteer = require(path.join(NM, 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(buf); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), errs = [], logs = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 160)); say('  §PAGEERR ' + String(e).slice(0, 160)); });
    pg.on('console', m => { const t = m.text(); if (/§IFC-OPEN|§ARC-SEED-WIRE|§PROPS_IFC_EXTRACT|§PSET_COMMON|§SUMMARY|§NOGEO_COMPOSE/.test(t)) { logs.push(t); say('  page ' + t.slice(0, 220)); } });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.OpenBuildingDb && window.PropsPanel', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const t0 = Date.now(), [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await ch.accept([c.ifc]);
    await pg.waitForFunction('window.__dwBuf && window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0', { timeout: 300000, polling: 500 });
    await pg.evaluate(() => window.__arcSeedReady); await new Promise(r => setTimeout(r, 1500));
    const openMs = Date.now() - t0;
    const st = await pg.evaluate(() => ({ bridge: Object.keys(window.__arcFidByGuid).filter(k => !/^dxf-/.test(k)).length, group: window.Bonsai.group().children.length, name: window.__dwName }));
    const x = logs.filter(l => /§IFC-OPEN-X /.test(l)), seed = logs.find(l => /§ARC-SEED-WIRE .* editable ARC elements=/.test(l)) || '';
    const kept = +((/kept=(\d+)/.exec(x[0] || '') || [])[1]), committed = +((/elements=(\d+)/.exec(seed) || [])[1]), hardfail = +((/hardfail=(\d+)/.exec(seed) || [])[1]);
    say(`  §O5 open ${openMs} ms; §IFC-OPEN-X lines=${x.length} kept=${kept} (oracle ${rows(O, 'SELECT count(*) FROM elements_meta')[0][0]}); seed committed=${committed} hardfail=${hardfail} (oracle ARC rows with a transform ${oracleArc}; resident ${resArc}); bridge=${st.bridge} group=${st.group}`);
    // O7: the aggregates consumer (composeGhostsFromAggregates, str_walker_outliner.js) on THIS open. Oracle = the same rule run in Node on the opened DB (fixpoint over rel_aggregates).
    { const gh = {}; rows(O, 'SELECT m.guid, m.ifc_class FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid WHERE t.guid IS NULL').forEach(r => gh[r[0]] = r[1]);
      const kids = {}; (has(O, 'rel_aggregates') ? rows(O, 'SELECT parent_guid, child_guid FROM rel_aggregates') : []).forEach(r => (kids[r[0]] = kids[r[0]] || []).push(r[1]));
      const geo = new Set(rows(O, 'SELECT guid FROM element_transforms').map(r => r[0])), exp = {}; let prog = true;
      while (prog) { prog = false; for (const g in gh) if (!exp[g] && (kids[g] || []).some(k => geo.has(k))) { exp[g] = gh[g]; geo.add(g); prog = true; } }
      const expBy = {}; Object.values(exp).forEach(k => expBy[k] = (expBy[k] || 0) + 1);
      const cl = logs.find(l => /§NOGEO_COMPOSE composed=/.test(l)) || '', ul = logs.find(l => /§NOGEO_COMPOSE_UNRESOLVED/.test(l)) || '';
      const composed = +((/composed=(\d+)/.exec(cl) || [])[1] || 0), unresolvedRoofStair = /IfcRoof|IfcStair/.test(ul);
      say(`  §O7 ghosts=${Object.keys(gh).length} oracle composable=${Object.keys(exp).length} ${JSON.stringify(expBy)}; page: composed=${composed} unresolved=${ul ? ul.replace(/.*count=/, 'count=').replace(/ \(.*/, '') : 'none'}; seed committed=${committed}`);
      if (!Object.keys(gh).length) { inconclusive++; say('INCONCLUSIVE O7 the opened DB has no ghost parents: nothing judged'); }
      else check('O7', 'the IFC-opened Duplex: composeGhostsFromAggregates composes exactly the oracle\'s ghost parents (the IfcRoof + the IfcStairs), none of them left in §NOGEO_COMPOSE_UNRESOLVED', composed === Object.keys(exp).length && (expBy.IfcRoof || 0) === 1 && (expBy.IfcStair || 0) === 2 && !unresolvedRoofStair,
        `composed=${composed} oracle=${Object.keys(exp).length} ${JSON.stringify(expBy)} unresolvedMentionsRoofStair=${unresolvedRoofStair} seedCommitted=${committed}`); }
    // the panel on a wall with property sets
    const fid = await pg.evaluate(g => window.__arcFidByGuid[g], gW);
    let pr = { fid: null };
    if (fid != null) pr = await pg.evaluate(async fid => { window.Bonsai.select(fid);
      for (let i = 0; i < 300; i++) { const p = document.getElementById('pp-panel'), s = p && p.querySelector('[data-pp-source]'); if (s) break; await new Promise(r => setTimeout(r, 100)); }
      const p = document.getElementById('pp-panel'), rows = []; let grp = null;
      p.querySelectorAll('.pp-g, .pp-r').forEach(e => { if (e.classList.contains('pp-g')) grp = e.textContent.replace(/ \(.*\)$/, ''); else if (grp) rows.push([grp, e.getAttribute('data-pp-key'), e.querySelector('b').textContent]); });
      const s = p.querySelector('[data-pp-source]'); return { fid, src: s && s.getAttribute('data-pp-source'), rows }; }, fid);
    const want = JSON.stringify(oW.psets.map(r => [r.pset, r.name, String(r.value)])), nExt = logs.filter(l => /§PROPS_IFC_EXTRACT/.test(l)).length;
    say(`  §O5 panel wall ${gW} fid=${pr.fid} src=${pr.src} rows=${JSON.stringify(pr.rows)} oracle=${want} §PROPS_IFC_EXTRACT=${nExt}`);
    check('O5', 'THE PAGE the raw Duplex .ifc opened: one §IFC-OPEN-X, kept = the oracle, the seed commits the oracle\'s ARC rows (= the resident\'s), hardfail 0; the wall\'s Pset rows from the building DB, no second read; 0 page errors',
      x.length === 1 && kept === rows(O, 'SELECT count(*) FROM elements_meta')[0][0] && committed === oracleArc && oracleArc === resArc && hardfail === 0 && pr.src === 'building' && JSON.stringify(pr.rows) === want && oW.psets.length > 0 && nExt === 0 && errs.length === 0,
      `kept=${kept} committed=${committed}/${oracleArc} resident=${resArc} hardfail=${hardfail} panel=${pr.src} rows=${pr.rows ? pr.rows.length : 0}/${oW.psets.length} extract=${nExt} errs=${errs.length}`);
  } finally { await br.close(); srv.close(); }
}
