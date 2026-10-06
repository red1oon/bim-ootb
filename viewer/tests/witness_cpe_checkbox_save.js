#!/usr/bin/env node
// witness_cpe_checkbox_save.js — W-CPE-CHECKBOX-SAVE
//
// ⚠ DO NOT REMOVE — SCOPE (bim-ootb prompts/CINEMA_PATH_EDITOR.md §CPE_CHECKBOX_SAVE). Read the log after every run.
// User, 2026-10-06: "it does not allow to save when we changed boxes, and it does not save new boxes".
//
// ISSUES THIS PROVES OR DISPROVES (each gate names one):
//   D1  changing ONLY one Alt+C box (each of 11, plus Bounce) makes _isEdited() true  -> Save enabled.
//   D0  control: touching nothing leaves _isEdited() false (so D1 is not "always dirty").
//   P1  each box saved through the SHIPPED _writeCinemaPathTable and read back through the SHIPPED
//       _cpeLoadFromDb comes back with the SAME value, ON and OFF (+ sunDate, bakeRes, bounce).
//   P2  an old-schema .db (14-col, and the 21-col pre-fix shape) loads unchanged: path intact, new keys
//       UNDEFINED so today's defaults (loadPath falls back to Measure) still apply.
//   P3  the saved table carries a column for every box (the evidence in the user's own DB: it lacked 5).
// Whitebox, no browser: the shipped functions are SLICED from the shipped files by brace matching and run
// over a real sql.js database — never re-typed. ROOT=<dir with viewer/{scene,effects,cinema_path_editor}.js>
// points it at another tree (the RED control runs it against origin/main's files).
// VERDICT prints INCONCLUSIVE (never PASS) when a slice fails or nothing was judged.
'use strict';
const __readSrc = require('./_split_families.js').readSource;   // split-aware source reads: a split module reads back as its original text (bim-compiler VIEWER_FILE_SPLIT_PLAN.md)
const fs = require('fs'), path = require('path'), vm = require('vm');
const HOME = require('os').homedir();
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const rd = f => __readSrc(path.join(ROOT, 'viewer', f), 'utf8');
function sliceFn(src, marker) {
  const i = src.indexOf(marker); if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; } else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const edSrc = rd('cinema_path_editor.js'), sceneSrc = rd('scene.js'), fxSrc = rd('effects.js');
const isEditedSrc = sliceFn(edSrc, 'function _isEdited(');
const writeSrc = sliceFn(sceneSrc, 'function _writeCinemaPathTable(');
const readSrc = sliceFn(fxSrc, 'function _cpeLoadFromDb(');
// optional helpers that exist only in the fixed tree
const flagKeysLine = (edSrc.match(/var _CPE_FLAG_KEYS = [^\n]*\n/) || [''])[0];
const flagBaseSrc = sliceFn(edSrc, 'function _flagBaseline(') || '';

const BOOLS = ['buildup', 'roomTitle', 'reveal', 'clash', 'measure', 'storeyReveal', 'loadPath', 'visualPanel', 'audioPanel', 'escapeRoute', 'sunCompass'];
const COL = { buildup: 'buildup', roomTitle: 'room_title', reveal: 'reveal', clash: 'clash', measure: 'measure', storeyReveal: 'storey_reveal',
  loadPath: 'load_path', visualPanel: 'visual_panel', audioPanel: 'audio_panel', escapeRoute: 'escape_route', sunCompass: 'sun_compass',
  sunDate: 'sun_date', bakeRes: 'bake_res', filmBounce: 'film_bounce' };

// ---- D: dirty detection through the shipped _isEdited ------------------------------------------------------
function freshState() {
  return { origBands: [], bands: [], hose: [], clipIn: 0, clipOut: 1, userTotal: null, corrections: [], origCorrections: [],
    buildup: false, origBuildup: false, roomTitle: false, origRoomTitle: false, reveal: false, origReveal: false,
    clash: false, measure: false, storeyReveal: false, loadPath: false, visualPanel: false, audioPanel: false,
    escapeRoute: false, sunCompass: false, sunDate: '', bakeRes: '', filmBounce: true, origFlags: null };
}
function isEditedAfter(mut) {
  const sb = { _state: freshState(), console: { log() {} }, Math };
  vm.createContext(sb);
  vm.runInContext(flagKeysLine + flagBaseSrc + '\n' + isEditedSrc + '\n', sb);
  // the shipped open() sets origFlags = _flagBaseline() right after _state is built (tree without it: absent)
  if (flagBaseSrc) vm.runInContext('_state.origFlags = _flagBaseline();', sb);
  mut(sb._state);
  return vm.runInContext('_isEdited()', sb);
}

