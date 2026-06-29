// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET barrel. One import for the self-contained module; the ONLY coupling
//   point is Connectors (swap its stub bodies to go live). prompts/RESUME_HR_BIM_ASSET.md.
'use strict';
module.exports = {
  Connectors: require('./connectors'),
  Rules: require('./rules'),
  Watermark: require('./watermark'),
  Models: require('./models'),
  Engine: require('./engine')
};
