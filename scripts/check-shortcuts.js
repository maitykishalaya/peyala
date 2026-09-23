const { execSync } = require('child_process');
const fs = require('fs');

const ps = `
$sh = New-Object -ComObject WScript.Shell
Get-ChildItem -Path "C:\\Users\\User\\Desktop\\*.lnk" | ForEach-Object {
    $sc = $sh.CreateShortcut($_.FullName)
    [PSCustomObject]@{
        Name = $_.Name
        Target = $sc.TargetPath
        Arguments = $sc.Arguments
        WorkingDirectory = $sc.WorkingDirectory
    }
} | Format-List
`;

fs.writeFileSync('temp-check.ps1', ps);
console.log(execSync('powershell -NoProfile -ExecutionPolicy Bypass -File temp-check.ps1', { encoding: 'utf-8' }));
fs.unlinkSync('temp-check.ps1');
