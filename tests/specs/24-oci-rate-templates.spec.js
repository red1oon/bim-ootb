// 24-oci-rate-templates.spec.js — Verify rate template loading on deployed OCI dev bucket
// Issue: initRateTemplate was not defined on deployed rates.js — caused page crash
// Proves: deployed rates.js has initRateTemplate, JSON loads, page renders, no errors

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const OCI_DEV = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o';
const OCI_LIVE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-live/o';
const BOQ_URL = OCI_DEV + '/boq_charts.html?db=' + OCI_LIVE + '/buildings/SampleHouse_extracted.db&bld=Ifc4_SampleHouse';

function waitForInit(page) {
  return page.waitForFunction(() => {
    const info = document.getElementById('info');
    if (!info) return false;
    const t = info.textContent;
    return t && !t.includes('Loading') && t.length > 0;
  }, { timeout: 60000 });
}

test.describe('OCI Dev — Rate Templates', () => {

  test('T_OCI_01: page loads without initRateTemplate error @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForInit(page);

    // Must NOT have the ReferenceError
    const refErrors = logs.errors.filter(e => e.includes('initRateTemplate'));
    if (refErrors.length > 0) console.log('ERRORS:', refErrors);
    expect(refErrors.length).toBe(0);

    // Must have either LOADED or FALLBACK (both are OK — no crash)
    const loaded = logs.tagged('§QTO_RATES_LOADED');
    const fallback = logs.tagged('§QTO_RATES_FALLBACK');
    const hasRates = loaded.length > 0 || fallback.length > 0;
    expect(hasRates).toBe(true);

    if (loaded.length > 0) console.log('§OCI_RATE_LOADED ' + loaded[0].text);
    if (fallback.length > 0) console.log('§OCI_RATE_FALLBACK ' + fallback[0].text);
  });

  test('T_OCI_02: JSON template fetched from rates/ on OCI @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForInit(page);

    // Should load cidb2024_my.json from rates/ path
    const loaded = logs.tagged('§QTO_RATES_LOADED');
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded[0].text).toContain('template=cidb2024_my');
    expect(loaded[0].text).toContain('classes=');
    console.log('§OCI_TPL_OK ' + loaded[0].text);
  });

  test('T_OCI_03: charts render with no console errors @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForInit(page);

    // Charts rendered
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    expect(canvases).toBeGreaterThan(0);

    // No real errors (filter out §QTO_WARN which is intentional)
    const realErrors = logs.errors.filter(e => !e.includes('§QTO_WARN'));
    if (realErrors.length > 0) console.log('ERRORS:', realErrors);
    expect(realErrors.length).toBe(0);

    console.log('§OCI_CLEAN canvases=' + canvases + ' errors=0');
  });

});
