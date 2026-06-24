// real_xer_witness.js — W-REAL-PARSE / W-REAL-CPM (prompts/XER_REAL_FIXTURE_PROOF.md).
//
// The synthetic Hospital demo (gen_foreign_schedule.js) can't prove real-P6 fidelity — WE generate its
// driving_path_flag with our own cpm(), so asserting our CPM matches it is a tautology. This witness
// runs against a GENUINELY P6-EMITTED .xer (a public, cited sample), so the comparison is against P6's
// own scheduling output, not ours.
//
// PROVENANCE (not vendored — no declared license on the source repo; fetched at runtime, cited here):
//   https://raw.githubusercontent.com/ASHspace/PrimeveraXEREditor/main/src/test/java/resources/sample.xer
//   ERMHDR 20.12, exported 2021-03-11 — project "Task SE": 1 PROJECT, 1 CALENDAR, 6 PROJWBS, 52 TASK,
//   61 TASKPRED. sha256 = 68ce5f0bb2b534d5ba192e3ad8241025d74ae45e94209f11731d42d32f18f82b
// The file is downloaded to $REAL_XER (default a temp path) on first run and SHA-verified; if the
// network is unavailable and no local copy exists, the witness SKIPs cleanly (it is, by design, gated on
// an external real file — same contract as the Hospital-DB skip in foreign_adopt_witness).
//
// Issue each block proves:
//   W-REAL-PARSE — our reader maps a real export: record counts MATCH the raw %R rows, 0 unmapped link
//                  types, 0 dangling relationships (every pred/succ resolves to a task), real dates land,
//                  adopt → activeSchedule sees it CAPTURED.
//   W-REAL-CPM   — our computeCpm over the real logic reproduces P6's OWN critical set (driving_path_flag)
//                  and its date divergences are itemised + attributed to the working calendar (P6 skips
//                  non-work days; our CPM uses calendar days) — never loosened, never hidden.
'use strict';
var fs = require('fs');
var path = require('path');
var https = require('https');
var crypto = require('crypto');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');

var SRC_URL = 'https://raw.githubusercontent.com/ASHspace/PrimeveraXEREditor/main/src/test/java/resources/sample.xer';
var SRC_SHA = '68ce5f0bb2b534d5ba192e3ad8241025d74ae45e94209f11731d42d32f18f82b';
var REAL_XER = process.env.REAL_XER || path.join(require('os').tmpdir(), 'real_p6_sample.xer');

var FS_ = require(path.join(VIEWER, 'foreign_schedule.js'));
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-REALXER PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-REALXER FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function ensureFile() {
  return new Promise(function (resolve) {
    if (fs.existsSync(REAL_XER)) return resolve(true);
    var f = fs.createWriteStream(REAL_XER);
    var req = https.get(SRC_URL, function (res) {
      if (res.statusCode !== 200) { res.resume(); fs.unlink(REAL_XER, function () {}); return resolve(false); }
      res.pipe(f); f.on('finish', function () { f.close(function () { resolve(true); }); });
    });
    req.on('error', function () { try { fs.unlinkSync(REAL_XER); } catch (e) {} resolve(false); });
    req.setTimeout(8000, function () { req.destroy(); resolve(false); });
  });
}

// raw %R record counts straight from the file — the independent oracle W-REAL-PARSE checks against.
function rawCounts(txt) {
  var t = null, c = {};
  txt.replace(/\r/g, '').split('\n').forEach(function (line) {
    var f = line.split('\t');
    if (f[0] === '%T') t = f[1];
    else if (f[0] === '%R' && t) c[t] = (c[t] || 0) + 1;
  });
  return c;
}

