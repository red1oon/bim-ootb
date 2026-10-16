// witness_kit/schemas/4d_instantiation.js — the contract for ONE task emitted from 4D_template.json.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S69.
//
// Read back out of the PERSISTED `tasks` rows, never from materializeZones' return value: a witness
// that trusts the writer's own report cannot catch a write that silently dropped rows.
'use strict';

const TemplateTaskRow = {
  type: 'object',
  required: ['building', 'taskId', 'name', 'phase', 'storey', 'startDay', 'endDay', 'crewDays', 'members'],
  properties: {
    building:  { type: 'string', minLength: 1 },
    taskId:    { type: 'string', pattern: '^TASK_' },
    name:      { type: 'string', minLength: 1 },
    phase:     { type: 'string', minLength: 1 },
    storey:    { type: 'string' },
    startDay:  { type: 'integer', minimum: 0 },
    endDay:    { type: 'integer', minimum: 1 },
    crewDays:  { type: 'number', minimum: 0 },
    members:   { type: 'integer', minimum: 1 }
  },
  additionalProperties: true
};

module.exports = { TemplateTaskRow };
