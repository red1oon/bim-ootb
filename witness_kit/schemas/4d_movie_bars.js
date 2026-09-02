// witness_kit/schemas/4d_movie_bars.js — one element as the movie plays it, beside the bar that
// claims it. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S70.
'use strict';

const PlayedElementRow = {
  type: 'object',
  required: ['building', 'guid', 'taskId', 'solveStart', 'playStart', 'playEnd', 'winStart', 'winEnd'],
  properties: {
    building:   { type: 'string', minLength: 1 },
    guid:       { type: 'string', minLength: 1 },
    taskId:     { type: 'string', pattern: '^TASK_' },
    solveStart: { type: 'number' },
    playStart:  { type: 'number' },
    playEnd:    { type: 'number' },
    winStart:   { type: 'number' },
    winEnd:     { type: 'number' }
  },
  additionalProperties: true
};

module.exports = { PlayedElementRow };
