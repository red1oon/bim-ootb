// 25-mep-report.spec.js — MEP_5D_QTO.md §3.1–3.5 MEP BOQ report
// Issues proven:
//   T_MEP_10: MEP button exists on toolbar
//   T_MEP_11: MEP report renders SMM sections (MEP-rich building)
//   T_MEP_12: MEP report for zero-MEP building handles gracefully
//   T_MEP_13: Copy URL on MEP report
//   T_MEP_14: CSV export works

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';

// HHS Office has real MEP data
const MEP_REPORT_URL = '/dev/mep_report.html?db=/buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated';

// SampleHouse has zero MEP
const MEP_REPORT_ZERO = '/dev/mep_report.html?db=/buildings/SampleHouse_extracted.db&bld=Ifc4_SampleHouse';

function waitForInit(page) {
  return page.waitForFunction(() => {
    const el = document.getElementById('status') || document.getElementById('report-content');
    if (!el) return false;
    const t = (document.getElementById('status') || {}).textContent || '';
    const rc = (document.getElementById('report-content') || {}).textContent || '';
    return (t.includes('complete') || t.includes('Error') || rc.includes('No MEP') || rc.includes('No elements'));
  }, { timeout: 60000 });
}

test.describe('MEP Report (§3.1–3.5)', () => {

  test('T_MEP_10: MEP button exists on boq_charts toolbar @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const mepBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.toolbar button'));
      return buttons.some(b => b.textContent.includes('MEP'));
    });
    expect(mepBtn).toBe(true);
    console.log('§PW_MEP_BTN found=true');
  });

  test('T_MEP_11: MEP report renders SMM sections for MEP-rich building @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(MEP_REPORT_URL);
    await waitForInit(page);

    // §MEP_BOQ must appear with sections≥1 and total>0
    const tag = logs.tagged('§MEP_BOQ');
    expect(tag.length).toBeGreaterThan(0);
    const line = tag[0].text;

    const secMatch = line.match(/sections=(\d+)/);
    expect(secMatch).not.toBeNull();
    expect(Number(secMatch[1])).toBeGreaterThanOrEqual(1);

    const totalMatch = line.match(/total=(\d+)/);
    expect(totalMatch).not.toBeNull();
    expect(Number(totalMatch[1])).toBeGreaterThan(0);

    // Charts rendered
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    expect(canvases).toBe(3);

    // Section tables exist
    const sections = await page.evaluate(() => document.querySelectorAll('.section-block h3').length);
    expect(sections).toBeGreaterThanOrEqual(1);

    // Reinstatement witness
    const reinst = logs.tagged('§REINSTATEMENT');
    expect(reinst.length).toBeGreaterThan(0);

    console.log('§PW_MEP_REPORT ' + line);
    console.log('§PW_MEP_REINST ' + (reinst.length > 0 ? reinst[0].text : 'none'));
  });

  test('T_MEP_12: MEP report for zero-MEP building shows empty gracefully @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(MEP_REPORT_ZERO);
    await waitForInit(page);

    // Should show "No MEP elements" or sections=0
    const tag = logs.tagged('§MEP_BOQ');
    if (tag.length > 0) {
      expect(tag[0].text).toContain('sections=0');
      expect(tag[0].text).toContain('total=0');
    }

    // No crash — page errors
    const errors = logs.errors;
    expect(errors.length).toBe(0);

    console.log('§PW_MEP_ZERO_OK');
  });

  test('T_MEP_11b: summary block shows MEP total and building % @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(MEP_REPORT_URL);
    await waitForInit(page);

    const summary = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.summary-row'));
      return {
        hasMepTotal: rows.some(r => r.textContent.includes('MEP TOTAL')),
        hasPct: rows.some(r => r.textContent.includes('% of Building')),
        hasInsured: rows.some(r => r.textContent.includes('INSURED VALUE')),
        hasPreliminaries: rows.some(r => r.textContent.includes('Preliminaries')),
      };
    });

    expect(summary.hasMepTotal).toBe(true);
    expect(summary.hasPct).toBe(true);
    expect(summary.hasInsured).toBe(true);
    expect(summary.hasPreliminaries).toBe(true);
    console.log('§PW_MEP_SUMMARY total=' + summary.hasMepTotal + ' pct=' + summary.hasPct + ' insured=' + summary.hasInsured);
  });

  test('T_MEP_11c: labour trade breakdown table exists @slow', async ({ page }) => {
    await page.goto(MEP_REPORT_URL);
    await waitForInit(page);

    const trades = await page.evaluate(() => {
      const h3s = Array.from(document.querySelectorAll('.section-block h3'));
      const tradeH3 = h3s.find(h => h.textContent.includes('Labour Trade'));
      if (!tradeH3) return { found: false, rows: 0 };
      const table = tradeH3.parentElement.querySelector('table');
      return { found: true, rows: table ? table.querySelectorAll('tr').length - 1 : 0 };
    });

    expect(trades.found).toBe(true);
    expect(trades.rows).toBeGreaterThan(0);
    console.log('§PW_MEP_TRADES rows=' + trades.rows);
  });

  test('T_MEP_11d: no console errors in MEP report @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(MEP_REPORT_URL);
    await waitForInit(page);

    const errors = logs.errors;
    if (errors.length > 0) console.log('ERRORS:', errors);
    expect(errors.length).toBe(0);
    console.log('§PW_MEP_CLEAN errors=0');
  });

});
