const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const srcIcon = path.join(__dirname, '../frontend/public/icon.png');
const resDir = path.join(__dirname, '../android/app/src/main/res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

console.log('=== Generating Android App Icons from Peyala Logo ===');

for (const [folder, size] of Object.entries(sizes)) {
  const targetFolder = path.join(resDir, folder);
  if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

  const targetFileSquare = path.join(targetFolder, 'ic_launcher.png');
  const targetFileRound = path.join(targetFolder, 'ic_launcher_round.png');

  // Use PowerShell with System.Drawing to do high-quality bicubic resampling
  const psScript = `
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile('${srcIcon.replace(/\\/g, '\\\\')}')
    $newBmp = New-Object System.Drawing.Bitmap(${size}, ${size})
    $g = [System.Drawing.Graphics]::FromImage($newBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, ${size}, ${size})
    $newBmp.Save('${targetFileSquare.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
    $newBmp.Save('${targetFileRound.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $newBmp.Dispose()
    $src.Dispose()
  `;

  try {
    execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
    console.log(`✅ Generated ${folder}/ic_launcher.png (${size}x${size})`);
  } catch (err) {
    console.error(`Error generating ${folder}:`, err.message);
    // Fallback: copy source icon directly
    fs.copyFileSync(srcIcon, targetFileSquare);
    fs.copyFileSync(srcIcon, targetFileRound);
  }
}

console.log('✅ All Android launcher icons generated successfully!\n');
