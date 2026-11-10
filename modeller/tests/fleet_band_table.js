#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — prompts/DISC_WALK_BAND_NO_HOST.md §7 fleet check. Read the log after every run; exit code is not evidence.
// One row per walk: every building DB held with real content x every discipline its rules hold, both read from the directory and the rules DB, never a hand-picked list.
// Usage: WALK_OUT=<json> [WALK_TREE=<other tree>] node fleet_band_table.js [buildingDir]    (WALK_TREE runs that tree's walker, the BEFORE column).
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
const DIR = process.argv[2] || path.join(process.env.HOME, 'bim-ootb', 'buildings');
const realLog = console.log; const quiet = () => { console.log = function (s) { if (/§WALK-BAND-NOHOST|§WALK-AREAHOST|§WALK-MAINS|§SCHED-FALLBACK/.test(String(s))) realLog(s); }; };
// Each DB runs in its own process: sql.js's wasm heap does not return memory across many large opens (it ran out at the 34th walk).
const cp = require('child_process'), MOD = path.join(process.env.HOME, 'bim-ootb', 'modeller');
function list() {
  const out = [], skipped = [];
  fs.readdirSync(DIR).filter(f => /\.db$/.test(f) && !/_geo\.db$/.test(f)).sort().forEach(f => { if (fs.lstatSync(path.join(DIR, f)).isSymbolicLink() || /_silent|AjaibPath|Terminal_rooms|TermRooms|_2d\.db$/.test(f)) skipped.push(f + ':a link or a copy'); else out.push(path.join(DIR, f)); });
  fs.readdirSync(MOD).filter(f => /_ARC\.db$/.test(f)).sort().forEach(f => out.push(path.join(MOD, f)));   // the Modeller's residents: what the page actually walks
  return { out, skipped };
}
if (!process.env.FLEET_ONE) {
  const { out, skipped } = list(), rows = []; let ok = 0;
  out.forEach(p => {
    const tmp = (process.env.WALK_OUT || '/tmp/fleet') + '.' + path.basename(p) + '.json';
    const r = cp.spawnSync(process.execPath, ['--max-old-space-size=8000', __filename], { env: Object.assign({}, process.env, { FLEET_ONE: p, WALK_OUT_ONE: tmp }), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
    process.stdout.write((r.stdout || '').split('\n').filter(l => /§FLEET_ROW|§FLEET_SKIP|§WALK-BAND-NOHOST|§WALK-AREAHOST|§WALK-MAINS|§SCHED-FALLBACK|ERROR/.test(l)).join('\n') + '\n');
    if (r.status !== 0) realLog('§FLEET_FAIL ' + path.basename(p) + ' status=' + r.status + ' ' + String(r.stderr || '').slice(0, 200));
    if (fs.existsSync(tmp)) { rows.push.apply(rows, JSON.parse(fs.readFileSync(tmp))); fs.unlinkSync(tmp); ok++; }
    if (process.env.WALK_OUT) fs.writeFileSync(process.env.WALK_OUT, JSON.stringify(rows));
  });
  realLog('§FLEET_N walks=' + rows.length + ' dbs=' + out.length + ' run=' + ok + ' skipped=' + JSON.stringify(skipped));
  process.exit(0);
}
(async () => {
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL), rows = [], p = process.env.FLEET_ONE, f = path.basename(p);
  if (fs.statSync(p).size < 10240) { realLog('§FLEET_SKIP ' + f + ' empty'); process.exit(0); }
  const raw = new Uint8Array(fs.readFileSync(p)), probe = new SQL.Database(raw); let n = 0;
  try { n = probe.exec('SELECT count(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid')[0].values[0][0]; } catch (e) { n = 0; }
  probe.close(); if (!n) { realLog('§FLEET_SKIP ' + f + ' no elements'); process.exit(0); }
  const name = f.replace(/(_extracted|_meta|_ARC)?\.db$/, ''), geoF = path.join(DIR, name + '_geo.db');
  H.openBuildingRules(SQL, stack, name);
  const discs = stack.DW.disciplines(), kind = /_meta\.db$/.test(f) ? 'meta' : (/_ARC\.db$/.test(f) ? 'resident' : 'extracted');
  // The page passes the building's geometry file with a resident or a split pair; an extracted DB holds its own meshes.
  let geoDb = null; if (kind !== 'extracted' && fs.existsSync(geoF) && fs.statSync(geoF).size > 10240) geoDb = new SQL.Database(new Uint8Array(fs.readFileSync(geoF)));
  for (const disc of discs) {
    quiet(); const t0 = Date.now(); let w, err = null;
    try { w = H.walkLive(SQL, stack, disc, new Uint8Array(raw), name, [], geoDb ? { geoDb } : {}); } catch (e) { err = String(e && e.message || e); w = {}; }
    console.log = realLog;
    const P = w.placements || [], S = H.summarize(w), cls = S.byClass, bound = S.bound, band = S.floatBand, sched = S.sched;   // the one tally (modeller/tools/walk_node.js)
    const r = { file: f, kind, building: name, n, disc, mode: w.mode || (w.schedule ? 'schedule' : (w.refused ? 'refused' : 'legacy')), placed: w.placed || 0, provisional: w.provisional || 0, total: P.length, bound, floatBand: band, sched, chainSegs: (w.chainSegs || []).length, refused: w.refused || false, reason: w.reason || null, refusedNoHost: w.refusedNoHost || null, mains: w.mains || null, byClass: cls, ms: Date.now() - t0, err };
    rows.push(r);
    realLog('§FLEET_ROW ' + f + ' ' + disc + ' mode=' + r.mode + ' placed=' + r.placed + ' bound=' + bound + ' floatBand=' + band + ' sched=' + sched + ' chainSegs=' + r.chainSegs + ' unhosted=' + (r.refusedNoHost ? r.refusedNoHost.unhosted : '-') + ' notJudged=' + (r.refusedNoHost ? r.refusedNoHost.notJudged : '-') + ' refused=' + (r.refusedNoHost ? r.refusedNoHost.refused != null ? r.refusedNoHost.refused : r.refusedNoHost.total : '-') + ' ms=' + r.ms + (err ? ' ERROR ' + err.slice(0, 120) : ''));
    fs.writeFileSync(process.env.WALK_OUT_ONE, JSON.stringify(rows));
  }
  process.exit(0);
})().catch(e => { realLog('§FLEET ERROR ' + (e && e.stack || e)); process.exit(1); });
