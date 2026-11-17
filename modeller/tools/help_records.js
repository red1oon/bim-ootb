// ⚠ DO NOT REMOVE — modeller/tools/help_records.js: the MODELLER ADAPTER of the help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.4 Step 4; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §4).
// READ THE LOG of the build (`§HQ_BUILD` lines) and of W-HQ-SELF / W-HQ-RANK-TWIN / H-SUPERSET after a build. An exit code is not evidence.
// It only LISTS records from sources that already exist: modeller/modeller.html's own #bar buttons (id, <span> name), SHORTCUTS, KEY_ROWS and the guide SECTIONS, read out of the file (never re-typed here).
//   pill   a #bar tool (n = its name) and a keyboard-only row (n = its verb); a = [the shortcut, the English name when the locale's differs]
//   guide  a guide section: n = its title, h = its paragraph (English only, as the page shows it; tags stripped by the rule the old filter used)
// The Modeller is a DICTIONARY PAGE (viewer/locale_loader.js §R3): it shows a locale's text for an English text equal to a base msgtext. Names are mapped the same way here (first key of en_MY.json whose
// trimmed msgtext equals the English wins, only when the locale has a text for that key); no row = the English stays. The English name is also indexed (a), because the page's own entry names are the English
// until the dictionary pass runs, and the old filter matched them. `go` = {hkey} is the panel's join key: the live entry's hkey (#bar button id; 'key:<verb>'; 'guide:<title>').
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const T = require(path.join(__dirname, '..', '..', 'viewer', 'tools', 'trl_common'));
const MODELLER = path.join(__dirname, '..'), KINDS = ['pill', 'guide'];
const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// the same text rule as the old filter's body read (help_panel.js before §19.4): tags are not words, &#39; and &amp; unescaped
const strip = (html) => tidy(String(html).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
// evaluate the array / object literal that follows `head` in modeller.html, up to its closing bracket (the first of `end` after it), in an EMPTY context (the literals hold strings only)
function lit(src, head, end) {
  const a = src.indexOf(head), s = a < 0 ? -1 : a + src.slice(a).search(/[\[{]/), b = s < 0 ? -1 : src.indexOf(end, s);
  if (a < 0 || s < 0 || b < 0) throw new Error('modeller.html: ' + head + ' not found');
  return vm.runInNewContext('(' + src.slice(s, b + end.search(/[\]}]/) + 1) + ')', {});
}
function sourceOf(src) {
  return { SHORT: lit(src, 'const SHORTCUTS = ', '};'), KEYS: lit(src, 'const KEY_ROWS = ', '\n    ];'), SECTIONS: lit(src, 'const SECTIONS = ', '\n  ];') };
}
function barButtons(src) {
  const a = src.indexOf('<div id="bar">'); if (a < 0) throw new Error('modeller.html: #bar not found');
  const blk = src.slice(a, src.indexOf('</div>', a)), out = []; const re = /<button id="([^"]+)"([^>]*)>([\s\S]*?)<\/button>/g; let m;
  while ((m = re.exec(blk))) { if (!/class="ic"/.test(m[3])) continue; const s = m[3].match(/<span>([\s\S]*?)<\/span>/); if (s) out.push({ id: m[1], name: tidy(unesc(s[1])) }); }
  return out;
}
function dictionary(lang) {   // English text -> the locale's text, as locale_loader.js _dictBuild makes it
  const en = JSON.parse(fs.readFileSync(path.join(T.I18N, T.BASE + '.json'), 'utf8')).labels, lb = JSON.parse(fs.readFileSync(path.join(T.I18N, lang + '.json'), 'utf8')).labels, m = {};
  Object.keys(en).forEach((k) => { const e = en[k], v = lb[k]; if (typeof e === 'string' && e.trim().length > 1 && typeof v === 'string' && v && !m[e.trim()]) m[e.trim()] = v; });
  return (s) => (m[s] != null ? m[s] : s);
}
function load(lang) {
  const src = fs.readFileSync(path.join(MODELLER, 'modeller.html'), 'utf8'), S = sourceOf(src), tr = dictionary(lang), bar = barButtons(src), recs = [];
  if (!bar.length || !S.KEYS.length || !S.SECTIONS.length) throw new Error('modeller adapter: nothing read (bar ' + bar.length + ', keys ' + S.KEYS.length + ', sections ' + S.SECTIONS.length + ')');
  const alias = (en, loc, extra) => { const a = [], seen = new Set([tidy(loc).toLowerCase()]); [extra, en].forEach((x) => { const t = tidy(x || ''); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); a.push(t); } }); return a; };
  bar.forEach((b) => { if (b.id === 'm-help') return; const n = tidy(tr(b.name)), a = alias(b.name, n, S.SHORT[b.id]);
    recs.push(Object.assign({ id: 'pill/' + b.id, k: 'pill', n }, a.length ? { a } : {}, { go: { hkey: b.id } })); });
  S.KEYS.forEach((r) => { const n = tidy(tr(r[1])), a = alias(r[1], n, r[2]); recs.push(Object.assign({ id: 'pill/key:' + r[1], k: 'pill', n }, a.length ? { a } : {}, { go: { hkey: 'key:' + r[1] } })); });
  S.SECTIONS.forEach((sec, i) => { const n = tidy(tr(sec[0])), a = alias(sec[0], n); recs.push(Object.assign({ id: 'guide/' + String(i).padStart(2, '0'), k: 'guide', n }, a.length ? { a } : {}, { h: strip(sec[1]), go: { hkey: 'guide:' + sec[0] } })); });
  const order = {}; KINDS.forEach((k, i) => { order[k] = i; });
  recs.sort((a, b) => order[a.k] - order[b.k] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // the builder no longer sorts: the file is deterministic by kind order, then id (the adapter's duty)
  return { records: recs, kinds: KINDS, ntexts: 0, resolve: () => '' };
}
module.exports = { app: 'modeller', kinds: KINDS, langs: T.LOCALES, load, sourceOf, barButtons, strip, outFile: (lang) => path.join(MODELLER, 'help', 'index', lang + '.json') };
