/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * section_cut.js — Browser port of Python mesh section cut engine.
 * Slices triangle meshes at a horizontal cut plane Z=cutZ, producing 2D contours.
 *
 * Source: 2D_Layout/python/section_cut.py (faithful port, no numpy)
 *
 * API (window.SectionCut):
 *   detectStoreys(db)                          → [{name, floorZ, elementCount}]
 *   sectionCut(db, libDb, cutZ, storeyName)    → [{guid, ifcClass, elementName, storey, category, contours, bbox2d}]
 *   sliceMesh(vertices_f32, faces_i32, cutZ)   → [[x0,y0],[x1,y1]] segments
 *   chainSegments(segments, tolerance)          → [[[x,y],...]] contours
 *
 * Debug log tags (§ traceability):
 *   §SC_STOREYS   §SC_CUT_PLANE   §SC_QUERY   §SC_SLICE   §SC_CHAIN   §SC_DONE
 *
 * No DOM access — Web Worker compatible. Attach to window at bottom only.
 */

(function () {
'use strict';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------
var TOLERANCE = 0.005;        // 5 mm endpoint matching
var EPSILON   = 1e-7;         // floating-point zero guard
var DEFAULT_CUT_OFFSET = 1.0; // meters above floor level
var MAX_ELEMENTS_POC = 5000;  // auto-clip threshold: buildings with more transforms get clipped
var CLIP_MARGIN = 15.0;       // half-side of clip window in metres (30m × 30m total)

// IFC classes eligible for slicing (performance filter)
var SLICE_CLASSES = {
    'IfcWall': 1, 'IfcWallStandardCase': 1, 'IfcColumn': 1,
    'IfcDoor': 1, 'IfcDoorStandardCase': 1,
    'IfcWindow': 1, 'IfcWindowStandardCase': 1,
    'IfcSlab': 1, 'IfcPlate': 1,
    'IfcMember': 1, 'IfcBeam': 1, 'IfcCurtainWall': 1,
    'IfcStair': 1, 'IfcStairFlight': 1, 'IfcRailing': 1
};

// -------------------------------------------------------------------------
// BLOB parsers
// -------------------------------------------------------------------------

function parseVerticesBlob(blob, vertexCount) {
    // blob is a Uint8Array from sql.js
    var expected = vertexCount * 3 * 4;
    if (blob.byteLength === expected) {
        // Ensure aligned buffer for Float32Array
        var buf = new ArrayBuffer(expected);
        new Uint8Array(buf).set(blob instanceof Uint8Array ? blob : new Uint8Array(blob));
        return new Float32Array(buf);
    }
    // Fallback: float64
    var expectedD = vertexCount * 3 * 8;
    if (blob.byteLength === expectedD) {
        var buf64 = new ArrayBuffer(expectedD);
        new Uint8Array(buf64).set(blob instanceof Uint8Array ? blob : new Uint8Array(blob));
        var f64 = new Float64Array(buf64);
        var f32 = new Float32Array(f64.length);
        for (var i = 0; i < f64.length; i++) f32[i] = f64[i];
        return f32;
    }
    // Last resort: infer from size
    var n = Math.floor(blob.byteLength / 12);
    if (n > 0) {
        var bufN = new ArrayBuffer(n * 12);
        new Uint8Array(bufN).set(new Uint8Array(blob.buffer || blob, blob.byteOffset || 0, n * 12));
        return new Float32Array(bufN);
    }
    return new Float32Array(0);
}

function parseFacesBlob(blob, faceCount) {
    var expected = faceCount * 3 * 4;
    if (blob.byteLength === expected) {
        var buf = new ArrayBuffer(expected);
        new Uint8Array(buf).set(blob instanceof Uint8Array ? blob : new Uint8Array(blob));
        return new Int32Array(buf);
    }
    var n = Math.floor(blob.byteLength / 12);
    if (n > 0) {
        var bufN = new ArrayBuffer(n * 12);
        new Uint8Array(bufN).set(new Uint8Array(blob.buffer || blob, blob.byteOffset || 0, n * 12));
        return new Int32Array(bufN);
    }
    return new Int32Array(0);
}

// -------------------------------------------------------------------------
// Mesh slicing — tight loops, no per-triangle function calls
// -------------------------------------------------------------------------

/**
 * Slice a triangle mesh at Z=cutZ.
 * @param {Float32Array} verts  - flat xyz (vertexCount*3 floats)
 * @param {Int32Array}   faces  - flat triangle indices (faceCount*3 ints)
 * @param {number}       cutZ
 * @returns {Array} array of [[x0,y0],[x1,y1]] segments
 */
function sliceMesh(verts, faces, cutZ) {
    var numTri = (faces.length / 3) | 0;
    var numVert = (verts.length / 3) | 0;
    if (numTri === 0 || numVert === 0) return [];

    var segments = [];

    for (var t = 0; t < numTri; t++) {
        var i0 = faces[t * 3]     * 3;
        var i1 = faces[t * 3 + 1] * 3;
        var i2 = faces[t * 3 + 2] * 3;

        // Vertex Z coords
        var z0 = verts[i0 + 2];
        var z1 = verts[i1 + 2];
        var z2 = verts[i2 + 2];

        // Signed distances
        var d0 = z0 - cutZ;
        var d1 = z1 - cutZ;
        var d2 = z2 - cutZ;

        // All above or all below — skip
        if (d0 > EPSILON && d1 > EPSILON && d2 > EPSILON) continue;
        if (d0 < -EPSILON && d1 < -EPSILON && d2 < -EPSILON) continue;

        // All on plane — skip degenerate
        var abs0 = d0 < 0 ? -d0 : d0;
        var abs1 = d1 < 0 ? -d1 : d1;
        var abs2 = d2 < 0 ? -d2 : d2;
        if (abs0 <= EPSILON && abs1 <= EPSILON && abs2 <= EPSILON) continue;

        // Sign (+1 / -1), treat on-plane as +1
        var s0 = d0 >= 0 ? 1 : -1;
        var s1 = d1 >= 0 ? 1 : -1;
        var s2 = d2 >= 0 ? 1 : -1;

        // Identify isolated vertex (the one on its own side)
        // Case A: v0 isolated, Case B: v1 isolated, Case C: v2 isolated
        var ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2;
        var da, db, dc;

        if (s0 !== s1 && s0 !== s2) {
            // v0 is isolated — edges v0-v1 and v0-v2
            ax0 = verts[i0]; ay0 = verts[i0+1];
            ax1 = verts[i1]; ay1 = verts[i1+1];
            ax2 = verts[i2]; ay2 = verts[i2+1];
            da = d0; db = d1; dc = d2;
        } else if (s1 !== s0 && s1 !== s2) {
            // v1 is isolated — edges v1-v0 and v1-v2
            ax0 = verts[i1]; ay0 = verts[i1+1];
            ax1 = verts[i0]; ay1 = verts[i0+1];
            ax2 = verts[i2]; ay2 = verts[i2+1];
            da = d1; db = d0; dc = d2;
        } else {
            // v2 is isolated — edges v2-v0 and v2-v1
            ax0 = verts[i2]; ay0 = verts[i2+1];
            ax1 = verts[i0]; ay1 = verts[i0+1];
            ax2 = verts[i1]; ay2 = verts[i1+1];
            da = d2; db = d0; dc = d1;
        }

        // Interpolate edge isolated→B
        var denom1 = da - db;
        var t1 = (denom1 < -EPSILON || denom1 > EPSILON) ? da / denom1 : 0.5;
        var px0 = ax0 + t1 * (ax1 - ax0);
        var py0 = ay0 + t1 * (ay1 - ay0);

        // Interpolate edge isolated→C
        var denom2 = da - dc;
        var t2 = (denom2 < -EPSILON || denom2 > EPSILON) ? da / denom2 : 0.5;
        var px1 = ax0 + t2 * (ax2 - ax0);
        var py1 = ay0 + t2 * (ay2 - ay0);

        segments.push([[px0, py0], [px1, py1]]);
    }

    return segments;
}

// -------------------------------------------------------------------------
// Segment chaining — build closed polylines from unordered segments
// -------------------------------------------------------------------------

/**
 * Chain segments into closed contours.
 * @param {Array} segments  - array of [[x0,y0],[x1,y1]]
 * @param {number} tolerance
 * @returns {Array} array of [[x,y],...] contours (each a closed polyline)
 */
function chainSegments(segments, tolerance) {
    if (tolerance === undefined) tolerance = TOLERANCE;
    if (segments.length === 0) return [];

    // Build index array of remaining segment indices
    var remaining = [];
    for (var i = 0; i < segments.length; i++) remaining.push(i);

    var chains = [];

    while (remaining.length > 0) {
        var seedIdx = remaining.shift();
        var seg = segments[seedIdx];
        var chain = [[seg[0][0], seg[0][1]], [seg[1][0], seg[1][1]]];

        var changed = true;
        while (changed) {
            changed = false;
            var tail = chain[chain.length - 1];
            var head = chain[0];

            // Check closure
            if (chain.length > 2) {
                var dx = tail[0] - head[0];
                var dy = tail[1] - head[1];
                if (Math.sqrt(dx * dx + dy * dy) < tolerance) break;
            }

            var bestIdx = -1;
            var bestDist = tolerance;
            var bestEnd = 0;   // 0=match seg start, 1=match seg end
            var bestWhich = 0; // 0=append to tail, 1=prepend to head

            for (var ri = 0; ri < remaining.length; ri++) {
                var si = remaining[ri];
                var ss = segments[si][0];
                var se = segments[si][1];

                // Segment start → chain tail
                var d = Math.sqrt((ss[0] - tail[0]) * (ss[0] - tail[0]) + (ss[1] - tail[1]) * (ss[1] - tail[1]));
                if (d < bestDist) { bestDist = d; bestIdx = ri; bestEnd = 0; bestWhich = 0; }

                // Segment end → chain tail
                d = Math.sqrt((se[0] - tail[0]) * (se[0] - tail[0]) + (se[1] - tail[1]) * (se[1] - tail[1]));
                if (d < bestDist) { bestDist = d; bestIdx = ri; bestEnd = 1; bestWhich = 0; }

                // Segment end → chain head
                d = Math.sqrt((se[0] - head[0]) * (se[0] - head[0]) + (se[1] - head[1]) * (se[1] - head[1]));
                if (d < bestDist) { bestDist = d; bestIdx = ri; bestEnd = 1; bestWhich = 1; }

                // Segment start → chain head
                d = Math.sqrt((ss[0] - head[0]) * (ss[0] - head[0]) + (ss[1] - head[1]) * (ss[1] - head[1]));
                if (d < bestDist) { bestDist = d; bestIdx = ri; bestEnd = 0; bestWhich = 1; }
            }

            if (bestIdx >= 0) {
                var matchedSi = remaining[bestIdx];
                remaining.splice(bestIdx, 1);
                var mss = segments[matchedSi][0];
                var mse = segments[matchedSi][1];

                if (bestWhich === 0) { // append to tail
                    chain.push(bestEnd === 0 ? [mse[0], mse[1]] : [mss[0], mss[1]]);
                } else { // prepend to head
                    chain.unshift(bestEnd === 1 ? [mss[0], mss[1]] : [mse[0], mse[1]]);
                }
                changed = true;
            }
        }

        if (chain.length >= 3) {
            chains.push(chain);
        }
    }

    return chains;
}

// -------------------------------------------------------------------------
// Contour classification — shoelace signed area
// -------------------------------------------------------------------------

function signedArea(points) {
    var area = 0;
    var n = points.length;
    for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
    }
    return area * 0.5;
}

// -------------------------------------------------------------------------
// Storey detection
// -------------------------------------------------------------------------

function hasTable(db, name) {
    var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + name + "'");
    return r.length > 0 && r[0].values.length > 0;
}

