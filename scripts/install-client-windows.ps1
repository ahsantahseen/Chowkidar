$ErrorActionPreference = "Stop"

$repo = "ahsantahseen/Chowkidar"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"

$release = Invoke-RestMethod -Uri $apiUrl
$asset = $release.assets | Where-Object { $_.name -match "Chowkidar" -and $_.name -match "\.exe$" } | Select-Object -First 1

if (-not $asset) {
  $asset = $release.assets | Where-Object { $_.name -match "\.exe$" } | Select-Object -First 1
}

if (-not $asset) {
  Write-Error "No Windows .exe asset found in latest release."
  exit 1
}

$out = Join-Path $env:TEMP "Chowkidar-Setup.exe"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out
Start-Process -FilePath $out