// ---- P: persistence through the shipped writer + reader ----------------------------------------------------
function baseOv(over) {
  return Object.assign({
    bands: [{ c: { x: 0, y: 1, z: 2 }, d: { x: 1, y: 0, z: 0 }, len: 3, hold: 0 }, { c: { x: 4, y: 5, z: 6 }, d: { x: 0, y: 0, z: 1 }, len: 7, hold: 2.5 }],
    _total: 61, diveSec: 1.8, spinSec: 0, outSec: 21.8, riseSec: 2.7, dayCounter: 'tr',
    buildup: false, roomTitle: false, reveal: false, clash: false, measure: false, storeyReveal: false, loadPath: false,
    visualPanel: false, audioPanel: false, escapeRoute: false, sunCompass: false, sunDate: '', bakeRes: '', filmBounce: true }, over || {});
}
function roundTrip(SQL, ov, legacy) {
  const db = new SQL.Database();
  const idf = (x, y, z) => ({ ix: x, iy: y, iz: z, x, y, z });
  const A = { _cinemaPathEdit: ov, _getCinemaPathEdit: () => ov, three2ifc: idf, three2ifcDir: idf, ifc2three: idf, ifc2threeDir: idf,
    dbQuery(sql) { const r = db.exec(sql); return r.length ? r[0].values : []; } };
  const logs = [];
  if (legacy) {
    const n21 = legacy === 21;
    db.run('CREATE TABLE cinema_path (seq INTEGER, ifc_x REAL, ifc_y REAL, ifc_z REAL, dir_x REAL, dir_y REAL, dir_z REAL, len REAL, total_sec REAL, dive_sec REAL, spin_sec REAL, out_sec REAL, rise_sec REAL, hold_sec REAL' +
      (n21 ? ', buildup INTEGER, room_title INTEGER, reveal INTEGER, day_counter TEXT, clash INTEGER, measure INTEGER, storey_reveal INTEGER' : '') + ')');
    ov.bands.forEach((b, i) => db.run('INSERT INTO cinema_path VALUES (' + (n21 ? '?,'.repeat(20) + '?' : '?,'.repeat(13) + '?') + ')',
      [i, b.c.x, b.c.y, b.c.z, b.d.x, b.d.y, b.d.z, b.len, ov._total, ov.diveSec, ov.spinSec, ov.outSec, ov.riseSec, b.hold || 0]
        .concat(n21 ? [1, 0, 0, 'tr', 0, 0, 0] : [])));
  } else {
    const wsb = { A, db, console: { log: m => logs.push(m), warn: m => logs.push('WARN ' + m) } };
    vm.createContext(wsb);
    vm.runInContext(writeSrc + '\n_writeCinemaPathTable(db);', wsb);
  }
  // The staged override is cleared BEFORE the read: otherwise a failed INSERT (0 rows) would leave the input object
  // in place and every P1 gate would pass against ITS OWN INPUT (caught 2026-10-06: a 28-vs-29 placeholder slip).
  const rowsWritten = (db.exec('SELECT COUNT(*) FROM cinema_path')[0] || { values: [[0]] }).values[0][0];
  A._cinemaPathEdit = null;
  const rsb = { A, console: { log: m => logs.push(m), warn: m => logs.push('WARN ' + m) }, Math };
  vm.createContext(rsb);
  vm.runInContext('var _cpeLoaded = false;\n' + readSrc + '\n_cpeLoadFromDb();', rsb);
  const cols = (db.exec('PRAGMA table_info(cinema_path)')[0] || { values: [] }).values.map(r => r[1]);
  db.close();
  return { restored: A._cinemaPathEdit, cols, logs, rowsWritten };
}

