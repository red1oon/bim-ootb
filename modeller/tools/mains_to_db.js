#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — mains_to_db, prompts/DISC_WALK_DRAWN_INTEGRATION.md §1. Read the log after every run; exit code is not evidence.
// Reads the named duct-sheet DXFs with the shipped DrawnMains.read, against the building DB's OWN ifc_grid_axis, and writes the route record through DrawnMains.write
// (drawn_route, drawn_route_sheet). Owner: "Tool now, UI later": the later Modeller button calls this same read + write.
// Two small tables of its own, because read()/write() hold neither: drawn_sheet_meta(sheet_number, revision, storey) and drawn_terminal(sheet_number, x, y, kind, storey):
// the terminals' building-coordinate positions are computed here from what read() returns (its fit: rotation, dx, dy) and the same expanded entities and rules rows.
// Usage: node modeller/tools/mains_to_db.js <building.db> <sheet.dxf>... [--sheet-meta=<json>|@file.json] [--rules=<rules.json>]
//   sheet meta: {"number":"M-101","revision":"B","storeys":["Level 1","Level 2"],"title":"FIRST FLOOR PLAN"} (storeys, else title through drawn_sheet_aliases.json) for one sheet, an array in file order, or an object keyed by the DXF file's base name.
'use strict';
const fs = require('fs'), path = require('path'), { Buffer } = require('buffer');
const M = path.join(__dirname, '..');
const initSqlJs = require(require.resolve('sql.js', { paths: [process.cwd(), path.join(process.env.HOME || '', 'bim-compiler', 'node_modules'), M] }));
const DxfParser = require(path.join(M, 'lib', 'dxf-parser.js')), DM = require(path.join(M, 'drawn_mains.js'));
const log = s => console.log(s);

const args = process.argv.slice(2), files = [];
let dbPath = null, metaArg = null, rulesPath = path.join(M, 'drawn_mains_rules.json');
for (const a of args) {
  if (a.startsWith('--sheet-meta=')) metaArg = a.slice(13); else if (a.startsWith('--rules=')) rulesPath = a.slice(8);
  else if (!dbPath) dbPath = a; else files.push(a);
}
if (!dbPath || !files.length) { console.error('Usage: node modeller/tools/mains_to_db.js <building.db> <sheet.dxf>... [--sheet-meta=<json>|@file] [--rules=<rules.json>]'); process.exit(1); }

function metaFor(i, file) {
  let m = metaArg;
  if (m && m[0] === '@') m = fs.readFileSync(m.slice(1), 'utf8');
  const j = m ? JSON.parse(m) : null, base = path.basename(file);
  const one = Array.isArray(j) ? j[i] : (j && (j[base] || (j.number != null ? j : null)));
  return { number: String((one && one.number) != null ? one.number : base.replace(/\.dxf$/i, '')), revision: String((one && one.revision) != null ? one.revision : ''), storeys: one && (one.storeys || (one.storey ? [one.storey] : null)) || null, title: (one && one.title) || null };
}
// §7.3: the storey SET of a sheet. From the caller's argument, else from the view title (also an argument: a DXF title is not reliably findable, so it is never parsed from the file) by word through the alias rows.
// Never guessed: no set from either source returns an empty set and the reason.
function storeySet(db, meta) {
  if (meta.storeys && meta.storeys.length) return { set: meta.storeys, source: 'argument' };
  if (!meta.title) return { set: [], source: 'none', why: 'no storeys argument and no title given' };
  const rows = JSON.parse(fs.readFileSync(path.join(M, 'drawn_sheet_aliases.json'), 'utf8')).rows, hit = rows.filter(r => new RegExp(r.pattern, 'i').test(meta.title));
  if (!hit.length) return { set: [], source: 'title', why: 'no storey word in the title "' + meta.title + '" matches an alias row' };
  let st = []; try { const r = db.exec('SELECT name, placement_z_m FROM storey_elevation WHERE name IS NOT NULL'); st = r.length ? r[0].values.map(v => ({ n: v[0], z: v[1] })) : []; } catch (e) { st = []; }
  if (!st.length) { try { const r = db.exec("SELECT m.storey, AVG(t.center_z) FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.storey IS NOT NULL AND m.storey<>'Unknown' GROUP BY 1"); st = r.length ? r[0].values.map(v => ({ n: v[0], z: v[1] })) : []; } catch (e) { st = []; } }
  const up = st.filter(x => x.z != null && x.z >= -0.05).sort((a, b) => a.z - b.z), set = [];
  for (const h of hit) { if (up[h.index]) set.push(up[h.index].n); else return { set: [], source: 'title', why: 'the title word "' + h.pattern + '" names storey index ' + h.index + ' and the building has ' + up.length + ' storeys at or above ground' }; }
  return { set, source: 'title', words: hit.map(h => h.pattern).join(' + ') };
}

