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
//   C14 the declared order holds: 0 refusals, deps_declared > 0     C15 owner and witnesses equal their extractors
//   RED R6 swap a confirmed deps pair (both tags) · R7 a hand edit of one generated tag · R8 a <script src> outside the markers · R9 one manifest
//   line with its keys reordered · R10 a dep that loads later + a boot module depending on a lazy one · R11 an owner typed by hand · R12 one
//   candidate removed from all three lists -> INCONCLUSIVE unreviewed=1. Each must be DETECTED.
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
const SRC_APPS = G.APPS.filter(a => MS.hasSource(ROOT, a)), NCLAIMS = 7 + (SRC_APPS.length ? 8 : 0) - (SKIP_C7 ? 1 : 0) - (SRC_APPS.length && SKIP_C9 ? 1 : 0);
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
    const key = x => JSON.stringify([x.v, x.load, x.precache, x.sites.map(z => [z.in, z.at, z.kind, z.as, z.v, z.onerror || null, z.q || null]).sort()]);
    for (const x of b0.modules) { const y = read.get(x.file); if (!y || key(x) !== key(y) || (x.load === 'lazy' && !x.sites.some(z => z.in === x.lazyGroup))) { bad++; if (bad < 6) say('  §MANIFEST_C10_MISS module=' + x.file); } }
    bad += [...read.keys()].filter(f => !m.modules[f]).length;
    const vmOk = vmOut[app] && vmOut[app].V === m.cacheVersion && JSON.stringify(vmOut[app].P) === JSON.stringify(m.precacheOrder);
    claim('C10', !bad && vmOk, `app=${app} modules=${b0.modules.length} reader_modules=${read.size} differ=${bad} sw_vm=${vmOk ? 'same' : 'DIFFERS'}`); }
  // C11 — stable writes, both merge orders
  { const w1 = MS.write(ROOT, app), w2 = MS.write(ROOT, app, { texts: w1.out });
    const again = [...w2.out].filter(([f, t]) => t !== w1.out.get(f)).length;
    const page = m.pages ? null : Object.keys(m.order).find(f => f.endsWith('.html') && m.order[f].filter(z => z.kind === 'tag').length > 2);
    const tagI = m.order[page].findIndex(z => z.kind === 'tag'), withSites = (adds) => { const mm = clone(m); adds.forEach(n => { mm.modules[app + '/' + n] = { v: 1, load: 'boot', lazyGroup: null, precache: true, deps: [], uses: [], notDeps: [], owner: '', witnesses: [] }; mm.order[page].splice(tagI + 1 + mm.order[page].slice(tagI + 1).findIndex(() => true), 0, { kind: 'tag', as: n }); mm.precacheOrder.splice(3, 0, n); }); return mm; };
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
  claim('C15', !info.ownerBad && !info.witBad, `app=${app} owner_mismatch=${info.ownerBad} witnesses_mismatch=${info.witBad} owner_gap=${info.ownerGap.length} witness_gap=${info.witGap.length}`);
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
}
if (red.some(x => !x)) inconclusive.push('a red control was not detected');

const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const res = Witness('MANIFEST_ROUNDTRIP')
  .population(() => rows)
  .schema({ type: 'object', required: ['file', 'app', 'sites', 'identical'], properties: { file: { type: 'string', minLength: 1 }, sites: { type: 'integer', minimum: 1 }, identical: { const: true } } })
  .invariant('every owned file regenerates byte-identical from its app manifest', rs => rs.every(x => x.identical))
  .invariant('every claim agrees with its independent source (C1-C7, and C8-C15 for a source app)', () => claims.length === NCLAIMS && claims.every(c => c.ok))
  .redControl(rs => { const m = clone(V.manifest), [p, q] = pair(m), k = p.s.at; p.s.at = q.s.at; q.s.at = k; const g = G.regenerate(m, V.frames, MAIN); return rs.map(x => x.file === MAIN ? Object.assign({}, x, { identical: g.ok && g.text === V.frames.get(MAIN).src }) : x); })
  .run();
const identical = rows.filter(x => x.identical).length, t = r.tot, order = r.apps.reduce((n, a) => n + a.order.judged, 0);
const verdict = inconclusive.length ? 'INCONCLUSIVE' : (res.fail || r.verdict !== 'PASS' || claims.some(c => !c.ok)) ? 'FAIL' : 'PASS';
inconclusive.forEach(x => say('  §MANIFEST_INCONCLUSIVE ' + x));
say(`§MANIFEST_ROUNDTRIP apps=${r.apps.length} source=${SRC_APPS.join(',') || '-'} files=${rows.length} sites=${t.tag + t.asset + t.inline + t.lazy} tag=${t.tag} asset=${t.asset} inline=${t.inline} lazy=${t.lazy} precache=${t.precache} identical=${identical}/${rows.length} driven=${driven}/${drivenOf} sw_vm=${swVm}/${r.apps.length} claims=${claims.filter(c => c.ok).length}/${NCLAIMS}${SKIP_C7 ? ' c7=NOT-RUN' : ''}${SRC_APPS.length && SKIP_C9 ? ' c9=NOT-RUN' : ''} red=${red.filter(Boolean).length}/${red.length} order_check=${order ? (B1.unreviewed ? 'INCONCLUSIVE' : r.apps.some(a => a.order.errors.length) ? 'FAIL' : 'PASS') : 'NOT-JUDGED'} deps_declared=${B1.declared} unreviewed=${B1.unreviewed} owner_gap=${B1.ownerGap} witness_gap=${B1.witGap} verdict=${verdict}`);
if (verdict !== 'PASS') process.exitCode = 1;
