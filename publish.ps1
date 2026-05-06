param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommitMessageParts
)

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
        [string]$ErrorMessage
    )

    & $Action
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage $ErrorMessage $LASTEXITCODE
    }
}

function Get-GitPathList {
    param(
        [scriptblock]$Command,
        [string]$ErrorMessage
    )

    $output = & $Command
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage $ErrorMessage
    }

    return @($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-Text {
    param(
        [int[]]$CodePoints
    )

    return (-join ($CodePoints | ForEach-Object { [char]$_ }))
}

function Get-PublishableMarkdownPattern {
    return '^(src/content/blog|src/content/docs)/.+\.md$'
}

function Get-ChangedMarkdownFiles {
    $worktreeChanges = Get-GitPathList -Command { git diff --name-only --diff-filter=ACMR -- src/content/blog src/content/docs } -ErrorMessage 'Failed to inspect unstaged markdown changes.'
    $stagedChanges = Get-GitPathList -Command { git diff --cached --name-only --diff-filter=ACMR -- src/content/blog src/content/docs } -ErrorMessage 'Failed to inspect staged markdown changes.'
    $untrackedChanges = Get-GitPathList -Command { git ls-files --others --exclude-standard -- src/content/blog src/content/docs } -ErrorMessage 'Failed to inspect untracked markdown changes.'

    $markdownPattern = Get-PublishableMarkdownPattern

    return @($worktreeChanges + $stagedChanges + $untrackedChanges | Where-Object { $_ -match $markdownPattern } | Sort-Object -Unique)
}

function Get-DeletedMarkdownFiles {
    $deletedWorktree = Get-GitPathList -Command { git diff --name-only --diff-filter=D -- src/content/blog src/content/docs } -ErrorMessage 'Failed to inspect deleted unstaged markdown files.'
    $deletedStaged = Get-GitPathList -Command { git diff --cached --name-only --diff-filter=D -- src/content/blog src/content/docs } -ErrorMessage 'Failed to inspect deleted staged markdown files.'

    $markdownPattern = Get-PublishableMarkdownPattern

    return @($deletedWorktree + $deletedStaged | Where-Object { $_ -match $markdownPattern } | Sort-Object -Unique)
}

function Get-AllChangedFiles {
    $worktreeChanges = Get-GitPathList -Command { git diff --name-only --diff-filter=ACMRD } -ErrorMessage 'Failed to inspect unstaged repository changes.'
    $stagedChanges = Get-GitPathList -Command { git diff --cached --name-only --diff-filter=ACMRD } -ErrorMessage 'Failed to inspect staged repository changes.'
    $untrackedChanges = Get-GitPathList -Command { git ls-files --others --exclude-standard } -ErrorMessage 'Failed to inspect untracked repository changes.'

    return @($worktreeChanges + $stagedChanges + $untrackedChanges | Sort-Object -Unique)
}

function Get-ContentCommitPrefix {
    param(
        [string]$FilePath
    )

    if ($FilePath -match '^src/content/blog/.+\.md$') {
        return (Get-Text @(26032, 22686, 25991, 31456))
    }

    if ($FilePath -match '^src/content/docs/.+\.md$') {
        return (Get-Text @(26032, 22686, 25991, 26723))
    }

    Exit-WithMessage "Unsupported publishable file type: $FilePath"
}

function Get-FrontmatterTitle {
    param(
        [string]$FilePath
    )

    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    if (-not ($content.StartsWith("---`n") -or $content.StartsWith("---`r`n"))) {
        Exit-WithMessage "Missing frontmatter in file: $FilePath"
    }

    $lines = Get-Content -Path $FilePath -Encoding UTF8
    $frontmatterLines = New-Object System.Collections.Generic.List[string]
    $insideFrontmatter = $false
    $delimiterCount = 0

    foreach ($line in $lines) {
        if (-not $insideFrontmatter) {
            if ($line -eq '---') {
                $insideFrontmatter = $true
                $delimiterCount++
            }

            continue
        }

        if ($line -eq '---') {
            $delimiterCount++
            break
        }

        $frontmatterLines.Add($line)
    }

    if ($delimiterCount -lt 2) {
        Exit-WithMessage "Unable to parse frontmatter block: $FilePath"
    }

    foreach ($line in $frontmatterLines) {
        if ($line -match '^title:\s*"(.*)"\s*$') {
            return $matches[1].Trim()
        }

        if ($line -match '^title:\s*(.+?)\s*$') {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }

    Exit-WithMessage "Unable to read article title: $FilePath"
}

$customCommitMessage = ($CommitMessageParts -join ' ').Trim()
$noAutoPublishMessage = Get-Text @(27809, 26377, 21487, 33258, 21160, 21457, 24067, 30340, 20869, 23481, 65292, 35831, 25163, 21160, 25552, 20132, 12290)
$multipleMarkdownMessage = Get-Text @(26816, 27979, 21040, 22810, 20010, 32, 77, 97, 114, 107, 100, 111, 119, 110, 32, 25991, 20214, 21464, 21270, 65292, 35831, 36816, 34892, 65306, 110, 112, 109, 32, 114, 117, 110, 32, 112, 117, 98, 108, 105, 115, 104, 32, 45, 45, 32)
$multipleContentExample = Get-Text @(26356, 26032, 22810, 31687, 20869, 23481)
$fullWidthColon = [char]65306

Write-Host 'Running build...'
Invoke-Step { & npm.cmd run build } 'Build failed. Publish stopped.'

$changedMarkdownFiles = @(Get-ChangedMarkdownFiles)
$deletedMarkdownFiles = @(Get-DeletedMarkdownFiles)

if ($deletedMarkdownFiles.Count -gt 0) {
    Exit-WithMessage ('Detected deleted markdown files. Please handle deletions manually before publishing:' + [Environment]::NewLine + ($deletedMarkdownFiles -join [Environment]::NewLine))
}

if ($changedMarkdownFiles.Count -eq 0) {
    Exit-WithMessage $noAutoPublishMessage 0
}

if ($changedMarkdownFiles.Count -gt 1 -and [string]::IsNullOrWhiteSpace($customCommitMessage)) {
    Exit-WithMessage ($multipleMarkdownMessage + [char]34 + $multipleContentExample + [char]34)
}

$allChangedFiles = @(Get-AllChangedFiles)
$unexpectedChangedFiles = @($allChangedFiles | Where-Object { $_ -notin $changedMarkdownFiles -and $_ -notin $deletedMarkdownFiles })

if ($unexpectedChangedFiles.Count -gt 0) {
    Exit-WithMessage ('Detected non-content changes. Please commit manually instead:' + [Environment]::NewLine + ($unexpectedChangedFiles -join [Environment]::NewLine))
}

$commitMessage = $customCommitMessage

if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $targetFile = $changedMarkdownFiles[0]
    $title = Get-FrontmatterTitle -FilePath $targetFile
    if ([string]::IsNullOrWhiteSpace($title)) {
        Exit-WithMessage ('Content title is empty: ' + $targetFile)
    }

    $commitPrefix = Get-ContentCommitPrefix -FilePath $targetFile
    $commitMessage = $commitPrefix + $fullWidthColon + $title
}

Write-Host ('Commit message: ' + $commitMessage)

Invoke-Step { git add . } 'git add failed. Publish stopped.'
Invoke-Step { git commit -m $commitMessage } 'git commit failed. Publish stopped.'
Invoke-Step { git push origin master } 'git push failed. Publish stopped.'

Write-Host 'Publish finished.'
