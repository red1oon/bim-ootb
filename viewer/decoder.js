// decoder.js — typed natural-language → SQL decoder for BIM elements_meta + qto_cache
// Pure JS, NO DOM / NO THREE / NO sql.js. NO LLM. Voice dropped (mis-hears IDs/numbers).
//
// ═══════════════════════════════════════════════════════════════════════════════
// HOW TO USE (in the viewer — see nlp.js wiring):
//   1. Load this file before nlp.js:  <script src="decoder.js?v=1"></script>
//   2. Decode user text → a query plan:
//        const d = BimDecoder.decode(userText, { storeys: distinctStoreyStrings });
//        // d.kind ∈ none|count|list|cost|qto|rank|group ; d.sql, d.params, d.desc
//   3. Run + format in one call (exec = (sql,params)=>db.exec(...) sql.js shape):
//        const f = BimDecoder.formatResult(d, exec, { cur:'RM', cur2:'USD', rate:3.91 });
//        // f.summary (string for the toast) , f.guids (array → highlight in 3D) , f.table
//
// WHAT IT UNDERSTANDS (plain typed English, tolerant of filler/order/case):
//   • count / show   "how many doors"  "show me all the doors"  "doors"
//   • cost           "total cost"  "how much do the doors cost"  "cost of structural"
//   • real dimension "total area of walls" (m²)  "pipe length" (m)   ← from qto_cache.qty
//   • compound       "doors and windows"
//   • storey scope   "doors on level 2"  "ground floor walls"  (resolved vs real storeys)
//   • negation       "doors not on level 1"
//   • range          "doors between level 2 and 4"
//   • superlative     "most common element"  "which floor has the most doors"
//   • breakdown      "what disciplines are there"  "how many storeys"
//   Pass ctx.storeys (the building's DISTINCT storey strings) so "level 3" resolves
//   exactly against ANY naming — English "Level 3", Malay "Aras 03", Swedish "VÅNING 3".
//
// To EXTEND: add element words to SYNONYMS/PLURALS, disciplines to DISC_MAP. Costs &
// dimensions come from qto_cache (extracted) — never a hardcoded rate. Proven 38/38 on
// Hospital + 92/92 across 7 buildings (sandbox_nlp/stress.js, cross.js).
// ═══════════════════════════════════════════════════════════════════════════════
//
// "Most at the cheapest" = deterministic RULES (free), not an LLM (expensive).
// Intent-extraction: scan cleaned text for verb (count|cost|qty|rank|show), element
// noun(s), storey (incl. negation + range), discipline — then BUILD the SQL.
//
// PRIME RULE: invents nothing. Counts from elements_meta; costs & real dimensions
// (area M2 / length M) from qto_cache (extracted). Never a hardcoded guess.
//
// v2 hardening (kills the silent-wrongs found in stress.js):
//   • compound nouns  "doors and windows"        → OR both
//   • negation        "doors not on level 1"     → storey NOT LIKE
//   • range           "doors between level 2 and 4" → storey IN {2,3,4}
//   • superlative      "which floor has most doors" / "most common element" → rank
//   • real QTO         "total area of walls"      → SUM(qty) WHERE uom='M2'  (not count)

