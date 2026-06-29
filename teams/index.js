// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS layer barrel. One import for the whole self-contained layer; the only
//   modeller coupling is Connectors (swap its stub bodies to go live). teams/.
'use strict';
var Connectors = require('./connectors');
var Engine = require('./engine');
var Gate = require('./gate');
var Chatlog = require('./chatlog');
module.exports = { Connectors: Connectors, Engine: Engine, Gate: Gate, Chatlog: Chatlog };
