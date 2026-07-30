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

  // matchNameOverride — REPLICATES time_machine.js matchNameOverride EXACTLY. §4D_FACADE_ORDER:
  // ifc_class alone cannot tell curtain-wall glazing/framing (IfcPlate/IfcMember) from genuinely
  // structural plates/members. Checked BEFORE matchRule, never replacing it — see rates/sequence_rules.json.
  function matchNameOverride(cls, name, nameOverrides) {
    if (!name || !nameOverrides) return null;
    for (var i = 0; i < nameOverrides.length; i++) {
      var ov = nameOverrides[i];
      if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
      if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
      if (ov._re && ov._re.test(name)) return ov;
    }
    return null;
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
    var blank = !!opts.blank;   // §MI-FLOW true-blank start: organize phases+assignments but leave
                                // them UNDATED so the user originates the schedule (nothing shows in
                                // the TM until dated → _cap skips NULL-dated tasks).
    rules = rules || (global.SEQUENCE_RULES) || {};
    var nameOverrides = opts.nameOverrides || (global.SEQUENCE_NAME_OVERRIDES) || [];

    // Ensure the IFC-native 4D tables exist (mirror import_db_builder.js DDL exactly).
    db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
    _ensureWideTasks(db);   // migrate any legacy-thin tasks table → the widened DDL `_cap` reads
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');

    // §SE-5a: one transaction around the whole rebuild (delete + insert). Without this, sql.js pays
    // per-statement implicit-commit overhead on EVERY row — for a large building (tens of thousands of
    // elements) that is a multi-second, unbroken main-thread block (measured 4.3s/63k els, 10.4s/123k
    // els pre-fix) long enough to trip Chrome's "Page Unresponsive" prompt. Batching is the standard
    // SQLite bulk-write fix, not a new algorithm. Same rows, same order, same output — write cost only.
    db.run('BEGIN TRANSACTION');

    // Idempotent rebuild: drop any prior authored rows for this schedule.
    var oldIds = [];
    var pr = db.exec("SELECT task_id FROM tasks WHERE schedule_id='" + schedId + "'");
    if (pr.length && pr[0].values.length) pr[0].values.forEach(function (r) { oldIds.push(r[0]); });
    oldIds.forEach(function (tid) { db.run('DELETE FROM task_elements WHERE task_id=?', [tid]); });
    db.run("DELETE FROM tasks WHERE schedule_id='" + schedId + "'");
    db.run("DELETE FROM schedules WHERE schedule_id='" + schedId + "'");

    // Read the raw material: every element + its class + name (name feeds matchNameOverride).
    var elems = [];
    var er = db.exec('SELECT guid, ifc_class, COALESCE(element_name,\'\') FROM elements_meta');
    if (er.length && er[0].values.length) {
      er[0].values.forEach(function (r) { elems.push({ guid: r[0], cls: r[1], name: r[2] }); });
    }

    // Group into phases via the SAME rule the read-path uses.
    var phases = {};   // phaseName -> { name, seq, guids:[] }
    var nameOverridden = 0;
    elems.forEach(function (e) {
      var ov = matchNameOverride(e.cls, e.name, nameOverrides);
      if (ov) nameOverridden++;
      var rule = ov || matchRule(e.cls, rules, dflt);
      var p = phases[rule.phase];
      if (!p) { p = phases[rule.phase] = { name: rule.phase, seq: rule.sequence, guids: [] }; }
      if (rule.sequence < p.seq) p.seq = rule.sequence;   // phase ordered by its earliest rule
      p.guids.push(e.guid);
    });
    if (nameOverridden) console.log('§NAME_OVERRIDE ' + nameOverridden + ' elements reclassified by name (' +
      nameOverrides.map(function (o) { return o.id; }).join(',') + ') — see rates/sequence_rules.json NAME_OVERRIDES');

    // Order phases by sequence (then name, stable) → contiguous WBS leaves.
    var ordered = Object.keys(phases).map(function (k) { return phases[k]; });
    ordered.sort(function (a, b) { return (a.seq - b.seq) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });

    db.run('INSERT INTO schedules VALUES (?,?,?,?)', [schedId, 'Authored Schedule', 'PLANNED', start]);

    // ROOT summary task (is_summary=1 → excluded from _cap leaf window; spans the whole project).
    // In blank mode dates are NULL (the user originates them via scheduleDefault/the wizard).
    var rootId = 'TASK_ROOT';
    var totalDays = Math.max(phaseDays, ordered.length * phaseDays);
    var rootStart = blank ? null : start;
    var rootFinish = blank ? null : _addDays(start, ordered.length * phaseDays);
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [rootId, schedId, null, 'Project', 'CONSTRUCTION', 1, rootStart, rootFinish, blank ? null : 'P' + totalDays + 'D', null, 'PLANNED']);

    var stmtTk = db.prepare('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    var outPhases = [], cursor = 0, assignN = 0;
    ordered.forEach(function (p) {
      var tid = 'TASK_' + _slug(p.name);
      var s = blank ? null : _addDays(start, cursor * phaseDays);
      var f = blank ? null : _addDays(start, (cursor + 1) * phaseDays);
      cursor++;
      // Leaf, is_summary=0. Dated → _cap.win picks it up; blank/undated → _cap skips it (the user
      // originates the dates, then it appears in the timeline). Assignments are made either way.
      stmtTk.run([tid, schedId, rootId, p.name, 'CONSTRUCTION', 0, s, f, blank ? null : 'P' + phaseDays + 'D', null, 'PLANNED']);
      p.guids.forEach(function (g) { stmtTe.run([tid, g]); assignN++; });
      outPhases.push({ taskId: tid, name: p.name, sequence: p.seq, start: s, finish: f, count: p.guids.length });
    });
    stmtTk.free();
    stmtTe.free();

    db.run('COMMIT');   // §SE-5a — single commit for the whole rebuild

    console.log('§AUTHOR_MATERIALIZE schedule=' + schedId + ' mode=' + (blank ? 'blank' : 'dated') +
      ' phases=' + outPhases.length + ' leafTasks=' + outPhases.length +
      ' assignments=' + assignN + ' elements=' + elems.length);
    return { scheduleId: schedId, rootId: rootId, phases: outPhases, taskCount: outPhases.length, assignmentCount: assignN, blank: blank };
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

  // activeSchedule(db) — detect the schedule the wizard should EDIT. A model dropped from Bonsai/Revit
  // arrives WITH a native IFC schedule (import_worker captures IfcWorkSchedule/IfcTask into these same
  // tables, keyed by IFC GlobalId — NOT 'SCH_AUTHORED'). So the wizard must recognize an imported
  // (captured) schedule and edit IT, never rule-generate a competing one (_cap reads ALL schedule_ids
  // → two schedules = a doubled timeline). Priority: the user's own SCH_AUTHORED draft, else the
  // imported schedule. Returns {id, name, taskCount, authored, captured} or null when no dated schedule.
  function activeSchedule(db) {
    var r;
    try {
      r = db.exec("SELECT schedule_id, COUNT(*) AS n FROM tasks " +
        "WHERE schedule_start IS NOT NULL AND (is_summary IS NULL OR is_summary=0) AND schedule_id IS NOT NULL " +
        "GROUP BY schedule_id");
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;
    var list = r[0].values.map(function (row) {
      return { id: row[0], taskCount: row[1], authored: row[0] === 'SCH_AUTHORED' };
    });
    try {
      var nr = db.exec("SELECT schedule_id, name FROM schedules");
      if (nr.length && nr[0].values.length) {
        var nm = {}; nr[0].values.forEach(function (x) { nm[x[0]] = x[1]; });
        list.forEach(function (s) { s.name = nm[s.id] || s.id; });
      }
    } catch (e) {}
    list.forEach(function (s) { if (!s.name) s.name = s.id; });
    var authored = list.filter(function (s) { return s.authored; })[0];
    var pick = authored || list[0];
    pick.captured = !pick.authored;
    console.log('§AUTHOR_DETECT schedules=' + list.length + ' active=' + pick.id +
      ' captured=' + pick.captured + ' tasks=' + pick.taskCount);
    return pick;
  }

  // scheduleContiguous(db, scheduleId, opts) — §MI-FLOW: the user's deliberate "originate the dates"
  // act (the optional "suggest a start"). Lays the leaf phases out contiguously from opts.start so
  // a blank-materialized (undated) schedule becomes datable on demand. Orders by rowid = insert
  // order = the sequence order materializeDefault used (NULL dates can't be ORDER BY'd).
  function scheduleContiguous(db, scheduleId, opts) {
    scheduleId = scheduleId || 'SCH_AUTHORED';
    opts = opts || {};
    var start = opts.start || '2026-01-01';
    var phaseDays = opts.phaseDays || 30;
    var lr = db.exec("SELECT task_id FROM tasks WHERE schedule_id='" + scheduleId +
      "' AND (is_summary IS NULL OR is_summary=0) ORDER BY rowid");
    var ids = (lr.length && lr[0].values.length) ? lr[0].values.map(function (r) { return r[0]; }) : [];
    var cursor = 0;
    db.run('BEGIN TRANSACTION');   // §SE-5a — same per-statement-overhead fix as materializeDefault
    ids.forEach(function (tid) {
      var s = _addDays(start, cursor), f = _addDays(start, cursor + phaseDays);
      db.run("UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?",
        [s, f, 'P' + phaseDays + 'D', tid]);
      cursor += phaseDays;
    });
    db.run("UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE schedule_id=? AND is_summary=1",
      [start, _addDays(start, cursor), scheduleId]);
    db.run('COMMIT');
    console.log('§AUTHOR_SCHEDULE schedule=' + scheduleId + ' phases=' + ids.length + ' from=' + start + ' span=' + cursor + 'd');
    return { scheduled: ids.length, start: start, span: cursor };
  }

  // foldCost(db, scheduleId, RATES, ratesDefault, currency) — §AUTHOR-1 step ④ (5D).
  // The cost breakdown is a FOLD, not hand-entry: each leaf phase's cost = Σ of its assigned
  // elements' 5D cost (quantity × rate). NON-INVENT — reuses the shipped 5D model verbatim
  // (analysis_sidecar.js compute5D quantity expressions + rates.js RATES/RATES_DEFAULT). Because
  // cost rolls up FROM task_elements, reassigning an element (assignElement) moves its cost between
  // phases — the authored WBS organizes the cost. Returns per-phase cost + project total.
  function foldCost(db, scheduleId, RATES, ratesDefault, currency) {
    scheduleId = scheduleId || 'SCH_AUTHORED';
    RATES = RATES || {};
    ratesDefault = ratesDefault || { rate: 0, unit: 'EA', desc: 'unmapped' };
    // dominant-face area = longest × second-longest bbox edge (same expr as compute5D).
    var areaExpr =
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
      "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
      "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
      "ELSE MAX(t.bbox_x,t.bbox_y) END";

    // Seed every leaf phase (so a phase whose elements lack bbox still appears, cost 0).
    var phaseOf = {}, order = [];
    var pr = db.exec("SELECT task_id, name FROM tasks WHERE schedule_id='" + scheduleId +
      "' AND (is_summary IS NULL OR is_summary=0) ORDER BY schedule_start, task_id");
    if (pr.length && pr[0].values.length) pr[0].values.forEach(function (r) {
      phaseOf[r[0]] = { taskId: r[0], name: r[1] || r[0], cost: 0, elements: 0 };
      order.push(r[0]);
    });

    var unmapped = {};
    var q = "SELECT te.task_id, m.ifc_class, " +
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) AS lng, " + areaExpr + " AS area, " +
      "t.bbox_x*t.bbox_y*t.bbox_z AS vol " +
      "FROM task_elements te " +
      "JOIN tasks tk ON tk.task_id=te.task_id AND tk.schedule_id='" + scheduleId +
      "' AND (tk.is_summary IS NULL OR tk.is_summary=0) " +
      "JOIN elements_meta m ON m.guid=te.guid " +
      "JOIN element_transforms t ON t.guid=te.guid " +
      "WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0";
    var er = db.exec(q);
    var total = 0;
    if (er.length && er[0].values.length) {
      er[0].values.forEach(function (row) {
        var tid = row[0], cls = row[1], lng = row[2] || 0, area = row[3] || 0, vol = row[4] || 0;
        var rt = RATES[cls]; if (!rt) { rt = ratesDefault; unmapped[cls] = (unmapped[cls] || 0) + 1; }
        var unit = rt.unit || 'EA';
        var qty = unit === 'M' ? lng : unit === 'M2' ? area : unit === 'M3' ? vol : 1;
        var cost = Math.round((rt.rate || 0) * qty);
        var p = phaseOf[tid]; if (!p) return;   // element on a summary/foreign task — skip
        p.cost += cost; p.elements++; total += cost;
      });
    }
    var phases = order.map(function (tid) { return phaseOf[tid]; });
    var unmappedClasses = Object.keys(unmapped);
    console.log('§AUTHOR_COST schedule=' + scheduleId + ' total=' + total +
      ' phases=' + phases.length + ' unmappedClasses=' + unmappedClasses.length +
      (unmappedClasses.length ? ' [' + unmappedClasses.join(',') + ']' : ''));
    return { currency: currency || '', total: total, phases: phases, unmappedClasses: unmappedClasses };
  }

  // ── §SE-1 — WBS outline + dependency CRUD (the MSP-grade Gantt arc, step 1+2) ──────────────
  // Pure, DOM-free reads/writes over the IFC-native tables. The schedule editor's NEW-TAB surface
  // (schedule_editor_ui.js) renders these; the engine stays node-testable (W-SCHED-EDIT). Writes go
  // STRAIGHT to task_sequences — the IFC-native dependency truth — exactly as assignElement writes
  // task_elements (kernel_ops signing still deferred; §SE-D signed broadcast is a later slice).

  var SEQ_TYPES = ['FS', 'SS', 'FF', 'SF'];   // IfcSequenceEnum: FINISH_START/START_START/FINISH_FINISH/START_FINISH

  // wbsTree(db, scheduleId) — fold tasks.wbs_parent/is_summary into a nested tree. Roots = rows whose
  // wbs_parent is null OR points outside this schedule's id set. Returns [{id,name,isSummary,start,
  // finish,guidCount,children[]}] depth-first. Pure read; the collapsible outline renders this.
  function wbsTree(db, scheduleId) {
    var r;
    try {
      r = db.exec('SELECT task_id, wbs_parent, name, is_summary, schedule_start, schedule_finish, ' +
        'is_critical, total_float, free_float, schedule_duration, status FROM tasks WHERE schedule_id=? ', [scheduleId]);
    } catch (e) { return []; }
    if (!r.length || !r[0].values.length) return [];
    var nodes = {}, ids = {};
    // §XER/PMXML writer (prompts/XER_PMXML_WRITER_LANE.md §3.3): freeFloat/durDays/status are ADDITIVE
    // fields — already stored in the wide `tasks` table by adoptIntoDb, just not read here before this.
    // No schema change, no new columns; existing callers never destructured these and are unaffected.
    r[0].values.forEach(function (row) {
      ids[row[0]] = true;
      var durM = /^P(-?\d+(?:\.\d+)?)D$/.exec(row[9] || '');
      nodes[row[0]] = { id: row[0], parent: row[1], name: row[2] || row[0],
        isSummary: !!row[3], start: row[4] || null, finish: row[5] || null,
        critical: row[6] === 1, totalFloat: (row[7] != null ? row[7] : null),
        freeFloat: (row[8] != null ? row[8] : null),
        durDays: (durM ? parseFloat(durM[1]) : null),
        status: row[10] || null,
        guidCount: 0, children: [] };
    });
    // Element counts per task (the "N elements" badge on a leaf).
    try {
      var cr = db.exec('SELECT te.task_id, COUNT(*) FROM task_elements te ' +
        'JOIN tasks t ON t.task_id=te.task_id WHERE t.schedule_id=? GROUP BY te.task_id', [scheduleId]);
      if (cr.length && cr[0].values.length) cr[0].values.forEach(function (row) {
        if (nodes[row[0]]) nodes[row[0]].guidCount = row[1];
      });
    } catch (e) {}
    var roots = [];
    Object.keys(nodes).forEach(function (id) {
      var n = nodes[id];
      if (n.parent && ids[n.parent] && n.parent !== id) nodes[n.parent].children.push(n);
      else roots.push(n);
    });
    console.log('§SE_WBS schedule=' + scheduleId + ' nodes=' + Object.keys(nodes).length +
      ' roots=' + roots.length);
    return roots;
  }

  // listDependencies(db, scheduleId) — read task_sequences (pred→succ, type, lag), joined to task
  // names, scoped to the schedule via the predecessor's schedule_id. Returns
  // [{predId,predName,succId,succName,type,lag}].
  function listDependencies(db, scheduleId) {
    var r;
    try {
      r = db.exec('SELECT s.predecessor_id, p.name, s.successor_id, c.name, s.sequence_type, s.lag_days ' +
        'FROM task_sequences s ' +
        'JOIN tasks p ON p.task_id=s.predecessor_id ' +
        'JOIN tasks c ON c.task_id=s.successor_id ' +
        'WHERE p.schedule_id=? ORDER BY p.name, c.name', [scheduleId]);
    } catch (e) { return []; }
    if (!r.length || !r[0].values.length) return [];
    return r[0].values.map(function (row) {
      return { predId: row[0], predName: row[1] || row[0], succId: row[2], succName: row[3] || row[2],
        type: row[4] || 'FS', lag: (row[5] != null ? row[5] : 0) };
    });
  }

  // wouldCycle(db, predId, succId) — would adding pred→succ create a directed cycle? DFS forward from
  // succ over existing edges; if we reach pred, the new edge closes a loop. Deterministic graph-integrity
  // guard (a cyclic schedule is INVALID) — NOT resource optimisation (§SE-B: forbid the cycle, DO IT).
  function wouldCycle(db, predId, succId) {
    if (predId === succId) return true;
    var adj = {};
    try {
      var r = db.exec('SELECT predecessor_id, successor_id FROM task_sequences');
      if (r.length && r[0].values.length) r[0].values.forEach(function (row) {
        (adj[row[0]] = adj[row[0]] || []).push(row[1]);
      });
    } catch (e) {}
    var stack = [succId], seen = {};
    while (stack.length) {
      var cur = stack.pop();
      if (cur === predId) return true;
      if (seen[cur]) continue;
      seen[cur] = true;
      (adj[cur] || []).forEach(function (n) { if (!seen[n]) stack.push(n); });
    }
    return false;
  }

  // addDependency(db, predId, succId, type, lag) — author one IfcRelSequence edge. Refuses self-loop,
  // unknown task, duplicate, and any cycle. Returns {ok, reason}.
  function addDependency(db, predId, succId, type, lag) {
    type = (type || 'FS').toUpperCase();
    if (SEQ_TYPES.indexOf(type) < 0) type = 'FS';
    lag = (lag == null || isNaN(parseFloat(lag))) ? 0 : parseFloat(lag);
    function fail(reason) {
      console.log('§SE_DEP_FAIL ' + predId + '->' + succId + ' reason=' + reason);
      return { ok: false, predId: predId, succId: succId, reason: reason };
    }
    if (!predId || !succId) return fail('missing_id');
    if (predId === succId) return fail('self_loop');
    function exists(id) { var t = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [id]); return t.length && t[0].values.length; }
    if (!exists(predId) || !exists(succId)) return fail('no_such_task');
    var dup = db.exec('SELECT 1 FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    if (dup.length && dup[0].values.length) return fail('duplicate');
    if (wouldCycle(db, predId, succId)) return fail('cycle');
    db.run('INSERT INTO task_sequences VALUES (?,?,?,?)', [predId, succId, type, lag]);
    console.log('§SE_DEP_ADD ' + predId + '->' + succId + ' type=' + type + ' lag=' + lag);
    return { ok: true, predId: predId, succId: succId, type: type, lag: lag };
  }

  // removeDependency(db, predId, succId) — drop one edge. Returns {ok, removed}.
  function removeDependency(db, predId, succId) {
    var before = db.exec('SELECT COUNT(*) FROM task_sequences')[0].values[0][0];
    db.run('DELETE FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    var after = db.exec('SELECT COUNT(*) FROM task_sequences')[0].values[0][0];
    console.log('§SE_DEP_DEL ' + predId + '->' + succId + ' removed=' + (before - after));
    return { ok: before - after > 0, removed: before - after };
  }

  // updateDependency(db, predId, succId, patch) — retype (FS/SS/FF/SF) and/or set lag on an edge.
  function updateDependency(db, predId, succId, patch) {
    patch = patch || {};
    var row = db.exec('SELECT sequence_type, lag_days FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    if (!row.length || !row[0].values.length) {
      console.log('§SE_DEP_UPD_FAIL ' + predId + '->' + succId + ' reason=no_such_edge');
      return { ok: false, reason: 'no_such_edge' };
    }
    var type = row[0].values[0][0], lag = row[0].values[0][1];
    if (patch.type != null) { var t = String(patch.type).toUpperCase(); if (SEQ_TYPES.indexOf(t) >= 0) type = t; }
    if (patch.lag != null && !isNaN(parseFloat(patch.lag))) lag = parseFloat(patch.lag);
    db.run('UPDATE task_sequences SET sequence_type=?, lag_days=? WHERE predecessor_id=? AND successor_id=?',
      [type, lag, predId, succId]);
    console.log('§SE_DEP_UPD ' + predId + '->' + succId + ' type=' + type + ' lag=' + lag);
    return { ok: true, type: type, lag: lag };
  }

  // ── §SE-2 — bounded CPM forward/backward pass (step 3; the deterministic compute, NOT leveling) ──
  // Exact critical-path method over the authored task_sequences DAG, honouring FS/SS/FF/SF + lag.
  // This is the §SE-B "DO IT" half; it STOPS before resource leveling / auto-optimisation (the refuse).

  // duration in whole days: parse ISO P{n}D / P{n}W, else (finish-start), else 1.
  function _durDays(durStr, startStr, finishStr) {
    if (durStr) {
      var d = /P(?:(\d+)W)?(?:(\d+)D)?/.exec(durStr);
      if (d && (d[1] || d[2])) return (parseInt(d[1] || 0, 10) * 7) + parseInt(d[2] || 0, 10);
    }
    if (startStr && finishStr) {
      var ms = Date.parse(finishStr + 'T00:00:00Z') - Date.parse(startStr + 'T00:00:00Z');
      if (!isNaN(ms)) return Math.max(0, Math.round(ms / 86400000));
    }
    return 1;
  }

  // candidate EARLY START a predecessor imposes on a successor (forward pass + free-float reuse).
  function _fwdES(pred, lag, type, succDur) {
    switch (type) {
      case 'SS': return pred.es + lag;
      case 'FF': return pred.ef + lag - succDur;
      case 'SF': return pred.es + lag - succDur;
      default:   return pred.ef + lag;                 // FS
    }
  }
  // candidate LATE FINISH a successor imposes on a predecessor (backward pass).
  function _bwdLF(succ, lag, type, predDur) {
    var succLS = succ.lf - succ.dur;
    switch (type) {
      case 'SS': return succLS - lag + predDur;
      case 'FF': return succ.lf - lag;
      case 'SF': return succ.lf - lag + predDur;
      default:   return succLS - lag;                  // FS
    }
  }

  // moveTask(db, taskId, newStart) — §SE-3 drag-to-reschedule verb. Move one LEAF task so it starts on
  // newStart (YYYY-MM-DD), PRESERVING its duration (parsed from schedule_duration, else old finish−start,
  // else 1). Writes schedule_start/finish only — the baseline; CPM invalidation is the caller's concern
  // (mirrors the dependency-edit flow). Refuses unknown/summary tasks. Returns {ok, start, finish, days}.
  function moveTask(db, taskId, newStart) {
    var r = db.exec('SELECT is_summary, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=?', [taskId]);
    if (!r.length || !r[0].values.length) {
      console.log('§SE_MOVE_FAIL task=' + taskId + ' reason=no_such_task');
      return { ok: false, reason: 'no_such_task' };
    }
    var row = r[0].values[0];
    if (row[0] === 1) {
      console.log('§SE_MOVE_FAIL task=' + taskId + ' reason=is_summary');
      return { ok: false, reason: 'is_summary' };
    }
    var days = _durDays(row[3], row[1], row[2]);
    var finish = _addDays(newStart, days);
    db.run('UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE task_id=?', [newStart, finish, taskId]);
    console.log('§SE_MOVE task=' + taskId + ' start=' + newStart + ' finish=' + finish + ' days=' + days);
    return { ok: true, start: newStart, finish: finish, days: days };
  }

  // computeCpm(db, scheduleId, opts) — write early/late dates, float, is_critical onto the leaf tasks.
  function computeCpm(db, scheduleId, opts) {
    opts = opts || {};
    var tr;
    try {
      tr = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks ' +
        'WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [scheduleId]);
    } catch (e) { return { error: 'no_tasks' }; }
    if (!tr.length || !tr[0].values.length) return { error: 'no_tasks', tasks: [], projectDuration: 0, criticalIds: [] };
    var T = {}, ids = [], minStart = null;
    tr[0].values.forEach(function (row) {
      var id = row[0], s = row[1], f = row[2];
      if (s && (!minStart || s < minStart)) minStart = s;
      T[id] = { id: id, dur: _durDays(row[3], s, f), es: 0, ef: 0, ls: 0, lf: 0, preds: [], succs: [] };
      ids.push(id);
    });
    // edges among these leaf tasks only
    var er = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
    if (er.length && er[0].values.length) er[0].values.forEach(function (row) {
      var p = row[0], s = row[1];
      if (!T[p] || !T[s]) return;                      // skip edges touching summary/foreign tasks
      var edge = { pred: p, succ: s, type: (row[2] || 'FS').toUpperCase(), lag: (row[3] != null ? row[3] : 0) };
      T[s].preds.push(edge); T[p].succs.push(edge);
    });
    // Kahn topo sort (DAG guaranteed by the §SE-1 cycle guard; bail defensively if not).
    var indeg = {}, queue = [], topo = [];
    ids.forEach(function (id) { indeg[id] = T[id].preds.length; if (indeg[id] === 0) queue.push(id); });
    while (queue.length) {
      var id = queue.shift(); topo.push(id);
      T[id].succs.forEach(function (e) { if (--indeg[e.succ] === 0) queue.push(e.succ); });
    }
    if (topo.length !== ids.length) {
      console.log('§SE_CPM_BAIL cycle-or-orphan topo=' + topo.length + ' tasks=' + ids.length);
      return { error: 'cycle', tasks: [], projectDuration: 0, criticalIds: [] };
    }
    // FORWARD: ES/EF in topo order.
    topo.forEach(function (id) {
      var t = T[id], es = 0;
      t.preds.forEach(function (e) { es = Math.max(es, _fwdES(T[e.pred], e.lag, e.type, t.dur)); });
      t.es = Math.max(0, es); t.ef = t.es + t.dur;
    });
    var PF = 0; ids.forEach(function (id) { PF = Math.max(PF, T[id].ef); });
    // BACKWARD: LF/LS in reverse topo order.
    for (var i = topo.length - 1; i >= 0; i--) {
      var t = T[topo[i]];
      if (!t.succs.length) t.lf = PF;
      else { var lf = Infinity; t.succs.forEach(function (e) { lf = Math.min(lf, _bwdLF(T[e.succ], e.lag, e.type, t.dur)); }); t.lf = lf; }
      t.ls = t.lf - t.dur;
    }
    // float + critical + free float + write-back
    var projStart = opts.start || minStart || '2026-01-01';
    var critical = [];
    var stmt = db.prepare('UPDATE tasks SET early_start=?, early_finish=?, late_start=?, late_finish=?, ' +
      'free_float=?, total_float=?, is_critical=? WHERE task_id=?');
    var out = topo.map(function (id) {
      var t = T[id];
      var total = t.ls - t.es;
      var free = Infinity;
      t.succs.forEach(function (e) { free = Math.min(free, T[e.succ].es - _fwdES(t, e.lag, e.type, T[e.succ].dur)); });
      if (!isFinite(free)) free = total;
      free = Math.max(0, free);
      var isCrit = total <= 0 ? 1 : 0;
      if (isCrit) critical.push(id);
      stmt.run([_addDays(projStart, t.es), _addDays(projStart, t.ef),
        _addDays(projStart, t.ls), _addDays(projStart, t.lf),
        String(free), String(total), isCrit, id]);
      return { id: id, es: t.es, ef: t.ef, ls: t.ls, lf: t.lf, dur: t.dur,
        totalFloat: total, freeFloat: free, critical: !!isCrit };
    });
    stmt.free();
    console.log('§SE_CPM schedule=' + scheduleId + ' tasks=' + out.length + ' projectDuration=' + PF +
      ' critical=' + critical.length + ' [' + critical.join(',') + ']');
    return { projectDuration: PF, projectStart: projStart, tasks: out, criticalIds: critical };
  }

  // ── §SE-WBS: deepen the WBS — add a task, or break a phase down by an element attribute ──────────────
  // addTask(db, scheduleId, opts) — the Editor's "＋ sub-task" / "＋ sibling". opts: { taskId?, name?,
  // wbsParent? }. A new task is a LEAF (is_summary=0) and INHERITS its parent's date window so it shows in
  // the TM at once. The parent is NOT forced to a summary — it keeps its own elements + _cap coverage (only
  // breakdown, which empties the parent, marks it summary). Pass taskId for cross-tab replay determinism;
  // else TASK_<slug(name)> with a numeric suffix on collision. Returns { ok, taskId, parent }.
  function addTask(db, scheduleId, opts) {
    opts = opts || {};
    _ensureWideTasks(db);
    var parent = opts.wbsParent || null;
    var ps = null, pf = null, pdur = null;
    if (parent) {
      var pr = db.exec('SELECT schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=? AND schedule_id=?', [parent, scheduleId]);
      if (!pr.length || !pr[0].values.length) { console.log('§SE_ADDTASK_FAIL parent=' + parent + ' reason=no_such_parent'); return { ok: false, reason: 'no_such_parent' }; }
      ps = pr[0].values[0][0]; pf = pr[0].values[0][1]; pdur = pr[0].values[0][2];
    }
    var name = opts.name || 'New Task';
    var tid = opts.taskId;
    if (!tid) {
      var base = 'TASK_' + (_slug(name) || 'X'); tid = base; var k = 1;
      while (true) { var ex = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [tid]); if (!ex.length || !ex[0].values.length) break; tid = base + '_' + (++k); }
    }
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,0,?,?,?,?,?)',
      [tid, scheduleId, parent, name, 'CONSTRUCTION', ps, pf, pdur, null, 'PLANNED']);
    console.log('§SE_ADDTASK id=' + tid + ' parent=' + (parent || '(root)') + ' name="' + name + '"');
    return { ok: true, taskId: tid, parent: parent };
  }

  // reparentTask(db, scheduleId, taskId, newParentId) — §SE-5b Indent/Outdent: move one WBS node under a
  // different parent (or to root when newParentId is null). Refuses self, unknown task/parent, and any
  // move that would create a cycle (newParentId is taskId or one of its own descendants). A newly-indented
  // leaf inherits nothing (it keeps its own dates/assignments — only its position in the tree changes);
  // the caller (UI) is responsible for picking a sensible newParentId (indent = previous sibling, outdent =
  // current grandparent). Returns { ok, taskId, wbsParent } or { ok:false, reason }.
  function reparentTask(db, scheduleId, taskId, newParentId) {
    function fail(reason) { console.log('§SE_REPARENT_FAIL task=' + taskId + ' newParent=' + newParentId + ' reason=' + reason); return { ok: false, reason: reason }; }
    if (!taskId) return fail('missing_id');
    if (newParentId && newParentId === taskId) return fail('self_parent');
    var tr = db.exec('SELECT wbs_parent FROM tasks WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    if (!tr.length || !tr[0].values.length) return fail('no_such_task');
    if (newParentId) {
      var pr = db.exec('SELECT 1 FROM tasks WHERE task_id=? AND schedule_id=?', [newParentId, scheduleId]);
      if (!pr.length || !pr[0].values.length) return fail('no_such_parent');
      // cycle guard: walk newParentId's ancestor chain; if it reaches taskId, the move would loop.
      var cur = newParentId, seen = {}, guard = 0;
      while (cur && !seen[cur] && guard++ < 10000) {
        if (cur === taskId) return fail('cycle');
        seen[cur] = true;
        var ar = db.exec('SELECT wbs_parent FROM tasks WHERE task_id=?', [cur]);
        cur = (ar.length && ar[0].values.length) ? ar[0].values[0][0] : null;
      }
    }
    db.run('UPDATE tasks SET wbs_parent=? WHERE task_id=?', [newParentId || null, taskId]);
    console.log('§SE_REPARENT task=' + taskId + ' -> parent=' + (newParentId || '(root)'));
    return { ok: true, taskId: taskId, wbsParent: newParentId || null };
  }

  // breakdownByAttribute(db, scheduleId, taskId, attr) — auto-split a leaf phase's assigned elements into
  // child sub-tasks grouped by an elements_meta attribute (storey | ifc_class/type | discipline). Each
  // distinct value → child "<parent> · <value>" (DETERMINISTIC id parentId__<slug(value)> so a peer replay
  // converges), the parent's elements move to the matching child, and the parent becomes a summary roll-up
  // (is_summary=1 → dropped from _cap; children inherit its window so coverage is preserved). Returns
  // { ok, parent, attr, groups:[{taskId,value,count}], created }.
  var _BREAKDOWN_ATTRS = { storey: 'storey', ifc_class: 'ifc_class', class: 'ifc_class', type: 'ifc_class', discipline: 'discipline' };
  function breakdownByAttribute(db, scheduleId, taskId, attr) {
    _ensureWideTasks(db);
    var col = _BREAKDOWN_ATTRS[String(attr || '').toLowerCase()];
    if (!col) { console.log('§SE_BREAKDOWN_FAIL reason=bad_attr attr=' + attr); return { ok: false, reason: 'bad_attr' }; }
    var pr = db.exec('SELECT name, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    if (!pr.length || !pr[0].values.length) { console.log('§SE_BREAKDOWN_FAIL reason=no_such_task task=' + taskId); return { ok: false, reason: 'no_such_task' }; }
    var pName = pr[0].values[0][0] || taskId, ps = pr[0].values[0][1], pf = pr[0].values[0][2], pdur = pr[0].values[0][3];
    var gr = db.exec("SELECT COALESCE(NULLIF(m." + col + ",''),'(none)') v, te.guid FROM task_elements te " +
      "JOIN elements_meta m ON m.guid=te.guid WHERE te.task_id=? ORDER BY v", [taskId]);
    if (!gr.length || !gr[0].values.length) { console.log('§SE_BREAKDOWN_FAIL reason=no_elements task=' + taskId); return { ok: false, reason: 'no_elements' }; }
    var groups = {};
    gr[0].values.forEach(function (row) { (groups[row[0]] || (groups[row[0]] = [])).push(row[1]); });
    var vals = Object.keys(groups).sort();
    if (vals.length < 2) { console.log('§SE_BREAKDOWN_SKIP task=' + taskId + ' attr=' + col + ' reason=single_group'); return { ok: false, reason: 'single_group', groups: vals }; }
    var out = [], created = 0;
    vals.forEach(function (v) {
      var cid = taskId + '__' + (_slug(v) || 'none');
      var ex = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [cid]);
      if (!ex.length || !ex[0].values.length) {
        db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,0,?,?,?,?,?)',
          [cid, scheduleId, taskId, pName + ' · ' + v, 'CONSTRUCTION', ps, pf, pdur, null, 'PLANNED']);
        created++;
      }
      groups[v].forEach(function (g) { db.run('DELETE FROM task_elements WHERE guid=?', [g]); db.run('INSERT OR IGNORE INTO task_elements VALUES (?,?)', [cid, g]); });
      out.push({ taskId: cid, value: v, count: groups[v].length });
    });
    db.run('UPDATE tasks SET is_summary=1 WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    console.log('§SE_BREAKDOWN parent=' + taskId + ' attr=' + col + ' groups=' + vals.length + ' created=' + created);
    return { ok: true, parent: taskId, attr: col, groups: out, created: created };
  }

  // ── §SE-6: persist authored schedule edits back to the shared IndexedDB building cache ──────────
  // GAP THIS CLOSES: materializeDefault/assignElement/addDependency/moveTask/reparentTask/etc. all
  // write straight to the in-memory sql.js `db` — but NOTHING saved that db back anywhere. Neither
  // the ✎ Author wizard (which edits the SAME db as the main viewer, `APP.db`) nor the ↗ Editor tab
  // (its OWN separate in-memory copy) survived a tab close: kernel_ops.js's own IDB persistence
  // (`§KRN_PERSIST`) only fires on a signed `commitOp()` — schedule-table writes never go through it
  // (kernel_ops mirroring is explicitly deferred, per the module header above). So a closed tab lost
  // every authored phase/dependency/date — a "professional" editor that silently discards work.
  // Fix: ONE shared debounced-persist helper (both UIs call this, not divergent copies), reusing the
  // EXACT IDB-open pattern kernel_ops.js already proved correct — prefer `APP.openCacheDB()` (the
  // app's single opener; kernel_ops.js's own comment documents a past bug where a raw
  // `indexedDB.open('bim_ootb_cache', 1)` drifted behind scene.js's real version and silently never
  // fired). Same cache store ('dbs'), same key (the building URL) `cachedFetch`/`_idbGetDb` already
  // read from — so a reopened tab (Editor OR a fresh viewer load) picks up the edited bytes for free,
  // no new read-path needed.
  // openBuildingCache() — the ONE opener for 'bim_ootb_cache', usable from ANY surface. Prefers
  // `APP.openCacheDB()` (scene.js's opener) when present so we share its exact handle/version. But the
  // ↗ Editor tab is a standalone page that NEVER loads scene.js — if it's the FIRST surface to ever
  // touch this IndexedDB in a fresh profile, a bare unversioned `indexedDB.open('bim_ootb_cache')`
  // creates an empty v1 database with NO object stores (this was caught live: W-SCHED-PERSIST's first
  // run FAILED with "no cache store" for exactly this reason). Fix: version-open at 2 with the SAME
  // onupgradeneeded schema as scene.js A.openCacheDB (`dbs` + `timestamps` stores) so whichever
  // surface opens it FIRST creates a schema fully compatible with the other.
  function openBuildingCache() {
    var g = (typeof window !== 'undefined') ? window : global;
    if (g.APP && g.APP.openCacheDB) return g.APP.openCacheDB();
    return new Promise(function (resolve) {
      var idbFactory = (typeof indexedDB !== 'undefined') ? indexedDB : g.indexedDB;
      if (!idbFactory) { resolve(null); return; }
      try {
        var rq = idbFactory.open('bim_ootb_cache', 2);   // matches scene.js A.openCacheDB exactly
        rq.onupgradeneeded = function () {
          var idb = rq.result;
          if (!idb.objectStoreNames.contains('dbs')) idb.createObjectStore('dbs');
          if (!idb.objectStoreNames.contains('timestamps')) idb.createObjectStore('timestamps');
        };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  var _persistTimers = {};   // url -> timer, so rapid edits on the SAME db coalesce into one write
  function persistDb(db, url, opts) {
    opts = opts || {};
    if (!db || !url) return Promise.resolve(false);
    var delay = opts.immediate ? 0 : (opts.delay != null ? opts.delay : 1200);
    if (_persistTimers[url]) { clearTimeout(_persistTimers[url]); }
    return new Promise(function (resolve) {
      _persistTimers[url] = setTimeout(function () {
        delete _persistTimers[url];
        try {
          var buf = db.export().buffer;
          openBuildingCache().then(function (idb) {
            if (!idb || !idb.objectStoreNames.contains('dbs')) {
              console.warn('§SCHED_PERSIST_ERR no cache store url=' + url); resolve(false); return;
            }
            var tx = idb.transaction('dbs', 'readwrite');
            tx.objectStore('dbs').put(buf, url);
            tx.oncomplete = function () {
              console.log('§SCHED_PERSIST url=' + url + ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB');
              resolve(true);
            };
            tx.onerror = function () { console.warn('§SCHED_PERSIST_ERR tx ' + (tx.error && tx.error.message)); resolve(false); };
          }).catch(function (e) { console.warn('§SCHED_PERSIST_ERR open ' + (e && e.message)); resolve(false); });
        } catch (e) { console.warn('§SCHED_PERSIST_ERR', e); resolve(false); }
      }, delay);
    });
  }

  var API = {
    matchRule: matchRule,
    materializeDefault: materializeDefault,
    scheduleContiguous: scheduleContiguous,
    activeSchedule: activeSchedule,
    assignElement: assignElement,
    foldCost: foldCost,
    SEQ_TYPES: SEQ_TYPES,
    wbsTree: wbsTree,
    listDependencies: listDependencies,
    wouldCycle: wouldCycle,
    addDependency: addDependency,
    removeDependency: removeDependency,
    updateDependency: updateDependency,
    computeCpm: computeCpm,
    moveTask: moveTask,
    addTask: addTask,
    reparentTask: reparentTask,
    breakdownByAttribute: breakdownByAttribute,
    persistDb: persistDb,
    openBuildingCache: openBuildingCache
  };
  if (typeof window !== 'undefined') window.ScheduleAuthor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleAuthor = API;

  console.log('§SCHEDULE_AUTHOR_LOADED v7');
})(typeof self !== 'undefined' ? self : this);
