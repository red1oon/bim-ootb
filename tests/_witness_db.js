/**
 * # ⚠ DO NOT REMOVE — witness DB resolver. Same family as tests/_sqljs.js.
 * WHY: buildings/*.db is gitignored (.gitignore:1) apart from two un-ignored files, so a witness
 * that names Hospital_meta.db runs on the machine that happens to have it and reports INCONCLUSIVE
 * everywhere else — which is honest, but it means the only proof a feature has cannot run in CI,
 * in another worktree, or for the next session. Found by red1-1c, 2026-09-20, merging
 * feat/escape-route-reveal into a worktree carrying a different building.
 *
 * WHAT IT DOES: walks a candidate list, takes the first that exists, and APPLIES that db's
 * buildings/patches/<file>.sql if one is present — the same self-heal the viewer runs at load
 * (viewer/scene.js A._applyPendingPatch) and the same thing scripts/build_storey_walkable_raster.js
 * already accepts as its optional patch argument. That matters: the one TRACKED db with rooms
 * (HHS_Office_Federated_extracted.db) carries no storey_walkable_raster in the file at all — its
 * raster is 348 KB of INSERTs in the patch, so without applying it a Node witness sees a
 * raster-less building and mis-reports the feature as broken.
 *
 * Returns { db, name, path, patched, spaces, rasterStoreys } or null, and never throws.
 */
'use strict';
const fs = require('fs'), path = require('path');

// Ordered by how much they prove, not alphabetically. The first two are the rich local fleet; the
// third is the only tracked building with rooms, so it is what a fresh clone actually gets.
const DEFAULT_CANDIDATES = [
  'Hospital_meta.db', 'Terminal_meta.db', 'HHS_Office_Federated_extracted.db'
];

function resolveWitnessDb(SQL, opts) {
  opts = opts || {};
  const dir = opts.dir || process.env.BIM_BUILDINGS || path.join(__dirname, '..', 'buildings');
  const want = opts.candidates || DEFAULT_CANDIDATES;
  const log = opts.log || console.log;
  const tried = [];
  for (const name of want) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) { tried.push(name + ':absent'); continue; }
    let db;
    try { db = new SQL.Database(new Uint8Array(fs.readFileSync(p))); }
    catch (e) { tried.push(name + ':unreadable(' + e.message + ')'); continue; }
    // the self-heal patch, applied exactly as the viewer would
    let patched = false;
    const patch = path.join(dir, 'patches', name + '.sql');
    if (fs.existsSync(patch)) {
      try { db.run(fs.readFileSync(patch, 'utf8')); patched = true; }
      catch (e) { log('§WITNESS_DB patch failed for ' + name + ': ' + e.message + ' — continuing unpatched'); }
    }
    const one = (sql) => { try { const r = db.exec(sql); return (r.length && r[0].values[0][0]) || 0; } catch (e) { return 0; } };
    const spaces = one("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace'");
    const rasterStoreys = one("SELECT COUNT(*) FROM storey_walkable_raster");
    if (opts.needRooms !== false && spaces === 0) { tried.push(name + ':no-rooms'); db.close(); continue; }
    if (opts.needRaster && rasterStoreys === 0) { tried.push(name + ':no-raster' + (patched ? '-even-patched' : '')); db.close(); continue; }
    log('§WITNESS_DB using=' + name + ' patched=' + patched + ' spaces=' + spaces +
        ' rasterStoreys=' + rasterStoreys + (tried.length ? ' (skipped ' + tried.join(', ') + ')' : ''));
    return { db: db, name: name, path: p, patched: patched, spaces: spaces, rasterStoreys: rasterStoreys };
  }
  log('§WITNESS_DB NONE_USABLE tried=' + tried.join(', ') + ' dir=' + dir);
  return null;
}

module.exports = { resolveWitnessDb: resolveWitnessDb, DEFAULT_CANDIDATES: DEFAULT_CANDIDATES };
