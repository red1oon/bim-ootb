// xer_pmxml_writer_witness.js — W-XER-ROUNDTRIP / W-PMXML-ROUNDTRIP (prompts/XER_PMXML_WRITER_LANE.md §4).
//
// toPMXML/toXER (foreign_schedule.js) are the write-side counterpart to parsePMXML/parseXER. The bar is
// a ROUND TRIP: take an authored schedule, run it through ScheduleAuthor.wbsTree/listDependencies (the
// SAME input exportMSProject already reads), serialize with the new writer, RE-PARSE the writer's own
// output with our OWN existing reader, and diff the re-parsed rows against the true SOURCE — the file
// as it existed before any of our code touched it. mismatch=0 or the writer is wrong, not the witness.
//
// Two fixtures, per §4:
//   XER   — the GENUINELY P6-EMITTED sample.xer already fetched/verified by real_xer_witness.js (same
//           URL+sha, cached at the same path so this witness doesn't re-download). Real P6 export.
//   PMXML — no real-P6-emitted PMXML sample exists in this repo or is cited anywhere (checked). Falls
//           back to tests/fixtures/Hospital_GW_Programme.xml, the repo's own committed demo fixture
//           (tests/gen_foreign_schedule.js) — SYNTHETIC dates/durations, but a real forward/backward CPM
//           pass and real Hospital element classes. Flagged explicitly, not claimed as real-P6 proof.
//
// Known, PRE-EXISTING (not-this-writer's) lossy transforms excluded from the mismatch tally, logged
// separately as "explained" diffs: WBS code (toScheduleData never stores it — dropped before the writer
// ever sees the tree), status_code (toScheduleData maps the raw P6 code, e.g. TK_NotStart, to a display
// string, e.g. "Not Started" — the writer cannot recover a raw code it was never given).
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
var PMXML_FIXTURE = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'Hospital_GW_Programme.xml');

var FS_ = require(path.join(VIEWER, 'foreign_schedule.js'));
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-WRITER PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-WRITER FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function stripNS(id) { return id == null ? id : String(id).replace(/^[AW]:/, ''); }
function feq(a, b, eps) { eps = eps || 1e-6; if (a == null || b == null) return a == b; return Math.abs(parseFloat(a) - parseFloat(b)) < eps; }

function ensureFile() {
  return new Promise(function (resolve) {
    if (fs.existsSync(REAL_XER)) return resolve(true);
    var f = fs.createWriteStream(REAL_XER);
    // family:4 — this sandbox's outbound IPv6 route is unreachable (ENETUNREACH); force IPv4 so the
    // fetch doesn't spuriously SKIP a witness that's actually available over the network.
    var u = new URL(SRC_URL);
    var req = https.get({ hostname: u.hostname, path: u.pathname + u.search, family: 4 }, function (res) {
      if (res.statusCode !== 200) { res.resume(); fs.unlink(REAL_XER, function () {}); return resolve(false); }
      res.pipe(f); f.on('finish', function () { f.close(function () { resolve(true); }); });
    });
    req.on('error', function () { try { fs.unlinkSync(REAL_XER); } catch (e) {} resolve(false); });
    req.setTimeout(8000, function () { req.destroy(); resolve(false); });
  });
}

