// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B1 BUILD SPEC" (bim-ootb #3244; owner B1-Q1 = A:
//   hand comments stay in the files, the generator rewrites only the sites around them; B1-Q2 = yes: ONE `v` per module, inline literals
//   included; B1-Q3 = the order edges a person confirmed are `deps`, call-time edges are `uses` on the tool's evidence alone).
// ISSUE: in an app with a committed `<app>/modules.json` the manifest is the SOURCE of its module lists: every script tag of its pages,
//   every 'file?v=N' literal in its loaders and inline page scripts, its sw.js PRECACHE_ASSETS and CACHE_VERSION are WRITTEN from it.
//   A hand edit to one of those sites is refused by --check (W-MANIFEST-ROUNDTRIP), with the file, the line and what to run.
// WHAT:  serialize (canonical, one record per line) · expand (B1 manifest -> the B0 shape, so B0's regenerate/checkOrder are reused) ·
//        write (manifest + the files' hand-kept text -> new file texts; a tag or precache entry added to / removed from the manifest is
//        inserted / removed on its own line) · check · init (one-time, from today's files) · the owner / witnesses extractors.
//        Dev-side only: no page, loader or sw.js names modules.json, and it is not precached (claim C12).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = path.posix;
const GM = () => require('../gen_manifest.js');   // lazy: gen_manifest requires this file too

const MOD_KEYS = ['v', 'load', 'lazyGroup', 'precache', 'deps', 'uses', 'notDeps', 'owner', 'witnesses'];
const SITE_KEYS = ['kind', 'as', 'onerror', 'q'];
const INLINE_KEYS = ['deps', 'uses', 'notDeps'];
const FORCING = new Set(['load', 'load-guarded', 'import']);
const BEGIN_TAGS = /<!-- §MANIFEST:BEGIN (\S+) tags\b[^\n]*-->/, END_TAGS = /<!-- §MANIFEST:END (\S+) tags -->/;
const BEGIN_PRE = /\/\/ §MANIFEST:BEGIN precache\b/, END_PRE = /\/\/ §MANIFEST:END precache\b/;
const SCHEMA = { type: 'object', additionalProperties: false,
  required: ['app', 'schema', 'sw', 'cacheVersion', 'depsDeclared', 'depsReview', 'modules', 'inline', 'order', 'precacheOrder'],
  properties: {
    app: { type: 'string' }, schema: { const: 1 }, sw: { type: 'string' }, cacheVersion: { type: 'string', pattern: '^v\\d+$' }, depsDeclared: { type: 'boolean' },
    depsReview: { type: 'object', additionalProperties: false, required: ['by', 'on', 'tool'], properties: { by: { type: 'string' }, on: { type: 'string' }, tool: { type: 'string' } } },
    modules: { type: 'object', minProperties: 1, additionalProperties: { type: 'object', additionalProperties: false, required: MOD_KEYS, properties: {
      v: { type: ['integer', 'null'], minimum: 0 }, load: { enum: ['boot', 'lazy'] }, lazyGroup: { type: ['string', 'null'] }, precache: { type: 'boolean' },
      deps: { type: 'array', items: { type: 'string' } }, uses: { type: 'array', items: { type: 'string' } }, notDeps: { type: 'array', items: { type: 'string' } },
      owner: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 2 }] }, witnesses: { type: 'array', items: { type: 'string' } } } } },
    inline: { type: 'object', additionalProperties: { type: 'object', additionalProperties: false, required: INLINE_KEYS, properties: {
      deps: { type: 'array', items: { type: 'string' } }, uses: { type: 'array', items: { type: 'string' } }, notDeps: { type: 'array', items: { type: 'string' } } } } },
    order: { type: 'object', additionalProperties: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'as'], properties: {   // no site-level v (B1)
      kind: { enum: ['tag', 'asset', 'inline', 'lazy'] }, as: { type: 'string', minLength: 1 }, onerror: { type: 'string' }, q: { enum: ['"', '`'] } } } } },
    precacheOrder: { type: 'array', minItems: 1, items: { type: 'string' } } } };