(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8')), rl = DM.rulesFrom(RULES.rows);
  const grid = (() => { try { const r = db.exec('SELECT grid_guid, grid_name, storey, tag, x0, y0, x1, y1 FROM ifc_grid_axis'); return r.length ? r[0].values.map(v => ({ grid_guid: v[0], grid_name: v[1], storey: v[2], tag: v[3], x0: v[4], y0: v[5], x1: v[6], y1: v[7] })) : []; } catch (e) { return []; } })();
  log('§MAINS-TO-DB db=' + path.basename(dbPath) + ' grid_axes=' + grid.length + ' sheets_given=' + files.length);
  db.run('CREATE TABLE IF NOT EXISTS drawn_sheet_meta(sheet_number TEXT, revision TEXT, storey TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS drawn_terminal(sheet_number TEXT, x REAL, y REAL, kind TEXT, storey TEXT)');
  let sheets = 0, pieces = 0, length = 0, refused = 0, terminals = 0;
  files.forEach((file, i) => {
    const meta = metaFor(i, file), dxf = new DxfParser().parseSync(fs.readFileSync(file, 'utf8')), ents = dxf.entities || [], blocks = dxf.blocks || {};
    const ss = storeySet(db, meta);
    log('§MAINS-STOREYS sheet=' + meta.number + ' source=' + ss.source + (ss.set.length ? ' storeys=' + JSON.stringify(ss.set) + (ss.words ? ' title-words=' + ss.words : '') : ' none: ' + ss.why + ' (the sheet is plan only)') + (meta.title ? ' title(argument, not read from the DXF)="' + meta.title + '"' : ''));
    const res = DM.read({ entities: ents, blocks, sheet: { number: meta.number, revision: meta.revision, storey: ss.set.length === 1 ? ss.set[0] : null }, rules: RULES.rows, grid, unitM: RULES.sheet_unit_m, tagReachM: RULES.tag_reach_m });
    const s = res.sheet; sheets++;
    if (s.refused || s.inconclusive) { refused++; DM.write(db, res); return; }
    const wrote = DM.write(db, res);
    if (s.writeRefused) { refused++; return; }
    // a held sheet's storey: the caller's statement, kept beside the record
    db.run('DELETE FROM drawn_sheet_meta WHERE sheet_number=?', [s.sheet]);
    (ss.set.length ? ss.set : [null]).forEach(st => db.run('INSERT INTO drawn_sheet_meta VALUES(?,?,?)', [s.sheet, s.revision || '', st]));   // one row per storey of the set
    pieces += wrote; length += s.length_m;
    // drawn terminals: the reader's rule (an INSERT that is not a fitting, with a kind word in its name or on the terminal layer), the same expanded entities, the reader's fit
    const rowsDef = (rl.layerRows || []).filter(r => ents.some(e => new RegExp(r.centreline, 'i').test(e.layer || '')))[0];
    db.run('DELETE FROM drawn_terminal WHERE sheet_number=?', [s.sheet]);
    let tn = 0;
    if (rowsDef) {
      const m = rx => { const r = rx ? new RegExp(rx, 'i') : null; return l => !!r && r.test(l || ''); };
      const fitM = m(rowsDef.fitting), tagM = m(rowsDef.grid_tag), termM = m(rowsDef.terminal), words = rl.terminalWords || {};
      const isF = e => e.type === 'INSERT' && (!rowsDef.fitting_entity || rowsDef.fitting_entity === 'INSERT') && fitM(e.layer);
      const ex = DM.expand(ents, blocks, e => fitM(e.layer) || tagM(e.layer)), k = RULES.sheet_unit_m || 0.001, rot = s.fit_rot_deg * Math.PI / 180, c = Math.cos(rot), sn = Math.sin(rot);
      ex.ents.forEach(e => {
        if (e.type !== 'INSERT' || isF(e) || !e.position) return;
        const nm = String(e.name || '').toUpperCase(), kind = Object.keys(words).filter(w => (words[w] || []).some(x => nm.indexOf(String(x).toUpperCase()) >= 0))[0];
        if (!(kind || termM(e.layer))) return;
        const x = e.position.x * k, y = e.position.y * k;
        db.run('INSERT INTO drawn_terminal VALUES(?,?,?,?,?)', [s.sheet, c * x - sn * y + s.fit_dx, sn * x + c * y + s.fit_dy, kind || null, null]); tn++;   // the terminal's storey is picked by the walker, by the ceiling that holds it
      });
    }
    terminals += tn;
    log('§MAINS-TERMINALS sheet=' + s.sheet + ' stored=' + tn + ' reader_count=' + s.terminals + (tn === s.terminals ? ' agree' : ' DISAGREE') + ' storeys=' + (ss.set.length ? JSON.stringify(ss.set) : 'none'));
  });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  log('§MAINS-TO-DB sheets=' + sheets + ' pieces=' + pieces + ' length=' + length.toFixed(3) + ' refused=' + refused + ' terminals=' + terminals);
  db.close();
})().catch(e => { console.log('§MAINS-TO-DB ERROR ' + (e && e.stack || e)); process.exit(1); });
