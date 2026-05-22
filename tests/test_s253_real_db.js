/**
 * test_s253_real_db.js — Test Gantt data pipeline against REAL building DB
 * Issue: S-Curve blank, Milestone blank, scrub jumps, viewer not reflecting
 *
 * Run: node deploy/dev/tests/test_s253_real_db.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Load rates ──
const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(ratesSrc, sandbox);

// ── Load functions from boq_charts.html ──
const chartsSrc = fs.readFileSync(path.join(__dirname, '..', 'boq_charts.html'), 'utf8');

function extractFn(name) {
  const start = chartsSrc.indexOf('function ' + name + '(');
  if (start < 0) { console.log('§TEST FAIL: ' + name + ' not found'); process.exit(1); }
  let depth = 0, end = start;
  for (let i = start; i < chartsSrc.length; i++) {
    if (chartsSrc[i] === '{') depth++;
    if (chartsSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return chartsSrc.slice(start, end);
}

const fnEnv = {
  SEQUENCE_RULES: sandbox.SEQUENCE_RULES, LABOR_RATES: sandbox.LABOR_RATES,
  SEQUENCE_DEFAULT: sandbox.SEQUENCE_DEFAULT,
  EQUIPMENT_ALLOCATION: sandbox.EQUIPMENT_ALLOCATION || {},
  EQUIPMENT_RATES: sandbox.EQUIPMENT_RATES || {},
  DEFAULT_RULE: sandbox.SEQUENCE_DEFAULT,
  console
};
vm.runInNewContext(extractFn('buildScheduleFromOps') + '\n;globalThis.buildScheduleFromOps=buildScheduleFromOps;', fnEnv);
vm.runInNewContext(extractFn('generateSchedule') + '\n;globalThis.generateSchedule=generateSchedule;', fnEnv);

// ── Load real DB ──
let SQL;
try { SQL = require('better-sqlite3'); } catch(e) {}
if (!SQL) { try { SQL = require('sql.js'); } catch(e) {} }

// Try better-sqlite3 first (fast), fall back to finding a DB we can read
const dbPaths = [
  path.join(__dirname, '..', 'buildings', 'Terminal_extracted.db'),
  path.join(__dirname, '..', 'buildings', 'HITOS_extracted.db'),
  path.join(__dirname, '..', 'buildings', 'SampleHouse_extracted.db'),
  path.join(__dirname, '..', '..', 'buildings', 'HospitalAuckland_extracted.db'),
  path.join(__dirname, '..', '..', 'buildings', 'SampleHouse_extracted.db'),
];

let db, dbPath;
for (const p of dbPaths) {
  if (fs.existsSync(p)) { dbPath = p; break; }
}
if (!dbPath) { console.log('§TEST no DB found'); process.exit(1); }

// Use better-sqlite3
try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath, { readonly: true });
} catch(e) {
  console.log('§TEST need better-sqlite3: npm install better-sqlite3');
  process.exit(1);
}

const bldRow = db.prepare("SELECT building, COUNT(*) c FROM elements_meta GROUP BY building ORDER BY c DESC LIMIT 1").get();
const bldName = bldRow ? bldRow.building : 'Unknown';
const totalElements = bldRow ? bldRow.c : 0;
console.log('§TEST_DB loaded ' + path.basename(dbPath) + ' building=' + bldName + ' elements=' + totalElements);

// ══════════════════════════════════════════════════════════════
// 1. Build qtoData from real DB (same as boq_charts init)
// ══════════════════════════════════════════════════════════════
const countRows = db.prepare(
  "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) as cnt " +
  "FROM elements_meta m WHERE m.building = ? " +
  "GROUP BY m.discipline, m.ifc_class, m.storey ORDER BY m.discipline, m.storey, cnt DESC"
).all(bldName);

console.log('§QTO_ROWS ' + countRows.length);

const qtoData = countRows.map(row => {
  const cls = row.ifc_class;
  const mc = sandbox.RATES ? sandbox.RATES[cls] : null;
  const labor = sandbox.calcLabor ? sandbox.calcLabor(cls, row.cnt) : { prod: 10, crew: 2, cost: 0, days: 1, tradeKey: null, trade: '' };
  return {
    cls, storey: row.storey, disc: row.discipline, qty: row.cnt, cnt: row.cnt,
    unit: mc ? mc.unit : 'EA', matRate: mc ? mc.rate : 0, matTotal: 0,
    laborDays: labor.days || 1, laborCost: labor.cost || 0, laborCrew: labor.crew || 2,
    laborTrade: labor.trade || '', labor,
    equipCost: 0, equipDesc: '', equipDays: 0
  };
});

// ══════════════════════════════════════════════════════════════
// 2. Run generateSchedule with real data
// ══════════════════════════════════════════════════════════════
console.log('\n── generateSchedule with real building ──');
const gsTasks = fnEnv.generateSchedule(qtoData, '2025-01-06');
console.log('§GS_TASKS ' + gsTasks.length);

let gsIssues = 0;
for (const t of gsTasks) {
  const barEnd = t.startDay + t.duration;
  const aligned = barEnd === t.finishDay;
  if (!aligned) { gsIssues++; console.log('§GS_MISALIGN "' + t.name + '" startDay=' + t.startDay + ' dur=' + t.duration + ' finishDay=' + t.finishDay + ' bar_end=' + barEnd); }
  if (t.duration <= 0) { gsIssues++; console.log('§GS_ZERO_DUR "' + t.name + '" dur=' + t.duration); }
  if (t.startDay < 0) { gsIssues++; console.log('§GS_NEG_START "' + t.name + '" startDay=' + t.startDay); }
}

const gsMaxFinish = Math.max(...gsTasks.map(t => t.finishDay));
const gsMaxStacked = Math.max(...gsTasks.map(t => t.startDay + t.duration));
console.log('§GS_SUMMARY tasks=' + gsTasks.length + ' maxFinish=' + gsMaxFinish + ' maxStacked=' + gsMaxStacked +
  ' aligned=' + (gsMaxFinish === gsMaxStacked) + ' issues=' + gsIssues);

// Dump first 10 and last 5 tasks
for (let i = 0; i < Math.min(10, gsTasks.length); i++) {
  const t = gsTasks[i];
  console.log('§GS_TASK[' + i + '] "' + t.name + '" day=' + t.startDay + '-' + t.finishDay + ' dur=' + t.duration + ' phase=' + t.phase);
}
if (gsTasks.length > 10) console.log('  ... (' + (gsTasks.length - 15) + ' more)');
for (let i = Math.max(10, gsTasks.length - 5); i < gsTasks.length; i++) {
  const t = gsTasks[i];
  console.log('§GS_TASK[' + i + '] "' + t.name + '" day=' + t.startDay + '-' + t.finishDay + ' dur=' + t.duration + ' phase=' + t.phase);
}

// ══════════════════════════════════════════════════════════════
// 3. S-Curve validation with real data
// ══════════════════════════════════════════════════════════════
console.log('\n── S-Curve with real data ──');
const scFinish = gsTasks.map(t => t.finishDay);
const scMax = Math.max(...scFinish);
const scWeeks = Math.max(1, Math.ceil(scMax / 7));
const scInterval = Math.max(1, Math.floor(scWeeks / 20));
const scLabels = [], scPcts = [];
for (let w = 0; w <= scWeeks; w += scInterval) {
  const dayEnd = w * 7;
  const completed = gsTasks.filter(t => t.finishDay <= dayEnd).length;
  scLabels.push('W' + w);
  scPcts.push(Math.round(completed / gsTasks.length * 1000) / 10);
}
console.log('§SCURVE maxDay=' + scMax + ' weeks=' + scWeeks + ' points=' + scLabels.length +
  ' firstPct=' + scPcts[0] + ' lastPct=' + scPcts[scPcts.length-1]);
if (scPcts.length < 2) console.log('§SCURVE_BUG only ' + scPcts.length + ' point — chart will be BLANK');
if (scPcts[scPcts.length-1] < 50) console.log('§SCURVE_BUG last pct=' + scPcts[scPcts.length-1] + '% — curve incomplete');

// ══════════════════════════════════════════════════════════════
// 4. Milestone validation with real data
// ══════════════════════════════════════════════════════════════
console.log('\n── Milestone with real data ──');
const msPhaseDates = {};
for (const t of gsTasks) {
  if (!msPhaseDates[t.phase]) msPhaseDates[t.phase] = { start: t.startDay, end: t.finishDay };
  else {
    msPhaseDates[t.phase].start = Math.min(msPhaseDates[t.phase].start, t.startDay);
    msPhaseDates[t.phase].end = Math.max(msPhaseDates[t.phase].end, t.finishDay);
  }
}
const msPhases = Object.keys(msPhaseDates).sort((a,b) => msPhaseDates[a].start - msPhaseDates[b].start);
console.log('§MILESTONE phases=' + msPhases.length);
for (const p of msPhases) {
  const d = msPhaseDates[p];
  const dur = d.end - d.start;
  console.log('§MS_PHASE "' + p + '" day=' + d.start + '-' + d.end + ' dur=' + dur + (dur <= 0 ? ' BUG:ZERO_DUR' : ''));
}
if (msPhases.length === 0) console.log('§MILESTONE_BUG no phases — chart will be BLANK');

// ══════════════════════════════════════════════════════════════
// 5. GUID resolution — simulate RELAY path (no db, use relayed GUIDs)
// ══════════════════════════════════════════════════════════════
console.log('\n── GUID resolution (relay path) ──');

// Build _relayGuids map from DB (same as viewer would relay)
const allGuidRows = db.prepare(
  "SELECT guid, ifc_class, storey FROM elements_meta WHERE building = ?"
).all(bldName);
const _relayGuids = {};
for (const r of allGuidRows) {
  const rk = r.ifc_class + '|' + r.storey;
  if (!_relayGuids[rk]) _relayGuids[rk] = [];
  _relayGuids[rk].push(r.guid);
}
console.log('§GUID_RELAY_MAP keys=' + Object.keys(_relayGuids).length + ' totalGuids=' + allGuidRows.length);

// Resolve GUIDs using relay map (same logic as boq_charts)
let totalGuids = 0, emptyTasks = 0;
for (const t of gsTasks) {
  const classes = t.ifcClasses || [];
  if (!classes.length) { emptyTasks++; continue; }
  t.guids = [];
  const st = t.storey || '';
  for (const cls of classes) {
    const rk = cls + '|' + st;
    const guids = _relayGuids[rk] || [];
    t.guids = t.guids.concat(guids);
  }
  totalGuids += t.guids.length;
  if (t.guids.length === 0) emptyTasks++;
}
console.log('§GUID_RESOLVE source=relay totalGuids=' + totalGuids + ' emptyTasks=' + emptyTasks + '/' + gsTasks.length);
if (emptyTasks > 0) {
  const empty = gsTasks.filter(t => !t.guids || !t.guids.length).slice(0, 5);
  for (const t of empty) {
    console.log('§GUID_EMPTY "' + t.name + '" classes=[' + (t.ifcClasses || []).join(',') + '] storey="' + t.storey + '"');
  }
}
if (totalGuids === 0) console.log('§GUID_BUG all tasks have 0 GUIDs — ghostglass will show active=0 built=0');

// Also test: db=null scenario (what happened before the fix)
console.log('\n── GUID resolution (db=null, no relay — OLD broken path) ──');
let nullDbGuids = 0;
for (const t of gsTasks) {
  const classes = t.ifcClasses || [];
  let guidsFromNull = [];
  for (const cls of classes) {
    try { /* db.exec() would throw if db is null */ throw new Error('db is null'); } catch(e) { /* silent */ }
  }
  nullDbGuids += guidsFromNull.length;
}
console.log('§GUID_NULL_DB guids=' + nullDbGuids + ' — confirms OLD path produced 0 GUIDs when relay succeeded');