const sourceFile = app => app + '/modules.json';
const hasSource = (root, app) => fs.existsSync(path.join(root, sourceFile(app)));
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const sortKeys = o => Object.keys(o).sort();

/** The ONE spelling of a manifest: fixed key order, one record per line, so two sessions that add different modules merge cleanly. */
function serialize(m) {
  const L = [];
  L.push('{');
  L.push(` "app": ${JSON.stringify(m.app)}, "schema": ${JSON.stringify(m.schema)}, "sw": ${JSON.stringify(m.sw)}, "cacheVersion": ${JSON.stringify(m.cacheVersion)}, "depsDeclared": ${JSON.stringify(m.depsDeclared)},`);
  L.push(` "depsReview": ${JSON.stringify(pick(m.depsReview, ['by', 'on', 'tool']))},`);
  const block = (name, obj, keys, last) => {
    const ks = sortKeys(obj); L.push(` "${name}": {`);
    ks.forEach((k, i) => L.push(`  ${JSON.stringify(k)}: ${JSON.stringify(pick(obj[k], keys))}${i < ks.length - 1 ? ',' : ''}`));
    L.push(' }' + (last ? '' : ','));
  };
  block('modules', m.modules, MOD_KEYS);
  block('inline', m.inline, INLINE_KEYS);
  const fs_ = sortKeys(m.order); L.push(' "order": {');
  fs_.forEach((f, i) => { L.push(`  ${JSON.stringify(f)}: [`); m.order[f].forEach((s, j) => L.push(`   ${JSON.stringify(pick(s, SITE_KEYS))}${j < m.order[f].length - 1 ? ',' : ''}`)); L.push('  ]' + (i < fs_.length - 1 ? ',' : '')); });
  L.push(' },');
  L.push(' "precacheOrder": [');
  m.precacheOrder.forEach((e, i) => L.push(`  ${JSON.stringify(e)}${i < m.precacheOrder.length - 1 ? ',' : ''}`));
  L.push(' ]');
  L.push('}');
  return L.join('\n') + '\n';
}

/** Which module a site names: the file beside the referrer, else (a loader) the app folder — chosen by what the manifest lists, not by the disk. */
function targetOf(m, file, as) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(as)) return as;
  const a = P.normalize(P.join(P.dirname(file), as));
  if (m.modules[a] || file.endsWith('.html')) return a;
  const b = P.normalize(P.join(m.app, as));
  return m.modules[b] ? b : a;
}

/** B1 manifest -> B0 shape ({modules:[{file,deps,load,lazyGroup,precache,v,sites:[{in,at,kind,as,v,…}]}], pages, loaders, …}). */
function expand(m) {
  const mods = new Map(Object.keys(m.modules).map(f => [f, Object.assign({ file: f, sites: [] }, m.modules[f])])), fails = [];
  for (const f of sortKeys(m.order)) m.order[f].forEach((s, at) => {
    const t = targetOf(m, f, s.as), mod = mods.get(t);
    if (!mod) { fails.push(`${f}: site ${at} (${s.as}) names ${t}, which has no line in modules`); return; }
    mod.sites.push(Object.assign({ in: f, at, kind: s.kind, as: s.as, v: mod.v }, s.onerror != null ? { onerror: s.onerror } : {}, s.q ? { q: s.q } : {}));
  });
  for (const mod of mods.values()) if (!mod.sites.length) fails.push(`modules: ${mod.file} has no site in order`);
  const files = sortKeys(m.order);
  return { b0: { app: m.app, sw: m.sw, cacheVersion: m.cacheVersion, depsDeclared: m.depsDeclared, pages: files.filter(f => f.endsWith('.html')), loaders: files.filter(f => !f.endsWith('.html')),
    modules: [...mods.values()], precacheOrder: m.precacheOrder.slice() }, fails };
}