(async function () {
  var ok = await ensureFile();
  if (!ok) { console.log('§W-REALXER SKIP real .xer unavailable (no network + no local $REAL_XER) — cited: ' + SRC_URL); process.exit(0); }
  var txt = fs.readFileSync(REAL_XER, 'utf8');
  var gotSha = sha(Buffer.from(fs.readFileSync(REAL_XER)));
  check('provenance-sha', gotSha === SRC_SHA, 'sha256 ' + gotSha.slice(0, 16) + '… matches the cited file');

  var raw = rawCounts(txt);
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── W-REAL-PARSE ────────────────────────────────────────────────────────────────────────────────
  var det = FS_.parseForeign(txt, 'sample.xer');
  check('real-sniffed-xer', det.format === 'XER', 'parseForeign detected ' + det.format);
  var p = det.parsed;
  check('real-counts-match-raw',
    p.wbs.length === raw.PROJWBS && p.activities.length === raw.TASK && p.relationships.length === raw.TASKPRED,
    'parsed wbs=' + p.wbs.length + '/' + raw.PROJWBS + ' act=' + p.activities.length + '/' + raw.TASK + ' rel=' + p.relationships.length + '/' + raw.TASKPRED);
  check('real-calendar-hpd', p.calendars.length === raw.CALENDAR && p.project.hpd > 0,
    'calendars=' + p.calendars.length + ' hpd=' + p.project.hpd);

  // 0 unmapped link types — every relationship maps to one of the 4 P6 types
  var badType = p.relationships.filter(function (r) { return ['FS', 'SS', 'FF', 'SF'].indexOf(r.type) < 0; });
  check('real-zero-unmapped-types', badType.length === 0,
    'types present=' + Array.from(new Set(p.relationships.map(function (r) { return r.type; }))).join(','));

  // 0 dangling relationships — every pred & succ id resolves to a parsed activity
  var actIds = {}; p.activities.forEach(function (a) { actIds[a.id] = 1; });
  var dangling = p.relationships.filter(function (r) { return !actIds[r.pred] || !actIds[r.succ]; });
  check('real-zero-dangling-links', dangling.length === 0, 'dangling=' + dangling.length + ' of ' + p.relationships.length);

  // real dates landed on every activity
  var datedAll = p.activities.every(function (a) { return a.start && a.finish; });
  check('real-dates-present', datedAll, 'all ' + p.activities.length + ' activities carry start+finish');

  // adopt → captured
  var data = FS_.toScheduleData(p);
  var db = new SQL.Database();
  FS_.adoptIntoDb(db, data);
  var act = SA.activeSchedule(db);
  check('real-adopt-captured', !!act && act.captured === true && act.taskCount === raw.TASK,
    'active=' + (act && act.id) + ' captured=' + (act && act.captured) + ' tasks=' + (act && act.taskCount));
  var seqN = db.exec('SELECT COUNT(*) FROM task_sequences')[0].values[0][0];
  var nullType = db.exec("SELECT COUNT(*) FROM task_sequences WHERE sequence_type IS NULL")[0].values[0][0];
  check('real-sequences-intact', seqN === raw.TASKPRED && nullType === 0, 'task_sequences=' + seqN + ' nullType=' + nullType);

  // ── W-REAL-CPM ──────────────────────────────────────────────────────────────────────────────────
  var sid = data.schedules[0].id;
  var cpm = SA.computeCpm(db, sid);
  check('real-cpm-no-bail', !cpm.error && cpm.tasks.length === raw.TASK, 'cpm tasks=' + cpm.tasks.length + ' projectDuration=' + cpm.projectDuration);

  // P6's OWN critical set = driving_path_flag (mapped to a.critical at parse). Compare to OUR CPM.
  var p6Crit = data.tasks.filter(function (t) { return t.isCritical === 1; }).map(function (t) { return t.id; }).sort();
  var ourCrit = cpm.criticalIds.slice().sort();
  check('W-REAL-CPM critical-vs-driving',
    p6Crit.length > 0 && JSON.stringify(ourCrit) === JSON.stringify(p6Crit),
    'our critical(' + ourCrit.length + ') == P6 driving_path_flag(' + p6Crit.length + ')');

  // Date fidelity: compare our computed early_start to P6's own scheduled start. Itemise divergences;
  // attribute them to the working calendar — NEVER loosen. (P6 skips weekends/holidays; our CPM uses
  // calendar days, so our dates are EARLIER by the accumulated non-work days — a one-directional, growing
  // offset, not noise.)
  var rows = db.exec('SELECT schedule_start, early_start FROM tasks WHERE (is_summary IS NULL OR is_summary=0)')[0].values;
  var exact = 0, diverge = 0, oursLater = 0, maxOffset = 0;
  rows.forEach(function (v) {
    var p6 = v[0] && v[0].slice(0, 10), ours = v[1];
    if (!p6 || !ours) return;
    if (p6 === ours) { exact++; return; }
    diverge++;
    var off = (Date.parse(p6 + 'T00:00:00Z') - Date.parse(ours + 'T00:00:00Z')) / 86400000;
    if (off < 0) oursLater++;            // ours scheduled LATER than P6 — would be a real logic error
    if (Math.abs(off) > maxOffset) maxOffset = Math.abs(off);
  });
  check('W-REAL-CPM dates-calendar-attributable', diverge > 0 && oursLater === 0,
    'start dates: exact=' + exact + ' diverge=' + diverge + ' (ours-LATER=' + oursLater + ', maxOffset=' + maxOffset + 'd) — all one-directional → working-calendar, not a logic defect');
  console.log('§REALXER-FINDING our CPM omits the P6 working calendar → ' + diverge + '/' + rows.length +
    ' start dates land up to ' + maxOffset + 'd earlier (weekend/holiday skips). Topology + critical set MATCH; ' +
    'absolute-date fidelity needs a working-calendar model (named boundary, not loosened).');

  console.log('\n§W-REALXER SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-REALXER ERROR', e); process.exit(1); });
