// witness_kit/schemas/gantt_bars.js — the contract for ONE drawn Gantt bar, as data.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 3.
//
// `winStart`/`winEnd` are ['integer','null'] because an UN-AUTHORED bar (a storey|phase or cell
// group, on a building with no authored schedule) genuinely has no window — that is a real, correct
// shape, not a defect. Whether an AUTHORED bar is allowed to diverge from its window is an invariant
// question (barsMatchTaskWindow / authoredBarsUseTaskSpan), never a shape one: conflating the two
// would let a real defect read as "malformed" and get triaged as a data problem.
//
// `spanFrom` is the provenance of the bar's outline — 'task' (the authored window, correct for an
// authored bar) or 'ops' (the Tukey envelope over member elements, correct ONLY as the un-authored
// fallback). Making provenance part of the persisted row is what lets a witness assert WHERE a
// number came from instead of only what it equals.
'use strict';

const GanttBarRow = {
  type: 'object',
  required: ['building', 'name', 'phase', 'spanFrom', 'startTs', 'endTs', 'widthPx', 'members'],
  properties: {
    building: { type: 'string', minLength: 1 },
    taskId:   { type: ['string', 'null'] },
    name:     { type: 'string', minLength: 1 },
    phase:    { type: 'string', minLength: 1 },
    spanFrom: { type: 'string', enum: ['task', 'ops'] },
    startTs:  { type: 'number' },
    endTs:    { type: 'number' },
    winStart: { type: ['number', 'null'] },
    winEnd:   { type: ['number', 'null'] },
    widthPx:  { type: 'number', minimum: 0 },
    axisDays: { type: 'number', exclusiveMinimum: 0 },
    members:  { type: 'integer', minimum: 1 }
  },
  additionalProperties: true
};

module.exports = { GanttBarRow };
