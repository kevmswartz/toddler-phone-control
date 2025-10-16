<#
    Friendly PowerShell helper for maintaining toddler-content.json.

    Examples:
        ./scripts/manage-toddler-content.ps1 -Action list
        ./scripts/manage-toddler-content.ps1 -Action add-special
        ./scripts/manage-toddler-content.ps1 -Action menu

    All commands operate on toddler-content.json in the repo root by default.
    Use -File to target a different JSON file (for example a branch working copy).
#>

param(
    [ValidateSet('menu', 'list', 'add-special', 'add-quick', 'add-quick-app', 'add-tts', 'add-timer', 'remove', 'init')]
    [string] $Action = 'menu',

    [string] $File
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not (Test-Path $ProjectRoot)) {
    throw "Project root not found at $ProjectRoot. Run this script from inside the repo."
}

$DefaultContentFile = Join-Path $ProjectRoot "toddler-content.json"

if ($File) {
    if ([System.IO.Path]::IsPathRooted($File)) {
        $TargetContentFile = $File
    } else {
        $TargetContentFile = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $File))
    }
    $UseCustomFile = $true
} else {
    $TargetContentFile = $DefaultContentFile
    $UseCustomFile = $false
}

function Invoke-ContentCli {
    param (
        [string[]] $Arguments
    )

    Push-Location $ProjectRoot
    try {
        $cli = Join-Path $ProjectRoot "scripts/toddler-content-cli.js"
        if (-not (Test-Path $cli)) {
            throw "Could not find $cli. Make sure you run the script from the repo."
        }

        $nodeArgs = @($cli) + $Arguments
        & node @nodeArgs
        if ($LASTEXITCODE -ne 0) {
            throw "toddler-content CLI exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Prompt-Required {
    param (
        [string] $Message,
        [string] $Default
    )

    while ($true) {
        $input = Read-Host -Prompt $Message
        if ([string]::IsNullOrWhiteSpace($input)) {
            if ($Default) {
                return $Default
            }
            Write-Host "Please enter a value." -ForegroundColor Yellow
        } else {
            return $input.Trim()
        }
    }
}

function Prompt-Optional {
    param (
        [string] $Message
    )
    $input = Read-Host -Prompt $Message
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $null
    }
    return $input.Trim()
}

function Ensure-FileArgument {
    if ($UseCustomFile) {
        return @('--file', $TargetContentFile)
    }
    return @()
}

function Get-ContentData {
    if (-not (Test-Path $TargetContentFile -PathType Leaf)) {
        return [pscustomobject]@{ specialButtons = @(); quickLaunch = @() }
    }

    $raw = Get-Content -Path $TargetContentFile -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return [pscustomobject]@{ specialButtons = @(); quickLaunch = @() }
    }

    try {
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "Failed to parse JSON in ${TargetContentFile}: $_"
    }

    $special = @()
    $quick = @()
    if ($parsed.specialButtons) { $special = @($parsed.specialButtons) }
    if ($parsed.quickLaunch) { $quick = @($parsed.quickLaunch) }
    return [pscustomobject]@{ specialButtons = $special; quickLaunch = $quick }
}

