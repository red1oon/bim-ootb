// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET AVATAR-LOD ENGINE (§AVATAR-LOD — P6, the "wow" LOD ladder over the presence
//   lens, 2026-07-01). Pure + deterministic + NON-INVENT: an avatar exists ONLY where a real signed check-in
//   (attendance.sessions) binds a real person to a real, member-RESOLVED zone with a real centroid. It carries
//   NO Three.js — it returns a PLAN (who / where / which LOD tier / hover-tip) that the browser renderer
//   (viewer/hba_avatars.js) turns into sprites. This split keeps the wow-logic node-witnessable. Read the log.
//
// SPEC (the ladder):
//   • avatarPlan(sessions, opts) — one avatar per PRESENT person per zone (dedup (employee,zone) → count matches
//       attendance.presenceByZone headcount), placed on a small deterministic RING around the zone centroid so N
//       people don't overlap. Skips a zone that does not resolve (opts.resolveZone) or has no centroid — non-invent.
//   • avatarLOD(distance, tiers) — camera→avatar distance picks the tier: FAR → 'dot', MID → 'mini' (small
//       billboard), NEAR → 'full' (avatar + name label + on-approach tip). Pure threshold function.
//   • avatarTip(avatar, profile, locale) — the watermarked hover card: name (AD_User) + image (C_BPartner.image,
//       a PLANNED field like M_Product.image) + zone + since + status. Never invents a person.
'use strict';
(function () {
  var TWO_PI = Math.PI * 2;

  // deterministic ring offset for the i-th of n avatars in a zone (n==1 → dead centre).
  function ringOffset(i, n, radius) {
    if (n <= 1) return { dx: 0, dz: 0 };
    var a = (TWO_PI * i) / n;
    return { dx: radius * Math.cos(a), dz: radius * Math.sin(a) };
  }

  // avatarPlan — fold folded presence SESSIONS (attendance.sessions) into avatar markers. NON-INVENT: only a real
  // (employee,zone) whose zone RESOLVES and has a CENTROID becomes an avatar. Dedup by (employee,zone) so the
  // avatar count per zone == presenceByZone headcount. opts = { resolveZone(zone)->bool, zoneCentroid(zone)->{x,y,z}|null,
  // ringRadius=0.6 }. Deterministic (sorted zones + employees; ring by index).
  function avatarPlan(sessions, opts) {
    opts = opts || {};
    var resolve = opts.resolveZone || function () { return true; };
    var centroid = opts.zoneCentroid || function () { return null; };
    var radius = (opts.ringRadius != null) ? opts.ringRadius : 0.6;
    var seen = Object.create(null), byZone = {};
    (sessions || []).forEach(function (s) {
      if (!s || !s.employee || !s.zone) return;
      var key = s.employee + '|' + s.zone; if (seen[key]) return; seen[key] = 1;
      if (!resolve(s.zone)) return;                      // non-invent: zone must resolve to a real element
      if (!centroid(s.zone)) return;                     // and have a real position
      (byZone[s.zone] = byZone[s.zone] || []).push(s);
    });
    var avatars = [];
    Object.keys(byZone).sort().forEach(function (zone) {
      var list = byZone[zone].slice().sort(function (a, b) { return a.employee < b.employee ? -1 : a.employee > b.employee ? 1 : 0; });
      var c = centroid(zone);
      list.forEach(function (s, i) {
        var off = ringOffset(i, list.length, radius);
        avatars.push({ id: s.employee + '@' + zone, employee: s.employee, zone: zone,
          pos: { x: c.x + off.dx, y: c.y, z: c.z + off.dz }, open: !!s.open, since: s.in || null, hours: (s.hours != null ? s.hours : null) });
      });
    });
    return avatars;
  }

  // avatarLOD — the ladder. FAR → dot, MID → mini avatar, NEAR → full avatar+label. Distances in model units (m).
  function avatarLOD(distance, tiers) {
    tiers = tiers || { full: 12, mini: 30 };
    if (distance == null || distance > tiers.mini) return 'dot';
    if (distance > tiers.full) return 'mini';
    return 'full';
  }

  // avatarTip — the watermarked hover/approach card. profile = { name, image } from AD_User / C_BPartner (image is
  // a PLANNED field, like M_Product.image; null until sourced). Never fabricates a name — falls back to the id.
  function avatarTip(avatar, profile, locale) {
    profile = profile || {};
    var wm = (locale === 'ms') ? 'CONTOH — TIDAK RASMI' : 'SAMPLE — NOT OFFICIAL';
    return { name: profile.name || avatar.employee, employee: avatar.employee, zone: avatar.zone,
      since: avatar.since, status: avatar.open ? 'present · checked in' : 'seen this period',
      imageRef: profile.image || null, _watermark: wm };
  }

  var Av = { avatarPlan: avatarPlan, avatarLOD: avatarLOD, avatarTip: avatarTip, ringOffset: ringOffset };
  if (typeof module === 'object' && module.exports) module.exports = Av;
  else (typeof self !== 'undefined' ? self : this).HbaAvatars = Av;
})();
