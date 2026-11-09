#!/usr/bin/env node
// a counting stand-in for edit_cli / viewer_verbs, injected into the door by the witnesses (createDoor({cli})). One line appended to $STUB_COUNT per spawn.
'use strict';
const fs = require('fs');
if (process.env.STUB_COUNT) fs.appendFileSync(process.env.STUB_COUNT, process.argv.slice(2).join(' ') + '\n');
const viewer = process.argv.indexOf('--viewer') >= 0 || /^(counts|clashes)$/.test(process.argv[2] || '');
console.log(JSON.stringify(viewer ? { verdict: 'OK', stub: true } : { ok: true, building: 'stub', edits: [], ms: 1 }));
