<#
Checks whether the Cloudflare quick tunnel is up, restarts it if not, syncs
NEXTAUTH_URL in .env to whatever URL the tunnel is actually using, and
(re)starts the Next.js dev server. Safe to re-run any time - if the tunnel
is already healthy it's left alone and only the dev server is restarted.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [string]$CloudflaredPath = (Join-Path $ProjectRoot "tools\cloudflared.exe"),
  [int]$Port = 3000,
  [switch]$ClearCache
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Test-UrlUp([string]$url) {
  try {
    Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 8 -UseBasicParsing | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response) {
      # Any real HTTP response (even a 4xx from the app) means the tunnel is
      # up. Cloudflare's own gateway errors (502/523/530) mean it's not.
      return [int]$_.Exception.Response.StatusCode -lt 500
    }
    return $false
  }
}

$envPath = Join-Path $ProjectRoot ".env"
$envContent = Get-Content $envPath -Raw

$currentUrl = $null
if ($envContent -match 'NEXTAUTH_URL="([^"]+)"') {
  $currentUrl = $Matches[1]
}

$tunnelOk = $false
if ($currentUrl) {
  Write-Host ("Checking existing tunnel: " + $currentUrl)
  $tunnelOk = Test-UrlUp ($currentUrl + "/login")
}

$cloudflaredProc = Get-Process cloudflared -ErrorAction SilentlyContinue

if ((-not $tunnelOk) -or (-not $cloudflaredProc)) {
  Write-Host "Tunnel is down or unreachable - restarting cloudflared..."

  if ($cloudflaredProc) {
    $cloudflaredProc | Stop-Process -Force
    Start-Sleep -Seconds 1
  }

  if (-not (Test-Path $CloudflaredPath)) {
    throw ("cloudflared.exe not found at " + $CloudflaredPath + ". Download it from Cloudflare's official releases and place it there, or pass -CloudflaredPath.")
  }

  $tunnelLog = Join-Path $env:TEMP "sports-auction-tunnel.log"
  $tunnelErrLog = Join-Path $env:TEMP "sports-auction-tunnel-err.log"
  Remove-Item $tunnelLog -ErrorAction SilentlyContinue
  Remove-Item $tunnelErrLog -ErrorAction SilentlyContinue

  Start-Process -FilePath $CloudflaredPath `
    -ArgumentList "tunnel", "--url", ("http://localhost:" + $Port) `
    -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrLog `
    -WindowStyle Hidden

  Write-Host "Waiting for cloudflared to report a tunnel URL..."
  $newUrl = $null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path $tunnelLog) { $log += (Get-Content $tunnelLog -Raw) }
    if (Test-Path $tunnelErrLog) { $log += (Get-Content $tunnelErrLog -Raw) }
    if ($log -match "https://[a-z0-9-]+\.trycloudflare\.com") {
      $newUrl = $Matches[0]
      break
    }
  }

  if (-not $newUrl) {
    throw ("Timed out waiting for cloudflared to report a tunnel URL. Check " + $tunnelErrLog)
  }

  Write-Host ("New tunnel URL: " + $newUrl)

  $replacement = 'NEXTAUTH_URL="' + $newUrl + '"'
  if ($envContent -match 'NEXTAUTH_URL="[^"]*"') {
    $updatedContent = $envContent -replace 'NEXTAUTH_URL="[^"]*"', $replacement
  } else {
    $updatedContent = $envContent.TrimEnd() + [Environment]::NewLine + $replacement + [Environment]::NewLine
  }
  # Windows PowerShell's "utf8" encoding writes a BOM, which corrupts the
  # first .env key for tools that parse it strictly (e.g. `tsx --env-file`).
  # Write plain UTF-8 without a BOM instead.
  [System.IO.File]::WriteAllText($envPath, $updatedContent, (New-Object System.Text.UTF8Encoding $false))
  $currentUrl = $newUrl
} else {
  Write-Host ("Tunnel is already up at " + $currentUrl + " - leaving it alone.")
}

Write-Host "Restarting dev server..."

$devConn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($devConn) {
  $devConn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

if ($ClearCache) {
  Remove-Item -Recurse -Force (Join-Path $ProjectRoot ".next") -ErrorAction SilentlyContinue
}

$devLog = Join-Path $env:TEMP "sports-auction-dev.log"
$devErrLog = Join-Path $env:TEMP "sports-auction-dev-err.log"
Remove-Item $devLog -ErrorAction SilentlyContinue
Remove-Item $devErrLog -ErrorAction SilentlyContinue

Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $ProjectRoot `
  -RedirectStandardOutput $devLog -RedirectStandardError $devErrLog -WindowStyle Hidden

Write-Host "Waiting for dev server to become ready..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $log = ""
  if (Test-Path $devLog) { $log += (Get-Content $devLog -Raw) }
  if (Test-Path $devErrLog) { $log += (Get-Content $devErrLog -Raw) }
  if ($log -match "Ready on") {
    $ready = $true
    break
  }
}

if (-not $ready) {
  throw ("Dev server did not report ready in time. Check " + $devLog + " and " + $devErrLog)
}

Write-Host ""
Write-Host ("Local:  http://localhost:" + $Port)
Write-Host ("Tunnel: " + $currentUrl)
Write-Host ("Dev server log: " + $devLog)
