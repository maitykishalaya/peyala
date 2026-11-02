$taskName = "Peyala_POS_Nightly_Snapshot"
$batPath = "C:\Users\User\Desktop\peyala_v8\take-nightly-snapshot.bat"

if (-not (Test-Path $batPath)) {
    Write-Error "Could not find $batPath"
    exit 1
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`" --scheduled"
$trigger = New-ScheduledTaskTrigger -Daily -At "11:59PM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "[OK] Windows Scheduled Task '$taskName' registered successfully!" -ForegroundColor Green
    Write-Host "Trigger: Daily at 11:59 PM IST"
    Write-Host "State: $($task.State)"
} else {
    Write-Warning "Could not verify scheduled task."
}