function Get-ExistingIds {
    $data = Get-ContentData
    $ids = @()
    if ($data.specialButtons) { $ids += $data.specialButtons | ForEach-Object { $_.id } }
    if ($data.quickLaunch) { $ids += $data.quickLaunch | ForEach-Object { $_.id } }
    return $ids | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Generate-UniqueId($baseId) {
    if ([string]::IsNullOrWhiteSpace($baseId)) {
        $baseId = 'button'
    }
    $existing = Get-ExistingIds
    $candidate = $baseId
    $suffix = 2
    while ($existing -contains $candidate) {
        $candidate = "$baseId-$suffix"
        $suffix++
    }
    return $candidate
}

function Prompt-UniqueId {
    param (
        [string] $PromptMessage,
        [string] $DefaultId
    )

    while ($true) {
        $input = Read-Host -Prompt $PromptMessage
        $candidate = if ([string]::IsNullOrWhiteSpace($input)) { $DefaultId } else { $input.Trim() }

        if ([string]::IsNullOrWhiteSpace($candidate)) {
            Write-Host "ID cannot be blank." -ForegroundColor Yellow
            continue
        }

        $existing = Get-ExistingIds
        if ($existing -contains $candidate) {
            Write-Host "ID '$candidate' already exists. Choose another." -ForegroundColor Yellow
            continue
        }

        return $candidate
    }
}

function Show-TargetHint {
    Write-Host "Target file: $TargetContentFile" -ForegroundColor DarkGray
}

function Run-List {
    Write-Host "Listing toddler content..." -ForegroundColor Cyan
    Show-TargetHint
    Invoke-ContentCli -Arguments @('list') + (Ensure-FileArgument)
}

function Run-AddSpecial {
    Write-Host "Add a new special button" -ForegroundColor Cyan
    Show-TargetHint
    $id = Prompt-Required -Message "ID (unique key, e.g. bedtimeStory)"
    $label = Prompt-Required -Message "Label (shown on button, e.g. Bedtime Story)"
    $emoji = Prompt-Required -Message "Emoji (e.g. 🌙)"
    $handler = Prompt-Required -Message "Handler (e.g. runFavoriteMacro)"

    $zone = Prompt-Optional -Message "Zone [quick/remote] (default quick)"
    if ([string]::IsNullOrWhiteSpace($zone)) { $zone = 'quick' }

    $category = Prompt-Optional -Message "Category (default kidMode-remote)"
    if ([string]::IsNullOrWhiteSpace($category)) { $category = 'kidMode-remote' }

    $favoriteLabelId = Prompt-Optional -Message "Favorite label element ID (optional)"
    $thumbnail = Prompt-Optional -Message "Thumbnail URL (optional)"
    $appId = Prompt-Optional -Message "App ID (optional, for Roku launch buttons)"
    $appName = Prompt-Optional -Message "App name (optional)"
    $argsRaw = Prompt-Optional -Message "Args (comma separated, optional)"

    $arguments = @('add-special', '--id', $id, '--label', $label, '--emoji', $emoji, '--handler', $handler, '--zone', $zone, '--category', $category)
    if ($favoriteLabelId) { $arguments += @('--favoriteLabelId', $favoriteLabelId) }
    if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    if ($appId) { $arguments += @('--appId', $appId) }
    if ($appName) { $arguments += @('--appName', $appName) }
    if ($argsRaw) { $arguments += @('--args', $argsRaw) }

    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-AddQuick {
    Write-Host "Add a new quick launch item" -ForegroundColor Cyan
    Show-TargetHint

    $advanced = Prompt-Optional -Message "Advanced mode? (y for Roku/custom, Enter for YouTube)"
    if ($advanced -and $advanced.ToLowerInvariant().StartsWith('y')) {
        Run-AddQuickAdvanced
        return
    }

    $label = Prompt-Required -Message "Label (e.g. Baby Shark)"
    $videoId = Prompt-Required -Message "YouTube video ID (watch?v=...)"

    $slugBase = ($label.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($slugBase)) {
        $slugBase = "yt"
    }
    $defaultId = Generate-UniqueId $slugBase
    $idPrompt = "Button ID [$defaultId]"
    $id = Prompt-UniqueId -PromptMessage $idPrompt -DefaultId $defaultId

    $defaultThumbnail = "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
    $thumbPrompt = "Thumbnail URL [$defaultThumbnail]"
    $thumbInput = Read-Host -Prompt $thumbPrompt
    $thumbnail = if ([string]::IsNullOrWhiteSpace($thumbInput)) { $defaultThumbnail } else { $thumbInput.Trim() }

    $arguments = @('add-quick', '--id', $id, '--label', $label, '--type', 'youtube', '--videoId', $videoId, '--thumbnail', $thumbnail)
    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-AddQuickAdvanced {
    Write-Host "Advanced quick-launch creator" -ForegroundColor Cyan
    Show-TargetHint
    Write-Host "Choose output type:" -ForegroundColor DarkGray
    Write-Host " 1) YouTube video" -ForegroundColor DarkGray
    Write-Host " 2) Roku app launch" -ForegroundColor DarkGray
    Write-Host " 3) Custom payload" -ForegroundColor DarkGray

    $typeChoice = Prompt-Required -Message "Type [1-3]" -Default '1'

    switch ($typeChoice) {
        '1' { $type = 'youtube' }
        '2' { $type = 'rokuApp' }
        '3' { $type = 'custom' }
        default {
            Write-Host "Unknown choice. Defaulting to YouTube." -ForegroundColor Yellow
            $type = 'youtube'
        }
    }

    $label = Prompt-Required -Message "Label (e.g. Netflix Kids)"

    $slugBase = ($label.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($slugBase)) {
        $slugBase = $type
    }
    $defaultId = Generate-UniqueId $slugBase
    $idPrompt = "ID [$defaultId]"
    $id = Prompt-UniqueId -PromptMessage $idPrompt -DefaultId $defaultId

    $thumbnail = $null

    if ($type -eq 'youtube') {
        $videoId = Prompt-Required -Message "YouTube video ID"
        $thumbnailDefault = "https://img.youtube.com/vi/$videoId/maxresdefault.jpg"
        $thumbPrompt = "Thumbnail URL [$thumbnailDefault]"
        $thumbInput = Read-Host -Prompt $thumbPrompt
        $thumbnail = if ([string]::IsNullOrWhiteSpace($thumbInput)) { $thumbnailDefault } else { $thumbInput.Trim() }

        $arguments = @('add-quick', '--id', $id, '--label', $label, '--type', 'youtube', '--videoId', $videoId, '--thumbnail', $thumbnail)
    } elseif ($type -eq 'rokuApp') {
        $appId = Prompt-Required -Message "Roku app ID"
        $contentId = Prompt-Optional -Message "Content ID (optional)"
        $thumbInput = Prompt-Optional -Message "Thumbnail relative to /public (optional)"
        if ($thumbInput) {
            if ($thumbInput.StartsWith('/')) {
                $thumbnail = $thumbInput
            } elseif ($thumbInput.StartsWith('http', [System.StringComparison]::OrdinalIgnoreCase)) {
                $thumbnail = $thumbInput
            } else {
                $thumbnail = "/public/$thumbInput"
            }
        }

        $arguments = @('add-quick', '--id', $id, '--label', $label, '--type', 'rokuApp', '--appId', $appId)
        if ($contentId) { $arguments += @('--contentId', $contentId) }
        if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    } else {
        $payload = Prompt-Optional -Message "Custom payload (optional)"
        $thumbnail = Prompt-Optional -Message "Thumbnail URL (optional)"
        $arguments = @('add-quick', '--id', $id, '--label', $label, '--type', 'custom')
        if ($payload) { $arguments += @('--payload', $payload) }
        if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    }

    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-AddQuickApp {
    Write-Host "Add a Roku app launcher" -ForegroundColor Cyan
    Show-TargetHint

    $label = Prompt-Required -Message "Label (e.g. Netflix Kids)"
    $appId = Prompt-Required -Message "Roku app ID (e.g. 12)"
    $contentId = Prompt-Optional -Message "Content ID (optional)"

    $slugBase = ($label.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($slugBase)) {
        $slugBase = "roku"
    }
    $defaultId = Generate-UniqueId $slugBase
    $idPrompt = "Button ID [$defaultId]"
    $id = Prompt-UniqueId -PromptMessage $idPrompt -DefaultId $defaultId

    $thumbInput = Prompt-Optional -Message "Thumbnail relative to /public (optional, e.g. disney.webp)"
    $thumbnail = $null
    if ($thumbInput) {
        if ($thumbInput.StartsWith('/')) {
            $thumbnail = $thumbInput
        } elseif ($thumbInput.StartsWith('http', [System.StringComparison]::OrdinalIgnoreCase)) {
            $thumbnail = $thumbInput
        } else {
            $thumbnail = "/public/$thumbInput"
        }
    }

    $arguments = @('add-quick', '--id', $id, '--label', $label, '--type', 'rokuApp', '--appId', $appId)
    if ($contentId) { $arguments += @('--contentId', $contentId) }
    if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-AddTts {
    Write-Host "Add a speak-TTS button" -ForegroundColor Cyan
    Show-TargetHint

    $label = Prompt-Required -Message "Label (e.g. Krave Time)"
    $utterance = Prompt-Required -Message "Phrase to speak"

    $emojiDefault = '🗣️'
    $emojiInput = Prompt-Optional -Message "Emoji [$emojiDefault]"
    $emoji = if ([string]::IsNullOrWhiteSpace($emojiInput)) { $emojiDefault } else { $emojiInput }

    $slugBase = ($label.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($slugBase)) {
        $slugBase = 'tts'
    }
    $defaultId = Generate-UniqueId $slugBase
    $idPrompt = "Button ID [$defaultId]"
    $id = Prompt-UniqueId -PromptMessage $idPrompt -DefaultId $defaultId

    $thumbInput = Prompt-Optional -Message "Thumbnail relative to /public (optional)"
    $thumbnail = $null
    if ($thumbInput) {
        if ($thumbInput.StartsWith('/')) {
            $thumbnail = $thumbInput
        } elseif ($thumbInput.StartsWith('http', [System.StringComparison]::OrdinalIgnoreCase)) {
            $thumbnail = $thumbInput
        } else {
            $thumbnail = "/public/$thumbInput"
        }
    }

    $arguments = @('add-special', '--id', $id, '--label', $label, '--emoji', $emoji, '--handler', 'speakTts', '--zone', 'quick', '--category', 'kidMode-tts', '--args', $utterance)
    if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-AddTimer {
    Write-Host "Add a countdown timer button" -ForegroundColor Cyan
    Show-TargetHint

    $label = Prompt-Required -Message "Label (e.g. Brush Teeth Timer)"
    $durationPrompt = Prompt-Required -Message "Duration in minutes (e.g. 5)"
    try {
        $durationMinutes = [double]::Parse($durationPrompt)
    } catch {
        throw "Please enter a numeric duration."
    }
    if ($durationMinutes -le 0) {
        throw "Duration must be greater than zero."
    }
    $durationSeconds = [int][Math]::Round($durationMinutes * 60)

    $emojiDefault = '⏳'
    $emojiInput = Prompt-Optional -Message "Emoji [$emojiDefault]"
    $emoji = if ([string]::IsNullOrWhiteSpace($emojiInput)) { $emojiDefault } else { $emojiInput }

    $slugBase = ($label.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($slugBase)) {
        $slugBase = 'timer'
    }
    $defaultId = Generate-UniqueId $slugBase
    $idPrompt = "Button ID [$defaultId]"
    $id = Prompt-UniqueId -PromptMessage $idPrompt -DefaultId $defaultId

    $thumbInput = Prompt-Optional -Message "Thumbnail relative to /public (optional)"
    $thumbnail = $null
    if ($thumbInput) {
        if ($thumbInput.StartsWith('/')) {
            $thumbnail = $thumbInput
        } elseif ($thumbInput.StartsWith('http', [System.StringComparison]::OrdinalIgnoreCase)) {
            $thumbnail = $thumbInput
        } else {
            $thumbnail = "/public/$thumbInput"
        }
    }

    $arguments = @('add-special', '--id', $id, '--label', $label, '--emoji', $emoji, '--handler', 'startToddlerTimer', '--zone', 'quick', '--category', 'kidMode-timer', '--args', $durationSeconds.ToString(), $label)
    if ($thumbnail) { $arguments += @('--thumbnail', $thumbnail) }
    $arguments += (Ensure-FileArgument)
    Invoke-ContentCli -Arguments $arguments
}

function Run-Remove {
    Write-Host "Remove an entry" -ForegroundColor Cyan
    Show-TargetHint
    $id = Prompt-Required -Message "ID to remove"
    Invoke-ContentCli -Arguments @('remove', '--id', $id) + (Ensure-FileArgument)
}

function Run-Init {
    Write-Host "Create a fresh toddler-content.json" -ForegroundColor Cyan
    Show-TargetHint
    $forceAnswer = Prompt-Required -Message "File will be overwritten if it exists. Continue? [y/N]" -Default 'N'
    if ($forceAnswer -notin @('y', 'Y')) {
        Write-Host "Cancelled."
        return
    }
    Invoke-ContentCli -Arguments @('init', '--force') + (Ensure-FileArgument)
}

function Show-Menu {
    while ($true) {
        Write-Host ""
        Write-Host "Toddler Content Manager" -ForegroundColor Cyan
        Write-Host " 1) Add Roku app launcher"
        Write-Host " 2) Add YouTube quick launch"
        Write-Host " 3) Add TTS speak button"
        Write-Host " 4) Add countdown timer"
        Write-Host " 5) Exit"
        $choice = Read-Host -Prompt "Choose an option"

        switch ($choice) {
            '1' { Run-AddQuickApp }
            '2' { Run-AddQuick }
            '3' { Run-AddTts }
            '4' { Run-AddTimer }
            '5' { return }
            default { Write-Host "Unknown choice. Try again." -ForegroundColor Yellow }
        }
    }
}

try {
    switch ($Action) {
        'menu' { Show-Menu }
        'list' { Run-List }
        'add-special' { Run-AddSpecial }
        'add-quick' { Run-AddQuick }
        'add-quick-app' { Run-AddQuickApp }
        'add-tts' { Run-AddTts }
        'add-timer' { Run-AddTimer }
        'remove' { Run-Remove }
        'init' { Run-Init }
        default { throw "Unhandled action '$Action'." }
    }
}
catch {
    Write-Error $_
    exit 1
}
