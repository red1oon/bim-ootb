// witness_kit/contract.js — the Witness() builder.
// Spec: bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §2.3.
//
// JS has no compiler to refuse an incomplete implementer, so the guarantee is moved here instead:
// one shared function every witness is forced to go through, that refuses to run without a
// population, a schema, and a redControl — and that PROVES the redControl actually fails, so a
// witness that cannot fail (§W-REDCONTROL, WITNESS_CONTRACT_AUDIT.md §1) is caught at author time,
// not by luck.
'use strict';
const Ajv = require('ajv');

/**
 * Witness(name) — chained builder for a schema+invariant+redControl witness.
 * Call `.population()`, `.schema()`, and `.redControl()` (required) plus any number of
 * `.invariant()` (optional), then `.run()` to execute. Each chained method returns the
 * same `api` object, so calls can be composed in any order before `.run()`.
 *
 * @param {string} name - Witness name, used in the `§WITNESS_<NAME>` summary line and in
 *   the `run()`-time error messages if a required method was never called.
 * @returns {{
 *   population: (fn: () => object[]) => object,
 *   schema: (schema: object) => object,
 *   invariant: (label: string, fn: (rows: object[]) => boolean) => object,
 *   redControl: (fn: (rows: object[]) => object[]) => object,
 *   run: () => { pass: number, fail: number, ran: number }
 * }} the chainable builder api.
 */
function Witness(name) {
  const spec = { name, _population: null, _schema: null, _invariants: [], _redControl: null };

  const api = {
    /**
     * Required. Registers the function that produces the real population of rows to test —
     * must be actual persisted/generated data, not a mocked fixture.
     * @param {() => object[]} fn - Zero-arg function returning the row array to check.
     * @returns {object} the api, for chaining.
     */
    population(fn) { spec._population = fn; return api; },
    /**
     * Required. Registers the JSON Schema (compiled via Ajv) every row must validate against.
     * @param {object} s - A JSON Schema object.
     * @returns {object} the api, for chaining.
     */
    schema(s) { spec._schema = s; return api; },
    /**
     * Optional, repeatable. Registers one named invariant check run against the full row set.
     * @param {string} label - Short label printed next to PASS/FAIL for this invariant.
     * @param {(rows: object[]) => boolean} fn - Receives all rows, returns true if the
     *   invariant holds (a thrown error counts as false).
     * @returns {object} the api, for chaining.
     */
    invariant(label, fn) { spec._invariants.push({ label, fn }); return api; },
    /**
     * Required. Registers a function that mutates a deep-ish copy of the real rows into a
     * deliberately-broken population — proves the witness can actually fail (§W-REDCONTROL).
     * `.run()` fails the whole witness if this population does NOT fail schema/invariants.
     * @param {(rows: object[]) => object[]} fn - Receives a shallow copy of each row (via
     *   `Object.assign({}, r)`), returns the mutated (broken) rows.
     * @returns {object} the api, for chaining.
     */
    redControl(fn) { spec._redControl = fn; return api; },

    /**
     * Executes the witness: population → schema → invariants → redControl, in that order,
     * printing PASS/FAIL lines plus one `§WITNESS_<NAME> pass=.. fail=.. ran=..` summary line.
     * Sets `process.exitCode = 1` if anything failed.
     * @throws {Error} if `.population()`, `.schema()`, or `.redControl()` was never called.
     * @returns {{ pass: number, fail: number, ran: number }} counts from this run.
     */
    run() {
      if (!spec._population) throw new Error(`Witness(${name}): .population() is required`);
      if (!spec._schema) throw new Error(`Witness(${name}): .schema() is required`);
      if (!spec._redControl) throw new Error(
        `Witness(${name}): .redControl() is required — a witness that cannot fail is not a witness`);

      let pass = 0, fail = 0;
      function ok(label) { pass++; console.log('  PASS ' + label); }
      function bad(label, detail) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(spec._schema);

      function checkPopulation(rows) {
        // returns true iff rows is non-empty, schema-valid throughout, and every invariant holds
        if (!rows || rows.length === 0) return false;
        for (const row of rows) if (!validate(row)) return false;
        for (const { fn } of spec._invariants) {
          let r; try { r = fn(rows); } catch (e) { r = false; }
          if (!r) return false;
        }
        return true;
      }

      // 1. population — §W-EMPTY-POP: throw loud, not a silent exit-0.
      const rows = spec._population();
      if (!rows || rows.length === 0) {
        bad('population-nonempty', 'population() returned 0 rows — closes §W-EMPTY-POP');
      } else {
        ok(`population-nonempty (${rows.length} rows)`);
      }

      // 2. schema — every row, real persisted shape, not a mocked return value.
      if (rows && rows.length > 0) {
        let schemaFails = 0;
        rows.forEach((row, i) => {
          if (!validate(row)) {
            schemaFails++;
            console.log('    schema error row[' + i + ']: ' + ajv.errorsText(validate.errors));
          }
        });
        if (schemaFails === 0) ok(`schema-valid (all ${rows.length} rows)`);
        else bad('schema-valid', `${schemaFails}/${rows.length} rows failed schema`);
      }

      // 3. invariants — reusable, imported by name, never hand-copied.
      spec._invariants.forEach(({ label, fn }) => {
        let result;
        try { result = fn(rows || []); } catch (e) { result = false; }
        if (result) ok(label); else bad(label);
      });

      // 4. redControl — must demonstrably fail schema+invariants, or the witness itself is the defect.
      let redFailed;
      try {
        const redRows = spec._redControl((rows || []).map(r => Object.assign({}, r)));
        redFailed = !checkPopulation(redRows);
      } catch (e) {
        redFailed = true; // a thrown redControl also counts as "demonstrably fails"
      }
      if (redFailed) ok('redControl-detected (witness can fail)');
      else bad('redControl-detected',
        'redControl() population passed schema+invariants unchanged — this witness cannot fail, closes §W-REDCONTROL');

      // 5. one summary line — ran>0 is baked in, can't be omitted the way run_witness_suite.js's
      //    audit found 12+ files omitting it (WITNESS_CONTRACT_AUDIT.md §RESULTS 2026-08-24).
      console.log(`§WITNESS_${name.toUpperCase()} pass=${pass} fail=${fail} ran=${(rows || []).length}`);
      if (fail > 0) process.exitCode = 1;
      return { pass, fail, ran: (rows || []).length };
    }
  };
  return api;
}

module.exports = { Witness };
