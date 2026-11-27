// ⚠ DO NOT REMOVE — W-TEAM-GUIDE-OWN (owner 2026-11-27: "it is only privy to us in our trials. We can leave notes in our guide on
// how they can setup on their own as we won't give such trials to avoid cost on our part"). Read the output line.
// Issues it exposes: (1) the guide promised outsiders a ready-made trial on our GitHub; (2) setup steps that name panel labels the
// Team panel does not have (guide drift). Usage: node erp/tests/witness_team_guide_own_setup.js [guide.html]   (a path = red control)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const guide = fs.readFileSync(process.argv[2] || path.join(ROOT, 'erp', 'team_guide.html'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'common', 'comm', 'team_panel.js'), 'utf8');
let fails = 0; const out = (ok, m) => { if (!ok) fails++; console.log((ok ? '  PASS ' : '  FAIL ') + m); };
out(!/try it without setting anything up/i.test(guide) && /We do not offer a public trial/.test(guide), 'no public-trial promise; says the trial is ours only');
const labels = ['Repository owner', 'Repository', 'Key (token)', 'Save as my own', 'Your own', 'System default'];
const named = labels.filter(l => guide.includes('<b>' + l + '</b>'));
out(named.length >= 5, 'the own-setup steps name the panel controls (' + named.length + ' of ' + labels.length + ')');
const missing = named.filter(l => !panel.includes(l));
out(missing.length === 0, 'every label the guide names exists in common/comm/team_panel.js' + (missing.length ? ' — missing: ' + missing.join(', ') : ''));
out(/Fine-grained tokens/.test(guide) && /only that repository/.test(guide) && /expiry/.test(guide), 'token steps: fine-grained, one repository, expiry');
console.log('§WITNESS_TEAM_GUIDE_OWN ' + (named.length === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' fails=' + fails);
process.exit(fails ? 1 : 0);
