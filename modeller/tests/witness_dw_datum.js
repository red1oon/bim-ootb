#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-DATUM scope (read this block first; read the §-log after every run)
 * SCOPE: §TE-ARC-DATUM-FIX port witness (bim-compiler RESUME_DISC_WALKER_ENVELOPE_BOUND.md
 *   §TE-ARC-DATUM, 2026-07-10). THE ISSUE THIS WITNESS PROVES/DISPROVES: the shipped Modeller
 *   substrate modeller/Terminal_ARC.db sits in the raw-IFC building frame, −14.66 m below the
 *   extraction site frame that terminal_rules.db's baked z_datum_offset (+14.593) targets — so
 *   the LIVE Modeller disc walk starved every z-band and collapsed all disciplines (ELEC 744→390,
 *   PLB 888→252, measured 2026-07-10). The fix: walk-time measured reconciliation via the
 *   rule_frame_ref table (per-class mean-z refs in the band frame; walker takes the median
 *   per-class delta vs the walked substrate). This witness runs the PORTED modeller/disc_walker.js
 *   against the SHIPPED files in this tree — exit code is not evidence, read the log.
 *
 * CLAIMS:
 *   U1 DATUM-ENGAGED — walking modeller/Terminal_ARC.db emits §DW-DATUM with |zOff| < 1 m
 *                      (measured from the substrate — NOT the baked +14.593 site-frame constant).
 *   U2 QTY           — ELEC+PLB per-class placed/n_measured ∈ [0.5, 2.0] on the shipped substrate
 *                      (the collapse is gone).
 *   U3 CONFORM       — 0 placements outside Terminal_ARC.db's own XY envelope, 0 outside their own
 *                      reconciled z-band (±fixture extent) — no mid-void, no wrong-storey.
 *   U4 FALSIFIER     — DROP rule_frame_ref in a COPY of the rules (walker back on the baked
 *                      one-frame offset) → total placed collapses <0.6× — proves U1–U3 measure the
 *                      fix, and that the reconciliation is what makes the shipped substrate walkable.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('sql.js');

var MOD = path.join(__dirname, '..');
var RULES = path.join(MOD, 'terminal_rules.db');
var ARC = path.join(MOD, 'Terminal_ARC.db');
var LOG = path.join(MOD, '..', 'logs', 'witness_dw_datum_' +
  new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + '.log');

var _lines = [];
var _rawLog = console.log.bind(console);
function log(s) { _lines.push(s); _rawLog(s); }
// capture the walker's own §-lines (the primary evidence channel) into the log file too
console.log = function () {
  var s = Array.prototype.slice.call(arguments).join(' ');
  _lines.push(s); _rawLog(s);
};
var pass = 0, fail = 0;
function assert(c, cond, d) { if (cond) { pass++; log('  ✅ ' + c + ' — ' + d); } else { fail++; log('  ❌ ' + c + ' — ' + d); } }
function rows(db, sql) { var r = db.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }
function loadDb(SQL, f) { return new SQL.Database(new Uint8Array(fs.readFileSync(f))); }

