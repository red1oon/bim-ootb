#!/usr/bin/env node
// ⚠ DO NOT REMOVE — builds the `<building>_2d.db` sidecar the Viewer's 2D wand fetches (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-2D-SIDECAR).
// Input: a Node-schema model db (scripts/extractIFC2DB.js output: the writer's own extraction of the IFC). Output: the writer's whole input from that ONE extraction
// (the six tables + the drawable classes, geometries, spatial structure): the Viewer opens it on its own, so its elements and the Viewer's db need not be the same extraction.
// Read the line it prints: missing tables are named, never invented. Does NOT upload anything: put the file beside the served `<building>_extracted.db`.
// usage: NODE_PATH=<dir with sql.js> node scripts/make_2d_sidecar.js <model.db> [-o <building>_2d.db]
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), initSqlJs = require('sql.js'), SC = require(path.join(__dirname, '..', 'modeller', 'dxf2bim', 'std2d_sidecar.js'));
const a = process.argv.slice(2), src = a.find(x => !x.startsWith('-')), oi = a.indexOf('-o'), out = oi >= 0 ? a[oi + 1] : (src ? src.replace(/(_extracted)?\.db$/, '_2d.db') : null);
if (!src || !out || out === src) { console.error('usage: node scripts/make_2d_sidecar.js <model.db> [-o <building>_2d.db]'); process.exit(2); }
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(src))), r = SC.build(SQL, db);
  if (r.missing.length) { console.error('§SIDECAR_2D FAIL ' + src + ' lacks ' + r.missing.join(',') + ' (not a model made by scripts/extractIFC2DB.js)'); process.exit(1); }
  fs.writeFileSync(out, Buffer.from(r.bytes));
  console.log('§SIDECAR_2D ' + src + ' -> ' + out + ' bytes=' + r.bytes.length + ' gzip=' + zlib.gzipSync(Buffer.from(r.bytes)).length + ' (' + (100 * r.bytes.length / fs.statSync(src).size).toFixed(1) + '% of the model db)');
})();