function detectStoreys(db) {
    // Try elements_rtree first (full DB), fall back to element_transforms (deployed DB)
    // sql.js may not have R-tree support even if table exists, so try/catch
    var result = null;
    if (hasTable(db, 'elements_rtree')) {
        try {
            result = db.exec(
                "SELECT m.storey, MIN(r.minZ) as floor_z, COUNT(*) as n " +
                "FROM elements_meta m JOIN elements_rtree r ON m.id = r.id " +
                "WHERE m.storey IS NOT NULL GROUP BY m.storey ORDER BY floor_z"
            );
        } catch (e) {
            console.log('§SC_STOREYS rtree query failed, falling back to transforms: ' + e.message);
            result = null;
        }
    }
    if (!result || result.length === 0) {
        result = db.exec(
            "SELECT m.storey, MIN(et.center_z) as floor_z, COUNT(*) as n " +
            "FROM elements_meta m JOIN element_transforms et ON m.guid = et.guid " +
            "WHERE m.storey IS NOT NULL GROUP BY m.storey ORDER BY floor_z"
        );
    }
    var storeys = [];
    if (result.length > 0) {
        var rows = result[0].values;
        for (var i = 0; i < rows.length; i++) {
            storeys.push({
                name: rows[i][0],
                floorZ: Number(rows[i][1]),
                elementCount: Number(rows[i][2])
            });
        }
    }
    console.log('§SC_STOREYS count=' + storeys.length);
    return storeys;
}

