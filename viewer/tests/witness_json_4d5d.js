#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-JSON-4D5D (docs/BIMUserGuide.md "Your own 4D / 5D references"). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a user could pull the 4D / 5D reference JSONs out but not make the Viewer use their own edit (no hub entry for the rate
// pack, the 4D template or the sequence rules; the rate loader read no user copy), and the hub's editor turned a list of objects inside an object into the
// text "[object Object]" (measured 2026-10-27: 4D_template.json dependencies.within_level, 4D_template_civil.json, road_rules.json), so one save would have
// broken the 4D template.
//   J1 every viewer/rates/*.json the hub can open comes back from the editor (jsonToSchema -> schemaToJson) with identical values; main's editor is the falsifier.
//   J2 the keys the hub saves under are the keys the loaders read (5D json_rates_<pack> in rates.js, json_4d_template in tm_sched_xray.js, json_sequence_rules in rates.js).
//   J3 a saved rate-pack copy is applied to ITS pack only (cidb2024_my changed, bcis2024_uk untouched by cidb's copy), and an unreadable copy leaves the shipped pack.
// usage: node viewer/tests/witness_json_4d5d.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), cp = require('child_process');
const V = path.join(__dirname, '..'), D = path.join(V, 'rates'), ROOT = path.join(V, '..');
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
const editor = src => { const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} }, document: { createElement: () => ({ style: {} }) } }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window.SettingsEditor; };
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
const files = fs.readdirSync(D).filter(f => /\.json$/.test(f) && f !== 'ifc_schema_hierarchy.json');   // the schema hierarchy is not a reference a user edits
const trip = SE => files.filter(f => { const raw = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); try { return JSON.stringify(canon(SE.schemaToJson(SE.jsonToSchema(JSON.parse(JSON.stringify(raw)))))) !== JSON.stringify(canon(raw)); } catch (e) { return true; } });
// the falsifier must be a real editor: a missing file must stop the witness, not count every file as 'differs'
const now = trip(editor(fs.readFileSync(path.join(V, 'settings_editor.js'), 'utf8'))), mainSrc = cp.execFileSync('git', ['-C', ROOT, 'show', '159d65065745:viewer/settings_editor.js'], { encoding: 'utf8' });
if (!/function jsonToSchema/.test(mainSrc)) { console.log('MISSING input: the pre-fix editor (159d65065745:viewer/settings_editor.js)'); process.exit(2); }
const main = trip(editor(mainSrc));
ok('J1 every reference JSON survives the editor with identical values (falsifier: the editor before the nested-value fix, 159d65065)', now.length === 0 && main.length > 0, 'files=' + files.length + ' differ now=' + now.length + ' before-fix=' + main.length + ' [' + main.join(' ') + ']');
const panels = fs.readFileSync(path.join(V, 'panels.js'), 'utf8'), rates = fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), xray = fs.readFileSync(path.join(V, 'tm_sched_xray.js'), 'utf8');
const keys = { rates: /storageKey\(\) \{ return 'json_rates_' \+ _activePack\(\); \}/.test(panels) && /localStorage\.getItem\('json_rates_' \+ templateName\)/.test(rates),
  tpl4d: /storageKey: 'json_4d_template'/.test(panels) && /loadJsonWithOverrides\(url, 'json_4d_template'\)/.test(xray),
  seq: /storageKey: 'json_sequence_rules'/.test(panels) && /localStorage\.getItem\('json_sequence_rules'\)/.test(rates) };
ok('J2 the hub saves where the loaders read', keys.rates && keys.tpl4d && keys.seq, JSON.stringify(keys));
const runPack = async (name, store) => { const ctx = { console: { log: () => {}, warn: m => { ctx.warned = m; } }, localStorage: { getItem: k => (k in store ? store[k] : null) }, URLSearchParams, window: {} };
  ctx.fetch = u => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(V, u), 'utf8'))) }); vm.createContext(ctx); vm.runInContext(rates, ctx);
  await vm.runInContext('loadRateTemplate(' + JSON.stringify(name) + ')', ctx); return { duct: vm.runInContext('RATES.IfcDuct && RATES.IfcDuct.rate', ctx), warned: ctx.warned || '' }; };
