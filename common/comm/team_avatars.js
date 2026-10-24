// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_avatars.js — the built-in avatar set of team mode (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15.15.2). Witness: W-AVATARS, W-AVATAR-TRAVEL.
 * 24 flat, colourful "personality head" avatars, GENERATED here from one small parameter table (background, skin, shirt, hair style+colour, eyes, mouth, accessory) —
 * nothing is fetched and nothing user-supplied is ever rendered: only an id from THIS set is drawn, any other id falls back to the person's deterministic default.
 *   ids('a01'..'a24') · svg(id, px) → '<svg …>' string · defaultFor(personUu) → id (pure hash) · valid(id) · resolve(id, personUu) → id to draw
 *   stack(list, max=STACK_MAX) → { shown, more } (the "5 heads then +N" rule) · params(id) → the parameter tuple (for the witness)
 * Pure, deterministic, host-neutral (ERP and Modeller share it). */
(function (global) {
  'use strict';
  var STACK_MAX = 5;
  // hair colours / skin tones / backgrounds are named so the table below reads as design, not magic numbers
  var SKIN = { s1: '#ffdbb5', s2: '#f1c27d', s3: '#e0a370', s4: '#c68642', s5: '#8d5524', s6: '#5c3a21' };
  var P = [   // [bg, skin, shirt, hairStyle, hairColour, eyes, mouth, accessory]
    ['#ffd166', 's2', '#ef476f', 'short',    '#3b2a20', 'dots',   'smile',   'glasses'],
    ['#06d6a0', 's5', '#118ab2', 'afro',     '#1c1410', 'happy',  'grin',    'none'],
    ['#ef476f', 's1', '#073b4c', 'long',     '#d9822b', 'dots',   'smile',   'earring'],
    ['#118ab2', 's3', '#ffd166', 'bun',      '#2b1d14', 'wink',   'smirk',   'none'],
    ['#8ecae6', 's4', '#e76f51', 'curly',    '#3a2418', 'wide',   'open',    'none'],
    ['#f4a261', 's1', '#2a9d8f', 'none',     '#000000', 'dots',   'smile',   'headscarf'],
    ['#b5e48c', 's6', '#6a4c93', 'buzz',     '#0d0a08', 'dots',   'neutral', 'beard'],
    ['#cdb4db', 's2', '#264653', 'bob',      '#1b1b1b', 'happy',  'smile',   'none'],
    ['#ffafcc', 's3', '#3a86ff', 'spiky',    '#e63946', 'wide',   'grin',    'none'],
    ['#a8dadc', 's5', '#f77f00', 'bald',     '#000000', 'dots',   'smirk',   'sunglasses'],
    ['#ffe5a0', 's1', '#8338ec', 'ponytail', '#7b3f1d', 'wink',   'smile',   'freckles'],
    ['#90be6d', 's4', '#f94144', 'side',     '#241913', 'dots',   'smile',   'mustache'],
    ['#ff9f1c', 's2', '#2ec4b6', 'none',     '#000000', 'sleepy', 'smile',   'beanie'],
    ['#bde0fe', 's6', '#ffb703', 'curly',    '#0f0b09', 'happy',  'grin',    'glasses'],
    ['#e5989b', 's3', '#355070', 'long',     '#2b1d14', 'dots',   'neutral', 'none'],
    ['#43aa8b', 's1', '#f9c74f', 'short',    '#b8691b', 'wide',   'open',    'cap'],
    ['#577590', 's5', '#f8f9fa', 'buzz',     '#17110d', 'happy',  'smile',   'stubble'],
    ['#f9c74f', 's4', '#9d4edd', 'bun',      '#1d140f', 'dots',   'smile',   'glasses'],
    ['#ff6b6b', 's2', '#1b4965', 'spiky',    '#2e2118', 'wink',   'grin',    'none'],
    ['#4cc9f0', 's3', '#f72585', 'bob',      '#6b3a1f', 'dots',   'smirk',   'earring'],
    ['#ffd6a5', 's6', '#0077b6', 'none',     '#000000', 'happy',  'smile',   'headscarf'],
    ['#caffbf', 's1', '#7209b7', 'afro',     '#5a3a1e', 'wide',   'grin',    'none'],
    ['#9bf6ff', 's4', '#d62828', 'side',     '#1a1410', 'sleepy', 'neutral', 'beard'],
    ['#fdffb6', 's5', '#3a0ca3', 'ponytail', '#0e0a07', 'dots',   'smile',   'sunglasses']
  ];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var IDS = P.map(function (_, i) { return 'a' + pad(i + 1); });
  var BY = {}; IDS.forEach(function (id, i) { BY[id] = i; });
  function params(id) { var r = P[BY[id]]; return r ? { bg: r[0], skin: SKIN[r[1]], shirt: r[2], hair: r[3], hairColour: r[4], eyes: r[5], mouth: r[6], acc: r[7] } : null; }
  function valid(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY, id); }
  // pure 32-bit FNV-1a over the person uuid → index; the same person gets the same avatar on every device with no message
  function defaultFor(personUu) { var h = 2166136261, s = String(personUu || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return IDS[h % IDS.length]; }
  function resolve(id, personUu) { return valid(id) ? id : defaultFor(personUu); }

  function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = Math.max(0, Math.min(255, ((n >> 16) & 255) + k)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + k)), b = Math.max(0, Math.min(255, (n & 255) + k)); return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }
  // hair pieces drawn BEHIND the head and IN FRONT of it (64x64 box; head ellipse centre (32,30) rx 12 ry 13.5)
  function hairBack(s, c) {
    switch (s) {
      case 'long': return '<path d="M17 31C13 11 51 11 47 31L50 54L14 54Z" fill="' + c + '"/>';
      case 'bob': return '<path d="M17 32C14 11 50 11 47 32L46 43L18 43Z" fill="' + c + '"/>';
      case 'afro': return '<circle cx="32" cy="25" r="18" fill="' + c + '"/>';
      case 'ponytail': return '<path d="M44 26C54 28 56 40 49 48C50 40 47 34 43 32Z" fill="' + c + '"/>';
      case 'bun': return '<circle cx="32" cy="10.5" r="5.5" fill="' + c + '"/>';
      default: return '';
    }
  }
  function hairFront(s, c) {
    switch (s) {
      case 'short': case 'long': case 'bob': case 'bun': case 'ponytail': return '<path d="M19.5 29C18 14 46 14 44.5 29C42 22.5 36.5 20 32 20C27.5 20 22 22.5 19.5 29Z" fill="' + c + '"/>';
      case 'side': return '<path d="M19.5 29C17 13 47 13 44.5 28C40 24 32 23 25 19C23 24 21 26 19.5 29Z" fill="' + c + '"/>';
      case 'spiky': return '<path d="M19.5 28L19 15L25 21L28 11L32 20L36 11L39 21L45 15L44.5 28C41 23 23 23 19.5 28Z" fill="' + c + '"/>';
      case 'buzz': return '<path d="M20.5 27C20 16 44 16 43.5 27C41 22.5 23 22.5 20.5 27Z" fill="' + c + '" opacity=".85"/>';
      case 'curly': return '<g fill="' + c + '"><circle cx="22" cy="21" r="6"/><circle cx="29" cy="16" r="6.5"/><circle cx="37" cy="16" r="6.5"/><circle cx="43" cy="21" r="6"/><circle cx="19.5" cy="28" r="4.5"/><circle cx="44.5" cy="28" r="4.5"/></g>';
      case 'afro': return '<path d="M20 29C19 18 45 18 44 29C41 24 23 24 20 29Z" fill="' + c + '"/>';
      default: return '';
    }
  }
  function eyes(k) {
    var L = 27, R = 37, y = 31, ink = '#2b2b2b';
    switch (k) {
      case 'happy': return '<path d="M24.5 31.5Q27 28.5 29.5 31.5M34.5 31.5Q37 28.5 39.5 31.5" fill="none" stroke="' + ink + '" stroke-width="1.8" stroke-linecap="round"/>';
      case 'wide': return '<g><circle cx="' + L + '" cy="' + y + '" r="3" fill="#fff"/><circle cx="' + R + '" cy="' + y + '" r="3" fill="#fff"/><circle cx="' + L + '" cy="' + y + '" r="1.6" fill="' + ink + '"/><circle cx="' + R + '" cy="' + y + '" r="1.6" fill="' + ink + '"/></g>';
      case 'sleepy': return '<path d="M24.5 31H29.5M34.5 31H39.5" stroke="' + ink + '" stroke-width="1.8" stroke-linecap="round"/>';
      case 'wink': return '<circle cx="' + L + '" cy="' + y + '" r="1.7" fill="' + ink + '"/><path d="M34.5 31.5Q37 28.5 39.5 31.5" fill="none" stroke="' + ink + '" stroke-width="1.8" stroke-linecap="round"/>';
      default: return '<circle cx="' + L + '" cy="' + y + '" r="1.8" fill="' + ink + '"/><circle cx="' + R + '" cy="' + y + '" r="1.8" fill="' + ink + '"/>';
    }
  }
  function mouth(k) {
    var ink = '#7a2e2e';
    switch (k) {
      case 'grin': return '<path d="M27 36.5Q32 43 37 36.5Z" fill="#fff" stroke="' + ink + '" stroke-width="1.3" stroke-linejoin="round"/>';
      case 'open': return '<ellipse cx="32" cy="38.5" rx="3.2" ry="2.6" fill="#7a2e2e"/>';
      case 'neutral': return '<path d="M28.5 38H35.5" stroke="' + ink + '" stroke-width="1.7" stroke-linecap="round"/>';
      case 'smirk': return '<path d="M28.5 38.5Q33 40 36.5 36.5" fill="none" stroke="' + ink + '" stroke-width="1.7" stroke-linecap="round"/>';
      default: return '<path d="M27.5 37Q32 41.5 36.5 37" fill="none" stroke="' + ink + '" stroke-width="1.8" stroke-linecap="round"/>';
    }
  }
  function acc(a, hairC, skin) {
    switch (a) {
      case 'glasses': return '<g fill="none" stroke="#333" stroke-width="1.4"><circle cx="27" cy="31" r="4.4"/><circle cx="37" cy="31" r="4.4"/><path d="M31.4 31H32.6"/></g>';
      case 'sunglasses': return '<g fill="#222"><rect x="22" y="28" width="9.5" height="6" rx="2.6"/><rect x="32.5" y="28" width="9.5" height="6" rx="2.6"/><rect x="30" y="29.2" width="4" height="1.4"/></g><path d="M23.5 29.5L27 29" stroke="#ffffff55" stroke-width="1"/>';
      case 'beard': return '<path d="M20 33C20 46 44 46 44 33C43 41 38 43 32 43C26 43 21 41 20 33Z" fill="' + hairC + '"/>';
      case 'stubble': return '<path d="M20.5 34C21 44 43 44 43.5 34C41 41 37 42 32 42C27 42 23 41 20.5 34Z" fill="' + hairC + '" opacity=".35"/>';
      case 'mustache': return '<path d="M26 35.2Q29 33.2 32 35.2Q35 33.2 38 35.2Q35 37 32 36Q29 37 26 35.2Z" fill="' + hairC + '"/>';
      case 'freckles': return '<g fill="#b86f4a" opacity=".75"><circle cx="25" cy="35" r=".8"/><circle cx="27.5" cy="36" r=".8"/><circle cx="36.5" cy="36" r=".8"/><circle cx="39" cy="35" r=".8"/></g>';
      case 'earring': return '<g fill="#ffd700"><circle cx="19.6" cy="35" r="1.6"/><circle cx="44.4" cy="35" r="1.6"/></g>';
      case 'cap': return '<path d="M19.5 26C19 11 45 11 44.5 26Z" fill="#e63946"/><path d="M33 24C40 23 50 24 51 27C46 28 40 27 33 27Z" fill="#c1121f"/>';
      case 'beanie': return '<path d="M19 26C18 8 46 8 45 26Z" fill="#ff6b35"/><rect x="18.5" y="23.5" width="27" height="4.5" rx="2" fill="#ffd166"/><circle cx="32" cy="9" r="2.6" fill="#ffd166"/>';
      case 'headscarf': return '<path d="M32 12C20 12 15.5 22 17 34C17.5 40 20 46 24 48L40 48C44 46 46.5 40 47 34C48.5 22 44 12 32 12Z" fill="#ffffff" opacity="0"/><path d="M32 11.5C19.5 11.5 14.5 22 16 35C16.8 42 20 48 26 50L38 50C44 48 47.2 42 48 35C49.5 22 44.5 11.5 32 11.5ZM32 20C26 20 21.5 24 21.2 30C21 36 25 44 32 44C39 44 43 36 42.8 30C42.5 24 38 20 32 20Z" fill="#5f6caf" fill-rule="evenodd"/>';
      default: return '';
    }
  }
  var uid = 0;
  function svg(id, px) {
    var p = params(valid(id) ? id : IDS[0]), size = px || 40, n = ++uid, cid = 'tav' + n;
    var skinDark = shade(p.skin, -22), hairC = p.hairColour;
    var scarf = p.acc === 'headscarf';
    var s = '<svg xmlns="http://www.w3.org/2000/svg" class="tp-av" data-avatar="' + (valid(id) ? id : IDS[0]) + '" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-hidden="true">' +
      '<defs><clipPath id="' + cid + '"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#' + cid + ')">' +
      '<rect width="64" height="64" fill="' + p.bg + '"/>' +
      (scarf ? '' : hairBack(p.hair, hairC)) +
      '<path d="M6 66C6 53 17 47.5 32 47.5C47 47.5 58 53 58 66Z" fill="' + p.shirt + '"/>' +
      '<rect x="27.5" y="38" width="9" height="11" rx="3" fill="' + skinDark + '"/>' +
      (scarf ? acc('headscarf') : '') +
      '<ellipse cx="32" cy="30" rx="12" ry="13.5" fill="' + p.skin + '"/><ellipse cx="19.8" cy="31" rx="2" ry="3" fill="' + p.skin + '"/><ellipse cx="44.2" cy="31" rx="2" ry="3" fill="' + p.skin + '"/>' +
      (scarf ? '' : hairFront(p.hair, hairC)) +
      '<path d="M24 26.5Q27 24.8 30 26.2M34 26.2Q37 24.8 40 26.5" fill="none" stroke="' + (scarf ? '#3a2a20' : shade(hairC, 20)) + '" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>' +
      eyes(p.eyes) + '<path d="M32 32.5L31 35.5L33 35.5" fill="none" stroke="' + skinDark + '" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' + mouth(p.mouth) +
      (scarf ? '' : acc(p.acc, hairC, p.skin)) + '</g></svg>';
    return s;
  }
  function stack(list, max) { var m = max == null ? STACK_MAX : max; list = list || []; return { shown: list.slice(0, m), more: Math.max(0, list.length - m) }; }

  var API = { ids: function () { return IDS.slice(); }, svg: svg, defaultFor: defaultFor, valid: valid, resolve: resolve, stack: stack, params: params, STACK_MAX: STACK_MAX };
  global.TeamAvatars = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
