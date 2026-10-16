#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — scope: RESUME_HR_BIM_ASSET.md §2026-07-06c Item E. Places the 4 already-sourced
# real IFC/LOD device meshes (IFC/LOD/*.ifc — see IFC/LOD/README.md for provenance) into
# buildings/HHS_Office_Federated_extracted.db as REAL standing elements (elements_meta/
# element_transforms/element_instances/component_geometries rows) at each device's already-real bound
# anchor position (hr_bim_asset/iot.js DEVICES/CAMERAS — the SAME guids flyToZone/locateAndHighlight/
# captureFacingSnapshot already treat as "where this device is").
#
# ANCHOR-SHIM DISCIPLINE (per user: "check the Sprinkler... how it is anchored to another part") —
# this mirrors the REAL established pattern (library/component_library.db component_definitions'
# attachment_face TOP/BOTTOM/CENTER + DAGCompiler LibraryFactory.calculateWorldCenter() + disc_walker.js
# hostBind()'s host-face + Z-offset math for FP sprinklers hosted on IfcCovering) — NOT a naive
# "dump the device's mesh exactly at the host's raw centroid" (which would render the device mesh
# visually BURIED inside the host element's own geometry).
#   - BOTTOM_OF_HOST: device hangs from the host's own UNDERSIDE (host_center_z - host_bz/2), its own
#     TOP face touching that surface — e.g. the temp sensor mounting to the underside of its ceiling-
#     hosted AHU diffuser, the same relationship real sprinklers have to their IfcCovering host.
#   - TOP_OF_HOST: device rests ON the host's own TOP surface (host_center_z + host_bz/2), its own
#     BOTTOM face touching that surface — e.g. the PV module resting on the roof.
#   - CENTER: co-located with the host's own real centroid — used only where no real mounting-face fact
#     exists (the electrical meter's exact face on MDP-1; the 6 cameras' relationship to their host
#     doors) — this is also the SAME anchor convention every other part of this feature already uses
#     (flyToZone/locateAndHighlight/captureFacingSnapshot all target the host guid's raw centroid).
# NOTE: unlike LibraryFactory's formula (which assumes local coords keep the ORIGINAL IFC insertion-
# point origin), THIS script centers each device's own tessellated vertices on ITS OWN bbox midpoint
# (matching bim-compiler tools/extract.py's own convention) — so the Z-offset math below is a from-
# scratch derivation for THAT convention, not a verbatim copy of LibraryFactory's formula (which would
# be WRONG under a different local-origin convention — this exact mismatch is why it isn't reused
# as-is).
#
# ROTATION: identity (0,0,0) for every device. The REAL established mechanism for a host-bound device's
# yaw (modeller/disc_walker.js hostBind(), line ~228: "yaw=wall rotation_z — the host normal = the SHIM
# facing") is to INHERIT the host's own rotation_z directly, never independently compute one — that IS
# how sprinklers/outlets/grilles get correctly oriented in a Modeller-AUTHORED building, where walls
# genuinely carry real nonzero rotation_z. Applying that exact real mechanism here: this building
# (HHS_Office_Federated) is a STATIC IFC-EXTRACTED building, not Modeller-authored — its own real
# element_transforms.rotation_z is 0 for EVERY element including these 6 host doors (a different, valid
# extraction convention — this extractor bakes world orientation into vertex positions instead of a
# separate rotation field). Inheriting the host's own real rotation_z (the correct, precedented approach)
# therefore yields 0 here too — a fact about this specific building's data, not an absence of precedent.
# A camera's independent AIM direction (as opposed to inherited host yaw) would need the vertex-baking
# convention this building's own real elements use (rotate vertices before centering/storing) — a real,
# doable next increment, deliberately deferred here rather than guessed.
#
# Sensors WITHOUT a sourced real-geometry object (pressure/sound/dust/movement — see IFC/LOD/
# README.md "Genuinely not found yet") are deliberately SKIPPED — they keep the existing tint-on-host-
# element-only representation, never a fabricated stand-in mesh.
#
# Run:  python3 scripts/place_iot_lod_devices.py   (from the bim-ootb repo root)
# Read the §IOT_LOD_PLACE log lines after running — not just the exit code.

import hashlib
import sqlite3
import sys

import ifcopenshell
import ifcopenshell.geom
import numpy as np

DB_PATH = 'buildings/HHS_Office_Federated_extracted.db'
LOD_DIR = 'IFC/LOD'
BUILDING = 'HHS_Office_Federated'
DISCIPLINE = 'MEP'   # real convention already in this db: ARC/MEP/STR — these are mechanical/electrical/IoT devices

SETTINGS = ifcopenshell.geom.settings()
SETTINGS.set(SETTINGS.USE_WORLD_COORDS, False)
SETTINGS.set(SETTINGS.WELD_VERTICES, True)