// ---- alignment: a tag / precache entry added to or removed from the manifest becomes a line added to / removed from the file
function lcs(a, b) {   // index pairs of the longest common subsequence of two key arrays
  const n = a.length, k = b.length, d = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < k) { if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
  return pairs;
}
const lineStart = (src, i) => src.lastIndexOf('\n', i - 1) + 1, lineEnd = (src, i) => { const e = src.indexOf('\n', i); return e < 0 ? src.length : e; };
const indentAt = (src, i) => /^[ \t]*/.exec(src.slice(lineStart(src, i)))[0];
/**
 * Make the file hold exactly the wanted sites (by kind|as), inserting/removing only `insertable` kinds; returns the new text or a reason.
 * @param {string} src @param {{start,end,key,kind}[]} have - the file's sites @param {{key,kind,text}[]} want
 */
function align(src, have, want, insertable, lines, file, entry) {
  const pairs = lcs(have.map(h => h.key), want.map(w => w.key)), keptH = new Set(pairs.map(p => p[0])), keptW = new Set(pairs.map(p => p[1]));
  const bad = have.filter((h, i) => !keptH.has(i) && !insertable.has(h.kind)).concat(want.filter((w, j) => !keptW.has(j) && !insertable.has(w.kind)));
  if (bad.length) return { why: `${file}: the ${bad[0].kind} site ${bad[0].key.split('|')[1]} is in ${keptH.size < have.length && have.includes(bad[0]) ? 'the file but not in' : 'modules.json but not in'} the other; a ${bad[0].kind} site is placed in the code by hand and listed in modules.json order` };
  const ops = [];   // {at, del, ins}
  have.forEach((h, i) => {
    if (keptH.has(i)) return;
    const ls = lineStart(src, h.start), le = lineEnd(src, h.end), rest = (src.slice(ls, h.start) + src.slice(h.end, le)).replace(entry ? /^[\s,]*|[\s,]*$/g : /^\s*|\s*$/g, '');
    if (!rest || (entry && /^\/\//.test(rest))) { if (rest) lines.push(`§MANIFEST_DROPPED_COMMENT file=${file} line=${src.slice(0, ls).split('\n').length} comment=${JSON.stringify(rest)}`); ops.push({ at: ls, del: le + 1 - ls, ins: '' }); }
    else { let e = h.end; if (entry) { const m = /^\s*,\s*/.exec(src.slice(e)); if (m) e += m[0].length; } ops.push({ at: h.start, del: e - h.start, ins: '' }); }
  });
  // a wanted site missing from the file goes on its own line after the nearest earlier kept site of an insertable kind (else before the
  // nearest later one); several new sites at one place are written in manifest order
  const mapW2H = new Map(pairs.map(p => [p[1], p[0]])), after = new Map(), before = new Map();
  for (let j = 0; j < want.length; j++) {
    if (mapW2H.has(j)) continue;
    const w = want[j], line = w.text + (entry ? ',' : '');
    let q = j - 1; while (q >= 0 && !(mapW2H.has(q) && insertable.has(have[mapW2H.get(q)].kind))) q--;
    if (q >= 0) { const h = have[mapW2H.get(q)]; if (!after.has(h)) after.set(h, []); after.get(h).push(line); continue; }
    q = j + 1; while (q < want.length && !(mapW2H.has(q) && insertable.has(have[mapW2H.get(q)].kind))) q++;
    if (q < want.length) { const h = have[mapW2H.get(q)]; if (!before.has(h)) before.set(h, []); before.get(h).push(line); continue; }
    ops.push({ why: `${file}: no ${[...insertable].join('/')} site to place ${w.key.split('|')[1]} next to` });
  }
  for (const [h, ls] of after) {
    const le = lineEnd(src, h.end), ind = indentAt(src, h.start);
    if (entry && !/^\s*,/.test(src.slice(h.end, le))) ops.push({ at: h.end, del: 0, ins: ',' });
    ops.push({ at: le, del: 0, ins: ls.map(l => '\n' + ind + l).join('') });
  }
  for (const [h, ls] of before) { const st = lineStart(src, h.start), ind = indentAt(src, h.start); ops.push({ at: st, del: 0, ins: ls.map(l => ind + l + '\n').join('') }); }
  const why = ops.find(o => o.why); if (why) return { why: why.why };
  ops.sort((a, b) => b.at - a.at || b.del - a.del);
  let out = src; for (const o of ops) out = out.slice(0, o.at) + o.ins + out.slice(o.at + o.del);
  return { text: out, changed: ops.length };
}

/**
 * Write one source app: the manifest + each owned file's hand-kept text -> the new texts (nothing is written to disk here).
 * @param {string} root @param {string} app
 * @param {{manifest?:object, texts?:Map<string,string>}} [o] - an in-memory manifest / file texts to use instead of the disk
 * @returns {{out:Map<string,string>, lines:string[], fails:string[]}}
 */
function write(root, app, o) {
  o = o || {};
  const m = o.manifest || JSON.parse(fs.readFileSync(path.join(root, sourceFile(app)), 'utf8'));
  const read = f => o.texts && o.texts.has(f) ? o.texts.get(f) : fs.readFileSync(path.join(root, f), 'utf8');
  const out = new Map(), lines = [], fails = [];
  const { b0, fails: ef } = expand(m); fails.push(...ef);
  if (fails.length) return { out, lines, fails };
  const G = GM(), R = require('./page_refs.js');
  for (const f of sortKeys(m.order)) {
    let src = read(f), sites = G.readSites(f, src);
    if (!sites) { fails.push('cannot parse ' + f); continue; }
    const want = m.order[f].map((s, at) => { const site = b0.modules.find(x => x.file === targetOf(m, f, s.as)).sites.find(z => z.in === f && z.at === at); return { key: s.kind + '|' + s.as, kind: s.kind, text: G.renderSite(site) }; });
    const keys = sites.map(s => s.kind + '|' + s.as);
    if (keys.join('\n') !== want.map(w => w.key).join('\n')) {
      const a = align(src, sites.map((s, i) => Object.assign({ key: keys[i] }, s)), want, new Set(f.endsWith('.html') ? ['tag'] : []), lines, f, false);
      if (a.why) { fails.push(a.why); continue; }
      src = a.text; sites = G.readSites(f, src);
      lines.push(`§MANIFEST_WRITE_PLACED file=${f} lines_changed=${a.changed}`);
    }
    let text = '', pos = 0; sites.forEach((s, i) => { text += src.slice(pos, s.start) + want[i].text; pos = s.end; });
    out.set(f, text + src.slice(pos));
  }
  // the service worker
  let src = read(m.sw), sf = G.swFrame(m.sw, src);
  if (!sf.sw.parsed || !sf.sw.cacheVersion) { fails.push(m.sw + ': cannot read PRECACHE_ASSETS / CACHE_VERSION'); return { out, lines, fails }; }
  if (sf.pre.map(e => e.as).join('\n') !== m.precacheOrder.join('\n')) {
    const a = align(src, sf.pre.map(e => ({ start: e.start, end: e.end, key: 'pre|' + e.as, kind: 'pre' })), m.precacheOrder.map(e => ({ key: 'pre|' + e, kind: 'pre', text: "'" + e + "'" })), new Set(['pre']), lines, m.sw, true);
    if (a.why) { fails.push(a.why); return { out, lines, fails }; }
    src = a.text; sf = G.swFrame(m.sw, src);
    lines.push(`§MANIFEST_WRITE_PLACED file=${m.sw} lines_changed=${a.changed}`);
  }
  let text = '', pos = 0;
  for (const sl of sf.slots) { text += src.slice(pos, sl.start) + (sl.sw === 'cv' ? "'" + m.cacheVersion + "'" : "'" + m.precacheOrder[sl.i] + "'"); pos = sl.end; }
  out.set(m.sw, text + src.slice(pos));
  out.set(sourceFile(app), serialize(m));
  void R;
  return { out, lines, fails };
}

// ---- extractors (C15): never written by guess
const OWNER_RE = /prompts\/[A-Za-z0-9_][A-Za-z0-9_.\/-]*?\.md/g;
/** The prompts/*.md files a module's own header comment names: one -> that file, 2+ -> the list, none -> "". */
function ownerOf(src) {
  let s = src.replace(/^#![^\n]*\n/, ''), head = '';
  for (;;) { const m = /^\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(s); if (!m) break; head += m[1] + '\n'; s = s.slice(m[0].length); }
  const names = [...new Set(head.match(OWNER_RE) || [])];
  return names.length === 0 ? '' : names.length === 1 ? names[0] : names;
}
/** Tracked test files whose text names a module's file inside a string literal, resolved from the test's folder, the repo root, or — only for a test
 *  inside the app's own folder or one that spells the app folder ('modeller', "modeller/…") — the app folder (a bare 'sw.js' in a devtools test is not the modeller's sw.js: measured, bim-ootb #3266 CI). */
function witnessesOf(root, app, files) {
  const set = new Set(files), out = new Map(files.map(f => [f, new Set()]));
  const ls = require('./tracked_files.js').trackedFiles(root).filter(f => /(^|\/)tests?\/.*\.(m?js|cjs|py|sh)$/.test(f));
  const STR = /(['"`])((?:(?!\1)[^\\\n]|\\.){1,300}?)\1/g;
  for (const t of ls) {
    let src; try { src = fs.readFileSync(path.join(root, t), 'utf8'); } catch (e) { continue; }
    const inApp = t.startsWith(app + '/') || new RegExp("['\"`]" + app + "(['\"`]|/)").test(src);   // the test lives in the app, or spells the app folder itself
    for (const mm of src.matchAll(STR)) {
      const v = mm[2].split('?')[0].replace(/^\.\//, '');
      if (!/\.(m?js|json|wasm|css|html)$/.test(v) || /\$\{/.test(v)) continue;
      for (const c of [P.normalize(P.join(P.dirname(t), v)), ...(inApp ? [P.normalize(P.join(app, v))] : []), P.normalize(v.replace(/^\//, ''))]) if (set.has(c)) out.get(c).add(t);
    }
  }
  return new Map([...out].map(([f, s]) => [f, [...s].sort()]));
}

/** The edges a person reviews (order-forcing) and their sha; call-time edges are recorded as `uses` on the tool's evidence alone (B1-Q3). */
function review(root, app, m) {
  const D = require('../gen_deps_candidates.js'), r = D.candidates(root, app, { manifest: m });
  const forcing = r.edges.filter(e => FORCING.has(e.cls));
  const sha = crypto.createHash('sha256').update(forcing.map(e => [e.from, e.to, e.cls, e.names.join(',')].join('|')).join('\n')).digest('hex');
  return { r, forcing, sha, unreviewed: forcing.filter(e => e.state === 'new'), unrecordedUses: r.edges.filter(e => !FORCING.has(e.cls) && e.state === 'new') };
}
const recOf = (m, from) => m.modules[from] || m.inline[from] || null;

/** --write's refresh of the extracted fields: owner, witnesses, and the call-time / import edges into `uses`. */
function refresh(root, app, m, lines) {
  const files = Object.keys(m.modules).filter(f => /\.m?js$/.test(f) && fs.existsSync(path.join(root, f)));
  for (const f of Object.keys(m.modules)) m.modules[f].owner = files.includes(f) ? ownerOf(fs.readFileSync(path.join(root, f), 'utf8')) : '';
  const w = witnessesOf(root, app, Object.keys(m.modules));
  for (const f of Object.keys(m.modules)) m.modules[f].witnesses = w.get(f) || [];
  const rv = review(root, app, m); let added = 0;
  for (const e of rv.unrecordedUses) { const rec = recOf(m, e.from) || (m.inline[e.from] = { deps: [], uses: [], notDeps: [] }); rec.uses = [...new Set([...rec.uses, e.to])].sort(); added++; }
  lines.push(`§MANIFEST_REFRESH app=${app} owner_gap=${Object.values(m.modules).filter(x => x.owner === '').length} uses_added=${added} unreviewed_forcing=${rv.unreviewed.length}`);
}

/**
 * The source checks of one app (W-MANIFEST-ROUNDTRIP C8, C11-part, C13, C14, C15 and the refusals R6-R12 exercise).
 * @param {{texts?:Map<string,string>, manifestText?:string, skipReview?:boolean}} [o]
 */
function check(root, app, o) {
  o = o || {};
  const G = GM(), R = require('./page_refs.js'), lines = [], fails = [], info = {};
  const raw = o.manifestText != null ? o.manifestText : fs.readFileSync(path.join(root, sourceFile(app)), 'utf8');
  let m; try { m = JSON.parse(raw); } catch (e) { fails.push(sourceFile(app) + ': not JSON (' + e.message + ')'); return { lines, fails, info }; }
  const Ajv = require(path.join(__dirname, '..', '..', 'node_modules', 'ajv')), v = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(SCHEMA);
  if (!v(m)) { fails.push(sourceFile(app) + ': schema: ' + new Ajv().errorsText(v.errors)); return { lines, fails, info }; }
  if (serialize(m) !== raw) { const a = serialize(m).split('\n'), b = raw.split('\n'), i = a.findIndex((x, k) => x !== b[k]); fails.push(`${sourceFile(app)}:${i + 1} is not canonical (keys in a fixed order, one record per line); run: node scripts/gen_manifest.js --write ${app}`); }
  const w = write(root, app, { manifest: JSON.parse(raw), texts: o.texts });
  fails.push(...w.fails);
  const read = f => o.texts && o.texts.has(f) ? o.texts.get(f) : fs.readFileSync(path.join(root, f), 'utf8');
  let identical = 0;
  for (const [f, t] of w.out) {
    const cur = f === sourceFile(app) ? raw : read(f);
    if (t === cur) { identical++; continue; }
    if (f === sourceFile(app)) continue;   // reported above as not canonical
    let i = 0; while (i < t.length && t[i] === cur[i]) i++;
    fails.push(`${f}:${cur.slice(0, i).split('\n').length} differs from what modules.json writes (a hand edit of a generated site?); edit ${sourceFile(app)}, then run: node scripts/gen_manifest.js --write ${app}`);
  }
  if (w.lines.some(l => l.startsWith('§MANIFEST_WRITE_PLACED'))) fails.push(`${app}: a site is in modules.json but not in the file (or the reverse); run: node scripts/gen_manifest.js --write ${app}`);
  info.files = w.out.size; info.identical = identical;
  // markers: every script tag of a page with a marker pair sits between them; every precache entry sits between the sw.js pair
  for (const f of sortKeys(m.order).filter(f => f.endsWith('.html'))) {
    const src = read(f), b = BEGIN_TAGS.exec(src), e = END_TAGS.exec(src), tags = R.readHtml(src).tags;
    if (!b && !e && tags.length <= 1) continue;
    if (!b || !e || e.index < b.index) { fails.push(`${f}: needs one <!-- §MANIFEST:BEGIN ${app} tags … --> … <!-- §MANIFEST:END ${app} tags --> pair`); continue; }
    const out = tags.filter(t => t.start < b.index || t.end > e.index);
    out.forEach(t => fails.push(`${f}:${src.slice(0, t.start).split('\n').length} a <script src> outside the §MANIFEST markers (${t.as}); script tags are written from ${sourceFile(app)}`));
  }
  { const src = read(m.sw), b = BEGIN_PRE.exec(src), e = END_PRE.exec(src), sf = G.swFrame(m.sw, src);
    if (!b || !e) fails.push(`${m.sw}: needs the // §MANIFEST:BEGIN precache … // §MANIFEST:END precache pair`);
    else sf.pre.filter(x => x.start < b.index || x.end > e.index).forEach(x => fails.push(`${m.sw}:${src.slice(0, x.start).split('\n').length} a precache entry outside the §MANIFEST markers (${x.as})`)); }
  // precache flags agree with precacheOrder
  const pre = new Set(m.precacheOrder.map(x => P.normalize(P.join(app, x.split('?')[0]))));
  for (const f of sortKeys(m.modules)) if (m.modules[f].precache !== pre.has(f)) fails.push(`${sourceFile(app)}: ${f} precache=${m.modules[f].precache} but PRECACHE_ASSETS ${pre.has(f) ? 'lists' : 'does not list'} it`);
  // order
  const oc = order(m, root, o.texts); info.order = oc; oc.errors.forEach(x => fails.push('order: ' + x));
  // review (C13) and the extracted fields (C15)
  if (!o.skipReview) {
    const rv = review(root, app, m); info.review = rv;
    rv.unreviewed.forEach(e => lines.push(`§DEPS_UNREVIEWED from=${e.from} to=${e.to} class=${e.cls} names=${e.names.join(',') || '-'} at=${e.at} (a person puts it in deps / uses / notDeps of ${e.from})`));
    info.shaOk = rv.sha === m.depsReview.tool;
    if (!rv.unreviewed.length && !info.shaOk) lines.push(`§DEPS_REVIEW_STALE tool_sha_now=${rv.sha} depsReview.tool=${m.depsReview.tool || '-'} (the order-forcing list changed since the review; re-read it, then set depsReview)`);
    const hand = []; for (const [from, rec] of Object.entries(m.modules).concat(Object.entries(m.inline))) for (const d of rec.deps) if (!rv.forcing.some(e => e.from === from && e.to === d)) hand.push(from + '->' + d);
    hand.forEach(x => lines.push('§DEPS_HAND ' + x)); info.hand = hand.length;
    const files = Object.keys(m.modules), wit = witnessesOf(root, app, files); let ownerBad = 0, witBad = 0;
    for (const f of files) {
      const want = /\.m?js$/.test(f) && fs.existsSync(path.join(root, f)) ? ownerOf(read(f)) : '';
      if (JSON.stringify(want) !== JSON.stringify(m.modules[f].owner)) { ownerBad++; lines.push(`§MANIFEST_C15_MISS module=${f} field=owner manifest=${JSON.stringify(m.modules[f].owner)} extractor=${JSON.stringify(want)}`); }
      if (JSON.stringify(wit.get(f)) !== JSON.stringify(m.modules[f].witnesses)) { witBad++; lines.push(`§MANIFEST_C15_MISS module=${f} field=witnesses manifest=${m.modules[f].witnesses.length} extractor=${wit.get(f).length} (run: node scripts/gen_manifest.js --write ${app})`); }
    }
    info.ownerBad = ownerBad; info.witBad = witBad;
    info.ownerGap = files.filter(f => m.modules[f].owner === '' && /\.m?js$/.test(f) && !/(^|\/)lib\//.test(f)); info.witGap = files.filter(f => !m.modules[f].witnesses.length && /\.m?js$/.test(f) && !/(^|\/)lib\//.test(f));
    lines.push(`§MANIFEST_OWNER_GAP app=${app} n=${info.ownerGap.length} modules=${info.ownerGap.join(',')}`);
    lines.push(`§MANIFEST_WITNESS_GAP app=${app} n=${info.witGap.length} modules=${info.witGap.join(',')}`);
  }
  info.manifest = m;
  return { lines, fails, info };
}

/** Declared-order refusals: unknown target, cycle, a deps target that loads after its reader on a page where both are tags (or after an
 *  inline reader's body), a boot module that depends on a lazy one. */
function order(m, root, texts) {
  const errors = []; let judged = 0;
  const { b0 } = expand(m), by = new Map(b0.modules.map(x => [x.file, x]));
  const G = GM(), R = require('./page_refs.js');
  const tagAt = (f, page) => { const x = by.get(f); const s = x && x.sites.find(z => z.kind === 'tag' && z.in === page); return s ? s.at : null; };
  for (const x of b0.modules) for (const d of x.deps) {
    judged++;
    const dm = by.get(d); if (!dm) { errors.push(x.file + ' depends on unknown ' + d); continue; }
    if (x.load === 'boot' && dm.load === 'lazy') errors.push(`${x.file} (boot) depends on ${d}, which is lazy`);
    for (const pg of b0.pages) { const a = tagAt(x.file, pg), b = tagAt(d, pg); if (a != null && b != null && b > a) errors.push(`${pg}: ${d} loads after ${x.file}, which depends on it`); }
  }
  // cycles over deps
  const state = new Map(), visit = (f, stack) => { if (state.get(f) === 2) return; if (state.get(f) === 1) { errors.push('cycle: ' + stack.concat(f).join(' -> ')); return; } state.set(f, 1); for (const d of (by.get(f) || { deps: [] }).deps) visit(d, stack.concat(f)); state.set(f, 2); };
  for (const f of by.keys()) visit(f, []);
  // inline readers: the body must come after the dep's tag on its page (a type=module body runs after every classic tag)
  const read = f => texts && texts.has(f) ? texts.get(f) : fs.readFileSync(path.join(root, f), 'utf8');
  for (const [id, rec] of Object.entries(m.inline)) {
    const [page, n] = id.split('#inline'), src = read(page), body = R.readHtml(src).inline[+n];
    for (const d of rec.deps) {
      judged++;
      const dm = by.get(d); if (!dm) { errors.push(id + ' depends on unknown ' + d); continue; }
      if (!body) { errors.push(id + ': the page has no inline script #' + n); continue; }
      if (dm.load === 'lazy') { errors.push(`${id} (the page) depends on ${d}, which is lazy`); continue; }
      const at = tagAt(d, page); if (at == null) continue;
      const tg = (G.readSites(page, src) || [])[at];
      if (!/module/i.test(body.type || '') && tg && tg.start > body.start) errors.push(`${page}: ${d} loads after inline script #${n} (line ${src.slice(0, body.start).split('\n').length}), which depends on it`);
    }
  }
  return { judged, errors };
}

/**
 * One-time: today's files -> a B1 manifest (B0's reader), deps from the reviewed candidate list.
 * @param {{notDeps?:string[], asUses?:string[], by?:string, on?:string}} o - "from>to" pairs a person moved out of deps
 */
function init(root, app, o) {
  o = o || {};
  const G = GM(), { manifest: b0, frames } = G.buildApp(root, app), fails = [];
  const m = { app, schema: 1, sw: b0.sw, cacheVersion: b0.cacheVersion, depsDeclared: true, depsReview: { by: o.by || '', on: o.on || '', tool: '' }, modules: {}, inline: {}, order: {}, precacheOrder: b0.precacheOrder.slice() };
  for (const x of b0.modules) {
    const vs = new Set(x.sites.map(s => s.v)); if (vs.size > 1) fails.push(`${x.file}: its sites carry different numbers (${[...vs].join(',')}); one v per module needs them equal first`);
    m.modules[x.file] = { v: x.v, load: x.load, lazyGroup: x.lazyGroup, precache: x.precache, deps: [], uses: [], notDeps: [], owner: '', witnesses: [] };
  }
  for (const f of frames.keys()) if (f !== b0.sw) m.order[f] = [];
  for (const x of b0.modules) for (const s of x.sites) m.order[s.in][s.at] = Object.assign({ kind: s.kind, as: s.as }, s.onerror != null ? { onerror: s.onerror } : {}, s.q ? { q: s.q } : {});
  const not = new Set(o.notDeps || []), uses = new Set(o.asUses || []);
  const rv = review(root, app, m);
  for (const e of rv.r.edges) {
    const rec = recOf(m, e.from) || (m.inline[e.from] = { deps: [], uses: [], notDeps: [] }), k = e.from + '>' + e.to;
    const list = not.has(k) ? 'notDeps' : (uses.has(k) || !(e.cls === 'load' || e.cls === 'load-guarded')) ? 'uses' : 'deps';
    rec[list] = [...new Set([...rec[list], e.to])].sort();
  }
  [...not, ...uses].filter(k => !rv.r.edges.some(e => e.from + '>' + e.to === k)).forEach(k => fails.push('--not-deps / --as-uses names no candidate edge: ' + k));
  m.depsReview.tool = rv.sha;
  const lines = []; refresh(root, app, m, lines);
  return { m, fails, lines, counts: { deps: Object.values(m.modules).concat(Object.values(m.inline)).reduce((n, r) => n + r.deps.length, 0), notDeps: Object.values(m.modules).concat(Object.values(m.inline)).reduce((n, r) => n + r.notDeps.length, 0), uses: Object.values(m.modules).concat(Object.values(m.inline)).reduce((n, r) => n + r.uses.length, 0) } };
}

module.exports = { SCHEMA, sourceFile, hasSource, serialize, expand, targetOf, align, write, check, order, init, refresh, review, ownerOf, witnessesOf, FORCING, BEGIN_TAGS, END_TAGS, BEGIN_PRE, END_PRE };
