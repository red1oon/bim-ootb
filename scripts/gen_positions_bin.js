#!/usr/bin/env node
// gen_positions_bin.js (§S11, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) — rebuild a split
// building's `<Name>_positions.bin` sidecar from a meta.db, in the exact format
// bim-compiler/scripts/split_db.sh emits and viewer/streaming.js §S260b reads:
//   uint32 count, then count x 6 little-endian float32 (center_x, center_y, center_z,
//   bbox_x, bbox_y, bbox_z), for every element_transforms row whose element_instances entry has a
//   geometry_hash. That file is Phase 0 of the split load — it draws the placeholder bboxes and
//   sets A.modelOffset before meta.db has arrived.
//
// Why it exists: LTU_AHouse_positions.bin was generated from the CORRUPTED LTU_AHouse_meta.db (its
// per-axis mean matches that DB's to 3 decimals), so it draws 33,524 placeholders in the wrong
// place and sets modelOffset 1.85m off. §S11's transform patch fixes meta.db at load time but
// cannot reach a sidecar binary — this regenerates it from the repaired DB. split_db.sh builds the
// sidecar from `<Name>_extracted.db`; that is unusable here, since extracted.db is the source
// TRUTH but sits in a different datum from the served meta/geo pair.
//
// Usage: node scripts/gen_positions_bin.js <patched_meta.db> <out_positions.bin>
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));

async function main() {
  const src = process.argv[2], out = process.argv[3];
  if (!src || !out) { console.error('usage: gen_positions_bin.js <meta.db> <positions.bin>'); process.exit(2); }
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(src));
  const r = db.exec(
    'SELECT t.center_x, t.center_y, t.center_z, COALESCE(t.bbox_x,1), COALESCE(t.bbox_y,1), COALESCE(t.bbox_z,1) ' +
    'FROM element_transforms t JOIN element_instances i ON t.guid = i.guid WHERE i.geometry_hash IS NOT NULL');
  db.close();
  const rows = r.length ? r[0].values : [];
  const buf = Buffer.alloc(4 + rows.length * 24);
  buf.writeUInt32LE(rows.length, 0);
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < rows.length; i++) {
    const o = 4 + i * 24;
    for (let k = 0; k < 6; k++) buf.writeFloatLE(rows[i][k], o + k * 4);
    sx += rows[i][0]; sy += rows[i][1]; sz += rows[i][2];
  }
  fs.writeFileSync(out, buf);
  console.log('§S11_POSITIONS_GEN rows=' + rows.length + ' bytes=' + buf.length +
    ' mean=(' + (sx / rows.length).toFixed(3) + ',' + (sy / rows.length).toFixed(3) + ',' + (sz / rows.length).toFixed(3) + ')' +
    ' src=' + src + ' out=' + out);
}
main().catch(e => { console.error(e); process.exit(2); });
