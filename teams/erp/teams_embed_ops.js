// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TeamsEmbedOps adapter (teams/ROADMAP.md §S9 follow-up — the gated embed's data feed).
//   PURPOSE: turn the LIVE iDempiere model into the canonical op shape the Teams folds read, with ZERO
//   invention. erp/teams_embed.js calls window.TeamsEmbedOps() and expects an array of canonical ops; this
//   file builds that array by JOINING a mockup `team_activity` overlay onto the REAL Application Dictionary
//   tables (AD_User → C_BPartner[IsEmployee] → ad_role; C_Project; real HHS IfcSpace room guids).
//
//   DATA MODEL (every canonical field traces to a real row — NON-INVENT, PRIME RULE):
//     author  ← AD_User.Name           (actor / login, via team_activity.ad_user_id)
//     role    ← ad_role.name           (via team_activity.ad_role_id; ad_user_roles is the live join)
//     target  ← team_activity.bim_guid (building lens: a REAL HHS room guid RM_Level_1_*)
//                 OR  'C_Project:'+Value (ERP-doc lens: the HHS_Office project)
//     project ← C_Project.Value        (organiser facet)
//     ts/verb/cls/params/branch ← team_activity (the seeded mockup metadata)
//
//   The `team_activity` table is MOCKUP metadata we inject into ERP.db (the team may work across the
//   intra-system ERPs AND across a building) — it carries ONLY foreign keys, never names; the names are
//   resolved live by the join, so a wrong/absent id shows honestly as `unlinked`, never a faked person.
//
//   Witness: teams/tests/poc_teams_embed_ops.js (W-EMBED-OPS) — folds the REAL ad_seed.db GardenWorld
//   employees over the REAL HHS_Office rooms through erp_optics.involvement + dot_layer.dotLayerModel.
//   Browser-safe (no node-only deps); read the log after every run (Log Mandate).
'use strict';
(function () {

  // ── the resolution JOIN — mockup team_activity × live AD model. Read-only; one statement. ──
  var SELECT_TEAM_OPS =
    'SELECT ta.id AS id, ta.ts AS ts, ta.verb AS verb, ta.cls AS cls, ' +
    '       ta.params AS params, ta.branch_id AS branch_id, ta.bim_guid AS bim_guid, ' +
    '       u.Name AS author_name, ' +
    '       bp.Name AS bp_name, bp.IsEmployee AS is_employee, ' +
    '       r.name AS role_name, ' +
    '       p.Value AS project_value, p.Name AS project_name ' +
    'FROM team_activity ta ' +
    'LEFT JOIN AD_User u    ON u.AD_User_ID = ta.ad_user_id ' +
    'LEFT JOIN C_BPartner bp ON bp.C_BPartner_ID = u.C_BPartner_ID ' +
    'LEFT JOIN ad_role r    ON r.ad_role_id = ta.ad_role_id ' +
    'LEFT JOIN C_Project p  ON p.C_Project_ID = ta.c_project_id ' +
    'ORDER BY ta.ts, ta.id';

  // mapRow(row) — one joined DB row → one canonical Teams op (the shape dot_layer/erp_optics read).
  //   NON-INVENT: author/role/project come straight from the join; an unresolved FK → `unlinked` flag set,
  //   author falls back to the literal '(unlinked user '+id+')' so it can NEVER masquerade as a real person.
  function mapRow(row) {
    var author = row.author_name;
    var unlinked = (author == null);
    // building lens wins when a real room guid is present; else the ERP-doc lens (C_Project).
    var target = row.bim_guid != null && row.bim_guid !== ''
      ? row.bim_guid
      : (row.project_value != null ? 'C_Project:' + row.project_value : null);
    var params = {};
    if (row.params) { try { params = JSON.parse(row.params) || {}; } catch (e) { params = {}; } }
    return {
      id: 'TA' + row.id,
      ts: typeof row.ts === 'number' ? row.ts : Number(row.ts),
      author: unlinked ? '(unlinked user ' + (row.author_name === undefined ? '?' : row.author_name) + ')' : author,
      role: row.role_name != null ? row.role_name : null,
      cls: row.cls || 'doc',
      verb: row.verb,
      target: target,
      branch: row.branch_id != null ? row.branch_id : null,
      params: params,
      project: row.project_value != null ? row.project_value : null,
      // provenance carried for the pane/blurb (employee BP, not invented):
      bp: row.bp_name != null ? row.bp_name : null,
      isEmployee: row.is_employee === 'Y',
      unlinked: unlinked
    };
  }

  // rowsFromExec(result) — normalise a sql.js db.exec() result block into {col:val} rows.
  function rowsFromExec(result) {
    if (!result || !result.length) return [];
    var cols = result[0].columns, vals = result[0].values, out = [];
    for (var i = 0; i < vals.length; i++) {
      var o = {}; for (var c = 0; c < cols.length; c++) o[cols[c]] = vals[i][c];
      out.push(o);
    }
    return out;
  }

  // buildOps(db) — run the join against a sql.js db and return canonical ops (NON-INVENT). Missing
  //   team_activity table → [] (honest empty, exactly like teams_embed.js's empty-state contract).
  function buildOps(db) {
    var res;
    try { res = db.exec(SELECT_TEAM_OPS); }
    catch (e) { return []; }                       // no team_activity overlay yet → empty
    return rowsFromExec(res).map(mapRow);
  }

  // ── SEED — inject the mockup team_activity overlay (FK-only) onto an existing ERP.db. ──
  //   ensureHhsProject(db, opt) — add the HHS_Office C_Project doc-anchor if absent (idempotent).
  function ensureHhsProject(db, opt) {
    opt = opt || {};
    var id = opt.c_project_id || 990001, value = opt.value || 'HHS_Office', name = opt.name || 'BIM: HHS Office';
    var ex = db.exec('SELECT C_Project_ID FROM C_Project WHERE Value=' + sqlStr(value));
    if (ex && ex.length) return rowsFromExec(ex)[0].C_Project_ID;   // already present → reuse
    db.run('INSERT INTO C_Project (C_Project_ID, Value, Name) VALUES (?,?,?)', [id, value, name]);
    return id;
  }

  // seedTeamActivity(db, rows) — (re)create team_activity and insert FK-only mockup rows. Each row:
  //   { ts, ad_user_id, ad_role_id, c_project_id, bim_guid?, verb, cls?, params?, branch_id? }.
  //   NON-INVENT: we store ONLY ids + the seeded verb/cls; every displayed name is resolved by the join.
  function seedTeamActivity(db, rows) {
    db.run('DROP TABLE IF EXISTS team_activity');
    db.run('CREATE TABLE team_activity (' +
      'id INTEGER PRIMARY KEY, ts INTEGER, ad_user_id INTEGER, ad_role_id INTEGER, ' +
      'c_project_id INTEGER, bim_guid TEXT, verb TEXT, cls TEXT, params TEXT, branch_id TEXT)');
    var i = 0;
    (rows || []).forEach(function (r) {
      db.run('INSERT INTO team_activity (id, ts, ad_user_id, ad_role_id, c_project_id, bim_guid, verb, cls, params, branch_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?)',
        [++i, r.ts, r.ad_user_id, r.ad_role_id == null ? null : r.ad_role_id,
         r.c_project_id == null ? null : r.c_project_id, r.bim_guid || null,
         r.verb, r.cls || 'doc', r.params ? JSON.stringify(r.params) : null,
         r.branch_id || null]);
    });
    return i;
  }

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // makeTeamsEmbedOps(getDb) — returns the function teams_embed.js wants on window.TeamsEmbedOps.
  //   getDb = () => the live sql.js ERP db (the same handle the ERP app already holds; we only READ it).
  function makeTeamsEmbedOps(getDb) {
    return function TeamsEmbedOps() {
      try { var db = (typeof getDb === 'function') ? getDb() : getDb; return db ? buildOps(db) : []; }
      catch (e) { return []; }                     // any read failure → honest empty (NON-INVENT)
    };
  }

  var API = {
    SELECT_TEAM_OPS: SELECT_TEAM_OPS,
    mapRow: mapRow, rowsFromExec: rowsFromExec, buildOps: buildOps,
    ensureHhsProject: ensureHhsProject, seedTeamActivity: seedTeamActivity,
    makeTeamsEmbedOps: makeTeamsEmbedOps
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else (typeof self !== 'undefined' ? self : this).TeamsEmbedOps_ = API;
})();
