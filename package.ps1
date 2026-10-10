$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)

function New-TaskArchive {
    param([string]$Name, [System.IO.FileInfo[]]$Files, [string]$Base)
    $taskDestination = [System.IO.Path]::GetFullPath((Join-Path $taskRoot $Name))
    $taskStaging = $taskDestination + '.building'
    if (-not $taskDestination.StartsWith($taskRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Archive destination is outside the project'
    }
    if ([System.IO.File]::Exists($taskStaging)) { [System.IO.File]::Delete($taskStaging) }
    $taskZip = [System.IO.Compression.ZipFile]::Open($taskStaging, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskFile in $Files | Sort-Object FullName) {
            if (-not $taskFile.FullName.StartsWith($Base + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive input is outside its base directory' }
            $taskEntry = $taskFile.FullName.Substring($Base.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskFile.FullName, $taskEntry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $taskZip.Dispose() }
    $taskCheck = [System.IO.Compression.ZipFile]::OpenRead($taskStaging)
    try {
        if ($taskCheck.Entries.Count -ne $Files.Count) { throw 'Archive file count is incorrect' }
        foreach ($taskEntry in $taskCheck.Entries) {
            $taskInput = $taskEntry.Open()
            try { $taskInput.CopyTo([System.IO.Stream]::Null) } finally { $taskInput.Dispose() }
        }
    } finally { $taskCheck.Dispose() }
    if ([System.IO.File]::Exists($taskDestination)) { [System.IO.File]::Replace($taskStaging, $taskDestination, [NullString]::Value) }
    else { [System.IO.File]::Move($taskStaging, $taskDestination) }
    Write-Output ('Packaged ' + $Name + ' (' + $Files.Count + ' files)')
}

$taskDist = Join-Path $taskRoot 'dist'
$taskInstallFiles = @('code.js','manifest.json','THIRD_PARTY_NOTICES.txt','ui.html') | ForEach-Object { Get-Item -LiteralPath (Join-Path $taskDist $_) }
New-TaskArchive -Name '印前助手_可直接导入.zip' -Files $taskInstallFiles -Base $taskDist

$taskSourceFiles = @()
foreach ($taskDirectory in @('src','assets','test','community')) {
    $taskSourceFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskDirectory) -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]' -and $_.Extension -notin @('.pyc','.zip') }
}
foreach ($taskFileName in @('README.md','GITHUB_UPLOAD.md','.gitignore','package.json','package-lock.json','tsconfig.json','build.mjs','package.ps1')) {
    $taskSourceFiles += Get-Item -LiteralPath (Join-Path $taskRoot $taskFileName)
}
New-TaskArchive -Name '印前助手_源码.zip' -Files $taskSourceFiles -Base $taskRoot
