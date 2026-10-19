#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PACK (prompts/DXF2BIM_FOUNDATION_LANE.md §4). Issue it proves or disproves: a compliance rule in a pack says what its cited clause says. A transcription slip, a number nobody can find in the quote, or a rule with no source must FAIL here, mechanically, before any finding can rest on it.
// P1 every pack validates against standards/schema; P2 every verified_text row has a verbatim quote and EVERY quote_token occurs in that quote; P3 ids are unique and carry the pack's jurisdiction; only verified_text rows carry a machine `check`; P4 every number in a check traces to a number in the row's tokens (digits, a number word, a percent, or a stated derivation); P5 the Bangladesh skeleton has no rule yet (no check, no verified_text) until the code text is obtained; P6 CONTROL: a row with a number that is not in its quote, and a row with a check but no source, are both REJECTED by the same checker.
// usage: node modeller/tests/witness_standards_pack.js
'use strict';
const PY = require('./pyenv.js'), fs = require('fs'), path = require('path'), cp = require('child_process'), S = path.join(__dirname, '..', '..', 'standards');
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + ' ' + (m || '')); if (!c) fails++; };
const norm = t => String(t).toLowerCase().replace(/\s+/g, ' ').trim(), W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numsOf = tokens => { const out = new Set(); (tokens || []).forEach(t => { (String(t).match(/\d+(?:\.\d+)?/g) || []).forEach(n => { out.add(Number(n)); if (/percent/i.test(t)) out.add(Number(n) / 100); }); String(t).toLowerCase().split(/[^a-z]+/).forEach(w => { if (W[w]) out.add(W[w]); }); }); return out; };
const flat = v => Array.isArray(v) ? v.flatMap(flat) : (v && typeof v === 'object') ? Object.values(v).flatMap(flat) : [v];
function checkRow(row) {   // -> list of problems
  const p = []; const q = row.quote ? norm(row.quote) : '';
  if (row.check && row.status !== 'verified_text') p.push('has a check but status is ' + row.status);
  if (row.status === 'verified_text') {
    if (!row.quote) p.push('no quote'); if (!row.locator || /not found/i.test(row.locator)) p.push('no locator'); if (!row.quote_tokens || !row.quote_tokens.length) p.push('no quote_tokens');
    (row.quote_tokens || []).forEach(t => { if (!q.includes(norm(t))) p.push('token not in quote: ' + t); });
    if (row.check && !row.check.derived_from) { const have = numsOf(row.quote_tokens); flat([row.check.value, row.check.also && row.check.also.value]).filter(v => typeof v === 'number').forEach(v => { if (![...have].some(h => Math.abs(h - v) < 1e-9)) p.push('check number ' + v + ' not traceable to the tokens'); }); }
    if (!row.check) p.push('verified_text row without a machine check');
  }
  return p;
}
const files = []; fs.readdirSync(S).filter(d => fs.statSync(path.join(S, d)).isDirectory() && d !== 'schema').forEach(d => fs.readdirSync(path.join(S, d)).filter(f => f.endsWith('.json')).forEach(f => files.push(path.join(S, d, f))));
const packs = files.map(f => ({ f, j: JSON.parse(fs.readFileSync(f, 'utf8')) }));
const sv = packs.map(({ f }) => { const r = cp.spawnSync(PY, [path.join(__dirname, 'json_validate.py'), path.join(S, 'schema', 'dxf2bim-standard-pack.schema.json'), f], { encoding: 'utf8' }); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { error: 'no output ' + (r.stderr || '').slice(0, 100) }; } });
if (sv.some(v => v.error && /jsonschema missing/.test(v.error))) console.log('§SKIP P1 jsonschema missing'); else ok('P1 ' + packs.length + ' packs validate against the schema', sv.every(v => v.n === 0), JSON.stringify(sv.map(v => v.error || v.n)));
const probs = packs.flatMap(({ j }) => j.rows.map(r => ({ id: r.id, p: checkRow(r) })).filter(x => x.p.length));
ok('P2 every verified_text row: verbatim quote present, every token occurs in it, every check number traces to its tokens (' + packs.reduce((a, { j }) => a + j.rows.filter(r => r.status === 'verified_text').length, 0) + ' rows)', probs.length === 0, JSON.stringify(probs.slice(0, 4)));
const ids = packs.flatMap(({ j }) => j.rows.map(r => r.id)); ok('P3 ids unique, each starts with its pack\'s jurisdiction, no check on a pointer / unverified row', new Set(ids).size === ids.length && packs.every(({ j }) => j.rows.every(r => r.id.startsWith(j.jurisdiction + '.') && (!r.check || r.status === 'verified_text'))), ids.length + ' rows');
const bd = packs.filter(({ j }) => j.jurisdiction === 'BD'); ok('P5 Bangladesh skeleton: no rule yet (no check, no verified_text) until the code text is obtained', bd.length > 0 && bd.every(({ j }) => j.rows.every(r => !r.check && r.status !== 'verified_text')), bd.map(({ j }) => j.rows.length + ' rows').join());
const base = packs.find(({ j }) => j.jurisdiction === 'MY').j.rows.find(r => r.status === 'verified_text'), bad1 = Object.assign({}, base, { quote_tokens: base.quote_tokens.concat(['12 percent']) }), bad2 = Object.assign({}, base, { status: 'unverified' }), bad3 = Object.assign({}, base, { check: Object.assign({}, base.check, { value: 0.37 }) });
ok('P6 control: a number missing from the quote, a check on an unverified row, and a check number with no source are all REJECTED', checkRow(bad1).length > 0 && checkRow(bad2).length > 0 && checkRow(bad3).length > 0 && checkRow(base).length === 0, [checkRow(bad1)[0], checkRow(bad2)[0], checkRow(bad3)[0]].join(' | '));
console.log('§W-PACK ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
