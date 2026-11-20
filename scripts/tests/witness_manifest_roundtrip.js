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
//   C17 a bump of the modules with differing numbers writes the bytes bump.js's regex path writes on the same files (each site +1 from its own number)
//   C18 the pinned service-worker register literals never move: named as a target, or on a branch that changed sw.js (--changed)
//   C19 the deploy stamp's pattern (deploy-pages.yml) reads the manifest's cacheVersion from the generated sw.js
//   RED R16 a module's numbers on two pages swapped · R17 a site v deleted · R18 a site v equal to its module's · R19 a <script src> between two
//   marker pairs · R20 `pin` removed, then sw.js bumped · R21 a deps pair swapped on ONE of the pages that hold both (C20: the order holds on every page). (The spec numbers these R13-R17; R13-R15 were taken by #3326.) ERP's load order: not judged.
// NOT JUDGED in the viewer and ERP: their load order (no deps declared there yet); R5 proves the refusal code on a synthetic edge.
// INCONCLUSIVE: an app with 0 sites, a parse failure, a red control not detected, the vm run throws, bump or the audit prints no line, C5 judged 0.
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
    const top = x => { const n = x.sites.map(z => z.v).filter(v => v != null); return n.length ? Math.max(...n) : null; };   // B2: a module's v is its highest site number (the reader says null when they differ)
    const key = x => JSON.stringify([top(x), x.load, x.precache, x.sites.map(z => [z.in, z.at, z.kind, z.as, z.v, z.onerror || null, z.q || null]).sort()]);
    for (const x of b0.modules) { const y = read.get(x.file); if (!y || key(x) !== key(y) || x.v !== top(y) || (x.load === 'lazy' && !x.sites.some(z => z.in === x.lazyGroup))) { bad++; if (bad < 6) say('  §MANIFEST_C10_MISS module=' + x.file); } }
    bad += [...read.keys()].filter(f => !m.modules[f]).length;
    const vmOk = vmOut[app] && vmOut[app].V === m.cacheVersion && JSON.stringify(vmOut[app].P) === JSON.stringify(m.precacheOrder);
    claim('C10', !bad && vmOk, `app=${app} modules=${b0.modules.length} reader_modules=${read.size} differ=${bad} sw_vm=${vmOk ? 'same' : 'DIFFERS'}`); }
  // C11 — stable writes, both merge orders
  { const w1 = MS.write(ROOT, app), w2 = MS.write(ROOT, app, { texts: w1.out });
    const again = [...w2.out].filter(([f, t]) => t !== w1.out.get(f)).length;
    const page = m.pages ? null : Object.keys(m.order).find(f => f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2);
    const tagI = m.order[page].findIndex(z => z.kind === 'tag'), withSites = (adds) => { const mm = clone(m); adds.forEach(n => { mm.modules[app + '/' + n] = { v: 1, load: 'boot', lazyGroup: null, precache: true, deps: [], uses: [], notDeps: [], owner: '' }; mm.order[page].splice(tagI + 1 + mm.order[page].slice(tagI + 1).findIndex(() => true), 0, { kind: 'tag', as: n }); mm.precacheOrder.splice(3, 0, n); }); return mm; };
    const step = (mm, texts) => { const w = MS.write(ROOT, app, { manifest: mm, texts }); return w.fails.length ? null : w.out; };
    const both = withSites(['zz_b1_b.js', 'zz_b1_a.js']);   // the merged manifest: same lines whichever side merged first
    const ab = step(both, step(withSites(['zz_b1_a.js']))), ba = step(both, step(withSites(['zz_b1_b.js']))), ab2 = ab && step(both, ab);
    const same = ab && ba && [...ab].every(([f, t]) => ba.get(f) === t) && [...ab2].every(([f, t]) => ab.get(f) === t);
    const placed = ab && /zz_b1_a\.js\?v=1/.test(ab.get(page)) && /'zz_b1_b\.js'/.test(ab.get(m.sw)) && G.readSites(page, ab.get(page)).filter(z => z.kind === 'tag').length === m.order[page].filter(z => z.kind === 'tag').length + 2;
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
  const ok = a.tags === 0 && b.tags === 0 && b.inl === 1 && c.tags === 1 && c.last.canonical === true && c.last.as === 'zz_planted.js' && c.last.v === 1 && d.tags === 1 && d.last.canonical === false;
  redSay('R4', ok && base.tags.length > 0, `reader fixtures on modeller.html (${base.tags.length} tags): in a comment +${a.tags}, in an inline string +${b.tags}, a real tag +${c.tags} canonical=${c.last && c.last.canonical}, two spaces before src +${d.tags} canonical=${d.last && d.last.canonical} (refused)`); }
{ const m = clone(V.manifest), [p, q] = pair(m); q.mod.deps = [p.mod.file]; const before = G.checkOrder(m); const k = p.s.at; p.s.at = q.s.at; q.s.at = k; const after = G.checkOrder(m);
  redSay('R5', before.judged === 1 && before.errors.length === 0 && after.errors.length > 0, `synthetic=Y edge ${q.mod.file} -> ${p.mod.file}: in order errors=${before.errors.length}, swapped errors=${after.errors.length}`); }