// -------------------------------------------------------------------------
// Geometry lookup — try db first, then libDb
// -------------------------------------------------------------------------

function lookupGeometry(db, libDb, geometryHash) {
    var escaped = geometryHash.replace(/'/g, "''");
    // Try both table names in both DBs (deployed DBs use component_geometries)
    var tables = ['base_geometries', 'component_geometries'];
    var dbs = [db];
    if (libDb && libDb !== db) dbs.push(libDb);
    for (var di = 0; di < dbs.length; di++) {
        for (var ti = 0; ti < tables.length; ti++) {
            if (!hasTable(dbs[di], tables[ti])) continue;
            // Try with vertex_count/face_count first (full schema)
            var sql = "SELECT vertices, faces, vertex_count, face_count FROM " +
                      tables[ti] + " WHERE geometry_hash = '" + escaped + "' LIMIT 1";
            try {
                var res = dbs[di].exec(sql);
                if (res.length > 0 && res[0].values.length > 0) return res[0].values[0];
            } catch (e) {
                // Fall back to BLOBs only — infer counts from byte lengths
                try {
                    var sql2 = "SELECT vertices, faces FROM " +
                               tables[ti] + " WHERE geometry_hash = '" + escaped + "' LIMIT 1";
                    var res2 = dbs[di].exec(sql2);
                    if (res2.length > 0 && res2[0].values.length > 0) {
                        var row = res2[0].values[0];
                        var vBlob = row[0], fBlob = row[1];
                        var vCount = vBlob ? Math.floor(vBlob.byteLength / 12) : 0;  // 3 floats × 4 bytes
                        var fCount = fBlob ? Math.floor(fBlob.byteLength / 12) : 0;  // 3 ints × 4 bytes
                        return [vBlob, fBlob, vCount, fCount];
                    }
                } catch (e2) { /* genuinely missing */ }
            }
        }
    }
    return null;
}

// -------------------------------------------------------------------------
// Building stats — element count + world bbox from element_transforms
// -------------------------------------------------------------------------

function getBuildingStats(db) {
    var res = db.exec(
        "SELECT COUNT(*), MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y) " +
        "FROM element_transforms"
    );
    if (!res.length || !res[0].values.length) return null;
    var row = res[0].values[0];
    var minX = Number(row[1]), maxX = Number(row[2]);
    var minY = Number(row[3]), maxY = Number(row[4]);
    return {
        elementCount: Number(row[0]),
        minX: minX, maxX: maxX,
        minY: minY, maxY: maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

// -------------------------------------------------------------------------
// Section cut — main orchestration
// -------------------------------------------------------------------------

function sectionCut(db, libDb, cutZ, storeyName, options) {
    var t0 = Date.now();
    var opts = options || {};
    var clipBox = opts.clipBox || null;   // {minX, minY, maxX, maxY}
    // Implementing 2D_028 §2.3 — Witness: W-2D28
    var rules = opts.rules || null;
    var fp = (rules && rules.floor_plan) || {};

    // --- Determine cut height ---
    // Detect storeys once — reused by both cutZ resolution and band filter
    var storeys = detectStoreys(db);
    if (cutZ == null) {
        if (storeys.length === 0) {
            console.warn('§SC_CUT_PLANE no storeys found');
            return [];
        }
        var target = null;
        if (storeyName) {
            for (var si = 0; si < storeys.length; si++) {
                if (storeys[si].name === storeyName) { target = storeys[si]; break; }
            }
            if (!target) {
                console.warn('§SC_CUT_PLANE storey not found: ' + storeyName);
                target = storeys[0];
            }
        } else {
            target = storeys[0];
        }
        cutZ = target.floorZ + DEFAULT_CUT_OFFSET;
        console.log('§SC_CUT_PLANE z=' + cutZ.toFixed(3) + ' storey=' + target.name);
    } else {
        console.log('§SC_CUT_PLANE z=' + cutZ.toFixed(3) + ' storey=' + (storeyName || 'explicit'));
    }

    var results = [];

    // --- Fetch ALL elements with geometry + transforms ---
    // Try rtree path first, fall back to transforms-only if sql.js lacks R-tree
    var useRtree = false;
    var allRes = null;
    if (hasTable(db, 'elements_rtree')) {
        try {
            allRes = db.exec(
                "SELECT m.guid, m.ifc_class, m.element_name, m.storey, " +
                "  ei.geometry_hash, " +
                "  r.minX, r.maxX, r.minY, r.maxY, r.minZ, r.maxZ, " +
                "  COALESCE(et.center_x, 0.0), COALESCE(et.center_y, 0.0), COALESCE(et.center_z, 0.0), " +
                "  COALESCE(et.bbox_z, 0.0) " +
                "FROM elements_meta m " +
                "JOIN element_instances ei ON m.guid = ei.guid " +
                "JOIN elements_rtree r ON m.id = r.id " +
                "LEFT JOIN element_transforms et ON m.guid = et.guid"
            );
            useRtree = true;
        } catch (e) {
            console.log('§SC_QUERY rtree query failed, using transforms: ' + e.message);
        }
    }
    if (!allRes || allRes.length === 0) {
        allRes = db.exec(
            "SELECT m.guid, m.ifc_class, m.element_name, m.storey, " +
            "  ei.geometry_hash, " +
            "  0.0, 0.0, 0.0, 0.0, 0.0, 0.0, " +
            "  COALESCE(et.center_x, 0.0), COALESCE(et.center_y, 0.0), COALESCE(et.center_z, 0.0), " +
            "  COALESCE(et.bbox_z, 0.0) " +
            "FROM elements_meta m " +
            "JOIN element_instances ei ON m.guid = ei.guid " +
            "LEFT JOIN element_transforms et ON m.guid = et.guid"
        );
    }

    var allRows = (allRes && allRes.length > 0) ? allRes[0].values : [];
    console.log('§SC_QUERY_ALL rows=' + allRows.length + ' useRtree=' + useRtree);

    // Apply spatial clip (POC limit for large buildings)
    if (clipBox) {
        var beforeClip = allRows.length;
        var clipped = [];
        for (var fi = 0; fi < allRows.length; fi++) {
            var fcx = Number(allRows[fi][11]), fcy = Number(allRows[fi][12]);
            if (fcx >= clipBox.minX && fcx <= clipBox.maxX &&
                fcy >= clipBox.minY && fcy <= clipBox.maxY) {
                clipped.push(allRows[fi]);
            }
        }
        allRows = clipped;
        console.log('§SC_CLIP rows ' + beforeClip + ' → ' + allRows.length +
                    ' box=[' + clipBox.minX.toFixed(0) + ',' + clipBox.minY.toFixed(0) +
                    ' to ' + clipBox.maxX.toFixed(0) + ',' + clipBox.maxY.toFixed(0) + ']');
    }

    // ── Storey band filter — Implementing 2D_028 §2.2 — Witness: W-2D28
    // Uses bbox Z-bounds from element_transforms (design-intent envelope).
    // For CONTOUR rendering: hard-exclude classes that can never appear in GF band.
    // Does NOT filter by Z-span (that is grid-detection only) — here we want ALL
    // elements that visually intersect the band for accurate section contours.
    var bandMin, bandMax;
    if (cutZ != null) {
        // Reuse storeys from above — no second detectStoreys call
        var activeStorey = null;
        for (var bsi = 0; bsi < storeys.length; bsi++) {
            if (storeys[bsi].floorZ <= cutZ && cutZ <= storeys[bsi].floorZ + 10) {
                // Pick the storey closest to cutZ from below (not just first match)
                if (!activeStorey || storeys[bsi].floorZ > activeStorey.floorZ) {
                    activeStorey = storeys[bsi];
                }
            }
        }
        if (activeStorey) {
            var fallbackH = fp.band_fallback_height || 3.5;
            var nextFZ = (function() {
                var best = activeStorey.floorZ + fallbackH;
                for (var ns = 0; ns < storeys.length; ns++) {
                    var fz = storeys[ns].floorZ;
                    if (fz > activeStorey.floorZ && fz < best) best = fz;
                }
                return best;
            })();
            bandMin = activeStorey.floorZ + (fp.band_min_above_floor || 0.05);
            bandMax = nextFZ - (fp.band_max_below_next || 0.10);
            // Clamp: band must be at least 1.5m tall — prevents crushed bands
            // when metadata storeys (e.g. "Roof" at Z=0) sit very close to GF.
            if (bandMax - bandMin < 1.5) bandMax = bandMin + 1.5;
        } else {
            bandMin = cutZ - 1.5;
            bandMax = cutZ + 2.5;
        }
        var excAbove = fp.exclude_above_band || ['IfcRoof','IfcRoofing'];
        var excBelow = fp.exclude_below_band || ['IfcFoundation','IfcPile','IfcFooting'];
        var beforeBand = allRows.length;
        var bandFiltered = [];
        for (var bfi = 0; bfi < allRows.length; bfi++) {
            var brow = allRows[bfi];
            var bcls = brow[1] || '';
            var bcz  = Number(brow[13]);
            var bbz  = Number(brow[14] || 0);
            // Determine element Z-range for band check
            var bElemMinZ, bElemMaxZ;
            if (useRtree) {
                bElemMinZ = Number(brow[9]);
                bElemMaxZ = Number(brow[10]);
            } else if (bbz > 0) {
                bElemMinZ = bcz - bbz * 0.5;
                bElemMaxZ = bcz + bbz * 0.5;
            } else {
                bElemMinZ = bcz - 1.5;
                bElemMaxZ = bcz + 1.5;
            }
            // Class excludes: roof/covering/foundation classes are unconditionally removed
            // from floor plan sections — they never produce useful contours in plan view.
            // Position check is secondary — a roof that overlaps GF band Z-wise is still a roof.
            if (excAbove.indexOf(bcls) >= 0) { continue; }
            if (excBelow.indexOf(bcls) >= 0) { continue; }
            // Z-band filter: element must overlap [bandMin, bandMax]
            if (bElemMaxZ < bandMin || bElemMinZ > bandMax) continue;
            bandFiltered.push(brow);
        }
        allRows = bandFiltered;
        console.log('§SC_BAND_FILTER bandMin=' + bandMin.toFixed(2) + ' bandMax=' + bandMax.toFixed(2) +
                    ' in=' + allRows.length + ' excluded=' + (beforeBand - allRows.length));
    }
    // ── end band filter ──────────────────────────────────────────────

    var cutCount = 0, belowCount = 0, aboveCount = 0, totalContours = 0;
    var sliceCount = 0;

    for (var ci = 0; ci < allRows.length; ci++) {
        var row = allRows[ci];
        var guid       = row[0];
        var ifcClass   = row[1] || '';
        var elemName   = row[2] || '';
        var storey     = row[3] || '';
        var geoHash    = row[4];
        var minX = Number(row[5]), maxX = Number(row[6]);
        var minY = Number(row[7]), maxY = Number(row[8]);
        var rMinZ = Number(row[9]), rMaxZ = Number(row[10]);
        var cx = Number(row[11]), cy = Number(row[12]), cz = Number(row[13]);
        var bboxZ = Number(row[14] || 0);  // §SC_PERF — bbox_z for early Z-range estimate

        // Determine element Z-range WITHOUT loading geometry blobs.
        // §SC_PERF: geometry is expensive — only load it for confirmed CUT elements.
        // Priority: rtree bounds > bbox_z estimate > ±1.5m guess.
        var elemMinZ, elemMaxZ;
        if (useRtree) {
            elemMinZ = rMinZ;
            elemMaxZ = rMaxZ;
        } else if (bboxZ > 0) {
            elemMinZ = cz - bboxZ * 0.5;
            elemMaxZ = cz + bboxZ * 0.5;
        } else {
            // No bbox_z in schema — use a ±1.5m guess (rare, old deployments)
            elemMinZ = cz - 1.5;
            elemMaxZ = cz + 1.5;
        }

        // Classify: CUT / BELOW / ABOVE — before any geometry load
        var category;
        if (elemMinZ < cutZ && elemMaxZ > cutZ) {
            category = 'CUT';
        } else if (elemMaxZ <= cutZ) {
            category = 'BELOW';
        } else {
            category = 'ABOVE';
        }

        if (category !== 'CUT') {
            results.push({
                guid: guid, ifcClass: ifcClass, elementName: elemName,
                storey: storey, category: category, contours: [],
                bbox2d: [minX, minY, maxX, maxY],
                center: { x: cx, y: cy, z: cz }
            });
            if (category === 'BELOW') belowCount++;
            else aboveCount++;
            continue;
        }

        cutCount++;

        // Not a sliceable class — record as CUT but no contours
        if (!SLICE_CLASSES[ifcClass]) {
            results.push({
                guid: guid, ifcClass: ifcClass, elementName: elemName,
                storey: storey, category: 'CUT', contours: [],
                bbox2d: [minX, minY, maxX, maxY],
                center: { x: cx, y: cy, z: cz }
            });
            continue;
        }

        // §SC_PERF: load geometry now — element is CUT + sliceable, blob load is justified
        var geo = null;
        var verts = null, faces = null;
        if (geoHash) {
            geo = lookupGeometry(db, libDb, geoHash);
        }
        if (!geo || !geo[0] || !geo[1]) {
            console.log('§SC_NOGEOM guid=' + guid.substring(0, 8) +
                        ' class=' + ifcClass + ' hash=' + (geoHash ? geoHash.substring(0, 8) : 'NULL') +
                        ' cz=' + cz.toFixed(2) + ' cutZ=' + cutZ.toFixed(2));
            results.push({
                guid: guid, ifcClass: ifcClass, elementName: elemName,
                storey: storey, category: 'CUT', contours: [],
                bbox2d: [minX, minY, maxX, maxY],
                center: { x: cx, y: cy, z: cz }
            });
            continue;
        }

        // Parse vertices; refine XY bbox from actual mesh (useful for doors/windows)
        verts = parseVerticesBlob(geo[0], Number(geo[2]));
        if (!useRtree && verts.length > 0) {
            var localMinX = Infinity, localMaxX = -Infinity;
            var localMinY = Infinity, localMaxY = -Infinity;
            for (var vj = 0; vj < verts.length; vj += 3) {
                var vx = verts[vj], vy = verts[vj + 1];
                if (vx < localMinX) localMinX = vx;
                if (vx > localMaxX) localMaxX = vx;
                if (vy < localMinY) localMinY = vy;
                if (vy > localMaxY) localMaxY = vy;
            }
            minX = localMinX + cx; maxX = localMaxX + cx;
            minY = localMinY + cy; maxY = localMaxY + cy;
        }
        faces = parseFacesBlob(geo[1], Number(geo[3]));

        // Convert world cutZ to local cutZ for this element
        var localCutZ = cutZ - cz;
        var segs = sliceMesh(verts, faces, localCutZ);

        var contours = [];
        if (segs.length === 0) {
            var numTri0 = (faces.length / 3) | 0;
            console.log('§SC_NOSLICE guid=' + guid.substring(0, 8) +
                        ' class=' + ifcClass + ' tri=' + numTri0 +
                        ' localCutZ=' + localCutZ.toFixed(3) + ' cz=' + cz.toFixed(2));
        }
        if (segs.length > 0) {
            var numTri = (faces.length / 3) | 0;
            console.log('§SC_SLICE guid=' + guid.substring(0, 8) +
                        ' triangles=' + numTri + ' segments=' + segs.length);
            sliceCount++;

            var chains = chainSegments(segs, TOLERANCE);
            for (var ch = 0; ch < chains.length; ch++) {
                var pts = chains[ch];
                if (pts.length < 4) continue;
                var area = signedArea(pts);
                if (Math.abs(area) < 1e-6) continue;

                // Translate local XY → world XY
                var worldPts = [];
                for (var pi = 0; pi < pts.length; pi++) {
                    worldPts.push([pts[pi][0] + cx, pts[pi][1] + cy]);
                }
                contours.push({
                    points: worldPts,
                    isOuter: area > 0
                });
            }

            if (contours.length > 0) {
                var totalPts = 0;
                for (var cp = 0; cp < contours.length; cp++) totalPts += contours[cp].points.length;
                console.log('§SC_CHAIN guid=' + guid.substring(0, 8) +
                            ' contours=' + contours.length + ' points=' + totalPts);
            }
        }

        totalContours += contours.length;
        results.push({
            guid: guid, ifcClass: ifcClass, elementName: elemName,
            storey: storey, category: 'CUT', contours: contours,
            bbox2d: [minX, minY, maxX, maxY],
            center: { x: cx, y: cy, z: cz }
        });
    }

    console.log('§SC_QUERY cutElements=' + cutCount + ' belowElements=' + belowCount + ' aboveElements=' + aboveCount);

    // IFC class breakdown of CUT elements: contour-producing vs empty
    var classCounts = {}, classNoGeom = {}, classNonSliceable = {}, classNoContour = {};
    for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        if (r.category !== 'CUT') continue;
        var cl = r.ifcClass || 'UNKNOWN';
        if (!SLICE_CLASSES[cl]) {
            classNonSliceable[cl] = (classNonSliceable[cl] || 0) + 1;
        } else if (r.contours.length > 0) {
            classCounts[cl] = (classCounts[cl] || 0) + 1;
        } else {
            classNoContour[cl] = (classNoContour[cl] || 0) + 1;
        }
    }
    var classStr = Object.keys(classCounts).map(function(k){ return k + ':' + classCounts[k]; }).join(',');
    var noContStr = Object.keys(classNoContour).map(function(k){ return k + ':' + classNoContour[k]; }).join(',');
    var nonSlStr = Object.keys(classNonSliceable).map(function(k){ return k + ':' + classNonSliceable[k]; }).join(',');
    console.log('§SC_CLASSES withContour=[' + classStr + '] noContour=[' + noContStr + '] nonSliceable=[' + nonSlStr + ']');

    // Sample first contour coordinates for coordinate-range sanity check
    for (var si = 0; si < results.length; si++) {
        if (results[si].contours && results[si].contours.length > 0 && results[si].contours[0].points.length > 0) {
            var sp = results[si].contours[0].points[0];
            console.log('§SC_SAMPLE firstContour class=' + results[si].ifcClass +
                        ' guid=' + results[si].guid.substring(0, 8) +
                        ' pt0=[' + sp[0].toFixed(3) + ',' + sp[1].toFixed(3) + ']' +
                        ' cutZ=' + cutZ.toFixed(3));
            break;
        }
    }

    var elapsed = Date.now() - t0;
    console.log('§SC_DONE total=' + results.length +
                ' cut=' + cutCount + ' below=' + belowCount + ' above=' + aboveCount +
                ' sliced=' + sliceCount + ' contours=' + totalContours + ' time=' + elapsed + 'ms');

    return results;
}

// -------------------------------------------------------------------------
// Export — attach to window if available (Web Worker compatible)
// -------------------------------------------------------------------------

var api = {
    detectStoreys: detectStoreys,
    sectionCut: sectionCut,
    sliceMesh: sliceMesh,
    chainSegments: chainSegments,
    getBuildingStats: getBuildingStats,
    // Expose constants for testing
    TOLERANCE: TOLERANCE,
    EPSILON: EPSILON,
    DEFAULT_CUT_OFFSET: DEFAULT_CUT_OFFSET,
    MAX_ELEMENTS_POC: MAX_ELEMENTS_POC,
    CLIP_MARGIN: CLIP_MARGIN
};

// -------------------------------------------------------------------------
// Saved Cuts API — 2D_027 §2.2
// -------------------------------------------------------------------------
// Implementing 2D_027 §2.2 — Witness: W-2D27

api.savedCuts = []; // [{name, axis, constant, label}]

api._loadCuts = function(buildingKey) {
    try {
        var raw = localStorage.getItem(buildingKey + ':sectionCuts');
        api.savedCuts = raw ? JSON.parse(raw) : [];
    } catch (e) { api.savedCuts = []; }
};

api._saveCutsToStorage = function(buildingKey) {
    try {
        localStorage.setItem(buildingKey + ':sectionCuts', JSON.stringify(api.savedCuts));
    } catch (e) {}
};

api.saveCut = function(APP, axis, constant) {
    var bldKey = (APP && APP.activeBuilding) ? APP.activeBuilding : 'bld';
    api._loadCuts(bldKey);
    var n = api.savedCuts.length + 1;
    var name = 'SectionCut' + n;
    api.savedCuts.push({ name: name, axis: axis, constant: constant, label: axis + ' @ ' + constant.toFixed(2) + 'm' });
    api._saveCutsToStorage(bldKey);
    console.log('§GRID_CUT_SAVE name=' + name + ' axis=' + axis + ' constant=' + constant.toFixed(3));
    if (window.KernelOps && window.APP && APP.db) KernelOps.commitOp(APP.db, 'SECTION_CUT', {name:name,axis:axis,constant:constant});
    return name;
};

api.removeCut = function(APP, name) {
    var bldKey = (APP && APP.activeBuilding) ? APP.activeBuilding : 'bld';
    api._loadCuts(bldKey);
    api.savedCuts = api.savedCuts.filter(function(c) { return c.name !== name; });
    api._saveCutsToStorage(bldKey);
};

api.restoreCut = function(APP, name) {
    var bldKey = (APP && APP.activeBuilding) ? APP.activeBuilding : 'bld';
    api._loadCuts(bldKey);
    var cut = null;
    for (var i = 0; i < api.savedCuts.length; i++) {
        if (api.savedCuts[i].name === name) { cut = api.savedCuts[i]; break; }
    }
    if (!cut) { console.warn('[SectionCut] restoreCut: not found: ' + name); return; }
    if (APP && APP.sectionPlane) APP.sectionPlane.constant = cut.constant;
    if (APP) { APP.sectionAxis = cut.axis; APP.sectionOn = true; }
    console.log('§GRID_CUT_VIEW name=' + name + ' axis=' + cut.axis + ' constant=' + cut.constant.toFixed(3));
};

if (typeof window !== 'undefined') {
    window.SectionCut = api;
}

})();
