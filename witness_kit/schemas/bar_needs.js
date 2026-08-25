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
    // 'bearing' is 'support' where the two elements actually TOUCH (census()'s bearing clause);
    // 'support' is geoGate's looser `below` — overlapping underneath, contact or not. Split
    // 2026-08-25 because the scheduler must gate on the relation the midair judge measures: fused
    // into one kind, HHS midair was 609; split, 25. Both are any-of; bearing is preferred.
    kind:     { type: 'string', enum: ['bearing', 'support', 'host', 'carrier', 'opening', 'wall'] }
  },
  additionalProperties: true
};

module.exports = { NeedsEdgeRow };
