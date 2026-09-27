// ⚠ DO NOT REMOVE — §ALTS_ALL harness SELF-TEST (red controls). Scope: prove, with crafted fixture records and logs, that every
// verdict state of alts_all_judge.js can TRIGGER — a GREEN fixture must PASS (the harness can pass) and each GIGO fixture must be
// flagged with its own state (the harness can fail). Plus the real v1/v2 film logs where present (informational). Read the output.
// Command: node viewer/tests/witness_alts_all.js --selftest   (or node viewer/tests/witness_alts_all_selftest.js)
'use strict';
const fs = require('fs');
const J = require('./alts_all_judge.js');
const T = { commit: 'fixture', sw: 'v1474', versions: { 'light_law.js': '6', 'sourced_light.js': '59' }, hashes: { 'light_law.js': 'aa', 'sourced_light.js': 'bb' }, lawHash: 'dc0e8638', lzSrc: 'k:1' };
const clone = o => JSON.parse(JSON.stringify(o));
function stillRec(pose, arm, o) {
  o = o || {}; const q = arm === 'base' ? '&ghost=1' : '&ghost=1' + J.FIXES[arm].q;
  const lines = [
    '§ZONE_IDB_CACHE prime bld=Hospital none readMs=3',
    '§GLARE bld=Hospital PASS black_exterior=0 junction_zone_flip=0 covered_open_side_black=0 (exteriorFaces=' + (o.extFaces != null ? o.extFaces : 146293) + ' junctionTested=192987 rayLitCoveredCells=1 auditMs=1)',
    '§SKY_SHELL_RAYS bld=Hospital cache=built ' + (arm === 'skyshell0' ? 'off (&skyshell=0 / APP._stillSkyShell=false)' : 'on') + ' shellCells=31630 pretestSkipped=16621 recomputed=15009 reach=' + (arm === 'shellreach2' ? 'r2' : 'air') + ' candidates=1 near2=1 airOnly=5 recomputedAirOnly=4',
    '§COVE_QUAL (L1a) qualified=358 belowLevelWithLamps=0',
    '§CAM_TORCH ' + (arm === 'torch0' ? 'off' : 'on peakCd=900'),
    '§METER_STATE camera=inside ground=d9c39a gain=2.30 sunI=4.400 lights point=8/1.000 hidden=1 bandL=1e-1',
    '§METER camera=inside mode=hist EV100=9.68 exposure=23.0 skyPx=' + (o.allSkyStage ? '14400/14400 pixels=14400' : '0/14400 pixels=7206') + ' hidden=1 ms=483',
    '§ALBEDO_SRGB srgbfix=' + (arm === 'srgbfix0' ? 0 : 1) + ' decode=law converted=' + (o.converted != null ? o.converted : 108),
    arm === 'groundlaw0' ? '§GROUND_HALF off (&groundlaw=0) groundColor=0x8b7355' : '§GROUND_HALF rho=[0.3,0.3,0.3] rhoSrc=table',
    '§GRID_BLEND ' + (arm === 'gridblend1' ? 'on' : 'off'), '§SPEC_SMOOTH ' + (arm === 'specsmooth0' ? 'off' : 'on'),
    arm === 'aoindirect0' ? '§AO_INDIRECT mode=legacy radius=32px' : '§AO_INDIRECT done mode=shader boundMats=240 aoFrames=24',
    '§STILL_STAGE_MS zoneBuild=1 total=12000',
    '§METER_STATE camera=inside ground=d9c39a gain=2.30 sunI=4.400 lights point=' + (o.jump ? '40/9.000' : '8/1.000') + ' hidden=36 bandL=1e-1',
    '§METER camera=inside mode=hist EV100=' + (o.jump ? '12.10' : '9.60') + ' exposure=24.0 skyPx=0/14400 pixels=7206 hidden=36 ms=400',
    arm === 'gialb0' ? '§GI_RECEIVER_ALBEDO off (&gialb=0)' : '§GI_RECEIVER_ALBEDO real=900000 est=1 realPct=90',
    '§GI_STILL result mode=composite compositeMean=100'].concat(o.pageError ? ['PAGEERROR boom'] : []);
  const c = Object.assign({ p5: 20, p50: 120, p95: 200, mean: 110, ge250pct: 0.1, le15pct: 0.2, w: 10, h: 10 }, o.comp || {});
  return { pose, arm, q, cam: [1, 2, 3], tgt: [4, 5, 6], lines, pressSecs: 60, png: { pose: { cam: [1, 2, 3], tgt: [4, 5, 6] }, stats: {} },
    eval: { programs: 120, scripts: o.scripts || ['light_law.js?v=6', 'sourced_light.js?v=59'], fileHash: { 'light_law.js': 'aa', 'sourced_light.js': 'bb' }, swServed: o.sw || 'v1474', swCtlAtLoad: !!o.ctl,
      lawHash: o.lawHash || 'dc0e8638', lzSrc: 'k:1', pose: { cam: [1, 2, 3], tgt: [4, 5, 6] }, compSrc: 'bounce', comp: c, steps: { n: 100, per1000: 1 } } };
}
function stillRows(r) { const g1 = J.g1(r, T); return g1.some(x => x.state !== 'PASS') ? g1.concat([{ group: 'G1', id: 'pose verdict', state: 'INCONCLUSIVE', detail: '' }]) : g1.concat(J.g3(r), J.g4(r)); }
function filmLog(o) {
  o = o || {}; const L = ['00:00:00.000 +    0.0s §CLI_BAKE_ENV root=/x commit=f sw=v1474 db=H gpu=real', '00:00:00.100 +    0.1s [con] §CPE_LOADED v25'];
  if (o.race) L.push('00:00:00.200 +    0.2s [con] §LEDGER_TICKER_INIT wired');
  L.push('00:00:00.300 +    0.3s §CLI_BAKE_SW_PURGE unregistered=' + (o.race ? 1 : 0) + ' cachesDeleted=0 — reloading');
  L.push('00:00:00.400 +    0.4s [con] §LEDGER_TICKER_INIT wired');
  if (o.arm === 'C') L.push('[con] §FILM_EXPOSURE off (control: &filmexp=0) exposure=0.3825 fixed');
  L.push('[con] ' + (o.arm === 'E' ? '§CAM_LIGHT on intensity=3' : '§FILM_PARITY on fill=alt-s (ambient 0, §FILM_LAW S2)'));
  L.push('[con] §CAM_TORCH on peakCd=900', '[con] §CAM_TORCH film on intensityUnits=3.960000e-2 peakCd=900 lawHash=x', '[con] §CAM_TORCH off', '[con] §FILM_FILL_CHECK tNorm=0 drift=none');
  if (o.arm !== 'T') L.push('[con] §CAM_TORCH on peakCd=900', '[con] §CAM_TORCH film on intensityUnits=3.960000e-2 peakCd=900 lawHash=x');
  L.push('[con] §LIGHT_LAW tag=film-first lawHash=' + (o.law || 'dc0e8638'), '[con] §CLASH_SUMMARY pairs=12 ms=40', '[con] §MEASURE_BOX n=3');
  let ev = 16.0; const N = 12;
  for (let f = 0; f < N; f++) { const tgt = f < 6 ? 16.0 : 15.0, st = Math.max(-1 / 15, tgt - ev); if (f > 0) ev = +(ev + st).toFixed(3);
    if (o.arm !== 'C') L.push('[con] §FILM_EXPOSURE f=' + f + ' targetEV=' + tgt.toFixed(3) + ' EV=' + (f === 0 ? '16.000' : ev.toFixed(3)) + ' exposure=0.2 Lcd=1 first=' + (f === 0 ? 1 : 0) + ' capped=' + (f >= 6 ? 'down' : '-') + ' dt=0.0667 mode=hist skyPx=0 cam=[' + f + ',0,0] tgt=[0,0,0] sunI=4.4 ambient=0.000 hemi=1.234 camLight=0 torch=' + (o.arm === 'T' ? 'off' : '3.960000e-2') + ' programs=' + (f === 0 ? 110 : 149) + ' ms=100');
    const sha = (o.reuse && f === 7) ? 'sha6' : 'sha' + f, luma = (o.black && f === 4) ? 1.2 : (o.arm === 'T' && !o.noopT ? 60 + f : o.arm === 'C' ? 50 + f : o.arm === 'E' ? 55 + f : 70 + f);
    L.push('[con] §FRAME_HASH i=' + f + ' sha=' + sha + ' bytes=1000', '[con] §FRAME_QA i=' + f + ' qaEvery=1 lumaMean=' + luma.toFixed(2) + ' lumaMin=0 lumaMax=200 darkPct=1 clipPct=0 reused=0 cam=[' + f + ',0,0]'); }
  L.push('[con] §MAXQ_DONE frames=' + N + ' bytes=1 type=video/mp4');
  return { arm: o.arm || 'A', lines: L, tap: { scripts: ['light_law.js?v=6', 'sourced_light.js?v=59'], lawHash: o.law || 'dc0e8638' } };
}
function run() {
  const rows = [], expect = (name, got, want) => { const ok = typeof want === 'function' ? want(got) : got === want; rows.push({ name, got: String(got), want: String(typeof want === 'function' ? 'see rule' : want), ok }); console.log('    ' + (ok ? 'ok  ' : 'BAD ') + name + ': got ' + got); };
  const st = (rs, re) => (rs.find(r => re.test(r.id)) || {}).state;
  // GREEN still: every row PASS or WARN
  const g = stillRows(stillRec('inner', 'base')); const bad = g.filter(r => J.BLOCKING.has(r.state));
  expect('GREEN still fixture -> gate PASS (the harness CAN pass)', J.gate(g) + (bad.length ? ' ' + bad.map(r => r.id + '=' + r.state).join(';') : ''), 'PASS');
  // G1 instrument failures -> INCONCLUSIVE (never PASS)
  expect('G1 sw served != tree -> INCONCLUSIVE', J.gate(stillRows(stillRec('inner', 'base', { sw: 'v1473' }))), 'INCONCLUSIVE');
  expect('G1 SW controlled the page (not fresh) -> INCONCLUSIVE', J.gate(stillRows(stillRec('inner', 'base', { ctl: true }))), 'INCONCLUSIVE');
  expect('G1 lawHash page != node -> INCONCLUSIVE', J.gate(stillRows(stillRec('inner', 'base', { lawHash: '918804c2' }))), 'INCONCLUSIVE');
  expect('G1 page error -> INCONCLUSIVE', J.gate(stillRows(stillRec('inner', 'base', { pageError: true }))), 'INCONCLUSIVE');
  expect('G1 stale ?v= in DOM -> INCONCLUSIVE', J.gate(stillRows(stillRec('inner', 'base', { scripts: ['light_law.js?v=5', 'sourced_light.js?v=59'] }))), 'INCONCLUSIVE');
  // G3 VACUOUS
  expect('G3 all-sky inside meter -> VACUOUS', st(J.g3(stillRec('inner', 'base', { allSkyStage: true })), /all-sky/), 'VACUOUS');
  expect('G3 §ALBEDO_SRGB converted=0 -> VACUOUS', st(J.g3(stillRec('inner', 'base', { converted: 0 })), /ALBEDO/), 'VACUOUS');
  expect('G3 §GLARE exteriorFaces=0 -> VACUOUS', st(J.g3(stillRec('inner', 'base', { extFaces: 0 })), /GLARE/), 'VACUOUS');
  expect('G3 stage->final remeter jump 2.4 EV -> FAIL', st(J.g3(stillRec('night', 'base', { jump: true })), /remeter EV jump/), 'FAIL');
  expect('G3 jump row names what changed (§METER_STATE diff)', (J.g3(stillRec('night', 'base', { jump: true })).find(r => /jump/.test(r.id)) || {}).detail, d => /point 8\/1\.000->40\/9\.000/.test(d));
  // G4
  expect('G4 p50 25 -> FAIL', st(J.g4(stillRec('inner', 'base', { comp: { p50: 25 } })), /p50/), 'FAIL');
  // G2
  const base = stillRec('inner', 'base');
  expect('G2 torch arm moved the frame -> PASS', J.g2(base, stillRec('inner', 'torch0', { comp: { mean: 95, p50: 104 } }), 'torch0', null)[0].state, 'PASS');
  expect('G2 torch arm identical frame -> NO-OP (global fix)', J.g2(base, stillRec('inner', 'torch0'), 'torch0', null)[0].state, 'NO-OP');
  expect('G2 skyshell arm identical frame -> SCOPE-BLIND (local fix)', J.g2(stillRec('a202', 'base'), stillRec('a202', 'skyshell0'), 'skyshell0', null)[0].state, 'SCOPE-BLIND');
  expect('G2 srgbfix population converted=0 -> VACUOUS', J.g2(stillRec('inner', 'base', { converted: 0 }), stillRec('inner', 'srgbfix0', { comp: { mean: 80 } }), 'srgbfix0', null)[0].state, 'VACUOUS');
  const dead = stillRec('inner', 'groundlaw0', { comp: { mean: 80 } }); dead.lines = dead.lines.filter(l => !/§GROUND_HALF off/.test(l));
  expect('G2 off-switch without its off line -> FAIL (switch dead)', J.g2(base, dead, 'groundlaw0', null)[0].state, 'FAIL');
  expect('G2 effect inside measured noise -> NO-OP', J.g2(base, stillRec('inner', 'torch0', { comp: { mean: 110.3, p50: 120.2 } }), 'torch0', 0.4)[0].state, 'NO-OP');
  // FILM
  const A = filmLog({ arm: 'A' }), C = filmLog({ arm: 'C' }), E = filmLog({ arm: 'E' }), Tt = filmLog({ arm: 'T' });
  const fr = J.filmJudge(A, T, { C, E, T: Tt }), fbad = fr.filter(r => J.BLOCKING.has(r.state));
  expect('GREEN film fixture -> §BAKE_RELEASE_GATE PASS (the gate CAN pass)', J.gate(fr) + (fbad.length ? ' ' + fbad.map(r => r.id + '=' + r.state + ' ' + r.detail.slice(0, 80)).join(';') : ''), 'PASS');
  expect('film black frame (luma 1.2 at i=4) -> FAIL', st(J.filmJudge(filmLog({ arm: 'A', black: true }), T, { C, E, T: Tt }), /frame luma/), 'FAIL');
  expect('film reused frame (same sha, camera moved, reused=0) -> FAIL', st(J.filmJudge(filmLog({ arm: 'A', reuse: true }), T, { C, E, T: Tt }), /byte-identical/), 'FAIL');
  const race = J.filmJudge(filmLog({ arm: 'A', race: true }), T, { C, E, T: Tt });
  expect('film SW-race double init (unregistered=1, _INIT before and after the purge) -> INCONCLUSIVE', st(race, /SW purge/), 'INCONCLUSIVE');
  expect('film SW race -> §BAKE_RELEASE_GATE INCONCLUSIVE (never PASS)', J.gate(race), 'INCONCLUSIVE');
  expect('film torch arm with identical luma -> NO-OP', st(J.filmJudge(A, T, { C, E, T: filmLog({ arm: 'T', noopT: true }) }), /film torch/), 'NO-OP');
  expect('film lawHash != node -> FAIL (and the tap row INCONCLUSIVE)', st(J.filmJudge(filmLog({ arm: 'A', law: '918804c2' }), T, null), /lawHash film == still/) + '/' + st(J.filmJudge(filmLog({ arm: 'A', law: '918804c2' }), T, null), /tap: page lawHash/), 'FAIL/INCONCLUSIVE');
  expect('film with no bake log judged -> gate INCONCLUSIVE', J.gate([]), 'INCONCLUSIVE');
  // REAL logs (informational rows, not part of the invariant): v1 had unregistered=1 + §LEDGER_TICKER_INIT before the purge
  const S = '/tmp/claude-1000/-home-red1-bim-compiler/cdf78573-99d9-42cf-92e2-f64ba3732e60/scratchpad/';
  [['v1 film_law_new.log', S + 'film_law_new.log'], ['v2 /tmp/film_law_v2.log', '/tmp/film_law_v2.log']].forEach(([n, f]) => { if (!fs.existsSync(f)) { console.log('    (real ' + n + ' absent)'); return; }
    const r = J.swRace(fs.readFileSync(f, 'utf8').split('\n')); console.log('    real ' + n + ': SW race=' + r.race + ' unregistered=' + r.unregistered + ' dupInit=' + (r.dupInit || []).join(',')); });
  const { Witness } = require('../../witness_kit/contract');
  return new Promise(res => { Witness('ALTS_ALL_SELFTEST')
    .population(() => rows)
    .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
    .invariant('every GIGO state triggers and the GREEN fixtures pass', rs => rs.length >= 26 && rs.every(r => r.ok))
    .redControl(rs => rs.map(r => /GREEN still/.test(r.name) ? Object.assign({}, r, { ok: J.gate(stillRows(stillRec('inner', 'base', { sw: 'v1' }))) === 'PASS' }) : r))
    .run(); res(process.exitCode ? 1 : 0); });
}
module.exports = { run };
if (require.main === module) run().then(c => { process.exitCode = c; });
