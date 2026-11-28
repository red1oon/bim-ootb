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
// B1 (bim-compiler CODE_ARCHITECTURE_DESIGN.md Part B, "B1 BUILD SPEC" §6; #3244): an app with <app>/modules.json (the modeller) is a SOURCE app:
//   C8  the manifest is the source: generating from modules.json gives the committed bytes of every owned file (and itself, canonical)
//   C9  the switch moved nothing: the commit that added modules.json, minus its marker lines and its one CACHE_VERSION step, equals its parent
//   C10 the manifest equals the files as B0's reader sees them (sites, v, load, precache) and the sw.js vm run (list, version)
//   C11 a second --write changes 0 bytes; two sites added in either order give the same bytes; a removed site leaves the other order's bytes
//   C12 nothing new reaches the browser: no site, string literal or precache entry names modules.json
//   C13 every order-forcing candidate edge is reviewed (deps / uses / notDeps) and depsReview.tool is today's sha
//   C14 the declared order holds: 0 refusals, deps_declared > 0     C15 owner equals its extractor (witnesses are not stored: B-3 REVISED, #3326)
//   RED R6 swap a confirmed deps pair (both tags) · R7 a hand edit of one generated tag · R8 a <script src> outside the markers · R9 one manifest
//   line with its keys reordered · R10 a dep that loads later + a boot module depending on a lazy one · R11 an owner typed by hand · R12 one
//   candidate removed from all three lists -> INCONCLUSIVE unreviewed=1 · R13 a test-only change keeps C15 ok (#3326; FAILS on the code before it) ·
//   R14 a `witnesses` key typed back is refused · R15 --witnesses on a non-module exits 1. Each must be DETECTED.
// B2 part 1 ("B2 BUILD SPEC"; #3365), ERP switched in memory and in temp trees until erp/modules.json exists (trial=Y):
//   C16 the sites that carry their own `v` are exactly the ones B0's reader finds off their module's highest number (and every site equals the reader's)
//   C17 a bump of the modules with differing numbers writes the bytes the old regex arithmetic writes (regexBump, the in-witness oracle) on the same files (each site +1 from its own number)
//   C18 the pinned service-worker register literals never move: named as a target, or on a branch that changed sw.js (--changed)
//   C19 the deploy stamp's pattern (deploy-pages.yml) reads the manifest's cacheVersion from the generated sw.js
//   RED R16 a module's numbers on two pages swapped · R17 a site v deleted · R18 a site v equal to its module's · R19 a <script src> between two
//   marker pairs · R20 `pin` removed, then sw.js bumped · R21 a deps pair swapped on ONE of the pages that hold both (C20: the order holds on every page). (The spec numbers these R13-R17; R13-R15 were taken by #3326.) ERP's load order: not judged.
// NOT JUDGED in the viewer and ERP: their load order (no deps declared there yet); R5 proves the refusal code on a synthetic edge.
// INCONCLUSIVE: an app with 0 sites, a parse failure, a red control not detected, the vm run throws, bump or the audit prints no line, C5 judged 0.
// B4-HASH (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B4-HASH BUILD SPEC"; bim-ootb #3397): `?v=` is the first 8 hex of the SHA-256 of the file it names; modules.json holds no `v`.
//   C26 CODE-IS-CONTENT · C27 ONE-CODE · C28 STALE-REFUSED · C29 NO-CHANGE-NO-RAISE · C30 LOADER-CHAIN · C31 ALL-LOCAL; red controls R27-R29 (each claim can fail in the same run).
//   MOVED onto codes, none deleted: C5 (the manifest drives a site: its code is changed, not +1) · C7 (a bump of every changed target prints every site) · C10's `v` columns (now C26 + C27) ·
//   C11 (the two synthetic files are not on disk, so their tags are written without a code) · C16 (the sites that disagree: now C27, a module has ONE code) · C17 (the old regex arithmetic
//   survives as an oracle of WHICH sites a press touches, not of their numbers) · C18 C19 (pins, the deploy stamp: with changed targets) · R7 (a hand edit of a tag: now of its code) ·
//   R9 (the line shape) · R16 (two pages' numbers swapped: now one page's code reverted) · R17 (a site v deleted: now the code deleted by hand) · R18 (a typed v equal to its module's: now `v` typed
//   back into modules.json, refused by the schema) · R20 (without `pin`) · C23 C24 C25 R22 R26 (the touched target first).
//   `MANIFEST_W_OLD=<a tree of the code before B4-HASH>` runs C26-C31 on ITS files with ITS scripts/bump.js and gen_manifest.js (red runs): they must FAIL there.
// WO-2 (bim-compiler prompts/MOBILE_PERF.md "WO-2"; the phone gate): a new site kind `desk` = a 'file?v=<code>' literal inside the page's `_DESK = [[run 0 …], [run 1 …]]` block, written as a tag by `_desk(i)` off a phone.
//   Nothing above is weakened (C1-C31, R1-R29 judge the same populations and still pass); one claim and three red controls are ADDED because no existing claim sees a desk site (C1 reads tags, C3's regex reads
//   loaders, C5 drives versioned tag/asset/lazy sites): C32 DESK-SITES the manifest's desk sites equal a raw regex reading of the page's _DESK block (same files, same order), every run has exactly one `_desk(i)` call
//   after the block and in order, no desk file also has a static tag, config.js is the page's first tag and precedes the block, every desk module is `load: boot` and flagged `phone: false`  ·
//   RED R30 a run's `_desk(i)` call deleted -> C32 refuses · R31 a static tag planted for a desk file -> C32 refuses · R32 the ORDER check on desk sites: a deps edge from an earlier run's file to a later run's,
//   and from an earlier file of a run to a later one, are refused ("loads after"); the same edges the right way round are accepted.
// WO-33 (bim-compiler prompts/MOBILE_PERF.md "WO-33"; the desktop finds the gated files as early as before the gate): a new site kind `hint` = one static `<link rel="preload" as="script" href="file?v=<code>" media="(min-device-width: 1024px)">`
//   per desk file in the page head, between a `§MANIFEST:BEGIN viewer hints` pair, written like a tag. Nothing above is weakened; ONE claim and THREE red controls are added (no existing claim sees a hint: C1 reads tags, C32 desk literals):
//   C33 HINT-SITES an independent regex reading of the page's hint block gives exactly the manifest's hint sites, ONE per desk file and none for any other file, in the desk files' order, every one the spelling
//   of the one `media` query, before the page's first <script>, and every hint's code = the `_DESK` literal's code of the same file = the first 8 hex of that file's SHA-256 (one module -> one code in both places)  ·
//   RED R33 a desk file's hint removed -> the source check refuses ("has 0 hint(s)") · R34 a hint for a file that has no desk site planted -> refused ("no desk site") · R35 one hint's code changed (a forgotten press on ONE of the two
//   sites) -> refused (stale code naming the file, the line and the command) and C33's own code comparison sees it.
// Command: node scripts/tests/witness_manifest_roundtrip.js   (~1 min; --skip-c7 leaves out the bump.js dry run; --skip-c9 the git-history claim,
//   which a shallow CI checkout cannot read: CI passes both and says c7=NOT-RUN c9=NOT-RUN)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), say = s => process.stdout.write(s + '\n');
const G = require(path.join(ROOT, 'scripts', 'gen_manifest.js')), R = require(path.join(ROOT, 'scripts', 'lib', 'page_refs.js'));
const clone = o => JSON.parse(JSON.stringify(o));
const SKIP_C7 = process.argv.includes('--skip-c7'), SKIP_C9 = process.argv.includes('--skip-c9');
const MS = require(path.join(ROOT, 'scripts', 'lib', 'manifest_source.js'));
const SRC_APPS = G.APPS.filter(a => MS.hasSource(ROOT, a)), NCLAIMS0 = 7 + 8 * SRC_APPS.length - (SKIP_C7 ? 1 : 0) - (SKIP_C9 ? SRC_APPS.length : 0);   // C1-C7, and C8-C15 once per source app
let NCLAIMS = NCLAIMS0;   // + C16-C18 per app with differing site numbers, C19 for ERP, C20 per such source app (set below)
// the two regexes of scripts/bump.js (PAGE_REF, JS_REF), quoted here as the independent second reader
const PAGE_REF = /((?:src|href)\s*=\s*")([^"?#]+)\?v=(\d+|[0-9a-f]{8})(")/g, JS_REF = /((['"]))([^'"\s?#]+\.(?:js|css|json|wasm))\?v=(\d+|[0-9a-f]{8})(\2)/g;
// B3-OUT (#3379): the regex path of scripts/bump.js is deleted. B4-HASH (#3397): the old arithmetic (each site +1) is gone too, but C17 still needs an INDEPENDENT answer to "which sites does a press of
//   these targets touch": the two regexes above, the same rounds (a changed loader is a target of the next round), one CACHE_VERSION step per sw.js whose own folder holds a changed file (B3-OUT rule 5).
//   It returns the sites, never their numbers or codes.
function regexSites(texts, owned, targets, swFile) {
  const dirOf = f => path.posix.dirname(f), pages = owned.filter(f => f.endsWith('.html')), loaders = owned.filter(f => f.endsWith('.js') && f !== swFile), changed = new Set(), hits = [];
  const rel = (f, p) => path.posix.normalize(path.posix.join(dirOf(f), p));
  let queue = [...targets]; const done = new Set();
  for (let depth = 0; queue.length && depth < 4; depth++) {
    const round = new Set(queue.filter(q => !done.has(q))); queue = []; round.forEach(q => done.add(q));
    for (const h of pages) for (const m of texts.get(h).matchAll(PAGE_REF)) { if (/^[a-z]+:|^\/\//i.test(m[2]) || !round.has(rel(h, m[2]))) continue; changed.add(h); hits.push(h + '|' + m[2]); }
    for (const f of loaders) for (const m of texts.get(f).matchAll(JS_REF)) { if (/^[a-z]+:|^\/\//i.test(m[3]) || !round.has(rel(f, m[3])) || rel(f, m[3]) === f) continue; changed.add(f); queue.push(f); hits.push(f + '|' + m[3]); }
  }
  return { hits: hits.sort(), swStep: [...changed].some(f => f.startsWith(dirOf(swFile) + '/')) };
}
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

// C5: every versioned site is driven by the manifest, and only that site moves (B4-HASH: its code is changed to another code, was +1)
let driven = 0, drivenOf = 0;
for (const a of r.apps) {
  const m = clone(a.manifest);
  for (const mod of m.modules) for (const s of mod.sites) {
    if (s.v == null) continue;
    drivenOf++;
    const fr = a.frames.get(s.in), sl = fr.slots[s.at], was = s.v; s.v = was.slice(0, -1) + (was.slice(-1) === '0' ? '1' : '0');   // B4-HASH: a different code (was: +1)
    const g = G.regenerate(m, a.frames, s.in, true); s.v = was;   // m is already a JSON clone
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
//   B4-HASH (#3397), MOVED: a press of an unchanged file correctly prints no §BUMP line, so the dry run runs on a temp copy of every module file with ONE LINE APPENDED to each (every code is stale):
//   the set of §BUMP lines is then exactly the set of the manifest's versioned sites (`v=<committed code>-><new code>`).
if (SKIP_C7) say('  §MANIFEST_CLAIM id=C7 ok=- NOT-RUN (--skip-c7: the bump.js dry run of every target takes about a minute; run without the flag before a merge that touches the generator)');
else {
  const owned = new Set(), want = new Set(), os = require('os'), mods = new Set();
  for (const a of r.apps) {
    for (const f of a.frames.keys()) owned.add(f);
    a.manifest.modules.forEach(m => { if (fs.existsSync(path.join(ROOT, m.file))) mods.add(m.file); m.sites.forEach(s => { if (s.v != null && s.kind !== 'inline' && /\.(js|css|json|wasm)$/.test(s.as) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(s.as)) want.add(s.in + '|' + s.as + '|' + s.v); }); });
  }
  const targets = new Set(); r.apps.forEach(a => a.manifest.modules.forEach(m => { if (m.sites.some(s => s.v != null && s.kind !== 'inline') && fs.existsSync(path.join(ROOT, m.file))) targets.add(m.file); }));
  const tc7 = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-c7-')), got = new Set(); let lines = 0, errs = '';
  try {
    for (const f of new Set([...owned, ...mods, ...G.APPS.filter(a => MS.hasSource(ROOT, a)).map(a => MS.sourceFile(a)), 'index.html', 'import_own.js'])) { if (!fs.existsSync(path.join(ROOT, f))) continue; fs.mkdirSync(path.dirname(path.join(tc7, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tc7, f)); }
    for (const f of mods) fs.appendFileSync(path.join(tc7, f), '\n// c7 touch\n');
    for (const part of [[...targets]]) {
      if (!part.length) continue;
      const o = cp.spawnSync('node', [path.join(ROOT, 'scripts', 'bump.js'), ...part, '--root', tc7], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).stdout || '';
      for (const m of o.matchAll(/^§BUMP (?:page|loader)=(\S+) ref=(\S+) v=(\S+)->/mg)) { lines++; if (owned.has(m[1])) got.add(m[1] + '|' + m[2] + '|' + m[3]); }
      errs += (o.match(/^§BUMP_ERR.*$/mg) || []).join(' ; ');
    }
  } finally { fs.rmSync(tc7, { recursive: true, force: true }); }
  if (!lines) inconclusive.push('the bump.js dry run printed no §BUMP line' + (errs ? ' (' + errs.slice(0, 200) + ')' : ''));
  const missing = [...want].filter(x => !got.has(x)), extra = [...got].filter(x => !want.has(x));
  missing.slice(0, 10).forEach(x => say('  §MANIFEST_C7_MISS manifest_site_bump_did_not_print=' + x));
  extra.slice(0, 10).forEach(x => say('  §MANIFEST_C7_EXTRA bump_line_with_no_manifest_site=' + x));
  claim('C7', lines > 0 && !missing.length && !extra.length, `bump_lines=${lines} in_owned_files=${got.size} manifest_sites=${want.size} missing=${missing.length} extra=${extra.length} (every module file changed in a temp copy)` + (errs ? ' bump_err=' + JSON.stringify(errs.slice(0, 160)) : ''));
}

// ---- B1 claims (C8-C15), per source app
const B1 = { apps: SRC_APPS.length, unreviewed: 0, ownerGap: 0, witGap: 0, declared: 0 };
for (const app of SRC_APPS) {
  const a = r.apps.find(x => x.manifest.app === app), sc = a.source, info = sc.info, m = info.manifest;
  if (!m || !Object.keys(m.modules).length) { inconclusive.push(app + ': modules.json has 0 modules'); continue; }
  const rv = info.review; B1.unreviewed += rv ? rv.unreviewed.length : 0; B1.ownerGap += info.ownerGap.length; B1.witGap += info.witGap.length; B1.declared += info.order.judged;
  if (!rv || !rv.r.summary.read) inconclusive.push(app + ': the candidate tool read 0 modules');
  if (rv && rv.r.fails.length) inconclusive.push(app + ': the candidate tool failed to parse ' + rv.r.fails.join(', '));
  const srcFails = sc.fails;
  claim('C8', info.identical === info.files && info.files > 2 && !srcFails.some(f => /differs|not canonical|in modules\.json but not/.test(f)), `app=${app} driven_files=${info.identical}/${info.files} (pages + loaders + sw.js + modules.json)`);
  // C9 — pinned to the commit that added modules.json
  if (SKIP_C9) say('  §MANIFEST_CLAIM id=C9 ok=- NOT-RUN (--skip-c9: a shallow checkout has no parent commit to compare with)');
  else {
    const git = args => cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
    let sha = ''; try { sha = git(['log', '--diff-filter=A', '--format=%H', '--', MS.sourceFile(app)]).trim().split('\n').pop(); } catch (e) { sha = ''; }
    if (!sha) inconclusive.push('C9: no commit adds ' + MS.sourceFile(app));
    else {
      let ok = true, judged = 0; const norm = t => t.split('\n').map(l => /const CACHE_VERSION\s*=/.test(l) ? '<CACHE_VERSION>' : l);
      for (const f of [...Object.keys(m.order), m.sw]) {
        let before, after; try { before = git(['show', sha + '^:' + f]); after = git(['show', sha + ':' + f]); } catch (e) { inconclusive.push('C9: cannot read ' + f + ' at ' + sha.slice(0, 12) + ' or its parent'); ok = false; continue; }
        judged++;
        const kept = norm(after).filter(l => !/§MANIFEST:(BEGIN|END)\b/.test(l) && !(f === m.sw && /^\/\/ v\d+ \(\d{4}-\d\d-\d\d\) B1\b/.test(l)));
        if (kept.join('\n') !== norm(before).join('\n')) { ok = false; say('  §MANIFEST_C9_MISS file=' + f + ' the switch commit changed more than its marker lines and CACHE_VERSION'); }
      }
      claim('C9', ok && judged > 0, `app=${app} switch=${sha.slice(0, 12)} files=${judged} (each = its parent, but for the marker lines and the one CACHE_VERSION step)`);
    }
  }
  // C10 — the manifest = the files as B0's reader sees them, and the sw.js vm run
  { const { b0 } = MS.expand(m), read = new Map(a.manifest.modules.map(x => [x.file, x])); let bad = 0;
    // B4-HASH (#3397), MOVED: the `v` columns of this claim (a module's number, a site's number) are C26 (the code is the file's content) and C27 (one code per module); the manifest holds none
    const key = x => JSON.stringify([x.load, x.precache, x.sites.map(z => [z.in, z.at, z.kind, z.as, z.onerror || null, z.q || null]).sort()]);
    for (const x of b0.modules) { const y = read.get(x.file); if (!y || key(x) !== key(y) || (x.load === 'lazy' && !x.sites.some(z => z.in === x.lazyGroup))) { bad++; if (bad < 6) say('  §MANIFEST_C10_MISS module=' + x.file); } }
    bad += [...read.keys()].filter(f => !m.modules[f]).length;
    const vmOk = vmOut[app] && vmOut[app].V === m.cacheVersion && JSON.stringify(vmOut[app].P) === JSON.stringify(m.precacheOrder);
    claim('C10', !bad && vmOk, `app=${app} modules=${b0.modules.length} reader_modules=${read.size} differ=${bad} sw_vm=${vmOk ? 'same' : 'DIFFERS'}`); }
  // C11 — stable writes, both merge orders
  { const w1 = MS.write(ROOT, app), w2 = MS.write(ROOT, app, { texts: w1.out });
    const again = [...w2.out].filter(([f, t]) => t !== w1.out.get(f)).length;
    const page = m.pages ? null : Object.keys(m.order).find(f => f.startsWith(app + '/') && f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2);
    const tagI = m.order[page].findIndex(z => z.kind === 'tag'), withSites = (adds) => { const mm = clone(m); adds.forEach(n => { mm.modules[app + '/' + n] = { load: 'boot', lazyGroup: null, precache: true, deps: [], uses: [], notDeps: [], owner: '' }; mm.order[page].splice(tagI + 1 + mm.order[page].slice(tagI + 1).findIndex(() => true), 0, { kind: 'tag', as: n }); mm.precacheOrder.splice(3, 0, n); }); return mm; };
    const step = (mm, texts) => { const w = MS.write(ROOT, app, { manifest: mm, texts }); return w.fails.length ? null : w.out; };
    const both = withSites(['zz_b1_b.js', 'zz_b1_a.js']);   // the merged manifest: same lines whichever side merged first
    const ab = step(both, step(withSites(['zz_b1_a.js']))), ba = step(both, step(withSites(['zz_b1_b.js']))), ab2 = ab && step(both, ab);
    const same = ab && ba && [...ab].every(([f, t]) => ba.get(f) === t) && [...ab2].every(([f, t]) => ab.get(f) === t);
    const placed = ab && /<script src="zz_b1_a\.js"/.test(ab.get(page))   // B4-HASH: the file is not on disk, so the tag is written without a code (moved from ?v=1) && /'zz_b1_b\.js'/.test(ab.get(m.sw)) && G.readSites(page, ab.get(page)).filter(z => z.kind === 'tag').length === m.order[page].filter(z => z.kind === 'tag').length + 2;
    const back = ab && step(m, ab), removed = back && [...back].filter(([f]) => f !== MS.sourceFile(app)).every(([f, t]) => t === w1.out.get(f));
    claim('C11', !again && same && placed && removed, `app=${app} second_write_changed=${again} merge_orders_same=${same ? 'Y' : 'N'} two_sites_placed=${placed ? 'Y' : 'N'} removed_back_to_committed=${removed ? 'Y' : 'N'}`); }
  // C12 — nothing new reaches the browser
  { const espree = require(path.join(ROOT, 'node_modules', 'espree')); let named = 0;
    const lits = src => { let n = 0; try { for (const t of espree.tokenize(src, { ecmaVersion: 'latest', sourceType: 'module' })) if ((t.type === 'String' || t.type === 'Template') && /modules\.json/.test(t.value)) n++; } catch (e) { try { for (const t of espree.tokenize(src, { ecmaVersion: 'latest' })) if ((t.type === 'String' || t.type === 'Template') && /modules\.json/.test(t.value)) n++; } catch (e2) { n += /['"`][^'"`\n]*modules\.json/.test(src) ? 1 : 0; } } return n; };
    for (const f of [...Object.keys(m.order), m.sw]) { const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (f.endsWith('.html')) { const h = R.readHtml(src); named += h.tags.concat(h.assets).filter(t => /modules\.json/.test(t.as)).length; h.inline.forEach(b => { if (!b.type || /javascript|module/i.test(b.type)) named += lits(src.slice(b.start, b.end)); }); }
      else named += lits(src); }
    const pre = (vmOut[app] ? vmOut[app].P : m.precacheOrder).filter(e => /modules\.json/.test(e)).length;
    claim('C12', named === 0 && pre === 0, `app=${app} sites_or_literals_naming_it=${named} precache_entries_naming_it=${pre} (comments may name it; nothing fetches it)`); }
  claim('C13', rv && !rv.unreviewed.length && info.shaOk, `app=${app} forcing_edges=${rv ? rv.forcing.length : '-'} unreviewed=${rv ? rv.unreviewed.length : '-'} review_sha=${info.shaOk ? 'same' : 'CHANGED'} unrecorded_call_uses=${rv ? rv.unrecordedUses.length : '-'} hand_deps=${info.hand}`);
  claim('C14', !info.order.errors.length && info.order.judged > 0, `app=${app} deps_declared=${info.order.judged} refusals=${info.order.errors.length}`);
  claim('C15', !info.ownerBad, `app=${app} owner_mismatch=${info.ownerBad} owner_gap=${info.ownerGap.length} witness_gap=${info.witGap.length} (witnesses are not stored: B-3 REVISED, #3326)`);
  if (rv && rv.unreviewed.length) inconclusive.push(`C13: ${app} has unreviewed=${rv.unreviewed.length} order-forcing edge(s) (§DEPS_UNREVIEWED lines): a person puts each in deps / uses / notDeps`);
  B1.m = m; B1.app = app;
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
  const ok = a.tags === 0 && b.tags === 0 && b.inl === 1 && c.tags === 1 && c.last.canonical === true && c.last.as === 'zz_planted.js' && c.last.v === '1' && d.tags === 1 && d.last.canonical === false;
  redSay('R4', ok && base.tags.length > 0, `reader fixtures on modeller.html (${base.tags.length} tags): in a comment +${a.tags}, in an inline string +${b.tags}, a real tag +${c.tags} canonical=${c.last && c.last.canonical}, two spaces before src +${d.tags} canonical=${d.last && d.last.canonical} (refused)`); }
{ const m = clone(V.manifest), [p, q] = pair(m); q.mod.deps = [p.mod.file]; const before = G.checkOrder(m); const k = p.s.at; p.s.at = q.s.at; q.s.at = k; const after = G.checkOrder(m);
  redSay('R5', before.judged === 1 && before.errors.length === 0 && after.errors.length > 0, `synthetic=Y edge ${q.mod.file} -> ${p.mod.file}: in order errors=${before.errors.length}, swapped errors=${after.errors.length}`); }
if (B1.m) {
  const app = B1.app, m = B1.m, page = Object.keys(m.order).find(f => f.startsWith(app + '/') && f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2);
  const tagIdx = (mm, f) => mm.order[page].findIndex(z => z.kind === 'tag' && MS.targetOf(mm, page, z.as) === f);
  // R6: a real confirmed deps pair, both tags of the page
  const pairs = []; for (const [f, x] of Object.entries(m.modules)) for (const d of x.deps) if (tagIdx(m, f) >= 0 && tagIdx(m, d) >= 0) pairs.push([f, d]);
  if (!pairs.length) { inconclusive.push('R6: no confirmed deps pair where both are tags of ' + page); redSay('R6', false, 'judged nothing'); }
  else { const mm = clone(m), [f, d] = pairs[0], i = tagIdx(mm, f), j = tagIdx(mm, d), t = mm.order[page][i]; mm.order[page][i] = mm.order[page][j]; mm.order[page][j] = t;
    const e = MS.order(mm, ROOT).errors; redSay('R6', e.some(x => x.includes(d + ' loads after ' + f)), `swapped ${f} and its confirmed dep ${d} (of ${pairs.length} tag pairs): refusals=${e.length}`); }
  // R7: a hand edit of one generated tag
  { const src = fs.readFileSync(path.join(ROOT, page), 'utf8'), t = R.readHtml(src).tags.find(x => x.v != null && fs.existsSync(path.join(ROOT, path.posix.dirname(page), x.as))), ed = src.slice(0, t.start) + src.slice(t.start, t.end).replace('?v=' + t.v, '?v=00000000') + src.slice(t.end);   // B4-HASH: a hand-written code (was v+7)
    const c = MS.check(ROOT, app, { texts: new Map([[page, ed]]), skipReview: true }), line = src.slice(0, t.start).split('\n').length;
    redSay('R7', c.fails.some(f => f.includes(page + ':' + line + ' still says ?v=00000000; run: node scripts/bump.js ')), `${t.as}?v=${t.v} edited by hand to ?v=00000000 at ${page}:${line}: ${c.fails.filter(f => f.includes(page + ':' + line)).length} refusal(s) naming the file, the line and the command`); }
  // R8: a <script src> planted outside the markers
  { const src = fs.readFileSync(path.join(ROOT, page), 'utf8'), b = MS.BEGIN_TAGS.exec(src).index, ed = src.slice(0, b) + '<script src="zz_planted.js?v=1"></script>\n' + src.slice(b);
    const c = MS.check(ROOT, app, { texts: new Map([[page, ed]]), skipReview: true });
    redSay('R8', c.fails.some(f => /outside the §MANIFEST markers \(zz_planted\.js\)/.test(f)), `planted above the BEGIN marker: ${c.fails.filter(f => /outside the §MANIFEST/.test(f)).length} refusal(s)`); }
  // R9: one manifest line with its keys reordered
  { const raw = fs.readFileSync(path.join(ROOT, MS.sourceFile(app)), 'utf8'), L = raw.split('\n'), i = L.findIndex(l => /^  "[^"]+": \{"load":/.test(l)), mm = /^(  "[^"]+": )(\{.*\})(,?)$/.exec(L[i]);
    const o = JSON.parse(mm[2]), rev = {}; Object.keys(o).reverse().forEach(k => { rev[k] = o[k]; }); L[i] = mm[1] + JSON.stringify(rev) + mm[3];
    const c = MS.check(ROOT, app, { manifestText: L.join('\n'), skipReview: true });
    redSay('R9', c.fails.some(f => f.startsWith(MS.sourceFile(app) + ':' + (i + 1) + ' is not canonical')), `line ${i + 1} with its keys reversed: ${c.fails.filter(f => /not canonical/.test(f)).length} refusal(s)`); }
  // R10: a dep that loads later, and a boot module depending on a lazy one
  { const tags = m.order[page].map((z, k) => ({ k, f: MS.targetOf(m, page, z.as), kind: z.kind })).filter(z => z.kind === 'tag');
    const early = tags[0].f, late = tags[tags.length - 1].f, lazy = Object.keys(m.modules).find(f => m.modules[f].load === 'lazy');
    const a1 = clone(m); a1.modules[early].deps = [...a1.modules[early].deps, late]; const e1 = MS.order(a1, ROOT).errors;
    const a2 = clone(m); a2.modules[early].deps = [...a2.modules[early].deps, lazy]; const e2 = MS.order(a2, ROOT).errors;
    redSay('R10', e1.some(x => x.includes(late + ' loads after ' + early)) && e2.some(x => x.includes('which is lazy')), `${early} -> ${late} (loads later): ${e1.length} refusal(s); ${early} -> ${lazy} (lazy): ${e2.length} refusal(s)`); }
  // R11: an owner typed by hand
  { const mm = clone(m), f = Object.keys(mm.modules).find(k => mm.modules[k].owner === '' && /\.js$/.test(k)); mm.modules[f].owner = 'prompts/TYPED_BY_HAND.md';
    const c = MS.check(ROOT, app, { manifestText: MS.serialize(mm) }); redSay('R11', c.info.ownerBad === 1, `owner of ${f} typed by hand: owner_mismatch=${c.info.ownerBad}`); }
  // R12: one candidate removed from all three lists
  { const mm = clone(m), f = Object.keys(mm.modules).find(k => mm.modules[k].deps.length), d = mm.modules[f].deps[0]; mm.modules[f].deps = mm.modules[f].deps.slice(1);
    const c = MS.check(ROOT, app, { manifestText: MS.serialize(mm) }), u = c.info.review ? c.info.review.unreviewed.length : -1;
    redSay('R12', u === 1, `${f} -> ${d} removed from deps/uses/notDeps: unreviewed=${u} (the check reads INCONCLUSIVE, never PASS)`); }
  // R13-R15 (owner B-3 REVISED, #3326; bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §B-3R SPEC). ISSUE: "a PR that only ADDS A TEST naming a module fails
  //   C15 until modules.json is regenerated" (4 PRs paid that commit on 2026-11-18). R13 plants one new test in a non-git temp tree (symlinks to this tree's
  //   top-level entries, so tracked_files walks it and the real tree is never written) and leaves modules.json alone: C15 must stay ok AND the plant must
  //   be seen by the extractor and by `gen_manifest.js --witnesses`. On the code before #3326 this FAILS (witnesses_mismatch=1).
  { const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'w-manifest-r13-')), f = Object.keys(m.modules).find(k => /\.js$/.test(k) && !/(^|\/)lib\//.test(k));
    try {
      for (const n of fs.readdirSync(ROOT)) if (n !== '.git') fs.symlinkSync(path.join(ROOT, n), path.join(tmp, n));
      const plant = 'zz_r13/tests/witness_zz_r13_plant.js';
      fs.mkdirSync(path.join(tmp, 'zz_r13', 'tests'), { recursive: true }); fs.writeFileSync(path.join(tmp, plant), `// planted by W-MANIFEST-ROUNDTRIP R13\nrequire('../../${f}');\n`);
      const c = MS.check(tmp, app), seen = (MS.witnessesOf(tmp, app, [f]).get(f) || []).includes(plant);
      const cli = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_manifest.js'), '--witnesses', f, '--root', tmp], { encoding: 'utf8' }), cliSeen = cli.status === 0 && cli.stdout.split('\n').some(l => l.trim() === plant);
      const witBad = c.info.witBad || 0;   // the field the code before #3326 counted; 0 or absent after
      redSay('R13', seen && cliSeen && !c.info.ownerBad && !witBad && !c.fails.length, `a test-only change (${plant} names ${f}), modules.json untouched: extractor_sees_it=${seen ? 'Y' : 'N'} --witnesses_sees_it=${cliSeen ? 'Y' : 'N'} owner_mismatch=${c.info.ownerBad} witnesses_mismatch=${witBad} check_fails=${c.fails.length}`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // R14: the old key typed back into one module line is refused (schema: no `witnesses` property)
  { const raw = fs.readFileSync(path.join(ROOT, MS.sourceFile(app)), 'utf8').split('\n'), i = raw.findIndex((l, k) => k > raw.indexOf(' "modules": {') && /^  "/.test(l));
    raw[i] = raw[i].replace(/\}(,?)$/, ',"witnesses":[]}$1'); const c = MS.check(ROOT, app, { manifestText: raw.join('\n') });
    redSay('R14', c.fails.some(x => /schema/.test(x) && /additional/i.test(x)), `"witnesses":[] added to ${MS.sourceFile(app)}:${i + 1}: ${(c.fails[0] || 'no failure').slice(0, 120)}`); }
  // R15: --witnesses on a file that is no module exits 1 with §MANIFEST_ERR (it never prints an empty list as an answer)
  { const cli = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_manifest.js'), '--witnesses', 'zz_no_such_module.js', '--root', ROOT], { encoding: 'utf8' });
    redSay('R15', cli.status === 1 && /^§MANIFEST_ERR zz_no_such_module\.js is no module/m.test(cli.stdout), `--witnesses zz_no_such_module.js: exit=${cli.status}`); }
}
// ---- B2 -> B4 (bim-compiler CODE_ARCHITECTURE_DESIGN.md Part B, "B2 BUILD SPEC" #3365; "B4-HASH BUILD SPEC" #3397). ISSUE (B2): "an app whose pages load one module under DIFFERENT numbers
//   cannot be written from one modules.json without changing a byte, and its bumps cannot keep today's arithmetic". B4-HASH removes the cause (one CODE per file, computed): the claims that
//   judged the numbers are MOVED, none deleted: C16 -> C27 (below), C17 (a press touches the sites the old regex arithmetic touched), C18 C19 (pins, the deploy stamp), C20 + R21 (the order on
//   every page), R16 R17 R18 R19 R20 (a page's code reverted / deleted by hand, `v` typed back into modules.json, a tag between two marker pairs, `pin` removed).
//   All three apps are SOURCE apps (a modules.json each), so the B2 trial (modules.json written in memory) is gone with the apps that needed it.
const B2 = { pinned: 0, multi: 0 };
NCLAIMS = NCLAIMS0 + 3 * SRC_APPS.length + (SRC_APPS.includes('erp') ? 1 : 0);
const rdAny = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC_M = new Map(SRC_APPS.map(app => [app, JSON.parse(rdAny(MS.sourceFile(app)))]));
for (const app of SRC_APPS) {
  const a = r.apps.find(x => x.manifest.app === app), os = require('os');
  const rd = rdAny, m = SRC_M.get(app), texts = new Map();
  const text = f => texts.has(f) ? texts.get(f) : rd(f);
  const base = MS.check(ROOT, app, { skipReview: true }), own = [], pins = [];
  for (const f of Object.keys(m.order)) m.order[f].forEach((s, at) => { if (s.pin) pins.push({ f, at, s }); });
  B2.pinned += pins.length;
  base.fails.slice(0, 8).forEach(x => say('  §MANIFEST_B2_FAIL ' + x));
  // C17-C19 in a temp tree B = the app's files with its modules.json and every target of the chosen modules, each CHANGED (a comment line appended): a press of an unchanged file writes nothing.
  //   C17: the sites the press writes are exactly the sites the old regex arithmetic touched (regexSites, the in-witness oracle: same regexes, same rounds), on the COMMITTED texts.
  const tB = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b4b-')), home = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b4h-'));
  try {
    const owned = [...Object.keys(m.order), m.sw], ownedSet = new Set(owned);
    const byTarget = new Map(); for (const f of Object.keys(m.order)) m.order[f].forEach(s => { if (s.pin || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(s.as)) return; const t = MS.targetOf(m, f, s.as); if (!byTarget.has(t)) byTarget.set(t, []); byTarget.get(t).push({ f, s }); });
    const targets = [...byTarget.keys()].sort().filter(t => fs.existsSync(path.join(ROOT, t)) && byTarget.get(t).length >= 2 && byTarget.get(t).every(x => x.s.kind === 'tag' || x.s.kind === 'lazy') && !/(^|\/)lib\//.test(t)).slice(0, 10);
    const put = (t, f, s) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), s); };
    for (const f of owned) put(tB, f, text(f));
    put(tB, MS.sourceFile(app), MS.serialize(m));
    for (const f of targets) { if (!ownedSet.has(f)) put(tB, f, rd(f)); fs.appendFileSync(path.join(tB, f), '\n// b4 touch\n'); }
    const chg = targets[0];   // the module a later branch 'changes' in C18
    const env = Object.assign({}, process.env, { BUMP_PARITY: 'off', BUMP_PARITY_HOME: home });
    const bump = (t, args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'bump.js'), ...args, '--root', t], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
    const get = (t, f) => fs.readFileSync(path.join(t, f), 'utf8');
    if (!targets.length) { inconclusive.push('C17: ' + app + ' has no module with 2+ sites that is a file on disk'); claim('C17', false, 'judged nothing'); }
    else {
      const before = new Map(owned.map(f => [f, get(tB, f)])), ro = regexSites(new Map(owned.map(f => [f, rd(f)])), owned, targets, m.sw), rb = bump(tB, [...targets, '--write']);
      const gotL = (rb.stdout.match(/^§BUMP (?:page|loader)=(\S+) ref=(\S+) v=/mg) || []).map(l => { const x = /^§BUMP \w+=(\S+) ref=(\S+) v=/.exec(l); return x[1] + '|' + x[2]; }).sort(), inl = (rb.stdout.match(/^§BUMP inline=/mg) || []).length;   // the regexes read attributes and loader literals; a loader's page may also hold it in an inline literal (counted, not compared)
      const sw = get(tB, m.sw), cv0 = +/CACHE_VERSION = 'v(\d+)'/.exec(before.get(m.sw))[1], cv1 = +/CACHE_VERSION = 'v(\d+)'/.exec(sw)[1], moved = owned.filter(f => f !== m.sw && get(tB, f) !== before.get(f)).length;
      const same = JSON.stringify(gotL) === JSON.stringify(ro.hits), swOk = ro.swStep ? cv1 === cv0 + 1 : cv1 === cv0;
      if (!same) { say('  §MANIFEST_C17_MISS only_in_press=' + gotL.filter(x => !ro.hits.includes(x)).slice(0, 5).join(',') + ' only_in_regex=' + ro.hits.filter(x => !gotL.includes(x)).slice(0, 5).join(',')); }
      claim('C17', rb.status === 0 && same && swOk && moved > 1 && ro.hits.length > targets.length, `app=${app} modules_pressed=${targets.length} (${targets.map(f => path.basename(f)).join(',')}) exit=${rb.status} sites_written=${gotL.length} (+${inl} inline literal(s)) regex_sites=${ro.hits.length} same_sites=${same ? 'Y' : 'N'} files_changed=${moved} CACHE_VERSION v${cv0}->v${cv1} (regex says ${ro.swStep ? 'one step' : 'none'})`);
    }
    // C19 — the deploy stamp's own pattern still reads the version from the sw.js the generator wrote
    if (app === 'erp') { const yml = rd('.github/workflows/deploy-pages.yml'), has = yml.includes(`grep -oE "CACHE_VERSION = '[^']+'" erp/sw.js`), mm = JSON.parse(get(tB, MS.sourceFile(app)));
      const hit = /CACHE_VERSION = '([^']+)'/.exec(get(tB, m.sw));
      if (!has) inconclusive.push('C19: deploy-pages.yml no longer holds the stamp pattern this claim quotes');
      claim('C19', has && hit && hit[1] === mm.cacheVersion && (!targets.length || mm.cacheVersion !== m.cacheVersion), `app=${app} stamp_reads=${hit ? hit[1] : '-'} manifest=${mm.cacheVersion} before_the_bump=${m.cacheVersion}`); }
    // C18 — the pinned literals never move: named as a target (exit 2: no coded site), and on a branch that changed sw.js (--changed)
    if (!pins.length || !chg) { inconclusive.push('C18: ' + app + ' has no pinned site, or no module to change'); claim('C18', false, 'judged nothing'); }
    else {
      const lit = t => pins.map(p => { const s = G.readSites(p.f, get(t, p.f))[p.at]; return p.f + ':' + s.as + '?v=' + s.v; }).join(' '), before = lit(tB);
      const db = bump(tB, [m.sw]), errB = /^§BUMP_ERR not_loaded_by_any_page_or_loader/m.test(db.stdout);
      const git = (args, extra) => cp.execFileSync('git', args, { cwd: tB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 'w', GIT_AUTHOR_EMAIL: 'w@w', GIT_COMMITTER_NAME: 'w', GIT_COMMITTER_EMAIL: 'w@w' }, extra || {}) }).trim();
      git(['init', '-q']); git(['add', '-A']); const c = git(['commit-tree', git(['write-tree']), '-m', 'base']); git(['update-ref', 'HEAD', c]); git(['update-ref', 'refs/remotes/origin/main', c]);
      fs.appendFileSync(path.join(tB, m.sw), '// changed on this branch\n'); fs.appendFileSync(path.join(tB, chg), '// changed on this branch\n');
      const ch = bump(tB, ['--changed', '--write']), files = (/^§BUMP_CHANGED .* files=(\S*)/m.exec(ch.stdout) || [])[1] || '', swLines = (ch.stdout.match(/^§BUMP \w+=\S+ ref=sw\.js .*$/mg) || []).length, after = lit(tB);
      claim('C18', db.status === 2 && errB && ch.status === 0 && files === chg && swLines === 0 && after === before, `app=${app} pinned=${pins.length} named_as_target: manifest_exit=${db.status} · --changed (sw.js + ${path.basename(chg)} changed): exit=${ch.status} bumpable=${files || '-'} sw_lines=${swLines} literals ${before === after ? 'unchanged' : 'MOVED'} (${after})`);
      // R20: without `pin` the same target is written like any file: its code replaces the register literal's number
      { const mm = JSON.parse(get(tB, MS.sourceFile(app))); Object.values(mm.order).forEach(l => l.forEach(s => { delete s.pin; })); put(tB, MS.sourceFile(app), MS.serialize(mm));
        const o = bump(tB, [m.sw]).stdout, n = (o.match(/^§BUMP inline=\S+ ref=sw\.js v=\S+->\S+/mg) || []).length;
        redSay('R20', n === pins.length, `"pin" removed from ${pins.length} register literal(s) of ${app}, then bump ${m.sw}: ${n} would be written`); }
    }
  } finally { for (const t of [tB, home]) fs.rmSync(t, { recursive: true, force: true }); }
  // C20 + R21 (the spec's R18) — the order holds on EVERY page where both ends are tags, judged against the pages' own bytes (the tag positions page_refs reads), not against the manifest's `order`.
  { const pagesOf = Object.keys(m.order).filter(f => f.endsWith('.html')), pos = new Map();
    for (const pg of pagesOf) { const mp = new Map(); R.readHtml(rd(pg)).tags.forEach(t => { const k = MS.targetOf(m, pg, t.as); if (!mp.has(k)) mp.set(k, t.start); }); pos.set(pg, mp); }
    let pairsJ = 0, placed = 0, wrong = 0; const multi = [];
    for (const [f, x] of Object.entries(m.modules)) for (const d of x.deps) {
      const on = pagesOf.filter(pg => pos.get(pg).has(f) && pos.get(pg).has(d)); if (!on.length) continue;
      pairsJ++; placed += on.length; if (on.length > 1) multi.push([f, d, on]);
      on.forEach(pg => { if (pos.get(pg).get(d) > pos.get(pg).get(f)) { wrong++; say(`  §MANIFEST_C20_MISS page=${pg} ${d} loads after ${f}`); } });
    }
    const oc = MS.order(m, ROOT);
    if (!pairsJ) inconclusive.push('C20: no deps pair with both ends as tags of one page');
    claim('C20', pairsJ > 0 && !wrong && !oc.errors.length, `app=${app} deps_declared=${oc.judged} pairs_judged=${pairsJ} page_placements_judged=${placed} pairs_on_2plus_pages=${multi.length} out_of_order_in_the_pages=${wrong} generator_refusals=${oc.errors.length}`);
    B2.multi += multi.length;
    if (multi.length) { const [f, d, on] = multi[0], pg = on[on.length - 1], mm = clone(m), ix = k => mm.order[pg].findIndex(z => z.kind === 'tag' && MS.targetOf(mm, pg, z.as) === k), i = ix(f), j = ix(d), t = mm.order[pg][i]; mm.order[pg][i] = mm.order[pg][j]; mm.order[pg][j] = t;
      const e = MS.order(mm, ROOT).errors; redSay('R21', e.length > 0 && e.every(x => x.startsWith(pg + ':')), `${f} and its dep ${d} swapped on ${pg} only (right on ${on.length - 1} other page(s)): ${e.length} refusal(s), all naming ${pg}`); }
  }
}
// R16 R17 R18 R19 (once, on the first app that has what each needs; in memory, the real tree is never written)
{
  const chk = (app, mm, tx) => MS.check(ROOT, app, { manifestText: MS.serialize(mm), texts: tx, skipReview: true });
  // R16 (moved from "a module's numbers on two pages swapped"): a module loaded by two pages, ONE page's code reverted by hand: the refusal names that page and not the other
  let done16 = false;
  for (const app of SRC_APPS) { if (done16) break; const m = SRC_M.get(app);
    for (const [f, x] of Object.entries(m.modules)) {
      const at = []; for (const pg of Object.keys(m.order).filter(p => p.endsWith('.html'))) m.order[pg].forEach((s, i) => { if (s.kind === 'tag' && !s.pin && MS.targetOf(m, pg, s.as) === f) at.push({ pg, i }); });
      const pgs = [...new Set(at.map(z => z.pg))]; if (pgs.length < 2 || !fs.existsSync(path.join(ROOT, f))) continue;
      const p1 = at[0], p2 = at.find(z => z.pg !== p1.pg), src2 = rdAny(p2.pg), s2 = G.readSites(p2.pg, src2)[p2.i];
      if (s2.v == null) continue;
      const tx = new Map([[p2.pg, src2.slice(0, s2.start) + src2.slice(s2.start, s2.end).replace('?v=' + s2.v, '?v=00000000') + src2.slice(s2.end)]]), c = chk(app, m, tx);
      const n2 = c.fails.some(z => z.includes(p2.pg + ':') && /still says \?v=00000000/.test(z)), n1 = c.fails.some(z => z.includes(p1.pg + ':'));
      redSay('R16', n2 && !n1, `${f} is loaded by ${pgs.join(' and ')} under ONE code; the code on ${p2.pg} reverted by hand: refusal names ${p2.pg} ${n2 ? 'Y' : 'N'}, names ${p1.pg} ${n1 ? 'Y' : 'N'} (it must not)`); done16 = true; break;
    } }
  if (!done16) { inconclusive.push('R16: no module loaded by two pages'); redSay('R16', false, 'judged nothing'); }
  // R17 (moved from "a site v deleted"): the code deleted by hand from one tag: "still says no ?v="
  { const app = SRC_APPS[0], m = SRC_M.get(app), pg = Object.keys(m.order).find(f => f.startsWith(app + '/') && f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2), src = rdAny(pg), t = R.readHtml(src).tags.find(x => x.v != null && fs.existsSync(path.join(ROOT, path.posix.dirname(pg), x.as)));
    const tx = new Map([[pg, src.slice(0, t.start) + src.slice(t.start, t.end).replace('?v=' + t.v, '') + src.slice(t.end)]]), c = chk(app, m, tx), line = src.slice(0, t.start).split('\n').length;
    redSay('R17', c.fails.some(z => z.includes(pg + ':' + line + ' still says no ?v=; run: node scripts/bump.js ')), `the code of ${t.as} deleted by hand at ${pg}:${line}: ${c.fails.filter(z => /still says no/.test(z)).length} refusal(s)`); }
  // R18 (moved from "a site v equal to its module's"): `v` typed back into modules.json (a module line, then a site) is refused by the schema (B4-HASH §2: `v` refused)
  { const app = SRC_APPS[0], m = SRC_M.get(app), f = Object.keys(m.modules)[0], mm = clone(m); mm.modules[f].v = 1;
    const mo = JSON.parse(JSON.stringify(m)), of = Object.keys(mo.order)[0]; mo.order[of][0].v = 1;
    const c1 = MS.check(ROOT, app, { manifestText: JSON.stringify(mm), skipReview: true }), c2 = MS.check(ROOT, app, { manifestText: JSON.stringify(mo), skipReview: true });
    redSay('R18', c1.fails.some(z => /schema/.test(z) && /additional/i.test(z)) && c2.fails.some(z => /schema/.test(z) && /additional/i.test(z)), `"v" typed into a module line of ${f}: ${c1.fails.length ? 'refused' : 'ACCEPTED'}; into the first site of ${of}: ${c2.fails.length ? 'refused' : 'ACCEPTED'}`); }
  // R19: a <script src> planted between two marker pairs
  { const app = SRC_APPS.find(a => { const m = SRC_M.get(a); return Object.keys(m.order).some(f => f.endsWith('.html') && (rdAny(f).match(/§MANIFEST:END \S+ tags/g) || []).length > 1); }), m = app && SRC_M.get(app), page = m && Object.keys(m.order).find(f => f.endsWith('.html') && (rdAny(f).match(/§MANIFEST:END \S+ tags/g) || []).length > 1);
    if (!page) { inconclusive.push('R19: no page with two marker pairs'); redSay('R19', false, 'judged nothing'); }
    else { const src = rdAny(page), e = /<!-- §MANIFEST:END \S+ tags -->\n/.exec(src), at = e.index + e[0].length, tx = new Map([[page, src.slice(0, at) + '<script src="zz_planted.js?v=1"></script>\n' + src.slice(at)]]);
      const c = chk(app, m, tx); redSay('R19', c.fails.some(x => /outside the §MANIFEST markers \(zz_planted\.js\)/.test(x)), `a <script src> planted between the two marker pairs of ${page} (line ${src.slice(0, at).split('\n').length}): ${c.fails.filter(x => /outside the §MANIFEST/.test(x)).length} refusal(s)`); } }
}

// ---- B3-OUT (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B3-OUT BUILD SPEC" + "B3-OUT ADDENDUM"; bim-ootb #3379). ISSUE: "the referrers outside the three app folders
//   (index.html, import_own.js, capex/index.html) are kept in step only by bump.js's regex path, and only when a change goes through bump.js; a miss is reported by nothing".
//   C22 every file with a `?v=` site whose target is a file on disk is owned by exactly one app's `order` (or FROZEN) · C23 the frozen gallery is never edited ·
//   C24 a bump of a root loader changes exactly its page and the manifest, no CACHE_VERSION · C25 a page no list names is never edited (the regex path is gone).
//   RED R22 an adopted page IS raised (C25's byte-identical is not vacuous) · R23 --adopt refuses owned / lib / FROZEN files · R24 a tag's other attributes dropped by the renderer ->
//   FAIL · R25 a root page with one `?v=` tag, named by no list -> C22 FAIL naming the file and --adopt · R26 a gallery-like page whose paths resolve and which IS in a list is
//   edited (C23's byte-identical is not vacuous). On the code before B3-OUT: MANIFEST_W_OLD=<a tree of that code> runs C23-C25 on ITS files with ITS bump.js, MANIFEST_W_C22_ROOT=<that tree> prints C22 over it (red runs).
const B3 = { outside: '-', frozen: 0, unresolved: 0 };
NCLAIMS += 4 + 6;   // C22-C25 and (B4-HASH) C26-C31
{
  const os = require('os'), { trackedFiles } = require(path.join(ROOT, 'scripts', 'lib', 'tracked_files.js')), P = path.posix;
  const OLD = process.env.MANIFEST_W_OLD ? path.resolve(process.env.MANIFEST_W_OLD) : null, BUMP_JS = path.join(OLD || ROOT, 'scripts', 'bump.js');
  const rdR = f => fs.readFileSync(path.join(OLD || ROOT, f), 'utf8'), put = (t, f, s) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), s); }, get = (t, f) => fs.readFileSync(path.join(t, f), 'utf8');
  const SKIP_OUT = /(^|\/)(lib|node_modules|tests?)\/|\.min\.js$|witness|(^|\/)sw\.js$|^scripts\//, ownersOf = root => { const o = new Map(); for (const a of G.APPS) if (MS.hasSource(root, a)) { const x = JSON.parse(fs.readFileSync(path.join(root, MS.sourceFile(a)), 'utf8')); for (const f of Object.keys(x.order)) o.set(f, (o.get(f) || []).concat(a)); } return o; };
  /** C22's population: every tracked page / loader outside lib/ tests/ scripts/ with a versioned site whose target resolves (from the referrer's folder, as bump.js resolved it) to a file on disk. */
  const scan = root => {
    const own = ownersOf(root), res = { judged: [], unresolved: [], unowned: [], multi: [], frozen: [], outside: [], outsideOwned: 0 };
    for (const f of trackedFiles(root).filter(f => /\.(html|m?js)$/.test(f) && !SKIP_OUT.test(f))) {
      let src; try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { continue; }
      if (src.indexOf('?v=') < 0) continue;
      const sites = (G.readSites(f, src) || []).filter(x => x.v != null && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(x.as));
      if (!sites.length) continue;
      if (G.FROZEN.includes(f)) { res.frozen.push(f); res.judged.push(f); if (!sites.some(x => fs.existsSync(path.join(root, P.normalize(P.join(P.dirname(f), x.as)))))) res.frozenUnresolved = true; continue; }   // counted, never owned (B3-Q3); its paths are root-relative strings of an old copy of the landing page
      if (!sites.some(x => fs.existsSync(path.join(root, P.normalize(P.join(P.dirname(f), x.as)))))) { res.unresolved.push(f); continue; }
      res.judged.push(f);
      const outside = !G.APPS.some(a => f.startsWith(a + '/')); if (outside) res.outside.push(f);
      const o = own.get(f) || [];
      if (o.length === 1) { if (outside) res.outsideOwned++; } else (o.length ? res.multi : res.unowned).push(f);
    }
    return res;
  };
  const sc = scan(ROOT), c22ok = sc.judged.length > 0 && !sc.unowned.length && !sc.multi.length;
  if (!sc.judged.length) inconclusive.push('C22 judged 0 files (the reader found no referrer with a resolving ?v= site: the claim is blind)');
  sc.unowned.forEach(f => say(`  §MANIFEST_C22_MISS file=${f} holds a ?v= site and is in no app's order and not FROZEN (run: node scripts/gen_manifest.js --adopt <app> ${f})`));
  sc.multi.forEach(f => say(`  §MANIFEST_C22_MISS file=${f} is in more than one app's order`));
  const outsideN = sc.outside.filter(f => !G.FROZEN.includes(f)).length;
  claim('C22', c22ok, `judged=${sc.judged.length} outside_owned=${sc.outsideOwned}/${outsideN} (${sc.outside.filter(f => !G.FROZEN.includes(f)).join(',')}) frozen=${sc.frozen.length} (${sc.frozen.join(',')}) unresolved=${sc.unresolved.length} (${sc.unresolved.join(',')}: no site resolves to a file on disk, so no bump could edit it) unowned=${sc.unowned.length} multi=${sc.multi.length}`);
  B3.outside = `${sc.outsideOwned}/${outsideN}`; B3.frozen = sc.frozen.length; B3.unresolved = sc.unresolved.length;
  if (process.env.MANIFEST_W_C22_ROOT) { const o = scan(path.resolve(process.env.MANIFEST_W_C22_ROOT)); say(`  §MANIFEST_RED_RUN id=C22 root=${process.env.MANIFEST_W_C22_ROOT} judged=${o.judged.length} unowned=${o.unowned.length} (${o.unowned.join(',')}) verdict=${o.judged.length && !o.unowned.length && !o.multi.length ? 'PASS' : 'FAIL'}`); }
  // R25: a root page with one ?v= tag, named by no list
  { const t = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-r25-'));
    try { put(t, 'viewer/rates.js', ''); put(t, 'viewer/modules.json', rdR('viewer/modules.json')); put(t, 'zz_root.html', '<html><body>\n<script src="viewer/rates.js?v=3"></script>\n</body></html>\n');
      const o = scan(t); redSay('R25', o.judged.includes('zz_root.html') && o.unowned.includes('zz_root.html'), `a root page with one ?v= tag planted in a temp tree: C22 FAIL naming ${o.unowned.join(',')} (run: node scripts/gen_manifest.js --adopt viewer zz_root.html)`);
    } finally { fs.rmSync(t, { recursive: true, force: true }); } }
  const env = Object.assign({}, process.env, { BUMP_PARITY: 'off' }), tmps = [];
  const mini = (app, extra) => { const t = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b3out-')); tmps.push(t); const m = JSON.parse(rdR(MS.sourceFile(app))); for (const f of new Set([...Object.keys(m.order), m.sw, MS.sourceFile(app), 'index.html', 'import_own.js', ...(extra || [])])) put(t, f, rdR(f)); return t; };   // OLD: the files of the tree being red-run
  const bumpIn = (t, args) => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b3h-')); tmps.push(h); return cp.spawnSync(process.execPath, [BUMP_JS, ...args, '--root', t], { encoding: 'utf8', env: Object.assign({}, env, { BUMP_PARITY_HOME: h }), maxBuffer: 1 << 26 }); };
  const snapOf = t => { const o = new Map(); const walk = d => { for (const e of fs.readdirSync(path.join(t, d), { withFileTypes: true })) { const f = d ? d + '/' + e.name : e.name; if (e.isDirectory()) walk(f); else o.set(f, get(t, f)); } }; walk(''); return o; };
  const changedSet = (a, b) => [...b.keys()].filter(f => a.get(f) !== b.get(f)).sort();
  const sha8 = buf => require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 8), touchIn = (t, f) => fs.appendFileSync(path.join(t, f), '\n// b4 touch\n');   // B4-HASH: a press of an unchanged file writes nothing, so a claim about what it writes changes the file first
  try {
    // C23: every module the frozen gallery names, bumped with --write: the gallery stays byte-identical (and the run was real)
    { const gal = G.FROZEN[0], gs = G.readSites(gal, rdR(gal)).filter(x => !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(x.as)), names = [...new Set(gs.map(x => x.as))];
      const vj = JSON.parse(rdR('viewer/modules.json')), vm = MS.expand(vj).b0.modules, mods = [...new Set(names.filter(n => fs.existsSync(path.join(ROOT, n)) && vm.some(x => x.file === n && x.sites.some(z => z.in !== x.file && !vj.order[z.in][z.at].pin))))];   // the strings read from the repo root (the gallery is an old copy of the landing page)
      const t = mini('viewer', [...mods]); put(t, gal, rdR(gal)); mods.forEach(f => touchIn(t, f)); const before = snapOf(t), r = bumpIn(t, [...mods, '--write']), after = snapOf(t);
      const ch = changedSet(before, after), lines = (r.stdout.match(/^§BUMP (?:page|loader)=/mg) || []).length;
      if (!mods.length || !lines) inconclusive.push('C23: no module the gallery names was bumped (' + (r.stdout.match(/^§BUMP_ERR.*$/m) || [''])[0] + ')');
      claim('C23', mods.length > 0 && lines > 0 && r.status === 0 && !ch.includes(gal), `${gal} names ${names.length} files (${mods.length} of them raisable modules of the viewer list, read from the root); bump --write of those: exit=${r.status} bump_lines=${lines} files_changed=${ch.length} gallery_changed=${ch.includes(gal) ? 'Y' : 'N'} (never in a list, never written)`);
      // R26: a gallery-like page whose paths resolve and which IS in a list is edited
      const t2 = mini('viewer', [...mods]); put(t2, 'zz_gallery.html', rdR(gal));
      cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_manifest.js'), '--adopt', 'viewer', 'zz_gallery.html', '--root', t2], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
      mods.forEach(f => touchIn(t2, f)); const b2 = snapOf(t2); bumpIn(t2, [...mods, '--write']); const c2 = changedSet(b2, snapOf(t2));   // touched AFTER the adopt: the adopt itself writes the codes it finds
      redSay('R26', c2.includes('zz_gallery.html'), `a copy of the gallery at the root (its paths resolve), adopted into a temp list, then the same bump --write: zz_gallery.html ${c2.includes('zz_gallery.html') ? 'EDITED' : 'untouched'} (so C23's "untouched" can fail)`); }
    // C24: bump import_own.js (changed): exactly index.html (one tag: its code) and no modules.json, no sw.js; and a changed module with sites inside the app still steps CACHE_VERSION once
    //   (B4-HASH: modules.json holds no `v` any more, so a press writes it only when CACHE_VERSION steps; was: "index.html,viewer/modules.json" with the tag +1)
    { const t = mini('viewer'); touchIn(t, 'import_own.js'); const before = snapOf(t), r = bumpIn(t, ['import_own.js', '--write']), after = snapOf(t), ch = changedSet(before, after);
      const d = (before.get('index.html') || '').split('\n').map((l, i) => [l, (after.get('index.html') || '').split('\n')[i]]).filter(([a, b]) => a !== b);
      const v0 = /import_own\.js\?v=([0-9a-f]+)/.exec(before.get('index.html'))[1], code = sha8(Buffer.from(after.get('import_own.js'))), oneTag = d.length === 1 && d[0][1] === d[0][0].replace('import_own.js?v=' + v0, 'import_own.js?v=' + code);
      const sw = ch.filter(f => /(^|\/)sw\.js$/.test(f)), cv = (b, a) => [+/CACHE_VERSION\s*=\s*'v(\d+)'/.exec(b.get('viewer/sw.js'))[1], +/CACHE_VERSION\s*=\s*'v(\d+)'/.exec(a.get('viewer/sw.js'))[1]];
      const t2 = mini('viewer', ['viewer/locale_loader.js']); touchIn(t2, 'viewer/locale_loader.js'); const b2 = snapOf(t2), r2 = bumpIn(t2, ['viewer/locale_loader.js', '--write']), a2 = snapOf(t2), [c0, c1] = cv(b2, a2);
      claim('C24', r.status === 0 && ch.join(',') === 'index.html' && oneTag && !sw.length && r2.status === 0 && c1 === c0 + 1 && changedSet(b2, a2).includes('index.html'),
        `bump import_own.js --write: exit=${r.status} files_changed=${ch.join(',')} index_lines=${d.length} tag_v=${v0}->${code}:${oneTag} sw_changed=${sw.length} · bump viewer/locale_loader.js: CACHE_VERSION v${c0}->v${c1} index.html_changed=${changedSet(b2, a2).includes('index.html') ? 'Y' : 'N'}`); }
    // C25: a page no list names is never edited; R22: the same page, adopted, is
    { const page = '<html><body>\n<script src="viewer/rates.js?v=3"></script>\n</body></html>\n', t = mini('viewer', ['viewer/rates.js']); put(t, 'zz_root.html', page); touchIn(t, 'viewer/rates.js');
      const before = snapOf(t), r = bumpIn(t, ['viewer/rates.js', '--write']), after = snapOf(t), lines = (r.stdout.match(/^§BUMP (?:page|loader)=/mg) || []).length;
      if (!lines) inconclusive.push('C25: the bump of viewer/rates.js raised nothing (' + (r.stdout.match(/^§BUMP_ERR.*$/m) || [''])[0] + ')');
      claim('C25', r.status === 0 && lines > 0 && after.get('zz_root.html') === page, `zz_root.html (loads viewer/rates.js?v=3, in no list) after bump viewer/rates.js --write: exit=${r.status} bump_lines=${lines} page_${after.get('zz_root.html') === page ? 'byte-identical' : 'CHANGED'}`);
      const t2 = mini('viewer', ['viewer/rates.js']); put(t2, 'zz_root.html', page);
      cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_manifest.js'), '--adopt', 'viewer', 'zz_root.html', '--root', t2], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
      touchIn(t2, 'viewer/rates.js'); const b2 = snapOf(t2); bumpIn(t2, ['viewer/rates.js', '--write']); const a2 = snapOf(t2), had = /\?v=([0-9a-f]+)/.exec(a2.get('zz_root.html')), want = sha8(Buffer.from(a2.get('viewer/rates.js')));
      redSay('R22', !!had && had[1] === want && b2.get('zz_root.html') !== a2.get('zz_root.html') && /§MANIFEST:BEGIN viewer tags/.test(a2.get('zz_root.html')), `the same page after --adopt viewer, then rates.js changed and pressed: tag v=3 -> ${had ? had[1] : '?'} (rates.js code ${want}) and the marker pair written (so C25's byte-identical can fail)`); }
    // ---- B4-HASH claims C26-C31 (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B4-HASH BUILD SPEC", Witness; bim-ootb #3397). ISSUE: "a `?v=` number is raised by arithmetic, so a file changed
    //   without a press keeps its number (and 37 own files + 8 lib/ copies have none)". T = the tree judged: this one, or MANIFEST_W_OLD (the code before B4-HASH: C26-C31 must each FAIL there).
    //   The population is read from T's COMMITTED files (readSites) and judged against T's file BYTES taken from git (`git cat-file`), hashed here with node's own crypto: not the generator's answer.
    {
      const T = OLD || ROOT, rdT = f => fs.readFileSync(path.join(T, f), 'utf8'), GEN_JS = path.join(T, 'scripts', 'gen_manifest.js'), EXT = /^[a-z][a-z0-9+.-]*:|^\/\//i;
      const pop = [], ownT = ownersOf(T);   // pop: every coded-kind site (not pinned, not another site's address, not a file's reference to itself, target on disk)
      for (const app of SRC_APPS) { const mj = JSON.parse(rdT(MS.sourceFile(app)));
        for (const f of Object.keys(mj.order)) { const src = rdT(f), sites = G.readSites(f, src) || [];
          mj.order[f].forEach((spec, at) => { const t = MS.targetOf(mj, f, spec.as); if (spec.pin || EXT.test(spec.as) || t === f || !fs.existsSync(path.join(T, t))) return; pop.push({ app, f, at, kind: spec.kind, as: spec.as, t, v: sites[at] ? sites[at].v : null, line: src.slice(0, sites[at] ? sites[at].start : 0).split('\n').length }); }); } }
      const targetsOf = new Set(pop.map(x => x.t));
      const gitBlobs = (root, rels) => {   // the bytes as committed (HEAD); a file that differs from HEAD, or is new, is read from disk and counted apart
        const out = new Map();
        try {
          const g = a => cp.execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }), dirty = new Set(g(['diff', '--name-only', 'HEAD']).split('\n').concat(g(['ls-files', '--others', '--exclude-standard']).split('\n')).filter(Boolean));
          const want = rels.filter(f => !dirty.has(f)), r = cp.spawnSync('git', ['-C', root, 'cat-file', '--batch'], { input: want.map(f => 'HEAD:' + f).join('\n') + '\n', maxBuffer: 1 << 30 });
          let pos = 0; const buf = r.stdout || Buffer.alloc(0);
          for (const f of want) { const nl = buf.indexOf(10, pos); if (nl < 0) break; const mm = /^[0-9a-f]+ blob (\d+)$/.exec(buf.slice(pos, nl).toString()); if (!mm) { pos = nl + 1; continue; } const n = +mm[1]; out.set(f, buf.slice(nl + 1, nl + 1 + n)); pos = nl + 1 + n + 1; }
        } catch (e) { /* no git: every file is read from disk and counted so */ }
        return out;
      };
      const blobs = gitBlobs(T, [...targetsOf]), codeOf = t => sha8(blobs.get(t) || fs.readFileSync(path.join(T, t))), gitN = [...targetsOf].filter(t => blobs.has(t)).length;
      if (!pop.length) inconclusive.push('C26-C31: the committed lists hold 0 coded-kind sites in ' + T + ' (the claims are blind)');
      // C26 CODE-IS-CONTENT: every such site's `?v=` equals the first 8 hex of SHA-256 of its file's bytes as committed
      const wrong = pop.filter(x => x.v !== codeOf(x.t));
      wrong.slice(0, 6).forEach(x => say(`  §MANIFEST_C26_MISS ${x.f}:${x.line} ${x.as} says ?v=${x.v == null ? '(none)' : x.v}, ${x.t} has code ${codeOf(x.t)}`));
      claim('C26', pop.length > 0 && !wrong.length, `tree=${OLD ? 'OLD ' + T : 'this'} judged=${pop.length} sites of ${targetsOf.size} files (bytes: git=${gitN} disk=${targetsOf.size - gitN}) wrong=${wrong.length}`);
      // C27 ONE-CODE: no file has two codes (a pinned register line keeps its own literal and is not in the population)
      const byT = new Map(); for (const x of pop) { if (!byT.has(x.t)) byT.set(x.t, new Set()); byT.get(x.t).add(x.v); }
      const dis = [...byT].filter(([, v]) => [...v].filter(c => c != null).length > 1).map(([t]) => t);   // a site with no code is C31's, not a second code
      claim('C27', pop.length > 0 && !dis.length, `modules=${byT.size} disagree=${dis.length}${dis.length ? ' (' + dis.slice(0, 8).join(',') + ')' : ''}`);
      // C31 ALL-LOCAL: every file that is in the repo has a code (the 37 own files and the lib/ copies included; other sites' addresses and the pinned lines are not in the population)
      const unc = pop.filter(x => x.v == null), uncM = [...new Set(unc.map(x => x.t))];
      claim('C31', pop.length > 0 && !unc.length, `uncoded_sites=${unc.length} uncoded_modules=${uncM.length}${uncM.length ? ' (' + uncM.slice(0, 6).join(',') + ')' : ''}`);
      // C28 STALE-REFUSED: a file changed in a temp tree (symlinks to this tree's entries, the one file a real copy), no press: --check FAILS naming the file, the page:line and the command
      const farm = (root, tmp, rel, newText) => { const parts = rel.split('/'), walk = (dirRel, i) => { fs.mkdirSync(path.join(tmp, dirRel), { recursive: true });
        for (const e of fs.readdirSync(path.join(root, dirRel))) { if (e === '.git') continue; const r2 = dirRel ? dirRel + '/' + e : e;
          if (i < parts.length - 1 && e === parts[i]) walk(r2, i + 1); else if (i === parts.length - 1 && e === parts[i]) fs.writeFileSync(path.join(tmp, r2), newText); else fs.symlinkSync(path.join(root, r2), path.join(tmp, r2)); } }; walk('', 0); };
      const leaf = pop.find(x => x.app === 'viewer' && x.f.startsWith('viewer/') && x.f.endsWith('.html') && x.kind === 'tag' && !ownT.has(x.t) && !/(^|\/)lib\//.test(x.t));
      if (!leaf) { inconclusive.push('C28: no leaf module with a tag in a viewer page'); claim('C28', false, 'judged nothing'); }
      else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-c28-')), tmp0 = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-c28c-'));
        try {
          farm(T, tmp, leaf.t, rdT(leaf.t) + '\n// c28: changed by hand, no press\n'); farm(T, tmp0, leaf.t, rdT(leaf.t));
          const run = root => cp.spawnSync(process.execPath, [GEN_JS, '--check', '--root', root], { encoding: 'utf8', maxBuffer: 1 << 27 }), c = run(tmp), c0 = run(tmp0);
          const want = `§MANIFEST_FAIL ${leaf.t} changed but ${leaf.f}:${leaf.line} still says ?v=${leaf.v}; run: node scripts/bump.js ${leaf.t} --write`, hit = c.stdout.split('\n').includes(want);
          claim('C28', c.status === 1 && hit && c0.status === 0, `${leaf.t} changed in a temp tree, no press: --check exit=${c.status} names_file_page_line_command=${hit ? 'Y' : 'N'} (${leaf.f}:${leaf.line}) · same tree, file unchanged: exit=${c0.status} (the refusal is the change's)`);
          if (!hit) say('  §MANIFEST_C28_GOT ' + (c.stdout.split('\n').filter(l => /FAIL|CHECK/.test(l)).slice(0, 3).join(' | ').slice(0, 300) || '(no FAIL line)'));
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(tmp0, { recursive: true, force: true }); }
      }
      // C29 NO-CHANGE-NO-RAISE: two presses in a row: the first writes (and steps CACHE_VERSION once), the second writes 0 bytes and steps nothing
      const cvOf = sn => +/CACHE_VERSION\s*=\s*'v(\d+)'/.exec(sn.get('viewer/sw.js'))[1];
      if (!leaf) { inconclusive.push('C29: no leaf module'); claim('C29', false, 'judged nothing'); }
      else {
        const t = mini('viewer', [leaf.t]); touchIn(t, leaf.t);
        const s0 = snapOf(t), p1 = bumpIn(t, [leaf.t, '--write']), s1 = snapOf(t), p2 = bumpIn(t, [leaf.t, '--write']), s2 = snapOf(t), again = changedSet(s1, s2);
        claim('C29', p1.status === 0 && p2.status === 0 && changedSet(s0, s1).length > 1 && cvOf(s1) === cvOf(s0) + 1 && !again.length && cvOf(s2) === cvOf(s1) && /written=0/.test(p2.stdout),
          `press 1: files_changed=${changedSet(s0, s1).length} CACHE_VERSION v${cvOf(s0)}->v${cvOf(s1)} · press 2: files_changed=${again.length} CACHE_VERSION v${cvOf(s1)}->v${cvOf(s2)} written=${(/written=(\d+)/.exec(p2.stdout) || [])[1]}`);
      }
      // C30 LOADER-CHAIN: a lazy child of a loader changed: the loader's literal for it, the loader's own code, and the page's tag of the loader all follow (codes recomputed here from the bytes in the temp tree)
      const pair = pop.find(x => x.app === 'viewer' && x.kind === 'lazy' && !x.f.endsWith('.html') && !ownT.has(x.t) && pop.some(y => y.t === x.f && y.kind === 'tag' && y.f.endsWith('.html')));
      if (!pair) { inconclusive.push('C30: no lazy child of a loader that a page loads'); claim('C30', false, 'judged nothing'); }
      else {
        const pg = pop.find(y => y.t === pair.f && y.kind === 'tag' && y.f.endsWith('.html')), t = mini('viewer', [pair.t]); touchIn(t, pair.t);
        const b = snapOf(t); bumpIn(t, [pair.t, '--write']); const a = snapOf(t);
        const lit = G.readSites(pair.f, a.get(pair.f)).find(z => z.kind === 'lazy' && z.as === pair.as), tag = G.readSites(pg.f, a.get(pg.f))[pg.at], tag0 = G.readSites(pg.f, b.get(pg.f))[pg.at];
        const okLit = !!lit && lit.v === sha8(Buffer.from(a.get(pair.t))), okLoader = a.get(pair.f) !== b.get(pair.f), okTag = !!tag && tag.v === sha8(Buffer.from(a.get(pair.f))) && tag.v !== tag0.v;
        claim('C30', okLit && okLoader && okTag, `child ${pair.t} changed: ${pair.f} literal=${lit ? lit.v : '-'} (child code ${sha8(Buffer.from(a.get(pair.t)))}) ${okLit ? 'ok' : 'WRONG'} · loader bytes changed=${okLoader ? 'Y' : 'N'} · ${pg.f}:${pg.line} tag of ${pair.f} ${tag0 ? tag0.v : '-'}->${tag ? tag.v : '-'} (loader code ${sha8(Buffer.from(a.get(pair.f)))}) ${okTag ? 'ok' : 'WRONG'}`);
      }
      // R27-R29 (in this run, the three population claims can FAIL): the same arrays with one site changed, judged by the same rules
      { const i = pop.findIndex(z => z.v != null), j = pop.findIndex(z => pop.some(y => y !== z && y.t === z.t));
        const p27 = pop.map((z, k) => k === i ? Object.assign({}, z, { v: '00000000' }) : z), n27 = p27.filter(x => x.v !== codeOf(x.t)).length;
        redSay('R27', i >= 0 && n27 === wrong.length + 1, `C26's rule on the same sites with ${pop[i] ? pop[i].f + ':' + pop[i].line : '-'} rewritten to ?v=00000000: wrong ${wrong.length} -> ${n27}`);
        const p28 = pop.map((z, k) => k === j ? Object.assign({}, z, { v: '11111111' }) : z), m28 = new Map(); for (const x of p28) { if (!m28.has(x.t)) m28.set(x.t, new Set()); m28.get(x.t).add(x.v); }
        redSay('R28', j >= 0 && [...m28].filter(([, v]) => [...v].filter(c => c != null).length > 1).length === dis.length + 1, `C27's rule with one of two sites of ${pop[j] ? pop[j].t : '-'} given another code: disagree ${dis.length} -> ${[...m28].filter(([, v]) => [...v].filter(c => c != null).length > 1).length}`);
        const p29 = pop.map((z, k) => k === i ? Object.assign({}, z, { v: null }) : z);
        redSay('R29', i >= 0 && p29.filter(x => x.v == null).length === unc.length + 1, `C31's rule with the code of ${pop[i] ? pop[i].f + ':' + pop[i].line : '-'} removed: uncoded ${unc.length} -> ${p29.filter(x => x.v == null).length}`); }
    }
  } finally { tmps.forEach(t => fs.rmSync(t, { recursive: true, force: true })); }
  // R23: --adopt refuses an owned file, a lib/ file, the FROZEN file, a missing file; it writes nothing (pure)
  { const lib = trackedFiles(ROOT).find(f => /(^|\/)lib\/.*\.js$/.test(f)), cases = [['viewer/viewer.html', /already owned by viewer/], [lib, /under lib\/ or tests\//], [G.FROZEN[0], /FROZEN/], ['zz_no_such.html', /no such file/]];
    const got = cases.map(([f, re]) => { const r = MS.adopt(ROOT, 'viewer', [f]); return r.fails.some(x => re.test(x)); });
    redSay('R23', got.every(Boolean), `--adopt refusals: owned=${got[0]} lib=${got[1]} frozen=${got[2]} missing=${got[3]} (each refused with a reason, nothing written)`); }
  // R24: a tag's other attributes (data-*, async, a line break inside the tag) are the page's: the renderer dropping them is detected
  { const V2 = r.apps.find(a => a.manifest.app === 'viewer'), file = 'index.html', mm = clone(V2.manifest), kept = [];
    mm.modules.forEach(x => x.sites.forEach(z => { if (z.in === file && z.keep) kept.push(z); }));
    const base = R.readHtml('<script data-x="1"\n  async src="a.js?v=2"></script>').tags[0];
    if (!kept.length) { inconclusive.push('R24: index.html has no tag that keeps other attributes'); redSay('R24', false, 'judged nothing'); }
    else { const was = G.regenerate(mm, V2.frames, file); kept.forEach(z => { delete z.keep; }); const g = G.regenerate(mm, V2.frames, file);
      redSay('R24', was.ok && was.text === V2.frames.get(file).src && g.ok && g.text !== V2.frames.get(file).src && base.canonical && !!base.keep && R.renderTag(base) === base.raw, `${kept.length} tag(s) of ${file} keep their attributes (${kept.map(z => z.as).join(',')}): round trip identical; with the attributes dropped the page differs; reader fixture data-x + async + line break: canonical=${base.canonical} renderTag==raw ${R.renderTag(base) === base.raw}`); } }
}

// ---- WO-2: C32 + R30-R32 (the `desk` site kind)
NCLAIMS += 1;
{
  const page = 'viewer/viewer.html', m = SRC_M.get('viewer'), pageText = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const raw = txt => {   // an independent reader: regexes only, no parser
    const b = /var\s+_DESK\s*=\s*\[([\s\S]*?)\n\];/.exec(txt);
    return { blockAt: b ? b.index : -1, runs: b ? [...b[1].matchAll(/\[([^\[\]]*)\]/g)].map(x => [...x[1].matchAll(/'([^'?]+)\?v=[0-9a-f]{8}'/g)].map(y => y[1])) : [],
      calls: [...txt.matchAll(/^<script>_desk\((\d+)\)<\/script>$/gm)].map(x => ({ run: +x[1], at: x.index })) };
  };
  const judge = (txt, mm) => {
    const rw = raw(txt), want = (mm.order[page] || []).filter(z => z.kind === 'desk').map(z => z.as), flat = [].concat(...rw.runs), tags = R.readHtml(txt).tags, bad = [];
    if (!(flat.length === want.length && flat.every((f, i) => f === want[i]))) bad.push(`files: page ${flat.length} vs manifest ${want.length}`);
    if (!(rw.runs.length > 0 && rw.calls.length === rw.runs.length && rw.calls.every((c, i) => c.run === i && c.at > rw.blockAt && (!i || c.at > rw.calls[i - 1].at)))) bad.push(`calls: ${rw.calls.length} for ${rw.runs.length} runs`);
    const stat = flat.filter(f => tags.some(t => t.as === f)); if (stat.length) bad.push('also a static tag: ' + stat.join(','));
    if (!(tags.length && tags[0].as === 'config.js' && tags[0].start < rw.blockAt)) bad.push('config.js is not the first tag, before the block');
    const notFlagged = want.filter(f => { const x = mm.modules[path.posix.normalize('viewer/' + f)] /* '../common/x.js' (WO-4) names common/x.js */; return !x || x.load !== 'boot' || x.phone !== false; }); if (notFlagged.length) bad.push('not boot + phone:false: ' + notFlagged.join(','));
    return { ok: !bad.length && want.length > 0, bad, files: want.length, runs: rw.runs.length };
  };
  const j0 = judge(pageText, m);
  if (!j0.files) inconclusive.push('C32: no desk site in viewer/modules.json (nothing judged)');
  claim('C32', j0.ok, `desk files=${j0.files} runs=${j0.runs} ${j0.ok ? 'equal to the raw reading, one in-order call per run, no static twin, config.js first' : j0.bad.join(' | ')}`);
  const noCall = pageText.replace(/^<script>_desk\(1\)<\/script>\n/m, ''), twin = pageText.replace('<script src="light_law.js', '<script src="structural_sanity.js"></script>\n<script src="light_law.js');   // WO-6: sky_occlusion.js (the old anchor) is a desk site now; light_law.js stays a static tag
  redSay('R30', noCall !== pageText && !judge(noCall, m).ok && j0.ok, `the page without its _desk(1) call: C32 ${judge(noCall, m).ok ? 'still ok (NOT detected)' : 'refuses: ' + judge(noCall, m).bad.join(' | ')}`);
  redSay('R31', twin !== pageText && !judge(twin, m).ok && j0.ok, `a static tag planted for a desk file: C32 ${judge(twin, m).ok ? 'still ok (NOT detected)' : 'refuses: ' + judge(twin, m).bad.join(' | ')}`);
  const dsk = (m.order[page] || []).filter(z => z.kind === 'desk').map(z => 'viewer/' + z.as), edge = (a, b) => { const mm = clone(m); mm.modules[a].deps = [...new Set([...mm.modules[a].deps, b])]; return MS.order(mm, ROOT).errors.filter(e => e.includes('loads after') && e.includes(b) && e.includes(a)); };
  if (dsk.length < 3) { inconclusive.push('R32: fewer than 3 desk files'); redSay('R32', false, 'judged nothing'); }
  else { const first = dsk[0], second = dsk[1], last = dsk[dsk.length - 1], wrong1 = edge(first, last), wrong2 = edge(first, second), right1 = edge(last, first), right2 = edge(second, first);
    redSay('R32', wrong1.length === 1 && wrong2.length === 1 && right1.length === 0 && right2.length === 0, `order check on desk sites: ${first} deps ${last} -> ${wrong1.length} refusal, ${first} deps ${second} -> ${wrong2.length} refusal; the reverse edges -> ${right1.length}/${right2.length} refusals`); }
}

// ---- WO-33: C33 + R33-R35 (the `hint` site kind)
NCLAIMS += 1;
{
  const page = 'viewer/viewer.html', m = SRC_M.get('viewer'), pageText = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const hex8 = f => MS.hash8(fs.readFileSync(path.join(ROOT, f)));
  const raw = txt => {   // an independent reader: regexes only, no parser
    const b = /<!-- §MANIFEST:BEGIN viewer hints[^\n]*-->\n([\s\S]*?)<!-- §MANIFEST:END viewer hints -->/.exec(txt), d = /var\s+_DESK\s*=\s*\[([\s\S]*?)\n\];/.exec(txt), fs0 = /<script\b/i.exec(txt);
    return { blockAt: b ? b.index : -1, blockEnd: b ? b.index + b[0].length : -1, firstScript: fs0 ? fs0.index : -1,
      hints: b ? [...b[1].matchAll(/^<link rel="preload" as="script" href="([^"?]+)\?v=([0-9a-f]{8})" media="\(min-device-width: 1024px\)">$/gm)].map(x => ({ f: x[1], v: x[2] })) : [],
      lines: b ? b[1].split('\n').filter(l => /<link\b/.test(l)).length : -1,
      desk: d ? [...d[1].matchAll(/'([^'?]+)\?v=([0-9a-f]{8})'/g)].map(x => ({ f: x[1], v: x[2] })) : [] };
  };
  const judge = (txt, mm) => {
    const rw = raw(txt), want = (mm.order[page] || []).filter(z => z.kind === 'hint').map(z => z.as), desk = (mm.order[page] || []).filter(z => z.kind === 'desk').map(z => z.as), bad = [];
    if (!(rw.hints.length === want.length && rw.hints.every((h, i) => h.f === want[i]))) bad.push(`hints: page ${rw.hints.length} vs manifest ${want.length}`);
    if (rw.lines !== rw.hints.length) bad.push(`${rw.lines} <link> lines in the block, ${rw.hints.length} of the generator's spelling (media query / attributes)`);
    if (!(want.length === desk.length && [...want].sort().join('|') === [...desk].sort().join('|') && new Set(want).size === want.length)) bad.push(`not one hint per desk file: ${want.length} hints, ${desk.length} desk files`);
    if (!(rw.hints.length === rw.desk.length && rw.hints.every((h, i) => h.f === rw.desk[i].f))) bad.push('hints and _DESK literals differ in files or order');
    const codeBad = rw.hints.filter(h => { const lit = rw.desk.find(x => x.f === h.f); const file = path.posix.normalize('viewer/' + h.f); return !lit || lit.v !== h.v || (fs.existsSync(path.join(ROOT, file)) && hex8(file) !== h.v); });
    if (codeBad.length) bad.push(`${codeBad.length} hint(s) whose code is not the _DESK literal's / the file's: ${codeBad.slice(0, 3).map(h => h.f).join(',')}`);
    if (!(rw.blockAt >= 0 && rw.firstScript > rw.blockEnd)) bad.push('the hints block is missing or does not end before the page\'s first <script>');
    return { ok: !bad.length && want.length > 0, bad, hints: want.length, desk: desk.length };
  };
  const j0 = judge(pageText, m);
  if (!j0.hints) inconclusive.push('C33: no hint site in viewer/modules.json (nothing judged)');
  claim('C33', j0.ok, `hint sites=${j0.hints} desk sites=${j0.desk} ${j0.ok ? 'equal to the raw reading: one hint per desk file in the same order, one media query, same code as the _DESK literal and the file, block before the first <script>' : j0.bad.join(' | ')}`);
  const chk = (tx, mm) => MS.check(ROOT, 'viewer', Object.assign({ texts: new Map([[page, tx]]), skipReview: true }, mm ? { manifestText: MS.serialize(mm) } : {})).fails;
  const base = chk(pageText).filter(f => /hint/.test(f));   // the unmutated page: no hint refusal (positive control)
  const L = pageText.split('\n'), first = L.findIndex(l => /^<link rel="preload" as="script" href=/.test(l)), hi = (m.order[page] || []).findIndex(z => z.kind === 'hint');
  // R33: a desk file without its hint — (a) the page alone loses the line (modules.json still lists it), (b) modules.json and the page both lose it (a desk site left with none)
  const ed33 = L.filter((l, i) => i !== first).join('\n'), f33a = chk(ed33), m33 = clone(m); m33.order[page].splice(hi, 1); const f33b = chk(ed33, m33).filter(f => /hint/.test(f));
  redSay('R33', first > 0 && hi >= 0 && !base.length && f33a.some(f => /in modules\.json but not in the file/.test(f)) && f33b.some(f => /has 0 hint\(s\)/.test(f)), `the first hint removed: from the page alone -> ${f33a.length} refusal(s) (${(f33a.find(f => /not in the file/.test(f)) || '-').slice(0, 90)}); from page AND modules.json -> ${f33b.length} refusal(s) (${(f33b[0] || '-').slice(0, 110)}); the page as committed: ${base.length}`);
  // R34: a hint for a file that has no desk site (config.js is a static tag) — listed in modules.json AND written in the block
  const ed34 = [...L.slice(0, first + 1), '<link rel="preload" as="script" href="config.js?v=' + hex8('viewer/config.js') + '" media="(min-device-width: 1024px)">', ...L.slice(first + 1)].join('\n'), m34 = clone(m); m34.order[page].splice(hi + 1, 0, { kind: 'hint', as: 'config.js' });
  const f34 = chk(ed34, m34).filter(f => /hint/.test(f));
  redSay('R34', first > 0 && hi >= 0 && f34.some(f => /hint for viewer\/config\.js has no desk site/.test(f)), `a hint for config.js (a static tag, no desk site) listed and planted: ${f34.length} refusal(s) - ${(f34[0] || '-').slice(0, 130)}`);
  // R35: ONE of the two sites of a file keeps an old code (a forgotten press on a hint)
  const ed35 = L.map((l, i) => i === first ? l.replace(/\?v=[0-9a-f]{8}/, '?v=00000000') : l).join('\n'), f35 = chk(ed35), c35 = judge(ed35, m);
  redSay('R35', first > 0 && f35.some(f => /changed but viewer\/viewer\.html:\d+ still says \?v=00000000; run: node scripts\/bump\.js /.test(f)) && !c35.ok, `one hint's code changed to 00000000: source check ${f35.length} refusal(s) (${(f35[0] || '').slice(0, 120)}); C33's code comparison ${c35.ok ? 'does NOT see it' : 'sees it: ' + c35.bad.join(' | ').slice(0, 120)}`);
}

if (!B2.multi) inconclusive.push('R21: no source app has a deps pair with both ends as tags on 2+ pages');
if (red.some(x => !x)) inconclusive.push('a red control was not detected');

const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const res = Witness('MANIFEST_ROUNDTRIP')
  .population(() => rows)
  .schema({ type: 'object', required: ['file', 'app', 'sites', 'identical'], properties: { file: { type: 'string', minLength: 1 }, sites: { type: 'integer', minimum: 1 }, identical: { const: true } } })
  .invariant('every owned file regenerates byte-identical from its app manifest', rs => rs.every(x => x.identical))
  .invariant('every claim agrees with its independent source (C1-C7, C17-C20 and C8-C15 for each source app, C22-C33)', () => claims.length === NCLAIMS && claims.every(c => c.ok))
  .redControl(rs => { const m = clone(V.manifest), [p, q] = pair(m), k = p.s.at; p.s.at = q.s.at; q.s.at = k; const g = G.regenerate(m, V.frames, MAIN); return rs.map(x => x.file === MAIN ? Object.assign({}, x, { identical: g.ok && g.text === V.frames.get(MAIN).src }) : x); })
  .run();
const identical = rows.filter(x => x.identical).length, t = r.tot, order = r.apps.reduce((n, a) => n + a.order.judged, 0);
const verdict = inconclusive.length ? 'INCONCLUSIVE' : (res.fail || r.verdict !== 'PASS' || claims.some(c => !c.ok)) ? 'FAIL' : 'PASS';
inconclusive.forEach(x => say('  §MANIFEST_INCONCLUSIVE ' + x));
say(`§MANIFEST_ROUNDTRIP apps=${r.apps.length} source=${SRC_APPS.join(',') || '-'} files=${rows.length} sites=${t.tag + t.asset + t.inline + t.lazy + t.desk + t.hint} tag=${t.tag} asset=${t.asset} inline=${t.inline} desk=${t.desk} hint=${t.hint} lazy=${t.lazy} precache=${t.precache} identical=${identical}/${rows.length} driven=${driven}/${drivenOf} sw_vm=${swVm}/${r.apps.length} claims=${claims.filter(c => c.ok).length}/${NCLAIMS}${SKIP_C7 ? ' c7=NOT-RUN' : ''}${SRC_APPS.length && SKIP_C9 ? ' c9=NOT-RUN' : ''} red=${red.filter(Boolean).length}/${red.length} outside_owned=${B3.outside} frozen=${B3.frozen} unresolved=${B3.unresolved} order_check=${order ? (B1.unreviewed ? 'INCONCLUSIVE' : r.apps.some(a => a.order.errors.length) ? 'FAIL' : 'PASS') : 'NOT-JUDGED'} deps_declared=${B1.declared} unreviewed=${B1.unreviewed} owner_gap=${B1.ownerGap} witness_gap=${B1.witGap} pinned=${B2.pinned} verdict=${verdict}`);
if (verdict !== 'PASS') process.exitCode = 1;
