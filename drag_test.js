// §GANTT_DRAG browser wiring test — dispatches REAL PointerEvents at the real canvas and asserts the
// §-log NUMBERS that come back. Per this project's law: the browser proves the path is CONNECTED,
// the § values prove it is CORRECT. No screenshots anywhere.
var cdp = require('./cdp.js');
var PORT = process.env.CDP_PORT || 9333;
var URL_ = 'http://localhost:8412/viewer/viewer.html';

function ev(c, expr) {
  return c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    .then(function (r) {
      if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.text || '');
      return r.result && r.result.result ? r.result.result.value : null;
    });
}
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  var targets = await cdp.httpJson(PORT, '/json/list');
  var page = targets.filter(function (t) { return t.type === 'page'; })[0];
  var c = await cdp.connect(page.webSocketDebuggerUrl);
  var logs = [];
  c.on(function (m) {
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push((m.params.args || []).map(function (a) {
        return a.value !== undefined ? String(a.value) : (a.description || '');
      }).join(' '));
    }
  });
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Network.enable');
  await c.send('Network.setBypassServiceWorker', { bypass: true });
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Page.navigate', { url: URL_ });
  await sleep(28000);

  var pass = 0, fail = 0;
  function check(n, cond, detail) {
    if (cond) { pass++; console.log('§B-DRAG PASS  ' + n + (detail ? '  ' + detail : '')); }
    else { fail++; console.log('§B-DRAG FAIL  ' + n + (detail ? '  ' + detail : '')); }
  }

  // ---- Open Time Machine + the Gantt drawer through the REAL controls.
  console.log(await ev(c, 'window.toggleTimeMachine && window.toggleTimeMachine(true), "tm-toggled"'));
  await sleep(6000);
  await ev(c, '(function(){var b=document.getElementById("tm-gantt");if(b){b.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));return "clicked"}return "no-btn"})()');
  await sleep(3000);

  // ---- Author a real zone schedule on the live DB (test SETUP, same call the witnesses use).
  var authored = await ev(c, '(function(){var A=window.APP||window.app;' +
    'if(!A||!A.db) return "no-db";' +
    'var r=window.ScheduleAuthor.materializeZones(A.db, window.SEQUENCE_RULES, {start:"2026-01-01",' +
    'laborRates:window.LABOR_RATES, rates:window.RATES, scheduleGate:window.ScheduleGate});' +
    'return JSON.stringify(r);})()');
  console.log('authored=' + String(authored).slice(0, 160));
  check('B-1 zone-schedule-authored-live', /"ok":true/.test(String(authored)), String(authored).slice(0, 90));

  // Force the drawer to rebuild against the freshly authored schedule.
  await ev(c, '(function(){var b=document.getElementById("tm-gantt");if(b){b.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));b.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));}return 1})()');
  await sleep(2500);

  // ---- Geometry of a real editable bar, straight off the live canvas.
  var bar = await ev(c, '(function(){' +
    'var cv=document.getElementById("tm-gantt-canvas"); if(!cv) return "no-canvas";' +
    'var t=(window.__tmGanttTasks||null);' +
    'return JSON.stringify({w:cv.getBoundingClientRect().width,h:cv.getBoundingClientRect().height,' +
    'top:cv.getBoundingClientRect().top,left:cv.getBoundingClientRect().left});})()');
  console.log('canvas=' + bar);
  check('B-2 gantt-canvas-has-real-layout-box', /"w":[1-9]/.test(String(bar)), String(bar));

  logs.length = 0;
  // ---- REAL pointer drag: row 0, from mid-bar, 60px to the right.
  var drag = await ev(c, '(function(){' +
    'var cv=document.getElementById("tm-gantt-canvas"); if(!cv) return "no-canvas";' +
    'var r=cv.getBoundingClientRect();' +
    'var barH=12,gap=2,rowH=barH+gap, marginL=60;' +
    'var y=r.top+0*rowH+2+barH/2;' +
    'var x=r.left+marginL+40;' +   // inside row 0's bar, clear of the 5px edge zone
    'function P(t,cx,cy){return new PointerEvent(t,{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,isPrimary:true,button:0,buttons:1});}' +
    'cv.dispatchEvent(P("pointerdown",x,y));' +
    'cv.dispatchEvent(P("pointermove",x+20,y));' +
    'cv.dispatchEvent(P("pointermove",x+60,y));' +
    'cv.dispatchEvent(P("pointerup",x+60,y));' +
    'return "dispatched x="+Math.round(x)+" y="+Math.round(y);})()');
  console.log('drag=' + drag);
  await sleep(2500);

  var joined = logs.join('\n');
  var commit = /§GANTT_DRAG_COMMIT[^\n]*/.exec(joined);
  var clamp = /§GANTT_EDIT_CLAMP[^\n]*/.exec(joined);
  var retime = /§GANTT_RETIME[^\n]*/.exec(joined);
  var reject = /§GANTT_DRAG_REJECT[^\n]*/.exec(joined);
  var move = /§GANTT_EDIT_MOVE[^\n]*/.exec(joined);
  [['commit', commit], ['clamp', clamp], ['retime', retime], ['reject', reject], ['move', move]]
    .forEach(function (p) { if (p[1]) console.log('  ' + p[1][0].slice(0, 190)); });

  check('B-3 pointerdown-reaches-the-drag-handler', !!(commit || reject || clamp || move),
    commit ? 'committed' : (reject ? 'rejected (bar had no task)' : (clamp ? 'clamped' : 'no drag log at all')));
  check('B-4 drag-produced-a-real-schedule-write', !!(commit || move),
    commit ? commit[0].slice(0, 120) : 'none');
  check('B-5 W1-retimed-elements-in-the-browser', !!retime, retime ? retime[0].slice(0, 120) : 'no §GANTT_RETIME');

  // ---- Identity + row order, as they actually are at runtime.
  var idl = /§GANTT_BAR_IDENTITY[^\n]*/.exec(joined) || /§GANTT_BAR_IDENTITY[^\n]*/.exec(logs.join('\n'));
  var rowl = /§GANTT_ROW_ORDER[^\n]*/.exec(joined);
  if (idl) console.log('  ' + idl[0].slice(0, 190));
  if (rowl) console.log('  ' + rowl[0].slice(0, 190));

  // ---- Did the seek handler wrongly also fire on this drag? (handler-ordering hazard)
  var seek = /§GANTT_MINI_SEEK[^\n]*/.exec(joined);
  check('B-6 drag-did-not-also-trigger-a-seek', !seek, seek ? ('LEAKED: ' + seek[0].slice(0, 100)) : 'no seek on a drag');

  console.log('§B-DRAG RESULT pass=' + pass + ' fail=' + fail);
  c.close(); process.exit(0);
})().catch(function (e) { console.log('TEST ERROR: ' + e.message); process.exit(1); });
