#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B0 BUILD SPEC" (bim-ootb #3195).
// ISSUE: the same module lists are kept by hand in several places: page <script> tags, 'file?v=N' lists in lazy loaders,
//        each service worker's PRECACHE_ASSETS and CACHE_VERSION. Nothing says they can be rebuilt from ONE list per app.
// WHAT:  B0, CHECK MODE ONLY. Builds one manifest per app (viewer/, erp/, modeller/) FROM today's files, then regenerates every
//        owned file from that manifest and compares with the committed bytes. It WRITES NOTHING in the tree: no page, loader or
//        sw.js is changed and no manifest is committed (--out writes the manifests to a file you name, outside the tree).
//        The generator owns whole SITES (a whole script tag, a whole string literal, the CACHE_VERSION literal) and writes each
//        from manifest fields with one fixed spelling; the rest of the file is the frame. Dependencies are NOT declared today:
//        deps is [] everywhere and the order check prints NOT-JUDGED, never PASS.
// USE:   node scripts/gen_manifest.js --check [--root DIR] [--out FILE]
// EXIT:  0 every owned file regenerates byte-identical · 1 a file differs / a list is not plain literals / schema / unstable
// Read the log after every run: the §MANIFEST_* lines are the result, the exit code is not.
// Witness: scripts/tests/witness_manifest_roundtrip.js (W-MANIFEST-ROUNDTRIP).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const R = require('./lib/page_refs.js');
const P = path.posix;

const APPS = ['viewer', 'erp', 'modeller'];   // a folder with a tracked sw.js that Part B names (decision D1)
const SKIP_JS = /(^|\/)(lib|node_modules|tests?)\/|\.min\.js$|witness|(^|\/)sw\.js$/;
const SITE = { type: 'object', required: ['in', 'at', 'kind', 'as', 'v'], additionalProperties: false, properties: {
  in: { type: 'string', minLength: 1 }, at: { type: 'integer', minimum: 0 }, kind: { enum: ['tag', 'asset', 'inline', 'lazy'] },
  as: { type: 'string', minLength: 1 }, v: { type: ['integer', 'null'], minimum: 0 }, onerror: { type: 'string' }, q: { enum: ['"', '`'] } } };
const SCHEMA = { type: 'object', additionalProperties: false,
  required: ['app', 'sw', 'cacheVersion', 'depsDeclared', 'pages', 'loaders', 'modules', 'precacheOrder'],
  properties: {
    app: { enum: APPS }, sw: { type: 'string' }, cacheVersion: { type: 'string', pattern: '^v\\d+$' }, depsDeclared: { type: 'boolean' },
    pages: { type: 'array', items: { type: 'string' } }, loaders: { type: 'array', items: { type: 'string' } },
    precacheOrder: { type: 'array', minItems: 1, items: { type: 'string' } },
    modules: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false,
      required: ['file', 'deps', 'load', 'lazyGroup', 'precache', 'v', 'sites'],
      properties: { file: { type: 'string', minLength: 1 }, deps: { type: 'array', items: { type: 'string' } }, load: { enum: ['boot', 'lazy'] },
        lazyGroup: { type: ['string', 'null'] }, precache: { type: 'boolean' }, v: { type: ['integer', 'null'] }, sites: { type: 'array', minItems: 1, items: SITE } } } } } };

/**
 * Build one app's manifest and the frames of its owned files.
 * @param {string} root - bim-ootb tree
 * @param {string} app - 'viewer' | 'erp' | 'modeller'
 * @returns {{manifest:object, frames:Map<string,{src:string,slots:object[]}>, notes:object}}
 *   frames: per owned file, its committed text and the slots (byte ranges) the generator fills; a slot of sw.js is
 *   {start,end,sw:'precache',i} or {start,end,sw:'cv'}; any other slot is filled by the manifest site with the same `at`.
 */
