# Glosario Técnico — `offline-windows-games`

- **Canvas 2D**: API nativa de los navegadores web que permite dibujar gráficos, formas, partículas y animaciones píxel a píxel usando JavaScript sin instalar librerías.
- **WebGL2 / GLSL**: Tecnología nativa del navegador que se comunica directo con la tarjeta gráfica (GPU) para dibujar escenas 3D reales y sombreados avanzados a 60 FPS.
- **Instanced Rendering (*Instancing*)**: Técnica gráfica que permite dibujar cientos de miles de objetos iguales (árboles, rocas, cubos) en una sola orden a la GPU, multiplicando el rendimiento.
- **Draw Call**: Cada orden individual que la CPU le envía a la tarjeta gráfica para dibujar algo; reducir draw calls hace que el juego vaya mucho más fluido.
- **Generación Procedural**: Crear niveles, terrenos, texturas, enemigos o efectos mediante algoritmos matemáticos en código en lugar de guardar archivos pesados de imágenes o modelos 3D.
- **Object Pooling**: Patrón de rendimiento donde se reutilizan objetos ya creados (balas, partículas, enemigos) en vez de destruirlos y crearlos nuevos cada frame, evitando pausas (*Garbage Collection*).
- **WPF (`Windows Presentation Foundation`) y `Viewport3D`**: Sistema gráfico moderno integrado en Windows (.NET) que permite construir ventanas reales y escenas 3D directamente desde scripts de PowerShell sin instalar nada adicional.
- **`DispatcherTimer`**: Temporizador integrado en WPF que sincroniza la lógica y el refresco de pantalla sin congelar la ventana gráfica.
- **Frustum Culling**: Optimización 3D que evita dibujar los objetos que quedan detrás o fuera de la cámara del jugador.
- **LOD (*Level of Detail*)**: Técnica que muestra modelos detallados cuando un objeto está cerca y versiones simplificadas cuando está lejos para ahorrar GPU.
