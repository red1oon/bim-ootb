#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-GUIDE-BUTTONS (prompts/DXF2BIM_ARCHITECT_REVIEW.md R7-2). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the in-app guide's "2D drawings → model" card told the user to press "Accept all" while the yellow list shows "Accept stated + read" /
// "Accept inferred" instead whenever it holds both kinds (§D36): a guide that names a button the user cannot find.
//   GB1 every accept-button label the yellow list can render (dxf_meta_editor.js renderYellows, `<span>Accept ...</span>`) is named in the card (modeller.html initGuide).
//   GB2 the labels were found at all (a regex that matches nothing would pass GB1 vacuously).
// usage: node modeller/tests/witness_dxf_guide_buttons.js
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..');
const ed = fs.readFileSync(path.join(M, 'dxf_meta_editor.js'), 'utf8'), html = fs.readFileSync(path.join(M, 'modeller.html'), 'utf8');
const fn = (ed.match(/function renderYellows\(\)[\s\S]*?\n {2}\}\n/) || [''])[0], labels = Array.from(new Set((fn.match(/<span>(Accept[^<]*)<\/span>/g) || []).map(s => s.slice(6, -7))));
const card = (html.match(/\['2D drawings → model', '([^']*)'\]/) || [, ''])[1].replace(/<[^>]+>/g, ''), missing = labels.filter(l => card.indexOf(l) < 0);
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
ok('GB2 the yellow list\'s accept buttons are found', labels.length >= 3 && card.length > 0, 'labels=' + JSON.stringify(labels) + ' card_chars=' + card.length);
ok('GB1 the in-app guide names every accept button the list can show', labels.length > 0 && !missing.length, missing.length ? 'MISSING ' + JSON.stringify(missing) : 'all ' + labels.length + ' named');
console.log('§W-GUIDE-BUTTONS ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
