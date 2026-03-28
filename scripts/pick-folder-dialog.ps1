param(
  [string]$InitialPath = '',
  [string]$Title = 'Choose a folder'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = $null
$dialog = $null

try {
  $form = New-Object System.Windows.Forms.Form
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $form.Size = New-Object System.Drawing.Size(1, 1)
  $form.ShowInTaskbar = $false
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $form.TopMost = $true
  $form.Opacity = 0.01
  $form.Text = ''

  [void]$form.Show()
  [void]$form.Activate()
  [System.Windows.Forms.Application]::DoEvents()

  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = if ([string]::IsNullOrWhiteSpace($Title)) {
    'Choose a folder'
  }
  else {
    $Title
  }
  $dialog.ShowNewFolderButton = $true

  if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and [System.IO.Directory]::Exists($InitialPath)) {
    $dialog.SelectedPath = $InitialPath
  }

  $result = $dialog.ShowDialog($form)

  if (
    $result -eq [System.Windows.Forms.DialogResult]::OK -and
    -not [string]::IsNullOrWhiteSpace($dialog.SelectedPath)
  ) {
    [PSCustomObject]@{
      canceled = $false
      path = $dialog.SelectedPath
    } | ConvertTo-Json -Compress
  }
  else {
    [PSCustomObject]@{
      canceled = $true
      path = $null
    } | ConvertTo-Json -Compress
  }
}
finally {
  if ($dialog -ne $null) {
    $dialog.Dispose()
  }

  if ($form -ne $null) {
    $form.Close()
    $form.Dispose()
  }
}
