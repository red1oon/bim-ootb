// ⚠ DO NOT REMOVE — W-RED1-RECORD (bim-compiler prompts/CLI_ERP_IVR.md §29.1, D15: the record as a place; step P4). READ THE LOG; an exit code is not evidence.
//   R1 ISSUE (the film: in a building `cd project` first ran object.describe and logged "no such table: c_project"; or lands in the Project WINDOW, not in the building's project): `cd project` in a posted building
//      runs ONE door line (erp.order_state), no object.describe, and the prompt reads `red1 Project/<name>>` with the record whose Value is the engine's own projectKey (an independent mis.list)
//   R2 ISSUE (ls in a record does not list its tabs, or counts them wrong): `ls` there prints exactly mis.describe's childTabs, each with the row count an independent reader gives (mis.list master=), at least one non-empty
//   R3 ISSUE (a tab is not the child rows of THIS record): `cd Phase` then `ls`/`count` carry master=Project/<id>, list exactly the record's phases (the count R2 printed), fewer than the whole table's
//   R4 ISSUE (cd .. does not go back one place at a time): tab -> record -> the kind's list -> the building
//   R5 ISSUE (the record's identity is retyped): in a record, `do CO` (no number) names the record's number, `cat` / `set Description=x` / `rm` its id, `run "Generate PO from Project"` its record and the parameter that is its key
//      (C_Project_ID), and that parameter is not asked; a TYPED key still wins
//   R6 ISSUE (cat dumps JSON): `cat` in a record prints the identifier, then the bottom-line (amount) columns in the window's own order, then the other shown columns as a two-column table, every value the record's own
//      (an independent mis.read), and no line is JSON
//   R7 ISSUE (record/tab handling is per window): the SAME words give Order -> its lines/tax and Business Partner -> its locations, counts equal an independent SQL on the seed (Order Tax under an order was 27 on main:
//      the tab's link was the table's FIRST IsParent column, C_Tax_ID, not the one that names the order)
//   R8 ISSUE (`cd <kind> <number|name>` finds the wrong record, or a miss is silent): "BIM: Hospital" (Name), Hospital (Value) and 990000 (id) are ONE record; a number that is no record is refused with the reason and the session stays in the kind
//   R9 ISSUE (§45: in a record, `do`/`next` name it by a DocumentNo that two records share, so every action is refused): on the seed, `cd Order 100` then `do RE` runs erp.reactivate with id=100 and answers ok (IP),
//      `do CO` brings it back to CO; the precondition (two Order records carry 80000) is read by an independent SQL, else INCONCLUSIVE. Falsifier WORDS_BREAK=recnumber (the old number-first fill): must FAIL R9
//   R10 ISSUE (§45 K3: in a kind, `cd <number>` is refused, so a menu walk cannot step into a record): menu -> Quote -> "Sales Orders" -> "Sales Order" -> `cd 100` enters order 100 (mis.read id=100) and the prompt keeps
//      the menu path (`.../Sales Orders/Order/80000>`); `cd ..` returns to `.../Order>`; in the kind `cd Foo` still says no building, kind or window is named "Foo". Falsifier WORDS_BREAK=nokindrec: must FAIL R10
//   R11 ISSUE (§50 (3): entering a record printed every guess, `→ mis.describe kind="Order 100"` and `→ mis.read kind=Order number=100` before the line that answered): `cd Order 100` prints exactly the three lines that
//      answered, and the §RED1 log names the two refused guesses. Falsifier RED1_BREAK=probes (every guess shown): must FAIL R11
//   Falsifiers: WORDS_BREAK=kindfirst (the link word tries the building kinds first: must FAIL R1) · WORDS_BREAK=nomaster (a tab is not filtered by its link: must FAIL R3) · WORDS_BREAK=norecfill (the record is not filled in: must FAIL R5)
//      · RECORD_BREAK=json (cat prints the record as JSON: must FAIL R6) · RECORD_BREAK=firstparent (a tab's link is the first IsParent column: must FAIL R7) · RECORD_BREAK=oneidentifier (only the first identifier column finds a record: must FAIL R8)
//   A claim with nothing to judge says INCONCLUSIVE, never PASS. Run: node common/door/tests/witness_red1_record.js > common/door/tests/logs/red1_record.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-RECORD'), RED1 = path.join(ROOT, 'common/door/red1.js');
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1rec_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const spawn = (argv, env, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const session = (lines, env) => spawn([RED1], env, lines.join('\n') + '\n');
const wheres = (err) => (err.match(/^§RED1 typed n=\d+ where=.*$/mg) || []).map(l => JSON.parse(l.replace(/^.*where=/, '')));
const arrows = (out) => (out.match(/^→ .*$/mg) || []).map(l => l.slice(2));
const door = (line, env) => { const r = spawn([DOOR, '--actor', 'human', line], env), j = r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).pop(); return j || { status: 'unparseable', why: (r.out + r.err).slice(-300) }; };
const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
const tabRows = (out) => { const L = out.split('\n'), i = L.findIndex(l => /^tab\s+records\s+link/.test(l)); if (i < 0) return null; const rows = []; for (let j = i + 1; j < L.length && /^\S/.test(L[j]) && !/^→|^ok ·|^\(/.test(L[j]); j++) { const m = /^(.*?)\s{2,}(\d+|-)\s{2,}(\S*)\s*$/.exec(L[j]); if (m) rows.push({ tab: m[1].trim(), n: m[2] === '-' ? null : Number(m[2]), link: m[3] }); } return rows; };
(async () => {
  // a posted Duplex on a throw-away op-log (the post is P3b: its own witness is W-POST-FOLD); the key the ERP holds it under is the ENGINE's
  const E = fresh(), PS = require(path.join(ROOT, 'viewer/proj_order_state.js')), KEY = PS.projectKey('Duplex', null);
  const post = spawn([RED1, 'cd Duplex; post discipline=ARC'], E);
  const posted = /Posted Duplex: Project (\d+), PlannedAmt ([\d.]+)/.exec(post.err + post.out);
  if (!posted) { k.incon('R1-R4', 'the post that makes the project did not run: ' + (post.err + post.out).slice(-300)); }
  else {
    const pid = posted[1], NAME = 'BIM: ' + KEY;
    const proj = door('mis.list kind=Project columns=C_Project_ID,Value,Name Value=' + KEY, E), prow = proj.answer && proj.answer.rows && proj.answer.rows[0];
    k.L('R1 posted project id=' + pid + ' independent mis.list Value=' + KEY + ' -> ' + JSON.stringify(prow));
    // R1 + R2 + R3 + R4 + R6 in one session on the posted project
    const S = session(['cd Duplex', 'cd project', 'pwd', 'ls', 'cat', 'cd Phase', 'pwd', 'count', 'ls', 'cd ..', 'cd ..', 'cd ..'], E), W = wheres(S.err), A = arrows(S.out);
    k.L('prompts ' + JSON.stringify(W));
    k.L('lines ' + JSON.stringify(A));
    const wantP = 'red1 Project/' + NAME + '>';
    k.chk('R1 `cd project` in Duplex: ONE link line (erp.order_state), no object.describe, the prompt is `' + wantP + '`, and that record is the project whose Value is the engine\'s projectKey',
      !!prow && String(prow.C_Project_ID) === pid && W[1] === wantP && A[0] === 'erp.order_state building=Duplex' && !A.some(l => /^object\.describe building=Duplex kind=project/.test(l)) && /id=\d+/.test(S.out) && S.out.indexOf('id=' + pid) >= 0,
      'prompt ' + W[1] + ' · first line ' + A[0] + ' · object.describe ' + A.some(l => /^object\.describe/.test(l)));
    // R2
    const tabs = tabRows(S.out), desc = door('mis.describe kind=Project', E), ct = desc.answer && desc.answer.childTabs;
    if (!tabs || !ct) k.incon('R2', 'no tab table or no describe: ' + (S.out.slice(0, 300)));
    else {
      const indep = ct.map(t => { const r = door('mis.list kind="' + t.kind + '" columns=' + t.link + ' limit=1 master=Project/' + pid, E); return { tab: t.tab, n: r.answer ? r.answer.total : null, link: t.link }; });
      k.L('R2 printed ' + JSON.stringify(tabs) + ' independent ' + JSON.stringify(indep));
      k.chk('R2 `ls` in the project = the ' + ct.length + ' child tabs of mis.describe, each with the count an independent mis.list master= gives; at least one is not empty',
        tabs.length === indep.length && tabs.every((t, i) => t.tab === indep[i].tab && t.n === indep[i].n && t.link === indep[i].link) && tabs.some(t => t.n > 0), tabs.map(t => t.tab + ' ' + t.n).join(' · '));
      // R3
      const ph = tabs.filter(t => /^Phase$/i.test(t.tab))[0], all = door('mis.list kind="Project Phase" columns=C_ProjectPhase_ID limit=1', E), allN = all.answer && all.answer.total;
      const dl = A.filter(l => /^mis\.list kind="Project Phase"/.test(l)), lsRows = (S.out.match(/^\d+\s+\S.*$/mg) || []).filter(l => /^99\d{4}\s/.test(l));
      const sh = (S.out.match(/shown (\d+) of (\d+) Project Phase/g) || []);
      k.L('R3 phase tab ' + (ph && ph.n) + ' whole table ' + allN + ' lines ' + JSON.stringify(dl) + ' ' + JSON.stringify(sh));
      if (!ph || !allN || allN <= ph.n) k.incon('R3', 'the whole table is not larger than the record\'s phases (' + allN + ' vs ' + (ph && ph.n) + '): nothing is told apart');
      else k.chk('R3 `cd Phase` then `count` and `ls` carry master=Project/' + pid + ' and list exactly the record\'s ' + ph.n + ' phases, not the whole table\'s ' + allN,
        dl.length === 2 && dl.every(l => l.indexOf('master=Project/' + pid) > 0) && sh.length === 2 && sh[1] === 'shown ' + ph.n + ' of ' + ph.n + ' Project Phase' && W[5] === 'red1 Project/' + NAME + '/Project Phase>', 'lines ' + dl.length + ' · ' + sh.join(' | '));
    }
    // R4
    k.chk('R4 `cd ..` goes back one place at a time: tab -> the record -> the Project list -> the building',
      W[5] === 'red1 Project/' + NAME + '/Project Phase>' && W[9] === wantP && W[10] === 'red1 Project>' && W[11] === 'red1 Duplex>', W.slice(5).join(' | '));
    // R6
    const rd = door('mis.read kind=Project id=' + pid, E), rec = rd.answer && rd.answer.record, L = S.out.split('\n'), ci = L.findIndex(l => /^bottom line\s+value/.test(l)), cj = L.findIndex(l => /^column\s+value/.test(l));
    if (!rec || ci < 0 && cj < 0 && !/^\{|^ "/m.test(S.out)) k.incon('R6', 'no record or no cat output');
    else {
      const rowsOf = (from, to) => L.slice(from + 1, to).filter(l => l.trim()).map(l => { const m = /^(\S+)\s{2,}(.*)$/.exec(l); return m ? [m[1], m[2].trim()] : null; }).filter(Boolean);
      const endB = L.findIndex((l, i) => i > ci && l.trim() === ''), bottom = ci >= 0 ? rowsOf(ci, endB < 0 ? L.length : endB) : [], rest = cj >= 0 ? rowsOf(cj, L.findIndex((l, i) => i > cj && (/^\(/.test(l) || /^→/.test(l))) < 0 ? L.length : L.findIndex((l, i) => i > cj && (/^\(/.test(l) || /^→/.test(l)))) : [];
      const same = (r) => { const v = rec[r[0].toLowerCase()]; return r[1] === '(none)' ? v == null : String(v) === r[1]; };
      const names = bottom.map(r => r[0]), wantOrder = ['PlannedAmt', 'PlannedMarginAmt', 'CommittedAmt', 'InvoicedAmt', 'ProjectBalanceAmt'];
      const noJson = !L.some(l => /^\s*[{"\[]/.test(l)) && !/"c_project_id"/.test(S.out);
      k.L('R6 bottom ' + JSON.stringify(bottom) + ' rest ' + rest.length + ' rows');
      k.chk('R6 `cat` in the project: identifier line, then ' + wantOrder.join(', ') + ' in the window\'s order, then ' + rest.length + ' more columns as a table; every value is the record\'s own (independent mis.read); no JSON',
        noJson && L.some(l => l.indexOf('Project ' + NAME + '  (C_Project_ID ' + pid + ')') === 0) && JSON.stringify(names) === JSON.stringify(wantOrder) && bottom.every(same) && rest.length > 5 && rest.every(same), 'bottom ' + names.join(',') + ' · json=' + !noJson);
    }
  }
  // R5: the words, pure (no door): a state IN a record, the expansion of each word
  {
    const R = require(RED1), sh = R.makeShell({ interactive: true, warm: false }), core = sh.core, ord = { id: 1200001, label: 'S00023', number: 'S00023' };
    const st0 = (o) => Object.assign(core.init(), { erp: 'Order', ekey: 'C_Order_ID', rec: ord, ecolumns: ['DocumentNo'], etabs: [] }, o || {});
    const line = (st, text) => { const r = core.step(st, { text }); return { line: r.effects[0] && r.effects[0].line, screen: r.screen, r }; };
    const dO = line(st0(), 'do CO'), cat = line(st0(), 'cat'), set = line(st0(), 'set Description=x'), typed = line(st0(), 'do CO 80000');
    const pj = (o) => st0(Object.assign({ erp: 'Project', ekey: 'C_Project_ID', rec: { id: 990000, label: 'BIM: Hospital', number: null } }, o || {}));
    const paras = { name: 'Generate PO from Project', rows: [{ ColumnName: 'C_Project_ID', Name: 'Project', IsMandatory: 'Y', SeqNo: 10, AD_Reference_ID: 19 }, { ColumnName: 'Description', Name: 'Description', IsMandatory: 'N', SeqNo: 20, AD_Reference_ID: 10 }], skipped: [] };
    const fin = (text) => { const a = core.step(pj({ paras: JSON.parse(JSON.stringify(paras)) }), { text }), q = a.state.asking && a.state.asking.input || '', b = a.state.asking ? core.step(a.state, { text: '' }) : a; return { first: q, line: (b.effects[0] && b.effects[0].line) || '' }; };   // the questions, then Return keeps the default: the line that would run
    const rn = fin('run "Generate PO from Project"'), rl = rn.line, ask = rn.first, tp = fin('run "Generate PO from Project" C_Project_ID=990001'), tl = tp.line;
    k.L('R5 do=' + dO.line + ' cat=' + cat.line + ' set=' + set.line + ' typed=' + typed.line + ' run=' + rl + ' first question=' + ask + ' typed key=' + tl);
    k.chk('R5 in a record the words leave out what it already says: `do CO` -> id=1200001 (the record\'s own key, §45 K1), `cat` and `set Description=x` -> id=1200001, `run "Generate PO from Project"` -> record=990000 + C_Project_ID=990000, the first question is not the project; a typed number/key wins',
      dO.line === 'erp.complete kind=Order id=1200001' && cat.line === 'mis.read kind=Order id=1200001' && set.line === 'mis.update kind=Order id=1200001 Description=x' && typed.line === 'erp.complete kind=Order number=80000'
        && !!rl && / record=990000/.test(rl) && / C_Project_ID=990000/.test(rl) && ask !== 'C_Project_ID' && / C_Project_ID=990001/.test(tl) && !/ C_Project_ID=990000/.test(tl), rl);
  }
  // R7 + R8 on the seed (a clean op-log): Order -> lines and tax, Business Partner -> locations, by the SAME words
  {
    const E2 = fresh(), ord = sq("SELECT o.c_order_id AS id, o.documentno AS no FROM c_order o WHERE (SELECT count(*) FROM c_order x WHERE x.documentno=o.documentno)=1 AND EXISTS (SELECT 1 FROM c_orderline l WHERE l.c_order_id=o.c_order_id) AND EXISTS (SELECT 1 FROM c_ordertax t WHERE t.c_order_id=o.c_order_id) ORDER BY o.c_order_id LIMIT 1")[0],
      bp = sq("SELECT b.c_bpartner_id AS id, b.value AS v FROM c_bpartner b WHERE EXISTS (SELECT 1 FROM c_bpartner_location l WHERE l.c_bpartner_id=b.c_bpartner_id) ORDER BY b.c_bpartner_id LIMIT 1")[0];
    if (!ord || !bp) k.incon('R7', 'the seed holds no order with lines and tax, or no partner with a location');
    else {
      const want = { line: sq('SELECT count(*) AS n FROM c_orderline WHERE c_order_id=' + ord.id)[0].n, tax: sq('SELECT count(*) AS n FROM c_ordertax WHERE c_order_id=' + ord.id)[0].n, loc: sq('SELECT count(*) AS n FROM c_bpartner_location WHERE c_bpartner_id=' + bp.id)[0].n };
      const S2 = session(['cd Order ' + ord.no, 'ls', 'cd ..', 'cd ..', 'cd "Business Partner" ' + bp.id, 'ls', 'cd Location', 'count'], E2), T = S2.out.split(/^→ mis\.read kind="?Business Partner"? id=/m);
      const t1 = tabRows(T[0]), t2 = tabRows(T.slice(1).join('')), W2 = wheres(S2.err);
      const orderLine = t1 && t1.filter(t => /Order Line$/i.test(t.tab))[0], orderTax = t1 && t1.filter(t => /Tax/i.test(t.tab))[0], bpLoc = t2 && t2.filter(t => /Location/i.test(t.tab))[0];
      k.L('R7 order ' + ord.no + ' (id ' + ord.id + ') want ' + JSON.stringify(want) + ' printed lines=' + (orderLine && orderLine.n) + ' tax=' + (orderTax && orderTax.n) + ' · partner ' + bp.id + ' locations=' + (bpLoc && bpLoc.n) + ' · prompts ' + JSON.stringify(W2));
      k.chk('R7 the same words: Order ' + ord.no + ' lists its tabs with ' + want.line + ' line(s) and ' + want.tax + ' tax row(s), Business Partner ' + bp.id + ' its ' + want.loc + ' location(s) (independent SQL); `cd Location` + `count` is filtered by the partner',
        !!orderLine && !!orderTax && !!bpLoc && orderLine.n === want.line && orderTax.n === want.tax && bpLoc.n === want.loc && W2[0] === 'red1 Order/' + ord.no + '>' && S2.out.indexOf('master="Business Partner/' + bp.id + '"') >= 0 && new RegExp('shown 1 of ' + want.loc + ' Partner Location').test(S2.out), 'tax ' + (orderTax && orderTax.n) + ' vs ' + want.tax);
    }
    // R8
    const S3 = session(['cd Project "BIM: Hospital"', 'pwd', 'cd ..', 'cd Project Hospital', 'pwd', 'cd ..', 'cd Project 990000', 'pwd', 'cd ..', 'cd Project NoSuchProject', 'pwd'], fresh()), W3 = wheres(S3.err), pw = (S3.out.match(/^kind=Project id=\d+.*$/mg) || []);
    k.L('R8 prompts ' + JSON.stringify(W3) + ' pwd ' + JSON.stringify(pw));
    k.chk('R8 `cd Project "BIM: Hospital"` (Name), `cd Project Hospital` (Value) and `cd Project 990000` (id) are ONE record (id 990000); `cd Project NoSuchProject` is refused with the reason and the session stays in the Project list',
      pw.length === 3 && pw.every(l => l === 'kind=Project id=990000') && W3[10] === 'red1 Project>' && /cd: no Project "NoSuchProject"/.test(S3.out), pw.join(' | ') + ' · last ' + W3[10]);
  }
  // R9 (§45): a record whose DocumentNo is shared is still acted on, by its id
  {
    const twins = sq("SELECT c_order_id AS id FROM c_order WHERE documentno = (SELECT documentno FROM c_order WHERE c_order_id = 100) ORDER BY 1");
    if (twins.length < 2) k.incon('R9', 'the seed holds no second Order with order 100\'s number: nothing to judge (' + JSON.stringify(twins) + ')');
    else {
      const E9 = fresh(), S9 = session(['cd Order 100', 'do RE', 'do CO', 'exit'], E9), A9 = arrows(S9.out);
      const st9 = (S9.err.match(/^§DOOR .*verb=erp\.(reactivate|complete) status=\w+/mg) || []).map(l => l.replace(/^.*verb=/, ''));
      const re = A9.find(l => /^erp\.reactivate /.test(l)) || '', co = A9.find(l => /^erp\.complete /.test(l)) || '';
      k.L('R9 twins=' + JSON.stringify(twins.map(t => t.id)) + ' lines ' + JSON.stringify([re, co]) + ' door ' + JSON.stringify(st9));
      k.chk('R9 in `cd Order 100` (its number 80000 is also order ' + twins.filter(t => t.id !== 100).map(t => t.id).join(',') + '\'s) `do RE` -> erp.reactivate kind=Order id=100 ok, then `do CO` -> erp.complete kind=Order id=100 ok',
        re === 'erp.reactivate kind=Order id=100' && co === 'erp.complete kind=Order id=100' && JSON.stringify(st9) === JSON.stringify(['erp.reactivate status=ok', 'erp.complete status=ok']), re + ' | ' + co + ' | ' + st9.join(','));
    }
  }
  // R10 (§45 K3): a record named inside its kind, from the menu walk
  {
    const S10 = session(['menu', 'cd Quote', 'cd "Sales Orders"', 'cd "Sales Order"', 'cd 100', 'cd ..', 'cd Foo', 'exit'], fresh()), W10 = wheres(S10.err), A10 = arrows(S10.out);
    const base = 'red1 menu/Quote-to-Invoice (Sales)/Sales Orders/Order>', inRec = 'red1 menu/Quote-to-Invoice (Sales)/Sales Orders/Order/80000>';
    k.L('R10 prompts ' + JSON.stringify(W10) + ' lines ' + JSON.stringify(A10.filter(l => /^mis\.read /.test(l))));
    if (!W10.length) k.incon('R10', 'the session logged no place (no §RED1 typed line): nothing to judge');
    else k.chk('R10 in the walk at Order, `cd 100` enters order 100 (mis.read kind=Order id=100) and the prompt keeps the menu path (' + inRec + '); `cd ..` -> ' + base + '; `cd Foo` there is refused as before',
      W10[3] === base && W10[4] === inRec && W10[5] === base && W10[6] === base && A10.indexOf('mis.read kind=Order id=100') >= 0 && /no building, kind or ERP window is named "Foo"/.test(S10.out), JSON.stringify(W10.slice(3, 7)));
  }
  // R11 (§50 (3)): a guess the shell makes to find a record shows no → line unless it answered
  {
    const S11 = session(['cd Order 100', 'exit'], fresh()), A11 = arrows(S11.out), want = ['mis.describe kind=Order', 'mis.read kind=Order id=100', 'erp.actions kind=Order id=100'];
    const refused = (S11.err.match(/^§RED1 probe refused line=.*$/mg) || []).map(l => JSON.parse(l.replace(/^§RED1 probe refused line=/, '').replace(/ status=\S+$/, '')));
    k.L('R11 arrows ' + JSON.stringify(A11) + ' refused ' + JSON.stringify(refused));
    if (!/Order 80000: \d+ tabs/.test(S11.out)) k.incon('R11', 'the record was not entered, so the lines it printed cannot be judged: ' + S11.out.slice(0, 200));
    else k.chk('R11 `cd Order 100` prints only the lines that answered (' + want.join(' · ') + '); the log names the refused guesses', JSON.stringify(A11) === JSON.stringify(want) && refused.indexOf('mis.describe kind="Order 100"') >= 0 && refused.indexOf('mis.read kind=Order number=100') >= 0, 'arrows=' + A11.length + ' refused=' + refused.length);
  }
  k.end();
})().catch(e => { console.log('§W-RED1-RECORD FAIL ' + (e && e.stack || e)); process.exit(1); });
