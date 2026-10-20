#!/usr/bin/env node
// ⚠ DO NOT REMOVE — the --verify command of scripts/oci_patch_gate.js for the georef block in buildings/patches/Hospital_meta.db.sql (prompts/DXF2BIM_FOUNDATION_LANE.md F7, north).
// ONE question: does the SERVED Hospital_meta.db plus this patch carry the Hospital's real georef, and did the patch leave what the served db already had (project_metadata, rooms raster) alone?
// Runs on $GATE_DB (the downloaded served bytes with the patch applied), never on a local db. Read the §GEOREF_DEPLOY lines.
'use strict';
const fs = require('fs'), initSqlJs = require('sql.js');
const i = process.argv.indexOf('--gate-db'), file = i >= 0 ? process.argv[i + 1] : process.env.GATE_DB;
if (!file) { console.error('usage: probe_georef_deploy.js --gate-db <db>'); process.exit(2); }
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(file))), m = {};
  db.exec('SELECT key,value FROM project_metadata')[0].values.forEach(r => { m[r[0]] = r[1]; });
  const want = { true_north_angle: '5.000000', true_north_source: 'ifc_truenorth', site_latitude: '42.35842896', site_longitude: '-71.05977631', site_elevation_m: '165.8112', site_latlong_source: 'ifc_site' };
  let bad = 0; Object.keys(want).forEach(k => { const ok = m[k] === want[k]; if (!ok) bad++; console.log('§GEOREF_DEPLOY ' + (ok ? 'ok  ' : 'FAIL') + ' ' + k + '=' + m[k] + (ok ? '' : ' want ' + want[k])); });
  const keep = m.building_name === 'Hospital' && !!m.import_date; if (!keep) bad++; console.log('§GEOREF_DEPLOY ' + (keep ? 'ok  ' : 'FAIL') + ' served keys kept building_name=' + m.building_name + ' import_date=' + m.import_date);
  const tn = Number(m.true_north_angle), tx = -Math.sin(tn * Math.PI / 180), ty = Math.cos(tn * Math.PI / 180), ifcOk = Math.abs(tx - -0.0871557427476695) < 1e-9 && Math.abs(ty - 0.996194698091745) < 1e-9;
  if (!ifcOk) bad++; console.log('§GEOREF_DEPLOY ' + (ifcOk ? 'ok  ' : 'FAIL') + ' 5.000000 deg reproduces the IFC TrueNorth vector (' + tx.toFixed(15) + ', ' + ty.toFixed(15) + ')');
  const r = db.exec("SELECT count(*) FROM storey_walkable_raster")[0].values[0][0]; if (r < 7) bad++; console.log('§GEOREF_DEPLOY ' + (r >= 7 ? 'ok  ' : 'FAIL') + ' walkable raster rows survive: ' + r);
  console.log('§GEOREF_DEPLOY ' + (bad ? 'FAIL ' + bad : 'PASS')); process.exit(bad ? 1 : 0);
})();
