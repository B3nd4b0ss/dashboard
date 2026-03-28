Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $rootDir 'logs'
$stateFile = Join-Path $logsDir 'dashboard-processes.json'

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

$state = Get-DashboardState
$portPids = @(Get-ListeningTcpPids -Ports @(4000, 5173))

if ($null -eq $state) {
  if ($portPids.Count -gt 0) {
    Write-Host 'Dashboard appears to be running, but it is not managed by the launcher state file.'
    Write-Host "Port owner PID(s): $($portPids -join ', ')"
  }
  else {
    Write-Host 'Dashboard is stopped.'
  }

  exit 0
}

$serverAlive = Test-ProcessAlive -ProcessId ([int]$state.server.launcherPid)
$clientAlive = Test-ProcessAlive -ProcessId ([int]$state.client.launcherPid)
$overallStatus = if ($serverAlive -or $clientAlive) { 'running' } else { 'stopped' }

Write-Host "Dashboard status: $overallStatus"
Write-Host "Started at: $($state.startedAt)"
Write-Host "Server launcher PID: $($state.server.launcherPid) ($(if ($serverAlive) { 'alive' } else { 'not running' }))"
Write-Host "Client launcher PID: $($state.client.launcherPid) ($(if ($clientAlive) { 'alive' } else { 'not running' }))"

if ($portPids.Count -gt 0) {
  Write-Host "Listening PID(s) on dashboard ports: $($portPids -join ', ')"
}
