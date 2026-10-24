// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_defaults.js — the SYSTEM DEFAULT team setup (TEAMWORK_FRAMEWORK §13.8 T3).
 * Anyone can replace these in the Team panel with their own repo + key. The default points at a separate TRIAL repo with a
 * fine-grained, single-repo, expiring token: this file is public, so the key here must be worth nothing if copied.
 * `token` is empty until the maintainer creates that token (GitHub › Settings › Developer settings › Fine-grained tokens:
 * repository bim-teams-trial only, Contents read/write, with an expiry) and pastes it below. */
(function (g) {
  'use strict';
  g.TeamDefaults = { owner: 'red1oon', repo: 'bim-teams-trial', token: '', postbox: { url: '', secret: '' }, trialCycles: 1, trialOpCap: 60, focusTtlMs: 1800000 };
})(typeof window !== 'undefined' ? window : globalThis);
