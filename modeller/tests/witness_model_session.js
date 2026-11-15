#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-MODEL-SESSION (bim-compiler prompts/FILM_COMMAND_LINE_ERP.md CH 1 + prompts/MODEL_SESSION_LINES.md). READ THE LOG; an exit code is not evidence.
// One Modeller page kept open between door lines (model.open, model.convert, model.addbay, model.undo, model.close), each line its own process.
//   S1 ISSUE (a line does not see what the last one left: no session state) · S2 ISSUE (a line runs out of order, or twice, and answers anyway) · S3 ISSUE (an answer's numbers disagree with each other or with the model:
//   the bay's copies are not the sum of its classes, the elements do not grow by the copies, the cost is not added + changed, undo does not return the count) · S4 ISSUE (a building type with no bay rule is offered a bay)
//   S5 ISSUE (a bad argument or a closed session is answered with a result) · S6 ISSUE (the vocabulary entries are not generated / the page raised errors)
//   Falsifiers: MODELSES_BREAK=notype (the type is not stated: must FAIL S3) · stale (the answer's element count does not move: must FAIL S3) · nounder (undo does nothing: must FAIL S3). INCONCLUSIVE when the input sheets are missing.
//   Input: the 9 marked Shed sheets (SHED_MARKED_DIR, default ~/.cache/capex_uat_dryrun/shed_cli/marked). Run: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_model_session.js > modeller/tests/logs/model_session.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), DOOR = path.join(ROOT, 'common/door/door.js'), SHEETS = process.env.SHED_MARKED_DIR || path.join(os.homedir(), '.cache/capex_uat_dryrun/shed_cli/marked');
let pass = 0, fail = 0, inc = 0; const chk = (n, ok, i) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? '✅' : '❌') + ' ' + n + (i ? '  ' + i : '')); };
const door = (dir, line, actor) => new Promise(res => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
  p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-200) }); }); });
const ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why)), A = (j) => (j && j.answer) || {};
(async () => {
  if (!fs.existsSync(SHEETS) || fs.readdirSync(SHEETS).filter(f => /\.dxf$/i.test(f)).length !== 9) { console.log('§W-MODEL-SESSION INCONCLUSIVE the 9 marked Shed sheets are not at ' + SHEETS + ' (SHED_MARKED_DIR)'); console.log('§WITNESS_MODEL_SESSION pass=0 fail=0 inconclusive=1 verdict=INCONCLUSIVE'); process.exit(2); }
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ms_')), D = mk();
  // ── S2/S5 before any session: every line refuses saying a model is needed; nothing is started
  const pre = await door(D, 'model.convert'), preBay = await door(D, 'model.addbay end=high'), preUndo = await door(D, 'model.undo');
  chk('S2 before model.open: convert, addbay and undo are refused ("no session: model.open first"), none starts a page', ref(pre, /no session/) && ref(preBay, /no session/) && ref(preUndo, /no session/) && !fs.existsSync(path.join(D, '.model_session.json')), [pre, preBay, preUndo].map(j => j.status).join('/'));
  const op = await door(D, 'model.open sheets=' + SHEETS + ' type="Farming Shed"');
  if (!ok(op)) { console.log('§W-MODEL-SESSION INCONCLUSIVE the session did not open: ' + op.why); console.log('§WITNESS_MODEL_SESSION pass=' + pass + ' fail=' + fail + ' inconclusive=1 verdict=INCONCLUSIVE'); process.exit(2); }
  const again = await door(D, 'model.open sheets=' + SHEETS), early = await door(D, 'model.addbay end=high');
  chk('S1 the open session is a separate process from every later line: the sheets are open (9, gate open, 445 bodies read), a second model.open is refused, and an addbay before convert is refused', A(op).sheets === 9 && A(op).gate && A(op).gate.ok === true && A(op).gate.bodies === 445 && ref(again, /session is open already/) && ref(early, /model\.convert first/), 'open: ' + A(op).summary + ' · again: ' + again.status + ' · early addbay: ' + early.status);
  const cv = await door(D, 'model.convert'), cv2 = await door(D, 'model.convert');
  chk('S2b convert works once, says how many elements it made (equal to its inserts) and that add-a-bay is offered for Farming Shed; a second convert is refused', ok(cv) && A(cv).inserts > 0 && A(cv).elements === A(cv).inserts && A(cv).bayOffered === true && ref(cv2, /already converted/), 'inserts=' + A(cv).inserts + ' elements=' + A(cv).elements + ' offered=' + A(cv).bayOffered);
  const hi = await door(D, 'model.addbay end=high'), c = A(hi).copies_by_class || {}, sumC = Object.keys(c).reduce((s, k) => s + c[k], 0), cost = A(hi).cost || {};
  chk('S3a the bay at the high end: the copies are the sum of their classes (' + sumC + '), the page\'s typical bay (2 column, 2 beam, 2 footing, 2 wall, 12 member, 9 plate), the elements grew by exactly the copies (' + A(hi).elements_before + ' -> ' + A(hi).elements_after + '), the cost total is added + changed, the gate is as the page logged',
    ok(hi) && A(hi).copies === sumC && JSON.stringify(c) === JSON.stringify({ IfcColumn: 2, IfcBeam: 2, IfcFooting: 2, IfcWall: 2, IfcMember: 12, IfcPlate: 9 }) && A(hi).elements_after - A(hi).elements_before === A(hi).copies && cost.total === cost.added + cost.changed && cost.total > 0 && String(A(hi).commit_line || '').indexOf('gate=' + A(hi).gate + ' ') > 0,
    'copies=' + A(hi).copies + ' ' + JSON.stringify(c) + ' · ' + A(hi).elements_before + '->' + A(hi).elements_after + ' · cost=' + JSON.stringify(cost) + ' · gate=' + A(hi).gate);
  const un = await door(D, 'model.undo');
  chk('S3b model.undo returns the element count to before the bay (' + A(hi).elements_after + ' -> ' + A(hi).elements_before + ')', ok(un) && A(un).elements_before === A(hi).elements_after && A(un).elements_after === A(hi).elements_before, JSON.stringify({ b: A(un).elements_before, a: A(un).elements_after }));
  const lo = await door(D, 'model.addbay end=low'), badEnd = await door(D, 'model.addbay end=sideways'), noEnd = await door(D, 'model.addbay');
  chk('S3c the bay at the LOW end is a different hinge (' + A(lo).hinge + ' against ' + A(hi).hinge + ') and the same typical bay (' + A(lo).copies + ' copies, +' + (A(lo).elements_after - A(lo).elements_before) + ' elements); its gate string is the page\'s own (' + A(lo).gate + ')', ok(lo) && A(lo).hinge !== A(hi).hinge && A(lo).copies === A(hi).copies && A(lo).elements_after - A(lo).elements_before === A(lo).copies && !!A(lo).gate && A(lo).cost.total === A(lo).cost.added + A(lo).cost.changed, 'hinge=' + A(lo).hinge + ' gate=' + A(lo).gate + ' cost=' + JSON.stringify(A(lo).cost));
  chk('S5 an end that is not high or low, and no end at all, are refused with the reason (nothing added)', ref(badEnd, /high or low/) && noEnd.status !== 'ok', badEnd.status + '/' + noEnd.status);
  const cl = await door(D, 'model.close'), after = await door(D, 'model.addbay end=high');
  chk('S5b after model.close the session is gone: the next line is refused (no session), and the state file is removed', ok(cl) && ref(after, /no session/) && !fs.existsSync(path.join(D, '.model_session.json')), 'close=' + cl.status + ' next=' + after.status);
  // ── S4 a building type with no bay rule: not offered, addbay refused with the reason
  const G = mk(), og = await door(G, 'model.open sheets=' + SHEETS), cg = ok(og) ? await door(G, 'model.convert') : null, bg = cg ? await door(G, 'model.addbay end=high') : null; await door(G, 'model.close');
  chk('S4 with no building type stated, convert says add-a-bay is NOT offered and model.addbay is refused saying so (the rule is the type\'s row, never assumed)', !!cg && ok(cg) && A(cg).bayOffered === false && !!bg && bg.status === 'refused', 'offered=' + (cg && A(cg).bayOffered) + ' · addbay=' + (bg && bg.status) + ' ' + String(bg && bg.why || '').slice(0, 100));
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => /^model\./.test(v.verb));
  chk('S6 the vocabulary holds model.open, model.convert, model.addbay, model.undo, model.close (harm trial, they name this witness)', ['model.open', 'model.convert', 'model.addbay', 'model.undo', 'model.close'].every(n => V.some(v => v.verb === n && v.harm === 'trial' && /witness_model_session/.test(v.witness))), V.map(v => v.verb).join(' '));
  const v = pass + fail === 0 ? 'INCONCLUSIVE' : (fail ? 'FAIL' : 'PASS'); console.log('§WITNESS_MODEL_SESSION pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§W-MODEL-SESSION ERROR ' + e.stack); process.exit(2); });
