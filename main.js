/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  main.js  (AAA Edition)
   Game Engine: orchestrates all modules
   ══════════════════════════════════════════════ */

'use strict';

const Game = (() => {

  // ─── STATE ──────────────────────────────────────────────
  let playerName    = 'FIGHTER';
  let playerCharIdx = 0;
  let lvlIdx        = 0;
  let totalScore    = 0;
  let roundScore    = 0;
  let frame         = 0;

  let gameRunning   = false;
  let roundOver     = false;
  let paused        = false;

  let roundTimer    = 60;
  let timerTick     = 0;

  // Best-of-3 round system
  const roundWins = { p1: [null, null], ai: [null, null] };
  let   p1Rounds  = 0;
  let   aiRounds  = 0;
  let   currentRound = 0;

  // Fighters
  let p1  = null;
  let aiF = null;

  // Controls
  const keys = {};

  // Last known player action for AI learning
  let lastPlayerAction = null;

  // Hitstop global counter
  let hitstopFrames = 0;

  // Track previous HP for damage flash
  let prevP1Hp = 100;
  let prevAiHp = 100;

  // Track prev onGround for dust spawn
  let prevP1Ground = true;
  let prevAiGround = true;

  const LEVELS = Scene.getLevelDefs();

  // ─── INIT ───────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('arenaCanvas');
    Scene.init(canvas);
    _wireButtons();
    UI.buildCharSelect(idx => { playerCharIdx = idx; });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    window.addEventListener('blur', clearHeldKeys);
    window.addEventListener('resize', Scene.resize);
    
    DSEngine.init();
    DSViz.init();
    
    // Initial resize to pick up fullscreen CSS dimensions
    Scene.resize();
    
    _loop();
  }

  // ─── BUTTON WIRING ──────────────────────────────────────
  function _wireButtons() {
    document.getElementById('startBtn').addEventListener('click', onStartGame);
    document.getElementById('lbBtn').addEventListener('click', () => {
      UI.populateLB();
      document.getElementById('lbBackBtn').onclick = () => UI.showScreen('select');
      UI.showScreen('lb');
    });
    document.getElementById('nameInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') onStartGame();
    });

    document.getElementById('nextLvlBtn').addEventListener('click', doNextLevel);
    document.getElementById('viewResBtn').addEventListener('click', showResultScreen);
    document.getElementById('resNextBtn').addEventListener('click', doNextLevel);
    document.getElementById('resRestartBtn').addEventListener('click', restartGame);
    document.getElementById('resLbBtn').addEventListener('click', () => {
      UI.populateLB();
      document.getElementById('lbBackBtn').onclick = () => UI.showScreen('result');
      UI.showScreen('lb');
    });
    document.getElementById('resumeBtn').addEventListener('click', resumeGame);
    document.getElementById('pauseRestartBtn').addEventListener('click', restartGame);
    document.getElementById('pauseQuitBtn').addEventListener('click', () => {
      paused = false; gameRunning = false;
      UI.showScreen('select');
    });
  }

  // ─── INPUT ──────────────────────────────────────────────
  function onKeyDown(e) {
    const alreadyPressed = keys[e.code];
    keys[e.code] = true;

    if (gameRunning && ['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'Escape') {
      if (gameRunning && !roundOver) {
        paused ? resumeGame() : pauseGame();
        return;
      }
    }

    if (!gameRunning || roundOver || paused || !p1 || alreadyPressed) return;

    if (e.code === 'Space') {
      e.preventDefault();
      p1.jump();
      lastPlayerAction = 'jump';
      DSEngine.onPlayerAction('jump', 3);
    }
    if (e.code === 'KeyJ') {
      p1.punch();
      lastPlayerAction = 'punch';
      DSEngine.onPlayerAction('punch', 1);
    }
    if (e.code === 'KeyK') {
      p1.kick();
      lastPlayerAction = 'kick';
      DSEngine.onPlayerAction('kick', 2);
    }
    if (e.code === 'KeyL') {
      p1.startBlock();
      DSEngine.onPlayerAction('block', 4);
    }
    // Combo shortcut: J+K simultaneously
    if (e.code === 'KeyK' && keys['KeyJ']) {
      p1.kick();
      lastPlayerAction = 'kick';
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    if (e.code === 'KeyL' && p1) p1.stopBlock();
  }

  function clearHeldKeys() {
    Object.keys(keys).forEach(code => { keys[code] = false; });
    if (p1) p1.stopBlock();
  }

  // ─── START GAME ─────────────────────────────────────────
  function onStartGame() {
    const raw = document.getElementById('nameInput').value.trim().toUpperCase();
    playerName = raw || 'FIGHTER';

    lvlIdx = 0; totalScore = 0; roundScore = 0;
    p1Rounds = 0; aiRounds = 0; currentRound = 0;
    roundWins.p1 = [null, null]; roundWins.ai = [null, null];

    AIBrain.reset();
    _startLevel();
  }

  function restartGame() { onStartGame(); }

  // ─── LEVEL FLOW ─────────────────────────────────────────
  function _startLevel() {
    const lvl    = LEVELS[lvlIdx];
    const aiName = lvl.aiNames[Math.floor(Math.random() * lvl.aiNames.length)];

    AIBrain.setLevel(lvl);
    Scene.buildLevel(lvlIdx);

    const rWins = [
      roundWins.p1[0] ? 'won' : roundWins.ai[0] ? 'lost' : null,
      roundWins.p1[1] ? 'won' : roundWins.ai[1] ? 'lost' : null,
      null,
    ];

    UI.showLevelIntro(lvl, lvlIdx, rWins, () => {
      _beginRound(aiName);
      // FIGHT! banner fires right as round begins
      setTimeout(() => UI.showFightBanner(), 100);
    });
  }

  function _beginRound(aiName) {
    const threeScene = Scene.getScene();
    const charDef    = CHAR_DEFS[playerCharIdx];
    const aiCharDef  = CHAR_DEFS[Math.floor(Math.random() * CHAR_DEFS.length)];

    if (p1)  p1.dispose();
    if (aiF) aiF.dispose();

    p1  = new Fighter(threeScene, -2.5,  1, charDef,   false);
    aiF = new Fighter(threeScene,  2.5, -1, aiCharDef, true);

    UI.setPlayerNames(playerName, aiName || LEVELS[lvlIdx].aiNames[0]);

    roundTimer  = LEVELS[lvlIdx].time;
    timerTick   = 0;
    roundScore  = 0;
    roundOver   = false;
    gameRunning = true;
    frame       = 0;
    hitstopFrames = 0;
    prevP1Hp    = 100;
    prevAiHp    = 100;
    prevP1Ground = true;
    prevAiGround = true;
    DSEngine.reset();

    _updateRoundPips();
  }

  function _updateRoundPips() {
    const pips = {
      p1: [
        p1Rounds >= 1 ? 'won' : (aiRounds >= 2 ? 'lost' : null),
        p1Rounds >= 2 ? 'won' : null,
      ],
      ai: [
        aiRounds >= 1 ? 'won' : null,
        aiRounds >= 2 ? 'won' : null,
      ],
    };
    UI.updateHUD(p1?.hp ?? 100, aiF?.hp ?? 100, totalScore + roundScore, lvlIdx, roundTimer, pips);
  }

  function doNextLevel() {
    UI.hideRoundEnd();
    totalScore += roundScore;
    lvlIdx++;
    p1Rounds = 0; aiRounds = 0; currentRound = 0;
    roundWins.p1 = [null, null]; roundWins.ai = [null, null];
    _startLevel();
  }

  function showResultScreen() {
    const finalScore = totalScore + roundScore;
    const pos = UI.saveScore(playerName, finalScore, lvlIdx + 1);
    UI.showResult({
      won:          p1Rounds > aiRounds,
      isFinalLevel: lvlIdx >= LEVELS.length - 1,
      dmg:          p1?.damageDealt ?? 0,
      score:        finalScore,
      lvl:          lvlIdx + 1,
      maxCombo:     p1?.maxCombo ?? 0,
      isNewHigh:    pos === 0,
    });
  }

  // ─── PAUSE ──────────────────────────────────────────────
  function pauseGame() {
    paused = true; gameRunning = false;
    UI.showScreen('pause');
  }

  function resumeGame() {
    paused = false; gameRunning = true;
    document.getElementById('screen-pause').classList.remove('active');
  }

  // ─── END ROUND ──────────────────────────────────────────
  function endRound(playerWon, msg) {
    if (roundOver) return;
    roundOver   = true;
    gameRunning = false;
    DSEngine.endRound(playerWon);
    DSViz.update(DSEngine.getSnapshot());

    // K.O. banner removed per request

    if (playerWon) {
      roundWins.p1[currentRound] = 'won'; p1Rounds++;
      if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.roundWin();
    } else {
      roundWins.ai[currentRound] = 'won'; aiRounds++;
    }
    currentRound++;

    const timeBonus  = roundTimer * 10;
    const lvlMult    = LEVELS[lvlIdx].mult || 1;
    const hpBonus    = (p1?.hp ?? 0) * 5;
    roundScore += playerWon
      ? Math.round((1000 + timeBonus + hpBonus) * lvlMult)
      : 0;

    const finalScore   = totalScore + roundScore;
    const isMatchOver  = p1Rounds >= 2 || aiRounds >= 2;

    // Delay overlay by 1.5s to let K.O. banner breathe
    setTimeout(() => {
      if (isMatchOver) {
        if (typeof Audio !== 'undefined' && Audio.sfx) {
          if (playerWon) Audio.sfx.win(); else Audio.sfx.lose();
        }
        const canAdvance = playerWon && lvlIdx < LEVELS.length - 1;
        UI.showRoundEnd(playerWon, playerWon ? '🏆 YOU WIN!' : '⚡ AI WINS', finalScore, canAdvance, true);
      } else {
        const roundMsg = playerWon ? `ROUND ${currentRound} — YOU!` : `ROUND ${currentRound} — AI!`;
        UI.showRoundWinBanner(playerWon);
        UI.showRoundEnd(playerWon, roundMsg, finalScore, false, false);

        setTimeout(() => {
          if (!gameRunning && roundOver) {
            UI.hideRoundEnd();
            const aiName = LEVELS[lvlIdx].aiNames[Math.floor(Math.random() * LEVELS[lvlIdx].aiNames.length)];
            _beginRound(aiName);
            setTimeout(() => UI.showFightBanner(), 100);
          }
        }, 2500);
      }
    }, 1500);
  }

  // ─── SCORE UPDATE ────────────────────────────────────────
  function _addHitScore(dmg, isCombo) {
    const base = dmg * (LEVELS[lvlIdx].mult || 1);
    roundScore += isCombo ? Math.round(base * 2.5) : base;
  }

  // ─── MAIN LOOP ──────────────────────────────────────────
  function _loop() {
    requestAnimationFrame(_loop);

    const p1x = p1  ? p1.x  : 0;
    const aix = aiF ? aiF.x : 0;
    Scene.render(p1x, aix);

    if (!gameRunning || roundOver || paused) return;

    frame++;

    // ── GLOBAL HITSTOP ──────────────────────────────────
    if (hitstopFrames > 0) {
      hitstopFrames--;
      // Keep rendering but skip all game logic
      UI.updateHUD(p1.hp, aiF.hp, totalScore + roundScore, lvlIdx, roundTimer, null);
      return;
    }

    // ── PLAYER INPUT ────────────────────────────────────
    let moveDir = 0;
    if (keys['KeyA'] || keys['ArrowLeft'])  moveDir = -1;
    if (keys['KeyD'] || keys['ArrowRight']) moveDir =  1;
    p1.move(moveDir);

    // ── AI THINK ────────────────────────────────────────
    AIBrain.observe(lastPlayerAction);
    lastPlayerAction = null;
    AIBrain.think(aiF, p1, frame);

    // ── LANDING DUST ────────────────────────────────────
    const p1JustLanded  = !p1.onGround === false && prevP1Ground === false && p1.onGround;
    const aiJustLanded  = !aiF.onGround === false && prevAiGround === false && aiF.onGround;
    // Correct detection: p1 was in air last frame, now on ground
    if (!prevP1Ground && p1.onGround)  Scene.spawnDustParticles(p1.x);
    if (!prevAiGround && aiF.onGround) Scene.spawnDustParticles(aiF.x);
    prevP1Ground = p1.onGround;
    prevAiGround = aiF.onGround;

    // ── UPDATE FIGHTERS ─────────────────────────────────
    p1.update(aiF.x);
    aiF.update(p1.x);

    // ── HIT DETECTION ───────────────────────────────────
    const p1Dmg = p1.checkHit(aiF);
    if (p1Dmg > 0) {
      const isCombo = p1.comboCount >= 2;
      _addHitScore(p1Dmg, isCombo);
      DSEngine.onP1Hit(p1Dmg, p1.comboCount);

      Scene.triggerShake(isCombo ? 0.48 : 0.22);
      const sparkType = isCombo ? 'combo' : (p1Dmg >= 12 ? 'heavy' : 'normal');
      Scene.spawnHitParticles(
        (p1.x + aiF.x) * 0.5, 1.6,
        isCombo ? 0xfacc15 : 0xf97316,
        isCombo ? 32 : 18,
        sparkType
      );
      Scene.triggerFlash3D(isCombo ? 0xfacc15 : 0xffffff, isCombo ? 0.65 : 0.45, 100);
      UI.triggerHitFlash(isCombo ? 'gold' : 'white');
      UI.triggerHpFlash('ai');
      if (p1.comboCount >= 2) {
        UI.showCombo(p1.comboCount);
        if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.superCombo();
      }
      hitstopFrames = 4;
    }

    const aiDmg = aiF.checkHit(p1);
    if (aiDmg > 0) {
      DSEngine.onAiHit(aiDmg);
      Scene.triggerShake(0.25);
      const sparkType2 = aiF.comboCount >= 2 ? 'combo' : (aiDmg >= 12 ? 'heavy' : 'normal');
      Scene.spawnHitParticles(
        (p1.x + aiF.x) * 0.5, 1.6,
        0xf43f5e,
        aiF.comboCount >= 2 ? 28 : 14,
        sparkType2
      );
      Scene.triggerFlash3D(0xff2244, 0.4, 85);
      UI.triggerHitFlash('red');
      UI.triggerHpFlash('p1');

      if (aiF.comboCount >= 2) UI.showCombo(aiF.comboCount);
      hitstopFrames = 4;
    }

    // ── TIMER ───────────────────────────────────────────
    timerTick++;
    if (timerTick >= 60) {
      timerTick = 0;
      roundTimer = Math.max(0, roundTimer - 1);
    }
    if (roundTimer === 0 && !roundOver) {
      if      (p1.hp > aiF.hp)  endRound(true,  '⏱ TIME WIN');
      else if (aiF.hp > p1.hp)  endRound(false, '⏱ TIME OUT');
      else                      endRound(false, 'DRAW');
    }

    // ── KO CHECK ────────────────────────────────────────
    if (!roundOver) {
      if (p1.hp <= 0 && aiF.hp <= 0) endRound(false, 'DOUBLE KO');
      else if (p1.hp <= 0)           endRound(false, '⚡ AI WINS');
      else if (aiF.hp <= 0)          endRound(true,  '🏆 YOU WIN!');
    }

    // ── DS ENGINE tick (every 60 frames) ────────────────
    if (frame % 60 === 0) {
      DSEngine.recordHpTick(p1.hp, aiF.hp);
      DSEngine.onPlayerAction('idle', 0);  // heartbeat for Bayes idle tracking
      DSViz.update(DSEngine.getSnapshot());
    }

    // ── HUD ─────────────────────────────────────────────
    _updateRoundPips();
    UI.updateHUD(p1.hp, aiF.hp, totalScore + roundScore, lvlIdx, roundTimer, null);
  }

  return { init };

})();

// ─── BOOTSTRAP ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
