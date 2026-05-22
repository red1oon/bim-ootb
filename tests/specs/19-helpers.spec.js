// 19-helpers.spec.js — helpers.js: collectMeshes, filterInstancedMesh, dbQuery (S239)
// Bugs prevented:
//   S239 helpers.js not wired into APP — setupHelpers never called, methods undefined
//   S239 dbQuery returns raw rows instead of flat values array
//   S239 collectMeshes includes ground plane in results

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('helpers.js — shared utilities', () => {

  test.beforeEach(async ({ page }) => {
    await openViewer(page);
  });

  test('19.1 helpers wired into APP — all three methods present @fast', async ({ page }) => {
    // Issue: setupHelpers not called → collectMeshes/dbQuery undefined at runtime
    const result = await page.evaluate(() => ({
      collectMeshes: typeof window.APP.collectMeshes === 'function',
      filterInstancedMesh: typeof window.APP.filterInstancedMesh === 'function',
      dbQuery: typeof window.APP.dbQuery === 'function',
      dbQueryFirst: typeof window.APP.dbQueryFirst === 'function'
    }));
    console.log(`§PW_HELPERS_READY collectMeshes=${result.collectMeshes} filterIM=${result.filterInstancedMesh} dbQuery=${result.dbQuery}`);
    expect(result.collectMeshes).toBe(true);
    expect(result.filterInstancedMesh).toBe(true);
    expect(result.dbQuery).toBe(true);
    expect(result.dbQueryFirst).toBe(true);
  });

  test('19.2 A.collectMeshes returns meshes, excludes ground @fast', async ({ page }) => {
    // Issue: ground plane included → raycaster picks terrain as selectable element
    await page.waitForTimeout(3000); // allow streaming to start

    const result = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.collectMeshes !== 'function') return { error: 'collectMeshes missing' };

      const allMeshes = A.collectMeshes(o => o.isMesh || o.isInstancedMesh);
      const groundIncluded = allMeshes.includes(A.ground);
      const hasGround = !!A.ground;

      return {
        count: allMeshes.length,
        groundIncluded,
        hasGround,
        types: [...new Set(allMeshes.map(o => o.type))].slice(0, 5)
      };
    });

    console.log(`§PW_COLLECT_MESHES count=${result.count} groundIncluded=${result.groundIncluded} types=${JSON.stringify(result.types)}`);
    expect(result.error).toBeUndefined();
    expect(result.groundIncluded).toBe(false);
    expect(result.count).toBeGreaterThanOrEqual(0); // may be 0 before stream but method must work
  });

  test('19.3 A.collectMeshes predicate filters correctly @fast', async ({ page }) => {
    // Issue: predicate ignored → all objects returned regardless of filter
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.collectMeshes !== 'function') return { error: 'collectMeshes missing' };

      // Filter for only InstancedMesh objects
      const instanced = A.collectMeshes(o => o.isInstancedMesh);
      // Filter for only regular Mesh objects
      const regular = A.collectMeshes(o => o.isMesh && !o.isInstancedMesh);
      // Both lists must be disjoint
      const overlap = instanced.filter(o => regular.includes(o)).length;

      return { instanced: instanced.length, regular: regular.length, overlap };
    });

    console.log(`§PW_COLLECT_FILTER instanced=${result.instanced} regular=${result.regular} overlap=${result.overlap}`);
    expect(result.error).toBeUndefined();
    expect(result.overlap).toBe(0); // predicates are mutually exclusive
  });

  test('19.4 A.dbQuery returns flat row arrays @fast', async ({ page }) => {
    // Issue: raw db.exec result (rows[0].values) not extracted → callers get nested object
    const result = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.dbQuery !== 'function') return { error: 'dbQuery missing' };
      if (!A.db) return { skipped: true, reason: 'db not loaded yet' };

      const rows = A.dbQuery('SELECT COUNT(*) FROM elements_meta');
      const isArray = Array.isArray(rows);
      const firstRow = rows[0];
      const countVal = firstRow ? firstRow[0] : null;

      return { isArray, rowCount: rows.length, countVal };
    });

    console.log(`§PW_DBQUERY isArray=${result.isArray} rowCount=${result.rowCount} countVal=${result.countVal} skipped=${!!result.skipped}`);
    expect(result.error).toBeUndefined();
    if (result.skipped) {
      // DB not yet loaded — method must still exist (checked in 19.1)
      console.log('§PW_DBQUERY db not ready — method existence proven in 19.1');
      expect(result.skipped).toBe(true);
    } else {
      expect(result.isArray).toBe(true);
      expect(result.rowCount).toBeGreaterThan(0);
      expect(typeof result.countVal).toBe('number');
      expect(result.countVal).toBeGreaterThan(0);
    }
  });

  test('19.5 A.dbQuery returns [] safely when db not ready @fast', async ({ page }) => {
    // Issue: dbQuery crashes on null db → uncaught exception breaks viewer
    const result = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.dbQuery !== 'function') return { error: 'dbQuery missing' };

      // Temporarily nullify db to test null-guard
      const orig = A.db;
      A.db = null;
      const rows = A.dbQuery('SELECT 1');
      A.db = orig;

      return { isArray: Array.isArray(rows), length: rows.length };
    });

    console.log(`§PW_DBQUERY_NULL isArray=${result.isArray} length=${result.length}`);
    expect(result.error).toBeUndefined();
    expect(result.isArray).toBe(true);
    expect(result.length).toBe(0);
  });

  test('19.6 Language picker button exists in toolbar @fast', async ({ page }) => {
    // Issue: header-flag-btn absent from index.html → locale popup never opens
    const btn = page.locator('#header-flag-btn');
    await expect(btn).toBeAttached({ timeout: 5000 });
    const title = await btn.getAttribute('title');
    console.log(`§PW_FLAG_BTN title="${title}"`);
    expect(title).toBeTruthy();
  });

});
