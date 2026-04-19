/* ══════════════════════════════════════════════
   FIGHTSYNC AI 3D  —  scene.js  (AAA Edition)
   Three.js scene, camera, lighting, arenas, VFX
   ══════════════════════════════════════════════ */

'use strict';

const Scene = (() => {

  // ─── INTERNAL STATE ─────────────────────────────────────
  let renderer, scene, camera;
  let clock;
  let hitParticles     = [];
  let dustParticles    = [];
  let arenaGroup       = null;
  let bgObjects        = [];
  let shakeAmount      = 0;
  let camSmoothX       = 0;
  let camSmoothY       = 3.5;
  let camSmoothZ       = 11;

  // Full-screen flash quad (parented to camera)
  let flashMesh        = null;
  let flashTimer       = 0;
  let flashDuration    = 0;
  let flashStartAlpha  = 0;

  // ─── LEVEL DEFINITIONS ──────────────────────────────────
  const LEVEL_DEFS = [
    {
      name: 'CYBERPUNK DISTRICT', flavor: 'THE AI IS AWAKENING',
      fogColor: 0x000510, fogNear: 20, fogFar: 52,
      floorColor: 0x0a0f1e, floorEmissive: 0x001830,
      gridColor: 0x0066aa, ambientColor: 0x112244,
      dirColor: 0x38bdf8, rimColor: 0xf43f5e,
      skyTop: 0x000510, skyBot: 0x020a1a,
      aiNames: ['GLITCH-01', 'NEON-FIST', 'BYTE-X'],
      agg: 0.22, blk: 0.16, spd: 1.0, combo: 0.0, react: 18, time: 60, mult: 1,
      buildBg: buildCyberpunkBg,
    },
    {
      name: 'ANCIENT TEMPLE', flavor: 'IT REMEMBERS YOUR MOVES',
      fogColor: 0x0a0500, fogNear: 18, fogFar: 47,
      floorColor: 0x1a0f00, floorEmissive: 0x2a1500,
      gridColor: 0x885500, ambientColor: 0x331100,
      dirColor: 0xffaa44, rimColor: 0x44aa88,
      skyTop: 0x0a0500, skyBot: 0x1a0800,
      aiNames: ['JADE-FIST', 'STONE-GOLEM', 'RUIN-WALKER'],
      agg: 0.36, blk: 0.28, spd: 1.2, combo: 0.14, react: 14, time: 55, mult: 1.5,
      buildBg: buildTempleBg,
    },
    {
      name: 'VOLCANIC ARENA', flavor: 'THE AI ADAPTS TO YOUR STYLE',
      fogColor: 0x100500, fogNear: 16, fogFar: 42,
      floorColor: 0x1a0800, floorEmissive: 0x3a1000,
      gridColor: 0xcc2200, ambientColor: 0x330800,
      dirColor: 0xff6600, rimColor: 0xff4400,
      skyTop: 0x100200, skyBot: 0x220600,
      aiNames: ['MAGMA-CORE', 'ASH-WRAITH', 'EMBER-FIST'],
      agg: 0.50, blk: 0.38, spd: 1.4, combo: 0.30, react: 11, time: 50, mult: 2,
      buildBg: buildVolcanicBg,
    },
    {
      name: 'SPACE STATION', flavor: 'CALCULATING YOUR PATTERNS',
      fogColor: 0x000008, fogNear: 22, fogFar: 57,
      floorColor: 0x080810, floorEmissive: 0x080818,
      gridColor: 0x6600cc, ambientColor: 0x110022,
      dirColor: 0xaa66ff, rimColor: 0x0088ff,
      skyTop: 0x000008, skyBot: 0x000015,
      aiNames: ['VOID-UNIT', 'STARFALL', 'COSMO-X'],
      agg: 0.65, blk: 0.50, spd: 1.6, combo: 0.46, react: 8, time: 45, mult: 3,
      buildBg: buildSpaceBg,
    },
    {
      name: 'DIGITAL VOID', flavor: 'THE FINAL ALGORITHM',
      fogColor: 0x000000, fogNear: 14, fogFar: 40,
      floorColor: 0x050510, floorEmissive: 0x050520,
      gridColor: 0x00ffaa, ambientColor: 0x001a11,
      dirColor: 0x00ffcc, rimColor: 0xff00aa,
      skyTop: 0x000000, skyBot: 0x000508,
      aiNames: ['OMEGA-SYNC', 'APEX-AI', 'SHADOW-PROTOCOL'],
      agg: 0.80, blk: 0.65, spd: 1.85, combo: 0.62, react: 5, time: 38, mult: 5,
      buildBg: buildVoidBg,
    },
  ];

  // ─── INIT ────────────────────────────────────────────────
  function init(canvasEl) {
    clock = new THREE.Clock();

    // Renderer — RTX quality settings
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled  = true;
    renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    renderer.outputEncoding     = THREE.sRGBEncoding;
    renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.physicallyCorrectLights = true;

    resize();
    window.addEventListener('resize', resize);

    // Scene
    scene = new THREE.Scene();

    // Camera — cinematic side-view
    camera = new THREE.PerspectiveCamera(50, getAspect(), 0.1, 200);
    camera.position.set(0, 3.5, 11);
    camera.lookAt(0, 2, 0);

    // Full-screen flash quad parented to camera
    _buildFlashMesh();
  }

  function _buildFlashMesh() {
    const geo = new THREE.PlaneGeometry(3, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    flashMesh = new THREE.Mesh(geo, mat);
    flashMesh.position.z = -0.3;  // just in front of near plane
    flashMesh.renderOrder = 999;
    camera.add(flashMesh);
    scene.add(camera);  // camera must be in scene for children to render
  }

  function getAspect() {
    return renderer.domElement.clientWidth / renderer.domElement.clientHeight;
  }

  function resize() {
    const wrap = document.getElementById('arenaWrap');
    if (!wrap || !renderer) return;
    const w = wrap.clientWidth  || 860;
    const h = wrap.clientHeight || 420;
    renderer.setSize(w, h, false);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // ─── BUILD LEVEL ─────────────────────────────────────────
  function buildLevel(idx) {
    if (arenaGroup) {
      scene.remove(arenaGroup);
      arenaGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    bgObjects    = [];
    hitParticles = [];
    dustParticles= [];

    const def = LEVEL_DEFS[idx];
    arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    // Fog & sky
    scene.fog        = new THREE.Fog(def.fogColor, def.fogNear, def.fogFar);
    scene.background = new THREE.Color(def.skyBot);

    // ── Lights ──────────────────────────────────────────────
    // Ambient (soft fill)
    arenaGroup.add(new THREE.AmbientLight(def.ambientColor, 2.0));

    // Main key light — dramatic angle, high quality shadows
    const dirLight = new THREE.DirectionalLight(def.dirColor, 3.2);
    dirLight.position.set(4, 12, 8);
    dirLight.castShadow                    = true;
    dirLight.shadow.mapSize.width          = 2048;
    dirLight.shadow.mapSize.height         = 2048;
    dirLight.shadow.camera.near            = 0.5;
    dirLight.shadow.camera.far             = 35;
    dirLight.shadow.camera.left            = -12;
    dirLight.shadow.camera.right           =  12;
    dirLight.shadow.camera.top             =  12;
    dirLight.shadow.camera.bottom          = -5;
    dirLight.shadow.bias                   = -0.001;
    arenaGroup.add(dirLight);

    // Rim / back light (character silhouette)
    const rimLight = new THREE.DirectionalLight(def.rimColor, 1.6);
    rimLight.position.set(-4, 6, -8);
    arenaGroup.add(rimLight);

    // Fill from front-low (kills harsh shadows on face)
    const fillLight = new THREE.DirectionalLight(def.dirColor, 0.8);
    fillLight.position.set(-6, 4, 5);
    arenaGroup.add(fillLight);

    // ── Floor ───────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(24, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color:            def.floorColor,
      emissive:         def.floorEmissive,
      emissiveIntensity: 0.55,
      roughness:        0.45,
      metalness:        0.6,
      envMapIntensity:  0.4,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arenaGroup.add(floor);

    // Reflection plane (slightly above floor to avoid z-fight)
    const reflGeo = new THREE.PlaneGeometry(24, 12);
    const reflMat = new THREE.MeshBasicMaterial({
      color: def.dirColor,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const refl = new THREE.Mesh(reflGeo, reflMat);
    refl.rotation.x = -Math.PI / 2;
    refl.position.y  = 0.005;
    arenaGroup.add(refl);

    // Glowing floor grid
    buildFloorGrid(def.gridColor);

    // Stage-specific background
    def.buildBg(arenaGroup, def);
  }

  // ─── FLOOR GRID ──────────────────────────────────────────
  function buildFloorGrid(color) {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
    const group = new THREE.Group();
    group.position.y = 0.015;

    for (let x = -11; x <= 11; x += 2) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, -5), new THREE.Vector3(x, 0, 5),
      ]);
      group.add(new THREE.Line(geo, mat));
    }
    for (let z = -5; z <= 5; z += 1) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-11, 0, z), new THREE.Vector3(11, 0, z),
      ]);
      group.add(new THREE.Line(geo, mat));
    }
    arenaGroup.add(group);
  }

  // ─── BACKGROUND BUILDERS ─────────────────────────────────
  function buildCyberpunkBg(group, def) {
    const colors = [0x38bdf8, 0xf43f5e, 0xa855f7, 0x22c55e];
    const bldData = [
      { x: -8, w: 1.5, h: 6, z: -5 }, { x: -6, w: 1.0, h: 9, z: -5 },
      { x: -4, w: 2.0, h: 5, z: -6 }, { x:  4, w: 2.0, h: 5, z: -6 },
      { x:  6, w: 1.0, h: 9, z: -5 }, { x:  8, w: 1.5, h: 6, z: -5 },
    ];
    bldData.forEach((b, i) => {
      const geo = new THREE.BoxGeometry(b.w, b.h, 0.3);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x050a15, emissive: colors[i % colors.length], emissiveIntensity: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      group.add(mesh);

      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.6 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.copy(mesh.position);
      group.add(wireframe);
      bgObjects.push({ mesh: wireframe, type: 'pulse', phase: i * 0.8 });
    });
    addFloatingParticles(group, 0x38bdf8, 80);
  }

  function buildTempleBg(group, def) {
    const pillarData = [-7, -5, 5, 7];
    pillarData.forEach((x, i) => {
      const geo = new THREE.CylinderGeometry(0.35, 0.42, 5.5, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a1f10, roughness: 0.9, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 2.75, -4);
      mesh.castShadow = true;
      group.add(mesh);

      const capGeo = new THREE.BoxGeometry(1.1, 0.3, 1.1);
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.set(x, 5.65, -4);
      group.add(cap);

      const torchLight = new THREE.PointLight(0xffaa44, 1.5, 7);
      torchLight.position.set(x, 5.0, -3.5);
      group.add(torchLight);
      bgObjects.push({ mesh: torchLight, type: 'flicker', phase: i * 1.2 });
    });

    const wallGeo = new THREE.BoxGeometry(22, 9, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 1, metalness: 0 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 4.5, -6.5);
    group.add(wall);

    addFloatingParticles(group, 0xffaa44, 45, true);
  }

  function buildVolcanicBg(group, def) {
    const lavaColors = [0xff4400, 0xff6600, 0xff2200];
    for (let i = 0; i < 10; i++) {
      const x = (Math.random() - 0.5) * 20;
      const mat = new THREE.MeshStandardMaterial({
        emissive: lavaColors[i % lavaColors.length], emissiveIntensity: 1.4, color: 0x000000,
      });
      const geo = new THREE.PlaneGeometry(0.09, 3 + Math.random() * 2.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.5;
      mesh.position.set(x, 0.02, (Math.random() - 0.5) * 7);
      group.add(mesh);
      bgObjects.push({ mesh, type: 'lava', phase: Math.random() * Math.PI * 2 });
    }
    [[-6, 0, -3], [6, 0, -3], [-3, 0, -5], [3, 0, -5]].forEach(([x, y, z]) => {
      const geo = new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a0800, roughness: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.4, z);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      group.add(mesh);
    });
    [-4, 0, 4].forEach((x, i) => {
      const light = new THREE.PointLight(0xff4400, 1.8, 9);
      light.position.set(x, 0.5, -2);
      group.add(light);
      bgObjects.push({ mesh: light, type: 'lava', phase: i * 1.1 });
    });
    addFloatingParticles(group, 0xff6600, 60, true);
  }

  function buildSpaceBg(group, def) {
    const starGeo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < 400; i++) {
      verts.push(
        (Math.random() - 0.5) * 70,
        (Math.random() - 0.5) * 45 + 10,
        -5 - Math.random() * 35
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeo, starMat);
    group.add(stars);
    bgObjects.push({ mesh: stars, type: 'rotate', speed: 0.0002 });

    [-7, 7].forEach((x, i) => {
      const geo = new THREE.PlaneGeometry(2.5, 4.5);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6600cc, emissive: 0x6600cc, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 2.25, -4);
      group.add(mesh);
      bgObjects.push({ mesh, type: 'pulse', phase: i * 1.5 });
    });

    const ringGeo = new THREE.TorusGeometry(5.5, 0.045, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x6600cc, emissive: 0x6600cc, emissiveIntensity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 5, -9);
    ring.rotation.x = Math.PI / 4;
    group.add(ring);
    bgObjects.push({ mesh: ring, type: 'rotate', speed: 0.006 });
  }

  function buildVoidBg(group, def) {
    const matColors = [0x00ffaa, 0x00ff66, 0x00cc88];
    for (let i = 0; i < 24; i++) {
      const x = (Math.random() - 0.5) * 24;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -1, -5), new THREE.Vector3(x, 9, -5),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: matColors[i % matColors.length],
        transparent: true, opacity: 0.1 + Math.random() * 0.2,
      });
      group.add(new THREE.Line(geo, mat));
      bgObjects.push({ mesh: group.children[group.children.length - 1], type: 'fade', phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() });
    }

    const coreGeo = new THREE.IcosahedronGeometry(1.1, 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.6, wireframe: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 5, -9);
    group.add(core);
    bgObjects.push({ mesh: core, type: 'rotate', speed: 0.022 });
    bgObjects.push({ mesh: core, type: 'pulse', phase: 0 });

    for (let i = 0; i < 12; i++) {
      const geo = new THREE.PlaneGeometry(1.3, 1.3);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.35,
        transparent: true, opacity: 0.18,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((Math.random() - 0.5) * 18, 0.02, (Math.random() - 0.5) * 7);
      group.add(mesh);
      bgObjects.push({ mesh, type: 'glitch', phase: Math.random() * Math.PI * 2 });
    }
  }

  // ─── FLOATING PARTICLES ──────────────────────────────────
  function addFloatingParticles(group, color, count) {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < count; i++) {
      verts.push(
        (Math.random() - 0.5) * 20, Math.random() * 8, -2 - Math.random() * 7
      );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.07, transparent: true, opacity: 0.75 });
    const pts = new THREE.Points(geo, mat);
    group.add(pts);
    bgObjects.push({ mesh: pts, type: 'float', speed: 0.003 });
  }

  // ─── HIT PARTICLES (Street Fighter style) ────────────────
  /**
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} color
   * @param {number} count
   * @param {'normal'|'heavy'|'combo'} type
   */
  function spawnHitParticles(worldX, worldY, color = 0xffffff, count = 16, type = 'normal') {
    const isCombo  = type === 'combo';
    const isHeavy  = type === 'heavy';
    const size     = isCombo ? 0.12 : isHeavy ? 0.09 : 0.065;
    const speedMul = isCombo ? 1.6  : isHeavy ? 1.25 : 1.0;
    const life     = isCombo ? 1.4  : isHeavy ? 1.1  : 0.9;

    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(size, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(worldX, worldY, 0.6);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = (0.05 + Math.random() * 0.07) * speedMul;
      scene.add(mesh);
      hitParticles.push({
        mesh, life: life,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75 + 0.03,
        vz: (Math.random() - 0.5) * 0.05,
        gravity: -0.004,
      });
    }

    // Impact point light burst
    const impactLight = new THREE.PointLight(color, isCombo ? 8 : isHeavy ? 5 : 3.5, 5);
    impactLight.position.set(worldX, worldY, 0.5);
    scene.add(impactLight);
    hitParticles.push({
      mesh: impactLight, life: 0.22,
      vx: 0, vy: 0, vz: 0, gravity: 0,
      isLight: true,
    });
  }

  // ─── DUST PARTICLES (landing) ────────────────────────────
  function spawnDustParticles(worldX) {
    for (let i = 0; i < 10; i++) {
      const geo  = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4);
      const mat  = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (Math.random() - 0.5) * Math.PI;
      const speed = 0.02 + Math.random() * 0.04;
      mesh.position.set(worldX + (Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.3);
      scene.add(mesh);
      dustParticles.push({
        mesh, life: 0.8,
        vx: Math.cos(angle) * speed,
        vy: 0.012 + Math.random() * 0.01,
        vz: Math.sin(angle) * speed * 0.3,
        gravity: -0.0012,
      });
    }
  }

  // ─── SCREEN FLASH (Three.js quad, no DOM) ────────────────
  /**
   * @param {number} color  - hex color
   * @param {number} alpha  - peak opacity (0..1)
   * @param {number} ms     - duration in ms
   */
  function triggerFlash3D(color = 0xffffff, alpha = 0.55, ms = 90) {
    if (!flashMesh) return;
    flashMesh.material.color.setHex(color);
    flashMesh.material.opacity  = alpha;
    flashTimer    = ms;
    flashDuration = ms;
    flashStartAlpha = alpha;
  }

  // ─── CAMERA SYSTEM ───────────────────────────────────────
  function updateCamera(p1x, aix, dt) {
    const midX  = (p1x + aix) * 0.5;
    const distX = Math.abs(aix - p1x);

    const targetZ = 8.5 + distX * 0.6;   // 8.5–14 range
    const targetY = 3.0 + distX * 0.055; // slight up tilt when spread
    const lerpK   = Math.min(dt * 5, 0.15);

    camSmoothX += (midX  - camSmoothX) * lerpK;
    camSmoothY += (targetY - camSmoothY) * lerpK;
    camSmoothZ += (targetZ - camSmoothZ) * 0.06;

    // Camera shake
    const sx = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;
    const sy = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount * 0.4 : 0;
    if (shakeAmount > 0) shakeAmount *= 0.80;
    if (shakeAmount < 0.004) shakeAmount = 0;

    // Subtle "breathing" oscillation
    const t = clock.elapsedTime;
    const breathY = Math.sin(t * 0.4) * 0.025;

    camera.position.x = camSmoothX + sx;
    camera.position.y = camSmoothY + sy + breathY;
    camera.position.z = camSmoothZ;
    camera.lookAt(camSmoothX, 1.8, 0);
  }

  function triggerShake(amount = 0.3) {
    shakeAmount = Math.max(shakeAmount, amount);
  }

  // ─── ANIMATE BACKGROUND OBJECTS ──────────────────────────
  function animateBg(t) {
    bgObjects.forEach(obj => {
      if (!obj.mesh) return;
      switch (obj.type) {
        case 'pulse':
          if (obj.mesh.material) {
            if (obj.mesh.material.emissiveIntensity !== undefined)
              obj.mesh.material.emissiveIntensity = 0.3 + Math.sin(t * 2.2 + (obj.phase || 0)) * 0.28;
            if (obj.mesh.material.opacity !== undefined)
              obj.mesh.material.opacity = 0.2 + Math.sin(t * 1.6 + (obj.phase || 0)) * 0.16;
          }
          break;
        case 'flicker':
          if (obj.mesh.isLight)
            obj.mesh.intensity = 1.2 + Math.sin(t * 9 + (obj.phase || 0)) * 0.6 + Math.random() * 0.25;
          break;
        case 'lava':
          if (obj.mesh.isLight)
            obj.mesh.intensity = 1.5 + Math.sin(t * 3.5 + (obj.phase || 0)) * 1.0;
          else if (obj.mesh.material)
            obj.mesh.material.emissiveIntensity = 0.9 + Math.sin(t * 4.5 + (obj.phase || 0)) * 0.6;
          break;
        case 'rotate':
          obj.mesh.rotation.y += obj.speed || 0.005;
          break;
        case 'float':
          obj.mesh.position.y = Math.sin(t * (obj.speed || 0.003) * 200) * 0.3;
          break;
        case 'fade':
          if (obj.mesh.material)
            obj.mesh.material.opacity = 0.05 + Math.abs(Math.sin(t * (obj.speed || 1) + (obj.phase || 0))) * 0.28;
          break;
        case 'glitch':
          if (Math.random() < 0.025 && obj.mesh.material)
            obj.mesh.material.opacity = Math.random() < 0.5 ? 0 : 0.28;
          break;
      }
    });
  }

  // ─── UPDATE HIT PARTICLES ────────────────────────────────
  function updateHitParticles() {
    const FADE = 0.045;
    for (let i = hitParticles.length - 1; i >= 0; i--) {
      const p = hitParticles[i];
      p.life -= FADE;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        if (!p.isLight) {
          if (p.mesh.geometry) p.mesh.geometry.dispose();
          if (p.mesh.material) p.mesh.material.dispose();
        }
        hitParticles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;
      p.vy += p.gravity;
      if (p.isLight) {
        p.mesh.intensity = p.life * 8;
      } else {
        p.mesh.material.opacity = p.life;
        p.mesh.scale.setScalar(p.life * 0.7 + 0.3);
      }
    }
  }

  // ─── UPDATE DUST PARTICLES ───────────────────────────────
  function updateDustParticles() {
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const p = dustParticles[i];
      p.life -= 0.03;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        dustParticles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;
      p.vy += p.gravity;
      p.mesh.material.opacity = p.life * 0.6;
      p.mesh.scale.setScalar(1 + (1 - p.life) * 1.5);
    }
  }

  // ─── UPDATE FLASH ────────────────────────────────────────
  function updateFlash(dtMs) {
    if (flashTimer <= 0 || !flashMesh) return;
    flashTimer -= dtMs * 1000;
    const ratio = Math.max(0, flashTimer / flashDuration);
    flashMesh.material.opacity = flashStartAlpha * ratio;
    if (flashTimer <= 0) flashMesh.material.opacity = 0;
  }

  // ─── RENDER ──────────────────────────────────────────────
  function render(p1x, aix) {
    const dt = clock.getDelta();
    const t  = clock.elapsedTime;

    animateBg(t);
    updateHitParticles();
    updateDustParticles();
    updateFlash(dt);
    updateCamera(p1x, aix, dt);

    renderer.render(scene, camera);
  }

  // ─── PUBLIC API ──────────────────────────────────────────
  return {
    init,
    resize,
    buildLevel,
    render,
    triggerShake,
    triggerFlash3D,
    spawnHitParticles,
    spawnDustParticles,
    getScene()     { return scene; },
    getLevelDefs() { return LEVEL_DEFS; },
  };

})();