if (B1.m) {
  const app = B1.app, m = B1.m, page = Object.keys(m.order).find(f => f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2);
  const tagIdx = (mm, f) => mm.order[page].findIndex(z => z.kind === 'tag' && MS.targetOf(mm, page, z.as) === f);
  // R6: a real confirmed deps pair, both tags of the page
  const pairs = []; for (const [f, x] of Object.entries(m.modules)) for (const d of x.deps) if (tagIdx(m, f) >= 0 && tagIdx(m, d) >= 0) pairs.push([f, d]);
  if (!pairs.length) { inconclusive.push('R6: no confirmed deps pair where both are tags of ' + page); redSay('R6', false, 'judged nothing'); }
  else { const mm = clone(m), [f, d] = pairs[0], i = tagIdx(mm, f), j = tagIdx(mm, d), t = mm.order[page][i]; mm.order[page][i] = mm.order[page][j]; mm.order[page][j] = t;
    const e = MS.order(mm, ROOT).errors; redSay('R6', e.some(x => x.includes(d + ' loads after ' + f)), `swapped ${f} and its confirmed dep ${d} (of ${pairs.length} tag pairs): refusals=${e.length}`); }
  // R7: a hand edit of one generated tag
  { const src = fs.readFileSync(path.join(ROOT, page), 'utf8'), t = R.readHtml(src).tags.find(x => x.v != null), ed = src.slice(0, t.start) + src.slice(t.start, t.end).replace('?v=' + t.v, '?v=' + (t.v + 7)) + src.slice(t.end);
    const c = MS.check(ROOT, app, { texts: new Map([[page, ed]]), skipReview: true }), line = src.slice(0, t.start).split('\n').length;
    redSay('R7', c.fails.some(f => f.startsWith(page + ':' + line + ' differs')), `${t.as}?v=${t.v} edited by hand to v=${t.v + 7} at ${page}:${line}: ${c.fails.filter(f => f.startsWith(page)).length} refusal(s) naming the file and line`); }
  // R8: a <script src> planted outside the markers
  { const src = fs.readFileSync(path.join(ROOT, page), 'utf8'), b = MS.BEGIN_TAGS.exec(src).index, ed = src.slice(0, b) + '<script src="zz_planted.js?v=1"></script>\n' + src.slice(b);
    const c = MS.check(ROOT, app, { texts: new Map([[page, ed]]), skipReview: true });
    redSay('R8', c.fails.some(f => /outside the §MANIFEST markers \(zz_planted\.js\)/.test(f)), `planted above the BEGIN marker: ${c.fails.filter(f => /outside the §MANIFEST/.test(f)).length} refusal(s)`); }
  // R9: one manifest line with its keys reordered
  { const raw = fs.readFileSync(path.join(ROOT, MS.sourceFile(app)), 'utf8'), L = raw.split('\n'), i = L.findIndex(l => /^  "[^"]+": \{"v":/.test(l)), mm = /^(  "[^"]+": )(\{.*\})(,?)$/.exec(L[i]);
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
// ---- B2 part 1 (bim-compiler CODE_ARCHITECTURE_DESIGN.md Part B, "B2 BUILD SPEC"; #3365). ISSUE: "an app whose pages load one module under DIFFERENT
//   numbers (ERP: 10 modules) cannot be written from one modules.json without changing a byte, and its bumps cannot keep today's arithmetic".
//   Until erp/modules.json is committed (B2 part 2) ERP is switched HERE, in memory and in temp trees (trial=Y): MS.init on the real tree, marker pairs
//   placed by a fixture rule (a new pair where two tags are more than 500 lines apart), every candidate edge kept as `uses` (the order review is part 2,
//   so ERP's load order is NOT judged here). The real tree is never written.
// B3 (#3377): the block runs for EVERY app whose pages load a module under different numbers (ERP and the viewer; the modeller has none).
const B2 = { siteV: 0, pinned: 0, trial: 'N', multi: 0 };
const B2_APPS = r.apps.filter(a => a.manifest.modules.some(x => new Set(x.sites.map(z => z.v)).size > 1));
NCLAIMS = NCLAIMS0 + 3 * B2_APPS.length + (B2_APPS.some(a => a.manifest.app === 'erp') ? 1 : 0) + B2_APPS.filter(a => MS.hasSource(ROOT, a.manifest.app)).length;
if (!B2_APPS.length) inconclusive.push('no app has a module with differing site numbers (C16-C18 would judge nothing)');
for (const a of B2_APPS) {
  const app = a.manifest.app, trial = !MS.hasSource(ROOT, app), os = require('os');
  const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), ls = (s, i) => s.lastIndexOf('\n', i - 1) + 1, le = (s, i) => { const e = s.indexOf('\n', i); return e < 0 ? s.length : e + 1; };
  let m, texts = new Map();
  if (trial) {
    m = MS.init(ROOT, app, { by: 'witness-trial' }).m;
    for (const rec of Object.values(m.modules).concat(Object.values(m.inline))) { rec.uses = [...new Set([...rec.uses, ...rec.deps])].sort(); rec.deps = []; }
    for (const f of Object.keys(m.order).filter(f => f.endsWith('.html'))) {
      let src = rd(f); const tags = R.readHtml(src).tags; if (tags.length <= 1) continue;
      const line = i => src.slice(0, i).split('\n').length, groups = [[tags[0]]];
      for (let i = 1; i < tags.length; i++) { if (line(tags[i].start) - line(tags[i - 1].end) > 500) groups.push([]); groups[groups.length - 1].push(tags[i]); }
      for (const g of groups.reverse()) { const e = le(src, g[g.length - 1].end), b = ls(src, g[0].start); src = src.slice(0, b) + `<!-- §MANIFEST:BEGIN ${app} tags -->\n` + src.slice(b, e) + `<!-- §MANIFEST:END ${app} tags -->\n` + src.slice(e); }
      texts.set(f, src);
    }
    { let src = rd(m.sw); const pre = G.swFrame(m.sw, src).pre, e = le(src, pre[pre.length - 1].end), b = ls(src, pre[0].start);
      texts.set(m.sw, src.slice(0, b) + '// §MANIFEST:BEGIN precache\n' + src.slice(b, e) + '// §MANIFEST:END precache\n' + src.slice(e)); }
  } else m = JSON.parse(rd(MS.sourceFile(app)));
  const text = f => texts.has(f) ? texts.get(f) : rd(f), chk = (mm, tx) => MS.check(ROOT, app, { manifestText: MS.serialize(mm), texts: tx || texts, skipReview: true });
  const eff = (mm, f, s) => 'v' in s ? s.v : mm.modules[MS.targetOf(mm, f, s.as)].v;
  const setEff = (mm, f, s, v) => { if (v === mm.modules[MS.targetOf(mm, f, s.as)].v) delete s.v; else s.v = v; };
  const base = chk(m), own = [], pins = [];
  for (const f of Object.keys(m.order)) m.order[f].forEach((s, at) => { if ('v' in s) own.push({ f, at, s }); if (s.pin) pins.push({ f, at, s }); });
  B2.siteV += own.length; B2.pinned += pins.length; if (trial) B2.trial = 'Y';
  base.fails.slice(0, 8).forEach(x => say('  §MANIFEST_B2_FAIL ' + x));
  // C16 — the site numbers are exactly today's disagreements, judged against B0's reader of the committed tree
  { const key = x => JSON.stringify(x.sites.map(z => [z.in, z.at, z.kind, z.as, z.v]).sort()), read = new Map(a.manifest.modules.map(x => [x.file, x])); let differ = 0, want = 0;
    for (const x of MS.expand(m).b0.modules) { const y = read.get(x.file); if (!y || key(x) !== key(y)) { differ++; if (differ < 6) say('  §MANIFEST_C16_MISS module=' + x.file); } }
    for (const y of a.manifest.modules) { const nums = y.sites.map(z => z.v).filter(v => v != null); if (nums.length) want += y.sites.filter(z => z.v !== Math.max(...nums)).length; }
    if (!own.length) inconclusive.push('C16: 0 sites carry their own v (C16 and C17 would judge nothing)');
    claim('C16', !base.fails.length && !differ && own.length === want && own.length > 0, `app=${app} trial=${trial ? 'Y' : 'N'} check_fails=${base.fails.length} driven_files=${base.info.identical}/${base.info.files} marker_pairs=${base.info.pairs || 0} modules_differing_from_reader=${differ} site_v=${own.length} reader_says=${want} (below the module's highest ${own.filter(o => o.s.v != null).length}, no ?v= ${own.filter(o => o.s.v == null).length}) pinned=${pins.length}`); }
  // C17-C19 in temp trees: A = the files as committed (bump.js's regex path, untouched code), B = the same with modules.json + markers (the manifest path)
  const tA = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b2a-')), tB = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b2b-')), home = fs.mkdtempSync(path.join(os.tmpdir(), 'w-manifest-b2h-'));
  try {
    const owned = [...Object.keys(m.order), m.sw], multi = Object.keys(m.modules).filter(f => own.some(o => MS.targetOf(m, o.f, o.s.as) === f));
    const targets = multi.filter(f => fs.existsSync(path.join(ROOT, f)) && MS.expand(m).b0.modules.find(x => x.file === f).sites.every(z => z.kind === 'tag' || z.kind === 'lazy'));
    const put = (t, f, s) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), s); };
    for (const f of owned) { put(tA, f, rd(f)); put(tB, f, text(f)); }
    const chg = targets[0];   // the module a later branch 'changes' in C18
    for (const f of targets.filter(f => !owned.includes(f))) { put(tA, f, rd(f)); put(tB, f, rd(f)); }
    put(tB, MS.sourceFile(app), MS.serialize(m));
    const env = Object.assign({}, process.env, { BUMP_PARITY: 'off', BUMP_PARITY_HOME: home });
    const bump = (t, args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'bump.js'), ...args, '--root', t], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
    const unmark = s => s.split('\n').filter(l => !/§MANIFEST:(BEGIN|END)\b/.test(l)).join('\n'), get = (t, f) => fs.readFileSync(path.join(t, f), 'utf8');
    if (!targets.length) { inconclusive.push('C17: no module with differing site numbers whose sites are all tags / loader literals'); claim('C17', false, 'judged nothing'); }
    else {
      const ra = bump(tA, [...targets, '--write']), rb = bump(tB, [...targets, '--write']);
      const diff = owned.filter(f => unmark(get(tA, f)) !== unmark(get(tB, f))), moved = owned.filter(f => get(tA, f) !== rd(f)).length;
      const la = (ra.stdout.match(/^§BUMP (?:page|loader)=.*$/mg) || []).length, lb = (rb.stdout.match(/^§BUMP (?:page|loader)=.*$/mg) || []).length;
      diff.slice(0, 5).forEach(f => say('  §MANIFEST_C17_MISS file=' + f + ' the manifest bump wrote other bytes than the regex bump'));
      claim('C17', ra.status === 0 && rb.status === 0 && !diff.length && moved > 1 && la === lb && la > targets.length, `app=${app} modules_bumped=${targets.length} (${targets.map(f => path.basename(f)).join(',')}) regex_exit=${ra.status} manifest_exit=${rb.status} bump_lines=${la}/${lb} files_changed=${moved} files_differing=${diff.length}/${owned.length}`);
    }
    // C19 — the deploy stamp's own pattern still reads the version from the sw.js the generator wrote
    if (app === 'erp') { const yml = rd('.github/workflows/deploy-pages.yml'), has = yml.includes(`grep -oE "CACHE_VERSION = '[^']+'" erp/sw.js`), mm = JSON.parse(get(tB, MS.sourceFile(app)));
      const hit = /CACHE_VERSION = '([^']+)'/.exec(get(tB, m.sw));
      if (!has) inconclusive.push('C19: deploy-pages.yml no longer holds the stamp pattern this claim quotes');
      claim('C19', has && hit && hit[1] === mm.cacheVersion && (!targets.length || mm.cacheVersion !== m.cacheVersion), `app=${app} stamp_reads=${hit ? hit[1] : '-'} manifest=${mm.cacheVersion} before_the_bump=${m.cacheVersion}`); }
    // C18 — the pinned literals never move: named as a target (same refusal as the regex path), and on a branch that changed sw.js (--changed)
    if (!pins.length || !chg) { inconclusive.push('C18: ' + app + ' has no pinned site, or no module to change'); claim('C18', false, 'judged nothing'); }
    else {
      const lit = t => pins.map(p => { const s = G.readSites(p.f, get(t, p.f))[p.at]; return p.f + ':' + s.as + '?v=' + s.v; }).join(' '), before = lit(tB);
      const da = bump(tA, [m.sw]), db = bump(tB, [m.sw]), errA = /^§BUMP_ERR not_loaded_by_any_page_or_loader/m.test(da.stdout), errB = /^§BUMP_ERR not_loaded_by_any_page_or_loader/m.test(db.stdout);
      const git = (args, extra) => cp.execFileSync('git', args, { cwd: tB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 'w', GIT_AUTHOR_EMAIL: 'w@w', GIT_COMMITTER_NAME: 'w', GIT_COMMITTER_EMAIL: 'w@w' }, extra || {}) }).trim();
      git(['init', '-q']); git(['add', '-A']); const c = git(['commit-tree', git(['write-tree']), '-m', 'base']); git(['update-ref', 'HEAD', c]); git(['update-ref', 'refs/remotes/origin/main', c]);
      fs.appendFileSync(path.join(tB, m.sw), '// changed on this branch\n'); fs.appendFileSync(path.join(tB, chg), '// changed on this branch\n');
      const ch = bump(tB, ['--changed', '--write']), files = (/^§BUMP_CHANGED .* files=(\S*)/m.exec(ch.stdout) || [])[1] || '', swLines = (ch.stdout.match(/^§BUMP \w+=\S+ ref=sw\.js .*$/mg) || []).length, after = lit(tB);
      claim('C18', da.status === 2 && db.status === 2 && errA && errB && ch.status === 0 && files === chg && swLines === 0 && after === before, `app=${app} pinned=${pins.length} named_as_target: regex_exit=${da.status} manifest_exit=${db.status} · --changed (sw.js + ${path.basename(chg)} changed): exit=${ch.status} bumpable=${files || '-'} sw_lines=${swLines} literals ${before === after ? 'unchanged' : 'MOVED'} (${after})`);
      // R20: without `pin` the same target raises the register literal
      { const mm = JSON.parse(get(tB, MS.sourceFile(app))); Object.values(mm.order).forEach(l => l.forEach(s => { delete s.pin; })); put(tB, MS.sourceFile(app), MS.serialize(mm));
        const o = bump(tB, [m.sw]).stdout, n = (o.match(/^§BUMP inline=\S+ ref=sw\.js v=\d+->\d+/mg) || []).length;
        redSay('R20', n === pins.length, `"pin" removed from ${pins.length} register literal(s), then bump ${m.sw}: ${n} would be raised`); }
    }
  } finally { for (const t of [tA, tB, home]) fs.rmSync(t, { recursive: true, force: true }); }
  // C20 + R21 (the spec's R18) — only once the app is a SOURCE (its deps are declared): the order holds on EVERY page where both ends are tags,
  //   judged against the pages' own bytes (the tag positions page_refs reads), not against the manifest's `order`.
  if (!trial) {
    const pagesOf = Object.keys(m.order).filter(f => f.endsWith('.html')), pos = new Map();
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
  // R16-R19 on the manifest and texts above (in memory)
  { const cand = own.filter(o => o.s.v != null).map(o => ({ o, other: Object.keys(m.order).filter(f => f !== o.f && f.endsWith('.html')).map(f => ({ f, at: m.order[f].findIndex(s => MS.targetOf(m, f, s.as) === MS.targetOf(m, o.f, o.s.as) && eff(m, f, s) != null && eff(m, f, s) !== o.s.v) })).find(x => x.at >= 0) })).find(x => x.other && x.o.f.endsWith('.html'));
    if (!cand) { inconclusive.push('R16: no module with two different numbers on two pages'); redSay('R16', false, 'judged nothing'); }
    else { const mm = clone(m), s1 = mm.order[cand.o.f][cand.o.at], s2 = mm.order[cand.other.f][cand.other.at], v1 = eff(mm, cand.o.f, s1), v2 = eff(mm, cand.other.f, s2); setEff(mm, cand.o.f, s1, v2); setEff(mm, cand.other.f, s2, v1);
      const c = chk(mm), n1 = c.fails.some(x => x.startsWith(cand.o.f + ':') && /differs/.test(x)), n2 = c.fails.some(x => x.startsWith(cand.other.f + ':') && /differs/.test(x));
      redSay('R16', n1 && n2, `${s1.as}: its numbers on ${cand.o.f} (${v1}) and ${cand.other.f} (${v2}) swapped in the manifest: refusal naming each page ${n1 ? 'Y' : 'N'}/${n2 ? 'Y' : 'N'}`); } }
  if (own.length) {
    { const mm = clone(m), o = own[0]; delete mm.order[o.f][o.at].v; const c = chk(mm); redSay('R17', c.fails.some(x => x.startsWith(o.f + ':') && /differs/.test(x)), `the site v of ${o.s.as} on ${o.f} deleted: ${c.fails.filter(x => /differs/.test(x)).length} refusal(s)`); }
    { const mm = clone(m), f = Object.keys(mm.order).find(k => mm.order[k].some(s => !('v' in s) && mm.modules[MS.targetOf(mm, k, s.as)].v != null)), s = mm.order[f].find(z => !('v' in z) && mm.modules[MS.targetOf(mm, f, z.as)].v != null); s.v = mm.modules[MS.targetOf(mm, f, s.as)].v;
      const c = chk(mm); redSay('R18', c.fails.some(x => /not canonical/.test(x) && x.includes('(' + s.as + ')')), `a site v equal to its module's typed on ${s.as} in ${f}: ${c.fails.filter(x => /not canonical/.test(x)).length} refusal(s)`); }
  } else { redSay('R17', false, 'judged nothing'); redSay('R18', false, 'judged nothing'); }
  { const page = Object.keys(m.order).find(f => f.endsWith('.html') && (text(f).match(/§MANIFEST:END \S+ tags/g) || []).length > 1);
    if (!page) { inconclusive.push('R19: no page with two marker pairs'); redSay('R19', false, 'judged nothing'); }
    else { const src = text(page), e = /<!-- §MANIFEST:END \S+ tags -->\n/.exec(src), at = e.index + e[0].length, tx = new Map(texts); tx.set(page, src.slice(0, at) + '<script src="zz_planted.js?v=1"></script>\n' + src.slice(at));
      const c = chk(m, tx); redSay('R19', c.fails.some(x => /outside the §MANIFEST markers \(zz_planted\.js\)/.test(x)), `a <script src> planted between the two marker pairs of ${page} (line ${src.slice(0, at).split('\n').length}): ${c.fails.filter(x => /outside the §MANIFEST/.test(x)).length} refusal(s)`); } }
}
if (B2_APPS.some(a => MS.hasSource(ROOT, a.manifest.app)) && !B2.multi) inconclusive.push('R21: no source app has a deps pair with both ends as tags on 2+ pages');
if (red.some(x => !x)) inconclusive.push('a red control was not detected');

