// ⚠ DO NOT REMOVE — W-RED1-VO (bim-compiler prompts/CLI_ERP_IVR.md §29.4, step P6: `vo` in the building = the model's change as a Variation Order; approval = the order's DocAction). READ THE LOG; an exit code is not evidence.
//   The door has no model EDITS (the Modeller's GEOM ops are not at the prompt), so the model's change is the priced difference between the selection and what the Project Order HOLDS (its lines plus the Variation Orders already on it),
//   class by class, both sides from the post's own fold. A witness makes a change the way a PM's scope grows: it posts the order for ONE storey (`storey=*1`) and then asks for the VO of the wider selection (`storey=Level*`).
//   V1 ISSUE (a model that prices as the order holds still produces a VO, or the door writes when nothing differs): `vo storey=*1` straight after `post storey=*1` writes NOTHING (the op-log is byte-equal) and says so
//   V2 ISSUE (the VO is not the priced difference): `vo storey=Level*` issues a DRAFT purchase-side C_Order of the project (doc type POO, accounting date set) whose lines are, class by class, round2(fresh post of Level* - the order's line total),
//      where the fresh post is a SECOND, independent door run on its own op-log; its GrandTotal is the sum of its lines; and PlannedAmt(order) + GrandTotal is within half a cent per line of the fresh post's PlannedAmt
//   V3 ISSUE (the offer is not the engine's, or runs something else): after `cost storey=Level*` the session offers `issue a Variation Order? y/N -> <line>` exactly when the model differs (and `cost storey=*1` offers nothing); after the VO
//      it offers `Approve the Variation Order? y/N -> do CO <no>`; `n` runs nothing; a second `vo` with the VO in place finds no difference (the VO is part of what the order holds)
//   V4 ISSUE (approval bypasses the order's own engine, or the engine cannot complete what the fold made): `do CO <no>` prints `→ erp.complete kind=Order number=<no>`, the legacy-ported engine completes it (DocStatus CO: before the fold set the
//      document type and the accounting date it answered `No Document Type` and then `@PeriodClosed@`), the offer's `y` runs the same line, and the contract sum (proj_control) then reads approvedVOs = the VO's GrandTotal, pending 0, revised = original + VO
//   Falsifiers: POST_BREAK=novo (the difference is lost: must FAIL V2) · OFFER_BREAK=always (an offer whatever the engine says: must FAIL V3)
//   Run: node common/door/tests/witness_red1_vo.js > common/door/tests/logs/red1_vo.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-VO'), RED1 = path.join(ROOT, 'common/door/red1.js'), BD = require(path.join(ROOT, 'erp/bigdecimal.js')), bd = (x) => BD.of(String(x)), r2 = (x) => bd(x).setScale(2, BD.RoundingMode.HALF_UP);
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1vo_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const spawn = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const session = (lines, env) => spawn([RED1], env, lines.join('\n') + '\n');
const door = (line, env) => { const r = spawn([DOOR, '--actor', 'human', line], env), j = r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).pop(); return j || { status: 'unparseable', why: (r.out + r.err).slice(-300) }; };
const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
const bytes = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG); } catch (x) { return Buffer.alloc(0); } };
const rows = (j) => (j.answer && j.answer.rows) || [];
const NARROW = 'storey=*1', WIDE = 'storey=Level*';
// the lines of a project, summed per class (the product's name is "<class> (BIM)": the class is its Value, read with names=Y as the name)
const byClass = (env, pid) => { const m = {}; rows(door('mis.list kind="Project Line" columns=M_Product_ID,PlannedAmt names=Y limit=500 master=Project/' + pid, env)).forEach(r => { const c = String(r.M_Product_ID).replace(/ \(BIM\)$/, ''); m[c] = (m[c] || BD.ZERO).add(bd(r.PlannedAmt)); }); return m; };
(async () => {
  const PS = require(path.join(ROOT, 'viewer/proj_order_state.js')), KEY = PS.projectKey('Duplex', null), NO = 'VO-' + KEY + '-001';
  const E = fresh(), E2 = fresh();
  const p1 = spawn([RED1, 'cd Duplex; post ' + NARROW], E), m1 = /Posted Duplex: Project (\d+), PlannedAmt ([\d.]+)/.exec(p1.err + p1.out);
  const p2 = spawn([RED1, 'cd Duplex; post ' + WIDE], E2), m2 = /Posted Duplex: Project (\d+), PlannedAmt ([\d.]+)/.exec(p2.err + p2.out);
  if (!m1 || !m2) { k.incon('V1-V4', 'a post did not run: ' + (p1.err + p1.out + p2.err + p2.out).slice(-300)); return k.end(); }
  const pid = m1[1], narrowAmt = m1[2], wideAmt = m2[2], narrow = byClass(E, pid), wide = byClass(E2, m2[1]);
  k.L('narrow ' + NARROW + ' project ' + pid + ' PlannedAmt ' + narrowAmt + ' classes ' + Object.keys(narrow).length + ' · wide ' + WIDE + ' project ' + m2[1] + ' PlannedAmt ' + wideAmt + ' classes ' + Object.keys(wide).length);
  // V1: the same selection again
  const b0 = bytes(E), same = spawn([RED1, 'cd Duplex; vo ' + NARROW], E), b1 = bytes(E);
  k.chk('V1 `vo ' + NARROW + '` right after `post ' + NARROW + '` says no Variation Order and writes nothing (op-log byte-equal)', /No Variation Order: the model prices as/.test(same.out + same.err) && Buffer.compare(b0, b1) === 0 && b0.length > 0, 'bytes ' + b0.length + '->' + b1.length);
  // V3 first half: what `cost` offers, on both selections; then the session that issues the VO and answers the approval offer with n
  const costNarrow = session(['cd Duplex', 'cost ' + NARROW], E), costWide = session(['cd Duplex', 'cost ' + WIDE], E);
  const OFFER = /The model differs from the Project Order: issue a Variation Order\? y\/N → (.*)/, VOLINE = 'erp.process name="Variation Order" Building=Duplex Selection="' + WIDE + '"';
  const oW = OFFER.exec(costWide.out), oN = /y\/N → (.*)/.exec(costNarrow.out);   // oN: ANY offer after the narrow cost
  const S = session(['cd Duplex', 'vo ' + WIDE, 'y', 'n'], E), A = S.out, LINE = 'erp.complete kind=Order number=' + NO;
  const approve = /Approve the Variation Order\? y\/N → (.*)/.exec(A), notDone = /not done: (.*)/.exec(A);
  k.L('V3 offers: cost(wide)=' + JSON.stringify(oW && oW[1]) + ' cost(narrow)=' + JSON.stringify(oN && oN[1]) + ' approve=' + JSON.stringify(approve && approve[1]) + ' notDone=' + JSON.stringify(notDone && notDone[1]));
  // V2: the VO the session issued (still a draft: `n` approved nothing)
  const vo = rows(door('mis.list kind=Order columns=C_Order_ID,DocumentNo,DocStatus,GrandTotal,C_Project_ID,C_DocTypeTarget_ID,IsSOTrx,DateAcct DocumentNo=VO-*', E))[0];
  let v2ok = false, info = 'no VO order';
  if (vo) {
    const ct = (door('mis.describe kind=Order', E).answer || {}).childTabs || [], lt = ct.filter(t => /Order Line/.test(t.tab))[0];
    const lines = lt ? rows(door('mis.list kind="' + lt.kind + '" columns=M_Product_ID,LineNetAmt names=Y limit=500 master=Order/' + vo.C_Order_ID, E)) : [];
    const got = {}; lines.forEach(l => { got[String(l.M_Product_ID).replace(/ \(BIM\)$/, '')] = bd(l.LineNetAmt); });
    const want = {}; Object.keys(wide).concat(Object.keys(narrow)).filter((c, i, a) => a.indexOf(c) === i).forEach(c => { const d = (wide[c] || BD.ZERO).subtract(narrow[c] || BD.ZERO); if (d.abs().compareTo(bd('0.005')) > 0) want[c] = r2(d); });
    const same2 = Object.keys(want).length > 0 && Object.keys(want).length === Object.keys(got).length && Object.keys(want).every(c => got[c] && got[c].compareTo(want[c]) === 0);
    const sumL = lines.reduce((a, l) => a.add(bd(l.LineNetAmt)), BD.ZERO), gap = bd(narrowAmt).add(bd(vo.GrandTotal)).subtract(bd(wideAmt)).abs();
    v2ok = same2 && sumL.compareTo(bd(vo.GrandTotal)) === 0 && vo.DocStatus === 'DR' && String(vo.IsSOTrx) === 'N' && String(vo.C_Project_ID) === pid && vo.C_DocTypeTarget_ID != null && vo.DateAcct != null && vo.DocumentNo === NO && gap.compareTo(bd('0.005').multiply(bd(Math.max(1, lines.length)))) <= 0;
    info = 'lines ' + lines.length + ' want ' + Object.keys(want).length + ' per-class equal ' + same2 + ' Σlines ' + sumL + ' GrandTotal ' + vo.GrandTotal + ' status ' + vo.DocStatus + ' doctype ' + vo.C_DocTypeTarget_ID + ' · PlannedAmt ' + narrowAmt + ' + VO = ' + bd(narrowAmt).add(bd(vo.GrandTotal)) + ' vs fresh ' + wideAmt + ' (gap ' + gap + ')';
  }
  k.chk('V2 `vo ' + WIDE + '` after `post ' + NARROW + '`: a DRAFT purchase C_Order ' + NO + ' of project ' + pid + ', its lines the per-class priced difference to a fresh independent post (round2), GrandTotal = Σ lines, PlannedAmt + VO within half a cent per line of the fresh post', v2ok, info);
  // V3: a second vo with the VO in place; the offers
  const S2 = session(['cd Duplex', 'vo ' + WIDE, 'y'], E), again = /No Variation Order: the model prices as/.test(S2.out + S2.err), nAfter = rows(door('mis.list kind=Order columns=DocumentNo DocumentNo=VO-*', E)).length;
  k.chk('V3 the offers are the engine\'s: `cost ' + WIDE + '` offers `' + VOLINE + '` and `cost ' + NARROW + '` offers none; after the VO: `Approve the Variation Order? y/N → ' + LINE + '`, `n` runs nothing; a second `vo ' + WIDE + '` finds no difference (the VO is part of what the order holds) and makes no second order',
    !!oW && oW[1].trim() === VOLINE && !oN && !!approve && approve[1].trim() === LINE && !!notDone && notDone[1].trim() === LINE && again && nAfter === 1, 'second vo says no VO: ' + again + ' · VO orders ' + nAfter);
  // V4: approval = the order's own DocAction: the typed word (do CO <no>) and the offer's y run the same line; the engine completes it; the contract sum moves
  const Ap = session(['cd Order', 'do CO ' + NO], E), arrow = (Ap.out.match(/^→ erp\.complete .*$/mg) || [])[0], after = rows(door('mis.list kind=Order columns=DocumentNo,DocStatus,GrandTotal DocumentNo=VO-*', E))[0];
  const st = door('erp.project_status id=' + pid, E).answer, c = st && st.contract;
  const E3 = fresh(); spawn([RED1, 'cd Duplex; post ' + NARROW], E3);
  const Y = session(['cd Duplex', 'vo ' + WIDE, 'y', 'y'], E3), yArrow = (Y.out.match(/^→ erp\.complete .*$/mg) || []), after3 = rows(door('mis.list kind=Order columns=DocumentNo,DocStatus DocumentNo=VO-*', E3))[0];
  k.L('V4 typed arrow ' + JSON.stringify(arrow) + ' · after ' + JSON.stringify(after) + ' · contract ' + JSON.stringify(c) + ' · offer-y arrow ' + JSON.stringify(yArrow) + ' ' + JSON.stringify(after3));
  k.chk('V4 approval is the order\'s own DocAction: `do CO ' + NO + '` prints `→ ' + LINE + '` and the engine completes it (CO); the offer\'s `y` runs that same line; the contract sum then reads approvedVOs = ' + (vo && vo.GrandTotal) + ', pending 0, revised = original + VO',
    !!vo && arrow === '→ ' + LINE && !!after && after.DocStatus === 'CO' && !!c && bd(c.approvedVOs).compareTo(bd(vo.GrandTotal)) === 0 && bd(c.pendingVOs).signum() === 0 && bd(c.revised).compareTo(bd(c.original).add(bd(vo.GrandTotal))) === 0 && yArrow.length === 1 && yArrow[0] === '→ ' + LINE && !!after3 && after3.DocStatus === 'CO',
    (after && after.DocStatus) + ' · approved ' + (c && c.approvedVOs) + ' pending ' + (c && c.pendingVOs) + ' revised ' + (c && c.revised) + ' original ' + (c && c.original));
  k.end();
})().catch(e => { console.log('§W-RED1-VO FAIL ' + (e && e.stack || e)); process.exit(1); });
