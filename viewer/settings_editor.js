/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * settings_editor.js — The project's STANDARD JSON editor.
 *
 * Implementing SETTINGS_JSON_EDITOR.md — Witness: W-PROPSHEET
 *
 * App-agnostic property-sheet renderer: walks a `sections -> rows -> typed-fields`
 * schema and builds DOM. Adding a section/field = a new JSON object, ZERO renderer
 * changes (the Excel model: rows are data, columns are typed fields, the renderer
 * knows neither). Reorderable sections delegate to window.ListBuilder.
 *
 * CONTRACT — this file has ZERO app-specific identifiers (no THREE, no `A.`, no
 * `_actions`, no BIM/ERP names). It is driven entirely by the passed schema +
 * callbacks. Provable by grep. That is the "free for any app to reuse" guarantee.
 *
 * Exports (window):
 *   SettingsEditor({container, schema, storageKey, persist, onChange, onReset})
 *       -> { rerender, getState, reset }
 *   SettingsEditor.jsonToSchema(raw, overrides)  -> schema   (auto-infer any JSON)
 *   SettingsEditor.schemaToJson(schema)          -> raw      (rebuild JSON from live schema)
 *   window.loadJsonWithOverrides(url, storageKey) -> Promise<raw>  (consumer read path)
 *
 * Field types: toggle | choice | text | number | color | readonly
 */
