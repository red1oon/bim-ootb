#!/bin/sh
# Fetches the generic CMYK press profile used by the ICC checks. NOT committed (licence is the profile owner's, not ours).
# Source: Artifex Ghostscript default CMYK profile. Verifies the checksum recorded when the POC was written.
set -e
cd "$(dirname "$0")"; mkdir -p profiles
URL=https://raw.githubusercontent.com/ArtifexSoftware/ghostpdl/master/iccprofiles/default_cmyk.icc
SHA=8472fa1493a024b800b67dee9424835ec0c41ab79490200ae8ec4a689fd1b9a9
URL2=https://raw.githubusercontent.com/ArtifexSoftware/ghostpdl/master/iccprofiles/default_rgb.icc
SHA2=eddaf344b5edea13269e0d20055f335610e5e0b6e33e6e536f2701bc18c5f7d5
[ -f profiles/default_rgb.icc ] || curl -fsSL -o profiles/default_rgb.icc "$URL2"
echo "$SHA2  profiles/default_rgb.icc" | sha256sum -c -
[ -f profiles/default_cmyk.icc ] || curl -fsSL -o profiles/default_cmyk.icc "$URL"
echo "$SHA  profiles/default_cmyk.icc" | sha256sum -c -
