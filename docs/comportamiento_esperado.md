# Comportamiento Esperado — `offline-windows-games`

## 1. Objetivo y Contexto
Alojar una colección modular de videojuegos independientes, portables y sin dependencias externas, divididos en dos líneas técnicas y dos ediciones por título:
1. **HTML5 / Canvas 2D / WebGL2 (`html/`)**: Juegos enfocados en profundidad visual, rendimiento gráfico y generación procedural en navegador local (`file://`).
2. **PowerShell / .NET (`powershell/`)**: Juegos experimentales que explotan las capacidades nativas de Windows (WPF, `Viewport3D`, GDI+, terminal ASCII) asumiendo un reto técnico deliberadamente superior.

### Esquema de Dos Ediciones por Juego
- **`Standard / Portable Edition`**: Optimizada para correr a 60 FPS en gráficos integrados (Intel Iris Xe a 1920×1080), 100% silenciosa por defecto y con controles adaptados para **Touchpad de Portátil** por defecto + switch instantáneo a **Teclado + Mouse**.
- **`Max / Extended Edition`**: Exprime hardware dedicado manteniendo el espíritu 100% autocontenido y offline (sombras 4096×4096, pipeline FBO con Bloom/Visión Nocturna/Térmica FLIR, clima dinámico, mayor densidad de instancias y audio procedural opcional muteado por defecto).

## 2. Flujo de Usuario Paso a Paso
1. El usuario descarga o abre el archivo único del juego deseado (`*-standard.html`, `*-max.html` o `*.ps1`).
2. Si es un juego HTML: lo abre directamente en Microsoft Edge (doble clic / `file://`) y comienza a jugar de inmediato a 60 FPS sin servidor web.
3. Si es un juego PowerShell: lo ejecuta desde PowerShell (`.\juego.ps1`) sin modificar `ExecutionPolicy` ni requerir permisos de administrador.
4. En el menú o HUD puede alternar en un clic entre el **Perfil Touchpad de Portátil** y el **Perfil Teclado + Mouse**, ajustar sensibilidad o remapear cualquier tecla.
5. Todos los juegos inician completamente en silencio, con controles claros en pantalla y sin peticiones de red.

## 3. Reglas Técnicas y de Negocio
- **Cero dependencias externas**: Prohibido `npm`, `pip`, Python, CDNs (Three.js, Phaser, React, etc.) o cargas remotas.
- **100% Offline**: Ninguna llamada HTTP/WebSocket.
- **Audio silencioso por defecto**: Cero reproducción de sonido al iniciar o jugar (en ediciones `Max` con sintetizador Web Audio opcional, arranca estrictamente en `Mute = ON`).
- **Aislamiento de datos y licenciamiento**: Contenido 100% personal y creativo bajo licencia *Source-Available* (`PolyForm Noncommercial License 1.0.0`).
- **Compatibilidad Hardware Objetivo**: Validado para correr fluido (≥ 60 FPS) en Intel Core i7-1185G7, 16 GB RAM e Intel Iris Xe Graphics (WebGL2 / WPF Viewport3D).

## 4. Criterios de Aceptación por Juego (`Untraced: Convergence`)
- [x] Funciona sin conexión a internet y sin servidor HTTP local (`file://`).
- [x] No dispara descargas ni solicita instalaciones ni permisos administrativos.
- [x] Inicia en silencio absoluto.
- [x] Incluye PoC de compatibilidad (`poc-compatibilidad.html`), Edición `Standard / Portable` y Edición `Max / Extended`.
- [x] Ofrece Modo Touchpad de Portátil (ADS Toggle, disparo en `Espacio`, centrado en `Q`, respaldo en flechas inmune a *palm rejection*) + switch a Teclado y Mouse + remapeo de controles.
- [x] Implementa terreno montañoso procedural, 3 posturas, dron de reconocimiento con marcado 3D→2D, escuadrón de 3 compañeros con *Sync Shot*, sabotaje de generadores/alarmas y 3 sectores jugables.

