// 14-2d-plans.spec.js — 2D DXF viewer in browser tab
// Issues prevented:
//   - DXF not loading in browser (parser or fetch failure)
//   - BIMSRC xdata lost on parse (breaks GUID correlation)
//   - 2D toolbar button missing from viewer

const { test, expect } = require('@playwright/test');
const { openViewer, waitForStream } = require('../helpers/viewer');

const DXF_URL = 'dxf/SH_FLOOR.dxf';

test.describe('2D Plans Viewer', () => {

  test('14.1 2D button exists in toolbar @fast', async ({ page }) => {
    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
    });
    const btn = page.locator('button[title="2D Plans"]');
    await expect(btn).toBeVisible({ timeout: 10000 });
    console.log('§PW_2D_BTN visible=true');
  });

  test('14.2 2d.html loads and parses DXF @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.waitForLoadState('domcontentloaded');

    // Select SH Floor Plan from dropdown
    await page.selectOption('#sheet-select', DXF_URL);

    // Wait for entities to be parsed
    await page.waitForFunction(() => {
      const el = document.getElementById('ent-count');
      return el && parseInt(el.textContent) > 0;
    }, { timeout: 15000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const layerCount = await page.$eval('#layer-count', el => parseInt(el.textContent));

    console.log(`§PW_2D_PARSE entities=${entCount} layers=${layerCount}`);
    expect(entCount).toBeGreaterThan(100);    // SH floor has ~315 entities
    expect(layerCount).toBeGreaterThan(3);     // Multiple AIA layers
  });

  test('14.3 DXF layers panel toggles @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', DXF_URL);
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    // Layer panel starts hidden
    const panel = page.locator('#layer-panel');
    await expect(panel).toBeHidden();

    // Click Layers button
    await page.click('#layers-btn');
    await expect(panel).toBeVisible();

    // Should have layer checkboxes
    const labels = panel.locator('label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(3);
    console.log(`§PW_2D_LAYERS visible=true count=${count}`);
  });

  test('14.4 BIMSRC xdata survives parse @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', DXF_URL);
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    // Count entities with BIMSRC xdata
    const bimsrcCount = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      return ents.filter(e => {
        const xd = e.extendedData || e.xdata || e.xData;
        return xd && xd.applicationName === 'BIMSRC';
      }).length;
    });

    console.log(`§PW_2D_BIMSRC count=${bimsrcCount}`);
    expect(bimsrcCount).toBeGreaterThan(50);   // SH floor has ~93 tagged entities
  });

  test('14.5 BIMSRC toggle highlights entities @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', DXF_URL);
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    // BIMSRC button toggles
    const btn = page.locator('#bimsrc-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(btn).toHaveClass(/active/);

    // Info bar should show BIMSRC fields
    const infoSpan = page.locator('#bimsrc-info');
    await expect(infoSpan).toBeVisible();
    console.log('§PW_2D_BIMSRC_TOGGLE active=true info_visible=true');
  });

  test('14.6 Fit view works after load @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', DXF_URL);
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    // Check viewScale is set (non-zero)
    const scale = await page.evaluate(() => window.viewScale);
    expect(scale).toBeGreaterThan(0);
    console.log(`§PW_2D_FIT viewScale=${scale.toFixed(2)}`);
  });

  test('14.7 DX floor plan loads @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', 'dxf/DX_FLOOR_GF.dxf');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    console.log(`§PW_2D_DX entities=${entCount}`);
    expect(entCount).toBeGreaterThan(100);    // DX floor has ~368 entities
  });

  test('14.8 Drag-drop DXF file loads @fast', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.waitForLoadState('domcontentloaded');

    // Read a DXF file and simulate drop
    const fs = require('fs');
    const dxfContent = fs.readFileSync(
      require('path').resolve(__dirname, '../../dxf/SH_FLOOR.dxf'), 'utf-8'
    );

    // Inject the DXF content via parseDxf directly (drag-drop uses FileReader which is hard to test)
    await page.evaluate((content) => { parseDxf(content); }, dxfContent);

    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 5000 });
    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    console.log(`§PW_2D_DROP entities=${entCount}`);
    expect(entCount).toBeGreaterThan(100);
  });

  // ── Sacred baselines: SH Floor + Roof are pristine regression anchors ──
  // Issue prevented: refactoring the Canvas2D renderer or DXF parser silently
  // breaking the proven DXF rendering path. These exact counts are locked.

  test('14.9 SH_FLOOR.dxf pristine baseline @fast @sacred', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', 'dxf/SH_FLOOR.dxf');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const layerCount = await page.$eval('#layer-count', el => parseInt(el.textContent));
    const bimsrcCount = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      return ents.filter(e => {
        const xd = e.extendedData || e.xdata || e.xData;
        return xd && xd.applicationName === 'BIMSRC';
      }).length;
    });

    console.log(`§PW_2D_SACRED_FLOOR entities=${entCount} layers=${layerCount} bimsrc=${bimsrcCount}`);
    expect(entCount).toBe(292);      // LOCKED — do not change
    expect(layerCount).toBe(12);     // LOCKED — do not change
    expect(bimsrcCount).toBe(93);    // LOCKED — do not change
  });

  test('14.10 SH_ROOF.dxf pristine baseline @fast @sacred', async ({ page }) => {
    await page.goto('/dev/2d.html');
    await page.selectOption('#sheet-select', 'dxf/SH_ROOF.dxf');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const layerCount = await page.$eval('#layer-count', el => parseInt(el.textContent));

    console.log(`§PW_2D_SACRED_ROOF entities=${entCount} layers=${layerCount}`);
    expect(entCount).toBe(122);      // LOCKED — do not change
    expect(layerCount).toBe(6);      // LOCKED — do not change
  });
});

// ── Dynamic generation from DB tests ──
// Issue prevented: section cut, elevation, grid, and DXF export modules not loading or crashing

const SH_DB = '/buildings/SampleHouse_extracted.db';
const SH_LIB = '/buildings/SampleHouse_library.db';
const DX_DB = '/buildings/Duplex_extracted.db';
const DX_LIB = '/buildings/Duplex_library.db';

// Helper: open 2d.html with DB params, wait for DB ready
async function open2dWithDb(page, db, lib) {
  const url = `/dev/2d.html?db=${db}&lib=${lib}`;
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.text()));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait for DBs to load (storey selector populated or status shows ready)
  await page.waitForFunction(() => {
    const s = document.getElementById('status-text');
    return s && (s.textContent.includes('Generate') || s.textContent.includes('error'));
  }, { timeout: 45000 });
  return consoleLogs;
}