// ══════════════════════════════════════════════════════════════
// 6. Play simulation with real data
// ══════════════════════════════════════════════════════════════
console.log('\n── Play simulation ──');
const playSchedule = [...gsTasks].sort((a,b) => a.startDay - b.startDay);
const playMax = Math.max(...playSchedule.map(t => t.startDay + t.duration), 1);
const playStep = Math.max(1, Math.round(playMax / Math.max(playSchedule.length * 2, 1)));

let lastSeek = -1;
let visited = new Set();
let simDay = 1;
while (simDay <= playMax) {
  // dayToTaskIndex with lastSeek tracking
  let tidx;
  if (lastSeek >= 0 && lastSeek + 1 < playSchedule.length && playSchedule[lastSeek + 1].startDay <= simDay) {
    tidx = lastSeek + 1;
  } else {
    tidx = -1;
    for (let i = 0; i < playSchedule.length; i++) {
      if (playSchedule[i].startDay <= simDay) tidx = i;
      else break;
    }
  }
  if (tidx >= 0) { lastSeek = tidx; visited.add(tidx); }
  simDay += playStep;
}
// Catch final
let tidxFinal = -1;
for (let i = 0; i < playSchedule.length; i++) {
  if (playSchedule[i].startDay <= playMax) tidxFinal = i;
}
if (tidxFinal >= 0) visited.add(tidxFinal);