(async () => {
  if (!isEditedSrc || !writeSrc || !readSrc) {
    console.log('§WITNESS_CPE_CHECKBOX_SAVE_VERDICT INCONCLUSIVE — could not slice ' + [!isEditedSrc && '_isEdited', !writeSrc && '_writeCinemaPathTable', !readSrc && '_cpeLoadFromDb'].filter(Boolean).join(',') + '; nothing judged');
    process.exit(1);
  }
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const res = []; const G = (id, ok, detail) => { res.push({ id, ok }); console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + (detail ? ' — ' + detail : '')); };
  console.log('§CPE_CHECKBOX_SAVE_ROOT ' + ROOT);

  // D0 control
  const d0 = isEditedAfter(() => {});
  G('D0 untouched path is NOT dirty', d0 === false, 'edited=' + d0);
  // D1 each box alone
  const dirty = {};
  for (const k of BOOLS.filter(k => !['buildup', 'roomTitle', 'reveal'].includes(k)).concat(['buildup', 'roomTitle', 'reveal'])) {
    dirty[k] = isEditedAfter(s => { s[k] = true; });   // baseline: buildup OFF so the ONE-WAY `buildup ON => edited` rule cannot mask the box under test (vacuity guard)
    G('D1 only "' + k + '" changed -> dirty (Save enabled)', dirty[k] === true, 'edited=' + dirty[k]);
  }
  dirty.filmBounce = isEditedAfter(s => { s.filmBounce = false; });
  G('D1 only "filmBounce" changed -> dirty', dirty.filmBounce === true, 'edited=' + dirty.filmBounce);
  dirty.sunDate = isEditedAfter(s => { s.sunDate = '2026-03-21'; });
  G('D1 only "sunDate" changed -> dirty', dirty.sunDate === true, 'edited=' + dirty.sunDate);
  dirty.bakeRes = isEditedAfter(s => { s.bakeRes = '1920x1080@24'; });
  G('D1 only "bakeRes" changed -> dirty', dirty.bakeRes === true, 'edited=' + dirty.bakeRes);

  // P3 + P1: every box, ON and OFF (OFF is judged against an all-ON baseline so a stuck-ON column cannot pass)
  const allOn = {}; BOOLS.forEach(k => allOn[k] = true);
  const rtOn = roundTrip(SQL, JSON.parse(JSON.stringify(baseOv(Object.assign({}, allOn, { sunDate: '2026-03-21', bakeRes: '1920x1080@24', filmBounce: false })))));
  const rtOff = roundTrip(SQL, JSON.parse(JSON.stringify(baseOv({ filmBounce: true }))));
  const rtOffFromOn = rtOn; // placeholder to keep names clear
  for (const k of BOOLS) {
    G('P3 column exists for "' + k + '"', rtOn.cols.indexOf(COL[k]) !== -1, 'col=' + COL[k]);
    const on = rtOn.restored && rtOn.restored[k], off = rtOff.restored && rtOff.restored[k];
    G('P1 "' + k + '" ON survives save->reopen', on === true, 'restored=' + on);
    G('P1 "' + k + '" OFF survives save->reopen', off === false, 'restored=' + off);
  }
  for (const [k, want] of [['sunDate', '2026-03-21'], ['bakeRes', '1920x1080@24']]) {
    G('P3 column exists for "' + k + '"', rtOn.cols.indexOf(COL[k]) !== -1);
    G('P1 "' + k + '" survives', (rtOn.restored || {})[k] === want, 'restored=' + (rtOn.restored || {})[k]);
  }
  G('P3 column exists for "filmBounce"', rtOn.cols.indexOf('film_bounce') !== -1);
  G('P1 "filmBounce" OFF survives', (rtOn.restored || {}).filmBounce === false, 'restored=' + (rtOn.restored || {}).filmBounce);
  G('P1 "filmBounce" ON survives', (rtOff.restored || {}).filmBounce === true, 'restored=' + (rtOff.restored || {}).filmBounce);
  G('P0 writer inserted one row per band (not a silent 0-row table)', rtOn.rowsWritten === 2 && rtOff.rowsWritten === 2, 'rows=' + rtOn.rowsWritten + '/' + rtOff.rowsWritten);
  // vacuity guard: the ON round-trip must really have restored a path with the band count
  G('P0 path geometry intact through the round-trip', rtOn.restored && rtOn.restored.bands.length === 2 && rtOn.restored._total === 61, 'bands=' + (rtOn.restored && rtOn.restored.bands.length));

  // P2 old schemas
  for (const n of [14, 21]) {
    const r = roundTrip(SQL, JSON.parse(JSON.stringify(baseOv())), n);
    const g = r.restored || {};
    const newKeys = ['loadPath', 'visualPanel', 'audioPanel', 'escapeRoute', 'sunCompass', 'sunDate', 'bakeRes', 'filmBounce'];
    G('P2 legacy ' + n + '-col .db still loads its path', (g.bands || []).length === 2 && g._total === 61, 'bands=' + (g.bands || []).length +
      ' warn=' + r.logs.filter(l => /FAIL|WARN/.test(l)).length);
    G('P2 legacy ' + n + '-col .db leaves new keys undefined (defaults unchanged)', newKeys.every(k => g[k] === undefined), 'defined=' + newKeys.filter(k => g[k] !== undefined).join(',') + '|');
  }

  const fail = res.filter(x => !x.ok).length;
  const judged = res.length;
  console.log('§WITNESS_CPE_CHECKBOX_SAVE_VERDICT ' + (judged === 0 ? 'VACUOUS — nothing judged' : fail === 0 ? 'PASS' : 'FAIL') + ' gates=' + judged + ' pass=' + (judged - fail) + ' fail=' + fail);
  process.exit(fail === 0 && judged > 0 ? 0 : 1);
})().catch(e => { console.error('§WITNESS_CPE_CHECKBOX_SAVE_ERROR ' + (e && e.stack || e)); process.exit(2); });
