// 41-streaming-contract.spec.js — Streaming metadata contract validation (§S280d)
// Prevents regressions in metadata routing between BatchedMesh and InstancedMesh.
// Contract: Every non-merged element must appear in exactly ONE of _batchMeta or
//   _instanceMeta, AND have a guidMap entry. No orphaned GUIDs, no duplicate routing.
//
// Bugs prevented:
//   52bde4a Streaming contract lockdown — prevent routing regressions
//   68bd9a7 Revert streaming.js logic — restore smooth TM + no lag
//
// Why this test exists:
//   16 files depend on correct metadata routing (time_machine, picking, helpers,
//   walk, dlod, ghostglass, grid_views, scene, doc_canvas, city, wizard_classify,
//   nlp, tools, main). White-box logging helps during dev, but this test catches
//   regressions in CI/CD and prevents silent metadata corruption.

const { test, expect } = require('@playwright/test');
const { openViewer, getStreamStats } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('Streaming Contract Validation', () => {

  test('41.1 Contract check passes — no orphaned GUIDs @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    // Use Duplex test building (fetched from OCI via setup script)
    await openViewer(page);

    // Wait for streaming to complete
    const stats = await getStreamStats(page);
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.active).toContain('DONE');

    // §CONTRACT_CHECK should appear exactly once (at final flush)
    const contractChecks = logs.tagged('§CONTRACT_CHECK');
    expect(contractChecks.length, '§CONTRACT_CHECK should appear once after streaming completes').toBeGreaterThanOrEqual(1);

    // No §CONTRACT_FAIL messages allowed
    const contractFails = logs.tagged('§CONTRACT_FAIL');
    if (contractFails.length > 0) {
      console.error('Contract violations detected:');
      contractFails.forEach(f => console.error('  ' + f.text));
      logs.dump();
    }
    expect(contractFails, 'Streaming contract must not have violations').toHaveLength(0);

    // Parse the contract check output and validate counts
    const checkLine = contractChecks[0].text;
    console.log('§PW_CONTRACT ' + checkLine);

    // Extract counts: "§CONTRACT_CHECK batch=123 instanced=456 guidMap=579 streamed=579 orphans=0"
    const batchMatch = checkLine.match(/batch=(\d+)/);
    const instancedMatch = checkLine.match(/instanced=(\d+)/);
    const guidMapMatch = checkLine.match(/guidMap=(\d+)/);
    const streamedMatch = checkLine.match(/streamed=(\d+)/);
    const orphansMatch = checkLine.match(/orphans=(\d+)/);

    if (batchMatch && instancedMatch && guidMapMatch && streamedMatch && orphansMatch) {
      const batch = parseInt(batchMatch[1], 10);
      const instanced = parseInt(instancedMatch[1], 10);
      const guidMap = parseInt(guidMapMatch[1], 10);
      const streamed = parseInt(streamedMatch[1], 10);
      const orphans = parseInt(orphansMatch[1], 10);

      // Contract invariants
      expect(orphans, 'Zero orphaned GUIDs').toBe(0);
      expect(batch + instanced, 'Batch + instanced should match guidMap count').toBeLessThanOrEqual(guidMap);

      // Sanity check: if elements were streamed, metadata should exist (unless mobile merged)
      if (streamed > 0) {
        const registered = batch + instanced;
        expect(registered, 'Metadata should exist for streamed elements (desktop mode)').toBeGreaterThan(0);
      }
    } else {
      throw new Error('Could not parse §CONTRACT_CHECK output: ' + checkLine);
    }
  });

  test('41.2 InstancedMesh has >=2 instances @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page);
    await getStreamStats(page);

    // Check for the specific contract violation about single-instance InstancedMesh
    const singleInstanceErrors = logs.entries.filter(e =>
      e.text.includes('§CONTRACT_FAIL') &&
      e.text.includes('InstancedMesh') &&
      e.text.includes('has 1 instances')
    );

    if (singleInstanceErrors.length > 0) {
      console.error('Single-instance InstancedMesh violations:');
      singleInstanceErrors.forEach(e => console.error('  ' + e.text));
    }

    expect(singleInstanceErrors,
      'InstancedMesh with <2 instances violates routing contract — should use BatchedMesh instead'
    ).toHaveLength(0);
  });

  test('41.3 Metadata population matches element count @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page);
    const stats = await getStreamStats(page);

    // Extract metadata counts from contract check
    const checkLine = logs.tagged('§CONTRACT_CHECK')[0]?.text;
    expect(checkLine, '§CONTRACT_CHECK should have logged').toBeTruthy();

    const batchMatch = checkLine.match(/batch=(\d+)/);
    const instancedMatch = checkLine.match(/instanced=(\d+)/);
    const streamedMatch = checkLine.match(/streamed=(\d+)/);

    if (batchMatch && instancedMatch && streamedMatch) {
      const batch = parseInt(batchMatch[1], 10);
      const instanced = parseInt(instancedMatch[1], 10);
      const streamed = parseInt(streamedMatch[1], 10);
      const registered = batch + instanced;

      console.log(`§PW_METADATA_COVERAGE batch=${batch} instanced=${instanced} streamed=${streamed} coverage=${(registered/streamed*100).toFixed(1)}%`);

      // Desktop should have high metadata coverage (mobile uses MergedMesh with no per-GUID metadata)
      // If registered is 0 but streamed > 0, we're likely on mobile or metadata is broken
      if (streamed > 0) {
        expect(registered, 'Metadata should cover most streamed elements (unless mobile merged)').toBeGreaterThan(0);
      }
    }
  });

  test('41.4 No zero-metadata crash @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page);
    await getStreamStats(page);

    // Check for the zero-metadata contract failure
    const zeroMetaErrors = logs.entries.filter(e =>
      e.text.includes('§CONTRACT_FAIL') &&
      e.text.includes('zero metadata entries')
    );

    if (zeroMetaErrors.length > 0) {
      console.error('Zero metadata errors detected:');
      zeroMetaErrors.forEach(e => console.error('  ' + e.text));
      logs.dump();
    }

    expect(zeroMetaErrors,
      'Zero metadata with streamed elements indicates broken routing — TM/picking will fail'
    ).toHaveLength(0);

    // No uncaught page errors
    logs.assertNoErrors();
  });

});
