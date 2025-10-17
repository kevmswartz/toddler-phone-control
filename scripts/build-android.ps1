<#
    Builds the web assets, syncs Capacitor, and creates an Android APK.
    Run this from any PowerShell prompt:
        ./scripts/build-android.ps1

    Options:
        -Release    Build a release APK (default is debug)
        -Install    Install the APK to a connected device after building
#>

param(
    [switch]$Release,
    [switch]$Install
)

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

function Invoke-Gradle {
    param (
        [string] $Name,
        [string] $WorkingDirectory,
        [string] $Task
    )

    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        if ($IsWindows -or $env:OS -match "Windows") {
            & .\gradlew.bat $Task
        } else {
            & ./gradlew $Task
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Gradle $Task failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

try {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $projectRoot = Resolve-Path (Join-Path $scriptRoot "..")
    $androidDir = Join-Path $projectRoot "android"

    # Check if JAVA_HOME is set
    if (-not $env:JAVA_HOME) {
        Write-Host ""
        Write-Host "ERROR: JAVA_HOME is not set!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please run the setup script first:" -ForegroundColor Yellow
        Write-Host "  ./scripts/setup-java.ps1" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    # Verify Java is accessible
    $javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
    if (-not (Test-Path $javaExe)) {
        Write-Host ""
        Write-Host "ERROR: Java not found at JAVA_HOME location!" -ForegroundColor Red
        Write-Host "JAVA_HOME is set to: $env:JAVA_HOME" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Please run the setup script to reconfigure:" -ForegroundColor Yellow
        Write-Host "  ./scripts/setup-java.ps1" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    Write-Host "Using Java from: $env:JAVA_HOME" -ForegroundColor Gray

    # Build and sync
    Invoke-Step -Name "Build web assets" -WorkingDirectory $projectRoot -Arguments @('run', 'build')
    Invoke-Step -Name "Sync Capacitor to Android" -WorkingDirectory $projectRoot -Arguments @('run', 'sync')

    # Build APK
    $buildType = if ($Release) { "Release" } else { "Debug" }
    $gradleTask = if ($Release) { "assembleRelease" } else { "assembleDebug" }

    Invoke-Gradle -Name "Build Android $buildType APK" -WorkingDirectory $androidDir -Task $gradleTask

    # Find the APK
    $buildVariant = if ($Release) { "release" } else { "debug" }
    $apkPath = Join-Path $androidDir "app\build\outputs\apk\$buildVariant\app-$buildVariant.apk"

    if (Test-Path $apkPath) {
        Write-Host ""
        Write-Host "=== Build Complete ===" -ForegroundColor Green
        Write-Host "APK location: $apkPath" -ForegroundColor Yellow

        # Get APK size
        $apkSize = (Get-Item $apkPath).Length / 1MB
        Write-Host "APK size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Yellow

        # Install if requested
        if ($Install) {
            Write-Host ""
            Write-Host "=== Installing APK to device ===" -ForegroundColor Cyan

            Push-Location $androidDir
            try {
                if ($IsWindows -or $env:OS -match "Windows") {
                    & .\gradlew.bat "install$buildType"
                } else {
                    & ./gradlew "install$buildType"
                }

                if ($LASTEXITCODE -eq 0) {
                    Write-Host "APK installed successfully!" -ForegroundColor Green
                } else {
                    Write-Warning "Failed to install APK. Make sure a device is connected and USB debugging is enabled."
                }
            }
            finally {
                Pop-Location
            }
        } else {
            Write-Host ""
            Write-Host "To install the APK, either:" -ForegroundColor Cyan
            Write-Host "  1. Transfer $apkPath to your Android device and open it" -ForegroundColor White
            Write-Host "  2. Run: ./scripts/build-android.ps1 -Install" -ForegroundColor White
            Write-Host "  3. Run: cd android && ./gradlew install$buildType" -ForegroundColor White
        }
    } else {
        throw "APK not found at expected location: $apkPath"
    }
}
catch {
    Write-Error $_
    exit 1
}
