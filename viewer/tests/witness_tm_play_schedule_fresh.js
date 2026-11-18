#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-TM-PLAY-FRESH (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.31). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "a DB that carries a stale stored schedule plays its OLD grid while the Gantt shows the regenerated
// one" (§Q.30: the HHS film replayed its September grid; two stone stair landings hung from 0:01 to ~0:07.5).
// Node only. Part A reads the shipped source (order + one regen body + bake lock). Part B uses the real film DB when present
// (~/Downloads/HHS_Office_Federated_silent.db, or FILM_DB=...): the stale grid is detected, the stored grid shows the float (so this
// witness can see the defect), and the regenerated grid the picture is now built from does not. No film DB -> Part B INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const V = path.join(__dirname, '..');
let pass = 0, fail = 0, inc = 0;
const ok = (n, c, d) => { console.log('§W_TM_PLAY_FRESH ' + (c ? 'PASS' : 'FAIL') + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
const src = f => fs.readFileSync(path.join(V, f), 'utf8');
(async () => {
  // ── A: source ──
  const gb = src('tm_gantt_build.js'), la = src('tm_lifecycle_api.js');
  const iH = gb.indexOf('function _regenStaleScheduleNow('), iB = gb.indexOf('function buildTaskIndex(');
  const helper = gb.slice(iH, iB), bti = gb.slice(iB, gb.indexOf('function invalidateGanttModel'));
  ok('one regen body: the helper calls materializeZones, buildTaskIndex does not and calls the helper',
    iH > 0 && /materializeZones\(/.test(helper) && !/materializeZones\(/.test(bti) && /_regenStaleScheduleNow\(db, 'buildTaskIndex'\)/.test(bti));
  ok('the helper honours the bake lock and safeToRegen', /_tmEditLocked\(/.test(helper) && /safeToRegen/.test(helper));
  const iAct = la.indexOf('function _activateAsync('), iRg = la.indexOf("_regenStaleScheduleNow(app.db, 'activate')", iAct),
    iHas = la.indexOf('var _hasCachedPlaces', iAct), iAgree = la.indexOf('_schedOpsAgreementFail(app.db, _placeOps)', iAct), iInj = la.indexOf('TMS.injectGantt()', iAct);
  ok('activation regenerates BEFORE the cached play order, the kernel_ops check and injectGantt',
    iAct > 0 && iRg > iAct && iRg < iHas && iRg < iAgree && iRg < iInj, 'regen=' + iRg + ' cache=' + iHas + ' agree=' + iAgree + ' inject=' + iInj);
  const blk = la.slice(iRg, iHas);
  ok('a regen that ran drops the play order derived from the old schedule', /cacheDel\('gantt'\)/.test(blk) && /DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'/.test(blk));
  ok('activation logs §TM_PLAY_SCHEDULE_FRESH for stale and current schedules', (la.match(/§TM_PLAY_SCHEDULE_FRESH where=activate/g) || []).length >= 2);
  // ── B: the real film DB ──
  const FILM = process.env.FILM_DB || path.join(os.homedir(), 'Downloads', 'HHS_Office_Federated_silent.db');
  if (!fs.existsSync(FILM)) { console.log('§W_TM_PLAY_FRESH INCONCLUSIVE part B — no film DB at ' + FILM); inc++; }
  else {
    const ROOT = path.join(V, '..');
    const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
    const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
    const SA = require(path.join(V, 'schedule_author.js'));
    const gcv = +((/var _GANTT_CACHE_VERSION = (\d+);/.exec(src('tm_dash.js')) || [])[1] || 0);
    const db0 = new SQL.Database(new Uint8Array(fs.readFileSync(FILM)));
    const l = console.log; console.log = () => {}; const act = SA.activeSchedule(db0, { currentGenVersion: gcv }); console.log = l;
    ok('the film DB carries a stale, regenerable stored schedule (the path fires on it)', act && act.stale === true && act.safeToRegen === true,
      'id=' + (act && act.id) + ' genVersion=' + (act && act.genVersion) + ' current=' + gcv + ' safeToRegen=' + (act && act.safeToRegen));
    const LAND = ['1XzmebWuX4vubs_y_zqTop', '2dAUCOYzH9cAMxESLPrInF'];
    // stair assembly of a landing = IfcStair / IfcStairFlight sharing its element-name prefix (the IFC's own grouping, e.g. "...:576198")
    const q = (db, s, a) => { const st = db.prepare(s); st.bind(a || []); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; };
    const stairOf = (db, g) => { const n = q(db, 'SELECT element_name FROM elements_meta WHERE guid=?', [g])[0].element_name; const key = n.split(':').slice(0, 3).join(':');
      return q(db, "SELECT guid FROM elements_meta WHERE ifc_class IN ('IfcStair','IfcStairFlight') AND element_name LIKE ?", [key + '%']).map(r => r.guid); };
    const tStart = (db, g) => { const r = q(db, 'SELECT t.schedule_start s FROM task_elements te JOIN tasks t ON t.task_id=te.task_id WHERE te.guid=?', [g])[0]; return r ? Date.parse(r.s) : null; };
    const oldFloat = LAND.filter(g => { const st = stairOf(db0, g).map(x => tStart(db0, x)).filter(x => x != null); return st.length && tStart(db0, g) < Math.min.apply(null, st); });
    ok('the STORED grid shows the defect: landings start before their own stair (the witness can see it)', oldFloat.length === 2, 'landingsBeforeStair=' + oldFloat.length + '/2');
    // the regenerated grid, via the shared harness on a copy of the film DB
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtpf-')); fs.copyFileSync(FILM, path.join(tmp, 'HHS_Office_Federated_extracted.db'));
    process.env.BLD_DIR = tmp; process.env.DB_KIND = 'extracted';
    const F = require('./_gantt_edit_fixture.js');
    console.log = () => {}; const w = console.warn; console.warn = () => {}; let P; try { P = await F.playedChain('HHS_Office_Federated'); } finally { console.log = l; console.warn = w; }
    if (!P || !P.db) { console.log('§W_TM_PLAY_FRESH INCONCLUSIVE regenerated grid not built: ' + JSON.stringify(P).slice(0, 120)); inc++; }
    else {
      const now = SA.activeSchedule ? (console.log = () => {}, SA.activeSchedule(P.db, { currentGenVersion: gcv })) : null; console.log = l;
      ok('after the regen the schedule is current', now && now.stale === false, 'genVersion=' + (now && now.genVersion));
      const newFloat = LAND.filter(g => { const st = stairOf(P.db, g).map(x => P.play[x] && P.play[x].s).filter(x => x != null); return st.length && P.play[g] && P.play[g].s < Math.min.apply(null, st); });
      ok('the REGENERATED grid plays each landing after its own stair', newFloat.length === 0,
        LAND.map(g => g.slice(0, 6) + ' landing=' + ((P.play[g].s - Math.min.apply(null, Object.values(P.play).map(p => p.s))) / 864e5).toFixed(2) + 'd').join(' '));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('§W_TM_PLAY_FRESH_VERDICT pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + '  ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  process.exit(fail ? 1 : 0);
})();
