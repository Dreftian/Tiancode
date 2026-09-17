# Tiancode CLI installer for Windows (PowerShell).
#   irm https://tiancode.vercel.app/install.ps1 | iex
# Downloads the prebuilt binary from GitHub Releases into %LOCALAPPDATA%\Programs\tiancode\bin and
# adds it to the user PATH. Set $env:TIANCODE_VERSION to pin a version.
$ErrorActionPreference = "Stop"

$repo = "Dreftian/Tiancode"
$version = $env:TIANCODE_VERSION
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { throw "Tiancode requires 64-bit Windows" }
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "arm64" }
$asset = "tiancode-windows-$arch.zip"
$url = if ($version) { "https://github.com/$repo/releases/download/v$($version.TrimStart('v'))/$asset" } else { "https://github.com/$repo/releases/latest/download/$asset" }

$installDir = if ($env:TIANCODE_INSTALL_DIR) { $env:TIANCODE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\tiancode\bin" }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("tiancode-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null
New-Item -ItemType Directory -Force $installDir | Out-Null

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile (Join-Path $tmp $asset) -UseBasicParsing
$extract = Join-Path $tmp "extract"
Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath $extract -Force
$bin = Get-ChildItem -Path $extract -Recurse -Filter "tiancode.exe" | Select-Object -First 1
if (-not $bin) { throw "The archive did not contain tiancode.exe" }
Copy-Item $bin.FullName (Join-Path $installDir "tiancode.exe") -Force
Get-ChildItem -Path $bin.DirectoryName -File | Where-Object { $_.Name -ne "tiancode.exe" } | ForEach-Object { Copy-Item $_.FullName (Join-Path $installDir $_.Name) -Force }
Remove-Item $tmp -Recurse -Force

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($userPath -split ";" | Where-Object { $_ -eq $installDir })) {
  [Environment]::SetEnvironmentVariable("Path", "$installDir;$userPath", "User")
  $env:Path = "$installDir;$env:Path"
  Write-Host "Added $installDir to the user PATH (open a new terminal)."
}

Write-Host "Tiancode CLI installed at $installDir\tiancode.exe" -ForegroundColor Green
Write-Host "Run: tiancode            # terminal UI in the current folder"
Write-Host "     tiancode web        # server + web interface"
Write-Host "     tiancode run `"...`"  # one-shot prompt"
