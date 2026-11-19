  // 2. RUIDO DETERMINISTA & TOPOGRAFÍA DEL VALLE DE CHAMPSAUR
  const Noise2D = (() => {
    const P = new Uint8Array(512);
    const src = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
      8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
      57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,
      77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
      65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,
      164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
      207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,
      221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,
      104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,
      239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,
      236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    for (let i = 0; i < 256; i++) { P[i] = src[i]; P[256 + i] = src[i]; }
    const fade = t => t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    const grad = (h, x, y) => {
      const u = (h & 1) === 0 ? x : -x;
      const v = (h & 2) === 0 ? y : -y;
      return u + v;
    };
    return {
      noise: (x, y) => {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const a = P[X] + Y, b = P[X + 1] + Y;
        const g00 = grad(P[a], xf, yf), g10 = grad(P[b], xf - 1, yf);
        const g01 = grad(P[a + 1], xf, yf - 1), g11 = grad(P[b + 1], xf - 1, yf - 1);
        const l1 = g00 + u * (g10 - g00), l2 = g01 + u * (g11 - g01);
        return l1 + v * (l2 - l1);
      },
      fbm: (x, y, oct = 4) => {
        let val = 0.0, amp = 0.5, freq = 1.0;
        for (let i = 0; i < oct; i++) {
          val += Noise2D.noise(x * freq, y * freq) * amp;
          amp *= 0.5; freq *= 2.02;
        }
        return val;
      }
    };
  })();

  const OUTPOST_SITE = { x: 16, z: -84, y: 15.0, padRadius: 21, blendRadius: 36 };

  const OUTPOST_STRUCTURES = [
    // Muros perimetrales Bastion (dejan Portón Sur x:12.2..19.8 y Brecha Oeste z:-86.5..-81.5)
    { id: 'wall_n', kind: 'wall', minX: -1.0, maxX: 33.0, minZ: -99.2, maxZ: -97.6, h: 2.85, color: [0.46, 0.44, 0.39] },
    { id: 'wall_sl', kind: 'wall', minX: -1.0, maxX: 12.2, minZ: -70.6, maxZ: -69.0, h: 2.85, color: [0.46, 0.44, 0.39] },
    { id: 'wall_sr', kind: 'wall', minX: 19.8, maxX: 33.0, minZ: -70.6, maxZ: -69.0, h: 2.85, color: [0.46, 0.44, 0.39] },
    { id: 'wall_wn', kind: 'wall', minX: -1.0, maxX: 0.6, minZ: -98.0, maxZ: -86.5, h: 2.85, color: [0.46, 0.44, 0.39] },
    { id: 'wall_ws', kind: 'wall', minX: -1.0, maxX: 0.6, minZ: -81.5, maxZ: -69.5, h: 2.85, color: [0.46, 0.44, 0.39] },
    { id: 'wall_e', kind: 'wall', minX: 31.4, maxX: 33.0, minZ: -98.0, maxZ: -69.5, h: 2.85, color: [0.46, 0.44, 0.39] },
    // Barracón de Mando
    { id: 'bunker', kind: 'bunker', minX: 4.0, maxX: 12.2, minZ: -94.5, maxZ: -87.5, h: 3.3, color: [0.34, 0.36, 0.35] },
    // Torre de Vigilancia elevada (la plataforma va a y+4.5)
    { id: 'tower', kind: 'tower', minX: 24.6, maxX: 28.4, minZ: -94.4, maxZ: -90.6, h: 6.4, color: [0.28, 0.25, 0.22] },
    // Estación Generadora saboteable
    { id: 'generator', kind: 'generator', minX: 23.0, maxX: 26.2, minZ: -78.5, maxZ: -75.5, h: 1.85, color: [0.22, 0.28, 0.24] },
    // Contenedor Militar
    { id: 'container', kind: 'container', minX: 16.2, maxX: 21.8, minZ: -89.8, maxZ: -86.6, h: 2.55, color: [0.23, 0.29, 0.22] },
    // Trincheras de Sacos de Arena en patio
    { id: 'sandbag_w', kind: 'sandbag', minX: 8.2, maxX: 12.0, minZ: -78.4, maxZ: -77.1, h: 1.25, color: [0.49, 0.44, 0.35] },
    { id: 'sandbag_e', kind: 'sandbag', minX: 17.5, maxX: 21.4, minZ: -81.2, maxZ: -79.9, h: 1.25, color: [0.49, 0.44, 0.35] }
  ];

  const TerrainSystem = {
    chunkSize: 64,
    gridRes: 32, // step exacto = 2.0m sin costuras flotantes entre chunks
    gridChunks: 7, // 7x7 chunks activos = 448m ventana continua

    getTrailCenterX: (z) => Math.sin(z * 0.022) * 16.0 + Math.cos(z * 0.045) * 4.0,

    // Superficie analítica evaluada exactamente en los vértices del terreno WebGL2
    sampleHeight: (x, z) => {
      const dCamp = Math.hypot(x, z);
      const spawnBlend = Math.max(0, Math.min(1, (dCamp - 16) / 24));

      const broad = Noise2D.fbm(x * 0.0035, z * 0.0035, 3) * 46.0;
      const ridge = (1.0 - Math.abs(Noise2D.noise(x * 0.009 + 1.2, z * 0.009 - 0.7))) * 26.0;
      const micro = Noise2D.fbm(x * 0.035, z * 0.035, 2) * 2.8;

      const distTrail = Math.abs(x - TerrainSystem.getTrailCenterX(z));
      const trailCarve = Math.max(0, 1.0 - distTrail / 5.2) * 2.6;

      const raw = Math.max(0, broad + ridge + micro - trailCarve + 10.0);
      const flatBase = 9.5;
      let h = raw * spawnBlend + flatBase * (1.0 - spawnBlend);

      // Meseta nivelada para la Base Avanzada Cordillera (16, -84)
      const dOut = Math.hypot(x - OUTPOST_SITE.x, z - OUTPOST_SITE.z);
      if (dOut < OUTPOST_SITE.blendRadius) {
        const tOut = Math.max(0, Math.min(1, (dOut - OUTPOST_SITE.padRadius) / (OUTPOST_SITE.blendRadius - OUTPOST_SITE.padRadius)));
        const smooth = tOut * tOut * (3.0 - 2.0 * tOut);
        h = OUTPOST_SITE.y * (1.0 - smooth) + h * smooth;
      }
      return h;
    },

    // Evaluación baricéntrica EXACTA sobre los triángulos renderizados (cero traspaso de llantas/botas)
    getHeight: (x, z) => {
      const step = TerrainSystem.chunkSize / TerrainSystem.gridRes;
      const gx = Math.floor(x / step);
      const gz = Math.floor(z / step);
      const fx = (x - gx * step) / step;
      const fz = (z - gz * step) / step;
      const x0 = gx * step, z0 = gz * step;
      const h0 = TerrainSystem.sampleHeight(x0, z0);
      const h1 = TerrainSystem.sampleHeight(x0 + step, z0);
      const h2 = TerrainSystem.sampleHeight(x0, z0 + step);
      const h3 = TerrainSystem.sampleHeight(x0 + step, z0 + step);
      if (fx + fz <= 1.0) {
        return h0 + (h1 - h0) * fx + (h2 - h0) * fz;
      }
      const u = 1.0 - fx;
      const v = 1.0 - fz;
      return h3 + (h2 - h3) * u + (h1 - h3) * v;
    },

    getNormal: (x, z, out = [0, 1, 0]) => {
      const eps = 0.5;
      const hL = TerrainSystem.getHeight(x - eps, z);
      const hR = TerrainSystem.getHeight(x + eps, z);
      const hD = TerrainSystem.getHeight(x, z - eps);
      const hU = TerrainSystem.getHeight(x, z + eps);
      const nx = hL - hR, ny = eps * 2.0, nz = hD - hU;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
      return out;
    },

    getShrubDensity: (x, z) => {
      const distTrail = Math.abs(x - TerrainSystem.getTrailCenterX(z));
      if (distTrail < 2.6) return 0.0;
      if (Math.hypot(x, z) < 12) return 0.0;
      if (Math.hypot(x - OUTPOST_SITE.x, z - OUTPOST_SITE.z) < 22) return 0.0;
      return Noise2D.noise(x * 0.065 + 4.1, z * 0.065 - 2.3) * 0.5 + 0.5;
    }
  };

  const WorldColliders = {
    chunkCircles: new Map(),

    setChunkColliders: (key, list) => { WorldColliders.chunkCircles.set(key, list); },
    removeChunkColliders: (key) => { WorldColliders.chunkCircles.delete(key); },

    // Resuelve colisión circular contra muros/edificios del puesto avanzado, troncos y rocas
    resolveCircle: (pos, radius, entityY) => {
      let hit = false;
      let maxPush = 0;
      let hitKind = null;
      const yCheck = (entityY !== undefined) ? entityY : pos[1];

      // 1. Estructuras fijas de la Base Avanzada (solo si se está dentro del rango en Y)
      if (Math.hypot(pos[0] - OUTPOST_SITE.x, pos[2] - OUTPOST_SITE.z) < 28) {
        for (let i = 0; i < OUTPOST_STRUCTURES.length; i++) {
          const s = OUTPOST_STRUCTURES[i];
          if (yCheck > OUTPOST_SITE.y + s.h - 0.15) continue;
          const cx = Math.max(s.minX, Math.min(s.maxX, pos[0]));
          const cz = Math.max(s.minZ, Math.min(s.maxZ, pos[2]));
          const dx = pos[0] - cx, dz = pos[2] - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < radius * radius) {
            const d = Math.sqrt(d2);
            let nx = 0, nz = 1, pen = radius - d;
            if (d > 1e-4) {
              nx = dx / d; nz = dz / d;
            } else {
              // Dentro de la caja: expulsar por la cara más cercana
              const dl = Math.abs(pos[0] - s.minX), dr = Math.abs(s.maxX - pos[0]);
              const dt = Math.abs(pos[2] - s.minZ), db = Math.abs(s.maxZ - pos[2]);
              const m = Math.min(dl, dr, dt, db);
              if (m === dl) { nx = -1; nz = 0; pen = dl + radius; }
              else if (m === dr) { nx = 1; nz = 0; pen = dr + radius; }
              else if (m === dt) { nx = 0; nz = -1; pen = dt + radius; }
              else { nx = 0; nz = 1; pen = db + radius; }
            }
            pos[0] += nx * pen;
            pos[2] += nz * pen;
            hit = true;
            if (pen > maxPush) { maxPush = pen; hitKind = s.kind; }
          }
        }
      }

      // 2. Troncos de árboles y rocas grandes por chunk cercano
      const sz = TerrainSystem.chunkSize;
      const pcx = Math.floor(pos[0] / sz), pcz = Math.floor(pos[2] / sz);
      for (let dzc = -1; dzc <= 1; dzc++) {
        for (let dxc = -1; dxc <= 1; dxc++) {
          const arr = WorldColliders.chunkCircles.get(`${pcx + dxc},${pcz + dzc}`);
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            if (yCheck > c.y + c.h) continue;
            const dx = pos[0] - c.x, dz = pos[2] - c.z;
            const minR = radius + c.r;
            const d2 = dx * dx + dz * dz;
            if (d2 < minR * minR && d2 > 1e-6) {
              const d = Math.sqrt(d2);
              const pen = minR - d;
              pos[0] += (dx / d) * pen;
              pos[2] += (dz / d) * pen;
              hit = true;
              if (pen > maxPush) { maxPush = pen; hitKind = c.kind; }
            }
          }
        }
      }
      return { hit, maxPush, hitKind };
    },

    // Raymarch táctico para IA, sigilo real y balas bloqueadas por terreno/muros/rocas
    raycastObstruction: (ax, ay, az, bx, by, bz, includeTrees = true) => {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.05) return { blocked: false, hitDist: dist, concealment: 0 };
      const steps = Math.min(96, Math.max(8, Math.ceil(dist / 1.1)));
      let concealment = 0;

      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
        const th = TerrainSystem.getHeight(px, pz);
        if (py < th - 0.12) {
          return { blocked: true, hitDist: dist * t, reason: 'terrain', concealment };
        }
        // Chequeo muros y bunker de la base
        if (Math.hypot(px - OUTPOST_SITE.x, pz - OUTPOST_SITE.z) < 28) {
          for (let i = 0; i < OUTPOST_STRUCTURES.length; i++) {
            const st = OUTPOST_STRUCTURES[i];
            if (px >= st.minX && px <= st.maxX && pz >= st.minZ && pz <= st.maxZ &&
                py >= OUTPOST_SITE.y - 0.2 && py <= OUTPOST_SITE.y + st.h) {
              return { blocked: true, hitDist: dist * t, reason: st.kind, concealment };
            }
          }
        }
        // Chequeo ocultamiento en arbustos densos (atenúa visión IA, no frena balas)
        const sh = TerrainSystem.getShrubDensity(px, pz);
        if (py < th + 1.4 && sh > 0.42) concealment += 0.09 * sh;
      }

      if (includeTrees) {
        const invLen = 1.0 / dist;
        const ux = dx * invLen, uz = dz * invLen;
        const sz = TerrainSystem.chunkSize;
        const minCx = Math.floor(Math.min(ax, bx) / sz), maxCx = Math.floor(Math.max(ax, bx) / sz);
        const minCz = Math.floor(Math.min(az, bz) / sz), maxCz = Math.floor(Math.max(az, bz) / sz);
        for (let cz = minCz; cz <= maxCz; cz++) {
          for (let cx = minCx; cx <= maxCx; cx++) {
            const arr = WorldColliders.chunkCircles.get(`${cx},${cz}`);
            if (!arr) continue;
            for (let i = 0; i < arr.length; i++) {
              const c = arr[i];
              const vx = c.x - ax, vz = c.z - az;
              const proj = vx * ux + vz * uz;
              if (proj <= 0.3 || proj >= dist - 0.3) continue;
              const tProj = proj / dist;
              const py = ay + dy * tProj;
              if (py > c.y + c.h) continue;
              const perp2 = (vx * vx + vz * vz) - proj * proj;
              const rr = c.r + (c.kind === 'boulder' ? 0.15 : 0.05);
              if (perp2 < rr * rr) {
                return { blocked: true, hitDist: proj, reason: c.kind, concealment };
              }
            }
          }
        }
      }
      return { blocked: false, hitDist: dist, concealment: Math.min(1, concealment) };
    }
  };


  // 5. CONSTRUCTOR DE MALLAS RICAS (CILINDROS CERRADOS, RUEDAS, CORDILLERA CHAMPSAUR)
  function createStaticMesh(gl, verts, indices) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const stride = 9 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * 4);

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: indices.length };
  }

  function deleteStaticMesh(gl, m) {
    if (!m) return;
    if (m.vao) gl.deleteVertexArray(m.vao);
    if (m.vbo) gl.deleteBuffer(m.vbo);
    if (m.ibo) gl.deleteBuffer(m.ibo);
  }

  function makeUnitBox(gl) {
    const v = [
      // Delantera (+Z)
      -0.5,-0.5, 0.5,  0, 0, 1, 1,1,1,   0.5,-0.5, 0.5,  0, 0, 1, 1,1,1,
       0.5, 0.5, 0.5,  0, 0, 1, 1,1,1,  -0.5, 0.5, 0.5,  0, 0, 1, 1,1,1,
      // Trasera (-Z)
       0.5,-0.5,-0.5,  0, 0,-1, 1,1,1,  -0.5,-0.5,-0.5,  0, 0,-1, 1,1,1,
      -0.5, 0.5,-0.5,  0, 0,-1, 1,1,1,   0.5, 0.5,-0.5,  0, 0,-1, 1,1,1,
      // Superior (+Y)
      -0.5, 0.5, 0.5,  0, 1, 0, 1,1,1,   0.5, 0.5, 0.5,  0, 1, 0, 1,1,1,
       0.5, 0.5,-0.5,  0, 1, 0, 1,1,1,  -0.5, 0.5,-0.5,  0, 1, 0, 1,1,1,
      // Inferior (-Y)
      -0.5,-0.5,-0.5,  0,-1, 0, 1,1,1,   0.5,-0.5,-0.5,  0,-1, 0, 1,1,1,
       0.5,-0.5, 0.5,  0,-1, 0, 1,1,1,  -0.5,-0.5, 0.5,  0,-1, 0, 1,1,1,
      // Derecha (+X)
       0.5,-0.5, 0.5,  1, 0, 0, 1,1,1,   0.5,-0.5,-0.5,  1, 0, 0, 1,1,1,
       0.5, 0.5,-0.5,  1, 0, 0, 1,1,1,   0.5, 0.5, 0.5,  1, 0, 0, 1,1,1,
      // Izquierda (-X)
      -0.5,-0.5,-0.5, -1, 0, 0, 1,1,1,  -0.5,-0.5, 0.5, -1, 0, 0, 1,1,1,
      -0.5, 0.5, 0.5, -1, 0, 0, 1,1,1,  -0.5, 0.5,-0.5, -1, 0, 0, 1,1,1
    ];
    const idx = [];
    for (let f = 0; f < 6; f++) {
      const b = f * 4;
      idx.push(b, b+1, b+2, b, b+2, b+3);
    }
    return createStaticMesh(gl, v, idx);
  }

  // Rueda 3D cerrada completa con eje en X (rodadura limpia sin agujeros de culling)
  function buildWheelMesh(gl, radius = 0.45, width = 0.36, segs = 16) {
    const v = [], idx = [];
    const hw = width * 0.5;
    const tireCol = [0.09, 0.10, 0.11];
    const rimCol  = [0.38, 0.40, 0.44];

    // Banda de rodadura exterior
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const y0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
      const y1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      const ny = Math.cos((a0 + a1) * 0.5), nz = Math.sin((a0 + a1) * 0.5);

      const base = v.length / 9;
      v.push(-hw, y0, z0,  0, ny, nz, tireCol[0], tireCol[1], tireCol[2]);
      v.push( hw, y0, z0,  0, ny, nz, tireCol[0], tireCol[1], tireCol[2]);
      v.push( hw, y1, z1,  0, ny, nz, tireCol[0], tireCol[1], tireCol[2]);
      v.push(-hw, y1, z1,  0, ny, nz, tireCol[0], tireCol[1], tireCol[2]);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    // Tapas laterales (Rines exteriores en ambos extremos)
    for (const side of [1, -1]) {
      const sx = side * hw;
      const centerIdx = v.length / 9;
      v.push(sx, 0, 0, side, 0, 0, rimCol[0], rimCol[1], rimCol[2]);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const y = Math.cos(a) * radius, z = Math.sin(a) * radius;
        v.push(sx, y, z, side, 0, 0, tireCol[0] * 1.2, tireCol[1] * 1.2, tireCol[2] * 1.2);
      }
      for (let i = 0; i < segs; i++) {
        if (side > 0) idx.push(centerIdx, centerIdx + 1 + i, centerIdx + 1 + i + 1);
        else          idx.push(centerIdx, centerIdx + 1 + i + 1, centerIdx + 1 + i);
      }
    }
    return createStaticMesh(gl, v, idx);
  }

  // Cilindro en eje Y cerrado
  function buildCylinderY(gl, r = 0.5, h = 1.0, segs = 14) {
    const v = [], idx = [];
    const hh = h * 0.5;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const nx = Math.cos((a0 + a1) * 0.5), nz = Math.sin((a0 + a1) * 0.5);

      const b = v.length / 9;
      v.push(x0, -hh, z0, nx, 0, nz, 1, 1, 1);
      v.push(x1, -hh, z1, nx, 0, nz, 1, 1, 1);
      v.push(x1,  hh, z1, nx, 0, nz, 1, 1, 1);
      v.push(x0,  hh, z0, nx, 0, nz, 1, 1, 1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    // Tapas superior e inferior
    for (const side of [1, -1]) {
      const cy = side * hh;
      const cIdx = v.length / 9;
      v.push(0, cy, 0, 0, side, 0, 1, 1, 1);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        v.push(Math.cos(a) * r, cy, Math.sin(a) * r, 0, side, 0, 1, 1, 1);
      }
      for (let i = 0; i < segs; i++) {
        if (side > 0) idx.push(cIdx, cIdx + 1 + i + 1, cIdx + 1 + i);
        else          idx.push(cIdx, cIdx + 1 + i, cIdx + 1 + i + 1);
      }
    }
    return createStaticMesh(gl, v, idx);
  }

  // CORDILLERA MONUMENTAL DE CHAMPSAUR (PANORAMA 3D HORIZONTE 360°)
  function buildChampsaurMassif(gl) {
    const v = [], idx = [];
    const segments = 64;
    const innerRadius = 900.0, outerRadius = 2400.0;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);

      // Cumbres afiladas calizas con valles y neveros
      const peakFreq1 = Math.sin(angle * 7.0) * 110.0;
      const peakFreq2 = Math.cos(angle * 15.0) * 55.0;
      const peakHeight = 220.0 + peakFreq1 + peakFreq2;

      // Colores de roca alpina: Gris pizarra, caliza ocre y nieve en las crestas
      const snow = Math.max(0, (peakHeight - 240.0) / 90.0);
      const r = 0.52 + snow * 0.42, g = 0.50 + snow * 0.45, b = 0.48 + snow * 0.49;

      // Vértice base (valle)
      v.push(cosA * innerRadius, 20.0, sinA * innerRadius, -cosA, 0.3, -sinA, 0.28, 0.32, 0.26);
      // Vértice cresta (cumbre alpina)
      v.push(cosA * outerRadius, peakHeight, sinA * outerRadius, -cosA, 0.4, -sinA, r, g, b);
    }

    for (let i = 0; i < segments; i++) {
      const b0 = i * 2;
      const b1 = (i + 1) * 2;
      idx.push(b0, b1, b0 + 1);
      idx.push(b1, b1 + 1, b0 + 1);
    }
    return createStaticMesh(gl, v, idx);
  }

  // Helper geométrico para troncos y ramas orgánicas entre dos puntos 3D
  function pushTaperedBranch(v, idx, ax, ay, az, bx, by, bz, r0, r1, segs, col0, col1) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    const uy = dy / len, ux = dx / len, uz = dz / len;
    // Base ortonormal perpendicular al eje de la rama
    const refX = Math.abs(uy) < 0.9 ? 0 : 1, refY = Math.abs(uy) < 0.9 ? 1 : 0;
    let tx = refY * uz - 0 * uy, ty = 0 * ux - refX * uz, tz = refX * uy - refY * ux;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const bxAxis = uy * tz - uz * ty, byAxis = uz * tx - ux * tz, bzAxis = ux * ty - uy * tx;

    const base = v.length / 9;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = tx * ca + bxAxis * sa;
      const ny = ty * ca + byAxis * sa;
      const nz = tz * ca + bzAxis * sa;
      v.push(ax + nx * r0, ay + ny * r0, az + nz * r0, nx, ny, nz, col0[0], col0[1], col0[2]);
      v.push(bx + nx * r1, by + ny * r1, bz + nz * r1, nx, ny, nz, col1[0], col1[1], col1[2]);
    }
    for (let i = 0; i < segs; i++) {
      const p0 = base + i * 2, p1 = p0 + 1, p2 = p0 + 2, p3 = p0 + 3;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }

  // Helper de racimo de hojas/acículas cruzadas en 3D (DOBLE CARA real, opaco desde abajo y arriba)
  function pushLeafTuftCluster(v, idx, cx, cy, cz, rx, ry, yaw0, colDark, colBright) {
    for (let p = 0; p < 3; p++) {
      const ang = yaw0 + (p * Math.PI) / 3;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa * 0.65, ny = 0.72, nz = ca * 0.65;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const u = nx / nl, vN = ny / nl, w = nz / nl;
      const b = v.length / 9;
      // Rombo orgánico ligeramente arqueado hacia abajo en puntas (conífera alpina)
      v.push(cx, cy - ry * 0.35, cz, u, vN, w, colDark[0], colDark[1], colDark[2]);
      v.push(cx - ca * rx, cy - ry * 0.08, cz - sa * rx, u, vN, w, colBright[0] * 0.88, colBright[1] * 0.88, colBright[2] * 0.88);
      v.push(cx + ca * rx * 0.35, cy + ry * 0.82, cz + sa * rx * 0.35, 0, 1, 0, colBright[0], colBright[1], colBright[2]);
      v.push(cx + ca * rx, cy - ry * 0.14, cz + sa * rx, u, vN, w, colBright[0] * 0.92, colBright[1] * 0.92, colBright[2] * 0.92);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }

  // Follaje Típico: Alerce Dorado de Otoño (Malla separada Tronco+Ramas vs Hojas Doble-Cara)
  function buildAutumnLarchTrunk(gl) {
    const v = [], idx = [];
    const bark0 = [0.24, 0.17, 0.12], bark1 = [0.34, 0.24, 0.16];
    pushTaperedBranch(v, idx, 0, -0.15, 0, 0.08, 4.6, -0.05, 0.28, 0.16, 7, bark0, bark1);
    pushTaperedBranch(v, idx, 0.08, 4.5, -0.05, -0.04, 9.6, 0.04, 0.16, 0.04, 6, bark1, bark1);
    // Ramas principales orgánicas radiales (visibles al mirar hacia arriba!)
    const branches = [
      [0.04, 2.7, 0.0,  1.55, 2.35, 0.45],
      [0.04, 3.3, 0.0, -1.45, 2.90, -0.60],
      [0.06, 4.1, 0.0, -0.35, 3.80, 1.50],
      [0.06, 4.8, 0.0,  0.55, 4.55, -1.35],
      [0.02, 5.7, 0.0,  1.15, 5.55, -0.25],
      [0.01, 6.5, 0.0, -1.05, 6.35, 0.45],
      [-0.02, 7.6, 0.02, 0.25, 7.50, 0.85]
    ];
    for (const [ax, ay, az, bx, by, bz] of branches) {
      pushTaperedBranch(v, idx, ax, ay, az, bx, by, bz, 0.08, 0.025, 5, bark0, bark1);
    }
    return createStaticMesh(gl, v, idx);
  }

  function buildAutumnLarchLeaves(gl) {
    const v = [], idx = [];
    const levels = [
      { y: 2.6, r: 1.55, count: 6, scale: 1.15, dark: [0.62, 0.40, 0.09], bright: [0.88, 0.60, 0.15] },
      { y: 4.1, r: 1.35, count: 6, scale: 1.05, dark: [0.68, 0.45, 0.11], bright: [0.95, 0.70, 0.19] },
      { y: 5.7, r: 1.08, count: 5, scale: 0.95, dark: [0.74, 0.50, 0.12], bright: [0.98, 0.77, 0.23] },
      { y: 7.4, r: 0.76, count: 5, scale: 0.82, dark: [0.78, 0.55, 0.14], bright: [0.99, 0.84, 0.28] },
      { y: 9.1, r: 0.34, count: 3, scale: 0.65, dark: [0.82, 0.62, 0.18], bright: [1.00, 0.88, 0.34] }
    ];
    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      for (let i = 0; i < lv.count; i++) {
        const a = (i / lv.count) * Math.PI * 2 + li * 0.55;
        const cx = Math.cos(a) * lv.r;
        const cz = Math.sin(a) * lv.r;
        pushLeafTuftCluster(v, idx, cx, lv.y, cz, 1.05 * lv.scale, 1.10 * lv.scale, a, lv.dark, lv.bright);
      }
      // Núcleo interno denso alrededor del tronco para evitar huecos vacíos desde abajo
      pushLeafTuftCluster(v, idx, 0, lv.y + 0.25, 0, 0.95 * lv.scale, 1.0 * lv.scale, li * 1.1, lv.dark, lv.bright);
    }
    return createStaticMesh(gl, v, idx);
  }

  // Follaje: Piornal Serrano (Matas cruzadas densas con tallo y floración alpina - Doble Cara)
  function buildPiornalBush(gl) {
    const v = [], idx = [];
    const stems = [
      [0, 0, 0.92, 0.95, 0.2], [0.22, 0.16, 0.78, 0.82, 1.1],
      [-0.24, 0.14, 0.76, 0.78, 2.2], [-0.15, -0.22, 0.74, 0.75, 0.7],
      [0.20, -0.18, 0.72, 0.74, 1.7]
    ];
    for (let si = 0; si < stems.length; si++) {
      const [sx, sz, rx, ry, yaw] = stems[si];
      const dark = si % 2 === 0 ? [0.15, 0.26, 0.10] : [0.18, 0.30, 0.11];
      const bright = si === 0 ? [0.40, 0.50, 0.16] : [0.28, 0.44, 0.16];
      for (let k = 0; k < 2; k++) {
        const a = yaw + k * (Math.PI * 0.5);
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = -sa * 0.45, ny = 0.88, nz = ca * 0.45;
        const b = v.length / 9;
        v.push(sx - ca * rx * 0.45, 0.0, sz - sa * rx * 0.45, nx, ny, nz, dark[0], dark[1], dark[2]);
        v.push(sx + ca * rx * 0.45, 0.0, sz + sa * rx * 0.45, nx, ny, nz, dark[0], dark[1], dark[2]);
        v.push(sx + ca * rx * 0.72, ry * 0.72, sz + sa * rx * 0.72, nx, ny, nz, bright[0], bright[1], bright[2]);
        v.push(sx, ry, sz, 0, 1, 0, bright[0] * 1.12, bright[1] * 1.12, bright[2] * 1.05);
        v.push(sx - ca * rx * 0.72, ry * 0.68, sz - sa * rx * 0.72, nx, ny, nz, bright[0], bright[1], bright[2]);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 3, b + 4);
      }
    }
    return createStaticMesh(gl, v, idx);
  }

  // Follaje: Tapete de Hierba y Helechos Alpinos (14 briznas arqueadas por instancia -> altísima densidad a 60 FPS)
  function buildGrassCarpetMesh(gl) {
    const v = [], idx = [];
    for (let i = 0; i < 14; i++) {
      const ang = (i * 2.39996); // Ángulo áureo
      const rad = 0.18 + Math.sqrt((i + 0.5) / 14) * 1.35;
      const bx = Math.cos(ang) * rad;
      const bz = Math.sin(ang) * rad;
      const rot = (i * 1.618) % Math.PI;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      const bladeH = 0.42 + (i % 4) * 0.13;
      const lean = 0.16 + (i % 3) * 0.07;
      const w = 0.085;
      const tone = (i % 5 === 0) ? [0.46, 0.49, 0.22] : ((i % 2 === 0) ? [0.27, 0.43, 0.18] : [0.33, 0.46, 0.20]);
      const dark = [tone[0] * 0.46, tone[1] * 0.46, tone[2] * 0.46];
      const tip = [Math.min(1, tone[0] * 1.25), Math.min(1, tone[1] * 1.22), tone[2] * 1.08];
      const nx = -sa * 0.35, ny = 0.90, nz = ca * 0.35;

      const b = v.length / 9;
      v.push(bx - ca * w, -0.02, bz - sa * w, nx, ny, nz, dark[0], dark[1], dark[2]);
      v.push(bx + ca * w, -0.02, bz + sa * w, nx, ny, nz, dark[0], dark[1], dark[2]);
      v.push(bx + ca * w * 0.55 + Math.cos(ang) * lean * 0.5, bladeH * 0.55, bz + sa * w * 0.55 + Math.sin(ang) * lean * 0.5, nx, ny, nz, tone[0], tone[1], tone[2]);
      v.push(bx - ca * w * 0.55 + Math.cos(ang) * lean * 0.5, bladeH * 0.55, bz - sa * w * 0.55 + Math.sin(ang) * lean * 0.5, nx, ny, nz, tone[0], tone[1], tone[2]);
      v.push(bx + Math.cos(ang) * lean, bladeH, bz + Math.sin(ang) * lean, 0, 1, 0, tip[0], tip[1], tip[2]);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 3, b + 2, b + 4);
    }
    return createStaticMesh(gl, v, idx);
  }

  // Follaje: Pino Silvestre Retorcido (Malla separada Tronco+Ramas vs Copa Pino Doble-Cara)
  function buildScotsPineTrunk(gl) {
    const v = [], idx = [];
    const barkBot = [0.28, 0.19, 0.14], barkTop = [0.54, 0.31, 0.21]; // Corteza rojiza alta típica del Pinus sylvestris
    pushTaperedBranch(v, idx, 0, -0.15, 0, 0.20, 4.2, -0.14, 0.31, 0.20, 7, barkBot, barkBot);
    pushTaperedBranch(v, idx, 0.20, 4.1, -0.14, 0.36, 8.2, -0.22, 0.20, 0.08, 6, barkTop, barkTop);
    const crownArms = [
      [0.24, 5.2, -0.16,  1.85, 5.65,  0.40],
      [0.26, 5.8, -0.18, -1.55, 6.25, -0.85],
      [0.30, 6.5, -0.20,  0.45, 7.10,  1.65],
      [0.32, 7.0, -0.21, -0.75, 7.65, -1.45],
      [0.34, 7.6, -0.22,  1.05, 8.35, -0.95]
    ];
    for (const [ax, ay, az, bx, by, bz] of crownArms) {
      pushTaperedBranch(v, idx, ax, ay, az, bx, by, bz, 0.10, 0.03, 5, barkTop, barkTop);
    }
    return createStaticMesh(gl, v, idx);
  }

  function buildScotsPineLeaves(gl) {
    const v = [], idx = [];
    const pads = [
      [1.75, 5.7, 0.38, 1.45, 1.05], [-1.50, 6.3, -0.80, 1.40, 1.00],
      [0.45, 7.1, 1.55, 1.35, 0.95], [-0.70, 7.7, -1.35, 1.28, 0.92],
      [1.00, 8.3, -0.90, 1.15, 0.88], [0.35, 8.75, -0.22, 1.45, 1.15],
      [0.28, 6.9, -0.20, 1.35, 1.05]
    ];
    for (let i = 0; i < pads.length; i++) {
      const [px, py, pz, rx, ry] = pads[i];
      pushLeafTuftCluster(v, idx, px, py, pz, rx, ry, i * 0.9, [0.09, 0.17, 0.11], [0.18, 0.32, 0.19]);
    }
    return createStaticMesh(gl, v, idx);
  }

  // Roca / Canchal de Granito Alpino
  function buildGraniteBoulder(gl) {
    // Poliedro granítico cerrado con normales faciales verificadas hacia afuera
    const rawPts = [
      [-1.15, -0.15, -0.95], [0.05, -0.15, -1.22], [1.22, -0.15, -0.80],
      [1.08, -0.15,  1.05], [-0.12, -0.15,  1.18], [-1.05, -0.15,  0.88],
      [-0.78,  0.65, -0.62], [0.12,  0.72, -0.78], [0.85,  0.60, -0.42],
      [0.72,  0.58,  0.68], [-0.15,  0.68,  0.76], [-0.74,  0.55,  0.52],
      [-0.18,  1.28, -0.12], [0.28,  1.16,  0.24]
    ];
    const tris = [
      [0,6,7], [0,7,1], [1,7,8], [1,8,2], [2,8,9], [2,9,3],
      [3,9,10], [3,10,4], [4,10,11], [4,11,5], [5,11,6], [5,6,0],
      [6,12,7], [7,12,8], [8,12,13], [8,13,9], [9,13,10], [10,13,11], [11,13,12], [11,12,6],
      [1,4,0], [1,2,3], [1,3,4], [4,5,0]
    ];
    const cx = 0.0, cy = 0.45, cz = 0.0;
    const v = [], idx = [];
    let vo = 0;
    for (const [ia, ib, ic] of tris) {
      let a = rawPts[ia], b = rawPts[ib], c = rawPts[ic];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) {
        const tmp = b; b = c; c = tmp;
        nx = -nx; ny = -ny; nz = -nz;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const shade = 0.40 + 0.08 * ny;
      for (const p of [a, b, c]) {
        v.push(p[0], p[1], p[2], nx, ny, nz, shade, shade + 0.02, shade + 0.04);
      }
      idx.push(vo, vo + 1, vo + 2);
      vo += 3;
    }
    return createStaticMesh(gl, v, idx);
  }

  // Malla de Chunks de Terreno Dinámico (alineada 1:1 con TerrainSystem.getHeight baricéntrico)
  function buildTerrainChunkMesh(gl, startX, startZ, size, res) {
    const verts = [], indices = [];
    const step = size / res;

    for (let iz = 0; iz <= res; iz++) {
      const z = startZ + iz * step;
      for (let ix = 0; ix <= res; ix++) {
        const x = startX + ix * step;
        const y = TerrainSystem.sampleHeight(x, z);
        const norm = TerrainSystem.getNormal(x, z);

        // Texturizado procedural: Sendero de tierra, grava del Puesto Avanzado, pasto alpino y granito
        const distTrail = Math.abs(x - TerrainSystem.getTrailCenterX(z));
        const trailFactor = Math.max(0, Math.min(1, 1.0 - distTrail / 2.6));
        const dOut = Math.hypot(x - OUTPOST_SITE.x, z - OUTPOST_SITE.z);
        const outpostPad = Math.max(0, Math.min(1, 1.0 - Math.max(0, dOut - 17.5) / 5.5));

        const trailCol = [0.68, 0.62, 0.52];
        const grassCol = [0.27, 0.40, 0.21];
        const padCol   = [0.43, 0.44, 0.43];
        const rockCol  = [0.46, 0.48, 0.50];

        let col = [
          grassCol[0] * (1.0 - trailFactor) + trailCol[0] * trailFactor,
          grassCol[1] * (1.0 - trailFactor) + trailCol[1] * trailFactor,
          grassCol[2] * (1.0 - trailFactor) + trailCol[2] * trailFactor
        ];
        if (outpostPad > 0) {
          col[0] = col[0] * (1 - outpostPad) + padCol[0] * outpostPad;
          col[1] = col[1] * (1 - outpostPad) + padCol[1] * outpostPad;
          col[2] = col[2] * (1 - outpostPad) + padCol[2] * outpostPad;
        }

        const slope = 1.0 - norm[1];
        if (slope > 0.30) {
          const rockBlend = Math.min(1.0, (slope - 0.30) * 3.0);
          col[0] = col[0] * (1.0 - rockBlend) + rockCol[0] * rockBlend;
          col[1] = col[1] * (1.0 - rockBlend) + rockCol[1] * rockBlend;
          col[2] = col[2] * (1.0 - rockBlend) + rockCol[2] * rockBlend;
        }

        verts.push(x, y, z, norm[0], norm[1], norm[2], col[0], col[1], col[2]);
      }
    }

    const rowSize = res + 1;
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        const i0 = iz * rowSize + ix;
        const i1 = i0 + 1;
        const i2 = i0 + rowSize;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
    return createStaticMesh(gl, verts, indices);
  }

  // 6. GESTOR DE CHUNKS INFINITOS, COLISIONES DE BOSQUE & INSTANCIACIÓN GPU DENSA
  const ChunkManager = {
    chunks: new Map(),
    instDataGrass: [],
    instDataPiornal: [],
    instDataLarch: [],
    instDataPine: [],
    instDataBoulder: [],

    getChunkKey: (cx, cz) => cx + ',' + cz,

    hash2: (cx, cz, idx, salt) => {
      const n = Math.sin(cx * 127.1 + cz * 311.7 + idx * 74.7 + salt * 19.19) * 43758.5453;
      return n - Math.floor(n);
    },

    updateGrid: (gl, playerX, playerZ) => {
      const sz = TerrainSystem.chunkSize;
      const curCX = Math.floor(playerX / sz);
      const curCZ = Math.floor(playerZ / sz);
      const half = Math.floor(TerrainSystem.gridChunks / 2);

      const wanted = new Set();
      let dirty = false;

      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) {
          const cx = curCX + dx, cz = curCZ + dz;
          const key = ChunkManager.getChunkKey(cx, cz);
          wanted.add(key);

          if (!ChunkManager.chunks.has(key)) {
            const mesh = buildTerrainChunkMesh(gl, cx * sz, cz * sz, sz, TerrainSystem.gridRes);
            const fol = ChunkManager.generateChunkFoliage(cx, cz, sz);
            ChunkManager.chunks.set(key, { mesh, cx, cz, ...fol });
            WorldColliders.setChunkColliders(key, fol.colliders);
            dirty = true;
          }
        }
      }

      for (const [key, chunk] of ChunkManager.chunks.entries()) {
        if (!wanted.has(key)) {
          deleteStaticMesh(gl, chunk.mesh);
          ChunkManager.chunks.delete(key);
          WorldColliders.removeChunkColliders(key);
          dirty = true;
        }
      }

      if (dirty) ChunkManager.rebuildFoliageBuffers(gl);
      return (ChunkManager.instDataPiornal.length + ChunkManager.instDataGrass.length) / 8;
    },

    generateChunkFoliage: (cx, cz, sz) => {
      const startX = cx * sz, startZ = cz * sz;
      const grass = [], piornal = [], larch = [], pine = [], boulder = [], colliders = [];

      // 1) Capa de Tapete de Hierba / Helechos (alta densidad orgánica estilo sendero de montaña)
      for (let i = 0; i < 230; i++) {
        const wx = startX + ChunkManager.hash2(cx, cz, i, 1) * sz;
        const wz = startZ + ChunkManager.hash2(cx, cz, i, 2) * sz;
        if (Math.hypot(wx - OUTPOST_SITE.x, wz - OUTPOST_SITE.z) < 20.5) continue;
        const distTrail = Math.abs(wx - TerrainSystem.getTrailCenterX(wz));
        if (distTrail < 1.8 || Math.hypot(wx, wz) < 8.5) continue;

        const norm = TerrainSystem.getNormal(wx, wz);
        if (norm[1] < 0.68) continue;
        const h = TerrainSystem.getHeight(wx, wz);
        const yaw = ChunkManager.hash2(cx, cz, i, 3) * 6.2831;
        const edgeShrink = Math.min(1.0, (distTrail - 1.8) * 0.45);
        const scale = (0.78 + ChunkManager.hash2(cx, cz, i, 4) * 0.65) * (0.65 + 0.35 * edgeShrink);
        grass.push(wx, h, wz, scale, yaw, 0.72, 0.75, 0.45 + ChunkManager.hash2(cx, cz, i, 5) * 0.55);
      }

      // 2) Arbustos Piornal Serrano, Alerces Dorados, Pinos Silvestres y Rocas con Colisión Real
      for (let i = 0; i < 165; i++) {
        const wx = startX + ChunkManager.hash2(cx, cz, i, 11) * sz;
        const wz = startZ + ChunkManager.hash2(cx, cz, i, 12) * sz;
        const dOut = Math.hypot(wx - OUTPOST_SITE.x, wz - OUTPOST_SITE.z);
        if (dOut < 23.0) continue; // Despejar patio y muros del puesto enemigo
        const distTrail = Math.abs(wx - TerrainSystem.getTrailCenterX(wz));
        if (distTrail < 2.6 || Math.hypot(wx, wz) < 11.5) continue;

        const norm = TerrainSystem.getNormal(wx, wz);
        if (norm[1] < 0.72) continue;
        const density = TerrainSystem.getShrubDensity(wx, wz);
        if (density < 0.22) continue;

        const h = TerrainSystem.getHeight(wx, wz);
        const yaw = ChunkManager.hash2(cx, cz, i, 13) * 6.2831;
        const roll = ChunkManager.hash2(cx, cz, i, 14) * 100;

        if (roll < 70) {
          const scale = 0.85 + density * 0.85;
          piornal.push(wx, h, wz, scale, yaw, 0.52, 0.50, density);
        } else if (roll < 82) {
          const scale = 0.88 + density * 0.55;
          larch.push(wx, h, wz, scale, yaw, 0.20, 0.80, 0.38);
          colliders.push({ x: wx, y: h, z: wz, r: 0.36 * scale, h: 9.5 * scale, kind: 'tree' });
        } else if (roll < 91) {
          const scale = 0.88 + density * 0.52;
          pine.push(wx, h, wz, scale, yaw, 0.14, 0.42, 0.32);
          colliders.push({ x: wx, y: h, z: wz, r: 0.40 * scale, h: 8.5 * scale, kind: 'tree' });
        } else {
          const scale = 0.75 + density * 0.75;
          boulder.push(wx, h, wz, scale, yaw, 0.0, 0.0, 0.0);
          colliders.push({ x: wx, y: h, z: wz, r: 0.96 * scale, h: 1.25 * scale, kind: 'boulder' });
        }
      }
      return { grass, piornal, larch, pine, boulder, colliders };
    },

    rebuildFoliageBuffers: (gl) => {
      ChunkManager.instDataGrass = [];
      ChunkManager.instDataPiornal = [];
      ChunkManager.instDataLarch = [];
      ChunkManager.instDataPine = [];
      ChunkManager.instDataBoulder = [];
      for (const ch of ChunkManager.chunks.values()) {
        for (let i = 0; i < ch.grass.length; i++) ChunkManager.instDataGrass.push(ch.grass[i]);
        for (let i = 0; i < ch.piornal.length; i++) ChunkManager.instDataPiornal.push(ch.piornal[i]);
        for (let i = 0; i < ch.larch.length; i++) ChunkManager.instDataLarch.push(ch.larch[i]);
        for (let i = 0; i < ch.pine.length; i++) ChunkManager.instDataPine.push(ch.pine[i]);
        for (let i = 0; i < ch.boulder.length; i++) ChunkManager.instDataBoulder.push(ch.boulder[i]);
      }
      function upload(buf, data) {
        if (!buf) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      }
      upload(ChunkManager.bufGrass, ChunkManager.instDataGrass);
      upload(ChunkManager.bufPiornal, ChunkManager.instDataPiornal);
      upload(ChunkManager.bufLarch, ChunkManager.instDataLarch);
      upload(ChunkManager.bufPine, ChunkManager.instDataPine);
      upload(ChunkManager.bufBoulder, ChunkManager.instDataBoulder);
    }
  };

