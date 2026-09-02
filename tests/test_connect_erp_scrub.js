/**
 * test_connect_erp_scrub.js — W-CONNECT-ERP (360 loop closure, §NEXT #1).
 *
 * ISSUE PROVEN: when the BIM viewer broadcasts a `selection` (ifcClass + guid) or `timeline` (cursor +
 *   phase) over the Connect bus, the ERP app must (1) log §CONNECT_ERP inbound, (2) light the matching
 *   C_ProjectLine DOM row (.idmp-connect-lit class), (3) update the status bar, (4) be echo-guarded
 *   (own-instance publishes never fire the sub), (5) be idempotent (double _connectEnable → one reg only).
 *
 * Whitebox: slices §CONNECT-ERP-SCRUB-START…END out of erp/idempiere.html, stubs _sqlRows + DOM + status.
 * Functions are exposed via globalThis assignments appended to the sliced block.
 *
 * Run: node tests/test_connect_erp_scrub.js   (from /tmp/wt-360)
 */
'use strict';
const fs  = require('fs');
const vm  = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  🟢 ' + msg); }
  else       { fail++; console.log('  🔴 FAIL: ' + msg); }
}

// ── Slice §CONNECT-ERP-SCRUB block from idempiere.html ──
const html = fs.readFileSync(path.join(__dirname, '..', 'erp', 'idempiere.html'), 'utf8');
const A = html.indexOf('// §CONNECT-ERP-SCRUB-START');
const B = html.indexOf('// §CONNECT-ERP-SCRUB-END');
if (A < 0 || B < 0 || B < A) {
  console.error('§TEST FAIL: markers not found in idempiere.html'); process.exit(1);
}
// strip the HTML comment before the end marker
const logic = html.slice(A, B) +
  // expose the private functions onto the sandbox for direct calling in tests
  '\n;globalThis.__csub = _connectSubscribe;' +
  '\n;globalThis.__cenable = _connectEnable;' +
  '\n;globalThis.__clight = _connectLightIfc;';

// ── sandbox factory ──
function mkSandbox(domResult) {
  const logs = [], statusCalls = [], domHits = [];
  const rows = [];
  function makeRow() {
    const classes = new Set();
    return {
      offsetWidth: 0,
      classList: {
        add: (c)  => { classes.add(c); domHits.push(c); },
        remove: (c) => classes.delete(c),
        has: (c)  => classes.has(c),
        _classes: classes
      }
    };
  }

  // Connect mock: subscribe stores fns; _deliver fires them directly
  const subs = {};
  const Connect = {
    _token: 'inst-test', _on: false,
    register (s) { logs.push('[mock] Connect.register(' + s + ')'); return this; },
    enable ()    { this._on = true; return this; },
    subscribe (ch, fn) { (subs[ch] = subs[ch] || []).push(fn); },
    _deliver (ch, p)   { (subs[ch] || []).forEach(fn => { try { fn(p); } catch (e) {} }); }
  };

  let dbRows = [{ c_projectline_id: 42 }];

  const ctx = vm.createContext({
    window: { Connect, __idmpDb: {} },
    Connect,
    console: {
      log:  (m) => logs.push(String(m)),
      warn: (m) => logs.push('WARN:' + m)
    },
    document: {
      querySelectorAll: (sel) => {
        if (domResult !== undefined) return domResult;       // override
        if (sel.includes('c_projectline') && sel.includes('"42"')) {
          const r = makeRow(); rows.push(r); return [r];
        }
        return [];
      }
    },
    status:    (m) => statusCalls.push(String(m)),
    _sqlRows:  (_)  => dbRows,
    _connectWired: false,
    // expose for test read-back
    __logs: logs, __status: statusCalls, __rows: rows, __subs: subs, __Connect: Connect,
    __setDbRows: (r) => { dbRows = r; }
  });

  vm.runInContext(logic, ctx);
  // wire subscriptions (simulates what _connectEnable does after Zoom-Across)
  vm.runInContext('__csub();', ctx);
  return ctx;
}

// ══════════════════════════════════════════════════
console.log('\n── W-CONNECT-ERP: selection scrub reaction ──');
{
  const sb = mkSandbox();
  sb.__Connect._deliver('selection', { ifcClass: 'IfcWall', guid: 'aabbcc', surface: 'viewer' });

  const selLog = sb.__logs.find(l => l.includes('§CONNECT_ERP selection'));
  assert(!!selLog, 'W-CONNECT-ERP-1: §CONNECT_ERP selection log line emitted');
  assert(selLog && selLog.includes('IfcWall'), 'W-CONNECT-ERP-1: log includes ifcClass=IfcWall');

  const lightLog = sb.__logs.find(l => l.includes('§CONNECT_ERP light MATCH'));
  assert(!!lightLog, 'W-CONNECT-ERP-2: §CONNECT_ERP light MATCH emitted (DB row found)');
  assert(lightLog && lightLog.includes('pk=42'), 'W-CONNECT-ERP-2: matched pk=42');

  assert(sb.__rows.length > 0 && sb.__rows[0].classList.has('idmp-connect-lit'), 'W-CONNECT-ERP-3: matched DOM row gets .idmp-connect-lit class');

  const statLine = sb.__status.find(s => s.includes('↔ Live: IfcWall'));
  assert(!!statLine, 'W-CONNECT-ERP-4: status bar shows "↔ Live: IfcWall"');
}

