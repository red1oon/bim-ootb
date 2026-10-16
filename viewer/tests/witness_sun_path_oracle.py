#!/usr/bin/env python3
# Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
"""W-SUN-PATH-ORACLE — the provenance for witness_sun_path.js's accuracy numbers.

THE ISSUE IT PROVES OR DISPROVES:
  witness_sun_path.js pins viewer/sun_path.js against astronomical facts (obliquity, solstice
  dates, the analemma, solar-noon geometry). Those catch a DROPPED TERM. They do not measure
  absolute accuracy, because a check with a +-0.3 deg tolerance cannot tell 0.02 deg of error
  from 0.25 deg of error. This script measures it, against an implementation that shares no code
  and no algorithm with ours: pysolar, which implements NREL's SPA — a different and
  higher-precision method, not a second copy of NOAA low-precision.

WHY IT IS A SEPARATE, OPTIONAL SCRIPT AND NOT PART OF THE SHIPPED WITNESS:
  pysolar is not a dependency of this project and must never become one. The viewer ships
  offline; a witness that needed a pip install to run would be a witness most sessions skip.
  So the numbers are measured HERE, quoted in witness_sun_path.js's header with their date, and
  re-derivable by anyone who runs this. It prints INCONCLUSIVE, never PASS, when pysolar is
  absent — an unrun oracle proves nothing and must not read as agreement.

SETUP (pysolar is NOT installed by this project, and PEP 668 blocks a system-wide pip here):
    python3 -m venv /tmp/sunvenv && /tmp/sunvenv/bin/pip install pysolar
    /tmp/sunvenv/bin/python viewer/tests/witness_sun_path_oracle.py

MEASURED 2026-09-18 (pysolar 0.13, node v18.19.1, 2968 samples):
    sun above 5 deg (1484 samples):  max |d elevation| 0.019 deg   max |d azimuth| 0.034 deg
    all samples:                     max |d elevation| 0.382 deg   max |d azimuth| 0.052 deg
  The all-samples elevation figure is larger ON PURPOSE and is not a defect: at and below the
  horizon the two libraries use different atmospheric-refraction models, and refraction there is
  worth about half a degree. Azimuth, which refraction does not touch, stays inside 0.06 deg
  everywhere. Both are far below anything a compass rose on a construction film can render.
"""
import datetime
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SUN_JS = os.path.join(HERE, '..', 'sun_path.js')

# Real extracted fleet coordinates (DAGCompiler/python/extractIFCtoDB.py `extract_georef` output,
# see bim-compiler scripts/witness_georef_extract.py) plus one southern-hemisphere probe, because
# every building this project owns is north of the equator and a hemisphere bug would hide there.
LOCATIONS = [
    ('Hospital_IFC2x3_ARC (Boston)',     42.35842896,  -71.05977631),
    ('merged_federation (Penang)',        5.96277289,  100.63712571),
    ('Ifc2x3_Duplex (Chicago)',          41.87440000,  -87.63940000),
    ('Ifc4_SampleHouse (London)',        51.50015259,   -0.12623620),
    ('Schependomlaan (NL)',              52.15000000,    5.38333333),
    ('LTU_AHouse_STR (Sweden)',          59.28110000,   17.80680000),
    ('southern-hemisphere probe',       -33.86880000,  151.20930000),
]
DAY_STEP = 7
HOURS = [0, 4, 8, 10, 12, 14, 16, 20]
UP_THRESHOLD_DEG = 5.0

GEN_JS = r'''
const { setupSunPath } = require(process.argv[2]);
const A = {}; const _l = console.log; console.log = function(){}; setupSunPath(A); console.log = _l;
const locs = JSON.parse(process.argv[4]);
const out = [];
for (const [name, lat, lon] of locs) {
  for (let doy = 0; doy < 365; doy += %(step)d) {
    for (const hh of %(hours)s) {
      const d = new Date(Date.UTC(2026, 0, 1 + doy, hh, 17, 0));
      const p = A.sunPositionAt(lat, lon, d);
      out.push({ name, lat, lon, iso: d.toISOString(),
                 az: p.azimuth, el: p.elevation, elApp: p.elevationApparent });
    }
  }
}
require('fs').writeFileSync(process.argv[3], JSON.stringify(out));
'''