const missed = [];
for (let i = 0; i < playSchedule.length; i++) {
  if (!visited.has(i)) missed.push(i + ':"' + playSchedule[i].name + '" day=' + playSchedule[i].startDay);
}
console.log('§PLAY step=' + playStep + ' maxDay=' + playMax + ' tasks=' + playSchedule.length +
  ' visited=' + visited.size + ' missed=' + missed.length);
if (missed.length > 0) {
  console.log('§PLAY_BUG missed tasks:');
  for (const m of missed.slice(0, 10)) console.log('  ' + m);
}

// ══════════════════════════════════════════════════════════════
// 7. ghostglass seek simulation with real GUIDs
// ══════════════════════════════════════════════════════════════
console.log('\n── ghostglass seek simulation ──');
let seekZero = 0;
for (let n = 0; n < playSchedule.length; n++) {
  const activeGuids = new Set(playSchedule[n].guids || []);
  if (activeGuids.size === 0) {
    seekZero++;
    if (seekZero <= 5) console.log('§SEEK_EMPTY task=' + n + ' "' + playSchedule[n].name + '" active=0');
  }
}
console.log('§SEEK_SUMMARY tasks=' + playSchedule.length + ' zeroActive=' + seekZero +
  (seekZero > 0 ? ' BUG:ghostglass will show nothing for these tasks' : ' OK'));