const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const res = Witness('MANIFEST_ROUNDTRIP')
  .population(() => rows)
  .schema({ type: 'object', required: ['file', 'app', 'sites', 'identical'], properties: { file: { type: 'string', minLength: 1 }, sites: { type: 'integer', minimum: 1 }, identical: { const: true } } })
  .invariant('every owned file regenerates byte-identical from its app manifest', rs => rs.every(x => x.identical))
  .invariant('every claim agrees with its independent source (C1-C7, C16-C20, and C8-C15 for each source app)', () => claims.length === NCLAIMS && claims.every(c => c.ok))
  .redControl(rs => { const m = clone(V.manifest), [p, q] = pair(m), k = p.s.at; p.s.at = q.s.at; q.s.at = k; const g = G.regenerate(m, V.frames, MAIN); return rs.map(x => x.file === MAIN ? Object.assign({}, x, { identical: g.ok && g.text === V.frames.get(MAIN).src }) : x); })
  .run();
const identical = rows.filter(x => x.identical).length, t = r.tot, order = r.apps.reduce((n, a) => n + a.order.judged, 0);
const verdict = inconclusive.length ? 'INCONCLUSIVE' : (res.fail || r.verdict !== 'PASS' || claims.some(c => !c.ok)) ? 'FAIL' : 'PASS';
inconclusive.forEach(x => say('  §MANIFEST_INCONCLUSIVE ' + x));
say(`§MANIFEST_ROUNDTRIP apps=${r.apps.length} source=${SRC_APPS.join(',') || '-'} files=${rows.length} sites=${t.tag + t.asset + t.inline + t.lazy} tag=${t.tag} asset=${t.asset} inline=${t.inline} lazy=${t.lazy} precache=${t.precache} identical=${identical}/${rows.length} driven=${driven}/${drivenOf} sw_vm=${swVm}/${r.apps.length} claims=${claims.filter(c => c.ok).length}/${NCLAIMS}${SKIP_C7 ? ' c7=NOT-RUN' : ''}${SRC_APPS.length && SKIP_C9 ? ' c9=NOT-RUN' : ''} red=${red.filter(Boolean).length}/${red.length} order_check=${order ? (B1.unreviewed ? 'INCONCLUSIVE' : r.apps.some(a => a.order.errors.length) ? 'FAIL' : 'PASS') : 'NOT-JUDGED'} deps_declared=${B1.declared} unreviewed=${B1.unreviewed} owner_gap=${B1.ownerGap} witness_gap=${B1.witGap} b2_trial=${B2.trial} site_v=${B2.siteV} pinned=${B2.pinned} verdict=${verdict}`);
if (verdict !== 'PASS') process.exitCode = 1;
