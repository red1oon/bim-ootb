// BIM OOTB — ERP. SPDX-License-Identifier: MIT
// seed_key.js — the ONE owner of the IndexedDB key under which the bundled ERP seed (ad_seed.db) is cached
// (store erp_cache/blobs). SEAM_IDENTITY_AUDIT F10: this was a literal at ~9 sites bumped by hand. Bump the
// version HERE ONLY (forces returning users to re-fetch the seed). Loaded before first use in erp.html + idempiere.html.
(function (g) {
  'use strict';
  var KEY = 'ad_seed_v18';
  g.ERP_SEED_KEY = KEY;
  if (typeof module !== 'undefined' && module.exports) module.exports = KEY;
})(typeof window !== 'undefined' ? window : globalThis);
