// witness_kit/schemas/schedule_4d.js — the contract, as data.
// Grounded against the REAL DDL, not invented: viewer/schedule_author.js:247's
// `CREATE TABLE IF NOT EXISTS tasks (...)` (identical DDL repeated at :262). is_critical/total_float
// are nullable because a REAL generated schedule has them so on WBS-summary rows (is_summary=1) —
// computeCpm never rates a rollup row, only leaves — verified against a real materializeDefault() +
// scheduleContiguous() + computeCpm() run on buildings/Duplex_extracted.db's real elements_meta,
// not assumed.
'use strict';
const Schedule4DTaskRow = {
  type: 'object',
  required: ['task_id', 'schedule_id', 'schedule_start', 'schedule_finish', 'is_summary'],
  properties: {
    task_id: { type: 'string', minLength: 1 },
    schedule_id: { type: 'string', minLength: 1 },
    schedule_start: { type: 'string', minLength: 1 },
    schedule_finish: { type: 'string', minLength: 1 },
    is_summary: { type: ['integer', 'null'], enum: [0, 1, null] },
    is_critical: { type: ['integer', 'null'], enum: [0, 1, null] },
    total_float: { type: ['string', 'number', 'null'] }
  },
  additionalProperties: true // a floor, not a ceiling — legacy/extra columns don't fail the row
};

module.exports = { Schedule4DTaskRow };
