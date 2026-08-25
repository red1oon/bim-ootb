// witness_kit/schemas/4d_template.js — the contract for ONE phase of the core programme
// template. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S66.
//
// classMinSequence / classTrades are ['...','null'] because a phase MAY legitimately name no
// classes in sequence_rules.json — but whether that is allowed is an invariant question
// (phasesMatchClassificationOrder), not a shape one. Keeping it out of the schema stops a real
// drift from being triaged as malformed data.
'use strict';

const PhaseRow4D = {
  type: 'object',
  required: ['id', 'name', 'sequence', 'trades', 'replicate_per_level', 'index'],
  properties: {
    id:                  { type: 'string', minLength: 1, pattern: '^[a-z0-9_]+$' },
    name:                { type: 'string', minLength: 1 },
    sequence:            { type: 'integer', minimum: 1 },
    trades:              { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    replicate_per_level: { type: 'boolean' },
    index:               { type: 'integer', minimum: 0 },
    classMinSequence:    { type: ['integer', 'null'] },
    classTrades:         { type: ['array', 'null'], items: { type: 'string' } }
  },
  additionalProperties: true
};

module.exports = { PhaseRow4D };