(function (root) {
  'use strict';

  const SYNONYMS = {
    beam: ['beam', 'member'], column: ['column', 'pillar', 'post'],
    wall: ['wall', 'partition'], slab: ['slab', 'floor', 'deck'],
    door: ['door', 'doorway'], window: ['window'], roof: ['roof'],
    stair: ['stair', 'staircase', 'steps'], railing: ['railing', 'handrail', 'balustrade'],
    duct: ['duct', 'ductwork'], pipe: ['pipe', 'piping'], valve: ['valve'],
    light: ['light', 'lighting', 'luminaire', 'fixture'], outlet: ['outlet', 'socket'],
    pump: ['pump'], fan: ['fan'], panel: ['panel', 'switchboard'],
    conduit: ['conduit', 'cabletray'], furniture: ['furniture', 'furnishing'],
    equipment: ['equipment', 'device', 'unit'], plate: ['plate'],
    covering: ['covering', 'ceiling'], sprinkler: ['sprinkler', 'firesuppression'],
  };
  const PLURALS = {
    beams: 'beam', columns: 'column', walls: 'wall', slabs: 'slab', doors: 'door',
    windows: 'window', roofs: 'roof', stairs: 'stair', railings: 'railing',
    ducts: 'duct', pipes: 'pipe', valves: 'valve', lights: 'light', outlets: 'outlet',
    pumps: 'pump', fans: 'fan', panels: 'panel', conduits: 'conduit',
    fixtures: 'light', fittings: 'fitting', plates: 'plate', coverings: 'covering',
    ceilings: 'covering', sprinklers: 'sprinkler',
  };
  const DISC_MAP = {
    structure: 'STR', structural: 'STR', str: 'STR',
    architecture: 'ARC', architectural: 'ARC', arc: 'ARC',
    electrical: 'ELEC', electric: 'ELEC', elec: 'ELEC',
    plumbing: 'PLB', plumb: 'PLB', plb: 'PLB',
    fire: 'FP', 'fire protection': 'FP', fp: 'FP',
    mechanical: 'ACMV', acmv: 'ACMV', hvac: 'ACMV', mep: 'MEP',
    sanitary: 'SAN', san: 'SAN', heating: 'HEAT', heat: 'HEAT',
  };
  const FILLER = new Set(['me', 'all', 'the', 'a', 'an', 'of', 'are', 'is', 'there',
    'please', 'kindly', 'just', 'do', 'we', 'have', 'i', 'want', 'to', 'see', 'get',
    'give', 'tell', 'whats', 'what', 's', 'in', 'on', 'this', 'building', 'now',
    'with', 'for', 'my', 'our', 'any', 'some', 'every', 'each', 'that', 'has', 'which']);
  const UOM = { area: 'M2', length: 'M', volume: 'M3' };

  function singularize(w) {
    const l = w.toLowerCase();
    if (PLURALS[l]) return PLURALS[l];
    if (l.endsWith('s') && l.length > 3) return l.slice(0, -1);
    return l;
  }
  function ifcLike1(token) {
    const s = singularize(token);
    const syns = SYNONYMS[s] || [s];
    return { sql: '(' + syns.map(() => 'LOWER(ifc_class) LIKE ?').join(' OR ') + ')', params: syns.map(t => '%' + t + '%'), label: s };
  }
  function floorPattern(raw) {
    const n = String(raw).replace(/(\d+)(?:st|nd|rd|th)/i, '$1').toLowerCase();
    const W = { ground: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
      six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
      first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7' };
    if (n === 'roof') return '%roof%';
    if (n === 'basement') return '%basement%';
    return '% ' + (W[n] || n);
  }

  // ── multi-noun (compound) ──
  function extractNouns(tokens) {
    const hits = [], seen = new Set();
    for (const t of tokens) {
      const s = singularize(t);
      if ((SYNONYMS[s] || PLURALS[t]) && !seen.has(s)) { seen.add(s); hits.push(ifcLike1(t)); }
    }
    if (!hits.length) return null;
    return {
      sql: hits.length === 1 ? hits[0].sql : '(' + hits.map(h => h.sql).join(' OR ') + ')',
      params: hits.flatMap(h => h.params),
      label: hits.map(h => h.label).join(' + '), count: hits.length,
    };
  }
  function extractDiscipline(tokens) {
    for (const t of tokens) if (DISC_MAP[t]) return { code: DISC_MAP[t], word: t };
    return null;
  }
  // ── storey targets the user named: numbers (incl. range), ground, roof, basement ──
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  function storeyTargets(text) {
    const r = text.match(/between\s+(?:level|floor|storey|lvl)?\s*(\d+)\s+(?:and|to|[-–])\s+(?:level\s+)?(\d+)/i);
    if (r) { let lo = +r[1], hi = +r[2]; if (lo > hi) { const t = lo; lo = hi; hi = t; }
      const out = []; for (let i = lo; i <= hi; i++) out.push({ kind: 'num', n: i }); return { targets: out, label: `level ${lo}–${hi}` }; }
    if (/\bground(\s+floor)?\b|\bg\/?f\b/.test(text)) return { targets: [{ kind: 'ground' }], label: 'ground floor' };
    if (/\bbasement\b|\bcellar\b/.test(text)) return { targets: [{ kind: 'basement' }], label: 'basement' };
    let m = text.match(/(?:level|floor|storey|story|lvl|aras|våning|vaning|plan|etasje|etage)\s*([0-9]+)/i)
         || text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:floor|storey|level)\b/i);
    if (m) return { targets: [{ kind: 'num', n: WORDNUM[m[1].toLowerCase()] || +m[1] }], label: 'level ' + (WORDNUM[m[1].toLowerCase()] || +m[1]) };
    if (/\broof\b|\bbumbung\b|\battic\b/.test(text)) return { targets: [{ kind: 'roof' }], label: 'roof' };
    return null;
  }
  // resolve targets against the building's ACTUAL storey strings → exact, no overmatch, any language
  const ORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' };
  function matchStorey(name, t) {
    const digits = (name.match(/\d+/g) || []).map(d => parseInt(d, 10));
    if (t.kind === 'num') return digits.includes(t.n) || (ORD[t.n] && new RegExp('\\b' + ORD[t.n] + '\\b', 'i').test(name));
    if (t.kind === 'ground') return digits.includes(0) || /ground|tanah|jalan/i.test(name);
    if (t.kind === 'roof') return /roof|bumbung|attic/i.test(name);
    if (t.kind === 'basement') return /basement|cellar/i.test(name);
    return false;
  }
  // ── storey clause: adaptive when ctx.storeys given, else legacy LIKE fallback ──
  function extractStoreyClause(text, storeys) {
    const t = storeyTargets(text);
    if (!t) return null;
    const negate = /\b(not|except|excluding|other than|apart from|besides)\b/.test(text);
    if (storeys && storeys.length) {
      const matched = storeys.filter(s => s && t.targets.some(tg => matchStorey(s, tg)));
      const label = (negate ? 'not ' : '') + t.label;
      if (!matched.length) return { sql: negate ? '1=1' : '1=0', params: [], label: label + ' (no such storey)' };
      const ph = matched.map(() => '?').join(',');
      return { sql: `storey ${negate ? 'NOT IN' : 'IN'} (${ph})`, params: matched.slice(), label, negate, matched };
    }
    // legacy: no storey list → pattern guess (works for "Level N")
    const parts = t.targets.map(tg => tg.kind === 'num' ? floorPattern(tg.n) : floorPattern(tg.kind));
    const sql = '(' + parts.map(() => `LOWER(storey) ${negate ? 'NOT LIKE' : 'LIKE'} ?`).join(negate ? ' AND ' : ' OR ') + ')';
    return { sql, params: parts, label: (negate ? 'not ' : '') + t.label, negate };
  }

  // ── Main decode ──
  // ctx.storeys (optional) = the building's distinct storey strings, for exact, any-
  // language storey resolution. Omit it and storey scoping falls back to "Level N" guess.
  function decode(text, ctx) {
    ctx = ctx || {};
    const clean = String(text || '').toLowerCase().replace(/[?.!,;:'"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return { kind: 'none', desc: 'empty' };
    const rawTokens = clean.split(' ');
    const tokens = rawTokens.filter(w => !FILLER.has(w));

    const storey = extractStoreyClause(clean, ctx.storeys);
    const disc = extractDiscipline(rawTokens);
    const nouns = extractNouns(rawTokens);

    const isCost = /\b(cost|costs|how much|price|priced|value|worth|budget|expensive)\b/.test(clean);
    const isCount = /\b(how many|count|number of|tally|total number|quantity of|qty)\b/.test(clean);
    const isList = /\b(show|list|where|find|display|highlight|select|see|view)\b/.test(clean) || /\ball\b/.test(clean);
    const rankM = clean.match(/\b(most|least|fewest|highest|lowest|biggest|largest|smallest|top|commonest|common|predominant)\b/);
    const dimM = clean.match(/\b(area|length|volume)\b/);

    // meta breakdowns (no specific noun)
    if (!nouns && /\bdisciplines?\b/.test(clean)) {
      return { kind: 'group', desc: 'disciplines breakdown',
        sql: 'SELECT discipline, COUNT(*) AS count FROM elements_meta GROUP BY discipline ORDER BY count DESC', params: [] };
    }
    if (!nouns && !rankM && /\b(stor(e?ys?|ies)|floors?|levels?)\b/.test(clean) && !storey) {
      return { kind: 'group', desc: 'storeys breakdown',
        sql: 'SELECT storey, COUNT(*) AS count FROM elements_meta GROUP BY storey ORDER BY count DESC', params: [] };
    }

    const wantsFloorRank = /\b(floor|level|storey|story)\b/.test(clean);
    // ── RANK / superlative ──
    // valid when: ranks floors (needs a noun), OR ranks element types (element/type/common/most + no floor)
    if (rankM && (wantsFloorRank ? nouns : (nouns || /\b(element|type|common)\b/.test(clean)))) {
      const dir = /\b(least|fewest|lowest|smallest)\b/.test(clean) ? 'ASC' : 'DESC';
      const where = [], params = [];
      if (nouns) { where.push(nouns.sql); params.push(...nouns.params); }
      if (disc) { where.push('discipline = ?'); params.push(disc.code); }
      const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const dim = wantsFloorRank ? 'storey' : 'ifc_class';
      return { kind: 'rank', desc: `${dir === 'ASC' ? 'fewest' : 'most'} ${nouns ? nouns.label : 'elements'} by ${dim}`,
        sql: `SELECT ${dim} AS label, COUNT(*) AS count FROM elements_meta${w} GROUP BY ${dim} ORDER BY count ${dir} LIMIT 1`, params };
    }

    // ── COST (qto_cache: material+labour+equipment) ──
    if (isCost && !dimM) {
      const where = [], params = []; let scope = 'total building';
      if (nouns) { where.push(nouns.sql); params.push(...nouns.params); scope = nouns.label; }
      if (disc) { where.push('discipline = ?'); params.push(disc.code); scope = disc.word; }
      if (storey) { where.push(storey.sql); params.push(...storey.params); scope += ' ' + storey.label; }
      const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
      return { kind: 'cost', desc: 'cost of ' + scope,
        sql: 'SELECT ROUND(SUM(COALESCE(material_cost,0)+COALESCE(labour_cost,0)+COALESCE(equipment_cost,0))) AS cost, '
           + 'SUM(element_count) AS elems FROM qto_cache' + w, params };
    }

    // ── REAL QTO dimension (area M2 / length M / volume M3) from extracted qty ──
    if (dimM && !isCount) {
      const dim = dimM[1], uom = UOM[dim];
      const where = ['uom = ?'], params = [uom]; let scope = '';
      if (nouns) { where.push(nouns.sql); params.push(...nouns.params); scope = ' of ' + nouns.label; }
      if (disc) { where.push('discipline = ?'); params.push(disc.code); scope = ' of ' + disc.word; }
      if (storey) { where.push(storey.sql); params.push(...storey.params); scope += ' ' + storey.label; }
      return { kind: 'qto', uom, dim, desc: `total ${dim}${scope}`,
        sql: 'SELECT ROUND(SUM(qty)) AS qty, SUM(element_count) AS elems FROM qto_cache WHERE ' + where.join(' AND '), params };
    }

    // ── COUNT / SHOW / default ──
    if (nouns || storey || disc || isCount || isList) {
      const where = [], params = [], descBits = [];
      if (nouns) { where.push(nouns.sql); params.push(...nouns.params); descBits.push(nouns.label); }
      if (disc) { where.push('discipline = ?'); params.push(disc.code); descBits.push(disc.word); }
      if (storey) { where.push(storey.sql); params.push(...storey.params); descBits.push(storey.label); }
      if (!where.length) return { kind: 'none', desc: 'no element/scope recognised in "' + clean + '"' };
      const w = ' WHERE ' + where.join(' AND ');
      const label = descBits.join(' ');
      if (isCount && !isList) {
        return { kind: 'count', desc: 'count ' + label,
          sql: 'SELECT ifc_class, COUNT(*) AS count FROM elements_meta' + w + ' GROUP BY ifc_class ORDER BY count DESC', params };
      }
      return { kind: 'list', desc: 'show ' + label,
        sql: 'SELECT guid, ifc_class, element_name, storey FROM elements_meta' + w + ' ORDER BY ifc_class LIMIT 500', params,
        guidSql: 'SELECT guid FROM elements_meta' + w, guidParams: params.slice(),   // ALL matches → 3D highlight (table stays capped at 500)
        countSql: 'SELECT COUNT(*) AS n FROM elements_meta' + w, countParams: params.slice() };
    }

    return { kind: 'none', desc: 'no match for "' + clean + '"' };
  }

  // ── Run a decoded plan + format for the UI. Single source of truth (browser + tests).
  // exec(sql, params) must return sql.js shape: [{ columns:[...], values:[[...]] }] (or []).
  function formatResult(d, exec, opts) {
    opts = opts || {};
    const cur = opts.cur || 'RM', cur2 = opts.cur2 || 'USD', rate = opts.rate || 3.91;
    const fmt = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const run = (sql, p) => { const r = exec(sql, p || []); return (r && r[0]) ? r[0] : { columns: [], values: [] }; };
    if (!d || d.kind === 'none') return { kind: 'none', summary: '', guids: [], table: { cols: [], vals: [] } };

    if (d.kind === 'cost') {
      const v = (run(d.sql, d.params).values[0]) || [0, 0];
      const cost = v[0] || 0, elems = v[1] || 0;
      return { kind: 'cost', guids: [],
        summary: `${cur} ${fmt(cost)} (${cur2} ${fmt(cost / rate)}) — ${d.desc}`,
        table: { cols: ['metric', 'value'], vals: [['total', cur + ' ' + fmt(cost)], ['elements', fmt(elems)]] } };
    }
    if (d.kind === 'qto') {
      const v = (run(d.sql, d.params).values[0]) || [0, 0];
      const unit = { M2: 'm²', M: 'm', M3: 'm³' }[d.uom] || '';
      return { kind: 'qto', guids: [], summary: `${fmt(v[0])} ${unit} — ${d.desc}`,
        table: { cols: ['quantity', 'elements'], vals: [[fmt(v[0]) + ' ' + unit, fmt(v[1] || 0)]] } };
    }
    if (d.kind === 'rank') {
      const r = run(d.sql, d.params), v = r.values[0] || [null, 0];
      return { kind: 'rank', guids: [], summary: `${v[0] == null ? '—' : v[0]} — ${d.desc} (${fmt(v[1])})`,
        table: { cols: r.columns, vals: r.values } };
    }
    if (d.kind === 'list') {
      const n = ((run(d.countSql, d.countParams).values[0]) || [0])[0] || 0;
      const g = run(d.guidSql, d.guidParams);                 // ALL matching guids for highlight
      const guids = g.columns.length ? g.values.map(x => x[0]) : [];
      const r = run(d.sql, d.params);                          // first 500 for the table
      return { kind: 'list', guids,
        summary: n ? `${fmt(n)} — ${d.desc}` : `No results — ${d.desc}`, table: { cols: r.columns, vals: r.values } };
    }
    // count / group
    const r = run(d.sql, d.params), ci = r.columns.indexOf('count');
    const tot = ci >= 0 ? r.values.reduce((s, x) => s + (x[ci] || 0), 0) : r.values.length;
    return { kind: d.kind, guids: [], summary: tot ? `${fmt(tot)} — ${d.desc}` : `No results — ${d.desc}`,
      table: { cols: r.columns, vals: r.values } };
  }

  const api = { decode, formatResult, SYNONYMS, DISC_MAP, singularize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BimDecoder = api;
})(typeof window !== 'undefined' ? window : null);