(function() {
  'use strict';

  // ── small helpers ─────────────────────────────────────────────────────────
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  var COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  // setDotted({}, 'source.discipline', 'ARC') -> {source:{discipline:'ARC'}}
  function setDotted(obj, dottedKey, value) {
    var parts = dottedKey.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  // ── AUTO-INFER: any JSON -> default schema ─────────────────────────────────
  // overrides keyed by "rowId.fieldKey" (preferred) or bare "fieldKey".
  function inferType(value) {
    if (typeof value === 'boolean') return 'toggle';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string' && COLOR_RE.test(value)) return 'color';
    return 'text';
  }

  function applyOverride(field, overrides, rowId) {
    if (!overrides) return field;
    // most-specific first: "rowId.fieldKey", then row-level "rowId" (single-value
    // leaf rows whose field key is the generic "value"), then bare "fieldKey".
    var ov = overrides[rowId + '.' + field.key] || overrides[rowId] || overrides[field.key];
    if (ov) for (var k in ov) if (ov.hasOwnProperty(k)) field[k] = ov[k];
    return field;
  }

  // array of primitives -> comma text; remember if it was all-numeric so the
  // round-trip restores numbers (not strings). KNOWN LIMIT: mixed/object arrays.
  function listField(key, arr, overrides, rowId) {
    return applyOverride({ key: key, type: 'text', value: arr.join(', '),
      _list: true, _listNumeric: arr.every(function(x) { return typeof x === 'number'; }) },
      overrides, rowId);
  }
  function scalarField(key, value, overrides, rowId) {
    return applyOverride({ key: key, type: inferType(value), value: value }, overrides, rowId);
  }

  // Build the flat (dotted) field list for one row-object. Recurses into nested
  // plain objects -> dotted keys. Arrays of primitives -> comma-joined text (_list).
  function rowToFields(obj, overrides, rowId, prefix) {
    var fields = [];
    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      var fullKey = prefix ? prefix + '.' + k : k;
      var v = obj[k];
      if (isPlainObject(v)) {
        fields = fields.concat(rowToFields(v, overrides, rowId, fullKey));
      } else if (Array.isArray(v)) {
        fields.push(listField(fullKey, v, overrides, rowId));
      } else {
        fields.push(scalarField(fullKey, v, overrides, rowId));
      }
    }
    return fields;
  }

  // Optional DISPLAY directives (pure data, any JSON may pass them in `overrides`):
  //   __labelKey : field key whose value becomes the row label (and is hidden as a field)
  //   __summary  : array of field keys combined into ONE readonly "a · b · c" line
  //                (the other fields are dropped — a compact, read-only-friendly view)
  //   __hide     : array of field keys to omit
  // No __* directive -> behaves exactly as before (every key a field).
  function fmtSummary(key, val) {
    if (val == null) return '';
    if (key === 'weeks') return val + 'wk';
    return String(val);
  }
  function arrayToSection(name, arr, overrides) {
    var labelKey = overrides.__labelKey, summary = overrides.__summary, hide = overrides.__hide || [];
    var rows = arr.map(function(el, i) {
      var id = (el && el.id != null) ? String(el.id) : String(i);
      var label = (labelKey && el && el[labelKey] != null) ? String(el[labelKey])
        : ((el && (el.label || el.name)) || id);
      var fields;
      if (summary && summary.length) {
        var parts = summary.map(function(k) { return fmtSummary(k, el[k]); });
        fields = [{ key: 'summary', type: 'readonly', value: parts.join(' · '), _wide: true }];
      } else {
        fields = rowToFields(el, overrides, id, '').filter(function(f) {
          return f.key !== labelKey && hide.indexOf(f.key) < 0;
        });
      }
      return { id: id, label: label, _index: i, fields: fields };
    });
    return { section: name, reorderable: true, _key: name, _array: true, rows: rows };
  }

  function jsonToSchema(raw, overrides) {
    overrides = overrides || {};
    // Root is an array of objects -> single reorderable section.
    if (Array.isArray(raw)) {
      var sec = arrayToSection('items', raw, overrides);
      sec._rootArray = true;
      return [sec];
    }
    // Root is an object -> walk top-level keys.
    var schema = [];
    var general = { section: 'General', _key: null, _general: true, rows: [] };
    for (var key in raw) {
      if (!raw.hasOwnProperty(key)) continue;
      var v = raw[key];
      if (Array.isArray(v) && v.length && isPlainObject(v[0])) {
        schema.push(arrayToSection(key, v, overrides));
      } else if (isPlainObject(v)) {
        var rows = [];
        for (var leaf in v) {
          if (!v.hasOwnProperty(leaf)) continue;
          var rid = key + '/' + leaf;
          rows.push({ id: rid, label: leaf, _key: leaf,
            fields: [ Array.isArray(v[leaf])
              ? listField('value', v[leaf], overrides, rid)
              : scalarField('value', v[leaf], overrides, rid) ] });
        }
        schema.push({ section: key, _key: key, rows: rows });
      } else {
        // primitive (or empty/primitive array) -> a row in General
        general.rows.push({ id: key, label: key, _key: key,
          fields: [ Array.isArray(v)
            ? listField('value', v, overrides, key)
            : scalarField('value', v, overrides, key) ] });
      }
    }
    if (general.rows.length) schema.unshift(general);
    return schema;
  }

  // ── REBUILD JSON from live schema (current values + current row order) ───────
  function coerce(field) {
    if (field._list) {
      var parts = String(field.value).split(',').map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length; });
      return field._listNumeric ? parts.map(Number) : parts;
    }
    if (field.type === 'number') { var n = Number(field.value); return isNaN(n) ? field.value : n; }
    if (field.type === 'toggle') return !!field.value;
    return field.value;
  }

  function rowToObj(row) {
    var obj = {};
    row.fields.forEach(function(f) { setDotted(obj, f.key, coerce(f)); });
    return obj;
  }

  function schemaToJson(schema) {
    // Root-array schema -> array, preserving current row order.
    if (schema.length === 1 && schema[0]._rootArray) {
      return schema[0].rows.map(rowToObj);
    }
    var out = {};
    schema.forEach(function(sec) {
      if (sec._array) {
        out[sec._key] = sec.rows.map(rowToObj);
      } else if (sec._general) {
        sec.rows.forEach(function(r) { out[r._key] = coerce(r.fields[0]); });
      } else {
        var sub = {};
        sec.rows.forEach(function(r) { sub[r._key] = coerce(r.fields[0]); });
        out[sec._key] = sub;
      }
    });
    return out;
  }

  // ── FIELD RENDERERS (the ONLY per-type code) ───────────────────────────────
  // Each returns a DOM element and calls commit(newValue) on edit.
  function renderField(field, commit) {
    var t = field.type;
    // readonly wins over the type branch — a display span, never an editable control.
    // (Must precede number/toggle/choice/color, which would otherwise return an input.)
    if (field.readonly || t === 'readonly') {
      var ro = document.createElement('span');
      ro.textContent = field._list ? field.value : String(field.value);
      ro.style.cssText = 'font-size:12px;color:#888;font-family:monospace;max-width:' +
        (field._wide ? '210px' : '140px') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      ro.title = ro.textContent;
      return ro;
    }
    if (t === 'toggle') {
      var btn = document.createElement('button');
      var paint = function() {
        btn.textContent = field.value ? '●' : '○';
        btn.style.color = field.value ? '#4fc3f7' : '#555';
        btn.title = field.value ? 'On' : 'Off';
      };
      btn.style.cssText = 'border:none;background:none;font-size:14px;cursor:pointer;padding:4px 6px;';
      paint();
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        field.value = !field.value; paint(); commit(field.value);
      });
      return btn;
    }
    if (t === 'choice') {
      var sel = document.createElement('select');
      sel.style.cssText = 'background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;font-size:12px;';
      (field.options || []).forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.label != null ? o.label : o.value;
        if (o.value === field.value) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function() { field.value = sel.value; commit(sel.value); });
      return sel;
    }
    if (t === 'color') {
      var inp = document.createElement('input');
      inp.type = 'color';
      inp.value = COLOR_RE.test(String(field.value)) ? field.value : '#888888';
      inp.style.cssText = 'width:32px;height:24px;border:none;background:none;cursor:pointer;padding:0;';
      inp.addEventListener('input', function() { field.value = inp.value; commit(inp.value); });
      return inp;
    }
    if (t === 'number') {
      var num = document.createElement('input');
      num.type = 'number';
      num.value = field.value;
      if (field.min != null) num.min = field.min;
      if (field.max != null) num.max = field.max;
      if (field.step != null) num.step = field.step;
      num.style.cssText = 'width:90px;background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;font-size:12px;text-align:right;';
      num.addEventListener('change', function() {
        var n = Number(num.value); field.value = isNaN(n) ? num.value : n; commit(field.value);
      });
      return num;
    }
    // text (default)
    var txt = document.createElement('input');
    txt.type = 'text';
    txt.value = field.value;
    txt.style.cssText = 'width:140px;background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;font-size:12px;';
    txt.addEventListener('change', function() { field.value = txt.value; commit(txt.value); });
    return txt;
  }

  // ── MAIN ────────────────────────────────────────────────────────────────────
  function SettingsEditor(opts) {
    var container = opts.container;
    var input = opts.schema || [];
    var storageKey = opts.storageKey;
    var persist = opts.persist !== false;        // default true (write-through)
    var onChange = opts.onChange || function() {};
    var onReset = opts.onReset;
    var readonly = !!opts.readonly;              // §SETTINGS_JSON: whole-file view — no write path

    // Live model = a clone of the input schema; values + order mutate in place.
    var model = clone(input);

    // Read-only mode: force every field display-only, kill reorder, log writable=0.
    // renderField already renders a span for field.readonly (no input wiring).
    if (readonly) {
      var _fields = 0;
      var markRow = function(r) {                 // recurse into nested children too
        (r.fields || []).forEach(function(f) { _fields++; f.readonly = true; });
        (r.children || []).forEach(markRow);
      };
      model.forEach(function(sec) {
        sec.reorderable = false;
        (sec.rows || []).forEach(markRow);
      });
      console.log('§PROPSHEET_READONLY id=' + (storageKey || '?') + ' fields=' + _fields + ' writable=0');
    }

    function getState() { return schemaToJson(model); }

    function save(rowId, fieldKey, value) {
      var full = getState();
      if (persist && storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(full)); } catch (e) {}
        console.log('§PROPSHEET_SAVE key=' + storageKey + ' field=' + rowId + '.' + fieldKey + '=' + value);
      }
      onChange(rowId, fieldKey, value, full);
    }

    // depth = nesting level (0 = top). A row carrying a non-empty `children` array is a
    // COLLAPSED bar: it renders a chevron and a default-collapsed container of its child
    // rows, rendered RECURSIVELY (handles arbitrarily deep WBS — Level → sub-storey → task).
    // Rows with no `children` render exactly as before (backward compatible).
    function buildRow(row, reorderable, depth) {
      depth = depth || 0;
      var hasKids = !!(row.children && row.children.length);
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;padding-left:' +
        (12 + depth * 16) + 'px;border-bottom:1px solid rgba(255,255,255,0.04);user-select:none;' +
        (reorderable ? 'cursor:grab;' : (hasKids ? 'cursor:pointer;' : ''));

      // generic drag-handle affordance for reorderable sections (app-agnostic)
      if (reorderable) {
        var handle = document.createElement('span');
        handle.textContent = '≡';
        handle.style.cssText = 'font-size:16px;color:#555;cursor:grab;';
        el.appendChild(handle);
      }
      // collapse/expand chevron for a parent (collapsed) bar
      var chev = null;
      if (hasKids) {
        chev = document.createElement('span');
        chev.textContent = '▶';
        chev.style.cssText = 'font-size:10px;color:#6c9fff;display:inline-block;transition:transform 200ms;';
        el.appendChild(chev);
      }
      // optional per-row icon: a pure HTML string (e.g. <img> / <svg>) — any app may pass it
      if (row.icon) {
        var ic = document.createElement('span');
        ic.style.cssText = 'width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;opacity:0.7;';
        ic.innerHTML = row.icon;
        el.appendChild(ic);
      }

      var label = document.createElement('span');
      label.textContent = row.label != null ? row.label : row.id;
      label.style.cssText = 'flex:1;font-size:12px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      el.appendChild(label);

      // one or more typed fields, right-aligned
      row.fields.forEach(function(field) {
        // dotted-key fields get a small caption so multi-field rows stay legible
        if (row.fields.length > 1) {
          var cap = document.createElement('span');
          cap.textContent = field.key;
          cap.style.cssText = 'font-size:10px;color:#6c9fff;font-family:monospace;';
          el.appendChild(cap);
        }
        el.appendChild(renderField(field, function(v) { save(row.id, field.key, v); }));
      });
      if (!hasKids) return el;

      // wrapper = this bar + its default-collapsed children, rendered recursively
      var wrap = document.createElement('div');
      wrap.appendChild(el);
      var kids = document.createElement('div');
      kids.style.cssText = 'max-height:0;overflow:hidden;transition:max-height 300ms ease;';
      row.children.forEach(function(child) { kids.appendChild(buildRow(child, false, depth + 1)); });
      wrap.appendChild(kids);
      var open = false;
      el.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        open = !open;
        kids.style.maxHeight = open ? 'none' : '0';
        if (chev) chev.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
      });
      return wrap;
    }

    function buildSection(sec) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0;overflow:hidden;background:transparent;';

      var hd = document.createElement('div');
      hd.style.cssText = 'padding:14px 18px;display:flex;align-items:center;cursor:pointer;background:rgba(108,159,255,0.03);transition:background 150ms;';
      var chv = document.createElement('span');
      chv.textContent = '▶';
      chv.style.cssText = 'font-size:11px;color:#6c9fff;margin-right:8px;display:inline-block;transition:transform 250ms;transform:rotate(90deg);';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-weight:600;color:#8ab4ff;font-size:13px;';
      lbl.textContent = sec.section;
      hd.appendChild(chv); hd.appendChild(lbl);
      wrap.appendChild(hd);

      var bd = document.createElement('div');
      bd.className = 'propsheet-bd';
      bd.style.cssText = 'max-height:70vh;overflow-y:auto;transition:max-height 300ms ease;padding:0 4px;';

      if (sec.reorderable && typeof window.ListBuilder === 'function') {
        ListBuilder({
          container: bd,
          items: sec.rows,
          getId: function(r) { return r.id; },
          idAttr: 'data-row-id',
          render: function(r) { return buildRow(r, true); },
          onReorder: function(newIds) {
            sec.rows.sort(function(a, b) { return newIds.indexOf(a.id) - newIds.indexOf(b.id); });
            save('(order)', sec._key || sec.section, newIds.join(','));
          }
        });
      } else {
        sec.rows.forEach(function(r) {
          var rowEl = buildRow(r);
          rowEl.setAttribute('data-row-id', r.id);
          bd.appendChild(rowEl);
        });
      }
      wrap.appendChild(bd);

      hd.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        var open = bd.style.maxHeight !== '0px' && bd.style.maxHeight !== '0';
        bd.style.maxHeight = open ? '0' : '70vh';
        bd.style.overflowY = open ? 'hidden' : 'auto';
        chv.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
      });
      return wrap;
    }

    function rerender() {
      container.innerHTML = '';
      var rowCount = 0;
      model.forEach(function(sec) {
        rowCount += (sec.rows || []).length;
        container.appendChild(buildSection(sec));
      });
      console.log('§PROPSHEET_RENDER sections=' + model.length + ' rows=' + rowCount);
    }

    function reset() {
      if (storageKey) { try { localStorage.removeItem(storageKey); } catch (e) {} }
      model = clone(input);
      rerender();
      if (typeof onReset === 'function') onReset();
    }

    rerender();
    return { rerender: rerender, getState: getState, reset: reset };
  }

  SettingsEditor.jsonToSchema = jsonToSchema;
  SettingsEditor.schemaToJson = schemaToJson;

  // ── CONSUMER READ PATH: shipped file deep-merged with localStorage override ──
  function deepMerge(base, over) {
    if (Array.isArray(over)) return over;                 // arrays replace wholesale
    if (!isPlainObject(base) || !isPlainObject(over)) return over;
    var out = {};
    var k;
    for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    for (k in over) if (over.hasOwnProperty(k)) {
      out[k] = isPlainObject(out[k]) && isPlainObject(over[k]) ? deepMerge(out[k], over[k]) : over[k];
    }
    return out;
  }

  function loadJsonWithOverrides(url, storageKey) {
    return fetch(url).then(function(r) { return r.json(); }).then(function(raw) {
      var over = null;
      try { over = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) {}
      return over ? deepMerge(raw, over) : raw;
    });
  }

  window.SettingsEditor = SettingsEditor;
  window.loadJsonWithOverrides = loadJsonWithOverrides;
})();