function buildApp(root, app) {
  const ls = cp.execFileSync('git', ['ls-files', app + '/'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  const read = f => fs.readFileSync(path.join(root, f), 'utf8'), exists = f => fs.existsSync(path.join(root, f));
  const notes = { parseFail: [], nonCanonical: [], resolveDiff: [], partial: 0, nonJsInline: 0, unversionedTags: 0, inlineSites: 0, external: 0, missing: [], swProblems: [] };
  const frames = new Map(), perFile = [];
  const pages = ls.filter(f => f.endsWith('.html') && !/(^|\/)(lib|tests?)\//.test(f));
  for (const pg of pages) {
    const src = read(pg), h = R.readHtml(src), sites = [];
    for (const t of h.tags) {
      if (!t.canonical) notes.nonCanonical.push(pg + ': ' + t.raw.slice(0, 120));
      if (t.v == null) notes.unversionedTags++;
      const s = { start: t.start, end: t.end, kind: 'tag', as: t.as, v: t.v }; if (t.onerror != null) s.onerror = t.onerror; sites.push(s);
    }
    for (const a of h.assets) sites.push({ start: a.start, end: a.end, kind: 'asset', as: a.as, v: a.v });
    for (const b of h.inline) {
      if (b.type && !/javascript|module/i.test(b.type)) { notes.nonJsInline++; continue; }   // importmap, json …: not JS, counted
      const j = R.readJsSites(src.slice(b.start, b.end), b.start);
      if (!j.parsed) { notes.parseFail.push(pg + ' (inline script at byte ' + b.start + ')'); continue; }
      notes.partial += j.partial; notes.inlineSites += j.sites.length;
      for (const s of j.sites) sites.push(Object.assign({ start: s.start, end: s.end, kind: 'inline', as: s.as, v: s.v }, s.q === "'" ? {} : { q: s.q }));
    }
    if (sites.length) perFile.push({ file: pg, src, sites, base: P.dirname(pg) });   // a page with no site is not owned
  }
  const pageHas = new Set(perFile.filter(f => f.sites.length).map(f => f.file)), loaders = [];
  for (const f of ls.filter(f => f.endsWith('.js') && !SKIP_JS.test(f))) {
    const src = read(f); if (src.indexOf('?v=') < 0) continue;
    const j = R.readJsSites(src);
    if (!j.parsed) { notes.parseFail.push(f); continue; }
    notes.partial += j.partial;
    if (!j.sites.length) continue;
    loaders.push(f);
    perFile.push({ file: f, src, base: P.dirname(f), loader: true,
      sites: j.sites.map(s => Object.assign({ start: s.start, end: s.end, kind: 'lazy', as: s.as, v: s.v }, s.q === "'" ? {} : { q: s.q })) });
  }
  // the service worker
  const swFile = app + '/sw.js', swSrc = read(swFile), sw = R.readSw(swSrc);
  if (!sw.parsed) notes.parseFail.push(swFile);
  if (sw.parsed && (!sw.cacheVersion || sw.cacheVersionCount !== 1)) notes.swProblems.push(swFile + ": CACHE_VERSION must be exactly one  const CACHE_VERSION = 'v<digits>'");
  if (sw.parsed && !sw.precache) notes.swProblems.push(swFile + ': PRECACHE_ASSETS array not found');
  if (sw.nonLiteral) notes.swProblems.push(swFile + ': ' + sw.nonLiteral + ' PRECACHE_ASSETS element(s) are not plain string literals');
  const pre = sw.precache || [];
  if (pre.some(e => e.q !== "'")) notes.swProblems.push(swFile + ': a PRECACHE_ASSETS entry is not single-quoted');
  const swSlots = pre.map((e, i) => ({ start: e.start, end: e.end, sw: 'precache', i }));
  if (sw.cacheVersion) swSlots.push({ start: sw.cacheVersion.start, end: sw.cacheVersion.end, sw: 'cv' });
  frames.set(swFile, { src: swSrc, slots: swSlots.sort((a, b) => a.start - b.start) });
  const precached = new Set(pre.map(e => P.normalize(P.join(app, e.as.split('?')[0]))));

  // modules, in first-appearance order: the pages with the most tags first, then the loaders
  perFile.sort((a, b) => (a.loader ? 1 : 0) - (b.loader ? 1 : 0) || b.sites.filter(s => s.kind === 'tag').length - a.sites.filter(s => s.kind === 'tag').length || (a.file < b.file ? -1 : 1));
  const mods = new Map();
  for (const f of perFile) {
    f.sites.sort((a, b) => a.start - b.start);
    frames.set(f.file, { src: f.src, slots: f.sites.map(s => ({ start: s.start, end: s.end })) });
    f.sites.forEach((s, at) => {
      const ext = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(s.as);   // a CDN / absolute URL: keyed by the URL itself, never a file of the tree
      let target = ext ? s.as : P.normalize(P.join(f.base, s.as));
      if (ext) notes.external++;
      if (!ext && f.loader && !exists(target)) {          // a loader's literal is fetched relative to the PAGE that runs it, not to the loader
        const alt = P.normalize(P.join(app, s.as));
        if (exists(alt)) { notes.resolveDiff.push(f.file + ' ' + s.as); target = alt; }
      }
      if (!ext && !exists(target)) notes.missing.push(f.file + ' -> ' + target);
      if (!mods.has(target)) mods.set(target, { file: target, deps: [], load: 'lazy', lazyGroup: null, precache: precached.has(target), v: null, sites: [] });
      const site = { in: f.file, at, kind: s.kind, as: s.as, v: s.v };
      if (s.onerror != null) site.onerror = s.onerror; if (s.q) site.q = s.q;
      mods.get(target).sites.push(site);
    });
  }
  for (const m of mods.values()) {
    if (m.sites.some(s => s.kind === 'tag')) m.load = 'boot'; else m.lazyGroup = m.sites[0].in;
    const vs = new Set(m.sites.map(s => s.v)); m.v = vs.size === 1 ? m.sites[0].v : null;   // D3: one v only when every site agrees
  }
  const manifest = { app, sw: swFile, cacheVersion: sw.cacheVersion ? sw.cacheVersion.value : '', depsDeclared: false,
    pages: [...pageHas].sort(), loaders: loaders.sort(), modules: [...mods.values()], precacheOrder: pre.map(e => e.as) };
  return { manifest, frames, notes };
}

/** One site's text, from manifest fields only. */
function renderSite(s) {
  const ref = s.as + (s.v == null ? '' : '?v=' + s.v);
  if (s.kind === 'tag') return R.renderTag(s);
  if (s.kind === 'asset') return ref;
  const q = s.q || "'"; return q + ref + q;
}

/**
 * Regenerate one owned file from the manifest (after a JSON round trip of it) and that file's frame.
 * @returns {{ok:boolean, text:string, why?:string}}
 */
function regenerate(manifest, frames, file, asIs) {   // asIs: the caller already holds a JSON-round-tripped copy (the witness's 700-site loop)
  const m = asIs ? manifest : JSON.parse(JSON.stringify(manifest)), fr = frames.get(file);
  if (!fr) return { ok: false, text: '', why: 'not an owned file' };
  let fill;
  if (file === m.sw) fill = sl => sl.sw === 'cv' ? "'" + m.cacheVersion + "'" : (sl.i < m.precacheOrder.length ? "'" + m.precacheOrder[sl.i] + "'" : null);
  else {
    const at = new Map();
    for (const mod of m.modules) for (const s of mod.sites) if (s.in === file) { if (at.has(s.at)) return { ok: false, text: '', why: 'two sites at place ' + s.at }; at.set(s.at, s); }
    if (at.size !== fr.slots.length) return { ok: false, text: '', why: 'the manifest has ' + at.size + ' sites for ' + fr.slots.length + ' places' };
    fill = (sl, i) => at.has(i) ? renderSite(at.get(i)) : null;
  }
  if (file === m.sw && m.precacheOrder.length !== fr.slots.filter(s => s.sw === 'precache').length) return { ok: false, text: '', why: 'precacheOrder has ' + m.precacheOrder.length + ' entries for ' + fr.slots.filter(s => s.sw === 'precache').length + ' places' };
  let out = '', pos = 0;
  for (let i = 0; i < fr.slots.length; i++) {
    const sl = fr.slots[i], t = fill(sl, i);
    if (t == null) return { ok: false, text: '', why: 'no manifest entry for place ' + i };
    out += fr.src.slice(pos, sl.start) + t; pos = sl.end;
  }
  return { ok: true, text: out + fr.src.slice(pos) };
}

/** The frame: the file with every site cut out (what the generator does NOT own). */
function frameText(fr) { let out = '', pos = 0; for (const sl of fr.slots) { out += fr.src.slice(pos, sl.start); pos = sl.end; } return out + fr.src.slice(pos); }

/**
 * Load-order check against DECLARED deps. With none declared it judges nothing and says so.
 * @returns {{judged:number, errors:string[]}}
 */
function checkOrder(manifest) {
  const by = new Map(manifest.modules.map(m => [m.file, m])), errors = []; let judged = 0;
  const tagAt = (m, page) => { const s = m.sites.find(x => x.kind === 'tag' && x.in === page); return s ? s.at : null; };
  for (const m of manifest.modules) for (const d of m.deps) {
    judged++;
    const dm = by.get(d); if (!dm) { errors.push(m.file + ' depends on unknown ' + d); continue; }
    if (dm.deps.includes(m.file)) errors.push('cycle: ' + m.file + ' <-> ' + d);
    for (const pg of manifest.pages) { const a = tagAt(m, pg), b = tagAt(dm, pg); if (a != null && b != null && b > a) errors.push(pg + ': ' + d + ' loads after ' + m.file + ', which depends on it'); }
  }
  return { judged, errors };
}

/** Everything --check does for one tree. */
function check(root) {
  const Ajv = require(path.join(__dirname, '..', 'node_modules', 'ajv')), validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(SCHEMA);
  const apps = [], lines = [], fails = [];
  const tot = { files: 0, identical: 0, tag: 0, asset: 0, inline: 0, lazy: 0, precache: 0 };
  for (const app of APPS) {
    const a = buildApp(root, app), b = buildApp(root, app), m = a.manifest;
    if (JSON.stringify(m) !== JSON.stringify(b.manifest)) fails.push(app + ': two runs gave different manifests');
    if (!validate(m)) fails.push(app + ': schema: ' + new Ajv().errorsText(validate.errors));
    a.notes.parseFail.forEach(f => fails.push(app + ': cannot parse ' + f));
    a.notes.swProblems.forEach(f => fails.push(f));
    for (const [file, fr] of a.frames) {
      tot.files++;
      const g = regenerate(m, a.frames, file);
      if (g.ok && g.text === fr.src) { tot.identical++; continue; }
      let line = 0, i = 0; if (g.ok) { while (i < g.text.length && g.text[i] === fr.src[i]) i++; line = fr.src.slice(0, i).split('\n').length; }
      fails.push(file + (g.ok ? ':' + line + ' differs from what the manifest writes; canonical: ' + JSON.stringify(g.text.slice(i, i + 100)) + ' committed: ' + JSON.stringify(fr.src.slice(i, i + 100)) : ': ' + g.why));
    }
    const k = { tag: 0, asset: 0, inline: 0, lazy: 0 }, sitesOf = m.modules.reduce((n, x) => n + x.sites.length, 0);
    m.modules.forEach(x => x.sites.forEach(s => k[s.kind]++));
    Object.keys(k).forEach(x => { tot[x] += k[x]; }); tot.precache += m.precacheOrder.length;
    const boot = m.modules.filter(x => x.load === 'boot'), lazy = m.modules.filter(x => x.load === 'lazy');
    const dis = m.modules.filter(x => new Set(x.sites.filter(s => s.v != null).map(s => s.v)).size > 1);
    const below = dis.reduce((n, x) => { const mx = Math.max(...x.sites.map(s => s.v || 0)); return n + x.sites.filter(s => s.v != null && s.v < mx).length; }, 0);
    const modFiles = new Set(m.modules.map(x => x.file)), preFiles = m.precacheOrder.map(e => P.normalize(P.join(app, e.split('?')[0])));
    const dup = m.precacheOrder.length - new Set(m.precacheOrder).size, mjs = m.precacheOrder.filter(e => /^plugins\/.*\.mjs$/.test(e)).length;
    const mjsDisk = app === 'erp' ? cp.execFileSync('git', ['ls-files', 'erp/plugins/*.mjs'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).length : 0;
    lines.push(`§MANIFEST_APP app=${app} pages=${m.pages.length} loaders=${m.loaders.length} modules=${m.modules.length} boot=${boot.length} lazy=${lazy.length} sites=${sitesOf} tag=${k.tag} asset=${k.asset} inline=${k.inline} lazy_sites=${k.lazy} precache=${m.precacheOrder.length} cacheVersion=${m.cacheVersion}`);
    lines.push(`§MANIFEST_VERSIONS app=${app} versioned_modules=${m.modules.filter(x => x.sites.some(s => s.v != null)).length} one_version=${m.modules.filter(x => x.v != null).length} disagree=${dis.length} sites_below_max=${below}` + (dis.length ? ' files=' + dis.map(x => x.file).join(',') : ''));
    lines.push(`§MANIFEST_UNVERSIONED app=${app} tags_without_v=${a.notes.unversionedTags} external_url_sites=${a.notes.external}`);
    lines.push(`§MANIFEST_INLINE_SITES app=${app} inline_sites=${k.inline} (literals in inline page scripts: bump.js does not see these) partial_literals=${a.notes.partial} non_js_inline_blocks=${a.notes.nonJsInline}`);
    lines.push(`§MANIFEST_MISSING app=${app} targets_not_on_disk=${a.notes.missing.length}` + (a.notes.missing.length ? ' ' + a.notes.missing.join(' | ') : ''));
    lines.push(`§MANIFEST_LAZY_PRECACHE app=${app} lazy_precached=${lazy.filter(x => x.precache).length} lazy_not_precached=${lazy.filter(x => !x.precache).length} boot_not_precached=${boot.filter(x => !x.precache).length} precached_not_referenced=${preFiles.filter(f => !modFiles.has(f)).length} dup_entries=${dup}`);
    if (app === 'erp') lines.push(`§MANIFEST_PLUGINS app=erp precached_mjs=${mjs} on_disk=${mjsDisk} (counted, never read: decision B-4 is open)`);
    lines.push(`§MANIFEST_RESOLVE_DIFF app=${app} loader_literals_resolved_from_the_app_folder=${a.notes.resolveDiff.length}` + (a.notes.resolveDiff.length ? ' ' + a.notes.resolveDiff.join(' | ') : ''));
    a.notes.nonCanonical.forEach(x => lines.push('§MANIFEST_NONCANONICAL ' + x));
    const oc = checkOrder(m); a.order = oc;
    apps.push(a);
  }
  const sites = tot.tag + tot.asset + tot.inline + tot.lazy;
  const verdict = fails.length ? 'FAIL' : (apps.some(a => !a.manifest.modules.length) ? 'INCONCLUSIVE' : 'PASS');
  const deps = apps.reduce((n, a) => n + a.order.judged, 0);
  lines.push(`§MANIFEST_CHECK apps=${apps.length} files=${tot.files} identical=${tot.identical}/${tot.files} sites=${sites} tag=${tot.tag} asset=${tot.asset} inline=${tot.inline} lazy=${tot.lazy} precache=${tot.precache} order_check=${deps ? (apps.some(a => a.order.errors.length) ? 'FAIL' : 'PASS') : 'NOT-JUDGED'} deps_declared=${deps} written=0 verdict=${verdict}`);
  return { apps, lines, fails, verdict, tot };
}

module.exports = { APPS, SCHEMA, buildApp, regenerate, renderSite, frameText, checkOrder, check };

if (require.main === module) {
  const argv = process.argv.slice(2), ri = argv.indexOf('--root'), oi = argv.indexOf('--out');
  if (!argv.includes('--check')) { console.error('usage: node scripts/gen_manifest.js --check [--root DIR] [--out FILE]   (B0 is check mode only: it writes nothing in the tree)'); process.exit(1); }
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : path.join(__dirname, '..'));
  const r = check(root);
  r.fails.forEach(f => console.log('§MANIFEST_FAIL ' + f));
  r.lines.forEach(l => console.log(l));
  if (oi >= 0) {
    const out = path.resolve(argv[oi + 1]);
    if (!path.relative(root, out).startsWith('..')) { console.log('§MANIFEST_ERR --out must be outside the tree (B0 commits no manifest)'); process.exit(1); }
    fs.writeFileSync(out, JSON.stringify(r.apps.map(a => a.manifest), null, 1)); console.log('§MANIFEST_OUT file=' + out);
  }
  process.exit(r.verdict === 'PASS' ? 0 : 1);
}
