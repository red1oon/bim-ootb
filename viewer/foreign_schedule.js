// foreign_schedule.js — the FOREIGN-PROGRAMME ADOPT seam (prompts/XER_IMPORT_P6_ADOPT_LANE.md).
//
// Parse an external construction programme (Primavera P6) into the SAME IFC-native schedule rows
// the rest of the 4D stack reads/writes (import_db_builder DDL: schedules / tasks / task_sequences /
// calendars). Two pluggable readers behind one mapper:
//   parsePMXML(text) — Primavera P6 XML (APIBusinessObjects), the open structured export
//   parseXER(text)   — Primavera XER, the tab-delimited %T/%F/%R interchange
//   toScheduleData(parsed, opts) — common mapper → {schedules,tasks,taskSequences,calendars,taskElements:[]}
//
// Both readers return the SAME neutral shape {project, calendars[], wbs[], activities[], relationships[]}
// so toScheduleData is format-agnostic and PMXML/XER of the same plan produce identical rows (the seam
// proof, W-FOREIGN-EQ). NON-INVENT: every row traces to a line in the source; missing fields stay null.
//
// task_elements lands EMPTY by design — a P6 file carries no model guids. 4D binding is the separate
// ScheduleAuthor.assignElement craft (§BINDING-BOUNDARY). Pure, DOM-free, node + browser.

