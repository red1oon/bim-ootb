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
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RuleReport = require('../viewer/rule_report.js');
const StructuralSanity = require('../viewer/structural_sanity.js');
const EgressSanity = require('../viewer/egress_sanity.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

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
    const suff = RuleReport.runSufficiencyProbes(q, { log: (m) => logs.push(m) });
    const by = {}; suff.forEach(s => by[s.check] = s);

    chk('R10 footings_modelled = absent (0 IfcFooting, 2 columns) — the HHS 131/131 cause',
      by.footings_modelled.verdict === 'absent', JSON.stringify(by.footings_modelled.measured));
    chk('R10 modelled_spaces = absent (0 IfcSpace in elements_meta)',
      by.modelled_spaces.verdict === 'absent', JSON.stringify(by.modelled_spaces.measured));
    chk('R10 room_confidence_sigils counts the ≈/⚠ marks the evaluators ignore',
      by.room_confidence_sigils.measured.approx === 1 && by.room_confidence_sigils.measured.suspect === 1,
      JSON.stringify(by.room_confidence_sigils.measured));
    chk('R10 support_classes_present = degraded when IfcWall outnumbers the listed classes',
      by.support_classes_present.verdict === 'degraded', JSON.stringify(by.support_classes_present.measured));
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
    const suffBare = RuleReport.runSufficiencyProbes(bq, { log: () => {} });
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
  const HOSPITAL = path.join(__dirname, '../buildings/Hospital_meta.db');
  if (fs.existsSync(HOSPITAL)) {
    const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL)));
    const hq = (sql, p) => { const r = p ? hdb.exec(sql, p) : hdb.exec(sql); return r.length ? r[0].values : []; };
    const slog = [], elog = [];
    const rowsS = StructuralSanity.evaluate(hq, STRUCT_RULES, { log: (m) => slog.push(m) });
    const rowsE = EgressSanity.evaluate(hq, EGRESS_RULES, { log: (m) => elog.push(m) });
    const suff = RuleReport.runSufficiencyProbes(hq, { log: () => {} });
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
