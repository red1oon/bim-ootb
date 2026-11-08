// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// Shared JS tokenizer (one implementation, used by gen_viewer_actions.js and gen_app_surface.js).
// scan(src) -> { code, mask }: `code` = src with comments blanked; `mask` = code with string/regex
// bodies also blanked. Length and newlines preserved, so offsets and line numbers match the file.
// Single pass in reading order (strings, regex literals, `//`, `/* */`), so a `/*` inside a `//`
// line comment cannot open a block comment (NEURO contract §19.2).
'use strict';
const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|new|else)$/;
function scan(src) {
  const code = src.split(''), mask = src.split('');
  const blank = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  let i = 0; const n = src.length; const tpl = []; let depth = 0;
  let lastSig = '';  // last significant code text (for regex detection)
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; blank(code, i, j); blank(mask, i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(code, i, j); blank(mask, i, j); i = j; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(mask, i + 1, j); i = j + 1; lastSig = 'x'; continue;
    }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === '}') tpl.pop();
      let j = i + 1;
      while (j < n && src[j] !== '`') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') break; j++; }
      blank(mask, i + 1, j);
      if (src[j] === '$') { tpl.push(depth); i = j + 2; } else { i = j + 1; }
      lastSig = 'x'; continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, i - 12), i).replace(/\s+$/, '');
      if (before === '' || REGEX_PREV.test(before) || REGEX_KW.test(before)) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
        blank(mask, i + 1, j); i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; lastSig = 'x'; continue;
      }
    }
    if (c === '{') depth++; else if (c === '}') depth--;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return { code: code.join(''), mask: mask.join('') };
}

module.exports = { scan };
