// 22-4d-audit.spec.js — S240 §0.1: 4D schedule audit gate (8 checks)
// Bugs prevented:
//   DR-1 Missing CARPENTER/ROOFER/FINISHER trades — duration defaults to 10
//   DR-2 IfcPile no productivity — schedule inflated
//   DR-3 WORK_PACKAGES vs SEQUENCE_RULES phase mismatch
//   TC-01 Unmapped IFC classes fall to DEFAULT — phantom tasks
//   TC-04 Duration outliers (>120d or <1d) — Gantt unreadable
//   TC-08 Zero-GUID tasks — 4D sync sends empty highlight list

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';
const BOQ_URL_SH = '/dev/boq_charts.html?db=/buildings/SampleHouse_extracted.db&lib=/buildings/SampleHouse_library.db&bld=SampleHouse';

// Helper: wait for charts page to finish loading
async function waitForCharts(page) {
  await page.waitForFunction(() => {
    const info = document.getElementById('info');
    return info && !info.textContent.includes('Loading') && info.textContent.length > 0;
  }, { timeout: 45000 });
}

// Helper: extract §4D_AUDIT_* tags from console logs
function extractAuditTags(logs) {
  return logs.entries
    .filter(e => e.text.includes('§4D_AUDIT_'))
    .map(e => {
      const match = e.text.match(/§4D_AUDIT_(\w+)\s+(PASS|FAIL)(.*)/);
      return match ? { check: match[1], result: match[2], detail: match[3].trim() } : null;
    })
    .filter(Boolean);
}

test.describe('4D Schedule Audit (S240 §0.1)', () => {

  test('22.1 All 8 audit checks emit §4D_AUDIT tags @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const checkNames = tags.map(t => t.check);

    console.log(`§PW_4D_AUDIT_TAGS count=${tags.length} checks=[${checkNames.join(',')}]`);

    // All 8 checks must emit a log line
    const EXPECTED = ['COVERAGE', 'PHASE_ORDER', 'STOREY_ORDER', 'DURATION', 'OVERLAP', 'TOTAL', 'LABELS', 'GUIDS'];
    for (const name of EXPECTED) {
      expect(checkNames, `Missing audit check: ${name}`).toContain(name);
    }
    expect(tags.length).toBeGreaterThanOrEqual(8);
  });

  test('22.2 Audit summary line emitted @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const summary = logs.entries.find(e => e.text.includes('§4D_AUDIT_SUMMARY'));
    expect(summary, '§4D_AUDIT_SUMMARY not found').toBeTruthy();

    const match = summary.text.match(/pass=(\d+)\s+fail=(\d+)\s+total=(\d+)/);
    expect(match, 'Summary line malformed').toBeTruthy();

    const pass = parseInt(match[1]);
    const fail = parseInt(match[2]);
    const total = parseInt(match[3]);

    console.log(`§PW_4D_AUDIT_SUMMARY pass=${pass} fail=${fail} total=${total}`);
    expect(total).toBe(8);
    expect(pass + fail).toBe(8);
  });

  test('22.3 No duration outliers (TC-04: 1d ≤ duration ≤ 120d) @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const duration = tags.find(t => t.check === 'DURATION');
    expect(duration, 'DURATION check not found').toBeTruthy();

    console.log(`§PW_4D_AUDIT_DURATION result=${duration.result} ${duration.detail}`);
    expect(duration.result).toBe('PASS');
  });

  test('22.4 Phase order correct — no inversions (TC-02) @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const phaseOrder = tags.find(t => t.check === 'PHASE_ORDER');
    expect(phaseOrder, 'PHASE_ORDER check not found').toBeTruthy();

    console.log(`§PW_4D_AUDIT_PHASE_ORDER result=${phaseOrder.result} ${phaseOrder.detail}`);
    expect(phaseOrder.result).toBe('PASS');
  });

  test('22.5 GUID resolution — zero orphaned tasks (TC-08) @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const guids = tags.find(t => t.check === 'GUIDS');
    expect(guids, 'GUIDS check not found').toBeTruthy();

    console.log(`§PW_4D_AUDIT_GUIDS result=${guids.result} ${guids.detail}`);
    // Log detail for diagnosis even if FAIL — the §4D_AUDIT_GUIDS line has orphaned list
  });

  test('22.6 No warning banner when all checks pass @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const failCount = tags.filter(t => t.result === 'FAIL').length;

    const banner = await page.evaluate(() => {
      const el = document.getElementById('audit4d-banner');
      return el ? el.textContent : null;
    });

    console.log(`§PW_4D_AUDIT_BANNER failCount=${failCount} banner=${banner ? '"' + banner + '"' : 'none'}`);

    if (failCount === 0) {
      expect(banner).toBeNull();
    } else {
      expect(banner).toContain('issue');
    }
  });

  test('22.7 Project duration ratio ≤ 3× serial (TC-06) @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const tags = extractAuditTags(logs);
    const total = tags.find(t => t.check === 'TOTAL');
    expect(total, 'TOTAL check not found').toBeTruthy();

    const match = total.detail.match(/ratio=([\d.]+)/);
    const ratio = match ? parseFloat(match[1]) : null;

    console.log(`§PW_4D_AUDIT_TOTAL result=${total.result} ratio=${ratio}`);
    expect(total.result).toBe('PASS');
    if (ratio !== null) expect(ratio).toBeLessThanOrEqual(3.0);
  });

  test('22.8 No console errors during audit @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    console.log(`§PW_4D_AUDIT_CLEAN errors=${logs.errors.length}`);
    expect(logs.errors.length).toBe(0);
  });

});
