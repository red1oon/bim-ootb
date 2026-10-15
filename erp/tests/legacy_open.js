// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// legacy_open.js — what a legacy user does to reach ALL of a window's rows once it has opened (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-4).
//   The twin now opens a window the way iDempiere does (AbstractADWindowContent :416-422, initialQuery :899-991, initQueryOnNew :719-737):
//   a high-volume window shows the Find dialog first, a transaction window shows only current rows, and one with no current rows opens a
//   New record. A witness that needs the window's records takes the legacy user's path, not a twin-only shortcut:
//     Find dialog open      -> OK (no restriction: all rows)
//     auto-opened New record -> Ignore
//     only-current rows      -> Find -> OK ("search history too", doOnFind :2662)
//   showAllRows(page) is safe to call on any window (each step only acts when its condition holds). Returns the steps taken.
'use strict';
async function showAllRows(page, opts) {
  opts = opts || {}; const steps = [], wait = (ms) => page.waitForTimeout(ms);
  await page.waitForSelector('[data-ad-table], #idmp-find-ov, #idmp-inline-mount', { timeout: opts.timeout || 20000 }).catch(() => {});
  await wait(opts.settle || 400);
  if (await page.locator('#idmp-find-ov').count()) { await page.click('#idmp-find-ov [data-find-ok]'); steps.push('find-first:ok'); await wait(1000); }
  const autoNew = await page.evaluate(() => !!document.getElementById('idmp-inline-mount'));
  if (autoNew) {
    const ign = page.locator('#idmp-inline-mount .ic-vb[data-v="ignore"], #idmp-toolbar button[title^="Ignore"]').first();
    if (await ign.count()) { await ign.click().catch(() => {}); steps.push('auto-new:ignore'); await wait(700); }
  }
  const findBtn = page.locator('#idmp-toolbar [data-tb="find"]');
  if (opts.history !== false && await findBtn.count() && await findBtn.isVisible() && !(await findBtn.evaluate(b => b.classList.contains('active') || b.disabled))) {
    await findBtn.click(); await page.waitForSelector('#idmp-find-ov', { timeout: 8000 }).catch(() => {});
    if (await page.locator('#idmp-find-ov').count()) { await page.click('#idmp-find-ov [data-find-ok]'); steps.push('history:find-ok'); await wait(1000); }
  }
  return steps;
}
module.exports = { showAllRows };
