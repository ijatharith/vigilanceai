# Loads KEY=VALUE lines from the git-ignored .env into this PowerShell session.
# Usage (note the leading dot):  . .\scripts\load-env.ps1
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { Write-Error ".env not found at $envFile"; return }

$names = @()
foreach ($line in Get-Content $envFile) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { continue }
    $name = $line.Substring(0, $i).Trim()
    $value = $line.Substring($i + 1).Trim()
    if ($value.Length -ge 2 -and $value[0] -eq $value[-1] -and $value[0] -in @('"', "'")) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
    $names += $name
}
Write-Host "Loaded $($names.Count) settings: $($names -join ', ')"
