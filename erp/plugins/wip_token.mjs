// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// wip_token.mjs — C-3 witness bundle (prompts/PLUGIN_SYSTEM_LANE.md §Phase C).
// Contributes ONE GL token into the post_resolver token map (a plain object): {Production.WIP} → the REAL
// Work-In-Process account, EXTRACTED from the seed (c_elementvalue), never invented. The bundle reads the
// account via ctx.db.query (read-only host glue) at activate time and binds the token to what it found.
export const manifest = {
  id: 'com.example.wip-token',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  contributions: { token: { module: 'self' } }
};

export async function activate(ctx) {
  // EXTRACT, DON'T INVENT — resolve the natural WIP account straight from the seed's chart of accounts.
  var rows = ctx.db.query(
    "SELECT c_elementvalue_id AS id, value, name FROM c_elementvalue " +
    "WHERE lower(name)='work in process' ORDER BY c_elementvalue_id LIMIT 1"
  );
  var acct = rows && rows[0] ? rows[0] : null;
  // Contribute into the post_resolver token map. We carry the resolved row so the POST verb (and the
  // witness) can read the account without a second lookup; absence is reported, never synthesized.
  ctx.postTokens['{Production.WIP}'] = {
    table: 'c_elementvalue', col: 'c_elementvalue_id', keyCol: 'name',
    resolved: acct,
    absent: acct ? null : 'no Work In Process account in seed'
  };
}

export async function deactivate(ctx) {
  if (ctx.postTokens) delete ctx.postTokens['{Production.WIP}'];
}
