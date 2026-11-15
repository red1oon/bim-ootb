// ⚠ DO NOT REMOVE — W-GLOB (bim-compiler prompts/CLI_ERP_IVR.md §22.7, §22.11 step R4: one wildcard reader, two forms). READ THE LOG; an exit code is not evidence.
//   G1 ISSUE (the SQL form and the JS form of one glob select different rows: a list filter and a shell view would disagree) · G2 ISSUE (a value with no wildcard is no longer an exact match)
//   G3 ISSUE (an escaped \* is read as a wildcard) · G4 ISSUE (the shell's `| glob` view keeps rows the JS form would not, or drops rows it would keep)
//   Falsifier: GLOB_BREAK=casesens (the SQL form keeps the case: must FAIL G1). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_glob.js > common/door/tests/logs/glob.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-GLOB'), RED1 = path.join(ROOT, 'common/door/red1.js'), G = require(path.join(ROOT, 'common/door/glob.js')), BRK = process.env.GLOB_BREAK || '';
const run = (argv) => new Promise((res) => { let o = '', e = ''; const env = Object.assign({}, process.env); if (BRK) env.GLOB_BREAK = BRK; const p = cp.spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); });
const line = async (l) => { const r = await run([DOOR, '--actor', 'human', l]); return r.out.split('\n').filter(x => x.charAt(0) === '{').map(x => JSON.parse(x)).pop() || { status: 'none' }; };
(async () => {
  // the corpus: every element name of Duplex, read through the door in pages
  const names = []; for (let off = 0; off < 5000; off += 1000) { const e = await line('object.list building=Duplex kind=Element columns=element_name limit=1000 offset=' + off); if (e.status !== 'ok') break; e.answer.rows.forEach(r => names.push(r.element_name)); if (e.answer.rows.length < 1000) break; }
  k.L('corpus names=' + names.length);
  if (!names.length) { k.incon('G1-G4', 'no element names read (is buildings/Duplex_extracted.db here?)'); return k.end(); }
  const P = ['*pipe*', 'Basic Wall*', '*:58295?', '*[0-9]', 'm_*', '*[!0-9]', 'Bathroom ?'];
  const bad = [];
  for (const p of P) {
    const js = names.filter(G.match(p)).length, e = await line('object.count building=Duplex kind=Element element_name="' + p + '"'), sql = e.answer && e.answer.count;
    k.L('G1 ' + JSON.stringify(p) + ' js=' + js + ' sql=' + sql + ' sqlglob=' + JSON.stringify(G.toSqlGlob(p, BRK)));
    if (js !== sql) bad.push(p + ' js=' + js + ' sql=' + sql);
  }
  const judged = P.filter(p => names.some(G.match(p))).length;
  if (!judged) k.incon('G1', 'no pattern matched any name: nothing judged');
  else k.chk('G1 for ' + P.length + ' globs (' + judged + ' matching some names), the SQL form (object.count) counts exactly the names the JS form keeps', !bad.length, bad.join(' | '));
  const ex = await line('object.count building=Duplex kind=Element discipline=ARC'), exName = names.filter(n => n === 'Bathroom 1').length, exE = await line('object.count building=Duplex kind=Element element_name="Bathroom 1"'), lower = await line('object.count building=Duplex kind=Element element_name="bathroom 1"');
  k.chk('G2 no wildcard = exact as before: discipline=ARC counts 270, element_name="Bathroom 1" counts the exact names, "bathroom 1" (other case, no wildcard) counts 0', ex.answer && ex.answer.count === 270 && exE.answer && exE.answer.count === exName && exName > 0 && lower.answer && lower.answer.count === 0,
    'ARC=' + (ex.answer && ex.answer.count) + ' exact=' + (exE.answer && exE.answer.count) + '/' + exName + ' othercase=' + (lower.answer && lower.answer.count));
  const lit = G.match('a\\*b');
  k.chk('G3 `a\\*b` matches the text a*b only, not axb; its SQL form is a[*]b', lit('a*b') && !lit('axb') && G.toSqlGlob('a\\*b') === 'a[*]b' && !G.isGlob('a\\*b'), 'sql=' + G.toSqlGlob('a\\*b') + ' isGlob=' + G.isGlob('a\\*b'));
  // G4 the shell view on rows the door returned
  const r = await run([RED1, 'object.list building=Duplex kind=Element columns=element_name limit=1000 | *bath*']), env = r.out.split('\n').filter(x => x.charAt(0) === '{').map(x => JSON.parse(x)).pop();
  const want = names.slice(0, 1000).filter(G.match('*bath*'));
  k.chk('G4 `red1 \'… | *bath*\'` keeps exactly the rows whose cells the JS form matches (' + want.length + ')', !!env && env.match === '*bath*' && JSON.stringify(env.answer.rows.map(x => x.element_name)) === JSON.stringify(want) && want.length > 0,
    'kept=' + (env && env.answer.rows.length) + ' want=' + want.length);
  k.end();
})().catch(e => { console.log('§W-GLOB FAIL ' + (e && e.stack || e)); process.exit(1); });
