// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_json.js - the JSON binding of the ADInterface web service (bim-compiler prompts/ERP_WS_API.md S4). Legacy serves the SAME ModelADService as JSON (Content-Type/Accept: application/json,
//   the JAXB JSON mapping: attributes as "@name", repeated elements as arrays, typed values), so the "AI-friendly door" is not a second API: this module only translates the wire; the SAME
//   engine (ws_adinterface.js) answers. Observed on the pilot (W-WS-DIFF-JSON): {"WindowTabData":{"@NumRows":1,...,"DataSet":{"DataRow":{"field":[{"@column":..,"val":..}]}},"RowCount":1,"Success":true}}.
// Pure. toXml(jsonText) -> request XML; toJson(xml, typeOf) -> JSON text. typeOf(table, column) -> 'int'|'dec'|'bool'|'ts'|'str' types numbers the way the Java class does.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WsJson = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // JSON -> XML (request side): {"A":{"@x":1,"B":"t","C":[{..},{..}]}} -> <A x="1"><B>t</B><C>..</C><C>..</C></A>
  function node(name, v) {
    if (Array.isArray(v)) return v.map(function (i) { return node(name, i); }).join('');
    if (v === null || v === undefined) return '<' + name + '/>';
    if (typeof v !== 'object') return '<' + name + '>' + esc(v) + '</' + name + '>';
    var attrs = '', inner = '';
    Object.keys(v).forEach(function (k) { if (k.charAt(0) === '@') attrs += ' ' + k.slice(1) + '="' + esc(v[k]) + '"'; else inner += node(k, v[k]); });
    return '<' + name + attrs + (inner ? '>' + inner + '</' + name + '>' : '/>');
  }
  function toXml(jsonText) {
    var o = JSON.parse(jsonText), root = Object.keys(o)[0];
    return '<?xml version="1.0" encoding="UTF-8"?>' + node(root, o[root]).replace(/^<(\w+)/, '<$1 xmlns="http://idempiere.org/ADInterface/1_0"');
  }
  // tiny XML reader for OUR responses (well-formed, no mixed content)
  function parse(xml) {
    var re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g, stack = [{ children: [] }], m;
    xml = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
    while ((m = re.exec(xml))) {
      if (m[5] !== undefined) { var t = m[5]; if (t.trim() === '' && stack[stack.length - 1].children.length) continue; stack[stack.length - 1].text = (stack[stack.length - 1].text || '') + t; continue; }
      if (m[1]) { stack.pop(); continue; }
      var n = { name: m[2].replace(/^\w+:/, ''), attrs: {}, children: [], text: '' };
      (m[3].match(/[\w:.-]+="[^"]*"/g) || []).forEach(function (a) { var i = a.indexOf('='); var k = a.slice(0, i); if (/^xmlns/.test(k)) return; n.attrs[k.replace(/^\w+:/, '')] = a.slice(i + 2, -1); });
      stack[stack.length - 1].children.push(n); if (!m[4]) stack.push(n);
    }
    return stack[0].children[0];
  }
  function unesc(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  function typed(kind, s) { s = unesc(s); if (kind === 'int' || kind === 'dec') { var n = Number(s); return isFinite(n) && s.trim() !== '' ? n : s; } return s; }
  var INT_ATTR = { NumRows: 1, TotalRows: 1, StartRow: 1, RecordID: 1 }, BOOL_ATTR = { IsError: 1, IsReport: 1, IsRolledBack: 1 };
  function conv(n, ctx) {
    var o = {};
    Object.keys(n.attrs).forEach(function (k) {
      var v = n.attrs[k];
      if (INT_ATTR[k]) o['@' + k] = Number(v); else if (BOOL_ATTR[k]) o['@' + k] = v === 'true';
      else if (k === 'value' && n.name === 'outputField') o['@value'] = typed(ctx.typeOf(ctx.table, n.attrs.column), v);
      else o['@' + k] = unesc(v);
    });
    var groups = {}, order = [];
    n.children.forEach(function (c) { (groups[c.name] = groups[c.name] || []).push(c); if (order.indexOf(c.name) < 0) order.push(c.name); });
    order.forEach(function (name) {
      var arr = groups[name].map(function (c) {
        if (name === 'val') { if (c.attrs.nil === 'true') return { '@nil': true }; return typed(ctx.typeOf(ctx.table, ctx.column), c.text || ''); }
        if (name === 'field') ctx.column = c.attrs.column;
        return conv(c, ctx);
      });
      o[name] = arr.length === 1 && name !== 'outputField' && name !== 'field' ? arr[0] : (arr.length === 1 ? arr[0] : arr);   // JAXB-JSON: a single child is an object, several are an array (observed: DataRow, field, outputField)
    });
    if (!n.children.length && !Object.keys(n.attrs).length) return unesc(n.text || '');
    if (!n.children.length && n.text) o['$'] = unesc(n.text);
    return o;
  }
  function toJson(xml, typeOf, table) {
    var root = parse(xml), ctx = { typeOf: typeOf || function () { return 'str'; }, table: table, column: null }, body = {};
    var out = conv(root, ctx);
    if (root.name === 'WindowTabData' && !root.children.some(function (c) { return c.name === 'Error'; })) {   // the JSON mapping adds RowCount/Success beside the data (observed)
      var nr = Number(root.attrs.NumRows || 0); out.RowCount = nr; out.Success = root.children.some(function (c) { return c.name === 'DataSet'; });   // observed: Success = a DataSet came back (an empty query is true, a missing record is false)
    }
    if (typeof out !== 'object') out = {};
    body[root.name] = out; return JSON.stringify(body);
  }
  return { toXml: toXml, toJson: toJson, parse: parse };
});
