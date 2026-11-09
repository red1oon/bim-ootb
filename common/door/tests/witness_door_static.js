#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-SHAPE, W-VOCAB-FRESH, W-VOCAB-NOESCAPE (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.7). READ THE §-LOG after every run.
 * No browser: the door runs with a counting stub in place of the apps' CLIs, so "no run happens" is a count, not a hope.
 *   W-DOOR-SHAPE   ISSUE: two copies of an input rule drifting. The generated validator rejects every bad shape and accepts every good one, the SAME way
 *                  from a door line and from the connector's JSON; a rejected request never spawns a CLI. Falsifier DOOR_BREAK=shape must fail it.
 *   W-VOCAB-FRESH  ISSUE: a vocabulary that decays (§0.3 rule 1). Every entry's cli exists, its witness file exists, every connector tool comes from verbs.json
 *                  (a live bim_mcp.js is asked) and the published names/descriptions/schemas are the pre-D1 bytes (sha256 of the legacy tools/list).
 *   W-VOCAB-NOESCAPE ISSUE: an escape-hatch verb (§0.3 rule 6). The real vocabulary has none; planted entries with a shell, an eval flag or a code-typed input are each caught.
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { kit, tmp, run, ROOT } = require('./_kit');
const D = require('../door.js');
const k = kit('W-DOOR-SHAPE');
const LEGACY_SHA = '31e328c54be57ab5ccd4df632c9443f88a896f382c0d7908d5f8ac4d56c27e25';   // sha256(JSON.stringify of the 4 tools as origin/main bim_mcp.js published them)
const STUB = path.join(__dirname, 'stub_cli.js'), count = tmp('door_cnt_'), journal = tmp('door_j_');
process.env.STUB_COUNT = count;
const spawned = () => (fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').filter(Boolean).length : 0);

(async () => {
  const door = D.createDoor({ journal, cli: { edit_cli: STUB, viewer_verbs: STUB, film_path_vis: STUB }, say: () => {} });
  // [line, json arguments, error regex or null for "accepted"]
  const T = [
    ['modeller.try_shift building=HospitalGarage line=gx6 move=1.824', { building: 'HospitalGarage', line: 'gx6', move: 1.824 }, null],
    ['modeller.try_shift building=HospitalGarage line=gx6 move=-0.5', { building: 'HospitalGarage', line: 'gx6', move: -0.5 }, null],
    ['modeller.lines building=Hospital', { building: 'Hospital' }, null],
    ['viewer.counts building=Duplex by=storey', { building: 'Duplex', by: 'storey' }, null],
    ['viewer.counts building=Duplex', { building: 'Duplex' }, null],
    ['viewer.clashes building=Clinic discA=ARC discB=MEP', { building: 'Clinic', discA: 'ARC', discB: 'MEP' }, null],
    ['modeller.try_shift building=HospitalGarage line=gx6', { building: 'HospitalGarage', line: 'gx6' }, /missing input: move/],
    ['modeller.try_shift line=gx6 move=1', { line: 'gx6', move: 1 }, /missing input: building/],
    ['modeller.try_shift building=HospitalGarage move=1', { building: 'HospitalGarage', move: 1 }, /missing input: line/],
    ['modeller.try_shift building=HospitalGarage line=gx6 move=abc', { building: 'HospitalGarage', line: 'gx6', move: 'abc' }, /must be a (plain )?number/],
    ['modeller.try_shift building=HospitalGarage line=gx6 move=1824mm', { building: 'HospitalGarage', line: 'gx6', move: '1824mm' }, /must be a (plain )?number/],
    ['modeller.try_shift building=HospitalGarage line=gx6 move=1 colour=red', { building: 'HospitalGarage', line: 'gx6', move: 1, colour: 'red' }, /unknown input: colour/],
    ['modeller.try_shift building="--url" line=gx6 move=1', { building: '--url', line: 'gx6', move: 1 }, /must be a building name/],
    ['viewer.counts building=Duplex by=floor', { building: 'Duplex', by: 'floor' }, /must be one of discipline, storey/],
    ['viewer.clashes building=Clinic discA=ARC discB="M E P"', { building: 'Clinic', discA: 'ARC', discB: 'M E P' }, /must be a discipline code/],
    ['modeller.add_tower building=Hospital', null, /unknown verb: modeller\.add_tower/]
  ];
  const lineStat = [], jsonStat = []; let n0 = spawned();
  for (const [line, args, re] of T) {
    const e = await door.runLine(line, { actor: 'human' }), spawnedLine = spawned() - n0; n0 = spawned();
    let j = null, spawnedJson = 0;
    if (args) { j = await door.execArgs({ verb: line.split(' ')[0], args, actor: 'ai' }); spawnedJson = spawned() - n0; n0 = spawned(); }
    else j = await door.execArgs({ verb: 'modeller.add_tower', args: {}, actor: 'ai' });
    const okLine = re ? (e.status === 'error' && re.test(e.why) && spawnedLine === 0) : (e.status === 'ok' && spawnedLine === 1),
          okJson = re ? (j.status === 'error' && re.test(j.why) && spawnedJson === 0) : (j.status === 'ok' && spawnedJson === 1);
    lineStat.push(okLine); jsonStat.push(okJson);
    k.chk((re ? 'rejects  ' : 'accepts  ') + line, okLine && okJson, 'line=' + e.status + (e.why ? '(' + e.why.slice(0, 60) + ')' : '') + ' json=' + j.status + ' spawns=' + spawnedLine + '/' + spawnedJson);
  }
  k.L('shape cases=' + T.length + ' bad=' + T.filter(t => t[2]).length + ' good=' + T.filter(t => !t[2]).length + ' lineOK=' + lineStat.filter(Boolean).length + ' jsonOK=' + jsonStat.filter(Boolean).length);
  if (!T.length) k.incon('SHAPE', 'no cases judged');
  // a free-text line is a question, not an order
  const q = await door.runLine('please widen the bay at gx6', { actor: 'human' });
  k.chk('free text goes back as a question, nothing runs', q.status === 'refused' && q.answer && /Which one do you mean/.test(q.answer.question) && spawned() === n0, 'status=' + q.status);

  // ── W-VOCAB-FRESH ──
  const V = door.vocab, entries = V.verbs, FIELDS = ['verb', 'app', 'title', 'description', 'inputs', 'harm', 'actors', 'returns', 'witness'];
  const missingField = entries.map(e => FIELDS.filter(f => e[f] === undefined || e[f] === null).map(f => e.verb + '.' + f)).flat().concat(entries.filter(e => !e.calls && !e.body).map(e => e.verb + '.calls|body'));
  k.chk('FRESH every entry has the §0.4 fields (calls or a body)', !missingField.length && entries.length >= 6, 'entries=' + entries.length + ' missing=' + missingField.join(','));
  const noCli = entries.filter(e => e.calls && !(D.CLI_TABLE[e.calls.cli] && fs.existsSync(D.CLI_TABLE[e.calls.cli])));
  k.chk('FRESH every entry\'s calls.cli is in the door\'s table and the script exists', !noCli.length && entries.some(e => e.calls), 'bad=' + noCli.map(e => e.verb).join(','));
  const noW = entries.filter(e => !fs.existsSync(path.join(ROOT, e.witness.split('#')[0])));
  k.chk('FRESH every entry\'s witness file exists', !noW.length, 'bad=' + noW.map(e => e.verb + '->' + e.witness).join(','));
  k.chk('FRESH harm and actors are from the vocabulary', entries.every(e => D.HARM.indexOf(e.harm) >= 0 && e.actors.every(a => a === 'human' || a === 'ai')));
  const tools = door.mcpTools(), sha = crypto.createHash('sha256').update(JSON.stringify(tools)).digest('hex');
  k.chk('FRESH tools/list built from verbs.json = the pre-D1 published bytes (names, descriptions, schemas)', sha === LEGACY_SHA && tools.length === 4, 'sha=' + sha.slice(0, 12) + ' tools=' + tools.map(t => t.name).join(','));
  // ask the live connector
  const { spawn } = require('child_process'); const srv = path.join(ROOT, 'modeller', 'tools', 'bim_mcp.js');
  const live = await new Promise((res) => { const p = spawn(process.execPath, [srv], { stdio: ['pipe', 'pipe', 'ignore'], env: Object.assign({}, process.env, { BIM_DOOR_JOURNAL: journal }) }); let b = ''; p.stdout.on('data', d => { b += d; if (b.indexOf('\n') >= 0) { p.kill(); try { res(JSON.parse(b.split('\n')[0]).result.tools); } catch (e) { res(null); } } }); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n'); setTimeout(() => { p.kill(); res(null); }, 20000); });
  const names = (live || []).map(t => t.name).sort().join(','), want = entries.filter(e => e.mcp_name).map(e => e.mcp_name).sort().join(',');
  k.chk('FRESH every connector tool comes from verbs.json, and every mcp_name is offered (live bim_mcp.js asked)', !!live && names === want && JSON.stringify(live) === JSON.stringify(tools), 'live=' + names);

  // ── W-VOCAB-NOESCAPE ──
  const ESC_FLAG = /^(-e|-c|-p|--eval|--exec|--shell|--sql|--print|--require|-r)$/i, ESC_NAME = /(^|_)(eval|exec|sql|shell|bash|script|code|cmd|command)(_|$)/i;
  const escapes = (list) => list.map(e => {
    const bad = [];
    if (e.calls) {
      if (!Object.prototype.hasOwnProperty.call(D.CLI_TABLE, e.calls.cli)) bad.push('cli ' + e.calls.cli + ' is not in the door\'s table');
      const flat = e.calls.argv.map(t => (typeof t === 'string' ? [t] : t.args)).flat();
      flat.forEach(t => { if (ESC_FLAG.test(t) || /\b(eval|exec)\b/i.test(t.replace(/\{\w+\}/g, ''))) bad.push('argv ' + t); });
    }
    e.inputs.forEach(i => { if (i.type !== 'number' && !D.TYPES[i.type]) bad.push('input ' + i.name + ' has type ' + i.type); if (ESC_NAME.test(i.name)) bad.push('input ' + i.name + ' is named like code'); });
    return bad.map(b => e.verb + ': ' + b);
  }).flat();
  const real = escapes(entries);
  k.chk('NOESCAPE the real vocabulary has no eval, SQL or shell path', real.length === 0 && entries.length > 0, 'offences=' + real.length);
  const clone = (e, f) => { const c = JSON.parse(JSON.stringify(e)); f(c); return c; };
  const base = entries.filter(e => e.calls)[0];
  const planted = [
    clone(base, c => { c.verb = 'x.shell'; c.calls.cli = 'sh'; }),
    clone(base, c => { c.verb = 'x.eval'; c.calls.argv = ['-e', '{building}']; }),
    clone(base, c => { c.verb = 'x.code'; c.inputs.push({ name: 'script', type: 'code', required: true }); }),
    clone(base, c => { c.verb = 'x.sql'; c.inputs.push({ name: 'sql', type: 'string', required: true }); })
  ];
  planted.forEach((p) => k.chk('NOESCAPE planted ' + p.verb + ' is caught', escapes([p]).length > 0, escapes([p]).join('; ')));
  // and the door itself will not run a planted shell entry
  const raw = JSON.parse(JSON.stringify(V.raw)); raw.verbs.push(planted[0]);
  fs.writeFileSync(count, '');
  const evil = D.createDoor({ journal, say: () => {}, vocab: { verbs: raw.verbs, byVerb: new Map(raw.verbs.map(e => [e.verb, e])), raw } }), r = await evil.runLine('x.shell building=Hospital', { actor: 'human' });
  k.chk('NOESCAPE the door refuses to run a planted entry whose cli is not in its table (nothing spawned)', r.status === 'error' && evil.spawned === 0, 'status=' + r.status + ' why=' + String(r.why).slice(0, 70));
  k.L('static cases judged=' + k.pass + '+' + k.fail);
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_SHAPE verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
