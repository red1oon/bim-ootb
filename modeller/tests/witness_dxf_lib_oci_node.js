#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-LIB-OCI (L1): prompts/DXF2BIM_MODELLER_LANE.md §L3.4. Read the log after every run (exit code is not evidence).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the public Modeller has no local library; it reads the LOD400 library from OCI as an index +
 * shards (BIMCompiler scripts/export_library_subset.js --full). A shard can lose a candidate row or a mesh, or the loader can fetch the
 * wrong shards, and then a fill binds to another product or sits elsewhere. The marked std set states its window products as @TAG
 * markings (BIMCompiler §14 LF-4), so the library alone (no labels sidecar) must give the 36 fills.
 *   O1 FILLS     — the module fed ONLY from objects DOWNLOADED from OCI (Dxf2BimImport.loadOci, the page's own loader, Node fetch)
 *                  places the same fills as the Node run on the local DB (out/duplex_basic_shapes_elements_std.json): same guid,
 *                  element_ref, geometry_hash, class, storey, bbox within 1 mm; 36 = IfcDoor 14 + IfcWindow 22; verdict qualifies.
 *   O2 BYTES     — every object fetched from OCI (latest, index, shards) is byte-identical to a fresh local export, and each
 *                  shard's sha256 equals the one the index lists. Issue: OCI serves another (stale / partial) library than the export.
 *   O3 DETERMINISM — two fresh exports are byte-identical (diff -r). Issue: the export is not a function of the DB.
 *   O4 FALSIFY   — the O1 comparator with one Node fill moved 2 mm reports exactly that one. Issue: a comparator that cannot fail.
 * DXSET=std inputs (not in git): $DXF2BIM_BC tests/dxf2bim/out/{marked_std,marked_std_shell}, the _std summary, deploy/component_library.db.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto'), os = require('os');
const I = require(path.join(__dirname, '..', 'dxf2bim_import.js'));
const BC = process.env.DXF2BIM_BC || path.join(process.env.HOME, 'Projects', 'bim-compiler');
const OUT = path.join(BC, 'tests/dxf2bim/out');
const BASE = process.env.DXF_LIB_BASE || 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/';
const LOG = path.join(__dirname, 'logs', 'witness_dxf_lib_oci_node.log');
const lines = []; let fail = 0;
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hashHex = s => sha(s);

(async () => {
  say('BC=' + BC + ' base=' + BASE);
  // O3: two fresh exports
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxflib-')), E1 = path.join(tmp, 'e1'), E2 = path.join(tmp, 'e2');
  const exp = d => cp.execFileSync('node', [path.join(BC, 'scripts/export_library_subset.js'), '--full', '--out-dir', d,
    '--lib', path.join(BC, 'deploy/component_library.db')], { encoding: 'utf8' }).trim();
  say(exp(E1)); exp(E2);
  let same = true; try { cp.execFileSync('diff', ['-r', '-q', E1, E2]); } catch (e) { same = false; say(String(e.stdout)); }
  check('O3 DETERMINISM', 'the export is not a function of the DB (two runs differ)', same, 'diff -r ' + (same ? 'empty' : 'NOT empty'));

  // the page's loader, fed by Node fetch; every fetched text recorded for O2
  const got = {};
  const fetchJson = async u => { const r = await fetch(u); if (r.status === 404) { got[u] = null; return null; } if (!r.ok) throw new Error(u + ' HTTP ' + r.status);
    const ct = r.headers.get('content-type'); const t = await r.text(); got[u] = { text: t, ct }; return JSON.parse(t); };
  const files = [['DX_FLOOR_GF_marked.dxf', 'marked_std'], ['DX_FLOOR_FF_marked.dxf', 'marked_std'], ['DX_FRONT_shell.dxf', 'marked_std_shell'], ['DX_REAR_shell.dxf', 'marked_std_shell'],
    ['DX_LEFT_shell.dxf', 'marked_std_shell'], ['DX_RIGHT_shell.dxf', 'marked_std_shell'], ['DX_ROOF_marked.dxf', 'marked_std'], ['DX_SECTION_marked.dxf', 'marked_std']]
    .map(([n, d]) => ({ name: n, text: fs.readFileSync(path.join(OUT, d, n), 'utf8') }));
  const sheets = I.readSheets(files, { hashHex });
  const t0 = Date.now();
  const o = await I.loadOci(sheets, { base: BASE, fetchJson });
  say('§DXF-LIB source=oci sha=' + o.sha.slice(0, 12) + ' shards=' + o.shards.length + ' families=' + o.families.length + ' (' + o.families.join(',') + ') passes=' + o.passes + ' fetched=' + Object.keys(got).length + ' bytes=' + Object.values(got).reduce((n, x) => n + (x ? Buffer.byteLength(x.text) : 0), 0) + ' ms=' + (Date.now() - t0));

  // O2: fetched == fresh export, byte for byte; shard sha == index; content type
  const bad2 = [], idx = JSON.parse(fs.readFileSync(path.join(E1, o.sha.slice(0, 12), 'index.json'), 'utf8')), shaOf = {};
  idx.shards.forEach(s => { shaOf[o.sha.slice(0, 12) + '/' + s.name + '.json'] = s.sha256; });
  Object.keys(got).forEach(u => { const rel = u.slice(BASE.length), x = got[u], lp = path.join(E1, rel);
    if (!x) { if (fs.existsSync(lp)) bad2.push(rel + ' 404 on OCI but exported'); return; }
    if (!fs.existsSync(lp)) { bad2.push(rel + ' not in the export'); return; }
    if (sha(x.text) !== sha(fs.readFileSync(lp))) bad2.push(rel + ' bytes differ');
    if (shaOf[rel] && shaOf[rel] !== sha(x.text)) bad2.push(rel + ' sha != index');
    if (!/^application\/json/.test(x.ct || '')) bad2.push(rel + ' content-type ' + x.ct); });
  check('O2 BYTES', 'OCI serves another library than a fresh export (bytes, index sha or content type)', bad2.length === 0 && Object.keys(got).length > 2,
    'fetched=' + Object.keys(got).length + ' (404: ' + Object.keys(got).filter(u => !got[u]).map(u => u.slice(BASE.length)).join(',') + ')' + (bad2.length ? ' bad: ' + bad2.slice(0, 6).join('; ') : ''));

  // O1: convert with the OCI library vs the Node run (local DB)
  const R = I.convert(sheets, { hashHex, library: o.library });
  const ref = JSON.parse(fs.readFileSync(path.join(OUT, 'duplex_basic_shapes_elements_std.json'), 'utf8'));
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const bb = e => [0, 1, 2].map(a => Math.min(...e.vertices.map(v => v[a]))).concat([0, 1, 2].map(a => Math.max(...e.vertices.map(v => v[a])))).map(r6);
  const fills = (R.els || []).filter(e => e.element_ref).map(e => ({ guid: e.guid, class: e.class, storey: e.storey, element_ref: e.element_ref, geometry_hash: e.geometry_hash, bbox: bb(e) }));
  const refF = ref.elements.filter(e => e.element_ref);
  const cmp = (A, Bref) => { const byG = {}, bad = []; A.forEach(x => { byG[x.guid] = x; });
    Bref.forEach(r => { const x = byG[r.guid]; if (!x) { bad.push(r.guid.slice(0, 8) + ' missing ' + r.element_ref); return; }
      const d = Math.max(...r.bbox.map((v, i) => Math.abs(v - x.bbox[i])));
      if (x.class !== r.class || x.storey !== r.storey || x.element_ref !== r.element_ref || x.geometry_hash !== r.geometry_hash || d > 0.001) bad.push(r.guid.slice(0, 8) + ' ' + r.class + ' ' + x.element_ref + '/' + r.element_ref + ' bboxΔ=' + d.toFixed(4)); });
    A.forEach(x => { if (!Bref.some(r => r.guid === x.guid)) bad.push('extra ' + x.guid.slice(0, 8) + ' ' + x.element_ref); });
    return bad; };
  const bad1 = cmp(fills, refF), byCls = fills.reduce((m, f) => (m[f.class] = (m[f.class] || 0) + 1, m), {});
  check('O1 FILLS', 'a fill from the OCI library binds to another product, mesh, class or storey, or sits elsewhere (1 mm), than the Node run on the local DB',
    !R.refused && bad1.length === 0 && fills.length === 36 && refF.length === 36 && byCls.IfcDoor === 14 && byCls.IfcWindow === 22 && R.run_id === ref.run_id && R.verdict.verdict === 'qualifies' && R.fillGaps.length === 0,
    'node=' + refF.length + ' oci=' + fills.length + ' ' + JSON.stringify(byCls) + ' run_id ' + (R.run_id || '').slice(0, 12) + '/' + ref.run_id.slice(0, 12) + ' verdict=' + (R.verdict && R.verdict.verdict) +
    ' blocking=' + (R.verdict && R.verdict.blocking.length) + ' fillGaps=' + (R.fillGaps || []).length + ' hashes=' + new Set(fills.map(f => f.geometry_hash)).size + (bad1.length ? ' differ: ' + bad1.slice(0, 6).join('; ') : ''));

  const moved = JSON.parse(JSON.stringify(refF)); moved[0].bbox[0] += 0.002; moved[0].bbox[3] += 0.002;
  const fb = cmp(fills, moved);
  check('O4 FALSIFY', 'the O1 comparator cannot fail (one Node fill moved 2 mm must be exactly 1 difference)', fb.length === 1, 'reported=' + fb.length + ' ' + fb.join('; '));
  fs.rmSync(tmp, { recursive: true, force: true });
  say('SUMMARY fail=' + fail);
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { say('ERR ' + e.stack); try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n'); } catch (x) {} process.exit(1); });
