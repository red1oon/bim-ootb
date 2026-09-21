#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §MODULE_LOADS witness
 *
 * ISSUE IT PROVES OR DISPROVES: does every viewer module still finish LOADING? A statement at a
 * module's top level that reads an identifier which does not exist there throws at load, the module
 * never finishes, and the bake sits at `§IDLE_GATE park` forever — no error naming the cause, no
 * frame, no bytes.
 *
 * IT HAS ALREADY HAPPENED, 2026-09-20: `A.filmLayer = ...` was written at cinema_maxq.js's IIFE
 * scope, which has no `A` (every function inside opens with its own `var A = window.APP`). It cost
 * one bake and was invisible to `node --check`, because AN UNDECLARED READ IS VALID SYNTAX — the
 * same class as the `var _tnFilm` assignment §129.61 records.
 *
 * HOW: each file is evaluated in a `vm` context whose `window`/`document`/`THREE` are permissive
 * stubs. A ReferenceError for an identifier the browser would not have supplied either IS the
 * defect. A TypeError against the crude stub is NOT, and is reported and counted rather than
 * hidden, so nobody reads this witness's silence as coverage it does not have.
 *
 * RUN:  node witness_module_loads.js
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

// Identifiers a real browser DOES supply to the right kind of file, so their absence here is the
// stub's limit and not a defect: a web worker gets importScripts, a node-side file gets __dirname.
const ENV_OK = ['importScripts', '__dirname', '__filename', 'process', 'Worker', 'OffscreenCanvas'];

const noop = function () {};
const deep = () => new Proxy(noop, {
  get: (t, k) => (k === 'then' ? undefined : deep()),
  set: () => true, apply: () => deep(), construct: () => deep(),
});
function freshCtx() {
  const ctx = { console: { log: noop, warn: noop, error: noop, info: noop },
                setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
                module: {}, exports: {} };
  ctx.document = deep(); ctx.THREE = deep(); ctx.navigator = deep();
  ctx.performance = { now: () => 0 };
  ctx.require = deep(); ctx.fetch = deep(); ctx.localStorage = deep(); ctx.indexedDB = deep();
  ctx.location = deep(); ctx.history = deep(); ctx.URL = deep(); ctx.Image = deep(); ctx.customElements = deep();
  ctx.requestAnimationFrame = noop; ctx.cancelAnimationFrame = noop; ctx.matchMedia = deep(); ctx.Blob = deep();
  // Plain browser globals. Supplying them is the stub's job — their absence says nothing about the
  // code, and leaving them out would make this witness fail on files that load perfectly well.
  ctx.addEventListener = noop; ctx.removeEventListener = noop; ctx.dispatchEvent = noop;
  ctx.URLSearchParams = URLSearchParams; ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
  ctx.atob = deep(); ctx.btoa = deep(); ctx.Event = deep(); ctx.CustomEvent = deep(); ctx.alert = noop;
  ctx.getComputedStyle = deep(); ctx.screen = deep(); ctx.devicePixelRatio = 1; ctx.crypto = deep();
  ctx.innerWidth = 1920; ctx.innerHeight = 1080; ctx.FileReader = deep(); ctx.WebSocket = deep();
  ctx.MutationObserver = deep(); ctx.ResizeObserver = deep(); ctx.IntersectionObserver = deep();
  const g = vm.createContext(ctx);
  // `window` IS the global object in a browser, so `window.KernelOps = ...` in one file and a bare
  // `KernelOps` in the next are the same binding. Pointing window/self/globalThis at the context
  // itself reproduces that; a separate stub object would report every cross-module global as
  // missing and this witness would cry wolf on 177 files that are perfectly fine.
  g.window = g; g.self = g; g.globalThis = g;
  return g;
}

// THE PAGE'S OWN ORDER, read from viewer.html's script tags — never a list typed here. Loading a
// file in isolation would report every cross-module global (KernelOps, StoreyRaster …) as missing,
// which is not the defect: those ARE defined by the time the browser reaches the file. Evaluating
// them in ONE context, in the page's order, is the faithful test, and it is the only way a
// ReferenceError here means what it says.
const HTML = path.join(__dirname, 'viewer/viewer.html');
let order = [];
try {
  const html = fs.readFileSync(HTML, 'utf8');
  const rx = /<script[^>]*\ssrc="([^"]+)"/g;
  let m;
  while ((m = rx.exec(html))) {
    const src = m[1].split('?')[0];
    if (!src || /^https?:|^\/\//.test(src) || !src.endsWith('.js')) continue;
    order.push(src);
  }
} catch (e) {
  console.log('§MODULE_LOADS INCONCLUSIVE — viewer/viewer.html is unreadable (' + e.message + '),' +
    ' so the page order cannot be discovered and a per-file run would report cross-module globals' +
    ' as defects. That is worse than a failure, so this says so loudly rather than passing.');
  process.exit(2);
}
if (!order.length) {
  console.log('§MODULE_LOADS INCONCLUSIVE — no <script src> found in viewer/viewer.html');
  process.exit(2);
}

const ctx = freshCtx();
let ok = 0, envSkipped = 0, missing = 0;
const broken = [], stubbed = [];
order.forEach((rel) => {
  const f = path.join(__dirname, 'viewer', rel);
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch (e) { missing++; return; }
  try { vm.runInContext(src, ctx, { timeout: 8000, filename: 'viewer/' + rel }); ok++; }
  catch (e) {
    const m = /^(\w[\w$]*) is not defined$/.exec(e.message || '');
    if (e.name === 'ReferenceError' && m) {
      if (ENV_OK.indexOf(m[1]) >= 0) { envSkipped++; return; }
      broken.push('viewer/' + rel + '  ->  ' + m[1] + ' is not defined at load');
    } else stubbed.push('viewer/' + rel + ': ' + (e.name || '?') + ' ' + String(e.message).slice(0, 70));
  }
});

broken.forEach((b) => console.log('  §MODLOAD WRONG ' + b +
  ' — this module never finishes loading in the browser either; a bake parks at §IDLE_GATE with no error'));
console.log('  §MODLOAD ok    ' + ok + ' module(s) load clean' +
  (envSkipped ? ', ' + envSkipped + ' skipped on a browser/node global the stub cannot supply (' + ENV_OK.join(',') + ')' : ''));
console.log('  §MODLOAD note  ' + stubbed.length + ' module(s) threw against the crude stub rather than on an undefined identifier' +
  ' — NOT judged here, and named so this is not read as coverage:' + (stubbed.length ? '' : ' none'));
stubbed.forEach((s2) => console.log('       ' + s2));
console.log('§MODULE_LOADS ' + (broken.length ? 'FAIL broken=' + broken.length : 'PASS') +
  ' loaded=' + ok + '/' + order.length + ' in viewer.html order, unjudged=' + stubbed.length +
  (missing ? ', absent=' + missing : ''));
process.exit(broken.length ? 1 : 0);
