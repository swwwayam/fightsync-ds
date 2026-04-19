/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  audio.js
   Procedural audio using Web Audio API
   ══════════════════════════════════════════════ */

'use strict';

const Audio = (() => {
  let _ac = null;

  /** Lazily create AudioContext (must be after user gesture) */
  function ctx() {
    if (!_ac) {
      _ac = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _ac;
  }

  /**
   * Play a simple synth tone
   * @param {number} freq - frequency in Hz
   * @param {string} type - oscillator type
   * @param {number} dur  - duration in seconds
   * @param {number} vol  - volume 0–1
   * @param {number} [startDelay=0] - delay before start
   */
  function tone(freq, type, dur, vol = 0.2, startDelay = 0) {
    try {
      const a  = ctx();
      const g  = a.createGain();
      const o  = a.createOscillator();
      const t0 = a.currentTime + startDelay;
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch (_) { /* ignore AudioContext errors */ }
  }

  // ─── PUBLIC SOUND LIBRARY ───────────────────────────────
  const sfx = {
    punch() {
      tone(200, 'square',   0.07, 0.32);
      tone(90,  'sawtooth', 0.11, 0.26);
    },
    kick() {
      tone(130, 'sawtooth', 0.10, 0.38);
      tone(60,  'square',   0.14, 0.24);
    },
    hit() {
      tone(120, 'sawtooth', 0.14, 0.42);
      tone(60,  'sine',     0.19, 0.32);
      tone(300, 'square',   0.05, 0.15);
    },
    heavyHit() {
      tone(80,  'sawtooth', 0.20, 0.55);
      tone(40,  'sine',     0.25, 0.38);
      tone(200, 'square',   0.06, 0.20);
    },
    block() {
      tone(500, 'square', 0.05, 0.18);
      tone(250, 'square', 0.05, 0.12);
    },
    jump() {
      tone(380, 'sine', 0.10, 0.14);
      tone(520, 'sine', 0.07, 0.10);
    },
    land() {
      tone(80,  'sawtooth', 0.07, 0.20);
    },
    combo() {
      [620, 780, 960].forEach((f, i) =>
        tone(f, 'square', 0.08, 0.28, i * 0.06)
      );
    },
    superCombo() {
      [400, 600, 800, 1000, 1200].forEach((f, i) =>
        tone(f, 'square', 0.10, 0.35, i * 0.05)
      );
    },
    win() {
      [400, 520, 640, 840, 1040].forEach((f, i) =>
        setTimeout(() => tone(f, 'sine', 0.38, 0.32), i * 90)
      );
    },
    lose() {
      [380, 280, 180, 100, 60].forEach((f, i) =>
        setTimeout(() => tone(f, 'sawtooth', 0.30, 0.24), i * 110)
      );
    },
    countdown() {
      tone(880, 'sine', 0.12, 0.22);
    },
    fight() {
      [600, 900, 1200].forEach((f, i) =>
        tone(f, 'square', 0.12, 0.30, i * 0.04)
      );
    },
    roundWin() {
      [300, 400, 500, 700].forEach((f, i) =>
        setTimeout(() => tone(f, 'sine', 0.25, 0.28), i * 70)
      );
    },
  };

  return { sfx };
})();
