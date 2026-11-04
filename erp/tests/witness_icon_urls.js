// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// W-ICON-URLS - bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md section 30.6. Proves: the 27 till product pictures answer 200 + image/svg+xml from object storage, bytes match the list,
//   and the bucket answers CORS for the till's origins (an opaque no-cors image cannot be cached, sw.js:483). Network witness. READ THE LOG (/tmp/icon_logs/).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'product_icons', 'product_icons.json'), 'utf8'));
const ORIGINS = ['https://red1oon.github.io', 'http://localhost:8399'];
(async () => {
  let ok = 0, bad = 0, total = 0, corsBad = 0, shaBad = 0;
  for (const p of L.products) {
    const r = await fetch(p.url, { headers: { Origin: ORIGINS[0] } }); const b = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '', good = r.status === 200 && /^image\/svg\+xml/.test(ct);
    const sha = crypto.createHash('sha256').update(b).digest('hex') === p.sha256;
    total += b.length; if (good) ok++; else bad++; if (!sha) shaBad++;
    console.log(`§ICON_URL value=${p.value} status=${r.status} ct=${ct} bytes=${b.length} sha=${sha ? 'same' : 'DIFF'}`);
  }
  for (const o of ORIGINS) {
    const g = await fetch(L.products[0].url, { headers: { Origin: o } });
    const pre = await fetch(L.products[0].url, { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'GET' } });
    const a = g.headers.get('access-control-allow-origin'), a2 = pre.headers.get('access-control-allow-origin');
    const good = (a === '*' || a === o) && (a2 === '*' || a2 === o); if (!good) corsBad++;
    console.log(`§ICON_CORS origin=${o} get=${g.status} acao=${a} preflight=${pre.status} acao=${a2} ${good ? 'ALLOWED' : 'BLOCKED'}`);
  }
  let lic = 0; for (const u of L.licences) { const r = await fetch(u); const t = await r.text(); if (r.status === 200 && /license/i.test(t)) lic++; console.log(`§ICON_LICENCE ${u.split('/').pop()} status=${r.status} bytes=${t.length}`); }
  console.log(`§ICON_URLS ok=${ok} of ${L.products.length} total_bytes=${total} bad=${bad} sha_diff=${shaBad} cors_blocked=${corsBad} licences=${lic}/${L.licences.length}`);
  const v = !L.products.length ? 'INCONCLUSIVE' : (ok === 27 && !bad && !shaBad && !corsBad && lic === L.licences.length) ? 'PASS' : 'FAIL';
  console.log(`§ICON_VERDICT W-ICON-URLS verdict=${v} judged=${L.products.length + ORIGINS.length + L.licences.length}`); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§ICON_VERDICT W-ICON-URLS verdict=HARNESS-FAIL ' + e.message); process.exit(2); });
