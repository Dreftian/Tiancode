# Install AI-MCP-SUITE: copies the suite to $HOME\.mcp-servers\AI-MCP-SUITE,
# validates it, and generates an OpenCode config file.
$ErrorActionPreference = "Stop"

$SuiteRoot = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $HOME ".mcp-servers\AI-MCP-SUITE"

$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $Python) {
    Write-Error "Python 3.10+ is required but 'python' was not found on PATH."
    exit 1
}
$Version = & $Python -c "import sys; print('%d.%d' % sys.version_info[:2])"
if ([version]$Version -lt [version]"3.10") {
    Write-Error "Python 3.10+ is required (found $Version)."
    exit 1
}

Write-Host "Installing AI-MCP-SUITE to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $SuiteRoot "*") $InstallDir

& $Python (Join-Path $InstallDir "scripts\validate_package.py")
if ($LASTEXITCODE -ne 0) {
    Write-Error "Validation failed."
    exit 1
}

& $Python (Join-Path $InstallDir "scripts\make_opencode_config.py") --python $Python

Write-Host ""
Write-Host "Installed. Launch any server with its MCP_CONFIG environment set, e.g.:"
Write-Host '  $env:MCP_CONFIG = (Get-Content -Raw "<install>\Photoshop\config.json")'
Write-Host '  python "<install>\Photoshop\server.py"'
