// schedule_author.js — §AUTHOR-1 (FUSED_4D5D_WEDGE_LANE) — the FIRST authoring slice.
// Build the 4D schedule UP from a blank model: rule-group elements into ORGANIZED phases
// (WBS) written into the IFC-native 4D tables, then craft (reassign) elements between phases.
//
// Implementing FUSED_4D5D_WEDGE_LANE.md §AUTHOR-1 — Witness: W-AUTHOR-4D-BLANK
// SOURCE OF TRUTH = the IFC-native tables `schedules`/`tasks`/`task_elements` ONLY
// (per §AUTHOR-1 "NOT a new kernel_ops op; corrected 2026-06-23"). kernel_ops mirroring deferred.
//
// Pure, DOM-free, node-testable. `materializeDefault` writes EXACTLY the substrate that
// injectGantt's `_cap` overlay (time_machine.js ~2405) reads: dated, non-summary leaf tasks +
// task_elements assignments. The task->guid row IS the P2 identity-link (survives rename).
(function (global) {
  'use strict';

  // matchRule — REPLICATES time_machine.js matchRule EXACTLY (longest-substring containment),
  // so authored phases are identical to what injectGantt would group elements into.
  function matchRule(cls, rules, dflt) {
    rules = rules || {};
    dflt = dflt || { phase: 'Architecture', sequence: 6, resource: null };
    if (!cls) return dflt;
    var bestKey = null, bestLen = 0;
    for (var key in rules) {
      if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
    }
    return bestKey ? rules[bestKey] : dflt;
  }

  function _slug(name) {
    return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // YYYY-MM-DD a given number of whole days after a base date string. Pure UTC arithmetic so
  // it is deterministic regardless of host timezone (no Date.now / locale dependence).
  function _addDays(baseStr, days) {
    var b = Date.parse(baseStr + 'T00:00:00Z');
    var d = new Date(b + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function _cols(db, table) {
    var out = [];
    try {
      var r = db.exec('PRAGMA table_info(' + table + ')');
      if (r.length && r[0].values.length) r[0].values.forEach(function (c) { out.push(c[1]); });
    } catch (e) {}
    return out;
  }

  // Some shipped building DBs carry a LEGACY-thin `tasks` table
  // (task_id, schedule_id, name, start_date, finish_date, duration_days, status) that the read-path
  // `_cap` cannot consume (its query selects schedule_start/is_summary → errors → generative
  // fallback). Migrate it to the widened import_db_builder DDL so authored rows are readable.
  // Safe: maps the thin columns forward (no data loss), then drops + recreates.
  function _ensureWideTasks(db) {
    db.run('CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
    var cols = _cols(db, 'tasks');
    if (cols.indexOf('wbs_parent') >= 0) return false;        // already widened
    // Carry forward any legacy rows (start_date/finish_date/duration_days → schedule_*).
    var legacy = [];
    var hasStart = cols.indexOf('start_date') >= 0;
    var r = db.exec('SELECT * FROM tasks');
    if (r.length && r[0].values.length) {
      var c = r[0].columns;
      r[0].values.forEach(function (row) {
        var o = {}; for (var i = 0; i < c.length; i++) o[c[i]] = row[i];
        legacy.push(o);
      });
    }
    db.run('DROP TABLE tasks');
    db.run('CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
    if (legacy.length) {
      var st = db.prepare('INSERT OR IGNORE INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      legacy.forEach(function (o) {
        st.run([o.task_id, o.schedule_id, null, o.name, null, 0,
          hasStart ? o.start_date : null, hasStart ? o.finish_date : null,
          (o.duration_days != null ? 'P' + o.duration_days + 'D' : null), null, o.status]);
      });
      st.free();
    }
    console.log('§AUTHOR_MIGRATE tasks→widened legacyRows=' + legacy.length);
    return true;
  }

  // materializeDefault(db, rules, opts) — originate the smart-default schedule on a blank model.
  // db: a sql.js Database with `elements_meta`. rules: SEQUENCE_RULES map. opts: {start, phaseDays,
  // scheduleId, defaultRule}. Idempotent — rebuilds the SCH_AUTHORED schedule from scratch.
  function materializeDefault(db, rules, opts) {
    opts = opts || {};
    var start = opts.start || '2026-01-01';
    var phaseDays = opts.phaseDays || 30;
    var schedId = opts.scheduleId || 'SCH_AUTHORED';
    var dflt = opts.defaultRule || (global.SEQUENCE_DEFAULT) || { phase: 'Architecture', sequence: 6, resource: null };
    rules = rules || (global.SEQUENCE_RULES) || {};

    // Ensure the IFC-native 4D tables exist (mirror import_db_builder.js DDL exactly).
    db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
    _ensureWideTasks(db);   // migrate any legacy-thin tasks table → the widened DDL `_cap` reads
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');

    // Idempotent rebuild: drop any prior authored rows for this schedule.
    var oldIds = [];
    var pr = db.exec("SELECT task_id FROM tasks WHERE schedule_id='" + schedId + "'");
    if (pr.length && pr[0].values.length) pr[0].values.forEach(function (r) { oldIds.push(r[0]); });
    oldIds.forEach(function (tid) { db.run('DELETE FROM task_elements WHERE task_id=?', [tid]); });
    db.run("DELETE FROM tasks WHERE schedule_id='" + schedId + "'");
    db.run("DELETE FROM schedules WHERE schedule_id='" + schedId + "'");

    // Read the raw material: every element + its class.
    var elems = [];
    var er = db.exec('SELECT guid, ifc_class FROM elements_meta');
    if (er.length && er[0].values.length) {
      er[0].values.forEach(function (r) { elems.push({ guid: r[0], cls: r[1] }); });
    }

    // Group into phases via the SAME rule the read-path uses.
    var phases = {};   // phaseName -> { name, seq, guids:[] }
    elems.forEach(function (e) {
      var rule = matchRule(e.cls, rules, dflt);
      var p = phases[rule.phase];
      if (!p) { p = phases[rule.phase] = { name: rule.phase, seq: rule.sequence, guids: [] }; }
      if (rule.sequence < p.seq) p.seq = rule.sequence;   // phase ordered by its earliest rule
      p.guids.push(e.guid);
    });

    // Order phases by sequence (then name, stable) → contiguous WBS leaves.
    var ordered = Object.keys(phases).map(function (k) { return phases[k]; });
    ordered.sort(function (a, b) { return (a.seq - b.seq) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });

    db.run('INSERT INTO schedules VALUES (?,?,?,?)', [schedId, 'Authored Schedule', 'PLANNED', start]);

    // ROOT summary task (is_summary=1 → excluded from _cap leaf window; spans the whole project).
    var rootId = 'TASK_ROOT';
    var totalDays = Math.max(phaseDays, ordered.length * phaseDays);
    var projFinish = _addDays(start, ordered.length * phaseDays);
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [rootId, schedId, null, 'Project', 'CONSTRUCTION', 1, start, projFinish, 'P' + totalDays + 'D', null, 'PLANNED']);

    var stmtTk = db.prepare('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    var outPhases = [], cursor = 0, assignN = 0;
    ordered.forEach(function (p) {
      var tid = 'TASK_' + _slug(p.name);
      var s = _addDays(start, cursor * phaseDays);
      var f = _addDays(start, (cursor + 1) * phaseDays);
      cursor++;
      // Leaf, dated, is_summary=0 → exactly what _cap.win picks up.
      stmtTk.run([tid, schedId, rootId, p.name, 'CONSTRUCTION', 0, s, f, 'P' + phaseDays + 'D', null, 'PLANNED']);
      p.guids.forEach(function (g) { stmtTe.run([tid, g]); assignN++; });
      outPhases.push({ taskId: tid, name: p.name, sequence: p.seq, start: s, finish: f, count: p.guids.length });
    });
    stmtTk.free();
    stmtTe.free();

    console.log('§AUTHOR_MATERIALIZE schedule=' + schedId + ' phases=' + outPhases.length +
      ' leafTasks=' + outPhases.length + ' assignments=' + assignN + ' elements=' + elems.length);
    return { scheduleId: schedId, rootId: rootId, phases: outPhases, taskCount: outPhases.length, assignmentCount: assignN };
  }

  // assignElement(db, guid, taskId) — the CRAFT verb. Re-home one element to a different phase task.
  // The reassignment IS the user override; the task->guid row is the P2 identity-link.
  function assignElement(db, guid, taskId) {
    var tk = db.exec('SELECT task_id FROM tasks WHERE task_id=?', [taskId]);
    if (!tk.length || !tk[0].values.length) {
      console.log('§AUTHOR_ASSIGN_FAIL guid=' + guid + ' taskId=' + taskId + ' reason=no_such_task');
      return { ok: false, guid: guid, taskId: taskId, reason: 'no_such_task' };
    }
    db.run('DELETE FROM task_elements WHERE guid=?', [guid]);
    db.run('INSERT OR IGNORE INTO task_elements VALUES (?,?)', [taskId, guid]);
    console.log('§AUTHOR_ASSIGN guid=' + guid + ' -> task=' + taskId);
    return { ok: true, guid: guid, taskId: taskId };
  }

  var API = {
    matchRule: matchRule,
    materializeDefault: materializeDefault,
    assignElement: assignElement
  };
  if (typeof window !== 'undefined') window.ScheduleAuthor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleAuthor = API;

  console.log('§SCHEDULE_AUTHOR_LOADED v1');
})(typeof self !== 'undefined' ? self : this);
