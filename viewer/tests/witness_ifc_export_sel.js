#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IFC-EXPORT-SEL, step (b): the shared writer for any element, adopted by the Viewer, Whole building. Spec: bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(b) SPEC". READ THE LOG after every run; the exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: "the Viewer's IFC is not valid IFC and cannot export a split (meta+geo) building."
//   S2 VALID        ifcopenshell.validate reports 0 errors on IFC4 and IFC2X3, on a real MONOLITH building (warehouse GardenWorld, HHS Office) and on SPLIT meta+geo buildings: the real Clinic pair
//                   (IFC4; $IFC_SEL_SPLIT_DIR or ~/bim-ootb/buildings; INCONCLUSIVE when absent) and a pair the witness splits out of a real monolith the way the extractor does (every geometry table in the _geo half).
//   S6 DETERMINISM  two exports of each, one SHA-256.
//   COUNT           per source class: written + generalised/proxied (already inside written) + no-geometry = the DB's elements_meta rows; the products actually in the FILE (read back by python) = written; the
//                   source class of every generalised / proxied element is in the file's ObjectType; the elements with no geometry are listed by class, never dropped silently.
//   SPLIT_EQ_MONO   the file written from the split pair is byte-identical to the one written from the monolith it was split from (the reader fed from two DBs reads the same mesh as from one).
//   LIVE            the real Viewer page (software GL): the Export pill's IFC item downloads <building>_IFC4.ifc, its status line shows the counts, the file equals the node writer's bytes; the schema toggle gives
//                   a _IFC2X3.ifc; the item is ENABLED for a split building (it was greyed before). Judged from page state and § lines, never from a screenshot.
//   RED CONTROL     IFC_EXPORT_RED=nopredefined drops PredefinedType from every IFC4 product: S2 must FAIL (exit 1).
//   INCONCLUSIVE    printed (never PASS) when nothing was judged; a sub-check whose input is absent is listed under inconclusive=.
// STEP (c) (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(c) SPEC"), ISSUE: "a user cannot export only the elements Find has isolated; the IFC row always writes the whole building."
//   S1 SELECT       node, GardenWorld + HHS_Office (HHS IFC4 only): four selections built by SQL from elements_meta (one discipline, one class, one storey, the class + 3 guids absent from the DB): the Tag of every product
//                   in the file (read back by a node reader that needs no python) = exactly sel INTERSECT has-geometry; written + noGeometry + notInDb = selected; every exported product's entity (its attributes with every #ref replaced
//                   by the hash of what it points to, plus its colour styles) hashes the same as the product the whole-building file holds for that guid (the selection is a filter, never a second writer).
//   S1 EMPTY        an empty Set and null: collect walks nothing / the whole building (node); the page's A.exportIfcShared({scope:'selection'}) gives why=no_isolate and no file (LIVE_SEL).
//   S2 / S6         ifcopenshell.validate 0 errors and one SHA-256 over two exports, on every selection file (IFC4 + IFC2X3 on GardenWorld, IFC4 on HHS_Office).
//   LIVE_SEL        the real page: Find's own search box + Isolate button (real keys and mouse) makes A.activeGuidFilter; the Export menu's Find chip shows N = the isolate size and is enabled; a tap on it chooses and writes nothing;
//                   the IFC row downloads <building>_selection_IFC4.ifc equal to the node writer's bytes for the same set; Find's Show all greys the chip again (why=no_isolate) and the scope falls back to whole; an EMPTY isolate set is not an isolate.
//   RED CONTROL     IFC_EXPORT_RED=noselfilter makes collect ignore the selection: S1 must FAIL (exit 1).
// STEP (d) (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(d) SPEC", checks in witness_ifc_export_sel_d.js + witness_ifc_export_sel_d_check.py), ISSUE: "an upgraded building exported from the Viewer is not the add-on file the Modeller writes: generic parts, no materials / psets / part relations."
//   S3 PARTS / S4 MATERIAL + PSET / GID   a fixture (GardenWorld + generated parts, relations, psets, valid GlobalIds) and the real HHS_Office_Federated_2d + HHS_Office (GID): python reads back aggregates, containment, materials, typed psets, GlobalIds.
//   S5 PARITY     (env only: EXPORT_REAL_DB [+ EXPORT_REAL_DB_GUSSET], EXPORT_FRAME_JSON, EXPORT_REF_IFC_REBAR [+ EXPORT_REF_IFC_GUSSET]) the generated rows exported IFC2X3 with the frame = the reference add-on files: class counts, GlobalIds, bbox <= 1 mm, attributes. Unset = INCONCLUSIVE.
//   LIVE_FRAME    the real page: the Frame control (real file chooser) reads a frame JSON; its summary is in the row's sub-line; the export equals the node writer's bytes with that frame; a refused file keeps the previous choice; the x chip returns to the DB frame.
//   RED CONTROLS  IFC_EXPORT_RED=noparts must FAIL S3 (and S5 when its env is set); IFC_EXPORT_RED=nopsets must FAIL S4.
// Run:  node viewer/tests/witness_ifc_export_sel.js            (python3 + ifcopenshell for S2; puppeteer from ~/bim-compiler/node_modules for LIVE; starts its own python http.server and kills it by PID)
//       IFC_SEL_SKIP_LIVE=1 / IFC_SEL_SKIP_BIG=1 shorten the run (the skipped parts are listed as inconclusive, never PASS).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const RED = process.env.IFC_EXPORT_RED || '';
const LOGF = process.env.LOG || path.join(__dirname, 'logs', 'witness_ifc_export_sel' + (RED ? '_red_' + RED : '') + '.log');
fs.mkdirSync(path.dirname(LOGF), { recursive: true });
const OUT = []; const log = (s) => { OUT.push(s); console.log(s); };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], inconclusive = [];
const ck = (id, ok, msg) => { results.push({ id, ok }); log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); };
const inc = (id, why) => { inconclusive.push(id); log('§INCONCLUSIVE ' + id + ' ' + why); };
const initSqlJs = require(require.resolve('sql.js', { paths: [path.join(ROOT, 'node_modules'), path.join(os.homedir(), 'bim-ootb', 'node_modules'), path.join(os.homedir(), 'bim-compiler', 'node_modules')] }));
const X = require('../ifc_export_shared.js'), LodIfc = require('../../modeller/lod/lod_ifc.js');
const OUTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-'));
const isSqlite = (p) => { try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd); return b.toString('latin1', 0, 15) === 'SQLite format 3' && fs.statSync(p).size > 8192; } catch (e) { return false; } };

// ---- helpers
function hashParts(parts, file) {   // the file and its SHA-256 written part by part (a 130 MB file is past the single-string limit)
  const h = crypto.createHash('sha256'); let n = 0, fd = file ? fs.openSync(file, 'w') : null;
  for (const p of parts) { const b = Buffer.from(p, 'utf8'); h.update(b); n += b.length; if (fd !== null) fs.writeSync(fd, b); }
  if (fd !== null) fs.closeSync(fd); return { sha: h.digest('hex'), bytes: n };
}
function dbCounts(db) { const r = db.exec('SELECT ifc_class, COUNT(*) FROM elements_meta GROUP BY 1'); const o = {}; (r.length ? r[0].values : []).forEach((v) => { o[v[0]] = v[1]; }); return o; }
function splitDb(SQL, bytes) {   // the extractor's split: every geometry table in the _geo half, everything else in _meta
  const meta = new SQL.Database(new Uint8Array(bytes)), geo = new SQL.Database(new Uint8Array(bytes));
  const GEO = ['component_geometries', 'base_geometries'];
  GEO.forEach((t) => { try { meta.run('DROP TABLE IF EXISTS ' + t); } catch (e) { } });
  const names = geo.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map((v) => v[0]);
  names.forEach((t) => { if (GEO.indexOf(t) < 0 && !/^sqlite_/.test(t)) geo.run('DROP TABLE IF EXISTS "' + t + '"'); });
  meta.run('VACUUM'); geo.run('VACUUM'); return { meta, geo, metaBytes: meta.export(), geoBytes: geo.export() };
}
function py(file) {
  const r = cp.spawnSync('python3', [path.join(__dirname, 'witness_ifc_export_sel_check.py'), file], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800000 });
  if (r.status === 77) return { skip: true, why: (r.stdout || '').trim() };
  const m = /§IFC_SEL_PY_JSON (.*)/.exec(r.stdout || ''); if (!m) return { error: 'python half gave no result: status=' + r.status + ' ' + (r.stderr || '').slice(0, 400) };
  return JSON.parse(m[1]);
}
const fmtMap = (o) => '{' + Object.keys(o).sort().map((k) => k + ':' + o[k]).join(',') + '}';


