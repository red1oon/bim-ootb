// ⚠ DO NOT REMOVE — W-RED1-CD (bim-compiler prompts/CLI_ERP_IVR.md §22.4, §22.11 step R2: cd, pwd, the context). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (cd takes the wrong place: a building name, a kind of the building and an ERP kind are not resolved in that order, or a name that is none of them is taken anyway). The order of the tries is read
//      from the §RED1 log; the screen shows only the tries that answered (bim-compiler prompts/CLI_ERP_IVR.md §50 (3))
//   C2 ISSUE (the context overrides a key typed on the line, so a person cannot ask about another kind without leaving)
//   C3 ISSUE (pwd's keys do not replay: the same verb with pwd's keys, run alone, answers differently from the word in the session)
//   Falsifier: WORDS_BREAK=ctxwins (the context beats a typed key: must FAIL C2). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_red1_cd.js > common/door/tests/logs/red1_cd.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-CD'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.WORDS_BREAK || '';
const run = (argv, input, env) => new Promise((res) => { let o = '', e = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, env || {}), stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); if (input != null) { p.stdin.write(input); p.stdin.end(); } p.on('close', c => res({ code: c, out: o, err: e })); });
const wheres = (err) => (err.match(/^§RED1 typed n=\d+ where=.*$/mg) || []).map(l => JSON.parse(l.replace(/^.*where=/, '')));
const mask = (x) => JSON.stringify(x, (key, v) => (key === 'request' || key === 'ms' ? undefined : v));
(async () => {
  // C1: a session walks the places
  const s = await run([RED1], 'cd Duplex\ncd Element\ncd ..\ncd "Business Partner"\ncd NoSuchPlace\ncd\n', BRK ? { WORDS_BREAK: BRK } : {});
  // the order of the tries is read from the §RED1 log (every line run, in order); since §50 (3) a refused guess is in the log only, not on the screen
  const w = wheres(s.err), arrows = (s.out.match(/^→ .*$/mg) || []), tries = (s.err.match(/^§RED1 line verb=\S+ status=\S+ request=\S* line=.*$/mg) || []).map(l => ({ status: /status=(\S+)/.exec(l)[1], line: JSON.parse(l.replace(/^.* line=/, '')) }));
  k.L('C1 prompts=' + JSON.stringify(w) + ' lines=' + JSON.stringify(arrows) + ' tries=' + JSON.stringify(tries.map(t => t.status + ' ' + t.line)));
  if (w.length !== 6) k.incon('C1', 'the session did not answer 6 lines: ' + s.err.slice(-300));
  else k.chk('C1 cd Duplex = the building (no door line); cd Element there = a kind (object.describe); cd .. = back; cd "Business Partner" in the building = tried as its kind first (object.describe), then as an ERP kind (mis.describe); a name that is none = refused, the place unchanged; cd = nowhere',
    w[0] === 'red1 Duplex>' && w[1] === 'red1 Duplex/Element>' && w[2] === 'red1 Duplex>' && w[3] === 'red1 Business Partner>' && w[4] === 'red1 Business Partner>' && w[5] === 'red1>'
      && tries.length >= 3 && tries[0].line === 'object.describe building=Duplex kind=Element' && tries[0].status === 'ok' && tries[1].line === 'object.describe building=Duplex kind="Business Partner"' && tries[1].status !== 'ok' && tries[2].line === 'mis.describe kind="Business Partner"' && tries[2].status === 'ok'
      && arrows[0] === '→ object.describe building=Duplex kind=Element' && arrows[1] === '→ mis.describe kind="Business Partner"' && /no building, kind or ERP window is named "NoSuchPlace"/.test(s.out),
    'prompts ' + w.join(' | '));
  // C2: a typed key beats the context
  const t = await run([RED1, 'cd Duplex; cd Element; count kind=Room'], null, BRK ? { WORDS_BREAK: BRK } : {});
  const ta = (t.err.match(/^→ .*$/mg) || []).pop() || '', te = t.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
  k.L('C2 line=' + ta + ' answer=' + (te && te.answer && te.answer.summary));
  if (!te) k.incon('C2', 'no answer: ' + t.err.slice(-300));
  else k.chk('C2 in Duplex/Element, `count kind=Room` counts Rooms: the typed kind wins over the context\'s', ta === '→ object.count building=Duplex kind=Room' && te.answer && te.answer.kind === 'Room', ta + ' · ' + (te.answer && te.answer.summary));
  // C3: pwd's keys replay
  const u = await run([RED1], 'cd Duplex\ncd Element\npwd\n'), pwd = (u.out.split('\n').filter(l => /^building=/.test(l))[0] || '').trim();
  const v = await run([RED1, 'cd Duplex; cd Element; count']), ve = v.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
  const alone = await run([DOOR, '--actor', 'human', 'object.count ' + pwd]), ae = alone.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
  k.L('C3 pwd=' + JSON.stringify(pwd));
  if (!pwd || !ve || !ae) k.incon('C3', 'pwd or an answer missing');
  else k.chk('C3 `object.count ' + pwd + '` run alone answers as the word `count` did in that place', ae.status === 'ok' && mask(ae.answer) === mask(ve.answer), (ae.answer && ae.answer.summary) + ' · ' + (ve.answer && ve.answer.summary));
  k.end();
})().catch(e => { console.log('§W-RED1-CD FAIL ' + (e && e.stack || e)); process.exit(1); });
