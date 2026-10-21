#!/usr/bin/env node
// ⚠ DO NOT REMOVE — builds the `<building>_2d.db` sidecar the Viewer's 2D wand fetches (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-2D-SIDECAR).
// Input: a Node-schema model db (scripts/extractIFC2DB.js output: the writer's own extraction of the IFC). Output: the writer's whole input from that ONE extraction
// (the six tables + the drawable classes, geometries, spatial structure): the Viewer opens it on its own, so its elements and the Viewer's db need not be the same extraction.
// Read the line it prints: missing tables are named, never invented. Does NOT upload anything: put the file beside the served `<building>_extracted.db`.
// --served <viewer db> (the db the Viewer really loads, e.g. `<name>_meta.db` of a split building): REFUSES unless at least 99% of the GUIDs both carry have the same centre to 1 mm (stated: the Hospital measured 15,192 of 15,214, 22 differ)
// (the plane is placed in the Viewer's 3D and written from the sidecar: a different extraction would land it on another wing; the orphan-meta class of bug).
// usage: NODE_PATH=<dir with sql.js> node scripts/make_2d_sidecar.js <model.db> [-o <building>_2d.db] [--served <viewer.db>]
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), initSqlJs = require('sql.js'), SC = require(path.join(__dirname, '..', 'modeller', 'dxf2bim', 'std2d_sidecar.js'));
const a = process.argv.slice(2), oi = a.indexOf('-o'), si = a.indexOf('--served'), served = si >= 0 ? a[si + 1] : null, src = a.find((x, i) => !x.startsWith('-') && i !== oi + 1 && (si < 0 || i !== si + 1)), out = oi >= 0 ? a[oi + 1] : (src ? src.replace(/(_extracted)?\.db$/, '_2d.db') : null);
if (!src || !out || out === src) { console.error('usage: node scripts/make_2d_sidecar.js <model.db> [-o <building>_2d.db]'); process.exit(2); }
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(src))), r = SC.build(SQL, db);
  if (r.missing.length) { console.error('§SIDECAR_2D FAIL ' + src + ' lacks ' + r.missing.join(',') + ' (not a model made by scripts/extractIFC2DB.js)'); process.exit(1); }
  if (served) {
    const v = new SQL.Database(new Uint8Array(fs.readFileSync(served))), cen = d => { const m = new Map(), x = d.exec('SELECT guid, center_x, center_y, center_z FROM element_transforms'); (x[0] ? x[0].values : []).forEach(r => m.set(r[0], r.slice(1))); return m; };
    const A = cen(db), V = cen(v); let n = 0, ok = 0, worst = 0; A.forEach((c, g) => { const w = V.get(g); if (!w) return; n++; const d = Math.hypot(c[0] - w[0], c[1] - w[1], c[2] - w[2]); if (d < 1e-3) ok++; if (d > worst) worst = d; });
    const line = `§SIDECAR_2D_ALIGN served=${served} shared_guids=${n} within_1mm=${ok} differ=${n - ok} worst_m=${worst.toFixed(4)}`;
    if (!n || ok < 0.99 * n) { console.error(line + ' FAIL (not the same coordinates: extract the IFC the served db came from)'); process.exit(1); }
    console.log(line + ' OK');
  }
  fs.writeFileSync(out, Buffer.from(r.bytes));
  console.log('§SIDECAR_2D ' + src + ' -> ' + out + ' bytes=' + r.bytes.length + ' gzip=' + zlib.gzipSync(Buffer.from(r.bytes)).length + ' (' + (100 * r.bytes.length / fs.statSync(src).size).toFixed(1) + '% of the model db)');
})();
