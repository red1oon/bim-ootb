#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OVERLAY-ENTITIES: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the 2D overlay (viewer/dxf_sheet_view.js) draws EVERY entity the 2D writer emits, so what the person sees is what they save.
 *   E1 COUNT   — per sheet and per type, entities counted straight from the DXF text == entities the renderer drew (DIMENSION counted once, its block parts separately).
 *   E2 COLOUR  — every colour is an AutoCAD ACI the renderer knows (unknown_colour = 0): nothing drawn in a guessed colour.
 *   E3 SUPPORT — no entity type the renderer does not support (unsupported = 0).
 *   E4 EXTENT  — every drawn primitive has finite coordinates; the sheet has a bounding box.
 *   E5 CONTROL — a TEXT entity removed from the DXF text is seen as a count difference (the witness can see a missing entity).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_sheet_view.js <Node model .db>   (whole building and every wing)
 */
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const S = require(path.join(__dirname, '..', 'dxf2bim', 'std2d.js')), V = require(path.join(__dirname, '..', '..', 'viewer', 'dxf_sheet_view.js'));
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const rawCounts = text => { const L = text.split(/\r?\n/), c = {}; let sec = null; for (let i = 0; i + 1 < L.length; i += 2) { const k = L[i].trim(), v = L[i + 1]; if (k === '0' && v === 'SECTION') sec = L[i + 3]; else if (k === '0' && v === 'ENDSEC') sec = null; else if (sec === 'ENTITIES' && k === '0') c[v] = (c[v] || 0) + 1; } return c; };
const eq = (a, b) => { const ks = new Set(Object.keys(a).concat(Object.keys(b))); return [...ks].every(k => (a[k] || 0) === (b[k] || 0)); };
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2])));
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const sets = [['whole', S.writeStdSet(q, 'X')]]; S.wingAngles(S.loadModel(q, { add() {}, gap() {} })).forEach(f => sets.push(['wing ' + f.deg, S.writeStdSet(q, 'X', { wing: { angle: f.deg, name: 'W' } })]));
  let sheets = 0, ents = 0, ctl = null;
  sets.forEach(([nm, R]) => {
    let bad = [], unk = 0, uns = 0, nonfin = 0, nobox = 0;
    Object.keys(R.files).forEach(f => {
      sheets++; const raw = rawCounts(R.files[f]), D = V.toDrawList(V.parse(R.files[f])), b = V.bounds(D.list);
      ents += Object.values(raw).reduce((s, x) => s + x, 0);
      if (!eq(raw, D.stats.by_type) || !eq(raw, D.stats.drawn_by_type)) bad.push(f + ' raw=' + JSON.stringify(raw) + ' drawn=' + JSON.stringify(D.stats.drawn_by_type));
      unk += D.stats.unknown_colour; uns += D.stats.unsupported || 0; if (!b) nobox++;
      D.list.forEach(d => { const nums = JSON.stringify(d); if (/null|NaN/.test(nums)) nonfin++; });
      if (!ctl && raw.TEXT) { const t = R.files[f], at = t.indexOf('\nTEXT\n'); ctl = { f, raw, t, at }; }
    });
    check('E1', nm + ': per-type counts, text == drawn', !bad.length, bad.length ? bad[0].slice(0, 200) : Object.keys(R.files).length + ' sheets');
    check('E2', nm + ': every colour is a known ACI', unk === 0, 'unknown=' + unk);
    check('E3', nm + ': no unsupported entity type', uns === 0, 'unsupported=' + uns);
    check('E4', nm + ': finite coordinates, every sheet has an extent', nonfin === 0 && nobox === 0, 'nonfinite=' + nonfin + ' no_extent=' + nobox);
  });
  if (ctl) { const L = ctl.t.split(/\r?\n/); let i = L.findIndex((x, k) => x.trim() === '0' && L[k + 1] === 'TEXT' && L.slice(0, k).includes('ENTITIES')); L.splice(i, 2); const raw = rawCounts(ctl.t), D = V.toDrawList(V.parse(L.join('\n'))); check('E5', 'control: a removed entity shows as a count difference', !eq(raw, D.stats.by_type), 'raw TEXT ' + raw.TEXT + ' vs drawn ' + (D.stats.by_type.TEXT || 0) + ' (the removal splices the next entity into the previous: expected to differ)'); }
  say(sheets + ' sheets, ' + ents + ' entities'); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