// ---- step (c): a node reader of the .ifc text (no python needed) --------------------------------------------------------------------
// attrs of one entity line split at the top level (strings and parentheses respected)
function splitAttrs(a) {
  const out = []; let d = 0, q = false, cur = '';
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (q) { cur += c; if (c === "'") { if (a[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (c === "'") { q = true; cur += c; } else if (c === '(') { d++; cur += c; } else if (c === ')') { d--; cur += c; } else if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const unq = (t) => (t && t[0] === "'" && t[t.length - 1] === "'") ? t.slice(1, -1).replace(/''/g, "'") : null;
// parse(file, dbGuids): {tags: Map guid -> hash of the product's entity (attributes with refs resolved + its colour styles), classes: Map guid -> IFC class}; the Tag is the 8th attribute of every IfcElement
function readIfc(file, dbGuids) {
  const txt = fs.readFileSync(file, 'utf8'), lines = new Map(), styled = new Map(), tagLine = new Map(); let m;
  const re = /^#(\d+)=([A-Z0-9_]+)\((.*)\);$/gm;
  while ((m = re.exec(txt)) !== null) { lines.set(+m[1], [m[2], m[3]]); }
  const memo = new Map(), sha = (t) => crypto.createHash('sha1').update(t).digest('hex');
  const canon = (a) => a.replace(/'(?:[^']|'')*'|#(\d+)/g, (x, d) => d ? '<' + h(+d) + '>' : x);
  function h(id) {
    if (memo.has(id)) return memo.get(id); const e = lines.get(id); if (!e) return 'MISSING' + id; memo.set(id, 'CYCLE' + id);
    const st = styled.get(id), r = sha(e[0] + '(' + canon(e[1]) + ')' + (st ? '|' + st.slice().sort().join(',') : '')); memo.set(id, r); return r;
  }
  lines.forEach((e, id) => { if (e[0] === 'IFCSTYLEDITEM') { const a = splitAttrs(e[1]), ref = /^#(\d+)$/.exec(a[0]); if (ref) { const k = +ref[1]; if (!styled.has(k)) styled.set(k, []); styled.get(k).push(sha(canon(a.slice(1).join(',')))); } } });
  const tags = new Map(), classes = new Map(); let dupTag = 0;
  lines.forEach((e, id) => {
    if (/^IFCREL/.test(e[0]) || e[0] === 'IFCPROJECT' || e[0] === 'IFCSITE' || e[0] === 'IFCBUILDING' || e[0] === 'IFCBUILDINGSTOREY') return;
    const a = splitAttrs(e[1]); if (a.length < 8) return; const t = unq(a[7]); if (t === null || !dbGuids.has(t)) return;
    if (tags.has(t)) dupTag++; tags.set(t, h(id)); classes.set(t, e[0]);
  });
  return { tags, classes, dupTag, lines: lines.size, text: txt.slice(0, 4000) };
}
// the four fixed selections of one building, by SQL from elements_meta (deterministic): the value whose count is closest to 10% of the rows (3 .. rows-1), per column
function pickSels(db) {
  const total = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0], out = [], skipped = [], absent = ['ABSENT_GUID_1', 'ABSENT_GUID_2', 'ABSENT_GUID_3'];
  for (const [kind, col] of [['discipline', 'discipline'], ['class', 'ifc_class'], ['storey', 'storey']]) {
    const r = db.exec('SELECT ' + col + ', COUNT(*) FROM elements_meta WHERE ' + col + " IS NOT NULL AND " + col + " <> '' GROUP BY 1 ORDER BY 1"), vals = (r.length ? r[0].values : []).filter((v) => v[1] >= 3 && v[1] < total);
    if (!vals.length) { skipped.push(kind + ': no ' + col + ' value with 3..' + (total - 1) + ' of ' + total + ' rows'); continue; }
    vals.sort((a, b) => Math.abs(a[1] - total / 10) - Math.abs(b[1] - total / 10) || (a[0] < b[0] ? -1 : 1));
    const g = db.exec('SELECT guid FROM elements_meta WHERE ' + col + ' = ? ORDER BY guid', [vals[0][0]])[0].values.map((v) => v[0]);
    out.push({ kind, value: vals[0][0], sel: new Set(g) });
  }
  const cls = out.find((o) => o.kind === 'class'); if (cls) out.push({ kind: 'class+3absent', value: cls.value + ' + 3 guids absent from the DB', sel: new Set(Array.from(cls.sel).concat(absent)), absent: 3 });
  return { sels: out, skipped, total };
}
// S1 + S2 + S6 for the selections of one monolith building; whole = runCase's output (the whole-building files per schema)
function runSelections(label, SQL, db, whole, schemas, red) {
  const dbGuids = new Set(db.exec('SELECT guid FROM elements_meta')[0].values.map((v) => v[0])), P = pickSels(db);
  P.skipped.forEach((w) => inc('S1:' + label + ':' + w.split(':')[0], w + ': that selection was not judged'));
  if (!P.sels.length) { inc('S1:' + label, 'no selection could be built: nothing judged'); return; }
  for (const schema of schemas) {
    const W = whole[schema]; if (!W) { inc('S1:' + label + ':' + schema, 'no whole-building file to compare with'); continue; }
    const wcol = W.col, hasGeo = new Set(wcol.elements.map((e) => e.guid)), noGeoAll = new Set(wcol.noGeometryList), wf = readIfc(W.file, dbGuids);
    for (const S of P.sels) {
      const tag = label + ':' + S.kind + ':' + schema, name = label + '_selection_' + schema + '.ifc', opts = { schema, name, buildingName: label, projectName: label };
      const col = X.collect(db, null, S.sel, { ignoreSel: red === 'noselfilter' }), res = X.build(col, opts);
      if (!res.ok) { ck('S1:' + tag, false, 'the writer refused: ' + res.why); continue; }
      const dir = path.join(OUTDIR, 'sel_' + S.kind.replace(/\W+/g, '_')); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, name), h1 = hashParts(res.parts, file);
      log(X.selLine(col, res, schema));
      const expected = new Set(Array.from(S.sel).filter((g) => hasGeo.has(g))), expNoGeo = Array.from(S.sel).filter((g) => noGeoAll.has(g)).length, expNotInDb = Array.from(S.sel).filter((g) => !dbGuids.has(g)).length;
      const sf = readIfc(file, dbGuids), tagSet = new Set(sf.tags.keys());
      const missing = Array.from(expected).filter((g) => !tagSet.has(g)), extra = Array.from(tagSet).filter((g) => !expected.has(g));
      let eqBad = 0, eqN = 0; sf.tags.forEach((hv, g) => { if (wf.tags.has(g)) { eqN++; if (wf.tags.get(g) !== hv) eqBad++; } else eqBad++; });
      const cnt = res.stats.written + col.noGeometryList.length + (col.census.notInDb || 0), selN = S.sel.size;
      const descOk = new RegExp('what Find has isolated \\(' + expected.size + ' of ' + wcol.elements.length + ' elements with geometry\\)').test(sf.text);
      log('§IFC_SEL_S1 ' + tag + ' selected=' + selN + ' expected(has geometry)=' + expected.size + ' inFile=' + tagSet.size + ' missing=' + missing.length + ' extra=' + extra.length + ' written=' + res.stats.written + ' noGeometry=' + col.noGeometryList.length + ' notInDb=' + (col.census.notInDb || 0) + ' entityEq=' + eqN + '/' + sf.tags.size + ' entityBad=' + eqBad + ' dupTag=' + sf.dupTag + ' mode=' + col.mode);
      if (expected.size === 0) { inc('S1:' + tag, 'the selection holds no element with geometry: not judged'); continue; }
      ck('S1:' + tag, missing.length === 0 && extra.length === 0 && res.stats.written === expected.size && col.noGeometryList.length === expNoGeo && (col.census.notInDb || 0) === expNotInDb && cnt === selN && eqBad === 0 && eqN === expected.size && sf.dupTag === 0 && col.mode === 'selection' && descOk,
        'Tags in the file = sel INTERSECT has-geometry (' + expected.size + ' of ' + selN + '; missing ' + missing.length + (missing.length ? ' e.g. ' + missing.slice(0, 3).join(',') : '') + ', extra ' + extra.length + (extra.length ? ' e.g. ' + extra.slice(0, 3).join(',') : '') + '); written ' + res.stats.written + ' + noGeometry ' + col.noGeometryList.length + ' + notInDb ' + (col.census.notInDb || 0) + ' = ' + cnt + ' (selected ' + selN + '); ' + eqN + ' products, ' + eqBad + ' differ from the whole-building file\'s product for the same guid; description names the selection: ' + descOk);
      // S6
      const h2 = hashParts(X.build(X.collect(db, null, S.sel, { ignoreSel: red === 'noselfilter' }), opts).parts, null);
      ck('S6:' + tag, h1.sha === h2.sha && h1.bytes === h2.bytes, 'two selection exports: ' + h1.sha.slice(0, 16) + ' / ' + h2.sha.slice(0, 16) + ' (' + h1.bytes + ' B)');
      // S2
      if (red) continue;
      const p = py(file);
      if (p.skip) inc('S2:' + tag, 'ifcopenshell not importable (' + p.why + '): validity NOT judged');
      else if (p.error) ck('S2:' + tag, false, p.error);
      else { log('§IFC_SEL_PY label=' + label + ' selection=' + S.kind + ' schema=' + p.schema + ' validate_errors=' + p.validate_errors + ' products=' + p.products + ' dupGlobalIds=' + p.dupGlobalIds + ' first=' + JSON.stringify(p.first_errors.slice(0, 2))); ck('S2:' + tag, p.validate_errors === 0 && p.schema === schema && p.dupGlobalIds === 0 && p.products === expected.size, 'ifcopenshell.validate on ' + schema + ' ' + label + ' selection ' + S.kind + ' (' + S.value + '): ' + p.validate_errors + ' errors (0 required), ' + p.products + ' products (' + expected.size + ' expected)'); }
    }
  }
  // S1 EMPTY at the collect level: an empty Set walks nothing, null walks the whole building
  const ce = X.collect(db, null, new Set()), cn = X.collect(db, null, null);
  ck('S1EMPTY:' + label + ':collect', ce.elements.length === 0 && ce.census.selected === 0 && cn.elements.length === whole[schemas[0]].col.elements.length && cn.mode === 'whole', 'collect(empty Set) walks ' + ce.elements.length + ' elements (selected=' + ce.census.selected + '); collect(null) is the whole building (' + cn.elements.length + ' elements, mode=' + cn.mode + ')');
}

// one case: export twice (S6), validate the first (S2), count (COUNT); returns the first export
function runCase(label, SQL, mono, geoDb, rows, schemas, red) {
  const out = {}, kind = geoDb ? 'split' : 'mono', tag0 = label + ':' + kind;
  for (const schema of schemas) {
    const name = label + '_' + schema + '.ifc', opts = { schema, name, buildingName: label, breakPredefined: red };
    const t0 = Date.now(), col = X.collect(mono, geoDb), res = X.build(col, opts);
    if (!res.ok) { ck('S2:' + tag0 + ':' + schema, false, 'the writer refused: ' + res.why); continue; }
    const file = path.join(OUTDIR, name), h1 = hashParts(res.parts, file), t1 = Date.now();
    log(X.selLine(col, res, schema));
    log('§IFC_SEL_EXPORT label=' + label + ' kind=' + kind + ' schema=' + schema + ' elements=' + res.stats.written + ' bytes=' + h1.bytes + ' sha256=' + h1.sha + ' ms=' + (t1 - t0));
    // S6
    const res2 = X.build(X.collect(mono, geoDb), opts), h2 = hashParts(res2.parts, null);
    { const estMB = X.estimateMB(col.tris, schema), actMB = h1.bytes / 1048576; ck('CAP:' + tag0 + ':' + schema, estMB + 1 >= actMB, 'the size estimate that gates the browser export (' + Math.round(col.tris) + ' triangles x ' + X.BYTES_PER_TRI[schema] + ' B) = ' + estMB + ' MB is not below the file written (' + actMB.toFixed(1) + ' MB, 1 MB fixed overhead allowed); limit ' + X.MAX_MB + ' MB'); }
    ck('S6:' + tag0 + ':' + schema, h1.sha === h2.sha && h1.bytes === h2.bytes, 'two exports: ' + h1.sha.slice(0, 16) + ' / ' + h2.sha.slice(0, 16) + ' (' + h1.bytes + ' B)');
    // S2 + COUNT read back from the file
    const p = py(file);
    if (p.skip) { inc('S2:' + tag0 + ':' + schema, 'ifcopenshell not importable (' + p.why + '): validity NOT judged'); }
    else if (p.error) { ck('S2:' + tag0 + ':' + schema, false, p.error); }
    else {
      log('§IFC_SEL_PY label=' + label + ' kind=' + kind + ' schema=' + p.schema + ' validate_errors=' + p.validate_errors + ' products=' + p.products + ' dupGlobalIds=' + p.dupGlobalIds + ' styled=' + p.styledItems + ' storeys=' + p.storeys + ' first=' + JSON.stringify(p.first_errors.slice(0, 2)));
      ck('S2:' + tag0 + ':' + schema, p.validate_errors === 0 && p.schema === schema && p.dupGlobalIds === 0, 'ifcopenshell.validate on ' + schema + ' ' + label + ' (' + kind + '): ' + p.validate_errors + ' errors (0 required), ' + p.products + ' products, dup GlobalIds ' + p.dupGlobalIds);
      // COUNT: the DB's rows per source class = written (+ in-file) + no-geometry
      const st = res.stats, bc = st.byClass || {}, ng = col.noGeometry, db = rows, bad = [];
      let sumDb = 0, sumW = 0, sumNg = 0;
      Object.keys(db).forEach((c) => { const w = bc[c] ? bc[c].n : 0, n = ng[c] || 0; sumDb += db[c]; sumW += w; sumNg += n; if (w + n !== db[c]) bad.push(c + ':' + w + '+' + n + '!=' + db[c]); });
      Object.keys(bc).forEach((c) => { if (!(c in db)) bad.push(c + ':written but not in the DB'); });
      const prox = Object.values(st.proxied || {}).reduce((a, b) => a + b, 0), gen = Object.values(st.generalised || {}).reduce((a, b) => a + b, 0);
      const objtOk = Object.keys(st.proxied || {}).concat(Object.keys(st.generalised || {})).every((c) => (p.objectTypes[c] || 0) >= ((st.proxied || {})[c] || 0) + ((st.generalised || {})[c] || 0));
      const fileClassSum = Object.values(p.classes).reduce((a, b) => a + b, 0);
      ck('COUNT:' + tag0 + ':' + schema, bad.length === 0 && sumDb === col.census.rows && sumW === st.written && p.products === st.written && fileClassSum === st.written && sumW + sumNg === sumDb && col.noGeometryList.length === sumNg && objtOk,
        'DB rows ' + sumDb + ' = written ' + sumW + ' + no-geometry ' + sumNg + '; file holds ' + p.products + ' products; proxied ' + prox + ' ' + fmtMap(st.proxied || {}) + ', generalised ' + gen + ' ' + fmtMap(st.generalised || {}) + ', ObjectType kept=' + objtOk + (bad.length ? ' MISMATCH ' + bad.join(' ') : '') + '; no-geometry listed: ' + fmtMap(ng));
    }
    out[schema] = { sha: h1.sha, bytes: h1.bytes, file, written: res.stats.written, col, res };
  }
  return out;
}

(async () => {
  const SQL = await initSqlJs(); let browser = null, srv = null, dStep = null; const temp = [];
  const cleanup = () => { temp.forEach((f) => { try { fs.unlinkSync(f); } catch (e) { } }); };
  const finish = async (code) => { cleanup(); fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); try { if (browser) await browser.close(); } catch (e) { } try { if (srv) srv.kill(); } catch (e) { } process.exit(code); };
  try {
    const GW = path.join(ROOT, 'buildings', 'warehouse_gardenworld.db'), HHS = path.join(ROOT, 'buildings', 'HHS_Office_Federated_extracted.db');
    const CDIR = process.env.IFC_SEL_SPLIT_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings'), CM = path.join(CDIR, 'Clinic_meta.db'), CG = path.join(CDIR, 'Clinic_geo.db');
    log('§W-IFC-EXPORT-SEL start red=' + (RED || 'none') + ' out=' + OUTDIR + ' gw=' + isSqlite(GW) + ' hhs=' + isSqlite(HHS) + ' clinic_pair=' + (isSqlite(CM) && isSqlite(CG)));
    if (!isSqlite(GW)) { inc('ALL', 'the warehouse DB is absent: nothing judged'); }
    else {
      const gwBytes = fs.readFileSync(GW), gw = new SQL.Database(new Uint8Array(gwBytes)), gwRows = dbCounts(gw);
      // --- 1. MONOLITH, small (both schemas) -------------------------------------------------------
      const m1 = runCase('GardenWorld', SQL, gw, null, gwRows, RED ? ['IFC4'] : ['IFC4', 'IFC2X3'], RED === 'nopredefined');
      // --- 1b. STEP (d): parts, materials, property sets, part relations, kept GlobalIds (fixture + real HHS_Office_Federated_2d) and the real parity S5 (env only)
      if (!RED || RED === 'noparts' || RED === 'nopsets') {
        const D = require('./witness_ifc_export_sel_d.js')({ SQL, X, L: LodIfc, ck, inc, log, py, RED, OUTDIR, hashParts, splitAttrs, unq, ROOT }); dStep = D;
        D.runFixture(gwBytes);
        const H2 = path.join(ROOT, 'buildings', 'HHS_Office_Federated_2d.db');
        if (isSqlite(H2)) D.runHhs2d(fs.readFileSync(H2)); else inc('S3:HHS2d', 'buildings/HHS_Office_Federated_2d.db is absent or an LFS pointer');
        D.runS5();
      }
      if (!RED || RED === 'noselfilter') runSelections('GardenWorld', SQL, gw, m1, RED ? ['IFC4'] : ['IFC4', 'IFC2X3'], RED);
      // --- 2. SPLIT derived from it, same bytes -----------------------------------------------------
      if (!RED) {
        const sp = splitDb(SQL, gwBytes), m2 = runCase('GardenWorld', SQL, sp.meta, sp.geo, gwRows, ['IFC4', 'IFC2X3'], false);
        ['IFC4', 'IFC2X3'].forEach((s) => ck('SPLIT_EQ_MONO:GardenWorld:' + s, !!(m1[s] && m2[s] && m1[s].sha === m2[s].sha), 'split pair (meta ' + sp.metaBytes.length + ' B + geo ' + sp.geoBytes.length + ' B) vs monolith: ' + (m2[s] && m2[s].sha.slice(0, 16)) + ' / ' + (m1[s] && m1[s].sha.slice(0, 16))));
        // --- 3. HHS monolith (real, bigger) and its split ------------------------------------------
        if (process.env.IFC_SEL_SKIP_BIG) inc('BIG', 'IFC_SEL_SKIP_BIG=1: HHS and Clinic not judged');
        else {
          if (isSqlite(HHS)) {
            const hb = fs.readFileSync(HHS), hdb = new SQL.Database(new Uint8Array(hb)), hrows = dbCounts(hdb);
            const mh = runCase('HHS_Office', SQL, hdb, null, hrows, ['IFC4'], false);
            runSelections('HHS_Office', SQL, hdb, mh, ['IFC4'], '');
            if (dStep && mh.IFC4) dStep.gidCheck('HHS_Office', hdb, mh.IFC4.col, mh.IFC4.res, mh.IFC4.file);
            const hsp = splitDb(SQL, hb), ms = runCase('HHS_Office', SQL, hsp.meta, hsp.geo, hrows, ['IFC4', 'IFC2X3'], false);
            ck('SPLIT_EQ_MONO:HHS_Office:IFC4', !!(mh.IFC4 && ms.IFC4 && mh.IFC4.sha === ms.IFC4.sha), 'split pair vs monolith: ' + (ms.IFC4 && ms.IFC4.sha.slice(0, 16)) + ' / ' + (mh.IFC4 && mh.IFC4.sha.slice(0, 16)));
          } else inc('MONO_HHS', 'buildings/HHS_Office_Federated_extracted.db is absent or an LFS pointer');
          // --- 4. the REAL split pair (Clinic) ------------------------------------------------------
          if (isSqlite(CM) && isSqlite(CG)) {
            const cm = new SQL.Database(new Uint8Array(fs.readFileSync(CM))), cg = new SQL.Database(new Uint8Array(fs.readFileSync(CG)));
            runCase('Clinic', SQL, cm, cg, dbCounts(cm), ['IFC4'], false);
          } else inc('SPLIT_REAL', 'Clinic_meta.db + Clinic_geo.db not found in ' + CDIR + ' (set IFC_SEL_SPLIT_DIR): the derived pairs above were judged, the real pair was not');
        }
      }
    }
    // --- 5. LIVE: the real Viewer page --------------------------------------------------------------
    if (RED) inc('LIVE', 'red control run: the live page is not part of it');
    else if (process.env.IFC_SEL_SKIP_LIVE) inc('LIVE', 'IFC_SEL_SKIP_LIVE=1');
    else if (!isSqlite(GW)) inc('LIVE', 'no building to open');
    else {
      const puppeteer = require(require.resolve('puppeteer', { paths: [path.join(os.homedir(), 'bim-compiler', 'node_modules'), path.join(ROOT, 'node_modules')] }));
      const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
      const port = await freePort();
      // the derived split pair is served as /buildings/_wit_ifcsel_meta.db + _geo.db (untracked, deleted at the end)
      const gwB = fs.readFileSync(GW), sp = splitDb(SQL, gwB), MP = path.join(ROOT, 'buildings', '_wit_ifcsel_meta.db'), GP = path.join(ROOT, 'buildings', '_wit_ifcsel_geo.db'), BP = path.join(ROOT, 'buildings', '_wit_ifcsel.db');
      fs.writeFileSync(MP, Buffer.from(sp.metaBytes)); fs.writeFileSync(GP, Buffer.from(sp.geoBytes)); fs.writeFileSync(BP, Buffer.from(sp.metaBytes)); temp.push(MP, GP, BP);
      srv = cp.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }); await sl(900);
      const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-prof-'));
      browser = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      const liveCase = async (tag, url, expectSplit) => {
        const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'ifcsel-dl-')), cdp = await browser.target().createCDPSession();
        const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const c2 = await ctx.browser().target().createCDPSession(); await c2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, browserContextId: ctx.id });
        await page.setViewport({ width: 1280, height: 800 }); const lines = [], errs = [];
        page.on('console', (m) => { const t = m.text(); if (/§(IFC_EXPORT|VIEWER_EXPORT|EXPORT_IFC|LOAD_FAIL|DB_SPLIT)|\[S229\]/.test(t)) { lines.push(t); log('  [' + tag + ' con] ' + t.slice(0, 260)); } });
        page.on('pageerror', (e) => { errs.push(e.message); log('  [' + tag + ' pageerror] ' + e.message.slice(0, 200)); });
        await page.evaluateOnNewDocument(() => { try { delete window.showSaveFilePicker; } catch (e) { } window.showSaveFilePicker = undefined; });
        await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=' + url, { waitUntil: 'domcontentloaded', timeout: 180000 });
        let ready = false; for (let i = 0; i < 240 && !ready; i++) { await sl(500); try { ready = await page.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.openExportMenu && APP.exportIfcShared && document.getElementById('pill-save'))); } catch (e) { } }
        if (!ready) { inc('LIVE:' + tag, 'page never became ready (APP.db + A.exportIfcShared + #pill-save)'); return; }
        await sl(1500);
        for (let i = 0; i < 40; i++) { const on = await page.evaluate(() => { const w = document.getElementById('wh-close'); return !!(w && w.getBoundingClientRect().width > 0); }); if (on) { await page.click('#wh-close'); log('  [' + tag + ' step] walk engaged -> left with its own X'); break; } const t = await page.evaluate(() => getComputedStyle(document.getElementById('mobile-trigger')).display); if (t !== 'none' && i > 12) break; await sl(500); }
        await sl(1200);
        const st = await page.evaluate(() => ({ ab: APP.activeBuilding, split: !!(APP.libDb && APP.libDb !== APP.db), lod: !!(window.LodIfc && window.LodReader) }));
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' building=' + st.ab + ' split=' + st.split + ' writerLoaded=' + st.lod);
        ck('LIVE_SPLIT:' + tag, st.split === expectSplit, 'the open building is ' + (st.split ? 'a split pair (A.libDb != A.db)' : 'a monolith') + ', expected ' + (expectSplit ? 'split' : 'monolith'));
        const files = () => fs.readdirSync(dl).filter((f) => !/\.crdownload$|\.tmp$/.test(f) && fs.statSync(path.join(dl, f)).isFile());
        const waitFile = async (re, n0, ms) => { for (let i = 0; i < ms / 500; i++) { const hit = files().filter((f) => re.test(f)); if (hit.length > n0) return hit[hit.length - 1]; await sl(500); } return null; };
        const panelShown = () => page.evaluate(() => { const p = document.getElementById('v-export-panel'); return !!(p && p.style.display === 'block'); });
        const openMenu = async () => {   // the real pill: the trigger, then the Export button, with the mouse; retried (a loaded machine can miss the first tap)
          if (await panelShown()) return true;
          const vis = () => page.evaluate(() => { const r = document.getElementById('pill-save').getBoundingClientRect(); return r.width > 4 && r.height > 4; });
          for (let attempt = 0; attempt < 4; attempt++) {
            for (let i = 0; i < 40 && !(await vis()); i++) {
              const wh = await page.evaluate(() => { const w = document.getElementById('wh-close'); return !!(w && w.getBoundingClientRect().width > 0); }); if (wh) { try { await page.click('#wh-close'); log('  [' + tag + ' step] walk engaged late -> left with its own X'); } catch (e) { /* gone */ } }
              try { await page.click('#mobile-trigger'); } catch (e) { /* not shown yet: wait */ } await sl(500);
            }
            if (await vis()) {
              const r = await page.evaluate(() => { const b = document.getElementById('pill-save').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); await page.mouse.click(r.x, r.y);
              for (let i = 0; i < 24; i++) { await sl(250); if (await panelShown()) return true; }
            }
            await sl(1500);
          }
          log('  [' + tag + ' note] pill rects: ' + JSON.stringify(await page.evaluate(() => { const g = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [r.x | 0, r.y | 0, r.width | 0, r.height | 0, cs.display, cs.visibility]; }; return { save: g('pill-save'), trig: g('mobile-trigger'), panel: g('v-export-panel') }; })));
          return false;
        };
        const clickSel = async (sel) => { const r = await page.evaluate((s) => { const d = document.querySelector(s); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };
        // the title line of a row, as a finger would (step (c): the IFC row's scope chips sit under its label, so the row centre is a chip)
        const clickTitle = async (key) => { const r = await page.evaluate((k) => { const d = document.querySelector('#v-export-panel .ve-row[data-key="' + k + '"]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.x + 28, y: b.y + 14 }; }, key); if (!r) return false; await page.mouse.click(r.x, r.y); return true; };
        if (!(await openMenu())) { inc('LIVE:' + tag, 'the Export pill never opened the menu'); return; }
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#v-export-panel .ve-row')).map((d) => ({ key: d.getAttribute('data-key'), disabled: d.getAttribute('data-disabled') === '1', why: d.getAttribute('data-why'), title: d.getAttribute('title') || '', text: d.textContent.trim().replace(/\s+/g, ' ') })));
        const ifcRow = rows.find((r) => r.key === 'ifc');
        ck('LIVE_MENU:' + tag, rows.map((r) => r.key).join(',') === 'db,ifc,bcf,schedule,cost5d' && !!ifcRow && !ifcRow.disabled && /whole building/.test(ifcRow.title) && /IFC4/.test(ifcRow.text) && /IFC2X3/.test(ifcRow.text), 'menu rows ' + JSON.stringify(rows.map((r) => r.key)) + '; IFC row enabled=' + (ifcRow && !ifcRow.disabled) + ' why=' + (ifcRow && ifcRow.why) + ' tip=' + JSON.stringify(ifcRow && ifcRow.title) + ' text=' + JSON.stringify(ifcRow && ifcRow.text));
        // IFC4 (default)
        let n0 = files().filter((f) => /\.ifc$/.test(f)).length; await clickTitle('ifc');
        const f4 = await waitFile(/_IFC4\.ifc$/, 0, 180000);
        const last = await page.evaluate(() => ({ last: APP._ifcExportLast || null, status: (document.getElementById('import-status') || document.getElementById('status') || {}).textContent })); const mb = f4 ? fs.statSync(path.join(dl, f4)).size : 0;
        const nodeX = (() => { const dbN = tag === 'monolith' ? new SQL.Database(new Uint8Array(gwB)) : sp.meta, geoN = tag === 'monolith' ? null : sp.geo, nm = st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, ''); const col = X.collect(dbN, geoN), res = X.build(col, { schema: 'IFC4', name: nm + '_IFC4.ifc', buildingName: nm, projectName: nm }); return Object.assign({ n: res.stats.written }, hashParts(res.parts, null)); })();
        const liveSha = f4 ? crypto.createHash('sha256').update(fs.readFileSync(path.join(dl, f4))).digest('hex') : null;
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' file=' + f4 + ' bytes=' + mb + ' status=' + JSON.stringify(last.status) + ' last=' + JSON.stringify(last.last && { file: last.last.file, schema: last.last.schema, elements: last.last.elements, noGeometry: last.last.noGeometry }));
        const stRe = new RegExp('^IFC \\(IFC4\\): ' + nodeX.n + ' elements, \\d+\\.\\d MB$');
        ck('LIVE_IFC4:' + tag, !!(f4 && f4 === st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, '') + '_IFC4.ifc' && last.last && last.last.ok && last.last.schema === 'IFC4' && stRe.test(last.status || '') && lines.filter((l) => /§IFC_EXPORT_SEL mode=whole/.test(l)).length === 1),
          'download ' + f4 + ' (' + mb + ' B); status line ' + JSON.stringify(last.status) + ' (expected IFC (IFC4): ' + nodeX.n + ' elements, X MB); one §IFC_EXPORT_SEL line');
        ck('LIVE_EQ_NODE:' + tag, !!(liveSha && liveSha === nodeX.sha), 'the page file equals the node writer\'s bytes: ' + (liveSha && liveSha.slice(0, 16)) + ' / ' + nodeX.sha.slice(0, 16));
        const pv = f4 ? py(path.join(dl, f4)) : { error: 'no file' };
        if (pv.skip) inc('LIVE_VALID:' + tag, 'ifcopenshell not importable'); else ck('LIVE_VALID:' + tag, !pv.error && pv.validate_errors === 0, 'the downloaded file: ' + (pv.error || pv.validate_errors + ' validate errors, ' + pv.products + ' products'));
        // IFC2X3 through the schema toggle
        await openMenu(); await clickSel('#v-export-panel .ve-sch[data-schema="IFC2X3"]'); await sl(300);
        const pressed = await page.evaluate(() => Array.from(document.querySelectorAll('#v-export-panel .ve-sch')).map((b) => b.getAttribute('data-schema') + ':' + b.getAttribute('aria-pressed')).join(','));
        await clickTitle('ifc');
        const f2 = await waitFile(/_IFC2X3\.ifc$/, 0, 180000); const head2 = f2 ? fs.readFileSync(path.join(dl, f2)).slice(0, 2000).toString() : '';
        ck('LIVE_IFC2X3:' + tag, !!(f2 && /FILE_SCHEMA\(\('IFC2X3'\)\)/.test(head2) && /IFC4:false/.test(pressed) && /IFC2X3:true/.test(pressed)), 'toggle ' + pressed + ' -> ' + f2 + ' header ' + JSON.stringify((/FILE_SCHEMA\(\([^)]*\)\)/.exec(head2) || [''])[0]));
        await page.evaluate(() => { try { APP.setIfcSchemaChoice('IFC4'); } catch (e) { } });
        // the refusal path: a building over the limit is refused with its reason in the status line and writes NO file
        const nBefore = files().length, ref = await page.evaluate(async () => { const r = await APP.exportIfcShared({ schema: 'IFC4', maxMB: -1, download: true }); return { ok: r.ok, why: r.why, status: (document.getElementById('import-status') || document.getElementById('status') || {}).textContent }; }); await sl(800);
        ck('LIVE_REFUSE:' + tag, ref.ok === false && ref.why === 'too_large' && /too large for the browser/.test(ref.status || '') && files().length === nBefore, 'over-limit export refused: ' + JSON.stringify(ref) + '; files before/after ' + nBefore + '/' + files().length);

        // ---- LIVE_FRAME (step (d)): the Frame control of the IFC row (real file chooser), the export with that frame, a refused file, the x chip ----
        if (!RED) {
          const nmF = st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, ''), frameJ = { frame_name: 'witness frame', project_name: 'Witness', shift_m: [10, 20, 0], site: { location_m: [1, 2, 0], ref_direction: [1, 0] } };
          const fF = path.join(os.tmpdir(), 'ifcsel_frame_ok.json'), fBad = path.join(os.tmpdir(), 'ifcsel_frame_bad.json'), fTxt = path.join(os.tmpdir(), 'ifcsel_frame_txt.json');
          fs.writeFileSync(fF, JSON.stringify(frameJ)); fs.writeFileSync(fBad, JSON.stringify({ shift_m: [1, 2] })); fs.writeFileSync(fTxt, 'this is not json'); temp.push(fF, fBad, fTxt);
          const nodeFrame = (frame) => { const dbN = tag === 'monolith' ? new SQL.Database(new Uint8Array(gwB)) : sp.meta, geoN = tag === 'monolith' ? null : sp.geo, col = X.collect(dbN, geoN, null), res = X.build(col, { schema: 'IFC4', name: nmF + '_IFC4.ifc', buildingName: nmF, projectName: nmF, frame: frame || null }); return crypto.createHash('sha256').update(res.parts.join('')).digest('hex'); };
          const pick = async (file) => { await closeMenuF(); if (!(await openMenu())) return false; const [ch] = await Promise.all([page.waitForFileChooser({ timeout: 20000 }), clickSel('#v-export-panel .ve-frame')]); await ch.accept([file]); await sl(700); return true; };
          const closeMenuF = async () => { if (await panelShown()) { await page.keyboard.press('Escape'); await sl(300); } };
          const subOf = () => page.evaluate(() => { const d = document.querySelector('#v-export-panel .ve-row[data-key="ifc"] .ve-sub'); return d ? d.textContent : null; });
          const stat = () => page.evaluate(() => (document.getElementById('import-status') || document.getElementById('status') || {}).textContent);
          const newFile = async (act) => { const before = new Set(files()); await act(); for (let i = 0; i < 360; i++) { const hit = files().filter((f) => !before.has(f)); if (hit.length) return hit[0]; await sl(500); } return null; };
          let okPick = false; try { okPick = await pick(fF); } catch (e) { log('  [' + tag + ' note] frame chooser: ' + e.message); }
          if (!okPick) inc('LIVE_FRAME:' + tag, 'the Frame control did not open a file chooser');
          else {
            const choice = await page.evaluate(() => APP.ifcFrameChoice()), sub1 = await subOf(), nFilesF0 = files().length;
            ck('LIVE_FRAME_CHOOSE:' + tag, !!(choice && choice.name === 'ifcsel_frame_ok.json' && /ifcsel_frame_ok\.json/.test(sub1 || '') && /shift/.test(sub1 || '') && files().length === nFilesF0 && lines.some((l) => /§VIEWER_EXPORT_MENU ifc_frame=ifcsel_frame_ok\.json/.test(l)) && lines.some((l) => /§IFC_EXPORT_SEL_FRAME loaded ifcsel_frame_ok\.json/.test(l))), 'a frame file read by the real file chooser: choice ' + JSON.stringify(choice) + ', sub-line ' + JSON.stringify(sub1) + ', no file written by choosing');
            if (await panelShown()) { await page.keyboard.press('Escape'); await sl(300); }
            await openMenu(); const fw = await newFile(async () => { await clickTitle('ifc'); });
            const bytesF = fw ? fs.readFileSync(path.join(dl, fw)) : Buffer.alloc(0), shaF = crypto.createHash('sha256').update(bytesF).digest('hex'), headF = bytesF.slice(0, 2500).toString();
            const selF = lines.filter((l) => /§IFC_EXPORT_SEL mode=whole/.test(l)).pop() || '', menuF = lines.filter((l) => /§VIEWER_EXPORT_MENU item=ifc action=exportIfcShared/.test(l)).pop() || '';
            ck('LIVE_FRAME_EXPORT:' + tag, !!(fw && /_IFC4\.ifc$/.test(fw) && shaF === nodeFrame(frameJ) && /frame: witness frame \(shift_m=\[10\.0, 20\.0, 0\.0\]\)/.test(headF) && / frame=ifcsel_frame_ok\.json /.test(selF) && /frame=ifcsel_frame_ok\.json$/.test(menuF)), 'the export with the chosen frame (' + fw + ') equals the node writer\'s bytes with the same frame (' + shaF.slice(0, 16) + ' / ' + nodeFrame(frameJ).slice(0, 16) + '); the file description states the frame; §IFC_EXPORT_SEL ... frame=ifcsel_frame_ok.json; menu line ' + menuF.slice(-60));
            // a refused frame states why and keeps the previous choice; a file that is not JSON the same
            await pick(fBad); const c2 = await page.evaluate(() => APP.ifcFrameChoice()), st2 = await stat(); await pick(fTxt); const c3 = await page.evaluate(() => APP.ifcFrameChoice()), st3 = await stat();
            ck('LIVE_FRAME_REFUSE:' + tag, !!(c2 && c2.name === 'ifcsel_frame_ok.json' && c3 && c3.name === 'ifcsel_frame_ok.json' && /refused: shift_m must be three numbers/.test(st2 || '') && /refused: not valid JSON/.test(st3 || '') && lines.some((l) => /§IFC_EXPORT_SEL_FRAME REFUSED ifcsel_frame_bad\.json/.test(l))), 'a frame file with shift_m of two numbers and a file that is not JSON are refused with their reason and the previous choice stays: ' + JSON.stringify(st2) + ' / ' + JSON.stringify(st3) + ' / choice ' + JSON.stringify(c3));
            // the x chip: back to the DB frame
            if (!(await panelShown())) await openMenu(); await clickSel('#v-export-panel .ve-frame-clear'); await sl(500);
            const c4 = await page.evaluate(() => APP.ifcFrameChoice()), sub4 = await subOf(); await closeMenuF(); await openMenu();
            const fw2 = await newFile(async () => { await clickTitle('ifc'); }), sha2 = fw2 ? crypto.createHash('sha256').update(fs.readFileSync(path.join(dl, fw2))).digest('hex') : null;
            ck('LIVE_FRAME_CLEAR:' + tag, !!(c4 === null && /DB frame/.test(sub4 || '') && sha2 && sha2 === nodeFrame(null) && lines.filter((l) => /§IFC_EXPORT_SEL mode=whole/.test(l)).pop().indexOf(' frame=db ') > 0), 'the x chip clears the frame: choice ' + JSON.stringify(c4) + ', sub-line ' + JSON.stringify(sub4) + '; the next export equals the node writer\'s bytes without a frame (' + (sha2 && sha2.slice(0, 16)) + ' / ' + nodeFrame(null).slice(0, 16) + ')');
            await closeMenuF();
          }
        }
        // ---- LIVE_SEL (step (c)): Find's own search box + Isolate button make the isolate; the Export menu's Find chip follows it ----
        const nm0 = st.ab.replace(/\.(ifc|db)$/i, '').replace(/_(extracted|meta)$/i, '');
        const menuIfc = () => page.evaluate(() => { const d = document.querySelector('#v-export-panel .ve-row[data-key="ifc"]'); if (!d) return null; const ch = Array.from(d.querySelectorAll('.ve-scope')).map((c) => ({ scope: c.getAttribute('data-scope'), off: c.getAttribute('data-disabled') === '1', why: c.getAttribute('data-why') || '', on: c.getAttribute('aria-pressed') === 'true', text: c.textContent.trim() })); return { chips: ch, sub: (d.querySelector('.ve-sub') || {}).textContent, title: d.getAttribute('title') || '', hint: (d.querySelector('.ve-hint') || {}).textContent || '', nRows: document.querySelectorAll('#v-export-panel .ve-row').length }; });
        const closeMenu = async () => { if (await panelShown()) { await page.keyboard.press('Escape'); await sl(300); } };
        // 1. nothing isolated: the Find chip is disabled with its reason, the default scope is whole; an EMPTY isolate set is not an isolate; the page's writer refuses a selection export with why=no_isolate and writes nothing
        await closeMenu(); await page.evaluate(() => { APP.filterByGuids(null); }); await sl(300);
        await openMenu(); const m0 = await menuIfc(); const fch0 = m0 && m0.chips.find((c) => c.scope === 'selection');
        ck('LIVE_SEL_NONE:' + tag, !!(m0 && m0.nRows === 5 && fch0 && fch0.off && fch0.why === 'no_isolate' && /\(0\)/.test(fch0.text) && /Find and isolate first/.test(m0.hint) && m0.chips.find((c) => c.scope === 'whole' && c.on)), 'no isolate: Find chip ' + JSON.stringify(fch0) + ', hint ' + JSON.stringify(m0 && m0.hint) + ', rows ' + (m0 && m0.nRows) + ', whole chip pressed');
        await closeMenu();
        await page.evaluate(() => { APP.filterByGuids(new Set()); }); await sl(300);
        await openMenu(); const mE = await menuIfc(); const fchE = mE && mE.chips.find((c) => c.scope === 'selection');
        ck('LIVE_SEL_EMPTYSET:' + tag, !!(fchE && fchE.off && fchE.why === 'no_isolate'), 'an EMPTY isolate set (the merged-ghost lens uses it) is not an isolate: Find chip ' + JSON.stringify(fchE));
        await closeMenu(); await page.evaluate(() => { APP.filterByGuids(null); }); await sl(300);
        const nF0 = files().length, ref0 = await page.evaluate(async () => { const o = {}; for (const k of ['empty', 'null', 'none']) { const r = await APP.exportIfcShared({ scope: 'selection', sel: k === 'empty' ? new Set() : k === 'null' ? null : undefined, download: true }); o[k] = { ok: r.ok, why: r.why }; } return o; }); await sl(800);
        ck('S1EMPTY:' + tag + ':page', ['empty', 'null', 'none'].every((k) => ref0[k].ok === false && ref0[k].why === 'no_isolate') && files().length === nF0, 'A.exportIfcShared({scope:selection}) with an empty Set / null / no isolate: ' + JSON.stringify(ref0) + '; files before/after ' + nF0 + '/' + files().length);
        // 2. Find's own search + Isolate (real keys, real mouse)
        await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
        await page.keyboard.press('f');
        let findOpen = false; for (let i = 0; i < 20 && !findOpen; i++) { await sl(300); findOpen = await page.evaluate(() => { const p = document.getElementById('find-panel') || document.querySelector('#find-name'); const n = document.getElementById('find-name'); return !!(n && n.getBoundingClientRect().width > 0); }); }
        if (!findOpen) { await page.evaluate(() => { if (APP.openFindPanel) APP.openFindPanel(''); }); await sl(800); findOpen = await page.evaluate(() => { const n = document.getElementById('find-name'); return !!(n && n.getBoundingClientRect().width > 0); }); log('  [' + tag + ' note] the f key did not open Find; A.openFindPanel used'); }
        if (!findOpen) { inc('LIVE_SEL:' + tag, 'the Find panel never opened'); await ctx.close(); return; }
        const FIND_Q = 'rack';
        // Find's Isolate button is shown by updateIsolateBar() (nf_isolate_drill.js), which runs from Show all (clearIsolate) and from the isolate calls: the real route to it is a group tap (the bar appears with Show all),
        // the typed filter, Show all (the bar now offers Isolate for the typed filter), then Isolate. Every step is a real mouse click or key press.
        const rowXY = await page.evaluate(() => { const e = document.querySelector('#find-tree .find-tree-row'); if (!e) return null; const t = e.querySelectorAll('span')[1] || e; const b = t.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
        if (!rowXY) { inc('LIVE_SEL:' + tag, 'the Find outliner showed no group row to tap'); await ctx.close(); return; }
        await page.mouse.click(rowXY.x, rowXY.y); await sl(1200);
        await page.click('#find-name'); await page.keyboard.type(FIND_Q, { delay: 60 });
        const visOf = (id) => page.evaluate((i) => { const b = document.getElementById(i); return !!(b && b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none'); }, id);
        const clickId = async (id) => { const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id); await page.mouse.click(r.x, r.y); };
        let saVisible = false; for (let i = 0; i < 40 && !saVisible; i++) { await sl(300); saVisible = (await visOf('find-showall-btn')) && /found/.test(await page.evaluate(() => document.getElementById('find-count').innerText)); }
        if (saVisible) { await clickId('find-showall-btn'); await sl(900); }
        let isoVisible = false; for (let i = 0; i < 20 && !isoVisible; i++) { await sl(300); isoVisible = await visOf('find-isolate-btn'); }
        if (!isoVisible) { inc('LIVE_SEL:' + tag, 'Find showed no Isolate button for the text "' + FIND_Q + '"'); await ctx.close(); return; }
        const rIso = await page.evaluate(() => { const b = document.getElementById('find-isolate-btn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); await page.mouse.click(rIso.x, rIso.y);
        let isoN = 0; for (let i = 0; i < 30 && !isoN; i++) { await sl(300); isoN = await page.evaluate(() => (APP.activeGuidFilter && APP.activeGuidFilter.size) || 0); }
        const isoSet = await page.evaluate(() => Array.from(APP.activeGuidFilter || []).sort());
        const sqlSet = (tag === 'monolith' ? new SQL.Database(new Uint8Array(gwB)) : sp.meta).exec("SELECT guid FROM elements_meta WHERE LOWER(element_name) LIKE '%rack%' OR LOWER(ifc_class) LIKE '%rack%' ORDER BY guid")[0].values.map((v) => v[0]).sort();
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' find_text=' + JSON.stringify(FIND_Q) + ' isolate=' + isoN + ' sql_expected=' + sqlSet.length);
        ck('LIVE_SEL_ISOLATE:' + tag, isoN > 0 && isoSet.join('|') === sqlSet.join('|'), 'Find\'s Isolate button (real click) left A.activeGuidFilter = ' + isoN + ' guids; the same guids as the SQL for "' + FIND_Q + '" (' + sqlSet.length + ')');
        // 3. the menu follows the isolate
        const nFilesA = files().length; await openMenu(); const m1 = await menuIfc(); const fch1 = m1 && m1.chips.find((c) => c.scope === 'selection');
        const openLine = lines.filter((l) => /§VIEWER_EXPORT_MENU open=true/.test(l)).pop() || '';
        ck('LIVE_SEL_CHIP:' + tag, !!(m1 && m1.nRows === 5 && fch1 && !fch1.off && fch1.text === 'Find selection (' + isoN + ')' && m1.chips.find((c) => c.scope === 'whole' && c.on) && /find_chip=enabled n=/.test(openLine) && openLine.indexOf('n=' + isoN) > 0), 'Find chip ' + JSON.stringify(fch1) + ' (N = A.activeGuidFilter.size = ' + isoN + '), rows ' + (m1 && m1.nRows) + '; open line: ' + openLine.slice(-90));
        // 4. a tap on the chip chooses and writes nothing
        await clickSel('#v-export-panel .ve-scope[data-scope="selection"]'); await sl(400);
        const m2 = await menuIfc(), ch2 = await page.evaluate(() => APP.ifcScopeChoice());
        ck('LIVE_SEL_CHOOSE:' + tag, !!(m2 && m2.chips.find((c) => c.scope === 'selection' && c.on) && /Find has isolated/.test(m2.sub || '') && ('' + m2.sub).indexOf(String(isoN)) >= 0 && ch2 === 'selection' && files().length === nFilesA && lines.some((l) => /§VIEWER_EXPORT_MENU ifc_scope=selection/.test(l))), 'chip tap: scope=' + ch2 + ', sub-line ' + JSON.stringify(m2 && m2.sub) + ', files before/after ' + nFilesA + '/' + files().length);
        // 5. the IFC row exports the isolate
        const selLinesBefore = lines.filter((l) => /§IFC_EXPORT_SEL mode=selection/.test(l)).length;
        await clickTitle('ifc'); const fs1 = await waitFile(/_selection_IFC4\.ifc$/, 0, 180000);
        const lastS = await page.evaluate(() => ({ last: APP._ifcExportLast || null, status: (document.getElementById('import-status') || document.getElementById('status') || {}).textContent }));
        const nodeS = (() => { const dbN = tag === 'monolith' ? new SQL.Database(new Uint8Array(gwB)) : sp.meta, geoN = tag === 'monolith' ? null : sp.geo, col = X.collect(dbN, geoN, new Set(isoSet)), res = X.build(col, { schema: 'IFC4', name: nm0 + '_selection_IFC4.ifc', buildingName: nm0, projectName: nm0 }); return Object.assign({ n: res.stats.written, col }, hashParts(res.parts, null)); })();
        const liveShaS = fs1 ? crypto.createHash('sha256').update(fs.readFileSync(path.join(dl, fs1))).digest('hex') : null;
        const selLine = lines.filter((l) => /§IFC_EXPORT_SEL mode=selection/.test(l)).pop() || '', menuLine = lines.filter((l) => /§VIEWER_EXPORT_MENU item=ifc action=exportIfcShared/.test(l)).pop() || '';
        log('§IFC_EXPORT_SEL_LIVE tag=' + tag + ' selection file=' + fs1 + ' status=' + JSON.stringify(lastS.status) + ' menuLine=' + menuLine);
        ck('LIVE_SEL_EXPORT:' + tag, !!(fs1 && fs1 === nm0 + '_selection_IFC4.ifc' && lastS.last && lastS.last.ok && lastS.last.scope === 'selection' && lastS.status === 'IFC (IFC4): ' + nodeS.n + ' elements (Find selection), ' + (fs.statSync(path.join(dl, fs1)).size / 1048576).toFixed(1) + ' MB' && lines.filter((l) => /§IFC_EXPORT_SEL mode=selection/.test(l)).length === selLinesBefore + 1 && new RegExp('mode=selection .* selected=' + isoN + ' notInDb=0 written=' + nodeS.n + ' ').test(selLine) && new RegExp('scope=selection n=' + isoN + ' schema=IFC4$').test(menuLine)),
          'download ' + fs1 + '; status ' + JSON.stringify(lastS.status) + '; §IFC_EXPORT_SEL mode=selection selected=' + isoN + ' written=' + nodeS.n);
        ck('LIVE_SEL_EQ_NODE:' + tag, !!(liveShaS && liveShaS === nodeS.sha), 'the page selection file equals the node writer\'s bytes for the same set: ' + (liveShaS && liveShaS.slice(0, 16)) + ' / ' + nodeS.sha.slice(0, 16));
        const pvS = fs1 ? py(path.join(dl, fs1)) : { error: 'no file' };
        if (pvS.skip) inc('LIVE_SEL_VALID:' + tag, 'ifcopenshell not importable'); else ck('LIVE_SEL_VALID:' + tag, !pvS.error && pvS.validate_errors === 0 && pvS.products === nodeS.n, 'the downloaded selection file: ' + (pvS.error || pvS.validate_errors + ' validate errors, ' + pvS.products + ' products (' + nodeS.n + ' expected)'));
        // 6. Find's Show all clears the isolate: the chip greys again and the scope falls back to whole
        await page.evaluate(() => { const b = document.getElementById('find-showall-btn'); if (b && b.getBoundingClientRect().width > 0) { const r = b.getBoundingClientRect(); window.__showAllXY = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; } else window.__showAllXY = null; });
        const sa = await page.evaluate(() => window.__showAllXY); if (sa) await page.mouse.click(sa.x, sa.y); await sl(600);
        const cleared = await page.evaluate(() => !APP.activeGuidFilter);
        await closeMenu(); await openMenu(); const m3 = await menuIfc(), fch3 = m3 && m3.chips.find((c) => c.scope === 'selection'), ch3 = await page.evaluate(() => APP.ifcScopeChoice());
        ck('LIVE_SEL_CLEAR:' + tag, !!(sa && cleared && fch3 && fch3.off && fch3.why === 'no_isolate' && ch3 === 'whole' && m3.chips.find((c) => c.scope === 'whole' && c.on) && /whole building/.test(m3.title)), 'Find\'s Show all (real click): isolate cleared=' + cleared + '; Find chip ' + JSON.stringify(fch3) + '; scope falls back to ' + ch3);
        await clickTitle('ifc'); await sl(2500);
        const lastW = await page.evaluate(() => APP._ifcExportLast && { scope: APP._ifcExportLast.scope, file: APP._ifcExportLast.file });
        ck('LIVE_SEL_FALLBACK:' + tag, !!(lastW && lastW.scope === 'whole' && lines.filter((l) => /§VIEWER_EXPORT_MENU item=ifc action=exportIfcShared .* scope=whole /.test(l)).length >= 2), 'after the isolate was cleared the IFC row writes the whole building: ' + JSON.stringify(lastW));
        await closeMenu();
        ck('LIVE_NOERR:' + tag, errs.length === 0, 'no page error (' + errs.length + ')');
        await ctx.close();
      };
      await liveCase('monolith', '/buildings/warehouse_gardenworld.db', false);
      await liveCase('split', '/buildings/_wit_ifcsel.db', true);
    }
  } catch (e) { log('§W-IFC-EXPORT-SEL ERROR ' + (e && e.stack || e)); return finish(3); }
  const fails = results.filter((r) => !r.ok), judged = results.length;
  const verdict = judged === 0 ? 'INCONCLUSIVE judged=0' : fails.length ? 'FAIL failed=[' + fails.map((f) => f.id).join(',') + '] of ' + judged : 'PASS ' + judged + ' of ' + judged;
  log('§W-IFC-EXPORT-SEL ' + verdict + ' inconclusive=[' + inconclusive.join(',') + '] red=' + (RED || 'none') + (judged && !fails.length && inconclusive.length ? ' (PASS covers only what was judged; see inconclusive)' : ''));
  await finish(judged === 0 ? 2 : fails.length ? 1 : 0);
})();