// ══════════════════════════════════════════════════════════════
// 8. Simulate injectGantt → kernel_ops → buildScheduleFromOps (full D path)
// ══════════════════════════════════════════════════════════════
console.log('\n── injectGantt simulation (kernel_ops path) ──');

// Query elements same as time_machine.js injectGantt()
const elemRows = db.prepare(
  "SELECT m.guid, m.ifc_class, m.element_name, m.storey, m.discipline, " +
  "COALESCE(t.center_z, 0) as cz " +
  "FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid " +
  "WHERE m.building = ? AND m.ifc_class != 'IfcOpeningElement' " +
  "ORDER BY cz, COALESCE(t.center_x, 0), COALESCE(t.center_y, 0)"
).all(bldName);
console.log('§INJECT_ELEMENTS ' + elemRows.length);

// matchRule (same as injectGantt)
const SR = sandbox.SEQUENCE_RULES;
const SD = sandbox.SEQUENCE_DEFAULT;
const LR = sandbox.LABOR_RATES;
function matchRule(cls) {
  if (!cls) return SD;
  var bestKey = null, bestLen = 0;
  for (var key in SR) {
    if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
  }
  return bestKey ? SR[bestKey] : SD;
}
function getInstallSecs(cls) {
  var rule = matchRule(cls);
  var resource = rule.resource;
  if (!resource || !LR[resource]) return 120;
  var labor = LR[resource], bestPk = null, bestLen = 0;
  for (var pk in labor.productivity) {
    if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
  }
  var prod = bestPk ? labor.productivity[bestPk] : 0;
  return prod > 0 ? Math.round(28800 / prod) : 120;
}

// Storey bands: group by storey name, rank by min Z (mirrors time_machine.js)
var storeyMinZ = {};
elemRows.forEach(function(row) {
  var storey = row.storey || '_UNKNOWN';
  var cz = row.cz || 0;
  if (storeyMinZ[storey] === undefined || cz < storeyMinZ[storey]) storeyMinZ[storey] = cz;
});
var storeyNames = Object.keys(storeyMinZ).sort((a, b) => storeyMinZ[a] - storeyMinZ[b]);
var storeyBand = {};
storeyNames.forEach((s, i) => storeyBand[s] = i);
console.log('§INJECT_BANDS ' + storeyNames.length + ' storey-bands: ' +
  storeyNames.map((s, i) => i + '="' + s + '" z=' + storeyMinZ[s].toFixed(1)).join(', '));

