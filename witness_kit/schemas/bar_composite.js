// witness_kit/schemas/bar_composite.js — one (group, child) pair of the 4D Bar tree.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §2.1.
'use strict';

const GroupChildRow = {
  type: 'object',
  required: ['building', 'group', 'groupStart', 'groupStop', 'childStart', 'childStop'],
  properties: {
    building:   { type: 'string', minLength: 1 },
    group:      { type: 'string', minLength: 1 },
    groupStart: { type: 'number' },
    groupStop:  { type: 'number' },
    childStart: { type: 'number' },
    childStop:  { type: 'number' }
  },
  additionalProperties: true
};

module.exports = { GroupChildRow };
