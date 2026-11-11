# Offline Windows Games

Colección de videojuegos personales **100% autocontenidos**, **offline-first**, **silenciosos por defecto** y **cero dependencias externas**, diseñados para ejecutarse directamente en entornos Windows nativos o en navegador sin instalación ni acceso a red.

---

## Líneas de Desarrollo

### 1. `html/` — Juegos HTML5 / Canvas 2D / WebGL2
- Archivos HTML autocontenidos (o carpetas locales compactas cuando la complejidad lo justifique).
- Cero CDNs, cero `npm`, cero frameworks externos: únicamente HTML5, CSS3, JavaScript puro, Canvas 2D y WebGL2 / GLSL nativos.
- Abribles directamente como archivo local (`juego.html`) sin servidor web.

### 2. `powershell/` — Juegos PowerShell / .NET (WPF & Terminal)
- Experimentación técnica profunda aprovechando componentes nativos de Windows (WPF, `Viewport3D`, `MeshGeometry3D`, `Canvas`, `DispatcherTimer`, Windows Forms / GDI+ y UI de consola).
- Sin compilación dinámica (`Add-Type`) salvo justificación estricta, priorizando PowerShell + .NET nativo.

---

## Principios Técnicos
- **Cero Red**: Sin `fetch`, WebSockets, telemetría ni descarga de assets remotos.
- **Generación Procedural**: Geometrías, mapas, partículas, texturas y niveles generados por código.
- **Silencio por Defecto**: Sin audio automático al iniciar ni durante la partida.
- **Objetivo de Rendimiento**: 60 FPS fluidos a 1920x1080 en gráficos integrados (Intel Iris Xe / DirectX 12 / WebGL2).