## 5. Flujo y Criterios de Aceptación — Laboratorio de Mecánicas 3D (`html/lab-mecanicas-untraced.html`)
Laboratorio interactivo WebGL2 offline que valida la sensación táctica estilo *Ghost Recon Wildlands* antes de expandir campañas completas:
- **HUD minimalista y menús bajo keybinds remapeables**:
  - Vista de juego despejada (brújula superior, sector, telemetría de operador y arma, botones rápidos compactos y barra inferior mínima).
  - `[ESC]`: Menú de Pausa, Controles y Remapeo de Keybinds (`#tabSettings`) o cierre de modal activo.
  - `[I]`: Armería Táctica, Presets de Malla 3D (`Standard`/`High`/`Ultra`), Equipamiento (`FAST + GPNVG-18`, `Boonie`, `Balaclava`, `MK17 SCAR-H`, `M40A5`), switches de IK e Importador Offline de Mixamo `.glb`/`.gltf` (`#tabLoadout`).
  - `[K]`: Vehículos (`Polaris MRZR Buggy 4x4`, `Little Bird MH-6`), reagrupamiento y reinicio de patrulla (`#tabVehicles`).
  - `[M]`: Mapa Táctico 2D con radar en tiempo real, hora del día (`Tarde Dorada`, `Mediodía Alpino`, `Crepúsculo`, `Noche Táctica`), nubes y viento (`#tabMap`).
  - `[F1]`: Ayuda rápida de controles.
  - `[Alt]`: Liberación temporal del cursor sin abrir modales intrusivos, evitando disparos accidentales en la barra lateral de Zen Browser.
- **Cámara al Hombro (OTS), ADS y Posturas**:
  - Inicia en vista **Over-the-Shoulder (`HOMBRO DER`)**, desplazando al operador para dejar libre la retícula central.
  - Botón del pulgar (`Mouse3`/`M4`) o tecla `H` alternan entre `HOMBRO DER` y `HOMBRO IZQ` suprimiendo `auxclick` del navegador.
  - Apuntado ADS (`Mouse2`) aplica zoom FOV y reduce la velocidad de caminata (aprox. de `15.8 km/h` a `8.1 km/h`).
  - Posturas (`C` agachado, `Z` cuerpo a tierra/`PRONE`) con cuerpo tendido boca abajo y rifle nivelado hacia el horizonte `-Z`.
- **Personaje Continuo Deformable, Esqueleto e IK**:
  - Malla soldada continua por densidad (`std`/`high`/`ultra`) deformada en GPU (*Linear Blend Skinning*, 20 huesos), clips Mixamo integrados (`Idle`, `Walk`, `Run`), IK analítico de 2 huesos (ajuste al terreno, agarre de arma, *Look-At*) y soporte para importar archivos locales `.glb`/`.gltf` de Mixamo.
  - Inicia en silencio absoluto (`Mute = ON` por defecto) y opera 100% offline (`file://`).
- **Terreno Exacto, Follaje Denso de Ambas Caras y Colisiones Reales**:
  - Altura calculada con interpolación baricéntrica exacta sobre la triangulación de los chunks (`gridRes=32`, paso `2.0 m`) y explanada nivelada para la base hostil en `(16, -84, y=15.0)`.
  - Alfombra instanciada densa de hierba/helechos (`meshGrassCarpet`), arbustos Piornal y copas de alerce/pino renderizadas sin descarte trasero (`gl.disable(gl.CULL_FACE)` + inversión de normales `!gl_FrontFacing`).
  - Colisiones físicas circulares y por *raycast* (`WorldColliders`) contra troncos, rocas, terreno y estructuras de la base.
- **Vehículos con Física Raycast, Caja de 5 Marchas y Audio Procedural**:
  - **Buggy 4x4**: Suspensión raycast en 4 ruedas con *wheel contact clamping* (las llantas pisan los triángulos del suelo sin atravesarlo), saltos balísticos reales, recuperación de vuelco (`[R]`) y síntesis procedural de motor en 5 marchas con caída de par y curva de RPM.
  - **Little Bird MH-6**: Patines nivelados con pendiente del suelo, efecto suelo y vuelo libre estable, más síntesis de rotor por LFO y turbina. Todo el audio permanece silenciado al iniciar hasta activar `#chkAudio`.
- **Ciclo Día/Noche Continuo y Base Enemiga Cordillera**:
  - Simulación orbital continua de 24 h (`computeAtmosphereAtHour`) activable desde `[M]` (`#chkDayCycle`, `#slCycleSpeed`), con faros de vehículos y balizas emisivas nocturnas.
  - Base fortificada con muros Hesco, torre de vigilancia abierta, búnker, generador saboteable (`[F]` o explosión/disparo) y barriles explosivos en cadena.
  - 6 defensores con máquina de estados (`PATROL`, `SUSPICIOUS`, `COMBAT`, `DOWNED`), cono de visión bloqueado por relieve/muros/arbustos, audio de disparo suprimido vs. abierto, marcado táctico `[X]` con proyección 3D→2D, feedback rojo al abatir/headshot y postura animada de caída al terreno.
