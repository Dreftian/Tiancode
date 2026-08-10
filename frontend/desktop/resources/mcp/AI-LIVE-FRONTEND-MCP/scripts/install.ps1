# AI LIVE FRONTEND MCP - Windows installer
# Validates the package, creates config.json from the example if missing,
# and prints the OpenCode-style config block for your MCP client.

$ErrorActionPreference = "Stop"

$PackageDir = Split-Path -Parent $PSScriptRoot
Set-Location $PackageDir

$Py = "python"
if ($env:PYTHON) { $Py = $env:PYTHON }

Write-Host ""
Write-Host "==> Validating AI LIVE FRONTEND MCP (tools, handshake, dashboard)..."
& $Py validate.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Validation FAILED - fix the errors above before registering the server." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "config.json")) {
    Copy-Item "config.example.json" "config.json"
    Write-Host "==> Created config.json from config.example.json (edit it to change ports/limits)."
} else {
    Write-Host "==> config.json already exists, leaving it untouched."
}

Write-Host "==> OpenCode-style config block:"
& $Py make_opencode_config.py

Write-Host ""
Write-Host "==> Done. Add the block above to your MCP client (see INSTALLATION.md)."
Write-Host "    Dashboard URL: http://127.0.0.1:8790/  (configurable in config.json)"
