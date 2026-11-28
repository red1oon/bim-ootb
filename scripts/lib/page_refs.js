// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B0 BUILD SPEC" (bim-ootb #3195).
// The ONE set of readers for "which module does this file reference, and where exactly": page script tags, versioned
// assets, literals in inline page scripts, literals in .js loaders, and a service worker's PRECACHE_ASSETS / CACHE_VERSION.
// Every reader returns BYTE RANGES (start, end in the source string), so a generator can cut the sites out and write them back.
// JS is read with a parser (espree), never a regex: a comment or a string that only mentions a file is not a reference.
// HTML has no parser in node_modules, so readHtml is a small state machine; W-MANIFEST-ROUNDTRIP checks it against raw counts,
// against bump.js's own regex, and with planted fixtures (R4). Dev-side only: nothing here reaches the browser.
'use strict';
const path = require('path');
let espree;
try { espree = require(path.join(__dirname, '..', '..', 'node_modules', 'espree')); }
catch (e) { console.error('§NEED_DEPS espree is not installed: run  node scripts/setup.js'); process.exit(3); }   // §F.39: one line, not a stack trace

// B4-HASH (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B4-HASH BUILD SPEC"): the code after `?v=` is the first 8 hex of the file's SHA-256; a legacy counting number
//   (the pinned service-worker register lines keep theirs) is still read. `v` is a STRING everywhere (a number would lose the leading zeros of a hex code).
const WHOLE = /^([^\s?#'"`<>]+\.(?:js|css|json|wasm|mjs))\?v=(\d+|[0-9a-f]{8})$/;   // the whole value is file?v=<digits | 8 hex>
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const DESK_VAR = '_DESK', DESK_CALL = '_desk';   // WO-2: the page's phone-gate block (see readDeskCalls)

/**
 * Read one HTML source.
 * @param {string} src
 * @returns {{tags:object[], assets:object[], inline:object[], comments:number}}
 *   tags: `<script src>` elements, {start,end,as,v,onerror,canonical,raw}; canonical=false when the tag is not one of the two shapes
 *     the generator can write (`<script src="X"></script>` with an optional `onerror="…"`); a tag with OTHER attributes carries `keep` = [text before the src value's opening quote, text after its closing quote] and is canonical (B3-OUT-Q1).
 *   assets: any other attribute value that is a whole `file?v=N` (link href, img src …), {start,end,as,v} = the value's range.
 *   inline: `<script>` elements with a body, {start,end,type} = the body's range.
 */
function readHtml(src) {
  const out = { tags: [], assets: [], inline: [], comments: 0 }, n = src.length, low = src.toLowerCase();
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); out.comments++; i = e < 0 ? n : e + 3; continue; }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(lt, lt + 40));
    if (!m) { i = lt + 1; continue; }
    const name = m[1].toLowerCase(), attrs = [];
    let j = lt + m[0].length;
    for (;;) {                                            // attributes, up to the tag's own '>'
      while (j < n && /[\s/]/.test(src[j])) j++;
      if (j >= n || src[j] === '>') break;
      const a0 = j; while (j < n && !/[\s=>/]/.test(src[j])) j++;
      const an = src.slice(a0, j).toLowerCase(); let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] !== '=') { attrs.push({ name: an, value: null, q: '' }); continue; }
      k++; while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '"' || src[k] === "'") {
        const e = src.indexOf(src[k], k + 1), end = e < 0 ? n : e;
        attrs.push({ name: an, value: src.slice(k + 1, end), q: src[k], vs: k + 1, ve: end }); j = end + 1;
      } else { const v0 = k; while (k < n && !/[\s>]/.test(src[k])) k++; attrs.push({ name: an, value: src.slice(v0, k), q: '', vs: v0, ve: k }); j = k; }
    }
    const open = Math.min(j + 1, n);                      // just past '>'
    const get = a => attrs.find(x => x.name === a);
    if (name === 'script') {
      const c = low.indexOf('</script', open), bodyEnd = c < 0 ? n : c, gt = c < 0 ? n : src.indexOf('>', c) + 1, s = get('src');
      if (s) {
        const w = WHOLE.exec(s.value), oe = get('onerror');
        const as = w ? w[1] : s.value, v = w ? w[2] : null, onerror = oe ? oe.value : null;
        const raw = src.slice(lt, gt);
        // B3-OUT-Q1 (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md "B3-OUT ADDENDUM"): a tag with attributes other than src / onerror (data-*, async, line breaks)
        //   keeps them verbatim: `keep` = [the text from `<script` up to the opening quote of the src value, the text after its closing quote]; the generator owns only the value.
        const extra = attrs.some(x => x.name !== 'src' && x.name !== 'onerror') && s.q === '"', keep = extra ? [src.slice(lt + 7, s.vs - 1), src.slice(s.ve + 1, gt)] : null;
        out.tags.push({ start: lt, end: gt, as, v, onerror: keep ? null : onerror, keep, raw, canonical: raw === renderTag({ as, v, onerror: keep ? null : onerror, keep }) });
      } else if (bodyEnd > open) out.inline.push({ start: open, end: bodyEnd, type: (get('type') || {}).value || '' });
      i = gt; continue;
    }
    for (const a of attrs) { const w = a.q && a.value != null && WHOLE.exec(a.value); if (w) out.assets.push({ start: a.vs, end: a.ve, as: w[1], v: w[2] }); }
    if (RAW_TEXT.has(name)) { const c = low.indexOf('</' + name, open); i = c < 0 ? n : c; continue; }
    i = open;
  }
  return out;
}

