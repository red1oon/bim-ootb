#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-MANIFEST-ROUNDTRIP (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B0 BUILD SPEC"; bim-ootb #3195).
// Read the log after every run: exit code is not evidence. Verdict line: §MANIFEST_ROUNDTRIP … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "the module lists kept by hand in pages, lazy lists and service workers cannot be rebuilt from one
//   manifest per app without losing or changing a byte".
// POPULATION: every owned file of the three apps (viewer/, erp/, modeller/), by git ls-files: pages, loaders with a 'file?v=N' literal, sw.js.
// DENOMINATOR: sites (one reference in one file) per kind, and precache entries.
// Byte identity alone only shows that manifest + frame lose nothing. So each claim is judged against a source that is NOT the generator:
//   C1 every script tag is a site      — raw `<script …src=` count on the page minus on the frame; bump.js's own PAGE_REF regex
//   C2 precache list + CACHE_VERSION   — the committed sw.js RUN in a Node vm
//   C3 loader sites                    — bump.js's own JS_REF regex against the parser's literals
//   C4 the frame holds no module data  — the frame re-read: 0 sites
//   C5 the manifest drives the output  — for EVERY versioned site: +1 in the manifest, regenerate, the bytes change inside that site only
//   C6 viewer counts                   — tests/audit_sw_precache.js's own summary lines
//   C7 sites = today's writer          — a `scripts/bump.js` dry run of every target, its §BUMP lines
// RED CONTROLS (same run, each must be DETECTED): R1 two adjacent tags swap places in the manifest · R2 one precache entry dropped ·
//   R3 CACHE_VERSION changed · R4 reader fixtures on a copy of the real modeller.html · R5 the order checker on a SYNTHETIC edge, then swapped.
// NOT JUDGED: real load-order dependencies. None is declared today (order_check=NOT-JUDGED); R5 proves the refusal code only.
// INCONCLUSIVE: an app with 0 sites, a parse failure, a red control not detected, the vm run throws, bump or the audit prints no line, C5 judged 0.
// Command: node scripts/tests/witness_manifest_roundtrip.js   (~1 min; --skip-c7 leaves out the bump.js dry run, ~5 s: CI uses it and says c7=NOT-RUN)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), say = s => process.stdout.write(s + '\n');
const G = require(path.join(ROOT, 'scripts', 'gen_manifest.js')), R = require(path.join(ROOT, 'scripts', 'lib', 'page_refs.js'));
const clone = o => JSON.parse(JSON.stringify(o));
const SKIP_C7 = process.argv.includes('--skip-c7'), NCLAIMS = SKIP_C7 ? 6 : 7;
// the two regexes of scripts/bump.js (PAGE_REF, JS_REF), quoted here as the independent second reader
const PAGE_REF = /((?:src|href)\s*=\s*")([^"?#]+)\?v=(\d+)(")/g, JS_REF = /((['"]))([^'"\s?#]+\.(?:js|css|json|wasm))\?v=(\d+)(\2)/g;
const RAW_TAG = /<script[^>]+src=/g, count = (s, re) => (s.match(re) || []).length;

const r = G.check(ROOT);
r.fails.forEach(f => say('  §MANIFEST_FAIL ' + f)); r.lines.forEach(l => say('  ' + l));
const inconclusive = [], claims = [];
const claim = (id, ok, detail) => { claims.push({ id, ok }); say('  §MANIFEST_CLAIM id=' + id + ' ok=' + (ok ? 'Y' : 'N') + ' ' + detail); };
if (r.fails.some(f => /cannot parse/.test(f))) inconclusive.push('parse failure');

// rows: one per owned file
const rows = [];
for (const a of r.apps) for (const [file, fr] of a.frames) {
  const g = G.regenerate(a.manifest, a.frames, file);
  rows.push({ file, app: a.manifest.app, sites: fr.slots.length, identical: g.ok && g.text === fr.src });
}
r.apps.forEach(a => { if (!a.manifest.modules.reduce((n, m) => n + m.sites.length, 0)) inconclusive.push(a.manifest.app + ' has 0 sites'); });

// C1 + C3 + C4, per file
let c1ok = true, c3ok = true, c4ok = true, rawTags = 0, tagSites = 0, frameHits = 0, pageRegexOnly = 0, jsRegexOnly = 0, pageHits = 0, jsHits = 0;
for (const a of r.apps) for (const [file, fr] of a.frames) {
  if (file === a.manifest.sw) {
    const neutral = swap(fr, () => "''"), again = R.readSw(neutral);
    if (!again.parsed || again.precache.some(e => e.as !== '') || again.cacheVersion) { c4ok = false; say('  §MANIFEST_C4_MISS file=' + file); }
    continue;
  }
  const sites = []; a.manifest.modules.forEach(m => m.sites.forEach(s => { if (s.in === file) sites[s.at] = s; }));
  const frame = G.frameText(fr), inside = (pos, sl) => pos >= sl.start && pos < sl.end;
  if (file.endsWith('.html')) {
    const tags = sites.filter(s => s.kind === 'tag').length, raw = count(fr.src, RAW_TAG), left = count(frame, RAW_TAG);
    rawTags += raw; tagSites += tags; frameHits += left;
    const fh = R.readHtml(frame);
    if (raw - left !== tags) { c1ok = false; say('  §MANIFEST_C1_MISS file=' + file + ' raw=' + raw + ' frame=' + left + ' tag_sites=' + tags); }
    if (fh.tags.length || fh.assets.length) { c4ok = false; say('  §MANIFEST_C4_MISS file=' + file + ' tags_left=' + fh.tags.length + ' assets_left=' + fh.assets.length); }
    const hits = [...fr.src.matchAll(PAGE_REF)].map(m => m.index + m[1].length);
    pageHits += hits.length;
    fr.slots.forEach((sl, i) => { const s = sites[i]; if ((s.kind === 'tag' || s.kind === 'asset') && s.v != null && hits.filter(h => inside(h, sl)).length !== 1) { c1ok = false; say('  §MANIFEST_C1_MISS file=' + file + ' site=' + s.as + ' not seen by PAGE_REF'); } });
    pageRegexOnly += hits.filter(h => !fr.slots.some((sl, i) => (sites[i].kind === 'tag' || sites[i].kind === 'asset') && inside(h, sl))).length;
    const neutral = swap(fr, (sl, i) => sites[i].kind === 'inline' ? "''" : '');
    let leftLit = 0; R.readHtml(neutral).inline.forEach(b => { if (!b.type || /javascript|module/i.test(b.type)) leftLit += R.readJsSites(neutral.slice(b.start, b.end)).sites.length; });
    if (leftLit) { c4ok = false; say('  §MANIFEST_C4_MISS file=' + file + ' inline_literals_left=' + leftLit); }
  } else {
    const hits = [...fr.src.matchAll(JS_REF)].map(m => m.index);
    jsHits += hits.length;
    fr.slots.forEach((sl, i) => { if (/\.(js|css|json|wasm)$/.test(sites[i].as) && hits.filter(h => inside(h, sl)).length !== 1) { c3ok = false; say('  §MANIFEST_C3_MISS file=' + file + ' site=' + sites[i].as + ' not seen by JS_REF'); } });
    jsRegexOnly += hits.filter(h => !fr.slots.some(sl => inside(h, sl))).length;
    if (R.readJsSites(swap(fr, () => "''")).sites.length) { c4ok = false; say('  §MANIFEST_C4_MISS file=' + file); }
  }
}
function swap(fr, fn) { let out = '', pos = 0; fr.slots.forEach((sl, i) => { out += fr.src.slice(pos, sl.start) + fn(sl, i); pos = sl.end; }); return out + fr.src.slice(pos); }
claim('C1', c1ok && tagSites > 0, `raw_tag_hits=${rawTags} left_in_frames=${frameHits} (inline document.write text) tag_sites=${tagSites} page_ref_hits=${pageHits} regex_only=${pageRegexOnly}`);
claim('C3', c3ok && jsHits > 0, `js_ref_hits=${jsHits} lazy_sites=${r.tot.lazy} regex_only=${jsRegexOnly} (comments / non-literals the parser does not own)`);
claim('C4', c4ok, 'every frame re-read: 0 script tags, 0 versioned assets, 0 whole file?v=N literals, 0 precache strings');

// C2: run each committed sw.js
let swVm = 0; const vmOut = {};
for (const a of r.apps) {
  const m = a.manifest;
  try {
    const noop = () => {}, ctx = { console: { log: noop, warn: noop, error: noop, info: noop, debug: noop }, URL, setTimeout: noop, clearTimeout: noop, setInterval: noop, addEventListener: noop, importScripts: noop,
      caches: {}, fetch: noop, location: { href: 'https://example.invalid/' + m.sw, origin: 'https://example.invalid', pathname: '/' + m.sw, hostname: 'example.invalid', search: '' }, registration: { scope: 'https://example.invalid/' + m.app + '/' }, navigator: {} };
    ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, m.sw), 'utf8') + '\n;self.__out = { P: PRECACHE_ASSETS, V: CACHE_VERSION };', ctx, { timeout: 10000 });
    vmOut[m.app] = { P: Array.from(ctx.__out.P), V: String(ctx.__out.V) };
    const same = vmOut[m.app].V === m.cacheVersion && JSON.stringify(vmOut[m.app].P) === JSON.stringify(m.precacheOrder);
    if (same) swVm++;
    say(`  §MANIFEST_SW_VM app=${m.app} vm_entries=${vmOut[m.app].P.length} manifest_entries=${m.precacheOrder.length} vm_version=${vmOut[m.app].V} manifest_version=${m.cacheVersion} same=${same ? 'Y' : 'N'}`);
  } catch (e) { inconclusive.push('vm run of ' + m.sw + ' threw: ' + e.message); }
}
claim('C2', swVm === r.apps.length, `sw_vm=${swVm}/${r.apps.length}`);

