// ⚠ DO NOT REMOVE — W-RED1-CLAIM (bim-compiler prompts/CLI_ERP_IVR.md §29.4, step P7: `claim` in a project = a progress claim, an invoice draft + the preview of its accounting). READ THE LOG; an exit code is not evidence.
//   Every door run here carries its OWN temp op-log AND journal (fresh()); a witness that touched the owner's default op-log would be a defect.
//   C1 ISSUE (the claim bills the wrong thing): after `post` and marking ONE phase complete through the prompt (`set <id> IsComplete=Y`), `claim` makes ONE draft AP invoice (DocStatus DR, IsSOTrx N, the project's) with ONE line, LineNetAmt = that
//      phase's PlannedAmt at the currency's precision (an independent read of the phase), GrandTotal = Σ lines, the project's InvoicedAmt = the claim, and `erp.project_status` then reads AC = the claim and CPI = EV/AC (4 dp)
//   C2 ISSUE (the books do not balance, or the preview is empty): the answer's accounting preview has lines, every one a Dr or a Cr, and Σ Dr == Σ Cr == the invoice's GrandTotal == an independent sum of the invoice lines (BigDecimal); nothing is posted (no Fact_Acct row for the invoice)
//   C3 ISSUE (a phase is billed twice, or a claim with nothing new writes): a second `claim` with no new phase says so and writes nothing (op-log byte-equal); after a second phase is marked complete, `claim` bills ONLY that phase and InvoicedAmt = both claims
//   C4 ISSUE (the word works where it cannot, or expands to something else): in the Project record `claim` prints `→ erp.process name="Progress Claim" record=<id> kind=Project` and asks y/N first (nothing written until y); in the Project Phase tab and in an Order it is refused naming the Project
//   Falsifiers: CLAIM_BREAK=unbalance (a cent added to a credit: must FAIL C2, the process then refuses and no invoice is made) · CLAIM_BREAK=shortline (the last invoice line is lost from the ops: must FAIL C1)
//   Run: node common/door/tests/witness_red1_claim.js > common/door/tests/logs/red1_claim.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-CLAIM'), RED1 = path.join(ROOT, 'common/door/red1.js'), BD = require(path.join(ROOT, 'erp/bigdecimal.js')), bd = (x) => BD.of(String(x)), r2 = (x) => bd(x).setScale(2, BD.RoundingMode.HALF_UP);
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1cl_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const spawn = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const session = (lines, env) => spawn([RED1], env, lines.join('\n') + '\n');
const jlast = (o) => o.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).pop();
const door = (line, env) => { const r = spawn([DOOR, '--actor', 'human', line], env); return jlast(r.out) || { status: 'unparseable', why: (r.out + r.err).slice(-300) }; };
const rows = (j) => (j.answer && j.answer.rows) || [];
const bytes = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG); } catch (x) { return Buffer.alloc(0); } };
const phases = (env, pid) => rows(door('mis.list kind="Project Phase" columns=C_ProjectPhase_ID,Name,PlannedAmt,SeqNo sort=SeqNo master=Project/' + pid, env));
const invoices = (env) => rows(door('mis.list kind=C_Invoice columns=C_Invoice_ID,DocumentNo,DocStatus,GrandTotal,TotalLines,C_Project_ID,IsSOTrx DocumentNo=CLAIM-*', env));
const invLines = (env, id) => rows(door('mis.list kind=C_InvoiceLine columns=C_InvoiceLine_ID,LineNetAmt,C_ProjectPhase_ID limit=100 C_Invoice_ID=' + id, env));
const invoiced = (env, pid) => { const r = door('mis.read kind=Project id=' + pid, env); return r.answer && r.answer.record ? r.answer.record.invoicedamt : null; };
(async () => {
  const E = fresh(), post = spawn([RED1, 'cd Duplex; post storey=*1'], E), m = /Posted Duplex: Project (\d+), PlannedAmt ([\d.]+)/.exec(post.err + post.out);
  if (!m) { k.incon('C1-C4', 'the post that makes the project did not run: ' + (post.err + post.out).slice(-300)); return k.end(); }
  const pid = m[1], P = phases(E, pid).filter(p => Number(p.PlannedAmt) > 0);
  if (P.length < 2) { k.incon('C1-C3', 'the project has ' + P.length + ' phase(s) with an amount: too few to claim twice'); return k.end(); }
  const [ph1, ph2] = P, one = (cmd) => spawn([RED1, 'cd Project ' + pid + '; ' + cmd], E);
  one('cd Phase; set ' + ph1.C_ProjectPhase_ID + ' IsComplete=Y');
  const c1 = one('claim'), env1 = jlast(c1.out), obj = env1 && env1.answer && env1.answer.object, inv = invoices(E);
  k.L('claim 1: ' + (env1 ? env1.status : 'no envelope') + ' ' + (env1 && env1.answer && env1.answer.summary || env1 && env1.why || '').split('\n')[0]);
  const lines = inv[0] ? invLines(E, inv[0].C_Invoice_ID) : [], want = r2(ph1.PlannedAmt);
  const st = door('erp.project_status id=' + pid, E).answer, e = st && st.evm;
  const cpiWant = e && e.ac && bd(e.ac).signum() !== 0 ? bd(e.ev).divide(bd(e.ac), 4, BD.RoundingMode.HALF_UP).toString() : null;
  // C1
  const ok1 = inv.length === 1 && inv[0].DocStatus === 'DR' && String(inv[0].IsSOTrx) === 'N' && String(inv[0].C_Project_ID) === pid && lines.length === 1 && bd(lines[0].LineNetAmt).compareTo(want) === 0 && String(lines[0].C_ProjectPhase_ID) === String(ph1.C_ProjectPhase_ID)
    && bd(inv[0].GrandTotal).compareTo(lines.reduce((a, l) => a.add(bd(l.LineNetAmt)), BD.ZERO)) === 0 && !!e && bd(invoiced(E, pid)).compareTo(want) === 0 && bd(e.ac).compareTo(want) === 0 && e.cpi === cpiWant && cpiWant !== null;
  k.chk('C1 one phase complete (' + ph1.Name + ', ' + ph1.PlannedAmt + '), `claim`: ONE draft AP invoice, ONE line = ' + want + ' for that phase, GrandTotal = Σ lines, InvoicedAmt = the claim, status reads AC ' + want + ' and CPI EV/AC',
    ok1, 'invoices ' + inv.length + ' ' + (inv[0] ? inv[0].DocumentNo + ' ' + inv[0].DocStatus + ' ' + inv[0].GrandTotal : '') + ' · lines ' + lines.map(l => l.LineNetAmt).join(',') + ' · invoiced ' + invoiced(E, pid) + ' · cpi ' + (e && e.cpi) + ' want ' + cpiWant);
  // C2
  const pv = obj && obj.preview, sumLines = lines.reduce((a, l) => a.add(bd(l.LineNetAmt)), BD.ZERO), sD = pv && pv.lines.reduce((a, l) => a.add(bd(l.dr)), BD.ZERO), sC = pv && pv.lines.reduce((a, l) => a.add(bd(l.cr)), BD.ZERO);
  const fact = (() => { const r = door('mis.list kind=Fact_Acct columns=Fact_Acct_ID limit=1 Record_ID=' + (inv[0] ? inv[0].C_Invoice_ID : 0), E); return r.answer ? r.answer.total : null; })();
  k.L('C2 preview ' + JSON.stringify(pv && { lines: pv.lines, sumDr: pv.sumDr, sumCr: pv.sumCr, balances: pv.balances }) + ' fact rows ' + fact);
  k.chk('C2 the preview has lines, each a Dr or a Cr, and Σ Dr == Σ Cr == GrandTotal == the independent sum of the invoice lines (' + sumLines + '); nothing is posted',
    !!pv && pv.lines.length > 0 && pv.lines.every(l => (bd(l.dr).signum() > 0) !== (bd(l.cr).signum() > 0)) && sD.compareTo(sC) === 0 && sD.compareTo(sumLines) === 0 && !!inv[0] && sD.compareTo(bd(inv[0].GrandTotal)) === 0 && sumLines.signum() > 0 && fact === 0, 'Dr ' + sD + ' Cr ' + sC + ' lines ' + sumLines + ' fact_acct ' + fact);
  // C3
  const b0 = bytes(E), c2 = one('claim'), b1 = bytes(E);
  one('cd Phase; set ' + ph2.C_ProjectPhase_ID + ' IsComplete=Y');
  const c3 = one('claim'), inv3 = invoices(E).filter(i => !inv[0] || i.C_Invoice_ID !== inv[0].C_Invoice_ID), l3 = inv3[0] ? invLines(E, inv3[0].C_Invoice_ID) : [], total = r2(ph1.PlannedAmt).add(r2(ph2.PlannedAmt));
  k.L('C3 second claim (nothing new): ' + ((jlast(c2.out) || {}).answer || {}).summary + ' · third: ' + ((jlast(c3.out) || {}).answer || {}).summary);
  k.chk('C3 a claim with nothing new says so and writes nothing (op-log byte-equal); after ' + ph2.Name + ' is complete, `claim` bills ONLY it (' + r2(ph2.PlannedAmt) + ') and InvoicedAmt = ' + total,
    /Nothing to claim/.test(c2.out + c2.err) && Buffer.compare(b0, b1) === 0 && inv3.length === 1 && l3.length === 1 && String(l3[0].C_ProjectPhase_ID) === String(ph2.C_ProjectPhase_ID) && bd(l3[0].LineNetAmt).compareTo(r2(ph2.PlannedAmt)) === 0 && bd(invoiced(E, pid)).compareTo(total) === 0, 'bytes ' + b0.length + '->' + b1.length + ' · second invoice lines ' + l3.map(l => l.LineNetAmt).join(',') + ' · invoiced ' + invoiced(E, pid));
  // C4
  const E4 = fresh(); spawn([RED1, 'cd Duplex; post storey=*1'], E4);
  const Ses = session(['cd Project ' + pid, 'claim', 'n', 'cd Phase', 'claim', 'cd ..', 'cd ..', 'cd Order', 'claim'], E4), arrows = (Ses.out.match(/^→ erp\.process name="Progress Claim".*$/mg) || []), asks = (Ses.out.match(/^erp\.process name="Progress Claim".*run it\? y\/N$/mg) || []), refusals = (Ses.out.match(/^claim works in a Project .*$/mg) || []);
  k.L('C4 asks ' + JSON.stringify(asks) + ' arrows ' + JSON.stringify(arrows) + ' refusals ' + JSON.stringify(refusals));
  k.chk('C4 in the Project record `claim` asks `erp.process name="Progress Claim" record=' + pid + ' kind=Project   run it? y/N` and `n` runs nothing (no invoice); in the Project Phase tab and in an Order it is refused naming the Project',
    asks.length === 1 && asks[0].indexOf('erp.process name="Progress Claim" record=' + pid + ' kind=Project') === 0 && arrows.length === 0 && invoices(E4).length === 0 && refusals.length === 2 && /Project Phase/.test(refusals[0]) && /you are in Order/.test(refusals[1]), 'asks ' + asks.length + ' arrows ' + arrows.length + ' refusals ' + refusals.length);
  k.end();
})().catch(e => { console.log('§W-RED1-CLAIM FAIL ' + (e && e.stack || e)); process.exit(1); });