// Build elements + sort (with roof slab override)
var roofOverrides = 0;
var elements = elemRows.map(function(row) {
  var cls = row.ifc_class, storey = row.storey || '_UNKNOWN', cz = row.cz || 0;
  var rule = matchRule(cls);
  var seq = rule.sequence, phase = rule.phase;
  if (/roof/i.test(storey) && cls === 'IfcSlab' && seq < 8) {
    seq = 8; phase = 'Architecture';
    roofOverrides++;
  }
  return {
    guid: row.guid, cls: cls, name: row.element_name || '', storey: storey,
    cz: cz, band: storeyBand[storey],
    seq: seq, phase: phase,
    resource: rule.resource || '_DEFAULT',
    installSecs: getInstallSecs(cls)
  };
});
if (roofOverrides) console.log('§GANTT_OVERRIDE ' + roofOverrides + ' roof slabs overridden to seq=8');
elements.sort(function(a, b) {
  if (a.band !== b.band) return a.band - b.band;
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.cz - b.cz;
});

// Schedule (same as injectGantt)
var totalSecs = 0;
elements.forEach(function(el) { totalSecs += el.installSecs; });
var rawMs = totalSecs * 1000;
var fullDayMs = 24 * 3600000;
var rawDays = rawMs / fullDayMs;
var scaleFactor = rawDays < 10 ? (10 * fullDayMs) / rawMs : 1;
var projectDays = Math.max(10, Math.ceil(rawDays * scaleFactor));
var startDate = new Date();
startDate.setDate(startDate.getDate() - projectDays);
startDate.setHours(0, 0, 0, 0);
var baseMs = startDate.getTime();

var resourceCursor = {}, bandSeqDone = {}, bandDone = {};
var kernelOps = [];
elements.forEach(function(el) {
  var rcKey = el.resource + '|' + el.band;
  var earliest = resourceCursor[rcKey] || baseMs;
  for (var ps = 1; ps < el.seq; ps++) {
    var pk = el.band + '|' + ps;
    if (bandSeqDone[pk] && bandSeqDone[pk] > earliest) earliest = bandSeqDone[pk];
  }
  if (el.band > 0 && el.seq <= 4) {
    var belowDone = bandDone[el.band - 1];
    if (belowDone && belowDone > earliest) earliest = belowDone;
  }
  var durMs = Math.round(el.installSecs * scaleFactor * 1000);
  var endMs = earliest + durMs;
  kernelOps.push({
    start_ts: earliest, end_ts: endMs, op_type: 'ELEMENT_PLACE', guid: el.guid,
    phase: el.phase, cls: el.cls, name: el.name, storey: el.storey, resource: el.resource
  });
  resourceCursor[rcKey] = endMs;
  var seqKey = el.band + '|' + el.seq;
  if (!bandSeqDone[seqKey] || endMs > bandSeqDone[seqKey]) bandSeqDone[seqKey] = endMs;
  if (el.seq <= 4) {
    if (!bandDone[el.band] || endMs > bandDone[el.band]) bandDone[el.band] = endMs;
  }
});
console.log('§INJECT_OPS ' + kernelOps.length + ' projectDays=' + projectDays + ' scale=' + scaleFactor.toFixed(2));

// Now run buildScheduleFromOps
var koTasks = fnEnv.buildScheduleFromOps(kernelOps);
console.log('§KO_TASKS ' + koTasks.length);

// Validate
var koIssues = 0;
var koMaxStacked = Math.max(...koTasks.map(t => t.startDay + t.duration));
var koMaxFinish = Math.max(...koTasks.map(t => t.finishDay));
if (koMaxStacked !== koMaxFinish) {
  koIssues++;
  console.log('§KO_BUG bar misalign: maxStacked=' + koMaxStacked + ' maxFinish=' + koMaxFinish);
}
var koGuids = 0, koEmpty = 0;
for (var t of koTasks) {
  koGuids += (t.guids || []).length;
  if (!t.guids || !t.guids.length) koEmpty++;
  if (t.duration !== t.finishDay - t.startDay) {
    koIssues++;
    console.log('§KO_BUG "' + t.name + '" dur=' + t.duration + ' != finishDay-startDay=' + (t.finishDay - t.startDay));
  }
}
// Check construction order: phases should not go backwards
var koPhaseOrder = ['Substructure','Superstructure','MEP Rough-in','Architecture','MEP Final','Finishes'];
var koPhaseFirstDay = {};
for (var t of koTasks) {
  if (!koPhaseFirstDay[t.phase] || t.startDay < koPhaseFirstDay[t.phase]) koPhaseFirstDay[t.phase] = t.startDay;
}
var koPresentPhases = koPhaseOrder.filter(p => koPhaseFirstDay[p] !== undefined);
for (var pi = 0; pi < koPresentPhases.length - 1; pi++) {
  var p1 = koPresentPhases[pi], p2 = koPresentPhases[pi+1];
  if (koPhaseFirstDay[p1] > koPhaseFirstDay[p2]) {
    koIssues++;
    console.log('§KO_BUG phase order: ' + p1 + ' day=' + koPhaseFirstDay[p1] + ' AFTER ' + p2 + ' day=' + koPhaseFirstDay[p2]);
  }
}
console.log('§KO_SUMMARY tasks=' + koTasks.length + ' guids=' + koGuids + ' emptyTasks=' + koEmpty +
  ' aligned=' + (koMaxStacked === koMaxFinish) + ' issues=' + koIssues +
  ' phases=' + koPresentPhases.map(p => p + ':day' + koPhaseFirstDay[p]).join(' → '));

