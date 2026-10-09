#!/bin/sh
# Fetches the generic CMYK press profile used by the ICC checks. NOT committed (licence is the profile owner's, not ours).
# Source: Artifex Ghostscript default CMYK profile. Verifies the checksum recorded when the POC was written.
set -e
cd "$(dirname "$0")"; mkdir -p profiles
URL=https://raw.githubusercontent.com/ArtifexSoftware/ghostpdl/master/iccprofiles/default_cmyk.icc
SHA=8472fa1493a024b800b67dee9424835ec0c41ab79490200ae8ec4a689fd1b9a9
[ -f profiles/default_cmyk.icc ] || curl -fsSL -o profiles/default_cmyk.icc "$URL"
echo "$SHA  profiles/default_cmyk.icc" | sha256sum -c -
