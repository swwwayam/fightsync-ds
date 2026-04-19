/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  fighter.js  (AAA Edition)
   Fighter class: 3D model, animations, physics
   ══════════════════════════════════════════════ */

'use strict';

// ─── CONSTANTS ──────────────────────────────────────────────
const WORLD_LEFT  = -7.5;
const WORLD_RIGHT =  7.5;
const FLOOR_Y     =  0.0;
const GRAVITY_UP  =  0.016;   // lighter gravity on ascent
const GRAVITY_DN  =  0.028;   // heavier gravity on descent (snappy fall)

const ACCEL       = 0.012;    // acceleration per frame
const FRICTION    = 0.78;     // horizontal friction coefficient
const MAX_VX      = 0.10;     // max horizontal speed

const ATTACK_REACH       = 1.8;
const PUNCH_DMG          = 8;
const KICK_DMG           = 12;
const COMBO_DMG          = 20;
const BLOCK_REDUCE       = 0.25;
const ANTICIPATION_FRAMES= 5;   // windup before hitbox active
const RECOVERY_FRAMES    = 8;   // cannot cancel out of attack until this passes
const HITSTOP_FRAMES     = 4;   // freeze both fighters on impact

// Character archetypes for selection screen
const CHAR_DEFS = [
  {
    id: 'striker', name: 'STRIKER', type: 'SPEED / COMBO',
    color: 0x38bdf8, secondaryColor: 0x0ea5e9, accentColor: 0x7dd3fc,
    stats: { str: 3, spd: 5, def: 2 },
    punchMult: 1.0, kickMult: 0.9, speedMult: 1.15, jumpMult: 1.0,
  },
  {
    id: 'bruiser', name: 'BRUISER', type: 'POWER / TANK',
    color: 0xf43f5e, secondaryColor: 0xe11d48, accentColor: 0xfca5a5,
    stats: { str: 5, spd: 2, def: 4 },
    punchMult: 1.4, kickMult: 1.3, speedMult: 0.88, jumpMult: 0.9,
  },
  {
    id: 'phantom', name: 'PHANTOM', type: 'BALANCED / TRICKY',
    color: 0xa855f7, secondaryColor: 0x9333ea, accentColor: 0xd8b4fe,
    stats: { str: 3, spd: 3, def: 3 },
    punchMult: 1.1, kickMult: 1.1, speedMult: 1.0, jumpMult: 1.15,
  },
  {
    id: 'sentinel', name: 'SENTINEL', type: 'DEFENSE / COUNTER',
    color: 0x22c55e, secondaryColor: 0x16a34a, accentColor: 0x86efac,
    stats: { str: 3, spd: 3, def: 5 },
    punchMult: 1.0, kickMult: 1.0, speedMult: 0.95, jumpMult: 0.95,
  },
];

// ─── FIGHTER CLASS ───────────────────────────────────────────
class Fighter {
  /**
   * @param {THREE.Scene} scene
   * @param {number} startX   - starting world X
   * @param {number} facing   - +1 = right, -1 = left
   * @param {object} charDef  - archetype from CHAR_DEFS
   * @param {boolean} isAI
   */
  constructor(scene, startX, facing, charDef, isAI = false) {
    this.scene     = scene;
    this.facing    = facing;
    this.charDef   = charDef;
    this.isAI      = isAI;

    // Position & physics
    this.x         = startX;
    this.y         = FLOOR_Y;
    this.vx        = 0;
    this._moveDir  = 0;   // persistent move direction (survives AI think gaps)
    this.vy        = 0;
    this.ax        = 0;          // horizontal acceleration input
    this.onGround  = true;
    this.prevOnGround = true;

    // Stats
    this.hp        = 100;
    this.maxHp     = 100;

    // Combat state
    this.state         = 'idle';
    this.stateTimer    = 0;
    this.hitLanded     = false;
    this.stun          = 0;
    this.hitstop       = 0;      // freeze frames on impact
    this.blocking      = false;
    this.inRecovery    = false;  // post-attack recovery lock

    // Landing recovery
    this.landTimer     = 0;

    // Combo system
    this.comboCount    = 0;
    this.comboTimer    = 0;
    this.lastPunch     = 0;
    this.maxCombo      = 0;
    this.damageDealt   = 0;

    // Animation helpers
    this.walkCycle     = 0;
    this.runTimer      = 0;      // frames of continuous movement
    this.glowPhase     = Math.random() * Math.PI * 2;

    // Energy trail pool
    this._trails       = [];

    // Build 3D model
    this._buildModel();

    // Multipliers from archetype
    this.speedMult = charDef.speedMult || 1.0;
    this.jumpMult  = charDef.jumpMult  || 1.0;
    this.punchMult = charDef.punchMult || 1.0;
    this.kickMult  = charDef.kickMult  || 1.0;
  }

