#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-ID-BANDS (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4 RESULT, found 2026-11-09). READ THE LOG: §PIB lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: two bundles each wrote "Id band 9541001-9541999 (no seed row, no other bundle)" — the BIM Document plugin (#2746) and Migrate from Odoo (#2743) —
//   and both staged AD_Menu 9541001; the menu leaf opened the other plugin's window and the Migrate-from-Odoo form became unreachable (W-ODOO-FORM-LIVE red on main). A band that
//   is only a comment cannot stop the next one. This witness: (1) every bundle in erp/plugins that stages dictionary rows DECLARES a band; (2) no two declared bands overlap;
//   (3) every dictionary row id a bundle stages (manifest.dictionary, numeric idCol) lies inside its own band; (4) no id is staged by two bundles; (5) none collides with a seed row
//   of the same table. FALSIFIER: the witness re-checks with a planted second bundle on an existing band and must report it.
// Command: node erp/tests/witness_plugin_id_bands.js
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), PL = path.join(ERP, 'plugins');
let judged = 0, fails = 0;
const ok = (k, c, m, info) => { judged++; if (!c) fails++; console.log('  §PIB-CHECK ' + k + ' ' + (c ? 'OK' : 'FAIL') + ' ' + m + (c ? '' : ' ' + JSON.stringify(info))); };
function seedHas(table, idCol, id) {
  try { return cp.execFileSync('sqlite3', [path.join(ERP, 'ad_seed.db'), 'SELECT count(*) FROM ' + table + ' WHERE ' + idCol + '=' + Number(id)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== '0'; } catch (e) { return false; }
}
function judge(bundles) {
  const r = { noBand: [], overlap: [], outside: [], twice: [], seed: [] }, owner = {};
  bundles.forEach((b) => {
    if (!b.ids.length) return;
    if (!b.band) { r.noBand.push(b.file); return; }
    b.ids.forEach((x) => {
      if (x.id < b.band[0] || x.id > b.band[1]) r.outside.push(b.file + ' ' + x.table + ' ' + x.id);
      const k = x.table + ':' + x.id;
      if (owner[k] && owner[k] !== b.file) r.twice.push(k + ' ' + owner[k] + ' + ' + b.file); else owner[k] = b.file;
      if (x.seed) r.seed.push(b.file + ' ' + k);
    });
  });
  const wb = bundles.filter((b) => b.band && b.ids.length);
  for (let i = 0; i < wb.length; i++) for (let j = i + 1; j < wb.length; j++) {
    const a = wb[i].band, c = wb[j].band; if (a[0] <= c[1] && c[0] <= a[1]) r.overlap.push(wb[i].file + ' ' + a.join('-') + ' × ' + wb[j].file + ' ' + c.join('-'));
  }
  return r;
}
(async () => {
  const files = fs.readdirSync(PL).filter((f) => /\.mjs$/.test(f)).sort(), bundles = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(PL, f), 'utf8'), m = /Id band (\d+)\s*-\s*(\d+)/.exec(src);
    let mod = null; try { mod = await import(url.pathToFileURL(path.join(PL, f)).href); } catch (e) { /* a chunk needing the browser: no manifest to read */ }
    const ids = [];
    ((mod && mod.manifest && mod.manifest.dictionary) || []).forEach((d) => (d.rows || []).forEach((row) => {
      const v = row[d.idCol]; if (typeof v === 'number' && Number.isFinite(v)) ids.push({ table: d.table, id: v, seed: seedHas(d.table, d.idCol, v) });
    }));
    bundles.push({ file: f, band: m ? [Number(m[1]), Number(m[2])] : null, ids });
    if (ids.length || m) console.log('§PIB bundle=' + f + ' band=' + (m ? m[1] + '-' + m[2] : 'none') + ' numericIds=' + ids.length);
  }
  const staged = bundles.filter((b) => b.ids.length).length;
  if (!staged) { console.log('§PIB-VERDICT INCONCLUSIVE no bundle stages numeric dictionary ids'); process.exit(3); }
  const r = judge(bundles);
  console.log('§PIB-NOTE bundles staging ids without a declared band (older bundles; Libero carries iDempiere\'s own official ids): ' + JSON.stringify(r.noBand) + ' — judged by once / not-seed below, not by a band');
  ok('no-overlap', r.overlap.length === 0, 'no two declared bands overlap', r.overlap);
  ok('inside', r.outside.length === 0, 'every staged id lies inside its own bundle\'s band', r.outside.slice(0, 10));
  ok('once', r.twice.length === 0, 'no (table, id) is staged by two bundles', r.twice.slice(0, 10));
  ok('not-seed', r.seed.length === 0, 'no staged id collides with a seed row of the same table', r.seed.slice(0, 10));
  // FALSIFIER: plant a copy of the first banded bundle under another name — the overlap and the double staging must be reported
  const first = bundles.find((b) => b.band && b.ids.length), planted = judge(bundles.concat([{ file: 'planted.mjs', band: first.band, ids: first.ids.map((x) => Object.assign({}, x, { seed: false })) }]));
  ok('falsifier', planted.overlap.length > 0 && planted.twice.length > 0, 'a planted bundle on ' + first.file + '\'s band is reported (overlap + ids staged twice)', { o: planted.overlap.length, t: planted.twice.length });
  console.log('§PIB-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails ? 1 : 0);
})();
