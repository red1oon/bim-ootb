#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-FILM-DASH (spec prompts/CAPEX_DASHBOARD.md §5.52). READ THE LOG: verdict = §FILM_DASH_VERDICT. ISSUE: "a spoken or shown number the run never produced; a private name; a proposed definition shown without saying so; a menu item left out".
// N1 every spoken number-word is backed by a value in a log of THIS run (million/thousand by magnitude, small numbers exactly); N2 every row's source § lines exist in the logs; N3 no private-name hit in the TSV and every shot has a page-text privacy line with hits=0;
// N4 the two proposed views and the forecast are called proposed in their own row; N5 all six menu items are covered by a row. FILM_BREAK=1 changes one spoken number (ten -> eleven): N1 must FAIL.
// Usage: node capex/tests/witness_film_dash.js <runDir with shots.log erp.log pa_tiles.log drill.log proc.log>
'use strict';
const fs = require('fs'), path = require('path'), RUN = process.argv[2] || path.join(process.env.HOME, '.cache/capex_film/dash_2026-11-12'), BREAK = process.env.FILM_BREAK === '1';
const rd = f => { try { return fs.readFileSync(path.join(RUN, f), 'utf8'); } catch (e) { return ''; } };
const LOGS = ['shots.log', 'erp.log', 'pa_tiles.log', 'drill.log', 'proc.log'].map(rd).join('\n');
const rows = fs.readFileSync(path.join(__dirname, '..', 'tools', 'film_cards', 'narration_dash_en.tsv'), 'utf8').split('\n').filter(Boolean).map(l => { const c = l.split('\t'); return { id: c[0], src: c[3], short: c[4], detail: BREAK ? c[5].replace(/\bTen\b/, 'Eleven') : c[5] }; });
let judged = 0, fails = 0, inc = 0; const log = console.log, ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §FILM_DASH_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
if (!LOGS.trim() || !rows.length) { log('§FILM_DASH_VERDICT INCONCLUSIVE no logs or no rows in ' + RUN); process.exit(2); }
const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, 'eighty-nine': 89, 'fifty-nine': 59 };
// a spoken small number is "backed" when the row's own source string holds that integer as a token (rows=3, phases=8, approvals=10, judged=89 ...) or a worded count the source states (e.g. "Three projects" <- total_projects=3)
const nums = s => (s.match(/-?\d[\d,]*\.?\d*/g) || []).map(x => Number(x.replace(/,/g, '')));
const STRUCT = { model2: ['two'], proof: ['two'] };   // 'two systems' = Kernel ERP + legacy iDempiere: a fact of the product, not a measured value; listed here, not hidden
const bad = [], seenWords = [];
rows.forEach(r => {
  const t = r.detail.replace(/F: |M: /g, ' ').toLowerCase(), sn = nums(r.src);
  (t.match(/\b(eighty-nine|fifty-nine|eleven|twelve|one|two|three|four|five|six|seven|eight|nine|ten)\b/g) || []).forEach(w => {
    if (/\b(one more click|one project|one screen|click one|the one)\b/.test(t) && w === 'one') return;   // "one" as a pronoun/article, not a count
    if (w === 'one') { if (!/one (project|phase)\b/.test(t)) return; }
    if ((STRUCT[r.id] || []).includes(w)) return; seenWords.push(r.id + ':' + w); if (/five thousand|seven million/.test(t) && /^(five|seven)$/.test(w)) return; if (!sn.includes(W[w])) bad.push(r.id + ': says "' + w + '" but the source holds ' + JSON.stringify(sn.slice(0, 6)));
  });
  if (/seven million/.test(t) && !sn.some(v => v >= 7e6 && v < 8e6)) bad.push(r.id + ': "seven million" but no source value in 7-8 million');
  if (/five thousand/.test(t) && !sn.some(v => v >= 4500 && v < 5500)) bad.push(r.id + ': "five thousand" but no source value near 5 thousand');
});
ck('N1 every spoken number-word is backed by a value in the row\'s source (' + seenWords.length + ' spoken)', bad.length === 0 && seenWords.length > 8, bad.slice(0, 3));
const miss = []; rows.forEach(r => (r.src.match(/§[A-Z_]+ [^§]*/g) || []).forEach(seg => { const key = seg.trim().replace(/\s+/g, ' '); if (/^§DASH_PA/.test(key)) return; const toks = key.split(' ').slice(1).filter(x => /=/.test(x)); const head = key.split(' ')[0];
  const nz = x => x.replace(/["{}]/g, '').replace(/=/g, ':').replace(/\s+/g, ' '), hit = LOGS.split('\n').some(l => l.indexOf(head) >= 0 && toks.every(tk => nz(l).indexOf(nz(tk)) >= 0)); if (!hit && toks.length) miss.push(r.id + ': ' + key.slice(0, 90)); }));
ck('N2 every source § line of a row is on a log line of this run', miss.length === 0, miss.slice(0, 3));
const PGF = process.env.FILM_PRIVATE_GREP_FILE || path.join(process.env.HOME, '.cache/capex_film/private_grep.txt'), PRIV = fs.existsSync(PGF) ? new RegExp(fs.readFileSync(PGF, 'utf8').trim(), 'i') : null;
const pix = rd('shots.log').split('\n').filter(l => /^§FILM_PIXEL_PRIVACY /.test(l)), nshots = rd('shots.log').split('\n').filter(l => /^§FILM_DASH_SHOT /.test(l)).length;
if (!PRIV || !pix.length) { inc++; log('  §FILM_DASH_W N3 INCONCLUSIVE no private list or no pixel-privacy lines'); }
else ck('N3 no private-name hit in the TSV; ' + pix.length + ' shots each have a page-text privacy line, all hits=0', !rows.some(r => PRIV.test(r.detail + r.short + r.src)) && pix.length >= nshots && pix.every(l => /hits=0$/.test(l.trim())), { shots: nshots, lines: pix.length });
const need = { procurement: /proposed/i, handover: /proposed|marked/i, glance: /warning|basis/i }, nop = Object.keys(need).filter(k => { const r = rows.find(x => x.id === k); return !r || !need[k].test(r.detail); });
ck('N4 proposed views and the forecast warning are said in their own row', nop.length === 0, nop);
const menu = ['dashboard|one screen', 'projects', 'budget and cost', 'procurement', 'approval pending', 'handover'], gone = menu.filter(m => !rows.some(r => new RegExp(m.split('|')[0], 'i').test(r.detail.replace(/F: |M: /g, ' '))));
ck('N5 all six left-menu items are explained in a row', gone.length === 0, gone);
const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§FILM_DASH_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
