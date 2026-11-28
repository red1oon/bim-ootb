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
// BUILT-IN basic form (a type with no form): TEXT "result" + MULTI_PHOTO "photos", nothing required — the same engine, the same answer shape.
// REQUIRED: validation.required refuses Done until the field is filled (TEXT non-blank, SAFETY_CHECKLIST ticked, MULTI_PHOTO >= 1 photo,
//        SIGNATURE drawn, QR_CHECKLIST non-blank). `check()` returns the missing fieldIds; the caller shows them and does not queue a report.
(function (root) {
  'use strict';
  var SUPPORTED = { TEXT: 1, SAFETY_CHECKLIST: 1, MULTI_PHOTO: 1, SIGNATURE: 1, QR_CHECKLIST: 1 };
  var BUILTIN = { window: { name: 'Task', tabs: [ { name: 'Result', fields: [
    { fieldId: 'result', name: 'Result', component: 'TEXT', sequence: 10 },
    { fieldId: 'photos', name: 'Photos', component: 'MULTI_PHOTO', sequence: 20 } ] } ] } };

  function _parse(form) {
    if (form == null) return null;
    if (typeof form === 'string') { try { return JSON.parse(form); } catch (e) { return null; } }
    return typeof form === 'object' ? form : null;
  }
  // plan(typeDef) -> { builtin, name, fields:[{fieldId,name,component,required,supported}], fields_n, rendered, unsupported }
  function plan(typeDef) {
    var f = _parse(typeDef && typeDef.form), builtin = false;
    var tabs = f && f.window && Array.isArray(f.window.tabs) ? f.window.tabs : null;
    if (!tabs) { f = BUILTIN; tabs = f.window.tabs; builtin = true; }
    var fields = [];
    tabs.forEach(function (t) { (t && Array.isArray(t.fields) ? t.fields : []).forEach(function (x) {
      if (!x || typeof x.fieldId !== 'string' || !x.fieldId) return;
      fields.push({ fieldId: x.fieldId, name: String(x.name || x.fieldId), component: String(x.component || ''), sequence: +x.sequence || 0,
        required: !!(x.validation && x.validation.required), supported: !!SUPPORTED[x.component] });
    }); });
    fields.sort(function (a, b) { return a.sequence - b.sequence; });
    var unsupported = fields.filter(function (x) { return !x.supported; }).length;
    return { builtin: builtin, name: (f.window && f.window.name) || 'Task', fields: fields, fields_n: fields.length, rendered: fields.length - unsupported, unsupported: unsupported };
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
      var label = _el('div', 'font-size:14px;color:#ccc;margin-bottom:4px;', f.name + (f.required && f.supported ? ' *' : '')); row.appendChild(label);
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
      } else {   // QR_CHECKLIST: a scan-or-type code
        var q = _el('input', INP); q.type = 'text'; q.id = 'tf-' + f.fieldId; q.placeholder = 'scan or type the code'; row.appendChild(q);
        s.get = function () { return q.value.trim(); }; s.ok = function () { return q.value.trim() !== ''; };
      }
      state[f.fieldId] = s; host.appendChild(row);
    });
    console.log('§TASK_FORM type=' + (hooks.typeId || '?') + ' fields=' + pl.fields_n + ' rendered=' + pl.rendered + ' unsupported=' + pl.unsupported + ' builtin=' + pl.builtin);
    return {
      collect: function () { var a = {}; pl.fields.forEach(function (f) { if (state[f.fieldId]) a[f.fieldId] = state[f.fieldId].get(); }); return a; },
      // the required-field check. R3 marker: the loop below is what the red control removes.
      check: function () {
        var missing = [];
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (f.required && s && !s.ok()) missing.push(f.fieldId); });   // R3 marker
        pl.fields.forEach(function (f) { var s = state[f.fieldId]; if (s) s.node.style.outline = missing.indexOf(f.fieldId) >= 0 ? '2px solid #ef5350' : ''; });
        return { ok: missing.length === 0, missing: missing };
      },
      photoFiles: function () { return photos.slice(); }
    };
  }

  var api = { plan: plan, mount: mount, BUILTIN: BUILTIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TaskForm = api;
})(typeof window !== 'undefined' ? window : null);