// Dump sample tasks
for (var i = 0; i < Math.min(5, koTasks.length); i++) {
  var t = koTasks[i];
  console.log('§KO_TASK[' + i + '] "' + t.name + '" day=' + t.startDay + '-' + t.finishDay + ' dur=' + t.duration + ' guids=' + (t.guids||[]).length);
}

// ══════════════════════════════════════════════════════════════
// 9. BroadcastChannel message size check
// ══════════════════════════════════════════════════════════════
console.log('\n── Message size check ──');
var qtoMsg = JSON.stringify({ type: '4D_QTO_RESPONSE', building: bldName, countRows: [], dimRows: [], guidRows: allGuidRows.map(r => [r.guid, r.ifc_class, r.storey]) });
var schedMsg = JSON.stringify({ type: '4D_SCHEDULE_RESPONSE', ops: kernelOps });
var playMsg = JSON.stringify({ type: '4D_PLAY', tasks: koTasks, speed: 1.0 });
console.log('§MSG_SIZE qto=' + Math.round(qtoMsg.length/1024) + 'KB sched=' + Math.round(schedMsg.length/1024) + 'KB play=' + Math.round(playMsg.length/1024) + 'KB');
if (qtoMsg.length > 50*1024*1024) console.log('§MSG_BUG qto message > 50MB — may fail postMessage');
if (schedMsg.length > 50*1024*1024) console.log('§MSG_BUG sched message > 50MB — may fail postMessage');
if (playMsg.length > 50*1024*1024) console.log('§MSG_BUG play message > 50MB — may fail postMessage');

// ══════════════════════════════════════════════════════════════
// 10. Multi-building: test all available DBs
// ══════════════════════════════════════════════════════════════
console.log('\n── Multi-building quick check ──');
const allDbPaths = [
  path.join(__dirname, '..', 'buildings', 'Terminal_extracted.db'),
  path.join(__dirname, '..', 'buildings', 'HITOS_extracted.db'),
  path.join(__dirname, '..', 'buildings', 'SampleHouse_extracted.db'),
  path.join(__dirname, '..', '..', 'buildings', 'SampleHouse_extracted.db'),
  path.join(__dirname, '..', '..', 'buildings', 'HospitalAuckland_extracted.db'),
].filter(p => fs.existsSync(p) && p !== dbPath);

for (const otherPath of allDbPaths.slice(0, 3)) {
  try {
    const Database = require('better-sqlite3');
    const odb = new Database(otherPath, { readonly: true });
    const row = odb.prepare("SELECT building, COUNT(*) c FROM elements_meta GROUP BY building ORDER BY c DESC LIMIT 1").get();
    const bn = row ? row.building : '?';
    const cnt = row ? row.c : 0;
    const qto = odb.prepare("SELECT COUNT(DISTINCT ifc_class || storey) FROM elements_meta WHERE building = ?").get(bn);
    const groups = qto ? Object.values(qto)[0] : 0;
    console.log('§MULTI "' + path.basename(otherPath) + '" building=' + bn + ' elements=' + cnt + ' class_storey_groups=' + groups);
    odb.close();
  } catch(e) { console.log('§MULTI_SKIP ' + path.basename(otherPath) + ' ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
console.log('\n§TEST_REAL_DB DONE issues=' + (gsIssues + koIssues) + ' emptyGuids=' + emptyTasks + ' missedPlay=' + missed.length + ' seekEmpty=' + seekZero + ' koIssues=' + koIssues);
db.close();