(function (global) {
  'use strict';

  // ── shared helpers ─────────────────────────────────────────────────────────────────────────────
  // P6 date strings: 'YYYY-MM-DD HH:MM' (XER) or 'YYYY-MM-DDTHH:MM:SS' (PMXML). The engine's
  // schedule_* cols are date-only, lexically comparable (computeCpm uses s < minStart). Keep the day.
  function dateOnly(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  function hoursToDays(hr, hpd) {
    if (hr == null || hr === '') return null;
    var n = parseFloat(hr); if (isNaN(n)) return null;
    return n / (hpd || 8);
  }
  var REL_FROM_XER = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };
  var REL_FROM_PMXML = {
    'Finish to Start': 'FS', 'Start to Start': 'SS',
    'Finish to Finish': 'FF', 'Start to Finish': 'SF',
  };

  // ── XER reader: tab-delimited %T(table) / %F(fields) / %R(record) ────────────────────────────────
  function parseXER(text) {
    var lines = String(text).split(/\r?\n/);
    var tables = {}, curName = null, curFields = null;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var cells = lines[i].split('\t');
      var tag = cells[0];
      if (tag === '%T') { curName = cells[1]; tables[curName] = { fields: [], rows: [] }; curFields = null; }
      else if (tag === '%F') { curFields = cells.slice(1); if (curName) tables[curName].fields = curFields; }
      else if (tag === '%R') {
        if (!curName || !curFields) continue;
        var rec = {}, vals = cells.slice(1);
        for (var c = 0; c < curFields.length; c++) rec[curFields[c]] = (vals[c] != null ? vals[c] : '');
        tables[curName].rows.push(rec);
      }
      // ERMHDR / %E / unknown tags ignored
    }
    function rows(t) { return (tables[t] && tables[t].rows) || []; }

    var proj = rows('PROJECT')[0] || {};
    // hours/day from the project's calendar, else first calendar, else 8.
    var cals = rows('CALENDAR');
    var calById = {}; cals.forEach(function (c) { calById[c.clndr_id] = c; });
    var projCal = calById[proj.clndr_id] || cals[0] || {};
    var hpd = parseFloat(projCal.day_hr_cnt) || 8;

    return {
      project: { id: proj.proj_short_name || 'P6', name: proj.proj_short_name || 'P6 Project', hpd: hpd },
      calendars: cals.map(function (c) { return { name: c.clndr_name, hpd: parseFloat(c.day_hr_cnt) || hpd, raw: c.day_hr_cnt }; }),
      wbs: rows('PROJWBS').map(function (w) {
        return { id: w.wbs_id, code: w.wbs_short_name || '', name: w.wbs_name, parent: (w.proj_node_flag === 'Y' ? null : (w.parent_wbs_id || null)) };
      }),
      activities: rows('TASK').map(function (t) {
        var tf = hoursToDays(t.total_float_hr_cnt, hpd);
        return {
          id: t.task_id, code: t.task_code || t.task_id, name: t.task_name, wbs: t.wbs_id,
          start: dateOnly(t.target_start_date), finish: dateOnly(t.target_end_date),
          durDays: hoursToDays(t.target_drtn_hr_cnt, hpd),
          totalFloatDays: tf, freeFloatDays: hoursToDays(t.free_float_hr_cnt, hpd),
          critical: (t.driving_path_flag === 'Y') || (tf != null && tf <= 0),
          status: t.status_code || null,
        };
      }),
      relationships: rows('TASKPRED').map(function (r) {
        return { pred: r.pred_task_id, succ: r.task_id, type: REL_FROM_XER[r.pred_type] || 'FS', lagDays: hoursToDays(r.lag_hr_cnt, hpd) || 0 };
      }),
    };
  }

  // ── PMXML reader: Primavera P6 APIBusinessObjects (regex-scan, no DOM dep so it runs in node) ─────
  function _tag(block, name) {
    var m = block.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    if (!m) { // self-closing / empty element
      var e = block.match(new RegExp('<' + name + '\\s*/>'));
      return e ? '' : null;
    }
    return _unesc(m[1].trim());
  }
  function _unesc(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  function _blocks(text, name) {
    var re = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'g'), out = [], m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return out;
  }
  function parsePMXML(text) {
    text = String(text);
    // Project header: take the first <Project> block but read its direct scalar tags only by slicing
    // before the first child collection (Calendar/WBS/Activity) so nested <Name> don't leak up.
    var projHead = text.split(/<(?:Calendar|WBS|Activity|Relationship)>/)[0];
    var calBlocks = _blocks(text, 'Calendar');
    var projCal = calBlocks[0] || '';
    var hpd = parseFloat(_tag(projCal, 'HoursPerDay')) || 8;

    return {
      project: { id: _tag(projHead, 'Id') || 'P6', name: _tag(projHead, 'Name') || 'P6 Project', hpd: hpd },
      calendars: calBlocks.map(function (b) {
        var h = parseFloat(_tag(b, 'HoursPerDay')) || hpd;
        return { name: _tag(b, 'Name'), hpd: h, raw: _tag(b, 'HoursPerDay') };
      }),
      wbs: _blocks(text, 'WBS').map(function (b) {
        var parent = _tag(b, 'ParentObjectId');
        return { id: _tag(b, 'ObjectId'), code: _tag(b, 'Code') || '', name: _tag(b, 'Name'), parent: (parent || null) };
      }),
      activities: _blocks(text, 'Activity').map(function (b) {
        var tf = hoursToDays(_tag(b, 'TotalFloat'), hpd);
        var st = _tag(b, 'Status');
        return {
          id: _tag(b, 'Id'), code: _tag(b, 'Id'), name: _tag(b, 'Name'), wbs: _tag(b, 'WBSObjectId'),
          start: dateOnly(_tag(b, 'PlannedStartDate')), finish: dateOnly(_tag(b, 'PlannedFinishDate')),
          durDays: hoursToDays(_tag(b, 'PlannedDuration'), hpd),
          totalFloatDays: tf, freeFloatDays: hoursToDays(_tag(b, 'FreeFloat'), hpd),
          critical: (tf != null && tf <= 0),
          status: st || null,
        };
      }),
      relationships: _blocks(text, 'Relationship').map(function (b) {
        return {
          pred: _tag(b, 'PredecessorActivityId'), succ: _tag(b, 'SuccessorActivityId'),
          type: REL_FROM_PMXML[_tag(b, 'Type')] || 'FS', lagDays: hoursToDays(_tag(b, 'Lag'), hpd) || 0,
        };
      }),
    };
  }

  // ── common mapper: neutral parse → IFC-native rows (import_db_builder shape) ──────────────────────
  // Namespacing: WBS ids → 'W:<id>', activity ids → 'A:<id>' so they can never collide and TASKPRED
  // (which references activity ids) re-points through the 'A:' namespace. statusMap is best-effort.
  var STATUS = { TK_NotStart: 'Not Started', TK_Active: 'In Progress', TK_Complete: 'Completed',
    'Not Started': 'Not Started', 'In Progress': 'In Progress', 'Completed': 'Completed' };
  function toScheduleData(parsed, opts) {
    opts = opts || {};
    var schedId = opts.scheduleId || parsed.project.id || 'P6_IMPORT';
    var tasks = [];
    // summary rows from WBS
    parsed.wbs.forEach(function (w) {
      tasks.push({
        id: 'W:' + w.id, scheduleId: schedId, wbsParent: (w.parent != null ? 'W:' + w.parent : null),
        name: w.name, predefinedType: null, isSummary: 1,
        scheduleStart: null, scheduleFinish: null, scheduleDuration: null,
        earlyStart: null, earlyFinish: null, lateStart: null, lateFinish: null,
        freeFloat: null, totalFloat: null, isCritical: null, status: null,
      });
    });
    // leaf rows from activities
    parsed.activities.forEach(function (a) {
      tasks.push({
        id: 'A:' + a.id, scheduleId: schedId, wbsParent: (a.wbs != null ? 'W:' + a.wbs : null),
        name: a.name, predefinedType: null, isSummary: 0,
        scheduleStart: a.start, scheduleFinish: a.finish,
        scheduleDuration: (a.durDays != null ? 'P' + a.durDays + 'D' : null),
        earlyStart: null, earlyFinish: null, lateStart: null, lateFinish: null,
        freeFloat: (a.freeFloatDays != null ? String(a.freeFloatDays) : null),
        totalFloat: (a.totalFloatDays != null ? String(a.totalFloatDays) : null),
        isCritical: (a.critical ? 1 : 0),
        status: STATUS[a.status] || a.status || null,
      });
    });
    var taskSequences = parsed.relationships.map(function (r) {
      return { predId: 'A:' + r.pred, succId: 'A:' + r.succ, type: r.type, lag: r.lagDays || 0 };
    });
    return {
      schedules: [{ id: schedId, name: parsed.project.name, status: 'Imported', created: opts.createdDate || null }],
      tasks: tasks,
      taskSequences: taskSequences,
      taskElements: [],   // EMPTY — P6 carries no model guids; bind via ScheduleAuthor.assignElement
      calendars: (parsed.calendars || []).map(function (c) {
        return { name: c.name, recurrenceType: null, raw: (c.raw != null ? String(c.raw) : null) };
      }),
      _meta: { hoursPerDay: parsed.project.hpd, summaryCount: parsed.wbs.length, leafCount: parsed.activities.length },
    };
  }

  // ── adopt: write the mapped rows into a live DB exactly as import_db_builder's capture path does ──
  // (the SAME INSERTs import_db_builder.js:92-139 runs; kept here so node witnesses + the future drop
  // handler share one writer). After this, ScheduleAuthor.activeSchedule(db) detects it as captured.
  var WIDE_TASKS_DDL = 'tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)';
  // Some shipped building DBs carry a LEGACY-THIN `tasks` table (7 cols). Mirror schedule_author
  // ._ensureWideTasks: carry any legacy rows forward, then drop+recreate to the widened DDL, so the
  // 18-col INSERT below succeeds. Idempotent — returns immediately if already widened.
  function _ensureWideTasks(db) {
    db.run('CREATE TABLE IF NOT EXISTS ' + WIDE_TASKS_DDL);
    var cols = [];
    try { var pr = db.exec('PRAGMA table_info(tasks)'); if (pr.length) pr[0].values.forEach(function (c) { cols.push(c[1]); }); } catch (e) {}
    if (cols.indexOf('wbs_parent') >= 0) return false;
    var hasStart = cols.indexOf('start_date') >= 0, legacy = [];
    var r = db.exec('SELECT * FROM tasks');
    if (r.length && r[0].values.length) {
      var c = r[0].columns;
      r[0].values.forEach(function (row) { var o = {}; for (var i = 0; i < c.length; i++) o[c[i]] = row[i]; legacy.push(o); });
    }
    db.run('DROP TABLE tasks');
    db.run('CREATE TABLE ' + WIDE_TASKS_DDL);
    if (legacy.length) {
      var st = db.prepare('INSERT OR IGNORE INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      legacy.forEach(function (o) {
        st.run([o.task_id, o.schedule_id, null, o.name, null, 0,
          hasStart ? o.start_date : null, hasStart ? o.finish_date : null,
          (o.duration_days != null ? 'P' + o.duration_days + 'D' : null), null, o.status]);
      });
      st.free();
    }
    console.log('§FOREIGN_MIGRATE tasks→widened legacyRows=' + legacy.length);
    return true;
  }

  function adoptIntoDb(db, data) {
    db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
    _ensureWideTasks(db);
    db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
    db.run('CREATE TABLE IF NOT EXISTS calendars (name TEXT, recurrence_type TEXT, raw TEXT)');
    db.run('BEGIN');
    var sc = db.prepare('INSERT OR IGNORE INTO schedules VALUES (?,?,?,?)');
    data.schedules.forEach(function (s) { sc.run([s.id, s.name, s.status, s.created]); }); sc.free();
    var tk = db.prepare('INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    data.tasks.forEach(function (t) {
      tk.run([t.id, t.scheduleId, t.wbsParent, t.name, t.predefinedType, t.isSummary,
        t.scheduleStart, t.scheduleFinish, t.scheduleDuration, t.earlyStart, t.earlyFinish,
        t.lateStart, t.lateFinish, t.freeFloat, t.totalFloat, t.isCritical, null, t.status]);
    }); tk.free();
    var sq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    data.taskSequences.forEach(function (q) { sq.run([q.predId, q.succId, q.type, q.lag]); }); sq.free();
    var cl = db.prepare('INSERT INTO calendars VALUES (?,?,?)');
    data.calendars.forEach(function (c) { cl.run([c.name, c.recurrenceType, c.raw]); }); cl.free();
    db.run('COMMIT');
    console.log('§FOREIGN_ADOPT schedule=' + data.schedules[0].id + ' summary=' + data._meta.summaryCount +
      ' leaf=' + data._meta.leafCount + ' sequences=' + data.taskSequences.length + ' hpd=' + data._meta.hoursPerDay);
    return { scheduleId: data.schedules[0].id, tasks: data.tasks.length, sequences: data.taskSequences.length };
  }

  var API = { parseXER: parseXER, parsePMXML: parsePMXML, toScheduleData: toScheduleData, adoptIntoDb: adoptIntoDb };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else (global || globalThis).ForeignSchedule = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
