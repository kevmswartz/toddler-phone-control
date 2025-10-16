<#
    Downloads toddler button content JSON from a remote URL (for example a GitHub raw file)
    and replaces the local toddler-content.json copy in the project root.

    Usage:
        ./scripts/update-toddler-content.ps1 -Url "https://raw.githubusercontent.com/org/repo/branch/toddler-content.json"

    Optional parameters:
        -OutputPath   Override the target file (defaults to toddler-content.json in the repo root).
        -SkipBackup   Do not create a timestamped backup before overwriting.
#>

param(
    [Parameter(Mandatory = $true)]
    [string] $Url,

    [string] $OutputPath,

    [switch] $SkipBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $projectRoot = Resolve-Path (Join-Path $scriptRoot "..")
    if (-not $OutputPath) {
        $OutputPath = Join-Path $projectRoot "toddler-content.json"
    } else {
        try {
            $OutputPath = (Resolve-Path -Path $OutputPath -ErrorAction Stop).Path
        } catch {
            $OutputPath = $OutputPath
        }
    }

    Write-Host "Fetching toddler content from $Url..." -ForegroundColor Cyan
    $rawResponse = Invoke-WebRequest -Uri $Url -UseBasicParsing

    if ($null -eq $rawResponse.Content -or $rawResponse.Content.Trim().Length -eq 0) {
        throw "Downloaded content is empty."
    }

    try {
        $parsed = $rawResponse.Content | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "The downloaded file is not valid JSON: $_"
    }

    $formattedJson = $parsed | ConvertTo-Json -Depth 10

    if (Test-Path $OutputPath -PathType Leaf -and -not $SkipBackup) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupPath = "{0}.{1}.bak" -f $OutputPath, $timestamp
        Copy-Item -Path $OutputPath -Destination $backupPath
        Write-Host "Backup created: $backupPath" -ForegroundColor DarkGray
    }

    $parentDir = Split-Path -Parent $OutputPath
    if (-not (Test-Path $parentDir)) {
        New-Item -Path $parentDir -ItemType Directory | Out-Null
    }

    Set-Content -Path $OutputPath -Value $formattedJson -Encoding UTF8
    Write-Host "toddler-content.json updated at $OutputPath" -ForegroundColor Green
}
catch {
    Write-Error $_
    exit 1
}
