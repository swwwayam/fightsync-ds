/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  ai.js
   Now delegates to DSEngine (Q-Learning + Markov)
   ══════════════════════════════════════════════ */
'use strict';

const AIBrain = (() => {

  function reset()     { DSEngine.reset(); }
  function setLevel(c) { DSEngine.setLevel(c); }
  function observe()   { /* handled by DSEngine.onPlayerAction in main.js */ }

  // think() just proxies to DSEngine's Q-Learning agent
  function think(ai, player, frame) {
    DSEngine.think(ai, player, frame);
  }

  return { reset, setLevel, observe, think };

})();