/** The one spelling the generator writes for a script tag. */
function renderTag(t) {
  if (t.keep) return '<script' + t.keep[0] + '"' + t.as + (t.v == null ? '' : '?v=' + t.v) + '"' + t.keep[1];   // B3-OUT-Q1: the other attributes are the page's, kept verbatim
  return '<script src="' + t.as + (t.v == null ? '' : '?v=' + t.v) + '"' + (t.onerror == null ? '' : ' onerror="' + t.onerror + '"') + '></script>';
}

/** espree parse, script first then module; null when neither parses. */
function parseJs(src) {
  for (const sourceType of ['script', 'module']) {
    try { return espree.parse(src, { ecmaVersion: 'latest', sourceType, range: true }); } catch (e) { /* try the next */ }
  }
  return null;
}
function walk(n, fn) {
  if (!n || typeof n.type !== 'string') return;
  fn(n);
  for (const k in n) { if (k === 'range' || k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(c => walk(c, fn)); else if (v && typeof v === 'object') walk(v, fn); }
}

/**
 * Whole `file?v=N` string literals in a JS source (a loader, or an inline page script body).
 * @param {string} src
 * @param {number} [offset] - added to every range (the body's start inside its page)
 * @returns {{parsed:boolean, sites:object[], partial:number}} sites {start,end,as,v,q}; partial = other literals / template parts that mention `?v=`.
 */
function readJsSites(src, offset) {
  const off = offset || 0, body = src.startsWith('#!') ? '//' + src.slice(2) : src, ast = parseJs(body), out = { parsed: !!ast, sites: [], partial: 0 };
  if (!ast) return out;
  // WO-2 (bim-compiler prompts/MOBILE_PERF.md "WO-2"): a literal inside `_DESK = [[run 0 …], [run 1 …]]` is a `desk` site (a file the phone gate writes as a tag), not an `inline` one;
  //   `desk` = {run, idx}: which run, and its place in the run (the order the gate writes them in).
  const deskAt = new Map();
  walk(ast, n => {
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier' && n.id.name === DESK_VAR && n.init && n.init.type === 'ArrayExpression')
      n.init.elements.forEach((run, i) => { if (run && run.type === 'ArrayExpression') run.elements.forEach((lit, j) => { if (lit && lit.type === 'Literal') deskAt.set(lit.range[0], { run: i, idx: j }); }); });
  });
  walk(ast, n => {
    if (n.type === 'Literal' && typeof n.value === 'string') {
      const w = WHOLE.exec(n.value), raw = body.slice(n.range[0], n.range[1]);
      if (w && raw === raw[0] + n.value + raw[0]) { const site = { start: off + n.range[0], end: off + n.range[1], as: w[1], v: w[2], q: raw[0] }; if (deskAt.has(n.range[0])) site.desk = deskAt.get(n.range[0]); out.sites.push(site); }
      else if (n.value.indexOf('?v=') >= 0) out.partial++;
    } else if (n.type === 'TemplateElement' && n.value && String(n.value.raw).indexOf('?v=') >= 0) out.partial++;
  });
  out.sites.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * A service worker's hand-kept lists.
 * @param {string} src
 * @returns {{parsed:boolean, cacheVersion:object|null, cacheVersionCount:number, precache:object[]|null, nonLiteral:number}}
 *   cacheVersion {start,end,value}; precache [{start,end,as,q}] in file order; nonLiteral = PRECACHE_ASSETS elements that are not plain strings.
 */
function readSw(src) {
  const ast = parseJs(src), out = { parsed: !!ast, cacheVersion: null, cacheVersionCount: 0, precache: null, nonLiteral: 0 };
  if (!ast) return out;
  for (const st of ast.body) {
    if (st.type !== 'VariableDeclaration') continue;
    for (const d of st.declarations) {
      if (!d.id || d.id.type !== 'Identifier' || !d.init) continue;
      if (d.id.name === 'CACHE_VERSION') {
        out.cacheVersionCount++;
        if (d.init.type === 'Literal' && /^v\d+$/.test(d.init.value) && src.slice(d.init.range[0], d.init.range[1]) === "'" + d.init.value + "'")
          out.cacheVersion = { start: d.init.range[0], end: d.init.range[1], value: d.init.value };
      } else if (d.id.name === 'PRECACHE_ASSETS' && d.init.type === 'ArrayExpression') {
        out.precache = [];
        for (const el of d.init.elements) {
          const raw = el ? src.slice(el.range[0], el.range[1]) : '';
          if (el && el.type === 'Literal' && typeof el.value === 'string' && raw === raw[0] + el.value + raw[0]) out.precache.push({ start: el.range[0], end: el.range[1], as: el.value, q: raw[0] });
          else out.nonLiteral++;
        }
      }
    }
  }
  return out;
}

/**
 * WO-2: where each run of the page's phone gate is WRITTEN. A page that holds `var _DESK = [[…], […]]` writes run i's tags with a top-level `_desk(i)` call in an inline script;
 * that call's place in the page is the place its files load at (a `desk` site has no tag of its own).
 * @param {string} src - the page
 * @returns {Map<number, number>} run index -> byte offset of the `_desk(i)` statement in the page
 */
function readDeskCalls(src) {
  const calls = new Map();
  for (const b of readHtml(src).inline) {
    if (/module/i.test(b.type || '')) continue;
    const body = src.slice(b.start, b.end);
    if (body.indexOf(DESK_CALL + '(') < 0) continue;
    const ast = parseJs(body); if (!ast) continue;
    for (const st of ast.body) {
      const e = st.type === 'ExpressionStatement' ? st.expression : null;
      if (e && e.type === 'CallExpression' && e.callee.type === 'Identifier' && e.callee.name === DESK_CALL && e.arguments.length === 1 && e.arguments[0].type === 'Literal' && Number.isInteger(e.arguments[0].value))
        calls.set(e.arguments[0].value, b.start + st.range[0]);
    }
  }
  return calls;
}

module.exports = { readHtml, readJsSites, readSw, renderTag, parseJs, readDeskCalls, WHOLE };
