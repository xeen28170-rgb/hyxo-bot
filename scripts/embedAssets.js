'use strict';

/**
 * Copie les fichiers indispensables (bannière de -help, polices des fiches)
 * dans src/assets/*.js en base64. Le bot les a ainsi toujours avec son code,
 * même si le dossier assets/ n'a pas été envoyé sur l'hébergeur.
 *
 *   node scripts/embedAssets.js   # à relancer si la bannière ou une police change
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'assets');
const b64 = file => fs.readFileSync(path.join(ROOT, file)).toString('base64');
const header = source => `'use strict';\n\n// Généré par scripts/embedAssets.js depuis ${source} — ne pas modifier à la main.\n`;

fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, 'helpBanner.js'),
    `${header('assets/help-banner.gif')}module.exports = '${b64('assets/help-banner.gif')}';\n`);

const fonts = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'assets', 'fonts'))
    .filter(name => name.endsWith('.ttf'))
    .map(name => [name, b64(path.join('assets', 'fonts', name))]));
fs.writeFileSync(path.join(OUT, 'cardFonts.js'),
    `${header('assets/fonts/')}module.exports = ${JSON.stringify(fonts, null, 4).replace(/"/g, '\'')};\n`);

for (const file of fs.readdirSync(OUT)) console.log(`src/assets/${file}`, `${(fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0)} Ko`);
