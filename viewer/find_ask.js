/**
 * BIM OOTB — Find panel ASK mode: canned questions answered by the engines that already ship.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * // Implementing prompts/FIND_ASK_ANSWERS.md §B-§E — Witness: witness_find_ask_answers.js (W1-W5)
 * Every answer WRAPS an existing engine call (cited per entry below) — no new maths here.
 * Answer contract §B: {id, question, verdict OK|INCONCLUSIVE|VACUOUS, summary, value, evidence[],
 * sources, rows?, cols?, building, at}. A missing precondition is INCONCLUSIVE, never a fake 0.
 * Loaded in the lazy Navigate bundle BEFORE navigate_find.js (main.js), which calls FindAsk.mount().
 */
(function () {
  'use strict';

  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var AI_PROMPT = 'Answer only from this workbook. For every number you state, cite the Evidence tag ' +
    'and the Engine column of the row it came from. If a row says INCONCLUSIVE, say the data is missing — do not estimate.';

  function _cur() { return (typeof _TRL !== 'undefined' && _TRL.cur) || 'RM'; }
  function _fmt(n) { return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(n); }
  function _discs() {
    var out = [];
    try { (A_ref.dbQuery('SELECT DISTINCT discipline FROM elements_meta WHERE discipline IS NOT NULL ORDER BY 1') || []).forEach(function (r) { out.push(r[0]); }); } catch (e) { /* ignore */ }
    return out;
  }
  var A_ref = null;

  // ── §B evidence capture: the ENGINE's own § lines, printed as normal (never suppressed) ──
  function _capture(tagRe) {
    var orig = console.log, got = [];
    console.log = function () {
      try {
        var s = Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : (a && a.message) || JSON.stringify(a); }).join(' ');
        if (s.indexOf('§') >= 0 && (!tagRe || tagRe.test(s))) {
          var m = s.match(/§[A-Z0-9_]+/);
          got.push({ tag: m ? m[0] : '§?', text: s.slice(0, 300) });
        }
      } catch (e) { /* ignore */ }
      return orig.apply(console, arguments);
    };
    return { stop: function () { console.log = orig; return got; } };
  }

  // ── §C catalog ──
  var CATALOG = [
    { id: 'clash_pair', q: 'Clashes between two disciplines', kw: /clash|collide|conflict|interfer/i, pair: true,
      tags: /§CLASH_|§ASK_/, run: runClash },
    { id: 'schedule_4d', q: '4D schedule timeline', kw: /4d|schedule|timeline|duration|how long|gantt/i,
      tags: /§4D_REAL_TASKS|§AUTHOR_DETECT|§GANTT |§GANTT_SOURCE|§CREW_DAY |§HR_COST|§ASK_/, run: runSchedule },
    { id: 'cost_total', q: 'Total cost (5D)', kw: /cost|5d|price|budget|how much/i,
      tags: /§NLP_DEC|§ASK_/, run: runCost },
    { id: 'largest_room', q: 'Largest rooms', kw: /room|largest|biggest|area|space/i,
      tags: /§ROOM_VOL|§ASK_/, run: runRooms },
    { id: 'exit_path', q: 'Worst-case path to exit', kw: /exit|egress|escape|evacuat|fire/i,
      tags: /§ESCAPE_ROUTE|§ROOM_GRAPH|§ASK_/, run: runExit },
    { id: 'counts', q: 'Element counts by discipline', kw: /count|how many|number|disciplin|element/i,
      tags: /§ASK_/, run: runCounts }
  ];

  function _answer(id, question, verdict, summary, value, extra) {
    var a = { id: id, question: question, verdict: verdict, summary: summary, value: value,
      evidence: [], sources: {}, building: A_ref.activeBuilding || '', at: new Date().toISOString() };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  // clash_pair — measure.js:76 _loadClashRules + measure.js:526 _queryClashesPairAll; tolerance per rule
  // exactly as clash_matrix.js:296 sets it; narrow phase = clash_narrow.js qualifyRows (§M).
  async function runClash(opts) {
    var A = A_ref, a = (opts && opts.discA) || 'ARC', b = (opts && opts.discB) || 'MEP', q = 'Clashes ' + a + ' vs ' + b;
    var src = { engine: 'measure.js _queryClashesPairAll + clash_narrow.js qualifyRows', rules: 'clash_rules.json' };
    if (!A._loadClashRules || !A._queryClashesPairAll) return _answer('clash_pair', q, 'INCONCLUSIVE', 'clash engine not loaded (measure.js)', null, { sources: src });
    if (!A._hasBbox) return _answer('clash_pair', q, 'INCONCLUSIVE', 'building has no element bounding boxes (A._hasBbox=false)', null, { sources: src });
    var rules = await new Promise(function (r) { A._loadClashRules(r); });
    var rule = (rules && rules.clash_rules || []).filter(function (r) {
      return (r.source.discipline === a && r.target.discipline === b) || (r.source.discipline === b && r.target.discipline === a);
    })[0];
    if (!rule) return _answer('clash_pair', q, 'INCONCLUSIVE', 'no rule for ' + a + '/' + b + ' in clash_rules.json', null, { sources: src });
    rules._activeTolerance = rule.tolerance_m || 0.025;
    if (A._ensureClashIndexes) A._ensureClashIndexes();
    for (var i = 0; i < 120 && !A._clashRtreeReady; i++) await new Promise(function (r) { setTimeout(r, 250); });
    var rows = A._queryClashesPairAll(rules, a, b) || [];
    var broad = rows.length, narrow = null, NARROW_CAP = 3000;
    if (broad && A.clashNarrow && A.clashNarrow.qualifyRows && broad <= NARROW_CAP) {
      try { narrow = await A.clashNarrow.qualifyRows(rows, { label: a + '|' + b }); } catch (e) { narrow = null; }
    }
    var val = { discA: a, discB: b, toleranceM: rules._activeTolerance, bboxOverlaps: broad, rtree: !!A._clashRtreeReady };
    var summary;
    if (narrow && narrow.counts) {
      val.meshClashes = (narrow.counts.meshTrue || 0) + (narrow.counts.contained || 0);
      // every broad row gets exactly one verdict: clash (meshTrue+contained), unjudged, or cleared
      // (rejected by the oriented-box test OR by the triangle test) — cleared = the remainder.
      val.unknown = narrow.counts.unknown || 0; val.obbRejected = narrow.counts.obbRejected || 0; val.triangleClear = narrow.counts.meshClear || 0;
      val.cleared = broad - val.meshClashes - val.unknown;
      summary = val.meshClashes + ' mesh-level clashes (' + broad + ' box overlaps: ' + val.cleared + ' cleared by the shape tests, ' + val.unknown + ' unjudged) at ' + (val.toleranceM * 1000) + ' mm';
    } else {
      summary = broad + ' box overlaps at ' + (val.toleranceM * 1000) + ' mm' + (broad > NARROW_CAP ? ' (too many for the mesh test here — box count only)' : ' (mesh test unavailable — box count only)');
    }
    var cols = ['Element A', 'Element B', 'Class A', 'Class B', 'Disc A', 'Disc B', 'Name A', 'Name B', 'Overlap m', 'Verdict'];
    var out = rows.slice(0, 5000).map(function (r) { return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9] ? r[9].verdict : 'BOX']; });
    return _answer('clash_pair', q, 'OK', summary, val, { sources: src, cols: cols, rows: out });
  }

  // schedule_4d — two owners, tried in order (4D_MODEL_INTEGRITY.md §I):
  //  1. an AUTHORED schedule in the DB (tasks table) — schedule_read_4d.js:78 readTasks, the same call
  //     boq_charts.html:1294 makes;
  //  2. otherwise the PLAYED timeline the Time Machine generates (kernel_ops) — time_machine.js:10346
  //     tmGenerateTimeline(), read back via tmScheduleSource() (project window) + tmOpsSnapshot()
  //     (per-op start/end/trade), and the labour cost the generator computed (A._hrCost, §HR_COST).
  async function runSchedule() {
    var A = A_ref, q = '4D schedule timeline';
    if (!A.db) return _answer('schedule_4d', q, 'INCONCLUSIVE', 'no building loaded', null, {});
    var DAY = 86400000;
    // local calendar date — the same day the Time Machine's own §GANTT anchor/end line prints
    function iso(ms) { if (!ms) return null; var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    var tasks = null;
    if (window.ScheduleRead4D) {
      tasks = window.ScheduleRead4D.readTasks(A.db, {
        rules: typeof SEQUENCE_RULES !== 'undefined' ? SEQUENCE_RULES : null,
        laborRates: typeof LABOR_RATES !== 'undefined' ? LABOR_RATES : null,
        equipmentAllocation: typeof EQUIPMENT_ALLOCATION !== 'undefined' ? EQUIPMENT_ALLOCATION : null,
        equipmentRates: typeof EQUIPMENT_RATES !== 'undefined' ? EQUIPMENT_RATES : null
      });
    }
    if (tasks && tasks.length) {
      var src1 = { engine: 'schedule_read_4d.js readTasks (authored schedule in the DB)' };
      var days = 0, start = null, finish = null, phases = [];
      tasks.forEach(function (t) {
        if (t.finishDay > days) days = t.finishDay;
        if (t.startDate && (!start || t.startDate < start)) start = t.startDate;
        if (t.finishDate && (!finish || t.finishDate > finish)) finish = t.finishDate;
        if (t.phase && phases.indexOf(t.phase) < 0) phases.push(t.phase);
      });
      var cols1 = ['WBS', 'Task', 'Phase', 'Discipline', 'Storey', 'Qty', 'UoM', 'Duration d', 'Start', 'Finish', 'Start day', 'Finish day', 'Critical', 'Elements'];
      var rows1 = tasks.map(function (t) { return [t.wbs, t.name, t.phase, t.discipline, t.storey, t.qty, t.uom, t.duration, t.startDate, t.finishDate, t.startDay, t.finishDay, t.isCritical ? 'Y' : '', (t.guids || []).length]; });
      return _answer('schedule_4d', q, 'OK', 'Authored schedule: ' + tasks.length + ' tasks over ' + days + ' days (' + start + ' → ' + finish + '), ' + phases.length + ' phases',
        { source: 'authored', tasks: tasks.length, days: days, start: start, finish: finish, phases: phases }, { sources: src1, cols: cols1, rows: rows1 });
    }
    var src2 = { engine: 'time_machine.js tmGenerateTimeline → kernel_ops ELEMENT_PLACE (read as loadOps() does) + A._hrCost', rules: '4D_template.json + rates.js labour/crew tables' };
    // The played layer persists in kernel_ops; the Time Machine only pulls it into memory (_ops) when
    // activated, so read the table the same way time_machine.js:203 loadOps() does — read-only, the
    // 3D scene is not touched. ELEMENT_PLACE only, as the Find Phase axis counts it (navigate_find.js).
    function readOps() {
      try {
        var r = A.db.exec("SELECT timestamp, parameters FROM kernel_ops WHERE undone = 0 AND op_type = 'ELEMENT_PLACE'");
        if (!r.length) return [];
        return r[0].values.map(function (row) { var pm = row[1] ? JSON.parse(row[1]) : {}; return { s: row[0], e: pm._end_ts || (row[0] + 60000), r: pm.resource || null }; });
      } catch (e) { return []; }
    }
    var ops = readOps(), generated = false;
    if (!ops.length && typeof window.tmGenerateTimeline === 'function') {
      try { await window.tmGenerateTimeline(); generated = true; } catch (e) { /* reported below */ }
      ops = readOps();
    }
    if (!ops.length) return _answer('schedule_4d', q, 'INCONCLUSIVE', 'no timeline could be read or generated', null, { sources: src2 });
    var ss = { source: 'generated', projectStart: Infinity, projectEnd: -Infinity };
    ops.forEach(function (o) { if (o.s < ss.projectStart) ss.projectStart = o.s; if (o.e > ss.projectEnd) ss.projectEnd = o.e; });
    var byTrade = {};
    ops.forEach(function (o) {
      var k = o.r || '(no trade)', t = byTrade[k] || (byTrade[k] = { n: 0, s: Infinity, e: -Infinity });
      t.n++; if (o.s < t.s) t.s = o.s; if (o.e > t.e) t.e = o.e;
    });
    var trades = Object.keys(byTrade).sort(function (x, y) { return byTrade[x].s - byTrade[y].s; });
    var hr = A._hrCost || null;
    var val = { source: ss.source, elements: ops.length, start: iso(ss.projectStart), finish: iso(ss.projectEnd),
      days: Math.round((ss.projectEnd - ss.projectStart) / DAY), trades: trades.length, generated: generated,
      labourCost: hr ? hr.total : null, personDays: hr ? hr.personDays : null, currency: _cur() };
    var rows2 = trades.map(function (k) { var t = byTrade[k]; return [k, t.n, iso(t.s), iso(t.e), Math.max(0, Math.round((t.e - t.s) / DAY))]; });
    return _answer('schedule_4d', q, 'OK', ops.length + ' elements scheduled ' + val.start + ' → ' + val.finish + ' (' + val.days + ' days), ' + trades.length + ' trades' +
      (hr ? ', labour cost ' + _cur() + ' ' + _fmt(hr.total) + ' (' + _fmt(hr.personDays) + ' person-days; time-phased labour, not a BOQ)' : ''), val,
      { sources: src2, cols: ['Trade', 'Elements', 'First start', 'Last finish', 'Span days'], rows: rows2 });
  }

  // cost_total — decoder.js 'total cost' over qto_cache, the SAME call nlp.js:288-306 makes.
  async function runCost() {
    var A = A_ref, q = 'Total cost (5D)', src = { engine: 'decoder.js BimDecoder total cost (qto_cache)', rules: 'active rate pack' };
    if (typeof BimDecoder === 'undefined' || !A.db) return _answer('cost_total', q, 'INCONCLUSIVE', 'decoder.js not loaded', null, { sources: src });
    var has = 0;
    try { has = (A.dbQuery("SELECT count(*) FROM sqlite_master WHERE name='qto_cache'") || [[0]])[0][0]; } catch (e) { has = 0; }
    if (!has) return _answer('cost_total', q, 'INCONCLUSIVE', 'this building has no qto_cache table (quantities were never costed) — no total is claimed', null, { sources: src });
    var d = BimDecoder.decode('total cost', { storeys: [] });
    if (!d || d.kind !== 'cost') return _answer('cost_total', q, 'INCONCLUSIVE', 'decoder did not read "total cost" as a cost query', null, { sources: src });
    var cur = _cur(), cur2 = (typeof _TRL !== 'undefined' && _TRL.cur2) || 'USD', rate = (typeof _TRL !== 'undefined' && _TRL.cur_rate) || 3.91;
    var f = BimDecoder.formatResult(d, function (s, p) { return A.db.exec(s, p || []); }, { cur: cur, cur2: cur2, rate: rate });
    // formatResult's table holds DISPLAY strings ('RM 1,234'); the number comes from the decoder's own
    // planned SQL (d.sql/d.params — the same statement formatResult runs), never re-parsed from text.
    var raw = null;
    try { var rr = A.db.exec(d.sql, d.params || []); raw = (rr && rr[0] && rr[0].values[0]) ? rr[0].values[0] : null; } catch (e) { raw = null; }
    var total = raw ? raw[0] : null, elems = raw ? raw[1] : null;
    console.log('[NLP2026] §NLP_DEC kind=cost n=0 "' + String(f.summary).substring(0, 60) + '" (via Ask)');
    if (total === null || total === undefined) return _answer('cost_total', q, 'VACUOUS', 'qto_cache holds no costed rows', null, { sources: src });
    return _answer('cost_total', q, 'OK', f.summary, { total: total, elements: elems, currency: cur }, { sources: src, cols: f.table.cols, rows: f.table.vals });
  }

  // largest_room — navigate_find.js:2303 A.allRoomVolumes(); area = Σ size.x*size.z per room guid.
  async function runRooms() {
    var A = A_ref, q = 'Largest rooms', src = { engine: 'navigate_find.js allRoomVolumes (IfcSpace boxes, habitable only)' };
    if (typeof A.allRoomVolumes !== 'function') return _answer('largest_room', q, 'INCONCLUSIVE', 'room lens not loaded', null, { sources: src });
    var boxes = A.allRoomVolumes() || [], by = {};
    boxes.forEach(function (b) {
      var r = by[b.guid] || (by[b.guid] = { guid: b.guid, name: b.name, category: b.category, area: 0, boxes: 0 });
      r.area += b.size.x * b.size.z; r.boxes++;
    });
    var rooms = Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return y.area - x.area; });
    if (!rooms.length) return _answer('largest_room', q, 'VACUOUS', 'no habitable rooms (IfcSpace) in this building', { rooms: 0 }, { sources: src });
    var top = rooms[0];
    var val = { rooms: rooms.length, largest: { guid: top.guid, name: top.name, areaM2: +top.area.toFixed(2) } };
    return _answer('largest_room', q, 'OK', 'Largest: ' + top.name + ' ' + top.area.toFixed(1) + ' m² (of ' + rooms.length + ' rooms)', val,
      { sources: src, cols: ['Room', 'GUID', 'Category', 'Area m²', 'Boxes'], rows: rooms.slice(0, 50).map(function (r) { return [r.name, r.guid, r.category, +r.area.toFixed(2), r.boxes]; }) });
  }

  // exit_path — cpe_escape_route.js:359 A.escapeRouteBuild(): the worst room (argmax route cost).
  // Route COST is not metres (cpe_escape_route.js:84-90); walkM is the drawn 3D length.
  async function runExit() {
    var A = A_ref, q = 'Worst-case path to exit', src = { engine: 'cpe_escape_route.js escapeRouteBuild (room_graph.js escapeRoute)', rules: 'egress_rules.json' };
    if (typeof A.escapeRouteBuild !== 'function') return _answer('exit_path', q, 'INCONCLUSIVE', 'escape-route engine not loaded', null, { sources: src });
    var rec = null;
    try { rec = A.escapeRouteBuild(); } catch (e) { rec = null; }
    if (!rec) return _answer('exit_path', q, 'INCONCLUSIVE', 'no exit route could be built (see evidence — usually no walkable raster / no exits in this building)', null, { sources: src });
    var val = { room: rec.roomName, roomGuid: rec.roomGuid, storey: rec.storey, exit: rec.exitName, exitGuid: rec.exitGuid,
      walkM: +rec.walkM.toFixed(2), routeCost: +(+rec.graphCostM).toFixed(2), doors: rec.doors, hops: rec.hops, roomsScanned: rec.roomsScanned };
    return _answer('exit_path', q, 'OK', 'From ' + rec.roomName + ' to ' + rec.exitName + ': ' + rec.walkM.toFixed(1) + ' m walk, ' + rec.doors + ' doors (worst of ' + rec.roomsScanned + ' rooms)', val,
      { sources: src, cols: ['Field', 'Value'], rows: Object.keys(val).map(function (k) { return [k, val[k]]; }) });
  }

  // counts — elements_meta GROUP BY discipline (the table Find's discipline axis reads).
  async function runCounts() {
    var A = A_ref, q = 'Element counts by discipline', src = { engine: 'elements_meta GROUP BY discipline' };
    var rows = [];
    try { rows = A.dbQuery('SELECT discipline, count(*) FROM elements_meta GROUP BY discipline ORDER BY 2 DESC') || []; } catch (e) { rows = []; }
    if (!rows.length) return _answer('counts', q, 'VACUOUS', 'no elements', { total: 0 }, { sources: src });
    var total = rows.reduce(function (s, r) { return s + r[1]; }, 0), by = {};
    rows.forEach(function (r) { by[r[0] || '(none)'] = r[1]; });
    return _answer('counts', q, 'OK', total + ' elements: ' + rows.map(function (r) { return (r[0] || '(none)') + ' ' + r[1]; }).join(', '), { total: total, byDiscipline: by },
      { sources: src, cols: ['Discipline', 'Elements'], rows: rows.map(function (r) { return [r[0] || '(none)', r[1]]; }) });
  }

  // ── run + record ──
  async function askRun(id, opts) {
    var A = A_ref, e = CATALOG.filter(function (c) { return c.id === id; })[0];
    if (!e) throw new Error('unknown ask id ' + id);
    var cap = _capture(e.tags), ans;
    try { ans = await e.run(opts || {}); }
    catch (err) { ans = _answer(id, e.q, 'INCONCLUSIVE', 'engine threw: ' + (err && err.message), null, {}); }
    var v = ans.value === null || ans.value === undefined ? '' : JSON.stringify(ans.value);
    console.log('§ASK_ANSWER id=' + id + ' verdict=' + ans.verdict + ' value=' + v.slice(0, 400));
    ans.evidence = cap.stop();
    A.askAnswers.push(ans);
    _render();
    return ans;
  }

  function askMatch(text) {
    var t = (text || '').trim();
    if (!t) return CATALOG.slice();
    return CATALOG.filter(function (c) { return c.kw.test(t) || c.q.toLowerCase().indexOf(t.toLowerCase()) >= 0; });
  }

  // ── §E workbook (ExcelJS, lazy — boq_charts.html:59 precedent) ──
  function _loadExcelJS() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'lib/exceljs.min.js';
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('exceljs load failed')); };
      document.head.appendChild(s);
    });
  }
  function _sheetName(i, a) { return ((i + 1) + ' ' + a.id).slice(0, 31); }

  async function askBuildWorkbook() {
    var A = A_ref;
    await _loadExcelJS();
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Answers');
    ws.addRow(['Building', A.activeBuilding || '']);
    var url = location.href;
    ws.addRow(['Viewer', { text: url, hyperlink: url }]);
    ws.addRow(['Prompt for your AI', AI_PROMPT]);
    ws.addRow([]);
    var hdr = ws.addRow(['#', 'Question', 'Verdict', 'Answer', 'Value (JSON)', 'Evidence', 'Engine', 'Rules', 'Detail sheet', 'Time']);
    hdr.font = { bold: true };
    A.askAnswers.forEach(function (a, i) {
      var sheet = (a.rows && a.rows.length) ? _sheetName(i, a) : '';
      ws.addRow([i + 1, a.question, a.verdict, a.summary, a.value === null || a.value === undefined ? '' : JSON.stringify(a.value),
        (a.evidence || []).map(function (e) { return e.text; }).join('\n').slice(0, 30000),
        a.sources.engine || '', a.sources.rules || '', sheet, a.at]);
      if (sheet) {
        var d = wb.addWorksheet(sheet);
        d.addRow([a.question + ' — ' + a.summary]);
        var h = d.addRow(a.cols || []); h.font = { bold: true };
        a.rows.forEach(function (r) { d.addRow(r); });
      }
    });
    ws.columns.forEach(function (c, i) { c.width = [4, 30, 13, 60, 40, 60, 40, 22, 16, 22][i] || 14; });
    return wb.xlsx.writeBuffer();
  }

  async function askSave() {
    var A = A_ref;
    if (!A.askAnswers.length) return null;
    var buf = await askBuildWorkbook();
    var name = 'BIM_OOTB_' + (A.activeBuilding || 'building') + '_Answers_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    var blob = new Blob([buf], { type: XLSX_MIME });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    console.log('§ASK_SAVE file=' + name + ' answers=' + A.askAnswers.length + ' bytes=' + buf.byteLength);
    return name;
  }

  // ── §D UI ──
  var ui = null;
  function _esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var BADGE = { OK: '#4caf50', INCONCLUSIVE: '#ff9800', VACUOUS: '#9e9e9e' };

  function _render() {
    if (!ui) return;
    var A = A_ref, list = askMatch(ui.filter);
    ui.catalog.innerHTML = list.map(function (c) {
      var pair = c.pair ? ' <select data-k="a">' + ui.discOpts('ARC') + '</select> vs <select data-k="b">' + ui.discOpts('MEP') + '</select>' : '';
      return '<div class="ask-q" data-id="' + c.id + '" style="display:flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px">' +
        '<span style="flex:1">' + _esc(c.q) + pair + '</span><button class="ask-run" style="padding:3px 10px;font-size:11px;border:1px solid rgba(79,195,247,0.4);border-radius:6px;background:rgba(79,195,247,0.15);color:#4fc3f7;cursor:pointer">Run</button></div>';
    }).join('') || '<div style="padding:6px 10px;font-size:11px;opacity:0.7">No canned question matches — try clash, 4D, cost, room, exit, count.</div>';
    ui.answers.innerHTML = A.askAnswers.map(function (a, i) {
      return '<div class="ask-card" style="margin:4px 10px;padding:6px 8px;border-left:3px solid ' + (BADGE[a.verdict] || '#999') + ';background:rgba(255,255,255,0.04);font-size:12px">' +
        '<div style="opacity:0.7">' + (i + 1) + '. ' + _esc(a.question) + ' · <b style="color:' + (BADGE[a.verdict] || '#999') + '">' + a.verdict + '</b></div>' +
        '<div class="ask-summary">' + _esc(a.summary) + '</div>' +
        '<div style="opacity:0.5;font-size:10px">' + _esc((a.evidence || []).map(function (e) { return e.tag; }).filter(function (t, j, s) { return s.indexOf(t) === j; }).join(' ')) + '</div></div>';
    }).join('');
    ui.count.textContent = A.askAnswers.length ? A.askAnswers.length + ' answer' + (A.askAnswers.length > 1 ? 's' : '') : '';
  }

  function mount(A, panel) {
    A_ref = A;
    if (!A.askAnswers) A.askAnswers = [];
    A.askRun = askRun; A.askMatch = askMatch; A.askBuildWorkbook = askBuildWorkbook; A.askSave = askSave;
    A.askCatalog = function () { return CATALOG.map(function (c) { return { id: c.id, question: c.q }; }); };
    var bar = document.createElement('div');
    bar.id = 'find-ask-switch';
    bar.style.cssText = 'display:flex;gap:6px;padding:4px 10px';
    var pill = 'flex:1;padding:4px 8px;font-size:11px;border-radius:12px;cursor:pointer;border:1px solid rgba(79,195,247,0.4);';
    bar.innerHTML = '<button id="find-mode-find" style="' + pill + '">Find</button><button id="find-mode-ask" style="' + pill + '">Ask</button>';
    var pane = document.createElement('div');
    pane.id = 'find-ask-pane'; pane.style.display = 'none';
    pane.innerHTML = '<div id="find-ask-catalog"></div>' +
      '<div style="display:flex;gap:6px;align-items:center;padding:4px 10px;border-top:1px solid rgba(255,255,255,0.08)"><span id="find-ask-count" style="flex:1;font-size:11px;opacity:0.7"></span>' +
      '<button id="find-ask-save" style="padding:3px 10px;font-size:11px;border:1px solid rgba(76,175,80,0.5);border-radius:6px;background:rgba(76,175,80,0.15);color:#81c784;cursor:pointer">Save .xlsx</button>' +
      '<button id="find-ask-clear" style="padding:3px 10px;font-size:11px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.06);color:#ccc;cursor:pointer">Clear</button></div>' +
      '<div id="find-ask-answers" style="max-height:40vh;overflow:auto"></div>';
    var searchBar = panel.querySelector('.find-search-bar');
    panel.insertBefore(bar, searchBar ? searchBar.nextSibling : panel.firstChild);
    panel.insertBefore(pane, bar.nextSibling);
    var discs = _discs();
    ui = { filter: '', active: false, catalog: pane.querySelector('#find-ask-catalog'), answers: pane.querySelector('#find-ask-answers'), count: pane.querySelector('#find-ask-count'),
      discOpts: function (sel) { return (discs.length ? discs : ['ARC', 'MEP', 'STR', 'ELEC', 'FP', 'ACMV']).map(function (d) { return '<option' + (d === sel ? ' selected' : '') + '>' + d + '</option>'; }).join(''); } };
    var hidden = [];
    function setMode(ask) {
      ui.active = ask;
      if (ask) {
        hidden = [];
        Array.prototype.forEach.call(panel.children, function (ch) {
          if (ch === bar || ch === pane || ch === searchBar || ch.id === 'find-close') return;
          hidden.push([ch, ch.style.display]); ch.style.display = 'none';
        });
        pane.style.display = 'block'; discs = _discs(); _render();
      } else {
        hidden.forEach(function (h) { h[0].style.display = h[1]; }); hidden = [];
        pane.style.display = 'none';
      }
      bar.querySelector('#find-mode-ask').style.background = ask ? 'rgba(79,195,247,0.3)' : 'transparent';
      bar.querySelector('#find-mode-find').style.background = ask ? 'transparent' : 'rgba(79,195,247,0.3)';
      bar.querySelector('#find-mode-ask').style.color = bar.querySelector('#find-mode-find').style.color = '#4fc3f7';
      console.log('§ASK_MODE ' + (ask ? 'ask' : 'find'));
    }
    bar.querySelector('#find-mode-find').addEventListener('click', function () { setMode(false); });
    bar.querySelector('#find-mode-ask').addEventListener('click', function () { setMode(true); });
    pane.querySelector('#find-ask-save').addEventListener('click', function () { askSave(); });
    pane.querySelector('#find-ask-clear').addEventListener('click', function () { A.askAnswers.length = 0; _render(); });
    ui.catalog.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.ask-run'); if (!btn) return;
      var row = btn.closest('.ask-q'), id = row.getAttribute('data-id'), o = {};
      var sa = row.querySelector('select[data-k="a"]'), sb = row.querySelector('select[data-k="b"]');
      if (sa && sb) { o.discA = sa.value; o.discB = sb.value; }
      btn.disabled = true; btn.textContent = '…';
      askRun(id, o).then(function () { btn.disabled = false; btn.textContent = 'Run'; });
    });
    // Find's _handleInput delegates here while Ask is active: typed/voice text filters the catalog;
    // an explicit submit (Enter/voice final) runs the single best match.
    A.askIsActive = function () { return !!(ui && ui.active); };
    A.askInput = function (text, explicit) {
      ui.filter = text || ''; _render();
      var m = askMatch(text);
      console.log('§ASK_FILTER "' + String(text).slice(0, 60) + '" matches=' + m.length + (explicit ? ' explicit' : ''));
      if (explicit && m.length) return askRun(m[0].id, {});
      return null;
    };
    A.askSetMode = setMode;
    setMode(false);
    console.log('§ASK_MOUNT catalog=' + CATALOG.length);
  }

  window.FindAsk = { mount: mount, catalog: CATALOG };
})();
