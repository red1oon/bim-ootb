#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-TERMS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.3 step 3 (the Test Harness button). READ THE LOG after every run — the exit code is not evidence.
//   Node only: the pure model (erp/team_terms.js model/html) over the SHIPPED record erp/team_terms.json and over DOCTORED copies. Each arm names the issue it proves or disproves.
//   T1 the shipped record shows open terms first and never green.  T2 an OPEN row flipped to ENFORCED with no witness is not green.  T3 an ENFORCED row with a missing control is not green and fails the verdict.
//   T4 an empty / wrong-schema record is INCONCLUSIVE.  T5 the rendered HTML lists OPEN rows before any ENFORCED row and carries no green on an open row.  T6 wiring: the page loads the script, the service worker precaches both files.
//   NOT judged here: the click in a real browser (no Playwright in this arm) — a gap, stated.
'use strict';
var fs = require('fs'), path = require('path'), E = path.join(__dirname, '..'), TT = require(path.join(E, 'team_terms.js'));
var judged = 0, fails = 0, mut = 0, killed = 0;
function ck(id, issue, ok, d) { judged++; if (!ok) fails++; console.log('§TT ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + issue + (d ? ' :: ' + d : '')); }
function kill(id, ok, d) { mut++; if (ok) killed++; console.log('§TT-MUTANT ' + id + ' ' + (ok ? 'KILLED' : 'SURVIVED') + (d ? ' :: ' + d : '')); }
var shipped = JSON.parse(fs.readFileSync(path.join(E, 'team_terms.json'), 'utf8')), rec = shipped;
// 2026-10-31 (13 enforced / 0 open, bim-ootb #2486): the shipped record may hold NO open row. The open-row arms (T1b T2 T5a T5b) would then judge nothing, so they judge a copy with ONE synthetic
// OPEN row (an enforced row cloned, status OPEN, no witness) — the rule "open is listed first and never green" is still judged on a real population; the shipped open count is printed.
var shippedOpen = (shipped.rows || []).filter(function (r) { return r.status === 'OPEN'; }).length;
if (!shippedOpen && shipped.rows && shipped.rows.length) { rec = JSON.parse(JSON.stringify(shipped)); var syn = JSON.parse(JSON.stringify(rec.rows[0])); syn.id = 'synthetic-open'; syn.status = 'OPEN'; syn.witnesses = []; syn.controls = []; syn.roadmap = 'synthetic (witness only)'; rec.rows.push(syn); }
console.log('§TT shipped record: rows=' + (shipped.rows || []).length + ' open=' + shippedOpen + (rec !== shipped ? ' -> open-row arms judge a copy with 1 synthetic OPEN row' : ''));
var m = TT.model(rec);
var open = m.rows.filter(function (r) { return r.status === 'OPEN'; }), enf = m.rows.filter(function (r) { return r.colour === 'green'; });
ck('T1a', 'the record is terms-v1 with rows (else everything below is vacuous)', shipped.schema === 'terms-v1' && shipped.rows.length >= 9, 'rows=' + shipped.rows.length);
ck('T1b', 'open terms are listed first and none is green', open.length >= 1 && m.rows.slice(0, open.length).every(function (r) { return r.status === 'OPEN' && r.colour === 'amber'; }), 'open=' + open.length + ' first=' + m.rows.slice(0, open.length).map(function (r) { return r.id; }).join(','));
ck('T1c', 'every green row has a passing witness and every control found', enf.length >= 1 && enf.every(function (r) { return r.witnesses.length && r.witnesses.every(function (w) { return /PASS$/.test(w); }) && r.controls.length && r.controls.every(function (c) { return c.found; }); }), 'green=' + enf.length);
var mS = TT.model(shipped); ck('T1d', 'verdict PASS only because nothing is red (the SHIPPED record)', mS.verdict === 'PASS' && !mS.rows.some(function (r) { return r.colour === 'red'; }), mS.verdict + ' ' + JSON.stringify(mS.counts));
ck('T1e', 'verdict PASS only because nothing is red (the copy the open-row arms judge)', m.verdict === 'PASS' && !m.rows.some(function (r) { return r.colour === 'red'; }), m.verdict + ' ' + JSON.stringify(m.counts));
function clone() { return JSON.parse(JSON.stringify(rec)); }
var c2 = clone(), o = c2.rows.filter(function (r) { return r.status === 'OPEN'; })[0]; o.status = 'ENFORCED'; var m2 = TT.model(c2), r2 = m2.rows.filter(function (r) { return r.id === o.id; })[0];
ck('T2', 'an OPEN row flipped to ENFORCED without a witness or control is NOT green', r2.colour !== 'green', r2.status + '/' + r2.colour); kill('open-flipped-green', r2.colour !== 'green');
var c3 = clone(), e3 = c3.rows.filter(function (r) { return r.status === 'ENFORCED'; })[0]; e3.controls[0].found = false; var m3 = TT.model(c3), r3 = m3.rows.filter(function (r) { return r.id === e3.id; })[0];
ck('T3', 'an ENFORCED row with a missing control is not green and fails the verdict (a green without a failing control is a claim)', r3.colour === 'red' && m3.verdict === 'FAIL', r3.status + '/' + r3.colour + ' verdict=' + m3.verdict); kill('control-missing-green', r3.colour === 'red' && m3.verdict === 'FAIL');
var c3b = clone(), e3b = c3b.rows.filter(function (r) { return r.status === 'ENFORCED'; })[0]; e3b.witnesses[0].verdict = 'FAIL'; var m3b = TT.model(c3b);
ck('T3b', 'a failing witness on an ENFORCED row is not green', m3b.verdict === 'FAIL'); kill('witness-failed-green', m3b.verdict === 'FAIL');
var inc = [TT.model(null), TT.model({ schema: 'terms-v1', rows: [] }), TT.model({ schema: 'other', rows: [{}] })];
ck('T4', 'no record / empty rows / wrong schema is INCONCLUSIVE, never PASS', inc.every(function (x) { return x.verdict === 'INCONCLUSIVE' && !x.rows.length; })); kill('empty-green', inc.every(function (x) { return x.verdict === 'INCONCLUSIVE'; }));
var h = TT.html(m, 0), firstEnf = h.indexOf('data-status="ENFORCED"'), lastOpen = h.lastIndexOf('data-status="OPEN"');
ck('T5a', 'rendered HTML lists every OPEN row before the first ENFORCED row', lastOpen >= 0 && firstEnf > lastOpen);
var openRows = h.split('<tr class="tt-row"').filter(function (s) { return /data-status="OPEN"/.test(s); });
ck('T5b', 'no OPEN row carries the green colour', openRows.length === open.length && openRows.every(function (s) { return !/data-colour="green"|#1a7f37/.test(s.split('</tr>')[0]); }), 'openRows=' + openRows.length);
ck('T5c', 'the panel names how to reproduce the run (the browser cannot run it)', /witness_terms\.js/.test(h) && /cannot run the witnesses/.test(h));
var page = fs.readFileSync(path.join(E, 'idempiere.html'), 'utf8'), sw = fs.readFileSync(path.join(E, 'sw.js'), 'utf8');
ck('T6', 'wiring: idempiere.html loads team_terms.js; sw.js precaches the script and the record', /'team_terms\.js\?v=\d+'/.test(page) && /'team_terms\.js',/.test(sw) && /'team_terms\.json',/.test(sw));
console.log('§TT_VERDICT ' + (!judged ? 'INCONCLUSIVE' : fails || killed !== mut ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + mut + ' (browser click not judged)');
process.exit(fails || killed !== mut ? 1 : 0);
