# Offline Windows Games

Colección de videojuegos personales **100% autocontenidos**, **offline-first**, **silenciosos por defecto** y **cero dependencias externas**, diseñados para ejecutarse directamente en entornos Windows nativos o en navegador sin instalación ni acceso a red.

---

## Arquitectura de Dos Ediciones por Juego

Cada título se publica en **dos ediciones** complementarias bajo la misma filosofía autocontenida y 100% offline:

1. **`Standard / Portable Edition`**:
   - Optimizada para alcanzar **60 FPS fluidos a 1920×1080 en gráficos integrados** (Intel Iris Xe / DirectX 12 / WebGL2).
   - 100% silenciosa por defecto (`Mute = ON` absoluto).
   - Incluye el perfil **Modo Touchpad de Portátil** activado por defecto, con switch instantáneo a **Teclado + Mouse** y remapeo completo de controles.
2. **`Max / Extended Edition`**:
   - Diseñada para exprimir hardware con GPU dedicada manteniendo el espíritu autocontenido (cero CDNs, cero servidores externos).
   - Incorpora mayor densidad de instancias, *shadow maps* de alta resolución (4096×4096), post-procesado FBO multi-pase (HDR, Bloom, Visión Nocturna y Visión Térmica FLIR), clima dinámico y sintetizador Web Audio procedural opcional (apagado por defecto al iniciar).

---

## Catálogo Actual

### Línea 1: `html/` — Juegos HTML5 / Canvas 2D / WebGL2
- **[`html/untraced-convergence/`](html/untraced-convergence/) — *Untraced: Convergence***:
  - Juego táctico 3D en 3.ª persona de infiltración, reconocimiento aéreo con dron, sabotaje de generadores/alarmas y disparo sincronizado (*Sync Shot*) de escuadrón en terreno montañoso procedural.
  - Incluye laboratorio de validación técnica (`poc-compatibilidad.html`), edición `Standard / Portable` (`untraced-convergence-standard.html`) y edición `Max / Extended` (`untraced-convergence-max.html`).

### Línea 2: `powershell/` — Juegos PowerShell / .NET (WPF & Terminal)
- Experimentación técnica profunda aprovechando componentes nativos de Windows (WPF, `Viewport3D`, `MeshGeometry3D`, `Canvas`, `DispatcherTimer`, Windows Forms / GDI+ y UI de consola) sin compilación dinámica innecesaria.

---

## Principios Técnicos
- **Cero Red**: Sin `fetch`, WebSockets, telemetría ni descarga de assets remotos.
- **Generación Procedural**: Geometrías, mapas, partículas, texturas y niveles generados por código.
- **Silencio por Defecto**: Sin audio automático al iniciar ni durante la partida.
- **Apertura Directa**: Los juegos HTML se abren directamente con doble clic (`file://`) sin requerir servidor HTTP local.

---

## Licencia y Propiedad Intelectual (Source-Available)

Copyright (c) 2026 Fabian Osorio.

Este repositorio es **Source-Available** (código visible para evaluación técnica, estudio y entretenimiento personal) bajo la licencia **[PolyForm Noncommercial License 1.0.0](LICENSE)** (*no es una licencia Open Source aprobada por OSI*):
- **Permitido**: Ver el código, descargarlo y ejecutar los juegos de forma personal, educativa o para evaluación de portafolio sin fines de lucro.
- **Prohibido**: Cualquier uso comercial, venta, monetización o redistribución en portales web con publicidad.
- **Marcas y Títulos Reservados**: Todos los derechos comerciales y los títulos originales de los juegos (incluyendo **Untraced: Convergence**) están reservados exclusivamente por el autor.
