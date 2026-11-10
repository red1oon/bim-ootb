#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MODELLER-WALK (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.13 item 2). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: the verb `modeller.walk` misreports what the shipped walker places, walks a residential building on Terminal rules (Walker Doctrine), or changes the model file.
 * No browser, no GPU. Buildings: the PUBLIC Duplex (residential) and Hospital (terminal class), every discipline their rules hold (read from the rules, never a hand list).
 * The expected counts come from a DIRECT walkLive call in this process (the same call fleet_band_table.js makes), tallied here by hand, not by the verb's own summarize.
 * Falsifiers (each must make this witness FAIL): WALK_BREAK=plus1 (the verb adds one) · WALK_BREAK=terminal (the verb walks Duplex on the non-residential rules).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { kit, run, stripMs, ROOT, DOOR } = require('../../common/door/tests/_kit');
const k = kit('W-MODELLER-WALK');
const MOD = path.join(ROOT, 'modeller'), sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const BUILDINGS = (process.env.WALK_BUILDINGS || 'Duplex,Hospital').split(',');

(async () => {
  const H = require('../tools/walk_node.js'), WalkRules = require(path.join(ROOT, 'common', 'walk_rules.js'));
  const SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) });
  const manifest = JSON.parse(fs.readFileSync(path.join(MOD, 'buildings_manifest.json'), 'utf8')).buildings;
  const jdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwalk_')); let seq = 0;
  const door = async (line, actor) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'mw-' + (++seq), '--journal', path.join(jdir, 'journal.jsonl'), line]); let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* judged below */ } return { r, j }; };
  const quiet = (fn) => { const l = console.log, kept = []; console.log = (s) => kept.push(String(s)); try { return { v: fn(), kept }; } finally { console.log = l; } };
  let walksJudged = 0, placedSomething = 0;
  for (const b of BUILDINGS) {
    const ent = manifest.filter(x => x.key === b)[0], file = ent && path.join(MOD, ent.db);
    if (!ent || !fs.existsSync(file) || fs.statSync(file).size < 10240) { k.incon('MODEL-' + b, 'no model file for ' + b + ' in this checkout'); continue; }
    const before = sha(file), stack = await H.loadStack(SQL);
    const sel = quiet(() => H.openBuildingRules(SQL, stack, b)).v, discs = stack.DW.disciplines();
    const geoF = [process.env.VIEWER_BLD_DIR, path.join(ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean).map(d => path.join(d, b + '_geo.db')).filter(f => fs.existsSync(f) && fs.statSync(f).size > 10240)[0] || null;
    k.L(b + ' model=' + ent.db + ' rules(owner)=' + WalkRules.rulesDb(b) + ' disciplines=' + discs.join(',') + ' geo=' + (geoF ? path.basename(geoF) : 'none'));
    if (!discs.length) { k.incon('DISC-' + b, 'the rules hold no discipline'); continue; }
    for (const d of discs) {
      // expected: a direct call, a fresh rules registration per walk (as the CLI process has), tallied by hand
      const st2 = await H.loadStack(SQL); quiet(() => H.openBuildingRules(SQL, st2, b));
      const geoDb = geoF ? new SQL.Database(new Uint8Array(fs.readFileSync(geoF))) : null;
      const w = quiet(() => H.walkLive(SQL, st2, d, new Uint8Array(fs.readFileSync(file)), b, [], geoDb ? { geoDb } : {})).v, P = w.placements || [], cls = {};
      P.forEach(q => { const c = q.ifc_class || '?'; cls[c] = (cls[c] || 0) + 1; });
      if (geoDb) geoDb.close();
      const g = await door('modeller.walk building=' + b + ' discipline=' + d), a = g.j && g.j.answer;
      walksJudged++; if (P.length) placedSomething++;
      const sortJ = (o) => JSON.stringify(Object.keys(o || {}).sort().map(x => [x, o[x]]));
      if (P.length) k.chk(b + ' ' + d + ': the verb\'s count and counts by class = the direct walk', !!a && g.j.status === 'ok' && a.count === P.length && sortJ(a.byClass) === sortJ(cls), 'door=' + (a ? a.count : g.j && g.j.status + ' ' + g.j.why) + ' direct=' + P.length + ' classes=' + sortJ(cls).slice(0, 120));
      else k.chk(b + ' ' + d + ': a walk that places nothing is inconclusive with the walker\'s reason, never ok with 0', !!g.j && g.j.status === 'inconclusive' && a && a.count === 0 && a.verdict === 'VACUOUS', (g.j ? g.j.status + ' ' + g.j.why : g.r.err.slice(-160)) + ' directReason=' + (w.reason || '-'));
      if (a) k.chk(b + ' ' + d + ': the answer names the rules the owner selects (' + WalkRules.rulesDb(b) + ') and the labels add up', a.rules === WalkRules.rulesDb(b) && a.rules === sel.rules && Object.values(a.byHostState).reduce((s, n) => s + n, 0) === a.count && Object.values(a.byProv).reduce((s, n) => s + n, 0) === a.count && a.modelUnchanged === true, 'rules=' + a.rules + ' hostState=' + JSON.stringify(a.byHostState) + ' prov=' + JSON.stringify(a.byProv));
    }
    k.chk(b + ': the model file is byte-identical after every walk (sha256)', sha(file) === before, before.slice(0, 16));
  }
  if (!walksJudged) k.incon('WALKS', 'no walk was run'); else if (!placedSomething) k.incon('WALKS', 'no walk placed anything, so no count was judged');
  // Walker Doctrine: the residential building is on duplex_rules.db, and the two classes really differ (so the check is not vacuous)
  k.chk('DOCTRINE the owner sends Duplex to duplex_rules.db and Hospital to terminal_rules.db', WalkRules.rulesDb('Duplex') === 'duplex_rules.db' && WalkRules.rulesDb('Hospital') === 'terminal_rules.db', WalkRules.rulesDb('Duplex') + ' / ' + WalkRules.rulesDb('Hospital'));
  // wrong names are errors naming them; nothing is walked
  const ud = await door('modeller.walk building=Duplex discipline=XX'), ub = await door('modeller.walk building=NoSuchBuilding discipline=FP');
  k.chk('NAMES an unknown discipline is an error naming it and listing the disciplines the rules hold', ud.j && ud.j.status === 'error' && /unknown discipline "XX"/.test(ud.j.why) && /FP/.test(ud.j.why), ud.j && ud.j.why);
  k.chk('NAMES an unknown building is an error naming it and listing the Open list', ub.j && ub.j.status === 'error' && /unknown building "NoSuchBuilding"/.test(ub.j.why) && /Duplex/.test(ub.j.why), ub.j && ub.j.why);
  // one line, two actors
  const h = await door('modeller.walk building=Duplex discipline=FP', 'human'), ai = await door('modeller.walk building=Duplex discipline=FP', 'ai');
  const norm = (j) => { const o = JSON.parse(stripMs(j)); delete o.request; delete o.actor; return JSON.stringify(o).replace(/heapDeltaMB=-?[\d.]+/g, 'heapDeltaMB=*'); };   // the walker's own line carries the process heap delta, which is not the walk's result
  k.chk('ACTOR a person and an AI get the same envelope apart from request, actor, ms and the heap figure in the walker\'s own log line (a read: both run)', h.j && ai.j && ai.j.status === 'ok' && norm(h.j) === norm(ai.j), ai.j && ai.j.status);
  // the CLI source holds no write path
  const src = fs.readFileSync(path.join(MOD, 'tools', 'walk_cli.js'), 'utf8') + fs.readFileSync(path.join(MOD, 'tools', 'walk_node.js'), 'utf8');
  const writes = (src.match(/writeFileSync|appendFileSync|\.export\(\)|INSERT INTO|UPDATE [a-z_]+ SET/g) || []);
  k.chk('READ-ONLY the verb\'s two files hold no file write, no export, no INSERT or UPDATE', writes.length === 0, 'hits=' + writes.join(','));
  k.L('walks=' + walksJudged + ' placedSomething=' + placedSomething + (process.env.WALK_BREAK ? ' WALK_BREAK=' + process.env.WALK_BREAK : ''));
  k.end();
})().catch(e => { console.error('§W-MODELLER-WALK HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
