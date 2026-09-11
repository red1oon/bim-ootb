#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T3 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/rule_checklist.js's pure `_buildRuleChecklistHtml` (exported as
 * `buildRuleChecklistHtml`) — the GENERIC rule-checklist panel HTML-string builder — with a
 * node-level render of the HTML string, no live browser (per T3: "no live browser needed for
 * this part"). Rows are hand-built in the same shape StructuralSanity.evaluate() returns
 * ({guid, ifc_class, name, storey, rule, severity, ratio}), matching
 * tests/test_structural_sanity_rules.js's fixture conventions.
 * RUN: node tests/test_rule_checklist_panel.js
 */
'use strict';
const RC = require('../viewer/rule_checklist.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const colorMap = { CRITICAL: '#cc4444', WARNING: '#ffaa33', OPTIMIZED: '#44cc44' };
const categories = [
  { label: 'Floating Member', ruleNames: ['floating_member'] },
  { label: 'Span-Depth', ruleNames: ['span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'] },
  { label: 'Column Continuity', ruleNames: ['column_continuity'] }
];

const rows = [
  { guid: 'beam-floating', ifc_class: 'IfcBeam', name: 'UB-Floating', storey: 'Roof', rule: 'floating_member', severity: 'CRITICAL', ratio: null },
  { guid: 'beam-warn-1', ifc_class: 'IfcBeam', name: 'UB-Warn1', storey: 'L1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 26.4 },
  { guid: 'beam-warn-2', ifc_class: 'IfcBeam', name: 'UB-Warn2', storey: 'L2', rule: 'span_depth_cantilever', severity: 'WARNING', ratio: 13.1 },
  { guid: 'col-unsupported', ifc_class: 'IfcColumn', name: 'C-Unsupported', storey: 'Roof', rule: 'column_continuity', severity: 'CRITICAL', ratio: null }
];

const config = { title: 'Structural Sanity', checkId: 'sanity', colorMap: colorMap, categories: categories, rows: rows };

console.log('§W-RULE-CHECKLIST All view');
const allResult = RC.buildRuleChecklistHtml(config, null);
const html = allResult.html;

// (a) row count in "All" view's HTML matches input row count
const guidAttrCount = (html.match(/data-rc-guid="/g) || []).length;
chk('(a) All view row count matches input row count', guidAttrCount === rows.length, 'found=' + guidAttrCount + ' expected=' + rows.length);
chk('(a) counts object sums to input row count', (allResult.counts.CRITICAL + allResult.counts.WARNING + allResult.counts.OPTIMIZED) === rows.length,
  JSON.stringify(allResult.counts));
chk('(a) counts.CRITICAL === 2, counts.WARNING === 2', allResult.counts.CRITICAL === 2 && allResult.counts.WARNING === 2, JSON.stringify(allResult.counts));

// (b) severity grouping puts a CRITICAL-severity row's markup before a WARNING one
const critIdx = html.indexOf('data-rc-guid="beam-floating"');
const warnIdx = html.indexOf('data-rc-guid="beam-warn-1"');
chk('(b) CRITICAL row markup precedes WARNING row markup', critIdx >= 0 && warnIdx >= 0 && critIdx < warnIdx,
  'critIdx=' + critIdx + ' warnIdx=' + warnIdx);

// (c) filtering by a category only includes rows whose rule is in that category's ruleNames
console.log('§W-RULE-CHECKLIST category filter: Span-Depth');
const spanResult = RC.buildRuleChecklistHtml(config, 'Span-Depth');
const spanHtml = spanResult.html;
chk('(c) Span-Depth filter includes beam-warn-1 (span_depth_steel)', spanHtml.indexOf('data-rc-guid="beam-warn-1"') >= 0);
chk('(c) Span-Depth filter includes beam-warn-2 (span_depth_cantilever)', spanHtml.indexOf('data-rc-guid="beam-warn-2"') >= 0);
chk('(c) Span-Depth filter EXCLUDES beam-floating (floating_member)', spanHtml.indexOf('data-rc-guid="beam-floating"') === -1);
chk('(c) Span-Depth filter EXCLUDES col-unsupported (column_continuity)', spanHtml.indexOf('data-rc-guid="col-unsupported"') === -1);
const spanGuidCount = (spanHtml.match(/data-rc-guid="/g) || []).length;
chk('(c) Span-Depth filter row count === 2', spanGuidCount === 2, 'found=' + spanGuidCount);

console.log('§W-RULE-CHECKLIST category filter: Floating Member');
const fmResult = RC.buildRuleChecklistHtml(config, 'Floating Member');
const fmGuidCount = (fmResult.html.match(/data-rc-guid="/g) || []).length;
chk('Floating Member filter row count === 1', fmGuidCount === 1, 'found=' + fmGuidCount);
chk('Floating Member filter includes only beam-floating', fmResult.html.indexOf('data-rc-guid="beam-floating"') >= 0 &&
  fmResult.html.indexOf('data-rc-guid="beam-warn-1"') === -1 && fmResult.html.indexOf('data-rc-guid="col-unsupported"') === -1);

// Extra structural checks — toggle buttons rendered, click/zoom wiring present, empty state.
chk('renders one toggle button per category + All', (html.match(/class="rc-toggle-btn"/g) || []).length === categories.length + 1,
  'found=' + ((html.match(/class="rc-toggle-btn"/g) || []).length));
chk('row onclick wires APP.zoomToGuid', html.indexOf("onclick=\"APP.zoomToGuid('beam-floating')\"") >= 0);
chk('data-rc-rule carries the rule name for delegated long-press', html.indexOf('data-rc-rule="floating_member"') >= 0);
chk('OPTIMIZED group collapsed by default when present', (() => {
  const optRows = [{ guid: 'opt-1', ifc_class: 'IfcBeam', name: 'OK', storey: 'L1', rule: 'span_depth_steel', severity: 'OPTIMIZED', ratio: 2 }];
  const r = RC.buildRuleChecklistHtml({ title: 't', checkId: 'sanity', colorMap: colorMap, categories: categories, rows: optRows }, null);
  const groupStart = r.html.indexOf('OPTIMIZED (1)');
  const bodyDisplay = r.html.slice(groupStart, groupStart + 400).match(/rc-group-body" style="display:(\w+)/);
  return bodyDisplay && bodyDisplay[1] === 'none';
})());
chk('empty rows renders "No flags." with zero data-rc-guid rows', (() => {
  const r = RC.buildRuleChecklistHtml({ title: 't', checkId: 'sanity', colorMap: colorMap, categories: categories, rows: [] }, null);
  return r.html.indexOf('No flags.') >= 0 && (r.html.match(/data-rc-guid="/g) || []).length === 0;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
