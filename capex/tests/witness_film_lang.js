#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-FILM-LANG (spec prompts/CAPEX_DASHBOARD.md §5.63). READ THE LOG: verdict = §FILM_LANG_VERDICT.
// ISSUE it proves/disproves: "a translated narration row drops a fact, changes a number, loses a turn or the 'proposed' wording, or carries a typed digit the voice would read differently". The Chinese table must keep, row by row:
// L1 the same ids in the same order · L2 the SAME source column (every number still traces to the same log line) · L3 the same turn structure (F:/M: turns) · L4 the same spoken numbers (EN number words and ZH numerals parsed to values; 1 is ignored
// on both sides, "one"/一 is an article as often as a count) · L5 no Arabic digit in a voiced line (the TTS would read it its own way) · L6 'proposed' kept in the rows that say it (拟议). FILMLANG_BREAK=1 changes one ZH numeral: L4 must FAIL.
// Usage: node capex/tests/witness_film_lang.js [zh]
'use strict';
const fs = require('fs'), path = require('path'), log = console.log, LANG = process.argv[2] || 'zh', BREAK = process.env.FILMLANG_BREAK === '1', D = path.join(__dirname, '..', 'tools', 'film_cards');
const rd = f => fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
const en = rd('narration_dash_en.tsv'), tr = rd('narration_dash_' + LANG + '.tsv');
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §FILM_LANG ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const W = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, 'twenty-four': 24 };
const enNums = s => { const t = s.toLowerCase(), out = []; (t.match(/\b(?:twenty-four|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two)(?: thousand)?\b/g) || []).forEach(m => { const [w, u] = m.split(' '); out.push(W[w] * (u ? 1000 : 1)); }); return out.sort((a, b) => a - b); };
const D1 = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }, U = { 十: 10, 百: 100, 千: 1000 };
function zhVal(tok) { let total = 0, sec = 0, cur = 0; for (const ch of tok) { if (ch in D1) cur = D1[ch]; else if (ch in U) { sec += (cur || (ch === '十' ? 1 : 0)) * U[ch]; cur = 0; } else if (ch === '万') { total += (sec + cur) * 10000; sec = 0; cur = 0; } } return total + sec + cur; }
const zhNums = s => (s.match(/[〇零一二两三四五六七八九十百千万]+/g) || []).filter(m => !/^[一二两三四五六七八九]个?(路|起|下|样|直|切|点|些|定)/.test(m)).map(zhVal).filter(v => v !== 1 && v > 0).sort((a, b) => a - b);
ck('L1 same ids in the same order (' + en.length + ' rows)', en.length === tr.length && en.every((r, i) => r[0] === tr[i][0]), { en: en.map(r => r[0]).join(','), tr: tr.map(r => r[0]).join(',') });
ck('L2 the source column of every row is identical', en.every((r, i) => tr[i] && r[3] === tr[i][3]));
const turns = s => (s.match(/(?:^|\| )[FM]: /g) || []).map(x => x.trim().replace(/^\| /, '')).join('');
const bad3 = en.filter((r, i) => !tr[i] || turns(r[4]) !== turns(tr[i][4]) || turns(r[5]) !== turns(tr[i][5])).map(r => r[0]);
ck('L3 the same F:/M: turn structure in SHORT and DETAIL', bad3.length === 0, bad3);
const bad4 = []; let nSpoken = 0; en.forEach((r, i) => { if (!tr[i]) return; const a = enNums(r[5]), txt = (BREAK && r[0] === 'glance') ? tr[i][5].replace('四千', '五千') : tr[i][5], b = zhNums(txt); nSpoken += a.length; if (JSON.stringify(a) !== JSON.stringify(b)) bad4.push(r[0] + ' en=' + a + ' ' + LANG + '=' + b); });
ck('L4 the spoken numbers of every row are the same values (' + nSpoken + ' numbers in ' + en.length + ' rows)', nSpoken > 15 && bad4.length === 0, bad4.slice(0, 3));
const dig = tr.filter(r => /\d/.test(r[4] + r[5])).map(r => r[0]); ck('L5 no Arabic digit in a voiced line', dig.length === 0, dig);
const need = ['forecast', 'procurement', 'handover'], miss = need.filter(id => { const r = tr.find(x => x[0] === id); return !r || !/拟议/.test(r[5]); }); ck('L6 "proposed" (拟议) is kept in the forecast, procurement and handover rows', miss.length === 0, miss);
const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; log('§FILM_LANG_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
