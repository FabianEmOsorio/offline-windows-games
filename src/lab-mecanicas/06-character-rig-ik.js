  // ============================================================================
  // 6B. OPERADOR 3D DE MALLA CONTINUA SOLDADA (20 HUESOS, -Z FRONTAL, L=-X, R=+X)
  // ============================================================================
  const BONE_DEFS = [
    { name: 'Pelvis',     parent: -1, head: [ 0.00, 0.96,  0.00], tail: [ 0.00, 1.09,  0.00] }, // 0
    { name: 'Spine1',     parent:  0, head: [ 0.00, 1.09,  0.00], tail: [ 0.00, 1.25,  0.00] }, // 1
    { name: 'Spine2',     parent:  1, head: [ 0.00, 1.25,  0.00], tail: [ 0.00, 1.44,  0.00] }, // 2
    { name: 'Neck',       parent:  2, head: [ 0.00, 1.44,  0.00], tail: [ 0.00, 1.53,  0.00] }, // 3
    { name: 'Head',       parent:  3, head: [ 0.00, 1.53,  0.00], tail: [ 0.00, 1.74,  0.00] }, // 4
    { name: 'ClavicleL',  parent:  2, head: [-0.03, 1.41,  0.00], tail: [-0.17, 1.42,  0.00] }, // 5
    { name: 'UpperArmL',  parent:  5, head: [-0.17, 1.42,  0.00], tail: [-0.45, 1.42,  0.00] }, // 6
    { name: 'ForearmL',   parent:  6, head: [-0.45, 1.42,  0.00], tail: [-0.71, 1.42,  0.00] }, // 7
    { name: 'HandL',      parent:  7, head: [-0.71, 1.42,  0.00], tail: [-0.83, 1.42,  0.00] }, // 8
    { name: 'ClavicleR',  parent:  2, head: [ 0.03, 1.41,  0.00], tail: [ 0.17, 1.42,  0.00] }, // 9
    { name: 'UpperArmR',  parent:  9, head: [ 0.17, 1.42,  0.00], tail: [ 0.45, 1.42,  0.00] }, // 10
    { name: 'ForearmR',   parent: 10, head: [ 0.45, 1.42,  0.00], tail: [ 0.71, 1.42,  0.00] }, // 11
    { name: 'HandR',      parent: 11, head: [ 0.71, 1.42,  0.00], tail: [ 0.83, 1.42,  0.00] }, // 12
    { name: 'ThighL',     parent:  0, head: [-0.10, 0.94,  0.00], tail: [-0.10, 0.51,  0.00] }, // 13
    { name: 'CalfL',      parent: 13, head: [-0.10, 0.51,  0.00], tail: [-0.10, 0.08,  0.00] }, // 14
    { name: 'FootL',      parent: 14, head: [-0.10, 0.08,  0.00], tail: [-0.10, 0.02, -0.18] }, // 15
    { name: 'ThighR',     parent:  0, head: [ 0.10, 0.94,  0.00], tail: [ 0.10, 0.51,  0.00] }, // 16
    { name: 'CalfR',      parent: 16, head: [ 0.10, 0.51,  0.00], tail: [ 0.10, 0.08,  0.00] }, // 17
    { name: 'FootR',      parent: 17, head: [ 0.10, 0.08,  0.00], tail: [ 0.10, 0.02, -0.18] }, // 18
    { name: 'WeaponBone', parent:  2, head: [ 0.00, 0.00,  0.00], tail: [ 0.00, 0.00, -0.60] }  // 19
  ];

  const MESH_RES_PRESETS = {
    std:   { radial: 10, limb: 10, heightMul: 1 },
    high:  { radial: 16, limb: 12, heightMul: 1 },
    ultra: { radial: 24, limb: 16, heightMul: 2 }
  };

  function distPointToSegSq(px, py, pz, ax, ay, az, bx, by, bz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz || 1e-6;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq));
    const dx = px - (ax + t * abx), dy = py - (ay + t * aby), dz = pz - (az + t * abz);
    return dx * dx + dy * dy + dz * dz;
  }

  function computeEnvelopeWeights(vx, vy, vz, allowedBones) {
    const candidates = [];
    for (const bi of allowedBones) {
      const b = BONE_DEFS[bi];
      const dSq = distPointToSegSq(vx, vy, vz, b.head[0], b.head[1], b.head[2], b.tail[0], b.tail[1], b.tail[2]);
      let falloff = 0.0065;
      if (bi <= 2) falloff = 0.016;
      else if (bi === 5 || bi === 9) falloff = 0.009;
      let w = Math.exp(-dSq / falloff);
      // Aislamiento estricto Izquierda (-X) vs Derecha (+X) en extremidades
      if ((bi >= 5 && bi <= 8) || (bi >= 13 && bi <= 15)) {
        if (vx > 0.015) w *= 0.01;
      } else if ((bi >= 9 && bi <= 12) || (bi >= 16 && bi <= 18)) {
        if (vx < -0.015) w *= 0.01;
      }
      candidates.push({ bi, w });
    }
    candidates.sort((a, b) => b.w - a.w);
    const j = [0, 0, 0, 0], wt = [0, 0, 0, 0];
    let sum = 0;
    for (let k = 0; k < 4 && k < candidates.length; k++) {
      j[k] = candidates[k].bi;
      wt[k] = candidates[k].w;
      sum += wt[k];
    }
    if (sum < 1e-7) { wt[0] = 1.0; j[0] = allowedBones[0] || 0; }
    else { for (let k = 0; k < 4; k++) wt[k] /= sum; }
    return { j, wt };
  }

  function buildContinuousSkinnedOperatorMesh(presetKey = 'high') {
    const preset = MESH_RES_PRESETS[presetKey] || MESH_RES_PRESETS.high;
    const verts = [];
    const indices = [];
    const ranges = {};

    function pushVert(x, y, z, nx, ny, nz, matId, forcedBone, allowedBones) {
      const idx = verts.length / 15;
      const nl = Math.hypot(nx, ny, nz) || 1;
      let j, wt;
      if (forcedBone !== null && forcedBone !== undefined) {
        j = [forcedBone, 0, 0, 0]; wt = [1, 0, 0, 0];
      } else {
        ({ j, wt } = computeEnvelopeWeights(x, y, z, allowedBones));
      }
      verts.push(
        x, y, z,
        nx / nl, ny / nl, nz / nl,
        matId,
        j[0], j[1], j[2], j[3],
        wt[0], wt[1], wt[2], wt[3]
      );
      return idx;
    }

    function pushTriChecked(i0, i1, i2, refCenter) {
      const p0 = [verts[i0*15], verts[i0*15+1], verts[i0*15+2]];
      const p1 = [verts[i1*15], verts[i1*15+1], verts[i1*15+2]];
      const p2 = [verts[i2*15], verts[i2*15+1], verts[i2*15+2]];
      const ux = p1[0]-p0[0], uy = p1[1]-p0[1], uz = p1[2]-p0[2];
      const vx = p2[0]-p0[0], vy = p2[1]-p0[1], vz = p2[2]-p0[2];
      const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      const mx = (p0[0]+p1[0]+p2[0])/3 - refCenter[0];
      const my = (p0[1]+p1[1]+p2[1])/3 - refCenter[1];
      const mz = (p0[2]+p1[2]+p2[2])/3 - refCenter[2];
      if (nx*mx + ny*my + nz*mz < 0) indices.push(i0, i2, i1);
      else indices.push(i0, i1, i2);
    }

    function addContinuousLoft(rings, segs, allowedBones, forcedBone, capEnds = true) {
      const ringStarts = [];
      let avgX = 0, avgY = 0, avgZ = 0;
      for (const r of rings) { avgX += r.c[0]; avgY += r.c[1]; avgZ += r.c[2]; }
      avgX /= rings.length; avgY /= rings.length; avgZ /= rings.length;

      for (const r of rings) {
        const rs = verts.length / 15;
        ringStarts.push(rs);
        for (let s = 0; s < segs; s++) {
          const th = (s / segs) * Math.PI * 2;
          const ct = Math.cos(th), st = Math.sin(th);
          const px = r.c[0] + r.u[0]*ct*r.ru + r.v[0]*st*r.rv;
          const py = r.c[1] + r.u[1]*ct*r.ru + r.v[1]*st*r.rv;
          const pz = r.c[2] + r.u[2]*ct*r.ru + r.v[2]*st*r.rv;
          const nx = r.u[0]*ct/(r.ru||1) + r.v[0]*st/(r.rv||1);
          const ny = r.u[1]*ct/(r.ru||1) + r.v[1]*st/(r.rv||1);
          const nz = r.u[2]*ct/(r.ru||1) + r.v[2]*st/(r.rv||1);
          const m = typeof r.mat === 'function' ? r.mat(th, px, py, pz) : r.mat;
          pushVert(px, py, pz, nx, ny, nz, m, forcedBone, allowedBones);
        }
      }
      for (let ri = 0; ri < rings.length - 1; ri++) {
        const cRef = [
          (rings[ri].c[0] + rings[ri+1].c[0]) * 0.5,
          (rings[ri].c[1] + rings[ri+1].c[1]) * 0.5,
          (rings[ri].c[2] + rings[ri+1].c[2]) * 0.5
        ];
        const aBase = ringStarts[ri], bBase = ringStarts[ri + 1];
        for (let s = 0; s < segs; s++) {
          const sn = (s + 1) % segs;
          pushTriChecked(aBase + s, aBase + sn, bBase + s, cRef);
          pushTriChecked(aBase + sn, bBase + sn, bBase + s, cRef);
        }
      }
      if (capEnds && rings.length >= 2) {
        const first = rings[0], last = rings[rings.length - 1];
        const cBot = pushVert(first.c[0], first.c[1], first.c[2], first.c[0]-avgX, first.c[1]-avgY, first.c[2]-avgZ, typeof first.mat==='function'?first.mat(0,first.c[0],first.c[1],first.c[2]):first.mat, forcedBone, allowedBones);
        const cTop = pushVert(last.c[0], last.c[1], last.c[2], last.c[0]-avgX, last.c[1]-avgY, last.c[2]-avgZ, typeof last.mat==='function'?last.mat(0,last.c[0],last.c[1],last.c[2]):last.mat, forcedBone, allowedBones);
        const midBot = [avgX, avgY, avgZ];
        for (let s = 0; s < segs; s++) {
          const sn = (s + 1) % segs;
          pushTriChecked(cBot, ringStarts[0] + sn, ringStarts[0] + s, midBot);
          pushTriChecked(cTop, ringStarts[rings.length-1] + s, ringStarts[rings.length-1] + sn, midBot);
        }
      }
    }

    function addSculptedBox(cx, cy, cz, hx, hy, hz, matId, boneId, allowedBones, pitch = 0) {
      const pts = [
        [-hx,-hy, hz], [ hx,-hy, hz], [ hx, hy, hz], [-hx, hy, hz],
        [ hx,-hy,-hz], [-hx,-hy,-hz], [-hx, hy,-hz], [ hx, hy,-hz]
      ];
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const tPts = pts.map(p => [cx + p[0], cy + p[1]*cp - p[2]*sp, cz + p[1]*sp + p[2]*cp]);
      const faces = [
        [0,1,2,3], [4,5,6,7], [5,0,3,6], [1,4,7,2], [3,2,7,6], [5,4,1,0]
      ];
      for (const f of faces) {
        const a = tPts[f[0]], b = tPts[f[1]], c = tPts[f[2]], d = tPts[f[3]];
        const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
        const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
        const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
        const i0 = pushVert(a[0],a[1],a[2], nx,ny,nz, matId, boneId, allowedBones);
        const i1 = pushVert(b[0],b[1],b[2], nx,ny,nz, matId, boneId, allowedBones);
        const i2 = pushVert(c[0],c[1],c[2], nx,ny,nz, matId, boneId, allowedBones);
        const i3 = pushVert(d[0],d[1],d[2], nx,ny,nz, matId, boneId, allowedBones);
        indices.push(i0, i1, i2, i0, i2, i3);
      }
    }

    function recordRange(name, fn) {
      const start = indices.length;
      fn();
      ranges[name] = { start, count: indices.length - start };
    }

    const rSeg = preset.radial;
    const lSeg = preset.limb;

    // 1. MALLA BASE CONTINUA SOLDADA (TORSO -> CUELLO, BRAZOS -> GUANTES, PIERNAS -> BOTAS, CHALECO JPC, MOCHILA)
    recordRange('base', () => {
      // Torso + Cuello continuo sin cortes
      const UX = [1, 0, 0], VZ = [0, 0, -1];
      const torsoSpec = [
        [0.87, 0.00, 0.145, 0.095, 0],
        [0.95, 0.00, 0.168, 0.112, 0],
        [1.04, 0.00, 0.156, 0.105, 0],
        [1.14, 0.00, 0.160, 0.112, 0],
        [1.26, -0.005, 0.178, 0.128, 0],
        [1.37, -0.008, 0.194, 0.134, 0],
        [1.43, -0.006, 0.175, 0.115, 0],
        [1.47, -0.002, 0.072, 0.068, 0],
        [1.54,  0.002, 0.056, 0.056, 6]
      ];
      const torsoRings = torsoSpec.map(s => ({
        c: [0, s[0], s[1]], u: UX, v: VZ, ru: s[2], rv: s[3], mat: s[4]
      }));
      addContinuousLoft(torsoRings, rSeg, [0, 1, 2, 3, 5, 9], null, true);

      // Chaleco JPC Plate Carrier (Cordura) envuelto sobre Spine1/Spine2
      const jpcRings = [
        [1.13, -0.005, 0.169, 0.130, 1],
        [1.24, -0.008, 0.179, 0.142, 1],
        [1.36, -0.010, 0.184, 0.144, 1],
        [1.42, -0.005, 0.155, 0.122, 1]
      ].map(s => ({ c: [0, s[0], s[1]], u: UX, v: VZ, ru: s[2], rv: s[3], mat: s[4] }));
      addContinuousLoft(jpcRings, rSeg, [1, 2], null, true);
      // Triple cargador frontal (-Z), radio izquierda (-X) y mochila dorsal (+Z)
      addSculptedBox(-0.075, 1.21, -0.158, 0.032, 0.065, 0.025, 1, null, [1, 2]);
      addSculptedBox( 0.000, 1.21, -0.162, 0.032, 0.065, 0.025, 1, null, [1, 2]);
      addSculptedBox( 0.075, 1.21, -0.158, 0.032, 0.065, 0.025, 1, null, [1, 2]);
      addSculptedBox(-0.145, 1.32,  0.055, 0.028, 0.075, 0.028, 5, null, [2]);
      addSculptedBox( 0.000, 1.25,  0.195, 0.125, 0.175, 0.072, 1, null, [1, 2]);
      addSculptedBox( 0.000, 1.44,  0.190, 0.115, 0.038, 0.042, 3, null, [2]); // Esterilla enrollada

      // Cinturón táctico & Pistolera derecha (+X)
      addContinuousLoft([
        { c: [0, 0.94, 0], u: UX, v: VZ, ru: 0.176, rv: 0.120, mat: 1 },
        { c: [0, 1.00, 0], u: UX, v: VZ, ru: 0.174, rv: 0.118, mat: 1 }
      ], rSeg, [0, 1], null, false);
      addSculptedBox(0.18, 0.85, -0.01, 0.028, 0.065, 0.042, 5, 16, null);

      // Brazos continuos T-Pose (Left = -X, Right = +X) soldando hombro -> codo -> muñeca -> guante
      [-1, 1].forEach(side => {
        const bones = side < 0 ? [2, 5, 6, 7, 8] : [2, 9, 10, 11, 12];
        const armSpecs = [
          [0.14, 1.42, 0.078, 0.072, 0],
          [0.21, 1.42, 0.064, 0.062, 0],
          [0.33, 1.42, 0.058, 0.056, 0],
          [0.45, 1.42, 0.049, 0.048, 0],
          [0.57, 1.42, 0.046, 0.044, 0],
          [0.69, 1.42, 0.036, 0.035, 0],
          [0.72, 1.42, 0.038, 0.032, 2],
          [0.80, 1.42, 0.036, 0.024, 2],
          [0.84, 1.42, 0.024, 0.016, 2]
        ];
        const aRings = armSpecs.map(s => ({
          c: [side * s[0], s[1], 0],
          u: [0, 1, 0], v: [0, 0, side > 0 ? 1 : -1],
          ru: s[2], rv: s[3], mat: s[4]
        }));
        addContinuousLoft(aRings, lSeg, bones, null, true);
      });

      // Piernas continuas + Rodilleras + Botas hacia -Z
      [-1, 1].forEach(side => {
        const bones = side < 0 ? [0, 13, 14, 15] : [0, 16, 17, 18];
        const px = side * 0.102;
        const legSpecs = [
          [0.96,  0.000, 0.098, 0.094, 0],
          [0.76,  0.000, 0.086, 0.084, 0],
          [0.54, -0.004, 0.066, 0.066, 0],
          [0.48, -0.008, 0.062, 0.068, 1], // Rodillera integrada
          [0.31,  0.002, 0.062, 0.064, 0],
          [0.18,  0.000, 0.054, 0.056, 2], // Caña bota
          [0.08, -0.005, 0.052, 0.060, 2]
        ];
        const lRings = legSpecs.map(s => ({
          c: [px, s[0], s[1]], u: UX, v: VZ, ru: s[2], rv: s[3], mat: s[4]
        }));
        addContinuousLoft(lRings, lSeg, bones, null, true);
        // Puntera de bota dirigida exactamente hacia -Z
        const footBone = side < 0 ? 15 : 18;
        const bootRings = [
          [ 0.045, 0.045, 0.050, 0.045],
          [-0.040, 0.042, 0.052, 0.042],
          [-0.125, 0.036, 0.048, 0.036],
          [-0.185, 0.028, 0.038, 0.025]
        ].map(b => ({
          c: [px, b[1], b[0]], u: [1, 0, 0], v: [0, 1, 0], ru: b[2], rv: b[3], mat: 2
        }));
        addContinuousLoft(bootRings, lSeg, null, footBone, true);
      });
    });

    // Helper cabeza anatómica común (rostro + nariz hacia -Z)
    function buildSculptedHead(isBalaclava) {
      const mSkin = isBalaclava ? 1 : 6;
      const hRings = [
        [1.52,  0.000, 0.064, 0.072, isBalaclava ? 1 : 6],
        [1.57, -0.008, 0.082, 0.095, mSkin],
        [1.64, -0.006, 0.090, 0.104, isBalaclava ? 2 : 6],
        [1.71,  0.000, 0.088, 0.102, mSkin],
        [1.76,  0.004, 0.058, 0.066, isBalaclava ? 1 : 2]
      ].map(s => ({ c: [0, s[0], s[1]], u: [1,0,0], v: [0,0,-1], ru: s[2], rv: s[3], mat: s[4] }));
      addContinuousLoft(hRings, rSeg, null, 4, true);
      // Nariz proyectada hacia -Z
      addSculptedBox(0, 1.635, -0.102, 0.015, 0.022, 0.018, mSkin, 4, null);
      // Gafas tácticas / franja ocular
      addSculptedBox(0, 1.665, -0.096, 0.064, 0.019, 0.020, 5, 4, null);
    }

    // 2. CASCO FAST + PELTOR + VISOR GPNVG-18 (SUBIDO / BAJADO)
    recordRange('head_fast', () => {
      buildSculptedHead(false);
      const dome = [
        [1.66, 0.012, 0.102, 0.114],
        [1.71, 0.006, 0.112, 0.125],
        [1.76, 0.004, 0.096, 0.106],
        [1.795, 0.004, 0.052, 0.056]
      ].map(s => ({ c: [0, s[0], s[1]], u: [1,0,0], v: [0,0,-1], ru: s[2], rv: s[3], mat: 3 }));
      addContinuousLoft(dome, rSeg, null, 4, true);
      addSculptedBox(-0.105, 1.63, 0.01, 0.022, 0.036, 0.034, 1, 4, null);
      addSculptedBox( 0.105, 1.63, 0.01, 0.022, 0.036, 0.034, 1, 4, null);
      addSculptedBox(0, 1.71, -0.124, 0.026, 0.024, 0.014, 5, 4, null); // Shroud frontal (-Z)
      addSculptedBox(0, 1.70,  0.122, 0.044, 0.030, 0.022, 1, 4, null); // Contrapeso batería (+Z)
    });

    recordRange('head_fast_nvg_up', () => {
      addSculptedBox(0, 1.77, -0.145, 0.066, 0.022, 0.034, 5, 4, null);
      [-0.048, -0.018, 0.018, 0.048].forEach(ox => {
        addSculptedBox(ox, 1.805, -0.165, 0.013, 0.013, 0.030, 4, 4, null);
      });
    });

    recordRange('head_fast_nvg_down', () => {
      addSculptedBox(0, 1.685, -0.148, 0.068, 0.020, 0.028, 5, 4, null);
      [-0.048, -0.018, 0.018, 0.048].forEach(ox => {
        addSculptedBox(ox, 1.662, -0.165, 0.014, 0.014, 0.036, 4, 4, null);
      });
    });

    // 3. BOONIE SNIPER
    recordRange('head_boonie', () => {
      buildSculptedHead(false);
      const boonie = [
        [1.685, 0.0, 0.168, 0.172, 0], // Ala ancha
        [1.698, 0.0, 0.102, 0.112, 1], // Banda
        [1.750, 0.0, 0.095, 0.104, 0],
        [1.775, 0.0, 0.074, 0.082, 0]
      ].map(s => ({ c: [0, s[0], s[1]], u: [1,0,0], v: [0,0,-1], ru: s[2], rv: s[3], mat: s[4] }));
      addContinuousLoft(boonie, rSeg, null, 4, true);
    });

    // 4. BALACLAVA + COMTAC
    recordRange('head_balaclava', () => {
      buildSculptedHead(true);
      addSculptedBox(-0.104, 1.635, 0.01, 0.024, 0.038, 0.036, 1, 4, null);
      addSculptedBox( 0.104, 1.635, 0.01, 0.024, 0.038, 0.036, 1, 4, null);
      addSculptedBox(0, 1.755, 0.01, 0.096, 0.012, 0.022, 5, 4, null);
    });

    // 5. RIFLES EN ESPACIO LOCAL DEL HUESO 19 (WeaponBone, cañón apuntando hacia -Z)
    recordRange('weap_mk17', () => {
      addSculptedBox(0,  0.005, -0.06, 0.026, 0.040, 0.21, 1, 19, null); // Receptor FDE/Coyote
      addSculptedBox(0,  0.005,  0.22, 0.022, 0.044, 0.10, 1, 19, null); // Culata SCAR
      addSculptedBox(0, -0.065, -0.05, 0.018, 0.055, 0.030, 5, 19, null); // Cargador 7.62
      addSculptedBox(0, -0.055,  0.06, 0.017, 0.048, 0.020, 5, 19, null); // Pistolete
      addSculptedBox(0, -0.045, -0.22, 0.016, 0.036, 0.020, 5, 19, null); // Foregrip
      addSculptedBox(0,  0.055, -0.03, 0.022, 0.024, 0.048, 5, 19, null); // Mira holográfica
      addSculptedBox(0,  0.022, -0.35, 0.013, 0.013, 0.15, 5, 19, null);  // Cañón -Z
    });

    recordRange('weap_m40a5', () => {
      addSculptedBox(0, -0.010,  0.02, 0.025, 0.036, 0.28, 3, 19, null); // Chasis McMillan
      addSculptedBox(0, -0.065,  0.06, 0.016, 0.044, 0.020, 5, 19, null); // Empuñadura
      addSculptedBox(0,  0.056, -0.02, 0.022, 0.022, 0.16, 5, 19, null); // Óptica largo alcance
      addSculptedBox(0,  0.020, -0.44, 0.015, 0.015, 0.26, 5, 19, null); // Cañón flotante pesado -Z
      addSculptedBox(0, -0.042, -0.32, 0.026, 0.020, 0.08, 5, 19, null); // Bípode plegado
    });

    recordRange('suppressor', () => {
      const supRings = [
        [-0.49, 0.022], [-0.67, 0.022]
      ].map(z => ({
        c: [0, 0.022, z[0]], u: [1,0,0], v: [0,1,0], ru: z[1], rv: z[1], mat: 5
      }));
      addContinuousLoft(supRings, 10, null, 19, true);
    });

    // Suavizado ligero de normales sólo en la malla orgánica base continua
    const baseMaxVert = Math.floor(verts.length / 15);
    const keyMap = new Map();
    const posArr = new Float32Array(baseMaxVert * 3);
    const nAcc = new Float32Array(baseMaxVert * 3);
    const baseIdxEnd = ranges.base.start + ranges.base.count;
    for (let i = 0; i < baseIdxEnd; i++) {
      const vi = indices[i];
      const mId = verts[vi * 15 + 6];
      if (mId === 0 || mId === 6) {
        const key = `${Math.round(verts[vi*15]*500)},${Math.round(verts[vi*15+1]*500)},${Math.round(verts[vi*15+2]*500)}`;
        if (!keyMap.has(key)) keyMap.set(key, []);
        keyMap.get(key).push(vi);
        nAcc[vi*3] += verts[vi*15+3];
        nAcc[vi*3+1] += verts[vi*15+4];
        nAcc[vi*3+2] += verts[vi*15+5];
      }
    }
    for (const grp of keyMap.values()) {
      if (grp.length < 2) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const vi of grp) { sx += verts[vi*15+3]; sy += verts[vi*15+4]; sz += verts[vi*15+5]; }
      const sl = Math.hypot(sx, sy, sz) || 1;
      for (const vi of grp) {
        verts[vi*15+3] = sx / sl; verts[vi*15+4] = sy / sl; verts[vi*15+5] = sz / sl;
      }
    }

    return { verts, indices, ranges, vertexCount: verts.length / 15 };
  }

  function uploadSkinnedVAO(gl, meshData) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshData.verts), gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(meshData.indices), gl.STATIC_DRAW);

    const stride = 15 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 7 * 4);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 11 * 4);

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, ranges: meshData.ranges };
  }

  // ============================================================================
  // 6C. EVALUADOR SKELETAL MIXAMO + TÁCTICO + CINEMÁTICA INVERSA 2-BONE (IK)
  // ============================================================================
  const ikSettings = { foot: true, hand: true, look: true };
  const customMixamoClip = { active: false, name: '', clip: null };

  function buildBoneMatrixFromTwist(headPos, tailPos, bindAxis, baseQuat) {
    const dir = V3.norm(V3.sub(tailPos, headPos));
    const curAxis = Quat.rotVec(baseQuat, bindAxis);
    const qSwing = Quat.fromTo(curAxis, dir);
    return Quat.norm(Quat.mul(qSwing, baseQuat));
  }

  function solveTwoBoneIK(rootPos, midFkPos, endFkPos, targetPos, poleDir, baseUpperQ, baseLowerQ, bindUpperDir, bindLowerDir) {
    const L1 = Math.max(0.05, V3.len(V3.sub(midFkPos, rootPos)));
    const L2 = Math.max(0.05, V3.len(V3.sub(endFkPos, midFkPos)));
    let toT = V3.sub(targetPos, rootPos);
    let d = V3.len(toT);
    const maxR = (L1 + L2) * 0.996;
    const minR = Math.abs(L1 - L2) + 0.04;
    if (d < 1e-4) toT = [0, -1, 0];
    d = Math.max(minR, Math.min(maxR, d));
    const dir = V3.norm(toT);

    // Proyectar vector polo perpendicular a la línea raíz->objetivo para evitar torsiones
    const dotP = V3.dot(poleDir, dir);
    let ortho = [poleDir[0] - dir[0]*dotP, poleDir[1] - dir[1]*dotP, poleDir[2] - dir[2]*dotP];
    if (V3.len(ortho) < 1e-4) ortho = [0, 0, -1];
    else V3.norm(ortho, ortho);

    const cosA = Math.max(-1, Math.min(1, (L1*L1 + d*d - L2*L2) / (2 * L1 * d)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const midPos = [
      rootPos[0] + dir[0] * (L1 * cosA) + ortho[0] * (L1 * sinA),
      rootPos[1] + dir[1] * (L1 * cosA) + ortho[1] * (L1 * sinA),
      rootPos[2] + dir[2] * (L1 * cosA) + ortho[2] * (L1 * sinA)
    ];
    const endPos = [
      rootPos[0] + dir[0] * d,
      rootPos[1] + dir[1] * d,
      rootPos[2] + dir[2] * d
    ];

    const qUpper = buildBoneMatrixFromTwist(rootPos, midPos, bindUpperDir, baseUpperQ);
    const qLower = buildBoneMatrixFromTwist(midPos, endPos, bindLowerDir, baseLowerQ);
    return { midPos, endPos, qUpper, qLower };
  }

  function sampleMixamoClip(clip, t, outQuats, outHip) {
    const frames = clip && clip.frames;
    if (!frames || !frames.length) return;
    const dur = Math.max(0.1, clip.dur || 1.0);
    const N = frames.length;
    const phase = (((t % dur) + dur) % dur) / dur;
    const u = phase * N;
    const i0 = Math.floor(u) % N;
    const i1 = (i0 + 1) % N;
    const f = u - Math.floor(u);
    const f0 = frames[i0], f1 = frames[i1];
    for (let bi = 0; bi < 19; bi++) {
      Quat.slerp(f0.boneQuats[bi] || [0,0,0,1], f1.boneQuats[bi] || [0,0,0,1], f, outQuats[bi]);
    }
    const h0 = f0.hip || [0, 0, 0], h1 = f1.hip || [0, 0, 0];
    outHip[0] = h0[0] + (h1[0] - h0[0]) * f;
    outHip[1] = h0[1] + (h1[1] - h0[1]) * f;
    outHip[2] = h0[2] + (h1[2] - h0[2]) * f;
  }

  const _skBuf = {
    qA: Array.from({ length: 19 }, () => [0,0,0,1]),
    qB: Array.from({ length: 19 }, () => [0,0,0,1]),
    qMix: Array.from({ length: 19 }, () => [0,0,0,1]),
    hA: [0,0,0], hB: [0,0,0],
    wPos: Array.from({ length: 20 }, () => [0,0,0]),
    wRot: Array.from({ length: 20 }, () => [0,0,0,1]),
    bindAxis: BONE_DEFS.map(b => V3.norm(V3.sub(b.tail, b.head)))
  };

  function evaluateSoldierSkeleton(opState, animTime, worldYaw, worldPos, terrainFn, outBoneMats) {
    const { qA, qB, qMix, hA, hB, wPos, wRot, bindAxis } = _skBuf;
    const hipOff = [0, 0, 0];

    const speed = opState.speed || 0;
    const mps = speed / 3.6;
    const stance = opState.stance || 0; // 0=De pie, 1=Agachado, 2=Prone
    const adsB = opState.adsBlend || 0;
    const shB = opState.shoulderBlend !== undefined ? opState.shoulderBlend : 1.0;

    if (customMixamoClip.active && customMixamoClip.clip) {
      sampleMixamoClip(customMixamoClip.clip, animTime, qMix, hipOff);
    } else {
      sampleMixamoClip(MIXAMO_CLIPS.Idle, animTime, qA, hA);
      if (mps < 0.25) {
        for (let i = 0; i < 19; i++) Quat.copy(qMix[i], qA[i]);
        hipOff[0] = hA[0]; hipOff[1] = hA[1]; hipOff[2] = hA[2];
      } else if (mps < 4.8) {
        const w = Math.min(1.0, (mps - 0.2) / 3.4);
        sampleMixamoClip(MIXAMO_CLIPS.Walk, animTime * 1.15, qB, hB);
        for (let i = 0; i < 19; i++) Quat.slerp(qA[i], qB[i], w, qMix[i]);
        hipOff[0] = hA[0] + (hB[0]-hA[0])*w;
        hipOff[1] = hA[1] + (hB[1]-hA[1])*w;
        hipOff[2] = hA[2] + (hB[2]-hA[2])*w;
      } else {
        const w = Math.min(1.0, (mps - 4.8) / 2.2);
        sampleMixamoClip(MIXAMO_CLIPS.Walk, animTime * 1.25, qA, hA);
        sampleMixamoClip(MIXAMO_CLIPS.Run, animTime * 1.1, qB, hB);
        for (let i = 0; i < 19; i++) Quat.slerp(qA[i], qB[i], w, qMix[i]);
        hipOff[0] = hA[0] + (hB[0]-hA[0])*w;
        hipOff[1] = hA[1] + (hB[1]-hA[1])*w;
        hipOff[2] = hA[2] + (hB[2]-hA[2])*w;
      }

      // Modulación táctica por postura (Agachado y Prone boca abajo hacia -Z)
      if (stance === 1) {
        hipOff[1] -= 0.36;
        qMix[0] = Quat.mul(qMix[0], Quat.fromYXZ(0, -0.18, 0));
        qMix[1] = Quat.mul(qMix[1], Quat.fromYXZ(0, -0.16, 0));
        qMix[13] = Quat.mul(qMix[13], Quat.fromYXZ(-0.08,  0.98, 0)); // Muslo L al frente (-Z)
        qMix[14] = Quat.mul(qMix[14], Quat.fromYXZ(0, -1.35, 0));      // Pantorrilla L doblada (+Z)
        qMix[16] = Quat.mul(qMix[16], Quat.fromYXZ( 0.08,  0.72, 0)); // Muslo R rodilla semi-baja
        qMix[17] = Quat.mul(qMix[17], Quat.fromYXZ(0, -1.48, 0));
      } else if (stance === 2) {
        const crawl = opState.isMoving ? Math.sin(opState.walkPhase * 1.2) : 0;
        hipOff[1] = -0.77;
        // Pelvis -1.42 rad alrededor de X: columna (+Y) cae hacia -Z (boca abajo), piernas (-Y) hacia +Z!
        qMix[0] = Quat.fromYXZ(0, -1.42, crawl * 0.08);
        qMix[1] = Quat.fromYXZ(0,  0.22, 0);
        qMix[2] = Quat.fromYXZ(0,  0.28, -crawl * 0.10);
        qMix[3] = Quat.fromYXZ(0,  0.35, 0);
        qMix[4] = Quat.fromYXZ(0,  0.52, 0);
        qMix[13] = Quat.fromYXZ( 0.10, -0.06 + crawl * 0.18, 0);
        qMix[14] = Quat.fromYXZ(0, -0.18 - Math.max(0, crawl) * 0.35, 0);
        qMix[16] = Quat.fromYXZ(-0.10, -0.06 - crawl * 0.18, 0);
        qMix[17] = Quat.fromYXZ(0, -0.18 - Math.max(0, -crawl) * 0.35, 0);
      }

      // Respiración suave y inclinación de hombro al apuntar
      const breath = Math.sin(animTime * 2.1) * 0.015;
      qMix[2] = Quat.mul(qMix[2], Quat.fromYXZ(shB * 0.06 * adsB, breath, -shB * 0.04 * adsB));
    }

    // Look-At IK: rotar columna y cabeza suavemente hacia dirección de cámara (yawDiff & aimPitch)
    if (ikSettings.look && !(customMixamoClip.active && customMixamoClip.clip)) {
      let yawDiff = opState.aimYawDiff || 0;
      yawDiff = Math.max(-1.0, Math.min(1.0, yawDiff));
      const pAim = Math.max(-0.65, Math.min(0.65, opState.aimPitch || 0));
      const aimWeight = mps > 5.5 && adsB < 0.2 ? 0.35 : 0.85;
      qMix[1] = Quat.mul(Quat.fromYXZ(-yawDiff * 0.28 * aimWeight, -pAim * 0.18 * adsB, 0), qMix[1]);
      qMix[2] = Quat.mul(Quat.fromYXZ(-yawDiff * 0.38 * aimWeight, -pAim * 0.32 * adsB, 0), qMix[2]);
      qMix[4] = Quat.mul(Quat.fromYXZ(-yawDiff * 0.32 * aimWeight, -pAim * 0.45 * aimWeight, 0), qMix[4]);
    }

    // Cinemática Directa (FK): W_i = W_parent * qMix[i] en Espacio de Personaje
    wPos[0] = V3.add(BONE_DEFS[0].head, hipOff);
    Quat.copy(wRot[0], qMix[0]);
    for (let bi = 1; bi < 19; bi++) {
      const p = BONE_DEFS[bi].parent;
      const locOff = V3.sub(BONE_DEFS[bi].head, BONE_DEFS[p].head);
      wPos[bi] = V3.add(wPos[p], Quat.rotVec(wRot[p], locOff));
      Quat.norm(Quat.mul(wRot[p], qMix[bi], wRot[bi]), wRot[bi]);
    }

    // Posicionar WeaponBone (19) acoplado a Spine2 + transición Hombro Der/Izq + ADS + Prone
    const spPos = wPos[2], spRot = wRot[2];
    const isSprinting = mps > 5.4 && adsB < 0.15 && stance === 0;
    const isCustom = !!(customMixamoClip.active && customMixamoClip.clip);

    if (!isCustom) {
      const reloadT = opState.reloadTimer || 0;
      const reloadProgress = reloadT > 0 ? Math.max(0, Math.min(1, 1.0 - reloadT / 1.35)) : 0;
      const reloadMagPhase = reloadT > 0 ? Math.sin(reloadProgress * Math.PI) : 0;

      if (stance === 2) {
        // En Prone (cuerpo a tierra): posicionar fusil horizontal sobre bípode frente al pecho apuntando al horizonte (-Z)
        const wPitchP = (opState.aimPitch || 0) + (opState.recoil || 0) * 0.14;
        const wYawP = -(opState.aimYawDiff || 0) * 0.35;
        wPos[19] = [shB * 0.08 + reloadMagPhase * 0.04, 0.24 - reloadMagPhase * 0.03, -0.68];
        wRot[19] = Quat.fromYXZ(wYawP, -wPitchP, -reloadMagPhase * 0.35);
      } else {
        // Posición relativa al centro pectoral (Spine2) según hombro activo (shB: +1 Der, -1 Izq)
        const weapRelPos = isSprinting
          ? [0.02, -0.08, -0.22]
          : [
              shB * (0.11 + 0.04 * adsB),
              -0.01 + 0.095 * adsB - reloadMagPhase * 0.04,
              -0.23 - 0.02 * adsB
            ];
        const wPitch = isSprinting
          ? -0.45
          : (opState.aimPitch || 0) * adsB + (opState.recoil || 0) * 0.14 - (1.0 - adsB) * 0.16 + reloadMagPhase * 0.25;
        const wYaw = isSprinting
          ? 0.65
          : -shB * 0.24 * (1.0 - adsB) - (opState.aimYawDiff || 0) * adsB * 0.35 + reloadMagPhase * 0.42;
        const wRoll = shB * 0.08 * (1.0 - adsB) - reloadMagPhase * 0.45;

        wPos[19] = V3.add(spPos, Quat.rotVec(spRot, weapRelPos));
        Quat.norm(Quat.mul(spRot, Quat.fromYXZ(wYaw, -wPitch, wRoll)), wRot[19]);
      }

      // Hand Grip IK (agarrar empuñadura con mano derecha y guardamanos/cargador con mano izquierda)
      if (ikSettings.hand) {
        const wOffPos = Quat.rotVec(wRot[19], [0, -0.055, 0.06]);
        const gripRTarget = V3.add(wPos[19], wOffPos);
        const foreTargetLocal = reloadT > 0
          ? [-0.04 * (1 - reloadMagPhase), -0.14 - 0.08 * reloadMagPhase, -0.18 + 0.16 * reloadMagPhase]
          : [0, -0.048, -0.22];
        const gripLTarget = reloadT > 0 && reloadMagPhase > 0.25
          ? V3.add(spPos, Quat.rotVec(spRot, [-0.06, -0.06, -0.16]))
          : V3.add(wPos[19], Quat.rotVec(wRot[19], foreTargetLocal));

        // Codos bajos y hacia atrás (+Z, -Y)
        const ikR = solveTwoBoneIK(
          wPos[10], wPos[11], wPos[12], gripRTarget,
          [0.45, -0.55, 0.65],
          wRot[10], wRot[11], bindAxis[10], bindAxis[11]
        );
        wRot[10] = ikR.qUpper; wPos[11] = ikR.midPos; wRot[11] = ikR.qLower; wPos[12] = ikR.endPos;
        wRot[12] = wRot[19];

        if (!isSprinting) {
          const ikL = solveTwoBoneIK(
            wPos[6], wPos[7], wPos[8], gripLTarget,
            [-0.45, -0.55, 0.65],
            wRot[6], wRot[7], bindAxis[6], bindAxis[7]
          );
          wRot[6] = ikL.qUpper; wPos[7] = ikL.midPos; wRot[7] = ikL.qLower; wPos[8] = ikL.endPos;
          wRot[8] = wRot[19];
        }
      }
    } else {
      // Modo Clip Mixamo externo completo: fusil acoplado a mano derecha
      wPos[19] = V3.add(wPos[12], Quat.rotVec(wRot[12], [0, -0.02, -0.05]));
      Quat.copy(wRot[19], wRot[12]);
    }

    // Foot Terrain IK: adapta altura de pies a pendientes reales del valle sin atravesar suelo
    if (ikSettings.foot && !isCustom && stance < 2 && mps < 4.5 && terrainFn) {
      const cy = Math.cos(-worldYaw), sy = Math.sin(-worldYaw);
      function charToWorldXZ(p) {
        return [
          worldPos[0] + p[0] * cy + p[2] * sy,
          worldPos[2] - p[0] * sy + p[2] * cy
        ];
      }
      const [lwx, lwz] = charToWorldXZ(wPos[15]);
      const [rwx, rwz] = charToWorldXZ(wPos[18]);
      const dL = Math.max(-0.22, Math.min(0.28, terrainFn(lwx, lwz) - worldPos[1]));
      const dR = Math.max(-0.22, Math.min(0.28, terrainFn(rwx, rwz) - worldPos[1]));
      const minD = Math.min(dL, dR);
      if (minD < -0.01) {
        for (let b = 0; b < 20; b++) wPos[b][1] += minD;
      }
      const tgtL = [wPos[15][0], Math.max(wPos[15][1], 0.08 + dL), wPos[15][2]];
      const tgtR = [wPos[18][0], Math.max(wPos[18][1], 0.08 + dR), wPos[18][2]];
      const ikLegL = solveTwoBoneIK(wPos[13], wPos[14], wPos[15], tgtL, [-0.15, 0.05, -1.0], wRot[13], wRot[14], bindAxis[13], bindAxis[14]);
      wRot[13] = ikLegL.qUpper; wPos[14] = ikLegL.midPos; wRot[14] = ikLegL.qLower; wPos[15] = ikLegL.endPos;
      const ikLegR = solveTwoBoneIK(wPos[16], wPos[17], wPos[18], tgtR, [0.15, 0.05, -1.0], wRot[16], wRot[17], bindAxis[16], bindAxis[17]);
      wRot[16] = ikLegR.qUpper; wPos[17] = ikLegR.midPos; wRot[17] = ikLegR.qLower; wPos[18] = ikLegR.endPos;
    }

    // Construir matrices de skinning finales en espacio de mundo del personaje
    const rootWorldM = M4.create();
    // Pose esquelética realista al caer abatido (colapso articulado al suelo)
    if (opState && opState.alive === false) {
      const f = Math.min(1.0, (opState.downTimer !== undefined ? opState.downTimer : 1.0) * 2.4);
      const qFallX = Quat.fromAxisAngle([1, 0, 0], 1.44 * f);
      const qFallZ = Quat.fromAxisAngle([0, 0, 1], 0.22 * f);
      const qFall = Quat.norm(Quat.mul(qFallZ, qFallX));
      const pivot = [wPos[0][0], wPos[0][1], wPos[0][2]];
      const dropY = (pivot[1] - 0.17) * f;
      for (let bi = 0; bi < 20; bi++) {
        const rel = V3.sub(wPos[bi], pivot);
        const rRel = Quat.rotVec(qFall, rel);
        wPos[bi] = [pivot[0] + rRel[0], Math.max(0.06, pivot[1] + rRel[1] - dropY), pivot[2] + rRel[2]];
        wRot[bi] = Quat.norm(Quat.mul(qFall, wRot[bi]));
      }
    }

    M4.identity(rootWorldM);
    M4.translate(rootWorldM, rootWorldM, worldPos);
    M4.rotateY(rootWorldM, rootWorldM, -worldYaw);

    const localM = M4.create();
    for (let bi = 0; bi < 20; bi++) {
      const rHead = Quat.rotVec(wRot[bi], BONE_DEFS[bi].head);
      const trans = V3.sub(wPos[bi], rHead);
      M4.fromQT(wRot[bi], trans, localM);
      M4.multiply(outBoneMats[bi], rootWorldM, localM);
    }

    // Devolver boca del cañón, cabeza y torso en espacio mundo para balística y trazadoras exactas
    const wpMuzzle = V3.add(wPos[19], Quat.rotVec(wRot[19], [0, 0.02, -0.60]));
    const wpHead = V3.add(wPos[4], Quat.rotVec(wRot[4], [0, 0.12, 0]));
    const wpTorso = V3.add(wPos[2], Quat.rotVec(wRot[2], [0, 0.08, 0]));
    const cyW = Math.cos(-worldYaw), syW = Math.sin(-worldYaw);
    const toWorld = (lp) => [
      worldPos[0] + lp[0] * cyW + lp[2] * syW,
      worldPos[1] + lp[1],
      worldPos[2] - lp[0] * syW + lp[2] * cyW
    ];
    return {
      muzzleWorld: toWorld(wpMuzzle),
      headWorld: toWorld(wpHead),
      torsoWorld: toWorld(wpTorso)
    };
  }

