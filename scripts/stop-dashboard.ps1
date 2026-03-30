Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $rootDir 'logs'
$stateFile = Join-Path $logsDir 'dashboard-processes.json'
$dashboardConfigFile = Join-Path $rootDir 'dashboard.config.json'
$dashboardConfig = Get-Content -Path $dashboardConfigFile -Raw | ConvertFrom-Json -ErrorAction Stop
$dashboardPorts = @([int]$dashboardConfig.ports.backend, [int]$dashboardConfig.ports.frontend)

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

function Stop-ProcessTree {
  param([int]$ProcessId)

  if (-not (Test-ProcessAlive -ProcessId $ProcessId)) {
    return $false
  }

  taskkill /PID $ProcessId /T /F | Out-Null
  return $true
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
$stoppedTargets = @()

if ($null -ne $state) {
  foreach ($target in @('server', 'client')) {
    $launcherPid = [int]$state.$target.launcherPid

    if (Stop-ProcessTree -ProcessId $launcherPid) {
      $stoppedTargets += "$target launcher ($launcherPid)"
    }
  }

  Remove-Item -Path $stateFile -Force -ErrorAction SilentlyContinue
}

$remainingPortPids = @(Get-ListeningTcpPids -Ports $dashboardPorts)
foreach ($processId in $remainingPortPids) {
  if (Stop-ProcessTree -ProcessId $processId) {
    $stoppedTargets += "port owner ($processId)"
  }
}

if (@($stoppedTargets).Count -eq 0) {
  Write-Host 'Dashboard is already stopped.'
  exit 0
}

Start-Sleep -Seconds 1

$stillListening = @(Get-ListeningTcpPids -Ports $dashboardPorts)
if ($stillListening.Count -gt 0) {
  Write-Warning "Some dashboard ports are still in use by PID(s): $($stillListening -join ', ')."
}
else {
  Write-Host 'Dashboard stopped.'
}

Write-Host "Stopped: $($stoppedTargets -join ', ')"
