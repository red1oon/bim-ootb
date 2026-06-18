// connect_scene.js — the CONNECT SCENE broker (prompts/CONNECT_SCENE_SPEC.md P0, W-CONNECT-BUS).
//
// A "Connect Scene" is NOT a merge of the three surfaces (Bonsai Modeller, BIM Viewer, iDempiere ERP).
// It is a SHARED CONTEXT that makes them TALK while staying permanently separate (modeller↔viewer decree):
// they keep their own chrome/DOM; they share SELECTION / TIMELINE / IDENTITY over the ONE signed op-log.
//
// This file is the BROKER only — `window.Connect`. No surface owns it. A surface `register()`s, then
// `publish(channel,payload)` / `subscribe(channel,fn)` over it. Transport is auto-detected:
//   - cross-document (iframe / host window)  → postMessage  (generalises the shipped bim:* bus, PR #369)
//   - same-document (two modules, one page)  → in-process delivery
// The broker is OPT-IN: `enable()`/`disable()`/`toggle()` gate ALL cross-surface traffic. Off = surfaces
// independent (the decree's default). On = a small "connected surfaces" mode + live sync.
//
// P0 ships the bus + the toggle + a `ping()` round-trip+ACK primitive (the W-CONNECT-BUS witness).
// Channels selection/timeline/identity are reserved here; they are WIRED in P1/P2/P3.
(function () {
  'use strict';
  const TAG = '§CONNECT';
  const ENVELOPE = 'connect:v1';                 // every broker message carries __connect === ENVELOPE
  const CHANNELS = ['selection', 'timeline', 'identity'];   // the three real channels (reserved for P1–P3)

  function _uid(p) {
    // correlation id only — NOT part of the signed chain, so ad-hoc randomness is fine here.
    try { return p + '-' + Math.random().toString(36).slice(2, 9); }
    catch (e) { return p + '-' + (Connect._seq = (Connect._seq || 0) + 1); }
  }

  const Connect = {
    CHANNELS,
    _on: false,                                  // toggle gate — off ⇒ no cross-surface traffic
    _surface: null,                              // this surface's id (e.g. 'modeller' | 'viewer' | 'erp')
    _subs: Object.create(null),                  // channel -> Set(fn)
    _acks: Object.create(null),                  // ping mid -> collector(from)
    _wired: false,
    _onState: null,                              // optional indicator hook: fn(true|false)
    _bc: null,                                   // BroadcastChannel — same-origin N-surface fan-out
    _seen: [],                                   // recent envelope keys (dedup across dual transports)

    // Register this surface and wire the inbound listener. Idempotent.
    register(surface) {
      this._surface = surface || _uid('surface');
      this._wire();
      console.log(TAG + ' register surface=' + this._surface);
      return this;
    },

    // ---- toggle (the opt-in gate) ----
    enable()  { this._on = true;  this._wire(); this._indicate(true);  console.log(TAG + ' enabled surface=' + this._surface);  return true; },
    disable() { this._on = false;             this._indicate(false); console.log(TAG + ' disabled surface=' + this._surface); return false; },
    toggle()  { return this._on ? this.disable() : this.enable(); },
    get on()  { return this._on; },
    onState(fn) { this._onState = fn; },        // surface registers an indicator callback (button styling etc.)
    _indicate(v) { if (typeof this._onState === 'function') { try { this._onState(v); } catch (e) {} } },

    // ---- pub/sub ----
    subscribe(channel, fn) {
      const set = this._subs[channel] || (this._subs[channel] = new Set());
      set.add(fn);
      return () => set.delete(fn);              // unsubscribe handle
    },

    // Publish to all OTHER surfaces over `channel`. No-op (logged) when the broker is off.
    publish(channel, payload) {
      if (!this._on) { console.log(TAG + ' publish DROP (off) ch=' + channel); return false; }
      const env = { __connect: ENVELOPE, channel: channel, payload: payload, from: this._surface, mid: _uid('m') };
      this._fanout(env);
      console.log(TAG + ' publish ch=' + channel + ' from=' + this._surface + ' mid=' + env.mid);
      return true;
    },

    // Witness/health primitive: ping peers, resolve with the list of surfaces that ACK within `timeoutMs`.
    ping(timeoutMs) {
      return new Promise((resolve) => {
        if (!this._on) { console.log(TAG + ' ping DROP (off)'); resolve([]); return; }
        const mid = _uid('p'); const acks = [];
        this._acks[mid] = (from) => { acks.push(from); };
        this._fanout({ __connect: ENVELOPE, channel: '__ping', payload: null, from: this._surface, mid: mid });
        console.log(TAG + ' ping mid=' + mid + ' from=' + this._surface);
        setTimeout(() => {
          delete this._acks[mid];
          console.log(TAG + ' ping done mid=' + mid + ' acks=' + acks.length + ' [' + acks.join(',') + ']');
          resolve(acks);
        }, timeoutMs || 300);
      });
    },

    // ---- transport (auto-detected) ----
    // Peer windows = the host (parent) + any embedded child frames. A surface that is same-doc has no
    // peer windows and delivers purely in-process (see _deliverLocal).
    _peerWindows() {
      const ws = [];
      try { if (window.parent && window.parent !== window) ws.push(window.parent); } catch (e) {}
      try { for (let i = 0; i < window.frames.length; i++) { if (window.frames[i] !== window) ws.push(window.frames[i]); } } catch (e) {}
      return ws;
    },
    _fanout(env) {
      // (a) same-origin N-surface fan-out (independent tabs/iframes) — the primary cross-surface transport.
      if (this._bc) { try { this._bc.postMessage(env); } catch (e) {} }
      // (b) window-tree peers (host parent + embedded child frames) — covers the ERP↔embedded-viewer case
      //     and any cross-origin embed BroadcastChannel can't reach. Dedup by mid stops double-delivery.
      this._peerWindows().forEach((w) => { try { w.postMessage(env, '*'); } catch (e) {} });
      // (c) same-document peers (other modules sharing this window) hear it via a local event too.
      try { window.dispatchEvent(new CustomEvent('connect:local', { detail: env })); } catch (e) {}
    },

    // True the FIRST time an envelope is seen (per transport-independent key) — drops dual-transport echoes.
    _dupe(env) {
      const k = env.from + '|' + env.channel + '|' + env.mid;
      if (this._seen.indexOf(k) !== -1) return true;
      this._seen.push(k); if (this._seen.length > 256) this._seen.shift();
      return false;
    },

    _deliver(env) {
      if (env.from === this._surface) return;    // never deliver our own message back to ourselves
      if (this._dupe(env)) return;               // already handled via the other transport
      if (env.channel === '__ping') {            // auto-ACK a ping back to the sender
        const ack = { __connect: ENVELOPE, channel: '__ack', payload: null, from: this._surface, mid: env.mid };
        this._peerWindows().forEach((w) => { try { w.postMessage(ack, '*'); } catch (e) {} });
        try { window.dispatchEvent(new CustomEvent('connect:local', { detail: ack })); } catch (e) {}
        console.log(TAG + ' ping<- from=' + env.from + ' ACK mid=' + env.mid);
        return;
      }
      if (env.channel === '__ack') {
        const cb = this._acks[env.mid]; if (cb) cb(env.from);
        return;
      }
      const subs = this._subs[env.channel]; if (!subs) return;
      subs.forEach((fn) => { try { fn(env.payload, env); } catch (e) { console.warn(TAG + ' sub err ' + e); } });
    },

    _wire() {
      if (this._wired) return; this._wired = true;
      const inbound = (env) => {
        if (!env || env.__connect !== ENVELOPE) return;
        // Off ⇒ surfaces independent. Still drain pending ACKs so a ping issued just before disable resolves.
        if (!this._on && env.channel !== '__ack') { console.log(TAG + ' inbound DROP (off) ch=' + env.channel); return; }
        this._deliver(env);
      };
      window.addEventListener('message', (e) => inbound(e.data));
      window.addEventListener('connect:local', (e) => inbound(e.detail));
      try { if (typeof BroadcastChannel !== 'undefined') { this._bc = new BroadcastChannel('connect:v1'); this._bc.onmessage = (e) => inbound(e.data); } } catch (e) {}
    }
  };

  window.Connect = Connect;
  console.log(TAG + ' broker loaded v1 (channels: ' + CHANNELS.join('/') + ' + toggle)');
})();
