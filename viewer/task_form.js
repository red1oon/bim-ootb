// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-24 step 4 "the form sheet". Witness: viewer/tests/witness_task_mission.js (W-TASK-MISSION M5, M6, R3).
// ISSUE: a task's form is a FILE made on desktop (ADUI JSON) or, when the task type has none, the built-in basic form. The phone only renders it
//        and returns the answers; it never designs one. Read the §-log: §TASK_FORM type= fields= rendered= unsupported= builtin=
// FORM SHAPE (the shape of erp/tests/witness_tasker_contract.js, the WO-12 contract): { window:{ name, tabs:[ { name, fields:[
//        { fieldId, name, component, sequence, validation:{ required:true } } ] } ] } } — an object or its JSON text.
// COMPONENTS that render:  TEXT (a text box -> string) · SAFETY_CHECKLIST (one tick box -> true|false) · MULTI_PHOTO (the Site Camera -> [photo file names])
//        · SIGNATURE (a finger-draw pad -> a PNG data URL) · QR_CHECKLIST (a scan-or-type code box -> the code string; the repo defines no richer meaning).
//        Any other component renders a named "not supported on this phone" row, is counted in `unsupported`, and is never judged (a required
//        field the phone cannot show must not block Done forever).
// BUILT-IN form (a type with no form) — WO-31 "The standard task form": ONE fixed shape whose answers are existing legacy columns. plan(typeDef, extras):
//        Outcome = one pick of typeDef.resolutions [{id,name}] (R_Request.R_Resolution_ID; REQUIRED when the list is not empty) · What I found = TEXT "result" (R_RequestUpdate.Result) ·
//        Material used = optional product + quantity from extras.materials [{id,name,uom}] (M_ProductSpent_ID, QtySpent; a product needs a quantity > 0) · Photos = MULTI_PHOTO ·
//        Checklist = one tick per line of extras.checklist [text…] (the Standard Response picked on the task's Request) -> [{text,done}] in the order given.
//        With none of the three lists the form is TEXT "result" + MULTI_PHOTO "photos" — exactly what a type without lists rendered before WO-31.
//        shape() returns { resolution, checklist, spent } for the report; collect() returns the plain answers (result, photos) so today's answer shape is unchanged.
//        The three built-in components (RESOLUTION, CHECKLIST, MATERIAL) exist only in the built-in form; in a type's own JSON form they stay "not supported".
// REQUIRED: validation.required refuses Done until the field is filled (TEXT non-blank, SAFETY_CHECKLIST ticked, MULTI_PHOTO >= 1 photo,
//        SIGNATURE drawn, QR_CHECKLIST non-blank). `check()` returns the missing fieldIds; the caller shows them and does not queue a report.
(function (root) {
  'use strict';
  var SUPPORTED = { TEXT: 1, SAFETY_CHECKLIST: 1, MULTI_PHOTO: 1, SIGNATURE: 1, QR_CHECKLIST: 1 };
  var BUILTIN_ONLY = { RESOLUTION: 1, CHECKLIST: 1, MATERIAL: 1 };
  function _parse(form) {
    if (form == null) return null;
    if (typeof form === 'string') { try { return JSON.parse(form); } catch (e) { return null; } }
    return typeof form === 'object' ? form : null;
  }
  function _idName(a, withUom) {
    return (Array.isArray(a) ? a : []).filter(function (x) { return x && typeof x.id === 'string' && x.id !== '' && typeof x.name === 'string' && x.name !== ''; })
      .map(function (x) { var o = { id: x.id, name: x.name }; if (withUom) o.uom = typeof x.uom === 'string' ? x.uom : ''; return o; });
  }
  // plan(typeDef, extras) -> { builtin, name, fields:[{fieldId,name,component,required,supported}], fields_n, rendered, unsupported, resolutions, checklist, materials }
  //   extras = { checklist:[text…], materials:[{id,name,uom}] } (both optional; used only by the built-in form)
  function plan(typeDef, extras) {
    var f = _parse(typeDef && typeDef.form), builtin = false, res = [], chk = [], mat = [];
    var tabs = f && f.window && Array.isArray(f.window.tabs) ? f.window.tabs : null;
    if (!tabs) {
      builtin = true; extras = extras || {};
      res = _idName(typeDef && typeDef.resolutions); mat = _idName(extras.materials, true);
      chk = (Array.isArray(extras.checklist) ? extras.checklist : []).filter(function (x) { return typeof x === 'string' && x.trim() !== ''; }).map(function (x) { return x.trim(); });
      var bf = [];
      if (res.length) bf.push({ fieldId: 'resolution', name: 'Outcome', component: 'RESOLUTION', sequence: 5 });   // required by check() (R4 marker), not by a `required` flag: one owner
      bf.push({ fieldId: 'result', name: res.length || mat.length || chk.length ? 'What I found' : 'Result', component: 'TEXT', sequence: 10 });
      if (mat.length) bf.push({ fieldId: 'material', name: 'Material used', component: 'MATERIAL', sequence: 15 });
      bf.push({ fieldId: 'photos', name: 'Photos', component: 'MULTI_PHOTO', sequence: 20 });
      if (chk.length) bf.push({ fieldId: 'checklist', name: 'Checklist', component: 'CHECKLIST', sequence: 25 });
      f = { window: { name: 'Task', tabs: [ { name: 'Result', fields: bf } ] } }; tabs = f.window.tabs;
    }
    var fields = [];
    tabs.forEach(function (t) { (t && Array.isArray(t.fields) ? t.fields : []).forEach(function (x) {
      if (!x || typeof x.fieldId !== 'string' || !x.fieldId) return;
      fields.push({ fieldId: x.fieldId, name: String(x.name || x.fieldId), component: String(x.component || ''), sequence: +x.sequence || 0,
        required: !!(x.validation && x.validation.required), supported: !!SUPPORTED[x.component] || (builtin && !!BUILTIN_ONLY[x.component]) });
    }); });
    fields.sort(function (a, b) { return a.sequence - b.sequence; });
    var unsupported = fields.filter(function (x) { return !x.supported; }).length;
    return { builtin: builtin, name: (f.window && f.window.name) || 'Task', fields: fields, fields_n: fields.length, rendered: fields.length - unsupported, unsupported: unsupported,
      resolutions: res, checklist: chk, materials: mat };
  }

  function _el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  var BTN = 'min-height:44px;padding:8px 14px;border:0;border-radius:8px;background:#4fc3f7;color:#000;font-size:15px;font-weight:600';
  var INP = 'width:100%;box-sizing:border-box;min-height:44px;padding:8px;border-radius:8px;border:1px solid #666;background:#111;color:#eee;font-size:15px';

  // mount(host, plan, hooks) -> { collect(), check(), photoFiles() }
  //   hooks.takePhoto(cb(blob)) — the Site Camera path (the caller owns it); hooks.log(msg)
  function mount(host, pl, hooks) {
    hooks = hooks || {};
    var state = {};   // fieldId -> { get():value, ok():bool, node }
    var photos = [];  // [{ fieldId, name, blob }] in the order taken
    var counter = 0;
    host.innerHTML = '';
    pl.fields.forEach(function (f) {
      var row = _el('div', 'margin:10px 0;'); row.setAttribute('data-field', f.fieldId); row.setAttribute('data-component', f.component);
      var label = _el('div', 'font-size:14px;color:#ccc;margin-bottom:4px;', f.name + ((f.required || f.component === 'RESOLUTION') && f.supported ? ' *' : '')); row.appendChild(label);
      if (!f.supported) {
        row.setAttribute('data-unsupported', '1');
        row.appendChild(_el('div', 'font-size:13px;color:#ef9a9a;', 'not supported on this phone (' + (f.component || 'no component') + ')'));
        host.appendChild(row); return;
      }
      var s = { node: row, f: f };
      if (f.component === 'TEXT') {
        var t = _el('textarea', INP + ';min-height:72px'); t.id = 'tf-' + f.fieldId; row.appendChild(t);
        s.get = function () { return t.value; }; s.ok = function () { return t.value.trim() !== ''; };
      } else if (f.component === 'SAFETY_CHECKLIST') {
        var lab = _el('label', 'display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px;'), c = document.createElement('input');
        c.type = 'checkbox'; c.id = 'tf-' + f.fieldId; c.style.cssText = 'width:26px;height:26px;'; lab.appendChild(c); lab.appendChild(document.createTextNode('Checked'));
        row.appendChild(lab); s.get = function () { return !!c.checked; }; s.ok = function () { return !!c.checked; };
      } else if (f.component === 'MULTI_PHOTO') {
        var list = _el('div', 'font-size:13px;color:#aaa;margin:4px 0;', 'no photo yet'), b = _el('button', BTN, 'Take photo'); b.type = 'button'; b.id = 'tf-' + f.fieldId + '-take';
        var mine = [];
        b.onclick = function () { if (!hooks.takePhoto) return; hooks.takePhoto(function (blob) {
          if (!blob) return; counter++;
          var name = (hooks.photoPrefix || 'photo') + '_' + f.fieldId + '_' + counter + '.jpg';
          photos.push({ fieldId: f.fieldId, name: name, blob: blob }); mine.push(name);
          list.textContent = mine.length + ' photo' + (mine.length === 1 ? '' : 's') + ': ' + mine.join(', ');
        }); };
        row.appendChild(list); row.appendChild(b); s.get = function () { return mine.slice(); }; s.ok = function () { return mine.length > 0; };
      } else if (f.component === 'SIGNATURE') {
        var pad = document.createElement('canvas'); pad.width = 600; pad.height = 200; pad.id = 'tf-' + f.fieldId;
        pad.style.cssText = 'width:100%;height:120px;border:1px solid #666;border-radius:8px;background:#fff;touch-action:none;';
        var g = pad.getContext('2d'), down = false, drawn = false; g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = '#000';
        function pt(e) { var r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height }; }
        pad.addEventListener('pointerdown', function (e) { down = true; var p = pt(e); g.beginPath(); g.moveTo(p.x, p.y); e.preventDefault(); });
        pad.addEventListener('pointermove', function (e) { if (!down) return; var p = pt(e); g.lineTo(p.x, p.y); g.stroke(); drawn = true; e.preventDefault(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { pad.addEventListener(n, function () { down = false; }); });
        var clr = _el('button', BTN + ';background:#444;color:#fff;margin-top:6px', 'Clear'); clr.type = 'button';
        clr.onclick = function () { g.clearRect(0, 0, pad.width, pad.height); drawn = false; };
        row.appendChild(pad); row.appendChild(clr);
        s.get = function () { return drawn ? pad.toDataURL('image/png') : ''; }; s.ok = function () { return drawn; };
      } else if (f.component === 'RESOLUTION') {   // the Outcome: one pick of the type's resolutions (R_Request.R_Resolution_ID)
        var sel = document.createElement('select'); sel.id = 'tf-' + f.fieldId; sel.style.cssText = INP;
        var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— pick the outcome —'; sel.appendChild(o0);
        pl.resolutions.forEach(function (r) { var o = document.createElement('option'); o.value = r.id; o.textContent = r.name; sel.appendChild(o); });
        row.appendChild(sel); s.get = function () { return sel.value; }; s.ok = function () { return sel.value !== ''; };
      } else if (f.component === 'MATERIAL') {   // Material used: optional product + quantity (M_ProductSpent_ID, QtySpent)
        var ps = document.createElement('select'); ps.id = 'tf-' + f.fieldId + '-product'; ps.style.cssText = INP;
        var p0 = document.createElement('option'); p0.value = ''; p0.textContent = '— none —'; ps.appendChild(p0);
        pl.materials.forEach(function (m) { var o = document.createElement('option'); o.value = m.id; o.textContent = m.name + (m.uom ? ' (' + m.uom + ')' : ''); ps.appendChild(o); });
        var qn = _el('input', INP + ';margin-top:6px'); qn.type = 'number'; qn.min = '0'; qn.step = 'any'; qn.id = 'tf-' + f.fieldId + '-qty'; qn.placeholder = 'quantity used';
        row.appendChild(ps); row.appendChild(qn);
        s.get = function () { var q = parseFloat(qn.value); return ps.value === '' ? null : { product: ps.value, qty: q }; };
        s.ok = function () { return true; };
        s.valid = function () { var q = parseFloat(qn.value); return ps.value === '' ? qn.value.trim() === '' : (isFinite(q) && q > 0); };   // material marker: a product needs a quantity > 0; a quantity needs a product
      } else if (f.component === 'CHECKLIST') {   // one tick per line, in the order of the task's checklist
        var boxes = pl.checklist.map(function (line, i) {
          var lab = _el('label', 'display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px;'), c = document.createElement('input');
          c.type = 'checkbox'; c.id = 'tf-' + f.fieldId + '-' + i; c.style.cssText = 'width:26px;height:26px;flex:none;'; lab.setAttribute('data-check', String(i));
          lab.appendChild(c); lab.appendChild(document.createTextNode(line)); row.appendChild(lab); return c; });
        s.get = function () { return pl.checklist.map(function (line, i) { return { text: line, done: !!boxes[i].checked }; }); };   // R5 marker
        s.ok = function () { return true; };
      } else {   // QR_CHECKLIST: a scan-or-type code
        var q = _el('input', INP); q.type = 'text'; q.id = 'tf-' + f.fieldId; q.placeholder = 'scan or type the code'; row.appendChild(q);
        s.get = function () { return q.value.trim(); }; s.ok = function () { return q.value.trim() !== ''; };
      }
      state[f.fieldId] = s; host.appendChild(row);
    });
    console.log('§TASK_FORM type=' + (hooks.typeId || '?') + ' fields=' + pl.fields_n + ' rendered=' + pl.rendered + ' unsupported=' + pl.unsupported + ' builtin=' + pl.builtin +
      ' resolutions=' + pl.resolutions.length + ' checklist=' + pl.checklist.length + ' materials=' + pl.materials.length);
    return {
      // the plain answers (fieldId -> value); the built-in Outcome / Material / Checklist are NOT in here, they go back as report fields (shape())
      collect: function () { var a = {}; pl.fields.forEach(function (f) { if (state[f.fieldId] && !(pl.builtin && BUILTIN_ONLY[f.component])) a[f.fieldId] = state[f.fieldId].get(); }); return a; },
      // the built-in form's report fields: resolution (R_Resolution id or null), checklist [{text,done}] in the task's order, spent {product, qty} or null
      shape: function () {
        var r = state.resolution, m = state.material, c = state.checklist;
        return { resolution: r && r.get() !== '' ? r.get() : null, checklist: c ? c.get() : [], spent: m ? m.get() : null };
      },
      // the required-field check. R3 marker: the loop below is what the red control removes.
      check: function () {
        var missing = [];
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (f.required && s && !s.ok()) missing.push(f.fieldId); });   // R3 marker
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (f.component === 'RESOLUTION' && s && !s.ok() && missing.indexOf(f.fieldId) < 0) missing.push(f.fieldId); });   // R4 marker: no Done without an outcome
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (s && s.valid && !s.valid()) missing.push(f.fieldId); });
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (s) s.node.style.outline = missing.indexOf(f.fieldId) >= 0 ? '2px solid #ef5350' : ''; });
        return { ok: missing.length === 0, missing: missing };
      },
      photoFiles: function () { return photos.slice(); }
    };
  }

  var api = { plan: plan, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TaskForm = api;
})(typeof window !== 'undefined' ? window : null);
