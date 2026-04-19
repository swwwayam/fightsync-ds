/* ══════════════════════════════════════════════════════════
   FIGHTSYNC DS ENGINE  —  ds_engine.js
   ──────────────────────────────────────────────────────────
   Data Science Concepts Implemented:
   1. Q-Learning      (Reinforcement Learning AI)
   2. Markov Chain    (Player Move Sequence Prediction)
   3. Naive Bayes     (Player Archetype Classification)
   4. Descriptive Statistics (Combat Analytics)
   ══════════════════════════════════════════════════════════ */
'use strict';

const DSEngine = (() => {

  // ╔══════════════════════════════════════════════╗
  // ║  1. Q-LEARNING  (Reinforcement Learning)    ║
  // ╚══════════════════════════════════════════════╝
  // State: dist_bucket(3) × p1_hp(3) × ai_hp(3) × p1_last_action(5) = 135 states
  // Actions: APPROACH RETREAT PUNCH KICK BLOCK JUMP IDLE = 7
  // Update:  Q[s,a] ← Q[s,a] + α(r + γ·maxQ[s']-Q[s,a])
  // Policy:  ε-greedy with exponential decay (AI gets smarter per session)

  const N_ST  = 135;
  const N_AC  = 7;
  const ALPHA = 0.12;
  const GAMMA = 0.88;
  const AC    = { APPROACH:0, RETREAT:1, PUNCH:2, KICK:3, BLOCK:4, JUMP:5, IDLE:6 };
  const AC_LABELS  = ['APPROACH','RETREAT','PUNCH','KICK','BLOCK','JUMP','IDLE'];
  const AC_COLORS  = ['#38bdf8','#64748b','#f97316','#ef4444','#22d3ee','#a855f7','#475569'];

  let Q          = null;
  let epsilon    = 0.35;
  let roundCount = 0;
  let _prevP1Hp  = 100, _prevAiHp = 100;
  let _p1LastIdx = 0;   // 0=idle 1=punch 2=kick 3=jump 4=block

  let ql = { lastState:0, lastAction:AC.IDLE, tdError:0, totalReward:0, updateCount:0, episodeReward:0 };

  function _loadQ() {
    try {
      const raw = localStorage.getItem('fs3d_qtable_v2');
      if (raw) { const a = JSON.parse(raw); if (a.length === N_ST * N_AC) { Q = a; } }
      const m = JSON.parse(localStorage.getItem('fs3d_qmeta') || '{}');
      epsilon    = Math.max(0.05, m.epsilon || 0.35);
      roundCount = m.rounds  || 0;
    } catch(e) {}
    if (!Q) Q = Array.from({ length: N_ST * N_AC }, () => (Math.random() - 0.5) * 0.05);
  }

  function _saveQ() {
    try {
      localStorage.setItem('fs3d_qtable_v2', JSON.stringify(Q.map(v => Math.round(v*1000)/1000)));
      localStorage.setItem('fs3d_qmeta', JSON.stringify({ epsilon: +epsilon.toFixed(4), rounds: roundCount }));
    } catch(e) {}
  }

  function _enc(dist, p1Hp, aiHp, lastAct) {
    return (dist > 3.5 ? 0 : dist > 1.5 ? 1 : 2) * 45 +
           (p1Hp > 66  ? 0 : p1Hp > 33  ? 1 : 2) * 15 +
           (aiHp > 66  ? 0 : aiHp > 33  ? 1 : 2) *  5 +
           Math.max(0, Math.min(4, lastAct));
  }

  function _qVals(s)    { const b = s * N_AC; return AC_LABELS.map((_,a) => Q[b+a]); }
  function _qMax(s)     { return Math.max(..._qVals(s)); }
  function _pick(s)     {
    if (Math.random() < epsilon) return Math.floor(Math.random() * N_AC);
    const v = _qVals(s); return v.indexOf(Math.max(...v));
  }
  function _updQ(s, a, r, sn) {
    const i = s * N_AC + a;
    const td = r + GAMMA * _qMax(sn) - Q[i];
    Q[i] += ALPHA * td;
    ql.tdError = td; ql.totalReward += r; ql.episodeReward += r; ql.updateCount++;
  }

  // ╔══════════════════════════════════════════════╗
  // ║  2. MARKOV CHAIN  (Move Sequence Prediction) ║
  // ╚══════════════════════════════════════════════╝
  // T[prev][curr] = count of observed transitions
  // Prediction = argmax T[currentAction]

  const MN = 5;  // idle punch kick jump block
  const P_LABELS = ['IDLE','PUNCH','KICK','JUMP','BLOCK'];
  const P_COLORS = ['#334155','#f97316','#ef4444','#a855f7','#22d3ee'];

  let mkv = {
    T: new Array(MN * MN).fill(0),
    prev: 0,
    pred: { action:-1, label:'?', confidence:0 },
    correct: 0, total: 0, counterActive: false,
  };

  function _mkvObserve(idx) {
    if (mkv.pred.action >= 0) { mkv.total++; if (mkv.pred.action === idx) mkv.correct++; }
    else { mkv.total++; }
    mkv.T[mkv.prev * MN + idx]++;
    mkv.prev = idx;
    mkv.pred = _mkvPredict(idx);
  }

  function _mkvPredict(cur) {
    const base = cur * MN;
    const row  = mkv.T.slice(base, base + MN);
    const tot  = row.reduce((a,b) => a+b, 0);
    if (!tot) return { action:-1, label:'?', confidence:0 };
    const mi = row.indexOf(Math.max(...row));
    return { action: mi, label: P_LABELS[mi], confidence: row[mi]/tot };
  }

  // ╔══════════════════════════════════════════════╗
  // ║  3. NAIVE BAYES  (Player Archetype)          ║
  // ╚══════════════════════════════════════════════╝
  // P(archetype|features) ∝ P(archetype) · ΠP(feature_i|archetype)
  // Gaussian likelihood, log-sum-exp normalization

  const ARCHETYPES = [
    { name:'AGGRESSOR',     color:'#ef4444', glow:'rgba(239,68,68,.35)',   icon:'⚔️',
      desc:'Pure offense — relentless attacker',
      μ:{punch:.42,kick:.32,block:.04,jump:.08,idle:.14}, σ:{punch:.14,kick:.14,block:.06,jump:.08,idle:.10} },
    { name:'DEFENDER',      color:'#38bdf8', glow:'rgba(56,189,248,.35)',  icon:'🛡️',
      desc:'Patient — blocks and counter-punches',
      μ:{punch:.10,kick:.10,block:.52,jump:.08,idle:.20}, σ:{punch:.08,kick:.08,block:.15,jump:.08,idle:.12} },
    { name:'COMBO MACHINE', color:'#facc15', glow:'rgba(250,204,21,.35)',  icon:'⚡',
      desc:'Lightning fast — maximizes combo chains',
      μ:{punch:.38,kick:.37,block:.04,jump:.05,idle:.16}, σ:{punch:.12,kick:.12,block:.06,jump:.06,idle:.10} },
    { name:'JUGGLER',       color:'#a855f7', glow:'rgba(168,85,247,.35)',  icon:'🌀',
      desc:'Aerial specialist — evades with jumps',
      μ:{punch:.14,kick:.18,block:.08,jump:.48,idle:.12}, σ:{punch:.10,kick:.10,block:.08,jump:.14,idle:.08} },
  ];

  let bay = {
    counts: { punch:0, kick:0, block:0, jump:0, idle:0 },
    total: 0, posteriors: [.25,.25,.25,.25], archetypeIdx: -1, archetype: 'UNKNOWN',
  };

  function _gauss(x, mu, sigma) {
    const s2 = Math.max(sigma*sigma, 1e-10);
    return Math.exp(-.5*((x-mu)**2)/s2) / Math.sqrt(2*Math.PI*s2);
  }

  function _updBayes(key) {
    if (!(key in bay.counts)) return;
    bay.counts[key]++; bay.total++;
    if (bay.total < 5) return;
    const feat = {};
    for (const k in bay.counts) feat[k] = bay.counts[k] / bay.total;
    const logP = ARCHETYPES.map(a => {
      let lp = Math.log(.25);
      for (const k in feat) lp += Math.log(Math.max(_gauss(feat[k], a.μ[k], a.σ[k]), 1e-10));
      return lp;
    });
    const mx   = Math.max(...logP);
    const exps = logP.map(lp => Math.exp(lp - mx));
    const sum  = exps.reduce((a,b) => a+b, 0);
    bay.posteriors  = exps.map(e => e/sum);
    bay.archetypeIdx = bay.posteriors.indexOf(Math.max(...bay.posteriors));
    bay.archetype    = ARCHETYPES[bay.archetypeIdx].name;
  }

  // ╔══════════════════════════════════════════════╗
  // ║  4. DESCRIPTIVE STATISTICS                   ║
  // ╚══════════════════════════════════════════════╝

  let ds = {
    dmgDealt:[], dmgTaken:[], hits:0, attacks:0,
    blockOK:0, blockAttempts:0, maxCombo:0,
    p1HpHist:[], aiHpHist:[], tick:0,
  };

  const _mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const _std  = arr => {
    if (arr.length < 2) return 0;
    const mu = _mean(arr);
    return Math.sqrt(arr.reduce((s,x)=>s+(x-mu)**2,0)/arr.length);
  };

  // ── Level config ─────────────────────────────────────────
  let _lvl = { react:18, spd:1.0, agg:.22, blk:.16, combo:0 };

  // ╔══════════════════════════════════════════════╗
  // ║  PUBLIC API                                  ║
  // ╚══════════════════════════════════════════════╝

  function init()  { _loadQ(); }

  function reset() {
    bay.counts = { punch:0, kick:0, block:0, jump:0, idle:0 };
    bay.total  = 0; bay.posteriors = [.25,.25,.25,.25]; bay.archetypeIdx = -1; bay.archetype = 'UNKNOWN';
    mkv.T      = new Array(MN*MN).fill(0); mkv.prev=0; mkv.pred={action:-1,label:'?',confidence:0};
    mkv.correct= 0; mkv.total = 0;
    ds = { dmgDealt:[],dmgTaken:[],hits:0,attacks:0,blockOK:0,blockAttempts:0,maxCombo:0,p1HpHist:[],aiHpHist:[],tick:0 };
    _prevP1Hp = 100; _prevAiHp = 100; _p1LastIdx = 0; ql.episodeReward = 0;
  }

  function setLevel(cfg) {
    _lvl = { ...cfg };
    mkv.counterActive = (cfg.react || 18) <= 10;
  }

  // AI think — Q-learning driven
  function think(ai, player, frame) {
    if (ai.stun > 0) return;
    if (frame % Math.max(1, _lvl.react) !== 0) return;

    const dist = Math.abs(ai.x - player.x);
    const sn   = _enc(dist, player.hp, ai.hp, _p1LastIdx);
    const r    = (_prevP1Hp - player.hp) - (_prevAiHp - ai.hp) * 0.8;
    _updQ(ql.lastState, ql.lastAction, r, sn);
    _prevP1Hp = player.hp; _prevAiHp = ai.hp;

    // Markov override (level 3+): counter predicted player move
    let action;
    if (mkv.counterActive && mkv.pred.confidence > 0.60 && mkv.pred.action >= 0 && dist < 2.5) {
      const p = mkv.pred.action;
      if      (p === 1 && dist < 2.0) action = AC.BLOCK;
      else if (p === 2 && dist < 2.5) action = AC.RETREAT;
      else if (p === 3)               action = AC.KICK;
    }
    if (action === undefined) action = _pick(sn);
    ql.lastState = sn; ql.lastAction = action;

    const dir = player.x > ai.x ? 1 : -1;
    const spd = _lvl.spd;
    ai.stopBlock();
    switch (action) {
      case AC.APPROACH: ai.move(dir * spd); break;
      case AC.RETREAT:  ai.move(-dir * spd * 0.65); break;
      case AC.PUNCH:    dist < 2.2 ? ai.punch()      : ai.move(dir * spd); break;
      case AC.KICK:     dist < 2.6 ? ai.kick()       : ai.move(dir * spd); break;
      case AC.BLOCK:    dist < 2.0 ? ai.startBlock() : ai.move(dir * 0.5 * spd); break;
      case AC.JUMP:     if (ai.onGround) ai.jump();  ai.move(dir * 0.4 * spd); break;
      case AC.IDLE:     ai.move(0); break;
    }
    if (ai.onGround && dist > 2.5 && action === AC.APPROACH && Math.random() < .07 * _lvl.agg) ai.jump();
  }

  // Event hooks called by main.js
  function onPlayerAction(key, idx) {
    _p1LastIdx = idx;
    _mkvObserve(idx);
    _updBayes(key);
    if (key === 'punch' || key === 'kick') ds.attacks++;
    if (key === 'block') ds.blockAttempts++;
  }

  function onP1Hit(dmg, combo) {
    ds.dmgDealt.push(dmg); ds.hits++;
    ds.maxCombo = Math.max(ds.maxCombo, combo || 1);
  }

  function onAiHit(dmg)     { ds.dmgTaken.push(dmg); }
  function onBlockSuccess()  { ds.blockOK++; }

  function recordHpTick(p1Hp, aiHp) {
    const t = ds.tick++;
    ds.p1HpHist.push({ t, hp: p1Hp });
    ds.aiHpHist.push({ t, hp: aiHp });
    if (ds.p1HpHist.length > 120) { ds.p1HpHist.shift(); ds.aiHpHist.shift(); }
  }

  function endRound(p1Won) {
    roundCount++; epsilon = Math.max(0.05, epsilon * 0.92);
    _updQ(ql.lastState, ql.lastAction, p1Won ? -5 : 8, ql.lastState);
    ql.episodeReward = 0;
    _saveQ();
  }

  // Returns full snapshot for DSViz
  function getSnapshot() {
    const qv = _qVals(ql.lastState);
    const feat = bay.total > 0
      ? Object.fromEntries(Object.entries(bay.counts).map(([k,v]) => [k, +(v/bay.total*100).toFixed(1)]))
      : { punch:0, kick:0, block:0, jump:0, idle:0 };
    return {
      rl: {
        epsilon: +epsilon.toFixed(3), tdError: +ql.tdError.toFixed(3),
        totalReward: +ql.totalReward.toFixed(1), updateCount: ql.updateCount,
        currentState: ql.lastState, currentAction: ql.lastAction,
        qValues: qv, actionLabels: AC_LABELS, actionColors: AC_COLORS,
        bestActionIdx: qv.indexOf(Math.max(...qv)), roundCount,
      },
      markov: {
        pred: mkv.pred, T: mkv.T, N: MN,
        playerLabels: P_LABELS, playerColors: P_COLORS,
        accuracy: mkv.total > 0 ? (mkv.correct/mkv.total*100).toFixed(1) : '--',
        counterActive: mkv.counterActive,
      },
      bayes: {
        posteriors: bay.posteriors, archetype: bay.archetype,
        archetypeIdx: bay.archetypeIdx, archetypes: ARCHETYPES,
        counts: bay.counts, total: bay.total, features: feat,
      },
      stats: {
        meanDmgDealt: +_mean(ds.dmgDealt).toFixed(1), stdDmgDealt: +_std(ds.dmgDealt).toFixed(1),
        meanDmgTaken: +_mean(ds.dmgTaken).toFixed(1),
        hitRate:   ds.attacks > 0 ? +(ds.hits/ds.attacks*100).toFixed(1) : 0,
        blockRate: ds.blockAttempts > 0 ? +(ds.blockOK/ds.blockAttempts*100).toFixed(1) : 0,
        maxCombo: ds.maxCombo, hits: ds.hits, actions: bay.total,
        totalDealt: ds.dmgDealt.reduce((a,b)=>a+b,0),
        totalTaken: ds.dmgTaken.reduce((a,b)=>a+b,0),
        dmgDealt: ds.dmgDealt, dmgTaken: ds.dmgTaken,
      },
      charts: { p1Hp: ds.p1HpHist, aiHp: ds.aiHpHist, actions: bay.counts },
    };
  }

  return { init, reset, setLevel, think, onPlayerAction, onP1Hit, onAiHit, onBlockSuccess, recordHpTick, endRound, getSnapshot,
    get archetypeInfo() { return bay.archetypeIdx >= 0 ? ARCHETYPES[bay.archetypeIdx] : null; },
    get markovPred()    { return mkv.pred; },
  };
})();
