// ⚠ DO NOT REMOVE — W-RED1-POST (bim-compiler prompts/CLI_ERP_IVR.md §29.3 + §29.6 P3c: the word `post` and the next-step offer). READ THE LOG; an exit code is not evidence.
//   Keystrokes are REAL: a pseudo-terminal (`script`), the person's Return after each line, as W-RED1-ASSIST does. Without `script` the pty cases are INCONCLUSIVE.
//   P1 ISSUE (the offer is missing, or asks about a line that is not the one that runs): after `cost` the session prints `Ready to post to ERP Project Order? y/N → <line>` once; `y` runs EXACTLY that line
//      (the printed → line equals it) and the op-log gains the post's ops
//   P2 ISSUE (the offer is made whatever the engine says): once the selection is in the Project Order the engine's decide() offers nothing, and `cost` asks nothing (and the envelope's `next` is empty)
//   P3 ISSUE (anything but y writes): after the offer, `n` (and an empty Return) leaves the op-log byte-equal and prints `not done: <line>`
//   P4 ISSUE (one-shot or AI is asked, or posts by itself): `red1 'cd Duplex; cost discipline=ARC'` and `door.js --actor ai viewer.cost …` ask nothing, write nothing, and carry the exact line in the envelope's `next` (and `offer`)
//   P5 ISSUE (the word `post` writes without asking, or expands to another line): `post discipline=ARC` prints `<line>   run it? y/N` and nothing is written until y; the line is
//      `erp.process name="Fold from BIM" Building=Duplex Selection="discipline=ARC"` (the word's data: vocab/words.json), the same line the offer printed
//   P6 ISSUE (after a post the project is not offered): after the post, `Open the project? y/N → cd project`; y puts the session in the Project window (`pwd` reads kind=Project)
//   P7 ISSUE (the offer is not the engine's): on the baseline database an independent ProjOrderState.decide() over the same selection says `generate` exactly when the offer is made (P1), and `in-po` when it is not (P2)
//   Falsifiers: RED1_BREAK=nooffer (no question after cost: must FAIL P1) · OFFER_BREAK=always (offered even when posted: must FAIL P2) · WORDS_BREAK=noconfirm (post runs without asking: must FAIL P5)
//   Run: node common/door/tests/witness_red1_post.js > common/door/tests/logs/red1_post.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-POST'), RED1 = path.join(ROOT, 'common/door/red1.js'), SEL = 'discipline=ARC', LINE = 'erp.process name="Fold from BIM" Building=Duplex Selection="' + SEL + '"';
const freshEnv = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1post_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off', RED1_LOG: 'stderr' }; };
const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
const bytes = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG); } catch (x) { return Buffer.alloc(0); } };
const sh = (cmd, env, ms) => new Promise((res) => { let o = ''; const p = cp.spawn('bash', ['-c', cmd], { env: Object.assign({}, process.env, env) }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { o += d; }); const t = setTimeout(() => { p.kill(); }, ms || 240000); p.on('close', () => { clearTimeout(t); res(o); }); });
const clean = (o) => o.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
const pty = (keys, env) => sh(keys + " | script -qc \"stty rows 50 cols 220; node " + RED1 + "\" /dev/null", env).then(clean);
const hasScript = cp.spawnSync('bash', ['-c', 'command -v script']).status === 0;
const count = (t, re) => (t.match(re) || []).length;
(async () => {
  const OFFER = /Ready to post to ERP Project Order\? y\/N → (.*)/g, OPEN = /Open the project\? y\/N → (.*)/g;
  // P7 + the engine's own words, on the baseline database (an empty op-log)
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js')), e0 = freshEnv(); Object.assign(process.env, e0);
  const quiet = async (fn) => { const w = process.stderr.write, l = console.log; process.stderr.write = () => true; console.log = () => {}; try { return await fn(); } finally { process.stderr.write = w; console.log = l; } };
  const B0 = await quiet(() => EC.boot({ oplog: e0.BIM_OBJECT_OPLOG })), H = globalThis.BimOrderHost, inp = await quiet(() => H.inputs({ building: 'Duplex', selection: SEL })), PS = H.ProjOrderState;
  const dBase = PS.decide(PS.readState(B0.db, inp.key, inp.classes, inp.env), false);
  k.L('P7 baseline decide(): ' + JSON.stringify(dBase));
  if (!hasScript) { ['P1', 'P3', 'P5', 'P6'].forEach(p => k.incon(p, 'no `script` (a pseudo-terminal is needed for real keystrokes)')); }
  // P1 + P6 + P5 (run B): cost -> offer -> y -> post -> open the project -> y
  const eA = freshEnv(); let o1 = '';
  if (hasScript) {
    o1 = await pty("(sleep 3; printf 'cd Duplex\\r'; sleep 3; printf 'cost " + SEL + "\\r'; sleep 12; printf 'y\\r'; sleep 22; printf 'y\\r'; sleep 8; printf 'pwd\\r'; sleep 2; printf 'exit\\r')", eA);
    const offers = Array.from(o1.matchAll(OFFER)).map(m => m[1].trim()), opens = Array.from(o1.matchAll(OPEN)).map(m => m[1].trim());
    const arrows = (o1.match(/^→ erp\.process .*$/gm) || []).map(l => l.slice(2).trim()), posted = /Posted Duplex: Project \d+, PlannedAmt [\d.]+, (\d+) change/.exec(o1), n = nops(eA);
    k.L('P1 offers=' + JSON.stringify(offers) + ' → lines=' + JSON.stringify(arrows) + ' message=' + (posted && posted[0]) + ' op-log=' + n);
    k.chk('P1 after `cost ' + SEL + '` the session offers ONCE `Ready to post to ERP Project Order? y/N → <line>`; y runs exactly that line (the → line is equal) and the op-log gains the post\'s ' + (posted && posted[1]) + ' ops',
      offers.length === 1 && offers[0] === LINE && arrows.length === 1 && arrows[0] === offers[0] && !!posted && n === Number(posted[1]) && n > 0, 'offers=' + offers.length + ' line-equal=' + (arrows[0] === offers[0]) + ' ops=' + n);
    k.L('P6 open offers=' + JSON.stringify(opens) + ' pwd=' + JSON.stringify((o1.match(/^kind=.*$/gm) || []).slice(-1)));
    k.chk('P6 after the post the session offers `Open the project? y/N → cd project`, and y puts it in the Project window (`pwd` reads kind=Project)', opens.length === 1 && opens[0] === 'cd project' && /^kind=Project\b/m.test(o1) , 'offers=' + JSON.stringify(opens));
    // P2: the same selection again, in the same op-log: the engine says in-po, nothing is offered
    const o2 = await pty("(sleep 3; printf 'cd Duplex\\r'; sleep 3; printf 'cost " + SEL + "\\r'; sleep 10; printf 'exit\\r')", eA), off2 = count(o2, OFFER), E2 = JSON.parse((await sh("node " + RED1 + " 'cd Duplex; cost " + SEL + "' 2>/dev/null", eA)).split('\n').filter(l => l.charAt(0) === '{').pop() || 'null');
    k.L('P2 offers after the post=' + off2 + ' next=' + JSON.stringify(E2 && E2.next) + ' offer=' + JSON.stringify(E2 && E2.offer));
    const O2 = await quiet(() => EC.boot({ oplog: eA.BIM_OBJECT_OPLOG })), st = PS.readState(O2.db, inp.key, inp.classes, inp.env), dAfter = PS.decide(st, false);
    k.L('P7 decide() after the post: ' + JSON.stringify(dAfter));
    k.chk('P2 once the selection is in the Project Order the engine says in-po and `cost ' + SEL + '` asks nothing (no question, `next` empty)', dAfter.kind === 'in-po' && off2 === 0 && !!E2 && E2.status === 'ok' && (E2.next || []).length === 0 && !E2.offer, 'decide=' + dAfter.kind + ' offers=' + off2 + ' next=' + JSON.stringify(E2 && E2.next));
  }
  // P3: anything but y
  if (hasScript) {
    const e3 = freshEnv(), o3 = await pty("(sleep 3; printf 'cd Duplex\\r'; sleep 3; printf 'cost " + SEL + "\\r'; sleep 12; printf 'n\\r'; sleep 3; printf 'cost " + SEL + "\\r'; sleep 12; printf '\\r'; sleep 3; printf 'exit\\r')", e3);
    const nd = count(o3, /^not done: erp\.process name="Fold from BIM"/gm);
    k.L('P3 offers=' + count(o3, OFFER) + ' not-done lines=' + nd + ' op-log bytes=' + bytes(e3).length);
    k.chk('P3 `n` and an empty Return after the offer each run nothing: `not done: <line>` twice, the op-log does not exist', count(o3, OFFER) === 2 && nd === 2 && bytes(e3).length === 0, 'offers=' + count(o3, OFFER) + ' notdone=' + nd + ' bytes=' + bytes(e3).length);
  }
  // P4: one-shot and AI
  const e4 = freshEnv(), s4 = await sh("node " + RED1 + " 'cd Duplex; cost " + SEL + "'", e4), j4 = JSON.parse(s4.split('\n').filter(l => l.charAt(0) === '{').pop() || 'null');
  const a4 = await sh("node " + DOOR + " --actor ai 'viewer.cost building=Duplex " + SEL + "' 2>/dev/null", e4), ja = JSON.parse(a4.split('\n').filter(l => l.charAt(0) === '{').pop() || 'null');
  k.L('P4 one-shot: question=' + /y\/N/.test(s4) + ' next=' + JSON.stringify(j4 && j4.next) + ' | ai: status=' + (ja && ja.status) + ' next=' + JSON.stringify(ja && ja.next) + ' | op-log bytes=' + bytes(e4).length);
  k.chk('P4 one-shot `red1 \'cd Duplex; cost …\'` and the AI actor ask nothing, write nothing, and carry the exact line in `next` and `offer`', !/y\/N/.test(s4) && !!j4 && j4.next.length === 1 && j4.next[0] === LINE && j4.offer && j4.offer.line === LINE && !!ja && ja.status === 'ok' && ja.next[0] === LINE && bytes(e4).length === 0,
    'one-shot next=' + JSON.stringify(j4 && j4.next) + ' ai next=' + JSON.stringify(ja && ja.next));
  // P5: the word `post`
  if (hasScript) {
    const e5 = freshEnv(), o5 = await pty("(sleep 3; printf 'cd Duplex\\r'; sleep 3; printf 'post " + SEL + "\\r'; sleep 3; printf 'n\\r'; sleep 3; printf 'exit\\r')", e5), q5 = Array.from(o5.matchAll(/^(erp\.process name="Fold from BIM".*?)\s+run it\? y\/N/gm)).map(m => m[1]);
    const e6 = freshEnv(), o6 = await pty("(sleep 3; printf 'cd Duplex\\r'; sleep 3; printf 'post " + SEL + "\\r'; sleep 3; printf 'y\\r'; sleep 22; printf 'exit\\r')", e6);
    k.L('P5 asked=' + JSON.stringify(q5) + ' after n: op-log bytes=' + bytes(e5).length + ' | after y: op-log lines=' + nops(e6) + ' ran=' + /Posted Duplex/.test(o6));
    k.chk('P5 `post ' + SEL + '` expands to ' + LINE + ' and asks `run it? y/N`; n writes nothing; y posts', q5.length === 1 && q5[0] === LINE && bytes(e5).length === 0 && /Posted Duplex/.test(o6) && nops(e6) > 0, 'asked=' + JSON.stringify(q5) + ' n-bytes=' + bytes(e5).length + ' y-ops=' + nops(e6));
  }
  k.chk('P7 the engine\'s decide() on the baseline says `generate` (the offer of P1) and, after the post, `in-po` (no offer, P2)', dBase.kind === 'not-generated' && dBase.actions.join() === 'generate', 'baseline=' + JSON.stringify(dBase));
  k.end(); process.exit(k.fail ? 1 : (k.inc ? 3 : 0));
})().catch(e => { console.log('§RED1_POST CRASH ' + (e && e.stack || e)); process.exit(1); });
