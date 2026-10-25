// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// team_trust.js — the trust anchor for compiled team plans (TEAMWORK_FRAMEWORK §28, §32). The list of PUBLIC keys (ECDSA P-256 JWK: kty crv x y) whose signature a plan must carry.
// EMPTY BY DEFAULT: with no key, plans are used unsigned exactly as before. A deployment, an embedding page or a test sets window.TEAM_PLAN_TRUST BEFORE this file loads; this file never overwrites it.
// Phase B (not built, needs the comm engine): the list is pinned in the space genesis and set from there.
window.TEAM_PLAN_TRUST = window.TEAM_PLAN_TRUST || [];