console.log('\n── W-CONNECT-ERP: no-match case ──');
{
  const sb = mkSandbox();
  sb.__setDbRows([]);   // no C_ProjectLine for this class
  sb.__Connect._deliver('selection', { ifcClass: 'IfcBeam', guid: null, surface: 'viewer' });

  const missLog = sb.__logs.find(l => l.includes('§CONNECT_ERP light MISS'));
  assert(!!missLog, 'W-CONNECT-ERP-5: MISS logged when no C_ProjectLine matches');
  const statMiss = sb.__status.find(s => s.includes('no project line'));
  assert(!!statMiss, 'W-CONNECT-ERP-5: status shows "no project line" on miss');
  assert(sb.__rows.length === 0, 'W-CONNECT-ERP-5: no DOM row lit on miss');
}

console.log('\n── W-CONNECT-ERP: DOM not visible ──');
{
  const sb = mkSandbox([]);   // querySelectorAll always returns empty
  sb.__Connect._deliver('selection', { ifcClass: 'IfcColumn', guid: 'xyz', surface: 'viewer' });

  const notDom = sb.__logs.find(l => l.includes('not-in-DOM'));
  assert(!!notDom, 'W-CONNECT-ERP-6: logs not-in-DOM when row not visible');
  const statGuide = sb.__status.find(s => s.includes('open C_ProjectLine'));
  assert(!!statGuide, 'W-CONNECT-ERP-6: status guides user to open C_ProjectLine');
}

console.log('\n── W-CONNECT-ERP: timeline reaction ──');
{
  const sb = mkSandbox();
  sb.__Connect._deliver('timeline', { cursor: 1718899200000, phase: 'Superstructure', frac: 0.42, surface: 'viewer' });

  const tlLog = sb.__logs.find(l => l.includes('§CONNECT_ERP timeline'));
  assert(!!tlLog, 'W-CONNECT-ERP-7: §CONNECT_ERP timeline log line emitted');
  assert(tlLog && tlLog.includes('phase=Superstructure'), 'W-CONNECT-ERP-7: phase in log');
  assert(tlLog && tlLog.includes('frac=0.42'), 'W-CONNECT-ERP-7: frac in log');

  const statTL = sb.__status.find(s => s.includes('⏱ TM Superstructure') && s.includes('42%'));
  assert(!!statTL, 'W-CONNECT-ERP-7: status shows "⏱ TM Superstructure (42%)"');
}

console.log('\n── W-CONNECT-ERP: _connectEnable idempotent ──');
{
  const sb = mkSandbox();
  // clear logs from mkSandbox's __csub() call, then call _connectEnable twice
  sb.__logs.length = 0;
  vm.runInContext('_connectWired = false; _connectEnable(); _connectEnable();', sb);

  const regCalls = sb.__logs.filter(l => l.includes('Connect.register(erp)'));
  assert(regCalls.length === 1, 'W-CONNECT-ERP-8: register(erp) called exactly once even when _connectEnable called twice');
  const wiredLog = sb.__logs.find(l => l.includes('§CONNECT_ERP enabled'));
  assert(!!wiredLog, 'W-CONNECT-ERP-8: §CONNECT_ERP enabled log emitted on first call');
}

console.log('\n── W-CONNECT-ERP: null/empty payload safety ──');
{
  const sb = mkSandbox();
  try {
    sb.__Connect._deliver('selection', null);
    sb.__Connect._deliver('selection', { guid: 'x', surface: 'viewer' }); // no ifcClass
    sb.__Connect._deliver('timeline', null);
    assert(true, 'W-CONNECT-ERP-9: null/missing payloads do not throw');
    assert(sb.__rows.length === 0, 'W-CONNECT-ERP-9: no DOM rows lit when ifcClass absent');
  } catch (e) {
    assert(false, 'W-CONNECT-ERP-9: threw on null payload: ' + e.message);
  }
}

// ── Summary ──
console.log('\n§CONNECT_ERP_SCRUB WITNESS ' + (pass + fail) + ' checks — ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('FAILED'); process.exit(1); }
console.log('W-CONNECT-ERP-SCRUB ALL PASS');
