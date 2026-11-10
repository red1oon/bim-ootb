#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — project_inputs, prompts/DISC_WALK_DRAWN_INTEGRATION.md §12, §12a BUILD. Read the log after every run; the exit code is not evidence.
// The pre-processor that runs BEFORE a walk: the BIM Document register decides which sheets a walk may read (industry practice: build only from Issued for construction).
//   CO (latest revision of its number) -> read, issued | IP -> read, review (provisional) | DR / RE / superseded -> NOT read | no row, or a different file -> read, not stated (provisional).
// It only ADDS rows in its own table drawn_sheet_status(sheet_number, revision, status, basis, provenance); the sheets themselves are read by the SAME tool as before (mains_to_db.js).
// Usage: node modeller/tools/project_inputs.js <building.db> [--register=<json>|@file] <sheet.dxf>... [--sheet-meta=<json>|@file]
//   register: [{no, rev, status, discipline, filekind, sha256, name}] (the BIM Document register export). sheet meta: as mains_to_db.js.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const M = path.join(__dirname, '..');
const initSqlJs = require(require.resolve('sql.js', { paths: [process.cwd(), path.join(process.env.HOME || '', 'bim-compiler', 'node_modules'), M] }));
const log = s => console.log(s);
const args = process.argv.slice(2), files = [], pass = [];
let dbPath = null, regArg = null, metaArg = null;
for (const a of args) {
  if (a.startsWith('--register=')) regArg = a.slice(11); else if (a.startsWith('--sheet-meta=')) { metaArg = a.slice(13); } else if (a.startsWith('--')) pass.push(a);
  else if (!dbPath) dbPath = a; else files.push(a);
}
if (!dbPath) { console.error('Usage: node modeller/tools/project_inputs.js <building.db> [--register=<json>|@file] <sheet.dxf>... [--sheet-meta=<json>|@file]'); process.exit(1); }
const readArg = a => (a && a[0] === '@') ? fs.readFileSync(a.slice(1), 'utf8') : a;
const register = regArg ? JSON.parse(readArg(regArg)) : null;
const metaJ = metaArg ? JSON.parse(readArg(metaArg)) : null;
function metaFor(i, file) {   // the same reading of the argument as mains_to_db.js
  const base = path.basename(file), one = Array.isArray(metaJ) ? metaJ[i] : (metaJ && (metaJ[base] || (metaJ.number != null ? metaJ : null)));
  return { raw: one || null, number: String((one && one.number) != null ? one.number : base.replace(/\.dxf$/i, '')), revision: String((one && one.revision) != null ? one.revision : '') };
}
const DISC = {}; (JSON.parse(fs.readFileSync(path.join(M, 'drawn_sheet_aliases.json'), 'utf8')).discipline_rows || []).forEach(r => { DISC[String(r.code).toUpperCase()] = r.disciplines || []; });
const S = v => (v == null ? '' : String(v));
// a revision order: numbers by value, else text; only used to say "a higher revision of this number is issued"
const revCmp = (a, b) => { const na = Number(a), nb = Number(b); return (S(a) !== '' && S(b) !== '' && isFinite(na) && isFinite(nb)) ? na - nb : S(a).localeCompare(S(b)); };

function decide(meta, file) {
  if (!register) return { read: true, status: 'not-stated', basis: 'no register given' };
  const rows = register.filter(r => S(r.no) === meta.number), row = rows.find(r => S(r.rev) === meta.revision);
  if (!row) return { read: true, status: 'not-stated', basis: 'no register row for ' + meta.number + ' rev ' + (meta.revision || '(none)') };
  const kind = S(row.filekind).toUpperCase(), code = S(row.discipline).toUpperCase(), st = S(row.status).toUpperCase();
  if (kind && kind !== 'DXF') return { read: false, status: 'refused', basis: 'file kind ' + kind + ' is listed, not read', listed: true };
  if (!DISC[code] || !DISC[code].length) return { read: false, status: 'refused', basis: 'unmapped discipline=' + (code || '(none)'), unmapped: true };
  if (st === 'DR' || st === 'RE') return { read: false, status: 'refused', basis: 'status=' + st };
  if (st !== 'CO' && st !== 'IP') return { read: true, status: 'not-stated', basis: 'register status "' + S(row.status) + '" is not one of DR IP CO RE' };
  if (row.sha256) { const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); if (h !== String(row.sha256).toLowerCase()) return { read: true, status: 'not-stated', basis: 'sha256 differs from the registered file' }; }
  if (st === 'IP') return { read: true, status: 'review', basis: 'status=IP' };
  const higher = rows.filter(r => S(r.status).toUpperCase() === 'CO' && revCmp(r.rev, row.rev) > 0);
  if (higher.length) return { read: false, status: 'refused', basis: 'superseded-by-register: rev ' + S(higher[0].rev) + ' is issued' };
  return { read: true, status: 'issued', basis: 'status=CO' };
}