def main():
    try:
        from pysolar import solar
    except ImportError:
        print('§SUN_ORACLE INCONCLUSIVE — pysolar is not installed, so NOTHING was compared. '
              'See this file\'s header for the venv command. This is not a PASS.')
        sys.exit(2)

    with tempfile.TemporaryDirectory() as td:
        gen = os.path.join(td, 'gen.js')
        rows_path = os.path.join(td, 'rows.json')
        open(gen, 'w').write(GEN_JS % {'step': DAY_STEP, 'hours': json.dumps(HOURS)})
        r = subprocess.run([  'node', gen, os.path.abspath(SUN_JS), rows_path,
                             json.dumps(LOCATIONS)], capture_output=True, text=True)
        if r.returncode != 0:
            print('§SUN_ORACLE FAIL — could not run viewer/sun_path.js under node:\n' + r.stderr)
            sys.exit(1)
        rows = json.load(open(rows_path))

    if not rows:
        print('§SUN_ORACLE INCONCLUSIVE — VACUOUS: the sample grid produced 0 rows')
        sys.exit(2)

    worst = {'el_all': (0.0, None), 'az_all': (0.0, None),
             'el_up': (0.0, None), 'az_up': (0.0, None)}

    def bump(k, v, row):
        if v > worst[k][0]:
            worst[k] = (v, row)

    n_up = 0
    for row in rows:
        when = datetime.datetime.fromisoformat(row['iso'].replace('Z', '+00:00'))
        # solar.get_altitude applies refraction, so it is compared against OUR refracted value —
        # comparing it against the geometric one would measure the refraction models, not the
        # algorithm, and would look like a 0.5 deg "error" that is nothing of the kind.
        alt = solar.get_altitude(row['lat'], row['lon'], when)
        azi = solar.get_azimuth(row['lat'], row['lon'], when)
        d_el = abs(alt - row['elApp'])
        d_az = abs((azi - row['az'] + 180) % 360 - 180)      # wrap-safe angular difference
        bump('el_all', d_el, row)
        bump('az_all', d_az, row)
        if alt > UP_THRESHOLD_DEG:      # azimuth is ill-conditioned near and below the horizon
            n_up += 1
            bump('el_up', d_el, row)
            bump('az_up', d_az, row)

    def line(tag, key):
        v, row = worst[key]
        where = f"{row['name']} {row['iso']}" if row else 'n/a'
        print(f'  §SUN_ORACLE {tag:34s} {v:.6f} deg   worst at {where}')

    print(f'§SUN_ORACLE comparing viewer/sun_path.js (NOAA low-precision) against pysolar (NREL SPA)')
    print(f'  samples={len(rows)} locations={len(LOCATIONS)} sun-above-{UP_THRESHOLD_DEG:g}deg={n_up}')
    line('max |d elevation| sun up', 'el_up')
    line('max |d azimuth|   sun up', 'az_up')
    line('max |d elevation| all rows', 'el_all')
    line('max |d azimuth|   all rows', 'az_all')

    if n_up == 0:
        print('§SUN_ORACLE INCONCLUSIVE — VACUOUS: the sun was never above the horizon in the '
              'sample grid, so the sun-up figures judged nothing')
        sys.exit(2)

    # Gates set from the 2026-09-18 measurement with headroom, so a REGRESSION fails while normal
    # float/library drift does not. These are not the claim — the printed numbers are the claim.
    GATES = [('el_up', 0.05), ('az_up', 0.10), ('el_all', 0.60), ('az_all', 0.15)]
    bad = [(k, worst[k][0], lim) for k, lim in GATES if worst[k][0] > lim]
    for k, v, lim in bad:
        print(f'  §SUN_ORACLE REGRESSION {k} = {v:.6f} deg exceeds the {lim} deg gate')
    print('§SUN_ORACLE ' + ('PASS' if not bad else 'FAIL') +
          f' samples={len(rows)} gates={len(GATES)} exceeded={len(bad)}')
    sys.exit(0 if not bad else 1)


if __name__ == '__main__':
    main()
