// ⚠ DO NOT REMOVE — W-RED1-ASSIST (bim-compiler prompts/CLI_ERP_IVR.md §1d, §1d.1: the type assist at the red1 prompt; the typo rule). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (a suggestion the dictionary does not hold, or a column it holds left out): for prefixes on Project, the assist's candidates == an independent SQL on the seed's AD_Column
//   A2 ISSUE (a typo answered by a wrong name, or a misspelt line that RUNS): for each typo the first suggestion is the dictionary name, and the line as typed runs nothing (refused, nearest named)
//   A3 ISSUE (Enter applies a suggestion the person did not take): on a terminal, `ls Valu=Hospital` + Enter runs nothing; the hint was shown and not taken
//   A4 ISSUE (Tab or → takes something other than what was shown): on a terminal, Tab on a typo and → on a grey text give exactly the shown name, and the printed → line carries it
//   A5 ISSUE (one-shot / scripts get a suggestion or a different answer): `red1 'cd Project; ls Valu=Hospital'` prints no hint and the same refusal
//   Falsifier: ASSIST_BREAK=autoapply (Enter applies the hint: must FAIL A3). A1 FAILs if assist_core offers a hand name. Needs `script` for A3/A4 (else INCONCLUSIVE).
//   Run: node common/door/tests/witness_red1_assist.js > common/door/tests/logs/red1_assist.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-ASSIST'), RED1 = path.join(ROOT, 'common/door/red1.js'), A = require(path.join(ROOT, 'common/door/assist_core.js'));
const BRK = process.env.ASSIST_BREAK || '';
const sh = (cmd, ms) => new Promise((res) => { let o = ''; const p = cp.spawn('bash', ['-c', cmd], { env: Object.assign({}, process.env, { RED1_WARM: 'off', RED1_LOG: 'stderr' }, BRK ? { ASSIST_BREAK: BRK } : {}) }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { o += d; }); const t = setTimeout(() => { p.kill(); }, ms); p.on('close', () => { clearTimeout(t); res(o); }); });
const envOf = (out) => out.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
(async () => {
  // the Project kind's properties, from the door (what the session holds after `cd Project`)
  const d = envOf(await sh('node ' + RED1 + " 'mis.describe kind=Project' 2>/dev/null", 60000)).pop();
  const props = d && d.answer && d.answer.properties ? d.answer.properties.map(q => ({ name: q.name, label: q.label, type: q.type, values: q.values || null })) : [];
  k.L('props from mis.describe kind=Project: ' + props.length);
  // A1: an independent read of the seed's dictionary (sql.js on erp/ad_seed.db)
  let sqlNames = null;
  try {
    const SQL = await require('sql.js')(), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
    const r = db.exec("SELECT c.columnname FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='c_project' AND c.isactive='Y'");
    sqlNames = r.length ? r[0].values.map(v => v[0]) : [];
  } catch (e) { k.L('A1 sql.js unavailable: ' + e.message); }
  if (!props.length || !sqlNames) k.incon('A1', 'no properties (' + props.length + ') or no SQL read');
  else {
    const bad = [];
    ['C_B', 'Plan', 'proj', 'Inv', 'Value'].forEach(px => {
      const r = A.suggest({ props }, 'ls ' + px), got = r ? r.candidates.map(c => c.name) : [], of = r ? r.of : 0;
      const want = sqlNames.filter(n => n.toLowerCase().indexOf(px.toLowerCase()) === 0).sort();
      const shown = got.slice().sort(), wantShown = want.slice(0, 8);
      k.L('A1 prefix ' + JSON.stringify(px) + ' assist=' + JSON.stringify(got) + ' of=' + of + ' sql=' + JSON.stringify(want));
      if (of !== want.length || shown.some(n => want.indexOf(n) < 0) || got.length !== Math.min(8, want.length)) bad.push(px + ': assist ' + of + ' ' + JSON.stringify(got) + ' vs sql ' + want.length + ' ' + JSON.stringify(wantShown));
    });
    k.chk('A1 for 5 prefixes on Project, the assist offers exactly the AD_Column names an independent SQL finds (count equal, every one in the SQL set)', !bad.length, bad.join(' | '));
  }
  // A2: typos -> the dictionary name; the line as typed runs nothing
  const typos = [['C-BPartner_ID', 'C_BPartner_ID'], ['C_BPartner', 'C_BPartner_ID'], ['Valu', 'Value'], ['Valeu', 'Value']], bad2 = [];
  for (const [t, want] of typos) {
    const r = A.suggest({ props }, 'ls ' + t), first = r ? (r.ghost ? r.token + r.ghost : r.replace && r.replace.to) : null;
    const e = envOf(await sh('node ' + RED1 + " 'mis.list kind=Project " + t + "=1 columns=Value' 2>/dev/null", 60000)).pop();
    k.L('A2 ' + t + ' → suggestion ' + JSON.stringify(first) + ' · line status=' + (e && e.status) + ' why=' + (e && e.why) + ' rows=' + (e && e.answer && e.answer.rows ? e.answer.rows.length : '-'));
    if (!first || first.replace(/=$/, '') !== want) bad2.push(t + ' suggested ' + first);
    if (!e || e.status === 'ok' || String(e.why || '').indexOf(want) < 0) bad2.push(t + ' line ' + (e && e.status) + ': ' + (e && e.why));
  }
  { // case only (§1d rule 1: accepted): the suggestion shows the dictionary's case, and the line RUNS
    const r = A.suggest({ props }, 'ls plannedamt'), e = envOf(await sh('node ' + RED1 + " 'mis.list kind=Project plannedamt=0 columns=Value' 2>/dev/null", 60000)).pop();
    k.L('A2 case plannedamt → ' + JSON.stringify(r && r.replace) + ' · line status=' + (e && e.status));
    if (!r || !r.replace || r.replace.to !== 'PlannedAmt=' || !e || e.status !== 'ok') bad2.push('case plannedamt: hint ' + JSON.stringify(r && r.replace) + ' line ' + (e && e.status));
  }
  k.chk('A2 for ' + typos.length + ' typos the first suggestion is the dictionary name, and the line as typed runs nothing and names it; a case-only difference is shown in the dictionary\'s case and runs', !bad2.length, bad2.join(' | '));
  // A3 + A4 on a pseudo-terminal
  const hasScript = cp.spawnSync('bash', ['-c', 'command -v script']).status === 0;
  if (!hasScript) { k.incon('A3', 'no `script`'); k.incon('A4', 'no `script`'); }
  else {
    const hist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r1a_')), 'h');
    const pty = (keys) => sh(keys + " | script -qc \"stty rows 40 cols 200; RED1_HISTORY=" + hist + " node " + RED1 + "\" /dev/null", 60000).then(o => o.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, ''));
    const o3 = await pty("(sleep 2; printf 'cd Project\\r'; sleep 3; printf 'ls Valu=Hospital'; sleep 1; printf '\\r'; sleep 4; printf 'exit\\r')");
    const shown3 = /▸ Value=Hospital/.test(o3), nottaken = /§RED1 assist not-taken line="ls Valu=Hospital"/.test(o3), refused = /has no property "Valu"; nearest: Value/.test(o3), ran = /→ mis\.list[^\n]*Value=Hospital/.test(o3);
    k.L('A3 hint shown=' + shown3 + ' not-taken=' + nottaken + ' refused=' + refused + ' ran-with-Value=' + ran + '\n' + o3.split('\n').filter(l => /→|assist|nearest|refused|shown/.test(l)).join('\n'));
    k.chk('A3 on a terminal `ls Valu=Hospital` shows the hint `▸ Value=Hospital`, and Enter runs NOTHING: the door refuses naming Value; the hint is logged not taken', shown3 && nottaken && refused && !ran, 'shown=' + shown3 + ' notTaken=' + nottaken + ' refused=' + refused + ' ran=' + ran);
    const o4 = await pty("(sleep 2; printf 'cd Project\\r'; sleep 3; printf 'ls Valu=Hospital'; sleep 1; printf '\\t'; sleep 1; printf '\\r'; sleep 4; printf 'ls Valu'; sleep 1; printf '\\033[C'; sleep 1; printf 'Hospital\\r'; sleep 4; printf 'exit\\r')");
    const arrows = (o4.match(/→ mis\.list[^\n]*/g) || []), tab = arrows.filter(l => / Value=Hospital/.test(l)).length, oks = (o4.match(/ok · mis\.list/g) || []).length;
    const took = (o4.match(/§RED1 assist take [^\n]*/g) || []);
    k.L('A4 arrows=' + JSON.stringify(arrows) + ' oks=' + oks + ' takes=' + JSON.stringify(took));
    k.chk('A4 on a terminal Tab on `Valu=Hospital` and → on the grey `e=` each give `Value=Hospital`; both printed → lines carry it and answer ok', tab === 2 && oks === 2 && took.length === 2, 'lines with Value=Hospital=' + tab + ' ok=' + oks + ' takes=' + took.length);
  }
  // A5: one-shot words: no hint, the same refusal
  const o5 = await sh('node ' + RED1 + " 'cd Project; ls Valu=Hospital'", 60000);
  const e5 = envOf(o5).pop();
  k.chk('A5 one-shot `cd Project; ls Valu=Hospital` prints no hint and is refused naming Value', !/▸/.test(o5) && !!e5 && e5.status === 'refused' && /nearest: Value/.test(e5.why || ''), 'status=' + (e5 && e5.status) + ' why=' + (e5 && e5.why));
  k.end();
})().catch(e => { console.log('§W-RED1-ASSIST FAIL ' + (e && e.stack || e)); process.exit(1); });