(async () => {
  const SQL = await initSqlJs(), open = () => new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const has = (db, t) => db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0;
  const one = (db, sql, p) => { const st = db.prepare(sql); st.bind(p || []); const v = st.step() ? st.get()[0] : 0; st.free(); return v; };
  log('§INPUTS db=' + path.basename(dbPath) + ' register=' + (register ? register.length + ' rows' : 'none') + ' sheets_given=' + files.length);
  if (register) register.filter(r => S(r.filekind).toUpperCase() !== 'DXF').forEach(r => log('§INPUTS-LISTED no=' + S(r.no) + ' rev=' + S(r.rev) + ' filekind=' + S(r.filekind) + ' status=' + S(r.status) + ' (listed, not read)'));
  const verdicts = files.map((f, i) => { const m = metaFor(i, f); return { file: f, meta: m, d: decide(m, f) }; });
  // supersede: rows held from an older revision of a sheet about to be read again
  { const db = open();
    verdicts.filter(v => v.d.read).forEach(v => {
      if (!has(db, 'drawn_route_sheet')) return;
      const old = db.exec("SELECT revision FROM drawn_route_sheet WHERE sheet_number='" + v.meta.number.replace(/'/g, "''") + "'"); const orev = old.length ? S(old[0].values[0][0]) : null;
      if (orev == null || orev === v.meta.revision) return;
      const n = one(db, 'SELECT count(*) FROM drawn_route WHERE sheet=?', [v.meta.number]) + (has(db, 'drawn_terminal') ? one(db, 'SELECT count(*) FROM drawn_terminal WHERE sheet_number=?', [v.meta.number]) : 0) + (has(db, 'drawn_equipment') ? one(db, 'SELECT count(*) FROM drawn_equipment WHERE sheet=?', [v.meta.number]) : 0);
      log('§INPUTS-SUPERSEDED no=' + v.meta.number + ' rev ' + orev + ' -> ' + v.meta.revision + ' placements=' + n);
    });
    db.close(); }
  verdicts.forEach(v => log('§INPUTS-SHEET ' + (v.d.read ? 'read' : 'refused') + ' no=' + v.meta.number + ' rev=' + (v.meta.revision || '(none)') + ' status=' + v.d.status + ' basis=' + v.d.basis));
  // the sheets that may be read go through the same tool as before, in the order given
  const go = verdicts.filter(v => v.d.read);
  if (go.length) {
    const meta = go.map(v => v.meta.raw || { number: v.meta.number, revision: v.meta.revision });
    const r = cp.spawnSync('node', [path.join(__dirname, 'mains_to_db.js'), dbPath].concat(go.map(v => v.file), ['--sheet-meta=' + JSON.stringify(meta)], pass), { encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
    (r.stdout || '').split('\n').filter(Boolean).forEach(l => log(l));
    if (r.status !== 0) { log('§INPUTS ERROR mains_to_db exited ' + r.status + ' ' + String(r.stderr || '').slice(0, 300)); process.exit(1); }
  }
  // the verdicts, in the tool's own table (a sheet's row is replaced by its newest verdict)
  const db = open();
  db.run('CREATE TABLE IF NOT EXISTS drawn_sheet_status(sheet_number TEXT, revision TEXT, status TEXT, basis TEXT, provenance TEXT, PRIMARY KEY (sheet_number, revision))');
  verdicts.forEach(v => { if (v.d.read) db.run('DELETE FROM drawn_sheet_status WHERE sheet_number=?', [v.meta.number]);
    db.run('INSERT OR REPLACE INTO drawn_sheet_status VALUES(?,?,?,?,?)', [v.meta.number, v.meta.revision, v.d.status, v.d.basis, v.d.status === 'issued' ? 'drawn:' + v.meta.number + '/' + v.meta.revision : v.d.status === 'review' ? 'drawn-review:' + v.meta.number + '/' + v.meta.revision : v.d.status === 'not-stated' ? 'drawn-unstated:' + v.meta.number + '/' + v.meta.revision : null]); });
  fs.writeFileSync(dbPath, Buffer.from(db.export())); db.close();
  const n = s => verdicts.filter(v => v.d.status === s).length;
  log('§INPUTS sheets=' + verdicts.length + ' issued=' + n('issued') + ' review=' + n('review') + ' notStated=' + n('not-stated') + ' refused=' + n('refused') + ' read=' + go.length);
})().catch(e => { console.log('§INPUTS ERROR ' + (e && e.stack || e)); process.exit(1); });
