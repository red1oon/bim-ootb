// witness_kit/schemas/bar_schedule.js — one scheduled element of the 4D Bar model, beside the task
// that claims it. Spec: bim-compiler prompts/4D_BAR_MODEL.md §7.
'use strict';

const ScheduledElementRow = {
  type: 'object',
  required: ['building', 'guid', 'cls', 'phase', 'structural', 'trade', 'start', 'stop', 'taskStart', 'taskStop', 'floating'],
  properties: {
    building:   { type: 'string', minLength: 1 },
    guid:       { type: 'string', minLength: 1 },
    cls:        { type: 'string', minLength: 1 },
    phase:      { type: 'string', minLength: 1 },
    structural: { type: 'boolean' },
    trade:      { type: 'string' },
    start:      { type: 'number' },
    stop:       { type: 'number' },
    taskStart:  { type: 'number' },
    taskStop:   { type: 'number' },
    floating:   { type: 'boolean' }
  },
  additionalProperties: true
};

module.exports = { ScheduledElementRow };
