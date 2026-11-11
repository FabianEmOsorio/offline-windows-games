# Comportamiento Esperado — `offline-windows-games`

## 1. Objetivo y Contexto
Alojar una colección modular de videojuegos independientes, portables y sin dependencias externas, divididos en dos líneas técnicas:
1. **HTML5 / Canvas 2D / WebGL2 (`html/`)**: Juegos enfocados en profundidad visual, rendimiento gráfico y generación procedural en navegador local.
2. **PowerShell / .NET (`powershell/`)**: Juegos experimentales que explotan las capacidades nativas de Windows (WPF, `Viewport3D`, GDI+, terminal ASCII) asumiendo un reto técnico deliberadamente superior.

## 2. Flujo de Usuario Paso a Paso
1. El usuario descarga o copia la carpeta o archivo único del juego deseado (`juego.html` o `juego.ps1`).
2. Si es un juego HTML: lo abre directamente en Microsoft Edge (doble clic / `file://`) y comienza a jugar de inmediato a 60 FPS sin servidor web.
3. Si es un juego PowerShell: lo ejecuta desde PowerShell (`.\juego.ps1`) sin modificar `ExecutionPolicy` ni requerir permisos de administrador.
4. Todos los juegos inician completamente en silencio, con controles claros en pantalla y sin peticiones de red.

## 3. Reglas Técnicas y de Negocio
- **Cero dependencias externas**: Prohibido `npm`, `pip`, Python, CDNs (Three.js, Phaser, React, etc.) o cargas remotas.
- **100% Offline**: Ninguna llamada HTTP/WebSocket.
- **Audio silencioso por defecto**: Cero reproducción de sonido al iniciar o jugar (si se agrega en un futuro, desactivado por defecto).
- **Aislamiento de datos**: Contenido 100% personal y creativo; prohibido incluir datos privados, credenciales o información ajena al juego.
- **Compatibilidad Hardware Objetivo**: Validado para correr fluido (60 FPS) en Intel Core i7-1185G7, 16 GB RAM e Intel Iris Xe Graphics (WebGL2 / WPF Viewport3D).

## 4. Criterios de Aceptación por Juego
- [ ] Funciona sin conexión a internet y sin servidor HTTP local.
- [ ] No dispara descargas ni solicita instalaciones ni permisos administrativos.
- [ ] Inicia en silencio absoluto.
- [ ] Mantiene arquitectura modular y mantiene fluidez estable (objetivo ≥ 60 FPS).
