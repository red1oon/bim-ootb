// witness_kit/schemas/template.js — the contract for ONE row of the preset 4D template,
// as data. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 2.
//
// A "row" is one schedulable declaration in the template: a class rule, one NAME_OVERRIDE applied to
// one of its declared classes, or SEQUENCE_DEFAULT. Every one of them must name a phase, a sequence
// position, a resource that exists, and must resolve to a REAL install duration.
//
// `resource` is deliberately typed ['string','null'] rather than 'string': null is the shape the
// file actually ships today (IfcSpace, IfcBuildingElementProxy, SEQUENCE_DEFAULT), and the schema's
// job is to describe the artifact honestly. Whether null is ALLOWED is an invariant question
// (G-TPL-RES / G-TPL-ZERO in invariants/template.js), not a shape question — keeping it here would
// conflate "malformed" with "wrong", and the §S65 defects are wrong, not malformed.
'use strict';

const TemplateRuleRow = {
  type: 'object',
  required: ['key', 'kind', 'cls', 'phase', 'sequence', 'resource', 'installSecs'],
  properties: {
    key:         { type: 'string', minLength: 1 },
    kind:        { type: 'string', enum: ['rule', 'override', 'default'] },
    cls:         { type: 'string', minLength: 1 },
    phase:       { type: 'string', minLength: 1 },
    sequence:    { type: 'integer', minimum: 0 },
    resource:    { type: ['string', 'null'] },
    installSecs: { type: 'integer', minimum: 1 }
  },
  additionalProperties: true   // a floor, not a ceiling
};

module.exports = { TemplateRuleRow };
