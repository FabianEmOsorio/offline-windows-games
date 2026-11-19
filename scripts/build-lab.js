/**
 * Ensamblador sin dependencias externas para generar el HTML único 100% offline.
 * Combina los módulos de `src/lab-mecanicas/` dentro de `html/lab-mecanicas-untraced.html`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src', 'lab-mecanicas');
const OUT_HTML = path.join(ROOT, 'html', 'lab-mecanicas-untraced.html');

const SCRIPT_ORDER = [
  '03-math-mixamo.js',
  '05-world-terrain-foliage.js',
  '04-shaders-audio.js',
  '06-character-rig-ik.js',
  '07-vehicles-ai.js',
  '08-engine-loop.js'
];

function buildLab() {
  const tpl = fs.readFileSync(path.join(SRC_DIR, '00-template.html'), 'utf8');
  const css = fs.readFileSync(path.join(SRC_DIR, '01-styles.css'), 'utf8');
  const hud = fs.readFileSync(path.join(SRC_DIR, '02-hud-modals.html'), 'utf8');

  const scripts = SCRIPT_ORDER.map((name) => {
    const code = fs.readFileSync(path.join(SRC_DIR, name), 'utf8');
    return `  // --- MODULE: ${name} ---\n${code}`;
  }).join('\n');

  const output = tpl
    .replace('/* @INJECT:01-styles.css */', () => css)
    .replace('<!-- @INJECT:02-hud-modals.html -->', () => hud)
    .replace('// @INJECT:SCRIPTS', () => scripts);

  fs.writeFileSync(OUT_HTML, output, 'utf8');
  const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
  console.log(`[BUILD] Ensamblado ${path.relative(ROOT, OUT_HTML)} (${kb} KB) desde ${SCRIPT_ORDER.length} módulos.`);
}

buildLab();
