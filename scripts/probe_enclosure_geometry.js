#!/usr/bin/env node
// probe_enclosure_geometry.js — ENCLOSURE BY RAY-CAST, not adjacency by tolerance band.
//
// ⚠ DO NOT REMOVE — SCOPE. USER RULING 2026-08-26: "anything that hangs within a well formed room
// is no issue." That is a CONTAINMENT question and it is computable. Everything this lane has used
// so far — bbox XY-overlap plus a Z band, "is anything below me", class whitelists — is proxy
// reasoning about ADJACENCY, and each proxy has been measured wrong (a pipe 'bearing' a wall; a
// 6.4m riser 'bearing' the whole building; 438 glazing panels as load-bearing). Read the log.
//
// THE GEOMETRY. From an element's centroid cast 6 axis rays (+X -X +Y -Y +Z -Z). A ray is BLOCKED
// if it hits another element's AABB (slab test). Enclosure = how many of the 6 are blocked.
//   6/6  fully enclosed — inside a closed volume. A ceiling-hung pipe in a room is HERE.
//   5/6  enclosed but for one opening (a doorway, a shaft) — still a formed room.
//   <=4  genuinely open — not in a room; a bearing question is the right question for it.
// No class names, no phase, no tolerance tuning. Slab-method ray/AABB is exact for AABBs.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const V = path.join(__dirname, '..', 'viewer');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const SupportSweep = require(path.join(V, 'support_sweep.js'));
const BLD = path.join(HOME, 'bim-ootb', 'buildings');
const CELL = 4;

function rules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

// exact ray/AABB slab test; ray from p along unit axis dir, returns nearest t>0 or Infinity
function hit(p, d, b) {
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = b[a * 2], hi = b[a * 2 + 1];
    if (d[a] === 0) { if (p[a] < lo || p[a] > hi) return Infinity; continue; }
    let ta = (lo - p[a]) / d[a], tb = (hi - p[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0 > 0 ? t0 : (t1 > 0 ? t1 : Infinity);
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const R = rules();
  for (const bld of (process.argv.slice(2).length ? process.argv.slice(2) : ['Duplex', 'HHS_Office_Federated'])) {
    const f = path.join(BLD, bld + '_extracted.db');
    if (!fs.existsSync(f)) { console.log('§ENC_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT })
      .map(e => Object.assign({}, e, { bz: e.base_z, tz: e.top_z }));
    db.close();

    const box = els.map(e => [e.x0, e.x1, e.y0, e.y1, e.bz, e.tz]);
    // XY grid so a ray only tests its own column of the model
    const grid = new Map();
    els.forEach((e, i) => {
      for (let a = Math.floor(e.x0 / CELL); a <= Math.floor(e.x1 / CELL); a++)
        for (let b = Math.floor(e.y0 / CELL); b <= Math.floor(e.y1 / CELL); b++) {
          const k = a + ',' + b; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
        }
    });
    const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const REACH = 12;                     // m — a room is not 12m to its wall in these buildings

    // which elements does the CONTACT GRAPH think are unsupported? (des = -1, the §14.2 population)
    const G = SupportSweep.contactGraph(els);
    const des = SupportSweep.designatedSupport(els, G);

    const encOf = new Array(els.length).fill(0);
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      const p = [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, (e.bz + e.tz) / 2];
      let blocked = 0;
      for (const d of DIRS) {
        // candidate columns along the ray's XY footprint
        const cand = new Set();
        for (let s = 0; s <= REACH; s += CELL / 2) {
          const k = Math.floor((p[0] + d[0] * s) / CELL) + ',' + Math.floor((p[1] + d[1] * s) / CELL);
          for (const j of (grid.get(k) || [])) cand.add(j);
        }
        let best = Infinity;
        for (const j of cand) { if (j === i) continue; const t = hit(p, d, box[j]); if (t < best) best = t; }
        if (best <= REACH) blocked++;
      }
      encOf[i] = blocked;
    }
    // §ENC_ON_FLOATING — the USER'S OWN RULE applied to the population that matters:
    // "anything that hangs within a well formed room is no issue". Run the real template schedule,
    // find what is unsupported on it, then ask of each whether it is enclosed.
    const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
    let floatIdx = [];
    {
      const db2 = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
      const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {};
      let res = null;
      try {
        res = SA.materializeZones(db2, R.SEQUENCE_RULES, { start: '2026-01-01',
          laborRates: R.LABOR_RATES, rates: R.RATES, nameOverrides: R.SEQUENCE_NAME_OVERRIDES,
          defaultRule: R.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift,
          template: T });
      } catch (e) {}
      console.log = _l; console.warn = _w;
      const sched = res && res.displaySchedule;
      if (sched) for (let i = 0; i < els.length; i++) {
        const list = G.contacts[i]; if (!list || !list.length) continue;
        const t = sched[els[i].guid]; if (!t) continue;
        let held = false;
        for (const j of list) { const sc = sched[els[j].guid];
          if (sc && sc.end - 1 <= t.start) { held = true; break; } }
        if (!held) floatIdx.push(i);
      }
      db2.close();
    }

    const hist = new Array(7).fill(0);
    encOf.forEach(v => hist[v]++);
    let unsupported = 0, unsupportedEnclosed = 0;
    for (let i = 0; i < els.length; i++) {
      if (des[i] >= 0) continue;
      unsupported++;
      if (encOf[i] >= 5) unsupportedEnclosed++;
    }
    console.log('§ENC ' + bld + ' n=' + els.length +
      ' blockedRays 0..6 = [' + hist.join(', ') + ']  fullyEnclosed(6/6)=' + hist[6] +
      ' (' + (100 * hist[6] / els.length).toFixed(1) + '%)');
    let fEnc = 0; floatIdx.forEach(i => { if (encOf[i] >= 5) fEnc++; });
    console.log('   §ENC_ON_FLOATING unsupported on the TEMPLATE schedule=' + floatIdx.length +
      '  ENCLOSED (>=5/6 rays — hanging in a formed room, USER RULING: no issue)=' + fEnc +
      '  GENUINELY OPEN=' + (floatIdx.length - fEnc));
    console.log('   §ENC_VERDICT judge says UNSUPPORTED (des=-1): ' + unsupported +
      ' — of those, ' + unsupportedEnclosed + ' are ENCLOSED (>=5/6 rays blocked), i.e. hanging ' +
      'inside a formed room and not an issue at all. Genuinely open: ' + (unsupported - unsupportedEnclosed));
  }
})().catch(e => { console.error('§ENC_ERROR ' + (e && e.stack || e)); process.exit(2); });
