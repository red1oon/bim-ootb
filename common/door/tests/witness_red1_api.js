// ⚠ DO NOT REMOVE — W-RED1-API (bim-compiler prompts/CLI_ERP_IVR.md §22.10: the JS face, generated from verbs.json). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (a verb of the vocabulary is not reachable from JS, or JS has a method the vocabulary does not: a hand list drifting) · A2 ISSUE (a JS call answers differently from the
//   same door line: a second path) · A3 ISSUE (api.words.run answers differently from the same words typed to red1)
//   Falsifier: API_BREAK=skip (one verb left out: must FAIL A1). Run: node common/door/tests/witness_red1_api.js > common/door/tests/logs/red1_api.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-API'), RED1 = path.join(ROOT, 'common/door/red1.js'), D = require(DOOR);
const run = (argv) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, { RED1_WARM: 'off' }), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.on('close', () => res(o.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)))); });
const mask = (e) => JSON.stringify(e && { status: e.status, verb: e.verb, answer: e.answer });
(async () => {
  const api = require(RED1).api(), vocab = D.loadVocab(), want = vocab.verbs.map(v => v.verb).sort();
  const got = Object.keys(api).filter(a => a !== 'words').reduce((acc, a) => acc.concat(Object.keys(api[a]).map(v => a + '.' + v)), []).sort();
  k.L('A1 vocabulary=' + want.length + ' js=' + got.length);
  k.chk('A1 every verb of verbs.json is api.<app>.<verb>, and nothing else (' + want.length + ')', JSON.stringify(got) === JSON.stringify(want), 'missing=' + want.filter(v => got.indexOf(v) < 0).join(',') + ' extra=' + got.filter(v => want.indexOf(v) < 0).join(','));
  const js = await api.object.count({ building: 'Duplex', kind: 'Element', discipline: 'ARC' }), line = (await run([DOOR, '--actor', 'human', js.line])).pop();
  k.L('A2 line=' + js.line + ' js=' + (js.answer && js.answer.summary) + ' door=' + (line && line.answer && line.answer.summary));
  if (js.status !== 'ok') k.incon('A2', 'the JS call did not answer ok: ' + js.why);
  else k.chk('A2 api.object.count({building, kind, discipline}) builds the canonical line `' + js.line + '` and answers as door.js does with it', mask(js) === mask(line), js.answer.summary);
  const w = (await api.words.run('cd Element; count discipline=STR', 'cd Duplex')).pop(), r = (await run([RED1, 'cd Duplex; cd Element; count discipline=STR'])).pop();
  k.chk('A3 api.words.run(\'cd Element; count discipline=STR\', \'cd Duplex\') answers as `red1 \'cd Duplex; cd Element; count discipline=STR\'`', !!w && w.status === 'ok' && mask(w) === mask(r), (w && w.answer && w.answer.summary) + ' · ' + (r && r.answer && r.answer.summary));
  k.end();
})().catch(e => { console.log('§W-RED1-API FAIL ' + (e && e.stack || e)); process.exit(1); });
