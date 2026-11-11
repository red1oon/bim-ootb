// ⚠ DO NOT REMOVE — W-VOCAB-COMPOSE (bim-compiler prompts/CLI_ERP_IVR.md §11; owner decision §10: MIS is the base, erp.* gives way). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (verbs.json drifts from its sources): composing the sources gives exactly the committed common/door/verbs.json.
//   C2 ISSUE (two sources claim one verb and one silently wins): a hand source that claims mis.list is REFUSED by name. Falsifier COMPOSE_BREAK=1 must FAIL it.
//   C3 ISSUE (a generator wipes hand verbs; the bug found 2026-11-11): every hand entry is in the composed file, unchanged and in the same relative order, incl. the four renamed hand verbs.
//   C4 ISSUE (an alias that quietly differs from its original): a vocabulary whose alias has another harm is REFUSED at load. Falsifier DOOR_BREAK=1 must FAIL it.
//   C5 ISSUE (the old name behaves differently): erp.describe and mis.describe answer alike (but for verb); an ai's erp.new and mis.new meet the same gate, same status, same op count.
//   C6 ISSUE (a vacuous pass): the populations (aliases, hand, generated) are stated and none is empty.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-VOCAB-COMPOSE');
(async () => {
  const CMP = path.join(ROOT, 'scripts/compose_door_verbs.js'), VF = path.join(ROOT, 'common/door/verbs.json'), HF = path.join(ROOT, 'common/door/vocab/hand.json');
  const V = JSON.parse(fs.readFileSync(VF, 'utf8')).verbs, H = JSON.parse(fs.readFileSync(HF, 'utf8'));
  const al = V.filter(v => v.alias_of), gen = V.filter(v => v.calls && v.calls.cli === 'erp_cli' && !v.alias_of);
  k.L('populations aliases=' + al.length + ' hand=' + H.verbs.length + ' generated=' + gen.length + ' total=' + V.length);
  if (!al.length || !H.verbs.length || !gen.length) { k.incon('C6', 'VACUOUS: a population is empty'); return k.end(); }
  k.chk('C6 populations stated and non-empty', true, 'aliases=' + al.length + ' hand=' + H.verbs.length + ' generated=' + gen.length);
  const c1 = spawnSync(process.execPath, [CMP, '--check'], { encoding: 'utf8' });
  k.chk('C1 composed sources == committed verbs.json', c1.status === 0 && /CURRENT/.test(c1.stdout), (c1.stdout || '').trim().split('\n').pop());
  const tmpHand = tmp('vc_') + '.json', dup = JSON.parse(JSON.stringify(H)); dup.verbs.push(Object.assign(JSON.parse(JSON.stringify(V.find(v => v.verb === 'mis.list'))), { alias_of: undefined }));
  fs.writeFileSync(tmpHand, JSON.stringify(dup));
  const c2 = spawnSync(process.execPath, [CMP, '--check'], { encoding: 'utf8', env: Object.assign({}, process.env, { COMPOSE_HAND: tmpHand }) });
  k.chk('C2 a hand source claiming mis.list is refused by name (not silently overridden)', c2.status !== 0 && /mis\.list is claimed by two sources/.test((c2.stdout || '') + (c2.stderr || '')), ((c2.stderr || c2.stdout) || '').trim().split('\n').pop().slice(0, 140));
  const pos = new Map(V.map((v, i) => [v.verb, i])), keep = H.verbs.every((h, i) => V[pos.get(h.verb)] && JSON.stringify(V[pos.get(h.verb)]) === JSON.stringify(h)) && H.verbs.map(h => pos.get(h.verb)).every((p, i, a) => i === 0 || p > a[i - 1]);
  const four = ['mis.column', 'legacy.compare', 'mis.pack', 'legacy.plugin'];
  k.chk('C3 every hand entry survives composition unchanged and in order; the four renamed hand verbs are there with their old names as aliases', keep && four.every(n => pos.has(n)) && ['erp.column', 'erp.compare', 'erp.pack', 'erp.legacy_plugin'].every(n => (V.find(v => v.verb === n) || {}).alias_of), 'hand=' + H.verbs.length);
  const bad = JSON.parse(fs.readFileSync(VF, 'utf8')); bad.verbs.find(v => v.verb === 'erp.list').harm = 'writes';
  const badF = tmp('vc_') + '.json'; fs.writeFileSync(badF, JSON.stringify(bad));
  let refused = null; try { require(path.join(ROOT, 'common/door/door.js')).loadVocab(badF); } catch (e) { refused = e.message; }
  k.chk('C4 an alias whose harm differs from its original makes the vocabulary fail to load', !!refused && /alias erp\.list differs from mis\.list/.test(refused), String(refused).slice(0, 120));
  const dir = path.dirname(tmp('vc_')), oplog = path.join(dir, 'ops.jsonl'), env = { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') };
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const door = (line, actor) => run(DOOR, ['--actor', actor, line], env).then(r => { let j = null; try { j = JSON.parse(r.out); } catch (e) { /* null */ } return j; });
  const norm = (j) => { const c = JSON.parse(JSON.stringify(j)); ['ms', 'request', 'actor', 'verb'].forEach(x => delete c[x]); return JSON.stringify(c); };
  const a = await door('erp.describe kind=Order', 'human'), b = await door('mis.describe kind=Order', 'human');
  k.chk('C5a erp.describe and mis.describe give the same answer but for the verb name', !!a && !!b && a.status === 'ok' && norm(a) === norm(b), 'status=' + (a && a.status) + '/' + (b && b.status) + ' bytes=' + (a ? norm(a).length : 0));
  const n0 = nops(), x = await door('erp.new kind=Order', 'ai'), n1 = nops(), y = await door('mis.new kind=Order', 'ai'), n2 = nops();
  k.chk('C5b an ai meets the same gate through the old and the new name: same status, same op count written', !!x && !!y && x.status === y.status && (n1 - n0) === (n2 - n1), 'old=' + (x && x.status) + ' ops+' + (n1 - n0) + ' new=' + (y && y.status) + ' ops+' + (n2 - n1));
  return k.end();
})().catch(e => { console.log('§W-VOCAB-COMPOSE ERROR ' + e.stack); process.exit(2); });
