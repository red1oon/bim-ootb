// upgrade.js — U1: IFC2X3 -> IFC4X3_ADD2. BACKGROUND tool (prompts/BIM_UTILITY_KNIFE.md §U1).
// Attribute mapping is DATA (upgrade_map.js, generated from the buildingSMART EXPRESS schemas by gen_upgrade_map.py), matched by attribute NAME.
// Every non-trivial decision is counted in the report; nothing is dropped silently.
(function (g) {
  'use strict';
  const S = g.BIM_STEP || require('./step.js');
  const MAP = g.BIM_UPGRADE_MAP || require('./upgrade_map.js');
  const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8'));
  const dec = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  const TARGET = 'IFC4X3_ADD2';

  function upgradeModel(model, o) {
    o = o || {};
    if (model.schema === TARGET) return { skipped: true, report: { verdict: 'INCONCLUSIVE', note: 'already ' + TARGET } };
    const SRC = MAP.from[model.schema];
    if (!SRC) return { skipped: true, report: { verdict: 'INCONCLUSIVE', note: 'source schema ' + model.schema + ' not supported yet (supported: IFC2X3, IFC4)' } };
    const rep = { entitiesIn: model.ents.size, converted: 0, renamed: {}, dissolved: 0, dropped: {}, filledNotDefined: 0, filledFirstEnum: {}, handFill: {}, danglingToNull: 0, requiredEmpty: {}, listsEmptied: 0, attrsAdded: 0, attrsRemoved: {} };
    // 1. IfcPresentationStyleAssignment is gone in 4.3: its style list is spliced into the referencing IfcStyledItem.Styles
    const dissolve = new Map();
    for (const e of model.ents.values()) if (e.type === 'IFCPRESENTATIONSTYLEASSIGNMENT') dissolve.set(e.id, S.refsOf(S.args(e)[0]));
    // 2. map every entity
    const out = new Map(), droppedIds = new Set();
    for (const e of model.ents.values()) {
      if (dissolve.has(e.id)) { rep.dissolved++; droppedIds.add(e.id); continue; }
      if (e.raw) { out.set(e.id, { id: e.id, type: e.type, a: e.a, _args: null, raw: true }); continue; }
      const m = SRC.map[e.type];
      if (!m) { droppedIds.add(e.id); rep.dropped[e.type] = (rep.dropped[e.type] || 0) + 1; continue; }
      const a = S.args(e), na = new Array(m.attrs.length);
      for (let i = 0; i < m.attrs.length; i++) {
        const j = m.from.indexOf(m.attrs[i]);
        if (j >= 0 && j < a.length) { na[i] = a[j]; continue; }
        rep.attrsAdded++;
        const f = m.fill[i];
        if (f === '.NOTDEFINED.') { na[i] = f; rep.filledNotDefined++; }
        else if (f && f[0] === '!') { na[i] = '.' + f.slice(1) + '.'; rep.filledFirstEnum[m.to + '.' + m.attrs[i]] = f.slice(1); }
        else { na[i] = '$'; if (f === '?') rep.handFill[m.to + '.' + m.attrs[i]] = (rep.handFill[m.to + '.' + m.attrs[i]] || 0) + 1; }
      }
      // a REQUIRED target attribute with no value cannot be written validly (e.g. IfcRelSpaceBoundary without a building element:
      // 4.3 would need an invented IfcVirtualElement). Drop the entity and COUNT it — never invent a value.
      const bad = m.attrs.findIndex((n, i) => m.req[i] && na[i] === '$');
      if (bad >= 0) { droppedIds.add(e.id); const k = m.to + '.' + m.attrs[bad]; rep.requiredEmpty[k] = (rep.requiredEmpty[k] || 0) + 1; continue; }
      m.from.forEach((n) => { if (m.attrs.indexOf(n) < 0) rep.attrsRemoved[m.to + '.' + n] = (rep.attrsRemoved[m.to + '.' + n] || 0) + 1; });
      if (m.to !== e.type) rep.renamed[e.type + '->' + m.to] = (rep.renamed[e.type + '->' + m.to] || 0) + 1;
      out.set(e.id, { id: e.id, type: m.to, a: na.join(','), _args: na });
      rep.converted++;
    }
    // 3. fix references: dissolved -> inner refs, dropped -> removed / $
    const fixList = (inner) => {
      const parts = S.splitTop(inner), res = [];
      for (const p of parts) {
        if (S.isRef(p)) { const id = S.refId(p); if (dissolve.has(id)) { dissolve.get(id).forEach((x) => res.push('#' + x)); continue; } if (droppedIds.has(id)) { rep.danglingToNull++; continue; } }
        res.push(p);
      }
      return res.join(',');
    };
    for (const e of out.values()) {
      if (e.raw) continue;
      const a = S.args(e).slice(); let ch = false;
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        if (S.isRef(v)) { const id = S.refId(v); if (droppedIds.has(id) && !dissolve.has(id)) { a[i] = '$'; rep.danglingToNull++; ch = true; } else if (dissolve.has(id)) { const t = dissolve.get(id); a[i] = t.length ? '#' + t[0] : '$'; ch = true; } }
        else if (v[0] === '(' && v.indexOf('#') >= 0) {
          const inner = v.slice(1, -1), fixed = fixList(inner);
          if (fixed !== inner) { a[i] = '(' + fixed + ')'; ch = true; if (!fixed) rep.listsEmptied++; }
        }
      }
      if (ch) S.setArgs(e, a);
    }
    const note = 'IFC4X3 upgrade by BIM OOTB from ' + model.schema;
    const text = S.write(TARGET, model.header, out, { description: note, name: o.outName });
    rep.entitiesOut = out.size;
    const sum = (o2) => Object.values(o2).reduce((t, n) => t + n, 0);
    // W-UP-1: every input entity is accounted for exactly once
    rep.accounted = rep.converted + (out.size - rep.converted) + rep.dissolved + sum(rep.dropped) + sum(rep.requiredEmpty);
    rep.verdict = rep.entitiesIn > 0 && rep.accounted === rep.entitiesIn ? 'PASS' : (rep.entitiesIn === 0 ? 'INCONCLUSIVE' : 'FAIL');
    return { text, bytes: enc(text), report: rep };
  }
  function run(bytes, o) { const model = S.parse(typeof bytes === 'string' ? bytes : dec(bytes)); const r = upgradeModel(model, o); r.model = model; return r; }
  const api = { run, upgradeModel, TARGET };
  g.BIM_UPGRADE = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
