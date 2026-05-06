$ErrorActionPreference = 'Stop'
$env:GIT_MASTER = '1'
$utf8Encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8Encoding
$OutputEncoding = $utf8Encoding

function Exit-WithMessage {
    param(
        [string]$Message,
        [int]$Code = 1
    )

    Write-Host $Message
    exit $Code
}

function Invoke-Step {
    param(
        [scriptblock]$Action,
        [object[]]$ArgumentList = @(),
        [string]$ErrorMessage
    )

    & $Action @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage $ErrorMessage $LASTEXITCODE
    }
}

function Get-Text {
    param(
        [int[]]$CodePoints
    )

    return (-join ($CodePoints | ForEach-Object { [char]$_ }))
}

function Get-GitStatusEntries {
    $statusOutput = & git -c core.quotepath=false status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage 'Failed to inspect repository changes via git status --porcelain.'
    }

    $entries = foreach ($line in @($statusOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        if ($line.Length -lt 4) {
            continue
        }

        $status = $line.Substring(0, 2)
        $path = $line.Substring(3)

        if ($path.Contains(' -> ')) {
            $path = ($path -split ' -> ', 2)[1]
        }

        [pscustomobject]@{
            Status = $status
            Path = $path
        }
    }

    return @($entries)
}

function Get-AllChangedFiles {
    param(
        [object[]]$StatusEntries
    )

    return @($StatusEntries | ForEach-Object { $_.Path } | Sort-Object -Unique)
}

function Read-CommitMessage {
    Write-Host (Get-Text @(35831, 36755, 20837, 25552, 20132, 20449, 24687, 65306))

    $commitMessage = & cmd.exe /q /v:on /c "set /p DSI_COMMIT_MESSAGE= < CON & echo(!DSI_COMMIT_MESSAGE!"
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage (Get-Text @(24403, 21069, 32456, 31471, 19981, 21487, 20132, 20114, 65292, 26080, 27861, 35835, 21462, 25552, 20132, 20449, 24687, 12290))
    }

    if ($null -eq $commitMessage) {
        return ''
    }

    return ([string](@($commitMessage)[-1])).Trim()
}

Write-Host 'Running build...'
Invoke-Step { & npm.cmd run build } 'Build failed. Publish stopped.'

$statusEntries = @(Get-GitStatusEntries)
$allChangedFiles = @(Get-AllChangedFiles -StatusEntries $statusEntries)

if ($allChangedFiles.Count -eq 0) {
    Exit-WithMessage (Get-Text @(27809, 26377, 25991, 20214, 21464, 21270, 65292, 20572, 27490, 21457, 24067, 12290)) 0
}

$commitMessage = Read-CommitMessage
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    Exit-WithMessage (Get-Text @(25552, 20132, 20449, 24687, 19981, 33021, 20026, 31354, 12290))
}

Invoke-Step { git add . } 'git add failed. Publish stopped.'
$gitCommitArgs = @('commit', "--message=$commitMessage")
& git @gitCommitArgs
if ($LASTEXITCODE -ne 0) {
    Exit-WithMessage 'git commit failed. Publish stopped.' $LASTEXITCODE
}
Invoke-Step { git push origin master } 'git push failed. Publish stopped.'

Write-Host 'Publish finished.'
