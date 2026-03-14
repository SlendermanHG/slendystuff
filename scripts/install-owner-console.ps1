$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$StartScript = Join-Path $ScriptRoot "start-owner-console.ps1"
$TaskName = "SlendyStuffOwnerConsole"
$DesktopShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Slendy Stuff Owner Console.lnk"

if (-not (Test-Path $StartScript)) {
  throw "Start script not found: $StartScript"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`" -StartTray"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Starts the Slendy Stuff owner console tray app in the background." `
  -RunLevel Highest `
  -Force | Out-Null

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($DesktopShortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -OpenAdmin"
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,43"
$shortcut.Save()

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Created desktop shortcut: $DesktopShortcutPath"
