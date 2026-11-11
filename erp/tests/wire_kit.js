// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — wire_kit.js: the part of the §WIRE witnesses every source shares (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §WIRE-SPEC). READ THE LOG: §WIRE-* lines. It holds NO expected value:
//   the expected numbers come from each witness's oracle (independent SQL on the legacy DB / the raw mock rows). It drives the REAL form module the way idempiere.html renderGenericForm does:
//   AF.read(withT, trx => desc.rows(trx, params, current)) = the summary; AF.execute = Process (stage 1); AF.executeAfter = stage 2.
//   steps(): the guide's steps for a source, each printed WITNESSED or UNWITNESSED (a step nothing asserted is never counted).
'use strict';
var path = require('path'), url = require('url');
module.exports = function (o) {
  var AF = o.AF, k = o.k, q = o.q, say = o.say, check = o.check, ERP = o.ERP;
  var sections = {};
  function sheetRows(rs) { return rs.filter(function (r) { return r.key > 100 && r.key < 900; }); }
  function problems(rs) { return rs.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }); }
  function infos(rs) { return rs.filter(function (r) { return /^ℹ/.test(r.item); }).map(function (r) { return r.item; }); }
  return {
    sheetRows: sheetRows, problems: problems, infos: infos,
    withT: function (S, loginDate) { return function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); }; },
    // the summary exactly as the page asks for it (a READ transaction the engine throws away)
    read: function (S, loginDate, cls, files, current) { var D = AF.get(cls), withT = this.withT(S, loginDate); return AF.read(withT, function (trx) { return D.rows(trx, files, current); }); },
    execute: function (S, loginDate, cls, files, current) { var r = AF.execute(this.withT(S, loginDate), cls, files, current || []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'wire' }); return r; },
    after: function (S, loginDate, cls, files, current) { var r = AF.executeAfter(this.withT(S, loginDate), cls, files, current || []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'wire' }); return r; },
    // the bundle is on the registry and its dictionary is in the tenant: form row names the class the engine has, the menu leaf opens it, the login role has access
    plug: async function (reg, tag, file, bundleId, formId, cls, menuName) {
      var st = null, err = null;
      try { await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', file)).href)); st = await reg.startBundle(bundleId); } catch (e) { err = e && (e.stack || e.message); }
      check(tag, 'plug-starts', 'the real bundle ' + file + ' installs and starts ACTIVE on the plugin registry', !!st && st.state === 'ACTIVE', { st: st, err: err });
      var F = q('SELECT classname AS c, name AS n FROM ad_form WHERE ad_form_id=?', [formId])[0], M = q('SELECT action AS a, ad_form_id AS f, name AS n FROM ad_menu WHERE ad_menu_id=?', [formId])[0];
      var A = q('SELECT count(*) AS n FROM ad_form_access WHERE ad_form_id=? AND ad_role_id IN (0,102)', [formId])[0].n;
      check(tag, 'plug-dictionary', 'AD_Form ' + formId + ' names the class the form engine has (' + cls + '), the menu leaf "' + menuName + '" opens it (action X), the System Administrator and GardenWorld Admin roles have access', !!F && F.c === cls && !!AF.get(F.c) && !!M && M.a === 'X' && M.f === formId && M.n === menuName && A === 2, { F: F, M: M, A: A });
      return !!st && st.state === 'ACTIVE';
    },
    // a guide step: ok = true (asserted), false (asserted and failed), null (nothing asserts it: UNWITNESSED, printed, never counted as a pass)
    steps: function (tag, list) {
      var w = list.filter(function (s) { return s[2] === true; }).length, u = list.filter(function (s) { return s[2] === null; }), f = list.filter(function (s) { return s[2] === false; });
      list.forEach(function (s, i) { say('§WIRE-STEP ' + tag + ' S' + (i + 1) + ' ' + (s[2] === true ? 'WITNESSED' : s[2] === false ? 'FAILED' : 'UNWITNESSED') + ' ' + s[0] + ' (' + s[1] + ')'); });
      say('§WIRE-STEPS ' + tag + ' N=' + list.length + ' witnessed=' + w + ' failed=' + f.length + ' UNWITNESSED=' + u.length + ' [' + u.map(function (s) { return s[0]; }).join('; ') + ']');
      return { n: list.length, witnessed: w, failed: f.length, unwitnessed: u.length };
    }
  };
};