// C5: every versioned site is driven by the manifest, and only that site moves
let driven = 0, drivenOf = 0;
for (const a of r.apps) {
  const m = clone(a.manifest);
  for (const mod of m.modules) for (const s of mod.sites) {
    if (s.v == null) continue;
    drivenOf++;
    const fr = a.frames.get(s.in), sl = fr.slots[s.at]; s.v++;
    const g = G.regenerate(m, a.frames, s.in, true); s.v--;   // m is already a JSON clone
    if (!g.ok || g.text === fr.src) { say('  §MANIFEST_C5_MISS file=' + s.in + ' site=' + s.as + ' not driven'); continue; }
    const tailLen = fr.src.length - sl.end;
    if (g.text.slice(0, sl.start) === fr.src.slice(0, sl.start) && g.text.slice(g.text.length - tailLen) === fr.src.slice(sl.end)) driven++;
    else say('  §MANIFEST_C5_MISS file=' + s.in + ' site=' + s.as + ' changed bytes outside its own range');
  }
}
if (!drivenOf) inconclusive.push('C5 judged 0 sites');
claim('C5', driven === drivenOf && drivenOf > 0, `driven=${driven}/${drivenOf}`);

// C6: the viewer audit's own numbers
{
  const out = cp.spawnSync('node', [path.join(ROOT, 'tests', 'audit_sw_precache.js')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).stdout || '';
  const t = /§SW_AUDIT_SUMMARY .*?(\d+) total/.exec(out), u = /§SW_AUDIT_UNLISTED_SUMMARY (\d+) precached.*?(\d+) scripts/.exec(out);
  if (!t || !u) inconclusive.push('tests/audit_sw_precache.js printed no summary line');
  else {
    const v = r.apps.find(a => a.manifest.app === 'viewer').manifest, skip = f => f.startsWith('http') || f.startsWith('//');
    const total = v.precacheOrder.filter(f => !(skip(f) || f === '/' || f === './' || f === '')).length, listed = new Set(v.precacheOrder);
    const tags = []; v.modules.forEach(m => m.sites.forEach(s => { if (s.in === 'viewer/viewer.html' && s.kind === 'tag' && !skip(s.as) && !s.as.startsWith('lib/')) tags.push(s.as); }));
    const pre = tags.filter(f => listed.has(f)).length;
    claim('C6', total === +t[1] && tags.length === +u[2] && pre === +u[1], `audit: total=${t[1]} scripts=${u[2]} precached=${u[1]} · manifest: total=${total} scripts=${tags.length} precached=${pre}`);
  }
}

// C7: one bump.js dry run of every target (the stop on "a loader and a lazy module it lists" that once needed batches here was fixed in #3201).
if (SKIP_C7) say('  §MANIFEST_CLAIM id=C7 ok=- NOT-RUN (--skip-c7: the bump.js dry run of every target takes about a minute; run without the flag before a merge that touches the generator)');
else {
  const owned = new Set(), want = new Set();
  for (const a of r.apps) {
    for (const f of a.frames.keys()) owned.add(f);
    a.manifest.modules.forEach(m => m.sites.forEach(s => { if (s.v != null && s.kind !== 'inline' && /\.(js|css|json|wasm)$/.test(s.as)) want.add(s.in + '|' + s.as + '|' + s.v); }));
  }
  const targets = new Set(); r.apps.forEach(a => a.manifest.modules.forEach(m => { if (m.sites.some(s => s.v != null && s.kind !== 'inline') && fs.existsSync(path.join(ROOT, m.file))) targets.add(m.file); }));
  const got = new Set(); let lines = 0, errs = '';
  for (const part of [[...targets]]) {
    if (!part.length) continue;
    const o = cp.spawnSync('node', [path.join(ROOT, 'scripts', 'bump.js'), ...part], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).stdout || '';
    for (const m of o.matchAll(/^§BUMP (?:page|loader)=(\S+) ref=(\S+) v=(\d+)->/mg)) { lines++; if (owned.has(m[1])) got.add(m[1] + '|' + m[2] + '|' + m[3]); }
    errs += (o.match(/^§BUMP_ERR.*$/mg) || []).join(' ; ');
  }
  if (!lines) inconclusive.push('the bump.js dry run printed no §BUMP line' + (errs ? ' (' + errs.slice(0, 200) + ')' : ''));
  const missing = [...want].filter(x => !got.has(x)), extra = [...got].filter(x => !want.has(x));
  missing.slice(0, 10).forEach(x => say('  §MANIFEST_C7_MISS manifest_site_bump_did_not_print=' + x));
  extra.slice(0, 10).forEach(x => say('  §MANIFEST_C7_EXTRA bump_line_with_no_manifest_site=' + x));
  claim('C7', lines > 0 && !missing.length && !extra.length, `bump_lines=${lines} in_owned_files=${got.size} manifest_sites=${want.size} missing=${missing.length} extra=${extra.length}` + (errs ? ' bump_err=' + JSON.stringify(errs.slice(0, 160)) : ''));
}

// red controls
const red = [], redSay = (id, detected, detail) => { red.push(detected); say('  §MANIFEST_RED id=' + id + ' detected=' + (detected ? 'Y' : 'N') + ' ' + detail); };
const V = r.apps.find(a => a.manifest.app === 'viewer'), MAIN = 'viewer/viewer.html';
const pair = m => { const t = []; m.modules.forEach(x => x.sites.forEach(s => { if (s.in === MAIN && s.kind === 'tag') t.push({ mod: x, s }); })); t.sort((p, q) => p.s.at - q.s.at); const i = t.findIndex((p, k) => t[k + 1] && t[k + 1].s.at === p.s.at + 1 && t[k + 1].mod !== p.mod && p.s.as !== t[k + 1].s.as); return [t[i], t[i + 1]]; };
{ const m = clone(V.manifest), [p, q] = pair(m), k = p.s.at; p.s.at = q.s.at; q.s.at = k; const g = G.regenerate(m, V.frames, MAIN);
  redSay('R1', g.ok && g.text !== V.frames.get(MAIN).src, `swapped the places of ${p.s.as} and ${q.s.as} in ${MAIN}`); }
{ const m = clone(V.manifest), gone = m.precacheOrder.splice(5, 1)[0], g = G.regenerate(m, V.frames, m.sw), vmSame = vmOut.viewer && JSON.stringify(vmOut.viewer.P) === JSON.stringify(m.precacheOrder);
  redSay('R2', (!g.ok || g.text !== V.frames.get(m.sw).src) && !vmSame, `dropped precache entry ${gone}: round trip ${g.ok ? 'differs' : 'refused (' + g.why + ')'}, vm list ${vmSame ? 'SAME' : 'differs'}`); }
{ const m = clone(V.manifest); m.cacheVersion = 'v1'; const g = G.regenerate(m, V.frames, m.sw);
  redSay('R3', g.ok && g.text !== V.frames.get(m.sw).src && (!vmOut.viewer || vmOut.viewer.V !== m.cacheVersion), 'CACHE_VERSION set to v1'); }
{ const src = fs.readFileSync(path.join(ROOT, 'modeller', 'modeller.html'), 'utf8'), base = R.readHtml(src), at = src.lastIndexOf('</body>');
  const plant = t => { const h = R.readHtml(src.slice(0, at) + t + src.slice(at)); return { tags: h.tags.length - base.tags.length, last: h.tags[h.tags.length - 1], inl: h.inline.length - base.inline.length }; };
  const a = plant('<!-- <script src="zz_planted.js?v=1"></script> -->\n'), b = plant('<script>var s = \'<script src="zz_planted.js?v=1"><\\/script>\';</script>\n'),
    c = plant('<script src="zz_planted.js?v=1"></script>\n'), d = plant('<script  src="zz_planted.js?v=1"></script>\n');
  const ok = a.tags === 0 && b.tags === 0 && b.inl === 1 && c.tags === 1 && c.last.canonical === true && c.last.as === 'zz_planted.js' && c.last.v === 1 && d.tags === 1 && d.last.canonical === false;
  redSay('R4', ok && base.tags.length > 0, `reader fixtures on modeller.html (${base.tags.length} tags): in a comment +${a.tags}, in an inline string +${b.tags}, a real tag +${c.tags} canonical=${c.last && c.last.canonical}, two spaces before src +${d.tags} canonical=${d.last && d.last.canonical} (refused)`); }
{ const m = clone(V.manifest), [p, q] = pair(m); q.mod.deps = [p.mod.file]; const before = G.checkOrder(m); const k = p.s.at; p.s.at = q.s.at; q.s.at = k; const after = G.checkOrder(m);
  redSay('R5', before.judged === 1 && before.errors.length === 0 && after.errors.length > 0, `synthetic=Y edge ${q.mod.file} -> ${p.mod.file}: in order errors=${before.errors.length}, swapped errors=${after.errors.length}`); }
if (red.some(x => !x)) inconclusive.push('a red control was not detected');

const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const res = Witness('MANIFEST_ROUNDTRIP')
  .population(() => rows)
  .schema({ type: 'object', required: ['file', 'app', 'sites', 'identical'], properties: { file: { type: 'string', minLength: 1 }, sites: { type: 'integer', minimum: 1 }, identical: { const: true } } })
  .invariant('every owned file regenerates byte-identical from its app manifest', rs => rs.every(x => x.identical))
  .invariant('every claim agrees with its independent source (C1-C7)', () => claims.length === NCLAIMS && claims.every(c => c.ok))
  .redControl(rs => { const m = clone(V.manifest), [p, q] = pair(m), k = p.s.at; p.s.at = q.s.at; q.s.at = k; const g = G.regenerate(m, V.frames, MAIN); return rs.map(x => x.file === MAIN ? Object.assign({}, x, { identical: g.ok && g.text === V.frames.get(MAIN).src }) : x); })
  .run();
const identical = rows.filter(x => x.identical).length, t = r.tot, order = r.apps.reduce((n, a) => n + a.order.judged, 0);
const verdict = inconclusive.length ? 'INCONCLUSIVE' : (res.fail || r.verdict !== 'PASS' || claims.some(c => !c.ok)) ? 'FAIL' : 'PASS';
inconclusive.forEach(x => say('  §MANIFEST_INCONCLUSIVE ' + x));
say(`§MANIFEST_ROUNDTRIP apps=${r.apps.length} files=${rows.length} sites=${t.tag + t.asset + t.inline + t.lazy} tag=${t.tag} asset=${t.asset} inline=${t.inline} lazy=${t.lazy} precache=${t.precache} identical=${identical}/${rows.length} driven=${driven}/${drivenOf} sw_vm=${swVm}/${r.apps.length} claims=${claims.filter(c => c.ok).length}/${NCLAIMS}${SKIP_C7 ? ' c7=NOT-RUN' : ''} red=${red.filter(Boolean).length}/5 order_check=${order ? 'JUDGED' : 'NOT-JUDGED'} verdict=${verdict}`);
if (verdict !== 'PASS') process.exitCode = 1;
