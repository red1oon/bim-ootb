/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// nlp.js — Voice command + NLP query DSL (S211)
// Standalone module. No dependencies on walk.js, sitecam.js, or any other module.
// Uses Web Speech API (browser-native, no server, no cost) + keyword intent matching.
function setupNlp(A) {

  // ── Feature detection ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const HAS_VOICE = !!SR;
  console.log('[S211] §NLP_INIT voice=' + HAS_VOICE);

  // ── IFC class synonyms (from federation/nlp/intent_classifier.py) ──
  const SYNONYMS = {
    beam:     ['beam','member'],
    column:   ['column','pillar','post'],
    wall:     ['wall','partition'],
    slab:     ['slab','floor','deck'],
    door:     ['door','doorway'],
    window:   ['window'],
    roof:     ['roof'],
    stair:    ['stair','staircase','steps'],
    railing:  ['railing','handrail','balustrade'],
    duct:     ['duct','ductwork'],
    pipe:     ['pipe','piping'],
    valve:    ['valve'],
    light:    ['light','lighting','luminaire','fixture'],
    outlet:   ['outlet','socket'],
    pump:     ['pump'],
    fan:      ['fan'],
    panel:    ['panel','switchboard'],
    conduit:  ['conduit','cabletray'],
    furniture:['furniture','furnishing'],
    equipment:['equipment','device','unit'],
  };

  // ── Plurals → singular ──
  const PLURALS = {
    beams:'beam', columns:'column', walls:'wall', slabs:'slab', doors:'door',
    windows:'window', roofs:'roof', stairs:'stair', railings:'railing',
    ducts:'duct', pipes:'pipe', valves:'valve', lights:'light', outlets:'outlet',
    pumps:'pump', fans:'fan', panels:'panel', conduits:'conduit',
    fixtures:'light', fittings:'fitting',
  };

  function singularize(w) {
    const l = w.toLowerCase();
    if (PLURALS[l]) return PLURALS[l];
    if (l.endsWith('s') && l.length > 3) return l.slice(0, -1);
    return l;
  }

  function ifcLike(elementType) {
    const s = singularize(elementType);
    const syns = SYNONYMS[s];
    if (syns) return { sql: syns.map(() => `LOWER(ifc_class) LIKE LOWER(?)`).join(' OR '), params: syns.map(t => `%${t}%`) };
    return { sql: `LOWER(ifc_class) LIKE LOWER(?)`, params: [`%${s}%`] };
  }

  // ── Discipline synonyms ──
  const DISC_MAP = {
    structure:'STR', structural:'STR', str:'STR',
    architecture:'ARC', architectural:'ARC', arc:'ARC',
    electrical:'ELEC', electric:'ELEC', elec:'ELEC',
    plumbing:'PLB', plb:'PLB',
    fire:'FP', 'fire protection':'FP', fp:'FP',
    mechanical:'ACMV', acmv:'ACMV', hvac:'ACMV', 'air con':'ACMV',
    sanitary:'SAN', san:'SAN',
    heating:'HEAT', heat:'HEAT',
  };

  // CIDB 2024 Material Rates — from rates.js (shared RATES object)
  function calcCost(ifc_class, qty) { return getRate(ifc_class) * qty; }

  function discCode(word) {
    return DISC_MAP[word.toLowerCase()] || word.toUpperCase();
  }

  // ── Floor normalization ──
  // Must avoid "1" matching "10","11","1 Ceiling" etc.
  // Strategy: "Level 1" ends with space+digit or is exact — use trailing boundary
  function floorPattern(raw) {
    const n = raw.replace(/(\d+)(?:st|nd|rd|th)/i, '$1').toLowerCase();
    // Word numbers → digit, with exact end match (no trailing digits)
    const WORD_TO_NUM = {
      'ground':'0', 'one':'1', 'two':'2', 'three':'3', 'four':'4',
      'five':'5', 'six':'6', 'seven':'7', 'eight':'8', 'nine':'9', 'ten':'10',
      'first':'1', 'second':'2', 'third':'3', 'fourth':'4', 'fifth':'5',
    };
    if (n === 'roof') return '%roof%';
    if (n === 'basement') return '%basement%';
    const num = WORD_TO_NUM[n] || n;
    // "Level 1" but not "Level 10" — match digit at end of string or before space
    // SQLite LIKE doesn't have word boundaries, so use exact pattern:
    // "% N" matches "Level N" at end of storey name
    return `% ${num}`;
  }

  // ── Pattern matchers (from query_patterns.py, ported to JS) ──
  // Each returns { sql, desc } or null
  const PATTERNS = [
    // Floor-scoped count: "floor one doors", "floor 2 beams", "ground floor walls"
    { re: /^(?:floor|level)\s+(\S+)\s+(\w+)$/i,
      fn: m => {
        const ifc = ifcLike(m[2]); const bld = bldFilter();
        return {
          sql: `SELECT ifc_class, COUNT(*) as count, storey FROM elements_meta
                WHERE (${ifc.sql}) AND LOWER(storey) LIKE LOWER(?)
                ${bld.sql} GROUP BY ifc_class, storey`,
          params: [...ifc.params, floorPattern(m[1]), ...bld.params],
          desc: `${singularize(m[2])} on floor ${m[1]}`
        };
      }},
    { re: /^ground\s+floor\s+(\w+)$/i,
      fn: m => {
        const ifc = ifcLike(m[1]); const bld = bldFilter();
        return {
          sql: `SELECT ifc_class, COUNT(*) as count, storey FROM elements_meta
                WHERE (${ifc.sql}) AND LOWER(storey) LIKE LOWER(?)
                ${bld.sql} GROUP BY ifc_class, storey`,
          params: [...ifc.params, '%0%', ...bld.params],
          desc: `${singularize(m[1])} on ground floor`
        };
      }},
    // Count: "count doors", "how many beams"
    { re: /^(?:count|how many|number of)\s+(\w+)$/i,
      fn: m => {
        const ifc = ifcLike(m[1]); const bld = bldFilter();
        return {
          sql: `SELECT ifc_class, COUNT(*) as count FROM elements_meta
                WHERE (${ifc.sql}) ${bld.sql} GROUP BY ifc_class`,
          params: [...ifc.params, ...bld.params],
          desc: `count ${singularize(m[1])}`
        };
      }},
    // Cost: "total cost", "cost of beams" — computed from RATES × element count (same as 4D/5D)
    { re: /^total\s+cost$/i,
      fn: () => {
        const bld = bldFilter('WHERE');
        return {
          sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta ${bld.sql} GROUP BY ifc_class ORDER BY qty DESC`,
          params: [...bld.params],
          desc: 'total building cost',
          costMode: 'total'
        };
      }},
    { re: /^cost\s+(?:of\s+)?(\w+)$/i,
      fn: m => {
        const d = DISC_MAP[m[1].toLowerCase()];
        if (d) {
          const bld = bldFilter(true);
          return {
            sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta
                  WHERE discipline = ? ${bld.sql} GROUP BY ifc_class ORDER BY qty DESC`,
            params: [d, ...bld.params],
            desc: `cost of ${m[1]}`,
            costMode: 'disc'
          };
        }
        const ifc = ifcLike(m[1]); const bld = bldFilter();
        return {
          sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta
                WHERE (${ifc.sql}) ${bld.sql} GROUP BY ifc_class ORDER BY qty DESC`,
          params: [...ifc.params, ...bld.params],
          desc: `cost of ${singularize(m[1])}`,
          costMode: 'element'
        };
      }},
    // Quantity: "total area", "total length pipes" — element count (no QTO table needed)
    { re: /^total\s+(area|length|volume)(?:\s+(?:of\s+)?(\w+))?$/i,
      fn: m => {
        if (m[2]) {
          const ifc = ifcLike(m[2]); const bld = bldFilter();
          return {
            sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta WHERE (${ifc.sql}) ${bld.sql} GROUP BY ifc_class ORDER BY qty DESC`,
            params: [...ifc.params, ...bld.params],
            desc: `total ${m[1]} of ${singularize(m[2])} (element count — no QTO dimensions in DB)`
          };
        }
        const bld = bldFilter('WHERE');
        return {
          sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta ${bld.sql} GROUP BY ifc_class ORDER BY qty DESC`,
          params: [...bld.params],
          desc: `total ${m[1]} (element count — no QTO dimensions in DB)`
        };
      }},
    { re: /^floor\s+area$/i,
      fn: () => {
        const bld = bldFilter();
        return {
          sql: `SELECT ifc_class, COUNT(*) as qty FROM elements_meta
                WHERE LOWER(ifc_class) LIKE '%slab%' ${bld.sql} GROUP BY ifc_class`,
          params: [...bld.params],
          desc: 'slab count (floor area dimensions not in DB)'
        };
      }},
    // Discipline: "show structure", "show electrical", "what disciplines"
    { re: /^(?:show|list)\s+(\w+)(?:\s+elements)?$/i,
      fn: m => {
        const d = DISC_MAP[m[1].toLowerCase()];
        if (d) {
          const bld = bldFilter();
          return {
            sql: `SELECT ifc_class, COUNT(*) as count FROM elements_meta
                  WHERE discipline = ? ${bld.sql} GROUP BY ifc_class ORDER BY count DESC`,
            params: [d, ...bld.params],
            desc: `${m[1]} elements`
          };
        }
        // Fall through to search
        return null;
      }},
    { re: /^what\s+disciplines/i,
      fn: () => {
        const bld = bldFilter('WHERE');
        return {
          sql: `SELECT discipline, COUNT(*) as count FROM elements_meta
                ${bld.sql} GROUP BY discipline ORDER BY discipline`,
          params: [...bld.params],
          desc: 'all disciplines'
        };
      }},
    // Search: "find fire doors", "search concrete" → S233 navigate panel
    { re: /^(?:find|search|search for)\s+(.+)$/i,
      fn: m => {
        const term = m[1].replace(/[^\w\s]/g, '').trim();
        // S233: delegate to navigate.js find panel instead of NLP toast
        if (typeof A.openFindPanel === 'function') {
          A.openFindPanel(term);
          return { handled: true }; // S233: find panel handles display
        }
        // Fallback if navigate.js not loaded
        const bld = bldFilter(true);
        return {
          sql: `SELECT guid, ifc_class, element_name, storey FROM elements_meta
                WHERE (LOWER(element_name) LIKE LOWER(?)
                   OR LOWER(ifc_class) LIKE LOWER(?))
                ${bld.sql} LIMIT 50`,
          params: [`%${term}%`, `%${term}%`, ...bld.params],
          desc: `search "${term}"`
        };
      }},
  ];

  // ── Building filter helpers (parameterized) ──
  function bldFilter(mode) {
    if (!A.activeBuilding) return { sql: '', params: [] };
    if (mode === 'WHERE') return { sql: `WHERE building = ?`, params: [A.activeBuilding] };
    if (mode === true) return { sql: `AND building = ?`, params: [A.activeBuilding] };
    return { sql: `AND building = ?`, params: [A.activeBuilding] };
  }
  function bldFilterQto(hasWhere) {
    if (!A.activeBuilding) return { sql: '', params: [] };
    return { sql: (hasWhere ? 'AND' : 'WHERE') + ` building = ?`, params: [A.activeBuilding] };
  }

  // ── Parse + execute ──
  function parseQuery(text) {
    const clean = text.replace(/[?.!,;]/g, '').trim();
    for (const p of PATTERNS) {
      const m = clean.match(p.re);
      if (m) {
        const result = p.fn(m);
        if (result) return result;
      }
    }
    return null;
  }

  function executeQuery(text) {
    if (!A.db) { showToast('No building loaded', null, 'warn'); return; }
    const parsed = parseQuery(text);
    if (!parsed) {
      // Unknown query — suggest closest
      showToast(typeof _TRL!=='undefined'&&_TRL.ui_no_match||'No match. Try: "count doors" or "floor 1 walls"', null, 'warn');
      console.log('[S211] §NLP_NO_MATCH input="' + text + '"');
      return;
    }
    if (parsed.handled) return; // S233: find panel took over, no toast needed
    console.log('[S211] §NLP_SQL ' + parsed.sql.replace(/\s+/g, ' ').substring(0, 120));
    try {
      const rows = A.db.exec(parsed.sql, parsed.params || []);
      if (!rows.length || !rows[0].values.length) {
        // Empty result — show what's available
        let avail = '';
        try {
          const bldAvail = bldFilter('WHERE');
          const cls = A.db.exec('SELECT DISTINCT ifc_class FROM elements_meta ' + bldAvail.sql + ' ORDER BY ifc_class LIMIT 10', bldAvail.params);
          if (cls.length) avail = '\nAvailable: ' + cls[0].values.map(r => r[0]).join(', ');
        } catch(e) { console.warn('[S227] §NLP_AVAIL_ERR ' + e.message); }
        showToast((typeof _TRL!=='undefined'&&_TRL.ui_no_results||'No results for "{q}"').replace('{q}', parsed.desc) + avail, null, 'info');
        console.log('[S211] §NLP_EMPTY desc="' + parsed.desc + '"');
        return;
      }
      const cols = rows[0].columns;
      const vals = rows[0].values;
      // Format summary
      let summary = '';
      if (parsed.costMode) {
        // Cost mode: compute from RATES × qty (same as 4D/5D boq_charts)
        const clsIdx = cols.indexOf('ifc_class');
        const qtyIdx = cols.indexOf('qty');
        let totalCost = 0;
        const costRows = [];
        for (const r of vals) {
          const cls = r[clsIdx];
          const qty = r[qtyIdx] || 0;
          const cost = calcCost(cls, qty);
          totalCost += cost;
          var _cur = typeof _TRL!=='undefined'&&_TRL.cur||'RM';
          if (cost > 0) costRows.push([cls, qty, _cur + ' ' + cost.toLocaleString()]);
        }
        var _cur = typeof _TRL!=='undefined'&&_TRL.cur||'RM';
        var _cur2 = typeof _TRL!=='undefined'&&_TRL.cur2||'USD';
        var _rate = typeof _TRL!=='undefined'&&_TRL.cur_rate||3.91;
        const usd = totalCost / _rate;
        summary = _cur + ' ' + totalCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) +
          ' (' + _cur2 + ' ' + usd.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) + ') \u2014 ' + parsed.desc;
        // Replace vals with cost breakdown for Details view
        if (costRows.length) {
          rows[0].columns = ['ifc_class', 'qty', 'cost'];
          rows[0].values = costRows;
        }
      } else if (cols.includes('count')) {
        const total = vals.reduce((s, r) => s + (r[cols.indexOf('count')] || 0), 0);
        summary = total.toLocaleString() + ' ' + parsed.desc;
      } else {
        summary = vals.length + ' results — ' + parsed.desc;
      }
      showToast(summary, { cols, vals, parsed }, 'ok');
      console.log('[S211] §NLP_RESULT rows=' + vals.length + ' desc="' + parsed.desc + '"');

      // Highlight GUIDs in 3D if result has guid column
      if (cols.includes('guid')) {
        highlightGuids(vals.map(r => r[cols.indexOf('guid')]));
      }
    } catch (err) {
      showToast('Query error: ' + err.message, null, 'warn');
      console.log('[S211] §NLP_ERR ' + err.message);
    }
  }

  // ── Highlight GUIDs ──
  let _nlpHighlights = [];
  function highlightGuids(guids) {
    clearHighlights();
    const guidSet = new Set(guids);
    A.collectMeshes(o => o.isMesh).forEach(obj => {
      const g = A.guidMap[obj.id];
      if (g && guidSet.has(g)) {
        obj.material.emissive.setHex(0x224422);
        _nlpHighlights.push(obj);
      }
    });
    console.log('[S211] §NLP_HIGHLIGHT n=' + _nlpHighlights.length + '/' + guids.length);
  }
  function clearHighlights() {
    _nlpHighlights.forEach(obj => { if (obj.material) obj.material.emissive.setHex(0x000000); });
    _nlpHighlights = [];
  }

  // ── Toast UI (progressive, non-cluttering) ──
  let _toast = null;
  let _toastTimer = null;
  function showToast(summary, data, type) {
    dismissToast();
    _toast = document.createElement('div');
    _toast.id = 'nlp-toast';
    const bg = type === 'ok' ? 'rgba(20,60,20,0.92)' : type === 'warn' ? 'rgba(80,60,10,0.92)' : 'rgba(20,40,60,0.92)';
    const border = type === 'ok' ? '#4caf50' : type === 'warn' ? '#ff9800' : '#4fc3f7';
    const mobile = window.innerWidth <= 600;
    _toast.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      ${mobile ? 'width:85vw' : 'width:420px'};
      background:${bg};color:#e0e0e0;border:2px solid ${border};border-radius:12px;padding:20px 24px;
      z-index:300;font-size:16px;font-family:'Segoe UI',sans-serif;backdrop-filter:blur(12px);
      box-shadow:0 8px 32px rgba(0,0,0,0.6);cursor:default;animation:nlpFadeIn 0.2s ease-out;
      text-align:center`;
    // Summary line
    const sumDiv = document.createElement('div');
    sumDiv.style.cssText = 'font-weight:700;margin-bottom:8px;color:#fff;font-size:20px;line-height:1.3';
    sumDiv.textContent = summary;
    _toast.appendChild(sumDiv);
    // Show in 3D button (if guid results)
    if (data && data.cols && data.cols.includes('guid')) {
      const btn3d = document.createElement('button');
      btn3d.textContent = typeof _TRL!=='undefined'&&_TRL.ui_show_3d||'Show in 3D';
      btn3d.style.cssText = 'background:#4fc3f7;color:#000;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-right:6px';
      btn3d.onclick = () => { highlightGuids(data.vals.map(r => r[data.cols.indexOf('guid')])); };
      _toast.appendChild(btn3d);
    }
    // Expand to table (on demand)
    if (data && data.vals && data.vals.length > 0) {
      const expandBtn = document.createElement('button');
      expandBtn.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_details||'Details ({n})').replace('{n}', data.vals.length);
      expandBtn.style.cssText = 'background:transparent;color:#4fc3f7;border:1px solid #4fc3f7;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-right:6px';
      expandBtn.onclick = () => {
        if (_toast.querySelector('.nlp-table')) { _toast.querySelector('.nlp-table').remove(); return; }
        clearTimeout(_toastTimer); // pin it
        const tbl = document.createElement('div');
        tbl.className = 'nlp-table';
        tbl.style.cssText = 'max-height:180px;overflow-y:auto;margin-top:8px;font-size:12px;font-family:monospace';
        const maxRows = Math.min(data.vals.length, 20);
        let html = '<table style="width:100%;border-collapse:collapse"><tr>' +
          data.cols.map(c => `<th style="text-align:left;padding:2px 6px;border-bottom:1px solid #555;color:#4fc3f7">${c}</th>`).join('') + '</tr>';
        for (let i = 0; i < maxRows; i++) {
          html += '<tr>' + data.vals[i].map(v => `<td style="padding:2px 6px;border-bottom:1px solid #333">${v ?? '—'}</td>`).join('') + '</tr>';
        }
        if (data.vals.length > maxRows) html += `<tr><td colspan="${data.cols.length}" style="color:#888;padding:4px 6px">... ${data.vals.length - maxRows} more</td></tr>`;
        html += '</table>';
        tbl.innerHTML = html;
        _toast.appendChild(tbl);
      };
      _toast.appendChild(expandBtn);
    }
    // Dismiss button — tap-friendly on mobile
    const xBtn = document.createElement('button');
    xBtn.textContent = '\u00d7';
    xBtn.style.cssText = 'position:absolute;top:4px;right:4px;cursor:pointer;color:#fff;font-size:16px;' +
      'background:#c33;border:none;border-radius:4px;padding:8px 14px;min-width:44px;min-height:44px;font-weight:700';
    xBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); dismissToast(true); });
    _toast.appendChild(xBtn);
    // S275: Prevent toast pointerup from closing Find panel
    _toast.addEventListener('pointerup', function(e) { e.stopPropagation(); });
    document.body.appendChild(_toast);
    // No auto-dismiss — user closes with × button
  }

  function dismissToast(clearInput) {
    clearTimeout(_toastTimer);
    if (_toast) { _toast.remove(); _toast = null; }
    clearHighlights();
    if (clearInput && _barVisible && input) { input.value = ''; input.focus(); }
  }

  // ── Search bar UI (Stage 2 — slim bar, slides in) ──
  let _barVisible = false;
  const bar = document.createElement('div');
  bar.id = 'nlp-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:20;display:none;' +
    'background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);padding:6px 12px;' +
    'border-bottom:1px solid rgba(79,195,247,0.3);align-items:center;gap:6px';

  const input = document.createElement('input');
  input.id = 'nlp-input';
  input.type = 'text';
  input.placeholder = typeof _TRL!=='undefined'&&_TRL.ui_nlp_placeholder||'count doors, floor 1 walls, total cost, Find fire pump...';
  input.style.cssText = 'flex:1;background:#222;color:#fff;border:1px solid #555;border-radius:4px;' +
    'padding:8px 10px;font-size:14px;font-family:"Segoe UI",sans-serif;outline:none';
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); executeQuery(input.value); }
    if (e.key === 'Escape') { toggleBar(); }
  });
  // History dropdown on arrow-down in empty input
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && !input.value) { showHistory(); e.preventDefault(); }
  });
  bar.appendChild(input);

  // Go button — subdued so mic stands out
  const goBtn = document.createElement('button');
  goBtn.id = 'nlp-go';
  goBtn.textContent = typeof _TRL!=='undefined'&&_TRL.ui_go||'Go';
  goBtn.style.cssText = 'background:#444;color:#888;border:1px solid #555;border-radius:4px;' +
    'cursor:pointer;font-size:13px;padding:8px 10px;line-height:1;flex-shrink:0';
  goBtn.onclick = () => { A._nlpExecute ? A._nlpExecute(input.value) : executeQuery(input.value); };
  bar.appendChild(goBtn);

  // Mic button (only if Web Speech API available)
  let _recognition = null;
  let _listening = false;
  if (HAS_VOICE) {
    const micBtn = document.createElement('button');
    micBtn.id = 'nlp-mic';
    micBtn.textContent = '\uD83C\uDFA4'; // 🎤
    micBtn.title = typeof _TRL!=='undefined'&&_TRL.ui_tt_voice||'Voice command';
    micBtn.style.cssText = 'background:#444;color:#fff;border:1px solid #666;border-radius:4px;' +
      'cursor:pointer;font-size:20px;padding:6px 10px;line-height:1;flex-shrink:0;transition:background 0.2s';
    micBtn.onclick = toggleVoice;
    bar.appendChild(micBtn);
  }

  // Close button — must be large enough to tap on mobile
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.id = 'nlp-close';
  closeBtn.style.cssText = 'background:#c33;color:#fff;border:none;border-radius:4px;' +
    'cursor:pointer;font-size:18px;font-weight:700;padding:8px 12px;line-height:1;flex-shrink:0;min-width:40px;min-height:36px';
  closeBtn.onclick = function(e) { e.stopPropagation(); toggleBar(); };
  bar.appendChild(closeBtn);

  // Example chips
  const chips = document.createElement('div');
  chips.id = 'nlp-chips';
  chips.style.cssText = 'position:fixed;top:42px;left:0;right:0;z-index:20;display:none;' +
    'background:rgba(0,0,0,0.7);padding:4px 12px;overflow-x:auto;white-space:nowrap;' +
    'border-bottom:1px solid rgba(79,195,247,0.15)';
  const EXAMPLES = ['count doors','floor 1 walls','total cost','show structure','find fire doors'];
  EXAMPLES.forEach(ex => {
    const chip = document.createElement('button');
    chip.textContent = ex;
    chip.style.cssText = 'background:#333;color:#4fc3f7;border:1px solid #555;border-radius:12px;' +
      'padding:3px 10px;font-size:11px;cursor:pointer;margin-right:4px;white-space:nowrap';
    chip.onclick = () => { input.value = ex; A._nlpExecute ? A._nlpExecute(ex) : executeQuery(ex); };
    chips.appendChild(chip);
  });

  document.body.appendChild(bar);
  document.body.appendChild(chips);

  // ── History ──
  const HISTORY_KEY = 'bim_nlp_history';
  function addHistory(text) {
    let h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    h = h.filter(x => x !== text);
    h.unshift(text);
    if (h.length > 10) h = h.slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  }
  function showHistory() {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!h.length) return;
    dismissHistory();
    const drop = document.createElement('div');
    drop.id = 'nlp-history';
    drop.style.cssText = 'position:fixed;top:42px;left:12px;z-index:21;background:#222;' +
      'border:1px solid #555;border-radius:4px;max-height:200px;overflow-y:auto;min-width:200px';
    h.forEach(q => {
      const item = document.createElement('div');
      item.textContent = q;
      item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:13px;color:#ccc;border-bottom:1px solid #333';
      item.onmouseenter = () => item.style.background = '#333';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = () => { input.value = q; executeQuery(q); dismissHistory(); };
      drop.appendChild(item);
    });
    document.body.appendChild(drop);
    setTimeout(() => document.addEventListener('click', _historyClickAway, { once: true }), 100);
  }
  function dismissHistory() {
    const el = document.getElementById('nlp-history');
    if (el) el.remove();
  }
  function _historyClickAway(e) {
    const el = document.getElementById('nlp-history');
    if (el && !el.contains(e.target)) el.remove();
  }

  // Wrap executeQuery to also save history
  const _origExec = executeQuery;
  A._nlpExecute = function(text) {
    if (!text || !text.trim()) return;
    addHistory(text.trim());
    _origExec(text.trim());
  };
  // Re-wire input handler
  input.removeEventListener('keydown', input._kd);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); A.inputWasVoice = false; A._nlpExecute(input.value); }
    if (e.key === 'Escape') { toggleBar(); }
    if (e.key === 'ArrowDown' && !input.value) { showHistory(); e.preventDefault(); }
  });

  // ── Voice recognition ──
  function toggleVoice() {
    if (_listening) { _recognition.stop(); return; }
    _recognition = new SR();
    _recognition.continuous = false;
    _recognition.interimResults = true;
    _recognition.lang = 'en-US';

    const micBtn = document.getElementById('nlp-mic');
    _recognition.onstart = () => {
      _listening = true;
      micBtn.style.background = '#f44336';
      micBtn.style.borderColor = '#f44336';
      console.log('[S211] §VOICE_START');
    };
    _recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          input.value = t;
          input.style.fontStyle = 'normal';
          input.style.color = '#fff';
          const conf = (e.results[i][0].confidence * 100).toFixed(0);
          console.log('[S211] §VOICE_FINAL "' + t + '" conf=' + conf + '%');
          A.inputWasVoice = true;  // S233: voice modality flag
          A._nlpExecute(t);
        } else {
          input.value = t;
          input.style.fontStyle = 'italic';
          input.style.color = '#888';
        }
      }
    };
    _recognition.onerror = (e) => {
      console.log('[S211] §VOICE_ERR ' + e.error);
      if (e.error === 'no-speech') {
        A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_no_speech||'No speech detected \u2014 tap mic again';
      }
    };
    _recognition.onend = () => {
      _listening = false;
      micBtn.style.background = '#444';
      micBtn.style.borderColor = '#666';
    };
    _recognition.start();
  }

  // ── Toggle search bar ──
  function toggleBar() {
    _barVisible = !_barVisible;
    bar.style.display = _barVisible ? 'flex' : 'none';
    chips.style.display = _barVisible ? 'block' : 'none';
    if (_barVisible) {
      input.value = '';
      input.style.fontStyle = 'normal';
      input.style.color = '#fff';
      input.focus();
    } else {
      dismissToast();
      dismissHistory();
      if (_listening && _recognition) _recognition.stop();
      // S233: closing search bar also exits find/navigate
      if (typeof A.closeFindPanel === 'function') A.closeFindPanel();
    }
    const btn = document.getElementById('nlp-btn');
    if (btn) {
      btn.style.background = _barVisible ? '#4fc3f7' : '#444';
      btn.style.color = _barVisible ? '#000' : '#fff';
    }
  }
  A.toggleNlp = toggleBar;

  // Expose for main.js
  window.toggleNlp = toggleBar;

  // ── CSS animation ──
  if (!document.getElementById('nlp-style')) {
    const style = document.createElement('style');
    style.id = 'nlp-style';
    style.textContent = '@keyframes nlpFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }';
    document.head.appendChild(style);
  }

  console.log('[S211] §NLP_READY patterns=' + PATTERNS.length + ' voice=' + HAS_VOICE);
}