// ── shared round-trip runner: origParsed (a reader's own neutral parse of the SOURCE file) → adopt →
// wbsTree/listDependencies (writer's real input contract) → write → re-parse own output → diff vs SOURCE.
function roundTrip(label, origParsed, writeFn, reparseFn) {
  var data = FS_.toScheduleData(origParsed);
  var db = new SQL.Database();
  FS_.adoptIntoDb(db, data);
  var schedId = data.schedules[0].id;
  var tree = SA.wbsTree(db, schedId);
  var deps = SA.listDependencies(db, schedId);
  var out = writeFn(tree, deps, { hpd: origParsed.project.hpd, projectId: origParsed.project.id, projectName: origParsed.project.name });
  var reparsed = reparseFn(out);

  var mismatch = 0, explained = 0, details = [];

  // WBS hierarchy: id (stripped) + name + parent (stripped) must match the source exactly.
  var origWbsById = {}; origParsed.wbs.forEach(function (w) { origWbsById[String(w.id)] = w; });
  reparsed.wbs.forEach(function (w) {
    var oid = stripNS(w.id), orig = origWbsById[oid];
    if (!orig) { mismatch++; details.push('WBS ' + oid + ' missing from source'); return; }
    if (String(w.name) !== String(orig.name)) { mismatch++; details.push('WBS ' + oid + ' name "' + w.name + '" != "' + orig.name + '"'); }
    var wParent = stripNS(w.parent), oParent = (orig.parent != null ? String(orig.parent) : null);
    if ((wParent || null) !== (oParent || null)) { mismatch++; details.push('WBS ' + oid + ' parent "' + wParent + '" != "' + oParent + '"'); }
    // code: NOT compared — toScheduleData never stores WBS code, so the writer never has it (explained, §5).
    explained++;
  });
  check(label + '-wbs-count', reparsed.wbs.length === origParsed.wbs.length, reparsed.wbs.length + '/' + origParsed.wbs.length);

  // Activities: name, start, finish, durDays, totalFloatDays, freeFloatDays, critical must match source.
  var origActById = {}; origParsed.activities.forEach(function (a) { origActById[String(a.id)] = a; });
  reparsed.activities.forEach(function (a) {
    var oid = stripNS(a.id), orig = origActById[oid];
    if (!orig) { mismatch++; details.push('Activity ' + oid + ' missing from source'); return; }
    if (String(a.name).trim() !== String(orig.name).trim()) { mismatch++; details.push('Activity ' + oid + ' name "' + a.name + '" != "' + orig.name + '"'); }
    if (String(a.start) !== String(orig.start)) { mismatch++; details.push('Activity ' + oid + ' start ' + a.start + ' != ' + orig.start); }
    if (String(a.finish) !== String(orig.finish)) { mismatch++; details.push('Activity ' + oid + ' finish ' + a.finish + ' != ' + orig.finish); }
    if (!feq(a.durDays, orig.durDays)) { mismatch++; details.push('Activity ' + oid + ' durDays ' + a.durDays + ' != ' + orig.durDays); }
    if (!feq(a.totalFloatDays, orig.totalFloatDays)) { mismatch++; details.push('Activity ' + oid + ' totalFloatDays ' + a.totalFloatDays + ' != ' + orig.totalFloatDays); }
    if (!feq(a.freeFloatDays, orig.freeFloatDays)) { mismatch++; details.push('Activity ' + oid + ' freeFloatDays ' + a.freeFloatDays + ' != ' + orig.freeFloatDays); }
    if (!!a.critical !== !!orig.critical) { mismatch++; details.push('Activity ' + oid + ' critical ' + a.critical + ' != ' + orig.critical); }
    // status: NOT compared — toScheduleData maps the raw P6 status code to a display string before the
    // writer ever sees it (e.g. TK_NotStart -> "Not Started"); the raw code is unrecoverable (explained, §5).
    explained++;
  });
  check(label + '-activity-count', reparsed.activities.length === origParsed.activities.length, reparsed.activities.length + '/' + origParsed.activities.length);

  // Relationships: (predId,succId) stripped, type, lagDays must match source. Match by pred+succ pair
  // (P6 pred/succ pairs are unique per network — no duplicate edges in either fixture).
  var origRelByPair = {};
  origParsed.relationships.forEach(function (r) { origRelByPair[r.pred + '>' + r.succ] = r; });
  reparsed.relationships.forEach(function (r) {
    var pred = stripNS(r.pred), succ = stripNS(r.succ), key = pred + '>' + succ;
    var orig = origRelByPair[key];
    if (!orig) { mismatch++; details.push('Relationship ' + key + ' missing from source'); return; }
    if (r.type !== orig.type) { mismatch++; details.push('Relationship ' + key + ' type ' + r.type + ' != ' + orig.type); }
    if (!feq(r.lagDays, orig.lagDays)) { mismatch++; details.push('Relationship ' + key + ' lagDays ' + r.lagDays + ' != ' + orig.lagDays); }
  });
  check(label + '-relationship-count', reparsed.relationships.length === origParsed.relationships.length, reparsed.relationships.length + '/' + origParsed.relationships.length);

  if (mismatch) details.slice(0, 20).forEach(function (d) { console.log('  ' + label + ' MISMATCH: ' + d); });
  return { mismatch: mismatch, explained: explained, out: out };
}

var SQL;
(async function () {
  SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── W-XER-ROUNDTRIP — real P6-emitted sample.xer ──────────────────────────────────────────────────
  var xerOk = await ensureFile();
  if (!xerOk) {
    console.log('§XER_ROUNDTRIP SKIP real .xer unavailable (no network + no local $REAL_XER) — cited: ' + SRC_URL);
  } else {
    var xerTxt = fs.readFileSync(REAL_XER, 'utf8');
    var gotSha = sha(Buffer.from(fs.readFileSync(REAL_XER)));
    check('xer-provenance-sha', gotSha === SRC_SHA, 'sha256 ' + gotSha.slice(0, 16) + '… matches the cited real P6 export');
    var origXer = FS_.parseXER(xerTxt);
    var rXer = roundTrip('xer', origXer, FS_.toXER, FS_.parseXER);
    console.log('§XER_ROUNDTRIP mismatch=' + rXer.mismatch + ' explained=' + rXer.explained +
      ' (source=REAL P6 sample.xer, ' + origXer.wbs.length + ' wbs / ' + origXer.activities.length +
      ' activities / ' + origXer.relationships.length + ' relationships)');
  }

  // ── W-PMXML-ROUNDTRIP — repo's committed demo fixture (SYNTHETIC dates, NOT a real P6 export) ──────
  if (!fs.existsSync(PMXML_FIXTURE)) {
    console.log('§PMXML_ROUNDTRIP SKIP fixture not found: ' + PMXML_FIXTURE + ' (run node tests/gen_foreign_schedule.js)');
  } else {
    console.log('§PMXML_ROUNDTRIP_SOURCE fixture=' + PMXML_FIXTURE + ' — SYNTHETIC demo plan (tests/gen_foreign_schedule.js), ' +
      'NOT a real P6-emitted file (no real-P6 PMXML sample is cited/available in this repo). Real element ' +
      'classes + a real forward/backward CPM pass, but dates/durations are authored, not P6-exported.');
    var pmxmlTxt = fs.readFileSync(PMXML_FIXTURE, 'utf8');
    var origPmxml = FS_.parsePMXML(pmxmlTxt);
    var rPmxml = roundTrip('pmxml', origPmxml, FS_.toPMXML, FS_.parsePMXML);
    console.log('§PMXML_ROUNDTRIP mismatch=' + rPmxml.mismatch + ' explained=' + rPmxml.explained +
      ' (source=SYNTHETIC tests/fixtures/Hospital_GW_Programme.xml, ' + origPmxml.wbs.length + ' wbs / ' +
      origPmxml.activities.length + ' activities / ' + origPmxml.relationships.length + ' relationships)');
  }

  console.log('\n§W-WRITER SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-WRITER ERROR', e && e.stack || e); process.exit(1); });
