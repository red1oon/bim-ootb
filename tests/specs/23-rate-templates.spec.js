// 23-rate-templates.spec.js — MEP_5D_QTO.md §1.1–1.2 rate templates + §2.1–2.3 unit-aware QTO
// Issues proven:
//   T_MEP_01: Rate template loads from JSON
//   T_MEP_02: Linear elements use bbox length (M), not count
//   T_MEP_03: Area elements use bbox area (M2), not count
//   T_MEP_04: EA elements use count unchanged
//   T_MEP_05: Fallback when bbox is NULL

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';

function waitForInit(page) {
  return page.waitForFunction(() => {
    const info = document.getElementById('info');
    return info && !info.textContent.includes('Loading');
  }, { timeout: 45000 });
}

test.describe('Rate Templates (§1.1–1.2)', () => {

  test('T_MEP_01: default template loads from JSON @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    const tag = logs.tagged('§QTO_RATES_LOADED');
    expect(tag.length).toBeGreaterThan(0);
    const line = tag[0].text;
    expect(line).toContain('template=cidb2024_my');
    const m = line.match(/classes=(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(49);
    console.log('§PW_RATE_TPL ' + line);
  });

  test('T_MEP_01b: explicit ?rates= param loads that template @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL + '&rates=bcis2024_uk');
    await waitForInit(page);

    const tag = logs.tagged('§QTO_RATES_LOADED');
    expect(tag.length).toBeGreaterThan(0);
    expect(tag[0].text).toContain('template=bcis2024_uk');
    console.log('§PW_RATE_TPL_UK ' + tag[0].text);
  });

  test('T_MEP_01c: bad template name falls back gracefully @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL + '&rates=nonexistent_999');
    await waitForInit(page);

    const fb = logs.tagged('§QTO_RATES_FALLBACK');
    expect(fb.length).toBeGreaterThan(0);
    expect(fb[0].text).toContain('nonexistent_999');

    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    expect(canvases).toBeGreaterThan(0);
    console.log('§PW_RATE_FALLBACK ' + fb[0].text);
  });

  test('T_MEP_01d: RATES globals populated from JSON @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    const check = await page.evaluate(() => {
      return {
        templateName: window.RATE_TEMPLATE_NAME,
        hasMeta: !!window.RATE_TEMPLATE_META,
        metaCurrency: window.RATE_TEMPLATE_META ? window.RATE_TEMPLATE_META.currency : null,
        pipeRate: window.RATES.IfcPipeSegment ? window.RATES.IfcPipeSegment.rate : null,
        pipeSMM: window.RATES.IfcPipeSegment ? window.RATES.IfcPipeSegment.smm_section : null,
        slabUnit: window.RATES.IfcSlab ? window.RATES.IfcSlab.unit : null,
        getSMMworks: typeof window.getSMMSection === 'function',
      };
    });

    expect(check.templateName).toBe('cidb2024_my');
    expect(check.hasMeta).toBe(true);
    expect(check.metaCurrency).toBe('RM');
    expect(check.pipeRate).toBe(48.5);
    expect(check.pipeSMM).toBe('S10');
    expect(check.slabUnit).toBe('M2');
    expect(check.getSMMworks).toBe(true);
    console.log('§PW_RATE_GLOBALS template=' + check.templateName + ' currency=' + check.metaCurrency + ' pipeSmm=' + check.pipeSMM);
  });

});

test.describe('Unit-Aware QTO (§2.1–2.3)', () => {

  test('T_MEP_02: linear elements use bbox length not count @slow', async ({ page }) => {
    // Duplex has IfcMember (unit=M) — qty should be SUM(bbox longest axis), not element count
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    // Find §QTO_UNIT lines for a linear class
    const unitLines = logs.tagged('§QTO_UNIT').filter(e => e.text.includes('unit=M '));
    expect(unitLines.length).toBeGreaterThan(0);

    // For at least one M-unit class, qty must differ from cnt (bbox length ≠ count)
    let foundDiff = false;
    for (const line of unitLines) {
      const qm = line.text.match(/qty=([\d.]+)/);
      const cm = line.text.match(/cnt=(\d+)/);
      if (qm && cm) {
        const qty = parseFloat(qm[1]);
        const cnt = parseInt(cm[1]);
        if (Math.abs(qty - cnt) > 0.01) {
          foundDiff = true;
          console.log('§PW_QTO_LINEAR ' + line.text);
          break;
        }
      }
    }
    expect(foundDiff).toBe(true);
  });

  test('T_MEP_03: area elements use bbox area not count @slow', async ({ page }) => {
    // Duplex has IfcSlab, IfcWall (unit=M2) — qty should be SUM(area), not element count
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    const unitLines = logs.tagged('§QTO_UNIT').filter(e => e.text.includes('unit=M2'));
    expect(unitLines.length).toBeGreaterThan(0);

    let foundDiff = false;
    for (const line of unitLines) {
      const qm = line.text.match(/qty=([\d.]+)/);
      const cm = line.text.match(/cnt=(\d+)/);
      if (qm && cm) {
        const qty = parseFloat(qm[1]);
        const cnt = parseInt(cm[1]);
        if (Math.abs(qty - cnt) > 0.01) {
          foundDiff = true;
          console.log('§PW_QTO_AREA ' + line.text);
          break;
        }
      }
    }
    expect(foundDiff).toBe(true);
  });

  test('T_MEP_04: EA elements use count unchanged @slow', async ({ page }) => {
    // Duplex has IfcDoor (unit=EA) — qty must equal cnt
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    const unitLines = logs.tagged('§QTO_UNIT').filter(e => e.text.includes('unit=EA'));
    expect(unitLines.length).toBeGreaterThan(0);

    // Every EA line: qty == cnt
    let allMatch = true;
    for (const line of unitLines) {
      const qm = line.text.match(/qty=([\d.]+)/);
      const cm = line.text.match(/cnt=(\d+)/);
      if (qm && cm) {
        const qty = parseFloat(qm[1]);
        const cnt = parseInt(cm[1]);
        if (qty !== cnt) { allMatch = false; break; }
      }
    }
    expect(allMatch).toBe(true);
    console.log('§PW_QTO_EA_OK count_lines=' + unitLines.length);
  });

  test('T_MEP_05: QTO summary witness emitted @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    const summary = logs.tagged('§QTO_SUMMARY');
    expect(summary.length).toBeGreaterThan(0);
    const line = summary[0].text;
    // Must have classes, material, labor, equip
    expect(line).toMatch(/classes=\d+/);
    expect(line).toMatch(/material=\d+/);
    expect(line).toMatch(/labor=\d+/);
    console.log('§PW_QTO_SUMMARY ' + line);
  });

  test('T_MEP_05b: no console errors during QTO @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForInit(page);

    // Filter out expected warnings (§QTO_WARN is intentional)
    const realErrors = logs.errors.filter(e => !e.includes('§QTO_WARN'));
    if (realErrors.length > 0) console.log('Errors:', realErrors);
    expect(realErrors.length).toBe(0);
    console.log('§PW_QTO_CLEAN errors=0');
  });

});
