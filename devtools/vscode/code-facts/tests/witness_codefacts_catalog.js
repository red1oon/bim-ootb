#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CODEFACTS-CATALOG (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.28, decision F-19, bim-ootb #3101).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a message key or a door verb in the code says nothing in the editor: its text, its {n} count, its
//   line in the JSON and a wrong key are found only when the line runs". After: hover, F12 and warnings, from the ONE scanner.
// POPULATION: EVERY key use in the catalog users of this checkout (files that reference msg_core/MsgCore, outside tests/), and EVERY
//   verb in common/door/verbs.json. Each is judged against messages.json / verbs.json read here with JSON.parse (an independent
//   source, not the lib's own answer). An empty population → INCONCLUSIVE.
// RED CONTROLS: a made-up key → exactly one unknown-key warning on that line; one extra argument → one arg-count; unchanged files →
//   none; an erp/processes file with another `.t(` API → none here, while the bare check on it does find some (the scope rule's red).
// Read-only on this checkout: the edited texts are document stubs, never written. Not proven: how VS Code draws it.
// Command: node devtools/vscode/code-facts/tests/witness_codefacts_catalog.js
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXT = path.resolve(__dirname, '..');
const C = require(path.join(EXT, 'lib', 'catalog_index.js'));
const MSG = path.join(ROOT, C.PATHS.messages), VERBS = path.join(ROOT, C.PATHS.verbs), KEYS = path.join(ROOT, C.PATHS.keys);

let fail = 0, judged = 0;
function check(label, cond) { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }

if (![MSG, VERBS, KEYS].every(f => fs.existsSync(f))) { console.log('§CODEFACTS_CATALOG_W missing catalog files verdict=INCONCLUSIVE'); process.exit(0); }
const messages = JSON.parse(fs.readFileSync(MSG, 'utf8')).messages;      // the independent reading
const verbList = JSON.parse(fs.readFileSync(VERBS, 'utf8')).verbs.map(v => v.verb);
const msgLines = fs.readFileSync(MSG, 'utf8').split('\n'), verbLines = fs.readFileSync(VERBS, 'utf8').split('\n');
const K = require(KEYS);

const jsFiles = cp.execSync('git ls-files "*.js"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(f => f && !/node_modules|\.min\.js$/.test(f));
const J = require(path.join(ROOT, C.PATHS.tokenizer)), code = t => J.scan(t).code;   // comments blanked, as Code Facts does (§F.28)
const users = jsFiles.filter(f => { try { return C.isCatalogUser(f, code(fs.readFileSync(path.join(ROOT, f), 'utf8'))); } catch (e) { return false; } });

const { reg, restore } = require('./vscode_stub').install(ROOT);
const ext = require(path.join(EXT, 'extension.js'));
const os = require('os');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'code-facts-catalog-'));
const api = ext.activate({ subscriptions: [], extensionPath: EXT, storageUri: { fsPath: STORE } });
const docOf = (abs, text) => { const L = text.split('\n'); return { uri: { fsPath: abs, scheme: 'file' }, getText: () => text, lineAt: i => ({ text: L[i] }) }; };
const pos = (line0, ch) => ({ line: line0, character: ch });
const hoversAt = (d, p) => reg.hover.map(h => h.p.provideHover(d, p)).filter(Boolean).map(h => h.contents.value);
const defsAt = (d, p) => reg.definition.map(x => x.p.provideDefinition(d, p)).filter(Boolean);
const quote = s => '«' + String(s).replace(/\n/g, ' ⏎ ') + '»';

// C1: every key use hovers to its own en text and F12 lands on its "key": line.
let uses = 0, hoverOk = 0, defOk = 0;
const badUse = [];
for (const f of users) {
  const abs = path.join(ROOT, f), text = fs.readFileSync(abs, 'utf8'), d = docOf(abs, text), L = text.split('\n');
  for (const u of K.scan(code(text), f)) {
    if (u.key === null) continue;
    uses++;
    const lineText = L[u.line - 1], at = lineText.indexOf(u.key, u.col - 1);
    const p = pos(u.line - 1, at < 0 ? u.col - 1 : at + 1);
    const hs = hoversAt(d, p), want = 'en: ' + quote(messages[u.key] ? messages[u.key].en : '(missing)');
    if (hs.length === 1 && hs[0].includes('`' + u.key + '`') && hs[0].includes(want)) hoverOk++; else badUse.push(f + ':' + u.line + ' ' + u.key + ' hovers=' + hs.length);
    const ds = defsAt(d, p);
    if (ds.length === 1 && ds[0].uri.fsPath === MSG && new RegExp('^\\s*"' + u.key.replace(/\./g, '\\.') + '"\\s*:').test(msgLines[ds[0].position.line])) defOk++;
  }
}
console.log('    catalog users: ' + users.join(', ') + ' · key uses=' + uses);
if (badUse.length) console.log('    first misses: ' + badUse.slice(0, 5).join(' | '));
check('C1 every key use (' + uses + ') hovers to messages.json\'s en for that key (' + hoverOk + '/' + uses + ')', uses > 0 && hoverOk === uses);
check('C1 F12 on every key use lands on its "key": line in messages.json (' + defOk + '/' + uses + ')', uses > 0 && defOk === uses);

