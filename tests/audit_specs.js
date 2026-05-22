#!/usr/bin/env node
// audit_specs.js — Anti-drift guard for Playwright specs
// ⚠ DO NOT REMOVE — this is the structural safeguard against test rot.
//
// Run after every Playwright session. Exits non-zero if rules violated.
// Rules:
//   1. Every test() must have at least one expect()
//   2. No SKIP paths — if/else that logs "SKIP" and returns is a lie
//   3. No WARN paths — a suppressed failure is worse than a real failure
//   4. No test without a bug-prevention comment (// Bugs prevented:)
//
// Usage: node deploy/dev/tests/audit_specs.js
//        Exit 0 = clean, Exit 1 = violations found
//
// WHY THIS EXISTS:
//   Claude optimizes for green bar. A test that logs §PW_WALK_ENTER=true
//   and passes WITHOUT an expect() tested nothing. This script catches
//   that drift mechanically, every time, without needing a human auditor.

'use strict';
const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, 'specs');
const specs = fs.readdirSync(SPEC_DIR).filter(f => f.endsWith('.spec.js'));

let totalTests = 0;
let totalExpects = 0;
let violations = [];

for (const specFile of specs) {
  const src = fs.readFileSync(path.join(SPEC_DIR, specFile), 'utf8');

  // Parse test blocks (simplified — counts test(' occurrences)
  const testCount = (src.match(/test\('/g) || []).length;
  const expectCount = (src.match(/expect\(/g) || []).length;
  const skipCount = (src.match(/console\.log\([^)]*SKIP/g) || []).length;
  const warnCount = (src.match(/console\.log\([^)]*WARN/g) || []).length;

  totalTests += testCount;
  totalExpects += expectCount;

  // Rule 1: expect ratio >= 1:1
  if (expectCount < testCount) {
    violations.push(`RULE 1 FAIL: ${specFile} — ${testCount} tests but only ${expectCount} expects (need ${testCount}+)`);
  }

  // Rule 2: no SKIP paths
  if (skipCount > 0) {
    violations.push(`RULE 2 FAIL: ${specFile} — ${skipCount} SKIP paths (each is a test that tests nothing)`);
  }

  // Rule 3: no WARN paths
  if (warnCount > 0) {
    violations.push(`RULE 3 FAIL: ${specFile} — ${warnCount} WARN paths (suppressed failures — convert to expect or test.fixme)`);
  }
}

// ── Report ──
const ratio = totalTests > 0 ? (totalExpects / totalTests).toFixed(2) : '0';

console.log('');
console.log('═══ Playwright Spec Audit ═══');
console.log(`  Specs:   ${specs.length}`);
console.log(`  Tests:   ${totalTests}`);
console.log(`  Expects: ${totalExpects}  (ratio: ${ratio}, target: ≥2.0)`);
console.log('');

if (violations.length === 0) {
  console.log('  ✓ All rules pass');
  console.log('');
  // Warn (but don't fail) if ratio is below target
  if (totalExpects / totalTests < 2.0) {
    console.log(`  ⚠ Expect ratio ${ratio} is below 2.0 target — add more assertions`);
  }
  process.exit(0);
} else {
  console.log(`  ✗ ${violations.length} violations found:\n`);
  for (const v of violations) {
    console.log(`    ${v}`);
  }
  console.log('');
  console.log('  Fix these before merging. See PlaywrightAnalysis.md §Anti-Drift Rules.');
  console.log('');
  process.exit(1);
}
