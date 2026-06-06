// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// sfx.js — Optional synthesized audio-feedback OVERLAY for the BIM viewer.
// Spec: prompts/VIEWER_SFX_AUDIO.md. Pure WebAudio synthesis — NO audio files, NO DB:
// nothing is written to the building database; the only scene data read is the `phase`
// Time Machine already computes from kernel_ops. Config = sfx.json + localStorage override.
// Default OFF; one AudioContext lazily created on the first user gesture (the speaker toggle).
//
// Two audio layers:
//   1. Discrete EARCONS — a 12-voice synth engine (riser/whoosh/FM-bell/thud/sparkle/…),
//      assigned to phases/UI in sfx.json. Fired on TM phase change, fly waypoint, pill tap.
//   2. Continuous SCENE VIOLIN (opt-in) — a sustained bowed-string-ish drone whose pitch &
//      emphasis are parameter-mapped to viewer state (progress/activity). The "living" bed.
//
// Seams (separation of concern — sound logic lives ONLY here):
//   • Time Machine: time_machine.js calls window.__sfxTM(phasesArr, pos, info). No-op when off.
//   • Fly tour: we POLL A.flyActive / A.walkActionIdx (zero core edit).
//   • Pill tap: one delegated pointerup listener on #mobile-pill.
(function () {
  'use strict';

  var _cfg = null, _phaseMap = {}, _defaultRow = null, _ui = {};
  var _on = false, _ctx = null, _master = null, _gestured = false, _lastSoundT = 0;

  // ── Config ──────────────────────────────────────────────────────────────────
  function _applyConfig(cfg) {
    _cfg = cfg || {};
    var m = _cfg.master || {};
    _phaseMap = {}; _defaultRow = null; _ui = {};
    (_cfg.construction_sounds || []).forEach(function (r) { if (r.phase === '*') _defaultRow = r; else _phaseMap[r.phase] = r; });
    (_cfg.ui_sounds || []).forEach(function (r) { _ui[r.id] = r; });
    var saved = null; try { saved = localStorage.getItem('sfx_on'); } catch (e) {}
    _on = (saved === '1') ? true : (saved === '0') ? false : !!m.enabled;
    var n = (_cfg.construction_sounds || []).length + (_cfg.ui_sounds || []).length;
    console.log('§SFX_INIT enabled=' + _on + ' sounds=' + n + ' style=' + (m.style || '?') + ' violin=' + !!m.scene_violin);
    return n;
  }
  function _loadConfig() {
    if (typeof window.loadJsonWithOverrides === 'function') {
      return window.loadJsonWithOverrides('sfx.json', 'json_sfx').then(function (raw) {
        var src = 'json'; try { if (localStorage.getItem('json_sfx')) src = 'json+override'; } catch (e) {}
        console.log('§SFX_CONFIG loaded=' + src + ' sounds=' + _applyConfig(raw));
      }).catch(function (err) { console.warn('§SFX_CONFIG loaded=fallback error=' + err.message); _applyConfig({ master: { enabled: false } }); });
    }
    return fetch('sfx.json').then(function (r) { return r.json(); })
      .then(function (raw) { _applyConfig(raw); console.log('§SFX_CONFIG loaded=json-direct'); })
      .catch(function (err) { console.warn('§SFX_CONFIG loaded=fallback error=' + err.message); _applyConfig({ master: { enabled: false } }); });
  }

  // ── Audio context ─────────────────────────────────────────────────────────────
  function audio() {
    if (_ctx) { if (_ctx.state === 'suspended') _ctx.resume(); return _ctx; }
    if (!_gestured) return null;   // never create the AudioContext before a user gesture (no autoplay-blocked spam)
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('§SFX_NOCTX WebAudio unavailable'); return null; }
    _ctx = new AC();
    _master = _ctx.createGain();
    var vol = (_cfg && _cfg.master && typeof _cfg.master.volume === 'number') ? _cfg.master.volume : 1.0;
    _master.gain.value = Math.max(0, Math.min(4, vol));     // allow boost above 1.0
    // Limiter — keeps the boosted signal loud but clean (no harsh clipping).
    var comp = _ctx.createDynamicsCompressor();   // gentle peak catcher near 0dB — stays LOUD, just no clipping
    comp.threshold.value = -1.5; comp.knee.value = 0; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.25;
    _master.connect(comp); comp.connect(_ctx.destination);
    return _ctx;
  }

  // ── Synth primitives ──────────────────────────────────────────────────────────
  function _env(g, t0, peak, dur, atk) { atk = atk || 0.008; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
  function _pan(c, p0, p1, t0, dur) { if (!c.createStereoPanner) return null; var p = c.createStereoPanner(); p.pan.setValueAtTime(p0 == null ? 0 : p0, t0); if (p1 != null) p.pan.linearRampToValueAtTime(p1, t0 + dur); return p; }
  // ONE shared 3s white-noise buffer reused by every noise voice (sources stop early per dur) —
  // avoids allocating a Float32Array on every hit (GC churn during noisy construction).
  var _nb = null;
  function _noiseBuffer(c) { if (_nb) return _nb; var n = Math.floor(c.sampleRate * 3), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; _nb = b; return _nb; }
  function _tone(o) {
    var c = audio(); if (!c) return 0; var t0 = (o.at != null ? o.at : c.currentTime), dur = o.dur || 0.2;
    var osc = c.createOscillator(); osc.type = o.wave || 'sine'; osc.frequency.setValueAtTime(o.freq, t0);
    if (o.glideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    var g = c.createGain(); _env(g, t0, o.gain == null ? 0.8 : o.gain, dur, o.atk);
    if (o.vibHz) { var lfo = c.createOscillator(), la = c.createGain(); lfo.frequency.value = o.vibHz; la.gain.value = o.vibDepth || 8; lfo.connect(la); la.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.05); }
    var chain = g; osc.connect(g);
    if (o.lp) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); chain = f; }
    var pn = _pan(c, o.pan, o.panTo, t0, dur); if (pn) { chain.connect(pn); pn.connect(_master); } else chain.connect(_master);
    osc.start(t0); osc.stop(t0 + dur + 0.05); return t0 + dur;
  }
  function _noise(o) {
    var c = audio(); if (!c) return 0; var t0 = (o.at != null ? o.at : c.currentTime), dur = o.dur || 0.3;
    var src = c.createBufferSource(); src.buffer = _noiseBuffer(c);
    var f = c.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q || 4; f.frequency.setValueAtTime(o.f0 || 600, t0);
    if (o.f1 != null) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    var g = c.createGain(); _env(g, t0, o.gain == null ? 0.5 : o.gain, dur, o.atk || 0.01);
    src.connect(f); f.connect(g);
    var pn = _pan(c, o.pan, o.panTo, t0, dur); if (pn) { g.connect(pn); pn.connect(_master); } else g.connect(_master);
    src.start(t0); src.stop(t0 + dur + 0.02); return t0 + dur;
  }
  function _fm(o) {
    var c = audio(); if (!c) return 0; var t0 = (o.at != null ? o.at : c.currentTime), dur = o.dur || 0.5;
    var car = c.createOscillator(); car.type = 'sine'; car.frequency.value = o.freq;
    var mod = c.createOscillator(); mod.type = 'sine'; mod.frequency.value = o.freq * (o.ratio || 2);
    var mg = c.createGain(); mg.gain.setValueAtTime(o.freq * (o.index || 5), t0); mg.gain.exponentialRampToValueAtTime(1, t0 + dur);
    mod.connect(mg); mg.connect(car.frequency);
    var g = c.createGain(); _env(g, t0, o.gain == null ? 0.6 : o.gain, dur, 0.005); car.connect(g);
    var pn = _pan(c, o.pan, o.panTo, t0, dur); if (pn) { g.connect(pn); pn.connect(_master); } else g.connect(_master);
    mod.start(t0); car.start(t0); mod.stop(t0 + dur + 0.05); car.stop(t0 + dur + 0.05); return t0 + dur;
  }

  // ── Cinematic reverb hall (shared bus) + noise helper for the SFX one-shots ─────
  function _makeIR(c, sec, decay) { var len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(2, len, c.sampleRate); for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return buf; }
  var _cb = null;
  function cinBus() { var c = audio(); if (!c) return null; if (_cb) return _cb; var conv = c.createConvolver(); conv.buffer = _makeIR(c, 2.6, 2.6); var wet = c.createGain(); wet.gain.value = 0.42; conv.connect(wet); wet.connect(_master); var bus = c.createGain(); bus.gain.value = 1.0; bus.connect(_master); bus.connect(conv); _cb = bus; return _cb; }
  function _nz(c, dur) { var s = c.createBufferSource(); s.buffer = _noiseBuffer(c); return s; }   // shared 3s buffer; caller stops at dur

  // ── Named voices (earcons). Each takes the assigned freq(Hz)+ms and a pan. ──────
  var VOICES = {
    tone:    function (f, s, pan) { _tone({ freq: f, dur: s, wave: 'sine', gain: 0.8, pan: pan }); },
    riser:   function (f, s, pan) { _tone({ freq: f, glideTo: f * 4, dur: s, wave: 'triangle', gain: 0.7, pan: pan }); },
    drop:    function (f, s, pan) { _tone({ freq: f, glideTo: f * 0.35, dur: s, wave: 'sawtooth', gain: 0.6, lp: 3000, pan: pan }); },
    whoosh:  function (f, s, pan) { _noise({ f0: f, f1: f * 6, dur: s, q: 2, gain: 0.45, pan: (pan || 0) - 0.6, panTo: (pan || 0) + 0.6 }); },
    bell:    function (f, s, pan) { _fm({ freq: f, ratio: 2.0, index: 7, dur: s, gain: 0.55, pan: pan }); },
    steel:   function (f, s, pan) { _fm({ freq: f, ratio: 3.1, index: 9, dur: s, gain: 0.5, pan: pan }); },
    knock:   function (f, s, pan) { _tone({ freq: f, glideTo: f * 0.55, dur: Math.min(0.1, s), wave: 'triangle', gain: 0.7, lp: 1200, pan: pan }); _noise({ f0: 1800, f1: 600, dur: 0.05, filter: 'lowpass', gain: 0.3, pan: pan }); },
    thud:    function (f, s, pan) { _tone({ freq: f, glideTo: f * 0.65, dur: s, wave: 'sine', gain: 0.9, pan: pan }); _noise({ f0: f * 3, f1: f * 1.1, dur: s * 0.9, filter: 'lowpass', q: 1, gain: 0.4, pan: pan }); },
    pluck:   function (f, s, pan) { _noise({ f0: f * 1.7, f1: f * 1.4, dur: Math.min(0.18, s), filter: 'bandpass', q: 10, gain: 0.5, pan: pan }); },
    sparkle: function (f, s, pan) { for (var i = 0; i < 7; i++) _tone({ freq: f * Math.pow(1.18, i), dur: 0.12, wave: 'sine', gain: 0.35, pan: pan, at: audio().currentTime + i * 0.045 }); },
    stab:    function (f, s, pan) { [1, 1.26, 1.5].forEach(function (r) { _tone({ freq: f * r, dur: s, wave: 'square', gain: 0.4, pan: pan }); }); },
    wobble:  function (f, s, pan) { _tone({ freq: f, dur: s, wave: 'sine', gain: 0.8, vibHz: 5, vibDepth: f * 0.25, pan: pan }); }
  };
  // ── Cinematic SFX one-shots (royalty-free by construction) — through the hall ────
  VOICES.impact = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01; var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f || 130, at); o.frequency.exponentialRampToValueAtTime(38, at + 0.28); var g = c.createGain(); g.gain.setValueAtTime(0.95, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.7); o.connect(g); g.connect(b); o.start(at); o.stop(at + 0.75); var ns = _nz(c, 0.12), ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 1800; ff.Q.value = 0.8; var ng = c.createGain(); ng.gain.setValueAtTime(0.55, at); ng.gain.exponentialRampToValueAtTime(0.001, at + 0.12); ns.connect(ff); ff.connect(ng); ng.connect(b); ns.start(at); ns.stop(at + 0.13); };
  VOICES.braam = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, base = f || 55; [1, 1.5, 2].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * r; var bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.setValueAtTime(260, at); bf.frequency.linearRampToValueAtTime(1300, at + 1.1); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.2, at + 0.85); g.gain.exponentialRampToValueAtTime(0.001, at + 2.3); o.connect(bf); bf.connect(g); g.connect(b); o.start(at); o.stop(at + 2.4); }); };
  VOICES.riser = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, dur = 2.0; var ns = _nz(c, dur), ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.Q.value = 1.0; ff.frequency.setValueAtTime(280, at); ff.frequency.exponentialRampToValueAtTime(5000, at + dur); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + dur * 0.96); g.gain.exponentialRampToValueAtTime(0.001, at + dur + 0.1); ns.connect(ff); ff.connect(g); g.connect(b); ns.start(at); ns.stop(at + dur + 0.12); };
  VOICES.downlift = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, dur = 1.5; var ns = _nz(c, dur), ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.Q.value = 1.0; ff.frequency.setValueAtTime(5000, at); ff.frequency.exponentialRampToValueAtTime(260, at + dur); var g = c.createGain(); g.gain.setValueAtTime(0.3, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); ns.connect(ff); ff.connect(g); g.connect(b); ns.start(at); ns.stop(at + dur + 0.1); };
  VOICES.subdrop = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01; var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f || 90, at); o.frequency.exponentialRampToValueAtTime(24, at + 1.2); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.9, at + 0.05); g.gain.exponentialRampToValueAtTime(0.001, at + 1.4); o.connect(g); g.connect(b); o.start(at); o.stop(at + 1.5); };
  VOICES.boom = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01; var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f || 60, at); o.frequency.exponentialRampToValueAtTime((f || 60) * 0.7, at + 1.0); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.8, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 1.7); o.connect(g); g.connect(b); o.start(at); o.stop(at + 1.8); };
  // clank — short inharmonic metallic hit (3 bell partials + a bandpass tick), panned, through
  // the hall. Zero asset; the "metal-on-metal" you pass when the ray-blast hits a vertical surface.
  VOICES.clank = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.005, dur = (s && s > 0.05) ? s : 0.2, pn = c.createStereoPanner ? c.createStereoPanner() : null; if (pn) { pn.pan.value = pan || 0; pn.connect(b); } [1, 2.76, 5.4].forEach(function (r, i) { var o = c.createOscillator(); o.type = 'square'; o.frequency.value = (f || 240) * r; var g = c.createGain(); var pk = 0.42 / (i + 1); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(pk, at + 0.004); g.gain.exponentialRampToValueAtTime(0.001, at + dur); o.connect(g); g.connect(pn || b); o.start(at); o.stop(at + dur + 0.05); }); var ns = _nz(c, 0.03), ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 3200; ff.Q.value = 0.9; var ng = c.createGain(); ng.gain.setValueAtTime(0.4, at); ng.gain.exponentialRampToValueAtTime(0.001, at + 0.04); ns.connect(ff); ff.connect(ng); ng.connect(pn || b); ns.start(at); ns.stop(at + 0.06); };
  VOICES.stinger = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, base = f || 110; [1, 1.19, 1.5].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * r; var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.18, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 0.8); o.connect(lp); lp.connect(g); g.connect(b); o.start(at); o.stop(at + 0.85); }); };
  VOICES.tension = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, base = f || 110; [1, 1.06].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * r; var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.14, at + 0.4); g.gain.setValueAtTime(0.14, at + 1.2); g.gain.exponentialRampToValueAtTime(0.001, at + 2.0); var trem = c.createOscillator(); trem.frequency.value = 6; var tg = c.createGain(); tg.gain.value = 0.05; trem.connect(tg); tg.connect(g.gain); o.connect(lp); lp.connect(g); g.connect(b); trem.start(at); o.start(at); trem.stop(at + 2.0); o.stop(at + 2.05); }); };
  // Cinematic whoosh (reverbed, pans with motion) — overrides the dry one for this style.
  VOICES.whoosh = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, dur = (s && s > 0.1) ? s : 0.5; var ns = _nz(c, dur), ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.Q.value = 1.5; ff.frequency.setValueAtTime(500, at); ff.frequency.exponentialRampToValueAtTime(4000, at + dur); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.4, at + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.001, at + dur); var p = c.createStereoPanner ? c.createStereoPanner() : null; ns.connect(ff); if (p) { p.pan.setValueAtTime((pan || 0) - 0.8, at); p.pan.linearRampToValueAtTime((pan || 0) + 0.8, at + dur); ff.connect(g); g.connect(p); p.connect(b); } else { ff.connect(g); g.connect(b); } ns.start(at); ns.stop(at + dur + 0.05); };
  // rollup — accelerating drum roll that CRESCENDOS into a hit + braam swell + long reverb tail.
  VOICES.rollup = function (f, s, pan) { var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.02, base = (f || 90) / 2; var tt = at, gap = 0.17, hits = 14; for (var i = 0; i < hits; i++) { (function (ht, amp) { var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(base * 1.5, ht); o.frequency.exponentialRampToValueAtTime(base, ht + 0.1); var g = c.createGain(); g.gain.setValueAtTime(amp, ht); g.gain.exponentialRampToValueAtTime(0.001, ht + 0.18); o.connect(g); g.connect(b); o.start(ht); o.stop(ht + 0.2); })(tt, 0.12 + 0.5 * (i / hits)); tt += gap; gap *= 0.92; } var hitAt = tt + 0.05; var oo = c.createOscillator(); oo.type = 'sine'; oo.frequency.setValueAtTime(base * 2, hitAt); oo.frequency.exponentialRampToValueAtTime(base * 0.6, hitAt + 0.4); var gg = c.createGain(); gg.gain.setValueAtTime(0.9, hitAt); gg.gain.exponentialRampToValueAtTime(0.001, hitAt + 1.9); oo.connect(gg); gg.connect(b); oo.start(hitAt); oo.stop(hitAt + 2.0); [1, 1.5].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * r; var bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.setValueAtTime(300, hitAt); bf.frequency.linearRampToValueAtTime(1200, hitAt + 1.0); var g = c.createGain(); g.gain.setValueAtTime(0.0001, hitAt); g.gain.exponentialRampToValueAtTime(0.18, hitAt + 0.6); g.gain.exponentialRampToValueAtTime(0.001, hitAt + 2.2); o.connect(bf); bf.connect(g); g.connect(b); o.start(hitAt); o.stop(hitAt + 2.3); }); };

  // Door creak — stick-slip: downward pitch glide + fast irregular tremolo through a resonant
  // bandpass, into the SAME shared reverb. Two oscillators, near-zero cost.
  VOICES.creak = function (f, s, pan) {
    var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, base = f || 200, dur = (s && s > 0.1) ? s : 0.7;
    var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(base, at); o.frequency.exponentialRampToValueAtTime(base * 0.55, at + dur);
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 3; bp.Q.value = 8;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.28, at + 0.05); g.gain.setValueAtTime(0.28, at + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    var lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(19, at); lfo.frequency.linearRampToValueAtTime(7, at + dur); var lg = c.createGain(); lg.gain.value = 0.22; lfo.connect(lg); lg.connect(g.gain);
    o.connect(bp); bp.connect(g); var pn = c.createStereoPanner ? c.createStereoPanner() : null; if (pn) { pn.pan.value = pan || 0; g.connect(pn); pn.connect(b); } else g.connect(b);
    o.start(at); lfo.start(at); o.stop(at + dur + 0.05); lfo.stop(at + dur + 0.05);
  };

  // Harp — quick ascending plucked arpeggio (triangle), shared reverb. The "harp" accent.
  VOICES.harp = function (f, s, pan) {
    var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, base = f || 330;
    [0, 3, 7, 10, 12].forEach(function (semi, i) { var fr = base * Math.pow(2, semi / 12), t = at + i * 0.055; var o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); var pn = c.createStereoPanner ? c.createStereoPanner() : null; o.connect(g); if (pn) { pn.pan.value = pan || 0; g.connect(pn); pn.connect(b); } else g.connect(b); o.start(t); o.stop(t + 0.55); });
  };
  // Cymbal / crash — bright filtered-noise shimmer with a fast attack + medium decay (shared reverb).
  VOICES.cymbal = function (f, s, pan) {
    var c = audio(); if (!c) return; var b = cinBus(), at = c.currentTime + 0.01, dur = (s && s > 0.15) ? s : 0.4;
    var ns = _nz(c, dur), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f || 5000;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.004); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    ns.connect(hp); hp.connect(g); var pn = c.createStereoPanner ? c.createStereoPanner() : null; if (pn) { pn.pan.value = pan || 0; g.connect(pn); pn.connect(b); } else g.connect(b);
    ns.start(at); ns.stop(at + dur + 0.05);
  };

  // ── Musical mode: snap every event pitch to one key so it's always consonant ────
  // (the wind-chime principle — quantize to a scale over the violin drone). When
  // master.musical is off, _quantize is a pass-through and voices use raw freq.
  var SCALES = { major_pentatonic: [0, 2, 4, 7, 9], minor_pentatonic: [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
  function _scaleSemis(name) { var b = SCALES[name] || SCALES.minor_pentatonic, all = []; for (var o = -2; o <= 3; o++) for (var i = 0; i < b.length; i++) all.push(b[i] + o * 12); return all; }
  function _quantize(hz) {
    var m = _cfg && _cfg.master; if (!m || !m.musical || !hz) return hz;
    var root = m.root_hz || 146.83, semis = 12 * Math.log(hz / root) / Math.log(2);
    var allowed = _scaleSemis(m.scale), best = allowed[0], bd = 1e9;
    for (var i = 0; i < allowed.length; i++) { var d = Math.abs(allowed[i] - semis); if (d < bd) { bd = d; best = allowed[i]; } }
    return root * Math.pow(2, best / 12);
  }
  function _playRow(row, pan) {
    if (!_on || !row) return;
    _lastSoundT = Date.now();
    var fn = VOICES[row.voice] || VOICES.tone;
    var f = _quantize(row.freq || 330), s = (row.ms || 160) / 1000, p = (pan == null ? 0 : pan);
    var rep = row.repeat || 1, gap = row.gap_ms || 130;   // ta-ta-ta spurts when repeat>1
    if (rep > 1) { for (var i = 0; i < rep; i++) (function (k) { setTimeout(function () { if (_on) fn(f, s, p); }, k * gap); })(i); }
    else fn(f, s, p);
  }

  // ── SCENE VIOLIN — sustained bowed-string-ish drone, live parameter-mapped ──────
  // pitch (Hz) ← caller-supplied viewer scalar; emphasis 0..1 ← activity. Smoothly
  // glides via setTargetAtTime so it "breathes" rather than steps.
  var _violin = null;
  function _startViolin(baseHz) {
    var c = audio(); if (!c || _violin) return _violin;
    var t = c.currentTime;
    var mix = c.createGain(); mix.gain.value = 0.0001;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
    var form = c.createBiquadFilter(); form.type = 'bandpass'; form.frequency.value = 1100; form.Q.value = 1.1; // body formant
    var oscs = [];
    [-7, 6].forEach(function (det) { var o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; o.frequency.value = baseHz || 220; o.connect(mix); o.start(t); oscs.push(o); });
    var sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = (baseHz || 220) / 2; sub.connect(mix); sub.start(t); oscs.push(sub);
    var vib = c.createOscillator(); vib.frequency.value = 5; var vg = c.createGain(); vg.gain.value = 3; vib.connect(vg);
    oscs.forEach(function (o) { vg.connect(o.detune); }); vib.start(t);
    mix.connect(lp); lp.connect(form); form.connect(_master);
    _violin = {
      _oscs: oscs, _sub: sub, _vib: vib, _vg: vg, _mix: mix, _lp: lp,
      setPitch: function (hz) { var n = audio().currentTime; oscs.forEach(function (o) { o.frequency.setTargetAtTime(hz, n, 0.15); }); sub.frequency.setTargetAtTime(hz / 2, n, 0.15); },
      setEmphasis: function (e) { e = Math.max(0, Math.min(1, e)); var n = audio().currentTime; mix.gain.setTargetAtTime(0.0001 + e * 0.32, n, 0.2); lp.frequency.setTargetAtTime(500 + e * 2800, n, 0.25); vg.gain.setTargetAtTime(2 + e * 8, n, 0.2); },
      stop: function () { var n = audio().currentTime; mix.gain.setTargetAtTime(0.0001, n, 0.3); setTimeout(function () { try { oscs.forEach(function (o) { o.stop(); }); vib.stop(); } catch (e) {} }, 600); _violin = null; }
    };
    console.log('§SFX_VIOLIN start base=' + (baseHz || 220));
    return _violin;
  }

  // ── CINEMATIC SCORE — deep orchestral bed (string ensemble + brass + drums + braam) ──
  var _cine = null;
  var _bedLastTick = 0;   // ms of the last TM seam call — bed self-expires when renders stop
  function _startCine() {
    var c = audio(); if (!c || _cine) return _cine; var t = c.currentTime;
    var bus = cinBus();   // shared reverb hall — no second convolver/IR (saves ~1.5MB RAM)
    var ROOTC = (_cfg && _cfg.master && _cfg.master.root_hz) || 87.31, curHz = ROOTC;
    var MINOR = [0, 2, 3, 5, 7, 8, 10];
    function dgr(n) { var oct = Math.floor(n / 7), idx = ((n % 7) + 7) % 7; return Math.pow(2, (MINOR[idx] + oct * 12) / 12); }
    var bed = c.createGain(); bed.gain.value = 0.0001;
    var bedLP = c.createBiquadFilter(); bedLP.type = 'lowpass'; bedLP.frequency.value = 480;
    var voices = [];
    function ens(ratio, pan, wave, det) { var o = c.createOscillator(); o.type = wave || 'sawtooth'; o.frequency.value = ROOTC * ratio; o.detune.value = det || 0; var g = c.createGain(); g.gain.value = (wave === 'sine' ? 0.9 : 0.45); o.connect(g); var p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = pan; g.connect(p); p.connect(bed); } else g.connect(bed); o.start(t); voices.push({ o: o, ratio: ratio }); }
    ens(0.25, 0, 'sine'); ens(0.5, 0, 'sine'); ens(1, -0.25, 'sawtooth', -7); ens(1, 0.25, 'sawtooth', 7); ens(1, 0, 'sawtooth', 0); ens(1.4983, -0.5, 'sawtooth', -5); ens(1.4983, 0.5, 'sawtooth', 6); ens(2, 0, 'sawtooth', 3);
    var vib = c.createOscillator(); vib.frequency.value = 0.25; var vg = c.createGain(); vg.gain.value = 5; vib.connect(vg); voices.forEach(function (v) { vg.connect(v.o.detune); }); vib.start(t);
    bed.connect(bedLP); bedLP.connect(bus); bed.gain.setTargetAtTime(0.24, t, 1.6);
    var brass = c.createGain(); brass.gain.value = 0.0001;
    var brassF = c.createBiquadFilter(); brassF.type = 'bandpass'; brassF.frequency.value = 260; brassF.Q.value = 0.7;
    var brassV = []; [0.5, 0.75].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = ROOTC * r; o.connect(brass); o.start(t); brassV.push({ o: o, ratio: r }); });
    brass.connect(brassF); brassF.connect(bus);
    function braam(at, mul) { [0.5, 0.75, 1].forEach(function (r) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = curHz * r; var bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.setValueAtTime(280, at); bf.frequency.linearRampToValueAtTime(1100, at + 1.1); var g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.16 * mul, at + 0.9); g.gain.exponentialRampToValueAtTime(0.001, at + 2.2); o.connect(bf); bf.connect(g); g.connect(bus); o.start(at); o.stop(at + 2.3); }); }
    function timp(at, f, g) { var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.14); var ga = c.createGain(); ga.gain.setValueAtTime(0.0001, at); ga.gain.exponentialRampToValueAtTime(g, at + 0.008); ga.gain.exponentialRampToValueAtTime(0.001, at + 0.7); o.connect(ga); ga.connect(bus); o.start(at); o.stop(at + 0.75); }
    function lead(at, f, g) { var car = c.createOscillator(); car.type = 'triangle'; car.frequency.value = f; var ga = c.createGain(); ga.gain.setValueAtTime(0.0001, at); ga.gain.exponentialRampToValueAtTime(g, at + 0.05); ga.gain.exponentialRampToValueAtTime(0.001, at + 1.0); car.connect(ga); ga.connect(bus); car.start(at); car.stop(at + 1.05); }
    var intensity = 0.4, step = 0, MOTIF = [0, 3, 7, 5, 3, 0, 5, 7], beatMs = 1150;
    var timer = setInterval(function () {
      if (!_on) return; var now = c.currentTime + 0.06;
      timp(now, curHz / 2, 0.4 + 0.5 * intensity);
      if (step % 8 === 0 && step > 0 && intensity > 0.45) braam(now, intensity);
      if (step % 2 === 1 && intensity > 0.2) {
        // VARIED melody — random in-key note (always consonant), occasional harp flourish.
        var deg = MINOR[(Math.random() * MINOR.length) | 0] + (Math.random() < 0.5 ? 12 : 19);
        lead(now, curHz * Math.pow(2, deg / 12), 0.14 * intensity);
        if (Math.random() < 0.16) { for (var h = 0; h < 4; h++) lead(now + h * 0.07, curHz * Math.pow(2, (MINOR[h % MINOR.length] + 24) / 12), 0.07 * intensity); }
      }
      bedLP.frequency.setTargetAtTime(360 + 1500 * intensity, c.currentTime, 0.5);
      brass.gain.setTargetAtTime(0.0001 + 0.16 * intensity, c.currentTime, 0.6);
      step++;
    }, beatMs);
    _cine = {
      setIntensity: function (v) { intensity = Math.max(0, Math.min(1, v)); },
      setProgress: function (p) { curHz = ROOTC * Math.pow(2, Math.floor(p * 7) / 12); var n = c.currentTime; voices.forEach(function (v) { v.o.frequency.setTargetAtTime(curHz * v.ratio, n, 0.7); }); brassV.forEach(function (v) { v.o.frequency.setTargetAtTime(curHz * v.ratio, n, 0.7); }); },
      stop: function () { clearInterval(timer); var n = c.currentTime; bed.gain.setTargetAtTime(0.0001, n, 0.5); brass.gain.setTargetAtTime(0.0001, n, 0.5); setTimeout(function () { try { voices.forEach(function (v) { v.o.stop(); }); brassV.forEach(function (v) { v.o.stop(); }); vib.stop(); } catch (e) {} }, 800); _cine = null; }
    };
    console.log('§SFX_CINE start root=' + ROOTC.toFixed(1));
    return _cine;
  }

  // ── Helicopter rotor — short repetitive chop loop, orbited in stereo + distance ──
  var _heli = null;
  function _startHeli() {
    var c = audio(); if (!c || _heli) return _heli; var b = cinBus();
    var src = _nz(c, 1.0); src.loop = true;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    var chop = c.createGain(); chop.gain.value = 0.18;                       // rotor chop = AM
    var lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12; var lg = c.createGain(); lg.gain.value = 0.16; lfo.connect(lg); lg.connect(chop.gain);
    var dist = c.createGain(); dist.gain.value = 0.55;                       // distance = level (louder pass)
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    var thr = c.createOscillator(); thr.type = 'sawtooth'; thr.frequency.value = 55; var tg = c.createGain(); tg.gain.value = 0.05; thr.connect(tg); tg.connect(dist);
    src.connect(lp); lp.connect(chop); chop.connect(dist); if (pan) { dist.connect(pan); pan.connect(b); } else dist.connect(b);
    src.start(); lfo.start(); thr.start();
    var ang = 0, timer = setInterval(function () { if (!_on) return; ang += 0.25; var n = c.currentTime; if (pan) pan.pan.setTargetAtTime(Math.sin(ang), n, 0.2); dist.gain.setTargetAtTime(0.35 + 0.35 * (0.5 + 0.5 * Math.cos(ang)), n, 0.2); lp.frequency.setTargetAtTime(320 + 380 * (0.5 + 0.5 * Math.cos(ang)), n, 0.2); }, 200);
    _heli = { stop: function () { clearInterval(timer); var n = c.currentTime; dist.gain.setTargetAtTime(0.0001, n, 0.9); setTimeout(function () { try { src.stop(); lfo.stop(); thr.stop(); } catch (e) {} }, 3200); _heli = null; } }; // long fade carried by reverb
    console.log('§SFX_HELI start'); return _heli;
  }
  function _stopBed() { if (_cine) _cine.stop(); if (_violin) _violin.stop(); if (_heli) _heli.stop(); if (_groove) _groove.stop(); }

  // ── LIVE-SCENE LAYER — drummy Apache-style bass groove + camera-speed→pitch ─────
  // Plays while browsing (audio on, NOT in a TM sequence, not flying). All through the
  // single shared reverb bus, so it's just oscillators — minimal cost.
  var _groove = null;
  function _startGroove() {
    var c = audio(); if (!c || _groove) return _groove; var b = cinBus();
    var root = (_cfg && _cfg.master && _cfg.master.root_hz) || 87.31;
    function tom(at, f, g) { var o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f * 2, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.05); var ga = c.createGain(); ga.gain.setValueAtTime(0.0001, at); ga.gain.exponentialRampToValueAtTime(g, at + 0.005); ga.gain.exponentialRampToValueAtTime(0.001, at + 0.24); o.connect(ga); ga.connect(b); o.start(at); o.stop(at + 0.26); }
    var PAT = [1, 0, 1, 1, 0, 1, 0, 1], step = 0, beat = 0.19;   // galloping tom pattern
    var timer = setInterval(function () { if (!_on) return; var now = c.currentTime + 0.04; if (PAT[step % 8]) { var down = (step % 8 === 0); tom(now, down ? 110 : 150, down ? 0.6 : 0.42); if (down) tom(now, 78, 0.5); } step++; }, beat * 1000);
    _groove = { stop: function () { clearInterval(timer); _groove = null; } };
    console.log('§SFX_GROOVE start (Apache bass)'); return _groove;
  }
  // Movement voice: one sustained oscillator whose pitch + level track camera speed.
  var _moveVoice = null, _lastCamPos = null, _lastTgt = null, _lastDist = 0, _lastCamT = 0, _lastMoveT = 0, _lastNavCueT = 0;
  function _moveV() { var c = audio(); if (!c || _moveVoice) return _moveVoice; var b = cinBus(); var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90; var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; var g = c.createGain(); g.gain.value = 0.0001; o.connect(lp); lp.connect(g); g.connect(b); o.start(); _moveVoice = { o: o, g: g, lp: lp }; return _moveVoice; }
  // Navigation sonification: the overlay SENSES the action from camera/target deltas and plays a
  // correlated cue — ORBIT → continuous swish (pitch ∝ speed); ZOOM → pitch glide (in=up, out=down);
  // PAN → soft noise sweep. Silent during a scene bed (TM or fly orchestra).
  function _onCamChange() {
    if (!_on || (Date.now() - _bedLastTick) < 1500) return;
    var A = (window.APP || window.A), cam = A && A.camera, ctr = A && A.controls && A.controls.target;
    if (!cam || !cam.position || !ctr || !_ctx) return;
    var now = Date.now(), p = cam.position, dist = Math.hypot(p.x - ctr.x, p.y - ctr.y, p.z - ctr.z) || 1;
    if (_lastCamPos && _lastTgt) {
      var dt = Math.max(16, now - _lastCamT) / 1000;
      var dPos = Math.hypot(p.x - _lastCamPos.x, p.y - _lastCamPos.y, p.z - _lastCamPos.z);
      var dTgt = Math.hypot(ctr.x - _lastTgt.x, ctr.y - _lastTgt.y, ctr.z - _lastTgt.z);
      var dDist = dist - _lastDist, zoomMag = Math.abs(dDist), speed = dPos / dt;
      // ORBIT → the continuous movement voice
      var v = _moveV(); if (v) { var t = _ctx.currentTime; v.g.gain.setTargetAtTime(Math.min(0.13, speed * 0.011), t, 0.05); v.o.frequency.setTargetAtTime(70 + Math.min(320, speed * 10), t, 0.05); v.lp.frequency.setTargetAtTime(400 + Math.min(2200, speed * 70), t, 0.05); }
      // ZOOM / PAN → discrete correlated cue (throttled so it punctuates, not buzzes)
      if ((now - _lastNavCueT) > 150) {
        if (zoomMag > dTgt && zoomMag > 0.2) { _lastNavCueT = now; var up = dDist < 0; _tone({ freq: up ? 300 : 640, glideTo: up ? 640 : 300, dur: 0.13, wave: 'triangle', gain: 0.45 }); console.log('§SFX_NAV zoom=' + (up ? 'in' : 'out')); }
        else if (dTgt > 0.12) { _lastNavCueT = now; var pn = _panForPos(ctr); _noise({ f0: 500, f1: 2200, dur: 0.17, q: 1.5, gain: 0.26, pan: pn - 0.3, panTo: pn + 0.3 }); console.log('§SFX_NAV pan'); }
      }
      _lastMoveT = now;
    }
    _lastCamPos = { x: p.x, y: p.y, z: p.z }; _lastTgt = { x: ctr.x, y: ctr.y, z: ctr.z }; _lastDist = dist; _lastCamT = now;
  }
  function _wireControls() { var A = (window.APP || window.A); if (!A || !A.controls || typeof A.controls.addEventListener !== 'function' || A.controls.__sfxMove) return false; A.controls.addEventListener('change', _onCamChange); A.controls.__sfxMove = true; return true; }

  // ── Toggle (the user gesture that unlocks audio) ────────────────────────────────
  function setOn(on) {
    _on = !!on; try { localStorage.setItem('sfx_on', _on ? '1' : '0'); } catch (e) {}
    if (_on) _gestured = true;   // toggling IS a user gesture
    var c = _on ? audio() : _ctx;
    // The toggle IS the user gesture — make sure the context actually resumes (else: silence).
    if (_on && c && c.state === 'suspended') c.resume().then(function () { console.log('§SFX_RESUME ' + c.state); });
    console.log('§SFX_TOGGLE on=' + _on + ' ctx=' + (c ? c.state : 'none'));
    if (_on && _ui.toggle) _playRow(_ui.toggle, 0);
    // §AUDIO: audio OFF → stop the bed AND suspend the context so it holds no resource
    // (near-zero cost). suspend (not close) keeps the cached cinematic node graph valid;
    // audio() resumes it on next turn-on. Released lazily by the UA while suspended.
    if (!_on) { _stopBed(); if (_ctx && _ctx.state === 'running' && _ctx.suspend) _ctx.suspend(); }
    _syncPill();
    return _on;
  }
  function toggle() { return setOn(!_on); }
  function isOn() { return _on; }
  function _syncPill() { try { document.querySelectorAll('[data-pill-id="audio"],#audio-btn').forEach(function (b) { b.classList.toggle('active', _on); }); } catch (e) {} }

  // ── Positional pan from a world position via the active view centre ──────────────
  function _panForPos(pos) {
    var A = (window.APP || window.A); if (!pos || !A || !(_cfg && _cfg.master && _cfg.master.fly_positional)) return 0;
    try {
      var cam = A.camera, tgt = A.controls && A.controls.target; if (!cam || !cam.position || !tgt) return 0;
      var cp = cam.position;
      // camera right = forward × worldUp(0,1,0); forward = tgt-cp ⇒ right = (-fz, 0, fx)
      var rx = -(tgt.z - cp.z), rz = (tgt.x - cp.x), rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      var dx = pos.x - cp.x, dz = pos.z - cp.z, dist = Math.hypot(dx, pos.y - cp.y, dz) || 1;
      return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist));
    } catch (e) { return 0; }
  }

  // ── Seam: Time Machine ─────────────────────────────────────────────────────────
  // phases = sorted unique frontier phases; pos = centroid|null; info = {progress,active}.
  var _lastTmPhase = null, _lastHitAt = 0;
  window.__sfxTM = function (phases, pos, info) {
    if (!_on) { _lastTmPhase = null; return; }
    var m = _cfg && _cfg.master || {};
    // Scene bed during playback: cinematic orchestral score (style:cinematic) or scene violin.
    if (m.scene_bed && info) {
      _bedLastTick = Date.now();
      if (m.style === 'cinematic') {
        if (!_cine) _startCine();   // bed swells in on its own — no start-riser (that was the "sheesh")
        if (_cine) { _cine.setProgress(info.progress || 0); _cine.setIntensity(Math.min(1, 0.35 + (info.active || 0) / 50)); }
      } else if (m.scene_violin) {
        var root = (m.root_hz || 147);
        var v = _violin || _startViolin(root);
        if (v) { v.setPitch(_quantize(root * Math.pow(2, info.progress || 0))); v.setEmphasis(Math.min(1, (info.active || 0) / 40)); }
      }
    }
    // Active construction = a busy site: fire frequent, RANDOMIZED hits (steel/drums/pops),
    // rate-capped + jittered so it's noisy-but-musical. During fly-through / manual move there's
    // no construction → stay CALM (the seam only fires while the TM cursor advances; and we
    // explicitly mute hits when the camera is flying so the drone ambience carries it).
    if (!phases || !phases.length) { _lastTmPhase = null; return; }
    if ((window.APP || window.A) && (window.APP || window.A).flyActive) return;                       // calm during fly-through
    var dom = phases[0];
    var minMs = (m.hit_min_ms || 450) * (0.6 + Math.random() * 0.8);
    var now = Date.now();
    if ((now - _lastHitAt) < minMs) return;                           // rate cap only — same phase may repeat (noisy)
    _lastHitAt = now; _lastTmPhase = dom;
    var row = _phaseMap[dom] || _defaultRow; if (!row) return;
    var voice = row.voice, rep = row.repeat, gap = row.gap_ms, pool = m.hit_pool;
    if (pool && pool.length && Math.random() < (m.hit_random || 0.6)) {  // swap in a random accent for variety
      voice = pool[(Math.random() * pool.length) | 0];
      if (voice === 'knock' || voice === 'steel' || voice === 'pluck') { rep = 2 + ((Math.random() * 3) | 0); gap = 110 + ((Math.random() * 60) | 0); }
    }
    var pan = _panForPos(pos); _playRow({ voice: voice, freq: row.freq, ms: row.ms, repeat: rep, gap_ms: gap }, pan);
    console.log('§SFX_PLAY src=tm phase=' + dom + ' voice=' + voice + ' rep=' + (rep || 1) + ' pan=' + pan.toFixed(2));
  };

  // ── Fly poller (zero core edit) ─────────────────────────────────────────────────
  var _flyIdx = -1, _flyRaf = 0, _flyPtIdx = -1;
  // Passing a named spot on the fly path → a fitting, panned whoosh/bang.
  function _flySpot(name, pt) {
    var pan = _panForPos(pt), n = (name || '').toLowerCase();
    if (/stair/.test(n)) _playRow({ voice: 'impact', freq: 90, ms: 600 }, pan);                 // bang past stairs
    else if (/curtain|glass|wall/.test(n)) _playRow({ voice: 'whoosh', freq: 820, ms: 460 }, pan); // whoosh past walls/glass
    else if (/flush|door/.test(n)) _playRow({ voice: 'whoosh', freq: 560, ms: 320 }, pan);      // whoosh past doors
    else if (/level|floor/.test(n)) _playRow({ voice: 'braam', freq: 55, ms: 1400 }, pan);      // braam on a new floor
    else return;
    console.log('§SFX_PLAY src=flyspot name=' + (name || '?'));
  }
  function _flyTick() {
    var A = (window.APP || window.A);
    if (!A || !A.flyActive || !_on) { _flyRaf = 0; _flyIdx = -1; _flyPtIdx = -1; _rayLastObj = -1; return; }
    var act = (A.walkActions && A.walkActions[A.walkActionIdx | 0]) || {};
    if (act.type === 'flyPath' && act.points && act.points.length && A.camera && A.camera.position) {
      var cp = A.camera.position, best = -1, bd = 1e12;
      for (var i = 0; i < act.points.length; i++) { var p = act.points[i], dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
      if (best >= 0 && best !== _flyPtIdx) { _flyPtIdx = best; _flySpot((act.names && act.names[best]) || '', act.points[best]); }
    } else { _flyPtIdx = -1; }
    _rayBlast(A);   // §SFX-RAYBLAST: geometry-anticipating cues between the sparse named waypoints
    _flyRaf = requestAnimationFrame(_flyTick);
  }

  // ── FLY RAY-BLAST (§SFX-RAYBLAST) ─────────────────────────────────────────────────
  // Sparse named waypoints leave most of a fly silent (room centres match no cue). Instead,
  // cast a forward BVH ray from the flying camera to ANTICIPATE the nearest surface ahead, and
  // sound it the moment we're about to pass. The hit NORMAL classifies the voice with NO DB /
  // no IFC lookup: horizontal (|n.y|→1) = slab/stair underfoot → thud (impact/boom); vertical
  // (|n.y|→0) = wall/glass ahead → clank or whoosh. Distance→level, screen-side→pan. Dedup by
  // hit object id (one sound per surface) + the rAF gate keeps it pulsing, not machine-gunning.
  // "Repeat reverb clips" = each cue retriggers 2–3× through the shared reverb hall.
  var _rayRC = null, _rayDir = null, _rayRight = null, _rayRel = null, _rayN = null;
  var _rayLastT = 0, _rayLastObj = -1, _rayAlt = 0, _rayMeshes = null, _rayMeshT = 0;
  function _rayBlast(A) {
    if (!_on || !(_cfg && _cfg.master && _cfg.master.fly_rayblast !== false)) return;
    var THREE = window.THREE;
    if (!THREE || !A.camera || typeof A.collectMeshes !== 'function') return;
    var now = Date.now();
    if (now - _rayLastT < 90) return;                 // ~11Hz — BVH-cheap, well under audio budget
    _rayLastT = now;
    if (!_rayRC) { _rayRC = new THREE.Raycaster(); _rayRC.firstHitOnly = true; _rayDir = new THREE.Vector3(); _rayRight = new THREE.Vector3(); _rayRel = new THREE.Vector3(); _rayN = new THREE.Vector3(); }
    // Mesh list is static during a fly — cache it, refresh ~1s in case streaming added geometry.
    if (!_rayMeshes || now - _rayMeshT > 1000) {
      _rayMeshes = A.collectMeshes(function (o) { return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible; });
      _rayMeshT = now;
    }
    if (!_rayMeshes.length) return;
    var LOOKAHEAD = 8, TRIGGER = 6;
    A.camera.getWorldDirection(_rayDir);
    _rayRC.set(A.camera.position, _rayDir);
    _rayRC.far = LOOKAHEAD;
    var hits = _rayRC.intersectObjects(_rayMeshes, false);
    if (!hits.length) { _rayLastObj = -1; return; }
    var h = hits[0], d = h.distance;
    if (d > TRIGGER) return;                           // only when we're about to pass it
    var oid = (h.object && h.object.id) || -1;
    if (oid === _rayLastObj) return;                  // already sounded this surface
    _rayLastObj = oid;
    var ny = 1;
    if (h.face && h.face.normal && h.object) { _rayN.copy(h.face.normal).transformDirection(h.object.matrixWorld); ny = Math.abs(_rayN.y); }
    var pan = 0;
    if (h.point) { _rayRight.copy(_rayDir).cross(A.camera.up); if (_rayRight.lengthSq() > 1e-6) { _rayRight.normalize(); _rayRel.copy(h.point).sub(A.camera.position); var rl = _rayRel.length() || 1; pan = Math.max(-1, Math.min(1, _rayRel.dot(_rayRight) / rl)); } }
    var lvl = Math.max(0.25, 1 - d / LOOKAHEAD);      // closer = stronger
    var voice, freq, ms, rep;
    if (ny > 0.7) { voice = 'impact'; freq = 70 + 50 * lvl; ms = 600; rep = 2; }              // slab/stair → thud/bang
    else if (ny < 0.4) { _rayAlt ^= 1; if (_rayAlt) { voice = 'clank'; freq = 220 + 80 * lvl; ms = 200; } else { voice = 'whoosh'; freq = 720; ms = 420; } rep = 3; } // wall/glass → clank/whoosh
    else { voice = 'clank'; freq = 300; ms = 180; rep = 3; }                                  // angled surface
    _playRow({ voice: voice, freq: freq, ms: ms, repeat: rep, gap_ms: 120 }, pan);
    console.log('§SFX_RAYBLAST voice=' + voice + ' d=' + d.toFixed(1) + ' ny=' + ny.toFixed(2) + ' pan=' + pan.toFixed(2) + ' lvl=' + lvl.toFixed(2));
  }
  function _watchFly() {
    setInterval(function () {
      // The cinematic tour sets BOTH flyActive and walkMode — watch both so the orchestra
      // triggers reliably (flyActive alone flickers during the tour's pauses/look-around).
      var A = (window.APP || window.A); var flying = !!(A && (A.flyActive || A.walkMode)); var now = Date.now();
      _wireControls();
      if (_on && flying && !_flyRaf) { _flyIdx = A.walkActionIdx | 0; _flyRaf = requestAnimationFrame(_flyTick); }
      // EXPLORE FLY → orchestra background (the cinematic bed). _bedLastTick keeps it alive and
      // also suppresses the per-action nav cues while it plays.
      if (_on && flying) {
        _bedLastTick = now;
        if (!_cine) _startCine();
        if (_cine) { var fp = (A.walkActions && A.walkActions.length) ? (A.walkActionIdx / A.walkActions.length) : 0; _cine.setProgress(fp); _cine.setIntensity(0.72); }
      }
      // Helicopter fly-pass — orbits in stereo over the orchestra; on fly-end it fades off
      // (loud→quiet) carried by the long reverb tail. Config-gated by master.fly_heli.
      var heliOn = _cfg && _cfg.master && _cfg.master.fly_heli;
      if (_on && flying && heliOn && !_heli) _startHeli();
      if ((!_on || !flying) && _heli) _heli.stop();
      // Bed lifecycle: stop when audio off OR nothing has driven it for 1.5s (TM ended AND not
      // flying) → the orchestra fades out when the fly ends and you go still.
      if (_cine && (!_on || (now - _bedLastTick > 1500))) _cine.stop();
      if (_violin && (!_on || (now - _bedLastTick > 1500))) _violin.stop();
      // Movement voice decays to silence when the camera stops → no sound when not moving.
      if (_moveVoice && _ctx && (now - _lastMoveT > 120)) _moveVoice.g.gain.setTargetAtTime(0.0001, _ctx.currentTime, 0.15);
      // Idle CPU saver: when nothing is playing (no bed/groove/heli, no hit or move for 2.5s),
      // SUSPEND the audio thread → convolver/graph stop, ~0 CPU. audio() auto-resumes on the next
      // sound. Also free the lingering movement oscillator.
      if (_on && _ctx && _ctx.state === 'running' && !_cine && !_groove && !_heli && (now - _lastSoundT > 2500) && (now - _lastMoveT > 2500)) {
        if (_moveVoice) { try { _moveVoice.o.stop(); } catch (e) {} _moveVoice = null; }
        _ctx.suspend(); console.log('§SFX_SUSPEND idle');
      }
    }, 250);
  }

  // ── Pill tap tick ────────────────────────────────────────────────────────────────
  function _wirePillTap() {
    var pill = document.getElementById('mobile-pill'); if (!pill) return false;
    pill.addEventListener('pointerup', function (e) {
      if (!_on || !(_cfg && _cfg.master && _cfg.master.ui_clicks)) return;
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (btn && /sound|audio/i.test(btn.title || '')) return;
      _playRow(_ui.tap, 0); console.log('§SFX_PLAY src=ui id=tap');
    }, true);
    return true;
  }

  // ── Public API + boot ──────────────────────────────────────────────────────────
  window.toggleSfx = toggle;
  window.__sfx = {
    toggle: toggle, setOn: setOn, isOn: isOn, reload: _loadConfig,
    play: function (id, pan) { _playRow(_ui[id] || _phaseMap[id], pan || 0); },
    voice: function (name, f, s, pan) { (VOICES[name] || VOICES.tone)(f || 330, (s || 160) / 1000, pan || 0); },
    violin: { start: _startViolin, get: function () { return _violin; }, stop: function () { if (_violin) _violin.stop(); } },
    cine: { start: _startCine, get: function () { return _cine; }, stop: function () { if (_cine) _cine.stop(); } },
    heli: { start: _startHeli, stop: function () { if (_heli) _heli.stop(); } },
    stopBed: _stopBed,
    _probe: function () { return { ctx: _ctx, master: _master }; }   // for headless level/spectrum tests
  };
  function _boot() {
    _loadConfig();
    if (!_wirePillTap()) { var tries = 0, iv = setInterval(function () { if (_wirePillTap() || ++tries > 20) clearInterval(iv); }, 200); }
    _watchFly();
    // WebAudio unlock: browsers create the context suspended until a user gesture. When audio is
    // persisted ON (Explore mode, no toggle), resume it on the first interaction so it's audible.
    var _unlock = function () { _gestured = true; if (_on && _ctx && _ctx.state === 'suspended') _ctx.resume().then(function () { console.log('§SFX_RESUME ' + _ctx.state); }); };
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { window.addEventListener(ev, _unlock, { passive: true }); });
    // Short UI ticks (optional fun) — touch, button/icon, select, shortcut key. All fall back to
    // 'tap' if their row isn't in sfx.json. Pill has its own tap (skipped here to avoid doubling).
    var _dx = 0, _dy = 0, _dt0 = 0, _ok = function () { return _on && _cfg && _cfg.master && _cfg.master.ui_clicks; };
    function _onUi(el) { return el && el.closest && el.closest('button, a, input, select, textarea, .bim-panel, #mobile-pill'); }
    window.addEventListener('pointerdown', function (e) {
      _dx = e.clientX; _dy = e.clientY; _dt0 = Date.now();
      if (_ok() && !_onUi(e.target)) _playRow(_ui.touch || _ui.tap, 0);     // touch the scene
    }, { passive: true });
    window.addEventListener('pointerup', function (e) {
      if (!_ok()) return;
      var btn = e.target && e.target.closest && e.target.closest('button, a');
      if (btn) { if (!(e.target.closest && e.target.closest('#mobile-pill'))) _playRow(_ui.tap, 0); return; }  // icon/button (pill self-handles)
      if (_onUi(e.target)) return;                                          // other UI chrome (inputs/panels)
      if (Math.hypot(e.clientX - _dx, e.clientY - _dy) > 6 || (Date.now() - _dt0) > 400) return;  // a drag, not a click
      _playRow(_ui.select || _ui.tap, 0); console.log('§SFX_NAV select');   // select element
    }, { passive: true });
    var _lastKeyT = 0;
    window.addEventListener('keydown', function (e) {   // shortcut-key tick (not while typing)
      if (!_ok() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (Date.now() - _lastKeyT < 110) return;   // throttle so rapid key/arrow repeats don't machine-gun
      _lastKeyT = Date.now();
      if (/^Arrow/.test(e.key)) {   // arrow keys → cymbal / bell
        if (e.key === 'ArrowUp') _playRow(_ui.arrow_up || { voice: 'bell', freq: 880, ms: 320 }, 0.4);
        else if (e.key === 'ArrowDown') _playRow(_ui.arrow_down || { voice: 'bell', freq: 587, ms: 320 }, -0.4);
        else _playRow(_ui.arrow_side || { voice: 'cymbal', freq: 6000, ms: 380 }, e.key === 'ArrowRight' ? 0.6 : -0.6);
        return;
      }
      if (e.key === 'v' || e.key.length !== 1) return;   // skip the audio toggle (plays its own confirm)
      _playRow(_ui.key || _ui.tap, 0);
    }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot); else _boot();
})();
