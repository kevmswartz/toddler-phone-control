$ErrorActionPreference = 'Stop'

$DistDir = Join-Path $PWD "dist"
$AndroidAssetsDir = Join-Path $PWD "src-tauri\gen\android\app\src\main\assets"

if (-not (Test-Path $DistDir)) {
    throw "dist folder not found at $DistDir. Run 'npm run build' first."
}

if (-not (Test-Path $AndroidAssetsDir)) {
    New-Item -ItemType Directory -Path $AndroidAssetsDir -Force | Out-Null
    Write-Host "Created Android assets directory: $AndroidAssetsDir" -ForegroundColor Cyan
}

Write-Host "Copying dist files to Android assets..." -ForegroundColor Cyan

# Copy all dist files to Android assets
Get-ChildItem -Path $DistDir -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($DistDir.Length + 1)
    $destPath = Join-Path $AndroidAssetsDir $relativePath

    if ($_.PSIsContainer) {
        if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
        }
    } else {
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $destPath -Force
        Write-Host "  Copied: $relativePath" -ForegroundColor Gray
    }
}

Write-Host "✅ All dist files copied to Android assets" -ForegroundColor Green
