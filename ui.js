/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  ui.js  (AAA Edition)
   All UI updates, screen routing, transitions,
   Tekken-style banners, smooth HP bars
   ══════════════════════════════════════════════ */

'use strict';

const UI = (() => {

  // ─── SMOOTH HP STATE ────────────────────────────────────
  let _dispP1Hp = 100;
  let _dispAiHp = 100;
  let _ghostP1  = 100;   // delayed ghost bar behind main bar
  let _ghostAi  = 100;
  let _ghostFadeTimer = { p1: 0, ai: 0 };

  // ─── SCREEN MANAGEMENT ──────────────────────────────────
  function showScreen(id, cb) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.opacity = '';
      s.style.transform = '';
    });
    const next = document.getElementById('screen-' + id);
    if (!next) return;

    if (window.gsap) {
      gsap.fromTo(next,
        { opacity: 0, scale: id === 'game' ? 1 : 0.97 },
        { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out',
          onStart: () => next.classList.add('active'),
          onComplete: () => { if (cb) cb(); }
        }
      );
    } else {
      next.classList.add('active');
      if (cb) cb();
    }
  }

  // ─── LEVEL INTRO ─────────────────────────────────────────
  function showLevelIntro(levelDef, lvlIdx, roundWins, cb) {
    document.getElementById('lvlBigNum').textContent  = lvlIdx + 1;
    document.getElementById('lvlName').textContent    = levelDef.name;
    document.getElementById('lvlFlavor').textContent  = levelDef.flavor;
    document.getElementById('statAgg').textContent    = Math.round(levelDef.agg * 100) + '%';
    document.getElementById('statBlock').textContent  = Math.round(levelDef.blk * 100) + '%';
    document.getElementById('statSpeed').textContent  = levelDef.spd.toFixed(1) + '×';
    document.getElementById('statCombo').textContent  = Math.round(levelDef.combo * 100) + '%';

    [0, 1, 2].forEach(i => {
      const el = document.getElementById('rb' + i);
      if (!el) return;
      el.className = 'round-badge';
      if (roundWins && roundWins[i] === 'won')  el.classList.add('won');
      if (roundWins && roundWins[i] === 'lost') el.classList.add('lost');
    });

    showScreen('level');

    const el = document.getElementById('countdown');
    const steps = ['READY', '3', '2', '1', 'FIGHT!'];
    let i = 0;

    const tick = () => {
      el.textContent      = steps[i];
      el.style.animation  = 'none';
      void el.offsetWidth;
      el.style.animation  = '';

      if (steps[i] !== 'READY' && steps[i] !== 'FIGHT!') {
        if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.countdown();
      } else if (steps[i] === 'FIGHT!') {
        if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.fight();
      }

      i++;
      if (i < steps.length) {
        setTimeout(tick, i === 1 ? 700 : 650);
      } else {
        setTimeout(() => {
          showScreen('game');
          if (cb) cb();
        }, 400);
      }
    };
    setTimeout(tick, 300);
  }

  // ─── HUD UPDATE ──────────────────────────────────────────
  function updateHUD(p1Hp, aiHp, score, lvlIdx, timer, roundPips) {
    const clampedP1 = Math.max(0, p1Hp);
    const clampedAi = Math.max(0, aiHp);

    // Detect sudden HP drop → trigger ghost bar
    if (clampedP1 < _dispP1Hp - 10) {
      _ghostP1 = _dispP1Hp;
      _ghostFadeTimer.p1 = 45;
    }
    if (clampedAi < _dispAiHp - 10) {
      _ghostAi = _dispAiHp;
      _ghostFadeTimer.ai = 45;
    }

    // Smooth lerp toward target
    _dispP1Hp += (clampedP1 - _dispP1Hp) * 0.10;
    _dispAiHp += (clampedAi - _dispAiHp) * 0.10;

    // Ghost bar fade
    if (_ghostFadeTimer.p1 > 0) _ghostFadeTimer.p1--;
    if (_ghostFadeTimer.ai > 0) _ghostFadeTimer.ai--;
    if (_ghostFadeTimer.p1 === 0) _ghostP1 += (_dispP1Hp - _ghostP1) * 0.06;
    if (_ghostFadeTimer.ai === 0) _ghostAi += (_dispAiHp - _ghostAi) * 0.06;

    // Apply to DOM
    const p1Fill   = document.getElementById('p1HpFill');
    const aiHpFill = document.getElementById('aiHpFill');
    const p1Ghost  = document.getElementById('p1HpGhost');
    const aiGhost  = document.getElementById('aiHpGhost');

    if (p1Fill)   p1Fill.style.width   = _dispP1Hp + '%';
    if (aiHpFill) aiHpFill.style.width = _dispAiHp + '%';
    if (p1Ghost)  p1Ghost.style.width  = Math.max(_dispP1Hp, _ghostP1) + '%';
    if (aiGhost)  aiGhost.style.width  = Math.max(_dispAiHp, _ghostAi) + '%';

    document.getElementById('p1HpNum').textContent  = Math.ceil(Math.max(0, clampedP1));
    document.getElementById('aiHpNum').textContent  = Math.ceil(Math.max(0, clampedAi));

    // Low HP warning
    if (p1Fill) p1Fill.classList.toggle('hp-low', clampedP1 < 25);
    if (aiHpFill) aiHpFill.classList.toggle('hp-low', clampedAi < 25);

    // Score & level
    document.getElementById('scoreDisplay').textContent = score.toLocaleString() + ' PTS';
    document.getElementById('levelBadge').textContent   = 'LV ' + (lvlIdx + 1);

    // Timer
    const timerEl = document.getElementById('roundTimer');
    timerEl.textContent = timer;
    timerEl.className   = 'timer' + (timer <= 10 ? ' crit' : timer <= 20 ? ' warn' : '');

    // Sync bar
    const ratio = clampedP1 / Math.max(1, clampedP1 + clampedAi);
    document.getElementById('syncFill').style.width = (ratio * 100) + '%';
    const ss = document.getElementById('syncStatus');
    if      (ratio > 0.65) { ss.textContent = 'DOMINANT'; ss.style.color = '#4ade80'; }
    else if (ratio > 0.50) { ss.textContent = 'WINNING';  ss.style.color = '#a3e635'; }
    else if (ratio > 0.35) { ss.textContent = 'LOSING';   ss.style.color = '#fb923c'; }
    else                   { ss.textContent = 'CRITICAL'; ss.style.color = '#f43f5e'; }

    // Round pips
    if (roundPips) {
      ['p1', 'ai'].forEach(side => {
        [0, 1].forEach(i => {
          const pip = document.getElementById(`pip-${side}-${i}`);
          if (!pip) return;
          pip.className = 'pip';
          if (roundPips[side][i] === 'won')  pip.classList.add('won');
          if (roundPips[side][i] === 'lost') pip.classList.add('lost');
        });
      });
    }
  }

  function setPlayerNames(p1Name, aiName) {
    document.getElementById('p1Name').textContent = p1Name;
    document.getElementById('aiName').textContent = aiName;
  }

  // ─── COMBO DISPLAY ───────────────────────────────────────
  let comboTimeout = null;
  function showCombo(hits) {
    const el    = document.getElementById('comboDisplay');
    const numEl = document.getElementById('comboHits');
    const lblEl = document.getElementById('comboLabel');

    numEl.textContent = hits;

    // Dynamic label based on hit depth
    let label = 'COMBO!';
    let color = '#38bdf8';
    if (hits >= 8)       { label = 'LEGENDARY!'; color = '#ff00aa'; }
    else if (hits >= 6)  { label = 'AMAZING!';   color = '#ef4444'; }
    else if (hits >= 4)  { label = 'GREAT!';     color = '#f97316'; }
    else if (hits >= 2)  { label = 'COMBO!';     color = '#38bdf8'; }

    if (lblEl) lblEl.textContent = label;
    numEl.style.color  = color;
    numEl.style.textShadow = `0 0 18px ${color}, 0 0 36px ${color}`;

    el.classList.remove('hidden');
    el.classList.remove('combo-pop');
    void el.offsetWidth;
    el.classList.add('combo-pop');

    if (comboTimeout) clearTimeout(comboTimeout);
    comboTimeout = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  // ─── HIT FLASH (DOM overlay — kept for HP bar flash) ─────
  let flashTimeout = null;
  function triggerHitFlash(type = 'white') {
    const el = document.getElementById('hitFlash');
    if (!el) return;
    el.className = type === 'red' ? 'flash-red' : type === 'gold' ? 'flash-gold' : 'flash-white';
    if (flashTimeout) clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => { el.className = ''; }, 90);
  }

  // ─── HP BAR DAMAGE FLASH ─────────────────────────────────
  function triggerHpFlash(side = 'p1') {
    const el = document.getElementById(side === 'p1' ? 'p1HpFill' : 'aiHpFill');
    if (!el) return;
    el.classList.remove('hp-damage-flash');
    void el.offsetWidth;
    el.classList.add('hp-damage-flash');
    setTimeout(() => el.classList.remove('hp-damage-flash'), 400);
  }

  // ─── FIGHT! BANNER ───────────────────────────────────────
  function showFightBanner() {
    const el = document.getElementById('fightBanner');
    if (!el) return;
    el.classList.remove('hidden', 'banner-out');
    el.classList.add('banner-in');
    setTimeout(() => {
      el.classList.remove('banner-in');
      el.classList.add('banner-out');
      setTimeout(() => el.classList.add('hidden'), 500);
    }, 1000);
  }

  // ─── K.O. BANNER ─────────────────────────────────────────
  function showKOBanner(playerWon) {
    // Removed
  }

  // ─── ROUND WIN BANNER ────────────────────────────────────
  function showRoundWinBanner(playerWon) {
    const el = document.getElementById('roundWinBanner');
    if (!el) return;
    el.textContent  = playerWon ? '🏆 ROUND WIN' : '⚡ ROUND LOST';
    el.style.color  = playerWon ? '#facc15' : '#f87171';
    el.classList.remove('hidden', 'rw-out');
    el.classList.add('rw-in');
    setTimeout(() => {
      el.classList.remove('rw-in');
      el.classList.add('rw-out');
      setTimeout(() => el.classList.add('hidden'), 600);
    }, 1800);
  }

  // ─── ROUND END ───────────────────────────────────────────
  function showRoundEnd(playerWon, msg, score, showNext, showRestart) {
    const el  = document.getElementById('roundEnd');
    const txt = document.getElementById('roundEndText');
    const sc  = document.getElementById('roundEndScore');

    txt.textContent = msg;
    txt.style.color = playerWon ? '#4ade80' : '#f87171';
    sc.textContent  = 'SCORE: ' + score.toLocaleString();

    document.getElementById('nextLvlBtn').style.display = showNext    ? '' : 'none';
    document.getElementById('viewResBtn').style.display = showRestart ? '' : 'none';

    el.classList.remove('hidden');

    if (window.gsap) {
      gsap.fromTo('.round-end-inner',
        { scale: 0.65, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.0)' }
      );
    }
  }

  function hideRoundEnd() {
    document.getElementById('roundEnd').classList.add('hidden');
    // Also hide K.O. banner
    const ko = document.getElementById('koBanner');
    if (ko) { ko.classList.add('hidden'); ko.classList.remove('ko-in', 'ko-out'); }
  }

  // ─── RESULT SCREEN ───────────────────────────────────────
  function showResult(data) {
    const hl = document.getElementById('resultHeadline');
    const sb = document.getElementById('resultSub');

    if (data.won && data.isFinalLevel) {
      hl.textContent = '⚔ ALL CLEAR!'; hl.style.color = '#facc15';
      sb.textContent = 'ALL LEVELS CONQUERED';
    } else if (data.won) {
      hl.textContent = '🏆 VICTORY';  hl.style.color = '#4ade80';
      sb.textContent = 'ROUND COMPLETE';
    } else {
      hl.textContent = 'DEFEATED';   hl.style.color = '#f87171';
      sb.textContent = 'THE AI WAS TOO STRONG';
    }

    document.getElementById('rs-dmg').textContent   = data.dmg;
    document.getElementById('rs-score').textContent = data.score.toLocaleString();
    document.getElementById('rs-lvl').textContent   = data.lvl;
    document.getElementById('rs-combo').textContent = data.maxCombo;

    document.getElementById('newScoreBadge').classList.toggle('hidden', !data.isNewHigh);
    document.getElementById('resNextBtn').style.display =
      data.won && !data.isFinalLevel ? '' : 'none';

    showScreen('result');
  }

  // ─── LEADERBOARD ─────────────────────────────────────────
  function getLB() {
    try { return JSON.parse(localStorage.getItem('fs3d_lb') || '[]'); } catch { return []; }
  }

  function saveScore(name, score, lvl) {
    const lb = getLB();
    lb.push({ name, score, level: lvl });
    lb.sort((a, b) => b.score - a.score);
    lb.splice(10);
    localStorage.setItem('fs3d_lb', JSON.stringify(lb));
    return lb.findIndex(e => e.name === name && e.score === score && e.level === lvl);
  }

  function populateLB() {
    const lb = getLB();
    const el = document.getElementById('lbTable');
    if (!lb.length) {
      el.innerHTML = '<div class="lb-empty">NO SCORES YET — BE THE FIRST!</div>';
      return;
    }
    const rankCls  = i => ['r1', 'r2', 'r3'][i] || 'rn';
    const rankIcon = i => ['🥇', '🥈', '🥉'][i] || ('#' + (i + 1));
    el.innerHTML = lb.map((e, i) => `
      <div class="lb-row ${i < 3 ? 'gold-row' : ''}">
        <div class="lb-rank ${rankCls(i)}">${rankIcon(i)}</div>
        <div class="lb-name">${e.name}</div>
        <div class="lb-score">${e.score.toLocaleString()}</div>
        <div class="lb-lvl">LV${e.level}</div>
      </div>`
    ).join('');
  }

  // ─── CHARACTER SELECT ────────────────────────────────────
  function buildCharSelect(onSelect) {
    const grid = document.getElementById('charGrid');
    grid.innerHTML = '';

    CHAR_DEFS.forEach((c, i) => {
      const card = document.createElement('div');
      card.className  = 'char-card';
      card.dataset.idx = i;

      const hex = '#' + c.color.toString(16).padStart(6, '0');
      const acc = '#' + c.accentColor.toString(16).padStart(6, '0');

      const mkDots = (count, max = 5) =>
        Array.from({ length: max }, (_, di) =>
          `<div class="char-stat-dot${di < count ? ' filled' : ''}"></div>`
        ).join('');

      card.innerHTML = `
        <div class="char-icon">
          <svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
            <rect x="21" y="4" width="18" height="16" rx="2" fill="${hex}" opacity="0.9"/>
            <rect x="24" y="10" width="12" height="4" rx="1" fill="${acc}"/>
            <rect x="16" y="22" width="28" height="22" rx="2" fill="${hex}" opacity="0.85"/>
            <rect x="22" y="24" width="16" height="18" rx="1" fill="${acc}" opacity="0.5"/>
            <rect x="6"  y="23" width="9"  height="18" rx="2" fill="${hex}" opacity="0.75"/>
            <rect x="45" y="23" width="9"  height="18" rx="2" fill="${hex}" opacity="0.75"/>
            <rect x="17" y="45" width="26" height="8"  rx="2" fill="${hex}" opacity="0.7"/>
            <rect x="17" y="54" width="11" height="14" rx="2" fill="${hex}" opacity="0.7"/>
            <rect x="32" y="54" width="11" height="14" rx="2" fill="${hex}" opacity="0.7"/>
            <circle cx="30" cy="33" r="8" fill="${hex}" opacity="0.08"/>
          </svg>
        </div>
        <div class="char-name">${c.name}</div>
        <div class="char-type">${c.type}</div>
        <div class="char-stats">${mkDots(c.stats.str)}・${mkDots(c.stats.spd)}・${mkDots(c.stats.def)}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.char-card').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('startBtn').disabled = false;
        if (onSelect) onSelect(i);
      });

      grid.appendChild(card);
    });
  }

  // ─── PUBLIC ──────────────────────────────────────────────
  return {
    showScreen,
    showLevelIntro,
    updateHUD,
    setPlayerNames,
    showCombo,
    triggerHitFlash,
    triggerHpFlash,
    showFightBanner,
    showKOBanner,
    showRoundWinBanner,
    showRoundEnd,
    hideRoundEnd,
    showResult,
    saveScore,
    populateLB,
    buildCharSelect,
  };

})();
