#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T8 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/rule_report.js's buildRuleReport()/runSufficiencyProbes() — R1 purity,
 *   R2 same-numbers, R3 zero-is-listed, R4 provenance, R5 unit-not-bare, R6 determinism,
 *   R8 real-building, R9 probes-measured, R10 gap-is-caught, R11 findings-untouched.
 *   R7 (no-film-deps on a real --findings-only run) is a CLI grep, not a Node assertion — it is
 *   run separately against a real building and its log line quoted in the PR.
 * EACH TEST NAMES THE ISSUE IT PROVES. Exit code is not evidence — read the ✅/❌ lines.
 * RUN: node tests/test_rule_report.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('./_sqljs.js').requireSqlJs();   // §SQLJS_MISSING: local dep first, sibling checkout second — never a bare MODULE_NOT_FOUND
const RuleReport = require('../viewer/rule_report.js');
const StructuralSanity = require('../viewer/structural_sanity.js');
const EgressSanity = require('../viewer/egress_sanity.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// T12.6 — support_classes_present reads the evaluator's OWN lists rather than keeping a copy;
// unsupplied it reports 'unavailable' by design, so every call that expects a measured verdict
// must hand them over. This is the shape both production call sites use.
const SUFF_OPTS = { supportClasses: StructuralSanity.SUPPORT_CLASSES, colSupportClasses: StructuralSanity.COL_SUPPORT_CLASSES };

const STRUCT_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/structural_rules.json'), 'utf8'));
const EGRESS_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/egress_rules.json'), 'utf8'));

// Fixture rows shaped exactly like the evaluators' own output (see structural_sanity.js's
// rows.push and egress_sanity.js's) — NOT a hand-invented shape.
const ROWS_S = [
  { guid: 'b1', ifc_class: 'IfcBeam', name: 'UB-Universal Beam:838x292x194UB:241306', storey: 'Level 6', rule: 'floating_member', severity: 'CRITICAL', ratio: null },
  { guid: 'b2', ifc_class: 'IfcBeam', name: 'UB-Universal Beam:533x210x92UB:9', storey: 'Level 1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 27.3 },
  { guid: 'c1', ifc_class: 'IfcColumn', name: 'C-Roof', storey: 'Roof', rule: 'column_continuity', severity: 'CRITICAL', ratio: null }
];
const ROWS_E = [
  { guid: 'd1', ifc_class: 'IfcDoor', name: 'Single-Flush:0800x2100mm', storey: 'Level 1', rule: 'door_clear_width', severity: 'WARNING', ratio: 0.80 },
  { guid: 'RM_1', ifc_class: 'IfcSpace', name: '⚠ Level 1 R3', storey: 'Level 1', rule: 'circulation_distance', severity: 'WARNING', ratio: 98.4873, target: 'exit' }
];

(async () => {
  const SQL = await initSqlJs();

  // ── R1 PURE — proves: the builder cannot have grown a dependency on film state (§87.3's trap).
  console.log('§W-RULE-REPORT R1 PURE');
  {
    const src = fs.readFileSync(path.join(__dirname, '../viewer/rule_report.js'), 'utf8');
    // Strip comments before grepping: the file's own ⚠ header NAMES these deps to warn against
    // them, and a test that failed on the warning would punish the documentation.
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    chk('R1 no CODE path names ruleFindingsFilmBuild / poseAt / showRuleModeTint',
      !/ruleFindingsFilmBuild|poseAt|showRuleModeTint/.test(code), 'the exact deps §87.3 says findings-only exists to skip');
    chk('R1 the ⚠ header still WARNS about them (the comment must not be deleted to pass)',
      /ruleFindingsFilmBuild/.test(src), 'guards against "fixing" the test by removing the warning');
    chk('R1 no document/THREE/camera reference in the code',
      !/\bdocument\b|\bTHREE\b|\.camera\b/.test(code), 'portable, like structural_sanity.js');
    // Would fail if the module reached for a browser global at require() time — it already did
    // require cleanly at the top of this file, which is itself the assertion.
    chk('R1 module require()s in bare Node (no DOM shim)', typeof RuleReport.buildRuleReport === 'function');
  }

  // ── R2 SAME-NUMBERS — proves: the report's per-rule totals are the rows', not a second count.
  console.log('§W-RULE-REPORT R2 SAME-NUMBERS');
  {
    const rep = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES] });
    const direct = {};
    ROWS_S.concat(ROWS_E).forEach(r => { direct[r.rule] = (direct[r.rule] || 0) + 1; });
    const mismatched = rep.rules.filter(r => (direct[r.rule] || 0) !== r.count);
    chk('R2 every per-rule count equals a direct count over the same rows', mismatched.length === 0, JSON.stringify(mismatched));
    chk('R2 totals.findings equals rows in', rep.totals.findings === ROWS_S.length + ROWS_E.length, 'got ' + rep.totals.findings);
    chk('R2 severity totals sum to findings',
      rep.totals.severity.CRITICAL + rep.totals.severity.WARNING + rep.totals.severity.OPTIMIZED === rep.totals.findings,
      JSON.stringify(rep.totals.severity));
    console.log('  ℹ R2 the other half — equality with ruleFindingsFilm.stats() — cannot run here:');
    console.log('    viewer/rule_findings_film.js is on feat/rule-findings-film, not on main. Stated, not dropped.');
  }

  // ── R3 ZERO-IS-LISTED — proves: §87.5's deliberate divergence from the film survives.
  console.log('§W-RULE-REPORT R3 ZERO-IS-LISTED');
  {
    const rep = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: [], ruleDefs: [STRUCT_RULES, EGRESS_RULES] });
    const dw = rep.rules.filter(r => r.rule === 'door_clear_width')[0];
    chk('R3 door_clear_width is LISTED with count 0 when nothing fired', !!dw && dw.count === 0, JSON.stringify(dw));
    const names = rep.rules.map(r => r.rule);
    chk('R3 all 8 rules from both rules files appear', names.length === 8, names.join(','));
    // The inverse guard: a rule that fired but is NOT in ruleDefs must still be listed (never hide).
    const rep2 = RuleReport.buildRuleReport({ rowsS: [{ guid: 'x', rule: 'some_future_rule', severity: 'WARNING', ratio: null }], ruleDefs: [] });
    chk('R3 a rule with rows but no ruleDef is still listed', rep2.rules.some(r => r.rule === 'some_future_rule'));
  }

  // ── R4 PROVENANCE — proves: fallback thresholds can never be presented as authored ones.
  console.log('§W-RULE-REPORT R4 PROVENANCE');
  {
    const fb = RuleReport.buildRuleReport({ rowsS: ROWS_S, ruleDefs: [STRUCT_RULES], meta: { rulesSource: { structural: 'fallback' } } });
    chk('R4 rulesSource.structural survives as "fallback"', fb.rulesSource.structural === 'fallback', JSON.stringify(fb.rulesSource));
    chk('R4 an unsupplied source reads "unknown", never "fetched"', fb.rulesSource.egress === 'unknown', JSON.stringify(fb.rulesSource));
    const none = RuleReport.buildRuleReport({ rowsS: [], ruleDefs: [] });
    chk('R4 with no meta at all, both sources read "unknown"',
      none.rulesSource.structural === 'unknown' && none.rulesSource.egress === 'unknown', JSON.stringify(none.rulesSource));
  }

  // ── R5 UNIT-NOT-BARE — proves: the overloaded `ratio` field never prints without its unit.
  console.log('§W-RULE-REPORT R5 UNIT-NOT-BARE');
  {
    const rep = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES] });
    const f = (g) => rep.findings.filter(x => x.guid === g)[0];
    chk('R5 door_clear_width carries unit "m"', f('d1').unit === 'm' && f('d1').value === 0.80, JSON.stringify(f('d1')));
    chk('R5 span_depth_steel carries unit "ratio"', f('b2').unit === 'ratio' && f('b2').value === 27.3, JSON.stringify(f('b2')));
    chk('R5 circulation_distance carries unit "m"', f('RM_1').unit === 'm', JSON.stringify(f('RM_1')));
    chk('R5 a rule with no numeric value reports null/null, not 0',
      f('b1').value === null && f('b1').unit === null, JSON.stringify(f('b1')));
    chk('R5 no finding row carries a bare `ratio` key at all',
      rep.findings.every(x => !Object.prototype.hasOwnProperty.call(x, 'ratio')));
  }

  // ── R6 DETERMINISTIC — proves: §87.6's diffability. Same rows -> same bytes but the timestamp.
  console.log('§W-RULE-REPORT R6 DETERMINISTIC');
  {
    const a = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES], meta: { generatedAt: 'T' } });
    const b = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES], meta: { generatedAt: 'T' } });
    chk('R6 two builds of the same rows are byte-identical', RuleReport.toJson(a) === RuleReport.toJson(b));
    const c = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES], meta: { generatedAt: 'U' } });
    chk('R6 the timestamp is the ONLY difference (a control — this must differ)',
      RuleReport.toJson(a) !== RuleReport.toJson(c) &&
      RuleReport.toJson(a).replace(/"generatedAt": "T"/, 'X') === RuleReport.toJson(c).replace(/"generatedAt": "U"/, 'X'));
  }

  // ── R10 GAP-IS-CAUGHT — proves: the exact metadata gap that produced HHS's 131/131 is reported.
  // Fixture: columns at the lowest storey, ZERO IfcFooting — the real HHS_Office_Federated shape.
  console.log('§W-RULE-REPORT R10 GAP-IS-CAUGHT (0 footings, 0 spaces, rotated member)');
  {
    const db = new SQL.Database();
    db.run(`CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
            CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
            CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT);`);
    db.run("INSERT INTO elements_meta VALUES ('c1','IfcColumn','C1','Level 1','STR',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('c2','IfcColumn','C2','Level 1','STR',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('bm','IfcBeam','UB-Beam','Level 1','STR',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('w1','IfcWall','W1','Level 1','ARC',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('w2','IfcWall','W2','Level 1','ARC',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('w3','IfcWall','W3','Level 1','ARC',NULL,'','F')");
    db.run("INSERT INTO elements_meta VALUES ('d1','IfcDoor','D1','Level 1','ARC',NULL,'','F')");
    db.run("INSERT INTO element_transforms VALUES ('c1',0,0,1.5,0,0,0,0.4,0.4,3)");
    db.run("INSERT INTO element_transforms VALUES ('c2',5,0,1.5,0,0,0.7,0.4,0.4,3)");   // rotated
    db.run("INSERT INTO element_transforms VALUES ('bm',2.5,0,3,0,0,0,5,0.3,0.5)");
    db.run("INSERT INTO element_transforms VALUES ('d1',1,0,1,0,0,0,0.8,0.1,2.1)");
    db.run("INSERT INTO spatial_structure VALUES ('s1','IfcSpace','≈ Level 1 R1')");
    db.run("INSERT INTO spatial_structure VALUES ('s2','IfcSpace','⚠ Level 1 R2')");
    const q = (sql, p) => { const r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
    const logs = [];
    const suff = RuleReport.runSufficiencyProbes(q, Object.assign({ log: (m) => logs.push(m) }, SUFF_OPTS));
    const by = {}; suff.forEach(s => by[s.check] = s);

    chk('R10 footings_modelled = absent (0 IfcFooting, 2 columns) — the HHS 131/131 cause',
      by.footings_modelled.verdict === 'absent', JSON.stringify(by.footings_modelled.measured));
    chk('R10 modelled_spaces = absent (0 IfcSpace in elements_meta)',
      by.modelled_spaces.verdict === 'absent', JSON.stringify(by.modelled_spaces.measured));
    chk('R10 room_confidence_sigils counts the ≈/⚠ marks the evaluators ignore',
      by.room_confidence_sigils.measured.approx === 1 && by.room_confidence_sigils.measured.suspect === 1,
      JSON.stringify(by.room_confidence_sigils.measured));
    // ⚠ THIS ASSERTION USED TO READ "= degraded when IfcWall outnumbers the listed classes", and
    // it passed for the life of the bug: the fixture's 3 IfcWall could only outnumber the listed
    // classes because the probe's PRIVATE COPY of the list had never been told T9.1 added
    // IfcWall. A guard written from the buggy code's own output (T11.5 trap 3). What the probe
    // actually claims now is that walls count, so that is what is asserted.
    chk('R10 support_classes_present counts IfcWall as real support — T9.1 added it',
      by.support_classes_present.verdict === 'ok' && by.support_classes_present.measured.byClass.IfcWall === 3,
      'verdict=' + by.support_classes_present.verdict + ' ' + JSON.stringify(by.support_classes_present.measured.byClass));
    chk('R10 and it no longer claims IfcWall/IfcSlab are unsupported',
      !/neither support list/.test(by.support_classes_present.consequence),
      by.support_classes_present.consequence.slice(0, 80));
    chk('R10 beam_material_named = absent (material_name NULL on every beam)',
      by.beam_material_named.verdict === 'absent', JSON.stringify(by.beam_material_named.measured));
    chk('R10 axis_aligned_bboxes = degraded (one rotated column)',
      by.axis_aligned_bboxes.verdict === 'degraded', JSON.stringify(by.axis_aligned_bboxes.measured));
    chk('R10 cantilever_is_inferred states the absence of any cantilever attribute',
      by.cantilever_is_inferred.measured.beamsNamedCantilever === 0 && /inferred/.test(by.cantilever_is_inferred.consequence));
    chk('R10 every probe logged a §RULE_SUFFICIENCY line (log is the witness, not the exit code)',
      logs.length === suff.length && logs.every(l => l.indexOf('§RULE_SUFFICIENCY') === 0), logs.length + ' lines');

    // ── R9 PROBES-MEASURED — a probe over a DB missing the table must say so, not report 0.
    console.log('§W-RULE-REPORT R9 PROBES-MEASURED');
    const bare = new SQL.Database();
    bare.run('CREATE TABLE unrelated_table (x INT)');
    const bq = (sql) => { const r = bare.exec(sql); return r.length ? r[0].values : []; };
    const suffBare = RuleReport.runSufficiencyProbes(bq, Object.assign({ log: () => {} }, SUFF_OPTS));
    chk('R9 every probe over a DB with no elements_meta reports "unavailable", never ok/0',
      suffBare.every(s => s.verdict === 'unavailable'), JSON.stringify(suffBare.map(s => s.check + '=' + s.verdict)));
    chk('R9 an unavailable probe carries the reason, not a null measured passed off as a count',
      suffBare.every(s => s.measured === null && /could not run/.test(s.consequence)));

    // ── R11 FINDINGS-UNTOUCHED — sufficiency annotates, it does not filter or reweight.
    console.log('§W-RULE-REPORT R11 FINDINGS-UNTOUCHED');
    const withS = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES],
      meta: { generatedAt: 'T', sufficiency: suff, populations: RuleReport.rulePopulations(q) } });
    const without = RuleReport.buildRuleReport({ rowsS: ROWS_S, rowsE: ROWS_E, ruleDefs: [STRUCT_RULES, EGRESS_RULES],
      meta: { generatedAt: 'T' } });
    chk('R11 findings array identical with and without the sufficiency section',
      JSON.stringify(withS.findings) === JSON.stringify(without.findings));
    chk('R11 per-rule totals identical', JSON.stringify(withS.rules) === JSON.stringify(without.rules));
    chk('R11 severity totals identical', JSON.stringify(withS.totals) === JSON.stringify(without.totals));
    chk('R11 the section is null (not an empty all-clear) when no probes were run',
      without.dataSufficiency === null && /not run/.test(without.dataSufficiencyNote));
    chk('R11 flagRates states flagged/population as a measured ratio',
      withS.flagRates.some(r => r.rule === 'column_continuity' && r.population === 2 && r.flagged === 1 && r.rate === 0.5),
      JSON.stringify(withS.flagRates.filter(r => r.rule === 'column_continuity')));
  }

  // ── R8 REAL-BUILDING — proves: on a real DB the report reproduces the evaluators' own § counts.
  console.log('§W-RULE-REPORT R8 REAL-BUILDING (buildings/Hospital_meta.db)');
  // buildings/ is gitignored, so a WORKTREE (the mandated dev environment here) holds only the
  // two TRACKED DBs and the real-building arms of these tests would all report themselves
  // skipped. BIM_BUILDINGS points them at a checkout that has the fleet. Never a symlink INTO
  // buildings/ — T11.5 trap 5: two of those files are tracked and a symlink over one is
  // committed as 63 bytes.
  const BUILDINGS = process.env.BIM_BUILDINGS || path.join(__dirname, '../buildings');
  const HOSPITAL = path.join(BUILDINGS, 'Hospital_meta.db');
  if (fs.existsSync(HOSPITAL)) {
    const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
    const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
    const slog = [], elog = [];
    const rowsS = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: (m) => slog.push(m) });
    const rowsE = EgressSanity.evaluate(hq, EGRESS_RULES, { log: (m) => elog.push(m) });
    const suff = RuleReport.runSufficiencyProbes(hq, Object.assign({ log: () => {} }, SUFF_OPTS));
    const rep = RuleReport.buildRuleReport({ rowsS, rowsE, ruleDefs: [STRUCT_RULES, EGRESS_RULES],
      meta: { building: 'Hospital', sufficiency: suff, populations: RuleReport.rulePopulations(hq) } });

    // Read the evaluators' OWN log lines and require the report to match them (Log Mandate).
    const logged = {};
    slog.concat(elog).forEach(l => {
      const m = /§(?:STRUCT_SANITY|EGRESS) rule=(\w+) severity=(\d+)/.exec(l);
      if (m) logged[m[1]] = +m[2];
    });
    const disagree = rep.rules.filter(r => logged[r.rule] !== undefined && logged[r.rule] !== r.count);
    chk('R8 every per-rule count matches the evaluator\'s own § log line', disagree.length === 0,
      JSON.stringify(disagree.map(d => d.rule + ' report=' + d.count + ' log=' + logged[d.rule])));
    console.log('  ℹ real Hospital_meta.db: findings=' + rep.totals.findings + ' ' +
      JSON.stringify(rep.rules.map(r => r.rule + ':' + r.count)));
    chk('R8 the report lists all 8 rules on a real building, zeros included', rep.rules.length === 8,
      rep.rules.map(r => r.rule + '=' + r.count).join(' '));
    chk('R8 sufficiency ran on the real DB and every probe has a measured value',
      rep.dataSufficiency.length === 8 && rep.dataSufficiency.every(s => s.verdict !== 'unavailable'),
      JSON.stringify(rep.dataSufficiency.map(s => s.check + '=' + s.verdict)));
    console.log('  ℹ real sufficiency verdicts: ' + rep.dataSufficiency.map(s => s.check + '=' + s.verdict).join(' '));
    console.log('  ℹ real flag rates: ' + rep.flagRates.filter(r => r.rate !== null).map(r => r.rule + ' ' + r.flagged + '/' + r.population).join('  '));
  } else {
    console.log('  §W-RULE-REPORT SKIP R8 — buildings/Hospital_meta.db not present in this worktree');
  }

  // ── R12 WITNESS-ADDITIVE — proves: evidence explains a finding, it never creates or moves one.
  // The trap this guards: a witness pass that quietly widened a tolerance would change counts and
  // nobody would notice, because the evidence would agree with the (now wrong) row.
  console.log('§W-RULE-REPORT R12 WITNESS-ADDITIVE');
  if (fs.existsSync(HOSPITAL)) {
    const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
    const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
    const key = (rows) => JSON.stringify(rows.map(r => r.guid + '|' + r.rule + '|' + r.severity + '|' + r.ratio).sort());
    const offS = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: () => {} });
    const onS = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: () => {}, witness: true });
    const offE = EgressSanity.evaluate(hq, EGRESS_RULES, { log: () => {} });
    const onE = EgressSanity.evaluate(hq, EGRESS_RULES, { log: () => {}, witness: true });
    chk('R12 structural rows identical with witness on (guid|rule|severity|ratio)', key(offS) === key(onS),
      offS.length + ' -> ' + onS.length);
    chk('R12 egress rows identical with witness on', key(offE) === key(onE), offE.length + ' -> ' + onE.length);
    chk('R12 witness is ABSENT when not asked for', offS.every(r => r.witness === undefined) && offE.every(r => r.witness === undefined));

    // The findings the user named: an "isolated room" must show whether it is actually isolated.
    const iso = onE.filter(r => r.rule === 'isolated_room');
    chk('R12 every isolated_room states its graph degree and neighbours',
      iso.length > 0 && iso.every(r => r.witness && typeof r.witness.graphDegree === 'number' && Array.isArray(r.witness.neighbours)),
      iso.length + ' rows, degrees=' + JSON.stringify(iso.map(r => r.witness.graphDegree)));
    chk('R12 a degree>0 "isolated" room is distinguishable from a degree-0 one',
      iso.every(r => /NO edges at all/.test(r.witness.reads) === (r.witness.graphDegree === 0)));
    const col = onS.filter(r => r.rule === 'column_continuity');
    chk('R12 every column_continuity names what is below it, or that nothing is',
      col.every(r => r.witness && Object.prototype.hasOwnProperty.call(r.witness, 'nearestBelow')),
      'nearestBelow non-null on ' + col.filter(r => r.witness.nearestBelow).length + '/' + col.length);
    chk('R12 a rejected candidate says WHY it was rejected',
      col.filter(r => r.witness.nearestBelow).every(r => !!r.witness.nearestBelow.rejectedBecause),
      JSON.stringify([...new Set(col.filter(r => r.witness.nearestBelow).map(r => r.witness.nearestBelow.rejectedBecause))]));
    const can = onS.filter(r => r.rule === 'span_depth_cantilever');
    chk('R12 every cantilever discloses that the classification is an INFERENCE',
      can.length > 0 && can.every(r => r.witness && /inference/.test(r.witness.classifiedBy)), can.length + ' rows');
    const freeCls = {};
    can.forEach(r => { const f = (r.witness.freeEnds || [])[0]; const k = (f && f.nearest) ? f.nearest.ifc_class : '<nothing near>'; freeCls[k] = (freeCls[k] || 0) + 1; });
    console.log('  ℹ real Hospital cantilever free-end neighbours: ' + JSON.stringify(freeCls));
    console.log('  ℹ would be clean under the steel rule: ' + can.filter(r => r.witness.wouldBeCleanUnderSteelRule).length + '/' + can.length);
    const why = {};
    col.forEach(r => { const b = r.witness.nearestBelow; const k = b ? b.rejectedBecause : '<nothing below>'; why[k] = (why[k] || 0) + 1; });
    console.log('  ℹ real Hospital column_continuity rejection reasons: ' + JSON.stringify(why));
  } else {
    console.log('  §W-RULE-REPORT SKIP R12 — buildings/Hospital_meta.db not present');
  }

  // ── R13 ONE-LITERAL — proves: the thresholds exist in ONE place per evaluator, and that place
  // agrees with the AUTHORED rates/*.json. This is the guard the movie-bake session asked for:
  // the film branch shipped span_depth_concrete 20/26 against main's cited 16/21 because a second
  // copy existed and nothing compared them. A silent edit to either side now fails here.
  console.log('§W-RULE-REPORT R13 ONE-LITERAL');
  {
    const sDiff = RuleReport.diffRuleThresholds(StructuralSanity.FALLBACK_RULES, STRUCT_RULES);
    chk('R13 StructuralSanity.FALLBACK_RULES == rates/structural_rules.json', sDiff.length === 0, JSON.stringify(sDiff));
    const eDiff = RuleReport.diffRuleThresholds(EgressSanity.FALLBACK_RULES, EGRESS_RULES);
    chk('R13 EgressSanity.FALLBACK_RULES == rates/egress_rules.json', eDiff.length === 0, JSON.stringify(eDiff));

    // No OTHER file may re-declare them. Counts whole fallback objects, not the JSON source.
    const scan = (f) => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (e) { return ''; } };
    const others = ['viewer/rule_checklist.js', 'viewer/rule_report.js', 'cli_silent_bake.js'];
    others.forEach(f => {
      const txt = scan(f);
      chk('R13 ' + f + ' declares no fallback rules object of its own',
        !/RULES_FALLBACK\s*=\s*\{|FALLBACK_RULES\s*=\s*\{/.test(txt));
    });
    // And the control: the diff function must actually be able to fail.
    const drifted = JSON.parse(JSON.stringify(STRUCT_RULES));
    drifted.structural_rules.find(r => r.name === 'span_depth_concrete').warning_ratio = 20;
    const d = RuleReport.diffRuleThresholds(StructuralSanity.FALLBACK_RULES, drifted);
    chk('R13 the drift guard CATCHES the exact film-branch drift (concrete 16 -> 20)',
      d.length === 1 && d[0].field === 'span_depth_concrete.warning_ratio' && d[0].a === 16 && d[0].b === 20,
      JSON.stringify(d));
  }

  // ── R14 LOADRULES-SHAPE — proves: one shape for "which rules file ran", and a failed fetch is
  // never a silent substitution. The film session writes its closing-card line against this.
  console.log('§W-RULE-REPORT R14 LOADRULES-SHAPE');
  {
    const okFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(STRUCT_RULES) });
    const r1 = await RuleReport.loadRules(okFetch, 'rates/structural_rules.json', StructuralSanity.FALLBACK_RULES);
    chk('R14 a good fetch reports source=fetched with no error', r1.source === 'fetched' && r1.error === null, JSON.stringify({ s: r1.source, e: r1.error }));

    const badFetch = () => Promise.resolve({ ok: false, status: 404 });
    const r2 = await RuleReport.loadRules(badFetch, 'rates/structural_rules.json', StructuralSanity.FALLBACK_RULES);
    chk('R14 a 404 reports source=fallback AND carries the reason', r2.source === 'fallback' && /404/.test(r2.error), JSON.stringify({ s: r2.source, e: r2.error }));
    chk('R14 the fallback it hands back is the evaluator\'s ONE literal', r2.rules === StructuralSanity.FALLBACK_RULES);

    const r3 = await RuleReport.loadRules(null, 'rates/egress_rules.json', EgressSanity.FALLBACK_RULES);
    chk('R14 no fetch at all still reports fallback, never fetched', r3.source === 'fallback' && !!r3.error, JSON.stringify({ s: r3.source, e: r3.error }));

    const throwFetch = () => Promise.reject(new Error('network down'));
    const r4 = await RuleReport.loadRules(throwFetch, 'x.json', EgressSanity.FALLBACK_RULES);
    chk('R14 a thrown fetch is caught and reported, not propagated', r4.source === 'fallback' && /network down/.test(r4.error));

    // The whole point: the source survives into the report the user reads.
    const rep = RuleReport.buildRuleReport({ rowsS: ROWS_S, ruleDefs: [r2.rules], meta: { rulesSource: { structural: r2.source } } });
    chk('R14 the fallback fact reaches the report provenance header', rep.rulesSource.structural === 'fallback', JSON.stringify(rep.rulesSource));
  }

  // ── R15 OVERLAY-MERGE — proves: a jurisdiction can override ONE threshold without restating
  // the rulebook, and the report can still say where every number came from. The motivating case
  // is real and already in egress_sanity.js's header: IBC 2021 requires 1.054m for Group I-2
  // bed-movement egress doors, but main ships the general §1010.1.1 0.813m because a blanket
  // 1.054 would false-flag every non-bed-movement door.
  console.log('§W-RULE-REPORT R15 OVERLAY-MERGE');
  {
    const overlay = { egress_rules: [{ name: 'door_clear_width', critical_m: 1.054 }] };
    const m = RuleReport.mergeRuleSets(EGRESS_RULES, overlay, { overlayId: 'i2_us' });
    const dw = m.rules.egress_rules.find(r => r.name === 'door_clear_width');
    chk('R15 the named field is overridden', dw.critical_m === 1.054, JSON.stringify(dw));
    chk('R15 unnamed fields of the SAME rule are inherited, not dropped',
      dw.warning_m === 0.85 && dw.max_severity === 'WARNING' && JSON.stringify(dw.applies_to) === '["IfcDoor"]',
      JSON.stringify(dw));
    chk('R15 rules the overlay never mentions are untouched',
      JSON.stringify(m.rules.egress_rules.filter(r => r.name !== 'door_clear_width')) ===
      JSON.stringify(EGRESS_RULES.egress_rules.filter(r => r.name !== 'door_clear_width')));
    chk('R15 rule ORDER follows the base, so output stays deterministic (T8.6)',
      JSON.stringify(m.rules.egress_rules.map(r => r.name)) === JSON.stringify(EGRESS_RULES.egress_rules.map(r => r.name)),
      m.rules.egress_rules.map(r => r.name).join(','));
    chk('R15 the BASE object is not mutated (a second merge must start clean)',
      EGRESS_RULES.egress_rules.find(r => r.name === 'door_clear_width').critical_m === 0.813);

    // Provenance — the gap that per-file rulesSource could not close.
    chk('R15 provenance names the rule, the overlay, the field, and BOTH values',
      m.provenance.length === 1 && m.provenance[0].rule === 'door_clear_width' &&
      m.provenance[0].source === 'i2_us' && m.provenance[0].changed[0].field === 'critical_m' &&
      m.provenance[0].changed[0].from === 0.813 && m.provenance[0].changed[0].to === 1.054,
      JSON.stringify(m.provenance));
    const same = RuleReport.mergeRuleSets(EGRESS_RULES, { egress_rules: [{ name: 'door_clear_width', critical_m: 0.813 }] }, { overlayId: 'x' });
    chk('R15 an overlay that restates the SAME value records no override', same.provenance.length === 0, JSON.stringify(same.provenance));

    // A jurisdiction adding a check it alone requires.
    const added = RuleReport.mergeRuleSets(EGRESS_RULES, { egress_rules: [{ name: 'refuge_area', applies_to: ['room_graph_node'], min_m2: 2.5 }] }, { overlayId: 'my' });
    chk('R15 a rule present ONLY in the overlay is added', added.rules.egress_rules.length === EGRESS_RULES.egress_rules.length + 1);
    chk('R15 an added rule is marked added in provenance',
      added.provenance.length === 1 && added.provenance[0].added === true, JSON.stringify(added.provenance));

    // Arrays replace wholesale — documented, and asserted so nobody "improves" it into a union.
    const arr = RuleReport.mergeRuleSets(STRUCT_RULES, { structural_rules: [{ name: 'span_depth_steel', name_hints: ['UB'] }] }, { overlayId: 'x' });
    chk('R15 an array field is REPLACED, never unioned',
      JSON.stringify(arr.rules.structural_rules.find(r => r.name === 'span_depth_steel').name_hints) === '["UB"]');

    chk('R15 no overlay at all returns the base unchanged',
      RuleReport.mergeRuleSets(EGRESS_RULES, null).rules === EGRESS_RULES);

    // And the merged set still passes the evaluators — a merge that produced an unusable rule
    // object would otherwise only show up as findings quietly vanishing.
    if (fs.existsSync(HOSPITAL)) {
      const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
      const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
      const bef = EgressSanity.evaluate(hq, EGRESS_RULES, { log: () => {} }).filter(r => r.rule === 'door_clear_width').length;
      const aft = EgressSanity.evaluate(hq, m.rules, { log: () => {} }).filter(r => r.rule === 'door_clear_width').length;
      chk('R15 the merged rulebook RUNS and the stricter threshold actually bites',
        aft > bef, 'Hospital door_clear_width 0.813m -> ' + bef + ' findings; I-2 1.054m -> ' + aft);
    }
  }

  // ── R16 OVERLAY-LOAD — proves: an absent overlay is the ordinary case, not a failure, and a
  // BROKEN overlay is never disguised as "no override".
  console.log('§W-RULE-REPORT R16 OVERLAY-LOAD');
  {
    const baseOk = (u) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EGRESS_RULES) });
    const r1 = await RuleReport.loadRules(baseOk, 'rates/egress_rules.json', EgressSanity.FALLBACK_RULES);
    chk('R16 no overlay requested reports source=none, not an error', r1.overlay.source === 'none' && r1.provenance.length === 0, JSON.stringify(r1.overlay));

    const mixed = (u) => /_my\.json$/.test(u)
      ? Promise.resolve({ ok: false, status: 404 })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EGRESS_RULES) });
    const r2 = await RuleReport.loadRules(mixed, 'rates/egress_rules.json', EgressSanity.FALLBACK_RULES,
      { overlayUrl: 'rates/egress_rules_my.json', overlayId: 'my' });
    chk('R16 a 404 overlay reports "absent" and keeps the base rules', r2.overlay.source === 'absent' && r2.overlay.error === null, JSON.stringify(r2.overlay));
    chk('R16 base source is still fetched — an absent overlay must not degrade it', r2.source === 'fetched');
    chk('R16 an absent overlay leaves the rulebook byte-identical',
      JSON.stringify(r2.rules) === JSON.stringify(EGRESS_RULES));

    const broken = (u) => /_my\.json$/.test(u)
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('Unexpected token')) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EGRESS_RULES) });
    const r3 = await RuleReport.loadRules(broken, 'rates/egress_rules.json', EgressSanity.FALLBACK_RULES,
      { overlayUrl: 'rates/egress_rules_my.json', overlayId: 'my' });
    chk('R16 a MALFORMED overlay reports "error", distinct from "absent"',
      r3.overlay.source === 'error' && /Unexpected token/.test(r3.overlay.error), JSON.stringify(r3.overlay));
    chk('R16 a malformed overlay still leaves the base rules usable', JSON.stringify(r3.rules) === JSON.stringify(EGRESS_RULES));

    const good = (u) => /_my\.json$/.test(u)
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ egress_rules: [{ name: 'door_clear_width', critical_m: 1.054 }] }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EGRESS_RULES) });
    const r4 = await RuleReport.loadRules(good, 'rates/egress_rules.json', EgressSanity.FALLBACK_RULES,
      { overlayUrl: 'rates/egress_rules_my.json', overlayId: 'my' });
    chk('R16 a good overlay merges and reports its provenance',
      r4.overlay.source === 'fetched' && r4.provenance.length === 1 &&
      r4.rules.egress_rules.find(r => r.name === 'door_clear_width').critical_m === 1.054);

    const rep = RuleReport.buildRuleReport({ rowsE: ROWS_E, ruleDefs: [r4.rules],
      meta: { rulesSource: { egress: r4.source }, rulesOverlay: { egress: r4.overlay }, rulesProvenance: r4.provenance } });
    chk('R16 overlay + per-rule provenance reach the report the user reads',
      rep.rulesOverlay.egress.id === 'my' && rep.rulesProvenance[0].changed[0].to === 1.054,
      JSON.stringify(rep.rulesProvenance));
    chk('R16 with no overlay the report says so as an empty list, not a missing key',
      Array.isArray(RuleReport.buildRuleReport({ rowsE: [], ruleDefs: [] }).rulesProvenance));
  }

  // ── R17 CONSTANT-COLUMN-IS-NOT-EVIDENCE — proves: a field that is present, typed and always
  // the same value must never be read as a measurement. This test exists because the FIRST
  // version of the axis_aligned_bboxes probe reported `ok` ("every beam and column is
  // axis-aligned") on three real buildings whose rotation_x/y/z are zero on ALL 118,490
  // transform rows — the column records nothing. "No element is rotated" and "rotation was never
  // recorded" give the identical query result and mean opposite things; only one of them
  // justifies trusting an axis-aligned test.
  console.log('§W-RULE-REPORT R17 CONSTANT-COLUMN-IS-NOT-EVIDENCE');
  {
    const mk = (rotZ) => {
      const d = new SQL.Database();
      d.run(`CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
             CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
             CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT);`);
      d.run("INSERT INTO elements_meta VALUES ('c1','IfcColumn','C1','L1','STR',NULL,'','F')");
      d.run("INSERT INTO elements_meta VALUES ('w1','IfcWall','W1','L1','ARC',NULL,'','F')");
      d.run("INSERT INTO element_transforms VALUES ('c1',0,0,1.5,0,0,0,0.4,0.4,3)");
      d.run(`INSERT INTO element_transforms VALUES ('w1',5,0,1.5,0,0,${rotZ},4,0.2,3)`);
      return (sql, p) => { const r = p ? d.exec(sql, p) : d.exec(sql); return r.length ? r[0].values : []; };
    };

    const flat = RuleReport.runSufficiencyProbes(mk(0), { log: () => {} }).filter(x => x.check === 'axis_aligned_bboxes')[0];
    chk('R17 an all-zero rotation column reports "uninformative", NOT "ok"',
      flat.verdict === 'uninformative', JSON.stringify(flat.measured) + ' verdict=' + flat.verdict);
    chk('R17 it says the column records nothing, not that the model is axis-aligned',
      /records nothing/.test(flat.consequence) && /NOT evidence/.test(flat.consequence));
    chk('R17 it still reports the row count it looked at', flat.measured.transformRows === 2, JSON.stringify(flat.measured));

    // The control: the same probe on a DB where rotation IS recorded must go back to a real verdict.
    const live = RuleReport.runSufficiencyProbes(mk(0.8), { log: () => {} }).filter(x => x.check === 'axis_aligned_bboxes')[0];
    chk('R17 when rotation IS recorded somewhere, the verdict becomes real again',
      live.verdict === 'ok' && live.measured.anyRotatedElementInModel === 1, JSON.stringify(live.measured) + ' verdict=' + live.verdict);
    chk('R17 and that "ok" explicitly cites the evidence for it',
      /rotation is genuinely recorded/.test(live.consequence), live.consequence.slice(0, 90));

    // On the real building the false all-clear must be gone.
    if (fs.existsSync(HOSPITAL)) {
      const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
      const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
      const real = RuleReport.runSufficiencyProbes(hq, { log: () => {} }).filter(x => x.check === 'axis_aligned_bboxes')[0];
      chk('R17 real Hospital_meta.db no longer reports a false "ok" for rotation',
        real.verdict === 'uninformative', 'verdict=' + real.verdict + ' ' + JSON.stringify(real.measured));
    }
  }

  // ── R18-R21 §BENCH_DEFECT_ZERO (T12) — the artifact METRIC's own qualifying conditions.
  // Each of the four cases below is a REAL row from the fleet at 1f795c70 that `artifactRates`
  // scored as a defect while the rule had judged it correctly. The control beside each one is
  // the same shape moved to where the rule really would have missed, so a passing test here is
  // one that could have failed (T11.5 trap 3).
  const RD = [STRUCT_RULES, EGRESS_RULES];
  const colRow = (near) => [{ guid: 'c9', ifc_class: 'IfcColumn', name: 'C', storey: 'VÅN 2',
    rule: 'column_continuity', severity: 'CRITICAL', ratio: null,
    witness: { nearestBelow: near, columnBaseZ: 7.9, toleranceM: 0.3 } }];
  const beamRow = (nearest) => [{ guid: 'b9', ifc_class: 'IfcBeam', name: 'B', storey: 'VÅN 2',
    rule: 'floating_member', severity: 'CRITICAL', ratio: null,
    witness: { supportedEnds: 0, of: 2, freeEnds: [{ end: 0, at: { x: 0, y: 0, z: 0 }, nearest: nearest }] } }];
  const roomRow = (w) => [{ guid: 'RM_9', ifc_class: 'IfcSpace', name: '≈ R9', storey: 'VÅNING 4',
    rule: 'isolated_room', severity: 'CRITICAL', ratio: null, witness: w }];
  const rate = (rows) => RuleReport.artifactRates(rows, RD)[0];

  console.log('§W-RULE-REPORT R18 PRECISION-DECIDED-A-TOLERANCE');
  {
    // LTU_AHouse_extracted T0_..._0JpN4ZIbD1EfEtuz0sIANj: the real gap is 0.300001621 m against a
    // 0.3 m tolerance. At toFixed(3) it printed 0.3 and the metric read it as INSIDE.
    const out = rate(colRow({ guid: 'x', ifc_class: 'IfcColumn', name: '-',
      centrelineOffsetM: 0.025024, topToColumnBaseM: 0.300002, topBelowColumnBaseM: 0.300002 }));
    chk('R18 a 0.300002 m gap against a 0.3 m tolerance is NOT a defect',
      out.defect === 0, 'defect=' + out.defect + ' nearMiss=' + out.nearMiss);
    chk('R18 and it is still counted as evidence seen — a near-miss, not silence', out.nearMiss === 1);
    // CONTROL: inside the tolerance for real. If this does not fire, the test above proves nothing.
    const ctl = rate(colRow({ guid: 'x', ifc_class: 'IfcColumn', name: '-',
      centrelineOffsetM: 0.025024, topToColumnBaseM: 0.299000, topBelowColumnBaseM: 0.299000 }));
    chk('R18 CONTROL 0.299 m IS a defect — the test can still fail',
      ctl.defect === 1, 'defect=' + ctl.defect);
    // And the evaluator must publish enough digits for that distinction to survive to the metric.
    const cols = [['col', 'C', 'VÅN 2', 0, 0, 8.05, 0.1, 0.3, 0.3000016212463379]];
    const sups = [['sup', 'S', 'VÅN 2', 0.025024414, 0, 7.925, 0.15, 0.3, 0.5500016212463379]];
    const any = [['sup', 'S', 'VÅN 2', 0.025024414, 0, 7.925, 0.15, 0.3, 0.5500016212463379, 'IfcColumn']];
    const w = StructuralSanity._columnContinuity(cols, sups, 0.3, any).col.witness.nearestBelow;
    chk('R18 the witness publishes the gap at 6 dp, not 3 — 3 dp cannot express it',
      w.topToColumnBaseM > 0.3, 'topToColumnBaseM=' + w.topToColumnBaseM + ' (at 3 dp this is 0.3)');
  }

  console.log('§W-RULE-REPORT R19 A-TWIN-IS-NOT-A-SUPPORT');
  {
    // The real shape of the four LTU rows: an ARC column sharing the STR column's TOP plane
    // EXACTLY and running 0.25 m past its bottom. It contains the column; it does not hold it up.
    // Two of the four measure 0.300000190 m from the base against a 0.3 m tolerance — 190 nm, a
    // distinction no rounding decides honestly — so the test that has to carry this is the one
    // that is exact: does the candidate reach as high as the column itself.
    const twin = { guid: 'x', ifc_class: 'IfcColumn', name: '-', centrelineOffsetM: 0.025024,
      topToColumnBaseM: 0.300000, topBelowColumnBaseM: -0.300000, topAboveColumnTopM: 0 };
    const out = rate(colRow(twin));
    chk('R19 a candidate reaching the column\'s own top is not a defect, even at 0.300000 m',
      out.defect === 0, 'defect=' + out.defect);
    chk('R19 nor a near-miss — no threshold turns a co-located twin into a support',
      out.nearMiss === 0, 'nearMiss=' + out.nearMiss);
    // CONTROL: genuinely underneath, same distances. That IS a threshold call for an engineer.
    const ctl = rate(colRow(Object.assign({}, twin, { topAboveColumnTopM: -0.55, topBelowColumnBaseM: 0.300002, topToColumnBaseM: 0.300002 })));
    chk('R19 CONTROL a candidate genuinely below is still counted as a near-miss',
      ctl.nearMiss === 1 && ctl.defect === 0, 'defect=' + ctl.defect + ' nearMiss=' + ctl.nearMiss);
    // CONTROL 2: the knife-edge row must not be excluded for being 190 nm out — it is excluded
    // for reaching the column's top. Move only that field and it comes back as a real defect.
    const inside = rate(colRow(Object.assign({}, twin, { topAboveColumnTopM: -0.25, topToColumnBaseM: 0.3, topBelowColumnBaseM: 0.3 })));
    chk('R19 CONTROL the same 0.3 m gap from something genuinely below IS a defect',
      inside.defect === 1, 'defect=' + inside.defect);
    // The evaluator must actually publish the field, computed off real bboxes.
    const w = StructuralSanity._columnContinuity(
      [['col', 'C', 'L', 0, 0, 8.05, 0.1, 0.3, 0.3000016212463379]], [], 0.3,
      [['t', 'T', 'L', 0.025, 0, 7.925, 0.15, 0.3, 0.5500016212463379, 'IfcColumn']]
    ).col.witness.nearestBelow;
    chk('R19 a twin sharing the column\'s top plane publishes topAboveColumnTopM === 0',
      w.topAboveColumnTopM === 0, 'topAboveColumnTopM=' + w.topAboveColumnTopM);
    chk('R19 and rejectedBecause names it — no more "unknown"',
      /co-located duplicate/.test(w.rejectedBecause), w.rejectedBecause);
  }

  console.log('§W-RULE-REPORT R20 A-BEAM-BEARS-BY-FRAMING');
  {
    // LTU_AHouse_meta 1XTQObkjP83Rry27DGiIWn: an ARC precast beam butting end-to-end 0.013 m away
    // — and 0.4993 m higher. §FRAMING_TOP_OF_STEEL's datum is 0.4 m, so the rule cannot count it.
    const out = rate(beamRow({ guid: 'x', ifc_class: 'IfcBeam', name: '-',
      gapHorizM: 0.013, gapVertM: 0.111, topDzM: 0.499251, bottomDzM: 0.498896 }));
    chk('R20 a beam 0.499 m off BOTH framing datums is not a defect',
      out.defect === 0, 'defect=' + out.defect + ' nearMiss=' + out.nearMiss);
    chk('R20 it is still evidence the reader should see — a near-miss', out.nearMiss === 1);
    // CONTROL 1: top-flush. The steel norm. This is a real miss and must fire.
    const ctl = rate(beamRow({ guid: 'x', ifc_class: 'IfcBeam', name: '-',
      gapHorizM: 0.013, gapVertM: 0.111, topDzM: 0.004, bottomDzM: 0.482 }));
    chk('R20 CONTROL a top-flush beam at the same point IS a defect',
      ctl.defect === 1, 'defect=' + ctl.defect);
    // CONTROL 2: a class the z-bracket really does govern must be judged exactly as before.
    const wall = rate(beamRow({ guid: 'x', ifc_class: 'IfcWall', name: '-',
      gapHorizM: 0.013, gapVertM: 0.111, topDzM: null, bottomDzM: null }));
    chk('R20 CONTROL a wall at the same point is still a defect — only beams changed',
      wall.defect === 1, 'defect=' + wall.defect);
    // A pre-T12 witness carries no datums. It must keep the OLD answer, never a silent clean.
    const old = rate(beamRow({ guid: 'x', ifc_class: 'IfcBeam', name: '-', gapHorizM: 0.013, gapVertM: 0.111 }));
    chk('R20 a witness with no framing datums falls back to the old test, not to "clean"',
      old.defect === 1, 'defect=' + old.defect);
  }

  console.log('§W-RULE-REPORT R21 ISOLATED-IS-REACHABILITY-NOT-DEGREE');
  {
    // LTU_AHouse_extracted RM_VÅNING_4_10/_11: wired to each other and to nothing else, on a
    // storey with no circulation node, in a model with zero exit nodes.
    const out = rate(roomRow({ graphDegree: 1, neighbours: [{ guid: 'RM_9b', via: 'E1' }],
      storeyHasCirculationNode: false, exitNodesInModel: 0, componentSize: 2, componentHasExitOrCirc: false }));
    chk('R21 a sealed two-room component is not a defect, whatever its degree',
      out.defect === 0, 'defect=' + out.defect);
    // CONTROL: T9.6's real HHS bug — 6 edges, four onto its own storey's SPINE, called isolated.
    const ctl = rate(roomRow({ graphDegree: 6, neighbours: [{ guid: 'SPINE::VÅNING 4|x|32.44', via: 'E6' }],
      storeyHasCirculationNode: true, exitNodesInModel: 3, componentSize: 41, componentHasExitOrCirc: true }));
    chk('R21 CONTROL the T9.6 shape — a room wired to its own storey circulation — IS a defect',
      ctl.defect === 1, 'defect=' + ctl.defect);
    chk('R21 the basis states reachability, not degree',
      /connected component/.test(ctl.basis), ctl.basis);
    // A pre-T12 witness has no component fields; it must keep the old answer rather than go quiet.
    const old = rate(roomRow({ graphDegree: 1, neighbours: [], storeyHasCirculationNode: false, exitNodesInModel: 0 }));
    chk('R21 a witness with no component field falls back to the old degree test',
      old.defect === 1, 'defect=' + old.defect);
  }

  console.log('§W-RULE-REPORT R22 THE-NEW-WITNESS-FIELDS-EXIST-ON-A-REAL-BUILDING');
  {
    if (fs.existsSync(HOSPITAL)) {
      const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
      const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
      const sRows = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: () => {}, witness: true });
      const cols = sRows.filter(r => r.rule === 'column_continuity' && (r.witness || {}).nearestBelow);
      chk('R22 real column witnesses carry the signed gap',
        cols.length > 0 && cols.every(r => typeof r.witness.nearestBelow.topBelowColumnBaseM === 'number'),
        cols.length + ' column rows with a nearestBelow');
      const beamNear = sRows.filter(r => (r.rule === 'floating_member' || r.rule === 'span_depth_cantilever'))
        .reduce((a, r) => a.concat(((r.witness || {}).freeEnds || []).map(e => e.nearest).filter(n => n && n.ifc_class === 'IfcBeam')), []);
      chk('R22 real beam-class neighbours carry both framing datums',
        beamNear.length > 0 && beamNear.every(n => typeof n.topDzM === 'number' && typeof n.bottomDzM === 'number'),
        beamNear.length + ' beam-class nearest neighbours');
      const eRows = EgressSanity.evaluate(hq, EGRESS_RULES, { log: () => {}, witness: true })
        .filter(r => r.rule === 'isolated_room');
      chk('R22 real isolated_room witnesses carry the component fields',
        eRows.length === 0 || eRows.every(r => typeof r.witness.componentHasExitOrCirc === 'boolean'),
        eRows.length + ' isolated_room rows');
      // R11's contract, re-checked: witness:true adds evidence and changes no count.
      const noW = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: () => {} });
      chk('R22 the new witness fields change NO finding count',
        noW.length === sRows.length, noW.length + ' without witness vs ' + sRows.length + ' with');
    } else {
      console.log('  ⚠ R22 SKIPPED — buildings/Hospital_meta.db absent (this is a reported absence, not a pass)');
    }
  }

  // ── R23 §T12.6 THE PROBE MUST NOT KEEP ITS OWN COPY OF THE SUPPORT LISTS.
  // The bug this replaces: `support_classes_present` carried a typed copy of SUPPORT_CLASSES /
  // COL_SUPPORT_CLASSES in a comment and in its own SQL IN-list. T9.1 added IfcWall to both real
  // lists and T9.3 added IfcSlab; the probe never noticed and went on reporting "IfcWall and
  // IfcSlab are in neither support list", flagging Terminal_silent `degraded` for a gap that had
  // been closed for two PRs. R23b is the assertion that would have caught it: feed the probe a
  // DIFFERENT list and its answer must change. A probe with a private copy cannot pass that.
  console.log('§W-RULE-REPORT R23 SUPPORT-LISTS-ARE-READ-NOT-COPIED');
  {
    const SC = StructuralSanity.SUPPORT_CLASSES, CSC = StructuralSanity.COL_SUPPORT_CLASSES;
    chk('R23 the evaluator really does list IfcWall and IfcSlab — the claim the old probe denied',
      SC.indexOf('IfcWall') !== -1 && SC.indexOf('IfcSlab') !== -1 &&
      CSC.indexOf('IfcWall') !== -1 && CSC.indexOf('IfcSlab') !== -1, 'beam=' + SC.join('/') + '  col=' + CSC.join('/'));
    let mutated = false;
    try { SC.push('IfcMutated'); mutated = SC.indexOf('IfcMutated') !== -1; } catch (e) { /* frozen, strict mode throws */ }
    chk('R23 the exported lists are frozen — a consumer cannot corrupt them for the next caller',
      !mutated && StructuralSanity.SUPPORT_CLASSES.indexOf('IfcMutated') === -1,
      'length=' + StructuralSanity.SUPPORT_CLASSES.length);

    const mk = (counts) => {
      const d = new SQL.Database();
      d.run('CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT)');
      Object.keys(counts).forEach(c => { for (let i = 0; i < counts[c]; i++) d.run('INSERT INTO elements_meta VALUES (?,?)', [c + i, c]); });
      return (sql, p) => { const r = p ? d.exec(sql, p) : d.exec(sql); return r.length ? r[0].values : []; };
    };
    const probe = (q, o) => RuleReport.runSufficiencyProbes(q, o || { log: () => {} }).filter(x => x.check === 'support_classes_present')[0];
    const real = { log: () => {}, supportClasses: StructuralSanity.SUPPORT_CLASSES, colSupportClasses: StructuralSanity.COL_SUPPORT_CLASSES };

    const q = mk({ IfcWall: 10, IfcSlab: 7, IfcColumn: 5, IfcBeam: 3 });
    const a = probe(q, real);
    chk('R23 walls and slabs now COUNT as support, and the verdict is ok',
      a.verdict === 'ok' && a.measured.byClass.IfcWall === 10 && a.measured.byClass.IfcSlab === 7,
      'verdict=' + a.verdict + ' ' + JSON.stringify(a.measured.byClass));
    chk('R23 the stale sentence is gone',
      !/neither support list/.test(a.consequence), a.consequence.slice(0, 80));

    // R23b — THE DECISIVE ONE. Same DB, a list that omits IfcWall. A copy cannot react to this.
    const b = probe(q, { log: () => {}, supportClasses: ['IfcColumn'], colSupportClasses: ['IfcColumn'] });
    chk('R23b passing a DIFFERENT list changes the answer — the probe reads it, never a copy',
      b.measured.byClass.IfcWall === undefined && b.measured.supportElements === 5,
      JSON.stringify(b.measured.byClass) + ' supportElements=' + b.measured.supportElements);

    // R23c — no lists supplied is 'unavailable', never 'ok' and never a guessed fallback.
    const c = probe(q, { log: () => {} });
    chk('R23c with no lists the verdict is "unavailable", not "ok"',
      c.verdict === 'unavailable' && c.measured === null, 'verdict=' + c.verdict);
    chk('R23c and it says why, naming the exports to pass',
      /StructuralSanity\.SUPPORT_CLASSES/.test(c.consequence), c.consequence.slice(0, 70));

    // R23d — a frame holding itself up. IfcBeam and IfcColumn are THEMSELVES support classes
    // (beams frame into beams, columns land on transfer beams), so "zero support elements" is
    // unreachable in any model with something to check; the question that is not vacuous is
    // whether there is bearing geometry BESIDES the members being checked.
    const d = probe(mk({ IfcBeam: 40, IfcColumn: 9, IfcDoor: 12 }), real);
    chk('R23d beams and columns alone, no wall/slab/footing/plate, reports "absent"',
      d.verdict === 'absent' && d.measured.bearingBesidesSubjects === 0 && d.measured.supportElements === 49,
      'verdict=' + d.verdict + ' besides=' + d.measured.bearingBesidesSubjects + ' total=' + d.measured.supportElements);
    chk('R23d and says the findings describe the extraction, not the building',
      /describe the extraction/.test(d.consequence));

    // R23e — the one-sided blind spot is DERIVED from the two lists, not named in the source.
    const e = probe(mk({ IfcPlate: 2211, IfcColumn: 604 }), real);
    chk('R23e IfcPlate is reported as beam-only support — the real asymmetry, derived not typed',
      /IfcPlate can hold a beam end but not a column/.test(e.consequence), e.consequence.slice(-120));

    // R23f — on the real building the false 'degraded' must be gone.
    if (fs.existsSync(HOSPITAL)) {
      const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
      const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
      const h = probe(hq, real);
      chk('R23f real Hospital_meta.db no longer reports a gap that T9.1/T9.3 closed',
        h.verdict === 'ok' && !/neither support list/.test(h.consequence),
        'verdict=' + h.verdict + ' supportElements=' + h.measured.supportElements);
    } else {
      console.log('  ⚠ R23f SKIPPED — Hospital_meta.db absent (a reported absence, not a pass)');
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
