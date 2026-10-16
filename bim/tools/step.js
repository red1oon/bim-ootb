// step.js — pure-JS ISO-10303-21 (STEP/IFC) text engine. No DOM, no wasm, no deps: runs in Node and in a classic <script> (file:// safe).
// Implementing prompts/BIM_UTILITY_KNIFE.md §4 (one shared engine) — Witness: W-EX-*, W-UP-*, W-CLI-*.
(function (g) {
  'use strict';
  // The reader is a generator so it can be sliced: parse() drains it at full speed (Node/CLI); parseAsync() hands the thread back to the browser
  // between slices so a page can paint a progress bar while a 200 MB file is read. Same loop, same result.
  function* parseGen(text) {
    const di = text.search(/\bDATA\s*;/);
    if (di < 0) throw new Error('not a STEP file: no DATA section');
    const header = text.slice(0, di);
    const bodyStart = text.indexOf(';', di) + 1;
    const ents = new Map();
    let i = bodyStart, n = text.length, start = i, inStr = false, depthCom = false, bad = 0;
    let nextTick = i + 262144;
    while (i < n) {
      if (i >= nextTick) { nextTick = i + 262144; yield i / n; }
      const c = text.charCodeAt(i);
      if (inStr) { if (c === 39) { if (text.charCodeAt(i + 1) === 39) i++; else inStr = false; } }
      else if (depthCom) { if (c === 42 && text.charCodeAt(i + 1) === 47) { depthCom = false; i++; } }
      else if (c === 39) inStr = true;
      else if (c === 47 && text.charCodeAt(i + 1) === 42) { depthCom = true; i++; }
      else if (c === 59) {                                   // ';' ends a statement
        const st = text.slice(start, i).trim();
        start = i + 1;
        if (st.startsWith('ENDSEC')) break;
        if (st) {
          const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(st);
          if (m) ents.set(+m[1], { id: +m[1], type: m[2].toUpperCase(), a: m[3], _args: null });
          else if (/^#\d+\s*=\s*\(/.test(st)) { const id = +/^#(\d+)/.exec(st)[1]; ents.set(id, { id, type: '(COMPLEX)', a: st.replace(/^#\d+\s*=\s*/, ''), _args: null, raw: true }); }
          else bad++;
        }
      }
      i++;
    }
    const sm = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/.exec(header);
    return { header, schema: sm ? sm[1].toUpperCase() : '', ents, bad };
  }
  function parse(text) { const g = parseGen(text); for (;;) { const r = g.next(); if (r.done) return r.value; } }
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  async function parseAsync(text, onProgress) {
    const g = parseGen(text); let t0 = nowMs();
    for (;;) {
      const r = g.next(); if (r.done) { if (onProgress) onProgress(1); return r.value; }
      if (nowMs() - t0 > api.PARSE_SLICE_MS) { if (onProgress) onProgress(r.value); await new Promise((res) => setTimeout(res, 0)); t0 = nowMs(); }
    }
  }
  // split "a,(b,c),'x,y',#3" at depth 0 outside strings
  function splitTop(s) {
    const out = []; let d = 0, st = false, from = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (st) { if (c === 39) { if (s.charCodeAt(i + 1) === 39) i++; else st = false; } continue; }
      if (c === 39) st = true;
      else if (c === 40) d++;
      else if (c === 41) d--;
      else if (c === 44 && d === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
    }
    out.push(s.slice(from).trim());
    return out;
  }
  function args(e) { return e._args || (e._args = e.raw ? [] : splitTop(e.a)); }
  function setArgs(e, arr) { e._args = arr; e.a = arr.join(','); }
  function refsOf(s) {                                       // all #ids outside strings
    const r = []; let st = false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (st) { if (c === 39) { if (s.charCodeAt(i + 1) === 39) i++; else st = false; } continue; }
      if (c === 39) st = true;
      else if (c === 35) { let j = i + 1, v = 0; while (j < s.length) { const d = s.charCodeAt(j) - 48; if (d < 0 || d > 9) break; v = v * 10 + d; j++; } if (j > i + 1) r.push(v); i = j - 1; }
    }
    return r;
  }
  const unq = (s) => (s && s[0] === "'") ? s.slice(1, -1).replace(/''/g, "'") : (s === '$' ? '' : s);
  const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const isRef = (s) => /^#\d+$/.test(s);
  const refId = (s) => +s.slice(1);

  function write(schemaId, headerText, ents, opts) {
    opts = opts || {};
    let h = headerText;
    h = h.replace(/FILE_SCHEMA\s*\(\s*\([^)]*\)\s*\)/, "FILE_SCHEMA(('" + schemaId + "'))");
    if (opts.description) h = h.replace(/FILE_DESCRIPTION\s*\(\s*\([^)]*\)\s*,\s*'[^']*'\s*\)/, "FILE_DESCRIPTION((" + quote(opts.description) + "),'2;1')");
    if (opts.name) h = h.replace(/(FILE_NAME\s*\(\s*)'[^']*'/, "$1" + quote(opts.name));
    if (!/ENDSEC;\s*$/.test(h.trimEnd()) && !/ENDSEC/.test(h)) h += 'ENDSEC;\n';
    const ids = Array.from(ents.keys()).sort((a, b) => a - b);
    const lines = new Array(ids.length);
    for (let k = 0; k < ids.length; k++) { const e = ents.get(ids[k]); lines[k] = e.raw ? '#' + e.id + '=' + e.a + ';' : '#' + e.id + '=' + e.type + '(' + e.a + ');'; }
    return h.replace(/\s*$/, '\n') + 'DATA;\n' + lines.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
  }

  // rooted product listing (IfcProduct-like): GlobalId(22) + >=7 attrs, not a rel/type/project
  const NOT_PRODUCT = /^IFC(REL|PROJECT$|.*TYPE$|.*STYLE$|PROPERTY|ELEMENTQUANTITY|OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION|CLASSIFICATION|MATERIAL|GROUP|ZONE|SYSTEM|PERMIT|ACTOR|TASK|PROCESS|PROCEDURE|WORK|COST|CONSTRAINT|ACTIONREQUEST|CONTROL|RESOURCE|CREWRESOURCE|LABOURRESOURCE)/;
  function isProduct(e) {
    if (e.raw || NOT_PRODUCT.test(e.type)) return false;
    const a = args(e);
    return a.length >= 7 && /^'[0-9A-Za-z_$]{22}'$/.test(a[0]);
  }
  function listProducts(model) {
    const out = [];
    for (const e of model.ents.values()) if (isProduct(e)) { const a = args(e); out.push({ id: e.id, type: e.type, guid: unq(a[0]), name: unq(a[2]) }); }
    return out;
  }
  function closure(model, rootIds, override) {
    const seen = new Set(), stack = rootIds.slice();
    while (stack.length) {
      const id = stack.pop(); if (seen.has(id)) continue;
      const e = model.ents.get(id); if (!e) continue;
      seen.add(id);
      const src = override && override.has(id) ? override.get(id).join(',') : e.a;
      for (const r of refsOf(src)) if (!seen.has(r)) stack.push(r);
    }
    return seen;
  }
  const api = { PARSE_SLICE_MS: 30, parse, parseAsync, splitTop, args, setArgs, refsOf, unq, quote, isRef, refId, write, isProduct, listProducts, closure };
  g.BIM_STEP = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
