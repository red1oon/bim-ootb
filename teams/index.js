// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS layer barrel. One import for the whole self-contained layer; the only
//   modeller coupling is Connectors (swap its stub bodies to go live). teams/.
'use strict';
var Connectors = require('./connectors');
var ConnectorsLive = require('./connectors_live');   // feature-detected live bindings (stub fallback)
var Engine = require('./engine');
var Gate = require('./gate');
var Chatlog = require('./chatlog');
var Protocol = require('./protocol');                // CAS seam · heartbeat · op-message default
var Facilitator = require('./facilitator');          // optional trustless relay (DESIGN.md §7)
var Transport = require('./transport');              // facilitator-over-HTTP (GitHub / OCI)
var View = require('./overlay/teams_view');          // view-model builders + DOM renderers
var DotLayer = require('./overlay/dot_layer');        // §S2 universal dot optics (person/post-it dots, fan-out)
var Postit = require('./overlay/postit');             // §S3 post-it annot op + universal anchor + organise/recall
var App = require('./overlay/teams_app');            // demo scenario + computeView orchestration
module.exports = {
  Connectors: Connectors, ConnectorsLive: ConnectorsLive, Engine: Engine, Gate: Gate,
  Chatlog: Chatlog, Protocol: Protocol, Facilitator: Facilitator, Transport: Transport,
  View: View, DotLayer: DotLayer, Postit: Postit, App: App
};
