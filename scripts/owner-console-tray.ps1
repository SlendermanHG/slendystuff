$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$AdminUrl = "http://127.0.0.1:4173/admin/"
$PublicUrl = "http://127.0.0.1:4173/"
$HealthUrl = "http://127.0.0.1:4173/api/public-config"

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

function New-HeartTrayIcon {
  $bitmap = New-Object System.Drawing.Bitmap 64, 64
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $heart = New-Object System.Drawing.Drawing2D.GraphicsPath
  $heart.StartFigure()
  $heart.AddBezier(
    [System.Drawing.Point]::new(32, 56),
    [System.Drawing.Point]::new(4, 34),
    [System.Drawing.Point]::new(8, 8),
    [System.Drawing.Point]::new(32, 20)
  )
  $heart.AddBezier(
    [System.Drawing.Point]::new(32, 20),
    [System.Drawing.Point]::new(56, 8),
    [System.Drawing.Point]::new(60, 34),
    [System.Drawing.Point]::new(32, 56)
  )
  $heart.CloseFigure()

  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 30, 8, 28))
  $fillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 84, 156))
  $outlinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 214, 235), 3)

  $graphics.TranslateTransform(1, 2)
  $graphics.FillPath($shadowBrush, $heart)
  $graphics.ResetTransform()
  $graphics.FillPath($fillBrush, $heart)
  $graphics.DrawPath($outlinePen, $heart)

  $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
  return [pscustomobject]@{
    Icon = $icon
    Bitmap = $bitmap
    Graphics = $graphics
    ShadowBrush = $shadowBrush
    FillBrush = $fillBrush
    OutlinePen = $outlinePen
    Path = $heart
  }
}

function Open-Admin {
  if (-not (Test-OwnerConsole)) {
    Start-OwnerServer
    Start-Sleep -Seconds 3
  }
  Start-Process $AdminUrl | Out-Null
}

$assets = New-HeartTrayIcon
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $assets.Icon
$notify.Text = "Slendy Stuff Owner Console"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openAdmin = $menu.Items.Add("Open Owner Console")
$openPublic = $menu.Items.Add("Open Local Site")
$ensureServer = $menu.Items.Add("Ensure Server Running")
$separator = $menu.Items.Add("-")
$exitItem = $menu.Items.Add("Exit Tray")

$openAdmin.Add_Click({ Open-Admin })
$openPublic.Add_Click({
  if (-not (Test-OwnerConsole)) {
    Start-OwnerServer
    Start-Sleep -Seconds 3
  }
  Start-Process $PublicUrl | Out-Null
})
$ensureServer.Add_Click({
  if (-not (Test-OwnerConsole)) {
    Start-OwnerServer
  }
})
$exitItem.Add_Click({
  $notify.Visible = $false
  $timer.Stop()
  $menu.Dispose()
  $notify.Dispose()
  $assets.Icon.Dispose()
  $assets.Bitmap.Dispose()
  $assets.Graphics.Dispose()
  $assets.ShadowBrush.Dispose()
  $assets.FillBrush.Dispose()
  $assets.OutlinePen.Dispose()
  $assets.Path.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu
$notify.add_DoubleClick({ Open-Admin })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 60000
$timer.add_Tick({
  if (-not (Test-OwnerConsole)) {
    Start-OwnerServer
  }
})
$timer.Start()

if (-not (Test-OwnerConsole)) {
  Start-OwnerServer
}

[System.Windows.Forms.Application]::Run()
