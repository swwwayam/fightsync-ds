/* ══════════════════════════════════════════════════════════
   FIGHTSYNC DS VISUALIZER  —  ds_viz.js
   Real-time canvas charts + DOM panel updates
   ══════════════════════════════════════════════════════════ */
'use strict';

const DSViz = (() => {

  let _tab      = 'rl';
  let _visible  = false;
  let _inited   = false;
  let _ctx      = {};   // { timeline, histogram, radar, markov }

  // ── Initialize canvases ──────────────────────────────────
  function init() {
    if (_inited) return; _inited = true;
    ['ds-timeline', 'ds-histogram', 'ds-radar', 'ds-markov'].forEach(id => {
      const c = document.getElementById(id);
      if (c) _ctx[id.replace('ds-','')] = c.getContext('2d');
    });

    // Tab switching
    document.querySelectorAll('.ds-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        document.querySelectorAll('.ds-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.ds-tabcontent').forEach(el => el.classList.add('hidden'));
        const t = document.getElementById('ds-tab-' + _tab);
        if (t) t.classList.remove('hidden');
      });
    });

    // Toggle button
    const tog = document.getElementById('dsToggle');
    if (tog) tog.addEventListener('click', toggle);
  }

  function toggle() {
    _visible = !_visible;
    const panel = document.getElementById('ds-panel');
    const tog   = document.getElementById('dsToggle');
    if (panel) panel.classList.toggle('hidden', !_visible);
    if (tog)   tog.textContent = _visible ? '◉ DS MODE ▲' : '◉ DS MODE';
    if (_visible) update(DSEngine.getSnapshot());
  }

  // ── Master update — called every ~60 frames ─────────────
  function update(snap) {
    if (!snap) return;
    _updateRLTab(snap.rl);
    _updateMarkovTab(snap.markov);
    _updateBayesTab(snap.bayes);
    _updateStatsTab(snap.stats);
    if (_visible) {
      _drawTimeline(snap.charts);
      _drawHistogram(snap.charts.actions);
      if (_tab === 'markov') _drawMarkovMatrix(snap.markov);
      if (_tab === 'bayes')  _drawRadar(snap.bayes);
    }
  }

  // ── RL / Q-Learning Tab ──────────────────────────────────
  function _updateRLTab(rl) {
    const el = document.getElementById('ds-rl-content');
    if (!el) return;
    const maxQ  = Math.max(...rl.qValues.map(Math.abs), 0.01);
    const bars  = rl.qValues.map((v, i) => {
      const pct   = (v / maxQ * 50 + 50).toFixed(1);
      const best  = i === rl.bestActionIdx ? 'rl-best' : '';
      const fill  = v > 0 ? rl.actionColors[i] : '#ef4444';
      return `<div class="rl-row ${best}">
        <span class="rl-lbl">${rl.actionLabels[i]}</span>
        <div class="rl-bar-track"><div class="rl-bar-fill" style="width:${pct}%;background:${fill}"></div></div>
        <span class="rl-val ${v>0?'pos':'neg'}">${v.toFixed(3)}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="rl-meta">
        <span class="rl-chip">ε = <b>${rl.epsilon}</b></span>
        <span class="rl-chip">TD = <b>${rl.tdError > 0 ? '+' : ''}${rl.tdError}</b></span>
        <span class="rl-chip">Σr = <b>${rl.totalReward.toFixed(0)}</b></span>
        <span class="rl-chip">Updates = <b>${rl.updateCount}</b></span>
        <span class="rl-chip">Rounds = <b>${rl.roundCount}</b></span>
        <span class="rl-chip">State = <b>#${rl.currentState}</b></span>
      </div>
      <div class="rl-bars">${bars}</div>
      <div class="rl-footnote">Best action: <b style="color:${rl.actionColors[rl.bestActionIdx]}">${rl.actionLabels[rl.bestActionIdx]}</b> | α=${0.12} γ=${0.88}</div>`;
  }

  // ── Markov Tab ────────────────────────────────────────────
  function _updateMarkovTab(mkv) {
    const el = document.getElementById('ds-markov-content');
    if (!el) return;
    const { pred, accuracy, playerLabels, playerColors, counterActive } = mkv;
    const confPct = (pred.confidence * 100).toFixed(0);
    const confColor = pred.confidence > 0.6 ? '#4ade80' : pred.confidence > 0.35 ? '#facc15' : '#64748b';
    el.innerHTML = `
      <div class="mkv-pred-box" style="border-color:${confColor}">
        <div class="mkv-label">PREDICTED NEXT MOVE</div>
        <div class="mkv-action" style="color:${confColor}">${pred.label === '?' ? '—' : pred.label}</div>
        <div class="mkv-conf">Confidence: <b style="color:${confColor}">${pred.label==='?'?'--':confPct+'%'}</b></div>
        <div class="mkv-acc">Accuracy: <b>${accuracy}%</b> &nbsp;|&nbsp; ${counterActive ? '<span style="color:#4ade80">⚡ Counter-AI ACTIVE</span>' : 'Counter-AI from Lv3'}</div>
      </div>
      <div class="mkv-matrix-label">TRANSITION MATRIX T[prev→next]</div>
      <div class="mkv-matrix-wrap">
        <canvas id="ds-markov" width="200" height="200"></canvas>
        <div class="mkv-legend">${playerLabels.map((l,i)=>`<span style="color:${playerColors[i]}">${l}</span>`).join(' ')}</div>
      </div>`;
    // Re-grab context after DOM repaint
    const c = document.getElementById('ds-markov');
    if (c) { _ctx.markov = c.getContext('2d'); _drawMarkovMatrix(mkv); }
  }

  // ── Bayes Tab ─────────────────────────────────────────────
  function _updateBayesTab(bayes) {
    const el = document.getElementById('ds-bayes-content');
    if (!el) return;
    const { posteriors, archetypeIdx, archetypes, features, total } = bayes;
    const arch = archetypeIdx >= 0 ? archetypes[archetypeIdx] : null;
    const archBox = arch
      ? `<div class="arch-card" style="border-color:${arch.color};box-shadow:0 0 18px ${arch.glow}">
           <span class="arch-icon">${arch.icon}</span>
           <span class="arch-name" style="color:${arch.color}">${arch.name}</span>
           <span class="arch-desc">${arch.desc}</span>
         </div>`
      : `<div class="arch-card arch-unknown">COLLECTING DATA...</div>`;

    const bars = archetypes.map((a, i) => {
      const pct = (posteriors[i] * 100).toFixed(1);
      return `<div class="bayes-row">
        <span class="bayes-lbl">${a.icon} ${a.name}</span>
        <div class="bayes-track"><div class="bayes-fill" style="width:${pct}%;background:${a.color}"></div></div>
        <span class="bayes-pct" style="color:${a.color}">${pct}%</span>
      </div>`;
    }).join('');

    const feats = Object.entries(features).map(([k,v]) =>
      `<div class="feat-chip"><span>${k.toUpperCase()}</span><b>${v}%</b></div>`
    ).join('');

    el.innerHTML = `
      ${archBox}
      <div class="bayes-title">POSTERIOR PROBABILITIES  P(archetype | actions)</div>
      <div class="bayes-bars">${bars}</div>
      <div class="bayes-title" style="margin-top:8px">OBSERVED FEATURES (n=${total})</div>
      <div class="feat-row">${feats}</div>
      <div class="bayes-wrap"><canvas id="ds-radar" width="220" height="220"></canvas></div>`;
    const c = document.getElementById('ds-radar');
    if (c) { _ctx.radar = c.getContext('2d'); _drawRadar(bayes); }
  }

  // ── Stats Tab ─────────────────────────────────────────────
  function _updateStatsTab(st) {
    const el = document.getElementById('ds-stats-content');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-cell"><div class="stat-val" style="color:#4ade80">${st.meanDmgDealt}</div><div class="stat-lbl">μ DAMAGE DEALT</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#94a3b8">${st.stdDmgDealt}</div><div class="stat-lbl">σ STD DEV</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#f87171">${st.meanDmgTaken}</div><div class="stat-lbl">μ DAMAGE TAKEN</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#38bdf8">${st.hitRate}%</div><div class="stat-lbl">HIT RATE</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#22d3ee">${st.blockRate}%</div><div class="stat-lbl">BLOCK RATE</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#facc15">${st.maxCombo}×</div><div class="stat-lbl">MAX COMBO</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#4ade80">${st.totalDealt}</div><div class="stat-lbl">TOTAL DEALT</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#f87171">${st.totalTaken}</div><div class="stat-lbl">TOTAL TAKEN</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#a855f7">${st.hits}</div><div class="stat-lbl">HITS LANDED</div></div>
        <div class="stat-cell"><div class="stat-val" style="color:#64748b">${st.actions}</div><div class="stat-lbl">ACTIONS</div></div>
      </div>
      <div class="stat-note">μ = mean, σ = standard deviation (descriptive statistics)</div>
      <canvas id="ds-timeline" width="760" height="80" style="margin-top:8px;border-radius:4px"></canvas>`;
    const c = document.getElementById('ds-timeline');
    if (c) { _ctx.timeline = c.getContext('2d'); _drawTimeline(null); }
  }

  // ═══════════════════════════════════════════════════════════
  // CANVAS DRAWINGS
  // ═══════════════════════════════════════════════════════════

  // HP Timeline line chart
  function _drawTimeline(charts) {
    const ctx = _ctx.timeline; if (!ctx) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, W, H);
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    [25,50,75].forEach(y => {
      const py = H - (y/100) * H;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    });
    const src = charts ? DSEngine.getSnapshot().charts : DSEngine.getSnapshot().charts;
    const p1  = src.p1Hp, ai = src.aiHp;
    const n   = Math.max(p1.length, ai.length, 2);
    const drawLine = (hist, color, glow) => {
      if (!hist || hist.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.shadowColor = glow; ctx.shadowBlur = 6;
      hist.forEach((pt, i) => {
        const x = (i / (n-1)) * W;
        const y = H - (pt.hp / 100) * (H-4) - 2;
        i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
    };
    drawLine(p1, '#4ade80', '#4ade80');
    drawLine(ai, '#f87171', '#f87171');
    // Labels
    ctx.fillStyle = '#4ade80'; ctx.font = '9px Share Tech Mono'; ctx.fillText('YOU', 4, 12);
    ctx.fillStyle = '#f87171'; ctx.fillText('AI',  4, 24);
    ctx.fillStyle = '#1e293b'; ctx.fillText('HP TIMELINE', W/2 - 30, H - 4);
  }

  // Action Histogram bar chart
  function _drawHistogram(actions) {
    const ctx = _ctx.histogram; if (!ctx || !actions) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, W, H);
    const keys   = ['punch','kick','jump','block','idle'];
    const colors = ['#f97316','#ef4444','#a855f7','#22d3ee','#334155'];
    const max    = Math.max(...keys.map(k => actions[k]||0), 1);
    const bW     = W / keys.length;
    keys.forEach((k, i) => {
      const val  = actions[k] || 0;
      const barH = (val / max) * (H - 22);
      ctx.fillStyle = colors[i];
      ctx.shadowColor = colors[i]; ctx.shadowBlur = 6;
      ctx.fillRect(i*bW + 6, H - barH - 18, bW - 12, barH);
      ctx.shadowBlur = 0;
      ctx.fillStyle = colors[i]; ctx.font = '8px Share Tech Mono';
      ctx.fillText(k.toUpperCase(), i*bW + 4, H - 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(val, i*bW + bW/2 - 4, H - barH - 22);
    });
    ctx.fillStyle = '#1e293b'; ctx.font = '8px Share Tech Mono';
    ctx.fillText('ACTION HISTOGRAM', 4, 10);
  }

  // 5-axis Radar chart — features vs archetype centroid
  function _drawRadar(bayes) {
    const ctx = _ctx.radar; if (!ctx) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(2,6,23,0.9)';
    ctx.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2, R = Math.min(W,H)*0.38;
    const keys  = ['punch','kick','block','jump','idle'];
    const n     = keys.length;
    const angle = i => (i / n) * Math.PI * 2 - Math.PI/2;

    // Web grid
    [.25,.5,.75,1].forEach(r => {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i <= n; i++) {
        const a = angle(i);
        i === 0 ? ctx.moveTo(cx + Math.cos(a)*R*r, cy + Math.sin(a)*R*r)
                : ctx.lineTo(cx + Math.cos(a)*R*r, cy + Math.sin(a)*R*r);
      }
      ctx.closePath(); ctx.stroke();
    });
    keys.forEach((_, i) => {
      const a = angle(i);
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a)*R, cy + Math.sin(a)*R); ctx.stroke();
    });

    const drawPoly = (vals, color, fill, alpha) => {
      if (!vals.every(v => v >= 0)) return;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const a = angle(i), x = cx + Math.cos(a)*R*v, y = cy + Math.sin(a)*R*v;
        i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = fill.replace(')',`,${alpha})`).replace('rgb','rgba'); ctx.fill();
    };

    // Draw archetype centroid (dashed)
    if (bayes.archetypeIdx >= 0) {
      const arch = bayes.archetypes[bayes.archetypeIdx];
      const centroid = keys.map(k => arch.μ[k] / .5);  // normalize to ~0-1
      ctx.setLineDash([4,3]);
      drawPoly(centroid, arch.color + '80', arch.color, 0.1);
      ctx.setLineDash([]);
    }

    // Draw observed features
    if (bayes.total > 0) {
      const feat = keys.map(k => (bayes.counts[k]||0) / bayes.total / .5);
      drawPoly(feat, '#38bdf8', '#38bdf8', 0.18);
    }

    // Axis labels
    ctx.fillStyle = '#64748b'; ctx.font = '8px Share Tech Mono';
    keys.forEach((k, i) => {
      const a = angle(i);
      ctx.fillText(k.toUpperCase(), cx + Math.cos(a)*(R+10) - 12, cy + Math.sin(a)*(R+10) + 4);
    });
    ctx.fillStyle = '#38bdf8'; ctx.fillText('●YOU', 4, H-4);
    if (bayes.archetypeIdx >= 0) {
      const arch = bayes.archetypes[bayes.archetypeIdx];
      ctx.fillStyle = arch.color; ctx.fillText(`- - ${arch.name}`, 40, H-4);
    }
  }

  // Markov transition matrix heatmap
  function _drawMarkovMatrix(mkv) {
    const ctx = _ctx.markov; if (!ctx) return;
    const { T, N, playerLabels, playerColors } = mkv;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020617'; ctx.fillRect(0,0,W,H);
    const off = 28, cW = (W-off)/N, cH = (H-off)/N;
    const maxV = Math.max(...T, 1);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = T[r*N+c];
        const a = Math.sqrt(v / maxV);
        ctx.fillStyle = `rgba(56,189,248,${a.toFixed(2)})`;
        ctx.fillRect(off + c*cW + 1, off + r*cH + 1, cW-2, cH-2);
        if (v > 0) {
          ctx.fillStyle = '#fff'; ctx.font = '8px Share Tech Mono';
          ctx.fillText(v, off + c*cW + cW/2 - 4, off + r*cH + cH/2 + 3);
        }
      }
    }
    // Labels
    playerLabels.forEach((l, i) => {
      ctx.fillStyle = playerColors[i]; ctx.font = '7px Share Tech Mono';
      ctx.fillText(l.slice(0,3), off + i*cW + 2, off - 5);
      ctx.fillText(l.slice(0,3), 1, off + i*cH + cH/2 + 3);
    });
    ctx.fillStyle = '#334155'; ctx.font = '7px Share Tech Mono';
    ctx.fillText('→ NEXT', W/2 - 16, 8);
    ctx.save(); ctx.translate(8, H/2 + 10); ctx.rotate(-Math.PI/2);
    ctx.fillText('PREV ↓', 0, 0); ctx.restore();
  }

  return { init, toggle, update };

})();
