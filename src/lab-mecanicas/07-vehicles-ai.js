  // 7. ENTIDADES Y FÍSICAS CORREGIDAS (BUGGY 4X4, HELI, OPERADOR, PATRULLA IA)
  const BuggyVehicle = {
    pos: [0, 9.5, 8],
    vel: [0, 0, 0],
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    pitchVel: 0.0,
    rollVel: 0.0,
    vy: 0.0,
    speed: 0.0,
    steerAngle: 0.0,
    wheelSpin: 0.0,
    wheelR: 0.45,
    wheelGroundH: [9.5, 9.5, 9.5, 9.5],
    wheelGrounded: [true, true, true, true],
    wheelHubOffs: [0, 0, 0, 0],
    suspComp: [0, 0, 0, 0],
    airborne: false,
    airTime: 0.0,
    gear: 1,
    rpm: 950,
    rpmNorm: 0.06,
    shiftDip: 0.0,
    throttle: 0.0,
    handbrake: false,
    flipCooldown: 0.0,

    recoverUpright: () => {
      if (BuggyVehicle.flipCooldown > 0) return;
      BuggyVehicle.pos[1] = TerrainSystem.getHeight(BuggyVehicle.pos[0], BuggyVehicle.pos[2]) + 0.35;
      BuggyVehicle.pitch = 0;
      BuggyVehicle.roll = 0;
      BuggyVehicle.pitchVel = 0;
      BuggyVehicle.rollVel = 0;
      BuggyVehicle.vy = 2.2;
      BuggyVehicle.speed *= 0.25;
      BuggyVehicle.flipCooldown = 0.8;
    },

    update: (dt, input) => {
      const dts = Math.min(dt, 0.045);
      BuggyVehicle.flipCooldown = Math.max(0, BuggyVehicle.flipCooldown - dts);
      const maxFwd = 88.0, maxRev = -28.0;
      const accel = 46.0, brake = 64.0, drag = 13.5;

      const thr = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      BuggyVehicle.throttle = thr;
      BuggyVehicle.handbrake = !!input.space;

      const anyGrounded = BuggyVehicle.wheelGrounded[0] || BuggyVehicle.wheelGrounded[1] || BuggyVehicle.wheelGrounded[2] || BuggyVehicle.wheelGrounded[3];

      if (anyGrounded) {
        if (thr > 0) {
          BuggyVehicle.speed = Math.min(maxFwd, BuggyVehicle.speed + accel * thr * dts);
        } else if (thr < 0) {
          if (BuggyVehicle.speed > 2.0) BuggyVehicle.speed = Math.max(0, BuggyVehicle.speed - brake * dts);
          else BuggyVehicle.speed = Math.max(maxRev, BuggyVehicle.speed + accel * 0.65 * thr * dts);
        } else {
          if (BuggyVehicle.speed > 0) BuggyVehicle.speed = Math.max(0, BuggyVehicle.speed - drag * dts);
          else if (BuggyVehicle.speed < 0) BuggyVehicle.speed = Math.min(0, BuggyVehicle.speed + drag * dts);
        }
        if (BuggyVehicle.handbrake) {
          BuggyVehicle.speed *= Math.max(0, 1.0 - 2.6 * dts);
        }
      } else {
        BuggyVehicle.speed *= Math.max(0, 1.0 - 0.18 * dts);
      }

      const targetSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      BuggyVehicle.steerAngle += (targetSteer * 0.48 - BuggyVehicle.steerAngle) * Math.min(1, 10.0 * dts);

      if (anyGrounded && Math.abs(BuggyVehicle.speed) > 0.6) {
        const dirSign = BuggyVehicle.speed > 0 ? 1 : -1;
        const steerRate = Math.min(1.0, Math.abs(BuggyVehicle.speed) / 18.0);
        const driftBoost = BuggyVehicle.handbrake ? 1.45 : 1.0;
        BuggyVehicle.yaw += BuggyVehicle.steerAngle * 3.1 * driftBoost * steerRate * dirSign * dts;
      }

      const fwdX = Math.sin(BuggyVehicle.yaw), fwdZ = -Math.cos(BuggyVehicle.yaw);
      const rightX = Math.cos(BuggyVehicle.yaw), rightZ = Math.sin(BuggyVehicle.yaw);

      const mps = (BuggyVehicle.speed * 1000) / 3600;
      BuggyVehicle.pos[0] += fwdX * mps * dts;
      BuggyVehicle.pos[2] += fwdZ * mps * dts;
      const colRes = WorldColliders.resolveCircle(BuggyVehicle.pos, 1.68, BuggyVehicle.pos[1] + 0.5);
      if (colRes.hit) {
        const impSpeed = Math.abs(BuggyVehicle.speed);
        if (impSpeed > 9 && typeof SoundEngine !== 'undefined') {
          SoundEngine.playCollisionBump(Math.min(1, impSpeed / 55));
        }
        BuggyVehicle.speed *= 0.42;
      }
      BuggyVehicle.wheelSpin -= (mps / BuggyVehicle.wheelR) * dts;

      // SUSPENSIÓN RAYCAST 4 RUEDAS + CLAMPING ESTRICTO ANTI-TRASPASO ("Vehicle IK")
      const halfWB = 1.35, halfTR = 0.95;
      const corners = [
        [-halfTR, -halfWB], // 0: FL
        [ halfTR, -halfWB], // 1: FR
        [-halfTR,  halfWB], // 2: RL
        [ halfTR,  halfWB]  // 3: RR
      ];
      let groundedCount = 0;
      const wheelR = BuggyVehicle.wheelR;

      for (let i = 0; i < 4; i++) {
        const lx = corners[i][0], lz = corners[i][1];
        const wx = BuggyVehicle.pos[0] + rightX * lx - fwdX * lz;
        const wz = BuggyVehicle.pos[2] + rightZ * lx - fwdZ * lz;
        const gh = TerrainSystem.getHeight(wx, wz);
        BuggyVehicle.wheelGroundH[i] = gh;

        const cornerRotY = -lz * Math.sin(BuggyVehicle.pitch) + lx * Math.sin(BuggyVehicle.roll);
        const nominalHubWorldY = BuggyVehicle.pos[1] + 0.45 + cornerRotY;
        const gapToGround = (nominalHubWorldY - wheelR) - gh;

        if (gapToGround <= 0.24) {
          BuggyVehicle.wheelGrounded[i] = true;
          groundedCount++;
          BuggyVehicle.suspComp[i] = Math.max(0, 0.20 - gapToGround);
        } else {
          BuggyVehicle.wheelGrounded[i] = false;
          BuggyVehicle.suspComp[i] = 0;
        }
      }

      const avgWheelGround = (BuggyVehicle.wheelGroundH[0] + BuggyVehicle.wheelGroundH[1] + BuggyVehicle.wheelGroundH[2] + BuggyVehicle.wheelGroundH[3]) * 0.25;
      const wasAir = BuggyVehicle.airborne;

      if (groundedCount > 0) {
        const targetPitch = Math.atan2((BuggyVehicle.wheelGroundH[0] + BuggyVehicle.wheelGroundH[1]) - (BuggyVehicle.wheelGroundH[2] + BuggyVehicle.wheelGroundH[3]), halfWB * 2.0);
        const targetRoll  = Math.atan2((BuggyVehicle.wheelGroundH[1] + BuggyVehicle.wheelGroundH[3]) - (BuggyVehicle.wheelGroundH[0] + BuggyVehicle.wheelGroundH[2]), halfTR * 2.0) + BuggyVehicle.steerAngle * (BuggyVehicle.speed / 88) * 0.16;

        const deltaH = (avgWheelGround + 0.215) - BuggyVehicle.pos[1];
        const vertSpring = deltaH * 65.0 - BuggyVehicle.vy * 11.5;
        BuggyVehicle.vy += (vertSpring - 14.0) * dts;
        BuggyVehicle.pos[1] += BuggyVehicle.vy * dts;

        if (BuggyVehicle.pos[1] < avgWheelGround - 0.18) {
          if (wasAir && BuggyVehicle.vy < -4.2 && typeof SoundEngine !== 'undefined') {
            SoundEngine.playCollisionBump(Math.min(1, Math.abs(BuggyVehicle.vy) / 14));
          }
          BuggyVehicle.pos[1] = avgWheelGround - 0.18;
          if (BuggyVehicle.vy < 0) BuggyVehicle.vy *= -0.15;
        }

        BuggyVehicle.pitchVel += ((targetPitch - BuggyVehicle.pitch) * 36.0 - BuggyVehicle.pitchVel * 9.0) * dts;
        BuggyVehicle.rollVel  += ((targetRoll  - BuggyVehicle.roll)  * 38.0 - BuggyVehicle.rollVel  * 9.5) * dts;
        BuggyVehicle.pitch += BuggyVehicle.pitchVel * dts;
        BuggyVehicle.roll  += BuggyVehicle.rollVel * dts;
        BuggyVehicle.airborne = (BuggyVehicle.pos[1] > avgWheelGround + 0.34);
      } else {
        BuggyVehicle.airborne = true;
        BuggyVehicle.airTime += dts;
        BuggyVehicle.vy -= 18.8 * dts;
        BuggyVehicle.pos[1] += BuggyVehicle.vy * dts;
        BuggyVehicle.pitch += BuggyVehicle.pitchVel * dts;
        BuggyVehicle.roll  += BuggyVehicle.rollVel * dts;
        BuggyVehicle.pitchVel *= Math.max(0, 1.0 - 0.6 * dts);
        BuggyVehicle.rollVel  *= Math.max(0, 1.0 - 0.6 * dts);
      }

      if (!BuggyVehicle.airborne) {
        if (wasAir && BuggyVehicle.airTime > 0.25 && typeof SoundEngine !== 'undefined') {
          SoundEngine.playCollisionBump(Math.min(1, BuggyVehicle.airTime * 0.9));
        }
        BuggyVehicle.airTime = 0;
      }

      // Clamping final por rueda: ninguna llanta traspasa triángulos del suelo
      for (let i = 0; i < 4; i++) {
        const lx = corners[i][0], lz = corners[i][1];
        const cornerRotY = -lz * Math.sin(BuggyVehicle.pitch) + lx * Math.sin(BuggyVehicle.roll);
        const nominalHubY = BuggyVehicle.pos[1] + 0.45 + cornerRotY;
        const minHubY = BuggyVehicle.wheelGroundH[i] + wheelR;
        if (nominalHubY < minHubY) {
          const needLift = minHubY - nominalHubY;
          BuggyVehicle.wheelHubOffs[i] = Math.min(0.42, needLift);
          if (needLift > 0.34) {
            BuggyVehicle.pos[1] += (needLift - 0.34);
          }
        } else {
          const drop = minHubY - nominalHubY;
          BuggyVehicle.wheelHubOffs[i] = Math.max(-0.24, drop);
        }
      }

      // CAJA AUTOMÁTICA DE 5 MARCHAS Y CURVA RPM
      const absSpd = Math.abs(BuggyVehicle.speed);
      let newGear = 1;
      if (BuggyVehicle.speed < -1.5) newGear = 0;
      else if (absSpd < 16) newGear = 1;
      else if (absSpd < 32) newGear = 2;
      else if (absSpd < 50) newGear = 3;
      else if (absSpd < 70) newGear = 4;
      else newGear = 5;

      if (newGear !== BuggyVehicle.gear && newGear > 0 && BuggyVehicle.gear > 0) {
        BuggyVehicle.shiftDip = 1.0;
      }
      BuggyVehicle.gear = newGear;
      BuggyVehicle.shiftDip = Math.max(0, BuggyVehicle.shiftDip - dts * 3.4);

      const gearSpans = [[-28, 0], [0, 18], [13, 35], [27, 53], [44, 73], [62, 92]];
      const span = gearSpans[newGear] || [0, 20];
      const normInGear = newGear === 0
        ? Math.min(1, absSpd / 28)
        : Math.max(0, Math.min(1, (absSpd - span[0]) / Math.max(8, span[1] - span[0])));
      const targetRpmNorm = Math.min(1, Math.max(0.06, normInGear * 0.85 + Math.abs(thr) * 0.15 + (BuggyVehicle.airborne && thr > 0 ? 0.25 : 0)));
      BuggyVehicle.rpmNorm += (targetRpmNorm - BuggyVehicle.rpmNorm) * Math.min(1, dts * 10.0);
      BuggyVehicle.rpm = Math.round(920 + BuggyVehicle.rpmNorm * 5800 * (1.0 - BuggyVehicle.shiftDip * 0.22));
    }
  };

  const HeliVehicle = {
    pos: [-12, 9.5, 14],
    yaw: 0.25,
    pitch: 0.0,
    roll: 0.0,
    vel: [0, 0, 0],
    rotorRPM: 0.35,
    mainRotorAngle: 0,
    tailRotorAngle: 0,
    collective: 0,
    isLanded: true,

    recoverUpright: () => {
      HeliVehicle.pos[1] = Math.max(HeliVehicle.pos[1], TerrainSystem.getHeight(HeliVehicle.pos[0], HeliVehicle.pos[2]) + 0.05);
      HeliVehicle.pitch = 0;
      HeliVehicle.roll = 0;
      HeliVehicle.vel[0] *= 0.2; HeliVehicle.vel[1] = Math.max(0, HeliVehicle.vel[1]); HeliVehicle.vel[2] *= 0.2;
    },

    update: (dt, input, isPiloted) => {
      const dts = Math.min(dt, 0.045);
      const targetRPM = isPiloted ? 1.0 : 0.25;
      HeliVehicle.rotorRPM += (targetRPM - HeliVehicle.rotorRPM) * 1.6 * dts;
      HeliVehicle.mainRotorAngle += HeliVehicle.rotorRPM * 40.0 * dts;
      HeliVehicle.tailRotorAngle += HeliVehicle.rotorRPM * 60.0 * dts;

      const fwdX = Math.sin(HeliVehicle.yaw), fwdZ = -Math.cos(HeliVehicle.yaw);
      const rightX = Math.cos(HeliVehicle.yaw), rightZ = Math.sin(HeliVehicle.yaw);

      // 4 esquinas de patines para aterrizaje nivelado con el relieve real
      const sF = TerrainSystem.getHeight(HeliVehicle.pos[0] + fwdX * 1.1, HeliVehicle.pos[2] + fwdZ * 1.1);
      const sB = TerrainSystem.getHeight(HeliVehicle.pos[0] - fwdX * 1.1, HeliVehicle.pos[2] - fwdZ * 1.1);
      const sL = TerrainSystem.getHeight(HeliVehicle.pos[0] - rightX * 0.9, HeliVehicle.pos[2] - rightZ * 0.9);
      const sR = TerrainSystem.getHeight(HeliVehicle.pos[0] + rightX * 0.9, HeliVehicle.pos[2] + rightZ * 0.9);
      const groundH = Math.max(TerrainSystem.getHeight(HeliVehicle.pos[0], HeliVehicle.pos[2]), (sF + sB + sL + sR) * 0.25);
      const slopePitch = Math.atan2(sF - sB, 2.2) * 0.7;
      const slopeRoll = Math.atan2(sR - sL, 1.8) * 0.7;

      if (!isPiloted) {
        HeliVehicle.pos[1] = groundH;
        HeliVehicle.vel[0] = HeliVehicle.vel[1] = HeliVehicle.vel[2] = 0;
        HeliVehicle.collective = 0;
        HeliVehicle.pitch += (slopePitch - HeliVehicle.pitch) * Math.min(1, 6.0 * dts);
        HeliVehicle.roll  += (slopeRoll  - HeliVehicle.roll)  * Math.min(1, 6.0 * dts);
        HeliVehicle.isLanded = true;
        return;
      }

      const collInput = (input.space ? 1 : 0) - (input.shift ? 1 : 0);
      HeliVehicle.collective = collInput;
      const altAGL = HeliVehicle.pos[1] - groundH;
      // Auto-hover suave + efecto suelo bajo 3m
      const groundCushion = altAGL < 3.0 ? (3.0 - altAGL) * 1.2 : 0;
      let vertAccel = collInput > 0 ? 24.0 : (collInput < 0 ? -19.5 : groundCushion - HeliVehicle.vel[1] * 2.2);

      if (input.turnLeft)  HeliVehicle.yaw -= 1.85 * dts;
      if (input.turnRight) HeliVehicle.yaw += 1.85 * dts;

      const airAutority = HeliVehicle.isLanded ? 0.08 : 1.0;
      const targetPitch = -((input.forward ? 1 : 0) - (input.backward ? 1 : 0)) * 0.40 * airAutority + (HeliVehicle.isLanded ? slopePitch : 0);
      const targetRoll  = -((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 0.38 * airAutority + (HeliVehicle.isLanded ? slopeRoll : 0);
      HeliVehicle.pitch += (targetPitch - HeliVehicle.pitch) * Math.min(1, 5.5 * dts);
      HeliVehicle.roll  += (targetRoll  - HeliVehicle.roll)  * Math.min(1, 5.5 * dts);

      const thrustFwd = (-HeliVehicle.pitch / 0.40) * 38.0 * airAutority;
      const thrustStrafe = (-HeliVehicle.roll / 0.38) * 26.0 * airAutority;

      const targetVx = fwdX * thrustFwd + rightX * thrustStrafe;
      const targetVz = fwdZ * thrustFwd + rightZ * thrustStrafe;

      HeliVehicle.vel[0] += (targetVx - HeliVehicle.vel[0]) * Math.min(1, 2.5 * dts);
      HeliVehicle.vel[2] += (targetVz - HeliVehicle.vel[2]) * Math.min(1, 2.5 * dts);
      HeliVehicle.vel[1] += (vertAccel - HeliVehicle.vel[1] * 2.1) * dts;

      HeliVehicle.pos[0] += HeliVehicle.vel[0] * dts;
      HeliVehicle.pos[1] += HeliVehicle.vel[1] * dts;
      HeliVehicle.pos[2] += HeliVehicle.vel[2] * dts;

      const heloCol = WorldColliders.resolveCircle(HeliVehicle.pos, 2.25, HeliVehicle.pos[1] + 0.65);
      if (heloCol.hit) {
        const sp = Math.hypot(HeliVehicle.vel[0], HeliVehicle.vel[2]);
        if (sp > 3.5 && typeof SoundEngine !== 'undefined') SoundEngine.playCollisionBump(Math.min(1, sp / 18));
        HeliVehicle.vel[0] *= 0.35;
        HeliVehicle.vel[2] *= 0.35;
      }

      if (HeliVehicle.pos[1] <= groundH + 0.03 && collInput <= 0) {
        if (!HeliVehicle.isLanded && HeliVehicle.vel[1] < -3.5 && typeof SoundEngine !== 'undefined') {
          SoundEngine.playCollisionBump(Math.min(1, Math.abs(HeliVehicle.vel[1]) / 12));
        }
        HeliVehicle.pos[1] = groundH;
        if (HeliVehicle.vel[1] < 0) HeliVehicle.vel[1] = 0;
        HeliVehicle.vel[0] *= 0.78; HeliVehicle.vel[2] *= 0.78;
        HeliVehicle.isLanded = true;
      } else {
        HeliVehicle.isLanded = false;
      }
    }
  };

  const Operator = {
    pos: [0, 9.5, 0],
    yaw: 0.0,
    stance: 0, // 0 = De pie, 1 = Agachado, 2 = Prone
    speed: 0,
    walkPhase: 0,
    isMoving: false,
    stepTimer: 0,
    visibilityIndex: 1.0,
    isInShrub: false,
    shoulderSide: 1,  // +1 Derecho (por defecto GRW), -1 Izquierdo
    shoulderBlend: 1,
    ads: false,
    adsBlend: 0,
    aimPitch: 0,
    aimYawDiff: 0,
    fireMode: 'AUTO',
    suppressor: true,
    mag: 20,
    maxMag: 20,
    reserve: 120,
    fireCooldown: 0,
    reloadTimer: 0,
    recoil: 0,
    hitMarkerTimer: 0,
    hitMarkerKill: false,
    hitMarkerHead: false,
    hp: 100,
    maxHp: 100,
    regenDelay: 0,
    damageFlash: 0,
    killFeedText: '',
    killFeedTimer: 0,
    killFeedKind: '',
    muzzleWorld: [0, 10.5, 0],
    custom: {
      camo: 'alpine',
      head: 'fast',
      weapon: 'mk17'
    },

    showBanner: (msg, kind = '') => {
      Operator.killFeedText = msg;
      Operator.killFeedKind = kind;
      Operator.killFeedTimer = 2.6;
    },

    takeDamage: (dmg) => {
      Operator.hp = Math.max(0, Operator.hp - dmg);
      Operator.regenDelay = 4.8;
      Operator.damageFlash = 1.0;
      if (Operator.hp <= 0) {
        Operator.hp = 100;
        Operator.pos = [0, TerrainSystem.getHeight(0, 0), 0];
        Operator.showBanner('ABATIDO EN COMBATE // REDESPLIEGUE EN PUNTO ALPHA', 'objective');
      }
    },

    swapShoulder: () => {
      Operator.shoulderSide = -Operator.shoulderSide;
      SoundEngine.playShoulderSwap();
    },

    startReload: () => {
      if (Operator.reloadTimer > 0 || Operator.mag >= Operator.maxMag || Operator.reserve <= 0) return;
      Operator.reloadTimer = 1.35;
      SoundEngine.playReload();
    },

    update: (dt, input, camYaw, camPitch, isADS) => {
      Operator.ads = !!isADS;
      Operator.adsBlend += ((Operator.ads ? 1.0 : 0.0) - Operator.adsBlend) * Math.min(1, 12.0 * dt);
      Operator.shoulderBlend += (Operator.shoulderSide - Operator.shoulderBlend) * Math.min(1, 10.0 * dt);
      Operator.recoil *= Math.exp(-16.0 * dt);
      if (Operator.fireCooldown > 0) Operator.fireCooldown = Math.max(0, Operator.fireCooldown - dt);
      if (Operator.hitMarkerTimer > 0) Operator.hitMarkerTimer = Math.max(0, Operator.hitMarkerTimer - dt);
      if (Operator.killFeedTimer > 0) Operator.killFeedTimer = Math.max(0, Operator.killFeedTimer - dt);
      if (Operator.damageFlash > 0) Operator.damageFlash = Math.max(0, Operator.damageFlash - dt * 2.4);
      if (Operator.regenDelay > 0) Operator.regenDelay -= dt;
      else if (Operator.hp < Operator.maxHp) Operator.hp = Math.min(Operator.maxHp, Operator.hp + 14.0 * dt);

      if (Operator.reloadTimer > 0) {
        Operator.reloadTimer -= dt;
        if (Operator.reloadTimer <= 0) {
          Operator.reloadTimer = 0;
          const need = Operator.maxMag - Operator.mag;
          const take = Math.min(need, Operator.reserve);
          Operator.mag += take;
          Operator.reserve -= take;
        }
      }

      // Velocidad estilo Wildlands: al apuntar con ratón derecho (ADS), reduce velocidad (~50%)
      let moveSpeed = 4.4;
      if (Operator.stance === 0) {
        if (Operator.ads) moveSpeed = 2.25;
        else if (input.shift) moveSpeed = 7.6;
      } else if (Operator.stance === 1) {
        moveSpeed = Operator.ads ? 1.45 : 2.50;
      } else {
        moveSpeed = Operator.ads ? 0.72 : 1.15;
      }

      const fwdInput   = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      const rightInput = (input.right   ? 1 : 0) - (input.left     ? 1 : 0);
      Operator.isMoving = (fwdInput !== 0 || rightInput !== 0);

      if (Operator.isMoving) {
        const fwdX = Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
        const rightX = Math.cos(camYaw), rightZ = Math.sin(camYaw);

        let mx = fwdX * fwdInput + rightX * rightInput;
        let mz = fwdZ * fwdInput + rightZ * rightInput;
        const len = Math.hypot(mx, mz) || 1.0;
        mx /= len; mz /= len;

        Operator.pos[0] += mx * moveSpeed * dt;
        Operator.pos[2] += mz * moveSpeed * dt;
        WorldColliders.resolveCircle(Operator.pos, 0.44, Operator.pos[1] + 0.5);
        Operator.speed = moveSpeed * 3.6;

        // Si apunta (ADS) o acaba de disparar, el operador mantiene rumbo hacia la cámara haciendo strafe
        const desiredYaw = (Operator.ads || Operator.recoil > 0.05) ? camYaw : Math.atan2(mx, -mz);
        let diff = desiredYaw - Operator.yaw;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        Operator.yaw += diff * Math.min(1, (Operator.ads ? 16.0 : 11.0) * dt);

        Operator.walkPhase += dt * (moveSpeed * 2.2);
        Operator.stepTimer += dt * (moveSpeed * 1.45);
        if (Operator.stepTimer >= 1.0) {
          Operator.stepTimer = 0;
          SoundEngine.playFootstep(Operator.isInShrub);
        }
      } else {
        Operator.speed = 0;
        Operator.walkPhase *= 0.85;
        if (Operator.ads || Operator.recoil > 0.05) {
          let diff = camYaw - Operator.yaw;
          while (diff >  Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          Operator.yaw += diff * Math.min(1, 14.0 * dt);
        }
      }

      let aimD = camYaw - Operator.yaw;
      while (aimD >  Math.PI) aimD -= Math.PI * 2;
      while (aimD < -Math.PI) aimD += Math.PI * 2;
      Operator.aimYawDiff = aimD;
      Operator.aimPitch = camPitch;

      Operator.pos[1] = TerrainSystem.getHeight(Operator.pos[0], Operator.pos[2]);

      const shrubDens = TerrainSystem.getShrubDensity(Operator.pos[0], Operator.pos[2]);
      Operator.isInShrub = shrubDens > 0.35;
      let targetVis = 1.0;
      if (Operator.isInShrub) {
        if (Operator.stance === 2) targetVis = 0.08;
        else if (Operator.stance === 1) targetVis = 0.25;
        else targetVis = 0.55;
      } else {
        if (Operator.stance === 2) targetVis = 0.40;
        else if (Operator.stance === 1) targetVis = 0.70;
      }
      Operator.visibilityIndex += (targetVis - Operator.visibilityIndex) * Math.min(1, 8.0 * dt);
    }
  };

  // Estación Generadora de la Base + Barriles Explosivos en Cadena
  const OutpostGenerator = {
    pos: [24.6, OUTPOST_SITE.y, -77.0],
    hp: 90,
    alive: true,
    spotted: true,

    reset: () => {
      OutpostGenerator.pos = [24.6, TerrainSystem.getHeight(24.6, -77.0), -77.0];
      OutpostGenerator.hp = 90;
      OutpostGenerator.alive = true;
    },

    sabotage: (viaWeapon = false) => {
      if (!OutpostGenerator.alive) return;
      OutpostGenerator.alive = false;
      OutpostGenerator.hp = 0;
      if (viaWeapon) ExplosionDecalSystem.spawn(OutpostGenerator.pos[0], OutpostGenerator.pos[1] + 0.6, OutpostGenerator.pos[2], 3.8);
      else SoundEngine.playSabotage();
      Operator.showBanner('GENERADOR SABOTEADO // ALARMA Y REFLECTORES DESACTIVADOS', 'objective');
    }
  };

  const ExplosiveBarrels = {
    list: [],
    reset: () => {
      const coords = [
        [12.8, -72.0], [10.0, -86.2], [20.5, -85.8], [24.5, -90.2]
      ];
      ExplosiveBarrels.list = coords.map((c, idx) => ({
        id: idx,
        pos: [c[0], TerrainSystem.getHeight(c[0], c[1]), c[1]],
        hp: 35,
        alive: true,
        spotted: false
      }));
    },
    detonate: (barrel) => {
      if (!barrel.alive) return;
      barrel.alive = false;
      ExplosionDecalSystem.spawn(barrel.pos[0], barrel.pos[1] + 0.5, barrel.pos[2], 6.0);
      // Daño en área a enemigos y reacción en cadena con otros barriles cercanos
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.pos[0] - barrel.pos[0], u.pos[2] - barrel.pos[2], (u.pos[1] - barrel.pos[1]) * 0.7);
        if (d < 7.8) OutpostPatrol.applyDamage(u, Math.round(140 * (1.0 - d / 8.5)), false, barrel.pos);
      }
      if (Math.hypot(OutpostGenerator.pos[0] - barrel.pos[0], OutpostGenerator.pos[2] - barrel.pos[2]) < 6.0) {
        OutpostGenerator.sabotage(true);
      }
      for (const other of ExplosiveBarrels.list) {
        if (!other.alive || other === barrel) continue;
        if (Math.hypot(other.pos[0] - barrel.pos[0], other.pos[2] - barrel.pos[2]) < 5.5) {
          ExplosiveBarrels.detonate(other);
        }
      }
      OutpostPatrol.alertArea(barrel.pos, 72.0);
    }
  };

  // Patrulla e IA Táctica Real del Puesto Avanzado Cordillera
  const OutpostPatrol = {
    units: [],
    alarmTimer: 0,
    totalKills: 0,

    reset: () => {
      OutpostGenerator.reset();
      ExplosiveBarrels.reset();
      OutpostPatrol.alarmTimer = 0;
      const defs = [
        { role: 'TIRADOR TORRE', tower: true, wps: [[26.5, -92.5]], hp: 100, camo: 'insurgent', head: 'balaclava', range: 95 },
        { role: 'CENTINELA PORTÓN', wps: [[16.2, -68.0], [13.5, -73.5], [18.5, -73.0]], hp: 100, camo: 'insurgent', head: 'boonie', range: 64 },
        { role: 'PATRULLA PATIO', wps: [[9.5, -75.2], [18.8, -75.5], [14.0, -82.0]], hp: 100, camo: 'insurgent', head: 'balaclava', range: 60 },
        { role: 'GUARDIA GENERADOR', wps: [[22.0, -78.8], [27.5, -75.2], [23.5, -83.5]], hp: 100, camo: 'insurgent', head: 'balaclava', range: 58 },
        { role: 'OFICIAL BUNKER', wps: [[6.2, -84.0], [14.2, -85.0], [12.0, -91.5]], hp: 120, camo: 'blackops', head: 'fast', range: 65 },
        { role: 'RECON OESTE', wps: [[2.5, -83.8], [4.5, -93.5], [13.0, -95.2]], hp: 100, camo: 'insurgent', head: 'boonie', range: 62 }
      ];
      OutpostPatrol.units = defs.map((d, idx) => {
        const p0 = d.wps[0];
        const y0 = d.tower ? OUTPOST_SITE.y + 4.55 : TerrainSystem.getHeight(p0[0], p0[1]);
        return {
          id: idx,
          role: d.role,
          tower: !!d.tower,
          wps: d.wps,
          wpIdx: 1 % d.wps.length,
          pos: [p0[0], y0, p0[1]],
          homePos: [p0[0], y0, p0[1]],
          yaw: 0,
          hp: d.hp,
          maxHp: d.hp,
          alive: true,
          downTimer: 0,
          respawnT: 0,
          state: 'PATROL', // PATROL | SUSPICIOUS | COMBAT | DOWNED
          awareness: 0,
          sightRange: d.range,
          spotted: false,
          lastKnownPos: null,
          searchTimer: 0,
          fireCooldown: 0.6 + idx * 0.15,
          stance: 0,
          isMoving: !d.tower,
          speed: d.tower ? 0 : 1.75,
          walkPhase: idx * 1.1,
          adsBlend: 0.35,
          shoulderBlend: 1,
          aimPitch: 0,
          aimYawDiff: 0,
          recoil: 0,
          reloadTimer: 0,
          customCamo: d.camo,
          customHead: d.head,
          headWorld: [p0[0], y0 + 1.62, p0[1]],
          torsoWorld: [p0[0], y0 + 1.15, p0[1]],
          muzzleWorld: [p0[0], y0 + 1.35, p0[1] - 0.5]
        };
      });
    },

    applyDamage: (u, dmg, isHeadshot, attackerPos) => {
      if (!u.alive) return false;
      u.hp -= dmg;
      u.spotted = true;
      if (u.hp <= 0) {
        u.hp = 0;
        u.alive = false;
        u.state = 'DOWNED';
        u.isMoving = false;
        u.speed = 0;
        u.downTimer = 0.01;
        u.respawnT = 48.0;
        OutpostPatrol.totalKills++;
        Operator.hitMarkerTimer = 0.24;
        Operator.hitMarkerKill = true;
        Operator.hitMarkerHead = isHeadshot;
        SoundEngine.playHitMarker(true, isHeadshot);
        Operator.showBanner(
          isHeadshot
            ? `TIRO EN LA CABEZA // ${u.role} ABATIDO (+100%)`
            : `HOSTIL NEUTRALIZADO // ${u.role}`,
          isHeadshot ? 'headshot' : ''
        );
        return true;
      } else {
        u.state = 'COMBAT';
        u.awareness = 1.0;
        u.lastKnownPos = attackerPos ? [...attackerPos] : [...Operator.pos];
        u.searchTimer = 14.0;
        Operator.hitMarkerTimer = 0.15;
        Operator.hitMarkerKill = false;
        Operator.hitMarkerHead = false;
        SoundEngine.playHitMarker(false, false);
        return false;
      }
    },

    alertArea: (noisePos, radius, exactAlert = false) => {
      for (const u of OutpostPatrol.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.pos[0] - noisePos[0], u.pos[2] - noisePos[2]);
        if (d <= radius) {
          u.lastKnownPos = [...noisePos];
          u.searchTimer = 11.0;
          if (exactAlert || d < radius * 0.45) {
            u.state = 'COMBAT';
            u.awareness = 1.0;
          } else if (u.state === 'PATROL') {
            u.state = 'SUSPICIOUS';
            u.awareness = Math.max(u.awareness, 0.55);
          }
        }
      }
      if (exactAlert && OutpostGenerator.alive && OutpostPatrol.alarmTimer <= 0) {
        OutpostPatrol.alarmTimer = 2.6;
        SoundEngine.playAlarmPulse();
      }
    },

    update: (dt, t, lightFactor = 1.0, activeTargetPos = Operator.pos) => {
      if (!OutpostPatrol.units.length) OutpostPatrol.reset();
      const dts = Math.min(dt, 0.05);
      if (OutpostPatrol.alarmTimer > 0) OutpostPatrol.alarmTimer -= dts;

      for (const u of OutpostPatrol.units) {
        if (!u.alive) {
          u.downTimer = Math.min(1.0, u.downTimer + dts * 1.4);
          u.respawnT -= dts;
          if (u.respawnT <= 0) {
            u.alive = true;
            u.hp = u.maxHp;
            u.state = 'PATROL';
            u.awareness = 0;
            u.downTimer = 0;
            u.spotted = false;
            u.pos = [...u.homePos];
          }
          continue;
        }

        u.recoil *= Math.exp(-14.0 * dts);
        if (u.fireCooldown > 0) u.fireCooldown = Math.max(0, u.fireCooldown - dts);

        // 1. Chequeo de Visión Real (Cono FOV + Sigilo + Obstáculos de terreno/muros/arbustos)
        const dxP = activeTargetPos[0] - u.pos[0];
        const dyP = (activeTargetPos[1] + (Operator.stance === 2 ? 0.35 : (Operator.stance === 1 ? 0.95 : 1.45))) - (u.pos[1] + 1.55);
        const dzP = activeTargetPos[2] - u.pos[2];
        const distP = Math.hypot(dxP, dyP, dzP);
        const nightFactor = 0.52 + 0.48 * lightFactor;
        const visRange = u.sightRange * nightFactor * (0.38 + 0.62 * Operator.visibilityIndex);

        let seesTarget = false;
        if (distP < visRange) {
          const dirX = Math.sin(u.yaw), dirZ = -Math.cos(u.yaw);
          const toX = dxP / (Math.hypot(dxP, dzP) || 1), toZ = dzP / (Math.hypot(dxP, dzP) || 1);
          const dotFov = dirX * toX + dirZ * toZ;
          const cosThreshold = u.state === 'COMBAT' ? -0.35 : 0.42; // 65° cono en patrulla, 110° en combate
          if (dotFov > cosThreshold || distP < 5.5) {
            const los = WorldColliders.raycastObstruction(u.pos[0], u.pos[1] + 1.55, u.pos[2], activeTargetPos[0], activeTargetPos[1] + 1.35, activeTargetPos[2], true);
            if (!los.blocked) {
              const shrubHide = los.concealment * (Operator.stance > 0 ? 1.1 : 0.65);
              if (shrubHide < 0.72 || distP < 9.0) {
                seesTarget = true;
                const fillRate = (distP < 18 ? 1.9 : 0.95) * (1.0 - shrubHide * 0.65);
                u.awareness = Math.min(1.0, u.awareness + fillRate * dts);
                u.lastKnownPos = [...activeTargetPos];
                u.searchTimer = 12.0;
              }
            }
          }
        }

        if (!seesTarget) {
          u.awareness = Math.max(0, u.awareness - dts * 0.22);
        }

        // 2. Transición de Estados IA
        if (u.awareness >= 0.95) {
          if (u.state !== 'COMBAT') {
            u.state = 'COMBAT';
            u.spotted = true;
            OutpostPatrol.alertArea(u.lastKnownPos || u.pos, OutpostGenerator.alive ? 42 : 16, true);
          }
        } else if (u.awareness >= 0.28 && u.state === 'PATROL') {
          u.state = 'SUSPICIOUS';
        } else if (u.state !== 'PATROL' && !seesTarget) {
          u.searchTimer -= dts;
          if (u.searchTimer <= 0) {
            u.state = 'PATROL';
            u.awareness = 0;
            u.lastKnownPos = null;
          }
        }

        // 3. Movimiento Táctico & Postura según Estado
        if (u.state === 'COMBAT' && u.lastKnownPos) {
          const aimX = activeTargetPos[0] - u.pos[0];
          const aimZ = activeTargetPos[2] - u.pos[2];
          const targetYaw = Math.atan2(aimX, -aimZ);
          let yd = targetYaw - u.yaw;
          while (yd > Math.PI) yd -= Math.PI * 2;
          while (yd < -Math.PI) yd += Math.PI * 2;
          u.yaw += yd * Math.min(1, dts * 7.5);
          u.aimPitch = Math.atan2(dyP, Math.hypot(aimX, aimZ));
          u.adsBlend += (1.0 - u.adsBlend) * Math.min(1, dts * 8);

          if (!u.tower) {
            // Desplazamiento lateral táctico o cobertura + agachado periódico
            const strafe = Math.sin(t * 1.4 + u.id * 2.1);
            const rX = Math.cos(u.yaw), rZ = Math.sin(u.yaw);
            const moveSpd = distP > 28 ? 2.4 : (distP < 12 ? -1.4 : 0);
            const vx = Math.sin(u.yaw) * moveSpd + rX * strafe * 1.35;
            const vz = -Math.cos(u.yaw) * moveSpd + rZ * strafe * 1.35;
            u.pos[0] += vx * dts;
            u.pos[2] += vz * dts;
            WorldColliders.resolveCircle(u.pos, 0.44, u.pos[1] + 0.5);
            u.pos[1] = TerrainSystem.getHeight(u.pos[0], u.pos[2]);
            u.isMoving = Math.hypot(vx, vz) > 0.35;
            u.speed = Math.hypot(vx, vz) * 3.6;
            u.walkPhase += dts * 5.2;
            u.stance = (Math.sin(t * 0.9 + u.id) > 0.45) ? 1 : 0;
          } else {
            u.isMoving = false;
            u.stance = (Math.sin(t * 1.1) > 0.65) ? 1 : 0;
          }

          // Disparo real al jugador cuando hay LOS limpio
          if (seesTarget && u.fireCooldown <= 0) {
            u.fireCooldown = u.tower ? 1.45 : (0.72 + (u.id % 3) * 0.16);
            u.recoil = 0.7;
            const muzzle = u.muzzleWorld || [u.pos[0], u.pos[1] + 1.4, u.pos[2]];
            const spread = u.tower ? 0.65 : 1.15;
            const shotEnd = [
              activeTargetPos[0] + (Math.random() - 0.5) * spread,
              activeTargetPos[1] + 1.2 + (Math.random() - 0.5) * spread * 0.6,
              activeTargetPos[2] + (Math.random() - 0.5) * spread
            ];
            TracerSystem.spawn(muzzle, shotEnd, false, true);
            SoundEngine.playGunshot(false, u.tower);
            const hitRoll = Math.hypot(shotEnd[0] - activeTargetPos[0], shotEnd[2] - activeTargetPos[2]);
            if (hitRoll < 0.78) Operator.takeDamage(u.tower ? 14 : 7);
          }
        } else if (u.state === 'SUSPICIOUS' && u.lastKnownPos) {
          const lx = u.lastKnownPos[0] - u.pos[0];
          const lz = u.lastKnownPos[2] - u.pos[2];
          let yd = Math.atan2(lx, -lz) - u.yaw;
          while (yd > Math.PI) yd -= Math.PI * 2;
          while (yd < -Math.PI) yd += Math.PI * 2;
          u.yaw += yd * Math.min(1, dts * 3.5);
          u.adsBlend += (0.75 - u.adsBlend) * Math.min(1, dts * 5);
          u.stance = 0;
          if (!u.tower && Math.hypot(lx, lz) > 4.0) {
            const len = Math.hypot(lx, lz) || 1;
            u.pos[0] += (lx / len) * 1.35 * dts;
            u.pos[2] += (lz / len) * 1.35 * dts;
            WorldColliders.resolveCircle(u.pos, 0.44, u.pos[1] + 0.5);
            u.pos[1] = TerrainSystem.getHeight(u.pos[0], u.pos[2]);
            u.isMoving = true;
            u.walkPhase += dts * 3.8;
          } else {
            u.isMoving = false;
          }
        } else {
          // PATRULLA NORMAL DE PUESTO AVANZADO
          u.adsBlend += (0.28 - u.adsBlend) * Math.min(1, dts * 4);
          u.aimPitch = 0;
          u.stance = 0;
          if (u.tower) {
            u.yaw = Math.sin(t * 0.45 + u.id) * 1.1 + 3.14;
            u.isMoving = false;
          } else {
            const wp = u.wps[u.wpIdx];
            const dx = wp[0] - u.pos[0], dz = wp[1] - u.pos[2];
            const dist = Math.hypot(dx, dz);
            if (dist < 1.1) {
              u.wpIdx = (u.wpIdx + 1) % u.wps.length;
            } else {
              const spd = 1.65;
              const targetYaw = Math.atan2(dx, -dz);
              let yd = targetYaw - u.yaw;
              while (yd > Math.PI) yd -= Math.PI * 2;
              while (yd < -Math.PI) yd += Math.PI * 2;
              u.yaw += yd * Math.min(1, dts * 4.5);
              u.pos[0] += (dx / dist) * spd * dts;
              u.pos[2] += (dz / dist) * spd * dts;
              WorldColliders.resolveCircle(u.pos, 0.44, u.pos[1] + 0.5);
              u.pos[1] = TerrainSystem.getHeight(u.pos[0], u.pos[2]);
              u.isMoving = true;
              u.walkPhase += dts * 4.0;
            }
          }
        }
      }
    }
  };

  // Sistema de trazadoras balísticas + explosiones C4
  const TracerSystem = {
    list: [],
    spawn: (a, b, isHit, isEnemy = false) => {
      TracerSystem.list.push({ a: [...a], b: [...b], life: isHit ? 0.16 : 0.12, maxLife: 0.16, isHit, isEnemy });
    },
    update: (dt) => {
      for (let i = TracerSystem.list.length - 1; i >= 0; i--) {
        TracerSystem.list[i].life -= dt;
        if (TracerSystem.list[i].life <= 0) TracerSystem.list.splice(i, 1);
      }
    }
  };

  const ExplosionDecalSystem = {
    centers: [ [0,0,0], [0,0,0], [0,0,0], [0,0,0] ],
    radii: [0, 0, 0, 0],
    idx: 0,
    spawn: (x, y, z, r = 4.2) => {
      ExplosionDecalSystem.centers[ExplosionDecalSystem.idx] = [x, y, z];
      ExplosionDecalSystem.radii[ExplosionDecalSystem.idx] = r;
      ExplosionDecalSystem.idx = (ExplosionDecalSystem.idx + 1) % 4;
      SoundEngine.playExplosion();
    }
  };

