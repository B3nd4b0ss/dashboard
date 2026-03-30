Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $rootDir 'logs'
$stateFile = Join-Path $logsDir 'dashboard-processes.json'
$dashboardConfigFile = Join-Path $rootDir 'dashboard.config.json'
$runnerScript = Join-Path $PSScriptRoot 'run-hidden-dashboard-target.ps1'
$serverOutLog = Join-Path $logsDir 'server-dev.out.log'
$serverErrLog = Join-Path $logsDir 'server-dev.err.log'
$clientOutLog = Join-Path $logsDir 'client-dev.out.log'
$clientErrLog = Join-Path $logsDir 'client-dev.err.log'
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$npmCmdPath = (Get-Command npm.cmd -ErrorAction Stop).Path
$dashboardConfig = Get-Content -Path $dashboardConfigFile -Raw | ConvertFrom-Json -ErrorAction Stop
$backendPort = [int]$dashboardConfig.ports.backend
$frontendPort = [int]$dashboardConfig.ports.frontend
$dashboardPorts = @($backendPort, $frontendPort)

function Test-ProcessAlive {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return $false
  }

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    return -not $process.HasExited
  }
  catch {
    return $false
  }
}

function Get-DashboardState {
  if (-not (Test-Path $stateFile)) {
    return $null
  }

  try {
    return Get-Content -Path $stateFile -Raw | ConvertFrom-Json -ErrorAction Stop
  }
  catch {
    return $null
  }
}

function Save-DashboardState {
  param([hashtable]$State)

  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $stateFile -Encoding UTF8
}

function Get-ListeningTcpPids {
  param([int[]]$Ports)

  $pids = @()
  $netstatOutput = netstat -ano -p tcp

  foreach ($line in $netstatOutput) {
    if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+\S+\s+(\d+)\s*$') {
      $localPort = [int]$Matches[1]
      $processId = [int]$Matches[2]

      if (($Ports -contains $localPort) -and ($processId -gt 0) -and (-not ($pids -contains $processId))) {
        $pids += $processId
      }
    }
  }

  return $pids
}

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$existingState = Get-DashboardState
if ($null -ne $existingState) {
  $serverRunning = Test-ProcessAlive -ProcessId ([int]$existingState.server.launcherPid)
  $clientRunning = Test-ProcessAlive -ProcessId ([int]$existingState.client.launcherPid)

  if ($serverRunning -or $clientRunning) {
    Write-Host 'Dashboard is already running.'
    Write-Host "Server launcher PID: $($existingState.server.launcherPid)"
    Write-Host "Client launcher PID: $($existingState.client.launcherPid)"
    exit 0
  }

  Remove-Item -Path $stateFile -Force -ErrorAction SilentlyContinue
}

$occupiedPorts = @(Get-ListeningTcpPids -Ports $dashboardPorts)
if ($occupiedPorts.Count -gt 0) {
  Write-Error "Dashboard ports are already in use by PID(s): $($occupiedPorts -join ', '). Run npm run app:stop first, or free ports $backendPort and $frontendPort."
}

$serverProcess = Start-Process `
  -FilePath $powerShellExe `
  -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runnerScript, '-Target', 'server', '-NpmCmdPath', $npmCmdPath, '-OutLog', $serverOutLog, '-ErrLog', $serverErrLog) `
  -WorkingDirectory $rootDir `
  -WindowStyle Hidden `
  -PassThru

$clientProcess = Start-Process `
  -FilePath $powerShellExe `
  -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runnerScript, '-Target', 'client', '-NpmCmdPath', $npmCmdPath, '-OutLog', $clientOutLog, '-ErrLog', $clientErrLog) `
  -WorkingDirectory $rootDir `
  -WindowStyle Hidden `
  -PassThru

Save-DashboardState @{
  startedAt = (Get-Date).ToString('o')
  server = @{
    launcherPid = $serverProcess.Id
    port = $backendPort
    outLog = $serverOutLog
    errLog = $serverErrLog
  }
  client = @{
    launcherPid = $clientProcess.Id
    port = $frontendPort
    outLog = $clientOutLog
    errLog = $clientErrLog
  }
}

Start-Sleep -Seconds 3

$failedLaunchers = @()
if (-not (Test-ProcessAlive -ProcessId $serverProcess.Id)) {
  $failedLaunchers += 'server'
}
if (-not (Test-ProcessAlive -ProcessId $clientProcess.Id)) {
  $failedLaunchers += 'client'
}

if (@($failedLaunchers).Count -gt 0) {
  Remove-Item -Path $stateFile -Force -ErrorAction SilentlyContinue
  Write-Error "Dashboard failed to start cleanly for: $($failedLaunchers -join ', '). Check logs in $logsDir."
}

Write-Host 'Dashboard started in the background.'
Write-Host "Server: http://localhost:$backendPort"
Write-Host "Client: http://localhost:$frontendPort"
Write-Host "Logs: $logsDir"
