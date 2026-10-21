#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CLINIC-STOREYS: prompts/DXF2BIM_FOUNDATION_LANE.md F7 CLINIC STOREYS. The --verify command of scripts/oci_patch_gate.js for a storey patch
// written by scripts/gen_storey_patch.js. Read the §STOREY_DEPLOY lines after every run (exit code alone is not evidence).
// THE ISSUE THIS PROVES OR DISPROVES: the served db the Viewer loads (Clinic.db) declares no storey, so the 2D wand is not offered. Does served + patch carry EXACTLY
// the storeys the IFCs declare (re-derived here from the IFC files, not from the patch), offer the wand, and leave everything else the served db had alone?
//   S1 rows = the IFC rows, every column        S2 the wand's own count query > 2 and = the IFC storey count     S3 every patch statement touches spatial_structure only
//   S4 a second apply changes nothing           S5 every elements_meta.storey label except Unknown is declared   S6 §S18 query rows -> deriveStoreyMergeMap bands = the distinct IFC datums
//   (standalone --served mode adds) S0 the served db has no storey before; S3b every other table's row count unchanged; the patch applied in sql.js all-or-nothing like the Viewer.
// Usage: node scripts/probe_storey_patch_deploy.js --patch <patch.sql> --ifc <f> [--ifc <f> ...] (--gate-db <db> | --served <served raw db>)   ($GATE_DB is read when no --gate-db)
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const G = require(path.join(__dirname, 'gen_storey_patch.js')), SG = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const a = process.argv.slice(2), ifcs = []; let patch = null, gateDb = process.env.GATE_DB || null, served = null;
for (let i = 0; i < a.length; i++) { if (a[i] === '--ifc') ifcs.push(a[++i]); else if (a[i] === '--patch') patch = a[++i]; else if (a[i] === '--gate-db') gateDb = a[++i]; else if (a[i] === '--served') served = a[++i]; }
if (!patch || !ifcs.length || !(gateDb || served)) { console.error('usage: probe_storey_patch_deploy.js --patch <sql> --ifc <f> ... (--gate-db <db> | --served <db>)'); process.exit(2); }
let fail = 0; const check = (id, issue, ok, d) => { if (!ok) fail++; console.log('§STOREY_DEPLOY ' + (ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const one = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return { err: e.message }; } };
// the Viewer's statement-aware chunker shape (viewer/scene.js A._runSqlChunked)
function runChunked(db, sql) { const st = []; let b = []; for (const ln of sql.split('\n')) { if (!ln.trim()) continue; b.push(ln); if (/;\s*$/.test(ln)) { st.push(b.join('\n')); b = []; } } if (b.length) st.push(b.join('\n')); for (let i = 0; i < st.length; i += 500) db.run(st.slice(i, i + 500).join('\n')); return st; }
const tableCounts = db => { const o = {}; (one(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") || []).forEach(r => { o[r[0]] = one(db, 'SELECT count(*) FROM "' + r[0] + '"')[0][0]; }); return o; };
const ROWSQL = "SELECT guid,type,name,parent_guid,object_type,predefined_type,center_x,center_y,center_z,size_x,size_y,size_z,elevation FROM spatial_structure WHERE type IN ('IfcBuilding','IfcBuildingStorey') AND guid NOT LIKE 'STC\\_%' ESCAPE '\\' ORDER BY guid";
(async () => {
  const SQL = await initSqlJs(), sql = fs.readFileSync(patch, 'utf8'), want = G.rowsFromIfcs(ifcs);
  if (want.refusals.length) { want.refusals.forEach(r => console.log('§STOREY_DEPLOY REFUSED ' + r)); process.exit(1); }
  console.log('§STOREY_DEPLOY ifc rows=' + want.rows.length + ' (' + want.per.map(p => p.file + ' ' + p.unit + ' ' + p.storeys.length).join('; ') + ') patch=' + patch + ' ' + sql.length + ' B');
  let db, before = null;
  if (served) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(served)));
    const s0 = one(db, "SELECT count(*) FROM spatial_structure WHERE type='IfcBuildingStorey'");
    check('S0', 'the served db declares no storey before the patch (the reason the wand is not offered)', !!s0.err || s0[0][0] === 0, s0.err ? 'query throws: ' + s0.err : 'rows=' + s0[0][0]);
    before = tableCounts(db);
    let n; try { n = runChunked(db, sql).length; check('S0b', 'the patch applies in sql.js all-or-nothing (a throw = the Viewer discards the whole patch)', true, n + ' statements'); }
    catch (e) { check('S0b', 'the patch applies in sql.js all-or-nothing', false, 'THREW ' + e.message); process.exit(1); }
  } else db = new SQL.Database(new Uint8Array(fs.readFileSync(gateDb)));
  const got = one(db, ROWSQL), exp = want.rows.slice().sort((x, y) => x.guid < y.guid ? -1 : 1).map(r => [r.guid, r.type, r.name, r.parent_guid, null, null, null, null, null, null, null, null, r.elevation]);
  const diff = []; exp.forEach((e, i) => { const g = got[i] || []; e.forEach((v, j) => { const ok = (v === g[j]) || (typeof v === 'number' && typeof g[j] === 'number' && Math.abs(v - g[j]) < 1e-12); if (!ok) diff.push(e[0] + '[' + j + '] ' + JSON.stringify(g[j]) + ' != ' + JSON.stringify(v)); }); });
  check('S1', 'the table rows = the rows re-derived from the IFC files, every column', !got.err && got.length === exp.length && !diff.length, (got.err || ('rows ' + got.length + ' / ' + exp.length)) + (diff.length ? ' diff: ' + diff.slice(0, 4).join('; ') : ''));
  const nSt = one(db, "SELECT count(*) FROM spatial_structure WHERE type='IfcBuildingStorey'")[0][0], nWant = want.rows.filter(r => r.type === 'IfcBuildingStorey').length;
  check('S2', "the wand's own query (wing_2d.js storeyCount) returns > 2 and = the IFC storey count", nSt > 2 && nSt === nWant, 'storeys=' + nSt + ' ifc=' + nWant);
  const stm = sql.split('\n').filter(l => l.trim() && !/^--/.test(l)), other = stm.filter(l => !/^(CREATE TABLE IF NOT EXISTS spatial_structure |DELETE FROM spatial_structure |INSERT INTO spatial_structure )/.test(l));
  let s3 = 'statements=' + stm.length + ' touching another table=' + other.length;
  if (before) { const after = tableCounts(db), ch = Object.keys(Object.assign({}, before, after)).filter(t => t !== 'spatial_structure' && before[t] !== after[t]); s3 += '; tables ' + Object.keys(before).length + ' -> ' + Object.keys(after).length + ', other tables with a changed row count: ' + (ch.length ? ch.join(',') : 'none') + ' (elements_meta ' + after.elements_meta + ')'; if (ch.length) other.push(...ch); }
  check('S3', 'the patch touches spatial_structure only', other.length === 0, s3);
  const r1 = JSON.stringify(one(db, 'SELECT * FROM spatial_structure ORDER BY guid')); runChunked(db, sql); const r2 = JSON.stringify(one(db, 'SELECT * FROM spatial_structure ORDER BY guid'));
  check('S4', 'a second apply (the needle path re-runs the patch on the live db) changes nothing', r1 === r2, 'rows ' + JSON.parse(r2).length);
  const labels = one(db, "SELECT DISTINCT storey FROM elements_meta WHERE storey IS NOT NULL").map(r => r[0]), declared = new Set(one(db, "SELECT name FROM spatial_structure WHERE type='IfcBuildingStorey'").map(r => r[0])), undeclared = labels.filter(l => !declared.has(l));
  check('S5', 'every elements_meta.storey label except Unknown is a declared storey name', undeclared.every(l => /^unknown$/i.test(l)), 'labels=' + labels.length + ' undeclared=' + JSON.stringify(undeclared));
  const s18 = one(db, "SELECT type,name,elevation FROM spatial_structure WHERE type='IfcBuildingStorey' AND elevation IS NOT NULL"), map = s18.err ? {} : SG.deriveStoreyMergeMap(s18.map(v => ({ type: v[0], name: v[1], elevation: v[2] })));
  const bands = new Set(Object.values(map)).size, datums = []; want.rows.filter(r => r.elevation != null).map(r => r.elevation).sort((x, y) => x - y).forEach(z => { if (!datums.length || z - datums[datums.length - 1] > 1e-6) datums.push(z); });
  check('S6', 'the §S18 query (schedule_author.js) returns rows and deriveStoreyMergeMap bands = the distinct datums the IFCs state', !s18.err && s18.length === nWant && bands === datums.length, 'rows=' + (s18.err || s18.length) + ' names=' + Object.keys(map).length + ' bands=' + bands + ' datums=' + JSON.stringify(datums.map(z => +z.toFixed(3))) + ' map=' + JSON.stringify(map));
  console.log('§STOREY_DEPLOY ' + (fail ? 'FAIL ' + fail : 'PASS')); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('§STOREY_DEPLOY CRASH', e); process.exit(1); });
