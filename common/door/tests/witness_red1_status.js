// ⚠ DO NOT REMOVE — W-RED1-STATUS (bim-compiler prompts/CLI_ERP_IVR.md §29.4, step P5: `status` in a project = its earned value). READ THE LOG; an exit code is not evidence.
//   S1 ISSUE (the figures at the prompt are not the engine's): erp.project_status (and the table `status` draws) give the contract sum and the project's BAC / PV / EV / AC / CV / SV / CPI / SPI and each phase's
//      BAC / PV / EV / SV / SPI EXACTLY as viewer/proj_control.js gives them when called directly on the same database (replayed from the same op-log)
//   S2 ISSUE (the phases do not make the project): the printed table's per-phase BAC, PV, EV and SV add up to the PROJECT row (cent for cent, BigDecimal)
//   S3 ISSUE (a table that says nothing): the project judged has >= 3 phases, one is marked complete through the prompt (`set <id> IsComplete=Y`: EV = that phase's BAC, > 0), the date falls inside another phase
//      (0 < PV < BAC, so SPI is a real ratio), and the project's CPI is a dash (nothing invoiced), not a fake 0. A table with nothing to tell apart is INCONCLUSIVE.
//   S4 ISSUE (the word works where it cannot): `status` in the Project record prints the line `erp.project_status id=<id>`; in a tab of it (Project Phase) and in an Order it is refused naming the Project
//   Falsifiers: STATUS_BREAK=evdrift (EV one unit high in the answer: must FAIL S1) · STATUS_BREAK=skipphase (the first phase is left out of the table: must FAIL S2)
//   Run: node common/door/tests/witness_red1_status.js > common/door/tests/logs/red1_status.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-STATUS'), RED1 = path.join(ROOT, 'common/door/red1.js');
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1st_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const spawn = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const session = (lines, env) => spawn([RED1], env, lines.join('\n') + '\n');
const door = (line, env) => { const r = spawn([DOOR, '--actor', 'human', line], env), j = r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).pop(); return j || { status: 'unparseable', why: (r.out + r.err).slice(-300) }; };
const BD = require(path.join(ROOT, 'erp/bigdecimal.js')), bd = (x) => BD.of(String(x));
const day = (s) => Date.UTC(+String(s).slice(0, 4), +String(s).slice(5, 7) - 1, +String(s).slice(8, 10)) / 86400000, iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
(async () => {
  const E = fresh(), post = spawn([RED1, 'cd Duplex; post discipline=ARC'], E), posted = /Posted Duplex: Project (\d+), PlannedAmt ([\d.]+)/.exec(post.err + post.out);
  if (!posted) { k.incon('S1-S4', 'the post that makes the project did not run: ' + (post.err + post.out).slice(-300)); return k.end(); }
  const pid = posted[1], ph = door('mis.list kind="Project Phase" columns=C_ProjectPhase_ID,Name,StartDate,EndDate,PlannedAmt,SeqNo sort=SeqNo master=Project/' + pid, E), P = (ph.answer && ph.answer.rows) || [];
  // the phase the date falls INSIDE: the first with a window of two days or more (so one day in is a real fraction); the phase marked complete: the first other one with an amount
  const w = P.filter(p => p.StartDate && p.EndDate && Number(p.PlannedAmt) > 0 && day(p.EndDate) - day(p.StartDate) >= 2), inside = w[0], done = inside && P.filter(p => Number(p.PlannedAmt) > 0 && p.C_ProjectPhase_ID !== inside.C_ProjectPhase_ID)[0];
  if (P.length < 3 || !inside || !done) { k.incon('S3', 'the project has ' + P.length + ' phases, ' + w.length + ' with a window of 2+ days and an amount: too few to tell PV, EV and SPI apart'); return k.end(); }
  const asOf = iso(day(inside.StartDate) + 1);
  const S = session(['cd Project ' + pid, 'cd Phase', 'set ' + done.C_ProjectPhase_ID + ' IsComplete=Y', 'cd ..', 'status asof=' + asOf, 'cd Phase', 'status', 'cd ..', 'cd ..', 'cd Order', 'status'], E);
  const env = door('erp.project_status id=' + pid + ' asof=' + asOf, E), A = env.answer;
  k.L('inside=' + inside.Name + ' [' + inside.StartDate + '..' + inside.EndDate + '] complete=' + done.Name + ' asOf=' + asOf);
  if (!A) { k.incon('S1-S3', 'no answer: ' + JSON.stringify(env).slice(0, 300)); return k.end(); }
  // S1: the engine, called directly on the database the door booted (the same op-log replayed)
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js')), PC = require(path.join(ROOT, 'viewer/proj_control.js'));
  Object.assign(process.env, E);
  const quiet = async (fn) => { const wr = process.stderr.write, l = console.log; process.stderr.write = () => true; console.log = () => {}; try { return await fn(); } finally { process.stderr.write = wr; console.log = l; } };
  const O = await quiet(() => EC.boot({ oplog: E.BIM_OBJECT_OPLOG })), direct = { contract: PC.contractSum(O.db, Number(pid)), evm: PC.evm(O.db, Number(pid), asOf), phases: PC.evmByPhase(O.db, Number(pid), asOf) };
  const strip = (e) => { const o = Object.assign({}, e); delete o.asOf; return JSON.stringify(o); };
  const same = strip(A.evm) === strip(direct.evm) && JSON.stringify(A.contract) === JSON.stringify(direct.contract) && JSON.stringify(A.phases) === JSON.stringify(direct.phases);
  // the printed table (what the person reads): the project row and the phase rows, parsed from the session
  const L = S.out.split('\n'), i0 = L.findIndex(l => /^phase\s+BAC\s+PV\s+EV\s+SV\s+SPI/.test(l)), tab = [];
  for (let j = i0 + 1; i0 >= 0 && j < L.length && L[j].trim(); j++) { const m = /^(.*?)\s{2,}(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/.exec(L[j]); if (m) tab.push({ name: m[1].trim(), bac: m[2], pv: m[3], ev: m[4], sv: m[5], spi: m[6] }); }
  const proj = tab.filter(r => r.name === 'PROJECT')[0], rows = tab.filter(r => r.name !== 'PROJECT');
  const printedSame = !!proj && proj.bac === direct.evm.bac && proj.pv === direct.evm.pv && proj.ev === direct.evm.ev && proj.sv === direct.evm.sv && (proj.spi === (direct.evm.spi == null ? '-' : direct.evm.spi))
    && rows.length === direct.phases.length && rows.every((r, i) => r.name === direct.phases[i].name && r.bac === direct.phases[i].bac && r.pv === direct.phases[i].pv && r.ev === direct.phases[i].ev && r.sv === direct.phases[i].sv && r.spi === (direct.phases[i].spi == null ? '-' : direct.phases[i].spi));
  k.L('S1 envelope evm=' + JSON.stringify(A.evm) + ' direct evm=' + JSON.stringify(direct.evm));
  k.chk('S1 erp.project_status == proj_control called directly (contract sum, project EVM, ' + direct.phases.length + ' phases), and the drawn table prints those same figures', same && printedSame, 'envelope==direct ' + same + ' · table==direct ' + printedSame + ' · rows ' + rows.length);
  // S2
  const sum = (key) => rows.reduce((a, r) => a.add(bd(r[key])), BD.ZERO).toString();
  const add = ['bac', 'pv', 'ev', 'sv'].map(c => [c, sum(c), proj && proj[c]]);
  k.L('S2 ' + add.map(x => x[0] + ' Σ=' + x[1] + ' project=' + x[2]).join(' · '));
  k.chk('S2 the phases make the project: Σ BAC, PV, EV, SV of the printed phase rows == the PROJECT row (BigDecimal)', !!proj && rows.length > 0 && add.every(x => bd(x[1]).compareTo(bd(x[2])) === 0), add.map(x => x[0] + ' ' + x[1] + '/' + x[2]).join(' '));
  // S3
  const pIn = direct.phases.filter(p => p.id === Number(inside.C_ProjectPhase_ID))[0], pDone = direct.phases.filter(p => p.id === Number(done.C_ProjectPhase_ID))[0];
  const ok3 = !!pIn && !!pDone && direct.phases.length >= 3 && bd(pIn.pv).compareTo(BD.ZERO) > 0 && bd(pIn.pv).compareTo(bd(pIn.bac)) < 0 && pDone.complete === true && bd(pDone.ev).compareTo(BD.ZERO) > 0 && pDone.ev === pDone.bac && direct.evm.cpi === null && proj && proj.spi !== '-' && printedSame;
  k.L('S3 inside ' + JSON.stringify(pIn && { pv: pIn.pv, bac: pIn.bac, spi: pIn.spi }) + ' complete ' + JSON.stringify(pDone && { ev: pDone.ev, bac: pDone.bac, spi: pDone.spi }) + ' project cpi=' + direct.evm.cpi);
  if (!pIn || !pDone) k.incon('S3', 'the judged phases are not in the engine\'s answer');
  else k.chk('S3 the table tells things apart: a phase mid-schedule (0 < PV < BAC), one complete (EV = BAC > 0) through the prompt, CPI a dash (nothing invoiced)', ok3, 'inside pv ' + pIn.pv + '/' + pIn.bac + ' · done ev ' + pDone.ev + ' · cpi ' + direct.evm.cpi);
  // S4
  const arrows = (S.out.match(/^→ erp\.project_status .*$/mg) || []), refusals = (S.out.match(/^status works in a Project .*$/mg) || []);
  k.L('S4 arrows ' + JSON.stringify(arrows) + ' refusals ' + JSON.stringify(refusals));
  k.chk('S4 `status` in the Project record prints `→ erp.project_status id=' + pid + ' asof=' + asOf + '`; in the Project Phase tab and in an Order it is refused naming the Project',
    arrows[0] === '→ erp.project_status id=' + pid + ' asof=' + asOf && refusals.length === 2 && /you are in Project Phase/.test(refusals[0]) && /you are in Order/.test(refusals[1]) && arrows.length === 1, arrows.join(' | '));
  k.end();
})().catch(e => { console.log('§W-RED1-STATUS FAIL ' + (e && e.stack || e)); process.exit(1); });