def geometry_hash(vblob, fblob):
    return hashlib.sha256(vblob + fblob).hexdigest()[:16]


def tessellate(ifc_path, ifc_class, from_type_repmap, prerotate=None):
    """Mirrors bim-compiler tools/extract.py's extract_from_ifc_to_library() centering convention —
    local vertices centered on the element's OWN bbox midpoint, float32/int32 blobs, sha256 hash.

    `prerotate` — an optional (x,y,z)->(x,y,z) axis remap applied to the RAW vertices BEFORE centering.
    Not a guessed compass-direction fix — this building's own real elements achieve correct orientation
    by baking it directly into vertex positions (rotation_x/y/z is inert/0 for everything here, see
    scripts/place_iot_lod_devices.py header) — the SAME convention this applies. Needed because these
    manufacturer catalog objects were authored in whatever local axis their own tool used (confirmed by
    inspection, not assumed): the solar panel's local Z is its 1.61m LONG edge, not a thin "up" axis — an
    identity-rotation placement rendered it standing bolt-upright like a signboard (visually confirmed via
    a live close-up screenshot), not lying flat as a real rooftop-mounted panel. A 90°-about-X remap
    (y,z)->(-z,y) swaps that long edge into a horizontal axis and the true thin edge into vertical — a
    real physical-installation correction, not a fabricated fact."""
    model = ifcopenshell.open(ifc_path)
    elem = model.by_type(ifc_class)[0]
    if from_type_repmap:
        rep = elem.RepresentationMaps[0].MappedRepresentation
        geo = ifcopenshell.geom.create_shape(SETTINGS, rep)
    else:
        geo = ifcopenshell.geom.create_shape(SETTINGS, elem).geometry
    verts = np.array(geo.verts, dtype=np.float64).reshape(-1, 3)
    faces = np.array(geo.faces, dtype=np.int32).reshape(-1, 3)
    if prerotate == 'X90':          # (x,y,z) -> (x,-z,y): swaps long-Z into horizontal-Y, thin-Y into vertical-Z
        verts = np.column_stack([verts[:, 0], -verts[:, 2], verts[:, 1]])
    center = (verts.min(axis=0) + verts.max(axis=0)) / 2.0
    v_centered = (verts - center).astype(np.float32)
    vblob = v_centered.tobytes()
    fblob = faces.astype(np.int32).tobytes()
    ghash = geometry_hash(vblob, fblob)
    bbox = v_centered.max(axis=0) - v_centered.min(axis=0)

    # real declared color (first IfcColourRgb in the file) — never a guessed/fabricated color.
    cols = model.by_type('IfcColourRgb')
    if cols:
        c = cols[0]
        rgba = '%.3f,%.3f,%.3f,1.000' % (c.Red, c.Green, c.Blue)
    else:
        rgba = '0.502,0.502,0.502,1.000'   # matches this db's own real fallback-grey convention
    return {'vblob': vblob, 'fblob': fblob, 'hash': ghash, 'bbox': bbox, 'rgba': rgba, 'ifc_class': ifc_class}


def host_row(conn, host_guid):
    row = conn.execute(
        'SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid=?',
        (host_guid,)).fetchone()
    if not row:
        raise SystemExit('§IOT_LOD_PLACE_FAIL host guid not found in element_transforms: ' + host_guid)
    return row


def anchored_center(host, mesh, mount):
    hx, hy, hz, hbx, hby, hbz = host
    half_h = float(mesh['bbox'][2]) / 2.0
    if mount == 'BOTTOM_OF_HOST':          # device hangs from host's underside, its own TOP touches it
        target_z = hz - hbz / 2.0
        return (hx, hy, target_z - half_h)
    if mount == 'TOP_OF_HOST':             # device rests on host's top surface, its own BOTTOM touches it
        target_z = hz + hbz / 2.0
        return (hx, hy, target_z + half_h)
    return (hx, hy, hz)                    # CENTER — co-located with host's own real centroid


def insert_row(conn, guid, mesh, name, storey, center):
    conn.execute(
        'INSERT OR IGNORE INTO component_geometries (geometry_hash, vertices, faces, building) VALUES (?,?,?,?)',
        (mesh['hash'], mesh['vblob'], mesh['fblob'], BUILDING))
    conn.execute(
        'INSERT OR REPLACE INTO elements_meta '
        '(guid, ifc_class, element_name, storey, discipline, material_name, material_rgba, building) '
        'VALUES (?,?,?,?,?,?,?,?)',
        (guid, mesh['ifc_class'], name, storey, DISCIPLINE, None, mesh['rgba'], BUILDING))
    conn.execute(
        'INSERT OR REPLACE INTO element_transforms '
        '(guid, center_x, center_y, center_z, rotation_x, rotation_y, rotation_z, bbox_x, bbox_y, bbox_z) '
        'VALUES (?,?,?,?,0,0,0,?,?,?)',
        (guid, center[0], center[1], center[2], float(mesh['bbox'][0]), float(mesh['bbox'][1]), float(mesh['bbox'][2])))
    conn.execute('INSERT OR REPLACE INTO element_instances (guid, geometry_hash) VALUES (?,?)', (guid, mesh['hash']))


