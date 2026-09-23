const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = path.join(__dirname, '../portable-node');
if (fs.existsSync(path.join(targetDir, 'node.exe'))) {
  console.log('✅ portable-node is already present!');
  process.exit(0);
}

const url = 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip';
const zipPath = path.join(__dirname, '../node_portable.zip');
const extractDir = path.join(__dirname, '../node_extract');

console.log('[*] Downloading Portable Node.js v20 LTS (~30 MB)...');
const file = fs.createWriteStream(zipPath);

function download(downloadUrl) {
  https.get(downloadUrl, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      return download(response.headers.location);
    }
    response.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        console.log('[*] Download complete. Extracting to portable-node folder...');
        try {
          if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
          execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
          const items = fs.readdirSync(extractDir);
          const innerFolder = path.join(extractDir, items[0]);
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
          fs.renameSync(innerFolder, targetDir);
          fs.rmSync(zipPath, { force: true });
          fs.rmSync(extractDir, { recursive: true, force: true });
          console.log('✅ Portable Node.js installed successfully in portable-node/ !');
        } catch (err) {
          console.error('Extraction error:', err);
        }
      });
    });
  }).on('error', (err) => {
    fs.unlink(zipPath, () => {});
    console.error('Download error:', err);
  });
}

download(url);
