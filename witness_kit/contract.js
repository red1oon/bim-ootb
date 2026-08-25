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

function Witness(name) {
  const spec = { name, _population: null, _schema: null, _invariants: [], _redControl: null };

  const api = {
    population(fn) { spec._population = fn; return api; },
    schema(s) { spec._schema = s; return api; },
    invariant(label, fn) { spec._invariants.push({ label, fn }); return api; },
    redControl(fn) { spec._redControl = fn; return api; },

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
