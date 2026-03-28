param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('server', 'client')]
  [string]$Target,
  [Parameter(Mandatory = $true)]
  [string]$NpmCmdPath,
  [Parameter(Mandatory = $true)]
  [string]$OutLog,
  [Parameter(Mandatory = $true)]
  [string]$ErrLog
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

$logDirectory = Split-Path -Parent $OutLog
if (-not (Test-Path $logDirectory)) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

switch ($Target) {
  'server' {
    & $NpmCmdPath run dev --prefix server 1>> $OutLog 2>> $ErrLog
  }
  'client' {
    & $NpmCmdPath run dev --prefix client 1>> $OutLog 2>> $ErrLog
  }
}

exit $LASTEXITCODE
