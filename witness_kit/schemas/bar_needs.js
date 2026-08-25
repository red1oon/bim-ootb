// witness_kit/schemas/bar_needs.js — one needs() edge from the 4D Bar model.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §3.
'use strict';

const NeedsEdgeRow = {
  type: 'object',
  required: ['building', 'from', 'to', 'kind'],
  properties: {
    building: { type: 'string', minLength: 1 },
    from:     { type: 'string', minLength: 1 },   // GUID that must finish first
    to:       { type: 'string', minLength: 1 },   // GUID that needs it
    kind:     { type: 'string', enum: ['support', 'host', 'carrier', 'opening', 'wall'] }
  },
  additionalProperties: true
};

module.exports = { NeedsEdgeRow };