(async () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(D, 'cidb2024_my.json'), 'utf8')).materials.IfcDuct.rate, uk = JSON.parse(fs.readFileSync(path.join(D, 'bcis2024_uk.json'), 'utf8')).materials.IfcDuct.rate;
  const copy = JSON.stringify({ materials: { IfcDuct: { rate: 999 } } }), a = await runPack('cidb2024_my', { json_rates_cidb2024_my: copy }), b = await runPack('bcis2024_uk', { json_rates_cidb2024_my: copy }), c = await runPack('cidb2024_my', { json_rates_cidb2024_my: '{not json' });
  ok('J3 a saved pack copy applies to its own pack only; an unreadable copy leaves the shipped pack', a.duct === 999 && b.duct === uk && c.duct === shipped && /applied=0/.test(c.warned),
    'cidb IfcDuct ' + shipped + ' -> ' + a.duct + ' | bcis with cidb\'s copy ' + b.duct + ' (shipped ' + uk + ') | unreadable copy ' + c.duct + ' "' + c.warned.slice(0, 60) + '"');
  // J4 a pack merges into the 4D tables field by field and its stale sequence copy is not applied: with the default pack the Viewer's 4D tables equal the built-in ones
  const tables = async (name) => { const ctx = { console: { log: () => {}, warn: () => {} }, localStorage: { getItem: () => null }, URLSearchParams, window: {} };
    ctx.fetch = u => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(V, u), 'utf8'))) }); vm.createContext(ctx); vm.runInContext(rates, ctx);
    const before = vm.runInContext('JSON.stringify({ L: LABOR_RATES, S: SEQUENCE_RULES })', ctx); if (name) await vm.runInContext('loadRateTemplate(' + JSON.stringify(name) + ')', ctx);
    return { before: JSON.parse(before), after: vm.runInContext('({ L: LABOR_RATES, S: SEQUENCE_RULES, hvac: LABOR_RATES.HVAC_TECH })', ctx) }; };
  const my = await tables('cidb2024_my'), ukT = await tables('bcis2024_uk'), canonS = o => JSON.stringify(canon(JSON.parse(JSON.stringify(o))));
  ok('J4 a pack merges field by field (crew limits kept, its wages applied) and does not overwrite the trade order; the default pack leaves the 4D tables as built in',
    canonS(my.after.L) === canonS(my.before.L) && canonS(my.after.S) === canonS(my.before.S) && canonS(ukT.after.S) === canonS(ukT.before.S) && ukT.after.hvac.max_crews === ukT.before.L.HVAC_TECH.max_crews && ukT.after.hvac.rate_per_day === 280,
    'cidb labour same=' + (canonS(my.after.L) === canonS(my.before.L)) + ' sequence same=' + (canonS(my.after.S) === canonS(my.before.S)) + ' | bcis sequence same=' + (canonS(ukT.after.S) === canonS(ukT.before.S)) + ' HVAC max_crews ' + ukT.before.L.HVAC_TECH.max_crews + '->' + ukT.after.hvac.max_crews + ' rate_per_day ' + ukT.before.L.HVAC_TECH.rate_per_day + '->' + ukT.after.hvac.rate_per_day);
  // J5 one load per page: initRateTemplate returns the same promise every call (the Viewer starts it at load; the dashboard's own call reuses it)
  const ctx5 = { console: { log: () => {}, warn: () => {} }, localStorage: { getItem: () => null }, URLSearchParams, window: { location: { search: '' } }, location: { search: '' } };
  ctx5.fetch = u => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(V, u), 'utf8'))) }); vm.createContext(ctx5); vm.runInContext(rates, ctx5);
  const same = vm.runInContext('initRateTemplate() === initRateTemplate()', ctx5);
  ok('J5 initRateTemplate is one load per page (the same promise each call)', same === true, 'same=' + same);
  console.log('§W-JSON-4D5D ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
})();
