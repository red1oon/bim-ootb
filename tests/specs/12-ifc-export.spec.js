// 12-ifc-export.spec.js — S229b Browser IFC Export tests
// Issue: verify DB → .ifc STEP text generation (round-trip, syntax, refs)
// Bugs prevented:
//   S229b Malformed STEP lines, dangling entity refs, missing spatial hierarchy
//   S229b Elements without geometry crashing export
//   S229b IFC class mapping wrong (IfcWall → IFCWALL)
//   S229b Colour/material not written to STEP

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const TEST_URL = '/dev/test/test_ifc_export.html';

test.describe('S229b IFC Export', () => {

  test('12.1 IFC export pure-function tests all PASS @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(TEST_URL);

    // Wait for all async tests (worker round-trips) to complete
    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 60000 });

    const stats = await page.evaluate(() => {
      const allDivs = [...document.querySelectorAll('.section')];
      const passDivs = allDivs.filter(d => d.classList.contains('pass'));
      const failDivs = allDivs.filter(d => d.classList.contains('fail'));
      const failTexts = failDivs.map(d => d.textContent.trim());
      return {
        pass: passDivs.length,
        fail: failDivs.length,
        total: passDivs.length + failDivs.length,
        summary: document.getElementById('summary').textContent,
        allPass: document.getElementById('summary').className === 'all-pass',
        failDetails: failTexts,
      };
    });

    console.log(`§PW_IFC_EXPORT pass=${stats.pass} fail=${stats.fail} total=${stats.total} summary="${stats.summary}"`);
    if (stats.fail > 0) {
      console.log(`  FAIL details: ${stats.failDetails.join(' | ')}`);
    }

    // Expect at least 25 assertions (Tests 1-4 combined)
    expect(stats.pass).toBeGreaterThanOrEqual(25);
    expect(stats.fail).toBe(0);
  });

  test('12.2 STEP structure and spatial hierarchy correct @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(TEST_URL);

    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 60000 });

    // Extract test details to verify STEP structure coverage
    const details = await page.evaluate(() => {
      const allDivs = [...document.querySelectorAll('.section')];
      const passTexts = allDivs.filter(d => d.classList.contains('pass')).map(d => d.textContent);
      return {
        hasProject: passTexts.some(t => t.includes('IfcProject')),
        hasSite: passTexts.some(t => t.includes('IfcSite')),
        hasBuilding: passTexts.some(t => t.includes('IfcBuilding')),
        hasStorey: passTexts.some(t => t.includes('IfcBuildingStorey')),
        hasGeometry: passTexts.some(t => t.includes('TriangulatedFaceSet')),
        hasColour: passTexts.some(t => t.includes('colour')),
        hasContainment: passTexts.some(t => t.includes('containment')),
        hasUnits: passTexts.some(t => t.includes('metre')),
        hasNoRefs: passTexts.some(t => t.includes('dangling')),
        hasNoDupes: passTexts.some(t => t.includes('duplicate')),
      };
    });

    console.log('§PW_IFC_EXPORT_STRUCTURE', JSON.stringify(details));
    expect(details.hasProject).toBe(true);
    expect(details.hasBuilding).toBe(true);
    expect(details.hasStorey).toBe(true);
    expect(details.hasGeometry).toBe(true);
    expect(details.hasContainment).toBe(true);
    expect(details.hasNoRefs).toBe(true);
    expect(details.hasNoDupes).toBe(true);
  });

  test('12.3 Round-trip DB → export preserves all elements @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(TEST_URL);

    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 60000 });

    // Verify round-trip specific assertions passed
    const roundTrip = await page.evaluate(() => {
      const allDivs = [...document.querySelectorAll('.section')];
      const passTexts = allDivs.filter(d => d.classList.contains('pass')).map(d => d.textContent);
      return {
        hasRoundTripWall: passTexts.some(t => t.includes('round-trip') && t.includes('IfcWall')),
        hasRoundTripBeam: passTexts.some(t => t.includes('round-trip') && t.includes('IfcBeam')),
        hasRoundTripName: passTexts.some(t => t.includes('round-trip') && t.includes('building name')),
        hasRoundTripGeo: passTexts.some(t => t.includes('round-trip') && t.includes('geometry')),
        hasEmptySkeleton: passTexts.some(t => t.includes('empty') && t.includes('valid')),
        hasSkipNoGeo: passTexts.some(t => t.includes('without geometry') && t.includes('skipped')),
      };
    });

    console.log('§PW_IFC_EXPORT_ROUNDTRIP', JSON.stringify(roundTrip));
    expect(roundTrip.hasRoundTripWall).toBe(true);
    expect(roundTrip.hasRoundTripBeam).toBe(true);
    expect(roundTrip.hasRoundTripName).toBe(true);
    expect(roundTrip.hasRoundTripGeo).toBe(true);
    expect(roundTrip.hasEmptySkeleton).toBe(true);
    expect(roundTrip.hasSkipNoGeo).toBe(true);
  });

});
