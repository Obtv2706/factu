'use strict';

const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
if (!fs.existsSync(BUILD)) fs.mkdirSync(BUILD, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <text x="256" y="360" font-size="340" text-anchor="middle" fill="white" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" stroke="white" stroke-width="2" paint-order="stroke">$</text>
  <circle cx="256" cy="448" rx="18" ry="18" fill="rgba(255,255,255,0.25)"/>
</svg>`;

fs.writeFileSync(path.join(BUILD, 'icon.svg'), svg);
console.log('[icon] icon.svg creado');

async function build() {
  try {
    const sharp = require('sharp');
    const pngToIco = require('png-to-ico').default || require('png-to-ico');

    const svgBuf = Buffer.from(svg);

    await sharp(svgBuf)
      .resize(512, 512)
      .png()
      .toFile(path.join(BUILD, 'icon.png'));
    console.log('[icon] icon.png (512x512) creado');

    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const pngs = await Promise.all(
      sizes.map(async (size) => {
        const buf = await sharp(svgBuf).resize(size, size).png().toBuffer();
        return buf;
      })
    );

    const ico = await pngToIco(pngs);
    fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);
    console.log('[icon] icon.ico multi-res creado (' + sizes.join(', ') + ')');
  } catch (err) {
    console.warn('[icon] Error al generar icono (instalar sharp + png-to-ico):', err.message);
    console.warn('[icon] Usando icon.svg como placeholder');
  }
}

build();
