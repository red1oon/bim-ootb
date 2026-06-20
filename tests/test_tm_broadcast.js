/**
 * test_tm_broadcast.js — W-TM-PINPOINT + W-TM-BROADCAST (TM_4D5D_VARIANCE_LANE §S3).
 *
 * ISSUE PROVEN: scrubbing the Time Machine must (1) PINPOINT the exact element(s) the data is addressing at the
 *   cursor — the frontier (ops whose window straddles the cursor), with a parked-cursor fallback to the last
 *   finished op — and (2) BROADCAST that scrub over the shared Connect bus in realtime (cursor + frontier +
 *   lead selection), echo-guarded + throttled, and APPLY a sibling surface's inbound scrub. The 4D itself is NOT
 *   regenerated. Whitebox: slices the PURE _frontierAt + the broadcast fns out of time_machine.js, stubs Connect.
 *
 * Run: node tests/test_tm_broadcast.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  🟢 ' + msg); } else { fail++; console.log('  🔴 FAIL: ' + msg); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
const a = src.indexOf('var _applyingRemoteScrub = false;');
const b = src.indexOf('// ── §S260c: Outline effect');
if (a < 0 || b < 0 || b < a) { console.log('§TEST FAIL: could not locate §S3 broadcast span'); process.exit(1); }
const logic = src.slice(a, b);

const DAY = 86400000, base = Date.parse('2026-06-13T00:00:00Z');
// 3 sequential phases, distinct guids — a clean frontier to pinpoint
function mkOps() {
  const PH = [['Substructure', 0, 30], ['Superstructure', 30, 120], ['Finishes', 120, 150]];
  const ops = [];
  PH.forEach(p => { for (let i = 0; i < 5; i++) {
    const s = base + (p[1] + (p[2] - p[1]) * (i / 5)) * DAY;
    ops.push({ start_ts: s, end_ts: s + ((p[2] - p[1]) / 5) * DAY, output_guid: p[0].slice(0, 3) + i, parameters: { phase: p[0] } });
  } });
  return ops;
}
const ops = mkOps(), projStart = base, projEnd = base + 150 * DAY;

// fake DOM element for the pinpoint callout
function fakeEl() { return { style: {}, innerHTML: '', id: '' }; }

function mkSandbox(over) {
  const published = [];
  const s = Object.assign({
    _ops: ops, _cursor: base, _projectStart: projStart, _projectEnd: projEnd, _active: true,
    A: function () { return { activeBuilding: 'Hospital' }; },
    window: { Connect: { on: true, publish: function (ch, p) { published.push({ ch, p }); } } },
    document: { _el: fakeEl(), getElementById: function () { return this._el; }, createElement: function () { return fakeEl(); }, body: { appendChild: function () {} } },
    console: { log: function () {} },
    Date: { now: function () { return s.__clock; } },
    renderAtTime: function (c) { s.__rendered = c; }, anchorFromCursor: function () {}, configSlider: function () {},
    __clock: 100000, __rendered: null, __published: published,
  }, over || {});
  vm.runInNewContext(logic + '\n; globalThis.__front=_frontierAt; globalThis.__bcast=_broadcastTimeline; globalThis.__remote=_applyRemoteTimeline;', s);
  return s;
}

// ── W-TM-PINPOINT — _frontierAt returns the ops the cursor is addressing ──
const sb = mkSandbox();
const midSuper = base + 75 * DAY;   // mid-Superstructure
const fr = sb.__front(midSuper);
console.log('\n§TM_PINPOINT cursor=midSuper frontier=' + fr.map(f => f.guid).join(',') + '\n');
assert(fr.length > 0 && fr.every(f => f.phase === 'Superstructure'), 'W-TM-PINPOINT: mid-Superstructure pinpoints only Superstructure ops (' + fr.length + ')');
assert(fr.every(f => { const op = ops.find(o => o.output_guid === f.guid); return op && op.start_ts <= midSuper && op.end_ts > midSuper; }), 'every pinpointed guid is an op whose window STRADDLES the cursor (addressed now)');
assert(sb.__front(base - DAY).length === 0, 'before any op → nothing addressed (empty frontier)');
const after = sb.__front(projEnd + 10 * DAY);
assert(after.length === 1 && after[0].phase === 'Finishes', 'parked past the end → falls back to the last finished op (1 item, ' + after[0].phase + ')');

// ── W-TM-BROADCAST — scrub publishes timeline + lead selection; echo-guarded; throttled ──
const sb2 = mkSandbox();
sb2.__clock = 100000; sb2.eval = null;
// set cursor + broadcast
vm.runInNewContext('_cursor = ' + midSuper + '; __bcast();', Object.assign(sb2, { __bcast: sb2.__bcast }));
const pub = sb2.__published;
const tl = pub.find(p => p.ch === 'timeline'), selp = pub.find(p => p.ch === 'selection');
console.log('§TM_BROADCAST published channels=' + pub.map(p => p.ch).join(',') + '\n');
assert(tl && tl.p.surface === 'viewer' && tl.p.building === 'Hospital', 'W-TM-BROADCAST: publishes "timeline" tagged surface=viewer + building');
assert(tl && typeof tl.p.cursor === 'number' && typeof tl.p.frac === 'number' && Array.isArray(tl.p.frontier) && tl.p.frontier.length > 0, 'timeline payload carries cursor + frac + frontier guids');
assert(selp && selp.p.guid === tl.p.lead && selp.p.surface === 'viewer', 'publishes a "selection" pinpointing the LEAD addressed element (ERP/sibling lights its record)');

// throttle — a second broadcast at the same wall-clock is suppressed
const before = sb2.__published.length;
vm.runInNewContext('__bcast();', sb2);
assert(sb2.__published.length === before, 'throttled: a second scrub within the window does not re-fan-out');

// echo guard — applying a remote scrub must NOT re-publish
const sb3 = mkSandbox();
vm.runInNewContext('_applyingRemoteScrub = true; _cursor = ' + midSuper + '; __bcast();', sb3);
assert(sb3.__published.length === 0, 'echo guard: no publish while applying a remote scrub');

// ── inbound: a sibling viewer scrub moves our cursor; foreign surface/building ignored ──
const sb4 = mkSandbox();
vm.runInNewContext('__remote({ surface:"viewer", building:"Hospital", cursor:' + midSuper + ' });', sb4);
assert(sb4.__rendered === midSuper, 'inbound viewer scrub (same building) applies the cursor via renderAtTime');
const sb5 = mkSandbox();
vm.runInNewContext('__remote({ surface:"modeller", cursor:' + midSuper + ' }); __remote({ surface:"viewer", building:"OtherBld", cursor:' + midSuper + ' });', sb5);
assert(sb5.__rendered === null, 'inbound from a foreign surface OR different building is ignored (no cross-model scrub)');

console.log('\nW-TM-PINPOINT + W-TM-BROADCAST ' + pass + '/' + (pass + fail));
fs.writeFileSync(path.join(__dirname, 'test_tm_broadcast.log'),
  '§TM_PINPOINT frontier=' + fr.length + ' §TM_BROADCAST channels=' + pub.map(p => p.ch).join(',') + '\n' +
  'W-TM-PINPOINT + W-TM-BROADCAST ' + pass + '/' + (pass + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);
