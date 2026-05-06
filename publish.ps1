param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommitMessageParts
)

$ErrorActionPreference = 'Stop'
$env:GIT_MASTER = '1'

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

function Get-ChangedBlogFiles {
    $worktreeChanges = Get-GitPathList -Command { git diff --name-only --diff-filter=ACMR -- src/content/blog } -ErrorMessage 'Failed to inspect unstaged blog changes.'
    $stagedChanges = Get-GitPathList -Command { git diff --cached --name-only --diff-filter=ACMR -- src/content/blog } -ErrorMessage 'Failed to inspect staged blog changes.'
    $untrackedChanges = Get-GitPathList -Command { git ls-files --others --exclude-standard -- src/content/blog } -ErrorMessage 'Failed to inspect untracked blog changes.'

    return @($worktreeChanges + $stagedChanges + $untrackedChanges | Where-Object { $_ -match '^src/content/blog/.+\.md$' } | Sort-Object -Unique)
}

function Get-DeletedBlogFiles {
    $deletedWorktree = Get-GitPathList -Command { git diff --name-only --diff-filter=D -- src/content/blog } -ErrorMessage 'Failed to inspect deleted unstaged blog files.'
    $deletedStaged = Get-GitPathList -Command { git diff --cached --name-only --diff-filter=D -- src/content/blog } -ErrorMessage 'Failed to inspect deleted staged blog files.'

    return @($deletedWorktree + $deletedStaged | Where-Object { $_ -match '^src/content/blog/.+\.md$' } | Sort-Object -Unique)
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

function Get-StagedFiles {
    $stagedOutput = git diff --cached --name-only --diff-filter=ACMRD
    if ($LASTEXITCODE -ne 0) {
        Exit-WithMessage 'Failed to inspect staged files.'
    }

    return @($stagedOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

$customCommitMessage = ($CommitMessageParts -join ' ').Trim()

Write-Host 'Running build...'
Invoke-Step { & npm.cmd run build } 'Build failed. Publish stopped.'

$changedBlogFiles = @(Get-ChangedBlogFiles)
$deletedBlogFiles = @(Get-DeletedBlogFiles)

if ($deletedBlogFiles.Count -gt 0) {
    Exit-WithMessage "Detected deleted blog markdown files. Please handle deletions manually before publishing:`n$($deletedBlogFiles -join "`n")"
}

if ($changedBlogFiles.Count -eq 0) {
    Exit-WithMessage 'No publishable blog article changes found.' 0
}

if ($changedBlogFiles.Count -gt 1 -and [string]::IsNullOrWhiteSpace($customCommitMessage)) {
    Exit-WithMessage 'Multiple blog article changes detected. Please run: npm run publish -- "commit message"'
}

$commitMessage = if ($changedBlogFiles.Count -eq 1) { '' } else { $customCommitMessage }

if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $title = Get-FrontmatterTitle -FilePath $changedBlogFiles[0]
    if ([string]::IsNullOrWhiteSpace($title)) {
        Exit-WithMessage "Article title is empty: $($changedBlogFiles[0])"
    }

    $commitMessage = "新增文章：$title"
}

Write-Host "Commit message: $commitMessage"

$stagedFiles = @(Get-StagedFiles)
$unexpectedStagedFiles = @($stagedFiles | Where-Object { $_ -notin $changedBlogFiles })

if ($unexpectedStagedFiles.Count -gt 0) {
    Exit-WithMessage "Unexpected staged files detected. Please clean the index first:`n$($unexpectedStagedFiles -join "`n")"
}

foreach ($file in $changedBlogFiles) {
    Invoke-Step { git add -- $file } "git add failed for file: $file"
}
Invoke-Step { git commit -m $commitMessage } 'git commit failed. Publish stopped.'
Invoke-Step { git push origin master } 'git push failed. Publish stopped.'

Write-Host 'Publish finished.'
