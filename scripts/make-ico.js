const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '../frontend/public/icon.png');
const pngData = fs.readFileSync(pngPath);

// Create 22-byte ICO header for 256x256 PNG-encoded icon
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type: 1 = Icon
icoHeader.writeUInt16LE(1, 4); // Count: 1 image

// Image entry
icoHeader.writeUInt8(0, 6); // Width: 0 = 256
icoHeader.writeUInt8(0, 7); // Height: 0 = 256
icoHeader.writeUInt8(0, 8); // Color count: 0
icoHeader.writeUInt8(0, 9); // Reserved
icoHeader.writeUInt16LE(1, 10); // Color planes
icoHeader.writeUInt16LE(32, 12); // Bits per pixel
icoHeader.writeUInt32LE(pngData.length, 14); // Size in bytes
icoHeader.writeUInt32LE(22, 18); // Offset to image data

const icoFile = Buffer.concat([icoHeader, pngData]);

fs.writeFileSync(path.join(__dirname, '../icon.ico'), icoFile);
fs.writeFileSync(path.join(__dirname, '../desktop/icon.ico'), icoFile);
console.log('✅ Generated authentic icon.ico from icon.png! Size:', icoFile.length);