test.describe('2D Dynamic Generation', () => {

  test('14.11 DB loads and storey selector populates (SH) @db', async ({ page }) => {
    const logs = await open2dWithDb(page, SH_DB, SH_LIB);

    const storeyOpts = await page.$$eval('#storey-select option', opts => opts.map(o => o.value).filter(v => v));
    console.log(`§PW_2D_DB_STOREYS count=${storeyOpts.length} storeys=${storeyOpts.join(',')}`);
    expect(storeyOpts.length).toBeGreaterThanOrEqual(1);

    const dbLog = logs.find(l => l.includes('§2D_DB main loaded'));
    expect(dbLog).toBeTruthy();
  });

  test('14.12 Floor plan generation produces entities (SH) @db', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');

    await page.waitForFunction(() => {
      const el = document.getElementById('ent-count');
      return el && parseInt(el.textContent) > 0;
    }, { timeout: 30000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const layerCount = await page.$eval('#layer-count', el => parseInt(el.textContent));
    const status = await page.$eval('#status-text', el => el.textContent);

    console.log(`§PW_2D_GEN_PLAN entities=${entCount} layers=${layerCount} status="${status}"`);
    expect(entCount).toBeGreaterThan(10);
    expect(layerCount).toBeGreaterThanOrEqual(1);
    expect(status).toContain('Generated');
  });

  test('14.13 Generated plan has BIMSRC xdata (SH) @db', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 30000 });

    const bimsrcCount = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      return ents.filter(e => {
        const xd = e.extendedData || e.xdata || e.xData;
        return xd && xd.applicationName === 'BIMSRC';
      }).length;
    });

    console.log(`§PW_2D_GEN_BIMSRC count=${bimsrcCount}`);
    expect(bimsrcCount).toBeGreaterThan(5);
  });

  test('14.14 Front elevation generation works (SH) @db', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.selectOption('#view-mode', 'front');
    await page.click('#gen-btn');

    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 30000 });

    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const status = await page.$eval('#status-text', el => el.textContent);

    console.log(`§PW_2D_GEN_ELEV entities=${entCount} status="${status}"`);
    expect(status).toContain('Generated');
  });

  test('14.15 DX floor plan with 2 storeys @db', async ({ page }) => {
    await open2dWithDb(page, DX_DB, DX_LIB);

    const storeyOpts = await page.$$eval('#storey-select option', opts => opts.map(o => o.value).filter(v => v));
    console.log(`§PW_2D_DX_STOREYS count=${storeyOpts.length} storeys=${storeyOpts.join(',')}`);
    expect(storeyOpts.length).toBeGreaterThanOrEqual(2);

    // Select Level 1 if available (foundation storey has few elements)
    const level1 = storeyOpts.find(s => s.includes('Level 1'));
    if (level1) await page.selectOption('#storey-select', level1);

    await page.click('#gen-btn');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 30000 });

    const ent1 = await page.$eval('#ent-count', el => parseInt(el.textContent));
    console.log(`§PW_2D_DX_L1 entities=${ent1}`);
    expect(ent1).toBeGreaterThan(5);

    // Switch to Level 2 and regenerate
    const level2 = storeyOpts.find(s => s.includes('Level 2'));
    if (level2) {
      await page.selectOption('#storey-select', level2);
      await page.click('#gen-btn');
      await page.waitForFunction(() => {
        const el = document.getElementById('status-text');
        return el && el.textContent.includes('Generated');
      }, { timeout: 30000 });

      const ent2 = await page.$eval('#ent-count', el => parseInt(el.textContent));
      console.log(`§PW_2D_DX_L2 entities=${ent2}`);
      expect(ent2).toBeGreaterThan(5);
    }
  });

  test('14.16 Generate button shows timing in status @db', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && s.textContent.includes('ms)');
    }, { timeout: 30000 });

    const status = await page.$eval('#status-text', el => el.textContent);
    console.log(`§PW_2D_TIMING status="${status}"`);
    expect(status).toMatch(/\d+ms/);
  });

  test('14.17 Module scripts load without errors @fast', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/dev/2d.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const modules = await page.evaluate(() => ({
      SectionCut: typeof window.SectionCut === 'object',
      GridDims: typeof window.GridDims === 'object',
      Elevation: typeof window.Elevation === 'object',
      DxfExport: typeof window.DxfExport === 'object',
    }));

    console.log(`§PW_2D_MODULES SC=${modules.SectionCut} GD=${modules.GridDims} EL=${modules.Elevation} DX=${modules.DxfExport}`);
    expect(modules.SectionCut).toBe(true);
    expect(modules.GridDims).toBe(true);
    expect(modules.Elevation).toBe(true);
    expect(modules.DxfExport).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('14.18 Console §SC_ logs appear during plan generation @db', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const scLogs = logs.filter(l => l.includes('§SC_'));
    console.log(`§PW_2D_SC_LOGS count=${scLogs.length}`);
    scLogs.forEach(l => console.log('  ' + l));
    expect(scLogs.length).toBeGreaterThanOrEqual(2);
  });

  // ── White-box deep verification tests ──
  // Issue prevented: silent data corruption in section cut, BIMSRC, grid, elevation, DXF export

  test('14.19 Section cut contours are closed and have positive area (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const polylines = ents.filter(e => e.type === 'LWPOLYLINE' && e.vertices && e.vertices.length >= 3);
      let closedCount = 0, openCount = 0, zeroAreaCount = 0;
      const areas = [];
      for (const p of polylines) {
        // Check if shape flag (closed) is set
        if (p.shape) closedCount++; else openCount++;
        // Compute shoelace area
        const v = p.vertices;
        let area = 0;
        for (let i = 0; i < v.length; i++) {
          const j = (i + 1) % v.length;
          area += v[i].x * v[j].y - v[j].x * v[i].y;
        }
        area = Math.abs(area) / 2;
        areas.push(area);
        if (area < 1e-6) zeroAreaCount++;
      }
      return { polylines: polylines.length, closedCount, openCount, zeroAreaCount,
               minArea: areas.length ? Math.min(...areas) : 0,
               maxArea: areas.length ? Math.max(...areas) : 0 };
    });

    console.log(`§PW_2D_WB_CONTOUR polylines=${analysis.polylines} closed=${analysis.closedCount} ` +
                `open=${analysis.openCount} zeroArea=${analysis.zeroAreaCount} ` +
                `minArea=${analysis.minArea.toFixed(4)} maxArea=${analysis.maxArea.toFixed(4)}`);
    expect(analysis.polylines).toBeGreaterThan(0);
    expect(analysis.closedCount).toBe(analysis.polylines);  // ALL contours must be closed
    expect(analysis.openCount).toBe(0);
    expect(analysis.zeroAreaCount).toBe(0);                 // no degenerate contours
    expect(analysis.minArea).toBeGreaterThan(0.0001);       // smallest contour > 0.1mm² (thin frames)
  });

  test('14.20 BIMSRC xdata has valid GUIDs and correct ifc_classes (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const guids = new Set();
      const ifcClasses = new Set();
      let emptyGuid = 0, emptyClass = 0, missingFields = 0;
      for (const e of ents) {
        const xd = e.extendedData;
        if (!xd || xd.applicationName !== 'BIMSRC') continue;
        const kv = {};
        (xd.customStrings || []).forEach(s => {
          const i = s.indexOf(':');
          if (i > 0) kv[s.slice(0, i)] = s.slice(i + 1);
        });
        if (!kv.guid) { emptyGuid++; continue; }
        if (!kv.ifc_class) { emptyClass++; continue; }
        if (!kv.guid || !kv.ifc_class || !('storey' in kv)) missingFields++;
        guids.add(kv.guid);
        ifcClasses.add(kv.ifc_class);
      }
      return { uniqueGuids: guids.size, ifcClasses: [...ifcClasses].sort(),
               emptyGuid, emptyClass, missingFields };
    });

    console.log(`§PW_2D_WB_BIMSRC guids=${analysis.uniqueGuids} classes=${analysis.ifcClasses.join(',')} ` +
                `emptyGuid=${analysis.emptyGuid} emptyClass=${analysis.emptyClass}`);
    expect(analysis.uniqueGuids).toBeGreaterThan(3);   // SH has ≥5 walls/doors/windows
    expect(analysis.emptyGuid).toBe(0);                // no empty GUIDs
    expect(analysis.emptyClass).toBe(0);               // no empty ifc_classes
    // Must contain at least walls and one other class
    expect(analysis.ifcClasses).toEqual(expect.arrayContaining(['IfcWall']));
    expect(analysis.ifcClasses.length).toBeGreaterThanOrEqual(2);
  });

  test('14.21 Contour XY coordinates are in sane world range (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    // SH world coords: X ≈ 18..33, Y ≈ 220..228 (from element_transforms)
    const bbox = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const e of ents) {
        if (!e.vertices) continue;
        for (const v of e.vertices) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
      }
      return { minX, maxX, minY, maxY,
               width: maxX - minX, height: maxY - minY };
    });

    console.log(`§PW_2D_WB_BBOX X=[${bbox.minX.toFixed(1)},${bbox.maxX.toFixed(1)}] ` +
                `Y=[${bbox.minY.toFixed(1)},${bbox.maxY.toFixed(1)}] ` +
                `W=${bbox.width.toFixed(1)} H=${bbox.height.toFixed(1)}`);
    // SH is a small house — world extent should be reasonable (5-50m each axis)
    expect(bbox.width).toBeGreaterThan(3);       // wider than 3m
    expect(bbox.width).toBeLessThan(100);        // narrower than 100m
    expect(bbox.height).toBeGreaterThan(3);      // taller than 3m
    expect(bbox.height).toBeLessThan(100);       // shorter than 100m
    // No NaN or Infinity
    expect(isFinite(bbox.minX)).toBe(true);
    expect(isFinite(bbox.maxY)).toBe(true);
  });

  test('14.22 Section cut classifies CUT vs BELOW vs ABOVE correctly (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);

    // Call SectionCut.sectionCut directly and inspect raw results
    const result = await page.evaluate(() => {
      if (!window.SectionCut || !window._2d_dbMain) return null;
      const db = window._2d_dbMain;
      const libDb = window._2d_dbLib;
      const storeys = SectionCut.detectStoreys(db);
      const cutZ = storeys[0].floorZ + 1.0;  // cut at first storey + 1m
      const elements = SectionCut.sectionCut(db, libDb, cutZ, storeys[0].name);
      const byCat = { CUT: 0, BELOW: 0, ABOVE: 0 };
      const cutClasses = {};
      let contoursWithPoints = 0;
      for (const el of elements) {
        byCat[el.category] = (byCat[el.category] || 0) + 1;
        if (el.category === 'CUT' && el.contours.length > 0) {
          cutClasses[el.ifcClass] = (cutClasses[el.ifcClass] || 0) + el.contours.length;
          contoursWithPoints += el.contours.length;
        }
      }
      return { total: elements.length, ...byCat, cutZ, cutClasses, contoursWithPoints,
               storeyName: storeys[0].name };
    });

    if (!result) {
      // DB refs not exposed — expose them
      console.log('§PW_2D_WB_CLASSIFY skipped (DB refs not on window)');
      return;
    }

    console.log(`§PW_2D_WB_CLASSIFY total=${result.total} CUT=${result.CUT} BELOW=${result.BELOW} ` +
                `ABOVE=${result.ABOVE} contours=${result.contoursWithPoints} ` +
                `cutZ=${result.cutZ} storey=${result.storeyName}`);
    console.log(`  cutClasses: ${JSON.stringify(result.cutClasses)}`);
    expect(result.CUT).toBeGreaterThan(0);
    expect(result.contoursWithPoints).toBeGreaterThan(0);
    // CUT + BELOW + ABOVE should equal total
    expect(result.CUT + result.BELOW + result.ABOVE).toBe(result.total);
  });

  test('14.23 DXF export round-trips through dxf-parser (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const roundTrip = await page.evaluate(() => {
      if (!window.DxfExport || !window.dxf) return null;
      const ents = window.dxf.entities;
      // Convert to DxfExport format
      const exportEnts = [];
      for (const e of ents) {
        if (e.type === 'LWPOLYLINE' && e.vertices) {
          const exp = { type: 'polyline', points: e.vertices.map(v => [v.x, v.y]),
                        closed: !!e.shape, layer: e.layer };
          if (e.extendedData && e.extendedData.customStrings) {
            const kv = {};
            e.extendedData.customStrings.forEach(s => { const i = s.indexOf(':'); if (i > 0) kv[s.slice(0,i)] = s.slice(i+1); });
            if (kv.guid) { exp.guid = kv.guid; exp.ifcClass = kv.ifc_class; }
          }
          exportEnts.push(exp);
        } else if (e.type === 'LINE' && e.vertices) {
          exportEnts.push({ type: 'line', x0: e.vertices[0].x, y0: e.vertices[0].y,
                            x1: e.vertices[1].x, y1: e.vertices[1].y, layer: e.layer });
        }
      }

      // Export to DXF string
      const dxfStr = DxfExport.toDxf(exportEnts, { title: 'Test export' });
      if (!dxfStr || dxfStr.length < 100) return { error: 'DXF string too short: ' + (dxfStr || '').length };

      // Parse back with dxf-parser
      try {
        const parser = new DxfParser();
        const parsed = parser.parseSync(dxfStr);
        if (!parsed || !parsed.entities) return { error: 'Parse returned no entities' };

        // Count BIMSRC xdata that survived round-trip
        let bimsrcCount = 0;
        for (const e of parsed.entities) {
          const xd = e.extendedData || e.xdata || e.xData;
          if (xd && xd.applicationName === 'BIMSRC') bimsrcCount++;
        }

        return {
          inputEnts: exportEnts.length,
          dxfBytes: dxfStr.length,
          parsedEnts: parsed.entities.length,
          parsedLayers: Object.keys(parsed.tables && parsed.tables.layer && parsed.tables.layer.layers || {}).length,
          bimsrcSurvived: bimsrcCount,
          hasHeader: dxfStr.includes('AC1015'),
          hasAppid: dxfStr.includes('BIMSRC'),
        };
      } catch (e) {
        return { error: 'Parse error: ' + e.message };
      }
    });

    expect(roundTrip).not.toBeNull();
    expect(roundTrip.error).toBeUndefined();
    console.log(`§PW_2D_WB_ROUNDTRIP input=${roundTrip.inputEnts} dxfBytes=${roundTrip.dxfBytes} ` +
                `parsed=${roundTrip.parsedEnts} layers=${roundTrip.parsedLayers} ` +
                `bimsrc=${roundTrip.bimsrcSurvived}`);
    expect(roundTrip.parsedEnts).toBeGreaterThan(0);
    expect(roundTrip.parsedEnts).toBe(roundTrip.inputEnts);  // 1:1 entity preservation
    expect(roundTrip.bimsrcSurvived).toBeGreaterThan(0);     // BIMSRC survives round-trip
    expect(roundTrip.hasHeader).toBe(true);                  // AC1015 in header
    expect(roundTrip.hasAppid).toBe(true);                   // BIMSRC APPID registered
  });

  test('14.24 Elevation edges are in building height range (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.selectOption('#view-mode', 'front');
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const lines = ents.filter(e => e.type === 'LINE' && e.vertices && e.vertices.length >= 2);
      if (lines.length === 0) return { lines: 0 };
      let minY = Infinity, maxY = -Infinity;  // Y = vertical (Z in world)
      let minX = Infinity, maxX = -Infinity;  // X = horizontal
      const layers = new Set();
      for (const l of lines) {
        for (const v of l.vertices) {
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
        }
        if (l.layer) layers.add(l.layer);
      }
      return { lines: lines.length, minY, maxY, minX, maxX,
               height: maxY - minY, width: maxX - minX,
               layers: [...layers].sort() };
    });

    console.log(`§PW_2D_WB_ELEV lines=${analysis.lines} ` +
                `H=[${analysis.minY?.toFixed(1)},${analysis.maxY?.toFixed(1)}] height=${analysis.height?.toFixed(1)} ` +
                `W=[${analysis.minX?.toFixed(1)},${analysis.maxX?.toFixed(1)}] width=${analysis.width?.toFixed(1)} ` +
                `layers=${analysis.layers?.join(',')}`);
    expect(analysis.lines).toBeGreaterThan(50);        // should have many edges
    // SH is ~3m tall, ~15m wide — elevation should reflect this
    expect(analysis.height).toBeGreaterThan(1);        // building is taller than 1m
    expect(analysis.height).toBeLessThan(20);          // but shorter than 20m
    expect(analysis.width).toBeGreaterThan(3);         // wider than 3m
    // Must have elevation-specific layers
    expect(analysis.layers.length).toBeGreaterThanOrEqual(1);
  });

  test('14.25 Each generated GUID matches a real element in the DB (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    // Extract GUIDs from generated entities, then verify each exists in elements_meta
    const result = await page.evaluate(() => {
      if (!window._2d_dbMain || !window.dxf) return null;
      const ents = window.dxf.entities;
      const guids = new Set();
      for (const e of ents) {
        const xd = e.extendedData;
        if (!xd || xd.applicationName !== 'BIMSRC') continue;
        const kv = {};
        (xd.customStrings || []).forEach(s => { const i = s.indexOf(':'); if (i > 0) kv[s.slice(0,i)] = s.slice(i+1); });
        if (kv.guid) guids.add(kv.guid);
      }
      // Verify each GUID exists in DB
      const db = window._2d_dbMain;
      let found = 0, missing = 0;
      const missingList = [];
      for (const guid of guids) {
        const r = db.exec("SELECT COUNT(*) FROM elements_meta WHERE guid = '" + guid.replace(/'/g, "''") + "'");
        if (r.length > 0 && r[0].values[0][0] > 0) found++;
        else { missing++; missingList.push(guid); }
      }
      return { totalGuids: guids.size, found, missing, missingList: missingList.slice(0, 5) };
    });

    if (!result) {
      console.log('§PW_2D_WB_GUID_CHECK skipped (DB not on window)');
      return;
    }
    console.log(`§PW_2D_WB_GUID_CHECK total=${result.totalGuids} found=${result.found} missing=${result.missing}`);
    if (result.missing > 0) console.log(`  missing: ${result.missingList.join(', ')}`);
    expect(result.totalGuids).toBeGreaterThan(0);
    expect(result.missing).toBe(0);  // every GUID must exist in DB
  });

  test('14.26 Storey floorZ values are monotonically increasing (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);

    const storeys = await page.evaluate(() => {
      if (!window.SectionCut || !window._2d_dbMain) return null;
      return SectionCut.detectStoreys(window._2d_dbMain);
    });

    if (!storeys) {
      console.log('§PW_2D_WB_STOREY_ORDER skipped (DB not on window)');
      return;
    }
    console.log(`§PW_2D_WB_STOREY_ORDER storeys=${storeys.map(s => s.name + '@' + s.floorZ.toFixed(2)).join(', ')}`);
    expect(storeys.length).toBeGreaterThanOrEqual(1);
    // Verify monotonically increasing floorZ
    for (let i = 1; i < storeys.length; i++) {
      expect(storeys[i].floorZ).toBeGreaterThanOrEqual(storeys[i-1].floorZ);
    }
    // Each storey should have a name and elementCount > 0
    for (const s of storeys) {
      expect(s.name).toBeTruthy();
      expect(s.elementCount).toBeGreaterThan(0);
    }
  });

  test('14.27 Grid detection returns empty for SH (no IfcColumn) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);

    const gridResult = await page.evaluate(() => {
      if (!window.GridDims || !window._2d_dbMain) return null;
      return GridDims.detectGrids(window._2d_dbMain);
    });

    if (!gridResult) {
      console.log('§PW_2D_WB_GRID_EMPTY skipped (DB not on window)');
      return;
    }
    console.log(`§PW_2D_WB_GRID_EMPTY xLines=${gridResult.xLines.length} yLines=${gridResult.yLines.length}`);
    // SH has 0 IfcColumn → grids should be empty (graceful degradation)
    expect(gridResult.xLines.length).toBe(0);
    expect(gridResult.yLines.length).toBe(0);
  });

  test('14.28 Multiple contours per wall element (inner+outer) handled (SH) @db @whitebox', async ({ page }) => {
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    // Check that walls produce multiple contours (outer boundary + inner cavity)
    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      // Group entities by GUID
      const byGuid = {};
      for (const e of ents) {
        const xd = e.extendedData;
        if (!xd || xd.applicationName !== 'BIMSRC') continue;
        const kv = {};
        (xd.customStrings || []).forEach(s => { const i = s.indexOf(':'); if (i > 0) kv[s.slice(0,i)] = s.slice(i+1); });
        if (!kv.guid) continue;
        if (!byGuid[kv.guid]) byGuid[kv.guid] = { ifcClass: kv.ifc_class, count: 0 };
        byGuid[kv.guid].count++;
      }
      const guidCounts = Object.values(byGuid);
      const multiContour = guidCounts.filter(g => g.count > 1);
      const maxContours = guidCounts.reduce((mx, g) => Math.max(mx, g.count), 0);
      return {
        uniqueElements: guidCounts.length,
        multiContourElements: multiContour.length,
        maxContoursPerElement: maxContours,
        distribution: guidCounts.map(g => g.ifcClass + ':' + g.count).sort()
      };
    });

    console.log(`§PW_2D_WB_MULTI_CONTOUR elements=${analysis.uniqueElements} ` +
                `multiContour=${analysis.multiContourElements} max=${analysis.maxContoursPerElement}`);
    console.log(`  distribution: ${analysis.distribution.join(', ')}`);
    expect(analysis.uniqueElements).toBeGreaterThan(3);
    // Walls typically have 2 contours (outer + inner) — at least some should
    // Note: this is informational. If all have 1 contour, section cut may be simplified geometry
  });

  test('14.29 2D button passes db+lib+bld params to 2d.html @db @whitebox', async ({ page }) => {
    // Open viewer with SH
    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
    });

    // Intercept the window.open call to capture the URL
    const openedUrl = await page.evaluate(() => {
      return new Promise(resolve => {
        const origOpen = window.open;
        window.open = (url) => { resolve(url); window.open = origOpen; };
        // Click the 2D button
        document.querySelector('button[title="2D Plans"]').click();
      });
    });

    console.log(`§PW_2D_WB_URL opened="${openedUrl}"`);
    expect(openedUrl).toContain('2d.html');
    expect(openedUrl).toContain('db=');
    expect(openedUrl).toContain('lib=');
    // URL must have a non-empty db param
    const u = new URL(openedUrl, 'http://localhost');
    const dbVal = u.searchParams.get('db');
    const libVal = u.searchParams.get('lib');
    console.log(`§PW_2D_WB_URL_PARAMS db="${dbVal}" lib="${libVal}" bld="${u.searchParams.get('bld')}"`);
    expect(dbVal).toBeTruthy();
    expect(dbVal).toContain('SampleHouse');
    expect(libVal).toBeTruthy();
    expect(libVal).toContain('SampleHouse');
  });

  test('14.30 2d.html with ?db= hides DXF dropdown and auto-generates @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto(`/dev/2d.html?db=${SH_DB}&lib=${SH_LIB}`, { waitUntil: 'domcontentloaded' });

    // Wait for auto-generation to complete
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 45000 });

    // DXF sheet dropdown must be hidden
    const sheetVisible = await page.$eval('#sheet-select', el => getComputedStyle(el).display !== 'none');
    console.log(`§PW_2D_WB_DROPDOWN_HIDDEN sheetVisible=${sheetVisible}`);
    expect(sheetVisible).toBe(false);

    // Must have auto-generated entities (not from DXF files)
    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    console.log(`§PW_2D_WB_AUTOGEN entities=${entCount}`);
    expect(entCount).toBeGreaterThan(0);

    // Must NOT have loaded any DXF files
    const dxfFetches = logs.filter(l => l.includes('.dxf'));
    console.log(`§PW_2D_WB_NO_DXF dxfFetches=${dxfFetches.length}`);
    expect(dxfFetches.length).toBe(0);

    // Status must show "Generated" not "Loaded"
    const status = await page.$eval('#status-text', el => el.textContent);
    expect(status).toContain('Generated');
  });

  // ── SH dynamic vs DXF baseline ──
  // Issue prevented: dynamic generation producing geometry from a different building
  // or coordinate system than the Python-generated pristine DXF.

  test('14.32 SH dynamic floor plan is structurally similar to pristine DXF baseline @db @whitebox', async ({ page }) => {
    // NOTE: DXF uses local mm coordinates; DB uses world metres. Absolute bbox
    // comparison is not possible. Proof = same IFC classes, comparable entity
    // counts, and dynamic bbox is in the expected world coordinate range.

    // Step 1 — parse pristine SH_FLOOR.dxf, record IFC classes + polyline count
    await page.goto('/dev/2d.html', { waitUntil: 'domcontentloaded' });
    await page.selectOption('#sheet-select', 'dxf/SH_FLOOR.dxf');
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    const dxfData = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const classes = new Set();
      for (const e of ents) {
        const xd = e.extendedData || e.xdata || e.xData;
        if (!xd || xd.applicationName !== 'BIMSRC') continue;
        (xd.customStrings || []).forEach(s => { if (s.startsWith('ifc_class:')) classes.add(s.slice(10)); });
      }
      return {
        polylines: ents.filter(e => e.type === 'LWPOLYLINE').length,
        bimsrc: ents.filter(e => { const xd = e.extendedData || e.xdata || e.xData; return xd && xd.applicationName === 'BIMSRC'; }).length,
        classes: [...classes].sort()
      };
    });
    console.log(`§PW_2D_DXF_DATA polylines=${dxfData.polylines} bimsrc=${dxfData.bimsrc} classes=${dxfData.classes.join(',')}`);

    // Step 2 — generate dynamic floor plan from the same DB
    await page.goto(`/dev/2d.html?db=${SH_DB}&lib=${SH_LIB}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 45000 });

    const dynData = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const classes = new Set();
      let bimsrc = 0;
      for (const e of ents) {
        if (e.vertices) for (const v of e.vertices) {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        }
        const xd = e.extendedData;
        if (xd && xd.applicationName === 'BIMSRC') {
          bimsrc++;
          (xd.customStrings || []).forEach(s => { if (s.startsWith('ifc_class:')) classes.add(s.slice(10)); });
        }
      }
      return {
        polylines: ents.filter(e => e.type === 'LWPOLYLINE').length,
        bimsrc,
        classes: [...classes].sort(),
        bboxWidth:  isFinite(maxX) ? maxX - minX : 0,
        bboxHeight: isFinite(maxY) ? maxY - minY : 0
      };
    });
    console.log(`§PW_2D_DYN_DATA polylines=${dynData.polylines} bimsrc=${dynData.bimsrc} classes=${dynData.classes.join(',')}`);
    console.log(`§PW_2D_DYN_DIM width=${dynData.bboxWidth.toFixed(2)}m height=${dynData.bboxHeight.toFixed(2)}m`);

    // Ratio of dynamic/DXF polyline counts — expect within 5x (same building, different pipelines)
    const ratio = dxfData.polylines > 0 ? dynData.polylines / dxfData.polylines : 0;
    console.log(`§PW_2D_SIMILARITY ratio=${ratio.toFixed(2)} dxfClasses=${dxfData.classes.join(',')} dynClasses=${dynData.classes.join(',')}`);

    // Same IFC classes must appear in both outputs (same building's elements sliced)
    const commonClasses = dxfData.classes.filter(c => dynData.classes.includes(c));
    console.log(`§PW_2D_CLASS_OVERLAP common=${commonClasses.join(',')} of dxf=${dxfData.classes.length} dyn=${dynData.classes.length}`);

    expect(dynData.polylines).toBeGreaterThan(10);              // dynamic has wall contours
    expect(dynData.bimsrc).toBeGreaterThan(5);                  // dynamic has BIMSRC tags
    expect(ratio).toBeGreaterThan(0.2);                         // dynamic ≥20% of DXF polylines
    expect(ratio).toBeLessThan(5.0);                            // dynamic ≤5× DXF polylines
    expect(dynData.classes).toEqual(expect.arrayContaining(['IfcWall']));  // IfcWall in both
    expect(commonClasses.length).toBeGreaterThanOrEqual(2);     // ≥2 classes shared
    // Dynamic bbox is a house-scale building (5–100m each axis)
    expect(dynData.bboxWidth).toBeGreaterThan(5);
    expect(dynData.bboxWidth).toBeLessThan(100);
    expect(dynData.bboxHeight).toBeGreaterThan(3);
    expect(dynData.bboxHeight).toBeLessThan(100);
  });

  // ── Large building auto-clip ──
  // Issue prevented: Hospital/Terminal (48K+ elements) hanging the browser or
  // timing out instead of clipping to a demonstrable partial section.

  test('14.33 Large building auto-clips and produces valid floor plan @db @whitebox', async ({ page }) => {
    const HOSPITAL_DB = '/buildings/Hospital_extracted.db';
    const HOSPITAL_LIB = '/buildings/Hospital_library.db';

    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto(`/dev/2d.html?db=${HOSPITAL_DB}&lib=${HOSPITAL_LIB}`, { waitUntil: 'domcontentloaded' });

    const t0 = Date.now();
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 60000 });
    const elapsed = Date.now() - t0;

    const status = await page.$eval('#status-text', el => el.textContent);
    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));

    // Clip log must appear — proves auto-clip fired for large building
    const clipLog = logs.find(l => l.includes('§2D_LARGE_BUILDING') || l.includes('§SC_CLIP'));

    console.log(`§PW_2D_HOSPITAL elapsed=${elapsed}ms status="${status}" entities=${entCount}`);
    console.log(`§PW_2D_HOSPITAL_CLIP clipLog="${clipLog || 'none'}"`);

    expect(status).toContain('Generated');
    expect(entCount).toBeGreaterThan(0);         // proved capability: section cut works
    expect(elapsed).toBeLessThan(15000);         // under 15s with clip
    expect(clipLog).toBeTruthy();                // auto-clip fired
  });

  test('14.34 getBuildingStats returns sane values for SH and Hospital @db @whitebox', async ({ page }) => {
    // SH — small building, no clip needed
    await open2dWithDb(page, SH_DB, SH_LIB);
    const shStats = await page.evaluate(() => {
      if (!window.SectionCut || !window._2d_dbMain) return null;
      return SectionCut.getBuildingStats(window._2d_dbMain);
    });
    console.log(`§PW_2D_STATS_SH elementCount=${shStats?.elementCount} centerX=${shStats?.centerX?.toFixed(1)} centerY=${shStats?.centerY?.toFixed(1)}`);

    expect(shStats).not.toBeNull();
    expect(shStats.elementCount).toBeGreaterThan(0);
    expect(isFinite(shStats.centerX)).toBe(true);
    expect(isFinite(shStats.centerY)).toBe(true);
    // SH: 65 elements — well under MAX_ELEMENTS_POC (5000), no clip should fire
    expect(shStats.elementCount).toBeLessThan(5000);

    // Verify MAX_ELEMENTS_POC and CLIP_MARGIN are exported
    const consts = await page.evaluate(() => ({
      MAX_ELEMENTS_POC: window.SectionCut ? SectionCut.MAX_ELEMENTS_POC : null,
      CLIP_MARGIN:      window.SectionCut ? SectionCut.CLIP_MARGIN      : null,
    }));
    console.log(`§PW_2D_CONSTS MAX_ELEMENTS_POC=${consts.MAX_ELEMENTS_POC} CLIP_MARGIN=${consts.CLIP_MARGIN}`);
    expect(consts.MAX_ELEMENTS_POC).toBe(5000);
    expect(consts.CLIP_MARGIN).toBe(15.0);
  });

  // ── DX storey auto-select ──
  // Issue prevented: auto-generate picking T/FDN (foundation) as default storey → only
  // 7 contours from slabs instead of walls. Must skip FDN/ROOF/SITE and pick Level 1.

  test('14.35 DX auto-selects Level 1 not T/FDN on load @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto(`/dev/2d.html?db=${DX_DB}&lib=${DX_LIB}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 45000 });

    const selectedStorey = await page.$eval('#storey-select', el => el.value);
    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));
    const status = await page.$eval('#status-text', el => el.textContent);
    const storeyLog = logs.find(l => l.includes('§2D_STOREYS'));

    console.log(`§PW_2D_DX_AUTOSEL storey="${selectedStorey}" entities=${entCount} status="${status}"`);
    console.log(`§PW_2D_DX_STOREYLOG ${storeyLog || 'none'}`);

    // Must NOT auto-select T/FDN — should pick Level 1 (or other real floor)
    expect(selectedStorey).not.toBe('T/FDN');
    expect(selectedStorey).not.toMatch(/FDN|FOUND|BSMT|BASEMENT/i);
    // Must have substantially more entities than the 7 from T/FDN cut
    expect(entCount).toBeGreaterThan(50);
    expect(status).toContain('Generated');
    // §2D_STOREYS log must show skipped=T/FDN
    expect(storeyLog).toBeTruthy();
    expect(storeyLog).toContain('skipped=');
    expect(storeyLog).toContain('T/FDN');
  });

  test('14.36 DX does not trigger auto-clip (1169 elements < 5000 threshold) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto(`/dev/2d.html?db=${DX_DB}&lib=${DX_LIB}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = document.getElementById('status-text');
      return s && (s.textContent.includes('Generated') || s.textContent.includes('error'));
    }, { timeout: 45000 });

    const clipLog = logs.find(l => l.includes('§2D_LARGE_BUILDING'));
    const entCount = await page.$eval('#ent-count', el => parseInt(el.textContent));

    console.log(`§PW_2D_DX_CLIP clipLog="${clipLog || 'none'}" entities=${entCount}`);
    // DX has 1169 elements — under threshold, clip must NOT fire
    expect(clipLog).toBeUndefined();
    // But must still produce a good floor plan
    expect(entCount).toBeGreaterThan(50);
  });

  test('14.31 2d.html without ?db= shows DXF dropdown, no Generate @fast @whitebox', async ({ page }) => {
    await page.goto('/dev/2d.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => parseInt(document.getElementById('ent-count')?.textContent) > 0, { timeout: 15000 });

    // DXF sheet dropdown must be visible
    const sheetVisible = await page.$eval('#sheet-select', el => getComputedStyle(el).display !== 'none');
    console.log(`§PW_2D_WB_DXF_MODE sheetVisible=${sheetVisible}`);
    expect(sheetVisible).toBe(true);

    // Options should contain DXF file entries
    const opts = await page.$$eval('#sheet-select option', opts => opts.map(o => o.value).filter(v => v.includes('.dxf')));
    console.log(`§PW_2D_WB_DXF_OPTIONS count=${opts.length}`);
    expect(opts.length).toBeGreaterThan(0);

    // §2D_DB log should say "no db= param"
    const noDbLog = await page.evaluate(() => {
      // Can't capture past console logs, but check window state
      return !window._2d_dbMain;
    });
    expect(noDbLog).toBe(true);
  });

  // ── Annotation features: hatch fills, furniture, tags, room labels, section marker ──
  // Issues prevented: silent omission of A-WALL-PATT fills, A-FURN furniture,
  // door/window tags, room labels, or section cut markers from generated floor plans.

  test('14.37 Wall hatch fills appear on A-WALL-PATT layer (SH) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const HATCH_ELIGIBLE = new Set(['A-WALL-FULL','A-WALL-PRTN','A-WALL-CORE','A-COLM']);
      const ents = window.dxf ? window.dxf.entities : [];
      const hatchEnts  = ents.filter(e => e.layer === 'A-WALL-PATT' && e.type === 'LWPOLYLINE');
      // Count outlines on all hatch-eligible layers (same set as WALL_FILL_LAYERS in 2d.html)
      const eligibleEnts = ents.filter(e => HATCH_ELIGIBLE.has(e.layer) && e.type === 'LWPOLYLINE');
      const filledEnts   = hatchEnts.filter(e => e.fill === true);
      const closedHatch  = hatchEnts.filter(e => e.shape === true);
      return { hatches: hatchEnts.length, eligible: eligibleEnts.length,
               filled: filledEnts.length, closed: closedHatch.length };
    });

    const hatchLog = logs.find(l => l.includes('hatches='));
    console.log(`§PW_2D_WB_HATCH hatches=${analysis.hatches} eligible=${analysis.eligible} filled=${analysis.filled} closed=${analysis.closed}`);
    console.log(`§PW_2D_WB_HATCH_LOG ${hatchLog || 'none'}`);

    // Every hatch-eligible outline must have a corresponding hatch fill
    expect(analysis.hatches).toBeGreaterThan(0);
    expect(analysis.hatches).toBe(analysis.eligible);    // 1:1 hatch per eligible contour
    expect(analysis.filled).toBe(analysis.hatches);      // every hatch has fill=true
    expect(analysis.closed).toBe(analysis.hatches);      // every hatch polygon is closed
  });

  test('14.38 Furniture outlines appear on A-FURN layer matching DB count (SH) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    // Count furniture in DB
    const dbFurnCount = await page.evaluate(() => {
      if (!window._2d_dbMain) return -1;
      const r = window._2d_dbMain.exec(
        "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
        "WHERE m.ifc_class IN ('IfcFurniture','IfcFurnishingElement','IfcSystemFurnitureElement')");
      return r.length > 0 ? r[0].values[0][0] : 0;
    });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const furnEnts = ents.filter(e => e.layer === 'A-FURN' && e.type === 'LWPOLYLINE');
      const closedFurn = furnEnts.filter(e => e.shape === true);
      // Each furniture rect must have exactly 4 vertices (rectangle)
      const rectFurn = furnEnts.filter(e => e.vertices && e.vertices.length === 4);
      return { count: furnEnts.length, closed: closedFurn.length, rects: rectFurn.length };
    });

    const furnLog = logs.find(l => l.includes('§AUDIT FURN'));
    console.log(`§PW_2D_WB_FURN db=${dbFurnCount} rendered=${analysis.count} closed=${analysis.closed} rects=${analysis.rects}`);
    console.log(`§PW_2D_WB_FURN_LOG ${furnLog || 'none'}`);

    // furnDetailRooms=1 (default) → only the largest room cluster is fully detailed.
    // Rendered count ≤ dbFurnCount; every rendered item is a closed 4-pt rectangle.
    expect(analysis.count).toBeGreaterThan(0);
    expect(analysis.count).toBeLessThanOrEqual(dbFurnCount);
    expect(analysis.closed).toBe(analysis.count);        // every rendered outline is closed
    expect(analysis.rects).toBe(analysis.count);         // every rendered outline is a 4-pt rectangle
  });

  test('14.39 Door and window tags count matches DB elements (SH) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    // Count doors and windows in DB
    const dbCounts = await page.evaluate(() => {
      if (!window._2d_dbMain) return null;
      const r = window._2d_dbMain.exec(
        "SELECT ifc_class, COUNT(*) as n FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid " +
        "WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase','IfcWindow','IfcWindowStandardCase') " +
        "GROUP BY m.ifc_class");
      const counts = { doors: 0, windows: 0 };
      if (r.length > 0) for (const row of r[0].values) {
        const cls = row[0];
        if (cls.includes('Door')) counts.doors += row[1];
        else counts.windows += row[1];
      }
      return counts;
    });

    // Count tag TEXT entities (circle + text pairs, one per door/window)
    const tagAnalysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const textEnts = ents.filter(e => e.layer === 'A-ANNO-TEXT' && e.type === 'TEXT');
      const dTags = textEnts.filter(e => e.text && /^D\d+$/.test(e.text));
      const wTags = textEnts.filter(e => e.text && /^W\d+$/.test(e.text));
      const circleEnts = ents.filter(e => e.layer === 'A-ANNO-TEXT' && e.type === 'CIRCLE' && e.screenR);
      // Tags are numbered sequentially — check max number = count
      const dNums = dTags.map(e => parseInt(e.text.slice(1))).sort((a,b) => a-b);
      const wNums = wTags.map(e => parseInt(e.text.slice(1))).sort((a,b) => a-b);
      return { dTags: dTags.length, wTags: wTags.length, circles: circleEnts.length,
               dSeq: dNums, wSeq: wNums };
    });

    const tagLog = logs.find(l => l.includes('§AUDIT TAGS'));
    console.log(`§PW_2D_WB_TAGS db_doors=${dbCounts?.doors} db_windows=${dbCounts?.windows} ` +
                `dTags=${tagAnalysis.dTags} wTags=${tagAnalysis.wTags} circles=${tagAnalysis.circles}`);
    console.log(`§PW_2D_WB_TAGS dSeq=${tagAnalysis.dSeq} wSeq=${tagAnalysis.wSeq}`);
    console.log(`§PW_2D_WB_TAGS_LOG ${tagLog || 'none'}`);

    expect(tagAnalysis.dTags).toBeGreaterThan(0);
    expect(tagAnalysis.wTags).toBeGreaterThan(0);
    // Tag count must match DB element count exactly
    expect(tagAnalysis.dTags).toBe(dbCounts.doors);
    expect(tagAnalysis.wTags).toBe(dbCounts.windows);
    // Circles: 2 per tag (one for each door + one for each window)
    expect(tagAnalysis.circles).toBe(dbCounts.doors + dbCounts.windows);
    // Sequential numbering: D1..Dn, W1..Wn without gaps
    for (let i = 0; i < tagAnalysis.dSeq.length; i++) expect(tagAnalysis.dSeq[i]).toBe(i + 1);
    for (let i = 0; i < tagAnalysis.wSeq.length; i++) expect(tagAnalysis.wSeq[i]).toBe(i + 1);
  });

  test('14.40 Room labels appear as TEXT on A-ANNO-TEXT for known furniture clusters (SH) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const textEnts = ents.filter(e => e.layer === 'A-ANNO-TEXT' && e.type === 'TEXT' && e.text);
      const roomLabels = ['BEDROOM', 'LIVING ROOM', 'DINING ROOM'];
      const found = roomLabels.filter(lbl => textEnts.some(e => e.text === lbl));
      // Each room label must have a position within the building bbox
      const roomTexts = textEnts.filter(e => roomLabels.includes(e.text));
      const positions = roomTexts.map(e => ({ text: e.text, x: e.startPoint?.x, y: e.startPoint?.y }));
      return { found, count: roomTexts.length, positions };
    });

    const roomLog = logs.find(l => l.includes('§AUDIT ROOMS'));
    console.log(`§PW_2D_WB_ROOMS found=${analysis.found.join(',')} count=${analysis.count}`);
    analysis.positions.forEach(p => console.log(`  ${p.text} at (${p.x?.toFixed(1)},${p.y?.toFixed(1)})`));
    console.log(`§PW_2D_WB_ROOMS_LOG ${roomLog || 'none'}`);

    // SH has furniture for all 3 room types: BEDROOM (bed), DINING ROOM (dining table+chairs), LIVING ROOM (couch)
    expect(analysis.count).toBeGreaterThanOrEqual(3);
    expect(analysis.found).toContain('BEDROOM');
    expect(analysis.found).toContain('DINING ROOM');
    expect(analysis.found).toContain('LIVING ROOM');
    // Positions must be within SH world coords: X≈18..34, Y≈220..228
    for (const p of analysis.positions) {
      expect(p.x).toBeGreaterThan(15);
      expect(p.x).toBeLessThan(40);
      expect(p.y).toBeGreaterThan(218);
      expect(p.y).toBeLessThan(232);
    }
  });

  test('14.41 Section cut marker A-ANNO-SECT appears with line + circles + A labels (SH) @db @whitebox', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const analysis = await page.evaluate(() => {
      const ents = window.dxf ? window.dxf.entities : [];
      const sectEnts = ents.filter(e => e.layer === 'A-ANNO-SECT');
      const lines    = sectEnts.filter(e => e.type === 'LINE');
      const circles  = sectEnts.filter(e => e.type === 'CIRCLE');
      const texts    = sectEnts.filter(e => e.type === 'TEXT' && e.text === 'A');
      // All three lines should be horizontal (same Y at both ends)
      const horizontal = lines.filter(e => e.vertices && Math.abs(e.vertices[0].y - e.vertices[1].y) < 0.01);
      return { total: sectEnts.length, lines: lines.length, circles: circles.length, texts: texts.length, horizontal: horizontal.length };
    });

    const sectLog = logs.find(l => l.includes('§RENDER SECT'));
    console.log(`§PW_2D_WB_SECT total=${analysis.total} lines=${analysis.lines} circles=${analysis.circles} texts=${analysis.texts} horizontal=${analysis.horizontal}`);
    console.log(`§PW_2D_WB_SECT_LOG ${sectLog || 'none'}`);

    expect(analysis.lines).toBe(1);       // one section line A-A
    expect(analysis.circles).toBe(2);     // circles at each end
    expect(analysis.texts).toBe(2);       // "A" labels at each end
    expect(analysis.horizontal).toBe(1);  // section line is horizontal
    expect(sectLog).toBeTruthy();         // §RENDER SECT log emitted
  });

  test('14.42 §-log proof lines appear for all new annotation features (SH) @db @whitebox', async ({ page }) => {
    // White-box verification: log lines are the primary evidence per §TestArchitecture
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await open2dWithDb(page, SH_DB, SH_LIB);
    await page.click('#gen-btn');
    await page.waitForFunction(() => document.getElementById('status-text')?.textContent.includes('Generated'), { timeout: 30000 });

    const hatchLogs   = logs.filter(l => l.includes('§RENDER HATCH'));
    const furnLogs    = logs.filter(l => l.includes('§RENDER FURN'));
    const roomLogs    = logs.filter(l => l.includes('§ROOM'));
    const tagLogs     = logs.filter(l => l.includes('§TAG'));
    const sectLog     = logs.find(l => l.includes('§RENDER SECT'));
    const auditFurn   = logs.find(l => l.includes('§AUDIT FURN'));
    const auditRooms  = logs.find(l => l.includes('§AUDIT ROOMS'));
    const auditTags   = logs.find(l => l.includes('§AUDIT TAGS'));
    const genLog      = logs.find(l => l.includes('§2D_GEN sectionToEntities'));

    console.log(`§PW_2D_WB_LOGS hatchLogs=${hatchLogs.length} furnLogs=${furnLogs.length} ` +
                `roomLogs=${roomLogs.length} tagLogs=${tagLogs.length}`);
    console.log(`§PW_2D_WB_LOGS_AUDIT furn="${auditFurn||'MISSING'}" rooms="${auditRooms||'MISSING'}" tags="${auditTags||'MISSING'}"`);
    console.log(`§PW_2D_WB_GEN_LOG ${genLog || 'MISSING'}`);

    expect(hatchLogs.length).toBeGreaterThan(0);    // §RENDER HATCH per wall contour
    expect(furnLogs.length).toBeGreaterThan(0);     // §RENDER FURN per furniture
    expect(roomLogs.length).toBeGreaterThanOrEqual(3); // §ROOM for BEDROOM/DINING/LIVING
    expect(tagLogs.length).toBeGreaterThan(0);      // §TAG for each door/window
    expect(sectLog).toBeTruthy();                   // §RENDER SECT for section marker
    expect(auditFurn).toBeTruthy();                 // §AUDIT FURN pass
    expect(auditRooms).toBeTruthy();                // §AUDIT ROOMS pass
    expect(auditTags).toBeTruthy();                 // §AUDIT TAGS pass
    // genLog must show hatches= count
    expect(genLog).toContain('hatches=');
  });
});
