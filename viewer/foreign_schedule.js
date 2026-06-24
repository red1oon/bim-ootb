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

  // ── §B1 BIM-Bind token (prompts/AUTOBIND_BY_CONVENTION.md) ──────────────────────────────────────
  // A DECLARED predicate the planner appends to the activity NAME (free-text in XER/PMXML/MSPDI):
  //     @<discipline>:<IfcClass>[|<IfcClass>…][:<storey>]
  //   e.g.  "Columns @STR:IfcColumn"   "Internal Finishes @ARC:IfcCovering:Level 3"
  //         "Structural Framing @STR:IfcMember|IfcBeam"
  // NOT a GUID (rots on re-export) and NOT a fuzzy name guess — a model-independent selector we EXECUTE.
  // parseBindToken(name) → { cleanName, selector|null }. selector = {discipline, classes[], storey}.
  // Tolerant: a name with no '@…' token returns {cleanName:trimmed, selector:null}. The token is parsed
  // OFF so the stored/displayed WBS label is the clean name (the convention never pollutes the schedule).
  // Case-exact (documented): discipline/class/storey match elements_meta verbatim.
  var _BIND_TOKEN = /@([A-Za-z][\w]*):([A-Za-z][\w]*(?:\|[A-Za-z][\w]*)*)(?::([^@]+?))?\s*$/;
  function parseBindToken(name) {
    var s = String(name == null ? '' : name);
    var m = s.match(_BIND_TOKEN);
    if (!m) return { cleanName: s.trim(), selector: null };
    var clean = s.slice(0, m.index).replace(/\s+$/, '').trim();
    return {
      cleanName: clean || s.trim(),
      selector: { discipline: m[1], classes: m[2].split('|'), storey: (m[3] != null ? m[3].trim() : null) },
    };
  }

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

  // ── MSPDI reader: MS Project XML (schemas.microsoft.com/project) ─────────────────────────────────
  // Differs from P6: no separate WBS objects — summary tasks ARE the WBS, hierarchy from OutlineLevel;
  // durations are ISO PT#H#M#S; TotalSlack/LinkLag are integers in TENTHS OF A MINUTE; relationship
  // Type is a code (0=FF,1=FS,2=SF,3=SS) on a <PredecessorLink> inside the SUCCESSOR task.
  var MSP_TYPE = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' };
  function _ptHours(s) {
    if (!s) return null;
    var m = String(s).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) { var n = parseFloat(s); return isNaN(n) ? null : n; }
    return (parseInt(m[1] || 0, 10)) + (parseInt(m[2] || 0, 10)) / 60 + (parseInt(m[3] || 0, 10)) / 3600;
  }
  function parseMSPDI(text) {
    text = String(text);
    var head = text.split(/<Tasks>/)[0];
    var mpd = parseFloat(_tag(head, 'MinutesPerDay'));
    var hpd = (mpd && mpd > 0) ? mpd / 60 : 8;
    var tenthsToDays = function (v) { var n = parseFloat(v); return isNaN(n) ? null : n / 10 / 60 / hpd; };

    var wbs = [], activities = [], relationships = [];
    var parentAt = {};   // outlineLevel -> uid of last task seen at that level
    _blocks(text, 'Task').forEach(function (b) {
      var uid = _tag(b, 'UID');
      if (uid == null) return;
      var lvl = parseInt(_tag(b, 'OutlineLevel') || '1', 10);
      var isSummary = _tag(b, 'Summary') === '1';
      var parent = (lvl > 1 && parentAt[lvl - 1] != null) ? parentAt[lvl - 1] : null;
      parentAt[lvl] = uid;
      Object.keys(parentAt).forEach(function (k) { if (+k > lvl) delete parentAt[k]; });
      // PredecessorLink(s) → relationships (this task is the successor)
      _blocks(b, 'PredecessorLink').forEach(function (pl) {
        var pu = _tag(pl, 'PredecessorUID');
        if (pu == null) return;
        relationships.push({ pred: pu, succ: uid, type: MSP_TYPE[_tag(pl, 'Type')] || 'FS', lagDays: tenthsToDays(_tag(pl, 'LinkLag')) || 0 });
      });
      if (isSummary) {
        wbs.push({ id: uid, code: _tag(b, 'OutlineNumber') || '', name: _tag(b, 'Name'), parent: parent });
      } else {
        var tf = tenthsToDays(_tag(b, 'TotalSlack'));
        activities.push({
          id: uid, code: uid, name: _tag(b, 'Name'), wbs: parent,
          start: dateOnly(_tag(b, 'Start')), finish: dateOnly(_tag(b, 'Finish')),
          durDays: (function () { var h = _ptHours(_tag(b, 'Duration')); return h == null ? null : h / hpd; })(),
          totalFloatDays: tf, freeFloatDays: tenthsToDays(_tag(b, 'FreeSlack')),
          critical: _tag(b, 'Critical') === '1' || (tf != null && tf <= 0),
          status: null,
        });
      }
    });
    return {
      project: { id: _tag(head, 'Title') || _tag(head, 'Name') || 'MSP', name: _tag(head, 'Name') || 'MS Project', hpd: hpd },
      calendars: [{ name: _tag(head, 'Name') || 'Standard', hpd: hpd, raw: String(mpd || hpd * 60) }],
      wbs: wbs, activities: activities, relationships: relationships,
    };
  }

  // ── parseForeign(text, filename) — content-sniff dispatcher across the three readers ─────────────
  function parseForeign(text, filename) {
    var t = String(text), f = String(filename || '');
    if (/\.xer$/i.test(f) || /^\s*(ERMHDR|%T)\b/.test(t)) return { format: 'XER', parsed: parseXER(t) };
    if (/schemas\.microsoft\.com\/project/.test(t) || (/<Tasks>/.test(t) && /<OutlineLevel>/.test(t))) return { format: 'MSPDI', parsed: parseMSPDI(t) };
    if (/APIBusinessObjects/.test(t) || /<Activity>/.test(t)) return { format: 'PMXML', parsed: parsePMXML(t) };
    // last resort: try XER then PMXML
    try { var x = parseXER(t); if (x.activities.length) return { format: 'XER', parsed: x }; } catch (e) {}
    return { format: 'PMXML', parsed: parsePMXML(t) };
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
    // leaf rows from activities. §B1: parse any BIM-Bind token OFF the name → cleaned label + selector.
    parsed.activities.forEach(function (a) {
      var bt = parseBindToken(a.name);
      tasks.push({
        id: 'A:' + a.id, scheduleId: schedId, wbsParent: (a.wbs != null ? 'W:' + a.wbs : null),
        name: bt.cleanName, bindSelector: bt.selector, predefinedType: null, isSummary: 0,
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
    // §B2 — persist any DECLARED bind selector so autoBind(db, scheduleId) is self-contained and the
    // selector survives a model re-export (re-resolvable; a guid list could not). Reviewable, opt-in.
    db.run('CREATE TABLE IF NOT EXISTS task_bind_selectors (task_id TEXT PRIMARY KEY, selector_json TEXT)');
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
    var nSel = 0;
    var bs = db.prepare('INSERT OR REPLACE INTO task_bind_selectors VALUES (?,?)');
    data.tasks.forEach(function (t) { if (t.bindSelector) { bs.run([t.id, JSON.stringify(t.bindSelector)]); nSel++; } }); bs.free();
    db.run('COMMIT');
    if (nSel) console.log('§FOREIGN_BIND_SELECTORS stored=' + nSel + ' (declared @disc:class tokens — run autoBind to resolve)');
    console.log('§FOREIGN_ADOPT schedule=' + data.schedules[0].id + ' summary=' + data._meta.summaryCount +
      ' leaf=' + data._meta.leafCount + ' sequences=' + data.taskSequences.length + ' hpd=' + data._meta.hoursPerDay);
    return { scheduleId: data.schedules[0].id, tasks: data.tasks.length, sequences: data.taskSequences.length };
  }

  // ── §B2 autoBind: resolve the DECLARED selectors against the model, pre-bind task_elements ───────
  // autoBind(db, scheduleId) — for every task carrying a stored bind selector, run the EXACT predicate
  //   SELECT guid FROM elements_meta WHERE ifc_class IN(…) [AND discipline=…] [AND storey=…]
  // and bind each matched guid (DELETE-then-INSERT = ScheduleAuthor.assignElement's effect, kept inline
  // so foreign_schedule.js stays dependency-free). This is the SAME predicate the manual sidecar
  // (Hospital_GW_binding.json) declared, folded INTO the file — so it reproduces the manual bind exactly.
  // OPT-IN (the caller decides to invoke it) and REVIEWABLE — returns a per-activity summary, never
  // silent. Coarse on purpose (binds ALL matches per task); refine later with breakdownByAttribute.
  // Returns { bound, perActivity:[{taskId,name,selector,matched}], unresolved:[{taskId,name,selector}] }.
  function _sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  function autoBind(db, scheduleId) {
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
    var perActivity = [], unresolved = [], bound = 0;
    var sr;
    try {
      sr = db.exec('SELECT s.task_id, s.selector_json, t.name FROM task_bind_selectors s ' +
        'JOIN tasks t ON t.task_id=s.task_id' + (scheduleId ? ' WHERE t.schedule_id=' + _sqlStr(scheduleId) : ''));
    } catch (e) { console.log('§AUTOBIND_NONE no task_bind_selectors table'); return { bound: 0, perActivity: [], unresolved: [] }; }
    if (!sr.length || !sr[0].values.length) { console.log('§AUTOBIND_NONE schedule=' + scheduleId + ' (no declared selectors)'); return { bound: 0, perActivity: [], unresolved: [] }; }
    sr[0].values.forEach(function (row) {
      var taskId = row[0], name = row[2], sel;
      try { sel = JSON.parse(row[1]); } catch (e) { return; }
      var classes = (sel.classes || []).filter(Boolean);
      if (!classes.length) { unresolved.push({ taskId: taskId, name: name, selector: sel }); return; }
      var inList = classes.map(_sqlStr).join(',');
      var sql = 'SELECT guid FROM elements_meta WHERE ifc_class IN (' + inList + ')' +
        (sel.discipline ? ' AND discipline=' + _sqlStr(sel.discipline) : '') +
        (sel.storey ? ' AND storey=' + _sqlStr(sel.storey) : '');
      var gr = db.exec(sql);
      var guids = (gr.length && gr[0].values.length) ? gr[0].values.map(function (x) { return x[0]; }) : [];
      guids.forEach(function (g) {
        db.run('DELETE FROM task_elements WHERE guid=?', [g]);
        db.run('INSERT OR IGNORE INTO task_elements VALUES (?,?)', [taskId, g]);
      });
      var selStr = (sel.discipline ? sel.discipline + ':' : '') + classes.join('|') + (sel.storey ? ':' + sel.storey : '');
      console.log('§AUTOBIND task=' + taskId + ' selector=' + selStr + ' matched=' + guids.length);
      bound += guids.length;
      if (guids.length) perActivity.push({ taskId: taskId, name: name, selector: sel, matched: guids.length });
      else unresolved.push({ taskId: taskId, name: name, selector: sel });
    });
    console.log('§AUTOBIND_SUMMARY schedule=' + scheduleId + ' boundElements=' + bound +
      ' activities=' + perActivity.length + ' unresolved=' + unresolved.length);
    return { bound: bound, perActivity: perActivity, unresolved: unresolved };
  }

  var API = { parseXER: parseXER, parsePMXML: parsePMXML, parseMSPDI: parseMSPDI, parseForeign: parseForeign,
    toScheduleData: toScheduleData, adoptIntoDb: adoptIntoDb, parseBindToken: parseBindToken, autoBind: autoBind };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else (global || globalThis).ForeignSchedule = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
