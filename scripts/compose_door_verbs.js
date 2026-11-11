#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — compose_door_verbs.js: the ONE writer of common/door/verbs.json (bim-compiler prompts/CLI_ERP_IVR.md §10, §11). Read the §VOCAB_COMPOSE lines after every run.
// verbs.json is COMPOSED output; no source writes into another's entries. Sources, in this order:
//   hand          common/door/vocab/hand.json            every entry not derived from the dictionary
//   ad-documents  scripts/gen_erp_door_verbs.js          erp.find, erp.actions, one erp.<action> per offered DocAction (document life: ERP)
//   ad-records    the same generator, the record verbs   mis.describe/read/list/sum/group/new: the same on ANY AD table (MIS is the base, owner 2026-11-10)
//   aliases       ALIASES below                          the old names, as FULL cloned entries (alias_of, deprecated, no mcp_name) so every reader of verbs.json sees an ordinary verb
// A verb name claimed by two sources is refused. Usage: node scripts/compose_door_verbs.js [--check]   (--check writes nothing, exits 1 if verbs.json is not what the composer writes)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const RECORDS = { 'erp.describe': 'mis.describe', 'erp.read': 'mis.read', 'erp.list': 'mis.list', 'erp.sum': 'mis.sum', 'erp.group': 'mis.group', 'erp.new': 'mis.new' };   // generated verbs that are MIS (any AD table)
const HAND_OLD = { 'erp.column': 'mis.column', 'erp.compare': 'legacy.compare', 'erp.pack': 'mis.pack', 'erp.legacy_plugin': 'legacy.plugin' };   // hand verbs renamed; the old name stays as an alias
const ALIASES = Object.assign({}, HAND_OLD, RECORDS);   // old -> canonical
const say = (s) => console.log('§VOCAB_COMPOSE ' + s);
const clone = (o) => JSON.parse(JSON.stringify(o));
async function compose(opts) {
  opts = opts || {};
  const hand = JSON.parse(fs.readFileSync(process.env.COMPOSE_HAND || path.join(ROOT, 'common/door/vocab/hand.json'), 'utf8'));   // COMPOSE_HAND: a test-only alternative hand source (W-VOCAB-COMPOSE C2)
  const gen = await require('./gen_erp_door_verbs.js').generate();
  const docs = gen.filter(e => !RECORDS[e.verb]), recs = gen.filter(e => RECORDS[e.verb]).map(e => Object.assign(clone(e), { verb: RECORDS[e.verb], app: 'mis' }));
  const sources = { hand: hand.verbs, 'ad-documents': docs, 'ad-records': recs };
  const claimed = new Map(), out = [];
  for (const [src, list] of Object.entries(sources)) for (const e of list) {
    if (claimed.has(e.verb) && !process.env.COMPOSE_BREAK) throw new Error('verb ' + e.verb + ' is claimed by two sources: ' + claimed.get(e.verb) + ' and ' + src);
    claimed.set(e.verb, src); out.push(e);
  }
  const by = new Map(out.map(e => [e.verb, e])), al = [];
  for (const [old, canon] of Object.entries(ALIASES)) {
    const c = by.get(canon); if (!c) throw new Error('alias ' + old + ' -> ' + canon + ': no such canonical verb');
    if (by.has(old) && !process.env.COMPOSE_BREAK) throw new Error('alias ' + old + ' is also claimed by a source');
    const a = clone(c); a.verb = old; a.app = old.split('.')[0]; a.alias_of = canon; a.deprecated = true; delete a.mcp_name; delete a.common; a.title = c.title + ' (old name of ' + canon + ')'; al.push(a);
  }
  const doc = Object.assign({}, { vocabulary: hand.vocabulary, version: hand.version, spec: hand.spec }, { verbs: out.concat(al) });
  say('hand=' + hand.verbs.length + ' ad-documents=' + docs.length + ' ad-records=' + recs.length + ' aliases=' + al.length + ' total=' + doc.verbs.length);
  return JSON.stringify(doc, null, 1) + '\n';
}
async function main(argv) {
  const text = await compose(), vf = path.join(ROOT, 'common/door/verbs.json'), cur = fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8') : '';
  if (argv.includes('--check')) { say(text === cur ? 'CURRENT' : 'STALE'); process.exit(text === cur ? 0 : 1); }
  fs.writeFileSync(vf, text); say('written ' + vf);
}
module.exports = { compose, main, ALIASES };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('§VOCAB_COMPOSE FAIL ' + e.message); process.exit(1); });
