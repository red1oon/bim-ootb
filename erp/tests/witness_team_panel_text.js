// ⚠ DO NOT REMOVE — W-TEAM-PANEL-TEXT (owner trial policy 2026-11-27: no public team trial; system default works only on browsers the maintainer pairs; everyone else sets up their own private repository + key). Read the output line.
// Issue it exposes: the Team panel told an outsider "System default is a trial ... Trial key not installed — ask the administrator" — a trial offer they can never use, contradicting erp/team_guide.html ("Do it yourself").
// Rule: common/comm/team_panel.js describe(cfg,dev,d,on) owns the wording. Outsider (system default, no key) -> DIY sentence, no "trial". Maintainer (default key installed) -> one-cycle trial sentence. Own setup -> unchanged.
// Usage: node erp/tests/witness_team_panel_text.js [team_panel.js]   (a path = red control: run it on the OLD file, it must FAIL)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(process.argv[2] || path.join(ROOT, 'common', 'comm', 'team_panel.js'), 'utf8');
const guide = fs.readFileSync(path.join(ROOT, 'erp', 'team_guide.html'), 'utf8');
const g = { addEventListener() {}, indexedDB: {}, location: { search: '' }, localStorage: { getItem() { return null; } } }; g.window = g; g.globalThis = g;
vm.runInNewContext(src, g);
const D = (tok) => ({ owner: 'red1oon', repo: 'bim-teams-trial', token: tok }), strip = (h) => String(h == null ? '' : h).replace(/<[^>]+>/g, '');
let fails = 0, judged = 0; const out = (ok, m) => { judged++; if (!ok) fails++; console.log((ok ? '  PASS ' : '  FAIL ') + m); };
const text = (v) => strip(v.keyText) + ' | ' + strip(v.note);
const outsider = g.TeamPanel.describe({}, null, D(''), false), maint = g.TeamPanel.describe({}, null, D('github_pat_X'), false), own = g.TeamPanel.describe({ owner: 'a', repo: 'b', token: 't', trial: false }, null, D(''), false);
console.log('  outsider: ' + text(outsider)); console.log('  maintainer: ' + text(maint)); console.log('  own: ' + text(own));
out(!!outsider.keyText && /your own private repository/.test(text(outsider)) && /your own key/.test(text(outsider)) && /Save as my own/.test(text(outsider)) && /Team guide/.test(text(outsider)), 'outsider (system default, no key): wording = your own private repository + key, Save as my own, Team guide');
out(!!outsider.keyText && !/trial/i.test(text(outsider)) && !/administrator/i.test(text(outsider)), 'outsider: no mention of a trial or of asking the administrator (issue: a trial offer they cannot get)');
out(!!maint.note && /trial/.test(maint.note) && /one full test cycle/.test(maint.note) && maint.keyText === 'Key installed', 'maintainer (default key installed): "Key installed" + the one-cycle trial sentence');
out(own.note === 'Your own setup: no trial limit.' && own.keyText === 'Key installed', 'own setup: unchanged');
out(/<b>you own<\/b>/.test(guide) && /your own private GitHub repository and your own key/.test(guide) && /Save as my own/.test(guide) && /our own demo place/.test(guide), 'the guide still says the same (own private repository + key; System default = our demo place), so the two agree');
console.log('§WITNESS_TEAM_PANEL_TEXT ' + (judged === 0 || !outsider ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails);
process.exit(fails ? 1 : 0);