// C2: every verb, as a string literal, hovers to its title and F12 lands on its "verb": line.
let vHover = 0, vDef = 0;
const probe = path.join(ROOT, 'codefacts_catalog_probe_not_written.js');
for (const v of verbList) {
  const line = "door.run('" + v + "', args);", d = docOf(probe, line), p = pos(0, 11);
  const title = (JSON.parse(fs.readFileSync(VERBS, 'utf8')).verbs.find(x => x.verb === v) || {}).title || '';
  const hs = hoversAt(d, p);
  if (hs.length === 1 && hs[0].includes('`' + v + '`') && hs[0].includes(title)) vHover++;
  const ds = defsAt(d, p);
  if (ds.length === 1 && ds[0].uri.fsPath === VERBS && verbLines[ds[0].position.line].includes('"' + v + '"')) vDef++;
}
check('C2 every verb in verbs.json (' + verbList.length + ') hovers to its title (' + vHover + '/' + verbList.length + ')', verbList.length > 0 && vHover === verbList.length);
check('C2 F12 on every verb lands on its "verb": line (' + vDef + '/' + verbList.length + ')', verbList.length > 0 && vDef === verbList.length);
check('C2 RED: a dotted string that is no verb gives no hover and no jump', hoversAt(docOf(probe, "x('mis.not_a_verb_zz')"), pos(0, 5)).length === 0 && defsAt(docOf(probe, "x('mis.not_a_verb_zz')"), pos(0, 5)).length === 0);

// C3: warnings, with red controls (document stubs only; nothing is written).
const diag = () => reg.diags['code-facts-catalog'];
const clean = users.map(f => api.judgeCatalog(docOf(path.join(ROOT, f), fs.readFileSync(path.join(ROOT, f), 'utf8'))).length);
check('C3 the unchanged catalog users give no warning (' + clean.join(',') + ')', clean.length > 0 && clean.every(n => n === 0) && diag().m.size === 0);
const subj = users.find(f => /words_core\.js$/.test(f)) || users[0];
const sText = fs.readFileSync(path.join(ROOT, subj), 'utf8'), first = K.scan(code(sText), subj).find(u => u.key);
const L = sText.split('\n'), li = first.line - 1;
const madeUp = L.slice(); madeUp[li] = L[li].replace("'" + first.key + "'", "'words.zz_not_a_key'").replace('"' + first.key + '"', '"words.zz_not_a_key"');
const fU = api.judgeCatalog(docOf(path.join(ROOT, subj), madeUp.join('\n')));
const dU = diag().m.get(path.join(ROOT, subj)) || [];
check('C3 RED: a made-up key → ONE unknown-key warning on line ' + first.line + ' (' + fU.map(x => x.kind + '@' + x.line).join(',') + ')',
  fU.length === 1 && fU[0].kind === 'unknown-key' && fU[0].line === first.line && dU.length === 1 && dU[0].range.start.line === li);
const extra = L.slice(); const q = extra[li].indexOf(first.key) + first.key.length + 1; extra[li] = extra[li].slice(0, q) + ', 99' + extra[li].slice(q);
const fA = api.judgeCatalog(docOf(path.join(ROOT, subj), extra.join('\n')));
check('C3 RED: one extra argument → ONE arg-count warning (' + fA.map(x => x.kind + ' ' + x.detail).join(',') + ')', fA.length === 1 && fA[0].kind === 'arg-count');
api.judgeCatalog(docOf(path.join(ROOT, subj), sText));
check('C3 restoring the text clears the warning', !diag().m.has(path.join(ROOT, subj)));
const commented = sText + "\n// e.g. M('words.zz_in_a_comment') is only prose\n";
check('C3 a key spelled in a COMMENT of a catalog user gives no warning and no hover', api.judgeCatalog(docOf(path.join(ROOT, subj), commented)).length === 0 && hoversAt(docOf(path.join(ROOT, subj), commented), pos(commented.split('\n').length - 2, 12)).length === 0);
api.judgeCatalog(docOf(path.join(ROOT, subj), sText));
const other = jsFiles.filter(f => /^erp\/processes\//.test(f)).find(f => K.scan(fs.readFileSync(path.join(ROOT, f), 'utf8'), f).length > 0);
if (other) {
  const oText = fs.readFileSync(path.join(ROOT, other), 'utf8');
  const bare = K.check(JSON.parse(fs.readFileSync(MSG, 'utf8')), K.scan(oText, other), {}).filter(x => C.FILE_KINDS.includes(x.kind)).length;
  const scoped = api.judgeCatalog(docOf(path.join(ROOT, other), oText)).length;
  check('C3 RED (scope): ' + other + ' — the bare check finds ' + bare + ', Code Facts shows ' + scoped + ' (not a catalog user)', bare > 0 && scoped === 0);
} else check('C3 RED (scope): no erp/processes file matches the call pattern any more — re-measure §F.28 scope', false);

restore();
fs.rmSync(STORE, { recursive: true, force: true });
const verdict = judged === 0 || uses === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
console.log('§CODEFACTS_CATALOG_W users=' + users.length + ' uses=' + uses + ' hover_ok=' + hoverOk + ' def_ok=' + defOk + ' verbs=' + verbList.length
  + ' verb_hover_ok=' + vHover + ' verb_def_ok=' + vDef + ' checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
if (verdict !== 'PASS') process.exitCode = 1;
