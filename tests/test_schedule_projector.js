// ⚠ DO NOT REMOVE — Scope: prove the CAPTURED provider (this session owns it) emits the
// schedule_instance contract shape from Hospital's native IFC IfcWorkSchedule, verbatim.
// Contract: internal/schedule_instance.template.json. Read the §-log after every run.
//
// Issue proved: Settings opens a per-building 4D instance COMPILED from captured IFC tasks
// (NOT kernel_ops, NOT fabricated), collapsed to ~8 Z-ordered phases per the contract taxonomy
// (Site Works, Substructure, Level N — Ceiling/TOS collapse into their Level), each phase span =
// its own structural span (min start→max finish of its tasks), source='captured', elements=count.
//
// Run: node tests/test_schedule_projector.js "/home/red1/Downloads/Hospital 2.0_meta.db"

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// ── projectCaptured(db): the SAME logic panels.js _projectSchedule runs in-browser ──
// db = a sql.js Database (has .exec). Returns the schedule_instance JSON (captured provider).
function projectCaptured(db) {
  function rows(sql) {
    var r; try { r = db.exec(sql); } catch (e) { return []; }
    if (!r.length) return [];
    var cols = r[0].columns, out = [];
    r[0].values.forEach(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); out.push(o); });
    return out;
  }
  function meta(k, d) { var r = rows("SELECT value FROM project_metadata WHERE key='" + k + "'"); return r.length ? r[0].value : d; }
  function day(iso) { return (iso || '').slice(0, 10); }
  function weeksBetween(s, e) {                       // structural span → whole weeks, >=1
    var ms = Date.parse(e) - Date.parse(s);
    return Math.max(1, Math.round(ms / (7 * 86400000)));
  }
  function collapseLevel(name) {                      // "Level 3 Ceiling"/"Level 3 TOS" → "Level 3"
    var m = /^(Level\s*\S+?)(?:\s+(?:Ceiling|TOS|Top of Steel))?$/i.exec(name || '');
    return m ? m[1] : name;
  }

  var tasks = rows("SELECT task_id,wbs_parent,name,is_summary,schedule_start,schedule_finish FROM tasks");
  if (!tasks.length) return null;                     // no native 4D → caller shows fallback note
  var byId = {}; tasks.forEach(function (t) { byId[t.task_id] = t; });

  // phase = the WBS ancestor that is a "Level N" node; else the root name (Site Works / Structures→Substructure)
  function phaseOf(t) {
    var cur = t, levelName = null, rootName = null, guard = 0;
    while (cur && guard++ < 64) {
      if (/^Level\b/i.test(cur.name)) levelName = collapseLevel(cur.name);
      rootName = cur.name;
      if (!cur.wbs_parent || !byId[cur.wbs_parent]) break;
      cur = byId[cur.wbs_parent];
    }
    if (levelName) return levelName;
    if (/site/i.test(rootName)) return 'Site Works';
    if (/structure/i.test(rootName)) return 'Substructure';   // Structures-root direct children = foundations
    return rootName || 'Other';
  }

  var teCount = {};
  rows("SELECT task_id, COUNT(*) n FROM task_elements GROUP BY task_id").forEach(function (r) { teCount[r.task_id] = r.n; });

  // aggregate dated leaf tasks into phases
  var ph = {};                                        // phaseName → {start,finish,elements}
  tasks.forEach(function (t) {
    if (t.is_summary) return;
    if (!t.schedule_start || !t.schedule_finish) return;
    var name = phaseOf(t);
    var p = ph[name] || (ph[name] = { phase: name, start: t.schedule_start, finish: t.schedule_finish, elements: 0 });
    if (t.schedule_start < p.start) p.start = t.schedule_start;
    if (t.schedule_finish > p.finish) p.finish = t.schedule_finish;
    p.elements += (teCount[t.task_id] || 0);
  });

  // order bottom-up (captured builds chronologically = Z-order); assign stable ids
  var ordered = Object.keys(ph).map(function (k) { return ph[k]; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });

  var phases = ordered.map(function (p, i) {
    return {
      id: 'p' + i,
      phase: p.phase,
      start: day(p.start),
      weeks: weeksBetween(p.start, p.finish),
      elements: p.elements,
      source: 'captured'
    };
  });

  var minStart = ordered.length ? day(ordered[0].start) : '';
  var cal = rows("SELECT name FROM calendars LIMIT 1")[0] || {};
  var out = {
    Project: {
      building: meta('building_name', meta('project_name', '?')),
      start: minStart,
      calendar: cal.name || '',
      source: 'captured'
    },
    Phases: phases
  };

  var totalEl = phases.reduce(function (s, p) { return s + p.elements; }, 0);
  console.log('§SCHEDULE_INSTANCE building=' + out.Project.building + ' provider=captured phases=' +
    phases.length + ' captured=' + totalEl + ' generated=0 start=' + out.Project.start);
  return out;
}

(async function () {
  var dbPath = process.argv[2] || '/home/red1/Downloads/Hospital 2.0_meta.db';
  var sqljsDir = path.dirname(require.resolve('sql.js'));
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(sqljsDir, f); } });
  var db = new SQL.Database(fs.readFileSync(dbPath));
  var json = projectCaptured(db);
  if (!json) { console.error('FAIL: no native 4D tables'); process.exit(1); }

  var fail = 0;
  function ok(cond, msg) { console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) fail++; }

  // contract conformance — each assertion names the issue it proves
  ok(json.Project && typeof json.Project.building === 'string', 'Project block present with building (contract §Project)');
  ok(json.Project.source === 'captured', "Project.source='captured' — this provider extracts IFC verbatim");
  ok(Array.isArray(json.Phases) && json.Phases.length >= 6 && json.Phases.length <= 10,
    '~8 collapsed phases (got ' + json.Phases.length + ') — Ceiling/TOS folded into Level (contract §phase_taxonomy)');
  ok(json.Phases.every(function (p) { return ['id', 'phase', 'start', 'weeks', 'elements', 'source'].every(function (k) { return k in p; }); }),
    'every phase has exactly the contract fields');
  ok(json.Phases.every(function (p) { return p.source === 'captured'; }), 'every phase source=captured');
  ok(json.Phases.every(function (p) { return p.weeks >= 1 && Number.isInteger(p.weeks); }), 'weeks is integer >=1 (structural span)');
  ok(!json.Phases.some(function (p) { return /Ceiling|TOS|Unknown/i.test(p.phase); }), 'no Ceiling/TOS/Unknown phase names leaked (collapse worked)');
  var totalEl = json.Phases.reduce(function (s, p) { return s + p.elements; }, 0);
  ok(totalEl === 2900, 'captured element coverage = 2900 (got ' + totalEl + ') — matches injectGantt absorb');
  ok(json.Phases.some(function (p) { return p.phase === 'Site Works'; }), "Site Works phase present");
  ok(json.Phases.some(function (p) { return p.phase === 'Substructure'; }), "Substructure phase present (Structures-root foundations)");

  console.log('--- contract instance (captured provider) ---');
  console.log(JSON.stringify(json, null, 2));

  db.close();
  process.exit(fail ? 1 : 0);
})();
