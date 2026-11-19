  // 3. SHADERS WEBGL2 (CHAMPSAUR VALLEY ATMOSPHERE, SSS & MOUNTAIN FOG)
  const VS_SCENE = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_pos;
  layout(location=1) in vec3 a_norm;
  layout(location=2) in vec3 a_col;
  layout(location=3) in vec4 a_instPosScale; // xyz = pos, w = scale
  layout(location=4) in vec4 a_instRotWind;  // x = yaw, y = windFactor, z = sssFactor, w = microAO

  uniform mat4 u_vp;
  uniform mat4 u_model;
  uniform mat4 u_lightVP;
  uniform float u_time;
  uniform float u_windStr;
  uniform int u_isInstanced;
  uniform vec3 u_colorOverride;
  uniform int u_useOverride;

  out vec3 v_worldPos;
  out vec3 v_norm;
  out vec3 v_color;
  out vec4 v_shadowCoord;
  out float v_sssFactor;
  out float v_foliageHeight;
  out float v_microAO;

  void main() {
    vec3 pos = a_pos;
    vec3 norm = a_norm;
    vec3 col = (u_useOverride == 1) ? u_colorOverride : a_col;

    if (u_isInstanced == 1) {
      float windFac = a_instRotWind.y;
      float sssFac = a_instRotWind.z;
      v_sssFactor = sssFac;
      v_microAO = a_instRotWind.w;
      float maxH = (windFac < 0.35 && sssFac > 0.1) ? 5.5 : 1.2;
      v_foliageHeight = clamp(pos.y / maxH, 0.0, 1.0);

      // Viento físico armónico multi-frecuencia para hierba densa y copas de árbol
      if (windFac > 0.01) {
        float phase = a_instPosScale.x * 0.17 + a_instPosScale.z * 0.21 + pos.y * 0.45;
        float freq = (windFac > 0.35) ? 3.4 : 1.45;
        float gust = sin(u_time * freq + phase) + 0.42 * cos(u_time * (freq * 1.67) + phase * 1.35) + 0.18 * sin(u_time * 5.8 + pos.x * 2.1);
        float sway = gust * 0.13 * windFac * v_foliageHeight * u_windStr;
        pos.x += sway;
        pos.z += sway * 0.68;
        pos.y -= abs(sway) * 0.08;
      }

      float yaw = a_instRotWind.x;
      float cy = cos(yaw), sy = sin(yaw);
      vec3 rotated = vec3(pos.x * cy - pos.z * sy, pos.y, pos.x * sy + pos.z * cy);
      norm = normalize(vec3(norm.x * cy - norm.z * sy, norm.y, norm.x * sy + norm.z * cy));

      vec3 world = rotated * a_instPosScale.w + a_instPosScale.xyz;
      v_worldPos = world;
      v_norm = norm;
      v_color = col * (0.90 + a_instRotWind.w * 0.20);
      v_shadowCoord = u_lightVP * vec4(world, 1.0);
      gl_Position = u_vp * vec4(world, 1.0);
    } else {
      vec4 world = u_model * vec4(pos, 1.0);
      v_worldPos = world.xyz;
      v_norm = normalize(mat3(u_model) * norm);
      v_color = col;
      v_shadowCoord = u_lightVP * world;
      v_sssFactor = 0.0;
      v_foliageHeight = 1.0;
      v_microAO = 1.0;
      gl_Position = u_vp * world;
    }
  }`;

  const FS_SCENE = `#version 300 es
  precision highp float;
  in vec3 v_worldPos;
  in vec3 v_norm;
  in vec3 v_color;
  in vec4 v_shadowCoord;
  in float v_sssFactor;
  in float v_foliageHeight;
  in float v_microAO;

  uniform sampler2D u_shadowMap;
  uniform vec3 u_camPos;
  uniform vec3 u_sunDir;
  uniform vec3 u_sunColor;
  uniform vec3 u_skyAmbient;
  uniform vec3 u_groundAmbient;
  uniform vec3 u_fogColor;
  uniform int u_visionMode; // 0=Día, 1=NVG, 2=FLIR
  uniform float u_isThermalHot;
  uniform int u_sssEnabled;
  uniform float u_cloudLayerDensity; // Capa de nubes bajas de Champsaur
  uniform float u_renderDist;
  uniform int u_doubleSided;
  uniform float u_emissive;

  uniform vec3 u_explosionCenters[4];
  uniform float u_explosionRadii[4];

  out vec4 outColor;

  float calcShadow(vec4 sc, float ndotl) {
    vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
    float bias = max(0.0018 * (1.0 - ndotl), 0.00045);
    float texel = 1.0 / 2048.0;
    float sh = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        float d = texture(u_shadowMap, proj.xy + vec2(x, y) * texel).r;
        sh += (proj.z - bias > d) ? 0.36 : 1.0;
      }
    }
    return sh / 9.0;
  }

  void main() {
    vec3 N = normalize(v_norm);
    if (u_doubleSided == 1 && !gl_FrontFacing) N = -N;
    vec3 L = normalize(u_sunDir);
    vec3 V = normalize(u_camPos - v_worldPos);

    float NdotL = max(dot(N, L), 0.0);
    float shadow = calcShadow(v_shadowCoord, NdotL);

    vec3 baseCol = v_color;

    // Cráteres de explosiones C4 proyectados
    if (v_sssFactor < 0.01) {
      for (int i = 0; i < 4; i++) {
        if (u_explosionRadii[i] > 0.1) {
          float d = distance(v_worldPos.xz, u_explosionCenters[i].xz);
          if (d < u_explosionRadii[i]) {
            float n = sin(v_worldPos.x * 2.5) * cos(v_worldPos.z * 2.5) * 0.18;
            float burn = 1.0 - smoothstep(0.15 * u_explosionRadii[i], u_explosionRadii[i], d + n);
            vec3 charCol = mix(vec3(0.05, 0.04, 0.04), vec3(0.15, 0.11, 0.08), smoothstep(0.5, 1.0, d / u_explosionRadii[i]));
            baseCol = mix(baseCol, charCol, clamp(burn * 0.90, 0.0, 0.92));
          }
        }
      }
    }

    // GI Hemisférico estilizado
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(u_groundAmbient, u_skyAmbient, hemi);

    // Micro-AO Foliar en piornales y alerces
    if (v_sssFactor > 0.05) {
      float cavity = clamp(1.0 - v_foliageHeight * (0.42 + 0.58 * v_microAO), 0.0, 1.0);
      vec3 deepShade = vec3(0.08, 0.12, 0.16);
      ambient = mix(ambient, deepShade, cavity * 0.64);
      baseCol = mix(baseCol, baseCol * vec3(1.12, 1.14, 0.94), v_foliageHeight * 0.30);
    }

    vec3 direct = u_sunColor * NdotL * shadow;

    // Transluminiscencia Foliar balanceada (evita saturación extrema en copas)
    vec3 sssGlow = vec3(0.0);
    if (u_sssEnabled == 1 && v_sssFactor > 0.08) {
      float backLight = pow(clamp(dot(-L, V), 0.0, 1.0), 2.8);
      float rimWrap = pow(1.0 - abs(dot(N, V)), 2.2) * 0.35;
      float thinMask = smoothstep(0.22, 0.92, v_foliageHeight) * v_sssFactor;
      vec3 goldenAmber = mix(vec3(0.32, 0.60, 0.14), vec3(0.90, 0.68, 0.18), 0.60);
      sssGlow = goldenAmber * u_sunColor * clamp((backLight + rimWrap) * thinMask * 0.48, 0.0, 0.55) * mix(0.45, 1.0, shadow);
    }

    // Especular suave de sol
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 22.0) * 0.08 * shadow * (1.0 - v_sssFactor);

    vec3 lit = baseCol * (ambient + direct) + sssGlow + vec3(spec) + baseCol * (u_emissive * 2.2);

    // Tone Mapping Reinhard
    lit = lit / (1.0 + lit * 0.28);

    // ATMÓSFERA VALLE DE CHAMPSAUR: Niebla distante + Mar de nubes bajas + Tinte nocturno
    float distCam = length(v_worldPos - u_camPos);
    float maxDist = max(600.0, u_renderDist);
    float distFog = clamp(pow(distCam / maxDist, 1.85), 0.0, 0.95);

    // Capa de nubes bajas arrastrándose por el valle (altitud Y = 75m a 160m)
    float cloudBand = smoothstep(65.0, 105.0, v_worldPos.y) * (1.0 - smoothstep(140.0, 190.0, v_worldPos.y));
    float cloudNoise = sin(v_worldPos.x * 0.012) * cos(v_worldPos.z * 0.012) * 0.25;
    float localCloud = clamp((cloudBand + cloudNoise) * u_cloudLayerDensity, 0.0, 0.85);

    float dayFactor = clamp(u_sunDir.y * 2.2 + 0.35, 0.16, 1.0);
    vec3 mountainCloudCol = vec3(0.92, 0.94, 0.97) * dayFactor;
    vec3 blendedFogCol = mix(u_fogColor, mountainCloudCol, localCloud * 0.70);
    float totalFog = clamp(distFog + localCloud * 0.65, 0.0, 0.98) * (1.0 - clamp(u_emissive * 0.55, 0.0, 0.55));

    vec3 finalCol = mix(lit, blendedFogCol, totalFog);

    // Modos de Visión Táctica (NVG / FLIR)
    if (u_visionMode == 1) { // NVG GPNVG-18 fósforo verde
      float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
      finalCol = lum * vec3(0.18, 1.15, 0.45) * 1.55 + baseCol * (u_emissive * 0.8);
    } else if (u_visionMode == 2) { // FLIR térmico White-Hot
      if (u_isThermalHot > 0.5 || u_emissive > 0.4) {
        finalCol = vec3(1.0, 0.98, 0.92);
      } else {
        float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
        finalCol = vec3(lum * 0.45, lum * 0.52, lum * 0.70);
      }
    }

    outColor = vec4(pow(clamp(finalCol, 0.0, 1.0), vec3(1.0 / 2.05)), 0.0);
  }`;

  const VS_SHADOW = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_pos;
  layout(location=3) in vec4 a_instPosScale;
  layout(location=4) in vec4 a_instRotWind;
  uniform mat4 u_lightVP;
  uniform mat4 u_model;
  uniform float u_time;
  uniform float u_windStr;
  uniform int u_isInstanced;
  void main() {
    vec3 pos = a_pos;
    if (u_isInstanced == 1) {
      float windFac = a_instRotWind.y;
      float sssFac = a_instRotWind.z;
      float maxH = (windFac < 0.35 && sssFac > 0.1) ? 5.5 : 1.2;
      float hFac = clamp(pos.y / maxH, 0.0, 1.0);
      if (windFac > 0.01) {
        float phase = a_instPosScale.x * 0.14 + a_instPosScale.z * 0.18;
        float freq = (windFac > 0.35) ? 3.6 : 1.4;
        float gust = sin(u_time * freq + phase) + 0.45 * cos(u_time * (freq * 1.6) + phase * 1.3);
        float sway = gust * 0.12 * windFac * hFac * u_windStr;
        pos.x += sway; pos.z += sway * 0.65;
      }
      float yaw = a_instRotWind.x;
      float cy = cos(yaw), sy = sin(yaw);
      vec3 rotated = vec3(pos.x * cy - pos.z * sy, pos.y, pos.x * sy + pos.z * cy);
      vec3 world = rotated * a_instPosScale.w + a_instPosScale.xyz;
      gl_Position = u_lightVP * vec4(world, 1.0);
    } else {
      gl_Position = u_lightVP * (u_model * vec4(pos, 1.0));
    }
  }`;

  const FS_SHADOW = `#version 300 es
  precision highp float;
  void main() {}`;

  // Shaders de Malla Continua Esquelética GPU Linear Blend Skinning (LBS 20 Huesos)
  const VS_SKINNED = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_pos;
  layout(location=1) in vec3 a_norm;
  layout(location=2) in float a_matId;
  layout(location=3) in vec4 a_joints;
  layout(location=4) in vec4 a_weights;

  uniform mat4 u_vp;
  uniform mat4 u_lightVP;
  uniform mat4 u_boneMatrices[20];

  out vec3 v_worldPos;
  out vec3 v_norm;
  out float v_matId;
  out vec4 v_shadowCoord;

  void main() {
    mat4 skin =
      a_weights.x * u_boneMatrices[int(a_joints.x)] +
      a_weights.y * u_boneMatrices[int(a_joints.y)] +
      a_weights.z * u_boneMatrices[int(a_joints.z)] +
      a_weights.w * u_boneMatrices[int(a_joints.w)];
    vec4 wp = skin * vec4(a_pos, 1.0);
    v_worldPos = wp.xyz;
    v_norm = normalize(mat3(skin) * a_norm);
    v_matId = a_matId;
    v_shadowCoord = u_lightVP * wp;
    gl_Position = u_vp * wp;
  }`;

  const VS_SHADOW_SKINNED = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_pos;
  layout(location=3) in vec4 a_joints;
  layout(location=4) in vec4 a_weights;
  uniform mat4 u_lightVP;
  uniform mat4 u_boneMatrices[20];
  void main() {
    mat4 skin =
      a_weights.x * u_boneMatrices[int(a_joints.x)] +
      a_weights.y * u_boneMatrices[int(a_joints.y)] +
      a_weights.z * u_boneMatrices[int(a_joints.z)] +
      a_weights.w * u_boneMatrices[int(a_joints.w)];
    gl_Position = u_lightVP * (skin * vec4(a_pos, 1.0));
  }`;

  const FS_SKINNED = `#version 300 es
  precision highp float;
  in vec3 v_worldPos;
  in vec3 v_norm;
  in float v_matId;
  in vec4 v_shadowCoord;

  uniform sampler2D u_shadowMap;
  uniform vec3 u_camPos;
  uniform vec3 u_sunDir;
  uniform vec3 u_sunColor;
  uniform vec3 u_skyAmbient;
  uniform vec3 u_groundAmbient;
  uniform vec3 u_fogColor;
  uniform int u_visionMode;
  uniform int u_camoId; // 0=Alpino, 1=Sierra, 2=Woodland, 3=BlackOps, 4=Insurgente
  uniform float u_cloudLayerDensity;
  uniform float u_renderDist;
  uniform float u_isThermalHot;

  out vec4 outColor;

  float h21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
               mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float calcShadowSk(vec4 sc, float ndotl) {
    vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
    float bias = max(0.0018 * (1.0 - ndotl), 0.00045);
    float texel = 1.0 / 2048.0;
    float sh = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        float d = texture(u_shadowMap, proj.xy + vec2(x, y) * texel).r;
        sh += (proj.z - bias > d) ? 0.38 : 1.0;
      }
    }
    return sh / 9.0;
  }

  void main() {
    vec3 N = normalize(v_norm);
    vec3 L = normalize(u_sunDir);
    vec3 V = normalize(u_camPos - v_worldPos);

    vec3 baseU = vec3(0.46, 0.43, 0.36);
    vec3 darkU = vec3(0.28, 0.25, 0.20);
    vec3 lightU = vec3(0.62, 0.58, 0.48);
    vec3 vestC = vec3(0.32, 0.29, 0.24);
    if (u_camoId == 1) {
      baseU = vec3(0.56, 0.49, 0.35); darkU = vec3(0.38, 0.31, 0.22); lightU = vec3(0.68, 0.61, 0.45); vestC = vec3(0.40, 0.34, 0.24);
    } else if (u_camoId == 2) {
      baseU = vec3(0.22, 0.31, 0.18); darkU = vec3(0.12, 0.16, 0.10); lightU = vec3(0.34, 0.40, 0.24); vestC = vec3(0.18, 0.22, 0.16);
    } else if (u_camoId == 3) {
      baseU = vec3(0.14, 0.16, 0.18); darkU = vec3(0.08, 0.09, 0.11); lightU = vec3(0.20, 0.22, 0.25); vestC = vec3(0.10, 0.11, 0.13);
    } else if (u_camoId == 4) {
      baseU = vec3(0.35, 0.21, 0.18); darkU = vec3(0.20, 0.12, 0.10); lightU = vec3(0.46, 0.28, 0.22); vestC = vec3(0.16, 0.14, 0.14);
    }

    int mid = int(v_matId + 0.5);
    vec3 albedo = baseU;
    float specPow = 22.0, specStr = 0.12;
    vec3 emissive = vec3(0.0);

    if (mid == 0) {
      float c1 = n2(v_worldPos.xy * 12.0 + v_worldPos.zy * 8.0);
      float c2 = n2(v_worldPos.xz * 26.0);
      if (c1 > 0.58) albedo = darkU;
      else if (c2 > 0.66) albedo = lightU;
      albedo += sin(v_worldPos.x * 160.0) * sin(v_worldPos.y * 160.0) * 0.018;
    } else if (mid == 1) {
      albedo = vestC + (sin(v_worldPos.x * 190.0) + cos(v_worldPos.y * 190.0)) * 0.015;
      specPow = 18.0; specStr = 0.16;
    } else if (mid == 2) {
      albedo = vec3(0.24, 0.20, 0.18);
      specPow = 28.0; specStr = 0.18;
    } else if (mid == 3) {
      albedo = mix(vestC, baseU, 0.45);
      specPow = 36.0; specStr = 0.22;
    } else if (mid == 4) {
      albedo = vec3(0.06, 0.45, 0.36);
      emissive = vec3(0.04, 0.32, 0.28);
      specPow = 88.0; specStr = 0.72;
    } else if (mid == 6) {
      albedo = vec3(0.74, 0.56, 0.46);
      specPow = 24.0; specStr = 0.16;
    } else {
      albedo = vec3(0.13, 0.14, 0.16);
      specPow = 64.0; specStr = 0.55;
    }

    float NdotL = max(dot(N, L), 0.0);
    float shadow = calcShadowSk(v_shadowCoord, NdotL);
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(u_groundAmbient, u_skyAmbient, hemi) * 1.15;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), specPow) * specStr * shadow;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.16;

    vec3 lit = albedo * (ambient + u_sunColor * NdotL * shadow) + vec3(spec) + vec3(0.24, 0.38, 0.52) * rim + emissive;
    lit = lit / (1.0 + lit * 0.26);

    float distCam = length(v_worldPos - u_camPos);
    float distFog = clamp(pow(distCam / max(600.0, u_renderDist), 1.85), 0.0, 0.90);
    float cloudBand = smoothstep(65.0, 105.0, v_worldPos.y) * (1.0 - smoothstep(140.0, 190.0, v_worldPos.y));
    float localCloud = clamp(cloudBand * u_cloudLayerDensity, 0.0, 0.75);
    vec3 finalCol = mix(lit, mix(u_fogColor, vec3(0.92, 0.94, 0.97), localCloud * 0.7), clamp(distFog + localCloud * 0.6, 0.0, 0.94));

    if (u_visionMode == 1) {
      float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
      finalCol = lum * vec3(0.18, 1.15, 0.45) * 1.5;
    } else if (u_visionMode == 2) {
      finalCol = u_isThermalHot > 0.5 ? vec3(0.98, 0.96, 0.88) : vec3(0.35, 0.42, 0.58);
    }
    outColor = vec4(pow(clamp(finalCol, 0.0, 1.0), vec3(1.0 / 2.05)), 0.0);
  }`;

  const VS_LINE = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_pos;
  uniform mat4 u_vp;
  void main() { gl_Position = u_vp * vec4(a_pos, 1.0); }`;

  const FS_LINE = `#version 300 es
  precision highp float;
  uniform vec3 u_color;
  out vec4 outColor;
  void main() { outColor = vec4(u_color, 0.0); }`;

  const VS_POST = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 a_pos;
  out vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }`;

  const FS_GODRAYS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_sceneTex;
  uniform vec2 u_sunScreenPos;
  uniform float u_sunVisible;
  uniform float u_aspect;
  out vec4 outColor;
  void main() {
    vec4 base = texture(u_sceneTex, v_uv);
    vec2 diff = (v_uv - u_sunScreenPos) * vec2(u_aspect, 1.0);
    float dSun = length(diff);
    float isSkyBase = step(0.5, base.a);
    float solarHalo = smoothstep(0.34, 0.0, dSun) * isSkyBase * u_sunVisible;
    vec3 col = base.rgb + vec3(1.0, 0.92, 0.72) * (solarHalo * 0.35 + smoothstep(0.032, 0.008, dSun) * isSkyBase * u_sunVisible * 0.85);
    if (u_sunVisible < 0.01) { outColor = vec4(col, 1.0); return; }
    vec2 delta = (u_sunScreenPos - v_uv) * 0.015;
    vec2 tc = v_uv;
    float illumination = 0.0;
    float decay = 1.0;
    for (int i = 0; i < 28; i++) {
      tc += delta;
      vec2 scDiff = (tc - u_sunScreenPos) * vec2(u_aspect, 1.0);
      float sunDisc = smoothstep(0.24, 0.02, length(scDiff));
      float isSky = step(0.5, texture(u_sceneTex, tc).a);
      illumination += (isSky * sunDisc) * decay;
      decay *= 0.94;
    }
    vec3 rays = vec3(1.0, 0.88, 0.65) * (illumination * 0.055 * u_sunVisible);
    outColor = vec4(col + rays, 1.0);
  }`;


  // 4. SINTETIZADOR DE AUDIO PROCEDIMENTAL (SILENCIADO POR DEFECTO)
  const SoundEngine = {
    ctx: null,
    enabled: false,
    volMaster: null,
    oscEngine: null,
    oscEngineSub: null,
    filterEngine: null,
    gainEngine: null,
    oscRotor: null,
    oscTurbine: null,
    lfoRotor: null,
    lfoRotorGain: null,
    gainRotor: null,

    init: () => {
      if (SoundEngine.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        SoundEngine.ctx = new AC();
        SoundEngine.volMaster = SoundEngine.ctx.createGain();
        SoundEngine.volMaster.gain.value = 0.0;
        SoundEngine.volMaster.connect(SoundEngine.ctx.destination);

        // Motor Buggy V-Twin / Boxer con filtro pasa-bajos dinámico y sub-armónico
        SoundEngine.oscEngine = SoundEngine.ctx.createOscillator();
        SoundEngine.oscEngine.type = 'sawtooth';
        SoundEngine.oscEngine.frequency.value = 44;

        SoundEngine.oscEngineSub = SoundEngine.ctx.createOscillator();
        SoundEngine.oscEngineSub.type = 'triangle';
        SoundEngine.oscEngineSub.frequency.value = 22;

        SoundEngine.filterEngine = SoundEngine.ctx.createBiquadFilter();
        SoundEngine.filterEngine.type = 'lowpass';
        SoundEngine.filterEngine.frequency.value = 240;
        SoundEngine.filterEngine.Q.value = 2.8;

        SoundEngine.gainEngine = SoundEngine.ctx.createGain();
        SoundEngine.gainEngine.gain.value = 0;

        SoundEngine.oscEngine.connect(SoundEngine.filterEngine);
        SoundEngine.oscEngineSub.connect(SoundEngine.filterEngine);
        SoundEngine.filterEngine.connect(SoundEngine.gainEngine);
        SoundEngine.gainEngine.connect(SoundEngine.volMaster);
        SoundEngine.oscEngine.start();
        SoundEngine.oscEngineSub.start();

        // Rotor Little Bird: palas (LFO) + turbina agudo
        SoundEngine.oscRotor = SoundEngine.ctx.createOscillator();
        SoundEngine.oscRotor.type = 'sawtooth';
        SoundEngine.oscRotor.frequency.value = 24;

        SoundEngine.oscTurbine = SoundEngine.ctx.createOscillator();
        SoundEngine.oscTurbine.type = 'sine';
        SoundEngine.oscTurbine.frequency.value = 390;
        const gTurb = SoundEngine.ctx.createGain();
        gTurb.gain.value = 0.16;

        SoundEngine.gainRotor = SoundEngine.ctx.createGain();
        SoundEngine.gainRotor.gain.value = 0;

        SoundEngine.lfoRotor = SoundEngine.ctx.createOscillator();
        SoundEngine.lfoRotor.type = 'sine';
        SoundEngine.lfoRotor.frequency.value = 9.5;
        SoundEngine.lfoRotorGain = SoundEngine.ctx.createGain();
        SoundEngine.lfoRotorGain.gain.value = 0.11;

        const filterRotor = SoundEngine.ctx.createBiquadFilter();
        filterRotor.type = 'lowpass';
        filterRotor.frequency.value = 180;

        SoundEngine.oscRotor.connect(filterRotor);
        filterRotor.connect(SoundEngine.gainRotor);
        SoundEngine.oscTurbine.connect(gTurb);
        gTurb.connect(SoundEngine.gainRotor);
        SoundEngine.lfoRotor.connect(SoundEngine.lfoRotorGain);
        SoundEngine.lfoRotorGain.connect(SoundEngine.gainRotor.gain);
        SoundEngine.gainRotor.connect(SoundEngine.volMaster);

        SoundEngine.oscRotor.start();
        SoundEngine.oscTurbine.start();
        SoundEngine.lfoRotor.start();
      } catch (e) {
        console.warn('Web Audio no disponible:', e);
      }
    },

    toggle: (enable) => {
      if (enable) SoundEngine.init();
      SoundEngine.enabled = !!enable;
      if (!SoundEngine.ctx || !SoundEngine.volMaster) return;
      if (enable && SoundEngine.ctx.state === 'suspended') SoundEngine.ctx.resume();
      SoundEngine.volMaster.gain.value = enable ? 0.35 : 0.0;
    },

    playFootstep: (inShrub) => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator();
      const g = SoundEngine.ctx.createGain();
      o.type = inShrub ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(inShrub ? 185 : 95, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.08);
      g.gain.setValueAtTime(inShrub ? 0.14 : 0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.09);
    },

    playGunshot: (suppressed, isSniper) => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator();
      const g = SoundEngine.ctx.createGain();
      if (suppressed) {
        o.type = 'triangle';
        o.frequency.setValueAtTime(320, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        o.connect(g); g.connect(SoundEngine.volMaster);
        o.start(t); o.stop(t + 0.08);
      } else {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(isSniper ? 720 : 540, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.28);
        g.gain.setValueAtTime(isSniper ? 0.65 : 0.45, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        o.connect(g); g.connect(SoundEngine.volMaster);
        o.start(t); o.stop(t + 0.30);
      }
    },

    playExplosion: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator();
      const g = SoundEngine.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(18, t + 1.2);
      g.gain.setValueAtTime(0.75, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 1.25);
    },

    playReload: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      [0.0, 0.45, 0.92].forEach((dtOff, idx) => {
        const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(idx === 2 ? 780 : 420, t + dtOff);
        o.frequency.exponentialRampToValueAtTime(140, t + dtOff + 0.06);
        g.gain.setValueAtTime(0.14, t + dtOff);
        g.gain.exponentialRampToValueAtTime(0.001, t + dtOff + 0.07);
        o.connect(g); g.connect(SoundEngine.volMaster);
        o.start(t + dtOff); o.stop(t + dtOff + 0.08);
      });
    },

    playShoulderSwap: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(280, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.04);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.06);
    },

    playHitMarker: (isKill, isHeadshot) => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = isHeadshot ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(isHeadshot ? 1680 : 1180, t);
      o.frequency.exponentialRampToValueAtTime(isHeadshot ? 840 : 580, t + 0.055);
      g.gain.setValueAtTime(isKill ? 0.22 : 0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.07);
      if (isKill) {
        const o2 = SoundEngine.ctx.createOscillator(), g2 = SoundEngine.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(isHeadshot ? 1050 : 720, t + 0.055);
        o2.frequency.exponentialRampToValueAtTime(260, t + 0.16);
        g2.gain.setValueAtTime(0.24, t + 0.055);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
        o2.connect(g2); g2.connect(SoundEngine.volMaster);
        o2.start(t + 0.055); o2.stop(t + 0.18);
      }
    },

    playCollisionBump: (intensity) => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const lvl = Math.min(1, Math.max(0.15, intensity || 0.4));
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(110 + lvl * 45, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.14);
      g.gain.setValueAtTime(0.18 * lvl, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.16);
    },

    playSpotMark: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(1180, t + 0.045);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.12);
    },

    playSabotage: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(95, t + 0.55);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.6);
    },

    playAlarmPulse: () => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      const o = SoundEngine.ctx.createOscillator(), g = SoundEngine.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(640, t);
      o.frequency.linearRampToValueAtTime(480, t + 0.25);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.27);
      o.connect(g); g.connect(SoundEngine.volMaster);
      o.start(t); o.stop(t + 0.28);
    },

    updateFrame: (mode, speedKmh, alt, vehTelemetry) => {
      if (!SoundEngine.enabled || !SoundEngine.ctx) return;
      const t = SoundEngine.ctx.currentTime;
      if (mode === 1) { // Buggy: RPM + Cambios de Marcha + Filtro Dinámico
        const vt = vehTelemetry || {};
        const rpmNorm = (typeof vt.rpmNorm === 'number') ? vt.rpmNorm : Math.min(1, Math.abs(speedKmh) / 65);
        const shiftDip = vt.shiftDip || 0;
        const throttle = Math.abs(vt.throttle || 0);
        const baseFreq = (36 + rpmNorm * 82) * (1.0 - shiftDip * 0.24) + (vt.airborne ? 10 : 0);
        SoundEngine.oscEngine.frequency.setTargetAtTime(baseFreq, t, 0.03);
        SoundEngine.oscEngineSub.frequency.setTargetAtTime(baseFreq * 0.502, t, 0.03);
        SoundEngine.filterEngine.frequency.setTargetAtTime(200 + rpmNorm * 720 + throttle * 260, t, 0.04);
        SoundEngine.gainEngine.gain.setTargetAtTime((0.15 + throttle * 0.09 + rpmNorm * 0.08) * (1.0 - shiftDip * 0.35), t, 0.03);
        SoundEngine.gainRotor.gain.setTargetAtTime(0, t, 0.05);
      } else if (mode === 2) { // Little Bird: Blade Slap + Turbina
        const vt = vehTelemetry || {};
        const coll = vt.collective || 0;
        const bladeFreq = 20 + Math.min(Math.abs(speedKmh) * 0.25, 16) + Math.abs(coll) * 4;
        const chopHz = 9.0 + Math.min(Math.abs(speedKmh) * 0.08, 6.0);
        SoundEngine.gainEngine.gain.setTargetAtTime(0, t, 0.05);
        SoundEngine.gainRotor.gain.setTargetAtTime(vt.rotorRpm > 0.2 ? 0.26 : 0.05, t, 0.06);
        SoundEngine.oscRotor.frequency.setTargetAtTime(bladeFreq, t, 0.05);
        SoundEngine.oscTurbine.frequency.setTargetAtTime(360 + (vt.airborne ? 85 : 15) + Math.abs(coll) * 55, t, 0.08);
        SoundEngine.lfoRotor.frequency.setTargetAtTime(chopHz, t, 0.05);
      } else {
        SoundEngine.gainEngine.gain.setTargetAtTime(0, t, 0.05);
        SoundEngine.gainRotor.gain.setTargetAtTime(0, t, 0.05);
      }
    }
  };

