// Copyright (c) 2025-2026 Redhuan D. Oon. SPDX-License-Identifier: MIT
// pdf/sw.js - the PDF page works with no network (bim-compiler prompts/PDF_EDITOR.md §3 "one page, all local").
// NETWORK FIRST, cache as the fallback: a user who is online always gets the current files (no stale-script class of bug, no version
// to bump per deploy); a user who is offline gets the last copy seen. The user's PDF never passes through here: it is read with the File API.
'use strict';
var CACHE = 'pdf-page-v1';
var ASSETS = ['./', 'index.html', 'pdf_open.js', 'report_reader.js', 'pdf_write.js', '../erp/sheet_history.js', '../modeller/lib/pdfjs/pdf.min.js', '../modeller/lib/pdfjs/pdf.worker.min.js', '../erp/xlsx.mini.min.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('pdf-page-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) { if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); } return r; }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || Response.error(); }); }));
});
