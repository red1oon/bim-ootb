#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ROW7-GEO-REINIT: the §ROW7-TRUE-CENTRE re-init FIRES on the real Open path (browser).
 * Companion to witness_row7_true_centre.js (pure node, the numbers). This leg proves the WIRING, which is where
 * #1744's §REAL-AABB fix silently never ran for ~7 weeks: swbInit runs at _openBuffer BEFORE the resident's
 * *_geo.db is fetched, so a bridge that can read true centres still walks on ANCHORS unless the geo-fetch
 * continuation re-inits it. "Prove a fix FIRES on the real path, not that it shipped."
 *
 *   R1 SYNC-INIT-IS-ANCHORS  — the §STRWALK-INIT line at Open says centres=mesh:0 (the ordering defect is real: at
 *                              that moment there is no geometry to read).
 *   R2 GEO-REINIT-FIRES      — a REAL resident Open (HospitalGarage: the one small resident whose ARC db carries STR
 *                              IfcColumn rows — 140; SampleCastle/HHS/Clinic/Terminal_ARC carry 0 and walk
 *                              wall-bearing — its 2.4 MB geometry fetched from object storage) logs §STRWALK-GEO
 *                              system=column-framed with centres=mesh:N > 0.
 *   R3 REINIT-BEFORE-RENDER  — §STRWALK-GEO precedes §STRWALK-RENDER-WIRE, so the rendered skeleton is the
 *                              true-centre walk, not the anchor one.
 *   R4 FIXTURE-NUMBERS       — after #b-clear, _openBuffer(Terminal_arcstr_proof.db) + the same continuation with the
 *                              fixture's own bytes as geoBuf logs centres=mesh:158 colRMS=0.1323 (median fit, red1 2026-09-26) and the tab reads 18×10:
 *                              the browser reproduces the node witness's number on the identical substrate.
 *   R5 CLEAN                 — no pageerror.
 * Needs network for R2/R3 (SampleCastle_geo.db from OCI); without it those two print as INCONCLUSIVE, not PASS.
 */
'use strict';
const path = require('path'), fs = require('fs');
const { runE2E } = require('./e2e_harness');
const FIX = path.join(__dirname, '..', 'Terminal_arcstr_proof.db');

runE2E('W-E2E-ROW7-GEO-REINIT', async (t) => {
  const RES = 'HospitalGarage';
  await t.open(RES);
  for (let i = 0; i < 120 && !t.slog.some(l => new RegExp('§STRWALK-RENDER-WIRE ' + RES).test(l)); i++) await t.sleep(1000);
  const initIdx = t.slog.findIndex(l => /§STRWALK-INIT (column-framed|wall-bearing)/.test(l));
  const geoIdx = t.slog.findIndex(l => /§STRWALK-GEO re-init/.test(l));
  const renderIdx = t.slog.findIndex(l => new RegExp('§STRWALK-RENDER-WIRE ' + RES).test(l));
  const degraded = t.slog.some(l => new RegExp('§GEO-SERVED-DEGRADED ' + RES).test(l));
  const initLine = initIdx >= 0 ? t.slog[initIdx] : '', geoLine = geoIdx >= 0 ? t.slog[geoIdx] : '';
  const initMesh = parseInt((initLine.match(/centres=mesh:(\d+)/) || [])[1], 10);
  const geoMesh = parseInt((geoLine.match(/centres=mesh:(\d+)/) || [])[1], 10);
  const geoAnchor = parseInt((geoLine.match(/anchor:(\d+)/) || [])[1], 10);
  t.assert('R1 SYNC-INIT-IS-ANCHORS (the Open-time §STRWALK-INIT has centres=mesh:0 — no geometry exists yet, the ordering defect is real)',
    initIdx >= 0 && initMesh === 0, 'line="' + initLine.slice(0, 160) + '"');
  if (degraded) {
    console.log('  ⚠ INCONCLUSIVE R2/R3 — ' + RES + '_geo.db did not load (no network?): the continuation had nothing to re-init with');
    t.assert('R2 GEO-REINIT-FIRES (INCONCLUSIVE — geometry substrate absent, nothing judged)', false, 'GEO-SERVED-DEGRADED');
    t.assert('R3 REINIT-BEFORE-RENDER (INCONCLUSIVE — geometry substrate absent, nothing judged)', false, '');
  } else {
    t.assert('R2 GEO-REINIT-FIRES (real resident Open of ' + RES + ', real geo fetch: §STRWALK-GEO system=column-framed centres=mesh:N > 0)',
      geoIdx >= 0 && geoMesh > 0 && /system=column-framed/.test(geoLine), 'line="' + geoLine.slice(0, 200) + '" anchorFallback=' + geoAnchor);
    t.assert('R3 REINIT-BEFORE-RENDER (§STRWALK-GEO precedes §STRWALK-RENDER-WIRE — the rendered skeleton is the true-centre walk)',
      geoIdx >= 0 && renderIdx > geoIdx, 'geoIdx=' + geoIdx + ' renderIdx=' + renderIdx);
  }
  await t.shot('01-' + RES.toLowerCase() + '-reinit');

  // R4 — deterministic numbers on the fixture, through the page's own continuation function
  let r4 = { skipped: true };
  if (fs.existsSync(FIX) && fs.statSync(FIX).size > 1024) {
    await t.clickSel('#b-clear'); await t.sleep(500);
    const before = t.slog.length;
    const bytes = fs.readFileSync(FIX);
    r4 = await t.pg.evaluate(async (b64) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const ok = window.STRWalkerOutliner._openBuffer(u8.buffer, 'Terminal_arcstr_proof.db');
      const st = window.STRWalkerOutliner._reinitStrWalkWithGeo(u8.buffer);
      const td = window.swbTabData();
      return { ok, mesh: st && st.centres ? st.centres.mesh : -1, anchor: st && st.centres ? st.centres.anchor : -1,
               colRMS: st ? st.colRMS : null, grid: td ? td.grid : null, columns: td ? td.columns : -1, girders: td ? td.girders : -1 };
    }, bytes.toString('base64'));
    const geo2 = t.slog.slice(before).find(l => /§STRWALK-GEO re-init/.test(l)) || '';
    t.assert('R4 FIXTURE-NUMBERS (browser continuation on Terminal_arcstr_proof.db: centres=mesh:158 anchor:0, colRMS 0.1323 (median fit), tab 18×10, 108 girders)',
      r4.ok && r4.mesh === 158 && r4.anchor === 0 && Math.abs(r4.colRMS - 0.1323) <= 0.002 && r4.grid === '18×10' && r4.columns === 158 && r4.girders === 108 && /centres=mesh:158/.test(geo2),
      JSON.stringify(r4) + ' line="' + geo2.slice(0, 160) + '"');
  } else {
    console.log('  ⚠ INCONCLUSIVE R4 — fixture absent (gitignored): ' + FIX);
    t.assert('R4 FIXTURE-NUMBERS (INCONCLUSIVE — fixture absent, nothing judged)', false, '');
  }
  t.assert('R5 CLEAN (no pageerror)', t.errs.length === 0, t.errs.slice(0, 2).join(' | '));
});
