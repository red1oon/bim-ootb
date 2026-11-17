// ⚠ DO NOT REMOVE — viewer/tools/help_records.js: the VIEWER ADAPTER of the help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.4 Step 4; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §4).
// READ THE LOG of the build (`§HQ_BUILD` lines) and of W-HQ-SELF / W-HQ-RANK-TWIN / H-SUPERSET after a build. An exit code is not evidence.
// It only LISTS records from sources that already exist; it ranks nothing and invents nothing. Per Viewer locale (the 18 of viewer/i18n/<code>.json), in that locale's own words:
//   pill   every `_actions` entry of viewer/panels.js (id, English name, shortcut key, sub-rows) + the keyboard-only rows of showCommandPalette (viewer/scene.js);
//          n = the pill's name (label `pill_<id>`), a = [its shortcut], d = its sub-rows (labels `pillc_<id>_<i>`, one per line), h = its CLI titles + verbs (viewer/help/howto.json)
//   howto  one per pill that has a guide link: n = the guide heading through the dictionary (label `howto_gh_<anchor>`, the rule of help_panel.js ghKey), go.via = 'howto'
// Fields the old substring filter read (name, shortcut, sub-rows, CLI titles + verb) are ALL indexed, so nothing that was findable is lost. IFC class text (labels ifccls_* / ifcdef_*) is NOT indexed:
// the Help panel has no row to open for a class, so a hit could not be shown (named in the PR; spec §19.4 lists it).
// `go` = {hkey} is the panel's join key: the live entry whose hkey (Viewer: the pill id; keyboard rows 'key:<SEQ>') it is. Nothing else reads it. No text is copied twice: a record holds its own strings.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');
const VIEWER = path.join(__dirname, '..'), KINDS = ['pill', 'howto'];
const read = (f) => fs.readFileSync(f, 'utf8');
const unq = (s) => s.replace(/\\(['\\])/g, '$1');
// the same rule as common/help/help_panel.js ghKey, W-HOWTO H6 and trl_batch_2026-11-17_howto_headings.js
const ghKey = (anchor) => 'howto_gh_' + String(anchor).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const pillKey = (id) => 'pill_' + String(id).toLowerCase().replace(/-/g, '_');
const childKey = (id, i) => 'pillc_' + String(id).toLowerCase().replace(/-/g, '_') + '_' + (i + 1);
// the pills of viewer/panels.js `var _actions = [ ... ];`: entries start at 6-space `{ id: '...'`; key is on the first lines (before icon:), children = the `{ name: '...' }` list at the end
function pillsOf(src) {
  const a = src.indexOf('var _actions = ['), b = src.indexOf('\n    ];', a);
  if (a < 0 || b < 0) throw new Error('panels.js: _actions block not found');
  const block = src.slice(a, b), starts = [], re = /^ {6}\{ id: '([A-Za-z0-9_-]+)',/gm; let m;
  while ((m = re.exec(block))) starts.push({ id: m[1], at: m.index });
  return starts.map((s, i) => {
    const t = block.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : block.length), nm = t.match(/name: '((?:[^'\\]|\\.)*)'/), head = t.slice(0, t.search(/\bicon:/) < 0 ? t.length : t.search(/\bicon:/));
    const k = head.match(/\bkey: (?:'((?:[^'\\]|\\.)*)'|null)/), ci = t.indexOf('children: ['), kids = [];
    if (ci >= 0) { const cre = /\{ name: '((?:[^'\\]|\\.)*)' \}/g; let c; const tail = t.slice(ci); while ((c = cre.exec(tail))) kids.push(unq(c[1])); }
    return { id: s.id, name: unq(nm[1]), key: k && k[1] ? unq(k[1]) : '', kids };
  });
}
// the keyboard-only rows of showCommandPalette in viewer/scene.js: all.push({ seq: 'X', hkey: 'key:X', name: _hT('key', 'English'), ... })
function keyRowsOf(src) {
  const a = src.indexOf('function showCommandPalette'), b = src.indexOf('window.HelpPanel.toggle(cfg)', a), blk = src.slice(a, b), out = [];
  const re = /seq: (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"), hkey: (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"), name: _hT\('([A-Za-z0-9_]+)', '((?:[^'\\]|\\.)*)'\)/g; let m;
  while ((m = re.exec(blk))) out.push({ seq: unq(m[1] != null ? m[1] : m[2]), key: m[3], en: unq(m[4]) });
  return out;
}
const labelsOf = (lang) => JSON.parse(read(path.join(VIEWER, 'i18n', lang + '.json'))).labels;
const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();
function load(lang) {
  const L = labelsOf(lang), howto = JSON.parse(read(path.join(VIEWER, 'help', 'howto.json'))).pills;
  const pills = pillsOf(read(path.join(VIEWER, 'panels.js'))), keys = keyRowsOf(read(path.join(VIEWER, 'scene.js')));
  if (!pills.length || !keys.length) throw new Error('viewer adapter: no pills (' + pills.length + ') or key rows (' + keys.length + ') read from source');
  const lab = (k, en) => (typeof L[k] === 'string' && L[k] ? L[k] : en), recs = [];
  pills.forEach((p) => {
    const ht = howto[p.id] || {}, n = tidy(lab(pillKey(p.id), p.name)), kids = p.kids.map((c, i) => tidy(lab(childKey(p.id, i), c)));
    const cli = (ht.cli || []).map((c) => tidy(c.title) + '\n' + c.verb).join('\n');
    const a = p.key ? [p.key.toUpperCase()] : [];
    recs.push(Object.assign({ id: 'pill/' + p.id, k: 'pill', n }, a.length ? { a } : {}, kids.length ? { d: kids.join('\n') } : {}, cli ? { h: cli } : {}, { go: { hkey: p.id } }));
    if (ht.guide) recs.push({ id: 'howto/' + p.id, k: 'howto', n: tidy(lab(ghKey(ht.guide.anchor), ht.guide.heading)), go: { hkey: p.id, via: 'howto' } });
  });
  keys.forEach((r) => recs.push({ id: 'pill/key:' + r.seq, k: 'pill', n: tidy(lab(r.key, r.en)), a: [r.seq.toUpperCase()], go: { hkey: 'key:' + r.seq } }));
  const order = {}; KINDS.forEach((k, i) => { order[k] = i; });
  recs.sort((a, b) => order[a.k] - order[b.k] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // the builder no longer sorts: the file is deterministic by kind order, then id (the adapter's duty)
  return { records: recs, kinds: KINDS, ntexts: 0, resolve: () => '' };
}
module.exports = { app: 'viewer', kinds: KINDS, langs: T.LOCALES, load, pillsOf, keyRowsOf, ghKey, outFile: (lang) => path.join(VIEWER, 'help', 'index', lang + '.json') };
