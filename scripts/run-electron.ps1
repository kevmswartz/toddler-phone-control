<#
    Builds the web assets, syncs Capacitor platforms, and launches the Electron shell.
    Run this from any PowerShell prompt:
        ./scripts/run-electron.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Step {
    param (
        [string] $Name,
        [string] $WorkingDirectory,
        [string[]] $Arguments
    )

    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        & npm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

try {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $projectRoot = Resolve-Path (Join-Path $scriptRoot "..")
    $electronDir = Join-Path $projectRoot "electron"
    $electronAppDir = Join-Path $electronDir "app"
    $distDir = Join-Path $projectRoot "dist"

    Invoke-Step -Name "Build web assets" -WorkingDirectory $projectRoot -Arguments @('run', 'build')
    Invoke-Step -Name "Sync Capacitor platforms" -WorkingDirectory $projectRoot -Arguments @('run', 'sync')

    Write-Host ""
    Write-Host "=== Update Electron bundled assets ===" -ForegroundColor Cyan
    if (-not (Test-Path $distDir)) {
        throw "Build output folder not found: $distDir"
    }
    if (-not (Test-Path $electronAppDir)) {
        throw "Electron app folder not found: $electronAppDir"
    }

    $filesToCopy = @('index.html', 'app.js', 'button-types.json', 'toddler-content.json', 'tailwind.css')
    foreach ($file in $filesToCopy) {
        $source = Join-Path $distDir $file
        if (Test-Path $source) {
            Copy-Item -Path $source -Destination (Join-Path $electronAppDir $file) -Force
        } else {
            Write-Warning "Skipped missing asset: $source"
        }
    }

    $publicSrc = Join-Path $distDir "public"
    if (Test-Path $publicSrc) {
        $publicDest = Join-Path $electronAppDir "public"
        Remove-Item $publicDest -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -Path $publicSrc -Destination $publicDest -Recurse -Force
    }

    $vendorSrc = Join-Path $distDir "vendor"
    if (Test-Path $vendorSrc) {
        $vendorDest = Join-Path $electronAppDir "vendor"
        Remove-Item $vendorDest -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -Path $vendorSrc -Destination $vendorDest -Recurse -Force
    }

    Invoke-Step -Name "Start Electron shell" -WorkingDirectory $electronDir -Arguments @('run', 'electron:start')
}
catch {
    Write-Error $_
    exit 1
}
