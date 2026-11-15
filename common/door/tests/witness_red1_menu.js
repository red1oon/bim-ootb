// ⚠ DO NOT REMOVE — W-RED1-MENU (bim-compiler prompts/CLI_ERP_IVR.md §22.8, §22.11 step R5: a menu springs up for a missing value). READ THE LOG; an exit code is not evidence.
//   M1 ISSUE (the menu offers values that are not the legal ones, or the line that runs is not the one picked) · M2 ISSUE (a one-shot run or an AI gets a menu instead of the door's refusal)
//   M3 ISSUE (Esc on the menu still runs something)
//   Falsifier: WORDS_BREAK=pickwrong (the next item is taken: must FAIL M1). A claim with nothing to judge says INCONCLUSIVE, never PASS. Needs the Viewer headless (warm page).
//   Run: node common/door/tests/witness_red1_menu.js > common/door/tests/logs/red1_menu.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-MENU'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.WORDS_BREAK || '';
const run = (argv, input, env) => new Promise((res) => { let o = '', e = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, env || {}), stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); if (input != null) { p.stdin.write(input); p.stdin.end(); } p.on('close', c => res({ code: c, out: o, err: e })); });
const ran = (err) => (err.match(/^§RED1 line verb=.*$/mg) || []).map(l => JSON.parse(l.replace(/^.* line=/, '')));
(async () => {
  const legal = (await run([DOOR, '--actor', 'human', 'viewer.counts building=Duplex by=discipline'])).out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
  const names = legal && legal.status === 'ok' ? legal.answer.rows.map(r => r[0]) : [];
  k.L('legal disciplines=' + JSON.stringify(names));
  if (names.length < 2) { k.incon('M1-M3', 'the Viewer gave no disciplines: ' + (legal && legal.why)); return k.end(); }
  // M1: clash with no values; pick item 2 then item 1
  const s = await run([RED1], 'cd Duplex\nclash\n2\n1\n', BRK ? { WORDS_BREAK: BRK } : {});
  const menus = s.out.split(/^clash: pick /m).slice(1).map(b => (b.match(/^[> ] \d+ {4}(\S+)$/mg) || []).map(l => l.replace(/^[> ] \d+ {4}/, '')));
  const lines = ran(s.err), want = 'viewer.clashes building=Duplex discA=' + names[1] + ' discB=' + names[0] + ' rows=all';
  k.L('M1 menus=' + JSON.stringify(menus) + ' ran=' + JSON.stringify(lines));
  k.chk('M1 `clash` alone opens a menu of exactly the building\'s disciplines (twice: discA, discB), and picking 2 then 1 runs `' + want + '`',
    menus.length === 2 && menus.every(m => JSON.stringify(m) === JSON.stringify(names)) && lines.indexOf(want) >= 0 && /box overlaps/.test(s.out), 'ran=' + lines.filter(l => /clashes/.test(l)).join(' | '));
  // M2: one shot = the door's refusal
  const o = await run([RED1, 'cd Duplex; clash']), env = o.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
  k.chk('M2 `red1 \'cd Duplex; clash\'` (one shot) opens no menu: the door refuses, naming the missing inputs', !!env && env.status !== 'ok' && /missing input: discA, discB/.test(env.why || '') && !/pick discA/.test(o.out + o.err), 'status=' + (env && env.status) + ' why=' + (env && env.why));
  // M3: Esc cancels
  const c = await run([RED1], 'cd Duplex\nclash\nq\n'), cl = ran(c.err).filter(l => /^viewer\.clashes/.test(l));
  k.chk('M3 Esc (q) on the menu runs nothing and says so', !cl.length && /cancelled: nothing was run/.test(c.out), 'clash lines run=' + cl.length);
  k.end();
})().catch(e => { console.log('§W-RED1-MENU FAIL ' + (e && e.stack || e)); process.exit(1); });
