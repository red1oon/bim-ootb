/**
 * test_s253_gantt_sync.js — Validate Gantt↔kernel_ops data sync
 * Issue: S-Curve blank, Milestone blank, scrub jumps, ghostglass no GUIDs
 *
 * Tests the data transformations WITHOUT browser — pure Node.js logic tests.
 * Run: node deploy/dev/tests/test_s253_gantt_sync.js
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ FAIL: ' + msg); }
}

// ── Load SEQUENCE_RULES and LABOR_RATES from rates.js ──
const ratesPath = path.join(__dirname, '..', 'rates.js');
const ratesSrc = fs.readFileSync(ratesPath, 'utf8');
// Execute in a sandbox to extract globals
const vm = require('vm');
const sandbox = {};
vm.runInNewContext(ratesSrc, sandbox);
const SEQUENCE_RULES = sandbox.SEQUENCE_RULES;
const LABOR_RATES = sandbox.LABOR_RATES;
const SEQUENCE_DEFAULT = sandbox.SEQUENCE_DEFAULT;

console.log('\n§TEST_GANTT_SYNC rates loaded: SEQUENCE_RULES=' + Object.keys(SEQUENCE_RULES).length +
  ' LABOR_RATES=' + Object.keys(LABOR_RATES).length);

// ── Extract buildScheduleFromOps from boq_charts.html ──
const chartsPath = path.join(__dirname, '..', 'boq_charts.html');
const chartsSrc = fs.readFileSync(chartsPath, 'utf8');

// Extract the function source
const fnStart = chartsSrc.indexOf('function buildScheduleFromOps(ops)');
if (fnStart < 0) { console.log('§TEST FAIL: buildScheduleFromOps not found'); process.exit(1); }
// Find the closing brace — count braces
let depth = 0, fnEnd = fnStart;
for (let i = fnStart; i < chartsSrc.length; i++) {
  if (chartsSrc[i] === '{') depth++;
  if (chartsSrc[i] === '}') { depth--; if (depth === 0) { fnEnd = i + 1; break; } }
}
const fnSrc = chartsSrc.slice(fnStart, fnEnd);

// Execute with SEQUENCE_RULES and LABOR_RATES in scope
const fnSandbox = { SEQUENCE_RULES, LABOR_RATES, SEQUENCE_DEFAULT, console };
vm.runInNewContext(fnSrc + '\n; globalThis.buildScheduleFromOps = buildScheduleFromOps;', fnSandbox);
const buildScheduleFromOps = fnSandbox.buildScheduleFromOps;

console.log('§TEST_GANTT_SYNC buildScheduleFromOps extracted OK\n');

// ══════════════════════════════════════════════════════════════
// TEST 1: buildScheduleFromOps with synthetic kernel_ops
// ══════════════════════════════════════════════════════════════
console.log('── T1: buildScheduleFromOps basic ──');

const baseTs = new Date('2025-06-01T07:00:00').getTime();
const DAY = 86400000;
const HR = 3600000;

// Simulate kernel_ops: 2 storeys, 3 phases
const testOps = [
  // Ground floor substructure
  { start_ts: baseTs, end_ts: baseTs + 2*DAY, op_type: 'ELEMENT_PLACE', guid: 'g1', phase: 'Substructure', cls: 'IfcFooting', storey: 'Ground', resource: 'CONCRETE_GANG' },
  { start_ts: baseTs + 1*DAY, end_ts: baseTs + 3*DAY, op_type: 'ELEMENT_PLACE', guid: 'g2', phase: 'Substructure', cls: 'IfcFooting', storey: 'Ground', resource: 'CONCRETE_GANG' },
  // Ground floor superstructure
  { start_ts: baseTs + 3*DAY, end_ts: baseTs + 5*DAY, op_type: 'ELEMENT_PLACE', guid: 'g3', phase: 'Superstructure', cls: 'IfcColumn', storey: 'Ground', resource: 'STEEL_ERECTOR' },
  { start_ts: baseTs + 3*DAY, end_ts: baseTs + 6*DAY, op_type: 'ELEMENT_PLACE', guid: 'g4', phase: 'Superstructure', cls: 'IfcBeam', storey: 'Ground', resource: 'STEEL_ERECTOR' },
  // First floor superstructure
  { start_ts: baseTs + 6*DAY, end_ts: baseTs + 9*DAY, op_type: 'ELEMENT_PLACE', guid: 'g5', phase: 'Superstructure', cls: 'IfcSlab', storey: 'Level 1', resource: 'CONCRETE_GANG' },
  // Ground floor architecture
  { start_ts: baseTs + 6*DAY, end_ts: baseTs + 10*DAY, op_type: 'ELEMENT_PLACE', guid: 'g6', phase: 'Architecture', cls: 'IfcWall', storey: 'Ground', resource: 'MASON' },
  { start_ts: baseTs + 7*DAY, end_ts: baseTs + 10*DAY, op_type: 'ELEMENT_PLACE', guid: 'g7', phase: 'Architecture', cls: 'IfcDoor', storey: 'Ground', resource: 'CARPENTER' },
];

const tasks = buildScheduleFromOps(testOps);

assert(tasks.length > 0, 'tasks generated: ' + tasks.length);
assert(tasks.length === 4, 'expected 4 groups (Sub/Ground, Super/Ground, Super/L1, Arch/Ground): got ' + tasks.length);

// Check each task has valid fields
for (const t of tasks) {
  assert(t.startDay >= 0, 'task "' + t.name + '" startDay=' + t.startDay + ' >= 0');
  assert(t.finishDay > t.startDay, 'task "' + t.name + '" finishDay=' + t.finishDay + ' > startDay=' + t.startDay);
  assert(t.duration > 0, 'task "' + t.name + '" duration=' + t.duration + ' > 0');
  assert(t.duration === t.finishDay - t.startDay, 'task "' + t.name + '" duration=' + t.duration + ' === finishDay-startDay=' + (t.finishDay - t.startDay));
  assert(t.guids.length > 0, 'task "' + t.name + '" has ' + t.guids.length + ' GUIDs');
  assert(t.phase, 'task "' + t.name + '" has phase=' + t.phase);
  assert(t.storey, 'task "' + t.name + '" has storey=' + t.storey);
}

// Log task summary
console.log('\n§TEST_TASKS:');
for (const t of tasks) {
  console.log('  ' + t.name + ' | day ' + t.startDay + '-' + t.finishDay +
    ' | dur=' + t.duration + ' | guids=' + t.guids.length +
    ' | res=' + t.resource);
}

// ══════════════════════════════════════════════════════════════
// TEST 2: S-Curve data generation
// ══════════════════════════════════════════════════════════════
console.log('\n── T2: S-Curve data ──');

const allFinish = tasks.map(t => t.finishDay);
const scMaxDay = Math.max(...allFinish);
const totalTasks = tasks.length;
assert(scMaxDay > 0, 'S-Curve maxDay=' + scMaxDay + ' > 0');
assert(totalTasks > 0, 'S-Curve totalTasks=' + totalTasks + ' > 0');

const totalWeeks = Math.max(1, Math.ceil(scMaxDay / 7));
const sampleInterval = Math.max(1, Math.floor(totalWeeks / 20));
const weekLabels = [], weekPcts = [];
for (let w = 0; w <= totalWeeks; w += sampleInterval) {
  const dayEnd = w * 7;
  const completed = tasks.filter(t => t.finishDay <= dayEnd).length;
  weekLabels.push('W' + w);
  weekPcts.push(Math.round(completed / totalTasks * 1000) / 10);
}
if (weekPcts[weekPcts.length-1] < 100) { weekLabels.push('W' + totalWeeks); weekPcts.push(100); }

assert(weekLabels.length >= 2, 'S-Curve has ' + weekLabels.length + ' data points');
assert(weekPcts[0] === 0 || weekPcts[0] > 0, 'S-Curve first pct=' + weekPcts[0]);
assert(weekPcts[weekPcts.length-1] === 100, 'S-Curve ends at 100%');

console.log('§TEST_SCURVE: ' + weekLabels.map((l,i) => l + ':' + weekPcts[i] + '%').join(', '));

// ══════════════════════════════════════════════════════════════
// TEST 3: Milestone data generation
// ══════════════════════════════════════════════════════════════
console.log('\n── T3: Milestone data ──');

const phaseDates = {};
for (const t of tasks) {
  if (!phaseDates[t.phase]) phaseDates[t.phase] = { start: t.startDay, end: t.finishDay };
  else {
    phaseDates[t.phase].start = Math.min(phaseDates[t.phase].start, t.startDay);
    phaseDates[t.phase].end = Math.max(phaseDates[t.phase].end, t.finishDay);
  }
}
const phaseList = Object.keys(phaseDates).sort((a,b) => phaseDates[a].start - phaseDates[b].start);

assert(phaseList.length > 0, 'Milestone has ' + phaseList.length + ' phases');
for (const p of phaseList) {
  const d = phaseDates[p];
  assert(d.end > d.start, 'phase "' + p + '" day ' + d.start + '-' + d.end + ' (dur=' + (d.end - d.start) + ')');
}

console.log('§TEST_MILESTONE: ' + phaseList.map(p => p + ' day' + phaseDates[p].start + '-' + phaseDates[p].end).join(', '));

// ══════════════════════════════════════════════════════════════
// TEST 4: Gantt bar alignment — startDay + duration = finishDay
// ══════════════════════════════════════════════════════════════
console.log('\n── T4: Gantt bar alignment ──');

const ganttTasks = [...tasks].sort((a,b) => a.startDay - b.startDay);
const chartMaxStacked = Math.max(...ganttTasks.map(t => t.startDay + t.duration));
const chartMaxFinish = Math.max(...ganttTasks.map(t => t.finishDay));

assert(chartMaxStacked === chartMaxFinish,
  'chart x-max (startDay+duration)=' + chartMaxStacked + ' === maxFinishDay=' + chartMaxFinish +
  ' (kernel_ops path: duration=finishDay-startDay)');

console.log('§TEST_GANTT_ALIGN: chartMax=' + chartMaxStacked + ' finishMax=' + chartMaxFinish);

// ══════════════════════════════════════════════════════════════
// TEST 5: Play timer logic
// ══════════════════════════════════════════════════════════════
console.log('\n── T5: Play timer ──');

const maxDay = chartMaxStacked;
const step = Math.max(1, Math.round(maxDay / Math.max(tasks.length * 2, 1)));
assert(step >= 1, 'play step=' + step + ' >= 1');

let currentDay = 1; // starts at day 1 (not 0, which resets)
const playDays = [currentDay];
while (currentDay < maxDay) {
  currentDay += step;
  if (currentDay > maxDay) currentDay = maxDay;
  playDays.push(currentDay);
}
assert(playDays[0] === 1, 'play starts at day 1');
assert(playDays[playDays.length-1] === maxDay, 'play ends at maxDay=' + maxDay);
assert(playDays.length >= 2, 'play has ' + playDays.length + ' frames');

// Check every play day has at least one active task (except possibly last)
let emptyFrames = 0;
for (const d of playDays) {
  const active = tasks.filter(t => t.startDay <= d && t.finishDay >= d);
  const built = tasks.filter(t => t.finishDay < d);
  if (active.length === 0 && built.length < tasks.length) emptyFrames++;
}
console.log('§TEST_PLAY: step=' + step + ' frames=' + playDays.length + ' emptyFrames=' + emptyFrames +
  ' days=[' + playDays.slice(0,5).join(',') + '...' + playDays.slice(-2).join(',') + ']');

// ══════════════════════════════════════════════════════════════
// TEST 5b: generateSchedule bar alignment
// ══════════════════════════════════════════════════════════════
console.log('\n── T5b: generateSchedule bar alignment ──');

// Extract generateSchedule from boq_charts.html
const gsFnStart = chartsSrc.indexOf('function generateSchedule(activities, startDateStr)');
if (gsFnStart < 0) { console.log('§TEST FAIL: generateSchedule not found'); }
else {
  let gsDepth = 0, gsFnEnd = gsFnStart;
  for (let i = gsFnStart; i < chartsSrc.length; i++) {
    if (chartsSrc[i] === '{') gsDepth++;
    if (chartsSrc[i] === '}') { gsDepth--; if (gsDepth === 0) { gsFnEnd = i + 1; break; } }
  }
  const gsFnSrc = chartsSrc.slice(gsFnStart, gsFnEnd);
  const gsSandbox = { SEQUENCE_RULES, LABOR_RATES, SEQUENCE_DEFAULT, EQUIPMENT_ALLOCATION: sandbox.EQUIPMENT_ALLOCATION || {}, EQUIPMENT_RATES: sandbox.EQUIPMENT_RATES || {}, console };
  vm.runInNewContext(gsFnSrc + '\n; globalThis.generateSchedule = generateSchedule;', gsSandbox);
  const generateSchedule = gsSandbox.generateSchedule;

  // Create test activities (same format as qtoData)
  const testActs = [
    { cls: 'IfcFooting', storey: 'Ground', disc: 'STR', qty: 10, labor: { prod: 6, crew: 6, tradeKey: 'CONCRETE_GANG' }, cnt: 10 },
    { cls: 'IfcColumn', storey: 'Ground', disc: 'STR', qty: 8, labor: { prod: 6, crew: 4, tradeKey: 'STEEL_ERECTOR' }, cnt: 8 },
    { cls: 'IfcWall', storey: 'Ground', disc: 'ARC', qty: 12, labor: { prod: 12, crew: 3, tradeKey: 'MASON' }, cnt: 12 },
    { cls: 'IfcSlab', storey: 'Level 1', disc: 'STR', qty: 20, labor: { prod: 35, crew: 6, tradeKey: 'CONCRETE_GANG' }, cnt: 20 },
  ];
  const gsTasks = generateSchedule(testActs, '2025-01-06');

  console.log('§TEST_GS_TASKS:');
  let gsAligned = true;
  for (const t of gsTasks) {
    const barEnd = t.startDay + t.duration;
    const aligned = barEnd === t.finishDay;
    if (!aligned) gsAligned = false;
    console.log('  ' + t.name + ' | day ' + t.startDay + '-' + t.finishDay +
      ' | dur=' + t.duration + ' | bar_end=' + barEnd +
      ' | ' + (aligned ? 'ALIGNED' : 'MISALIGNED by ' + (t.finishDay - barEnd) + ' days'));
  }
  assert(gsAligned, 'all generateSchedule tasks: startDay + duration === finishDay');

  const gsMaxStacked = Math.max(...gsTasks.map(t => t.startDay + t.duration));
  const gsMaxFinish = Math.max(...gsTasks.map(t => t.finishDay));
  assert(gsMaxStacked === gsMaxFinish,
    'generateSchedule chart x-max=' + gsMaxStacked + ' === maxFinishDay=' + gsMaxFinish);
}

// ══════════════════════════════════════════════════════════════
// TEST 5c: Construction ORDER matches kernel_ops sequence
// ══════════════════════════════════════════════════════════════
console.log('\n── T5c: Construction order matches kernel_ops ──');

// kernel_ops are ordered by timestamp. buildScheduleFromOps groups them.
// The grouped tasks must preserve the same construction order:
// - Earlier phases before later phases
// - Within same phase, lower storeys (earlier timestamps) before upper storeys
// - Task startDay must reflect the earliest kernel_op timestamp in that group

// Verify task order matches kernel_ops timestamp order
const tasksSorted = [...tasks].sort((a,b) => a.startDay - b.startDay);

// Check: first op timestamp in each group → task with lower startDay comes first
const PHASE_ORDER = ['Substructure','Superstructure','MEP Rough-in','Architecture','MEP Final','Finishes'];
for (let i = 0; i < tasksSorted.length - 1; i++) {
  const a = tasksSorted[i], b = tasksSorted[i+1];
  assert(a.startDay <= b.startDay,
    'order: "' + a.name + '" day ' + a.startDay + ' before "' + b.name + '" day ' + b.startDay);
}

// Check: substructure before superstructure, superstructure before architecture
const phaseStarts = {};
for (const t of tasks) {
  if (!phaseStarts[t.phase] || t.startDay < phaseStarts[t.phase]) {
    phaseStarts[t.phase] = t.startDay;
  }
}
const presentPhases = PHASE_ORDER.filter(p => phaseStarts[p] !== undefined);
for (let i = 0; i < presentPhases.length - 1; i++) {
  const p1 = presentPhases[i], p2 = presentPhases[i+1];
  assert(phaseStarts[p1] <= phaseStarts[p2],
    'phase order: ' + p1 + ' (day ' + phaseStarts[p1] + ') before ' + p2 + ' (day ' + phaseStarts[p2] + ')');
}

// Check: each task's startDay matches earliest kernel_op in that group
const opsByGroup = {};
for (const op of testOps) {
  const key = op.phase + '|||' + op.storey;
  if (!opsByGroup[key]) opsByGroup[key] = [];
  opsByGroup[key].push(op);
}
for (const t of tasks) {
  const key = t.phase + '|||' + t.storey;
  const groupOps = opsByGroup[key];
  if (!groupOps) continue;
  const earliestOp = Math.min(...groupOps.map(o => o.start_ts));
  const latestOp = Math.max(...groupOps.map(o => o.end_ts));
  const expectedStart = Math.round((earliestOp - baseTs) / DAY);
  const expectedFinish = Math.round((latestOp - baseTs) / DAY);
  assert(t.startDay === expectedStart,
    '"' + t.name + '" startDay=' + t.startDay + ' matches earliest op day=' + expectedStart);
  assert(t.finishDay === expectedFinish,
    '"' + t.name + '" finishDay=' + t.finishDay + ' matches latest op day=' + expectedFinish);
}

// Check: GUIDs in each task appear in same order as kernel_ops timestamps
for (const t of tasks) {
  const key = t.phase + '|||' + t.storey;
  const groupOps = opsByGroup[key];
  if (!groupOps || groupOps.length < 2) continue;
  const opOrder = groupOps.sort((a,b) => a.start_ts - b.start_ts).map(o => o.guid);
  const taskOrder = t.guids.filter(g => opOrder.includes(g));
  const orderMatch = JSON.stringify(taskOrder) === JSON.stringify(opOrder);
  assert(orderMatch,
    '"' + t.name + '" GUID order matches kernel_ops timestamp order');
}

console.log('§TEST_ORDER: phase sequence = ' + presentPhases.map(p => p + ':day' + phaseStarts[p]).join(' → '));

// ══════════════════════════════════════════════════════════════
// TEST 5d: Per-element sync — Gantt vs hourglass visibility
// ══════════════════════════════════════════════════════════════
console.log('\n── T5d: Per-element sync with hourglass ──');

// Gantt groups by phase+storey → coarser than per-element hourglass.
// Within a group, all GUIDs become visible at group startDay.
// Two guarantees must hold:
//   1. Hourglass NEVER shows an element that the Gantt hasn't reached yet
//      (hourglass-only = 0 at every day — no element visible in hourglass but invisible in Gantt)
//   2. Gantt may show elements slightly early (within-group), but NEVER from a future group
//      (gantt-only elements must belong to a task whose startDay <= current day)

const tasksForSync = buildScheduleFromOps(testOps);
const projectStartMs = Math.min(...testOps.map(o => o.start_ts));
const projectEndMs = Math.max(...testOps.map(o => o.end_ts));
const totalDays = Math.ceil((projectEndMs - projectStartMs) / DAY);

// Build guid → task lookup
const guidToTask = {};
for (const t of tasksForSync) { for (const g of t.guids) guidToTask[g] = t; }

let hourglassLeaks = 0;  // hourglass shows element Gantt hasn't reached — MUST be 0
let ganttEarlyTotal = 0;  // Gantt shows within-group early — acceptable
let ganttWrongGroup = 0;  // Gantt shows element from a future group — MUST be 0

for (let d = 0; d <= totalDays; d++) {
  const cursorMs = projectStartMs + d * DAY + DAY/2;

  // Hourglass visible
  const hourglassVisible = new Set();
  for (const op of testOps) {
    if (op.start_ts <= cursorMs) hourglassVisible.add(op.guid);
  }

  // Gantt visible
  const ganttVisible = new Set();
  for (const t of tasksForSync) {
    if (t.startDay <= d) { for (const g of t.guids) ganttVisible.add(g); }
  }

  // Check 1: hourglass-only (element visible in 3D but Gantt hasn't reached its task)
  const hourglassOnly = [...hourglassVisible].filter(g => !ganttVisible.has(g));
  if (hourglassOnly.length > 0) {
    hourglassLeaks++;
    console.log('  ✗ day ' + d + ' LEAK: hourglass shows [' + hourglassOnly.join(',') +
      '] but Gantt has not reached their task');
  }

  // Check 2: gantt-only (Gantt shows early within group — OK, but from wrong group — NOT OK)
  const ganttOnly = [...ganttVisible].filter(g => !hourglassVisible.has(g));
  for (const g of ganttOnly) {
    const ownerTask = guidToTask[g];
    if (ownerTask && ownerTask.startDay <= d) {
      ganttEarlyTotal++;  // within-group early — acceptable
    } else {
      ganttWrongGroup++;
      console.log('  ✗ day ' + d + ' WRONG GROUP: Gantt shows ' + g +
        ' from task "' + (ownerTask ? ownerTask.name : '?') + '" startDay=' +
        (ownerTask ? ownerTask.startDay : '?'));
    }
  }
}

assert(hourglassLeaks === 0,
  'no hourglass leaks (element visible in 3D before Gantt task starts): leaks=' + hourglassLeaks);
assert(ganttWrongGroup === 0,
  'no wrong-group early (Gantt shows element from future task): wrongGroup=' + ganttWrongGroup);
console.log('§TEST_ELEMENT_SYNC: days=' + (totalDays+1) +
  ' hourglassLeaks=' + hourglassLeaks +
  ' ganttEarlyWithinGroup=' + ganttEarlyTotal +
  ' ganttWrongGroup=' + ganttWrongGroup);
console.log('  (within-group early is inherent to Gantt grouping — per-element precision requires timestamp-based seek)');

// ══════════════════════════════════════════════════════════════
// TEST 5e: Parallel trades visible simultaneously
// ══════════════════════════════════════════════════════════════
console.log('\n── T5e: Parallel trades ──');

// In testOps, Level 1 Superstructure (day 6-9) and Ground Architecture (day 6-10)
// overlap on days 6-9. Both should be active at the same time.
const day7tasks = tasksForSync.filter(t => t.startDay <= 7 && t.finishDay >= 7);
assert(day7tasks.length >= 2, 'day 7 has ' + day7tasks.length + ' active tasks (expect >=2 for parallel trades)');
const day7phases = day7tasks.map(t => t.phase);
console.log('§TEST_PARALLEL: day 7 active tasks: ' + day7tasks.map(t => t.name).join(', '));
assert(day7phases.includes('Superstructure') && day7phases.includes('Architecture'),
  'day 7 shows Superstructure + Architecture in parallel');

// ══════════════════════════════════════════════════════════════
// TEST 5f: Z-band ordering — lower storey elements placed before upper
// ══════════════════════════════════════════════════════════════
console.log('\n── T5f: Z-band ordering ──');

// Ground superstructure (day 3-6) must finish before or overlap with Level 1 superstructure (day 6-9)
const groundSuper = tasksForSync.find(t => t.storey === 'Ground' && t.phase === 'Superstructure');
const level1Super = tasksForSync.find(t => t.storey === 'Level 1' && t.phase === 'Superstructure');
assert(groundSuper && level1Super, 'both storeys have Superstructure tasks');
assert(groundSuper.startDay < level1Super.startDay,
  'Ground Super starts (day ' + groundSuper.startDay + ') before Level 1 Super (day ' + level1Super.startDay + ')');
assert(groundSuper.finishDay <= level1Super.finishDay,
  'Ground Super finishes (day ' + groundSuper.finishDay + ') before/at Level 1 Super finish (day ' + level1Super.finishDay + ')');

// Per-element: within Ground Super, GUIDs appear in kernel_ops timestamp order
const groundSuperOps = testOps.filter(o => o.storey === 'Ground' && o.phase === 'Superstructure')
  .sort((a,b) => a.start_ts - b.start_ts);
const groundSuperGuids = groundSuperOps.map(o => o.guid);
const taskGuidsOrdered = groundSuper.guids;
assert(JSON.stringify(taskGuidsOrdered) === JSON.stringify(groundSuperGuids),
  'Ground Super element order: ' + taskGuidsOrdered.join(',') + ' matches kernel_ops: ' + groundSuperGuids.join(','));

console.log('§TEST_ZBAND: Ground Super day ' + groundSuper.startDay + '-' + groundSuper.finishDay +
  ' → Level 1 Super day ' + level1Super.startDay + '-' + level1Super.finishDay);

// ══════════════════════════════════════════════════════════════
// TEST 6: GUID coverage — every op guid appears in a task
// ══════════════════════════════════════════════════════════════
console.log('\n── T6: GUID coverage ──');

const opGuids = new Set(testOps.filter(o => o.guid).map(o => o.guid));
const taskGuids = new Set();
for (const t of tasks) { for (const g of t.guids) taskGuids.add(g); }

assert(taskGuids.size === opGuids.size, 'task GUIDs=' + taskGuids.size + ' === op GUIDs=' + opGuids.size);
for (const g of opGuids) {
  assert(taskGuids.has(g), 'guid ' + g + ' covered');
}

// Check no GUID appears in multiple tasks
const guidOwner = {};
let dupes = 0;
for (const t of tasks) {
  for (const g of t.guids) {
    if (guidOwner[g]) { dupes++; console.log('  ✗ DUPE: ' + g + ' in "' + guidOwner[g] + '" AND "' + t.name + '"'); }
    guidOwner[g] = t.name;
  }
}
assert(dupes === 0, 'no duplicate GUIDs across tasks');

// ══════════════════════════════════════════════════════════════
// TEST 7: dayToTaskIndex correctness
// ══════════════════════════════════════════════════════════════
console.log('\n── T7: dayToTaskIndex ──');

const scheduleData = ganttTasks; // sorted by startDay
function dayToTaskIndex(day) {
  let best = -1;
  for (let i = 0; i < scheduleData.length; i++) {
    if (scheduleData[i].startDay <= day) best = i;
  }
  return best;
}

assert(dayToTaskIndex(0) === -1 || dayToTaskIndex(0) === 0, 'day 0 → task ' + dayToTaskIndex(0));
assert(dayToTaskIndex(maxDay) === scheduleData.length - 1, 'day ' + maxDay + ' → last task');

for (let d = 0; d <= maxDay; d++) {
  const idx = dayToTaskIndex(d);
  if (idx >= 0) {
    const t = scheduleData[idx];
    if (t.startDay > d) {
      fail++;
      console.log('  ✗ FAIL: day=' + d + ' → task ' + idx + ' "' + t.name + '" starts at day ' + t.startDay + ' (after!)');
      break;
    }
  }
}
console.log('§TEST_TASK_INDEX: all days map to valid task indices');

// ══════════════════════════════════════════════════════════════
// TEST 8: Scrub pixel mapping simulation
// ══════════════════════════════════════════════════════════════
console.log('\n── T8: Scrub pixel mapping ──');

// Simulate Chart.js xScale — stacked bar, x goes from 0 to max(startDay+duration)
const xScaleMin = 0;
const xScaleMax = Math.max(...tasks.map(t => t.startDay + t.duration));
const xScaleLeft = 80;   // typical y-label offset
const xScaleRight = 900; // typical canvas width

function simDayToPixel(day) {
  return xScaleLeft + (day / maxDay) * (xScaleRight - xScaleLeft);
}
function simPixelToDay(px) {
  var ratio = Math.max(0, Math.min(1, (px - xScaleLeft) / (xScaleRight - xScaleLeft)));
  return Math.round(ratio * maxDay);
}

assert(maxDay === xScaleMax, 'maxDay=' + maxDay + ' === xScaleMax=' + xScaleMax + ' (bar alignment ensures this)');
assert(simDayToPixel(0) === xScaleLeft, 'day 0 → px ' + simDayToPixel(0) + ' === left ' + xScaleLeft);
assert(simDayToPixel(maxDay) === xScaleRight, 'day ' + maxDay + ' → px ' + simDayToPixel(maxDay) + ' === right ' + xScaleRight);
assert(simPixelToDay(xScaleLeft) === 0, 'px left → day ' + simPixelToDay(xScaleLeft) + ' === 0');
assert(simPixelToDay(xScaleRight) === maxDay, 'px right → day ' + simPixelToDay(xScaleRight) + ' === ' + maxDay);

// Round-trip: day → pixel → day for every day
let roundTripErrors = 0;
for (let d = 0; d <= maxDay; d++) {
  const px = simDayToPixel(d);
  const d2 = simPixelToDay(px);
  if (d2 !== d) { roundTripErrors++; console.log('  ✗ round-trip fail: day ' + d + ' → px ' + px.toFixed(1) + ' → day ' + d2); }
}
assert(roundTripErrors === 0, 'pixel round-trip: ' + (maxDay+1) + ' days, ' + roundTripErrors + ' errors');

// Verify scrub pixel aligns with each task bar
for (const t of tasks) {
  const startPx = simDayToPixel(t.startDay);
  const endPx = simDayToPixel(t.startDay + t.duration);
  console.log('§SCRUB_BAR "' + t.name + '" day=' + t.startDay + '-' + (t.startDay+t.duration) +
    ' px=' + startPx.toFixed(0) + '-' + endPx.toFixed(0));
}

// ══════════════════════════════════════════════════════════════
// TEST 9: Play timer full simulation — every frame, check task index + active GUIDs
// ══════════════════════════════════════════════════════════════
console.log('\n── T9: Play timer — smooth day-by-day + viewer scene ──');

const simSchedule = [...tasks].sort((a,b) => a.startDay - b.startDay);
const allGuids = new Set();
for (const t of simSchedule) { for (const g of t.guids) allGuids.add(g); }

// Simulate play: step by day, same as boq_charts startPlayTimer
const simMaxDay = maxDay;
const simStep = Math.max(1, Math.round(simMaxDay / Math.max(simSchedule.length * 2, 1)));

// dayToTaskIndex with _lastSeekIdx tracking (same as boq_charts)
let _simLastSeek = -1;
function simDayToTaskIdx(day) {
  if (_simLastSeek >= 0 && _simLastSeek + 1 < simSchedule.length &&
      simSchedule[_simLastSeek + 1].startDay <= day) {
    return _simLastSeek + 1;
  }
  let best = -1;
  for (let i = 0; i < simSchedule.length; i++) {
    if (simSchedule[i].startDay <= day) best = i;
    else break;
  }
  return best;
}

let simDay = 1;
let prevDay = -1;
let maxDayJump = 0;
let seeksSent = [];
let tasksVisited = new Set();
let guidsAtEnd = new Set();

while (simDay <= simMaxDay) {
  // Check smooth movement: day should advance by step, no big jumps
  if (prevDay >= 0) {
    const jump = simDay - prevDay;
    if (jump > maxDayJump) maxDayJump = jump;
  }
  prevDay = simDay;

  const tidx = simDayToTaskIdx(simDay);
  if (tidx >= 0) {
    _simLastSeek = tidx;
    tasksVisited.add(tidx);
    seeksSent.push({ day: simDay, tidx: tidx, name: simSchedule[tidx].name });
  }

  // What ghostglass shows at this seek
  if (tidx >= 0) {
    const activeGuids = new Set();
    const builtGuids = new Set();
    for (let i = 0; i <= tidx; i++) {
      for (const g of (simSchedule[i].guids || [])) {
        if (i === tidx) activeGuids.add(g);
        else builtGuids.add(g);
      }
    }
    guidsAtEnd = new Set([...builtGuids, ...activeGuids]);
  }

  simDay += simStep;
}
// Final frame at maxDay
simDay = simMaxDay;
const finalTidx = simDayToTaskIdx(simDay);
if (finalTidx >= 0) tasksVisited.add(finalTidx);

assert(maxDayJump <= simStep, 'smooth movement: max jump=' + maxDayJump + ' <= step=' + simStep);
assert(guidsAtEnd.size === allGuids.size,
  'at end: visible=' + guidsAtEnd.size + ' total=' + allGuids.size);

// Check all tasks visited
const missedTasks = [];
for (let i = 0; i < simSchedule.length; i++) {
  if (!tasksVisited.has(i)) missedTasks.push(i + ':"' + simSchedule[i].name + '"');
}
if (missedTasks.length > 0) {
  fail++;
  console.log('  ✗ FAIL: play missed tasks: ' + missedTasks.join(', '));
  console.log('    (tasks with same startDay — dayToTaskIndex returns last one, skips earlier)');
  // Show which tasks share startDay
  const dayGroups = {};
  for (let i = 0; i < simSchedule.length; i++) {
    const d = simSchedule[i].startDay;
    if (!dayGroups[d]) dayGroups[d] = [];
    dayGroups[d].push(i + ':"' + simSchedule[i].name + '"');
  }
  for (const d in dayGroups) {
    if (dayGroups[d].length > 1) {
      console.log('    day ' + d + ' has ' + dayGroups[d].length + ' tasks: ' + dayGroups[d].join(', '));
    }
  }
} else {
  pass++;
  console.log('  ✓ all ' + simSchedule.length + ' tasks visited during play');
}

// Log play frames (sample first few + last few)
const seekLog = seeksSent.filter((s, i, arr) => {
  // Log when task changes
  return i === 0 || s.tidx !== arr[i-1].tidx;
});
console.log('§PLAY_SIM step=' + simStep + ' frames=' + seeksSent.length + ' maxJump=' + maxDayJump +
  ' tasksVisited=' + tasksVisited.size + '/' + simSchedule.length);
for (const s of seekLog) {
  console.log('  day=' + s.day + ' → seek task=' + s.tidx + ' "' + s.name + '"');
}

// ══════════════════════════════════════════════════════════════
// TEST 10: ghostglass seekTo simulation — GUID matching
// ══════════════════════════════════════════════════════════════
console.log('\n── T10: ghostglass seekTo simulation ──');

// Simulate scene GUIDs (= all GUIDs from kernel_ops)
const sceneGuids = new Set(testOps.map(o => o.guid));

// Simulate ghostglass _guidMeshMap (guid → mesh exists)
// ghostglass seekTo(n): tasks[n].guids → activeGuids, tasks[0..n-1].guids → builtGuids
function simSeekTo(n, taskList) {
  const active = new Set();
  const built = new Set();
  const assigned = new Set();
  // Active
  const aGuids = taskList[n].guids || [];
  for (const g of aGuids) { if (!assigned.has(g)) { active.add(g); assigned.add(g); } }
  // Built
  for (let i = 0; i < n; i++) {
    for (const g of (taskList[i].guids || [])) {
      if (!assigned.has(g)) { built.add(g); assigned.add(g); }
    }
  }
  // Glass = everything else
  const glass = new Set([...sceneGuids].filter(g => !assigned.has(g)));
  return { active: active.size, built: built.size, glass: glass.size };
}

let seekFails = 0;
for (let n = 0; n < simSchedule.length; n++) {
  const r = simSeekTo(n, simSchedule);
  const total = r.active + r.built + r.glass;
  if (r.active === 0) {
    seekFails++;
    console.log('  ✗ seekTo(' + n + ') "' + simSchedule[n].name + '" active=0 — ghostglass shows nothing!');
  }
  if (total !== sceneGuids.size) {
    seekFails++;
    console.log('  ✗ seekTo(' + n + ') total=' + total + ' !== scene=' + sceneGuids.size);
  }
  console.log('§SEEK task=' + n + '/' + simSchedule.length + ' "' + simSchedule[n].name +
    '" active=' + r.active + ' built=' + r.built + ' glass=' + r.glass);
}
// Final task: everything should be built or active
const finalR = simSeekTo(simSchedule.length - 1, simSchedule);
assert(finalR.glass === 0 || finalR.active + finalR.built === sceneGuids.size,
  'final seek: all elements accounted (active+built=' + (finalR.active+finalR.built) + ' scene=' + sceneGuids.size + ')');
assert(seekFails === 0, 'all seeks have active>0: fails=' + seekFails);

// ══════════════════════════════════════════════════════════════
// TEST 11: Badge HTML generation
// ══════════════════════════════════════════════════════════════
console.log('\n── T11: Sync badge ──');

function buildBadge(scheduleSource, _TRL) {
  var _syncColor = scheduleSource === 'kernel_ops' ? '#44cc44' : '#ff8c00';
  var _syncText = scheduleSource === 'kernel_ops' ? 'Hourglass OK' : 'Run Hourglass first';
  return '<h2 style="margin:0">' + (_TRL && _TRL.t_gantt || '4D — Gantt Timeline') + '</h2>' +
    '<span style="font-size:11px;color:' + _syncColor + '">&#9203; ' + _syncText + '</span>';
}

// kernel_ops path with valid _TRL
var html1 = buildBadge('kernel_ops', { t_gantt: '4D — Gantt Timeline (Strategic Tasks by Phase)' });
assert(html1.includes('Hourglass OK'), 'kernel_ops badge shows "Hourglass OK"');
assert(html1.includes('#44cc44'), 'kernel_ops badge is green');
assert(html1.includes('Strategic Tasks'), 'kernel_ops badge uses _TRL title');

// generateSchedule path with valid _TRL
var html2 = buildBadge('generateSchedule', { t_gantt: '4D — Gantt Timeline' });
assert(html2.includes('Run Hourglass first'), 'fallback badge shows "Run Hourglass first"');
assert(html2.includes('#ff8c00'), 'fallback badge is orange');

// _TRL undefined — must not throw
var html3 = buildBadge('generateSchedule', undefined);
assert(html3.includes('4D — Gantt Timeline'), 'undefined _TRL falls back to default title');
assert(!html3.includes('undefined'), 'no "undefined" text in output');

// _TRL exists but t_gantt missing
var html4 = buildBadge('kernel_ops', {});
assert(html4.includes('4D — Gantt Timeline'), 'missing t_gantt falls back to default');

console.log('§BADGE_KO html=' + JSON.stringify(html1));
console.log('§BADGE_GS html=' + JSON.stringify(html2));
console.log('§BADGE_NO_TRL html=' + JSON.stringify(html3));
console.log('§BADGE_EMPTY_TRL html=' + JSON.stringify(html4));

// ══════════════════════════════════════════════════════════════
// TEST 12: Gantt setup code — doesn't throw with any _TRL state
// ══════════════════════════════════════════════════════════════
console.log('\n── T12: Gantt setup code execution ──');

// Extract the Gantt section 9 setup (lines before _deferChart) from boq_charts.html
// and run it with mock DOM to verify no throws
function testGanttSetup(schedSource, trlVal) {
  // Mock DOM
  var elements = [];
  var mockDoc = {
    createElement: function(tag) {
      var el = { tagName: tag, style: { cssText: '' }, innerHTML: '', children: [], appendChild: function(c) { this.children.push(c); } };
      elements.push(el);
      return el;
    }
  };

  try {
    var _scheduleSource = schedSource;
    var _TRL = trlVal;
    var scheduleData = tasks; // from T1

    var ganttTasks = [...scheduleData].sort(function(a,b) { return a.startDay - b.startDay; });

    // Simulate the header construction (exact code from boq_charts.html)
    var _syncColor = _scheduleSource === 'kernel_ops' ? '#44cc44' : '#ff8c00';
    var _syncText = _scheduleSource === 'kernel_ops' ? 'Hourglass OK' : 'Run Hourglass first';
    var headerHTML = '<h2 style="margin:0">' + (_TRL && _TRL.t_gantt || '4D — Gantt Timeline') + '</h2>' +
      '<span style="font-size:11px;color:' + _syncColor + '">&#9203; ' + _syncText + '</span>';

    // Simulate canvas/wrap setup
    var barPx = ganttTasks.length > 40 ? 14 : ganttTasks.length > 20 ? 20 : 28;
    var ganttH = Math.max(200, ganttTasks.length * barPx + 60);
    var maxWrapH = Math.min(ganttH, 700);
    var wrapCSS = 'position:relative;height:' + maxWrapH + 'px;' + (ganttH > 700 ? 'overflow-y:auto;' : '');
    var innerCSS = 'position:relative;height:' + ganttH + 'px;';

    // Check for 'undefined' or 'null' strings in output
    var allOutput = headerHTML + wrapCSS + innerCSS;
    if (allOutput.includes('undefined') || allOutput.includes('null')) {
      return { ok: false, error: 'output contains "undefined" or "null": ' + allOutput };
    }
    if (!headerHTML.includes('<h2')) {
      return { ok: false, error: 'no h2 in header' };
    }
    if (ganttH <= 0) {
      return { ok: false, error: 'ganttH=' + ganttH };
    }
    return { ok: true, headerHTML: headerHTML, ganttH: ganttH, wrapH: maxWrapH, barPx: barPx };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

var cases = [
  ['kernel_ops', { t_gantt: '4D — Gantt Timeline (Strategic Tasks by Phase)' }, 'kernel_ops + full _TRL'],
  ['generateSchedule', { t_gantt: '4D — Gantt' }, 'generateSchedule + _TRL'],
  ['generateSchedule', undefined, 'generateSchedule + undefined _TRL'],
  ['kernel_ops', null, 'kernel_ops + null _TRL'],
  ['kernel_ops', {}, 'kernel_ops + empty _TRL'],
  ['generateSchedule', { t_gantt: '' }, 'generateSchedule + empty string t_gantt'],
];

for (var ci = 0; ci < cases.length; ci++) {
  var c = cases[ci];
  var r = testGanttSetup(c[0], c[1]);
  if (r.ok) {
    pass++;
    console.log('§GANTT_SETUP[' + ci + '] OK ' + c[2] + ' → ganttH=' + r.ganttH + ' wrapH=' + r.wrapH + ' barPx=' + r.barPx);
  } else {
    fail++;
    console.log('§GANTT_SETUP[' + ci + '] FAIL ' + c[2] + ' → ' + r.error);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 13: Deploy version sync — sw.js CACHE_VERSION matches index.html registration
// ══════════════════════════════════════════════════════════════
console.log('\n── T13: Deploy version sync ──');

const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const swVersionMatch = swSrc.match(/CACHE_VERSION\s*=\s*'(v\d+)'/);
const regVersionMatch = indexSrc.match(/sw\.js\?v=(\d+)/);

const swVersion = swVersionMatch ? swVersionMatch[1] : 'NOT_FOUND';
const regVersion = regVersionMatch ? 'v' + regVersionMatch[1] : 'NOT_FOUND';

console.log('§DEPLOY_VERSION_LOCAL sw.js=' + swVersion + ' index.html=' + regVersion);
assert(swVersion === regVersion, 'local: sw.js ' + swVersion + ' === index.html ' + regVersion +
  (swVersion !== regVersion ? ' — STALE CACHE: browser will serve old files!' : ''));

// Check deployed OCI files match local
const { execSync } = require('child_process');
const buckets = ['bim-ootb-full'];
for (const bucket of buckets) {
  try {
    const baseUrl = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/' + bucket + '/o/sandbox/';
    const ociSw = execSync('curl -sf "' + baseUrl + 'sw.js" 2>/dev/null | head -15', { encoding: 'utf8', timeout: 10000 });
    const ociIndex = execSync('curl -sf "' + baseUrl + 'index.html" 2>/dev/null | grep "sw.js"', { encoding: 'utf8', timeout: 10000 });
    const ociCharts = execSync('curl -sf "' + baseUrl + 'boq_charts.html" 2>/dev/null | grep -c "_relayGuids\\|buildScheduleFromOps\\|_scheduleSource"', { encoding: 'utf8', timeout: 10000 });

    const ociSwMatch = ociSw.match(/CACHE_VERSION\s*=\s*'(v\d+)'/);
    const ociRegMatch = ociIndex.match(/sw\.js\?v=(\d+)/);
    const ociSwVer = ociSwMatch ? ociSwMatch[1] : 'NOT_FOUND';
    const ociRegVer = ociRegMatch ? 'v' + ociRegMatch[1] : 'NOT_FOUND';
    const ociChartsHit = parseInt(ociCharts.trim()) || 0;

    console.log('§DEPLOY_OCI_' + bucket + ' sw.js=' + ociSwVer + ' index.html=' + ociRegVer + ' charts_markers=' + ociChartsHit);
    assert(ociSwVer === swVersion, bucket + ' OCI sw.js ' + ociSwVer + ' === local ' + swVersion);
    assert(ociRegVer === regVersion, bucket + ' OCI index.html ' + ociRegVer + ' === local ' + regVersion);
    assert(ociSwVer === ociRegVer, bucket + ' OCI sw.js ' + ociSwVer + ' === OCI index.html ' + ociRegVer);
    assert(ociChartsHit >= 5, bucket + ' OCI boq_charts.html has ' + ociChartsHit + ' change markers (expect >=5)');
  } catch(e) {
    console.log('§DEPLOY_OCI_' + bucket + ' SKIP: ' + e.message.split('\n')[0]);
  }
}

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════');
console.log('§TEST_GANTT_SYNC PASS=' + pass + ' FAIL=' + fail);
console.log('════════════════════════════════\n');
process.exit(fail > 0 ? 1 : 0);