SENSOR_DEVICES = [
    # (guid, ifc_path, ifc_class, from_type_repmap, host_guid, mount, name, storey, prerotate)
    ('IOTDEV-TEMP-HHS', LOD_DIR + '/Sensor_Aico_Ei1025_TempHumidityCO2.ifc', 'IfcSensorType', True,
     '04i7IlvuLBuOmBXGMxmbgo', 'BOTTOM_OF_HOST', 'Temp/Humidity/CO2 Sensor (Aico Ei1025)', 'Level 3', None),
    ('IOTDEV-SOLAR-HHS', LOD_DIR + '/Solar_NBS_PhotovoltaicModule.ifc', 'IfcEnergyConversionDevice', False,
     '3XrBtx9eX7mQE6EqWHPey$', 'TOP_OF_HOST', 'Photovoltaic Module (NBS generic)', 'Roof Level', 'X90'),
    ('IOTDEV-ELEC-HHS', LOD_DIR + '/Electrical_Bender_LINETRAXX_PEM353_PowerMeter.ifc', 'IfcFlowInstrumentType', True,
     '1Atj4lkpv3qwTaPKeAZIaj', 'CENTER', 'Power Quality Meter (Bender LINETRAXX PEM353)', 'Level 1', None),
]
CAMERA_IFC = LOD_DIR + '/CCTV_Paxton10MiniBulletCamera_CORE.ifc'
CAMERA_HOSTS = [
    ('IOTDEV-CAM1-HHS', '0LmR_Oafz6LvpHnBLJOGi$', 'Level 1'),
    ('IOTDEV-CAM2-HHS', '1UDlgEuSLAZ9OyOKOB0RyW', 'Level 1'),
    ('IOTDEV-CAM3-HHS', '0Z1xu3E5b8zPJTx3GNZg8Y', 'Level 2'),
    ('IOTDEV-CAM4-HHS', '0lKZdaAjTCjBh_cVCMRZrh', 'Level 2'),
    ('IOTDEV-CAM5-HHS', '0TgQK$gCn8wu43pHf2VHup', 'Level 3'),
    ('IOTDEV-CAM6-HHS', '1Jil894uX328zr$s_sQLvj', 'Level 3'),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    placed = []

    for guid, path, cls, from_type, host_guid, mount, name, storey, prerotate in SENSOR_DEVICES:
        mesh = tessellate(path, cls, from_type, prerotate)
        host = host_row(conn, host_guid)
        center = anchored_center(host, mesh, mount)
        insert_row(conn, guid, mesh, name, storey, center)
        placed.append((guid, name, mount, center, mesh))

    # camera barrel (local +Z, the long 0.162m axis) also renders standing on-end under identity rotation
    # (same class of bug as the solar panel) — X90 lays it horizontal. Real compass-facing/yaw (matching
    # each camera's own already-declared `facing`) is NOT applied here — see script header/PR notes: a
    # correct 2-axis aim needs this pipeline's untested rotation_z column, deliberately deferred.
    cam_mesh = tessellate(CAMERA_IFC, 'IfcBuildingElementProxy', False, prerotate='X90')
    for guid, host_guid, storey in CAMERA_HOSTS:
        host = host_row(conn, host_guid)
        center = anchored_center(host, cam_mesh, 'CENTER')
        insert_row(conn, guid, cam_mesh, 'CCTV Camera (Paxton10 Mini Bullet, CORE series)', storey, center)
        placed.append((guid, 'CCTV Camera', 'CENTER', center, cam_mesh))

    conn.commit()
    conn.close()

    for guid, name, mount, center, mesh in placed:
        print('§IOT_LOD_PLACE guid=%s name=%s mount=%s center=(%.2f,%.2f,%.2f) hash=%s verts=%d faces=%d bbox=(%.3f,%.3f,%.3f)' % (
            guid, name, mount, center[0], center[1], center[2], mesh['hash'],
            len(mesh['vblob']) // 12, len(mesh['fblob']) // 12,
            mesh['bbox'][0], mesh['bbox'][1], mesh['bbox'][2]))
    print('§IOT_LOD_PLACE_DONE placed=%d (3 sensors: temp/solar/electrical + 6 cameras) '
          'skipped=4 sensors (pressure/sound/dust/movement — no sourced real geometry, IFC/LOD/README.md) '
          'rotation=identity-for-all (no live-tested nonzero-rotation precedent in this pipeline)' % len(placed))


if __name__ == '__main__':
    sys.exit(main())