(async function main() {
  log('═══ W-DW-DATUM — ported walker vs the SHIPPED modeller/Terminal_ARC.db (building frame) ═══');
  var SQL = await initSqlJs();
  global.window = global.window || {};
  var dw = require(path.join(MOD, 'disc_walker.js'));

  var rules = loadDb(SQL, RULES);
  var arc = loadDb(SQL, ARC);
  var env = rows(arc, 'SELECT MIN(center_x-bbox_x/2) x0, MAX(center_x+bbox_x/2) x1, MIN(center_y-bbox_y/2) y0, MAX(center_y+bbox_y/2) y1 FROM element_transforms')[0];

  dw.dwOpen(rules);
  var datumLines = [];
  var origPush = _lines.push.bind(_lines);
  _lines.push = function (s) { if (/§DW-DATUM /.test(s)) datumLines.push(s); return origPush(s); };

  var placed = 0, detail = [], qtyOk = true, out = 0, zBad = 0, modeOk = true;
  ['ELEC', 'PLB'].forEach(function (d) {
    var w = dw.dwWalk(d, arc, 'Terminal', { schedule: true });
    modeOk = modeOk && !w.refused && w.mode === 'measured-band';
    placed += w.placed || 0;
    var bc = {}; (w.placements || []).forEach(function (p) { bc[p.ifc_class] = (bc[p.ifc_class] || 0) + 1; });
    rows(rules, "SELECT ifc_class, SUM(n_measured) nm FROM rule_placement WHERE disc='" + d + "' GROUP BY ifc_class")
      .forEach(function (r) {
        var g = bc[r.ifc_class] || 0, ratio = r.nm ? g / r.nm : 0;
        qtyOk = qtyOk && ratio >= 0.5 && ratio <= 2.0;
        detail.push(d + '/' + r.ifc_class + ' ' + g + '/' + r.nm + ' (' + ratio.toFixed(2) + ')');
        log('§DWD qty ' + d + '/' + r.ifc_class + ' generated=' + g + ' n_measured=' + r.nm + ' ratio=' + ratio.toFixed(2));
      });
    (w.placements || []).forEach(function (p) {
      if (p.x < env.x0 - 0.5 || p.x > env.x1 + 0.5 || p.y < env.y0 - 0.5 || p.y > env.y1 + 0.5) out++;
      var band = p.band; if (!band) { zBad++; return; }
      var tol = (p.bz || 0.5) + 0.75;
      if (p.z < band[0] - tol || p.z > band[1] + tol) zBad++;
    });
  });
  _lines.push = origPush;

  log(''); log('─── U1 DATUM-ENGAGED ───');
  var zOffs = datumLines.map(function (s) { var m = s.match(/zOff=(-?[\d.]+)/); return m ? parseFloat(m[1]) : NaN; });
  var u1 = zOffs.length >= 2 && zOffs.every(function (z) { return Math.abs(z) < 1; });
  assert('U1 DATUM-ENGAGED', u1,
    zOffs.length + ' §DW-DATUM lines, zOff=[' + zOffs.join(', ') + '] — measured from the shipped substrate, all |zOff|<1 m (the baked +14.593 site-frame constant was NOT applied)');

  log(''); log('─── U2 QTY (the collapse is gone) ───');
  assert('U2 QTY', modeOk && qtyOk, "mode='measured-band'; " + detail.join('; ') + ' — all in band [0.5,2.0] vs mined n_measured');

  log(''); log('─── U3 CONFORM ───');
  assert('U3 CONFORM', out === 0 && zBad === 0,
    placed + ' placements: ' + out + ' outside the shipped file\'s own XY envelope, ' + zBad + ' outside their own reconciled z-band (±fixture extent)');

  log(''); log('─── U4 FALSIFIER (back to the live bug) ───');
  var tampered = loadDb(SQL, RULES);
  tampered.exec('DROP TABLE rule_frame_ref');
  dw.dwOpen(tampered);
  var falsPlaced = 0;
  ['ELEC', 'PLB'].forEach(function (d) { falsPlaced += dw.dwWalk(d, arc, 'Terminal', { schedule: true }).placed || 0; });
  dw.dwOpen(rules);
  tampered.close();
  assert('U4 FALSIFIER', falsPlaced < placed * 0.6,
    'DROP rule_frame_ref (baked offset only) → placed ' + placed + '→' + falsPlaced +
    ' (<0.6× — the walk-time datum reconciliation is what makes the shipped substrate walkable)');

  log('');
  log('W-DW-DATUM: ' + pass + ' PASS / ' + fail + ' FAIL');
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, _lines.join('\n') + '\n');
  log('§LOG ' + LOG);
  process.exit(fail ? 1 : 0);
})();
