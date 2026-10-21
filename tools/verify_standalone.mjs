#!/usr/bin/env node
/* tools/verify_standalone.mjs — fe del archivo embebido: comprueba que `index-sunflex.html`
 * contiene la herramienta DE VERDAD, no un cascabel.
 *
 * `gen_standalone.py` se carga la herramienta pinchando en cuatro sitios (quitar el CDN,
 * meter los CSS y los `<script src>` en línea, desviar los `import()` al mapa base64 y, en
 * la ED, fijar la ruta del wasm). Cada uno de esos retoques puede romperse en silencio: una
 * etiqueta que no se sustituyó deja el `index-sunflex.html` pidiendo un archivo que en modo
 * embebido no existe, y el resultado otra vez es la rueda eterna. Así que aquí se decodifica
 * el mapa y se compara byte a byte con el fichero del que salió.
 *
 * Uso: node tools/verify_standalone.mjs        (exit 1 si algo no cuadra)
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const HERR = ['loadflow-simulator', 'ed-uc-simulator'];
let fallos = 0;
const mal = (f, m) => { console.log(`  ✗ ${f}: ${m}`); fallos++; };

for (const h of HERR) {
  const carpeta = path.join(RAIZ, 'static/tools', h);
  const destino = path.join(carpeta, 'index-sunflex.html');
  if (!fs.existsSync(destino)) { mal(h, 'falta index-sunflex.html (ejecute python3 gen_standalone.py)'); continue; }
  const html = fs.readFileSync(destino, 'utf8');
  const original = fs.readFileSync(path.join(carpeta, 'index.html'), 'utf8');
  const n = (re, s) => (s.match(re) || []).length;

  // 1) que el esqueleto no pida ningún archivo (el texto DENTRO de <script>/<style> no cuenta)
  let hueso = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script/>');
  hueso = hueso.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style/>');
  hueso = hueso.replace(/<!--[\s\S]*?-->/g, '');
  const pidiendo = n(/<(?:script|link)\b[^>]*(?:src|href)="(?!data:)[^"]+"/gi, hueso);
  if (pidiendo) mal(h, `${pidiendo} etiqueta(s) del documento siguen pidiendo un archivo`);

  // 2) que todo lo que el original pedía esté ahora en línea
  const css_orig = n(/<link\s+rel="stylesheet"\s+href="[^"]+"/gi, original);
  const js_orig = n(/<script\s+src="[^"]+"><\/script>/gi, original);
  const css_ok = n(/<style\s+data-inlinado=/gi, html);
  const js_ok = n(/<script\s+data-inlinado=/gi, html);
  if (css_ok < css_orig) mal(h, `CSS en línea ${css_ok} < los ${css_orig} del index.html`);
  if (js_ok < js_orig) mal(h, `scripts en línea ${js_ok} < los ${js_orig} del index.html`);

  // 3) el mapa de módulos: se decodifica y se compara con el fichero del que salió
  const mapa = {};
  for (const m of html.matchAll(/'([^']+)':'([A-Za-z0-9+/=]+)'/g)) mapa[m[1]] = m[2];
  const modulos = [...original.matchAll(/import\(\s*['"](\.\/[^'"]+)['"]\s*\)/g),
                   ...fs.readdirSync(carpeta).filter(f => f.endsWith('.js'))
                     .flatMap(f => [...fs.readFileSync(path.join(carpeta, f), 'utf8')
                       .matchAll(/import\(\s*['"](\.\/[^'"]+)['"]\s*\)/g)].map(x => x[1]))];
  const lista = [...new Set(modulos)];
  if (!lista.length) mal(h, 'el index.html no tiene import() que inlinear (¿cambió el patrón?)');
  for (const ref of lista) {
    const src = path.join(carpeta, ref);
    if (!fs.existsSync(src)) { console.log(`  · ${h}: ${ref} no existe en el repo (se deja pedir por red)`); continue; }
    let esperado = fs.readFileSync(src, 'utf8').replace(/<\/script/gi, '<\\/script');
    if (path.basename(src) === 'highs.mjs') {
      esperado = esperado.replace('new URL("highs.wasm",import.meta.url).href',
        `location.origin+"/app/static/tools/${h}/engine/highs.wasm"`);
    }
    const b64 = mapa[ref];
    if (!b64) { mal(h, `el módulo ${ref} no está en el mapa (se pediría por red)`); continue; }
    const dec = Buffer.from(b64, 'base64').toString('utf8');
    if (dec !== esperado) {
      mal(h, `${ref} inlineado NO coincide con el fichero (${dec.length} vs ${esperado.length} caracteres)`);
    }
  }

  // 4) los desvíos de import() y el paquete de 25 hojas
  if (!/__sunflex_mod\(['"]\.\//.test(html)) mal(h, 'los import() locales no fueron desviados a __sunflex_mod');
  if (!/window\.__sunflex_mod\s*=/.test(html)) mal(h, 'falta el cargador __sunflex_mod en el <head>');
  if (!/sunflex-boot\.js/.test(html)) mal(h, 'no está el vigía sunflex-boot.js');
  if (!/Castilla · piloto/.test(html)) mal(h, 'el paquete de hojas (sunflex-cases) no viajó dentro');
  const pide = /<script\b[^>]*\bsrc="https?:|<link\b[^>]*href="https?:[^"]*\.(css|js)"|@import\s+url\(["']?https?|fonts\.googleapis/gi;
  const fueras = (hueso.match(pide) || []).concat(html.match(/@import\s+url\(["']?https?:[^)"]*/g) || []);
  if (fueras.length) mal(h, `quedan ${fueras.length} dependencias externas que se pedirían por red: ${fueras.slice(0, 2).join(' | ')}`);

  console.log(`  ✓ ${h}: ${css_ok} CSS + ${js_ok} scripts + ${Object.keys(mapa).length} módulos en línea · `
    + `${(fs.statSync(destino).size / 1024).toFixed(0)} kB · documento sin peticiones`);
}
console.log(fallos ? `\nVEREDICTO: ${fallos} problema(s) en los archivos embebidos`
                   : '\nVEREDICTO: los dos index-sunflex.html son la herramienta entera, sin pedir nada');
process.exit(fallos ? 1 : 0);
