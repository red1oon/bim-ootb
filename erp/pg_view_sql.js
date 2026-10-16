// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// pg_view_sql.js - ONE translator of a legacy Postgres VIEW definition into SQLite (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §24).
//   Used by the core view generator (patches/build_views_patch.py calls it through node) and by Pack In for a plugin's CREATE VIEW statements, so core and
//   plugin views are translated by the same rules: PG casts stripped (SQLite is dynamically typed), = ANY(ARRAY[..]) -> IN (..), <> ALL(ARRAY[..]) -> NOT IN (..),
//   ' / ' -> ' * 1.0 / ' (PG numeric division is exact; SQLite divides two whole numbers as INTEGERS), the 'adempiere.' schema prefix dropped (one schema here).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PgViewSql = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TYPES = '(?:character varying|timestamp without time zone|timestamp with time zone|bpchar|numeric|text|integer|bigint|smallint|date|char)';
  var CAST = new RegExp('::' + TYPES + '(?:\\(\\d+(?:,\\s*\\d+)?\\))?(?:\\[\\])?', 'g');
  var ARR = '\\(\\s*(?:\\(ARRAY\\[([\\s\\S]*?)\\]\\)|ARRAY\\[([\\s\\S]*?)\\])\\s*\\)';
  // translate(body): the build_views_patch.translate rules, in the same order
  function translate(sql) {
    var s = String(sql).replace(CAST, '');
    s = s.replace(new RegExp('=\\s*ANY\\s*' + ARR, 'g'), function (m, a, b) { return 'IN (' + (a || b) + ')'; });
    s = s.replace(new RegExp('<>\\s*ALL\\s*' + ARR, 'g'), function (m, a, b) { return 'NOT IN (' + (a || b) + ')'; });
    return s.split(' / ').join(' * 1.0 / ');
  }
  function unschema(s) { return String(s).replace(/\badempiere\./gi, ''); }
  // statements(text): a legacy SQLStatement that defines views ("DROP VIEW ..; CREATE OR REPLACE VIEW .. AS ..; ALTER TABLE .. OWNER TO ..") split into
  //   [{ kind: 'drop'|'create'|'pgonly', name, sql }] with the SQLite form in sql (pgonly = Postgres catalog housekeeping with no SQLite meaning: OWNER, GRANT, COMMENT).
  function statements(text) {
    return String(text).split(/;\s*\n/).map(function (p) { return p.trim().replace(/;\s*$/, ''); }).filter(Boolean).map(function (p) {
      var c = /^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:\w+\.)?(\w+)\s+AS\s+([\s\S]*)$/i.exec(p);
      if (c) return { kind: 'create', name: c[1].toLowerCase(), sql: 'CREATE VIEW ' + c[1].toLowerCase() + ' AS ' + translate(unschema(c[2])) };
      var d = /^DROP\s+VIEW\s+(IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/i.exec(p);
      if (d) return { kind: 'drop', name: d[2].toLowerCase(), sql: 'DROP VIEW IF EXISTS ' + d[2].toLowerCase() };
      return { kind: 'pgonly', name: null, sql: p };
    });
  }
  function isViewStatement(text) { return /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:\w+\.)?\w+\s+AS/i.test(String(text)); }
  return { translate: translate, unschema: unschema, statements: statements, isViewStatement: isViewStatement };
});
