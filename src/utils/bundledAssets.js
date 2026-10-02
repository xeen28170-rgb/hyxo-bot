'use strict';

/**
 * Fichiers indispensables au rendu, toujours disponibles : on prend le fichier
 * de assets/ s'il existe, sinon la copie intégrée au code (src/assets/*.js).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ASSETS = path.join(__dirname, '../../assets');

let banner = null;
function helpBanner() {
    if (banner) return banner;
    const file = path.join(ASSETS, 'help-banner.gif');
    banner = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from(require('../assets/helpBanner'), 'base64');
    return banner;
}

let fontFiles = null;
/** Chemins des polices pour resvg, qui ne sait lire que des fichiers. */
function cardFontFiles() {
    if (fontFiles) return fontFiles;
    const embedded = require('../assets/cardFonts');
    const tmp = path.join(os.tmpdir(), 'hyxo-fonts');
    fontFiles = Object.keys(embedded).map(name => {
        const local = path.join(ASSETS, 'fonts', name);
        if (fs.existsSync(local)) return local;
        const copy = path.join(tmp, name);
        if (!fs.existsSync(copy)) {
            fs.mkdirSync(tmp, { recursive: true });
            fs.writeFileSync(copy, Buffer.from(embedded[name], 'base64'));
        }
        return copy;
    });
    return fontFiles;
}

module.exports = { helpBanner, cardFontFiles };
