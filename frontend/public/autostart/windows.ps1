# Office Ping: open automatically when you sign in to Windows.
#
#   Run:     right-click this file, then "Run with PowerShell"
#     or in PowerShell:   irm https://ping.tejgyan.org/autostart/windows.ps1 | iex
#   Undo:    run it again with -Remove, or delete "Office Ping" from the
#            Startup folder (Win+R, type  shell:startup , Enter).
#
# It adds a shortcut to your Startup folder that opens Office Ping in its own
# Chrome or Edge window (minimised) each time you sign in, and opens it now.
# Nothing is installed and no administrator rights are needed.

param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$url = if ($env:OFFICE_PING_URL) { $env:OFFICE_PING_URL.TrimEnd('/') } else { 'https://ping.tejgyan.org' }
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Office Ping.lnk'
$ranAsFile = [bool]$MyInvocation.MyCommand.Path

function Finish([string]$message) {
  Write-Host ''
  Write-Host $message
  if ($ranAsFile) { Read-Host 'Press Enter to close' | Out-Null }
}

if ($Remove) {
  Remove-Item -LiteralPath $link -ErrorAction SilentlyContinue
  Finish 'Done. Office Ping will no longer open when you sign in.'
  return
}

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $browser) {
  Finish 'Google Chrome or Microsoft Edge is needed. Install one of them, then run this again.'
  return
}

$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
$shortcut.TargetPath = $browser
$shortcut.Arguments = "--app=$url/dashboard"
$shortcut.WindowStyle = 7          # start minimised
$shortcut.Description = 'Office Ping'
$shortcut.Save()

Start-Process -FilePath $browser -ArgumentList "--app=$url/dashboard"
Finish ("Done. Office Ping will open by itself each time you sign in to Windows.`n" +
        "Keep its window open (minimise it, don't close it) so pings can reach you.")
