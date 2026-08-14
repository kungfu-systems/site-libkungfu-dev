$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $RepoRoot 'dist\install.ps1'
$global:InstallerTestCatalogPath = Join-Path $RepoRoot 'src\install\installer-catalog.json'
$TestRoot = Join-Path $env:RUNNER_TEMP "libkungfu-installer-windows-$([Guid]::NewGuid().ToString('N'))"

$Tokens = $null
$ParseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($Installer, [ref]$Tokens, [ref]$ParseErrors) | Out-Null
if ($ParseErrors.Count -ne 0) {
  throw "PowerShell parser rejected install.ps1: $($ParseErrors | ForEach-Object Message | Out-String)"
}

function global:Invoke-WebRequest {
  param(
    [switch]$UseBasicParsing,
    [Parameter(Mandatory = $true)]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile
  )
  if ([string]$Uri -like 'https://libkungfu.dev/install/v1/catalog/*') {
    Copy-Item -LiteralPath $global:InstallerTestCatalogPath -Destination $OutFile
    return
  }
  Microsoft.PowerShell.Utility\Invoke-WebRequest -UseBasicParsing:$UseBasicParsing -Uri $Uri -OutFile $OutFile
}

try {
  New-Item -ItemType Directory -Path $TestRoot | Out-Null

  $DefaultPlan = (& $Installer -DryRun -InstallDir (Join-Path $TestRoot 'default-install') -BinDir (Join-Path $TestRoot 'default-bin') 6>&1 | Out-String)
  if ($DefaultPlan -notmatch 'plan: kungfu 4\.0\.0-alpha\.1 .* windows-x64') {
    throw "no-argument PowerShell execution did not default to Kungfu: $DefaultPlan"
  }

  $AllPlan = (& $Installer all -DryRun -InstallDir (Join-Path $TestRoot 'all-install') -BinDir (Join-Path $TestRoot 'all-bin') 6>&1 | Out-String)
  foreach ($Product in @('kfd', 'buildchain', 'kungfu', 'agent-hub-demo')) {
    if ($AllPlan -notmatch "plan: $Product ") { throw "all-products preflight omitted $Product" }
  }

  $InstallRoot = Join-Path $TestRoot 'product'
  $BinDir = Join-Path $TestRoot 'bin'
  & $Installer kfd -Version '1.0.0-alpha.63' -InstallDir $InstallRoot -BinDir $BinDir
  $Historical = (& (Join-Path $BinDir 'kfd.cmd') --version | Out-String)
  if ($Historical -notmatch '1\.0\.0-alpha\.63') { throw "historical KFD install returned: $Historical" }

  & $Installer kfd -Version '1.0.0-alpha.65' -InstallDir $InstallRoot -BinDir $BinDir
  $Current = (& (Join-Path $BinDir 'kfd.cmd') --version | Out-String)
  if ($Current -notmatch '1\.0\.0-alpha\.65') { throw "current KFD install returned: $Current" }

  & $Installer kfd -Rollback -InstallDir $InstallRoot -BinDir $BinDir
  $Restored = (& (Join-Path $BinDir 'kfd.cmd') --version | Out-String)
  if ($Restored -notmatch '1\.0\.0-alpha\.63') { throw "KFD rollback returned: $Restored" }

  $ConflictBin = Join-Path $TestRoot 'conflict-bin'
  New-Item -ItemType Directory -Path $ConflictBin | Out-Null
  Set-Content -LiteralPath (Join-Path $ConflictBin 'kfd.cmd') -Value '@echo user-owned' -Encoding Ascii
  try {
    & $Installer kfd -DryRun -InstallDir (Join-Path $TestRoot 'conflict-install') -BinDir $ConflictBin
    throw 'a user-owned launcher was overwritten or accepted'
  } catch {
    if ($_.Exception.Message -notmatch 'ownership-conflict') { throw }
  }

  Write-Host 'test-installer-windows: parser, default Kungfu, all-products preflight, KFD historical/current/rollback, and ownership checks passed'
} finally {
  Remove-Item Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
  Remove-Variable InstallerTestCatalogPath -Scope Global -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $TestRoot
}
