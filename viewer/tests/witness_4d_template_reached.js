#!/usr/bin/env node
// WITNESS — §TPL_REACHED: the PRODUCTION call sites reach 4D_template.json's instantiator.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §19 (blueprint verdict).
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   REACHABILITY of the template path from the live call sites — nothing else. It says nothing
//   about whether the emitted grid is correct; witness_4d_template_instantiation.js owns that.
//
// ISSUE THIS PROVES OR DISPROVES — 4D_BAR_MODEL.md line 693, recorded and never acted on:
//   "No witness exercises the LIVE call sites. Every schedule witness calls materializeZones..."
// Every existing template witness PASSES `template: T` ITSELF. They construct an invocation the
// shipped code never makes, so the whole template path can be green and dead at the same time.
// §13.1 read that same fact ("no call site has ever passed opts.template") and concluded DELETE —
// the evidence was right and the conclusion inverted. This witness states it as a gate instead:
// if production does not reach the instantiator, the model is not running, and that is RED.
//
// TWO HALVES, because a keyword check alone can be satisfied without the path executing:
//   A (static)      every production materializeZones(...) call passes `template:`.
//   B (behavioural) replaying a production opts shape against a real DB actually emits §TPL_*,
//                   i.e. instantiateTemplate() ran.
//
// Command: node viewer/tests/witness_4d_template_reached.js [Building ...]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HOME = require('os').homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));

const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));

const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2) : ['Duplex'];
const START = '2026-01-01';

// The PRODUCTION consumers. Test files are deliberately excluded: they are exactly the population
// that already passes `template:`, and counting them is how this gap stayed invisible.
const PROD_FILES = ['time_machine.js', 'schedule_author_ui.js'];

// Extract every materializeZones(...) call and its opts text by brace-matching from the call's
// open paren — robust to line breaks and nested objects, unlike a per-line regex.
function prodCallSites() {
  const out = [];
  for (const f of PROD_FILES) {
    const p = path.join(VIEWER_DIR, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const re = /materializeZones\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      // Skip a match inside a line comment — those are prose, not call sites.
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      if (/^\s*(\/\/|\*)/.test(src.slice(lineStart, m.index))) continue;
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) break; }
      }
      const argText = src.slice(m.index, i + 1);
      out.push({
        file: f,
        line: src.slice(0, m.index).split('\n').length,
        passesTemplate: /(^|[^A-Za-z_$])template\s*:/.test(argText)
      });
    }
  }
  return out;
}

// The EXECUTED rates table, whole-file (slicing drops SEQUENCE_NAME_OVERRIDES/SHIFT_HOURS).
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const sites = prodCallSites();
  sites.forEach(s => console.log('§TPL_REACHED_SITE ' + s.file + ':' + s.line +
    ' passesTemplate=' + s.passesTemplate));

  // ── HALF B: replay a production opts shape verbatim (time_machine.js:6858/6900 minus the
  // browser-only handles) and see whether the instantiator actually runs. §TPL_*/§AUTHOR_TPL on
  // stdout is instantiateTemplate's own evidence that it executed.
  const behavioural = [];
  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§TPL_REACHED_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    const logs = [];
    console.log = (...a) => { logs.push(a.join(' ')); };
    console.warn = () => {};
    let ok = false;
    try {
      // VERBATIM the production opts keys, INCLUDING `template:` — since §TPL_WIRED (2026-08-26)
      // every production call site loads viewer/rates/4D_template.json and passes it. Replaying
      // the shape without it would prove nothing about what ships.
      const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));
      ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, {
        start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
        scheduleGate: ScheduleGate, shiftHours: (R.SHIFT_HOURS > 0 ? R.SHIFT_HOURS : 24),
        genVersion: 1, template: T
      });
      ok = true;
    } catch (e) { logs.push('§TPL_REACHED_THREW ' + e.message); }
    console.log = _l; console.warn = _w;
    const emitted = logs.some(l => l.indexOf('§TPL_') === 0 || l.indexOf('§AUTHOR_TPL') === 0);
    behavioural.push({ file: bld, line: 0, passesTemplate: emitted });
    console.log('§TPL_REACHED_REPLAY ' + bld + ' ranWithoutThrow=' + ok +
      ' instantiateTemplateRan=' + emitted +
      ' (the SHIPPED opts shape, template included — §TPL_WIRED)');
    db.close();
  }

  const rows = sites.concat(behavioural);

  Witness('4d_template_reached')
    .population(() => rows)
    .schema({
      type: 'object',
      required: ['file', 'line', 'passesTemplate'],
      properties: {
        file: { type: 'string', minLength: 1 },
        line: { type: 'integer', minimum: 0 },
        passesTemplate: { type: 'boolean' }
      }
    })
    // A — the static gate. Every production call site must hand over the template.
    .invariant('every-production-call-site-passes-template',
      rs => rs.filter(r => r.line > 0).every(r => r.passesTemplate === true))
    // B — the behavioural gate. The shipped opts shape must actually reach the instantiator.
    .invariant('production-opts-shape-reaches-instantiateTemplate',
      rs => rs.filter(r => r.line === 0).every(r => r.passesTemplate === true))
    // Guard against the gap that let this hide: if no production site is found at all, the
    // extractor has rotted and a vacuous `every()` would read as PASS.
    .invariant('production-call-sites-were-actually-found',
      rs => rs.filter(r => r.line > 0).length >= 3)
    .redControl(rs => rs.map(r => Object.assign({}, r, { passesTemplate: !r.passesTemplate })))
    .run();
})();
