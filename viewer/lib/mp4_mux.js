// §MAXQ_MP4 — minimal ISO-BMFF (MP4) muxer for a single H.264/AVC video track.
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_MP4 SPEC (2026-07-19).
//
// HAND-ROLLED, not vendored: no third-party code, no CDN, no license question — every byte here
// is auditable against ISO/IEC 14496-12 (ISO base media file format) and 14496-15 (AVC in ISOBMFF).
// Written for the MaxQ exporter, which already has every encoded chunk in memory before muxing,
// so this is a non-fragmented, write-once muxer — no fMP4 complexity needed.
//
// Layout is FASTSTART: ftyp -> moov -> mdat. moov-last would also be legal, but moov-first is what
// mobile players and messaging apps (the whole reason this feature exists) want.
//
// The avcC payload is the encoder's own AVCDecoderConfigurationRecord, taken verbatim from
// EncodedVideoChunkMetadata.decoderConfig.description when the VideoEncoder runs avc:{format:'avc'}.
// It is NOT reconstructed here — nothing about the bitstream is invented by this file.
(function() {
  'use strict';

  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function str4(s) { return [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]; }

  // A box is [size][type][payload...]; payload parts may be arrays or Uint8Arrays.
  function box(type, parts) {
    var len = 8, i, flat = [];
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p instanceof Uint8Array) len += p.length; else len += p.length;
      flat.push(p);
    }
    var out = new Uint8Array(len), o = 0, j;
    out.set(u32(len), 0); out.set(str4(type), 4); o = 8;
    for (i = 0; i < flat.length; i++) {
      var q = flat[i];
      if (q instanceof Uint8Array) { out.set(q, o); o += q.length; }
      else { for (j = 0; j < q.length; j++) out[o++] = q[j]; }
    }
    return out;
  }
  function fullBox(type, version, flags, parts) {
    return box(type, [[version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]].concat(parts));
  }

  var UNITY_MATRIX = [
    0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x00, 0x00, 0x00
  ];

  // ---- avcC sanity + in-band recovery ---------------------------------------------------------
  // MEASURED 2026-07-19: Firefox 148's `decoderConfig.description` is MALFORMED — it emits each
  // parameter set with its NAL header byte DUPLICATED (SPS `67 67 64 00 28…`, length 24 for a
  // 23-byte SPS; PPS `68 68 eb…`). ffmpeg decodes it only by luck ("sps_id 1 out of range"), and a
  // strict mobile player would reject the file outright. Chrome's record is clean.
  // Firefox does, however, put a correct SPS/PPS IN-BAND ahead of the first IDR. So: parse the
  // encoder's record, and if the parameter sets don't self-identify correctly, rebuild the record
  // from the in-band NALs. Nothing is invented — the bytes still come from the encoder either way.
  function parseAvcC(a) {
    try {
      if (!a || a.length < 7 || a[0] !== 1) return null;
      var o = 5, nsps = a[o] & 0x1f, i, len, sets = { sps: [], pps: [] };
      o++;
      for (i = 0; i < nsps; i++) {
        len = (a[o] << 8) | a[o + 1]; o += 2;
        if (o + len > a.length) return null;
        sets.sps.push(a.subarray(o, o + len)); o += len;
      }
      var npps = a[o]; o++;
      for (i = 0; i < npps; i++) {
        len = (a[o] << 8) | a[o + 1]; o += 2;
        if (o + len > a.length) return null;
        sets.pps.push(a.subarray(o, o + len)); o += len;
      }
      return sets;
    } catch (e) { return null; }
  }
  function avcCLooksValid(a) {
    var s = parseAvcC(a);
    if (!s || !s.sps.length || !s.pps.length) return false;
    // A well-formed SPS NAL is `nal_unit_type == 7` followed by profile_idc — a duplicated header
    // byte shows up as byte[1] also carrying nal_unit_type 7, which no real profile_idc does.
    for (var i = 0; i < s.sps.length; i++) {
      if ((s.sps[i][0] & 0x1f) !== 7) return false;
      if (s.sps[i].length > 1 && (s.sps[i][1] & 0x1f) === 7 && (s.sps[i][1] & 0x60) === (s.sps[i][0] & 0x60)) return false;
    }
    for (var j = 0; j < s.pps.length; j++) {
      if ((s.pps[j][0] & 0x1f) !== 8) return false;
      if (s.pps[j].length > 1 && (s.pps[j][1] & 0x1f) === 8 && (s.pps[j][1] & 0x60) === (s.pps[j][0] & 0x60)) return false;
    }
    return true;
  }
  // Scan a length-prefixed (AVCC) sample for its in-band SPS (type 7) / PPS (type 8) NALs.
  function inbandParamSets(sample) {
    var sps = null, pps = null, o = 0, d = sample;
    while (o + 4 <= d.length) {
      var len = (d[o] << 24 >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];
      o += 4;
      if (len <= 0 || o + len > d.length) break;
      var t = d[o] & 0x1f;
      if (t === 7 && !sps) sps = d.subarray(o, o + len);
      else if (t === 8 && !pps) pps = d.subarray(o, o + len);
      o += len;
    }
    return (sps && pps) ? { sps: sps, pps: pps } : null;
  }
  function buildAvcC(sps, pps) {
    var out = [1, sps[1], sps[2], sps[3], 0xff, 0xe1, (sps.length >> 8) & 255, sps.length & 255];
    var arr = out.concat(Array.prototype.slice.call(sps));
    arr = arr.concat([1, (pps.length >> 8) & 255, pps.length & 255]);
    arr = arr.concat(Array.prototype.slice.call(pps));
    return new Uint8Array(arr);
  }

  /**
   * mux({width, height, fps, avcC, samples}) -> Uint8Array
   *   width/height : encoded frame size in pixels (must match the SPS; even numbers)
   *   fps          : frames per second (integer or fractional)
   *   avcC         : Uint8Array — AVCDecoderConfigurationRecord from decoderConfig.description
   *   samples      : [{data: Uint8Array, key: bool, cts: microseconds}] in DECODE order
   *                  (WebCodecs delivers output chunks in decode order; `cts` is chunk.timestamp)
   * Timing: mdhd timescale = round(fps*1000), every sample delta = 1000. Exact for any fps, and
   * avoids the sub-frame rounding a 1000-timescale would introduce at e.g. 15 or 29.97 fps.
   * B-FRAMES: Firefox's encoder reorders (decode order != presentation order), so a `ctts` box is
   * emitted whenever the supplied `cts` values disagree with the decode timeline. Without it the
   * player shows a few frames in the wrong order — measured, not theoretical.
   */
  function mux(opts) {
    var w = opts.width, h = opts.height;
    var samples = opts.samples, n = samples.length;
    var avcC = opts.avcC;
    if (!n) throw new Error('mp4mux: no samples');
    var avcCSource = 'encoder';
    if (!avcCLooksValid(avcC)) {
      var key0 = null;
      for (i = 0; i < n; i++) if (samples[i].key) { key0 = samples[i].data; break; }
      var ib = key0 ? inbandParamSets(key0) : null;
      if (!ib) throw new Error('mp4mux: avcC malformed and no in-band SPS/PPS to rebuild from');
      avcC = buildAvcC(ib.sps, ib.pps);
      avcCSource = 'in-band-rebuild';
    }
    if (!avcC || !avcC.length) throw new Error('mp4mux: missing avcC decoder description');

    var timescale = Math.max(1, Math.round(opts.fps * 1000));
    var sampleDelta = 1000;
    var trackDuration = n * sampleDelta;                        // in mdhd timescale
    var MVHD_TS = 1000;                                          // movie timescale = ms
    var movieDuration = Math.round(trackDuration / timescale * MVHD_TS);

    var totalMdat = 0, i;
    for (i = 0; i < n; i++) totalMdat += samples[i].data.length;

    var ftyp = box('ftyp', [
      str4('isom'), u32(512),
      str4('isom'), str4('iso2'), str4('avc1'), str4('mp41')
    ]);

    // ---- sample tables -------------------------------------------------------------------
    var stts = fullBox('stts', 0, 0, [u32(1), u32(n), u32(sampleDelta)]);

    // ctts (composition offsets) — only when the encoder reordered. Offsets are normalised by the
    // minimum so they are all >= 0 and version-0 (unsigned) ctts stays legal; subtracting a
    // constant only shifts the whole track's presentation start, never the relative order.
    var ctts = null, reordered = false, firstCts = 0;
    var haveCts = true;
    for (i = 0; i < n; i++) if (typeof samples[i].cts !== 'number') { haveCts = false; break; }
    if (haveCts) {
      var offs = [], minOff = Infinity;
      for (i = 0; i < n; i++) {
        var ctsTs = Math.round(samples[i].cts * timescale / 1e6);
        var o = ctsTs - i * sampleDelta;
        offs.push(o);
        if (o < minOff) minOff = o;
      }
      for (i = 0; i < n; i++) { offs[i] -= minOff; if (offs[i] !== 0) reordered = true; }
      if (reordered) {
        // Normalising to non-negative ctts (version 0, the maximally-compatible form) pushes the
        // first presented sample off t=0 by the reorder delay. An edit list maps it back so the
        // clip starts on its first frame instead of a fraction of a second of nothing.
        firstCts = Infinity;
        for (i = 0; i < n; i++) firstCts = Math.min(firstCts, offs[i] + i * sampleDelta);
        // Run-length encode into ctts entries.
        var entries = [], run = 1;
        for (i = 1; i <= n; i++) {
          if (i < n && offs[i] === offs[i - 1]) { run++; continue; }
          entries.push([run, offs[i - 1]]); run = 1;
        }
        var cbody = u32(entries.length), ei;
        for (ei = 0; ei < entries.length; ei++) cbody = cbody.concat(u32(entries[ei][0])).concat(u32(entries[ei][1]));
        ctts = fullBox('ctts', 0, 0, [cbody]);
      }
    }
    try {
      console.log('§MAXQ_MP4 mux samples=' + n + ' avcC=' + avcCSource +
        ' ctts=' + (ctts ? 'yes (B-frame reorder)' : 'no') + ' timescale=' + timescale);
    } catch (e) {}

    var syncs = [];
    for (i = 0; i < n; i++) if (samples[i].key) syncs.push(i + 1);   // stss is 1-based
    // If every sample is a keyframe, stss is optional and may be omitted (all-sync is the default).
    var stss = (syncs.length === n) ? null : (function() {
      var body = u32(syncs.length), k;
      for (k = 0; k < syncs.length; k++) body = body.concat(u32(syncs[k]));
      return fullBox('stss', 0, 0, [body]);
    })();

    // One sample per chunk — keeps stsc trivial and stco a straight per-sample offset table.
    var stsc = fullBox('stsc', 0, 0, [u32(1), u32(1), u32(1), u32(1)]);

    var szBody = u32(0).concat(u32(n));                            // sample_size=0 -> per-sample table
    for (i = 0; i < n; i++) szBody = szBody.concat(u32(samples[i].data.length));
    var stsz = fullBox('stsz', 0, 0, [szBody]);

    function buildStco(baseOffset) {
      var body = u32(n), off = baseOffset, k;
      for (k = 0; k < n; k++) { body = body.concat(u32(off)); off += samples[k].data.length; }
      return fullBox('stco', 0, 0, [body]);
    }

    var avc1 = box('avc1', [
      [0, 0, 0, 0, 0, 0],          // reserved
      u16(1),                      // data_reference_index
      u16(0), u16(0),              // pre_defined, reserved
      u32(0), u32(0), u32(0),      // pre_defined[3]
      u16(w), u16(h),
      u32(0x00480000), u32(0x00480000),  // 72 dpi h/v resolution
      u32(0),                      // reserved
      u16(1),                      // frame_count
      new Uint8Array(32),          // compressorname (32 bytes, zeroed)
      u16(0x0018),                 // depth
      [0xff, 0xff],                // pre_defined = -1
      box('avcC', [avcC])
    ]);
    var stsd = fullBox('stsd', 0, 0, [u32(1), avc1]);

    function buildMoov(stco) {
      var parts = [stsd, stts];
      if (ctts) parts.push(ctts);
      if (stss) parts.push(stss);
      parts.push(stsc, stsz, stco);
      var stbl = box('stbl', parts);
      var dinf = box('dinf', [box('dref', [[0, 0, 0, 0], u32(1), fullBox('url ', 0, 1, [])])]);
      var minf = box('minf', [fullBox('vmhd', 0, 1, [u16(0), u16(0), u16(0), u16(0)]), dinf, stbl]);
      var hdlr = fullBox('hdlr', 0, 0, [
        u32(0), str4('vide'), u32(0), u32(0), u32(0),
        (function() { var s = 'VideoHandler\0', a = [], k; for (k = 0; k < s.length; k++) a.push(s.charCodeAt(k)); return a; })()
      ]);
      var mdhd = fullBox('mdhd', 0, 0, [u32(0), u32(0), u32(timescale), u32(trackDuration), u16(0x55c4), u16(0)]);
      var mdia = box('mdia', [mdhd, hdlr, minf]);
      var tkhd = fullBox('tkhd', 0, 3, [   // flags 3 = track_enabled | track_in_movie
        u32(0), u32(0), u32(1), u32(0), u32(movieDuration),
        u32(0), u32(0), u16(0), u16(0), u16(0), u16(0),
        UNITY_MATRIX, u32(w * 65536), u32(h * 65536)
      ]);
      var trakParts = [tkhd];
      if (firstCts > 0) {
        trakParts.push(box('edts', [fullBox('elst', 0, 0, [
          u32(1), u32(movieDuration), u32(firstCts), u16(1), u16(0)   // rate 1.0 as 16.16
        ])]));
      }
      trakParts.push(mdia);
      var trak = box('trak', trakParts);
      var mvhd = fullBox('mvhd', 0, 0, [
        u32(0), u32(0), u32(MVHD_TS), u32(movieDuration),
        u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
        UNITY_MATRIX, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2)
      ]);
      return box('moov', [mvhd, trak]);
    }

    // Two-pass: stco entries are fixed 4 bytes, so a moov built with placeholder offsets has the
    // SAME size as the final one — measure it, then rebuild with the real mdat payload offsets.
    var probeMoov = buildMoov(buildStco(0));
    var mdatStart = ftyp.length + probeMoov.length + 8;   // +8 = mdat header
    var moov = buildMoov(buildStco(mdatStart));
    if (moov.length !== probeMoov.length) throw new Error('mp4mux: moov size drifted between passes');

    var out = new Uint8Array(ftyp.length + moov.length + 8 + totalMdat), o = 0;
    out.set(ftyp, o); o += ftyp.length;
    out.set(moov, o); o += moov.length;
    out.set(u32(8 + totalMdat), o); o += 4;
    out.set(str4('mdat'), o); o += 4;
    for (i = 0; i < n; i++) { out.set(samples[i].data, o); o += samples[i].data.length; }
    return out;
  }

  window.MP4Mux = { mux: mux };
})();
