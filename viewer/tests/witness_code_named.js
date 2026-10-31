#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CODE-NAMED (prompts/STRUCTURAL_SANITY.md T13 §CODE_NAMED). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the compliance panel judged against US code numbers without saying so, and a rule that judged NOTHING read the same as a rule
// that found nothing ("1 finding" on the Duplex while 9 of its 12 rules had nothing to judge). What could go wrong, one check each:
//   C1 a threshold with no stated basis, or a basis that does not match the line it cites: every rule row of both files has `basis`; every cited entry's clause is found
//      at the file:line its `source` names (the witness re-reads those lines).
//   C2 the header names a code that judged nothing, or misses one that did: the codes = the basis codes of the rules that RAN (Hospital: IBC 2021 only — the ACI
//      rule judged no beam there; Duplex: IBC 2021 from the door rule), and a fetched overlay's id is named.
//   C3 moving the two occupant constants into the rules changed a finding, or the overlay still cannot reach them: with the rule row removed (the evaluator's
//      fallback, the old constants) findings are identical; an overlay setting width_per_occupant_m changes the door_occupant_capacity findings (falsifier).
//   C4 a vacuous rule reads clean: ran + nothing_to_judge + not_checkable + not_applicable = the rules the evaluators emit; Duplex reports column_continuity
//      (0 IfcColumn) and both material span/depth rules as nothing to judge, never as ran.
//   C6 the panel does not show it: the real panel HTML (rule_checklist.js buildRuleChecklistHtml) for Hospital's egress run carries the header line with the codes,
//      'overlay: none', 'building type: not stated' and the coverage counts of C4, and lists the nothing-to-judge rules by name.
//   C5 a rule typed for other buildings still flags: applies_to_types ['Farming Shed'] on circulation_distance makes it not_applicable on Hospital (type not
//      stated: its findings dropped), and with the type stated 'Farming Shed' it runs with the same findings as untyped.
// Inputs: buildings/Hospital_meta.db + Duplex_extracted.db (the worktree's buildings/, else ~/bim-ootb/buildings); missing -> INCONCLUSIVE (exit 2).
// usage: node viewer/tests/witness_code_named.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), V = path.join(ROOT, 'viewer');
const RR = require(path.join(V, 'rule_report.js')), SS = require(path.join(V, 'structural_sanity.js')), ES = require(path.join(V, 'egress_sanity.js'));
const initSqlJs = require(path.join(ROOT, 'tests', '_sqljs.js')).requireSqlJs();
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const SR = JSON.parse(fs.readFileSync(path.join(V, 'rates/structural_rules.json'), 'utf8')), ER = JSON.parse(fs.readFileSync(path.join(V, 'rates/egress_rules.json'), 'utf8'));
const dbOf = n => [path.join(ROOT, 'buildings', n), path.join(os.homedir(), 'bim-ootb', 'buildings', n)].find(p => fs.existsSync(p) && fs.statSync(p).size > 0);
(async () => {
  // ---- C1 (no DB needed) ----
  const rows = [].concat(SR.structural_rules, ER.egress_rules).filter(r => r.name), bad = [];
  const entries = r => r.basis && (r.basis.code || r.basis.kind) ? [r.basis] : Object.values(r.basis || {});
  rows.forEach(r => { if (!r.basis) { bad.push(r.name + ': no basis'); return; }
    entries(r).forEach(b => { if (!b.code) { if (!b.kind) bad.push(r.name + ': entry with neither code nor kind'); return; }
      const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(b.source || ''), clauseKey = (/(§[\d.]+|Table [\d.]+)/.exec(b.clause || '') || [])[1];
      if (!clauseKey) { bad.push(r.name + ': cited without a clause number'); return; }
      let text;
      if (m) { const L = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split('\n'); text = L.slice(Number(m[2]) - 1, Number(m[3] || m[2])).join('\n'); }
      else if (/egress_rules\.json \(_cite\)/.test(b.source || '')) text = ER.egress_rules.filter(x => x._cite).map(x => x._cite).join('\n');
      else { bad.push(r.name + ': source "' + b.source + '" not a file:line'); return; }
      if (text.indexOf(clauseKey) < 0) bad.push(r.name + ': "' + clauseKey + '" not at ' + b.source); }); });
  ok('C1 every rule row has a basis, and each cited clause is at the line its source names', bad.length === 0 && rows.length === 12 /* + load_path, §D100 2026-10-31 */, rows.length + ' rows; ' + (bad.join(' | ') || 'all found'));
  const H = dbOf('Hospital_meta.db'), D = dbOf('Duplex_extracted.db');
  if (!H || !D) { console.log('§VERDICT INCONCLUSIVE missing DB: Hospital_meta.db=' + !!H + ' Duplex_extracted.db=' + !!D); process.exit(2); }
  const SQL = await initSqlJs(), open = f => { const db = new SQL.Database(new Uint8Array(fs.readFileSync(f))); return (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; }; };
  const run = (q, sr, er) => { const cov = {}, log = () => {}; const rs = SS.evaluate(q, sr, { log, coverage: cov }), re = ES.evaluate(q, er, { log, coverage: cov }); return { rs, re, cov }; };
  const hq = open(H), dq = open(D), h = run(hq, SR, ER), d = run(dq, SR, ER);
  // ---- C2 ----
  const ch = RR.codesAndCoverage({ structural_rules: SR.structural_rules, egress_rules: ER.egress_rules }, h.cov, {}), cd = RR.codesAndCoverage({ structural_rules: SR.structural_rules, egress_rules: ER.egress_rules }, d.cov, {});
  const co = RR.codesAndCoverage({ egress_rules: ER.egress_rules }, h.cov, { overlay: { source: 'fetched', id: 't13test' } });
  ok('C2 the codes named are those of the rules that ran (Hospital: IBC 2021, not ACI; Duplex: IBC 2021), and a fetched overlay is named', ch.codes.join() === 'IBC 2021' && cd.codes.join() === 'IBC 2021' && h.cov.span_depth_concrete.state === 'nothing_to_judge' && co.overlay === 't13test',
    'Hospital=' + ch.codes.join('+') + ' Duplex=' + cd.codes.join('+') + ' overlay=' + co.overlay);
  // ---- C3 ----
  const erNoRow = { egress_rules: ER.egress_rules.filter(r => r.name !== 'door_occupant_capacity') }, h0 = run(hq, SR, erNoRow);
  const occ = x => x.re.filter(r => r.rule === 'door_occupant_capacity').length;
  const ov = RR.mergeRuleSets(ER, { egress_rules: [{ name: 'door_occupant_capacity', width_per_occupant_m: 1.0 }] }, { overlayId: 't13test' }), hOv = run(hq, SR, ov.rules || ov);
  ok('C3 the constants as a rule row change no finding (fallback = old constants), and an overlay now reaches them', JSON.stringify(h0.re) === JSON.stringify(h.re) && occ(hOv) > occ(h),
    'findings rule-row=' + h.re.length + ' fallback=' + h0.re.length + ' identical=' + (JSON.stringify(h0.re) === JSON.stringify(h.re)) + ' | door_occupant_capacity base=' + occ(h) + ' overlay(1.0 m/occ)=' + occ(hOv));
  // ---- C4 ----
  const sum = c => Object.values(c).reduce((a, x) => (a[x.state] = (a[x.state] || 0) + 1, a), {}), sh = sum(h.cov), sd = sum(d.cov);
  const emitted = new Set([].concat(h.rs, h.re).map(r => r.rule)), allCov = Object.keys(h.cov), missingCov = [...emitted].filter(r => allCov.indexOf(r) < 0);
  ok('C4 coverage covers every rule that can emit a finding; Duplex says nothing-to-judge for column_continuity and the two material span/depth rules',
    missingCov.length === 0 && ['column_continuity', 'span_depth_steel', 'span_depth_concrete'].every(k => d.cov[k] && d.cov[k].state === 'nothing_to_judge') && Object.keys(d.cov).length === Object.keys(h.cov).length,
    'Hospital ' + JSON.stringify(sh) + ' Duplex ' + JSON.stringify(sd) + ' rules=' + allCov.length + (missingCov.length ? ' MISSING ' + missingCov.join(',') : ''));
  // ---- C5 ----
  const typed = RR.mergeRuleSets(ER, { egress_rules: [{ name: 'circulation_distance', applies_to_types: ['Farming Shed'] }] }, { overlayId: 't13test' }), TR = typed.rules || typed;
  const base = run(hq, SR, TR), nCirc = base.re.filter(r => r.rule === 'circulation_distance').length;
  const covA = Object.assign({}, base.cov), rowsA = RR.applyTypes('egress_rules', TR, base.re, covA, null), covB = Object.assign({}, base.cov), rowsB = RR.applyTypes('egress_rules', TR, base.re, covB, 'Farming Shed');
  ok('C5 a rule typed for Farming Shed is not applicable when the type is not stated (findings dropped) and runs when it is', nCirc > 0 && covA.circulation_distance.state === 'not_applicable' && covA.circulation_distance.dropped === nCirc &&
    rowsA.filter(r => r.rule === 'circulation_distance').length === 0 && rowsB.length === base.re.length && covB.circulation_distance.state === 'ran',
    'circulation_distance findings=' + nCirc + ' | type none: ' + covA.circulation_distance.state + ' dropped=' + covA.circulation_distance.dropped + ' | type Farming Shed: ' + covB.circulation_distance.state + ' rows ' + rowsB.length + '/' + base.re.length);
  // ---- C6 ----
  global.RuleReport = RR; const RC = require(path.join(V, 'rule_checklist.js'));
  const cfg = { title: 'Structural Sanity', checkId: 'sanity', rows: h.rs, coverage: Object.fromEntries(Object.entries(h.cov).filter(([k]) => SR.structural_rules.some(r => r.name === k))), rulesUsed: SR, rulesOverlay: { source: 'none' }, buildingType: null, categories: [], colorMap: {} };
  const out = RC.buildRuleChecklistHtml(cfg, null), html = typeof out === 'string' ? out : (out && out.html) || '';
  const m6 = /class="rc-codes" data-codes="([^"]*)"[^>]*>([\s\S]*?)<\/div>/.exec(html), txt = m6 ? m6[2].replace(/<[^>]+>/g, ' ') : '';
  ok('C6 the panel header says the codes, overlay none, building type not stated, the coverage counts, and names the rule that judged nothing', !!m6 && m6[1] === '' && /Judged against: no cited code/.test(txt) && /overlay: none/.test(txt) && /building type: not stated/.test(txt) && /Rules 6: 5 ran · 1 nothing to judge · 0 not checkable · 0 not applicable/.test(txt) && /span_depth_concrete \(nothing to judge: no beams named Concrete\/RC\)/.test(txt),
    m6 ? txt.replace(/\s+/g, ' ').trim().slice(0, 300) : 'no rc-codes block');
  console.log('§VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' W-CODE-NAMED judged=' + judged + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
})();
