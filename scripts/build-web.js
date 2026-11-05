// Packages the app/ folder into dist/pixelboy-web.zip, ready to upload to itch.io as an HTML5 game.
// (itch.io needs index.html at the root of the zip.)
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

require('./sync-version.js');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'pixelboy-web.zip');

const output = fs.createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', () => console.log(`Wrote ${outFile} (${(archive.pointer() / 1024).toFixed(0)} KB)`));
archive.on('error', (e) => { throw e; });
archive.pipe(output);
archive.directory(path.join(root, 'app'), false);
archive.finalize();
