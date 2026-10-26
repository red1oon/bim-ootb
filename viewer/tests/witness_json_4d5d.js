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
const now = trip(editor(fs.readFileSync(path.join(V, 'settings_editor.js'), 'utf8'))), main = trip(editor(cp.execFileSync('git', ['-C', ROOT, 'show', 'origin/main:viewer/settings_editor.js'], { encoding: 'utf8' })));
ok('J1 every reference JSON survives the editor with identical values (falsifier: main\'s editor)', now.length === 0 && main.length > 0, 'files=' + files.length + ' differ now=' + now.length + ' main=' + main.length + ' [' + main.join(' ') + ']');
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
  console.log('§W-JSON-4D5D ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
})();