  // ─── BUILD MODEL ──────────────────────────────────────────
  _buildModel() {
    const c = this.charDef;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: c.color, emissive: c.color, emissiveIntensity: 0.18,
      roughness: 0.35, metalness: 0.65,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: c.secondaryColor, emissive: c.secondaryColor, emissiveIntensity: 0.12,
      roughness: 0.5, metalness: 0.55,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: c.accentColor, emissive: c.accentColor, emissiveIntensity: 0.7,
      roughness: 0.15, metalness: 0.85,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // ── Torso
    const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.35);
    this.torso = new THREE.Mesh(torsoGeo, bodyMat);
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // ── Chest accent stripe
    const stripeGeo = new THREE.BoxGeometry(0.3, 0.55, 0.37);
    const stripe = new THREE.Mesh(stripeGeo, accentMat);
    this.torso.add(stripe);

    // ── Head
    const headGeo = new THREE.BoxGeometry(0.42, 0.42, 0.38);
    this.head = new THREE.Mesh(headGeo, bodyMat);
    this.head.castShadow = true;
    this.head.position.y = 0.55;
    this.torso.add(this.head);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.06, 0.05);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 0.05, 0.2);
    this.head.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set( 0.1, 0.05, 0.2);
    this.head.add(eyeR);

    // Visor glow bar
    const visorGeo = new THREE.BoxGeometry(0.28, 0.07, 0.06);
    const visor = new THREE.Mesh(visorGeo, accentMat);
    visor.position.set(0, 0.05, 0.21);
    this.head.add(visor);

    // ── Upper Arms
    const uArmGeo = new THREE.BoxGeometry(0.2, 0.45, 0.2);
    this.armL = new THREE.Mesh(uArmGeo, darkMat);
    this.armL.castShadow = true;
    this.armL.position.set(-0.42, 0.1, 0);
    this.torso.add(this.armL);

    this.armR = new THREE.Mesh(uArmGeo, darkMat);
    this.armR.castShadow = true;
    this.armR.position.set( 0.42, 0.1, 0);
    this.torso.add(this.armR);

    // ── Forearms
    const fArmGeo = new THREE.BoxGeometry(0.17, 0.42, 0.17);
    this.foreL = new THREE.Mesh(fArmGeo, bodyMat);
    this.foreL.position.set(0, -0.44, 0);
    this.armL.add(this.foreL);

    this.foreR = new THREE.Mesh(fArmGeo, bodyMat);
    this.foreR.position.set(0, -0.44, 0);
    this.armR.add(this.foreR);

    // Fists
    const fistGeo = new THREE.BoxGeometry(0.21, 0.21, 0.21);
    this.fistL = new THREE.Mesh(fistGeo, accentMat);
    this.fistL.position.set(0, -0.28, 0);
    this.foreL.add(this.fistL);
    this.fistR = new THREE.Mesh(fistGeo, accentMat);
    this.fistR.position.set(0, -0.28, 0);
    this.foreR.add(this.fistR);

    // ── Hips
    const hipGeo = new THREE.BoxGeometry(0.56, 0.22, 0.32);
    this.hips = new THREE.Mesh(hipGeo, darkMat);
    this.hips.castShadow = true;
    this.hips.position.y = -0.46;
    this.torso.add(this.hips);

    // ── Thighs
    const thighGeo = new THREE.BoxGeometry(0.22, 0.45, 0.25);
    this.thighL = new THREE.Mesh(thighGeo, bodyMat);
    this.thighL.castShadow = true;
    this.thighL.position.set(-0.17, -0.34, 0);
    this.hips.add(this.thighL);
    this.thighR = new THREE.Mesh(thighGeo, bodyMat);
    this.thighR.castShadow = true;
    this.thighR.position.set( 0.17, -0.34, 0);
    this.hips.add(this.thighR);

    // ── Shins
    const shinGeo = new THREE.BoxGeometry(0.19, 0.42, 0.22);
    this.shinL = new THREE.Mesh(shinGeo, darkMat);
    this.shinL.castShadow = true;
    this.shinL.position.set(0, -0.44, 0);
    this.thighL.add(this.shinL);
    this.shinR = new THREE.Mesh(shinGeo, darkMat);
    this.shinR.castShadow = true;
    this.shinR.position.set(0, -0.44, 0);
    this.thighR.add(this.shinR);

    // ── Feet
    const footGeo = new THREE.BoxGeometry(0.22, 0.14, 0.32);
    const footL = new THREE.Mesh(footGeo, accentMat);
    footL.position.set(0, -0.28, 0.06);
    this.shinL.add(footL);
    const footR = new THREE.Mesh(footGeo, accentMat);
    footR.position.set(0, -0.28, 0.06);
    this.shinR.add(footR);

    // ── Character glow point light
    this.glowLight = new THREE.PointLight(c.color, 1.0, 3.5);
    this.torso.add(this.glowLight);

    // Torso pivot at mid-body; model height ≈ 2.0 units
    this.torso.position.y = 1.3;
    this._syncGroupPos();
  }

  // ─── SYNC GROUP TO GAME COORDS ────────────────────────────
  _syncGroupPos() {
    this.group.position.x = this.x;
    this.group.position.y = this.y;
    // rotation.y is set by updateFacing() — do NOT touch scale.x here
  }

  // ─── RESET FOR NEW ROUND ──────────────────────────────────
  reset(startX, facing) {
    this.x = startX; this.y = FLOOR_Y;
    this.vx = 0; this.vy = 0; this.ax = 0;
    this._moveDir = 0;
    this.onGround = true; this.prevOnGround = true;
    this.hp = 100;
    this.state = 'idle'; this.stateTimer = 0;
    this.hitLanded = false; this.stun = 0; this.hitstop = 0;
    this.blocking = false; this.inRecovery = false;
    this.landTimer = 0; this.runTimer = 0;
    this.comboCount = 0; this.comboTimer = 0;
    this.maxCombo = 0; this.damageDealt = 0;
    this.facing = facing;
    this._clearTrails();
    this._syncGroupPos();
    this.updateFacing(facing > 0 ? this.x + 10 : this.x - 10); // set initial rotation.y
    this._poseIdle(0);
  }

  // ─── UPDATE FACING TOWARD OPPONENT ───────────────────────
  // Fighters face each other by rotating 90° around Y.
  // The model is built facing +Z (camera). Rotating Y by -PI/2 makes it face +X (right).
  // Rotating Y by +PI/2 makes it face -X (left). scale.x stays 1 always.
  updateFacing(opponentX) {
    this.facing = opponentX > this.x ? 1 : -1;
    this.group.rotation.y = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // ─── MOVE (called by input/AI) ───────────────────────────
  move(dir) {
    if (this.stun > 0 || this.state === 'hurt' || this.state === 'knockback') return;
    if (this.state === 'punch' || this.state === 'kick') return;
    if (this.landTimer > 0) return;

    // Store direction — persists until next move() call.
    // This way AI keeps moving between its think-frames instead of decelerating.
    this._moveDir = dir;
    if (this.onGround) this.state = dir !== 0 ? 'walk' : 'idle';
  }

  jump() {
    if (!this.onGround || this.stun > 0) return;
    if (this.landTimer > 0) return;
    this.vy = 0.20 * this.jumpMult;
    this.onGround = false;
    this.state = 'jump';
    this.runTimer = 0;
    if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.jump();
  }

  punch() {
    if (this.stun > 0 || this.hitstop > 0) return;
    if (this.state === 'punch' || this.state === 'kick') return;
    if (this.inRecovery) return;
    this.state    = 'punch';
    this.stateTimer = 0;
    this.hitLanded  = false;
    this.inRecovery = false;
    if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.punch();
  }

  kick() {
    if (this.stun > 0 || this.hitstop > 0) return;
    if (this.state === 'punch' || this.state === 'kick') return;
    if (this.inRecovery) return;
    this.state    = 'kick';
    this.stateTimer = 0;
    this.hitLanded  = false;
    this.inRecovery = false;
    if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.kick();
  }

  startBlock() {
    if (this.stun > 0) return;
    this.blocking = true;
    this.state    = 'block';
  }

  stopBlock() {
    this.blocking = false;
    if (this.state === 'block') this.state = 'idle';
  }

  // ─── RECEIVE HIT ─────────────────────────────────────────
  receiveHit(rawDmg, isCombo = false) {
    if (this.hp <= 0) return 0;

    let dmg = rawDmg;
    if (this.blocking) {
      dmg = Math.max(1, Math.round(rawDmg * BLOCK_REDUCE));
      if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.block();
      this._flashBlock();
    } else {
      if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.hit();
      this.stun  = 16;
      this.state = 'hurt';
      // Knockback — stronger for combos
      this.vx = -this.facing * (isCombo ? 0.18 : 0.13);
      if (isCombo) {
        this.vy    = 0.09;
        this.state = 'knockback';
        if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.heavyHit();
      }
    }

    // Hitstop freeze
    this.hitstop = HITSTOP_FRAMES;

    this.hp = Math.max(0, this.hp - dmg);
    this._flashHurt();
    return dmg;
  }

  // ─── APPLY HITSTOP ───────────────────────────────────────
  applyHitstop() {
    this.hitstop = HITSTOP_FRAMES;
  }

  // ─── PHYSICS + STATE MACHINE UPDATE ─────────────────────
  update(opponentX) {
    // Update facing before anything else
    this.updateFacing(opponentX);

    // Hitstop — freeze physics/animation briefly
    if (this.hitstop > 0) {
      this.hitstop--;
      this._animate(); // still render vibration
      return;
    }

    // Stun countdown
    if (this.stun > 0) {
      this.stun--;
      if (this.stun === 0 && (this.state === 'hurt' || this.state === 'knockback')) {
        this.state = 'idle';
      }
    }

    // Landing recovery countdown
    if (this.landTimer > 0) {
      this.landTimer--;
      if (this.landTimer === 0 && this.state === 'land') this.state = 'idle';
    }

    // Combo timer
    if (this.comboTimer > 0) this.comboTimer--;
    if (this.comboTimer === 0 && this.comboCount > 0) {
      this.maxCombo = Math.max(this.maxCombo, this.comboCount);
      this.comboCount = 0;
    }

    // Variable gravity (heavier on descent)
    if (!this.onGround) {
      const grav = this.vy > 0 ? GRAVITY_UP : GRAVITY_DN;
      this.vy -= grav;
    }

    // Apply persistent movement direction as acceleration every frame.
    // _moveDir is set by move() and persists — AI benefits between think-frames;
    // player always calls move() every frame so it stays responsive.
    if (this._moveDir !== 0) {
      this.runTimer = Math.min(this.runTimer + 1, 20);
      const runBoost = this.runTimer / 20;
      this.ax = this._moveDir * ACCEL * this.speedMult * (1 + runBoost * 0.5);
    } else {
      this.runTimer = 0;
      this.ax = 0;
    }

    // Apply acceleration, clamp to max speed
    this.vx += this.ax;
    this.vx = Math.max(-MAX_VX * this.speedMult, Math.min(MAX_VX * this.speedMult, this.vx));
    this.ax = 0;

    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Floor collision
    this.prevOnGround = this.onGround;
    if (this.y <= FLOOR_Y) {
      this.y = FLOOR_Y;
      const wasInAir = !this.onGround;
      this.onGround = true;
      this.vy = 0;
      if (wasInAir && this.state === 'jump') {
        this.state    = 'land';
        this.landTimer = 7;   // 7-frame squat recovery
        if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.land();
      }
    } else {
      this.onGround = false;
    }

    // Horizontal friction (less friction in air for momentum)
    this.vx *= this.onGround ? FRICTION : (FRICTION + 0.08);

    // Wall bounds
    this.x = Math.max(WORLD_LEFT + 0.5, Math.min(WORLD_RIGHT - 0.5, this.x));

    // Attack state timers (with anticipation + recovery)
    if (this.state === 'punch') {
      this.stateTimer++;
      if (this.stateTimer > 26) {
        this.state = 'idle';
        this.stateTimer = 0;
        this.inRecovery = false;
      } else if (this.stateTimer > 26 - RECOVERY_FRAMES) {
        this.inRecovery = true;
      }
    }
    if (this.state === 'kick') {
      this.stateTimer++;
      if (this.stateTimer > 32) {
        this.state = 'idle';
        this.stateTimer = 0;
        this.inRecovery = false;
      } else if (this.stateTimer > 32 - RECOVERY_FRAMES) {
        this.inRecovery = true;
      }
    }

    // Glow pulse
    const t = performance.now() * 0.001;
    const lowHp = this.hp < 25;
    const glowBase = lowHp ? 1.6 : 1.0;
    const glowFreq = lowHp ? 6 : 2;
    this.glowLight.intensity = glowBase + Math.sin(t * glowFreq + this.glowPhase) * 0.4;
    if (lowHp) this.glowLight.color.setHex(0xff3333);

    this._syncGroupPos();
    this._animate();
    this._updateTrails();
  }

  // ─── CHECK IF HITTING OPPONENT ───────────────────────────
  checkHit(opponent) {
    if (this.hitLanded) return 0;
    if (this.state !== 'punch' && this.state !== 'kick') return 0;
    // Hit window starts after anticipation frames
    if (this.stateTimer < ANTICIPATION_FRAMES + 3) return 0;

    const dist = Math.abs(this.x - opponent.x);
    if (dist > ATTACK_REACH) return 0;

    this.hitLanded = true;

    // Combo check — 700ms window
    let isCombo = false;
    const now = Date.now();
    if (now - this.lastPunch < 700 && this.comboCount >= 1) {
      isCombo = true;
    }
    this.lastPunch   = now;
    this.comboCount++;
    this.comboTimer  = 72;

    let rawDmg;
    if (isCombo) {
      rawDmg = COMBO_DMG * this.punchMult;
      if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.combo();
    } else if (this.state === 'punch') {
      rawDmg = PUNCH_DMG * this.punchMult;
    } else {
      rawDmg = KICK_DMG * this.kickMult;
    }

    rawDmg = Math.round(rawDmg);
    const actualDmg = opponent.receiveHit(rawDmg, isCombo);
    this.damageDealt += actualDmg;

    // Apply hitstop to self too (attacker freeze)
    this.applyHitstop();

    return actualDmg;
  }

  // ─── ENERGY TRAIL SYSTEM ────────────────────────────────
  _spawnTrailParticle(worldPos) {
    const geo = new THREE.SphereGeometry(0.07, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: this.charDef.accentColor,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    this.scene.add(mesh);
    this._trails.push({ mesh, life: 1.0 });
  }

  _updateTrails() {
    const isAttacking = (this.state === 'punch' || this.state === 'kick')
                        && this.stateTimer > ANTICIPATION_FRAMES;

    if (isAttacking) {
      // Get fist world position
      const fist = this.state === 'punch' ? this.fistR : this.fistR;
      const wp = new THREE.Vector3();
      fist.getWorldPosition(wp);
      if (Math.random() < 0.7) this._spawnTrailParticle(wp);
    }

    // Update existing trail particles
    for (let i = this._trails.length - 1; i >= 0; i--) {
      const t = this._trails[i];
      t.life -= 0.12;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this._trails.splice(i, 1);
      } else {
        t.mesh.material.opacity = t.life * 0.85;
        t.mesh.scale.setScalar(t.life * 0.8 + 0.2);
      }
    }
  }

  _clearTrails() {
    this._trails.forEach(t => {
      this.scene.remove(t.mesh);
      if (t.mesh.geometry) t.mesh.geometry.dispose();
      if (t.mesh.material) t.mesh.material.dispose();
    });
    this._trails = [];
  }

  // ─── VISUAL FLASH ────────────────────────────────────────
  _flashHurt()  { this._flashColor(0xff2244, 200); }
  _flashBlock() { this._flashColor(0xffffff, 150); }
  _flashColor(hex, ms) {
    const origEmissive = this.charDef.color;
    this.group.traverse(obj => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.emissive.setHex(hex);
        obj.material.emissiveIntensity = 1.0;
      }
    });
    setTimeout(() => {
      this.group.traverse(obj => {
        if (obj.isMesh && obj.material && obj.material.emissive) {
          obj.material.emissive.setHex(origEmissive);
          obj.material.emissiveIntensity = 0.18;
        }
      });
    }, ms);
  }

  // ─── ANIMATION ───────────────────────────────────────────
  _animate() {
    const t = performance.now() * 0.001;
    switch (this.state) {
      case 'idle':     this._poseIdle(t);    break;
      case 'walk':     this._poseWalk(t);    break;
      case 'jump':     this._poseJump();     break;
      case 'land':     this._poseLand();     break;
      case 'punch':    this._posePunch();    break;
      case 'kick':     this._poseKick();     break;
      case 'block':    this._poseBlock();    break;
      case 'hurt':
      case 'knockback': this._poseHurt();   break;
    }
  }

  _poseIdle(t) {
    const bob = Math.sin(t * 2.5) * 0.04;
    this.torso.position.y  = 1.3 + bob;
    this.torso.rotation.x  = 0;
    this.torso.rotation.z  = 0;
    this.head.rotation.z   = Math.sin(t * 1.8) * 0.03;

    // Combat guard stance
    this.armL.rotation.z   =  0.4;  this.armL.rotation.x = -0.2;
    this.armR.rotation.z   = -0.4;  this.armR.rotation.x = -0.2;
    this.foreL.rotation.x  = -0.5;  this.foreR.rotation.x = -0.5;
    this.thighL.rotation.x = 0;     this.thighR.rotation.x = 0;
    this.shinL.rotation.x  = 0;     this.shinR.rotation.x  = 0;
  }

  _poseWalk(t) {
    this.walkCycle = t;
    const swing = Math.sin(this.walkCycle * 8) * 0.38;
    const bob   = Math.abs(Math.sin(this.walkCycle * 8)) * 0.05;
    this.torso.position.y  = 1.3 + bob;
    this.torso.rotation.z  = 0;

    this.thighL.rotation.x =  swing;
    this.thighR.rotation.x = -swing;
    this.shinL.rotation.x  = Math.max(0, -swing * 0.5);
    this.shinR.rotation.x  = Math.max(0,  swing * 0.5);

    this.armL.rotation.z   =  0.3 + Math.sin(this.walkCycle * 8) * 0.15;
    this.armR.rotation.z   = -0.3 - Math.sin(this.walkCycle * 8) * 0.15;
    this.armL.rotation.x   = -0.1 + Math.sin(this.walkCycle * 8) * 0.28;
    this.armR.rotation.x   = -0.1 - Math.sin(this.walkCycle * 8) * 0.28;
    this.foreL.rotation.x  = -0.3;
    this.foreR.rotation.x  = -0.3;
  }

  _poseJump() {
    this.thighL.rotation.x = -0.65; this.thighR.rotation.x = -0.65;
    this.shinL.rotation.x  = -0.85; this.shinR.rotation.x  = -0.85;
    this.armL.rotation.z   =  0.8;  this.armR.rotation.z   = -0.8;
    this.armL.rotation.x   = -0.55; this.armR.rotation.x   = -0.55;
    this.foreL.rotation.x  = -0.4;  this.foreR.rotation.x  = -0.4;
    this.torso.rotation.x  = -0.12;
  }

  _poseLand() {
    // Short squat recovery pose
    const squat = Math.max(0, this.landTimer / 7);
    this.torso.position.y  = 1.3 - squat * 0.18;
    this.thighL.rotation.x =  squat * 0.5;
    this.thighR.rotation.x =  squat * 0.5;
    this.shinL.rotation.x  =  squat * 0.3;
    this.shinR.rotation.x  =  squat * 0.3;
    this.torso.rotation.x  =  squat * 0.1;
  }

  _posePunch() {
    // Anticipation frames (wind-up)
    if (this.stateTimer < ANTICIPATION_FRAMES) {
      const anti = this.stateTimer / ANTICIPATION_FRAMES;
      this.armR.rotation.z  = -0.1 + anti * 0.4;  // pull back
      this.armR.rotation.x  = -0.3 - anti * 0.3;
      this.torso.rotation.x = -anti * 0.08;
      return;
    }

    // Active + recovery
    const p = Math.min(1, (this.stateTimer - ANTICIPATION_FRAMES) / 10);
    const retract = this.stateTimer > 18 ? (this.stateTimer - 18) / 10 : 0;
    const ext = p - retract;

    this.armR.rotation.z  = -0.1;
    this.armR.rotation.x  = -0.5 - ext * 0.9;
    this.foreR.rotation.x = -0.8 - ext * 0.5;
    this.armL.rotation.z  =  0.5;  this.armL.rotation.x = -0.4;
    this.foreL.rotation.x = -0.6;
    this.torso.rotation.x =  ext * 0.18;
  }

  _poseKick() {
    // Anticipation frames
    if (this.stateTimer < ANTICIPATION_FRAMES) {
      const anti = this.stateTimer / ANTICIPATION_FRAMES;
      this.thighR.rotation.x = anti * 0.2;  // slight crouch
      this.torso.rotation.x  = anti * 0.05;
      return;
    }

    const p = Math.min(1, (this.stateTimer - ANTICIPATION_FRAMES) / 12);
    const retract = this.stateTimer > 20 ? (this.stateTimer - 20) / 12 : 0;
    const ext = p - retract;

    this.thighR.rotation.x = -0.3 + ext * -1.2;
    this.shinR.rotation.x  =  0.3 + ext * -0.5;
    this.thighL.rotation.x = 0.1;
    this.shinL.rotation.x  = 0;
    this.armL.rotation.z   =  0.7;
    this.armR.rotation.z   = -0.3;
    this.torso.rotation.x  = -ext * 0.12;
  }

  _poseBlock() {
    this.armL.rotation.z   =  0.85; this.armL.rotation.x = -0.85;
    this.armR.rotation.z   = -0.85; this.armR.rotation.x = -0.85;
    this.foreL.rotation.x  = -1.05; this.foreR.rotation.x = -1.05;
    this.torso.position.y  =  1.12;
    this.thighL.rotation.x =  0.22; this.thighR.rotation.x = 0.22;
  }

  _poseHurt() {
    // With rotation.y facing, 'reeling back' = lean along local X (lean backward).
    this.torso.rotation.x  =  0.28;
    this.torso.rotation.z  =  0;
    this.armL.rotation.z   =  1.0;
    this.armR.rotation.z   = -1.0;
    this.armL.rotation.x   = -0.3;
    this.armR.rotation.x   = -0.3;
    this.head.rotation.x   = -0.25;  // head snaps back
    this.head.rotation.z   =  0;
  }

  // ─── DISPOSE ─────────────────────────────────────────────
  dispose() {
    this._clearTrails();
    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

// Make Fighter and CHAR_DEFS available globally
window.Fighter   = Fighter;
window.CHAR_DEFS = CHAR_DEFS;
window.WORLD_LEFT  = WORLD_LEFT;
window.WORLD_RIGHT = WORLD_RIGHT;
window.HITSTOP_FRAMES = HITSTOP_FRAMES;
