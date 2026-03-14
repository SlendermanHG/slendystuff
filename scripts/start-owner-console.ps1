$ErrorActionPreference = "Stop"

param(
  [switch]$StartTray,
  [switch]$OpenAdmin
)

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$AdminUrl = "http://127.0.0.1:4173/admin/"
$HealthUrl = "http://127.0.0.1:4173/api/public-config"
$TrayScript = Join-Path $ScriptRoot "owner-console-tray.ps1"

function Test-OwnerConsole {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-OwnerServer {
  Start-Process powershell `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-Command", "Set-Location '$ProjectRoot'; npm start"
    ) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden | Out-Null
}

if (-not (Test-OwnerConsole)) {
  Start-OwnerServer
  Start-Sleep -Seconds 4
}

if ($StartTray) {
  $existingTray = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "powershell" -and $_.CommandLine -match "owner-console-tray\.ps1" }

  if (-not $existingTray) {
    Start-Process powershell `
      -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", "`"$TrayScript`""
      ) `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden | Out-Null
  }
}

if ($OpenAdmin) {
  Start-Process $AdminUrl | Out-Null
}
