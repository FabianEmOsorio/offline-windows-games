  // 8. INICIALIZACIÓN WEBGL2 Y BUCLE PRINCIPAL
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true });
    if (!gl) {
      alert('Tu navegador no soporta WebGL2.');
      return;
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    function createShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }
    function createProgram(vsSrc, fsSrc) {
      const p = gl.createProgram();
      const vs = createShader(gl.VERTEX_SHADER, vsSrc);
      const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(p));
      }
      return p;
    }

    const progScene         = createProgram(VS_SCENE, FS_SCENE);
    const progShadow        = createProgram(VS_SHADOW, FS_SHADOW);
    const progSkinned       = createProgram(VS_SKINNED, FS_SKINNED);
    const progShadowSkinned = createProgram(VS_SHADOW_SKINNED, FS_SHADOW);
    const progLine          = createProgram(VS_LINE, FS_LINE);
    const progPost          = createProgram(VS_POST, FS_GODRAYS);

    // Mallas Estáticas Base + Malla Continua Deformable del Operador
    const meshBox      = makeUnitBox(gl);
    const meshWheel    = buildWheelMesh(gl, 0.45, 0.36, 16);
    const meshCylY     = buildCylinderY(gl, 0.5, 1.0, 14);
    const meshMassif   = buildChampsaurMassif(gl);
    const meshLarchTrunk  = buildAutumnLarchTrunk(gl);
    const meshLarchLeaves = buildAutumnLarchLeaves(gl);
    const meshGrassCarpet = buildGrassCarpetMesh(gl);
    const meshPiornal     = buildPiornalBush(gl);
    const meshPineTrunk   = buildScotsPineTrunk(gl);
    const meshPineLeaves  = buildScotsPineLeaves(gl);
    const meshBoulder  = buildGraniteBoulder(gl);

    let currentMeshRes = 'high';
    const operatorVAOCache = {};
    function getOperatorVAO(resKey) {
      if (!operatorVAOCache[resKey]) {
        operatorVAOCache[resKey] = uploadSkinnedVAO(gl, buildContinuousSkinnedOperatorMesh(resKey));
      }
      return operatorVAOCache[resKey];
    }
    getOperatorVAO('high');

    // Buffer dinámico para trazadoras balísticas
    const tracerVao = gl.createVertexArray();
    const tracerBuf = gl.createBuffer();
    gl.bindVertexArray(tracerVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, tracerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 24 * 64, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Buffers Instanciados GPU
    ChunkManager.bufGrass   = gl.createBuffer();
    ChunkManager.bufPiornal = gl.createBuffer();
    ChunkManager.bufLarch   = gl.createBuffer();
    ChunkManager.bufPine    = gl.createBuffer();
    ChunkManager.bufBoulder = gl.createBuffer();

    function attachInstancedAttrs(mesh, buf) {
      gl.bindVertexArray(mesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 4 * 4);
      gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
    }
    attachInstancedAttrs(meshGrassCarpet, ChunkManager.bufGrass);
    attachInstancedAttrs(meshPiornal,     ChunkManager.bufPiornal);
    attachInstancedAttrs(meshLarchTrunk,  ChunkManager.bufLarch);
    attachInstancedAttrs(meshLarchLeaves, ChunkManager.bufLarch);
    attachInstancedAttrs(meshPineTrunk,   ChunkManager.bufPine);
    attachInstancedAttrs(meshPineLeaves,  ChunkManager.bufPine);
    attachInstancedAttrs(meshBoulder,     ChunkManager.bufBoulder);

    // Shadow Map FBO (2048x2048)
    const SHADOW_RES = 2048;
    const shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fboShadow = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let sceneTex, sceneDepth, fboScene;
    function resizeFBO() {
      canvas.width = Math.max(1, window.innerWidth);
      canvas.height = Math.max(1, window.innerHeight);
      gl.viewport(0, 0, canvas.width, canvas.height);

      if (fboScene) gl.deleteFramebuffer(fboScene);
      if (sceneTex) gl.deleteTexture(sceneTex);
      if (sceneDepth) gl.deleteRenderbuffer(sceneDepth);

      fboScene = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);

      sceneTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);

      sceneDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, canvas.width, canvas.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    resizeFBO();
    window.addEventListener('resize', resizeFBO);

    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ESTADO DEL JUEGO Y ATMÓSFERA VALLE DE CHAMPSAUR
    let controlMode = 0; // 0=A pie, 1=Buggy, 2=Heli
    let visionMode = 0;  // 0=Día, 1=NVG, 2=FLIR
    let todIndex = 0;
    let timeOfDayHours = 15.5;
    let dayCycleEnabled = false;
    let dayCycleSpeed = 1.2;
    let cloudDensity = 0.65;
    let windIntensity = 0.58;
    let renderDistance = 1800.0;
    let mouseSens = 0.0035;
    let invertPitch = false;
    let toggleAdsMode = false;
    let adsHoldState = false;
    let adsToggleState = false;
    let fireHeld = false;
    let altFreeEnabled = true;
    let sssEnabled = true;
    let isMenuOpen = false;
    let activeModalTab = 'tabSettings';
    let isAltHeld = false;
    let controlsOverlayVisible = false;

    const ATMOS = [
      { label: 'TARDE DORADA CHAMPSAUR', hour: 15.5, sunDir: [0.52, 0.34, -0.78], sunCol: [1.22, 0.96, 0.76], skyAmb: [0.42, 0.52, 0.65], grdAmb: [0.22, 0.20, 0.16], fog: [0.68, 0.74, 0.82] },
      { label: 'MEDIODÍA ALPINO',        hour: 12.5, sunDir: [0.22, 0.88, -0.42], sunCol: [1.18, 1.15, 1.05], skyAmb: [0.48, 0.58, 0.70], grdAmb: [0.20, 0.22, 0.18], fog: [0.72, 0.82, 0.90] },
      { label: 'CREPÚSCULO DE SIERRA',   hour: 18.4, sunDir: [0.78, 0.16, -0.60], sunCol: [1.30, 0.66, 0.36], skyAmb: [0.32, 0.28, 0.45], grdAmb: [0.14, 0.12, 0.15], fog: [0.55, 0.38, 0.42] },
      { label: 'NOCHE TÁCTICA',          hour: 23.0, sunDir: [0.35, 0.45, -0.82], sunCol: [0.16, 0.20, 0.30], skyAmb: [0.08, 0.10, 0.16], grdAmb: [0.04, 0.05, 0.06], fog: [0.05, 0.07, 0.12] }
    ];

    function computeAtmosphereAtHour(h) {
      const hr = ((h % 24) + 24) % 24;
      const angle = ((hr - 6.0) / 12.0) * Math.PI; // 6am=0, 12pm=PI/2, 18pm=PI
      const rawSunY = Math.sin(angle);
      const dayF = Math.max(0, Math.min(1, (rawSunY + 0.12) / 0.65));
      const sunsetF = Math.exp(-Math.pow((rawSunY - 0.10) / 0.22, 2));

      // Luz de luna nocturna cuando el sol está por debajo del horizonte
      const isNight = rawSunY < -0.05;
      let sx = Math.cos(angle) * 0.84;
      let sy = isNight ? Math.max(0.28, -rawSunY * 0.65) : Math.max(0.08, rawSunY);
      let sz = -0.54;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;

      const mix3 = (a, b, t) => [a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t, a[2]*(1-t)+b[2]*t];
      const nightCol = [0.14, 0.19, 0.30], dayCol = [1.18, 1.14, 1.04], warmCol = [1.32, 0.64, 0.34];
      const nightSky = [0.07, 0.09, 0.15], daySky = [0.46, 0.56, 0.68], warmSky = [0.36, 0.30, 0.46];
      const nightGrd = [0.04, 0.05, 0.07], dayGrd = [0.21, 0.22, 0.18], warmGrd = [0.16, 0.13, 0.14];
      const nightFog = [0.04, 0.06, 0.11], dayFog = [0.71, 0.80, 0.88], warmFog = [0.58, 0.40, 0.44];

      let sunCol = mix3(nightCol, dayCol, dayF);
      let skyAmb = mix3(nightSky, daySky, dayF);
      let grdAmb = mix3(nightGrd, dayGrd, dayF);
      let fog    = mix3(nightFog, dayFog, dayF);

      sunCol = mix3(sunCol, warmCol, sunsetF * 0.72);
      skyAmb = mix3(skyAmb, warmSky, sunsetF * 0.55);
      grdAmb = mix3(grdAmb, warmGrd, sunsetF * 0.45);
      fog    = mix3(fog,    warmFog, sunsetF * 0.68);

      const label = dayF < 0.12 ? 'NOCHE TÁCTICA' : (sunsetF > 0.48 ? (hr < 12 ? 'ALBA ALPINA' : 'CREPÚSCULO DE SIERRA') : 'LUZ ALPINA');
      return { label, sunDir: [sx, sy, sz], sunCol, skyAmb, grdAmb, fog, daylightFactor: dayF };
    }

    const camera = { pos: [0, 12, 4], target: [0, 11, -20], yaw: 0.0, pitch: 0.10, dist: 2.35, fovDeg: 58 };
    const inputKeys = { forward: false, backward: false, left: false, right: false, turnLeft: false, turnRight: false, shift: false, space: false };

    // ========================================================================
    // SISTEMA DE KEYBINDS CONFIGURABLES (TECLADO + BOTONES LATERALES DE MOUSE)
    // ========================================================================
    const DEFAULT_KEYBINDS = {
      swapShoulder: { label: 'Cambiar Hombro OTS', code: 'Mouse3', altCode: 'KeyH' },
      adsAim:       { label: 'Apuntar (ADS / Lento)', code: 'Mouse2' },
      fire:         { label: 'Disparar Arma', code: 'Mouse0' },
      reload:       { label: 'Recargar / Enderezar [R]', code: 'KeyR' },
      interact:     { label: 'Subir / Sabotear [F]', code: 'KeyF' },
      spotTag:      { label: 'Marcar Objetivo (Spot)', code: 'KeyX' },
      crouch:       { label: 'Agacharse', code: 'KeyC' },
      prone:        { label: 'Cuerpo a Tierra (Prone)', code: 'KeyZ' },
      suppressor:   { label: 'Supresor QD', code: 'KeyU' },
      fireMode:     { label: 'Selector Auto / Semi', code: 'KeyB' },
      c4:           { label: 'Detonar Carga C4', code: 'KeyG' },
      nvg:          { label: 'Visor Nocturno NVG', code: 'KeyN' },
      flir:         { label: 'Visor Térmico FLIR', code: 'KeyT' },
      cycleVeh:     { label: 'Alternar Vehículo Directo', code: 'KeyV' },
      menuPause:    { label: 'Menú Pausa / Controles', code: 'Escape' },
      menuLoadout:  { label: 'Armería & Mixamo', code: 'KeyI' },
      menuVehicles: { label: 'Apoyo & Vehículos', code: 'KeyK' },
      menuMap:      { label: 'Mapa Táctico & Hora', code: 'KeyM', altCode: 'Tab' },
      controlsHint: { label: 'Guía Rápida HUD', code: 'F1' }
    };

    const Keybinds = {
      map: (() => {
        const cloned = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
        try {
          const saved = JSON.parse(localStorage.getItem('untraced_keybinds_v2') || 'null');
          if (saved) {
            for (const k of Object.keys(cloned)) {
              if (saved[k] && typeof saved[k].code === 'string') cloned[k].code = saved[k].code;
            }
          }
        } catch {}
        return cloned;
      })(),
      save: () => {
        try { localStorage.setItem('untraced_keybinds_v2', JSON.stringify(Keybinds.map)); } catch {}
      },
      prettyCode: (code) => {
        if (!code) return '-';
        if (code === 'Mouse0') return 'CLIC IZQ (M1)';
        if (code === 'Mouse1') return 'RUEDA (M3)';
        if (code === 'Mouse2') return 'CLIC DER (M2)';
        if (code === 'Mouse3') return 'PULGAR ATRÁS (M4)';
        if (code === 'Mouse4') return 'PULGAR ADELANTE (M5)';
        return code.replace(/^Key/, '').replace(/^Digit/, '').toUpperCase();
      },
      matches: (action, code) => {
        const b = Keybinds.map[action];
        if (!b) return false;
        return b.code === code || (b.altCode && b.altCode === code);
      }
    };

    let listeningActionKey = null;
    function renderKeybindGrid() {
      const grid = document.getElementById('keybindEditorGrid');
      if (!grid) return;
      grid.innerHTML = '';
      for (const [act, def] of Object.entries(Keybinds.map)) {
        const row = document.createElement('div');
        row.className = 'keybind-row';
        const lbl = document.createElement('span');
        lbl.textContent = def.label;
        const btn = document.createElement('button');
        btn.className = 'keybind-btn' + (listeningActionKey === act ? ' listening' : '');
        btn.textContent = listeningActionKey === act ? 'PRESIONA TECLA / MOUSE...' : Keybinds.prettyCode(def.code);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          listeningActionKey = (listeningActionKey === act) ? null : act;
          renderKeybindGrid();
        });
        row.appendChild(lbl);
        row.appendChild(btn);
        grid.appendChild(row);
      }
      renderControlsOverlay();
    }

    function renderControlsOverlay() {
      const box = document.getElementById('controlsOverlay');
      if (!box) return;
      box.style.display = controlsOverlayVisible ? 'grid' : 'none';
      const kb = Keybinds;
      box.innerHTML = `
        <div><b>WASD</b> Mover / Conducir &nbsp;·&nbsp; <b>SHIFT</b> Sprint / Bajar Heli &nbsp;·&nbsp; <b>ESPACIO</b> Subir Heli / Freno Mano</div>
        <div><b>${kb.prettyCode(kb.map.adsAim.code)}</b> Apuntar (ADS 50% vel.) &nbsp;·&nbsp; <b>${kb.prettyCode(kb.map.swapShoulder.code)} / H</b> Cambiar Hombro</div>
        <div><b>${kb.prettyCode(kb.map.crouch.code)}</b> Agachado · <b>${kb.prettyCode(kb.map.prone.code)}</b> Prone · <b>${kb.prettyCode(kb.map.reload.code)}</b> Recargar/Enderezar · <b>${kb.prettyCode(kb.map.spotTag.code)}</b> Marcar</div>
        <div><b>${kb.prettyCode(kb.map.interact.code)}</b> Vehículo/Sabotear · <b>${kb.prettyCode(kb.map.c4.code)}</b> C4 · <b>Q/E</b> Guiñada Heli · <b>ALT</b> Cursor</div>
      `;
    }
    renderKeybindGrid();

    document.getElementById('btnResetKeybinds').addEventListener('click', () => {
      Keybinds.map = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
      Keybinds.save();
      listeningActionKey = null;
      renderKeybindGrid();
    });

    // ========================================================================
    // ZEN BROWSER SEGURO: POINTER LOCK, BOTÓN PULGAR SIN HISTORIAL Y TECLA ALT
    // ========================================================================
    let isPointerLocked = false;
    const altToastEl = document.getElementById('altFreeToast');

    function updateLockPill() {
      const dot = document.getElementById('lockDot');
      const text = document.getElementById('lockText');
      const qr = document.getElementById('quickRibbon');
      if (isAltHeld && altFreeEnabled) {
        dot.style.background = 'var(--accent-emerald)';
        text.textContent = 'CURSOR LIBRE [ALT MANTENIDA]';
        if (qr) qr.classList.remove('locked');
      } else if (isPointerLocked) {
        dot.style.background = 'var(--accent-cyan)';
        text.textContent = 'PUNTERO EN JUEGO [ALT: SOLTAR]';
        if (qr) qr.classList.add('locked');
      } else {
        dot.style.background = 'var(--accent-amber)';
        text.textContent = 'CLIC EN PANTALLA PARA JUGAR [ALT: CURSOR]';
        if (qr) qr.classList.remove('locked');
      }
    }

    function requestGameLock() {
      if (!isMenuOpen && !(isAltHeld && altFreeEnabled) && !isPointerLocked) {
        const res = canvas.requestPointerLock && canvas.requestPointerLock();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    }

    canvas.addEventListener('click', () => requestGameLock());
    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = (document.pointerLockElement === canvas);
      updateLockPill();
    });

    window.addEventListener('mousemove', (e) => {
      if (isPointerLocked && !isMenuOpen && !(isAltHeld && altFreeEnabled)) {
        camera.yaw += e.movementX * mouseSens;
        const pitchDelta = (invertPitch ? -1 : 1) * (e.movementY * mouseSens);
        camera.pitch = Math.max(-0.55, Math.min(1.15, camera.pitch + pitchDelta));
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (isMenuOpen) return;
      e.preventDefault();
      const minD = controlMode === 0 ? 1.65 : 4.2;
      const maxD = controlMode === 0 ? 5.20 : 26.0;
      camera.dist = Math.max(minD, Math.min(maxD, camera.dist + (e.deltaY > 0 ? 0.45 : -0.45)));
    }, { passive: false });

    const modalEl = document.getElementById('tacticalModal');
    function openTab(tabId) {
      activeModalTab = tabId;
      document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.id === tabId));
      const titles = {
        tabSettings: 'PAUSA, CONTROLES & KEYBINDS',
        tabLoadout: 'ARMERÍA TÁCTICA, MALLA 3D & MIXAMO',
        tabVehicles: 'APOYO AÉREO, VEHÍCULOS & PATRULLA',
        tabEnvironment: 'MAPA TÁCTICO DE CHAMPSAUR & CLIMA'
      };
      document.getElementById('modalDynamicTitle').innerHTML = '<span>◈</span> ' + (titles[tabId] || 'MENÚ TÁCTICO');
      if (tabId === 'tabEnvironment') drawTacticalRadar();
    }

    function setTacticalMenu(open, tabId) {
      isMenuOpen = open;
      if (open && tabId) openTab(tabId);
      modalEl.classList.toggle('active', open);
      if (open) {
        adsHoldState = false; adsToggleState = false; fireHeld = false;
        Object.keys(inputKeys).forEach(k => inputKeys[k] = false);
        if (isPointerLocked) document.exitPointerLock();
      } else {
        listeningActionKey = null;
        if (!isAltHeld) requestGameLock();
      }
      updateLockPill();
    }
    openTab('tabSettings');

    document.querySelectorAll('.kb-chip[data-open-tab]').forEach(ch => {
      ch.addEventListener('click', (e) => {
        e.stopPropagation();
        setTacticalMenu(true, ch.dataset.openTab);
      });
    });

    function clearMovementInputs() {
      Object.keys(inputKeys).forEach(k => inputKeys[k] = false);
      adsHoldState = false; fireHeld = false;
    }
    window.addEventListener('blur', clearMovementInputs);

    // Capturar teclas globales (incluye Remapper, Alt para Zen Browser, Menús detrás de Keybinds y Acción)
    window.addEventListener('keydown', (e) => {
      if (listeningActionKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code !== 'Escape') {
          Keybinds.map[listeningActionKey].code = e.code;
          Keybinds.save();
        }
        listeningActionKey = null;
        renderKeybindGrid();
        return;
      }

      if (e.key === 'Alt') {
        e.preventDefault();
        if (altFreeEnabled && !isAltHeld) {
          isAltHeld = true;
          altToastEl.style.display = 'block';
          if (isPointerLocked) document.exitPointerLock();
          updateLockPill();
        }
        return;
      }

      if (Keybinds.matches('controlsHint', e.code)) {
        e.preventDefault();
        controlsOverlayVisible = !controlsOverlayVisible;
        renderControlsOverlay();
        return;
      }

      // Alternar pantallas detrás de Keybinds ([ESC], [I], [K], [M]/[TAB])
      const menuHotkeys = [
        ['menuPause', 'tabSettings'],
        ['menuLoadout', 'tabLoadout'],
        ['menuVehicles', 'tabVehicles'],
        ['menuMap', 'tabEnvironment']
      ];
      for (const [act, tid] of menuHotkeys) {
        if (Keybinds.matches(act, e.code)) {
          e.preventDefault();
          if (isMenuOpen && (act === 'menuPause' || activeModalTab === tid)) {
            setTacticalMenu(false);
          } else {
            setTacticalMenu(true, tid);
          }
          return;
        }
      }

      if (isMenuOpen) return;

      if (e.code === 'KeyW' || e.code === 'ArrowUp')    inputKeys.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown')  inputKeys.backward = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  inputKeys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') inputKeys.right = true;
      if (e.code === 'KeyQ') inputKeys.turnLeft = true;
      if (e.code === 'KeyE') inputKeys.turnRight = true;
      if (e.key === 'Shift') inputKeys.shift = true;
      if (e.code === 'Space') { e.preventDefault(); inputKeys.space = true; }

      if (e.repeat) return;

      if (Keybinds.matches('interact', e.code))     tryInteractVehicle();
      if (Keybinds.matches('swapShoulder', e.code)) Operator.swapShoulder();
      if (Keybinds.matches('crouch', e.code))       Operator.stance = (Operator.stance === 1) ? 0 : 1;
      if (Keybinds.matches('prone', e.code))        Operator.stance = (Operator.stance === 2) ? 0 : 2;
      if (Keybinds.matches('reload', e.code)) {
        if (controlMode === 1) {
          BuggyVehicle.recoverUpright();
          Operator.showBanner('BUGGY ENDEREZADO SOBRE TERRENO', 'objective');
        } else if (controlMode === 2) {
          HeliVehicle.recoverUpright();
          Operator.showBanner('HELICÓPTERO ESTABILIZADO', 'objective');
        } else {
          Operator.startReload();
        }
      }
      if (Keybinds.matches('spotTag', e.code))      trySpotTarget();
      if (Keybinds.matches('fireMode', e.code)) {
        Operator.fireMode = Operator.fireMode === 'AUTO' ? 'SEMI' : 'AUTO';
        const pm = document.getElementById('pillFireMode');
        pm.textContent = Operator.fireMode + ' [B]';
      }
      if (Keybinds.matches('suppressor', e.code)) {
        Operator.suppressor = !Operator.suppressor;
        const ps = document.getElementById('pillSuppressor');
        ps.textContent = (Operator.suppressor ? 'SUPRESOR ON' : 'SUPRESOR OFF') + ' [U]';
        ps.classList.toggle('active', Operator.suppressor);
      }
      if (Keybinds.matches('cycleVeh', e.code)) setControlMode((controlMode + 1) % 3);
      if (Keybinds.matches('nvg', e.code)) { visionMode = (visionMode === 1) ? 0 : 1; updateVisionOverlay(); }
      if (Keybinds.matches('flir', e.code)) { visionMode = (visionMode === 2) ? 0 : 2; updateVisionOverlay(); }
      if (Keybinds.matches('c4', e.code)) throwForwardC4();
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        isAltHeld = false;
        altToastEl.style.display = 'none';
        if (!isMenuOpen && altFreeEnabled) requestGameLock();
        updateLockPill();
        return;
      }
      if (e.code === 'KeyW' || e.code === 'ArrowUp')    inputKeys.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown')  inputKeys.backward = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  inputKeys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') inputKeys.right = false;
      if (e.code === 'KeyQ') inputKeys.turnLeft = false;
      if (e.code === 'KeyE') inputKeys.turnRight = false;
      if (e.key === 'Shift') inputKeys.shift = false;
      if (e.code === 'Space') inputKeys.space = false;
    });

    // Evitar navegación Atrás/Adelante en Zen Browser al pulsar botones laterales del pulgar (M4/M5)
    window.addEventListener('auxclick', (e) => {
      if (e.button >= 2) e.preventDefault();
    });

    function throwForwardC4() {
      const base = controlMode === 0 ? Operator.pos : (controlMode === 1 ? BuggyVehicle.pos : HeliVehicle.pos);
      const cp = Math.cos(camera.pitch);
      const fX = base[0] + Math.sin(camera.yaw) * cp * 16.0;
      const fZ = base[2] - Math.cos(camera.yaw) * cp * 16.0;
      const fY = TerrainSystem.getHeight(fX, fZ);
      ExplosionDecalSystem.spawn(fX, fY, fZ, 5.5);
      const bombPos = [fX, fY, fZ];
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.pos[0] - fX, u.pos[2] - fZ, (u.pos[1] - fY) * 0.7);
        if (d < 8.5) OutpostPatrol.applyDamage(u, Math.round(160 * (1 - d / 9.2)), false, base);
      }
      for (const br of ExplosiveBarrels.list) {
        if (br.alive && Math.hypot(br.pos[0] - fX, br.pos[2] - fZ) < 7.5) ExplosiveBarrels.detonate(br);
      }
      if (OutpostGenerator.alive && Math.hypot(OutpostGenerator.pos[0] - fX, OutpostGenerator.pos[2] - fZ) < 7.0) {
        OutpostGenerator.sabotage(true);
      }
      OutpostPatrol.alertArea(bombPos, 95.0, false);
    }

    function trySpotTarget(playChime = true) {
      const aimOrig = camera.rayOrigin || camera.pos;
      const cp = Math.cos(camera.pitch);
      const aimDir = camera.lookDir || V3.norm([Math.sin(camera.yaw) * cp, -Math.sin(camera.pitch), -Math.cos(camera.yaw) * cp]);
      let found = 0;
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const tp = [u.pos[0], u.pos[1] + 1.25, u.pos[2]];
        const v = V3.sub(tp, aimOrig);
        const dist = Math.hypot(v[0], v[1], v[2]) || 1;
        if (dist > 220) continue;
        const dot = (v[0] * aimDir[0] + v[1] * aimDir[1] + v[2] * aimDir[2]) / dist;
        if (dot > 0.96 && !u.spotted) {
          u.spotted = true;
          found++;
        }
      }
      for (const br of ExplosiveBarrels.list) {
        if (!br.alive || br.spotted) continue;
        const v = V3.sub(br.pos, aimOrig);
        const dist = Math.hypot(v[0], v[1], v[2]) || 1;
        const dot = (v[0] * aimDir[0] + v[1] * aimDir[1] + v[2] * aimDir[2]) / dist;
        if (dot > 0.955 && dist < 170) { br.spotted = true; found++; }
      }
      if (found > 0 && playChime) SoundEngine.playSpotMark();
    }

    function tryFireWeapon() {
      if (controlMode !== 0 || Operator.reloadTimer > 0) return false;
      if (Operator.mag <= 0) {
        Operator.startReload();
        return false;
      }
      if (Operator.fireCooldown > 0) return false;

      const isSniper = Operator.custom.weapon === 'm40a5';
      const baseDmg = isSniper ? 105 : 42;
      Operator.mag--;
      Operator.recoil = Math.min(1.0, Operator.recoil + (isSniper ? 0.95 : 0.42));
      Operator.fireCooldown = isSniper ? 0.78 : (Operator.fireMode === 'AUTO' ? 0.105 : 0.16);
      SoundEngine.playGunshot(Operator.suppressor, isSniper);

      // Rayo desde centro exacto de retícula (pivot OTS -> dirección lookForward)
      const aimOrig = camera.rayOrigin || camera.pos;
      const aimDir  = camera.lookDir || [Math.sin(camera.yaw), -Math.sin(camera.pitch), -Math.cos(camera.yaw)];

      // 1. Obstáculos duros del mundo (relieve alpino, muros de base, árboles, rocas)
      const farEnd = [aimOrig[0] + aimDir[0] * 240, aimOrig[1] + aimDir[1] * 240, aimOrig[2] + aimDir[2] * 240];
      const worldHit = WorldColliders.raycastObstruction(aimOrig[0], aimOrig[1], aimOrig[2], farEnd[0], farEnd[1], farEnd[2], true);
      let bestT = worldHit.blocked ? worldHit.hitDist : 240.0;
      let hitUnit = null;
      let hitHead = false;
      let hitKind = null;

      const testSphere = (cx, cy, cz, rad) => {
        const ox = cx - aimOrig[0], oy = cy - aimOrig[1], oz = cz - aimOrig[2];
        const proj = ox * aimDir[0] + oy * aimDir[1] + oz * aimDir[2];
        if (proj <= 0 || proj >= bestT) return -1;
        const dSq = (ox * ox + oy * oy + oz * oz) - proj * proj;
        return (dSq <= rad * rad) ? proj : -1;
      };

      // 2. Insurgentes / Tropas IA (Cabeza animada exacta vs Torso animado)
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const hc = u.headWorld || [u.pos[0], u.pos[1] + 1.62, u.pos[2]];
        const tc = u.torsoWorld || [u.pos[0], u.pos[1] + 1.12, u.pos[2]];
        const th = testSphere(hc[0], hc[1], hc[2], 0.24);
        if (th > 0 && th < bestT) { bestT = th; hitUnit = u; hitHead = true; hitKind = 'unit'; }
        const tt = testSphere(tc[0], tc[1], tc[2], 0.44);
        if (tt > 0 && tt < bestT) { bestT = tt; hitUnit = u; hitHead = false; hitKind = 'unit'; }
      }

      // 3. Barriles explosivos en el puesto avanzado
      for (const br of ExplosiveBarrels.list) {
        if (!br.alive) continue;
        const tb = testSphere(br.pos[0], br.pos[1] + 0.55, br.pos[2], 0.58);
        if (tb > 0 && tb < bestT) { bestT = tb; hitUnit = br; hitKind = 'barrel'; }
      }

      // 4. Estación generadora saboteable
      if (OutpostGenerator.alive) {
        const tg = testSphere(OutpostGenerator.pos[0], OutpostGenerator.pos[1] + 0.9, OutpostGenerator.pos[2], 1.25);
        if (tg > 0 && tg < bestT) { bestT = tg; hitUnit = OutpostGenerator; hitKind = 'generator'; }
      }

      const endPt = [aimOrig[0] + aimDir[0]*bestT, aimOrig[1] + aimDir[1]*bestT, aimOrig[2] + aimDir[2]*bestT];
      TracerSystem.spawn(Operator.muzzleWorld, endPt, !!hitUnit, false);

      if (hitKind === 'unit' && hitUnit) {
        OutpostPatrol.applyDamage(hitUnit, hitHead ? 150 : baseDmg, hitHead, Operator.pos);
      } else if (hitKind === 'barrel' && hitUnit) {
        hitUnit.hp -= baseDmg;
        Operator.hitMarkerTimer = 0.14;
        Operator.hitMarkerKill = false;
        SoundEngine.playHitMarker(false, false);
        if (hitUnit.hp <= 0) ExplosiveBarrels.detonate(hitUnit);
      } else if (hitKind === 'generator') {
        OutpostGenerator.hp -= baseDmg;
        Operator.hitMarkerTimer = 0.14;
        SoundEngine.playHitMarker(false, false);
        if (OutpostGenerator.hp <= 0) OutpostGenerator.sabotage(true);
      }

      // Ruido táctico de disparo (silenciador reduce alcance a 16m!)
      OutpostPatrol.alertArea(Operator.pos, Operator.suppressor ? 16.0 : 88.0, false);
      return true;
    }

    window.addEventListener('mousedown', (e) => {
      const mCode = 'Mouse' + e.button;
      if (listeningActionKey) {
        e.preventDefault();
        e.stopPropagation();
        Keybinds.map[listeningActionKey].code = mCode;
        Keybinds.save();
        listeningActionKey = null;
        renderKeybindGrid();
        return;
      }

      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
      }
      if (isMenuOpen || (isAltHeld && altFreeEnabled)) return;

      if (Keybinds.matches('swapShoulder', mCode)) {
        Operator.swapShoulder();
        return;
      }
      if (Keybinds.matches('adsAim', mCode)) {
        if (toggleAdsMode) adsToggleState = !adsToggleState;
        else adsHoldState = true;
        return;
      }
      if (Keybinds.matches('fire', mCode) && e.target === canvas) {
        if (!isPointerLocked) { requestGameLock(); return; }
        fireHeld = true;
        tryFireWeapon();
        if (Operator.fireMode === 'SEMI' || Operator.custom.weapon === 'm40a5') fireHeld = false;
        return;
      }
      if (e.button >= 3) {
        if (Keybinds.matches('c4', mCode)) throwForwardC4();
        else if (Keybinds.matches('reload', mCode)) Operator.startReload();
      }
    });

    window.addEventListener('mouseup', (e) => {
      const mCode = 'Mouse' + e.button;
      if (Keybinds.matches('adsAim', mCode) && !toggleAdsMode) adsHoldState = false;
      if (Keybinds.matches('fire', mCode)) fireHeld = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function setControlMode(mode) {
      controlMode = mode;
      const pills = ['A PIE', 'BUGGY 4X4', 'LITTLE BIRD'];
      document.getElementById('modePill').textContent = pills[mode];
      document.getElementById('interactPrompt').style.display = 'none';
      if (mode === 0) camera.dist = 2.35;
      if (mode === 1) { camera.dist = 7.6; camera.yaw = BuggyVehicle.yaw; }
      if (mode === 2) { camera.dist = 11.5; camera.yaw = HeliVehicle.yaw; }
    }

    function tryInteractVehicle() {
      if (controlMode === 0) {
        const dGen = Math.hypot(Operator.pos[0] - OutpostGenerator.pos[0], Operator.pos[2] - OutpostGenerator.pos[2]);
        if (OutpostGenerator.alive && dGen < 3.8) {
          OutpostGenerator.sabotage(false);
          return;
        }
        const dB = Math.hypot(Operator.pos[0] - BuggyVehicle.pos[0], Operator.pos[2] - BuggyVehicle.pos[2]);
        const dH = Math.hypot(Operator.pos[0] - HeliVehicle.pos[0], Operator.pos[2] - HeliVehicle.pos[2]);
        if (dB < 5.0) setControlMode(1);
        else if (dH < 6.2) setControlMode(2);
      } else if (controlMode === 1) {
        Operator.pos[0] = BuggyVehicle.pos[0] - Math.cos(BuggyVehicle.yaw) * 2.5;
        Operator.pos[2] = BuggyVehicle.pos[2] - Math.sin(BuggyVehicle.yaw) * 2.5;
        setControlMode(0);
      } else if (controlMode === 2) {
        const gh = TerrainSystem.getHeight(HeliVehicle.pos[0], HeliVehicle.pos[2]);
        if (HeliVehicle.isLanded || HeliVehicle.pos[1] < gh + 3.5) {
          Operator.pos[0] = HeliVehicle.pos[0] + 3.2;
          Operator.pos[2] = HeliVehicle.pos[2] + 2.0;
          setControlMode(0);
        }
      }
    }

    function updateVisionOverlay() {
      const ov = document.getElementById('postOverlay');
      ov.className = visionMode === 1 ? 'nvg' : (visionMode === 2 ? 'flir' : '');
      const visPill = document.getElementById('pillVision');
      visPill.textContent = ['DÍA [N/T]', 'NVG GPNVG [N]', 'FLIR TÉRMICO [T]'][visionMode];
    }

    // UI DEL MODAL TÁCTICO Y CONFIGURACIÓN
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => openTab(btn.dataset.tab));
    });
    document.getElementById('btnCloseModal').addEventListener('click', () => setTacticalMenu(false));
    document.getElementById('btnResumeGame').addEventListener('click', () => setTacticalMenu(false));
    document.getElementById('btnToggleControlsHint').addEventListener('click', (e) => {
      e.stopPropagation();
      controlsOverlayVisible = !controlsOverlayVisible;
      renderControlsOverlay();
    });
    document.getElementById('btnLockStatus').addEventListener('click', () => {
      if (isPointerLocked) document.exitPointerLock();
      else requestGameLock();
    });

    function bindOptionGroup(containerId, callback) {
      const cards = document.querySelectorAll(`#${containerId} .opt-card`);
      cards.forEach(c => {
        c.addEventListener('click', () => {
          cards.forEach(x => x.classList.remove('selected'));
          c.classList.add('selected');
          callback(c);
        });
      });
    }

    bindOptionGroup('optCamo', (c) => { Operator.custom.camo = c.dataset.camo; });
    bindOptionGroup('optHead', (c) => { Operator.custom.head = c.dataset.head; });
    bindOptionGroup('optWeapon', (c) => {
      Operator.custom.weapon = c.dataset.weapon;
      const isMk = c.dataset.weapon === 'mk17';
      Operator.maxMag = isMk ? 20 : 5;
      Operator.mag = Operator.maxMag;
      Operator.reserve = isMk ? 120 : 40;
      document.getElementById('weaponName').textContent = isMk ? 'MK17 SCAR-H 7.62MM' : 'M40A5 SNIPER 7.62MM';
      document.getElementById('weaponSpecs').textContent = isMk ? '7.62x51 NATO // MIRA HOLOGRÁFICA EOTECH' : 'FRANCOTIRADOR // ÓPTICA LPVO SCHMIDT & BENDER';
    });
    bindOptionGroup('optTod', (c) => {
      todIndex = parseInt(c.dataset.tod, 10);
      dayCycleEnabled = false;
      const chkDC = document.getElementById('chkDayCycle');
      if (chkDC) chkDC.checked = false;
      if (ATMOS[todIndex] && ATMOS[todIndex].hour !== undefined) timeOfDayHours = ATMOS[todIndex].hour;
    });

    document.querySelectorAll('[data-mesh-res]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mesh-res]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMeshRes = btn.dataset.meshRes;
        getOperatorVAO(currentMeshRes);
      });
    });

    document.getElementById('chkFootIK').addEventListener('change', e => ikSettings.foot = e.target.checked);
    document.getElementById('chkHandIK').addEventListener('change', e => ikSettings.hand = e.target.checked);
    document.getElementById('chkLookIK').addEventListener('change', e => ikSettings.look = e.target.checked);

    document.getElementById('slCloudDensity').addEventListener('input', e => {
      cloudDensity = parseInt(e.target.value, 10) / 100.0;
      document.getElementById('valCloudDensity').textContent = e.target.value + '%';
    });
    document.getElementById('slWind').addEventListener('input', e => {
      windIntensity = parseInt(e.target.value, 10) / 100.0;
      document.getElementById('valWind').textContent = e.target.value + '%';
    });
    const chkDayCycle = document.getElementById('chkDayCycle');
    if (chkDayCycle) {
      chkDayCycle.addEventListener('change', e => { dayCycleEnabled = e.target.checked; });
    }
    const slCycleSpeed = document.getElementById('slCycleSpeed');
    if (slCycleSpeed) {
      slCycleSpeed.addEventListener('input', e => {
        dayCycleSpeed = parseInt(e.target.value, 10) / 10.0;
        document.getElementById('valCycleSpeed').textContent = dayCycleSpeed.toFixed(1) + 'x';
      });
    }
    document.getElementById('slRenderDist').addEventListener('input', e => {
      renderDistance = parseFloat(e.target.value);
      document.getElementById('valRenderDist').textContent = renderDistance + 'm';
      document.getElementById('distText').textContent = renderDistance.toLocaleString() + ' M';
    });
    document.getElementById('slSens').addEventListener('input', e => {
      mouseSens = (parseInt(e.target.value, 10) / 100.0) * 0.0075 + 0.001;
      document.getElementById('valSens').textContent = e.target.value;
    });
    document.getElementById('chkInvertY').addEventListener('change', e => invertPitch = e.target.checked);
    document.getElementById('chkToggleAds').addEventListener('change', e => {
      toggleAdsMode = e.target.checked;
      adsHoldState = false; adsToggleState = false;
    });
    document.getElementById('chkAltFree').addEventListener('change', e => {
      altFreeEnabled = e.target.checked;
      if (!altFreeEnabled) { isAltHeld = false; altToastEl.style.display = 'none'; }
      updateLockPill();
    });
    document.getElementById('chkSSS').addEventListener('change', e => sssEnabled = e.target.checked);
    document.getElementById('chkAudio').addEventListener('change', e => SoundEngine.toggle(e.target.checked));

    document.getElementById('btnSpawnBuggy').addEventListener('click', () => { setControlMode(1); setTacticalMenu(false); });
    document.getElementById('btnSpawnHeli').addEventListener('click', () => { setControlMode(2); setTacticalMenu(false); });
    document.getElementById('btnSpawnFoot').addEventListener('click', () => { setControlMode(0); setTacticalMenu(false); });
    document.getElementById('btnRecallVehicles').addEventListener('click', () => {
      const p = Operator.pos;
      BuggyVehicle.pos = [p[0] + 5, TerrainSystem.getHeight(p[0]+5, p[2]-4), p[2] - 4];
      HeliVehicle.pos = [p[0] - 8, TerrainSystem.getHeight(p[0]-8, p[2]-6), p[2] - 6];
      setTacticalMenu(false);
    });
    document.getElementById('btnResetTargets').addEventListener('click', () => {
      OutpostPatrol.reset();
      drawTacticalRadar();
    });

    // Dropzone & UI del Importador Offline Mixamo (.glb / .gltf)
    const glbDrop = document.getElementById('glbDropZone');
    const glbInput = document.getElementById('glbFileInput');
    const glbReport = document.getElementById('glbReport');
    const glbActions = document.getElementById('glbClipActions');
    const selClip = document.getElementById('selImportedClip');

    function handleGLBFile(file) {
      if (!file) return;
      const rdr = new FileReader();
      rdr.onload = () => {
        try {
          const info = parseGLTFOrGLB(rdr.result);
          parsedImportedClips = info.clips;
          glbReport.innerHTML = `<span style="color:var(--accent-emerald);">✓ "${file.name}"</span> · Nodos: ${info.nodeCount} · Huesos emparejados: ${info.matchedBones}/19 · Clips Mixamo: [${info.animNames.join(', ') || 'ninguno'}]`;
          selClip.innerHTML = '';
          if (info.animNames.length) {
            info.animNames.forEach(nm => {
              const opt = document.createElement('option');
              opt.value = nm; opt.textContent = nm + ` (${info.clips[nm].dur.toFixed(2)}s)`;
              selClip.appendChild(opt);
            });
            glbActions.style.display = 'flex';
          } else {
            glbActions.style.display = 'none';
          }
        } catch (err) {
          glbReport.innerHTML = `<span style="color:var(--accent-red);">✕ Error leyendo GLB/GLTF: ${err.message}</span>`;
        }
      };
      rdr.readAsArrayBuffer(file);
    }
    glbDrop.addEventListener('click', () => glbInput.click());
    glbDrop.addEventListener('dragover', e => { e.preventDefault(); glbDrop.style.borderColor = 'var(--accent-cyan)'; });
    glbDrop.addEventListener('dragleave', () => glbDrop.style.borderColor = 'var(--panel-border)');
    glbDrop.addEventListener('drop', e => {
      e.preventDefault();
      glbDrop.style.borderColor = 'var(--panel-border)';
      if (e.dataTransfer.files[0]) handleGLBFile(e.dataTransfer.files[0]);
    });
    glbInput.addEventListener('change', e => { if (e.target.files[0]) handleGLBFile(e.target.files[0]); });

    document.getElementById('btnApplyImportedClip').addEventListener('click', () => {
      const nm = selClip.value;
      if (nm && parsedImportedClips[nm]) {
        customMixamoClip.active = true;
        customMixamoClip.name = nm;
        customMixamoClip.clip = parsedImportedClips[nm];
        glbReport.innerHTML += ` · <b style="color:var(--accent-amber);">ACTIVO: ${nm}</b>`;
      }
    });
    document.getElementById('btnClearImportedClip').addEventListener('click', () => {
      customMixamoClip.active = false;
      customMixamoClip.clip = null;
      glbReport.textContent = 'Clips integrados activos: Mixamo Idle / Walk / Run + mezcla táctica ADS / Agachado / Prone / Recarga.';
    });
    document.getElementById('btnDownloadImportedJS').addEventListener('click', () => {
      if (!Object.keys(parsedImportedClips).length) return;
      const blob = new Blob([`const IMPORTED_MIXAMO_CLIPS = ${JSON.stringify(parsedImportedClips)};`], { type: 'application/javascript' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mixamo_custom_clips.js';
      a.click();
    });


    // ========================================================================
    // RADAR TÁCTICO DE SECTOR [M]
    // ========================================================================
    function drawTacticalRadar() {
      const c = document.getElementById('tacticalMapCanvas');
      if (!c) return;
      const ctx = c.getContext('2d');
      const W = c.width, H = c.height;
      ctx.fillStyle = '#07111a';
      ctx.fillRect(0, 0, W, H);

      const cx = Operator.pos[0], cz = Operator.pos[2];
      const scale = 1.4; // px por metro
      function toMap(wx, wz) {
        return [W * 0.5 + (wx - cx) * scale, H * 0.5 + (wz - cz) * scale];
      }

      // Grilla de sector
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.10)';
      ctx.lineWidth = 1;
      for (let gx = -120; gx <= 120; gx += 20) {
        ctx.beginPath(); ctx.moveTo(W*0.5 + gx, 0); ctx.lineTo(W*0.5 + gx, H); ctx.stroke();
      }
      for (let gz = -120; gz <= 120; gz += 20) {
        ctx.beginPath(); ctx.moveTo(0, H*0.5 + gz); ctx.lineTo(W, H*0.5 + gz); ctx.stroke();
      }

      // Sendero de Champsaur
      ctx.strokeStyle = 'rgba(255, 179, 0, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let dz = -100; dz <= 100; dz += 5) {
        const wz = cz + dz;
        const wx = TerrainSystem.getTrailCenterX(wz);
        const [mx, my] = toMap(wx, wz);
        if (dz === -100) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
      }
      ctx.stroke();

      // Estructuras de la Base Avanzada Cordillera
      if (typeof OUTPOST_STRUCTURES !== 'undefined') {
        for (const st of OUTPOST_STRUCTURES) {
          const sxMid = (st.minX + st.maxX) * 0.5;
          const szMid = (st.minZ + st.maxZ) * 0.5;
          const [sx, sz] = toMap(sxMid, szMid);
          const sw = Math.max(3, (st.maxX - st.minX) * scale);
          const sd = Math.max(3, (st.maxZ - st.minZ) * scale);
          ctx.fillStyle = st.kind === 'tower' ? 'rgba(148, 163, 184, 0.72)'
            : (st.kind === 'bunker' ? 'rgba(100, 116, 139, 0.78)' : 'rgba(71, 85, 105, 0.55)');
          ctx.fillRect(sx - sw * 0.5, sz - sd * 0.5, sw, sd);
        }
      }

      // Generador Táctico y Barriles Explosivos
      if (typeof OutpostGenerator !== 'undefined') {
        const [gx, gy] = toMap(OutpostGenerator.pos[0], OutpostGenerator.pos[2]);
        ctx.fillStyle = OutpostGenerator.alive ? '#f59e0b' : '#64748b';
        ctx.fillRect(gx - 4, gy - 4, 8, 8);
        ctx.font = '8px monospace';
        ctx.fillText(OutpostGenerator.alive ? 'GEN' : 'GEN OFF', gx + 6, gy + 3);
      }
      if (typeof ExplosiveBarrels !== 'undefined') {
        for (const b of ExplosiveBarrels.list) {
          if (!b.alive) continue;
          const [bx2, by2] = toMap(b.pos[0], b.pos[2]);
          ctx.fillStyle = '#fb7185';
          ctx.beginPath(); ctx.arc(bx2, by2, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Vehículos (Buggy & Heli)
      const [bx, by] = toMap(BuggyVehicle.pos[0], BuggyVehicle.pos[2]);
      ctx.fillStyle = '#00e5ff'; ctx.fillRect(bx - 4, by - 4, 8, 8);
      ctx.font = '9px monospace'; ctx.fillText('BUGGY', bx + 6, by + 3);

      const [hx, hy] = toMap(HeliVehicle.pos[0], HeliVehicle.pos[2]);
      ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText('HELI', hx + 7, hy + 3);

      // Patrulla enemiga (código de color por estado táctico)
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const [ux, uy] = toMap(u.pos[0], u.pos[2]);
        ctx.fillStyle = u.state === 'COMBAT' ? '#ef4444'
          : (u.state === 'SUSPICIOUS' ? '#f59e0b'
            : (u.spotted ? '#fb923c' : 'rgba(248, 113, 113, 0.72)'));
        ctx.beginPath(); ctx.arc(ux, uy, u.state === 'COMBAT' ? 4.8 : 3.8, 0, Math.PI * 2); ctx.fill();
        if (u.state === 'COMBAT' || u.spotted) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(ux, uy, 7, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // Cono visual y vector del operador en el centro
      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(camera.yaw);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.16)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-28, -56); ctx.lineTo(28, -56); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Brújula Táctica Superior Centrada Exacta (-180° a +525°, cell = 48px, centro = 240px)
    const compassMarks = document.getElementById('compassMarks');
    compassMarks.style.display = 'flex';
    compassMarks.style.flexWrap = 'nowrap';
    let compassHtml = '';
    for (let deg = -180; deg <= 525; deg += 15) {
      const realDeg = ((deg % 360) + 360) % 360;
      let label = realDeg + '°';
      if (realDeg === 0) label = 'N';
      if (realDeg === 45) label = 'NE';
      if (realDeg === 90) label = 'E';
      if (realDeg === 135) label = 'SE';
      if (realDeg === 180) label = 'S';
      if (realDeg === 225) label = 'SW';
      if (realDeg === 270) label = 'W';
      if (realDeg === 315) label = 'NW';
      compassHtml += '<span style="display:inline-block; flex:0 0 48px; width:48px; text-align:center;">' + label + '</span>';
    }
    compassMarks.innerHTML = compassHtml;

    // RENDERIZADORES 3D (ESTÁTICO, VEHÍCULOS CON RUMBO -yaw CORREGIDO Y SKELETAL SKINNING)
    const CAMO_TO_ID = { alpine: 0, sierra: 1, woodland: 2, blackops: 3, insurgent: 4 };
    const _boneMatsTmp = Array.from({ length: 20 }, () => M4.create());
    const _boneFlatTmp = new Float32Array(20 * 16);

    function drawPart(prog, isShadow, baseMat, ox, oy, oz, rx, ry, rz, sx, sy, sz, color, mesh, emissive = 0.0) {
      const m = M4.create();
      M4.copy(m, baseMat);
      if (ox !== 0 || oy !== 0 || oz !== 0) M4.translate(m, m, [ox, oy, oz]);
      if (ry !== 0) M4.rotateY(m, m, ry);
      if (rx !== 0) M4.rotateX(m, m, rx);
      if (rz !== 0) M4.rotateZ(m, m, rz);
      if (sx !== 1 || sy !== 1 || sz !== 1) M4.scale(m, m, [sx, sy, sz]);

      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_model'), false, m);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_isInstanced'), 0);
      if (!isShadow) {
        gl.uniform3fv(gl.getUniformLocation(prog, 'u_colorOverride'), color);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_useOverride'), 1);
        const locEm = gl.getUniformLocation(prog, 'u_emissive');
        if (locEm) gl.uniform1f(locEm, emissive);
      }
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

    function drawBuggy(prog, isShadow, b, dayF = 1.0) {
      const bMat = M4.create();
      M4.identity(bMat);
      M4.translate(bMat, bMat, [b.pos[0], b.pos[1] + 0.50, b.pos[2]]);
      M4.rotateY(bMat, bMat, -b.yaw);
      M4.rotateX(bMat, bMat, b.pitch);
      M4.rotateZ(bMat, bMat, b.roll);

      const tanCol  = [0.46, 0.40, 0.29];
      const darkCol = [0.12, 0.14, 0.16];
      const seatCol = [0.18, 0.16, 0.15];
      const nightGlow = dayF < 0.45 ? 1.45 : 0.22;

      // Chasis tubular, capó inclinado, parachoques delantero/trasero y techo táctico
      drawPart(prog, isShadow, bMat, 0, 0.34, 0.02, 0, 0, 0, 1.66, 0.40, 3.25, tanCol, meshBox);
      drawPart(prog, isShadow, bMat, 0, 0.58, -1.25, -0.18, 0, 0, 1.44, 0.26, 0.96, tanCol, meshBox);
      drawPart(prog, isShadow, bMat, 0, 0.24, -1.78, 0, 0, 0, 1.62, 0.16, 0.22, darkCol, meshBox);
      drawPart(prog, isShadow, bMat, 0, 0.32,  1.72, 0, 0, 0, 1.54, 0.18, 0.22, darkCol, meshBox);
      drawPart(prog, isShadow, bMat, 0, 1.18,  0.22, 0, 0, 0, 1.48, 0.10, 1.72, darkCol, meshBox);

      // Butacas deportivas delanteras
      [-0.38, 0.38].forEach(sx => {
        drawPart(prog, isShadow, bMat, sx, 0.62, 0.05, -0.15, 0, 0, 0.48, 0.55, 0.42, seatCol, meshBox);
      });

      // Jaula antivuelco + pilares inclinados
      [[-0.70, 0.86, -0.45], [0.70, 0.86, -0.45], [-0.70, 0.86, 1.02], [0.70, 0.86, 1.02]].forEach(p => {
        drawPart(prog, isShadow, bMat, p[0], p[1], p[2], 0, 0, 0, 0.09, 0.66, 0.09, darkCol, meshBox);
      });

      // Repuesto en inclinación, bidón combustible rojo y luces LED frontales/traseras
      drawPart(prog, isShadow, bMat, 0, 0.92, 1.44, -0.38, 0, 0, 0.82, 0.82, 0.34, darkCol, meshBox);
      drawPart(prog, isShadow, bMat, -0.56, 0.65, 1.16, 0, 0, 0, 0.32, 0.44, 0.24, [0.76, 0.20, 0.16], meshBox);
      drawPart(prog, isShadow, bMat, -0.52, 0.44, -1.72, 0, 0, 0, 0.30, 0.12, 0.08, [1.0, 0.96, 0.78], meshBox, nightGlow);
      drawPart(prog, isShadow, bMat,  0.52, 0.44, -1.72, 0, 0, 0, 0.30, 0.12, 0.08, [1.0, 0.96, 0.78], meshBox, nightGlow);
      drawPart(prog, isShadow, bMat, 0, 1.24, -0.58, 0, 0, 0, 1.10, 0.08, 0.08, [0.95, 0.98, 1.0], meshBox, dayF < 0.45 ? 1.6 : 0.15);
      drawPart(prog, isShadow, bMat, -0.58, 0.44, 1.72, 0, 0, 0, 0.22, 0.10, 0.06, [0.95, 0.18, 0.14], meshBox, 0.45);
      drawPart(prog, isShadow, bMat,  0.58, 0.44, 1.72, 0, 0, 0, 0.22, 0.10, 0.06, [0.95, 0.18, 0.14], meshBox, 0.45);

      // 4 Ruedas sincronizadas exactamente con corners FL/FR/RL/RR ([-0.95/+0.95, ±1.35]) y wheelHubOffs (radius=0.45)
      const wheels = [
        { x: -0.95, z: -1.35, front: true,  idx: 0 },
        { x:  0.95, z: -1.35, front: true,  idx: 1 },
        { x: -0.95, z:  1.35, front: false, idx: 2 },
        { x:  0.95, z:  1.35, front: false, idx: 3 }
      ];
      wheels.forEach(w => {
        const hubOff = (b.wheelHubOffs && b.wheelHubOffs[w.idx]) || 0;
        const wheelY = -0.05 + hubOff;
        // Amortiguador telescópico conectado al buje
        drawPart(prog, isShadow, bMat, w.x * 0.78, (0.34 + wheelY) * 0.5, w.z, 0, 0, w.x < 0 ? 0.28 : -0.28, 0.09, Math.max(0.25, 0.45 - hubOff), 0.09, [0.76, 0.54, 0.16], meshCylY);

        const wMat = M4.create();
        M4.copy(wMat, bMat);
        M4.translate(wMat, wMat, [w.x, wheelY, w.z]);
        if (w.front) M4.rotateY(wMat, wMat, -b.steerAngle);
        M4.rotateX(wMat, wMat, b.wheelSpin);
        drawPart(prog, isShadow, wMat, 0, 0, 0, 0, 0, 0, 1, 1, 1, [0.11, 0.12, 0.13], meshWheel);
      });
    }

    function drawLittleBird(prog, isShadow, h, dayF = 1.0) {
      const hMat = M4.create();
      M4.identity(hMat);
      M4.translate(hMat, hMat, [h.pos[0], h.pos[1] + 0.60, h.pos[2]]);
      M4.rotateY(hMat, hMat, -h.yaw);
      M4.rotateX(hMat, hMat, h.pitch);
      M4.rotateZ(hMat, hMat, h.roll);

      const fuselageCol = [0.16, 0.18, 0.22];
      const glassCol    = [0.10, 0.22, 0.30];
      const skidCol     = [0.10, 0.11, 0.12];

      // Fuselaje ovalado + cabina acristalada + domo turbina + bola FLIR frontal
      drawPart(prog, isShadow, hMat, 0, 0.80, -0.35, 0, 0, 0, 1.56, 1.38, 2.55, fuselageCol, meshBox);
      drawPart(prog, isShadow, hMat, 0, 0.68, -1.68, -0.26, 0, 0, 1.26, 0.92, 0.85, glassCol, meshBox);
      drawPart(prog, isShadow, hMat, 0, 1.56, -0.25, 0, 0, 0, 0.68, 0.45, 1.30, [0.13, 0.15, 0.18], meshCylY);
      drawPart(prog, isShadow, hMat, 0, 0.12, -1.78, 0, 0, 0, 0.34, 0.28, 0.34, [0.08, 0.09, 0.11], meshCylY);

      // Botalón de cola + estabilizador vertical + baliza anticolisión roja
      drawPart(prog, isShadow, hMat, 0, 0.96, 2.40, Math.PI * 0.5, 0, 0, 0.26, 3.35, 0.26, fuselageCol, meshCylY);
      drawPart(prog, isShadow, hMat, 0, 1.18, 3.85, 0, 0, 0, 0.08, 0.96, 0.52, fuselageCol, meshBox);
      drawPart(prog, isShadow, hMat, 0, 1.72, 3.85, 0, 0, 0, 0.10, 0.10, 0.10, [1.0, 0.16, 0.14], meshBox, dayF < 0.45 || !h.isLanded ? 1.5 : 0.35);

      // Patines de aterrizaje (fondo exacto en y = -0.60 para contacto limpio al suelo)
      [-0.95, 0.95].forEach(sx => {
        drawPart(prog, isShadow, hMat, sx, -0.55, -0.32, 0, 0, 0, 0.11, 0.10, 3.35, skidCol, meshBox);
        drawPart(prog, isShadow, hMat, sx, -0.14, -1.08, 0, 0, 0, 0.08, 0.78, 0.08, skidCol, meshBox);
        drawPart(prog, isShadow, hMat, sx, -0.14,  0.48, 0, 0, 0, 0.08, 0.78, 0.08, skidCol, meshBox);
      });

      // Pods lanzacohetes / bancos laterales
      drawPart(prog, isShadow, hMat, -1.04, 0.42, -0.38, Math.PI * 0.5, 0, 0, 0.36, 1.25, 0.36, [0.18, 0.20, 0.19], meshCylY);
      drawPart(prog, isShadow, hMat,  1.04, 0.42, -0.38, Math.PI * 0.5, 0, 0, 0.36, 1.25, 0.36, [0.18, 0.20, 0.19], meshCylY);
      drawPart(prog, isShadow, hMat, -1.00, 0.18, -0.38, 0, 0, 0, 0.44, 0.08, 2.05, skidCol, meshBox);
      drawPart(prog, isShadow, hMat,  1.00, 0.18, -0.38, 0, 0, 0, 0.44, 0.08, 2.05, skidCol, meshBox);

      // Rotor Principal 5 Palas + Mástil + Rotor Cola
      drawPart(prog, isShadow, hMat, 0, 1.80, -0.25, 0, 0, 0, 0.24, 0.38, 0.24, [0.10, 0.11, 0.12], meshCylY);
      for (let i = 0; i < 5; i++) {
        const bladeAngle = h.mainRotorAngle + (i * Math.PI * 2) / 5;
        drawPart(prog, isShadow, hMat, 0, 1.94, -0.25, 0, bladeAngle, 0, 7.2, 0.04, 0.22, [0.06, 0.07, 0.08], meshBox);
      }
      drawPart(prog, isShadow, hMat, 0.22, 1.20, 3.95, h.tailRotorAngle, 0, 0, 0.05, 1.32, 0.14, [0.08, 0.09, 0.10], meshBox);
    }

    function drawOutpost(prog, isShadow, tSec, dayF = 1.0) {
      if (typeof OUTPOST_STRUCTURES === 'undefined') return;
      const baseMat = M4.create();
      M4.identity(baseMat);
      const y0 = OUTPOST_SITE.y;

      for (const st of OUTPOST_STRUCTURES) {
        const cx = (st.minX + st.maxX) * 0.5;
        const cz = (st.minZ + st.maxZ) * 0.5;
        const sx = st.maxX - st.minX;
        const sz = st.maxZ - st.minZ;

        if (st.kind === 'tower') {
          // Torre de vigilancia articulada con plataforma habitable en y0 + 4.55 (sin caja sólida cerrada)
          const hw = sx * 0.44, hd = sz * 0.44;
          const postCol = [0.26, 0.24, 0.21];
          const woodCol = [0.40, 0.33, 0.24];
          [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(p => {
            drawPart(prog, isShadow, baseMat, cx + p[0], y0 + 3.20, cz + p[1], 0, 0, 0, 0.20, 6.40, 0.20, postCol, meshBox);
          });
          // Plataforma habitable superior en y = 4.55
          drawPart(prog, isShadow, baseMat, cx, y0 + 4.46, cz, 0, 0, 0, sx, 0.18, sz, woodCol, meshBox);
          drawPart(prog, isShadow, baseMat, cx, y0 + 2.25, cz, 0, 0, 0, sx * 0.85, 0.10, sz * 0.85, postCol, meshBox);
          // Antepecho bajo de cobertura (deja ver torso/cabeza/arma del tirador)
          drawPart(prog, isShadow, baseMat, cx, y0 + 4.92, st.minZ + 0.12, 0, 0, 0, sx, 0.74, 0.14, [0.36, 0.34, 0.30], meshBox);
          drawPart(prog, isShadow, baseMat, cx, y0 + 4.92, st.maxZ - 0.12, 0, 0, 0, sx, 0.74, 0.14, [0.36, 0.34, 0.30], meshBox);
          drawPart(prog, isShadow, baseMat, st.minX + 0.12, y0 + 4.92, cz, 0, 0, 0, 0.14, 0.74, sz, [0.36, 0.34, 0.30], meshBox);
          drawPart(prog, isShadow, baseMat, st.maxX - 0.12, y0 + 4.92, cz, 0, 0, 0, 0.14, 0.74, sz, [0.36, 0.34, 0.30], meshBox);
          // Techo metálico y reflector rotativo de alarma
          drawPart(prog, isShadow, baseMat, cx, y0 + 6.42, cz, 0, 0, 0, sx + 0.35, 0.14, sz + 0.35, [0.19, 0.21, 0.22], meshBox);
          const alarmActive = typeof OutpostPatrol !== 'undefined' && OutpostPatrol.alarmTimer > 0 && OutpostGenerator.alive;
          const beaconEm = alarmActive ? (1.2 + 0.8 * Math.sin(tSec * 14.0)) : (dayF < 0.45 && OutpostGenerator.alive ? 0.85 : 0.15);
          const beaconCol = alarmActive ? [1.0, 0.18, 0.14] : [1.0, 0.65, 0.18];
          drawPart(prog, isShadow, baseMat, cx, y0 + 6.58, cz, 0, tSec * 2.5, 0, 0.28, 0.18, 0.28, beaconCol, meshCylY, beaconEm);
        } else if (st.kind === 'generator') {
          // Zócalo, bloque motor diésel, chimenea de escape e indicador de estado
          const alive = typeof OutpostGenerator === 'undefined' || OutpostGenerator.alive;
          drawPart(prog, isShadow, baseMat, cx, y0 + 0.08, cz, 0, 0, 0, sx, 0.16, sz, [0.32, 0.33, 0.34], meshBox);
          drawPart(prog, isShadow, baseMat, cx, y0 + 0.90, cz, 0, 0, 0, sx * 0.84, 1.48, sz * 0.82, alive ? st.color : [0.13, 0.12, 0.12], meshBox);
          drawPart(prog, isShadow, baseMat, cx + 0.8, y0 + 1.85, cz - 0.5, 0, 0, 0, 0.18, 0.75, 0.18, [0.16, 0.16, 0.17], meshCylY);
          const ledCol = alive ? [0.15, 0.95, 0.55] : [0.90, 0.16, 0.14];
          drawPart(prog, isShadow, baseMat, cx, y0 + 1.42, st.maxZ - 0.22, 0, 0, 0, 0.32, 0.22, 0.08, ledCol, meshBox, alive ? 1.25 : 0.30);
        } else {
          // Muros Hesco, búnker de mando (con antena), contenedor ISO y parapetos de sacos
          drawPart(prog, isShadow, baseMat, cx, y0 + st.h * 0.5, cz, 0, 0, 0, sx, st.h, sz, st.color, meshBox);
          if (st.kind === 'wall') {
            // Albardilla / listón superior del bastión
            drawPart(prog, isShadow, baseMat, cx, y0 + st.h + 0.07, cz, 0, 0, 0, sx + 0.14, 0.14, sz + 0.14, [0.36, 0.35, 0.31], meshBox);
          } else if (st.kind === 'bunker') {
            drawPart(prog, isShadow, baseMat, cx, y0 + st.h + 0.10, cz, 0, 0, 0, sx + 0.5, 0.22, sz + 0.5, [0.24, 0.26, 0.25], meshBox);
            drawPart(prog, isShadow, baseMat, cx - 1.8, y0 + st.h + 1.35, cz - 1.2, 0, 0, 0, 0.10, 2.4, 0.10, [0.20, 0.22, 0.24], meshCylY);
          }
        }
      }

      // Barriles explosivos rojos/amarillos (o calcinados tumbados al detonar)
      if (typeof ExplosiveBarrels !== 'undefined') {
        for (const b of ExplosiveBarrels.list) {
          if (b.alive) {
            drawPart(prog, isShadow, baseMat, b.pos[0], b.pos[1] + 0.55, b.pos[2], 0, 0, 0, 0.68, 1.10, 0.68, [0.76, 0.16, 0.14], meshCylY);
            drawPart(prog, isShadow, baseMat, b.pos[0], b.pos[1] + 0.58, b.pos[2], 0, 0, 0, 0.70, 0.18, 0.70, [0.92, 0.72, 0.14], meshCylY);
          } else {
            drawPart(prog, isShadow, baseMat, b.pos[0], b.pos[1] + 0.28, b.pos[2], 1.45, b.id * 1.3, 0, 0.60, 0.95, 0.60, [0.12, 0.10, 0.10], meshCylY);
          }
        }
      }
    }

    function drawSkinnedCharacter(prog, isShadow, opVao, boneMats, camoId, gearCfg, isThermalHot) {
      for (let b = 0; b < 20; b++) {
        _boneFlatTmp.set(boneMats[b], b * 16);
      }
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_boneMatrices'), false, _boneFlatTmp);
      if (!isShadow) {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_camoId'), camoId);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_isThermalHot'), isThermalHot ? 1.0 : 0.0);
      }
      const r = opVao.ranges;
      gl.bindVertexArray(opVao.vao);

      function drawRange(rg) {
        if (rg && rg.count > 0) gl.drawElements(gl.TRIANGLES, rg.count, gl.UNSIGNED_SHORT, rg.start * 2);
      }
      drawRange(r.base);
      if (gearCfg.head === 'fast') {
        drawRange(r.head_fast);
        drawRange(visionMode === 1 ? r.head_fast_nvg_down : r.head_fast_nvg_up);
      } else if (gearCfg.head === 'boonie') {
        drawRange(r.head_boonie);
      } else {
        drawRange(r.head_balaclava);
      }
      drawRange(gearCfg.weapon === 'm40a5' ? r.weap_m40a5 : r.weap_mk17);
      if (gearCfg.suppressor) drawRange(r.suppressor);

      gl.bindVertexArray(null);
    }

    // ========================================================================
    // BUCLE DE RENDERIZADO PRINCIPAL
    // ========================================================================
    let lastTime = performance.now();
    let _lastMarkersHtml = '';
    OutpostPatrol.reset();

    function renderLoop(now) {
      requestAnimationFrame(renderLoop);
      const dt = Math.min((now - lastTime) * 0.001, 0.06);
      lastTime = now;
      const tSec = now * 0.001;

      if (dayCycleEnabled) {
        timeOfDayHours = (timeOfDayHours + dt * dayCycleSpeed * 0.25) % 24;
      }
      const curAtmos = dayCycleEnabled
        ? computeAtmosphereAtHour(timeOfDayHours)
        : {
            ...ATMOS[todIndex],
            daylightFactor: (ATMOS[todIndex].hour >= 21 || ATMOS[todIndex].hour < 5.5) ? 0.05 : (ATMOS[todIndex].hour > 17.5 ? 0.35 : 1.0)
          };

      const isADS = (controlMode === 0) && !isMenuOpen && (toggleAdsMode ? adsToggleState : adsHoldState);
      if (fireHeld && controlMode === 0 && Operator.fireMode === 'AUTO' && !Operator.custom.weapon.includes('m40a5')) {
        tryFireWeapon();
      }

      let activePos = Operator.pos;
      let speedKmh = 0;

      if (controlMode === 0) {
        Operator.update(dt, inputKeys, camera.yaw, camera.pitch, isADS);
        activePos = Operator.pos;
        speedKmh = Operator.speed;
      } else if (controlMode === 1) {
        BuggyVehicle.update(dt, inputKeys);
        activePos = BuggyVehicle.pos;
        speedKmh = Math.abs(BuggyVehicle.speed);
      } else {
        HeliVehicle.update(dt, inputKeys, true);
        activePos = HeliVehicle.pos;
        speedKmh = Math.hypot(HeliVehicle.vel[0], HeliVehicle.vel[2]) * 3.6;
      }
      if (controlMode !== 2) HeliVehicle.update(dt, inputKeys, false);

      OutpostPatrol.update(dt, tSec, curAtmos.daylightFactor !== undefined ? curAtmos.daylightFactor : 1.0, activePos);
      TracerSystem.update(dt);

      // Cámara Sobre el Hombro (OTS) Estilo Wildlands o Cámara de Vehículo
      const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
      const lookDir = [Math.sin(camera.yaw) * cp, -sp, -Math.cos(camera.yaw) * cp];
      camera.lookDir = lookDir;

      if (controlMode === 0) {
        const adsB = Operator.adsBlend;
        const standH = Operator.stance === 2 ? 0.42 : (Operator.stance === 1 ? 1.02 : 1.44);
        const sideOff = Operator.shoulderBlend * (0.58 * (1.0 - adsB) + 0.40 * adsB);
        const rightX = Math.cos(camera.yaw), rightZ = Math.sin(camera.yaw);
        const curDist = camera.dist * (1.0 - adsB) + (Operator.custom.weapon === 'm40a5' ? 1.05 : 1.32) * adsB;

        const pivot = [activePos[0] + rightX * sideOff, activePos[1] + standH, activePos[2] + rightZ * sideOff];
        let camX = pivot[0] - lookDir[0] * curDist;
        let camY = pivot[1] - lookDir[1] * curDist;
        let camZ = pivot[2] - lookDir[2] * curDist;

        // Anticolisión contra colinas (punto medio y cámara)
        const midY = TerrainSystem.getHeight((pivot[0] + camX) * 0.5, (pivot[2] + camZ) * 0.5) + 0.45;
        const endY = TerrainSystem.getHeight(camX, camZ) + 0.50;
        camY = Math.max(camY, Math.max(midY, endY));

        camera.pos = [camX, camY, camZ];
        camera.rayOrigin = pivot;
        camera.target = [pivot[0] + lookDir[0] * 60.0, pivot[1] + lookDir[1] * 60.0, pivot[2] + lookDir[2] * 60.0];

        const baseFov = (inputKeys.shift && !isADS && Operator.stance === 0 && Operator.isMoving) ? 63 : 57;
        const adsFov = Operator.custom.weapon === 'm40a5' ? 23 : 39;
        const targetFov = baseFov * (1.0 - adsB) + adsFov * adsB;
        camera.fovDeg += (targetFov - camera.fovDeg) * Math.min(1, 14.0 * dt);
      } else {
        const tgtH = controlMode === 1 ? 1.25 : 1.45;
        camera.target = [activePos[0], activePos[1] + tgtH, activePos[2]];
        const camX = camera.target[0] - lookDir[0] * camera.dist;
        const camY = Math.max(camera.target[1] - lookDir[1] * camera.dist, TerrainSystem.getHeight(camX, camera.target[2] - lookDir[2] * camera.dist) + 0.65);
        const camZ = camera.target[2] - lookDir[2] * camera.dist;
        camera.pos = [camX, camY, camZ];
        camera.rayOrigin = camera.pos;
        camera.fovDeg += (60 - camera.fovDeg) * Math.min(1, 10.0 * dt);
      }

      // Streaming de Chunks & Audio con Telemetría de Marchas/RPM/Rotor
      ChunkManager.updateGrid(gl, activePos[0], activePos[2]);
      const vehTel = controlMode === 1
        ? { rpmNorm: BuggyVehicle.rpmNorm, shiftDip: BuggyVehicle.shiftDip, throttle: BuggyVehicle.throttle, airborne: BuggyVehicle.airborne }
        : (controlMode === 2
          ? { collective: HeliVehicle.collective, rotorRpm: HeliVehicle.rotorRPM, airborne: !HeliVehicle.isLanded }
          : null);
      SoundEngine.updateFrame(controlMode, speedKmh, activePos[1], vehTel);

      // Evaluar Esqueleto + IK del Operador (y actualizar boca de cañón real para trazadoras)
      const opVao = getOperatorVAO(currentMeshRes);
      if (controlMode === 0) {
        const resOp = evaluateSoldierSkeleton(
          Operator, Operator.isMoving ? Operator.walkPhase * 0.18 : tSec,
          Operator.yaw, Operator.pos, TerrainSystem.getHeight, _boneMatsTmp
        );
        if (resOp && resOp.muzzleWorld) Operator.muzzleWorld = resOp.muzzleWorld;
      }

      // Telemetría & HUD GRW Minimalista
      document.getElementById('speedText').textContent = Math.round(speedKmh) + ' KM/H';
      document.getElementById('altText').textContent = Math.round(1800 + activePos[1]) + ' M';
      const pctVis = Math.round(Operator.visibilityIndex * 100);
      document.getElementById('stealthText').textContent = pctVis + '% ' + (Operator.isInShrub ? '[OCULTO EN PIORNAL]' : '[EXPUESTO]');
      document.getElementById('stealthBar').style.width = pctVis + '%';
      document.getElementById('stealthBar').style.background = pctVis <= 20 ? 'var(--accent-emerald)' : (pctVis <= 60 ? 'var(--accent-amber)' : 'var(--accent-red)');
      document.getElementById('stanceText').textContent = ['DE PIE', 'AGACHADO', 'PRONE'][Operator.stance] + (Operator.adsBlend > 0.4 ? ' // ADS' : '');

      const hpPct = Math.round(Math.max(0, Math.min(100, Operator.hp)));
      document.getElementById('hpText').textContent = hpPct + '%';
      const hpBarEl = document.getElementById('hpBar');
      hpBarEl.style.width = hpPct + '%';
      hpBarEl.style.background = hpPct > 55 ? 'var(--accent-emerald)' : (hpPct > 28 ? 'var(--accent-amber)' : 'var(--accent-red)');
      document.getElementById('damageVignette').style.opacity = (Operator.damageFlash * 0.85).toFixed(3);

      const shPill = document.getElementById('shoulderPill');
      shPill.textContent = Operator.shoulderSide > 0 ? 'HOMBRO DER' : 'HOMBRO IZQ';
      shPill.style.color = Operator.shoulderSide > 0 ? 'var(--accent-amber)' : 'var(--accent-cyan)';
      shPill.style.borderColor = shPill.style.color;

      document.getElementById('ammoMag').textContent = Operator.reloadTimer > 0 ? '...' : Operator.mag;
      document.getElementById('ammoReserve').textContent = Operator.reserve;

      const chEl = document.getElementById('crosshair');
      const spreadPx = Math.round(4 + (1.0 - Operator.adsBlend) * (Operator.isMoving ? 10 : 4) + Operator.recoil * 16);
      chEl.style.setProperty('--spread', spreadPx + 'px');
      chEl.style.opacity = controlMode === 0 ? '1' : '0.4';

      const hmEl = document.getElementById('hitMarker');
      hmEl.style.opacity = Operator.hitMarkerTimer > 0 ? '1' : '0';
      hmEl.classList.toggle('kill', !!Operator.hitMarkerKill);

      const kfEl = document.getElementById('killFeedBanner');
      if (Operator.killFeedTimer > 0 && Operator.killFeedText) {
        kfEl.textContent = Operator.killFeedText;
        kfEl.className = 'show' + (Operator.killFeedKind ? ' ' + Operator.killFeedKind : '');
      } else {
        kfEl.className = '';
      }

      const hrsInt = Math.floor(((timeOfDayHours % 24) + 24) % 24);
      const minsInt = Math.floor((timeOfDayHours - Math.floor(timeOfDayHours)) * 60);
      const hhmm = String(hrsInt).padStart(2, '0') + ':' + String(minsInt).padStart(2, '0');
      document.getElementById('timeHudPill').innerHTML = `HORA: <b>${hhmm}</b>${dayCycleEnabled ? ' // CICLO' : ''}`;

      const aliveHostiles = OutpostPatrol.units.filter(u => u.alive).length;
      const inCombat = OutpostPatrol.units.some(u => u.alive && u.state === 'COMBAT');
      const outpostEl = document.getElementById('outpostHudPill');
      outpostEl.className = 'sector-pill' + (aliveHostiles === 0 ? ' cleared' : (inCombat ? ' alert' : ''));
      const genTag = OutpostGenerator.alive ? 'GEN ACTIVO' : 'SIN ENERGÍA';
      outpostEl.innerHTML = aliveHostiles === 0
        ? `BASE CORDILLERA: <b>DESPEJADA // ${genTag}</b>`
        : `BASE CORDILLERA: <b>${aliveHostiles} HOSTIL${aliveHostiles > 1 ? 'ES' : ''} // ${genTag}</b>`;

      const gearEl = document.getElementById('buggyGearPill');
      if (controlMode === 1) {
        const gLabel = BuggyVehicle.gear === 0 ? 'R' : (Math.abs(BuggyVehicle.speed) < 0.8 && !BuggyVehicle.throttle ? 'N' : String(BuggyVehicle.gear));
        const airTag = BuggyVehicle.airborne ? ' // SALTO' : '';
        gearEl.style.display = 'inline-block';
        gearEl.innerHTML = `MARCHA: <b>${gLabel} // ${BuggyVehicle.rpm} RPM${airTag}</b>`;
      } else {
        gearEl.style.display = 'none';
      }

      let deg = ((camera.yaw * 180 / Math.PI) % 360 + 360) % 360;
      compassMarks.style.transform = `translateX(-${360 + (deg / 15) * 48}px)`;

      const promptEl = document.getElementById('interactPrompt');
      if (controlMode === 0) {
        const dB = Math.hypot(Operator.pos[0] - BuggyVehicle.pos[0], Operator.pos[2] - BuggyVehicle.pos[2]);
        const dH = Math.hypot(Operator.pos[0] - HeliVehicle.pos[0], Operator.pos[2] - HeliVehicle.pos[2]);
        const dG = OutpostGenerator.alive ? Math.hypot(Operator.pos[0] - OutpostGenerator.pos[0], Operator.pos[2] - OutpostGenerator.pos[2]) : 999;
        const kInt = Keybinds.prettyCode(Keybinds.map.interact.code);
        if (dG < 4.2) {
          promptEl.textContent = `PRESIONA [${kInt}] PARA SABOTEAR GENERADOR DE ALARMA`;
          promptEl.style.display = 'block';
        } else if (dB < 5.0) {
          promptEl.textContent = `PRESIONA [${kInt}] PARA ENTRAR AL BUGGY 4X4`;
          promptEl.style.display = 'block';
        } else if (dH < 6.2) {
          promptEl.textContent = `PRESIONA [${kInt}] PARA SUBIR AL LITTLE BIRD`;
          promptEl.style.display = 'block';
        } else {
          promptEl.style.display = 'none';
        }
      } else if (controlMode === 1 && (Math.abs(BuggyVehicle.roll) > 0.45 || Math.abs(BuggyVehicle.pitch) > 0.55)) {
        const kRel = Keybinds.prettyCode(Keybinds.map.reload.code);
        promptEl.textContent = `PRESIONA [${kRel}] PARA ENDEREZAR BUGGY 4X4`;
        promptEl.style.display = 'block';
      } else {
        promptEl.style.display = 'none';
      }

      // Matrices Proyección/Vista + Proyección 3D->2D de Marcadores Tácticos + Luz Direccional Sombras
      const matProj = M4.create();
      M4.perspective(matProj, camera.fovDeg * Math.PI / 180, canvas.width / canvas.height, 0.25, renderDistance);
      const matView = M4.create();
      M4.lookAt(matView, camera.pos, camera.target, [0, 1, 0]);
      const matVP = M4.create();
      M4.multiply(matVP, matProj, matView);

      // Marcadores tácticos proyectados al HUD
      const markersLayer = document.getElementById('hudMarkersLayer');
      const Wc = canvas.clientWidth || window.innerWidth;
      const Hc = canvas.clientHeight || window.innerHeight;
      function projectToHud(wx, wy, wz) {
        const cx = matVP[0]*wx + matVP[4]*wy + matVP[8]*wz  + matVP[12];
        const cy = matVP[1]*wx + matVP[5]*wy + matVP[9]*wz  + matVP[13];
        const cw = matVP[3]*wx + matVP[7]*wy + matVP[11]*wz + matVP[15];
        if (cw <= 0.15) return null;
        const nx = cx / cw, ny = cy / cw;
        if (nx < -1.04 || nx > 1.04 || ny < -1.04 || ny > 1.04) return null;
        return [(nx * 0.5 + 0.5) * Wc, (0.5 - ny * 0.5) * Hc];
      }
      let mHtml = '';
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        if (!u.spotted && u.state === 'PATROL') continue;
        const dU = Math.round(Math.hypot(u.pos[0] - activePos[0], u.pos[2] - activePos[2]));
        if (dU > 260) continue;
        const hpPos = u.headWorld || [u.pos[0], u.pos[1] + 1.8, u.pos[2]];
        const pt = projectToHud(hpPos[0], hpPos[1] + 0.36, hpPos[2]);
        if (!pt) continue;
        const cls = u.state === 'COMBAT' ? 'combat' : (u.state === 'SUSPICIOUS' ? 'suspicious' : 'spotted');
        const tag = u.state === 'COMBAT' ? '!' : (u.state === 'SUSPICIOUS' ? '?' : '');
        mHtml += `<div class="hud-marker ${cls}" style="left:${pt[0].toFixed(1)}px;top:${pt[1].toFixed(1)}px;"><div class="hud-marker-badge">${tag}${u.role.split(' ')[0]}</div><div class="hud-marker-dist">${dU}M</div><div class="hud-marker-diamond"></div></div>`;
      }
      if (OutpostGenerator.alive && (OutpostGenerator.spotted || Math.hypot(OutpostGenerator.pos[0] - activePos[0], OutpostGenerator.pos[2] - activePos[2]) < 85)) {
        const dG2 = Math.round(Math.hypot(OutpostGenerator.pos[0] - activePos[0], OutpostGenerator.pos[2] - activePos[2]));
        const ptG = projectToHud(OutpostGenerator.pos[0], OutpostGenerator.pos[1] + 2.2, OutpostGenerator.pos[2]);
        if (ptG) {
          mHtml += `<div class="hud-marker generator" style="left:${ptG[0].toFixed(1)}px;top:${ptG[1].toFixed(1)}px;"><div class="hud-marker-badge">GENERADOR</div><div class="hud-marker-dist">${dG2}M</div><div class="hud-marker-diamond"></div></div>`;
        }
      }
      for (const b of ExplosiveBarrels.list) {
        if (!b.alive || !b.spotted) continue;
        const dB2 = Math.round(Math.hypot(b.pos[0] - activePos[0], b.pos[2] - activePos[2]));
        const ptB = projectToHud(b.pos[0], b.pos[1] + 1.35, b.pos[2]);
        if (ptB) {
          mHtml += `<div class="hud-marker barrel" style="left:${ptB[0].toFixed(1)}px;top:${ptB[1].toFixed(1)}px;"><div class="hud-marker-badge">EXP</div><div class="hud-marker-dist">${dB2}M</div><div class="hud-marker-diamond"></div></div>`;
        }
      }
      if (mHtml !== _lastMarkersHtml) {
        markersLayer.innerHTML = mHtml;
        _lastMarkersHtml = mHtml;
      }

      const sunDir = curAtmos.sunDir;
      const matLightProj = M4.create();
      M4.ortho(matLightProj, -75, 75, -75, 75, 10, 320);
      const lightPos = [activePos[0] + sunDir[0] * 120, activePos[1] + sunDir[1] * 120, activePos[2] + sunDir[2] * 120];
      const matLightView = M4.create();
      M4.lookAt(matLightView, lightPos, activePos, [0, 1, 0]);
      const matLightVP = M4.create();
      M4.multiply(matLightVP, matLightProj, matLightView);

      const identityMat = M4.create(); M4.identity(identityMat);

      // PASE 1: SHADOW MAP (Terreno, Árboles Instanciados, Base Cordillera, Vehículos y Skinned Char)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboShadow);
      gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(progShadow);
      gl.uniformMatrix4fv(gl.getUniformLocation(progShadow, 'u_lightVP'), false, matLightVP);
      gl.uniform1f(gl.getUniformLocation(progShadow, 'u_time'), tSec);
      gl.uniform1f(gl.getUniformLocation(progShadow, 'u_windStr'), windIntensity);

      gl.uniformMatrix4fv(gl.getUniformLocation(progShadow, 'u_model'), false, identityMat);
      gl.uniform1i(gl.getUniformLocation(progShadow, 'u_isInstanced'), 0);
      for (const chunk of ChunkManager.chunks.values()) {
        gl.bindVertexArray(chunk.mesh.vao);
        gl.drawElements(gl.TRIANGLES, chunk.mesh.count, gl.UNSIGNED_SHORT, 0);
      }
      function shadowInst(mesh, cnt) {
        if (!cnt) return;
        gl.uniform1i(gl.getUniformLocation(progShadow, 'u_isInstanced'), 1);
        gl.bindVertexArray(mesh.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, cnt);
      }
      shadowInst(meshLarchTrunk,  ChunkManager.instDataLarch.length / 8);
      shadowInst(meshPineTrunk,   ChunkManager.instDataPine.length / 8);
      shadowInst(meshBoulder,     ChunkManager.instDataBoulder.length / 8);
      gl.disable(gl.CULL_FACE);
      shadowInst(meshGrassCarpet, ChunkManager.instDataGrass.length / 8);
      shadowInst(meshPiornal,     ChunkManager.instDataPiornal.length / 8);
      shadowInst(meshLarchLeaves, ChunkManager.instDataLarch.length / 8);
      shadowInst(meshPineLeaves,  ChunkManager.instDataPine.length / 8);
      gl.enable(gl.CULL_FACE);

      drawOutpost(progShadow, true, tSec, 1.0);
      drawBuggy(progShadow, true, BuggyVehicle, 1.0);
      drawLittleBird(progShadow, true, HeliVehicle, 1.0);

      gl.useProgram(progShadowSkinned);
      gl.uniformMatrix4fv(gl.getUniformLocation(progShadowSkinned, 'u_lightVP'), false, matLightVP);
      if (controlMode === 0) {
        drawSkinnedCharacter(progShadowSkinned, true, opVao, _boneMatsTmp, 0, {
          head: Operator.custom.head, weapon: Operator.custom.weapon, suppressor: Operator.suppressor
        }, false);
      }

      // PASE 2: ESCENA COMPLETA FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(curAtmos.fog[0], curAtmos.fog[1], curAtmos.fog[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(progScene);
      gl.uniformMatrix4fv(gl.getUniformLocation(progScene, 'u_vp'), false, matVP);
      gl.uniformMatrix4fv(gl.getUniformLocation(progScene, 'u_lightVP'), false, matLightVP);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_camPos'), camera.pos);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_sunDir'), sunDir);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_sunColor'), curAtmos.sunCol);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_skyAmbient'), curAtmos.skyAmb);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_groundAmbient'), curAtmos.grdAmb);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_fogColor'), curAtmos.fog);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_visionMode'), visionMode);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_sssEnabled'), sssEnabled ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_isThermalHot'), 0.0);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_cloudLayerDensity'), cloudDensity);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_renderDist'), renderDistance);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_time'), tSec);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_windStr'), windIntensity);

      const expFlat = [];
      for (let i = 0; i < 4; i++) expFlat.push(...ExplosionDecalSystem.centers[i]);
      gl.uniform3fv(gl.getUniformLocation(progScene, 'u_explosionCenters'), new Float32Array(expFlat));
      gl.uniform1fv(gl.getUniformLocation(progScene, 'u_explosionRadii'), new Float32Array(ExplosionDecalSystem.radii));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_shadowMap'), 0);

      // Macizo lejano
      const massifMat = M4.create();
      M4.identity(massifMat);
      M4.translate(massifMat, massifMat, [activePos[0], 0, activePos[2]]);
      gl.uniformMatrix4fv(gl.getUniformLocation(progScene, 'u_model'), false, massifMat);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_isInstanced'), 0);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_useOverride'), 0);
      gl.bindVertexArray(meshMassif.vao);
      gl.drawElements(gl.TRIANGLES, meshMassif.count, gl.UNSIGNED_SHORT, 0);

      // Chunks terreno
      gl.uniformMatrix4fv(gl.getUniformLocation(progScene, 'u_model'), false, identityMat);
      for (const chunk of ChunkManager.chunks.values()) {
        gl.bindVertexArray(chunk.mesh.vao);
        gl.drawElements(gl.TRIANGLES, chunk.mesh.count, gl.UNSIGNED_SHORT, 0);
      }

      // Follaje instanciado
      function renderInst(mesh, count) {
        if (count === 0) return;
        gl.uniform1i(gl.getUniformLocation(progScene, 'u_isInstanced'), 1);
        gl.uniform1i(gl.getUniformLocation(progScene, 'u_useOverride'), 0);
        gl.bindVertexArray(mesh.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, count);
      }
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_doubleSided'), 0);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_emissive'), 0.0);
      renderInst(meshLarchTrunk, ChunkManager.instDataLarch.length / 8);
      renderInst(meshPineTrunk,  ChunkManager.instDataPine.length / 8);
      renderInst(meshBoulder,    ChunkManager.instDataBoulder.length / 8);

      // Pasada de Follaje de Ambas Caras reales (sin Backface Culling + Normal Flipping)
      gl.disable(gl.CULL_FACE);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_doubleSided'), 1);
      renderInst(meshGrassCarpet, ChunkManager.instDataGrass.length / 8);
      renderInst(meshPiornal,     ChunkManager.instDataPiornal.length / 8);
      renderInst(meshLarchLeaves, ChunkManager.instDataLarch.length / 8);
      renderInst(meshPineLeaves,  ChunkManager.instDataPine.length / 8);
      gl.uniform1i(gl.getUniformLocation(progScene, 'u_doubleSided'), 0);
      gl.enable(gl.CULL_FACE);

      // Puesto Avanzado Cordillera (Muros Bastion, Torre de Vigilancia, Barracón, Generador, Barriles Explosivos)
      drawOutpost(progScene, false, tSec, curAtmos.daylightFactor !== undefined ? curAtmos.daylightFactor : 1.0);

      // Vehículos (motor térmico caliente en modo FLIR)
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_isThermalHot'), 1.0);
      drawBuggy(progScene, false, BuggyVehicle, curAtmos.daylightFactor !== undefined ? curAtmos.daylightFactor : 1.0);
      drawLittleBird(progScene, false, HeliVehicle, curAtmos.daylightFactor !== undefined ? curAtmos.daylightFactor : 1.0);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_isThermalHot'), 0.0);
      gl.uniform1f(gl.getUniformLocation(progScene, 'u_emissive'), 0.0);

      // PASE 2B: PERSONAJES SKELETAL SKINNING GPU (OPERADOR + PATRULLA IA)
      gl.useProgram(progSkinned);
      gl.uniformMatrix4fv(gl.getUniformLocation(progSkinned, 'u_vp'), false, matVP);
      gl.uniformMatrix4fv(gl.getUniformLocation(progSkinned, 'u_lightVP'), false, matLightVP);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_camPos'), camera.pos);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_sunDir'), sunDir);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_sunColor'), curAtmos.sunCol);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_skyAmbient'), curAtmos.skyAmb);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_groundAmbient'), curAtmos.grdAmb);
      gl.uniform3fv(gl.getUniformLocation(progSkinned, 'u_fogColor'), curAtmos.fog);
      gl.uniform1i(gl.getUniformLocation(progSkinned, 'u_visionMode'), visionMode);
      gl.uniform1f(gl.getUniformLocation(progSkinned, 'u_cloudLayerDensity'), cloudDensity);
      gl.uniform1f(gl.getUniformLocation(progSkinned, 'u_renderDist'), renderDistance);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(gl.getUniformLocation(progSkinned, 'u_shadowMap'), 0);

      if (controlMode === 0) {
        const camoId = CAMO_TO_ID[Operator.custom.camo] || 0;
        drawSkinnedCharacter(progSkinned, false, opVao, _boneMatsTmp, camoId, {
          head: Operator.custom.head, weapon: Operator.custom.weapon, suppressor: Operator.suppressor
        }, true);
      }

      const enemyBoneMats = Array.from({ length: 20 }, () => M4.create());
      const stdOpVao = getOperatorVAO('std');
      for (const u of OutpostPatrol.units) {
        const res = evaluateSoldierSkeleton(u, tSec * (u.isMoving ? 1.0 : 0.25) + u.id * 1.3, u.yaw, u.pos, TerrainSystem.getHeight, enemyBoneMats);
        u.muzzleWorld = res.muzzleWorld;
        u.headWorld = res.headWorld;
        u.torsoWorld = res.torsoWorld;
        const camoCode = u.customCamo === 'blackops' ? 3 : 4;
        drawSkinnedCharacter(progSkinned, false, stdOpVao, enemyBoneMats, camoCode, {
          head: u.customHead || 'balaclava', weapon: 'mk17', suppressor: false
        }, u.alive);
      }

      // Trazadoras balísticas (Aliadas doradas vs Enemigas rojo/naranja)
      if (TracerSystem.list.length) {
        gl.useProgram(progLine);
        gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'u_vp'), false, matVP);
        gl.bindVertexArray(tracerVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, tracerBuf);
        const allyPts = [], enemyPts = [];
        for (const tr of TracerSystem.list) {
          if (tr.isEnemy) enemyPts.push(tr.a[0], tr.a[1], tr.a[2], tr.b[0], tr.b[1], tr.b[2]);
          else allyPts.push(tr.a[0], tr.a[1], tr.a[2], tr.b[0], tr.b[1], tr.b[2]);
        }
        if (allyPts.length) {
          gl.uniform3f(gl.getUniformLocation(progLine, 'u_color'), 1.0, 0.85, 0.35);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(allyPts), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.LINES, 0, allyPts.length / 3);
        }
        if (enemyPts.length) {
          gl.uniform3f(gl.getUniformLocation(progLine, 'u_color'), 1.0, 0.32, 0.14);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(enemyPts), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.LINES, 0, enemyPts.length / 3);
        }
        gl.bindVertexArray(null);
      }

      // PASE 3: POST-PROCESO Y GOD RAYS ASPECT-CORRECTED
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progPost);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'u_sceneTex'), 0);

      const sunWorld = [camera.pos[0] + sunDir[0] * 500, camera.pos[1] + sunDir[1] * 500, camera.pos[2] + sunDir[2] * 500, 1.0];
      const sunClip = [
        matVP[0]*sunWorld[0] + matVP[4]*sunWorld[1] + matVP[8]*sunWorld[2] + matVP[12],
        matVP[1]*sunWorld[0] + matVP[5]*sunWorld[1] + matVP[9]*sunWorld[2] + matVP[13],
        matVP[2]*sunWorld[0] + matVP[6]*sunWorld[1] + matVP[10]*sunWorld[2] + matVP[14],
        matVP[3]*sunWorld[0] + matVP[7]*sunWorld[1] + matVP[11]*sunWorld[2] + matVP[15]
      ];
      const isSunAhead = sunClip[3] > 0.1;
      const sunScreenX = (sunClip[0] / sunClip[3]) * 0.5 + 0.5;
      const sunScreenY = (sunClip[1] / sunClip[3]) * 0.5 + 0.5;
      const screenDist = Math.max(
        Math.max(0, -sunScreenX), Math.max(0, sunScreenX - 1.0),
        Math.max(0, -sunScreenY), Math.max(0, sunScreenY - 1.0)
      );
      const sunScreenFade = Math.max(0, 1.0 - screenDist * 2.2);
      const chkGodRays = document.getElementById('chkGodRays');
      const sunVis = (isSunAhead && chkGodRays && chkGodRays.checked && visionMode === 0) ? sunScreenFade : 0.0;

      gl.uniform2f(gl.getUniformLocation(progPost, 'u_sunScreenPos'), sunScreenX, sunScreenY);
      gl.uniform1f(gl.getUniformLocation(progPost, 'u_sunVisible'), sunVis);
      gl.uniform1f(gl.getUniformLocation(progPost, 'u_aspect'), canvas.width / canvas.height);

      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    requestAnimationFrame(renderLoop);
  });

